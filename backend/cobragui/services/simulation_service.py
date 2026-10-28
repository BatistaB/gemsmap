"""FBA, pFBA, loopless FBA and FVA with COBRApy, returned as self-describing SimulationResult dicts.

Scientific rules enforced here:
- fluxes are returned only when the solver status is optimal (never zeros for a failed solve);
- objectiveValue is always the value of the biological objective (Σ c·v); for pFBA the minimized
  total flux is reported separately in metadata.totalFlux;
- FVA returns intervals only. No midpoint is computed or treated as a flux distribution;
- flux sampling (COBRApy OptGP / ACHR) returns the sampled flux distributions and their per-reaction
  statistics; samples that fail COBRApy's validation (bounds, mass balance) are counted and dropped.
  Exchanges are derived from the mean flux vector (a convex combination of feasible samples, hence
  feasible itself); metabolite turnover is not, because |S·v| is not linear in v. The mean is never
  presented as an FBA flux distribution (reactionFluxes stays empty);
- metabolite turnover = 0.5 · Σ_j |S_ij · v_j|, a derived proxy computed from one flux vector.

Runs can be cancelled. FVA is computed by COBRApy in chunks of reactions (each chunk is a regular
flux_variability_analysis call with the same constraints), so it reports progress and stops between
chunks; an FVA stopped with "keep" returns only the intervals that were fully computed. A single
FBA/pFBA/loopless solve cannot be interrupted inside the solver: a cancelled run is discarded when
the solver returns.
"""
import math
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import cobra
from cobra.exceptions import OptimizationError
from cobra.flux_analysis import flux_variability_analysis, pfba
from cobra.flux_analysis.loopless import loopless_solution

from ..errors import ScienceError, num
from ..schemas import SimulationRequest
from . import model_service as ms

METHOD_LABEL = {"fba": "FBA", "pfba": "pFBA", "loopless": "Loopless FBA", "fva": "FVA", "sampling": "Flux sampling"}


# ----------------------------------------------------------------------------- jobs (progress + cancel)
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def job_register(job_id: Optional[str]) -> None:
    if job_id:
        with _jobs_lock:
            _jobs.setdefault(job_id, {"done": 0, "total": 0, "phase": "queued", "cancel": False, "keep": False})


def job_finish(job_id: Optional[str]) -> None:
    if job_id:
        with _jobs_lock:
            _jobs.pop(job_id, None)


def job_status(job_id: str) -> Optional[dict]:
    with _jobs_lock:
        j = _jobs.get(job_id)
        return {k: j[k] for k in ("done", "total", "phase", "cancel")} if j else None


def job_cancel(job_id: str, keep: bool) -> bool:
    with _jobs_lock:
        j = _jobs.get(job_id)
        if not j:
            return False
        j["cancel"], j["keep"] = True, keep
        return True


def _job(job_id: Optional[str]) -> Optional[dict]:
    with _jobs_lock:
        return _jobs.get(job_id) if job_id else None


def _cancelled_error() -> ScienceError:
    return ScienceError("Simulation cancelled", "The run was stopped before it finished; nothing was saved.",
                        status=409, detail={"cancelled": True})


def _fva_chunk_size(n: int, processes: int, pfba_factor: Optional[float]) -> int:
    """Reactions per COBRApy FVA call. Every call re-solves the optimum (and pFBA with a pFBA factor)
    and, with processes > 1, starts a worker pool, so chunks are larger in those cases."""
    parts = 6 if processes > 1 else 40 if pfba_factor else 100
    return max(10, math.ceil(n / parts))


def normalize_status(raw: Optional[str]) -> str:
    s = str(raw or "undefined").lower()
    if s == "optimal":
        return "optimal"
    if "infeasible" in s and "unbounded" in s:
        return "infeasible_or_unbounded"
    if "infeasible" in s:
        return "infeasible"
    if "unbounded" in s:
        return "unbounded"
    if s == "error":
        return "error"
    return "undefined"


def metabolite_turnover(model: cobra.Model, fluxes: dict[str, float]) -> dict[str, float]:
    acc = {m.id: 0.0 for m in model.metabolites}
    for r in model.reactions:
        v = fluxes.get(r.id) or 0.0
        if v == 0.0:
            continue
        for m, c in r.metabolites.items():
            acc[m.id] += abs(c * v)
    return {k: 0.5 * v for k, v in acc.items()}


def exchange_fluxes(model: cobra.Model, fluxes: dict[str, float], kinds: dict[str, str]) -> dict[str, dict]:
    out = {}
    for r in model.boundary:
        met, coef = ms.boundary_metabolite(r)
        v = fluxes.get(r.id) or 0.0
        imported = coef * v  # > 0: the metabolite enters the system
        out[r.id] = {"metabolite": met, "kind": kinds.get(r.id, "exchange"), "flux": v,
                     "uptake": max(0.0, imported), "secretion": max(0.0, -imported)}
    return out


def exchange_intervals(model: cobra.Model, fva: dict[str, dict], kinds: dict[str, str]) -> dict[str, dict]:
    out = {}
    for r in model.boundary:
        iv = fva.get(r.id)
        if not iv or iv["minimum"] is None or iv["maximum"] is None:
            continue
        met, coef = ms.boundary_metabolite(r)
        a, b = coef * iv["minimum"], coef * iv["maximum"]
        out[r.id] = {"metabolite": met, "kind": kinds.get(r.id, "exchange"),
                     "fluxMin": iv["minimum"], "fluxMax": iv["maximum"],
                     "uptakeMax": max(0.0, a, b), "secretionMax": max(0.0, -min(a, b))}
    return out


def derive_from_fluxes(entry, fluxes: dict) -> dict:
    """Turnover and exchanges for an imported flux vector, using the loaded model's stoichiometry.

    Only reaction ids present in the model are used; the caller decides whether the vector belongs
    to this model (the UI only offers this when nearly all ids match).
    """
    model = entry.model
    known = {k: float(v) for k, v in fluxes.items() if v is not None and k in model.reactions and math.isfinite(v)}
    kinds = ms.boundary_kinds(model)
    return {
        "metaboliteTurnover": {k: num(v) for k, v in metabolite_turnover(model, known).items()},
        "exchanges": exchange_fluxes(model, known, kinds),
        "matched": len(known), "total": len(fluxes),
        "model": {"filename": entry.filename, "checksum": entry.checksum},
    }


def _diagnostics(status: str, model: cobra.Model, entry, req: SimulationRequest) -> list[str]:
    if status == "optimal":
        return []
    changed = ms.bound_changes(entry, req.state)
    if status in ("infeasible", "infeasible_or_unbounded"):
        try:
            open_uptakes = len(model.medium)
        except Exception:  # noqa: BLE001
            open_uptakes = None
        forced = [r.id for r in model.reactions if r.lower_bound > 0 or r.upper_bound < 0]
        hints = [
            "Medium: are the essential substrates available?"
            + (f" ({open_uptakes} exchange reactions currently allow uptake)" if open_uptakes is not None else ""),
            "Objective: can the objective reaction carry flux with these constraints?",
        ]
        if changed:
            hints.append(f"Bounds: {len(changed)} reaction(s) differ from the model file — "
                         + ", ".join(c["reaction"] for c in changed[:6]) + ("…" if len(changed) > 6 else ""))
        if forced:
            hints.append(f"Forced fluxes: {len(forced)} reaction(s) must carry non-zero flux (e.g. maintenance) — "
                         + ", ".join(forced[:6]) + ("…" if len(forced) > 6 else ""))
        return hints
    if status == "unbounded":
        return ["The objective can grow without limit: look for objective-path reactions with infinite (∞) bounds,",
                "or an uptake left unbounded in the medium."]
    return ["The solver did not return an optimal solution. See the technical details."]


def _objective_value(objective: dict[str, float], fluxes: dict[str, float]) -> float:
    return sum(c * fluxes.get(rid, 0.0) for rid, c in objective.items())


def _objective_label(objective: dict[str, float]) -> str:
    if not objective:
        return "no objective"
    if len(objective) == 1:
        return next(iter(objective))
    return f"{len(objective)}-term objective"


def simulate(entry, method: str, req: SimulationRequest) -> dict:
    if method not in METHOD_LABEL:
        raise ScienceError("Unknown method", method, status=404, hints=list(METHOD_LABEL.values()))
    state, params = req.state, req.params
    job = _job(req.job_id)
    if job and job["cancel"]:
        raise _cancelled_error()
    if job:
        job["phase"] = "solving"
    kinds = ms.boundary_kinds(entry.model)
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    with ms.applied(entry, state) as model:
        objective = ms.objective_coefficients(model)
        direction = model.objective_direction
        if not objective:
            raise ScienceError("No objective defined", "The model state has an empty objective.", status=422,
                               hints=["Open the objective editor and choose at least one reaction."])
        try:
            medium = {k: num(v) for k, v in model.medium.items()}
        except Exception:  # noqa: BLE001
            medium = {}
        fluxes: Optional[dict[str, float]] = None
        fva: Optional[dict[str, dict]] = None
        objective_value: Optional[float] = None
        status_raw: Optional[str] = None
        message: Optional[str] = None
        extra: dict = {}
        partial: Optional[dict] = None
        sampling: Optional[dict] = None
        try:
            if method == "fba":
                sol = model.optimize(raise_error=False)
                status_raw = sol.status
                if sol.status == "optimal":
                    fluxes = sol.fluxes.to_dict()
            else:
                # Establish feasibility first so a failed solve is reported with its real status.
                opt = model.slim_optimize(error_value=None)
                status_raw = "optimal"
                if method == "pfba":
                    sol = pfba(model, fraction_of_optimum=params.fraction_of_optimum)
                    status_raw = sol.status
                    if sol.status == "optimal":
                        fluxes = sol.fluxes.to_dict()
                        extra["totalFlux"] = num(sol.objective_value)
                elif method == "loopless":
                    sol = loopless_solution(model)
                    status_raw = sol.status
                    if sol.status == "optimal":
                        fluxes = sol.fluxes.to_dict()
                elif method == "fva":
                    rxns = params.reactions
                    if rxns:
                        missing = [r for r in rxns if r not in model.reactions]
                        if missing:
                            raise ScienceError("Unknown reactions in FVA subset", ", ".join(missing[:8]), status=422)
                    ids = list(rxns) if rxns else [r.id for r in model.reactions]
                    size = _fva_chunk_size(len(ids), params.processes, params.pfba_factor)
                    if job:
                        job["total"], job["phase"] = len(ids), "fva"
                    fva = {}
                    for i in range(0, len(ids), size):
                        if job and job["cancel"]:
                            if job["keep"] and fva:
                                partial = {"done": len(fva), "total": len(ids)}
                                break
                            raise _cancelled_error()
                        df = flux_variability_analysis(
                            model, reaction_list=ids[i:i + size], loopless=params.loopless,
                            fraction_of_optimum=params.fraction_of_optimum, pfba_factor=params.pfba_factor,
                            processes=min(params.processes, size))
                        fva.update({rid: {"minimum": num(row["minimum"]), "maximum": num(row["maximum"])}
                                    for rid, row in df.iterrows()})
                        if job:
                            job["done"] = len(fva)
                    objective_value = num(opt)
                elif method == "sampling":
                    sampling, partial = _sample(model, params, job)
                    extra["sampling"] = sampling["meta"]
        except ScienceError:
            raise
        except OptimizationError as e:
            status_raw = model.solver.status
            message = str(e)
        except Exception as e:  # noqa: BLE001 - reported as an explicit 'error' status, never as fluxes
            status_raw = "error"
            message = f"{type(e).__name__}: {e}"
        if job and job["cancel"] and partial is None:
            raise _cancelled_error()  # a single solve cannot be interrupted: its answer is discarded
        if fluxes is not None and any(v is None or not math.isfinite(v) for v in fluxes.values()):
            fluxes, status_raw, message = None, "undefined", "The solver returned non-finite fluxes."
        status = normalize_status(status_raw)
        if status != "optimal":
            fluxes, fva, objective_value, sampling = None, None, None, None
        diagnostics = _diagnostics(status, model, entry, req)
        turnover = exchanges = None
        if fluxes is not None:
            objective_value = num(_objective_value(objective, fluxes))
            turnover = {k: num(v) for k, v in metabolite_turnover(model, fluxes).items()}
            exchanges = exchange_fluxes(model, fluxes, kinds)
            fluxes = {k: num(v) for k, v in fluxes.items()}
        elif fva is not None:
            exchanges = exchange_intervals(model, fva, kinds)
        elif sampling is not None:
            mean = {k: v["mean"] for k, v in sampling["summary"].items()}
            objective_value = num(_objective_value(objective, mean))  # = mean objective over the samples (linear)
            exchanges = exchange_fluxes(model, mean, kinds)
        elapsed = time.perf_counter() - t0
        label = METHOD_LABEL[method]
        metadata = {
            "model": {"id": entry.id, "modelId": model.id or "", "name": model.name or "", "filename": entry.filename,
                      "checksum": entry.checksum, "format": entry.fmt},
            "state": {"id": state.id, "name": state.name or "Base model"},
            "method": method, "methodLabel": label,
            "solver": ms.solver_name(model), "cobraVersion": cobra.__version__,
            "objective": {"coefficients": objective, "direction": direction},
            "objectiveIsModelDefault": state.objective is None,
            "medium": medium,
            "boundChanges": ms.bound_changes(entry, state),
            "parameters": _params_for(method, params),
            "timestamp": started.isoformat(),
            "elapsedSeconds": round(elapsed, 4),
            "solverStatusRaw": str(status_raw),
            "message": message,
            "tolerance": num(getattr(model, "tolerance", None)),
            **_edit_provenance(entry),
            **extra,
        }
        if partial:
            metadata["partial"] = partial
            if method == "fva":
                metadata["parameters"]["reactionSubset"] = partial["done"]
    return {
        "id": uuid.uuid4().hex[:12],
        "name": (req.name or f"{label} · {state.name or 'Base model'} · {_objective_label(objective)}")
        + (f" (stopped at {partial['done']}/{partial['total']}{' samples' if method == 'sampling' else ''})" if partial else ""),
        "modelId": entry.id,
        "modelStateId": state.id,
        "method": method,
        "solverStatus": status,
        "objectiveValue": objective_value,
        "reactionFluxes": fluxes,
        "fva": fva,
        "metaboliteTurnover": turnover,
        "exchanges": exchanges,
        "samples": {k: sampling[k] for k in ("reactions", "constant", "summary")} if sampling else None,
        "diagnostics": diagnostics,
        "metadata": metadata,
    }


def _edit_provenance(entry) -> dict:
    """Results computed on a structurally edited model record it (the file checksum alone would hide it)."""
    from . import edit_service
    log = edit_service.log_of(entry)
    if not log["applied"]:
        return {}
    return {"modelEdits": {"count": len(log["applied"]), "hash": edit_service.log_hash(log),
                           "labels": [t["label"] for t in log["applied"][-20:]]}}


def _params_for(method: str, p) -> dict:
    if method == "pfba":
        return {"fractionOfOptimum": p.fraction_of_optimum}
    if method == "fva":
        return {"fractionOfOptimum": p.fraction_of_optimum, "loopless": p.loopless, "pfbaFactor": p.pfba_factor,
                "reactionSubset": len(p.reactions) if p.reactions else None, "processes": p.processes}
    if method == "sampling":
        return {"samples": p.samples, "sampler": "OptGP" if p.sampler == "optgp" else "ACHR", "thinning": p.thinning,
                "processes": p.processes if p.sampler == "optgp" else 1, "seed": p.seed,
                "objectiveFraction": p.objective_fraction}
    return {}


def _sig(x: float) -> float:
    """Sample values rounded to 6 significant digits (keeps result files small; far below solver tolerance)."""
    return float(f"{x:.6g}")


def _sample(model: cobra.Model, p, job) -> tuple[dict, Optional[dict]]:
    """Hit-and-run sampling with progress and cancel: one sampler (one warmup), samples drawn in batches."""
    import pandas as pd
    from cobra.sampling import ACHRSampler, OptGPSampler
    from cobra.util.solver import fix_objective_as_constraint
    if p.objective_fraction is not None:
        fix_objective_as_constraint(model, fraction=p.objective_fraction)  # reverted with the state context
    if job:
        job["phase"], job["total"], job["done"] = "warmup", p.samples, 0
    t0 = time.perf_counter()
    if p.sampler == "achr":
        sampler = ACHRSampler(model, thinning=p.thinning, seed=p.seed)
    else:
        sampler = OptGPSampler(model, thinning=p.thinning, processes=p.processes, seed=p.seed)
    warmup = time.perf_counter() - t0
    if job:
        job["phase"] = "sampling"
    batch = max(1, min(p.samples, max(50, math.ceil(p.samples / 20))))
    frames, drawn, partial = [], 0, None
    while drawn < p.samples:
        if job and job["cancel"]:
            if job["keep"] and drawn:
                partial = {"done": drawn, "total": p.samples}
                break
            raise _cancelled_error()
        df = sampler.sample(min(batch, p.samples - drawn))
        frames.append(df)
        drawn += len(df)
        if job:
            job["done"] = min(drawn, p.samples)
    allf = pd.concat(frames, ignore_index=True).iloc[:p.samples]
    codes = list(sampler.validate(allf))
    valid = allf[[c == "v" for c in codes]]
    if not len(valid):
        raise ScienceError("No valid flux sample", f"All {len(allf)} samples failed COBRApy's validation.", status=422,
                           hints=["Check that the model state is feasible (run FBA first).", "Try the OptGP sampler or a larger thinning."])
    reactions, constant, summary = {}, {}, {}
    for rid in valid.columns:
        col = valid[rid].to_numpy(dtype=float)
        lo, hi = float(col.min()), float(col.max())
        q = [float(x) for x in pd.Series(col).quantile([0.025, 0.25, 0.5, 0.75, 0.975])]
        summary[rid] = {"mean": num(float(col.mean())), "sd": num(float(col.std(ddof=1)) if len(col) > 1 else 0.0),
                        "median": num(q[2]), "q025": num(q[0]), "q25": num(q[1]), "q75": num(q[3]), "q975": num(q[4]),
                        "min": num(lo), "max": num(hi)}
        if hi - lo <= 1e-9 * max(1.0, abs(hi)):
            constant[rid] = num(float(col.mean()))  # the same value in every sample: stored once
        else:
            reactions[rid] = [_sig(x) for x in col]
    meta = {"n": int(len(valid)), "drawn": int(len(allf)), "invalid": int(len(allf) - len(valid)),
            "warmupSeconds": round(warmup, 3), "variable": len(reactions), "constant": len(constant)}
    return {"reactions": reactions, "constant": constant, "summary": summary, "meta": meta}, partial
