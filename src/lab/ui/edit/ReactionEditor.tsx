/**
 * Reaction editor / builder. Reactants and products are edited as positive amounts in two columns
 * (COBRA convention applied on save: reactants < 0, products > 0); the text equation below stays in
 * sync both ways. Metabolites come from the model, from a database (imported with this reaction) or
 * are created by hand — new metabolites and compartments are created in the same transaction as the
 * reaction, so cancelling leaves nothing behind. Mass and charge balance are shown live (warnings,
 * never blocking); the backend validates the whole edit (IDs, metabolites, bounds, GPR, duplicates)
 * before it changes the model used by every simulation.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../ui/icons';
import { edits } from '../../edits';
import { ARROW_GLYPH, arrowOf, balanceOf, formatEquation, gprError, parseEquation, type Arrow } from '../../editUtils';
import type { DuplicateReaction, EditOp, EditReport, PendingMetabolite, ReactionSpec } from '../../editTypes';
import { fbound, fnum } from '../../format';
import { L, lab, uid, useLab, type ReactionDraft } from '../../store';
import type { LabModel, LabReaction, ModelIndex } from '../../types';
import { NumberInput, useDebounced } from '../common';
import { ANNOTATION_KEYS_RXN, EditorModal, Field, KeyValueEditor, ReportList } from './fields';
import { MetaboliteForm, type NewCompartment } from './MetaboliteForm';
import { MetaboliteSearch, type Picked } from './MetaboliteSearch';

type Row = ReactionDraft['rows'][number];

function mainCompartment(r: LabReaction | undefined, model: LabModel): string {
  if (r?.compartments.length) return r.compartments.find((c) => c !== 'e') ?? r.compartments[0];
  const ids = Object.keys(model.compartments);
  return ids.find((c) => /^(c|c0|cytosol|C_c)$/i.test(c)) ?? ids[0] ?? '';
}

export function draftFrom(r: LabReaction | undefined, model: LabModel, index: ModelIndex, init: Partial<ReactionDraft> = {}): ReactionDraft & { notes: Record<string, string> } {
  const rows: Row[] = r ? Object.entries(r.stoichiometry).map(([met, c]) => ({ key: uid('row'), met, amount: Math.abs(c), side: c < 0 ? 'reactant' : 'product' })) : [];
  return {
    id: r?.id ?? '', name: r?.name ?? '', subsystem: r?.subsystem ?? '', lb: r ? r.lb : 0, ub: r ? r.ub : index.maxBound || 1000,
    gpr: r?.gpr ?? '', objective: r?.objectiveCoefficient ?? 0, annotation: r?.annotation ?? {}, rows, compartment: mainCompartment(r, model),
    notes: (r as { notes?: Record<string, string> } | undefined)?.notes ?? {},
    ...init,
  };
}

export const stoichOf = (rows: Row[]) => {
  const st: Record<string, number> = {};
  for (const r of rows) st[r.met] = (st[r.met] ?? 0) + (r.side === 'reactant' ? -r.amount : r.amount);
  for (const k of Object.keys(st)) if (st[k] === 0) delete st[k];
  return st;
};

const withArrow = (d: ReactionDraft, a: Arrow, max: number): Pick<ReactionDraft, 'lb' | 'ub'> => {
  const lo = d.lb ?? -Infinity, hi = d.ub ?? Infinity;
  if (a === 'fwd') return { lb: lo < 0 ? 0 : d.lb, ub: hi > 0 ? d.ub : max };
  if (a === 'rev') return { lb: lo < 0 ? d.lb : -max, ub: 0 };
  return { lb: lo < 0 ? d.lb : -max, ub: hi > 0 ? d.ub : max };
};

export function ReactionEditor({ id, init, onClose }: { id?: string; init?: Partial<ReactionDraft> & { pending?: PendingMetabolite[] }; onClose: () => void }) {
  const model = useLab((s) => s.model)!;
  const index = useLab((s) => s.index)!;
  const st = useLab((s) => L.activeState(s));
  const orig = id ? index.rxn.get(id) : undefined;
  const max = index.maxBound || 1000;
  const first = useMemo(() => draftFrom(orig, model, index, init), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState(first);
  const [pending, setPending] = useState<PendingMetabolite[]>(init?.pending ?? []);
  const [pendingComps, setPendingComps] = useState<NewCompartment[]>([]);
  const [picker, setPicker] = useState<Row['side'] | null>(null);
  const [form, setForm] = useState<{ side: Row['side']; picked: Extract<Picked, { kind: 'import' | 'create' }> } | null>(null);
  const [report, setReport] = useState<EditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const up = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));

  const info = (m: string) => index.met.get(m) ?? pending.find((p) => p.id === m);
  const stoich = stoichOf(d.rows);
  const arrow = arrowOf(d.lb, d.ub);
  const eqIds = formatEquation(stoich, arrow);

  // ---- text mode, kept in sync with the table
  const [text, setText] = useState(eqIds);
  const [textMsg, setTextMsg] = useState<string | null>(null);
  const editingText = useRef(false);
  useEffect(() => { if (!editingText.current) setText(eqIds); }, [eqIds]);
  const applyText = (t: string, final: boolean) => {
    const p = parseEquation(t);
    const unknown = Object.keys(p.stoich).filter((m) => !info(m));
    const err = p.errors[0] ?? (unknown.length ? `Unknown metabolite${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')} — add ${unknown.length > 1 ? 'them' : 'it'} with “+ Add” first` : null);
    if (err) { setTextMsg(final ? `Text not applied (${err}); showing the table's equation.` : err); if (final) setText(eqIds); return; }
    setTextMsg(p.warnings[0] ?? null);
    const keyOf = new Map(d.rows.map((r) => [`${r.side}:${r.met}`, r.key]));
    const rows: Row[] = Object.entries(p.stoich).map(([met, c]) => { const side = c < 0 ? 'reactant' : 'product'; return { key: keyOf.get(`${side}:${met}`) ?? uid('row'), met, amount: Math.abs(c), side }; });
    setD((x) => ({ ...x, rows, ...(p.arrow && p.arrow !== arrowOf(x.lb, x.ub) ? withArrow(x, p.arrow, max) : {}) }));
  };

  // ---- validation: local (instant) + backend (debounced, never modifies the model)
  const local: string[] = [];
  if (!d.id.trim()) local.push('Reaction ID is required');
  else if (/\s/.test(d.id)) local.push('Reaction ID contains spaces');
  else if (d.id !== orig?.id && index.rxn.has(d.id.trim())) local.push(`Reaction ID “${d.id}” is already used`);
  if (!Object.keys(stoich).length) local.push('Add at least one metabolite');
  if (d.rows.some((r) => !(r.amount > 0))) local.push('Amounts must be positive numbers (the side sets the sign)');
  if (d.lb != null && d.ub != null && d.lb > d.ub) local.push(`Lower bound ${d.lb} is greater than the upper bound ${d.ub}`);
  const gErr = gprError(d.gpr);
  if (gErr) local.push(`Gene rule: ${gErr}`);
  const dupRows = d.rows.filter((r, i) => d.rows.findIndex((x) => x.met === r.met) !== i).map((r) => r.met);

  const spec: ReactionSpec = { id: d.id.trim(), name: d.name.trim(), lb: d.lb, ub: d.ub, subsystem: d.subsystem.trim(), gpr: d.gpr.trim(), metabolites: stoich, annotation: d.annotation, objective: d.objective, notes: d.notes };
  const usedPending = pending.filter((p) => p.id in stoich);
  const usedComps = pendingComps.filter((c) => usedPending.some((p) => p.compartment === c.id));
  const ops = (): EditOp[] => [
    ...usedComps.map((c) => ({ op: 'add_compartment' as const, ...c })),
    ...usedPending.map((p) => ({ op: 'put_metabolite' as const, metabolite: { id: p.id, name: p.name, compartment: p.compartment, formula: p.formula, charge: p.charge, annotation: p.annotation, notes: p.notes } })),
    { op: 'put_reaction', id: orig?.id ?? null, reaction: spec },
  ];
  const key = useDebounced(JSON.stringify([spec, usedPending, usedComps]), 350);
  useEffect(() => {
    let alive = true;
    if (!spec.id || !Object.keys(stoich).length) { setReport(null); return; }
    edits.check(ops()).then((r) => { if (alive) setReport(r); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const rItem = report?.items.find((x) => x.label.startsWith('Reaction'));
  const dups = (rItem?.duplicates ?? []) as DuplicateReaction[];
  const blocked = local.length > 0 || (report?.errors.length ?? 0) > 0;
  const dirty = JSON.stringify([d, pending]) !== JSON.stringify([first, init?.pending ?? []]);
  const close = () => { if (!dirty || window.confirm('Discard the changes to this reaction?')) onClose(); };

  const save = async () => {
    if (blocked || busy) return;
    setBusy(true);
    setSaveError(null);
    const label = orig ? undefined : `Added reaction ${spec.id}${usedPending.length ? ` (+${usedPending.length} metabolite${usedPending.length > 1 ? 's' : ''})` : ''}`;
    const r = await edits.commit(ops(), label);
    setBusy(false);
    if (r.ok) { onClose(); lab.navigate({ kind: 'reaction', id: spec.id }); }
    else { setSaveError(r.error.message || r.error.title); if (r.report) setReport(r.report); }
  };

  // ---- metabolite picking
  const addRow = (met: string, side: Row['side']) => setD((x) => ({ ...x, rows: [...x.rows, { key: uid('row'), met, amount: 1, side }] }));
  const onPick = (side: Row['side']) => (p: Picked) => {
    if (p.kind === 'model' || p.kind === 'pending') { addRow(p.id, side); setPicker(null); return; }
    setPicker(null);
    setForm({ side, picked: p });
  };

  const bal = balanceOf(stoich, info);
  const oneSided = Object.values(stoich).every((c) => c < 0) || Object.values(stoich).every((c) => c > 0);
  const comps = [...new Set(Object.keys(stoich).map((m) => info(m)?.compartment).filter(Boolean))] as string[];
  const override = orig && st.bounds[orig.id];
  const newGenes = (d.gpr.match(/[^\s()]+/g) ?? []).filter((g) => !/^(and|or)$/i.test(g) && !index.gene.has(g));
  const label = (m: string) => info(m)?.name || m;
  const coef = (c: number) => (Math.abs(c) === 1 ? '' : `${fnum(Math.abs(c), 4)} `);
  const side = (pos: boolean) => Object.entries(stoich).filter(([, c]) => (c > 0) === pos).map(([m, c]) => coef(c) + label(m)).join(' + ') || '∅';

  const column = (s: Row['side']) => {
    const rows = d.rows.filter((r) => r.side === s);
    return (
      <div className="re-col">
        <div className="re-col-head"><span className="insp-sub">{s === 'reactant' ? 'Reactants' : 'Products'} · {rows.length}</span></div>
        {rows.map((r) => {
          const m = info(r.met);
          const isNew = pending.some((p) => p.id === r.met);
          return (
            <div key={r.key} className={`re-row ${dupRows.includes(r.met) ? 'dup' : ''}`}>
              <input className="input tiny num re-amt" type="number" min={0} step="any" value={Number.isFinite(r.amount) ? r.amount : ''}
                onChange={(e) => setD((x) => ({ ...x, rows: x.rows.map((y) => (y.key === r.key ? { ...y, amount: e.target.value === '' ? NaN : +e.target.value } : y)) }))} />
              <div className="re-met" title={`${r.met}${m?.formula ? ` · ${m.formula}` : ''}${m?.charge != null ? ` · charge ${m.charge}` : ''}`}>
                <span className="ellipsis">{m?.name || r.met}</span>
                <span className="mono small muted ellipsis">{r.met}</span>
                <span className="ms-comp">[{model.compartments[m?.compartment ?? ''] ?? m?.compartment ?? '?'}]</span>
                {isNew && <span className="tag">new</span>}
              </div>
              <button className="icon-btn tiny" title={`Move to ${s === 'reactant' ? 'products' : 'reactants'}`} onClick={() => setD((x) => ({ ...x, rows: x.rows.map((y) => (y.key === r.key ? { ...y, side: s === 'reactant' ? 'product' : 'reactant' } : y)) }))}><Icon name="swap" size={11} /></button>
              <button className="icon-btn tiny" title="Remove" onClick={() => setD((x) => ({ ...x, rows: x.rows.filter((y) => y.key !== r.key) }))}><Icon name="x" size={11} /></button>
            </div>
          );
        })}
        <button className={`btn small re-add ${picker === s ? 'on' : ''}`} onClick={() => { setForm(null); setPicker(picker === s ? null : s); }}><Icon name="plus" size={11} /> Add {s}</button>
      </div>
    );
  };

  return (
    <EditorModal title={orig ? <>Edit reaction <span className="mono">{orig.id}</span></> : 'New reaction'} onClose={close} width={1000}
      footer={<>
        {orig && <button className="btn small" onClick={() => { if (!dirty || window.confirm('Discard the changes and delete this reaction?')) useLab.setState({ dialog: { kind: 'delete-reaction', id: orig.id } }); }}><Icon name="trash" size={11} /> Delete reaction…</button>}
        <span className="grow" />
        {saveError && <span className="ef-err">{saveError}</span>}
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={blocked || busy} onClick={save} title={blocked ? 'Fix the errors first' : 'Apply to the model (Ctrl+Enter)'}>
          {busy && <span className="spinner sm light" />} {orig ? 'Save changes' : 'Create reaction'}
        </button>
      </>}>
      <div className="re" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }}>
        <div className="re-main">
          <div className="ef-grid">
            <Field label="Reaction ID *"><input className="input mono" autoFocus={!orig} value={d.id} onChange={(e) => up({ id: e.target.value })} placeholder="MDH_NEW" /></Field>
            <Field label="Name"><input className="input" value={d.name} onChange={(e) => up({ name: e.target.value })} placeholder="malate dehydrogenase" /></Field>
            <Field label="Subsystem">
              <input className="input" list="re-subsystems" value={d.subsystem} onChange={(e) => up({ subsystem: e.target.value })} />
              <datalist id="re-subsystems">{[...index.subsystems.keys()].sort().map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Compartment" hint="Ranks the metabolite search; default for new metabolites">
              <select className="input" value={d.compartment} onChange={(e) => up({ compartment: e.target.value })}>
                {Object.entries({ ...model.compartments, ...Object.fromEntries(pendingComps.map((c) => [c.id, c.name])) }).map(([c, n]) => <option key={c} value={c}>{n && n !== c ? `${n} [${c}]` : c}</option>)}
              </select>
            </Field>
          </div>

          <div className="re-eq">
            {column('reactant')}
            <div className="re-arrow" title={arrow === 'both' ? 'Reversible (lower bound < 0 < upper bound)' : arrow === 'fwd' ? 'Forward only' : 'Backward only'}>{ARROW_GLYPH[arrow]}</div>
            {column('product')}
          </div>
          {picker && (
            <div className="re-panel">
              <div className="row between"><span className="small"><b>Add a {picker}</b> <span className="muted">— model first; databases and new metabolites below</span></span><button className="icon-btn tiny" onClick={() => setPicker(null)}><Icon name="x" size={11} /></button></div>
              <MetaboliteSearch onPick={onPick(picker)} compartment={d.compartment} pending={pending} onClose={() => setPicker(null)} />
            </div>
          )}
          {form && (
            <div className="re-panel">
              <div className="row between"><span className="small"><b>{form.picked.kind === 'import' ? 'Import from database' : 'Create new metabolite'}</b> <span className="muted">— created together with this reaction when you save</span></span><button className="icon-btn tiny" onClick={() => setForm(null)}><Icon name="x" size={11} /></button></div>
              <MetaboliteForm mode={form.picked.kind === 'import' ? 'import' : 'create'} context="reaction"
                candidate={form.picked.kind === 'import' ? form.picked.compound : undefined} review={form.picked.kind === 'import' && form.picked.review}
                init={{ compartment: d.compartment, ...(form.picked.kind === 'create' ? { name: form.picked.name } : {}) }}
                pendingComps={pendingComps} extraTaken={pending.map((p) => p.id)}
                onCancel={() => setForm(null)}
                onUseExisting={(mid) => { addRow(mid, form.side); setForm(null); }}
                onDone={(m, comp) => { setPending((p) => [...p, m]); if (comp) setPendingComps((c) => [...c, comp]); addRow(m.id, form.side); setForm(null); }} />
            </div>
          )}
          <Field label="Equation (text)" wide hint={textMsg ? undefined : 'Edit the table or this text — they stay in sync. Arrows: --> irreversible, <=> reversible, <-- backward'} error={textMsg}>
            <input className="input mono" value={text} spellCheck={false}
              onFocus={() => { editingText.current = true; }}
              onChange={(e) => { setText(e.target.value); applyText(e.target.value, false); }}
              onBlur={(e) => { editingText.current = false; applyText(e.target.value, true); }} />
          </Field>

          <div className="ef-grid">
            <Field label="Lower bound" hint={d.lb == null ? 'empty = −∞' : undefined}><NumberInput allowEmpty value={d.lb} onCommit={(v) => up({ lb: v })} placeholder="−∞" /></Field>
            <Field label="Upper bound" hint={d.ub == null ? 'empty = ∞' : undefined}><NumberInput allowEmpty value={d.ub} onCommit={(v) => up({ ub: v })} placeholder="∞" /></Field>
            <Field label="Reversibility">
              <label className="check"><input type="checkbox" checked={arrow === 'both'} onChange={(e) => up(withArrow(d, e.target.checked ? 'both' : 'fwd', max))} /> Reversible <span className="muted small">(lower bound &lt; 0)</span></label>
            </Field>
            <Field label="Objective coefficient" hint="In the model file; a state's objective overrides it"><NumberInput value={d.objective} onCommit={(v) => up({ objective: v ?? 0 })} /></Field>
          </div>
          {override && <div className="note small">State “{st.name}” overrides this reaction's bounds with <span className="mono">[{fbound(override[0], 'lower')}, {fbound(override[1], 'upper')}]</span>. The bounds edited here belong to the model itself and apply wherever no state override exists.</div>}

          <Field label="Gene rule (GPR)" wide error={gErr ? `Invalid rule: ${gErr}` : null}
            hint={newGenes.length ? <>New gene{newGenes.length > 1 ? 's' : ''}: <span className="mono">{newGenes.slice(0, 8).join(', ')}</span></> : 'geneA and (geneB or geneC)'}>
            <input className="input mono" value={d.gpr} onChange={(e) => up({ gpr: e.target.value })} placeholder="b1234 and (b5678 or b9012)" />
          </Field>
          <details className="mf-more" open={Object.keys(d.annotation).length > 0 && !orig}>
            <summary className="insp-sub">Annotations · {Object.keys(d.annotation).length}</summary>
            <KeyValueEditor value={d.annotation} onChange={(annotation) => up({ annotation })} keyHint="key (ec-code, rhea, kegg.reaction…)" suggestions={ANNOTATION_KEYS_RXN} />
          </details>
          <details className="mf-more">
            <summary className="insp-sub">Notes · {Object.keys(d.notes).length}</summary>
            <KeyValueEditor value={d.notes} onChange={(v) => up({ notes: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? x.join(', ') : x])) })} keyHint="key (e.g. comment)" multi={false} />
          </details>
        </div>

        <aside className="re-side">
          <div className="insp-sub">Preview</div>
          <div className="re-preview">
            <div className="mono"><b>{spec.id || 'NEW_REACTION'}</b>{spec.name && <span className="muted"> · {spec.name}</span>}</div>
            <div className="re-pv-eq">{side(false)}<div className="re-pv-arrow">{ARROW_GLYPH[arrow]}</div>{side(true)}</div>
            <div className="mono small">{fbound(d.lb, 'lower')} ≤ v ≤ {fbound(d.ub, 'upper')}</div>
            {d.objective !== 0 && <div className="small">Objective coefficient <span className="mono">{d.objective}</span></div>}
            {comps.length > 1 && <div className="small muted">Transport between {comps.map((c) => model.compartments[c] ?? c).join(' and ')}</div>}
            {usedPending.length > 0 && <div className="small">Creates {usedPending.length} metabolite{usedPending.length > 1 ? 's' : ''}: <span className="mono">{usedPending.map((p) => p.id).join(', ')}</span></div>}
          </div>
          <Balance oneSided={oneSided} bal={bal} />
          {dups.length > 0 && (
            <div className="re-dups">
              <div className="small"><b>Potential duplicate reaction</b></div>
              {dups.map((x) => (
                <div key={x.id} className="mf-dup">
                  <span className="mono">{x.id}</span><span className="muted small ellipsis">{x.reason}{x.scaled ? ' (scaled)' : ''}</span>
                  <button className="btn tiny" onClick={() => { if (!dirty || window.confirm('Close the editor and open the existing reaction?')) { onClose(); lab.navigate({ kind: 'reaction', id: x.id }); } }}>Open</button>
                </div>
              ))}
            </div>
          )}
          <ReportList report={report} local={local} skipWarn={(w) => /Potential duplicate reaction|Mass balance|Charge balance/.test(w)} />
          {dupRows.length > 0 && <div className="ed-msg warn"><span>⚠</span>{[...new Set(dupRows)].join(', ')} appears more than once — the amounts are combined.</div>}
        </aside>
      </div>
    </EditorModal>
  );
}

function Balance({ oneSided, bal }: { oneSided: boolean; bal: ReturnType<typeof balanceOf> }) {
  if (oneSided) return <div className="re-bal muted small">Boundary-like reaction (one side empty): mass and charge balance do not apply.</div>;
  const mass = bal.missingFormula.length
    ? <span className="muted">Mass balance: cannot be evaluated — no formula for <span className="mono">{bal.missingFormula.slice(0, 4).join(', ')}{bal.missingFormula.length > 4 ? '…' : ''}</span></span>
    : bal.mass && Object.keys(bal.mass).length
      ? <span className="warn-text">Mass balance: ⚠ Unbalanced</span>
      : <span className="ok-text">Mass balance: ✓ Balanced</span>;
  const charge = bal.missingCharge.length
    ? <span className="muted">Charge balance: cannot be evaluated — no charge for <span className="mono">{bal.missingCharge.slice(0, 4).join(', ')}{bal.missingCharge.length > 4 ? '…' : ''}</span></span>
    : bal.charge ? <span className="warn-text">Charge imbalance: {bal.charge > 0 ? '+' : ''}{bal.charge}</span> : <span className="ok-text">Charge balance: ✓</span>;
  return (
    <div className="re-bal">
      <div className="small">{mass}</div>
      {bal.mass && Object.keys(bal.mass).length > 0 && (
        <div className="re-bal-diff mono small">{Object.entries(bal.mass).map(([el, v]) => <span key={el}>{el}: {v > 0 ? '+' : ''}{+v.toFixed(4)}</span>)}</div>
      )}
      <div className="small">{charge}</div>
      {((bal.mass && Object.keys(bal.mass).length) || bal.charge) ? <div className="muted small">Products minus reactants. Unbalanced reactions can still be saved (biomass, lumped and pseudo-reactions are unbalanced by design).</div> : null}
    </div>
  );
}
