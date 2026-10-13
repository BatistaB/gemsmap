/**
 * Inserting a pathway on the map: placement preview (click to place), everything inserted selected so it moves
 * as one piece, and cofactors drawn beside an arrow following that arrow.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDoc } from '../src/store/project';
import { key, parseKey, useStore } from '../src/store/store';
import { compileTemplate } from '../src/templates/format/compile';
import { BUILTIN_TEMPLATE_FILES } from '../src/templates/pathways';
import { arrowMid, followAttached } from '../src/viz/attached';
import type { VisualDoc } from '../src/viz/types';

const spec = (id: string) => compileTemplate(BUILTIN_TEMPLATE_FILES.find((f) => f.metadata.id === id)!);
const fresh = () => useStore.setState({ doc: emptyDoc(), selection: [], placing: null, model: null, design: null, past: [], future: [] });

test('cofactors drawn beside an arrow follow it; a cofactor moved on purpose keeps its place', () => {
  const doc: VisualDoc = {
    ...emptyDoc(),
    nodes: {
      a: { id: 'a', x: 0, y: 0, label: 'A' }, b: { id: 'b', x: 0, y: 100, label: 'B' },
      c: { id: 'c', x: 20, y: 40, label: 'ATP', shape: 'label', attach: { glyph: 'r', side: 'in' } },
    },
    reactions: { r: { id: 'r', sources: ['a'], targets: ['b'], routing: 'straight' } },
  };
  // both ends moved: the cofactor moves by the same amount
  const moved = followAttached(doc, { ...doc, nodes: { ...doc.nodes, a: { ...doc.nodes.a, x: 50, y: 10 }, b: { ...doc.nodes.b, x: 50, y: 110 } } });
  assert.deepEqual([moved.nodes.c.x, moved.nodes.c.y], [70, 50]);
  // one end moved: the cofactor follows the middle of the arrow
  const half = followAttached(doc, { ...doc, nodes: { ...doc.nodes, b: { ...doc.nodes.b, y: 200 } } });
  assert.deepEqual([half.nodes.c.x, half.nodes.c.y], [20, 90]);
  assert.deepEqual(arrowMid(half.reactions.r, half.nodes), { x: 0, y: 100 });
  // the cofactor was selected and dragged with the rest: no double move
  const both = followAttached(doc, { ...doc, nodes: { ...doc.nodes, a: { ...doc.nodes.a, x: 50 }, b: { ...doc.nodes.b, x: 50 }, c: { ...doc.nodes.c, x: 70 } } });
  assert.equal(both.nodes.c.x, 70);
  // nothing moved: the same document comes back
  assert.equal(followAttached(doc, { ...doc }).nodes, doc.nodes);
});

test('a pathway is placed with the mouse: preview first, inserted on click, nothing before', () => {
  fresh();
  const a = useStore.getState().actions;
  a.instantiatePathway(spec('kegg-map00020'), null);
  const s1 = useStore.getState();
  assert.ok(s1.placing && s1.placing.kind === 'pathway');
  assert.equal(Object.keys(s1.doc.nodes).length, 0, 'nothing inserted while placing');
  assert.ok(Object.keys(s1.placing.preview.nodes).length > 10 && Object.keys(s1.placing.preview.texts).length > 0);
  a.placeAt({ x: 1000, y: 800 });
  const s2 = useStore.getState();
  assert.equal(s2.placing, null);
  const ns = Object.values(s2.doc.nodes);
  assert.ok(ns.length > 10);
  // centred where the click was
  const cx = (Math.min(...ns.map((n) => n.x)) + Math.max(...ns.map((n) => n.x))) / 2;
  assert.ok(Math.abs(cx - 1000) < 200, String(cx));
  // undo removes it in one step
  a.undo();
  assert.equal(Object.keys(useStore.getState().doc.nodes).length, 0);
});

test('everything inserted is selected — texts and cofactors move with the pathway', () => {
  fresh();
  const a = useStore.getState().actions;
  a.instantiatePathway(spec('kegg-map00020'), null, { x: 0, y: 0 });
  const s = useStore.getState();
  const texts = Object.keys(s.doc.texts);
  const cofs = Object.values(s.doc.nodes).filter((n) => n.attach).map((n) => n.id);
  assert.ok(texts.length > 0 && cofs.length > 0);
  for (const t of texts) assert.ok(s.selection.includes(key('text', t)), `text ${t} selected`);
  for (const c of cofs) assert.ok(s.selection.includes(key('node', c)), `cofactor ${c} selected`);
  // drag the selection: every element moves by the same amount
  const start: Record<string, { x: number; y: number }> = {};
  for (const k of s.selection) {
    const [kind, id] = parseKey(k);
    const p = kind === 'text' ? s.doc.texts[id] : s.doc.nodes[id];
    if (p) start[k] = { x: p.x, y: p.y };
  }
  a.moveFrom(start, 300, 120);
  const d = useStore.getState().doc;
  for (const t of texts) assert.deepEqual([d.texts[t].x - s.doc.texts[t].x, d.texts[t].y - s.doc.texts[t].y], [300, 120]);
  for (const c of cofs) assert.deepEqual([d.nodes[c].x - s.doc.nodes[c].x, d.nodes[c].y - s.doc.nodes[c].y], [300, 120]);
});

test('dragging only the metabolites still brings their cofactors along', () => {
  fresh();
  const a = useStore.getState().actions;
  a.instantiatePathway(spec('kegg-map00020'), null, { x: 0, y: 0 });
  const s = useStore.getState();
  const start: Record<string, { x: number; y: number }> = {};
  for (const n of Object.values(s.doc.nodes)) if (!n.attach) start[key('node', n.id)] = { x: n.x, y: n.y };
  a.moveFrom(start, -80, 40);
  const d = useStore.getState().doc;
  for (const n of Object.values(s.doc.nodes).filter((x) => x.attach)) {
    assert.deepEqual([+(d.nodes[n.id].x - n.x).toFixed(1), +(d.nodes[n.id].y - n.y).toFixed(1)], [-80, 40], n.label);
  }
});

test('simple templates are placed the same way; Esc-style cancel leaves the map untouched', () => {
  fresh();
  const a = useStore.getState().actions;
  const t = { id: 'chain', name: 'Chain', description: '', category: 'shape' as const,
    nodes: [{ key: 'a', x: 0, y: 0, label: 'A' }, { key: 'b', x: 0, y: 80, label: 'B' }], reactions: [{ sources: ['a'], targets: ['b'] }],
    texts: [{ x: -40, y: -30, text: 'Title', size: 12, weight: 600 as const, kind: 'text' as const }] };
  a.instantiateTemplate(t);
  assert.equal(useStore.getState().placing?.kind, 'template');
  a.cancelPlacing();
  assert.equal(useStore.getState().placing, null);
  assert.equal(Object.keys(useStore.getState().doc.nodes).length, 0);
  a.instantiateTemplate(t);
  a.placeAt({ x: 500, y: 500 });
  const s = useStore.getState();
  assert.equal(Object.keys(s.doc.nodes).length, 2);
  assert.ok(s.selection.some((k) => k.startsWith('text:')), 'the title is selected with the nodes');
});
