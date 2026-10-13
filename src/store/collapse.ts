/**
 * Collapse a sub-network of the map into one summary arrow, and expand it back.
 * Nothing is lost: hidden glyphs are stored inside the summary arrow.
 */
import type { ID } from '../model/types';
import type { Aggregate, CollapsedInfo, PlotGlyph, ReactionGlyph, VisualDoc } from '../viz/types';
import { uid } from './project';

/** Canvas glyphs lying on any drawn route from a to b (following arrow direction). */
export function glyphsBetween(doc: VisualDoc, a: ID, b: ID): ID[] {
  const out = new Map<ID, ReactionGlyph[]>();
  const inc = new Map<ID, ReactionGlyph[]>();
  for (const g of Object.values(doc.reactions)) {
    for (const s of g.sources) { if (!out.has(s)) out.set(s, []); out.get(s)!.push(g); }
    for (const t of g.targets) { if (!inc.has(t)) inc.set(t, []); inc.get(t)!.push(g); }
  }
  const reach = (start: ID, edges: Map<ID, ReactionGlyph[]>, next: (g: ReactionGlyph) => ID[], stop: ID) => {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const n = q.shift()!;
      if (n === stop) continue; // don't walk past the other endpoint
      for (const g of edges.get(n) ?? []) for (const m of next(g)) if (!seen.has(m)) { seen.add(m); q.push(m); }
    }
    return seen;
  };
  const fwd = reach(a, out, (g) => g.targets, b);
  const bwd = reach(b, inc, (g) => g.sources, a);
  const onPath = new Set([...fwd].filter((n) => bwd.has(n)));
  if (!onPath.has(a) || !onPath.has(b)) return [];
  return Object.values(doc.reactions)
    .filter((g) => g.sources.some((s) => onPath.has(s)) && g.targets.some((t) => onPath.has(t)) && !g.targets.includes(a) && !g.sources.includes(b))
    .map((g) => g.id);
}

export interface CollapseResult { doc: VisualDoc; id: ID; topology: CollapsedInfo['topology']; count: number; warning?: string }

export function collapseGlyphs(doc: VisualDoc, glyphIds: ID[], endpoints?: { sources: ID[]; targets: ID[] }): CollapseResult | null {
  const G = glyphIds.map((id) => doc.reactions[id]).filter(Boolean);
  if (!G.length) return null;
  const gset = new Set(G.map((g) => g.id));
  const N = new Set<ID>(G.flatMap((g) => [...g.sources, ...g.targets]));
  const asSource = new Set(G.flatMap((g) => g.sources));
  const asTarget = new Set(G.flatMap((g) => g.targets));
  // A node stays visible if anything outside the collapsed set uses it.
  const usedOutside = new Set<ID>();
  for (const g of Object.values(doc.reactions)) if (!gset.has(g.id)) for (const n of [...g.sources, ...g.targets]) usedOutside.add(n);
  for (const p of Object.values(doc.plots)) if (p.anchor.kind === 'node') usedOutside.add(p.anchor.id);
  let sources = endpoints?.sources ?? [...N].filter((n) => asSource.has(n) && !asTarget.has(n));
  let targets = endpoints?.targets ?? [...N].filter((n) => asTarget.has(n) && !asSource.has(n));
  let warning: string | undefined;
  if (!sources.length || !targets.length) {
    // a cycle or ambiguous selection: fall back to the first glyph's ends
    sources = [G[0].sources[0]];
    targets = [G[G.length - 1].targets[0]];
    warning = 'Could not detect clear start/end metabolites — used the first and last arrow.';
  }
  const boundary = new Set([...sources, ...targets]);
  const internal = [...N].filter((n) => !boundary.has(n) && !usedOutside.has(n) && !doc.nodes[n]?.locked);
  const internalSet = new Set(internal);

  const srcSet = new Set(sources), tgtSet = new Set(targets);
  const parallel = G.every((g) => g.sources.every((s) => srcSet.has(s)) && g.targets.every((t) => tgtSet.has(t)));
  const chain = !parallel && internal.every((n) => G.filter((g) => g.targets.includes(n)).length === 1 && G.filter((g) => g.sources.includes(n)).length === 1);
  const topology: CollapsedInfo['topology'] = parallel ? 'parallel' : chain ? 'series' : 'network';

  const members: CollapsedInfo['members'] = [];
  for (const g of G) {
    // orientation of this glyph relative to the summary arrow
    const orient: 1 | -1 = g.sources.some((s) => tgtSet.has(s)) || g.targets.some((t) => srcSet.has(t)) ? -1 : 1;
    const entry = g.sources.some((s) => srcSet.has(s)) || g.targets.some((t) => srcSet.has(t));
    if (g.collapsed) for (const m of g.collapsed.members) members.push({ reactionId: m.reactionId, sign: (m.sign * orient) as 1 | -1, entry: entry && m.entry });
    else if (g.reactionId) {
      const sign = (orient * (g.reversedToModel ? -1 : 1)) as 1 | -1;
      for (const rid of g.lumped ?? [g.reactionId]) members.push({ reactionId: rid, sign, entry: entry && rid === (g.lumped?.[0] ?? g.reactionId) });
    }
  }

  const hiddenPlots: PlotGlyph[] = Object.values(doc.plots).filter((p) => (p.anchor.kind === 'reaction' ? gset.has(p.anchor.id) : internalSet.has(p.anchor.id)));
  const groupOf: Record<ID, ID[]> = {};
  for (const gr of Object.values(doc.groups)) for (const n of gr.nodeIds) if (internalSet.has(n)) (groupOf[n] ??= []).push(gr.id);

  const anchorNode = doc.nodes[sources[0]];
  const aggregate: Aggregate = 'entry';
  const id = uid('r');
  const summary: ReactionGlyph = {
    id, sources, targets, routing: 'straight',
    collapsed: {
      members, aggregate, topology, showBadge: true,
      hidden: { nodes: internal.map((n) => doc.nodes[n]), reactions: G, plots: hiddenPlots, groupOf },
      anchor: { x: anchorNode?.x ?? 0, y: anchorNode?.y ?? 0 },
    },
  };
  const nodes = { ...doc.nodes };
  internal.forEach((n) => delete nodes[n]);
  const reactions = { ...doc.reactions };
  G.forEach((g) => delete reactions[g.id]);
  reactions[id] = summary;
  const plots = { ...doc.plots };
  hiddenPlots.forEach((p) => delete plots[p.id]);
  const groups = Object.fromEntries(Object.entries(doc.groups).map(([k, gr]) => [k, { ...gr, nodeIds: gr.nodeIds.filter((n) => !internalSet.has(n)) }]));
  return { doc: { ...doc, nodes, reactions, plots, groups }, id, topology, count: members.length, warning };
}

export function expandCollapsed(doc: VisualDoc, id: ID): { doc: VisualDoc; restored: ID[] } | null {
  const g = doc.reactions[id];
  const c = g?.collapsed;
  if (!c) return null;
  const a = doc.nodes[g.sources[0]];
  const dx = a ? a.x - c.anchor.x : 0, dy = a ? a.y - c.anchor.y : 0;
  const nodes = { ...doc.nodes };
  for (const n of c.hidden.nodes) if (!nodes[n.id]) nodes[n.id] = { ...n, x: n.x + dx, y: n.y + dy };
  const reactions = { ...doc.reactions };
  delete reactions[id];
  for (const r of c.hidden.reactions) reactions[r.id] = r;
  const plots = { ...doc.plots };
  for (const p of c.hidden.plots) plots[p.id] = p;
  // plots added to the summary arrow move to the first hidden arrow
  const first = c.hidden.reactions[0]?.id;
  for (const p of Object.values(plots)) if (p.anchor.kind === 'reaction' && p.anchor.id === id) {
    if (first) plots[p.id] = { ...p, anchor: { kind: 'reaction', id: first } }; else delete plots[p.id];
  }
  const groups = { ...doc.groups };
  for (const [n, gids] of Object.entries(c.hidden.groupOf)) for (const gid of gids) if (groups[gid] && !groups[gid].nodeIds.includes(n)) groups[gid] = { ...groups[gid], nodeIds: [...groups[gid].nodeIds, n] };
  return { doc: { ...doc, nodes, reactions, plots, groups }, restored: c.hidden.reactions.map((r) => r.id) };
}
