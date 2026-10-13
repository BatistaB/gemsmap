/**
 * Mouse-resizable side panels. Drag the panel edge to resize; double-click the edge to restore the
 * default width. Widths are remembered per panel in localStorage.
 */
import { useCallback, useState } from 'react';

const KEY = 'gemsmap-panel-widths';

function readAll(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

export function usePanelWidth(id: string, def: number, min = 140, max = 720) {
  const clamp = useCallback((w: number) => Math.round(Math.max(min, Math.min(max, w))), [min, max]);
  const [width, setWidth] = useState<number>(() => { const w = readAll()[id]; return typeof w === 'number' ? clamp(w) : def; });
  const save = useCallback((w: number | null) => {
    const all = readAll();
    if (w == null) delete all[id]; else all[id] = w;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
  }, [id]);
  return { width, set: (w: number) => setWidth(clamp(w)), commit: (w: number) => save(clamp(w)), reset: () => { setWidth(def); save(null); } };
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
    let last = startW;
    document.body.classList.add('resizing-col');
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
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
