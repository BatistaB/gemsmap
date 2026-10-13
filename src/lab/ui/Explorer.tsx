import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../ui/icons';
import { addMetabolitesToMap, addReactionsToMap } from '../bridge';
import { fnum, toCsv } from '../format';
import { BUILTIN_VIEWS, L, lab, useLab } from '../store';
import type { ExplorerTab, LabGene, ReactionType, RxnFilters, SortSpec } from '../types';
import { Popover, Toggle, useDebounced } from './common';
import { filterMetabolites, filterReactions, GeneTable, geneSortValue, MetaboliteTable, metSortValue, ReactionTable, REACTION_COLUMNS, REACTION_SORTS, rxnSortValue, sortRows, useRxnCtx } from './tables';
import { ResizeHandle, usePanelWidth } from '../../ui/Resizer';
import { subsystemLabel } from '../subsystems';
import { openMetaboliteEditor, openReactionEditor } from './edit/EditDialogs';

const TYPES: ReactionType[] = ['internal', 'transport', 'exchange', 'demand', 'sink'];

export function Explorer() {
  const model = useLab((s) => s.model)!;
  const index = useLab((s) => s.index)!;
  const search = useLab((s) => s.searchIndex)!;
  const tab = useLab((s) => s.explorerTab);
  const query = useLab((s) => s.query);
  const hideZero = useLab((s) => s.hideZero);
  const rxnFilters = useLab((s) => s.rxnFilters);
  const metFilters = useLab((s) => s.metFilters);
  const sortAll = useLab((s) => s.sort);
  const settings = useLab((s) => s.settings);
  const favorites = useLab((s) => s.favorites);
  const flux = useLab((s) => L.fluxResult(s));
  const fva = useLab((s) => L.fvaResult(s));
  const selection = useLab((s) => s.selection);
  const [subsOpen, setSubsOpen] = useState(index.subsystems.size > 0);
  const searchRef = useRef<HTMLInputElement>(null);
  const dq = useDebounced(query, 110);
  const ctx = useRxnCtx(flux, fva);
  const sort = sortAll[tab];

  const ranked = useMemo(() => search.matchIds(dq, tab === 'reactions' ? 'reaction' : tab === 'metabolites' ? 'metabolite' : 'gene'), [search, dq, tab]);
  const byRank = <T extends { id: string }>(rows: T[]) => (ranked ? rows.filter((r) => ranked.has(r.id)).sort((a, b) => ranked.get(b.id)! - ranked.get(a.id)!) : rows);

  const rxnRows = useMemo(() => {
    if (tab !== 'reactions') return [];
    const base = filterReactions(byRank(model.reactions), rxnFilters, hideZero, ctx);
    return sortRows(base, sort, (k, r) => rxnSortValue(k, r, ctx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, model, ranked, rxnFilters, hideZero, ctx, sort]);

  const turnover = flux?.metaboliteTurnover ?? null;
  const metRows = useMemo(() => {
    if (tab !== 'metabolites') return [];
    const base = filterMetabolites(byRank(model.metabolites), metFilters, hideZero, turnover, settings.zeroTolerance, new Set(favorites));
    return sortRows(base, sort, (k, m) => metSortValue(k, m, turnover));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, model, ranked, metFilters, hideZero, turnover, settings.zeroTolerance, favorites, sort]);

  const activeCount = useMemo(() => {
    const fx = flux?.reactionFluxes;
    return (g: LabGene) => (fx ? g.reactions.filter((r) => Math.abs(fx[r] ?? 0) >= settings.zeroTolerance).length : null);
  }, [flux, settings.zeroTolerance]);
  const geneRows = useMemo(() => {
    if (tab !== 'genes') return [];
    const base = byRank(model.genes).filter((g) => !(hideZero && flux) || (activeCount(g) ?? 0) > 0);
    return sortRows(base, sort, (k, g) => geneSortValue(k, g, activeCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, model, ranked, sort, activeCount, hideZero, flux]);

  const onSort = (k: string) => {
    const cur = sortAll[tab];
    let next: SortSpec | null;
    if (k === 'flux' && cur?.key === 'flux' && cur.dir === 'desc') next = { key: 'absFlux', dir: 'desc' };
    else if (cur?.key === k) next = cur.dir === 'asc' ? { key: k, dir: 'desc' } : null;
    else next = { key: k, dir: ['flux', 'absFlux', 'turnover', 'fvaRange', 'fvaWidth', 'active', 'reactions', 'genes', 'ub'].includes(k) ? 'desc' : 'asc' };
    lab.setSort(tab, next);
  };

  const counts = { metabolites: model.metabolites.length, reactions: model.reactions.length, genes: model.genes.length };
  const shown = tab === 'reactions' ? rxnRows.length : tab === 'metabolites' ? metRows.length : geneRows.length;
  const zeroLabel = tab === 'metabolites' ? 'Hide zero turnover' : tab === 'genes' ? 'Only genes with active reactions' : flux ? 'Hide zero flux' : fva ? 'Hide blocked (FVA)' : 'Hide zero flux';
  const zeroDisabled = tab === 'metabolites' ? !turnover : !(flux || (tab === 'reactions' && fva));

  return (
    <div className="explorer">
      <div className="ex-toolbar">
        <div className="ex-tabs" role="tablist">
          {(['metabolites', 'reactions', 'genes'] as ExplorerTab[]).map((t) => (
            <button key={t} role="tab" className={tab === t ? 'on' : ''} onClick={() => lab.setTab(t)} title={`${t[0].toUpperCase()} key`}>
              {t[0].toUpperCase() + t.slice(1)} <span className="count">{counts[t].toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className="search-box ex-search">
          <Icon name="search" size={14} />
          <input ref={searchRef} id="lab-explorer-search" placeholder={tab === 'reactions' ? 'Search id, name, equation, metabolites, genes, subsystem, EC…' : tab === 'metabolites' ? 'Search id, name, formula, compartment, annotations…' : 'Search gene id, name, reactions…'}
            value={query} onChange={(e) => useLab.setState({ query: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Escape') { useLab.setState({ query: '' }); (e.target as HTMLInputElement).blur(); } }} />
          {query ? <button className="icon-btn tiny" onClick={() => useLab.setState({ query: '' })}><Icon name="x" size={11} /></button> : <kbd>F</kbd>}
        </div>
      </div>
      <div className="ex-toolbar second">
        <Toggle checked={hideZero} onChange={(v) => useLab.setState({ hideZero: v })} title={zeroDisabled ? 'Run a simulation first' : `|value| < ${settings.zeroTolerance} counts as zero (Settings)`}>
          {zeroLabel}
        </Toggle>
        {tab === 'reactions' && <SortMenu />}
        {tab === 'reactions' && <ReactionFilterMenu />}
        {tab === 'metabolites' && <MetaboliteFilterMenu />}
        {tab === 'reactions' && <ColumnMenu />}
        <ViewsMenu />
        {index.subsystems.size > 0 && tab === 'reactions' && <button className={`btn small ${subsOpen ? 'on' : ''}`} onClick={() => setSubsOpen(!subsOpen)}>Subsystems</button>}
        <span className="grow" />
        {tab === 'reactions' && <button className="btn small" onClick={() => openReactionEditor()} title="Reaction builder"><Icon name="plus" size={11} /> Reaction</button>}
        {tab === 'metabolites' && <button className="btn small" onClick={() => openMetaboliteEditor()} title="Search the model and the databases, or create one"><Icon name="plus" size={11} /> Metabolite</button>}
        <ResultChips />
        <span className="muted small nowrap">{shown.toLocaleString()} of {counts[tab].toLocaleString()}</span>
      </div>
      <FilterChips />
      <div className="ex-body">
        {subsOpen && tab === 'reactions' && index.subsystems.size > 0 && <SubsystemBrowser />}
        <div className="ex-table">
          {tab === 'reactions' && <ReactionTable rows={rxnRows} ctx={ctx} columns={settings.reactionColumns} sort={sort} onSort={onSort} />}
          {tab === 'metabolites' && <MetaboliteTable rows={metRows} turnover={turnover} sort={sort} onSort={onSort} />}
          {tab === 'genes' && <GeneTable rows={geneRows} active={activeCount} sort={sort} onSort={onSort} />}
        </div>
      </div>
      {tab === 'reactions' && selection.reactions.length > 0 && <ReactionActionBar rows={rxnRows.map((r) => r.id)} />}
      {tab === 'metabolites' && selection.metabolites.length > 0 && <MetaboliteActionBar />}
    </div>
  );
}

function ResultChips() {
  const flux = useLab((s) => L.fluxResult(s));
  const fva = useLab((s) => L.fvaResult(s));
  const activeState = useLab((s) => s.activeStateId);
  if (!flux && !fva) return <span className="muted small">No simulation yet</span>;
  const chip = (r: NonNullable<typeof flux>, label: string) => (
    <button className={`result-chip ${r.modelStateId !== activeState ? 'other' : ''}`} onClick={() => lab.setSection('results')}
      title={r.modelStateId !== activeState ? `From state “${r.metadata.state.name}” (not the active state)` : r.name}>
      <i className={`m-${r.method}`} />{label}: {r.name}{r.modelStateId !== activeState && <span className="warn-dot">●</span>}
    </button>
  );
  return <span className="row gap">{flux && chip(flux, 'Flux')}{fva && chip(fva, 'FVA')}</span>;
}

function SortMenu() {
  const sort = useLab((s) => s.sort.reactions);
  const label = REACTION_SORTS.find((x) => x.key === sort?.key && x.dir === sort?.dir)?.label ?? (sort ? `${sort.key} ${sort.dir === 'asc' ? '↑' : '↓'}` : 'Relevance');
  return (
    <Popover trigger={(open, t) => <button className={`btn small ${open ? 'on' : ''}`} onClick={t}>Sort: {label} ▾</button>}>
      {(close) => (
        <div className="menu-list">
          {REACTION_SORTS.map((s) => (
            <button key={s.key + s.dir} className={sort?.key === s.key && sort.dir === s.dir ? 'on' : ''} onClick={() => { lab.setSort('reactions', { key: s.key, dir: s.dir }); close(); }}>{s.label}</button>
          ))}
          <div className="dd-sep" />
          <button onClick={() => { lab.setSort('reactions', null); close(); }}>Default / relevance</button>
        </div>
      )}
    </Popover>
  );
}

function ColumnMenu() {
  const cols = useLab((s) => s.settings.reactionColumns);
  return (
    <Popover trigger={(open, t) => <button className={`btn small ${open ? 'on' : ''}`} onClick={t}>Columns ▾</button>}>
      {() => (
        <div className="menu-list checks">
          {REACTION_COLUMNS.map((c) => (
            <label key={c.key}><input type="checkbox" checked={cols.includes(c.key)} disabled={c.key === 'id'}
              onChange={(e) => lab.setSettings({ reactionColumns: e.target.checked ? REACTION_COLUMNS.map((x) => x.key).filter((k) => k === c.key || cols.includes(k)) : cols.filter((k) => k !== c.key) })} /> {c.label}</label>
          ))}
        </div>
      )}
    </Popover>
  );
}

function ReactionFilterMenu() {
  const f = useLab((s) => s.rxnFilters);
  const model = useLab((s) => s.model)!;
  const index = useLab((s) => s.index)!;
  const [subQ, setSubQ] = useState('');
  const upd = (p: Partial<RxnFilters>) => useLab.setState((s) => {
    const next: RxnFilters = { ...s.rxnFilters, ...p };
    for (const k of Object.keys(next) as (keyof RxnFilters)[]) { const v = next[k]; if (v == null || (Array.isArray(v) && !v.length) || v === false) delete next[k]; }
    return { rxnFilters: next };
  });
  const toggleIn = (list: string[] | undefined, v: string) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
  const n = Object.keys(f).length;
  const subs = [...index.subsystems.keys()].sort().filter((s) => s.toLowerCase().includes(subQ.toLowerCase()));
  return (
    <Popover className="filter-pop" trigger={(open, t) => <button className={`btn small ${open || n ? 'on' : ''}`} onClick={t}><Icon name="tidy" size={12} /> Filters{n ? ` · ${n}` : ''} ▾</button>}>
      {() => (
        <div className="filters">
          <div className="f-group"><div className="f-title">Flux (active result)</div>
            <div className="row gap"><span className="small">|flux| &gt;</span><input className="input tiny num" type="number" step="any" value={f.absFluxGt ?? ''} onChange={(e) => upd({ absFluxGt: e.target.value === '' ? undefined : +e.target.value })} />
              <span className="small">|flux| &lt;</span><input className="input tiny num" type="number" step="any" value={f.absFluxLt ?? ''} onChange={(e) => upd({ absFluxLt: e.target.value === '' ? undefined : +e.target.value })} /></div>
          </div>
          <div className="f-group"><div className="f-title">Bounds</div>
            <div className="row gap wrap">
              {(['reversible', 'irreversible', 'blocked'] as const).map((r) => <button key={r} className={`chip-btn ${f.reversibility === r ? 'on' : ''}`} onClick={() => upd({ reversibility: f.reversibility === r ? undefined : r })}>{r}</button>)}
              <button className={`chip-btn ${f.modifiedOnly ? 'on' : ''}`} onClick={() => upd({ modifiedOnly: !f.modifiedOnly })}>modified</button>
            </div>
          </div>
          <div className="f-group"><div className="f-title">Type <span className="muted small">(click: only · ⌫ hide)</span></div>
            <div className="row gap wrap">
              {TYPES.map((t) => (
                <span key={t} className="type-filter">
                  <button className={`chip-btn ${f.types?.includes(t) ? 'on' : ''} ${f.hideTypes?.includes(t) ? 'off' : ''}`} onClick={() => upd({ types: toggleIn(f.types, t) as ReactionType[], hideTypes: f.hideTypes?.filter((x) => x !== t) })}>{t}</button>
                  <button className="chip-x" title={`Hide ${t}`} onClick={() => upd({ hideTypes: toggleIn(f.hideTypes, t) as ReactionType[], types: f.types?.filter((x) => x !== t) })}>⌫</button>
                </span>
              ))}
            </div>
          </div>
          <div className="f-group"><div className="f-title">Genes</div>
            <div className="row gap">
              <button className={`chip-btn ${f.genes === 'with' ? 'on' : ''}`} onClick={() => upd({ genes: f.genes === 'with' ? undefined : 'with' })}>gene-associated</button>
              <button className={`chip-btn ${f.genes === 'without' ? 'on' : ''}`} onClick={() => upd({ genes: f.genes === 'without' ? undefined : 'without' })}>no gene association</button>
              <button className={`chip-btn ${f.favoritesOnly ? 'on' : ''}`} onClick={() => upd({ favoritesOnly: !f.favoritesOnly })}>★ favorites</button>
            </div>
          </div>
          <div className="f-group"><div className="f-title">Compartment</div>
            <div className="row gap wrap">
              {Object.entries(model.compartments).map(([id, name]) => <button key={id} className={`chip-btn ${f.compartments?.includes(id) ? 'on' : ''}`} onClick={() => upd({ compartments: toggleIn(f.compartments, id) })}>{name}</button>)}
            </div>
          </div>
          {index.subsystems.size > 0 && (
            <div className="f-group"><div className="f-title">Subsystem</div>
              <input className="input tiny" placeholder="Filter subsystems…" value={subQ} onChange={(e) => setSubQ(e.target.value)} />
              <div className="f-scroll">
                {subs.map((s) => <label key={s} className="check small"><input type="checkbox" checked={!!f.subsystems?.includes(s)} onChange={() => upd({ subsystems: toggleIn(f.subsystems, s) })} /> <span className="ellipsis">{s}</span> <span className="muted">{index.subsystems.get(s)!.length}</span></label>)}
              </div>
            </div>
          )}
          <div className="row end"><button className="btn small" onClick={() => useLab.setState({ rxnFilters: {} })}>Clear all</button></div>
        </div>
      )}
    </Popover>
  );
}

function MetaboliteFilterMenu() {
  const f = useLab((s) => s.metFilters);
  const model = useLab((s) => s.model)!;
  const toggle = (id: string) => useLab.setState((s) => {
    const c = s.metFilters.compartments ?? [];
    const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
    return { metFilters: { ...s.metFilters, compartments: next.length ? next : undefined } };
  });
  const n = (f.compartments?.length ? 1 : 0) + (f.favoritesOnly ? 1 : 0);
  return (
    <Popover className="filter-pop" trigger={(open, t) => <button className={`btn small ${open || n ? 'on' : ''}`} onClick={t}>Filters{n ? ` · ${n}` : ''} ▾</button>}>
      {() => (
        <div className="filters">
          <div className="f-group"><div className="f-title">Compartment</div>
            <div className="row gap wrap">{Object.entries(model.compartments).map(([id, name]) => <button key={id} className={`chip-btn ${f.compartments?.includes(id) ? 'on' : ''}`} onClick={() => toggle(id)}>{name}</button>)}</div>
          </div>
          <div className="f-group"><button className={`chip-btn ${f.favoritesOnly ? 'on' : ''}`} onClick={() => useLab.setState((s) => ({ metFilters: { ...s.metFilters, favoritesOnly: !s.metFilters.favoritesOnly || undefined } }))}>★ favorites only</button></div>
        </div>
      )}
    </Popover>
  );
}

function ViewsMenu() {
  const saved = useLab((s) => s.savedViews);
  const [naming, setNaming] = useState(false);
  return (
    <Popover trigger={(open, t) => <button className={`btn small ${open ? 'on' : ''}`} onClick={t}>Views ▾</button>}>
      {(close) => (
        <div className="menu-list">
          <div className="menu-label">Built-in</div>
          {BUILTIN_VIEWS.map((v) => <button key={v.id} onClick={() => { lab.applyView(v); close(); }}>{v.name}</button>)}
          {saved.length > 0 && <div className="menu-label">Saved</div>}
          {saved.map((v) => <div key={v.id} className="menu-row"><button onClick={() => { lab.applyView(v); close(); }}>{v.name}</button><button className="icon-btn tiny" onClick={() => lab.deleteView(v.id)}><Icon name="x" size={10} /></button></div>)}
          <div className="dd-sep" />
          {naming
            ? <input className="input tiny" autoFocus placeholder="View name, then Enter" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { lab.saveView(e.currentTarget.value.trim()); setNaming(false); close(); } if (e.key === 'Escape') setNaming(false); }} />
            : <button onClick={() => setNaming(true)}>＋ Save current search & filters…</button>}
        </div>
      )}
    </Popover>
  );
}

function FilterChips() {
  const f = useLab((s) => s.rxnFilters);
  const mf = useLab((s) => s.metFilters);
  const tab = useLab((s) => s.explorerTab);
  const compartments = useLab((s) => s.model?.compartments ?? {});
  const hideZero = useLab((s) => s.hideZero);
  const chips: { label: string; clear: () => void }[] = [];
  const clr = (k: keyof RxnFilters) => () => useLab.setState((s) => { const n = { ...s.rxnFilters }; delete n[k]; return { rxnFilters: n }; });
  if (tab === 'reactions') {
    if (hideZero) chips.push({ label: 'Hide zero flux', clear: () => useLab.setState({ hideZero: false }) });
    if (f.ids) chips.push({ label: f.ids.label, clear: clr('ids') });
    if (f.absFluxGt != null) chips.push({ label: `|flux| > ${f.absFluxGt}`, clear: clr('absFluxGt') });
    if (f.absFluxLt != null) chips.push({ label: `|flux| < ${f.absFluxLt}`, clear: clr('absFluxLt') });
    if (f.reversibility) chips.push({ label: f.reversibility, clear: clr('reversibility') });
    if (f.modifiedOnly) chips.push({ label: 'Modified bounds', clear: clr('modifiedOnly') });
    if (f.types?.length) chips.push({ label: `Only ${f.types.join(', ')}`, clear: clr('types') });
    if (f.hideTypes?.length) chips.push({ label: `Hide ${f.hideTypes.join(', ')}`, clear: clr('hideTypes') });
    if (f.genes) chips.push({ label: f.genes === 'with' ? 'Gene-associated' : 'No gene association', clear: clr('genes') });
    if (f.subsystems?.length) chips.push({ label: f.subsystems.length === 1 ? f.subsystems[0] : `${f.subsystems.length} subsystems`, clear: clr('subsystems') });
    if (f.compartments?.length) chips.push({ label: f.compartments.map((c) => compartments[c] ?? c).join(', '), clear: clr('compartments') });
    if (f.favoritesOnly) chips.push({ label: '★ Favorites', clear: clr('favoritesOnly') });
  } else if (tab === 'metabolites') {
    if (hideZero) chips.push({ label: 'Hide zero turnover', clear: () => useLab.setState({ hideZero: false }) });
    if (mf.ids) chips.push({ label: mf.ids.label, clear: () => useLab.setState((s) => ({ metFilters: { ...s.metFilters, ids: undefined } })) });
    if (mf.compartments?.length) chips.push({ label: mf.compartments.map((c) => compartments[c] ?? c).join(', '), clear: () => useLab.setState((s) => ({ metFilters: { ...s.metFilters, compartments: undefined } })) });
    if (mf.favoritesOnly) chips.push({ label: '★ Favorites', clear: () => useLab.setState((s) => ({ metFilters: { ...s.metFilters, favoritesOnly: undefined } })) });
  }
  if (!chips.length) return null;
  return (
    <div className="filter-chips">
      {chips.map((c) => <span key={c.label} className="fchip">{c.label}<button onClick={c.clear} title="Remove filter">×</button></span>)}
      {chips.length > 1 && <button className="link small" onClick={() => useLab.setState({ rxnFilters: {}, metFilters: {}, hideZero: false })}>Clear all</button>}
    </div>
  );
}

function SubsystemBrowser() {
  const pw = usePanelWidth('lab-subsystems', 230, 150, 520);
  const index = useLab((s) => s.index)!;
  const f = useLab((s) => s.rxnFilters.subsystems);
  const flux = useLab((s) => L.fluxResult(s));
  const tol = useLab((s) => s.settings.zeroTolerance);
  const sel = useLab((s) => s.selection.reactions);
  const [q, setQ] = useState('');
  const list = useMemo(() => [...index.subsystems.entries()].sort((a, b) => a[0].localeCompare(b[0])), [index]);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const shown = list.filter(([n]) => `${n} ${subsystemLabel(n)}`.toLowerCase().includes(q.toLowerCase()));
  const nSelSubs = list.filter(([, rids]) => rids.every((r) => selSet.has(r))).length;
  // Checking a subsystem selects all of its reactions (e.g. to run FVA on them); unchecking removes them.
  const toggleSel = (rids: string[], all: boolean) => {
    const drop = new Set(rids);
    lab.setSelection('reactions', all ? sel.filter((r) => !drop.has(r)) : [...sel, ...rids.filter((r) => !selSet.has(r))]);
  };
  return (
    <div className="subsys" style={{ width: pw.width }}>
      <ResizeHandle panel={pw} edge="right" />
      <input className="input tiny" placeholder="Subsystems…" value={q} onChange={(e) => setQ(e.target.value)} />
      {nSelSubs > 0 && <div className="subsys-selnote small muted">{nSelSubs} subsystem{nSelSubs > 1 ? 's' : ''} selected · {sel.length} reactions</div>}
      <div className="subsys-list">
        {shown.map(([name, rids]) => {
          const active = flux?.reactionFluxes ? rids.filter((r) => Math.abs(flux.reactionFluxes![r] ?? 0) >= tol).length : null;
          const on = f?.length === 1 && f[0] === name;
          const nSel = rids.reduce((a, r) => a + (selSet.has(r) ? 1 : 0), 0);
          const all = nSel === rids.length;
          return (
            <div key={name} className={`subsys-item ${on ? 'on' : ''} ${all ? 'picked' : ''}`} title={name}>
              <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = nSel > 0 && !all; }}
                title={all ? `Deselect the ${rids.length} reactions` : `Select all ${rids.length} reactions (e.g. for FVA on selection)`}
                onChange={() => toggleSel(rids, all)} />
              <button className="subsys-name" onClick={() => { useLab.setState((s) => ({ rxnFilters: { ...s.rxnFilters, subsystems: on ? undefined : [name] } })); if (!on) lab.navigate({ kind: 'subsystem', id: name }); }}>
                <span className="ellipsis">{subsystemLabel(name)}</span><span className="muted mono">{active != null ? `${active}/` : ''}{rids.length}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function downloadText(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
}

function ReactionActionBar({ rows }: { rows: string[] }) {
  const sel = useLab((s) => s.selection.reactions);
  const index = useLab((s) => s.index)!;
  const flux = useLab((s) => L.fluxResult(s));
  const st = useLab((s) => L.activeState(s));
  const exportSel = () => downloadText('reactions_selection.csv', toCsv([['reaction', 'name', 'equation', 'lower_bound', 'upper_bound', 'flux'],
    ...sel.map((id) => { const r = index.rxn.get(id)!; const b = L.bounds(st, r); return [id, r.name, r.equation, b[0], b[1], flux?.reactionFluxes?.[id] ?? '']; })]));
  return (
    <div className="action-bar">
      <b>{sel.length} reaction{sel.length > 1 ? 's' : ''} selected</b>
      <button className="btn small primary" onClick={() => addReactionsToMap(sel)}><Icon name="plus" size={12} /> Add to Map</button>
      <button className="btn small" onClick={() => useLab.setState({ dialog: { kind: 'confirm-block', rids: sel } })}>Block…</button>
      <button className="btn small" onClick={() => lab.resetBounds(sel)} disabled={!sel.some((r) => st.bounds[r])}>Reset bounds</button>
      <button className="btn small" onClick={() => { lab.simulate('fva', { reactions: sel }); lab.setSection('simulate'); }} title="Flux variability of just these reactions (fast on large models)">FVA on selection</button>
      <button className="btn small" onClick={() => lab.showInExplorer('reactions', sel, `Selection (${sel.length})`)}>Filter to selection</button>
      <button className="btn small" onClick={exportSel}>Export CSV</button>
      <button className="btn small" onClick={() => lab.setSelection('reactions', rows)} disabled={sel.length === rows.length}>Select all {rows.length}</button>
      <button className="btn small" onClick={() => lab.clearSelection()}>Clear</button>
      {flux && <span className="muted small">Σ|flux| {fnum(sel.reduce((a, id) => a + Math.abs(flux.reactionFluxes?.[id] ?? 0), 0))}</span>}
    </div>
  );
}

function MetaboliteActionBar() {
  const sel = useLab((s) => s.selection.metabolites);
  const index = useLab((s) => s.index)!;
  const turnover = useLab((s) => L.fluxResult(s)?.metaboliteTurnover);
  const connected = () => {
    const ids = Array.from(new Set(sel.flatMap((m) => index.metRxns.get(m) ?? [])));
    lab.showInExplorer('reactions', ids, `Connected to ${sel.length} metabolite${sel.length > 1 ? 's' : ''}`);
  };
  return (
    <div className="action-bar">
      <b>{sel.length} metabolite{sel.length > 1 ? 's' : ''} selected</b>
      <button className="btn small primary" onClick={() => addMetabolitesToMap(sel)}><Icon name="plus" size={12} /> Add to Map</button>
      <button className="btn small" onClick={connected}>Connected reactions</button>
      <button className="btn small" onClick={() => downloadText('metabolites_selection.csv', toCsv([['metabolite', 'name', 'formula', 'compartment', 'turnover'], ...sel.map((id) => { const m = index.met.get(id)!; return [id, m.name, m.formula, m.compartment, turnover?.[id] ?? '']; })]))}>Export CSV</button>
      <button className="btn small" onClick={() => lab.clearSelection()}>Clear</button>
    </div>
  );
}
