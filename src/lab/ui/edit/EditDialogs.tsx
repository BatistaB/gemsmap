/**
 * Dialogs of the structural editor: reaction and metabolite editors, boundary reactions in one step,
 * delete confirmations (a metabolite used by reactions is never deleted silently), model validation and
 * the unsaved-changes prompt.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../ui/icons';
import { edits, historyOf } from '../../edits';
import { boundariesOf, externalCompartment, SBO_OF, suggestBoundaryId } from '../../editUtils';
import type { BoundaryKind, EditReport, ValidationReport } from '../../editTypes';
import { api } from '../../api';
import { fbound } from '../../format';
import { lab, useLab, type LabDialog } from '../../store';
import { NumberInput, useDebounced } from '../common';
import { EditorModal, Field, ReportList } from './fields';
import { MetaboliteForm } from './MetaboliteForm';
import { MetaboliteSearch, type Picked } from './MetaboliteSearch';
import { ReactionEditor } from './ReactionEditor';
import './edit.css';

export const EDITOR_DIALOGS = ['reaction-editor', 'metabolite-editor', 'boundary', 'delete-reaction', 'delete-metabolite', 'validate-model', 'unsaved-edits'];

export function EditorDialogs({ d }: { d: LabDialog }) {
  const close = () => useLab.setState({ dialog: null });
  switch (d.kind) {
    case 'reaction-editor': return <ReactionEditor key={d.id ?? 'new'} id={d.id} init={d.init} onClose={close} />;
    case 'metabolite-editor': return <MetaboliteDialog key={d.id ?? JSON.stringify(d.init ?? {})} id={d.id} init={d.init} close={close} />;
    case 'boundary': return <BoundaryDialog key={d.metabolite} met={d.metabolite} kind={d.type} close={close} />;
    case 'delete-reaction': return <DeleteReaction key={d.id} id={d.id} close={close} />;
    case 'delete-metabolite': return <DeleteMetabolite key={d.id} id={d.id} close={close} />;
    case 'validate-model': return <ValidateModel close={close} />;
    case 'unsaved-edits': return <UnsavedEdits close={close} />;
    default: return null;
  }
}

// ------------------------------------------------------------------ metabolite (new: search first, so nothing is created twice)

function MetaboliteDialog({ id, init, close }: { id?: string; init?: Parameters<typeof MetaboliteForm>[0]['init']; close: () => void }) {
  const [picked, setPicked] = useState<Picked | null>(id || init ? { kind: 'create', name: init?.name ?? '' } : null);
  if (id) {
    return (
      <EditorModal title={<>Edit metabolite <span className="mono">{id}</span></>} onClose={close} width={640}>
        <MetaboliteForm mode="edit" origId={id} context="standalone" onCancel={close} onDone={close} />
      </EditorModal>
    );
  }
  if (!picked) {
    return (
      <EditorModal title="New metabolite" onClose={close} width={720}>
        <div className="muted small">Search first: the model may already have the compound (in another compartment, or under another name).</div>
        <MetaboliteSearch onClose={close} onPick={(p) => {
          if (p.kind === 'model' || p.kind === 'pending') { close(); lab.navigate({ kind: 'metabolite', id: p.id }); }
          else setPicked(p);
        }} />
      </EditorModal>
    );
  }
  return (
    <EditorModal title={picked.kind === 'import' ? 'Import metabolite from database' : 'Create new metabolite'} onClose={close} width={640}>
      <MetaboliteForm mode={picked.kind === 'import' ? 'import' : 'create'} context="standalone"
        candidate={picked.kind === 'import' ? picked.compound : undefined} review={picked.kind === 'import' && picked.review}
        init={{ ...init, ...(picked.kind === 'create' && picked.name ? { name: picked.name } : {}) }}
        onCancel={() => (id || init ? close() : setPicked(null))} onDone={close} />
    </EditorModal>
  );
}

// ------------------------------------------------------------------ boundary reactions

const KIND_TEXT: Record<BoundaryKind, { title: string; what: string }> = {
  exchange: { title: 'Exchange', what: 'Exchange with the environment, normally for extracellular metabolites. Negative flux = uptake, positive = secretion.' },
  demand: { title: 'Demand', what: 'Removes the metabolite irreversibly from the system (e.g. a product accumulating in the cell).' },
  sink: { title: 'Sink', what: 'Artificial production or consumption of the metabolite, depending on the bounds (e.g. a compound supplied by unmodelled metabolism).' },
};

function presets(kind: BoundaryKind, max: number, limit: number): { key: string; label: string; lb: number; ub: number; hint: string }[] {
  if (kind === 'exchange') return [
    { key: 'secretion', label: 'Secretion only', lb: 0, ub: max, hint: 'no uptake' },
    { key: 'limited', label: 'Uptake limited', lb: -limit, ub: max, hint: `uptake ≤ ${limit}` },
    { key: 'both', label: 'Uptake + secretion', lb: -max, ub: max, hint: 'unlimited uptake' },
    { key: 'closed', label: 'Closed', lb: 0, ub: 0, hint: 'no flux' },
  ];
  if (kind === 'sink') return [
    { key: 'remove', label: 'Consume only', lb: 0, ub: max, hint: 'removes the metabolite' },
    { key: 'supply', label: 'Supply only', lb: -max, ub: 0, hint: 'provides the metabolite' },
    { key: 'both', label: 'Both directions', lb: -max, ub: max, hint: 'COBRA default sink' },
  ];
  return [{ key: 'demand', label: 'Remove', lb: 0, ub: max, hint: 'irreversible' }];
}

function BoundaryDialog({ met, kind: initialKind, close }: { met: string; kind: BoundaryKind; close: () => void }) {
  const model = useLab((s) => s.model)!;
  const index = useLab((s) => s.index)!;
  const m = index.met.get(met);
  const max = index.maxBound || 1000;
  const [kind, setKind] = useState<BoundaryKind>(initialKind);
  const [limit, setLimit] = useState(10);
  const [preset, setPreset] = useState(presets(initialKind, max, 10)[0].key);
  const [lb, setLb] = useState<number | null>(presets(initialKind, max, 10)[0].lb);
  const [ub, setUb] = useState<number | null>(presets(initialKind, max, 10)[0].ub);
  const [rid, setRid] = useState(() => suggestBoundaryId(model, index, initialKind, met));
  const [ack, setAck] = useState(false);
  const [report, setReport] = useState<EditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ext = externalCompartment(model, index);
  const existing = boundariesOf(index, met);
  const same = existing.filter((x) => x.kind === kind);
  const other = existing.filter((x) => x.kind !== kind);
  const internalExchange = kind === 'exchange' && !!ext && m?.compartment !== ext;
  const ps = presets(kind, max, limit);
  const pick = (k: string) => { const p = presets(kind, max, limit).find((x) => x.key === k)!; setPreset(k); setLb(p.lb); setUb(p.ub); };
  useEffect(() => { const p = presets(kind, max, 10)[0]; setPreset(p.key); setLb(p.lb); setUb(p.ub); setRid(suggestBoundaryId(model, index, kind, met)); setAck(false); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (preset === 'limited') setLb(-limit); }, [limit, preset]);

  const name = `${m?.name || met} ${kind === 'exchange' ? 'exchange' : kind === 'sink' ? 'sink' : 'demand'}`;
  const ops = () => [{ op: 'put_reaction' as const, reaction: { id: rid.trim(), name, lb, ub, subsystem: '', gpr: '', metabolites: { [met]: -1 }, annotation: { sbo: SBO_OF[kind] }, objective: 0 } }];
  const k = useDebounced(JSON.stringify([rid, lb, ub, kind]), 250);
  useEffect(() => { let alive = true; if (rid.trim()) edits.check(ops()).then((r) => alive && setReport(r)); return () => { alive = false; }; }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  const bad = (lb != null && ub != null && lb > ub) || !rid.trim() || index.rxn.has(rid.trim());
  const create = async () => {
    setBusy(true);
    const r = await edits.commit(ops(), `Added ${kind} ${rid.trim()} (${lb ?? '−∞'} / ${ub ?? '∞'})`);
    setBusy(false);
    if (r.ok) { close(); lab.navigate({ kind: 'reaction', id: rid.trim() }); } else setErr(r.error.message || r.error.title);
  };
  return (
    <EditorModal title={<>Create boundary reaction · <span className="mono">{met}</span></>} onClose={close} width={600}
      footer={<><span className="grow" />{err && <span className="ef-err">{err}</span>}<button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={bad || busy || same.length > 0 || (internalExchange && !ack)} onClick={create}>{busy && <span className="spinner sm light" />} Create {KIND_TEXT[kind].title.toLowerCase()}</button></>}>
      <div className="bd-kinds">
        {(['exchange', 'sink', 'demand'] as BoundaryKind[]).map((x) => (
          <button key={x} className={`bd-kind ${kind === x ? 'on' : ''}`} onClick={() => setKind(x)}>
            <b>{KIND_TEXT[x].title}</b><span className="small muted">{KIND_TEXT[x].what}</span>
          </button>
        ))}
      </div>
      <div className="small"><b>{m.name || met}</b> <span className="mono muted">{met}</span> · {model.compartments[m.compartment] ?? m.compartment}</div>
      {same.length > 0 && (
        <div className="ed-msg warn bd-exists"><span>⚠</span><div>{KIND_TEXT[kind].title} already exists: {same.map((x) => <b key={x.id} className="mono">{x.id} </b>)}
          <div className="row gap"><button className="btn small" onClick={() => { close(); lab.navigate({ kind: 'reaction', id: same[0].id }); }}>Open reaction</button><span className="muted small">Edit its bounds there instead of creating a duplicate.</span></div></div></div>
      )}
      {other.length > 0 && !same.length && <div className="ed-msg info"><span>i</span>This metabolite already has a boundary reaction of another kind: {other.map((x) => `${x.id} (${x.kind})`).join(', ')}. A new {kind} adds the same stoichiometry.</div>}
      {internalExchange && (
        <label className="ed-msg warn"><span>⚠</span><span>This metabolite is in {model.compartments[m.compartment] ?? m.compartment}, not in the extracellular compartment ({model.compartments[ext!] ?? ext}). Exchange reactions are normally associated with extracellular metabolites. A sink or demand may be what you need.
          <span className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Create the exchange anyway</span></span></label>
      )}
      <Field label="Reaction ID" hint={`Follows the model's ${kind} prefix`}><input className="input mono" value={rid} onChange={(e) => setRid(e.target.value)} /></Field>
      <div className="insp-sub">Bounds</div>
      <div className="bd-presets">
        {ps.map((p) => (
          <button key={p.key} className={`chip-btn ${preset === p.key ? 'on' : ''}`} onClick={() => pick(p.key)} title={`${fbound(p.lb, 'lower')} / ${fbound(p.ub, 'upper')}`}>
            {p.label} <span className="muted">{p.key === 'limited' ? '' : `${p.lb} / ${p.ub}`}</span>
          </button>
        ))}
        {preset === 'limited' && <label className="small row gap">max uptake <NumberInput value={limit} onCommit={(v) => setLimit(Math.abs(v ?? 10))} className="tiny" /></label>}
      </div>
      <div className="ef-grid">
        <Field label="Lower bound"><NumberInput allowEmpty value={lb} onCommit={(v) => { setLb(v); setPreset(''); }} placeholder="−∞" /></Field>
        <Field label="Upper bound"><NumberInput allowEmpty value={ub} onCommit={(v) => { setUb(v); setPreset(''); }} placeholder="∞" /></Field>
      </div>
      <div className="re-preview mono small">{met} {lb != null && lb >= 0 ? '-->' : ub != null && ub <= 0 ? '<--' : '<=>'} ∅ &nbsp;·&nbsp; {fbound(lb, 'lower')} ≤ v ≤ {fbound(ub, 'upper')}
        {kind === 'exchange' && <div className="muted">uptake allowed: {lb != null && lb < 0 ? `yes (≤ ${-lb})` : lb == null ? 'yes (unlimited)' : 'no'} · secretion allowed: {ub == null || ub > 0 ? 'yes' : 'no'}</div>}
      </div>
      <ReportList report={report} skipWarn={(w) => /Potential duplicate|normally associated with extracellular/.test(w)} />
    </EditorModal>
  );
}

// ------------------------------------------------------------------ delete

function DeleteReaction({ id, close }: { id: string; close: () => void }) {
  const index = useLab((s) => s.index)!;
  const states = useLab((s) => s.states);
  const r = index.rxn.get(id);
  const [busy, setBusy] = useState(false);
  if (!r) return null;
  const overridden = states.filter((s) => s.bounds[id]).map((s) => s.name);
  const go = async () => { setBusy(true); const res = await edits.commit([{ op: 'delete_reaction', id }], `Deleted reaction ${id}`); setBusy(false); if (res.ok) close(); };
  return (
    <EditorModal title={<>Delete reaction <span className="mono">{id}</span>?</>} onClose={close} width={520}
      footer={<><span className="grow" /><button className="btn" onClick={close}>Cancel</button><button className="btn danger" disabled={busy} onClick={go}><Icon name="trash" size={11} /> Delete reaction</button></>}>
      <div className="kv"><span>Name</span><span>{r.name || '—'}</span></div>
      <div className="kv"><span>Metabolites</span><span>{Object.keys(r.stoichiometry).length}</span></div>
      <div className="kv"><span>Genes</span><span className="mono small">{r.genes.join(', ') || '—'}</span></div>
      <div className="kv"><span>Subsystem</span><span>{r.subsystem || '—'}</span></div>
      <div className="mono small muted">{r.equation}</div>
      <div className="note small">Its metabolites are kept, even if no other reaction uses them. Undo (Ctrl+Z) brings the reaction back.
        {overridden.length > 0 && <> Bound overrides in {overridden.join(', ')} are dropped.</>}</div>
    </EditorModal>
  );
}

function DeleteMetabolite({ id, close }: { id: string; close: () => void }) {
  const index = useLab((s) => s.index)!;
  const m = index.met.get(id);
  const users = index.metRxns.get(id) ?? [];
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  if (!m) return null;
  const go = async (cascade: boolean) => {
    setBusy(true);
    const res = await edits.commit([{ op: 'delete_metabolite', id, cascade }], cascade ? `Deleted metabolite ${id} and ${users.length} reactions` : `Deleted metabolite ${id}`);
    setBusy(false);
    if (res.ok) close();
  };
  return (
    <EditorModal title={<>Delete metabolite <span className="mono">{id}</span>?</>} onClose={close} width={560}
      footer={<><span className="grow" /><button className="btn" onClick={close}>Cancel</button>
        {!users.length && <button className="btn danger" disabled={busy} onClick={() => go(false)}><Icon name="trash" size={11} /> Delete metabolite</button>}</>}>
      <div><b>{m.name || id}</b> <span className="muted">· {m.compartment}</span></div>
      {users.length ? (
        <>
          <div className="ed-msg warn"><span>⚠</span>This metabolite participates in {users.length} reaction{users.length > 1 ? 's' : ''}. It cannot be deleted on its own.</div>
          <div className="block-list">{users.slice(0, 10).map((r) => <div key={r} className="kv small"><span className="mono">{r}</span><span className="ellipsis">{index.rxn.get(r)?.name}</span></div>)}{users.length > 10 && <div className="muted small">…and {users.length - 10} more</div>}</div>
          <details className="bd-danger">
            <summary className="small">Delete the metabolite <b>and these {users.length} reactions</b>…</summary>
            <div className="small">This removes {users.length} reaction{users.length > 1 ? 's' : ''} from the model (undo restores them). Type <span className="mono">{id}</span> to confirm.</div>
            <div className="row gap"><input className="input tiny mono grow" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={id} />
              <button className="btn danger small" disabled={typed !== id || busy} onClick={() => go(true)}>Delete metabolite and {users.length} reactions</button></div>
          </details>
        </>
      ) : <div className="note small">No reaction uses it. Undo (Ctrl+Z) brings it back.</div>}
    </EditorModal>
  );
}

// ------------------------------------------------------------------ validation

function ValidateModel({ close }: { close: () => void }) {
  const model = useLab((s) => s.model)!;
  const [rep, setRep] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = () => { setRep(null); setError(null); api.validateModel(model.id).then(setRep, (e) => setError((e as Error).message)); };
  useEffect(run, [model.id, model.summary.reactions, model.summary.metabolites]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = { error: 0, warning: 1, info: 2 } as const;
  const issues = useMemo(() => [...(rep?.issues ?? [])].sort((a, b) => order[a.level] - order[b.level]), [rep]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <EditorModal title="Validate model" onClose={close} width={680} footer={<><span className="grow" /><button className="btn" onClick={run}>Run again</button><button className="btn primary" onClick={close}>Close</button></>}>
      {!rep && !error && <div className="muted small"><span className="spinner sm" /> COBRApy is checking the model…</div>}
      {error && <div className="ed-msg err"><span>✕</span>{error}</div>}
      {rep && (
        <>
          <div className="small">{rep.reactions.toLocaleString()} reactions · {rep.metabolites.toLocaleString()} metabolites · {rep.edits} structural edit{rep.edits === 1 ? '' : 's'} · {issues.filter((i) => i.level === 'error').length ? <b className="warn-text">{issues.filter((i) => i.level === 'error').length} error types</b> : <span className="ok-text">no errors</span>}</div>
          {issues.map((i) => (
            <details key={i.code} className={`val-item lv-${i.level}`} open={i.level === 'error'}>
              <summary><span className={`lv lv-${i.level}`}>{i.level}</span> <b>{i.count.toLocaleString()}</b> {i.title}</summary>
              {i.detail && <div className="muted small">{i.detail}</div>}
              <div className="val-ids">{i.ids.slice(0, 40).map((x) => <button key={x} className="link mono small" onClick={() => { close(); lab.navigate({ kind: i.code.includes('metabolite') || ['no-formula', 'no-charge', 'unknown-compartment'].includes(i.code) ? 'metabolite' : 'reaction', id: x }); }}>{x}</button>)}{i.ids.length > 40 && <span className="muted small">…{i.ids.length - 40} more</span>}</div>
              {i.ids.length > 0 && <button className="link small" onClick={() => { close(); lab.showInExplorer(i.code.includes('metabolite') || ['no-formula', 'no-charge', 'unknown-compartment'].includes(i.code) ? 'metabolites' : 'reactions', i.ids, i.title); }}>Show all in the explorer</button>}
            </details>
          ))}
          {!issues.length && <div className="ok-text">No issue found.</div>}
        </>
      )}
    </EditorModal>
  );
}

// ------------------------------------------------------------------ unsaved structural edits

function UnsavedEdits({ close }: { close: () => void }) {
  const h = historyOf(useLab((s) => s.model));
  const cancel = () => { edits.dropPending(); close(); };
  return (
    <EditorModal title="You have unsaved model changes" onClose={cancel} width={540}
      footer={<>
        <button className="btn" onClick={cancel}>Cancel</button>
        <span className="grow" />
        <button className="btn danger" onClick={async () => { close(); await edits.discard(); edits.continuePending(); }}>Discard edits</button>
        <button className="btn" onClick={() => { close(); edits.continuePending(); }} title="The edits stay in COBRAGUI and are re-applied when this model is opened again">Keep for later</button>
        <button className="btn primary" onClick={() => { edits.dropPending(); useLab.setState({ dialog: { kind: 'export-model' } }); }}>Export model…</button>
      </>}>
      <div>The working model has <b>{h?.count ?? 0}</b> structural edit{h?.count === 1 ? '' : 's'} that {h?.count === 1 ? 'is' : 'are'} not in any file yet.</div>
      <ul className="small">{h?.items.slice(-6).reverse().map((i) => <li key={i.id}>{i.label}</li>)}</ul>
      <div className="muted small"><b>Export model</b> writes a new SBML / JSON / MAT file with the edits. <b>Keep for later</b> leaves them in COBRAGUI: they are re-applied when this model is opened again. <b>Discard</b> reverts the model to the imported file.</div>
    </EditorModal>
  );
}

// re-export for the inspector, menus and palette
export function openReactionEditor(id?: string, init?: Extract<LabDialog, { kind: 'reaction-editor' }>['init']) { useLab.setState({ dialog: { kind: 'reaction-editor', id, init }, contextMenu: null }); }
export function openMetaboliteEditor(id?: string, init?: Extract<LabDialog, { kind: 'metabolite-editor' }>['init']) { useLab.setState({ dialog: { kind: 'metabolite-editor', id, init }, contextMenu: null }); }
export function openBoundary(metabolite: string, type: BoundaryKind) { useLab.setState({ dialog: { kind: 'boundary', metabolite, type }, contextMenu: null }); }
