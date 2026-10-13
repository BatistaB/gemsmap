"""Template identity search (KEGG + ChEBI → MetaNetX, reactions by participants) with fake transports — no network."""
import json
import re
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cobragui import registry
from cobragui.main import app
from cobragui.services import identity_service as ids
from cobragui.services import metanetx

client = TestClient(app)
CHEM = metanetx.CHEM
REAC = ids.REAC

KEGG_FIND = {
    "glucose": "cpd:C00031\tD-Glucose; Grape sugar; Dextrose; Glucose\ncpd:C00092\tD-Glucose 6-phosphate; Glucose 6-phosphate\n",
}
OLS = {
    "glucose": {"response": {"docs": [
        {"obo_id": "CHEBI:17234", "label": "glucose", "synonym": ["Glucose", "DL-glucose"]},
        {"obo_id": "CHEBI:4167", "label": "D-glucopyranose", "synonym": ["D-glucose", "Glucose"]},
    ]}},
}
XREF = {
    "https://identifiers.org/kegg.compound:C00031": ["MNXM_DGLC"],
    "https://identifiers.org/CHEBI:4167": ["MNXM_DGLC"],
    "https://identifiers.org/CHEBI:17234": ["MNXM_GLC_ANY"],
    "https://identifiers.org/kegg.compound:C00092": ["MNXM_G6P"],
    "https://identifiers.org/kegg.compound:C00085": ["MNXM_F6P"],
}
CHEMS = {
    "MNXM_DGLC": ("D-glucose", "C6H12O6", ["https://identifiers.org/kegg.compound:C00031", "https://identifiers.org/CHEBI:4167",
                                           "https://identifiers.org/bigg.metabolite:glc__D", "https://identifiers.org/seed.compound:cpd00027"]),
    "MNXM_GLC_ANY": ("glucose", "C6H12O6", ["https://identifiers.org/CHEBI:17234"]),
    "MNXM_G6P": ("D-glucose 6-phosphate", "C6H11O9P", ["https://identifiers.org/kegg.compound:C00092"]),
    "MNXM_F6P": ("D-fructose 6-phosphate", "C6H11O9P", ["https://identifiers.org/kegg.compound:C00085"]),
}
# MNXR_PGI: G6P = F6P (EC 5.3.1.9) ; MNXR_OTHER: G6P + X = F6P + Y
REACTIONS = {
    "MNXR1": {"left": ["MNXM_G6P"], "right": ["MNXM_F6P"], "ec": ["5.3.1.9"], "xrefs": ["https://identifiers.org/kegg.reaction:R00771", "http://bigg.ucsd.edu/universal/reactions/PGI", "http://bigg.ucsd.edu/universal/reactions/R_PGI"]},
    "MNXR2": {"left": ["MNXM_F6P", "MNXM_X"], "right": ["MNXM_G6P", "MNXM_Y"], "ec": ["2.7.1.1"], "xrefs": []},
}


def fake_query(q: str) -> list[dict]:
    rows = []
    if "chemXref ?ref" in q:
        vals = re.search(r"VALUES \?ref \{(.*?)\}", q, re.S).group(1)
        for uri in re.findall(r"<([^>]+)>", vals):
            rows += [{"ref": uri, "mnx": CHEM + m} for m in XREF.get(uri, [])]
    elif "?mnx ?p ?o" in q:
        vals = re.search(r"VALUES \?mnx \{(.*?)\}", q, re.S).group(1)
        for uri in re.findall(r"<([^>]+)>", vals):
            m = uri.replace(CHEM, "")
            if m in CHEMS:
                name, formula, xrefs = CHEMS[m]
                rows += [{"mnx": uri, "p": "http://www.w3.org/2000/01/rdf-schema#comment", "o": name},
                         {"mnx": uri, "p": "https://rdf.metanetx.org/schema/formula", "o": formula}]
                rows += [{"mnx": uri, "p": "https://rdf.metanetx.org/schema/chemXref", "o": x} for x in xrefs]
    elif "DISTINCT ?reac ?eq" in q:
        ca = {u.replace(CHEM, "") for u in re.findall(r"<([^>]+)>", re.search(r"VALUES \?ca \{(.*?)\}", q, re.S).group(1))}
        cb = {u.replace(CHEM, "") for u in re.findall(r"<([^>]+)>", re.search(r"VALUES \?cb \{(.*?)\}", q, re.S).group(1))}
        for r, e in REACTIONS.items():
            if (ca & set(e["left"]) and cb & set(e["right"])) or (ca & set(e["right"]) and cb & set(e["left"])):
                rows.append({"reac": REAC + r, "eq": "…"})
    elif "?side ?chem" in q:
        for r in re.findall(r"<" + re.escape(REAC) + r"([^>]+)>", q):
            for side in ("left", "right"):
                rows += [{"reac": REAC + r, "side": f"https://rdf.metanetx.org/schema/{side}", "chem": CHEM + c} for c in REACTIONS[r][side]]
    elif "?reac ?p ?o" in q:
        for r in re.findall(r"<" + re.escape(REAC) + r"([^>]+)>", q):
            e = REACTIONS[r]
            eq = " + ".join(f"1 {c}@MNXD1" for c in e["left"]) + " = " + " + ".join(f"1 {c}@MNXD1" for c in e["right"])
            rows.append({"reac": REAC + r, "p": "http://www.w3.org/2000/01/rdf-schema#comment", "o": eq})
            rows += [{"reac": REAC + r, "p": "https://rdf.metanetx.org/schema/classification", "o": x} for x in e["ec"]]
            rows += [{"reac": REAC + r, "p": "https://rdf.metanetx.org/schema/reacXref", "o": x} for x in e["xrefs"]]
    return rows


def fake_fetch(url: str) -> str:
    if url.startswith(ids.KEGG + "/find/compound/"):
        return KEGG_FIND.get(url.rsplit("/", 1)[-1], "")
    if url.startswith(ids.OLS):
        q = re.search(r"[?&]q=([^&]+)", url).group(1)
        return json.dumps(OLS.get(q, {"response": {"docs": []}}))
    raise AssertionError(f"unexpected URL {url}")


@pytest.fixture()
def fake_web(monkeypatch):
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
        tmp = Path(d)
        monkeypatch.setattr(registry, "cache_dir", lambda: tmp / "models")
        (tmp / "models").mkdir()
        monkeypatch.setattr(ids, "_cache", None)
        ids.bigg_service.reset()  # no BiGG data in this temporary cache
        c = metanetx.MetaNetX(tmp / "mnx.sqlite", query=fake_query)
        metanetx.set_client(c)
        ids.set_fetch(fake_fetch)
        yield c
        ids.set_fetch(None)
        metanetx.set_client(None)
        c._db.close()
        if ids._cache:
            ids._cache._db.close()
        monkeypatch.setattr(ids, "_cache", None)


def test_name_score():
    assert ids.name_score("glucose", ["Glucose"])[0] == 1.0
    assert ids.name_score("glucose", ["D-Glucose", "Dextrose", "glucose"])[0] == 0.9
    assert ids.name_score("glu", ["Glucose"])[0] == 0.7


def test_compound_search_merges_sources_and_keeps_stereo_forms_apart(fake_web):
    r = ids.search_compounds("glucose")
    assert r["sources"] == {"KEGG": "ok", "ChEBI": "ok", "MetaNetX": "ok", "BiGG": "not downloaded"}
    by = {c["mnx"]: c for c in r["candidates"]}
    # KEGG C00031 and ChEBI 4167 are one MNX chemical: one candidate, both sources, all cross-references
    d = by["MNXM_DGLC"]
    assert set(d["sources"]) == {"KEGG", "ChEBI", "MetaNetX"}
    assert d["identifiers"]["kegg.compound"] == ["C00031"] and d["identifiers"]["bigg.metabolite"] == ["glc__D"]
    assert d["identifiers"]["metanetx.chemical"] == ["MNXM_DGLC"] and d["formula"] == "C6H12O6"
    # the stereo-unspecified "glucose" stays a separate candidate: the user chooses
    assert "MNXM_GLC_ANY" in by
    assert r["candidates"][0]["score"] >= r["candidates"][-1]["score"]


def test_compound_search_by_identifier(fake_web):
    r = ids.search_compounds("C00092")
    assert [c["mnx"] for c in r["candidates"]] == ["MNXM_G6P"]
    assert r["candidates"][0]["match"].startswith("identifier")


def test_search_is_cached(fake_web):
    ids.search_compounds("glucose")
    calls = []
    ids.set_fetch(lambda u: calls.append(u) or "")
    ids.search_compounds("glucose")
    assert calls == []


def test_reaction_identity_from_participants(fake_web):
    r = ids.search_reactions([
        {"name": "G6P", "identifiers": {"kegg.compound": ["C00092"]}, "coefficient": -1, "main": True},
        {"name": "F6P", "identifiers": {"kegg.compound": ["C00085"]}, "coefficient": 1, "main": True},
    ], ["5.3.1.9"])
    top = r["candidates"][0]
    assert top["name"] == "MNXR1" and top["ec"] == ["5.3.1.9"]
    assert top["identifiers"]["kegg.reaction"] == ["R00771"] and top["identifiers"]["bigg.reaction"] == ["PGI"]  # R_PGI dropped
    assert top["direction"] == "as drawn"
    assert all(e["ok"] for e in top["evidence"])
    assert r["candidates"][1]["name"] == "MNXR2" and r["candidates"][1]["score"] < top["score"]
    assert r["candidates"][1]["direction"] == "written in reverse in MNXref"


def test_reaction_identity_needs_identified_ends(fake_web):
    r = ids.search_reactions([{"name": "X", "identifiers": {}, "coefficient": -1, "main": True}, {"name": "F6P", "identifiers": {"kegg.compound": ["C00085"]}, "coefficient": 1, "main": True}], [])
    assert r["candidates"] == [] and any("at least one drawn substrate" in n for n in r["notes"])


def test_identity_api(fake_web):
    res = client.get("/api/identity/compounds", params={"q": "glucose"})
    assert res.status_code == 200 and res.json()["candidates"]
    res = client.post("/api/identity/reactions", json={"participants": [
        {"name": "G6P", "identifiers": {"kegg.compound": ["C00092"]}, "coefficient": -1, "main": True},
        {"name": "F6P", "identifiers": {"kegg.compound": ["C00085"]}, "coefficient": 1, "main": True}], "ec": ["5.3.1.9"]})
    assert res.status_code == 200 and res.json()["candidates"][0]["name"] == "MNXR1"
