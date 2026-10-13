/**
 * Identity search for the Template Builder. Offline first: the GEMs MAP canonical
 * library answers instantly; the backend (when running) adds KEGG / ChEBI hits
 * resolved through MetaNetX, and MNXref reactions for a set of participants.
 * Works without any GEM loaded.
 */
import { mergeCandidates, sameCompound, searchLibrary, type IdentityCandidate, type ReactionCandidate } from '../format/identity';
import type { IdentifierTable, TemplateFile, TemplateReaction } from '../format/schema';
import { BUILTIN_TEMPLATE_FILES } from '../pathways';
import { compactKey } from '../mapping/names';

const BASE = (import.meta.env?.VITE_COBRA_API as string | undefined) ?? '/api';

export interface SearchResult { candidates: IdentityCandidate[]; online: boolean; note?: string; sources?: Record<string, string> }

interface RemoteCompound {
  name: string; formula?: string | null; charge?: number | null; synonyms: string[]; identifiers: IdentifierTable; mnx?: string | null;
  sources: string[]; score: number; match: string; note?: string; structured?: boolean;
}

type RemoteAnswer = { candidates: RemoteCompound[]; sources: Record<string, string> };
const remoteCache = new Map<string, Promise<RemoteAnswer>>();

async function remoteCompounds(q: string): Promise<RemoteAnswer> {
  const k = q.trim().toLowerCase();
  if (!remoteCache.has(k)) {
    const p = fetch(`${BASE}/identity/compounds?q=${encodeURIComponent(q.trim())}&limit=8`).then(async (r) => {
      if (!r.ok) throw new Error(`backend ${r.status}`);
      return (await r.json()) as RemoteAnswer;
    });
    p.catch(() => remoteCache.delete(k));
    remoteCache.set(k, p);
  }
  return remoteCache.get(k)!;
}

const fromRemote = (c: RemoteCompound): IdentityCandidate => ({
  name: c.name, formula: c.formula ?? undefined, charge: c.charge ?? undefined, synonyms: c.synonyms ?? [], identifiers: c.identifiers,
  sources: c.sources, score: c.structured === false ? c.score * 0.9 : c.score, match: c.match, note: c.note,
});

export const searchLocal = (q: string) => searchLibrary(q);

/** Library + databases (when the backend answers). */
export async function searchIdentities(q: string): Promise<SearchResult> {
  const local = searchLibrary(q);
  try {
    const ans = await remoteCompounds(q);
    return { candidates: mergeCandidates([local, ans.candidates.map(fromRemote)]), online: true, sources: ans.sources };
  } catch (e) {
    return { candidates: local, online: false, note: `Database search unavailable (${(e as Error).message}) — showing the GEMs MAP library only. Start GEMs MAP with the gemsmap command (development checkout: npm run backend) to search KEGG, ChEBI and MetaNetX.` };
  }
}

/** Search function for Auto Identify. */
export const autoIdentifySearch = async (q: string) => (await searchIdentities(q)).candidates;

// ------------------------------------------------------------ reactions

interface Built { r: TemplateReaction; f: TemplateFile }
let builtins: Built[] | null = null;
const builtinReactions = () => (builtins ??= BUILTIN_TEMPLATE_FILES.flatMap((f) => f.biology.reactions.map((r) => ({ r, f }))).filter((x, i, all) => all.findIndex((y) => y.r.name === x.r.name && y.r.ec.join() === x.r.ec.join()) === i));

const entityOfMet = (f: TemplateFile, metId: string) => {
  const m = f.biology.metabolites.find((x) => x.id === metId);
  return m ? f.biology.entities.find((e) => e.id === m.entity) : undefined;
};

/** Reactions of the built-in templates that convert the same main substrate into the same main product, or match the text. */
export function searchReactionLibrary(f: TemplateFile, r: TemplateReaction, text = ''): ReactionCandidate[] {
  const mains = r.participants.filter((p) => p.main).map((p) => ({ p, e: entityOfMet(f, p.metabolite) })).filter((x) => x.e);
  const k = compactKey(text);
  const out: ReactionCandidate[] = [];
  for (const { r: br, f: bf } of builtinReactions()) {
    const bm = br.participants.map((p) => ({ p, e: entityOfMet(bf, p.metabolite)! }));
    const evidence: ReactionCandidate['evidence'] = [];
    let hit = 0;
    for (const { p, e } of mains) {
      const same = bm.find((x) => x.e && sameCompound(x.e, e!));
      if (same && Math.sign(same.p.coefficient) === Math.sign(p.coefficient)) { hit++; evidence.push({ ok: true, text: `${e!.name} (${p.coefficient < 0 ? 'substrate' : 'product'})` }); }
      else evidence.push({ ok: false, text: same ? `${e!.name} on the other side` : `${e!.name} not in this reaction` });
    }
    const textHit = !!k && [br.name, br.canonicalName ?? '', ...br.ec].some((s) => compactKey(s).includes(k));
    if (!textHit && (hit < 2 || hit < mains.length)) continue;
    if (textHit) evidence.push({ ok: true, text: `name / EC matches “${text}”` });
    const side = br.participants.filter((p) => !p.main).map((p) => entityOfMet(bf, p.metabolite)?.name).filter(Boolean);
    out.push({
      name: br.name, canonicalName: br.canonicalName, ec: br.ec, identifiers: br.identifiers, reversible: br.reversible,
      equation: equationText(bf, br), sources: ['GEMs MAP library'], score: mains.length ? hit / mains.length : 0.5, evidence: [...evidence, ...(side.length ? [{ ok: true, text: `cofactors in the library equation: ${side.join(', ')}` }] : [])],
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

/** MNXref reactions for the template reaction's participants (backend). */
export async function searchReactionDatabases(f: TemplateFile, r: TemplateReaction): Promise<{ candidates: ReactionCandidate[]; notes: string[]; online: boolean }> {
  const participants = r.participants.map((p) => {
    const m = f.biology.metabolites.find((x) => x.id === p.metabolite);
    const e = entityOfMet(f, p.metabolite);
    return { name: e?.name, identifiers: e?.identifiers ?? {}, coefficient: p.coefficient, main: p.main, compartment: r.compartment ?? m?.compartment ?? undefined };
  });
  try {
    const res = await fetch(`${BASE}/identity/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participants, ec: r.ec }) });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    const j = (await res.json()) as { candidates: (ReactionCandidate & { direction?: string; balanced?: boolean | null })[]; notes: string[] };
    return {
      online: true, notes: j.notes,
      candidates: j.candidates.map((c) => ({ ...c, evidence: [...c.evidence.filter((e) => e.ok !== null).map((e) => ({ ok: !!e.ok, text: e.text })), ...(c.direction ? [{ ok: c.direction === 'as drawn', text: `Direction: ${c.direction}` }] : [])] })),
    };
  } catch (e) {
    return { candidates: [], notes: [`Database search unavailable (${(e as Error).message}) — start the backend to search MetaNetX`], online: false };
  }
}

/** "ATP + D-Glucose → ADP + D-Glucose 6-phosphate" */
export function equationText(f: TemplateFile, r: TemplateReaction, names: 'name' | 'short' = 'name'): string {
  const term = (p: TemplateReaction['participants'][number]) => {
    const e = entityOfMet(f, p.metabolite);
    const n = (names === 'short' ? e?.short : undefined) ?? e?.name ?? p.metabolite;
    const c = Math.abs(p.coefficient);
    return `${c !== 1 ? `${c} ` : ''}${n}`;
  };
  const left = r.participants.filter((p) => p.coefficient < 0).map(term).join(' + ') || '∅';
  const right = r.participants.filter((p) => p.coefficient > 0).map(term).join(' + ') || '∅';
  return `${left} ${r.reversible ? '⇌' : r.reversible === false ? '→' : '→?'} ${right}`;
}
