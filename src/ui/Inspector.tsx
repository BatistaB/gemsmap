import { SectionsBar, useCollapsibleSections } from './Collapsible';
import { orderedColumns, orderedConditionIds } from '../data/order';
import { netRange, netValue } from '../data/families';
import { useState } from 'react';
import { fmt } from '../data/stats';
import { equationString, isCurrency } from '../model/currency';
import { metaboliteIndex } from '../model/graph';
import { A, parseKey, useStore } from '../store/store';
import { glyphFlux, rawValue } from '../viz/evaluate';
import { THEMES } from '../viz/presets';
import type { LabelMode, LabelPos, NodeGlyph, PathwayGroup, PlotGlyph, PlotType, ReactionGlyph, StylePresetId, TextGlyph } from '../viz/types';
import { Icon } from './icons';
import { CollapsedInspector, ParticipantPicker } from './InspectorParts';
import { InspectInModelButton } from '../lab/ui/MapLink';
import { ReactionChip } from './ReactionChip';
import { TemplateSlotSection } from './TemplateMapping';
import { ResizeHandle, usePanelWidth } from './Resizer';

export function Inspector() {
  const pw = usePanelWidth('map-right', 288, 220, 640);
  const folds = useCollapsibleSections('map-inspector');
  const open = useStore((s) => s.rightOpen);
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  if (!open) return null;
  let body: JSX.Element;
  if (selection.length === 1) {
    const [kind, id] = parseKey(selection[0]);
    if (kind === 'node' && doc.nodes[id]) body = <NodeInspector n={doc.nodes[id]} />;
    else if (kind === 'reaction' && doc.reactions[id]) body = <ReactionInspector g={doc.reactions[id]} />;
    else if (kind === 'plot' && doc.plots[id]) body = <PlotInspector p={doc.plots[id]} />;
    else if (kind === 'text' && doc.texts[id]) body = <TextInspector t={doc.texts[id]} />;
    else if (kind === 'group' && doc.groups[id]) body = <GroupInspector g={doc.groups[id]} />;
    else if (kind === 'legend') body = <LegendInspector />;
    else body = <DocumentInspector />;
  } else if (selection.length > 1) body = <MultiInspector />;
  else body = <DocumentInspector />;
  return <aside className="panel right" style={{ width: pw.css }}><ResizeHandle panel={pw} edge="left" /><SectionsBar api={folds} /><div className="panel-scroll" ref={folds.ref}>{body}</div></aside>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function Seg<T extends string>({ value, options, onChange, labels }: { value: T; options: T[]; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return <div className="seg">{options.map((o) => <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{labels?.[o] ?? o}</button>)}</div>;
}
function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return <div className="kv"><span>{k}</span><span className={mono ? 'mono' : ''}>{v ?? '—'}</span></div>;
}

function ConditionValues({ values, unit }: { values: { cond: string; color: string; v: number | null }[]; unit?: string }) {
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

function NodeInspector({ n }: { n: NodeGlyph }) {
  const model = useStore((s) => s.model);
  const datasets = useStore((s) => s.datasets);
  const conditions = useStore((s) => s.conditions);
  const doc = useStore((s) => s.doc);
  const style = useStore((s) => s.style);
  const a = A();
  const m = n.metaboliteId ? model?.metabolites[n.metaboliteId] : undefined;
  const connected = m && model ? (metaboliteIndex(model).get(m.id) ?? []) : [];
  const [showAll, setShowAll] = useState(false);
  const [openRid, setOpenRid] = useState<string | null>(null);
  const hideZero = useStore((s) => s.hideZeroReactions);
  // flux data for the "hide zero-flux reactions" filter (first visible reaction flux / sampling dataset)
  const fluxDs = datasets.find((d) => d.visible && d.target === 'reaction' && (d.kind === 'flux' || d.kind === 'samples'));
  const isZero = (rid: string) => !fluxDs || fluxDs.columns.every((_, ci) => Math.abs(netValue(fluxDs, rid, ci) ?? 0) < 1e-9);
  const shown = fluxDs && hideZero ? connected.filter((rid) => !isZero(rid)) : connected;
  const onCanvasRxn = new Map<string, string>();
  for (const g of Object.values(doc.reactions)) {
    for (const rid of [g.reactionId, ...(g.lumped ?? []), ...(g.collapsed?.members.map((x) => x.reactionId) ?? [])]) if (rid) onCanvasRxn.set(rid, g.id);
  }
  return (
    <>
      <div className="insp-head">
        <div className="insp-kind">{m ? 'Metabolite' : 'Template slot'}</div>
        <div className="insp-title">{m?.name ?? n.label ?? 'Unbound slot'}</div>
        {m && <InspectInModelButton r={{ kind: 'metabolite', id: m.id }} />}
        {m && <div className="mono muted">{m.id}</div>}
      </div>
      {n.template && <TemplateSlotSection n={n} />}
      {!m && !n.template && (
        <div className="section">
          <div className="muted small">This slot isn't bound to a model metabolite. {n.hints?.length ? <>Hints: <span className="mono">{n.hints.slice(0, 4).join(', ')}</span></> : null}</div>
          {model && <button className="btn primary small" onClick={() => useStore.setState({ dialog: { kind: 'metabolite', at: n, bindNodeId: n.id } })}><Icon name="link" size={13} /> Bind to metabolite…</button>}
        </div>
      )}
      {m && (
        <div className="section">
          <div className="section-title">Details</div>
          <KV k="Formula" v={m.formula} mono />
          <KV k="Charge" v={m.charge} />
          <KV k="Compartment" v={model?.compartments[m.compartment] ?? m.compartment} />
          {isCurrency(m) && <div className="tag">currency metabolite</div>}
        </div>
      )}
      {m && datasets.filter((d) => d.target === 'metabolite').map((d) => (
        <div className="section" key={d.id}>
          <div className="section-title">{d.name}</div>
          <ConditionValues unit={d.unit} values={orderedConditionIds(d, conditions).map((c) => ({ cond: c, color: conditions.find((k) => k.id === c)?.color ?? '#888', v: rawValue(d, m.id, c) }))} />
        </div>
      ))}
      <div className="section">
        <div className="section-title">Appearance</div>
        <LabelControl mode={n.labelMode} custom={n.label} idText={n.metaboliteId ?? n.label ?? '—'} nameText={m?.name ?? '—'} globalText={style.metaboliteLabel}
          onMode={(v) => a.updateNode(n.id, { labelMode: v, label: v === 'custom' && !n.label ? (m?.name ?? n.metaboliteId) : n.label })}
          onCustom={(v) => a.updateNode(n.id, { label: v || undefined, labelMode: 'custom' })} />
        <Field label="Label position"><Seg value={(n.labelPos ?? 'right') as LabelPos} options={['left', 'top', 'right', 'bottom', 'none']} onChange={(v) => a.updateNode(n.id, { labelPos: v })} labels={{ left: '←', top: '↑', right: '→', bottom: '↓', none: '∅' }} /></Field>
        <Field label="Radius"><input className="input" type="number" min={1} value={n.r ?? style.nodeRadius} onChange={(e) => a.updateNode(n.id, { r: +e.target.value })} /></Field>
        <Field label="Style"><Seg value={n.shape === 'label' ? 'text' : (n.role ?? 'normal')} options={['normal', 'exchange', 'text']} onChange={(v) => a.updateNode(n.id, v === 'text' ? { shape: 'label', role: 'normal' } : { shape: 'circle', role: v as 'normal' | 'exchange' })} labels={{ text: 'text only' }} /></Field>
        <Field label="Fill"><input type="color" value={n.fill ?? '#111111'} onChange={(e) => a.updateNode(n.id, { fill: e.target.value })} /> {n.fill && <button className="link" onClick={() => a.updateNode(n.id, { fill: undefined })}>reset</button>}</Field>
        <label className="check"><input type="checkbox" checked={!!n.locked} onChange={(e) => a.updateNode(n.id, { locked: e.target.checked })} /> Locked</label>
      </div>
      {m && (
        <div className="section">
          <div className="section-title">Connected reactions ({shown.length === connected.length ? connected.length : `${shown.length} of ${connected.length}`})</div>
          <div className="muted small">↓ consumes · ↑ produces · click a reaction for details</div>
          {fluxDs && (
            <label className="check small" title={`Hide reactions whose flux is zero (or missing) in every condition of “${fluxDs.name}”`}>
              <input type="checkbox" checked={hideZero} onChange={(e) => useStore.setState({ hideZeroReactions: e.target.checked })} /> Hide zero-flux reactions
            </label>
          )}
          <div className="chips">
            {shown.slice(0, showAll ? undefined : 48).map((rid) => (
              <ReactionChip key={rid} rid={rid} model={model!} metId={m.id} onCanvas={onCanvasRxn.has(rid)}
                open={openRid === rid} onToggle={() => setOpenRid((o) => (o === rid ? null : rid))}
                onAction={() => (onCanvasRxn.has(rid) ? useStore.setState({ selection: [`reaction:${onCanvasRxn.get(rid)}`] }) : a.addConnectedReaction(n.id, rid))} />
            ))}
            {!showAll && shown.length > 48 && <button className="link small" onClick={() => setShowAll(true)}>+{shown.length - 48} more</button>}
            {!shown.length && connected.length > 0 && <div className="muted small">All {connected.length} reactions carry zero flux.</div>}
          </div>
          <div className="row gap">
            <button className="btn small" onClick={() => a.expandNode(n.id, 'up', 1)}><Icon name="expandUp" size={13} /> Upstream</button>
            <button className="btn small" onClick={() => a.expandNode(n.id, 'down', 1)}><Icon name="expandDown" size={13} /> Downstream</button>
          </div>
        </div>
      )}
    </>
  );
}

function ReactionInspector({ g }: { g: ReactionGlyph }) {
  const model = useStore((s) => s.model);
  const datasets = useStore((s) => s.datasets);
  const conditions = useStore((s) => s.conditions);
  const view = useStore((s) => s.view);
  const doc = useStore((s) => s.doc);
  const a = A();
  const r = g.reactionId ? model?.reactions[g.reactionId] : undefined;
  const flux = datasets.find((d) => d.target === 'reaction' && d.kind === 'flux' && d.visible) ?? datasets.find((d) => d.target === 'reaction');
  const cur = flux ? glyphFlux(flux, g, view.activeCondition) : null;
  const plots = Object.values(doc.plots).filter((p) => p.anchor.id === g.id);
  const srcMet = doc.nodes[g.sources[0]]?.metaboliteId, tgtMet = doc.nodes[g.targets[0]]?.metaboliteId;
  const canRoute = !!model && !!srcMet && !!tgtMet && !!model.metabolites[srcMet] && !!model.metabolites[tgtMet];
  const openRoutes = () => useStore.setState({ dialog: { kind: 'routes', from: g.sources[0], to: g.targets[0], replaceGlyph: g.id } });
  const duplicates = g.reactionId ? Object.values(doc.reactions).filter((o) => o.id !== g.id && o.reactionId === g.reactionId && !o.collapsed).length : 0;
  if (g.collapsed) return <CollapsedInspector g={g} plots={plots.length} />;
  return (
    <>
      <div className="insp-head">
        <div className="insp-kind">Reaction{g.lumped ? ' (lumped)' : ''}</div>
        <div className="insp-title">{g.lumped ? g.lumped.join(' + ') : g.reactionId ?? g.label ?? 'Free arrow'}</div>
        {r && <div className="muted">{r.name}</div>}
        {r && <InspectInModelButton r={{ kind: 'reaction', id: r.id }} />}
      </div>
      {r && model && (
        <div className="section">
          <div className="section-title">Equation</div>
          <div className="eq mono">{equationString(r, model.metabolites)}</div>
          {g.reversedToModel && <div className="tag warn">drawn opposite to model direction — flux sign flipped for display</div>}
        </div>
      )}
      {!r && (
        <div className="section small">
          <div className="muted">Not bound to a model reaction.{g.hints?.length ? <> Hints: <span className="mono">{g.hints.join(', ')}</span></> : null}</div>
          {canRoute
            ? <button className="btn primary small" onClick={openRoutes}><Icon name="path" size={13} /> Find routes {srcMet} → {tgtMet} in the model…</button>
            : model && <div className="muted">Bind both endpoints to metabolites to search routes or auto-bind.</div>}
        </div>
      )}
      {duplicates > 0 && (
        <div className="section callout small">
          <div><b>{duplicates + 1}</b> arrows draw {g.reactionId}.</div>
          <button className="btn small" onClick={() => a.mergeDuplicates(g.reactionId!)}>Merge into one arrow</button>
        </div>
      )}
      {r && model && !g.lumped && <ParticipantPicker g={g} />}
      {flux && r && (
        <div className="section">
          <div className="section-title">Flux · {conditions.find((c) => c.id === view.activeCondition)?.name ?? view.activeCondition}</div>
          <div className="bignum">{fmt(cur)} <span className="muted small">{flux.unit}</span></div>
          <ConditionValues values={orderedConditionIds(flux, conditions).map((c) => ({ cond: c, color: conditions.find((k) => k.id === c)?.color ?? '#888', v: glyphFlux(flux, g, c) }))} />
          {datasets.filter((d) => d.kind === 'fva' && d.columns.some((_, i) => netRange(d, r.id, i))).map((d) => (
            <div key={d.id} className="small">FVA ({d.name}): {orderedColumns(d, conditions).map((i) => { const c = d.columns[i]; const x = netRange(d, r.id, i); return x ? `${c} [${fmt(x[0])}, ${fmt(x[1])}]` : null; }).filter(Boolean).join(' · ')}</div>
          ))}
        </div>
      )}
      {r && (
        <div className="section">
          <div className="section-title">Details</div>
          <KV k="Bounds" v={`${r.lowerBound} → ${r.upperBound}`} mono />
          <KV k="Genes" v={r.gpr} mono />
          <KV k="Subsystem" v={r.subsystem} />
          {r.ec && <KV k="EC" v={r.ec.join(', ')} mono />}
        </div>
      )}
      <div className="section">
        <div className="section-title">Appearance</div>
        <LabelControl mode={g.labelMode} custom={g.label} idText={g.lumped?.join(' + ') ?? g.reactionId ?? '—'} nameText={r?.name ?? '—'} globalText={useStore.getState().style.reactionLabel}
          onMode={(v) => a.updateReaction(g.id, { labelMode: v, label: v === 'custom' && !g.label ? (r?.name ?? g.reactionId) : g.label })}
          onCustom={(v) => a.updateReaction(g.id, { label: v || undefined, labelMode: 'custom' })} />
        <Field label="Routing"><Seg value={g.routing} options={['straight', 'curved', 'orthogonal']} onChange={(v) => a.updateReaction(g.id, { routing: v, bend: undefined })} /></Field>
        {g.routing === 'curved' && <Field label="Curvature"><input type="range" min={-80} max={80} value={g.bend ?? 0} onChange={(e) => a.updateReaction(g.id, { bend: +e.target.value })} /></Field>}
        <Field label="Line"><Seg value={g.role ?? 'normal'} options={['normal', 'exchange']} onChange={(v) => a.updateReaction(g.id, { role: v })} labels={{ normal: 'solid', exchange: 'dashed' }} /></Field>
        <div className="row gap">
          <button className="btn small" onClick={() => a.reverseReaction(g.id)}><Icon name="swap" size={13} /> Reverse</button>
          <button className="btn small" onClick={() => a.updateReaction(g.id, { labelFlip: !g.labelFlip, labelOffset: undefined, labelAngle: undefined })}>Flip label</button>
          {(g.labelOffset || g.labelAngle) && <button className="btn small" onClick={() => a.updateReaction(g.id, { labelOffset: undefined, labelAngle: undefined })}>Auto label position</button>}
        </div>
      </div>
      {r && canRoute && (
        <div className="section">
          <div className="section-title">Routes</div>
          <button className="btn small" onClick={openRoutes}><Icon name="path" size={13} /> Alternative routes {srcMet} → {tgtMet}…</button>
        </div>
      )}
      <div className="section">
        <div className="section-title">Linked plots ({plots.length})</div>
        <div className="row gap wrap">
          {(['density', 'bar', 'line', 'heatmap', 'box', 'range'] as PlotType[]).map((t) => <button key={t} className="btn small" onClick={() => a.addPlot({ kind: 'reaction', id: g.id }, t)}>+ {t}</button>)}
        </div>
      </div>
    </>
  );
}

function PlotInspector({ p }: { p: PlotGlyph }) {
  const datasets = useStore((s) => s.datasets);
  const a = A();
  return (
    <>
      <div className="insp-head"><div className="insp-kind">Mini-plot</div><div className="insp-title">{p.type}</div><div className="muted small">linked to {p.anchor.kind} — moves with it</div></div>
      <div className="section">
        <Field label="Type"><select className="input" value={p.type} onChange={(e) => a.updatePlot(p.id, { type: e.target.value as PlotType })}>{['density', 'bar', 'line', 'heatmap', 'box', 'range'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Dataset"><select className="input" value={p.datasetId ?? ''} onChange={(e) => a.updatePlot(p.id, { datasetId: e.target.value || undefined })}><option value="">auto (best match)</option>{datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.kind})</option>)}</select></Field>
        <Field label="Title"><input className="input" placeholder="auto: substrate → product" value={p.title ?? ''} onChange={(e) => a.updatePlot(p.id, { title: e.target.value || undefined })} /></Field>
        <Field label="Font size"><input type="range" min={4} max={16} step={0.5} value={p.fontSize ?? 7} onChange={(e) => a.updatePlot(p.id, { fontSize: +e.target.value })} /><span className="mono small">{p.fontSize ?? 7}</span></Field>
        <div className="muted small">Drag the handles on the selected plot to resize it (Shift on a corner keeps the proportions).</div>
        <div className="row gap">
          <Field label="W"><input className="input" type="number" value={p.w} onChange={(e) => a.updatePlot(p.id, { w: Math.max(40, +e.target.value) })} /></Field>
          <Field label="H"><input className="input" type="number" value={p.h} onChange={(e) => a.updatePlot(p.id, { h: Math.max(30, +e.target.value) })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={p.showConnector} onChange={(e) => a.updatePlot(p.id, { showConnector: e.target.checked })} /> Connector line</label>
        <label className="check"><input type="checkbox" checked={p.showAxis} onChange={(e) => a.updatePlot(p.id, { showAxis: e.target.checked })} /> Axis</label>
        <label className="check"><input type="checkbox" checked={!!p.locked} onChange={(e) => a.updatePlot(p.id, { locked: e.target.checked })} /> Locked</label>
      </div>
    </>
  );
}

export function TextInspector({ t }: { t: TextGlyph }) {
  const a = A();
  return (
    <>
      <div className="insp-head"><div className="insp-kind">{t.kind === 'panel' ? 'Panel label' : 'Text'}</div></div>
      <div className="section">
        <Field label="Text"><textarea className="input" value={t.text} onChange={(e) => a.updateText(t.id, { text: e.target.value })} /></Field>
        <div className="row gap">
          <Field label="Size"><input className="input" type="number" value={t.size} onChange={(e) => a.updateText(t.id, { size: +e.target.value })} /></Field>
          <Field label="Weight"><select className="input" value={t.weight} onChange={(e) => a.updateText(t.id, { weight: +e.target.value as TextGlyph['weight'] })}>{[400, 500, 600, 700].map((w) => <option key={w}>{w}</option>)}</select></Field>
        </div>
        <label className="check"><input type="checkbox" checked={!!t.italic} onChange={(e) => a.updateText(t.id, { italic: e.target.checked })} /> Italic</label>
        <Field label="Colour"><input type="color" value={t.color ?? '#111111'} onChange={(e) => a.updateText(t.id, { color: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={!!t.locked} onChange={(e) => a.updateText(t.id, { locked: e.target.checked })} /> Locked</label>
      </div>
    </>
  );
}

export function GroupInspector({ g }: { g: PathwayGroup }) {
  const a = A();
  return (
    <>
      <div className="insp-head"><div className="insp-kind">{g.kind === 'compartment' ? 'Compartment' : 'Pathway group'}</div><div className="insp-title">{g.title}</div><div className="muted small">{g.nodeIds.length} metabolites</div></div>
      <div className="section">
        <Field label="Title"><input className="input" value={g.title} onChange={(e) => a.updateGroup(g.id, { title: e.target.value })} /></Field>
        <Field label="Subtitle"><input className="input" value={g.subtitle ?? ''} onChange={(e) => a.updateGroup(g.id, { subtitle: e.target.value || undefined })} /></Field>
        <Field label="Kind"><Seg value={g.kind} options={['pathway', 'compartment']} onChange={(v) => a.updateGroup(g.id, { kind: v })} /></Field>
        <Field label="Background"><input type="color" value={g.fill === 'none' ? '#ffffff' : g.fill} onChange={(e) => a.updateGroup(g.id, { fill: e.target.value })} /> <button className="link" onClick={() => a.updateGroup(g.id, { fill: 'none' })}>none</button></Field>
        <Field label="Border"><input type="color" value={g.stroke === 'none' ? '#cccccc' : g.stroke} onChange={(e) => a.updateGroup(g.id, { stroke: e.target.value })} /> <button className="link" onClick={() => a.updateGroup(g.id, { stroke: 'none' })}>none</button></Field>
        <Field label="Padding"><input className="input" type="number" value={g.padding} onChange={(e) => a.updateGroup(g.id, { padding: +e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={g.dashed} onChange={(e) => a.updateGroup(g.id, { dashed: e.target.checked })} /> Dashed boundary</label>
        <label className="check"><input type="checkbox" checked={!!g.hidden} onChange={(e) => a.updateGroup(g.id, { hidden: e.target.checked })} /> Hidden</label>
        <label className="check" title="Clicks and box selection go through to the reactions inside. Hold 3 s or right-click to unlock."><input type="checkbox" checked={!!g.locked} onChange={(e) => a.updateGroup(g.id, { locked: e.target.checked })} /> Locked (select what is inside)</label>
        <button className="btn small" onClick={() => a.ungroup()}>Ungroup</button>
      </div>
    </>
  );
}

function LegendInspector() {
  const legend = useStore((s) => s.doc.legend);
  return (
    <>
      <div className="insp-head"><div className="insp-kind">Legend</div><div className="muted small">Generated from the active mappings.</div></div>
      <div className="section">
        <label className="check"><input type="checkbox" checked={legend.visible} onChange={(e) => A().commit((s) => ({ doc: { ...s.doc, legend: { ...s.doc.legend, visible: e.target.checked } } }))} /> Show legend</label>
        <Field label={`Size ${Math.round((legend.scale ?? 1) * 100)}%`}>
          <input type="range" min={40} max={300} step={5} value={Math.round((legend.scale ?? 1) * 100)} onChange={(e) => A().commit((s) => ({ doc: { ...s.doc, legend: { ...s.doc.legend, scale: +e.target.value / 100 } } }))} />
        </Field>
        <div className="muted small">Or drag a corner of the selected legend.</div>
      </div>
    </>
  );
}

export function MultiInspector() {
  const selection = useStore((s) => s.selection);
  const spacing = useStore((s) => s.layoutSpacing);
  const a = A();
  const nodes = a.selectedNodeIds();
  const rx = a.selectedIds('reaction');
  return (
    <>
      <div className="insp-head"><div className="insp-kind">Selection</div><div className="insp-title">{selection.length} items</div><div className="muted small">{nodes.length} metabolites · {rx.length} reactions</div></div>
      <div className="section">
        <div className="section-title">Layout</div>
        <Field label="Spacing"><input type="range" min={30} max={160} step={10} value={spacing} onChange={(e) => useStore.setState({ layoutSpacing: +e.target.value })} /><span className="mono small">{spacing}</span></Field>
        <div className="layout-grid">
          {([['vertical', 'Vertical'], ['horizontal', 'Horizontal'], ['circle', 'Circle'], ['hierarchical', 'Hierarchy'], ['grid', 'Grid'], ['organic', 'Organic']] as const).map(([k, l]) => (
            <button key={k} className="btn small" onClick={() => a.layoutSelection(k)}><Icon name={k === 'hierarchical' ? 'hier' : k === 'grid' ? 'gridLayout' : k} size={14} /> {l}</button>
          ))}
        </div>
        <details className="adv"><summary>Circle options</summary>
          <div className="row gap wrap">
            <button className="btn small" onClick={() => a.layoutSelection('circle', { clockwise: true })}>Clockwise</button>
            <button className="btn small" onClick={() => a.layoutSelection('circle', { clockwise: false })}>Counter-clockwise</button>
            <button className="btn small" onClick={() => a.layoutSelection('circle', { startAngle: 0 })}>Start east</button>
            <button className="btn small" onClick={() => a.layoutSelection('circle', { radius: 120 })}>Ø 240</button>
          </div>
        </details>
        <button className="btn small block" onClick={() => a.tidySelection()}><Icon name="tidy" size={14} /> Tidy selection</button>
        <button className="btn small block" title="Hide the selected arrows (or everything drawn between 2 selected metabolites) inside one summary arrow" onClick={() => a.collapseSelection()}><Icon name="group" size={14} /> Collapse into one arrow</button>
      </div>
      {nodes.length > 0 && (
        <div className="section">
          <div className="section-title">Metabolite labels</div>
          <div className="seg">{(['global', 'id', 'name'] as const).map((o) => <button key={o} onClick={() => a.updateNodes(nodes, { labelMode: o === 'global' ? undefined : o })}>{o === 'global' ? 'global' : o === 'id' ? 'ID' : 'name'}</button>)}</div>
          <Seg value={'right' as LabelPos} options={['left', 'top', 'right', 'bottom', 'none']} onChange={(v) => a.updateNodes(nodes, { labelPos: v })} labels={{ left: '←', top: '↑', right: '→', bottom: '↓', none: '∅' }} />
        </div>
      )}
      {rx.length > 0 && (
        <div className="section">
          <div className="section-title">Reactions</div>
          <Seg value={'straight' as ReactionGlyph['routing']} options={['straight', 'curved', 'orthogonal']} onChange={(v) => a.updateReactions(rx, { routing: v, bend: undefined })} />
          <button className="btn small" onClick={() => a.addPlotsForSelection('density')}>+ density plot for each</button>
        </div>
      )}
    </>
  );
}

function DocumentInspector() {
  const style = useStore((s) => s.style);
  const canvas = useStore((s) => s.canvas);
  const name = useStore((s) => s.name);
  const spacing = useStore((s) => s.layoutSpacing);
  const legend = useStore((s) => s.doc.legend);
  const a = A();
  return (
    <>
      <div className="insp-head"><div className="insp-kind">Figure</div><input className="input title-input" value={name} onChange={(e) => useStore.setState({ name: e.target.value })} /></div>
      <div className="section">
        <div className="section-title">Style preset</div>
        <div className="preset-grid">
          {(Object.keys(THEMES) as StylePresetId[]).map((p) => (
            <button key={p} className={`preset ${style.preset === p ? 'on' : ''}`} onClick={() => a.setStyle({ preset: p })}>
              <span className="preset-sw" style={{ background: THEMES[p].background, borderColor: THEMES[p].groupStroke }}>
                <i style={{ background: THEMES[p].nodeFill, boxShadow: THEMES[p].nodeStrokeWidth ? `0 0 0 1.5px ${THEMES[p].nodeStroke}` : undefined }} /><b style={{ background: THEMES[p].edge }} /><i style={{ background: THEMES[p].nodeFill }} />
              </span>
              {THEMES[p].name}
            </button>
          ))}
        </div>
        <div className="muted small">Presets change appearance only — never the data.</div>
      </div>
      <div className="section">
        <div className="section-title">Labels</div>
        <Field label="Metabolites"><Seg value={style.metaboliteLabel} options={['id', 'name', 'none']} onChange={(v) => a.setStyle({ metaboliteLabel: v })} /></Field>
        <Field label="Reactions"><Seg value={style.reactionLabel} options={['id', 'name', 'none']} onChange={(v) => a.setStyle({ reactionLabel: v })} /></Field>
        <label className="check"><input type="checkbox" checked={style.showFluxValues} onChange={(e) => a.setStyle({ showFluxValues: e.target.checked })} /> Show flux values</label>
        <Field label="Cofactors"><Seg value={style.currency} options={['hide', 'inline']} onChange={(v) => a.setStyle({ currency: v })} labels={{ hide: 'hidden', inline: 'inline text' }} /></Field>
        <label className="check"><input type="checkbox" checked={legend.visible} onChange={(e) => a.commit((s) => ({ doc: { ...s.doc, legend: { ...s.doc.legend, visible: e.target.checked } } }))} /> Legend</label>
      </div>
      <div className="section">
        <div className="section-title">Sizes</div>
        <Field label="Node radius"><input type="range" min={2} max={16} step={0.5} value={style.nodeRadius} onChange={(e) => a.setStyle({ nodeRadius: +e.target.value })} /><span className="mono small">{style.nodeRadius}</span></Field>
        <Field label="Edge width"><input type="range" min={0.4} max={4} step={0.1} value={style.baseEdgeWidth} onChange={(e) => a.setStyle({ baseEdgeWidth: +e.target.value })} /><span className="mono small">{style.baseEdgeWidth}</span></Field>
        <Field label="Font size"><input type="range" min={6} max={18} step={0.5} value={style.fontSize} onChange={(e) => a.setStyle({ fontSize: +e.target.value })} /><span className="mono small">{style.fontSize}</span></Field>
        <Field label="Reaction labels"><input type="range" min={5} max={16} step={0.5} value={style.reactionLabelSize ?? style.fontSize - 1} onChange={(e) => a.setStyle({ reactionLabelSize: +e.target.value })} /><span className="mono small">{style.reactionLabelSize ?? style.fontSize - 1}</span></Field>
      </div>
      <div className="section">
        <div className="section-title">Canvas</div>
        <label className="check"><input type="checkbox" checked={canvas.showGrid} onChange={(e) => a.setCanvas({ showGrid: e.target.checked })} /> Show grid</label>
        <label className="check"><input type="checkbox" checked={canvas.snap} onChange={(e) => a.setCanvas({ snap: e.target.checked })} /> Snap to grid</label>
        <label className="check"><input type="checkbox" checked={canvas.smartGuides} onChange={(e) => a.setCanvas({ smartGuides: e.target.checked })} /> Smart alignment guides</label>
        <Field label="Grid size"><input className="input" type="number" min={2} value={canvas.gridSize} onChange={(e) => a.setCanvas({ gridSize: Math.max(2, +e.target.value) })} /></Field>
        <Field label="Layout spacing"><input type="range" min={30} max={160} step={10} value={spacing} onChange={(e) => useStore.setState({ layoutSpacing: +e.target.value })} /><span className="mono small">{spacing}</span></Field>
      </div>
    </>
  );
}

/** Per-element label: follow the global setting, or force ID / model name / my own text. */
function LabelControl({ mode, custom, idText, nameText, globalText, onMode, onCustom }: {
  mode?: LabelMode; custom?: string; idText: string; nameText: string; globalText: string;
  onMode: (m: LabelMode | undefined) => void; onCustom: (v: string) => void;
}) {
  const value = mode ?? 'global';
  return (
    <>
      <Field label="Label shows">
        <div className="seg">
          {(['global', 'id', 'name', 'custom'] as const).map((o) => (
            <button key={o} className={value === o ? 'on' : ''} title={o === 'global' ? `Follow the global Labels setting (${globalText})` : o === 'id' ? idText : o === 'name' ? nameText : 'Your own text'}
              onClick={() => onMode(o === 'global' ? undefined : o)}>{o === 'global' ? 'global' : o === 'id' ? 'ID' : o === 'name' ? 'name' : 'mine'}</button>
          ))}
        </div>
      </Field>
      {value === 'custom'
        ? <Field label="My label"><input className="input" autoFocus value={custom ?? ''} placeholder="type a label" onChange={(e) => onCustom(e.target.value)} /></Field>
        : <div className="muted small label-preview">{value === 'id' ? idText : value === 'name' ? nameText : `follows global (${globalText})`}</div>}
    </>
  );
}
