/**
 * Lightweight local network around the inspected entity — a navigation aid, not the publication
 * map. Metabolite centre: producing reactions on the left, consuming on the right (by flux sign
 * when a result is active, else by stoichiometric side). Reaction centre: substrates left,
 * products right. Two hops add each neighbour's other reactions. Click any node to navigate.
 */
import { useMemo, useState } from 'react';
import { isCurrency } from '../../model/currency';
import { rem } from '../../ui/uiScale';
import { L, lab, useLab } from '../store';
import type { EntityRef } from '../types';
import { Seg } from './common';

interface N { key: string; ref: EntityRef; label: string; x: number; y: number; center?: boolean }
interface E { a: string; b: string; w: number; dim: boolean }

const COL = 112;
const ROW = 30;
const MAX_PER_COL = 9;

export function LocalNetwork({ center }: { center: EntityRef }) {
  const index = useLab((s) => s.index)!;
  const flux = useLab((s) => L.fluxResult(s));
  const tol = useLab((s) => s.settings.zeroTolerance);
  const showCof = useLab((s) => s.settings.showCofactorsInNetwork);
  const [hops, setHops] = useState<'1' | '2'>('1');

  const g = useMemo(() => {
    const fx = flux?.reactionFluxes ?? null;
    const cur = (id: string) => { if (showCof) return false; const m = index.met.get(id); return isCurrency(m ? { id: m.id, name: m.name, compartment: m.compartment } : undefined); };
    const nodes = new Map<string, N>();
    const edges: E[] = [];
    const cols = new Map<number, string[]>();
    const place = (key: string, ref: EntityRef, label: string, col: number): string | null => {
      if (nodes.has(key)) return key;
      const list = cols.get(col) ?? [];
      if (list.length >= MAX_PER_COL) return null;
      list.push(key);
      cols.set(col, list);
      nodes.set(key, { key, ref, label, x: col * COL, y: 0 });
      return key;
    };
    const v = (rid: string) => fx?.[rid] ?? null;
    const w = (rid: string) => { const x = v(rid); return x == null ? 1 : Math.abs(x) < tol ? 0.6 : 1 + Math.min(4, Math.log10(1 + Math.abs(x)) * 2); };
    const dim = (rid: string) => fx != null && Math.abs(v(rid) ?? 0) < tol;
    const rxnLabel = (rid: string) => rid;
    const metLabel = (mid: string) => index.met.get(mid)?.name || mid;
    /** side of metabolite m in reaction r, in the direction flux actually runs: +1 produced, -1 consumed */
    const role = (rid: string, mid: string) => {
      const c = index.rxn.get(rid)?.stoichiometry[mid] ?? 0;
      const x = v(rid);
      return Math.sign(c * (x != null && Math.abs(x) >= tol ? Math.sign(x) : 1));
    };
    const others = (rid: string, mid: string) => Object.keys(index.rxn.get(rid)?.stoichiometry ?? {}).filter((m) => m !== mid && !cur(m));
    const order = (rids: string[]) => [...rids].sort((a, b) => Math.abs(v(b) ?? 0) - Math.abs(v(a) ?? 0));

    if (center.kind === 'metabolite') {
      const c = place(`m:${center.id}`, center, metLabel(center.id), 0)!;
      nodes.get(c)!.center = true;
      const rids = order(index.metRxns.get(center.id) ?? []);
      for (const rid of rids) {
        const side = role(rid, center.id) > 0 ? -1 : 1; // producers on the left
        const rk = place(`r:${rid}`, { kind: 'reaction', id: rid }, rxnLabel(rid), side);
        if (!rk) continue;
        edges.push(side < 0 ? { a: rk, b: c, w: w(rid), dim: dim(rid) } : { a: c, b: rk, w: w(rid), dim: dim(rid) });
        for (const m of others(rid, center.id).slice(0, 2)) {
          const mk = place(`m:${m}`, { kind: 'metabolite', id: m }, metLabel(m), side * 2);
          if (mk) edges.push(side < 0 ? { a: mk, b: rk, w: w(rid), dim: dim(rid) } : { a: rk, b: mk, w: w(rid), dim: dim(rid) });
          if (mk && hops === '2') {
            for (const r2 of order(index.metRxns.get(m) ?? []).filter((x) => x !== rid).slice(0, 2)) {
              const k2 = place(`r:${r2}`, { kind: 'reaction', id: r2 }, rxnLabel(r2), side * 3);
              if (k2) edges.push({ a: side < 0 ? k2 : mk, b: side < 0 ? mk : k2, w: w(r2), dim: dim(r2) });
            }
          }
        }
      }
    } else if (center.kind === 'reaction') {
      const r = index.rxn.get(center.id);
      const c = place(`r:${center.id}`, center, center.id, 0)!;
      nodes.get(c)!.center = true;
      if (r) {
        const x = v(r.id);
        const flip = x != null && x < -tol;
        for (const [m, coef] of Object.entries(r.stoichiometry)) {
          if (cur(m)) continue;
          const side = (coef < 0) !== flip ? -1 : 1;
          const mk = place(`m:${m}`, { kind: 'metabolite', id: m }, metLabel(m), side);
          if (!mk) continue;
          edges.push(side < 0 ? { a: mk, b: c, w: w(r.id), dim: dim(r.id) } : { a: c, b: mk, w: w(r.id), dim: dim(r.id) });
          const more = order((index.metRxns.get(m) ?? []).filter((y) => y !== r.id)).slice(0, hops === '2' ? 3 : 0);
          for (const r2 of more) {
            const k2 = place(`r:${r2}`, { kind: 'reaction', id: r2 }, r2, side * 2);
            if (!k2) continue;
            const prod = role(r2, m) > 0;
            edges.push(prod ? { a: k2, b: mk, w: w(r2), dim: dim(r2) } : { a: mk, b: k2, w: w(r2), dim: dim(r2) });
          }
        }
      }
    }
    // vertical placement per column
    let minX = 0, maxX = 0, maxRows = 1;
    for (const [col, keys] of cols) {
      keys.forEach((k, i) => { const n = nodes.get(k)!; n.y = (i - (keys.length - 1) / 2) * ROW; });
      minX = Math.min(minX, col * COL); maxX = Math.max(maxX, col * COL); maxRows = Math.max(maxRows, keys.length);
    }
    return { nodes: [...nodes.values()], edges, minX, maxX, h: maxRows * ROW };
  }, [center, index, flux, tol, showCof, hops]);

  if (center.kind !== 'metabolite' && center.kind !== 'reaction') return null;
  const pad = 60;
  const vb = `${g.minX - pad} ${-g.h / 2 - 16} ${g.maxX - g.minX + pad * 2} ${g.h + 32}`;
  const pos = new Map(g.nodes.map((n) => [n.key, n]));
  return (
    <div className="localnet">
      <div className="row between">
        <span className="insp-sub">Local network</span>
        <div className="row gap">
          <label className="check small" title="Show ATP, NAD(P)H, H₂O, H⁺, CO₂…"><input type="checkbox" checked={showCof} onChange={(e) => lab.setSettings({ showCofactorsInNetwork: e.target.checked })} /> cofactors</label>
          <Seg value={hops} options={['1', '2'] as const} onChange={setHops} labels={{ '1': '1 hop', '2': '2 hops' }} />
        </div>
      </div>
      {g.nodes.length <= 1 ? <div className="muted small">No non-cofactor neighbours.</div> : (
        <svg className="localnet-svg" viewBox={vb} style={{ height: rem(Math.min(340, g.h + 40)) }}>
          <defs><marker id="ln-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
          {g.edges.map((e, i) => {
            const a = pos.get(e.a)!, b = pos.get(e.b)!;
            const dx = b.x - a.x;
            const x1 = a.x + Math.sign(dx) * 26, x2 = b.x - Math.sign(dx) * 30;
            return <path key={i} className={`ln-edge ${e.dim ? 'dim' : ''}`} d={`M${x1},${a.y} C${(x1 + x2) / 2},${a.y} ${(x1 + x2) / 2},${b.y} ${x2},${b.y}`} strokeWidth={e.w} markerEnd="url(#ln-arrow)" />;
          })}
          {g.nodes.map((n) => (
            <g key={n.key} className={`ln-node k-${n.ref.kind} ${n.center ? 'center' : ''}`} transform={`translate(${n.x},${n.y})`} onClick={() => !n.center && lab.navigate(n.ref)}>
              <title>{n.ref.id}{n.ref.kind === 'metabolite' ? ` — ${n.label}` : ` — ${index.rxn.get(n.ref.id)?.name ?? ''}`}</title>
              {n.ref.kind === 'reaction' ? <rect x={-27} y={-9} width={54} height={18} rx={4} /> : <rect x={-27} y={-9} width={54} height={18} rx={9} />}
              <text y={3.5} textAnchor="middle">{n.label.length > 11 ? n.label.slice(0, 10) + '…' : n.label}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
