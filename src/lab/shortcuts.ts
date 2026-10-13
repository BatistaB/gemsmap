/**
 * COBRAGUI keyboard map (called by the global handler only when the Lab is the active workspace
 * and focus is not in a text field):
 *   /  Ctrl K   search / command palette     F  focus table search
 *   R M G      reactions / metabolites / genes tabs
 *   Alt ← →    inspector back / forward       Ctrl Z / Ctrl Shift Z   undo / redo model change
 *   Ctrl Enter run the selected method        I  toggle inspector       Alt 1–6  sections
 */
import { A, useStore } from '../store/store';
import { lab, useLab } from './store';
import type { LabSection } from './types';

const SECTIONS: LabSection[] = ['overview', 'explore', 'medium', 'simulate', 'results', 'compare'];

export function handleLabKey(e: KeyboardEvent) {
  const s = useLab.getState();
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); if (e.key === 'ArrowLeft') lab.back(); else lab.forward(); return; }
  if (e.altKey && /^Digit[1-6]$/.test(e.code)) { e.preventDefault(); lab.setSection(SECTIONS[+e.code.slice(5) - 1]); return; }
  if (mod) {
    if (k === 'z' && e.shiftKey) { e.preventDefault(); lab.redo(); }
    else if (k === 'z' || k === 'y') { e.preventDefault(); if (k === 'y') lab.redo(); else lab.undo(); }
    else if (k === 'enter') { e.preventDefault(); lab.simulate(s.method); }
    else if (k === 's') { e.preventDefault(); A().toast('COBRAGUI sessions (states, results, favorites) are saved automatically'); }
    return;
  }
  if (!s.model) return;
  switch (e.key) {
    case '/': e.preventDefault(); useStore.setState({ paletteOpen: true }); return;
    case 'Escape': useLab.setState({ contextMenu: null }); lab.clearSelection(); return;
  }
  switch (k) {
    case 'f':
      e.preventDefault();
      if (s.section !== 'explore') lab.setSection('explore');
      setTimeout(() => (document.getElementById('lab-explorer-search') as HTMLInputElement | null)?.focus(), 20);
      break;
    case 'r': lab.setTab('reactions'); break;
    case 'm': lab.setTab('metabolites'); break;
    case 'g': lab.setTab('genes'); break;
    case 'i': useLab.setState({ inspectorOpen: !s.inspectorOpen }); break;
  }
}
