/**
 * Central Carbon Metabolism demo: a compact BiGG-style GEM, four simulated
 * conditions (P10, P12, P26, P28) with pFBA-like fluxes, flux-sampling
 * distributions and metabolite pools. Values are synthetic.
 */
import { rng } from '../data/stats';
import type { Condition, Dataset } from '../data/types';
import type { MetabolicModel, Metabolite, Reaction } from '../model/types';
import { emptyProject, uid, type ProjectFile } from '../store/project';
import { autoBind, BUILTIN_TEMPLATES } from '../templates/templates';
import type { VisualDoc } from '../viz/types';

const MET_NAMES: Record<string, [string, string, number]> = {
  glc__D: ['D-Glucose', 'C6H12O6', 0], g6p: ['D-Glucose 6-phosphate', 'C6H11O9P', -2], f6p: ['D-Fructose 6-phosphate', 'C6H11O9P', -2],
  fdp: ['D-Fructose 1,6-bisphosphate', 'C6H10O12P2', -4], dhap: ['Dihydroxyacetone phosphate', 'C3H5O6P', -2], g3p: ['Glyceraldehyde 3-phosphate', 'C3H5O6P', -2],
  '13dpg': ['3-Phospho-D-glyceroyl phosphate', 'C3H4O10P2', -4], '3pg': ['3-Phospho-D-glycerate', 'C3H4O7P', -3], '2pg': ['D-Glycerate 2-phosphate', 'C3H4O7P', -3],
  pep: ['Phosphoenolpyruvate', 'C3H2O6P', -3], pyr: ['Pyruvate', 'C3H3O3', -1], lac__L: ['L-Lactate', 'C3H5O3', -1], accoa: ['Acetyl-CoA', 'C23H34N7O17P3S', -4],
  '6pgl': ['6-Phospho-D-glucono-1,5-lactone', 'C6H9O9P', -2], '6pgc': ['6-Phospho-D-gluconate', 'C6H10O10P', -3], ru5p__D: ['D-Ribulose 5-phosphate', 'C5H9O8P', -2],
  r5p: ['Alpha-D-Ribose 5-phosphate', 'C5H9O8P', -2], xu5p__D: ['D-Xylulose 5-phosphate', 'C5H9O8P', -2],
  cit: ['Citrate', 'C6H5O7', -3], acon_C: ['cis-Aconitate', 'C6H3O6', -3], icit: ['Isocitrate', 'C6H5O7', -3], akg: ['2-Oxoglutarate', 'C5H4O5', -2],
  succoa: ['Succinyl-CoA', 'C25H35N7O19P3S', -5], succ: ['Succinate', 'C4H4O4', -2], fum: ['Fumarate', 'C4H2O4', -2], mal__L: ['L-Malate', 'C4H4O5', -2], oaa: ['Oxaloacetate', 'C4H2O5', -2],
  atp: ['ATP', 'C10H12N5O13P3', -4], adp: ['ADP', 'C10H12N5O10P2', -3], h: ['H+', 'H', 1], h2o: ['H2O', 'H2O', 0], pi: ['Phosphate', 'HO4P', -2],
  nad: ['NAD+', 'C21H26N7O14P2', -1], nadh: ['NADH', 'C21H27N7O14P2', -2], nadp: ['NADP+', 'C21H25N7O17P3', -3], nadph: ['NADPH', 'C21H26N7O17P3', -4],
  coa: ['Coenzyme A', 'C21H32N7O16P3S', -4], co2: ['CO2', 'CO2', 0], q8: ['Ubiquinone-8', 'C49H74O4', 0], q8h2: ['Ubiquinol-8', 'C49H76O4', 0],
};

// id, name, equation (c = cytosol unless suffixed), reversible, subsystem, genes
const RXNS: [string, string, string, boolean, string, string][] = [
  ['GLCt', 'Glucose transport', 'glc__D_e -> glc__D_c', false, 'Transport', 'GLUT1'],
  ['HEX1', 'Hexokinase', 'glc__D + atp -> g6p + adp + h', false, 'Glycolysis', 'HK1 or HK2'],
  ['PGI', 'Glucose-6-phosphate isomerase', 'g6p <-> f6p', true, 'Glycolysis', 'GPI'],
  ['PFK', 'Phosphofructokinase', 'f6p + atp -> fdp + adp + h', false, 'Glycolysis', 'PFKL and PFKM'],
  ['FBA', 'Fructose-bisphosphate aldolase', 'fdp <-> dhap + g3p', true, 'Glycolysis', 'ALDOA'],
  ['TPI', 'Triose-phosphate isomerase', 'dhap <-> g3p', true, 'Glycolysis', 'TPI1'],
  ['GAPD', 'Glyceraldehyde-3-phosphate dehydrogenase', 'g3p + nad + pi <-> 13dpg + h + nadh', true, 'Glycolysis', 'GAPDH'],
  ['PGK', 'Phosphoglycerate kinase', '3pg + atp <-> 13dpg + adp', true, 'Glycolysis', 'PGK1'],
  ['PGM', 'Phosphoglycerate mutase', '2pg <-> 3pg', true, 'Glycolysis', 'PGAM1'],
  ['ENO', 'Enolase', '2pg <-> h2o + pep', true, 'Glycolysis', 'ENO1'],
  ['PYK', 'Pyruvate kinase', 'adp + h + pep -> atp + pyr', false, 'Glycolysis', 'PKM'],
  ['LDH_L', 'L-lactate dehydrogenase', 'lac__L + nad <-> h + nadh + pyr', true, 'Pyruvate metabolism', 'LDHA or LDHB'],
  ['PDH', 'Pyruvate dehydrogenase', 'coa + nad + pyr -> accoa + co2 + nadh', false, 'Pyruvate metabolism', 'PDHA1 and DLAT and DLD'],
  ['G6PDH2r', 'Glucose 6-phosphate dehydrogenase', 'g6p + nadp <-> 6pgl + h + nadph', true, 'Pentose phosphate pathway', 'G6PD'],
  ['PGL', '6-Phosphogluconolactonase', '6pgl + h2o -> 6pgc + h', false, 'Pentose phosphate pathway', 'PGLS'],
  ['GND', 'Phosphogluconate dehydrogenase', '6pgc + nadp -> co2 + nadph + ru5p__D', false, 'Pentose phosphate pathway', 'PGD'],
  ['RPI', 'Ribose-5-phosphate isomerase', 'r5p <-> ru5p__D', true, 'Pentose phosphate pathway', 'RPIA'],
  ['RPE', 'Ribulose 5-phosphate 3-epimerase', 'ru5p__D <-> xu5p__D', true, 'Pentose phosphate pathway', 'RPE'],
  ['CS', 'Citrate synthase', 'accoa + h2o + oaa -> cit + coa + h', false, 'TCA cycle', 'CS'],
  ['ACONTa', 'Aconitase (half-reaction A)', 'cit <-> acon_C + h2o', true, 'TCA cycle', 'ACO2'],
  ['ACONTb', 'Aconitase (half-reaction B)', 'acon_C + h2o <-> icit', true, 'TCA cycle', 'ACO2'],
  ['ICDHyr', 'Isocitrate dehydrogenase (NADP)', 'icit + nadp <-> akg + co2 + nadph', true, 'TCA cycle', 'IDH2'],
  ['AKGDH', '2-Oxoglutarate dehydrogenase', 'akg + coa + nad -> co2 + nadh + succoa', false, 'TCA cycle', 'OGDH and DLST and DLD'],
  ['SUCOAS', 'Succinyl-CoA synthetase', 'atp + coa + succ <-> adp + pi + succoa', true, 'TCA cycle', 'SUCLG1 and SUCLA2'],
  ['SUCDi', 'Succinate dehydrogenase', 'succ + q8 -> fum + q8h2', false, 'TCA cycle', 'SDHA and SDHB and SDHC and SDHD'],
  ['FUM', 'Fumarase', 'fum + h2o <-> mal__L', true, 'TCA cycle', 'FH'],
  ['MDH', 'Malate dehydrogenase', 'mal__L + nad <-> h + nadh + oaa', true, 'TCA cycle', 'MDH2'],
  ['PYRt2', 'Pyruvate transport (H+ symport)', 'pyr_e + h_e <-> pyr_c + h_c', true, 'Transport', 'MPC1'],
  ['L_LACt2r', 'L-lactate transport', 'lac__L_c + h_c <-> lac__L_e + h_e', true, 'Transport', 'SLC16A1'],
  ['EX_glc__D_e', 'Glucose exchange', 'glc__D_e <->', true, 'Exchange', ''],
  ['EX_pyr_e', 'Pyruvate exchange', 'pyr_e <->', true, 'Exchange', ''],
  ['EX_lac__L_e', 'L-Lactate exchange', 'lac__L_e <->', true, 'Exchange', ''],
];

function parseEq(eq: string): Record<string, number> {
  const [l, r] = eq.split(/<->|->/).map((s) => s.trim());
  const out: Record<string, number> = {};
  const side = (s: string, sign: number) => s.split('+').map((x) => x.trim()).filter(Boolean).forEach((t) => {
    const m = t.match(/^([\d.]+)\s+(.+)$/);
    const coef = m ? Number(m[1]) : 1;
    let id = m ? m[2] : t;
    if (!/_[ce]$/.test(id)) id += '_c';
    out[id] = (out[id] ?? 0) + sign * coef;
  });
  side(l, -1);
  side(r ?? '', 1);
  return out;
}

export function demoModel(): MetabolicModel {
  const metabolites: Record<string, Metabolite> = {};
  const reactions: Record<string, Reaction> = {};
  for (const [id, name, eq, rev, subsystem, gpr] of RXNS) {
    const stoichiometry = parseEq(eq);
    for (const mid of Object.keys(stoichiometry)) {
      if (metabolites[mid]) continue;
      const base = mid.replace(/_[ce]$/, '');
      const [n, formula, charge] = MET_NAMES[base] ?? [base, undefined, undefined];
      metabolites[mid] = { id: mid, name: n, formula, charge, compartment: mid.endsWith('_e') ? 'e' : 'c' };
    }
    reactions[id] = {
      id, name, stoichiometry, reversible: rev, lowerBound: rev ? -1000 : 0, upperBound: 1000, subsystem,
      gpr: gpr || undefined, genes: gpr ? gpr.replace(/[()]/g, '').split(/\s+(?:and|or)\s+/) : [],
    };
  }
  const genes = Object.fromEntries(Object.values(reactions).flatMap((r) => r.genes).map((g) => [g, { id: g, name: g }]));
  return { id: 'demo_ccm', name: 'Central carbon demo', metabolites, reactions, genes, compartments: { c: 'cytosol', e: 'extracellular' }, source: 'demo' };
}

/** pFBA-like fluxes in the model's stoichiometric direction (mmol/gDW/h). */
export const DEMO_FLUX: Record<string, [number, number, number, number]> = {
  GLCt: [4.2, 4.0, 3.1, 3.0], HEX1: [4.2, 4.0, 3.1, 3.0], PGI: [3.35, 3.15, 2.62, 2.52], PFK: [3.35, 3.2, 2.6, 2.5],
  FBA: [3.35, 3.2, 2.6, 2.5], TPI: [3.3, 3.12, 2.52, 2.42], GAPD: [6.62, 6.38, 5.1, 4.96], PGK: [-6.62, -6.38, -5.1, -4.96],
  PGM: [-6.3, -6.1, -4.85, -4.75], ENO: [6.3, 6.1, 4.85, 4.75], PYK: [5.02, 4.82, 3.62, 3.5], LDH_L: [-4.08, -3.78, -1.22, -0.92],
  PDH: [1.02, 1.18, 2.56, 2.82], G6PDH2r: [0.82, 0.8, 0.46, 0.45], PGL: [0.82, 0.8, 0.46, 0.45], GND: [0.82, 0.8, 0.46, 0.45],
  RPI: [-0.31, -0.3, -0.19, -0.18], RPE: [0.51, 0.5, 0.27, 0.27], CS: [0.92, 1.12, 2.42, 2.64], ACONTa: [0.92, 1.12, 2.42, 2.64],
  ACONTb: [0.92, 1.12, 2.42, 2.64], ICDHyr: [0.88, 1.06, 2.33, 2.52], AKGDH: [0.72, 0.9, 2.02, 2.21], SUCOAS: [-0.72, -0.9, -2.02, -2.21],
  SUCDi: [0.76, 0.95, 2.1, 2.31], FUM: [0.76, 0.95, 2.1, 2.31], MDH: [0.7, 0.88, 1.98, 2.2], PYRt2: [0.12, 0.05, -0.18, -0.24],
  L_LACt2r: [4.08, 3.78, 1.22, 0.92], EX_glc__D_e: [-4.2, -4.0, -3.1, -3.0], EX_pyr_e: [-0.12, -0.05, 0.18, 0.24], EX_lac__L_e: [4.08, 3.78, 1.22, 0.92],
};

export const DEMO_CONDITIONS: Condition[] = [
  { id: 'P10', name: 'P10', color: '#e8505b', time: 10 },
  { id: 'P12', name: 'P12', color: '#a0524f', time: 12 },
  { id: 'P26', name: 'P26', color: '#5b6ee1', time: 26 },
  { id: 'P28', name: 'P28', color: '#262c8c', time: 28 },
];

/** CSV text equivalent to the demo pFBA dataset (also shipped in public/examples). */
export function demoFluxCsv(): string {
  return ['reaction,P10,P12,P26,P28', ...Object.entries(DEMO_FLUX).map(([r, v]) => `${r},${v.join(',')}`)].join('\n');
}

function demoDatasets(): Dataset[] {
  const cols = DEMO_CONDITIONS.map((c) => c.id);
  const flux: Dataset = {
    id: 'ds_pfba', name: 'pFBA (simulated)', kind: 'flux', target: 'reaction', unit: 'mmol gDW⁻¹ h⁻¹', visible: true, columns: cols,
    values: Object.fromEntries(Object.entries(DEMO_FLUX).map(([k, v]) => [k, [...v]])), unmatched: [], idMap: {}, matchedFraction: 1,
  };
  const R = rng(42);
  const samples: Record<string, number[][]> = {};
  const values: Record<string, (number | null)[]> = {};
  for (const [rid, means] of Object.entries(DEMO_FLUX)) {
    samples[rid] = means.map((m, ci) => {
      const s = Math.abs(m) * (0.035 + 0.02 * ci) + 0.03;
      const bimodal = ['PDH', 'LDH_L', 'PYRt2', 'CS'].includes(rid) && ci % 2 === 0;
      return Array.from({ length: 300 }, () => {
        const shift = bimodal && R.next() < 0.3 ? s * 3.2 : 0;
        return +(m + shift + R.normal() * s).toFixed(4);
      });
    });
    values[rid] = samples[rid].map((xs) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4));
  }
  const sampling: Dataset = {
    id: 'ds_samples', name: 'Flux sampling (n=300)', kind: 'samples', target: 'reaction', unit: 'mmol gDW⁻¹ h⁻¹', visible: true, columns: cols,
    values, samples, unmatched: [], idMap: {}, matchedFraction: 1,
  };
  const pools: Record<string, number[]> = {
    g6p_c: [1.6, 1.5, 0.9, 0.85], f6p_c: [0.5, 0.48, 0.3, 0.28], fdp_c: [2.4, 2.1, 1.1, 1.0], pep_c: [0.35, 0.32, 0.22, 0.2], pyr_c: [0.9, 0.85, 0.5, 0.45],
    lac__L_c: [6.5, 6.0, 2.2, 1.8], accoa_c: [0.12, 0.13, 0.25, 0.27], cit_c: [0.8, 0.9, 1.8, 1.9], akg_c: [0.4, 0.45, 0.9, 1.0], succ_c: [0.6, 0.62, 1.1, 1.2],
    fum_c: [0.2, 0.22, 0.4, 0.42], mal__L_c: [0.9, 0.95, 1.6, 1.7], oaa_c: [0.05, 0.05, 0.08, 0.09],
  };
  const conc: Dataset = {
    id: 'ds_conc', name: 'Metabolite pools (simulated)', kind: 'metabolite', target: 'metabolite', unit: 'mM', visible: true, columns: cols,
    values: pools, unmatched: [], idMap: {}, matchedFraction: 1,
  };
  return [flux, sampling, conc];
}

export function demoProject(): ProjectFile {
  const model = demoModel();
  const p = emptyProject();
  const t = BUILTIN_TEMPLATES.find((x) => x.id === 'central-carbon')!;
  const doc: VisualDoc = { ...p.doc, nodes: {}, reactions: {}, groups: {}, texts: {}, plots: {} };
  const map = new Map<string, string>();
  const ox = 120, oy = 120;
  // node ids from the readable former slot ids (n_pyr, n_lac …), kept as aliases in the template file
  const alias = (k: string) => t.spec?.biology.slots.find((s) => s.slot === k)?.aliases?.[0] ?? k;
  for (const n of t.nodes) {
    const id = 'n_' + alias(n.key);
    map.set(n.key, id);
    doc.nodes[id] = { id, x: ox + n.x + 280, y: oy + n.y, label: n.label, hints: n.hints, labelPos: n.labelPos };
  }
  for (const r of t.reactions) {
    const id = 'r_' + r.label;
    doc.reactions[id] = { id, sources: r.sources.map((k) => map.get(k)!), targets: r.targets.map((k) => map.get(k)!), label: r.label, hints: r.hints, routing: r.routing ?? 'straight', bend: r.bend };
  }
  // exchange metabolites, drawn with dashed rings and dotted transport arrows
  const pyr = doc.nodes.n_pyr, lac = doc.nodes.n_lac;
  doc.nodes.n_pyr_e = { id: 'n_pyr_e', x: pyr.x - 90, y: pyr.y, metaboliteId: 'pyr_e', label: 'pyr[e]', labelPos: 'left', role: 'exchange' };
  doc.nodes.n_lac_e = { id: 'n_lac_e', x: lac.x - 90, y: lac.y, metaboliteId: 'lac__L_e', label: 'lac[e]', labelPos: 'left', role: 'exchange' };
  doc.reactions.r_PYRt = { id: 'r_PYRt', sources: ['n_pyr_e'], targets: ['n_pyr'], label: 'MPC', routing: 'straight', role: 'exchange' };
  doc.reactions.r_LACt = { id: 'r_LACt', sources: ['n_lac'], targets: ['n_lac_e'], label: 'MCT', routing: 'straight', role: 'exchange' };
  doc.nodes.n_lac.labelPos = 'right';
  doc.reactions.r_ACONT.labelFlip = true;
  for (const r of ['r_CS', 'r_ICDH', 'r_AKGDH', 'r_SUCOAS', 'r_SDH', 'r_FUM', 'r_MDH']) doc.reactions[r].labelFlip = true;
  for (const g of t.groups ?? []) {
    const id = 'g_' + g.title.replace(/\W+/g, '');
    doc.groups[id] = { id, kind: g.kind, title: g.title, nodeIds: g.keys.map((k) => map.get(k)!), padding: 26, fill: 'none', stroke: 'none', dashed: false };
  }
  doc.groups.g_Glycolysis.hidden = true;
  doc.groups.g_Pentosephosphatepathway.hidden = true;
  const bound = autoBind(doc, model).doc;
  bound.reactions.r_PYRt = { ...bound.reactions.r_PYRt, reactionId: 'PYRt2', reversedToModel: false };
  bound.reactions.r_LACt = { ...bound.reactions.r_LACt, reactionId: 'L_LACt2r', reversedToModel: false };

  bound.texts = {
    t_a: { id: 't_a', x: 40, y: 60, text: 'a', size: 22, weight: 700, kind: 'panel' },
    t_title: { id: 't_title', x: 70, y: 60, text: 'Central carbon metabolism', size: 17, weight: 700, kind: 'title' },
    t_glyc: { id: 't_glyc', x: 372, y: 100, text: 'Glycolysis', size: 11, weight: 600, italic: true, kind: 'text' },
    t_ppp: { id: 't_ppp', x: 120, y: 150, text: 'Pentose phosphate pathway', size: 11, weight: 600, italic: true, kind: 'text' },
  };
  const plot = (rxn: string, dx: number, dy: number) => {
    const id = uid('p');
    bound.plots[id] = { id, anchor: { kind: 'reaction', id: rxn }, type: 'density', dx, dy, w: 130, h: 78, datasetId: 'ds_samples', showConnector: true, showAxis: true };
  };
  // glycolysis column is at x=400; plots sit in a column to its right, TCA plots on the far right
  plot('r_HEX', 80, -50);
  plot('r_PFK', 80, -70);
  plot('r_GAPD', 80, -90);
  plot('r_ENO', 80, -110);
  plot('r_PYK', 80, -130);
  plot('r_LDH', -290, -20);
  plot('r_PDH', -345, -110);
  plot('r_CS', 207, -118);
  plot('r_ICDH', 122, -44);
  plot('r_AKGDH', 74, -38);
  plot('r_SUCOAS', 122, 4);
  plot('r_SDH', -106, 64);
  plot('r_FUM', -299, 20);
  bound.legend = { x: 890, y: 80, visible: true, title: 'Legend' };

  return {
    ...p,
    name: 'Central Carbon Metabolism Demo',
    model,
    datasets: demoDatasets(),
    conditions: DEMO_CONDITIONS,
    doc: bound,
    mappings: [
      { id: 'm_w', datasetId: 'ds_pfba', target: 'reaction', property: 'width', scale: 'linear', magnitude: true, enabled: true },
      { id: 'm_c', datasetId: 'ds_pfba', target: 'reaction', property: 'color', scale: 'linear', magnitude: true, enabled: true, palette: 'viridis' },
      { id: 'm_r', datasetId: 'ds_conc', target: 'metabolite', property: 'radius', scale: 'sqrt', magnitude: true, enabled: false },
    ],
    view: { activeCondition: 'P10', compare: 'absolute', reference: 'P10' },
    savedViews: [],
  };
}
