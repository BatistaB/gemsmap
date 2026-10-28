"""Structural model edits (edit_service) on a private copy of E. coli core, in a temporary cache.

Covers the functional cases of the editor: edit a coefficient, add a metabolite and simulate with the
new equation, new reaction, imported and manual metabolites, exchange / sink / demand, duplicate
detection, validation, undo / redo, rollback, persistence (re-load and export → re-import).
"""
import io
import json

import cobra
import pytest
from fastapi.testclient import TestClient

from cobragui import registry
from cobragui.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def private_cache():
    """Edit logs are written next to the cached model: never in the user's real cache."""
    import shutil
    import tempfile
    d = tempfile.mkdtemp(prefix="cobragui_edits_")
    mp = pytest.MonkeyPatch()
    mp.setenv("COBRAGUI_CACHE", d)
    yield
    mp.undo()
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture()
def mid():
    """A fresh model per test: textbook with a unique id (own checksum, own edit log)."""
    import uuid
    m = cobra.io.load_model("textbook")
    m.id = f"edit_test_{uuid.uuid4().hex[:8]}"
    buf = io.StringIO()
    cobra.io.save_json_model(m, buf)
    r = client.post("/api/models/import", files={"file": (f"{m.id}.json", buf.getvalue().encode(), "application/json")})
    assert r.status_code == 200, r.text
    assert r.json()["edits"]["count"] == 0
    return r.json()["id"]


def model_of(mid):
    return registry.get(mid).model


def rxn(mid, rid):
    return next((x for x in client.get(f"/api/models/{mid}").json()["reactions"] if x["id"] == rid), None)


def commit(mid, ops, ok=True):
    r = client.post(f"/api/models/{mid}/edits", json={"ops": ops})
    assert (r.status_code == 200) == ok, r.text
    return r.json()


def put_reaction(rid, mets, lb=0.0, ub=1000.0, orig=None, **kw):
    return {"op": "put_reaction", "id": orig, "reaction": {"id": rid, "name": kw.get("name", rid), "lb": lb, "ub": ub,
                                                            "metabolites": mets, "gpr": kw.get("gpr", ""), "subsystem": kw.get("subsystem", ""),
                                                            "annotation": kw.get("annotation", {}), "objective": kw.get("objective", 0)}}


def fba(mid):
    r = client.post(f"/api/models/{mid}/simulate/fba", json={"state": {"name": "WT"}})
    assert r.status_code == 200, r.text
    return r.json()


def balance_of(mid, met, fluxes):
    return sum(c * fluxes[r.id] for r in model_of(mid).metabolites.get_by_id(met).reactions
               for m, c in r.metabolites.items() if m.id == met)


# ----------------------------------------------------------------------------- 1, 2: edit an existing reaction

def test_edit_coefficient_changes_the_model_object(mid):
    r = rxn(mid, "PGK")
    mets = dict(r["stoichiometry"])
    mets["adp_c"] = -2.0  # A + B -> C  becomes  A + 2 B -> C
    out = commit(mid, [put_reaction("PGK", mets, r["lb"], r["ub"], orig="PGK", name=r["name"], gpr=r["gpr"] or "")])
    assert model_of(mid).reactions.PGK.metabolites[model_of(mid).metabolites.adp_c] == -2
    assert rxn(mid, "PGK")["stoichiometry"]["adp_c"] == -2
    up = {x["id"]: x for x in out["delta"]["reactions"]["upsert"]}
    assert "PGK" in up and not out["delta"]["reactions"]["remove"]
    assert out["history"]["count"] == 1 and "PGK" in out["history"]["items"][0]["details"][0]


def test_added_metabolite_is_used_by_the_solver(mid):
    base = fba(mid)["reactionFluxes"]
    assert abs(base["PGI"]) > 1
    r = rxn(mid, "PGI")
    commit(mid, [put_reaction("PGI", {**r["stoichiometry"], "h2o_c": -1.0}, r["lb"], r["ub"], orig="PGI", name=r["name"], gpr=r["gpr"] or "")])
    res = fba(mid)
    assert res["solverStatus"] == "optimal"
    v = res["reactionFluxes"]
    assert abs(v["PGI"]) > 1e-6
    assert abs(balance_of(mid, "h2o_c", v)) < 1e-6  # steady state holds with PGI consuming water
    assert res["metadata"]["modelEdits"]["count"] == 1


# ----------------------------------------------------------------------------- 3, 4, 5: new reaction and metabolites

def test_new_reaction_from_existing_metabolites(mid):
    commit(mid, [put_reaction("PYR_LAC_NEW", {"pyr_c": -1, "nadh_c": -1, "h_c": -1, "lac__D_c": 1, "nad_c": 1}, gpr="b9999 and b9998", subsystem="Test")])
    r = model_of(mid).reactions.PYR_LAC_NEW
    assert r.subsystem == "Test" and {g.id for g in r.genes} == {"b9999", "b9998"}
    cat = rxn(mid, "PYR_LAC_NEW")
    assert cat["type"] == "internal" and cat["equation"].startswith("h_c + nadh_c + pyr_c")


def test_imported_and_manual_metabolites_with_new_compartment(mid):
    ann = {"metanetx.chemical": "MNXM98", "kegg.compound": "C00149", "bigg.metabolite": "mal__L"}
    out = commit(mid, [
        {"op": "add_compartment", "id": "x", "name": "peroxisome"},
        {"op": "put_metabolite", "metabolite": {"id": "mal__L_x", "name": "L-Malate", "compartment": "x", "formula": "C4H4O5", "charge": -2, "annotation": ann}},
        {"op": "put_metabolite", "metabolite": {"id": "foo_x", "name": "Foo", "compartment": "x"}},
        put_reaction("FOO_SYN", {"mal__L_x": -1, "foo_x": 1}),
    ])
    m = model_of(mid)
    assert m.metabolites.mal__L_x.annotation["kegg.compound"] == "C00149" and m.metabolites.mal__L_x.charge == -2
    assert out["delta"]["compartments"]["x"] == "peroxisome"
    warn = out["report"]["warnings"]
    assert any("formula and charge" in w for w in warn)  # manual metabolite without formula/charge


def test_unknown_compartment_and_duplicates_are_reported(mid):
    r = client.post(f"/api/models/{mid}/edits/check", json={"ops": [
        {"op": "put_metabolite", "metabolite": {"id": "glc_q", "name": "glucose", "compartment": "q"}}]}).json()
    assert any("Unknown compartment" in e for e in r["errors"])
    r = client.post(f"/api/models/{mid}/edits/check", json={"ops": [
        {"op": "put_metabolite", "metabolite": {"id": "glc2_c", "name": "D-Glucose", "compartment": "e", "annotation": {"kegg.compound": "C00031"}}}]}).json()
    assert not r["errors"]
    dup = r["items"][0]["duplicates"]
    assert dup and dup[0]["id"] == "glc__D_e" and dup[0]["sameCompartment"]


# ----------------------------------------------------------------------------- 6–9: boundary reactions

def test_exchange_sink_demand_and_duplicate_exchange(mid):
    commit(mid, [{"op": "put_metabolite", "metabolite": {"id": "cit_e", "name": "Citrate", "compartment": "e", "formula": "C6H5O7", "charge": -3}}])
    commit(mid, [put_reaction("EX_cit_e", {"cit_e": -1}, 0, 1000, annotation={"sbo": "SBO:0000627"})])
    commit(mid, [put_reaction("SK_pyr_c", {"pyr_c": -1}, -1000, 1000, annotation={"sbo": "SBO:0000632"})])
    commit(mid, [put_reaction("DM_succ_c", {"succ_c": -1}, 0, 1000, annotation={"sbo": "SBO:0000628"})])
    assert rxn(mid, "EX_cit_e")["type"] == "exchange"
    assert rxn(mid, "SK_pyr_c")["type"] == "sink"
    assert rxn(mid, "DM_succ_c")["type"] == "demand"
    again = client.post(f"/api/models/{mid}/edits/check", json={"ops": [put_reaction("EX_cit_e_2", {"cit_e": -1}, 0, 1000, annotation={"sbo": "SBO:0000627"})]}).json()
    assert any("Potential duplicate reaction: EX_cit_e" in w for w in again["warnings"])
    same_id = client.post(f"/api/models/{mid}/edits/check", json={"ops": [put_reaction("EX_cit_e", {"cit_e": -1})]}).json()
    assert any("already used" in e for e in same_id["errors"])
    cyt = client.post(f"/api/models/{mid}/edits/check", json={"ops": [put_reaction("EX_pyr_c", {"pyr_c": -1}, 0, 1000, annotation={"sbo": "SBO:0000627"})]}).json()
    assert any("normally associated with extracellular" in w for w in cyt["warnings"])
    # the new exchange is part of the medium the solver sees
    med = client.post(f"/api/models/{mid}/medium/query", json={"state": {}}).json()
    assert "EX_cit_e" in json.dumps(med)


# ----------------------------------------------------------------------------- validation & safety

def test_invalid_edits_change_nothing(mid):
    before = len(model_of(mid).reactions)
    for ops in (
        [put_reaction("BAD1", {"nope_c": -1, "pyr_c": 1})],                        # unknown metabolite
        [put_reaction("BAD2", {"pyr_c": -1, "lac__D_c": 1}, 10, 1)],               # lb > ub
        [put_reaction("BAD3", {"pyr_c": -1, "lac__D_c": 1}, gpr="b1 and (b2")],    # invalid GPR
        [put_reaction("BAD4", {"pyr_c": "NaN", "lac__D_c": 1})],            # NaN coefficient
        [put_reaction("BAD5", {})],                                                # no metabolites
        [put_reaction("PGI", {"pyr_c": -1, "lac__D_c": 1})],                       # duplicate id
    ):
        r = client.post(f"/api/models/{mid}/edits", json={"ops": ops})
        assert r.status_code == 422, r.text
    assert len(model_of(mid).reactions) == before
    assert client.get(f"/api/models/{mid}/edits").json()["count"] == 0


def test_failure_midway_rolls_back(mid, monkeypatch):
    from cobragui.services import edit_service as es
    real = es._apply
    calls = {"n": 0}

    def flaky(entry, p):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("disk full")
        return real(entry, p)

    monkeypatch.setattr(es, "_apply", flaky)
    r = client.post(f"/api/models/{mid}/edits", json={"ops": [
        {"op": "put_metabolite", "metabolite": {"id": "zz_c", "name": "ZZ", "compartment": "c"}},
        put_reaction("ZZ_SYN", {"pyr_c": -1, "zz_c": 1})]})
    assert r.status_code == 422 and "left unchanged" in r.text
    assert "zz_c" not in model_of(mid).metabolites and "ZZ_SYN" not in model_of(mid).reactions


def test_delete_metabolite_needs_cascade_and_rename_keeps_references(mid):
    r = client.post(f"/api/models/{mid}/edits/check", json={"ops": [{"op": "delete_metabolite", "id": "pyr_c"}]}).json()
    assert any("participates in" in e for e in r["errors"])
    commit(mid, [{"op": "put_metabolite", "id": "pyr_c", "metabolite": {"id": "pyruvate_c", "name": "Pyruvate", "compartment": "c", "formula": "C3H3O3", "charge": -1}}])
    assert "pyruvate_c" in rxn(mid, "PYK")["stoichiometry"]
    assert fba(mid)["solverStatus"] == "optimal"
    n = len(model_of(mid).metabolites.pyruvate_c.reactions)
    out = commit(mid, [{"op": "delete_metabolite", "id": "pyruvate_c", "cascade": True}])
    assert len(out["delta"]["reactions"]["remove"]) == n and "pyruvate_c" in out["delta"]["metabolites"]["remove"]
    client.post(f"/api/models/{mid}/edits/undo")
    assert len(model_of(mid).metabolites.pyruvate_c.reactions) == n


def test_full_validation(mid):
    commit(mid, [{"op": "put_metabolite", "metabolite": {"id": "lonely_c", "name": "Lonely", "compartment": "c"}}])
    v = client.get(f"/api/models/{mid}/validate").json()
    codes = {i["code"]: i for i in v["issues"]}
    assert "lonely_c" in codes["orphan-metabolite"]["ids"]
    assert v["edits"] == 1


# ----------------------------------------------------------------------------- 10, 11: undo/redo, persistence

def test_undo_redo_removes_and_restores_completely(mid):
    commit(mid, [put_reaction("NEW_R", {"pyr_c": -1, "lac__D_c": 1}, gpr="gNEW", objective=0.5)])
    m = model_of(mid)
    assert "NEW_R" in m.reactions and "gNEW" in m.genes
    u = client.post(f"/api/models/{mid}/edits/undo").json()
    assert "NEW_R" not in m.reactions and "gNEW" not in m.genes
    assert "NEW_R" in u["delta"]["reactions"]["remove"] and u["history"]["count"] == 0
    assert "NEW_R" not in json.dumps(client.get(f"/api/models/{mid}").json()["summary"]["objective"])
    client.post(f"/api/models/{mid}/edits/redo")
    assert "NEW_R" in m.reactions and abs(m.reactions.NEW_R.objective_coefficient - 0.5) < 1e-12


def test_edits_survive_reload_and_export(mid):
    commit(mid, [{"op": "put_metabolite", "metabolite": {"id": "cit_e", "name": "Citrate", "compartment": "e"}},
                 put_reaction("EX_cit_e", {"cit_e": -1}, -10, 1000, annotation={"sbo": "SBO:0000627"})])
    h = client.get(f"/api/models/{mid}/edits").json()
    assert h["dirty"]
    # reload: drop the in-memory model, the log is re-applied from the cache
    with registry._registry_lock:
        registry._entries.pop(mid)
    again = client.get(f"/api/models/{mid}").json()
    assert any(x["id"] == "EX_cit_e" for x in again["reactions"]) and again["edits"]["count"] == 1
    # export -> re-import as a new file: the change is in the file itself
    f = client.post(f"/api/models/{mid}/export", json={"state": {}, "format": "json"})
    assert f.status_code == 200
    assert not client.get(f"/api/models/{mid}/edits").json()["dirty"]
    data = json.loads(f.content)
    assert "GEMsMAP structural edits" in json.dumps(data.get("notes", {}))
    data["id"] = data["id"] + "_reimported"
    r = client.post("/api/models/import", files={"file": ("reimported.json", json.dumps(data).encode(), "application/json")}).json()
    ex = next(x for x in r["reactions"] if x["id"] == "EX_cit_e")
    assert ex["lb"] == -10 and r["edits"]["count"] == 0
    patch = client.get(f"/api/models/{mid}/edits/patch").json()
    assert patch["summary"]["reactionsAdded"] == 1 and patch["summary"]["metabolitesAdded"] == 1


def test_discard_restores_the_file(mid):
    n = len(model_of(mid).reactions)
    commit(mid, [put_reaction("TMP1", {"pyr_c": -1, "lac__D_c": 1})])
    commit(mid, [{"op": "delete_reaction", "id": "PGI"}])
    out = client.post(f"/api/models/{mid}/edits/discard").json()
    assert len(model_of(mid).reactions) == n and "PGI" in model_of(mid).reactions
    assert out["history"]["count"] == 0
