/**
 * Biological model layer.
 *
 * This layer knows nothing about pixels. A reaction is a hyperedge described by
 * its stoichiometry (metabolite id -> coefficient; negative = consumed,
 * positive = produced). Flux values are NOT stored here — they live in datasets,
 * so the same model can be viewed under many conditions.
 */

export type ID = string;

export interface Metabolite {
  id: ID;
  name: string;
  formula?: string;
  charge?: number;
  compartment: string;
  /** Optional reference values that came with the model (not condition data). */
  concentration?: number;
  turnover?: number;
  annotation?: Record<string, string | string[]>;
  meta?: Record<string, unknown>;
}

export interface Reaction {
  id: ID;
  name: string;
  /** metabolite id -> stoichiometric coefficient */
  stoichiometry: Record<ID, number>;
  reversible: boolean;
  lowerBound: number;
  upperBound: number;
  subsystem?: string;
  /** Gene-reaction rule, e.g. "b1723 or (b3916 and b3917)" */
  gpr?: string;
  genes: ID[];
  ec?: string[];
  meta?: Record<string, unknown>;
}

export interface Gene {
  id: ID;
  name?: string;
}

export interface MetabolicModel {
  id: string;
  name: string;
  metabolites: Record<ID, Metabolite>;
  reactions: Record<ID, Reaction>;
  genes: Record<ID, Gene>;
  /** compartment id -> human readable name */
  compartments: Record<string, string>;
  source?: 'cobra-json' | 'sbml' | 'demo' | 'manual' | 'cobrapy';
  /** SHA-256 of the imported file when the model came from COBRAGUI (COBRApy backend). */
  checksum?: string;
}

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  code:
    | 'duplicate-id'
    | 'missing-metabolite'
    | 'invalid-stoichiometry'
    | 'empty-reaction'
    | 'dead-end'
    | 'orphan-metabolite';
  message: string;
  ids: ID[];
}
