"""Structural edits of the working model: reactions, metabolites and compartments.

Edits are a reversible layer on top of the imported file, like the metabolite curation:

- An edit is a *transaction* of primitive operations
  ``{"type": "reaction" | "metabolite" | "compartment", "before": snapshot | None, "after": snapshot | None}``.
  ``before = None`` adds the entity, ``after = None`` removes it, both = update (the id may change: rename).
- The inverse of a transaction is the reversed list with before/after swapped, so undo and redo never
  copy the model (copying a genome-scale model takes seconds).
- A transaction is validated first (pure checks on the model plus the transaction's own additions),
  then applied to the real ``cobra.Model`` used by every simulation. If applying fails midway, the
  operations already done are reverted; if even that fails, the model is rebuilt from the file and the
  log. An invalid edit never leaves the model half-modified.
- The log is saved per model (``<cache>/<id>.edits.json``), re-applied when the model is loaded again
  and exported as a model patch (``model_patch.json``): the transactions, plus the net list of
  reactions / metabolites added, removed and changed.

Validation separates errors (the edit is refused) from warnings (shown, never blocking): an
unbalanced reaction is a warning, because biomass, pseudo-reactions and boundaries are unbalanced by
design.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import time
import uuid
from typing import Any, Optional

import cobra

from .. import registry
from ..errors import ScienceError, bound_in, num
from . import model_service as ms

SID = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SBO = {"exchange": "SBO:0000627", "demand": "SBO:0000628", "sink": "SBO:0000632"}
# identifiers compared for duplicate detection (annotation keys, lower-case)
XREF_KEYS = ("metanetx.chemical", "kegg.compound", "chebi", "bigg.metabolite", "seed.compound", "inchikey",
             "metacyc.compound", "hmdb")
RXN_XREF_KEYS = ("metanetx.reaction", "rhea", "kegg.reaction", "bigg.reaction", "seed.reaction", "metacyc.reaction")


# ----------------------------------------------------------------------------- snapshots

def _ann_in(a: Any) -> dict:
    out = {}
    for k, v in (a or {}).items():
        if isinstance(v, (list, tuple)):
            vals = [str(x).strip() for x in v if str(x).strip()]
            if vals:
                out[str(k)] = vals if len(vals) > 1 else vals[0]
        elif v not in (None, ""):
            out[str(k)] = str(v).strip()
    return out


def snap_reaction(model: cobra.Model, r: cobra.Reaction) -> dict:
    obj = ms.objective_coefficients(model)
    return {
        "id": r.id, "name": r.name or "", "lb": num(r.lower_bound), "ub": num(r.upper_bound),
        "subsystem": r.subsystem or "", "gpr": r.gene_reaction_rule or "",
        "metabolites": {m.id: float(c) for m, c in r.metabolites.items()},
        "annotation": _ann_in(r.annotation), "notes": ms._notes(r.notes),
        "objective": float(obj.get(r.id, 0.0)),
    }


def snap_metabolite(m: cobra.Metabolite) -> dict:
    return {
        "id": m.id, "name": m.name or "", "compartment": m.compartment or "",
        "formula": m.formula or "", "charge": m.charge if isinstance(m.charge, (int, float)) else None,
        "annotation": _ann_in(m.annotation), "notes": ms._notes(m.notes),
    }


known_compartments = ms.known_compartments


# ----------------------------------------------------------------------------- normalizing requests

def _f(x, what: str, errors: list) -> Optional[float]:
    if x is None or x == "":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        errors.append(f"{what}: “{x}” is not a number")
        return None
    if math.isnan(v):
        errors.append(f"{what} is NaN")
        return None
    return v if math.isfinite(v) else None  # ±∞ = unbounded


def norm_reaction(d: dict, errors: list) -> dict:
    mets = {}
    for k, c in (d.get("metabolites") or {}).items():
        try:
            v = float(c)
        except (TypeError, ValueError):
            errors.append(f"coefficient of {k}: “{c}” is not a number")
            continue
        if not math.isfinite(v):
            errors.append(f"coefficient of {k} must be a finite number")
        elif v == 0:
            errors.append(f"coefficient of {k} is 0 (remove the metabolite instead)")
        else:
            mets[str(k).strip()] = v
    obj = _f(d.get("objective"), "objective coefficient", errors) or 0.0
    return {
        "id": str(d.get("id") or "").strip(), "name": str(d.get("name") or "").strip(),
        "lb": _f(d.get("lb"), "lower bound", errors), "ub": _f(d.get("ub"), "upper bound", errors),
        "subsystem": str(d.get("subsystem") or "").strip(), "gpr": " ".join(str(d.get("gpr") or "").split()),
        "metabolites": mets, "annotation": _ann_in(d.get("annotation")), "notes": ms._notes(d.get("notes")),
        "objective": obj,
    }


def norm_metabolite(d: dict, errors: list) -> dict:
    charge = d.get("charge")
    if charge in ("", None):
        charge = None
    else:
        try:
            charge = float(charge)
            if not math.isfinite(charge):
                errors.append("charge must be a finite number")
                charge = None
            elif charge == int(charge):
                charge = int(charge)
        except (TypeError, ValueError):
            errors.append(f"charge: “{d.get('charge')}” is not a number")
            charge = None
    return {
        "id": str(d.get("id") or "").strip(), "name": str(d.get("name") or "").strip(),
        "compartment": str(d.get("compartment") or "").strip(), "formula": str(d.get("formula") or "").strip(),
        "charge": charge, "annotation": _ann_in(d.get("annotation")), "notes": ms._notes(d.get("notes")),
    }


# ----------------------------------------------------------------------------- GPR & formulas

_GPR_TOKEN = re.compile(r"\s*(\(|\)|[^\s()]+)")


def gpr_error(rule: str) -> Optional[str]:
    """Syntax check of a gene-reaction rule: gene ids combined with and / or and parentheses."""
    if not rule.strip():
        return None
    toks = [t.lower() if t.lower() in ("and", "or") else t for t in _GPR_TOKEN.findall(rule)]
    toks = ["and" if t == "&" else "or" if t == "|" else t for t in toks]
    pos = 0

    def expr():
        nonlocal pos
        term()
        while pos < len(toks) and toks[pos] in ("and", "or"):
            pos += 1
            term()

    def term():
        nonlocal pos
        if pos >= len(toks):
            raise ValueError("the rule ends where a gene or “(” was expected")
        t = toks[pos]
        if t == "(":
            pos += 1
            expr()
            if pos >= len(toks) or toks[pos] != ")":
                raise ValueError("a “(” is not closed")
            pos += 1
        elif t in (")", "and", "or"):
            raise ValueError(f"unexpected “{t}” where a gene was expected")
        else:
            pos += 1

    try:
        expr()
        if pos != len(toks):
            raise ValueError(f"unexpected “{toks[pos]}”")
    except ValueError as e:
        return str(e)
    return None


_ELEM = re.compile(r"([A-Z][a-z]?)(\d*\.?\d*)")


def parse_formula(f: str) -> Optional[dict[str, float]]:
    """Element counts of a flat formula (C6H12O6, C10H12N5O13P3, R groups count as 'R'); None if unparsable."""
    f = (f or "").strip()
    if not f:
        return None
    pos, out = 0, {}
    for m in _ELEM.finditer(f):
        if m.start() != pos:
            return None
        n = float(m.group(2)) if m.group(2) else 1.0
        out[m.group(1)] = out.get(m.group(1), 0.0) + n
        pos = m.end()
    return out if pos == len(f) else None


def balance(mets: dict[str, float], info: dict[str, dict]) -> dict:
    """Mass and charge balance of a stoichiometry, from the metabolites' formulas and charges."""
    missing_f = [m for m in mets if parse_formula(info.get(m, {}).get("formula") or "") is None]
    missing_c = [m for m in mets if info.get(m, {}).get("charge") is None]
    mass = charge = None
    if not missing_f:
        acc: dict[str, float] = {}
        for m, c in mets.items():
            for el, n in parse_formula(info[m]["formula"]).items():
                acc[el] = acc.get(el, 0.0) + c * n
        mass = {k: round(v, 6) for k, v in sorted(acc.items()) if abs(v) > 1e-6}
    if not missing_c:
        charge = round(sum(c * float(info[m]["charge"]) for m, c in mets.items()), 6)
    return {"mass": mass, "charge": charge, "missingFormula": missing_f, "missingCharge": missing_c}


# ----------------------------------------------------------------------------- virtual view (validation)

class View:
    """The model as it will be after the operations seen so far — without modifying it."""

    def __init__(self, model: cobra.Model):
        self.model = model
        self.rxn: dict[str, Optional[dict]] = {}
        self.met: dict[str, Optional[dict]] = {}
        self.comp: dict[str, Optional[str]] = {}
        self._known_comp = known_compartments(model)

    def has_rxn(self, i: str) -> bool:
        return self.rxn[i] is not None if i in self.rxn else i in self.model.reactions

    def get_met(self, i: str) -> Optional[dict]:
        if i in self.met:
            return self.met[i]
        return snap_metabolite(self.model.metabolites.get_by_id(i)) if i in self.model.metabolites else None

    def has_comp(self, c: str) -> bool:
        return self.comp[c] is not None if c in self.comp else c in self._known_comp

    def met_reactions(self, i: str) -> list[str]:
        """Reactions using metabolite i in the view."""
        out = set()
        if i in self.model.metabolites:
            out = {r.id for r in self.model.metabolites.get_by_id(i).reactions}
        for rid, r in self.rxn.items():
            if r is None or i not in r["metabolites"]:
                out.discard(rid)
            if r is not None and i in r["metabolites"]:
                out.add(r["id"])
        return sorted(x for x in out if self.has_rxn(x))


def _xrefs(ann: dict, keys=XREF_KEYS) -> set[tuple[str, str]]:
    out = set()
    for k, v in (ann or {}).items():
        kk = str(k).lower()
        if kk in keys:
            for x in (v if isinstance(v, (list, tuple)) else [v]):
                x = str(x).strip()
                x = x.upper().replace("CHEBI:", "") if kk == "chebi" else x
                out.add((kk, x.lower()))
    return out


def _compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def duplicate_metabolites(model: cobra.Model, m: dict, exclude: Optional[str]) -> list[dict]:
    """Existing metabolites that may be the same compound: shared identifiers or the same name."""
    xs, name = _xrefs(m["annotation"]), _compact(m["name"])
    out = []
    for x in model.metabolites:
        if x.id == exclude:
            continue
        shared = xs & _xrefs(_ann_in(x.annotation))
        same_name = bool(name) and _compact(x.name) == name
        if not shared and not same_name:
            continue
        reasons = [f"{k} {v}" for k, v in sorted(shared)][:3] + (["same name"] if same_name else [])
        if m["formula"] and x.formula and m["formula"] == x.formula and shared:
            reasons.append("same formula")
        out.append({"id": x.id, "name": x.name or "", "compartment": x.compartment or "",
                    "sameCompartment": x.compartment == m["compartment"], "reasons": reasons})
    out.sort(key=lambda d: (not d["sameCompartment"], d["id"]))
    return out[:12]


def duplicate_reactions(model: cobra.Model, r: dict, exclude: Optional[str]) -> list[dict]:
    """Reactions with the same participants and proportional coefficients (either direction), or a shared identifier."""
    mets = r["metabolites"]
    out = []
    if mets:
        first = next(iter(mets))
        cand = model.metabolites.get_by_id(first).reactions if first in model.metabolites else []
        for x in cand:
            if x.id == exclude or len(x.metabolites) != len(mets):
                continue
            st = {m.id: c for m, c in x.metabolites.items()}
            if set(st) != set(mets):
                continue
            ratio = st[first] / mets[first]
            if all(abs(st[k] - ratio * v) <= 1e-9 * max(1.0, abs(st[k])) for k, v in mets.items()):
                out.append({"id": x.id, "name": x.name or "", "reason": "same participants and coefficients" if ratio > 0 else "same participants, written in the opposite direction",
                            "scaled": abs(abs(ratio) - 1) > 1e-9})
    xs = _xrefs(r["annotation"], RXN_XREF_KEYS)
    if xs:
        for x in model.reactions:
            if x.id == exclude or any(d["id"] == x.id for d in out):
                continue
            shared = xs & _xrefs(_ann_in(x.annotation), RXN_XREF_KEYS)
            if shared:
                k, v = sorted(shared)[0]
                out.append({"id": x.id, "name": x.name or "", "reason": f"same {k} {v}", "scaled": False})
    return out[:10]


def boundary_kind(r: dict) -> Optional[str]:
    if len(r["metabolites"]) != 1:
        return None
    sbo = str(r["annotation"].get("sbo") or "")
    for k, v in SBO.items():
        if sbo == v:
            return k
    rid = r["id"].upper()
    if rid.startswith(("DM_", "R_DM_")):
        return "demand"
    if rid.startswith(("SK_", "SINK_", "R_SK_")):
        return "sink"
    if rid.startswith(("EX_", "R_EX_")):
        return "exchange"
    return None  # a one-sided draft is not assumed to be a boundary reaction


def _check_reaction(v: View, before: Optional[dict], r: dict, errors: list, warnings: list, info: list) -> dict:
    rid = r["id"]
    if not rid:
        errors.append("Reaction ID is required")
    elif re.search(r"\s", rid):
        errors.append(f"Reaction ID “{rid}” contains spaces")
    elif (not before or before["id"] != rid) and v.has_rxn(rid):
        errors.append(f"Reaction ID “{rid}” is already used by another reaction")
    elif not SID.match(rid):
        warnings.append(f"“{rid}” is not a valid SBML identifier; SBML export escapes the special characters")
    if not r["metabolites"]:
        errors.append("The reaction has no metabolites")
    unknown = [m for m in r["metabolites"] if v.get_met(m) is None]
    if unknown:
        errors.append("Unknown metabolite" + ("s" if len(unknown) > 1 else "") + ": " + ", ".join(unknown[:8])
                      + " — add it to the model first (search a database or create it)")
    lo, hi = bound_in(r["lb"], "lower"), bound_in(r["ub"], "upper")
    if lo > hi:
        errors.append(f"Lower bound {lo:g} is greater than the upper bound {hi:g}")
    elif lo == 0 and hi == 0:
        warnings.append("Bounds 0 / 0: the reaction is blocked")
    if r["lb"] is None or r["ub"] is None:
        info.append("An empty bound means unbounded (±∞); most models use ±1000 instead")
    g = gpr_error(r["gpr"])
    if g:
        errors.append(f"Gene rule: {g}")
    kind = boundary_kind(r)
    react = [m for m, c in r["metabolites"].items() if c < 0]
    prod = [m for m, c in r["metabolites"].items() if c > 0]
    if r["metabolites"] and (not react or not prod) and not kind:
        warnings.append("Only " + ("products" if not react else "reactants") + ": the reaction creates or removes matter (boundary-like)")
    mets = {m: v.get_met(m) or {} for m in r["metabolites"]}
    comps = sorted({x.get("compartment") for x in mets.values() if x.get("compartment")})
    if kind == "exchange" and comps and v.model.metabolites and comps[0] not in _external(v.model):
        warnings.append(f"Exchange of a metabolite in “{comps[0]}”: exchange reactions are normally associated with extracellular metabolites")
    bal = balance(r["metabolites"], mets) if not unknown else {"mass": None, "charge": None, "missingFormula": [], "missingCharge": []}
    if not kind and not unknown:
        if bal["mass"]:
            warnings.append("Mass balance: unbalanced (" + ", ".join(f"{k} {'+' if x > 0 else ''}{x:g}" for k, x in bal["mass"].items()) + ")")
        if bal["charge"] not in (None, 0):
            warnings.append(f"Charge balance: imbalance of {bal['charge']:+g}")
    dups = duplicate_reactions(v.model, r, before["id"] if before else None) if not unknown else []
    for d in dups:
        warnings.append(f"Potential duplicate reaction: {d['id']} ({d['reason']})")
    return {"kind": kind, "balance": bal, "duplicates": dups, "compartments": comps}


def _external(model: cobra.Model) -> set[str]:
    try:
        from cobra.medium import find_external_compartment
        return {find_external_compartment(model)}
    except Exception:  # noqa: BLE001
        return {"e", "e0", "ext", "extracellular", "C_e"}


def _check_metabolite(v: View, before: Optional[dict], m: dict, errors: list, warnings: list, info: list) -> dict:
    mid = m["id"]
    if not mid:
        errors.append("Metabolite ID is required")
    elif re.search(r"\s", mid):
        errors.append(f"Metabolite ID “{mid}” contains spaces")
    elif (not before or before["id"] != mid) and v.get_met(mid) is not None:
        errors.append(f"Metabolite ID “{mid}” is already used")
    elif not SID.match(mid):
        warnings.append(f"“{mid}” is not a valid SBML identifier; SBML export escapes the special characters")
    if not m["name"]:
        errors.append("Metabolite name is required")
    if not m["compartment"]:
        errors.append("Compartment is required")
    elif not v.has_comp(m["compartment"]):
        errors.append(f"Unknown compartment “{m['compartment']}” — create it explicitly first")
    if m["formula"] and parse_formula(m["formula"]) is None:
        warnings.append(f"Formula “{m['formula']}” could not be parsed (use element symbols and counts, e.g. C6H12O6)")
    if not m["formula"] or m["charge"] is None:
        warnings.append("Mass/charge balance cannot be fully evaluated without formula and charge")
    if isinstance(m["charge"], float):
        warnings.append(f"Charge {m['charge']:g} is not an integer")
    if before and before["id"] != mid:
        n = len(v.met_reactions(before["id"]))
        if n:
            info.append(f"Renaming: the {n} reaction{'s' if n > 1 else ''} using {before['id']} keep pointing to it under the new ID")
    if before and before["compartment"] != m["compartment"]:
        warnings.append(f"Moving {before['id']} from “{before['compartment']}” to “{m['compartment']}” changes the compartment in every reaction that uses it")
    dups = duplicate_metabolites(v.model, m, before["id"] if before else None)
    for d in dups:
        if d["sameCompartment"]:
            warnings.append(f"Possible existing metabolite detected: {d['id']} ({', '.join(d['reasons'])})")
    return {"duplicates": dups}


# ----------------------------------------------------------------------------- building transactions

def build(entry: registry.ModelEntry, ops: list[dict]) -> tuple[list[dict], dict]:
    """Request operations -> primitive operations + validation report (never modifies the model)."""
    model = entry.model
    v = View(model)
    prims: list[dict] = []
    report = {"errors": [], "warnings": [], "info": [], "items": []}

    def item(i, label, errors, warnings, info, extra=None):
        report["items"].append({"op": i, "label": label, "errors": errors, "warnings": warnings, "info": info, **(extra or {})})
        report["errors"] += [f"{label}: {e}" for e in errors]
        report["warnings"] += [f"{label}: {w}" for w in warnings]
        report["info"] += [f"{label}: {x}" for x in info]

    for i, op in enumerate(ops):
        kind = op.get("op")
        errors: list[str] = []
        warnings: list[str] = []
        info: list[str] = []
        if kind == "add_compartment":
            cid, name = str(op.get("id") or "").strip(), str(op.get("name") or "").strip()
            if not cid or re.search(r"\s", cid):
                errors.append("Compartment ID is required, without spaces")
            elif v.has_comp(cid):
                errors.append(f"Compartment “{cid}” already exists")
            if not errors:
                v.comp[cid] = name or cid
                prims.append({"type": "compartment", "before": None, "after": {"id": cid, "name": name or cid}})
            item(i, f"Compartment {cid}", errors, warnings, info)
        elif kind == "put_metabolite":
            orig = op.get("id")
            before = v.get_met(orig) if orig else None
            if orig and before is None:
                errors.append(f"Metabolite {orig} does not exist")
            m = norm_metabolite(op.get("metabolite") or {}, errors)
            if before and "notes" not in (op.get("metabolite") or {}):
                m["notes"] = before["notes"]  # the UI catalog carries no notes: keep them
            extra = _check_metabolite(v, before, m, errors, warnings, info) if not (orig and before is None) else {}
            if not errors:
                if before and before["id"] != m["id"]:
                    v.met[before["id"]] = None
                v.met[m["id"]] = m
                if before != m:
                    prims.append({"type": "metabolite", "before": before, "after": m})
            item(i, f"Metabolite {m['id'] or '(new)'}", errors, warnings, info, extra)
        elif kind == "put_reaction":
            orig = op.get("id")
            before = None
            if orig:
                if orig in v.rxn:
                    before = v.rxn[orig]
                elif orig in model.reactions:
                    before = snap_reaction(model, model.reactions.get_by_id(orig))
                if before is None:
                    errors.append(f"Reaction {orig} does not exist")
            r = norm_reaction(op.get("reaction") or {}, errors)
            if before and "notes" not in (op.get("reaction") or {}):
                r["notes"] = before["notes"]  # the UI catalog carries no notes: keep them
            extra = _check_reaction(v, before, r, errors, warnings, info)
            if not errors:
                if before and before["id"] != r["id"]:
                    v.rxn[before["id"]] = None
                v.rxn[r["id"]] = r
                if before != r:
                    prims.append({"type": "reaction", "before": before, "after": r})
            item(i, f"Reaction {r['id'] or '(new)'}", errors, warnings, info, extra)
        elif kind == "delete_reaction":
            rid = str(op.get("id") or "")
            before = v.rxn.get(rid) if rid in v.rxn else (snap_reaction(model, model.reactions.get_by_id(rid)) if rid in model.reactions else None)
            if before is None:
                errors.append(f"Reaction {rid} does not exist")
            else:
                v.rxn[rid] = None
                prims.append({"type": "reaction", "before": before, "after": None})
            item(i, f"Delete reaction {rid}", errors, warnings, info)
        elif kind == "delete_metabolite":
            mid = str(op.get("id") or "")
            before = v.get_met(mid)
            if before is None:
                errors.append(f"Metabolite {mid} does not exist")
            else:
                users = v.met_reactions(mid)
                if users and not op.get("cascade"):
                    errors.append(f"This metabolite participates in {len(users)} reaction{'s' if len(users) > 1 else ''}: "
                                  + ", ".join(users[:8]) + ("…" if len(users) > 8 else ""))
                elif users:
                    for rid in users:
                        rb = v.rxn.get(rid) if rid in v.rxn else snap_reaction(model, model.reactions.get_by_id(rid))
                        v.rxn[rid] = None
                        prims.append({"type": "reaction", "before": rb, "after": None})
                    warnings.append(f"Also deletes {len(users)} reaction{'s' if len(users) > 1 else ''}: " + ", ".join(users[:8]))
                if not errors:
                    v.met[mid] = None
                    prims.append({"type": "metabolite", "before": before, "after": None})
            item(i, f"Delete metabolite {mid}", errors, warnings, info)
        else:
            item(i, f"Operation {i + 1}", [f"unknown operation “{kind}”"], [], [])
    if not prims and not report["errors"]:
        report["info"].append("No change")
    return prims, report


# ----------------------------------------------------------------------------- applying primitives

def _met(model: cobra.Model, i: str) -> cobra.Metabolite:
    return model.metabolites.get_by_id(i)


def _set_reaction(model: cobra.Model, r: cobra.Reaction, s: dict) -> None:
    r.name = s["name"]
    r.subsystem = s["subsystem"]
    r.bounds = (bound_in(s["lb"], "lower"), bound_in(s["ub"], "upper"))
    cur = {m.id: c for m, c in r.metabolites.items()}
    if cur != s["metabolites"]:
        r.add_metabolites({m: -c for m, c in r.metabolites.items()})  # combine=True: removes them
        r.add_metabolites({_met(model, k): c for k, c in s["metabolites"].items()})
    if (r.gene_reaction_rule or "") != s["gpr"]:
        r.gene_reaction_rule = s["gpr"]
    r.annotation = dict(s["annotation"])
    r.notes = dict(s["notes"])
    if abs(ms.objective_coefficients(model).get(r.id, 0.0) - s["objective"]) > 0:
        r.objective_coefficient = s["objective"]


def _apply(entry: registry.ModelEntry, p: dict) -> None:
    model = entry.model
    t, b, a = p["type"], p["before"], p["after"]
    if t == "compartment":
        if a:
            model.compartments = {a["id"]: a["name"]}
        else:
            getattr(model, "_compartments", {}).pop(b["id"], None)
    elif t == "metabolite":
        if b is None:
            m = cobra.Metabolite(a["id"], formula=a["formula"] or None, name=a["name"], charge=a["charge"], compartment=a["compartment"])
            m.annotation = dict(a["annotation"])
            m.notes = dict(a["notes"])
            model.add_metabolites([m])
        elif a is None:
            m = _met(model, b["id"])
            if m.reactions:
                raise ValueError(f"metabolite {b['id']} is still used by reactions")
            model.remove_metabolites([m])
        else:
            m = _met(model, b["id"])
            if b["id"] != a["id"]:
                m.id = a["id"]
            m.name, m.formula, m.charge, m.compartment = a["name"], a["formula"] or None, a["charge"], a["compartment"]
            m.annotation = dict(a["annotation"])
            m.notes = dict(a["notes"])
    elif t == "reaction":
        if b is None:
            r = cobra.Reaction(a["id"])
            model.add_reactions([r])
            _set_reaction(model, r, a)
        elif a is None:
            r = model.reactions.get_by_id(b["id"])
            genes = list(r.genes)
            model.remove_reactions([r], remove_orphans=False)
            _drop_new_orphan_genes(entry, genes)
        else:
            r = model.reactions.get_by_id(b["id"])
            if b["id"] != a["id"]:
                r.id = a["id"]
            genes = list(r.genes)
            _set_reaction(model, r, a)
            _drop_new_orphan_genes(entry, genes)
    else:
        raise ValueError(f"unknown operation type {t}")


def _drop_new_orphan_genes(entry: registry.ModelEntry, genes: list) -> None:
    """Genes created by an edit (not in the file) that no reaction uses any more."""
    base = getattr(entry, "base_genes", None) or set()
    for g in genes:
        if not g.reactions and g.id not in base and g.id in entry.model.genes:
            entry.model.genes.remove(g)


def inverse(prims: list[dict]) -> list[dict]:
    return [{"type": p["type"], "before": p["after"], "after": p["before"]} for p in reversed(prims)]


def _run(entry: registry.ModelEntry, prims: list[dict]) -> None:
    """Apply primitives; on failure revert the completed ones (or rebuild) and re-raise."""
    done: list[dict] = []
    try:
        for p in prims:
            _apply(entry, p)
            done.append(p)
    except Exception as e:
        try:
            for p in inverse(done):
                _apply(entry, p)
        except Exception:  # noqa: BLE001 - last resort: file + log
            rebuild(entry)
        raise ScienceError("The edit could not be applied", f"{type(e).__name__}: {e}. The model was left unchanged.", status=422) from e


# ----------------------------------------------------------------------------- log, persistence, refresh

def _empty_log() -> dict:
    return {"version": 1, "applied": [], "undone": [], "exported": ""}


def log_of(entry: registry.ModelEntry) -> dict:
    if getattr(entry, "edits", None) is None:
        entry.edits = _empty_log()
    return entry.edits


def _save(entry: registry.ModelEntry) -> None:
    from .annotation_service import save_json
    save_json(entry.id, "edits", log_of(entry))


def log_hash(log: dict) -> str:
    if not log["applied"]:
        return ""
    return hashlib.sha256(json.dumps([t["ops"] for t in log["applied"]], sort_keys=True).encode()).hexdigest()[:12]


def refresh(entry: registry.ModelEntry) -> dict:
    """After a structural change: new 'model file' baseline, catalog and search index. Returns the old catalog."""
    old = entry.catalog
    ms.set_baseline(entry)
    entry.search = None  # rebuilt on the next backend search
    entry.catalog = ms.build_catalog(entry)
    return old


def delta(old: Optional[dict], new: dict) -> dict:
    out: dict[str, Any] = {}
    for key in ("reactions", "metabolites", "genes"):
        a = {x["id"]: x for x in (old or {}).get(key, [])}
        b = {x["id"]: x for x in new[key]}
        out[key] = {"upsert": [x for i, x in b.items() if a.get(i) != x], "remove": [i for i in a if i not in b]}
    for key in ("summary", "compartments", "warnings", "medium"):
        out[key] = new[key]
    return out


def _describe(p: dict) -> list[str]:
    t, b, a = p["type"], p["before"], p["after"]
    if t == "compartment":
        return [f"Added compartment {a['id']} ({a['name']})" if a else f"Removed compartment {b['id']}"]
    if a is None:
        return [f"Removed {t} {b['id']}"]
    if b is None:
        if t == "reaction":
            return [f"Added reaction {a['id']}: {_eq(a)}"]
        return [f"Added metabolite {a['id']} ({a['name']}, {a['compartment']})"]
    out = []
    if b["id"] != a["id"]:
        out.append(f"Renamed {t} {b['id']} → {a['id']}")
    rid = a["id"]
    if t == "reaction":
        fb = lambda x, s: "−∞" if x is None and s == "l" else "∞" if x is None else f"{x:g}"  # noqa: E731
        if b["lb"] != a["lb"]:
            out.append(f"Changed {rid} lower bound: {fb(b['lb'], 'l')} → {fb(a['lb'], 'l')}")
        if b["ub"] != a["ub"]:
            out.append(f"Changed {rid} upper bound: {fb(b['ub'], 'u')} → {fb(a['ub'], 'u')}")
        if b["metabolites"] != a["metabolites"]:
            out.append(f"Changed {rid} equation: {_eq(b)}  ⟶  {_eq(a)}")
        for k, lbl in (("name", "name"), ("subsystem", "subsystem"), ("gpr", "gene rule")):
            if b[k] != a[k]:
                out.append(f"Changed {rid} {lbl}: “{b[k]}” → “{a[k]}”")
        if b["objective"] != a["objective"]:
            out.append(f"Changed {rid} objective coefficient: {b['objective']:g} → {a['objective']:g}")
    else:
        for k in ("name", "compartment", "formula", "charge"):
            if b[k] != a[k]:
                out.append(f"Changed {rid} {k}: “{b[k] if b[k] is not None else ''}” → “{a[k] if a[k] is not None else ''}”")
    if b["annotation"] != a["annotation"]:
        out.append(f"Changed {rid} annotations")
    if b["notes"] != a["notes"]:
        out.append(f"Changed {rid} notes")
    return out or [f"Updated {t} {rid}"]


def _eq(r: dict) -> str:
    def side(sign):
        parts = [(f"{abs(c):g} " if abs(c) != 1 else "") + m for m, c in r["metabolites"].items() if (c > 0) == (sign > 0)]
        return " + ".join(parts)
    lo, hi = bound_in(r["lb"], "lower"), bound_in(r["ub"], "upper")
    arrow = "<=>" if lo < 0 < hi else "<--" if hi <= 0 and lo < 0 else "-->"
    return f"{side(-1)} {arrow} {side(1)}".strip()


def history(entry: registry.ModelEntry) -> dict:
    log = log_of(entry)
    h = log_hash(log)
    return {
        "count": len(log["applied"]), "hash": h, "dirty": h != log.get("exported", ""),
        "items": [{"id": t["id"], "time": t["time"], "label": t["label"], "details": t.get("details", [])} for t in log["applied"]],
        "redo": [{"id": t["id"], "time": t["time"], "label": t["label"]} for t in reversed(log["undone"])],
        "loadErrors": getattr(entry, "edit_errors", []),
    }


def _label(prims: list[dict], given: Optional[str]) -> str:
    if given:
        return given
    lines = [d for p in prims for d in _describe(p)]
    return lines[0] if len(lines) == 1 else f"{lines[0]} (+{len(lines) - 1} more)"


def _renames(prims: list[dict]) -> dict:
    out: dict[str, dict[str, Optional[str]]] = {"reactions": {}, "metabolites": {}}
    for p in prims:
        key = "reactions" if p["type"] == "reaction" else "metabolites" if p["type"] == "metabolite" else None
        if not key:
            continue
        if p["before"] and (p["after"] is None or p["after"]["id"] != p["before"]["id"]):
            out[key][p["before"]["id"]] = p["after"]["id"] if p["after"] else None
    return out


def _response(entry, old, prims) -> dict:
    return {"delta": delta(old, entry.catalog), "history": history(entry), "renamed": _renames(prims)}


# ----------------------------------------------------------------------------- public operations (cobra thread)

def check(entry: registry.ModelEntry, ops: list[dict]) -> dict:
    with entry.lock:
        prims, report = build(entry, ops)
    report["changes"] = [d for p in prims for d in _describe(p)]
    return report


def commit(entry: registry.ModelEntry, ops: list[dict], label: Optional[str] = None) -> dict:
    with entry.lock:
        prims, report = build(entry, ops)
        if report["errors"]:
            raise ScienceError("The edit is not valid", "; ".join(report["errors"][:4]), status=422,
                               hints=["Nothing was changed."], detail=report)
        if not prims:
            return {**_response(entry, entry.catalog, []), "report": report}
        _run(entry, prims)
        log = log_of(entry)
        log["applied"].append({"id": uuid.uuid4().hex[:10], "time": time.time(), "label": _label(prims, label),
                               "details": [d for p in prims for d in _describe(p)], "ops": prims})
        log["undone"] = []
        _save(entry)
        old = refresh(entry)
        return {**_response(entry, old, prims), "report": report}


def undo(entry: registry.ModelEntry) -> dict:
    with entry.lock:
        log = log_of(entry)
        if not log["applied"]:
            raise ScienceError("Nothing to undo", status=409)
        t = log["applied"][-1]
        prims = inverse(t["ops"])
        _run(entry, prims)
        log["undone"].append(log["applied"].pop())
        _save(entry)
        old = refresh(entry)
        return _response(entry, old, prims)


def redo(entry: registry.ModelEntry) -> dict:
    with entry.lock:
        log = log_of(entry)
        if not log["undone"]:
            raise ScienceError("Nothing to redo", status=409)
        t = log["undone"][-1]
        _run(entry, t["ops"])
        log["applied"].append(log["undone"].pop())
        _save(entry)
        old = refresh(entry)
        return _response(entry, old, t["ops"])


def discard(entry: registry.ModelEntry) -> dict:
    """Revert every edit: the model is the imported file again (plus the metabolite curation)."""
    with entry.lock:
        log = log_of(entry)
        prims = [p for t in reversed(log["applied"]) for p in inverse(t["ops"])]
        if prims:
            _run(entry, prims)
        entry.edits = _empty_log()
        _save(entry)
        old = refresh(entry)
        return _response(entry, old, prims)


def mark_exported(entry: registry.ModelEntry) -> None:
    log = log_of(entry)
    log["exported"] = log_hash(log)
    _save(entry)


def replay(entry: registry.ModelEntry) -> None:
    """Re-apply the saved log on a freshly loaded model (called by model_service before the catalog)."""
    from .annotation_service import load_json
    entry.base_genes = {g.id for g in entry.model.genes}
    saved = load_json(entry.id, "edits")
    entry.edits = saved if saved and isinstance(saved.get("applied"), list) else _empty_log()
    entry.edit_errors = []
    ok = []
    for t in entry.edits["applied"]:
        try:
            for p in t["ops"]:
                _apply(entry, p)
            ok.append(t)
        except Exception as e:  # noqa: BLE001 - reported, the remaining edits are skipped
            entry.edit_errors.append(f"“{t.get('label')}” could not be re-applied: {e}")
            break
    if len(ok) != len(entry.edits["applied"]):
        entry.edits["applied"] = ok
        entry.edits["undone"] = []


def rebuild(entry: registry.ModelEntry) -> None:
    """Reload the imported file (+ curation) and replay the saved log — used only if an inverse fails."""
    entry.model = ms.load_base_model(entry.id, entry.filename, entry.fmt)
    replay(entry)


def patch(entry: registry.ModelEntry) -> dict:
    """Model patch: the transactions plus the net effect per entity (first state before → last state after)."""
    log = log_of(entry)
    first: dict[tuple[str, str], Optional[dict]] = {}
    last: dict[tuple[str, str], Optional[dict]] = {}
    for t in log["applied"]:
        for p in t["ops"]:
            if p["type"] == "compartment":
                continue
            key_b = (p["type"], p["before"]["id"]) if p["before"] else None
            key_a = (p["type"], p["after"]["id"]) if p["after"] else None
            if key_b and key_b not in first:
                first[key_b] = p["before"]
            if key_a and key_a not in first:
                first[key_a] = None
            if key_b:
                last[key_b] = None if not key_a or key_a != key_b else p["after"]
            if key_a:
                last[key_a] = p["after"]
    net: dict[str, list] = {f"{k}{s}": [] for k in ("reactions", "metabolites") for s in ("Added", "Removed", "Changed")}
    for key, a in last.items():
        b = first.get(key)
        kind = "reactions" if key[0] == "reaction" else "metabolites"
        if b is None and a is not None:
            net[f"{kind}Added"].append(a)
        elif b is not None and a is None:
            net[f"{kind}Removed"].append(b["id"])
        elif b is not None and a is not None and a != b:
            net[f"{kind}Changed"].append({"before": b, "after": a})
    return {
        "format": "cobragui-model-patch", "version": 1,
        "model": {"filename": entry.filename, "checksum": entry.checksum, "modelId": entry.model.id or ""},
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"), "hash": log_hash(log),
        "summary": {k: len(v) for k, v in net.items()}, "net": net,
        "transactions": log["applied"],
    }


# ----------------------------------------------------------------------------- full validation

def validate(entry: registry.ModelEntry) -> dict:
    """Model-wide checks (on demand, not after every click)."""
    m = entry.model
    kinds = ms.boundary_kinds(m)
    comps = known_compartments(m)
    out: list[dict] = []

    def add(level, code, title, ids, detail=""):
        if ids:
            out.append({"level": level, "code": code, "title": title, "count": len(ids), "ids": ids[:5000], "detail": detail})

    rid_seen, dup_r = set(), []
    for r in m.reactions:
        if r.id in rid_seen:
            dup_r.append(r.id)
        rid_seen.add(r.id)
    add("error", "duplicate-reaction-id", "duplicate reaction IDs", dup_r)
    mid_seen, dup_m = set(), []
    for x in m.metabolites:
        if x.id in mid_seen:
            dup_m.append(x.id)
        mid_seen.add(x.id)
    add("error", "duplicate-metabolite-id", "duplicate metabolite IDs", dup_m)
    add("error", "empty-reaction", "reactions without metabolites", [r.id for r in m.reactions if not r.metabolites])
    add("error", "invalid-bounds", "reactions with lower bound > upper bound", [r.id for r in m.reactions if r.lower_bound > r.upper_bound])
    add("error", "invalid-gpr", "reactions with an invalid gene rule", [r.id for r in m.reactions if r.gene_reaction_rule and gpr_error(r.gene_reaction_rule)])
    add("error", "unknown-compartment", "metabolites without a compartment", [x.id for x in m.metabolites if not x.compartment])
    add("warning", "orphan-metabolite", "metabolites not used by any reaction (orphans)", [x.id for x in m.metabolites if not x.reactions])
    add("info", "unnamed-compartment", "compartments without a name", [c for c, n in comps.items() if not n or n == c])
    add("info", "no-formula", "metabolites without a formula", [x.id for x in m.metabolites if not x.formula])
    add("info", "no-charge", "metabolites without a charge", [x.id for x in m.metabolites if not isinstance(x.charge, (int, float))])
    mass, charge, skipped = [], [], 0
    for r in m.reactions:
        if r.id in kinds or r.id in entry.original_objective:
            continue
        info = {x.id: {"formula": x.formula, "charge": x.charge if isinstance(x.charge, (int, float)) else None} for x in r.metabolites}
        bal = balance({x.id: float(c) for x, c in r.metabolites.items()}, info)
        if bal["mass"] is None:
            skipped += 1
        elif bal["mass"]:
            mass.append(r.id)
        if bal["charge"] not in (None, 0):
            charge.append(r.id)
    add("warning", "mass-unbalanced", "reactions are elementally unbalanced", mass,
        f"Boundary and objective (biomass) reactions are excluded; {skipped} reactions with metabolites lacking a formula were not evaluated.")
    add("warning", "charge-unbalanced", "reactions are charge-unbalanced", charge, "Only reactions whose metabolites all have a charge are evaluated.")
    log = log_of(entry)
    return {"issues": out, "edits": len(log["applied"]), "reactions": len(m.reactions), "metabolites": len(m.metabolites),
            "checkedAt": time.time()}
