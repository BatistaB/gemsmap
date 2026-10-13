/**
 * Compartment normalization. Every model compartment keeps its original ID and
 * name; a canonical compartment is attached next to it (never replacing it), so
 * "c", "c0", "cyto", "Cytoplasm" all read as CYTOSOL for template matching.
 */
import type { MetabolicModel } from '../../model/types';

export type CanonicalCompartment =
  | 'CYTOSOL' | 'MITOCHONDRION' | 'MITO_IMS' | 'EXTRACELLULAR' | 'PERIPLASM' | 'NUCLEUS' | 'PEROXISOME'
  | 'ER' | 'GOLGI' | 'VACUOLE' | 'LYSOSOME' | 'CHLOROPLAST' | 'THYLAKOID' | 'CELL_ENVELOPE' | 'BOUNDARY' | 'UNKNOWN';

/** Pseudo-compartment for rules: any intracellular compartment the model has. */
export type CompartmentTarget = CanonicalCompartment | 'INTRACELLULAR';

export const COMPARTMENT_LABEL: Record<CompartmentTarget, string> = {
  CYTOSOL: 'cytosol', MITOCHONDRION: 'mitochondrion', MITO_IMS: 'mitochondrial intermembrane space', EXTRACELLULAR: 'extracellular',
  PERIPLASM: 'periplasm', NUCLEUS: 'nucleus', PEROXISOME: 'peroxisome', ER: 'endoplasmic reticulum', GOLGI: 'Golgi', VACUOLE: 'vacuole',
  LYSOSOME: 'lysosome', CHLOROPLAST: 'chloroplast / plastid', THYLAKOID: 'thylakoid', CELL_ENVELOPE: 'cell envelope / membrane',
  BOUNDARY: 'boundary', UNKNOWN: 'unknown compartment', INTRACELLULAR: 'intracellular',
};

const OUTSIDE = new Set<CanonicalCompartment>(['EXTRACELLULAR', 'BOUNDARY', 'PERIPLASM']);
const EUKARYOTIC = new Set<CanonicalCompartment>(['MITOCHONDRION', 'MITO_IMS', 'NUCLEUS', 'PEROXISOME', 'ER', 'GOLGI', 'VACUOLE', 'LYSOSOME', 'CHLOROPLAST', 'THYLAKOID']);

export const isIntracellular = (c: CanonicalCompartment) => !OUTSIDE.has(c) && c !== 'UNKNOWN';

// Order matters: intermembrane before mitochondrion, thylakoid before chloroplast.
const BY_NAME: [RegExp, CanonicalCompartment][] = [
  [/intermembrane/, 'MITO_IMS'],
  [/mitochond|^mito\b|matrix/, 'MITOCHONDRION'],
  [/cyto(sol|plasm)|^cytosolic|^cyt$/, 'CYTOSOL'],
  [/extra.?cellular|^external|^extraorganism|^medium$|^environment/, 'EXTRACELLULAR'],
  [/periplasm/, 'PERIPLASM'],
  [/peroxisom|glyoxysom|microbod/, 'PEROXISOME'],
  [/endoplasmic|reticulum/, 'ER'],
  [/golgi/, 'GOLGI'],
  [/vacuol/, 'VACUOLE'],
  [/lysosom/, 'LYSOSOME'],
  [/nucle(us|ar|oplasm)/, 'NUCLEUS'],
  [/thylakoid/, 'THYLAKOID'],
  [/chloroplast|plastid|stroma/, 'CHLOROPLAST'],
  [/boundary/, 'BOUNDARY'],
  [/envelope|membrane/, 'CELL_ENVELOPE'],
];

const BY_ID: Record<string, CanonicalCompartment> = {
  c: 'CYTOSOL', cy: 'CYTOSOL', cyt: 'CYTOSOL', cyto: 'CYTOSOL', cytosol: 'CYTOSOL', cytoplasm: 'CYTOSOL',
  m: 'MITOCHONDRION', mi: 'MITOCHONDRION', mt: 'MITOCHONDRION', mito: 'MITOCHONDRION', mitochondria: 'MITOCHONDRION', mitochondrion: 'MITOCHONDRION',
  im: 'MITO_IMS',
  e: 'EXTRACELLULAR', ex: 'EXTRACELLULAR', ext: 'EXTRACELLULAR', extr: 'EXTRACELLULAR', extracellular: 'EXTRACELLULAR',
  x: 'PEROXISOME', px: 'PEROXISOME', per: 'PEROXISOME', r: 'ER', er: 'ER', g: 'GOLGI', n: 'NUCLEUS', v: 'VACUOLE', vac: 'VACUOLE', l: 'LYSOSOME',
  h: 'CHLOROPLAST', chl: 'CHLOROPLAST', u: 'THYLAKOID', b: 'BOUNDARY', boundary: 'BOUNDARY',
};

export interface CompartmentInfo {
  /** Original model compartment ID — never changed. */
  id: string;
  /** Original model name ('' when the model gives none). */
  name: string;
  canonical: CanonicalCompartment;
  /** How the canonical compartment was decided (shown in the UI). */
  source: 'name' | 'id' | 'context' | 'unknown';
}

export interface ModelContext {
  kind: 'eukaryote-like' | 'prokaryote-like' | 'single-compartment';
  present: Set<CanonicalCompartment>;
  summary: string;
}

/** Canonical compartment of one model compartment. `p` is periplasm in bacteria but peroxisome in many fungal/plant GEMs. */
export function classifyCompartment(id: string, name: string, eukaryoticHint: boolean): Omit<CompartmentInfo, 'id' | 'name'> {
  const nm = (name || '').toLowerCase().trim();
  for (const [re, c] of BY_NAME) if (nm && re.test(nm)) return { canonical: c, source: 'name' };
  const key = id.toLowerCase().replace(/^c_/, '').replace(/\d+$/, '');
  if (key === 'p') return { canonical: eukaryoticHint ? 'PEROXISOME' : 'PERIPLASM', source: 'context' };
  if (BY_ID[key]) return { canonical: BY_ID[key], source: 'id' };
  for (const [re, c] of BY_NAME) if (re.test(key)) return { canonical: c, source: 'id' };
  return { canonical: 'UNKNOWN', source: 'unknown' };
}

/** Registry of all compartments used by a model (from the compartment dictionary and the metabolites). */
export function buildCompartmentRegistry(model: MetabolicModel): Map<string, CompartmentInfo> {
  const ids = new Set(Object.keys(model.compartments));
  for (const m of Object.values(model.metabolites)) ids.add(m.compartment);
  const first = [...ids].map((id) => ({ id, name: model.compartments[id] ?? '', ...classifyCompartment(id, model.compartments[id] ?? '', false) }));
  const euk = first.some((c) => EUKARYOTIC.has(c.canonical));
  const reg = new Map<string, CompartmentInfo>();
  for (const c of first) reg.set(c.id, c.source === 'context' ? { ...c, ...classifyCompartment(c.id, c.name, euk) } : c);
  return reg;
}

/** Prokaryote-like vs eukaryote-like, inferred from the compartment structure only. */
export function modelContext(reg: Map<string, CompartmentInfo>, model: MetabolicModel): ModelContext {
  const used = new Set<string>();
  for (const m of Object.values(model.metabolites)) used.add(m.compartment);
  const present = new Set<CanonicalCompartment>();
  for (const [id, c] of reg) if (used.has(id)) present.add(c.canonical);
  const organelles = [...present].filter((c) => EUKARYOTIC.has(c));
  const intra = [...present].filter(isIntracellular);
  if (organelles.length) {
    return { kind: 'eukaryote-like', present, summary: `Eukaryote-like compartments: ${organelles.map((c) => COMPARTMENT_LABEL[c]).join(', ')}` };
  }
  if (intra.length <= 1) {
    return { kind: present.has('PERIPLASM') ? 'prokaryote-like' : 'single-compartment', present, summary: present.has('PERIPLASM') ? 'Prokaryote-like (cytoplasm + periplasm)' : 'One intracellular compartment (prokaryote-like or compartment-free model)' };
  }
  return { kind: 'prokaryote-like', present, summary: 'No organelles detected (prokaryote-like)' };
}

/** A template's compartment expectation: a preference, with fallbacks for models without that compartment. */
export interface CompartmentRule {
  preferred: CompartmentTarget[];
  fallback?: CompartmentTarget[];
  /** Shown when the fallback is used, e.g. "TCA is mitochondrial in eukaryotes". */
  note?: string;
}

export interface ResolvedCompartment {
  /** Canonical compartment expected for this slot in this model (null: no usable intracellular compartment). */
  expected: CanonicalCompartment | null;
  usedFallback: boolean;
  message?: string;
}

/** Pick the expected compartment for a rule in a given model. */
export function resolveRule(rule: CompartmentRule, ctx: ModelContext): ResolvedCompartment {
  const pick = (t: CompartmentTarget): CanonicalCompartment | null => {
    if (t === 'INTRACELLULAR') return ctx.present.has('CYTOSOL') ? 'CYTOSOL' : ([...ctx.present].find(isIntracellular) ?? null);
    return ctx.present.has(t) ? t : null;
  };
  for (const t of rule.preferred) { const c = pick(t); if (c) return { expected: c, usedFallback: false }; }
  const want = rule.preferred.map((t) => COMPARTMENT_LABEL[t]).join(' / ');
  for (const t of rule.fallback ?? []) {
    const c = pick(t);
    if (c) return { expected: c, usedFallback: true, message: `Expected ${want}; no such compartment in this model — searching the ${COMPARTMENT_LABEL[c]}.` };
  }
  return { expected: null, usedFallback: true, message: `Expected ${want}; no compatible compartment found in this model.` };
}
