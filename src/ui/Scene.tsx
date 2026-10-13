import { memo, useMemo } from 'react';
import type { Condition, Dataset } from '../data/types';
import { baseId, mainParticipants } from '../model/currency';
import type { ID, MetabolicModel } from '../model/types';
import { legendPos, plotAnchorApprox } from '../store/project';
import type { Evaluated, ReactionVisual } from '../viz/evaluate';
import { arrowLength, arrowPath, groupBounds, labelAnchor, reactionGeometry } from '../viz/geometry';
import type { Theme } from '../viz/presets';
import type { NodeGlyph, ReactionGlyph, TextGlyph, StyleSettings, ViewState, VisualDoc } from '../viz/types';
import { Legend } from './Legend';
import { MiniPlot } from './MiniPlot';

export interface SceneProps {
  doc: VisualDoc;
  model: MetabolicModel | null;
  datasets: Dataset[];
  conditions: Condition[];
  view: ViewState;
  style: StyleSettings;
  theme: Theme;
  ev: Evaluated;
  selected: Set<string>;
  particles: boolean;
  /** true while rendering in the editor (hit areas + selection chrome) */
  interactive: boolean;
}

const SEL = '#4f5bd5';

/** Approximate half-size of a text label (Helvetica metrics). */
export function labelBox(text: string, fs: number): { hw: number; hh: number } {
  let w = 0;
  for (const ch of text) w += /[A-Z0-9]/.test(ch) ? 0.64 : /[il.,:;'|!]/.test(ch) ? 0.28 : 0.52;
  return { hw: (w * fs) / 2 + 2, hh: fs * 0.62 };
}

export function nodeLabel(n: NodeGlyph, model: MetabolicModel | null, style: StyleSettings): string {
  const m = n.metaboliteId ? model?.metabolites[n.metaboliteId] : undefined;
  // a per-node choice always wins over the global setting
  if (n.labelMode === 'custom') return n.label ?? '';
  if (n.labelMode === 'name') return m?.name ?? n.label ?? '?';
  if (n.labelMode === 'id') return n.metaboliteId ?? n.label ?? '?';
  if (style.metaboliteLabel === 'none') return '';
  if (style.metaboliteLabel === 'name' && m) return m.name;
  return n.label ?? (n.metaboliteId ? baseId(n.metaboliteId) : '?');
}

export function reactionLabel(g: ReactionGlyph, model: MetabolicModel | null, style: StyleSettings): string {
  const r = g.reactionId ? model?.reactions[g.reactionId] : undefined;
  const ids = g.collapsed ? g.collapsed.members.map((m) => m.reactionId) : g.lumped ?? (g.reactionId ? [g.reactionId] : []);
  const idText = ids.length <= 2 ? ids.join(' + ') : `${ids[0]} … ${ids[ids.length - 1]}`;
  if (g.labelMode === 'custom') return g.label ?? '';
  if (g.labelMode === 'name') return r?.name ?? g.label ?? idText;
  if (g.labelMode === 'id') return idText || (g.label ?? '');
  if (style.reactionLabel === 'none') return '';
  if (style.reactionLabel === 'name' && r) return r.name;
  if (g.collapsed && !g.label) {
    const ids = g.collapsed.members.map((m) => m.reactionId);
    return ids.length <= 2 ? ids.join(' + ') : `${ids[0]} … ${ids[ids.length - 1]}`;
  }
  return g.label ?? g.reactionId ?? '';
}


interface ItemCtx { model: MetabolicModel | null; style: StyleSettings; theme: Theme; interactive: boolean; particles: boolean }
const transOf = (interactive: boolean) => (interactive ? { transition: 'stroke-width .45s ease, stroke .45s ease, fill .45s ease, r .45s ease' } : undefined);

interface ReactionItemProps { g: ReactionGlyph; parts: (NodeGlyph | undefined)[]; radii: number[]; rv?: ReactionVisual; isSel: boolean; ctx: ItemCtx; cofs?: NodeGlyph[] }

/** Cofactor labels (attached nodes) are drawn smaller than metabolite labels. */
export const cofactorFont = (fs: number) => Math.max(6, fs - 2);

/**
 * The short curve between an attached cofactor and its arrow: consumed cofactors run into the arrow before its
 * middle, produced ones leave it after the middle and end in a small arrowhead at the cofactor.
 */
function cofactorCurve(c: NodeGlyph, mid: { x: number; y: number }, dir: { x: number; y: number }, fs: number, width: number): { d: string; tip?: { x: number; y: number; angle: number } } {
  const out = c.attach!.side === 'out';
  const a = { x: mid.x + dir.x * (out ? 5 : -5), y: mid.y + dir.y * (out ? 5 : -5) };
  const ctrl = { x: a.x + dir.x * (out ? 9 : -9), y: a.y + dir.y * (out ? 9 : -9) };
  const { hw, hh } = labelBox(c.label ?? '', cofactorFont(fs));
  // stop at the label box of the cofactor
  const vx = ctrl.x - c.x, vy = ctrl.y - c.y;
  const len = Math.hypot(vx, vy) || 1;
  const k = Math.min(Math.abs(vx) > 1e-6 ? hw / Math.abs(vx / len) : Infinity, Math.abs(vy) > 1e-6 ? hh / Math.abs(vy / len) : Infinity) + 2;
  const e = { x: c.x + (vx / len) * k, y: c.y + (vy / len) * k };
  if (!out) return { d: `M${e.x.toFixed(1)},${e.y.toFixed(1)} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${a.x.toFixed(1)},${a.y.toFixed(1)}` };
  const ang = Math.atan2(e.y - ctrl.y, e.x - ctrl.x);
  const back = arrowLength(width) * 0.7;
  const e2 = { x: e.x - Math.cos(ang) * back, y: e.y - Math.sin(ang) * back };
  return { d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${e2.x.toFixed(1)},${e2.y.toFixed(1)}`, tip: { x: e.x, y: e.y, angle: ang } };
}

/** One reaction arrow. Memoised: re-renders only when the glyph, its endpoints or its visual values change. */
const ReactionItem = memo(function ReactionItem({ g, parts, radii, rv, isSel, ctx, cofs }: ReactionItemProps) {
  const { model, style, theme, interactive, particles } = ctx;
  const fs = style.fontSize;
  const trans = transOf(interactive);
  const local: Record<ID, NodeGlyph> = {};
  const rad: Record<ID, number> = {};
  parts.forEach((n, i) => { if (n) { local[n.id] = n; rad[n.id] = radii[i]; } });
  const radiusOf = (id: ID, dir?: { x: number; y: number }) => {
    const n = local[id];
    if (n?.shape === 'label' && dir) {
      const { hw, hh } = labelBox(nodeLabel(n, model, style), fs);
      return Math.min(Math.abs(dir.x) > 1e-6 ? hw / Math.abs(dir.x) : Infinity, Math.abs(dir.y) > 1e-6 ? hh / Math.abs(dir.y) : Infinity) - 3;
    }
    return rad[id] ?? style.nodeRadius;
  };
  const w = rv?.width ?? style.baseEdgeWidth;
  const al = arrowLength(w) * 0.8;
  const dir = rv?.dir ?? 1;
  // without flux data, reversible model reactions show both arrowheads (as on printed maps)
  // a template reaction (Template Design Mode) shows its stated reversibility the same way
  const both = rv?.value == null && !g.collapsed && (g.reactionId ? !!model?.reactions[g.reactionId]?.reversible : g.design?.reversible === true);
  const geom = reactionGeometry(g, local, radiusOf, dir < 0 || both ? al : 0, dir >= 0 || both ? al : 0);
  if (!geom) return null;
  const color = rv?.color ?? theme.edge;
  const unbound = !g.reactionId;
  const label = reactionLabel(g, model, style);
  const rfs = style.reactionLabelSize ?? fs - 1;
  const lp = g.labelOffset ? { x: geom.mid.x + g.labelOffset.x, y: geom.mid.y + g.labelOffset.y } : { x: geom.mid.x + geom.normal.x * (9 + w / 2), y: geom.mid.y + geom.normal.y * (9 + w / 2) };
  const anchor = g.labelOffset ? 'middle' : Math.abs(geom.normal.x) < 0.3 ? 'middle' : geom.normal.x < 0 ? 'end' : 'start';
  const rot = g.labelAngle ? `rotate(${g.labelAngle} ${lp.x.toFixed(1)} ${lp.y.toFixed(1)})` : undefined;
  const rxn = g.reactionId ? model?.reactions[g.reactionId] : undefined;
  let cof = '';
  if (style.currency === 'inline' && rxn && model) {
    const mp = mainParticipants(rxn, model.metabolites);
    const a = mp.cofactorsIn.map(baseId).join('+'), b = mp.cofactorsOut.map(baseId).join('+');
    if (a || b) cof = `${a || '∅'} → ${b || '∅'}`;
  }
  let hiddenCount = 0;
  if (interactive && isSel && rxn && model && !g.lumped) {
    const mp = mainParticipants(rxn, model.metabolites);
    const shown = new Set([...g.sources, ...g.targets].map((id) => local[id]?.metaboliteId));
    hiddenCount = [...mp.substrates, ...mp.products].filter((m) => !shown.has(m)).length;
  }
  const badge = g.collapsed?.showBadge ? String(g.collapsed.members.length) : '';
  const dash = rv?.dashed ? `${Math.max(2, w * 1.5)} ${Math.max(2.5, w * 1.8)}` : undefined;
  return (
    <g data-sel={`reaction:${g.id}`} opacity={rv?.opacity ?? 1}>
      {interactive && geom.segments.map((s, i) => <path key={'h' + i} className="ui-only" d={s.d} stroke="transparent" strokeWidth={Math.max(12, w + 8)} fill="none" />)}
      {isSel && geom.segments.map((s, i) => <path key={'s' + i} className="ui-only" d={s.d} stroke={SEL} strokeOpacity={0.35} strokeWidth={w + 6} fill="none" strokeLinecap="round" />)}
      {geom.segments.map((s, i) => (
        <path key={i} d={s.d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash} strokeLinecap="butt" style={trans} />
      ))}
      {geom.segments.map((s, i) => {
        const tips = [];
        if ((dir >= 0 || both) && s.side !== 'source') tips.push(s.endTip);
        if ((dir < 0 || both) && s.side !== 'target') tips.push(s.startTip);
        return tips.map((t, j) => <path key={`a${i}${j}`} d={arrowPath(t, w)} fill={color} stroke="none" style={trans} />);
      })}
      {particles && rv?.dir ? geom.segments.map((s, i) => (
        <path key={'p' + i} className="ui-only flow" d={s.d} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={Math.max(1, w * 0.45)} strokeLinecap="round" strokeDasharray="0.1 9"
          style={{ animationDuration: `${Math.max(0.25, 2.2 / Math.sqrt(Math.abs(rv.value ?? 1) + 0.2))}s`, animationDirection: rv.dir < 0 ? 'reverse' : 'normal' }} />
      )) : null}
      {label && (
        <text x={lp.x} y={lp.y + rfs * 0.33} fontSize={rfs} fontStyle="italic" textAnchor={anchor} transform={rot} fill={unbound && interactive ? theme.slotStroke : theme.rxnLabel}>
          {label}
          {rv?.valueLabel != null && <tspan x={lp.x} dy={rfs + 1} fontStyle="normal" fill={theme.text} fontSize={Math.max(6, rfs - 1)}>{rv.valueLabel}</tspan>}
        </text>
      )}
      {!label && rv?.valueLabel != null && <text x={lp.x} y={lp.y + fs * 0.33} fontSize={fs - 2} textAnchor={anchor} fill={theme.text}>{rv.valueLabel}</text>}
      {badge && (
        <g>
          <rect x={geom.mid.x - (6 + badge.length * 2.6)} y={geom.mid.y - 6} width={12 + badge.length * 5.2} height={12} rx={6} fill={theme.background} stroke={color} strokeWidth={Math.min(2, Math.max(1, w * 0.5))} />
          <text x={geom.mid.x} y={geom.mid.y + 2.9} fontSize={8} fontWeight={700} textAnchor="middle" fill={theme.text}>{badge}</text>
        </g>
      )}
      {hiddenCount > 0 && (
        <text className="ui-only" x={geom.mid.x - geom.normal.x * (10 + w / 2)} y={geom.mid.y - geom.normal.y * (10 + w / 2) + 3} fontSize={fs - 2} fontWeight={600} textAnchor="middle" fill="#e0a100">
          <title>{hiddenCount} participant(s) hidden — choose them in the Inspector</title>+{hiddenCount}
        </text>
      )}
      {cof && <text x={geom.mid.x - geom.normal.x * (8 + w / 2)} y={geom.mid.y - geom.normal.y * (8 + w / 2) + 3} fontSize={fs - 3} textAnchor={anchor === 'end' ? 'start' : anchor === 'start' ? 'end' : 'middle'} fill={theme.plotAxis}>{cof}</text>}
      {cofs?.map((c) => {
        const cc = cofactorCurve(c, geom.mid, geom.dir, fs, Math.max(0.8, w * 0.6));
        return (
          <g key={c.id}>
            <path d={cc.d} fill="none" stroke={color} strokeOpacity={0.75} strokeWidth={Math.max(0.7, w * 0.6)} />
            {cc.tip && <path d={arrowPath(cc.tip, Math.max(0.7, w * 0.6))} fill={color} fillOpacity={0.75} stroke="none" />}
          </g>
        );
      })}
    </g>
  );
}, (a, b) =>
  a.g === b.g && a.isSel === b.isSel && a.ctx === b.ctx && a.parts.length === b.parts.length && a.parts.every((n, i) => n === b.parts[i]) &&
  a.radii.every((r, i) => r === b.radii[i]) && sameRv(a.rv, b.rv) && (a.cofs?.length ?? 0) === (b.cofs?.length ?? 0) && (a.cofs ?? []).every((n, i) => n === b.cofs![i]));

function sameRv(a?: ReactionVisual, b?: ReactionVisual) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.width === b.width && a.color === b.color && a.opacity === b.opacity && a.dir === b.dir && a.dashed === b.dashed && a.valueLabel === b.valueLabel && a.value === b.value;
}

interface NodeItemProps { n: NodeGlyph; r: number; fill?: string; opacity: number; isSel: boolean; ctx: ItemCtx }

/** Mapping-workflow markers (never exported): ? = review, ○ = open slot. Confident mappings show nothing. */
const TEMPLATE_BADGE: Partial<Record<string, { fill: string; text: string }>> = {
  provisional: { fill: '#d97706', text: '?' }, ambiguous: { fill: '#d97706', text: '?' }, unresolved: { fill: '#9ca3af', text: '?' },
};

/** Template Design Mode: identity status of template entities (never exported). */
const DESIGN_BADGE: Record<string, { fill: string; text: string }> = {
  confirmed: { fill: '#15803d', text: '✓' }, suggested: { fill: '#d97706', text: '?' }, ambiguous: { fill: '#ea580c', text: '!' }, unresolved: { fill: '#9ca3af', text: '○' },
};

/** One metabolite node (memoised). */
const NodeItem = memo(function NodeItem({ n, r, fill, opacity, isSel, ctx }: NodeItemProps) {
  const { model, style, theme, interactive } = ctx;
  if (n.attach) {
    // a cofactor beside its arrow: small grey text, no ring (never the end of a reaction)
    const cfs = cofactorFont(style.fontSize);
    const { hw, hh } = labelBox(n.label ?? '', cfs);
    return (
      <g data-sel={`node:${n.id}`} opacity={opacity}>
        {interactive && <rect className="ui-only" x={n.x - hw - 2} y={n.y - hh - 1} width={hw * 2 + 4} height={hh * 2 + 2} fill="transparent" />}
        {isSel && <rect className="ui-only" x={n.x - hw - 2} y={n.y - hh - 1} width={hw * 2 + 4} height={hh * 2 + 2} rx={3} fill="none" stroke={SEL} strokeWidth={1.2} />}
        <text x={n.x} y={n.y + cfs * 0.35} fontSize={cfs} textAnchor="middle" fill={theme.plotAxis}>{n.label}</text>
      </g>
    );
  }
  const fs = style.fontSize;
  const trans = transOf(interactive);
  // template entities (Template Design Mode) are biological identities, not unbound model slots
  const slot = !n.design && (!n.metaboliteId || !model?.metabolites[n.metaboliteId]);
  const port = n.design?.kind === 'port';
  const unboundModel = n.metaboliteId && model && !model.metabolites[n.metaboliteId];
  const label = nodeLabel(n, model, style);
  const la = labelAnchor(n, n.labelPos, r, fs);
  const exchange = n.role === 'exchange';
  return (
    <g data-sel={`node:${n.id}`} opacity={opacity}>
      {interactive && n.shape !== 'label' && <circle className="ui-only handle" data-handle={n.id} cx={n.x} cy={n.y} r={r + 7} fill="transparent" />}
      {interactive && n.shape === 'label' && (() => { const { hw, hh } = labelBox(label || '?', fs); return <rect className="ui-only handle" data-handle={n.id} x={n.x - hw - 6} y={n.y - hh - 6} width={hw * 2 + 12} height={hh * 2 + 12} rx={6} fill="transparent" />; })()}
      {isSel && <circle className="ui-only" cx={n.x} cy={n.y} r={r + 4} fill="none" stroke={SEL} strokeWidth={1.6} />}
      {n.shape === 'label' ? (
        (() => {
          const { hw, hh } = labelBox(label || '?', fs);
          const mapped = !!fill && fill !== theme.nodeFill;
          return (
            <>
              {interactive && <rect className="ui-only" x={n.x - hw} y={n.y - hh} width={hw * 2} height={hh * 2} fill="transparent" />}
              {isSel && <rect className="ui-only" x={n.x - hw - 2} y={n.y - hh - 1} width={hw * 2 + 4} height={hh * 2 + 2} rx={3} fill="none" stroke={SEL} strokeWidth={1.4} />}
              {mapped && <rect x={n.x - hw} y={n.y - hh + 1} width={hw * 2} height={hh * 2 - 2} rx={hh * 0.6} fill={fill} opacity={0.35} style={trans} />}
              {port && <rect x={n.x - hw - 5} y={n.y - hh - 2} width={hw * 2 + 10} height={hh * 2 + 4} rx={hh + 2} fill={theme.background} stroke={theme.plotAxis} strokeWidth={1} strokeDasharray="3 2" />}
              <text x={n.x} y={n.y + fs * 0.35} fontSize={fs} textAnchor="middle" fill={slot && interactive ? theme.slotStroke : port ? theme.plotAxis : theme.metLabel} fontStyle={(slot && interactive) || port ? 'italic' : undefined}>{label || '?'}</text>
            </>
          );
        })()
      ) : exchange ? (
        <circle cx={n.x} cy={n.y} r={r} fill={theme.background} stroke={theme.nodeFill} strokeWidth={1.4} strokeDasharray="2.2 1.8" style={trans} />
      ) : slot && interactive ? (
        <circle cx={n.x} cy={n.y} r={r} fill={theme.background} stroke={unboundModel ? '#e0a100' : theme.slotStroke} strokeWidth={1.3} strokeDasharray="3 2" />
      ) : (
        <circle cx={n.x} cy={n.y} r={r} fill={fill ?? theme.nodeFill} stroke={theme.nodeStrokeWidth ? theme.nodeStroke : 'none'} strokeWidth={theme.nodeStrokeWidth || undefined} style={trans} />
      )}
      {n.locked && interactive && <circle className="ui-only" cx={n.x + r * 0.8} cy={n.y - r * 0.8} r={2} fill="#e0a100" />}
      {interactive && n.design?.kind === 'metabolite' && n.design.status && (
        <g className="ui-only" pointerEvents="none">
          <circle cx={n.x - r * 0.9} cy={n.y - r * 0.9} r={4.2} fill={n.design.conflict ? '#dc2626' : DESIGN_BADGE[n.design.status].fill} stroke="#fff" strokeWidth={0.8} />
          <text x={n.x - r * 0.9} y={n.y - r * 0.9 + 2.3} fontSize={6.5} fontWeight={700} textAnchor="middle" fill="#fff">{n.design.conflict ? '!' : DESIGN_BADGE[n.design.status].text}</text>
        </g>
      )}
      {interactive && n.template && TEMPLATE_BADGE[n.template.status] && (
        <g className="ui-only" pointerEvents="none">
          <circle cx={n.x - r * 0.9} cy={n.y - r * 0.9} r={4.2} fill={TEMPLATE_BADGE[n.template.status]!.fill} stroke="#fff" strokeWidth={0.8} />
          <text x={n.x - r * 0.9} y={n.y - r * 0.9 + 2.3} fontSize={6.5} fontWeight={700} textAnchor="middle" fill="#fff">{TEMPLATE_BADGE[n.template.status]!.text}</text>
        </g>
      )}
      {n.shape !== 'label' && label && n.labelPos !== 'none' && (
        <text x={la.x} y={la.y} fontSize={fs} textAnchor={la.anchor} fill={slot && interactive ? theme.slotStroke : theme.metLabel} fontStyle={slot && interactive ? 'italic' : undefined}>{label}</text>
      )}
    </g>
  );
});

function TextItem({ t, theme, selected }: { t: TextGlyph; theme: Theme; selected: boolean }) {
  return (
    <g data-sel={`text:${t.id}`} transform={t.rotate ? `rotate(${t.rotate} ${t.x} ${t.y})` : undefined}>
      <text x={t.x} y={t.y} fontSize={t.size} fontWeight={t.weight} fontStyle={t.italic ? 'italic' : undefined} fill={t.color ?? theme.text}>{t.text}</text>
      {selected && <rect className="ui-only" x={t.x - 3} y={t.y - t.size} width={t.text.length * t.size * 0.56 + 6} height={t.size * 1.3} fill="none" stroke={SEL} strokeWidth={1} strokeDasharray="3 2" />}
    </g>
  );
}

function SceneImpl({ doc, model, datasets, conditions, view, style, theme, ev, selected, particles, interactive }: SceneProps) {
  const fs = style.fontSize;
  const ctx = useMemo<ItemCtx>(() => ({ model, style, theme, interactive, particles }), [model, style, theme, interactive, particles]);
  // cofactor drawings attached to each arrow
  const cofsByGlyph = useMemo(() => {
    const m = new Map<ID, NodeGlyph[]>();
    for (const n of Object.values(doc.nodes)) if (n.attach && doc.reactions[n.attach.glyph]) m.set(n.attach.glyph, [...(m.get(n.attach.glyph) ?? []), n]);
    return m;
  }, [doc.nodes, doc.reactions]);

  return (
    <g fontFamily={theme.font}>
      {/* background texts (compartment watermarks) */}
      <g id="background-texts">
        {Object.values(doc.texts).filter((t) => t.background).map((t) => <TextItem key={t.id} t={t} theme={theme} selected={selected.has(`text:${t.id}`)} />)}
      </g>

      {/* pathway groups / compartments */}
      <g id="groups">
        {Object.values(doc.groups).map((g) => {
          if (g.hidden) return null;
          const b = groupBounds(g, doc.nodes);
          if (!b) return null;
          const isSel = selected.has(`group:${g.id}`);
          const comp = g.kind === 'compartment';
          return (
            <g key={g.id} data-sel={`group:${g.id}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={comp ? 14 : 6} fill={g.fill} pointerEvents={g.fill === 'none' ? 'stroke' : undefined} stroke={g.stroke === 'none' ? (isSel ? SEL : 'none') : isSel ? SEL : g.stroke} strokeWidth={comp ? 1.2 : 1} strokeDasharray={g.dashed ? '5 4' : undefined} />
              <text x={b.x + 8} y={b.y + 13} fontSize={fs + 1} fontWeight={600} fontStyle={comp ? 'normal' : 'italic'} fill={theme.text}>{g.title}</text>
              {g.locked && interactive && <text className="ui-only" x={b.x + b.w - 8} y={b.y + 14} fontSize={fs} textAnchor="end" fill="#a07800">🔒 locked</text>}
              {g.subtitle && <text x={b.x + 8} y={b.y + 25} fontSize={fs - 1} fill={theme.plotAxis}>{g.subtitle}</text>}
            </g>
          );
        })}
      </g>

      {/* reactions */}
      <g id="reactions">
        {Object.values(doc.reactions).map((g) => {
          const parts = [...g.sources, ...g.targets].map((id) => doc.nodes[id]);
          return (
            <ReactionItem key={g.id} g={g} parts={parts} radii={parts.map((n) => (n ? ev.nodes[n.id]?.r ?? style.nodeRadius : 0))}
              rv={ev.reactions[g.id]} isSel={selected.has(`reaction:${g.id}`)} ctx={ctx} cofs={cofsByGlyph.get(g.id)} />
          );
        })}
      </g>

      {/* plot connectors (under nodes) */}
      <g id="plot-connectors">
        {Object.values(doc.plots).map((p) => {
          if (!p.showConnector) return null;
          const a = plotAnchorApprox(doc, p.anchor);
          if (!a) return null;
          const px = a.x + p.dx, py = a.y + p.dy;
          const tx = Math.max(px, Math.min(a.x, px + p.w));
          const ty = Math.max(py, Math.min(a.y, py + p.h));
          const inside = tx === a.x && ty === a.y;
          if (inside) return null;
          return <line key={p.id} x1={a.x} y1={a.y} x2={tx} y2={ty} stroke={theme.plotAxis} strokeWidth={0.6} strokeDasharray="2 2" />;
        })}
      </g>

      {/* metabolites */}
      <g id="metabolites">
        {Object.values(doc.nodes).map((n) => {
          const nv = ev.nodes[n.id];
          return <NodeItem key={n.id} n={n} r={nv?.r ?? style.nodeRadius} fill={nv?.fill} opacity={nv?.opacity ?? 1} isSel={selected.has(`node:${n.id}`)} ctx={ctx} />;
        })}
      </g>

      {/* plots */}
      <g id="plots">
        {Object.values(doc.plots).map((p) => {
          const a = plotAnchorApprox(doc, p.anchor);
          if (!a) return null;
          const g = p.anchor.kind === 'reaction' ? doc.reactions[p.anchor.id] : undefined;
          const n = p.anchor.kind === 'node' ? doc.nodes[p.anchor.id] : undefined;
          let title = '';
          if (g) {
            const s = g.sources.map((id) => doc.nodes[id]).filter(Boolean).map((x) => nodeLabel(x, model, { ...style, metaboliteLabel: style.metaboliteLabel === 'none' ? 'id' : style.metaboliteLabel }));
            const t = g.targets.map((id) => doc.nodes[id]).filter(Boolean).map((x) => nodeLabel(x, model, { ...style, metaboliteLabel: style.metaboliteLabel === 'none' ? 'id' : style.metaboliteLabel }));
            title = `${s.join(' + ')} → ${t.join(' + ')}`;
          } else if (n) title = nodeLabel(n, model, style);
          return (
            <MiniPlot key={p.id} plot={p} x={a.x + p.dx} y={a.y + p.dy} title={title} glyph={g} metaboliteId={n?.metaboliteId} datasets={datasets} conditions={conditions} view={view} theme={theme} selected={selected.has(`plot:${p.id}`)} />
          );
        })}
      </g>

      {/* annotations */}
      <g id="annotations">
        {Object.values(doc.texts).filter((t) => !t.background).map((t) => <TextItem key={t.id} t={t} theme={theme} selected={selected.has(`text:${t.id}`)} />)}
      </g>

      <Legend legend={doc.legend} pos={legendPos(doc)} items={ev.legend} theme={theme} selected={selected.has('legend:legend')} />
    </g>
  );
}

export const Scene = memo(SceneImpl);
