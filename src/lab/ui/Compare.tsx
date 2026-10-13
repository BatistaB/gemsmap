import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../ui/icons';
import { api } from '../api';
import { fbounds, fnum, objectiveText } from '../format';
import { normalize } from '../search';
import { L, lab, useLab, type CompareMetric } from '../store';
import type { CompareCategory, CompareRow, ExchangeCompareRow, FvaCompareRow, MediumTable, SortSpec } from '../types';
import { ELink, ErrorCard, InfoTip, RangeBar, SectionHead, Seg, useDebounced } from './common';
import { SubsystemCompareView } from './Subsystems';
import { sortRows } from './tables';
import { VirtualTable, type Col } from './VirtualTable';
import { ResizeHandle, usePanelWidth } from '../../ui/Resizer';

const CAT_LABEL: Record<string, string> = {
  changed: 'Changed', unchanged: 'Unchanged', activated: 'Activated from zero', inactivated: 'Inactivated to zero',
  reversal: 'Direction reversal', 'both-zero': 'Zero in both', missing: 'Only in one result',
  narrowed: 'Narrowed', widened: 'Widened', shifted: 'Shifted', disjoint: 'Disjoint',
};
const METRIC_LABEL: Record<CompareMetric, string> = { delta: 'Flux difference (Δ = B − A)', absDelta: 'Absolute difference |Δ|', log2fc: 'log₂ fold change |B|/|A|', foldchange: 'Fold change |B|/|A|' };
type Filter = 'differing' | 'all' | 'changed' | 'activated' | 'inactivated' | 'reversal' | 'missing';

export function Compare() {
  const results = useLab((s) => s.results.filter((r) => r.solverStatus === 'optimal'));
  const cmp = useLab((s) => s.compare);
  const settings = useLab((s) => s.settings);
  const [mode, setMode] = useState<'results' | 'states'>('results');
  const a = L.result(cmp.aId), b = L.result(cmp.bId);
  const setC = (p: Partial<typeof cmp>) => useLab.setState((s) => ({ compare: { ...s.compare, ...p } }));
  useEffect(() => { if (cmp.result && (cmp.result.a.id !== cmp.aId || cmp.result.b.id !== cmp.bId)) setC({ result: null }); }, [cmp.aId, cmp.bId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lab-page compare">
      <SectionHead title="Compare" sub="Direct comparison of in-app results — B is compared against the reference A. No export needed.">
        <Seg value={mode} options={['results', 'states'] as const} onChange={setMode} labels={{ results: 'Simulation results', states: 'Model states (configuration)' }} />
      </SectionHead>
      {mode === 'states' ? <StateDiff /> : (
        <>
          <div className="cmp-pick">
            <label><span className="cmp-ab">A</span><span className="muted small">reference</span>
              <select className="input" value={cmp.aId ?? ''} onChange={(e) => setC({ aId: e.target.value || null })}>
                <option value="">Choose a result…</option>
                {results.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></label>
            <button className="icon-btn" title="Swap A and B" onClick={() => setC({ aId: cmp.bId, bId: cmp.aId, result: null })}><Icon name="swap" size={15} /></button>
            <label><span className="cmp-ab b">B</span><span className="muted small">compared</span>
              <select className="input" value={cmp.bId ?? ''} onChange={(e) => setC({ bId: e.target.value || null })}>
                <option value="">Choose a result…</option>
                {results.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></label>
            <label><span className="muted small">Metric</span>
              <select className="input" value={cmp.metric} onChange={(e) => setC({ metric: e.target.value as CompareMetric })}>
                {(Object.keys(METRIC_LABEL) as CompareMetric[]).map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
              </select></label>
            <div className="cmp-opts">
              <label className="check small" title="Pseudocount p: log₂((|B|+p)/(|A|+p)) for rows activated from / inactivated to zero. Off = those rows get no fold change.">
                <input type="checkbox" checked={settings.pseudocount != null} onChange={(e) => lab.setSettings({ pseudocount: e.target.checked ? 1e-3 : null })} /> pseudocount
              </label>
              {settings.pseudocount != null && <input className="input tiny num" type="number" step="any" min={0} value={settings.pseudocount} onChange={(e) => lab.setSettings({ pseudocount: Math.max(1e-12, +e.target.value) })} />}
              <span className="muted small">zero if |v| &lt; {settings.zeroTolerance}</span>
            </div>
            <button className="btn primary" disabled={!a || !b || a.id === b.id || cmp.loading} onClick={() => lab.runCompare()}>{cmp.loading ? 'Comparing…' : 'Compare'}</button>
          </div>
          {results.length < 2 && <div className="note">Comparison needs two optimal results. Typical workflow: duplicate the state, change one condition (e.g. oxygen uptake), run the same method again.</div>}
          {cmp.error && <ErrorCard info={cmp.error} />}
          {cmp.result && <ComparisonView />}
        </>
      )}
    </div>
  );
}

function ConfigDiffView() {
  const c = useLab((s) => s.compare.result!.config);
  const [open, setOpen] = useState(true);
  const n = c.medium.length + c.bounds.length + (c.objective.changed ? 1 : 0);
  return (
    <div className="cfg-diff">
      <button className="cfg-head" onClick={() => setOpen(!open)}>
        <span className="insp-sub">Configuration differences (A → B)</span>
        <span className="muted small">{n ? `${n} difference${n > 1 ? 's' : ''}` : 'identical configuration'}{!c.sameModel && ' · different model files!'}{c.methods.a !== c.methods.b && ` · methods ${c.methods.a} vs ${c.methods.b}`}</span>
        <span className="grow" /><span>{open ? '▾' : '▸'}</span>
      </button>
      {open && n > 0 && (
        <div className="cfg-body">
          {c.objective.changed && <div className="kv"><span>Objective</span><span className="mono">{objectiveText(c.objective.a)} → {objectiveText(c.objective.b)}</span></div>}
          {c.medium.length > 0 && <div className="cfg-group"><div className="muted small">Medium (max uptake)</div>{c.medium.map((m) => <div key={m.reaction} className="kv small"><ELink r={{ kind: 'reaction', id: m.reaction }} /><span className="mono">{fnum(m.a ?? 0)} → {fnum(m.b ?? 0)}</span></div>)}</div>}
          {c.bounds.length > 0 && <div className="cfg-group"><div className="muted small">Bounds (vs model file)</div>{c.bounds.map((m) => <div key={m.reaction} className="kv small"><ELink r={{ kind: 'reaction', id: m.reaction }} /><span className="mono">{m.a ? fbounds(m.a) : 'file'} → {m.b ? fbounds(m.b) : 'file'}</span></div>)}</div>}
        </div>
      )}
    </div>
  );
}

function catFilter(f: Filter, cat: CompareCategory | string) {
  if (f === 'all') return true;
  if (f === 'differing') return cat !== 'both-zero' && cat !== 'unchanged' && cat !== 'missing';
  return cat === f;
}

function ComparisonView() {
  const res = useLab((s) => s.compare.result!);
  const metric = useLab((s) => s.compare.metric);
  const explain = useLab((s) => s.explain);
  const [tab, setTab] = useState<'reactions' | 'metabolites' | 'exchanges' | 'subsystems'>('reactions');
  const hasSubsystems = useLab((s) => (s.index?.subsystems.size ?? 0) > 0);
  const isFva = res.kind === 'fva';
  return (
    <div className="cmp-view">
      <ConfigDiffView />
      <div className="cmp-summary">
        {res.objective && <span>Objective <b className="mono">{fnum(res.objective.a)} → {fnum(res.objective.b)}</b></span>}
        {Object.entries(res.counts).filter(([k]) => k !== 'both-zero').map(([k, v]) => <span key={k} className={`cat-pill c-${k}`}>{CAT_LABEL[k] ?? k} · {v}</span>)}
        <span className="grow" />
        {!isFva && <button className="btn small primary" onClick={() => useLab.setState({ dialog: { kind: 'visualize-comparison' } })}>Visualize comparison</button>}
      </div>
      <div className="ex-tabs">
        <button className={tab === 'reactions' ? 'on' : ''} onClick={() => setTab('reactions')}>Reactions</button>
        {!isFva && <button className={tab === 'metabolites' ? 'on' : ''} onClick={() => setTab('metabolites')}>Metabolite turnover</button>}
        {!isFva && <button className={tab === 'exchanges' ? 'on' : ''} onClick={() => setTab('exchanges')}>Exchanges</button>}
        {!isFva && <button className={tab === 'subsystems' ? 'on' : ''} disabled={!hasSubsystems} title={hasSubsystems ? 'Compare metabolism at the subsystem level' : 'This model has no subsystem annotations'} onClick={() => setTab('subsystems')}>Subsystems</button>}
      </div>
      {tab === 'subsystems' && !isFva ? <div className="cmp-body"><SubsystemCompareView /></div> : (
        <div className="cmp-body">
          <div className="cmp-table">
            {isFva ? <FvaCompareTable /> : <CompareTable key={tab} kind={tab as 'reactions' | 'metabolites' | 'exchanges'} metric={metric} />}
          </div>
          {explain && tab === 'metabolites' && <ExplainPanel />}
        </div>
      )}
    </div>
  );
}

function CompareTable({ kind, metric }: { kind: 'reactions' | 'metabolites' | 'exchanges'; metric: CompareMetric }) {
  const res = useLab((s) => s.compare.result!);
  const index = useLab((s) => s.index)!;
  const explain = useLab((s) => s.explain);
  const [filter, setFilter] = useState<Filter>('differing');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 100);
  const [sort, setSort] = useState<SortSpec | null>(null);
  useEffect(() => setSort({ key: metric === 'delta' || metric === 'absDelta' ? 'absDelta' : 'absLog2fc', dir: 'desc' }), [metric, kind]);
  const rows = (kind === 'reactions' ? res.reactions : kind === 'metabolites' ? res.metabolites : res.exchanges) as (CompareRow | ExchangeCompareRow)[] ?? [];
  const name = (id: string) => (kind === 'metabolites' ? index.met.get(id)?.name : index.rxn.get(id)?.name) ?? '';
  const shown = useMemo(() => {
    const n = normalize(dq.trim());
    const base = rows.filter((r) => catFilter(filter, r.category) && (!n || normalize(`${r.id} ${name(r.id)} ${(r as ExchangeCompareRow).metabolite ?? ''}`).includes(n)));
    return sortRows(base, sort, (k, r) => {
      switch (k) {
        case 'id': return r.id.toLowerCase();
        case 'name': return name(r.id).toLowerCase();
        case 'a': return r.a; case 'b': return r.b;
        case 'delta': return r.delta; case 'absDelta': return r.absDelta;
        case 'log2fc': return r.log2fc; case 'absLog2fc': return r.log2fc == null ? null : Math.abs(r.log2fc);
        case 'foldChange': return r.foldChange;
        case 'category': return r.category;
        case 'uptakeA': case 'uptakeB': case 'secretionA': case 'secretionB': case 'deltaUptake': case 'deltaSecretion':
          return ((r as ExchangeCompareRow)[k as keyof ExchangeCompareRow] as number | null) ?? null;
        default: return null;
      }
    });
  }, [rows, filter, dq, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSort = (k: string) => setSort((c) => (c?.key === k ? (c.dir === 'desc' ? { key: k, dir: 'asc' } : null) : { key: k, dir: 'desc' }));
  const cat = (r: CompareRow) => {
    if (r.category === 'reversal') return <span className="cat c-reversal" title="The reaction runs in opposite directions in A and B — not summarized by a fold change">⇄ reversal{(r as ExchangeCompareRow).switch ? ` (${(r as ExchangeCompareRow).switch})` : ''}</span>;
    if (r.category === 'activated') return <span className="cat c-activated">activated from zero</span>;
    if (r.category === 'inactivated') return <span className="cat c-inactivated">inactivated to zero</span>;
    return <span className={`cat c-${r.category}`}>{CAT_LABEL[r.category]?.toLowerCase()}</span>;
  };
  const fc = (r: CompareRow) => {
    const v = metric === 'foldchange' ? r.foldChange : r.log2fc;
    if (v == null) return <span className="muted" title={r.category === 'reversal' ? 'Undefined for a direction reversal' : r.category === 'activated' || r.category === 'inactivated' ? 'Undefined without a pseudocount (zero in one condition)' : ''}>—</span>;
    return <span className={`mono ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{v > 0 && metric !== 'foldchange' ? '+' : ''}{fnum(v, 3)}{r.pseudocount && <sup title="computed with pseudocount">p</sup>}</span>;
  };
  const delta = (v: number | null) => (v == null ? '—' : <span className={`mono ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{v > 0 ? '+' : ''}{fnum(v)}</span>);
  const label = kind === 'metabolites' ? 'Turnover' : 'Flux';
  const cols: Col<CompareRow>[] = kind === 'exchanges' ? [
    { key: 'id', label: 'Exchange', width: 'minmax(110px, 1fr)', render: (r) => <span className="mono strong">{r.id}</span> },
    { key: 'name', label: 'Compound', width: 'minmax(130px, 1.4fr)', render: (r) => <span className="ellipsis">{index.met.get((r as ExchangeCompareRow).metabolite ?? '')?.name ?? ''}</span> },
    { key: 'uptakeA', label: 'Uptake A', width: 80, align: 'right', render: (r) => <span className="mono">{fnum((r as ExchangeCompareRow).uptakeA)}</span> },
    { key: 'uptakeB', label: 'Uptake B', width: 80, align: 'right', render: (r) => <span className="mono">{fnum((r as ExchangeCompareRow).uptakeB)}</span> },
    { key: 'deltaUptake', label: 'Δ uptake', width: 84, align: 'right', render: (r) => delta((r as ExchangeCompareRow).deltaUptake) },
    { key: 'secretionA', label: 'Secr. A', width: 80, align: 'right', render: (r) => <span className="mono">{fnum((r as ExchangeCompareRow).secretionA)}</span> },
    { key: 'secretionB', label: 'Secr. B', width: 80, align: 'right', render: (r) => <span className="mono">{fnum((r as ExchangeCompareRow).secretionB)}</span> },
    { key: 'deltaSecretion', label: 'Δ secr.', width: 84, align: 'right', render: (r) => delta((r as ExchangeCompareRow).deltaSecretion) },
    { key: 'category', label: 'Change', width: 'minmax(130px, 1fr)', render: cat },
  ] : [
    { key: 'id', label: kind === 'metabolites' ? 'Metabolite' : 'Reaction', width: 'minmax(110px, 1fr)', render: (r) => <span className="mono strong">{r.id}</span> },
    { key: 'name', label: 'Name', width: 'minmax(140px, 1.6fr)', render: (r) => <span className="ellipsis">{name(r.id)}</span> },
    { key: 'a', label: `${label} A`, width: 90, align: 'right', render: (r) => <span className="mono">{fnum(r.a)}</span> },
    { key: 'b', label: `${label} B`, width: 90, align: 'right', render: (r) => <span className="mono">{fnum(r.b)}</span> },
    { key: 'delta', label: 'Δ', width: 90, align: 'right', render: (r) => delta(r.delta) },
    { key: metric === 'foldchange' ? 'foldChange' : 'log2fc', label: metric === 'foldchange' ? 'FC |v|' : 'log₂FC |v|', width: 92, align: 'right', title: 'Magnitude ratio |B|/|A|; direction changes are classified separately', render: fc },
    { key: 'category', label: 'Change', width: 'minmax(130px, 1fr)', render: cat },
  ];
  return (
    <div className="rw-table">
      <div className="ex-toolbar">
        <div className="search-box ex-search"><Icon name="search" size={14} /><input placeholder={`Search ${kind}…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input tiny" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="differing">Differing only</option><option value="all">All rows</option><option value="changed">Changed (same direction)</option>
          <option value="activated">Activated from zero</option><option value="inactivated">Inactivated to zero</option>{kind !== 'metabolites' && <option value="reversal">Direction reversals only</option>}<option value="missing">Only in one result (other model)</option>
        </select>
        <select className="input tiny" value={sort ? `${sort.key}:${sort.dir}` : ''} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSort(k ? { key: k, dir: d as 'asc' | 'desc' } : null); }}>
          <option value="absDelta:desc">|Δ| ↓</option><option value="delta:desc">Δ ↓</option><option value="delta:asc">Δ ↑</option>
          <option value="absLog2fc:desc">|log₂FC| ↓</option><option value="log2fc:desc">log₂FC ↓</option><option value="log2fc:asc">log₂FC ↑</option>
          {kind === 'exchanges' && <><option value="deltaUptake:desc">Δ uptake ↓</option><option value="deltaSecretion:desc">Δ secretion ↓</option></>}
        </select>
        {kind === 'metabolites' && <span className="muted small">Click a metabolite: which reactions changed its turnover?</span>}
        <span className="grow" /><span className="muted small">{shown.length} of {rows.length}</span>
      </div>
      <div className="ex-table">
        <VirtualTable rows={shown} cols={cols} rowKey={(r) => r.id} sort={sort} onSort={onSort}
          active={kind === 'metabolites' ? explain?.metabolite ?? null : null}
          rowClass={(r) => (r.category === 'reversal' ? 'row-reversal' : '')}
          onRowClick={(r) => {
            if (kind === 'metabolites') { lab.explainTurnover(r.id); lab.navigate({ kind: 'metabolite', id: r.id }); }
            else lab.navigate({ kind: 'reaction', id: r.id });
          }}
          onContextMenu={(r, e) => useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs: [{ kind: kind === 'metabolites' ? 'metabolite' : 'reaction', id: r.id }] } })} />
      </div>
    </div>
  );
}

function FvaCompareTable() {
  const res = useLab((s) => s.compare.result!);
  const index = useLab((s) => s.index)!;
  const [sort, setSort] = useState<SortSpec | null>({ key: 'absDeltaWidth', dir: 'desc' });
  const [hideSame, setHideSame] = useState(true);
  const rows = res.reactions as FvaCompareRow[];
  const dom = useMemo(() => [Math.min(0, ...rows.map((r) => Math.min(r.aMin ?? 0, r.bMin ?? 0))), Math.max(0, ...rows.map((r) => Math.max(r.aMax ?? 0, r.bMax ?? 0)))] as const, [rows]);
  const shown = useMemo(() => sortRows(rows.filter((r) => !hideSame || (r.category !== 'unchanged' && r.category !== 'missing')), sort, (k, r) => (k === 'id' ? r.id : ((r as unknown as Record<string, number | null>)[k] ?? null))), [rows, sort, hideSame]);
  const cols: Col<FvaCompareRow>[] = [
    { key: 'id', label: 'Reaction', width: 'minmax(110px, 1fr)', render: (r) => <span className="mono strong" title={index.rxn.get(r.id)?.name}>{r.id}</span> },
    { key: 'ia', label: 'A interval', width: 150, sortable: false, render: (r) => <span className="mono small">[{fnum(r.aMin)}, {fnum(r.aMax)}]</span> },
    { key: 'ib', label: 'B interval', width: 150, sortable: false, render: (r) => <span className="mono small">[{fnum(r.bMin)}, {fnum(r.bMax)}]</span> },
    { key: 'bars', label: 'A / B', width: 'minmax(140px, 1.5fr)', sortable: false, render: (r) => <span className="dual-range"><RangeBar min={r.aMin ?? null} max={r.aMax ?? null} lo={dom[0]} hi={dom[1]} /><RangeBar min={r.bMin ?? null} max={r.bMax ?? null} lo={dom[0]} hi={dom[1]} /></span> },
    { key: 'deltaWidth', label: 'Δ width', width: 90, align: 'right', render: (r) => <span className="mono">{fnum(r.deltaWidth)}</span> },
    { key: 'category', label: 'Change', width: 110, render: (r) => <span className={`cat c-${r.category}`}>{CAT_LABEL[r.category] ?? r.category}</span> },
  ];
  return (
    <div className="rw-table">
      <div className="ex-toolbar"><label className="check small"><input type="checkbox" checked={hideSame} onChange={(e) => setHideSame(e.target.checked)} /> Hide unchanged</label><span className="grow" /><span className="muted small">{shown.length} of {rows.length} · intervals compared reaction by reaction</span></div>
      <div className="ex-table"><VirtualTable rows={shown} cols={cols} rowKey={(r) => r.id} sort={sort} onSort={(k) => setSort((c) => (c?.key === k && c.dir === 'desc' ? { key: k, dir: 'asc' } : { key: k, dir: 'desc' }))} onRowClick={(r) => lab.navigate({ kind: 'reaction', id: r.id })} /></div>
    </div>
  );
}

function ExplainPanel() {
  const pw = usePanelWidth('lab-explain', 330, 240, 640);
  const ex = useLab((s) => s.explain)!;
  const d = ex.data;
  const max = d ? Math.max(1e-12, ...d.rows.map((r) => Math.abs(r.delta ?? 0))) : 1;
  return (
    <div className="explain" style={{ width: pw.width }}>
      <ResizeHandle panel={pw} edge="left" />
      <div className="pane-scroll explain-scroll">
      <div className="row between"><div className="insp-sub">Why did {d?.name ?? ex.metabolite} turnover {d && (d.delta ?? 0) < 0 ? 'decrease' : 'change'}?</div><button className="icon-btn tiny" onClick={() => useLab.setState({ explain: null })}><Icon name="x" size={11} /></button></div>
      {!d ? <div className="muted small">Computing…</div> : (
        <>
          <div className="mono small">{fnum(d.turnoverA)} → {fnum(d.turnoverB)} (Δ {fnum(d.delta)})</div>
          <div className="note small">Flux contributions to turnover change: 0.5·|S·v| per reaction in A and B. Descriptive, not a causal inference. <InfoTip text={d.note} /></div>
          <div className="explain-rows">
            {d.rows.filter((r) => Math.abs(r.delta ?? 0) > 1e-12 || r.category === 'reversal').map((r) => (
              <div key={r.reaction} className="explain-row" onClick={() => lab.navigate({ kind: 'reaction', id: r.reaction })}>
                <div className="row between"><ELink r={{ kind: 'reaction', id: r.reaction }} /><span className={`mono ${(r.delta ?? 0) > 0 ? 'up' : 'down'}`}>{(r.delta ?? 0) > 0 ? '+' : ''}{fnum(r.delta)}</span></div>
                <div className="contrib-bar"><span className={(r.delta ?? 0) > 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(r.delta ?? 0) / max) * 100}%` }} /></div>
                <div className="muted small">{r.roleA} → {r.roleB}{r.category === 'reversal' ? ' · direction reversed' : ''} · {r.name}</div>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

/** Configuration diff between two model states, before any simulation. */
function StateDiff() {
  const states = useLab((s) => s.states);
  const model = useLab((s) => s.model)!;
  const index = useLab((s) => s.index)!;
  const [aId, setA] = useState(states[0]?.id);
  const [bId, setB] = useState(states[states.length - 1]?.id);
  const [med, setMed] = useState<[MediumTable, MediumTable] | null>(null);
  const a = states.find((s) => s.id === aId), b = states.find((s) => s.id === bId);
  useEffect(() => {
    if (!a || !b) return;
    let alive = true;
    Promise.all([api.medium(model.id, L.stateSpec(a)), api.medium(model.id, L.stateSpec(b))]).then((r) => alive && setMed(r), () => alive && setMed(null));
    return () => { alive = false; };
  }, [a, b, model.id]);
  if (!a || !b) return null;
  const objA = L.objective(a), objB = L.objective(b);
  const ids = Array.from(new Set([...Object.keys(a.bounds), ...Object.keys(b.bounds)])).filter((id) => JSON.stringify(L.bounds(a, index.rxn.get(id)!)) !== JSON.stringify(L.bounds(b, index.rxn.get(id)!)));
  const exch = new Set(model.reactions.filter((r) => r.type === 'exchange').map((r) => r.id));
  const mediumDiffs = med ? med[0].rows.map((ra) => [ra, med[1].rows.find((x) => x.reaction === ra.reaction)!] as const).filter(([x, y]) => y && (x.uptakeMax !== y.uptakeMax || x.uptakeUnbounded !== y.uptakeUnbounded) && x.kind === 'exchange') : [];
  const boundsOnly = ids.filter((id) => !exch.has(id));
  return (
    <div className="state-diff">
      <div className="cmp-pick">
        <label><span className="cmp-ab">A</span><select className="input" value={aId} onChange={(e) => setA(e.target.value)}>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <Icon name="chevR" size={14} />
        <label><span className="cmp-ab b">B</span><select className="input" value={bId} onChange={(e) => setB(e.target.value)}>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <span className="muted small">Model/configuration differences — before any simulation.</span>
      </div>
      <div className="cfg-body">
        <div className="kv"><span>Objective</span><span className="mono">{JSON.stringify(objA) === JSON.stringify(objB) ? 'unchanged' : `${objectiveText(objA)} → ${objectiveText(objB)}`}</span></div>
        <div className="cfg-group"><div className="insp-sub">Medium differences · {mediumDiffs.length}</div>
          {!med && <div className="muted small">Reading media…</div>}
          {med && !mediumDiffs.length && <div className="muted small">Same medium.</div>}
          {mediumDiffs.map(([x, y]) => <div key={x.reaction} className="kv small"><span><ELink r={{ kind: 'reaction', id: x.reaction }} /> <span className="muted">{x.metaboliteName}</span></span><span className="mono">{x.uptakeUnbounded ? '∞' : fnum(x.uptakeMax)} → {y.uptakeUnbounded ? '∞' : fnum(y.uptakeMax)}</span></div>)}
        </div>
        <div className="cfg-group"><div className="insp-sub">Bounds · {boundsOnly.length} reaction{boundsOnly.length === 1 ? '' : 's'} changed</div>
          {!boundsOnly.length && <div className="muted small">No other bound differences.</div>}
          {boundsOnly.map((id) => { const r = index.rxn.get(id)!; return <div key={id} className="kv small"><ELink r={{ kind: 'reaction', id }} /><span className="mono">{fbounds(L.bounds(a, r))} → {fbounds(L.bounds(b, r))}</span></div>; })}
        </div>
      </div>
    </div>
  );
}
