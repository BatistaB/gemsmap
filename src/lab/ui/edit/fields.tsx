/** Small building blocks of the structural editor forms. */
import { useState, type ReactNode } from 'react';
import { Icon } from '../../../ui/icons';
import { rem } from '../../../ui/uiScale';
import type { EditReport } from '../../editTypes';
import type { Annotation } from '../../types';

/** Key → value(s) table for annotations (several values: comma-separated) and notes. */
export function KeyValueEditor({ value, onChange, keyHint, multi = true, suggestions = [] }: {
  value: Record<string, string | string[]>; onChange: (v: Annotation) => void; keyHint: string; multi?: boolean; suggestions?: string[];
}) {
  const rows = Object.entries(value);
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const split = (s: string) => { const xs = s.split(',').map((x) => x.trim()).filter(Boolean); return !multi || xs.length <= 1 ? (xs[0] ?? '') : xs; };
  const listId = `kv-${keyHint.replace(/\W/g, '')}`;
  const add = () => { if (!k.trim() || !v.trim()) return; onChange({ ...value, [k.trim()]: split(v) }); setK(''); setV(''); };
  return (
    <div className="kv-edit">
      {rows.map(([key, val]) => (
        <div key={key} className="kv-row">
          <span className="mono small kv-key" title={key}>{key}</span>
          <input className="input tiny" value={Array.isArray(val) ? val.join(', ') : val} onChange={(e) => onChange({ ...value, [key]: split(e.target.value) })} />
          <button className="icon-btn tiny" title="Remove" onClick={() => { const n = { ...value }; delete n[key]; onChange(n); }}><Icon name="x" size={10} /></button>
        </div>
      ))}
      <div className="kv-row add">
        <input className="input tiny kv-key" placeholder={keyHint} value={k} list={suggestions.length ? listId : undefined} onChange={(e) => setK(e.target.value)} />
        <input className="input tiny" placeholder={multi ? 'value (several: comma-separated)' : 'value'} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn tiny" disabled={!k.trim() || !v.trim()} onClick={add}>Add</button>
        {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </div>
    </div>
  );
}

export const ANNOTATION_KEYS_MET = ['metanetx.chemical', 'kegg.compound', 'chebi', 'bigg.metabolite', 'seed.compound', 'metacyc.compound', 'hmdb', 'inchikey', 'sbo'];
export const ANNOTATION_KEYS_RXN = ['ec-code', 'metanetx.reaction', 'rhea', 'kegg.reaction', 'bigg.reaction', 'seed.reaction', 'metacyc.reaction', 'sbo'];

export function Field({ label, children, hint, wide, error }: { label: ReactNode; children: ReactNode; hint?: ReactNode; wide?: boolean; error?: string | null }) {
  return (
    <label className={`ef ${wide ? 'wide' : ''} ${error ? 'bad' : ''}`}>
      <span className="ef-label">{label}</span>
      {children}
      {error ? <span className="ef-err">{error}</span> : hint ? <span className="ef-hint">{hint}</span> : null}
    </label>
  );
}

/** Errors (block saving), warnings and notes from the backend validation. */
export function ReportList({ report, local = [], skipWarn }: { report: EditReport | null; local?: string[]; skipWarn?: (w: string) => boolean }) {
  const errors = [...local, ...(report?.errors ?? [])];
  const warnings = (report?.warnings ?? []).filter((w) => !skipWarn?.(w));
  const info = report?.info ?? [];
  if (!errors.length && !warnings.length && !info.length) return null;
  const strip = (s: string) => s.replace(/^(Reaction|Metabolite|Compartment|Delete reaction|Delete metabolite) [^:]*: /, '');
  return (
    <div className="ed-report">
      {errors.map((e, i) => <div key={'e' + i} className="ed-msg err"><span>✕</span>{strip(e)}</div>)}
      {warnings.map((w, i) => <div key={'w' + i} className="ed-msg warn"><span>⚠</span>{strip(w)}</div>)}
      {info.map((w, i) => <div key={'i' + i} className="ed-msg info"><span>i</span>{strip(w)}</div>)}
    </div>
  );
}

/** Modal frame for editors: closing by clicking outside is disabled (a draft is never lost by a stray click). */
export function EditorModal({ title, onClose, children, width = 720, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  return (
    <div className="modal-backdrop" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="modal lab-modal ed-modal" style={{ width: rem(width) }} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-head"><span>{title}</span><button className="icon-btn" title="Close (Esc)" onClick={onClose}><Icon name="x" size={14} /></button></div>
        <div className="modal-body ed-body">{children}</div>
        {footer && <div className="ed-foot">{footer}</div>}
      </div>
    </div>
  );
}
