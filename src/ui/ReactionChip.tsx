import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { equationString } from '../model/currency';
import type { MetabolicModel } from '../model/types';

/**
 * Reaction id chip. Clicking opens an info card *beside* the inspector panel
 * (never on top of the chip list), with the actions to add/select the reaction.
 */
export function ReactionChip({ rid, model, metId, onCanvas, open, onToggle, onAction }: {
  rid: string; model: MetabolicModel; metId?: string; onCanvas: boolean; open: boolean; onToggle: () => void; onAction: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);
  const r = model.reactions[rid];

  useEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const b = ref.current.getBoundingClientRect();
    const panel = ref.current.closest('.panel')?.getBoundingClientRect();
    // card's right edge sits 10px left of the panel; vertically aligned with the chip
    setPos({ right: window.innerWidth - (panel?.left ?? b.left) + 10, top: Math.max(8, Math.min(b.top - 12, window.innerHeight - 260)) });
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, onToggle]);

  if (!r) return null;
  const coef = metId ? r.stoichiometry[metId] : undefined;
  const role = coef == null ? '' : coef < 0 ? (r.reversible ? 'consumes (reversible)' : 'consumes') : r.reversible ? 'produces (reversible)' : 'produces';
  return (
    <>
      <button
        ref={ref}
        className={`chip btn-chip ${onCanvas ? 'on' : ''} ${open ? 'open' : ''} ${coef != null && coef < 0 ? 'out' : 'in'}`}
        title={r.name}
        onClick={onToggle}
      >
        <span className="chip-dir">{coef == null ? '' : coef < 0 ? '↓' : '↑'}</span>{rid}
      </button>
      {open && pos && createPortal(
        <div className="rx-tip" style={{ right: pos.right, top: pos.top }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="rx-tip-head">
            <b className="mono">{rid}</b>{r.reversible && <span className="tag">reversible</span>}{onCanvas && <span className="tag on">on map</span>}
            <span className="grow" />
            <button className="icon-btn tiny" onClick={onToggle} title="Close (Esc)">×</button>
          </div>
          <div className="rx-tip-name">{r.name}</div>
          <div className="rx-tip-eq">{equationString(r, model.metabolites, true)}</div>
          <div className="rx-tip-eq mono muted">{equationString(r, model.metabolites)}</div>
          {role && <div className="small">This metabolite: <b>{role}</b></div>}
          {r.subsystem && <div className="small muted">Subsystem: {r.subsystem}</div>}
          {r.gpr && <div className="small muted mono">GPR: {r.gpr}</div>}
          <div className="small muted">Bounds: {r.lowerBound} → {r.upperBound}{r.ec?.length ? ` · EC ${r.ec.join(', ')}` : ''}</div>
          <button className="btn primary small" onClick={() => { onToggle(); onAction(); }}>{onCanvas ? 'Select on the map' : 'Add to the map'}</button>
        </div>,
        document.body,
      )}
    </>
  );
}
