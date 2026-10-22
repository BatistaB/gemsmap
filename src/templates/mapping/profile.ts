/**
 * Model mapping profile: the user's confirmed template mappings for ONE model
 * (identified by its structural fingerprint). Keyed by canonical entity +
 * expected compartment, so a choice made in Glycolysis (pyruvate @ cytosol) is
 * reused by every other template — but never applied to an unrelated model.
 *
 * Kept in browser storage, plus embedded in saved .gemsmap projects so the
 * mapping travels with the figure.
 */
import type { ID } from '../../model/types';
import type { CanonicalCompartment } from './compartments';

export interface ProfileEntry {
  entity: string;
  compartment: CanonicalCompartment | null;
  /** null = the user stated this entity is absent from the model. */
  metaboliteId: ID | null;
  templateId: string;
  templateVersion: string;
  confirmedAt: string;
  /** Set when the entry was derived from the same compound chosen in another compartment (that metabolite's id). */
  via?: ID;
}

export interface ModelMappingProfile {
  fingerprint: string;
  modelId: string;
  modelName: string;
  updated: string;
  entries: Record<string, ProfileEntry>;
}

export const profileKey = (entity: string, compartment: CanonicalCompartment | null) => `${entity}@${compartment ?? 'any'}`;

const KEY = 'gemsmap.mappingProfiles';
const MAX_PROFILES = 30;

function readAll(): Record<string, ModelMappingProfile> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function loadProfile(fingerprint: string): ModelMappingProfile | null {
  return readAll()[fingerprint] ?? null;
}

export function saveProfile(p: ModelMappingProfile) {
  try {
    const all = readAll();
    all[p.fingerprint] = p;
    const keep = Object.values(all).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, MAX_PROFILES);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep.map((x) => [x.fingerprint, x]))));
  } catch { /* storage unavailable: the profile still lives in the project file */ }
}

/** Return a copy of `p` (or a new profile) with one entry set. */
export function withEntry(
  p: ModelMappingProfile | null,
  model: { fingerprint: string; id: string; name: string },
  e: Omit<ProfileEntry, 'confirmedAt'>,
): ModelMappingProfile {
  const now = new Date().toISOString();
  const base: ModelMappingProfile = p && p.fingerprint === model.fingerprint ? p : { fingerprint: model.fingerprint, modelId: model.id, modelName: model.name, updated: now, entries: {} };
  return { ...base, updated: now, entries: { ...base.entries, [profileKey(e.entity, e.compartment)]: { ...e, confirmedAt: now } } };
}

/** Remove an entry (back to automatic mapping). */
export function withoutEntry(p: ModelMappingProfile, entity: string, compartment: CanonicalCompartment | null): ModelMappingProfile {
  const entries = { ...p.entries };
  delete entries[profileKey(entity, compartment)];
  return { ...p, updated: new Date().toISOString(), entries };
}

/** Bring a profile embedded in a project file into browser storage (entries already stored locally win). */
export function mergeProfileIntoStorage(p: ModelMappingProfile) {
  const local = loadProfile(p.fingerprint);
  saveProfile(local ? { ...local, entries: { ...p.entries, ...local.entries } } : p);
}
