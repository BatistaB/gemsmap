/**
 * Inspector of Template Design Mode. A node here is a TEMPLATE ENTITY (an abstract
 * biological compound in a compartment), never a model metabolite.
 */
import { useMemo, useState } from 'react';
import { designActions, reactionCompartment } from '../../templates/design/actions';
import { equationText } from '../../templates/design/identitySearch';
import { searchLocal } from '../../templates/design/identitySearch';
import { completeness } from '../../templates/format/validate';
import {
  COMPARTMENTS, METABOLITE_NAMESPACES, REACTION_NAMESPACES, SCOPE_LABEL, compartmentLabel, type CompartmentFallback, type ConceptualCompartment, type Requirement, type ScopeLevel, type TemplateFile,
} from '../../templates/format/schema';
import { libraryItems, useTemplateLibrary } from '../../templates/library/registry';
import { A, parseKey, useStore } from '../../store/store';
import type { LabelPos, NodeGlyph, ReactionGlyph } from '../../viz/types';
import { SectionsBar, useCollapsibleSections } from '../Collapsible';
import { Icon } from '../icons';
import { GroupInspector, MultiInspector, TextInspector } from '../Inspector';
import { ResizeHandle, usePanelWidth } from '../Resizer';
import { CompletenessBlock, GenericTag, IdentifierField, IdentifierLine, ProvenanceLine, ReviewTag, StatusBadge } from './parts';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function Seg<T extends string>({ value, options, onChange, labels }: { value: T; options: T[]; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return <div className="seg">{options.map((o) => <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{labels?.[o] ?? o}</button>)}</div>;
}
/** Text input that commits on blur / Enter (one undo step per edit, not per keystroke). */
function TextInput({ value, onCommit, placeholder, mono, list }: { value: string; onCommit: (v: string) => void; placeholder?: string; mono?: boolean; list?: boolean }) {
  const [t, setT] = useState<string | null>(null);
  const commit = () => { if (t !== null && t !== value) onCommit(t); setT(null); };
  return <input className={`input ${mono ? 'mono' : ''}`} value={t ?? value} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} title={list ? 'Comma separated' : undefined} />;
}
const splitList = (s: string) => s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
const LEVELS: Requirement[] = ['required', 'recommended', 'optional'];

export function TemplateInspector() {
  const pw = usePanelWidth('tpl-right', 312, 240, 640);
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const design = useStore((s) => s.design);
  const open = useStore((s) => s.rightOpen);
  const folds = useCollapsibleSections('template-inspector');
  if (!design || !open) return null;
  let body: JSX.Element;
  if (selection.length === 1) {
    const [kind, id] = parseKey(selection[0]);
    const n = kind === 'node' ? doc.nodes[id] : undefined;
    const g = kind === 'reaction' ? doc.reactions[id] : undefined;
    if (n?.design?.kind === 'metabolite') body = <MetaboliteSection f={design} n={n} />;
    else if (n?.design?.kind === 'port') body = <PortSection f={design} connectorId={n.design.id} />;
    else if (g?.design?.kind === 'reaction') body = <ReactionSection f={design} g={g} />;
    else if (g?.design?.kind === 'link') body = <PortSection f={design} connectorId={g.design.id} />;
    else if (kind === 'text' && doc.texts[id]) body = <TextInspector t={doc.texts[id]} />;
    else if (kind === 'group' && doc.groups[id]) body = <GroupInspector g={doc.groups[id]} />;
    else body = <TemplateSection f={design} />;
  } else if (selection.length > 1) body = <MultiInspector />;
  else body = <TemplateSection f={design} />;
  return <aside className="panel right tpl-insp" style={{ width: pw.css }}><ResizeHandle panel={pw} edge="left" /><SectionsBar api={folds} /><div className="panel-scroll" ref={folds.ref}>{body}</div></aside>;
}

// ------------------------------------------------------------ metabolite

function MetaboliteSection({ f, n }: { f: TemplateFile; n: NodeGlyph }) {
  const m = f.biology.metabolites.find((x) => x.id === n.design!.id);
  const e = m && f.biology.entities.find((x) => x.id === m.entity);
  const doc = useStore((s) => s.doc);
  if (!m || !e) return <div className="section muted small">Unknown template element.</div>;
  const instances = Object.values(doc.nodes).filter((x) => x.design?.kind === 'metabolite' && x.design.id === m.id).length;
  const sharedBy = f.biology.metabolites.filter((x) => x.entity === e.id && x.id !== m.id);
  const reactions = f.biology.reactions.filter((r) => r.participants.some((p) => p.metabolite === m.id));
  const openIdentity = () => useStore.setState({ dialog: { kind: 'identity', nodeId: n.id } });
  return (
    <>
      <div className="insp-head">
        <div className="insp-kind">Template metabolite · template entity</div>
        <div className="insp-title">{m.label || e.short || e.name}</div>
        <div className="muted small">Abstract biological entity — the matcher finds it in each GEM. <span className="mono">{m.id}</span></div>
      </div>
      <div className="section">
        <div className="section-title">Identity</div>
        <Field label="Display name"><TextInput value={m.label ?? ''} placeholder={e.short || e.name} onCommit={(v) => designActions.updateMetabolite(m.id, { label: v.trim() || undefined })} /></Field>
        <Field label="Canonical identity">
          <span className="row gap wrap"><b>{e.name}</b><StatusBadge status={e.identity.status} conflict={!!e.identity.conflict} confidence={e.identity.confidence} />{e.generic && <GenericTag />}</span>
        </Field>
        {e.identity.note && <div className="muted small">{e.identity.source ? `${e.identity.source}: ` : ''}{e.identity.note}</div>}
        {e.provenance && <ProvenanceLine p={[e.provenance]} />}
        <div className="row gap wrap">
          <button className="btn small primary" onClick={openIdentity}>{e.identity.status === 'unresolved' ? 'Define identity…' : 'Change identity…'}</button>
          {e.identity.status === 'suggested' && <button className="btn small" onClick={() => designActions.confirmEntity(e.id)}>✓ Confirm</button>}
          {e.identity.status !== 'unresolved' && <button className="btn small" onClick={() => designActions.clearIdentity(e.id)} title="Back to unresolved">Clear</button>}
        </div>
        {e.identity.conflict && (
          <div className="notice small">
            <b>Potential identity conflict.</b> A {e.identity.conflict.source} suggestion says <b>{e.identity.conflict.name}</b> (<IdentifierLine ids={e.identity.conflict.identifiers} max={3} />). Your confirmed identity was kept.
            <div className="row gap"><button className="btn small" onClick={() => designActions.resolveConflict(e.id, false)}>Keep mine</button><button className="btn small" onClick={() => designActions.resolveConflict(e.id, true)}>Use the suggestion</button></div>
          </div>
        )}
        <Field label="Preferred compartment">
          <select className="input" value={m.compartment ?? ''} title="Optional. Without one, the matcher proposes candidates in every compartment and you choose when mapping onto a GEM" onChange={(ev) => designActions.updateMetabolite(m.id, { compartment: (ev.target.value || null) as ConceptualCompartment | null })}>
            <option value="">— chosen when mapping —</option>
            {COMPARTMENTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Requirement"><Seg value={m.level} options={LEVELS} onChange={(v) => designActions.updateMetabolite(m.id, { level: v })} /></Field>
        <Field label="Role"><Seg value={m.role ?? 'normal'} options={['normal', 'exchange']} onChange={(v) => designActions.updateMetabolite(m.id, { role: v === 'normal' ? undefined : v })} /></Field>
      </div>
      <NodeAppearance n={n} />
      <div className="section">
        <div className="section-title">Databases</div>
        {METABOLITE_NAMESPACES.map((ns) => <IdentifierField key={ns} ns={ns} values={e.identifiers[ns] ?? []} onChange={(v) => designActions.updateEntity(e.id, { identifiers: { ...e.identifiers, [ns]: v } })} />)}
        <Field label="Formula"><TextInput mono value={e.formula ?? ''} placeholder="neutral formula" onCommit={(v) => designActions.updateEntity(e.id, { formula: v.trim() || undefined })} /></Field>
        <Field label="Synonyms"><TextInput list value={e.synonyms.join(', ')} onCommit={(v) => designActions.updateEntity(e.id, { synonyms: splitList(v) })} /></Field>
        <Field label="Short label"><TextInput mono value={e.short ?? ''} placeholder="glc_D" onCommit={(v) => designActions.updateEntity(e.id, { short: v.trim() || undefined })} /></Field>
        {!!e.related?.length && <div className="muted small">Related forms (scored lower when matching): {e.related.map((r) => r.note).join('; ')}</div>}
        <div className="muted small">Editing identifiers by hand keeps the status; review it with <b>Confirm</b> when done.</div>
      </div>
      <div className="section">
        <div className="section-title">Drawing</div>
        <div className="small">{instances} visual instance{instances > 1 ? 's' : ''} of this metabolite{sharedBy.length ? ` · same compound also as ${sharedBy.map((x) => compartmentLabel(x.compartment).toLowerCase()).join(', ')}` : ''}</div>
        <div className="row gap wrap">
          <button className="btn small" onClick={() => designActions.addInstance(n.id)} title="Draw the same metabolite once more (global maps)">+ Instance</button>
          {instances > 1 && <button className="btn small" onClick={() => designActions.makeIndependent(n.id)} title="This node becomes its own metabolite (same identity), e.g. for another compartment">Make independent</button>}
          <PortButton nodeId={n.id} />
        </div>
      </div>
      <div className="section">
        <div className="section-title">Reactions ({reactions.length})</div>
        {reactions.map((r) => <div key={r.id} className="small"><b>{r.name}</b> <span className="mono muted">{equationText(f, r, 'short')}</span></div>)}
        {!reactions.length && <div className="muted small">Drag from the node's outer ring to another node to draw a reaction.</div>}
      </div>
    </>
  );
}

/**
 * How a node is drawn — the same options as the Map Builder. Saved in the template's layout, so a template
 * applied to a GEM keeps them.
 */
function NodeAppearance({ n }: { n: NodeGlyph }) {
  const style = useStore((s) => s.style);
  const a = A();
  if (n.attach) {
    return (
      <div className="section">
        <div className="section-title">Appearance</div>
        <div className="muted small">A cofactor drawn beside its arrow: it follows the arrow when the arrow moves. Drag it to place it.</div>
      </div>
    );
  }
  const textOnly = n.shape === 'label';
  return (
    <div className="section">
      <div className="section-title">Appearance</div>
      {!textOnly && (
        <Field label="Label position">
          <Seg value={(n.labelPos ?? 'right') as LabelPos} options={['left', 'top', 'right', 'bottom', 'none']}
            onChange={(v) => a.updateNode(n.id, { labelPos: v })} labels={{ left: '←', top: '↑', right: '→', bottom: '↓', none: '∅' }} />
        </Field>
      )}
      <Field label="Style"><Seg value={textOnly ? 'text' : 'circle'} options={['circle', 'text']} onChange={(v) => a.updateNode(n.id, v === 'text' ? { shape: 'label', labelPos: undefined } : { shape: 'circle' })} labels={{ circle: 'circle + label', text: 'text only' }} /></Field>
      {!textOnly && <Field label="Radius"><input className="input" type="number" min={1} max={40} value={n.r ?? style.nodeRadius} onChange={(e) => a.updateNode(n.id, { r: +e.target.value || undefined })} /></Field>}
      {!textOnly && (
        <Field label="Fill">
          <input type="color" value={n.fill ?? '#111111'} onChange={(e) => a.updateNode(n.id, { fill: e.target.value })} />
          {n.fill && <button className="link" onClick={() => a.updateNode(n.id, { fill: undefined })}>reset</button>}
        </Field>
      )}
      <div className="muted small">The name shown is the <b>Display name</b> above (or the entity's short label).</div>
    </div>
  );
}

/** How an arrow is drawn — routing, curvature and its label; saved in the template's layout. */
function ReactionAppearance({ g }: { g: ReactionGlyph }) {
  const a = A();
  const oneToOne = g.sources.length === 1 && g.targets.length === 1;
  return (
    <div className="section">
      <div className="section-title">Appearance</div>
      <Field label="Routing"><Seg value={g.routing} options={oneToOne ? ['straight', 'curved', 'orthogonal'] : ['straight']} onChange={(v) => a.updateReaction(g.id, { routing: v, bend: undefined })} /></Field>
      {(g.routing === 'curved' || !oneToOne) && (
        <Field label={oneToOne ? 'Curvature' : 'Hub offset'}><input type="range" min={-120} max={120} value={g.bend ?? 0} onChange={(e) => a.updateReaction(g.id, { bend: +e.target.value })} /></Field>
      )}
      <div className="row gap wrap">
        <button className="btn small" onClick={() => a.reverseReaction(g.id)} title="Swap substrates and products (cofactors follow)"><Icon name="swap" size={13} /> Reverse</button>
        <button className="btn small" onClick={() => a.updateReaction(g.id, { labelFlip: !g.labelFlip, labelOffset: undefined, labelAngle: undefined })}>Flip label</button>
        {(g.labelOffset || g.labelAngle) && <button className="btn small" onClick={() => a.updateReaction(g.id, { labelOffset: undefined, labelAngle: undefined })}>Auto label position</button>}
      </div>
      <div className="muted small">The label is the <b>Display name</b> above; drag the label on the canvas to move it.</div>
    </div>
  );
}

function PortButton({ nodeId }: { nodeId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [dir, setDir] = useState<'out' | 'in'>('out');
  const user = useTemplateLibrary((s) => s.user);
  const items = useMemo(() => libraryItems(user), [user]);
  if (!open) return <button className="btn small" onClick={() => setOpen(true)} title="A link to another pathway (not a reaction), e.g. pyruvate → amino acid metabolism">+ Pathway link</button>;
  const tpl = items.find((i) => i.file.metadata.name === name);
  return (
    <div className="port-form">
      <input className="input" autoFocus list="tpl-names" placeholder="Pathway (e.g. Amino acid metabolism)" value={name} onChange={(e) => setName(e.target.value)} />
      <datalist id="tpl-names">{items.map((i) => <option key={i.file.metadata.id} value={i.file.metadata.name} />)}</datalist>
      <Seg value={dir} options={['out', 'in']} onChange={setDir} labels={{ out: '→ to', in: '← from' }} />
      <button className="btn small primary" disabled={!name.trim()} onClick={() => { designActions.addPort(nodeId, name.trim(), dir, tpl?.file.metadata.id); setOpen(false); setName(''); }}>Add</button>
    </div>
  );
}

// ------------------------------------------------------------ reaction

function ReactionSection({ f, g }: { f: TemplateFile; g: ReactionGlyph }) {
  const r = f.biology.reactions.find((x) => x.id === g.design!.id);
  const [cof, setCof] = useState<{ sign: -1 | 1; q: string } | null>(null);
  if (!r) return <div className="section muted small">Unknown template reaction.</div>;
  const comp = reactionCompartment(f, r);
  const name = (metId: string) => { const m = f.biology.metabolites.find((x) => x.id === metId); const e = m && f.biology.entities.find((x) => x.id === m.entity); return { e, m }; };
  const side = (sign: -1 | 1) => r.participants.filter((p) => Math.sign(p.coefficient) === sign);
  return (
    <>
      <div className="insp-head">
        <div className="insp-kind">{r.summary ? 'Pathway summary (several steps drawn as one arrow)' : 'Template reaction'}</div>
        <div className="insp-title">{r.name}</div>
        <div className="muted small">Defined by participants, stoichiometry and direction — not by its name. <span className="mono">{r.id}</span></div>
      </div>
      <div className="section">
        <div className="section-title">Identity</div>
        <Field label="Display name"><TextInput value={r.name} onCommit={(v) => designActions.updateReaction(r.id, { name: v.trim() || r.name })} /></Field>
        <Field label="Canonical reaction"><TextInput value={r.canonicalName ?? ''} placeholder="e.g. hexokinase" onCommit={(v) => designActions.updateReaction(r.id, { canonicalName: v.trim() || undefined })} /></Field>
        <div className="eq mono">{equationText(f, r)}</div>
        <span className="row gap wrap"><StatusBadge status={r.identity.status} confidence={r.identity.confidence} />{r.identity.note && <span className="muted small">{r.identity.note}</span>}</span>
        {!!r.provenance?.length && <ProvenanceLine p={r.provenance} />}
        <div className="row gap wrap">
          <button className="btn small primary" onClick={() => useStore.setState({ dialog: { kind: 'identity', reactionId: r.id } })}>{r.identity.status === 'unresolved' ? 'Define identity…' : 'Find identity…'}</button>
          {r.identity.status === 'suggested' && <button className="btn small" onClick={() => designActions.confirmReaction(r.id)}>✓ Confirm</button>}
        </div>
        <Field label="Direction">
          <Seg value={r.reversible === null ? 'unknown' : r.reversible ? 'reversible' : 'forward'} options={['forward', 'reversible', 'unknown']}
            onChange={(v) => designActions.updateReaction(r.id, { reversible: v === 'unknown' ? null : v === 'reversible' })} labels={{ forward: '→ forward', reversible: '⇌ reversible', unknown: '?' }} />
        </Field>
        <Field label="Compartment">
          <select className="input" value={r.compartment ?? ''} onChange={(ev) => designActions.updateReaction(r.id, { compartment: (ev.target.value || undefined) as ConceptualCompartment | undefined })}>
            <option value="">{`from participants (${comp === 'transport' ? 'transport' : compartmentLabel(comp as ConceptualCompartment | null).toLowerCase()})`}</option>
            {COMPARTMENTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Requirement"><Seg value={r.level} options={LEVELS} onChange={(v) => designActions.updateReaction(r.id, { level: v })} /></Field>
      </div>
      <ReactionAppearance g={g} />
      <div className="section">
        <div className="section-title">Stoichiometry</div>
        {([-1, 1] as const).map((sign) => (
          <div key={sign} className="stoich">
            <div className="muted small">{sign < 0 ? 'Substrates' : 'Products'}</div>
            {side(sign).map((p) => {
              const { e, m } = name(p.metabolite);
              return (
                <div key={p.metabolite + sign} className="row gap stoich-row">
                  <input className="input tiny num" type="number" min={0.001} step="any" value={Math.abs(p.coefficient)} onChange={(ev) => designActions.setCoefficient(r.id, p.metabolite, sign, +ev.target.value)} />
                  <span className="grow">{e?.name ?? p.metabolite}{m?.compartment ? <span className="muted"> [{compartmentLabel(m.compartment).toLowerCase()}]</span> : null}</span>
                  {p.main ? <span className="tag" title="Drawn on the map; change it by redrawing the arrow">drawn</span>
                    : <button className="icon-btn" title="Remove this side compound" onClick={() => designActions.removeParticipant(r.id, p.metabolite, sign)}>✕</button>}
                </div>
              );
            })}
            {cof?.sign === sign ? <CofactorPicker q={cof.q} setQ={(q) => setCof({ sign, q })} onPick={(c) => { designActions.addSideParticipant(r.id, c, sign); setCof(null); }} onClose={() => setCof(null)} />
              : <button className="link small" onClick={() => setCof({ sign, q: '' })}>+ side compound (cofactor)</button>}
          </div>
        ))}
        <div className="muted small">Side compounds (ATP, NAD⁺ …) complete the equation without being drawn; the validator checks the atom balance when every formula is known.</div>
      </div>
      <div className="section">
        <div className="section-title">Databases</div>
        <Field label="EC"><TextInput list mono value={r.ec.join(', ')} onCommit={(v) => designActions.updateReaction(r.id, { ec: splitList(v) })} /></Field>
        {REACTION_NAMESPACES.map((ns) => <IdentifierField key={ns} ns={ns} values={r.identifiers[ns] ?? []} onChange={(v) => designActions.updateReaction(r.id, { identifiers: { ...r.identifiers, [ns]: v } })} />)}
        {!!r.hints?.length && <div className="muted small" title="Only used to break ties between model reactions that connect the same metabolites equally well">Tie-break hints: <span className="mono">{r.hints.join(', ')}</span></div>}
      </div>
      {!!r.variants?.length && (
        <div className="section">
          <div className="section-title">Variants ({r.variants.length})</div>
          <div className="muted small">The same step with another cofactor or donor. Not drawn; their EC numbers and identifiers also count when the matcher looks for this step in a model.</div>
          {r.variants.map((v) => (
            <div key={v.name + (v.identifiers['kegg.reaction']?.[0] ?? '')} className="variant small">
              <b>{v.name}</b> <span className="mono muted">{[...(v.identifiers['kegg.reaction'] ?? []), ...v.ec.map((x) => `EC ${x}`)].join(' · ')}</span>
              {v.equation && <div className="mono muted">{v.equation}</div>}
              {v.note && <div className="muted">{v.note}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CofactorPicker({ q, setQ, onPick, onClose }: { q: string; setQ: (q: string) => void; onPick: (c: ReturnType<typeof searchLocal>[number]) => void; onClose: () => void }) {
  const hits = useMemo(() => searchLocal(q).slice(0, 6), [q]);
  return (
    <div className="cof-pick">
      <div className="row gap"><input className="input" autoFocus placeholder="ATP, NAD+, CoA, H2O …" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && hits[0]) onPick(hits[0]); }} /><button className="icon-btn" onClick={onClose}>✕</button></div>
      {hits.map((c) => <button key={c.library ?? c.name} className="list-item" onClick={() => onPick(c)}><b>{c.name}</b> <span className="muted small"><IdentifierLine ids={c.identifiers} max={2} /></span></button>)}
      {q && !hits.length && <div className="muted small">Not in the GEMs MAP library — draw it as a node and define its identity, then it can be a side compound.</div>}
    </div>
  );
}

// ------------------------------------------------------------ pathway link

function PortSection({ f, connectorId }: { f: TemplateFile; connectorId: string }) {
  const c = f.biology.connectors.find((x) => x.id === connectorId);
  const user = useTemplateLibrary((s) => s.user);
  const items = useMemo(() => libraryItems(user), [user]);
  if (!c) return <div className="section muted small">Unknown pathway link.</div>;
  const m = f.biology.metabolites.find((x) => x.id === c.metabolite);
  const e = m && f.biology.entities.find((x) => x.id === m.entity);
  return (
    <>
      <div className="insp-head">
        <div className="insp-kind">Pathway link (port)</div>
        <div className="insp-title">{c.direction === 'in' ? '← from' : '→'} {c.target.pathway || 'pathway'}</div>
        <div className="muted small">A connection to another pathway — not a biological reaction. It is never matched to model reactions.</div>
      </div>
      <div className="section">
        <Field label="Metabolite"><b>{e?.name ?? '—'}</b></Field>
        <Field label="Direction"><Seg value={c.direction} options={['out', 'in']} onChange={(v) => designActions.updateConnector(c.id, { direction: v })} labels={{ out: '→ to', in: '← from' }} /></Field>
        <Field label="Pathway"><TextInput value={c.target.pathway} onCommit={(v) => designActions.updateConnector(c.id, { target: { ...c.target, pathway: v.trim() } })} /></Field>
        <Field label="Template">
          <select className="input" value={c.target.template ?? ''} onChange={(ev) => { const t = items.find((i) => i.file.metadata.id === ev.target.value); designActions.updateConnector(c.id, { target: { pathway: t?.file.metadata.name ?? c.target.pathway, ...(t ? { template: t.file.metadata.id } : {}) } }); }}>
            <option value="">— none —</option>
            {items.map((i) => <option key={i.file.metadata.id} value={i.file.metadata.id}>{i.file.metadata.name}</option>)}
          </select>
        </Field>
      </div>
    </>
  );
}

// ------------------------------------------------------------ template (nothing selected)

function TemplateSection({ f }: { f: TemplateFile }) {
  const md = f.metadata;
  const c = useMemo(() => completeness(f), [f]);
  const used = new Set(f.biology.metabolites.map((m) => m.compartment).filter(Boolean) as ConceptualCompartment[]);
  const comps = [...new Set([...f.biology.compartments.map((x) => x.id), ...used])];
  const setFallback = (id: ConceptualCompartment, fb: CompartmentFallback[]) => {
    const list = f.biology.compartments.some((x) => x.id === id) ? f.biology.compartments.map((x) => (x.id === id ? { ...x, fallback: fb } : x)) : [...f.biology.compartments, { id, fallback: fb }];
    designActions.setCompartments(list);
  };
  return (
    <>
      <div className="insp-head">
        <div className="insp-kind">Template</div>
        <div className="insp-title">{md.name}</div>
        <div className="muted small">v{md.template_version} · schema {f.schema_version} · <span className="mono">{md.id}</span></div>
      </div>
      {(md.review_status || md.source) && (
        <div className="section">
          <div className="section-title">Origin and review</div>
          {md.review_status && <Field label="Review"><span className="row gap wrap"><ReviewTag md={md} />{md.last_review && <span className="muted small">{md.last_review}</span>}</span></Field>}
          {md.source && (
            <div className="small">
              {md.source.url ? <a href={md.source.url} target="_blank" rel="noreferrer">{md.source.reference} {md.source.pathway_id} — {md.source.pathway_name}</a> : <>{md.source.reference} {md.source.pathway_id}</>}
              {md.source.generated_by && <div className="muted">Generated by {md.source.generated_by}{md.source.retrieved ? ` · data retrieved ${md.source.retrieved}` : ''}</div>}
              {md.source.generation_method && <div className="muted">{md.source.generation_method}</div>}
              <div className="muted">GEMs MAP's own drawing of the pathway's biology — not an official {md.source.reference} map.</div>
            </div>
          )}
          {md.review_status && md.review_status !== 'human-reviewed' && (
            <button className="btn small" onClick={() => designActions.updateMetadata({ review_status: 'human-reviewed', last_review: new Date().toISOString().slice(0, 10) })}
              title="Record that a person has reviewed this template (identities still keep their own statuses)">Mark as reviewed by me</button>
          )}
        </div>
      )}
      <div className="section"><div className="section-title">Completeness</div><CompletenessBlock c={c} /></div>
      <div className="section">
        <div className="section-title">Metadata</div>
        <Field label="Name"><TextInput value={md.name} onCommit={(v) => designActions.updateMetadata({ name: v.trim() || md.name })} /></Field>
        <Field label="Pathway"><TextInput value={md.pathway} onCommit={(v) => designActions.updateMetadata({ pathway: v })} /></Field>
        <label className="field col"><span>Description</span><textarea key={md.id} className="input" rows={3} defaultValue={md.description} onBlur={(e) => e.target.value !== md.description && designActions.updateMetadata({ description: e.target.value })} /></label>
        <Field label="Version"><TextInput mono value={md.template_version} onCommit={(v) => designActions.updateMetadata({ template_version: v.trim() })} /></Field>
        <Field label="Scope">
          <select className="input" value={md.scope.level} onChange={(e) => designActions.updateMetadata({ scope: { ...md.scope, level: e.target.value as ScopeLevel } })}>
            {(Object.keys(SCOPE_LABEL) as ScopeLevel[]).map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Taxa"><TextInput list value={md.scope.taxa.join(', ')} placeholder="e.g. Aspergillus oryzae" onCommit={(v) => designActions.updateMetadata({ scope: { ...md.scope, taxa: splitList(v) } })} /></Field>
        <Field label="Scope note"><TextInput value={md.scope.note ?? ''} onCommit={(v) => designActions.updateMetadata({ scope: { ...md.scope, note: v.trim() || undefined } })} /></Field>
        <Field label="Authors"><TextInput list value={md.authors.join(', ')} onCommit={(v) => designActions.updateMetadata({ authors: splitList(v) })} /></Field>
        <Field label="License"><TextInput value={md.license} onCommit={(v) => designActions.updateMetadata({ license: v.trim() })} /></Field>
        <Field label="Tags"><TextInput list value={md.tags.join(', ')} onCommit={(v) => designActions.updateMetadata({ tags: splitList(v) })} /></Field>
        <Field label="Citations"><TextInput list value={md.citations.map((x) => x.doi ?? x.text).join('; ')} placeholder="DOI or reference; …" onCommit={(v) => designActions.updateMetadata({ citations: v.split(';').map((x) => x.trim()).filter(Boolean).map((x) => (/^10\.\d+\//.test(x) ? { text: x, doi: x } : { text: x })) })} /></Field>
        {md.derived_from && <div className="muted small">Derived from {md.derived_from.name} v{md.derived_from.template_version}</div>}
      </div>
      <div className="section">
        <div className="section-title">Compartments</div>
        <div className="muted small">Conceptual names, never model IDs. The fallback is where the matcher looks in a model without that compartment (e.g. prokaryotes have no mitochondria).</div>
        {comps.map((id) => {
          const def = f.biology.compartments.find((x) => x.id === id);
          const fb = def?.fallback ?? [];
          return (
            <div key={id} className="row gap comp-row">
              <span className="grow">{compartmentLabel(id)}{used.has(id) ? '' : <span className="muted"> (unused)</span>}</span>
              <select className="input tiny" value={fb.filter((x) => x !== 'intracellular')[0] ?? ''} title="Fallback compartment"
                onChange={(e) => setFallback(id, [...(e.target.value ? [e.target.value as ConceptualCompartment] : []), 'intracellular'])}>
                <option value="">fallback: any intracellular</option>
                {COMPARTMENTS.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>fallback: {x.label.toLowerCase()}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </>
  );
}
