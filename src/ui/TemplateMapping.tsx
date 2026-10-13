/**
 * Template mapping workflow UI: gallery coverage badges, the mapping review
 * dialog (shown before a pathway template is drawn), and the per-node
 * resolver in the Inspector (click an open slot → pick a candidate).
 *
 * Status colours belong to this workflow only; they are UI-only on the canvas
 * and never exported.
 */
import { useMemo, useState } from 'react';
import { download } from '../export/export';
import { searchModel } from '../model/search';
import type { MetabolicModel } from '../model/types';
import { A, useStore } from '../store/store';
import { specById } from '../templates/instantiate';
import { COMPARTMENT_LABEL } from '../templates/mapping/compartments';
import { isMapped, mappingReport, mapTemplate, type Candidate, type Confidence, type MappingStatus, type SlotResult, type TemplateMapping } from '../templates/mapping/engine';
import { entityOf } from '../templates/mapping/library';
import { findSlot } from '../templates/pathways';
import { indexModel } from '../templates/mapping/modelIndex';
import { loadProfile, saveProfile, withEntry } from '../templates/mapping/profile';
import type { PathwayTemplateSpec } from '../templates/spec';
import type { NodeGlyph } from '../viz/types';
import { Modal } from './Dialogs';

export const STATUS_META: Record<MappingStatus, { icon: string; label: string; color: string }> = {
  confirmed: { icon: '✓', label: 'Confirmed', color: '#15803d' },
  auto_high: { icon: '✓', label: 'Mapped automatically', color: '#15803d' },
  provisional: { icon: '?', label: 'Provisional — review', color: '#b45309' },
  ambiguous: { icon: '?', label: 'Needs your choice', color: '#b45309' },
  unresolved: { icon: '○', label: 'Unresolved', color: '#8d90a0' },
  absent: { icon: '✕', label: 'Absent from model', color: '#8d90a0' },
};
const CONF_LABEL: Record<Confidence, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Mapping of a template onto the current model (memoised per model / overrides). */
export function useTemplateMapping(spec: PathwayTemplateSpec | undefined, model: MetabolicModel | null, overrides?: Record<string, string | null>, rev = 0) {
  return useMemo(() => {
    if (!spec || !model) return null;
    const profile = loadProfile(indexModel(model).fingerprint);
    return mapTemplate(spec, model, { profile, overrides });
  }, [spec, model, overrides, rev]);
}

// ------------------------------------------------------------ gallery badge

const coverageCache = new WeakMap<MetabolicModel, Map<string, { stamp: string; r: TemplateMapping }>>();
/** Cached mapping for gallery cards; recomputed when the model's mapping profile changes. */
export function galleryMapping(spec: PathwayTemplateSpec, model: MetabolicModel): TemplateMapping {
  let m = coverageCache.get(model);
  if (!m) { m = new Map(); coverageCache.set(model, m); }
  const profile = loadProfile(indexModel(model).fingerprint);
  const stamp = profile?.updated ?? '';
  let hit = m.get(spec.id);
  if (!hit || hit.stamp !== stamp) { hit = { stamp, r: mapTemplate(spec, model, { profile }) }; m.set(spec.id, hit); }
  return hit.r;
}

/** "10/11" core-metabolite badge with a tooltip that keeps coverage and confidence apart. */
export function TemplateCoverageBadge({ spec, model }: { spec: PathwayTemplateSpec; model: MetabolicModel }) {
  const r = galleryMapping(spec, model);
  const c = r.coverage;
  const full = c.coreMapped === c.core;
  const review = r.slots.filter((s) => s.status === 'provisional' || s.status === 'ambiguous').length;
  const exp = [...new Set(r.slots.map((s) => s.expected.expected).filter(Boolean))].map((x) => COMPARTMENT_LABEL[x!]).join(' + ');
  const title = `Template match / model coverage (not pathway activity)\n`
    + `Core metabolites: ${c.coreMapped}/${c.core} · core reactions: ${c.coreReactionsMapped}/${c.coreReactions}\n`
    + `Expected: ${spec.compartmentSummary}; in this model: ${exp || '—'}\n`
    + `${review ? `${review} slot(s) need review · ` : ''}mapping quality: ${CONF_LABEL[r.quality]}`;
  return <span className={`tag ${full ? 'on' : c.coreMapped / Math.max(1, c.core) < 0.6 ? 'warn' : ''}`} title={title}>{c.coreMapped}/{c.core}{review ? ' ?' : ''}</span>;
}

// ------------------------------------------------------------ review dialog

export function TemplateMappingDialog({ templateId, at, onClose }: { templateId: string; at?: { x: number; y: number }; onClose: () => void }) {
  const spec = specById(templateId);
  const model = useStore((s) => s.model);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const res = useTemplateMapping(spec, model, overrides);
  // the review list is fixed by the automatic result, so a row stays visible after you resolve it
  const auto0 = useTemplateMapping(spec, model);
  if (!spec || !model || !res || !auto0) return null;

  const needs = new Set(auto0.slots.filter((s) => s.status === 'provisional' || s.status === 'ambiguous' || s.status === 'unresolved').map((s) => s.slot.slot));
  const review = res.slots.filter((s) => needs.has(s.slot.slot));
  const auto = res.slots.filter((s) => s.status === 'auto_high' || s.status === 'confirmed');
  const shown = showAll ? res.slots : review;
  const choose = (slot: string, id: string | null | undefined) => {
    setOverrides((o) => { const n = { ...o }; if (id === undefined) delete n[slot]; else n[slot] = id; return n; });
  };
  const create = () => {
    // user choices made here become part of this model's mapping profile
    const ix = indexModel(model);
    let prof = loadProfile(ix.fingerprint);
    for (const s of res.slots) {
      if (!(s.slot.slot in overrides)) continue;
      prof = withEntry(prof, { fingerprint: ix.fingerprint, id: model.id, name: model.name }, { entity: s.entity.id, compartment: s.expected.expected, metaboliteId: overrides[s.slot.slot], templateId: spec.id, templateVersion: spec.version });
    }
    if (prof) saveProfile(prof);
    A().instantiatePathway(spec, res, at);
    onClose();
  };
  const c = res.coverage;
  return (
    <Modal title={`${spec.name} → ${model.name}`} onClose={onClose} width={720}>
      <div className="tm-summary">
        <span className="tm-pill ok">✓ {auto.length} mapped</span>
        <span className="tm-pill warn">? {res.slots.filter((s) => s.status === 'provisional' || s.status === 'ambiguous').length} to review</span>
        <span className="tm-pill">○ {res.slots.filter((s) => s.status === 'unresolved' || s.status === 'absent').length} open</span>
        <span className="grow" />
        <span className="muted small" title="Pathway coverage (how much of the template exists in the model) is reported separately from mapping confidence.">
          Coverage <b>{c.coreMapped}/{c.core}</b> core metabolites · <b>{c.coreReactionsMapped}/{c.coreReactions}</b> core reactions · quality <b>{CONF_LABEL[res.quality]}</b>
        </span>
      </div>
      <div className="muted small">{res.context.summary}. Expected compartment: <b>{spec.compartmentSummary}</b>. Structure in the model only — not evidence of flux.</div>
      {res.notes.map((n) => <div key={n} className="tm-note">{n}</div>)}
      <div className="row between">
        <div className="seg">
          <button className={!showAll ? 'on' : ''} onClick={() => setShowAll(false)}>Needs review ({review.length})</button>
          <button className={showAll ? 'on' : ''} onClick={() => setShowAll(true)}>Review all mappings ({res.slots.length})</button>
        </div>
      </div>
      <div className="tm-list">
        {!shown.length && <div className="muted small pad">Every slot was mapped with high confidence. <button className="link" onClick={() => setShowAll(true)}>Review all mappings</button></div>}
        {shown.map((s) => (
          <SlotRow key={s.slot.slot} s={s} model={model} expanded={open === s.slot.slot} onToggle={() => setOpen((o) => (o === s.slot.slot ? null : s.slot.slot))}
            onChoose={(id) => choose(s.slot.slot, id)} overridden={s.slot.slot in overrides} />
        ))}
      </div>
      <div className="row gap end">
        <button className="btn" title="Reproducibility report: every mapping with its evidence, method and versions" onClick={() => download(`${spec.id}_mapping_${model.id}.json`, JSON.stringify(mappingReport(res, spec), null, 1), 'application/json')}>Export report</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={create}>Create pathway</button>
      </div>
    </Modal>
  );
}

function SlotRow({ s, model, expanded, onToggle, onChoose, overridden }: {
  s: SlotResult; model: MetabolicModel; expanded: boolean; onToggle: () => void; onChoose: (id: string | null | undefined) => void; overridden: boolean;
}) {
  const st = STATUS_META[s.status];
  const cur = s.chosen && isMapped(s.status) ? s.chosen : undefined;
  return (
    <div className={`tm-row ${expanded ? 'open' : ''}`}>
      <button className="tm-row-head" onClick={onToggle}>
        <span className="tm-status" style={{ color: st.color }} title={st.label}>{st.icon}</span>
        <span className="tm-slot"><b>{s.entity.name}</b>{s.slot.level !== 'required' && <span className="tag">{s.slot.level}</span>}</span>
        <span className="muted small">{s.expected.expected ? COMPARTMENT_LABEL[s.expected.expected] : '—'}</span>
        <span className="grow" />
        {cur ? <><span className="mono">{cur.metId}</span><ConfTag c={cur.confidence} /></> : <span className="muted small">{s.status === 'absent' ? 'absent' : s.status === 'ambiguous' ? 'choose…' : 'unresolved'}</span>}
      </button>
      {expanded && (
        <div className="tm-row-body">
          <div className="small" style={{ color: st.color }}>{s.reason}</div>
          {s.staleProfile && <div className="small muted">{s.staleProfile}</div>}
          <CandidateList s={s} onPick={(id) => onChoose(id)} />
          <ManualSearch model={model} initial={s.entity.name} onPick={(id) => onChoose(id)} />
          <div className="row gap">
            <button className="btn small" onClick={() => onChoose(null)} title="The model does not contain this entity; keep a placeholder">Mark absent</button>
            {overridden && <button className="btn small" onClick={() => onChoose(undefined)}>Back to automatic</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConfTag({ c }: { c: Confidence }) {
  return <span className={`tm-conf ${c}`}>{CONF_LABEL[c]}</span>;
}

/** Ranked candidates with their evidence ("Why this match?"). */
export function CandidateList({ s, onPick, current }: { s: SlotResult; onPick: (id: string) => void; current?: string }) {
  const [why, setWhy] = useState<string | null>(null);
  const chosen = current ?? (s.chosen && isMapped(s.status) ? s.chosen.metId : undefined);
  if (!s.candidates.length) return <div className="muted small">No candidate found by identifiers, names or formula.</div>;
  return (
    <div className="tm-cands">
      {s.candidates.map((c) => (
        <div key={c.metId} className={`tm-cand ${c.metId === chosen ? 'on' : ''}`}>
          <div className="row gap">
            <input type="radio" checked={c.metId === chosen} onChange={() => onPick(c.metId)} disabled={!!c.usedBy} />
            <button className="tm-cand-main" onClick={() => !c.usedBy && onPick(c.metId)} disabled={!!c.usedBy}>
              <span className="mono">{c.metId}</span> <span>{c.name}</span> <span className="muted small">{c.compartmentLabel}</span>
            </button>
            <ConfTag c={c.confidence} />
            <span className="muted small" title="Ranking score (heuristic, not a probability)">{Math.round(c.score * 100)}</span>
            <button className="link small" onClick={() => setWhy((w) => (w === c.metId ? null : c.metId))}>why?</button>
          </div>
          <div className="muted small tm-cand-sum">{c.usedBy ? `already used for slot “${c.usedBy}”` : c.summary}</div>
          {why === c.metId && <Evidence c={c} />}
        </div>
      ))}
    </div>
  );
}

export function Evidence({ c }: { c: Candidate }) {
  return (
    <ul className="tm-evidence">
      {c.evidence.map((e, i) => (
        <li key={i} className={e.ok === true ? 'ok' : e.ok === false ? 'bad' : ''}><span>{e.ok === true ? '✓' : e.ok === false ? '✗' : '·'}</span>{e.text}</li>
      ))}
      <li className="muted"><span>Σ</span>identity {c.identity} × compartment {c.compartmentFactor} × topology {c.topologyFactor} = {c.score}</li>
    </ul>
  );
}

/** "Search model manually": the same model search as the rest of the Map Builder. */
export function ManualSearch({ model, initial, onPick }: { model: MetabolicModel; initial: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [on, setOn] = useState(false);
  const hits = useMemo(() => (on && q ? searchModel(model, q, ['metabolite'], 12) : []), [model, q, on]);
  if (!on) return <button className="link small" onClick={() => { setOn(true); setQ(initial); }}>Search all model metabolites…</button>;
  return (
    <div className="tm-search">
      <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search metabolites (name, ID, formula)…" />
      <div className="list">
        {hits.map((h) => (
          <button key={h.id} className="list-item" onClick={() => { onPick(h.id); setOn(false); }}>
            <div className="li-top"><b className="mono">{h.id}</b><span>{h.name}</span><span className="muted small">{h.detail}</span></div>
          </button>
        ))}
        {q && !hits.length && <div className="muted small pad">No match.</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ inspector section

/** Inspector block for a node created from a pathway template: expected identity, status, candidates, override. */
export function TemplateSlotSection({ n }: { n: NodeGlyph }) {
  const model = useStore((s) => s.model);
  const t = n.template!;
  const spec = specById(t.templateId);
  const [rev, setRev] = useState(0);
  const res = useTemplateMapping(spec, model, undefined, rev);
  const slotId = spec ? findSlot(spec, t.slot)?.slot : undefined;
  const s = res?.slots.find((x) => x.slot.slot === slotId);
  const ent = spec ? entityOf(spec, t.entity) : undefined;
  const st = STATUS_META[t.status];
  const a = A();
  const pick = (id: string | null | undefined) => { a.setTemplateMapping(n.id, id); setRev((r) => r + 1); };
  return (
    <div className="section">
      <div className="section-title">Template mapping</div>
      <div className="small">Expected: <b>{ent?.name ?? t.entity}</b>{t.compartment ? <> · {COMPARTMENT_LABEL[t.compartment as keyof typeof COMPARTMENT_LABEL]}</> : null}</div>
      <div className="small" style={{ color: st.color }}>{st.icon} {st.label}{n.metaboliteId ? <> — <span className="mono">{n.metaboliteId}</span></> : null}{t.method ? <span className="muted"> · {t.method}</span> : null}</div>
      <div className="muted small">{spec?.name ?? t.templateId} v{t.templateVersion}</div>
      {!model && <div className="muted small">Load a GEM to map this slot.</div>}
      {model && s && (
        <>
          <div className="small muted">Suggested model metabolites:</div>
          <CandidateList s={s} current={n.metaboliteId} onPick={(id) => pick(id)} />
          <ManualSearch model={model} initial={ent?.name ?? ''} onPick={(id) => pick(id)} />
          <div className="row gap wrap">
            {t.status === 'provisional' && n.metaboliteId && <button className="btn small primary" onClick={() => pick(n.metaboliteId)}>Confirm</button>}
            {n.metaboliteId && <button className="btn small" onClick={() => pick(undefined)}>Clear mapping</button>}
            {t.status !== 'absent' && <button className="btn small" onClick={() => pick(null)} title="Keep the node as a placeholder">Mark absent</button>}
          </div>
        </>
      )}
    </div>
  );
}
