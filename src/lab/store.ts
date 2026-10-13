/**
 * COBRAGUI state. Holds the model catalog (from COBRApy), user-owned model states (pure data:
 * bound overrides + objective, with a change log and undo/redo), simulation results with full
 * provenance, and UI state (navigation history, explorer view, selection).
 *
 * No scientific computation happens here: every number shown comes from the backend.
 */
import { create } from 'zustand';
import { api, ApiError, type Health } from './api';
import { fbound, fnum, objectiveText } from './format';
import { idbGet, idbSet, lsGet, lsSet } from './persist';
import { parseResultFile } from './resultFiles';
import { buildIndex, SearchIndex } from './search';
import { edits } from './edits';
import type { BoundaryKind, MetaboliteSpec } from './editTypes';
import type {
  Annotation, AnnotationState, ApiErrorInfo, Bounds, ComparisonResult, LabMetabolite, EntityRef, ExplorerTab, LabModel, LabReaction, LabSection, LabSettings, MediumPreset,
  MetFilters, Method, Modification, ModelIndex, ModelState, Objective, RxnFilters, SavedView, SimParams, SimulationResult,
  SortSpec, StateConfig, StateSpec, TurnoverExplanation,
} from './types';

export interface LogEntry { time: number; level: 'info' | 'warn' | 'error'; text: string }

export type LabDialog =
  | { kind: 'visualize-result'; resultId: string }
  | { kind: 'visualize-comparison' }
  | { kind: 'confirm-block'; rids: string[] }
  | { kind: 'export-model' }
  | { kind: 'warnings'; code?: string }
  // structural editor (src/lab/ui/edit)
  | { kind: 'reaction-editor'; id?: string; init?: Partial<ReactionDraft> }
  | { kind: 'metabolite-editor'; id?: string; init?: Partial<MetaboliteSpec> }
  | { kind: 'boundary'; metabolite: string; type: BoundaryKind }
  | { kind: 'delete-reaction'; id: string }
  | { kind: 'delete-metabolite'; id: string }
  | { kind: 'validate-model' }
  | { kind: 'unsaved-edits' };

/** Reaction editor draft: reactants and products as positive amounts (signs are applied on save). */
export interface ReactionDraft {
  id: string; name: string; subsystem: string; lb: number | null; ub: number | null; gpr: string; objective: number;
  annotation: Annotation; rows: { key: string; met: string; amount: number; side: 'reactant' | 'product' }[];
  /** compartment used to rank metabolite search results and for new metabolites */
  compartment: string;
}

export type CompareMetric = 'delta' | 'absDelta' | 'log2fc' | 'foldchange';

/** Subsystem charts (Results and Compare share the selection, so it follows the user). */
export interface SubsysView {
  selected: string[];
  metric: 'total' | 'active' | 'mean';
  mode: 'combined' | 'separate';
  scale: 'shared' | 'independent';
  showZero: boolean;
  sort: 'magnitude' | 'name';
  hideInactive: boolean;
  /** 'list' = interactive rows; the others render a publication figure (SVG). */
  view: 'list' | 'bars' | 'heatmap' | 'pie';
  /** hide the subsystem list so the figure gets the full width */
  wide: boolean;
  /** Figure rows: one per reaction, or one per subsystem (Σ|v|). */
  level: 'reactions' | 'subsystems';
  /** Extra flux results drawn next to the open one in Results figures (ids). */
  series: string[];
  fig: FigOptions;
}

export interface FigOptions {
  widthMm: number;
  fontPt: number;
  labels: 'id' | 'name';
  values: boolean;
  divPalette: string;
  seqPalette: string;
  maxRows: number;
  /** null = automatic title; '' = no title. */
  title: string | null;
  caption: boolean;
}

interface Session {
  states: ModelState[]; activeStateId: string;
  results: SimulationResult[]; activeResultId: string | null; activeFvaId: string | null;
  favorites: string[]; savedViews: SavedView[]; mediumPresets: MediumPreset[];
}

/** Top-level workspace: COBRAGUI, Map Builder, or the Template Builder. */
export type Workspace = 'lab' | 'map' | 'templates';

export interface LabState extends Session {
  workspace: Workspace;
  backend: { status: 'checking' | 'online' | 'offline'; health?: Health };
  busy: string | null;
  importError: ApiErrorInfo | null;
  model: LabModel | null;
  index: ModelIndex | null;
  searchIndex: SearchIndex | null;
  running: {
    method: Method; startedAt: number; stateName: string; jobId: string;
    /** FVA progress from the backend (reactions with a finished interval). */
    progress?: { done: number; total: number };
    stopping?: 'discard' | 'keep';
  } | null;
  lastRun: { resultId?: string; error?: ApiErrorInfo; method?: Method; cancelled?: boolean } | null;
  section: LabSection;
  explorerTab: ExplorerTab;
  query: string;
  hideZero: boolean;
  rxnFilters: RxnFilters;
  metFilters: MetFilters;
  sort: Record<ExplorerTab, SortSpec | null>;
  selection: { reactions: string[]; metabolites: string[]; genes: string[] };
  nav: { stack: EntityRef[]; index: number };
  inspectorOpen: boolean;
  settings: LabSettings;
  compare: { aId: string | null; bId: string | null; metric: CompareMetric; result: ComparisonResult | null; loading: boolean; error: ApiErrorInfo | null };
  explain: { metabolite: string; data: TurnoverExplanation | null; loading: boolean } | null;
  objectiveEditorOpen: boolean;
  log: LogEntry[];
  logOpen: boolean;
  contextMenu: { x: number; y: number; refs: EntityRef[] } | null;
  dialog: LabDialog | null;
  simParams: SimParams;
  method: Method;
  subsys: SubsysView;
  /** Metabolite annotation analysis (MetaNetX) and the curation layer, as reported by the backend. */
  annotation: AnnotationState | null;
  annotationError: ApiErrorInfo | null;
  /** Which history Ctrl+Z walks back next: a model-state change or a structural model edit. */
  undoOrder: ('state' | 'model')[];
  redoOrder: ('state' | 'model')[];
}

const SETTINGS_KEY = 'gemsmap-lab-settings';
const LAST_KEY = 'gemsmap-lab-last';
const FIG_KEY = 'gemsmap-lab-figure';
const DEFAULT_SETTINGS: LabSettings = {
  zeroTolerance: 1e-9, pseudocount: null,
  reactionColumns: ['id', 'name', 'equation', 'lb', 'ub', 'flux', 'fvaMin', 'fvaMax'],
  defaultMethod: 'pfba', showCofactorsInNetwork: false,
};

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
export const refKey = (r: EntityRef) => `${r.kind}:${r.id}`;

export const BUILTIN_VIEWS: SavedView[] = [
  { id: 'v-active', name: 'Active reactions', tab: 'reactions', query: '', hideZero: true, rxnFilters: {}, metFilters: {}, sort: { key: 'absFlux', dir: 'desc' }, builtin: true },
  { id: 'v-high', name: 'High-flux reactions', tab: 'reactions', query: '', hideZero: true, rxnFilters: { absFluxGt: 1 }, metFilters: {}, sort: { key: 'absFlux', dir: 'desc' }, builtin: true },
  { id: 'v-exch', name: 'Exchanges', tab: 'reactions', query: '', hideZero: false, rxnFilters: { types: ['exchange'] }, metFilters: {}, sort: { key: 'flux', dir: 'asc' }, builtin: true },
  { id: 'v-transport', name: 'Transport', tab: 'reactions', query: '', hideZero: false, rxnFilters: { types: ['transport'] }, metFilters: {}, sort: null, builtin: true },
  { id: 'v-modified', name: 'Modified bounds', tab: 'reactions', query: '', hideZero: false, rxnFilters: { modifiedOnly: true }, metFilters: {}, sort: null, builtin: true },
];

function baseState(name = 'Base model'): ModelState {
  return { id: uid('st'), name, createdAt: Date.now(), bounds: {}, objective: null, changes: [], undo: [], redo: [] };
}

const emptySession = (): Session => {
  const s = baseState();
  return { states: [s], activeStateId: s.id, results: [], activeResultId: null, activeFvaId: null, favorites: [], savedViews: [], mediumPresets: [] };
};

const cfg = (s: ModelState): StateConfig => ({ bounds: s.bounds, objective: s.objective, changes: s.changes, mediumLabel: s.mediumLabel });
const sameBounds = (a: Bounds, b: Bounds) => a[0] === b[0] && a[1] === b[1];

export const useLab = create<LabState>()(() => ({
  ...emptySession(),
  // the Template Builder is never restored on start: it opens on its library, after the map has loaded
  workspace: (() => { try { const w = localStorage.getItem('gemsmap-workspace'); return w === 'map' ? 'map' : 'lab'; } catch { return 'lab'; } })(),
  backend: { status: 'checking' },
  busy: null,
  importError: null,
  model: null, index: null, searchIndex: null,
  running: null, lastRun: null,
  section: 'overview', explorerTab: 'reactions',
  query: '', hideZero: false, rxnFilters: {}, metFilters: {},
  sort: { reactions: null, metabolites: null, genes: null },
  selection: { reactions: [], metabolites: [], genes: [] },
  nav: { stack: [], index: -1 },
  inspectorOpen: true,
  settings: lsGet(SETTINGS_KEY, DEFAULT_SETTINGS),
  compare: { aId: null, bId: null, metric: 'log2fc', result: null, loading: false, error: null },
  explain: null,
  objectiveEditorOpen: false,
  log: [], logOpen: false,
  contextMenu: null, dialog: null,
  annotation: null, annotationError: null,
  undoOrder: [], redoOrder: [],
  simParams: { fractionOfOptimum: 1, loopless: false, reactions: null, pfbaFactor: null, processes: 1 },
  method: lsGet(SETTINGS_KEY, DEFAULT_SETTINGS).defaultMethod,
  subsys: {
    selected: [], metric: 'total', mode: 'combined', scale: 'shared', showZero: false, sort: 'magnitude', hideInactive: true,
    view: 'list', wide: false, level: 'reactions', series: [],
    fig: lsGet<FigOptions>(FIG_KEY, { widthMm: 183, fontPt: 7, labels: 'id', values: false, divPalette: 'blue-red', seqPalette: 'blues', maxRows: 25, title: null, caption: true }),
  },
}));

const set = useLab.setState;
const get = useLab.getState;

// ------------------------------------------------------------------ helpers (pure reads)

export const L = {
  activeState: (s: LabState = get()) => s.states.find((x) => x.id === s.activeStateId) ?? s.states[0],
  stateSpec: (st: ModelState): StateSpec => ({ id: st.id, name: st.name, bounds: st.bounds, objective: st.objective }),
  originalBounds: (r: LabReaction): Bounds => [r.lb, r.ub],
  bounds: (st: ModelState, r: LabReaction): Bounds => st.bounds[r.id] ?? [r.lb, r.ub],
  objective: (st: ModelState, s: LabState = get()): Objective =>
    st.objective ?? s.model?.summary.objective ?? { coefficients: {}, direction: 'max' },
  result: (id: string | null | undefined, s: LabState = get()) => (id ? s.results.find((r) => r.id === id) ?? null : null),
  fluxResult: (s: LabState = get()) => L.result(s.activeResultId, s),
  fvaResult: (s: LabState = get()) => L.result(s.activeFvaId, s),
  isZero: (v: number | null | undefined, s: LabState = get()) => v == null || Math.abs(v) < s.settings.zeroTolerance,
  rname: (id: string) => get().index?.rxn.get(id)?.name || id,
  mname: (id: string) => get().index?.met.get(id)?.name || id,
  /** Uptake limit shown for a boundary reaction (display only; edits go through COBRApy's medium). */
  uptakeOf: (r: LabReaction, b: Bounds) => {
    const c = r.boundaryCoefficient ?? -1;
    const v = c < 0 ? (b[0] == null ? Infinity : -b[0]) : (b[1] == null ? Infinity : b[1]);
    return Math.max(0, v);
  },
};

function log(level: LogEntry['level'], text: string) {
  set((s) => ({ log: [...s.log.slice(-400), { time: Date.now(), level, text }] }));
}

const toast = (text: string) => import('../store/store').then((m) => m.A().toast(text));

function errInfo(e: unknown): ApiErrorInfo {
  return e instanceof ApiError ? e.info : { title: 'Unexpected error', message: (e as Error)?.message ?? String(e), hints: [] };
}

// ------------------------------------------------------------------ persistence

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  const s = get();
  if (!s.model) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const t = get();
    if (!t.model) return;
    const session: Session = {
      states: t.states.map((st) => ({ ...st, undo: st.undo.slice(-30), redo: st.redo.slice(-30) })),
      activeStateId: t.activeStateId, results: t.results, activeResultId: t.activeResultId, activeFvaId: t.activeFvaId,
      favorites: t.favorites, savedViews: t.savedViews, mediumPresets: t.mediumPresets,
    };
    idbSet(`session:${t.model.checksum}`, session);
  }, 700);
}
useLab.subscribe((s, p) => {
  if (s.states !== p.states || s.results !== p.results || s.favorites !== p.favorites || s.savedViews !== p.savedViews
    || s.mediumPresets !== p.mediumPresets || s.activeStateId !== p.activeStateId || s.activeResultId !== p.activeResultId || s.activeFvaId !== p.activeFvaId) schedulePersist();
  if (s.settings !== p.settings) lsSet(SETTINGS_KEY, s.settings);
  if (s.subsys.fig !== p.subsys.fig) lsSet(FIG_KEY, { ...s.subsys.fig, title: null });
  if (s.workspace !== p.workspace) { try { localStorage.setItem('gemsmap-workspace', s.workspace); } catch { /* ignore */ } }
});

// ------------------------------------------------------------------ actions

/** Bumped by every model load request; a slower, older request (e.g. the startup restore) must not win. */
let loadGen = 0;
/** Aborts the HTTP request of the running simulation (see lab.cancelRun). */
let runAbort: AbortController | null = null;

function modifyActive(fn: (c: StateConfig, st: ModelState) => StateConfig | null) {
  const before = get().states;
  set((s) => ({
    states: s.states.map((st) => {
      if (st.id !== s.activeStateId) return st;
      const next = fn(cfg(st), st);
      if (!next) return st;
      return { ...st, ...next, undo: [...st.undo, cfg(st)].slice(-100), redo: [] };
    }),
  }));
  if (get().states !== before) set((s) => ({ undoOrder: [...s.undoOrder, 'state' as const].slice(-200), redoOrder: s.redoOrder.filter((k) => k !== 'state') }));
}

function change(kind: Modification['kind'], target: string, before: string, after: string, note?: string): Modification {
  return { id: uid('chg'), time: Date.now(), kind, target, before, after, note };
}

/** Merge bound overrides into a state config, dropping overrides equal to the model file. */
function mergeBounds(c: StateConfig, next: Record<string, Bounds>, kind: Modification['kind'], note?: string): StateConfig | null {
  const idx = get().index;
  if (!idx) return null;
  const bounds = { ...c.bounds };
  const changes: Modification[] = [];
  for (const [rid, b] of Object.entries(next)) {
    const r = idx.rxn.get(rid);
    if (!r) continue;
    const prev = bounds[rid] ?? [r.lb, r.ub];
    if (sameBounds(prev, b)) continue;
    if (sameBounds(b, [r.lb, r.ub])) delete bounds[rid]; else bounds[rid] = b;
    const parts: [string, string][] = [];
    if (prev[0] !== b[0]) parts.push([`LB ${fbound(prev[0], 'lower')}`, `${fbound(b[0], 'lower')}`]);
    if (prev[1] !== b[1]) parts.push([`UB ${fbound(prev[1], 'upper')}`, `${fbound(b[1], 'upper')}`]);
    for (const [bf, af] of parts) changes.push(change(kind, rid, bf, af, note));
  }
  if (!changes.length) return null;
  return { ...c, bounds, changes: [...c.changes, ...changes] };
}

export const lab = {
  log,

  // ---------------------------------------------------------------- backend & model
  async checkBackend(quiet = false) {
    if (!quiet) set({ backend: { status: 'checking' } });
    try {
      const health = await api.health();
      set({ backend: { status: 'online', health } });
      return true;
    } catch {
      set({ backend: { status: 'offline' } });
      return false;
    }
  },

  async boot() {
    // The backend is often started after the page: keep retrying quietly until it answers.
    let ok = await lab.checkBackend();
    while (!ok) {
      await new Promise((r) => setTimeout(r, 3000));
      ok = await lab.checkBackend(true);
    }
    // the app always opens clean: the last model is reopened only on request (start-up banner → restoreLast)
  },

  /** Last model opened in COBRAGUI (shown by the start-up banner), or null. */
  lastModel(): { modelId: string; name?: string } | null {
    const last = lsGet<{ modelId?: string; name?: string }>(LAST_KEY, {});
    return last.modelId ? { modelId: last.modelId, name: last.name } : null;
  },

  /** Reopen the last COBRAGUI model from the backend (it keeps the imported models). */
  async restoreLast() {
    if (get().model) return;
    const last = lsGet<{ modelId?: string }>(LAST_KEY, {});
    if (!last.modelId) return;
    set({ busy: 'Restoring last model…' });
    try {
      const gen = ++loadGen;
      const m = await api.getModel(last.modelId);
      if (gen === loadGen) await lab.setModel(m, true, gen);
    } catch (e) {
      log('warn', `Could not restore last model: ${errInfo(e).message}`);
    } finally {
      set({ busy: null });
    }
  },

  async importFile(file: File, force = false) {
    if (!force && edits.guardUnsaved(() => lab.importFile(file, true))) return;
    set({ busy: `Importing ${file.name}… (COBRApy is reading and validating the model)`, importError: null });
    log('info', `Import started: ${file.name} (${(file.size / 1e6).toFixed(1)} MB)`);
    try {
      const gen = ++loadGen;
      const m = await api.importModel(file);
      if (gen === loadGen) await lab.setModel(m, false, gen);
    } catch (e) {
      const info = errInfo(e);
      set({ importError: info });
      log('error', `Import failed: ${info.title} ${info.message}`);
    } finally {
      set({ busy: null });
    }
  },

  async importExample(name: string, force = false) {
    if (!force && edits.guardUnsaved(() => lab.importExample(name, true))) return;
    set({ busy: 'Loading example model…', importError: null });
    try {
      const gen = ++loadGen;
      const m = await api.importExample(name);
      if (gen === loadGen) await lab.setModel(m, false, gen);
    } catch (e) {
      set({ importError: errInfo(e) });
    } finally {
      set({ busy: null });
    }
  },

  async setModel(model: LabModel, restored = false, gen = ++loadGen) {
    const index = buildIndex(model);
    const searchIndex = new SearchIndex(model, index);
    const saved = await idbGet<Session>(`session:${model.checksum}`);
    if (gen !== loadGen) return; // a newer load started while the session was being read
    const session = saved?.states?.length ? { ...emptySession(), ...saved } : emptySession();
    set({
      model, index, searchIndex, ...session,
      section: restored ? get().section : 'overview',
      selection: { reactions: [], metabolites: [], genes: [] },
      nav: { stack: [], index: -1 }, query: '', rxnFilters: {}, metFilters: {},
      compare: { ...get().compare, aId: null, bId: null, result: null, error: null },
      explain: null, lastRun: null,
      subsys: { ...get().subsys, selected: [], series: [] },
      annotation: null, annotationError: null,
      undoOrder: [], redoOrder: [],
    });
    lsSet(LAST_KEY, { modelId: model.id, name: model.name || model.filename });
    const w = model.warnings.filter((x) => x.level !== 'info').length;
    log('info', `Model ${restored ? 'restored' : 'imported'}: ${model.filename} — ${model.summary.reactions} reactions, ${model.summary.metabolites} metabolites, ${model.summary.genes} genes`);
    if (!restored) {
      log('info', `Validation completed: ${model.warnings.length} notes${w ? ` (${w} warnings)` : ''}`);
      toast(`Model imported: ${model.name}`);
    }
    if (saved?.states?.length) log('info', `Session restored: ${session.states.length} states, ${session.results.length} results`);
  },

  /**
   * Import results from JSON / CSV / TSV files into the current model's result history. Values are
   * kept as in the file. Turnover and exchanges are only computed (by COBRApy, with the loaded model)
   * when the file has none, does not name a different model, and ≥ 95 % of its ids exist in the loaded model.
   */
  async importResults(files: File[]) {
    const s = get();
    if (!s.model || !s.index) return toast('Load a model first: imported results are compared by reaction id against it');
    const model = s.model, index = s.index;
    const imported: SimulationResult[] = [];
    let otherModel = 0;
    for (const f of files) {
      try {
        const { results, notes } = parseResultFile(f.name, await f.text());
        for (const n of notes) log('info', `${f.name}: ${n}`);
        for (const r of results) {
          const ids = Object.keys(r.reactionFluxes ?? r.fva ?? {});
          const matched = ids.filter((id) => index.rxn.has(id)).length;
          const cs = r.metadata.model.checksum;
          const sameModel = !!cs && model.checksum.startsWith(cs);
          if (cs && !sameModel) otherModel++;
          r.modelId = model.id;
          r.origin = { ...r.origin!, matched, total: ids.length };
          // Derive only for this model: a file that names another model may use different stoichiometry.
          if (r.reactionFluxes && (!r.metaboliteTurnover || !r.exchanges) && (!cs || sameModel) && ids.length && matched / ids.length >= 0.95) {
            try {
              const d = await api.derive(model.id, r.reactionFluxes);
              if (!r.metaboliteTurnover) r.metaboliteTurnover = d.metaboliteTurnover;
              if (!r.exchanges) r.exchanges = d.exchanges;
              r.origin.derivedWith = model.filename;
            } catch (e) {
              log('warn', `${r.name}: turnover not derived — ${errInfo(e).message}`);
            }
          }
          imported.push(r);
          log('info', `Imported “${r.name}” from ${f.name}: ${matched}/${ids.length} reaction ids in ${model.filename}${r.origin.derivedWith ? ' · turnover/exchanges derived with this model' : ''}`);
        }
      } catch (e) {
        const msg = (e as Error).message;
        log('error', `Could not import ${f.name}: ${msg}`);
        toast(`Could not import ${f.name}: ${msg}`);
      }
    }
    if (!imported.length) return;
    set((t) => ({ results: [...t.results, ...imported], lastRun: { resultId: imported[imported.length - 1].id }, section: 'results' }));
    toast(`Imported ${imported.length} result${imported.length > 1 ? 's' : ''}${otherModel ? ` · ${otherModel} from another model (compared by reaction id)` : ''}`);
  },

  closeModel(force = false) {
    if (!force && edits.guardUnsaved(() => lab.closeModel(true))) return;
    lsSet(LAST_KEY, {});
    set({ model: null, index: null, searchIndex: null, ...emptySession(), section: 'overview', nav: { stack: [], index: -1 } });
  },

  // ---------------------------------------------------------------- states
  setActiveState(id: string) {
    set({ activeStateId: id });
    log('info', `Active state: ${get().states.find((s) => s.id === id)?.name}`);
  },
  newState(name?: string) {
    const st = baseState(name ?? `State ${get().states.length + 1}`);
    set((s) => ({ states: [...s.states, st], activeStateId: st.id }));
    return st.id;
  },
  duplicateState(id?: string) {
    const src = get().states.find((s) => s.id === (id ?? get().activeStateId));
    if (!src) return;
    const st: ModelState = { ...src, id: uid('st'), name: `${src.name} copy`, createdAt: Date.now(), parentId: src.id, undo: [], redo: [] };
    set((s) => ({ states: [...s.states, st], activeStateId: st.id }));
    log('info', `State duplicated: ${src.name} → ${st.name}`);
    return st.id;
  },
  renameState(id: string, name: string) {
    if (!name.trim()) return;
    set((s) => ({ states: s.states.map((st) => (st.id === id ? { ...st, name: name.trim() } : st)) }));
  },
  deleteState(id: string) {
    const s = get();
    if (s.states.length <= 1) return toast('A model needs at least one state');
    const states = s.states.filter((x) => x.id !== id);
    set({ states, activeStateId: s.activeStateId === id ? states[0].id : s.activeStateId });
  },
  stateFromResult(resultId: string) {
    const r = L.result(resultId);
    if (!r?.stateSnapshot) return toast('This result has no stored configuration');
    const st: ModelState = { ...baseState(`${r.metadata.state.name} (from ${r.metadata.methodLabel})`), bounds: { ...r.stateSnapshot.bounds }, objective: r.stateSnapshot.objective };
    set((s) => ({ states: [...s.states, st], activeStateId: st.id }));
    toast(`Created state “${st.name}” from the result's exact configuration`);
  },

  // ---------------------------------------------------------------- modifications
  setBounds(rid: string, b: Bounds, note?: string) {
    if (b[0] != null && b[1] != null && b[0] > b[1]) return toast(`Lower bound (${fnum(b[0])}) must not exceed upper bound (${fnum(b[1])})`);
    modifyActive((c) => mergeBounds(c, { [rid]: b }, 'bounds', note));
  },
  setBoundsBulk(next: Record<string, Bounds>, note: string) {
    modifyActive((c) => {
      const r = mergeBounds(c, next, 'bulk', note);
      if (r) log('info', `${note}: ${Object.keys(next).length} reactions`);
      return r;
    });
  },
  resetBounds(rids: string[]) {
    const idx = get().index;
    if (!idx) return;
    const next: Record<string, Bounds> = {};
    for (const rid of rids) { const r = idx.rxn.get(rid); if (r) next[rid] = [r.lb, r.ub]; }
    modifyActive((c) => mergeBounds(c, next, rids.length > 1 ? 'bulk' : 'bounds', 'Reset to model file'));
  },
  blockReactions(rids: string[]) {
    const next: Record<string, Bounds> = {};
    for (const r of rids) next[r] = [0, 0];
    if (rids.length === 1) lab.setBounds(rids[0], [0, 0], 'Blocked');
    else lab.setBoundsBulk(next, 'Blocked reactions');
  },
  allowReversible(rid: string) {
    const m = get().index?.maxBound ?? 1000;
    lab.setBounds(rid, [-m, m], 'Allowed reversible');
  },
  setObjective(o: Objective | null) {
    const s = get();
    const st = L.activeState(s);
    const before = objectiveText(L.objective(st, s));
    const modelObj = s.model?.summary.objective;
    const normalized = o && modelObj && JSON.stringify(o) === JSON.stringify(modelObj) ? null : o;
    const after = objectiveText(normalized ?? modelObj);
    if (before === after) return;
    modifyActive((c) => ({ ...c, objective: normalized, changes: [...c.changes, change('objective', 'Objective', before, after)] }));
    log('info', `Objective changed: ${after}`);
  },
  setObjectiveReaction(rid: string) {
    lab.setObjective({ coefficients: { [rid]: 1 }, direction: L.objective(L.activeState()).direction });
    toast(`Objective: maximize ${rid}`);
  },
  applyMediumBounds(bounds: Record<string, Bounds>, label: string, note: string) {
    modifyActive((c) => {
      const r = mergeBounds(c, bounds, 'medium', note);
      return r ? { ...r, mediumLabel: label } : null;
    });
    log('info', `Medium modified: ${note}`);
  },
  /** Ctrl+Z: the most recent change, whether a model-state change (bounds, objective, medium) or a structural edit. */
  undo() {
    const s = get();
    const canState = !!L.activeState(s).undo.length;
    const canModel = !!(s.model as { edits?: { count: number } } | null)?.edits?.count;
    const last = s.undoOrder[s.undoOrder.length - 1];
    const kind = last === 'model' && canModel ? 'model' : last === 'state' && canState ? 'state' : canState ? 'state' : canModel ? 'model' : null;
    if (!kind) return;
    set((t) => ({ undoOrder: t.undoOrder.slice(0, -1), redoOrder: [...t.redoOrder, kind] }));
    if (kind === 'model') { edits.undo(); return; }
    set((t) => ({
      states: t.states.map((st) => (st.id === t.activeStateId && st.undo.length
        ? { ...st, ...st.undo[st.undo.length - 1], undo: st.undo.slice(0, -1), redo: [cfg(st), ...st.redo] } : st)),
    }));
  },
  redo() {
    const s = get();
    const canState = !!L.activeState(s).redo.length;
    const canModel = !!(s.model as { edits?: { redo: unknown[] } } | null)?.edits?.redo.length;
    const last = s.redoOrder[s.redoOrder.length - 1];
    const kind = last === 'model' && canModel ? 'model' : last === 'state' && canState ? 'state' : canState ? 'state' : canModel ? 'model' : null;
    if (!kind) return;
    set((t) => ({ redoOrder: t.redoOrder.slice(0, -1), undoOrder: [...t.undoOrder, kind] }));
    if (kind === 'model') { edits.redo(); return; }
    set((t) => ({
      states: t.states.map((st) => (st.id === t.activeStateId && st.redo.length
        ? { ...st, ...st.redo[0], redo: st.redo.slice(1), undo: [...st.undo, cfg(st)] } : st)),
    }));
  },
  resetState() {
    modifyActive((c) => (Object.keys(c.bounds).length || c.objective
      ? { bounds: {}, objective: null, mediumLabel: undefined, changes: [...c.changes, change('reset', 'Model', 'modified', 'model file')] } : null));
    log('info', 'State reset to the model file');
  },

  // ---------------------------------------------------------------- simulation
  async simulate(method: Method = get().method, overrides: Partial<SimParams> = {}) {
    const s = get();
    if (!s.model || s.running) return;
    const st = L.activeState(s);
    const params = { ...s.simParams, ...overrides };
    const spec = L.stateSpec(st);
    const jobId = uid('job');
    const abort = new AbortController();
    runAbort = abort;
    set({ running: { method, startedAt: Date.now(), stateName: st.name, jobId }, method, lastRun: null });
    log('info', `${method.toUpperCase()} started on “${st.name}”${method === 'fva' && params.reactions ? ` (${params.reactions.length} reactions)` : ''}`);
    // FVA reports how many intervals are done; polled off the solver thread
    const poll = method === 'fva' ? setInterval(async () => {
      try {
        const j = await api.job(jobId);
        set((t) => (t.running?.jobId === jobId && j.total ? { running: { ...t.running, progress: { done: j.done, total: j.total } } } : {}));
      } catch { /* finished or not started yet */ }
    }, 500) : null;
    try {
      const res = await api.simulate(s.model.id, method, spec, params, { jobId, signal: abort.signal });
      const r: SimulationResult = { ...res, modelStateId: st.id, stateSnapshot: JSON.parse(JSON.stringify(spec)), createdAt: Date.now() };
      const optimal = r.solverStatus === 'optimal';
      set((t) => ({
        results: [...t.results, r],
        activeResultId: optimal && r.method !== 'fva' ? r.id : t.activeResultId,
        activeFvaId: optimal && r.method === 'fva' ? r.id : t.activeFvaId,
        lastRun: { resultId: r.id, method },
      }));
      log(optimal ? 'info' : 'warn', `Solver ${r.solverStatus} — ${r.name}${optimal ? ` · objective ${fnum(r.objectiveValue)}` : ''} (${r.metadata.elapsedSeconds.toFixed(2)} s)`);
      if (r.metadata.partial) log('warn', `FVA stopped early: intervals kept for ${r.metadata.partial.done} of ${r.metadata.partial.total} reactions`);
      if (optimal) log('info', 'Result saved');
      return r;
    } catch (e) {
      const info = errInfo(e);
      if ((info.detail as { cancelled?: boolean } | undefined)?.cancelled) {
        set({ lastRun: { cancelled: true, method } });
        log('warn', `${method.toUpperCase()} cancelled — nothing was saved`);
      } else {
        set({ lastRun: { error: info, method } });
        log('error', `${method.toUpperCase()} failed: ${info.title} ${info.message}`);
      }
    } finally {
      if (poll) clearInterval(poll);
      if (runAbort === abort) runAbort = null;
      set((t) => (t.running?.jobId === jobId ? { running: null } : {}));
    }
  },
  /**
   * Stop the running simulation. FVA stops between chunks of reactions; with keep = true it returns
   * the intervals already computed. A single FBA/pFBA/loopless solve cannot be interrupted inside the
   * solver: the request is dropped now and the backend discards the answer when the solver returns.
   */
  async cancelRun(keep = false) {
    const r = get().running;
    if (!r || r.stopping) return;
    set({ running: { ...r, stopping: keep ? 'keep' : 'discard' } });
    try { await api.cancelJob(r.jobId, keep); } catch { /* the run may have just finished */ }
    if (!keep) runAbort?.abort();
  },
  selectResult(id: string) {
    const r = L.result(id);
    if (!r) return;
    if (r.solverStatus !== 'optimal') return set({ lastRun: { resultId: id } });
    if (r.method === 'fva') set({ activeFvaId: id }); else set({ activeResultId: id });
  },
  renameResult(id: string, name: string) {
    if (!name.trim()) return;
    set((s) => ({ results: s.results.map((r) => (r.id === id ? { ...r, name: name.trim() } : r)) }));
  },
  deleteResult(id: string) {
    set((s) => ({
      results: s.results.filter((r) => r.id !== id),
      activeResultId: s.activeResultId === id ? null : s.activeResultId,
      activeFvaId: s.activeFvaId === id ? null : s.activeFvaId,
      compare: { ...s.compare, aId: s.compare.aId === id ? null : s.compare.aId, bId: s.compare.bId === id ? null : s.compare.bId },
    }));
  },

  // ---------------------------------------------------------------- comparison
  async runCompare() {
    const s = get();
    const a = L.result(s.compare.aId), b = L.result(s.compare.bId);
    if (!a || !b) return;
    set({ compare: { ...s.compare, loading: true, error: null }, explain: null });
    try {
      const result = await api.compare(a, b, s.settings.zeroTolerance, s.settings.pseudocount);
      set((t) => ({ compare: { ...t.compare, result, loading: false } }));
      log('info', `Compared ${a.name} vs ${b.name}`);
    } catch (e) {
      set((t) => ({ compare: { ...t.compare, loading: false, error: errInfo(e) } }));
    }
  },
  async explainTurnover(metabolite: string) {
    const s = get();
    const a = L.result(s.compare.aId), b = L.result(s.compare.bId);
    if (!s.model || !a?.reactionFluxes || !b?.reactionFluxes) return;
    set({ explain: { metabolite, data: null, loading: true } });
    try {
      const data = await api.explainTurnover(s.model.id, metabolite, a.reactionFluxes, b.reactionFluxes, s.settings.zeroTolerance);
      set({ explain: { metabolite, data, loading: false } });
    } catch (e) {
      set({ explain: null });
      toast(errInfo(e).title);
    }
  },

  // ---------------------------------------------------------------- navigation
  navigate(ref: EntityRef) {
    set((s) => {
      const cur = s.nav.stack[s.nav.index];
      if (cur && cur.kind === ref.kind && cur.id === ref.id) return { inspectorOpen: true };
      const stack = [...s.nav.stack.slice(0, s.nav.index + 1), ref].slice(-60);
      return { nav: { stack, index: stack.length - 1 }, inspectorOpen: true };
    });
  },
  back() { set((s) => (s.nav.index > 0 ? { nav: { ...s.nav, index: s.nav.index - 1 } } : {})); },
  forward() { set((s) => (s.nav.index < s.nav.stack.length - 1 ? { nav: { ...s.nav, index: s.nav.index + 1 } } : {})); },
  goTo(i: number) { set((s) => ({ nav: { ...s.nav, index: Math.max(0, Math.min(s.nav.stack.length - 1, i)) } })); },
  current(): EntityRef | null { const s = get(); return s.nav.stack[s.nav.index] ?? null; },

  // ---------------------------------------------------------------- explorer view
  setSection(section: LabSection) { set({ section }); },

  // ---------------------------------------------------------------- metabolite annotation (MetaNetX)
  /** Replace curated metabolite rows (annotation / formula changed in the backend) and rebuild the indexes. */
  patchMetabolites(rows: LabMetabolite[]) {
    const m = get().model;
    if (!m || !rows.length) return;
    const by = new Map(rows.map((r) => [r.id, r]));
    const model = { ...m, metabolites: m.metabolites.map((x) => by.get(x.id) ?? x) };
    const index = buildIndex(model);
    set({ model, index, searchIndex: new SearchIndex(model, index) });
  },
  async loadAnnotation() {
    const m = get().model;
    if (!m) return;
    try { set({ annotation: await api.annotation(m.id), annotationError: null }); } catch (e) { set({ annotationError: errInfo(e) }); }
  },
  async analyzeAnnotation(opts: { useNames: boolean; autoApply: boolean; fillFormulas: boolean }) {
    const m = get().model;
    if (!m) return;
    try {
      const job = await api.analyzeAnnotation(m.id, opts);
      set({ annotation: { ...(get().annotation ?? { analysis: null, curation: { accepted: 0, identifiers: 0, formulas: 0, rejected: 0, entries: {}, rejectedIds: [] } }), job }, annotationError: null });
      log('info', 'Metabolite analysis started (MetaNetX)');
      for (;;) {
        await new Promise((r) => setTimeout(r, 800));
        if (get().model?.id !== m.id) return;
        const poll = await api.annotation(m.id, false);
        set({ annotation: { ...poll, analysis: get().annotation?.analysis ?? null } });
        if (poll.job?.state !== 'running') {
          const st = await api.annotation(m.id);
          set({ annotation: st });
          if (st.job?.state === 'error') { set({ annotationError: { title: 'Metabolite analysis failed', message: st.job.error ?? '', hints: ['Check the internet connection: MetaNetX is queried at rdf.metanetx.org'] } }); return; }
          if (st.curation.accepted) lab.patchMetabolites(await api.metabolites(m.id));
          const s = st.analysis?.summary;
          if (s) log('info', `Metabolite analysis: ${s.confident} confident, ${s.doubt} to review, ${s.unmapped} unmapped · ${st.curation.accepted} curated`);
          return;
        }
      }
    } catch (e) {
      set({ annotationError: errInfo(e) });
    }
  },
  async curate(kind: 'apply' | 'reject' | 'revert', arg: { id: string; mnx?: string; fillFormula?: boolean }[] | string[] | null) {
    const m = get().model;
    if (!m) return;
    try {
      const r = kind === 'apply' ? await api.applyAnnotation(m.id, arg as { id: string; mnx?: string; fillFormula?: boolean }[])
        : kind === 'reject' ? await api.rejectAnnotation(m.id, arg as string[])
        : await api.revertAnnotation(m.id, arg as string[] | null);
      lab.patchMetabolites(r.metabolites);
      const cur = get().annotation;
      if (cur) set({ annotation: { ...cur, curation: r.curation } });
    } catch (e) {
      set({ annotationError: errInfo(e) });
    }
  },
  setTab(tab: ExplorerTab) { set({ explorerTab: tab, section: 'explore' }); },
  showInExplorer(tab: ExplorerTab, ids: string[], label: string) {
    if (tab === 'reactions') set({ rxnFilters: { ids: { label, ids } } });
    else if (tab === 'metabolites') set({ metFilters: { ids: { label, ids } } });
    set({ explorerTab: tab, section: 'explore', query: '', hideZero: false });
  },
  setSort(tab: ExplorerTab, sort: SortSpec | null) { set((s) => ({ sort: { ...s.sort, [tab]: sort } })); },
  toggleFavorite(ref: EntityRef) {
    const k = refKey(ref);
    set((s) => ({ favorites: s.favorites.includes(k) ? s.favorites.filter((x) => x !== k) : [...s.favorites, k] }));
  },
  saveView(name: string) {
    const s = get();
    const v: SavedView = { id: uid('view'), name, tab: s.explorerTab, query: s.query, hideZero: s.hideZero, rxnFilters: s.rxnFilters, metFilters: s.metFilters, sort: s.sort[s.explorerTab] };
    set({ savedViews: [...s.savedViews, v] });
    toast(`Saved view “${name}”`);
  },
  applyView(v: SavedView) {
    set((s) => ({ explorerTab: v.tab, section: 'explore', query: v.query, hideZero: v.hideZero, rxnFilters: v.rxnFilters, metFilters: v.metFilters, sort: { ...s.sort, [v.tab]: v.sort } }));
  },
  deleteView(id: string) { set((s) => ({ savedViews: s.savedViews.filter((v) => v.id !== id) })); },
  setSelection(kind: 'reactions' | 'metabolites' | 'genes', ids: string[]) { set((s) => ({ selection: { ...s.selection, [kind]: ids } })); },
  clearSelection() { set({ selection: { reactions: [], metabolites: [], genes: [] } }); },
  setSettings(p: Partial<LabSettings>) { set((s) => ({ settings: { ...s.settings, ...p } })); },

  // ---------------------------------------------------------------- medium presets (per model)
  saveMediumPreset(name: string, medium: Record<string, number>) {
    set((s) => ({ mediumPresets: [...s.mediumPresets, { id: uid('med'), name, medium }] }));
    toast(`Saved medium preset “${name}”`);
  },
  deleteMediumPreset(id: string) { set((s) => ({ mediumPresets: s.mediumPresets.filter((p) => p.id !== id) })); },

  setWorkspace(w: Workspace) { set({ workspace: w }); },
  setSubsys(p: Partial<SubsysView>) { set((s) => ({ subsys: { ...s.subsys, ...p } })); },
  setFig(p: Partial<FigOptions>) { set((s) => ({ subsys: { ...s.subsys, fig: { ...s.subsys.fig, ...p } } })); },
  toggleSubsystem(key: string) {
    set((s) => ({ subsys: { ...s.subsys, selected: s.subsys.selected.includes(key) ? s.subsys.selected.filter((k) => k !== key) : [...s.subsys.selected, key] } }));
  },
};
