"""End-to-end API tests on COBRApy's bundled E. coli core model ('textbook')."""
import math

import pytest
from fastapi.testclient import TestClient

from cobragui.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def model():
    r = client.post("/api/models/examples/textbook")
    assert r.status_code == 200, r.text
    return r.json()


def sim(mid, method, state=None, params=None):
    r = client.post(f"/api/models/{mid}/simulate/{method}", json={"state": state or {"name": "WT"}, "params": params or {}})
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    j = client.get("/api/health").json()
    assert j["status"] == "ok" and "GLPK" in j["solvers"]


def test_catalog(model):
    assert model["summary"]["reactions"] == 95
    pdh = next(r for r in model["reactions"] if r["id"] == "PDH")
    assert pdh["stoichiometry"]["pyr_c"] == -1 and pdh["genes"]
    ex = next(r for r in model["reactions"] if r["id"] == "EX_glc__D_e")
    assert ex["type"] == "exchange" and ex["boundaryMetabolite"] == "glc__D_e"


def test_search(model):
    hits = client.get(f"/api/models/{model['id']}/search", params={"q": "pyruvate"}).json()
    ids = [h["id"] for h in hits]
    assert "pyr_c" in ids and "PDH" in ids  # PDH matches through its metabolite names


def test_fba_pfba_loopless_same_objective(model):
    vals = [sim(model["id"], m)["objectiveValue"] for m in ("fba", "pfba", "loopless")]
    assert all(abs(v - 0.8739) < 1e-3 for v in vals)


def test_pfba_reports_biological_objective_and_total_flux(model):
    r = sim(model["id"], "pfba")
    assert r["solverStatus"] == "optimal"
    assert abs(r["objectiveValue"] - 0.8739) < 1e-3
    assert r["metadata"]["totalFlux"] > 100


def test_turnover_formula(model):
    r = sim(model["id"], "fba")
    stoich = {x["id"]: x["stoichiometry"] for x in model["reactions"]}
    expected = 0.5 * sum(abs(s.get("pyr_c", 0) * r["reactionFluxes"][rid]) for rid, s in stoich.items())
    assert math.isclose(r["metaboliteTurnover"]["pyr_c"], expected, rel_tol=1e-9)


def test_infeasible_has_no_fluxes(model):
    r = sim(model["id"], "pfba", {"name": "no glucose", "bounds": {"EX_glc__D_e": [0, 1000]}})
    assert r["solverStatus"] == "infeasible"
    assert r["reactionFluxes"] is None and r["metaboliteTurnover"] is None and r["objectiveValue"] is None
    assert r["diagnostics"]


def test_fva_intervals_only(model):
    r = sim(model["id"], "fva", params={"fractionOfOptimum": 0.9})
    assert r["reactionFluxes"] is None and r["metaboliteTurnover"] is None
    iv = r["fva"]["PFK"]
    assert iv["minimum"] <= iv["maximum"]
    assert r["exchanges"]["EX_glc__D_e"]["uptakeMax"] > 0


def test_state_does_not_mutate_model(model):
    sim(model["id"], "fba", {"bounds": {"EX_o2_e": [-1, 1000]}})
    again = client.get(f"/api/models/{model['id']}").json()
    o2 = next(r for r in again["reactions"] if r["id"] == "EX_o2_e")
    assert o2["lb"] == -1000
    assert sim(model["id"], "fba")["objectiveValue"] > 0.87


def test_invalid_state(model):
    r = client.post(f"/api/models/{model['id']}/simulate/fba", json={"state": {"bounds": {"PFK": [5, 1]}}})
    assert r.status_code == 422 and r.json()["error"]["title"] == "Invalid model state"


def test_objective_override(model):
    r = sim(model["id"], "fba", {"objective": {"coefficients": {"EX_ac_e": 1}, "direction": "max"}})
    assert r["metadata"]["objective"]["coefficients"] == {"EX_ac_e": 1.0}
    assert r["objectiveValue"] > 0


def test_medium_roundtrip(model):
    mid = model["id"]
    t = client.post(f"/api/models/{mid}/medium/query", json={"state": {}}).json()
    glc = next(x for x in t["rows"] if x["reaction"] == "EX_glc__D_e")
    assert glc["inMedium"] and glc["uptakeMax"] == 10
    medium = dict(t["medium"])
    medium["EX_glc__D_e"] = 5
    upd = client.put(f"/api/models/{mid}/medium", json={"state": {}, "medium": medium}).json()
    assert upd["bounds"]["EX_glc__D_e"][0] == -5
    r = sim(mid, "fba", {"bounds": upd["bounds"]})
    assert r["objectiveValue"] < 0.87


def test_medium_presets(model):
    mid = model["id"]
    an = client.post(f"/api/models/{mid}/medium/preset", json={"state": {}, "preset": "anaerobic"}).json()
    assert "EX_o2_e" in an["bounds"] and an["bounds"]["EX_o2_e"][0] == 0
    mm = client.post(f"/api/models/{mid}/medium/preset", json={"state": {}, "preset": "minimal"}).json()
    assert mm["medium"]


def test_compare_and_reversal_handling(model):
    mid = model["id"]
    a = sim(mid, "pfba", {"name": "WT"})
    b = sim(mid, "pfba", {"name": "Low O2", "bounds": {"EX_o2_e": [-2, 1000]}})
    c = client.post("/api/results/compare", json={"a": a, "b": b}).json()
    assert c["kind"] == "flux" and c["config"]["bounds"]
    cats = {r["category"] for r in c["reactions"]}
    assert cats & {"changed", "activated", "inactivated"}
    for r in c["reactions"]:
        if r["category"] in ("reversal", "activated", "inactivated"):
            assert r["log2fc"] is None
    ex = client.post(f"/api/models/{mid}/explain-turnover",
                     json={"metabolite": "accoa_c", "fluxesA": a["reactionFluxes"], "fluxesB": b["reactionFluxes"]}).json()
    assert ex["rows"] and "not a causal" in ex["note"]


def test_compare_rejects_fva_vs_flux(model):
    a = sim(model["id"], "fba")
    b = sim(model["id"], "fva")
    r = client.post("/api/results/compare", json={"a": a, "b": b})
    assert r.status_code == 400


def test_derive_turnover_from_imported_fluxes(model):
    r = sim(model["id"], "fba")
    fluxes = dict(r["reactionFluxes"], NOT_IN_MODEL=3.0)
    d = client.post(f"/api/models/{model['id']}/derive", json={"fluxes": fluxes}).json()
    assert d["matched"] == len(r["reactionFluxes"]) and d["total"] == len(fluxes)
    assert math.isclose(d["metaboliteTurnover"]["pyr_c"], r["metaboliteTurnover"]["pyr_c"], rel_tol=1e-9)
    assert d["exchanges"]["EX_glc__D_e"]["uptake"] > 0


def test_exports(model):
    r = sim(model["id"], "pfba")
    csv = client.post("/api/results/export", json={"result": r, "format": "csv", "table": "fluxes"})
    assert csv.status_code == 200 and b"reaction,flux" in csv.content
    js = client.post("/api/results/export", json={"result": r, "format": "json"})
    assert js.json()["format"] == "cobragui-result"
    m = client.post(f"/api/models/{model['id']}/export", json={"state": {"name": "low", "bounds": {"EX_o2_e": [-1, 1000]}}, "format": "json"})
    assert m.status_code == 200 and b'"EX_o2_e"' in m.content


def test_chunked_fva_matches_cobrapy(model):
    """FVA runs in chunks (for progress and cancel); intervals must equal one COBRApy call."""
    from cobra.flux_analysis import flux_variability_analysis
    from cobragui.services import model_service
    r = sim(model["id"], "fva", params={"fractionOfOptimum": 0.9})
    ref = flux_variability_analysis(model_service.get_entry(model["id"]).model, fraction_of_optimum=0.9)
    assert len(r["fva"]) == 95
    for rid, row in ref.iterrows():
        assert abs(r["fva"][rid]["minimum"] - row["minimum"]) < 1e-6
        assert abs(r["fva"][rid]["maximum"] - row["maximum"]) < 1e-6


def test_cancel_queued_run_and_fva_keep_partial(model, monkeypatch):
    from cobragui.services import simulation_service as ss
    # a run cancelled before it starts is never solved
    ss.job_register("j1")
    assert client.post("/api/jobs/j1/cancel", json={}).json() == {"cancelled": True}
    r = client.post(f"/api/models/{model['id']}/simulate/fba", json={"jobId": "j1"})
    assert r.status_code == 409 and r.json()["error"]["detail"]["cancelled"]
    assert client.get("/api/jobs/j1").status_code == 404  # cleaned up

    # "stop and keep" after the first FVA chunk returns only the computed intervals
    real = ss.flux_variability_analysis
    def first_chunk_then_stop(*a, **k):
        out = real(*a, **k)
        ss.job_cancel("j2", True)
        return out
    monkeypatch.setattr(ss, "flux_variability_analysis", first_chunk_then_stop)
    r = client.post(f"/api/models/{model['id']}/simulate/fva", json={"jobId": "j2"}).json()
    assert r["solverStatus"] == "optimal"
    assert r["metadata"]["partial"] == {"done": 10, "total": 95}
    assert len(r["fva"]) == 10 and "stopped at 10/95" in r["name"]
