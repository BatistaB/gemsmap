import { useEffect, useMemo, useRef, useState } from 'react';
import { A, key, parseKey, useStore, type SelKey } from '../store/store';
import { docBounds, legendPos, plotAnchorApprox } from '../store/project';
import { evaluate } from '../viz/evaluate';
import { THEMES } from '../viz/presets';
import type { ID } from '../model/types';
import type { Point } from '../viz/types';
import { ContextToolbar } from './ContextToolbar';
import { LEGEND_W } from './Legend';
import { Minimap } from './Minimap';
import { Scene } from './Scene';
import { designActions } from '../templates/design/actions';

type Gesture =
  | { mode: 'pan'; sx: number; sy: number; cx: number; cy: number; fromRight?: boolean; moved?: boolean }
  | { mode: 'resize'; id: string; dir: string; start: { dx: number; dy: number; w: number; h: number }; startWorld: Point }
  | { mode: 'box'; start: Point; cur: Point; additive: boolean }
  | { mode: 'drag'; startWorld: Point; start: Record<SelKey, Point>; primary: SelKey | null; moved: boolean; deferSelect: SelKey | null }
  | { mode: 'connect'; from: string; cur: Point }
  | { mode: 'bend'; rid: string; startBend: number; startWorld: Point };

export function useEvaluated() {
  const doc = useStore((s) => s.doc);
  const datasets = useStore((s) => s.datasets);
  const mappings = useStore((s) => s.mappings);
  const view = useStore((s) => s.view);
  const conditions = useStore((s) => s.conditions);
  const style = useStore((s) => s.style);
  const theme = THEMES[style.preset];
  const ev = useMemo(() => evaluate(doc, datasets, mappings, view, conditions, style, theme), [doc, datasets, mappings, view, conditions, style, theme]);
  return { ev, theme };
}

export function Canvas() {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const doc = useStore((s) => s.doc);
  const model = useStore((s) => s.model);
  const datasets = useStore((s) => s.datasets);
  const conditions = useStore((s) => s.conditions);
  const view = useStore((s) => s.view);
  const style = useStore((s) => s.style);
  const camera = useStore((s) => s.camera);
  const canvas = useStore((s) => s.canvas);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const particles = useStore((s) => s.animation.particles);
  const placing = useStore((s) => s.placing);
  const { ev, theme } = useEvaluated();
  // a template being placed: its light preview follows the mouse (world position of the cursor)
  const [ghost, setGhost] = useState<Point | null>(null);
  useEffect(() => setGhost(null), [placing]);
  const placingEv = useMemo(() => (placing ? evaluate(placing.preview, [], [], view, [], style, theme) : null), [placing, view, style, theme]);
  const placingBox = useMemo(() => (placing ? docBounds(placing.preview) : null), [placing]);
  const noSelection = useMemo(() => new Set<string>(), []);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  // dragging one metabolite onto another node of the same metabolite merges them on release
  const [mergeTarget, setMergeTarget] = useState<{ from: ID; into: ID; x: number; y: number } | null>(null);
  const mergeRef = useRef<typeof mergeTarget>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const space = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [hold, setHold] = useState<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const suppressCtx = useRef(false);
  const cancelHold = () => { window.clearTimeout(holdTimer.current); holdTimer.current = undefined; holdStart.current = null; setHold(null); };
  const g = useRef<Gesture | null>(null);
  g.current = gesture;

  // viewport size
  useEffect(() => {
    const el = wrap.current!;
    let first = true;
    const ro = new ResizeObserver(() => {
      useStore.setState({ viewport: { w: el.clientWidth, h: el.clientHeight } });
      if (first) { first = false; A().fitAll(); } // the initial fit ran before the real size was known
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // wheel: pinch / ctrl = zoom, trackpad two-finger = pan, mouse wheel = zoom
  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      const trackpadPan = !e.ctrlKey && (Math.abs(e.deltaX) > 0.5 || (e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY)));
      if (trackpadPan || e.shiftKey) {
        const c = useStore.getState().camera;
        A().setCamera({ x: c.x - (e.shiftKey ? e.deltaY : e.deltaX), y: c.y - (e.shiftKey ? 0 : e.deltaY) });
      } else {
        A().zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // hold Space to pan (and stop Space from pressing a focused button or scrolling)
    const typing = (e: KeyboardEvent) => e.target instanceof Element && !!e.target.closest('input,textarea,select,[contenteditable]');
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e)) { e.preventDefault(); if (!space.current) { space.current = true; setSpaceHeld(true); } } };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') { if (!typing(e)) e.preventDefault(); space.current = false; setSpaceHeld(false); } };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { el.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const toWorld = (clientX: number, clientY: number): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    const c = useStore.getState().camera;
    return { x: (clientX - r.left - c.x) / c.k, y: (clientY - r.top - c.y) / c.k };
  };
  const snapV = (v: number) => (canvas.snap ? Math.round(v / canvas.gridSize) * canvas.gridSize : v);

  const startPositions = (keys: SelKey[]): Record<SelKey, Point> => {
    const s = useStore.getState();
    const d = s.doc;
    const out: Record<SelKey, Point> = {};
    const nodeSet = new Set<string>();
    for (const k of keys) {
      const [kind, id] = parseKey(k);
      if (kind === 'node') nodeSet.add(id);
      else if (kind === 'group') d.groups[id]?.nodeIds.forEach((n) => nodeSet.add(n));
      else if (kind === 'reaction') { const r = d.reactions[id]; r?.sources.concat(r.targets).forEach((n) => nodeSet.add(n)); }
      else if (kind === 'text' && d.texts[id]) out[k] = { x: d.texts[id].x, y: d.texts[id].y };
      else if (kind === 'legend') out[k] = legendPos(d);
    }
    for (const id of nodeSet) if (d.nodes[id] && !d.nodes[id].locked) out[key('node', id)] = { x: d.nodes[id].x, y: d.nodes[id].y };
    for (const k of keys) {
      const [kind, id] = parseKey(k);
      if (kind !== 'plot' || !d.plots[id]) continue;
      const p = d.plots[id];
      // a plot whose anchor moves follows it automatically
      const anchorNodes = p.anchor.kind === 'node' ? [p.anchor.id] : d.reactions[p.anchor.id] ? [...d.reactions[p.anchor.id].sources, ...d.reactions[p.anchor.id].targets] : [];
      if (!anchorNodes.some((n) => nodeSet.has(n))) out[k] = { x: p.dx, y: p.dy };
    }
    return out;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) setEditing(null);
    useStore.setState({ contextMenu: null });
    const s = useStore.getState();
    const target = e.target as Element;
    const world = toWorld(e.clientX, e.clientY);
    // placing a template: a click drops it where its preview is; a right-click cancels; pan still works
    if (s.placing && !space.current && tool !== 'pan' && e.button !== 1) {
      if (e.button === 0) A().placeAt(world);
      else if (e.button === 2) { suppressCtx.current = true; A().cancelPlacing(); }
      return;
    }
    if (e.button === 2) {
      // right-drag pans; a right-click without movement still opens the context menu
      suppressCtx.current = false;
      setGesture({ mode: 'pan', sx: e.clientX, sy: e.clientY, cx: s.camera.x, cy: s.camera.y, fromRight: true, moved: false });
      return;
    }
    if (e.button === 1 || space.current || tool === 'pan') {
      setGesture({ mode: 'pan', sx: e.clientX, sy: e.clientY, cx: s.camera.x, cy: s.camera.y });
      return;
    }
    const resize = target.closest('[data-resize]')?.getAttribute('data-resize');
    if (resize) {
      const [pid, dir] = resize.split(':');
      if (pid === 'legend') {
        // legend: uniform scale; start = { dx: x, dy: y, w: scale, h: natural content height }
        const p = legendPos(s.doc);
        const h = Number(target.closest('[data-legend-h]')?.getAttribute('data-legend-h') ?? 100);
        A().beginGesture();
        setGesture({ mode: 'resize', id: 'legend', dir, start: { dx: p.x, dy: p.y, w: s.doc.legend.scale ?? 1, h }, startWorld: world });
        return;
      }
      const pl = s.doc.plots[pid];
      if (pl) {
        A().beginGesture();
        setGesture({ mode: 'resize', id: pid, dir, start: { dx: pl.dx, dy: pl.dy, w: pl.w, h: pl.h }, startWorld: world });
        return;
      }
    }
    let handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    const selEl = target.closest('[data-sel]');
    let selKey = selEl?.getAttribute('data-sel') ?? null;
    const bendHandle = target.closest('[data-bend]')?.getAttribute('data-bend');
    // locked items are transparent to clicks; holding still on one for 3 s unlocks it
    const lockedKey = selKey && A().isLocked(selKey) ? selKey : handle && A().isLocked(key('node', handle)) ? key('node', handle) : null;
    if (lockedKey) {
      selKey = null;
      handle = null;
      const r = wrap.current!.getBoundingClientRect();
      holdStart.current = { x: e.clientX, y: e.clientY };
      setHold({ x: e.clientX - r.left, y: e.clientY - r.top });
      window.clearTimeout(holdTimer.current);
      window.addEventListener('pointerup', cancelHold, { once: true });
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = undefined;
        setHold(null);
        setGesture(null);
        A().unlock(lockedKey);
      }, 3000);
    }

    if (bendHandle) {
      const r = s.doc.reactions[bendHandle];
      A().beginGesture();
      setGesture({ mode: 'bend', rid: bendHandle, startBend: r.bend ?? 0, startWorld: world });
      return;
    }
    if (handle && (tool === 'select' || tool === 'reaction')) {
      setGesture({ mode: 'connect', from: handle, cur: world });
      return;
    }
    if (tool === 'reaction' && selKey?.startsWith('node:')) {
      setGesture({ mode: 'connect', from: parseKey(selKey)[1], cur: world });
      return;
    }
    if (!selKey && (tool === 'metabolite' || tool === 'slot')) {
      // Template Design Mode: a new template entity, then its identity search
      if (s.design) designActions.addMetaboliteAt({ x: snapV(world.x), y: snapV(world.y) });
      else if (tool === 'metabolite' && s.model) useStore.setState({ dialog: { kind: 'metabolite', at: { x: snapV(world.x), y: snapV(world.y) } } });
      else A().addNode(world, { label: `M${Object.keys(s.doc.nodes).length + 1}` });
      if (!e.shiftKey) useStore.setState({ tool: 'select' });
      return;
    }
    if (!selKey && tool === 'text') { A().addText(world); return; }

    if (selKey) {
      let deferSelect: SelKey | null = null;
      let sel = s.selection;
      if (e.shiftKey || e.metaKey || e.ctrlKey) { A().toggleSelect(selKey); sel = useStore.getState().selection; if (!sel.includes(selKey)) return; }
      else if (!sel.includes(selKey)) { A().select([selKey]); sel = [selKey]; }
      else if (sel.length > 1) deferSelect = selKey;
      setGesture({ mode: 'drag', startWorld: world, start: startPositions(sel), primary: selKey, moved: false, deferSelect });
      return;
    }
    if (!e.shiftKey) A().clearSelection();
    setGesture({ mode: 'box', start: world, cur: world, additive: e.shiftKey });
  };

  // window-level move/up so gestures survive leaving the canvas
  useEffect(() => {
    if (!gesture) return;
    const move = (e: PointerEvent) => {
      const cur = g.current;
      if (!cur) return;
      const world = toWorld(e.clientX, e.clientY);
      if (holdStart.current && Math.hypot(e.clientX - holdStart.current.x, e.clientY - holdStart.current.y) > 5) cancelHold();
      if (cur.mode === 'pan') {
        if (cur.fromRight && !cur.moved) {
          if (Math.hypot(e.clientX - cur.sx, e.clientY - cur.sy) < 4) return;
          cur.moved = true;
        }
        A().setCamera({ x: cur.cx + e.clientX - cur.sx, y: cur.cy + e.clientY - cur.sy });
      } else if (cur.mode === 'resize' && cur.id === 'legend') {
        const ddx = world.x - cur.startWorld.x, ddy = world.y - cur.startWorld.y;
        const { dx: x0, dy: y0, w: k0, h: hn } = cur.start;
        const W = LEGEND_W, H = hn + 16;
        // grow along the dragged corner (the larger of the two axis changes wins)
        const sx = (cur.dir.includes('e') ? ddx : -ddx) / (W * k0), sy = (cur.dir.includes('s') ? ddy : -ddy) / (H * k0);
        const k = Math.min(4, Math.max(0.4, k0 * (1 + (Math.abs(sx) > Math.abs(sy) ? sx : sy))));
        // keep the opposite corner fixed (content origin sits 8 units inside the box)
        const x = cur.dir.includes('w') ? x0 + (W - 8) * k0 - (W - 8) * k : x0;
        const y = cur.dir.includes('n') ? y0 + hn * k0 - hn * k : y0;
        A().live((d) => ({ ...d, legend: { ...d.legend, x: Math.round(x), y: Math.round(y), auto: false, scale: Math.round(k * 100) / 100 } }));
      } else if (cur.mode === 'resize') {
        const ddx = world.x - cur.startWorld.x, ddy = world.y - cur.startWorld.y;
        const st = cur.start;
        let { dx, dy, w, h } = st;
        const MINW = 50, MINH = 36;
        if (cur.dir.includes('e')) w = Math.max(MINW, st.w + ddx);
        if (cur.dir.includes('w')) { w = Math.max(MINW, st.w - ddx); dx = st.dx + st.w - w; }
        if (cur.dir.includes('s')) h = Math.max(MINH, st.h + ddy);
        if (cur.dir.includes('n')) { h = Math.max(MINH, st.h - ddy); dy = st.dy + st.h - h; }
        if (e.shiftKey && cur.dir.length === 2) { // keep aspect ratio on corners
          const k = Math.max(w / st.w, h / st.h);
          const nw = st.w * k, nh = st.h * k;
          if (cur.dir.includes('w')) dx = st.dx + st.w - nw;
          if (cur.dir.includes('n')) dy = st.dy + st.h - nh;
          w = nw; h = nh;
        }
        const r = (v: number) => Math.round(v);
        A().live((d) => ({ ...d, plots: { ...d.plots, [cur.id]: { ...d.plots[cur.id], dx: r(dx), dy: r(dy), w: r(w), h: r(h) } } }));
      }
      else if (cur.mode === 'box' || cur.mode === 'connect') setGesture({ ...cur, cur: world });
      else if (cur.mode === 'bend') {
        const s = useStore.getState();
        const r = s.doc.reactions[cur.rid];
        const a = s.doc.nodes[r.sources[0]], b = s.doc.nodes[r.targets[0]];
        if (!a || !b) return;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const bend = Math.round(((world.x - mid.x) * n.x + (world.y - mid.y) * n.y) * (r.labelFlip ? -1 : 1));
        A().live((d) => ({ ...d, reactions: { ...d.reactions, [cur.rid]: { ...d.reactions[cur.rid], bend, routing: Math.abs(bend) > 2 ? 'curved' : 'straight' } } }));
      } else if (cur.mode === 'drag') {
        let dx = world.x - cur.startWorld.x, dy = world.y - cur.startWorld.y;
        if (!cur.moved) {
          if (Math.hypot(dx, dy) * useStore.getState().camera.k < 3) return;
          A().beginGesture();
          cur.moved = true;
        }
        if (e.shiftKey) {
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const l = dx * Math.cos(ang) + dy * Math.sin(ang);
          dx = l * Math.cos(ang); dy = l * Math.sin(ang);
        }
        const p0 = cur.primary && cur.start[cur.primary] ? cur.start[cur.primary] : Object.values(cur.start)[0];
        const newGuides: { x?: number; y?: number } = {};
        if (p0) {
          const nx = p0.x + dx, ny = p0.y + dy;
          let sx = snapV(nx), sy = snapV(ny);
          if (canvas.smartGuides && !e.altKey && cur.primary?.startsWith('node:')) {
            const k = useStore.getState().camera.k;
            const tol = 6 / k;
            let bx = tol, by = tol;
            for (const n of Object.values(useStore.getState().doc.nodes)) {
              if (cur.start[key('node', n.id)]) continue;
              if (Math.abs(n.x - nx) < bx) { bx = Math.abs(n.x - nx); sx = n.x; newGuides.x = n.x; }
              if (Math.abs(n.y - ny) < by) { by = Math.abs(n.y - ny); sy = n.y; newGuides.y = n.y; }
            }
          }
          if (!e.shiftKey) { dx = sx - p0.x; dy = sy - p0.y; }
        }
        setGuides(newGuides);
        A().moveFrom(cur.start, dx, dy);
        // merge target: a single node dragged over another node of the same metabolite
        const keys = Object.keys(cur.start);
        let mt: typeof mergeTarget = null;
        if (keys.length === 1 && keys[0].startsWith('node:') && p0) {
          const st = useStore.getState();
          const fromId = parseKey(keys[0] as SelKey)[1];
          const met = st.doc.nodes[fromId]?.metaboliteId;
          if (met) {
            const px = p0.x + dx, py = p0.y + dy, tol = Math.max(14, 18 / st.camera.k);
            let best = tol;
            for (const n of Object.values(st.doc.nodes)) {
              if (n.id === fromId || n.metaboliteId !== met) continue;
              const d = Math.hypot(n.x - px, n.y - py);
              if (d < best) { best = d; mt = { from: fromId, into: n.id, x: n.x, y: n.y }; }
            }
          }
        }
        if (mt?.into !== mergeRef.current?.into) { mergeRef.current = mt; setMergeTarget(mt); }
      }
    };
    const up = (e: PointerEvent) => {
      const cur = g.current;
      cancelHold();
      setGesture(null);
      setGuides({});
      if (!cur) return;
      if (cur.mode === 'pan' && cur.fromRight && cur.moved) suppressCtx.current = true;
      const s = useStore.getState();
      if (cur.mode === 'box') {
        const x0 = Math.min(cur.start.x, cur.cur.x), x1 = Math.max(cur.start.x, cur.cur.x);
        const y0 = Math.min(cur.start.y, cur.cur.y), y1 = Math.max(cur.start.y, cur.cur.y);
        if ((x1 - x0) * s.camera.k < 3 && (y1 - y0) * s.camera.k < 3) return;
        const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
        const keys: SelKey[] = [];
        for (const n of Object.values(s.doc.nodes)) if (!n.locked && inside(n)) keys.push(key('node', n.id));
        for (const r of Object.values(s.doc.reactions)) if (!r.locked && [...r.sources, ...r.targets].every((id) => s.doc.nodes[id] && inside(s.doc.nodes[id]))) keys.push(key('reaction', r.id));
        for (const t of Object.values(s.doc.texts)) if (!t.locked && inside(t)) keys.push(key('text', t.id));
        for (const p of Object.values(s.doc.plots)) { const a = plotAnchorApprox(s.doc, p.anchor); if (!p.locked && a && inside({ x: a.x + p.dx + p.w / 2, y: a.y + p.dy + p.h / 2 })) keys.push(key('plot', p.id)); }
        A().select(keys, cur.additive);
      } else if (cur.mode === 'drag') {
        if (!cur.moved && cur.deferSelect) A().select([cur.deferSelect]);
        const mt = mergeRef.current;
        mergeRef.current = null;
        setMergeTarget(null);
        if (mt) A().mergeNodes(mt.from, mt.into);
      } else if (cur.mode === 'connect') {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const tk = el?.closest('[data-sel^="node:"]')?.getAttribute('data-sel') ?? el?.closest('[data-handle]')?.getAttribute('data-handle');
        const tid = tk ? (tk.startsWith('node:') ? parseKey(tk)[1] : tk) : null;
        const from = s.doc.nodes[cur.from];
        if (tid && tid !== cur.from) {
          const to = s.doc.nodes[tid];
          if (s.model && from?.metaboliteId && to?.metaboliteId) A().requestConnection(cur.from, tid);
          else A().addReaction([cur.from], [tid], {}, false);
        } else if (!tid && from && Math.hypot(cur.cur.x - from.x, cur.cur.y - from.y) > 20) {
          // dropped on empty canvas: create a new slot + arrow (fast skeleton drawing)
          const p = { x: snapV(cur.cur.x), y: snapV(cur.cur.y) };
          const nid = A().addNode(p, { label: `M${Object.keys(s.doc.nodes).length + 1}` });
          A().addReaction([cur.from], [nid], {}, false);
          useStore.setState({ selection: [key('node', nid)] });
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture?.mode]);

  const onDoubleClick = (e: React.MouseEvent) => {
    const rawKey = (e.target as Element).closest('[data-sel]')?.getAttribute('data-sel');
    const selKey = rawKey && !A().isLocked(rawKey) ? rawKey : null;
    const world = toWorld(e.clientX, e.clientY);
    const s = useStore.getState();
    if (s.design) {
      // Template Design Mode: double-click = define what the element is
      const [k0, id0] = selKey ? parseKey(selKey) : [null, ''];
      if (!selKey) { designActions.addMetaboliteAt({ x: snapV(world.x), y: snapV(world.y) }); return; }
      if (k0 === 'node' && s.doc.nodes[id0]?.design?.kind === 'metabolite') { useStore.setState({ selection: [selKey], dialog: { kind: 'identity', nodeId: id0 } }); return; }
      if (k0 === 'node') { useStore.setState({ selection: [selKey] }); return; }
      if (k0 === 'reaction' && s.doc.reactions[id0]?.design?.kind === 'reaction') { useStore.setState({ selection: [selKey], dialog: { kind: 'identity', reactionId: s.doc.reactions[id0].design!.id } }); return; }
    }
    if (!selKey) {
      if (s.model) useStore.setState({ dialog: { kind: 'metabolite', at: { x: snapV(world.x), y: snapV(world.y) } } });
      else A().addNode(world, { label: `M${Object.keys(s.doc.nodes).length + 1}` });
      return;
    }
    const [kind, id] = parseKey(selKey);
    if (kind === 'node') {
      if (s.model) useStore.setState({ dialog: { kind: 'metabolite', at: world, bindNodeId: id } });
      else setEditing({ id: selKey, value: s.doc.nodes[id].label ?? '' });
    } else if (kind === 'text') setEditing({ id: selKey, value: s.doc.texts[id].text });
    else if (kind === 'reaction') setEditing({ id: selKey, value: s.doc.reactions[id].label ?? s.doc.reactions[id].reactionId ?? '' });
    else if (kind === 'group') setEditing({ id: selKey, value: s.doc.groups[id].title });
  };

  const commitEdit = () => {
    if (!editing) return;
    const [kind, id] = parseKey(editing.id);
    const v = editing.value;
    if (kind === 'node') A().updateNode(id, { label: v || undefined });
    else if (kind === 'text') A().updateText(id, { text: v || 'Text' });
    else if (kind === 'reaction') A().updateReaction(id, { label: v || undefined });
    else if (kind === 'group') A().updateGroup(id, { title: v });
    setEditing(null);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (suppressCtx.current) { suppressCtx.current = false; return; } // it was a right-drag pan
    const selKey = (e.target as Element).closest('[data-sel]')?.getAttribute('data-sel') ?? null;
    const s = useStore.getState();
    if (selKey && !s.selection.includes(selKey) && !A().isLocked(selKey)) A().select([selKey]);
    const r = wrap.current!.getBoundingClientRect();
    useStore.setState({ contextMenu: { x: e.clientX - r.left, y: e.clientY - r.top, target: selKey, world: toWorld(e.clientX, e.clientY) } });
  };

  const gs = canvas.gridSize * camera.k;
  const showGrid = canvas.showGrid && gs >= 4;
  const conn = gesture?.mode === 'connect' ? gesture : null;
  const connFrom = conn ? doc.nodes[conn.from] : null;
  const box = gesture?.mode === 'box' ? gesture : null;

  // bend handle for a single selected reaction
  const selReaction = selection.length === 1 && selection[0].startsWith('reaction:') ? doc.reactions[parseKey(selection[0])[1]] : null;
  let bendHandle: Point | null = null;
  if (selReaction && selReaction.sources.length === 1 && selReaction.targets.length === 1 && selReaction.routing !== 'orthogonal') {
    const a = doc.nodes[selReaction.sources[0]], b = doc.nodes[selReaction.targets[0]];
    if (a && b) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const sgn = selReaction.labelFlip ? -1 : 1;
      const n = { x: (-(b.y - a.y) / len) * sgn, y: ((b.x - a.x) / len) * sgn };
      const bend = selReaction.routing === 'curved' ? (selReaction.bend ?? len * 0.15) : (selReaction.bend ?? 0);
      bendHandle = { x: (a.x + b.x) / 2 + n.x * bend, y: (a.y + b.y) / 2 + n.y * bend };
    }
  }

  const editingPos = (() => {
    if (!editing) return null;
    const [kind, id] = parseKey(editing.id);
    let p: Point | null = null;
    if (kind === 'node') p = doc.nodes[id];
    else if (kind === 'text') p = { x: doc.texts[id].x, y: doc.texts[id].y - doc.texts[id].size };
    else if (kind === 'reaction') p = plotAnchorApprox(doc, { kind: 'reaction', id });
    else if (kind === 'group') { const n = doc.groups[id].nodeIds.map((x) => doc.nodes[x]).filter(Boolean); p = { x: Math.min(...n.map((q) => q.x)) - 20, y: Math.min(...n.map((q) => q.y)) - 40 }; }
    return p ? { left: p.x * camera.k + camera.x, top: p.y * camera.k + camera.y } : null;
  })();

  const cursor = gesture?.mode === 'pan' && (!gesture.fromRight || gesture.moved) ? 'grabbing' : tool === 'pan' || spaceHeld ? 'grab' : placing ? 'copy' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
  // where the preview is drawn: centred on the cursor (the middle of the view before the mouse moves)
  const ghostAt = placing && placingBox ? (() => {
    const c = ghost ?? { x: (svgRef.current?.clientWidth ?? 800) / 2 / camera.k - camera.x / camera.k, y: (svgRef.current?.clientHeight ?? 600) / 2 / camera.k - camera.y / camera.k };
    return { x: c.x - (placingBox.x + placingBox.w / 2), y: c.y - (placingBox.y + placingBox.h / 2) };
  })() : null;

  return (
    <div className="canvas" ref={wrap} style={{ background: theme.background === '#ffffff' ? '#f7f7f8' : '#0b0d10' }}>
      <svg ref={svgRef} className={`canvas-svg tool-${tool}`} style={{ cursor }} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
        onPointerMove={placing ? (e) => setGhost(toWorld(e.clientX, e.clientY)) : undefined}>
        <defs>
          <pattern id="gridDots" width={gs} height={gs} patternUnits="userSpaceOnUse" patternTransform={`translate(${camera.x},${camera.y})`}>
            <circle cx={0.75} cy={0.75} r={0.75} fill={theme.background === '#ffffff' ? '#c9ccd3' : '#2b3038'} />
          </pattern>
          <pattern id="gridMajor" width={gs * 5} height={gs * 5} patternUnits="userSpaceOnUse" patternTransform={`translate(${camera.x},${camera.y})`}>
            <circle cx={1} cy={1} r={1.1} fill={theme.background === '#ffffff' ? '#aeb2bb' : '#3b414b'} />
          </pattern>
        </defs>
        {showGrid && <rect className="ui-only" width="100%" height="100%" fill="url(#gridDots)" />}
        {showGrid && <rect className="ui-only" width="100%" height="100%" fill="url(#gridMajor)" />}
        <g transform={`translate(${camera.x},${camera.y}) scale(${camera.k})`}>
          <g id="scene-root">
            <Scene doc={doc} model={model} datasets={datasets} conditions={conditions} view={view} style={style} theme={theme} ev={ev} selected={selectedSet} particles={particles} interactive />
          </g>
          {guides.x != null && <line x1={guides.x} x2={guides.x} y1={-1e5} y2={1e5} stroke="#e8505b" strokeWidth={0.8 / camera.k} strokeDasharray={`${4 / camera.k} ${3 / camera.k}`} />}
          {guides.y != null && <line y1={guides.y} y2={guides.y} x1={-1e5} x2={1e5} stroke="#e8505b" strokeWidth={0.8 / camera.k} strokeDasharray={`${4 / camera.k} ${3 / camera.k}`} />}
          {mergeTarget && (
            <g pointerEvents="none">
              <circle cx={mergeTarget.x} cy={mergeTarget.y} r={22 / Math.sqrt(camera.k)} fill="rgba(46,160,90,0.12)" stroke="#2ea05a" strokeWidth={2 / camera.k} strokeDasharray={`${4 / camera.k} ${2 / camera.k}`} />
              <text x={mergeTarget.x} y={mergeTarget.y - 26 / Math.sqrt(camera.k)} textAnchor="middle" fontSize={11 / camera.k} fontWeight={600} fill="#2ea05a">release to merge</text>
            </g>
          )}
          {connFrom && conn && <line x1={connFrom.x} y1={connFrom.y} x2={conn.cur.x} y2={conn.cur.y} stroke="#4f5bd5" strokeWidth={1.5 / camera.k} strokeDasharray={`${5 / camera.k} ${3 / camera.k}`} pointerEvents="none" />}
          {box && <rect x={Math.min(box.start.x, box.cur.x)} y={Math.min(box.start.y, box.cur.y)} width={Math.abs(box.cur.x - box.start.x)} height={Math.abs(box.cur.y - box.start.y)} fill="rgba(79,91,213,0.08)" stroke="#4f5bd5" strokeWidth={1 / camera.k} pointerEvents="none" />}
          {bendHandle && <circle data-bend={selReaction!.id} cx={bendHandle.x} cy={bendHandle.y} r={4.5 / camera.k} fill="#fff" stroke="#4f5bd5" strokeWidth={1.5 / camera.k} style={{ cursor: 'move' }} />}
          {placing && ghostAt && placingEv && placingBox && (
            <g className="ui-only place-ghost" pointerEvents="none" transform={`translate(${ghostAt.x},${ghostAt.y})`}>
              <rect x={placingBox.x - 12} y={placingBox.y - 12} width={placingBox.w + 24} height={placingBox.h + 24} rx={10 / camera.k}
                fill="rgba(79,91,213,0.04)" stroke="#4f5bd5" strokeOpacity={0.6} strokeWidth={1.2 / camera.k} strokeDasharray={`${6 / camera.k} ${4 / camera.k}`} />
              <g opacity={0.42}>
                <Scene doc={placing.preview} model={model} datasets={[]} conditions={[]} view={view} style={style} theme={theme} ev={placingEv} selected={noSelection} particles={false} interactive={false} />
              </g>
            </g>
          )}
        </g>
      </svg>
      {placing && (
        <div className="place-hint">
          Placing <b>{placing.name}</b> — click where it goes · <kbd>Esc</kbd> or right-click to cancel · <kbd>Space</kbd>+drag to pan
        </div>
      )}
      {editing && editingPos && (
        <input
          className="inline-edit" autoFocus value={editing.value} style={editingPos}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); e.stopPropagation(); }}
          onBlur={commitEdit}
        />
      )}
      {hold && (
        <div className="hold-ring" style={{ left: hold.x, top: hold.y }} title="Keep holding to unlock">
          <svg width="2.125rem" height="2.125rem" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" className="hold-track" /><circle cx="17" cy="17" r="14" className="hold-progress" /></svg>
          <span>unlock</span>
        </div>
      )}
      {!gesture && <ContextToolbar />}
      <Minimap />
      {Object.keys(doc.nodes).length === 0 && <EmptyHint />}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="empty-hint">
      <div className="empty-title">Start a pathway figure</div>
      <div className="empty-row"><kbd>double-click</kbd> add a metabolite · <kbd>M</kbd> metabolite tool · <kbd>S</kbd> empty slot</div>
      <div className="empty-row">drag from a node's outer ring to draw a reaction · drop on empty space to extend the chain</div>
      <div className="empty-row">or insert a <b>template</b> from the left panel · <kbd>Ctrl K</kbd> for everything</div>
      <button className="btn primary" onClick={() => import('../demo/demo').then((m) => A().loadProject(m.demoProject()))}>Open the central carbon demo</button>
    </div>
  );
}
