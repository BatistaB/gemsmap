/**
 * Turning a template mapping into map glyphs, and re-mapping template nodes
 * already on the canvas (e.g. after switching to another GEM). The layout of
 * the template is never changed by mapping: only bindings and statuses are.
 */
import type { ID, MetabolicModel } from '../model/types';
import type { LabelPos, Point, ReactionGlyph, Routing, TemplateSlotRef, VisualDoc } from '../viz/types';
import { specFromLibrary } from './library/registry';
import { isMapped, mapTemplate, type SlotResult, type TemplateMapping } from './mapping/engine';
import { entityOf } from './mapping/library';
import { indexModel } from './mapping/modelIndex';
import { loadProfile } from './mapping/profile';
import { findSlot } from './pathways';
import type { PathwayTemplateSpec } from './spec';
import { bindReactionGlyph } from './templates';

/** Built-in or user template by id (templates/library/registry.ts). */
export const specById = (id: string): PathwayTemplateSpec | undefined => specFromLibrary(id);

export function slotRef(spec: PathwayTemplateSpec, s: SlotResult): TemplateSlotRef {
  return {
    templateId: spec.id, templateVersion: spec.version, slot: s.slot.slot, entity: s.entity.id, compartment: s.expected.expected,
    status: s.status, score: s.chosen?.score, method: s.chosen?.method,
  };
}

interface Drawing {
  nodes: { id: string; slot: string; x: number; y: number; labelPos?: LabelPos; shape?: 'circle' | 'label'; r?: number; fill?: string }[];
  cofactors: { id: string; reaction: string; side: 'in' | 'out'; x: number; y: number; label: string }[];
  reactions: { reaction: string; sources: string[]; targets: string[]; routing: Routing; bend?: number; labelOffset?: Point; labelAngle?: number; labelFlip?: boolean }[];
  groups: { title: string; kind: 'pathway' | 'compartment'; nodes: string[]; subtitle?: string; padding?: number; fill?: string; stroke?: string; dashed?: boolean }[];
  texts: { x: number; y: number; text: string; size: number; weight: 400 | 500 | 600 | 700; italic?: boolean; color?: string; kind: 'text' | 'panel' | 'title'; rotate?: number }[];
}

/** The drawing of a spec: the template file's full layout when there is one, else the compact spec layout. */
function drawingOf(spec: PathwayTemplateSpec): Drawing {
  const slots = new Set(spec.biology.slots.map((s) => s.slot));
  const src = spec.source;
  if (!src) {
    return {
      nodes: spec.biology.slots.map((s) => ({ id: s.slot, slot: s.slot, ...spec.layout.nodes[s.slot] })),
      reactions: spec.biology.reactions.map((r) => ({ reaction: r.id, sources: r.sources, targets: r.targets, routing: spec.layout.reactions?.[r.id]?.routing ?? 'straight', bend: spec.layout.reactions?.[r.id]?.bend })),
      groups: (spec.layout.groups ?? []).map((g) => ({ title: g.title, kind: 'pathway', nodes: g.slots })),
      texts: [], cofactors: [],
    };
  }
  const mets = new Map(src.biology.metabolites.map((m) => [m.id, m]));
  const ents = new Map(src.biology.entities.map((e) => [e.id, e]));
  const cofactors = src.layout.nodes.filter((n) => n.attach).map((n) => {
    const m = mets.get(n.metabolite);
    const e = m && ents.get(m.entity);
    return { id: n.id, reaction: n.attach!.reaction, side: n.attach!.side, x: n.x, y: n.y, label: m?.label || e?.short || e?.name || '?' };
  });
  const nodes = src.layout.nodes.filter((n) => !n.attach && slots.has(n.metabolite)).map((n) => ({ id: n.id, slot: n.metabolite, x: n.x, y: n.y, labelPos: n.label_pos, shape: n.shape, r: n.r, fill: n.fill }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const portTexts = src.layout.ports.map((p) => {
    const c = src.biology.connectors.find((x) => x.id === p.connector);
    return { x: p.x, y: p.y, text: c ? `${c.direction === 'in' ? '← from' : '→'} ${c.target.pathway}` : '→', size: 10, weight: 400 as const, italic: true, kind: 'text' as const };
  });
  return {
    nodes,
    reactions: src.layout.reactions.filter((r) => r.sources.every((x) => nodeIds.has(x)) && r.targets.every((x) => nodeIds.has(x)))
      .map((r) => ({ reaction: r.reaction, sources: r.sources, targets: r.targets, routing: r.routing, bend: r.bend, labelOffset: r.label_offset, labelAngle: r.label_angle, labelFlip: r.label_flip })),
    groups: src.layout.groups.map((g) => ({ title: g.title, kind: g.kind, nodes: g.nodes.filter((x) => nodeIds.has(x)), subtitle: g.subtitle, padding: g.padding, fill: g.fill, stroke: g.stroke, dashed: g.dashed })),
    texts: [...src.layout.labels.map(({ id: _id, ...t }) => t), ...portTexts],
    cofactors,
  };
}

/** Add a mapped pathway to a document at `origin` (top-left of the template layout). */
export function addPathwayToDoc(
  doc: VisualDoc, spec: PathwayTemplateSpec, mapping: TemplateMapping | null, origin: Point, model: MetabolicModel | null,
  uid: (p: string) => string, snap: (v: number) => number,
): { doc: VisualDoc; nodeIds: ID[]; cofactorIds: ID[]; textIds: ID[]; reactionsBound: number } {
  const d = drawingOf(spec);
  const xs = [...d.nodes.map((p) => p.x), ...d.texts.map((t) => t.x)], ys = [...d.nodes.map((p) => p.y), ...d.texts.map((t) => t.y)];
  const b = { x: Math.min(...xs), y: Math.min(...ys) };
  const at = (x: number, y: number) => ({ x: snap(origin.x + x - b.x), y: snap(origin.y + y - b.y) });
  const out: VisualDoc = { ...doc, nodes: { ...doc.nodes }, reactions: { ...doc.reactions }, groups: { ...doc.groups }, texts: { ...doc.texts } };
  const bySlot = new Map(mapping?.slots.map((s) => [s.slot.slot, s]));
  const slotOf = new Map(spec.biology.slots.map((s) => [s.slot, s]));
  const ids = new Map<string, ID>();
  for (const n of d.nodes) {
    const s = slotOf.get(n.slot)!;
    const id = uid('n');
    ids.set(n.id, id);
    const e = entityOf(spec, s.entity);
    const res = bySlot.get(s.slot);
    out.nodes[id] = {
      id, ...at(n.x, n.y), labelPos: n.labelPos, role: s.role, ...(n.shape ? { shape: n.shape } : {}), ...(n.r ? { r: n.r } : {}), ...(n.fill ? { fill: n.fill } : {}),
      label: s.label ?? e?.short ?? s.slot,
      metaboliteId: res && res.chosen && isMapped(res.status) ? res.chosen.metId : undefined,
      template: res ? slotRef(spec, res) : { templateId: spec.id, templateVersion: spec.version, slot: s.slot, entity: s.entity, compartment: null, status: 'unresolved' },
    };
  }
  const byRid = new Map(mapping?.reactions.map((r) => [r.spec.id, r]));
  const rSpec = new Map(spec.biology.reactions.map((r) => [r.id, r]));
  const glyphOf = new Map<string, ID>();
  let reactionsBound = 0;
  for (const lr of d.reactions) {
    const r = rSpec.get(lr.reaction);
    if (!r) continue;
    const id = uid('r');
    glyphOf.set(r.id, id);
    const g: ReactionGlyph = {
      id, sources: lr.sources.map((k) => ids.get(k)!), targets: lr.targets.map((k) => ids.get(k)!), label: r.name, hints: r.hints, ec: r.ec,
      routing: lr.routing ?? 'straight', bend: lr.bend, labelOffset: lr.labelOffset, labelAngle: lr.labelAngle, labelFlip: lr.labelFlip,
    };
    if (model && byRid.get(r.id)?.mapped && bindReactionGlyph(g, out.nodes, model)) reactionsBound++;
    out.reactions[id] = g;
  }
  for (const gr of d.groups) {
    const id = uid('g');
    const comp = gr.kind === 'compartment';
    out.groups[id] = {
      id, kind: gr.kind, title: gr.title, subtitle: gr.subtitle, nodeIds: gr.nodes.map((k) => ids.get(k)!).filter(Boolean),
      padding: gr.padding ?? (comp ? 40 : 24), fill: gr.fill ?? (comp ? '#f4f6fb' : 'none'), stroke: gr.stroke ?? (comp ? '#b9c2d6' : 'none'), dashed: gr.dashed ?? comp,
    };
  }
  const textIds: ID[] = [], cofactorIds: ID[] = [];
  for (const t of d.texts) { const id = uid('t'); textIds.push(id); out.texts[id] = { id, ...t, ...at(t.x, t.y) }; }
  for (const c of d.cofactors) {
    const glyph = glyphOf.get(c.reaction);
    if (!glyph) continue;
    const id = uid('n');
    cofactorIds.push(id);
    out.nodes[id] = { id, ...at(c.x, c.y), label: c.label, shape: 'label', attach: { glyph, side: c.side } };
  }
  return { doc: out, nodeIds: [...ids.values()], cofactorIds, textIds, reactionsBound };
}

/**
 * Re-run the mapping engine for template nodes on the canvas (model switched,
 * or profile changed). Confirmed / absent choices made on these nodes are kept;
 * everything else is re-decided. Reaction arrows touching changed nodes are re-bound.
 * Nodes drawn with an older template version find their slot through its aliases.
 */
export function remapDocTemplates(doc: VisualDoc, model: MetabolicModel): { doc: VisualDoc; mapped: number; total: number; review: number } {
  const groups = new Map<string, ID[]>();
  for (const n of Object.values(doc.nodes)) if (n.template) groups.set(n.template.templateId, [...(groups.get(n.template.templateId) ?? []), n.id]);
  if (!groups.size) return { doc, mapped: 0, total: 0, review: 0 };
  const nodes = { ...doc.nodes };
  const changed = new Set<ID>();
  const profile = loadProfile(indexModel(model).fingerprint);
  let mapped = 0, total = 0, review = 0;
  for (const [tid, nids] of groups) {
    const spec = specById(tid);
    if (!spec) continue;
    const overrides: Record<string, ID | null> = {};
    const slotOfNode = new Map<ID, string>();
    for (const id of nids) {
      const t = nodes[id].template!;
      const slot = findSlot(spec, t.slot)?.slot;
      if (!slot) continue;
      slotOfNode.set(id, slot);
      if (t.status === 'confirmed' && nodes[id].metaboliteId && model.metabolites[nodes[id].metaboliteId!]) overrides[slot] = nodes[id].metaboliteId!;
      if (t.status === 'absent') overrides[slot] = null;
    }
    const res = mapTemplate(spec, model, { profile, overrides });
    const bySlot = new Map(res.slots.map((s) => [s.slot.slot, s]));
    for (const id of nids) {
      const n = nodes[id];
      const s = bySlot.get(slotOfNode.get(id) ?? '');
      if (!s) continue;
      total++;
      const metaboliteId = s.chosen && isMapped(s.status) ? s.chosen.metId : undefined;
      if (metaboliteId) mapped++;
      if (s.status === 'provisional' || s.status === 'ambiguous') review++;
      if (metaboliteId !== n.metaboliteId) changed.add(id);
      nodes[id] = { ...n, metaboliteId, template: slotRef(spec, s) };
    }
  }
  const reactions = { ...doc.reactions };
  for (const g of Object.values(reactions)) {
    if (![...g.sources, ...g.targets].some((x) => changed.has(x)) && g.reactionId && model.reactions[g.reactionId]) continue;
    if (![...g.sources, ...g.targets].some((x) => nodes[x]?.template)) continue;
    const c: ReactionGlyph = { ...g, reactionId: undefined, lumped: undefined, reversedToModel: undefined };
    bindReactionGlyph(c, nodes, model);
    reactions[g.id] = c;
  }
  return { doc: { ...doc, nodes, reactions }, mapped, total, review };
}
