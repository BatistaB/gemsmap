import { useMemo, useState } from 'react';
import { Icon } from '../../ui/icons';
import { api, ApiError, saveBlob } from '../api';
import { fbounds, fnum, FLUX_UNIT, fvaWidth, objectiveText, timeLabel } from '../format';
import { L, lab, useLab } from '../store';
import type { ExchangeFlux, ExchangeInterval, LabGene, SimulationResult, SortSpec } from '../types';
import { pickResultFiles } from './importResults';
import { ELink, Popover, RangeBar, SectionHead, StatusPill, Toggle, useDebounced } from './common';
import { ResultStatusCard } from './Simulate';
import { SubsystemResults } from './Subsystems';
import { GeneTable, geneSortValue, MetaboliteTable, metSortValue, ReactionTable, rxnSortValue, sortRows, useRxnCtx } from './tables';
import { VirtualTable, type Col } from './VirtualTable';
import { ResizeHandle, usePanelWidth } from '../../ui/Resizer';

export function Results() {
  const pw = usePanelWidth('lab-results-list', 250, 160, 560);
  const results = useLab((s) => s.results);
  const activeFlux = useLab((s) => s.activeResultId);
  const activeFva = useLab((s) => s.activeFvaId);
  const lastId = useLab((s) => s.lastRun?.resultId);
  const [viewId, setViewId] = useState<string | null>(null);
  const shown = results.find((r) => r.id === viewId) ?? results.find((r) => r.id === lastId) ?? results.find((r) => r.id === activeFlux) ?? results[results.length - 1];
  if (!results.length) {
    return (
      <div className="lab-page">
        <SectionHead title="Results" />
        <div className="empty-state">
          <div className="empty-title">No simulation yet.</div>
          <p className="muted">Configure a medium and objective, then run FBA or pFBA. Every run is kept here with its exact configuration.</p>
          <div className="row gap">
            <button className="btn primary" onClick={() => lab.setSection('simulate')}><Icon name="play" size={12} /> Run simulation</button>
            <button className="btn" onClick={pickResultFiles}><Icon name="import" size={12} /> Import results…</button>
          </div>
          <p className="muted small">JSON exported by GEMs MAP or the legacy GEM Explorer, or CSV/TSV flux and FVA tables.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="results-layout">
      <div className="result-list" style={{ width: pw.css }}>
        <ResizeHandle panel={pw} edge="right" />
        <div className="pane-scroll">
        <div className="rl-head row between"><span>Results · {results.length}</span><button className="btn small" title="Import results (JSON, CSV, TSV) — e.g. from another model" onClick={pickResultFiles}><Icon name="import" size={11} /> Import</button></div>
        {[...results].reverse().map((r) => (
          <button key={r.id} className={`rl-item ${shown?.id === r.id ? 'on' : ''}`} onClick={() => { setViewId(r.id); lab.selectResult(r.id); }}>
            <div className="row gap"><i className={`status-dot s-${r.solverStatus}`} /><span className="ellipsis strong grow">{r.name}</span></div>
            <div className="muted small row gap">
              <span>{r.metadata.methodLabel} · {r.metadata.state.name}</span><span className="grow" /><span>{timeLabel(r.createdAt ?? Date.parse(r.metadata.timestamp))}</span>
            </div>
            <span className="row gap">
              {(r.id === activeFlux || r.id === activeFva) && <span className="tag on">{r.id === activeFva ? 'active FVA' : 'active'}</span>}
              <OriginTags r={r} />
            </span>
          </button>
        ))}
        </div>
      </div>
      {shown && <ResultWorkspace key={shown.id} r={shown} />}
    </div>
  );
}

type RTab = 'reactions' | 'metabolites' | 'exchanges' | 'subsystems' | 'genes' | 'provenance';

function ResultWorkspace({ r }: { r: SimulationResult }) {
  const [tab, setTab] = useState<RTab>(r.solverStatus === 'optimal' ? 'reactions' : 'provenance');
  const [renaming, setRenaming] = useState(false);
  const hasSubsystems = useLab((s) => (s.index?.subsystems.size ?? 0) > 0);
  const modelChecksum = useLab((s) => s.model?.checksum ?? '');
  const ok = r.solverStatus === 'optimal';
  const ex = Object.values(r.exchanges ?? {});
  const uptakes = r.fva ? null : (ex as ExchangeFlux[]).filter((x) => !L.isZero(x.uptake)).length;
  const secretions = r.fva ? null : (ex as ExchangeFlux[]).filter((x) => !L.isZero(x.secretion)).length;
  const exportAs = async (format: 'json' | 'csv', table: string) => {
    try { const { blob, filename } = await api.exportResult(r, format, table); saveBlob(blob, filename); }
    catch (e) { lab.log('error', e instanceof ApiError ? e.info.title : String(e)); }
  };
  return (
    <div className="result-ws">
      <div className="rw-head">
        <div className="grow">
          {renaming
            ? <input className="input title-input" autoFocus defaultValue={r.name} onBlur={(e) => { lab.renameResult(r.id, e.target.value); setRenaming(false); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            : <div className="rw-title" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">{r.name}</div>}
          <div className="muted small">{r.metadata.methodLabel} — state <b>{r.metadata.state.name}</b> · {new Date(r.metadata.timestamp).toLocaleString()}</div>
        </div>
        <div className="row gap wrap">
          <button className="btn small" onClick={() => setRenaming(true)}>Rename</button>
          {ok && <button className="btn small primary" onClick={() => useLab.setState({ dialog: { kind: 'visualize-result', resultId: r.id } })}>Visualize result</button>}
          {ok && <button className="btn small" onClick={() => { useLab.setState((s) => ({ compare: { ...s.compare, aId: r.id, result: null } })); lab.setSection('compare'); }}>Compare with…</button>}
          <Popover align="right" trigger={(o, t) => <button className={`btn small ${o ? 'on' : ''}`} onClick={t}>Export ▾</button>}>
            {(close) => (
              <div className="menu-list">
                <button onClick={() => { exportAs('json', 'fluxes'); close(); }}>JSON (with full metadata)</button>
                {r.reactionFluxes && <button onClick={() => { exportAs('csv', 'fluxes'); close(); }}>CSV · reaction fluxes</button>}
                {r.fva && <button onClick={() => { exportAs('csv', 'fva'); close(); }}>CSV · FVA intervals</button>}
                {r.metaboliteTurnover && <button onClick={() => { exportAs('csv', 'turnover'); close(); }}>CSV · metabolite turnover</button>}
                {r.exchanges && <button onClick={() => { exportAs('csv', 'exchanges'); close(); }}>CSV · exchanges</button>}
              </div>
            )}
          </Popover>
          {r.stateSnapshot && (!r.metadata.model.checksum || modelChecksum.startsWith(r.metadata.model.checksum)) && <button className="btn small" title="Create a model state with exactly the configuration used for this result" onClick={() => lab.stateFromResult(r.id)}>Restore configuration</button>}
          <button className="icon-btn" title="Delete result" onClick={() => lab.deleteResult(r.id)}><Icon name="trash" size={14} /></button>
        </div>
      </div>
      {ok ? (
        <div className="rw-summary">
          <div><span>Status</span><StatusPill status={r.solverStatus} /></div>
          <div><span>Objective</span><b className="mono">{fnum(r.objectiveValue)}</b></div>
          {r.reactionFluxes && <div><span>Active reactions</span><b className="mono">{Object.values(r.reactionFluxes).filter((v) => !L.isZero(v)).length} / {Object.keys(r.reactionFluxes).length}</b></div>}
          {r.fva && <div><span>Reactions analysed</span><b className="mono">{Object.keys(r.fva).length}</b></div>}
          {uptakes != null && <div><span>Uptakes</span><b className="mono">{uptakes}</b></div>}
          {secretions != null && <div><span>Secretions</span><b className="mono">{secretions}</b></div>}
          {r.metadata.totalFlux != null && <div><span>Σ|flux| (pFBA)</span><b className="mono">{fnum(r.metadata.totalFlux)}</b></div>}
        </div>
      ) : <div className="pad"><ResultStatusCard r={r} /></div>}
      <div className="ex-tabs rw-tabs">
        {(['reactions', 'metabolites', 'exchanges', 'subsystems', 'genes', 'provenance'] as RTab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} disabled={(!ok && t !== 'provenance') || (t === 'subsystems' && !hasSubsystems)}
            title={t === 'subsystems' && !hasSubsystems ? 'This model has no subsystem annotations' : undefined}
            onClick={() => setTab(t)}>{t === 'provenance' ? 'How was this generated?' : t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      <div className="rw-body">
        {ok && tab === 'reactions' && (r.fva ? <FvaTable r={r} /> : <ResultReactions r={r} />)}
        {ok && tab === 'metabolites' && (r.metaboliteTurnover ? <ResultMetabolites r={r} /> : <div className="note">Metabolite turnover is derived from one flux distribution. FVA defines independent intervals per reaction, so no turnover is computed.</div>)}
        {ok && tab === 'exchanges' && <ExchangeTable r={r} />}
        {ok && tab === 'subsystems' && <SubsystemResults r={r} />}
        {ok && tab === 'genes' && <ResultGenes r={r} />}
        {tab === 'provenance' && <Provenance r={r} />}
      </div>
    </div>
  );
}

function useLocalTable(defaultSort: SortSpec | null) {
  const [q, setQ] = useState('');
  const [hideZero, setHideZero] = useState(true);
  const [sort, setSort] = useState<SortSpec | null>(defaultSort);
  const onSort = (k: string) => setSort((cur) => (cur?.key === k ? (cur.dir === 'desc' ? { key: k, dir: 'asc' } : null) : { key: k, dir: 'desc' }));
  return { q, setQ, hideZero, setHideZero, sort, setSort, onSort, dq: useDebounced(q, 110) };
}

function LocalBar({ t, placeholder, zeroLabel, count, total, children }: { t: ReturnType<typeof useLocalTable>; placeholder: string; zeroLabel: string; count: number; total: number; children?: React.ReactNode }) {
  return (
    <div className="ex-toolbar">
      <div className="search-box ex-search"><Icon name="search" size={14} /><input placeholder={placeholder} value={t.q} onChange={(e) => t.setQ(e.target.value)} /></div>
      <Toggle checked={t.hideZero} onChange={t.setHideZero}>{zeroLabel}</Toggle>
      {children}
      <span className="grow" /><span className="muted small">{count.toLocaleString()} of {total.toLocaleString()}</span>
    </div>
  );
}

function ResultReactions({ r }: { r: SimulationResult }) {
  const model = useLab((s) => s.model)!;
  const search = useLab((s) => s.searchIndex)!;
  const t = useLocalTable({ key: 'absFlux', dir: 'desc' });
  const ctx = useRxnCtx(r, null, r);
  const rows = useMemo(() => {
    const ranked = search.matchIds(t.dq, 'reaction');
    const base = model.reactions.filter((x) => (!ranked || ranked.has(x.id)) && (!t.hideZero || !L.isZero(r.reactionFluxes?.[x.id])));
    return sortRows(base, t.sort, (k, x) => rxnSortValue(k, x, ctx));
  }, [model, search, t.dq, t.hideZero, t.sort, ctx, r]);
  return (
    <div className="rw-table">
      <LocalBar t={t} placeholder="Search reactions…" zeroLabel="Hide zero flux" count={rows.length} total={model.reactions.length}>
        <button className={`btn small ${t.sort?.key === 'absFlux' ? 'on' : ''}`} onClick={() => t.setSort({ key: 'absFlux', dir: 'desc' })}>Sort by |flux|</button>
      </LocalBar>
      <div className="ex-table"><ReactionTable rows={rows} ctx={ctx} columns={['id', 'name', 'flux', 'lb', 'ub', 'equation', 'subsystem']} sort={t.sort} onSort={t.onSort} editable={false} /></div>
      <div className="muted small pad-x">Bounds shown are those of the state used for this result. Fluxes in {FLUX_UNIT}.</div>
    </div>
  );
}

function FvaTable({ r }: { r: SimulationResult }) {
  const index = useLab((s) => s.index)!;
  const t = useLocalTable({ key: 'width', dir: 'desc' });
  const search = useLab((s) => s.searchIndex)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const all = useMemo(() => Object.entries(r.fva ?? {}).map(([id, iv]) => ({ id, min: iv.minimum, max: iv.maximum, width: fvaWidth(iv.minimum, iv.maximum, tol) })), [r, tol]);
  const dom = useMemo(() => [Math.min(0, ...all.map((x) => x.min ?? 0)), Math.max(0, ...all.map((x) => x.max ?? 0))] as const, [all]);
  const rows = useMemo(() => {
    const ranked = search.matchIds(t.dq, 'reaction');
    const base = all.filter((x) => (!ranked || ranked.has(x.id)) && (!t.hideZero || !(L.isZero(x.min) && L.isZero(x.max))));
    return sortRows(base, t.sort, (k, x) => (k === 'id' ? x.id.toLowerCase() : k === 'min' ? x.min : k === 'max' ? x.max : k === 'width' ? x.width : k === 'name' ? (index.rxn.get(x.id)?.name ?? '').toLowerCase() : null));
  }, [all, search, t.dq, t.hideZero, t.sort, index]);
  type Row = (typeof all)[number];
  const cols: Col<Row>[] = [
    { key: 'id', label: 'Reaction', width: 'minmax(110px, 1fr)', render: (x) => <span className="mono strong">{x.id}</span> },
    { key: 'name', label: 'Name', width: 'minmax(140px, 1.6fr)', render: (x) => <span className="ellipsis">{index.rxn.get(x.id)?.name}</span> },
    { key: 'min', label: 'Minimum', width: 90, align: 'right', render: (x) => <span className="mono">{fnum(x.min)}</span> },
    { key: 'max', label: 'Maximum', width: 90, align: 'right', render: (x) => <span className="mono">{fnum(x.max)}</span> },
    { key: 'width', label: 'Range', width: 90, align: 'right', title: 'Width of the feasible interval (max − min)', render: (x) => <span className="mono">{fnum(x.width)}</span> },
    { key: 'bar', label: 'Feasible interval', width: 'minmax(160px, 2fr)', sortable: false, render: (x) => <RangeBar min={x.min} max={x.max} lo={dom[0]} hi={dom[1]} /> },
  ];
  return (
    <div className="rw-table">
      <LocalBar t={t} placeholder="Search reactions…" zeroLabel="Hide blocked (min = max = 0)" count={rows.length} total={all.length} />
      <div className="note small">FVA gives an independent feasible interval for each reaction. The intervals are not a joint flux distribution, and no midpoint is used as a flux. For one representative distribution, run FBA or pFBA.</div>
      <div className="ex-table">
        <VirtualTable rows={rows} cols={cols} rowKey={(x) => x.id} sort={t.sort} onSort={t.onSort} onRowClick={(x) => lab.navigate({ kind: 'reaction', id: x.id })}
          onContextMenu={(x, e) => useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs: [{ kind: 'reaction', id: x.id }] } })} />
      </div>
    </div>
  );
}

function ResultMetabolites({ r }: { r: SimulationResult }) {
  const model = useLab((s) => s.model)!;
  const search = useLab((s) => s.searchIndex)!;
  const t = useLocalTable({ key: 'turnover', dir: 'desc' });
  const rows = useMemo(() => {
    const ranked = search.matchIds(t.dq, 'metabolite');
    const base = model.metabolites.filter((m) => (!ranked || ranked.has(m.id)) && (!t.hideZero || !L.isZero(r.metaboliteTurnover?.[m.id])));
    return sortRows(base, t.sort, (k, m) => metSortValue(k, m, r.metaboliteTurnover));
  }, [model, search, t.dq, t.hideZero, t.sort, r]);
  return (
    <div className="rw-table">
      <LocalBar t={t} placeholder="Search metabolites…" zeroLabel="Hide zero turnover" count={rows.length} total={model.metabolites.length} />
      <div className="ex-table"><MetaboliteTable rows={rows} turnover={r.metaboliteTurnover} sort={t.sort} onSort={t.onSort} /></div>
    </div>
  );
}

function ResultGenes({ r }: { r: SimulationResult }) {
  const model = useLab((s) => s.model)!;
  const tol = useLab((s) => s.settings.zeroTolerance);
  const t = useLocalTable({ key: 'active', dir: 'desc' });
  const search = useLab((s) => s.searchIndex)!;
  const active = useMemo(() => (g: LabGene) => (r.reactionFluxes ? g.reactions.filter((x) => Math.abs(r.reactionFluxes![x] ?? 0) >= tol).length : null), [r, tol]);
  const rows = useMemo(() => {
    const ranked = search.matchIds(t.dq, 'gene');
    const base = model.genes.filter((g) => (!ranked || ranked.has(g.id)) && (!t.hideZero || !r.reactionFluxes || (active(g) ?? 0) > 0));
    return sortRows(base, t.sort, (k, g) => geneSortValue(k, g, active));
  }, [model, search, t.dq, t.hideZero, t.sort, active, r]);
  return (
    <div className="rw-table">
      <LocalBar t={t} placeholder="Search genes…" zeroLabel="Only genes with active reactions" count={rows.length} total={model.genes.length} />
      <div className="ex-table"><GeneTable rows={rows} active={active} sort={t.sort} onSort={t.onSort} /></div>
    </div>
  );
}

function ExchangeTable({ r }: { r: SimulationResult }) {
  const index = useLab((s) => s.index)!;
  const [hide, setHide] = useState(true);
  const [sort, setSort] = useState<SortSpec | null>({ key: r.fva ? 'uptakeMax' : 'uptake', dir: 'desc' });
  const isFva = !!r.fva;
  type Row = { id: string; name: string; met: string | null } & Partial<ExchangeFlux & ExchangeInterval>;
  const all: Row[] = useMemo(() => Object.entries(r.exchanges ?? {}).map(([id, x]) => ({ id, met: x.metabolite, name: (x.metabolite && index.met.get(x.metabolite)?.name) || x.metabolite || id, ...x })), [r, index]);
  const rows = useMemo(() => {
    const base = hide ? all.filter((x) => (isFva ? !(L.isZero(x.uptakeMax) && L.isZero(x.secretionMax)) : !L.isZero(x.flux))) : all;
    return sortRows(base, sort, (k, x) => (k === 'name' ? x.name.toLowerCase() : k === 'id' ? x.id.toLowerCase() : ((x as Record<string, unknown>)[k] as number | undefined) ?? null));
  }, [all, hide, sort, isFva]);
  const onSort = (k: string) => setSort((c) => (c?.key === k ? (c.dir === 'desc' ? { key: k, dir: 'asc' } : null) : { key: k, dir: 'desc' }));
  const num = (v: number | undefined) => (v == null || L.isZero(v) ? <span className="muted">—</span> : <span className="mono">{fnum(v)}</span>);
  const cols: Col<Row>[] = [
    { key: 'name', label: 'Compound', width: 'minmax(150px, 2fr)', render: (x) => x.met ? <ELink r={{ kind: 'metabolite', id: x.met }}>{x.name}</ELink> : x.name },
    { key: 'id', label: 'Exchange', width: 'minmax(120px, 1.3fr)', render: (x) => <span className="mono">{x.id}{x.kind !== 'exchange' && <span className="tag">{x.kind}</span>}</span> },
    ...(isFva ? [
      { key: 'fluxMin', label: 'Flux min', width: 90, align: 'right' as const, render: (x: Row) => <span className="mono">{fnum(x.fluxMin)}</span> },
      { key: 'fluxMax', label: 'Flux max', width: 90, align: 'right' as const, render: (x: Row) => <span className="mono">{fnum(x.fluxMax)}</span> },
      { key: 'uptakeMax', label: 'Max uptake', width: 100, align: 'right' as const, render: (x: Row) => num(x.uptakeMax) },
      { key: 'secretionMax', label: 'Max secretion', width: 110, align: 'right' as const, render: (x: Row) => num(x.secretionMax) },
    ] : [
      { key: 'uptake', label: 'Uptake', width: 100, align: 'right' as const, render: (x: Row) => num(x.uptake) },
      { key: 'secretion', label: 'Secretion', width: 100, align: 'right' as const, render: (x: Row) => num(x.secretion) },
      { key: 'flux', label: 'Flux', width: 90, align: 'right' as const, render: (x: Row) => <span className="mono muted">{fnum(x.flux)}</span> },
    ]),
  ];
  return (
    <div className="rw-table">
      <div className="ex-toolbar">
        <Toggle checked={hide} onChange={setHide}>Hide inactive exchanges</Toggle>
        {!isFva && <><button className={`btn small ${sort?.key === 'uptake' ? 'on' : ''}`} onClick={() => setSort({ key: 'uptake', dir: 'desc' })}>Sort by uptake</button><button className={`btn small ${sort?.key === 'secretion' ? 'on' : ''}`} onClick={() => setSort({ key: 'secretion', dir: 'desc' })}>Sort by secretion</button></>}
        <span className="grow" /><span className="muted small">{rows.length} of {all.length} · {FLUX_UNIT}</span>
      </div>
      <div className="ex-table"><VirtualTable rows={rows} cols={cols} rowKey={(x) => x.id} sort={sort} onSort={onSort} onRowClick={(x) => lab.navigate({ kind: 'reaction', id: x.id })} /></div>
    </div>
  );
}

function OriginTags({ r }: { r: SimulationResult }) {
  const checksum = useLab((s) => s.model?.checksum ?? '');
  const p = r.metadata.partial;
  if (p) return <span className="tag warn" title="FVA stopped early: intervals exist only for these reactions">{p.done}/{p.total}</span>;
  if (!r.origin) return null;
  const cs = r.metadata.model.checksum;
  const other = !!cs && !checksum.startsWith(cs);
  const pct = r.origin.total ? Math.round(((r.origin.matched ?? 0) / r.origin.total) * 100) : null;
  return (
    <>
      <span className="tag" title={`Imported from ${r.origin.file}`}>imported</span>
      {other && <span className="tag warn" title={`Computed with ${r.metadata.model.filename || 'another model'} — compared by reaction id`}>other model</span>}
      {pct != null && pct < 100 && <span className="tag warn" title="Reaction ids of the result found in the loaded model">{pct}% ids</span>}
    </>
  );
}

function Provenance({ r }: { r: SimulationResult }) {
  const md = r.metadata;
  const index = useLab((s) => s.index)!;
  // null = unbounded uptake (JSON has no Infinity): it allows uptake too
  const medium = Object.entries(md.medium).filter(([, v]) => v == null || v > 0);
  const row = (k: string, v: React.ReactNode) => <div className="kv"><span>{k}</span><span>{v}</span></div>;
  return (
    <div className="provenance">
      <div className="prov-title">How was this generated?</div>
      {r.origin && <ImportedNote r={r} />}
      {row('Model', <span><b>{md.model.name || md.model.modelId}</b> <span className="mono small muted">{md.model.filename}</span></span>)}
      {row('Model checksum', <span className="mono small">sha256 {md.model.checksum.slice(0, 16)}…</span>)}
      {row('State', md.state.name)}
      {row('Method', `${md.methodLabel}${Object.keys(md.parameters).length ? ' · ' + Object.entries(md.parameters).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(', ') : ''}`)}
      {row('Objective', <span className="mono">{objectiveText(md.objective)}{md.objectiveIsModelDefault ? <span className="muted"> (model file)</span> : null}</span>)}
      {row('Medium', `${medium.length} exchange reactions allow uptake`)}
      <details className="prov-list"><summary className="muted small">Show medium</summary>
        {medium.map(([id, v]) => <div key={id} className="kv small"><ELink r={{ kind: 'reaction', id }}>{id}</ELink><span className="mono">{fnum(v ?? Infinity)} · {index.met.get(index.rxn.get(id)?.boundaryMetabolite ?? '')?.name ?? ''}</span></div>)}
      </details>
      {row('Modified bounds', md.boundChanges.length ? `${md.boundChanges.length} reaction${md.boundChanges.length > 1 ? 's' : ''}` : 'none (model file bounds)')}
      {md.boundChanges.length > 0 && (
        <div className="prov-list">
          {md.boundChanges.map((c) => <div key={c.reaction} className="kv small"><ELink r={{ kind: 'reaction', id: c.reaction }}>{c.reaction}</ELink><span className="mono">{fbounds(c.original)} → {fbounds(c.current)}</span></div>)}
        </div>
      )}
      {row('Solver', `${md.solver} · status ${md.solverStatusRaw}`)}
      {row('Status', <StatusPill status={r.solverStatus} />)}
      {row('Objective value', <span className="mono">{fnum(r.objectiveValue)}</span>)}
      {md.totalFlux != null && row('pFBA total flux (minimized)', <span className="mono">{fnum(md.totalFlux)}</span>)}
      {row('Timestamp', new Date(md.timestamp).toLocaleString())}
      {row('Computation time', `${md.elapsedSeconds.toFixed(3)} s`)}
      {row('Software', `COBRApy ${md.cobraVersion}`)}
      {md.message && row('Solver message', <span className="mono small">{md.message}</span>)}
    </div>
  );
}

function ImportedNote({ r }: { r: SimulationResult }) {
  const model = useLab((s) => s.model)!;
  const o = r.origin!;
  const cs = r.metadata.model.checksum;
  const same = !!cs && model.checksum.startsWith(cs);
  return (
    <div className="note small">
      <div><b>Imported</b> from <span className="mono">{o.file}</span> ({o.format}) on {new Date(o.importedAt).toLocaleString()}. Values are as stored in the file.</div>
      <div>{same ? 'Computed with the loaded model (same file checksum).' : cs ? <>Computed with <b>{r.metadata.model.filename || 'another model'}</b>, not the loaded model — comparisons match reactions by id.</> : 'The source model is not recorded in the file.'}</div>
      {o.total != null && <div>{o.matched} of {o.total} reaction ids exist in the loaded model ({model.filename}){o.matched !== o.total ? '; the others are kept for comparison but cannot be shown in model tables.' : '.'}</div>}
      {o.derivedWith && <div>Metabolite turnover and exchanges were not in the file; COBRApy derived them from these fluxes with {o.derivedWith}.</div>}
      {o.notes?.map((n, i) => <div key={i}>{n}</div>)}
    </div>
  );
}
