/**
 * Pure helpers of the structural editor: equation text ⇄ stoichiometry, formula balance, GPR syntax,
 * the model's own ID conventions (for suggestions) and boundary-reaction lookups. Instant feedback
 * only — the backend validates every edit again before it touches the model.
 */
import type { BoundaryKind, ExternalCompound } from './editTypes';
import type { Annotation, LabModel, ModelIndex } from './types';

// ------------------------------------------------------------------ equations

export type Arrow = 'fwd' | 'rev' | 'both';
export const arrowOf = (lb: number | null, ub: number | null): Arrow => {
  const lo = lb ?? -Infinity, hi = ub ?? Infinity;
  return lo < 0 && hi > 0 ? 'both' : hi <= 0 && lo < 0 ? 'rev' : 'fwd';
};
export const ARROW_TEXT: Record<Arrow, string> = { fwd: '-->', rev: '<--', both: '<=>' };
export const ARROW_GLYPH: Record<Arrow, string> = { fwd: '→', rev: '←', both: '⇌' };

const coefText = (c: number) => (Math.abs(c) === 1 ? '' : `${+Math.abs(c).toPrecision(10)} `);

export function formatEquation(st: Record<string, number>, arrow: Arrow, label: (id: string) => string = (x) => x): string {
  const side = (pos: boolean) => Object.entries(st).filter(([, c]) => (c > 0) === pos).map(([m, c]) => coefText(c) + label(m)).join(' + ');
  return `${side(false)} ${ARROW_TEXT[arrow]} ${side(true)}`.trim();
}

const ARROW_RE = /\s*(<=>|<->|<-->|-->|->|=>|<--|<-|<=)\s*/;

export interface ParsedEquation { stoich: Record<string, number>; arrow: Arrow | null; errors: string[]; warnings: string[] }

/** "glc__D_c + 2 atp_c -> g6p_c + adp_c" → {glc__D_c: -1, atp_c: -2, g6p_c: 1, adp_c: 1}. */
export function parseEquation(text: string): ParsedEquation {
  const out: ParsedEquation = { stoich: {}, arrow: null, errors: [], warnings: [] };
  const t = text.trim();
  if (!t) return out;
  const m = t.match(ARROW_RE);
  if (!m) { out.errors.push('No arrow: use -->, <=> or <--'); return out; }
  const a = m[1];
  out.arrow = a === '<=>' || a === '<->' ? 'both' : a.startsWith('<') ? 'rev' : 'fwd';
  const [left, right] = [t.slice(0, m.index!), t.slice(m.index! + m[0].length)];
  const side = (s: string, sign: number) => {
    for (const raw of s.split(/\s+\+\s+|^\+\s+|\s+\+$/)) {
      const term = raw.trim();
      if (!term) continue;
      const mm = term.match(/^(\d*\.?\d+(?:[eE][-+]?\d+)?)\s+(\S+)$/);
      const [coef, id] = mm ? [+mm[1], mm[2]] : [1, term];
      if (/\s/.test(id)) { out.errors.push(`“${term}” is not “coefficient metabolite_id”`); continue; }
      if (!(coef > 0) || !Number.isFinite(coef)) { out.errors.push(`Invalid coefficient in “${term}”`); continue; }
      if (out.stoich[id] != null) out.warnings.push(`${id} appears twice — the coefficients are combined`);
      out.stoich[id] = (out.stoich[id] ?? 0) + sign * coef;
      if (out.stoich[id] === 0) { delete out.stoich[id]; out.warnings.push(`${id} cancels out (same amount on both sides)`); }
    }
  };
  side(left, -1);
  side(right, 1);
  return out;
}

// ------------------------------------------------------------------ formula & balance

/** Element counts of a flat formula (C6H12O6; R groups count as R). null = cannot parse. */
export function parseFormula(f: string | null | undefined): Record<string, number> | null {
  const s = (f ?? '').trim();
  if (!s) return null;
  const out: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*\.?\d*)/g;
  let pos = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index !== pos || !m[0]) return null;
    out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? +m[2] : 1);
    pos = m.index + m[0].length;
  }
  return pos === s.length ? out : null;
}

export interface LocalBalance { mass: Record<string, number> | null; charge: number | null; missingFormula: string[]; missingCharge: string[] }

export function balanceOf(st: Record<string, number>, info: (id: string) => { formula?: string | null; charge?: number | null } | undefined): LocalBalance {
  const ids = Object.keys(st);
  const missingFormula = ids.filter((m) => !parseFormula(info(m)?.formula));
  const missingCharge = ids.filter((m) => info(m)?.charge == null);
  let mass: Record<string, number> | null = null, charge: number | null = null;
  if (ids.length && !missingFormula.length) {
    const acc: Record<string, number> = {};
    for (const [m, c] of Object.entries(st)) for (const [el, n] of Object.entries(parseFormula(info(m)!.formula)!)) acc[el] = (acc[el] ?? 0) + c * n;
    mass = Object.fromEntries(Object.entries(acc).filter(([, v]) => Math.abs(v) > 1e-6).map(([k, v]) => [k, +v.toFixed(6)]));
  }
  if (ids.length && !missingCharge.length) charge = +Object.entries(st).reduce((a, [m, c]) => a + c * (info(m)!.charge as number), 0).toFixed(6);
  return { mass, charge, missingFormula, missingCharge };
}

// ------------------------------------------------------------------ GPR

/** Syntax check of a gene rule (genes combined with and / or and parentheses); null when valid. */
export function gprError(rule: string): string | null {
  if (!rule.trim()) return null;
  const toks = (rule.match(/\(|\)|[^\s()]+/g) ?? []).map((t) => (/^(and|&)$/i.test(t) ? 'and' : /^(or|\|)$/i.test(t) ? 'or' : t));
  let pos = 0;
  const term = (): void => {
    const t = toks[pos];
    if (t == null) throw new Error('the rule ends where a gene or “(” was expected');
    if (t === '(') { pos++; expr(); if (toks[pos] !== ')') throw new Error('a “(” is not closed'); pos++; }
    else if (t === ')' || t === 'and' || t === 'or') throw new Error(`unexpected “${t}” where a gene was expected`);
    else pos++;
  };
  const expr = (): void => { term(); while (toks[pos] === 'and' || toks[pos] === 'or') { pos++; term(); } };
  try { expr(); if (pos !== toks.length) throw new Error(`unexpected “${toks[pos]}”`); } catch (e) { return (e as Error).message; }
  return null;
}

// ------------------------------------------------------------------ ID conventions of the loaded model

export interface IdStyle {
  /** glc__D_c (underscore), glc__D[c] (bracket) or no compartment suffix */
  suffix: 'underscore' | 'bracket' | 'none';
  prefix: string;
  /** which identifier namespace the base ids follow */
  ns: 'bigg' | 'seed' | 'kegg' | 'mnx' | 'other';
  example: string;
}

const styles = new WeakMap<LabModel, IdStyle>();

export function idStyle(model: LabModel): IdStyle {
  const hit = styles.get(model);
  if (hit) return hit;
  const mets = model.metabolites;
  let under = 0, bracket = 0, mpre = 0;
  const bases: string[] = [];
  for (const m of mets) {
    let id = m.id;
    if (id.startsWith('M_')) { mpre++; id = id.slice(2); }
    if (m.compartment && id.endsWith(`_${m.compartment}`)) { under++; bases.push(id.slice(0, -m.compartment.length - 1)); }
    else if (m.compartment && id.endsWith(`[${m.compartment}]`)) { bracket++; bases.push(id.slice(0, -m.compartment.length - 2)); }
    else bases.push(id);
  }
  const n = Math.max(1, mets.length);
  const share = (re: RegExp) => bases.filter((b) => re.test(b)).length / Math.max(1, bases.length);
  const ns: IdStyle['ns'] = share(/^cpd\d{5}$/) > 0.4 ? 'seed' : share(/^C\d{5}$/) > 0.4 ? 'kegg' : share(/^MNXM\d+$/i) > 0.4 ? 'mnx'
    : share(/^[a-z0-9]+(__?[A-Za-z0-9]+)*$/) > 0.5 ? 'bigg' : 'other';
  const s: IdStyle = {
    suffix: under / n > 0.5 ? 'underscore' : bracket / n > 0.5 ? 'bracket' : 'none',
    prefix: mpre / n > 0.6 ? 'M_' : '', ns, example: mets.find((m) => m.compartment)?.id ?? '',
  };
  styles.set(model, s);
  return s;
}

const slug = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'met';

/** Base id from a database compound in the model's namespace (bigg mal__L, seed cpd00130…), else from the name. */
export function baseIdFor(style: IdStyle, name: string, ids?: Record<string, string[]>): string {
  const first = (k: string) => ids?.[k]?.[0];
  const byNs = style.ns === 'seed' ? first('seed.compound') : style.ns === 'kegg' ? first('kegg.compound') : style.ns === 'mnx' ? first('metanetx.chemical')
    : style.ns === 'bigg' ? first('bigg.metabolite') : undefined;
  return byNs ?? (style.ns === 'bigg' || style.ns === 'other' ? first('bigg.metabolite') : undefined) ?? slug(name);
}

export function composeId(style: IdStyle, base: string, compartment: string): string {
  const c = compartment ? (style.suffix === 'underscore' ? `_${compartment}` : style.suffix === 'bracket' ? `[${compartment}]` : '') : '';
  return `${style.prefix}${base}${c}`;
}

export function uniqueId(id: string, taken: (x: string) => boolean): string {
  if (!taken(id)) return id;
  const m = id.match(/^(.*?)(_[A-Za-z0-9]{1,3}|\[[^\]]+\])?$/)!;
  for (let i = 2; i < 1000; i++) { const c = `${m[1]}_${i}${m[2] ?? ''}`; if (!taken(c)) return c; }
  return `${id}_${Date.now().toString(36)}`;
}

export function suggestMetaboliteId(model: LabModel, index: ModelIndex, name: string, compartment: string, ids?: Record<string, string[]>, extraTaken: string[] = []): string {
  const st = idStyle(model);
  return uniqueId(composeId(st, baseIdFor(st, name, ids), compartment), (x) => index.met.has(x) || extraTaken.includes(x));
}

// ------------------------------------------------------------------ boundary reactions

const PREFIXES: Record<BoundaryKind, string[]> = {
  exchange: ['EX_', 'R_EX_', 'Ex_', 'EXC_', 'ex_'],
  sink: ['SK_', 'R_SK_', 'SINK_', 'sink_', 'Sink_'],
  demand: ['DM_', 'R_DM_', 'DEMAND_', 'demand_'],
};
const DEFAULT_PREFIX: Record<BoundaryKind, string> = { exchange: 'EX_', sink: 'SK_', demand: 'DM_' };
export const SBO_OF: Record<BoundaryKind, string> = { exchange: 'SBO:0000627', demand: 'SBO:0000628', sink: 'SBO:0000632' };

export function boundaryPrefix(model: LabModel, kind: BoundaryKind): string {
  const ids = model.reactions.filter((r) => r.type === kind).map((r) => r.id);
  let best = DEFAULT_PREFIX[kind], n = 0;
  for (const p of PREFIXES[kind]) { const c = ids.filter((i) => i.startsWith(p)).length; if (c > n) { n = c; best = p; } }
  return best;
}

export function suggestBoundaryId(model: LabModel, index: ModelIndex, kind: BoundaryKind, met: string): string {
  const p = boundaryPrefix(model, kind);
  const base = p.startsWith('R_') && met.startsWith('M_') ? met.slice(2) : met;
  return uniqueId(`${p}${base}`, (x) => index.rxn.has(x));
}

/** Existing single-metabolite (boundary-like) reactions of a metabolite, with their kind. */
export function boundariesOf(index: ModelIndex, met: string): { id: string; kind: string }[] {
  return (index.metRxns.get(met) ?? []).map((id) => index.rxn.get(id)!).filter((r) => Object.keys(r.stoichiometry).length === 1)
    .map((r) => ({ id: r.id, kind: r.type }));
}

/** The compartment most exchange metabolites live in (the model's extracellular space). */
export function externalCompartment(model: LabModel, index: ModelIndex): string | null {
  const count: Record<string, number> = {};
  for (const r of model.reactions) if (r.type === 'exchange' && r.boundaryMetabolite) { const c = index.met.get(r.boundaryMetabolite)?.compartment; if (c) count[c] = (count[c] ?? 0) + 1; }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ?? (Object.keys(model.compartments).find((c) => /^(e|e0|ext|extracellular|C_e)$/i.test(c)) ?? null);
}

// ------------------------------------------------------------------ database identifiers ⇄ model annotations

const ANN_KEYS = ['metanetx.chemical', 'kegg.compound', 'chebi', 'bigg.metabolite', 'seed.compound', 'inchikey', 'metacyc.compound', 'hmdb'];
const normX = (ns: string, v: string) => `${ns}:${(ns === 'chebi' ? v.replace(/^chebi:/i, '') : v).trim().toLowerCase()}`;

const xrefIndexes = new WeakMap<ModelIndex, Map<string, string[]>>();

/** identifier → metabolite ids of the model that carry it in their annotation. */
export function xrefIndex(index: ModelIndex): Map<string, string[]> {
  const hit = xrefIndexes.get(index);
  if (hit) return hit;
  const out = new Map<string, string[]>();
  for (const m of index.met.values()) {
    for (const [k, v] of Object.entries(m.annotation ?? {})) {
      const ns = k.toLowerCase();
      if (!ANN_KEYS.includes(ns)) continue;
      for (const x of Array.isArray(v) ? v : [v]) { const key = normX(ns, String(x)); out.set(key, [...(out.get(key) ?? []), m.id]); }
    }
  }
  xrefIndexes.set(index, out);
  return out;
}

/** Model metabolites sharing an identifier with a database compound (model-first duplicate check). */
export function inModel(index: ModelIndex, c: ExternalCompound): string[] {
  const ix = xrefIndex(index);
  const ids = new Set<string>();
  for (const [ns, vals] of Object.entries(c.identifiers ?? {})) for (const v of vals) for (const id of ix.get(normX(ns, v)) ?? []) ids.add(id);
  return [...ids].sort();
}

/** Annotation of a new metabolite from a database compound (the same keys COBRApy writes as MIRIAM). */
export function annotationFrom(c: ExternalCompound): Annotation {
  const out: Annotation = {};
  for (const k of ANN_KEYS) {
    const v = c.identifiers?.[k];
    if (!v?.length) continue;
    const vals = k === 'chebi' ? v.map((x) => (/^chebi:/i.test(x) ? x.toUpperCase() : `CHEBI:${x}`)) : v;
    out[k] = vals.length > 1 ? vals : vals[0];
  }
  return out;
}

/** Confidence of a database match: confident only for an exact name / synonym / identifier hit that is not ambiguous. */
export function confidence(c: ExternalCompound, all: ExternalCompound[]): { level: 'confident' | 'review'; why: string } {
  const close = all.filter((x) => x !== c && Math.abs(x.score - c.score) < 0.1 && x.score >= 0.5);
  if (c.score < 0.9) return { level: 'review', why: c.match || 'partial name match' };
  if (c.structured === false) return { level: 'review', why: 'no formula or structure in MetaNetX' };
  if (close.length) return { level: 'review', why: `${close.length + 1} candidates match equally well` };
  return { level: 'confident', why: c.match };
}
