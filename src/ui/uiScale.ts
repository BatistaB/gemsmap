/**
 * Interface size: one factor scales the whole interface (panels, menus, tables, dialogs) so the app reads well
 * on a small laptop and on a large monitor. The CSS is written in rem (1rem = 16 px at 100 %) and the root font
 * size is 100 % × the factor, so the browser's own default font size is respected too. The map, its figures and
 * the exports are drawn in their own coordinates and do not change. The choice is remembered per browser.
 */
import { create } from 'zustand';

export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75] as const;
const KEY = 'gemsmap.uiScale';

/** A size in design pixels (its size at 100 %) as a CSS length that follows the interface size. */
export const rem = (px: number) => `${px / 16}rem`;

interface UiState {
  /** chosen interface size (1 = 100 %) */
  scale: number;
  /** screen pixels per design pixel: the scale × the browser's default font size / 16 */
  factor: number;
  /** window width in design pixels: the room the layout really has */
  vw: number;
}

export const useUi = create<UiState>(() => ({ scale: 1, factor: 1, vw: 1280 }));

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (UI_SCALES as readonly number[]).includes(v) ? v : 1;
  } catch { return 1; }
}

function apply(scale: number) {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(scale));
  const factor = parseFloat(getComputedStyle(root).fontSize) / 16 || 1;
  useUi.setState({ scale, factor, vw: window.innerWidth / factor });
}

export function setUiScale(scale: number) {
  const s = UI_SCALES.reduce((a, b) => (Math.abs(b - scale) < Math.abs(a - scale) ? b : a));
  try { localStorage.setItem(KEY, String(s)); } catch { /* storage unavailable: the size lasts this session */ }
  apply(s);
}

export function stepUiScale(dir: 1 | -1) {
  const i = (UI_SCALES as readonly number[]).indexOf(useUi.getState().scale);
  setUiScale(UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, (i < 0 ? UI_SCALES.indexOf(1) : i) + dir))]);
}

export const uiScaleLabel = (scale: number) => `${Math.round(scale * 100)}%`;

/** Design pixels → screen pixels, for the few sizes that must be numbers (virtualized rows, popup clamping). */
export const uiPx = (px: number) => px * useUi.getState().factor;

/** Once, before the first render: applies the remembered size and follows the window width. */
export function installUiScale() {
  apply(read());
  let frame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    // re-measures too: browser zoom arrives as a resize
    frame = requestAnimationFrame(() => apply(useUi.getState().scale));
  });
}

/** Command-palette entries, shared by the Map Builder and COBRAGUI palettes. */
export const UI_SCALE_COMMANDS = [
  { id: 'ui-larger', group: 'View', label: 'Interface size: larger', hint: 'Ctrl Alt +', run: () => stepUiScale(1) },
  { id: 'ui-smaller', group: 'View', label: 'Interface size: smaller', hint: 'Ctrl Alt −', run: () => stepUiScale(-1) },
  { id: 'ui-reset', group: 'View', label: 'Interface size: 100 %', hint: 'Ctrl Alt 0', run: () => setUiScale(1) },
];
