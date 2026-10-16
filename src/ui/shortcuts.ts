import { saveProjectFile } from '../export/export';
import { useStore } from '../store/store';
import { openFile } from './files';
import { handleLabKey } from '../lab/shortcuts';
import { useLab } from '../lab/store';
import { exportOpenTemplate, pickTemplateFile, saveDesign } from './templates/templateFiles';
import { setUiScale, stepUiScale } from './uiScale';

const UI_SIZE_CODES: Record<string, 1 | -1 | 0> = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1, Digit0: 0, Numpad0: 0 };
const UI_SIZE_KEYS: Record<string, 1 | -1 | 0> = { '=': 1, '+': 1, '-': -1, '0': 0 };

export function installShortcuts() {
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
    if (e.code === 'Space') return; // Space is "hold to pan" (handled by the canvas)
    const s = useStore.getState();
    const a = s.actions;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); useStore.setState({ paletteOpen: !s.paletteOpen }); return; }
    // interface size, in every workspace: Ctrl Alt + / − / 0, by key position first (on layouts where Ctrl Alt
    // is AltGr the key types another character), then by character
    const size = mod && e.altKey ? (UI_SIZE_CODES[e.code] ?? UI_SIZE_KEYS[e.key]) : undefined;
    if (size !== undefined) {
      e.preventDefault();
      if (size === 0) setUiScale(1); else stepUiScale(size);
      return;
    }
    if (s.dialog || s.paletteOpen) return;
    if (useLab.getState().workspace === 'lab') { handleLabKey(e); return; }
    // Templates workspace: the editor keys only while a template is open; file keys act on the template
    if (useLab.getState().workspace === 'templates') {
      if (!s.design) return;
      if (mod && (k === 's' || k === 'o' || k === 'e')) {
        e.preventDefault();
        if (k === 's') saveDesign();
        else if (k === 'o') pickTemplateFile();
        else exportOpenTemplate();
        return;
      }
      if (e.altKey && !mod) return;
    }
    if (e.altKey && !mod && /^Digit[123]$/.test(e.code)) {
      e.preventDefault();
      useStore.setState({ leftOpen: true, leftTab: (['elements', 'model', 'data'] as const)[+e.code.slice(5) - 1] });
      return;
    }
    if (mod) {
      if (k === 'z' && e.shiftKey) { e.preventDefault(); a.redo(); }
      else if (k === 'z') { e.preventDefault(); a.undo(); }
      else if (k === 'y') { e.preventDefault(); a.redo(); }
      else if (k === 'c') { a.copy(); }
      else if (k === 'v') { a.paste(); }
      else if (k === 'd') { e.preventDefault(); a.duplicate(); }
      else if (k === 'a') { e.preventDefault(); a.selectAll(); }
      else if (k === 'g' && e.shiftKey) { e.preventDefault(); a.ungroup(); }
      else if (k === 'g') { e.preventDefault(); a.groupSelection('pathway'); }
      else if (k === 's') { e.preventDefault(); saveProjectFile(); a.toast('Project saved'); }
      else if (k === 'o') { e.preventDefault(); openFile('project'); }
      else if (k === 'e') { e.preventDefault(); useStore.setState({ dialog: { kind: 'export' } }); }
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'Delete': case 'Backspace': a.deleteSelection(); break;
      case 'Escape': if (useStore.getState().placing) { a.cancelPlacing(); break; } useStore.setState({ selection: [], tool: 'select', contextMenu: null }); break;
      case 'ArrowLeft': e.preventDefault(); a.nudge(-step, 0); break;
      case 'ArrowRight': e.preventDefault(); a.nudge(step, 0); break;
      case 'ArrowUp': e.preventDefault(); a.nudge(0, -step); break;
      case 'ArrowDown': e.preventDefault(); a.nudge(0, step); break;
      case '[': a.stepCondition(-1); break;
      case ']': a.stepCondition(1); break;
      case '?': useStore.setState({ dialog: { kind: 'help' } }); break;
      default:
        switch (k) {
          case 'v': useStore.setState({ tool: 'select' }); break;
          case 'm': useStore.setState({ tool: 'metabolite' }); break;
          case 's': useStore.setState({ tool: 'slot' }); break;
          case 'r': useStore.setState({ tool: 'reaction' }); break;
          case 't': useStore.setState({ tool: 'text' }); break;
          case 'c': useStore.setState({ tool: 'pan' }); break;
          case 'p': if (!s.design) a.addPlotsForSelection('density'); break;
          case 'l': a.toggleLock(); break;
          case 'f': if (e.shiftKey) a.fitSelection(); else a.fitAll(); break;
          case '=': case '+': a.zoomBy(1.2); break;
          case '-': a.zoomBy(1 / 1.2); break;
        }
    }
  });
}
