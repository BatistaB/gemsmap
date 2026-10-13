import { parseModelFile } from '../model/importers';
import { isProjectFormat, LEGACY_PROJECT_EXTENSION, looksLikeProject, PROJECT_EXTENSION, type ProjectFile } from '../store/project';
import { A } from '../store/store';
import { isResultJson, parseResultFile } from '../lab/resultFiles';
import { importResultsToMap } from '../lab/bridge';

export type FileKind = 'model' | 'data' | 'project' | 'auto';

const ACCEPT: Record<FileKind, string> = {
  model: '.json,.xml,.sbml',
  data: '.csv,.tsv,.txt,.json',
  project: `${PROJECT_EXTENSION},${LEGACY_PROJECT_EXTENSION},.json`,
  auto: `.json,.xml,.sbml,.csv,.tsv,.txt,${PROJECT_EXTENSION},${LEGACY_PROJECT_EXTENSION}`,
};

export function openFile(kind: FileKind) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT[kind];
  input.multiple = kind === 'data' || kind === 'auto';
  input.onchange = () => { for (const f of Array.from(input.files ?? [])) handleFile(f, kind); };
  input.click();
}

export async function handleFile(f: File, kind: FileKind = 'auto') {
  const text = await f.text();
  const name = f.name.toLowerCase();
  try {
    let k = kind;
    if (k === 'auto') {
      if (name.endsWith(PROJECT_EXTENSION) || name.endsWith(LEGACY_PROJECT_EXTENSION)) k = 'project';
      else if (/\.(csv|tsv|txt)$/.test(name)) k = 'data';
      else if (/\.(xml|sbml)$/.test(name)) k = 'model';
      else {
        const head = text.slice(0, 4000);
        k = looksLikeProject(head) ? 'project' : isResultJson(head) ? 'data' : 'model';
      }
    }
    if (k === 'project') {
      const p = JSON.parse(text) as ProjectFile;
      if (!isProjectFormat(p.format)) throw new Error(`Not a ${PROJECT_EXTENSION} project`);
      A().loadProject(p);
      A().toast(`Opened ${p.name}`);
    } else if (k === 'model') {
      A().importModel(parseModelFile(f.name, text));
    } else if (/\.json$/i.test(name) || isResultJson(text.slice(0, 4000))) {
      const { results, notes } = parseResultFile(f.name, text);
      importResultsToMap(results, f.name);
      if (notes.length) setTimeout(() => A().toast(notes.join(' · ')), 4300);
    } else {
      A().importDataset(f.name, text);
    }
  } catch (e) {
    A().toast(`Could not import ${f.name}: ${(e as Error).message}`);
  }
}

/**
 * Fetch a file served from public/. Some files (local, unpublished projects) are kept
 * out of git; in a fresh clone the dev server answers with index.html, so detect that explicitly.
 */
export async function fetchPublic(path: string): Promise<Response> {
  const res = await fetch(path);
  if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error(`${path} is not available — it is a local-only file kept out of the repository (public/${path})`);
  }
  return res;
}
