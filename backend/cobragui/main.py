"""COBRAGUI backend: a thin FastAPI layer over COBRApy. Run from backend/:

    .venv/Scripts/python -m uvicorn cobragui.main:app --port 8765
"""
import asyncio
import logging
import platform
import traceback
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Optional

import cobra
import optlang
from fastapi import APIRouter, FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response

from . import __version__
from .errors import ScienceError
from .schemas import (AnnotationAnalyzeRequest, AnnotationApplyRequest, AnnotationIdsRequest, CancelRequest, CompareRequest, EditRequest, DeriveRequest, ExplainRequest, ExportModelRequest, ExportResultRequest, MediumPresetRequest,
                      MediumUpdate, ReactionIdentityRequest, BiggIdsRequest, SimulationRequest, StateRequest)
from .services import annotation_service, bigg_service, comparison_service, edit_service, export_service, identity_service, medium_service, model_service, simulation_service

logging.getLogger("cobra").setLevel(logging.ERROR)
log = logging.getLogger("cobragui")

app = FastAPI(title="COBRAGUI backend", version=__version__)
# model catalogs and annotation analyses of genome-scale models are several MB of JSON
app.add_middleware(GZipMiddleware, minimum_size=4096)
app.add_middleware(CORSMiddleware, allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])


@app.exception_handler(ScienceError)
async def _science(_: Request, e: ScienceError):
    return JSONResponse(e.payload(), status_code=e.status)


@app.exception_handler(RequestValidationError)
async def _invalid(_: Request, e: RequestValidationError):
    errs = e.errors()
    msg = "; ".join(f"{'.'.join(str(x) for x in er.get('loc', [])[1:])}: {er.get('msg')}" for er in errs[:5])
    return JSONResponse({"error": {"title": "Invalid request", "message": msg, "hints": [], "detail": errs[:20]}}, status_code=422)


@app.exception_handler(Exception)
async def _unexpected(_: Request, e: Exception):
    log.exception("unexpected error")
    return JSONResponse({"error": {"title": "Unexpected backend error", "message": f"{type(e).__name__}: {e}",
                                   "hints": [], "detail": traceback.format_exc()[-4000:]}}, status_code=500)


# GLPK keeps per-thread state: a problem built in one thread aborts the process when solved in another.
# All COBRApy work (import, catalog, solves) therefore runs on this single worker thread.
_cobra_thread = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cobra")


async def on_cobra(fn, *args, **kwargs):
    return await asyncio.get_running_loop().run_in_executor(_cobra_thread, partial(fn, *args, **kwargs))


api = APIRouter(prefix="/api")
# Only models bundled with COBRApy (load_model would otherwise try to download from BiGG).
EXAMPLES = {"textbook": "E. coli core (textbook, 95 reactions)",
            "iJO1366": "E. coli iJO1366 (2,583 reactions, with subsystems)"}


def _catalog(entry) -> dict:
    """The model catalog plus the structural edit history (the UI shows both)."""
    return {**entry.catalog, "edits": edit_service.history(entry)}


def _download(data: bytes, filename: str, media: str) -> Response:
    return Response(data, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api.get("/health")
def health():
    solvers = sorted(k for k, v in optlang.available_solvers.items() if v)
    return {"status": "ok", "version": __version__, "cobraVersion": cobra.__version__, "solvers": solvers,
            "defaultSolver": str(cobra.Configuration().solver.__name__).split(".")[-1].replace("_interface", "").upper(),
            "python": platform.python_version(), "platform": platform.platform(terse=True)}


@api.get("/examples")
def examples():
    return [{"name": k, "label": v} for k, v in EXAMPLES.items()]


@api.post("/models/import")
async def import_model(file: UploadFile = File(...)):
    data = await file.read()
    entry = await on_cobra(model_service.import_model, file.filename or "model", data)
    return _catalog(entry)


@api.post("/models/examples/{name}")
async def import_example(name: str):
    if name not in EXAMPLES:
        raise ScienceError("Unknown example", name, status=404)
    return _catalog(await on_cobra(model_service.import_example, name))


@api.get("/models/{model_id}")
async def get_model(model_id: str):
    return _catalog(await on_cobra(model_service.get_entry, model_id))


@api.get("/models/{model_id}/summary")
async def get_summary(model_id: str):
    c = (await on_cobra(model_service.get_entry, model_id)).catalog
    return {"id": c["id"], "name": c["name"], "filename": c["filename"], "summary": c["summary"], "warnings": c["warnings"]}


@api.get("/models/{model_id}/metabolites")
async def get_metabolites(model_id: str):
    return (await on_cobra(model_service.get_entry, model_id)).catalog["metabolites"]


@api.get("/models/{model_id}/reactions")
async def get_reactions(model_id: str):
    return (await on_cobra(model_service.get_entry, model_id)).catalog["reactions"]


@api.get("/models/{model_id}/genes")
async def get_genes(model_id: str):
    return (await on_cobra(model_service.get_entry, model_id)).catalog["genes"]


@api.get("/models/{model_id}/search")
async def search(model_id: str, q: str, kinds: Optional[str] = None, limit: int = 50):
    entry = (await on_cobra(model_service.get_entry, model_id))
    index = await on_cobra(model_service.search_index, entry)
    return index.search(q, kinds.split(",") if kinds else None, max(1, min(limit, 500)))


@api.post("/models/{model_id}/medium/query")
async def medium_query(model_id: str, body: StateRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(medium_service.medium_table, entry, body.state)


@api.put("/models/{model_id}/medium")
async def medium_set(model_id: str, body: MediumUpdate):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(medium_service.set_medium, entry, body.state, body.medium)


@api.post("/models/{model_id}/medium/preset")
async def medium_preset(model_id: str, body: MediumPresetRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(medium_service.apply_preset, entry, body.state, body.preset, body.rich_uptake, body.growth_fraction)


@api.post("/models/{model_id}/simulate/{method}")
async def simulate(model_id: str, method: str, body: SimulationRequest):
    # registered before queueing on the cobra thread, so a run waiting behind another can be cancelled
    simulation_service.job_register(body.job_id)
    try:
        entry = await on_cobra(model_service.get_entry, model_id)
        return await on_cobra(simulation_service.simulate, entry, method, body)
    finally:
        simulation_service.job_finish(body.job_id)


@api.get("/jobs/{job_id}")
def job_status(job_id: str):  # answered off the cobra thread, while the solve runs
    st = simulation_service.job_status(job_id)
    if st is None:
        raise ScienceError("No such job", "It finished or never started.", status=404)
    return st


@api.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str, body: CancelRequest):
    return {"cancelled": simulation_service.job_cancel(job_id, body.keep)}


@api.post("/models/{model_id}/derive")
async def derive(model_id: str, body: DeriveRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(simulation_service.derive_from_fluxes, entry, body.fluxes)


@api.post("/models/{model_id}/explain-turnover")
async def explain(model_id: str, body: ExplainRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(comparison_service.explain_turnover, entry, body.metabolite, body.fluxes_a, body.fluxes_b,
                          body.zero_tolerance)


@api.post("/models/{model_id}/export")
async def export_model(model_id: str, body: ExportModelRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    out = await on_cobra(export_service.model_file, entry, body.state, body.format)
    edit_service.mark_exported(entry)  # the structural edits are now saved in a file
    return _download(*out)


# ----------------------------------------------------------------------------- structural edits
# Edits change the working cobra.Model itself (the one every simulation uses), as a logged, reversible
# layer re-applied on load. Validation never modifies the model; an invalid edit changes nothing.

@api.post("/models/{model_id}/edits/check")
async def edits_check(model_id: str, body: EditRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(edit_service.check, entry, body.ops)


@api.post("/models/{model_id}/edits")
async def edits_commit(model_id: str, body: EditRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(edit_service.commit, entry, body.ops, body.label)


@api.get("/models/{model_id}/edits")
async def edits_history(model_id: str):
    entry = await on_cobra(model_service.get_entry, model_id)
    return edit_service.history(entry)


@api.post("/models/{model_id}/edits/undo")
async def edits_undo(model_id: str):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(edit_service.undo, entry)


@api.post("/models/{model_id}/edits/redo")
async def edits_redo(model_id: str):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(edit_service.redo, entry)


@api.post("/models/{model_id}/edits/discard")
async def edits_discard(model_id: str):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(edit_service.discard, entry)


@api.get("/models/{model_id}/edits/patch")
async def edits_patch(model_id: str):
    import json as _json
    entry = await on_cobra(model_service.get_entry, model_id)
    p = edit_service.patch(entry)
    name = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in entry.filename.rsplit(".", 1)[0])
    return _download(_json.dumps(p, indent=1).encode("utf-8"), f"{name}_model_patch.json", "application/json")


@api.get("/models/{model_id}/validate")
async def validate_model(model_id: str):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await on_cobra(edit_service.validate, entry)


# ----------------------------------------------------------------------------- metabolite annotation (MetaNetX)
# The analysis talks to MetaNetX on its own thread (network-bound); applying a curation only touches
# annotations and formulas, so it does not wait behind running solves either.

@api.post("/models/{model_id}/annotation/analyze")
async def annotation_analyze(model_id: str, body: AnnotationAnalyzeRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return annotation_service.start(entry, body.use_names, body.auto_apply, body.fill_formulas)


@api.get("/models/{model_id}/annotation")
async def annotation_status(model_id: str, full: bool = True):
    """full=false: job progress and curation summary only (cheap to poll while the analysis runs)."""
    entry = await on_cobra(model_service.get_entry, model_id)
    return annotation_service.status(entry, full)


@api.post("/models/{model_id}/annotation/apply")
async def annotation_apply(model_id: str, body: AnnotationApplyRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await asyncio.to_thread(annotation_service.apply, entry, [c.model_dump(by_alias=True) for c in body.items], "user")


@api.post("/models/{model_id}/annotation/reject")
async def annotation_reject(model_id: str, body: AnnotationIdsRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await asyncio.to_thread(annotation_service.reject, entry, body.ids or [])


@api.post("/models/{model_id}/annotation/revert")
async def annotation_revert(model_id: str, body: AnnotationIdsRequest):
    entry = await on_cobra(model_service.get_entry, model_id)
    return await asyncio.to_thread(annotation_service.revert, entry, body.ids)


# ----------------------------------------------------------------------------- template identity (Template Builder)
# Model-independent: KEGG / ChEBI searches resolved through MetaNetX. Network-bound, off the cobra thread.

@api.get("/identity/compounds")
async def identity_compounds(q: str, limit: int = 8):
    return await asyncio.to_thread(identity_service.search_compounds, q, max(1, min(limit, 20)))


@api.post("/identity/reactions")
async def identity_reactions(body: ReactionIdentityRequest):
    return await asyncio.to_thread(identity_service.search_reactions, [p.model_dump() for p in body.participants], body.ec)


# ----------------------------------------------------------------------------- BiGG data layer
# The BiGG universal tables, installed locally (gemsmap bigg-data; npm run bigg:data in a checkout). GEMsMAP does not call the BiGG API.

@api.get("/bigg/status")
def bigg_status():
    return bigg_service.status()


@api.post("/identity/bigg-ids")
async def identity_bigg_ids(body: BiggIdsRequest):
    """BiGG universal IDs for the entities and reactions of a template (only when unambiguous)."""
    return await asyncio.to_thread(bigg_service.template_bigg_ids, [e.model_dump() for e in body.entities],
                                   [{"id": r.id, "participants": [p.model_dump() for p in r.participants], "ec": r.ec, "identifiers": r.identifiers} for r in body.reactions])


@api.post("/results/compare")
def compare(body: CompareRequest):  # pure Python: does not wait behind running solves
    return comparison_service.compare( body.a, body.b, body.zero_tolerance, body.pseudocount)


@api.post("/results/export")
def export_result(body: ExportResultRequest):
    return _download(*export_service.result_file(body.result, body.format, body.table))


app.include_router(api)
