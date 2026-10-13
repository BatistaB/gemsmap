"""Template identity search (Template Builder): candidates for "what is this node / this reaction?",
without any GEM.

Compounds: the query goes to KEGG (REST `find/compound`) and ChEBI (EBI OLS4 search); the hits are
resolved through MetaNetX / MNXref, which gives the cross-references (MetaNetX, KEGG, ChEBI, BiGG,
ModelSEED, MetaCyc, HMDB …), formula and charge. Hits that describe the same MNX chemical are merged.
Identifiers typed directly (C00031, CHEBI:17634, MNXM…, cpd00027, HMDB…) are looked up as such.

Reactions: the template's participants (with their identifiers) are resolved to MNX chemicals and the
MNXref reactions that convert a main substrate into a main product are returned, with evidence:
which participants appear in the equation, EC agreement, and the reaction cross-references
(KEGG, Rhea, BiGG, ModelSEED, MetaCyc).

Results are suggestions: the user confirms them in the Template Builder. Every web answer is cached
(identity_cache.sqlite, 90 days) so a repeated search makes no network request. Standard library only.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, Optional

from . import bigg_service
from . import metanetx as mnx_mod
from .annotation_service import MAX_METACYC, compact, mnx_uri, norm_id, parse_mnx_xref

TTL_DAYS = 90
USER_AGENT = "GEMsMAP-TemplateBuilder/0.3 (pathway template identity search)"
KEGG = "https://rest.kegg.jp"
OLS = "https://www.ebi.ac.uk/ols4/api/search"
REAC = "https://rdf.metanetx.org/reac/"

# namespaces returned to the frontend (its identifier keys)
# VMH is left out: MNXref attaches unrelated VMH entries to some chemicals (dolichol sugars to glucose 1-phosphate)
_NS_OUT = {"metanetx.chemical": "metanetx.chemical", "kegg.compound": "kegg.compound", "chebi": "chebi", "bigg.metabolite": "bigg.metabolite",
           "seed.compound": "seed.compound", "metacyc.compound": "metacyc.compound", "hmdb": "hmdb", "lipidmaps": "lipidmaps", "inchikey": "inchikey"}


class SourceUnavailable(Exception):
    pass


# ----------------------------------------------------------------------------- web cache

class WebCache:
    def __init__(self, path: Path):
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.execute("CREATE TABLE IF NOT EXISTS web (key TEXT PRIMARY KEY, body TEXT NOT NULL, at REAL NOT NULL)")
            self._db.commit()

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            row = self._db.execute("SELECT body FROM web WHERE key = ? AND at > ?", (key, time.time() - TTL_DAYS * 86400)).fetchone()
        return row[0] if row else None

    def put(self, key: str, body: str) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO web VALUES (?, ?, ?)", (key, body, time.time()))
            self._db.commit()


_cache: Optional[WebCache] = None
_cache_lock = threading.Lock()


def _web_cache() -> WebCache:
    global _cache
    with _cache_lock:
        if _cache is None:
            from ..registry import cache_dir
            _cache = WebCache(cache_dir().parent / "identity_cache.sqlite")
        return _cache


def _http_get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/plain"})
    last: Exception | None = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=25) as res:
                return res.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ""  # KEGG answers 404 for "no hit"
            last = e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
        time.sleep(1.0 * (attempt + 1))
    raise SourceUnavailable(str(last))


_fetch: Callable[[str], str] = _http_get


def set_fetch(f: Optional[Callable[[str], str]]) -> None:
    """Tests inject a fake transport (no network)."""
    global _fetch
    _fetch = f or _http_get


def fetch(url: str) -> str:
    cache = _web_cache()
    hit = cache.get(url)
    if hit is not None:
        return hit
    body = _fetch(url)
    cache.put(url, body)
    return body


def _sparql(q: str) -> list[dict]:
    """MetaNetX SPARQL with the same cache (reaction queries are not part of the MetaNetX client cache)."""
    key = "sparql:" + hashlib.sha1(q.encode()).hexdigest()
    cache = _web_cache()
    hit = cache.get(key)
    if hit is not None:
        return json.loads(hit)
    rows = mnx_mod.client().query(q)
    cache.put(key, json.dumps(rows))
    return rows


# ----------------------------------------------------------------------------- name matching

def name_score(q: str, names: list[str]) -> tuple[float, str]:
    """Relevance of a hit for a query: 1 exact name, 0.9 exact synonym, 0.7 prefix, 0.5 substring."""
    k = compact(q)
    if not k or not names:
        return 0.0, ""
    if compact(names[0]) == k:
        return 1.0, "exact name"
    for n in names[1:]:
        if compact(n) == k:
            return 0.9, f"synonym “{n}”"
    if any(compact(n).startswith(k) for n in names):
        return 0.7, "name starts with the query"
    if any(k in compact(n) for n in names):
        return 0.5, "name contains the query"
    return 0.3, "related term"


# ----------------------------------------------------------------------------- sources

def kegg_find(q: str, limit: int = 6) -> list[dict]:
    body = fetch(f"{KEGG}/find/compound/{urllib.parse.quote(q)}")
    hits = []
    for line in body.splitlines():
        if "\t" not in line:
            continue
        cid, names = line.split("\t", 1)
        cid = cid.replace("cpd:", "").strip()
        if not re.fullmatch(r"C\d{5}", cid):
            continue
        ns = [n.strip() for n in names.split(";") if n.strip()]
        score, why = name_score(q, ns)
        hits.append({"id": cid, "names": ns, "score": score, "match": why})
    hits.sort(key=lambda h: (-h["score"], len(h["names"][0]) if h["names"] else 99))
    return [h for h in hits if h["score"] >= 0.5][:limit]


def chebi_search(q: str, limit: int = 6) -> list[dict]:
    url = f"{OLS}?{urllib.parse.urlencode({'q': q, 'ontology': 'chebi', 'rows': 15, 'fieldList': 'obo_id,label,synonym'})}"
    body = fetch(url)
    try:
        docs = json.loads(body or "{}").get("response", {}).get("docs", [])
    except ValueError:
        return []
    hits = []
    for d in docs:
        oid = str(d.get("obo_id") or "")
        if not re.fullmatch(r"CHEBI:\d+", oid):
            continue
        ns = [str(d.get("label") or "")] + [str(s) for s in (d.get("synonym") or [])]
        ns = [n for i, n in enumerate(ns) if n and n not in ns[:i]]
        score, why = name_score(q, ns)
        hits.append({"id": oid, "names": ns, "score": score, "match": why})
    hits.sort(key=lambda h: -h["score"])
    return [h for h in hits if h["score"] >= 0.5][:limit]


def _identifiers(info: dict, mnx: str) -> dict[str, list[str]]:
    found: dict[str, set[str]] = {}
    for uri in info.get("xrefs", []):
        p = parse_mnx_xref(uri)
        if p and p[0] in _NS_OUT:
            found.setdefault(_NS_OUT[p[0]], set()).add(p[1])
    if len(found.get("metacyc.compound", ())) > MAX_METACYC:
        found.pop("metacyc.compound")  # MNXref merges whole compound classes into some chemicals
    found.setdefault("metanetx.chemical", set()).add(mnx)
    if info.get("inchikey"):
        found.setdefault("inchikey", set()).add(info["inchikey"])
    return {k: sorted(v) for k, v in found.items()}


_ID_PATTERNS = [
    (re.compile(r"^C\d{5}$", re.I), "kegg.compound"), (re.compile(r"^CHEBI:\s*\d+$", re.I), "chebi"), (re.compile(r"^MNXM\d+$", re.I), "metanetx.chemical"),
    (re.compile(r"^cpd\d{5}$", re.I), "seed.compound"), (re.compile(r"^HMDB\d+$", re.I), "hmdb"),
]


def search_compounds(q: str, limit: int = 8) -> dict:
    q = q.strip()
    status: dict[str, str] = {}
    if not q:
        return {"query": q, "candidates": [], "sources": status}
    direct = next((ns for pat, ns in _ID_PATTERNS if pat.match(q)), None)
    hits: list[tuple[str, str, dict]] = []  # (namespace, id, hit)
    if direct:
        hits.append((direct, norm_id(direct, q), {"names": [], "score": 1.0, "match": f"identifier {q}"}))
    else:
        for name, fn, ns in (("KEGG", kegg_find, "kegg.compound"), ("ChEBI", chebi_search, "chebi")):
            try:
                for h in fn(q):
                    hits.append((ns, h["id"], {**h, "source": name}))
                status[name] = "ok"
            except SourceUnavailable as e:
                status[name] = f"unavailable ({e})"
    # resolve through MNXref
    by_mnx: dict[str, list[tuple[str, str, dict]]] = {}
    lone: list[tuple[str, str, dict]] = []
    try:
        client = mnx_mod.client()
        uris = {mnx_uri(ns, i): (ns, i, h) for ns, i, h in hits if ns != "metanetx.chemical" and mnx_uri(ns, i)}
        resolved = client.resolve_xrefs(uris.keys()) if uris else {}
        for ns, i, h in hits:
            mids = [i] if ns == "metanetx.chemical" else resolved.get(mnx_uri(ns, i) or "", [])
            if not mids:
                lone.append((ns, i, h))
            for m in mids:
                by_mnx.setdefault(m, []).append((ns, i, h))
        info = client.chem_info(by_mnx.keys()) if by_mnx else {}
        status["MetaNetX"] = "ok"
    except mnx_mod.MetaNetXUnavailable as e:
        status["MetaNetX"] = f"unavailable ({e})"
        info, lone = {}, hits
    out = []
    for m, group in by_mnx.items():
        d = info.get(m) or {}
        if not d.get("exists"):
            lone.extend(group)
            continue
        names = [d.get("name") or ""] + [n for _, _, h in group for n in h.get("names", [])]
        names = [n for i, n in enumerate(names) if n and n not in names[:i]]
        best = max(group, key=lambda g: g[2]["score"])
        score, why = (best[2]["score"], best[2]["match"]) if direct else name_score(q, names)
        out.append({
            "name": d.get("name") or names[0], "formula": d.get("formula"), "charge": d.get("charge"), "synonyms": names[1:16],
            "identifiers": _identifiers(d, m), "mnx": m, "structured": bool(d.get("formula") or d.get("inchikey")),
            "sources": sorted({g[2].get("source", "identifier") for g in group} | {"MetaNetX"}),
            "score": round(max(score, best[2]["score"] * 0.95), 3), "match": why or best[2]["match"],
            "note": "via " + ", ".join(sorted({f"{'KEGG' if g[0] == 'kegg.compound' else 'ChEBI' if g[0] == 'chebi' else g[0]} {g[1]}" for g in group})),
        })
    for ns, i, h in lone:  # known to KEGG/ChEBI but not resolved by MNXref: still a candidate, with that one identifier
        if any(i in (c["identifiers"].get(ns) or []) for c in out):
            continue
        names = h.get("names") or [i]
        out.append({"name": names[0], "formula": None, "charge": None, "synonyms": names[1:16], "identifiers": {ns: [i]}, "mnx": None, "structured": False,
                    "sources": [h.get("source", "identifier")], "score": h["score"], "match": h["match"], "note": "not resolved by MetaNetX"})
    # BiGG universal metabolites (local, after a sync): merged with the hits above when they share an identifier
    ix = bigg_service.index()
    if ix is None:
        status["BiGG"] = "not downloaded"
    else:
        status["BiGG"] = "ok"
        for b in ix.search_metabolites(q, limit):
            keys = {(ns, v) for ns, vs in b["identifiers"].items() if ns != "bigg.metabolite" for v in vs}
            hit = next((c for c in out if keys & {(ns, v) for ns, vs in c["identifiers"].items() for v in vs}), None)
            if hit:
                for ns, vs in b["identifiers"].items():
                    hit["identifiers"][ns] = sorted(set(hit["identifiers"].get(ns, [])) | set(vs))
                hit["sources"] = sorted(set(hit["sources"]) | {"BiGG"})
                hit["score"] = max(hit["score"], b["score"])
                hit["note"] = f"{hit.get('note') or ''} · {b['note']}".strip(" ·")
            else:
                out.append(b)
    out.sort(key=lambda c: (-c["score"], not c["structured"], len(c["name"])))
    return {"query": q, "candidates": out[:limit], "sources": status}


# ----------------------------------------------------------------------------- reactions

def _participant_mnx(p: dict, client) -> set[str]:
    ids: set[str] = set()
    uris = []
    for ns, vals in (p.get("identifiers") or {}).items():
        ns = "vmhmetabolite" if ns == "vmh" else ns
        for v in vals or []:
            if ns == "metanetx.chemical":
                ids.add(str(v).upper())
                continue
            i = norm_id(ns, v)
            u = mnx_uri(ns, i) if i else None
            if u:
                uris.append(u)
    if uris:
        for v in client.resolve_xrefs(uris).values():
            ids.update(v)
    return ids


def _reaction_xrefs(uris: list[str]) -> dict[str, list[str]]:
    out: dict[str, set[str]] = {}
    for u in uris:
        m = re.match(r"https?://identifiers\.org/([^:/]+)[:/](.+)$", u)
        if m:
            prefix, rest = m.group(1).lower(), m.group(2)
            ns = {"kegg.reaction": "kegg.reaction", "seed.reaction": "seed.reaction", "metacyc.reaction": "metacyc.reaction", "rhea": "rhea", "bigg.reaction": "bigg.reaction"}.get(prefix)
            if ns:
                out.setdefault(ns, set()).add(rest)
            continue
        m = re.match(r"https?://rdf\.rhea-db\.org/(\d+)$", u)
        if m:
            out.setdefault("rhea", set()).add(m.group(1))
            continue
        m = re.match(r"https?://bigg\.ucsd\.edu/universal/reactions/(.+)$", u)
        if m and not m.group(1).startswith("R_"):  # R_PGI is an SBML-prefixed copy of PGI
            out.setdefault("bigg.reaction", set()).add(m.group(1))
    return {k: sorted(v) for k, v in out.items()}


def search_reactions(participants: list[dict], ec: list[str], limit: int = 8) -> dict:
    """BiGG universal reactions (local, every participant and compartment scored) and MNXref reactions."""
    ix = bigg_service.index()
    bigg = ix.search_reactions(participants, ec, limit) if ix else {"candidates": [], "notes": ["BiGG data not downloaded (Template Library → BiGG)"]}
    mnx = search_reactions_mnx(participants, ec, limit)
    out = list(bigg["candidates"])
    for c in mnx["candidates"]:
        # the same MNXref reaction already behind a BiGG candidate: one row, both sources
        hit = next((b for b in out if set(b["identifiers"].get("metanetx.reaction", [])) & set(c["identifiers"].get("metanetx.reaction", []))), None)
        if hit:
            for ns, vs in c["identifiers"].items():
                hit["identifiers"][ns] = sorted(set(hit["identifiers"].get(ns, [])) | set(vs))
            hit["sources"] = sorted(set(hit["sources"]) | {"MetaNetX"})
        else:
            out.append(c)
    # MetaNetX is the reference: MNXref candidates first; BiGG candidates follow as complementary evidence
    # (their score also weighs compartments, cofactors and coefficients — the two scales are not comparable)
    out.sort(key=lambda c: ("MetaNetX" not in c["sources"], -c["score"]))
    return {"candidates": out[:limit], "notes": bigg["notes"] + [n for n in mnx["notes"] if n not in bigg["notes"]]}


def search_reactions_mnx(participants: list[dict], ec: list[str], limit: int = 8) -> dict:
    """participants: [{name, identifiers, coefficient, main}] — coefficient < 0 substrate, > 0 product."""
    try:
        client = mnx_mod.client()
        resolved = [(p, _participant_mnx(p, client)) for p in participants]
    except mnx_mod.MetaNetXUnavailable as e:
        return {"candidates": [], "notes": [f"MetaNetX unavailable ({e})"]}
    subs = [x for x in resolved if x[0].get("coefficient", 0) < 0 and x[0].get("main") and x[1]]
    prods = [x for x in resolved if x[0].get("coefficient", 0) > 0 and x[0].get("main") and x[1]]
    notes = [f"{p.get('name') or '?'}: no MetaNetX chemical for its identifiers" for p, m in resolved if not m]
    if not subs or not prods:
        return {"candidates": [], "notes": notes + ["Define the identity of at least one drawn substrate and one drawn product first"]}
    a, b = subs[0][1], prods[0][1]
    vals = lambda ids: " ".join(f"<{mnx_mod.CHEM}{i}>" for i in sorted(ids))
    try:
        rows = _sparql(
            "SELECT DISTINCT ?reac ?eq WHERE { VALUES ?ca { " + vals(a) + " } VALUES ?cb { " + vals(b) + " } "
            "{ ?reac mnx:left ?pa . ?reac mnx:right ?pb } UNION { ?reac mnx:right ?pa . ?reac mnx:left ?pb } "
            "?pa mnx:chem ?ca . ?pb mnx:chem ?cb . ?reac rdfs:comment ?eq } LIMIT 40")
        reacs = sorted({r["reac"].replace(REAC, "") for r in rows if re.fullmatch(r"MNXR\d+", r["reac"].replace(REAC, ""))})
        if not reacs:
            return {"candidates": [], "notes": notes + ["MNXref has no reaction converting these compounds"]}
        rv = " ".join(f"<{REAC}{r}>" for r in reacs)
        parts = _sparql("SELECT ?reac ?side ?chem ?coef WHERE { VALUES ?reac { " + rv + " } ?reac ?side ?p . FILTER(?side IN (mnx:left, mnx:right)) ?p mnx:chem ?chem . OPTIONAL { ?p mnx:coef ?coef } }")
        meta = _sparql("SELECT ?reac ?p ?o WHERE { VALUES ?reac { " + rv + " } ?reac ?p ?o . FILTER(?p IN (rdfs:comment, mnx:classification, mnx:reacXref, mnx:reacRefer, mnx:isBalanced)) }")
    except mnx_mod.MetaNetXUnavailable as e:
        return {"candidates": [], "notes": notes + [f"MetaNetX unavailable ({e})"]}
    eqs: dict[str, dict] = {r: {"left": set(), "right": set(), "ec": set(), "xrefs": [], "eq": "", "balanced": None} for r in reacs}
    for p in parts:
        r = p["reac"].replace(REAC, "")
        side = "left" if p["side"].endswith("left") else "right"
        eqs[r][side].add(p["chem"].replace(mnx_mod.CHEM, ""))
    for m in meta:
        r, pred, o = m["reac"].replace(REAC, ""), m["p"].rsplit("/", 1)[-1].split("#")[-1], m["o"]
        if pred == "comment":
            eqs[r]["eq"] = o
        elif pred == "classification":
            eqs[r]["ec"].add(o)
        elif pred in ("reacXref", "reacRefer"):
            eqs[r]["xrefs"].append(o)
        elif pred == "isBalanced":
            eqs[r]["balanced"] = o in ("1", "true")
    names = {}
    try:
        info = client.chem_info({c for e in eqs.values() for c in e["left"] | e["right"]})
        names = {k: v.get("name") for k, v in info.items()}
    except mnx_mod.MetaNetXUnavailable:
        pass
    out = []
    for r, e in eqs.items():
        forward = bool(a & e["left"]) and bool(b & e["right"])
        sub_side, prod_side = (e["left"], e["right"]) if forward else (e["right"], e["left"])
        evidence = []
        hit = 0
        for p, mids in resolved:
            side = sub_side if p.get("coefficient", 0) < 0 else prod_side
            role = "substrate" if p.get("coefficient", 0) < 0 else "product"
            if mids & side:
                hit += 1
                evidence.append({"ok": True, "text": f"{p.get('name') or '?'} ({role})"})
            elif mids & (e["left"] | e["right"]):
                evidence.append({"ok": False, "text": f"{p.get('name') or '?'} is on the other side"})
            else:
                evidence.append({"ok": False, "text": f"{p.get('name') or '?'} not in this equation"})
        extra = len((e["left"] | e["right"]) - set().union(*(m for _, m in resolved)))
        if extra:
            evidence.append({"ok": None, "text": f"{extra} other compound(s) in the MNXref equation"})
        ec_ok = bool(set(ec) & e["ec"])
        if ec:
            evidence.append({"ok": ec_ok, "text": f"EC {', '.join(sorted(e['ec'])) or 'none'}" + (" matches" if ec_ok else f" (template: {', '.join(ec)})")})
        score = hit / max(1, len(resolved)) * 0.8 + (0.2 if ec_ok else 0) - 0.02 * extra
        ids = _reaction_xrefs(e["xrefs"])
        ids["metanetx.reaction"] = [r]
        readable = re.sub(r"(\d+(?:\.\d+)?) (MNXM\d+)@MNX[DC]\d+", lambda m: (m.group(1) + " " if m.group(1) not in ("1", "1.0") else "") + (names.get(m.group(2)) or m.group(2)), e["eq"])
        out.append({"name": r, "ec": sorted(e["ec"]), "identifiers": ids, "equation": readable, "balanced": e["balanced"],
                    "direction": "as drawn" if forward else "written in reverse in MNXref", "sources": ["MetaNetX"], "score": round(max(0.0, min(1.0, score)), 3), "evidence": evidence})
    out.sort(key=lambda c: -c["score"])
    return {"candidates": out[:limit], "notes": notes}
