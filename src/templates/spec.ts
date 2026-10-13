/**
 * Pathway template specification (JSON-serialisable). Three separate layers:
 *
 *  - biology: slots that reference canonical entities (never model IDs) and the
 *    template reactions between them;
 *  - mapping: compartment rules (a preference with fallbacks, per template and
 *    optionally per slot / reaction) and requirement levels;
 *  - layout: relative coordinates, label positions, edge routing, groups.
 *
 * A spec instantiates itself in any GEM through the mapping engine
 * (templates/mapping/engine.ts) and is drawn with its own layout, so the
 * figure keeps its shape whatever the model namespace.
 */
import type { CompartmentRule } from './mapping/compartments';
import type { CanonicalMetabolite } from './mapping/library';
import type { TemplateFile } from './format/schema';
import type { LabelPos, Routing } from '../viz/types';

export type Requirement = 'required' | 'recommended' | 'optional';

export interface SlotSpec {
  /** Unique within the template. */
  slot: string;
  /** Canonical metabolite id (templates/mapping/library.ts). */
  entity: string;
  /** Other acceptable entities for this slot (e.g. D-lactate for an L-lactate slot), scored slightly lower. */
  alternatives?: string[];
  level: Requirement;
  /** Key in `compartmentRules`; default 'default'. */
  rule?: string;
  /** Override of the map label (default: the entity's short label). */
  label?: string;
  role?: 'normal' | 'exchange';
  /** Leave out of the pathway's group box (connector metabolites). */
  ungrouped?: boolean;
  /** Former slot ids (maps drawn with an older template version). */
  aliases?: string[];
}

export interface ReactionSpec {
  id: string;
  sources: string[];
  targets: string[];
  /** Canonical enzyme / step name, used as the arrow label. */
  name: string;
  ec?: string[];
  /** Reaction IDs that commonly encode this step (weak preference when several model reactions fit). */
  hints?: string[];
  level: Requirement;
  aliases?: string[];
}

export interface ConnectorSpec {
  slot: string;
  direction: 'in' | 'out';
  /** Template id this connector usually links to. */
  to?: string;
}

export interface PathwayTemplateSpec {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  /** Gallery section, e.g. "Central carbon". */
  section: string;
  /** Short human summary of the compartment expectation, for the gallery card. */
  compartmentSummary: string;
  compartmentRules: Record<string, CompartmentRule>;
  biology: {
    slots: SlotSpec[];
    reactions: ReactionSpec[];
    connectors?: ConnectorSpec[];
  };
  layout: {
    kind: 'vertical' | 'circular' | 'branched' | 'composite';
    nodes: Record<string, { x: number; y: number; labelPos?: LabelPos }>;
    reactions?: Record<string, { routing?: Routing; bend?: number }>;
    groups?: { title: string; slots: string[] }[];
  };
  /**
   * Entities defined by the template itself (key = slot `entity`). Looked up before the
   * built-in canonical library, so a user template can describe compounds the library lacks.
   */
  entities?: Record<string, CanonicalMetabolite>;
  /** The template file this spec was compiled from (full layout: instances, ports, labels). */
  source?: TemplateFile;
}
