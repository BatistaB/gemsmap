/**
 * BiGG data layer (through the backend): the universal metabolite and reaction tables of BiGG Models,
 * installed locally once (`npm run bigg:data`). GEMs MAP never calls the BiGG API; these tables feed the
 * identity search and give templates the BiGG IDs that models downloaded from BiGG use.
 */
import { create } from 'zustand';
import type { IdentifierTable, TemplateFile } from '../format/schema';

const BASE = (import.meta.env?.VITE_COBRA_API as string | undefined) ?? '/api';

export interface BiggStatus { available: boolean; source: string; installed?: string; metabolites?: number; reactions?: number; install?: string }

interface BiggState { status: BiggStatus | null; offline: boolean }
export const useBigg = create<BiggState>(() => ({ status: null, offline: false }));

export async function refreshBiggStatus() {
  try {
    const r = await fetch(`${BASE}/bigg/status`);
    if (!r.ok) throw new Error(String(r.status));
    useBigg.setState({ status: (await r.json()) as BiggStatus, offline: false });
  } catch { useBigg.setState({ offline: true }); }
}

export type BiggIdResult =
  | { status: 'none'; notes?: string[] }
  | { status: 'known'; bigg: string }
  | { status: 'one'; bigg: string; name: string; identifiers?: IdentifierTable; ec?: string[]; equation?: string; score?: number }
  | { status: 'several'; candidates: { bigg: string; name: string; score?: number }[] };

export interface BiggIds { available: boolean; entities: Record<string, BiggIdResult>; reactions: Record<string, BiggIdResult> }

/** BiGG universal IDs for every entity (through its identifiers) and reaction (through its participants) of a template. */
export async function fetchBiggIds(f: TemplateFile): Promise<BiggIds> {
  const mets = new Map(f.biology.metabolites.map((m) => [m.id, m]));
  const ents = new Map(f.biology.entities.map((e) => [e.id, e]));
  const body = {
    entities: f.biology.entities.map((e) => ({ id: e.id, identifiers: e.identifiers })),
    reactions: f.biology.reactions.map((r) => ({
      id: r.id, ec: r.ec, identifiers: r.identifiers,
      participants: r.participants.map((p) => {
        const m = mets.get(p.metabolite);
        const e = m && ents.get(m.entity);
        return { name: e?.name, identifiers: e?.identifiers ?? {}, coefficient: p.coefficient, main: p.main, compartment: r.compartment ?? m?.compartment ?? undefined };
      }),
    })),
  };
  const res = await fetch(`${BASE}/identity/bigg-ids`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`backend ${res.status}`);
  return (await res.json()) as BiggIds;
}
