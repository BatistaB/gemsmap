/**
 * Built-in pathway templates. They are ordinary template files
 * (templates/builtin/*.gemsmap-template.json, the same format users create, import
 * and export) compiled into the mapping engine's spec — no special cases.
 */
import aminoAcids from './builtin/amino-acid-biosynthesis.gemsmap-template.json';
import centralCarbon from './builtin/central-carbon.gemsmap-template.json';
import glycolysis from './builtin/glycolysis.gemsmap-template.json';
import keggMap00010 from './builtin/kegg-map00010.gemsmap-template.json';
import keggMap00020 from './builtin/kegg-map00020.gemsmap-template.json';
import keggMap00030 from './builtin/kegg-map00030.gemsmap-template.json';
import keggMap00250 from './builtin/kegg-map00250.gemsmap-template.json';
import ppp from './builtin/ppp.gemsmap-template.json';
import tca from './builtin/tca.gemsmap-template.json';
import { compileTemplate } from './format/compile';
import type { TemplateFile } from './format/schema';
import { entityOf } from './mapping/library';
import type { PathwayTemplateSpec } from './spec';

/** The bundled template files, in gallery order (the library groups them by metadata.section). */
export const BUILTIN_TEMPLATE_FILES: TemplateFile[] = [
  centralCarbon, glycolysis, tca, ppp, aminoAcids,
  keggMap00010, keggMap00020, keggMap00030, keggMap00250,
] as unknown as TemplateFile[];

const byId = (id: string) => compileTemplate(BUILTIN_TEMPLATE_FILES.find((f) => f.metadata.id === id)!);
export const CENTRAL_CARBON = byId('central-carbon');
export const GLYCOLYSIS = byId('glycolysis');
export const TCA = byId('tca');
export const PPP = byId('ppp');

export const PATHWAY_SPECS: PathwayTemplateSpec[] = [CENTRAL_CARBON, GLYCOLYSIS, TCA, PPP];

// ------------------------------------------------------------ validation

/** Structural checks of a compiled spec (the engine contract). Returns problems; [] = valid. */
export function validateTemplate(t: PathwayTemplateSpec): string[] {
  const errs: string[] = [];
  if (!t.id || !t.name || !t.version) errs.push('id, name and version are required');
  if (!t.compartmentRules.default) errs.push('a "default" compartment rule is required');
  const slots = new Set<string>();
  for (const s of t.biology.slots) {
    if (slots.has(s.slot)) errs.push(`duplicate slot ${s.slot}`);
    slots.add(s.slot);
    const e = entityOf(t, s.entity);
    if (!e) errs.push(`slot ${s.slot}: unknown entity ${s.entity}`);
    for (const a of s.alternatives ?? []) if (!entityOf(t, a)) errs.push(`slot ${s.slot}: unknown alternative ${a}`);
    if (s.rule && !t.compartmentRules[s.rule]) errs.push(`slot ${s.slot}: unknown compartment rule ${s.rule}`);
    if (!t.layout.nodes[s.slot]) errs.push(`slot ${s.slot}: no layout position`);
    if (e && !Object.keys(e.xrefs).length) errs.push(`entity ${e.id}: no database identifiers`);
  }
  for (const k of Object.keys(t.layout.nodes)) if (!slots.has(k)) errs.push(`layout position for unknown slot ${k}`);
  const rids = new Set<string>();
  const touched = new Set<string>();
  for (const r of t.biology.reactions) {
    if (rids.has(r.id)) errs.push(`duplicate reaction ${r.id}`);
    rids.add(r.id);
    if (!r.sources.length || !r.targets.length) errs.push(`reaction ${r.id}: needs sources and targets`);
    for (const x of [...r.sources, ...r.targets]) { if (!slots.has(x)) errs.push(`reaction ${r.id}: unknown slot ${x}`); touched.add(x); }
    for (const ec of r.ec ?? []) if (!/^\d+\.\d+\.\d+\.\d+$/.test(ec)) errs.push(`reaction ${r.id}: malformed EC ${ec}`);
  }
  for (const s of slots) if (!touched.has(s) && t.biology.slots.length > 1) errs.push(`slot ${s} is not connected to any reaction`);
  for (const c of t.biology.connectors ?? []) if (!slots.has(c.slot)) errs.push(`connector on unknown slot ${c.slot}`);
  for (const g of t.layout.groups ?? []) for (const s of g.slots) if (!slots.has(s)) errs.push(`group ${g.title}: unknown slot ${s}`);
  return errs;
}

/** Slot of a compiled spec by id or former id (aliases keep maps drawn with older template versions working). */
export const findSlot = (t: PathwayTemplateSpec, id: string) => t.biology.slots.find((s) => s.slot === id) ?? t.biology.slots.find((s) => s.aliases?.includes(id));
