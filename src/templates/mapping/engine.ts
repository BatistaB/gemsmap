/**
 * Template mapping engine: finds, for every slot of a pathway template, the
 * model metabolite that most plausibly plays that role — deterministically and
 * with an inspectable list of evidence for every candidate.
 *
 *   1. index the model (compartments, cross-references, names)      modelIndex.ts
 *   2. generate candidates per canonical entity (IDs, names, related forms)
 *   3. score chemical identity        noisy-OR of independent channels, minus conflicts
 *   4. score compartment compatibility (rule → expected compartment for THIS model)
 *   5. score reaction neighbourhood   is the candidate linked to candidates of the
 *                                     template neighbours by a chemical reaction?
 *   6. assign jointly                 one model metabolite never fills two slots;
 *                                     topology is re-scored against the chosen neighbours
 *   7. classify                       auto_high / provisional / ambiguous / unresolved
 *
 * Scores are ranking heuristics in 0–1, not probabilities; the UI shows the
 * High / Medium / Low class and the evidence, the number only in details.
 * When two candidates cannot be told apart, the slot stays unresolved: an
 * unresolved slot is better than a wrong one.
 */
import { findConnecting } from '../../model/graph';
import type { ID, MetabolicModel } from '../../model/types';
import type { PathwayTemplateSpec, ReactionSpec, SlotSpec } from '../spec';
import { COMPARTMENT_LABEL, isIntracellular, resolveRule, type ModelContext, type ResolvedCompartment } from './compartments';
import { NS_LABEL, looseIdKey, normalizeXref, type Namespace } from './identifiers';
import { entityOf, type CanonicalMetabolite } from './library';
import { indexModel, type IndexedMetabolite, type ModelIndex } from './modelIndex';
import { compactKey, compareFormula, relaxedKey, stereoConflict } from './names';
import type { ModelMappingProfile } from './profile';
import { profileKey } from './profile';

export const ENGINE_VERSION = '1.0.0';

/**
 * confirmed   — chosen by the user (this session or the model's mapping profile)
 * auto_high   — mapped automatically, high confidence
 * provisional — mapped to the clear best candidate, but only medium confidence: flagged for review
 * ambiguous   — several candidates are equally plausible: NOT mapped, the user must choose
 * unresolved  — no adequate candidate: NOT mapped (placeholder)
 * absent      — the user stated the entity is not in this model
 */
export type MappingStatus = 'confirmed' | 'auto_high' | 'provisional' | 'ambiguous' | 'unresolved' | 'absent';
export type Confidence = 'high' | 'medium' | 'low';
export type Channel = 'annotation' | 'id' | 'related' | 'name' | 'formula' | 'stereo' | 'compartment' | 'topology' | 'user' | 'uniqueness';
export type Method = 'model annotation' | 'ID pattern' | 'related form' | 'name' | 'user choice' | 'saved profile';

export interface Evidence {
  channel: Channel;
  /** true = supports, false = argues against, null = neutral note */
  ok: boolean | null;
  text: string;
}

export interface Candidate {
  metId: ID;
  name: string;
  compartment: string;
  compartmentLabel: string;
  identity: number;
  compartmentFactor: number;
  topologyFactor: number;
  /** Ranking score 0–1 (heuristic, not a probability). */
  score: number;
  confidence: Confidence;
  method: Method;
  evidence: Evidence[];
  /** One-line reason, e.g. "ID + formula match · pathway-linked". */
  summary: string;
  /** Canonical entity actually matched (the slot entity or one of its alternatives). */
  entity: string;
  /** Slot that already uses this metabolite (excluded from this slot's decision). */
  usedBy?: string;
}

export interface SlotResult {
  slot: SlotSpec;
  entity: CanonicalMetabolite;
  expected: ResolvedCompartment;
  status: MappingStatus;
  chosen?: Candidate;
  /** Ranked candidates (best first, at most 8). */
  candidates: Candidate[];
  /** Why the slot got its status. */
  reason: string;
  /** Profile entry that could not be reused (metabolite gone from the model). */
  staleProfile?: string;
}

export interface ReactionResult {
  spec: ReactionSpec;
  /** Model reactions drawn by this template arrow (lumped series when > 1). */
  reactionIds: ID[];
  mapped: boolean;
}

export interface TemplateMapping {
  templateId: string;
  templateVersion: string;
  engineVersion: string;
  model: { id: string; name: string; fingerprint: string };
  context: ModelContext;
  notes: string[];
  slots: SlotResult[];
  reactions: ReactionResult[];
  coverage: { core: number; coreMapped: number; all: number; allMapped: number; coreReactions: number; coreReactionsMapped: number };
  /** Confidence of what was mapped — independent of coverage. */
  quality: Confidence;
}

export interface MapOptions {
  profile?: ModelMappingProfile | null;
  /** Choices made in the current review session: slot → metabolite ID, or null for "absent from this model". */
  overrides?: Record<string, ID | null>;
}

export const HIGH = 0.8;
export const MEDIUM = 0.55;
/** Two candidates closer than this cannot be distinguished reliably. */
const TIE = 0.08;

export const confidenceOf = (s: number): Confidence => (s >= HIGH ? 'high' : s >= MEDIUM ? 'medium' : 'low');
export const isMapped = (s: MappingStatus) => s === 'confirmed' || s === 'auto_high' || s === 'provisional';

const noisyOr = (ws: number[]) => 1 - ws.reduce((p, w) => p * (1 - w), 1);
const r2 = (x: number) => Math.round(x * 100) / 100;

// ------------------------------------------------------------ entity keys

interface EntityKeys {
  exact: Set<string>;
  related: Map<string, string>; // xref -> note
  bigg: Set<string>;
  biggRelated: Map<string, string>;
  biggLoose: Set<string>;
  names: Set<string>; // compact keys
  relaxed: Set<string>;
  relatedNames: Map<string, string>; // compact -> note
}
// per entity object: user templates may define their own entities, possibly reusing an id
const keyCache = new WeakMap<CanonicalMetabolite, EntityKeys>();

function entityKeys(e: CanonicalMetabolite): EntityKeys {
  const hit = keyCache.get(e);
  if (hit) return hit;
  // same normalization as the model side (CHEBI:17634 = 17634, hmdb padding, case)
  const flat = (t: Partial<Record<Namespace, string[]>>) =>
    Object.entries(t).flatMap(([ns, ids]) => (ns === 'bigg.metabolite' ? [] : (ids ?? []).map((id) => normalizeXref(ns as Namespace, id) ?? `${ns}:${id}`)));
  const k: EntityKeys = {
    exact: new Set(flat(e.xrefs)), related: new Map(), bigg: new Set(e.xrefs['bigg.metabolite'] ?? []), biggRelated: new Map(),
    biggLoose: new Set((e.xrefs['bigg.metabolite'] ?? []).map(looseIdKey)),
    names: new Set([e.name, ...e.synonyms].map(compactKey)), relaxed: new Set([e.name, ...e.synonyms].map(relaxedKey)), relatedNames: new Map(),
  };
  for (const r of e.related ?? []) {
    for (const x of flat(r.xrefs)) k.related.set(x, r.note);
    for (const b of r.xrefs['bigg.metabolite'] ?? []) k.biggRelated.set(b, r.note);
    for (const n of r.names) k.relatedNames.set(compactKey(n), r.note);
  }
  keyCache.set(e, k);
  return k;
}

const xrefLabel = (x: string) => {
  const i = x.indexOf(':');
  return `${NS_LABEL[x.slice(0, i) as Namespace] ?? x.slice(0, i)} ${x.slice(i + 1)}`;
};

/** Model metabolites that could be this entity (any identity channel). */
function generate(ix: ModelIndex, e: CanonicalMetabolite): Set<ID> {
  const k = entityKeys(e);
  const out = new Set<ID>();
  const add = (ids?: ID[]) => ids?.forEach((id) => out.add(id));
  for (const x of [...k.exact, ...k.related.keys()]) { add(ix.byXref.get(x)); add(ix.byIdXref.get(x)); }
  for (const b of [...k.bigg, ...k.biggRelated.keys()]) add(ix.byBigg.get(b));
  for (const b of k.biggLoose) add(ix.byBiggLoose.get(b));
  for (const n of [...k.names, ...k.relatedNames.keys()]) add(ix.byCompact.get(n));
  for (const n of k.relaxed) add(ix.byRelaxed.get(n));
  return out;
}

// ------------------------------------------------------------ scoring

interface Identity { identity: number; evidence: Evidence[]; method: Method; parts: string[] }

/** Chemical identity of a model metabolite vs a canonical entity (compartment-free). */
export function scoreIdentity(im: IndexedMetabolite, e: CanonicalMetabolite): Identity {
  const k = entityKeys(e);
  const ev: Evidence[] = [];
  const ws: number[] = [];
  const parts: string[] = [];
  let method: Method | null = null;

  const annExact = [...im.xrefs].filter((x) => k.exact.has(x));
  const annRelated = [...im.xrefs].filter((x) => k.related.has(x));
  const idExact = im.idXrefs.filter((x) => k.exact.has(x));
  const idRelated = im.idXrefs.filter((x) => k.related.has(x));
  const biggExact = !!im.biggBase && k.bigg.has(im.biggBase);
  const biggRelated = im.biggBase ? k.biggRelated.get(im.biggBase) : undefined;
  const biggLoose = !biggExact && !biggRelated && !!im.biggBase && k.biggLoose.has(looseIdKey(im.biggBase));

  if (annExact.length) {
    const nss = new Set(annExact.map((x) => x.slice(0, x.indexOf(':'))));
    ws.push(Math.min(0.92, 0.85 + 0.035 * (nss.size - 1)));
    ev.push({ channel: 'annotation', ok: true, text: `${annExact.slice(0, 3).map(xrefLabel).join(', ')} in the model annotation` });
    method = 'model annotation'; parts.push('ID');
  } else if (idExact.length || biggExact) {
    ws.push(0.7);
    ev.push({ channel: 'id', ok: true, text: idExact.length ? `ID ${im.id} encodes ${idExact.map(xrefLabel).join(', ')}` : `ID ${im.id} is the BiGG identifier ${im.biggBase}` });
    method = 'ID pattern'; parts.push('ID');
  }
  if (!annExact.length && !idExact.length && !biggExact) {
    const rel = annRelated[0] ?? idRelated[0];
    if (rel || biggRelated) {
      ws.push(annRelated.length ? 0.6 : 0.5);
      const note = rel ? k.related.get(rel)! : biggRelated!;
      ev.push({ channel: 'related', ok: true, text: `${rel ? xrefLabel(rel) : `BiGG ${im.biggBase}`} — ${note} (related form, not the exact identity)` });
      method = 'related form'; parts.push('related-form ID');
    } else if (biggLoose) {
      ws.push(0.45);
      ev.push({ channel: 'id', ok: true, text: `ID ${im.id} resembles BiGG ${[...k.bigg][0]} (string similarity only)` });
      method = 'ID pattern'; parts.push('ID-like');
    }
  }

  const nameExact = k.names.has(im.compact);
  const nameRelated = !nameExact && (k.relaxed.has(im.relaxed) || k.relatedNames.has(im.compact));
  if (nameExact) {
    ws.push(0.6);
    ev.push({ channel: 'name', ok: true, text: `Name “${im.name}” matches ${e.name}` });
    method ??= 'name'; parts.push('name');
  } else if (nameRelated) {
    ws.push(0.4);
    ev.push({ channel: 'name', ok: true, text: `Name “${im.name}” matches ${e.name} up to anomeric/ring form` });
    method ??= 'related form'; parts.push('related name');
  }

  if (!ws.length) return { identity: 0, evidence: ev, method: 'name', parts };

  const f = compareFormula(im.formula, e.formula);
  let identity = noisyOr(ws);
  if (f === 'match') {
    identity = noisyOr([identity, 0.25]);
    ev.push({ channel: 'formula', ok: true, text: `Formula ${im.formula} consistent with ${e.formula} (H not compared)` });
    parts.push('formula');
  } else if (f === 'conflict') {
    identity *= 0.35;
    ev.push({ channel: 'formula', ok: false, text: `Formula ${im.formula} differs from ${e.formula}` });
  } else {
    ev.push({ channel: 'formula', ok: null, text: im.formula ? `Formula ${im.formula} not comparable` : 'No formula in the model' });
  }

  if (!nameExact && stereoConflict(im.name, e.name)) {
    identity *= 0.3;
    ev.push({ channel: 'stereo', ok: false, text: `Stereochemistry of “${im.name}” contradicts ${e.name}` });
  }

  // annotated, but with a different compound of a namespace the entity also covers
  if (!annExact.length && !annRelated.length && im.xrefs.size) {
    const shared = [...im.xrefs].filter((x) => {
      const ns = x.slice(0, x.indexOf(':'));
      return [...k.exact].some((y) => y.startsWith(ns + ':'));
    });
    if (shared.length) {
      identity *= 0.6;
      ev.push({ channel: 'annotation', ok: false, text: `Annotated as ${shared.slice(0, 2).map(xrefLabel).join(', ')}, not ${e.name}` });
    }
  }
  return { identity: Math.min(0.99, identity), evidence: ev, method: method ?? 'name', parts };
}

function scoreCompartment(ix: ModelIndex, im: IndexedMetabolite, exp: ResolvedCompartment): { factor: number; ev: Evidence } {
  const info = ix.compartments.get(im.compartment);
  const orig = `${im.compartment}${info?.name && info.name !== im.compartment ? ` “${info.name}”` : ''}`;
  const label = COMPARTMENT_LABEL[im.canonical];
  if (!exp.expected) {
    const f = isIntracellular(im.canonical) ? 0.8 : 0.4;
    return { factor: f, ev: { channel: 'compartment', ok: null, text: `${label} (${orig}); no expected compartment in this model` } };
  }
  if (im.canonical === exp.expected) {
    return exp.usedFallback
      ? { factor: 0.97, ev: { channel: 'compartment', ok: true, text: `${label} (${orig}) — fallback compartment for this model` } }
      : { factor: 1, ev: { channel: 'compartment', ok: true, text: `${label} (${orig}) as expected` } };
  }
  const want = COMPARTMENT_LABEL[exp.expected];
  if (im.canonical === 'UNKNOWN') return { factor: 0.8, ev: { channel: 'compartment', ok: null, text: `Compartment ${orig} not recognised; expected ${want}` } };
  if (isIntracellular(im.canonical)) return { factor: 0.65, ev: { channel: 'compartment', ok: false, text: `${label} (${orig}) — expected ${want}` } };
  return { factor: 0.35, ev: { channel: 'compartment', ok: false, text: `${label} (${orig}) — expected ${want}; outside the cell is transport, not pathway chemistry` } };
}

interface Link { strength: number; text: string }

function linkTo(ix: ModelIndex, id: ID, pool: Set<ID>): Link | null {
  const n1 = ix.neighbours(id);
  for (const [d, rid] of n1) if (pool.has(d)) return { strength: 1, text: `${d} via ${rid}` };
  for (const [i, rid1] of n1) {
    const n2 = ix.neighbours(i);
    if (n2.size > 40) continue; // hubs give meaningless two-step links
    for (const [d, rid2] of n2) if (d !== id && pool.has(d)) return { strength: 0.6, text: `${d} in two steps (${rid1} → ${i} → ${rid2})` };
  }
  return null;
}

// ------------------------------------------------------------ main

interface Work {
  slot: SlotSpec;
  entity: CanonicalMetabolite;
  expected: ResolvedCompartment;
  base: (Omit<Candidate, 'topologyFactor' | 'score' | 'confidence' | 'summary'> & { parts: string[] })[];
  ranked: Candidate[];
  forced?: { metId: ID | null; method: Method };
  staleProfile?: string;
}

/** Map a pathway template onto a model. Pure function: nothing is stored. */
export function mapTemplate(spec: PathwayTemplateSpec, model: MetabolicModel, opts: MapOptions = {}): TemplateMapping {
  const ix = indexModel(model);
  const notes = new Set<string>();
  const neighbours = templateNeighbours(spec);

  // ---- candidates with identity + compartment
  const work: Work[] = spec.biology.slots.map((slot) => {
    const entity = entityOf(spec, slot.entity);
    if (!entity) throw new Error(`Template ${spec.id}: unknown entity ${slot.entity}`);
    const rule = spec.compartmentRules[slot.rule ?? 'default'] ?? spec.compartmentRules.default;
    const expected = resolveRule(rule, ix.context);
    if (expected.message) notes.add(rule.note ? `${rule.note} ${expected.message}` : expected.message);
    const w: Work = { slot, entity, expected, base: [], ranked: [] };
    const seen = new Set<ID>();
    const entities = [entity, ...(slot.alternatives ?? []).map((a) => entityOf(spec, a)).filter((x): x is CanonicalMetabolite => !!x)];
    for (const ent of entities) {
      for (const id of generate(ix, ent)) {
        if (seen.has(id)) continue;
        const im = ix.mets.get(id)!;
        const idt = scoreIdentity(im, ent);
        if (idt.identity < 0.3) continue;
        seen.add(id);
        const alt = ent !== entity;
        const comp = scoreCompartment(ix, im, expected);
        w.base.push({
          metId: id, name: im.name, compartment: im.compartment, compartmentLabel: COMPARTMENT_LABEL[im.canonical],
          identity: idt.identity * (alt ? 0.85 : 1), compartmentFactor: comp.factor, method: idt.method, parts: idt.parts, entity: ent.id,
          evidence: [...(alt ? [{ channel: 'name' as const, ok: null, text: `Alternative entity for this slot: ${ent.name}` }] : []), ...idt.evidence, comp.ev],
        });
      }
    }
    // user choices: session override first, then the model's mapping profile
    const ov = opts.overrides && slot.slot in opts.overrides ? opts.overrides[slot.slot] : undefined;
    if (ov !== undefined) w.forced = { metId: ov, method: 'user choice' };
    else {
      const pe = opts.profile?.entries[profileKey(entity.id, expected.expected)];
      if (pe) {
        if (pe.metaboliteId === null || model.metabolites[pe.metaboliteId]) w.forced = { metId: pe.metaboliteId, method: 'saved profile' };
        else w.staleProfile = `Saved mapping ${pe.metaboliteId} is no longer in this model`;
      }
    }
    if (w.forced?.metId && !seen.has(w.forced.metId)) {
      const im = ix.mets.get(w.forced.metId);
      if (im) {
        const idt = scoreIdentity(im, entity);
        const comp = scoreCompartment(ix, im, expected);
        w.base.push({ metId: im.id, name: im.name, compartment: im.compartment, compartmentLabel: COMPARTMENT_LABEL[im.canonical], identity: idt.identity, compartmentFactor: comp.factor, method: idt.method, parts: idt.parts, entity: entity.id, evidence: [...idt.evidence, comp.ev] });
      }
    }
    return w;
  });
  const bySlot = new Map(work.map((w) => [w.slot.slot, w]));

  // ---- pass 1: topology against candidate pools of the neighbours; pass 2: against the chosen neighbours
  let decided = new Map<string, { status: MappingStatus; chosen?: Candidate; reason: string }>();
  for (let pass = 0; pass < 2; pass++) {
    const pools = new Map<string, Set<ID>>();
    for (const w of work) {
      const d = decided.get(w.slot.slot);
      if (pass === 1 && d?.chosen) pools.set(w.slot.slot, new Set([d.chosen.metId]));
      else pools.set(w.slot.slot, new Set([...w.base].sort((a, b) => b.identity * b.compartmentFactor - a.identity * a.compartmentFactor).filter((c) => c.identity * c.compartmentFactor >= 0.4).slice(0, 6).map((c) => c.metId)));
    }
    for (const w of work) {
      const nbs = (neighbours.get(w.slot.slot) ?? []).filter((n) => (pools.get(n.slot)?.size ?? 0) > 0);
      w.ranked = w.base.map((b) => {
        const ev = [...b.evidence];
        let tf = 1;
        if (nbs.length) {
          let sum = 0;
          for (const n of nbs) {
            const l = linkTo(ix, b.metId, pools.get(n.slot)!);
            const nb = bySlot.get(n.slot)!.entity.name;
            sum += l?.strength ?? 0;
            ev.push(l ? { channel: 'topology', ok: true, text: `Linked to ${nb}: ${l.text}${l.strength === 1 ? ` (template step ${n.step})` : ''}` }
              : { channel: 'topology', ok: false, text: `No reaction to any ${nb} candidate (template step ${n.step})` });
          }
          tf = 0.7 + 0.35 * (sum / nbs.length);
        } else if (!ix.neighbours(b.metId).size) {
          tf = 0.75;
          ev.push({ channel: 'topology', ok: false, text: 'Not converted by any chemical reaction in the model' });
        }
        const score = r2(Math.min(0.99, b.identity * b.compartmentFactor * tf));
        const parts = [...b.parts];
        const summary = `${parts.length ? parts.join(' + ') + ' match' : 'Weak match'}${b.compartmentFactor < 0.9 ? ', compartment mismatch' : ''}${tf >= 1 ? ' · pathway-linked' : tf <= 0.75 && nbs.length ? ' · no pathway link' : ''}`;
        return { metId: b.metId, name: b.name, compartment: b.compartment, compartmentLabel: b.compartmentLabel, identity: r2(b.identity), compartmentFactor: b.compartmentFactor, topologyFactor: r2(tf), score, confidence: confidenceOf(score), method: b.method, evidence: ev, summary, entity: b.entity };
      }).sort((a, b) => b.score - a.score || a.metId.localeCompare(b.metId));
    }
    decided = assign(work);
  }

  const slots: SlotResult[] = work.map((w) => {
    const d = decided.get(w.slot.slot)!;
    return { slot: w.slot, entity: w.entity, expected: w.expected, status: d.status, chosen: d.chosen, candidates: w.ranked.slice(0, 8), reason: d.reason, staleProfile: w.staleProfile };
  });

  // pathway-level compartment check (e.g. TCA mapped in the cytosol although mitochondria exist)
  const byExpected = new Map<string, { off: number; total: number; where: Map<string, number> }>();
  for (const s of slots) {
    if (!s.chosen || !s.expected.expected) continue;
    const e = byExpected.get(s.expected.expected) ?? { off: 0, total: 0, where: new Map() };
    e.total++;
    const c = ix.mets.get(s.chosen.metId)!.canonical;
    if (c !== s.expected.expected) { e.off++; e.where.set(c, (e.where.get(c) ?? 0) + 1); }
    byExpected.set(s.expected.expected, e);
  }
  for (const [exp, e] of byExpected) {
    if (e.total >= 3 && e.off / e.total > 0.5) {
      const where = [...e.where.entries()].sort((a, b) => b[1] - a[1])[0][0] as keyof typeof COMPARTMENT_LABEL;
      notes.add(`Expected ${COMPARTMENT_LABEL[exp as keyof typeof COMPARTMENT_LABEL]}, but most mapped metabolites are in the ${COMPARTMENT_LABEL[where]} — check whether the model places this pathway there.`);
    }
  }

  // template reactions: bound when both ends are mapped and a model reaction (or short series) connects them
  const chosenOf = new Map(slots.filter((s) => s.chosen && isMapped(s.status)).map((s) => [s.slot.slot, s.chosen!.metId]));
  const reactions: ReactionResult[] = spec.biology.reactions.map((r) => {
    for (const a of r.sources) for (const b of r.targets) {
      const ma = chosenOf.get(a), mb = chosenOf.get(b);
      if (!ma || !mb) continue;
      const f = findConnecting(model, ma, mb, r.hints ?? [], { ec: r.ec });
      if (f.length) return { spec: r, reactionIds: f[0].reactionIds, mapped: true };
    }
    return { spec: r, reactionIds: [], mapped: false };
  });

  const core = slots.filter((s) => s.slot.level === 'required');
  const coreR = reactions.filter((r) => r.spec.level === 'required');
  const mappedCore = core.filter((s) => isMapped(s.status));
  const coverage = {
    core: core.length, coreMapped: mappedCore.length,
    all: slots.length, allMapped: slots.filter((s) => isMapped(s.status)).length,
    coreReactions: coreR.length, coreReactionsMapped: coreR.filter((r) => r.mapped).length,
  };
  const mapped = slots.filter((s) => isMapped(s.status));
  const quality: Confidence = !mapped.length ? 'low'
    : mapped.some((s) => s.status === 'provisional') || slots.some((s) => s.status === 'ambiguous') ? 'medium'
    : 'high';

  return {
    templateId: spec.id, templateVersion: spec.version, engineVersion: ENGINE_VERSION,
    model: { id: model.id, name: model.name, fingerprint: ix.fingerprint }, context: ix.context,
    notes: [...notes], slots, reactions, coverage, quality,
  };
}

/** Joint assignment: best slots first; a metabolite used by one slot is not available to another. */
function assign(work: Work[]): Map<string, { status: MappingStatus; chosen?: Candidate; reason: string }> {
  const out = new Map<string, { status: MappingStatus; chosen?: Candidate; reason: string }>();
  const used = new Map<ID, string>();
  // user choices are fixed first
  for (const w of work) {
    if (!w.forced) continue;
    if (w.forced.metId === null) { out.set(w.slot.slot, { status: 'absent', reason: `Marked as absent from this model (${w.forced.method})` }); continue; }
    const c = w.ranked.find((x) => x.metId === w.forced!.metId);
    if (!c) continue;
    const chosen = { ...c, method: w.forced.method, evidence: [{ channel: 'user' as const, ok: true, text: w.forced.method === 'user choice' ? 'Chosen by the user' : 'Confirmed earlier for this model (mapping profile)' }, ...c.evidence] };
    out.set(w.slot.slot, { status: 'confirmed', chosen, reason: w.forced.method === 'user choice' ? 'Chosen by the user' : 'Confirmed earlier for this model' });
    used.set(c.metId, w.slot.slot);
  }
  const order = work.filter((w) => !out.has(w.slot.slot)).sort((a, b) => (b.ranked[0]?.score ?? 0) - (a.ranked[0]?.score ?? 0));
  for (const w of order) {
    for (const c of w.ranked) {
      const u = used.get(c.metId);
      if (u) c.usedBy = u;
      else delete c.usedBy;
    }
    const avail = w.ranked.filter((c) => !c.usedBy);
    const b1 = avail[0];
    const b2 = avail.find((c) => c.metId !== b1?.metId);
    const name = w.entity.name;
    if (!b1) {
      out.set(w.slot.slot, { status: 'unresolved', reason: w.ranked.length ? `The only candidates are already used by other slots` : `No metabolite in the model looks like ${name}` });
      continue;
    }
    const tie = !!b2 && b1.score - b2.score < TIE && b2.score >= MEDIUM;
    if (tie) {
      out.set(w.slot.slot, { status: 'ambiguous', reason: `${b1.metId} and ${b2!.metId} are equally plausible for ${name} — please choose` });
      continue;
    }
    if (b1.score >= HIGH) {
      out.set(w.slot.slot, { status: 'auto_high', chosen: b1, reason: 'High confidence' });
      used.set(b1.metId, w.slot.slot);
    } else if (b1.score >= MEDIUM) {
      out.set(w.slot.slot, { status: 'provisional', chosen: b1, reason: 'Medium confidence — mapped provisionally, please review' });
      used.set(b1.metId, w.slot.slot);
    } else {
      const outside = w.expected.expected && isIntracellular(w.expected.expected) && b1.compartmentFactor <= 0.35;
      out.set(w.slot.slot, {
        status: 'unresolved',
        reason: outside ? `Only an extracellular ${name} was found (${b1.metId}); uptake/transport is not pathway chemistry, so the slot stays open`
          : `Best candidate ${b1.metId} has low confidence`,
      });
    }
  }
  return out;
}

/** For every slot: the slots on the other side of a template reaction, with the step name. */
function templateNeighbours(spec: PathwayTemplateSpec): Map<string, { slot: string; step: string }[]> {
  const m = new Map<string, { slot: string; step: string }[]>();
  const add = (a: string, b: string, step: string) => {
    const l = m.get(a) ?? [];
    if (!l.some((x) => x.slot === b)) l.push({ slot: b, step });
    m.set(a, l);
  };
  for (const r of spec.biology.reactions) for (const s of r.sources) for (const t of r.targets) { add(s, t, r.name); add(t, s, r.name); }
  return m;
}

// ------------------------------------------------------------ report

/** Reproducibility report with full provenance (exported as JSON). */
export function mappingReport(res: TemplateMapping, spec: PathwayTemplateSpec) {
  const methods: Record<string, number> = {};
  for (const s of res.slots) if (s.chosen && isMapped(s.status)) methods[s.chosen.method] = (methods[s.chosen.method] ?? 0) + 1;
  return {
    format: 'gemsmap-template-mapping-report',
    generated: new Date().toISOString(),
    template: { id: spec.id, name: spec.name, version: spec.version, author: spec.author },
    engine: { version: res.engineVersion, externalCrossReferences: 'none (offline: model annotation, built-in canonical library, names, topology)' },
    model: { ...res.model, context: res.context.summary },
    summary: {
      coreNodes: `${res.coverage.coreMapped}/${res.coverage.core}`,
      allNodes: `${res.coverage.allMapped}/${res.coverage.all}`,
      coreReactions: `${res.coverage.coreReactionsMapped}/${res.coverage.coreReactions}`,
      quality: res.quality,
      highConfidence: res.slots.filter((s) => s.status === 'auto_high').length,
      confirmed: res.slots.filter((s) => s.status === 'confirmed').length,
      provisional: res.slots.filter((s) => s.status === 'provisional').length,
      ambiguous: res.slots.filter((s) => s.status === 'ambiguous').length,
      unresolved: res.slots.filter((s) => s.status === 'unresolved').length,
      absent: res.slots.filter((s) => s.status === 'absent').length,
      methods,
    },
    notes: res.notes,
    slots: res.slots.map((s) => ({
      slot: s.slot.slot, entity: s.entity.id, entityName: s.entity.name, level: s.slot.level,
      expectedCompartment: s.expected.expected, compartmentFallback: s.expected.usedFallback,
      status: s.status, reason: s.reason,
      metaboliteId: s.chosen && isMapped(s.status) ? s.chosen.metId : null,
      confidence: s.chosen?.confidence ?? null, score: s.chosen?.score ?? null,
      method: s.chosen?.method ?? null, userConfirmed: s.status === 'confirmed',
      evidence: s.chosen?.evidence.map((e) => `${e.ok === true ? '+' : e.ok === false ? '-' : '~'} ${e.text}`) ?? [],
      candidates: s.candidates.slice(0, 5).map((c) => ({ id: c.metId, score: c.score, confidence: c.confidence, summary: c.summary })),
    })),
    reactions: res.reactions.map((r) => ({ id: r.spec.id, name: r.spec.name, level: r.spec.level, modelReactions: r.reactionIds, mapped: r.mapped })),
  };
}
