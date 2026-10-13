"""Medium = uptake limits of exchange reactions, read and written through COBRApy's `Model.medium`.

Edits are returned as bound changes so the frontend stores them in the model state like any other
constraint; the sign convention (X <=> vs <=> X) is COBRApy's, never re-derived in the UI.
"""
import math
import re

from cobra.medium import minimal_medium

from ..errors import ScienceError, num
from ..schemas import StateSpec
from . import model_service as ms


def _uptake_secretion(coef: float, lb: float, ub: float) -> tuple[float, float]:
    """Max uptake / max secretion allowed by the bounds of a boundary reaction."""
    if coef < 0:  # X <=>   : negative flux imports X
        return max(0.0, -lb), max(0.0, ub)
    return max(0.0, ub), max(0.0, -lb)  # <=> X : positive flux imports X


def medium_table(entry, state: StateSpec) -> dict:
    kinds = ms.boundary_kinds(entry.model)
    with ms.applied(entry, state) as model:
        try:
            medium = dict(model.medium)
        except Exception:  # noqa: BLE001
            medium = {}
        rows = []
        for r in model.boundary:
            met_id, coef = ms.boundary_metabolite(r)
            met = model.metabolites.get_by_id(met_id) if met_id else None
            up, sec = _uptake_secretion(coef, r.lower_bound, r.upper_bound)
            olb, oub = entry.original_bounds[r.id]
            oup, osec = _uptake_secretion(coef, olb, oub)
            rows.append({
                "reaction": r.id, "reactionName": r.name or "", "kind": kinds.get(r.id, "exchange"),
                "metabolite": met_id, "metaboliteName": met.name if met else "", "formula": met.formula if met else None,
                "uptakeMax": num(up) if math.isfinite(up) else None, "secretionMax": num(sec) if math.isfinite(sec) else None,
                "uptakeUnbounded": not math.isfinite(up),
                "originalUptakeMax": num(oup), "originalSecretionMax": num(osec),
                "inMedium": r.id in medium,
                "lb": num(r.lower_bound), "ub": num(r.upper_bound),
            })
    rows.sort(key=lambda x: (not x["inMedium"], x["kind"] != "exchange", x["metaboliteName"].lower() or x["reaction"]))
    return {"medium": {k: num(v) for k, v in medium.items()}, "rows": rows}


def _apply_medium(model, new_medium: dict[str, float]) -> dict[str, list]:
    before = {r.id: r.bounds for r in model.boundary}
    for rid in new_medium:
        if rid not in model.reactions:
            raise ScienceError("Unknown exchange reaction", rid, status=422)
    model.medium = {k: float(v) for k, v in new_medium.items() if v and v > 0}
    return {r.id: [num(r.lower_bound), num(r.upper_bound)] for r in model.boundary if r.bounds != before[r.id]}


def set_medium(entry, state: StateSpec, medium: dict[str, float]) -> dict:
    neg = [k for k, v in medium.items() if v is not None and v < 0]
    if neg:
        raise ScienceError("Uptake limits must be ≥ 0", ", ".join(neg[:5]), status=422,
                           hints=["Enter the maximum uptake rate as a positive number (mmol gDW⁻¹ h⁻¹)."])
    with ms.applied(entry, state) as model:
        changes = _apply_medium(model, medium)
        result = {k: num(v) for k, v in model.medium.items()}
    return {"bounds": changes, "medium": result}


def _oxygen_exchanges(model) -> list[str]:
    out = []
    for r in model.exchanges:
        met_id, _ = ms.boundary_metabolite(r)
        if not met_id:
            continue
        met = model.metabolites.get_by_id(met_id)
        base = re.sub(r"(\[[a-z0-9]+\]|_[a-z][a-z0-9]?)$", "", met.id.replace("M_", "")).lower()
        if base in ("o2", "oxygen") or (met.formula or "") == "O2" or re.fullmatch(r"(di)?oxygen|o2", (met.name or "").strip(), re.I):
            out.append(r.id)
    return out


def apply_preset(entry, state: StateSpec, preset: str, rich_uptake: float, growth_fraction: float) -> dict:
    notes: list[str] = []
    with ms.applied(entry, state) as model:
        current = dict(model.medium)
        if preset == "original":
            new = dict(entry.original_medium)
            notes.append("Uptake limits restored from the model file.")
        elif preset == "rich":
            new = {r.id: max(rich_uptake, current.get(r.id, 0.0)) for r in model.exchanges}
            notes.append(f"Every exchange reaction allows uptake of at least {rich_uptake:g} mmol gDW⁻¹ h⁻¹.")
        elif preset == "anaerobic":
            o2 = _oxygen_exchanges(model)
            if not o2:
                raise ScienceError("No oxygen exchange found", "Could not identify an O2 exchange reaction in this model.",
                                   hints=["Set the oxygen uptake to 0 manually in the medium table."])
            new = {k: v for k, v in current.items() if k not in o2}
            notes.append(f"Oxygen uptake closed ({', '.join(o2)}).")
        elif preset == "minimal":
            opt = model.slim_optimize(error_value=None)
            if opt is None or not math.isfinite(opt) or opt <= 0:
                raise ScienceError("Cannot compute a minimal medium",
                                   "The objective cannot carry flux with the current state and medium.",
                                   hints=["Check the objective.", "Open more substrates first (e.g. the Rich preset)."])
            target = opt * growth_fraction
            mm = minimal_medium(model, target, minimize_components=False)
            if mm is None:
                raise ScienceError("Minimal medium problem is infeasible")
            new = {k: float(v) for k, v in mm.items() if v > 1e-9}
            notes.append(f"Minimal total uptake supporting {growth_fraction:.0%} of the current optimum "
                         f"({target:.4g}). Uptake limits are set to exactly those fluxes.")
        else:
            raise ScienceError("Unknown medium preset", preset, status=422)
        changes = _apply_medium(model, new)
        result = {k: num(v) for k, v in model.medium.items()}
    return {"bounds": changes, "medium": result, "notes": notes}
