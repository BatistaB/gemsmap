"""Metabolite annotation analysis (MetaNetX) with a fake SPARQL endpoint — no network in tests."""
import re
import tempfile
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cobragui import registry
from cobragui.main import app
from cobragui.services import annotation_service as an
from cobragui.services import metanetx

client = TestClient(app)

# A tiny MNXref: identifiers.org URI -> MNX id, and chemical details.
XREF = {
    "https://identifiers.org/bigg.metabolite:glc__D": ["MNXM_GLC"],
    "https://identifiers.org/kegg.compound:C00031": ["MNXM_GLC"],
    "https://identifiers.org/CHEBI:17634": ["MNXM_GLC_NOSTRUCT"],
    "https://identifiers.org/bigg.metabolite:cit": ["MNXM_CIT"],
    "https://identifiers.org/kegg.compound:C00158": ["MNXM_CIT"],
    "https://identifiers.org/CHEBI:32142": ["MNXM_CIT_SALT"],
    "https://identifiers.org/bigg.metabolite:f6p": ["MNXM_BF6P"],
    "https://identifiers.org/kegg.compound:C00085": ["MNXM_F6P"],
    "https://identifiers.org/bigg.metabolite:pyr": ["MNXM_PYR"],
}
CHEMS = {
    "MNXM_GLC": ("D-glucose", "C6H12O6", 0, ["https://identifiers.org/kegg.compound:C00031", "https://identifiers.org/CHEBI:4167",
                                            "https://identifiers.org/seed.compound:cpd00027", "https://identifiers.org/kegg.drug:D00009",
                                            "https://identifiers.org/metacyc.compound:A", "https://identifiers.org/metacyc.compound:B",
                                            "https://identifiers.org/metacyc.compound:C"]),
    "MNXM_GLC_NOSTRUCT": ("D-glucose", None, None, []),
    "MNXM_CIT": ("citrate", "C6H5O7", -3, ["https://identifiers.org/kegg.compound:C00158", "https://identifiers.org/hmdb:HMDB0000094"]),
    "MNXM_CIT_SALT": ("Citric acid monohydrate", "C6H10O8", 0, []),
    "MNXM_BF6P": ("beta-D-fructose 6-phosphate", "C6H11O9P", -2, []),
    "MNXM_F6P": ("D-fructose 6-phosphate", "C6H11O9P", -2, []),
    "MNXM_PYR": ("pyruvate", "C3H3O3", -1, ["https://identifiers.org/kegg.compound:C00022", "https://identifiers.org/seed.compound:cpd00020"]),
}
NAMES = {"phosphate": ["MNXM_PI"]}
CHEMS["MNXM_PI"] = ("phosphate", "HO4P", -2, [])


def fake_query(q: str) -> list[dict]:
    vals = re.search(r"VALUES \?\w+ \{(.*?)\}", q, re.S).group(1)
    rows = []
    if "chemXref ?ref" in q:
        for uri in re.findall(r"<([^>]+)>", vals):
            rows += [{"ref": uri, "mnx": metanetx.CHEM + m} for m in XREF.get(uri, [])]
    elif "?mnx ?p ?o" in q:
        for uri in re.findall(r"<([^>]+)>", vals):
            m = uri.replace(metanetx.CHEM, "")
            if m not in CHEMS:
                continue
            name, formula, charge, xrefs = CHEMS[m]
            rows.append({"mnx": uri, "p": "http://www.w3.org/2000/01/rdf-schema#comment", "o": name})
            if formula:
                rows.append({"mnx": uri, "p": "https://rdf.metanetx.org/schema/formula", "o": formula})
                rows.append({"mnx": uri, "p": "https://rdf.metanetx.org/schema/charge", "o": str(charge)})
            rows += [{"mnx": uri, "p": "https://rdf.metanetx.org/schema/chemXref", "o": x} for x in xrefs]
    else:
        for name in re.findall(r'"([^"]+)"', vals):
            rows += [{"n": name, "mnx": metanetx.CHEM + m} for m in NAMES.get(name, [])]
    return rows


@pytest.fixture()
def fake_mnx(monkeypatch):
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        tmp = Path(d)
        monkeypatch.setattr(registry, "cache_dir", lambda: tmp)
        c = metanetx.MetaNetX(tmp / "mnx.sqlite", query=fake_query)
        metanetx.set_client(c)
        yield c
        metanetx.set_client(None)
        c._db.close()


def met(id_, name="", formula=None, compartment="c", **ann):
    return {"id": id_, "name": name, "formula": formula, "charge": None, "compartment": compartment, "annotation": ann}


# ----------------------------------------------------------------------------- normalization

def test_identifier_normalization():
    assert an.annotation_xrefs({"chebi": ["CHEBI:17634", "CHEBI/4167", "https://identifiers.org/CHEBI:15903"]}) == {
        ("chebi", "CHEBI:17634"), ("chebi", "CHEBI:4167"), ("chebi", "CHEBI:15903")}
    assert ("kegg.compound", "C00031") in an.annotation_xrefs({"kegg": "C00031"})
    assert ("hmdb", "HMDB0000094") in an.annotation_xrefs({"hmdb": "HMDB00094"})
    assert ("metacyc.compound", "GLC") in an.annotation_xrefs({"biocyc": "META:GLC"})
    assert an.annotation_xrefs({"sbo": "SBO:0000247"}) == set()
    assert an.id_xrefs("C00031[c]", "c") == {("kegg.compound", "C00031")}
    assert an.id_xrefs("cpd00027_c0", "c0") == {("seed.compound", "cpd00027")}
    assert an.id_xrefs("M_glc__D_c", "c") == {("bigg.metabolite", "glc__D")}
    assert an.parse_mnx_xref("https://identifiers.org/CHEBI:4167") == ("chebi", "CHEBI:4167")
    assert an.parse_mnx_xref("https://identifiers.org/kegg.compound:C00031") == ("kegg.compound", "C00031")
    assert an.parse_mnx_xref("https://biocyc.org/compound?id=GLC") is None


def test_decisions(fake_mnx):
    r = an.analyze([
        met("glc__D_c", "D-Glucose", "C6H12O6", kegg="C00031", chebi="CHEBI:17634"),   # structureless twin absorbed
        met("cit_c", "Citrate", "C6H5O7", bigg="cit", kegg="C00158", chebi="CHEBI:32142"),  # salt dropped by formula
        met("f6p_c", "D-Fructose 6-phosphate", "C6H11O9P", kegg="C00085"),          # ID says beta form, KEGG says generic
        met("pyr_c", "Pyruvate", "C3H3O3"),                                         # ID string only + formula agrees
        met("pi_c", "Phosphate", "HO4P"),                                           # name only
        met("xyz_c", "Mystery"),
        met("prot_P12345", "prot_P12345"),
    ], fake_mnx, use_names=True)
    by = {it["id"]: it for it in r["items"]}
    assert by["glc__D_c"]["status"] == "confident" and by["glc__D_c"]["proposal"]["mnx"] == "MNXM_GLC"
    add = by["glc__D_c"]["proposal"]["add"]
    assert add["metanetx.chemical"] == ["MNXM_GLC"] and add["chebi"] == ["CHEBI:4167"] and add["seed.compound"] == ["cpd00027"]
    assert "kegg.compound" not in add                       # already annotated: never duplicated
    assert "metacyc.compound" not in add                    # 3 MetaCyc IDs = compound class noise
    assert "kegg.drug" not in str(add)
    assert by["cit_c"]["status"] == "confident" and "Ignored (different formula)" in by["cit_c"]["reason"]
    assert by["f6p_c"]["status"] == "doubt" and len(by["f6p_c"]["candidates"]) == 2
    assert by["pyr_c"]["status"] == "confident" and by["pyr_c"]["proposal"]["mnx"] == "MNXM_PYR"
    assert by["pi_c"]["status"] == "doubt" and "name" in by["pi_c"]["reason"].lower()
    assert by["xyz_c"]["status"] == "unmapped"
    assert by["prot_P12345"]["status"] == "skipped"
    # second run: everything from the local cache, no query
    calls = []
    fake_mnx.query = lambda q: calls.append(q) or []
    an.analyze([met("glc__D_c", "D-Glucose", "C6H12O6", kegg="C00031")], fake_mnx)
    assert calls == []


# ----------------------------------------------------------------------------- API + curation layer

def wait_done(mid):
    for _ in range(100):
        j = client.get(f"/api/models/{mid}/annotation").json()
        if j["job"] and j["job"]["state"] != "running":
            return j
        time.sleep(0.05)
    raise AssertionError("analysis did not finish")


def test_analyze_apply_export_revert(fake_mnx):
    mid = client.post("/api/models/examples/textbook").json()["id"]
    r = client.post(f"/api/models/{mid}/annotation/analyze", json={"autoApply": True, "fillFormulas": True})
    assert r.status_code == 200, r.text
    j = wait_done(mid)
    assert j["job"]["state"] == "done", j["job"]
    assert j["analysis"]["summary"]["confident"] >= 3
    assert j["curation"]["accepted"] == j["analysis"]["summary"]["confident"]
    glc = next(m for m in client.get(f"/api/models/{mid}/metabolites").json() if m["id"] == "glc__D_e")
    assert "MNXM_GLC" in glc["annotation"]["metanetx.chemical"]
    # the curated annotation is part of the exported model, with a provenance note
    exported = client.post(f"/api/models/{mid}/export", json={"format": "json"}).json()
    g = next(m for m in exported["metabolites"] if m["id"] == "glc__D_e")
    assert "MNXM_GLC" in g["annotation"]["metanetx.chemical"]
    assert "GEMsMAP curation" in exported.get("notes", {})
    # reject one: its accepted match is undone and remembered
    r = client.post(f"/api/models/{mid}/annotation/reject", json={"ids": ["glc__D_e"]}).json()
    assert "glc__D_e" in r["curation"]["rejectedIds"] and "glc__D_e" not in r["curation"]["entries"]
    assert "metanetx.chemical" not in r["metabolites"][0]["annotation"]
    # a user choice re-applies it
    r = client.post(f"/api/models/{mid}/annotation/apply", json={"items": [{"id": "glc__D_e", "mnx": "MNXM_GLC"}]}).json()
    assert r["curation"]["entries"]["glc__D_e"]["source"] == "user"
    # the curation layer is re-applied when the model is loaded again
    entry = registry.get(mid)
    from cobragui.services import model_service
    again = model_service._make_entry(mid, entry.checksum, entry.filename, entry.fmt, entry.model.copy(), {})
    assert "MNXM_GLC" in again.model.metabolites.get_by_id("glc__D_e").annotation["metanetx.chemical"]
    # revert everything: the original annotation is back
    r = client.post(f"/api/models/{mid}/annotation/revert", json={"ids": None}).json()
    assert r["curation"]["accepted"] == 0
    glc = next(m for m in client.get(f"/api/models/{mid}/metabolites").json() if m["id"] == "glc__D_e")
    assert "metanetx.chemical" not in glc["annotation"]


def test_apply_same_compound_in_another_compartment(fake_mnx):
    """A choice made for pyr_c can be applied to its sibling even when the sibling's own analysis listed no candidate."""
    mid = client.post("/api/models/examples/textbook").json()["id"]
    client.post(f"/api/models/{mid}/annotation/analyze", json={"autoApply": False, "fillFormulas": True})
    j = wait_done(mid)
    items = {it["id"]: it for it in j["analysis"]["items"]}
    assert any(c["mnx"] == "MNXM_PYR" for c in items["pyr_c"]["candidates"])
    target = next(i for i, it in items.items() if not it["candidates"] and it["status"] != "skipped")
    # without `like` the chemical is not among the target's candidates: nothing is applied
    r = client.post(f"/api/models/{mid}/annotation/apply", json={"items": [{"id": target, "mnx": "MNXM_PYR"}]}).json()
    assert target not in r["curation"]["entries"]
    r = client.post(f"/api/models/{mid}/annotation/apply", json={"items": [
        {"id": "pyr_c", "mnx": "MNXM_PYR"}, {"id": target, "mnx": "MNXM_PYR", "like": "pyr_c"}]}).json()
    e = r["curation"]["entries"]
    assert e["pyr_c"]["mnx"] == "MNXM_PYR" and e[target]["mnx"] == "MNXM_PYR"
    client.post(f"/api/models/{mid}/annotation/revert", json={"ids": None})


# ----------------------------------------------------------------------------- BiGG local tables (offline enrichment)

def _bigg_index():
    from cobragui.services.bigg_service import BiggIndex

    def comp(uid, name, formula, xrefs, old=()):
        return {"bigg_id": f"{uid}:0", "name": name, "formula": formula, "charge": 0, "universalcomponent__bigg_id": uid,
                "universalcomponent__name": name, "universalcomponent__old_bigg_ids": list(old), "compartmentalized_components": [f"{uid}_c:0"],
                "cross_references": [{"namespace": ns, "identifier": i, "source_obsolete": False} for ns, i in xrefs]}
    return BiggIndex([
        # BiGG's MetaNetX link is an older MNX release (MNXM41), as in the real tables
        comp("glc__D", "D-glucopyranose", "C6H12O6", [("CHEBI", "4167"), ("kegg.compound", "C00031"), ("seed.compound", "cpd00027"),
                                                     ("hmdb", "HMDB0000122"), ("metanetx.chemical", "MNXM41"), ("metacyc.compound", "D-Glucose")], old=("glc_D",)),
    ], [])


def test_bigg_enriches_but_metanetx_decides(fake_mnx):
    big = _bigg_index()
    m = [met("C00031[c]", "D-Glucose", "C6H12O6", kegg="C00031")]
    with_bigg = an.analyze(m, fake_mnx, bigg=big)["items"][0]
    without = an.analyze(m, fake_mnx, bigg=None)["items"][0]
    # same decision and same chemical: MetaNetX is the reference
    assert with_bigg["status"] == without["status"] == "confident"
    assert with_bigg["proposal"]["mnx"] == without["proposal"]["mnx"] == "MNXM_GLC"
    add = with_bigg["proposal"]["add"]
    assert add["bigg.metabolite"] == ["glc__D"] and add["hmdb"] == ["HMDB0000122"]
    assert "MNXM41" not in add["metanetx.chemical"]          # BiGG's stale MNX link is never written
    assert "D-Glucose" not in str(add.get("metacyc.compound"))  # BiGG MetaCyc entries are often classes
    assert "bigg.metabolite" not in without["proposal"]["add"]


def test_bigg_bridges_superseded_ids_offline(monkeypatch):
    def down(q):
        raise metanetx.MetaNetXUnavailable("offline")
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        c = metanetx.MetaNetX(Path(d) / "mnx.sqlite", query=down)
        try:
            # a superseded BiGG ID that MetaNetX cannot be asked about: only the local BiGG tables know it
            r = an.analyze([met("glc_D_c", "D-Glucose", "C6H12O6")], c, bigg=_bigg_index())
            it = r["items"][0]
            assert r["status"] == "partial" and r["source"]["bigg"]["metabolites"] == 1
            assert it["status"] == "confident", it["reason"]
            assert "local BiGG tables" in it["reason"]
            assert it["proposal"]["add"]["bigg.metabolite"] == ["glc__D"]
            assert "metanetx.chemical" not in it["proposal"]["add"]  # not confirmed by MetaNetX
            assert an.analyze([met("glc_D_c", "D-Glucose", "C6H12O6")], c, bigg=None)["items"][0]["status"] == "unmapped"
        finally:
            c._db.close()


def test_bigg_id_written_only_when_unambiguous(fake_mnx):
    from cobragui.services.bigg_service import BiggIndex

    def comp(uid, xrefs):
        return {"bigg_id": f"{uid}:0", "name": uid, "formula": "C6H12O6", "charge": 0, "universalcomponent__bigg_id": uid,
                "universalcomponent__name": uid, "universalcomponent__old_bigg_ids": [], "compartmentalized_components": [],
                "cross_references": [{"namespace": ns, "identifier": i, "source_obsolete": False} for ns, i in xrefs]}
    big = BiggIndex([comp("glc__D", [("kegg.compound", "C00031")]), comp("M01234", [("kegg.compound", "C00031")])], [])
    # KEGG-only model: two BiGG entries share the KEGG ID -> no BiGG ID written
    kegg = an.analyze([met("C00031[c]", "D-Glucose", "C6H12O6", kegg="C00031")], fake_mnx, bigg=big)["items"][0]
    assert "bigg.metabolite" not in kegg["proposal"]["add"]
    # BiGG-ID model: its own BiGG ID decides; the look-alike is not added
    own = an.analyze([met("glc__D_c", "D-Glucose", "C6H12O6", kegg="C00031")], fake_mnx, bigg=big)["items"][0]
    assert own["candidates"][0]["bigg"] == ["glc__D"]
    assert "M01234" not in str(own["proposal"]["add"])
