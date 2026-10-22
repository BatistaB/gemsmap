/**
 * Template mapping across compartments: a model metabolite chosen for an entity in one compartment
 * (pyruvate → pyr_c) tells which metabolites are that entity in the other compartments (pyr_m, pyr_e).
 * Used to fill the other slots of the same entity and to save them in the model's mapping profile,
 * never to overwrite a choice the user made or a mapping already decided otherwise.
 */
import type { ID, MetabolicModel } from '../../model/types';
import { compartmentSiblings } from '../../model/siblings';
import { buildCompartmentRegistry, type CanonicalCompartment } from './compartments';
import { profileKey, type ModelMappingProfile, type ProfileEntry } from './profile';

const cache = new WeakMap<MetabolicModel, Map<ID, ID[]>>();
const regCache = new WeakMap<MetabolicModel, ReturnType<typeof buildCompartmentRegistry>>();

/** The same compound as `id` in the model's other compartments (ids). */
export function metSiblings(model: MetabolicModel, id: ID): ID[] {
  let m = cache.get(model);
  if (!m) { m = compartmentSiblings(Object.values(model.metabolites)); cache.set(model, m); }
  return m.get(id) ?? [];
}

/** Canonical compartment → the sibling of `id` there (UNKNOWN and ambiguous compartments left out). */
export function siblingsByCompartment(model: MetabolicModel, id: ID): Map<CanonicalCompartment, ID> {
  let reg = regCache.get(model);
  if (!reg) { reg = buildCompartmentRegistry(model); regCache.set(model, reg); }
  const out = new Map<CanonicalCompartment, ID>();
  const dup = new Set<CanonicalCompartment>();
  for (const s of metSiblings(model, id)) {
    const c = reg.get(model.metabolites[s]?.compartment ?? '')?.canonical;
    if (!c || c === 'UNKNOWN') continue;
    if (out.has(c)) dup.add(c); else out.set(c, s);
  }
  for (const c of dup) out.delete(c);
  return out;
}

/**
 * Add profile entries for the siblings of a chosen metabolite (same entity, other compartments).
 * Existing entries win: a choice made explicitly for that compartment is never replaced.
 */
export function withSiblingEntries(p: ModelMappingProfile, model: MetabolicModel, e: Omit<ProfileEntry, 'confirmedAt' | 'via'> & { metaboliteId: ID }): { profile: ModelMappingProfile; added: { compartment: CanonicalCompartment; metaboliteId: ID }[] } {
  const entries = { ...p.entries };
  const added: { compartment: CanonicalCompartment; metaboliteId: ID }[] = [];
  const now = new Date().toISOString();
  for (const [c, sib] of siblingsByCompartment(model, e.metaboliteId)) {
    if (c === e.compartment) continue;
    const k = profileKey(e.entity, c);
    if (entries[k]) continue;
    entries[k] = { entity: e.entity, compartment: c, metaboliteId: sib, templateId: e.templateId, templateVersion: e.templateVersion, confirmedAt: now, via: e.metaboliteId };
    added.push({ compartment: c, metaboliteId: sib });
  }
  return { profile: added.length ? { ...p, updated: now, entries } : p, added };
}
