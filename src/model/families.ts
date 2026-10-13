import { splitParent, type FamilyMember } from '../data/families';
import type { MetabolicModel, Reaction } from './types';

/** Enzyme pseudo-metabolites of ecModels (prot_Q2U287, prot_pool, pmet_r101…): never drawn. */
export const isEnzymeMetabolite = (id: string) => /^(prot_|pmet_)/.test(id);

/**
 * Give an ecModel back the parent reactions its maps are drawn on.
 * For every split family (r101_EXP_1, r101_REV_EXP_1…) whose parent id is not in the model, a virtual
 * reaction `r101` is added: metabolic stoichiometry of the forward copy (enzyme usage removed),
 * reversible when both directions exist, genes/EC merged. Data are still read from the copies
 * (see data/families.ts), so the arrow shows the family's net flux. Virtual reactions are marked
 * `meta.virtual` and never exported.
 */
export function withFamilyParents(model: MetabolicModel): MetabolicModel {
  const groups = new Map<string, FamilyMember[]>();
  for (const id of Object.keys(model.reactions)) {
    const p = splitParent(id);
    if (!p || model.reactions[p.id]) continue;
    const g = groups.get(p.id) ?? [];
    g.push({ id, sign: p.sign });
    groups.set(p.id, g);
  }
  if (!groups.size) return model;
  const reactions: Record<string, Reaction> = { ...model.reactions };
  for (const [pid, members] of groups) {
    const fwd = members.filter((m) => m.sign > 0).map((m) => model.reactions[m.id]);
    const rev = members.filter((m) => m.sign < 0).map((m) => model.reactions[m.id]);
    const ref = fwd[0] ?? rev[0];
    const k = fwd[0] ? 1 : -1;
    const stoichiometry: Record<string, number> = {};
    for (const [mid, c] of Object.entries(ref.stoichiometry)) if (!isEnzymeMetabolite(mid)) stoichiometry[mid] = k * c;
    const all = [...fwd, ...rev];
    const gprs = Array.from(new Set(all.map((r) => r.gpr).filter(Boolean))) as string[];
    const ec = Array.from(new Set(all.flatMap((r) => r.ec ?? [])));
    reactions[pid] = {
      id: pid,
      name: ref.name.replace(/\s*\((?:reversible|reverse|isozyme)[^)]*\)\s*$/i, '') || pid,
      stoichiometry,
      reversible: fwd.length > 0 && rev.length > 0,
      lowerBound: fwd.length ? -rev.reduce((t, r) => t + Math.max(0, r.upperBound), 0) : -ref.upperBound,
      upperBound: fwd.reduce((t, r) => t + Math.max(0, r.upperBound), 0),
      subsystem: ref.subsystem,
      gpr: gprs.length > 1 ? gprs.map((g) => (/\s(and|or)\s/.test(g) ? `(${g})` : g)).join(' or ') : gprs[0],
      genes: Array.from(new Set(all.flatMap((r) => r.genes))),
      ec: ec.length ? ec : undefined,
      meta: { ...ref.meta, virtual: true, members },
    };
  }
  return { ...model, reactions };
}

export const isVirtual = (r: Reaction | undefined) => !!r?.meta?.virtual;

/** The model as it was imported (virtual parents removed), for saving. */
export function withoutVirtual(model: MetabolicModel): MetabolicModel {
  if (!Object.values(model.reactions).some(isVirtual)) return model;
  return { ...model, reactions: Object.fromEntries(Object.entries(model.reactions).filter(([, r]) => !isVirtual(r))) };
}
