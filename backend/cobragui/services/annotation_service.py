"""Metabolite annotation analysis and curation (MetaNetX / MNXref).

1. Every metabolite's existing cross-references (annotation, plus identifiers encoded in its ID) are
   normalized and resolved to MetaNetX chemicals. Names never go to the ID mapper; an optional exact
   name lookup only produces suggestions. When the BiGG universal tables are installed
   (``npm run bigg:data``, services/bigg_service.py), they are a second, offline knowledge base: they
   link BiGG IDs (current or superseded) and other identifiers to MetaNetX, add BiGG's curated
   cross-references, and still resolve what they know when MetaNetX is unreachable.
2. Each metabolite gets a status:
     confident  all identifiers agree on one MetaNetX chemical and the formula does not contradict it
     doubt      identifiers disagree, the formula conflicts, or only the ID string / the name matched
     unmapped   nothing found
     skipped    pseudo-metabolites (ecModel enzymes, protein pool)
3. Accepted matches form a *curation layer* — new cross-references (MetaNetX ID, KEGG, ChEBI, BiGG,
   ModelSEED, MetaCyc, HMDB, VMH, InChIKey …) and optionally a missing formula/charge. Existing
   annotation is never removed or rewritten. The layer is saved next to the model cache, re-applied
   when the model is reloaded, can be reverted per metabolite, and is part of every exported model.
"""
from __future__ import annotations

import json
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Optional

from .. import registry
from ..errors import ScienceError
from . import metanetx as mnx_mod

ANALYSIS_VERSION = 1

# ----------------------------------------------------------------------------- identifiers

# annotation key (lower-case, separators removed) -> canonical namespace
_KEY = {
    "kegg": "kegg.compound", "keggcompound": "kegg.compound", "keggid": "kegg.compound",
    "keggglycan": "kegg.glycan", "keggdrug": "kegg.drug",
    "chebi": "chebi", "chebiid": "chebi",
    "bigg": "bigg.metabolite", "biggmetabolite": "bigg.metabolite",
    "metanetx": "metanetx.chemical", "metanetxchemical": "metanetx.chemical", "mnx": "metanetx.chemical",
    "seed": "seed.compound", "seedcompound": "seed.compound", "modelseed": "seed.compound",
    "metacyc": "metacyc.compound", "metacyccompound": "metacyc.compound", "biocyc": "metacyc.compound",
    "hmdb": "hmdb", "vmh": "vmhmetabolite", "vmhmetabolite": "vmhmetabolite",
    "sabiork": "sabiork.compound", "sabiorkcompound": "sabiork.compound",
    "lipidmaps": "lipidmaps", "slm": "slm", "swisslipids": "slm",
    "inchikey": "inchikey",
}
# namespaces written back into the model (COBRApy annotation key = identifiers.org prefix)
WRITE = ["metanetx.chemical", "kegg.compound", "chebi", "bigg.metabolite", "seed.compound", "metacyc.compound",
         "hmdb", "vmhmetabolite", "sabiork.compound", "lipidmaps", "slm", "kegg.glycan", "inchikey"]
# MetaNetX attaches whole compound classes from MetaCyc to some chemicals (D-glucose ->
# "Soyasapogenol-B-Monoglucosides"); above this many MetaCyc IDs per chemical none are written.
MAX_METACYC = 2
# MNX identifiers.org prefixes -> namespace
_MNX_PREFIX = {"kegg.compound": "kegg.compound", "chebi": "chebi", "bigg.metabolite": "bigg.metabolite",
               "seed.compound": "seed.compound", "metacyc.compound": "metacyc.compound", "hmdb": "hmdb",
               "vmhmetabolite": "vmhmetabolite", "sabiork.compound": "sabiork.compound", "lipidmaps": "lipidmaps",
               "slm": "slm", "kegg.glycan": "kegg.glycan", "kegg.drug": "kegg.drug"}

NS_LABEL = {"metanetx.chemical": "MetaNetX", "kegg.compound": "KEGG", "chebi": "ChEBI", "bigg.metabolite": "BiGG",
            "seed.compound": "ModelSEED", "metacyc.compound": "MetaCyc", "hmdb": "HMDB", "vmhmetabolite": "VMH",
            "sabiork.compound": "SABIO-RK", "lipidmaps": "LIPID MAPS", "slm": "SwissLipids", "kegg.glycan": "KEGG glycan",
            "kegg.drug": "KEGG drug", "inchikey": "InChIKey"}


def _keyof(k: str) -> str:
    return re.sub(r"[^a-z0-9]", "", k.lower())


def norm_id(ns: str, raw: str) -> Optional[str]:
    """Canonical identifier within a namespace, or None if unrecognisable."""
    v = str(raw).strip()
    v = re.sub(r"^https?://[^/]*(identifiers\.org|bioregistry\.io)/+", "", v, flags=re.I)
    v = re.sub(r"^([a-z][a-z.]*)[/:](?=.)", lambda m: "" if _KEY.get(_keyof(m.group(1))) else m.group(0), v, flags=re.I)
    if not v:
        return None
    if ns == "kegg.compound":
        m = re.search(r"\b(C\d{5})\b", v, re.I)
        return m.group(1).upper() if m else None
    if ns == "kegg.glycan":
        m = re.search(r"\b(G\d{5})\b", v, re.I)
        return m.group(1).upper() if m else None
    if ns == "kegg.drug":
        m = re.search(r"\b(D\d{5})\b", v, re.I)
        return m.group(1).upper() if m else None
    if ns == "chebi":
        m = re.search(r"(\d+)\s*$", v)
        return f"CHEBI:{int(m.group(1))}" if m else None
    if ns == "metanetx.chemical":
        m = re.search(r"(MNXM\d+|WATER)", v, re.I)
        return m.group(1).upper() if m else None
    if ns == "seed.compound":
        m = re.search(r"cpd\d{5}", v, re.I)
        return m.group(0).lower() if m else None
    if ns == "hmdb":
        m = re.search(r"HMDB(\d+)", v, re.I)
        return f"HMDB{m.group(1).zfill(7)}" if m else None
    if ns == "metacyc.compound":
        return re.sub(r"^(META|METACYC|BIOCYC)[:/]", "", v, flags=re.I).strip() or None
    if ns == "inchikey":
        m = re.search(r"[A-Z]{14}-[A-Z]{10}-[A-Z]", v, re.I)
        return m.group(0).upper() if m else None
    if ns == "slm":
        m = re.search(r"(\d{9})", v)
        return f"SLM:{m.group(1)}" if m else None
    return v


def annotation_xrefs(annotation: Optional[dict]) -> set[tuple[str, str]]:
    """(namespace, id) pairs of a COBRApy annotation dict."""
    out: set[tuple[str, str]] = set()
    for k, val in (annotation or {}).items():
        ns = _KEY.get(_keyof(str(k)))
        if not ns:
            continue
        for v in (val if isinstance(val, (list, tuple)) else [val]):
            for part in re.split(r"[;,|]\s*|\s+", str(v)):
                i = norm_id(ns, part) if part else None
                if i:
                    out.add((ns, i))
    return out


def id_xrefs(met_id: str, compartment: str) -> set[tuple[str, str]]:
    """Identifiers implied by the ID string only (C00031[c], cpd00027_c0, MNXM41, glc__D_c) — weaker evidence."""
    s = re.sub(r"^M_", "", met_id)
    for pat, ns in ((r"^(C\d{5})(?!\d)", "kegg.compound"), (r"^(cpd\d{5})(?!\d)", "seed.compound"), (r"^(MNXM\d+)(?!\d)", "metanetx.chemical")):
        m = re.match(pat, s, re.I)
        if m:
            return {(ns, norm_id(ns, m.group(1)))}
    c = re.escape(compartment or "")
    base = re.sub(rf"(\[{c}\]|\({c}\)|[_-]{c})$", "", s) if c else s
    base = re.sub(r"\[[a-z0-9]+\]$", "", base, flags=re.I)
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_]*", base) and not base.isdigit() and len(base) <= 40:
        return {("bigg.metabolite", base)}
    return set()


def mnx_uri(ns: str, i: str) -> Optional[str]:
    """URI form used by MNXref for an identifier."""
    if ns == "metanetx.chemical":
        return None  # handled directly as an MNX chemical
    if ns == "chebi":
        return f"https://identifiers.org/{i}"  # CHEBI:4167
    if ns == "slm":
        return f"https://identifiers.org/{i}"  # SLM:000001048
    if ns in ("kegg.compound", "bigg.metabolite", "seed.compound", "metacyc.compound", "hmdb", "vmhmetabolite",
              "sabiork.compound", "lipidmaps", "kegg.glycan", "kegg.drug"):
        return f"https://identifiers.org/{ns}:{i}"
    return None


def parse_mnx_xref(uri: str) -> Optional[tuple[str, str]]:
    m = re.match(r"https://identifiers\.org/([^:/]+):(.+)$", uri)
    if not m:
        return None
    prefix, rest = m.group(1).lower(), m.group(2)
    if prefix == "chebi":
        return ("chebi", f"CHEBI:{int(rest)}") if rest.isdigit() else None
    if prefix == "slm":
        return ("slm", f"SLM:{rest}")
    ns = _MNX_PREFIX.get(prefix)
    if not ns:
        return None
    i = norm_id(ns, rest)
    return (ns, i) if i else None


def heavy_atoms(formula: Optional[str]) -> Optional[dict]:
    if not formula or re.search(r"[()*]|R(?![a-z])|X(?![a-z])|n$", formula):
        return None
    out: dict[str, int] = {}
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", formula):
        if el != "H":
            out[el] = out.get(el, 0) + (int(n) if n else 1)
    return out or None


def formula_check(a: Optional[str], b: Optional[str]) -> Optional[str]:
    x, y = heavy_atoms(a), heavy_atoms(b)
    if not x or not y:
        return None
    return "match" if x == y else "conflict"


def compact(name: Optional[str]) -> str:
    s = (name or "").lower()
    s = re.sub(r"\s*\[[^\]]{1,24}\]\s*$", "", s)
    s = re.sub(r"\s*\(\s*\d*\s*[+-]\s*\d*\s*\)\s*$", "", s)
    return re.sub(r"[\s\-,'()\[\]{}_]", "", s)


def clean_name(name: str) -> str:
    """Name as it would appear in MetaNetX (compartment and charge decorations removed)."""
    s = re.sub(r"\s*\[[^\]]{1,24}\]\s*$", "", name or "").strip()
    return re.sub(r"\s*\(\s*\d*\s*[+-]\s*\d*\s*\)\s*$", "", s).strip()


PSEUDO = re.compile(r"^(prot_|pmet_|prot_pool)|^(biomass|protein|lipid|dna|rna|carbohydrate)(_|\[|$)", re.I)

# ----------------------------------------------------------------------------- analysis


def snapshot(entry: registry.ModelEntry) -> list[dict]:
    with entry.lock:
        return [{"id": m.id, "name": m.name or "", "formula": m.formula or None,
                 "charge": m.charge if isinstance(m.charge, (int, float)) else None,
                 "compartment": m.compartment or "", "annotation": dict(m.annotation or {})}
                for m in entry.model.metabolites]


def bigg_index():
    """The local BiGG knowledge base, or None when it is not installed (lazy import: bigg_service imports us)."""
    try:
        from . import bigg_service
        return bigg_service.index()
    except Exception:  # noqa: BLE001 - optional layer; the analysis works without it
        return None


def _bigg_status(big) -> Optional[dict]:
    if big is None:
        return None
    try:
        from . import bigg_service
        st = bigg_service.status()
        return {"metabolites": len(big.mets), "installed": st.get("installed"), "source": st.get("source")}
    except Exception:  # noqa: BLE001
        return {"metabolites": len(big.mets)}


def _bigg_links(m: dict, xs: list[dict], big) -> list[str]:
    """BiGG universal metabolites of this metabolite (from its annotation, its ID, superseded BiGG IDs).

    BiGG's own MetaNetX links are often older MNX releases (glutathione: MNXM57 in BiGG, MNXM490899 in
    MNXref 4), so they only *bridge* to MetaNetX when the metabolite's identifiers resolved nothing there
    (BiGG IDs unknown to MNXref, offline). Bridging inputs are ``derived``: shown as evidence, never counted
    as an extra independent database in the consensus.
    """
    found: dict[str, tuple[str, str, bool]] = {}
    ann: dict[str, list[str]] = {}
    for x in xs:
        if x["source"] == "annotation":
            ann.setdefault(x["ns"], []).append(x["id"])
    for uid in big.resolve(ann):
        found.setdefault(uid, ("annotation", "annotation", False))
    for ns, i in id_xrefs(m["id"], m["compartment"]):
        if i:
            for uid in big.resolve({ns: [i]}):
                found[uid] = ("the metabolite ID", "id", True)
    if not any(x.get("mnx") for x in xs):
        for uid, (frm, source, anchor) in sorted(found.items()):
            mnx = sorted(big.mets[uid]["xrefs"].get("metanetx.chemical", ()))
            if mnx:
                xs.append({"ns": "bigg.metabolite", "id": uid, "source": source, "mnx": mnx, "derived": True, "anchor": anchor, "from": frm})
    return sorted(found)


def merge_bigg(info: dict, mnx_ids, big) -> dict:
    """Describe from the BiGG tables the MetaNetX chemicals MetaNetX itself gave no data for (bridged IDs,
    or MetaNetX unreachable). Entries MetaNetX described are left as they are."""
    if big is None:
        return info
    for i in set(mnx_ids):
        if (info.get(i) or {}).get("exists"):
            continue
        uids = sorted(big.by_xref.get(f"metanetx.chemical:{str(i).upper()}", ()))
        if not uids:
            continue
        b = big.mets[uids[0]]
        info[i] = {"mnx": i, "name": b["name"], "formula": b["formula"], "charge": b["charge"], "inchikey": None,
                   "xrefs": [], "isomers": [], "exists": True, "fromBigg": True}
    return info


def bigg_additions(uids: list[str], big) -> dict[str, set[str]]:
    """BiGG IDs and BiGG's curated cross-references (KEGG, ChEBI, ModelSEED, HMDB, InChIKey) of BiGG metabolites.
    MetaNetX links (often an older MNX release) and MetaCyc entries (often compound classes) are left out."""
    out: dict[str, set[str]] = {}
    for uid in uids:
        b = big.mets.get(uid)
        if not b:
            continue
        out.setdefault("bigg.metabolite", set()).add(uid)
        for ns, vals in b["xrefs"].items():
            if ns in ("metanetx.chemical", "metacyc.compound") or ns not in WRITE:
                continue
            if ns == "inchikey" and len(vals) != 1:
                continue
            out.setdefault(ns, set()).update(vals)
    return out


_AUTO = object()


def analyze(mets: list[dict], client: mnx_mod.MetaNetX, use_names: bool = True,
            progress: Optional[Callable[[str, int, int], None]] = None, bigg=_AUTO) -> dict:
    """Pure analysis (no model mutation). `progress(phase, done, total)`.
    `bigg`: a BiggIndex, None to leave the BiGG tables out, or (default) the installed tables."""
    t0 = time.time()
    big = bigg_index() if bigg is _AUTO else bigg
    report = progress or (lambda *_: None)
    errors: list[str] = []

    inputs: dict[str, list[dict]] = {}
    for m in mets:
        if PSEUDO.search(m["id"]) or PSEUDO.search(m["name"]):
            continue
        ann = annotation_xrefs(m["annotation"])
        ids = id_xrefs(m["id"], m["compartment"]) - ann
        inputs[m["id"]] = [{"ns": ns, "id": i, "source": "annotation"} for ns, i in sorted(ann)] + \
                          [{"ns": ns, "id": i, "source": "id"} for ns, i in sorted(ids)]

    # 1. identifiers -> MNX
    uris = {mnx_uri(x["ns"], x["id"]) for xs in inputs.values() for x in xs} - {None}
    done = [0]

    def step(phase, total):
        def f(n):
            done[0] += n
            report(phase, min(done[0], total), total)
        return f

    resolved: dict[str, list[str]] = {}
    try:
        resolved = client.resolve_xrefs(uris, progress=step("identifiers", len(uris)))
    except mnx_mod.MetaNetXUnavailable as e:
        errors.append(str(e))
    for xs in inputs.values():
        for x in xs:
            if x["ns"] == "metanetx.chemical":
                x["mnx"] = [x["id"]]
            else:
                x["mnx"] = resolved.get(mnx_uri(x["ns"], x["id"]) or "", [])

    # 1b. local BiGG tables: BiGG IDs (current or superseded) and other identifiers -> MetaNetX, offline
    bigg_of: dict[str, list[str]] = {}
    if big is not None:
        for m in mets:
            if m["id"] in inputs:
                bigg_of[m["id"]] = _bigg_links(m, inputs[m["id"]], big)

    # 2. optional exact name lookup for metabolites without any identifier hit
    name_hits: dict[str, list[str]] = {}
    if use_names and not errors:
        need = {m["id"]: clean_name(m["name"]) for m in mets
                if m["id"] in inputs and not any(x["mnx"] for x in inputs[m["id"]]) and clean_name(m["name"])}
        variants = {v for n in need.values() for v in (n, n[:1].lower() + n[1:])}
        done[0] = 0
        try:
            hits = client.lookup_names(variants, progress=step("names", len(variants)))
            for mid, n in need.items():
                found = hits.get(n) or hits.get(n[:1].lower() + n[1:]) or []
                if found:
                    name_hits[mid] = found
        except mnx_mod.MetaNetXUnavailable as e:
            errors.append(str(e))

    # 3. chemical details
    all_mnx = {i for xs in inputs.values() for x in xs for i in x["mnx"]} | {i for v in name_hits.values() for i in v}
    info: dict[str, dict] = {}
    done[0] = 0
    try:
        info = client.chem_info(all_mnx, progress=step("compounds", len(all_mnx)))
    except mnx_mod.MetaNetXUnavailable as e:
        errors.append(str(e))
    merge_bigg(info, all_mnx, big)

    report("deciding", 0, len(mets))
    items = [decide(m, inputs.get(m["id"]), name_hits.get(m["id"], []), info, bigg_of.get(m["id"], []), big) for m in mets]
    summary = {k: sum(1 for it in items if it["status"] == k) for k in ("confident", "doubt", "unmapped", "skipped")}
    summary["total"] = len(items)
    summary["newIdentifiers"] = sum(sum(len(v) for v in it["proposal"]["add"].values()) for it in items if it.get("proposal"))
    summary["formulaSuggestions"] = sum(1 for it in items if it.get("proposal") and it["proposal"].get("formula"))
    return {
        "version": ANALYSIS_VERSION,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {"service": "MetaNetX / MNXref (SPARQL)" + (" + BiGG (local tables)" if big is not None else ""),
                   "endpoint": mnx_mod.ENDPOINT, "networkCalls": client.network_calls, "bigg": _bigg_status(big)},
        "status": "partial" if errors else "done",
        "errors": errors,
        "seconds": round(time.time() - t0, 1),
        "summary": summary,
        "items": items,
    }


def _candidate(i: str, info: dict, via: list[str], model_formula: Optional[str], model_name: str) -> dict:
    d = info.get(i) or {"mnx": i, "exists": False, "xrefs": [], "isomers": []}
    return {
        "mnx": i, "name": d.get("name"), "formula": d.get("formula"), "charge": d.get("charge"), "inchikey": d.get("inchikey"),
        "structured": bool(d.get("formula") or d.get("inchikey")), "exists": bool(d.get("exists")),
        "via": via, "formulaCheck": formula_check(model_formula, d.get("formula")),
        "nameMatch": bool(d.get("name")) and compact(d.get("name")) == compact(model_name),
        "bigg": d.get("bigg", []),
        "fromBigg": bool(d.get("fromBigg")),
    }


def _additions(cand: dict, info: dict, existing: set[tuple[str, str]], big=None) -> dict[str, list[str]]:
    d = info.get(cand["mnx"]) or {}
    found: dict[str, set[str]] = {}
    if big is not None:
        for ns, vals in bigg_additions(cand.get("bigg") or [], big).items():
            found.setdefault(ns, set()).update(vals)
    for uri in d.get("xrefs", []):
        p = parse_mnx_xref(uri)
        if p and p[0] in WRITE:
            found.setdefault(p[0], set()).add(p[1])
    if len(found.get("metacyc.compound", ())) > MAX_METACYC:
        found.pop("metacyc.compound")
    if not d.get("fromBigg"):  # an MNX ID known only through BiGG may be from an older MNX release: not written
        found.setdefault("metanetx.chemical", set()).add(cand["mnx"])
    if d.get("inchikey"):
        found.setdefault("inchikey", set()).add(d["inchikey"])
    out = {}
    for ns in WRITE:
        new = sorted(v for v in found.get(ns, ()) if (ns, v) not in existing)
        if new:
            out[ns] = new
    return out


def decide(m: dict, inputs: Optional[list[dict]], names: list[str], info: dict, bigg_uids: Optional[list[str]] = None, big=None) -> dict:
    base = {"id": m["id"], "name": m["name"], "compartment": m["compartment"], "formula": m["formula"], "charge": m["charge"]}
    if inputs is None:
        return {**base, "status": "skipped", "reason": "Pseudo-metabolite (enzyme / pool / biomass component)", "inputs": [], "candidates": []}
    existing = annotation_xrefs(m["annotation"])
    votes: dict[str, list[str]] = {}
    src: dict[str, set[str]] = {}
    for x in inputs:
        label = (f"BiGG {x['id']} (local BiGG tables, from {x['from']})" if x.get("derived")
                 else f"{NS_LABEL.get(x['ns'], x['ns'])} {x['id']}" + (" (from the ID)" if x["source"] == "id" else ""))
        for i in x["mnx"]:
            votes.setdefault(i, []).append(label)
            src.setdefault(i, set()).add(x["source"])
    for i in names:
        votes.setdefault(i, []).append(f"name “{clean_name(m['name'])}”")
        src.setdefault(i, set()).add("name")
    cands = [_candidate(i, info, v, m["formula"], m["name"]) for i, v in votes.items()]
    if big is not None and bigg_uids:
        # The BiGG metabolites this metabolite resolves to, on every candidate whose composition agrees. Several
        # BiGG entries can share a KEGG/ChEBI ID (g6p and M01389): then only the one(s) the model itself uses
        # (its ID or an annotated BiGG ID) are kept, otherwise none — a BiGG ID is written only when unambiguous.
        own = big.resolve({"bigg.metabolite": [x["id"] for x in inputs if x["ns"] == "bigg.metabolite" and not x.get("derived")]})
        for c in cands:
            fit = [u for u in bigg_uids if formula_check(big.mets[u]["formula"], c["formula"]) != "conflict"]
            c["bigg"] = [u for u in fit if u in own] or (fit if len(fit) == 1 else [])
    cands = [c for c in cands if c["exists"]] or cands
    cands.sort(key=lambda c: (-("annotation" in src[c["mnx"]]), -len(c["via"]), -c["structured"], c["formulaCheck"] == "conflict", c["mnx"]))
    inputs_out = [{"xref": (f"BiGG {x['id']} (local tables)" if x.get("derived") else f"{NS_LABEL.get(x['ns'], x['ns'])} {x['id']}"),
                   "source": "bigg" if x.get("derived") else x["source"], "mnx": x["mnx"]} for x in inputs]
    if not cands:
        return {**base, "status": "unmapped", "reason": "No identifier or name of this metabolite is known to MetaNetX" if inputs else "No database identifier, and no exact name match in MetaNetX",
                "inputs": inputs_out, "candidates": []}

    def reduce(group: list[dict]) -> tuple[Optional[dict], str]:
        """One chemical, or one structured chemical whose structureless twins carry the same name."""
        if len(group) == 1:
            return group[0], ""
        structured = [c for c in group if c["structured"]]
        if len(structured) == 1 and all(c["structured"] or compact(c["name"]) == compact(structured[0]["name"]) for c in group):
            others = ", ".join(c["mnx"] for c in group if c is not structured[0])
            return structured[0], f" ({others}: entry without structure, same name)"
        return None, ""

    ann = [c for c in cands if "annotation" in src[c["mnx"]]]
    idc = [c for c in cands if "id" in src[c["mnx"]] and "annotation" not in src[c["mnx"]]]
    status, reason, chosen = "doubt", "", cands[0]
    # The metabolite's own ID (BiGG base, KEGG C-number…) is the model author's statement of identity: the anchor.
    anchor = {i for ns, i0 in id_xrefs(m["id"], m["compartment"]) for x in inputs
              if x["ns"] == ns and x["id"] == i0 and not x.get("derived") for i in x["mnx"]}
    anchor |= {i for x in inputs if x.get("anchor") for i in x["mnx"]}  # the ID, through the BiGG tables
    if ann:
        # consensus by DATABASE, not by identifier: annotations often list several ChEBI entries (acid, anion,
        # parent class) that MNXref keeps apart, while BiGG/KEGG/SEED/HMDB agree on one chemical
        support = {c["mnx"]: {x["ns"] for x in inputs if x["source"] == "annotation" and not x.get("derived") and c["mnx"] in x["mnx"]} for c in ann}
        nvotes = {c["mnx"]: len(c["via"]) for c in ann}
        # salts, hydrates and conjugates that annotations often drag along have another composition
        compatible = [c for c in ann if c["formulaCheck"] != "conflict"] or ann
        excluded = [c for c in ann if c not in compatible]
        ranked = sorted(compatible, key=lambda c: (-(c["mnx"] in anchor), -len(support[c["mnx"]]), -nvotes[c["mnx"]], -c["structured"], c["mnx"]))
        one, note = reduce(compatible)
        top, nxt = ranked[0], (ranked[1] if len(ranked) > 1 else None)
        ns_top, ns_next = len(support[top["mnx"]]), (len(support[nxt["mnx"]]) if nxt else 0)
        v_top, v_next = nvotes[top["mnx"]], (nvotes[nxt["mnx"]] if nxt else 0)
        ignored = ", ".join(f"{c['mnx']} {c['name']} {c['formula']}" for c in excluded[:3])  # no nested quotes: Python 3.10
        dropped = f" Ignored (different formula): {ignored}." if excluded else ""
        others = "; ".join(f"{c['mnx']} ({c['name']}) via {', '.join(c['via'][:3])}" for c in ranked[1:4])
        if one:
            chosen, status, reason = one, "confident", f"All annotated identifiers point to {one['mnx']}{note}.{dropped}"
        elif top["mnx"] in anchor and ns_top >= 2 and v_top > v_next:
            chosen, status = top, "confident"
            reason = (f"The metabolite ID and {', '.join(NS_LABEL.get(n, n) for n in sorted(support[top['mnx']]))} agree on {top['mnx']}. "
                      f"Other annotated identifiers point elsewhere: {others}.{dropped}")
        elif not anchor and ns_top >= 2 and ns_next <= 1 and v_next * 2 <= v_top:
            chosen, status = top, "confident"
            reason = f"{', '.join(NS_LABEL.get(n, n) for n in sorted(support[top['mnx']]))} agree on {top['mnx']}; minor identifiers point elsewhere: {others}.{dropped}"
        else:
            chosen = top
            reason = f"Annotated identifiers point to {len(compatible)} different MetaNetX chemicals: " + "; ".join(
                f"{c['mnx']} ({c['name']}) via {', '.join(c['via'][:4])}" for c in ranked[:4]) + f".{dropped}"
    elif idc:
        one, note = reduce(idc)
        if one and (one["formulaCheck"] == "match" or one["nameMatch"]):
            chosen, status, reason = one, "confident", f"ID encodes {', '.join(one['via'])}; {'formula' if one['formulaCheck'] == 'match' else 'name'} agrees{note}"
        elif one:
            chosen, reason = one, "Matched only through the ID string, without an annotation, formula or name to confirm it"
        else:
            reason = f"The ID string points to {len(idc)} different MetaNetX chemicals"
    else:
        reason = "Exact name match only — names are not identities; please confirm"
    if status == "confident" and anchor and chosen["mnx"] not in anchor:
        status = "doubt"
        reason = (f"The metabolite ID points to {', '.join(sorted(anchor))} "
                  f"({', '.join(c['name'] or '?' for c in cands if c['mnx'] in anchor)}), the annotation to {chosen['mnx']} ({chosen['name']})")
    if status == "confident" and chosen["formulaCheck"] == "conflict":
        status, reason = "doubt", f"{chosen['mnx']} has formula {chosen['formula']}, the model has {m['formula']} (H not compared)"
    if chosen.get("fromBigg"):
        reason += (" Described from the local BiGG tables (MetaNetX gave no data for it): its BiGG cross-references are"
                   " proposed, its MetaNetX ID is not written until MetaNetX confirms it.")
    proposal = {"mnx": chosen["mnx"], "add": _additions(chosen, info, existing, big)}
    if not m["formula"] and chosen.get("formula"):
        proposal["formula"] = chosen["formula"]
        proposal["charge"] = chosen.get("charge")
    return {**base, "status": status, "reason": reason, "inputs": inputs_out, "candidates": cands[:6], "proposal": proposal}


# ----------------------------------------------------------------------------- persistence

def _path(mid: str, kind: str):
    return registry.cache_dir() / f"{mid}.{kind}.json"


def load_json(mid: str, kind: str) -> Optional[dict]:
    p = _path(mid, kind)
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
    except Exception:  # noqa: BLE001 - corrupt cache file: start over
        return None


def save_json(mid: str, kind: str, data: dict) -> None:
    _path(mid, kind).write_text(json.dumps(data), encoding="utf-8")


def empty_curation() -> dict:
    return {"version": 1, "metabolites": {}, "rejected": []}


def curation(mid: str) -> dict:
    return load_json(mid, "curation") or empty_curation()


def _as_list(v: Any) -> list[str]:
    return [str(x) for x in v] if isinstance(v, (list, tuple)) else ([str(v)] if v not in (None, "") else [])


def _apply_one(met, c: dict) -> None:
    ann = met.annotation
    for ns, vals in c["added"].items():
        cur = _as_list(ann.get(ns))
        ann[ns] = cur + [v for v in vals if v not in cur]
    if c.get("formula"):
        met.formula = c["formula"]
        if c.get("charge") is not None:
            met.charge = c["charge"]


def _revert_one(met, c: dict) -> None:
    ann = met.annotation
    for ns, vals in c["added"].items():
        left = [v for v in _as_list(ann.get(ns)) if v not in vals]
        if left:
            ann[ns] = left if len(left) > 1 else left[0]
        else:
            ann.pop(ns, None)
    if c.get("formula"):
        met.formula = c["original"].get("formula") or ""
        met.charge = c["original"].get("charge")


def apply_curation_to_model(model, cur: dict) -> int:
    """Re-apply a saved curation layer (model reload). Returns the number of metabolites touched."""
    n = 0
    for mid, c in (cur or {}).get("metabolites", {}).items():
        if mid in model.metabolites:
            _apply_one(model.metabolites.get_by_id(mid), c)
            n += 1
    return n


def _refresh(entry: registry.ModelEntry, ids: Iterable[str]) -> list[dict]:
    """Update the catalog rows (and search index) of changed metabolites."""
    from . import model_service as ms
    from .search_service import SearchIndex
    ids = set(ids)
    rows = []
    pos = {m["id"]: i for i, m in enumerate(entry.catalog["metabolites"])}
    for mid in ids:
        if mid not in entry.model.metabolites or mid not in pos:
            continue
        met = entry.model.metabolites.get_by_id(mid)
        row = {**entry.catalog["metabolites"][pos[mid]], "formula": met.formula or None,
               "charge": met.charge if isinstance(met.charge, (int, float)) else None, "annotation": ms._ann(met.annotation)}
        entry.catalog["metabolites"][pos[mid]] = row
        rows.append(row)
    if ids:
        entry.search = SearchIndex(entry.model)
    return rows


def apply(entry: registry.ModelEntry, choices: list[dict], source: str = "user") -> dict:
    """choices: [{id, mnx?, fillFormula?, like?}] — mnx defaults to the analysis proposal.

    like = id of the same compound in another compartment (pyr_c for pyr_m): its candidate is used when
    this metabolite's own analysis did not list the chosen chemical (e.g. it was unmapped).
    """
    analysis = load_json(entry.id, "annotation")
    if not analysis:
        raise ScienceError("No annotation analysis", "Run the metabolite analysis first.")
    by_id = {it["id"]: it for it in analysis["items"]}
    cur = curation(entry.id)
    changed = []
    with entry.lock:
        for ch in choices:
            it = by_id.get(ch["id"])
            if not it or ch["id"] not in entry.model.metabolites:
                continue
            met = entry.model.metabolites.get_by_id(ch["id"])
            old = cur["metabolites"].get(ch["id"])
            if old:
                _revert_one(met, old)
            want = ch.get("mnx") or (it.get("proposal") or {}).get("mnx")
            cand = next((c for c in it.get("candidates", []) if c["mnx"] == want), None)
            like = by_id.get(ch.get("like") or "")
            if not cand and like:
                cand = next((c for c in like.get("candidates", []) if c["mnx"] == want), None)
            if not cand:
                continue
            try:
                info = mnx_mod.client().chem_info([want])
            except mnx_mod.MetaNetXUnavailable:
                info = {}
            big = bigg_index()
            merge_bigg(info, [want], big)
            c = {"mnx": want, "added": _additions(cand, info, annotation_xrefs(met.annotation), big), "source": source,
                 "status": it["status"], "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 **({"like": like["id"]} if like else {}),
                 "original": {"formula": met.formula or None, "charge": met.charge if isinstance(met.charge, (int, float)) else None}}
            if ch.get("fillFormula", True) and not met.formula and cand.get("formula"):
                c["formula"], c["charge"] = cand["formula"], cand.get("charge")
            _apply_one(met, c)
            cur["metabolites"][ch["id"]] = c
            cur["rejected"] = [x for x in cur["rejected"] if x != ch["id"]]
            changed.append(ch["id"])
        save_json(entry.id, "curation", cur)
        rows = _refresh(entry, changed)
    return {"curation": curation_summary(cur), "metabolites": rows}


def reject(entry: registry.ModelEntry, ids: list[str]) -> dict:
    """Keep the model as it is for these metabolites (undoing an accepted match) and remember the decision."""
    cur = curation(entry.id)
    accepted = [i for i in ids if i in cur["metabolites"]]
    rows = revert(entry, accepted, cur)["metabolites"] if accepted else []
    cur["rejected"] = sorted(set(cur["rejected"]) | set(ids))
    save_json(entry.id, "curation", cur)
    return {"curation": curation_summary(cur), "metabolites": rows}


def revert(entry: registry.ModelEntry, ids: Optional[list[str]], cur: Optional[dict] = None) -> dict:
    cur = cur or curation(entry.id)
    targets = list(cur["metabolites"]) if ids is None else [i for i in ids if i in cur["metabolites"]]
    with entry.lock:
        for mid in targets:
            if mid in entry.model.metabolites:
                _revert_one(entry.model.metabolites.get_by_id(mid), cur["metabolites"][mid])
            cur["metabolites"].pop(mid, None)
        save_json(entry.id, "curation", cur)
        rows = _refresh(entry, targets)
    return {"curation": curation_summary(cur), "metabolites": rows}


def curation_summary(cur: dict) -> dict:
    ms_ = cur.get("metabolites", {})
    return {
        "accepted": len(ms_),
        "identifiers": sum(sum(len(v) for v in c["added"].values()) for c in ms_.values()),
        "formulas": sum(1 for c in ms_.values() if c.get("formula")),
        "rejected": len(cur.get("rejected", [])),
        "entries": {k: {"mnx": c["mnx"], "source": c["source"], "formula": bool(c.get("formula")), "at": c["at"]} for k, c in ms_.items()},
        "rejectedIds": cur.get("rejected", []),
    }


# ----------------------------------------------------------------------------- jobs

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def job(mid: str) -> Optional[dict]:
    with _jobs_lock:
        j = _jobs.get(mid)
        return dict(j) if j else None


def start(entry: registry.ModelEntry, use_names: bool, auto_apply: bool, fill_formulas: bool) -> dict:
    with _jobs_lock:
        j = _jobs.get(entry.id)
        if j and j["state"] == "running":
            return dict(j)
        j = {"state": "running", "phase": "preparing", "done": 0, "total": 0, "startedAt": time.time(), "error": None}
        _jobs[entry.id] = j
    mets = snapshot(entry)

    def progress(phase, done, total):
        with _jobs_lock:
            j.update(phase=phase, done=done, total=total)

    def run():
        try:
            result = analyze(mets, mnx_mod.client(), use_names=use_names, progress=progress)
            save_json(entry.id, "annotation", result)
            if auto_apply:
                rejected = set(curation(entry.id)["rejected"])
                apply(entry, [{"id": it["id"], "fillFormula": fill_formulas} for it in result["items"]
                              if it["status"] == "confident" and it["id"] not in rejected], source="auto")
            with _jobs_lock:
                j.update(state="done", phase="done", finishedAt=time.time())
        except Exception as e:  # noqa: BLE001 - reported to the UI
            with _jobs_lock:
                j.update(state="error", error=str(e))

    threading.Thread(target=run, name=f"annotate-{entry.id}", daemon=True).start()
    return dict(j)


def status(entry: registry.ModelEntry, full: bool = True) -> dict:
    return {"job": job(entry.id), "analysis": load_json(entry.id, "annotation") if full else None,
            "curation": curation_summary(curation(entry.id))}
