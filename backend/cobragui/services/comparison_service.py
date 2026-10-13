"""Result-vs-result comparison (B relative to reference A).

Every row is classified before any ratio is computed, so biologically distinct events are never
collapsed into one number:
  both-zero | unchanged | changed | activated (0 → v) | inactivated (v → 0) | reversal (sign flip) | missing
Fold changes compare magnitudes |B| / |A| and are only defined for 'changed'/'unchanged' rows. For
activated/inactivated rows a log2FC is produced only when the caller explicitly sets a pseudocount
(the row is then flagged). Direction reversals never get a fold change.
"""
import math
from typing import Optional

from ..errors import ScienceError, num
from ..schemas import ResultPayload


def classify(a: Optional[float], b: Optional[float], tol: float) -> str:
    if a is None or b is None:
        return "missing"
    za, zb = abs(a) <= tol, abs(b) <= tol
    if za and zb:
        return "both-zero"
    if za:
        return "activated"
    if zb:
        return "inactivated"
    if (a > 0) != (b > 0):
        return "reversal"
    return "unchanged" if abs(b - a) <= tol else "changed"


def _row(id_: str, a, b, tol: float, pseudo: Optional[float]) -> dict:
    cat = classify(a, b, tol)
    log2fc = fc = None
    used_pseudo = False
    if cat in ("changed", "unchanged"):
        fc = abs(b) / abs(a)
        log2fc = math.log2(fc)
    elif cat in ("activated", "inactivated") and pseudo:
        fc = (abs(b) + pseudo) / (abs(a) + pseudo)
        log2fc = math.log2(fc)
        used_pseudo = True
    delta = (b - a) if a is not None and b is not None else None
    return {"id": id_, "a": num(a), "b": num(b), "delta": num(delta), "absDelta": num(abs(delta)) if delta is not None else None,
            "foldChange": num(fc), "log2fc": num(log2fc), "category": cat, "pseudocount": used_pseudo}


def _counts(rows: list[dict]) -> dict:
    out: dict[str, int] = {}
    for r in rows:
        out[r["category"]] = out.get(r["category"], 0) + 1
    return out


def _compare_vectors(va: dict, vb: dict, tol: float, pseudo: Optional[float]) -> list[dict]:
    ids = list(dict.fromkeys([*va.keys(), *vb.keys()]))
    return [_row(i, va.get(i), vb.get(i), tol, pseudo) for i in ids]


def _config_diff(a: ResultPayload, b: ResultPayload) -> dict:
    ma, mb = a.metadata or {}, b.metadata or {}
    oa, ob = ma.get("objective") or {}, mb.get("objective") or {}
    meda, medb = ma.get("medium") or {}, mb.get("medium") or {}
    medium = []
    for rid in sorted(set(meda) | set(medb)):
        x, y = meda.get(rid), medb.get(rid)
        if x != y:
            medium.append({"reaction": rid, "a": x, "b": y})
    ba = {c["reaction"]: c["current"] for c in ma.get("boundChanges") or []}
    bb = {c["reaction"]: c["current"] for c in mb.get("boundChanges") or []}
    bounds = []
    for rid in sorted(set(ba) | set(bb)):
        if ba.get(rid) != bb.get(rid):
            bounds.append({"reaction": rid, "a": ba.get(rid), "b": bb.get(rid)})
    return {
        "sameModel": (ma.get("model") or {}).get("checksum") == (mb.get("model") or {}).get("checksum"),
        "objective": {"a": oa, "b": ob, "changed": oa != ob},
        "methods": {"a": a.method, "b": b.method},
        "medium": medium,
        "bounds": bounds,
    }


def compare(a: ResultPayload, b: ResultPayload, tol: float, pseudo: Optional[float]) -> dict:
    for r, label in ((a, "A"), (b, "B")):
        if r.solver_status and r.solver_status != "optimal":
            raise ScienceError(f"Result {label} is not optimal", f"'{r.name}' has solver status '{r.solver_status}'.",
                               hints=["Only optimal solutions can be compared."])
    fva_a, fva_b = a.fva is not None, b.fva is not None
    if fva_a != fva_b:
        raise ScienceError("Cannot compare FVA with a flux distribution",
                           "FVA gives an independent feasible interval per reaction, not one flux vector.",
                           hints=["Compare two FVA results, or two FBA/pFBA/loopless results."])
    out = {"a": {"id": a.id, "name": a.name, "method": a.method}, "b": {"id": b.id, "name": b.name, "method": b.method},
           "zeroTolerance": tol, "pseudocount": pseudo, "config": _config_diff(a, b)}
    if fva_a:
        rows = []
        for rid in dict.fromkeys([*a.fva.keys(), *b.fva.keys()]):
            ia, ib = a.fva.get(rid), b.fva.get(rid)
            if not ia or not ib or None in (ia.get("minimum"), ia.get("maximum"), ib.get("minimum"), ib.get("maximum")):
                rows.append({"id": rid, "category": "missing"})
                continue
            wa, wb = ia["maximum"] - ia["minimum"], ib["maximum"] - ib["minimum"]
            overlap = min(ia["maximum"], ib["maximum"]) - max(ia["minimum"], ib["minimum"]) >= -tol
            dw = wb - wa
            cat = "unchanged" if abs(ia["minimum"] - ib["minimum"]) <= tol and abs(ia["maximum"] - ib["maximum"]) <= tol \
                else ("disjoint" if not overlap else "narrowed" if dw < -tol else "widened" if dw > tol else "shifted")
            rows.append({"id": rid, "aMin": ia["minimum"], "aMax": ia["maximum"], "bMin": ib["minimum"], "bMax": ib["maximum"],
                         "aWidth": num(wa), "bWidth": num(wb), "deltaWidth": num(dw), "absDeltaWidth": num(abs(dw)),
                         "overlap": overlap, "category": cat})
        out.update({"kind": "fva", "reactions": rows, "counts": _counts(rows)})
        return out
    if a.reaction_fluxes is None or b.reaction_fluxes is None:
        raise ScienceError("Missing flux vectors", "Both results need reaction fluxes.")
    reactions = _compare_vectors(a.reaction_fluxes, b.reaction_fluxes, tol, pseudo)
    metabolites = _compare_vectors(a.metabolite_turnover or {}, b.metabolite_turnover or {}, tol, pseudo) \
        if a.metabolite_turnover and b.metabolite_turnover else []
    exchanges = []
    ea, eb = a.exchanges or {}, b.exchanges or {}
    for rid in dict.fromkeys([*ea.keys(), *eb.keys()]):
        xa, xb = ea.get(rid) or {}, eb.get(rid) or {}
        row = _row(rid, xa.get("flux"), xb.get("flux"), tol, pseudo)
        net_a = (xa.get("uptake") or 0) - (xa.get("secretion") or 0)
        net_b = (xb.get("uptake") or 0) - (xb.get("secretion") or 0)
        if row["category"] == "reversal":
            row["switch"] = "uptake → secretion" if net_a > 0 else "secretion → uptake"
        row.update({"metabolite": xa.get("metabolite") or xb.get("metabolite"), "kind": xa.get("kind") or xb.get("kind"),
                    "uptakeA": xa.get("uptake"), "uptakeB": xb.get("uptake"),
                    "secretionA": xa.get("secretion"), "secretionB": xb.get("secretion"),
                    "deltaUptake": num((xb.get("uptake") or 0) - (xa.get("uptake") or 0)),
                    "deltaSecretion": num((xb.get("secretion") or 0) - (xa.get("secretion") or 0)),
                    "netA": num(net_a), "netB": num(net_b)})
        exchanges.append(row)
    out.update({"kind": "flux", "reactions": reactions, "metabolites": metabolites, "exchanges": exchanges,
                "counts": _counts(reactions),
                "objective": {"a": a.objective_value, "b": b.objective_value}})
    return out


def explain_turnover(entry, met_id: str, fa: dict, fb: dict, tol: float) -> dict:
    """Per-reaction contributions 0.5·|S·v| to a metabolite's turnover in A and B (descriptive, not causal)."""
    model = entry.model
    if met_id not in model.metabolites:
        raise ScienceError("Unknown metabolite", met_id, status=404)
    met = model.metabolites.get_by_id(met_id)

    def role(c, v):
        p = c * v
        return "produces" if p > tol else "consumes" if p < -tol else "inactive"

    rows = []
    for r in met.reactions:
        c = float(r.metabolites[met])
        va, vb = fa.get(r.id) or 0.0, fb.get(r.id) or 0.0
        ca, cb = 0.5 * abs(c * va), 0.5 * abs(c * vb)
        rows.append({"reaction": r.id, "name": r.name or "", "coefficient": c, "fluxA": num(va), "fluxB": num(vb),
                     "contributionA": num(ca), "contributionB": num(cb), "delta": num(cb - ca),
                     "roleA": role(c, va), "roleB": role(c, vb), "category": classify(va, vb, tol)})
    rows.sort(key=lambda x: -abs(x["delta"] or 0))
    ta = sum(x["contributionA"] or 0 for x in rows)
    tb = sum(x["contributionB"] or 0 for x in rows)
    return {"metabolite": met_id, "name": met.name or met_id, "turnoverA": num(ta), "turnoverB": num(tb),
            "delta": num(tb - ta), "rows": rows,
            "note": "Flux contributions to the turnover change. Descriptive decomposition — not a causal inference."}
