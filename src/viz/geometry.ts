import type { ID } from '../model/types';
import type { NodeGlyph, PathwayGroup, Point, ReactionGlyph } from './types';

export interface Tip { x: number; y: number; angle: number }
export interface Segment {
  d: string;
  side: 'both' | 'source' | 'target';
  startTip: Tip;
  endTip: Tip;
}
export interface ReactionGeom {
  segments: Segment[];
  mid: Point;
  /** unit normal used to offset labels */
  normal: Point;
  /** unit direction sources -> targets */
  dir: Point;
}

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number) => ({ x: a.x * k, y: a.y * k });
const len = (a: Point) => Math.hypot(a.x, a.y);
const norm = (a: Point) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const centroid = (ps: Point[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
const f = (n: number) => +n.toFixed(2);
const ang = (v: Point) => Math.atan2(v.y, v.x);

/**
 * @param gapStart extra clearance at source ends (e.g. arrowhead length)
 * @param gapEnd   extra clearance at target ends
 */
export function reactionGeometry(
  g: ReactionGlyph,
  nodes: Record<ID, NodeGlyph>,
  /** Distance from the node centre to its outline along the unit vector `dir` (pointing outward). */
  radiusOf: (id: ID, dir: Point) => number,
  gapStart = 0,
  gapEnd = 0,
): ReactionGeom | null {
  const S = g.sources.map((id) => nodes[id]).filter(Boolean);
  const T = g.targets.map((id) => nodes[id]).filter(Boolean);
  if (!S.length || !T.length) return null;
  const pad = 3;
  const cs = centroid(S), ct = centroid(T);
  const dir = norm(sub(ct, cs));
  const normal = g.labelFlip ? { x: dir.y, y: -dir.x } : { x: -dir.y, y: dir.x };
  const chord = len(sub(ct, cs));

  if (S.length === 1 && T.length === 1) {
    const s = S[0], t = T[0];
    if (g.routing === 'orthogonal' && Math.abs(s.x - t.x) > 1 && Math.abs(s.y - t.y) > 1) {
      const verticalFirst = Math.abs(t.y - s.y) >= Math.abs(t.x - s.x);
      const corner = verticalFirst ? { x: s.x, y: t.y } : { x: t.x, y: s.y };
      const d1 = norm(sub(corner, s)), d2 = norm(sub(t, corner));
      const rs = radiusOf(s.id, d1) + pad, rt = radiusOf(t.id, mul(d2, -1)) + pad;
      const a = add(s, mul(d1, rs + gapStart)), b = sub(t, mul(d2, rt + gapEnd));
      return {
        segments: [{ d: `M${f(a.x)},${f(a.y)} L${f(corner.x)},${f(corner.y)} L${f(b.x)},${f(b.y)}`, side: 'both', startTip: { ...add(s, mul(d1, rs)), angle: ang(mul(d1, -1)) }, endTip: { ...sub(t, mul(d2, rt)), angle: ang(d2) } }],
        mid: corner, normal, dir,
      };
    }
    const bend = g.routing === 'curved' ? (g.bend ?? chord * 0.15) : (g.bend ?? 0);
    const ctrl = add(mul(add(s, t), 0.5), mul(normal, bend * 2));
    const u0 = norm(sub(Math.abs(bend) > 0.01 ? ctrl : t, s));
    const u1 = norm(sub(t, Math.abs(bend) > 0.01 ? ctrl : s));
    const rs = radiusOf(s.id, u0) + pad, rt = radiusOf(t.id, mul(u1, -1)) + pad;
    const a = add(s, mul(u0, rs + gapStart));
    const b = sub(t, mul(u1, rt + gapEnd));
    const tipA = add(s, mul(u0, rs));
    const tipB = sub(t, mul(u1, rt));
    const d = Math.abs(bend) > 0.01 ? `M${f(a.x)},${f(a.y)} Q${f(ctrl.x)},${f(ctrl.y)} ${f(b.x)},${f(b.y)}` : `M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}`;
    const mid = Math.abs(bend) > 0.01 ? add(mul(add(s, t), 0.25), mul(ctrl, 0.5)) : mul(add(s, t), 0.5);
    return { segments: [{ d, side: 'both', startTip: { ...tipA, angle: ang(mul(u0, -1)) }, endTip: { ...tipB, angle: ang(u1) } }], mid, normal, dir };
  }

  // Hyperedge: all participants meet at a hub on the source->target axis.
  const hub = add(mul(add(cs, ct), 0.5), mul(normal, g.bend ?? 0));
  const k = Math.max(12, chord * 0.28);
  const segments: Segment[] = [];
  for (const s of S) {
    const c = sub(hub, mul(dir, k));
    const u = norm(sub(c, s));
    const r = radiusOf(s.id, u) + pad;
    const a = add(s, mul(u, r + gapStart));
    const tip = add(s, mul(u, r));
    segments.push({ d: `M${f(a.x)},${f(a.y)} Q${f(c.x)},${f(c.y)} ${f(hub.x)},${f(hub.y)}`, side: 'source', startTip: { ...tip, angle: ang(mul(u, -1)) }, endTip: { ...hub, angle: ang(dir) } });
  }
  for (const t of T) {
    const c = add(hub, mul(dir, k));
    const u = norm(sub(t, c));
    const r = radiusOf(t.id, mul(u, -1)) + pad;
    const b = sub(t, mul(u, r + gapEnd));
    const tip = sub(t, mul(u, r));
    segments.push({ d: `M${f(hub.x)},${f(hub.y)} Q${f(c.x)},${f(c.y)} ${f(b.x)},${f(b.y)}`, side: 'target', startTip: { ...hub, angle: ang(mul(dir, -1)) }, endTip: { ...tip, angle: ang(u) } });
  }
  return { segments, mid: hub, normal, dir };
}

export function arrowPath(tip: Tip, width: number): string {
  const L = 4.5 + width * 2;
  const W = 2.6 + width * 1.1;
  const c = Math.cos(tip.angle), s = Math.sin(tip.angle);
  const bx = tip.x - c * L, by = tip.y - s * L;
  return `M${f(tip.x)},${f(tip.y)} L${f(bx - s * W)},${f(by + c * W)} L${f(bx + s * W)},${f(by - c * W)} Z`;
}
export const arrowLength = (width: number) => 4.5 + width * 2;

export function labelAnchor(p: Point, pos: string | undefined, r: number, fontSize: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const gap = r + 4;
  switch (pos) {
    case 'left': return { x: p.x - gap, y: p.y + fontSize * 0.35, anchor: 'end' };
    case 'top': return { x: p.x, y: p.y - gap - 1, anchor: 'middle' };
    case 'bottom': return { x: p.x, y: p.y + gap + fontSize * 0.8, anchor: 'middle' };
    case 'center': return { x: p.x, y: p.y + fontSize * 0.35, anchor: 'middle' };
    default: return { x: p.x + gap, y: p.y + fontSize * 0.35, anchor: 'start' };
  }
}

export function groupBounds(g: PathwayGroup, nodes: Record<ID, NodeGlyph>): { x: number; y: number; w: number; h: number } | null {
  const ns = g.nodeIds.map((id) => nodes[id]).filter(Boolean);
  if (!ns.length) return null;
  const x0 = Math.min(...ns.map((n) => n.x)) - g.padding;
  const y0 = Math.min(...ns.map((n) => n.y)) - g.padding;
  const x1 = Math.max(...ns.map((n) => n.x)) + g.padding + 20;
  const y1 = Math.max(...ns.map((n) => n.y)) + g.padding;
  return { x: x0, y: y0 - 14, w: x1 - x0, h: y1 - y0 + 14 };
}
