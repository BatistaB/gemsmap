/**
 * Split-reaction families of enzyme-constrained models (GECKO / ecModels).
 *
 * ecModels split one reaction into irreversible and per-isozyme copies:
 *   r101 → r101_EXP_1, r101_EXP_2, r101_REV_EXP_1, r101_REV_EXP_2      (isozymes, both directions)
 *   r262 → r262 + r262_REV                                              (reversible made irreversible)
 * A map drawn on the parent id (r101) shows the family's net flux:
 *   Σ forward copies − Σ _REV copies.
 * Families are derived from the dataset's own ids, so CSVs, COBRAGUI results and JSON imports all work.
 */
import type { ID } from '../model/types';
import type { Dataset } from './types';

export interface FamilyMember { id: ID; sign: 1 | -1 }

const SPLIT = /^(.+?)(_REV)?_EXP_\d+$/;
const REV = /^(.+?)_REV$/;

/** Parent id and flux sign of a split copy, or null for an ordinary id. */
export function splitParent(id: string): FamilyMember | null {
  const m = SPLIT.exec(id);
  if (m) return { id: m[1], sign: m[2] ? -1 : 1 };
  const r = REV.exec(id);
  return r ? { id: r[1], sign: -1 } : null;
}

const cache = new WeakMap<object, Map<ID, FamilyMember[]>>();

/** parent id → members (including the parent itself when present), only for ids that have split copies. */
function families(table: Record<ID, unknown>): Map<ID, FamilyMember[]> {
  let f = cache.get(table);
  if (f) return f;
  f = new Map();
  for (const id of Object.keys(table)) {
    const p = splitParent(id);
    if (!p) continue;
    let list = f.get(p.id);
    if (!list) { list = table[p.id] !== undefined ? [{ id: p.id, sign: 1 }] : []; f.set(p.id, list); }
    list.push({ id, sign: p.sign });
  }
  cache.set(table, f);
  return f;
}

/** Members whose values make up `id` (the id alone when it has no split copies). */
export function familyMembers(table: Record<ID, unknown> | undefined, id: ID): FamilyMember[] {
  if (!table) return [];
  return families(table).get(id) ?? (table[id] !== undefined ? [{ id, sign: 1 }] : []);
}

/** Net value of `id` in column `ci` (null when no member has a value). */
export function netValue(ds: Dataset, id: ID, ci: number): number | null {
  let sum = 0, any = false;
  for (const m of familyMembers(ds.values, id)) {
    const v = ds.values[m.id]?.[ci];
    if (v != null) { sum += m.sign * v; any = true; }
  }
  return any ? sum : null;
}

/** Element-wise net samples of `id` in column `ci`. */
export function netSamples(ds: Dataset, id: ID, ci: number): number[] {
  const members = familyMembers(ds.samples, id);
  if (members.length <= 1) return members.length ? ds.samples?.[members[0].id]?.[ci] ?? [] : [];
  const arrs = members.map((m) => ({ s: m.sign, a: ds.samples![m.id]?.[ci] ?? [] })).filter((x) => x.a.length);
  if (!arrs.length) return [];
  const n = Math.min(...arrs.map((x) => x.a.length));
  return Array.from({ length: n }, (_, k) => arrs.reduce((t, x) => t + x.s * x.a[k], 0));
}

/** Range of the net flux of `id` (outer bound when the family has several members). */
export function netRange(ds: Dataset, id: ID, ci: number): [number, number] | null {
  let lo = 0, hi = 0, any = false;
  for (const m of familyMembers(ds.ranges, id)) {
    const r = ds.ranges![m.id]?.[ci];
    if (!r) continue;
    any = true;
    if (m.sign > 0) { lo += r[0]; hi += r[1]; } else { lo -= r[1]; hi -= r[0]; }
  }
  return any ? [lo, hi] : null;
}
