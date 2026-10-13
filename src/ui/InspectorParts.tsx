import { orderedConditionIds } from '../data/order';
import { fmt } from '../data/stats';
import { baseId, isCurrency } from '../model/currency';
import { A, useStore } from '../store/store';
import { glyphFlux, rawValue } from '../viz/evaluate';
import type { Aggregate, PlotType, ReactionGlyph } from '../viz/types';
import { Icon } from './icons';

function Seg<T extends string>({ value, options, onChange, labels }: { value: T; options: T[]; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return <div className="seg">{options.map((o) => <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{labels?.[o] ?? o}</button>)}</div>;
}

export function CondBars({ values, unit }: { values: { cond: string; color: string; v: number | null }[]; unit?: string }) {
  const active = useStore((s) => s.view.activeCondition);
  const conditions = useStore((s) => s.conditions);
  const condName = (id: string) => conditions.find((c) => c.id === id)?.name ?? id;
  const max = Math.max(1e-9, ...values.map((x) => Math.abs(x.v ?? 0)));
  return (
    <div className="cvals">
      {values.map((x) => (
        <button key={x.cond} className={`cval ${x.cond === active ? 'on' : ''}`} onClick={() => A().setView({ activeCondition: x.cond })}>
          <span className="sw" style={{ background: x.color }} />
          <span className="cname ellipsis" title={condName(x.cond)}>{condName(x.cond)}</span>
          <span className="cbar"><span style={{ width: `${(Math.abs(x.v ?? 0) / max) * 100}%`, background: x.color }} /></span>
          <span className="mono">{fmt(x.v)}</span>
        </button>
      ))}
      {unit && <div className="muted small right">{unit}</div>}
    </div>
  );
}

/** Choose which substrates/products of a multi-metabolite reaction are drawn. */
export function ParticipantPicker({ g }: { g: ReactionGlyph }) {
  const model = useStore((s) => s.model)!;
  const doc = useStore((s) => s.doc);
  const r = model.reactions[g.reactionId!];
  const shown = new Set([...g.sources, ...g.targets].map((id) => doc.nodes[id]?.metaboliteId).filter(Boolean) as string[]);
  const entries = Object.entries(r.stoichiometry);
  const drawnSource = (c: number) => (g.reversedToModel ? c > 0 : c < 0);
  const main = entries.filter(([id]) => !isCurrency(model.metabolites[id]));
  const cur = entries.filter(([id]) => isCurrency(model.metabolites[id]));
  const hiddenMain = main.filter(([id]) => !shown.has(id)).length;
  if (main.length <= 2 && !hiddenMain && !cur.length) return null;
  const row = ([id, c]: [string, number]) => (
    <label key={id} className="check part-row" title={model.metabolites[id]?.name}>
      <input type="checkbox" checked={shown.has(id)} onChange={(e) => A().setParticipant(g.id, id, e.target.checked)} />
      <span className="part-text">
        <span className="mono ellipsis">{Math.abs(c) !== 1 ? `${+Math.abs(c).toFixed(3)} ` : ''}{id}</span>
        <span className="muted small ellipsis">{model.metabolites[id]?.name}</span>
      </span>
    </label>
  );
  const side = (src: boolean, list: [string, number][]) => list.filter(([, c]) => drawnSource(c) === src);
  return (
    <div className="section">
      <div className="row between">
        <div className="section-title">Participants shown</div>
        <span className="muted small">{main.length - hiddenMain}/{main.length}{hiddenMain ? ` · ${hiddenMain} hidden` : ''}</span>
      </div>
      <div className="part-cols">
        <div><div className="muted small">Substrates</div>{side(true, main).map(row)}</div>
        <div><div className="muted small">Products</div>{side(false, main).map(row)}</div>
      </div>
      {cur.length > 0 && (
        <details className="adv">
          <summary>Cofactors / currency ({cur.length})</summary>
          <div className="part-cols">
            <div>{side(true, cur).map(row)}</div>
            <div>{side(false, cur).map(row)}</div>
          </div>
        </details>
      )}
      <div className="muted small">Unticking hides the metabolite from this arrow only; the model reaction is unchanged.</div>
    </div>
  );
}

const AGG_HELP: Record<Aggregate, string> = {
  entry: 'Net flux leaving the start metabolite into the hidden segment. Equals the sum for parallel reactions and the through-flux of a chain.',
  sum: 'Sum of all hidden reactions. Right for parallel/alternative reactions; double-counts along a chain.',
  mean: 'Mean of the hidden reactions.',
  min: 'Smallest |flux|: the bottleneck of a chain.',
  max: 'Largest |flux|.',
};

export function CollapsedInspector({ g, plots }: { g: ReactionGlyph; plots: number }) {
  const c = g.collapsed!;
  const model = useStore((s) => s.model);
  const datasets = useStore((s) => s.datasets);
  const conditions = useStore((s) => s.conditions);
  const view = useStore((s) => s.view);
  const doc = useStore((s) => s.doc);
  const a = A();
  const flux = datasets.find((d) => d.target === 'reaction' && d.kind === 'flux' && d.visible) ?? datasets.find((d) => d.target === 'reaction');
  const name = (id: string) => { const n = doc.nodes[id]; return n?.label ?? (n?.metaboliteId ? baseId(n.metaboliteId) : '?'); };
  return (
    <>
      <div className="insp-head">
        <div className="insp-kind">Collapsed arrow · {c.topology}</div>
        <div className="insp-title">{g.label ?? `${c.members.length} reactions`}</div>
        <div className="muted small">{g.sources.map(name).join(' + ')} → {g.targets.map(name).join(' + ')} · {c.hidden.nodes.length} hidden metabolites</div>
        <button className="btn primary small insp-action" onClick={() => a.expandGlyph(g.id)}><Icon name="expandDown" size={13} /> Expand back</button>
      </div>
      <div className="section">
        <div className="section-title">Flux of the arrow</div>
        <Seg value={c.aggregate} options={['entry', 'sum', 'mean', 'min', 'max']} onChange={(v) => a.updateReaction(g.id, { collapsed: { ...c, aggregate: v } })} labels={{ entry: 'net in' }} />
        <div className="muted small">{AGG_HELP[c.aggregate]}</div>
        {flux && (
          <>
            <div className="bignum">{fmt(glyphFlux(flux, g, view.activeCondition))} <span className="muted small">{flux.unit}</span></div>
            <CondBars values={orderedConditionIds(flux, conditions).map((cd) => ({ cond: cd, color: conditions.find((k) => k.id === cd)?.color ?? '#888', v: glyphFlux(flux, g, cd) }))} />
          </>
        )}
      </div>
      <div className="section">
        <div className="section-title">Hidden reactions ({c.members.length})</div>
        <div className="members">
          {c.members.map((m, i) => {
            const v = flux ? rawValue(flux, m.reactionId, view.activeCondition) : null;
            return (
              <div key={m.reactionId + i} className="member" title={model?.reactions[m.reactionId]?.name}>
                <span className="mono">{m.reactionId}</span>
                {m.entry && <span className="tag">entry</span>}
                {m.sign < 0 && <span className="tag warn">reversed</span>}
                <span className="mono grow right">{fmt(v == null ? null : v * m.sign)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Appearance</div>
        <label className="field"><span>Label</span><input className="input" placeholder={`${c.members.length} reactions`} value={g.label ?? ''} onChange={(e) => a.updateReaction(g.id, { label: e.target.value || undefined })} /></label>
        <label className="field"><span>Routing</span><Seg value={g.routing} options={['straight', 'curved', 'orthogonal']} onChange={(v) => a.updateReaction(g.id, { routing: v, bend: undefined })} /></label>
        <label className="check"><input type="checkbox" checked={c.showBadge} onChange={(e) => a.updateReaction(g.id, { collapsed: { ...c, showBadge: e.target.checked } })} /> Show the reaction-count badge (exported)</label>
        <div className="row gap wrap">
          {(['density', 'bar', 'line', 'heatmap'] as PlotType[]).map((t) => <button key={t} className="btn small" onClick={() => a.addPlot({ kind: 'reaction', id: g.id }, t)}>+ {t}</button>)}
          <span className="muted small">{plots} linked</span>
        </div>
      </div>
    </>
  );
}
