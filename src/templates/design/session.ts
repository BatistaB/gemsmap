/**
 * Template Builder session: which template is open, and the swap that lets the
 * Map Builder editor edit a template without ever touching the user's map.
 *
 * Opening a template stashes the map's editor state (document, model, data,
 * undo history, camera) and loads the template's layout into the editor with
 * the design layer next to it. Closing — or leaving the Templates workspace —
 * puts the map back exactly as it was. The map autosave is suspended while a
 * template is open (export.ts), and the template draft is kept in IndexedDB.
 */
import { create } from 'zustand';
import { useLab } from '../../lab/store';
import { defaultStyle, setIdPolicy } from '../../store/project';
import { kvDelete, kvGet, kvPut } from '../../store/kv';
import { useStore, type EditorState } from '../../store/store';
import { completeness, issueCounts, validateTemplateFile } from '../format/validate';
import { ID_PREFIX, isTemplateFormat, TEMPLATE_FORMAT, type TemplateFile } from '../format/schema';
import { isBuiltinId, saveUserTemplate } from '../library/registry';
import { docToFile, fileToDoc } from './convert';

export type OpenKind = 'builtin' | 'user' | 'new' | 'imported';

interface SessionState {
  view: 'library' | 'designer';
  /** Library id of the open template (null: not saved yet). */
  openId: string | null;
  kind: OpenKind;
  /** The file as last saved / opened — "unsaved changes" is measured against it. */
  savedJson: string | null;
  /** Kept while the user is in another workspace with a template open. */
  suspended: { file: TemplateFile } | null;
  /** Unsaved draft found at startup (the previous session ended with a template open). */
  recovered: { file: TemplateFile; openId: string | null; kind: OpenKind } | null;
  /** Side panel shown next to the canvas. */
  panel: 'none' | 'review' | 'issues';
  /** An imported file waiting for the user's decision (import report). */
  importing: { file: TemplateFile; warnings: string[]; fileName: string } | null;
}

export const useTemplateSession = create<SessionState>(() => ({ view: 'library', openId: null, kind: 'new', savedJson: null, suspended: null, recovered: null, panel: 'none', importing: null }));

type MapStash = Pick<EditorState, 'doc' | 'model' | 'datasets' | 'conditions' | 'mappings' | 'view' | 'style' | 'past' | 'future' | 'selection' | 'camera' | 'name' | 'validation' | 'tool'>;
let stash: MapStash | null = null;

const DRAFT_KEY = 'templates.draft';

/** New glyphs get stable template ids while designing (tpl_node_### …). */
function installIdPolicy(f: TemplateFile) {
  const max = (ids: string[], prefix: string) => ids.reduce((m, id) => { const x = id.match(new RegExp(`^${prefix}_(\\d+)$`)); return x ? Math.max(m, +x[1]) : m; }, 0);
  const counters: Record<string, { prefix: string; n: number }> = {
    n: { prefix: ID_PREFIX.node, n: max([...f.layout.nodes.map((x) => x.id), ...f.layout.ports.map((x) => x.id)], ID_PREFIX.node) },
    g: { prefix: ID_PREFIX.group, n: max(f.layout.groups.map((x) => x.id), ID_PREFIX.group) },
    t: { prefix: ID_PREFIX.label, n: max(f.layout.labels.map((x) => x.id), ID_PREFIX.label) },
  };
  setIdPolicy((p) => {
    const c = counters[p];
    if (!c) return null;
    const used = useStore.getState().doc;
    let id: string;
    do id = `${c.prefix}_${String(++c.n).padStart(3, '0')}`; while (used.nodes[id] || used.groups[id] || used.texts[id]);
    return id;
  });
}

/** The template as currently drawn (biology + layout). */
export function currentTemplate(): TemplateFile | null {
  const s = useStore.getState();
  return s.design ? docToFile(s.design, s.doc) : null;
}

export function isDirty(): boolean {
  const f = currentTemplate();
  const { savedJson } = useTemplateSession.getState();
  return !!f && JSON.stringify(stripVolatile(f)) !== savedJson;
}
const stripVolatile = (f: TemplateFile) => ({ ...f, metadata: { ...f.metadata, modified: '' }, validation: undefined });

/** Load a template into the editor (the map is stashed first). */
export function openTemplate(file: TemplateFile, kind: OpenKind, opts: { savedJson?: string | null } = {}) {
  // a template is only ever edited in the Templates workspace (the Map Builder must keep showing the map)
  if (useLab.getState().workspace !== 'templates') {
    useTemplateSession.setState({ suspended: null });
    useLab.setState({ workspace: 'templates' });
  }
  const s = useStore.getState();
  if (!stash && !s.design) {
    stash = { doc: s.doc, model: s.model, datasets: s.datasets, conditions: s.conditions, mappings: s.mappings, view: s.view, style: s.style, past: s.past, future: s.future, selection: s.selection, camera: s.camera, name: s.name, validation: s.validation, tool: s.tool };
  }
  installIdPolicy(file);
  useStore.setState({
    design: file, doc: fileToDoc(file), model: null, datasets: [], conditions: [], mappings: [], validation: [],
    view: { activeCondition: '', compare: 'absolute', reference: '' }, style: { ...defaultStyle(), metaboliteLabel: 'name' },
    past: [], future: [], selection: [], dialog: null, contextMenu: null, tool: 'select', name: file.metadata.name,
  });
  // reconcile once (builds glyph labels / statuses) without an undo step
  useStore.getState().actions.commit(() => ({ design: useStore.getState().design }));
  useStore.setState({ past: [] });
  useTemplateSession.setState({
    view: 'designer', openId: kind === 'new' || kind === 'imported' ? null : file.metadata.id, kind,
    savedJson: opts.savedJson !== undefined ? opts.savedJson : JSON.stringify(stripVolatile(currentTemplate()!)), suspended: null, panel: 'none',
  });
  setTimeout(() => useStore.getState().actions.fitAll(), 0);
}

/** Put the map back into the editor. */
function restoreMap() {
  setIdPolicy(null);
  if (!stash) { useStore.setState({ design: null }); return; }
  useStore.setState({ ...stash, design: null, dialog: null, contextMenu: null });
  stash = null;
}

/** Close the designer (the caller has asked about unsaved changes). */
export function closeTemplate() {
  restoreMap();
  useTemplateSession.setState({ view: 'library', openId: null, savedJson: null, suspended: null, panel: 'none' });
  void kvDelete(DRAFT_KEY);
}

/** Save the open template into the user library. Built-ins are duplicated by the caller first. */
export function saveOpenTemplate(): TemplateFile | null {
  const f = currentTemplate();
  if (!f) return null;
  if (isBuiltinId(f.metadata.id)) throw new Error('Built-in templates are read-only — use “Duplicate” to make your own version');
  const saved = saveUserTemplate(f);
  useStore.setState({ design: { ...useStore.getState().design!, metadata: saved.metadata }, name: saved.metadata.name });
  useTemplateSession.setState({ openId: saved.metadata.id, kind: 'user', savedJson: JSON.stringify(stripVolatile(currentTemplate()!)) });
  void kvDelete(DRAFT_KEY);
  return saved;
}

/** Validation snapshot written into exported files. */
export function withValidation(f: TemplateFile): TemplateFile {
  const c = issueCounts(validateTemplateFile(f));
  return { ...f, validation: { checked: new Date().toISOString(), errors: c.errors, warnings: c.warnings, completeness: completeness(f) } };
}

// ------------------------------------------------------------ workspace switches & drafts

let draftTimer: number | undefined;
useStore.subscribe((s, p) => {
  if (!s.design || (s.design === p.design && s.doc === p.doc)) return;
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    const f = currentTemplate();
    const ss = useTemplateSession.getState();
    if (f && isDirty()) void kvPut(DRAFT_KEY, { file: f, openId: ss.openId, kind: ss.kind });
  }, 800);
});

useLab.subscribe((s, p) => {
  if (s.workspace === p.workspace) return;
  const ss = useTemplateSession.getState();
  if (p.workspace === 'templates' && ss.view === 'designer') {
    // leaving with a template open: keep it, give the map back
    const f = currentTemplate();
    const savedJson = ss.savedJson;
    restoreMap();
    useTemplateSession.setState({ suspended: f ? { file: f } : null, savedJson });
  } else if (s.workspace === 'templates' && ss.view === 'designer' && ss.suspended) {
    const { file } = ss.suspended;
    openTemplate(file, ss.kind, { savedJson: ss.savedJson });
    useTemplateSession.setState({ openId: ss.openId });
  }
});

/** Unsaved draft of a previous session, offered in the library. */
export async function loadRecoveredDraft() {
  const d = await kvGet<{ file: TemplateFile; openId: string | null; kind: OpenKind }>(DRAFT_KEY);
  if (d && isTemplateFormat(d.file?.format)) useTemplateSession.setState({ recovered: { ...d, file: { ...d.file, format: TEMPLATE_FORMAT } } });
}
export function discardRecoveredDraft() { useTemplateSession.setState({ recovered: null }); void kvDelete(DRAFT_KEY); }
