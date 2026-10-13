/**
 * Subsystem-level summaries of a result. These are descriptive aggregates of COBRApy values
 * (sums and counts over the reactions annotated with each subsystem) — not pathway fluxes:
 * Σ|v| depends on how many reactions a subsystem has and how the model writes them, so the UI
 * always labels it as "total absolute flux" and lets the user open the underlying reactions.
 * Comparison categories are taken from the backend comparison, never re-derived here.
 */
import type { CompareRow, ModelIndex, SimulationResult } from './types';

export const NO_SUBSYSTEM = '__none__';
/**
 * Display name of a subsystem. SBML exported by BiGG encodes names as identifiers
 * ("S_Tyrosine__Tryptophan__and_Phenylalanine_Metabolism": S_ prefix, "__" for ", ", "_" for " ");
 * those are shown readable. The key itself (used for matching and exports) is never changed.
 */
export const subsystemLabel = (key: string) => {
  if (key === NO_SUBSYSTEM) return 'No subsystem';
  if (/\s/.test(key) || !/_/.test(key)) return key;
  return key.replace(/^S_/, '').replace(/__/g, ', ').replace(/_/g, ' ').replace(/ ,/g, ',').trim() || key;
};

/** Subsystem key -> reaction ids, including reactions without a subsystem annotation. */
export function subsystemGroups(index: ModelIndex): Map<string, string[]> {
  const out = new Map(index.subsystems);
  const none = [...index.rxn.values()].filter((r) => !r.subsystem).map((r) => r.id);
  if (none.length) out.set(NO_SUBSYSTEM, none);
  return out;
}

export type SubsysMetric = 'total' | 'active' | 'mean';

export interface SubsysStat {
  key: string;
  rids: string[];
  /** Σ|v| for flux results; Σ(max − min) for FVA. */
  total: number;
  /** reactions with |v| ≥ tol (flux) or a non-zero interval (FVA). */
  active: number;
  /** total / active (mean over active reactions), null when nothing is active. */
  mean: number | null;
}

export function subsystemStats(index: ModelIndex, r: SimulationResult, tol: number): SubsysStat[] {
  const out: SubsysStat[] = [];
  for (const [key, rids] of subsystemGroups(index)) {
    let total = 0, active = 0;
    for (const id of rids) {
      if (r.fva) {
        const iv = r.fva[id];
        if (!iv || iv.minimum == null || iv.maximum == null) continue;
        const w = iv.maximum - iv.minimum;
        if (w >= tol) { total += w; active++; }
      } else {
        const v = r.reactionFluxes?.[id];
        if (v != null && Math.abs(v) >= tol) { total += Math.abs(v); active++; }
      }
    }
    out.push({ key, rids, total, active, mean: active ? total / active : null });
  }
  return out;
}

export const metricValue = (s: SubsysStat, m: SubsysMetric) => (m === 'total' ? s.total : m === 'active' ? s.active : s.mean ?? 0);

export interface SubsysCompare {
  key: string;
  rids: string[];
  totalA: number;
  totalB: number;
  delta: number;
  /** log2(ΣB / ΣA), only when both are non-zero. */
  log2: number | null;
  state: 'both-zero' | 'activated' | 'inactivated' | 'changed';
  counts: { changed: number; activated: number; inactivated: number; reversal: number };
}

export function subsystemCompare(index: ModelIndex, rows: CompareRow[], tol: number): SubsysCompare[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: SubsysCompare[] = [];
  for (const [key, rids] of subsystemGroups(index)) {
    let a = 0, b = 0;
    const counts = { changed: 0, activated: 0, inactivated: 0, reversal: 0 };
    for (const id of rids) {
      const row = byId.get(id);
      if (!row) continue;
      a += Math.abs(row.a ?? 0);
      b += Math.abs(row.b ?? 0);
      if (row.category === 'changed' || row.category === 'activated' || row.category === 'inactivated' || row.category === 'reversal') counts[row.category]++;
    }
    const za = a < tol, zb = b < tol;
    const state = za && zb ? 'both-zero' : za ? 'activated' : zb ? 'inactivated' : 'changed';
    out.push({ key, rids, totalA: a, totalB: b, delta: b - a, log2: !za && !zb ? Math.log2(b / a) : null, state, counts });
  }
  return out;
}
