/**
 * Read simulation results back from files, for COBRAGUI and the Map Builder.
 *
 * Accepted:
 *  - JSON exported by COBRAGUI (format "cobragui-result"), a single result or a list;
 *  - JSON exported by the legacy Tkinter GEM Explorer (last_fluxes / last_fva_min / last_fva_max /
 *    met_throughput). Its FVA export also stored midpoints as "fluxes"; those are ignored — FVA is
 *    imported as intervals only;
 *  - a plain JSON object {reaction_id: flux};
 *  - CSV / TSV: `reaction,flux`, wide tables `reaction,A,B,…` (one result per numeric column) and FVA
 *    tables (`minimum/maximum`, `min/max`, `lower/upper` or `<name>_min/<name>_max`). The `#` provenance
 *    lines written by COBRAGUI's CSV export restore the name, method and source model.
 *
 * Nothing is recomputed here: values are taken as they are in the file.
 */
import { parseDelimited } from '../data/csv';
import type { Method, ResultOrigin, SimulationMetadata, SimulationResult, SolverStatus } from './types';

export interface ParsedResults { results: SimulationResult[]; notes: string[] }

const rid = () => `imp_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
const stem = (file: string) => file.replace(/\.[^.]+$/, '');
const num = (s: unknown): number | null => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (typeof s !== 'string' || s.trim() === '' || /^(na|nan|null|none)$/i.test(s.trim())) return null;
  const v = Number(s.trim().replace('−', '-'));
  return Number.isFinite(v) ? v : null;
};
const METHODS: Method[] = ['fba', 'pfba', 'loopless', 'fva'];
const METHOD_FROM_LABEL: Record<string, Method> = { fba: 'fba', pfba: 'pfba', 'loopless fba': 'loopless', loopless: 'loopless', fva: 'fva' };

export function isResultJson(head: string): boolean {
  return /"cobragui-result"|"last_fluxes"|"last_fva_min"|"reactionFluxes"/.test(head);
}

function metadata(p: { file: string; method: Method; label: string; name?: string; model?: Partial<SimulationMetadata['model']>; objective?: Record<string, number> }): SimulationMetadata {
  return {
    model: { id: '', modelId: '', name: '', filename: '', checksum: '', format: '', ...p.model },
    state: { id: null, name: 'not recorded (imported)' },
    method: p.method, methodLabel: p.label, solver: 'not recorded', cobraVersion: '',
    objective: { coefficients: p.objective ?? {}, direction: 'max' }, objectiveIsModelDefault: false,
    medium: {}, boundChanges: [], parameters: {},
    timestamp: new Date().toISOString(), elapsedSeconds: 0,
    solverStatusRaw: 'not recorded (imported file)', message: null, tolerance: null,
  };
}

function base(file: string, format: ResultOrigin['format'], name: string, method: Method, md: SimulationMetadata, notes: string[]): SimulationResult {
  return {
    id: rid(), name, modelId: '', modelStateId: null, method,
    solverStatus: 'optimal', objectiveValue: null,
    reactionFluxes: null, fva: null, metaboliteTurnover: null, exchanges: null,
    diagnostics: [], metadata: md, createdAt: Date.now(),
    origin: { kind: 'imported', file, format, importedAt: Date.now(), notes },
  };
}

function numberMap(o: Record<string, unknown> | null | undefined): Record<string, number | null> | null {
  if (!o || typeof o !== 'object') return null;
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(o)) out[k] = num(v);
  return out;
}

// ------------------------------------------------------------------ JSON

export function parseResultJson(file: string, text: string): ParsedResults {
  let j: unknown;
  try { j = JSON.parse(text); } catch (e) { throw new Error(`Not valid JSON: ${(e as Error).message}`); }
  const list: unknown[] = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { results?: unknown[] }).results) ? (j as { results: unknown[] }).results : [j];
  const results: SimulationResult[] = [];
  const notes: string[] = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`Entry ${i + 1} is not an object`);
    const o = item as Record<string, unknown>;
    const fallbackName = list.length > 1 ? `${stem(file)} #${i + 1}` : stem(file);
    if (o.format === 'cobragui-result' || ('metadata' in o && ('reactionFluxes' in o || 'fva' in o))) {
      const md = o.metadata as SimulationMetadata | undefined;
      const method = METHODS.includes(o.method as Method) ? (o.method as Method) : 'fba';
      const r = base(file, 'json', String(o.name || fallbackName), method,
        md ? { ...metadata({ file, method, label: method.toUpperCase() }), ...md } : metadata({ file, method, label: method.toUpperCase() }), []);
      r.solverStatus = (o.solverStatus as SolverStatus) || 'optimal';
      r.objectiveValue = num(o.objectiveValue);
      r.reactionFluxes = numberMap(o.reactionFluxes as Record<string, unknown>);
      r.metaboliteTurnover = numberMap(o.metaboliteTurnover as Record<string, unknown>);
      r.exchanges = (o.exchanges as SimulationResult['exchanges']) ?? null;
      r.diagnostics = Array.isArray(o.diagnostics) ? (o.diagnostics as string[]) : [];
      r.stateSnapshot = (o.stateSnapshot as SimulationResult['stateSnapshot']) ?? undefined;
      if (o.fva && typeof o.fva === 'object') {
        r.fva = {};
        for (const [k, iv] of Object.entries(o.fva as Record<string, { minimum?: unknown; maximum?: unknown }>)) r.fva[k] = { minimum: num(iv?.minimum), maximum: num(iv?.maximum) };
      }
      results.push(r);
    } else if ('last_fluxes' in o || 'last_fva_min' in o) {
      const model = { filename: typeof o.model_file === 'string' ? o.model_file : '' };
      const objective = (numberMap(o.objective as Record<string, unknown>) ?? {}) as Record<string, number>;
      const fmin = numberMap(o.last_fva_min as Record<string, unknown>), fmax = numberMap(o.last_fva_max as Record<string, unknown>);
      if (fmin && fmax) {
        const n = 'The legacy GEM Explorer stored FVA midpoints as fluxes; they were ignored — only the min/max intervals were imported.';
        const r = base(file, 'legacy-json', `${fallbackName} (FVA)`, 'fva', metadata({ file, method: 'fva', label: 'FVA (legacy GEM Explorer)', model, objective }), [n]);
        r.fva = {};
        for (const k of new Set([...Object.keys(fmin), ...Object.keys(fmax)])) r.fva[k] = { minimum: fmin[k] ?? null, maximum: fmax[k] ?? null };
        notes.push(n);
        results.push(r);
      } else {
        const r = base(file, 'legacy-json', fallbackName, 'fba', metadata({ file, method: 'fba', label: 'Flux distribution (legacy GEM Explorer)', model, objective }), []);
        r.reactionFluxes = numberMap(o.last_fluxes as Record<string, unknown>);
        const thr = numberMap(o.met_throughput as Record<string, unknown>);
        if (thr && Object.keys(thr).length) r.metaboliteTurnover = thr;
        results.push(r);
      }
    } else {
      const values = Object.values(o);
      if (values.length && values.every((v) => typeof v === 'number' || v === null)) {
        const r = base(file, 'json', fallbackName, 'fba', metadata({ file, method: 'fba', label: 'Imported flux table' }), []);
        r.reactionFluxes = numberMap(o);
        results.push(r);
      } else {
        throw new Error('Unrecognized JSON. Expected a result exported by COBRAGUI, a legacy GEM Explorer export, or {reaction_id: flux}.');
      }
    }
  });
  for (const r of results) if (!r.reactionFluxes && !r.fva) throw new Error(`“${r.name}” contains no reaction fluxes or FVA intervals`);
  return { results, notes };
}

// ------------------------------------------------------------------ CSV / TSV

function provenance(text: string) {
  const get = (k: string) => text.match(new RegExp(`^#\\s*${k}:\\s*(.*)$`, 'mi'))?.[1]?.trim();
  const methodLine = get('method');
  const methodLabel = methodLine?.split(/\s{2,}|\s+solver:/)[0]?.trim();
  const model = get('model');
  return {
    name: get('result'),
    method: methodLabel ? METHOD_FROM_LABEL[methodLabel.toLowerCase()] : undefined,
    methodLabel,
    status: methodLine?.match(/status:\s*(\w+)/)?.[1] as SolverStatus | undefined,
    solver: methodLine?.match(/solver:\s*(\S+)/)?.[1],
    filename: model?.replace(/\s*\(sha256.*$/, ''),
    checksum: model?.match(/sha256\s+([0-9a-f]+)/)?.[1],
    state: get('state'),
    objectiveValue: num(get('objective')?.match(/value:\s*(\S+)/)?.[1]),
  };
}

const FVA_COL = /^(.*?)[\s_.-]*(minimum|maximum|min|max|lower|upper|lb|ub)$/i;

export function parseResultTable(file: string, text: string): ParsedResults {
  const rows = parseDelimited(text);
  if (rows.length < 2) throw new Error('The table needs a header row and at least one data row.');
  const [header, ...body] = rows;
  const first = header[0].toLowerCase();
  const fmt: ResultOrigin['format'] = /\.tsv$/i.test(file) || text.split('\n').find((l) => l && !l.startsWith('#'))?.includes('\t') ? 'tsv' : 'csv';
  if (/metab|compound|species/.test(first)) throw new Error('This is a metabolite table (e.g. turnover). Import a reaction flux or FVA table.');
  const lower = header.map((h) => h.trim().toLowerCase());
  if (lower.includes('uptake') && lower.includes('secretion')) throw new Error('This is an exchange table. Import the reaction flux table instead.');
  const p = provenance(text);
  const notes: string[] = [];
  const model = { filename: p.filename ?? '', checksum: p.checksum ?? '' };

  const isNumericCol = (i: number) => body.filter((r) => num(r[i]) != null).length >= Math.max(1, body.length * 0.5);
  // FVA: pair min/max columns sharing a prefix
  const pairs = new Map<string, { lo?: number; hi?: number }>();
  header.forEach((h, i) => {
    if (i === 0) return;
    const m = h.trim().match(FVA_COL);
    if (!m) return;
    const key = m[1] || '';
    const e = pairs.get(key) ?? {};
    if (/^(min|minimum|lower|lb)$/i.test(m[2])) e.lo = i; else e.hi = i;
    pairs.set(key, e);
  });
  const fvaPairs = [...pairs.entries()].filter(([, e]) => e.lo != null && e.hi != null);
  const results: SimulationResult[] = [];
  if (fvaPairs.length) {
    for (const [key, e] of fvaPairs) {
      const name = key ? `${p.name ?? stem(file)} · ${key}` : p.name ?? stem(file);
      const r = base(file, fmt, name, 'fva', metadata({ file, method: 'fva', label: p.methodLabel ?? 'FVA (imported table)', model }), []);
      r.fva = {};
      for (const row of body) {
        const a = num(row[e.lo!]), b = num(row[e.hi!]);
        if (row[0]) r.fva[row[0]] = { minimum: a == null || b == null ? a : Math.min(a, b), maximum: a == null || b == null ? b : Math.max(a, b) };
      }
      results.push(r);
    }
    return { results, notes };
  }
  const cols = header.map((_, i) => i).slice(1).filter((i) => !/^(range|width|name|subsystem|equation|gpr|genes?)$/i.test(header[i].trim()) && isNumericCol(i));
  if (!cols.length) throw new Error('No numeric flux column found.');
  for (const i of cols) {
    const colName = header[i].trim();
    const single = cols.length === 1;
    const name = single ? p.name ?? (/^(flux|fluxes|value|v)$/i.test(colName) ? stem(file) : colName) : colName;
    const method = single && p.method ? p.method : 'fba';
    const r = base(file, fmt, name, method, metadata({ file, method, label: single && p.methodLabel ? p.methodLabel : 'Imported flux table', model }), []);
    if (single) {
      if (p.status) r.solverStatus = p.status;
      r.objectiveValue = p.objectiveValue;
      if (p.solver) r.metadata.solver = p.solver;
      if (p.state) r.metadata.state = { id: null, name: p.state };
    }
    r.reactionFluxes = {};
    for (const row of body) if (row[0]) r.reactionFluxes[row[0]] = num(row[i]);
    results.push(r);
  }
  if (cols.length > 1) notes.push(`${cols.length} numeric columns → ${cols.length} results (${cols.map((i) => header[i]).join(', ')})`);
  return { results, notes };
}

export function parseResultFile(file: string, text: string): ParsedResults {
  return /\.json$/i.test(file) || text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? parseResultJson(file, text) : parseResultTable(file, text);
}
