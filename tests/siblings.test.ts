/**
 * Compartment siblings: the same compound in other compartments, used to apply one identity choice to
 * all of them (COBRAGUI metabolite analysis, Map Builder template mapping).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compartmentSiblings, compoundBase } from '../src/model/siblings';
import type { MetabolicModel } from '../src/model/types';
import { emptyDoc } from '../src/store/project';
import { useStore } from '../src/store/store';
import { siblingsByCompartment, withSiblingEntries } from '../src/templates/mapping/siblings';
import type { VisualDoc } from '../src/viz/types';

test('base id without the compartment affix, in the usual id styles', () => {
  assert.equal(compoundBase('pyr_c', 'c'), 'pyr');
  assert.equal(compoundBase('M_glc__D_e', 'e'), 'glc__D');
  assert.equal(compoundBase('cpd00020_c0', 'c0'), 'cpd00020');
  assert.equal(compoundBase('pyr[m]', 'm'), 'pyr');
  assert.equal(compoundBase('glc__D_c', 'C_c'), 'glc__D');
  assert.equal(compoundBase('s_1399', 'c'), null);
  assert.equal(compoundBase('pyr_c', 'm'), null); // affix does not match its own compartment
});

test('siblings group the same compound across compartments, conservatively', () => {
  const s = compartmentSiblings([
    { id: 'pyr_c', name: 'Pyruvate', compartment: 'c' },
    { id: 'pyr_m', name: 'Pyruvate', compartment: 'm' },
    { id: 'pyr_e', name: '', compartment: 'e' },
    // same base id, different compound: not grouped
    { id: 'x_c', name: 'Xylose', compartment: 'c' },
    { id: 'x_e', name: 'Xanthine', compartment: 'e' },
    // two of them in one compartment: ambiguous, not grouped
    { id: 's_1', name: 'glucose [cytoplasm]', compartment: 'c' },
    { id: 's_2', name: 'glucose [cytoplasm]', compartment: 'c' },
    // numbered ids: grouped by the name without its compartment tag
    { id: 's_10', name: 'citrate [cytoplasm]', compartment: 'c' },
    { id: 's_11', name: 'citrate [mitochondrion]', compartment: 'm' },
  ]);
  assert.deepEqual(s.get('pyr_c'), ['pyr_m', 'pyr_e']);
  assert.deepEqual(s.get('pyr_e'), ['pyr_c', 'pyr_m']);
  assert.equal(s.get('x_c'), undefined);
  assert.equal(s.get('s_1'), undefined);
  assert.deepEqual(s.get('s_10'), ['s_11']);
});

const met = (id: string, name: string, compartment: string) => ({ id, name, compartment });
const model: MetabolicModel = {
  id: 'sib', name: 'sib model', reactions: {}, genes: {},
  compartments: { c: 'cytosol', m: 'mitochondria', e: 'extracellular' },
  metabolites: Object.fromEntries([met('pyr_c', 'Pyruvate', 'c'), met('pyr_m', 'Pyruvate', 'm'), met('pyr_e', 'Pyruvate', 'e'), met('oaa_m', 'Oxaloacetate', 'm')].map((m) => [m.id, m])),
};

test('siblings by canonical compartment, and profile entries that never replace explicit ones', () => {
  const by = siblingsByCompartment(model, 'pyr_c');
  assert.equal(by.get('MITOCHONDRION'), 'pyr_m');
  assert.equal(by.get('EXTRACELLULAR'), 'pyr_e');
  const base = { fingerprint: 'f', modelId: 'sib', modelName: 'sib', updated: '', entries: {
    'pyruvate@EXTRACELLULAR': { entity: 'pyruvate', compartment: 'EXTRACELLULAR' as const, metaboliteId: null, templateId: 't', templateVersion: '1', confirmedAt: '' },
  } };
  const r = withSiblingEntries(base, model, { entity: 'pyruvate', compartment: 'CYTOSOL', metaboliteId: 'pyr_c', templateId: 't', templateVersion: '1' });
  assert.deepEqual(r.added, [{ compartment: 'MITOCHONDRION', metaboliteId: 'pyr_m' }]);
  assert.equal(r.profile.entries['pyruvate@MITOCHONDRION'].via, 'pyr_c');
  assert.equal(r.profile.entries['pyruvate@EXTRACELLULAR'].metaboliteId, null); // the user's "absent" stays
});

test('Map Builder: choosing a node also maps the same entity drawn in another compartment', () => {
  const tpl = (slot: string, compartment: string, status: 'unresolved' | 'auto_high' = 'unresolved') =>
    ({ templateId: 't', templateVersion: '1', slot, entity: 'pyruvate', compartment, status });
  const doc: VisualDoc = {
    ...emptyDoc(),
    nodes: {
      a: { id: 'a', x: 0, y: 0, template: tpl('pyr', 'CYTOSOL') },
      b: { id: 'b', x: 100, y: 0, template: tpl('pyr_mito', 'MITOCHONDRION') },
      c: { id: 'c', x: 200, y: 0, metaboliteId: 'oaa_m', template: { ...tpl('pyr_out', 'EXTRACELLULAR', 'auto_high') } },
    },
  };
  useStore.setState({ doc, model, selection: [], past: [], future: [] });
  useStore.getState().actions.setTemplateMapping('a', 'pyr_c');
  const n = useStore.getState().doc.nodes;
  assert.equal(n.a.metaboliteId, 'pyr_c');
  assert.equal(n.b.metaboliteId, 'pyr_m');
  assert.equal(n.b.template?.status, 'confirmed');
  assert.equal(n.c.metaboliteId, 'oaa_m'); // mapped with high confidence before: left alone
  // one undo step reverts both
  useStore.getState().actions.undo();
  assert.equal(useStore.getState().doc.nodes.b.metaboliteId, undefined);
});
