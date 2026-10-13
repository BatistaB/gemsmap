/**
 * Template Builder: the template file format, the design layer (drawing ↔ biology),
 * identity workflow (human > machine), validation, and applying user-made templates
 * to GEMs with different namespaces. Fixtures: `npm run test:fixtures`.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseCobraJson } from '../src/model/importers';
import type { MetabolicModel } from '../src/model/types';
import { emptyDoc } from '../src/store/project';
import { useStore } from '../src/store/store';
import { designActions } from '../src/templates/design/actions';
import { docToFile, fileToDoc, reconcile } from '../src/templates/design/convert';
import { compileTemplate, entityKey } from '../src/templates/format/compile';
import { autoIdentify, confirmCandidate, searchLibrary, suggestIdentity, type IdentityCandidate } from '../src/templates/format/identity';
import { parseTemplateJson } from '../src/templates/format/parse';
import { emptyTemplate, type TemplateFile } from '../src/templates/format/schema';
import { layoutQc } from '../src/templates/format/layoutQc';
import { completeness, validateTemplateFile } from '../src/templates/format/validate';
import { addPathwayToDoc } from '../src/templates/instantiate';
import { duplicateTemplate } from '../src/templates/library/registry';
import { isMapped, mapTemplate } from '../src/templates/mapping/engine';
import { BUILTIN_TEMPLATE_FILES, GLYCOLYSIS } from '../src/templates/pathways';
import type { VisualDoc } from '../src/viz/types';

const fixture = (f: string): MetabolicModel | null => {
  const p = `tests/fixtures/${f}`;
  return existsSync(p) ? parseCobraJson(readFileSync(p, 'utf8')) : null;
};
const core = fixture('e_coli_core.json');
const seed = fixture('seed_core.json');
const FIXTURES_MSG = 'run tools/templates/make_fixtures.py to create tests/fixtures';

const builtin = (id: string) => structuredClone(BUILTIN_TEMPLATE_FILES.find((f) => f.metadata.id === id)!);
const lib = (q: string) => searchLibrary(q)[0];
const mappedIds = (spec: ReturnType<typeof compileTemplate>, m: MetabolicModel) =>
  Object.fromEntries(mapTemplate(spec, m).slots.map((s) => [s.slot.aliases?.[0] ?? s.slot.slot, s.chosen && isMapped(s.status) ? s.chosen.metId : null]));

/** Open a file in the editor store as the Template Builder does (no map stash needed in tests). */
function openInStore(f: TemplateFile) {
  useStore.setState({ design: f, doc: fileToDoc(f), model: null, past: [], future: [], selection: [] });
  useStore.getState().actions.commit(() => ({ design: useStore.getState().design }));
}
const current = () => docToFile(useStore.getState().design!, useStore.getState().doc);

// ------------------------------------------------------------ format

test('built-in templates are ordinary files: they parse, validate without errors and are stoichiometrically balanced', () => {
  for (const f of BUILTIN_TEMPLATE_FILES) {
    const r = parseTemplateJson(JSON.stringify(f));
    assert.deepEqual(r.errors, [], f.metadata.id);
    const issues = validateTemplateFile(f);
    assert.deepEqual(issues.filter((i) => i.severity === 'error'), [], `${f.metadata.id}: ${JSON.stringify(issues.filter((i) => i.severity === 'error'))}`);
    assert.deepEqual(issues.filter((i) => i.code === 'unbalanced').map((i) => i.message), [], f.metadata.id);
    assert.equal(completeness(f).overall, 1, f.metadata.id);
    // no model ID anywhere: compartments are conceptual, identities are database identifiers
    for (const m of f.biology.metabolites) assert.ok(m.compartment === null || /^[a-z_]+$/.test(m.compartment) && m.compartment.length > 2, m.compartment ?? '');
    assert.deepEqual(issues.filter((i) => i.code === 'model-id'), []);
  }
});

test('the schema check refuses what it cannot read and repairs what it can', () => {
  assert.match(parseTemplateJson('{').errors[0], /JSON/);
  assert.match(parseTemplateJson(JSON.stringify({ format: 'gemsmap', version: 1 })).errors[0], /project/);
  assert.match(parseTemplateJson(JSON.stringify({ format: 'metmap', version: 1 })).errors[0], /project/);
  assert.match(parseTemplateJson(JSON.stringify({ ...builtin('tca'), schema_version: '2.0.0' })).errors[0], /not supported/);
  const f = builtin('tca');
  (f.biology.metabolites[0] as { compartment: unknown }).compartment = 'c';
  (f.biology.entities[0] as { identity: unknown }).identity = 'yes';
  const r = parseTemplateJson(JSON.stringify(f));
  assert.ok(r.file);
  assert.equal(r.file!.biology.metabolites[0].compartment, null);
  assert.equal(r.file!.biology.entities[0].identity.status, 'unresolved');
  assert.ok(r.warnings.length >= 2);
});

test('templates written as MetMap are read and get the current format tag', () => {
  const r = parseTemplateJson(JSON.stringify({ ...builtin('tca'), format: 'metmap-template' }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.file!.format, 'gemsmap-template');
});

// ------------------------------------------------------------ Test 1, 4, 5: open, export, import — lossless

test('opening a built-in in the designer and saving it back is lossless', () => {
  for (const f of BUILTIN_TEMPLATE_FILES) {
    const r = reconcile(f, fileToDoc(f));
    assert.equal(r.file, f, `${f.metadata.id}: reconcile must not change a consistent template`);
    assert.deepEqual(docToFile(r.file, r.doc), f, f.metadata.id);
  }
});

test('export → import keeps the template identical (biology, layout, identities)', () => {
  const f = builtin('glycolysis');
  const exported = JSON.stringify({ ...f, validation: { checked: 'x', errors: 0, warnings: 0, completeness: completeness(f) } });
  const back = parseTemplateJson(exported).file!;
  delete back.validation;
  assert.deepEqual(back, f);
  assert.deepEqual(fileToDoc(back), fileToDoc(f));
});

// ------------------------------------------------------------ Test 2, 3: edit, create, define identity (store + actions)

test('editing a metabolite and defining the identity of a new one (no GEM loaded)', () => {
  openInStore(builtin('glycolysis'));
  const s = () => useStore.getState();
  assert.equal(s().model, null);
  const glc = Object.values(s().doc.nodes).find((n) => n.label === 'glc_D')!;
  designActions.updateMetabolite(glc.design!.id, { label: 'Glucose' });
  assert.equal(s().doc.nodes[glc.id].label, 'Glucose');
  // a new node: unresolved template entity, drawn with the ○ status
  const id = s().actions.addNode({ x: 300, y: 0 }, { label: 'M99' });
  const node = s().doc.nodes[id];
  assert.equal(node.design?.kind, 'metabolite');
  assert.equal(node.design?.status, 'unresolved');
  // double-click → search → choose: confirmed, with database identities and a map label
  designActions.assignIdentity(node.design!.id, lib('citrate')); // not yet in this template: a new, user-confirmed entity
  const ent = current().biology.entities.find((e) => e.id === current().biology.metabolites.find((m) => m.id === node.design!.id)!.entity)!;
  assert.equal(ent.identity.status, 'confirmed');
  assert.equal(ent.identity.source, 'user');
  assert.ok(ent.identifiers['kegg.compound']?.length);
  assert.equal(s().doc.nodes[id].design?.status, 'confirmed');
  assert.notEqual(s().doc.nodes[id].label, 'M99');
  // a second compound choice reuses an existing entity of the template (same compound, one identity)
  const id2 = s().actions.addNode({ x: 300, y: 80 }, { label: 'M100' });
  designActions.assignIdentity(s().doc.nodes[id2].design!.id, lib('pyruvate'));
  const f = current();
  const pyrEntities = f.biology.entities.filter((e) => e.library === 'pyruvate');
  assert.equal(pyrEntities.length, 1);
  // undo goes back through the identity edits
  s().actions.undo();
  assert.equal(current().biology.metabolites.find((m) => m.id === s().doc.nodes[id2].design!.id)?.entity === pyrEntities[0].id, false);
});

test('drawing: a new arrow is a template reaction; a pasted arrow gets its own copy; reversing flips the cofactors', () => {
  openInStore(builtin('glycolysis'));
  const s = () => useStore.getState();
  const byLabel = (l: string) => Object.values(s().doc.nodes).find((n) => n.label === l)!;
  const hex = Object.values(s().doc.reactions).find((g) => g.label === 'HEX')!;
  s().actions.select([`node:${byLabel('glc_D').id}`, `node:${byLabel('g6p').id}`]);
  s().actions.copy();
  s().actions.paste();
  const f = current();
  const hexes = f.biology.reactions.filter((r) => r.name === 'HEX');
  assert.equal(hexes.length, 2, 'pasted arrow = its own template reaction');
  // pasted nodes are more instances of the same metabolites
  assert.equal(f.layout.nodes.filter((n) => n.metabolite === byLabel('g6p').design!.id).length, 2);
  // reverse HEX: substrates and products swap, side compounds (ATP/ADP) follow
  s().actions.reverseReaction(hex.id);
  const r = current().biology.reactions.find((x) => x.id === hex.design!.id)!;
  const name = (metId: string) => current().biology.entities.find((e) => e.id === current().biology.metabolites.find((m) => m.id === metId)!.entity)!.name;
  assert.deepEqual(r.participants.filter((p) => p.coefficient < 0).map((p) => name(p.metabolite)).sort(), ['ADP', 'D-Glucose 6-phosphate']);
  assert.deepEqual(validateTemplateFile(current()).filter((i) => i.code === 'unbalanced'), []);
  // a free arrow between two new nodes becomes an unresolved template reaction
  const a = s().actions.addNode({ x: 500, y: 0 }, { label: 'M1' });
  const b = s().actions.addNode({ x: 500, y: 80 }, { label: 'M2' });
  s().actions.addReaction([a], [b], {}, false);
  const nr = current().biology.reactions.at(-1)!;
  assert.equal(nr.identity.status, 'unresolved');
  assert.equal(nr.participants.length, 2);
  // deleting a node drops its arrows and the biology nobody uses any more
  s().actions.select([`node:${a}`]);
  s().actions.deleteSelection();
  assert.ok(!current().biology.reactions.some((x) => x.id === nr.id));
});

// ------------------------------------------------------------ Test 8 + 6: a template made without a GEM maps onto two namespaces

function userGlycolysisFragment(): TemplateFile {
  // drawn from scratch: four nodes, three arrows, identities chosen from the library search
  let f = emptyTemplate('My lower glycolysis', 'test');
  let doc: VisualDoc = emptyDoc();
  const names = ['3-phosphoglycerate', '2-phosphoglycerate', 'phosphoenolpyruvate', 'pyruvate'];
  names.forEach((n, i) => { doc.nodes[`tpl_node_00${i + 1}`] = { id: `tpl_node_00${i + 1}`, x: 0, y: i * 60, label: `M${i + 1}` }; });
  for (let i = 0; i < 3; i++) doc.reactions[`r${i}`] = { id: `r${i}`, sources: [`tpl_node_00${i + 1}`], targets: [`tpl_node_00${i + 2}`], routing: 'straight', label: ['PGM', 'ENO', 'PYK'][i] };
  ({ file: f, doc } = reconcile(f, doc));
  const ents = f.biology.metabolites.map((m) => m.entity);
  f = { ...f, biology: { ...f.biology, entities: f.biology.entities.map((e) => confirmCandidate(e, lib(names[ents.indexOf(e.id)]))) } };
  return docToFile(reconcile(f, doc).file, doc);
}

test('Test 8: a template drawn without any GEM is valid and fully identified', () => {
  const f = userGlycolysisFragment();
  assert.equal(f.biology.metabolites.length, 4);
  assert.equal(f.biology.reactions.length, 3);
  assert.ok(f.biology.metabolites.every((m) => m.compartment === 'cytosol'));
  assert.equal(completeness(f).metabolitesIdentified, 4);
  assert.deepEqual(validateTemplateFile(f).filter((i) => i.severity === 'error'), []);
  // the file holds identities, never model IDs
  assert.ok(!JSON.stringify(f).includes('_c"'));
});

test('Test 6: the same template maps a BiGG and a ModelSEED model to the same biology', { skip: !(core && seed) && FIXTURES_MSG }, () => {
  const spec = compileTemplate(userGlycolysisFragment());
  const a = mapTemplate(spec, core!), b = mapTemplate(spec, seed!);
  for (const s of spec.biology.slots) {
    const ma = a.slots.find((x) => x.slot.slot === s.slot)!, mb = b.slots.find((x) => x.slot.slot === s.slot)!;
    assert.ok(isMapped(ma.status) && isMapped(mb.status), `${s.slot}: ${ma.status} / ${mb.status}`);
    assert.equal(seed!.metabolites[mb.chosen!.metId].name.toLowerCase(), core!.metabolites[ma.chosen!.metId].name.toLowerCase());
  }
  assert.match(a.slots[0].chosen!.metId, /^3pg_c$/);
  assert.match(b.slots[0].chosen!.metId, /^cpd00169/);
  assert.equal(a.coverage.coreReactionsMapped, 3);
  // an exported + re-imported built-in maps exactly like the bundled one
  const copy = parseTemplateJson(JSON.stringify(builtin('glycolysis'))).file!;
  assert.deepEqual(mappedIds(compileTemplate(copy), core!), mappedIds(GLYCOLYSIS, core!));
});

test('drawing several instances of one metabolite: one mapping, every instance bound', { skip: !core && FIXTURES_MSG }, () => {
  const f = builtin('glycolysis');
  const pyr = f.layout.nodes.find((n) => f.biology.metabolites.find((m) => m.id === n.metabolite)?.aliases?.includes('pyr'))!;
  f.layout.nodes.push({ ...pyr, id: 'tpl_node_099', x: pyr.x + 200 });
  const spec = compileTemplate(f);
  const res = mapTemplate(spec, core!);
  const out = addPathwayToDoc(emptyDoc(), spec, res, { x: 0, y: 0 }, core!, (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`, (v) => v);
  const pyrNodes = Object.values(out.doc.nodes).filter((n) => n.metaboliteId === 'pyr_c');
  assert.equal(pyrNodes.length, 2);
  assert.equal(Object.keys(out.doc.nodes).length, f.layout.nodes.length);
});

// ------------------------------------------------------------ Test 7, 10: ambiguity, Auto Identify, human > machine

const cand = (name: string, kegg: string, score = 1): IdentityCandidate => ({ name, synonyms: [], identifiers: { 'kegg.compound': [kegg] }, sources: ['test'], score, match: 'test' });

test('Test 7: two plausible candidates make an identity ambiguous; choosing one confirms it', () => {
  const e = { id: 'e', name: 'glucose', synonyms: [], identifiers: {}, identity: { status: 'unresolved' as const } };
  const amb = suggestIdentity(e, [cand('D-Glucose', 'C00031', 1), cand('glucose', 'C00293', 0.95)], 'auto');
  assert.equal(amb.identity.status, 'ambiguous');
  assert.equal(amb.identity.candidates?.length, 2);
  assert.deepEqual(amb.identifiers, {}, 'an ambiguous identity has no identifiers yet');
  const chosen = confirmCandidate(amb, cand('D-Glucose', 'C00031'));
  assert.equal(chosen.identity.status, 'confirmed');
  // a weak partial match is never an identity
  assert.equal(suggestIdentity(e, [cand('Glucoselysine', 'C20978', 0.7)], 'auto').identity.status, 'unresolved');
});

test('human > machine: a confirmed identity is never changed; a disagreeing suggestion is a potential conflict', () => {
  const confirmed = confirmCandidate({ id: 'e', name: 'x', synonyms: [], identifiers: {}, identity: { status: 'unresolved' } }, cand('L-Malate', 'C00149'));
  const same = suggestIdentity(confirmed, [cand('L-malate', 'C00149')], 'ai');
  assert.equal(same, confirmed);
  const other = suggestIdentity(confirmed, [cand('D-Malate', 'C00497')], 'ai');
  assert.equal(other.identity.status, 'confirmed');
  assert.deepEqual(other.identifiers, confirmed.identifiers);
  assert.equal(other.identity.conflict?.name, 'D-Malate');
  assert.equal(other.identity.conflict?.source, 'ai');
  assert.ok(validateTemplateFile({ ...emptyTemplate(), biology: { ...emptyTemplate().biology, entities: [other] } }).some((i) => i.code === 'identity-conflict'));
});

test('Test 10: Auto Identify resolves names, flags the unknown and keeps confirmed identities', async () => {
  let f = emptyTemplate('auto');
  let doc: VisualDoc = emptyDoc();
  ['Pyruvate', 'glucose 6-phosphate', 'Unknown X', 'citrate'].forEach((l, i) => { doc.nodes[`n${i}`] = { id: `n${i}`, x: 0, y: i * 50, label: l }; });
  ({ file: f, doc } = reconcile(f, doc));
  // the user typed the identity by hand — with the KEGG ID of isocitrate by mistake
  const cit = f.biology.entities.find((e) => e.name === 'citrate')!;
  f = { ...f, biology: { ...f.biology, entities: f.biology.entities.map((e) => (e === cit ? confirmCandidate(e, cand('citrate', 'C00311')) : e)) } };
  const { file, summary } = await autoIdentify(f, async (q) => searchLibrary(q));
  assert.equal(summary.resolved, 2);
  assert.equal(summary.unresolved, 1);
  assert.equal(summary.keptConfirmed, 1);
  assert.equal(summary.conflicts, 1, 'the library says citrate is C00158: flagged as a potential conflict, not changed');
  const by = (n: string) => file.biology.entities.find((e) => e.synonyms.includes(n) || e.name === n)!;
  assert.equal(by('Pyruvate').identity.status, 'suggested');
  assert.deepEqual(by('Pyruvate').identifiers['kegg.compound'], ['C00022']);
  assert.equal(file.biology.entities.find((e) => e.name === 'Unknown X')!.identity.status, 'unresolved');
  assert.equal(file.biology.entities.find((e) => e.id === cit.id)!.identifiers['kegg.compound']![0], 'C00311');
});

// ------------------------------------------------------------ Test 9: duplicate

test('Test 9: duplicating a built-in makes an independent copy and leaves the original untouched', () => {
  const orig = BUILTIN_TEMPLATE_FILES.find((f) => f.metadata.id === 'tca')!;
  const before = JSON.stringify(orig);
  const copy = duplicateTemplate(orig, 'TCA Cycle — Aspergillus version');
  assert.notEqual(copy.metadata.id, 'tca');
  assert.deepEqual(copy.metadata.derived_from, { id: 'tca', name: orig.metadata.name, template_version: orig.metadata.template_version });
  copy.biology.compartments[0].fallback = [];
  copy.biology.metabolites[0].compartment = 'cytosol';
  assert.equal(JSON.stringify(orig), before);
  // stable element ids survive duplication (provenance on maps still points at the same nodes)
  assert.deepEqual(copy.biology.metabolites.map((m) => m.id), orig.biology.metabolites.map((m) => m.id));
});

// ------------------------------------------------------------ validation

test('the validator finds missing identities, duplicates, broken edges, imbalance and model IDs', () => {
  const f = builtin('glycolysis');
  const hex = f.biology.reactions.find((r) => r.name === 'HEX')!;
  hex.participants = hex.participants.filter((p) => p.main); // drop ATP / ADP
  f.biology.metabolites.push({ ...f.biology.metabolites[0], id: 'tpl_met_900', aliases: undefined }); // same entity + compartment twice
  f.biology.entities[1].identifiers = { ...f.biology.entities[1].identifiers, 'bigg.metabolite': ['g6p_c'] };
  f.biology.reactions.push({ ...structuredClone(f.biology.reactions[1]), id: 'tpl_rxn_900', aliases: undefined }); // duplicate PGI
  f.biology.reactions.push({ id: 'tpl_rxn_901', name: 'X', participants: [{ metabolite: 'tpl_met_nope', coefficient: -1, main: true }], reversible: null, ec: [], identifiers: {}, level: 'required', identity: { status: 'unresolved' } });
  f.biology.reactions[2].ec = ['1.1'];
  f.biology.entities.push({ id: 'tpl_ent_900', name: 'Mystery', synonyms: [], identifiers: {}, identity: { status: 'unresolved' } });
  f.biology.metabolites.push({ id: 'tpl_met_901', entity: 'tpl_ent_900', compartment: null, level: 'required' });
  const codes = new Set(validateTemplateFile(f).map((i) => i.code));
  for (const c of ['unbalanced', 'duplicate-metabolite', 'model-id', 'duplicate-reaction', 'broken-edge', 'no-products', 'invalid-identifier', 'missing-identity', 'missing-reaction-identity']) {
    assert.ok(codes.has(c), `${c} not reported: ${[...codes].join(', ')}`);
  }
});

test('profiles stay shared across templates: entity keys come from the library or a database identifier', () => {
  const f = builtin('ppp');
  assert.equal(entityKey(f.biology.entities[0], 'ppp'), 'D-glucose-6-phosphate');
  assert.equal(entityKey({ id: 'x', name: 'y', synonyms: [], identifiers: { chebi: ['CHEBI:15361'] }, identity: { status: 'confirmed' } }, 't'), 'chebi:CHEBI:15361');
  assert.equal(entityKey({ id: 'x', name: 'y', synonyms: [], identifiers: {}, identity: { status: 'unresolved' } }, 't'), 't/x');
});

test('models exported by BiGG: "__<model>__" prefixes are dropped so IDs are BiGG IDs', () => {
  const m = parseCobraJson(JSON.stringify({
    id: 'mini', compartments: { c: '' },
    metabolites: [{ id: '__mini__g6p_c', name: 'g6p', compartment: 'c' }, { id: 'f6p_c', name: 'f6p', compartment: 'c' }],
    reactions: [{ id: '__mini__PGI', metabolites: { '__mini__g6p_c': -1, f6p_c: 1 }, lower_bound: -1000, upper_bound: 1000 }, { id: 'EX___mini__g6p_c', metabolites: { '__mini__g6p_c': -1 } }],
  }));
  assert.deepEqual(Object.keys(m.metabolites).sort(), ['f6p_c', 'g6p_c']);
  assert.deepEqual(Object.keys(m.reactions).sort(), ['EX_g6p_c', 'PGI']);
  assert.deepEqual(m.reactions.PGI.stoichiometry, { g6p_c: -1, f6p_c: 1 });
  assert.equal(m.compartments.c, 'cytosol');
  // an ordinary model is untouched
  const plain = parseCobraJson(JSON.stringify({ id: 'x', metabolites: [{ id: '__x__a_c', name: 'a' }, { id: 'a_c', name: 'a' }], reactions: [] }));
  assert.ok(plain.metabolites.__x__a_c, 'no rename when it would create a duplicate');
});

// ------------------------------------------------------------ KEGG-derived templates (tools/kegg)

const KEGG_DERIVED = BUILTIN_TEMPLATE_FILES.filter((f) => f.metadata.source?.reference === 'KEGG');

test('KEGG-derived built-ins: valid, no warnings, AI-generated and never an official KEGG map', () => {
  assert.ok(KEGG_DERIVED.length >= 5, 'map00010, map00020, map00030, map00250 and the amino-acid overview');
  for (const f of KEGG_DERIVED) {
    const issues = validateTemplateFile(f);
    assert.deepEqual(issues.filter((i) => i.severity !== 'info').map((i) => i.message), [], f.metadata.id);
    assert.equal(f.metadata.review_status, 'ai-generated', f.metadata.id);
    assert.ok(f.metadata.source?.pathway_id && f.metadata.source.url, f.metadata.id);
    assert.ok(f.biology.entities.every((e) => e.provenance?.source === 'KEGG'), `${f.metadata.id}: provenance on every entity`);
    // identities a person has not confirmed stay suggestions
    assert.ok(f.biology.entities.every((e) => e.identity.status === 'confirmed' ? e.identity.source === 'builtin' : e.identity.status === 'suggested'), f.metadata.id);
    assert.ok(f.biology.entities.filter((e) => e.generic).every((e) => e.identity.confidence === 'probable'), `${f.metadata.id}: generic classes are never high-confidence`);
  }
});

test('KEGG-derived layouts: no overlapping labels, no crossings, no arrow through a label (app geometry)', () => {
  for (const f of KEGG_DERIVED) {
    const q = layoutQc(f);
    assert.deepEqual(q.issues.map((i) => i.message), [], f.metadata.id);
    assert.ok(q.elements.cofactors > 0, `${f.metadata.id}: cofactors drawn beside their arrows`);
  }
});

test('attached cofactors are drawings, not pathway slots; variants feed the matcher', () => {
  const f = builtin('kegg-map00010');
  const spec = compileTemplate(f);
  const drawn = new Set(f.layout.nodes.filter((n) => !n.attach).map((n) => n.metabolite));
  assert.equal(spec.biology.slots.length, drawn.size);
  assert.ok(!spec.biology.slots.some((s) => f.layout.nodes.some((n) => n.attach && n.metabolite === s.slot) && !drawn.has(s.slot)));
  // ATP is one entity drawn many times
  const atp = f.biology.metabolites.find((m) => f.biology.entities.find((e) => e.id === m.entity)?.identifiers['kegg.compound']?.includes('C00002'))!;
  assert.ok(f.layout.nodes.filter((n) => n.attach && n.metabolite === atp.id).length > 3);
  // PEPCK: the GTP / ITP variants add their EC numbers to the step
  const pepck = spec.biology.reactions.find((r) => r.name === 'PEPCK')!;
  assert.ok(pepck.ec?.includes('4.1.1.49') && pepck.ec.includes('4.1.1.32'), JSON.stringify(pepck.ec));
});

test('summary arrows (overview maps): a pathway is one arrow, identified by its KEGG module, never "unbalanced"', () => {
  const f = builtin('amino-acid-biosynthesis');
  assert.equal(f.metadata.section, 'Central carbon');
  const summaries = f.biology.reactions.filter((r) => r.summary);
  assert.ok(summaries.length >= 15);
  assert.ok(summaries.every((r) => r.provenance?.length && !Object.keys(r.identifiers).length));
  const issues = validateTemplateFile(f);
  assert.ok(!issues.some((i) => i.code === 'unbalanced' || i.code === 'missing-reaction-identity'));
  const c = completeness(f);
  assert.equal(c.reactionsIdentified, c.reactions);
});

test('compartments are optional: the person chooses them when mapping onto a GEM', () => {
  const f = builtin('kegg-map00020');
  assert.ok(f.biology.metabolites.every((m) => m.compartment === null));
  assert.ok(!validateTemplateFile(f).some((i) => i.code === 'missing-compartment'));
  assert.equal(completeness(f).overall, 1);
});

test('KEGG TCA (map00020) maps completely onto e_coli_core, cis-aconitate included', { skip: !core && FIXTURES_MSG }, () => {
  const r = mapTemplate(compileTemplate(builtin('kegg-map00020')), core!);
  assert.equal(r.coverage.allMapped, r.coverage.all);
  assert.equal(r.reactions.filter((x) => x.mapped).length, r.reactions.length);
  const ids = mappedIds(compileTemplate(builtin('kegg-map00020')), core!);
  assert.ok(Object.values(ids).includes('acon_C_c'));
});

test('appearance set in Template Design Mode is saved in the template and carried onto the map', () => {
  openInStore(builtin('glycolysis'));
  const a = useStore.getState().actions;
  const doc = useStore.getState().doc;
  const node = Object.values(doc.nodes).find((n) => n.design?.kind === 'metabolite' && !n.attach)!;
  const arrow = Object.values(doc.reactions).find((g) => g.design?.kind === 'reaction' && g.sources.length === 1 && g.targets.length === 1)!;
  a.updateNode(node.id, { labelPos: 'left', fill: '#2e7d32', r: 9 });
  a.updateReaction(arrow.id, { routing: 'curved', bend: 30, labelFlip: true });
  const f = current();
  const ln = f.layout.nodes.find((n) => n.id === node.id)!;
  assert.deepEqual([ln.label_pos, ln.fill, ln.r], ['left', '#2e7d32', 9]);
  const lr = f.layout.reactions.find((r) => r.reaction === arrow.design!.id)!;
  assert.deepEqual([lr.routing, lr.bend, lr.label_flip], ['curved', 30, true]);
  // a text-only node stays text-only
  a.updateNode(node.id, { shape: 'label', labelPos: undefined });
  assert.equal(current().layout.nodes.find((n) => n.id === node.id)!.shape, 'label');
  a.updateNode(node.id, { shape: 'circle', labelPos: 'left' });
  // inserted on a map, the node keeps its colour, radius and label side
  const g = current();
  const r = addPathwayToDoc(emptyDoc(), compileTemplate(g), null, { x: 0, y: 0 }, null, (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`, (v) => v);
  const placed = Object.values(r.doc.nodes).find((n) => n.fill === '#2e7d32');
  assert.ok(placed, 'fill carried onto the map');
  assert.deepEqual([placed!.labelPos, placed!.r], ['left', 9]);
});
