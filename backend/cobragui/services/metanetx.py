"""MetaNetX / MNXref client (SPARQL endpoint https://rdf.metanetx.org/sparql) with a local SQLite cache.

Only identifiers go to the ID mapper (an exact name lookup is a separate, explicitly weaker query).
Every answer — including "not found" — is cached, so a model is never queried twice and the analysis
keeps working offline for everything already seen. Standard library only.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Iterable, Optional

ENDPOINT = os.environ.get("METANETX_SPARQL", "https://rdf.metanetx.org/sparql")
CHEM = "https://rdf.metanetx.org/chem/"
TTL_DAYS = 90
USER_AGENT = "GEMsMAP-COBRAGUI/0.2 (metabolite annotation curation)"

PREFIXES = """PREFIX mnx: <https://rdf.metanetx.org/schema/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""


class MetaNetXUnavailable(Exception):
    pass


def _lit(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ") + '"'


class MetaNetX:
    """Thread-safe client. `query` can be replaced in tests (no network)."""

    def __init__(self, cache_path: Path, query: Optional[Callable[[str], list[dict]]] = None, workers: int = 4):
        self.path = cache_path
        self._db = sqlite3.connect(str(cache_path), check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(
                "CREATE TABLE IF NOT EXISTS xref (uri TEXT PRIMARY KEY, mnx TEXT NOT NULL, at REAL NOT NULL);"
                "CREATE TABLE IF NOT EXISTS chem (mnx TEXT PRIMARY KEY, info TEXT NOT NULL, at REAL NOT NULL);"
                "CREATE TABLE IF NOT EXISTS name (name TEXT PRIMARY KEY, mnx TEXT NOT NULL, at REAL NOT NULL);"
            )
            self._db.commit()
        self.query = query or self._http_query
        self.workers = workers
        self.network_calls = 0

    # ------------------------------------------------------------------ transport

    def _http_query(self, q: str) -> list[dict]:
        data = urllib.parse.urlencode({"query": PREFIXES + q}).encode()
        req = urllib.request.Request(ENDPOINT, data=data, headers={
            "Accept": "application/sparql-results+json", "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded"})
        last: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=90) as res:
                    self.network_calls += 1
                    body = json.loads(res.read().decode("utf-8"))
                return [{k: v["value"] for k, v in b.items()} for b in body["results"]["bindings"]]
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
                last = e
                time.sleep(1.5 * (attempt + 1))
        raise MetaNetXUnavailable(f"MetaNetX did not answer ({last})")

    def _parallel(self, batches: list, fn: Callable, progress: Optional[Callable[[int], None]]) -> list:
        out = []
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            for chunk, r in zip(batches, pool.map(fn, batches)):
                out.append(r)
                if progress:
                    progress(len(chunk))
        return out

    # ------------------------------------------------------------------ cache helpers

    def _cached(self, table: str, key: str, keys: Iterable[str]) -> dict[str, str]:
        keys = list(keys)
        fresh = time.time() - TTL_DAYS * 86400
        out: dict[str, str] = {}
        with self._lock:
            for i in range(0, len(keys), 500):
                chunk = keys[i:i + 500]
                q = f"SELECT {key}, {'mnx' if table != 'chem' else 'info'} FROM {table} WHERE at > ? AND {key} IN ({','.join('?' * len(chunk))})"
                for k, v in self._db.execute(q, [fresh, *chunk]):
                    out[k] = v
        return out

    def _store(self, table: str, rows: list[tuple[str, str]]):
        now = time.time()
        with self._lock:
            self._db.executemany(f"INSERT OR REPLACE INTO {table} VALUES (?, ?, ?)", [(k, v, now) for k, v in rows])
            self._db.commit()

    # ------------------------------------------------------------------ queries

    def resolve_xrefs(self, uris: Iterable[str], progress=None, batch: int = 150) -> dict[str, list[str]]:
        """identifiers.org URIs -> MNX chemical ids (several when MNXref splits an identifier)."""
        uris = sorted(set(uris))
        hit = self._cached("xref", "uri", uris)
        todo = [u for u in uris if u not in hit]
        if progress:
            progress(len(uris) - len(todo))

        def run(chunk: list[str]):
            rows = self.query("SELECT ?ref ?mnx WHERE { VALUES ?ref { " + " ".join(f"<{u}>" for u in chunk) + " } ?mnx mnx:chemXref ?ref }")
            found: dict[str, list[str]] = {u: [] for u in chunk}
            for r in rows:
                found.setdefault(r["ref"], []).append(r["mnx"].replace(CHEM, ""))
            self._store("xref", [(u, ",".join(sorted(set(v)))) for u, v in found.items()])
            return found

        for found in self._parallel([todo[i:i + batch] for i in range(0, len(todo), batch)], run, progress):
            for u, v in found.items():
                hit[u] = ",".join(v)
        return {u: [x for x in hit.get(u, "").split(",") if x] for u in uris}

    def chem_info(self, mnx_ids: Iterable[str], progress=None, batch: int = 40) -> dict[str, dict]:
        """name, formula, charge, InChIKey, cross-references and isomer links of MNX chemicals."""
        ids = sorted(set(mnx_ids))
        cached = self._cached("chem", "mnx", ids)
        out = {k: json.loads(v) for k, v in cached.items()}
        todo = [m for m in ids if m not in out]
        if progress:
            progress(len(ids) - len(todo))

        def run(chunk: list[str]):
            rows = self.query(
                "SELECT ?mnx ?p ?o WHERE { VALUES ?mnx { " + " ".join(f"<{CHEM}{m}>" for m in chunk) + " } ?mnx ?p ?o . "
                "FILTER(?p IN (rdfs:comment, mnx:formula, mnx:charge, mnx:inchikey, mnx:chemXref, mnx:chemIsom)) }")
            info: dict[str, dict] = {m: {"mnx": m, "name": None, "formula": None, "charge": None, "inchikey": None, "xrefs": [], "isomers": [], "exists": False} for m in chunk}
            for r in rows:
                d = info.get(r["mnx"].replace(CHEM, ""))
                if d is None:
                    continue
                d["exists"] = True
                p, o = r["p"].rsplit("/", 1)[-1].split("#")[-1], r["o"]
                if p == "comment":
                    d["name"] = o
                elif p == "formula":
                    d["formula"] = o
                elif p == "charge":
                    try:
                        d["charge"] = int(float(o))
                    except ValueError:
                        pass
                elif p == "inchikey":
                    d["inchikey"] = o
                elif p == "chemXref":
                    d["xrefs"].append(o)
                elif p == "chemIsom":
                    d["isomers"].append(o.replace(CHEM, ""))
            self._store("chem", [(m, json.dumps(v)) for m, v in info.items()])
            return info

        for info in self._parallel([todo[i:i + batch] for i in range(0, len(todo), batch)], run, progress):
            out.update(info)
        return out

    def lookup_names(self, names: Iterable[str], progress=None, batch: int = 80) -> dict[str, list[str]]:
        """Exact (case-sensitive) MetaNetX name matches. Weak evidence: callers must treat hits as suggestions."""
        names = sorted({n for n in names if n and len(n) < 200})
        hit = self._cached("name", "name", names)
        todo = [n for n in names if n not in hit]
        if progress:
            progress(len(names) - len(todo))

        def run(chunk: list[str]):
            rows = self.query("SELECT ?n ?mnx WHERE { VALUES ?n { " + " ".join(_lit(n) for n in chunk) + " } ?mnx rdfs:comment ?n }")
            found: dict[str, list[str]] = {n: [] for n in chunk}
            for r in rows:
                found.setdefault(r["n"], []).append(r["mnx"].replace(CHEM, ""))
            self._store("name", [(n, ",".join(sorted(set(v)))) for n, v in found.items()])
            return found

        for found in self._parallel([todo[i:i + batch] for i in range(0, len(todo), batch)], run, progress):
            for n, v in found.items():
                hit[n] = ",".join(v)
        return {n: [x for x in hit.get(n, "").split(",") if x] for n in names}


_client: Optional[MetaNetX] = None
_client_lock = threading.Lock()


def client() -> MetaNetX:
    global _client
    with _client_lock:
        if _client is None:
            from ..registry import cache_dir
            _client = MetaNetX(cache_dir().parent / "metanetx_cache.sqlite")
        return _client


def set_client(c: Optional[MetaNetX]) -> None:
    """Tests inject a client with a fake `query`."""
    global _client
    with _client_lock:
        _client = c
