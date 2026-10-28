/** REST client for the COBRApy backend (proxied by Vite at /api → http://127.0.0.1:8765). */
import type {
  AnnotationJob, AnnotationState, ApiErrorInfo, ComparisonResult, CurationSummary, LabMetabolite, LabModel, MediumTable, Method, SimParams, SimulationResult, StateSpec, TurnoverExplanation,
} from './types';
import type { EditHistory, EditOp, EditReport, EditResponse, ExternalCompound, ValidationReport } from './editTypes';

const BASE = (import.meta.env?.VITE_COBRA_API as string | undefined) ?? '/api';

export class ApiError extends Error {
  info: ApiErrorInfo;
  constructor(info: ApiErrorInfo) {
    super(info.message ? `${info.title}: ${info.message}` : info.title);
    this.info = info;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ApiError({ title: 'Simulation cancelled', message: '', hints: [], status: 499, detail: { cancelled: true } });
    throw new ApiError({ title: 'COBRApy backend unreachable', message: (e as Error).message, hints: ['Start GEMsMAP: run gemsmap in a terminal and keep it open', 'Development checkout: npm run backend (it listens on http://127.0.0.1:8765)'], status: 0 });
  }
  if (!res.ok) {
    let info: ApiErrorInfo = { title: `Backend error ${res.status}`, message: res.statusText, hints: [], status: res.status };
    try {
      const j = await res.json();
      if (j?.error) info = { ...j.error, status: res.status };
      else if (j?.detail) info.message = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch { /* not JSON (e.g. proxy error page) */ }
    if (res.status === 502 || res.status === 504) info = { title: 'COBRApy backend unreachable', message: 'The Vite proxy could not reach the backend.', hints: ['Development checkout: start the backend with npm run backend'], status: res.status };
    throw new ApiError(info);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function download(path: string, body: unknown): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(BASE + path, json('POST', body));
  if (!res.ok) {
    let info: ApiErrorInfo = { title: `Export failed (${res.status})`, message: '', hints: [] };
    try { const j = await res.json(); if (j?.error) info = j.error; } catch { /* ignore */ }
    throw new ApiError(info);
  }
  const cd = res.headers.get('Content-Disposition') ?? '';
  const filename = cd.match(/filename="([^"]+)"/)?.[1] ?? 'export';
  return { blob: await res.blob(), filename };
}

export interface Health { status: string; version: string; cobraVersion: string; solvers: string[]; defaultSolver: string; python?: string; platform?: string }

export const api = {
  health: () => request<Health>('/health'),
  examples: () => request<{ name: string; label: string }[]>('/examples'),
  importModel: (file: File) => { const fd = new FormData(); fd.append('file', file); return request<LabModel>('/models/import', { method: 'POST', body: fd }); },
  importExample: (name: string) => request<LabModel>(`/models/examples/${name}`, { method: 'POST' }),
  getModel: (id: string) => request<LabModel>(`/models/${id}`),
  medium: (id: string, state: StateSpec) => request<MediumTable>(`/models/${id}/medium/query`, json('POST', { state })),
  setMedium: (id: string, state: StateSpec, medium: Record<string, number>) =>
    request<{ bounds: Record<string, [number | null, number | null]>; medium: Record<string, number> }>(`/models/${id}/medium`, json('PUT', { state, medium })),
  mediumPreset: (id: string, state: StateSpec, preset: string, opts: { richUptake?: number; growthFraction?: number } = {}) =>
    request<{ bounds: Record<string, [number | null, number | null]>; medium: Record<string, number>; notes: string[] }>(`/models/${id}/medium/preset`, json('POST', { state, preset, ...opts })),
  simulate: (id: string, method: Method, state: StateSpec, params: Partial<SimParams>, opts: { name?: string; jobId?: string; signal?: AbortSignal } = {}) =>
    request<SimulationResult>(`/models/${id}/simulate/${method}`, { ...json('POST', { state, params, name: opts.name, jobId: opts.jobId }), signal: opts.signal }),
  // structural edits (see edits.ts): validation never modifies the model; commit applies one transaction
  checkEdits: (id: string, ops: EditOp[]) => request<EditReport>(`/models/${id}/edits/check`, json('POST', { ops })),
  commitEdits: (id: string, ops: EditOp[], label?: string) => request<EditResponse & { report: EditReport }>(`/models/${id}/edits`, json('POST', { ops, label })),
  editHistory: (id: string) => request<EditHistory>(`/models/${id}/edits`),
  undoEdit: (id: string) => request<EditResponse>(`/models/${id}/edits/undo`, { method: 'POST' }),
  redoEdit: (id: string) => request<EditResponse>(`/models/${id}/edits/redo`, { method: 'POST' }),
  discardEdits: (id: string) => request<EditResponse>(`/models/${id}/edits/discard`, { method: 'POST' }),
  editPatch: async (id: string) => {
    const res = await fetch(`${BASE}/models/${id}/edits/patch`);
    if (!res.ok) throw new ApiError({ title: `Patch export failed (${res.status})`, message: '', hints: [] });
    return { blob: await res.blob(), filename: res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'model_patch.json' };
  },
  validateModel: (id: string) => request<ValidationReport>(`/models/${id}/validate`),
  /** KEGG + ChEBI resolved through MetaNetX, merged with the local BiGG tables (shared with the Template Builder). */
  identityCompounds: (q: string, limit = 12) => request<{ candidates: ExternalCompound[]; sources: Record<string, string> }>(`/identity/compounds?q=${encodeURIComponent(q)}&limit=${limit}`),
  job: (jobId: string) => request<{ done: number; total: number; phase: string; cancel: boolean }>(`/jobs/${jobId}`),
  cancelJob: (jobId: string, keep = false) => request<{ cancelled: boolean }>(`/jobs/${jobId}/cancel`, json('POST', { keep })),
  compare: (a: SimulationResult, b: SimulationResult, zeroTolerance: number, pseudocount: number | null) =>
    request<ComparisonResult>('/results/compare', json('POST', { a, b, zeroTolerance, pseudocount })),
  explainTurnover: (id: string, metabolite: string, fluxesA: Record<string, number | null>, fluxesB: Record<string, number | null>, zeroTolerance: number) =>
    request<TurnoverExplanation>(`/models/${id}/explain-turnover`, json('POST', { metabolite, fluxesA, fluxesB, zeroTolerance })),
  derive: (id: string, fluxes: Record<string, number | null>) =>
    request<{ metaboliteTurnover: Record<string, number | null>; exchanges: SimulationResult['exchanges']; matched: number; total: number; model: { filename: string; checksum: string } }>(`/models/${id}/derive`, json('POST', { fluxes })),
  exportResult: (result: SimulationResult, format: 'json' | 'csv', table: string) => download('/results/export', { result, format, table }),
  exportModel: (id: string, state: StateSpec, format: 'sbml' | 'json' | 'mat') => download(`/models/${id}/export`, { state, format }),
  metabolites: (id: string) => request<LabMetabolite[]>(`/models/${id}/metabolites`),
  annotation: (id: string, full = true) => request<AnnotationState>(`/models/${id}/annotation${full ? '' : '?full=false'}`),
  analyzeAnnotation: (id: string, opts: { useNames: boolean; autoApply: boolean; fillFormulas: boolean }) =>
    request<AnnotationJob>(`/models/${id}/annotation/analyze`, json('POST', opts)),
  applyAnnotation: (id: string, items: { id: string; mnx?: string; fillFormula?: boolean; like?: string }[]) =>
    request<{ curation: CurationSummary; metabolites: LabMetabolite[] }>(`/models/${id}/annotation/apply`, json('POST', { items })),
  rejectAnnotation: (id: string, ids: string[]) =>
    request<{ curation: CurationSummary; metabolites: LabMetabolite[] }>(`/models/${id}/annotation/reject`, json('POST', { ids })),
  revertAnnotation: (id: string, ids: string[] | null) =>
    request<{ curation: CurationSummary; metabolites: LabMetabolite[] }>(`/models/${id}/annotation/revert`, json('POST', { ids })),
};

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
