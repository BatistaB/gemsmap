import type { ID } from '../model/types';
import type { Point } from '../viz/types';

export type LayoutKind = 'vertical' | 'horizontal' | 'circle' | 'grid' | 'hierarchical' | 'organic';

export interface LayoutOptions {
  spacing: number;
  radius?: number;
  clockwise?: boolean;
  /** degrees, 0 = east, -90 = north (screen coordinates) */
  startAngle?: number;
  columns?: number;
}

export interface LNode { id: ID; x: number; y: number }
export type LEdge = [ID, ID];

type Pos = Record<ID, Point>;

/** Longest-path layering restricted to the selection. Cycles are broken by position. */
function layering(nodes: LNode[], edges: LEdge[], axis: 'x' | 'y'): { depth: Map<ID, number>; order: ID[] } {
  const ids = new Set(nodes.map((n) => n.id));
  const es = edges.filter(([a, b]) => ids.has(a) && ids.has(b) && a !== b);
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const succ = new Map<ID, ID[]>(nodes.map((n) => [n.id, []]));
  for (const [a, b] of es) { succ.get(a)!.push(b); indeg.set(b, indeg.get(b)! + 1); }
  const order: ID[] = [];
  const remaining = new Set(ids);
  const byAxis = (a: ID, b: ID) => pos.get(a)![axis] - pos.get(b)![axis];
  while (remaining.size) {
    let ready = [...remaining].filter((id) => indeg.get(id) === 0).sort(byAxis);
    if (!ready.length) ready = [[...remaining].sort((a, b) => indeg.get(a)! - indeg.get(b)! || byAxis(a, b))[0]]; // break a cycle
    const n = ready[0];
    remaining.delete(n);
    order.push(n);
    for (const s of succ.get(n)!) indeg.set(s, indeg.get(s)! - 1);
  }
  const rank = new Map(order.map((id, i) => [id, i]));
  const depth = new Map<ID, number>(order.map((id) => [id, 0]));
  for (const id of order) {
    for (const s of succ.get(id)!) {
      if (rank.get(s)! > rank.get(id)!) depth.set(s, Math.max(depth.get(s)!, depth.get(id)! + 1));
    }
  }
  return { depth, order };
}

function layered(nodes: LNode[], edges: LEdge[], o: LayoutOptions, dir: 'vertical' | 'horizontal', spread = 1): Pos {
  const flow = dir === 'vertical' ? 'y' : 'x';
  const cross = dir === 'vertical' ? 'x' : 'y';
  const { depth, order } = layering(nodes, edges, flow);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const layers = new Map<number, ID[]>();
  for (const id of order) {
    const d = depth.get(id)!;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(id);
  }
  // Spine: the node on each layer continuing from the previous spine node stays on axis.
  const succ = new Map<ID, ID[]>();
  for (const [a, b] of edges) { if (!succ.has(a)) succ.set(a, []); succ.get(a)!.push(b); }
  const start = Math.min(...nodes.map((n) => n[flow]));
  const first = byId.get(order[0])!;
  const axisCross = first[cross];
  const out: Pos = {};
  let prevSpine: ID | undefined;
  const maxD = Math.max(...layers.keys());
  for (let d = 0; d <= maxD; d++) {
    const layer = layers.get(d) ?? [];
    if (!layer.length) continue;
    const spine = layer.find((id) => prevSpine && succ.get(prevSpine)?.includes(id)) ?? layer[0];
    const others = layer.filter((id) => id !== spine).sort((a, b) => byId.get(a)![cross] - byId.get(b)![cross]);
    const place = (id: ID, k: number) => {
      const p = { x: 0, y: 0 };
      p[flow] = start + d * o.spacing;
      p[cross] = axisCross + k * o.spacing * spread;
      out[id] = p;
    };
    place(spine, 0);
    // alternate sides, but respect the side the node was already on
    let left = 0, right = 0;
    for (const id of others) {
      const onLeft = byId.get(id)![cross] < axisCross;
      if (onLeft) place(id, -++left); else place(id, ++right);
    }
    prevSpine = spine;
  }
  return out;
}

/** Order nodes around a cycle following reaction direction; falls back to angle. */
export function cycleOrder(nodes: LNode[], edges: LEdge[]): ID[] {
  const ids = new Set(nodes.map((n) => n.id));
  const succ = new Map<ID, ID[]>();
  for (const [a, b] of edges) if (ids.has(a) && ids.has(b)) { if (!succ.has(a)) succ.set(a, []); succ.get(a)!.push(b); }
  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  const ang = (n: LNode) => Math.atan2(n.y - cy, n.x - cx);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // start at the top-most node
  const startNode = [...nodes].sort((a, b) => a.y - b.y)[0];
  const order: ID[] = [startNode.id];
  const seen = new Set(order);
  while (order.length < nodes.length) {
    const cur = order[order.length - 1];
    const nxt = (succ.get(cur) ?? []).find((s) => !seen.has(s));
    if (nxt) { order.push(nxt); seen.add(nxt); continue; }
    // jump to the next unvisited node clockwise
    const a0 = ang(byId.get(cur)!);
    const rest = nodes.filter((n) => !seen.has(n.id)).sort((p, q) => ((ang(p) - a0 + 4 * Math.PI) % (2 * Math.PI)) - ((ang(q) - a0 + 4 * Math.PI) % (2 * Math.PI)));
    order.push(rest[0].id);
    seen.add(rest[0].id);
  }
  return order;
}

export function applyLayout(kind: LayoutKind, nodes: LNode[], edges: LEdge[], o: LayoutOptions): Pos {
  if (nodes.length < 2) return {};
  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  switch (kind) {
    case 'vertical':
      return layered(nodes, edges, o, 'vertical');
    case 'horizontal':
      return layered(nodes, edges, o, 'horizontal');
    case 'hierarchical':
      return layered(nodes, edges, { ...o, spacing: o.spacing * 1.1 }, 'vertical', 1.4);
    case 'circle': {
      const order = cycleOrder(nodes, edges);
      const r = o.radius ?? Math.max(50, (o.spacing * order.length) / (2 * Math.PI));
      const start = ((o.startAngle ?? -90) * Math.PI) / 180;
      const sgn = o.clockwise === false ? -1 : 1;
      const out: Pos = {};
      order.forEach((id, i) => {
        const t = start + sgn * ((2 * Math.PI * i) / order.length);
        out[id] = { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
      });
      return out;
    }
    case 'grid': {
      const cols = o.columns ?? Math.ceil(Math.sqrt(nodes.length));
      const sorted = [...nodes].sort((a, b) => (Math.abs(a.y - b.y) > o.spacing / 2 ? a.y - b.y : a.x - b.x));
      const x0 = Math.min(...nodes.map((n) => n.x));
      const y0 = Math.min(...nodes.map((n) => n.y));
      const out: Pos = {};
      sorted.forEach((n, i) => (out[n.id] = { x: x0 + (i % cols) * o.spacing, y: y0 + Math.floor(i / cols) * o.spacing }));
      return out;
    }
    case 'organic':
      return organic(nodes, edges, o.spacing);
  }
}

function organic(nodes: LNode[], edges: LEdge[], L: number): Pos {
  const P = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, vx: 0, vy: 0 }));
  const idx = new Map(P.map((p, i) => [p.id, i]));
  const es = edges.filter(([a, b]) => idx.has(a) && idx.has(b)).map(([a, b]) => [idx.get(a)!, idx.get(b)!]);
  const cx0 = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy0 = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  for (let it = 0; it < 300; it++) {
    const temp = 1 - it / 300;
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const dx = P[i].x - P[j].x || 0.01, dy = P[i].y - P[j].y || 0.01;
        const d2 = dx * dx + dy * dy;
        const f = (L * L) / d2;
        P[i].vx += dx * f * 0.05; P[i].vy += dy * f * 0.05;
        P[j].vx -= dx * f * 0.05; P[j].vy -= dy * f * 0.05;
      }
    }
    for (const [a, b] of es) {
      const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - L) / d * 0.1;
      P[a].vx += dx * f; P[a].vy += dy * f; P[b].vx -= dx * f; P[b].vy -= dy * f;
    }
    for (const p of P) {
      const v = Math.hypot(p.vx, p.vy);
      const max = L * 0.5 * temp + 0.5;
      if (v > max) { p.vx *= max / v; p.vy *= max / v; }
      p.x += p.vx; p.y += p.vy; p.vx *= 0.5; p.vy *= 0.5;
    }
  }
  const cx = P.reduce((s, p) => s + p.x, 0) / P.length;
  const cy = P.reduce((s, p) => s + p.y, 0) / P.length;
  const out: Pos = {};
  for (const p of P) out[p.id] = { x: p.x - cx + cx0, y: p.y - cy + cy0 };
  return out;
}

export type AlignKind = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';

export function align(kind: AlignKind, nodes: LNode[]): Pos {
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const v =
    kind === 'left' ? Math.min(...xs) : kind === 'right' ? Math.max(...xs) : kind === 'top' ? Math.min(...ys) : kind === 'bottom' ? Math.max(...ys)
    : kind === 'centerX' ? (Math.min(...xs) + Math.max(...xs)) / 2 : (Math.min(...ys) + Math.max(...ys)) / 2;
  const out: Pos = {};
  const horizontalLine = kind === 'top' || kind === 'bottom' || kind === 'centerY';
  for (const n of nodes) out[n.id] = horizontalLine ? { x: n.x, y: v } : { x: v, y: n.y };
  return out;
}

export function distribute(axis: 'x' | 'y', nodes: LNode[], spacing?: number): Pos {
  const sorted = [...nodes].sort((a, b) => a[axis] - b[axis]);
  const lo = sorted[0][axis];
  const step = spacing ?? (sorted[sorted.length - 1][axis] - lo) / Math.max(1, sorted.length - 1);
  const out: Pos = {};
  sorted.forEach((n, i) => (out[n.id] = axis === 'x' ? { x: lo + i * step, y: n.y } : { x: n.x, y: lo + i * step }));
  return out;
}

/** Detect the intended arrangement (line / column / ring / scatter) and clean it up. */
export function tidy(nodes: LNode[], edges: LEdge[], spacing: number, grid: number): { pos: Pos; detected: string } {
  if (nodes.length < 2) return { pos: {}, detected: 'nothing' };
  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  const vx = nodes.reduce((s, n) => s + (n.x - cx) ** 2, 0) / nodes.length;
  const vy = nodes.reduce((s, n) => s + (n.y - cy) ** 2, 0) / nodes.length;
  const dists = nodes.map((n) => Math.hypot(n.x - cx, n.y - cy));
  const md = dists.reduce((a, b) => a + b, 0) / dists.length;
  const cv = Math.sqrt(dists.reduce((s, d) => s + (d - md) ** 2, 0) / dists.length) / (md || 1);
  const snap = (v: number) => Math.round(v / grid) * grid;
  if (nodes.length >= 4 && cv < 0.22 && vx > 0 && vy > 0 && Math.min(vx, vy) / Math.max(vx, vy) > 0.4) {
    const pos = applyLayout('circle', nodes, edges, { spacing, radius: Math.round(md / (grid / 2)) * (grid / 2) });
    return { pos, detected: 'ring' };
  }
  if (vx > 3 * vy || vy > 3 * vx) {
    const axis = vx > vy ? 'x' : 'y';
    const other = axis === 'x' ? 'y' : 'x';
    const sorted = [...nodes].sort((a, b) => a[axis] - b[axis]);
    const med = snap([...nodes].map((n) => n[other]).sort((a, b) => a - b)[Math.floor(nodes.length / 2)]);
    const span = sorted[sorted.length - 1][axis] - sorted[0][axis];
    const step = Math.max(grid, Math.round(span / (sorted.length - 1) / grid) * grid);
    const start = snap(sorted[0][axis]);
    const pos: Pos = {};
    sorted.forEach((n, i) => { const p = { x: 0, y: 0 }; p[axis] = start + i * step; p[other] = med; pos[n.id] = p; });
    return { pos, detected: axis === 'x' ? 'row' : 'column' };
  }
  const pos: Pos = {};
  for (const n of nodes) pos[n.id] = { x: snap(n.x), y: snap(n.y) };
  return { pos, detected: 'grid' };
}
