import type { ID, Metabolite, Reaction } from './types';

/**
 * Currency / cofactor metabolites. Matched on the compartment-free base id
 * (BiGG style) and on names, so it works across most GEMs.
 */
const CURRENCY_BASE = new Set([
  'h', 'h2o', 'atp', 'adp', 'amp', 'gtp', 'gdp', 'utp', 'udp', 'ctp', 'cdp', 'itp', 'idp',
  'nad', 'nadh', 'nadp', 'nadph', 'fad', 'fadh2', 'pi', 'ppi', 'co2', 'o2', 'nh4', 'coa',
  'q8', 'q8h2', 'mqn8', 'mql8', 'hco3', 'h2o2', 'na1', 'k', 'fe2', 'fe3', 'so4', 'h2s', 'ficytc', 'focytc',
]);

const CURRENCY_NAMES = [
  /^h\+?$/i, /^proton$/i, /^water$/i, /^h2o$/i, /^atp$/i, /^adp$/i, /^amp$/i, /^nad\+?$/i, /^nadh$/i,
  /^nadp\+?$/i, /^nadph$/i, /^phosphate$/i, /^orthophosphate$/i, /^diphosphate$/i, /^co2$/i,
  /^carbon dioxide$/i, /^o2$/i, /^oxygen$/i, /^coenzyme a$/i, /^ammonium$/i, /^ubiquinone/i, /^ubiquinol/i,
];

/** Strip BiGG / SBML decorations: "M_g6p_c" -> "g6p", "glc__D_e" -> "glc__D". */
export function baseId(id: string): string {
  let s = id.replace(/^M_/, '').replace(/^R_/, '');
  s = s.replace(/\[[a-z0-9]+\]$/i, ''); // g6p[c]
  s = s.replace(/(?<!_)_[a-z][a-z0-9]?$/, ''); // g6p_c, glc__D_e (but keep glc__D)
  return s;
}

// isCurrency runs inside every graph query (neighbours, routes, template binding): on genome-scale models it is
// called millions of times, and each call tests ~20 name patterns. The answer only depends on the metabolite, so
// it is cached per metabolite object (models are immutable; an edited metabolite is a new object).
const currencyCache = new WeakMap<Metabolite, boolean>();

export function isCurrency(m: Metabolite | undefined, extra?: Set<string>): boolean {
  if (!m) return false;
  if (!extra) {
    let v = currencyCache.get(m);
    if (v === undefined) { v = currencyUncached(m); currencyCache.set(m, v); }
    return v;
  }
  return currencyUncached(m, extra);
}

function currencyUncached(m: Metabolite, extra?: Set<string>): boolean {
  if (/^(prot_|pmet_)/.test(m.id)) return true; // ecModel enzyme pseudo-metabolites
  const b = baseId(m.id).toLowerCase();
  if (CURRENCY_BASE.has(b) || extra?.has(b)) return true;
  return CURRENCY_NAMES.some((re) => re.test(m.name.trim()));
}

/** Non-currency substrates and products of a reaction (falls back to all if everything is currency). */
export function mainParticipants(
  rxn: Reaction,
  mets: Record<ID, Metabolite>,
): { substrates: ID[]; products: ID[]; cofactorsIn: ID[]; cofactorsOut: ID[] } {
  const subs: ID[] = [];
  const prods: ID[] = [];
  const cin: ID[] = [];
  const cout: ID[] = [];
  for (const [mid, coef] of Object.entries(rxn.stoichiometry)) {
    const cur = isCurrency(mets[mid]);
    if (coef < 0) (cur ? cin : subs).push(mid);
    else if (coef > 0) (cur ? cout : prods).push(mid);
  }
  return {
    substrates: subs.length ? subs : cin,
    products: prods.length ? prods : cout,
    cofactorsIn: subs.length ? cin : [],
    cofactorsOut: prods.length ? cout : [],
  };
}

export function equationString(rxn: Reaction, mets: Record<ID, Metabolite>, useNames = false): string {
  const side = (sign: 1 | -1) =>
    Object.entries(rxn.stoichiometry)
      .filter(([, c]) => c * sign > 0)
      .map(([id, c]) => {
        const n = Math.abs(c);
        const label = useNames ? mets[id]?.name ?? id : id;
        return (n !== 1 ? `${+n.toFixed(3)} ` : '') + label;
      })
      .join(' + ');
  return `${side(-1) || '∅'} ${rxn.reversible ? '⇌' : '→'} ${side(1) || '∅'}`;
}
