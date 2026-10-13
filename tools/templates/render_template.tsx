/**
 * Render a template file to SVG (and PNG) with the app's own Scene component — the picture a person sees in
 * Template Design Mode, without opening the app. Used to review hand-made layouts and to make preview images.
 *
 *   npm run template:render -- <file.gemsmap-template.json> <out.svg> [--png <out.png>] [--scale 2]
 *
 * PNG conversion uses a local headless Edge / Chrome.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultStyle } from '../../src/store/project';
import { fileToDoc } from '../../src/templates/design/convert';
import { layoutQcOfDoc } from '../../src/templates/format/layoutQc';
import { parseTemplateJson } from '../../src/templates/format/parse';
import { Scene } from '../../src/ui/Scene';
import { evaluate } from '../../src/viz/evaluate';
import { THEMES } from '../../src/viz/presets';
import type { ViewState } from '../../src/viz/types';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const [src, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!src || !out) { console.error('usage: npm run template:render -- <file.gemsmap-template.json> <out.svg> [--png <out.png>] [--scale 2]'); process.exit(2); }
const parsed = parseTemplateJson(readFileSync(src, 'utf8'));
if (!parsed.file) { console.error(parsed.errors.join('\n')); process.exit(1); }

const doc = fileToDoc(parsed.file);
const style = defaultStyle();
const theme = THEMES[style.preset];
const view: ViewState = { activeCondition: '', compare: 'absolute', reference: '' };
const ev = evaluate(doc, [], [], view, [], style, theme);
const b = layoutQcOfDoc(doc).bounds;
const m = 24;
const vb = { x: Math.floor(b.x - m), y: Math.floor(b.y - m), w: Math.ceil(b.w + 2 * m), h: Math.ceil(b.h + 2 * m) };
const body = renderToStaticMarkup(
  <Scene doc={doc} model={null} datasets={[]} conditions={[]} view={view} style={style} theme={theme} ev={ev} selected={new Set()} particles={false} interactive={false} />,
);
const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${vb.w}" height="${vb.h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" font-family="${theme.font}">` +
  `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${theme.background}"/>${body}</svg>\n`;
writeFileSync(out, svg, 'utf8');
console.log(`written ${out} (${vb.w} × ${vb.h})`);

const png = opt('--png');
if (png) {
  const scale = +(opt('--scale') ?? 2);
  const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((p) => existsSync(p));
  if (!browser) { console.error('no Edge / Chrome found for the PNG'); process.exit(1); }
  const html = out.replace(/\.svg$/, '.render.html');
  writeFileSync(html, `<!doctype html><html><body style="margin:0">${svg.replace(/^<\?xml[^>]*>\n/, '')}</body></html>`, 'utf8');
  // a fresh profile each time: a headless browser still holding a shared profile hands the job over and writes nothing
  rmSync(png, { force: true });
  let r = spawnSync(process.execPath, ['-e', '']);
  for (let attempt = 0; attempt < 3 && !existsSync(png); attempt++) {
    const profile = mkdtempSync(join(tmpdir(), 'gemsmap-render-'));
    r = spawnSync(browser, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--hide-scrollbars', `--force-device-scale-factor=${scale}`, `--window-size=${vb.w},${vb.h}`, `--screenshot=${resolve(png)}`, pathToFileURL(resolve(html)).href], { stdio: 'pipe' });
    // the launcher can return before its headless child has written the file
    for (let i = 0; i < 50 && !existsSync(png); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold a file for a moment */ }
  }
  if (r.status !== 0 || !existsSync(png)) { console.error(r.stderr?.toString() || `screenshot failed (exit ${r.status}${r.error ? `, ${r.error.message}` : ''})`); process.exit(1); }
  console.log(`written ${png} (×${scale})`);
}
