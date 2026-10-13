/**
 * Entity search for metabolites, shared by the reaction builder and "+ Metabolite".
 *
 * Model first: what the loaded model already has is listed before anything else, so a compound is
 * not created twice. "Not in model?" searches the databases through the backend (KEGG and ChEBI
 * resolved by MetaNetX, merged with the local BiGG tables — the same search as the Template Builder),
 * with tabs per source. A database hit that shares an identifier with a model metabolite says so;
 * a hit that is not an exact, unambiguous match is marked "Needs review" and must be confirmed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../ui/icons';
import { api } from '../../api';
import { confidence, inModel } from '../../editUtils';
import type { ExternalCompound, PendingMetabolite } from '../../editTypes';
import { useLab } from '../../store';
import { useDebounced } from '../common';

export type Picked = { kind: 'model'; id: string } | { kind: 'pending'; id: string } | { kind: 'import'; compound: ExternalCompound; review: boolean } | { kind: 'create'; name: string };

type Tab = 'model' | 'db';
type DbFilter = 'all' | 'MetaNetX' | 'BiGG' | 'ModelSEED' | 'KEGG/ChEBI';
const FILTERS: DbFilter[] = ['all', 'MetaNetX', 'BiGG', 'ModelSEED', 'KEGG/ChEBI'];
const keep = (f: DbFilter, c: ExternalCompound) => f === 'all' ? true
  : f === 'MetaNetX' ? !!c.identifiers['metanetx.chemical']?.length
    : f === 'BiGG' ? !!c.identifiers['bigg.metabolite']?.length || c.sources.includes('BiGG')
      : f === 'ModelSEED' ? !!c.identifiers['seed.compound']?.length
        : !!(c.identifiers['kegg.compound']?.length || c.identifiers.chebi?.length);

const ID_LABEL: Record<string, string> = { 'metanetx.chemical': 'MetaNetX', 'kegg.compound': 'KEGG', chebi: 'ChEBI', 'bigg.metabolite': 'BiGG', 'seed.compound': 'ModelSEED', 'metacyc.compound': 'MetaCyc', hmdb: 'HMDB' };

export function MetaboliteSearch({ onPick, compartment, pending = [], initial = '', autoFocus = true, onClose }: {
  onPick: (p: Picked) => void; compartment?: string; pending?: PendingMetabolite[]; initial?: string; autoFocus?: boolean; onClose?: () => void;
}) {
  const index = useLab((s) => s.index)!;
  const model = useLab((s) => s.model)!;
  const search = useLab((s) => s.searchIndex)!;
  const [q, setQ] = useState(initial);
  const [tab, setTab] = useState<Tab>('model');
  const [filter, setFilter] = useState<DbFilter>('all');
  const [cursor, setCursor] = useState(0);
  const [db, setDb] = useState<{ q: string; loading: boolean; list: ExternalCompound[]; sources: Record<string, string>; error?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dq = useDebounced(q, 120);

  const local = useMemo(() => {
    const k = dq.trim().toLowerCase();
    const pend = pending.filter((p) => !k || p.id.toLowerCase().includes(k) || p.name.toLowerCase().includes(k));
    const hits = k ? search.search(dq, ['metabolite'], 60) : [];
    const rows = hits.map((h) => index.met.get(h.id)!).filter(Boolean);
    // the reaction's compartment first, then the search ranking
    rows.sort((a, b) => Number(b.compartment === compartment) - Number(a.compartment === compartment));
    return { pend, rows: rows.slice(0, 40) };
  }, [dq, search, index, compartment, pending]);

  const runDb = async (text: string) => {
    if (!text.trim()) return;
    setDb({ q: text, loading: true, list: [], sources: {} });
    try {
      const r = await api.identityCompounds(text.trim(), 12);
      setDb({ q: text, loading: false, list: r.candidates, sources: r.sources });
    } catch (e) {
      setDb({ q: text, loading: false, list: [], sources: {}, error: (e as Error).message });
    }
  };
  const ddq = useDebounced(q, 450);
  useEffect(() => { if (tab === 'db' && ddq.trim() && ddq !== db?.q) runDb(ddq); }, [tab, ddq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setCursor(0), [dq, tab]);

  const modelItems = [...local.pend.map((p) => ({ kind: 'pending' as const, id: p.id })), ...local.rows.map((m) => ({ kind: 'model' as const, id: m.id }))];
  const dbList = (db?.list ?? []).filter((c) => keep(filter, c));
  const choose = (i: number) => {
    if (tab === 'model') { const it = modelItems[i]; if (it) onPick(it); }
    else { const c = dbList[i]; if (c) onPick({ kind: 'import', compound: c, review: confidence(c, db!.list).level === 'review' }); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    const n = tab === 'model' ? modelItems.length : dbList.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(n - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cursor); }
    else if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
    else if (e.key === 'Tab' && !e.shiftKey && q.trim()) { e.preventDefault(); setTab(tab === 'model' ? 'db' : 'model'); }
  };
  const compName = (c: string) => model.compartments[c] ?? c;

  return (
    <div className="ms" onKeyDown={onKey}>
      <div className="ms-top">
        <div className="search-box"><Icon name="search" size={13} />
          <input ref={input} autoFocus={autoFocus} placeholder="Metabolite name, ID, formula, KEGG / ChEBI / MetaNetX / BiGG id…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ms-tabs">
          <button className={tab === 'model' ? 'on' : ''} onClick={() => setTab('model')}>In this model <span className="count">{modelItems.length}</span></button>
          <button className={tab === 'db' ? 'on' : ''} onClick={() => { setTab('db'); if (q.trim() && q !== db?.q) runDb(q); }} title="KEGG and ChEBI resolved through MetaNetX, plus the local BiGG tables">Databases</button>
        </div>
      </div>

      {tab === 'model' && (
        <div className="ms-list">
          {!q.trim() && !local.pend.length && <div className="muted small pad">Type to search the {index.met.size.toLocaleString()} metabolites of the model{compartment ? <> — <b>{compName(compartment)}</b> first</> : null}.</div>}
          {local.pend.length > 0 && <div className="ms-label">New in this edit</div>}
          {local.pend.map((p, i) => (
            <button key={'p' + p.id} className={`ms-row ${cursor === i ? 'on' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => onPick({ kind: 'pending', id: p.id })}>
              <span className="ms-name">{p.name}</span><span className="mono small">{p.id}</span><span className="ms-comp">[{compName(p.compartment)}]</span><span className="tag">new</span>
            </button>
          ))}
          {local.rows.length > 0 && <div className="ms-label">Already in model</div>}
          {local.rows.map((m, j) => {
            const i = local.pend.length + j;
            return (
              <button key={m.id} className={`ms-row ${cursor === i ? 'on' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => onPick({ kind: 'model', id: m.id })}
                title={`${m.id} — ${m.name}${m.formula ? ` · ${m.formula}` : ''} · used by ${m.reactionCount} reactions`}>
                <span className="ms-name">{m.name || m.id}</span><span className="mono small">{m.id}</span>
                <span className={`ms-comp ${m.compartment === compartment ? 'same' : ''}`}>[{compName(m.compartment)}]</span>
                <span className="mono small muted">{m.formula ?? ''}</span>
              </button>
            );
          })}
          {q.trim() && !modelItems.length && <div className="muted small pad">No metabolite of the model matches “{q}”.</div>}
        </div>
      )}

      {tab === 'db' && (
        <div className="ms-list">
          <div className="ms-filters">
            {FILTERS.map((f) => <button key={f} className={`chip-btn ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f}</button>)}
            {db && !db.loading && <span className="muted small ms-src">{Object.entries(db.sources).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>}
          </div>
          {!q.trim() && <div className="muted small pad">Type a compound name or an identifier (C00149, CHEBI:30797, MNXM98, cpd00130).</div>}
          {db?.loading && <div className="muted small pad"><span className="spinner sm" /> Searching KEGG, ChEBI, MetaNetX and BiGG…</div>}
          {db?.error && <div className="note small">Database search unavailable: {db.error}. Is the backend running? You can still create the metabolite by hand.</div>}
          {db && !db.loading && !db.error && q.trim() && !dbList.length && <div className="muted small pad">No database compound for “{db.q}”{filter !== 'all' ? ` with a ${filter} identifier` : ''}.</div>}
          {dbList.map((c, i) => {
            const conf = confidence(c, db!.list);
            const existing = inModel(index, c);
            return (
              <div key={(c.mnx ?? c.name) + i} className={`ms-cand ${cursor === i ? 'on' : ''}`} onMouseEnter={() => setCursor(i)}>
                <div className="row between gap">
                  <b className="ellipsis">{c.name}</b>
                  <span className={`tag ${conf.level === 'confident' ? 'ok' : 'warn'}`} title={conf.why}>{conf.level === 'confident' ? 'Confident' : 'Needs review'}</span>
                </div>
                <div className="small"><span className="mono">{c.formula ?? 'no formula'}</span>{c.charge != null && <> · charge <span className="mono">{c.charge}</span></>} · <span className="muted">{c.match}</span></div>
                <div className="ms-ids">
                  {Object.entries(c.identifiers).filter(([k]) => ID_LABEL[k]).map(([k, v]) => <span key={k} className="ms-id"><span className="muted">{ID_LABEL[k]}</span> <span className="mono">{v.slice(0, 2).join(', ')}{v.length > 2 ? '…' : ''}</span></span>)}
                </div>
                {c.synonyms.length > 0 && <div className="muted small ellipsis" title={c.synonyms.join('; ')}>also: {c.synonyms.slice(0, 5).join('; ')}</div>}
                {existing.length > 0 && (
                  <div className="ms-exist">
                    <span>Already in model as</span>
                    {existing.slice(0, 6).map((id) => <button key={id} className="link mono" onClick={() => onPick({ kind: 'model', id })} title={`Use ${id} (${compName(index.met.get(id)?.compartment ?? '')})`}>{id}</button>)}
                  </div>
                )}
                <div className="row end gap">
                  <button className={`btn small ${existing.length ? '' : 'primary'}`} onClick={() => onPick({ kind: 'import', compound: c, review: conf.level === 'review' })}>
                    {existing.length ? 'Add as a new metabolite…' : 'Add to model…'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="ms-foot">
        {tab === 'model'
          ? <button className="link small" onClick={() => { setTab('db'); if (q.trim()) runDb(q); }}>Not in model? Search external databases →</button>
          : <button className="link small" onClick={() => setTab('model')}>← Back to the model</button>}
        <span className="grow" />
        <button className="btn small" onClick={() => onPick({ kind: 'create', name: q.trim() })}><Icon name="plus" size={11} /> Create new metabolite</button>
      </div>
    </div>
  );
}
