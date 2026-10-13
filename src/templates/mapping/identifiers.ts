/**
 * Identifier normalization: every way a GEM writes a cross-reference
 * ("kegg.compound": "C00031", KEGG: "C00031", "https://identifiers.org/kegg.compound/C00031",
 * "CHEBI/17634", "CHEBI:17634" …) becomes one canonical string `namespace:id`
 * (kegg.compound:C00031, chebi:17634).
 *
 * Identifiers parsed out of a metabolite's own ID (C00031[c], cpd00027_c0, glc__D_c)
 * are kept apart: string stripping is only candidate evidence, never proof.
 */

export type Namespace =
  | 'kegg.compound' | 'chebi' | 'bigg.metabolite' | 'metanetx.chemical' | 'seed.compound'
  | 'metacyc.compound' | 'hmdb' | 'vmh' | 'reactome' | 'inchikey' | 'pubchem.compound' | 'lipidmaps'
  | 'kegg.reaction' | 'bigg.reaction' | 'metanetx.reaction' | 'seed.reaction' | 'metacyc.reaction' | 'rhea' | 'ec-code';

/** Human label of a namespace for evidence lists. */
export const NS_LABEL: Record<Namespace, string> = {
  'kegg.compound': 'KEGG', chebi: 'ChEBI', 'bigg.metabolite': 'BiGG', 'metanetx.chemical': 'MetaNetX', 'seed.compound': 'ModelSEED',
  'metacyc.compound': 'MetaCyc', hmdb: 'HMDB', vmh: 'VMH', reactome: 'Reactome', inchikey: 'InChIKey', 'pubchem.compound': 'PubChem',
  lipidmaps: 'LIPID MAPS', 'kegg.reaction': 'KEGG reaction', 'bigg.reaction': 'BiGG reaction', 'metanetx.reaction': 'MetaNetX reaction',
  'seed.reaction': 'ModelSEED reaction', 'metacyc.reaction': 'MetaCyc reaction', rhea: 'Rhea', 'ec-code': 'EC',
};

/** Annotation keys seen in the wild (lower-cased, separators removed) → namespace. */
const KEY_ALIASES: Record<string, Namespace> = {
  kegg: 'kegg.compound', keggcompound: 'kegg.compound', keggid: 'kegg.compound', keggcpd: 'kegg.compound', keggligand: 'kegg.compound',
  chebi: 'chebi', chebiid: 'chebi',
  bigg: 'bigg.metabolite', biggmetabolite: 'bigg.metabolite', biggid: 'bigg.metabolite',
  metanetx: 'metanetx.chemical', metanetxchemical: 'metanetx.chemical', mnx: 'metanetx.chemical', mnxm: 'metanetx.chemical', metanetxmnxchemical: 'metanetx.chemical',
  seed: 'seed.compound', seedcompound: 'seed.compound', modelseed: 'seed.compound', modelseedcompound: 'seed.compound',
  metacyc: 'metacyc.compound', metacyccompound: 'metacyc.compound', biocyc: 'metacyc.compound',
  hmdb: 'hmdb', vmh: 'vmh', vmhmetabolite: 'vmh', reactome: 'reactome', reactomecompound: 'reactome',
  inchikey: 'inchikey', pubchem: 'pubchem.compound', pubchemcompound: 'pubchem.compound', lipidmaps: 'lipidmaps',
  keggreaction: 'kegg.reaction', biggreaction: 'bigg.reaction', metanetxreaction: 'metanetx.reaction', seedreaction: 'seed.reaction',
  metacycreaction: 'metacyc.reaction', rhea: 'rhea', eccode: 'ec-code', ec: 'ec-code', ecnumber: 'ec-code',
};

const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Normalize a single (namespace, raw value) pair. Returns `ns:id` or null when the value is not recognisable. */
export function normalizeXref(ns: Namespace, raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  // identifiers.org / bioregistry URLs: .../kegg.compound/C00031 or .../CHEBI:17634
  v = v.replace(/^https?:\/\/[^/]*(identifiers\.org|bioregistry\.io|n2t\.net)\/+/i, '');
  v = v.replace(/^([a-z][a-z.]*)[/:](?=.)/i, (m, k: string) => (namespaceOfKey(k) ? '' : m));
  switch (ns) {
    case 'kegg.compound': { const m = v.match(/\b([CDG]\d{5})\b/i); if (!m) return null; const id = m[1].toUpperCase(); return id[0] === 'C' ? `kegg.compound:${id}` : null; }
    case 'chebi': { const m = v.match(/(\d+)\s*$/); return m ? `chebi:${+m[1]}` : null; }
    case 'metanetx.chemical': { const m = v.match(/(MNXM\d+|WATER|BIOMASS)/i); return m ? `metanetx.chemical:${m[1].toUpperCase()}` : null; }
    case 'seed.compound': { const m = v.match(/cpd\d{5}/i); return m ? `seed.compound:${m[0].toLowerCase()}` : null; }
    case 'hmdb': { const m = v.match(/HMDB(\d+)/i); return m ? `hmdb:HMDB${m[1].padStart(7, '0')}` : null; }
    case 'metacyc.compound': { const id = v.replace(/^(META|METACYC|BIOCYC)[:/]/i, '').trim(); return id ? `metacyc.compound:${id.toUpperCase()}` : null; }
    case 'inchikey': { const m = v.match(/[A-Z]{14}-[A-Z]{10}-[A-Z]/i); return m ? `inchikey:${m[0].toUpperCase()}` : null; }
    case 'bigg.metabolite': { const id = v.replace(/^M_/, ''); return id ? `bigg.metabolite:${id}` : null; }
    case 'kegg.reaction': { const m = v.match(/R\d{5}/i); return m ? `kegg.reaction:${m[0].toUpperCase()}` : null; }
    case 'metanetx.reaction': { const m = v.match(/MNXR\d+/i); return m ? `metanetx.reaction:${m[0].toUpperCase()}` : null; }
    case 'seed.reaction': { const m = v.match(/rxn\d{5}/i); return m ? `seed.reaction:${m[0].toLowerCase()}` : null; }
    case 'rhea': { const m = v.match(/(\d+)\s*$/); return m ? `rhea:${+m[1]}` : null; }
    case 'ec-code': { const m = v.match(/\d+\.[\d-]+\.[\d-]+\.[\dn-]+/); return m ? `ec-code:${m[0]}` : null; }
    default: return `${ns}:${v}`;
  }
}

/** Guess the namespace of an annotation key; values with their own prefix (identifiers.org URL, "CHEBI:…") are also understood. */
export function namespaceOfKey(key: string): Namespace | null {
  return KEY_ALIASES[keyOf(key)] ?? null;
}

/** All canonical cross-references of a model annotation (COBRA dict, SBML CV terms or COBRAGUI annotation). */
export function normalizeAnnotation(ann: Record<string, unknown> | undefined): Set<string> {
  const out = new Set<string>();
  if (!ann) return out;
  const add = (ns: Namespace | null, raw: string) => {
    for (const part of raw.split(/[;,|]\s*|\s+/)) {
      let n = ns;
      // URLs and prefixed values carry their own namespace
      const url = part.match(/identifiers\.org\/+([a-z.]+)[/:]/i) ?? part.match(/^(CHEBI|MNXM|HMDB|cpd(?=\d)|C\d{5})/i);
      if (url) {
        const k = url[1];
        n = /^chebi$/i.test(k) ? 'chebi' : /^mnxm$/i.test(k) ? 'metanetx.chemical' : /^hmdb$/i.test(k) ? 'hmdb' : /^cpd$/i.test(k) ? 'seed.compound'
          : /^C\d{5}$/i.test(k) ? (n ?? 'kegg.compound') : (namespaceOfKey(k) ?? n);
      }
      if (!n) continue;
      const x = normalizeXref(n, part);
      if (x) out.add(x);
    }
  };
  for (const [k, v] of Object.entries(ann)) {
    const ns = namespaceOfKey(k);
    const vals = Array.isArray(v) ? v : [v];
    for (const val of vals) if (typeof val === 'string') add(ns, val);
  }
  return out;
}

/**
 * Identifiers implied by a metabolite ID string (C00031[c] → KEGG, cpd00027_c0 → ModelSEED,
 * MNXM41@MNXD1 → MetaNetX, otherwise the compartment-free base as a BiGG-like ID).
 * `compartment` is the metabolite's compartment, stripped as a suffix when present.
 */
export function idPatternXrefs(id: string, compartment: string): { xrefs: string[]; biggBase: string | null } {
  const xrefs: string[] = [];
  const s = id.replace(/^M_/, '');
  const kegg = s.match(/^(C\d{5})(?![0-9])/);
  if (kegg) xrefs.push(`kegg.compound:${kegg[1]}`);
  const seed = s.match(/^(cpd\d{5})(?![0-9])/i);
  if (seed) xrefs.push(`seed.compound:${seed[1].toLowerCase()}`);
  const mnx = s.match(/^(MNXM\d+)(?![0-9])/);
  if (mnx) xrefs.push(`metanetx.chemical:${mnx[1]}`);
  if (xrefs.length) return { xrefs, biggBase: null };
  return { xrefs, biggBase: stripCompartmentSuffix(s, compartment) };
}

/** glc__D_c / glc__D[c] / glc-D-c → glc__D / glc__D / glc-D (only the metabolite's own compartment is stripped). */
export function stripCompartmentSuffix(id: string, compartment: string): string {
  const c = compartment.replace(/^C_/, '');
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (c) {
    const re = new RegExp(`(\\[${esc}\\]|\\(${esc}\\)|[_-]${esc})$`);
    if (re.test(id)) return id.replace(re, '');
  }
  return id.replace(/\[[a-z0-9]+\]$/i, '');
}

/** Loose BiGG-like key used only as weak evidence: case and _/- runs ignored (glc__D ~ glc_D ~ glc-D). */
export const looseIdKey = (s: string) => s.toLowerCase().replace(/[-_]+/g, '_');
