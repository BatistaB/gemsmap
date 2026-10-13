import { fmt } from '../data/stats';
import type { LegendItem } from '../viz/evaluate';
import { getPalette, samplePalette } from '../viz/palettes';
import type { Theme } from '../viz/presets';
import type { LegendGlyph } from '../viz/types';

/** Natural (unscaled) width of the legend box, padding included. */
export const LEGEND_W = 166;

export function Legend({ legend, pos, items, theme, selected }: { legend: LegendGlyph; pos: { x: number; y: number }; items: LegendItem[]; theme: Theme; selected: boolean }) {
  if (!legend.visible || !items.length) return null;
  let y = 0;
  const W = 150;
  const blocks: JSX.Element[] = [];
  items.forEach((it, i) => {
    const y0 = y;
    const title = <text x={0} y={y0 + 9} fontSize={9} fontWeight={600} fill={theme.text}>{it.title}{'unit' in it && it.unit ? <tspan fontWeight={400} fill={theme.plotAxis}> ({it.unit})</tspan> : null}</text>;
    if (it.kind === 'conditions') {
      blocks.push(
        <g key={i}>
          {title}
          {it.items.map((c, j) => (
            <g key={j} transform={`translate(${(j % 2) * 70},${y0 + 16 + Math.floor(j / 2) * 13})`}>
              <rect x={0} y={0} width={14} height={8} fill={c.color} opacity={0.85} />
              <text x={19} y={7.5} fontSize={8.5} fill={theme.text}>{c.name}</text>
            </g>
          ))}
        </g>,
      );
      y += 20 + Math.ceil(it.items.length / 2) * 13 + 8;
    } else if (it.kind === 'width') {
      const vals = [it.domain[0], (it.domain[0] + it.domain[1]) / 2, it.domain[1]];
      blocks.push(
        <g key={i}>
          {title}
          {vals.map((v, j) => {
            const t = (v - it.domain[0]) / (it.domain[1] - it.domain[0] || 1);
            const sw = it.range[0] + t * (it.range[1] - it.range[0]);
            return (
              <g key={j} transform={`translate(0,${y0 + 20 + j * 13})`}>
                <line x1={0} x2={46} y1={0} y2={0} stroke={theme.edge} strokeWidth={sw} />
                <text x={54} y={3} fontSize={8.5} fill={theme.text}>{fmt(v, 2)}</text>
              </g>
            );
          })}
        </g>,
      );
      y += 20 + 3 * 13 + 6;
    } else if (it.kind === 'radius') {
      const vals = [it.domain[1] * 0.1, it.domain[1] * 0.5, it.domain[1]];
      blocks.push(
        <g key={i}>
          {title}
          {vals.map((v, j) => {
            const t = Math.sqrt(v / (it.domain[1] || 1));
            const r = it.range[0] + t * (it.range[1] - it.range[0]);
            return (
              <g key={j} transform={`translate(${12 + j * 42},${y0 + 36})`}>
                <circle r={r} fill={theme.nodeFill} opacity={0.85} />
                <text y={22} fontSize={8} textAnchor="middle" fill={theme.text}>{fmt(v, 2)}</text>
              </g>
            );
          })}
        </g>,
      );
      y += 66;
    } else {
      const pal = getPalette(it.palette);
      const n = 24;
      const bw = 120 / n;
      blocks.push(
        <g key={i}>
          {title}
          {Array.from({ length: n }, (_, j) => (
            <rect key={j} x={j * bw} y={y0 + 15} width={bw + 0.3} height={9} fill={samplePalette(pal, (j + 0.5) / n)} />
          ))}
          <text x={0} y={y0 + 34} fontSize={8} fill={theme.text}>{fmt(it.domain[0], 2)}</text>
          {it.diverging && <text x={60} y={y0 + 34} fontSize={8} textAnchor="middle" fill={theme.text}>{fmt((it.domain[0] + it.domain[1]) / 2, 2)}</text>}
          <text x={120} y={y0 + 34} fontSize={8} textAnchor="end" fill={theme.text}>{fmt(it.domain[1], 2)}</text>
        </g>,
      );
      y += 44;
    }
  });
  const k = legend.scale ?? 1;
  const hs = 8 / k; // handles keep their on-screen size
  return (
    <g transform={`translate(${pos.x},${pos.y}) scale(${k})`} data-sel="legend:legend" data-legend-h={y} fontFamily={theme.font}>
      <rect x={-8} y={-8} width={W + 16} height={y + 8} fill={theme.background} opacity={0.001} />
      {blocks}
      {selected && <rect className="ui-only" x={-8} y={-8} width={W + 16} height={y + 8} fill="none" stroke="#4f5bd5" strokeWidth={1.2 / k} strokeDasharray={`${4 / k} ${3 / k}`} />}
      {selected && ([['nw', -8, -8, 'nwse-resize'], ['ne', W + 8, -8, 'nesw-resize'], ['se', W + 8, y, 'nwse-resize'], ['sw', -8, y, 'nesw-resize']] as const).map(([dir, hx, hy, cursor]) => (
        <rect key={dir} className="ui-only" data-resize={`legend:${dir}`} x={hx - hs / 2} y={hy - hs / 2} width={hs} height={hs} rx={1.5 / k} fill="#fff" stroke="#4f5bd5" strokeWidth={1.2 / k} style={{ cursor }} />
      ))}
    </g>
  );
}
