"""Layout helpers for hand-designed templates (used by the curation files of tools/kegg/curation/).

They place things the way a person would in the Template Builder: nodes on a grid, arrows with the same geometry
as the app (src/viz/geometry.ts), cofactors beside their arrow (attached cofactor nodes, repeated per reaction,
all pointing to the same entity), pathway ports, module labels. The QC script (npm run template:qc) then measures
overlaps and crossings with the app's own geometry.
"""
from __future__ import annotations

import math

GRID = 10
FS = 10  # default metabolite font size (StyleSettings.fontSize)


def snap(v: float) -> int:
    return int(round(v / GRID) * GRID)


def text_half_width(text: str, fs: float) -> float:
    """Same metric as Scene.labelBox."""
    w = 0.0
    for ch in text:
        w += 0.64 if ch.isupper() or ch.isdigit() else 0.28 if ch in "il.,:;'|!" else 0.52
    return w * fs / 2 + 2


class Layout:
    def __init__(self, met_id: dict, rx_id: dict, port_id: dict, reactions: dict, labels: dict):
        self.met_id, self.rx_id, self.port_id, self.reactions, self.labels = met_id, rx_id, port_id, reactions, labels
        self.nodes: list[dict] = []
        self.rx: list[dict] = []
        self.ports: list[dict] = []
        self.groups: list[dict] = []
        self.texts: list[dict] = []
        self.pos: dict[str, tuple[float, float]] = {}
        self.text: dict[str, str] = {}  # node -> its label (arrows stop at the label box)

    # ------------------------------------------------------------------ elements
    def _nid(self) -> str:
        return f"tpl_node_{len(self.nodes) + len(self.ports) + 1:03d}"

    def node(self, key: str, x: float, y: float, shape: str = "label") -> str:
        """A visual instance of a template metabolite (call again for another instance of the same metabolite)."""
        nid = self._nid()
        self.nodes.append({"id": nid, "metabolite": self.met_id[key], "x": snap(x), "y": snap(y), **({"shape": shape} if shape != "circle" else {})})
        self.pos[nid] = (snap(x), snap(y))
        self.text[nid] = self.labels[self.met_id[key]]
        return nid

    def reaction(self, key: str, sources: list[str], targets: list[str], routing: str | None = None, bend: float | None = None,
                 flip: bool | None = None, label_offset: tuple[float, float] | None = None, label_side: str = "outside") -> dict:
        """An arrow. Without `routing`: straight between nodes aligned horizontally or vertically, a gentle curve between
        nodes that are not (bulging away from the centre of the map, enzyme label on the outside — or on the inside with
        label_side="inside", e.g. around a cycle, so the cofactors go outside)."""
        if routing is None:
            routing, auto_bend, auto_flip = self._auto_route(sources, targets, flip if flip is not None else None if label_side == "outside" else "inside")
            bend = auto_bend if bend is None else bend
            flip = auto_flip if flip is None else flip
        flip = bool(flip)
        r = {"reaction": self.rx_id[key], "sources": sources, "targets": targets, "routing": routing,
             **({"bend": bend} if bend is not None else {}), **({"label_flip": True} if flip else {}),
             **({"label_offset": {"x": label_offset[0], "y": label_offset[1]}} if label_offset else {})}
        if routing == "curved" and not label_offset and len(sources) == 1 and len(targets) == 1:
            self._clear_label(r)
        self.rx.append(r)
        return r

    def _clear_label(self, r: dict) -> None:
        """On a curve the default label (beside the middle, anchored at one end) can lie on the arrow itself: move it
        straight out along the normal, centred, far enough for its whole box (Scene.ReactionItem placement)."""
        mid, d, n = self.geometry(r)
        text = self.reactions[r["reaction"]]["name"]
        rfs = FS - 1
        hw, hh = text_half_width(text, rfs), rfs * 0.62
        lp = (mid[0] + n[0] * 9.7, mid[1] + n[1] * 9.7)
        anchor = "middle" if abs(n[0]) < 0.3 else "end" if n[0] < 0 else "start"
        x0 = lp[0] - (2 * hw if anchor == "end" else 0 if anchor == "start" else hw)
        box = (x0 - 3, lp[1] - hh - 3, x0 + 2 * hw + 3, lp[1] + hh + 3)  # with a margin: a label grazing its arrow reads badly too
        (ax, ay), (cx, cy), (bx, by) = self.visible_curve(r)
        for i in range(21):
            t = i / 20
            x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx
            y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by
            if box[0] < x < box[2] and box[1] < y < box[3]:
                # the visible apex lies a little beyond the geometric middle the label is anchored to
                apex = (0.25 * ax + 0.5 * cx + 0.25 * bx, 0.25 * ay + 0.5 * cy + 0.25 * by)
                beyond = max(0.0, (apex[0] - mid[0]) * n[0] + (apex[1] - mid[1]) * n[1])
                k = beyond + abs(n[0]) * hw + abs(n[1]) * hh + 5
                r["label_offset"] = {"x": round(n[0] * k, 1), "y": round(n[1] * k, 1)}
                return

    def _radius(self, nid: str, u: tuple[float, float]) -> float:
        """Distance from a label node's centre to its label box along u (Scene radiusOf)."""
        hw, hh = text_half_width(self.text.get(nid, ""), FS), FS * 0.62
        return min(hw / abs(u[0]) if abs(u[0]) > 1e-6 else math.inf, hh / abs(u[1]) if abs(u[1]) > 1e-6 else math.inf) - 3

    def visible_curve(self, r: dict) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float]]:
        """Start, control and end of a curved arrow as drawn (geometry.ts: trimmed at the label boxes, arrowhead gap)."""
        _, d, n = self.geometry(r)
        s, t = self.pos[r["sources"][0]], self.pos[r["targets"][0]]
        b = r.get("bend", 0)
        c = ((s[0] + t[0]) / 2 + n[0] * b * 2, (s[1] + t[1]) / 2 + n[1] * b * 2)
        def unit(p, q):
            l = math.hypot(q[0] - p[0], q[1] - p[1]) or 1
            return ((q[0] - p[0]) / l, (q[1] - p[1]) / l)
        u0, u1 = unit(s, c), unit(c, t)
        rs, rt = self._radius(r["sources"][0], u0) + 3, self._radius(r["targets"][0], (-u1[0], -u1[1])) + 3 + 5.8
        return (s[0] + u0[0] * rs, s[1] + u0[1] * rs), c, (t[0] - u1[0] * rt, t[1] - u1[1] * rt)

    center: tuple[float, float] | None = None
    """Reference point curved arrows bulge away from (default: the centroid of the nodes drawn so far)."""
    CURVE = 0.1
    """Bulge of an automatic curve, as a fraction of its chord."""

    def _auto_route(self, sources: list[str], targets: list[str], flip) -> tuple[str, float | None, bool | None]:
        keep = None if flip == "inside" else flip
        if len(sources) != 1 or len(targets) != 1:
            return "straight", None, keep
        (ax, ay), (bx, by) = self.pos[sources[0]], self.pos[targets[0]]
        dx, dy = bx - ax, by - ay
        if abs(dx) < 1 or abs(dy) < 1:
            return "straight", None, keep
        chord = math.hypot(dx, dy)
        n = (-dy / chord, dx / chord)
        pts = [p for k, p in self.pos.items() if not k.startswith("_")]
        c = self.center or (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        v = ((ax + bx) / 2 - c[0], (ay + by) / 2 - c[1])
        out = n[0] * v[0] + n[1] * v[1] >= 0
        b = round(chord * self.CURVE)
        if flip is None:
            return "curved", b, not out  # flipping the label side flips the bulge with it: both end up outside
        if flip == "inside":
            flip = out  # the label normal points inward; the bulge stays outward
        return "curved", b if out != flip else -b, flip

    def port(self, conn_key: str, x: float, y: float, from_node: str) -> str:
        nid = self._nid()
        self.ports.append({"id": nid, "connector": self.port_id[conn_key], "x": snap(x), "y": snap(y), "from": from_node})
        self.pos[nid] = (snap(x), snap(y))
        return nid

    def group(self, title: str, nodes: list[str], kind: str = "pathway", **style) -> None:
        self.groups.append({"id": f"tpl_grp_{len(self.groups) + 1:03d}", "kind": kind, "title": title, "nodes": nodes, **style})

    def label(self, text: str, x: float, y: float, size: int = 11, weight: int = 600, italic: bool = True, kind: str = "text", color: str | None = None) -> None:
        self.texts.append({"id": f"tpl_lbl_{len(self.texts) + 1:03d}", "x": snap(x), "y": snap(y), "text": text, "size": size, "weight": weight,
                           **({"italic": True} if italic else {}), "kind": kind, **({"color": color} if color else {})})

    # ------------------------------------------------------------------ geometry (src/viz/geometry.ts)
    def geometry(self, r: dict) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float]]:
        """(mid, dir, normal) of an arrow, as the app computes them."""
        S = [self.pos[s] for s in r["sources"]]
        T = [self.pos[t] for t in r["targets"]]
        cs = (sum(p[0] for p in S) / len(S), sum(p[1] for p in S) / len(S))
        ct = (sum(p[0] for p in T) / len(T), sum(p[1] for p in T) / len(T))
        dx, dy = ct[0] - cs[0], ct[1] - cs[1]
        chord = math.hypot(dx, dy) or 1
        d = (dx / chord, dy / chord)
        n = (d[1], -d[0]) if r.get("label_flip") else (-d[1], d[0])
        if len(S) == 1 and len(T) == 1:
            bend = r.get("bend", chord * 0.15 if r["routing"] == "curved" else 0)
            if r["routing"] != "curved" and "bend" not in r:
                bend = 0
            ctrl = ((cs[0] + ct[0]) / 2 + n[0] * bend * 2, (cs[1] + ct[1]) / 2 + n[1] * bend * 2)
            mid = (0.25 * (cs[0] + ct[0]) + 0.5 * ctrl[0], 0.25 * (cs[1] + ct[1]) + 0.5 * ctrl[1]) if abs(bend) > 0.01 else ((cs[0] + ct[0]) / 2, (cs[1] + ct[1]) / 2)
            return mid, d, n
        b = r.get("bend", 0)
        return ((cs[0] + ct[0]) / 2 + n[0] * b, (cs[1] + ct[1]) / 2 + n[1] * b), d, n

    # ------------------------------------------------------------------ cofactors
    def cofactors(self, r: dict, side: str = "opposite", hide: tuple[str, ...] = ("H2O",), dist: float = 10, along: float = 16, step: float = 16,
                  only: tuple[str, ...] | None = None) -> list[str]:
        """Attach the side participants of a reaction beside its arrow: consumed ones before the middle, produced ones
        after it, on the side opposite to the enzyme label (or the same side). Each is a new visual instance of the
        cofactor's metabolite. `hide`: labels never drawn (water by convention)."""
        rx = self.reactions[r["reaction"]]
        mid, d, n = self.geometry(r)
        s = -1 if side == "opposite" else 1
        out = []
        for sign, key in ((-1, "in"), (1, "out")):
            parts = [p for p in rx["participants"] if not p["main"] and (p["coefficient"] < 0) == (sign < 0)]
            k = 0
            for p in parts:
                text = self.labels[p["metabolite"]]
                if text in hide or (only is not None and text not in only):
                    continue
                hw = text_half_width(text, FS - 2)
                # perpendicular clearance: half the text extent across the arrow, plus a gap
                across = abs(n[0]) * hw + abs(n[1]) * 6 + dist
                spacing = abs(d[0]) * (2 * hw + 6) + abs(d[1]) * step
                # wide labels on a horizontal-ish arrow start beyond their own half width (in and out never meet at the middle)
                a = along + abs(d[0]) * hw + k * spacing
                x = mid[0] + d[0] * a * sign + n[0] * across * s
                y = mid[1] + d[1] * a * sign + n[1] * across * s
                nid = self._nid()
                self.nodes.append({"id": nid, "metabolite": p["metabolite"], "x": round(x, 1), "y": round(y, 1), "attach": {"reaction": r["reaction"], "side": key}})
                self.pos[nid] = (x, y)
                out.append(nid)
                k += 1
        return out

    def result(self) -> dict:
        return {"nodes": self.nodes, "ports": self.ports, "reactions": self.rx, "groups": self.groups, "labels": self.texts}
