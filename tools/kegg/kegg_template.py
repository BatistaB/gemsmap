"""KEGG pathway → GEMs MAP template (curated, model-independent).

    npm run kegg:template -- map00010            build src/templates/builtin/kegg-map00010.gemsmap-template.json
                                                 and the reports in docs/templates/kegg/map00010/

KEGG is used as the biological and topological reference — compounds, reactions, equations (RCLASS main pairs,
KGML reversibility) — never as a drawing to copy. Each pathway has a curation file (tools/kegg/curation/<map>.py)
where the curator decisions live: which KEGG compounds become template entities, which are folded (anomers) or
omitted (enzyme-bound intermediates), how cofactor variants are grouped, which reactions are lumped, the pathway
links, and the layout, drawn by hand with the helpers of tools/kegg/layout.py.

Identities are reconciled with the app's own infrastructure: the MetaNetX client of the backend (SPARQL, cached)
and the installed BiGG tables (npm run bigg:data). Nothing is invented: unresolved stays unresolved, ambiguous
keeps its candidates, generic classes stay generic, and every machine identity is a *suggestion* (status
"suggested", source "ai") except entities and reactions already confirmed in the GEMs MAP canonical library.

Outputs: the template file, an identity mapping table (CSV), the review queue, a validation/QC report and a
generation log (Markdown). Standard library + the backend package.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from cobragui.services import bigg_service  # noqa: E402
from cobragui.services import identity_service  # noqa: E402
from cobragui.services import metanetx as mnx_mod  # noqa: E402
from cobragui.services.annotation_service import MAX_METACYC, formula_check, mnx_uri, parse_mnx_xref  # noqa: E402

KEGG = "https://rest.kegg.jp"
SCHEMA = "1.1.0"
REVIEW_NS = ("metanetx.chemical", "kegg.compound", "chebi", "bigg.metabolite", "seed.compound", "metacyc.compound", "hmdb", "inchikey")
OUT_NS = {"kegg.compound": "kegg.compound", "chebi": "chebi", "bigg.metabolite": "bigg.metabolite", "seed.compound": "seed.compound",
          "metacyc.compound": "metacyc.compound", "hmdb": "hmdb"}

LOG: list[str] = []


def log(msg: str) -> None:
    LOG.append(msg)
    print(msg)


# ----------------------------------------------------------------------------- KEGG (cached)

def _cache_dir() -> Path:
    d = bigg_service.data_dir().parent / "kegg"
    d.mkdir(parents=True, exist_ok=True)
    return d


def kegg_text(path: str) -> str:
    """GET rest.kegg.jp/<path>, cached for 90 days next to the other identity caches."""
    f = _cache_dir() / (re.sub(r"[^A-Za-z0-9_.+-]", "_", path) + ".txt")
    if f.exists() and time.time() - f.stat().st_mtime < 90 * 86400:
        return f.read_text(encoding="utf-8")
    req = urllib.request.Request(f"{KEGG}/{path}", headers={"User-Agent": "GEMsMAP/0.3 (template curation)"})
    with urllib.request.urlopen(req, timeout=90) as r:
        txt = r.read().decode("utf-8")
    f.write_text(txt, encoding="utf-8")
    time.sleep(0.35)  # be gentle with the KEGG REST service
    return txt


def flat_entries(txt: str) -> list[dict[str, list[str]]]:
    out = []
    for e in txt.split("///"):
        if not e.strip():
            continue
        d: dict[str, list[str]] = {}
        key = None
        for line in e.strip("\n").split("\n"):
            if not line.strip():
                continue
            k, v = line[:12].strip(), line[12:].rstrip()
            if k:
                key = k
            if key:
                d.setdefault(key, []).append(v)
        out.append(d)
    return out


def kegg_get(ids: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    todo = sorted(set(ids))
    for i in range(0, len(todo), 10):
        for d in flat_entries(kegg_text("get/" + "+".join(todo[i:i + 10]))):
            out[d["ENTRY"][0].split()[0]] = d
    return out


def parse_side(s: str) -> list[tuple[float, str]]:
    out = []
    for t in s.split(" + "):
        m = re.match(r"^(\d+)?\s*([CG]\d{5})", t.strip())
        if m:
            out.append((float(m.group(1) or 1), m.group(2)))
    return out


def kegg_reaction(d: dict) -> dict:
    eq = " ".join(d["EQUATION"])
    left, right = eq.split(" <=> ")
    return {"id": d["ENTRY"][0].split()[0], "name": " ".join(d.get("NAME", [])), "definition": " ".join(d.get("DEFINITION", [])),
            "left": parse_side(left), "right": parse_side(right), "ec": " ".join(d.get("ENZYME", [])).split(),
            "pairs": [p for l in d.get("RCLASS", []) for p in re.findall(r"(C\d{5})_(C\d{5})", l)], "comment": " ".join(d.get("COMMENT", []))}


def kegg_module(mid: str) -> str:
    """Name of a KEGG module (M00020 -> 'Serine biosynthesis, glycerate-3P => serine')."""
    e = flat_entries(kegg_text(f"get/{mid}"))
    return " ".join(e[0].get("NAME", [])) if e else mid


def kegg_compound(d: dict) -> dict:
    dbl = {}
    for l in d.get("DBLINKS", []):
        k, _, v = l.partition(":")
        dbl[k.strip()] = v.split()
    return {"id": d["ENTRY"][0].split()[0], "names": [n.rstrip(";").strip() for n in d.get("NAME", [])], "formula": (d.get("FORMULA") or [None])[0], "dblinks": dbl}


def kegg_pathway(map_id: str) -> dict:
    entry = flat_entries(kegg_text(f"get/{map_id}"))[0]
    rxns = [l.split("\t")[1].strip().replace("rn:", "") for l in kegg_text(f"link/reaction/{map_id}").splitlines() if "\t" in l]
    cpds = [l.split("\t")[1].strip().replace("cpd:", "") for l in kegg_text(f"link/compound/{map_id}").splitlines() if "\t" in l]
    try:
        kgml = ET.fromstring(kegg_text(f"get/{map_id.replace('map', 'rn')}/kgml"))
    except Exception:  # some overview maps have no reaction KGML
        kgml = ET.fromstring("<pathway/>")
    rev, direction = {}, {}
    for r in kgml.findall("reaction"):
        subs = {n.replace("cpd:", "") for s in r.findall("substrate") for n in s.get("name", "").split()}
        prods = {n.replace("cpd:", "") for s in r.findall("product") for n in s.get("name", "").split()}
        for rid in r.get("name").split():
            rev[rid.replace("rn:", "")] = r.get("type") == "reversible"
            direction[rid.replace("rn:", "")] = (subs, prods)  # KGML's own substrate -> product direction
    return {"id": map_id, "name": " ".join(entry.get("NAME", [])), "compounds": cpds, "reactions": rxns, "reversible": rev, "direction": direction,
            "related": [l.split()[0] for l in entry.get("REL_PATHWAY", [])]}


# ----------------------------------------------------------------------------- reconciliation (app infrastructure)

def mnx_chemicals(kegg_id: str, chebi: list[str]) -> tuple[list[str], dict]:
    """MetaNetX chemicals of a KEGG compound (and its ChEBI links) through the backend MetaNetX client."""
    client = mnx_mod.client()
    uris = [mnx_uri("kegg.compound", kegg_id)] + [mnx_uri("chebi", f"CHEBI:{c}") for c in chebi]
    res = client.resolve_xrefs([u for u in uris if u])
    by_kegg = res.get(mnx_uri("kegg.compound", kegg_id), [])
    all_ids = sorted({m for v in res.values() for m in v})
    info = client.chem_info(all_ids) if all_ids else {}
    return by_kegg, {"all": all_ids, "info": info, "by_uri": res}


def mnx_identifiers(info: dict) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for uri in info.get("xrefs", []):
        p = parse_mnx_xref(uri)
        if p and p[0] in OUT_NS:
            out.setdefault(OUT_NS[p[0]], set()).add(p[1])
    if len(out.get("metacyc.compound", ())) > MAX_METACYC:
        out.pop("metacyc.compound")  # MNXref merges compound classes into some chemicals
    return out


def reconcile_compound(cid: str, kc: dict, library: dict | None, bigg, generic: bool = False) -> dict:
    """Identity of one KEGG compound: KEGG entry + MetaNetX + BiGG (+ GEMs MAP library when it already knows it)."""
    chebi = kc["dblinks"].get("ChEBI", [])
    by_kegg, mnx = mnx_chemicals(cid, chebi)
    ids: dict[str, set[str]] = {"kegg.compound": {cid}, "chebi": {f"CHEBI:{c}" for c in chebi}}
    notes, evidence = [], [f"KEGG {cid}"]
    chosen = None
    structured = [m for m in by_kegg if (mnx["info"].get(m) or {}).get("formula") or (mnx["info"].get(m) or {}).get("inchikey")]
    if len(by_kegg) == 1:
        chosen = by_kegg[0]
    elif len(structured) == 1:
        chosen = structured[0]
        notes.append(f"KEGG {cid} maps to {len(by_kegg)} MetaNetX chemicals; the one with a structure was kept ({chosen})")
    elif by_kegg:
        notes.append(f"KEGG {cid} maps to several MetaNetX chemicals: {', '.join(by_kegg)}")
    info = (mnx["info"].get(chosen) or {}) if chosen else {}
    if chosen and info.get("exists"):
        ids.setdefault("metanetx.chemical", set()).add(chosen)
        for ns, v in mnx_identifiers(info).items():
            ids.setdefault(ns, set()).update(v)
        evidence.append(f"MetaNetX {chosen}")
    fcheck = formula_check(kc["formula"], info.get("formula")) if chosen else None
    if fcheck == "conflict":
        notes.append(f"formula differs: KEGG {kc['formula']} vs MetaNetX {info.get('formula')}")
    # BiGG: through the identifiers above; a BiGG ID reached by the KEGG ID itself wins over ChEBI/MNX-only hits
    big_ids: list[str] = []
    if bigg is not None:
        via_kegg = bigg.resolve({"kegg.compound": [cid]})
        via_all = bigg.resolve({k: sorted(v) for k, v in ids.items() if k != "bigg.metabolite"})
        cands = via_kegg or via_all
        if library and library.get("xrefs", {}).get("bigg.metabolite"):
            known = set(library["xrefs"]["bigg.metabolite"]) & set(bigg.mets)
            cands = (cands & known) or cands
        fit = [b for b in sorted(cands) if formula_check(bigg.mets[b]["formula"], kc["formula"]) != "conflict"]
        if len(fit) == 1:
            big_ids = fit
            evidence.append(f"BiGG {fit[0]}")
        elif len(fit) > 1:
            notes.append(f"several BiGG metabolites: {', '.join(fit)}")
            # keep those MNX itself links, if that narrows it down
            mnx_b = set(ids.get("bigg.metabolite", set()))
            narrowed = [b for b in fit if b in mnx_b]
            if len(narrowed) == 1:
                big_ids = narrowed
                evidence.append(f"BiGG {narrowed[0]} (also linked by MetaNetX)")
    if big_ids:
        ids["bigg.metabolite"] = set(big_ids) | (ids.get("bigg.metabolite", set()) & set(big_ids))
    else:
        ids.pop("bigg.metabolite", None) if len(ids.get("bigg.metabolite", set())) > 1 else None
    if library:
        for ns, vals in library.get("xrefs", {}).items():
            if ns in REVIEW_NS:
                ids.setdefault(ns, set()).update(vals)
        evidence.append(f"GEMs MAP library '{library['id']}'")
    # confidence: one MetaNetX chemical, consistent formula, at most one BiGG ID
    if library:
        status, conf = "confirmed", None
    elif not chosen:
        status, conf = ("ambiguous", None) if len(by_kegg) > 1 else ("suggested", "probable") if bigg and big_ids else ("unresolved", None)
    elif fcheck == "conflict":
        status, conf = "suggested", "probable"
    elif len(by_kegg) == 1 and (bigg is None or big_ids or not bigg.resolve({"kegg.compound": [cid]})):
        status, conf = "suggested", "high"
    else:
        status, conf = "suggested", "probable"
    if generic and status == "suggested":
        conf = "probable"  # a class of compounds is never a high-confidence identity
    return {
        "kegg": cid, "names": kc["names"], "kegg_formula": kc["formula"], "mnx": chosen, "mnx_all": by_kegg, "formula": info.get("formula") or kc["formula"],
        "charge": info.get("charge"), "identifiers": {k: sorted(v) for k, v in ids.items() if v}, "status": status, "confidence": conf,
        "notes": notes, "evidence": evidence, "mnx_formula": info.get("formula"),
    }


def mnx_reactions(kegg_rid: str) -> tuple[list[str], dict[str, list[str]], list[str]]:
    """MetaNetX reactions cross-referenced to a KEGG reaction, with their KEGG/Rhea/BiGG/SEED/MetaCyc links and EC."""
    q = ("SELECT DISTINCT ?reac WHERE { ?reac mnx:reacXref ?x . FILTER(?x IN (<https://identifiers.org/kegg.reaction:" + kegg_rid + ">, "
         "<https://identifiers.org/kegg.reaction/" + kegg_rid + ">)) }")
    rows = identity_service._sparql(q)
    reacs = sorted({r["reac"].replace(identity_service.REAC, "") for r in rows if re.fullmatch(r"MNXR\d+", r["reac"].replace(identity_service.REAC, ""))})
    if not reacs:
        return [], {}, []
    rv = " ".join(f"<{identity_service.REAC}{r}>" for r in reacs)
    meta = identity_service._sparql("SELECT ?reac ?p ?o WHERE { VALUES ?reac { " + rv + " } ?reac ?p ?o . FILTER(?p IN (mnx:classification, mnx:reacXref, mnx:reacRefer)) }")
    xrefs, ec = [], set()
    for m in meta:
        p = m["p"].rsplit("/", 1)[-1].split("#")[-1]
        if p == "classification":
            ec.add(m["o"])
        else:
            xrefs.append(m["o"])
    return reacs, identity_service._reaction_xrefs(xrefs), sorted(ec)


def bigg_reactions_for(bigg, kegg_ids: list[str], participants: list[dict], ec: list[str]) -> tuple[list[str], list[str], list[str]]:
    """BiGG universal reactions for a template step: cross-referenced to the KEGG reaction(s) by BiGG AND with every
    template participant present on the right side (BiGG's KEGG links alone are sometimes imprecise: R01516, the
    phospho-histidine priming of PGAM, is linked to DPGase, a phosphatase). Extra BiGG compounds (protons) are allowed.
    Returns (cytosolic candidates, all verified candidates, rejected KEGG-linked candidates)."""
    if bigg is None:
        return [], [], []
    linked = {r["id"] for r in bigg.rxns.values() if set(kegg_ids) & r["xrefs"].get("kegg.reaction", set())}
    if not linked:
        return [], [], []
    res = bigg.search_reactions(participants, ec, limit=50)
    ok = []
    for c in res["candidates"]:
        if c["name"] not in linked:
            continue
        bad = [e for e in c["evidence"] if e["ok"] is False and not e["text"].startswith("EC ")]
        if not bad:
            ok.append(c["name"])
    cyto = [r for r in ok if {k for _, _, k in bigg.rxns[r]["parts"]} <= {"c"}]
    return sorted(cyto), sorted(ok), sorted(linked - set(ok))


# ----------------------------------------------------------------------------- template assembly

def load_curation(map_id: str):
    p = Path(__file__).parent / "curation" / f"{map_id}.py"
    spec = importlib.util.spec_from_file_location(f"curation_{map_id}", p)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(Path(__file__).parent))
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def library_entities() -> dict[str, dict]:
    """The GEMs MAP canonical library (src/templates/mapping/library.ts), keyed by KEGG compound ID."""
    lib = {}
    for f in (ROOT / "src" / "templates" / "builtin").glob("*.gemsmap-template.json"):
        t = json.loads(f.read_text(encoding="utf-8"))
        if t["metadata"].get("review_status") == "ai-generated":
            continue  # only identities a person confirmed count as the library
        for e in t["biology"]["entities"]:
            if e.get("library") and e["identity"]["status"] == "confirmed":
                for k in e["identifiers"].get("kegg.compound", []):
                    lib.setdefault(k, {"id": e["library"], "xrefs": e["identifiers"], "name": e["name"], "short": e.get("short"), "related": e.get("related"), "synonyms": e.get("synonyms", [])})
    return lib


def builtin_reaction_ids() -> dict[str, dict]:
    """KEGG reaction IDs already confirmed in built-in templates (identity reused, never re-asserted by AI)."""
    out = {}
    for f in (ROOT / "src" / "templates" / "builtin").glob("*.gemsmap-template.json"):
        t = json.loads(f.read_text(encoding="utf-8"))
        if t["metadata"].get("review_status") == "ai-generated":
            continue
        for r in t["biology"]["reactions"]:
            if r["identity"]["status"] == "confirmed":
                for k in r["identifiers"].get("kegg.reaction", []):
                    out.setdefault(k, r)
    return out


def build(map_id: str) -> tuple[dict, dict]:
    cur = load_curation(map_id)
    pw = kegg_pathway(map_id)
    log(f"KEGG {map_id} — {pw['name']}: {len(pw['compounds'])} compounds, {len(pw['reactions'])} reactions on the map")
    bigg = bigg_service.index()
    log(f"BiGG tables: {'installed, ' + str(len(bigg.mets)) + ' metabolites / ' + str(len(bigg.rxns)) + ' reactions' if bigg else 'not installed (npm run bigg:data) — BiGG IDs from MetaNetX only'}")
    lib = library_entities()
    lib_rxn = builtin_reaction_ids()

    # every KEGG compound we need: entities, cofactors, related forms
    overview = getattr(cur, "OVERVIEW", False)  # an overview map: summary arrows, no step-by-step KEGG coverage
    need = {e["kegg"] for e in cur.ENTITIES} | set(cur.COFACTORS) | {k for e in cur.ENTITIES for k in e.get("related", [])} | (set() if overview else set(pw["compounds"]))
    kc = {k: kegg_compound(v) for k, v in kegg_get(sorted(need)).items()}
    # every KEGG reaction: identities of the steps, folded/represented map reactions, variants
    rneed = set()
    for r in cur.REACTIONS:
        if r.get("summary"):
            continue
        rneed |= {r["kegg"], *r.get("represents", []), *[v["kegg"] for v in r.get("variants", [])]}
    kr = {k: kegg_reaction(v) for k, v in kegg_get(sorted(rneed)).items()}

    # ---- entities
    entities, metabolites, mapping_rows = [], [], []
    ent_id: dict[str, str] = {}   # KEGG compound -> tpl_ent
    met_id: dict[str, str] = {}   # template key (or cofactor KEGG) -> tpl_met
    recon: dict[str, dict] = {}

    def entity(cid: str, label: str | None, generic: bool, related: list[str], short: str | None) -> str:
        if cid in ent_id:
            return ent_id[cid]
        r = recon[cid] = reconcile_compound(cid, kc[cid], lib.get(cid), bigg, generic)
        eid = f"tpl_ent_{len(entities) + 1:03d}"
        ent_id[cid] = eid
        names = r["names"] or [cid]
        rel = []
        for k in related:
            rk = kc.get(k)
            if rk:
                rel.append({"note": f"anomer / specific form drawn by KEGG {map_id} ({k})", "names": rk["names"][:3], "identifiers": {"kegg.compound": [k], **({"chebi": [f"CHEBI:{c}" for c in rk['dblinks'].get('ChEBI', [])]} if rk['dblinks'].get('ChEBI') else {})}})
        status = r["status"]
        ident = {"status": status, "source": "builtin" if status == "confirmed" else "ai", "note": "; ".join(r["evidence"] + r["notes"])}
        if r["confidence"]:
            ident["confidence"] = r["confidence"]
        if status == "ambiguous":
            ident["candidates"] = [{"name": (r.get("names") or [m])[0], "identifiers": {"metanetx.chemical": [m]}, "note": "MetaNetX chemical of the KEGG ID"} for m in r["mnx_all"]]
        lib_e = lib.get(cid)
        if lib_e and lib_e.get("related"):
            rel = lib_e["related"]  # the library's related forms were verified by hand
        e = {
            "id": eid, "name": lib_e["name"] if lib_e else names[0], "short": short or (lib_e or {}).get("short") or names[0],
            **({"formula": r["formula"]} if r["formula"] else {}), **({"charge": r["charge"]} if isinstance(r["charge"], int) else {}),
            "synonyms": sorted(set(names[1:8] + ((lib_e or {}).get("synonyms") or [])[:6]) - {names[0]}),
            "identifiers": r["identifiers"], "identity": ident,
            **({"related": rel} if rel else {}),
            **({"library": lib_e["id"]} if lib_e else {}), **({"generic": True} if generic else {}),
            "provenance": {"source": "KEGG", "id": cid, "url": f"https://www.kegg.jp/entry/{cid}"},
        }
        if label:
            e["short"] = label
        entities.append(e)
        mapping_rows.append({"kegg": cid, "name": e["name"], "role": "", "status": status + (f" ({r['confidence']})" if r["confidence"] else ""), "generic": generic,
                             "metanetx": ";".join(r["identifiers"].get("metanetx.chemical", [])), "bigg": ";".join(r["identifiers"].get("bigg.metabolite", [])),
                             "modelseed": ";".join(r["identifiers"].get("seed.compound", [])), "chebi": ";".join(r["identifiers"].get("chebi", [])),
                             "metacyc": ";".join(r["identifiers"].get("metacyc.compound", [])), "hmdb": ";".join(r["identifiers"].get("hmdb", [])),
                             "kegg_formula": r["kegg_formula"] or "", "mnx_formula": r["mnx_formula"] or "", "charge": "" if r["charge"] is None else r["charge"],
                             "notes": "; ".join(r["notes"])})
        return eid

    for e in cur.ENTITIES:
        eid = entity(e["kegg"], e.get("short"), e.get("generic", False), e.get("related", []), e.get("short"))
        mid = f"tpl_met_{len(metabolites) + 1:03d}"
        met_id[e["key"]] = mid
        metabolites.append({"id": mid, "entity": eid, "compartment": None, "level": e.get("level", "required"),
                            **({"label": e["label"]} if e.get("label") else {}), **({"ungrouped": True} if e.get("ungrouped") else {})})
        mapping_rows[[r["kegg"] for r in mapping_rows].index(e["kegg"])]["role"] = "pathway metabolite"
    for cid, c in cur.COFACTORS.items():
        eid = entity(cid, c["short"], c.get("generic", False), [], c["short"])
        mid = f"tpl_met_{len(metabolites) + 1:03d}"
        met_id[cid] = mid
        metabolites.append({"id": mid, "entity": eid, "compartment": None, "level": "optional"})
        row = mapping_rows[[r["kegg"] for r in mapping_rows].index(cid)]
        row["role"] = row["role"] or ("generic carrier" if c.get("generic") else "cofactor / side compound")

    # KEGG compound -> template metabolite (anomers and specific forms fold onto their template metabolite)
    to_met = {e["kegg"]: met_id[e["key"]] for e in cur.ENTITIES}
    for e in cur.ENTITIES:
        for k in e.get("related", []):
            to_met.setdefault(k, met_id[e["key"]])
    for cid in cur.COFACTORS:
        to_met[cid] = met_id[cid]

    # ---- reactions
    reactions, rx_rows = [], []
    row_keys = ["step", "kegg", "represents", "variants", "ec", "metanetx", "metanetx_candidates", "bigg", "bigg_candidates", "bigg_rejected",
                "modelseed", "rhea", "metacyc", "reversible", "status", "equation"]
    for step in cur.REACTIONS:
        if step.get("summary"):
            # a pathway drawn as one arrow: identity = the KEGG module(s); no enzyme cross-references, not balanced
            mods = step["summary"]
            names = {m: kegg_module(m) for m in mods}
            rid = f"tpl_rxn_{len(reactions) + 1:03d}"
            subs_keys, prod_keys = step["main"]
            reactions.append({
                "id": rid, "name": step["name"], "canonicalName": step["canonical"],
                "participants": [{"metabolite": met_id[x], "coefficient": -1, "main": True} for x in subs_keys] + [{"metabolite": met_id[x], "coefficient": -1, "main": False} for x in step.get("side", ([], []))[0]]
                + [{"metabolite": met_id[x], "coefficient": 1, "main": True} for x in prod_keys] + [{"metabolite": met_id[x], "coefficient": 1, "main": False} for x in step.get("side", ([], []))[1]],
                "reversible": False, "ec": [], "identifiers": {}, "level": step.get("level", "required"),
                "identity": {"status": "suggested", "source": "ai", "confidence": "high",
                             "note": "pathway summary of " + "; ".join(f"KEGG {m} ({names[m]})" for m in mods) + (f" — {step['note']}" if step.get("note") else "")},
                "provenance": [{"source": "KEGG", "id": m, "url": f"https://www.kegg.jp/entry/{m}"} for m in mods], "summary": True,
            })
            step["_id"] = rid
            rx_rows.append({**{k: "" for k in row_keys}, "step": step["name"], "kegg": ";".join(mods), "status": "summary", "equation": " / ".join(names[m] for m in mods)})
            continue
        k = kr[step["kegg"]]
        subs_keys, prod_keys = step["main"]
        main_s = {met_id[x] for x in subs_keys}
        main_p = {met_id[x] for x in prod_keys}
        # orient the KEGG equation like the drawing
        lmets = {to_met.get(c) for _, c in k["left"]}
        flip = bool(main_s & {to_met.get(c) for _, c in k["right"]}) or not (main_s & lmets)
        left, right = (k["right"], k["left"]) if flip else (k["left"], k["right"])
        parts, dropped = [], []
        for sign, side in ((-1, left), (1, right)):
            for coef, c in side:
                if c == "C00080":
                    continue  # protons are left out of template equations (as in the built-in templates)
                m = to_met.get(c)
                if not m:
                    dropped.append(c)
                    continue
                main = m in (main_s if sign < 0 else main_p)
                parts.append({"metabolite": m, "coefficient": sign * coef, "main": main})
        if dropped:
            raise SystemExit(f"{step['key']}: KEGG {k['id']} uses compounds the curation does not define: {dropped}")
        # the editor's canonical order: drawn substrates, side substrates, drawn products, side products
        order = {m: i for i, m in enumerate([met_id[x] for x in subs_keys + prod_keys])}
        parts = sorted(parts, key=lambda p: (p["coefficient"] > 0, not p["main"], order.get(p["metabolite"], 0) if p["main"] else 0))
        rev_src = [r for r in [*step.get("represents", []), step["kegg"]] if r in pw["reversible"]]
        reversible = step.get("reversible", pw["reversible"][rev_src[0]] if rev_src else None)
        # an irreversible arrow must point the way KGML says (KEGG equations are sometimes written backwards)
        if reversible is False and step["kegg"] in pw["direction"]:
            ks, kp = pw["direction"][step["kegg"]]
            drawn_s = {c for c, m in to_met.items() if m in main_s}
            drawn_p = {c for c, m in to_met.items() if m in main_p}
            if (ks & drawn_p) or (kp & drawn_s):
                raise SystemExit(f"{step['key']}: drawn {sorted(drawn_s)} -> {sorted(drawn_p)} but KGML runs the irreversible {step['kegg']} {sorted(ks)} -> {sorted(kp)}")
        # cross-references
        mnx_r, mnx_x, mnx_ec = mnx_reactions(k["id"])
        ids: dict[str, set[str]] = {"kegg.reaction": {k["id"]}}
        if len(mnx_r) == 1:
            ids["metanetx.reaction"] = set(mnx_r)
        for ns in ("seed.reaction", "metacyc.reaction", "rhea"):
            vals = set(mnx_x.get(ns, [])) if len(mnx_r) == 1 else set()
            if ns == "metacyc.reaction" and len(vals) > MAX_METACYC:
                vals = set()
            if vals:
                ids[ns] = vals
        met_by = {m["id"]: m for m in metabolites}
        ent_by = {en["id"]: en for en in entities}
        b_parts = [{"name": ent_by[met_by[p["metabolite"]]["entity"]]["name"], "identifiers": ent_by[met_by[p["metabolite"]]["entity"]]["identifiers"],
                    "coefficient": p["coefficient"], "main": p["main"]} for p in parts]
        ec = step.get("ec") or k["ec"]
        b_cyto, b_all, b_rej = bigg_reactions_for(bigg, [k["id"], *step.get("represents", [])], b_parts, ec)
        bigg_note = ""
        if len(b_cyto) == 1:
            ids["bigg.reaction"] = {b_cyto[0]}
        elif b_cyto:
            bigg_note = f"several cytosolic BiGG reactions fit: {', '.join(b_cyto)}"
        elif b_all:
            bigg_note = f"BiGG reactions only in other compartments: {', '.join(b_all[:6])}"
        if b_rej:
            bigg_note = (bigg_note + "; " if bigg_note else "") + f"BiGG links {', '.join(b_rej[:5])} to this KEGG reaction but the participants differ — not used"
        known = lib_rxn.get(k["id"])
        status = "confirmed" if known else "suggested"
        # a rejected BiGG link is information, not doubt; doubt is several fitting BiGG reactions, no single MetaNetX
        # reaction, or a generic participant (a class of proteins / compounds)
        generic_part = any(ent_by[met_by[p["metabolite"]]["entity"]].get("generic") for p in parts)
        conf = None if known else ("high" if len(mnx_r) == 1 and len(b_cyto) <= 1 and not generic_part and not step.get("review") else "probable")
        note = [f"KEGG {k['id']}" + (f" (represents map reactions {', '.join(step['represents'])})" if step.get("represents") else "")]
        if mnx_r:
            note.append(f"MetaNetX {', '.join(mnx_r)}")
        if bigg_note:
            note.append(bigg_note)
        if step.get("note"):
            note.append(step["note"])
        if step.get("review"):
            note.append(f"curator: {step['review']}")
        if known:
            note.append(f"KEGG ID confirmed in the built-in template ('{known['name']}')")
        variants = []
        for v in step.get("variants", []):
            vk = kr[v["kegg"]]
            variants.append({"name": v["name"], "ec": vk["ec"], "identifiers": {"kegg.reaction": [vk["id"]]}, "equation": vk["definition"], **({"note": v["note"]} if v.get("note") else {})})
        provenance = [{"source": "KEGG", "id": r, "url": f"https://www.kegg.jp/entry/{r}"} for r in sorted({k["id"], *step.get("represents", [])})]
        rid = f"tpl_rxn_{len(reactions) + 1:03d}"
        reactions.append({
            "id": rid, "name": step["name"], "canonicalName": step["canonical"], "participants": parts, "reversible": reversible, "ec": ec,
            "identifiers": {ns: sorted(v) for ns, v in ids.items()}, "level": step.get("level", "required"),
            "identity": {"status": status, "source": "builtin" if known else "ai", **({"confidence": conf} if conf else {}), "note": "; ".join(note)},
            **({"hints": step["hints"]} if step.get("hints") else {}), **({"variants": variants} if variants else {}), "provenance": provenance,
        })
        step["_id"] = rid
        rx_rows.append({"step": step["name"], "kegg": k["id"], "represents": ";".join(step.get("represents", [])), "variants": ";".join(v["kegg"] for v in step.get("variants", [])),
                        "ec": ";".join(ec), "metanetx": ";".join(sorted(ids.get("metanetx.reaction", []))), "metanetx_candidates": ";".join(mnx_r),
                        "bigg": ";".join(sorted(ids.get("bigg.reaction", []))), "bigg_candidates": ";".join(b_all), "bigg_rejected": ";".join(b_rej), "modelseed": ";".join(sorted(ids.get("seed.reaction", []))),
                        "rhea": ";".join(sorted(ids.get("rhea", []))), "metacyc": ";".join(sorted(ids.get("metacyc.reaction", []))),
                        "reversible": reversible, "status": status + (f" ({conf})" if conf else ""), "equation": k["definition"]})

    connectors = []
    for i, c in enumerate(cur.CONNECTORS):
        connectors.append({"id": f"tpl_port_{i + 1:03d}", "metabolite": met_id[c["metabolite"]], "direction": c["direction"],
                           "target": {"pathway": c["pathway"], **({"template": c["template"]} if c.get("template") else {})}})

    # ---- layout (hand-designed in the curation file)
    from layout import Layout
    rx_by_key = {s["key"]: s["_id"] for s in cur.REACTIONS}
    ent_by = {e["id"]: e for e in entities}
    labels = {m["id"]: m.get("label") or ent_by[m["entity"]].get("short") or ent_by[m["entity"]]["name"] for m in metabolites}
    lay = cur.layout(Layout(met_id, rx_by_key, {c["metabolite"] + ">" + c["pathway"]: connectors[i]["id"] for i, c in enumerate(cur.CONNECTORS)},
                            {r["id"]: r for r in reactions}, labels))
    # only what the drawing uses: a cofactor declared for the curation but in no drawn equation would be dropped by the
    # editor the first time the template is opened
    used = {p["metabolite"] for r in reactions for p in r["participants"]} | {n["metabolite"] for n in lay["nodes"]} | {c["metabolite"] for c in connectors}
    unused = [m for m in metabolites if m["id"] not in used]
    if unused:
        log(f"Unused side compounds left out: {', '.join(ent_by[m['entity']]['name'] for m in unused)}")
    metabolites = [m for m in metabolites if m["id"] in used]
    keep_e = {m["entity"] for m in metabolites}
    entities = [e for e in entities if e["id"] in keep_e]
    mapping_rows = [r for r in mapping_rows if ent_id.get(r["kegg"]) in keep_e]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tpl = {
        "format": "gemsmap-template", "schema_version": SCHEMA,
        "metadata": {
            "id": cur.TEMPLATE_ID, "name": cur.NAME, "description": cur.DESCRIPTION, "pathway": getattr(cur, "PATHWAY", pw["name"]), "section": getattr(cur, "SECTION", "KEGG-derived templates"),
            "template_version": cur.VERSION, "scope": cur.SCOPE, "authors": ["Drafted with an LLM (Claude Opus 5.5)"], "created": cur.CREATED, "modified": now,
            "license": "MIT (drawing and curation); identifiers and biology from KEGG, MetaNetX and BiGG", "tags": cur.TAGS,
            "citations": [{"text": "Kanehisa M, Goto S. KEGG: Kyoto Encyclopedia of Genes and Genomes. Nucleic Acids Res 28:27-30 (2000)", "doi": "10.1093/nar/28.1.27"}],
            "layout_kind": getattr(cur, "LAYOUT_KIND", "vertical"), "review_status": "ai-generated",
            "source": {"reference": "KEGG", "pathway_id": map_id, "pathway_name": pw["name"], "url": f"https://www.genome.jp/pathway/{map_id}",
                       "generation_method": "KEGG flat files + KGML (structure only) → curated biological graph → identities reconciled with MetaNetX (backend client) and the BiGG tables → hand-designed layout",
                       "generated_by": "tools/kegg/kegg_template.py", "retrieved": now[:10]},
        },
        "biology": {"compartments": [], "entities": entities, "metabolites": metabolites, "reactions": reactions, "connectors": connectors},
        "layout": lay,
    }
    report = {"pathway": pw, "curation": cur, "recon": recon, "mapping_rows": mapping_rows, "rx_rows": rx_rows, "kr": kr, "kc": kc}
    return tpl, report


# ----------------------------------------------------------------------------- reports

def write_reports(tpl: dict, rep: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    pw, cur = rep["pathway"], rep["curation"]
    with (out / "identity_mapping.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rep["mapping_rows"][0].keys()))
        w.writeheader()
        w.writerows(rep["mapping_rows"])
    with (out / "reaction_mapping.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rep["rx_rows"][0].keys()))
        w.writeheader()
        w.writerows(rep["rx_rows"])

    ents = tpl["biology"]["entities"]
    # KEGG coverage: every compound / reaction of the map, and what became of it
    used_c = {e["provenance"]["id"] for e in ents} | {k for e in ents for r in e.get("related", []) for k in r.get("identifiers", {}).get("kegg.compound", [])}
    om_c = {o["kegg"]: o["reason"] for o in cur.OMITTED_COMPOUNDS}
    represented = {p["id"] for r in tpl["biology"]["reactions"] for p in r.get("provenance", [])}
    variant_r = {v["identifiers"]["kegg.reaction"][0] for r in tpl["biology"]["reactions"] for v in r.get("variants", [])}
    om_r = {o["kegg"]: o["reason"] for o in cur.OMITTED_REACTIONS}
    c_lines, r_lines = [], []
    overview = getattr(cur, "OVERVIEW", False)
    for c in ([] if overview else pw["compounds"]):
        name = (rep["kc"].get(c) or {}).get("names", [c])[0] if rep["kc"].get(c) else c
        tag, how = ("entity", "template entity") if any(e["provenance"]["id"] == c for e in ents) else ("related", "related form of a template entity (anomer / specific form)") if c in used_c else ("omitted", f"omitted — {om_c[c]}") if c in om_c else ("missing", "NOT HANDLED")
        c_lines.append((tag, f"| {c} | {name} | {how} |"))
    for r in ([] if overview else pw["reactions"]):
        steps = [s["name"] for s in cur.REACTIONS if r == s.get("kegg")]
        rep_by = [s["name"] for s in cur.REACTIONS if r in s.get("represents", [])]
        var_of = [s["name"] for s in cur.REACTIONS if any(v["kegg"] == r for v in s.get("variants", []))]
        tag, how = ("drawn", f"drawn step {steps[0]}") if steps else ("represented", f"represented by {', '.join(rep_by)} (anomer-specific form / part of a lumped complex)") if rep_by else \
            ("variant", f"variant of {', '.join(var_of)} (other cofactor or donor)") if var_of else ("omitted", f"omitted — {om_r[r]}") if r in om_r else ("missing", "NOT HANDLED")
        r_lines.append((tag, f"| {r} | {how} |"))
    ids_cov = lambda ns: sum(1 for e in ents if e["identifiers"].get(ns))
    st = lambda s: sum(1 for e in ents if e["identity"]["status"] == s)
    gen = [e for e in ents if e.get("generic")]
    rx = tpl["biology"]["reactions"]
    rx_x = sum(1 for r in rx if set(r["identifiers"]) - {"kegg.reaction"})
    queue = []
    for e in ents:
        s = e["identity"]
        if s["status"] in ("ambiguous", "unresolved") or e.get("generic") or (s["status"] == "suggested" and s.get("confidence") != "high"):
            queue.append(f"| entity | {e['name']} | {s['status']}{' (' + s['confidence'] + ')' if s.get('confidence') else ''}{' · generic' if e.get('generic') else ''} | {s.get('note', '')} |")
    for r in rx:
        s = r["identity"]
        if s["status"] != "confirmed" and (s.get("confidence") != "high" or "several cytosolic BiGG" in s.get("note", "")):
            queue.append(f"| reaction | {r['name']} ({r['canonicalName']}) | {s['status']}{' (' + s['confidence'] + ')' if s.get('confidence') else ''} | {s.get('note', '')} |")
    no_bigg = [f"| {r['name']} | {r['canonicalName']} | {', '.join(r['identifiers'].get('kegg.reaction', []))} | {', '.join(r['identifiers'].get('metanetx.reaction', [])) or '—'} |"
               for r in rx if not r["identifiers"].get("bigg.reaction") and not r.get("summary")]
    n_c = len(pw["compounds"])
    cnt = lambda lines, t: sum(1 for tag, _ in lines if tag == t)
    handled_c = n_c - cnt(c_lines, "missing")
    handled_r = len(pw["reactions"]) - cnt(r_lines, "missing")
    md = [
        f"# {tpl['metadata']['name']} — generation report", "",
        f"Source: KEGG {pw['id']} ({pw['name']}), {tpl['metadata']['source']['url']}. The biology was taken from KEGG's flat files and KGML;",
        "the drawing is GEMs MAP's own and is **not** an official KEGG map. Status: **AI-generated — needs review**.", "",
        "## Completeness", "", "```text",
        *([f"KEGG compounds handled:         {handled_c}/{n_c}  (entities {cnt(c_lines, 'entity')}, related forms {cnt(c_lines, 'related')}, omitted with reason {cnt(c_lines, 'omitted')})"] if not overview else
          [f"Overview of KEGG {pw['id']}:  pathway summaries {sum(1 for r in tpl['biology']['reactions'] if r.get('summary'))}, single reactions {sum(1 for r in tpl['biology']['reactions'] if not r.get('summary'))}"]),
        f"Template entities:              {len(ents)}  (pathway metabolites {len(cur.ENTITIES)}, cofactors / carriers {len(cur.COFACTORS)})",
        f"MetaNetX mapped:                {ids_cov('metanetx.chemical')}",
        f"BiGG mapped:                    {ids_cov('bigg.metabolite')}",
        f"ModelSEED mapped:               {ids_cov('seed.compound')}",
        f"ChEBI mapped:                   {ids_cov('chebi')}",
        f"MetaCyc mapped:                 {ids_cov('metacyc.compound')}", "",
        f"Confirmed (GEMs MAP library):     {st('confirmed')}",
        f"Suggested, high confidence:     {sum(1 for e in ents if e['identity']['status'] == 'suggested' and e['identity'].get('confidence') == 'high')}",
        f"Suggested, probable:            {sum(1 for e in ents if e['identity']['status'] == 'suggested' and e['identity'].get('confidence') == 'probable')}",
        f"Ambiguous metabolites:          {st('ambiguous')}",
        f"Unresolved metabolites:         {st('unresolved')}",
        f"Generic entities:               {len(gen)}  ({', '.join(e['name'] for e in gen) or '—'})", "",
        *([f"KEGG reactions handled:         {handled_r}/{len(pw['reactions'])}  (drawn steps {cnt(r_lines, 'drawn')}, represented {cnt(r_lines, 'represented')}, variants {cnt(r_lines, 'variant')}, omitted {cnt(r_lines, 'omitted')})"] if not overview else []),
        f"Template reactions:             {len(rx)}",
        f"Cross-database mapped reactions:{rx_x:>3}  (MetaNetX {sum(1 for r in rx if r['identifiers'].get('metanetx.reaction'))}, BiGG {sum(1 for r in rx if r['identifiers'].get('bigg.reaction'))}, ModelSEED {sum(1 for r in rx if r['identifiers'].get('seed.reaction'))}, Rhea {sum(1 for r in rx if r['identifiers'].get('rhea'))})",
        f"Ambiguous reactions:            {sum(1 for r in rx if r['identity']['status'] == 'ambiguous')}",
        f"Unresolved reactions:           {sum(1 for r in rx if r['identity']['status'] == 'unresolved')}", "```", "",
        "## Review queue", "", "| Kind | Element | Status | Why |", "| --- | --- | --- | --- |", *queue, "",
        "## Reactions without a BiGG cross-reference", "",
        "Not an error: BiGG's universal namespace has no verified reaction with these participants (bacterial PTS, archaeal / plant",
        "enzymes, phosphatases). The matcher still finds them in a model by MetaNetX / ModelSEED / EC and topology.", "",
        "| Step | Enzyme | KEGG | MetaNetX |", "| --- | --- | --- | --- |", *no_bigg, "",
        *(["## KEGG compounds", "", "| KEGG | Name | In the template |", "| --- | --- | --- |", *[l for _, l in c_lines], "",
           "## KEGG reactions", "", "| KEGG | In the template |", "| --- | --- |", *[l for _, l in r_lines], ""] if not overview else
          ["## Pathway summaries", "", "| Arrow | Pathway | KEGG module(s) |", "| --- | --- | --- |",
           *[f"| {r['name']} | {r['canonicalName']} | {', '.join(p['id'] for p in r['provenance'])} |" for r in tpl["biology"]["reactions"] if r.get("summary")], ""]),
        "## Curation decisions", "", *[f"- {d}" for d in cur.DECISIONS], "",
        "## Generation log", "", "```text", *LOG, "```", "",
    ]
    (out / "report.md").write_text("\n".join(md), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("map_id")
    a = ap.parse_args()
    tpl, rep = build(a.map_id)
    cur = rep["curation"]
    out_t = ROOT / "src" / "templates" / "builtin" / f"{cur.TEMPLATE_ID}.gemsmap-template.json"
    out_t.write_text(json.dumps(tpl, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Template written: {out_t.relative_to(ROOT).as_posix()}")
    write_reports(tpl, rep, ROOT / "docs" / "templates" / "kegg" / a.map_id)


if __name__ == "__main__":
    main()
