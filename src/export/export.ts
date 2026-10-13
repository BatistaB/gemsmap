import { kvGet, kvPut } from '../store/kv';
import { PROJECT_EXTENSION } from '../store/project';
import { useStore } from '../store/store';
import { THEMES } from '../viz/presets';

export interface ExportOptions {
  /** 'gif' = animation across conditions (export/gif.tsx) */
  format: 'svg' | 'png' | 'pdf' | 'gif';
  background: 'white' | 'transparent';
  /** Target width in mm (0 = natural size, 1 world unit = 1 pt) */
  widthMm: number;
  heightMm: number;
  dpi: number;
  margin: number;
  /** 'all' = whole figure, 'view' = what is visible on screen, 'selection' = bounding box of the selection */
  area?: 'all' | 'view' | 'selection';
}

type Rect = { x: number; y: number; w: number; h: number };

/** World-space rectangle of a live element (works for transformed / rotated items). */
function worldRect(el: Element): Rect | null {
  const svg = document.querySelector('.canvas-svg') as SVGSVGElement | null;
  if (!svg) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  const s = svg.getBoundingClientRect();
  const c = useStore.getState().camera;
  return { x: (r.left - s.left - c.x) / c.k, y: (r.top - s.top - c.y) / c.k, w: r.width / c.k, h: r.height / c.k };
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The region to export, or null for the whole figure. */
function exportRegion(area: ExportOptions['area']): Rect | null {
  const st = useStore.getState();
  if (area === 'view') {
    // measure the real canvas size (the stored viewport can lag behind panel toggles)
    const r = document.querySelector('.canvas-svg')?.getBoundingClientRect();
    const w = r?.width || st.viewport.w, h = r?.height || st.viewport.h;
    return { x: -st.camera.x / st.camera.k, y: -st.camera.y / st.camera.k, w: w / st.camera.k, h: h / st.camera.k };
  }
  if (area === 'selection') {
    let box: Rect | null = null;
    for (const k of st.selection) {
      const el = document.querySelector(`#scene-root [data-sel="${CSS.escape(k)}"]`);
      const r = el && worldRect(el);
      if (!r) continue;
      box = !box ? r : { x: Math.min(box.x, r.x), y: Math.min(box.y, r.y), w: Math.max(box.x + box.w, r.x + r.w) - Math.min(box.x, r.x), h: Math.max(box.y + box.h, r.y + r.h) - Math.min(box.y, r.y) };
    }
    if (!box) throw new Error('Select something to export the selection');
    return box;
  }
  return null;
}

const NS = 'http://www.w3.org/2000/svg';
const PT_PER_MM = 72 / 25.4;

/** Build a clean, editable SVG (no UI chrome, no grid, attributes only). */
export function buildSvg(opts: ExportOptions): { svg: string; wMm: number; hMm: number } {
  const live = document.getElementById('scene-root') as SVGGElement | null;
  if (!live) throw new Error('Nothing to export');
  const clone = live.cloneNode(true) as SVGGElement;
  const region = exportRegion(opts.area);
  if (region) {
    // drop every item that does not touch the region (keeps the SVG small and the artboard clean)
    const liveRoot = live.firstElementChild, cloneRoot = clone.firstElementChild;
    if (liveRoot && cloneRoot) {
      const liveItems = Array.from(liveRoot.children), cloneItems = Array.from(cloneRoot.children);
      liveItems.forEach((layer, li) => {
        const cl = cloneItems[li];
        if (!cl) return;
        if (layer.id) {
          const lc = Array.from(layer.children), cc = Array.from(cl.children);
          lc.forEach((item, i) => { const r = worldRect(item); if (!r || !overlaps(r, region)) cc[i]?.remove(); });
        } else {
          const r = worldRect(layer);
          if (!r || !overlaps(r, region)) cl.remove();
        }
      });
    }
  }
  clone.querySelectorAll('.ui-only').forEach((e) => e.remove());
  clone.querySelectorAll('*').forEach((e) => {
    for (const a of Array.from(e.attributes)) if (a.name.startsWith('data-') || a.name === 'class') e.removeAttribute(a.name);
    const st = (e as SVGElement).style;
    if (st) { st.removeProperty('transition'); if (!e.getAttribute('style')?.trim()) e.removeAttribute('style'); }
  });
  clone.removeAttribute('id');

  // measure in an off-screen svg
  const tmp = document.createElementNS(NS, 'svg');
  tmp.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:10px;height:10px');
  tmp.appendChild(clone);
  document.body.appendChild(tmp);
  const bb = clone.getBBox();
  document.body.removeChild(tmp);

  const m = opts.margin;
  // the visible area is exported exactly as framed on screen; other modes fit the content
  const vb = opts.area === 'view' && region ? { ...region } : region ? { x: region.x - m, y: region.y - m, w: region.w + 2 * m, h: region.h + 2 * m } : { x: bb.x - m, y: bb.y - m, w: bb.width + 2 * m, h: bb.height + 2 * m };
  if (!vb.w || !vb.h) throw new Error('Nothing to export in this area');
  // natural size: 1 world unit = 1 pt
  let wMm = vb.w / PT_PER_MM, hMm = vb.h / PT_PER_MM;
  if (opts.widthMm > 0) { const s = opts.widthMm / wMm; wMm *= s; hMm *= s; }
  if (opts.heightMm > 0 && opts.widthMm > 0 && hMm > opts.heightMm) { const s = opts.heightMm / hMm; wMm *= s; hMm *= s; }

  const theme = THEMES[useStore.getState().style.preset];
  const bg = opts.background === 'white' ? `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${theme.background}"/>` : '';
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="${NS}" version="1.1" width="${wMm.toFixed(2)}mm" height="${hMm.toFixed(2)}mm" viewBox="${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}" font-family="${theme.font}">\n` +
    `<title>${escapeXml(useStore.getState().name)}</title>\n${bg}\n` +
    new XMLSerializer().serializeToString(clone).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '') +
    `\n</svg>`;
  return { svg, wMm, hMm };
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

export function download(name: string, data: Blob | string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safeName = () => useStore.getState().name.replace(/[^\w.-]+/g, '_') || 'figure';

export async function exportFigure(opts: ExportOptions): Promise<string> {
  const { svg, wMm, hMm } = buildSvg(opts);
  const base = safeName();
  if (opts.format === 'svg') {
    download(`${base}.svg`, svg, 'image/svg+xml');
    return `${base}.svg · ${wMm.toFixed(0)} × ${hMm.toFixed(0)} mm`;
  }
  if (opts.format === 'pdf') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Pop-up blocked — allow pop-ups to print to PDF');
    w.document.write(`<!doctype html><title>${escapeXml(base)}</title><style>@page{size:${wMm.toFixed(2)}mm ${hMm.toFixed(2)}mm;margin:0}html,body{margin:0}svg{display:block}</style>${svg.replace(/^<\?xml[^>]*>/, '')}<script>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();
    return 'Opened print dialog — choose “Save as PDF” (vector)';
  }
  const { blob, pxW, pxH } = await svgToPng(svg, wMm, hMm, opts.dpi);
  download(`${base}_${opts.dpi}dpi.png`, blob);
  return `${base}_${opts.dpi}dpi.png · ${pxW} × ${pxH} px`;
}

/** Open an SVG in a print window, sized to the figure, so the browser saves a vector PDF. */
export function printSvgAsPdf(svg: string, title: string, wMm: number, hMm: number) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to print to PDF');
  w.document.write(`<!doctype html><title>${escapeXml(title)}</title><style>@page{size:${wMm.toFixed(2)}mm ${hMm.toFixed(2)}mm;margin:0}html,body{margin:0}svg{display:block}</style>${svg.replace(/^<\?xml[^>]*>/, '')}<script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}

/** Rasterise an SVG of the given physical size at `dpi`, with the DPI written into the PNG. */
export async function svgToPng(svg: string, wMm: number, hMm: number, dpi: number): Promise<{ blob: Blob; pxW: number; pxH: number }> {
  const pxW = Math.round((wMm / 25.4) * dpi);
  const pxH = Math.round((hMm / 25.4) * dpi);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Rasterisation failed')); img.src = url; });
  const c = document.createElement('canvas');
  c.width = pxW; c.height = pxH;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, pxW, pxH);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  return { blob: await setPngDpi(blob, dpi), pxW, pxH };
}

/** Write a pHYs chunk so journals/Word read the intended DPI. */
async function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 25; // signature + IHDR chunk
  const out = new Uint8Array(buf.length + 21);
  out.set(buf.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(buf.subarray(ihdrEnd), ihdrEnd + 21);
  return new Blob([out], { type: 'image/png' });
}

let crcTable: number[] | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable.push(c >>> 0); }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------- project files

export function saveProjectFile() {
  const p = useStore.getState().actions.toProjectFile();
  download(`${safeName()}${PROJECT_EXTENSION}`, JSON.stringify(p), 'application/json');
}

const AUTOSAVE = 'gemsmap.autosave';
// Large GEMs (ecModels: >10 MB) do not fit localStorage (~5 MB): the model goes to IndexedDB instead.
const IDB_MODEL = 'autosave.model';
const BIG_MODEL = 2e6;
/** How often the temporary session is written (only when something changed). */
export const AUTOSAVE_EVERY_MS = 5 * 60 * 1000;
let savedModel: unknown = null;
let dirty = false;
let rotated = false;

/** Write the temporary session now (localStorage, with a large model in IndexedDB). */
export function saveTempSession() {
  const st = useStore.getState();
  if (st.design) return; // Template Design Mode holds a template, not the map
  // the first write of a session keeps the previous temporary session one step back
  if (!rotated) {
    rotated = true;
    try { const old = localStorage.getItem(AUTOSAVE); if (old) localStorage.setItem(`${AUTOSAVE}.previous`, old); } catch { /* ignore */ }
    void kvGet<string>(IDB_MODEL).then((m) => { if (m) void kvPut(`${IDB_MODEL}.previous`, m); });
  }
  const p = { ...st.actions.toProjectFile(), _savedAt: Date.now() };
  const modelJson = p.model ? JSON.stringify(p.model) : '';
  let out: string;
  if (modelJson.length > BIG_MODEL) {
    if (savedModel !== st.model) { savedModel = st.model; void kvPut(IDB_MODEL, modelJson); }
    out = JSON.stringify({ ...p, model: null, _modelInIdb: p.model!.id });
  } else out = JSON.stringify(p);
  try { localStorage.setItem(AUTOSAVE, out); }
  catch {
    // still too big (huge datasets): keep the figure, drop the model
    try { localStorage.setItem(AUTOSAVE, JSON.stringify({ ...p, model: null, _modelDropped: true })); } catch { /* ignore */ }
  }
  dirty = false;
}

/**
 * Temporary session: written every 5 minutes when the map changed. The app never reopens it by itself —
 * the start-up banner offers to continue it (store/recovery.tsx), so a session that crashes the page
 * cannot lock the app.
 */
export function startAutosave() {
  useStore.subscribe((s, prev) => {
    if (s.design) return;
    if (s.doc === prev.doc && s.mappings === prev.mappings && s.datasets === prev.datasets && s.model === prev.model && s.style === prev.style && s.view === prev.view && s.name === prev.name) return;
    dirty = true;
  });
  window.setInterval(() => { if (dirty) saveTempSession(); }, AUTOSAVE_EVERY_MS);
}
export function loadAutosave() {
  try { const t = localStorage.getItem(AUTOSAVE); return t ? JSON.parse(t) : null; } catch { return null; }
}
/** The model of an autosave that stored it in IndexedDB (see startAutosave). */
export async function loadAutosavedModel(): Promise<unknown> {
  const t = await kvGet<string>(IDB_MODEL);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}
