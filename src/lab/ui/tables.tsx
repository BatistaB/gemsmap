/** Reaction / metabolite / gene tables shared by the Explorer and the Result workspace. */
import { useMemo, useState } from 'react';
import { fbound, fnum, reactionTypeLabel } from '../format';
import { L, lab, refKey, useLab } from '../store';
import type { Bounds, LabGene, LabMetabolite, LabReaction, MetFilters, ModelState, RxnFilters, SimulationResult, SortSpec } from '../types';
import { FluxBar, InfoTip, NumberInput, RangeBar } from './common';
import { nextSelection, VirtualTable, type Col } from './VirtualTable';

// ------------------------------------------------------------------ reactions

export const REACTION_COLUMNS: { key: string; label: string }[] = [
  { key: 'id', label: 'Reaction' }, { key: 'name', label: 'Name' }, { key: 'equation', label: 'Equation' },
  { key: 'lb', label: 'LB' }, { key: 'ub', label: 'UB' }, { key: 'flux', label: 'Flux' },
  { key: 'fvaMin', label: 'FVA min' }, { key: 'fvaMax', label: 'FVA max' }, { key: 'fvaRange', label: 'FVA range' },
  { key: 'subsystem', label: 'Subsystem' }, { key: 'type', label: 'Type' }, { key: 'reversible', label: 'Reversible' },
  { key: 'genes', label: 'Genes' }, { key: 'ec', label: 'EC' }, { key: 'objective', label: 'Obj. coef.' },
];

export const REACTION_SORTS: { key: string; dir: 'asc' | 'desc'; label: string }[] = [
  { key: 'absFlux', dir: 'desc', label: '|Flux| ↓' }, { key: 'absFlux', dir: 'asc', label: '|Flux| ↑' },
  { key: 'flux', dir: 'desc', label: 'Flux ↓' }, { key: 'flux', dir: 'asc', label: 'Flux ↑' },
  { key: 'fvaWidth', dir: 'desc', label: 'FVA width ↓' }, { key: 'fvaWidth', dir: 'asc', label: 'FVA width ↑' },
  { key: 'id', dir: 'asc', label: 'ID' }, { key: 'name', dir: 'asc', label: 'Name' },
  { key: 'lb', dir: 'asc', label: 'Lower bound' }, { key: 'ub', dir: 'desc', label: 'Upper bound' },
  { key: 'subsystem', dir: 'asc', label: 'Subsystem' },
];

export interface RxnCtx { st: ModelState; flux: SimulationResult | null; fva: SimulationResult | null; boundsSource?: SimulationResult | null; favorites: Set<string>; tol: number }

function boundsOf(c: RxnCtx, r: LabReaction): Bounds {
  if (c.boundsSource?.stateSnapshot) return c.boundsSource.stateSnapshot.bounds[r.id] ?? [r.lb, r.ub];
  return L.bounds(c.st, r);
}

export function rxnSortValue(key: string, r: LabReaction, c: RxnCtx): number | string | null {
  const f = c.flux?.reactionFluxes?.[r.id];
  const iv = c.fva?.fva?.[r.id];
  switch (key) {
    case 'id': return r.id.toLowerCase();
    case 'name': return (r.name || r.id).toLowerCase();
    case 'equation': return r.equation;
    case 'lb': return boundsOf(c, r)[0] ?? -Infinity;
    case 'ub': return boundsOf(c, r)[1] ?? Infinity;
    case 'flux': return f ?? null;
    case 'absFlux': return f == null ? null : Math.abs(f);
    case 'fvaMin': return iv?.minimum ?? null;
    case 'fvaMax': return iv?.maximum ?? null;
    case 'fvaRange': case 'fvaWidth': return iv?.minimum == null || iv?.maximum == null ? null : iv.maximum - iv.minimum;
    case 'subsystem': return (r.subsystem ?? '~').toLowerCase();
    case 'type': return r.type;
    case 'reversible': return r.reversible ? 1 : 0;
    case 'genes': return r.genes.length;
    case 'ec': return r.ec[0] ?? '~';
    case 'objective': return L.objective(c.st).coefficients[r.id] ?? 0;
    default: return null;
  }
}

export function sortRows<T>(rows: T[], sort: SortSpec | null, value: (key: string, r: T) => number | string | null): T[] {
  if (!sort) return rows;
  const m = sort.dir === 'asc' ? 1 : -1;
  const keyed = rows.map((r) => [value(sort.key, r), r] as const);
  keyed.sort((a, b) => {
    const x = a[0], y = b[0];
    if (x == null && y == null) return 0;
    if (x == null) return 1; // missing values always last
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
  return keyed.map((k) => k[1]);
}

export function filterReactions(rows: LabReaction[], f: RxnFilters, hideZero: boolean, c: RxnCtx): LabReaction[] {
  const fx = c.flux?.reactionFluxes;
  const subs = f.subsystems?.length ? new Set(f.subsystems) : null;
  const comps = f.compartments?.length ? new Set(f.compartments) : null;
  const ids = f.ids ? new Set(f.ids.ids) : null;
  return rows.filter((r) => {
    if (ids && !ids.has(r.id)) return false;
    const v = fx?.[r.id];
    if (hideZero) {
      if (fx) { if (v == null || Math.abs(v) < c.tol) return false; }
      else if (c.fva?.fva) { const iv = c.fva.fva[r.id]; if (!iv || (Math.abs(iv.minimum ?? 0) < c.tol && Math.abs(iv.maximum ?? 0) < c.tol)) return false; }
    }
    if (f.absFluxGt != null && (v == null || Math.abs(v) <= f.absFluxGt)) return false;
    if (f.absFluxLt != null && (v == null || Math.abs(v) >= f.absFluxLt)) return false;
    if (f.reversibility) {
      const b = boundsOf(c, r);
      const rev = (b[0] == null || b[0] < 0) && (b[1] == null || b[1] > 0);
      const blocked = b[0] === 0 && b[1] === 0;
      if (f.reversibility === 'blocked' ? !blocked : f.reversibility === 'reversible' ? !rev : rev || blocked) return false;
    }
    if (f.modifiedOnly && !c.st.bounds[r.id]) return false;
    if (f.types?.length && !f.types.includes(r.type)) return false;
    if (f.hideTypes?.length && f.hideTypes.includes(r.type)) return false;
    if (f.genes === 'with' && !r.genes.length) return false;
    if (f.genes === 'without' && r.genes.length) return false;
    if (subs && !subs.has(r.subsystem ?? '')) return false;
    if (comps && !r.compartments.some((x) => comps.has(x))) return false;
    if (f.favoritesOnly && !c.favorites.has(`reaction:${r.id}`)) return false;
    return true;
  });
}

export function useRxnCtx(flux: SimulationResult | null, fva: SimulationResult | null, boundsSource?: SimulationResult | null): RxnCtx {
  const st = useLab((s) => L.activeState(s));
  const favorites = useLab((s) => s.favorites);
  const tol = useLab((s) => s.settings.zeroTolerance);
  return useMemo(() => ({ st, flux, fva, boundsSource, favorites: new Set(favorites), tol }), [st, flux, fva, boundsSource, favorites, tol]);
}

export function ReactionTable({ rows, ctx, columns, sort, onSort, editable = true }: { rows: LabReaction[]; ctx: RxnCtx; columns: string[]; sort: SortSpec | null; onSort: (k: string) => void; editable?: boolean }) {
  const selection = useLab((s) => s.selection.reactions);
  const current = useLab((s) => s.nav.stack[s.nav.index]);
  const [editing, setEditing] = useState<{ id: string; side: 0 | 1 } | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const sel = useMemo(() => new Set(selection), [selection]);
  const maxFlux = useMemo(() => {
    let m = 0;
    const fx = ctx.flux?.reactionFluxes;
    if (fx) for (const v of Object.values(fx)) if (v != null && Math.abs(v) > m) m = Math.abs(v);
    return m;
  }, [ctx.flux]);
  const fvaDomain = useMemo(() => {
    let lo = 0, hi = 0;
    for (const iv of Object.values(ctx.fva?.fva ?? {})) { if (iv.minimum != null) lo = Math.min(lo, iv.minimum); if (iv.maximum != null) hi = Math.max(hi, iv.maximum); }
    return [lo, hi] as const;
  }, [ctx.fva]);

  const boundCell = (r: LabReaction, side: 0 | 1) => {
    const b = boundsOf(ctx, r);
    if (editing && editing.id === r.id && editing.side === side) {
      return <NumberInput autoFocus allowEmpty value={b[side]} className="cell-edit" onCommit={(v) => { setEditing(null); const nb: Bounds = side === 0 ? [v, b[1]] : [b[0], v]; lab.setBounds(r.id, nb); }} />;
    }
    const orig = side === 0 ? r.lb : r.ub;
    const modified = b[side] !== orig;
    return <span className={modified ? 'modified' : ''} title={modified ? `Model file: ${fbound(orig, side ? 'upper' : 'lower')} → now ${fbound(b[side], side ? 'upper' : 'lower')}` : editable ? 'Double-click to edit' : undefined}>{fbound(b[side], side ? 'upper' : 'lower')}</span>;
  };

  const all: Record<string, Col<LabReaction>> = {
    sel: { key: 'sel', label: <input type="checkbox" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => lab.setSelection('reactions', e.target.checked ? rows.map((r) => r.id) : [])} title="Select all rows" />, width: 28, sortable: false, render: (r) => <input type="checkbox" checked={sel.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => lab.setSelection('reactions', sel.has(r.id) ? selection.filter((x) => x !== r.id) : [...selection, r.id])} /> },
    id: { key: 'id', label: 'Reaction', width: 'minmax(110px, 1fr)', render: (r) => <span className="mono strong">{ctx.favorites.has(`reaction:${r.id}`) && <span className="fav-dot">★</span>}{r.id}</span> },
    name: { key: 'name', label: 'Name', width: 'minmax(140px, 1.6fr)', render: (r) => <span className="ellipsis" title={r.name}>{r.name}</span> },
    equation: { key: 'equation', label: 'Equation', width: 'minmax(200px, 3fr)', render: (r) => <span className="ellipsis mono eq-cell" title={r.equationNames}>{r.equation}</span> },
    lb: { key: 'lb', label: 'LB', width: 70, align: 'right', render: (r) => boundCell(r, 0) },
    ub: { key: 'ub', label: 'UB', width: 70, align: 'right', render: (r) => boundCell(r, 1) },
    flux: { key: 'flux', label: 'Flux', width: 110, align: 'right', title: 'Flux in the active result (mmol gDW⁻¹ h⁻¹). Click again to sort by |flux|', render: (r) => {
      if (!ctx.flux) return <span className="muted">—</span>;
      const v = ctx.flux.reactionFluxes?.[r.id];
      return <span className="flux-cell"><FluxBar v={v} max={maxFlux} /><span className={`mono ${v != null && Math.abs(v) < ctx.tol ? 'zero' : ''}`}>{fnum(v)}</span></span>;
    } },
    fvaMin: { key: 'fvaMin', label: 'FVA min', width: 80, align: 'right', render: (r) => <span className="mono">{ctx.fva ? fnum(ctx.fva.fva?.[r.id]?.minimum) : '—'}</span> },
    fvaMax: { key: 'fvaMax', label: 'FVA max', width: 80, align: 'right', render: (r) => <span className="mono">{ctx.fva ? fnum(ctx.fva.fva?.[r.id]?.maximum) : '—'}</span> },
    fvaRange: { key: 'fvaRange', label: 'FVA range', width: 120, title: 'Feasible interval on a shared axis (sort = width)', render: (r) => { const iv = ctx.fva?.fva?.[r.id]; return ctx.fva ? <RangeBar min={iv?.minimum ?? null} max={iv?.maximum ?? null} lo={fvaDomain[0]} hi={fvaDomain[1]} /> : <span className="muted">—</span>; } },
    subsystem: { key: 'subsystem', label: 'Subsystem', width: 'minmax(110px, 1.2fr)', render: (r) => <span className="ellipsis muted">{r.subsystem ?? ''}</span> },
    type: { key: 'type', label: 'Type', width: 78, render: (r) => <span className={`tag t-${r.type}`}>{reactionTypeLabel(r.type)}</span> },
    reversible: { key: 'reversible', label: 'Rev.', width: 44, align: 'center', render: (r) => (r.reversible ? '⇌' : '→') },
    genes: { key: 'genes', label: 'Genes', width: 56, align: 'right', render: (r) => <span className="mono">{r.genes.length || ''}</span> },
    ec: { key: 'ec', label: 'EC', width: 90, render: (r) => <span className="mono ellipsis">{r.ec.join(', ')}</span> },
    objective: { key: 'objective', label: 'Obj.', width: 52, align: 'right', render: (r) => { const c = L.objective(ctx.st).coefficients[r.id]; return c ? <span className="mono obj">{fnum(c, 3)}</span> : null; } },
  };
  const cols = ['sel', ...columns].map((k) => all[k]).filter(Boolean);
  const keys = rows.map((r) => r.id);
  return (
    <VirtualTable
      rows={rows} cols={cols} rowKey={(r) => r.id} sort={sort} onSort={onSort} selected={sel}
      active={current?.kind === 'reaction' ? current.id : null}
      rowClass={(r) => (ctx.st.bounds[r.id] ? 'row-modified' : '')}
      onRowClick={(r, e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) { lab.setSelection('reactions', nextSelection(keys, selection, r.id, e, anchor)); setAnchor(r.id); return; }
        setAnchor(r.id);
        lab.navigate({ kind: 'reaction', id: r.id });
      }}
      onKeyNav={(r) => lab.navigate({ kind: 'reaction', id: r.id })}
      onRowDoubleClick={(r, col) => { if (editable && (col === 'lb' || col === 'ub')) setEditing({ id: r.id, side: col === 'lb' ? 0 : 1 }); }}
      onContextMenu={(r, e) => {
        const refs = sel.has(r.id) && selection.length > 1 ? selection.map((id) => ({ kind: 'reaction' as const, id })) : [{ kind: 'reaction' as const, id: r.id }];
        useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs } });
      }}
      empty={<EmptyRows />}
    />
  );
}

function EmptyRows() {
  const hasFilters = useLab((s) => s.query || s.hideZero || Object.keys(s.rxnFilters).length || Object.keys(s.metFilters).length);
  return <div className="muted">{hasFilters ? 'No rows match the search and filters.' : 'Nothing to show.'}</div>;
}

// ------------------------------------------------------------------ metabolites

export function filterMetabolites(rows: LabMetabolite[], f: MetFilters, hideZero: boolean, turnover: Record<string, number | null> | null, tol: number, favorites: Set<string>) {
  const comps = f.compartments?.length ? new Set(f.compartments) : null;
  const ids = f.ids ? new Set(f.ids.ids) : null;
  return rows.filter((m) => {
    if (ids && !ids.has(m.id)) return false;
    if (comps && !comps.has(m.compartment)) return false;
    if (hideZero && turnover) { const v = turnover[m.id]; if (v == null || Math.abs(v) < tol) return false; }
    if (f.favoritesOnly && !favorites.has(`metabolite:${m.id}`)) return false;
    return true;
  });
}

export function metSortValue(key: string, m: LabMetabolite, turnover: Record<string, number | null> | null): number | string | null {
  switch (key) {
    case 'id': return m.id.toLowerCase();
    case 'name': return (m.name || m.id).toLowerCase();
    case 'compartment': return m.compartment;
    case 'formula': return m.formula ?? '~';
    case 'charge': return m.charge;
    case 'reactions': return m.reactionCount;
    case 'turnover': return turnover ? turnover[m.id] ?? null : null;
    default: return null;
  }
}

export function MetaboliteTable({ rows, turnover, sort, onSort }: { rows: LabMetabolite[]; turnover: Record<string, number | null> | null; sort: SortSpec | null; onSort: (k: string) => void }) {
  const compartments = useLab((s) => s.model?.compartments ?? {});
  const selection = useLab((s) => s.selection.metabolites);
  const favorites = useLab((s) => s.favorites);
  const tol = useLab((s) => s.settings.zeroTolerance);
  const current = useLab((s) => s.nav.stack[s.nav.index]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const sel = useMemo(() => new Set(selection), [selection]);
  const max = useMemo(() => Math.max(0, ...Object.values(turnover ?? {}).map((v) => v ?? 0)), [turnover]);
  const cols: Col<LabMetabolite>[] = [
    { key: 'sel', label: <input type="checkbox" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => lab.setSelection('metabolites', e.target.checked ? rows.map((r) => r.id) : [])} />, width: 28, sortable: false, render: (m) => <input type="checkbox" checked={sel.has(m.id)} onClick={(e) => e.stopPropagation()} onChange={() => lab.setSelection('metabolites', sel.has(m.id) ? selection.filter((x) => x !== m.id) : [...selection, m.id])} /> },
    { key: 'id', label: 'Metabolite', width: 'minmax(110px, 1fr)', render: (m) => <span className="mono strong">{favorites.includes(`metabolite:${m.id}`) && <span className="fav-dot">★</span>}{m.id}</span> },
    { key: 'name', label: 'Name', width: 'minmax(160px, 2fr)', render: (m) => <span className="ellipsis" title={m.name}>{m.name}</span> },
    { key: 'compartment', label: 'Compartment', width: 120, render: (m) => <span className="ellipsis muted">{compartments[m.compartment] ?? m.compartment}</span> },
    { key: 'formula', label: 'Formula', width: 120, render: (m) => <span className="mono ellipsis">{m.formula ?? ''}</span> },
    { key: 'charge', label: 'Charge', width: 56, align: 'right', render: (m) => <span className="mono">{m.charge ?? ''}</span> },
    { key: 'reactions', label: 'Rxns', width: 48, align: 'right', render: (m) => <span className="mono muted">{m.reactionCount}</span> },
    { key: 'turnover', label: <span>Turnover <InfoTip text={'Metabolite turnover / throughput — a derived proxy from one flux vector:\n0.5 × Σ |stoichiometric coefficient × reaction flux|.\nIt is not a flux carried by the metabolite itself.'} /></span>, width: 130, align: 'right', render: (m) => {
      if (!turnover) return <span className="muted">—</span>;
      const v = turnover[m.id];
      return <span className="flux-cell"><FluxBar v={v} max={max} /><span className={`mono ${v != null && Math.abs(v) < tol ? 'zero' : ''}`}>{fnum(v)}</span></span>;
    } },
  ];
  const keys = rows.map((r) => r.id);
  return (
    <VirtualTable rows={rows} cols={cols} rowKey={(m) => m.id} sort={sort} onSort={onSort} selected={sel}
      active={current?.kind === 'metabolite' ? current.id : null}
      onRowClick={(m, e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) { lab.setSelection('metabolites', nextSelection(keys, selection, m.id, e, anchor)); setAnchor(m.id); return; }
        setAnchor(m.id);
        lab.navigate({ kind: 'metabolite', id: m.id });
      }}
      onKeyNav={(m) => lab.navigate({ kind: 'metabolite', id: m.id })}
      onContextMenu={(m, e) => {
        const refs = sel.has(m.id) && selection.length > 1 ? selection.map((id) => ({ kind: 'metabolite' as const, id })) : [{ kind: 'metabolite' as const, id: m.id }];
        useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs } });
      }}
      empty={<EmptyRows />}
    />
  );
}

// ------------------------------------------------------------------ genes

export function geneSortValue(key: string, g: LabGene, active: (g: LabGene) => number | null): number | string | null {
  switch (key) {
    case 'id': return g.id.toLowerCase();
    case 'name': return (g.name || '~').toLowerCase();
    case 'reactions': return g.reactions.length;
    case 'active': return active(g);
    default: return null;
  }
}

export function GeneTable({ rows, active, sort, onSort }: { rows: LabGene[]; active: ((g: LabGene) => number | null); sort: SortSpec | null; onSort: (k: string) => void }) {
  const current = useLab((s) => s.nav.stack[s.nav.index]);
  const favorites = useLab((s) => s.favorites);
  const hasResult = useLab((s) => !!L.fluxResult(s));
  const cols: Col<LabGene>[] = [
    { key: 'id', label: 'Gene', width: 'minmax(120px, 1fr)', render: (g) => <span className="mono strong">{favorites.includes(refKey({ kind: 'gene', id: g.id })) && <span className="fav-dot">★</span>}{g.id}</span> },
    { key: 'name', label: 'Name', width: 'minmax(120px, 1.5fr)', render: (g) => <span className="ellipsis">{g.name}</span> },
    { key: 'reactions', label: 'Reactions', width: 80, align: 'right', render: (g) => <span className="mono">{g.reactions.length}</span> },
    { key: 'active', label: 'Active reactions', width: 120, align: 'right', title: 'Associated reactions carrying non-zero flux in the active result', render: (g) => <span className="mono">{hasResult ? active(g) : '—'}</span> },
    { key: 'rxnlist', label: 'Associated reactions', width: 'minmax(160px, 3fr)', sortable: false, render: (g) => <span className="ellipsis mono muted">{g.reactions.join(', ')}</span> },
  ];
  return (
    <VirtualTable rows={rows} cols={cols} rowKey={(g) => g.id} sort={sort} onSort={onSort}
      active={current?.kind === 'gene' ? current.id : null}
      onRowClick={(g) => lab.navigate({ kind: 'gene', id: g.id })}
      onKeyNav={(g) => lab.navigate({ kind: 'gene', id: g.id })}
      onContextMenu={(g, e) => useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs: [{ kind: 'gene', id: g.id }] } })}
      empty={<EmptyRows />}
    />
  );
}
