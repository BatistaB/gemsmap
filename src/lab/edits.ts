/**
 * Structural edits in COBRAGUI. The backend applies every edit to the real cobra.Model (the one
 * used by FBA, FVA, the medium and exports) and answers with the rows that changed; this module patches
 * the frontend copy of the catalog, rebuilds the indexes and keeps the rest of the Lab consistent:
 * model states (bound overrides and objectives follow renamed reactions and drop removed ones),
 * selection, inspector history and favorites. Nothing here computes science.
 */
import { api, ApiError } from './api';
import type { EditHistory, EditOp, EditReport, EditResponse } from './editTypes';
import { buildIndex, SearchIndex } from './search';
import { lab, useLab } from './store';
import type { ApiErrorInfo, EntityRef, LabModel, ModelState } from './types';

const toast = (text: string) => import('../store/store').then((m) => m.A().toast(text));
const errInfo = (e: unknown): ApiErrorInfo => (e instanceof ApiError ? e.info : { title: 'Unexpected error', message: (e as Error)?.message ?? String(e), hints: [] });

/** The edit history that came with the catalog (GET /models/{id}). */
export const historyOf = (m: LabModel | null): EditHistory | null => (m as (LabModel & { edits?: EditHistory }) | null)?.edits ?? null;

let pendingAfterPrompt: (() => void) | null = null;

export const edits = {
  /** Validate without changing anything (errors, warnings, duplicates, balance). */
  async check(ops: EditOp[]): Promise<EditReport | null> {
    const m = useLab.getState().model;
    if (!m) return null;
    try { return await api.checkEdits(m.id, ops); } catch (e) { return { errors: [errInfo(e).title + (errInfo(e).message ? `: ${errInfo(e).message}` : '')], warnings: [], info: [], items: [] }; }
  },

  /** Apply one transaction. Returns null on success, or the validation report / error that refused it. */
  async commit(ops: EditOp[], label?: string): Promise<{ ok: true; report: EditReport } | { ok: false; report?: EditReport; error: ApiErrorInfo }> {
    const m = useLab.getState().model;
    if (!m) return { ok: false, error: { title: 'No model loaded', message: '', hints: [] } };
    try {
      const res = await api.commitEdits(m.id, ops, label);
      if (res.history.count === historyOf(m)?.count && !res.delta.reactions.upsert.length && !res.delta.metabolites.upsert.length) {
        toast('No change');
        return { ok: true, report: res.report };
      }
      edits.apply(res);
      useLab.setState((s) => ({ undoOrder: [...s.undoOrder, 'model'], redoOrder: [] }));
      const last = res.history.items[res.history.items.length - 1];
      if (last) toast(last.label);
      return { ok: true, report: res.report };
    } catch (e) {
      const info = errInfo(e);
      return { ok: false, error: info, report: (info.detail as EditReport | undefined)?.errors ? (info.detail as EditReport) : undefined };
    }
  },

  async undo() {
    const m = useLab.getState().model;
    if (!m || !historyOf(m)?.count) return false;
    try {
      const label = historyOf(m)!.items[historyOf(m)!.items.length - 1]?.label;
      edits.apply(await api.undoEdit(m.id));
      toast(`Undone: ${label}`);
      return true;
    } catch (e) { toast(errInfo(e).title); return false; }
  },

  async redo() {
    const m = useLab.getState().model;
    if (!m || !historyOf(m)?.redo.length) return false;
    try {
      const label = historyOf(m)!.redo[0]?.label;
      edits.apply(await api.redoEdit(m.id));
      toast(`Redone: ${label}`);
      return true;
    } catch (e) { toast(errInfo(e).title); return false; }
  },

  async discard() {
    const m = useLab.getState().model;
    if (!m) return;
    try {
      edits.apply(await api.discardEdits(m.id));
      useLab.setState((s) => ({ undoOrder: s.undoOrder.filter((k) => k !== 'model'), redoOrder: s.redoOrder.filter((k) => k !== 'model') }));
      toast('Model edits discarded — the model is the imported file again');
    } catch (e) { toast(errInfo(e).title); }
  },

  async exportPatch() {
    const m = useLab.getState().model;
    if (!m) return;
    try {
      const { blob, filename } = await api.editPatch(m.id);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast(errInfo(e).title); }
  },

  /** Patch the catalog with the backend's delta and keep states, selection and navigation consistent. */
  apply(res: EditResponse) {
    const s = useLab.getState();
    const m = s.model;
    if (!m) return;
    const d = res.delta;
    const patchRows = <T extends { id: string }>(rows: T[], upsert: T[], remove: string[]) => {
      const gone = new Set(remove);
      const up = new Map(upsert.map((x) => [x.id, x]));
      const out = rows.filter((x) => !gone.has(x.id)).map((x) => up.get(x.id) ?? x);
      const have = new Set(out.map((x) => x.id));
      for (const x of upsert) if (!have.has(x.id)) out.push(x);
      return out;
    };
    const model: LabModel & { edits?: EditHistory } = {
      ...m,
      reactions: patchRows(m.reactions, d.reactions.upsert, d.reactions.remove),
      metabolites: patchRows(m.metabolites, d.metabolites.upsert, d.metabolites.remove),
      genes: patchRows(m.genes, d.genes.upsert, d.genes.remove),
      summary: d.summary, compartments: d.compartments, warnings: d.warnings, medium: d.medium,
      edits: res.history,
    };
    const index = buildIndex(model);
    const rn = res.renamed.reactions, mn = res.renamed.metabolites;
    const mapRxn = (id: string) => (id in rn ? rn[id] : id);
    const remapState = (st: ModelState): ModelState => {
      if (!Object.keys(rn).length) return st;
      const bounds: ModelState['bounds'] = {};
      for (const [k, v] of Object.entries(st.bounds)) { const to = mapRxn(k); if (to) bounds[to] = v; }
      let objective = st.objective;
      if (objective) {
        const coefficients: Record<string, number> = {};
        for (const [k, v] of Object.entries(objective.coefficients)) { const to = mapRxn(k); if (to) coefficients[to] = v; }
        objective = Object.keys(coefficients).length ? { ...objective, coefficients } : null;
      }
      return { ...st, bounds, objective };
    };
    const mapRef = (r: EntityRef): EntityRef | null => {
      const table = r.kind === 'reaction' ? rn : r.kind === 'metabolite' ? mn : null;
      if (!table || !(r.id in table)) return r;
      return table[r.id] ? { ...r, id: table[r.id]! } : null;
    };
    const stack: EntityRef[] = [];
    let at = s.nav.index;
    s.nav.stack.forEach((r, i) => { const x = mapRef(r); if (x) stack.push(x); else if (i <= s.nav.index) at--; });
    const fav = s.favorites.map((k) => { const [kind, ...rest] = k.split(':'); const x = mapRef({ kind: kind as EntityRef['kind'], id: rest.join(':') }); return x ? `${x.kind}:${x.id}` : null; }).filter((x): x is string => !!x);
    const dropped = s.states.flatMap((st) => Object.keys(st.bounds).filter((k) => k in rn && !rn[k]).map((k) => `${st.name}: ${k}`));
    useLab.setState({
      model, index, searchIndex: new SearchIndex(model, index),
      states: s.states.map(remapState),
      selection: {
        reactions: s.selection.reactions.map(mapRxn).filter((x): x is string => !!x),
        metabolites: s.selection.metabolites.map((x) => (x in mn ? mn[x] : x)).filter((x): x is string => !!x),
        genes: s.selection.genes.filter((g) => index.gene.has(g)),
      },
      nav: { stack, index: Math.max(-1, Math.min(stack.length - 1, at)) },
      favorites: fav,
    });
    const h = res.history;
    if (dropped.length) lab.log('warn', `Bound overrides of removed reactions dropped from the states (${dropped.slice(0, 6).join(', ')}${dropped.length > 6 ? '…' : ''})`);
    lab.log('info', `Model structure: ${model.summary.reactions} reactions, ${model.summary.metabolites} metabolites · ${h.count} edit${h.count === 1 ? '' : 's'}`);
  },

  /** Ask before leaving a model with edits that were never written to a file. */
  guardUnsaved(next: () => void): boolean {
    const h = historyOf(useLab.getState().model);
    if (!h?.dirty) return false;
    pendingAfterPrompt = next;
    useLab.setState({ dialog: { kind: 'unsaved-edits' } });
    return true;
  },
  continuePending() {
    const f = pendingAfterPrompt;
    pendingAfterPrompt = null;
    f?.();
  },
  dropPending() { pendingAfterPrompt = null; },
};
