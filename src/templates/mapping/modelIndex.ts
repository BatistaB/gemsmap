/**
 * Per-model index for template mapping (built once per model object, cached):
 * normalized compartments, cross-references, name keys, and a reaction
 * adjacency that ignores currency metabolites and pure transport steps.
 */
import { isCurrency } from '../../model/currency';
import { metaboliteIndex } from '../../model/graph';
import type { ID, MetabolicModel, Reaction } from '../../model/types';
import { buildCompartmentRegistry, modelContext, type CanonicalCompartment, type CompartmentInfo, type ModelContext } from './compartments';
import { idPatternXrefs, looseIdKey, normalizeAnnotation } from './identifiers';
import { compactKey, relaxedKey } from './names';

export interface IndexedMetabolite {
  id: ID;
  name: string;
  formula?: string;
  compartment: string;
  canonical: CanonicalCompartment;
  /** Cross-references from the model's own annotation. */
  xrefs: Set<string>;
  /** Cross-references implied by the ID string only (weaker). */
  idXrefs: string[];
  biggBase: string | null;
  compact: string;
  relaxed: string;
}

export interface ModelIndex {
  model: MetabolicModel;
  fingerprint: string;
  compartments: Map<string, CompartmentInfo>;
  context: ModelContext;
  mets: Map<ID, IndexedMetabolite>;
  byXref: Map<string, ID[]>;
  byIdXref: Map<string, ID[]>;
  byBigg: Map<string, ID[]>;
  byBiggLoose: Map<string, ID[]>;
  byCompact: Map<string, ID[]>;
  byRelaxed: Map<string, ID[]>;
  /** Non-currency partners on the opposite side of a chemical (non-transport) reaction, with that reaction's ID. */
  neighbours(id: ID): Map<ID, ID>;
  isTransport(rid: ID): boolean;
  isCurrency(id: ID): boolean;
}

const cache = new WeakMap<MetabolicModel, ModelIndex>();

/**
 * Canonical currency set (ATP, ADP, AMP, H2O, H+, Pi, PPi, NAD(P)(H), CO2, O2, CoA, NH3) in the KEGG and
 * ModelSEED namespaces, on top of the BiGG/name rules of model/currency. They are down-weighted for
 * topology matching only; nothing is removed from the model.
 */
const CURRENCY_XREFS = new Set([
  ...['C00001', 'C00002', 'C00003', 'C00004', 'C00005', 'C00006', 'C00007', 'C00008', 'C00009', 'C00010', 'C00011', 'C00013', 'C00014', 'C00020', 'C00080'].map((k) => `kegg.compound:${k}`),
  ...['cpd00001', 'cpd00002', 'cpd00003', 'cpd00004', 'cpd00005', 'cpd00006', 'cpd00007', 'cpd00008', 'cpd00009', 'cpd00010', 'cpd00011', 'cpd00012', 'cpd00013', 'cpd00018', 'cpd00067'].map((k) => `seed.compound:${k}`),
]);
const CURRENCY_NAME = /^(coa|coenzyme-?a|h\+?|proton|ammonia|nh3|pyrophosphate|diphosphate)$/i;

const push = (m: Map<string, ID[]>, k: string | null | undefined, id: ID) => {
  if (!k) return;
  const l = m.get(k);
  if (l) { if (!l.includes(id)) l.push(id); } else m.set(k, [id]);
};

export function indexModel(model: MetabolicModel): ModelIndex {
  const hit = cache.get(model);
  if (hit) return hit;
  const compartments = buildCompartmentRegistry(model);
  const context = modelContext(compartments, model);
  const mets = new Map<ID, IndexedMetabolite>();
  const byXref = new Map<string, ID[]>(), byIdXref = new Map<string, ID[]>(), byBigg = new Map<string, ID[]>(), byBiggLoose = new Map<string, ID[]>();
  const byCompact = new Map<string, ID[]>(), byRelaxed = new Map<string, ID[]>();
  for (const m of Object.values(model.metabolites)) {
    const xrefs = normalizeAnnotation(m.annotation as Record<string, unknown> | undefined);
    const { xrefs: idXrefs, biggBase } = idPatternXrefs(m.id, m.compartment);
    const im: IndexedMetabolite = {
      id: m.id, name: m.name, formula: m.formula, compartment: m.compartment,
      canonical: compartments.get(m.compartment)?.canonical ?? 'UNKNOWN',
      xrefs, idXrefs, biggBase, compact: compactKey(m.name), relaxed: relaxedKey(m.name),
    };
    mets.set(m.id, im);
    for (const x of xrefs) push(byXref, x, m.id);
    for (const x of idXrefs) push(byIdXref, x, m.id);
    if (biggBase) { push(byBigg, biggBase, m.id); push(byBiggLoose, looseIdKey(biggBase), m.id); }
    push(byCompact, im.compact, m.id);
    push(byRelaxed, im.relaxed, m.id);
  }

  const currency = (id: ID) => {
    const m = model.metabolites[id];
    if (!m) return false;
    if (isCurrency(m) || CURRENCY_NAME.test(m.name.trim())) return true;
    const im = mets.get(id);
    return !!im && [...im.idXrefs, ...im.xrefs].some((x) => CURRENCY_XREFS.has(x));
  };

  // a reaction is "transport" when it moves the same chemicals between compartments
  const chemKey = (id: ID) => mets.get(id)?.relaxed || id;
  const transport = new Map<ID, boolean>();
  const isTransport = (rid: ID): boolean => {
    let t = transport.get(rid);
    if (t !== undefined) return t;
    const r: Reaction | undefined = model.reactions[rid];
    t = false;
    if (r) {
      const comps = new Set(Object.keys(r.stoichiometry).map((id) => model.metabolites[id]?.compartment));
      if (comps.size > 1) {
        const side = (sign: number) => new Set(Object.entries(r.stoichiometry).filter(([id, c]) => c * sign > 0 && !currency(id)).map(([id]) => chemKey(id)));
        const a = side(-1), b = side(1);
        t = a.size > 0 && a.size === b.size && [...a].every((k) => b.has(k));
      }
    }
    transport.set(rid, t);
    return t;
  };

  const adj = new Map<ID, Map<ID, ID>>();
  const rxIndex = metaboliteIndex(model);
  const neighbours = (id: ID): Map<ID, ID> => {
    let n = adj.get(id);
    if (n) return n;
    n = new Map();
    for (const rid of rxIndex.get(id) ?? []) {
      if (isTransport(rid)) continue;
      const r = model.reactions[rid];
      const c = r.stoichiometry[id];
      for (const [o, co] of Object.entries(r.stoichiometry)) {
        if (o === id || Math.sign(co) === Math.sign(c) || currency(o)) continue;
        if (!n.has(o)) n.set(o, rid);
      }
    }
    adj.set(id, n);
    return n;
  };

  const idx: ModelIndex = {
    model, fingerprint: modelFingerprint(model), compartments, context, mets,
    byXref, byIdXref, byBigg, byBiggLoose, byCompact, byRelaxed, neighbours, isTransport, isCurrency: currency,
  };
  cache.set(model, idx);
  return idx;
}

// ------------------------------------------------------------ fingerprint

/** 53-bit FNV-style string hash (cyrb53), hex. */
function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const fpCache = new WeakMap<MetabolicModel, string>();

/**
 * Structural fingerprint of a model: metabolite IDs + compartments and reaction
 * IDs + stoichiometry (names, bounds and annotations do not count). A saved
 * mapping profile is reused as-is only for the same fingerprint.
 */
export function modelFingerprint(model: MetabolicModel): string {
  const hit = fpCache.get(model);
  if (hit) return hit;
  const mets = Object.values(model.metabolites).map((m) => `${m.id}@${m.compartment}`).sort().join('|');
  const rxns = Object.values(model.reactions)
    .filter((r) => !r.meta?.virtual)
    .map((r) => `${r.id}:${Object.entries(r.stoichiometry).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}*${+v.toFixed(6)}`).join(',')}`)
    .sort()
    .join('|');
  const fp = hash53(mets + '#' + rxns);
  fpCache.set(model, fp);
  return fp;
}
