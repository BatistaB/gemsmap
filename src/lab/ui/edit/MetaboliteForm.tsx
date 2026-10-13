/**
 * Create, import or edit a metabolite. ID, name and compartment are required; formula and charge are
 * optional but needed for mass/charge balance. The ID is suggested from the model's own convention
 * (glc__D_c, cpd00027_c0, M_glc__D_c…) until the user types one. Compartments come from the model; a
 * new compartment is a separate, explicit action (a typo never creates one). Database imports arrive
 * with formula, charge and cross-references filled in; a low-confidence match must be confirmed.
 */
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../ui/icons';
import { edits } from '../../edits';
import { annotationFrom, confidence, idStyle, suggestMetaboliteId } from '../../editUtils';
import type { DuplicateMetabolite, EditOp, EditReport, ExternalCompound, MetaboliteSpec, PendingMetabolite } from '../../editTypes';
import { lab, useLab } from '../../store';
import type { Annotation } from '../../types';
import { NumberInput, useDebounced } from '../common';
import { ANNOTATION_KEYS_MET, Field, KeyValueEditor, ReportList } from './fields';

export interface NewCompartment { id: string; name: string }

export function MetaboliteForm({ mode, origId, init, candidate, review, context, pendingComps = [], extraTaken = [], onDone, onCancel, onUseExisting }: {
  mode: 'create' | 'edit' | 'import';
  origId?: string;
  init?: Partial<MetaboliteSpec>;
  candidate?: ExternalCompound;
  review?: boolean;
  /** standalone: the form commits the change; reaction: it returns a pending metabolite to the reaction draft */
  context: 'standalone' | 'reaction';
  pendingComps?: NewCompartment[];
  extraTaken?: string[];
  onDone: (m: PendingMetabolite, comp?: NewCompartment) => void;
  onCancel: () => void;
  onUseExisting?: (id: string) => void;
}) {
  const model = useLab((s) => s.model)!;
  const index = useLab((s) => s.index)!;
  const orig = origId ? index.met.get(origId) : undefined;
  const style = idStyle(model);
  const fromDb = candidate ? annotationFrom(candidate) : {};
  const [name, setName] = useState(init?.name ?? candidate?.name ?? orig?.name ?? '');
  const [compartment, setCompartment] = useState(init?.compartment ?? orig?.compartment ?? '');
  const [formula, setFormula] = useState(init?.formula ?? candidate?.formula ?? orig?.formula ?? '');
  const [charge, setCharge] = useState<number | null>(init?.charge ?? candidate?.charge ?? orig?.charge ?? null);
  const [annotation, setAnnotation] = useState<Annotation>(init?.annotation ?? (candidate ? fromDb : orig?.annotation ?? {}));
  const origNotes = (orig as { notes?: Record<string, string> } | undefined)?.notes;
  const [notes, setNotes] = useState<Record<string, string>>(init?.notes ?? origNotes ?? (candidate?.synonyms.length ? { synonyms: candidate.synonyms.slice(0, 12).join('; ') } : {}));
  const [idTouched, setIdTouched] = useState(mode === 'edit' || !!init?.id);
  const [id, setId] = useState(init?.id ?? orig?.id ?? '');
  const [newComp, setNewComp] = useState<NewCompartment | null>(null);
  const [compForm, setCompForm] = useState<NewCompartment | null>(null);
  const [confirmed, setConfirmed] = useState(!review);
  const [report, setReport] = useState<EditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comps = { ...model.compartments, ...Object.fromEntries(pendingComps.map((c) => [c.id, c.name])), ...(newComp ? { [newComp.id]: newComp.name } : {}) };
  const suggestion = useMemo(() => (compartment && name ? suggestMetaboliteId(model, index, name, compartment, candidate?.identifiers, extraTaken) : ''), [model, index, name, compartment, candidate, extraTaken]);
  useEffect(() => { if (!idTouched) setId(suggestion); }, [suggestion, idTouched]);

  const spec: MetaboliteSpec = { id: id.trim(), name: name.trim(), compartment, formula: formula.trim(), charge, annotation, notes };
  const ops = (): EditOp[] => [
    ...pendingComps.map((c) => ({ op: 'add_compartment' as const, ...c })),
    ...(newComp ? [{ op: 'add_compartment' as const, ...newComp }] : []),
    { op: 'put_metabolite', id: origId ?? null, metabolite: spec },
  ];
  const draftKey = JSON.stringify([spec, newComp, pendingComps]);
  const dKey = useDebounced(draftKey, 350);
  useEffect(() => {
    let alive = true;
    if (!spec.id || !spec.name) { setReport(null); return; }
    edits.check(ops()).then((r) => { if (alive) setReport(r); });
    return () => { alive = false; };
  }, [dKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const local: string[] = [];
  if (extraTaken.includes(spec.id) && spec.id !== origId) local.push(`ID “${spec.id}” is already used by another new metabolite of this reaction`);
  const item = report?.items.find((x) => x.label.startsWith('Metabolite'));
  const dups = ((item?.duplicates ?? []) as DuplicateMetabolite[]);
  const errors = [...local, ...(report?.errors ?? [])];
  const canSave = !!spec.id && !!spec.name && !!spec.compartment && confirmed && !errors.length && !busy;

  const submit = async () => {
    if (!canSave) return;
    const pending: PendingMetabolite = { ...spec, origin: candidate ? 'database' : 'manual', source: candidate ? `${candidate.name} (${candidate.sources.join(', ')})` : undefined };
    if (context === 'reaction') { onDone(pending, newComp ?? undefined); return; }
    setBusy(true);
    setError(null);
    const r = await edits.commit(ops(), mode === 'edit' ? undefined : `Added metabolite ${spec.id}`);
    setBusy(false);
    if (r.ok) { onDone(pending, newComp ?? undefined); lab.navigate({ kind: 'metabolite', id: spec.id }); }
    else { setError(r.error.message || r.error.title); if (r.report) setReport(r.report); }
  };

  const nUsers = orig ? (index.metRxns.get(orig.id) ?? []).length : 0;
  return (
    <div className="mf" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}>
      {candidate && (
        <div className={`mf-src ${review ? 'review' : ''}`}>
          <div className="row between"><b>{candidate.name}</b><span className={`tag ${review ? 'warn' : 'ok'}`}>{review ? 'Needs review' : 'Confident match'}</span></div>
          <div className="small muted">From {candidate.sources.join(', ')} · {candidate.match}{candidate.note ? ` · ${candidate.note}` : ''}</div>
          {review && (
            <label className="check small mf-confirm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>I checked the identity: this is <b>{candidate.name}</b>{candidate.formula ? <> ({candidate.formula})</> : null}. <span className="muted">{confidence(candidate, [candidate]).why === candidate.match ? candidate.match : ''}</span></span>
            </label>
          )}
        </div>
      )}
      <div className="ef-grid">
        <Field label="Name *"><input className="input" autoFocus={mode !== 'edit'} value={name} onChange={(e) => setName(e.target.value)} placeholder="L-Malate" /></Field>
        <Field label="Compartment *" hint={!compartment ? 'Only the compartments of the model are listed' : undefined}>
          <select className="input" value={compartment} onChange={(e) => { if (e.target.value === '__new') setCompForm({ id: '', name: '' }); else setCompartment(e.target.value); }}>
            <option value="" disabled>Choose…</option>
            {Object.entries(comps).map(([cid, cn]) => <option key={cid} value={cid}>{cn && cn !== cid ? `${cn} [${cid}]` : cid}{newComp?.id === cid || pendingComps.some((c) => c.id === cid) ? ' (new)' : ''}</option>)}
            <option value="__new">＋ New compartment…</option>
          </select>
        </Field>
        {compForm && (
          <div className="mf-newcomp wide">
            <div className="small"><b>New compartment</b> <span className="muted">— added to the model with this metabolite. Check the existing ones first: a typo creates a second compartment.</span></div>
            <div className="row gap">
              <input className="input tiny" placeholder="ID (e.g. x)" value={compForm.id} onChange={(e) => setCompForm({ ...compForm, id: e.target.value.trim() })} />
              <input className="input tiny grow" placeholder="Name (e.g. peroxisome)" value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} />
              <button className="btn small" disabled={!compForm.id || /\s/.test(compForm.id) || compForm.id in comps} onClick={() => { setNewComp({ id: compForm.id, name: compForm.name || compForm.id }); setCompartment(compForm.id); setCompForm(null); }}>Create compartment</button>
              <button className="btn small" onClick={() => setCompForm(null)}>Cancel</button>
            </div>
            {compForm.id in comps && <div className="ef-err">“{compForm.id}” already exists — choose it in the list.</div>}
          </div>
        )}
        <Field label="Metabolite ID *" wide hint={!idTouched ? <>Suggested from the model's convention{style.example ? <> (e.g. <span className="mono">{style.example}</span>)</> : null} — edit freely</> : suggestion && suggestion !== id ? <button className="link small" onClick={() => { setIdTouched(false); setId(suggestion); }}>Use suggestion {suggestion}</button> : undefined}>
          <input className="input mono" value={id} onChange={(e) => { setIdTouched(true); setId(e.target.value); }} placeholder={style.example || 'met_c'} />
        </Field>
        {mode === 'edit' && orig && spec.id !== orig.id && nUsers > 0 && <div className="note small wide">Renaming updates the {nUsers} reaction{nUsers > 1 ? 's' : ''} that use {orig.id}: they keep pointing to this metabolite under the new ID.</div>}
        <Field label="Formula"><input className="input mono" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="C4H4O5" /></Field>
        <Field label="Charge"><NumberInput allowEmpty value={charge} onCommit={setCharge} placeholder="—" /></Field>
        {(!spec.formula || charge == null) && <div className="muted small wide">Mass/charge balance cannot be fully evaluated without formula and charge.</div>}
      </div>
      <details className="mf-more" open={!!candidate || Object.keys(annotation).length > 0}>
        <summary className="insp-sub">Annotations · {Object.keys(annotation).length}{candidate && <span className="muted"> (from the database)</span>}</summary>
        <KeyValueEditor value={annotation} onChange={setAnnotation} keyHint="key (kegg.compound, chebi…)" suggestions={ANNOTATION_KEYS_MET} />
      </details>
      <details className="mf-more" open={Object.keys(notes).length > 0}>
        <summary className="insp-sub">Notes · {Object.keys(notes).length}</summary>
        <KeyValueEditor value={notes} onChange={(v) => setNotes(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? x.join(', ') : x])))} keyHint="key (e.g. comment)" multi={false} />
      </details>
      {dups.filter((d) => d.sameCompartment || mode !== 'edit').length > 0 && (
        <div className="mf-dups">
          <div className="small"><b>Possible existing metabolite detected</b> <span className="muted">— the model may already have this compound. You decide.</span></div>
          {dups.map((d) => (
            <div key={d.id} className="mf-dup">
              <span className="mono">{d.id}</span><span className="ellipsis">{d.name}</span><span className="ms-comp">[{model.compartments[d.compartment] ?? d.compartment}]</span>
              <span className="muted small ellipsis">{d.reasons.join(', ')}</span>
              {context === 'reaction' && onUseExisting
                ? <button className="btn tiny" onClick={() => onUseExisting(d.id)}>Use this one</button>
                : <button className="btn tiny" onClick={() => { onCancel(); lab.navigate({ kind: 'metabolite', id: d.id }); }}>Open</button>}
            </div>
          ))}
        </div>
      )}
      <ReportList report={report} local={local} skipWarn={(w) => /Possible existing metabolite|without formula and charge/.test(w)} />
      {error && <div className="ed-msg err"><span>✕</span>{error}</div>}
      <div className="row end gap mf-actions">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!canSave} onClick={submit} title={!confirmed ? 'Confirm the identity first' : undefined}>
          {busy ? <span className="spinner sm light" /> : <Icon name={mode === 'edit' ? 'tidy' : 'plus'} size={12} />}
          {context === 'reaction' ? ' Add to reaction' : mode === 'edit' ? ' Save metabolite' : ' Create metabolite'}
        </button>
      </div>
    </div>
  );
}
