/**
 * Instant multi-field search over the loaded model. Built once per model: each entity gets a
 * normalized haystack of every meaningful field (ids, names, formula, equation, participant names,
 * genes, subsystem, EC, annotations). All query tokens must match; id/name hits rank first.
 * A fuzzy pass (Fuse) only runs when the exact pass finds nothing (typos).
 */
import Fuse from 'fuse.js';
import type { EntityKind, LabModel, ModelIndex } from './types';

export interface Hit { kind: Exclude<EntityKind, 'subsystem'>; id: string; name: string; detail: string; score: number }

interface Entry { kind: Hit['kind']; id: string; name: string; detail: string; idN: string; nameN: string; hay: string }

const SEP = /[\s_\-,;:()[\]{}|/]+/g;
export const normalize = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const collapse = (s: string) => normalize(s).replace(SEP, ' ').trim();
const annText = (a: Record<string, string | string[]> | undefined) =>
  a ? Object.entries(a).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(' ') : v}`).join(' ') : '';

export class SearchIndex {
  entries: Entry[] = [];
  private fuse: Partial<Record<Hit['kind'], Fuse<Entry>>> = {};

  constructor(model: LabModel, index: ModelIndex) {
    const add = (kind: Hit['kind'], id: string, name: string, detail: string, fields: (string | null | undefined)[]) => {
      const raw = fields.filter(Boolean).map((f) => normalize(String(f))).join(' ');
      this.entries.push({ kind, id, name, detail, idN: normalize(id), nameN: normalize(name), hay: `${raw} ${collapse(raw)}` });
    };
    for (const m of model.metabolites) {
      add('metabolite', m.id, m.name || m.id, [m.formula, model.compartments[m.compartment] ?? m.compartment].filter(Boolean).join(' · '),
        [m.id, m.name, m.formula, m.compartment, model.compartments[m.compartment], m.charge != null ? String(m.charge) : '', annText(m.annotation)]);
    }
    for (const r of model.reactions) {
      const metNames = Object.keys(r.stoichiometry).map((x) => index.met.get(x)?.name ?? '').join(' ');
      const geneNames = r.genes.map((g) => index.gene.get(g)?.name ?? '').join(' ');
      add('reaction', r.id, r.name || r.id, r.subsystem ?? r.equation,
        [r.id, r.name, r.equation, metNames, r.subsystem, r.gpr, geneNames, r.ec.join(' '), annText(r.annotation)]);
    }
    for (const g of model.genes) {
      add('gene', g.id, g.name || g.id, `${g.reactions.length} reaction${g.reactions.length === 1 ? '' : 's'}`,
        [g.id, g.name, g.reactions.join(' '), annText(g.annotation)]);
    }
  }

  search(query: string, kinds?: Hit['kind'][], limit = 50): Hit[] {
    const q = normalize(query).trim();
    if (!q) return [];
    const tokens = collapse(q).split(' ').filter(Boolean);
    const out: Hit[] = [];
    for (const e of this.entries) {
      if (kinds && !kinds.includes(e.kind)) continue;
      if (!e.hay.includes(q) && !tokens.every((t) => e.hay.includes(t))) continue;
      let s: number;
      if (e.idN === q) s = 100;
      else if (e.nameN === q) s = 92;
      else if (e.idN.startsWith(q)) s = 80;
      else if (e.nameN.startsWith(q)) s = 72;
      else if (e.idN.includes(q)) s = 55;
      else if (e.nameN.includes(q)) s = 48;
      else s = 20;
      out.push({ kind: e.kind, id: e.id, name: e.name, detail: e.detail, score: s - e.idN.length * 0.01 });
    }
    out.sort((a, b) => b.score - a.score);
    if (out.length) return out.slice(0, limit);
    return this.fuzzy(q, kinds, limit);
  }

  /** All ids of one kind matching the query, ranked (used to filter tables). */
  matchIds(query: string, kind: Hit['kind']): Map<string, number> | null {
    if (!query.trim()) return null;
    const hits = this.search(query, [kind], 1e9);
    return new Map(hits.map((h) => [h.id, h.score]));
  }

  private fuzzy(q: string, kinds: Hit['kind'][] | undefined, limit: number): Hit[] {
    const res: Hit[] = [];
    for (const kind of kinds ?? (['metabolite', 'reaction', 'gene'] as const)) {
      let f = this.fuse[kind];
      if (!f) {
        f = new Fuse(this.entries.filter((e) => e.kind === kind), { keys: [{ name: 'idN', weight: 2 }, { name: 'nameN', weight: 1.5 }], threshold: 0.32, ignoreLocation: true, includeScore: true });
        this.fuse[kind] = f;
      }
      for (const r of f.search(q, { limit })) res.push({ kind, id: r.item.id, name: r.item.name, detail: r.item.detail, score: 10 * (1 - (r.score ?? 1)) });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export function buildIndex(model: LabModel): ModelIndex {
  const met = new Map(model.metabolites.map((m) => [m.id, m]));
  const rxn = new Map(model.reactions.map((r) => [r.id, r]));
  const gene = new Map(model.genes.map((g) => [g.id, g]));
  const metRxns = new Map<string, string[]>();
  const subsystems = new Map<string, string[]>();
  let maxBound = 0;
  for (const r of model.reactions) {
    for (const m of Object.keys(r.stoichiometry)) {
      const l = metRxns.get(m);
      if (l) l.push(r.id); else metRxns.set(m, [r.id]);
    }
    if (r.subsystem) {
      const l = subsystems.get(r.subsystem);
      if (l) l.push(r.id); else subsystems.set(r.subsystem, [r.id]);
    }
    for (const b of [r.lb, r.ub]) if (b != null && Math.abs(b) > maxBound) maxBound = Math.abs(b);
  }
  return { met, rxn, gene, metRxns, subsystems, maxBound: maxBound || 1000 };
}
