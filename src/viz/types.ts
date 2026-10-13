/**
 * Visualization layer: glyphs on the canvas, data->visual mappings, styling.
 *
 * Glyphs *reference* model entities (metaboliteId / reactionId) but can also
 * exist unbound. An unbound node is a "slot": part of a reusable template map
 * that gets bound to real metabolites later (possibly from a different GEM).
 */
import type { ID } from '../model/types';

export interface Point {
  x: number;
  y: number;
}

export type LabelMode = 'id' | 'name' | 'custom';

export type LabelPos = 'right' | 'left' | 'top' | 'bottom' | 'center' | 'none';

export interface NodeGlyph {
  id: ID;
  x: number;
  y: number;
  /** Bound model metabolite. Undefined = template slot. */
  metaboliteId?: ID;
  /** Slot label shown while unbound, and default label override when bound. */
  label?: string;
  /** Candidate model ids / names used to auto-bind a slot (compartment-agnostic, e.g. "g6p"). */
  hints?: string[];
  labelPos?: LabelPos;
  /** Per-node label choice; undefined = follow the global Labels setting. */
  labelMode?: LabelMode;
  r?: number;
  fill?: string;
  locked?: boolean;
  /** 'label' draws the text itself as the node (KEGG / Nielsen-style maps); arrows stop at the text box. */
  shape?: 'circle' | 'label';
  /** Visual role: 'exchange' draws a dashed ring (e.g. pyr[e]). */
  role?: 'normal' | 'exchange';
  /** Set when the node was created from a model-agnostic pathway template (mapping provenance). */
  template?: TemplateSlotRef;
  /** Template Design Mode only: the template element this glyph draws (templates/design). */
  design?: DesignNodeRef;
  /**
   * A cofactor drawn beside one reaction arrow (ATP → ADP next to hexokinase): small text with a short curve
   * into the arrow. Visual only — never a reaction end, never mapped as a node of the pathway.
   */
  attach?: { glyph: ID; side: 'in' | 'out' };
}

/** Identity status of a template element, shown on the canvas in Template Design Mode. */
export type DesignStatus = 'confirmed' | 'suggested' | 'ambiguous' | 'unresolved';

/** A visual instance of a template metabolite, or a pathway port (link to another pathway). */
export interface DesignNodeRef {
  kind: 'metabolite' | 'port';
  /** tpl_met_### or tpl_port_### */
  id: string;
  status?: DesignStatus;
  conflict?: boolean;
}

/** Which template slot a node fills, and how it was mapped (templates/mapping/engine.ts). */
export interface TemplateSlotRef {
  templateId: string;
  templateVersion: string;
  slot: string;
  /** Canonical entity (templates/mapping/library.ts). */
  entity: string;
  /** Canonical compartment expected for this slot in the current model. */
  compartment: string | null;
  status: 'confirmed' | 'auto_high' | 'provisional' | 'ambiguous' | 'unresolved' | 'absent';
  /** Ranking score of the mapped candidate (heuristic, 0–1). */
  score?: number;
  method?: string;
}

export type Routing = 'straight' | 'curved' | 'orthogonal';

export interface ReactionGlyph {
  id: ID;
  /** Primary bound model reaction (data are read from this one). */
  reactionId?: ID;
  /** When one drawn arrow stands for a linear series of model reactions (e.g. ACONTa+ACONTb). */
  lumped?: ID[];
  /** True when the drawn direction (sources -> targets) is opposite to the model's stoichiometric direction. */
  reversedToModel?: boolean;
  sources: ID[];
  targets: ID[];
  label?: string;
  hints?: string[];
  /** EC numbers of the template step (preferred when several model reactions connect the ends). */
  ec?: string[];
  routing: Routing;
  /** Perpendicular offset of the midpoint (curvature) in world units. */
  bend?: number;
  /** Per-arrow label choice; undefined = follow the global Labels setting. */
  labelMode?: LabelMode;
  /** A summary arrow that hides a sub-network (expandable). */
  collapsed?: CollapsedInfo;
  /** Manual label placement relative to the arrow midpoint (e.g. the EC position of an imported map). */
  labelOffset?: Point;
  /** Label rotation in degrees (vertical EC numbers along vertical arrows). */
  labelAngle?: number;
  /** Put the label on the other side of the arrow. */
  labelFlip?: boolean;
  locked?: boolean;
  /** 'exchange' draws a dotted line, like transport/uptake arrows. */
  role?: 'normal' | 'exchange';
  /** Template Design Mode only: the template reaction (or pathway link) this arrow draws. */
  design?: { kind: 'reaction' | 'link'; id: string; status?: DesignStatus; reversible?: boolean | null };
}

/**
 * How the flux of a collapsed arrow is computed from its hidden reactions.
 *  entry: net flux leaving the source into the hidden segment (sum of entry steps) —
 *         equals the sum for parallel reactions and the through-flux for a series chain.
 */
export type Aggregate = 'entry' | 'sum' | 'mean' | 'min' | 'max';

export interface CollapsedInfo {
  /** Model reactions represented, with the sign that orients them along sources -> targets. */
  members: { reactionId: ID; sign: 1 | -1; entry: boolean }[];
  aggregate: Aggregate;
  topology: 'parallel' | 'series' | 'network';
  hidden: { nodes: NodeGlyph[]; reactions: ReactionGlyph[]; plots: PlotGlyph[]; groupOf: Record<ID, ID[]> };
  /** Position of the first source when collapsed, so hidden glyphs follow if the map moved. */
  anchor: Point;
  showBadge: boolean;
}

export type PlotType = 'bar' | 'line' | 'heatmap' | 'density' | 'box' | 'range';

export interface PlotGlyph {
  id: ID;
  anchor: { kind: 'reaction' | 'node'; id: ID };
  type: PlotType;
  /** Offset from the anchor point (so the plot follows its reaction). */
  dx: number;
  dy: number;
  w: number;
  h: number;
  /** Dataset shown; undefined = best available (samples > fva > flux). */
  datasetId?: string;
  title?: string;
  showConnector: boolean;
  showAxis: boolean;
  /** Base font size of the plot text (title = +1). */
  fontSize?: number;
  locked?: boolean;
}

export interface TextGlyph {
  id: ID;
  x: number;
  y: number;
  text: string;
  size: number;
  weight: 400 | 500 | 600 | 700;
  italic?: boolean;
  color?: string;
  kind: 'text' | 'panel' | 'title';
  /** Rotation in degrees around (x, y). */
  rotate?: number;
  locked?: boolean;
  /** Draw behind the map (large compartment / watermark titles). */
  background?: boolean;
}

export interface PathwayGroup {
  id: ID;
  kind: 'pathway' | 'compartment';
  /** Locked elements are skipped by clicks and box selection (hold 3 s to unlock). */
  locked?: boolean;
  title: string;
  subtitle?: string;
  /** Members drive the (auto-fitted) bounding box. */
  nodeIds: ID[];
  padding: number;
  fill: string;
  stroke: string;
  dashed: boolean;
  hidden?: boolean;
}

export interface LegendGlyph {
  x: number;
  y: number;
  visible: boolean;
  title?: string;
  /** Auto-place to the right of the content until the user moves it. */
  auto?: boolean;
  /** Size factor (1 = default); changed by dragging the corner handles or in the Inspector. */
  scale?: number;
}

/** The undoable visual document (layout + annotations). */
export interface VisualDoc {
  nodes: Record<ID, NodeGlyph>;
  reactions: Record<ID, ReactionGlyph>;
  plots: Record<ID, PlotGlyph>;
  texts: Record<ID, TextGlyph>;
  groups: Record<ID, PathwayGroup>;
  legend: LegendGlyph;
}

// ---------------------------------------------------------------- mappings

export type ScaleType = 'linear' | 'log' | 'sqrt' | 'percentile';
export type CompareMode = 'absolute' | 'difference' | 'foldchange' | 'log2fc';

export type ReactionProperty = 'width' | 'color' | 'opacity' | 'label';
export type NodeProperty = 'radius' | 'fill' | 'opacity';

export interface VisualizationMapping {
  id: string;
  datasetId: string;
  target: 'reaction' | 'metabolite';
  property: ReactionProperty | NodeProperty;
  scale: ScaleType;
  /** Use |value| for magnitude channels (width, radius). */
  magnitude: boolean;
  /** Custom domain; undefined = auto from all conditions (stable across condition switches). */
  domain?: [number, number];
  /** Output range for numeric channels (px or 0..1). */
  range?: [number, number];
  palette?: string;
  enabled: boolean;
}

export interface ViewState {
  activeCondition: string;
  compare: CompareMode;
  reference: string;
}

export type StylePresetId = 'nature' | 'cell' | 'minimal' | 'presentation' | 'dark' | 'grayscale';

export interface StyleSettings {
  preset: StylePresetId;
  metaboliteLabel: 'name' | 'id' | 'none';
  reactionLabel: 'id' | 'name' | 'none';
  showFluxValues: boolean;
  currency: 'hide' | 'inline';
  nodeRadius: number;
  baseEdgeWidth: number;
  fontSize: number;
  /** Reaction label (EC / ID) size; defaults to fontSize - 1. */
  reactionLabelSize?: number;
}

export interface CanvasSettings {
  showGrid: boolean;
  snap: boolean;
  gridSize: number;
  smartGuides: boolean;
}

export interface AnimationSettings {
  playing: boolean;
  loop: 'loop' | 'pingpong' | 'once';
  /** Seconds per condition step. */
  stepSeconds: number;
  particles: boolean;
}
