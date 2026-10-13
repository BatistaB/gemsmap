/**
 * Template validation: structural integrity, identity coverage, database
 * consistency, stoichiometry. Every issue names the element it is about, so the
 * UI can jump to it. The completeness score is a plain ratio of documented
 * fields — never an opaque quality number.
 */
import { normalizeXref, type Namespace, NS_LABEL } from '../mapping/identifiers';
import { heavyAtoms } from '../mapping/names';
import { compartmentLabel, type Completeness, type TemplateEntity, type TemplateFile, type TemplateReaction } from './schema';

export type Severity = 'error' | 'warning' | 'info';
export type ElementKind = 'template' | 'entity' | 'metabolite' | 'reaction' | 'connector' | 'node';

export interface TemplateIssue {
  severity: Severity;
  code: string;
  message: string;
  element?: { kind: ElementKind; id: string };
}

const isIdentified = (e: TemplateEntity | undefined) => !!e && Object.values(e.identifiers).some((v) => v?.length) && (e.identity.status === 'confirmed' || e.identity.status === 'suggested');
export const reactionIdentified = (r: TemplateReaction) => (r.ec.length > 0 || Object.values(r.identifiers).some((v) => v?.length) || (!!r.summary && !!r.provenance?.length)) && (r.identity.status === 'confirmed' || r.identity.status === 'suggested');

export function completeness(f: TemplateFile): Completeness {
  const ents = new Map(f.biology.entities.map((e) => [e.id, e]));
  const mets = f.biology.metabolites;
  const metabolitesIdentified = mets.filter((m) => isIdentified(ents.get(m.entity))).length;
  const reactionsIdentified = f.biology.reactions.filter(reactionIdentified).length;
  const compartmentsDefined = mets.filter((m) => !!m.compartment).length;
  const fr = (a: number, b: number) => (b ? a / b : 1);
  // a compartment is a preference, not part of the identity: the person decides it when mapping onto a GEM
  const parts = [fr(metabolitesIdentified, mets.length), fr(reactionsIdentified, f.biology.reactions.length)];
  return {
    metabolitesIdentified, metabolites: mets.length, reactionsIdentified, reactions: f.biology.reactions.length, compartmentsDefined,
    overall: mets.length || f.biology.reactions.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0,
  };
}

/** Identifiers that look like a model's own IDs (compartment suffix) rather than a database entry. */
const MODEL_LIKE = /(_[cemprxngvlh]\d?|\[[a-z0-9]+\])$/;

export function validateTemplateFile(f: TemplateFile): TemplateIssue[] {
  const out: TemplateIssue[] = [];
  const add = (severity: Severity, code: string, message: string, kind?: ElementKind, id?: string) =>
    out.push({ severity, code, message, ...(kind && id ? { element: { kind, id } } : {}) });
  const md = f.metadata;
  if (!md.id) add('error', 'metadata', 'The template has no id');
  if (!md.name?.trim()) add('error', 'metadata', 'The template has no name', 'template', md.id);
  if (!/^\d+\.\d+(\.\d+)?$/.test(md.template_version ?? '')) add('warning', 'metadata', `Template version "${md.template_version}" is not of the form 1.0.0`, 'template', md.id);
  if (!md.authors?.length) add('info', 'metadata', 'No author given', 'template', md.id);

  const ents = new Map(f.biology.entities.map((e) => [e.id, e]));
  const mets = new Map(f.biology.metabolites.map((m) => [m.id, m]));
  const name = (metId: string) => { const m = mets.get(metId); const e = m && ents.get(m.entity); return `${e?.name ?? metId}${m?.compartment ? ` [${compartmentLabel(m.compartment).toLowerCase()}]` : ''}`; };

  // ---- entities: identity and database consistency
  const seenXref = new Map<string, string>();
  for (const e of f.biology.entities) {
    const ids = Object.entries(e.identifiers).flatMap(([ns, vs]) => (vs ?? []).map((v) => [ns as Namespace, v] as const));
    if (e.generic) add('info', 'generic-entity', `${e.name}: generic entity (a class of compounds) — kept generic, review how GEMs represent it`, 'entity', e.id);
    if ((e.identity.status === 'unresolved' || !ids.length) && !e.generic) add('warning', 'missing-identity', `${e.name}: identity not defined (no database identifier)`, 'entity', e.id);
    else if (e.identity.status === 'ambiguous') add('warning', 'ambiguous-identity', `${e.name}: ambiguous identity — ${e.identity.candidates?.length ?? 'several'} candidates, choose one`, 'entity', e.id);
    else if (e.identity.status === 'suggested') add('info', 'suggested-identity', `${e.name}: identity suggested${e.identity.source === 'ai' ? ' by AI' : e.identity.source === 'auto' ? ' by Auto Identify' : ''}, not reviewed yet`, 'entity', e.id);
    if (e.identity.conflict) add('warning', 'identity-conflict', `${e.name}: potential identity conflict — a ${e.identity.conflict.source} suggestion says "${e.identity.conflict.name}"`, 'entity', e.id);
    for (const [ns, v] of ids) {
      const n = normalizeXref(ns, v);
      if (!n) { add('error', 'invalid-identifier', `${e.name}: "${v}" is not a valid ${NS_LABEL[ns] ?? ns} identifier`, 'entity', e.id); continue; }
      if (ns === 'bigg.metabolite' ? MODEL_LIKE.test(v) && !/_[A-Z]$/.test(v) : /\[[a-z0-9]+\]$/i.test(v)) {
        add('warning', 'model-id', `${e.name}: "${v}" looks like a model ID (compartment suffix) — templates store database identities only`, 'entity', e.id);
      }
      if (ns === 'bigg.metabolite') continue; // BiGG bases are shared by stereo/anomer variants in some models
      const other = seenXref.get(n);
      if (other && other !== e.id) add('warning', 'shared-identifier', `${e.name} and ${ents.get(other)?.name} share ${NS_LABEL[ns] ?? ns} ${v} — the same compound twice?`, 'entity', e.id);
      else seenXref.set(n, e.id);
    }
    if ((e.identifiers['kegg.compound']?.length ?? 0) > 1) add('info', 'several-kegg', `${e.name}: several KEGG compounds (${e.identifiers['kegg.compound']!.join(', ')}) — keep exact identities here and put anomers under related forms`, 'entity', e.id);
  }

  // ---- metabolites
  const pairs = new Map<string, string>();
  const drawn = new Set(f.layout.nodes.filter((n) => !n.attach).map((n) => n.metabolite));
  const inReaction = new Set(f.biology.reactions.flatMap((r) => r.participants.map((p) => p.metabolite)));
  const inConnector = new Set(f.biology.connectors.map((c) => c.metabolite));
  for (const m of f.biology.metabolites) {
    if (!ents.has(m.entity)) add('error', 'unknown-entity', `Metabolite ${m.id} points at a missing entity ${m.entity}`, 'metabolite', m.id);
    if (m.compartment && !f.biology.compartments.some((c) => c.id === m.compartment)) add('info', 'undeclared-compartment', `${name(m.id)}: compartment ${m.compartment} has no fallback policy (models without it will search the cytosol)`, 'metabolite', m.id);
    const k = `${m.entity}@${m.compartment}`;
    if (pairs.has(k)) add('warning', 'duplicate-metabolite', `${name(m.id)} is defined twice (${pairs.get(k)}, ${m.id}) — draw several instances of one metabolite instead`, 'metabolite', m.id);
    else pairs.set(k, m.id);
    if (drawn.has(m.id) && !inReaction.has(m.id) && !inConnector.has(m.id) && f.biology.metabolites.length > 1) add('warning', 'unconnected', `${name(m.id)} is not connected to any reaction`, 'metabolite', m.id);
    if (!drawn.has(m.id) && !inReaction.has(m.id) && !inConnector.has(m.id)) add('info', 'orphan', `${name(m.id)} is neither drawn nor used`, 'metabolite', m.id);
    for (const a of m.alternatives ?? []) if (!ents.has(a)) add('error', 'unknown-entity', `${name(m.id)}: unknown alternative entity ${a}`, 'metabolite', m.id);
  }

  // ---- reactions
  const signatures = new Map<string, string>();
  for (const r of f.biology.reactions) {
    const label = r.name || r.id;
    const subs = r.participants.filter((p) => p.coefficient < 0), prods = r.participants.filter((p) => p.coefficient > 0);
    if (!r.participants.length) add('error', 'no-participants', `Reaction ${label} has no participants`, 'reaction', r.id);
    else {
      if (!subs.length) add('error', 'no-substrates', `Reaction ${label} has no substrate`, 'reaction', r.id);
      if (!prods.length) add('error', 'no-products', `Reaction ${label} has no product`, 'reaction', r.id);
    }
    for (const p of r.participants) {
      if (!mets.has(p.metabolite)) add('error', 'broken-edge', `Reaction ${label} references a missing metabolite ${p.metabolite}`, 'reaction', r.id);
      if (!p.coefficient || !Number.isFinite(p.coefficient)) add('error', 'coefficient', `Reaction ${label}: coefficient of ${name(p.metabolite)} must be a non-zero number`, 'reaction', r.id);
    }
    const both = subs.filter((s) => prods.some((p) => p.metabolite === s.metabolite));
    if (both.length) add('warning', 'both-sides', `Reaction ${label}: ${both.map((b) => name(b.metabolite)).join(', ')} on both sides`, 'reaction', r.id);
    if (r.summary) add('info', 'summary-reaction', `${label}: pathway summary${r.provenance?.length ? ` (${r.provenance.map((p) => `${p.source} ${p.id}`).join(', ')})` : ''} — not atom-balanced; linked to a GEM only when the model makes it in one or two reactions`, 'reaction', r.id);
    else if (!r.ec.length && !Object.values(r.identifiers).some((v) => v?.length)) add('warning', 'missing-reaction-identity', `Reaction ${label}: no EC number or database identifier — matching will rely on its participants only`, 'reaction', r.id);
    else if (r.identity.status === 'suggested') add('info', 'suggested-identity', `Reaction ${label}: identity suggested, not reviewed yet`, 'reaction', r.id);
    else if (r.identity.status === 'ambiguous') add('warning', 'ambiguous-identity', `Reaction ${label}: ambiguous identity`, 'reaction', r.id);
    for (const ec of r.ec) if (!/^\d+\.\d+\.\d+\.(\d+|n\d+|-)$/.test(ec)) add('error', 'invalid-identifier', `Reaction ${label}: malformed EC number ${ec}`, 'reaction', r.id);
    for (const [ns, vs] of Object.entries(r.identifiers)) for (const v of vs ?? []) if (!normalizeXref(ns as Namespace, v)) add('error', 'invalid-identifier', `Reaction ${label}: "${v}" is not a valid ${NS_LABEL[ns as Namespace] ?? ns} identifier`, 'reaction', r.id);
    if (r.reversible === null) add('info', 'direction', `Reaction ${label}: reversibility not stated`, 'reaction', r.id);
    // duplicate reactions: the same equation twice
    const sig = r.participants.map((p) => `${mets.get(p.metabolite)?.entity}@${mets.get(p.metabolite)?.compartment}:${Math.sign(p.coefficient)}`).sort().join('|');
    const sigRev = r.participants.map((p) => `${mets.get(p.metabolite)?.entity}@${mets.get(p.metabolite)?.compartment}:${-Math.sign(p.coefficient)}`).sort().join('|');
    const dup = signatures.get(sig) ?? signatures.get(sigRev);
    if (dup && r.participants.length) {
      const other = f.biology.reactions.find((x) => x.id === dup)!;
      const opposite = signatures.get(sig) === undefined;
      if (opposite && r.reversible === false && other.reversible === false) add('warning', 'direction', `Reactions ${other.name} and ${label} are irreversible in opposite directions — a futile pair or a direction error?`, 'reaction', r.id);
      else add('warning', 'duplicate-reaction', `Reaction ${label} has the same equation as ${other.name}`, 'reaction', r.id);
    } else signatures.set(sig, r.id);
    // stoichiometric balance on heavy atoms (H ignored: protonation states differ)
    const missing: string[] = [];
    const total: Record<string, number> = {};
    for (const p of r.participants) {
      const e = ents.get(mets.get(p.metabolite)?.entity ?? '');
      const atoms = heavyAtoms(e?.formula);
      if (!atoms) { missing.push(e?.name ?? p.metabolite); continue; }
      for (const [el, n] of Object.entries(atoms)) total[el] = (total[el] ?? 0) + n * p.coefficient;
    }
    const off = Object.entries(total).filter(([, n]) => Math.abs(n) > 1e-9);
    if (r.summary) { /* a pathway summary is not one balanced reaction */ }
    else if (!missing.length && off.length && subs.length && prods.length) {
      add('warning', 'unbalanced', `Reaction ${label} is not balanced (heavy atoms, products − substrates: ${off.map(([el, n]) => `${el} ${n > 0 ? '+' : ''}${n}`).join(', ')}) — missing cofactor or wrong stoichiometry?`, 'reaction', r.id);
    } else if (missing.length && r.participants.length) {
      add('info', 'balance-unchecked', `Reaction ${label}: balance not checked (no formula for ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})`, 'reaction', r.id);
    }
  }

  // ---- connectors and layout
  for (const c of f.biology.connectors) {
    if (!mets.has(c.metabolite)) add('error', 'broken-edge', `Pathway link ${c.id} starts at a missing metabolite`, 'connector', c.id);
    if (!c.target.pathway?.trim()) add('warning', 'connector-target', `Pathway link from ${name(c.metabolite)} has no target pathway name`, 'connector', c.id);
  }
  const nodeIds = new Set(f.layout.nodes.map((n) => n.id));
  for (const n of f.layout.nodes) if (!mets.has(n.metabolite)) add('error', 'broken-node', `Drawn node ${n.id} points at a missing metabolite`, 'node', n.id);
  const rxns = new Set(f.biology.reactions.map((r) => r.id));
  for (const lr of f.layout.reactions) {
    if (!rxns.has(lr.reaction)) add('error', 'broken-edge', `A drawn arrow points at a missing reaction ${lr.reaction}`, 'reaction', lr.reaction);
    if ([...lr.sources, ...lr.targets].some((x) => !nodeIds.has(x))) add('error', 'broken-edge', `The arrow of ${lr.reaction} ends at a missing node`, 'reaction', lr.reaction);
  }
  for (const p of f.layout.ports) if (!f.biology.connectors.some((c) => c.id === p.connector)) add('error', 'broken-node', `Port ${p.id} points at a missing pathway link`, 'node', p.id);
  const rxById = new Map(f.biology.reactions.map((r) => [r.id, r]));
  for (const n of f.layout.nodes) {
    if (!n.attach) continue;
    const r = rxById.get(n.attach.reaction);
    if (!r) { add('error', 'broken-node', `Cofactor drawing ${n.id} is attached to a missing reaction`, 'node', n.id); continue; }
    const want = n.attach.side === 'in' ? -1 : 1;
    if (!r.participants.some((p) => p.metabolite === n.metabolite && Math.sign(p.coefficient) === want)) {
      add('warning', 'cofactor-drawing', `Reaction ${r.name}: drawn cofactor ${name(n.metabolite)} is not a ${n.attach.side === 'in' ? 'substrate' : 'product'} of the reaction`, 'reaction', r.id);
    }
  }
  if (!f.biology.metabolites.some((m) => m.compartment)) add('info', 'no-compartments', 'No preferred compartments: the matcher proposes them in each GEM and you choose when mapping', 'template', md.id);
  if (md.review_status === 'ai-generated') add('info', 'review-status', 'AI-generated — needs review: identities are suggestions until a person confirms them', 'template', md.id);
  if (!f.biology.metabolites.length) add('info', 'empty', 'The template is empty', 'template', md.id);
  return out;
}

export const issueCounts = (issues: TemplateIssue[]) => ({
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warning').length,
  infos: issues.filter((i) => i.severity === 'info').length,
});
