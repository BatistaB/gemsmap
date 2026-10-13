/**
 * Cofactors drawn beside an arrow (attached nodes, NodeGlyph.attach) belong to that arrow: when the arrow's middle
 * moves — its metabolites dragged, nudged or re-laid-out, its bend changed — they move with it. A cofactor that was
 * itself moved in the same change (it was selected too) keeps its own new position.
 */
import type { ID } from '../model/types';
import { reactionGeometry } from './geometry';
import type { NodeGlyph, Point, ReactionGlyph, VisualDoc } from './types';

/** The middle of an arrow as the Scene places it (label and cofactor anchor). */
export function arrowMid(g: ReactionGlyph, nodes: Record<ID, NodeGlyph>): Point | null {
  return reactionGeometry(g, nodes, () => 0)?.mid ?? null;
}

export function followAttached(prev: VisualDoc, next: VisualDoc): VisualDoc {
  let nodes: Record<ID, NodeGlyph> | null = null;
  const mids = new Map<ID, Point | null>();
  for (const n of Object.values(next.nodes)) {
    if (!n.attach) continue;
    const before = prev.nodes[n.id];
    if (!before || before.x !== n.x || before.y !== n.y) continue; // new, or moved on purpose
    const g0 = prev.reactions[n.attach.glyph], g1 = next.reactions[n.attach.glyph];
    if (!g0 || !g1) continue;
    if (g0 === g1 && [...g1.sources, ...g1.targets].every((id) => prev.nodes[id] === next.nodes[id])) continue; // arrow untouched
    if (!mids.has(g1.id)) {
      const a = arrowMid(g0, prev.nodes), b = arrowMid(g1, next.nodes);
      mids.set(g1.id, a && b ? { x: b.x - a.x, y: b.y - a.y } : null);
    }
    const d = mids.get(g1.id);
    if (!d || (Math.abs(d.x) < 1e-6 && Math.abs(d.y) < 1e-6)) continue;
    nodes ??= { ...next.nodes };
    nodes[n.id] = { ...n, x: +(n.x + d.x).toFixed(2), y: +(n.y + d.y).toFixed(2) };
  }
  return nodes ? { ...next, nodes } : next;
}
