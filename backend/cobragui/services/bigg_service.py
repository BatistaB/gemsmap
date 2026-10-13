"""BiGG data layer: the universal metabolites and reactions of BiGG Models (https://bigg.bio) as a local knowledge
base for building templates. GEMs MAP does not talk to the BiGG API: the published bulk tables are installed once
(``gemsmap bigg-data``, or ``npm run bigg:data`` in a development checkout) into the backend cache and indexed in memory.

1. Metabolite identity: search by BiGG ID (current or superseded), any cross-referenced identifier (KEGG, ChEBI,
   MetaNetX, ModelSEED, MetaCyc, HMDB) or name. A candidate carries the BiGG universal ID, the union of the
   cross-references of its charge states, and the formula / charge of the neutral form.
2. Reaction identity: the template's participants (all of them, cofactors included) are resolved to BiGG universal
   metabolites through their identifiers, and the universal reactions that convert a main substrate into a main
   product are scored on participant coverage, coefficients, compartments, EC and transport consistency, with
   evidence for every point.
3. BiGG IDs for templates: entities and reactions get their BiGG universal IDs when exactly one fits, so a template
   matches models downloaded from BiGG by their own identifiers.
4. Models downloaded from BiGG: IDs normalized (``__<model>__`` prefixes of model-specific entries removed) and
   annotations completed from the universal tables when the file is imported.

Nothing here decides an identity: the Template Builder shows candidates and the user confirms them.
Standard library only.
"""
from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path
from typing import Optional

from .annotation_service import compact

SOURCE = "https://bigg.bio"

# BiGG cross-reference namespaces -> GEMs MAP identifier keys (others: drugbank, kegg.drug, wikipedia, GO are left out)
MET_NS = {"CHEBI": "chebi", "kegg.compound": "kegg.compound", "metacyc.compound": "metacyc.compound", "metanetx.chemical": "metanetx.chemical",
          "seed.compound": "seed.compound", "hmdb": "hmdb", "inchikey": "inchikey"}
RXN_NS = {"metanetx.reaction": "metanetx.reaction", "metacyc.reaction": "metacyc.reaction", "seed.reaction": "seed.reaction", "rhea": "rhea",
          "kegg.reaction": "kegg.reaction"}
# BiGG compartment ids -> template conceptual compartments
COMPARTMENT = {"c": "cytosol", "m": "mitochondria", "e": "extracellular", "p": "periplasm", "x": "peroxisome", "r": "endoplasmic_reticulum",
               "n": "nucleus", "v": "vacuole", "g": "golgi", "l": "lysosome", "h": "chloroplast", "u": "thylakoid", "im": "mitochondrial_intermembrane"}
PROTON = {"h"}  # templates usually leave protons out; never counted against a candidate


class BiggDataError(Exception):
    pass


def data_dir() -> Path:
    from ..registry import cache_dir
    d = cache_dir().parent / "bigg"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ----------------------------------------------------------------------------- index

def _norm(ns: str, v: str) -> str:
    v = str(v).strip()
    if ns == "chebi":
        m = re.search(r"(\d+)$", v)
        return f"CHEBI:{int(m.group(1))}" if m else v
    if ns in ("kegg.compound", "kegg.reaction", "metanetx.chemical", "metanetx.reaction", "inchikey"):
        return v.upper()
    if ns in ("seed.compound", "seed.reaction"):
        return v.lower()
    if ns == "hmdb":
        m = re.search(r"(\d+)$", v)
        return f"HMDB{m.group(1).zfill(7)}" if m else v
    if ns == "metacyc.compound" or ns == "metacyc.reaction":
        return v.upper()
    return v


def _split_cid(cid: str) -> tuple[str, str]:
    """'g6p_c' -> ('g6p', 'c'); compartment = the shortest known suffix."""
    for c in sorted(COMPARTMENT, key=len, reverse=True):
        if cid.endswith("_" + c):
            return cid[: -len(c) - 1], c
    i = cid.rfind("_")
    return (cid[:i], cid[i + 1:]) if i > 0 else (cid, "")


class BiggIndex:
    def __init__(self, metabolites: list[dict], reactions: list[dict]):
        self.mets: dict[str, dict] = {}
        for row in metabolites:
            uid = row.get("universalcomponent__bigg_id") or str(row.get("bigg_id", "")).split(":")[0]
            m = self.mets.setdefault(uid, {"id": uid, "name": None, "names": [], "formula": None, "charge": None, "xrefs": {}, "old": set(), "comps": set()})
            if row.get("charge") == 0 or m["formula"] is None:
                m["formula"], m["charge"] = row.get("formula"), row.get("charge")
                if row.get("charge") == 0 and row.get("name"):
                    m["name"] = row["name"]
            for n in (row.get("name"), row.get("universalcomponent__name")):
                if n and n not in m["names"]:
                    m["names"].append(n)
            m["old"].update(row.get("universalcomponent__old_bigg_ids") or [])
            for cc in row.get("compartmentalized_components") or []:
                m["comps"].add(_split_cid(cc.split(":")[0])[1])
            for x in row.get("cross_references") or []:
                ns = MET_NS.get(x.get("namespace"))
                if ns and not x.get("source_obsolete"):
                    m["xrefs"].setdefault(ns, set()).add(_norm(ns, x["identifier"]))
        self.by_xref: dict[str, set[str]] = {}
        self.by_name: dict[str, set[str]] = {}
        self.by_old: dict[str, str] = {}
        for m in self.mets.values():
            m["name"] = m["name"] or (m["names"][0] if m["names"] else m["id"])
            for ns, vals in m["xrefs"].items():
                for v in vals:
                    self.by_xref.setdefault(f"{ns}:{v}", set()).add(m["id"])
            for n in m["names"]:
                self.by_name.setdefault(compact(n), set()).add(m["id"])
            for o in m["old"]:
                self.by_old[o] = m["id"]

        self.rxns: dict[str, dict] = {}
        for row in reactions:
            rid = row.get("universalreaction__bigg_id") or row.get("bigg_id")
            r = self.rxns.get(rid)
            if r is None:
                parts = []
                for coef, cid in row.get("universalreaction__participants") or []:
                    base, comp = _split_cid(cid)
                    parts.append((float(coef), base, comp))
                r = self.rxns[rid] = {
                    "id": rid, "name": row.get("universalreaction__name") or rid, "parts": parts,
                    "transport": bool(row.get("universalreaction__is_transport")), "exchange": bool(row.get("universalreaction__is_exchange")),
                    "pseudo": bool(row.get("universalreaction__is_pseudo")), "xrefs": {}, "ec": set(), "old": set(row.get("universalreaction__old_bigg_ids") or []),
                }
            for x in row.get("cross_references") or []:
                if x.get("source_obsolete"):
                    continue
                if x.get("namespace") == "ec-code":
                    r["ec"].add(x["identifier"])
                    continue
                ns = RXN_NS.get(x.get("namespace"))
                if ns:
                    r["xrefs"].setdefault(ns, set()).add(_norm(ns, x["identifier"]))
        self.rxn_by_met: dict[str, set[str]] = {}
        self.rxn_by_old: dict[str, str] = {}
        for r in self.rxns.values():
            for _, base, _c in r["parts"]:
                self.rxn_by_met.setdefault(base, set()).add(r["id"])
            for o in r["old"]:
                self.rxn_by_old[o] = r["id"]

    # ------------------------------------------------------------------ metabolites

    def met_candidate(self, uid: str, score: float, match: str) -> dict:
        m = self.mets[uid]
        ids = {ns: sorted(v) for ns, v in m["xrefs"].items()}
        ids["bigg.metabolite"] = [uid]
        return {"name": m["name"], "formula": m["formula"], "charge": m["charge"], "synonyms": [n for n in m["names"] if n != m["name"]][:12],
                "identifiers": ids, "mnx": (ids.get("metanetx.chemical") or [None])[0], "structured": bool(m["formula"]),
                "sources": ["BiGG"], "score": score, "match": match, "note": f"BiGG universal {uid}" + (f" · compartments in models: {', '.join(sorted(m['comps']))}" if m["comps"] else "")}

    def resolve(self, identifiers: dict) -> set[str]:
        """BiGG universal metabolites for a set of identifiers (template entity)."""
        out: set[str] = set()
        for ns, vals in (identifiers or {}).items():
            for v in vals or []:
                if ns == "bigg.metabolite":
                    v = re.sub(r"^M_", "", str(v))
                    if v in self.mets:
                        out.add(v)
                    elif v in self.by_old:
                        out.add(self.by_old[v])
                    continue
                key = MET_NS.get(ns, ns if ns in MET_NS.values() else None)
                if key:
                    out |= self.by_xref.get(f"{key}:{_norm(key, v)}", set())
        return out

    def search_metabolites(self, q: str, limit: int = 8) -> list[dict]:
        q = q.strip()
        if not q:
            return []
        hits: dict[str, tuple[float, str]] = {}

        def add(uid: str, score: float, why: str):
            if uid in self.mets and score > hits.get(uid, (0, ""))[0]:
                hits[uid] = (score, why)

        base = re.sub(r"^M_", "", q)
        if base in self.mets:
            add(base, 1.0, f"BiGG ID {base}")
        if base in self.by_old:
            add(self.by_old[base], 0.97, f"superseded BiGG ID {base}")
        stripped = _split_cid(base)[0]
        if stripped != base and stripped in self.mets:
            add(stripped, 0.95, f"BiGG ID {stripped} (compartment suffix ignored)")
        for pat, ns in ((r"^C\d{5}$", "kegg.compound"), (r"^CHEBI:\s*\d+$", "chebi"), (r"^MNXM\d+$", "metanetx.chemical"), (r"^cpd\d{5}$", "seed.compound"), (r"^HMDB\d+$", "hmdb")):
            if re.match(pat, q, re.I):
                for uid in self.by_xref.get(f"{ns}:{_norm(ns, q)}", ()):
                    add(uid, 1.0, f"identifier {q}")
        k = compact(q)
        if k:
            for uid in self.by_name.get(k, ()):
                m = self.mets[uid]
                add(uid, 1.0 if compact(m["name"]) == k else 0.9, "exact name" if compact(m["name"]) == k else "name of a charge state")
            if len(k) >= 3 and len(hits) < limit:
                for key, uids in self.by_name.items():
                    if key.startswith(k) or (len(k) >= 4 and k in key):
                        for uid in uids:
                            add(uid, 0.7 if key.startswith(k) else 0.5, "name starts with the query" if key.startswith(k) else "name contains the query")
        ranked = sorted(hits.items(), key=lambda kv: (-kv[1][0], len(self.mets[kv[0]]["name"])))[:limit]
        return [self.met_candidate(uid, s, why) for uid, (s, why) in ranked]

    # ------------------------------------------------------------------ reactions

    def met_name(self, base: str) -> str:
        m = self.mets.get(base)
        return m["name"] if m else base

    def equation(self, r: dict) -> str:
        def term(c, base, comp):
            n = abs(c)
            return f"{'' if n == 1 else (int(n) if n == int(n) else n)} {self.met_name(base)} [{comp}]".strip()
        left = " + ".join(term(c, b, k) for c, b, k in r["parts"] if c < 0)
        right = " + ".join(term(c, b, k) for c, b, k in r["parts"] if c > 0)
        return f"{left} ⇌ {right}"

    def search_reactions(self, participants: list[dict], ec: list[str], limit: int = 8) -> dict:
        resolved = [(p, self.resolve(p.get("identifiers") or {})) for p in participants]
        notes = [f"{p.get('name') or '?'}: not found in BiGG through its identifiers" for p, ids in resolved if not ids]
        subs = [x for x in resolved if (x[0].get("coefficient") or 0) < 0 and x[0].get("main", True) and x[1]]
        prods = [x for x in resolved if (x[0].get("coefficient") or 0) > 0 and x[0].get("main", True) and x[1]]
        if not subs or not prods:
            return {"candidates": [], "notes": notes + ["BiGG needs the identity of at least one drawn substrate and one drawn product"]}
        a, b = subs[0][1], prods[0][1]
        cand = set().union(*(self.rxn_by_met.get(x, set()) for x in a)) & set().union(*(self.rxn_by_met.get(x, set()) for x in b))
        comps_t = {p.get("compartment") for p, _ in resolved if p.get("compartment")}
        spans = len(comps_t) > 1
        out = []
        for rid in cand:
            r = self.rxns[rid]
            if r["pseudo"] or r["exchange"]:
                continue
            side = {}  # base -> (sign, coef, comp)
            for c, base, comp in r["parts"]:
                side.setdefault(base, []).append((1 if c > 0 else -1, abs(c), comp))
            fwd = any(s < 0 for x in a for s, _, _ in side.get(x, [])) and any(s > 0 for x in b for s, _, _ in side.get(x, []))
            rev = any(s > 0 for x in a for s, _, _ in side.get(x, [])) and any(s < 0 for x in b for s, _, _ in side.get(x, []))
            if not (fwd or rev):
                continue
            flip = 1 if fwd else -1
            evidence, got, total, coef_ok, comp_bad = [], 0.0, 0.0, True, 0
            used: set[str] = set()
            for p, ids in resolved:
                w = 1.0 if p.get("main", True) else 0.5
                total += w
                want = (1 if (p.get("coefficient") or 0) > 0 else -1) * flip
                role = "substrate" if (p.get("coefficient") or 0) < 0 else "product"
                match = [(base, s, n, k) for base in ids for s, n, k in side.get(base, []) if s == want]
                if match:
                    base, _, n, k = match[0]
                    used.add(base)
                    got += w
                    if abs(n - abs(p.get("coefficient") or 1)) > 1e-9:
                        coef_ok = False
                    tc = p.get("compartment")
                    comp_txt = ""
                    if tc and COMPARTMENT.get(k) and COMPARTMENT[k] != tc:
                        comp_bad += 1
                        comp_txt = f" — BiGG has it in {COMPARTMENT[k]} ({k})"
                    evidence.append({"ok": not comp_txt, "text": f"{p.get('name') or base} ({role}, BiGG {base}_{k}){comp_txt}"})
                elif any(base in side for base in ids):
                    evidence.append({"ok": False, "text": f"{p.get('name') or '?'} is on the other side"})
                else:
                    evidence.append({"ok": False, "text": f"{p.get('name') or '?'} not in this reaction"})
            extra = [base for base in side if base not in used and base not in PROTON]
            if extra:
                evidence.append({"ok": None, "text": f"also in BiGG: {', '.join(self.met_name(x) for x in extra[:5])}"})
            if not coef_ok:
                evidence.append({"ok": False, "text": "stoichiometric coefficients differ"})
            ec_ok = bool(set(ec) & r["ec"])
            if ec and r["ec"]:
                evidence.append({"ok": ec_ok, "text": f"EC {', '.join(sorted(r['ec']))}" + (" matches" if ec_ok else f" (template: {', '.join(ec)})")})
            elif ec:
                evidence.append({"ok": None, "text": "no EC number in BiGG for this reaction"})
            if r["transport"] != spans:
                evidence.append({"ok": False, "text": "BiGG marks it as a transport reaction" if r["transport"] else "the template reaction spans compartments, BiGG's does not"})
            score = got / total * 0.75 + (0.1 if ec_ok else 0) + (0.05 if coef_ok else 0) + (0.1 if r["transport"] == spans else 0)
            score -= 0.03 * len(extra) + 0.08 * comp_bad
            ids_out = {ns: sorted(v) for ns, v in r["xrefs"].items()}
            ids_out["bigg.reaction"] = [rid]
            out.append({"name": rid, "canonicalName": r["name"], "ec": sorted(r["ec"]), "identifiers": ids_out, "equation": self.equation(r),
                        "direction": "as drawn" if fwd else "written in reverse in BiGG", "sources": ["BiGG"],
                        "score": round(max(0.0, min(1.0, score)), 3), "evidence": evidence})
        out.sort(key=lambda c: (-c["score"], c["name"]))
        return {"candidates": out[:limit], "notes": notes}


# ----------------------------------------------------------------------------- data files

_index: Optional[BiggIndex] = None
_index_stamp: Optional[float] = None
_lock = threading.Lock()


def _files() -> tuple[Path, Path, Path]:
    d = data_dir()
    return d / "metabolites.json", d / "reactions.json", d / "meta.json"


def status() -> dict:
    met, rxn, meta = _files()
    if not (met.exists() and rxn.exists() and meta.exists()):
        return {"available": False, "source": SOURCE, "install": "gemsmap bigg-data"}
    info = json.loads(meta.read_text(encoding="utf-8"))
    return {"available": True, "source": info.get("source", SOURCE), "installed": info.get("installed"),
            "metabolites": info.get("metabolites"), "reactions": info.get("reactions"), "bytes": info.get("bytes")}


def install(met_bytes: bytes, rxn_bytes: bytes, source: str = SOURCE) -> dict:
    """Install the bulk metabolite and reaction tables of BiGG (the JSON files of bigg.bio/data_access)."""
    try:
        mets, rxns = json.loads(met_bytes), json.loads(rxn_bytes)
    except ValueError as e:
        raise BiggDataError(f"not BiGG JSON ({e})")
    if not (isinstance(mets, list) and mets and "universalcomponent__bigg_id" in mets[0]):
        raise BiggDataError("the metabolite file is not the BiGG metabolite download")
    if not (isinstance(rxns, list) and rxns and "universalreaction__bigg_id" in rxns[0]):
        raise BiggDataError("the reaction file is not the BiGG reaction download")
    ix = BiggIndex(mets, rxns)
    met, rxn, meta = _files()
    met.write_bytes(met_bytes)
    rxn.write_bytes(rxn_bytes)
    meta.write_text(json.dumps({"source": source, "installed": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                "metabolites": len(ix.mets), "reactions": len(ix.rxns), "bytes": len(met_bytes) + len(rxn_bytes)}), encoding="utf-8")
    global _index, _index_stamp
    with _lock:
        _index, _index_stamp = ix, meta.stat().st_mtime
    return status()


BULK_URL = "https://bigg.bio/api/v3/download/{}"


def download_bulk(kind: str, log=print) -> bytes:
    """One published bulk file of bigg.bio ('metabolites' or 'reactions'); only used by the one-time installation."""
    import urllib.request
    from .. import __version__
    log(f"Downloading {BULK_URL.format(kind)} …")
    req = urllib.request.Request(BULK_URL.format(kind), headers={"User-Agent": f"GEMsMAP/{__version__} (template data layer, one-time install)"})
    with urllib.request.urlopen(req, timeout=600) as res:
        return res.read()


def read_bulk(folder: Path, kind: str, log=print) -> bytes:
    """A bulk file downloaded by hand from https://bigg.bio/data_access (a *metabolites*.json / *reactions*.json)."""
    hits = sorted(p for p in Path(folder).glob("*.json") if kind in p.name.lower())
    if not hits:
        raise BiggDataError(f"no *{kind}*.json in {folder}")
    log(f"Reading {hits[0]}")
    return hits[0].read_bytes()


def install_from(folder: Optional[Path] = None, log=print) -> dict:
    """Download (or read from ``folder``) the two bulk tables and install them: `gemsmap bigg-data` / `npm run bigg:data`."""
    if folder:
        return install(read_bulk(folder, "metabolites", log), read_bulk(folder, "reactions", log), f"{SOURCE} (local files)")
    return install(download_bulk("metabolites", log), download_bulk("reactions", log), SOURCE)


def reset() -> None:
    """Forget the in-memory index (tests)."""
    global _index, _index_stamp
    with _lock:
        _index, _index_stamp = None, None


def index() -> Optional[BiggIndex]:
    """The in-memory index of the installed tables (None until installed)."""
    global _index, _index_stamp
    met, rxn, meta = _files()
    if not meta.exists():
        return None
    stamp = meta.stat().st_mtime
    with _lock:
        if _index is None or _index_stamp != stamp:
            _index = BiggIndex(json.loads(met.read_text(encoding="utf-8")), json.loads(rxn.read_text(encoding="utf-8")))
            _index_stamp = stamp
        return _index


# ----------------------------------------------------------------------------- BiGG IDs for templates

def template_bigg_ids(entities: list[dict], reactions: list[dict]) -> dict:
    """BiGG universal IDs for template entities (through their identifiers) and reactions (through their participants).
    An ID is proposed only when it is unambiguous; otherwise the candidates are returned for review."""
    ix = index()
    if ix is None:
        return {"available": False, "entities": {}, "reactions": {}}
    ents = {}
    for e in entities:
        have = set((e.get("identifiers") or {}).get("bigg.metabolite") or [])
        found = ix.resolve({k: v for k, v in (e.get("identifiers") or {}).items() if k != "bigg.metabolite"})
        if not found:
            ents[e["id"]] = {"status": "none"}
        elif have & found:
            ents[e["id"]] = {"status": "known", "bigg": sorted(have & found)[0]}
        elif len(found) == 1:
            uid = next(iter(found))
            extra = {ns: sorted(v) for ns, v in ix.mets[uid]["xrefs"].items()}
            ents[e["id"]] = {"status": "known" if uid in have else "one", "bigg": uid, "name": ix.mets[uid]["name"], "identifiers": extra}
        else:
            ents[e["id"]] = {"status": "several", "candidates": [{"bigg": u, "name": ix.mets[u]["name"]} for u in sorted(found)]}
    rxns = {}
    for r in reactions:
        have = set((r.get("identifiers") or {}).get("bigg.reaction") or [])
        res = ix.search_reactions(r.get("participants") or [], r.get("ec") or [], 3)
        # proposed only when nothing contradicts the template (every participant present, same side, compartment,
        # coefficient; EC agreeing when given) and the candidate stands out; extra BiGG cofactors are allowed
        c = [x for x in res["candidates"] if all(e["ok"] is not False for e in x["evidence"])]
        tied = [x for x in c if c and c[0]["score"] - x["score"] < 0.1]
        if not c:
            rxns[r["id"]] = {"status": "none", "notes": res["notes"]}
        elif have & {x["name"] for x in tied}:
            rxns[r["id"]] = {"status": "known", "bigg": sorted(have & {x["name"] for x in tied})[0]}
        elif len(tied) > 1:
            rxns[r["id"]] = {"status": "several", "candidates": [{"bigg": x["name"], "name": x["canonicalName"], "score": x["score"]} for x in c[:3]]}
        else:
            top = c[0]
            rxns[r["id"]] = {"status": "known" if top["name"] in have else "one", "bigg": top["name"], "name": top["canonicalName"], "score": top["score"],
                             "identifiers": top["identifiers"], "ec": top["ec"], "equation": top["equation"]}
    return {"available": True, "entities": ents, "reactions": rxns}


# ----------------------------------------------------------------------------- models exported by BiGG

def looks_like_bigg_export(model: dict) -> bool:
    """bigg.bio model files: 'biggr' annotations and/or '__<model id>__' prefixes on model-specific entries."""
    mid = model.get("id") or ""
    mets = model.get("metabolites") or []
    return any("biggr" in (m.get("annotation") or {}) for m in mets[:50]) or (bool(mid) and any(str(m.get("id", "")).startswith(f"__{mid}__") for m in mets[:200]))


def enrich_model(model: dict) -> tuple[dict, dict]:
    """Normalize the IDs of a model file exported by bigg.bio and complete its annotations from the universal tables."""
    mid = model.get("id") or ""
    prefix = f"__{mid}__" if mid else None
    fix = (lambda s: s.replace(prefix, "")) if prefix else (lambda s: s)
    ix = index()
    report = {"metabolites": 0, "metabolitesAnnotated": 0, "reactions": 0, "reactionsAnnotated": 0, "renamed": 0, "bigg": ix is not None}
    seen: set[str] = set()
    out_mets = []
    for m in model.get("metabolites", []):
        new_id = fix(m["id"])
        if new_id in seen:  # keep the original when the prefix-free ID is taken
            new_id = m["id"]
        seen.add(new_id)
        report["renamed"] += new_id != m["id"]
        ann = {k: v for k, v in (m.get("annotation") or {}).items() if k != "biggr"}
        base = _split_cid(new_id)[0]
        ann.setdefault("bigg.metabolite", base)
        if ix and base in ix.mets:
            for ns, vals in ix.mets[base]["xrefs"].items():
                cur = ann.get(ns)
                cur = cur if isinstance(cur, list) else [cur] if cur else []
                ann[ns] = sorted(set(map(str, cur)) | vals)
            report["metabolitesAnnotated"] += 1
        report["metabolites"] += 1
        out_mets.append({**m, "id": new_id, "annotation": ann})
    rename = {m["id"]: o["id"] for m, o in zip(model.get("metabolites", []), out_mets)}
    out_rxns = []
    for r in model.get("reactions", []):
        new_id = fix(r["id"])
        ann = {k: v for k, v in (r.get("annotation") or {}).items() if k != "biggr"}
        base = new_id
        if ix and base not in ix.rxns:
            base = ix.rxn_by_old.get(base, base)
        ann.setdefault("bigg.reaction", base)
        if ix and base in ix.rxns:
            rr = ix.rxns[base]
            for ns, vals in rr["xrefs"].items():
                ann[ns] = sorted(vals)
            if rr["ec"]:
                ann["ec-code"] = sorted(rr["ec"])
            report["reactionsAnnotated"] += 1
        report["reactions"] += 1
        out_rxns.append({**r, "id": new_id, "metabolites": {rename.get(k, fix(k)): v for k, v in r.get("metabolites", {}).items()}, "annotation": ann})
    notes = dict(model.get("notes") or {})
    notes["GEMs MAP"] = "BiGG export: IDs normalized; annotations completed from the BiGG universal tables" if ix else "BiGG export: IDs normalized"
    return {**model, "metabolites": out_mets, "reactions": out_rxns, "notes": notes}, report



def normalize_bigg_json(data: bytes) -> tuple[bytes, Optional[dict]]:
    """For a COBRA JSON exported by BiGG: normalized and annotated copy plus a report; other files unchanged."""
    try:
        model = json.loads(data)
    except ValueError:
        return data, None
    if not isinstance(model, dict) or not looks_like_bigg_export(model):
        return data, None
    m, report = enrich_model(model)
    return json.dumps(m).encode("utf-8"), report
