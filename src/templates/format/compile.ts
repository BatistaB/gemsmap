/**
 * Template file → engine spec. The mapping engine (templates/mapping/engine.ts)
 * keeps its own compact contract, PathwayTemplateSpec; this is the only bridge
 * between the two, so the matcher is reused unchanged:
 *
 *   template metabolite (entity @ compartment)  → slot
 *   entity (identity)                           → engine entity (spec.entities)
 *   conceptual compartment + fallback           → compartment rule
 *   main participants                           → reaction sources / targets
 *   BiGG reaction IDs + hints                   → tie-break hints
 *
 * Metabolites that are not drawn (cofactors that only appear in equations) are
 * not mapped: they are not nodes of the figure.
 */
import type { CompartmentRule } from '../mapping/compartments';
import type { CanonicalMetabolite } from '../mapping/library';
import type { PathwayTemplateSpec, ReactionSpec, SlotSpec } from '../spec';
import { compartmentLabel, toCanonical, type ConceptualCompartment, type TemplateEntity, type TemplateFile } from './schema';

const STRONG = ['kegg.compound', 'chebi', 'metanetx.chemical', 'seed.compound', 'bigg.metabolite'] as const;

/**
 * Cross-template key of an entity: the canonical-library id when the identity came from it,
 * otherwise its first strong database identifier, otherwise a template-local key. Mapping
 * profiles are keyed by it, so a choice made for pyruvate in Glycolysis is reused by the TCA template.
 */
export function entityKey(e: TemplateEntity, templateId: string): string {
  if (e.library) return e.library;
  for (const ns of STRONG) { const v = e.identifiers[ns]?.[0]; if (v) return `${ns}:${v}`; }
  return `${templateId}/${e.id}`;
}

export function toEngineEntity(e: TemplateEntity, key: string): CanonicalMetabolite {
  return {
    id: key, name: e.name, short: e.short || e.name, formula: e.formula, synonyms: e.synonyms,
    xrefs: e.identifiers, related: e.related?.map((r) => ({ note: r.note, names: r.names, xrefs: r.identifiers })),
  };
}

const DEFAULT_FALLBACK: Record<string, ConceptualCompartment[]> = { cytosol: [] };

function ruleFor(file: TemplateFile, c: ConceptualCompartment | null): CompartmentRule {
  if (!c) return { preferred: ['INTRACELLULAR'] };
  const def = file.biology.compartments.find((x) => x.id === c);
  const fallback = def ? def.fallback : [...(DEFAULT_FALLBACK[c] ?? ['cytosol']), 'intracellular' as const];
  return { preferred: [toCanonical(c)], fallback: fallback.map(toCanonical), ...(def?.note ? { note: def.note } : {}) };
}

/** Human summary of the compartment expectation, for gallery cards. */
export function compartmentSummary(file: TemplateFile): string {
  const drawn = new Set(file.layout.nodes.filter((n) => !n.attach).map((n) => n.metabolite));
  const count = new Map<string, number>();
  for (const m of file.biology.metabolites) if (drawn.has(m.id)) count.set(m.compartment ?? '', (count.get(m.compartment ?? '') ?? 0) + 1);
  const order = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c as ConceptualCompartment | '');
  if (!order.length) return 'no compartment yet';
  const main = order[0];
  const def = main ? file.biology.compartments.find((x) => x.id === main) : undefined;
  const fb = def?.fallback.find((x) => x !== 'intracellular');
  const head = main ? compartmentLabel(main).toLowerCase() : 'unspecified';
  const rest = order.slice(1).filter(Boolean).map((c) => compartmentLabel(c as ConceptualCompartment).toLowerCase());
  return `${head}${fb ? ` (${compartmentLabel(fb).toLowerCase()} in models without it)` : ''}${rest.length ? ` + ${rest.join(', ')}` : ''}`;
}

const cache = new WeakMap<TemplateFile, PathwayTemplateSpec>();

/** Compile a template file into the engine contract (memoised per file object). */
export function compileTemplate(file: TemplateFile): PathwayTemplateSpec {
  const hit = cache.get(file);
  if (hit) return hit;
  const tid = file.metadata.id;
  // attached cofactor drawings are not pathway nodes: only metabolites drawn on their own become slots
  const drawn = new Set(file.layout.nodes.filter((n) => !n.attach).map((n) => n.metabolite));

  // entities → engine entities (unique keys)
  const keyOf = new Map<string, string>();
  const entities: Record<string, CanonicalMetabolite> = {};
  for (const e of file.biology.entities) {
    let k = entityKey(e, tid);
    if (entities[k]) k = `${tid}/${e.id}`;
    keyOf.set(e.id, k);
    entities[k] = toEngineEntity(e, k);
  }

  // compartment rules: one per compartment used; "default" = the most common one
  const rules: Record<string, CompartmentRule> = {};
  const count = new Map<string, number>();
  const ruleKey = (c: ConceptualCompartment | null) => c ?? 'unspecified';
  const mets = file.biology.metabolites.filter((m) => drawn.has(m.id));
  for (const m of mets) {
    const k = ruleKey(m.compartment);
    rules[k] ??= ruleFor(file, m.compartment);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  rules.default = main ? rules[main] : ruleFor(file, 'cytosol');

  const slots: SlotSpec[] = mets.map((m) => ({
    slot: m.id, entity: keyOf.get(m.entity) ?? `${tid}/${m.entity}`, level: m.level, rule: ruleKey(m.compartment),
    ...(m.alternatives?.length ? { alternatives: m.alternatives.map((a) => keyOf.get(a)).filter((x): x is string => !!x) } : {}),
    ...(m.label ? { label: m.label } : {}), ...(m.role ? { role: m.role } : {}), ...(m.ungrouped ? { ungrouped: true } : {}),
    ...(m.aliases?.length ? { aliases: m.aliases } : {}),
  }));
  const slotIds = new Set(slots.map((s) => s.slot));

  const reactions: ReactionSpec[] = [];
  for (const r of file.biology.reactions) {
    const sources = r.participants.filter((p) => p.main && p.coefficient < 0 && slotIds.has(p.metabolite)).map((p) => p.metabolite);
    const targets = r.participants.filter((p) => p.main && p.coefficient > 0 && slotIds.has(p.metabolite)).map((p) => p.metabolite);
    if (!sources.length || !targets.length) continue;
    // variants (same step, other cofactor) add their EC numbers and BiGG IDs as matching preferences
    const hints = [...new Set([...(r.identifiers['bigg.reaction'] ?? []), ...(r.hints ?? []), ...(r.variants ?? []).flatMap((v) => v.identifiers['bigg.reaction'] ?? [])])];
    const ec = [...new Set([...r.ec, ...(r.variants ?? []).flatMap((v) => v.ec)])];
    reactions.push({
      id: r.id, sources, targets, name: r.name, level: r.level,
      ...(ec.length ? { ec } : {}), ...(hints.length ? { hints } : {}), ...(r.aliases?.length ? { aliases: r.aliases } : {}),
    });
  }

  // compact layout for previews and legacy consumers (first instance of each slot)
  const nodes: PathwayTemplateSpec['layout']['nodes'] = {};
  for (const n of file.layout.nodes) if (!n.attach && !nodes[n.metabolite]) nodes[n.metabolite] = { x: n.x, y: n.y, ...(n.label_pos ? { labelPos: n.label_pos } : {}) };
  const slotOfNode = new Map(file.layout.nodes.map((n) => [n.id, n.metabolite]));
  const layoutReactions: NonNullable<PathwayTemplateSpec['layout']['reactions']> = {};
  for (const lr of file.layout.reactions) layoutReactions[lr.reaction] = { routing: lr.routing, ...(lr.bend != null ? { bend: lr.bend } : {}) };

  const spec: PathwayTemplateSpec = {
    id: tid, name: file.metadata.name, version: file.metadata.template_version, author: file.metadata.authors.join(', ') || 'unknown',
    description: file.metadata.description, section: file.metadata.section ?? 'My templates', compartmentSummary: compartmentSummary(file),
    compartmentRules: rules,
    biology: {
      slots, reactions,
      connectors: file.biology.connectors.filter((c) => slotIds.has(c.metabolite)).map((c) => ({ slot: c.metabolite, direction: c.direction, ...(c.target.template ? { to: c.target.template } : {}) })),
    },
    layout: {
      kind: file.metadata.layout_kind === 'free' || !file.metadata.layout_kind ? 'branched' : file.metadata.layout_kind,
      nodes, reactions: layoutReactions,
      groups: file.layout.groups.map((g) => ({ title: g.title, slots: [...new Set(g.nodes.map((n) => slotOfNode.get(n)).filter((x): x is string => !!x && slotIds.has(x)))] })),
    },
    entities, source: file,
  };
  cache.set(file, spec);
  return spec;
}
