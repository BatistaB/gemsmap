"""Model import, validation, catalog (UI-facing description of the model) and state application."""
import hashlib
import io
import json
import logging
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

import cobra
from cobra.util.solver import linear_reaction_coefficients

from .. import registry
from ..errors import ScienceError, bound_in, num
from ..schemas import StateSpec
from . import bigg_service
from .search_service import SearchIndex

log = logging.getLogger("cobragui")

FORMAT_HINTS = ["SBML (.xml, .sbml)", "COBRA JSON (.json)", "MATLAB COBRA (.mat)"]


# ----------------------------------------------------------------------------- import

def detect_format(filename: str, data: bytes) -> str:
    n = filename.lower()
    if n.endswith((".xml", ".sbml")):
        return "sbml"
    if n.endswith(".mat"):
        return "mat"
    if n.endswith(".json"):
        return "json"
    head = data[:256].lstrip()
    if head.startswith(b"<"):
        return "sbml"
    if head.startswith(b"{"):
        return "json"
    if head.startswith(b"MATLAB"):
        return "mat"
    raise ScienceError("Unsupported model format", f"Could not recognise '{filename}'.", hints=FORMAT_HINTS)


class _Capture(logging.Handler):
    """Collect COBRApy/optlang log messages emitted while reading a model (shown as import notes)."""

    def __init__(self):
        super().__init__(logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record):
        self.messages.append(record.getMessage())


@contextmanager
def _captured_logs() -> Iterator[_Capture]:
    h = _Capture()
    loggers = [logging.getLogger(n) for n in ("cobra", "optlang")]
    for lg in loggers:
        lg.addHandler(h)
    try:
        yield h
    finally:
        for lg in loggers:
            lg.removeHandler(h)


def _read_model(fmt: str, data: bytes, path: Path) -> tuple[cobra.Model, dict]:
    validation: dict = {"format": fmt, "categories": {}, "loader": []}
    with _captured_logs() as cap:
        try:
            if fmt == "sbml":
                # Pass the document as a string: libSBML cannot open some non-ASCII Windows paths.
                text = data.decode("utf-8", errors="replace")
                model, errors = cobra.io.validate_sbml_model(text)
                for cat, msgs in (errors or {}).items():
                    if msgs:
                        validation["categories"][cat] = {"count": len(msgs), "messages": [str(m) for m in msgs[:40]]}
                if model is None:
                    fatal = [m for c in ("SBML_FATAL", "COBRA_FATAL", "SBML_ERROR", "COBRA_ERROR")
                             for m in (errors or {}).get(c, [])]
                    raise ScienceError("SBML model could not be read", str(fatal[0]) if fatal else "",
                                       detail=validation["categories"])
            elif fmt == "json":
                model = cobra.io.load_json_model(io.StringIO(data.decode("utf-8", errors="replace")))
            elif fmt == "mat":
                model = cobra.io.load_matlab_model(str(path))
            else:
                raise ScienceError("Unsupported model format", fmt, hints=FORMAT_HINTS)
        except ScienceError:
            raise
        except Exception as e:  # noqa: BLE001 - surfaced to the user with the parser message
            raise ScienceError(f"Could not read the {fmt.upper()} model", str(e), hints=FORMAT_HINTS,
                               detail=type(e).__name__) from e
    validation["loader"] = cap.messages[:60]
    return model, validation


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:80] or "model"


def import_model(filename: str, data: bytes) -> registry.ModelEntry:
    if not data:
        raise ScienceError("Empty file", f"'{filename}' contains no data.")
    checksum = hashlib.sha256(data).hexdigest()
    mid = checksum[:16]
    existing = registry.get(mid)
    if existing:
        return existing
    fmt = detect_format(filename, data)
    if fmt == "json":
        # a model exported by BiGG: normalized IDs, annotations completed from the local BiGG tables
        data, report = bigg_service.normalize_bigg_json(data)
        if report:
            log.info("BiGG export %s: %s", filename, report)
    path = registry.cache_dir() / f"{mid}__{_safe_name(filename)}"
    if not path.exists():
        path.write_bytes(data)
    model, validation = _read_model(fmt, data, path)
    _write_fast_copy(mid, model, validation)
    entry = _make_entry(mid, checksum, filename, fmt, model, validation)
    registry.put(entry)
    return entry


def _write_fast_copy(mid: str, model: cobra.Model, validation: dict) -> None:
    """COBRA-JSON copy + validation notes: reloading after a backend restart skips SBML parsing."""
    try:
        d = registry.cache_dir()
        cobra.io.save_json_model(model, str(d / f"{mid}.fast.json"))
        (d / f"{mid}.validation.json").write_text(json.dumps(validation), encoding="utf-8")
    except Exception as e:  # noqa: BLE001 - only an optimization
        log.warning("could not write fast cache for %s: %s", mid, e)


def _load_fast_copy(mid: str, checksum: str, filename: str, fmt: str) -> Optional[registry.ModelEntry]:
    d = registry.cache_dir()
    fast, val = d / f"{mid}.fast.json", d / f"{mid}.validation.json"
    if not fast.exists():
        return None
    try:
        model = cobra.io.load_json_model(str(fast))
        validation = json.loads(val.read_text(encoding="utf-8")) if val.exists() else {}
    except Exception:  # noqa: BLE001 - fall back to the original file
        return None
    entry = _make_entry(mid, checksum, filename, fmt, model, validation)
    registry.put(entry)
    return entry


_example_ids: dict[str, str] = {}


def import_example(name: str) -> registry.ModelEntry:
    """Models bundled with COBRApy (no download), e.g. 'textbook' = E. coli core."""
    known = _example_ids.get(name)
    if known and registry.get(known):
        return registry.get(known)
    try:
        model = cobra.io.load_model(name)
    except Exception as e:  # noqa: BLE001
        raise ScienceError("Example model unavailable", str(e)) from e
    buf = io.StringIO()
    cobra.io.save_json_model(model, buf)
    entry = import_model(f"{name}.json", buf.getvalue().encode("utf-8"))
    _example_ids[name] = entry.id
    return entry


def get_entry(model_id: str) -> registry.ModelEntry:
    entry = registry.get(model_id)
    if entry:
        return entry
    path = registry.cached_file(model_id)
    if not path:
        raise ScienceError("Model not loaded", "The backend has no copy of this model.", status=404,
                           hints=["Import the model file again."])
    data = path.read_bytes()
    filename = path.name.split("__", 1)[1] if "__" in path.name else path.name
    checksum = hashlib.sha256(data).hexdigest()
    fast = _load_fast_copy(model_id, checksum, filename, detect_format(filename, data))
    return fast or import_model(filename, data)


def _make_entry(mid, checksum, filename, fmt, model, validation) -> registry.ModelEntry:
    # metabolite curation saved for this file (annotation analysis) is part of the working model
    from . import annotation_service, edit_service
    saved = annotation_service.load_json(mid, "curation")
    if saved:
        annotation_service.apply_curation_to_model(model, saved)
    entry = registry.ModelEntry(
        id=mid, checksum=checksum, filename=filename, fmt=fmt, model=model,
        original_bounds={}, original_objective={}, original_direction="max", original_medium={},
        validation=validation,
    )
    # structural edits saved for this file (reactions / metabolites added, changed or removed)
    edit_service.replay(entry)
    set_baseline(entry)
    entry.search = SearchIndex(model)
    entry.catalog = build_catalog(entry)
    return entry


def set_baseline(entry: registry.ModelEntry) -> None:
    """The working model's own bounds, objective and medium (the 'model file' that states modify)."""
    m = entry.model
    entry.original_bounds = {r.id: (r.lower_bound, r.upper_bound) for r in m.reactions}
    entry.original_objective = objective_coefficients(m)
    entry.original_direction = m.objective_direction
    try:
        entry.original_medium = {k: float(v) for k, v in m.medium.items()}
    except Exception:  # noqa: BLE001 - models without identifiable exchanges
        entry.original_medium = {}


def load_base_model(mid: str, filename: str, fmt: str) -> cobra.Model:
    """The imported file as read (fast copy when available) with the metabolite curation — no edits."""
    from . import annotation_service
    fast = registry.cache_dir() / f"{mid}.fast.json"
    if fast.exists():
        model = cobra.io.load_json_model(str(fast))
    else:
        path = registry.cached_file(mid)
        if not path:
            raise ScienceError("Model not loaded", "The backend has no copy of this model.", status=404)
        model, _ = _read_model(fmt, path.read_bytes(), path)
    saved = annotation_service.load_json(mid, "curation")
    if saved:
        annotation_service.apply_curation_to_model(model, saved)
    return model


def search_index(entry: registry.ModelEntry) -> SearchIndex:
    if entry.search is None:  # dropped after a structural edit
        entry.search = SearchIndex(entry.model)
    return entry.search


def known_compartments(model: cobra.Model) -> dict[str, str]:
    """Compartments with metabolites plus compartments only named in the model (created explicitly)."""
    out = {k: (v or k) for k, v in (getattr(model, "_compartments", None) or {}).items()}
    for k, v in model.compartments.items():
        out[k] = v or out.get(k) or k
    return out


# ----------------------------------------------------------------------------- helpers

def objective_coefficients(model: cobra.Model) -> dict[str, float]:
    try:
        return {r.id: float(c) for r, c in linear_reaction_coefficients(model).items() if c}
    except Exception:  # noqa: BLE001
        return {}


def solver_name(model: cobra.Model) -> str:
    name = model.solver.interface.__name__.split(".")[-1].replace("_interface", "")
    return name.upper()


def boundary_kinds(model: cobra.Model) -> dict[str, str]:
    """Reaction id -> 'exchange' | 'demand' | 'sink' for boundary reactions (COBRApy definitions)."""
    out: dict[str, str] = {}
    for attr, kind in (("sinks", "sink"), ("demands", "demand"), ("exchanges", "exchange")):
        try:
            for r in getattr(model, attr):
                out[r.id] = kind
        except Exception:  # noqa: BLE001 - external compartment could not be identified
            pass
    for r in model.boundary:
        out.setdefault(r.id, "exchange")
    return out


def boundary_metabolite(rxn) -> tuple[Optional[str], float]:
    """The single metabolite of a boundary reaction and its coefficient."""
    for m, c in rxn.metabolites.items():
        return m.id, float(c)
    return None, 0.0


def _ec(annotation) -> list[str]:
    v = (annotation or {}).get("ec-code") or []
    return [str(x) for x in (v if isinstance(v, (list, tuple)) else [v])]


def _notes(notes) -> dict:
    """Free-text notes as strings (shown and edited in the structural editor)."""
    return {str(k): (", ".join(str(x) for x in v) if isinstance(v, (list, tuple)) else str(v)) for k, v in (notes or {}).items()}


def _ann(annotation) -> dict:
    out = {}
    for k, v in (annotation or {}).items():
        out[str(k)] = [str(x) for x in v] if isinstance(v, (list, tuple)) else str(v)
    return out


# ----------------------------------------------------------------------------- catalog

def build_catalog(entry: registry.ModelEntry) -> dict:
    """Everything the UI needs to browse the model. Plain data — never COBRApy objects."""
    m = entry.model
    kinds = boundary_kinds(m)
    obj = entry.original_objective
    reactions = []
    counts = {"exchange": 0, "demand": 0, "sink": 0, "transport": 0, "internal": 0}
    reversible = blocked = 0
    subsystems: set[str] = set()
    for r in m.reactions:
        comps = sorted({met.compartment for met in r.metabolites if met.compartment})
        if r.id in kinds:
            t = kinds[r.id]
        elif len(comps) > 1:
            t = "transport"
        else:
            t = "internal"
        counts[t] += 1
        reversible += 1 if r.reversibility else 0
        blocked += 1 if r.lower_bound == 0 and r.upper_bound == 0 else 0
        if r.subsystem:
            subsystems.add(r.subsystem)
        bmet, bcoef = boundary_metabolite(r) if r.id in kinds else (None, 0.0)
        reactions.append({
            "id": r.id,
            "name": r.name or "",
            "equation": r.build_reaction_string(),
            "equationNames": r.build_reaction_string(use_metabolite_names=True),
            "stoichiometry": {met.id: float(c) for met, c in r.metabolites.items()},
            "lb": num(r.lower_bound), "ub": num(r.upper_bound),
            "reversible": bool(r.reversibility),
            "subsystem": r.subsystem or None,
            "gpr": r.gene_reaction_rule or None,
            "genes": [g.id for g in r.genes],
            "ec": _ec(r.annotation),
            "annotation": _ann(r.annotation), "notes": _notes(r.notes),
            "type": t,
            "compartments": comps,
            "objectiveCoefficient": obj.get(r.id, 0.0),
            "boundaryMetabolite": bmet,
            "boundaryCoefficient": bcoef if bmet else None,
        })
    metabolites = [{
        "id": met.id, "name": met.name or "", "formula": met.formula or None,
        "charge": met.charge if isinstance(met.charge, (int, float)) else None,
        "compartment": met.compartment or "", "annotation": _ann(met.annotation), "notes": _notes(met.notes),
        "reactionCount": len(met.reactions),
    } for met in m.metabolites]
    genes = [{
        "id": g.id, "name": g.name or "", "annotation": _ann(g.annotation),
        "reactions": [r.id for r in g.reactions],
    } for g in m.genes]
    compartments = known_compartments(m)
    summary = {
        "reactions": len(m.reactions), "metabolites": len(m.metabolites), "genes": len(m.genes),
        "compartments": len(compartments), "subsystems": len(subsystems),
        **counts,
        "reversible": reversible, "irreversible": len(m.reactions) - reversible, "blockedByBounds": blocked,
        "objective": {"coefficients": obj, "direction": entry.original_direction},
        "solver": solver_name(m), "cobraVersion": cobra.__version__,
        "mediumSize": len(entry.original_medium),
    }
    return {
        "id": entry.id, "checksum": entry.checksum, "filename": entry.filename, "format": entry.fmt,
        "modelId": m.id or "", "name": m.name or m.id or entry.filename,
        "summary": summary, "compartments": compartments,
        "metabolites": metabolites, "reactions": reactions, "genes": genes,
        "medium": entry.original_medium,
        "warnings": model_warnings(entry, kinds),
        "validation": entry.validation,
    }


def model_warnings(entry: registry.ModelEntry, kinds: dict[str, str]) -> list[dict]:
    """Non-blocking quality notes, each with the ids involved so the UI can make them inspectable."""
    m = entry.model
    out: list[dict] = []

    def add(level, code, title, ids, detail=""):
        if ids:
            out.append({"level": level, "code": code, "title": title, "count": len(ids), "ids": ids[:5000], "detail": detail})

    if not entry.original_objective:
        out.append({"level": "error", "code": "no-objective", "title": "No objective defined in the model file",
                    "count": 1, "ids": [], "detail": "Choose an objective before running FBA-based methods."})
    add("warning", "disconnected-metabolite", "metabolites are not used by any reaction",
        [x.id for x in m.metabolites if not x.reactions])
    can_prod: set[str] = set()
    can_cons: set[str] = set()
    for r in m.reactions:
        for met, c in r.metabolites.items():
            if (c > 0 and r.upper_bound > 0) or (c < 0 and r.lower_bound < 0):
                can_prod.add(met.id)
            if (c < 0 and r.upper_bound > 0) or (c > 0 and r.lower_bound < 0):
                can_cons.add(met.id)
    add("info", "dead-end", "dead-end metabolites (can only be produced or only consumed under current bounds)",
        [x.id for x in m.metabolites if x.reactions and (x.id not in can_prod or x.id not in can_cons)])
    add("info", "no-gpr", "non-boundary reactions have no gene association",
        [r.id for r in m.reactions if r.id not in kinds and not r.gene_reaction_rule])
    add("info", "blocked-bounds", "reactions are blocked by their bounds (lower = upper = 0)",
        [r.id for r in m.reactions if r.lower_bound == 0 and r.upper_bound == 0])
    add("info", "no-formula", "metabolites have no chemical formula", [x.id for x in m.metabolites if not x.formula])
    unbalanced = []
    for r in m.reactions:
        if r.id in kinds or r.id in entry.original_objective:
            continue
        if not all(x.formula for x in r.metabolites):
            continue
        try:
            bal = r.check_mass_balance()
        except Exception:  # noqa: BLE001 - unparsable formula
            continue
        if any(k != "charge" and abs(v) > 1e-6 for k, v in bal.items()):
            unbalanced.append(r.id)
    add("warning", "mass-unbalanced", "reactions are elementally unbalanced", unbalanced,
        "Boundary and objective (biomass) reactions are excluded; metabolites without formula are skipped.")
    cats = (entry.validation or {}).get("categories", {})
    for cat, info in cats.items():
        if cat in ("SBML_ERROR", "SBML_SCHEMA_ERROR", "COBRA_ERROR"):
            level = "warning"
        elif cat in ("SBML_FATAL", "COBRA_FATAL"):
            level = "error"
        else:
            continue
        out.append({"level": level, "code": f"sbml-{cat.lower()}", "title": f"{cat.replace('_', ' ').lower()} messages",
                    "count": info["count"], "ids": [], "detail": "\n".join(info["messages"][:15])})
    return out


# ----------------------------------------------------------------------------- states

def apply_state(model: cobra.Model, state: StateSpec) -> None:
    errors = []
    for rid, (lb, ub) in (state.bounds or {}).items():
        if rid not in model.reactions:
            errors.append(f"unknown reaction '{rid}'")
            continue
        lo, hi = bound_in(lb, "lower"), bound_in(ub, "upper")
        if lo > hi:
            errors.append(f"{rid}: lower bound {lo:g} is greater than upper bound {hi:g}")
            continue
        model.reactions.get_by_id(rid).bounds = (lo, hi)
    if state.objective is not None:
        coefs = {}
        for rid, c in state.objective.coefficients.items():
            if rid not in model.reactions:
                errors.append(f"objective reaction '{rid}' is not in the model")
            elif c:
                coefs[model.reactions.get_by_id(rid)] = float(c)
        if not errors:
            model.objective = coefs
            model.objective_direction = state.objective.direction
    if errors:
        raise ScienceError("Invalid model state", "; ".join(errors[:6]), status=422,
                           hints=["Check edited bounds and the objective."], detail=errors)


@contextmanager
def applied(entry: registry.ModelEntry, state: Optional[StateSpec]) -> Iterator[cobra.Model]:
    """Yield the model with a state applied; COBRApy reverts every change on exit."""
    with entry.lock:
        model = entry.model
        with model:
            if state is not None:
                apply_state(model, state)
            yield model


def bound_changes(entry: registry.ModelEntry, state: StateSpec) -> list[dict]:
    out = []
    for rid, (lb, ub) in (state.bounds or {}).items():
        orig = entry.original_bounds.get(rid)
        if orig is None:
            continue
        cur = (bound_in(lb, "lower"), bound_in(ub, "upper"))
        if cur != orig:
            out.append({"reaction": rid, "original": [num(orig[0]), num(orig[1])], "current": [num(cur[0]), num(cur[1])]})
    return out
