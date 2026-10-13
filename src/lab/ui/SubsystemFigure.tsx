/**
 * Publication figures for subsystem views (Results and Compare): bars, heatmap and donut charts,
 * drawn as plain SVG in physical units (1 unit = 1 pt) so that the exported file has the chosen
 * journal width and font size, and can be edited in Illustrator / Inkscape.
 *
 * Scientific rules carried over from the list view:
 * - values are COBRApy fluxes as stored in each result; nothing is recomputed;
 * - FVA results are drawn as intervals only (no midpoint, no heatmap, no pie);
 * - subsystem totals are descriptive sums of |v| over annotated reactions, and a donut slice is a
 *   share of that sum among the shown items — the caption says so;
 * - a reaction absent from a result (imported from another model) is drawn as "no value", never as 0.
 *
 * Form and colour follow the map's figure design: Helvetica, thin recessive axes, blue = flux as
 * written / red = reverse for one result, the map's diverging and sequential palettes for heatmaps,
 * and a fixed categorical order (never cycled) for several results or slices.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { printSvgAsPdf, svgToPng, download } from '../../export/export';
import { FIGURE_SIZES } from '../../viz/presets';
import { getPalette, PALETTES, samplePalette } from '../../viz/palettes';
import { fnum, FLUX_UNIT } from '../format';
import { lab, useLab, type FigOptions } from '../store';
import { subsystemLabel } from '../subsystems';
import { Seg, Toggle } from './common';

export const FWD = '#2a78d6';
export const REV = '#e34948';
export const FVA_COLOR = '#b45309';
/** Validated categorical order (adjacent-pair CVD safe); slot i always belongs to the same item. */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const OTHER = '#b8b8b4';
const INK = '#111111';
const INK2 = '#555555';
const GRID = '#e3e3e0';
const AXIS = '#8a8a86';
const NOVAL = '#f1f1ef';
const FONT = 'Helvetica, Arial, sans-serif';
const PT_PER_MM = 72 / 25.4;

export interface FigSeries {
  id: string;
  name: string;
  color: string;
  flux: Record<string, number | null> | null;
  fva: Record<string, { minimum: number | null; maximum: number | null }> | null;
}

export interface FigGroup {
  key: string;
  /** every reaction of the subsystem (for totals) */
  all: string[];
  /** reactions drawn, already filtered and sorted */
  rids: string[];
}

export interface FigInput {
  series: FigSeries[];
  groups: FigGroup[];
  autoTitle: string;
  tol: number;
  rxnName: (id: string) => string;
  mode: 'combined' | 'separate';
  scale: 'shared' | 'independent';
}

type View = 'bars' | 'heatmap' | 'pie';
type Level = 'reactions' | 'subsystems';

// ------------------------------------------------------------------ helpers

const textW = (s: string, fs: number) => s.length * fs * 0.56;
function trunc(s: string, maxW: number, fs: number) {
  if (textW(s, fs) <= maxW) return s;
  const n = Math.max(1, Math.floor(maxW / (fs * 0.56)) - 1);
  return s.slice(0, n) + '…';
}
const fmtTick = (v: number) => {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 10000 || a < 0.001) return v.toExponential(0);
  return String(+v.toPrecision(3));
};
function luminance(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const inkOn = (hex: string) => (luminance(hex) > 0.36 ? INK : '#ffffff');
const val = (s: FigSeries, id: string): number | null => (s.flux ? s.flux[id] ?? null : null);
const has = (s: FigSeries, id: string) => !!s.flux && id in s.flux;
const groupTotal = (s: FigSeries, g: FigGroup, tol: number) => {
  let t = 0;
  for (const id of g.all) {
    if (s.fva) { const iv = s.fva[id]; if (iv && iv.minimum != null && iv.maximum != null && iv.maximum - iv.minimum >= tol) t += iv.maximum - iv.minimum; }
    else { const v = val(s, id); if (v != null && Math.abs(v) >= tol) t += Math.abs(v); }
  }
  return t;
};

interface Built { w: number; h: number; body: ReactNode }

/** Linear x scale with nice ticks over [lo, hi] (always including 0). */
function xScale(lo: number, hi: number, x0: number, x1: number) {
  lo = Math.min(0, lo); hi = Math.max(0, hi);
  if (hi - lo < 1e-12) hi = lo + 1;
  // nice step (1, 2, 2.5, 5 × 10ⁿ) for about 5 intervals; the axis extends to the outer ticks
  const raw = (hi - lo) / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = a; t <= b + step * 1e-6; t += step) ticks.push(+t.toPrecision(12));
  const sx = (v: number) => x0 + ((v - a) / (b - a)) * (x1 - x0);
  return { sx, ticks };
}

function XAxis({ sx, ticks, y, top, fs, title, x0, x1 }: { sx: (v: number) => number; ticks: number[]; y: number; top: number; fs: number; title: string; x0: number; x1: number }) {
  return (
    <g>
      {ticks.map((t) => <line key={'g' + t} x1={sx(t)} x2={sx(t)} y1={top} y2={y} stroke={t === 0 ? AXIS : GRID} strokeWidth={t === 0 ? 0.6 : 0.4} />)}
      <line x1={x0} x2={x1} y1={y} y2={y} stroke={AXIS} strokeWidth={0.5} />
      {ticks.map((t) => (
        <g key={'t' + t}>
          <line x1={sx(t)} x2={sx(t)} y1={y} y2={y + 2} stroke={AXIS} strokeWidth={0.5} />
          <text x={sx(t)} y={y + 2 + fs} fontSize={fs - 1} textAnchor="middle" fill={INK2}>{fmtTick(t)}</text>
        </g>
      ))}
      <text x={(x0 + x1) / 2} y={y + 4 + fs * 2.1} fontSize={fs} textAnchor="middle" fill={INK}>{title}</text>
    </g>
  );
}

// ------------------------------------------------------------------ bars

function barsReactions(inp: FigInput, o: FigOptions, W: number, groups: FigGroup[], panelTitle: boolean, sharedRange: [number, number] | null): Built {
  const fs = o.fontPt;
  const n = inp.series.length;
  const isFva = !!inp.series[0]?.fva;
  const labelOf = (id: string) => (o.labels === 'name' ? inp.rxnName(id) || id : id);
  const allIds = groups.flatMap((g) => g.rids);
  const labelW = Math.min(W * 0.36, Math.max(40, ...allIds.map((id) => textW(labelOf(id), fs - 0.5))) + 6);
  const x0 = labelW + 4, x1 = W - 6;
  let lo = 0, hi = 0;
  for (const s of inp.series) for (const id of allIds) {
    if (s.fva) { const iv = s.fva[id]; if (iv) { lo = Math.min(lo, iv.minimum ?? 0); hi = Math.max(hi, iv.maximum ?? 0); } }
    else { const v = val(s, id) ?? 0; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  if (sharedRange) [lo, hi] = sharedRange;
  const { sx, ticks } = xScale(lo, hi, x0, x1);
  const barH = Math.max(2.4, Math.min(fs * 0.95, (fs * 1.6) / n));
  const rowH = Math.max(fs * 1.3, n * barH + (n - 1) * 0.6 + 3);
  const headH = fs * 1.7;
  const els: ReactNode[] = [];
  const stripes: ReactNode[] = [];
  let y = 0;
  for (const g of groups) {
    if (panelTitle) {
      els.push(<text key={'h' + g.key} x={0} y={y + fs * 1.15} fontSize={fs} fontWeight={700} fill={INK}>{trunc(subsystemLabel(g.key), W, fs)}</text>);
      y += headH;
    }
    if (!g.rids.length) {
      els.push(<text key={'e' + g.key} x={x0} y={y + fs} fontSize={fs - 1} fill={INK2} fontStyle="italic">{isFva ? 'no variable reaction' : 'no reaction carries flux'}</text>);
      y += rowH;
    }
    g.rids.forEach((id, ri) => {
      const cy = y + rowH / 2;
      if (ri % 2 === 1) stripes.push(<rect key={'z' + g.key + id} x={0} y={y} width={W} height={rowH} fill="#f7f7f5" />);
      els.push(<text key={'l' + g.key + id} x={labelW} y={cy + fs * 0.33} fontSize={fs - 0.5} textAnchor="end" fill={INK}>{trunc(labelOf(id), labelW - 2, fs - 0.5)}<title>{`${id} — ${inp.rxnName(id)}`}</title></text>);
      inp.series.forEach((s, si) => {
        const by = cy - (n * barH + (n - 1) * 0.6) / 2 + si * (barH + 0.6);
        if (s.fva) {
          const iv = s.fva[id];
          if (!iv || iv.minimum == null || iv.maximum == null) return;
          const a = sx(iv.minimum), b = sx(iv.maximum);
          els.push(
            <g key={'f' + g.key + id + si} stroke={FVA_COLOR} strokeWidth={1}>
              <line x1={a} x2={Math.max(b, a + 0.6)} y1={by + barH / 2} y2={by + barH / 2} strokeWidth={Math.max(1.2, barH * 0.6)} />
              <line x1={a} x2={a} y1={by} y2={by + barH} /><line x1={b} x2={b} y1={by} y2={by + barH} />
              <title>{`${id}: [${fnum(iv.minimum)}, ${fnum(iv.maximum)}]`}</title>
            </g>,
          );
          return;
        }
        const v = val(s, id);
        if (!has(s, id)) {
          els.push(<text key={'n' + g.key + id + si} x={sx(0) + 2} y={by + barH * 0.85} fontSize={Math.min(fs - 2, barH + 1)} fill={INK2}>n/a<title>{`${id} is not in ${s.name}`}</title></text>);
          return;
        }
        if (v == null || Math.abs(v) < inp.tol) return;
        const a = sx(Math.min(0, v)), b = sx(Math.max(0, v));
        const color = n === 1 ? (v > 0 ? FWD : REV) : s.color;
        els.push(<rect key={'b' + g.key + id + si} x={a} y={by} width={Math.max(0.4, b - a)} height={barH} fill={color}><title>{`${id} · ${s.name}: ${fnum(v)} ${FLUX_UNIT}`}</title></rect>);
        if (o.values && n === 1) els.push(<text key={'v' + g.key + id} x={v > 0 ? b + 1.5 : a - 1.5} y={by + barH * 0.8} fontSize={fs - 1.5} textAnchor={v > 0 ? 'start' : 'end'} fill={INK2}>{fmtTick(v)}</text>);
      });
      y += rowH;
    });
    if (groups.length > 1 || panelTitle) y += fs * 0.5;
  }
  const top = 0;
  const axisY = y + 2;
  const title = isFva ? `Feasible flux range (${FLUX_UNIT})` : `Flux (${FLUX_UNIT})`;
  return {
    w: W, h: axisY + fs * 2.8,
    body: <g>{stripes}<XAxis sx={sx} ticks={ticks} y={axisY} top={top} fs={fs} title={title} x0={x0} x1={x1} />{els}</g>,
  };
}

function barsSubsystems(inp: FigInput, o: FigOptions, W: number): Built {
  const fs = o.fontPt;
  const n = inp.series.length;
  const isFva = !!inp.series[0]?.fva;
  const labels = inp.groups.map((g) => subsystemLabel(g.key));
  const labelW = Math.min(W * 0.4, Math.max(40, ...labels.map((l) => textW(l, fs - 0.5))) + 6);
  const x0 = labelW + 4, x1 = W - (o.values ? 30 : 8);
  const totals = inp.groups.map((g) => inp.series.map((s) => groupTotal(s, g, inp.tol)));
  const { sx, ticks } = xScale(0, Math.max(0, ...totals.flat()), x0, x1);
  const barH = Math.max(2.4, Math.min(fs * 1.1, (fs * 2) / n));
  const rowH = n * barH + (n - 1) * 0.6 + fs * 0.6;
  const els: ReactNode[] = [];
  inp.groups.forEach((g, gi) => {
    const y = gi * rowH;
    const cy = y + rowH / 2;
    els.push(<text key={'l' + g.key} x={labelW} y={cy + fs * 0.33} fontSize={fs - 0.5} textAnchor="end" fill={INK}>{trunc(labels[gi], labelW - 2, fs - 0.5)}<title>{labels[gi]}</title></text>);
    inp.series.forEach((s, si) => {
      const v = totals[gi][si];
      const by = cy - (n * barH + (n - 1) * 0.6) / 2 + si * (barH + 0.6);
      els.push(<rect key={'b' + g.key + si} x={sx(0)} y={by} width={Math.max(0.4, sx(v) - sx(0))} height={barH} fill={n === 1 ? (isFva ? FVA_COLOR : FWD) : s.color}><title>{`${labels[gi]} · ${s.name}: ${fnum(v)}`}</title></rect>);
      if (o.values) els.push(<text key={'v' + g.key + si} x={sx(v) + 1.5} y={by + barH * 0.8} fontSize={fs - 1.5} fill={INK2}>{fmtTick(v)}</text>);
    });
  });
  const axisY = inp.groups.length * rowH + 2;
  return {
    w: W, h: axisY + fs * 2.8,
    body: <g><XAxis sx={sx} ticks={ticks} y={axisY} top={0} fs={fs} title={isFva ? `Σ FVA width per subsystem (${FLUX_UNIT})` : `Σ |flux| per subsystem (${FLUX_UNIT})`} x0={x0} x1={x1} />{els}</g>,
  };
}

// ------------------------------------------------------------------ heatmap

/** Diverging scales are flipped so that positive flux (as written) takes the blue end, like the bars. */
interface ColorScale { color: (v: number) => string; lo: number; hi: number; diverging: boolean; paletteId: string }

function ColorBar({ cs, x, y, w, fs, title }: { cs: ColorScale; x: number; y: number; w: number; fs: number; title: string }) {
  const id = `cb-${cs.paletteId}-${Math.round(cs.lo * 1e6)}-${Math.round(cs.hi * 1e6)}`;
  const pal = getPalette(cs.paletteId);
  const ticks = cs.diverging ? [cs.lo, 0, cs.hi] : [cs.lo, (cs.lo + cs.hi) / 2, cs.hi];
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          {(cs.diverging ? [...pal.stops].reverse() : pal.stops).map((c, i) => <stop key={i} offset={i / (pal.stops.length - 1)} stopColor={c} />)}
        </linearGradient>
      </defs>
      <text x={x} y={y - 2} fontSize={fs - 1} fill={INK}>{title}</text>
      <rect x={x} y={y} width={w} height={fs * 0.9} fill={`url(#${id})`} stroke={AXIS} strokeWidth={0.3} />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={x + (i / 2) * w} x2={x + (i / 2) * w} y1={y + fs * 0.9} y2={y + fs * 0.9 + 1.5} stroke={AXIS} strokeWidth={0.4} />
          <text x={x + (i / 2) * w} y={y + fs * 0.9 + 1.5 + fs - 1} fontSize={fs - 1.5} textAnchor="middle" fill={INK2}>{fmtTick(t)}</text>
        </g>
      ))}
    </g>
  );
}

function heatmap(inp: FigInput, o: FigOptions, W: number, level: Level, groups: FigGroup[], panelTitle: boolean, csShared: ColorScale | null): Built {
  const fs = o.fontPt;
  const n = inp.series.length;
  const labelOf = (id: string) => (o.labels === 'name' ? inp.rxnName(id) || id : id);
  const rows: { key: string; label: string; group?: string; vals: (number | null)[] }[] = [];
  const heads: { y: number; label: string }[] = [];
  if (level === 'subsystems') {
    for (const g of groups) rows.push({ key: g.key, label: subsystemLabel(g.key), vals: inp.series.map((s) => groupTotal(s, g, inp.tol)) });
  } else {
    for (const g of groups) for (const id of g.rids) rows.push({ key: g.key + id, label: labelOf(id), group: g.key, vals: inp.series.map((s) => { if (!has(s, id)) return null; const x = val(s, id) ?? 0; return Math.abs(x) < inp.tol ? 0 : x; }) });
  }
  const finite = rows.flatMap((r) => r.vals).filter((v): v is number => v != null);
  const cs = csShared ?? makeScale(finite, level, o);
  const labelW = Math.min(W * 0.4, Math.max(36, ...rows.map((r) => textW(r.label, fs - 0.5))) + 6);
  const colLabels = inp.series.map((s) => s.name);
  const cellW = Math.max(14, Math.min(64, (W - labelW - 10) / n));
  const rot = colLabels.some((l) => textW(l, fs - 0.5) > cellW - 2);
  const headH = rot ? Math.min(90, Math.max(...colLabels.map((l) => textW(l, fs - 0.5)))) * 0.72 + fs : fs * 1.6;
  const cellH = Math.max(fs * 1.25, 7);
  const gap = 0.8;
  const els: ReactNode[] = [];
  let y = headH;
  colLabels.forEach((l, ci) => {
    const cx = labelW + 4 + ci * cellW + cellW / 2;
    els.push(rot
      ? <text key={'c' + ci} x={cx} y={headH - 3} fontSize={fs - 0.5} fill={INK} transform={`rotate(-40 ${cx} ${headH - 3})`}>{trunc(l, 120, fs - 0.5)}<title>{l}</title></text>
      : <text key={'c' + ci} x={cx} y={headH - 4} fontSize={fs - 0.5} textAnchor="middle" fill={INK}>{l}</text>);
  });
  let lastGroup: string | undefined;
  for (const r of rows) {
    if (level === 'reactions' && r.group !== lastGroup && (groups.length > 1 || panelTitle)) {
      heads.push({ y, label: subsystemLabel(r.group!) });
      y += fs * 1.6;
      lastGroup = r.group;
    }
    els.push(<text key={'l' + r.key} x={labelW} y={y + cellH / 2 + fs * 0.33} fontSize={fs - 0.5} textAnchor="end" fill={INK}>{trunc(r.label, labelW - 2, fs - 0.5)}</text>);
    r.vals.forEach((v, ci) => {
      const x = labelW + 4 + ci * cellW;
      const fill = v == null ? NOVAL : cs.color(v);
      els.push(
        <g key={'k' + r.key + ci}>
          <rect x={x} y={y} width={cellW - gap} height={cellH - gap} fill={fill} />
          {v == null && <line x1={x + 2} x2={x + cellW - gap - 2} y1={y + cellH - gap - 2} y2={y + 2} stroke="#c9c9c5" strokeWidth={0.5} />}
          {o.values && v != null && <text x={x + (cellW - gap) / 2} y={y + cellH / 2 + (fs - 1.5) * 0.35} fontSize={fs - 1.5} textAnchor="middle" fill={inkOn(fill)}>{fmtTick(v)}</text>}
          <title>{`${r.label} · ${inp.series[ci].name}: ${v == null ? 'not in this result' : fnum(v)}`}</title>
        </g>,
      );
    });
    y += cellH;
  }
  heads.forEach((h, i) => els.push(<text key={'h' + i} x={0} y={h.y + fs * 1.15} fontSize={fs} fontWeight={700} fill={INK}>{trunc(h.label, W, fs)}</text>));
  if (!rows.length) { els.push(<text key="empty" x={labelW} y={y + fs} fontSize={fs - 1} fontStyle="italic" fill={INK2}>no reaction carries flux</text>); y += fs * 1.5; }
  const gridRight = labelW + 4 + n * cellW;
  let h = y + 4;
  // colour bar: right of the grid when it fits, else below
  const cbW = Math.min(110, W * 0.3);
  const cbTitle = level === 'subsystems' ? 'Σ |flux|' : 'Flux';
  if (!csShared) {
    if (W - gridRight - 12 >= cbW) els.push(<ColorBar key="cb" cs={cs} x={gridRight + 12} y={headH + fs} w={cbW} fs={fs} title={cbTitle} />);
    else { els.push(<ColorBar key="cb" cs={cs} x={labelW + 4} y={h + fs} w={cbW} fs={fs} title={cbTitle} />); h += fs * 3.4; }
  }
  return { w: W, h, body: <g>{els}</g> };
}

function makeScale(values: number[], level: Level, o: FigOptions): ColorScale {
  if (level === 'subsystems' || values.every((v) => v >= 0)) {
    const pal = getPalette(o.seqPalette);
    const hi = Math.max(1e-12, ...values);
    return { color: (v) => samplePalette(pal, v / hi), lo: 0, hi, diverging: false, paletteId: pal.id };
  }
  const pal = getPalette(o.divPalette);
  const m = Math.max(1e-12, ...values.map(Math.abs));
  return { color: (v) => samplePalette(pal, 0.5 - v / (2 * m)), lo: -m, hi: m, diverging: true, paletteId: pal.id };
}

// ------------------------------------------------------------------ donuts

interface Slice { key: string; label: string; value: number; color: string }

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M${p(r1, 0)}A${r1},${r1} 0 1 1 ${p(r1, Math.PI)}A${r1},${r1} 0 1 1 ${p(r1, 0)}M${p(r0, 0)}A${r0},${r0} 0 1 0 ${p(r0, Math.PI)}A${r0},${r0} 0 1 0 ${p(r0, 0)}Z`;
  return `M${p(r1, a0)}A${r1},${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

function Donut({ slices, cx, cy, r, fs, title, values, center }: { slices: Slice[]; cx: number; cy: number; r: number; fs: number; title: string; values: boolean; center: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r0 = r * 0.58;
  let a = 0;
  return (
    <g>
      <text x={cx} y={cy - r - 4} fontSize={fs} textAnchor="middle" fill={INK} fontWeight={600}>{trunc(title, r * 2.6, fs)}<title>{title}</title></text>
      {total <= 0 ? <path d={arc(cx, cy, r0, r, 0, Math.PI * 2)} fill={NOVAL} fillRule="evenodd" /> : slices.filter((s) => s.value > 0).map((s) => {
        const a0 = a, a1 = a + (s.value / total) * Math.PI * 2;
        a = a1;
        const mid = (a0 + a1) / 2, share = s.value / total;
        return (
          <g key={s.key}>
            <path d={arc(cx, cy, r0, r, a0, a1)} fill={s.color} fillRule="evenodd" stroke="#ffffff" strokeWidth={slices.length > 1 ? 0.8 : 0} />
            {values && share >= 0.06 && <text x={cx + ((r + r0) / 2) * Math.sin(mid)} y={cy - ((r + r0) / 2) * Math.cos(mid) + (fs - 1.5) * 0.35} fontSize={fs - 1.5} textAnchor="middle" fill={inkOn(s.color)}>{Math.round(share * 100)}%</text>}
            <title>{`${s.label}: ${fnum(s.value)} (${(share * 100).toFixed(1)} %)`}</title>
          </g>
        );
      })}
      <text x={cx} y={cy + fs * 0.1} fontSize={fs - 1} textAnchor="middle" fill={INK2}>{total <= 0 ? 'no flux' : center}</text>
      {total > 0 && <text x={cx} y={cy + fs * 1.1} fontSize={fs - 2} textAnchor="middle" fill={INK2}>Σ|v|</text>}
    </g>
  );
}

function Legend({ items, x, y, w, fs }: { items: { label: string; color: string }[]; x: number; y: number; w: number; fs: number }): { node: ReactNode; h: number } {
  const els: ReactNode[] = [];
  let cx = x, cy = y;
  const rowH = fs * 1.45;
  for (const it of items) {
    const tw = Math.min(textW(it.label, fs - 0.5), w * 0.6) + fs * 1.6;
    if (cx + tw > x + w && cx > x) { cx = x; cy += rowH; }
    els.push(<g key={it.label + cx + cy}><rect x={cx} y={cy - fs * 0.75} width={fs * 0.8} height={fs * 0.8} rx={1} fill={it.color} /><text x={cx + fs * 1.1} y={cy} fontSize={fs - 0.5} fill={INK}>{trunc(it.label, w * 0.6, fs - 0.5)}</text></g>);
    cx += tw + fs * 0.8;
  }
  return { node: <g>{els}</g>, h: cy - y + rowH };
}

function donuts(inp: FigInput, o: FigOptions, W: number, level: Level): Built {
  const fs = o.fontPt;
  const n = inp.series.length;
  const els: ReactNode[] = [];
  let y = 0;
  const center = (sl: Slice[]) => fmtTick(sl.reduce((a, s) => a + s.value, 0));
  if (level === 'subsystems') {
    // slice colour follows the subsystem (selection order), > 8 subsystems fold into "Other"
    const items = inp.groups.map((g, i) => ({ key: g.key, label: subsystemLabel(g.key), color: i < 7 || inp.groups.length <= 8 ? CATEGORICAL[i] : OTHER }));
    const r = Math.max(28, Math.min(70, (W / Math.min(n, 4)) * 0.36));
    const per = Math.max(1, Math.floor(W / (r * 2.7)));
    inp.series.forEach((s, si) => {
      const col = si % per, row = Math.floor(si / per);
      const cx = (W / Math.min(n, per)) * (col + 0.5), cy = row * (r * 2 + fs * 3) + r + fs * 1.6;
      let slices: Slice[] = inp.groups.map((g, i) => ({ ...items[i], value: groupTotal(s, g, inp.tol) }));
      if (slices.length > 8) slices = [...slices.slice(0, 7), { key: '__other', label: 'Other', color: OTHER, value: slices.slice(7).reduce((a, x) => a + x.value, 0) }];
      els.push(<Donut key={s.id} slices={slices} cx={cx} cy={cy} r={r} fs={fs} title={s.name} values={o.values} center={center(slices)} />);
    });
    y = Math.ceil(n / per) * (r * 2 + fs * 3) + fs * 0.6;
    const leg = Legend({ items: (items.length > 8 ? [...items.slice(0, 7), { key: '__other', label: 'Other', color: OTHER }] : items), x: 0, y: y + fs, w: W, fs });
    els.push(<g key="leg">{leg.node}</g>);
    y += leg.h + fs;
  } else {
    // one row per subsystem: a donut per result, slices = reactions (top 7 by the largest |v| across results + Other)
    const r = Math.max(24, Math.min(54, ((W * 0.62) / Math.max(1, n)) * 0.36));
    for (const g of inp.groups) {
      const mag = (id: string) => Math.max(...inp.series.map((s) => Math.abs(val(s, id) ?? 0)));
      const ranked = g.all.filter((id) => mag(id) >= inp.tol).sort((a, b) => mag(b) - mag(a));
      const top = ranked.length > 8 ? ranked.slice(0, 7) : ranked;
      const rest = ranked.slice(top.length);
      els.push(<text key={'h' + g.key} x={0} y={y + fs * 1.15} fontSize={fs} fontWeight={700} fill={INK}>{trunc(subsystemLabel(g.key), W, fs)}</text>);
      y += fs * 3;
      const legItems = [...top.map((id, i) => ({ label: o.labels === 'name' ? inp.rxnName(id) || id : id, color: CATEGORICAL[i] })), ...(rest.length ? [{ label: `Other (${rest.length})`, color: OTHER }] : [])];
      const donutW = n * r * 2.6;
      inp.series.forEach((s, si) => {
        const slices: Slice[] = [
          ...top.map((id, i) => ({ key: id, label: id, color: CATEGORICAL[i], value: Math.abs(val(s, id) ?? 0) })),
          ...(rest.length ? [{ key: '__other', label: `Other (${rest.length} reactions)`, color: OTHER, value: rest.reduce((a, id) => a + Math.abs(val(s, id) ?? 0), 0) }] : []),
        ];
        els.push(<Donut key={g.key + s.id} slices={slices} cx={r * 1.3 + si * r * 2.6} cy={y + r + fs * 0.8} r={r} fs={fs} title={s.name} values={o.values} center={center(slices)} />);
      });
      const legX = Math.min(donutW + fs, W * 0.62);
      const leg = Legend({ items: legItems, x: legX, y: y + fs, w: W - legX, fs });
      els.push(<g key={'lg' + g.key}>{leg.node}</g>);
      y += Math.max(r * 2 + fs * 1.6, leg.h + fs) + fs;
    }
  }
  return { w: W, h: y, body: <g>{els}</g> };
}

// ------------------------------------------------------------------ figure assembly

function panelsGrid(W: number, fs: number, panels: { key: string; build: (w: number) => Built }[]): Built {
  const cols = panels.length > 1 && W >= 360 ? 2 : 1;
  const gap = fs * 2;
  const pw = (W - gap * (cols - 1)) / cols;
  const els: ReactNode[] = [];
  let y = 0;
  for (let i = 0; i < panels.length; i += cols) {
    const row = panels.slice(i, i + cols).map((p) => ({ p, b: p.build(pw) }));
    const rh = Math.max(...row.map((r) => r.b.h));
    row.forEach(({ p, b }, ci) => {
      els.push(
        <g key={p.key} transform={`translate(${(ci * (pw + gap)).toFixed(2)},${y.toFixed(2)})`}>
          <text x={-fs * 0.5} y={fs * 1.15} fontSize={fs + 1.5} fontWeight={700} fill={INK} textAnchor="end">{String.fromCharCode(97 + i + ci)}</text>
          {b.body}
        </g>,
      );
    });
    y += rh + gap;
  }
  return { w: W, h: y - gap, body: <g>{els}</g> };
}

export function useFigure(inp: FigInput, view: View, level: Level, o: FigOptions) {
  return useMemo(() => {
    const fs = o.fontPt;
    const pad = fs * 1.4;
    const Wmm = o.widthMm;
    const W = Wmm * PT_PER_MM;
    const inner = W - pad * 2 - (inp.mode === 'separate' && level === 'reactions' && view !== 'pie' ? fs : 0);
    const isFva = !!inp.series[0]?.fva;
    let core: Built;
    if (view === 'pie') core = donuts(inp, o, inner, level);
    else if (level === 'subsystems') core = view === 'bars' ? barsSubsystems(inp, o, inner) : heatmap(inp, o, inner, 'subsystems', inp.groups, false, null);
    else if (inp.mode === 'separate') {
      let shared: [number, number] | null = null;
      let sharedCs: ColorScale | null = null;
      if (inp.scale === 'shared') {
        const ids = inp.groups.flatMap((g) => g.rids);
        const vs = inp.series.flatMap((s) => ids.flatMap((id) => (s.fva ? [s.fva[id]?.minimum ?? 0, s.fva[id]?.maximum ?? 0] : [val(s, id) ?? 0])));
        shared = [Math.min(0, ...vs), Math.max(0, ...vs)];
        if (view === 'heatmap') sharedCs = makeScale(inp.series.flatMap((s) => ids.filter((id) => has(s, id)).map((id) => val(s, id) ?? 0)), 'reactions', o);
      }
      const grid = panelsGrid(inner, fs, inp.groups.map((g) => ({
        key: g.key,
        build: (w: number) => (view === 'bars' ? barsReactions(inp, o, w, [g], true, shared) : heatmap(inp, o, w, 'reactions', [g], true, sharedCs)),
      })));
      if (sharedCs) {
        const cb = <ColorBar cs={sharedCs} x={0} y={grid.h + fs * 2} w={Math.min(110, inner * 0.3)} fs={fs} title="Flux (all panels)" />;
        core = { w: grid.w, h: grid.h + fs * 5, body: <g>{grid.body}{cb}</g> };
      } else core = grid;
      core = { ...core, body: <g transform={`translate(${fs},0)`}>{core.body}</g> };
    } else core = view === 'bars' ? barsReactions(inp, o, inner, inp.groups, inp.groups.length > 1, null) : heatmap(inp, o, inner, 'reactions', inp.groups, false, null);

    const title = o.title ?? inp.autoTitle;
    let y = pad;
    const parts: ReactNode[] = [];
    if (title) { parts.push(<text key="title" x={pad} y={y + fs * 1.3} fontSize={fs + 2} fontWeight={700} fill={INK}>{trunc(title, inner, fs + 2)}</text>); y += fs * 2.4; }
    // series legend (≥ 2 results) or direction key (1 result, signed bars)
    const legendItems = inp.series.length > 1 && view !== 'pie'
      ? inp.series.map((s) => ({ label: s.name, color: s.color }))
      : view === 'bars' && level === 'reactions' && !isFva ? [{ label: 'flux as written', color: FWD }, { label: 'reverse direction', color: REV }] : [];
    if (legendItems.length && view !== 'heatmap') {
      const lg = Legend({ items: legendItems, x: pad, y: y + fs, w: inner, fs });
      parts.push(<g key="legend">{lg.node}</g>);
      y += lg.h + fs * 0.4;
    }
    parts.push(<g key="core" transform={`translate(${pad.toFixed(2)},${y.toFixed(2)})`}>{core.body}</g>);
    y += core.h + fs * 0.6;
    const notes: string[] = [];
    if (o.caption) {
      if (view === 'pie') notes.push(level === 'subsystems' ? 'Slices: share of Σ|flux| among the shown subsystems (descriptive; not a mass balance).' : 'Slices: share of each reaction in the subsystem’s Σ|flux| (descriptive; not a mass balance).');
      else if (level === 'subsystems') notes.push(`Σ|flux|: sum of absolute fluxes over the reactions annotated with each subsystem${isFva ? ' (FVA: sum of interval widths)' : ''}.`);
      else if (!isFva) notes.push('Sign: positive = flux in the written direction of the reaction, negative = reverse.');
      else notes.push('Bars: FVA feasible intervals [min, max]; no midpoint is shown.');
      const trimmed = inp.groups.filter((g) => g.rids.length < g.all.length).length;
      if (level === 'reactions' && view !== 'pie' && trimmed) notes.push('Only reactions passing the current filters are shown (zero-flux hidden or the per-subsystem limit).');
      if (inp.series.some((s) => s.flux && inp.groups.some((g) => g.rids.some((id) => !has(s, id))))) notes.push('n/a / hatched: reaction not present in that result.');
    }
    notes.forEach((t, i) => parts.push(<text key={'note' + i} x={pad} y={y + fs * (i + 1) * 1.25} fontSize={fs - 1.5} fill={INK2}>{t}</text>));
    y += notes.length ? fs * (notes.length * 1.25 + 0.8) : 0;
    const H = y + pad * 0.6;
    const node = (
      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" width={`${Wmm}mm`} height={`${(H / PT_PER_MM).toFixed(2)}mm`} viewBox={`0 0 ${W.toFixed(2)} ${H.toFixed(2)}`} fontFamily={FONT}>
        <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
        {parts}
      </svg>
    );
    return { node, wMm: Wmm, hMm: H / PT_PER_MM, title: title || inp.autoTitle };
  }, [inp, view, level, o]);
}

// ------------------------------------------------------------------ UI

export function FigureOptionsBar({ supports, exportRef, fileBase, size }: { supports: { pie: boolean; heatmap: boolean; reason?: string }; exportRef: React.RefObject<HTMLDivElement>; fileBase: string; size: { wMm: number; hMm: number } }) {
  const v = useLab((s) => s.subsys);
  const o = v.fig;
  const [msg, setMsg] = useState('');
  const svgText = () => {
    const el = exportRef.current?.querySelector('svg');
    if (!el) throw new Error('Nothing to export');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(el);
  };
  const name = fileBase.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'subsystems';
  const save = async (kind: 'svg' | 'png300' | 'png600' | 'pdf') => {
    try {
      const svg = svgText();
      if (kind === 'svg') { download(`${name}.svg`, svg, 'image/svg+xml'); setMsg(`${name}.svg · ${size.wMm.toFixed(0)} × ${size.hMm.toFixed(0)} mm`); }
      else if (kind === 'pdf') { printSvgAsPdf(svg, name, size.wMm, size.hMm); setMsg('Print dialog opened — choose “Save as PDF” (vector)'); }
      else {
        const dpi = kind === 'png300' ? 300 : 600;
        const { blob, pxW, pxH } = await svgToPng(svg, size.wMm, size.hMm, dpi);
        download(`${name}_${dpi}dpi.png`, blob);
        setMsg(`${name}_${dpi}dpi.png · ${pxW} × ${pxH} px`);
      }
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="fig-bar">
      <div className="fig-row">
        <Seg value={v.level} options={['reactions', 'subsystems'] as const} onChange={(level) => lab.setSubsys({ level })}
          labels={{ reactions: 'Reactions', subsystems: 'Subsystem totals' }} titles={{ reactions: 'One row / slice per reaction of the open subsystems', subsystems: 'One row / slice per subsystem (Σ|flux|) — the global picture' }} />
        <label className="fig-field">Width
          <select className="input tiny" value={o.widthMm} onChange={(e) => lab.setFig({ widthMm: +e.target.value })}>
            {FIGURE_SIZES.filter((f) => f.w > 0 && f.w <= 200).map((f) => <option key={f.id} value={f.w}>{f.name}</option>)}
          </select></label>
        <label className="fig-field">Font
          <select className="input tiny" value={o.fontPt} onChange={(e) => lab.setFig({ fontPt: +e.target.value })}>
            {[6, 7, 8, 9, 10, 12].map((f) => <option key={f} value={f}>{f} pt</option>)}
          </select></label>
        <Seg value={o.labels} options={['id', 'name'] as const} onChange={(labels) => lab.setFig({ labels })} labels={{ id: 'IDs', name: 'Names' }} />
        <Toggle checked={o.values} onChange={(values) => lab.setFig({ values })}>Values</Toggle>
        <Toggle checked={o.caption} onChange={(caption) => lab.setFig({ caption })}>Notes</Toggle>
      </div>
      <div className="fig-row">
        {v.view === 'heatmap' && supports.heatmap && <>
          <label className="fig-field">Signed
            <select className="input tiny" value={o.divPalette} onChange={(e) => lab.setFig({ divPalette: e.target.value })}>
              {PALETTES.filter((p) => p.kind === 'diverging').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="fig-field">Totals
            <select className="input tiny" value={o.seqPalette} onChange={(e) => lab.setFig({ seqPalette: e.target.value })}>
              {PALETTES.filter((p) => p.kind === 'sequential').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
        </>}
        {v.level === 'reactions' && v.view !== 'pie' && (
          <label className="fig-field" title="Largest reactions per subsystem drawn in the figure">Max rows
            <input className="input tiny num" type="number" min={3} max={300} value={o.maxRows} onChange={(e) => lab.setFig({ maxRows: Math.max(3, Math.min(300, +e.target.value || 25)) })} /></label>
        )}
        <label className="fig-field grow">Title
          <input className="input tiny" placeholder="automatic — type to replace, a space for none" value={o.title ?? ''} onChange={(e) => lab.setFig({ title: e.target.value === '' ? null : e.target.value.trim() === '' ? '' : e.target.value })} /></label>
        <span className="fig-save">
          <span className="muted small">Save</span>
          <button className="btn small" onClick={() => save('svg')} title="Vector, editable (Illustrator, Inkscape)">SVG</button>
          <button className="btn small" onClick={() => save('pdf')} title="Vector PDF through the print dialog">PDF</button>
          <button className="btn small" onClick={() => save('png300')}>PNG 300 dpi</button>
          <button className="btn small primary" onClick={() => save('png600')} title="High resolution raster for journals">PNG 600 dpi</button>
        </span>
      </div>
      {(msg || supports.reason) && <div className="muted small">{msg || supports.reason}</div>}
    </div>
  );
}

/** The figure itself, on a white "paper" card scaled to the panel width. */
export function FigurePaper({ inp, view, level }: { inp: FigInput; view: View; level: Level }) {
  const o = useLab((s) => s.subsys.fig);
  const ref = useRef<HTMLDivElement>(null);
  const fig = useFigure(inp, view, level, o);
  const name = `${fig.title}_${view}`;
  return (
    <div className="fig-wrap">
      <FigureOptionsBar supports={{ pie: !inp.series[0]?.fva, heatmap: !inp.series[0]?.fva }} exportRef={ref} fileBase={name} size={{ wMm: fig.wMm, hMm: fig.hMm }} />
      <div className="fig-paper-scroll">
        <div className="fig-paper" ref={ref} style={{ width: `min(100%, ${(fig.wMm * 3.78 * 1.25).toFixed(0)}px)` }}>{fig.node}</div>
      </div>
      <div className="muted small fig-size">{fig.wMm.toFixed(0)} × {fig.hMm.toFixed(0)} mm at {o.fontPt} pt · hover a mark for its value</div>
    </div>
  );
}
