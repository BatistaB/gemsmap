import { lab } from '../store';

/** File picker for result files (COBRAGUI → Results → Import). */
export function pickResultFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.json,.csv,.tsv,.txt';
  input.onchange = () => { const files = Array.from(input.files ?? []); if (files.length) lab.importResults(files); };
  input.click();
}
