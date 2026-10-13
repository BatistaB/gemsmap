/**
 * Subsystem views for a result and for a comparison.
 *
 * Form choices (see the dataviz guidance): many nominal categories whose magnitudes are compared
 * → ranked horizontal bars in one hue (not a pie: Σ|v| is not a share of a whole, and ~40 slices
 * cannot be read). Reaction flux has a sign (direction relative to the written reaction) → diverging
 * bars around zero, blue = as written, red = reverse. Before → after per subsystem → dumbbell in two
 * shades of one hue. Reactions of selected subsystems are shown together (one chart, one scale) or
 * separately (small multiples, shared or independent scale).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../../ui/icons';
import { addReactionsToMap } from '../bridge';
import { fnum, FLUX_UNIT } from '../format';
import { normalize } from '../search';
import { L, lab, useLab, type SubsysView } from '../store';
import { metricValue, subsystemCompare, subsystemLabel, subsystemStats, type SubsysCompare, type SubsysStat } from '../subsystems';
import type { CompareRow, SimulationResult } from '../types';
import { ResizeHandle, usePanelWidth } from '../../ui/Resizer';
import { RangeBar, Seg, Toggle } from './common';
import { CATEGORICAL, FigurePaper, type FigGroup, type FigInput, type FigSeries } from './SubsystemFigure';

const FWD = '#2a78d6';
const REV = '#e34948';
const SHADE_A = '#86b6ef';
const SHADE_B = '#1c5cab';
const ROW_CAP = 40;

// ------------------------------------------------------------------ tooltip

interface Tip { x: number; y: number; body: ReactNode }
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const on = (body: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, body }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? <div className="ss-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 260), top: tip.y + 14 }}>{tip.body}</div> : null;
  return { on, node };
}

// ------------------------------------------------------------------ shared controls

function DetailControls({ legend, isFva }: { legend: ReactNode; isFva?: boolean }) {
  const v = useLab((s) => s.subsys);
  const fig = v.view !== 'list';
  return (
    <div className="ss-controls">
      {fig && <button className={`btn small ${v.wide ? 'on' : ''}`} onClick={() => lab.setSubsys({ wide: !v.wide })} title={v.wide ? 'Show the subsystem list' : 'Hide the subsystem list: the figure gets the full width'}><Icon name={v.wide ? 'panelR' : 'panelL'} size={12} /></button>}
      <Seg value={v.view} options={['list', 'bars', 'heatmap', 'pie'] as const} onChange={(view) => lab.setSubsys({ view })}
        labels={{ list: 'List', bars: 'Bars', heatmap: 'Heatmap', pie: 'Donut' }}
        titles={{ list: 'Interactive rows: click a reaction to inspect it', bars: 'Publication figure: bar chart', heatmap: isFva ? 'Not available for FVA (intervals have no single value)' : 'Publication figure: heatmap (rows × results)', pie: isFva ? 'Not available for FVA (intervals are not amounts)' : 'Publication figure: donut of shares of Σ|flux|' }} />
      <span className="ss-sep" />
      {!(fig && v.level === 'subsystems') && v.view !== 'pie' && <Seg value={v.mode} options={['combined', 'separate'] as const} onChange={(mode) => lab.setSubsys({ mode })}
        labels={{ combined: 'Together', separate: 'Separate' }} titles={{ combined: 'One chart, one scale: compare magnitudes across subsystems', separate: 'One panel per subsystem (small multiples)' }} />}
      {v.mode === 'separate' && !(fig && (v.level === 'subsystems' || v.view === 'pie')) && (
        <Seg value={v.scale} options={['shared', 'independent'] as const} onChange={(scale) => lab.setSubsys({ scale })}
          labels={{ shared: 'Shared scale', independent: 'Own scale' }} titles={{ shared: 'Bar lengths comparable across panels', independent: 'Each panel scaled to its own largest flux — reveals the pattern inside small subsystems' }} />
      )}
      <Seg value={v.sort} options={['magnitude', 'name'] as const} onChange={(sort) => lab.setSubsys({ sort })} labels={{ magnitude: 'Sort |flux|', name: 'Sort ID' }} />
      <Toggle checked={v.showZero} onChange={(showZero) => lab.setSubsys({ showZero })}>Zero-flux reactions</Toggle>
      <span className="grow" />
      {!fig && <div className="ss-legend">{legend}</div>}
    </div>
  );
}

function Swatch({ color, label, round }: { color: string; label: string; round?: boolean }) {
  return <span className="ss-sw"><i style={{ background: color, borderRadius: round ? '50%' : 2 }} />{label}</span>;
}

function GroupHead({ k, summary, n }: { k: string; summary: ReactNode; n: number }) {
  return (
    <div className="ss-group-head">
      <div className="ss-group-title">
        <button className="ss-group-name ellipsis" title={`Inspect ${subsystemLabel(k)}`} onClick={() => lab.navigate({ kind: 'subsystem', id: k })}>{subsystemLabel(k)}</button>
        <span className="muted small">{summary}</span>
      </div>
      <button className="icon-btn tiny" title={`Add the ${n} reactions to the map`} onClick={() => addReactionsToMap(useLab.getState().index!.subsystems.get(k) ?? [], 'hierarchical')}><Icon name="plus" size={11} /></button>
      <button className="icon-btn tiny" title="Remove from selection" onClick={() => lab.toggleSubsystem(k)}><Icon name="x" size={11} /></button>
    </div>
  );
}

function Capped<T>({ items, render }: { items: T[]; render: (t: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <>
      {(all ? items : items.slice(0, ROW_CAP)).map(render)}
      {items.length > ROW_CAP && <button className="link small ss-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length} reactions`}</button>}
    </>
  );
}

/** Signed bar centred on zero; width relative to `max` (half the track each side). */
function Diverging({ v, max, tol }: { v: number | null | undefined; max: number; tol: number }) {
  if (v == null) return <span className="ss-div"><i className="ss-zero" /></span>;
  const w = max > 0 ? Math.min(1, Math.abs(v) / max) * 50 : 0;
  const zero = Math.abs(v) < tol;
  return (
    <span className="ss-div">
      <i className="ss-zero" />
      {!zero && <span className={`ss-bar ${v > 0 ? 'pos' : 'neg'}`} style={{ width: `${w}%`, background: v > 0 ? FWD : REV, ...(v > 0 ? { left: '50%' } : { right: '50%' }) }} />}
    </span>
  );
}

// ------------------------------------------------------------------ result view

export function SubsystemResults({ r }: { r: SimulationResult }) {
  const index = useLab((s) => s.index)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const v = useLab((s) => s.subsys);
  const [q, setQ] = useState('');
  const tip = useTip();
  const pw = usePanelWidth('lab-subsys-overview', 340, 240, 640);
  const isFva = !!r.fva;
  const stats = useMemo(() => subsystemStats(index, r, tol), [index, r, tol]);
  const metricLabel = isFva
    ? { total: 'Σ FVA width', active: 'Variable reactions', mean: 'Mean FVA width' }
    : { total: 'Σ |flux|', active: 'Active reactions', mean: 'Mean |flux| (active)' };
  const shown = useMemo(() => {
    const n = normalize(q.trim());
    return stats.filter((s) => (!v.hideInactive || s.active > 0) && (!n || normalize(subsystemLabel(s.key)).includes(n)))
      .sort((a, b) => metricValue(b, v.metric) - metricValue(a, v.metric) || a.key.localeCompare(b.key));
  }, [stats, v.hideInactive, v.metric, q]);
  const max = Math.max(1e-12, ...shown.map((s) => metricValue(s, v.metric)));
  const activeSubs = stats.filter((s) => s.active > 0).length;
  const selected = v.selected.filter((k) => stats.some((s) => s.key === k));

  return (
    <div className="ss-layout">
      <div className="ss-overview" style={{ width: pw.width, display: v.wide && v.view !== 'list' && selected.length ? 'none' : undefined }}>
        <ResizeHandle panel={pw} edge="right" />
        <div className="ss-ov-head">
          <div className="search-box"><Icon name="search" size={13} /><input placeholder="Filter subsystems…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="row gap wrap">
            <Seg value={v.metric} options={['total', 'active', 'mean'] as const} onChange={(metric) => lab.setSubsys({ metric })} labels={metricLabel} />
          </div>
          <div className="row gap wrap">
            <Toggle checked={v.hideInactive} onChange={(hideInactive) => lab.setSubsys({ hideInactive })}>Hide inactive</Toggle>
            <span className="grow" />
            <button className="link small" onClick={() => lab.setSubsys({ selected: shown.slice(0, 5).map((s) => s.key) })}>Top 5</button>
            {selected.length > 0 && <button className="link small" onClick={() => lab.setSubsys({ selected: [] })}>Clear</button>}
          </div>
          <div className="muted small">{activeSubs} of {stats.length} subsystems {isFva ? 'variable' : 'carry flux'} · descriptive sums over annotated reactions{v.metric !== 'active' && !isFva ? ` (${FLUX_UNIT})` : ''}</div>
        </div>
        <div className="ss-ov-list">
          {shown.map((s) => {
            const val = metricValue(s, v.metric);
            const on = v.selected.includes(s.key);
            return (
              <button key={s.key} className={`ss-ov-row ${on ? 'on' : ''}`} onClick={() => lab.toggleSubsystem(s.key)}
                {...tip.on(<OverviewTip s={s} isFva={isFva} />)}>
                <input type="checkbox" readOnly checked={on} tabIndex={-1} />
                <span className="ss-ov-name ellipsis" title={s.key}>{subsystemLabel(s.key)}</span>
                <span className="ss-ov-track"><span style={{ width: `${(val / max) * 100}%`, background: FWD, opacity: s.active ? 1 : 0.3 }} /></span>
                <span className="ss-ov-val mono">{v.metric === 'active' ? val : fnum(val)}</span>
                <span className="ss-ov-n mono muted">{s.active}/{s.rids.length}</span>
              </button>
            );
          })}
          {!shown.length && <div className="muted small pad">No subsystem matches.</div>}
        </div>
      </div>
      <div className="ss-detail">
        <DetailControls isFva={isFva} legend={isFva ? <Swatch color="#b45309" label="feasible interval" /> : <><Swatch color={FWD} label="forward (as written)" /><Swatch color={REV} label="reverse" /></>} />
        {v.view !== 'list' && selected.length > 0 ? <ResultFigure r={r} keys={selected} stats={stats} /> : !selected.length ? (
          <div className="ss-empty">
            <div className="empty-title">Pick subsystems to open</div>
            <p className="muted">Click subsystems on the left to see the flux through each of their reactions — together on one scale, or side by side.</p>
            <button className="btn primary small" onClick={() => lab.setSubsys({ selected: shown.slice(0, 5).map((s) => s.key) })}>Open the top 5</button>
          </div>
        ) : (
          <ResultGroups r={r} keys={selected} stats={stats} tip={tip.on} />
        )}
      </div>
      {tip.node}
    </div>
  );
}

function OverviewTip({ s, isFva }: { s: SubsysStat; isFva: boolean }) {
  return (
    <>
      <b>{subsystemLabel(s.key)}</b>
      <div>{isFva ? 'Σ FVA width' : 'Σ |flux|'}: <span className="mono">{fnum(s.total)}</span></div>
      <div>{isFva ? 'Variable' : 'Active'}: <span className="mono">{s.active} / {s.rids.length}</span> reactions</div>
      {s.mean != null && <div>Mean over {isFva ? 'variable' : 'active'}: <span className="mono">{fnum(s.mean)}</span></div>}
      <div className="muted">Click to {useLab.getState().subsys.selected.includes(s.key) ? 'close' : 'open'} its reactions</div>
    </>
  );
}

type TipOn = (body: ReactNode) => { onMouseMove: (e: React.MouseEvent) => void; onMouseLeave: () => void };

function ResultGroups({ r, keys, stats, tip }: { r: SimulationResult; keys: string[]; stats: SubsysStat[]; tip: TipOn }) {
  const index = useLab((s) => s.index)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const v = useLab((s) => s.subsys);
  const isFva = !!r.fva;
  const groups = keys.map((k) => {
    const st = stats.find((s) => s.key === k)!;
    let rids = st.rids;
    if (!v.showZero) rids = rids.filter((id) => (isFva ? (() => { const iv = r.fva![id]; return iv && (Math.abs(iv.minimum ?? 0) >= tol || Math.abs(iv.maximum ?? 0) >= tol); })() : Math.abs(r.reactionFluxes?.[id] ?? 0) >= tol));
    const mag = (id: string) => (isFva ? Math.max(Math.abs(r.fva![id]?.minimum ?? 0), Math.abs(r.fva![id]?.maximum ?? 0)) : Math.abs(r.reactionFluxes?.[id] ?? 0));
    rids = [...rids].sort(v.sort === 'name' ? (a, b) => a.localeCompare(b) : (a, b) => mag(b) - mag(a));
    return { st, rids, max: Math.max(1e-12, ...rids.map(mag)) };
  });
  const sharedMax = Math.max(1e-12, ...groups.map((g) => g.max));
  const fvaLo = isFva ? Math.min(0, ...groups.flatMap((g) => g.rids.map((id) => r.fva![id]?.minimum ?? 0))) : 0;
  const fvaHi = isFva ? Math.max(0, ...groups.flatMap((g) => g.rids.map((id) => r.fva![id]?.maximum ?? 0))) : 0;

  const row = (id: string, max: number, lo: number, hi: number) => {
    const rx = index.rxn.get(id);
    const val = r.reactionFluxes?.[id];
    const iv = r.fva?.[id];
    return (
      <div key={id} className="ss-row" onClick={() => lab.navigate({ kind: 'reaction', id })}
        {...tip(isFva
          ? <><b className="mono">{id}</b><div>{rx?.name}</div><div>FVA: <span className="mono">[{fnum(iv?.minimum)}, {fnum(iv?.maximum)}]</span></div></>
          : <><b className="mono">{id}</b><div>{rx?.name}</div><div>Flux: <span className="mono">{fnum(val)}</span> {FLUX_UNIT}</div><div className="muted">{val == null || Math.abs(val) < tol ? 'no flux' : val > 0 ? 'runs as written' : 'runs in reverse of the written direction'}</div></>)}>
        <span className="mono ss-id ellipsis">{id}</span>
        <span className="ss-name ellipsis">{rx?.name}</span>
        {isFva ? <span className="ss-div"><RangeBar min={iv?.minimum ?? null} max={iv?.maximum ?? null} lo={lo} hi={hi} /></span> : <Diverging v={val} max={max} tol={tol} />}
        <span className="mono ss-val">{isFva ? fnum((iv?.maximum ?? 0) - (iv?.minimum ?? 0)) : fnum(val)}</span>
      </div>
    );
  };

  const block = (g: (typeof groups)[number], scaleMax: number, lo: number, hi: number) => (
    <>
      <GroupHead k={g.st.key} n={g.st.rids.length} summary={<>{isFva ? 'Σ width' : 'Σ|v|'} <span className="mono">{fnum(g.st.total)}</span> · {g.st.active}/{g.st.rids.length} {isFva ? 'variable' : 'active'}</>} />
      {g.rids.length ? <Capped items={g.rids} render={(id) => row(id, scaleMax, lo, hi)} /> : <div className="muted small ss-none">No {isFva ? 'variable' : 'active'} reaction{v.showZero ? '' : ' — turn on “Zero-flux reactions” to list all'}.</div>}
    </>
  );

  if (v.mode === 'combined') {
    return (
      <div className="ss-combined">
        <ScaleNote max={sharedMax} isFva={isFva} lo={fvaLo} hi={fvaHi} />
        {groups.map((g) => <div key={g.st.key} className="ss-group">{block(g, sharedMax, fvaLo, fvaHi)}</div>)}
      </div>
    );
  }
  return (
    <div className="ss-grid">
      {groups.map((g) => {
        const m = v.scale === 'shared' ? sharedMax : g.max;
        const lo = isFva && v.scale === 'independent' ? Math.min(0, ...g.rids.map((id) => r.fva![id]?.minimum ?? 0)) : fvaLo;
        const hi = isFva && v.scale === 'independent' ? Math.max(0, ...g.rids.map((id) => r.fva![id]?.maximum ?? 0)) : fvaHi;
        return (
          <div key={g.st.key} className="ss-card">
            {block(g, m, lo, hi)}
            <ScaleNote max={m} isFva={isFva} lo={lo} hi={hi} />
          </div>
        );
      })}
    </div>
  );
}

function ScaleNote({ max, isFva, lo, hi }: { max: number; isFva: boolean; lo: number; hi: number }) {
  return (
    <div className="ss-scale mono">
      {isFva ? <><span>{fnum(lo)}</span><span>0</span><span>{fnum(hi)}</span></> : <><span>−{fnum(max)}</span><span>0</span><span>+{fnum(max)}</span></>}
    </div>
  );
}

// ------------------------------------------------------------------ comparison view

type CmpSort = 'absDelta' | 'log2' | 'name' | 'totalB';

export function SubsystemCompareView() {
  const res = useLab((s) => s.compare.result)!;
  const index = useLab((s) => s.index)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const v = useLab((s) => s.subsys);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<CmpSort>('absDelta');
  const tip = useTip();
  const pw = usePanelWidth('lab-subsys-compare-overview', 420, 300, 720);
  const rows = res.reactions as CompareRow[];
  const stats = useMemo(() => subsystemCompare(index, rows, tol), [index, rows, tol]);
  const shown = useMemo(() => {
    const n = normalize(q.trim());
    const list = stats.filter((s) => (!v.hideInactive || s.state !== 'both-zero') && (!n || normalize(subsystemLabel(s.key)).includes(n)));
    const key = (s: SubsysCompare) => (sort === 'absDelta' ? -Math.abs(s.delta) : sort === 'log2' ? -Math.abs(s.log2 ?? (s.state === 'changed' ? 0 : Infinity)) : sort === 'totalB' ? -s.totalB : 0);
    return list.sort((a, b) => key(a) - key(b) || subsystemLabel(a.key).localeCompare(subsystemLabel(b.key)));
  }, [stats, v.hideInactive, q, sort]);
  const max = Math.max(1e-12, ...shown.map((s) => Math.max(s.totalA, s.totalB)));
  const selected = v.selected.filter((k) => stats.some((s) => s.key === k));

  return (
    <div className="ss-layout cmp">
      <div className="ss-overview" style={{ width: pw.width, display: v.wide && v.view !== 'list' && selected.length ? 'none' : undefined }}>
        <ResizeHandle panel={pw} edge="right" />
        <div className="ss-ov-head">
          <div className="search-box"><Icon name="search" size={13} /><input placeholder="Filter subsystems…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="row gap wrap">
            <select className="input tiny" value={sort} onChange={(e) => setSort(e.target.value as CmpSort)}>
              <option value="absDelta">Sort: largest |Δ Σ|v||</option><option value="log2">Sort: largest |log₂ ratio|</option>
              <option value="totalB">Sort: Σ|v| in B</option><option value="name">Sort: name</option>
            </select>
            <Toggle checked={v.hideInactive} onChange={(hideInactive) => lab.setSubsys({ hideInactive })}>Hide zero in both</Toggle>
            <span className="grow" />
            <button className="link small" onClick={() => lab.setSubsys({ selected: shown.slice(0, 5).map((s) => s.key) })}>Top 5</button>
            {selected.length > 0 && <button className="link small" onClick={() => lab.setSubsys({ selected: [] })}>Clear</button>}
          </div>
          <div className="ss-legend"><Swatch color={SHADE_A} label={`A · ${res.a.name}`} round /><Swatch color={SHADE_B} label={`B · ${res.b.name}`} round /></div>
          <div className="muted small">Σ|flux| per subsystem in A and B (descriptive sums). Reaction counts use the comparison categories.</div>
        </div>
        <div className="ss-ov-list">
          {shown.map((s) => {
            const on = v.selected.includes(s.key);
            const xa = (s.totalA / max) * 100, xb = (s.totalB / max) * 100;
            return (
              <button key={s.key} className={`ss-ov-row cmp ${on ? 'on' : ''}`} onClick={() => lab.toggleSubsystem(s.key)}
                {...tip.on(<CompareTip s={s} />)}>
                <input type="checkbox" readOnly checked={on} tabIndex={-1} />
                <span className="ss-ov-name ellipsis" title={s.key}>{subsystemLabel(s.key)}</span>
                <span className="ss-dumbbell">
                  <i className="ss-db-line" style={{ left: `${Math.min(xa, xb)}%`, width: `${Math.abs(xb - xa)}%` }} />
                  <i className="ss-db-dot" style={{ left: `${xa}%`, background: SHADE_A }} />
                  <i className="ss-db-dot" style={{ left: `${xb}%`, background: SHADE_B }} />
                </span>
                <span className={`ss-ov-val mono ${s.delta > tol ? 'up' : s.delta < -tol ? 'down' : ''}`}>{s.delta > 0 ? '+' : ''}{fnum(s.delta)}</span>
                <span className="ss-badges">
                  {s.counts.reversal > 0 && <span className="cat c-reversal" title="direction reversals">⇄{s.counts.reversal}</span>}
                  {s.counts.activated > 0 && <span className="cat c-activated" title="activated from zero">+{s.counts.activated}</span>}
                  {s.counts.inactivated > 0 && <span className="cat c-inactivated" title="inactivated to zero">−{s.counts.inactivated}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="ss-detail">
        <DetailControls legend={<><Swatch color={SHADE_A} label="A" /><Swatch color={SHADE_B} label="B" /><span className="muted small">right of 0 = as written · left = reverse</span></>} />
        {v.view !== 'list' && selected.length > 0 ? <CompareFigure keys={selected} stats={stats} /> : !selected.length ? (
          <div className="ss-empty">
            <div className="empty-title">Which subsystems changed?</div>
            <p className="muted">The left list ranks subsystems by how much their total flux moved between A and B. Open some to compare their reactions one by one.</p>
            <button className="btn primary small" onClick={() => lab.setSubsys({ selected: shown.slice(0, 5).map((s) => s.key) })}>Open the 5 largest changes</button>
          </div>
        ) : <CompareGroups keys={selected} stats={stats} rows={rows} tip={tip.on} />}
      </div>
      {tip.node}
    </div>
  );
}

function CompareTip({ s }: { s: SubsysCompare }) {
  return (
    <>
      <b>{subsystemLabel(s.key)}</b>
      <div>Σ|v|: <span className="mono">{fnum(s.totalA)} → {fnum(s.totalB)}</span> (Δ <span className="mono">{fnum(s.delta)}</span>)</div>
      <div>{s.state === 'activated' ? 'Inactive in A' : s.state === 'inactivated' ? 'Inactive in B' : s.log2 != null ? <>log₂ ratio <span className="mono">{fnum(s.log2, 3)}</span></> : 'Zero in both'}</div>
      <div className="muted">{s.counts.changed} changed · {s.counts.activated} activated · {s.counts.inactivated} inactivated · {s.counts.reversal} reversed</div>
    </>
  );
}

function CompareGroups({ keys, stats, rows, tip }: { keys: string[]; stats: SubsysCompare[]; rows: CompareRow[]; tip: TipOn }) {
  const index = useLab((s) => s.index)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const v = useLab((s) => s.subsys);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const groups = keys.map((k) => {
    const st = stats.find((s) => s.key === k)!;
    let list = st.rids.map((id) => byId.get(id)).filter((r): r is CompareRow => !!r);
    if (!v.showZero) list = list.filter((r) => r.category !== 'both-zero');
    list.sort(v.sort === 'name' ? (a, b) => a.id.localeCompare(b.id) : (a, b) => (b.absDelta ?? 0) - (a.absDelta ?? 0));
    return { st, list, max: Math.max(1e-12, ...list.map((r) => Math.max(Math.abs(r.a ?? 0), Math.abs(r.b ?? 0)))) };
  });
  const sharedMax = Math.max(1e-12, ...groups.map((g) => g.max));
  const row = (r: CompareRow, max: number) => (
    <div key={r.id} className={`ss-row cmp ${r.category === 'reversal' ? 'rev' : ''}`} onClick={() => lab.navigate({ kind: 'reaction', id: r.id })}
      {...tip(<><b className="mono">{r.id}</b><div>{index.rxn.get(r.id)?.name}</div><div>A <span className="mono">{fnum(r.a)}</span> → B <span className="mono">{fnum(r.b)}</span></div><div>{r.category === 'reversal' ? 'Direction reversal — no fold change' : r.log2fc != null ? <>log₂FC |v| <span className="mono">{fnum(r.log2fc, 3)}</span></> : r.category}</div></>)}>
      <span className="mono ss-id ellipsis">{r.id}</span>
      <span className="ss-name ellipsis">{index.rxn.get(r.id)?.name}</span>
      <span className="ss-pair">
        <PairBar v={r.a} max={max} color={SHADE_A} tol={tol} />
        <PairBar v={r.b} max={max} color={SHADE_B} tol={tol} />
      </span>
      <span className={`mono ss-val ${(r.delta ?? 0) > tol ? 'up' : (r.delta ?? 0) < -tol ? 'down' : ''}`}>{(r.delta ?? 0) > 0 ? '+' : ''}{fnum(r.delta)}</span>
      <span className="ss-cat">{r.category === 'reversal' ? <span className="cat c-reversal">⇄</span> : r.category === 'activated' ? <span className="cat c-activated">0→</span> : r.category === 'inactivated' ? <span className="cat c-inactivated">→0</span> : null}</span>
    </div>
  );
  const block = (g: (typeof groups)[number], max: number) => (
    <>
      <GroupHead k={g.st.key} n={g.st.rids.length} summary={<>Σ|v| <span className="mono">{fnum(g.st.totalA)} → {fnum(g.st.totalB)}</span>{g.st.counts.reversal ? ` · ${g.st.counts.reversal} reversed` : ''}</>} />
      {g.list.length ? <Capped items={g.list} render={(r) => row(r, max)} /> : <div className="muted small ss-none">No reaction carries flux in A or B.</div>}
    </>
  );
  if (v.mode === 'combined') {
    return (
      <div className="ss-combined">
        <ScaleNote max={sharedMax} isFva={false} lo={0} hi={0} />
        {groups.map((g) => <div key={g.st.key} className="ss-group">{block(g, sharedMax)}</div>)}
      </div>
    );
  }
  return (
    <div className="ss-grid">
      {groups.map((g) => {
        const m = v.scale === 'shared' ? sharedMax : g.max;
        return <div key={g.st.key} className="ss-card">{block(g, m)}<ScaleNote max={m} isFva={false} lo={0} hi={0} /></div>;
      })}
    </div>
  );
}

function PairBar({ v, max, color, tol }: { v: number | null; max: number; color: string; tol: number }) {
  const w = v == null || Math.abs(v) < tol ? 0 : Math.min(1, Math.abs(v) / max) * 50;
  return (
    <span className="ss-div thin">
      <i className="ss-zero" />
      {w > 0 && <span className={`ss-bar ${v! > 0 ? 'pos' : 'neg'}`} style={{ width: `${w}%`, background: color, ...(v! > 0 ? { left: '50%' } : { right: '50%' }) }} />}
    </span>
  );
}

// ------------------------------------------------------------------ publication figures

/** Reactions drawn per subsystem: same filters and order as the list, capped at fig.maxRows. */
function figGroups(keys: string[], ridsOf: (k: string) => string[], series: FigSeries[], tol: number, v: SubsysView): FigGroup[] {
  const mag = (id: string) => Math.max(0, ...series.map((s) => (s.fva ? Math.max(Math.abs(s.fva[id]?.minimum ?? 0), Math.abs(s.fva[id]?.maximum ?? 0)) : Math.abs(s.flux?.[id] ?? 0))));
  return keys.map((key) => {
    const all = ridsOf(key);
    let rids = v.showZero ? all : all.filter((id) => mag(id) >= tol);
    rids = [...rids].sort(v.sort === 'name' ? (a, b) => a.localeCompare(b) : (a, b) => mag(b) - mag(a)).slice(0, v.fig.maxRows);
    return { key, all, rids };
  });
}

const toSeries = (r: SimulationResult, color: string, name = r.name): FigSeries => ({ id: r.id, name, color, flux: r.reactionFluxes, fva: r.fva });

function ResultFigure({ r, keys, stats }: { r: SimulationResult; keys: string[]; stats: SubsysStat[] }) {
  const index = useLab((s) => s.index)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const v = useLab((s) => s.subsys);
  const results = useLab((s) => s.results);
  const isFva = !!r.fva;
  const candidates = results.filter((x) => x.id !== r.id && x.solverStatus === 'optimal' && !!x.reactionFluxes && !isFva);
  const extra = v.series.map((id) => candidates.find((x) => x.id === id)).filter((x): x is SimulationResult => !!x);
  const inp = useMemo<FigInput>(() => {
    // colour follows the result: slot 1 = the open result, then the order in which results were added
    const series = [toSeries(r, CATEGORICAL[0]), ...extra.map((x, i) => toSeries(x, CATEGORICAL[(i + 1) % CATEGORICAL.length]))];
    const ridsOf = (k: string) => stats.find((s) => s.key === k)?.rids ?? [];
    return {
      series, groups: figGroups(keys, ridsOf, series, tol, v), tol, mode: v.mode, scale: v.scale,
      autoTitle: series.length > 1 ? `${keys.length === 1 ? subsystemLabel(keys[0]) : 'Subsystem fluxes'} — ${series.length} results` : `${keys.length === 1 ? subsystemLabel(keys[0]) : 'Subsystem fluxes'} — ${r.name}`,
      rxnName: (id) => index.rxn.get(id)?.name ?? '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, extra.map((x) => x.id).join(), keys.join(), stats, tol, v.mode, v.scale, v.showZero, v.sort, v.fig.maxRows, index]);
  const view = isFva && v.view !== 'bars' ? 'bars' : v.view as 'bars' | 'heatmap' | 'pie';
  return (
    <div className="ss-figure">
      {isFva && v.view !== 'bars' && <div className="note small">FVA results are drawn as intervals only — heatmaps and donuts need one value per reaction, so the bar (interval) figure is shown.</div>}
      {!isFva && (
        <div className="fig-series">
          <span className="muted small">Results in the figure</span>
          {inp.series.map((s, i) => (
            <span key={s.id} className="fig-chip"><i style={{ background: s.color }} />{s.name}
              {i > 0 && <button className="icon-btn tiny" title="Remove" onClick={() => lab.setSubsys({ series: v.series.filter((x) => x !== s.id) })}><Icon name="x" size={9} /></button>}
            </span>
          ))}
          {candidates.length > extra.length && inp.series.length < CATEGORICAL.length && (
            <select className="input tiny" value="" onChange={(e) => e.target.value && lab.setSubsys({ series: [...v.series, e.target.value] })}>
              <option value="">＋ Add a result…</option>
              {candidates.filter((x) => !v.series.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}{x.origin ? ' (imported)' : ''}</option>)}
            </select>
          )}
          {inp.series.length > 1 && <span className="muted small">compared by reaction id · values as stored in each result</span>}
        </div>
      )}
      <FigurePaper inp={inp} view={view} level={v.level} />
    </div>
  );
}

function CompareFigure({ keys, stats }: { keys: string[]; stats: SubsysCompare[] }) {
  const index = useLab((s) => s.index)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const v = useLab((s) => s.subsys);
  const a = useLab((s) => L.result(s.compare.aId, s));
  const b = useLab((s) => L.result(s.compare.bId, s));
  const inp = useMemo<FigInput | null>(() => {
    if (!a || !b) return null;
    const series = [toSeries(a, SHADE_A, `A · ${a.name}`), toSeries(b, SHADE_B, `B · ${b.name}`)];
    const ridsOf = (k: string) => stats.find((s) => s.key === k)?.rids ?? [];
    return {
      series, groups: figGroups(keys, ridsOf, series, tol, v), tol, mode: v.mode, scale: v.scale,
      autoTitle: `${keys.length === 1 ? subsystemLabel(keys[0]) : 'Subsystem fluxes'} — ${a.name} vs ${b.name}`,
      rxnName: (id) => index.rxn.get(id)?.name ?? '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, keys.join(), stats, tol, v.mode, v.scale, v.showZero, v.sort, v.fig.maxRows, index]);
  if (!inp) return <div className="muted small pad">Pick results A and B.</div>;
  return <div className="ss-figure"><FigurePaper inp={inp} view={v.view as 'bars' | 'heatmap' | 'pie'} level={v.level} /></div>;
}
