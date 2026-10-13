/**
 * Map templates: reusable skeletons of slots (unbound metabolite nodes) and
 * arrows (unbound reactions). They can be drawn before any model is loaded,
 * then auto-bound to any GEM through compartment-agnostic hints.
 */
import { baseId } from '../model/currency';
import { findConnecting } from '../model/graph';
import type { ID, MetabolicModel } from '../model/types';
import type { LabelPos, NodeGlyph, ReactionGlyph, VisualDoc } from '../viz/types';
import { entityOf } from './mapping/library';
import { PATHWAY_SPECS } from './pathways';
import type { PathwayTemplateSpec } from './spec';

export interface TemplateNode {
  key: string;
  x: number;
  y: number;
  label: string;
  hints?: string[];
  labelPos?: LabelPos;
  role?: 'normal' | 'exchange';
}
export interface TemplateReaction {
  sources: string[];
  targets: string[];
  label?: string;
  hints?: string[];
  role?: 'normal' | 'exchange';
  routing?: 'straight' | 'curved' | 'orthogonal';
  bend?: number;
}
export interface MapTemplate {
  id: string;
  name: string;
  description: string;
  category: 'shape' | 'pathway' | 'user';
  nodes: TemplateNode[];
  reactions: TemplateReaction[];
  groups?: { title: string; keys: string[]; kind: 'pathway' | 'compartment' }[];
  texts?: { x: number; y: number; text: string; size: number; weight: 400 | 500 | 600 | 700; italic?: boolean; kind: 'text' | 'panel' | 'title' }[];
  /** Model-agnostic pathway spec: mapped with the template mapping engine instead of hints. */
  spec?: PathwayTemplateSpec;
}

const chain = (n: number, vertical: boolean): MapTemplate => ({
  id: `chain-${vertical ? 'v' : 'h'}-${n}`,
  name: `${vertical ? 'Vertical' : 'Horizontal'} chain (${n})`,
  description: 'Linear pathway skeleton',
  category: 'shape',
  nodes: Array.from({ length: n }, (_, i) => ({ key: `n${i}`, x: vertical ? 0 : i * 80, y: vertical ? i * 60 : 0, label: `M${i + 1}`, labelPos: vertical ? 'right' : 'bottom' })),
  reactions: Array.from({ length: n - 1 }, (_, i) => ({ sources: [`n${i}`], targets: [`n${i + 1}`], label: `R${i + 1}` })),
});

const cycle = (n: number): MapTemplate => {
  const r = Math.max(60, (60 * n) / (2 * Math.PI));
  return {
    id: `cycle-${n}`,
    name: `Cycle (${n})`,
    description: 'Circular pathway (TCA, urea, glyoxylate …)',
    category: 'shape',
    nodes: Array.from({ length: n }, (_, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const x = Math.round(r * Math.cos(t)), y = Math.round(r * Math.sin(t));
      return { key: `n${i}`, x, y, label: `M${i + 1}`, labelPos: Math.abs(x) < 5 ? (y < 0 ? 'top' : 'bottom') : x > 0 ? 'right' : 'left' };
    }),
    reactions: Array.from({ length: n }, (_, i) => ({ sources: [`n${i}`], targets: [`n${(i + 1) % n}`], label: `R${i + 1}`, routing: 'curved', bend: -Math.round(r * 0.12) })),
  };
};

const branch: MapTemplate = {
  id: 'branch', name: 'Branch point (1 → 3)', description: 'Divergent node, e.g. pyruvate', category: 'shape',
  nodes: [
    { key: 'a', x: 0, y: 0, label: 'A' }, { key: 'b', x: 0, y: 70, label: 'B' },
    { key: 'c', x: -90, y: 140, label: 'C', labelPos: 'left' }, { key: 'd', x: 0, y: 140, label: 'D' }, { key: 'e', x: 90, y: 140, label: 'E' },
  ],
  reactions: [
    { sources: ['a'], targets: ['b'], label: 'R1' }, { sources: ['b'], targets: ['c'], label: 'R2' },
    { sources: ['b'], targets: ['d'], label: 'R3' }, { sources: ['b'], targets: ['e'], label: 'R4' },
  ],
};

const merge: MapTemplate = {
  id: 'merge', name: 'Condensation (2 → 1)', description: 'Two substrates, one product (e.g. citrate synthase)', category: 'shape',
  nodes: [{ key: 'a', x: -60, y: 0, label: 'A', labelPos: 'left' }, { key: 'b', x: 60, y: 0, label: 'B' }, { key: 'c', x: 0, y: 90, label: 'C' }],
  reactions: [{ sources: ['a', 'b'], targets: ['c'], label: 'R1' }],
};

// ------------------------------------------------------------ pathway templates
// Model-agnostic specs (templates/pathways.ts) drawn with their own layout. The
// hints (BiGG ids + names) only serve the legacy "Auto-bind" of plain slots;
// template nodes are mapped by the mapping engine (templates/mapping/engine.ts).

/** Drawing skeleton of a pathway spec. */
export function specToMapTemplate(spec: PathwayTemplateSpec): MapTemplate {
  const nodes: TemplateNode[] = spec.biology.slots.map((s) => {
    const e = entityOf(spec, s.entity);
    const p = spec.layout.nodes[s.slot];
    return {
      key: s.slot, x: p.x, y: p.y, label: s.label ?? e?.short ?? s.slot, labelPos: p.labelPos, role: s.role,
      hints: e ? [...[e, ...(s.alternatives ?? []).map((a) => entityOf(spec, a))].flatMap((x) => x?.xrefs['bigg.metabolite'] ?? []), e.name, ...e.synonyms.slice(0, 2)] : undefined,
    };
  });
  const reactions: TemplateReaction[] = spec.biology.reactions.map((r) => ({
    sources: r.sources, targets: r.targets, label: r.name, hints: r.hints, ...(spec.layout.reactions?.[r.id] ?? {}),
  }));
  const groups = spec.layout.groups?.map((g) => ({ title: g.title, keys: g.slots, kind: 'pathway' as const }));
  return { id: spec.id, name: spec.name, description: spec.description, category: 'pathway', nodes, reactions, groups, spec };
}

export const BUILTIN_TEMPLATES: MapTemplate[] = [
  ...PATHWAY_SPECS.map(specToMapTemplate),
  chain(4, true), chain(6, true), chain(4, false), cycle(6), cycle(8), branch, merge,
];

// ------------------------------------------------------------ binding

/** Best model metabolite for a slot's hints. Prefers cytosol, then any compartment. */
export function resolveMetabolite(model: MetabolicModel, hints: string[], preferCompartment = 'c'): ID | undefined {
  const mets = Object.values(model.metabolites);
  for (const h of hints) {
    if (model.metabolites[h]) return h;
    const hl = h.toLowerCase();
    const byBase = mets.filter((m) => baseId(m.id).toLowerCase() === hl);
    if (byBase.length) return (byBase.find((m) => m.compartment === preferCompartment) ?? byBase[0]).id;
  }
  for (const h of hints) {
    const hl = h.toLowerCase();
    const byName = mets.filter((m) => m.name.toLowerCase() === hl);
    if (byName.length) return (byName.find((m) => m.compartment === preferCompartment) ?? byName[0]).id;
  }
  return undefined;
}

/** Bind a reaction glyph whose endpoints are bound to metabolites. Mutates `g`. */
export function bindReactionGlyph(g: ReactionGlyph, nodes: Record<ID, NodeGlyph>, model: MetabolicModel): boolean {
  const src = g.sources.map((s) => nodes[s]?.metaboliteId).filter(Boolean) as ID[];
  const tgt = g.targets.map((t) => nodes[t]?.metaboliteId).filter(Boolean) as ID[];
  if (!src.length || !tgt.length) return false;
  for (const a of src) {
    for (const b of tgt) {
      const found = findConnecting(model, a, b, g.hints ?? [], { ec: g.ec });
      if (found.length) {
        const f = found[0];
        g.reactionId = f.reactionIds[0];
        g.lumped = f.reactionIds.length > 1 ? f.reactionIds : undefined;
        g.reversedToModel = f.reversed;
        return true;
      }
    }
  }
  return false;
}

/** Auto-bind all unbound slots and arrows in a document. Returns counts. */
export function autoBind(doc: VisualDoc, model: MetabolicModel, onlyIds?: Set<ID>): { doc: VisualDoc; nodes: number; reactions: number; totalNodes: number; totalReactions: number } {
  const nodes = { ...doc.nodes };
  const reactions = { ...doc.reactions };
  let nb = 0, rb = 0, tn = 0, tr = 0;
  for (const n of Object.values(nodes)) {
    if (onlyIds && !onlyIds.has(n.id)) continue;
    if (n.template || n.attach) continue; // template nodes: mapping engine (remapDocTemplates); attached cofactors: drawing only
    if (n.metaboliteId && model.metabolites[n.metaboliteId]) continue;
    tn++;
    const hints = [...(n.hints ?? []), ...(n.label ? [n.label] : [])];
    const mid = resolveMetabolite(model, hints);
    if (mid) { nodes[n.id] = { ...n, metaboliteId: mid }; nb++; }
  }
  for (const g of Object.values(reactions)) {
    if (onlyIds && !g.sources.concat(g.targets).some((id) => onlyIds.has(id))) continue;
    if (g.reactionId && model.reactions[g.reactionId]) continue;
    tr++;
    const copy = { ...g };
    if (bindReactionGlyph(copy, nodes, model)) { reactions[g.id] = copy; rb++; }
  }
  return { doc: { ...doc, nodes, reactions }, nodes: nb, reactions: rb, totalNodes: tn, totalReactions: tr };
}

/** Make a portable template from the current selection (bindings become hints). */
export function templateFromSelection(name: string, doc: VisualDoc, nodeIds: ID[], model: MetabolicModel | null): MapTemplate {
  const set = new Set(nodeIds);
  const ns = nodeIds.map((id) => doc.nodes[id]).filter(Boolean);
  const x0 = Math.min(...ns.map((n) => n.x));
  const y0 = Math.min(...ns.map((n) => n.y));
  const nodes: TemplateNode[] = ns.map((n) => {
    const met = n.metaboliteId && model?.metabolites[n.metaboliteId];
    const hints = Array.from(new Set([...(n.metaboliteId ? [baseId(n.metaboliteId)] : []), ...(met ? [met.name] : []), ...(n.hints ?? [])]));
    return { key: n.id, x: n.x - x0, y: n.y - y0, label: n.label ?? (n.metaboliteId ? baseId(n.metaboliteId) : 'M'), hints, labelPos: n.labelPos, role: n.role };
  });
  const reactions: TemplateReaction[] = Object.values(doc.reactions)
    .filter((g) => g.sources.every((s) => set.has(s)) && g.targets.every((t) => set.has(t)))
    .map((g) => ({
      sources: g.sources, targets: g.targets, routing: g.routing, bend: g.bend, role: g.role,
      label: g.label ?? (g.reactionId ? baseId(g.reactionId) : undefined),
      hints: Array.from(new Set([...(g.reactionId ? [baseId(g.reactionId)] : []), ...(g.lumped ?? []).map(baseId), ...(g.hints ?? [])])),
    }));
  const groups = Object.values(doc.groups)
    .filter((gr) => gr.nodeIds.some((id) => set.has(id)))
    .map((gr) => ({ title: gr.title, keys: gr.nodeIds.filter((id) => set.has(id)), kind: gr.kind }));
  return { id: 'user-' + Date.now().toString(36), name, description: `${nodes.length} slots · ${reactions.length} reactions`, category: 'user', nodes, reactions, groups };
}

const USER_KEY = 'gemsmap.userTemplates';
export function loadUserTemplates(): MapTemplate[] {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || '[]'); } catch { return []; }
}
export function saveUserTemplates(ts: MapTemplate[]) {
  try { localStorage.setItem(USER_KEY, JSON.stringify(ts)); } catch { /* storage unavailable */ }
}
