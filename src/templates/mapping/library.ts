/**
 * Canonical metabolite library: model-independent biological identities that
 * pathway templates refer to. Templates never store model IDs; they point at an
 * entry here, and the mapping engine discovers the model metabolite.
 *
 * `xrefs` are exact identities. `related` are specific forms that a GEM may use
 * for the same pathway pool (anomers such as alpha-D-glucose 6-phosphate for
 * D-glucose 6-phosphate in KEGG-based models); they score lower than an exact
 * identity and are always labelled as such in the evidence.
 *
 * Formulas are neutral forms; only heavy atoms are compared.
 * MetaNetX IDs are deliberately left out until they come from MNXref itself
 * (they changed between releases; a wrong one would be a confident wrong match).
 */
import type { Namespace } from './identifiers';

export type XrefTable = Partial<Record<Namespace, string[]>>;

export interface RelatedForm {
  note: string;
  names: string[];
  xrefs: XrefTable;
}

export interface CanonicalMetabolite {
  id: string;
  /** Display name. */
  name: string;
  /** Short label used on the map (BiGG-style abbreviation). */
  short: string;
  formula?: string;
  synonyms: string[];
  xrefs: XrefTable;
  related?: RelatedForm[];
}

const M = (e: CanonicalMetabolite) => e;

export const METABOLITES: CanonicalMetabolite[] = [
  // ---------------------------------------------------------------- glycolysis
  M({
    id: 'D-glucose', name: 'D-Glucose', short: 'glc_D', formula: 'C6H12O6',
    synonyms: ['glucose', 'D-glucose', 'dextrose', 'D-glucopyranose', 'Glc'],
    xrefs: { 'kegg.compound': ['C00031'], chebi: ['17634', '4167'], 'bigg.metabolite': ['glc__D', 'glc_D'], 'seed.compound': ['cpd00027'], 'metacyc.compound': ['GLC', 'D-GLUCOSE'], hmdb: ['HMDB0000122'] },
    related: [{ note: 'anomer of D-glucose', names: ['alpha-D-glucose', 'beta-D-glucose', 'alpha-D-glucopyranose', 'beta-D-glucopyranose'], xrefs: { 'kegg.compound': ['C00267', 'C00221'], chebi: ['17925', '15903'], 'bigg.metabolite': ['glc__aD', 'glc__bD'], 'metacyc.compound': ['ALPHA-GLUCOSE', 'GLC-D-BETA'] } }],
  }),
  M({
    id: 'D-glucose-6-phosphate', name: 'D-Glucose 6-phosphate', short: 'g6p', formula: 'C6H13O9P',
    synonyms: ['glucose 6-phosphate', 'D-glucose 6-phosphate', 'glucose-6-phosphate', 'G6P', 'D-glucopyranose 6-phosphate', 'Robison ester'],
    xrefs: { 'kegg.compound': ['C00092'], chebi: ['14314', '4170', '61548'], 'bigg.metabolite': ['g6p'], 'seed.compound': ['cpd00079'], 'metacyc.compound': ['GLC-6-P', 'D-GLUCOSE-6-PHOSPHATE'], hmdb: ['HMDB0001401'] },
    related: [{ note: 'anomer of D-glucose 6-phosphate', names: ['alpha-D-glucose 6-phosphate', 'beta-D-glucose 6-phosphate'], xrefs: { 'kegg.compound': ['C00668', 'C01172'], 'bigg.metabolite': ['g6p_A', 'g6p_B'], 'metacyc.compound': ['ALPHA-GLC-6-P', 'GLC-6-P-BETA'] } }],
  }),
  M({
    id: 'D-fructose-6-phosphate', name: 'D-Fructose 6-phosphate', short: 'f6p', formula: 'C6H13O9P',
    synonyms: ['fructose 6-phosphate', 'D-fructose 6-phosphate', 'fructose-6-phosphate', 'F6P', 'Neuberg ester'],
    xrefs: { 'kegg.compound': ['C00085'], chebi: ['15946', '61527'], 'bigg.metabolite': ['f6p'], 'seed.compound': ['cpd00072'], 'metacyc.compound': ['FRUCTOSE-6P'], hmdb: ['HMDB0000124'] },
    related: [{ note: 'ring form of D-fructose 6-phosphate', names: ['beta-D-fructose 6-phosphate', 'beta-D-fructofuranose 6-phosphate'], xrefs: { 'kegg.compound': ['C05345'], chebi: ['16084', '57634'], 'bigg.metabolite': ['f6p_B'] } }],
  }),
  M({
    id: 'D-fructose-1,6-bisphosphate', name: 'D-Fructose 1,6-bisphosphate', short: 'fdp', formula: 'C6H14O12P2',
    synonyms: ['fructose 1,6-bisphosphate', 'D-fructose 1,6-bisphosphate', 'fructose 1,6-diphosphate', 'fructose-1,6-bisphosphate', 'FBP', 'F16BP', 'Harden-Young ester'],
    xrefs: { 'kegg.compound': ['C00354'], chebi: ['49299', '32966'], 'bigg.metabolite': ['fdp'], 'seed.compound': ['cpd00290'], 'metacyc.compound': ['FRUCTOSE-16-DIPHOSPHATE'], hmdb: ['HMDB0001058'] },
    related: [{ note: 'ring form of D-fructose 1,6-bisphosphate', names: ['beta-D-fructose 1,6-bisphosphate', 'beta-D-fructofuranose 1,6-bisphosphate'], xrefs: { 'kegg.compound': ['C05378'], chebi: ['28013'], 'bigg.metabolite': ['fdp_B'] } }],
  }),
  M({
    id: 'dihydroxyacetone-phosphate', name: 'Dihydroxyacetone phosphate', short: 'dhap', formula: 'C3H7O6P',
    synonyms: ['dihydroxyacetone phosphate', 'glycerone phosphate', 'DHAP', 'dihydroxy-acetone phosphate', 'glycerone-phosphate'],
    xrefs: { 'kegg.compound': ['C00111'], chebi: ['16108', '57642'], 'bigg.metabolite': ['dhap'], 'seed.compound': ['cpd00095'], 'metacyc.compound': ['DIHYDROXY-ACETONE-PHOSPHATE'], hmdb: ['HMDB0001473'] },
  }),
  M({
    id: 'D-glyceraldehyde-3-phosphate', name: 'D-Glyceraldehyde 3-phosphate', short: 'g3p', formula: 'C3H7O6P',
    synonyms: ['glyceraldehyde 3-phosphate', 'D-glyceraldehyde 3-phosphate', 'glyceraldehyde-3-phosphate', 'GAP', 'G3P', 'D-glyceraldehyde-3-phosphate'],
    xrefs: { 'kegg.compound': ['C00118'], chebi: ['29052', '59776'], 'bigg.metabolite': ['g3p'], 'seed.compound': ['cpd00102'], 'metacyc.compound': ['GAP'], hmdb: ['HMDB0001112'] },
    related: [{ note: 'stereo-unspecified glyceraldehyde 3-phosphate', names: ['glyceraldehyde 3-phosphate'], xrefs: { 'kegg.compound': ['C00661'] } }],
  }),
  M({
    id: '1,3-bisphosphoglycerate', name: '3-Phospho-D-glyceroyl phosphate', short: '13dpg', formula: 'C3H8O10P2',
    synonyms: ['3-phospho-D-glyceroyl phosphate', '1,3-bisphospho-D-glycerate', '1,3-bisphosphoglycerate', '1,3-diphosphoglycerate', 'glycerate 1,3-bisphosphate', '1,3-BPG', '13BPG', '3-phospho-D-glyceroyl-phosphate'],
    xrefs: { 'kegg.compound': ['C00236'], chebi: ['16001', '57604'], 'bigg.metabolite': ['13dpg'], 'seed.compound': ['cpd00203'], 'metacyc.compound': ['DPG'], hmdb: ['HMDB0001270'] },
  }),
  M({
    id: '3-phospho-D-glycerate', name: '3-Phospho-D-glycerate', short: '3pg', formula: 'C3H7O7P',
    synonyms: ['3-phospho-D-glycerate', '3-phosphoglycerate', 'glycerate 3-phosphate', '3-phosphoglyceric acid', '3PG', 'D-glycerate 3-phosphate'],
    xrefs: { 'kegg.compound': ['C00197'], chebi: ['17794', '58272'], 'bigg.metabolite': ['3pg'], 'seed.compound': ['cpd00169'], 'metacyc.compound': ['G3P'], hmdb: ['HMDB0000807'] },
  }),
  M({
    id: '2-phospho-D-glycerate', name: '2-Phospho-D-glycerate', short: '2pg', formula: 'C3H7O7P',
    synonyms: ['2-phospho-D-glycerate', 'D-glycerate 2-phosphate', '2-phosphoglycerate', 'glycerate 2-phosphate', '2PG', '2-phosphoglyceric acid'],
    xrefs: { 'kegg.compound': ['C00631'], chebi: ['17835', '58289'], 'bigg.metabolite': ['2pg'], 'seed.compound': ['cpd00482'], 'metacyc.compound': ['2-PG'] },
  }),
  M({
    id: 'phosphoenolpyruvate', name: 'Phosphoenolpyruvate', short: 'pep', formula: 'C3H5O6P',
    synonyms: ['phosphoenolpyruvate', 'phosphoenolpyruvic acid', 'PEP', 'phospho-enol-pyruvate'],
    xrefs: { 'kegg.compound': ['C00074'], chebi: ['18021', '58702'], 'bigg.metabolite': ['pep'], 'seed.compound': ['cpd00061'], 'metacyc.compound': ['PHOSPHO-ENOL-PYRUVATE'], hmdb: ['HMDB0000263'] },
  }),
  M({
    id: 'pyruvate', name: 'Pyruvate', short: 'pyr', formula: 'C3H4O3',
    synonyms: ['pyruvate', 'pyruvic acid', '2-oxopropanoate', '2-oxopropanoic acid', 'Pyr'],
    xrefs: { 'kegg.compound': ['C00022'], chebi: ['15361', '32816'], 'bigg.metabolite': ['pyr'], 'seed.compound': ['cpd00020'], 'metacyc.compound': ['PYRUVATE'], hmdb: ['HMDB0000243'] },
  }),
  M({
    id: 'L-lactate', name: 'L-Lactate', short: 'lac_L', formula: 'C3H6O3',
    synonyms: ['L-lactate', '(S)-lactate', 'L-lactic acid', '(S)-lactic acid', 'L-lac'],
    xrefs: { 'kegg.compound': ['C00186'], chebi: ['16651', '422'], 'bigg.metabolite': ['lac__L', 'lac_L'], 'seed.compound': ['cpd00159'], 'metacyc.compound': ['L-LACTATE'], hmdb: ['HMDB0000190'] },
  }),
  M({
    id: 'D-lactate', name: 'D-Lactate', short: 'lac_D', formula: 'C3H6O3',
    synonyms: ['D-lactate', '(R)-lactate', 'D-lactic acid', '(R)-lactic acid', 'D-lac'],
    xrefs: { 'kegg.compound': ['C00256'], chebi: ['16004', '42111'], 'bigg.metabolite': ['lac__D', 'lac_D'], 'seed.compound': ['cpd00221'], 'metacyc.compound': ['D-LACTATE'], hmdb: ['HMDB0001311'] },
  }),
  M({
    id: 'acetyl-CoA', name: 'Acetyl-CoA', short: 'accoa', formula: 'C23H38N7O17P3S',
    synonyms: ['acetyl-CoA', 'acetyl coenzyme A', 'acetyl-coenzyme A', 'AcCoA'],
    xrefs: { 'kegg.compound': ['C00024'], chebi: ['15351', '57288'], 'bigg.metabolite': ['accoa'], 'seed.compound': ['cpd00022'], 'metacyc.compound': ['ACETYL-COA'], hmdb: ['HMDB0001206'] },
  }),
  // ---------------------------------------------------------------- TCA cycle
  M({
    id: 'citrate', name: 'Citrate', short: 'cit', formula: 'C6H8O7',
    synonyms: ['citrate', 'citric acid', '2-hydroxypropane-1,2,3-tricarboxylate', 'Cit'],
    xrefs: { 'kegg.compound': ['C00158'], chebi: ['16947', '30769'], 'bigg.metabolite': ['cit'], 'seed.compound': ['cpd00137'], 'metacyc.compound': ['CIT'], hmdb: ['HMDB0000094'] },
  }),
  M({
    id: 'cis-aconitate', name: 'cis-Aconitate', short: 'acon_C', formula: 'C6H6O6',
    synonyms: ['cis-aconitate', 'cis-aconitic acid', 'aconitate'],
    xrefs: { 'kegg.compound': ['C00417'], chebi: ['16383', '32805'], 'bigg.metabolite': ['acon_C', 'acon__C'], 'seed.compound': ['cpd00331'], 'metacyc.compound': ['CIS-ACONITATE'], hmdb: ['HMDB0000072'] },
  }),
  M({
    id: 'isocitrate', name: 'Isocitrate', short: 'icit', formula: 'C6H8O7',
    synonyms: ['isocitrate', 'isocitric acid', 'D-threo-isocitrate', 'threo-Ds-isocitrate', '(2R,3S)-isocitrate', 'D-isocitrate'],
    xrefs: { 'kegg.compound': ['C00311'], chebi: ['16087', '30887'], 'bigg.metabolite': ['icit'], 'seed.compound': ['cpd00260'], 'metacyc.compound': ['THREO-DS-ISO-CITRATE'], hmdb: ['HMDB0000193'] },
  }),
  M({
    id: '2-oxoglutarate', name: '2-Oxoglutarate', short: 'akg', formula: 'C5H6O5',
    synonyms: ['2-oxoglutarate', 'alpha-ketoglutarate', '2-ketoglutarate', 'oxoglutarate', '2-oxoglutaric acid', 'alpha-ketoglutaric acid', 'AKG', '2-oxopentanedioate'],
    xrefs: { 'kegg.compound': ['C00026'], chebi: ['16810', '30915'], 'bigg.metabolite': ['akg'], 'seed.compound': ['cpd00024'], 'metacyc.compound': ['2-KETOGLUTARATE'], hmdb: ['HMDB0000208'] },
  }),
  M({
    id: 'succinyl-CoA', name: 'Succinyl-CoA', short: 'succoa', formula: 'C25H40N7O19P3S',
    synonyms: ['succinyl-CoA', 'succinyl coenzyme A', 'succinyl-coenzyme A', 'SucCoA'],
    xrefs: { 'kegg.compound': ['C00091'], chebi: ['15380', '57292'], 'bigg.metabolite': ['succoa'], 'seed.compound': ['cpd00078'], 'metacyc.compound': ['SUC-COA'], hmdb: ['HMDB0001022'] },
  }),
  M({
    id: 'succinate', name: 'Succinate', short: 'succ', formula: 'C4H6O4',
    synonyms: ['succinate', 'succinic acid', 'butanedioate', 'butanedioic acid', 'Succ'],
    xrefs: { 'kegg.compound': ['C00042'], chebi: ['26806', '30031', '15741'], 'bigg.metabolite': ['succ'], 'seed.compound': ['cpd00036'], 'metacyc.compound': ['SUC'], hmdb: ['HMDB0000254'] },
  }),
  M({
    id: 'fumarate', name: 'Fumarate', short: 'fum', formula: 'C4H4O4',
    synonyms: ['fumarate', 'fumaric acid', 'trans-butenedioate', '(E)-butenedioate', 'Fum'],
    xrefs: { 'kegg.compound': ['C00122'], chebi: ['29806', '18012'], 'bigg.metabolite': ['fum'], 'seed.compound': ['cpd00106'], 'metacyc.compound': ['FUM'], hmdb: ['HMDB0000134'] },
  }),
  M({
    id: 'L-malate', name: 'L-Malate', short: 'mal_L', formula: 'C4H6O5',
    synonyms: ['L-malate', '(S)-malate', 'L-malic acid', '(S)-malic acid', 'Mal'],
    xrefs: { 'kegg.compound': ['C00149'], chebi: ['15589', '30797'], 'bigg.metabolite': ['mal__L', 'mal_L'], 'seed.compound': ['cpd00130'], 'metacyc.compound': ['MAL'], hmdb: ['HMDB0000156'] },
    related: [{ note: 'stereo-unspecified malate', names: ['malate', 'malic acid'], xrefs: { 'kegg.compound': ['C00711'] } }],
  }),
  M({
    id: 'oxaloacetate', name: 'Oxaloacetate', short: 'oaa', formula: 'C4H4O5',
    synonyms: ['oxaloacetate', 'oxaloacetic acid', 'oxalacetate', '2-oxosuccinate', 'OAA'],
    xrefs: { 'kegg.compound': ['C00036'], chebi: ['16452', '30744'], 'bigg.metabolite': ['oaa'], 'seed.compound': ['cpd00032'], 'metacyc.compound': ['OXALACETIC_ACID'], hmdb: ['HMDB0000223'] },
  }),
  // ---------------------------------------------------------------- pentose phosphate pathway
  M({
    id: '6-phosphogluconolactone', name: '6-Phospho-D-glucono-1,5-lactone', short: '6pgl', formula: 'C6H11O9P',
    synonyms: ['6-phospho-D-glucono-1,5-lactone', '6-phosphogluconolactone', '6-O-phosphono-D-glucono-1,5-lactone', 'D-glucono-1,5-lactone 6-phosphate', '6-phosphoglucono-delta-lactone', '6PGL'],
    xrefs: { 'kegg.compound': ['C01236'], chebi: ['16938', '57955'], 'bigg.metabolite': ['6pgl'], 'seed.compound': ['cpd00911'], 'metacyc.compound': ['D-6-P-GLUCONO-DELTA-LACTONE'], hmdb: ['HMDB0001127'] },
  }),
  M({
    id: '6-phospho-D-gluconate', name: '6-Phospho-D-gluconate', short: '6pgc', formula: 'C6H13O10P',
    synonyms: ['6-phospho-D-gluconate', '6-phosphogluconate', '6-phosphogluconic acid', 'D-gluconate 6-phosphate', '6PG'],
    xrefs: { 'kegg.compound': ['C00345'], chebi: ['48928', '58759'], 'bigg.metabolite': ['6pgc'], 'seed.compound': ['cpd00284'], 'metacyc.compound': ['CPD-2961'], hmdb: ['HMDB0001316'] },
  }),
  M({
    id: 'D-ribulose-5-phosphate', name: 'D-Ribulose 5-phosphate', short: 'ru5p_D', formula: 'C5H11O8P',
    synonyms: ['D-ribulose 5-phosphate', 'ribulose 5-phosphate', 'ribulose-5-phosphate', 'Ru5P'],
    xrefs: { 'kegg.compound': ['C00199'], chebi: ['17363', '58121'], 'bigg.metabolite': ['ru5p__D', 'ru5p_D'], 'seed.compound': ['cpd00171'], 'metacyc.compound': ['RIBULOSE-5P'], hmdb: ['HMDB0000618'] },
  }),
  M({
    id: 'D-ribose-5-phosphate', name: 'D-Ribose 5-phosphate', short: 'r5p', formula: 'C5H11O8P',
    synonyms: ['D-ribose 5-phosphate', 'ribose 5-phosphate', 'ribose-5-phosphate', 'R5P', 'alpha-D-ribose 5-phosphate'],
    xrefs: { 'kegg.compound': ['C00117'], chebi: ['17797', '78346'], 'bigg.metabolite': ['r5p'], 'seed.compound': ['cpd00101'], 'metacyc.compound': ['RIBOSE-5P'], hmdb: ['HMDB0001548'] },
  }),
  M({
    id: 'D-xylulose-5-phosphate', name: 'D-Xylulose 5-phosphate', short: 'xu5p_D', formula: 'C5H11O8P',
    synonyms: ['D-xylulose 5-phosphate', 'xylulose 5-phosphate', 'xylulose-5-phosphate', 'Xu5P'],
    xrefs: { 'kegg.compound': ['C00231'], chebi: ['16332', '57737'], 'bigg.metabolite': ['xu5p__D', 'xu5p_D'], 'seed.compound': ['cpd00198'], 'metacyc.compound': ['XYLULOSE-5-PHOSPHATE'], hmdb: ['HMDB0000868'] },
  }),
  // ---------------------------------------------------------------- cofactors (side compounds of template equations)
  M({
    id: 'ATP', name: 'ATP', short: 'atp', formula: 'C10H16N5O13P3',
    synonyms: ['ATP', 'adenosine 5\'-triphosphate', 'adenosine triphosphate'],
    xrefs: { 'kegg.compound': ['C00002'], chebi: ['15422', '30616'], 'bigg.metabolite': ['atp'], 'seed.compound': ['cpd00002'], 'metacyc.compound': ['ATP'], hmdb: ['HMDB0000538'] },
  }),
  M({
    id: 'ADP', name: 'ADP', short: 'adp', formula: 'C10H15N5O10P2',
    synonyms: ['ADP', 'adenosine 5\'-diphosphate', 'adenosine diphosphate'],
    xrefs: { 'kegg.compound': ['C00008'], chebi: ['16761', '456216'], 'bigg.metabolite': ['adp'], 'seed.compound': ['cpd00008'], 'metacyc.compound': ['ADP'], hmdb: ['HMDB0001341'] },
  }),
  M({
    id: 'NAD+', name: 'NAD+', short: 'nad', formula: 'C21H28N7O14P2',
    synonyms: ['NAD+', 'NAD', 'nicotinamide adenine dinucleotide', 'oxidized nicotinamide adenine dinucleotide'],
    xrefs: { 'kegg.compound': ['C00003'], chebi: ['15846', '57540'], 'bigg.metabolite': ['nad'], 'seed.compound': ['cpd00003'], 'metacyc.compound': ['NAD'], hmdb: ['HMDB0000902'] },
  }),
  M({
    id: 'NADH', name: 'NADH', short: 'nadh', formula: 'C21H29N7O14P2',
    synonyms: ['NADH', 'reduced nicotinamide adenine dinucleotide'],
    xrefs: { 'kegg.compound': ['C00004'], chebi: ['16908', '57945'], 'bigg.metabolite': ['nadh'], 'seed.compound': ['cpd00004'], 'metacyc.compound': ['NADH'], hmdb: ['HMDB0001487'] },
  }),
  M({
    id: 'NADP+', name: 'NADP+', short: 'nadp', formula: 'C21H29N7O17P3',
    synonyms: ['NADP+', 'NADP', 'nicotinamide adenine dinucleotide phosphate'],
    xrefs: { 'kegg.compound': ['C00006'], chebi: ['18009', '58349'], 'bigg.metabolite': ['nadp'], 'seed.compound': ['cpd00006'], 'metacyc.compound': ['NADP'], hmdb: ['HMDB0000217'] },
  }),
  M({
    id: 'NADPH', name: 'NADPH', short: 'nadph', formula: 'C21H30N7O17P3',
    synonyms: ['NADPH', 'reduced nicotinamide adenine dinucleotide phosphate'],
    xrefs: { 'kegg.compound': ['C00005'], chebi: ['16474', '57783'], 'bigg.metabolite': ['nadph'], 'seed.compound': ['cpd00005'], 'metacyc.compound': ['NADPH'], hmdb: ['HMDB0000221'] },
  }),
  M({
    id: 'CoA', name: 'Coenzyme A', short: 'coa', formula: 'C21H36N7O16P3S',
    synonyms: ['CoA', 'coenzyme A', 'CoA-SH'],
    xrefs: { 'kegg.compound': ['C00010'], chebi: ['15346', '57287'], 'bigg.metabolite': ['coa'], 'seed.compound': ['cpd00010'], 'metacyc.compound': ['CO-A'], hmdb: ['HMDB0001423'] },
  }),
  M({
    id: 'CO2', name: 'CO2', short: 'co2', formula: 'CO2',
    synonyms: ['CO2', 'carbon dioxide'],
    xrefs: { 'kegg.compound': ['C00011'], chebi: ['16526'], 'bigg.metabolite': ['co2'], 'seed.compound': ['cpd00011'], 'metacyc.compound': ['CARBON-DIOXIDE'], hmdb: ['HMDB0001967'] },
  }),
  M({
    id: 'H2O', name: 'H2O', short: 'h2o', formula: 'H2O',
    synonyms: ['H2O', 'water'],
    xrefs: { 'kegg.compound': ['C00001'], chebi: ['15377'], 'bigg.metabolite': ['h2o'], 'seed.compound': ['cpd00001'], 'metacyc.compound': ['WATER'], hmdb: ['HMDB0002111'] },
  }),
  M({
    id: 'phosphate', name: 'Orthophosphate', short: 'pi', formula: 'H3PO4',
    synonyms: ['phosphate', 'orthophosphate', 'Pi', 'inorganic phosphate'],
    xrefs: { 'kegg.compound': ['C00009'], chebi: ['18367', '26078'], 'bigg.metabolite': ['pi'], 'seed.compound': ['cpd00009'], 'metacyc.compound': ['Pi'], hmdb: ['HMDB0001429'] },
  }),
  M({
    id: 'ubiquinone', name: 'Ubiquinone', short: 'q', synonyms: ['ubiquinone', 'coenzyme Q', 'quinone'],
    xrefs: { 'kegg.compound': ['C00399'], chebi: ['16389'] },
  }),
  M({
    id: 'ubiquinol', name: 'Ubiquinol', short: 'qh2', synonyms: ['ubiquinol', 'reduced coenzyme Q'],
    xrefs: { 'kegg.compound': ['C00390'], chebi: ['17976'] },
  }),
];

const BY_ID = new Map(METABOLITES.map((m) => [m.id, m]));
export const getMetabolite = (id: string): CanonicalMetabolite | undefined => BY_ID.get(id);

/** Entity of a template slot: the template's own definition first, then this library. */
export const entityOf = (spec: { entities?: Record<string, CanonicalMetabolite> }, id: string): CanonicalMetabolite | undefined =>
  spec.entities?.[id] ?? BY_ID.get(id);
