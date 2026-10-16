import { useDeferredValue, useMemo } from 'react';
import { docBounds } from '../store/project';
import { A, useStore } from '../store/store';
import { rem, uiPx, useUi } from './uiScale';

export function Minimap() {
  // deferred: the overview never blocks dragging on large maps
  const doc = useDeferredValue(useStore((s) => s.doc));
  const camera = useStore((s) => s.camera);
  const vp = useStore((s) => s.viewport);
  useUi((s) => s.factor); // re-render when the interface size changes
  const b = useMemo(() => docBounds(doc), [doc]);
  // follows the interface size, but never covers more than a fifth of the map's width or a quarter of its height
  const fit = Math.min(1, (vp.w * 0.2) / uiPx(168), (vp.h * 0.25) / uiPx(110));
  const W = Math.round(168 * fit), H = Math.round(110 * fit);
  const view = { x: -camera.x / camera.k, y: -camera.y / camera.k, w: vp.w / camera.k, h: vp.h / camera.k };
  const x0 = Math.min(b?.x ?? 0, view.x), y0 = Math.min(b?.y ?? 0, view.y);
  const x1 = Math.max((b?.x ?? 0) + (b?.w ?? 0), view.x + view.w), y1 = Math.max((b?.y ?? 0) + (b?.h ?? 0), view.y + view.h);
  const k = Math.min(W / (x1 - x0 || 1), H / (y1 - y0 || 1));
  // one path for all edges and one for all dots: thousands of nodes stay cheap
  const { edges, dots } = useMemo(() => {
    let e = '', d = '';
    for (const g of Object.values(doc.reactions)) {
      const a = doc.nodes[g.sources[0]], t = doc.nodes[g.targets[0]];
      if (a && t) e += `M${((a.x - x0) * k).toFixed(1)} ${((a.y - y0) * k).toFixed(1)}L${((t.x - x0) * k).toFixed(1)} ${((t.y - y0) * k).toFixed(1)}`;
    }
    for (const n of Object.values(doc.nodes)) d += `M${((n.x - x0) * k).toFixed(1)} ${((n.y - y0) * k).toFixed(1)}h0`;
    return { edges: e, dots: d };
  }, [doc, x0, y0, k]);
  if (!b || Object.keys(doc.nodes).length < 3) return null;
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = W / r.width; // the minimap follows the interface size: screen px -> its own px
    const wx = ((e.clientX - r.left) * s) / k + x0, wy = ((e.clientY - r.top) * s) / k + y0;
    A().setCamera({ x: vp.w / 2 - wx * camera.k, y: vp.h / 2 - wy * camera.k });
  };
  return (
    <div className="minimap" onPointerDown={(e) => e.stopPropagation()}>
      <svg width={rem(W)} height={rem(H)} viewBox={`0 0 ${W} ${H}`} onClick={onClick}>
        <path d={edges} stroke="#b8bcc6" strokeWidth={0.8} fill="none" />
        <path d={dots} stroke="#6b7080" strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <rect x={(view.x - x0) * k} y={(view.y - y0) * k} width={view.w * k} height={view.h * k} fill="rgba(79,91,213,0.08)" stroke="#4f5bd5" strokeWidth={1} />
      </svg>
    </div>
  );
}
