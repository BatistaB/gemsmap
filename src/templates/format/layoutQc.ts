/**
 * Visual quality check of a template drawing, measured with the app's own
 * geometry (the arrows of src/viz/geometry.ts, the label metric of the Scene):
 * overlapping labels, arrows running through labels, crossing arrows,
 * disconnected nodes, very long arrows and nodes inside a module box they do
 * not belong to. Used by `npm run template:qc` and the tests — a hand-made
 * layout should come out with no overlaps and as few crossings as possible.
 */
import { defaultStyle } from '../../store/project';
import type { ID } from '../../model/types';
import { groupBounds, labelAnchor, reactionGeometry } from '../../viz/geometry';
import type { NodeGlyph, Point, ReactionGlyph, VisualDoc } from '../../viz/types';
import { fileToDoc } from '../design/convert';
import type { TemplateFile } from './schema';

export interface Box { x0: number; y0: number; x1: number; y1: number; owner: string; what: string }
export interface LayoutIssue { kind: 'label-overlap' | 'edge-through-label' | 'edge-crossing' | 'cofactor-crossing' | 'cofactor-through-label' | 'disconnected' | 'long-edge' | 'foreign-in-group'; message: string; at: Point }
export interface LayoutQc {
  counts: Record<LayoutIssue['kind'], number>;
  issues: LayoutIssue[];
  /** Drawing extent (all label boxes). */
  bounds: { x: number; y: number; w: number; h: number };
  elements: { nodes: number; cofactors: number; arrows: number; ports: number; labels: number };
}

const STYLE = defaultStyle();
const FS = STYLE.fontSize;
const RFS = STYLE.reactionLabelSize ?? FS - 1;
const W = STYLE.baseEdgeWidth;
const LONG = 280;

/** Same metric as Scene.labelBox. */
export function labelBox(text: string, fs: number): { hw: number; hh: number } {
  let w = 0;
  for (const ch of text) w += /[A-Z0-9]/.test(ch) ? 0.64 : /[il.,:;'|!]/.test(ch) ? 0.28 : 0.52;
  return { hw: (w * fs) / 2 + 2, hh: fs * 0.62 };
}
const cofactorFont = (fs: number) => Math.max(6, fs - 2);

const boxAt = (cx: number, cy: number, hw: number, hh: number, anchor: 'start' | 'middle' | 'end', owner: string, what: string): Box => {
  const x0 = anchor === 'start' ? cx : anchor === 'end' ? cx - 2 * hw : cx - hw;
  return { x0, y0: cy - hh, x1: x0 + 2 * hw, y1: cy + hh, owner, what };
};

/** Polyline of an SVG path made of M / L / Q commands (what reactionGeometry emits). */
function polyline(d: string): Point[] {
  const tok = d.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? [];
  const pts: Point[] = [];
  let i = 0;
  let cur: Point = { x: 0, y: 0 };
  const num = () => +tok[i++];
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M' || c === 'L') { cur = { x: num(), y: num() }; pts.push(cur); }
    else if (c === 'Q') {
      const q = { x: num(), y: num() }, e = { x: num(), y: num() }, s = cur;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        pts.push({ x: (1 - t) ** 2 * s.x + 2 * (1 - t) * t * q.x + t * t * e.x, y: (1 - t) ** 2 * s.y + 2 * (1 - t) * t * q.y + t * t * e.y });
      }
      cur = e;
    }
  }
  return pts;
}

function segCross(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * r.x, y: a.y + t * r.y } : null;
}
const polyCross = (p: Point[], q: Point[]): Point | null => {
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) { const x = segCross(p[i - 1], p[i], q[j - 1], q[j]); if (x) return x; }
  return null;
};
/** Does the polyline enter the box (shrunk by `inset`, so grazing an edge does not count)? */
function polyInBox(p: Point[], b: Box, inset = 1): Point | null {
  const x0 = b.x0 + inset, y0 = b.y0 + inset, x1 = b.x1 - inset, y1 = b.y1 - inset;
  if (x1 <= x0 || y1 <= y0) return null;
  const inside = (q: Point) => q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1;
  const edges: [Point, Point][] = [[{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }], [{ x: x1, y: y1 }, { x: x0, y: y1 }], [{ x: x0, y: y1 }, { x: x0, y: y0 }]];
  for (let i = 0; i < p.length; i++) {
    if (inside(p[i])) return p[i];
    if (i && edges.some(([a, c]) => segCross(p[i - 1], p[i], a, c))) return p[i];
  }
  return null;
}
const overlap = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;

/** Label box of a node as the Scene draws it. */
function nodeBox(n: NodeGlyph): Box {
  const text = n.label ?? '';
  if (n.attach) { const { hw, hh } = labelBox(text, cofactorFont(FS)); return boxAt(n.x, n.y, hw, hh, 'middle', n.id, `cofactor ${text}`); }
  if (n.shape === 'label') { const { hw, hh } = labelBox(text, FS); return boxAt(n.x, n.y, hw, hh, 'middle', n.id, text); }
  // circle: the circle plus its label beside it
  const r = n.r ?? STYLE.nodeRadius;
  const la = labelAnchor(n, n.labelPos, r, FS);
  const { hw, hh } = labelBox(text, FS);
  const lb = boxAt(la.x, la.y - FS * 0.35, hw, hh, la.anchor, n.id, text);
  return { x0: Math.min(lb.x0, n.x - r), y0: Math.min(lb.y0, n.y - r), x1: Math.max(lb.x1, n.x + r), y1: Math.max(lb.y1, n.y + r), owner: n.id, what: text };
}

/** Radius function of the Scene (label-shaped nodes: distance to the label box border). */
const radiusOf = (nodes: Record<ID, NodeGlyph>) => (id: ID, dir: Point) => {
  const n = nodes[id];
  if (n?.shape === 'label') {
    const { hw, hh } = labelBox(n.label ?? '', FS);
    return Math.min(Math.abs(dir.x) > 1e-6 ? hw / Math.abs(dir.x) : Infinity, Math.abs(dir.y) > 1e-6 ? hh / Math.abs(dir.y) : Infinity) - 3;
  }
  return n?.r ?? STYLE.nodeRadius;
};

/** The short curve of an attached cofactor (Scene.cofactorCurve). */
function cofactorLine(c: NodeGlyph, mid: Point, dir: Point): Point[] {
  const out = c.attach!.side === 'out';
  const a = { x: mid.x + dir.x * (out ? 5 : -5), y: mid.y + dir.y * (out ? 5 : -5) };
  const ctrl = { x: a.x + dir.x * (out ? 9 : -9), y: a.y + dir.y * (out ? 9 : -9) };
  const { hw, hh } = labelBox(c.label ?? '', cofactorFont(FS));
  const vx = ctrl.x - c.x, vy = ctrl.y - c.y;
  const len = Math.hypot(vx, vy) || 1;
  const k = Math.min(Math.abs(vx) > 1e-6 ? hw / Math.abs(vx / len) : Infinity, Math.abs(vy) > 1e-6 ? hh / Math.abs(vy / len) : Infinity) + 2;
  const e = { x: c.x + (vx / len) * k, y: c.y + (vy / len) * k };
  return polyline(`M${a.x},${a.y} Q${ctrl.x},${ctrl.y} ${e.x},${e.y}`);
}

export function layoutQcOfDoc(doc: VisualDoc): LayoutQc {
  const issues: LayoutIssue[] = [];
  const nodes = doc.nodes;
  const name = (id: ID) => nodes[id]?.label ?? id;
  const rxName = (g: ReactionGlyph) => g.label ?? (g.design?.kind === 'link' ? `link to ${name(g.targets[0])}` : g.id);
  const boxes: Box[] = Object.values(nodes).map(nodeBox);
  const geo = new Map<ID, { lines: Point[][]; mid: Point; dir: Point; chord: number }>();
  const rad = radiusOf(nodes);
  for (const g of Object.values(doc.reactions)) {
    const geom = reactionGeometry(g, nodes, rad, 0, arrowLen());
    if (!geom) continue;
    const S = g.sources.map((id) => nodes[id]), T = g.targets.map((id) => nodes[id]);
    const c = (ps: NodeGlyph[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
    const cs = c(S), ct = c(T);
    geo.set(g.id, { lines: geom.segments.map((s) => polyline(s.d)), mid: geom.mid, dir: geom.dir, chord: Math.hypot(ct.x - cs.x, ct.y - cs.y) });
    if (g.label && g.design?.kind !== 'link') {
      const lp = g.labelOffset ? { x: geom.mid.x + g.labelOffset.x, y: geom.mid.y + g.labelOffset.y } : { x: geom.mid.x + geom.normal.x * (9 + W / 2), y: geom.mid.y + geom.normal.y * (9 + W / 2) };
      const anchor = g.labelOffset ? 'middle' : Math.abs(geom.normal.x) < 0.3 ? 'middle' : geom.normal.x < 0 ? 'end' : 'start';
      const { hw, hh } = labelBox(g.label, RFS);
      boxes.push(boxAt(lp.x, lp.y, hw, hh, anchor, g.id, `label ${g.label}`));
    }
  }
  for (const g of Object.values(doc.groups)) {
    const b = groupBounds(g, nodes);
    if (!b) continue;
    const { hw, hh } = labelBox(g.title, FS + 1);
    boxes.push(boxAt(b.x + 8, b.y + 13 - (FS + 1) * 0.33, hw, hh, 'start', g.id, `module title ${g.title}`));
    for (const n of Object.values(nodes)) {
      if (g.nodeIds.includes(n.id) || n.attach) continue;
      if (n.x > b.x && n.x < b.x + b.w && n.y > b.y && n.y < b.y + b.h) issues.push({ kind: 'foreign-in-group', message: `${name(n.id)} lies inside the "${g.title}" box without belonging to it`, at: n });
    }
  }
  for (const t of Object.values(doc.texts)) {
    const w = t.text.length * t.size * 0.56;
    boxes.push({ x0: t.x, y0: t.y - t.size, x1: t.x + w, y1: t.y + t.size * 0.3, owner: t.id, what: `text "${t.text}"` });
  }

  // labels on labels
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.owner === b.owner || !overlap(a, b)) continue;
    issues.push({ kind: 'label-overlap', message: `${a.what} overlaps ${b.what}`, at: { x: (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2, y: (Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2 } });
  }
  // arrows through labels, arrows crossing arrows
  const rx = Object.values(doc.reactions).filter((g) => geo.has(g.id));
  const ends = (g: ReactionGlyph) => new Set([...g.sources, ...g.targets]);
  const cofs = Object.values(nodes).filter((n) => n.attach && geo.has(n.attach.glyph));
  for (const g of rx) {
    const own = ends(g);
    for (const line of geo.get(g.id)!.lines) {
      for (const b of boxes) {
        if (own.has(b.owner)) continue;
        const hit = polyInBox(line, b);
        if (hit) { issues.push({ kind: 'edge-through-label', message: `arrow ${rxName(g)} runs through ${b.what}`, at: hit }); break; }
      }
    }
    if (geo.get(g.id)!.chord > LONG && g.design?.kind !== 'link') issues.push({ kind: 'long-edge', message: `arrow ${rxName(g)} is ${Math.round(geo.get(g.id)!.chord)} px long`, at: geo.get(g.id)!.mid });
  }
  for (let i = 0; i < rx.length; i++) for (let j = i + 1; j < rx.length; j++) {
    const a = rx[i], b = rx[j];
    const ea = ends(a);
    if ([...ends(b)].some((x) => ea.has(x))) continue;
    for (const p of geo.get(a.id)!.lines) for (const q of geo.get(b.id)!.lines) {
      const x = polyCross(p, q);
      if (x) { issues.push({ kind: 'edge-crossing', message: `arrows ${rxName(a)} and ${rxName(b)} cross`, at: x }); break; }
    }
  }
  for (const c of cofs) {
    const g = doc.reactions[c.attach!.glyph];
    const line = cofactorLine(c, geo.get(g.id)!.mid, geo.get(g.id)!.dir);
    for (const o of rx) {
      if (o.id === g.id) continue;
      if (geo.get(o.id)!.lines.some((l) => polyCross(line, l))) { issues.push({ kind: 'cofactor-crossing', message: `cofactor ${c.label} of ${rxName(g)} crosses arrow ${rxName(o)}`, at: c }); break; }
    }
    // the short curve must not run through a label either (its own reaction's enzyme label included)
    for (const b of boxes) {
      if (b.owner === c.id) continue;
      const hit = polyInBox(line, b);
      if (hit) { issues.push({ kind: 'cofactor-through-label', message: `the curve of cofactor ${c.label} (${rxName(g)}) runs through ${b.what}`, at: hit }); break; }
    }
  }
  // nodes with no arrow
  const used = new Set(Object.values(doc.reactions).flatMap((g) => [...g.sources, ...g.targets]));
  for (const n of Object.values(nodes)) if (!n.attach && !used.has(n.id)) issues.push({ kind: 'disconnected', message: `${name(n.id)} is not connected to any arrow`, at: n });

  const counts = { 'label-overlap': 0, 'edge-through-label': 0, 'edge-crossing': 0, 'cofactor-crossing': 0, 'cofactor-through-label': 0, disconnected: 0, 'long-edge': 0, 'foreign-in-group': 0 };
  for (const i of issues) counts[i.kind]++;
  const x0 = Math.min(...boxes.map((b) => b.x0)), y0 = Math.min(...boxes.map((b) => b.y0));
  return {
    counts, issues, bounds: { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x1)) - x0, h: Math.max(...boxes.map((b) => b.y1)) - y0 },
    elements: {
      nodes: Object.values(nodes).filter((n) => !n.attach && n.design?.kind !== 'port').length, cofactors: cofs.length,
      arrows: rx.filter((g) => g.design?.kind !== 'link').length, ports: Object.values(nodes).filter((n) => n.design?.kind === 'port').length, labels: boxes.length,
    },
  };
}

function arrowLen() { return 4.5 + W * 2; }

export const layoutQc = (f: TemplateFile) => layoutQcOfDoc(fileToDoc(f));
