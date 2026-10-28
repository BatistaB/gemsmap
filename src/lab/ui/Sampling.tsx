/**
 * Flux sampling results (COBRApy OptGP / ACHR). Each reaction has a distribution, not one value: the
 * table shows its statistics with a box plot (2.5–97.5 % whiskers, quartile box, median), and the
 * panel shows the histogram of the selected reaction. The mean is labelled as such — it is a feasible
 * flux vector, but not an optimal (FBA) solution.
 */
import { useMemo, useState } from 'react';
import { Icon } from '../../ui/icons';
import { fnum, FLUX_UNIT } from '../format';
import { lab, useLab } from '../store';
import type { SampleSummary, SimulationResult } from '../types';
import { Toggle, useDebounced } from './common';
import { VirtualTable, type Col } from './VirtualTable';

interface Row { id: string; name: string; s: SampleSummary; constant: boolean }

/** Sample values of one reaction (a constant reaction is the same value in every sample). */
export function samplesOf(r: SimulationResult, id: string): number[] {
  const smp = r.samples;
  if (!smp) return [];
  if (smp.reactions[id]) return smp.reactions[id];
  const c = smp.constant[id];
  return c == null ? [] : Array(r.metadata.sampling?.n ?? 1).fill(c);
}

/** Box plot on the row's own scale (0 marked): whiskers 2.5–97.5 %, box 25–75 %, median tick. */
function MiniBox({ s }: { s: SampleSummary }) {
  const lo = Math.min(0, s.min ?? 0), hi = Math.max(0, s.max ?? 0);
  const span = hi - lo || 1;
  const x = (v: number | null) => `${(((v ?? 0) - lo) / span) * 100}%`;
  return (
    <span className="smp-box" title={`2.5 %: ${fnum(s.q025)} · 25 %: ${fnum(s.q25)} · median: ${fnum(s.median)} · 75 %: ${fnum(s.q75)} · 97.5 %: ${fnum(s.q975)}`}>
      <i className="smp-zero" style={{ left: x(0) }} />
      <i className="smp-whisk" style={{ left: x(s.q025), width: `calc(${x(s.q975)} - ${x(s.q025)})` }} />
      <i className="smp-iqr" style={{ left: x(s.q25), width: `max(2px, calc(${x(s.q75)} - ${x(s.q25)}))` }} />
      <i className="smp-med" style={{ left: x(s.median) }} />
    </span>
  );
}

export function SamplingReactions({ r }: { r: SimulationResult }) {
  const index = useLab((s) => s.index)!;
  const search = useLab((s) => s.searchIndex)!;
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 110);
  const [hideConstant, setHideConstant] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const smp = r.samples!;
  const all = useMemo<Row[]>(() => Object.entries(smp.summary).map(([id, s]) => ({ id, name: index.rxn.get(id)?.name ?? '', s, constant: !(id in smp.reactions) })), [smp, index]);
  const rows = useMemo(() => {
    const ranked = search.matchIds(dq, 'reaction');
    return all.filter((x) => (!hideConstant || !x.constant) && (!ranked || ranked.has(x.id)));
  }, [all, hideConstant, dq, search]);
  const nConst = all.filter((x) => x.constant).length;
  const cols: Col<Row>[] = [
    { key: 'id', label: 'Reaction', width: 'minmax(110px, 1fr)', sortValue: (x) => x.id, render: (x) => <span className="mono ellipsis" title={x.id}>{x.id}</span> },
    { key: 'name', label: 'Name', width: 'minmax(140px, 2fr)', sortValue: (x) => x.name, render: (x) => <span className="ellipsis" title={x.name}>{x.name}</span> },
    { key: 'mean', label: 'Mean', width: 84, align: 'right', sortValue: (x) => x.s.mean, render: (x) => <span className="mono">{fnum(x.s.mean)}</span> },
    { key: 'median', label: 'Median', width: 84, align: 'right', sortValue: (x) => x.s.median, render: (x) => <span className="mono">{fnum(x.s.median)}</span> },
    { key: 'sd', label: 'SD', width: 76, align: 'right', title: 'Standard deviation of the samples', sortValue: (x) => x.s.sd, render: (x) => <span className="mono muted">{fnum(x.s.sd)}</span> },
    { key: 'ci', label: '95 % interval', width: 170, align: 'right', title: '2.5th – 97.5th percentile of the samples', sortValue: (x) => (x.s.q975 ?? 0) - (x.s.q025 ?? 0), render: (x) => <span className="mono small">[{fnum(x.s.q025)}, {fnum(x.s.q975)}]</span> },
    { key: 'box', label: 'Distribution', width: 'minmax(120px, 1.4fr)', sortValue: (x) => Math.abs(x.s.median ?? 0), title: 'Box plot on each row’s own scale (the line marks zero)', render: (x) => <MiniBox s={x.s} /> },
  ];
  const sel = active ? all.find((x) => x.id === active) : null;
  return (
    <div className="smp-layout">
      <div className="rw-table">
        <div className="ex-toolbar">
          <div className="search-box ex-search"><Icon name="search" size={14} /><input placeholder="Search reactions…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Toggle checked={hideConstant} onChange={setHideConstant} title="Reactions with the same flux in every sample (often blocked, 0)">Hide constant ({nConst})</Toggle>
          <span className="grow" />
          <span className="muted small">{rows.length} of {all.length}</span>
        </div>
        <div className="ex-table">
          <VirtualTable rows={rows} cols={cols} rowKey={(x) => x.id} active={active} onRowClick={(x) => setActive(x.id)} onKeyNav={(x) => setActive(x.id)}
            empty={<div className="muted small pad">No reaction matches.</div>} />
        </div>
        <div className="muted small pad-x">Click a reaction for the histogram of its samples. Statistics over {r.metadata.sampling?.n ?? '?'} samples, in {FLUX_UNIT}. The mean flux vector is feasible but is not an optimal (FBA) solution.</div>
      </div>
      {sel && <div className="smp-detail"><Histogram r={r} row={sel} onClose={() => setActive(null)} /></div>}
    </div>
  );
}

function Histogram({ r, row, onClose }: { r: SimulationResult; row: Row; onClose: () => void }) {
  const vals = samplesOf(r, row.id);
  const s = row.s;
  const W = 300, H = 150, P = 6;
  const lo = Math.min(s.min ?? 0, 0), hi = Math.max(s.max ?? 0, 0);
  const span = hi - lo || 1;
  const nb = Math.max(8, Math.min(40, Math.round(Math.sqrt(vals.length) * 1.5)));
  const bins = new Array(nb).fill(0);
  for (const v of vals) bins[Math.min(nb - 1, Math.max(0, Math.floor(((v - lo) / span) * nb)))]++;
  const top = Math.max(1, ...bins);
  const sx = (v: number | null) => P + (((v ?? 0) - lo) / span) * (W - 2 * P);
  const bw = (W - 2 * P) / nb;
  return (
    <div className="smp-hist">
      <div className="row gap"><b className="mono grow">{row.id}</b><button className="link small" onClick={() => lab.navigate({ kind: 'reaction', id: row.id })}>Inspect</button>
        <button className="icon-btn tiny" title="Close" onClick={onClose}><Icon name="x" size={11} /></button></div>
      <div className="muted small ellipsis">{row.name}</div>
      {row.constant ? <div className="note small">Same flux in every sample: <span className="mono">{fnum(s.mean)}</span>.</div> : (
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="smp-svg" role="img" aria-label={`Histogram of ${row.id}`}>
          <rect x={sx(s.q025)} y={0} width={Math.max(1, sx(s.q975) - sx(s.q025))} height={H} className="smp-band" />
          {bins.map((c, i) => <rect key={i} x={P + i * bw + 0.5} y={H - (c / top) * H} width={Math.max(0.5, bw - 1)} height={(c / top) * H} className="smp-bar"><title>{`${fnum(lo + (i * span) / nb)} – ${fnum(lo + ((i + 1) * span) / nb)}: ${c} samples`}</title></rect>)}
          <line x1={sx(0)} x2={sx(0)} y1={0} y2={H} className="smp-zero-line" />
          <line x1={sx(s.median)} x2={sx(s.median)} y1={0} y2={H} className="smp-med-line" />
          <line x1={sx(s.mean)} x2={sx(s.mean)} y1={0} y2={H} className="smp-mean-line" />
          <text x={P} y={H + 14} className="smp-axis">{fnum(lo)}</text>
          <text x={W - P} y={H + 14} className="smp-axis" textAnchor="end">{fnum(hi)}</text>
        </svg>
      )}
      <div className="smp-stats">
        <span>Mean</span><b className="mono">{fnum(s.mean)}</b>
        <span>Median</span><b className="mono">{fnum(s.median)}</b>
        <span>SD</span><b className="mono">{fnum(s.sd)}</b>
        <span>95 % interval</span><b className="mono">[{fnum(s.q025)}, {fnum(s.q975)}]</b>
        <span>Quartiles</span><b className="mono">[{fnum(s.q25)}, {fnum(s.q75)}]</b>
        <span>Range</span><b className="mono">[{fnum(s.min)}, {fnum(s.max)}]</b>
      </div>
      <div className="muted small"><i className="smp-key med" /> median · <i className="smp-key mean" /> mean · shaded: 95 % interval · grey line: 0</div>
    </div>
  );
}
