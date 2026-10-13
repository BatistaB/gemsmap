/** Structural model edits: what the backend (edit_service.py) accepts and returns. */
import type { Annotation, LabGene, LabMetabolite, LabReaction, ModelSummary, ModelWarning } from './types';

export interface ReactionSpec {
  id: string; name: string; lb: number | null; ub: number | null; subsystem: string; gpr: string;
  metabolites: Record<string, number>; annotation: Annotation; objective: number; notes?: Record<string, string>;
}
export interface MetaboliteSpec {
  id: string; name: string; compartment: string; formula: string; charge: number | null; annotation: Annotation; notes?: Record<string, string>;
}

/** One request operation; a list of them is applied as one transaction (one undo step). */
export type EditOp =
  | { op: 'put_reaction'; id?: string | null; reaction: ReactionSpec }
  | { op: 'put_metabolite'; id?: string | null; metabolite: MetaboliteSpec }
  | { op: 'add_compartment'; id: string; name: string }
  | { op: 'delete_reaction'; id: string }
  | { op: 'delete_metabolite'; id: string; cascade?: boolean };

export interface Balance { mass: Record<string, number> | null; charge: number | null; missingFormula: string[]; missingCharge: string[] }
export interface DuplicateMetabolite { id: string; name: string; compartment: string; sameCompartment: boolean; reasons: string[] }
export interface DuplicateReaction { id: string; name: string; reason: string; scaled: boolean }

export interface EditReportItem {
  op: number; label: string; errors: string[]; warnings: string[]; info: string[];
  kind?: 'exchange' | 'sink' | 'demand' | null; balance?: Balance; duplicates?: (DuplicateMetabolite | DuplicateReaction)[]; compartments?: string[];
}
export interface EditReport { errors: string[]; warnings: string[]; info: string[]; items: EditReportItem[]; changes?: string[] }

export interface EditHistoryItem { id: string; time: number; label: string; details?: string[] }
export interface EditHistory {
  count: number; hash: string;
  /** edits not yet written to a file (Export model) */
  dirty: boolean;
  items: EditHistoryItem[]; redo: EditHistoryItem[]; loadErrors: string[];
}

interface Rows<T> { upsert: T[]; remove: string[] }
export interface ModelDelta {
  reactions: Rows<LabReaction>; metabolites: Rows<LabMetabolite>; genes: Rows<LabGene>;
  summary: ModelSummary; compartments: Record<string, string>; warnings: ModelWarning[]; medium: Record<string, number>;
}
export interface EditResponse {
  delta: ModelDelta; history: EditHistory;
  /** old id -> new id (null = removed) */
  renamed: { reactions: Record<string, string | null>; metabolites: Record<string, string | null> };
}

export interface ValidationReport { issues: ModelWarning[]; edits: number; reactions: number; metabolites: number; checkedAt: number }

/** A compound from the database search (KEGG / ChEBI → MetaNetX, BiGG tables). */
export interface ExternalCompound {
  name: string; formula?: string | null; charge?: number | null; synonyms: string[];
  identifiers: Record<string, string[]>; mnx?: string | null; sources: string[]; score: number; match: string; note?: string; structured?: boolean;
}

/** A metabolite to create together with a reaction (not in the model yet). */
export interface PendingMetabolite extends MetaboliteSpec {
  /** where it came from: a database candidate (annotations pre-filled) or typed by hand */
  origin: 'database' | 'manual';
  source?: string;
}

export type BoundaryKind = 'exchange' | 'sink' | 'demand';
