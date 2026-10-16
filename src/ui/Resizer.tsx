/**
 * Mouse-resizable side panels. Drag the panel edge to resize; double-click the edge to restore the
 * default width. Widths are design pixels (their size at 100 % interface size, see uiScale.ts), remembered
 * per panel in localStorage.
 *
 * Until it is dragged, a panel follows the window: its default width, but never more than DEFAULT_SHARE of
 * the window, so a small screen keeps room for the map. A dragged width is kept, capped at MAX_SHARE of the
 * window, so a width chosen on a large monitor never swallows the map on a laptop.
 */
import { useCallback, useState } from 'react';
import { rem, useUi } from './uiScale';

const KEY = 'gemsmap-panel-widths';
const DEFAULT_SHARE = 0.22;
const MAX_SHARE = 0.4;

function readAll(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

/** `narrow: [below, width]`: below that window width (design px) the default width is `width` instead. */
export function usePanelWidth(id: string, def: number, min = 140, max = 720, opts?: { narrow?: [number, number] }) {
  const vw = useUi((s) => s.vw);
  const [saved, setSaved] = useState<number | null>(() => { const w = readAll()[id]; return typeof w === 'number' ? w : null; });
  const [dragging, setDragging] = useState<number | null>(null);
  const clamp = useCallback((w: number) => Math.round(Math.max(min, Math.min(max, vw * MAX_SHARE, w))), [min, max, vw]);
  const save = useCallback((w: number | null) => {
    const all = readAll();
    if (w == null) delete all[id]; else all[id] = w;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
  }, [id]);
  const auto = opts?.narrow && vw < opts.narrow[0] ? opts.narrow[1] : Math.min(def, vw * DEFAULT_SHARE);
  const width = dragging ?? clamp(saved ?? auto);
  return {
    /** design pixels (compare with design sizes) */
    width,
    /** the CSS width: follows the interface size */
    css: rem(width),
    set: (w: number) => setDragging(clamp(w)),
    commit: (w: number) => { const c = clamp(w); setDragging(null); setSaved(c); save(c); },
    reset: () => { setDragging(null); setSaved(null); save(null); },
  };
}

/**
 * Drag handle on one edge of a panel (the panel must be position: relative).
 * edge="right": the panel grows when dragging right (left-side panels); edge="left": grows when dragging left.
 */
export function ResizeHandle({ panel, edge }: { panel: ReturnType<typeof usePanelWidth>; edge: 'left' | 'right' }) {
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = panel.width;
    const factor = useUi.getState().factor; // pointer moves in screen pixels, widths are design pixels
    let last = startW;
    document.body.classList.add('resizing-col');
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / factor;
      last = startW + (edge === 'right' ? dx : -dx);
      panel.set(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-col');
      panel.commit(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={`resize-handle ${edge}`} onPointerDown={onPointerDown} onDoubleClick={panel.reset}
      title="Arraste para redimensionar · duplo clique para voltar ao tamanho padrão" role="separator" aria-orientation="vertical" />
  );
}
