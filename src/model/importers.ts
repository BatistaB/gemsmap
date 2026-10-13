import type { Gene, ID, MetabolicModel, Metabolite, Reaction, ValidationIssue } from './types';

const DEFAULT_COMPARTMENTS: Record<string, string> = {
  c: 'cytosol', e: 'extracellular', p: 'periplasm', m: 'mitochondria', x: 'peroxisome',
  r: 'endoplasmic reticulum', g: 'Golgi', n: 'nucleus', l: 'lysosome', v: 'vacuole', h: 'chloroplast',
};

function genesFromRule(rule: string | undefined): string[] {
  if (!rule) return [];
  return Array.from(
    new Set(rule.replace(/[()]/g, ' ').split(/\s+/).filter((t) => t && !/^(and|or)$/i.test(t))),
  );
}

/** COBRApy / BiGG / Escher-model JSON. */
export function parseCobraJson(text: string): MetabolicModel {
  const j = JSON.parse(text);
  if (!Array.isArray(j.metabolites) || !Array.isArray(j.reactions)) {
    throw new Error('Not a COBRA JSON model: expected "metabolites" and "reactions" arrays.');
  }
  // models exported by BiGG (bigg.bio) prefix model-specific entries with "__<model id>__": drop it, so the IDs are
  // the BiGG IDs templates and data files use (only when that creates no duplicate)
  const prefix = typeof j.id === 'string' && j.id ? `__${j.id}__` : '';
  const strip = (s: string) => s.split(prefix).join('');
  const fix = prefix && j.metabolites.some((m: { id: string }) => m.id.includes(prefix))
    && new Set(j.metabolites.map((m: { id: string }) => strip(m.id))).size === j.metabolites.length
    && new Set(j.reactions.map((r: { id: string }) => strip(r.id))).size === j.reactions.length
    ? strip : (s: string) => s;
  const metabolites: Record<ID, Metabolite> = {};
  for (const m0 of j.metabolites) {
    const m = { ...m0, id: fix(m0.id) };
    metabolites[m.id] = {
      id: m.id,
      name: m.name || m.id,
      formula: m.formula || undefined,
      charge: typeof m.charge === 'number' ? m.charge : undefined,
      compartment: m.compartment || (m.id.match(/_([a-z][a-z0-9]?)$/)?.[1] ?? 'c'),
      annotation: m.annotation,
    };
  }
  const reactions: Record<ID, Reaction> = {};
  for (const r0 of j.reactions) {
    const r = { ...r0, id: fix(r0.id) };
    const lb = r.lower_bound ?? -1000;
    const ub = r.upper_bound ?? 1000;
    reactions[r.id] = {
      id: r.id,
      name: r.name || r.id,
      stoichiometry: Object.fromEntries(Object.entries(r.metabolites || {}).map(([k, v]) => [fix(k), v as number])),
      reversible: lb < 0 && ub > 0,
      lowerBound: lb,
      upperBound: ub,
      subsystem: r.subsystem || undefined,
      gpr: r.gene_reaction_rule || undefined,
      genes: genesFromRule(r.gene_reaction_rule),
      ec: r.annotation?.['ec-code'] ? [].concat(r.annotation['ec-code']) : undefined,
    };
  }
  const genes: Record<ID, Gene> = {};
  for (const g of j.genes || []) genes[g.id] = { id: g.id, name: g.name };
  const compartments: Record<string, string> = { ...(j.compartments || {}) };
  for (const m of Object.values(metabolites)) {
    if (!compartments[m.compartment]) compartments[m.compartment] = DEFAULT_COMPARTMENTS[m.compartment] ?? m.compartment;
  }
  return { id: j.id || 'model', name: j.name || j.id || 'Imported model', metabolites, reactions, genes, compartments, source: 'cobra-json' };
}

/** SBML level 2/3 with optional fbc package (bounds, gene products). */
export function parseSbml(text: string): MetabolicModel {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid SBML/XML file.');
  const byLocal = (el: Element | Document, name: string) =>
    Array.from(el.getElementsByTagName('*')).filter((e) => e.localName === name);
  const modelEl = byLocal(doc, 'model')[0];
  if (!modelEl) throw new Error('No <model> element found.');
  const unescape = (id: string) => id.replace(/__(\d+)__/g, (_, c) => String.fromCharCode(+c));
  const strip = (id: string, p: string) => unescape(id.startsWith(p) ? id.slice(p.length) : id);
  const attr = (e: Element, n: string) => e.getAttribute(n) ?? e.getAttribute('fbc:' + n) ?? undefined;

  const params: Record<string, number> = {};
  for (const p of byLocal(modelEl, 'parameter')) {
    const id = p.getAttribute('id');
    if (id) params[id] = Number(p.getAttribute('value'));
  }
  const compartments: Record<string, string> = {};
  for (const c of byLocal(modelEl, 'compartment')) {
    const id = c.getAttribute('id')!;
    compartments[strip(id, 'C_')] = c.getAttribute('name') || DEFAULT_COMPARTMENTS[strip(id, 'C_')] || id;
  }
  const metabolites: Record<ID, Metabolite> = {};
  for (const s of byLocal(modelEl, 'species')) {
    const id = strip(s.getAttribute('id')!, 'M_');
    const ch = attr(s, 'charge');
    metabolites[id] = {
      id,
      name: s.getAttribute('name') || id,
      compartment: strip(s.getAttribute('compartment') || 'c', 'C_'),
      formula: attr(s, 'chemicalFormula'),
      charge: ch != null ? Number(ch) : undefined,
      annotation: cvTerms(s),
    };
  }
  const reactions: Record<ID, Reaction> = {};
  for (const r of byLocal(modelEl, 'reaction')) {
    const id = strip(r.getAttribute('id')!, 'R_');
    const stoich: Record<ID, number> = {};
    for (const [listName, sign] of [['listOfReactants', -1], ['listOfProducts', 1]] as const) {
      const list = byLocal(r, listName)[0];
      if (!list) continue;
      for (const sr of byLocal(list, 'speciesReference')) {
        const sid = strip(sr.getAttribute('species')!, 'M_');
        stoich[sid] = (stoich[sid] ?? 0) + sign * Number(sr.getAttribute('stoichiometry') ?? 1);
      }
    }
    const lbRef = attr(r, 'lowerFluxBound');
    const ubRef = attr(r, 'upperFluxBound');
    const reversibleAttr = r.getAttribute('reversible') !== 'false';
    const lb = lbRef && lbRef in params ? params[lbRef] : reversibleAttr ? -1000 : 0;
    const ub = ubRef && ubRef in params ? params[ubRef] : 1000;
    const genes = byLocal(r, 'geneProductRef').map((g) => strip(attr(g, 'geneProduct') || '', 'G_'));
    const gpa = byLocal(r, 'geneProductAssociation')[0];
    reactions[id] = {
      id,
      name: r.getAttribute('name') || id,
      stoichiometry: stoich,
      reversible: lb < 0 && ub > 0,
      lowerBound: lb,
      upperBound: ub,
      genes: Array.from(new Set(genes)),
      gpr: gpa ? gprToString(gpa.firstElementChild) : undefined,
      subsystem: undefined,
    };
  }
  const genes: Record<ID, Gene> = {};
  for (const g of byLocal(modelEl, 'geneProduct')) {
    const id = strip(attr(g, 'id') || '', 'G_');
    genes[id] = { id, name: attr(g, 'label') || attr(g, 'name') };
  }
  // COBRA-style subsystem groups
  for (const grp of byLocal(modelEl, 'group')) {
    const name = grp.getAttribute('groups:name') || grp.getAttribute('name');
    for (const m of byLocal(grp, 'member')) {
      const ref = strip(m.getAttribute('groups:idRef') || m.getAttribute('idRef') || '', 'R_');
      if (reactions[ref] && name) reactions[ref].subsystem = name;
    }
  }
  return {
    id: modelEl.getAttribute('id') || 'model',
    name: modelEl.getAttribute('name') || modelEl.getAttribute('id') || 'SBML model',
    metabolites, reactions, genes, compartments, source: 'sbml',
  };
}

/** MIRIAM cross-references of an SBML element (rdf:li resources under bqbiol:is / isVersionOf …). */
function cvTerms(el: Element): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  const ann = Array.from(el.children).find((c) => c.localName === 'annotation');
  if (!ann) return undefined;
  for (const li of Array.from(ann.getElementsByTagName('*')).filter((e) => e.localName === 'li')) {
    const uri = li.getAttribute('rdf:resource') ?? li.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'resource') ?? '';
    const m = uri.match(/identifiers\.org\/+([^/:]+)[/:](.+)$/i);
    if (!m) continue;
    const ns = m[1].toLowerCase();
    (out[ns] ??= []).push(decodeURIComponent(m[2]));
  }
  return Object.keys(out).length ? out : undefined;
}

function gprToString(el: Element | null): string {
  if (!el) return '';
  const kids = Array.from(el.children);
  if (el.localName === 'geneProductRef') return (el.getAttribute('fbc:geneProduct') || el.getAttribute('geneProduct') || '').replace(/^G_/, '');
  const op = el.localName === 'and' ? ' and ' : ' or ';
  return kids.map((k) => (k.children.length ? `(${gprToString(k)})` : gprToString(k))).join(op);
}

export function parseModelFile(name: string, text: string): MetabolicModel {
  const trimmed = text.trimStart();
  if (name.toLowerCase().endsWith('.xml') || name.toLowerCase().endsWith('.sbml') || trimmed.startsWith('<')) return parseSbml(text);
  return parseCobraJson(text);
}

/** COBRApy-compatible JSON export (round-trips through cobra.io.load_json_model). */
export function toCobraJson(m: MetabolicModel): string {
  return JSON.stringify(
    {
      id: m.id, name: m.name, compartments: m.compartments, version: '1',
      metabolites: Object.values(m.metabolites).map((x) => ({ id: x.id, name: x.name, compartment: x.compartment, formula: x.formula ?? '', charge: x.charge ?? 0 })),
      reactions: Object.values(m.reactions).filter((r) => !r.meta?.virtual).map((r) => ({
        id: r.id, name: r.name, metabolites: r.stoichiometry, lower_bound: r.lowerBound, upper_bound: r.upperBound,
        gene_reaction_rule: r.gpr ?? '', subsystem: r.subsystem ?? '',
      })),
      genes: Object.values(m.genes).map((g) => ({ id: g.id, name: g.name ?? '' })),
    },
    null,
    1,
  );
}

export function validateModel(m: MetabolicModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const missing = new Set<string>();
  const produced = new Set<string>();
  const consumed = new Set<string>();
  const used = new Set<string>();
  const empty: string[] = [];
  const invalid: string[] = [];
  for (const r of Object.values(m.reactions)) {
    const entries = Object.entries(r.stoichiometry);
    if (!entries.length) empty.push(r.id);
    for (const [mid, c] of entries) {
      if (!m.metabolites[mid]) missing.add(mid);
      if (!Number.isFinite(c) || c === 0) invalid.push(r.id);
      used.add(mid);
      if (c > 0 || r.reversible) produced.add(mid);
      if (c < 0 || r.reversible) consumed.add(mid);
    }
  }
  if (missing.size) issues.push({ level: 'error', code: 'missing-metabolite', message: `${missing.size} metabolites referenced by reactions are not defined`, ids: [...missing] });
  if (invalid.length) issues.push({ level: 'error', code: 'invalid-stoichiometry', message: `${invalid.length} reactions have zero/non-finite coefficients`, ids: invalid });
  if (empty.length) issues.push({ level: 'warning', code: 'empty-reaction', message: `${empty.length} reactions have no metabolites`, ids: empty });
  const dead = Object.keys(m.metabolites).filter((id) => used.has(id) && (!produced.has(id) || !consumed.has(id)));
  if (dead.length) issues.push({ level: 'info', code: 'dead-end', message: `${dead.length} dead-end metabolites (only produced or only consumed)`, ids: dead });
  const orphan = Object.keys(m.metabolites).filter((id) => !used.has(id));
  if (orphan.length) issues.push({ level: 'info', code: 'orphan-metabolite', message: `${orphan.length} metabolites are not used by any reaction`, ids: orphan });
  return issues;
}
