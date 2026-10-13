/**
 * Template Design Mode reuses the Map Builder editor. The editor's visual
 * document (VisualDoc) is the layout layer; the template file's biology is the
 * design layer next to it (EditorState.design). This module converts between
 * the two and keeps them consistent after every edit:
 *
 *   node glyph          = visual instance of a template metabolite (or a pathway port)
 *   reaction glyph      = the drawing of one template reaction (main participants)
 *   port glyph + line   = a pathway link (connector), never a biological reaction
 *
 * reconcile() runs inside every undoable commit: new nodes get an (unresolved)
 * entity, new arrows get a template reaction, pasted arrows get a copy of their
 * reaction, deleted drawings drop the biology nobody uses any more, and the
 * glyphs show their element's label and identity status.
 */
import { emptyDoc } from '../../store/project';
import type { NodeGlyph, PathwayGroup, ReactionGlyph, TextGlyph, VisualDoc } from '../../viz/types';
import { ID_PREFIX, nextId, type Participant, type TemplateConnector, type TemplateEntity, type TemplateFile, type TemplateMetabolite, type TemplateReaction, type ConceptualCompartment } from '../format/schema';

export const displayLabel = (m: TemplateMetabolite | undefined, e: TemplateEntity | undefined) => m?.label || e?.short || e?.name || m?.id || '?';
export const portLabel = (c: TemplateConnector | undefined) => (c ? `${c.direction === 'in' ? '← from' : '→'} ${c.target.pathway || 'pathway'}` : '→ pathway');
/** Placeholder labels given by the editor to new nodes (M1, M2 …): replaced by the identity's label once defined. */
export const isPlaceholderLabel = (s: string | undefined) => !s || /^M\d+$/.test(s) || s === 'New metabolite';

/** Compartment new metabolites get: the template's most used one. */
export function defaultCompartment(f: TemplateFile): ConceptualCompartment | null {
  const n = new Map<string, number>();
  for (const m of f.biology.metabolites) if (m.compartment) n.set(m.compartment, (n.get(m.compartment) ?? 0) + 1);
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as ConceptualCompartment | undefined;
  return top ?? f.biology.compartments[0]?.id ?? 'cytosol';
}

// ------------------------------------------------------------ file → doc

/** Group styles a template file leaves out (only differences are written). */
const GROUP_DEFAULTS = {
  pathway: { padding: 26, fill: 'none', stroke: 'none', dashed: false },
  compartment: { padding: 40, fill: '#f4f6fb', stroke: '#b9c2d6', dashed: true },
} as const;

export function fileToDoc(f: TemplateFile): VisualDoc {
  const doc = emptyDoc();
  doc.legend = { ...doc.legend, visible: false };
  const mets = new Map(f.biology.metabolites.map((m) => [m.id, m]));
  const ents = new Map(f.biology.entities.map((e) => [e.id, e]));
  for (const n of f.layout.nodes) {
    const m = mets.get(n.metabolite);
    const e = m && ents.get(m.entity);
    doc.nodes[n.id] = {
      id: n.id, x: n.x, y: n.y, labelPos: n.label_pos, ...(n.shape ? { shape: n.shape } : {}), ...(n.r ? { r: n.r } : {}), ...(n.fill ? { fill: n.fill } : {}),
      label: displayLabel(m, e), role: m?.role, design: { kind: 'metabolite', id: n.metabolite, status: e?.identity.status ?? 'unresolved', conflict: !!e?.identity.conflict },
      ...(n.attach ? { attach: { glyph: `rg_${n.attach.reaction}`, side: n.attach.side }, shape: 'label' as const } : {}),
    };
  }
  for (const p of f.layout.ports) {
    const c = f.biology.connectors.find((x) => x.id === p.connector);
    doc.nodes[p.id] = { id: p.id, x: p.x, y: p.y, shape: 'label', label: portLabel(c), design: { kind: 'port', id: p.connector } };
    if (doc.nodes[p.from]) {
      const out = c?.direction !== 'in';
      doc.reactions[`lnk_${p.id}`] = { id: `lnk_${p.id}`, sources: [out ? p.from : p.id], targets: [out ? p.id : p.from], routing: 'straight', role: 'exchange', design: { kind: 'link', id: p.connector } };
    }
  }
  const rx = new Map(f.biology.reactions.map((r) => [r.id, r]));
  for (const lr of f.layout.reactions) {
    const r = rx.get(lr.reaction);
    if (!r || ![...lr.sources, ...lr.targets].every((x) => doc.nodes[x])) continue;
    const id = `rg_${lr.reaction}`;
    doc.reactions[id] = {
      id, sources: lr.sources, targets: lr.targets, routing: lr.routing, ...(lr.bend != null ? { bend: lr.bend } : {}),
      ...(lr.label_offset ? { labelOffset: lr.label_offset } : {}), ...(lr.label_angle != null ? { labelAngle: lr.label_angle } : {}), ...(lr.label_flip ? { labelFlip: true } : {}),
      label: r.name, ec: r.ec, design: { kind: 'reaction', id: r.id, status: r.identity.status, reversible: r.reversible },
    };
  }
  for (const g of f.layout.groups) {
    const d = GROUP_DEFAULTS[g.kind];
    doc.groups[g.id] = {
      id: g.id, kind: g.kind, title: g.title, ...(g.subtitle ? { subtitle: g.subtitle } : {}), nodeIds: g.nodes.filter((x) => doc.nodes[x]),
      padding: g.padding ?? d.padding, fill: g.fill ?? d.fill, stroke: g.stroke ?? d.stroke, dashed: g.dashed ?? d.dashed,
    };
  }
  for (const l of f.layout.labels) doc.texts[l.id] = { ...l };
  return doc;
}

// ------------------------------------------------------------ doc → file

/** The template file of the current design: biology from the design layer, layout from the drawing. */
export function docToFile(f: TemplateFile, doc: VisualDoc): TemplateFile {
  const nodes: TemplateFile['layout']['nodes'] = [];
  const ports: TemplateFile['layout']['ports'] = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.design?.kind !== 'metabolite') continue;
    const att = n.attach && doc.reactions[n.attach.glyph]?.design;
    nodes.push({
      id: n.id, metabolite: n.design.id, x: n.x, y: n.y, ...(n.labelPos ? { label_pos: n.labelPos } : {}), ...(n.fill && !att ? { fill: n.fill } : {}),
      ...(n.shape && n.shape !== 'circle' && !att ? { shape: n.shape } : {}), ...(n.r ? { r: n.r } : {}),
      ...(att?.kind === 'reaction' ? { attach: { reaction: att.id, side: n.attach!.side } } : {}),
    });
  }
  const instanceOf = new Map(nodes.filter((n) => !n.attach).map((n) => [n.id, n.metabolite]));
  for (const n of Object.values(doc.nodes)) {
    if (n.design?.kind !== 'port') continue;
    const c = f.biology.connectors.find((x) => x.id === n.design!.id);
    const link = Object.values(doc.reactions).find((g) => g.design?.kind === 'link' && (g.sources.includes(n.id) || g.targets.includes(n.id)));
    const from = link ? [...link.sources, ...link.targets].find((x) => x !== n.id && instanceOf.has(x)) : undefined;
    const fallback = nodes.find((x) => x.metabolite === c?.metabolite)?.id;
    if (from ?? fallback) ports.push({ id: n.id, connector: n.design.id, x: n.x, y: n.y, from: (from ?? fallback)! });
  }
  const reactions: TemplateFile['layout']['reactions'] = Object.values(doc.reactions).filter((g) => g.design?.kind === 'reaction').map((g) => ({
    reaction: g.design!.id, sources: g.sources, targets: g.targets, routing: g.routing, ...(g.bend != null ? { bend: g.bend } : {}),
    ...(g.labelOffset ? { label_offset: g.labelOffset } : {}), ...(g.labelAngle != null ? { label_angle: g.labelAngle } : {}), ...(g.labelFlip ? { label_flip: true } : {}),
  }));
  const groups: TemplateFile['layout']['groups'] = Object.values(doc.groups).map((g: PathwayGroup) => {
    const d = GROUP_DEFAULTS[g.kind];
    return {
      id: g.id, kind: g.kind, title: g.title, ...(g.subtitle ? { subtitle: g.subtitle } : {}), nodes: g.nodeIds.filter((x) => instanceOf.has(x)),
      ...(g.padding !== d.padding ? { padding: g.padding } : {}), ...(g.fill !== d.fill ? { fill: g.fill } : {}),
      ...(g.stroke !== d.stroke ? { stroke: g.stroke } : {}), ...(g.dashed !== d.dashed ? { dashed: g.dashed } : {}),
    };
  });
  const labels: TemplateFile['layout']['labels'] = Object.values(doc.texts).map((t: TextGlyph) => ({
    id: t.id, x: t.x, y: t.y, text: t.text, size: t.size, weight: t.weight, ...(t.italic ? { italic: true } : {}), ...(t.color ? { color: t.color } : {}), kind: t.kind, ...(t.rotate ? { rotate: t.rotate } : {}),
  }));
  return { ...f, layout: { nodes, ports, reactions, groups, labels } };
}

// ------------------------------------------------------------ reconcile

const sameParticipants = (a: Participant[], b: Participant[]) =>
  a.length === b.length && a.every((p, i) => p.metabolite === b[i].metabolite && p.coefficient === b[i].coefficient && p.main === b[i].main);

/**
 * Bring biology and drawing back in line after an edit. Returns the same objects
 * when nothing changed (glyphs that did not change keep their identity for memoised rendering).
 * `prev` is the drawing before the edit: a pathway link is removed when its port was deleted;
 * links that were never drawn (biology only) are kept.
 */
export function reconcile(file: TemplateFile, doc: VisualDoc, prev?: VisualDoc): { file: TemplateFile; doc: VisualDoc } {
  const ents = new Map(file.biology.entities.map((e) => [e.id, e]));
  const mets = new Map(file.biology.metabolites.map((m) => [m.id, m]));
  const rxns = new Map(file.biology.reactions.map((r) => [r.id, r]));
  const conns = new Map(file.biology.connectors.map((c) => [c.id, c]));
  let bioChanged = false;
  const nodes: Record<string, NodeGlyph> = { ...doc.nodes };
  const reactions: Record<string, ReactionGlyph> = { ...doc.reactions };
  let docChanged = false;
  const comp = defaultCompartment(file);

  // ---- nodes: every node is an instance of a metabolite, or a port; attached cofactors live with their arrow
  const claimedPorts = new Set<string>();
  for (const n of Object.values(doc.nodes)) {
    if (n.attach && doc.reactions[n.attach.glyph]?.design?.kind !== 'reaction') {
      delete nodes[n.id];
      docChanged = true;
      continue;
    }
    if (n.design?.kind === 'port') {
      let c = conns.get(n.design.id);
      if (!c || claimedPorts.has(c.id)) {
        // a pasted port: its own copy of the link
        const id = nextId(conns.keys(), ID_PREFIX.connector);
        c = { ...(c ?? { metabolite: '', direction: 'out', target: { pathway: '' } }), id };
        conns.set(id, c);
        nodes[n.id] = { ...n, design: { kind: 'port', id } };
        bioChanged = docChanged = true;
      }
      claimedPorts.add(c.id);
      continue;
    }
    if (n.design?.kind === 'metabolite' && mets.has(n.design.id)) continue;
    const eid = nextId(ents.keys(), ID_PREFIX.entity);
    const name = n.label && !/^M\d+$/.test(n.label) ? n.label : 'New metabolite';
    ents.set(eid, { id: eid, name, synonyms: [], identifiers: {}, identity: { status: 'unresolved' } });
    const mid = nextId(mets.keys(), ID_PREFIX.metabolite);
    mets.set(mid, { id: mid, entity: eid, compartment: comp, level: 'required', ...(n.label ? { label: n.label } : {}) });
    nodes[n.id] = { ...n, design: { kind: 'metabolite', id: mid, status: 'unresolved' } };
    bioChanged = docChanged = true;
  }
  const metOfNode = (id: string) => (nodes[id]?.design?.kind === 'metabolite' && !nodes[id].attach ? nodes[id].design!.id : undefined);
  const isPort = (id: string) => nodes[id]?.design?.kind === 'port';

  // ---- arrows: pathway links, or template reactions
  const claimed = new Set<string>();
  for (const g of Object.values(doc.reactions)) {
    const ends = [...g.sources, ...g.targets];
    const portEnd = ends.find(isPort);
    if (portEnd) {
      const cid = nodes[portEnd].design!.id;
      const c = conns.get(cid)!;
      const other = ends.map(metOfNode).find(Boolean);
      const direction: 'in' | 'out' = g.targets.includes(portEnd) ? 'out' : 'in';
      if (c && ((other && c.metabolite !== other) || c.direction !== direction)) { conns.set(cid, { ...c, metabolite: other ?? c.metabolite, direction }); bioChanged = true; }
      if (g.design?.kind !== 'link' || g.design.id !== cid || g.role !== 'exchange') { reactions[g.id] = { ...g, role: 'exchange', design: { kind: 'link', id: cid } }; docChanged = true; }
      continue;
    }
    const mainSubs = [...new Set(g.sources.map(metOfNode).filter((x): x is string => !!x))];
    const mainProds = [...new Set(g.targets.map(metOfNode).filter((x): x is string => !!x))].filter((x) => !mainSubs.includes(x));
    let r = g.design?.kind === 'reaction' ? rxns.get(g.design.id) : undefined;
    if (!r || claimed.has(r.id)) {
      // a new arrow, or a pasted copy of a drawn reaction: its own template reaction
      const id = nextId(rxns.keys(), ID_PREFIX.reaction);
      const base: TemplateReaction = r
        ? { ...structuredClone(r), id, aliases: undefined }
        : { id, name: g.label || `R${rxns.size + 1}`, participants: [], reversible: null, ec: [], identifiers: {}, level: 'required', identity: { status: 'unresolved' } };
      r = base;
      rxns.set(id, r);
      bioChanged = true;
    }
    claimed.add(r.id);
    // main participants follow the drawing; side participants (cofactors) are kept, and flip when the arrow is reversed
    const old = r.participants;
    const oldSubs = old.filter((p) => p.main && p.coefficient < 0).map((p) => p.metabolite);
    const oldProds = old.filter((p) => p.main && p.coefficient > 0).map((p) => p.metabolite);
    const flipped = oldSubs.length > 0 && oldProds.length > 0 && oldSubs.every((x) => mainProds.includes(x)) && oldProds.every((x) => mainSubs.includes(x)) && !oldSubs.some((x) => mainSubs.includes(x));
    const coef = (m: string, sign: -1 | 1) => { const p = old.find((x) => x.main && x.metabolite === m); return p ? sign * Math.abs(p.coefficient) : sign; };
    const participants: Participant[] = [
      ...mainSubs.map((m) => ({ metabolite: m, coefficient: coef(m, -1), main: true })),
      ...old.filter((p) => !p.main && p.coefficient < 0 !== flipped).map((p) => ({ ...p, coefficient: flipped ? -p.coefficient : p.coefficient })),
      ...mainProds.map((m) => ({ metabolite: m, coefficient: coef(m, 1), main: true })),
      ...old.filter((p) => !p.main && p.coefficient > 0 !== flipped).map((p) => ({ ...p, coefficient: flipped ? -p.coefficient : p.coefficient })),
    ].filter((p, i, arr) => p.main || !arr.slice(0, i).some((q) => q.metabolite === p.metabolite && Math.sign(q.coefficient) === Math.sign(p.coefficient)));
    if (!sameParticipants(old, participants)) { r = { ...r, participants }; rxns.set(r.id, r); bioChanged = true; }
    const status = r.identity.status;
    if (g.design?.kind !== 'reaction' || g.design.id !== r.id || g.design.status !== status || g.label !== r.name || g.role === 'exchange' || g.design.reversible !== r.reversible) {
      reactions[g.id] = { ...g, label: r.name, ec: r.ec, role: undefined, design: { kind: 'reaction', id: r.id, status, reversible: r.reversible } };
      docChanged = true;
    }
  }

  // ---- drop biology nobody draws or uses
  for (const id of [...rxns.keys()]) if (!claimed.has(id)) { rxns.delete(id); bioChanged = true; }
  const hadPort = new Set(Object.values(prev?.nodes ?? {}).filter((n) => n.design?.kind === 'port').map((n) => n.design!.id));
  for (const id of [...conns.keys()]) if (!claimedPorts.has(id) && hadPort.has(id)) { conns.delete(id); bioChanged = true; }
  const used = new Set<string>();
  for (const n of Object.values(nodes)) if (n.design?.kind === 'metabolite') used.add(n.design.id);
  for (const r of rxns.values()) for (const p of r.participants) used.add(p.metabolite);
  for (const c of conns.values()) used.add(c.metabolite);
  for (const id of [...mets.keys()]) if (!used.has(id)) { mets.delete(id); bioChanged = true; }
  const usedEnt = new Set<string>();
  for (const m of mets.values()) { usedEnt.add(m.entity); for (const a of m.alternatives ?? []) usedEnt.add(a); }
  for (const id of [...ents.keys()]) if (!usedEnt.has(id)) { ents.delete(id); bioChanged = true; }

  // ---- glyphs show their element's label and identity status
  for (const n of Object.values(nodes)) {
    if (n.design?.kind === 'metabolite') {
      const m = mets.get(n.design.id);
      const e = m && ents.get(m.entity);
      const label = displayLabel(m, e), status = e?.identity.status ?? 'unresolved', conflict = !!e?.identity.conflict;
      if (n.label !== label || n.design.status !== status || !!n.design.conflict !== conflict || n.role !== m?.role) {
        nodes[n.id] = { ...n, label, role: m?.role, design: { ...n.design, status, conflict } };
        docChanged = true;
      }
    } else if (n.design?.kind === 'port') {
      const label = portLabel(conns.get(n.design.id));
      if (n.label !== label || n.shape !== 'label') { nodes[n.id] = { ...n, label, shape: 'label' }; docChanged = true; }
    }
  }

  const outFile = bioChanged
    ? { ...file, biology: { ...file.biology, entities: [...ents.values()], metabolites: [...mets.values()], reactions: [...rxns.values()], connectors: [...conns.values()] } }
    : file;
  return { file: outFile, doc: docChanged ? { ...doc, nodes, reactions } : doc };
}
