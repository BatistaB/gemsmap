"""Normalized multi-field search index, built once when a model is loaded.

Every entity gets one lowercase haystack combining all meaningful fields (ids, names, formula,
equation, participant names, genes, subsystem, EC, annotation values). A query matches when all of
its tokens occur in the haystack; ranking prefers id/name hits. The frontend keeps an equivalent
index for instant typing; this endpoint serves scripts and API users.
"""
import re
import unicodedata
from dataclasses import dataclass

_SEP = re.compile(r"[\s_\-,;:()\[\]{}|/]+")


def normalize(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()
    return t


def collapsed(text: str) -> str:
    """'glc__D_e' -> 'glc d e' so both 'glc__D' and 'glc d' match."""
    return _SEP.sub(" ", normalize(text)).strip()


def annotation_text(ann) -> str:
    out = []
    for k, v in (ann or {}).items():
        vals = v if isinstance(v, (list, tuple)) else [v]
        out.append(f"{k} " + " ".join(str(x) for x in vals))
    return " ".join(out)


@dataclass
class Item:
    kind: str
    id: str
    name: str
    detail: str
    id_n: str
    name_n: str
    hay: str


class SearchIndex:
    def __init__(self, model):
        items: list[Item] = []
        met_name = {m.id: m.name or "" for m in model.metabolites}
        for m in model.metabolites:
            fields = [m.id, m.name, m.formula, m.compartment, str(m.charge), annotation_text(m.annotation)]
            items.append(self._item("metabolite", m.id, m.name or m.id, f"{m.formula or ''} · {m.compartment}", fields))
        for r in model.reactions:
            ec = r.annotation.get("ec-code", []) if r.annotation else []
            ec = ec if isinstance(ec, list) else [ec]
            fields = [r.id, r.name, r.reaction, r.subsystem, r.gene_reaction_rule, " ".join(ec),
                      " ".join(met_name.get(m.id, "") for m in r.metabolites),
                      " ".join(g.name or "" for g in r.genes), annotation_text(r.annotation)]
            items.append(self._item("reaction", r.id, r.name or r.id, r.subsystem or "", fields))
        for g in model.genes:
            fields = [g.id, g.name, " ".join(r.id for r in g.reactions), annotation_text(g.annotation)]
            items.append(self._item("gene", g.id, g.name or g.id, f"{len(g.reactions)} reactions", fields))
        self.items = items

    @staticmethod
    def _item(kind, id_, name, detail, fields) -> Item:
        raw = " ".join(normalize(f) for f in fields if f)
        hay = raw + " " + collapsed(raw)
        return Item(kind, id_, name, detail, normalize(id_), normalize(name or ""), hay)

    def search(self, query: str, kinds=None, limit: int = 50) -> list[dict]:
        q = normalize(query).strip()
        if not q:
            return []
        tokens = [t for t in collapsed(q).split(" ") if t] or [q]
        scored = []
        for it in self.items:
            if kinds and it.kind not in kinds:
                continue
            if q not in it.hay and not all(t in it.hay for t in tokens):
                continue
            if it.id_n == q:
                s = 100
            elif it.name_n == q:
                s = 92
            elif it.id_n.startswith(q):
                s = 80
            elif it.name_n.startswith(q):
                s = 72
            elif q in it.id_n:
                s = 55
            elif q in it.name_n:
                s = 48
            else:
                s = 20
            scored.append((s - len(it.id_n) * 0.01, it))
        scored.sort(key=lambda x: -x[0])
        return [{"kind": it.kind, "id": it.id, "name": it.name, "detail": it.detail, "score": round(s, 2)}
                for s, it in scored[:limit]]
