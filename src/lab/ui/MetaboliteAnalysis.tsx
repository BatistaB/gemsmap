/**
 * Metabolite analysis: maps every metabolite to MetaNetX / MNXref through the identifiers already in the
 * model, adds the missing cross-references (and missing formulas) to the annotation, and leaves every
 * uncertain case for the user. Nothing here decides chemistry — the backend reports evidence, the user
 * accepts or keeps the original. The curated model is what Export model writes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../ui/icons';
import { rem } from '../../ui/uiScale';
import { lab, useLab } from '../store';
import type { AnnotationItem, AnnotationStatusKind, CurationSummary, MnxCandidate } from '../types';
import { ErrorCard, SectionHead, Seg, Toggle, useDebounced } from './common';
import { VirtualTable, type Col } from './VirtualTable';

const STATUS: Record<AnnotationStatusKind, { label: string; cls: string; hint: string }> = {
  confident: { label: 'Confident', cls: 'ok', hint: 'All identifiers (or the metabolite ID and the main databases) agree on one MetaNetX chemical' },
  doubt: { label: 'Review', cls: 'warn', hint: 'Identifiers disagree, the formula conflicts, or only the ID string / the name matched' },
  unmapped: { label: 'Unmapped', cls: 'none', hint: 'No identifier or exact name known to MetaNetX' },
  skipped: { label: 'Skipped', cls: 'none', hint: 'Pseudo-metabolite (enzyme, pool, biomass component)' },
};
const PHASE: Record<string, string> = { preparing: 'Preparing', identifiers: 'Resolving identifiers', names: 'Exact name lookup', compounds: 'Fetching compound data', deciding: 'Comparing evidence', done: 'Done' };
const NS_LABEL: Record<string, string> = {
  'metanetx.chemical': 'MetaNetX', 'kegg.compound': 'KEGG', chebi: 'ChEBI', 'bigg.metabolite': 'BiGG', 'seed.compound': 'ModelSEED',
  'metacyc.compound': 'MetaCyc', hmdb: 'HMDB', vmhmetabolite: 'VMH', 'sabiork.compound': 'SABIO-RK', lipidmaps: 'LIPID MAPS', slm: 'SwissLipids',
  'kegg.glycan': 'KEGG glycan', inchikey: 'InChIKey',
};
const mnxLink = (id: string) => `https://www.metanetx.org/chem_info/${id}`;

type Filter = 'review' | 'confident' | 'unmapped' | 'curated' | 'all';

function decision(cur: CurationSummary | undefined, id: string): 'auto' | 'user' | 'kept' | null {
  if (!cur) return null;
  const e = cur.entries[id];
  if (e) return e.source;
  return cur.rejectedIds.includes(id) ? 'kept' : null;
}

// ------------------------------------------------------------------ Overview card

export function AnnotationCard() {
  const model = useLab((s) => s.model)!;
  const st = useLab((s) => s.annotation);
  useEffect(() => { lab.loadAnnotation(); }, [model.id]);
  const a = st?.analysis;
  const cur = st?.curation;
  const running = st?.job?.state === 'running';
  const open = () => lab.setSection('annotation');
  return (
    <div className="ov-panel ann-card">
      <div className="row between">
        <div className="insp-sub">Metabolite annotation · MetaNetX</div>
        {a && <span className="muted small">analysed {new Date(a.createdAt).toLocaleDateString()}</span>}
      </div>
      {!a && !running && (
        <>
          <div className="small">Map every metabolite to <b>MetaNetX / MNXref</b> through the identifiers already in the model. Missing cross-references
            (KEGG, ChEBI, BiGG, ModelSEED, MetaCyc, HMDB, InChIKey…) and missing formulas are added to the annotation; uncertain matches wait for your review.
            The curated model can be exported.</div>
          <div><button className="btn primary small" onClick={() => { open(); lab.analyzeAnnotation({ useNames: true, autoApply: true, fillFormulas: true }); }}>
            <Icon name="sparkle" size={13} /> Analyze metabolites</button></div>
        </>
      )}
      {running && <Progress />}
      {a && !running && (
        <>
          <StatusBar s={a.summary} />
          <div className="ann-tiles">
            <button onClick={open}><b className="ok">{a.summary.confident.toLocaleString()}</b><span>confident</span></button>
            <button onClick={open}><b className="warn-text">{a.summary.doubt.toLocaleString()}</b><span>to review</span></button>
            <button onClick={open}><b>{a.summary.unmapped.toLocaleString()}</b><span>unmapped</span></button>
            <button onClick={open}><b>{(cur?.accepted ?? 0).toLocaleString()}</b><span>curated · +{(cur?.identifiers ?? 0).toLocaleString()} IDs{cur?.formulas ? ` · ${cur.formulas} formulas` : ''}</span></button>
          </div>
          <div className="row gap"><button className="btn small" onClick={open}>Open metabolite analysis</button>
            {(cur?.accepted ?? 0) > 0 && <button className="btn small" onClick={() => useLab.setState({ dialog: { kind: 'export-model' } })}><Icon name="export" size={13} /> Export curated model</button>}</div>
        </>
      )}
    </div>
  );
}

function StatusBar({ s }: { s: { total: number; confident: number; doubt: number; unmapped: number; skipped: number } }) {
  const pct = (n: number) => `${(100 * n) / Math.max(1, s.total)}%`;
  return (
    <div className="ann-bar" title={`${s.confident} confident · ${s.doubt} to review · ${s.unmapped} unmapped · ${s.skipped} skipped`}>
      <i className="ok" style={{ width: pct(s.confident) }} /><i className="warn" style={{ width: pct(s.doubt) }} /><i className="none" style={{ width: pct(s.unmapped) }} /><i className="skip" style={{ width: pct(s.skipped) }} />
    </div>
  );
}

function Progress() {
  const job = useLab((s) => s.annotation?.job);
  if (!job) return null;
  const pct = job.total ? Math.round((100 * job.done) / job.total) : 0;
  return (
    <div className="ann-progress">
      <div className="row between small"><span><span className="spinner sm" /> {PHASE[job.phase] ?? job.phase}…</span><span className="muted">{job.total ? `${job.done.toLocaleString()} / ${job.total.toLocaleString()}` : ''}</span></div>
      <div className="ann-bar"><i className="accent" style={{ width: `${pct}%` }} /></div>
      <div className="muted small">Queries MetaNetX in batches; everything is cached locally, so a second run is instant.</div>
    </div>
  );
}

// ------------------------------------------------------------------ page

export function MetaboliteAnalysis() {
  const model = useLab((s) => s.model)!;
  const st = useLab((s) => s.annotation);
  const err = useLab((s) => s.annotationError);
  const [opts, setOpts] = useState({ useNames: true, autoApply: true, fillFormulas: true });
  const [filter, setFilter] = useState<Filter>('review');
  const [q, setQ] = useState('');
  const dq = useDebounced(q).trim().toLowerCase();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => { if (!st) lab.loadAnnotation(); }, [model.id, st]);
  const a = st?.analysis;
  const cur = st?.curation;
  const running = st?.job?.state === 'running';

  const rows = useMemo(() => {
    if (!a) return [];
    return a.items.filter((it) => {
      const d = decision(cur, it.id);
      if (filter === 'review' && !(it.status === 'doubt' && !d)) return false;
      if (filter === 'confident' && it.status !== 'confident') return false;
      if (filter === 'unmapped' && it.status !== 'unmapped') return false;
      if (filter === 'curated' && !(d === 'auto' || d === 'user')) return false;
      return !dq || it.id.toLowerCase().includes(dq) || it.name.toLowerCase().includes(dq) || (it.proposal?.mnx ?? '').toLowerCase().includes(dq);
    });
  }, [a, cur, filter, dq]);
  const item = a?.items.find((it) => it.id === active) ?? null;
  const reviewLeft = a ? a.items.filter((it) => it.status === 'doubt' && !decision(cur, it.id)).length : 0;

  const cols: Col<AnnotationItem>[] = [
    { key: 'status', label: '', width: 74, render: (r) => <span className={`ann-st ${STATUS[r.status].cls}`} title={STATUS[r.status].hint}>{STATUS[r.status].label}</span> },
    { key: 'id', label: 'Metabolite', width: 'minmax(110px, 1fr)', render: (r) => <span className="mono ellipsis" title={r.id}>{r.id}</span> },
    { key: 'name', label: 'Name', width: 'minmax(140px, 2fr)', render: (r) => <span className="ellipsis" title={r.name}>{r.name}</span> },
    { key: 'comp', label: 'Comp.', width: 54, render: (r) => <span className="muted">{r.compartment}</span> },
    { key: 'mnx', label: 'MetaNetX', width: 'minmax(150px, 2fr)', render: (r) => r.proposal ? <span className="ellipsis" title={r.candidates[0]?.name ?? ''}><span className="mono">{r.proposal.mnx}</span> <span className="muted">{r.candidates.find((c) => c.mnx === r.proposal!.mnx)?.name}</span></span> : <span className="muted">—</span> },
    { key: 'add', label: '+IDs', width: 48, align: 'right', render: (r) => <span className="mono">{r.proposal ? Object.values(r.proposal.add).reduce((n, v) => n + v.length, 0) : ''}</span>, title: 'Cross-references that would be added' },
    { key: 'dec', label: 'Model', width: 92, render: (r) => { const d = decision(cur, r.id); return d === 'auto' || d === 'user' ? <span className="ok small">✓ curated{d === 'auto' ? ' (auto)' : ''}</span> : d === 'kept' ? <span className="muted small">kept original</span> : <span className="muted small">—</span>; } },
  ];

  return (
    <div className="lab-page ann-page">
      <SectionHead title="Metabolite analysis" sub="Cross-references from MetaNetX / MNXref, from the identifiers already in the model. Uncertain matches are never applied without you.">
        {cur && cur.accepted > 0 && <button className="btn small" onClick={() => useLab.setState({ dialog: { kind: 'export-model' } })}><Icon name="export" size={13} /> Export curated model</button>}
      </SectionHead>
      <div className="ov-panel ann-run">
        <div className="row gap wrap">
          <button className="btn primary" disabled={running} onClick={() => lab.analyzeAnnotation(opts)}><Icon name="sparkle" size={14} /> {a ? 'Analyze again' : 'Analyze metabolites'}</button>
          <Toggle checked={opts.autoApply} onChange={(v) => setOpts({ ...opts, autoApply: v })} title="Add the cross-references of confident matches to the model right away (each one can be undone)">Apply confident matches</Toggle>
          <Toggle checked={opts.fillFormulas} onChange={(v) => setOpts({ ...opts, fillFormulas: v })} title="Only for metabolites without a formula; MetaNetX formula and charge (pH 7.3)">Fill missing formulas</Toggle>
          <Toggle checked={opts.useNames} onChange={(v) => setOpts({ ...opts, useNames: v })} title="For metabolites without any identifier: exact MetaNetX name match, always left for review">Suggest by exact name</Toggle>
          <span className="grow" />
          {a && <span className="muted small" title={a.source.bigg ? `BiGG tables: ${a.source.bigg.metabolites.toLocaleString()} universal metabolites${a.source.bigg.installed ? `, installed ${a.source.bigg.installed}` : ''}. MetaNetX decides; BiGG adds its IDs and curated cross-references.` : 'BiGG tables not installed (npm run bigg:data): MetaNetX only'}>
            {a.summary.total.toLocaleString()} metabolites · {a.seconds}s · {a.source.service}{a.status === 'partial' ? ' · partial (MetaNetX unreachable for some queries)' : ''}</span>}
        </div>
        {running && <Progress />}
        {a && !running && <StatusBar s={a.summary} />}
        {cur && cur.accepted > 0 && (
          <div className="row gap small">
            <span><b>{cur.accepted.toLocaleString()}</b> metabolites curated · <b>+{cur.identifiers.toLocaleString()}</b> cross-references{cur.formulas ? <> · <b>{cur.formulas}</b> formulas filled</> : null}. Included in exports; the original file is unchanged.</span>
            <span className="grow" />
            <button className="link small" onClick={() => { if (confirm(`Undo all ${cur.accepted} curated metabolites?`)) lab.curate('revert', null); }}>Revert all</button>
          </div>
        )}
      </div>
      {err && <ErrorCard info={err} />}
      {!a && !running && <div className="note small">Nothing analysed yet for this model. The analysis needs an internet connection to <span className="mono">rdf.metanetx.org</span> the first time; results are cached.</div>}
      {a && (
        <div className="ann-split">
          <div className="ann-list">
            <div className="row gap">
              <Seg value={filter} options={['review', 'confident', 'unmapped', 'curated', 'all'] as const} onChange={setFilter}
                labels={{ review: `Needs review (${reviewLeft})`, confident: `Confident (${a.summary.confident})`, unmapped: `Unmapped (${a.summary.unmapped})`, curated: `Curated (${cur?.accepted ?? 0})`, all: 'All' }} />
              <input className="input" style={{ width: rem(200) }} placeholder="Filter id, name, MNX…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="ann-table">
              <VirtualTable rows={rows} cols={cols} rowKey={(r) => r.id} active={active} onRowClick={(r) => setActive(r.id)} onKeyNav={(r) => setActive(r.id)}
                empty={<div className="muted small pad">{filter === 'review' ? 'Nothing left to review.' : 'No metabolites in this view.'}</div>} />
            </div>
          </div>
          <div className="ann-detail">
            {item ? <ItemDetail key={item.id} it={item} cur={cur} /> : <div className="muted small pad">Select a metabolite to see the evidence and decide.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemDetail({ it, cur }: { it: AnnotationItem; cur?: CurationSummary }) {
  const d = decision(cur, it.id);
  const appliedMnx = cur?.entries[it.id]?.mnx;
  const [pick, setPick] = useState<string | undefined>(appliedMnx ?? it.proposal?.mnx ?? it.candidates[0]?.mnx);
  const cand = it.candidates.find((c) => c.mnx === pick);
  const [fill, setFill] = useState(true);
  const canFill = !it.formula && !!cand?.formula;
  const add = pick === it.proposal?.mnx ? it.proposal?.add : undefined;
  return (
    <div className="ann-det">
      <div className="row between"><span className={`ann-st ${STATUS[it.status].cls}`}>{STATUS[it.status].label}</span>
        <button className="link small" onClick={() => lab.navigate({ kind: 'metabolite', id: it.id })}>Open in explorer</button></div>
      <div className="insp-title">{it.name || it.id}</div>
      <div className="mono muted small">{it.id} · {it.compartment}{it.formula ? ` · ${it.formula}` : ' · no formula'}{it.charge != null ? ` · charge ${it.charge}` : ''}</div>
      <div className="small">{it.reason}</div>

      {it.inputs.length > 0 && (
        <div>
          <div className="insp-sub">Identifiers in the model</div>
          <div className="ann-inputs">
            {it.inputs.map((x, i) => (
              <div key={i} className="small"><span className="mono">{x.xref}</span>{x.source === 'id' ? <span className="muted"> (from the ID)</span> : x.source === 'bigg' ? <span className="muted"> (bridge)</span> : null} → {x.mnx.length ? x.mnx.map((m) => <span key={m} className={`mono ${m === pick ? 'strong' : 'muted'}`}>{m} </span>) : <span className="muted">not in MetaNetX</span>}</div>
            ))}
          </div>
        </div>
      )}

      {it.candidates.length > 0 && (
        <div>
          <div className="insp-sub">MetaNetX candidates</div>
          {it.candidates.map((c) => <CandidateRow key={c.mnx} c={c} on={c.mnx === pick} onPick={() => setPick(c.mnx)} />)}
        </div>
      )}

      {cand && (
        <div>
          <div className="insp-sub">{d === 'auto' || d === 'user' ? 'Added to the model' : 'Will be added'}</div>
          {add ? (
            <div className="ann-add">
              {Object.entries(add).map(([ns, vals]) => (
                <div key={ns} className="small"><span className="ann-ns">{NS_LABEL[ns] ?? ns}</span> {vals.map((v) => <span key={v} className="mono chip-id">{v}</span>)}</div>
              ))}
              {!Object.keys(add).length && <div className="muted small">The model already has every cross-reference MetaNetX knows for this chemical.</div>}
            </div>
          ) : <div className="muted small">The cross-references of {cand.mnx} are added when you apply it (existing ones are never duplicated or removed).</div>}
          {canFill && <Toggle checked={fill} onChange={setFill} title="MetaNetX formula and charge (pH 7.3)">Also set formula {cand.formula}{cand.charge != null ? ` (charge ${cand.charge})` : ''}</Toggle>}
        </div>
      )}

      <div className="row gap wrap">
        {cand && <button className="btn primary small" onClick={() => lab.curate('apply', [{ id: it.id, mnx: cand.mnx, fillFormula: fill }])}>
          {d === 'auto' || d === 'user' ? (appliedMnx === cand.mnx ? 'Re-apply' : `Use ${cand.mnx} instead`) : `Apply ${cand.mnx}`}</button>}
        {d !== 'kept' && <button className="btn small" onClick={() => lab.curate('reject', [it.id])} title="Leave this metabolite as it is in the model file">Keep original</button>}
        {(d === 'auto' || d === 'user') && <button className="btn small" onClick={() => lab.curate('revert', [it.id])}>Undo</button>}
      </div>
    </div>
  );
}

function CandidateRow({ c, on, onPick }: { c: MnxCandidate; on: boolean; onPick: () => void }) {
  return (
    <label className={`ann-cand ${on ? 'on' : ''}`}>
      <input type="radio" checked={on} onChange={onPick} />
      <div className="grow">
        <div><a className="mono" href={mnxLink(c.mnx)} target="_blank" rel="noreferrer">{c.mnx}</a> {c.name ?? <span className="muted">(no name)</span>}</div>
        <div className="muted small">
          {c.formula ? <>{c.formula}{c.charge != null ? ` (${c.charge > 0 ? '+' : ''}${c.charge})` : ''} </> : 'no structure '}
          {c.formulaCheck === 'match' && <span className="ok">✓ formula</span>}{c.formulaCheck === 'conflict' && <span className="warn-text">✗ formula differs</span>}
          {c.nameMatch && <span className="ok"> ✓ name</span>}
          {c.bigg && c.bigg.length > 0 && <span title="BiGG universal metabolite (local BiGG tables)"> · BiGG <span className="mono">{c.bigg.join(', ')}</span></span>}
        </div>
        {c.fromBigg && <div className="muted small">described by the local BiGG tables only — MetaNetX gave no data</div>}
        <div className="muted small">via {c.via.slice(0, 5).join(', ')}{c.via.length > 5 ? ` +${c.via.length - 5}` : ''}</div>
      </div>
    </label>
  );
}
