import type { Condition, Dataset } from './types';

/**
 * Column indices of a dataset in the user's condition order (Data tab → Conditions, drag to reorder).
 * Datasets keep their import order internally; every plot and list reads through this.
 */
export function orderedColumns(ds: Dataset, conditions: Condition[]): number[] {
  const rank = new Map(conditions.map((c, i) => [c.id, i]));
  return ds.columns.map((_, ci) => ci).sort((a, b) => (rank.get(ds.columns[a]) ?? 1e9 + a) - (rank.get(ds.columns[b]) ?? 1e9 + b));
}

/** Condition ids of a dataset in the user's order. */
export const orderedConditionIds = (ds: Dataset, conditions: Condition[]) => orderedColumns(ds, conditions).map((ci) => ds.columns[ci]);
