/**
 * Template mapping engine: unit tests and the acceptance criteria of the
 * model-agnostic template system (ID independence, compartments, ambiguity,
 * missing entities). Fixtures: `python tools/templates/make_fixtures.py`.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseCobraJson } from '../src/model/importers';
import type { MetabolicModel } from '../src/model/types';
import { classifyCompartment } from '../src/templates/mapping/compartments';
import { isMapped, mapTemplate, type TemplateMapping } from '../src/templates/mapping/engine';
import { idPatternXrefs, normalizeAnnotation } from '../src/templates/mapping/identifiers';
import { compactKey, relaxedKey, stereoConflict } from '../src/templates/mapping/names';
import { BUILTIN_TEMPLATE_FILES, CENTRAL_CARBON, GLYCOLYSIS, PATHWAY_SPECS, PPP, TCA, validateTemplate } from '../src/templates/pathways';
import { compileTemplate } from '../src/templates/format/compile';
import { withFamilyParents } from '../src/model/families';

const fixture = (f: string): MetabolicModel | null => {
  const p = `tests/fixtures/${f}`;
  return existsSync(p) ? parseCobraJson(readFileSync(p, 'utf8')) : null;
};
const FIXTURES_MSG = 'run tools/templates/make_fixtures.py to create tests/fixtures';

// built-in slots have stable tpl_met_### ids; the readable former ids ('g6p') are kept as aliases
const slot = (r: TemplateMapping, s: string) => {
  const x = r.slots.find((y) => y.slot.slot === s || y.slot.aliases?.includes(s));
  assert.ok(x, `slot ${s}`);
  return x!;
};
const mapped = (r: TemplateMapping, s: string) => {
  const x = slot(r, s);
  return x.chosen && isMapped(x.status) ? x.chosen.metId : null;
};
/** Slot id of a readable alias, for overrides. */
const sid = (spec: { biology: { slots: { slot: string; aliases?: string[] }[] } }, alias: string) => spec.biology.slots.find((s) => s.aliases?.includes(alias))!.slot;
const table = (r: TemplateMapping) =>
  r.slots.map((s) => `${(s.slot.aliases?.[0] ?? s.slot.slot).padEnd(7)} ${s.status.padEnd(11)} ${(s.chosen && isMapped(s.status) ? s.chosen.metId : '—').padEnd(14)} ${s.chosen?.score ?? ''}  ${s.reason}`).join('\n');

// ------------------------------------------------------------ normalizers

test('identifier normalization: one canonical form for many spellings', () => {
  for (const ann of [
    { 'kegg.compound': 'C00031' }, { KEGG: ['C00031'] }, { kegg: 'https://identifiers.org/kegg.compound/C00031' },
    { 'kegg.compound': 'kegg.compound:C00031' }, { keggId: 'cpd:C00031' },
  ]) assert.ok(normalizeAnnotation(ann).has('kegg.compound:C00031'), JSON.stringify(ann));
  for (const v of ['CHEBI:17634', 'CHEBI/17634', '17634', 'https://identifiers.org/CHEBI:17634', 'http://identifiers.org/chebi/CHEBI:17634']) {
    assert.ok(normalizeAnnotation({ chebi: v }).has('chebi:17634'), v);
  }
  assert.ok(normalizeAnnotation({ hmdb: 'HMDB01401' }).has('hmdb:HMDB0001401'));
  assert.ok(normalizeAnnotation({ biocyc: 'META:GLC-6-P' }).has('metacyc.compound:GLC-6-P'));
  assert.ok(normalizeAnnotation({ sbo: 'SBO:0000247' }).size === 0);
  assert.deepEqual(idPatternXrefs('C00031[c]', 'c').xrefs, ['kegg.compound:C00031']);
  assert.deepEqual(idPatternXrefs('cpd00027_c0', 'c0').xrefs, ['seed.compound:cpd00027']);
  assert.equal(idPatternXrefs('M_glc__D_c', 'c').biggBase, 'glc__D');
  assert.equal(idPatternXrefs('glc__D[c]', 'c').biggBase, 'glc__D');
  assert.equal(idPatternXrefs('glc-D-c', 'c').biggBase, 'glc-D');
});

test('compartment normalization keeps originals and maps aliases', () => {
  for (const [id, name] of [['c', ''], ['c0', ''], ['cyto', ''], ['C_c', 'cytosol'], ['x1', 'Cytoplasm']]) assert.equal(classifyCompartment(id, name, false).canonical, 'CYTOSOL', id);
  for (const [id, name] of [['m', ''], ['mito', ''], ['m0', 'Mitochondria'], ['q', 'mitochondrial matrix']]) assert.equal(classifyCompartment(id, name, false).canonical, 'MITOCHONDRION', id);
  assert.equal(classifyCompartment('im', 'mitochondrial intermembrane space', true).canonical, 'MITO_IMS');
  assert.equal(classifyCompartment('e', '', false).canonical, 'EXTRACELLULAR');
  // "p" is periplasm in bacteria, peroxisome in eukaryote-like models; the name always wins
  assert.equal(classifyCompartment('p', '', false).canonical, 'PERIPLASM');
  assert.equal(classifyCompartment('p', '', true).canonical, 'PEROXISOME');
  assert.equal(classifyCompartment('p', 'Peroxisome', false).canonical, 'PEROXISOME');
});

test('name normalization preserves stereochemistry', () => {
  assert.equal(compactKey('D-Fructose 1,6-bisphosphate'), compactKey('d-fructose-1,6-bisphosphate'));
  assert.equal(compactKey('Citrate [mitochondria]'), compactKey('citrate'));
  assert.equal(compactKey('citrate(3-)'), compactKey('citrate'));
  assert.notEqual(compactKey('D-glucose'), compactKey('L-glucose'));
  assert.notEqual(relaxedKey('D-glucose'), relaxedKey('L-glucose'));
  assert.equal(relaxedKey('alpha-D-glucose'), relaxedKey('D-glucose'));
  assert.equal(relaxedKey('β-D-glucose'), relaxedKey('D-glucose'));
  assert.ok(stereoConflict('D-lactate', 'L-lactate'));
  assert.ok(stereoConflict('(R)-lactate', '(S)-lactate'));
  assert.ok(!stereoConflict('(S)-malate', 'L-malate'));
});

test('built-in templates pass validation', () => {
  for (const t of PATHWAY_SPECS) assert.deepEqual(validateTemplate(t), [], t.id);
});

test('composition merges shared metabolites (G6P, acetyl-CoA)', () => {
  const ents = CENTRAL_CARBON.biology.slots.map((s) => s.entity);
  assert.equal(ents.filter((e) => e === 'D-glucose-6-phosphate').length, 1);
  assert.equal(ents.filter((e) => e === 'acetyl-CoA').length, 1);
  assert.equal(CENTRAL_CARBON.biology.slots.length, GLYCOLYSIS.biology.slots.length + PPP.biology.slots.length + TCA.biology.slots.length - 2);
});

// ------------------------------------------------------------ e_coli_core (BiGG)

const core = fixture('e_coli_core.json');

test('BiGG model: glycolysis maps with high confidence, extracellular glucose is NOT forced into the cytosolic slot', { skip: !core && FIXTURES_MSG }, () => {
  const r = mapTemplate(GLYCOLYSIS, core!);
  const expect: Record<string, string> = { g6p: 'g6p_c', f6p: 'f6p_c', fdp: 'fdp_c', dhap: 'dhap_c', g3p: 'g3p_c', '13dpg': '13dpg_c', '3pg': '3pg_c', '2pg': '2pg_c', pep: 'pep_c', pyr: 'pyr_c', lac: 'lac__D_c', accoa: 'accoa_c' };
  for (const [s, id] of Object.entries(expect)) assert.equal(mapped(r, s), id, `${s}\n${table(r)}`);
  for (const s of Object.keys(expect).filter((s) => s !== 'lac')) assert.equal(slot(r, s).status, 'auto_high', `${s}\n${table(r)}`);
  // e_coli_core has only glc__D_e (PTS uptake): the intracellular glucose slot stays open, with the candidate listed
  const glc = slot(r, 'glc');
  assert.equal(glc.status, 'unresolved', table(r));
  assert.equal(glc.candidates[0]?.metId, 'glc__D_e');
  assert.equal(r.coverage.coreMapped, 10);
  assert.equal(r.coverage.core, 11);
  assert.ok(r.reactions.find((x) => x.spec.aliases?.includes('PFK'))!.reactionIds.includes('PFK'));
});

test('BiGG model: TCA falls back to the cytosol (no mitochondrion) and says so', { skip: !core && FIXTURES_MSG }, () => {
  const r = mapTemplate(TCA, core!);
  assert.notEqual(r.context.kind, 'eukaryote-like');
  assert.ok(r.notes.some((n) => /no such compartment/.test(n)), r.notes.join('\n'));
  for (const [s, id] of Object.entries({ cit: 'cit_c', icit: 'icit_c', akg: 'akg_c', succoa: 'succoa_c', succ: 'succ_c', fum: 'fum_c', mal: 'mal__L_c', oaa: 'oaa_c', accoa: 'accoa_c' })) {
    assert.equal(mapped(r, s), id, `${s}\n${table(r)}`);
  }
  assert.equal(r.coverage.coreReactionsMapped, r.coverage.coreReactions, JSON.stringify(r.reactions.map((x) => [x.spec.id, x.reactionIds])));
});

test('evidence explains why a candidate matched', { skip: !core && FIXTURES_MSG }, () => {
  const c = slot(mapTemplate(GLYCOLYSIS, core!), 'fdp').chosen!;
  const kinds = new Set(c.evidence.filter((e) => e.ok).map((e) => e.channel));
  for (const k of ['annotation', 'name', 'formula', 'compartment', 'topology'] as const) assert.ok(kinds.has(k), `${k}: ${c.evidence.map((e) => e.text).join(' | ')}`);
  assert.equal(c.confidence, 'high');
});

// ------------------------------------------------------------ ID independence

const seed = fixture('seed_core.json');
const opaque = fixture('kegg_names.json');

test('ID independence: the same template maps a ModelSEED-namespace model to the same biology', { skip: !(core && seed) && FIXTURES_MSG }, () => {
  for (const spec of [GLYCOLYSIS, TCA, PPP]) {
    const a = mapTemplate(spec, core!), b = mapTemplate(spec, seed!);
    for (const s of spec.biology.slots) {
      const ma = mapped(a, s.slot), mb = mapped(b, s.slot);
      assert.equal(!!mb, !!ma, `${spec.id}/${s.slot}: ${ma} vs ${mb}\n${table(b)}`);
      if (ma && mb) assert.equal(seed!.metabolites[mb].name.toLowerCase(), core!.metabolites[ma].name.toLowerCase(), `${spec.id}/${s.slot}`);
    }
  }
});

test('ID independence: names + formula + topology alone (no annotation, opaque IDs) never map a wrong metabolite', { skip: !(core && opaque) && FIXTURES_MSG }, () => {
  for (const spec of [GLYCOLYSIS, TCA, PPP]) {
    const a = mapTemplate(spec, core!), b = mapTemplate(spec, opaque!);
    let n = 0;
    for (const s of spec.biology.slots) {
      const ma = mapped(a, s.slot), mb = mapped(b, s.slot);
      if (mb) { n++; assert.equal(opaque!.metabolites[mb].name, core!.metabolites[ma!]?.name, `${spec.id}/${s.slot}\n${table(b)}`); }
    }
    assert.ok(n >= spec.biology.slots.length - 2, `${spec.id}: only ${n} mapped\n${table(b)}`);
  }
});

// ------------------------------------------------------------ compartments

/** e_coli_core + a mitochondrion holding a copy of the TCA cycle (eukaryote-like). */
function withMitochondrialTca(m: MetabolicModel): MetabolicModel {
  const out: MetabolicModel = { ...m, metabolites: { ...m.metabolites }, reactions: { ...m.reactions }, compartments: { ...m.compartments, m: 'mitochondria' } };
  const tcaRx = ['CS', 'ACONTa', 'ACONTb', 'ICDHyr', 'AKGDH', 'SUCOAS', 'SUCDi', 'FUM', 'MDH'];
  const toM = (id: string) => id.replace(/_c$/, '_m');
  for (const rid of tcaRx) {
    const r = m.reactions[rid];
    const st: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.stoichiometry)) {
      const nk = toM(k);
      if (!out.metabolites[nk]) out.metabolites[nk] = { ...m.metabolites[k], id: nk, compartment: k.endsWith('_c') ? 'm' : m.metabolites[k].compartment };
      st[nk] = v;
    }
    out.reactions[rid + 'm'] = { ...r, id: rid + 'm', stoichiometry: st };
  }
  return out;
}

test('compartment: with a mitochondrial TCA, citrate_m outranks citrate_c and the evidence says why', { skip: !core && FIXTURES_MSG }, () => {
  const euk = withMitochondrialTca(core!);
  const r = mapTemplate(TCA, euk);
  assert.equal(r.context.kind, 'eukaryote-like');
  for (const s of ['cit', 'icit', 'akg', 'succoa', 'succ', 'fum', 'mal', 'oaa', 'accoa']) assert.match(mapped(r, s) ?? '', /_m$/, `${s}\n${table(r)}`);
  const cit = slot(r, 'cit');
  const iM = cit.candidates.findIndex((c) => c.metId === 'cit_m'), iC = cit.candidates.findIndex((c) => c.metId === 'cit_c');
  assert.ok(iM === 0 && iC > 0, cit.candidates.map((c) => `${c.metId} ${c.score}`).join(', '));
  assert.ok(cit.candidates[0].evidence.some((e) => e.channel === 'compartment' && e.ok));
  assert.ok(cit.candidates[iC].evidence.some((e) => e.channel === 'compartment' && e.ok === false));
  assert.ok(cit.candidates[0].evidence.some((e) => e.channel === 'topology' && e.ok));
  // glycolysis in the same model stays cytosolic
  assert.equal(mapped(mapTemplate(GLYCOLYSIS, euk), 'pyr'), 'pyr_c');
});

// ------------------------------------------------------------ ambiguity / missing / user choices

test('ambiguity: two indistinguishable citrates are NOT chosen arbitrarily', { skip: !core && FIXTURES_MSG }, () => {
  const m: MetabolicModel = { ...core!, metabolites: { ...core!.metabolites }, reactions: { ...core!.reactions } };
  m.metabolites['cit2_c'] = { ...core!.metabolites['cit_c'], id: 'cit2_c' };
  for (const rid of ['CS', 'ACONTa']) {
    const r = core!.reactions[rid];
    m.reactions[rid + '_2'] = { ...r, id: rid + '_2', stoichiometry: Object.fromEntries(Object.entries(r.stoichiometry).map(([k, v]) => [k === 'cit_c' ? 'cit2_c' : k, v])) };
  }
  const r = mapTemplate(TCA, m);
  const cit = slot(r, 'cit');
  assert.equal(cit.status, 'ambiguous', table(r));
  assert.equal(cit.chosen, undefined);
  assert.deepEqual(cit.candidates.slice(0, 2).map((c) => c.metId).sort(), ['cit2_c', 'cit_c']);
});

test('missing entity: the slot stays unresolved, no metabolite is invented', { skip: !core && FIXTURES_MSG }, () => {
  const m: MetabolicModel = { ...core!, metabolites: { ...core!.metabolites }, reactions: {} };
  delete m.metabolites['13dpg_c'];
  for (const [id, r] of Object.entries(core!.reactions)) if (!('13dpg_c' in r.stoichiometry)) m.reactions[id] = r;
  const r = mapTemplate(GLYCOLYSIS, m);
  assert.equal(slot(r, '13dpg').status, 'unresolved', table(r));
  assert.equal(mapped(r, '13dpg'), null);
  assert.equal(mapped(r, 'g3p'), 'g3p_c');
});

test('user choices override automatic results and can mark an entity absent', { skip: !core && FIXTURES_MSG }, () => {
  const r = mapTemplate(GLYCOLYSIS, core!, { overrides: { [sid(GLYCOLYSIS, 'glc')]: 'glc__D_e', [sid(GLYCOLYSIS, 'lac')]: null } });
  assert.equal(slot(r, 'glc').status, 'confirmed');
  assert.equal(mapped(r, 'glc'), 'glc__D_e');
  assert.equal(slot(r, 'lac').status, 'absent');
  // a saved profile entry is reused by ANOTHER template sharing the entity (G6P in PPP)
  const profile = { fingerprint: r.model.fingerprint, modelId: 'x', modelName: 'x', updated: '', entries: { 'D-glucose-6-phosphate@CYTOSOL': { entity: 'D-glucose-6-phosphate', compartment: 'CYTOSOL' as const, metaboliteId: 'f6p_c', templateId: 'glycolysis', templateVersion: '2.0', confirmedAt: '' } } };
  const p = mapTemplate(PPP, core!, { profile });
  assert.equal(slot(p, 'g6p').status, 'confirmed');
  assert.equal(mapped(p, 'g6p'), 'f6p_c');
});

test('joint assignment never uses one metabolite for two slots', { skip: !core && FIXTURES_MSG }, () => {
  for (const m of [core!, seed, opaque].filter(Boolean) as MetabolicModel[]) {
    const r = mapTemplate(CENTRAL_CARBON, m);
    const ids = r.slots.map((s) => (s.chosen && isMapped(s.status) ? s.chosen.metId : null)).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, table(r));
  }
});

// ------------------------------------------------------------ genome scale

const ijo = fixture('iJO1366.json');

test('genome-scale BiGG model (iJO1366): central carbon maps fully and fast', { skip: !ijo && FIXTURES_MSG }, () => {
  const t0 = performance.now();
  const r = mapTemplate(CENTRAL_CARBON, ijo!);
  const ms = performance.now() - t0;
  assert.ok(r.coverage.coreMapped >= r.coverage.core - 1, table(r));
  assert.equal(mapped(r, 'glc'), 'glc__D_c', table(r));
  assert.ok(ms < 3000, `${ms} ms`);
});

// The template gallery maps every built-in template as soon as the Elements tab shows, so this must stay fast on
// genome-scale models. (Regression: without cached currency/neighbour lookups, the amino-acid template took
// minutes on large enzyme-constrained models and froze the app after a COBRAGUI result was sent to the map.)
test('genome-scale model (iJO1366): every built-in template maps quickly (gallery badges)', { skip: !ijo && FIXTURES_MSG }, () => {
  const t0 = performance.now();
  for (const f of BUILTIN_TEMPLATE_FILES) mapTemplate(compileTemplate(f), ijo!);
  const ms = performance.now() - t0;
  assert.ok(ms < 8000, `all built-in templates: ${ms.toFixed(0)} ms`);
});
