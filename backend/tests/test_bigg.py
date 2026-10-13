"""BiGG layer (bigg.bio): sync, universal metabolite / reaction identity, model enrichment — fake transport, no network."""
import json
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cobragui import registry
from cobragui.main import app
from cobragui.services import bigg_service as bg
from cobragui.services import identity_service as ids
from cobragui.services import metanetx

client = TestClient(app)


def comp(uid, charge, name, formula, xrefs, comps=(), old=()):
    return {"bigg_id": f"{uid}:{charge}", "name": name, "formula": formula, "charge": charge, "universalcomponent__bigg_id": uid,
            "universalcomponent__name": name, "universalcomponent__old_bigg_ids": list(old), "compartmentalized_components": [f"{uid}_{c}:{charge}" for c in comps],
            "cross_references": [{"namespace": ns, "identifier": i, "source_obsolete": False, "match": ["reference"]} for ns, i in xrefs]}


METS = [
    comp("glc__D", 0, "D-glucopyranose", "C6H12O6", [("CHEBI", "4167"), ("kegg.compound", "C00031"), ("seed.compound", "cpd00027")], "ce"),
    comp("g6p", 0, "D-glucopyranose 6-phosphate", "C6H13O9P", [("CHEBI", "4170"), ("kegg.compound", "C00092")]),
    comp("g6p", -2, "D-glucopyranose 6-phosphate(2-)", "C6H11O9P", [("CHEBI", "61548"), ("metanetx.chemical", "MNXM160")], "c"),
    comp("atp", 0, "ATP", "C10H16N5O13P3", [("kegg.compound", "C00002")], "c"),
    comp("adp", 0, "ADP", "C10H15N5O10P2", [("kegg.compound", "C00008")], "c"),
    comp("oaa", 0, "oxaloacetic acid", "C4H4O5", [("kegg.compound", "C00036")], "cm"),
    comp("accoa", 0, "acetyl-CoA", "C23H38N7O17P3S", [("kegg.compound", "C00024")], "cm"),
    comp("cit", 0, "citric acid", "C6H8O7", [("kegg.compound", "C00158")], "cm", old=("citr",)),
    comp("coa", 0, "coenzyme A", "C21H36N7O16P3S", [("kegg.compound", "C00010")], "cm"),
    comp("h2o", 0, "water", "H2O", [("kegg.compound", "C00001")], "cm"),
    comp("h", 1, "hydron", "H", [("CHEBI", "15378")], "cm"),
]


def rxn(rid, name, parts, xrefs=(), ec=(), transport=False):
    return {"bigg_id": rid, "universalreaction__bigg_id": rid, "universalreaction__name": name, "universalreaction__participants": [[c, p] for c, p in parts],
            "universalreaction__is_transport": transport, "universalreaction__is_exchange": False, "universalreaction__is_pseudo": False,
            "universalreaction__old_bigg_ids": [], "participants": [],
            "cross_references": [{"namespace": ns, "identifier": i, "source_obsolete": False, "match": ["reference"]} for ns, i in xrefs]
            + [{"namespace": "ec-code", "identifier": e, "source_obsolete": False, "match": ["reference"]} for e in ec]}


RXNS = [
    rxn("HEX1", "hexokinase (D-glucose:ATP)", [(-1, "glc__D_c"), (-1, "atp_c"), (1, "g6p_c"), (1, "adp_c"), (1, "h_c")], [("kegg.reaction", "R00299"), ("metanetx.reaction", "MNXR100612")], ["2.7.1.1"]),
    rxn("G6PP", "glucose-6-phosphatase", [(-1, "g6p_c"), (-1, "h2o_c"), (1, "glc__D_c")]),
    rxn("CS", "citrate synthase", [(-1, "oaa_c"), (-1, "accoa_c"), (-1, "h2o_c"), (1, "cit_c"), (1, "coa_c"), (1, "h_c")], ec=["2.3.3.1"]),
    rxn("CSm", "citrate synthase, mitochondrial", [(-1, "oaa_m"), (-1, "accoa_m"), (-1, "h2o_m"), (1, "cit_m"), (1, "coa_m"), (1, "h_m")], ec=["2.3.3.1"]),
    rxn("GLCt", "glucose transport", [(-1, "glc__D_e"), (1, "glc__D_c")], transport=True),
]

MODEL = {
    "id": "mini", "name": "mini", "version": "1", "compartments": {"c": "cytosol", "e": "extracellular"}, "genes": [{"id": "g1", "name": "g1"}],
    "metabolites": [
        {"id": "__mini__glc__D_c", "name": "D-Glucose", "compartment": "c", "formula": "C6H12O6", "charge": 0, "annotation": {"biggr": "__mini__glc__D_c:0"}},
        {"id": "g6p_c", "name": "D-Glucose 6-phosphate", "compartment": "c", "formula": "C6H11O9P", "charge": -2, "annotation": {"biggr": "g6p_c:-2"}},
        {"id": "glc__D_e", "name": "D-Glucose", "compartment": "e", "formula": "C6H12O6", "charge": 0, "annotation": {}},
    ],
    "reactions": [
        {"id": "__mini__G6PP", "name": "glucose-6-phosphatase", "metabolites": {"g6p_c": -1, "__mini__glc__D_c": 1}, "lower_bound": 0, "upper_bound": 1000, "gene_reaction_rule": "g1", "annotation": {}},
        {"id": "EX___mini__glc__D_e", "name": "exchange", "metabolites": {"glc__D_e": -1}, "lower_bound": -10, "upper_bound": 1000, "gene_reaction_rule": "", "annotation": {}},
        {"id": "GLCt", "name": "transport", "metabolites": {"glc__D_e": -1, "__mini__glc__D_c": 1}, "lower_bound": -1000, "upper_bound": 1000, "gene_reaction_rule": "", "annotation": {}},
    ],
}


@pytest.fixture()
def fake_bigg(monkeypatch):
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        tmp = Path(d)
        (tmp / "models").mkdir()
        monkeypatch.setattr(registry, "cache_dir", lambda: tmp / "models")
        monkeypatch.setattr(ids, "_cache", None)
        bg.reset()
        c = metanetx.MetaNetX(tmp / "mnx.sqlite", query=lambda q: [])
        metanetx.set_client(c)
        ids.set_fetch(lambda u: "" if "kegg" in u else json.dumps({"response": {"docs": []}}))
        yield tmp
        bg.reset()
        ids.set_fetch(None)
        metanetx.set_client(None)
        c._db.close()
        if ids._cache:
            ids._cache._db.close()
        monkeypatch.setattr(ids, "_cache", None)


def install():
    return bg.install(json.dumps(METS).encode(), json.dumps(RXNS).encode())


def test_install_and_status(fake_bigg):
    assert bg.status()["available"] is False and bg.index() is None
    s = install()
    assert s["available"] and s["metabolites"] == 10 and s["reactions"] == 5
    assert bg.index() is not None and bg.status()["installed"]
    with pytest.raises(bg.BiggDataError):
        bg.install(b"[]", b"[]")


def test_metabolite_identity(fake_bigg):
    install()
    ix = bg.index()
    g = ix.search_metabolites("C00092")[0]
    assert g["identifiers"]["bigg.metabolite"] == ["g6p"]
    # the cross-references of all charge states are united; the neutral form gives formula and name
    assert g["identifiers"]["chebi"] == ["CHEBI:4170", "CHEBI:61548"] and g["formula"] == "C6H13O9P" and g["charge"] == 0
    assert ix.search_metabolites("glc__D_c")[0]["match"].startswith("BiGG ID glc__D")
    assert ix.search_metabolites("citr")[0]["identifiers"]["bigg.metabolite"] == ["cit"]  # superseded id
    assert ix.resolve({"chebi": ["17634", "CHEBI:4167"]}) == {"glc__D"}


P = lambda n, i, c, main=True, comp="cytosol": {"name": n, "identifiers": i, "coefficient": c, "main": main, "compartment": comp}  # noqa: E731
HEX = [P("glc", {"kegg.compound": ["C00031"]}, -1), P("ATP", {"bigg.metabolite": ["atp"]}, -1, False),
       P("g6p", {"kegg.compound": ["C00092"]}, 1), P("ADP", {"kegg.compound": ["C00008"]}, 1, False)]
TCA = [P("oaa", {"kegg.compound": ["C00036"]}, -1, comp="mitochondria"), P("accoa", {"kegg.compound": ["C00024"]}, -1, comp="mitochondria"),
       P("cit", {"kegg.compound": ["C00158"]}, 1, comp="mitochondria")]


def test_reaction_identity_uses_every_participant_and_the_compartment(fake_bigg):
    install()
    ix = bg.index()
    r = ix.search_reactions(HEX, ["2.7.1.1"])
    top = r["candidates"][0]
    assert top["name"] == "HEX1" and top["identifiers"]["kegg.reaction"] == ["R00299"] and top["score"] > 0.95
    assert all(e["ok"] for e in top["evidence"] if e["ok"] is not None)
    assert [c["name"] for c in r["candidates"]] == ["HEX1", "G6PP"]  # the transport GLCt has no g6p
    names = [c["name"] for c in ix.search_reactions(TCA, ["2.3.3.1"])["candidates"]]
    assert names[0] == "CSm" and "CS" in names
    names_c = [c["name"] for c in ix.search_reactions([{**p, "compartment": "cytosol"} for p in TCA], ["2.3.3.1"])["candidates"]]
    assert names_c[0] == "CS"


def test_bigg_ids_for_a_template(fake_bigg):
    assert bg.template_bigg_ids([], [])["available"] is False
    install()
    r = bg.template_bigg_ids(
        [{"id": "e1", "identifiers": {"kegg.compound": ["C00031"]}}, {"id": "e2", "identifiers": {"kegg.compound": ["C99999"]}},
         {"id": "e3", "identifiers": {"bigg.metabolite": ["g6p"], "kegg.compound": ["C00092"]}}],
        [{"id": "r1", "participants": HEX, "ec": ["2.7.1.1"]}, {"id": "r2", "participants": TCA, "ec": []}])
    assert r["entities"]["e1"] == {"status": "one", "bigg": "glc__D", "name": "D-glucopyranose", "identifiers": {"chebi": ["CHEBI:4167"], "kegg.compound": ["C00031"], "seed.compound": ["cpd00027"]}}
    assert r["entities"]["e2"]["status"] == "none"
    assert r["entities"]["e3"]["status"] == "known"
    assert r["reactions"]["r1"]["status"] == "one" and r["reactions"]["r1"]["bigg"] == "HEX1"
    assert r["reactions"]["r2"]["bigg"] == "CSm"


def test_identity_service_merges_bigg(fake_bigg):
    assert ids.search_compounds("C00092")["sources"]["BiGG"] == "not downloaded"
    install()
    r = ids.search_compounds("C00092")
    assert r["sources"]["BiGG"] == "ok"
    assert r["candidates"][0]["identifiers"]["bigg.metabolite"] == ["g6p"]
    rr = ids.search_reactions([{"name": "glc", "identifiers": {"kegg.compound": ["C00031"]}, "coefficient": -1, "main": True},
                               {"name": "g6p", "identifiers": {"kegg.compound": ["C00092"]}, "coefficient": 1, "main": True}], [])
    assert rr["candidates"][0]["sources"] == ["BiGG"]


def test_models_exported_by_bigg_are_normalized_and_annotated(fake_bigg):
    install()
    assert bg.looks_like_bigg_export(MODEL) and not bg.looks_like_bigg_export({"id": "x", "metabolites": [{"id": "a_c", "annotation": {"kegg": "C1"}}]})
    m, rep = bg.enrich_model(MODEL)
    by = {x["id"]: x for x in m["metabolites"]}
    assert set(by) == {"glc__D_c", "g6p_c", "glc__D_e"} and rep["renamed"] == 1
    assert by["glc__D_c"]["annotation"]["kegg.compound"] == ["C00031"] and by["glc__D_c"]["annotation"]["bigg.metabolite"] == "glc__D"
    assert "biggr" not in by["g6p_c"]["annotation"]
    rx = {x["id"]: x for x in m["reactions"]}
    assert set(rx) == {"G6PP", "EX_glc__D_e", "GLCt"}
    assert rx["G6PP"]["metabolites"] == {"g6p_c": -1, "glc__D_c": 1}
    assert rx["G6PP"]["annotation"]["bigg.reaction"] == "G6PP"
    other = json.dumps({"id": "y", "metabolites": [], "reactions": []}).encode()
    assert bg.normalize_bigg_json(other) == (other, None)


def test_api(fake_bigg):
    assert client.get("/api/bigg/status").json()["available"] is False
    install()
    assert client.get("/api/bigg/status").json()["reactions"] == 5
    r = client.post("/api/identity/bigg-ids", json={"entities": [{"id": "e1", "identifiers": {"kegg.compound": ["C00031"]}}],
                                                    "reactions": [{"id": "r1", "participants": HEX, "ec": ["2.7.1.1"]}]}).json()
    assert r["entities"]["e1"]["bigg"] == "glc__D" and r["reactions"]["r1"]["bigg"] == "HEX1"
    # importing a model exported by BiGG into COBRApy: IDs normalized and annotated on the way in
    res = client.post("/api/models/import", files={"file": ("mini.biggr.json", json.dumps(MODEL).encode(), "application/json")})
    assert res.status_code == 200, res.text
    mets = {m["id"]: m for m in res.json()["metabolites"]}
    assert "glc__D_c" in mets and "__mini__glc__D_c" not in mets
