import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../ui/icons';
import { rem } from '../../ui/uiScale';
import { fnum, STATUS_LABEL } from '../format';
import { lab, refKey, useLab } from '../store';
import type { ApiErrorInfo, EntityRef, LabReaction, SolverStatus } from '../types';

export function Seg<T extends string>({ value, options, onChange, labels, titles }: { value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Partial<Record<T, ReactNode>>; titles?: Partial<Record<T, string>> }) {
  return (
    <div className="seg">
      {options.map((o) => <button key={o} type="button" className={value === o ? 'on' : ''} title={titles?.[o]} onClick={() => onChange(o)}>{labels?.[o] ?? o}</button>)}
    </div>
  );
}

export function Toggle({ checked, onChange, children, title }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <label className={`lab-toggle ${checked ? 'on' : ''}`} title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="lab-toggle-box" />
      <span>{children}</span>
    </label>
  );
}

export function InfoTip({ text, children }: { text: string; children?: ReactNode }) {
  return <span className="infotip" title={text} tabIndex={0}>{children ?? 'ⓘ'}</span>;
}

export function StatusPill({ status }: { status: SolverStatus }) {
  return <span className={`status-pill s-${status}`}><i />{STATUS_LABEL[status] ?? status}</span>;
}

export function ErrorCard({ info, onRetry, title }: { info: ApiErrorInfo; onRetry?: () => void; title?: string }) {
  return (
    <div className="error-card">
      <div className="ec-title">{title ?? info.title}</div>
      {info.message && <div className="ec-msg">{info.message}</div>}
      {info.hints?.length > 0 && (
        <div className="ec-hints">
          <div className="muted small">Check:</div>
          <ul>{info.hints.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      )}
      <div className="row gap">
        {onRetry && <button className="btn small" onClick={onRetry}>Try again</button>}
        {info.detail != null && (
          <details className="ec-details">
            <summary>Show details</summary>
            <pre>{typeof info.detail === 'string' ? info.detail : JSON.stringify(info.detail, null, 1)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

/** Clickable model entity: navigates the inspector; right-click opens the contextual menu. */
export function ELink({ r, children, className, title }: { r: EntityRef; children?: ReactNode; className?: string; title?: string }) {
  return (
    <button type="button" className={`elink k-${r.kind} ${className ?? ''}`} title={title ?? r.id}
      onClick={(e) => { e.stopPropagation(); lab.navigate(r); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs: [r] } }); }}>
      {children ?? r.id}
    </button>
  );
}

export function Star({ r, size = 14 }: { r: EntityRef; size?: number }) {
  const on = useLab((s) => s.favorites.includes(refKey(r)));
  return (
    <button type="button" className={`star ${on ? 'on' : ''}`} title={on ? 'Remove from favorites' : 'Add to favorites'} onClick={(e) => { e.stopPropagation(); lab.toggleFavorite(r); }}>
      <svg width={rem(size)} height={rem(size)} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
    </button>
  );
}

export function KindBadge({ kind }: { kind: EntityRef['kind'] }) {
  return <span className={`kind k-${kind}`}>{kind === 'subsystem' ? 'S' : kind[0].toUpperCase()}</span>;
}

/** Equation with clickable metabolites (names or ids). */
export function Equation({ r, names = true }: { r: LabReaction; names?: boolean }) {
  const index = useLab((s) => s.index);
  const side = (sign: 1 | -1) => Object.entries(r.stoichiometry).filter(([, c]) => c * sign > 0);
  const part = (list: [string, number][]) => list.length === 0 ? <span className="muted">∅</span> : list.map(([id, c], i) => (
    <span key={id} className="eq-term">
      {i > 0 && <span className="eq-plus"> + </span>}
      {Math.abs(c) !== 1 && <span className="eq-coef">{fnum(Math.abs(c), 3)} </span>}
      <ELink r={{ kind: 'metabolite', id }} title={`${id} — ${index?.met.get(id)?.name ?? ''}`}>{names ? index?.met.get(id)?.name || id : id}</ELink>
    </span>
  ));
  return (
    <div className="eq">
      {part(side(-1))}
      <span className="eq-arrow">{r.reversible ? ' ⇌ ' : r.lb != null && r.lb < 0 && (r.ub ?? 1) <= 0 ? ' ← ' : ' → '}</span>
      {part(side(1))}
    </div>
  );
}

/** Flux bar: magnitude relative to `max`, coloured by sign. */
export function FluxBar({ v, max }: { v: number | null | undefined; max: number }) {
  if (v == null) return null;
  const w = max > 0 ? Math.min(1, Math.abs(v) / max) : 0;
  return <span className={`fluxbar ${v < 0 ? 'neg' : 'pos'}`}><span style={{ width: `${w * 100}%` }} /></span>;
}

/** FVA interval drawn on a shared domain [lo, hi]. */
export function RangeBar({ min, max, lo, hi }: { min: number | null; max: number | null; lo: number; hi: number }) {
  if (min == null || max == null || hi <= lo) return <span className="muted">—</span>;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = lo < 0 && hi > 0 ? x(0) : null;
  return (
    <span className="rangebar" title={`${fnum(min)} … ${fnum(max)}`}>
      {zero != null && <i className="rb-zero" style={{ left: `${zero}%` }} />}
      <span className="rb-span" style={{ left: `${x(min)}%`, width: `${Math.max(0.8, x(max) - x(min))}%` }} />
    </span>
  );
}

export function useDebounced<T>(v: T, ms = 120): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', h); window.removeEventListener('keydown', k); };
  }, [open, close]);
  return ref;
}

/** Small popover anchored under a trigger button. */
export function Popover({ trigger, children, align = 'left', className }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div className="pop-wrap" ref={ref}>
      {trigger(open, () => setOpen(!open))}
      {open && <div className={`popover ${align} ${className ?? ''}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function NumberInput({ value, onCommit, placeholder, className, allowEmpty, title, autoFocus }: { value: number | null; onCommit: (v: number | null) => void; placeholder?: string; className?: string; allowEmpty?: boolean; title?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  const commit = () => {
    const t = text.trim().replace('−', '-');
    if (t === '' || /^[-+]?(inf|∞)$/i.test(t)) { if (allowEmpty) onCommit(null); else setText(value == null ? '' : String(value)); return; }
    const v = Number(t);
    if (Number.isFinite(v)) onCommit(v); else setText(value == null ? '' : String(value));
  };
  return <input className={`input num-in ${className ?? ''}`} value={text} placeholder={placeholder} title={title} autoFocus={autoFocus}
    onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(value == null ? '' : String(value)); (e.target as HTMLInputElement).blur(); } }} />;
}

export function SectionHead({ title, children, sub }: { title: ReactNode; children?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="lab-sec-head">
      <div><div className="lab-sec-title">{title}</div>{sub && <div className="muted small">{sub}</div>}</div>
      <div className="row gap">{children}</div>
    </div>
  );
}

export function IconButton({ icon, title, onClick, on, disabled, size = 14 }: { icon: string; title: string; onClick: () => void; on?: boolean; disabled?: boolean; size?: number }) {
  return <button type="button" className={`icon-btn ${on ? 'on' : ''}`} title={title} onClick={onClick} disabled={disabled}><Icon name={icon} size={size} /></button>;
}
