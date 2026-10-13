/**
 * Data layer: experimental / modelling values attached to model entities.
 * Datasets reference model ids; they never reference visual glyphs.
 */
import type { ID } from '../model/types';

export interface Condition {
  id: string;
  name: string;
  color: string;
  /** Position on a timeline (hours, passage number, ...) if the conditions form a series. */
  time?: number;
}

export type DatasetKind =
  | 'flux' // one value per reaction per condition (FBA, pFBA, 13C-MFA ...)
  | 'metabolite' // concentrations, pool sizes
  | 'turnover' // metabolite turnover (kept explicit: not the same as concentration)
  | 'fva' // [min, max] per reaction per condition
  | 'samples' // distributions (flux sampling, Monte Carlo, replicates)
  | 'comparison'; // derived per-reaction comparison values (log2FC, Δ) sent from COBRAGUI

export interface Dataset {
  id: string;
  name: string;
  kind: DatasetKind;
  target: 'reaction' | 'metabolite';
  unit?: string;
  visible: boolean;
  /** Condition ids for each column, in order. */
  columns: string[];
  /** entity id (model id) -> one value per column */
  values: Record<ID, (number | null)[]>;
  /** fva: entity id -> [min,max] per column */
  ranges?: Record<ID, ([number, number] | null)[]>;
  /** samples: entity id -> sample array per column */
  samples?: Record<ID, number[][]>;
  /** Raw ids from the file that did not match the model. */
  unmatched: string[];
  /** Manual/automatic raw id -> model id translations. */
  idMap: Record<string, ID>;
  matchedFraction?: number;
}
