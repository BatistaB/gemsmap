import { splitParent } from '../data/families';
import { baseId, isCurrency, mainParticipants } from './currency';
import type { ID, MetabolicModel, Reaction } from './types';

export interface Step {
  reactionId: ID;
  from: ID;
  to: ID;
  /** true if traversing against the reaction's written direction (only for reversible reactions). */
  reversed: boolean;
}

/** Index: metabolite -> reactions that touch it. Cached per model object. */
const indexCache = new WeakMap<MetabolicModel, Map<ID, ID[]>>();
export function metaboliteIndex(model: MetabolicModel): Map<ID, ID[]> {
  let idx = indexCache.get(model);
  if (idx) return idx;
  idx = new Map();
  for (const r of Object.values(model.reactions)) {
    // ecModel copies (r101_EXP_1…) are walked through their virtual parent r101 instead
    const fam = splitParent(r.id);
    if (fam && model.reactions[fam.id]?.meta?.virtual) continue;
    for (const mid of Object.keys(r.stoichiometry)) {
      const list = idx.get(mid);
      if (list) list.push(r.id);
      else idx.set(mid, [r.id]);
    }
  }
  indexCache.set(model, idx);
  return idx;
}

/** Non-currency neighbours reachable in one reaction, following flux direction constraints. */
/** Cache of neighbours() per model object (the returned arrays are shared: callers must not mutate them). */
const neighbourCache = new WeakMap<MetabolicModel, Map<string, Step[]>>();

export function neighbours(model: MetabolicModel, mid: ID, dir: 'down' | 'up', allowCurrency = false): Step[] {
  let cache = neighbourCache.get(model);
  if (!cache) { cache = new Map(); neighbourCache.set(model, cache); }
  const key = `${dir}|${allowCurrency ? 1 : 0}|${mid}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = neighboursUncached(model, mid, dir, allowCurrency);
  cache.set(key, out);
  return out;
}

function neighboursUncached(model: MetabolicModel, mid: ID, dir: 'down' | 'up', allowCurrency: boolean): Step[] {
  const out: Step[] = [];
  for (const rid of metaboliteIndex(model).get(mid) ?? []) {
    const r = model.reactions[rid];
    const coef = r.stoichiometry[mid];
    const { substrates, products } = allowCurrency ? allParticipants(r) : mainParticipants(r, model.metabolites);
    // forward direction: consumed -> produced
    const forwardOk = dir === 'down' ? coef < 0 && r.upperBound > 0 : coef > 0 && r.upperBound > 0;
    const backwardOk = r.lowerBound < 0 && (dir === 'down' ? coef > 0 : coef < 0);
    if (forwardOk) {
      const others = dir === 'down' ? products : substrates;
      for (const o of others) if (o !== mid) out.push({ reactionId: rid, from: dir === 'down' ? mid : o, to: dir === 'down' ? o : mid, reversed: false });
    }
    if (backwardOk) {
      const others = dir === 'down' ? substrates : products;
      for (const o of others) if (o !== mid) out.push({ reactionId: rid, from: dir === 'down' ? mid : o, to: dir === 'down' ? o : mid, reversed: true });
    }
  }
  return out.filter((s) => allowCurrency || !isCurrency(model.metabolites[dir === 'down' ? s.to : s.from]));
}

function allParticipants(r: Reaction) {
  const substrates: ID[] = [];
  const products: ID[] = [];
  for (const [m, c] of Object.entries(r.stoichiometry)) (c < 0 ? substrates : products).push(m);
  return { substrates, products };
}

/** Breadth-first expansion up to `depth` reactions. Skips highly connected hubs to keep maps readable. */
export function expand(model: MetabolicModel, start: ID, dir: 'down' | 'up', depth: number, maxPerLevel = 8): Step[] {
  const steps: Step[] = [];
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next: ID[] = [];
    for (const m of frontier) {
      const ns = neighbours(model, m, dir).slice(0, maxPerLevel);
      for (const s of ns) {
        steps.push(s);
        const o = dir === 'down' ? s.to : s.from;
        if (!seen.has(o)) {
          seen.add(o);
          next.push(o);
        }
      }
    }
    frontier = next;
  }
  return steps;
}

/** Shortest metabolic route (fewest reactions), ignoring currency metabolites unless asked. */
export function shortestPath(
  model: MetabolicModel,
  from: ID,
  to: ID,
  opts: { allowCurrency?: boolean; compartment?: string; maxDepth?: number } = {},
): Step[] | null {
  const prev = new Map<ID, Step>();
  const seen = new Set([from]);
  let frontier = [from];
  const maxDepth = opts.maxDepth ?? 25;
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: ID[] = [];
    for (const m of frontier) {
      for (const s of neighbours(model, m, 'down', opts.allowCurrency)) {
        if (seen.has(s.to)) continue;
        if (opts.compartment && model.metabolites[s.to]?.compartment !== opts.compartment && s.to !== to) continue;
        seen.add(s.to);
        prev.set(s.to, s);
        if (s.to === to) {
          const path: Step[] = [];
          let cur: ID = to;
          while (cur !== from) {
            const st = prev.get(cur)!;
            path.unshift(st);
            cur = st.from;
          }
          return path;
        }
        next.push(s.to);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Find model reaction(s) converting `a` into `b`. Returns direct reactions first;
 * if none, a two-step linear series through a non-currency intermediate (lumped).
 */
export function findConnecting(
  model: MetabolicModel,
  a: ID,
  b: ID,
  preferIds: string[] = [],
  opts: { ec?: string[] } = {},
): { reactionIds: ID[]; reversed: boolean }[] {
  const direct: { reactionIds: ID[]; reversed: boolean }[] = [];
  for (const rid of metaboliteIndex(model).get(a) ?? []) {
    const r = model.reactions[rid];
    const ca = r.stoichiometry[a];
    const cb = r.stoichiometry[b];
    if (ca == null || cb == null || Math.sign(ca) === Math.sign(cb)) continue;
    direct.push({ reactionIds: [rid], reversed: ca > 0 });
  }
  const prefer = new Set(preferIds.map((s) => s.toLowerCase()));
  const ec = new Set(opts.ec ?? []);
  // prefer hinted IDs, then matching EC numbers; reactions spanning compartments (antiporters) come last
  const score = (x: { reactionIds: ID[]; reversed: boolean }) => {
    const r = model.reactions[x.reactionIds[0]];
    const comps = new Set(Object.keys(r.stoichiometry).map((m) => model.metabolites[m]?.compartment));
    return (prefer.has(baseId(x.reactionIds[0]).toLowerCase()) ? -10 : 0) + (r.ec?.some((e) => ec.has(e)) ? -5 : 0) + (comps.size > 1 ? 3 : 0)
      + (x.reversed ? 1 : 0) + Object.keys(r.stoichiometry).length * 0.01;
  };
  if (direct.length) return direct.sort((p, q) => score(p) - score(q));
  // two-step series a -> i -> b
  const series: { reactionIds: ID[]; reversed: boolean }[] = [];
  for (const s1 of neighbours(model, a, 'down')) {
    for (const s2 of neighbours(model, s1.to, 'down')) {
      if (s2.to === b && s2.reactionId !== s1.reactionId) series.push({ reactionIds: [s1.reactionId, s2.reactionId], reversed: s1.reversed });
    }
  }
  return series;
}

export interface Route {
  steps: Step[];
  /** metabolites visited, including start and end */
  mets: ID[];
}

/**
 * Enumerate alternative routes from -> to, shortest first.
 * Depth-first search pruned by the exact remaining distance to the target, so
 * only paths no longer than (shortest + maxExtra) are explored. A node-expansion
 * budget keeps it interactive on genome-scale models.
 */
export function findRoutes(
  model: MetabolicModel,
  from: ID,
  to: ID,
  opts: { maxExtra?: number; limit?: number; allowCurrency?: boolean; maxDepth?: number; budget?: number; allow?: (s: Step) => boolean } = {},
): { routes: Route[]; shortest: number | null; truncated: boolean } {
  // optional step filter (e.g. only reactions carrying flux in the traversed direction)
  const ok = opts.allow ?? (() => true);
  const maxExtra = opts.maxExtra ?? 2;
  const limit = opts.limit ?? 25;
  const maxDepth = opts.maxDepth ?? 14;
  let budget = opts.budget ?? 150000;
  // reverse BFS: distance (in reactions) from every metabolite to the target
  const dist = new Map<ID, number>([[to, 0]]);
  let frontier = [to];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: ID[] = [];
    for (const m of frontier) {
      for (const s of neighbours(model, m, 'up', opts.allowCurrency)) {
        if (!ok(s)) continue;
        if (!dist.has(s.from)) { dist.set(s.from, d); next.push(s.from); }
      }
    }
    frontier = next;
  }
  const shortest = dist.get(from);
  if (shortest == null || from === to) return { routes: [], shortest: null, truncated: false };
  const maxLen = shortest + maxExtra;
  const found: Route[] = [];
  const seenKeys = new Set<string>();
  const path: Step[] = [];
  const visited = new Set<ID>([from]);
  const usedRxn = new Set<ID>();
  let truncated = false;
  const dfs = (m: ID) => {
    if (found.length >= limit * 4) { truncated = true; return; }
    if (--budget <= 0) { truncated = true; return; }
    const options = neighbours(model, m, 'down', opts.allowCurrency)
      .filter((s) => ok(s) && dist.has(s.to) && path.length + 1 + dist.get(s.to)! <= maxLen && !visited.has(s.to) && !usedRxn.has(s.reactionId))
      .sort((a, b) => dist.get(a.to)! - dist.get(b.to)!);
    for (const s of options) {
      path.push(s);
      if (s.to === to) {
        const key = path.map((p) => p.reactionId).join('>');
        if (!seenKeys.has(key)) { seenKeys.add(key); found.push({ steps: [...path], mets: [from, ...path.map((p) => p.to)] }); }
      } else {
        visited.add(s.to); usedRxn.add(s.reactionId);
        dfs(s.to);
        visited.delete(s.to); usedRxn.delete(s.reactionId);
      }
      path.pop();
      if (truncated) return;
    }
  };
  dfs(from);
  found.sort((a, b) => a.steps.length - b.steps.length);
  return { routes: found.slice(0, limit), shortest, truncated: truncated || found.length > limit };
}
