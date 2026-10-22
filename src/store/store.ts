import { create } from 'zustand';
import { buildDataset, parseTable, remapDataset } from '../data/csv';
import type { Condition, Dataset } from '../data/types';
import { align, applyLayout, distribute, tidy, type AlignKind, type LayoutKind, type LayoutOptions, type LEdge, type LNode } from '../layout/layouts';
import { baseId, mainParticipants } from '../model/currency';
import { expand, shortestPath, type Step } from '../model/graph';
import { withFamilyParents, withoutVirtual } from '../model/families';
import { validateModel } from '../model/importers';
import type { ID, MetabolicModel, ValidationIssue } from '../model/types';
import { autoBind, bindReactionGlyph, loadUserTemplates, saveUserTemplates, templateFromSelection, type MapTemplate } from '../templates/templates';
import { addPathwayToDoc, remapDocTemplates, specById } from '../templates/instantiate';
import type { CanonicalCompartment } from '../templates/mapping/compartments';
import type { TemplateMapping } from '../templates/mapping/engine';
import { indexModel } from '../templates/mapping/modelIndex';
import { loadProfile, mergeProfileIntoStorage, saveProfile, withEntry, withoutEntry } from '../templates/mapping/profile';
import { siblingsByCompartment, withSiblingEntries } from '../templates/mapping/siblings';
import type { PathwayTemplateSpec } from '../templates/spec';
import { reconcile } from '../templates/design/convert';
import type { TemplateFile } from '../templates/format/schema';
import { followAttached } from '../viz/attached';
import { CONDITION_COLORS } from '../viz/palettes';
import type {
  AnimationSettings, CanvasSettings, NodeGlyph, PathwayGroup, PlotGlyph, PlotType, Point, ReactionGlyph, StyleSettings, TextGlyph, ViewState, VisualDoc, VisualizationMapping,
} from '../viz/types';
import { collapseGlyphs, expandCollapsed, glyphsBetween } from './collapse';
import { docBounds, emptyDoc, emptyProject, plotAnchorApprox, PROJECT_FORMAT, uid, type ProjectFile, type SavedView } from './project';

export type SelKind = 'node' | 'reaction' | 'plot' | 'text' | 'group' | 'legend';
export type SelKey = string; // `${SelKind}:${id}`
export const key = (k: SelKind, id: string): SelKey => `${k}:${id}`;
export const parseKey = (k: SelKey): [SelKind, string] => { const i = k.indexOf(':'); return [k.slice(0, i) as SelKind, k.slice(i + 1)]; };

export type Tool = 'select' | 'metabolite' | 'slot' | 'reaction' | 'text' | 'pan';

/**
 * A template waiting to be placed: a light preview of it follows the mouse over the canvas and a click drops it
 * there (Esc cancels). `preview` is the drawing built at the origin, exactly as it will be inserted.
 */
export type Placement =
  | { kind: 'pathway'; name: string; spec: PathwayTemplateSpec; mapping: TemplateMapping | null; preview: VisualDoc }
  | { kind: 'template'; name: string; template: MapTemplate; preview: VisualDoc }
  /** model reactions from COBRAGUI ("Add to map"), drawn as a new block with their own metabolite nodes */
  | { kind: 'reactions'; name: string; preview: VisualDoc };

export type Dialog =
  | { kind: 'reaction'; sources: ID[]; targets: ID[] }
  | { kind: 'metabolite'; at: Point; bindNodeId?: ID }
  | { kind: 'export' }
  | { kind: 'path' }
  | { kind: 'saveTemplate' }
  | { kind: 'templateMapping'; templateId: string; at?: Point }
  | { kind: 'importReport'; datasetId: string }
  | { kind: 'validation' }
  | { kind: 'help' }
  | { kind: 'routes'; from: ID; to: ID; replaceGlyph?: ID }
  /** Template Design Mode: define the biological identity of a node's metabolite, or of a template reaction. */
  | { kind: 'identity'; nodeId?: ID; entityId?: string; reactionId?: string; query?: string };

interface Snapshot {
  doc: VisualDoc;
  mappings: VisualizationMapping[];
  style: StyleSettings;
  datasets: Dataset[];
  conditions: Condition[];
  model: MetabolicModel | null;
  design: TemplateFile | null;
}

export interface EditorState extends ProjectFile {
  selection: SelKey[];
  camera: { x: number; y: number; k: number };
  viewport: { w: number; h: number };
  tool: Tool;
  past: Snapshot[];
  future: Snapshot[];
  dialog: Dialog | null;
  /** A template being placed with the mouse (Canvas draws its preview). */
  placing: Placement | null;
  contextMenu: { x: number; y: number; target: SelKey | null; world: Point } | null;
  paletteOpen: boolean;
  toast: { text: string; id: number } | null;
  leftTab: 'elements' | 'model' | 'data';
  /** Inspector → Connected reactions: hide reactions whose flux is zero in every condition. */
  hideZeroReactions: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  userTemplates: MapTemplate[];
  validation: ValidationIssue[];
  layoutSpacing: number;
  /**
   * Template Design Mode: the biology of the template being edited (the doc is its layout).
   * null in the Map Builder. Set and cleared only by templates/design/session.ts.
   */
  design: TemplateFile | null;
}

type Set = (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void;
type Get = () => EditorState;

const snap = (s: EditorState): Snapshot => ({ doc: s.doc, mappings: s.mappings, style: s.style, datasets: s.datasets, conditions: s.conditions, model: s.model, design: s.design });

let clipboard: { nodes: NodeGlyph[]; reactions: ReactionGlyph[]; texts: TextGlyph[]; plots: PlotGlyph[] } | null = null;
let toastId = 0;

/** An empty drawing for template previews (no legend). */
const previewBase = (): VisualDoc => { const d = emptyDoc(); return { ...d, legend: { ...d.legend, visible: false } }; };

/** A simple (non-pathway) template drawn into `base` with its top-left node at `c`. */
function templateDrawing(base: VisualDoc, t: MapTemplate, c: Point, snapV: (v: number) => number): { doc: VisualDoc; ids: Map<string, ID>; textIds: ID[] } {
  const b = { x: Math.min(...t.nodes.map((n) => n.x)), y: Math.min(...t.nodes.map((n) => n.y)) };
  const ids = new Map<string, ID>();
  const textIds: ID[] = [];
  const doc: VisualDoc = { ...base, nodes: { ...base.nodes }, reactions: { ...base.reactions }, groups: { ...base.groups }, texts: { ...base.texts } };
  for (const n of t.nodes) {
    const id = uid('n');
    ids.set(n.key, id);
    doc.nodes[id] = { id, x: snapV(c.x + n.x - b.x), y: snapV(c.y + n.y - b.y), label: n.label, hints: n.hints, labelPos: n.labelPos, role: n.role };
  }
  for (const r of t.reactions) {
    const id = uid('r');
    doc.reactions[id] = { id, sources: r.sources.map((k) => ids.get(k)!), targets: r.targets.map((k) => ids.get(k)!), label: r.label, hints: r.hints, routing: r.routing ?? 'straight', bend: r.bend, role: r.role };
  }
  for (const g of t.groups ?? []) {
    const id = uid('g');
    doc.groups[id] = { id, kind: g.kind, title: g.title, nodeIds: g.keys.map((k) => ids.get(k)!).filter(Boolean), padding: 24, fill: 'none', stroke: 'none', dashed: false };
  }
  for (const tx of t.texts ?? []) { const id = uid('t'); textIds.push(id); doc.texts[id] = { id, ...tx, x: c.x + tx.x - b.x, y: c.y + tx.y - b.y }; }
  return { doc, ids, textIds };
}

function createActions(set: Set, get: Get) {
  /** Apply an undoable change. In Template Design Mode, biology and drawing are reconciled (templates/design/convert.ts). */
  const commit = (fn: (s: EditorState) => Partial<EditorState>) =>
    set((s) => {
      const patch = fn(s);
      // cofactors drawn beside an arrow move with it (drag, nudge, layouts, bend)
      if (patch.doc && patch.doc !== s.doc) patch.doc = followAttached(s.doc, patch.doc);
      const out: Partial<EditorState> = { ...patch, past: [...s.past, snap(s)].slice(-150), future: [] };
      const design = patch.design !== undefined ? patch.design : s.design;
      if (design && (patch.doc || patch.design)) {
        const r = reconcile(design, patch.doc ?? s.doc, s.doc);
        out.doc = r.doc;
        out.design = r.file;
      }
      return out;
    });
  const patchDoc = (fn: (d: VisualDoc, s: EditorState) => VisualDoc) => commit((s) => ({ doc: fn(s.doc, s) }));
  const toast = (text: string) => set({ toast: { text, id: ++toastId } });

  const selectedIds = (kind: SelKind) => get().selection.filter((k) => k.startsWith(kind + ':')).map((k) => parseKey(k)[1]);

  /** Nodes affected by the selection (groups and reactions expand to their nodes). */
  const selectedNodeIds = (): ID[] => {
    const s = get();
    const out = new globalThis.Set<ID>();
    for (const k of s.selection) {
      const [kind, id] = parseKey(k);
      if (kind === 'node') out.add(id);
      else if (kind === 'group') s.doc.groups[id]?.nodeIds.forEach((n) => out.add(n));
      else if (kind === 'reaction') { const g = s.doc.reactions[id]; g?.sources.concat(g.targets).forEach((n) => out.add(n)); }
    }
    return [...out].filter((id) => s.doc.nodes[id] && !s.doc.nodes[id].locked);
  };

  const snapV = (v: number) => { const c = get().canvas; return c.snap ? Math.round(v / c.gridSize) * c.gridSize : v; };

  const setPositions = (pos: Record<ID, Point>, doSnap = true) =>
    patchDoc((d) => {
      const nodes = { ...d.nodes };
      for (const [id, p] of Object.entries(pos)) if (nodes[id]) nodes[id] = { ...nodes[id], x: doSnap ? snapV(p.x) : p.x, y: doSnap ? snapV(p.y) : p.y };
      return { ...d, nodes };
    });

  const layoutInput = (ids: ID[]): { nodes: LNode[]; edges: LEdge[] } => {
    const d = get().doc;
    const set_ = new globalThis.Set(ids);
    const edges: LEdge[] = [];
    for (const g of Object.values(d.reactions)) {
      // main edge: first source -> every target (secondary substrates don't define the order)
      const s = g.sources.find((x) => set_.has(x));
      if (!s) continue;
      for (const t of g.targets) if (set_.has(t)) edges.push([s, t]);
    }
    return { nodes: ids.map((id) => ({ id, x: d.nodes[id].x, y: d.nodes[id].y })), edges };
  };

  const ensureConditions = (names: string[], existing: Condition[]): { conditions: Condition[]; ids: string[] } => {
    const conditions = [...existing];
    const ids = names.map((n) => {
      const hit = conditions.find((c) => c.name.toLowerCase() === n.toLowerCase() || c.id === n);
      if (hit) return hit.id;
      const t = Number(n.replace(/[^\d.]/g, ''));
      const c: Condition = { id: n, name: n, color: CONDITION_COLORS[conditions.length % CONDITION_COLORS.length], time: /\d/.test(n) && Number.isFinite(t) ? t : undefined };
      conditions.push(c);
      return c.id;
    });
    return { conditions, ids };
  };

  /** Place the result of a graph expansion around an anchor node. */
  const addSteps = (anchorId: ID, steps: Step[], dirHint: 'down' | 'up') => {
    const s = get();
    const doc = s.doc;
    const nodes = { ...doc.nodes };
    const reactions = { ...doc.reactions };
    const byMet = new Map<ID, ID>();
    for (const n of Object.values(nodes)) if (n.metaboliteId) byMet.set(n.metaboliteId, n.id);
    const anchor = nodes[anchorId];
    const sp = s.layoutSpacing;
    const levelCount = new Map<number, number>();
    const level = new Map<ID, number>([[anchor.metaboliteId!, 0]]);
    const added: ID[] = [];
    for (const st of steps) {
      const fromM = dirHint === 'down' ? st.from : st.to;
      const newM = dirHint === 'down' ? st.to : st.from;
      const lv = (level.get(fromM) ?? 0) + 1;
      if (!byMet.has(newM)) {
        const k = levelCount.get(lv) ?? 0;
        levelCount.set(lv, k + 1);
        const id = uid('n');
        const offset = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * sp * 1.2;
        nodes[id] = { id, x: snapV(anchor.x + offset), y: snapV(anchor.y + (dirHint === 'down' ? 1 : -1) * lv * sp), metaboliteId: newM };
        byMet.set(newM, id);
        level.set(newM, lv);
        added.push(id);
      }
      const a = byMet.get(st.from)!, b = byMet.get(st.to)!;
      // one hyperedge per model reaction: merge extra participants into the existing arrow
      const same = Object.values(reactions).find((g) => g.reactionId === st.reactionId && !!g.reversedToModel === st.reversed);
      if (same) {
        if (!same.sources.includes(a) || !same.targets.includes(b)) {
          reactions[same.id] = { ...same, sources: same.sources.includes(a) ? same.sources : [...same.sources, a], targets: same.targets.includes(b) ? same.targets : [...same.targets, b] };
        }
      } else {
        const id = uid('r');
        reactions[id] = { id, reactionId: st.reactionId, sources: [a], targets: [b], routing: 'straight', reversedToModel: st.reversed };
      }
    }
    commit((st) => ({ doc: { ...st.doc, nodes, reactions }, selection: [anchorId, ...added].map((id) => key('node', id)) }));
    return added.length;
  };

  const actions = {
    commit,
    toast,
    undo: () => set((s) => (s.past.length ? { ...s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [snap(s), ...s.future] } : {})),
    redo: () => set((s) => (s.future.length ? { ...s.future[0], future: s.future.slice(1), past: [...s.past, snap(s)] } : {})),
    /** Start of a drag: record one undo step for the whole gesture. */
    beginGesture: () => set((s) => ({ past: [...s.past, snap(s)].slice(-150), future: [] })),
    /** Non-recorded update (during a drag). */
    live: (fn: (d: VisualDoc) => VisualDoc) => set((s) => ({ doc: followAttached(s.doc, fn(s.doc)) })),

    // ---------------------------------------------------------- selection
    select: (keys: SelKey[], additive = false) =>
      set((s) => ({ selection: additive ? Array.from(new globalThis.Set([...s.selection, ...keys])) : keys })),
    toggleSelect: (k: SelKey) => set((s) => ({ selection: s.selection.includes(k) ? s.selection.filter((x) => x !== k) : [...s.selection, k] })),
    clearSelection: () => set({ selection: [] }),
    selectAll: () => set((s) => {
      const free = <T extends { locked?: boolean }>(t: Record<string, T>, kind: SelKind) => Object.entries(t).filter(([, v]) => !v.locked).map(([id]) => key(kind, id));
      return { selection: [...free(s.doc.nodes, 'node'), ...free(s.doc.reactions, 'reaction'), ...free(s.doc.texts, 'text'), ...free(s.doc.plots, 'plot')] };
    }),
    selectedIds,
    selectedNodeIds,

    // ---------------------------------------------------------- creation
    addNode: (p: Point, init: Partial<NodeGlyph> = {}): ID => {
      const id = uid('n');
      patchDoc((d) => ({ ...d, nodes: { ...d.nodes, [id]: { id, x: snapV(p.x), y: snapV(p.y), ...init } } }));
      set({ selection: [key('node', id)] });
      return id;
    },
    addReaction: (sources: ID[], targets: ID[], init: Partial<ReactionGlyph> = {}, autobind = true): ID => {
      const id = uid('r');
      const s = get();
      const g: ReactionGlyph = { id, sources, targets, routing: 'straight', ...init };
      if (!g.reactionId && s.model && autobind) bindReactionGlyph(g, s.doc.nodes, s.model);
      patchDoc((d) => ({ ...d, reactions: { ...d.reactions, [id]: g } }));
      set({ selection: [key('reaction', id)] });
      return id;
    },
    /** Dropping a connection: ask which model reaction (or create a free arrow). */
    requestConnection: (a: ID, b: ID) => set({ dialog: { kind: 'reaction', sources: [a], targets: [b] } }),
    /** Create a reaction glyph with new participant nodes from a model reaction. */
    addModelReaction: (rid: ID, near?: Point) => {
      const s = get();
      const r = s.model?.reactions[rid];
      if (!r) return;
      const { substrates, products } = mainParticipants(r, s.model!.metabolites);
      const nodes = { ...s.doc.nodes };
      const c = near ?? { x: (s.viewport.w / 2 - s.camera.x) / s.camera.k, y: (s.viewport.h / 2 - s.camera.y) / s.camera.k };
      // always new copies of the participants; drag one onto the same metabolite to merge (mergeNodes)
      const place = (mets: ID[], y: number) => mets.map((m, i) => {
        const id = uid('n');
        nodes[id] = { id, x: snapV(c.x + (i - (mets.length - 1) / 2) * 80), y: snapV(y), metaboliteId: m };
        return id;
      });
      const src = place(substrates, c.y - 30);
      const tgt = place(products, c.y + 30);
      const id = uid('r');
      commit((st) => ({ doc: { ...st.doc, nodes, reactions: { ...st.doc.reactions, [id]: { id, reactionId: rid, sources: src, targets: tgt, routing: 'straight' } } }, selection: [key('reaction', id)] }));
    },
    /**
     * Add model reactions in one undoable step (COBRAGUI → "Add to map"). Every metabolite gets a new node:
     * nodes already on the map are never reused (repeat a metabolite instead of pulling arrows across the
     * map; merge copies by hand if wanted). Inside the new block the reactions share their metabolites, so
     * a subsystem stays connected. Reactions already drawn are skipped; currency metabolites are left out.
     * place = true: the block follows the mouse until a click drops it (like a template); otherwise it is
     * inserted at the centre of the view.
     */
    addModelReactions: (rids: ID[], layout: LayoutKind | 'none' = 'vertical', place = false) => {
      const s = get();
      const model = s.model;
      if (!model) return { added: 0, skipped: rids.length, boundary: 0 };
      const present = new globalThis.Set<ID>();
      for (const g of Object.values(s.doc.reactions)) for (const r of [g.reactionId, ...(g.lumped ?? []), ...(g.collapsed?.members.map((m) => m.reactionId) ?? [])]) if (r) present.add(r);
      const todo = rids.filter((r) => model.reactions[r] && !present.has(r));
      const doc = previewBase();
      const byMet = new Map<ID, ID>();
      const cols = Math.max(2, Math.ceil(Math.sqrt(todo.length * 2)));
      let k = 0;
      const node = (m: ID) => {
        const hit = byMet.get(m);
        if (hit) return hit;
        const id = uid('n');
        const i = k++;
        doc.nodes[id] = { id, x: (i % cols) * s.layoutSpacing * 1.4, y: Math.floor(i / cols) * s.layoutSpacing, metaboliteId: m };
        byMet.set(m, id);
        return id;
      };
      let added = 0, boundary = 0;
      for (const rid of todo) {
        const r = model.reactions[rid];
        const { substrates, products } = mainParticipants(r, model.metabolites);
        if (!substrates.length || !products.length) { boundary++; continue; }
        const src = substrates.map(node), tgt = products.map(node);
        const id = uid('r');
        doc.reactions[id] = { id, reactionId: rid, sources: src, targets: tgt, routing: 'straight' };
        added++;
      }
      const counts = { added, skipped: rids.length - added - boundary, boundary };
      if (!added) return counts;
      const ids = Object.keys(doc.nodes);
      if (layout !== 'none' && ids.length >= 2) {
        const edges: LEdge[] = [];
        for (const g of Object.values(doc.reactions)) for (const t of g.targets) edges.push([g.sources[0], t]);
        const pos = applyLayout(layout, ids.map((id) => ({ id, x: doc.nodes[id].x, y: doc.nodes[id].y })), edges, { spacing: s.layoutSpacing });
        for (const [id, p] of Object.entries(pos)) doc.nodes[id] = { ...doc.nodes[id], x: p.x, y: p.y };
      }
      const name = added === 1 ? Object.values(doc.reactions)[0].reactionId! : `${added} reactions`;
      if (place) { actions.beginPlacing({ kind: 'reactions', name, preview: doc }); return counts; }
      const c = { x: (s.viewport.w / 2 - s.camera.x) / s.camera.k, y: (s.viewport.h / 3 - s.camera.y) / s.camera.k };
      const bb = docBounds(doc) ?? { x: 0, y: 0, w: 0, h: 0 };
      actions.insertBlock(doc, { x: snapV(c.x - (bb.x + bb.w / 2)), y: snapV(c.y - (bb.y + bb.h / 2)) });
      return counts;
    },
    /** Insert the nodes and reactions of a block drawn at the origin, shifted by `at` (one undoable step). */
    insertBlock: (block: VisualDoc, at: Point) => {
      const nodes = { ...get().doc.nodes };
      for (const n of Object.values(block.nodes)) nodes[n.id] = { ...n, x: snapV(n.x + at.x), y: snapV(n.y + at.y) };
      commit((st) => ({ doc: { ...st.doc, nodes, reactions: { ...st.doc.reactions, ...block.reactions } }, selection: Object.keys(block.nodes).map((n) => key('node', n)) }));
    },
    addModelMetabolites: (mids: ID[]) => {
      const s = get();
      if (!s.model) return 0;
      const have = new globalThis.Set(Object.values(s.doc.nodes).map((n) => n.metaboliteId));
      const todo = mids.filter((m) => s.model!.metabolites[m] && !have.has(m));
      const c = { x: (s.viewport.w / 2 - s.camera.x) / s.camera.k, y: (s.viewport.h / 3 - s.camera.y) / s.camera.k };
      const cols = Math.max(1, Math.ceil(Math.sqrt(todo.length)));
      const nodes = { ...s.doc.nodes };
      const ids = todo.map((m, i) => { const id = uid('n'); nodes[id] = { id, x: snapV(c.x + (i % cols) * s.layoutSpacing * 1.4), y: snapV(c.y + Math.floor(i / cols) * s.layoutSpacing), metaboliteId: m }; return id; });
      if (ids.length) commit((st) => ({ doc: { ...st.doc, nodes }, selection: ids.map((id) => key('node', id)) }));
      return ids.length;
    },
    addMetaboliteFromModel: (mid: ID, p?: Point) => {
      const s = get();
      const c = p ?? { x: (s.viewport.w / 2 - s.camera.x) / s.camera.k, y: (s.viewport.h / 2 - s.camera.y) / s.camera.k };
      return actions.addNode(c, { metaboliteId: mid });
    },
    addText: (p: Point, init: Partial<TextGlyph> = {}) => {
      const id = uid('t');
      patchDoc((d) => ({ ...d, texts: { ...d.texts, [id]: { id, x: snapV(p.x), y: snapV(p.y), text: 'Text', size: 12, weight: 400, kind: 'text', ...init } } }));
      set({ selection: [key('text', id)], tool: 'select' });
      return id;
    },
    addPlot: (anchor: PlotGlyph['anchor'], type: PlotType = 'density') => {
      const s = get();
      const a = plotAnchorApprox(s.doc, anchor);
      if (!a) return;
      const id = uid('p');
      const existing = Object.values(s.doc.plots).filter((p) => p.anchor.id === anchor.id).length;
      patchDoc((d) => ({ ...d, plots: { ...d.plots, [id]: { id, anchor, type, dx: 60, dy: -45 + existing * 100, w: 140, h: 90, showConnector: true, showAxis: true } } }));
      set({ selection: [key('plot', id)] });
    },
    addPlotsForSelection: (type: PlotType) => {
      const rids = selectedIds('reaction');
      if (!rids.length) return toast('Select one or more reactions first');
      for (const r of rids) actions.addPlot({ kind: 'reaction', id: r }, type);
    },

    // ---------------------------------------------------------- updates
    updateNode: (id: ID, p: Partial<NodeGlyph>) => patchDoc((d) => ({ ...d, nodes: { ...d.nodes, [id]: { ...d.nodes[id], ...p } } })),
    updateReaction: (id: ID, p: Partial<ReactionGlyph>) => patchDoc((d) => ({ ...d, reactions: { ...d.reactions, [id]: { ...d.reactions[id], ...p } } })),
    updatePlot: (id: ID, p: Partial<PlotGlyph>) => patchDoc((d) => ({ ...d, plots: { ...d.plots, [id]: { ...d.plots[id], ...p } } })),
    updateText: (id: ID, p: Partial<TextGlyph>) => patchDoc((d) => ({ ...d, texts: { ...d.texts, [id]: { ...d.texts[id], ...p } } })),
    updateGroup: (id: ID, p: Partial<PathwayGroup>) => patchDoc((d) => ({ ...d, groups: { ...d.groups, [id]: { ...d.groups[id], ...p } } })),
    updateNodes: (ids: ID[], p: Partial<NodeGlyph>) => patchDoc((d) => { const nodes = { ...d.nodes }; for (const id of ids) nodes[id] = { ...nodes[id], ...p }; return { ...d, nodes }; }),
    updateReactions: (ids: ID[], p: Partial<ReactionGlyph>) => patchDoc((d) => { const r = { ...d.reactions }; for (const id of ids) r[id] = { ...r[id], ...p }; return { ...d, reactions: r }; }),
    reverseReaction: (id: ID) => patchDoc((d) => { const g = d.reactions[id]; return { ...d, reactions: { ...d.reactions, [id]: { ...g, sources: g.targets, targets: g.sources, reversedToModel: g.reactionId ? !g.reversedToModel : undefined } } }; }),

    bindNode: (nodeId: ID, mid: ID) => {
      const s = get();
      if (s.doc.nodes[nodeId]?.template) return actions.setTemplateMapping(nodeId, mid);
      const nodes = { ...s.doc.nodes, [nodeId]: { ...s.doc.nodes[nodeId], metaboliteId: mid } };
      const reactions = { ...s.doc.reactions };
      if (s.model) {
        for (const g of Object.values(reactions)) {
          if (!g.reactionId && (g.sources.includes(nodeId) || g.targets.includes(nodeId))) {
            const c = { ...g };
            if (bindReactionGlyph(c, nodes, s.model)) reactions[g.id] = c;
          }
        }
      }
      commit((st) => ({ doc: { ...st.doc, nodes, reactions } }));
    },
    unbindNode: (nodeId: ID) => patchDoc((d) => {
      const n = d.nodes[nodeId];
      const hints = n.metaboliteId ? Array.from(new globalThis.Set([baseId(n.metaboliteId), ...(n.hints ?? [])])) : n.hints;
      return { ...d, nodes: { ...d.nodes, [nodeId]: { ...n, metaboliteId: undefined, hints, label: n.label ?? (n.metaboliteId ? baseId(n.metaboliteId) : undefined) } } };
    }),
    autoBindAll: () => {
      const s = get();
      if (!s.model) return toast('Load a GEM first (Model tab → Import)');
      const t = remapDocTemplates(s.doc, s.model);
      const r = autoBind(t.doc, s.model);
      commit(() => ({ doc: r.doc }));
      toast(`Bound ${r.nodes}/${r.totalNodes} slots and ${r.reactions}/${r.totalReactions} reactions to ${s.model.name}`
        + (t.total ? ` · template nodes: ${t.mapped}/${t.total} mapped${t.review ? `, ${t.review} to review` : ''}` : ''));
    },

    deleteSelection: () => {
      const s = get();
      if (!s.selection.length) return;
      const del = { node: new globalThis.Set<ID>(), reaction: new globalThis.Set<ID>(), plot: new globalThis.Set<ID>(), text: new globalThis.Set<ID>(), group: new globalThis.Set<ID>() };
      for (const k of s.selection) { const [kind, id] = parseKey(k); if (kind !== 'legend') del[kind].add(id); }
      commit((st) => {
        const d = st.doc;
        const nodes = { ...d.nodes };
        del.node.forEach((id) => { if (!nodes[id]?.locked) delete nodes[id]; });
        const reactions: Record<ID, ReactionGlyph> = {};
        for (const g of Object.values(d.reactions)) {
          if (del.reaction.has(g.id)) continue;
          const sources = g.sources.filter((x) => nodes[x]);
          const targets = g.targets.filter((x) => nodes[x]);
          if (sources.length && targets.length) reactions[g.id] = sources.length === g.sources.length && targets.length === g.targets.length ? g : { ...g, sources, targets };
        }
        // cofactors drawn beside a deleted arrow go with it
        for (const n of Object.values(nodes)) if (n.attach && !reactions[n.attach.glyph] && !n.locked) delete nodes[n.id];
        const plots: Record<ID, PlotGlyph> = {};
        for (const p of Object.values(d.plots)) {
          if (del.plot.has(p.id)) continue;
          if (p.anchor.kind === 'reaction' ? reactions[p.anchor.id] : nodes[p.anchor.id]) plots[p.id] = p;
        }
        const texts = { ...d.texts };
        del.text.forEach((id) => delete texts[id]);
        const groups: Record<ID, PathwayGroup> = {};
        for (const g of Object.values(d.groups)) {
          if (del.group.has(g.id)) continue;
          const nodeIds = g.nodeIds.filter((x) => nodes[x]);
          if (nodeIds.length) groups[g.id] = { ...g, nodeIds };
        }
        return { doc: { ...d, nodes, reactions, plots, texts, groups }, selection: [] };
      });
    },

    copy: () => {
      const s = get();
      const nodeIds = new globalThis.Set(selectedIds('node'));
      clipboard = {
        nodes: [...nodeIds].map((id) => s.doc.nodes[id]),
        reactions: Object.values(s.doc.reactions).filter((g) => g.sources.every((x) => nodeIds.has(x)) && g.targets.every((x) => nodeIds.has(x))),
        texts: selectedIds('text').map((id) => s.doc.texts[id]),
        plots: Object.values(s.doc.plots).filter((p) => s.selection.includes(key('plot', p.id))),
      };
    },
    paste: (offset = 30) => {
      if (!clipboard) return;
      const cb = clipboard;
      const map = new Map<ID, ID>();
      commit((s) => {
        const d = s.doc;
        const nodes = { ...d.nodes }, reactions = { ...d.reactions }, texts = { ...d.texts }, plots = { ...d.plots };
        const sel: SelKey[] = [];
        for (const n of cb.nodes) { const id = uid('n'); map.set(n.id, id); nodes[id] = { ...n, id, x: n.x + offset, y: n.y + offset }; sel.push(key('node', id)); }
        for (const g of cb.reactions) { const id = uid('r'); map.set(g.id, id); reactions[id] = { ...g, id, sources: g.sources.map((x) => map.get(x)!), targets: g.targets.map((x) => map.get(x)!) }; }
        // pasted cofactor drawings follow their pasted arrow (or become plain labels)
        for (const n of cb.nodes) {
          const id = map.get(n.id)!;
          if (!nodes[id].attach) continue;
          const glyph = map.get(nodes[id].attach!.glyph);
          nodes[id] = glyph ? { ...nodes[id], attach: { ...nodes[id].attach!, glyph } } : { ...nodes[id], attach: undefined };
        }
        for (const t of cb.texts) { const id = uid('t'); texts[id] = { ...t, id, x: t.x + offset, y: t.y + offset }; sel.push(key('text', id)); }
        for (const p of cb.plots) { const a = map.get(p.anchor.id); if (a) { const id = uid('p'); plots[id] = { ...p, id, anchor: { ...p.anchor, id: a } }; } }
        return { doc: { ...d, nodes, reactions, texts, plots }, selection: sel };
      });
    },
    duplicate: () => { actions.copy(); actions.paste(40); },

    /** Lock the selection: locked items are skipped by clicks and box selection until unlocked (hold 3 s). */
    toggleLock: () => {
      const keys = get().selection.filter((k) => !k.startsWith('legend:'));
      if (!keys.length) return toast('Select something to lock');
      commit((st) => {
        const d = st.doc;
        const doc: VisualDoc = { ...d, nodes: { ...d.nodes }, reactions: { ...d.reactions }, texts: { ...d.texts }, plots: { ...d.plots }, groups: { ...d.groups } };
        for (const k of keys) {
          const [kind, id] = parseKey(k);
          const table = kind === 'node' ? doc.nodes : kind === 'reaction' ? doc.reactions : kind === 'text' ? doc.texts : kind === 'plot' ? doc.plots : kind === 'group' ? doc.groups : null;
          if (table && table[id]) (table as Record<string, { locked?: boolean }>)[id] = { ...table[id], locked: true };
        }
        return { doc, selection: [] };
      });
      toast(`Locked ${keys.length} item(s) — they are now skipped by clicks and box selection. Hold the mouse 3 s on one (or right-click) to unlock.`);
    },
    isLocked: (k: SelKey): boolean => {
      const [kind, id] = parseKey(k);
      const d = get().doc;
      const item = kind === 'node' ? d.nodes[id] : kind === 'reaction' ? d.reactions[id] : kind === 'text' ? d.texts[id] : kind === 'plot' ? d.plots[id] : kind === 'group' ? d.groups[id] : undefined;
      return !!(item as { locked?: boolean } | undefined)?.locked;
    },
    unlock: (k: SelKey) => {
      const [kind, id] = parseKey(k);
      commit((st) => {
        const d = st.doc;
        const upd = <T extends { locked?: boolean }>(t: Record<string, T>) => (t[id] ? { ...t, [id]: { ...t[id], locked: false } } : t);
        const doc: VisualDoc = kind === 'node' ? { ...d, nodes: upd(d.nodes) } : kind === 'reaction' ? { ...d, reactions: upd(d.reactions) } : kind === 'text' ? { ...d, texts: upd(d.texts) } : kind === 'plot' ? { ...d, plots: upd(d.plots) } : kind === 'group' ? { ...d, groups: upd(d.groups) } : d;
        return { doc, selection: [k] };
      });
      toast('Unlocked');
    },

    // ---------------------------------------------------------- moving
    /** Move selection by a world delta relative to the gesture start positions. */
    moveFrom: (start: Record<string, Point>, dx: number, dy: number) =>
      set((s) => {
        const d = s.doc;
        const nodes = { ...d.nodes }, texts = { ...d.texts }, plots = { ...d.plots };
        let legend = d.legend;
        for (const [k, p] of Object.entries(start)) {
          const [kind, id] = parseKey(k);
          if (kind === 'node' && nodes[id]) nodes[id] = { ...nodes[id], x: p.x + dx, y: p.y + dy };
          else if (kind === 'text' && texts[id]) texts[id] = { ...texts[id], x: p.x + dx, y: p.y + dy };
          else if (kind === 'plot' && plots[id]) plots[id] = { ...plots[id], dx: p.x + dx, dy: p.y + dy };
          else if (kind === 'legend') legend = { ...legend, x: p.x + dx, y: p.y + dy, auto: false };
        }
        return { doc: followAttached(d, { ...d, nodes, texts, plots, legend }) };
      }),
    nudge: (dx: number, dy: number) => {
      const ids = selectedNodeIds();
      const tids = selectedIds('text');
      if (!ids.length && !tids.length) return;
      patchDoc((d) => {
        const nodes = { ...d.nodes }, texts = { ...d.texts };
        for (const id of ids) nodes[id] = { ...nodes[id], x: nodes[id].x + dx, y: nodes[id].y + dy };
        for (const id of tids) texts[id] = { ...texts[id], x: texts[id].x + dx, y: texts[id].y + dy };
        return { ...d, nodes, texts };
      });
    },

    // ---------------------------------------------------------- layout
    layoutSelection: (kind: LayoutKind, opts: Partial<LayoutOptions> = {}) => {
      const ids = selectedNodeIds();
      if (ids.length < 2) return toast('Select at least two metabolites');
      const { nodes, edges } = layoutInput(ids);
      setPositions(applyLayout(kind, nodes, edges, { spacing: get().layoutSpacing, ...opts }), kind !== 'circle');
    },
    alignSelection: (k: AlignKind) => { const ids = selectedNodeIds(); if (ids.length > 1) setPositions(align(k, layoutInput(ids).nodes), false); },
    distributeSelection: (axis: 'x' | 'y', equal = false) => {
      const ids = selectedNodeIds();
      if (ids.length > 2 || (equal && ids.length > 1)) setPositions(distribute(axis, layoutInput(ids).nodes, equal ? get().layoutSpacing : undefined), false);
    },
    tidySelection: () => {
      const ids = selectedNodeIds();
      if (ids.length < 2) return toast('Select at least two metabolites');
      const { nodes, edges } = layoutInput(ids);
      const r = tidy(nodes, edges, get().layoutSpacing, get().canvas.gridSize);
      setPositions(r.pos, false);
      toast(`Tidy: detected ${r.detected}`);
    },
    groupSelection: (kind: 'pathway' | 'compartment' = 'pathway', title?: string) => {
      const ids = selectedNodeIds();
      if (!ids.length) return toast('Select metabolites to group');
      const id = uid('g');
      patchDoc((d) => ({ ...d, groups: { ...d.groups, [id]: { id, kind, title: title ?? (kind === 'pathway' ? 'Pathway' : 'Cytosol'), nodeIds: ids, padding: kind === 'pathway' ? 26 : 40, fill: kind === 'pathway' ? 'none' : '#f4f6fb', stroke: kind === 'pathway' ? 'none' : '#b9c2d6', dashed: kind === 'compartment' } } }));
      set({ selection: [key('group', id)] });
    },
    ungroup: () => {
      const gids = selectedIds('group');
      if (!gids.length) return;
      const nodeIds = gids.flatMap((g) => get().doc.groups[g].nodeIds);
      patchDoc((d) => { const groups = { ...d.groups }; gids.forEach((g) => delete groups[g]); return { ...d, groups }; });
      set({ selection: nodeIds.map((id) => key('node', id)) });
    },

    // ---------------------------------------------------------- templates
    instantiateTemplate: (t: MapTemplate, at?: Point) => {
      const s = get();
      if (!at) return actions.beginPlacing({ kind: 'template', name: t.name, template: t, preview: templateDrawing(previewBase(), t, { x: 0, y: 0 }, (v) => v).doc });
      const r = templateDrawing(s.doc, t, at, snapV);
      let doc = r.doc;
      const map = r.ids;
      let msg = `Inserted “${t.name}” — ${t.nodes.length} slots`;
      if (s.model) {
        const b = autoBind(doc, s.model, new globalThis.Set(map.values()));
        doc = b.doc;
        msg += ` · bound ${b.nodes}/${b.totalNodes} metabolites, ${b.reactions}/${b.totalReactions} reactions`;
      } else msg += ' · load a GEM to bind them';
      // select everything inserted, texts included, so the pathway moves as one piece
      commit(() => ({ doc, selection: [...[...map.values()].map((id) => key('node', id)), ...r.textIds.map((id) => key('text', id))] }));
      toast(msg);
    },
    /** Start placing a template: its preview follows the mouse until a click drops it (Esc cancels). */
    beginPlacing: (p: Placement) => {
      set({ placing: p, dialog: null, contextMenu: null, tool: 'select' });
      toast(`Click on the canvas to place “${p.name}” · Esc cancels`);
    },
    /** Drop the template being placed, centred on `world`. */
    placeAt: (world: Point) => {
      const p = get().placing;
      if (!p) return;
      const b = docBounds(p.preview) ?? { x: 0, y: 0, w: 0, h: 0 };
      const at = { x: snapV(world.x - (b.x + b.w / 2)), y: snapV(world.y - (b.y + b.h / 2)) };
      set({ placing: null });
      if (p.kind === 'pathway') actions.instantiatePathway(p.spec, p.mapping, at);
      else if (p.kind === 'reactions') { actions.insertBlock(p.preview, at); toast(`Placed ${p.name} · metabolites are new copies (drag one onto another to merge)`); }
      else actions.instantiateTemplate(p.template, at);
    },
    cancelPlacing: () => { if (get().placing) { set({ placing: null }); toast('Insertion cancelled'); } },
    /** Draw a pathway template with the mapping chosen in the review dialog. */
    instantiatePathway: (spec: PathwayTemplateSpec, mapping: TemplateMapping | null, at?: Point) => {
      const s = get();
      if (!at) {
        // first a light preview that follows the mouse; the click inserts it (placeAt)
        const preview = addPathwayToDoc(previewBase(), spec, mapping, { x: 0, y: 0 }, s.model, uid, (v) => v).doc;
        return actions.beginPlacing({ kind: 'pathway', name: spec.name, spec, mapping, preview });
      }
      const r = addPathwayToDoc(s.doc, spec, mapping, at, s.model, uid, snapV);
      // select everything inserted — cofactors and texts (titles, pathway links) too — so the pathway moves as one piece
      commit(() => ({ doc: r.doc, selection: [...r.nodeIds, ...r.cofactorIds].map((id) => key('node', id)).concat(r.textIds.map((id) => key('text', id))) }));
      if (!mapping) return toast(`Inserted “${spec.name}” — ${spec.biology.slots.length} slots · load a GEM to map them`);
      const open = mapping.slots.filter((x) => x.status === 'ambiguous' || x.status === 'unresolved').length;
      toast(`Inserted “${spec.name}” — ${mapping.coverage.allMapped}/${mapping.coverage.all} metabolites, ${r.reactionsBound}/${spec.biology.reactions.length} reactions mapped`
        + (open ? ` · ${open} open slot${open > 1 ? 's' : ''} (click one to resolve)` : ''));
    },
    /**
     * Resolve a template node: bind it to `mid` (confirmed), mark the entity absent from the model (null),
     * or clear the choice (undefined: back to unresolved). Choices are saved in the model's mapping profile.
     */
    setTemplateMapping: (nodeId: ID, mid: ID | null | undefined) => {
      const s = get();
      const n = s.doc.nodes[nodeId];
      if (!n?.template || !s.model) return;
      const t = n.template;
      const status = mid ? 'confirmed' : mid === null ? 'absent' : 'unresolved';
      const nodes = { ...s.doc.nodes, [nodeId]: { ...n, metaboliteId: mid ?? undefined, template: { ...t, status, method: mid ? 'user choice' : undefined, score: undefined } } } as VisualDoc['nodes'];
      const touched = new globalThis.Set<ID>([nodeId]);
      // the same entity drawn in other compartments takes the same compound there (pyr_c chosen → pyr_m, pyr_e),
      // unless that node was confirmed or mapped with high confidence already
      const follow: string[] = [];
      if (mid) {
        const sib = siblingsByCompartment(s.model, mid);
        for (const o of Object.values(nodes)) {
          const ot = o.template;
          if (o.id === nodeId || !ot || ot.entity !== t.entity || ot.compartment === t.compartment || ot.status === 'confirmed' || ot.status === 'auto_high' || ot.status === 'absent') continue;
          const to = sib.get(ot.compartment as CanonicalCompartment);
          if (!to) continue;
          nodes[o.id] = { ...o, metaboliteId: to, template: { ...ot, status: 'confirmed', method: `same compound as ${mid}`, score: undefined } };
          touched.add(o.id);
          follow.push(to);
        }
      }
      const reactions = { ...s.doc.reactions };
      for (const g of Object.values(reactions)) {
        if (![...g.sources, ...g.targets].some((x) => touched.has(x))) continue;
        const c: ReactionGlyph = { ...g, reactionId: undefined, lumped: undefined, reversedToModel: undefined };
        bindReactionGlyph(c, nodes, s.model);
        reactions[g.id] = c;
      }
      commit((st) => ({ doc: { ...st.doc, nodes, reactions } }));
      const ix = indexModel(s.model);
      const prev = loadProfile(ix.fingerprint);
      const comp = t.compartment as CanonicalCompartment | null;
      if (mid === undefined) { if (prev) saveProfile(withoutEntry(prev, t.entity, comp)); }
      else {
        const e = { entity: t.entity, compartment: comp, metaboliteId: mid, templateId: t.templateId, templateVersion: t.templateVersion };
        let prof = withEntry(prev, { fingerprint: ix.fingerprint, id: s.model.id, name: s.model.name }, e);
        if (mid) prof = withSiblingEntries(prof, s.model, { ...e, metaboliteId: mid }).profile;
        saveProfile(prof);
      }
      const what = n.label ?? t.slot;
      toast(mid ? `${what} → ${mid} (saved for ${s.model.name})${follow.length ? ` · also ${follow.join(', ')} (same compound, other compartment${follow.length > 1 ? 's' : ''})` : ''}`
        : mid === null ? `${what} marked as absent from ${s.model.name}` : `${what}: mapping cleared`);
    },
    /** Confirm every provisional (medium-confidence) template mapping on the canvas. */
    confirmProvisional: () => {
      const s = get();
      if (!s.model) return;
      const ix = indexModel(s.model);
      let prof = loadProfile(ix.fingerprint);
      const nodes = { ...s.doc.nodes };
      let k = 0;
      for (const n of Object.values(nodes)) {
        if (n.template?.status !== 'provisional' || !n.metaboliteId) continue;
        nodes[n.id] = { ...n, template: { ...n.template, status: 'confirmed' } };
        prof = withEntry(prof, { fingerprint: ix.fingerprint, id: s.model.id, name: s.model.name }, { entity: n.template.entity, compartment: n.template.compartment as CanonicalCompartment | null, metaboliteId: n.metaboliteId, templateId: n.template.templateId, templateVersion: n.template.templateVersion });
        k++;
      }
      if (!k) return toast('No provisional mappings to confirm');
      commit((st) => ({ doc: { ...st.doc, nodes } }));
      if (prof) saveProfile(prof);
      toast(`Confirmed ${k} provisional mapping${k > 1 ? 's' : ''}`);
    },
    /** Template gallery entry point: pathway templates go through the mapping review when a model is loaded. */
    openTemplate: (t: MapTemplate, at?: Point) => {
      const s = get();
      const spec = t.spec ?? specById(t.id);
      if (!spec) return actions.instantiateTemplate(t, at);
      if (!s.model) return actions.instantiatePathway(spec, null, at);
      set({ dialog: { kind: 'templateMapping', templateId: spec.id, at } });
    },
    saveSelectionAsTemplate: (name: string) => {
      const s = get();
      const ids = selectedNodeIds();
      if (!ids.length) return toast('Select the part of the map to save');
      const t = templateFromSelection(name, s.doc, ids, s.model);
      const userTemplates = [...s.userTemplates, t];
      saveUserTemplates(userTemplates);
      set({ userTemplates });
      toast(`Saved template “${name}” — reusable with any model`);
    },
    deleteUserTemplate: (id: string) => { const userTemplates = get().userTemplates.filter((t) => t.id !== id); saveUserTemplates(userTemplates); set({ userTemplates }); },

    // ---------------------------------------------------------- model graph
    expandNode: (nodeId: ID, dir: 'down' | 'up', depth: number) => {
      const s = get();
      const n = s.doc.nodes[nodeId];
      if (!s.model || !n?.metaboliteId) return toast('Bind this node to a model metabolite first');
      const steps = expand(s.model, n.metaboliteId, dir, depth);
      if (!steps.length) return toast('No non-currency neighbours in that direction');
      const added = addSteps(nodeId, steps, dir);
      toast(`Added ${added} metabolites · ${steps.length} reactions`);
    },
    findPath: (fromMet: ID, toMet: ID, allowCurrency = false) => {
      const s = get();
      if (!s.model) return toast('Load a GEM first');
      const path = shortestPath(s.model, fromMet, toMet, { allowCurrency });
      if (!path) return toast('No route found (currency metabolites excluded)');
      let startNode = Object.values(s.doc.nodes).find((n) => n.metaboliteId === fromMet)?.id;
      if (!startNode) startNode = actions.addMetaboliteFromModel(fromMet);
      addSteps(startNode, path, 'down');
      toast(`Path: ${path.length} reactions — ${path.map((p) => p.reactionId).join(' → ')}`);
    },

    // ---------------------------------------------------------- model-driven editing
    /** Add a model reaction next to a metabolite already on the canvas. */
    addConnectedReaction: (nodeId: ID, rid: ID) => {
      const s = get();
      const model = s.model;
      const node = s.doc.nodes[nodeId];
      const r = model?.reactions[rid];
      if (!model || !r || !node?.metaboliteId) return;
      const existing = Object.values(s.doc.reactions).find((g) => g.reactionId === rid || g.lumped?.includes(rid) || g.collapsed?.members.some((m) => m.reactionId === rid));
      if (existing) { set({ selection: [key('reaction', existing.id)] }); return toast(`${rid} is already on the canvas${existing.collapsed ? ' (inside a collapsed arrow)' : ''}`); }
      const mp = mainParticipants(r, model.metabolites);
      const mid = node.metaboliteId;
      const isSub = (r.stoichiometry[mid] ?? 0) < 0;
      const MAX_OTHER = 4, MAX_CO = 1;
      const others = (isSub ? mp.products : mp.substrates).filter((m) => m !== mid);
      const co = (isSub ? mp.substrates : mp.products).filter((m) => m !== mid);
      // every added reaction brings its own copies of the participants (never re-linked to nodes already
      // drawn): the user hides them or drags a copy onto the same metabolite to merge (mergeNodes)
      const shownOthers = others.slice(0, MAX_OTHER);
      const shownCo = co.slice(0, MAX_CO);
      const nodes = { ...s.doc.nodes };
      const sp = s.layoutSpacing;
      const dirY = isSub ? 1 : -1;
      const place = (m: ID, x: number, y: number) => {
        const id = uid('n');
        nodes[id] = { id, x: snapV(x), y: snapV(y), metaboliteId: m };
        return id;
      };
      const otherIds = shownOthers.map((m, i) => place(m, node.x + (i - (shownOthers.length - 1) / 2) * sp * 1.4, node.y + dirY * sp * 1.4));
      const coIds = shownCo.map((m, i) => place(m, node.x - sp * 1.4 * (i + 1), node.y));
      if (!otherIds.length) return toast(`${rid} has no other non-currency participant to draw`);
      const id = uid('r');
      const g: ReactionGlyph = isSub
        ? { id, reactionId: rid, sources: [nodeId, ...coIds], targets: otherIds, routing: 'straight' }
        : { id, reactionId: rid, sources: otherIds, targets: [nodeId, ...coIds], routing: 'straight' };
      commit((st) => ({ doc: { ...st.doc, nodes, reactions: { ...st.doc.reactions, [id]: g } }, selection: [key('reaction', id)] }));
      const hidden = others.length - shownOthers.length + co.length - shownCo.length;
      toast(`Added ${rid}${hidden > 0 ? ` — ${hidden} more participant(s) hidden; choose them in the Inspector` : ''}`);
    },

    /** Show or hide one participant of a bound reaction arrow. */
    setParticipant: (glyphId: ID, metId: ID, visible: boolean) => {
      const s = get();
      const g = s.doc.reactions[glyphId];
      const r = g?.reactionId ? s.model?.reactions[g.reactionId] : undefined;
      if (!g || !r) return;
      const coef = r.stoichiometry[metId] ?? 0;
      // side in the *drawn* direction
      const drawnSource = g.reversedToModel ? coef > 0 : coef < 0;
      const side: 'sources' | 'targets' = drawnSource ? 'sources' : 'targets';
      const nodes = { ...s.doc.nodes };
      if (visible) {
        // a new copy next to the arrow (drag it onto an existing node of the same metabolite to merge)
        const ref = g[side].map((x) => nodes[x]).filter(Boolean);
        const cx = ref.reduce((a, n) => a + n.x, 0) / (ref.length || 1), cy = ref.reduce((a, n) => a + n.y, 0) / (ref.length || 1);
        const nid = uid('n');
        nodes[nid] = { id: nid, x: snapV(cx + (ref.length % 2 ? 1 : -1) * Math.ceil((ref.length + 1) / 2) * 70), y: snapV(cy), metaboliteId: metId };
        const add = nid;
        commit((st) => ({ doc: { ...st.doc, nodes, reactions: { ...st.doc.reactions, [glyphId]: { ...g, [side]: [...g[side], add] } } } }));
      } else {
        const nid = g[side].find((x) => nodes[x]?.metaboliteId === metId);
        if (!nid) return;
        if (g[side].length === 1) return toast('An arrow needs at least one metabolite on each side');
        const usedElsewhere = Object.values(s.doc.reactions).some((o) => o.id !== glyphId && (o.sources.includes(nid) || o.targets.includes(nid))) || Object.values(s.doc.plots).some((p) => p.anchor.id === nid);
        if (!usedElsewhere && !nodes[nid].locked) delete nodes[nid];
        commit((st) => ({ doc: { ...st.doc, nodes, reactions: { ...st.doc.reactions, [glyphId]: { ...g, [side]: g[side].filter((x) => x !== nid) } } } }));
      }
    },

    /** Merge node `fromId` into `intoId` (same metabolite drawn twice): arrows, plots and groups follow. */
    mergeNodes: (fromId: ID, intoId: ID) => {
      const s = get();
      const a = s.doc.nodes[fromId], b = s.doc.nodes[intoId];
      if (!a || !b || fromId === intoId) return;
      const swap = (ids: ID[]) => Array.from(new globalThis.Set(ids.map((x) => (x === fromId ? intoId : x))));
      commit((st) => {
        const d = st.doc;
        const nodes = { ...d.nodes };
        delete nodes[fromId];
        const reactions: Record<ID, ReactionGlyph> = {};
        for (const g of Object.values(d.reactions)) {
          if (!g.sources.includes(fromId) && !g.targets.includes(fromId)) { reactions[g.id] = g; continue; }
          const sources = swap(g.sources), targets = swap(g.targets).filter((x) => !sources.includes(x));
          if (sources.length && targets.length) reactions[g.id] = { ...g, sources, targets };
        }
        const plots = Object.fromEntries(Object.entries(d.plots).map(([k, p]) => [k, p.anchor.kind === 'node' && p.anchor.id === fromId ? { ...p, anchor: { ...p.anchor, id: intoId } } : p]));
        const groups = Object.fromEntries(Object.entries(d.groups).map(([k, g]) => [k, g.nodeIds.includes(fromId) ? { ...g, nodeIds: swap(g.nodeIds) } : g]));
        return { doc: { ...d, nodes, reactions, plots, groups }, selection: [key('node', intoId)] };
      });
      toast(`Merged into ${b.label || b.metaboliteId || 'node'}`);
    },

    /** Merge several arrows drawing the same model reaction into one hyperedge. */
    mergeDuplicates: (reactionId: ID) => {
      const s = get();
      const gs = Object.values(s.doc.reactions).filter((g) => g.reactionId === reactionId && !g.collapsed);
      if (gs.length < 2) return;
      const [keep, ...rest] = gs;
      const flip = (g: ReactionGlyph) => !!g.reversedToModel !== !!keep.reversedToModel;
      const sources = new globalThis.Set(keep.sources), targets = new globalThis.Set(keep.targets);
      for (const g of rest) {
        (flip(g) ? g.targets : g.sources).forEach((n) => sources.add(n));
        (flip(g) ? g.sources : g.targets).forEach((n) => targets.add(n));
      }
      commit((st) => {
        const reactions = { ...st.doc.reactions, [keep.id]: { ...keep, sources: [...sources], targets: [...targets] } };
        rest.forEach((g) => delete reactions[g.id]);
        const plots: Record<ID, PlotGlyph> = {};
        for (const [k, p] of Object.entries(st.doc.plots)) plots[k] = rest.some((g) => g.id === p.anchor.id) ? { ...p, anchor: { kind: 'reaction', id: keep.id } } : p;
        return { doc: { ...st.doc, reactions, plots }, selection: [key('reaction', keep.id)] };
      });
      toast(`Merged ${gs.length} arrows of ${reactionId} into one`);
    },

    /** Replace an arrow (or connect two nodes) with a model route; optionally keep it collapsed. */
    applyRoute: (fromNode: ID, toNode: ID, steps: Step[], opts: { replaceGlyph?: ID; collapse?: boolean } = {}) => {
      const s = get();
      const A0 = s.doc.nodes[fromNode], B0 = s.doc.nodes[toNode];
      if (!A0 || !B0 || !steps.length) return;
      let doc: VisualDoc = { ...s.doc, nodes: { ...s.doc.nodes }, reactions: { ...s.doc.reactions }, plots: { ...s.doc.plots } };
      const old = opts.replaceGlyph ? doc.reactions[opts.replaceGlyph] : undefined;
      if (old) delete doc.reactions[old.id];
      // intermediates are always new copies (never re-linked to nodes drawn elsewhere on the map);
      // only the two chosen ends are reused. Drag a copy onto the same metabolite to merge (mergeNodes).
      const byMet = new Map<ID, ID>();
      byMet.set(steps[0].from, fromNode);
      byMet.set(steps[steps.length - 1].to, toNode);
      const L = steps.length;
      const newGlyphs: ID[] = [];
      steps.forEach((st, i) => {
        if (!byMet.has(st.to)) {
          const t = (i + 1) / L;
          const id = uid('n');
          doc.nodes[id] = { id, x: snapV(A0.x + (B0.x - A0.x) * t), y: snapV(A0.y + (B0.y - A0.y) * t), metaboliteId: st.to };
          byMet.set(st.to, id);
        }
        const gid = uid('r');
        doc.reactions[gid] = { id: gid, reactionId: st.reactionId, sources: [byMet.get(st.from)!], targets: [byMet.get(st.to)!], routing: 'straight', reversedToModel: st.reversed };
        newGlyphs.push(gid);
      });
      let selected = newGlyphs[0];
      if (opts.collapse && newGlyphs.length > 1) {
        const r = collapseGlyphs(doc, newGlyphs, { sources: [fromNode], targets: [toNode] });
        if (r) {
          doc = r.doc;
          selected = r.id;
          if (old?.label) doc.reactions[r.id] = { ...doc.reactions[r.id], label: old.label };
        }
      }
      // plots that were attached to the free arrow follow the new one
      if (old) for (const p of Object.values(doc.plots)) if (p.anchor.id === old.id) doc.plots[p.id] = { ...p, anchor: { kind: 'reaction', id: selected } };
      commit(() => ({ doc, selection: [key('reaction', selected)] }));
      toast(`Inserted ${L} reaction${L > 1 ? 's' : ''}: ${steps.map((x) => x.reactionId).join(' → ')}${opts.collapse && L > 1 ? ' (collapsed)' : ''}`);
    },

    /** Collapse the selected arrows — or everything drawn between two selected metabolites — into one summary arrow. */
    collapseSelection: () => {
      const s = get();
      let gids = selectedIds('reaction');
      const nids = selectedIds('node');
      let endpoints: { sources: ID[]; targets: ID[] } | undefined;
      if (nids.length === 2) {
        const [a, b] = nids;
        let between = glyphsBetween(s.doc, a, b);
        endpoints = { sources: [a], targets: [b] };
        if (!between.length) { between = glyphsBetween(s.doc, b, a); endpoints = { sources: [b], targets: [a] }; }
        if (between.length) gids = between;
        else endpoints = undefined;
      }
      if (!gids.length) return toast('Select arrows to collapse, or two metabolites with arrows between them');
      const r = collapseGlyphs(s.doc, gids, endpoints);
      if (!r) return;
      commit(() => ({ doc: r.doc, selection: [key('reaction', r.id)] }));
      toast(r.warning ?? `Collapsed ${gids.length} arrow(s) · ${r.count} reactions (${r.topology}). Flux = net flux entering the segment. Expand anytime.`);
    },
    expandGlyph: (id: ID) => {
      const r = expandCollapsed(get().doc, id);
      if (!r) return;
      commit(() => ({ doc: r.doc, selection: r.restored.map((g) => key('reaction', g)) }));
    },

    // ---------------------------------------------------------- data
    importModel: (raw: MetabolicModel) => {
      const model = withFamilyParents(raw); // ecModels: r101_EXP_1/_REV copies → drawable parent r101
      const validation = validateModel(model);
      const mets = Object.values(model.metabolites);
      const cryptic = mets.filter((m) => /__\d+__|^[A-Z]\d{4,}|^MAM\d|^s_\d{4}/.test(m.id) || m.id.length > 16).length;
      const useNames = mets.length > 0 && cryptic / mets.length > 0.5;
      commit((st) => ({ model, style: useNames ? { ...st.style, metaboliteLabel: 'name' } : st.style }));
      if (useNames) setTimeout(() => toast('Metabolite IDs look like database accessions — labels switched to names (Inspector → Labels)'), 4300);
      set({ validation, leftTab: 'model' });
      const s = get();
      const hasSlots = Object.values(s.doc.nodes).some((n) => !n.metaboliteId || !model.metabolites[n.metaboliteId]);
      toast(`Loaded ${model.name}: ${Object.keys(model.metabolites).length} metabolites, ${Object.keys(model.reactions).length} reactions${hasSlots ? ' — click “Auto-bind” to attach your map' : ''}`);
      // re-match datasets that were imported without a model
      if (s.datasets.length) toast('Tip: re-import datasets to re-match IDs against the new model');
    },
    importDataset: (name: string, text: string) => {
      const s = get();
      const t = parseTable(text, s.model);
      const { conditions, ids } = ensureConditions(t.columns, s.conditions);
      const ds = buildDataset(name.replace(/\.(csv|tsv|txt)$/i, ''), t, s.model, (col) => ids[t.columns.indexOf(col)]);
      const mappings = [...s.mappings];
      const has = (target: string, prop: string) => mappings.some((m) => m.target === target && m.property === prop && m.enabled);
      if (ds.kind === 'flux' || ds.kind === 'fva') {
        if (!has('reaction', 'width')) mappings.push({ id: uid('m'), datasetId: ds.id, target: 'reaction', property: 'width', scale: 'linear', magnitude: true, enabled: true });
        if (!has('reaction', 'color')) mappings.push({ id: uid('m'), datasetId: ds.id, target: 'reaction', property: 'color', scale: 'linear', magnitude: true, enabled: true });
      } else if (ds.kind === 'metabolite' || ds.kind === 'turnover') {
        if (!has('metabolite', 'radius')) mappings.push({ id: uid('m'), datasetId: ds.id, target: 'metabolite', property: 'radius', scale: 'sqrt', magnitude: true, enabled: true });
      }
      const view: ViewState = { ...s.view };
      if (!conditions.some((c) => c.id === view.activeCondition)) view.activeCondition = ids[0];
      if (!conditions.some((c) => c.id === view.reference)) view.reference = ids[0];
      commit(() => ({ datasets: [...s.datasets, ds], conditions, mappings }));
      set({ view, leftTab: 'data' });
      const pct = Math.round((ds.matchedFraction ?? 1) * 100);
      toast(`${ds.name}: ${t.kind} · ${ds.columns.length} conditions · ${pct}% IDs matched`);
      if (ds.unmatched.length) set({ dialog: { kind: 'importReport', datasetId: ds.id } });
      return ds;
    },
    remapDatasetId: (dsId: string, raw: string, modelId: ID) => commit((s) => ({ datasets: s.datasets.map((d) => (d.id === dsId ? remapDataset(d, raw, modelId) : d)) })),
    updateDataset: (id: string, p: Partial<Dataset>) => commit((s) => ({ datasets: s.datasets.map((d) => (d.id === id ? { ...d, ...p } : d)) })),
    removeDataset: (id: string) => {
      commit((s) => {
        const datasets = s.datasets.filter((d) => d.id !== id);
        // drop conditions no remaining dataset uses, and keep the view on a valid condition
        const used = new globalThis.Set(datasets.flatMap((d) => d.columns));
        const conditions = s.conditions.filter((c) => used.has(c.id));
        return { datasets, conditions, mappings: s.mappings.filter((m) => m.datasetId !== id) };
      });
      const s = get();
      const ids = s.conditions.map((c) => c.id);
      if (!ids.includes(s.view.activeCondition) || !ids.includes(s.view.reference)) {
        set({ view: { ...s.view, activeCondition: ids.includes(s.view.activeCondition) ? s.view.activeCondition : ids[0] ?? '', reference: ids.includes(s.view.reference) ? s.view.reference : ids[0] ?? '' } });
      }
    },
    /** Move a condition to position `to` (drives the order of plots, legend, chips and lists). */
    moveCondition: (id: string, to: number) => commit((s) => {
      const from = s.conditions.findIndex((c) => c.id === id);
      if (from < 0) return {};
      const conditions = [...s.conditions];
      const [c] = conditions.splice(from, 1);
      conditions.splice(Math.max(0, Math.min(conditions.length, to)), 0, c);
      return { conditions };
    }),
    updateCondition: (id: string, p: Partial<Condition>) => commit((s) => ({ conditions: s.conditions.map((c) => (c.id === id ? { ...c, ...p } : c)) })),

    addMapping: (m: Omit<VisualizationMapping, 'id'>) => commit((s) => ({ mappings: [...s.mappings, { ...m, id: uid('m') }] })),
    updateMapping: (id: string, p: Partial<VisualizationMapping>) => commit((s) => ({ mappings: s.mappings.map((m) => (m.id === id ? { ...m, ...p } : m)) })),
    removeMapping: (id: string) => commit((s) => ({ mappings: s.mappings.filter((m) => m.id !== id) })),

    setView: (p: Partial<ViewState>) => set((s) => ({ view: { ...s.view, ...p } })),
    stepCondition: (delta: number) => {
      const s = get();
      if (!s.conditions.length) return;
      const i = s.conditions.findIndex((c) => c.id === s.view.activeCondition);
      const n = s.conditions.length;
      set({ view: { ...s.view, activeCondition: s.conditions[(i + delta + n) % n].id } });
    },
    saveView: (name: string) => set((s) => ({ savedViews: [...s.savedViews, { id: uid('v'), name, view: s.view, mappings: s.mappings }] })),
    applySavedView: (v: SavedView) => { set({ view: v.view }); commit(() => ({ mappings: v.mappings })); },
    deleteSavedView: (id: string) => set((s) => ({ savedViews: s.savedViews.filter((v) => v.id !== id) })),

    setStyle: (p: Partial<StyleSettings>) => commit((s) => ({ style: { ...s.style, ...p } })),
    setCanvas: (p: Partial<CanvasSettings>) => set((s) => ({ canvas: { ...s.canvas, ...p } })),
    setAnimation: (p: Partial<AnimationSettings>) => set((s) => ({ animation: { ...s.animation, ...p } })),

    // ---------------------------------------------------------- camera
    setCamera: (c: Partial<EditorState['camera']>) => set((s) => ({ camera: { ...s.camera, ...c } })),
    zoomBy: (f: number, at?: Point) => set((s) => {
      const k = Math.max(0.05, Math.min(8, s.camera.k * f));
      const p = at ?? { x: s.viewport.w / 2, y: s.viewport.h / 2 };
      return { camera: { k, x: p.x - ((p.x - s.camera.x) / s.camera.k) * k, y: p.y - ((p.y - s.camera.y) / s.camera.k) * k } };
    }),
    fitTo: (b: { x: number; y: number; w: number; h: number } | null, maxK = 2) => set((s) => {
      if (!b) return {};
      // narrow canvases (several side panels open): never a margin wider than the canvas, never a negative zoom
      const pad = Math.min(60, s.viewport.w / 8, s.viewport.h / 8);
      const k = Math.max(0.05, Math.min(maxK, (s.viewport.w - pad * 2) / Math.max(b.w, 1), (s.viewport.h - pad * 2) / Math.max(b.h, 1)));
      return { camera: { k, x: s.viewport.w / 2 - (b.x + b.w / 2) * k, y: s.viewport.h / 2 - (b.y + b.h / 2) * k } };
    }),
    fitAll: () => actions.fitTo(docBounds(get().doc)),
    fitSelection: () => { const ids = selectedNodeIds(); actions.fitTo(ids.length ? docBounds(get().doc, ids) : docBounds(get().doc)); },
    focusNode: (id: ID) => { const n = get().doc.nodes[id]; if (!n) return; set({ selection: [key('node', id)] }); actions.fitTo({ x: n.x - 150, y: n.y - 100, w: 300, h: 200 }, 1.6); },

    // ---------------------------------------------------------- project
    loadProject: (p: ProjectFile) => {
      const base = emptyProject();
      set({
        ...base, ...p,
        style: { ...base.style, ...p.style }, canvas: { ...base.canvas, ...p.canvas }, animation: { ...base.animation, ...p.animation, playing: false },
        doc: { ...base.doc, ...p.doc },
        model: p.model ? withFamilyParents(p.model) : null,
        selection: [], past: [], future: [], dialog: null, design: null,
        validation: p.model ? validateModel(p.model) : [],
      });
      if (p.mappingProfile) mergeProfileIntoStorage(p.mappingProfile);
      setTimeout(() => actions.fitAll(), 0);
    },
    newProject: () => actions.loadProject(emptyProject()),
    toProjectFile: (): ProjectFile => {
      const s = get();
      const mappingProfile = s.model && Object.values(s.doc.nodes).some((n) => n.template) ? loadProfile(indexModel(s.model).fingerprint) : null;
      return { format: PROJECT_FORMAT, version: 1, name: s.name, model: s.model && withoutVirtual(s.model), mappingProfile, datasets: s.datasets, conditions: s.conditions, doc: s.doc, mappings: s.mappings, view: s.view, savedViews: s.savedViews, style: s.style, canvas: s.canvas, animation: { ...s.animation, playing: false } };
    },
  };
  return actions;
}

export type Actions = ReturnType<typeof createActions>;

export const useStore = create<EditorState & { actions: Actions }>()((set, get) => ({
  ...emptyProject(),
  selection: [],
  camera: { x: 300, y: 80, k: 1 },
  viewport: { w: 1200, h: 800 },
  tool: 'select',
  past: [],
  future: [],
  dialog: null,
  placing: null,
  contextMenu: null,
  paletteOpen: false,
  toast: null,
  leftTab: 'elements',
  hideZeroReactions: false,
  leftOpen: true,
  rightOpen: true,
  userTemplates: loadUserTemplates(),
  validation: [],
  layoutSpacing: 60,
  design: null,
  actions: createActions(set as Set, get as Get),
}));

export const A = () => useStore.getState().actions;
