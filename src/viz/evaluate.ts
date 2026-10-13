/**
 * Mapping engine: (model, datasets, mappings, view) -> per-glyph visual attributes.
 * Pure function — the renderer and the exporter both consume its output.
 */
import { netSamples, netValue } from '../data/families';
import type { Condition, Dataset } from '../data/types';
import type { ID } from '../model/types';
import { getPalette, samplePalette } from './palettes';
import type { Theme } from './presets';
import type { Aggregate, CompareMode, ReactionGlyph, ScaleType, StyleSettings, ViewState, VisualDoc, VisualizationMapping } from './types';

export interface ReactionVisual {
  value: number | null;
  width: number;
  color: string;
  opacity: number;
  /** +1: arrow at targets, -1: arrow at sources, 0: no data / zero flux */
  dir: 1 | -1 | 0;
  dashed: boolean;
  valueLabel?: string;
}

export interface NodeVisual {
  r: number;
  fill: string;
  opacity: number;
  value: number | null;
}

export type LegendItem =
  | { kind: 'width'; title: string; domain: [number, number]; range: [number, number]; unit?: string }
  | { kind: 'color'; title: string; domain: [number, number]; palette: string; diverging: boolean; unit?: string }
  | { kind: 'radius'; title: string; domain: [number, number]; range: [number, number]; unit?: string }
  | { kind: 'conditions'; title: string; items: { name: string; color: string }[] };

export interface Evaluated {
  reactions: Record<ID, ReactionVisual>;
  nodes: Record<ID, NodeVisual>;
  legend: LegendItem[];
}

const COMPARE_LABEL: Record<CompareMode, string> = {
  absolute: '',
  difference: 'Δ',
  foldchange: 'fold change',
  log2fc: 'log₂ FC',
};

export function rawValue(ds: Dataset, entity: ID | undefined, condId: string): number | null {
  if (!entity) return null;
  const ci = ds.columns.indexOf(condId);
  if (ci < 0) return null;
  return netValue(ds, entity, ci);
}

export function aggregate(vs: number[], how: Aggregate, entry?: boolean[]): number {
  switch (how) {
    case 'entry': { const e = vs.filter((_, i) => entry?.[i]); return (e.length ? e : vs).reduce((a, b) => a + b, 0); }
    case 'sum': return vs.reduce((a, b) => a + b, 0);
    case 'mean': return vs.reduce((a, b) => a + b, 0) / vs.length;
    case 'min': return vs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
    case 'max': return vs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  }
}

/** Flux in the drawn direction of the glyph (sign flipped if drawn against the model; aggregated if collapsed). */
export function glyphFlux(ds: Dataset, g: ReactionGlyph, condId: string): number | null {
  if (g.collapsed) {
    const vs: number[] = [], entry: boolean[] = [];
    for (const m of g.collapsed.members) {
      const v = rawValue(ds, m.reactionId, condId);
      if (v != null) { vs.push(v * m.sign); entry.push(m.entry); }
    }
    return vs.length ? aggregate(vs, g.collapsed.aggregate, entry) : null;
  }
  const v = rawValue(ds, g.reactionId, condId);
  return v == null ? null : g.reversedToModel ? -v : v;
}

/** Sample distribution in the drawn direction (element-wise aggregation for collapsed arrows). */
export function glyphSamples(ds: Dataset, g: ReactionGlyph, ci: number): number[] {
  if (!ds.samples) return [];
  if (g.collapsed) {
    const arrs: number[][] = [], entry: boolean[] = [];
    for (const m of g.collapsed.members) {
      const a = netSamples(ds, m.reactionId, ci);
      if (a?.length) { arrs.push(a.map((v) => v * m.sign)); entry.push(m.entry); }
    }
    if (!arrs.length) return [];
    const n = Math.min(...arrs.map((a) => a.length));
    return Array.from({ length: n }, (_, k) => aggregate(arrs.map((a) => a[k]), g.collapsed!.aggregate, entry));
  }
  const s = g.reactionId ? netSamples(ds, g.reactionId, ci) : [];
  return g.reversedToModel ? s.map((v) => -v) : s;
}

export function compareValue(mode: CompareMode, v: number | null, ref: number | null): number | null {
  if (mode === 'absolute') return v;
  if (v == null || ref == null) return null;
  const eps = 1e-9;
  switch (mode) {
    case 'difference':
      return v - ref;
    case 'foldchange':
      return Math.abs(ref) < eps ? null : v / ref;
    case 'log2fc':
      return Math.abs(ref) < eps || Math.abs(v) < eps ? null : Math.log2(Math.abs(v) / Math.abs(ref));
  }
}

type Tf = (v: number) => number;
const transform = (s: ScaleType): Tf =>
  s === 'sqrt' ? (v) => Math.sign(v) * Math.sqrt(Math.abs(v)) : s === 'log' ? (v) => Math.sign(v) * Math.log10(1 + Math.abs(v)) : (v) => v;

/** Build v -> t in [0,1]. */
export function makeScale(values: number[], type: ScaleType, diverging: boolean, domain?: [number, number]) {
  const finite = values.filter(Number.isFinite);
  if (type === 'percentile') {
    const sorted = (diverging ? finite.map(Math.abs) : finite).slice().sort((a, b) => a - b);
    const rank = (x: number) => {
      if (sorted.length < 2) return 0.5;
      let lo = 0, hi = sorted.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
      return lo / (sorted.length - 1);
    };
    const dom: [number, number] = [sorted[0] ?? 0, sorted[sorted.length - 1] ?? 1];
    return { t: diverging ? (v: number) => 0.5 + Math.sign(v) * rank(Math.abs(v)) / 2 : rank, domain: dom };
  }
  const f = transform(type);
  if (diverging) {
    const m = domain ? Math.max(Math.abs(domain[0]), Math.abs(domain[1])) : Math.max(1e-9, ...finite.map(Math.abs));
    const fm = f(m) || 1;
    return { t: (v: number) => 0.5 + Math.max(-1, Math.min(1, f(v) / fm)) / 2, domain: [-m, m] as [number, number] };
  }
  const lo = domain ? domain[0] : Math.min(0, ...finite);
  const hi = domain ? domain[1] : Math.max(1e-9, ...finite);
  const flo = f(lo), fhi = f(hi);
  return { t: (v: number) => (fhi === flo ? 0.5 : Math.max(0, Math.min(1, (f(v) - flo) / (fhi - flo)))), domain: [lo, hi] as [number, number] };
}

export function evaluate(
  doc: VisualDoc,
  datasets: Dataset[],
  mappings: VisualizationMapping[],
  view: ViewState,
  conditions: Condition[],
  style: StyleSettings,
  theme: Theme,
): Evaluated {
  const out: Evaluated = { reactions: {}, nodes: {}, legend: [] };
  const base = style.baseEdgeWidth;
  const glyphs = Object.values(doc.reactions);
  const nodes = Object.values(doc.nodes);

  for (const g of glyphs) {
    out.reactions[g.id] = { value: null, width: base, color: theme.edge, opacity: 1, dir: 1, dashed: g.role === 'exchange' };
  }
  for (const n of nodes) {
    out.nodes[n.id] = { r: n.r ?? style.nodeRadius, fill: n.fill ?? theme.nodeFill, opacity: 1, value: null };
  }

  const active = mappings.filter((m) => m.enabled);
  const byId = new Map(datasets.map((d) => [d.id, d]));
  const compare = view.compare;
  const condsForDomain = compare === 'absolute' ? conditions.map((c) => c.id) : conditions.map((c) => c.id).filter((c) => c !== view.reference);
  let anyReactionData = false;

  for (const m of active) {
    const ds = byId.get(m.datasetId);
    if (!ds || !ds.visible) continue;

    if (m.target === 'reaction') {
      const valueOf = (g: ReactionGlyph, c: string) => compareValue(compare, glyphFlux(ds, g, c), glyphFlux(ds, g, view.reference));
      const all: number[] = [];
      for (const g of glyphs) for (const c of condsForDomain) { const v = valueOf(g, c); if (v != null) all.push(v); }
      if (!all.length) continue;
      anyReactionData = true;
      const hasNeg = all.some((v) => v < 0);
      const center = compare === 'foldchange' ? 1 : 0;
      const title = `${COMPARE_LABEL[compare] ? COMPARE_LABEL[compare] + ' ' : ''}${ds.kind === 'flux' ? 'Flux' : ds.name}`;

      if (m.property === 'width' || m.property === 'opacity') {
        const mags = all.map((v) => Math.abs(v - center));
        const sc = makeScale(mags, m.scale, false, m.domain ?? [0, Math.max(...mags)]);
        const range = m.range ?? (m.property === 'width' ? [base * 0.5, base * 7] : [0.15, 1]);
        for (const g of glyphs) {
          const v = valueOf(g, view.activeCondition);
          const rv = out.reactions[g.id];
          if (v == null) continue;
          const t = sc.t(Math.abs(v - center));
          if (m.property === 'width') rv.width = range[0] + t * (range[1] - range[0]);
          else rv.opacity = range[0] + t * (range[1] - range[0]);
        }
        if (m.property === 'width') out.legend.push({ kind: 'width', title, domain: sc.domain, range: range as [number, number], unit: compare === 'absolute' ? ds.unit : undefined });
      } else if (m.property === 'color') {
        // Arrow direction already encodes the sign, so absolute flux defaults to |v| on a
        // sequential palette; comparisons (and "signed" mappings) use a diverging one.
        const useMag = compare === 'absolute' && m.magnitude;
        const diverging = !useMag && (compare !== 'absolute' || hasNeg);
        const tf = (v: number) => (useMag ? Math.abs(v) : v - center);
        const sc = makeScale(all.map(tf), m.scale, diverging, m.domain ?? (useMag ? [0, Math.max(...all.map(Math.abs))] : undefined));
        const pal = getPalette(m.palette ?? (diverging ? 'blue-red' : 'viridis'));
        for (const g of glyphs) {
          const v = valueOf(g, view.activeCondition);
          if (v == null) continue;
          out.reactions[g.id].color = samplePalette(pal, sc.t(tf(v)));
        }
        if (useMag) out.legend.push({ kind: 'color', title: `|${title}|`, domain: sc.domain, palette: pal.id, diverging: false, unit: ds.unit });
        else out.legend.push({ kind: 'color', title, domain: [sc.domain[0] + center, sc.domain[1] + center], palette: pal.id, diverging, unit: compare === 'absolute' ? ds.unit : undefined });
      } else if (m.property === 'label') {
        for (const g of glyphs) {
          const v = valueOf(g, view.activeCondition);
          if (v != null) out.reactions[g.id].valueLabel = String(+v.toPrecision(3));
        }
      }
      // Direction + zero flux always follow the *absolute* flux of the active condition.
      for (const g of glyphs) {
        const v = glyphFlux(ds, g, view.activeCondition);
        const rv = out.reactions[g.id];
        rv.value = v;
        if (v == null) continue;
        if (Math.abs(v) < 1e-9) { rv.dir = 0; rv.color = theme.edgeMuted; rv.width = Math.min(rv.width, base * 0.6); }
        else rv.dir = v > 0 ? 1 : -1;
      }
    } else {
      const valueOf = (mid: ID | undefined, c: string) => compareValue(compare, rawValue(ds, mid, c), rawValue(ds, mid, view.reference));
      const all: number[] = [];
      for (const n of nodes) for (const c of condsForDomain) { const v = valueOf(n.metaboliteId, c); if (v != null) all.push(v); }
      if (!all.length) continue;
      const title = `${COMPARE_LABEL[compare] ? COMPARE_LABEL[compare] + ' ' : ''}${ds.kind === 'turnover' ? 'Turnover' : ds.kind === 'metabolite' ? 'Concentration' : ds.name}`;
      const center = compare === 'foldchange' ? 1 : 0;
      if (m.property === 'radius' || m.property === 'opacity') {
        const mags = all.map((v) => Math.abs(v - center));
        const sc = makeScale(mags, m.scale, false, m.domain ?? [0, Math.max(...mags)]);
        const range = m.range ?? (m.property === 'radius' ? [style.nodeRadius * 0.6, style.nodeRadius * 2.4] : [0.2, 1]);
        for (const n of nodes) {
          const v = valueOf(n.metaboliteId, view.activeCondition);
          if (v == null) continue;
          const t = sc.t(Math.abs(v - center));
          if (m.property === 'radius') out.nodes[n.id].r = range[0] + t * (range[1] - range[0]);
          else out.nodes[n.id].opacity = range[0] + t * (range[1] - range[0]);
          out.nodes[n.id].value = v;
        }
        if (m.property === 'radius') out.legend.push({ kind: 'radius', title, domain: sc.domain, range: range as [number, number], unit: ds.unit });
      } else if (m.property === 'fill') {
        const diverging = compare !== 'absolute' || all.some((v) => v < 0);
        const sc = makeScale(all.map((v) => v - center), m.scale, diverging, m.domain);
        const pal = getPalette(m.palette ?? (diverging ? 'purple-orange' : 'plasma'));
        for (const n of nodes) {
          const v = valueOf(n.metaboliteId, view.activeCondition);
          if (v == null) continue;
          out.nodes[n.id].fill = samplePalette(pal, sc.t(v - center));
          out.nodes[n.id].value = v;
        }
        out.legend.push({ kind: 'color', title, domain: [sc.domain[0] + center, sc.domain[1] + center], palette: pal.id, diverging, unit: ds.unit });
      }
    }
  }

  if (style.showFluxValues) {
    for (const g of glyphs) {
      const rv = out.reactions[g.id];
      if (rv.valueLabel == null && rv.value != null) rv.valueLabel = String(+rv.value.toPrecision(3));
    }
  }
  if (anyReactionData && conditions.length > 1) {
    out.legend.unshift({ kind: 'conditions', title: 'Conditions', items: conditions.map((c) => ({ name: c.name, color: c.color })) });
  }
  return out;
}
