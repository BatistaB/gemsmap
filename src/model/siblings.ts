/**
 * Compartment siblings: the same compound in other compartments of a model (pyr_c, pyr_m, pyr_e).
 *
 * Most GEMs write one compound once per compartment and keep its id apart from a compartment affix:
 * BiGG `pyr_c` / `pyr_m`, SBML `M_pyr_c`, `pyr[c]`, ModelSEED `cpd00020_c0` / `cpd00020_e0`. Models
 * with numbered ids (yeast-GEM `s_1399`, `s_1401`) repeat the name instead ("pyruvate [cytoplasm]").
 *
 * A choice of identity made for one of them (a MetaNetX chemical, a template entity) is meant for all
 * of them. The grouping is deliberately conservative:
 * - same base id (affix removed using the metabolite's own compartment) AND a compatible name, or, for
 *   ids without any compartment affix, the same name without its compartment tag;
 * - every member in a different compartment (two metabolites with the same key in one compartment
 *   make the group ambiguous, so it is not formed).
 * The caller always shows the siblings before applying anything to them.
 */

export interface SiblingInput { id: string; name?: string | null; compartment: string }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compartment-free base of an id, or null when the id carries no recognisable compartment affix. */
export function compoundBase(id: string, compartment: string): string | null {
  if (!compartment) return null;
  const s = id.replace(/^M_/, '');
  const c = esc(compartment);
  const short = esc(compartment.replace(/^C_/i, ''));
  for (const re of [new RegExp(`^(.+?)_(?:${c}|${short})$`), new RegExp(`^(.+?)\\[(?:${c}|${short})\\]$`), new RegExp(`^(.+?)\\((?:${c}|${short})\\)$`)]) {
    const m = s.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/** Name without a trailing compartment tag ("pyruvate [cytoplasm]", "Pyruvate (mitochondrion)"), compacted. */
export function compoundName(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/\s*[[(][^\])]*[\])]\s*$/, '').replace(/[^a-z0-9]+/g, '');
}

const compatible = (a: string, b: string) => !a || !b || a === b;

/**
 * Group metabolites that are the same compound in different compartments. Returns id → the ids of its
 * siblings (itself excluded); metabolites without siblings are absent from the map.
 */
export function compartmentSiblings(mets: Iterable<SiblingInput>): Map<string, string[]> {
  const groups = new Map<string, SiblingInput[]>();
  for (const m of mets) {
    const base = compoundBase(m.id, m.compartment);
    const nm = compoundName(m.name);
    const key = base != null ? `id:${base}` : nm ? `name:${nm}` : null;
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(m); else groups.set(key, [m]);
  }
  const out = new Map<string, string[]>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const comps = new Set(g.map((m) => m.compartment));
    if (comps.size !== g.length) continue; // two of them in one compartment: not a clean compound group
    const names = g.map((m) => compoundName(m.name));
    if (!names.every((n) => compatible(n, names.find(Boolean) ?? ''))) continue; // same base id, different compounds
    for (const m of g) out.set(m.id, g.filter((x) => x !== m).map((x) => x.id));
  }
  return out;
}
