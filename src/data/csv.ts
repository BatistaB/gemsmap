import { splitParent } from './families';
import { baseId } from '../model/currency';
import type { ID, MetabolicModel } from '../model/types';
import type { Dataset, DatasetKind } from './types';

export function parseDelimited(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  return lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
      } else if (ch === delim && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

const num = (s: string | undefined): number | null => {
  if (s == null || s === '' || /^(na|nan|null|none|-)$/i.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

/** Resolve a raw id from a data file to a model id. */
export function makeMatcher(model: MetabolicModel | null, target: 'reaction' | 'metabolite') {
  if (!model) return (raw: string): ID | null => raw;
  const table = target === 'reaction' ? model.reactions : model.metabolites;
  const lower = new Map<string, ID>();
  const byBase = new Map<string, ID>();
  const byName = new Map<string, ID>();
  for (const [id, ent] of Object.entries(table)) {
    lower.set(id.toLowerCase(), id);
    const b = baseId(id).toLowerCase();
    // Prefer cytosolic when several compartments share a base id.
    if (!byBase.has(b) || /_c$/.test(id)) byBase.set(b, id);
    byName.set(ent.name.toLowerCase(), id);
  }
  return (raw: string): ID | null => {
    if (table[raw]) return raw;
    const s = raw.replace(/^[RM]_/, '');
    if (table[s]) return s;
    // ecModel split copies (r101_EXP_2, r262_REV) keep their own id when the parent is in the model
    const fam = splitParent(s);
    if (fam && target === 'reaction' && (table[fam.id] || lower.has(fam.id.toLowerCase()))) return s;
    const l = s.toLowerCase();
    return lower.get(l) ?? byBase.get(baseId(s).toLowerCase()) ?? byName.get(l) ?? null;
  };
}

export interface ParsedTable {
  kind: DatasetKind;
  target: 'reaction' | 'metabolite';
  columns: string[];
  rows: { raw: string; values: (number | null)[]; ranges?: ([number, number] | null)[]; samples?: number[][] }[];
}

/**
 * Accepted shapes
 *   wide:    reaction,WT,KO1,KO2          (flux / metabolite / time course)
 *   fva:     reaction,WT_min,WT_max,...   or reaction,min,max
 *   long:    reaction,condition,value     (samples/replicates; repeated rows)
 */
export function parseTable(text: string, model: MetabolicModel | null, forceKind?: DatasetKind): ParsedTable {
  const rows = parseDelimited(text);
  if (rows.length < 2) throw new Error('The file needs a header row and at least one data row.');
  const [header, ...body] = rows;
  const firstCol = header[0].toLowerCase();

  // Decide target by header hint, then by how many ids match the model.
  let target: 'reaction' | 'metabolite' = /met|compound|species/.test(firstCol) ? 'metabolite' : 'reaction';
  if (model && !/met|compound|species|rxn|reaction/.test(firstCol)) {
    const mr = makeMatcher(model, 'reaction');
    const mm = makeMatcher(model, 'metabolite');
    const sample = body.slice(0, 200);
    const nr = sample.filter((r) => mr(r[0]) != null).length;
    const nm = sample.filter((r) => mm(r[0]) != null).length;
    target = nm > nr ? 'metabolite' : 'reaction';
  }

  const isLong = header.length === 3 && body.length > 0 && num(body[0][1]) == null && num(body[0][2]) != null;
  if (isLong || forceKind === 'samples') {
    const cols: string[] = [];
    const map = new Map<string, number[][]>();
    for (const r of body) {
      const v = num(r[2]);
      if (v == null) continue;
      let ci = cols.indexOf(r[1]);
      if (ci < 0) { cols.push(r[1]); ci = cols.length - 1; }
      if (!map.has(r[0])) map.set(r[0], []);
      const arr = map.get(r[0])!;
      while (arr.length <= ci) arr.push([]);
      arr[ci].push(v);
    }
    return {
      kind: 'samples', target, columns: cols,
      rows: [...map].map(([raw, s]) => {
        while (s.length < cols.length) s.push([]);
        return { raw, samples: s, values: s.map((x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null)) };
      }),
    };
  }

  const minMax = header.slice(1).map((h) => h.match(/^(.*?)[\s_.-]*(min|max|lower|upper|lb|ub)$/i));
  if (minMax.length >= 2 && minMax.every(Boolean)) {
    const cols: string[] = [];
    const lo: number[] = [];
    const hi: number[] = [];
    minMax.forEach((m, i) => {
      const cond = m![1] || 'FVA';
      let ci = cols.indexOf(cond);
      if (ci < 0) { cols.push(cond); ci = cols.length - 1; }
      if (/min|lower|lb/i.test(m![2])) lo[ci] = i + 1; else hi[ci] = i + 1;
    });
    return {
      kind: 'fva', target: 'reaction', columns: cols,
      rows: body.map((r) => {
        const ranges = cols.map((_, ci) => {
          const a = num(r[lo[ci]]);
          const b = num(r[hi[ci]]);
          return a == null || b == null ? null : ([Math.min(a, b), Math.max(a, b)] as [number, number]);
        });
        return { raw: r[0], ranges, values: ranges.map((x) => (x ? (x[0] + x[1]) / 2 : null)) };
      }),
    };
  }

  // Wide table: every column after the id that is mostly numeric is a condition.
  const condIdx = header
    .map((_, i) => i)
    .slice(1)
    .filter((i) => body.filter((r) => num(r[i]) != null).length >= body.length * 0.5);
  const kind: DatasetKind = forceKind ?? (target === 'metabolite' ? 'metabolite' : 'flux');
  return {
    kind, target, columns: condIdx.map((i) => header[i]),
    rows: body.map((r) => ({ raw: r[0], values: condIdx.map((i) => num(r[i])) })),
  };
}

/** Turn a parsed table into a Dataset, matching ids against the model. */
export function buildDataset(
  name: string,
  t: ParsedTable,
  model: MetabolicModel | null,
  conditionIdFor: (col: string) => string,
  idMap: Record<string, ID> = {},
): Dataset {
  const match = makeMatcher(model, t.target);
  const ds: Dataset = {
    id: 'ds_' + Math.random().toString(36).slice(2, 9),
    name, kind: t.kind, target: t.target, visible: true,
    columns: t.columns.map(conditionIdFor),
    values: {}, unmatched: [], idMap: { ...idMap },
    unit: t.kind === 'flux' || t.kind === 'fva' || t.kind === 'samples' ? 'mmol gDW⁻¹ h⁻¹' : undefined,
  };
  if (t.kind === 'fva') ds.ranges = {};
  if (t.kind === 'samples') ds.samples = {};
  for (const row of t.rows) {
    const id = idMap[row.raw] ?? match(row.raw);
    if (!id) { ds.unmatched.push(row.raw); continue; }
    if (id !== row.raw) ds.idMap[row.raw] = id;
    ds.values[id] = row.values;
    if (row.ranges) ds.ranges![id] = row.ranges;
    if (row.samples) ds.samples![id] = row.samples;
  }
  const total = t.rows.length;
  ds.matchedFraction = total ? (total - ds.unmatched.length) / total : 1;
  // keep raw rows for later manual mapping
  (ds as Dataset & { _raw?: ParsedTable })._raw = t;
  return ds;
}

/** Apply a manual raw->model id mapping to a dataset that kept its raw rows. */
export function remapDataset(ds: Dataset, raw: string, modelId: ID): Dataset {
  const t = (ds as Dataset & { _raw?: ParsedTable })._raw;
  const row = t?.rows.find((r) => r.raw === raw);
  if (!row) return ds;
  const next: Dataset = {
    ...ds,
    values: { ...ds.values, [modelId]: row.values },
    idMap: { ...ds.idMap, [raw]: modelId },
    unmatched: ds.unmatched.filter((u) => u !== raw),
  };
  if (row.ranges) next.ranges = { ...ds.ranges, [modelId]: row.ranges };
  if (row.samples) next.samples = { ...ds.samples, [modelId]: row.samples };
  const total = t!.rows.length;
  next.matchedFraction = (total - next.unmatched.length) / total;
  (next as Dataset & { _raw?: ParsedTable })._raw = t;
  return next;
}
