import { SectionsBar, useCollapsibleSections } from '../../ui/Collapsible';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { A } from '../../store/store';
import { Icon } from '../../ui/icons';
import { addMetabolitesToMap, addReactionsToMap, focusInMap, glyphFor } from '../bridge';
import { fbound, fnum, FLUX_UNIT, fvaWidth, reactionTypeLabel } from '../format';
import { L, lab, useLab } from '../store';
import type { Annotation, Bounds, EntityRef, LabReaction } from '../types';
import { ELink, Equation, InfoTip, NumberInput, Star } from './common';
import { LocalNetwork } from './LocalNetwork';
import { openBoundary, openMetaboliteEditor, openReactionEditor } from './edit/EditDialogs';
import { duplicateMetabolite, duplicateReaction, newReactionWith } from './edit/EditsMenu';
import { Popover } from './common';
import { ResizeHandle, usePanelWidth } from '../../ui/Resizer';

const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text).then(() => A().toast(`Copied ${what}`), () => A().toast('Clipboard unavailable')); };

export function LabInspector() {
  const pw = usePanelWidth('lab-inspector', 344, 260, 760);
  const folds = useCollapsibleSections('lab-inspector');
  const open = useLab((s) => s.inspectorOpen);
  const nav = useLab((s) => s.nav);
  const index = useLab((s) => s.index);
  if (!open || !index) return null;
  const cur = nav.stack[nav.index];
  return (
    <aside className="lab-inspector" style={{ width: pw.css }}>
      <ResizeHandle panel={pw} edge="left" />
      <div className="li-nav">
        <button className="icon-btn" title="Back (Alt ←)" disabled={nav.index <= 0} onClick={lab.back}><Icon name="chevL" size={15} /></button>
        <button className="icon-btn" title="Forward (Alt →)" disabled={nav.index >= nav.stack.length - 1} onClick={lab.forward}><Icon name="chevR" size={15} /></button>
        <Breadcrumbs />
        <button className="icon-btn" title="Close inspector" onClick={() => useLab.setState({ inspectorOpen: false })}><Icon name="x" size={13} /></button>
      </div>
      <SectionsBar api={folds} />
      <div className="li-body" ref={folds.ref}>
        <div key={cur ? `${cur.kind}:${cur.id}:${nav.index}` : 'empty'}>
        {!cur && <InspectorEmpty />}
        {cur?.kind === 'metabolite' && <MetaboliteView id={cur.id} />}
        {cur?.kind === 'reaction' && <ReactionView id={cur.id} />}
        {cur?.kind === 'gene' && <GeneView id={cur.id} />}
        {cur?.kind === 'subsystem' && <SubsystemView id={cur.id} />}
        </div>
      </div>
    </aside>
  );
}

function Breadcrumbs() {
  const nav = useLab((s) => s.nav);
  const index = useLab((s) => s.index)!;
  const first = Math.max(0, nav.stack.length - 7);
  const label = (r: EntityRef) => (r.kind === 'metabolite' ? index.met.get(r.id)?.name || r.id : r.id);
  return (
    <div className="crumbs">
      {first > 0 && <span className="muted">…</span>}
      {nav.stack.slice(first).map((r, i) => {
        const at = first + i;
        return (
          <span key={at} className="crumb-wrap">
            {i > 0 || first > 0 ? <span className="crumb-sep">›</span> : null}
            <button className={`crumb k-${r.kind} ${at === nav.index ? 'on' : ''}`} title={`${r.kind}: ${r.id}`} onClick={() => lab.goTo(at)}>{label(r)}</button>
          </span>
        );
      })}
    </div>
  );
}

function InspectorEmpty() {
  return (
    <div className="li-empty">
      <div className="insp-title">Inspector</div>
      <p className="muted small">Click any metabolite, reaction or gene — in a table, an equation, a search result or the local network — to inspect it here. Keep clicking to walk through the network; use ← → (Alt ←/→) to go back.</p>
      <p className="muted small">Press <kbd>Ctrl K</kbd> to search the whole model.</p>
    </div>
  );
}

function Head({ kind, title, sub, r, children }: { kind: string; title: ReactNode; sub?: ReactNode; r: EntityRef; children?: ReactNode }) {
  return (
    <div className="li-head">
      <div className="row between"><span className="insp-kind">{kind}</span><Star r={r} /></div>
      <div className="insp-title">{title}</div>
      {sub && <div className="mono small muted">{sub}</div>}
      {children && <div className="li-actions">{children}</div>}
    </div>
  );
}

function KV({ k, children, mono }: { k: ReactNode; children: ReactNode; mono?: boolean }) {
  return <div className="kv"><span>{k}</span><span className={mono ? 'mono' : ''}>{children}</span></div>;
}

function Annotations({ a }: { a: Annotation }) {
  const entries = Object.entries(a ?? {});
  if (!entries.length) return null;
  return (
    <details className="li-sec">
      <summary className="insp-sub">Annotations · {entries.length}</summary>
      <div className="ann">
        {entries.map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span className="mono small">{Array.isArray(v) ? v.join(', ') : v}</span></div>)}
      </div>
    </details>
  );
}

function OtherStateNote() {
  const flux = useLab((s) => L.fluxResult(s));
  const activeState = useLab((s) => s.activeStateId);
  if (!flux || flux.modelStateId === activeState) return null;
  return <div className="note small">Values from “{flux.name}” (state <b>{flux.metadata.state.name}</b>), not from the active state.</div>;
}

// ------------------------------------------------------------------ metabolite

function MetaboliteView({ id }: { id: string }) {
  const index = useLab((s) => s.index)!;
  const model = useLab((s) => s.model)!;
  const flux = useLab((s) => L.fluxResult(s));
  const tol = useLab((s) => s.settings.zeroTolerance);
  const cmp = useLab((s) => s.compare.result);
  const m = index.met.get(id);
  if (!m) return <div className="li-sec muted">Unknown metabolite {id}</div>;
  const rids = index.metRxns.get(id) ?? [];
  const fx = flux?.reactionFluxes;
  const turnover = flux?.metaboliteTurnover?.[id];
  const producing: string[] = [], consuming: string[] = [], idle: string[] = [];
  for (const rid of rids) {
    const c = index.rxn.get(rid)!.stoichiometry[id];
    if (fx) {
      const p = c * (fx[rid] ?? 0);
      (p > tol ? producing : p < -tol ? consuming : idle).push(rid);
    } else (c > 0 ? producing : consuming).push(rid);
  }
  const byFlux = (a: string, b: string) => Math.abs((fx?.[b] ?? 0) * index.rxn.get(b)!.stoichiometry[id]) - Math.abs((fx?.[a] ?? 0) * index.rxn.get(a)!.stoichiometry[id]);
  producing.sort(byFlux); consuming.sort(byFlux);
  const onMap = glyphFor({ kind: 'metabolite', id });
  const inCompare = cmp?.metabolites?.find((x) => x.id === id);
  return (
    <>
      <Head kind="Metabolite" title={m.name || m.id} sub={m.id} r={{ kind: 'metabolite', id }}>
        <button className="btn small" onClick={() => addMetabolitesToMap([id], false)}><Icon name="plus" size={12} /> Add to map</button>
        {onMap && <button className="btn small" onClick={() => focusInMap({ kind: 'metabolite', id })}><Icon name="fit" size={12} /> Focus in map</button>}
        <button className="btn small" onClick={() => lab.showInExplorer('reactions', rids, `Connected to ${id}`)}>Connected reactions</button>
        <CopyMenu items={[['ID', m.id], ['name', m.name], ['formula', m.formula ?? '']]} />
        <div className="li-edit">
          <button className="btn small" onClick={() => openMetaboliteEditor(id)}><Icon name="tidy" size={11} /> Edit</button>
          <Popover trigger={(o, t) => <button className={`btn small ${o ? 'on' : ''}`} onClick={t} title="Exchange, sink or demand reaction for this metabolite">Boundary ▾</button>}>
            {(close) => (
              <div className="menu-list">
                <button onClick={() => { close(); openBoundary(id, 'exchange'); }}><span>Create Exchange</span><span className="muted small">exchange with the environment</span></button>
                <button onClick={() => { close(); openBoundary(id, 'sink'); }}><span>Create Sink</span><span className="muted small">artificial supply / removal</span></button>
                <button onClick={() => { close(); openBoundary(id, 'demand'); }}><span>Create Demand</span><span className="muted small">irreversible removal</span></button>
              </div>
            )}
          </Popover>
          <button className="btn small" onClick={() => newReactionWith(id)} title="Open the reaction builder with this metabolite">New reaction with it</button>
          <Popover align="right" trigger={(o, t) => <button className={`btn small ${o ? 'on' : ''}`} onClick={t}>⋯</button>}>
            {(close) => (
              <div className="menu-list">
                <button onClick={() => { close(); duplicateMetabolite(id); }}>Duplicate…</button>
                <button onClick={() => { close(); useLab.setState({ dialog: { kind: 'delete-metabolite', id } }); }}>Delete metabolite…</button>
              </div>
            )}
          </Popover>
        </div>
      </Head>
      <div className="li-sec">
        <KV k="Formula" mono>{m.formula ?? '—'}</KV>
        <KV k="Charge" mono>{m.charge ?? '—'}</KV>
        <KV k="Compartment">{model.compartments[m.compartment] ?? m.compartment}</KV>
        <KV k={<span>Turnover <InfoTip text={'Derived proxy: 0.5 × Σ |coefficient × flux| over the reactions of this metabolite, from the active flux result. Not a flux of the metabolite itself.'} /></span>} mono>
          {flux ? <>{fnum(turnover)} <span className="muted small">{FLUX_UNIT}</span></> : <span className="muted">— (no simulation)</span>}
        </KV>
        <OtherStateNote />
        {inCompare && <button className="btn small block" onClick={() => { lab.setSection('compare'); lab.explainTurnover(id); }}>Why did turnover {inCompare.delta != null && inCompare.delta >= 0 ? 'increase' : 'decrease'}? ({fnum(inCompare.a)} → {fnum(inCompare.b)})</button>}
      </div>
      <div className="li-sec">
        <div className="insp-sub">{fx ? 'Producing' : 'Produced by (as written)'} · {producing.length}</div>
        <RxnList rids={producing} metId={id} />
        <div className="insp-sub">{fx ? 'Consuming' : 'Consumed by (as written)'} · {consuming.length}</div>
        <RxnList rids={consuming} metId={id} />
        {fx && idle.length > 0 && (
          <details><summary className="insp-sub">No flux · {idle.length}</summary><RxnList rids={idle} metId={id} /></details>
        )}
        {!fx && <div className="muted small">⇌ marks reversible reactions — they may run either way. Run a simulation to split by actual flux.</div>}
      </div>
      <div className="li-sec"><LocalNetwork center={{ kind: 'metabolite', id }} /></div>
      <Annotations a={m.annotation} />
    </>
  );
}

function RxnList({ rids, metId }: { rids: string[]; metId?: string }) {
  const index = useLab((s) => s.index)!;
  const flux = useLab((s) => L.fluxResult(s));
  const tol = useLab((s) => s.settings.zeroTolerance);
  const [all, setAll] = useState(false);
  const shown = all ? rids : rids.slice(0, 12);
  if (!rids.length) return <div className="muted small li-none">none</div>;
  return (
    <div className="rxn-list">
      {shown.map((rid) => {
        const r = index.rxn.get(rid)!;
        const v = flux?.reactionFluxes?.[rid];
        const c = metId ? r.stoichiometry[metId] : undefined;
        return (
          <div key={rid} className="rxn-row" onClick={() => lab.navigate({ kind: 'reaction', id: rid })}
            onContextMenu={(e) => { e.preventDefault(); useLab.setState({ contextMenu: { x: e.clientX, y: e.clientY, refs: [{ kind: 'reaction', id: rid }] } }); }}>
            <div className="row between">
              <ELink r={{ kind: 'reaction', id: rid }}>{rid}{r.reversible && <span className="muted"> ⇌</span>}</ELink>
              {flux && <span className={`mono small ${v != null && Math.abs(v) < tol ? 'zero' : ''}`} title={c != null && v != null ? `contribution to this metabolite: ${fnum(c * v)}` : undefined}>{fnum(v)}</span>}
            </div>
            <div className="muted small ellipsis" title={r.equationNames}>{r.name ? `${r.name} · ` : ''}{r.equationNames}</div>
          </div>
        );
      })}
      {rids.length > 12 && <button className="link small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${rids.length}`}</button>}
    </div>
  );
}

function CopyMenu({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="pop-wrap">
      <button className="btn small" onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)}>Copy ▾</button>
      {open && <div className="popover left menu-list">{items.filter(([, v]) => v).map(([k, v]) => <button key={k} onMouseDown={() => copy(v, k)}>Copy {k}</button>)}</div>}
    </span>
  );
}

// ------------------------------------------------------------------ reaction

function ReactionView({ id }: { id: string }) {
  const index = useLab((s) => s.index)!;
  const model = useLab((s) => s.model)!;
  const st = useLab((s) => L.activeState(s));
  const flux = useLab((s) => L.fluxResult(s));
  const fva = useLab((s) => L.fvaResult(s));
  const tol = useLab((s) => s.settings.zeroTolerance);
  const [names, setNames] = useState(true);
  const r = index.rxn.get(id);
  if (!r) return <div className="li-sec muted">Unknown reaction {id}</div>;
  const v = flux?.reactionFluxes?.[id];
  const iv = fva?.fva?.[id];
  const obj = L.objective(st).coefficients[id];
  const onMap = glyphFor({ kind: 'reaction', id });
  const subs = Object.entries(r.stoichiometry).filter(([, c]) => c < 0);
  const prods = Object.entries(r.stoichiometry).filter(([, c]) => c > 0);
  return (
    <>
      <Head kind={`${reactionTypeLabel(r.type)} reaction`} title={r.id} sub={r.name !== r.id ? r.name : undefined} r={{ kind: 'reaction', id }}>
        <button className="btn small" onClick={() => addReactionsToMap([id], 'vertical')}><Icon name="plus" size={12} /> Add to map</button>
        {onMap && <button className="btn small" onClick={() => focusInMap({ kind: 'reaction', id })}><Icon name="fit" size={12} /> Focus in map</button>}
        <button className="btn small" onClick={() => lab.setObjectiveReaction(id)} disabled={obj === 1 && Object.keys(L.objective(st).coefficients).length === 1}>Set as objective</button>
        <CopyMenu items={[['ID', r.id], ['name', r.name], ['equation', r.equation]]} />
        <div className="li-edit">
          <button className="btn small" onClick={() => openReactionEditor(id)} title="Equation, bounds, ID, name, GPR, annotations"><Icon name="tidy" size={11} /> Edit reaction</button>
          <Popover align="right" trigger={(o, t) => <button className={`btn small ${o ? 'on' : ''}`} onClick={t}>⋯</button>}>
            {(close) => (
              <div className="menu-list">
                <button onClick={() => { close(); duplicateReaction(id); }}>Duplicate…</button>
                <button onClick={() => { close(); useLab.setState({ dialog: { kind: 'delete-reaction', id } }); }}>Delete reaction…</button>
              </div>
            )}
          </Popover>
        </div>
      </Head>
      <div className="li-sec">
        <div className="row between"><span className="insp-sub">Equation</span><button className="link small" onClick={() => setNames(!names)}>{names ? 'show IDs' : 'show names'}</button></div>
        <Equation r={r} names={names} />
      </div>
      <div className="li-sec">
        <div className="row between">
          <span className="insp-sub">Flux</span>
          {flux && <span className="muted small ellipsis" title={flux.name}>{flux.name}</span>}
        </div>
        {flux
          ? <div className="bignum mono">{fnum(v)} <span className="unit">{FLUX_UNIT}</span></div>
          : <div className="muted small">— No simulation yet.</div>}
        {fva && iv && <div className="kv"><span>FVA interval</span><span className="mono">[{fnum(iv.minimum)}, {fnum(iv.maximum)}] · width {fnum(fvaWidth(iv.minimum, iv.maximum, tol))}</span></div>}
        <OtherStateNote />
      </div>
      <BoundsEditor r={r} />
      <div className="li-sec">
        <KV k="Objective coefficient" mono>{obj ? fnum(obj, 3) : '0'}</KV>
        <KV k="Subsystem">{r.subsystem ? <ELink r={{ kind: 'subsystem', id: r.subsystem }}>{r.subsystem}</ELink> : '—'}</KV>
        <KV k="Compartments">{r.compartments.map((c) => model.compartments[c] ?? c).join(', ') || '—'}</KV>
        <KV k="EC" mono>{r.ec.join(', ') || '—'}</KV>
      </div>
      <div className="li-sec">
        <div className="part-cols">
          <div><div className="insp-sub">Reactants · {subs.length}</div>{subs.map(([m, c]) => <MetChip key={m} id={m} c={c} />)}</div>
          <div><div className="insp-sub">Products · {prods.length}</div>{prods.map(([m, c]) => <MetChip key={m} id={m} c={c} />)}</div>
        </div>
      </div>
      <div className="li-sec">
        <div className="insp-sub">Genes · {r.genes.length}</div>
        {r.gpr ? <Gpr rule={r.gpr} /> : <div className="muted small">No gene association.</div>}
      </div>
      <div className="li-sec"><LocalNetwork center={{ kind: 'reaction', id }} /></div>
      <Annotations a={r.annotation} />
    </>
  );
}

function MetChip({ id, c }: { id: string; c: number }) {
  const m = useLab((s) => s.index?.met.get(id));
  return (
    <div className="met-chip">
      {Math.abs(c) !== 1 && <span className="mono small muted">{fnum(Math.abs(c), 3)}</span>}
      <ELink r={{ kind: 'metabolite', id }} title={id}>{m?.name || id}</ELink>
      <span className="mono small muted ellipsis">{id}</span>
    </div>
  );
}

function Gpr({ rule }: { rule: string }) {
  const tokens = rule.split(/(\(|\)|\s+)/).filter((t) => t && !/^\s+$/.test(t));
  return (
    <div className="gpr">
      {tokens.map((t, i) => (t === '(' || t === ')' ? <span key={i} className="muted">{t}</span>
        : /^(and|or)$/i.test(t) ? <span key={i} className="gpr-op"> {t.toUpperCase()} </span>
          : <ELink key={i} r={{ kind: 'gene', id: t }}>{t}</ELink>))}
    </div>
  );
}

function BoundsEditor({ r }: { r: LabReaction }) {
  const st = useLab((s) => L.activeState(s));
  const cur = L.bounds(st, r);
  const [lb, setLb] = useState<number | null>(cur[0]);
  const [ub, setUb] = useState<number | null>(cur[1]);
  useEffect(() => { setLb(cur[0]); setUb(cur[1]); }, [cur[0], cur[1], r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = lb !== cur[0] || ub !== cur[1];
  const modified = cur[0] !== r.lb || cur[1] !== r.ub;
  const invalid = lb != null && ub != null && lb > ub;
  const apply = () => { if (!invalid) lab.setBounds(r.id, [lb, ub] as Bounds); };
  return (
    <div className="li-sec">
      <div className="row between"><span className="insp-sub">Bounds <span className="muted">· state “{st.name}”</span></span>{modified && <span className="tag warn">modified</span>}</div>
      <div className="bounds-grid">
        <label><span>Lower</span><NumberInput allowEmpty value={lb} onCommit={setLb} placeholder="−∞" /></label>
        <label><span>Upper</span><NumberInput allowEmpty value={ub} onCommit={setUb} placeholder="∞" /></label>
        <button className="btn small primary" disabled={!dirty || invalid} onClick={apply}>Apply</button>
      </div>
      {invalid && <div className="small warn-text">Lower bound must not exceed the upper bound.</div>}
      {modified && (
        <div className="orig small">
          {cur[0] !== r.lb && <div>LB: <span className="mono">{fbound(r.lb, 'lower')} → {fbound(cur[0], 'lower')}</span></div>}
          {cur[1] !== r.ub && <div>UB: <span className="mono">{fbound(r.ub, 'upper')} → {fbound(cur[1], 'upper')}</span></div>}
        </div>
      )}
      <div className="row gap wrap">
        <button className="btn small" onClick={() => lab.blockReactions([r.id])} disabled={cur[0] === 0 && cur[1] === 0}>Block</button>
        <button className="btn small" onClick={() => lab.allowReversible(r.id)}>Allow reversible</button>
        <button className="btn small" onClick={() => lab.resetBounds([r.id])} disabled={!modified}>Reset original</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ gene & subsystem

function GeneView({ id }: { id: string }) {
  const index = useLab((s) => s.index)!;
  const flux = useLab((s) => L.fluxResult(s));
  const tol = useLab((s) => s.settings.zeroTolerance);
  const g = index.gene.get(id);
  if (!g) return <div className="li-sec muted">Unknown gene {id}</div>;
  const active = flux?.reactionFluxes ? g.reactions.filter((r) => Math.abs(flux.reactionFluxes![r] ?? 0) >= tol).length : null;
  return (
    <>
      <Head kind="Gene" title={g.id} sub={g.name && g.name !== g.id ? g.name : undefined} r={{ kind: 'gene', id }}>
        <button className="btn small" onClick={() => addReactionsToMap(g.reactions, 'vertical')}><Icon name="plus" size={12} /> Add reactions to map</button>
        <button className="btn small" onClick={() => lab.showInExplorer('reactions', g.reactions, `Gene ${id}`)}>Show in table</button>
        <CopyMenu items={[['ID', g.id], ['name', g.name]]} />
      </Head>
      <div className="li-sec">
        <KV k="Associated reactions" mono>{g.reactions.length}</KV>
        <KV k="Active (non-zero flux)" mono>{active ?? '—'}</KV>
        <div className="muted small">Gene knockout simulation is planned; for now, block the associated reactions to explore an essential-gene hypothesis.</div>
      </div>
      <div className="li-sec">
        <div className="insp-sub">Reactions · GPR</div>
        {g.reactions.map((rid) => {
          const r = index.rxn.get(rid)!;
          return (
            <div key={rid} className="rxn-row" onClick={() => lab.navigate({ kind: 'reaction', id: rid })}>
              <div className="row between"><ELink r={{ kind: 'reaction', id: rid }}>{rid}</ELink>{flux && <span className="mono small">{fnum(flux.reactionFluxes?.[rid])}</span>}</div>
              <div className="muted small ellipsis">{r.name}</div>
              {r.gpr && <div className="small gpr-line"><Gpr rule={r.gpr} /></div>}
            </div>
          );
        })}
      </div>
      <Annotations a={g.annotation} />
    </>
  );
}

function SubsystemView({ id }: { id: string }) {
  const index = useLab((s) => s.index)!;
  const flux = useLab((s) => L.fluxResult(s));
  const tol = useLab((s) => s.settings.zeroTolerance);
  const rids = useMemo(() => index.subsystems.get(id) ?? [], [index, id]);
  const mets = useMemo(() => new Set(rids.flatMap((r) => Object.keys(index.rxn.get(r)!.stoichiometry))), [rids, index]);
  const genes = useMemo(() => new Set(rids.flatMap((r) => index.rxn.get(r)!.genes)), [rids, index]);
  const active = flux?.reactionFluxes ? rids.filter((r) => Math.abs(flux.reactionFluxes![r] ?? 0) >= tol).length : null;
  return (
    <>
      <Head kind="Subsystem" title={id} r={{ kind: 'subsystem', id }}>
        <button className="btn small primary" onClick={() => addReactionsToMap(rids, 'hierarchical')}><Icon name="plus" size={12} /> Add subsystem to map</button>
        <button className="btn small" onClick={() => useLab.setState((s) => ({ rxnFilters: { ...s.rxnFilters, subsystems: [id] }, explorerTab: 'reactions', section: 'explore' }))}>Filter table</button>
        <button className="btn small" title="Select all reactions of the subsystem (adds to the current selection)"
          onClick={() => { const cur = useLab.getState().selection.reactions; lab.setSelection('reactions', [...new Set([...cur, ...rids])]); lab.setTab('reactions'); }}>Select reactions</button>
        <button className="btn small" title="Flux variability of just this subsystem's reactions" onClick={() => { lab.simulate('fva', { reactions: rids }); lab.setSection('simulate'); }}>FVA on subsystem</button>
      </Head>
      <div className="li-sec">
        <div className="stats">
          <div><b>{rids.length}</b><span>reactions</span></div>
          <div><b>{mets.size}</b><span>metabolites</span></div>
          <div><b>{genes.size}</b><span>genes</span></div>
        </div>
        {active != null && <KV k="Active reactions" mono>{active} / {rids.length}</KV>}
      </div>
      <div className="li-sec"><div className="insp-sub">Reactions</div><RxnList rids={rids} /></div>
    </>
  );
}
