import { useMemo, useState } from 'react';
import { baseId } from '../model/currency';
import { netValue } from '../data/families';
import { orderedConditionIds } from '../data/order';
import { findRoutes, type Route, type Step } from '../model/graph';

const FLUX_TOL = 1e-9;
import { A, useStore } from '../store/store';
import { Icon } from './icons';

/** Lists alternative model routes between two metabolites, shortest first, and inserts the chosen one. */
export function RoutesPanel({ fromNode, toNode, replaceGlyph, onDone }: { fromNode: string; toNode: string; replaceGlyph?: string; onDone: () => void }) {
  const model = useStore((s) => s.model);
  const doc = useStore((s) => s.doc);
  const [extra, setExtra] = useState(2);
  const [allowCurrency, setAllowCurrency] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const datasets = useStore((s) => s.datasets);
  const conditions = useStore((s) => s.conditions);
  const activeCondition = useStore((s) => s.view.activeCondition);
  // flux filter: only reactions that carry flux in the direction the route uses them
  const fluxDs = datasets.find((d) => d.visible && d.target === 'reaction' && (d.kind === 'flux' || d.kind === 'samples'));
  const [onlyFlux, setOnlyFlux] = useState(true);
  const [fluxCond, setFluxCond] = useState<string>(() => (fluxDs?.columns.includes(activeCondition) ? activeCondition : '*'));
  const fromMet = doc.nodes[fromNode]?.metaboliteId;
  const toMet = doc.nodes[toNode]?.metaboliteId;
  const res = useMemo(() => {
    if (!model || !fromMet || !toMet) return null;
    const t0 = performance.now();
    let allow: ((s: Step) => boolean) | undefined;
    if (fluxDs && onlyFlux) {
      const cols = fluxCond === '*' ? fluxDs.columns.map((_, i) => i) : [fluxDs.columns.indexOf(fluxCond)].filter((i) => i >= 0);
      const carries = new Map<string, boolean>();
      allow = (s) => {
        const k = `${s.reactionId}|${s.reversed}`;
        let v = carries.get(k);
        if (v === undefined) {
          v = cols.some((ci) => { const f = netValue(fluxDs, s.reactionId, ci) ?? 0; return s.reversed ? f < -FLUX_TOL : f > FLUX_TOL; });
          carries.set(k, v);
        }
        return v;
      };
    }
    const r = findRoutes(model, fromMet, toMet, { maxExtra: extra, allowCurrency, limit: 30, allow });
    return { ...r, ms: performance.now() - t0, filtered: !!allow };
  }, [model, fromMet, toMet, extra, allowCurrency, fluxDs, onlyFlux, fluxCond]);
  const condName = (id: string) => conditions.find((c) => c.id === id)?.name ?? id;
  if (!model || !fromMet || !toMet) return <div className="notice">Both ends must be bound to model metabolites.</div>;
  const label = (m: string) => baseId(m);
  const insert = (r: Route, collapse: boolean) => {
    A().applyRoute(fromNode, toNode, r.steps, { replaceGlyph, collapse });
    onDone();
  };
  return (
    <div className="routes">
      <div className="row gap wrap">
        <span className="small"><b className="mono">{fromMet}</b> → <b className="mono">{toMet}</b></span>
        <span className="grow" />
        <label className="small">up to shortest +
          <select className="input tiny" value={extra} onChange={(e) => setExtra(+e.target.value)}>{[0, 1, 2, 3, 4].map((x) => <option key={x} value={x}>{x}</option>)}</select> steps
        </label>
        <label className="check small"><input type="checkbox" checked={allowCurrency} onChange={(e) => setAllowCurrency(e.target.checked)} /> allow cofactors as links</label>
      </div>
      {fluxDs ? (
        <div className="row gap wrap route-flux">
          <label className="check small" title="Every reaction of the route must carry flux in the direction the route uses it">
            <input type="checkbox" checked={onlyFlux} onChange={(e) => setOnlyFlux(e.target.checked)} /> Only routes that carry flux
          </label>
          {onlyFlux && (
            <label className="small">in
              <select className="input tiny" value={fluxCond} onChange={(e) => setFluxCond(e.target.value)}>
                {orderedConditionIds(fluxDs, conditions).map((c) => <option key={c} value={c}>{condName(c)}</option>)}
                <option value="*">any condition (per step)</option>
              </select>
            </label>
          )}
          <span className="muted small">· {fluxDs.name}</span>
        </div>
      ) : (
        <div className="muted small">Import flux data to keep only the routes that carry flux.</div>
      )}
      {res && res.shortest == null && (
        <div className="notice">{res.filtered
          ? <>No route from {fromMet} to {toMet} carries flux{fluxCond === '*' ? '' : <> in <b>{condName(fluxCond)}</b></>}. Try another condition, more steps, cofactors as links — or untick “Only routes that carry flux”.</>
          : <>No directed route from {fromMet} to {toMet} through non-currency metabolites (bounds respected). Try the opposite direction or allow cofactors.</>}</div>
      )}
      {res && res.shortest != null && (
        <div className="muted small">
          {res.filtered ? 'Carrying flux — shortest' : 'Shortest'}: <b>{res.shortest}</b> reaction{res.shortest > 1 ? 's' : ''} · {res.routes.length} route{res.routes.length !== 1 ? 's' : ''} up to {res.shortest + extra} steps{res.truncated ? ' (list truncated: showing the shortest)' : ''} · {res.ms.toFixed(0)} ms
        </div>
      )}
      <div className="route-list">
        {res?.routes.map((r, i) => (
          <div key={i} className={`route ${hover === i ? 'hl' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="route-len">{r.steps.length}</div>
            <div className="route-chain">
              {r.mets.map((m, k) => (
                <span key={k} className="rc-seg">
                  <span className="rc-met" title={model.metabolites[m]?.name}>{label(m)}</span>
                  {k < r.steps.length && (
                    <span className="rc-rxn" title={`${model.reactions[r.steps[k].reactionId]?.name ?? ''}${r.steps[k].reversed ? ' (runs backwards)' : ''}`}>
                      <span className="mono">{r.steps[k].reactionId}{r.steps[k].reversed ? '⁻' : ''}</span>→
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="route-actions">
              <button className="btn small primary" onClick={() => insert(r, false)} title="Draw every reaction and intermediate metabolite">Insert</button>
              {r.steps.length > 1 && <button className="btn small" onClick={() => insert(r, true)} title="Insert as one collapsed arrow (expand later)"><Icon name="group" size={12} /> Collapsed</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="muted small">Currency metabolites (ATP, NAD(P)H, H₂O, H⁺, CO₂, CoA…) are not used as links unless allowed. ⁻ marks a reversible reaction used backwards.</div>
    </div>
  );
}
