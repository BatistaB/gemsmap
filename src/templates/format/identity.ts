/**
 * Template identity: candidates for "what is this node?", and the rules that
 * keep human decisions on top.
 *
 *  - Sources: the GEMs MAP canonical library (offline, curated) and, when the
 *    backend runs, KEGG / ChEBI searches resolved through MetaNetX (online).
 *  - A person picking a candidate makes the identity `confirmed`.
 *  - Machines (database search, Auto Identify, AI) only produce `suggested` or
 *    `ambiguous`, and never change a `confirmed` identity: a disagreeing
 *    suggestion is stored as a potential conflict for review.
 */
import { normalizeXref, type Namespace } from '../mapping/identifiers';
import { METABOLITES, type CanonicalMetabolite } from '../mapping/library';
import { compactKey } from '../mapping/names';
import type { IdentifierTable, IdentitySource, IdentityState, RelatedFormSpec, TemplateEntity, TemplateFile, TemplateReaction } from './schema';

export interface IdentityCandidate {
  name: string;
  short?: string;
  formula?: string;
  charge?: number;
  synonyms: string[];
  identifiers: IdentifierTable;
  related?: RelatedFormSpec[];
  /** Canonical-library id when the candidate comes from (or matches) the GEMs MAP library. */
  library?: string;
  /** Where the candidate was found: "GEMs MAP library", "KEGG", "ChEBI", "MetaNetX". */
  sources: string[];
  /** Search relevance 0–1 (exact name 1, synonym 0.9, prefix 0.7, substring 0.5). Not a probability. */
  score: number;
  /** Why it matched, e.g. "exact name", "synonym “dextrose”", "KEGG C00031". */
  match: string;
  note?: string;
}

/** Normalized identifier keys of a table (bigg excluded: its bases are shared by stereo variants in some models). */
export function identifierKeys(t: IdentifierTable, withBigg = false): Set<string> {
  const out = new Set<string>();
  for (const [ns, vs] of Object.entries(t)) {
    if (ns === 'bigg.metabolite' && !withBigg) continue;
    for (const v of vs ?? []) { const k = normalizeXref(ns as Namespace, v); if (k) out.add(k); }
  }
  return out;
}

/** Two descriptions name the same compound: a shared exact identifier, or the same name when neither has identifiers. */
export function sameCompound(a: { name: string; identifiers: IdentifierTable }, b: { name: string; identifiers: IdentifierTable }): boolean {
  const ka = identifierKeys(a.identifiers), kb = identifierKeys(b.identifiers);
  if (ka.size && kb.size) return [...ka].some((k) => kb.has(k));
  return compactKey(a.name) === compactKey(b.name);
}

function fromLibrary(m: CanonicalMetabolite, score: number, match: string): IdentityCandidate {
  return {
    name: m.name, short: m.short, formula: m.formula, synonyms: m.synonyms, identifiers: m.xrefs, library: m.id, sources: ['GEMs MAP library'], score, match,
    related: m.related?.map((r) => ({ note: r.note, names: r.names, identifiers: r.xrefs })),
  };
}

/** Offline search in the canonical library: names, synonyms and identifiers. */
export function searchLibrary(q: string, limit = 12): IdentityCandidate[] {
  const query = q.trim();
  if (!query) return [];
  const k = compactKey(query);
  const out: IdentityCandidate[] = [];
  for (const m of METABOLITES) {
    const ids = Object.entries(m.xrefs).flatMap(([ns, vs]) => (vs ?? []).map((v) => [ns, v] as const));
    const ql = query.toLowerCase();
    if (compactKey(m.name) === k || m.id.toLowerCase() === ql) { out.push(fromLibrary(m, 1, 'exact name')); continue; }
    const idHit = ids.find(([ns, v]) => v.toLowerCase() === ql || `${ns}:${v}`.toLowerCase() === ql || (ns === 'chebi' && /^chebi:\s*\d+$/i.test(query) && normalizeXref('chebi', query) === normalizeXref('chebi', v)));
    if (idHit) { out.push(fromLibrary(m, 1, `${idHit[0]} ${idHit[1]}`)); continue; }
    const syn = m.synonyms.find((s) => compactKey(s) === k);
    if (syn) { out.push(fromLibrary(m, 0.9, `synonym “${syn}”`)); continue; }
    if (k.length >= 2 && [m.name, ...m.synonyms].some((s) => compactKey(s).startsWith(k))) { out.push(fromLibrary(m, 0.7, 'name starts with the query')); continue; }
    if (k.length >= 3 && [m.name, ...m.synonyms].some((s) => compactKey(s).includes(k))) out.push(fromLibrary(m, 0.5, 'name contains the query'));
  }
  return out.sort((a, b) => b.score - a.score || a.name.length - b.name.length).slice(0, limit);
}

/** Merge candidates that describe the same compound (library first, identifiers united). */
export function mergeCandidates(lists: IdentityCandidate[][]): IdentityCandidate[] {
  const out: IdentityCandidate[] = [];
  for (const c of lists.flat()) {
    const hit = out.find((o) => sameCompound(o, c));
    if (!hit) { out.push({ ...c, identifiers: { ...c.identifiers }, synonyms: [...c.synonyms], sources: [...c.sources] }); continue; }
    hit.score = Math.max(hit.score, c.score);
    hit.sources = [...new Set([...hit.sources, ...c.sources])];
    hit.library ??= c.library;
    hit.formula ??= c.formula;
    hit.charge ??= c.charge;
    for (const [ns, vs] of Object.entries(c.identifiers) as [Namespace, string[]][]) {
      const cur = hit.identifiers[ns] ?? [];
      const keys = new Set(cur.map((v) => normalizeXref(ns, v)));
      hit.identifiers[ns] = [...cur, ...(vs ?? []).filter((v) => !keys.has(normalizeXref(ns, v)))];
    }
    hit.synonyms = [...new Set([...hit.synonyms, ...c.synonyms])].slice(0, 24);
  }
  return out.sort((a, b) => b.score - a.score || (a.library ? -1 : 0) - (b.library ? -1 : 0));
}

// ------------------------------------------------------------ applying identities

const now = () => new Date().toISOString();

/** A person chose this candidate: the entity becomes `confirmed` (any previous conflict is resolved). */
export function confirmCandidate(e: TemplateEntity, c: IdentityCandidate): TemplateEntity {
  return {
    ...e, name: c.name, short: e.short && e.identity.status === 'confirmed' ? e.short : c.short ?? e.short, formula: c.formula ?? e.formula, charge: c.charge ?? e.charge,
    synonyms: [...new Set([...c.synonyms])].slice(0, 24), identifiers: c.identifiers, related: c.related ?? e.related, library: c.library,
    identity: { status: 'confirmed', source: 'user', note: `Chosen from ${c.sources.join(' + ')} (${c.match})`, reviewed: now() },
  };
}

/** The user reviewed the current identity and accepts it as it is. */
export const confirmEntity = (e: TemplateEntity): TemplateEntity => ({ ...e, identity: { status: 'confirmed', source: e.identity.source === 'builtin' ? 'builtin' : 'user', note: e.identity.note, reviewed: now() } });

/**
 * A machine suggestion. Never overrides a confirmed identity: if it disagrees, the
 * entity keeps its identity and records the suggestion as a potential conflict.
 * Returns the entity unchanged (same object) when there is nothing to do.
 */
export function suggestIdentity(e: TemplateEntity, cands: IdentityCandidate[], source: IdentitySource): TemplateEntity {
  if (!cands.length) return e;
  const top = cands[0];
  const plausible = cands.filter((c) => c.score >= top.score - 0.15 && c.score >= 0.85);
  if (e.identity.status === 'confirmed') {
    // only plausible candidates count: a partial name hit (isocitrate for "citrate") is no evidence either way
    if (!plausible.length || plausible.some((c) => sameCompound(e, c))) return e;
    return { ...e, identity: { ...e.identity, conflict: { name: top.name, identifiers: top.identifiers, source, note: top.match } } };
  }
  if (plausible.length > 1) {
    const identity: IdentityState = {
      status: 'ambiguous', source, note: `${plausible.length} plausible candidates for “${e.name}”`,
      candidates: plausible.slice(0, 6).map((c) => ({ name: c.name, identifiers: c.identifiers, ...(c.formula ? { formula: c.formula } : {}), note: `${c.sources.join(' + ')} · ${c.match}` })),
    };
    return { ...e, identity };
  }
  if (top.score < 0.85) return e; // a partial name match is not an identity
  return {
    ...e, name: top.name, short: e.short ?? top.short, formula: top.formula ?? e.formula, charge: top.charge ?? e.charge,
    synonyms: [...new Set([e.name, ...top.synonyms])].filter((s) => compactKey(s) !== compactKey(top.name) || s === top.name).slice(0, 24),
    identifiers: top.identifiers, related: top.related ?? e.related, library: top.library,
    identity: { status: 'suggested', source, note: `${top.sources.join(' + ')} · ${top.match}` },
  };
}

export interface AutoIdentifySummary { resolved: number; review: number; unresolved: number; conflicts: number; keptConfirmed: number; reviewIds: string[] }

/**
 * Auto Identify: every entity that is not confirmed is searched by its name and
 * synonyms. One clear exact hit → suggested; several → ambiguous; none → unresolved.
 */
export async function autoIdentify(f: TemplateFile, search: (q: string) => Promise<IdentityCandidate[]>, source: IdentitySource = 'auto'): Promise<{ file: TemplateFile; summary: AutoIdentifySummary }> {
  const summary: AutoIdentifySummary = { resolved: 0, review: 0, unresolved: 0, conflicts: 0, keptConfirmed: 0, reviewIds: [] };
  const entities: TemplateEntity[] = [];
  for (const e of f.biology.entities) {
    const queries = [...new Set([e.name, ...e.synonyms.slice(0, 2)].filter(Boolean))];
    const lists = await Promise.all(queries.map((q) => search(q).catch(() => [])));
    const cands = mergeCandidates(lists);
    const next = suggestIdentity(e, cands, source);
    if (e.identity.status === 'confirmed') {
      summary.keptConfirmed++;
      if (next.identity.conflict && !e.identity.conflict) { summary.conflicts++; summary.reviewIds.push(e.id); }
    } else if (next.identity.status === 'suggested') summary.resolved++;
    else if (next.identity.status === 'ambiguous') { summary.review++; summary.reviewIds.push(e.id); }
    else { summary.unresolved++; summary.reviewIds.push(e.id); }
    entities.push(next);
  }
  return { file: { ...f, biology: { ...f.biology, entities } }, summary };
}

// ------------------------------------------------------------ reactions

export interface ReactionCandidate {
  name: string;
  canonicalName?: string;
  ec: string[];
  identifiers: IdentifierTable;
  reversible?: boolean | null;
  equation?: string;
  sources: string[];
  score: number;
  /** Evidence lines: ✓ / ✗ checks against the template reaction. */
  evidence: { ok: boolean; text: string }[];
}

/** A person chose this reaction identity. Participants (topology) stay as drawn. */
export function confirmReactionCandidate(r: TemplateReaction, c: ReactionCandidate): TemplateReaction {
  const ids: IdentifierTable = { ...r.identifiers };
  for (const [ns, vs] of Object.entries(c.identifiers) as [Namespace, string[]][]) ids[ns] = [...new Set([...(ids[ns] ?? []), ...vs])];
  return {
    ...r, canonicalName: c.canonicalName ?? r.canonicalName, ec: [...new Set([...r.ec, ...c.ec])], identifiers: ids,
    reversible: r.reversible ?? c.reversible ?? null,
    identity: { status: 'confirmed', source: 'user', note: `Chosen from ${c.sources.join(' + ')}${c.equation ? `: ${c.equation}` : ''}`, reviewed: now() },
  };
}
