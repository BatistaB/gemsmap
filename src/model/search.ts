import Fuse from 'fuse.js';
import { baseId } from './currency';
import type { MetabolicModel } from './types';

export interface SearchHit {
  kind: 'metabolite' | 'reaction' | 'gene';
  id: string;
  name: string;
  detail: string;
}

const cache = new WeakMap<MetabolicModel, Fuse<SearchHit>>();

function index(model: MetabolicModel): Fuse<SearchHit> {
  let f = cache.get(model);
  if (f) return f;
  const items: SearchHit[] = [
    ...Object.values(model.metabolites).map((m) => ({ kind: 'metabolite' as const, id: m.id, name: m.name, detail: `${m.formula ?? ''} · ${model.compartments[m.compartment] ?? m.compartment}` })),
    ...Object.values(model.reactions).map((r) => ({ kind: 'reaction' as const, id: r.id, name: r.name, detail: [r.subsystem, r.ec?.join(','), r.genes.slice(0, 4).join(' ')].filter(Boolean).join(' · ') })),
    ...Object.values(model.genes).map((g) => ({ kind: 'gene' as const, id: g.id, name: g.name ?? g.id, detail: 'gene' })),
  ];
  f = new Fuse(items, {
    keys: [{ name: 'id', weight: 3 }, { name: 'name', weight: 2 }, { name: 'detail', weight: 0.6 }],
    threshold: 0.34, ignoreLocation: true, includeScore: true,
  });
  cache.set(model, f);
  return f;
}

export function searchModel(model: MetabolicModel | null, q: string, kinds?: SearchHit['kind'][], limit = 30): SearchHit[] {
  if (!model || !q.trim()) return [];
  const exact: SearchHit[] = [];
  const ql = q.trim().toLowerCase();
  // exact / base-id matches first (g6p -> g6p_c, g6p_m)
  for (const m of Object.values(model.metabolites)) if ((!kinds || kinds.includes('metabolite')) && (m.id.toLowerCase() === ql || baseId(m.id).toLowerCase() === ql)) exact.push({ kind: 'metabolite', id: m.id, name: m.name, detail: model.compartments[m.compartment] ?? m.compartment });
  if (!kinds || kinds.includes('reaction')) { const r = Object.values(model.reactions).find((x) => x.id.toLowerCase() === ql); if (r) exact.push({ kind: 'reaction', id: r.id, name: r.name, detail: r.subsystem ?? '' }); }
  const fuzzy = index(model).search(q, { limit: limit * 2 }).map((r) => r.item).filter((h) => (!kinds || kinds.includes(h.kind)) && !exact.some((e) => e.id === h.id && e.kind === h.kind));
  return [...exact, ...fuzzy].slice(0, limit);
}
