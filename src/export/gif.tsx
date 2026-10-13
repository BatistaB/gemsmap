/**
 * Animated GIF of the figure across conditions (e.g. 30 h → 56 h → 80 h).
 *
 * Each frame is the same scene rendered off-screen with another active condition, using the same
 * viewBox as the static export (area, size, margin and background options apply). Optional tween
 * frames interpolate arrow widths, colours and node sizes so changes read as motion. A label with
 * the condition name can be stamped in a corner.
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useStore } from '../store/store';
import { evaluate, type Evaluated, type NodeVisual, type ReactionVisual } from '../viz/evaluate';
import { THEMES } from '../viz/presets';
import { Scene } from '../ui/Scene';
import { buildSvg, download, type ExportOptions } from './export';

export interface GifOptions {
  /** Condition ids, in playback order. */
  conditions: string[];
  /** Seconds each condition is held. */
  hold: number;
  /** Interpolated frames between two conditions (0 = hard cut). */
  tween: number;
  /** Stamp the condition name on each frame. */
  label: boolean;
  /** Resolution applied to the export size in mm (like PNG); capped by GIF_MAX_SIDE / GIF_MAX_PIXELS. */
  dpi: number;
  /** Return to the first condition at the end (smooth loop). */
  loopBack: boolean;
}

const NS = 'http://www.w3.org/2000/svg';

// ------------------------------------------------------------------ interpolation
function parseColor(c: string): [number, number, number] | null {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (h) {
    const s = h[1].length === 3 ? h[1].split('').map((x) => x + x).join('') : h[1];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  const m = /^rgba?\(([^)]+)\)/i.exec(c.trim());
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2]]; }
  return null;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpColor(a: string, b: string, t: number): string {
  const ca = parseColor(a), cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  return `rgb(${ca.map((v, i) => Math.round(lerp(v, cb[i], t))).join(',')})`;
}
function tweenEv(a: Evaluated, b: Evaluated, t: number): Evaluated {
  const reactions: Record<string, ReactionVisual> = {};
  for (const id of new Set([...Object.keys(a.reactions), ...Object.keys(b.reactions)])) {
    const x = a.reactions[id], y = b.reactions[id];
    if (!x || !y) { reactions[id] = (t < 0.5 ? x : y) ?? x ?? y; continue; }
    const near = t < 0.5 ? x : y;
    reactions[id] = {
      ...near,
      value: x.value != null && y.value != null ? lerp(x.value, y.value, t) : near.value,
      width: lerp(x.width, y.width, t),
      color: lerpColor(x.color, y.color, t),
      opacity: lerp(x.opacity, y.opacity, t),
    };
  }
  const nodes: Record<string, NodeVisual> = {};
  for (const id of new Set([...Object.keys(a.nodes), ...Object.keys(b.nodes)])) {
    const x = a.nodes[id], y = b.nodes[id];
    if (!x || !y) { nodes[id] = (t < 0.5 ? x : y) ?? x ?? y; continue; }
    nodes[id] = { r: lerp(x.r, y.r, t), fill: lerpColor(x.fill, y.fill, t), opacity: lerp(x.opacity, y.opacity, t), value: t < 0.5 ? x.value : y.value };
  }
  return { reactions, nodes, legend: t < 0.5 ? a.legend : b.legend };
}

// ------------------------------------------------------------------ off-screen rendering
/** Render the scene for one condition into SVG markup (no editor chrome). */
function renderScene(host: HTMLDivElement, root: ReturnType<typeof createRoot>, activeCondition: string, ev: Evaluated): string {
  const s = useStore.getState();
  const theme = THEMES[s.style.preset];
  flushSync(() => {
    root.render(
      <svg xmlns={NS}>
        <g id="gif-scene">
          <Scene doc={s.doc} model={s.model} datasets={s.datasets} conditions={s.conditions} view={{ ...s.view, activeCondition }} style={s.style} theme={theme} ev={ev} selected={new Set()} particles={false} interactive={false} />
        </g>
      </svg>,
    );
  });
  const g = host.querySelector('#gif-scene')!.cloneNode(true) as SVGGElement;
  g.querySelectorAll('.ui-only').forEach((e) => e.remove());
  g.removeAttribute('id');
  return new XMLSerializer().serializeToString(g).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
}

function esc(s: string) { return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!); }

async function rasterise(svg: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Rasterisation failed')); img.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h); // GIF has no partial transparency: always flatten on white
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

/** Largest frame the browser can rasterise reliably (canvas limits) and the GIF format allows. */
export const GIF_MAX_SIDE = 8000;
export const GIF_MAX_PIXELS = 36e6;

/** Frame size in pixels for an export size in mm at `dpi`, after the caps. */
export function gifFrameSize(wMm: number, hMm: number, dpi: number): { w: number; h: number; capped: boolean } {
  let w = Math.round((wMm / 25.4) * dpi), h = Math.round((hMm / 25.4) * dpi);
  const k = Math.min(1, GIF_MAX_SIDE / Math.max(w, h), Math.sqrt(GIF_MAX_PIXELS / Math.max(1, w * h)));
  if (k < 1) { w = Math.round(w * k); h = Math.round(h * k); }
  return { w: Math.max(64, w), h: Math.max(32, h), capped: k < 1 };
}

/** Build and download the GIF. `onProgress` gets 0–1. */
export async function exportGif(opts: ExportOptions, gif: GifOptions, onProgress?: (f: number) => void): Promise<string> {
  const s = useStore.getState();
  const conds = gif.conditions.filter((id) => s.conditions.some((c) => c.id === id));
  if (conds.length < 2) throw new Error('Choose at least two conditions');
  // frame geometry from the static exporter (same area / size / margin rules)
  const { svg: ref, wMm, hMm } = buildSvg({ ...opts, background: 'white' });
  const vbm = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(ref);
  if (!vbm) throw new Error('Could not size the frames');
  const [vx, vy, vw, vh] = vbm.slice(1).map(Number);
  const { w: W, h: H, capped } = gifFrameSize(wMm, hMm, gif.dpi);
  const theme = THEMES[s.style.preset];

  const evs = conds.map((c) => evaluate(s.doc, s.datasets, s.mappings, { ...s.view, activeCondition: c }, s.conditions, s.style, theme));
  type Frame = { cond: string; ev: Evaluated; label: string; delay: number; key: boolean };
  const frames: Frame[] = [];
  const name = (id: string) => s.conditions.find((c) => c.id === id)?.name ?? id;
  const holdMs = Math.max(100, gif.hold * 1000), tweenMs = 60;
  const seq = gif.loopBack ? [...conds.keys(), 0] : [...conds.keys()];
  seq.forEach((i, k) => {
    const last = k === seq.length - 1;
    if (!(gif.loopBack && last)) frames.push({ cond: conds[i], ev: evs[i], label: name(conds[i]), delay: holdMs, key: true });
    if (last) return;
    const j = seq[k + 1];
    for (let t = 1; t <= gif.tween; t++) {
      const f = t / (gif.tween + 1);
      frames.push({ cond: f < 0.5 ? conds[i] : conds[j], ev: tweenEv(evs[i], evs[j], f), label: `${name(conds[i])} → ${name(conds[j])}`, delay: tweenMs, key: false });
    }
  });

  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.appendChild(host);
  const root = createRoot(host);
  const fs = Math.max(10, vw / 40);
  const condColor = (id: string) => s.conditions.find((c) => c.id === id)?.color ?? theme.text;
  const frameSvg = (f: Frame) => {
    const body = renderScene(host, root, f.cond, f.ev);
    const label = gif.label
      ? `<g font-family="${esc(theme.font)}" font-weight="700"><rect x="${vx + fs * 0.6}" y="${vy + fs * 0.5}" width="${fs * 0.5}" height="${fs * 1.1}" rx="${fs * 0.12}" fill="${condColor(f.cond)}"/>` +
        `<text x="${vx + fs * 1.35}" y="${vy + fs * 1.4}" font-size="${fs}" fill="${theme.text}">${esc(f.label)}</text></g>`
      : '';
    return `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="${vx} ${vy} ${vw} ${vh}" font-family="${esc(theme.font)}" text-rendering="geometricPrecision" shape-rendering="geometricPrecision">` +
      `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${opts.background === 'white' ? theme.background : '#ffffff'}"/>${body}${label}</svg>`;
  };
  const keys = frames.filter((f) => f.key);
  const total = keys.length + frames.length;
  let done = 0;
  const tick = async () => { onProgress?.(++done / (total + 1)); await new Promise((r) => setTimeout(r, 0)); };
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    // pass 1 — one palette for the whole animation (no colour flicker), sampled from the key frames.
    // Only a subsample is kept, so high-resolution frames never pile up in memory.
    const step = Math.max(1, Math.floor((W * H * keys.length) / 600_000));
    const sample: number[] = [];
    for (const f of keys) {
      const p = await rasterise(frameSvg(f), W, H);
      for (let k = 0; k < p.length; k += 4 * step) sample.push(p[k], p[k + 1], p[k + 2], 255);
      await tick();
    }
    const palette = quantize(new Uint8Array(sample), 256);
    // pass 2 — render and encode frame by frame
    const enc = GIFEncoder();
    for (let i = 0; i < frames.length; i++) {
      const index = applyPalette(await rasterise(frameSvg(frames[i]), W, H), palette);
      enc.writeFrame(index, W, H, { palette: i === 0 ? palette : undefined, delay: frames[i].delay, repeat: 0 });
      await tick();
    }
    enc.finish();
    bytes = enc.bytes();
  } finally {
    root.unmount();
    host.remove();
  }
  onProgress?.(1);
  const base = s.name.replace(/[^\w.-]+/g, '_') || 'figure';
  const file = `${base}_${conds.map(name).join('-').replace(/[^\w.-]+/g, '_').slice(0, 60)}.gif`;
  download(file, new Blob([bytes], { type: 'image/gif' }));
  return `${file} · ${W} × ${H} px${capped ? ' (capped — choose a size in mm for the full dpi)' : ` · ${gif.dpi} dpi`} · ${frames.length} frames · ${(bytes.length / 1024 / 1024).toFixed(1)} MB`;
}
