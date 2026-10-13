/** Template file actions: export, import (with report), duplicate, apply to the loaded GEM. */
import { download } from '../../export/export';
import { lab } from '../../lab/store';
import { A, useStore } from '../../store/store';
import { compileTemplate } from '../../templates/format/compile';
import { parseTemplateJson } from '../../templates/format/parse';
import { TEMPLATE_EXTENSION, type TemplateFile } from '../../templates/format/schema';
import { duplicateTemplate, getTemplateFile, isBuiltinId, newTemplateId, saveUserTemplate } from '../../templates/library/registry';
import { currentTemplate, openTemplate, saveOpenTemplate, useTemplateSession, withValidation } from '../../templates/design/session';
import { specToMapTemplate } from '../../templates/templates';

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'template';

/** One self-contained file: identities, annotations, topology, layout, compartments, metadata and a validation snapshot. */
export function exportTemplate(f: TemplateFile) {
  download(`${slug(f.metadata.name)}${TEMPLATE_EXTENSION}`, JSON.stringify(withValidation(f), null, 1) + '\n', 'application/json');
}

export function pickTemplateFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => { const file = input.files?.[0]; if (file) importTemplateText(file.name, await file.text()); };
  input.click();
}

/** Parse and check a file; the import report asks what to do with it. Nothing is trusted blindly. */
export function importTemplateText(fileName: string, text: string) {
  const r = parseTemplateJson(text);
  if (!r.file) {
    A().toast(`Could not import ${fileName}: ${r.errors.slice(0, 3).join(' · ')}`);
    return;
  }
  const warnings = [...r.warnings];
  let file = r.file;
  if (isBuiltinId(file.metadata.id)) {
    // a copy of a built-in: never shadow the bundled one
    file = { ...file, metadata: { ...file.metadata, id: newTemplateId(), derived_from: file.metadata.derived_from ?? { id: r.file.metadata.id, name: r.file.metadata.name, template_version: r.file.metadata.template_version } } };
    warnings.push(`Same id as the built-in “${r.file.metadata.name}” — imported as a separate template`);
  }
  useTemplateSession.setState({ importing: { file, warnings, fileName } });
}

/** Keep both: the imported file gets a new id. */
export const withNewId = (f: TemplateFile): TemplateFile => ({ ...f, metadata: { ...f.metadata, id: newTemplateId() } });

export function saveImported(f: TemplateFile) {
  const saved = saveUserTemplate(f);
  A().toast(`Saved “${saved.metadata.name}” to your templates`);
  return saved;
}

/** Duplicate into the user library and open the copy. */
export function duplicateAndOpen(src: TemplateFile, name?: string) {
  const copy = saveUserTemplate(duplicateTemplate(src, name));
  openTemplate(copy, 'user');
  A().toast(`Created “${copy.metadata.name}” — the original is unchanged`);
}

/**
 * Apply a library template to the GEM loaded in the Map Builder: the existing mapping engine and
 * its review dialog take over (candidates with evidence, confirm / reject / choose another).
 */
export function applyToMap(id: string) {
  const f = getTemplateFile(id);
  if (!f) return A().toast('Save the template first');
  lab.setWorkspace('map');
  setTimeout(() => {
    const s = useStore.getState();
    A().openTemplate(specToMapTemplate(compileTemplate(f)));
    if (!s.model) A().toast(`Inserted “${f.metadata.name}” unmapped — load a GEM (Model tab, or send one from COBRAGUI) and click Auto-bind`);
  }, 0);
}

/** Save, turning a built-in into the user's own copy (the original is never changed). */
export function saveDesign(): boolean {
  const ss = useTemplateSession.getState();
  try {
    if (ss.kind === 'builtin') {
      const copy = saveUserTemplate(duplicateTemplate(currentTemplate()!, `${useStore.getState().design!.metadata.name} — my version`));
      openTemplate(copy, 'user');
      A().toast(`Built-in templates are read-only — saved your changes as “${copy.metadata.name}”`);
      return true;
    }
    const saved = saveOpenTemplate();
    if (saved) A().toast(`Saved “${saved.metadata.name}”`);
    return !!saved;
  } catch (e) { A().toast((e as Error).message); return false; }
}

/** Export the template open in the designer. */
export function exportOpenTemplate() { const f = currentTemplate(); if (f) exportTemplate(f); }
