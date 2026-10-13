/**
 * COBRAGUI ⇄ Map Builder bridge. Model ids are preserved end-to-end: the Map Builder receives the
 * same reaction/metabolite ids COBRApy uses, so results bind without any manual id matching.
 *
 * Results become columns of shared datasets (one condition per result). FVA intervals travel as
 * ranges only — never as midpoint "fluxes".
 */
import type { Condition, Dataset } from '../data/types';
import type { MetabolicModel, Metabolite, Reaction } from '../model/types';
import { A, key, useStore } from '../store/store';
import { CONDITION_COLORS } from '../viz/palettes';
import type { VisualizationMapping } from '../viz/types';
import { FLUX_UNIT } from './format';
import { lab, useLab } from './store';
import type { ComparisonResult, CompareRow, EntityRef, LabModel, SimulationResult } from './types';

const FLUX_DS = 'ds_cobra_flux';
const FVA_DS = 'ds_cobra_fva';
const TURNOVER_DS = 'ds_cobra_turnover';
const condIdOf = (r: SimulationResult) => `sim_${r.id}`;

export function toMapModel(m: LabModel): MetabolicModel {
  const big = 1000;
  const metabolites: Record<string, Metabolite> = {};
  for (const x of m.metabolites) metabolites[x.id] = { id: x.id, name: x.name || x.id, formula: x.formula ?? undefined, charge: x.charge ?? undefined, compartment: x.compartment, annotation: x.annotation };
  const reactions: Record<string, Reaction> = {};
  for (const r of m.reactions) {
    reactions[r.id] = {
      id: r.id, name: r.name || r.id, stoichiometry: { ...r.stoichiometry }, reversible: r.reversible,
      lowerBound: r.lb ?? -big, upperBound: r.ub ?? big, subsystem: r.subsystem ?? undefined,
      gpr: r.gpr ?? undefined, genes: r.genes, ec: r.ec.length ? r.ec : undefined,
    };
  }
  const genes = Object.fromEntries(m.genes.map((g) => [g.id, { id: g.id, name: g.name || undefined }]));
  return { id: m.modelId || m.id, name: m.name, metabolites, reactions, genes, compartments: { ...m.compartments }, source: 'cobrapy', checksum: m.checksum };
}

/** Make sure the Map Builder uses COBRAGUI's model (asks before replacing a different one). */
export function ensureMapModel(): boolean {
  const lm = useLab.getState().model;
  if (!lm) return false;
  const ms = useStore.getState();
  if (ms.model?.checksum === lm.checksum) return true;
  if (ms.model) {
    const ids = lm.reactions.map((r) => r.id);
    const shared = ids.filter((id) => ms.model!.reactions[id]).length;
    if (shared / Math.max(1, ids.length) > 0.97) return true; // same ids: keep the map's copy and its bindings
    if (Object.keys(ms.doc.nodes).length
      && !window.confirm(`The Map Builder currently uses “${ms.model.name}”.\n\nReplace it with “${lm.name}” from COBRAGUI?\nArrows keep their reaction ids; ids missing from the new model become unbound.`)) return false;
  }
  ms.actions.importModel(toMapModel(lm));
  return true;
}

/**
 * COBRAGUI → "Add to map". By default the reactions go to the Map Builder as a light preview that follows
 * the mouse until a click places them (Esc cancels), with new metabolite nodes (never the ones already on
 * the map). place = false inserts them at once, at the centre of the view, without leaving COBRAGUI.
 */
export function addReactionsToMap(rids: string[], layout: 'vertical' | 'horizontal' | 'hierarchical' | 'none' = 'vertical', place = true) {
  if (!rids.length || !ensureMapModel()) return;
  const r = A().addModelReactions(rids, layout, place);
  const parts: string[] = [];
  if (r.skipped) parts.push(`${r.skipped} already drawn`);
  if (r.boundary) parts.push(`${r.boundary} boundary reaction${r.boundary === 1 ? '' : 's'} skipped (no metabolite on one side)`);
  if (!r.added) { A().toast(parts.join(' · ') || 'Nothing to add'); return; }
  if (place) {
    lab.setWorkspace('map');
    A().toast([`Click on the map to place ${r.added === 1 ? rids.find((id) => useStore.getState().model?.reactions[id]) : `${r.added} reactions`} · Esc cancels`, ...parts].join(' · '));
  } else A().toast([`${r.added} reaction${r.added === 1 ? '' : 's'} added to the map`, ...parts].join(' · '));
  lab.log('info', `Add to map: ${r.added} reaction(s)${parts.length ? `, ${parts.join(', ')}` : ''}`);
}

export function addMetabolitesToMap(mids: string[], switchTo = true) {
  if (!mids.length || !ensureMapModel()) return;
  const n = A().addModelMetabolites(mids);
  A().toast(n ? `${n} metabolite${n === 1 ? '' : 's'} added to the map` : 'Already on the map');
  if (switchTo && n) lab.setWorkspace('map');
}

/** Map glyph currently drawing a model entity, if any. */
export function glyphFor(ref: EntityRef): { glyph?: string; node?: string } | null {
  const doc = useStore.getState().doc;
  if (ref.kind === 'reaction') {
    const g = Object.values(doc.reactions).find((x) => x.reactionId === ref.id || x.lumped?.includes(ref.id) || x.collapsed?.members.some((m) => m.reactionId === ref.id));
    return g ? { glyph: g.id, node: g.sources[0] } : null;
  }
  if (ref.kind === 'metabolite') {
    const n = Object.values(doc.nodes).find((x) => x.metaboliteId === ref.id);
    return n ? { node: n.id } : null;
  }
  return null;
}

export function focusInMap(ref: EntityRef) {
  const hit = glyphFor(ref);
  if (!hit) return A().toast(`${ref.id} is not on the map yet`);
  lab.setWorkspace('map');
  setTimeout(() => {
    if (hit.node) A().focusNode(hit.node);
    if (hit.glyph) useStore.setState({ selection: [key('reaction', hit.glyph)] });
  }, 30);
}

/** From the Map Builder inspector: open the entity in the COBRAGUI inspector. */
export function inspectInModel(ref: EntityRef) {
  const s = useLab.getState();
  if (!s.model) return A().toast('Load the model in COBRAGUI first');
  const known = ref.kind === 'reaction' ? s.index?.rxn.has(ref.id) : ref.kind === 'metabolite' ? s.index?.met.has(ref.id) : s.index?.gene.has(ref.id);
  if (!known) return A().toast(`${ref.id} is not in the COBRAGUI model (${s.model.name})`);
  lab.setWorkspace('lab');
  if (s.section === 'overview') lab.setSection('explore');
  lab.navigate(ref);
}

// ------------------------------------------------------------------ datasets

function ensureCondition(conditions: Condition[], r: SimulationResult): Condition[] {
  const id = condIdOf(r);
  const hit = conditions.find((c) => c.id === id);
  if (hit) return conditions.map((c) => (c.id === id ? { ...c, name: r.name } : c));
  return [...conditions, { id, name: r.name, color: CONDITION_COLORS[conditions.length % CONDITION_COLORS.length] }];
}

function blank(id: string, name: string, kind: Dataset['kind'], target: Dataset['target'], unit?: string): Dataset {
  return { id, name, kind, target, unit, visible: true, columns: [], values: {}, unmatched: [], idMap: {}, matchedFraction: 1 };
}

/** Put one value per entity into column `col` of a dataset (adding the column if needed). */
function withColumn(ds: Dataset, col: string, values: Record<string, number | null>, ranges?: Record<string, [number, number] | null>): Dataset {
  const columns = ds.columns.includes(col) ? ds.columns : [...ds.columns, col];
  const ci = columns.indexOf(col);
  const ids = new Set([...Object.keys(ds.values), ...Object.keys(values), ...Object.keys(ranges ?? {})]);
  const out: Dataset = { ...ds, columns, values: {} };
  if (ranges || ds.ranges) out.ranges = {};
  for (const id of ids) {
    const row = [...(ds.values[id] ?? [])];
    while (row.length < columns.length) row.push(null);
    row[ci] = values[id] ?? null;
    out.values[id] = row;
    if (out.ranges) {
      const rr = [...(ds.ranges?.[id] ?? [])];
      while (rr.length < columns.length) rr.push(null);
      if (ranges) rr[ci] = ranges[id] ?? null;
      out.ranges[id] = rr;
    }
  }
  return out;
}

export interface ResultMappingChoice { width: boolean; color: 'magnitude' | 'signed' | 'none'; turnoverRadius: boolean; fvaRange: boolean }

function upsertMapping(mappings: VisualizationMapping[], m: Omit<VisualizationMapping, 'id'>): VisualizationMapping[] {
  const i = mappings.findIndex((x) => x.target === m.target && x.property === m.property);
  if (i >= 0) return mappings.map((x, j) => (j === i ? { ...x, ...m, domain: undefined } : x));
  return [...mappings, { ...m, id: `m_${Math.random().toString(36).slice(2, 9)}` }];
}

/** Add result columns to the shared datasets. Returns the new map-store pieces (not committed). */
function stageResults(results: SimulationResult[]) {
  const s = useStore.getState();
  let datasets = [...s.datasets];
  let conditions = [...s.conditions];
  const put = (ds: Dataset) => { datasets = datasets.some((d) => d.id === ds.id) ? datasets.map((d) => (d.id === ds.id ? ds : d)) : [...datasets, ds]; };
  const find = (id: string) => datasets.find((d) => d.id === id);
  for (const r of results) {
    conditions = ensureCondition(conditions, r);
    const col = condIdOf(r);
    if (r.reactionFluxes) put(withColumn(find(FLUX_DS) ?? blank(FLUX_DS, 'COBRA simulations · flux', 'flux', 'reaction', FLUX_UNIT), col, r.reactionFluxes));
    if (r.metaboliteTurnover) put(withColumn(find(TURNOVER_DS) ?? blank(TURNOVER_DS, 'COBRA simulations · metabolite turnover', 'turnover', 'metabolite', FLUX_UNIT), col, r.metaboliteTurnover));
    if (r.fva) {
      const ranges: Record<string, [number, number] | null> = {};
      const empty: Record<string, null> = {};
      for (const [id, iv] of Object.entries(r.fva)) { ranges[id] = iv.minimum == null || iv.maximum == null ? null : [iv.minimum, iv.maximum]; empty[id] = null; }
      put(withColumn(find(FVA_DS) ?? { ...blank(FVA_DS, 'COBRA simulations · FVA intervals', 'fva', 'reaction', FLUX_UNIT), ranges: {} }, col, empty, ranges));
    }
  }
  return { datasets, conditions };
}

/**
 * Map Builder → Data → import a results JSON (COBRAGUI export or legacy GEM Explorer).
 * Results become conditions of the shared COBRA datasets; ids are matched against the map's model.
 */
export function importResultsToMap(results: SimulationResult[], file: string) {
  const s = useStore.getState();
  const { datasets, conditions } = stageResults(results);
  let mappings = [...s.mappings];
  const has = (target: string, prop: string) => mappings.some((m) => m.target === target && m.property === prop && m.enabled);
  const last = results[results.length - 1];
  let switched = 0;
  if (last.reactionFluxes) {
    if (!has('reaction', 'width')) mappings = upsertMapping(mappings, { datasetId: FLUX_DS, target: 'reaction', property: 'width', scale: 'linear', magnitude: true, enabled: true });
    if (!has('reaction', 'color')) mappings = upsertMapping(mappings, { datasetId: FLUX_DS, target: 'reaction', property: 'color', scale: 'linear', magnitude: true, enabled: true });
    // Reaction mappings bound to a dataset without the imported condition would show nothing:
    // point them at the imported fluxes (undoable). Metabolite mappings are left alone — a
    // concentration mapping must never silently become a turnover mapping.
    const col = condIdOf(last);
    mappings = mappings.map((m) => {
      const ds = datasets.find((d) => d.id === m.datasetId);
      if (m.target !== 'reaction' || m.datasetId === FLUX_DS || ds?.columns.includes(col) || ds?.kind === 'comparison') return m;
      switched++;
      return { ...m, datasetId: FLUX_DS, domain: undefined };
    });
  }
  s.actions.commit(() => ({ datasets, conditions, mappings }));
  s.actions.setView({ activeCondition: condIdOf(last), compare: 'absolute', reference: s.view.reference && conditions.some((c) => c.id === s.view.reference) ? s.view.reference : condIdOf(results[0]) });
  useStore.setState({ leftTab: 'data' });
  const ids = new Set(results.flatMap((r) => Object.keys(r.reactionFluxes ?? r.fva ?? {})));
  const matched = s.model ? [...ids].filter((id) => s.model!.reactions[id]).length : null;
  const fva = results.filter((r) => r.fva).length;
  A().toast(`${file}: ${results.length} result${results.length > 1 ? 's' : ''} added as conditions${matched != null ? ` · ${matched}/${ids.size} reaction ids in ${s.model!.name}` : ' · load a GEM to bind them'}${fva ? ` · ${fva} FVA as ranges (use range plots)` : ''}${switched ? ` · ${switched} reaction mapping${switched > 1 ? 's' : ''} now use the imported fluxes (Ctrl Z to undo)` : ''}`);
}

export function sendResultToMap(r: SimulationResult, choice: ResultMappingChoice) {
  if (!ensureMapModel()) return;
  const s = useStore.getState();
  const { datasets, conditions } = stageResults([r]);
  let mappings = [...s.mappings];
  if (r.reactionFluxes) {
    if (choice.width) mappings = upsertMapping(mappings, { datasetId: FLUX_DS, target: 'reaction', property: 'width', scale: 'linear', magnitude: true, enabled: true });
    if (choice.color !== 'none') mappings = upsertMapping(mappings, { datasetId: FLUX_DS, target: 'reaction', property: 'color', scale: 'linear', magnitude: choice.color === 'magnitude', enabled: true });
  }
  if (r.metaboliteTurnover && choice.turnoverRadius) mappings = upsertMapping(mappings, { datasetId: TURNOVER_DS, target: 'metabolite', property: 'radius', scale: 'sqrt', magnitude: true, enabled: true });
  s.actions.commit(() => ({ datasets, conditions, mappings }));
  s.actions.setView({ activeCondition: condIdOf(r), compare: 'absolute', reference: s.view.reference && conditions.some((c) => c.id === s.view.reference) ? s.view.reference : condIdOf(r) });
  const onMap = Object.values(s.doc.reactions).filter((g) => g.reactionId && (r.reactionFluxes?.[g.reactionId] != null || r.fva?.[g.reactionId])).length;
  A().toast(`“${r.name}” is now a dataset in the Map Builder${onMap ? ` · ${onMap} arrows bound` : ' · add reactions to the map to see it'}`);
  lab.log('info', `Result sent to Map Builder: ${r.name}`);
  lab.setWorkspace('map');
}

export function sendComparisonToMap(cmp: ComparisonResult, a: SimulationResult, b: SimulationResult, metric: 'log2fc' | 'delta', width: boolean) {
  if (!ensureMapModel() || cmp.kind !== 'flux') return;
  const s = useStore.getState();
  const staged = stageResults([a, b]);
  const colB = condIdOf(b);
  const values: Record<string, number | null> = {};
  let reversals = 0, undefinedFc = 0;
  for (const row of cmp.reactions as CompareRow[]) {
    values[row.id] = metric === 'log2fc' ? row.log2fc : row.delta;
    if (row.category === 'reversal') reversals++;
    if (metric === 'log2fc' && row.log2fc == null && row.category !== 'both-zero') undefinedFc++;
  }
  const id = `ds_cmp_${a.id}_${b.id}_${metric}`;
  const name = metric === 'log2fc' ? `log₂FC |v| · ${b.name} vs ${a.name}` : `Δ flux · ${b.name} − ${a.name}`;
  const cmpDs = withColumn(blank(id, name, 'comparison', 'reaction', metric === 'delta' ? FLUX_UNIT : undefined), colB, values);
  const datasets = [...staged.datasets.filter((d) => d.id !== id), cmpDs];
  let mappings = upsertMapping([...s.mappings], { datasetId: id, target: 'reaction', property: 'color', scale: 'linear', magnitude: false, enabled: true });
  if (width) mappings = upsertMapping(mappings, { datasetId: FLUX_DS, target: 'reaction', property: 'width', scale: 'linear', magnitude: true, enabled: true });
  s.actions.commit(() => ({ datasets, conditions: staged.conditions, mappings }));
  s.actions.setView({ activeCondition: colB, compare: 'absolute', reference: condIdOf(a) });
  const notes = [`Comparison sent: colour = ${metric === 'log2fc' ? 'log₂FC |v|' : 'Δ flux'} (diverging)${width ? ', width = |flux| in B' : ''}`];
  if (metric === 'log2fc' && undefinedFc) notes.push(`${undefinedFc} reactions without a defined log₂FC (activation, inactivation or ${reversals} direction reversals) are drawn neutral`);
  A().toast(notes.join(' · '));
  lab.log('info', notes.join('; '));
  lab.setWorkspace('map');
}
