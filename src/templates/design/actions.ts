/**
 * Template Design Mode editing actions. Each one is a single undoable commit of
 * the editor store; the commit reconciles biology and drawing (convert.ts).
 */
import { uid } from '../../store/project';
import { key, useStore } from '../../store/store';
import type { Point } from '../../viz/types';
import { autoIdentify, confirmCandidate, confirmEntity, confirmReactionCandidate, sameCompound, type AutoIdentifySummary, type IdentityCandidate, type ReactionCandidate } from '../format/identity';
import {
  ID_PREFIX, nextId, type ConceptualCompartment, type IdentitySource, type TemplateCompartment, type TemplateConnector, type TemplateEntity, type TemplateFile, type TemplateMetabolite, type TemplateMetadata, type TemplateReaction,
} from '../format/schema';
import { isPlaceholderLabel } from './convert';
import type { BiggIds } from './bigg';
import type { IdentifierTable } from '../format/schema';

/** Union of two identifier tables (nothing removed). */
const unionIds = (a: IdentifierTable, b: IdentifierTable = {}): IdentifierTable => {
  const out: IdentifierTable = { ...a };
  for (const [ns, vs] of Object.entries(b) as [keyof IdentifierTable, string[]][]) out[ns] = [...new Set([...(out[ns] ?? []), ...(vs ?? [])])];
  return out;
};

export interface BiggIdSummary { added: number; known: number; several: number; none: number; review: string[] }

const design = () => useStore.getState().design;
const commit = (fn: (f: TemplateFile) => TemplateFile) => {
  if (!design()) return;
  useStore.getState().actions.commit((s) => ({ design: fn(s.design!) }));
};
const mapBio = (f: TemplateFile, p: Partial<TemplateFile['biology']>): TemplateFile => ({ ...f, biology: { ...f.biology, ...p } });
const replace = <T extends { id: string }>(xs: T[], id: string, fn: (x: T) => T) => xs.map((x) => (x.id === id ? fn(x) : x));

/** Metabolite drawn by a node. */
export const metaboliteOfNode = (nodeId: string) => {
  const s = useStore.getState();
  const n = s.doc.nodes[nodeId];
  return n?.design?.kind === 'metabolite' ? s.design?.biology.metabolites.find((m) => m.id === n.design!.id) : undefined;
};

/** Compartment of a reaction: explicit, else that of its main participants (several → transport). */
export function reactionCompartment(f: TemplateFile, r: TemplateReaction): ConceptualCompartment | 'transport' | null {
  if (r.compartment) return r.compartment;
  const cs = new Set(r.participants.filter((p) => p.main).map((p) => f.biology.metabolites.find((m) => m.id === p.metabolite)?.compartment ?? null));
  if (cs.size > 1) return 'transport';
  return [...cs][0] ?? null;
}

/** Find the template entity for a candidate, or create one (identity confirmed by the user). */
function entityFor(f: TemplateFile, c: IdentityCandidate): { f: TemplateFile; id: string } {
  const hit = f.biology.entities.find((e) => sameCompound(e, c));
  if (hit) return { f: hit.identity.status === 'confirmed' ? f : mapBio(f, { entities: replace(f.biology.entities, hit.id, (e) => confirmCandidate(e, c)) }), id: hit.id };
  const id = nextId(f.biology.entities.map((e) => e.id), ID_PREFIX.entity);
  const e = confirmCandidate({ id, name: c.name, synonyms: [], identifiers: {}, identity: { status: 'unresolved' } }, c);
  return { f: mapBio(f, { entities: [...f.biology.entities, e] }), id };
}

export const designActions = {
  updateMetadata(p: Partial<TemplateMetadata>) { commit((f) => ({ ...f, metadata: { ...f.metadata, ...p } })); if (p.name) useStore.setState({ name: p.name }); },
  setCompartments(list: TemplateCompartment[]) { commit((f) => mapBio(f, { compartments: list })); },
  updateEntity(id: string, p: Partial<TemplateEntity>) { commit((f) => mapBio(f, { entities: replace(f.biology.entities, id, (e) => ({ ...e, ...p })) })); },
  updateMetabolite(id: string, p: Partial<TemplateMetabolite>) { commit((f) => mapBio(f, { metabolites: replace(f.biology.metabolites, id, (m) => ({ ...m, ...p })) })); },
  updateReaction(id: string, p: Partial<TemplateReaction>) { commit((f) => mapBio(f, { reactions: replace(f.biology.reactions, id, (r) => ({ ...r, ...p })) })); },
  updateConnector(id: string, p: Partial<TemplateConnector>) { commit((f) => mapBio(f, { connectors: replace(f.biology.connectors, id, (c) => ({ ...c, ...p })) })); },

  /**
   * "This metabolite is <candidate>". Reuses an entity of the template that is the same compound
   * (glucose [cytosol] and glucose [extracellular] share one identity); otherwise updates the
   * metabolite's own entity, or gives it a new one when that entity is shared with other metabolites.
   */
  assignIdentity(metId: string, c: IdentityCandidate, displayName?: string) {
    commit((f0) => {
      const m = f0.biology.metabolites.find((x) => x.id === metId);
      if (!m) return f0;
      let f = f0;
      let entity = m.entity;
      const current = f.biology.entities.find((e) => e.id === m.entity)!;
      const other = f.biology.entities.find((e) => e.id !== m.entity && sameCompound(e, c));
      const shared = f.biology.metabolites.some((x) => x.id !== metId && x.entity === m.entity);
      if (other || shared) ({ f, id: entity } = entityFor(f, c));
      else f = mapBio(f, { entities: replace(f.biology.entities, current.id, (e) => confirmCandidate(e, c)) });
      const label = displayName?.trim() && displayName.trim() !== c.short && displayName.trim() !== c.name ? displayName.trim() : isPlaceholderLabel(m.label) ? undefined : m.label;
      return mapBio(f, { metabolites: replace(f.biology.metabolites, metId, (x) => { const { label: _l, ...rest } = x; return { ...rest, entity, ...(label ? { label } : {}) }; }) });
    });
  },
  /** The user reviewed the current identity (suggested → confirmed). */
  confirmEntity(id: string) { commit((f) => mapBio(f, { entities: replace(f.biology.entities, id, confirmEntity) })); },
  /** Choose one of the stored candidates of an ambiguous identity. */
  chooseCandidate(entityId: string, i: number) {
    commit((f) => mapBio(f, {
      entities: replace(f.biology.entities, entityId, (e) => {
        const c = e.identity.candidates?.[i];
        return c ? confirmCandidate(e, { name: c.name, formula: c.formula, synonyms: e.synonyms, identifiers: c.identifiers, sources: ['review'], score: 1, match: c.note ?? 'stored candidate' }) : e;
      }),
    }));
  },
  /** Potential identity conflict: keep the confirmed identity (dismiss), or accept the suggestion. */
  resolveConflict(entityId: string, accept: boolean) {
    commit((f) => mapBio(f, {
      entities: replace(f.biology.entities, entityId, (e) => {
        const c = e.identity.conflict;
        if (!c) return e;
        if (!accept) { const { conflict: _c, ...identity } = e.identity; return { ...e, identity }; }
        return confirmCandidate(e, { name: c.name, synonyms: [], identifiers: c.identifiers, sources: [c.source], score: 1, match: 'accepted suggestion' });
      }),
    }));
  },
  /** Back to unresolved (clear identifiers). */
  clearIdentity(entityId: string) { commit((f) => mapBio(f, { entities: replace(f.biology.entities, entityId, (e) => ({ ...e, identifiers: {}, related: undefined, library: undefined, identity: { status: 'unresolved', source: 'user' } })) })); },

  setReactionIdentity(id: string, c: ReactionCandidate) { commit((f) => mapBio(f, { reactions: replace(f.biology.reactions, id, (r) => confirmReactionCandidate(r, c)) })); },
  confirmReaction(id: string) { commit((f) => mapBio(f, { reactions: replace(f.biology.reactions, id, (r) => ({ ...r, identity: { ...r.identity, status: 'confirmed', source: r.identity.source === 'builtin' ? 'builtin' : 'user', reviewed: new Date().toISOString() } })) })); },

  /** Add a side compound (cofactor) to an equation: it is part of the stoichiometry, not drawn. */
  addSideParticipant(rxnId: string, c: IdentityCandidate, sign: -1 | 1, coefficient = 1) {
    commit((f0) => {
      const r = f0.biology.reactions.find((x) => x.id === rxnId);
      if (!r) return f0;
      const { f, id: entity } = entityFor(f0, c);
      const comp = reactionCompartment(f, r);
      const compartment = comp === 'transport' ? null : comp;
      let met = f.biology.metabolites.find((m) => m.entity === entity && m.compartment === compartment);
      let mets = f.biology.metabolites;
      if (!met) { met = { id: nextId(mets.map((m) => m.id), ID_PREFIX.metabolite), entity, compartment, level: 'optional' }; mets = [...mets, met]; }
      if (r.participants.some((p) => p.metabolite === met!.id && Math.sign(p.coefficient) === sign)) return f0;
      return mapBio(f, { metabolites: mets, reactions: replace(f.biology.reactions, rxnId, (x) => ({ ...x, participants: [...x.participants, { metabolite: met!.id, coefficient: sign * Math.abs(coefficient), main: false }] })) });
    });
  },
  removeParticipant(rxnId: string, metId: string, sign: number) {
    commit((f) => mapBio(f, { reactions: replace(f.biology.reactions, rxnId, (r) => ({ ...r, participants: r.participants.filter((p) => p.main || !(p.metabolite === metId && Math.sign(p.coefficient) === Math.sign(sign))) })) }));
  },
  setCoefficient(rxnId: string, metId: string, sign: number, value: number) {
    if (!(value > 0)) return;
    commit((f) => mapBio(f, { reactions: replace(f.biology.reactions, rxnId, (r) => ({ ...r, participants: r.participants.map((p) => (p.metabolite === metId && Math.sign(p.coefficient) === Math.sign(sign) ? { ...p, coefficient: Math.sign(sign) * value } : p)) })) }));
  },

  /** A pathway link (port) from a drawn metabolite to another pathway. Not a reaction. */
  addPort(nodeId: string, pathway: string, direction: 'in' | 'out' = 'out', template?: string) {
    const s = useStore.getState();
    const n = s.doc.nodes[nodeId];
    if (!s.design || n?.design?.kind !== 'metabolite') return;
    const cid = nextId(s.design.biology.connectors.map((c) => c.id), ID_PREFIX.connector);
    const pid = uid('n'), lid = uid('r');
    const out = direction === 'out';
    useStore.getState().actions.commit((st) => ({
      design: mapBio(st.design!, { connectors: [...st.design!.biology.connectors, { id: cid, metabolite: n.design!.id, direction, target: { pathway, ...(template ? { template } : {}) } }] }),
      doc: {
        ...st.doc,
        nodes: { ...st.doc.nodes, [pid]: { id: pid, x: n.x + 110, y: n.y, shape: 'label', label: pathway, design: { kind: 'port', id: cid } } },
        reactions: { ...st.doc.reactions, [lid]: { id: lid, sources: [out ? nodeId : pid], targets: [out ? pid : nodeId], routing: 'straight', role: 'exchange', design: { kind: 'link', id: cid } } },
      },
      selection: [key('node', pid)],
    }));
  },
  /** Draw the same metabolite once more (e.g. glucose in two places of a global map). */
  addInstance(nodeId: string) {
    const n = useStore.getState().doc.nodes[nodeId];
    if (n?.design?.kind !== 'metabolite') return;
    const id = uid('n');
    useStore.getState().actions.commit((st) => ({ doc: { ...st.doc, nodes: { ...st.doc.nodes, [id]: { ...n, id, x: n.x + 60, y: n.y + 40, locked: false } } }, selection: [key('node', id)] }));
  },
  /** Give this instance its own metabolite (same identity), e.g. to place it in another compartment. */
  makeIndependent(nodeId: string) {
    const s = useStore.getState();
    const n = s.doc.nodes[nodeId];
    const m = metaboliteOfNode(nodeId);
    if (!s.design || !m || !n) return;
    const id = nextId(s.design.biology.metabolites.map((x) => x.id), ID_PREFIX.metabolite);
    useStore.getState().actions.commit((st) => ({
      design: mapBio(st.design!, { metabolites: [...st.design!.biology.metabolites, { ...m, id, aliases: undefined }] }),
      doc: { ...st.doc, nodes: { ...st.doc.nodes, [nodeId]: { ...n, design: { kind: 'metabolite', id } } } },
    }));
  },
  /** New metabolite node (unresolved), then the identity search opens on it. */
  addMetaboliteAt(p: Point, label?: string): string {
    const id = useStore.getState().actions.addNode(p, { label: label ?? `M${Object.keys(useStore.getState().doc.nodes).length + 1}` });
    useStore.setState({ dialog: { kind: 'identity', nodeId: id } });
    return id;
  },

  async autoIdentify(search: (q: string) => Promise<IdentityCandidate[]>, source: IdentitySource = 'auto'): Promise<AutoIdentifySummary | null> {
    const f = design();
    if (!f) return null;
    const { file, summary } = await autoIdentify(f, search, source);
    // biology changed while searching? apply the new identities only to entities still unchanged
    const cur = design();
    if (!cur) return null;
    const before = new Map(f.biology.entities.map((e) => [e.id, e]));
    const next = new Map(file.biology.entities.map((e) => [e.id, e]));
    commit((g) => mapBio(g, { entities: g.biology.entities.map((e) => (before.get(e.id) === e && next.has(e.id) ? next.get(e.id)! : e)) }));
    return summary;
  },
  /**
   * BiGG IDs for the template (data from the local BiGG tables): an ID — and the BiGG cross-references — is added only
   * when exactly one BiGG metabolite / reaction fits. Identifiers are added, never removed; identity statuses do not change.
   */
  applyBiggIds(r: BiggIds): { entities: BiggIdSummary; reactions: BiggIdSummary } {
    const sum = (): BiggIdSummary => ({ added: 0, known: 0, several: 0, none: 0, review: [] });
    const out = { entities: sum(), reactions: sum() };
    const f = design();
    if (!f) return out;
    for (const e of f.biology.entities) {
      const x = r.entities[e.id];
      if (!x) continue;
      if (x.status === 'one') out.entities.added++; else out.entities[x.status]++;
      if (x.status === 'several') out.entities.review.push(`${e.name}: ${x.candidates.map((c) => c.bigg).join(' / ')}`);
    }
    for (const rx of f.biology.reactions) {
      const x = r.reactions[rx.id];
      if (!x) continue;
      if (x.status === 'one') out.reactions.added++; else out.reactions[x.status]++;
      if (x.status === 'several') out.reactions.review.push(`${rx.name}: ${x.candidates.map((c) => c.bigg).join(' / ')}`);
    }
    if (!out.entities.added && !out.reactions.added) return out;
    commit((g) => mapBio(g, {
      entities: g.biology.entities.map((e) => {
        const x = r.entities[e.id];
        if (x?.status !== 'one') return e;
        const note = [e.identity.note, `BiGG ${x.bigg} added from the BiGG tables (same identifiers)`].filter(Boolean).join(' · ');
        return { ...e, identifiers: unionIds(e.identifiers, { ...x.identifiers, 'bigg.metabolite': [x.bigg] }), identity: { ...e.identity, note } };
      }),
      reactions: g.biology.reactions.map((rx) => {
        const x = r.reactions[rx.id];
        if (x?.status !== 'one') return rx;
        const note = [rx.identity.note, `BiGG ${x.bigg} added from the BiGG tables (participants${rx.ec.length ? ' + EC' : ''})`].filter(Boolean).join(' · ');
        return { ...rx, identifiers: unionIds(rx.identifiers, { ...x.identifiers, 'bigg.reaction': [x.bigg] }), ec: rx.ec.length ? rx.ec : x.ec ?? [], identity: { ...rx.identity, note } };
      }),
    }));
    return out;
  },
  /** Imported template: treat every identity as a suggestion to review (nothing is trusted blindly). */
  demoteIdentities() {
    commit((f) => mapBio(f, {
      entities: f.biology.entities.map((e) => (e.identity.status === 'confirmed' ? { ...e, identity: { ...e.identity, status: 'suggested', source: 'imported' } } : e)),
      reactions: f.biology.reactions.map((r) => (r.identity.status === 'confirmed' ? { ...r, identity: { ...r.identity, status: 'suggested', source: 'imported' } } : r)),
    }));
  },
};
