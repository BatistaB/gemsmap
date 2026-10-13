/**
 * Metabolite name normalization for the local (non-database) matching layer.
 * Stereochemistry is preserved: D-glucose and L-glucose never share a key.
 * Only anomeric prefixes (alpha/beta) are relaxed, and that relaxed match is
 * reported as weaker, "related form" evidence.
 */

const GREEK: Record<string, string> = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ω': 'omega' };

const COMPARTMENT_WORDS = 'cytosol|cytoplasm|cytoplasmic|mitochondri[a-z]*|extracellular|periplasm|peroxisom[a-z]*|nucleus|vacuol[a-z]*|golgi|endoplasmic reticulum|lysosom[a-z]*|chloroplast|plastid|boundary';
const DECOR = [
  /\s*\[[^\]]{1,24}\]\s*$/, // "D-glucose [cytoplasm]", "glc[c]"
  new RegExp(`\\s*\\((?:${COMPARTMENT_WORDS})\\)\\s*$`), // "citrate (mitochondria)"
  new RegExp(`\\s*[-,]\\s*(?:${COMPARTMENT_WORDS})\\s*$`), // "citrate - mitochondrial"
  /\s*\(\s*\d*\s*[+-]\s*\d*\s*\)\s*$/, // charge "(3-)", "(2+)"
];

/** Lower-case, Unicode-normalized, hyphen/space-normalized name with compartment and charge decorations removed. */
export function normName(s: string): string {
  let t = (s || '').normalize('NFKC');
  t = t.replace(/[αβγδω]/g, (c) => GREEK[c]).toLowerCase();
  t = t.replace(/[‐-―−]/g, '-').replace(/[′’]/g, "'");
  for (let i = 0; i < 2; i++) for (const re of DECOR) t = t.replace(re, '');
  return t.replace(/\s+/g, ' ').replace(/^[\s.,;:]+|[\s.,;:]+$/g, '');
}

/** Spacing/punctuation-free key: "fructose 1,6-bisphosphate" = "Fructose-1,6-bisphosphate". */
export const compactKey = (s: string) => normName(s).replace(/[\s\-,'()[\]{}_]/g, '');

/** Like compactKey, but anomeric (alpha/beta) and ring-form words removed: alpha-D-glucose ~ D-glucose. */
export const relaxedKey = (s: string) =>
  compactKey(normName(s).replace(/(^|[\s(,-])(alpha|beta|a|b)-(?=[a-z(])/g, '$1').replace(/(pyranose|furanose)/g, 'ose'));

/** Stereo descriptors written in the name: D/L/DL and (R)/(S). */
export function stereoOf(s: string): { dl: Set<string>; rs: Set<string> } {
  const n = normName(s);
  const dl = new Set<string>(), rs = new Set<string>();
  for (const m of n.matchAll(/(?:^|[\s,(-])(dl|d|l)-(?=[a-z0-9(])/g)) dl.add(m[1]);
  for (const m of n.matchAll(/\((\d*[rs](?:,\d*[rs])*)\)-/g)) for (const x of m[1].split(',')) rs.add(x.replace(/\d/g, ''));
  return { dl, rs };
}

/** Name with all stereo/anomeric descriptors removed — only used to DETECT stereo conflicts. */
export const stereoFreeKey = (s: string) =>
  relaxedKey(normName(s).replace(/(^|[\s,(-])(dl|d|l)-(?=[a-z0-9(])/g, '$1').replace(/\(\d*[rs](?:,\d*[rs])*\)-/g, ''));

/** True when both names state a stereo configuration and they disagree (D vs L, R vs S). */
export function stereoConflict(a: string, b: string): boolean {
  const x = stereoOf(a), y = stereoOf(b);
  const clash = (p: Set<string>, q: Set<string>) => p.size > 0 && q.size > 0 && ![...p].some((v) => q.has(v));
  return clash(x.dl, y.dl) || clash(x.rs, y.rs);
}

// ------------------------------------------------------------ formulas

/** Heavy-atom composition (H is ignored: protonation conventions differ between models). */
export function heavyAtoms(formula: string | undefined): Record<string, number> | null {
  if (!formula || /[()*]|R(?![a-z])|X(?![a-z])|n$/.test(formula)) return null; // polymers, R groups
  const out: Record<string, number> = {};
  for (const m of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    if (!m[1] || m[1] === 'H') continue;
    out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? +m[2] : 1);
  }
  return Object.keys(out).length ? out : null;
}

/** 'match' | 'conflict' | null (cannot compare). */
export function compareFormula(a: string | undefined, b: string | undefined): 'match' | 'conflict' | null {
  const x = heavyAtoms(a), y = heavyAtoms(b);
  if (!x || !y) return null;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if ((x[k] ?? 0) !== (y[k] ?? 0)) return 'conflict';
  return 'match';
}
