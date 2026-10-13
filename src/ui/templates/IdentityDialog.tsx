/**
 * "Define identity": the fast path of the Template Builder. Double-click a node,
 * type a name, pick a candidate — the node now represents that compound.
 * Candidates come from the GEMs MAP library (instantly, offline) and from KEGG /
 * ChEBI / MetaNetX when the backend runs. Picking one is a human confirmation.
 */
import { useEffect, useMemo, useState } from 'react';
import { designActions } from '../../templates/design/actions';
import { isPlaceholderLabel } from '../../templates/design/convert';
import { equationText, searchIdentities, searchLocal, searchReactionDatabases, searchReactionLibrary } from '../../templates/design/identitySearch';
import { mergeCandidates, type IdentityCandidate, type ReactionCandidate } from '../../templates/format/identity';
import { COMPARTMENTS, METABOLITE_NAMESPACES, type ConceptualCompartment, type IdentifierTable } from '../../templates/format/schema';
import { NS_LABEL } from '../../templates/mapping/identifiers';
import { useStore } from '../../store/store';
import { Modal } from '../Dialogs';
import { IdentifierLine, StatusBadge } from './parts';

const close = () => useStore.setState({ dialog: null });

export function IdentityDialog({ nodeId, entityId, reactionId, query }: { nodeId?: string; entityId?: string; reactionId?: string; query?: string }) {
  const design = useStore((s) => s.design);
  const node = useStore((s) => (nodeId ? s.doc.nodes[nodeId] : undefined));
  if (!design) return null;
  if (reactionId || node?.design?.kind === 'port') return reactionId ? <ReactionIdentity reactionId={reactionId} /> : null;
  const metId = node?.design?.kind === 'metabolite' ? node.design.id : design.biology.metabolites.find((m) => m.entity === entityId)?.id;
  if (!metId) return null;
  return <MetaboliteIdentity metId={metId} query={query} />;
}

function MetaboliteIdentity({ metId, query }: { metId: string; query?: string }) {
  const design = useStore((s) => s.design)!;
  const m = design.biology.metabolites.find((x) => x.id === metId);
  const e = m && design.biology.entities.find((x) => x.id === m.entity);
  const initial = query ?? (e && e.name !== 'New metabolite' ? e.name : !isPlaceholderLabel(m?.label) ? m?.label ?? '' : '');
  const [q, setQ] = useState(initial);
  const [display, setDisplay] = useState(m?.label && !isPlaceholderLabel(m.label) ? m.label : '');
  const [remote, setRemote] = useState<{ q: string; c: IdentityCandidate[]; online: boolean; note?: string; sources?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const [manual, setManual] = useState(false);
  const local = useMemo(() => searchLocal(q), [q]);
  useEffect(() => {
    if (q.trim().length < 2) { setRemote(null); return; }
    let live = true;
    const t = setTimeout(() => {
      setBusy(true);
      searchIdentities(q).then((r) => { if (live) setRemote({ q, c: r.candidates, online: r.online, note: r.note, sources: r.sources }); }).finally(() => live && setBusy(false));
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  if (!m || !e) return null;
  const cands = remote && remote.q === q ? remote.c : mergeCandidates([local]);
  const pick = (c: IdentityCandidate) => { designActions.assignIdentity(metId, c, display); close(); };
  return (
    <Modal title="Define identity — template entity" onClose={close} width={640}>
      <div className="muted small">A template node is an abstract biological entity, not a model metabolite. Choose the compound it stands for; the matcher finds what the compound is called in each GEM later.</div>
      <div className="row gap">
        <label className="field grow"><span>Display name</span><input className="input" value={display} placeholder={e.short || e.name} onChange={(ev) => setDisplay(ev.target.value)} /></label>
        <label className="field"><span>Compartment</span>
          <select className="input" value={m.compartment ?? ''} onChange={(ev) => designActions.updateMetabolite(m.id, { compartment: (ev.target.value || null) as ConceptualCompartment | null })}>
            <option value="">— none —</option>
            {COMPARTMENTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <div className="row gap small"><span className="muted">Current identity:</span><b>{e.name}</b><StatusBadge status={e.identity.status} conflict={!!e.identity.conflict} /><IdentifierLine ids={e.identifiers} max={3} /></div>
      {e.identity.status === 'ambiguous' && !!e.identity.candidates?.length && (
        <div className="notice small">
          <b>Ambiguous:</b> {e.identity.note}
          <div className="id-cands">
            {e.identity.candidates.map((c, i) => (
              <button key={i} className="btn small" onClick={() => { designActions.chooseCandidate(e.id, i); close(); }}>{c.name} <span className="muted"><IdentifierLine ids={c.identifiers} max={2} /></span></button>
            ))}
          </div>
        </div>
      )}
      <input className="input big" autoFocus placeholder="Search compound: name, synonym, KEGG C00031, CHEBI:17634, MNXM…" value={q}
        onChange={(ev) => { setQ(ev.target.value); setSel(0); }}
        onKeyDown={(ev) => {
          if (ev.key === 'ArrowDown') { setSel((s) => Math.min(cands.length - 1, s + 1)); ev.preventDefault(); }
          if (ev.key === 'ArrowUp') { setSel((s) => Math.max(0, s - 1)); ev.preventDefault(); }
          if (ev.key === 'Enter' && cands[sel]) pick(cands[sel]);
        }} />
      <div className="row gap small muted">
        {busy ? <><span className="spinner sm" /> searching BiGG, KEGG, ChEBI and MetaNetX…</> : remote?.online
          ? <>GEMs MAP library{remote.sources?.BiGG === 'ok' ? ' + BiGG' : ''} + KEGG + ChEBI (resolved through MetaNetX){remote.sources?.BiGG === 'not downloaded' ? <span> · BiGG data not downloaded (Template Library → BiGG)</span> : null}</>
          : 'GEMs MAP library'}
      </div>
      {remote && !remote.online && remote.note && <div className="tm-note small">{remote.note}</div>}
      <div className="list scroll id-results">
        {cands.map((c, i) => <CandidateRow key={`${c.name}-${i}`} c={c} active={i === sel} onHover={() => setSel(i)} onPick={() => pick(c)} />)}
        {!cands.length && q.trim() && !busy && <div className="muted small pad">No candidate — refine the name, type an identifier, or enter the identity manually.</div>}
      </div>
      <details open={manual} onToggle={(ev) => setManual((ev.target as HTMLDetailsElement).open)} className="small">
        <summary>Enter the identity manually</summary>
        <ManualIdentity initialName={q || e.name} onUse={(c) => pick(c)} />
      </details>
      <div className="row gap end">
        {e.identity.status === 'suggested' && <button className="btn" onClick={() => { designActions.confirmEntity(e.id); close(); }}>Confirm current identity</button>}
        <span className="grow" />
        <button className="btn" onClick={close}>{e.identity.status === 'unresolved' ? 'Leave unresolved' : 'Close'}</button>
      </div>
    </Modal>
  );
}

function CandidateRow({ c, active, onHover, onPick }: { c: IdentityCandidate; active: boolean; onHover: () => void; onPick: () => void }) {
  return (
    <button className={`list-item id-cand ${active ? 'active' : ''}`} onMouseEnter={onHover} onClick={onPick}>
      <div className="li-top">
        <b>{c.name}</b>{c.formula && <span className="mono muted">{c.formula}</span>}
        <span className="grow" />
        {c.sources.map((s) => <span key={s} className="tag">{s}</span>)}
      </div>
      <div className="small"><IdentifierLine ids={c.identifiers} /></div>
      <div className="muted small">{c.match}{c.note ? ` · ${c.note}` : ''}{c.synonyms.length ? ` · also: ${c.synonyms.slice(0, 4).join(', ')}` : ''}</div>
    </button>
  );
}

function ManualIdentity({ initialName, onUse }: { initialName: string; onUse: (c: IdentityCandidate) => void }) {
  const [name, setName] = useState(initialName);
  const [formula, setFormula] = useState('');
  const [ids, setIds] = useState<Record<string, string>>({});
  const identifiers: IdentifierTable = Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v.split(/[,;\s]+/).filter(Boolean)]).filter(([, v]) => v.length));
  return (
    <div className="manual-id">
      <div className="row gap">
        <label className="field grow"><span>Canonical name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Formula</span><input className="input mono" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="C6H12O6" /></label>
      </div>
      <div className="id-grid">
        {METABOLITE_NAMESPACES.map((ns) => (
          <label key={ns} className="field"><span>{NS_LABEL[ns]}</span><input className="input mono" value={ids[ns] ?? ''} onChange={(e) => setIds({ ...ids, [ns]: e.target.value })} placeholder="—" /></label>
        ))}
      </div>
      <button className="btn primary small" disabled={!name.trim()} onClick={() => onUse({ name: name.trim(), formula: formula.trim() || undefined, synonyms: [], identifiers, sources: ['manual entry'], score: 1, match: 'entered by the user' })}>Use this identity</button>
    </div>
  );
}

// ------------------------------------------------------------ reactions

function ReactionIdentity({ reactionId }: { reactionId: string }) {
  const design = useStore((s) => s.design)!;
  const r = design.biology.reactions.find((x) => x.id === reactionId);
  const [text, setText] = useState('');
  const [db, setDb] = useState<{ candidates: ReactionCandidate[]; notes: string[]; online: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const local = useMemo(() => (r ? searchReactionLibrary(design, r, text) : []), [design, r, text]);
  useEffect(() => {
    if (!r) return;
    let live = true;
    setBusy(true);
    searchReactionDatabases(design, r).then((x) => live && setDb(x)).finally(() => live && setBusy(false));
    return () => { live = false; };
    // the database query depends on the participants' identities only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactionId]);
  if (!r) return null;
  const pick = (c: ReactionCandidate) => { designActions.setReactionIdentity(r.id, c); close(); };
  return (
    <Modal title="Define reaction identity — template reaction" onClose={close} width={680}>
      <div className="muted small">A reaction is defined by its participants, stoichiometry and direction — not by its name, which varies between models. Database identifiers make later matching to a GEM stronger.</div>
      <div className="eq mono">{equationText(design, r)}</div>
      <div className="row gap small"><span className="muted">Current:</span><b>{r.name}</b>{r.canonicalName && <span>{r.canonicalName}</span>}<StatusBadge status={r.identity.status} />{r.ec.length > 0 && <span className="tag">EC {r.ec.join(', ')}</span>}</div>
      <div className="section-title">GEMs MAP library (built-in templates)</div>
      <input className="input" placeholder="Filter by name or EC (hexokinase, 2.7.1.1 …)" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="list id-results">
        {local.map((c, i) => <ReactionRow key={`l${i}`} c={c} onPick={() => pick(c)} />)}
        {!local.length && <div className="muted small pad">No built-in reaction with these participants{text ? ' or this name' : ''}.</div>}
      </div>
      <div className="section-title">BiGG + MetaNetX (from the participants' identities, stoichiometry and compartments)</div>
      {busy && <div className="muted small"><span className="spinner sm" /> searching BiGG and MNXref…</div>}
      {db?.notes.map((n) => <div key={n} className="tm-note small">{n}</div>)}
      {db && db.candidates.length > 1 && Math.abs(db.candidates[0].score - db.candidates[1].score) < 0.05 && (
        <div className="notice small">⚠ The first {db.candidates.filter((c) => Math.abs(c.score - db.candidates[0].score) < 0.05).length} candidates fit equally well — compare their equations (anomers, generic vs specific forms) before choosing.</div>
      )}
      <div className="list id-results">
        {db?.candidates.map((c, i) => <ReactionRow key={`d${i}`} c={c} onPick={() => pick(c)} />)}
        {db && !db.candidates.length && !busy && <div className="muted small pad">No BiGG or MNXref reaction found.</div>}
      </div>
      <div className="row gap end">
        {r.identity.status === 'suggested' && <button className="btn" onClick={() => { designActions.confirmReaction(r.id); close(); }}>Confirm current identity</button>}
        <span className="grow" />
        <button className="btn" onClick={close}>Close</button>
      </div>
    </Modal>
  );
}

function ReactionRow({ c, onPick }: { c: ReactionCandidate; onPick: () => void }) {
  return (
    <div className="list-item id-cand">
      <div className="li-top">
        <b>{c.canonicalName ?? c.name}</b>{c.canonicalName && <span className="mono muted">{c.name}</span>}{c.ec.length > 0 && <span className="tag">EC {c.ec.join(', ')}</span>}
        <span className="grow" />{c.sources.map((s) => <span key={s} className="tag">{s}</span>)}<span className="muted small" title="Participant coverage, coefficients, compartments, EC and transport agreement (heuristic, not a probability)">{Math.round(c.score * 100)}</span>
        <button className="btn small primary" onClick={onPick}>Use</button>
      </div>
      {c.equation && <div className="mono small">{c.equation}</div>}
      <div className="small"><IdentifierLine ids={c.identifiers} /></div>
      <ul className="tm-evidence">{c.evidence.map((e, i) => <li key={i} className={e.ok ? 'ok' : 'bad'}><span>{e.ok ? '✓' : '✗'}</span>{e.text}</li>)}</ul>
    </div>
  );
}
