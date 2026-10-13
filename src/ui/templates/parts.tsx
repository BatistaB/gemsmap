/** Small shared pieces of the Template Builder UI. */
import { useState } from 'react';
import type { Completeness, IdentifierTable, IdentityState, IdentityStatus, Provenance, TemplateFile, TemplateMetadata } from '../../templates/format/schema';
import { NS_LABEL, normalizeXref, type Namespace } from '../../templates/mapping/identifiers';

export const IDENTITY_META: Record<IdentityStatus, { icon: string; label: string; cls: string; help: string }> = {
  confirmed: { icon: '✓', label: 'Confirmed', cls: 'confirmed', help: 'Chosen or reviewed by a person' },
  suggested: { icon: '?', label: 'Suggested', cls: 'suggested', help: 'Proposed by a database search, Auto Identify or AI — not reviewed yet' },
  ambiguous: { icon: '⚠', label: 'Ambiguous', cls: 'ambiguous', help: 'Several plausible candidates — choose one' },
  unresolved: { icon: '○', label: 'Unresolved', cls: 'unresolved', help: 'Identity not defined yet' },
};

export function StatusBadge({ status, conflict, compact, confidence }: { status: IdentityStatus; conflict?: boolean; compact?: boolean; confidence?: IdentityState['confidence'] }) {
  const m = IDENTITY_META[status];
  const conf = status === 'suggested' && confidence ? confidence : undefined;
  return (
    <span className={`id-badge ${m.cls}${conf === 'probable' ? ' probable' : ''}`} title={`${m.label}${conf ? ` (${conf} confidence)` : ''}: ${m.help}${conflict ? '\nPotential identity conflict — review it' : ''}`}>
      {m.icon}{!compact && <> {m.label}{conf && <span className="id-conf"> · {conf}</span>}</>}{conflict && <b className="id-conflict"> !</b>}
    </span>
  );
}

/** A class of compounds or proteins (KEGG "generic"): matched by name and class, never as one exact molecule. */
export const GenericTag = () => <span className="tag generic" title="Generic entity — a class of molecules (e.g. any protein with a phospho-histidine), not one exact compound">generic</span>;

/** Where an element came from: "KEGG C00031", linked. */
export function ProvenanceLine({ p }: { p: Provenance[] }) {
  if (!p.length) return null;
  return (
    <span className="small muted">
      From {p.map((x, i) => <span key={x.source + x.id}>{i ? ', ' : ''}{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.source} {x.id}</a> : `${x.source} ${x.id}`}</span>)}
    </span>
  );
}

export const REVIEW_LABEL: Record<NonNullable<TemplateMetadata['review_status']>, string> = {
  'ai-generated': 'AI-generated — needs review', 'ai-validated': 'AI-validated', 'human-reviewed': 'Human-reviewed',
};

export function ReviewTag({ md }: { md: TemplateMetadata }) {
  if (!md.review_status) return null;
  return <span className={`tag review ${md.review_status}`} title={md.last_review ? `Last review ${md.last_review}` : 'Identities and layout were produced by an AI curator; a person has not reviewed them yet'}>{REVIEW_LABEL[md.review_status]}</span>;
}

const ORDER: Namespace[] = ['metanetx.chemical', 'kegg.compound', 'chebi', 'bigg.metabolite', 'seed.compound', 'metacyc.compound', 'hmdb', 'inchikey',
  'metanetx.reaction', 'kegg.reaction', 'rhea', 'bigg.reaction', 'seed.reaction', 'metacyc.reaction', 'vmh', 'lipidmaps', 'pubchem.compound', 'reactome'];

/** "KEGG C00031 · ChEBI 17634 · BiGG glc__D …" */
export function IdentifierLine({ ids, max = 6 }: { ids: IdentifierTable; max?: number }) {
  const parts = ORDER.flatMap((ns) => (ids[ns] ?? []).slice(0, ns === 'chebi' ? 2 : 1).map((v) => `${NS_LABEL[ns]} ${v}`));
  if (!parts.length) return <span className="muted small">no database identifier</span>;
  return <span className="mono small id-line" title={parts.join('\n')}>{parts.slice(0, max).join(' · ')}{parts.length > max ? ` · +${parts.length - max}` : ''}</span>;
}

/** Editable identifier list of one namespace (comma separated); invalid values are flagged, never silently dropped. */
export function IdentifierField({ ns, values, onChange }: { ns: Namespace; values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? values.join(', ');
  const parsed = shown.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const bad = parsed.filter((v) => !normalizeXref(ns, v));
  return (
    <label className="field id-field">
      <span>{NS_LABEL[ns]}</span>
      <input className={`input mono ${bad.length ? 'bad' : ''}`} value={shown} placeholder="—" spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== null) { onChange(parsed); setText(null); } }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        title={bad.length ? `Not a valid ${NS_LABEL[ns]} identifier: ${bad.join(', ')}` : undefined} />
    </label>
  );
}

/** Transparent completeness: the three ratios and their mean. */
export function CompletenessBlock({ c }: { c: Completeness }) {
  const row = (label: string, a: number, b: number) => (
    <div className="cmp-row" key={label}>
      <span>{label}</span>
      <span className="cmp-bar"><i style={{ width: `${b ? (a / b) * 100 : 100}%` }} /></span>
      <span className="mono">{a}/{b}</span>
    </div>
  );
  return (
    <div className="tpl-cmp" title="Overall = mean of the two identity ratios (compartments are optional). Identified = at least one database identifier (or EC for reactions) and a confirmed or suggested identity.">
      {row('Metabolites identified', c.metabolitesIdentified, c.metabolites)}
      {row('Reactions identified', c.reactionsIdentified, c.reactions)}
      <div className="cmp-row muted" title="Optional: a preferred compartment ranks the matcher's candidates; without one, you choose the compartment when mapping onto a GEM"><span>Preferred compartments</span><span>optional</span><span className="mono">{c.compartmentsDefined}/{c.metabolites}</span></div>
      <div className="cmp-row total"><span>Overall</span><span /><span className="mono">{Math.round(c.overall * 100)}%</span></div>
    </div>
  );
}

/** Preview of a template drawing (nodes, arrows, ports) for library cards. */
export function TemplatePreview({ f, w = 220, h = 130 }: { f: TemplateFile; w?: number; h?: number }) {
  // cofactors drawn beside their arrows are details, not part of the preview
  const nodes = f.layout.nodes.filter((n) => !n.attach);
  const pts = [...nodes, ...f.layout.ports];
  if (!pts.length) return <svg width={w} height={h} className="tpl-preview"><text x={w / 2} y={h / 2} textAnchor="middle" fontSize={11} fill="#8d90a0">empty</text></svg>;
  const xs = pts.map((n) => n.x), ys = pts.map((n) => n.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), bw = Math.max(...xs) - x0 || 1, bh = Math.max(...ys) - y0 || 1;
  const pad = 12, k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, 1.2);
  const P = (x: number, y: number) => [(x - x0) * k + (w - bw * k) / 2, (y - y0) * k + (h - bh * k) / 2];
  const at = new Map(pts.map((n) => [n.id, n]));
  const status = new Map(f.biology.metabolites.map((m) => [m.id, f.biology.entities.find((e) => e.id === m.entity)?.identity.status ?? 'unresolved']));
  return (
    <svg width={w} height={h} className="tpl-preview">
      {f.layout.reactions.map((r, i) => r.sources.flatMap((s) => r.targets.map((t) => {
        const a = at.get(s), b = at.get(t);
        if (!a || !b) return null;
        const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
        return <line key={`${i}-${s}-${t}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5d6070" strokeOpacity={0.55} strokeWidth={1} />;
      })))}
      {f.layout.ports.map((p) => { const a = at.get(p.from); if (!a) return null; const [x1, y1] = P(a.x, a.y), [x2, y2] = P(p.x, p.y); return <line key={p.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8d90a0" strokeDasharray="2 2" />; })}
      {nodes.map((n) => { const [x, y] = P(n.x, n.y); const st = status.get(n.metabolite); return <circle key={n.id} cx={x} cy={y} r={2.6} fill={st === 'confirmed' ? '#262c8c' : st === 'unresolved' ? '#fff' : '#d97706'} stroke="#262c8c" strokeWidth={0.8} />; })}
      {f.layout.ports.map((p) => { const [x, y] = P(p.x, p.y); return <rect key={p.id} x={x - 5} y={y - 3} width={10} height={6} rx={2} fill="#fff" stroke="#8d90a0" strokeDasharray="1.5 1" />; })}
    </svg>
  );
}
