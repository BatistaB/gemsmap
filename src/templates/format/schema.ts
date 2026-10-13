/**
 * The GEMs MAP template file format (`*.gemsmap-template.json`), schema 1.0.0.
 *
 * A template describes biological identity and pathway topology; a GEM provides
 * model-specific identifiers. Nothing in this file is a model ID: entities carry
 * database identifiers, metabolites carry conceptual compartments ("cytosol",
 * not "c"), and a mapping to a model belongs to the application of the template,
 * never to the template (see templates/mapping/profile.ts).
 *
 * Layers:
 *   metadata  — what the template is (name, versions, scope, authors, license …)
 *   biology   — chemistry only: compartments, entities, metabolites, reactions, connectors
 *   layout    — drawing only: visual node instances, ports, glyph geometry, groups, labels
 *   validation — snapshot written on export (informative; recomputed on import)
 *
 * Three levels keep identity apart: entity (what the molecule is) → template
 * metabolite (that molecule in a compartment) → visual instance (where it is drawn).
 */
import type { CanonicalCompartment, CompartmentTarget } from '../mapping/compartments';
import type { Namespace } from '../mapping/identifiers';
import type { LabelPos, Routing } from '../../viz/types';

export const TEMPLATE_FORMAT = 'gemsmap-template';
/** Format tag of templates written as MetMap (≤ 0.2): read as they are, written with the current tag. */
export const LEGACY_TEMPLATE_FORMAT = 'metmap-template';
export const isTemplateFormat = (format: unknown) => format === TEMPLATE_FORMAT || format === LEGACY_TEMPLATE_FORMAT;
/**
 * Version of the file structure (not of a pathway). Bump the minor for additive changes.
 * 1.1.0: provenance and review status, generic entities, machine confidence, reaction variants, attached cofactor nodes.
 */
export const TEMPLATE_SCHEMA_VERSION = '1.1.0';
export const TEMPLATE_EXTENSION = '.gemsmap-template.json';

// ------------------------------------------------------------ compartments

/** Conceptual compartment names used by templates (never model IDs such as c, m, e). */
export type ConceptualCompartment =
  | 'cytosol' | 'mitochondria' | 'mitochondrial_intermembrane' | 'extracellular' | 'periplasm' | 'peroxisome'
  | 'nucleus' | 'endoplasmic_reticulum' | 'golgi' | 'vacuole' | 'lysosome' | 'chloroplast' | 'thylakoid' | 'membrane';

/** Fallback targets: a conceptual compartment, or any intracellular compartment of the model. */
export type CompartmentFallback = ConceptualCompartment | 'intracellular';

export const COMPARTMENTS: { id: ConceptualCompartment; label: string; canonical: CanonicalCompartment }[] = [
  { id: 'cytosol', label: 'Cytosol', canonical: 'CYTOSOL' },
  { id: 'mitochondria', label: 'Mitochondria', canonical: 'MITOCHONDRION' },
  { id: 'mitochondrial_intermembrane', label: 'Mitochondrial intermembrane space', canonical: 'MITO_IMS' },
  { id: 'extracellular', label: 'Extracellular', canonical: 'EXTRACELLULAR' },
  { id: 'periplasm', label: 'Periplasm', canonical: 'PERIPLASM' },
  { id: 'peroxisome', label: 'Peroxisome', canonical: 'PEROXISOME' },
  { id: 'nucleus', label: 'Nucleus', canonical: 'NUCLEUS' },
  { id: 'endoplasmic_reticulum', label: 'Endoplasmic reticulum', canonical: 'ER' },
  { id: 'golgi', label: 'Golgi', canonical: 'GOLGI' },
  { id: 'vacuole', label: 'Vacuole', canonical: 'VACUOLE' },
  { id: 'lysosome', label: 'Lysosome', canonical: 'LYSOSOME' },
  { id: 'chloroplast', label: 'Chloroplast / plastid', canonical: 'CHLOROPLAST' },
  { id: 'thylakoid', label: 'Thylakoid', canonical: 'THYLAKOID' },
  { id: 'membrane', label: 'Membrane / cell envelope', canonical: 'CELL_ENVELOPE' },
];
const BY_COMP = new Map(COMPARTMENTS.map((c) => [c.id, c]));
export const isConceptualCompartment = (x: unknown): x is ConceptualCompartment => typeof x === 'string' && BY_COMP.has(x as ConceptualCompartment);
export const compartmentLabel = (c: ConceptualCompartment | null | undefined) => (c ? BY_COMP.get(c)?.label ?? c : 'no compartment');
export const toCanonical = (c: CompartmentFallback): CompartmentTarget => (c === 'intracellular' ? 'INTRACELLULAR' : BY_COMP.get(c)!.canonical);
export const fromCanonical = (c: CompartmentTarget): CompartmentFallback | null =>
  c === 'INTRACELLULAR' ? 'intracellular' : COMPARTMENTS.find((x) => x.canonical === c)?.id ?? null;

/** Which compartments the template uses, and where to look in a model that lacks one (prokaryotes: no mitochondria). */
export interface TemplateCompartment {
  id: ConceptualCompartment;
  /** Tried in order when the model has no such compartment. */
  fallback: CompartmentFallback[];
  /** Shown when the fallback is used, e.g. "The TCA cycle is mitochondrial in eukaryotes …". */
  note?: string;
}

// ------------------------------------------------------------ identity

/**
 * confirmed  — chosen or reviewed by a person
 * suggested  — proposed by a database search, Auto Identify or AI; not reviewed yet
 * ambiguous  — several plausible candidates; a person must choose
 * unresolved — identity not defined yet
 */
export type IdentityStatus = 'confirmed' | 'suggested' | 'ambiguous' | 'unresolved';
/** Who produced the current identity. */
export type IdentitySource = 'user' | 'builtin' | 'database' | 'auto' | 'ai' | 'imported';

export interface IdentityState {
  status: IdentityStatus;
  source?: IdentitySource;
  /** Free-text provenance, e.g. "KEGG C00031 via MetaNetX MNXM1364061". */
  note?: string;
  /** ISO time of the last human review. */
  reviewed?: string;
  /** A later suggestion that disagrees with a confirmed identity (never applied automatically). */
  conflict?: { name: string; identifiers: IdentifierTable; source: IdentitySource; note?: string };
  /** Machine confidence of a suggestion (prompt wording: high_confidence / probable). Never set by a person. */
  confidence?: 'high' | 'probable';
  /** For ambiguous identities: the competing candidates (names + identifiers), so the choice can be made later. */
  candidates?: { name: string; identifiers: IdentifierTable; formula?: string; note?: string }[];
}

export type MetaboliteNamespace = Extract<Namespace,
  'metanetx.chemical' | 'kegg.compound' | 'chebi' | 'bigg.metabolite' | 'seed.compound' | 'metacyc.compound' | 'hmdb' | 'inchikey' | 'lipidmaps' | 'pubchem.compound' | 'vmh' | 'reactome'>;
export type ReactionNamespace = Extract<Namespace, 'metanetx.reaction' | 'kegg.reaction' | 'bigg.reaction' | 'seed.reaction' | 'metacyc.reaction' | 'rhea'>;
export type IdentifierTable = Partial<Record<Namespace, string[]>>;

/** Order and labels of the identifier fields in the editor. */
export const METABOLITE_NAMESPACES: MetaboliteNamespace[] = ['metanetx.chemical', 'kegg.compound', 'chebi', 'bigg.metabolite', 'seed.compound', 'metacyc.compound', 'hmdb', 'inchikey'];
export const REACTION_NAMESPACES: ReactionNamespace[] = ['metanetx.reaction', 'kegg.reaction', 'rhea', 'bigg.reaction', 'seed.reaction', 'metacyc.reaction'];

/** A related form a GEM may use for the same pool (anomer, ring form, stereo-unspecified). Scored lower than the exact identity. */
export interface RelatedFormSpec { note: string; names: string[]; identifiers: IdentifierTable }

/** Chemical identity, compartment-free. */
export interface TemplateEntity {
  id: string;
  /** Canonical biological name, e.g. "D-Glucose". */
  name: string;
  /** Short map label (abbreviation), e.g. "glc_D". */
  short?: string;
  /** Neutral formula; only heavy atoms are compared when matching. */
  formula?: string;
  charge?: number;
  synonyms: string[];
  identifiers: IdentifierTable;
  related?: RelatedFormSpec[];
  identity: IdentityState;
  /** Id in the GEMs MAP canonical library when the identity came from it (also the cross-template key of mapping profiles). */
  library?: string;
  /**
   * A class of compounds rather than one molecule (an alcohol, a fatty acid, reduced ferredoxin, a nucleoside
   * triphosphate). Kept generic on purpose: never narrowed to a specific molecule automatically.
   */
  generic?: boolean;
  /** Where the entity comes from, e.g. { source: 'KEGG', id: 'C00022' }. */
  provenance?: Provenance;
}

export interface Provenance { source: string; id: string; url?: string }

export type Requirement = 'required' | 'recommended' | 'optional';

/** A biological node: one entity in one compartment. */
export interface TemplateMetabolite {
  id: string;
  entity: string;
  compartment: ConceptualCompartment | null;
  /** Map label override (default: the entity's short label). */
  label?: string;
  level: Requirement;
  /** Other acceptable entities (e.g. D-lactate for an L-lactate node), scored slightly lower. */
  alternatives?: string[];
  role?: 'normal' | 'exchange';
  /** Left out of the pathway's group box (connector metabolites). */
  ungrouped?: boolean;
  /** Former ids of this node (maps drawn with an older template version still find it). */
  aliases?: string[];
}

export interface Participant {
  metabolite: string;
  /** Stoichiometric coefficient: < 0 consumed, > 0 produced, in the written direction. */
  coefficient: number;
  /** Drawn on the map (main) or only part of the equation (cofactor / side compound). */
  main: boolean;
}

export interface TemplateReaction {
  id: string;
  /** Map label (step abbreviation), e.g. "HEX". */
  name: string;
  /** Canonical enzyme / reaction name, e.g. "hexokinase". */
  canonicalName?: string;
  participants: Participant[];
  /** true ⇌, false → (in the written direction), null not stated. */
  reversible: boolean | null;
  /** Explicit compartment; derived from the participants when absent. */
  compartment?: ConceptualCompartment | null;
  ec: string[];
  identifiers: IdentifierTable;
  level: Requirement;
  identity: IdentityState;
  /**
   * Reaction abbreviations common in GEMs (BiGG-style). They only break ties between model reactions
   * that connect the same metabolites equally well — never an identity claim.
   */
  hints?: string[];
  aliases?: string[];
  /**
   * Other enzymes for the same step that differ only in a cofactor or donor (GTP- vs ATP-PEPCK, NADP- vs
   * NAD-GAPDH). Not drawn; their EC numbers help the matcher choose the model reaction.
   */
  variants?: ReactionVariant[];
  /** Source reactions this step represents (several for a lumped multi-step complex), e.g. KEGG R00014 + R03270 … */
  provenance?: Provenance[];
  /**
   * A whole pathway drawn as one arrow on an overview map (e.g. 3-phosphoglycerate → serine, KEGG module M00020).
   * Its identity is the pathway (provenance), not one enzyme: it is not atom-balanced, and a GEM links it only when
   * the model makes the conversion in one or two reactions.
   */
  summary?: boolean;
}

export interface ReactionVariant { name: string; ec: string[]; identifiers: IdentifierTable; equation?: string; note?: string }

/** A link to another pathway (port / placeholder). Not a biological reaction. */
export interface TemplateConnector {
  id: string;
  metabolite: string;
  direction: 'in' | 'out';
  /** Target pathway: a template id when known, and a human name. */
  target: { template?: string; pathway: string };
}

// ------------------------------------------------------------ metadata

export type ScopeLevel = 'universal' | 'prokaryotic' | 'eukaryotic' | 'fungal' | 'yeast' | 'mammalian' | 'plant' | 'species-specific' | 'other';
export const SCOPE_LABEL: Record<ScopeLevel, string> = {
  universal: 'Universal / conserved', prokaryotic: 'Prokaryotic', eukaryotic: 'Eukaryotic', fungal: 'Fungal', yeast: 'Yeast',
  mammalian: 'Mammalian', plant: 'Plant', 'species-specific': 'Species-specific', other: 'Other taxonomic group',
};

export interface TemplateMetadata {
  /** Stable template id (also the key of mapping provenance on maps). */
  id: string;
  name: string;
  description: string;
  /** Pathway name, e.g. "Glycolysis (Embden–Meyerhof–Parnas)". */
  pathway: string;
  /** Gallery section, e.g. "Central carbon". */
  section?: string;
  /** Version of this pathway template (semver), independent of schema_version. */
  template_version: string;
  scope: { level: ScopeLevel; taxa: string[]; note?: string };
  authors: string[];
  created: string;
  modified: string;
  license: string;
  tags: string[];
  citations: { text: string; doi?: string; url?: string }[];
  /** The template this one was duplicated from. */
  derived_from?: { id: string; name: string; template_version: string };
  /** Drawing style family (informative). */
  layout_kind?: 'vertical' | 'circular' | 'branched' | 'composite' | 'free';
  /** Who stands behind the content: generated by AI and not reviewed, checked by the validator, or reviewed by a person. */
  review_status?: 'ai-generated' | 'ai-validated' | 'human-reviewed';
  last_review?: string;
  /** Reference the biology was taken from. The drawing is GEMs MAP's own, never a copy of the source's map. */
  source?: {
    reference: string; pathway_id?: string; pathway_name?: string; url?: string;
    generation_method?: string; generated_by?: string; retrieved?: string;
  };
}

// ------------------------------------------------------------ layout

export interface LayoutNode {
  id: string;
  metabolite: string;
  x: number;
  y: number;
  label_pos?: LabelPos;
  shape?: 'circle' | 'label';
  r?: number;
  /** Fill colour of the node (appearance only), e.g. "#2e7d32". */
  fill?: string;
  /**
   * A cofactor drawn beside one reaction (ATP → ADP next to hexokinase): a visual instance of a side participant,
   * repeated as often as needed, never a matched node. `side`: consumed (in) or produced (out).
   */
  attach?: { reaction: string; side: 'in' | 'out' };
}

export interface LayoutPort {
  id: string;
  connector: string;
  x: number;
  y: number;
  /** Visual instance of the connector's metabolite the port line starts from. */
  from: string;
}

export interface LayoutReaction {
  reaction: string;
  /** Visual instances at the arrow ends (main participants only). */
  sources: string[];
  targets: string[];
  routing: Routing;
  bend?: number;
  label_offset?: { x: number; y: number };
  label_angle?: number;
  label_flip?: boolean;
}

export interface LayoutGroup {
  id: string;
  kind: 'pathway' | 'compartment';
  title: string;
  subtitle?: string;
  nodes: string[];
  padding?: number;
  fill?: string;
  stroke?: string;
  dashed?: boolean;
}

export interface LayoutLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
  weight: 400 | 500 | 600 | 700;
  italic?: boolean;
  color?: string;
  kind: 'text' | 'panel' | 'title';
  rotate?: number;
}

export interface TemplateLayout {
  nodes: LayoutNode[];
  ports: LayoutPort[];
  reactions: LayoutReaction[];
  groups: LayoutGroup[];
  labels: LayoutLabel[];
}

// ------------------------------------------------------------ file

export interface Completeness {
  metabolitesIdentified: number;
  metabolites: number;
  reactionsIdentified: number;
  reactions: number;
  /** Metabolites with a preferred compartment — optional, not part of the overall score (the person picks the compartment when mapping onto a GEM). */
  compartmentsDefined: number;
  /** Mean of the identity fractions (metabolites, reactions), 0–1. */
  overall: number;
}

export interface ValidationSnapshot {
  checked: string;
  errors: number;
  warnings: number;
  completeness: Completeness;
}

export interface TemplateFile {
  format: typeof TEMPLATE_FORMAT;
  schema_version: string;
  metadata: TemplateMetadata;
  biology: {
    compartments: TemplateCompartment[];
    entities: TemplateEntity[];
    metabolites: TemplateMetabolite[];
    reactions: TemplateReaction[];
    connectors: TemplateConnector[];
  };
  layout: TemplateLayout;
  validation?: ValidationSnapshot;
}

// ------------------------------------------------------------ ids

/** Next free stable id with a prefix, e.g. nextId(['tpl_met_001'], 'tpl_met') → tpl_met_002. */
export function nextId(existing: Iterable<string>, prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  for (const id of existing) { const m = id.match(re); if (m) max = Math.max(max, +m[1]); }
  return `${prefix}_${String(max + 1).padStart(3, '0')}`;
}

export const ID_PREFIX = { entity: 'tpl_ent', metabolite: 'tpl_met', reaction: 'tpl_rxn', connector: 'tpl_port', node: 'tpl_node', group: 'tpl_grp', label: 'tpl_lbl' } as const;

export function emptyTemplate(name = 'New template', author = ''): TemplateFile {
  const now = new Date().toISOString();
  return {
    format: TEMPLATE_FORMAT, schema_version: TEMPLATE_SCHEMA_VERSION,
    metadata: {
      id: `tpl_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`, name, description: '', pathway: name, section: 'My templates',
      template_version: '0.1.0', scope: { level: 'universal', taxa: [] }, authors: author ? [author] : [], created: now, modified: now,
      license: 'CC-BY-4.0', tags: [], citations: [], layout_kind: 'free',
    },
    biology: { compartments: [{ id: 'cytosol', fallback: ['intracellular'] }], entities: [], metabolites: [], reactions: [], connectors: [] },
    layout: { nodes: [], ports: [], reactions: [], groups: [], labels: [] },
  };
}
