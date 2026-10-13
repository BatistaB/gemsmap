import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../ui/icons';
import { api, ApiError } from '../api';
import { fnum, FLUX_UNIT } from '../format';
import { normalize } from '../search';
import { L, lab, useLab } from '../store';
import type { ApiErrorInfo, MediumRow, MediumTable } from '../types';
import { ErrorCard, NumberInput, Seg, SectionHead, useDebounced } from './common';
import { VirtualTable, type Col } from './VirtualTable';

type Show = 'active' | 'exchanges' | 'boundary';

export function MediumEditor() {
  const model = useLab((s) => s.model)!;
  const st = useLab((s) => L.activeState(s));
  const presets = useLab((s) => s.mediumPresets);
  const [table, setTable] = useState<MediumTable | null>(null);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [show, setShow] = useState<Show>('active');
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const dq = useDebounced(q, 100);
  const stateKey = JSON.stringify(st.bounds);
  const spec = useMemo(() => L.stateSpec(st), [st]);

  useEffect(() => {
    let alive = true;
    api.medium(model.id, spec).then((t) => { if (alive) { setTable(t); setError(null); } }, (e) => alive && setError(e instanceof ApiError ? e.info : { title: 'Error', message: String(e), hints: [] }));
    return () => { alive = false; };
  }, [model.id, stateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentMedium = (): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(table?.medium ?? {})) if (v != null) m[k] = v;
    return m;
  };

  const run = async (label: string, note: string, call: () => Promise<{ bounds: Record<string, [number | null, number | null]>; notes?: string[] }>) => {
    setBusy(note);
    try {
      const res = await call();
      if (Object.keys(res.bounds).length) lab.applyMediumBounds(res.bounds, label, note);
      setNotes(res.notes ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.info : { title: 'Error', message: String(e), hints: [] });
    } finally {
      setBusy(null);
    }
  };

  const setUptake = (row: MediumRow, v: number | null) => {
    const value = v == null ? 1000 : Math.max(0, v);
    if (value === (row.uptakeMax ?? Infinity)) return;
    const medium = currentMedium();
    if (value > 0) medium[row.reaction] = value; else delete medium[row.reaction];
    const name = row.metaboliteName || row.metabolite || row.reaction;
    run(st.mediumLabel ? `${st.mediumLabel.replace(/ \(edited\)$/, '')} (edited)` : 'Custom', `${name} (${row.reaction}) uptake ${row.uptakeUnbounded ? '∞' : fnum(row.uptakeMax)} → ${fnum(value)}`, () => api.setMedium(model.id, spec, medium));
  };
  const toggle = (row: MediumRow) => setUptake(row, row.inMedium ? 0 : row.originalUptakeMax && row.originalUptakeMax > 0 ? row.originalUptakeMax : 10);
  const preset = (p: string, label: string) => run(label, `Preset: ${label}`, () => api.mediumPreset(model.id, spec, p));
  const custom = (name: string, medium: Record<string, number>) => run(name, `Preset: ${name}`, () => api.setMedium(model.id, spec, medium));

  const rows = useMemo(() => {
    const all = table?.rows ?? [];
    const base = show === 'active' ? all.filter((r) => r.inMedium) : show === 'exchanges' ? all.filter((r) => r.kind === 'exchange') : all;
    if (!dq.trim()) return base;
    const n = normalize(dq);
    return base.filter((r) => normalize(`${r.reaction} ${r.metabolite ?? ''} ${r.metaboliteName} ${r.formula ?? ''} ${r.reactionName}`).includes(n));
  }, [table, show, dq]);

  const cols: Col<MediumRow>[] = [
    { key: 'in', label: 'In', width: 34, sortable: false, align: 'center', render: (r) => <input type="checkbox" checked={r.inMedium} disabled={!!busy || r.kind !== 'exchange'} title={r.kind !== 'exchange' ? `${r.kind} reactions are not part of COBRApy's medium — edit their bounds in the inspector` : r.inMedium ? 'Remove from medium (uptake 0)' : 'Allow uptake'} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r)} /> },
    { key: 'name', label: 'Compound', width: 'minmax(150px, 2fr)', render: (r) => <span className="ellipsis strong" title={r.metaboliteName}>{r.metaboliteName || r.metabolite || '—'}</span> },
    { key: 'formula', label: 'Formula', width: 90, render: (r) => <span className="mono ellipsis">{r.formula ?? ''}</span> },
    { key: 'exchange', label: 'Exchange', width: 'minmax(120px, 1.2fr)', render: (r) => <span className="mono ellipsis">{r.reaction}{r.kind !== 'exchange' && <span className="tag">{r.kind}</span>}</span> },
    { key: 'uptake', label: <span>Max uptake <span className="muted">({FLUX_UNIT})</span></span>, width: 190, align: 'right', render: (r) => (
      r.kind === 'exchange'
        ? <NumberInput className="cell-edit med-in" allowEmpty value={r.uptakeUnbounded ? null : r.uptakeMax} placeholder="∞" onCommit={(v) => setUptake(r, v)} title="Maximum uptake rate; Enter to apply" />
        : <span className="mono">{r.uptakeUnbounded ? '∞' : fnum(r.uptakeMax)}</span>
    ) },
    { key: 'secretion', label: 'Max secretion', width: 100, align: 'right', render: (r) => <span className="mono muted">{r.secretionMax == null ? '∞' : fnum(r.secretionMax)}</span> },
    { key: 'orig', label: 'Model file', width: 110, align: 'right', title: 'Uptake limit in the imported model', render: (r) => {
      const changed = (r.originalUptakeMax ?? -1) !== (r.uptakeMax ?? -1) && !(r.uptakeUnbounded && r.originalUptakeMax == null);
      return <span className={`mono small ${changed ? 'modified' : 'muted'}`}>{changed ? `${fnum(r.originalUptakeMax)} → ${r.uptakeUnbounded ? '∞' : fnum(r.uptakeMax)}` : fnum(r.originalUptakeMax)}</span>;
    } },
  ];

  const active = table?.rows.filter((r) => r.inMedium).length ?? 0;
  return (
    <div className="lab-page">
      <SectionHead title="Medium" sub={<>Uptake limits of exchange reactions, read and written through COBRApy's <span className="mono">model.medium</span>. Applies to state <b>{st.name}</b>{st.mediumLabel ? <> · {st.mediumLabel}</> : null}.</>}>
        <span className="muted small">{active} compounds available</span>
      </SectionHead>
      <div className="medium-presets">
        <span className="muted small">Presets</span>
        <button className="btn small" disabled={!!busy} onClick={() => preset('original', 'Model file medium')} title="Restore the uptake limits from the imported file">Model file</button>
        <button className="btn small" disabled={!!busy} onClick={() => preset('minimal', 'Minimal medium')} title="COBRApy minimal_medium: smallest total uptake that still reaches the current optimum">Minimal</button>
        <button className="btn small" disabled={!!busy} onClick={() => preset('rich', 'Rich medium')} title="Every exchange allows uptake of at least 10 mmol gDW⁻¹ h⁻¹">Rich</button>
        <button className="btn small" disabled={!!busy} onClick={() => preset('anaerobic', 'Anaerobic')} title="Current medium with oxygen uptake closed">Anaerobic</button>
        {presets.map((p) => (
          <span key={p.id} className="preset-chip">
            <button className="btn small" disabled={!!busy} onClick={() => custom(p.name, p.medium)}>{p.name}</button>
            <button className="icon-btn tiny" title="Delete preset" onClick={() => lab.deleteMediumPreset(p.id)}><Icon name="x" size={10} /></button>
          </span>
        ))}
        {naming
          ? <input className="input tiny" autoFocus placeholder="Preset name, Enter to save" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { lab.saveMediumPreset(e.currentTarget.value.trim(), currentMedium()); setNaming(false); } if (e.key === 'Escape') setNaming(false); }} onBlur={() => setNaming(false)} />
          : <button className="link small" onClick={() => setNaming(true)}>＋ Save current as preset</button>}
      </div>
      {notes.length > 0 && <div className="note small">{notes.join(' ')}</div>}
      {busy && <div className="note small">Applying: {busy}…</div>}
      {error && <ErrorCard info={error} onRetry={() => setError(null)} />}
      <div className="ex-toolbar">
        <div className="search-box ex-search"><Icon name="search" size={14} /><input placeholder="Search compound name, metabolite id, exchange id, formula…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Seg value={show} options={['active', 'exchanges', 'boundary'] as const} onChange={setShow} labels={{ active: 'Available only', exchanges: 'All exchanges', boundary: 'All boundary' }} />
      </div>
      <div className="ex-table medium-table">
        {table ? (
          <VirtualTable rows={rows} cols={cols} rowKey={(r) => r.reaction} rowHeight={28}
            onRowClick={(r) => lab.navigate({ kind: 'reaction', id: r.reaction })}
            onContextMenu={(r, e) => useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs: [{ kind: 'reaction', id: r.reaction }] } })}
            empty={show === 'active' ? 'No uptake allowed — the model has no available substrates. Use a preset or switch to “All exchanges”.' : 'No match'} />
        ) : !error && <div className="muted pad">Reading the medium from COBRApy…</div>}
      </div>
    </div>
  );
}
