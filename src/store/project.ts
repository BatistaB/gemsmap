/**
 * The .gemsmap project format. Model/data and visual state are kept in separate
 * top-level keys so either can be replaced independently (e.g. swap the GEM,
 * keep the figure). Projects saved before the rename (MetMap, `.metmap`) are read as they are.
 */
import type { Condition, Dataset } from '../data/types';
import type { ID, MetabolicModel } from '../model/types';
import type { ModelMappingProfile } from '../templates/mapping/profile';
import type { AnimationSettings, CanvasSettings, StyleSettings, ViewState, VisualDoc, VisualizationMapping } from '../viz/types';

export interface SavedView {
  id: string;
  name: string;
  view: ViewState;
  mappings: VisualizationMapping[];
}

export const PROJECT_FORMAT = 'gemsmap';
export const PROJECT_EXTENSION = '.gemsmap';
/** Format tag and extension of projects saved as MetMap (≤ 0.2), still opened. */
export const LEGACY_PROJECT_FORMAT = 'metmap';
export const LEGACY_PROJECT_EXTENSION = '.metmap';
export const isProjectFormat = (format: unknown) => format === PROJECT_FORMAT || format === LEGACY_PROJECT_FORMAT;
/** Cheap check on the first bytes of a JSON file. */
export const looksLikeProject = (head: string) => head.includes('"format"') && /"(gemsmap|metmap)"/.test(head);

export interface ProjectFile {
  format: typeof PROJECT_FORMAT | typeof LEGACY_PROJECT_FORMAT;
  version: 1;
  name: string;
  /** --- biology & data --- */
  model: MetabolicModel | null;
  /** Confirmed template mappings for this model (templates/mapping/profile.ts). */
  mappingProfile?: ModelMappingProfile | null;
  datasets: Dataset[];
  conditions: Condition[];
  /** --- visualization --- */
  doc: VisualDoc;
  mappings: VisualizationMapping[];
  view: ViewState;
  savedViews: SavedView[];
  style: StyleSettings;
  canvas: CanvasSettings;
  animation: AnimationSettings;
}

let idPolicy: ((prefix: string) => string | null) | null = null;
/**
 * Template Design Mode gives new glyphs stable template ids (tpl_node_###, tpl_grp_###, tpl_lbl_###)
 * so a template keeps its element ids across saves; null restores random ids.
 */
export const setIdPolicy = (f: typeof idPolicy) => { idPolicy = f; };
export const uid = (p: string) => idPolicy?.(p) ?? `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export const emptyDoc = (): VisualDoc => ({ nodes: {}, reactions: {}, plots: {}, texts: {}, groups: {}, legend: { x: 420, y: 40, visible: true, auto: true } });

/** Where the legend is drawn (auto-placed right of the metabolites unless moved). */
export function legendPos(doc: VisualDoc): { x: number; y: number } {
  if (!doc.legend.auto) return { x: doc.legend.x, y: doc.legend.y };
  const ns = Object.values(doc.nodes);
  if (!ns.length) return { x: doc.legend.x, y: doc.legend.y };
  return { x: Math.max(...ns.map((n) => n.x)) + 150, y: Math.min(...ns.map((n) => n.y)) };
}

export const defaultStyle = (): StyleSettings => ({
  preset: 'nature', metaboliteLabel: 'id', reactionLabel: 'id', showFluxValues: false, currency: 'hide', nodeRadius: 7, baseEdgeWidth: 1.4, fontSize: 10,
});
export const defaultCanvas = (): CanvasSettings => ({ showGrid: true, snap: true, gridSize: 10, smartGuides: true });
export const defaultAnimation = (): AnimationSettings => ({ playing: false, loop: 'loop', stepSeconds: 1.2, particles: false });

export function emptyProject(): ProjectFile {
  return {
    format: PROJECT_FORMAT, version: 1, name: 'Untitled figure',
    model: null, datasets: [], conditions: [],
    doc: emptyDoc(), mappings: [], view: { activeCondition: '', compare: 'absolute', reference: '' }, savedViews: [],
    style: defaultStyle(), canvas: defaultCanvas(), animation: defaultAnimation(),
  };
}

/** Approximate world bounds of glyphs (labels included roughly). */
export function docBounds(doc: VisualDoc, nodeIds?: ID[]): { x: number; y: number; w: number; h: number } | null {
  const xs: number[] = [], ys: number[] = [];
  const ns = nodeIds ? nodeIds.map((id) => doc.nodes[id]).filter(Boolean) : Object.values(doc.nodes);
  for (const n of ns) { xs.push(n.x - 20, n.x + 50); ys.push(n.y - 16, n.y + 16); }
  if (!nodeIds) {
    for (const t of Object.values(doc.texts)) { xs.push(t.x, t.x + t.text.length * t.size * 0.55); ys.push(t.y - t.size, t.y + 4); }
    for (const p of Object.values(doc.plots)) {
      const a = plotAnchorApprox(doc, p.anchor);
      if (a) { xs.push(a.x + p.dx, a.x + p.dx + p.w); ys.push(a.y + p.dy, a.y + p.dy + p.h); }
    }
  }
  if (!xs.length) return null;
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function plotAnchorApprox(doc: VisualDoc, a: { kind: 'reaction' | 'node'; id: ID }): { x: number; y: number } | null {
  if (a.kind === 'node') { const n = doc.nodes[a.id]; return n ? { x: n.x, y: n.y } : null; }
  const g = doc.reactions[a.id];
  if (!g) return null;
  const ps = [...g.sources, ...g.targets].map((id) => doc.nodes[id]).filter(Boolean);
  if (!ps.length) return null;
  const S = g.sources.map((id) => doc.nodes[id]).filter(Boolean);
  const T = g.targets.map((id) => doc.nodes[id]).filter(Boolean);
  if (!S.length || !T.length) return { x: ps[0].x, y: ps[0].y };
  const cs = { x: S.reduce((s, n) => s + n.x, 0) / S.length, y: S.reduce((s, n) => s + n.y, 0) / S.length };
  const ct = { x: T.reduce((s, n) => s + n.x, 0) / T.length, y: T.reduce((s, n) => s + n.y, 0) / T.length };
  return { x: (cs.x + ct.x) / 2, y: (cs.y + ct.y) / 2 };
}
