"""Export simulation results (JSON with full provenance, CSV tables) and modified models."""
import csv
import io
import json
import tempfile
from pathlib import Path

import cobra

from ..errors import ScienceError
from ..schemas import ResultPayload, StateSpec
from . import annotation_service
from . import model_service as ms


def _provenance_lines(r: ResultPayload) -> list[str]:
    md = r.metadata or {}
    obj = (md.get("objective") or {})
    terms = " + ".join(f"{c:g}*{k}" for k, c in (obj.get("coefficients") or {}).items())
    model = md.get("model") or {}
    return [
        f"# result: {r.name}",
        f"# model: {model.get('filename', '')} (sha256 {str(model.get('checksum', ''))[:16]})",
        f"# state: {(md.get('state') or {}).get('name', '')}",
        f"# method: {md.get('methodLabel', r.method)}  solver: {md.get('solver', '')}  status: {r.solver_status}",
        f"# objective: {obj.get('direction', '')} {terms}  value: {r.objective_value}",
        f"# timestamp: {md.get('timestamp', '')}  cobrapy: {md.get('cobraVersion', '')}",
    ]


def result_file(r: ResultPayload, fmt: str, table: str) -> tuple[bytes, str, str]:
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in (r.name or "result"))[:60]
    if fmt == "json":
        body = {"format": "cobragui-result", "version": 1, **r.model_dump(by_alias=True)}
        return json.dumps(body, indent=1, allow_nan=False).encode(), f"{safe}.json", "application/json"
    buf = io.StringIO()
    buf.write("\n".join(_provenance_lines(r)) + "\n")
    w = csv.writer(buf, lineterminator="\n")
    if table == "fluxes":
        if r.reaction_fluxes is None:
            raise ScienceError("No flux vector in this result", "FVA results export as 'fva' intervals.")
        w.writerow(["reaction", "flux"])
        for k, v in r.reaction_fluxes.items():
            w.writerow([k, "" if v is None else repr(v)])
    elif table == "fva":
        if r.fva is None:
            raise ScienceError("This result has no FVA intervals")
        w.writerow(["reaction", "minimum", "maximum", "range"])
        for k, iv in r.fva.items():
            lo, hi = iv.get("minimum"), iv.get("maximum")
            w.writerow([k, lo, hi, (hi - lo) if lo is not None and hi is not None else ""])
    elif table == "turnover":
        if r.metabolite_turnover is None:
            raise ScienceError("No metabolite turnover in this result", "Turnover is derived from a single flux vector.")
        w.writerow(["metabolite", "turnover"])
        for k, v in r.metabolite_turnover.items():
            w.writerow([k, "" if v is None else repr(v)])
    elif table == "exchanges":
        ex = r.exchanges or {}
        if r.fva is not None:
            w.writerow(["reaction", "metabolite", "kind", "flux_min", "flux_max", "uptake_max", "secretion_max"])
            for k, x in ex.items():
                w.writerow([k, x.get("metabolite"), x.get("kind"), x.get("fluxMin"), x.get("fluxMax"), x.get("uptakeMax"), x.get("secretionMax")])
        else:
            w.writerow(["reaction", "metabolite", "kind", "flux", "uptake", "secretion"])
            for k, x in ex.items():
                w.writerow([k, x.get("metabolite"), x.get("kind"), x.get("flux"), x.get("uptake"), x.get("secretion")])
    return buf.getvalue().encode("utf-8"), f"{safe}_{table}.csv", "text/csv"


def model_file(entry, state: StateSpec, fmt: str) -> tuple[bytes, str, str]:
    """A new model file with the state applied permanently. The imported file is never touched."""
    with entry.lock:
        model = entry.model.copy()
    ms.apply_state(model, state)
    cur = annotation_service.curation(entry.id)
    if cur["metabolites"]:
        n = len(cur["metabolites"])
        model.notes = {**(model.notes or {}), "GEMs MAP curation": (
            f"{n} metabolites annotated from MetaNetX/MNXref in GEMs MAP "
            f"({sum(1 for c in cur['metabolites'].values() if c.get('formula'))} formulas filled); "
            f"original file {entry.filename} sha256 {entry.checksum[:16]}")}
    from . import edit_service
    log = edit_service.log_of(entry)
    if log["applied"]:
        labels = [t["label"] for t in log["applied"]]
        model.notes = {**(model.notes or {}), "GEMs MAP structural edits": (
            f"{len(labels)} edit(s) in GEMs MAP (COBRAGUI backend) on {entry.filename} (sha256 {entry.checksum[:16]}, edits {edit_service.log_hash(log)}): "
            + "; ".join(labels[:40]) + (" …" if len(labels) > 40 else ""))}
    base = Path(entry.filename).stem + ("_" + "".join(ch if ch.isalnum() else "_" for ch in state.name) if state.name else "_modified")
    if fmt == "json":
        return cobra.io.to_json(model).encode("utf-8"), f"{base}.json", "application/json"
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / ("model.xml" if fmt == "sbml" else "model.mat")
        if fmt == "sbml":
            cobra.io.write_sbml_model(model, str(path))
            return path.read_bytes(), f"{base}.xml", "application/xml"
        cobra.io.save_matlab_model(model, str(path))
        return path.read_bytes(), f"{base}.mat", "application/octet-stream"
