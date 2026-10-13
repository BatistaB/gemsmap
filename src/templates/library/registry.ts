/**
 * Template library: the bundled templates plus the user's own, all in the same
 * file format. Built-ins are read-only (duplicate one to change it); user
 * templates live in IndexedDB. Everything that applies a template to a model
 * (gallery, mapping dialog, re-mapping after a model switch) resolves ids here.
 *
 * Designed so a remote "Template Hub" can later be one more source of files:
 * an item only needs a TemplateFile and a provenance kind.
 */
import { create } from 'zustand';
import { kvGet, kvPut } from '../../store/kv';
import { compileTemplate } from '../format/compile';
import { TEMPLATE_FORMAT, TEMPLATE_SCHEMA_VERSION, type TemplateFile } from '../format/schema';
import { BUILTIN_TEMPLATE_FILES } from '../pathways';
import type { PathwayTemplateSpec } from '../spec';

export type LibraryKind = 'builtin' | 'user';
export interface LibraryItem { file: TemplateFile; kind: LibraryKind }

interface LibraryState { user: TemplateFile[]; loaded: boolean }
export const useTemplateLibrary = create<LibraryState>(() => ({ user: [], loaded: false }));

const KEY = 'templates.library.v1';
let loading: Promise<void> | null = null;

/** Read the user's templates from browser storage (once). */
export function loadTemplateLibrary(): Promise<void> {
  // templates saved as MetMap carry the old format tag: they get the current one
  loading ??= kvGet<TemplateFile[]>(KEY).then((u) => { useTemplateLibrary.setState({ user: Array.isArray(u) ? u.map((f) => ({ ...f, format: TEMPLATE_FORMAT })) : [], loaded: true }); });
  return loading;
}
const persist = () => kvPut(KEY, useTemplateLibrary.getState().user);

export const isBuiltinId = (id: string) => BUILTIN_TEMPLATE_FILES.some((f) => f.metadata.id === id);

export function libraryItems(user: TemplateFile[] = useTemplateLibrary.getState().user): LibraryItem[] {
  return [
    ...BUILTIN_TEMPLATE_FILES.map((file) => ({ file, kind: 'builtin' as const })),
    ...[...user].sort((a, b) => b.metadata.modified.localeCompare(a.metadata.modified)).map((file) => ({ file, kind: 'user' as const })),
  ];
}

export function getTemplateFile(id: string): TemplateFile | undefined {
  return BUILTIN_TEMPLATE_FILES.find((f) => f.metadata.id === id) ?? useTemplateLibrary.getState().user.find((f) => f.metadata.id === id);
}

/** Engine spec of a library template (built-ins first: a user file can never shadow one). */
export function specFromLibrary(id: string): PathwayTemplateSpec | undefined {
  const f = getTemplateFile(id);
  return f ? compileTemplate(f) : undefined;
}

/** Save (insert or replace) a user template. Built-in ids are refused. */
export function saveUserTemplate(file: TemplateFile): TemplateFile {
  if (isBuiltinId(file.metadata.id)) throw new Error('Built-in templates are read-only — duplicate it first');
  const saved: TemplateFile = { ...file, format: TEMPLATE_FORMAT, schema_version: TEMPLATE_SCHEMA_VERSION, metadata: { ...file.metadata, modified: new Date().toISOString() } };
  const user = useTemplateLibrary.getState().user.filter((f) => f.metadata.id !== saved.metadata.id);
  useTemplateLibrary.setState({ user: [...user, saved] });
  void persist();
  return saved;
}

export function deleteUserTemplate(id: string) {
  useTemplateLibrary.setState({ user: useTemplateLibrary.getState().user.filter((f) => f.metadata.id !== id) });
  void persist();
}

export const newTemplateId = () => `tpl_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

/** A copy with a new id that remembers where it came from. The original is never changed. */
export function duplicateTemplate(src: TemplateFile, name?: string): TemplateFile {
  const now = new Date().toISOString();
  const f: TemplateFile = structuredClone(src);
  f.metadata = {
    ...f.metadata, id: newTemplateId(), name: name ?? `${src.metadata.name} — copy`, template_version: '1.0.0',
    created: now, modified: now, section: 'My templates',
    derived_from: { id: src.metadata.id, name: src.metadata.name, template_version: src.metadata.template_version },
  };
  delete f.validation;
  return f;
}
