import { orderedColumns } from '../data/order';
import { netRange, netSamples, netValue } from '../data/families';
import { memo } from 'react';
import { fmt, kde, mean, niceTicks, quantile } from '../data/stats';
import type { Condition, Dataset } from '../data/types';
import { glyphFlux, glyphSamples } from '../viz/evaluate';
import { getPalette, samplePalette, withAlpha } from '../viz/palettes';
import type { Theme } from '../viz/presets';
import type { PlotGlyph, ReactionGlyph, ViewState } from '../viz/types';

interface Props {
  plot: PlotGlyph;
  x: number;
  y: number;
  title: string;
  glyph?: ReactionGlyph;
  metaboliteId?: string;
  datasets: Dataset[];
  conditions: Condition[];
  view: ViewState;
  theme: Theme;
  selected: boolean;
}

export function pickDataset(plot: PlotGlyph, datasets: Dataset[], target: 'reaction' | 'metabolite'): Dataset | undefined {
  if (plot.datasetId) { const d = datasets.find((x) => x.id === plot.datasetId); if (d) return d; }
  const pool = datasets.filter((d) => d.target === target && d.visible);
  const want = plot.type === 'density' || plot.type === 'box' ? ['samples', 'fva', 'flux'] : plot.type === 'range' ? ['fva', 'samples', 'flux'] : ['flux', 'metabolite', 'turnover', 'samples', 'fva'];
  for (const k of want) { const d = pool.find((x) => x.kind === k); if (d) return d; }
  return pool[0];
}

const DEFAULT_FS = 7;
const HANDLES: [string, number, number, string][] = [
  ['nw', 0, 0, 'nwse-resize'], ['n', 0.5, 0, 'ns-resize'], ['ne', 1, 0, 'nesw-resize'], ['e', 1, 0.5, 'ew-resize'],
  ['se', 1, 1, 'nwse-resize'], ['s', 0.5, 1, 'ns-resize'], ['sw', 0, 1, 'nesw-resize'], ['w', 0, 0.5, 'ew-resize'],
];

function MiniPlotImpl({ plot, x, y, title, glyph, metaboliteId, datasets, conditions, view, theme, selected }: Props) {
  const ds = pickDataset(plot, datasets, glyph ? 'reaction' : 'metabolite');
  const { w, h } = plot;
  const FS = plot.fontSize ?? DEFAULT_FS;
  const padL = 6, padR = 6, padT = Math.round(FS * 2), padB = plot.showAxis ? Math.round(FS * 2.3) : 6;
  const iw = w - padL - padR, ih = h - padT - padB;
  const sign = glyph?.reversedToModel ? -1 : 1;
  const entity = glyph ? (glyph.reactionId ?? (glyph.collapsed ? '__collapsed__' : undefined)) : metaboliteId;
  // `ci` below is the display position; `order[ci]` is the dataset column (user's condition order)
  const order = ds ? orderedColumns(ds, conditions) : [];
  const conds = ds ? order.map((col) => conditions.find((k) => k.id === ds.columns[col]) ?? { id: ds.columns[col], name: ds.columns[col], color: '#888' }) : [];
  const valueAt = (ci: number): number | null => {
    if (!ds || !entity) return null;
    if (glyph) return glyphFlux(ds, glyph, ds.columns[order[ci]]);
    return netValue(ds, entity, order[ci]);
  };
  const samplesAt = (ci: number): number[] => (!ds?.samples || !entity ? [] : glyph ? glyphSamples(ds, glyph, order[ci]) : netSamples(ds, entity, order[ci]));
  const rangeAt = (ci: number): [number, number] | null => {
    const r = ds?.ranges && entity ? netRange(ds, entity, order[ci]) : null;
    if (r) return sign > 0 ? r : [-r[1], -r[0]];
    const s = samplesAt(ci).slice().sort((a, b) => a - b);
    return s.length ? [quantile(s, 0.025), quantile(s, 0.975)] : null;
  };

  let body: JSX.Element | null = null;
  let axis: { lo: number; hi: number } | null = null;
  const noData = <text x={w / 2} y={padT + ih / 2 + 3} fontSize={FS} textAnchor="middle" fill={theme.plotAxis} fontStyle="italic">no data</text>;

  const type = plot.type === 'density' && !ds?.samples ? 'bar' : plot.type;

  if (!ds || !entity) body = noData;
  else if (type === 'density' || type === 'box') {
    const all = conds.flatMap((_, ci) => samplesAt(ci)).sort((a, b) => a - b);
    if (!all.length) body = noData;
    else {
      let lo = quantile(all, 0.005), hi = quantile(all, 0.995);
      const padX = (hi - lo) * 0.08 || Math.abs(lo) * 0.1 || 0.1;
      lo -= padX; hi += padX;
      axis = { lo, hi };
      const sx = (v: number) => padL + ((v - lo) / (hi - lo)) * iw;
      if (type === 'density') {
        const curves = conds.map((_, ci) => kde(samplesAt(ci), lo, hi, 60));
        const maxD = Math.max(1e-9, ...curves.flat().map((p) => p[1]));
        const sy = (d: number) => padT + ih - (d / maxD) * ih;
        body = (
          <g>
            {curves.map((c, ci) => {
              if (!c.length) return null;
              const pts = c.map(([vx, d]) => `${sx(vx).toFixed(1)},${sy(d).toFixed(1)}`).join(' L');
              const col = conds[ci].color;
              const active = conds[ci].id === view.activeCondition;
              return (
                <g key={ci} opacity={active ? 1 : 0.85}>
                  <path d={`M${sx(lo).toFixed(1)},${(padT + ih).toFixed(1)} L${pts} L${sx(hi).toFixed(1)},${(padT + ih).toFixed(1)} Z`} fill={withAlpha(col, 0.28)} stroke={col} strokeWidth={active ? 1.1 : 0.7} />
                </g>
              );
            })}
            {conds.map((cd, ci) => {
              const m = mean(samplesAt(ci));
              return Number.isFinite(m) ? <line key={'m' + ci} x1={sx(m)} x2={sx(m)} y1={padT} y2={padT + ih} stroke={cd.color} strokeWidth={0.8} strokeDasharray="2.5 1.5" /> : null;
            })}
          </g>
        );
      } else {
        const bh = Math.min(10, ih / conds.length - 2);
        body = (
          <g>
            {conds.map((cd, ci) => {
              const s = samplesAt(ci).slice().sort((a, b) => a - b);
              if (!s.length) return null;
              const q1 = quantile(s, 0.25), q2 = quantile(s, 0.5), q3 = quantile(s, 0.75);
              const iqr = q3 - q1;
              const w0 = Math.max(s[0], q1 - 1.5 * iqr), w1 = Math.min(s[s.length - 1], q3 + 1.5 * iqr);
              const cy = padT + (ih / conds.length) * (ci + 0.5);
              return (
                <g key={ci}>
                  <line x1={sx(w0)} x2={sx(w1)} y1={cy} y2={cy} stroke={cd.color} strokeWidth={0.8} />
                  <rect x={sx(q1)} y={cy - bh / 2} width={Math.max(0.5, sx(q3) - sx(q1))} height={bh} fill={withAlpha(cd.color, 0.3)} stroke={cd.color} strokeWidth={0.8} />
                  <line x1={sx(q2)} x2={sx(q2)} y1={cy - bh / 2} y2={cy + bh / 2} stroke={cd.color} strokeWidth={1.2} />
                </g>
              );
            })}
          </g>
        );
      }
    }
  } else if (type === 'range') {
    const rs = conds.map((_, ci) => rangeAt(ci));
    const flat = rs.flatMap((r) => (r ? r : []));
    if (!flat.length) body = noData;
    else {
      let lo = Math.min(...flat), hi = Math.max(...flat);
      const p = (hi - lo) * 0.1 || 0.1; lo -= p; hi += p;
      axis = { lo, hi };
      const sx = (v: number) => padL + ((v - lo) / (hi - lo)) * iw;
      body = (
        <g>
          {rs.map((r, ci) => {
            if (!r) return null;
            const cy = padT + (ih / conds.length) * (ci + 0.5);
            const v = valueAt(ci);
            return (
              <g key={ci} stroke={conds[ci].color}>
                <line x1={sx(r[0])} x2={sx(r[1])} y1={cy} y2={cy} strokeWidth={1.4} />
                <line x1={sx(r[0])} x2={sx(r[0])} y1={cy - 3} y2={cy + 3} strokeWidth={1} />
                <line x1={sx(r[1])} x2={sx(r[1])} y1={cy - 3} y2={cy + 3} strokeWidth={1} />
                {v != null && <circle cx={sx(v)} cy={cy} r={1.8} fill={conds[ci].color} stroke="none" />}
              </g>
            );
          })}
        </g>
      );
    }
  } else if (type === 'heatmap') {
    const vs = conds.map((_, ci) => valueAt(ci));
    const finite = vs.filter((v): v is number => v != null);
    if (!finite.length) body = noData;
    else {
      const m = Math.max(1e-9, ...finite.map(Math.abs));
      const pal = getPalette(finite.some((v) => v < 0) ? 'blue-red' : 'viridis');
      const div = finite.some((v) => v < 0);
      const cw = iw / conds.length;
      body = (
        <g>
          {vs.map((v, ci) => (
            <g key={ci}>
              <rect x={padL + ci * cw} y={padT} width={cw - 1} height={ih} fill={v == null ? '#eee' : samplePalette(pal, div ? 0.5 + v / (2 * m) : v / m)} stroke={conds[ci].id === view.activeCondition ? theme.text : 'none'} strokeWidth={0.8} />
              <text x={padL + ci * cw + cw / 2} y={padT + ih / 2 + 2.5} fontSize={FS} textAnchor="middle" fill={v != null && (div ? Math.abs(v) / m > 0.6 : v / m < 0.55) ? '#fff' : '#111'}>{fmt(v, 2)}</text>
              {plot.showAxis && <text x={padL + ci * cw + cw / 2} y={h - 5} fontSize={FS} textAnchor="middle" fill={theme.plotAxis}>{conds[ci].name}</text>}
            </g>
          ))}
        </g>
      );
    }
  } else {
    // bar / line
    const vs = conds.map((_, ci) => valueAt(ci));
    const finite = vs.filter((v): v is number => v != null);
    if (!finite.length) body = noData;
    else {
      const lo = Math.min(0, ...finite), hi = Math.max(0, ...finite);
      const span = hi - lo || 1;
      const sy = (v: number) => padT + ih - ((v - lo) / span) * ih;
      const cw = iw / conds.length;
      const timed = type === 'line' && conds.every((c) => typeof c.time === 'number');
      const t0 = timed ? Math.min(...conds.map((c) => c.time!)) : 0;
      const t1 = timed ? Math.max(...conds.map((c) => c.time!)) : 1;
      const lx = (ci: number) => (timed ? padL + 4 + ((conds[ci].time! - t0) / (t1 - t0 || 1)) * (iw - 8) : padL + cw * (ci + 0.5));
      body = (
        <g>
          <line x1={padL} x2={padL + iw} y1={sy(0)} y2={sy(0)} stroke={theme.plotAxis} strokeWidth={0.5} />
          {type === 'bar'
            ? vs.map((v, ci) => v == null ? null : (
                <rect key={ci} x={padL + ci * cw + cw * 0.15} y={Math.min(sy(v), sy(0))} width={cw * 0.7} height={Math.max(0.5, Math.abs(sy(v) - sy(0)))} fill={conds[ci].color} opacity={conds[ci].id === view.activeCondition ? 1 : 0.55} />
              ))
            : (
              <g>
                <path d={vs.map((v, ci) => (v == null ? '' : `${ci === 0 ? 'M' : 'L'}${lx(ci).toFixed(1)},${sy(v).toFixed(1)}`)).join(' ')} fill="none" stroke={theme.edge} strokeWidth={0.9} />
                {vs.map((v, ci) => v == null ? null : <circle key={ci} cx={lx(ci)} cy={sy(v)} r={conds[ci].id === view.activeCondition ? 2.8 : 2} fill={conds[ci].color} />)}
              </g>
            )}
          {plot.showAxis && conds.map((c, ci) => <text key={ci} x={type === 'line' ? lx(ci) : padL + cw * (ci + 0.5)} y={h - 5} fontSize={FS} textAnchor="middle" fill={theme.plotAxis}>{c.name}</text>)}
          <text x={padL} y={padT - 1} fontSize={FS - 1} fill={theme.plotAxis}>{fmt(hi, 2)}</text>
        </g>
      );
    }
  }

  const ticks = axis ? niceTicks(axis.lo, axis.hi, 3) : [];
  const sxAxis = axis ? (v: number) => padL + ((v - axis!.lo) / (axis!.hi - axis!.lo)) * iw : () => 0;

  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} data-sel={`plot:${plot.id}`}>
      <rect x={0} y={0} width={w} height={h} fill={theme.background} stroke={theme.plotAxis} strokeWidth={0.6} />
      <text x={w / 2} y={FS + 3} fontSize={FS + 1} textAnchor="middle" fill={theme.text} fontFamily={theme.font}>{plot.title ?? title}</text>
      {body}
      {plot.showAxis && axis && (
        <g>
          <line x1={padL} x2={padL + iw} y1={padT + ih} y2={padT + ih} stroke={theme.plotAxis} strokeWidth={0.6} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sxAxis(t)} x2={sxAxis(t)} y1={padT + ih} y2={padT + ih + 2} stroke={theme.plotAxis} strokeWidth={0.6} />
              <text x={sxAxis(t)} y={padT + ih + 9} fontSize={FS - 0.5} textAnchor="middle" fill={theme.plotAxis}>{fmt(t, 2)}</text>
            </g>
          ))}
        </g>
      )}
      {selected && <rect className="ui-only" x={-3} y={-3} width={w + 6} height={h + 6} fill="none" stroke="#4f5bd5" strokeWidth={1.5} />}
      {selected && HANDLES.map(([dir, fx, fy, cursor]) => (
        <rect key={dir} className="ui-only" data-resize={`${plot.id}:${dir}`} x={fx * w - 4} y={fy * h - 4} width={8} height={8} rx={1.5} fill="#fff" stroke="#4f5bd5" strokeWidth={1.2} style={{ cursor }} />
      ))}
    </g>
  );
}

export const MiniPlot = memo(MiniPlotImpl);
