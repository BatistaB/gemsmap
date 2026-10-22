/**
 * COBRAGUI types. The backend (COBRApy) is the only source of scientific values;
 * these types describe what it returns and the user-owned model states sent back with each request.
 */

export type Method = 'fba' | 'pfba' | 'loopless' | 'fva';
export type SolverStatus = 'optimal' | 'infeasible' | 'unbounded' | 'infeasible_or_unbounded' | 'undefined' | 'error';
export type ReactionType = 'exchange' | 'demand' | 'sink' | 'transport' | 'internal';
/** [lower, upper]; null = unbounded on that side. */
export type Bounds = [number | null, number | null];
export type Annotation = Record<string, string | string[]>;

export interface LabMetabolite {
  id: string; name: string; formula: string | null; charge: number | null; compartment: string;
  annotation: Annotation; reactionCount: number;
}

export interface LabReaction {
  id: string; name: string; equation: string; equationNames: string;
  stoichiometry: Record<string, number>;
  lb: number | null; ub: number | null; reversible: boolean;
  subsystem: string | null; gpr: string | null; genes: string[]; ec: string[]; annotation: Annotation;
  type: ReactionType; compartments: string[]; objectiveCoefficient: number;
  boundaryMetabolite: string | null; boundaryCoefficient: number | null;
}

export interface LabGene { id: string; name: string; annotation: Annotation; reactions: string[] }

export interface ModelWarning { level: 'error' | 'warning' | 'info'; code: string; title: string; count: number; ids: string[]; detail: string }

export interface Objective { coefficients: Record<string, number>; direction: 'max' | 'min' }

export interface ModelSummary {
  reactions: number; metabolites: number; genes: number; compartments: number; subsystems: number;
  exchange: number; demand: number; sink: number; transport: number; internal: number;
  reversible: number; irreversible: number; blockedByBounds: number;
  objective: Objective; solver: string; cobraVersion: string; mediumSize: number;
}

export interface LabModel {
  id: string; checksum: string; filename: string; format: 'sbml' | 'json' | 'mat'; modelId: string; name: string;
  summary: ModelSummary; compartments: Record<string, string>;
  metabolites: LabMetabolite[]; reactions: LabReaction[]; genes: LabGene[];
  /** max uptake per exchange in the imported file; null = unbounded */
  medium: Record<string, number | null>;
  warnings: ModelWarning[];
  validation: { format: string; categories: Record<string, { count: number; messages: string[] }>; loader: string[] };
}

/** Lookup tables derived once per model on the frontend. */
export interface ModelIndex {
  met: Map<string, LabMetabolite>;
  rxn: Map<string, LabReaction>;
  gene: Map<string, LabGene>;
  metRxns: Map<string, string[]>;
  subsystems: Map<string, string[]>;
  /** Largest finite |bound| in the model (used for "allow reversible"). */
  maxBound: number;
}

// ------------------------------------------------------------------ states & modifications

export interface Modification {
  id: string; time: number;
  kind: 'bounds' | 'objective' | 'medium' | 'reset' | 'bulk';
  target: string; before: string; after: string; note?: string;
}

export interface StateConfig { bounds: Record<string, Bounds>; objective: Objective | null; changes: Modification[]; mediumLabel?: string }

export interface ModelState extends StateConfig {
  id: string; name: string; createdAt: number; parentId?: string;
  undo: StateConfig[]; redo: StateConfig[];
}

/** What is sent to the backend with every computation. */
export interface StateSpec { id?: string; name?: string; bounds: Record<string, Bounds>; objective: Objective | null }

// ------------------------------------------------------------------ simulation results

export interface ExchangeFlux { metabolite: string | null; kind: string; flux: number; uptake: number; secretion: number }
export interface ExchangeInterval { metabolite: string | null; kind: string; fluxMin: number; fluxMax: number; uptakeMax: number; secretionMax: number }

export interface SimulationMetadata {
  model: { id: string; modelId: string; name: string; filename: string; checksum: string; format: string };
  state: { id: string | null; name: string };
  method: Method; methodLabel: string; solver: string; cobraVersion: string;
  objective: Objective; objectiveIsModelDefault: boolean;
  medium: Record<string, number | null>;
  boundChanges: { reaction: string; original: Bounds; current: Bounds }[];
  parameters: Record<string, unknown>;
  timestamp: string; elapsedSeconds: number; solverStatusRaw: string; message: string | null;
  tolerance: number | null; totalFlux?: number | null;
  /** FVA stopped early with "keep": intervals exist only for the first `done` reactions. */
  partial?: { done: number; total: number };
}

export interface SimulationResult {
  id: string; name: string; modelId: string; modelStateId: string | null;
  method: Method; solverStatus: SolverStatus; objectiveValue: number | null;
  reactionFluxes: Record<string, number | null> | null;
  fva: Record<string, { minimum: number | null; maximum: number | null }> | null;
  metaboliteTurnover: Record<string, number | null> | null;
  exchanges: Record<string, ExchangeFlux | ExchangeInterval> | null;
  diagnostics: string[];
  metadata: SimulationMetadata;
  /** Frontend: exact state configuration used (lets the user restore it later). */
  stateSnapshot?: StateSpec;
  createdAt?: number;
  /** Set when the result was read from a file instead of computed in this session. */
  origin?: ResultOrigin;
}

export interface ResultOrigin {
  kind: 'imported';
  file: string;
  format: 'json' | 'legacy-json' | 'csv' | 'tsv';
  importedAt: number;
  /** Reaction ids of the result found in the currently loaded model / total ids in the result. */
  matched?: number;
  total?: number;
  /** Turnover and exchanges were computed by COBRApy with the current model (the file had none). */
  derivedWith?: string;
  notes?: string[];
}

export interface SimParams { fractionOfOptimum: number; loopless: boolean; reactions: string[] | null; pfbaFactor: number | null; processes: number }

// ------------------------------------------------------------------ comparison

export type CompareCategory = 'both-zero' | 'unchanged' | 'changed' | 'activated' | 'inactivated' | 'reversal' | 'missing';

export interface CompareRow {
  id: string; a: number | null; b: number | null; delta: number | null; absDelta: number | null;
  foldChange: number | null; log2fc: number | null; category: CompareCategory; pseudocount: boolean;
}
export interface ExchangeCompareRow extends CompareRow {
  metabolite: string | null; kind: string; switch?: string;
  uptakeA: number | null; uptakeB: number | null; secretionA: number | null; secretionB: number | null;
  deltaUptake: number | null; deltaSecretion: number | null; netA: number | null; netB: number | null;
}
export interface FvaCompareRow {
  id: string; category: string; aMin?: number; aMax?: number; bMin?: number; bMax?: number;
  aWidth?: number; bWidth?: number; deltaWidth?: number; absDeltaWidth?: number; overlap?: boolean;
}
export interface ConfigDiff {
  sameModel: boolean;
  objective: { a: Objective; b: Objective; changed: boolean };
  methods: { a: string; b: string };
  /** max uptake in A and B: 0 = not in the medium, null = unbounded */
  medium: { reaction: string; a: number | null; b: number | null }[];
  bounds: { reaction: string; a: Bounds | null; b: Bounds | null }[];
}
export interface ComparisonResult {
  kind: 'flux' | 'fva';
  a: { id: string; name: string; method: Method }; b: { id: string; name: string; method: Method };
  zeroTolerance: number; pseudocount: number | null; config: ConfigDiff;
  reactions: (CompareRow | FvaCompareRow)[];
  metabolites?: CompareRow[]; exchanges?: ExchangeCompareRow[];
  counts: Record<string, number>;
  objective?: { a: number | null; b: number | null };
}

export interface TurnoverExplanation {
  metabolite: string; name: string; turnoverA: number | null; turnoverB: number | null; delta: number | null; note: string;
  rows: { reaction: string; name: string; coefficient: number; fluxA: number | null; fluxB: number | null; contributionA: number | null; contributionB: number | null; delta: number | null; roleA: string; roleB: string; category: CompareCategory }[];
}

// ------------------------------------------------------------------ medium

export interface MediumRow {
  reaction: string; reactionName: string; kind: string; metabolite: string | null; metaboliteName: string; formula: string | null;
  uptakeMax: number | null; secretionMax: number | null; uptakeUnbounded: boolean;
  originalUptakeMax: number | null; originalSecretionMax: number | null; inMedium: boolean; lb: number | null; ub: number | null;
}
export interface MediumTable { medium: Record<string, number | null>; rows: MediumRow[] }
export interface MediumPreset { id: string; name: string; medium: Record<string, number>; builtin?: boolean }

// ------------------------------------------------------------------ navigation & UI

export type EntityKind = 'metabolite' | 'reaction' | 'gene' | 'subsystem';
export interface EntityRef { kind: EntityKind; id: string }
export type LabSection = 'overview' | 'explore' | 'medium' | 'simulate' | 'results' | 'compare' | 'annotation';
export type ExplorerTab = 'metabolites' | 'reactions' | 'genes';

export interface RxnFilters {
  absFluxGt?: number; absFluxLt?: number;
  reversibility?: 'reversible' | 'irreversible' | 'blocked';
  modifiedOnly?: boolean;
  types?: ReactionType[];
  hideTypes?: ReactionType[];
  genes?: 'with' | 'without';
  subsystems?: string[];
  compartments?: string[];
  favoritesOnly?: boolean;
  ids?: { label: string; ids: string[] };
}
export interface MetFilters { compartments?: string[]; favoritesOnly?: boolean; ids?: { label: string; ids: string[] } }

export type SortDir = 'asc' | 'desc';
export interface SortSpec { key: string; dir: SortDir }

export interface SavedView {
  id: string; name: string; tab: ExplorerTab; query: string; hideZero: boolean;
  rxnFilters: RxnFilters; metFilters: MetFilters; sort: SortSpec | null; builtin?: boolean;
}

export interface LabSettings {
  zeroTolerance: number;
  pseudocount: number | null;
  reactionColumns: string[];
  defaultMethod: Method;
  showCofactorsInNetwork: boolean;
}

export interface ApiErrorInfo { title: string; message: string; hints: string[]; detail?: unknown; status?: number }

// ------------------------------------------------------------------ metabolite annotation (MetaNetX)

export type AnnotationStatusKind = 'confident' | 'doubt' | 'unmapped' | 'skipped';

export interface MnxCandidate {
  mnx: string; name: string | null; formula: string | null; charge: number | null; inchikey: string | null;
  structured: boolean; exists: boolean; via: string[]; formulaCheck: 'match' | 'conflict' | null; nameMatch: boolean;
  /** BiGG universal metabolites (local BiGG tables) of the same composition, and whether the entry is described by BiGG only. */
  bigg?: string[]; fromBigg?: boolean;
}

export interface AnnotationItem {
  id: string; name: string; compartment: string; formula: string | null; charge: number | null;
  status: AnnotationStatusKind; reason: string;
  inputs: { xref: string; source: 'annotation' | 'id' | 'bigg'; mnx: string[] }[];
  candidates: MnxCandidate[];
  proposal?: { mnx: string; add: Record<string, string[]>; formula?: string; charge?: number | null };
}

export interface AnnotationAnalysis {
  version: number; createdAt: string; status: 'done' | 'partial'; errors: string[]; seconds: number;
  source: { service: string; endpoint: string; networkCalls: number; bigg?: { metabolites: number; installed?: string; source?: string } | null };
  summary: { total: number; confident: number; doubt: number; unmapped: number; skipped: number; newIdentifiers: number; formulaSuggestions: number };
  items: AnnotationItem[];
}

export interface CurationSummary {
  accepted: number; identifiers: number; formulas: number; rejected: number;
  entries: Record<string, { mnx: string; source: 'auto' | 'user'; formula: boolean; at: string }>;
  rejectedIds: string[];
}

export interface AnnotationJob { state: 'running' | 'done' | 'error'; phase: string; done: number; total: number; startedAt: number; error: string | null }

export interface AnnotationState { job: AnnotationJob | null; analysis: AnnotationAnalysis | null; curation: CurationSummary }
