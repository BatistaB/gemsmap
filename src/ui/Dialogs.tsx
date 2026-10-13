import { useEffect, useMemo, useState } from 'react';
import { buildSvg, exportFigure, type ExportOptions } from '../export/export';
import { GIF_MAX_PIXELS, GIF_MAX_SIDE, gifFrameSize, type GifOptions } from '../export/gif';
import { equationString } from '../model/currency';
import { findConnecting, neighbours } from '../model/graph';
import { searchModel } from '../model/search';
import { A, useStore } from '../store/store';
import { FIGURE_SIZES } from '../viz/presets';
import { Icon } from './icons';
import { RoutesPanel } from './Routes';
import { TemplateMappingDialog } from './TemplateMapping';
import { IdentityDialog } from './templates/IdentityDialog';

export function Modal({ title, children, onClose, width = 480 }: { title: string; children: React.ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal" style={{ width }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><span>{title}</span><button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const close = () => useStore.setState({ dialog: null });

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'reaction': return <ReactionDialog sources={dialog.sources} targets={dialog.targets} />;
    case 'metabolite': return <MetaboliteDialog at={dialog.at} bindNodeId={dialog.bindNodeId} />;
    case 'export': return <ExportDialog />;
    case 'saveTemplate': return <SaveTemplateDialog />;
    case 'templateMapping': return <TemplateMappingDialog templateId={dialog.templateId} at={dialog.at} onClose={close} />;
    case 'importReport': return <ImportReportDialog datasetId={dialog.datasetId} />;
    case 'path': return <PathDialog />;
    case 'validation': return <ValidationDialog />;
    case 'help': return <HelpDialog />;
    case 'identity': return <IdentityDialog nodeId={dialog.nodeId} entityId={dialog.entityId} reactionId={dialog.reactionId} query={dialog.query} />;
    case 'routes': return (
      <Modal title="Routes in the model" onClose={close} width={760}>
        <RoutesPanel fromNode={dialog.from} toNode={dialog.to} replaceGlyph={dialog.replaceGlyph} onDone={close} />
      </Modal>
    );
  }
}

function ReactionDialog({ sources, targets }: { sources: string[]; targets: string[] }) {
  const model = useStore((s) => s.model)!;
  const doc = useStore((s) => s.doc);
  const a = doc.nodes[sources[0]], b = doc.nodes[targets[0]];
  const ma = a?.metaboliteId, mb = b?.metaboliteId;
  const [label, setLabel] = useState('');
  const options = useMemo(() => (ma && mb ? findConnecting(model, ma, mb) : []), [model, ma, mb]);
  const outgoing = useMemo(() => (ma ? neighbours(model, ma, 'down').filter((s) => !options.some((o) => o.reactionIds[0] === s.reactionId)).slice(0, 8) : []), [model, ma, options]);
  const create = (rids: string[], reversed: boolean) => {
    A().addReaction(sources, targets, { reactionId: rids[0], lumped: rids.length > 1 ? rids : undefined, reversedToModel: reversed, label: label || undefined }, false);
    close();
  };
  return (
    <Modal title="Create reaction" onClose={close} width={560}>
      <div className="muted small">{ma} → {mb}</div>
      {options.length ? (
        <div className="list">
          {options.map((o) => {
            const r = model.reactions[o.reactionIds[0]];
            return (
              <button key={o.reactionIds.join('+')} className="list-item" onClick={() => create(o.reactionIds, o.reversed)}>
                <div className="li-top"><b>{o.reactionIds.join(' + ')}</b><span className="muted">{r.name}</span>{r.reversible && <span className="tag">reversible</span>}{o.reversed && <span className="tag warn">drawn against model direction</span>}{o.reactionIds.length > 1 && <span className="tag">lumped</span>}</div>
                <div className="mono small">{equationString(r, model.metabolites)}</div>
                <div className="muted small">{[r.subsystem, r.gpr].filter(Boolean).join(' · ')}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="notice">No single reaction in <b>{model.name}</b> converts {ma} into {mb}. Routes through the network:</div>
          <RoutesPanel fromNode={sources[0]} toNode={targets[0]} onDone={close} />
        </>
      )}
      {options.length > 0 && (
        <details className="small"><summary>Alternative multi-step routes in the model</summary>
          <RoutesPanel fromNode={sources[0]} toNode={targets[0]} onDone={close} />
        </details>
      )}
      {outgoing.length > 0 && (
        <details className="small"><summary>Other reactions consuming {ma}</summary>
          <div className="list">{outgoing.map((s) => <div key={s.reactionId + s.to} className="muted mono">{s.reactionId}: {ma} → {s.to}</div>)}</div>
        </details>
      )}
      <div className="row gap">
        <input className="input" placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn" onClick={() => { A().addReaction(sources, targets, { label: label || undefined }, false); close(); }}>Free arrow (no model reaction)</button>
      </div>
    </Modal>
  );
}

function MetaboliteDialog({ at, bindNodeId }: { at: { x: number; y: number }; bindNodeId?: string }) {
  const model = useStore((s) => s.model);
  const node = useStore((s) => (bindNodeId ? s.doc.nodes[bindNodeId] : undefined));
  const [q, setQ] = useState(node?.hints?.[0] ?? node?.label ?? '');
  const [custom, setCustom] = useState({ id: '', name: '' });
  const [sel, setSel] = useState(0);
  const hits = useMemo(() => searchModel(model, q, ['metabolite'], 40), [model, q]);
  const pick = (id: string) => {
    if (bindNodeId) A().bindNode(bindNodeId, id);
    else A().addNode(at, { metaboliteId: id });
    close();
  };
  return (
    <Modal title={bindNodeId ? 'Bind slot to metabolite' : 'Add metabolite'} onClose={close} width={520}>
      <input className="input big" autoFocus placeholder="Search metabolites… (glucose, g6p, pyruvate)" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setSel((s) => Math.min(hits.length - 1, s + 1)); e.preventDefault(); }
          if (e.key === 'ArrowUp') { setSel((s) => Math.max(0, s - 1)); e.preventDefault(); }
          if (e.key === 'Enter' && hits[sel]) pick(hits[sel].id);
        }} />
      <div className="list scroll">
        {hits.map((h, i) => (
          <button key={h.id} className={`list-item ${i === sel ? 'active' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(h.id)}>
            <div className="li-top"><b className="mono">{h.id}</b><span>{h.name}</span><span className="muted small">{h.detail}</span></div>
          </button>
        ))}
        {!hits.length && q && <div className="muted small pad">No match in the model.</div>}
      </div>
      {!bindNodeId && (
        <div className="row gap">
          <input className="input" placeholder="Custom ID" value={custom.id} onChange={(e) => setCustom({ ...custom, id: e.target.value })} />
          <input className="input" placeholder="Label" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          <button className="btn" onClick={() => { A().addNode(at, { label: custom.name || custom.id || 'M', hints: custom.id ? [custom.id] : undefined }); close(); }}>Add slot</button>
        </div>
      )}
      {bindNodeId && node?.metaboliteId && <button className="btn" onClick={() => { A().unbindNode(bindNodeId); close(); }}>Unbind (keep as template slot)</button>}
    </Modal>
  );
}

function ExportDialog() {
  const [o, setO] = useState<ExportOptions>(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('gemsmap.export') || '{}') }; } catch { return defaults; }
  });
  const [preset, setPreset] = useState('auto');
  const hasSelection = useStore((s) => s.selection.length > 0);
  const [msg, setMsg] = useState('');
  const conditions = useStore((s) => s.conditions);
  const [g, setG] = useState<GifOptions>(() => {
    const d: GifOptions = { conditions: [], hold: 1.2, tween: 6, label: true, dpi: 600, loopBack: true };
    try { const saved = JSON.parse(localStorage.getItem('gemsmap.export.gif') || '{}'); delete saved.widthPx; return { ...d, ...saved, conditions: [] }; } catch { return d; }
  });
  // GIF conditions: all of them until the user unticks some; always in the user's condition order
  const gifConds = g.conditions.length ? conditions.filter((c) => g.conditions.includes(c.id)).map((c) => c.id) : conditions.map((c) => c.id);
  const [busy, setBusy] = useState<number | null>(null);
  // frame size preview (same geometry as the export)
  const gifSize = useMemo(() => {
    if (o.format !== 'gif') return null;
    try { const { wMm, hMm } = buildSvg({ ...o, background: 'white' }); return gifFrameSize(wMm, hMm, g.dpi); } catch { return null; }
  }, [o, g.dpi]);
  const set = (p: Partial<ExportOptions>) => setO((x) => ({ ...x, ...p }));
  const run = async () => {
    try { localStorage.setItem('gemsmap.export', JSON.stringify(o)); localStorage.setItem('gemsmap.export.gif', JSON.stringify({ ...g, conditions: [] })); } catch { /* ignore */ }
    try {
      if (o.format === 'gif') {
        setBusy(0);
        const { exportGif } = await import('../export/gif');
        setMsg(await exportGif(o, { ...g, conditions: gifConds }, (f) => setBusy(f)));
      } else setMsg(await exportFigure(o));
    } catch (e) { setMsg(String((e as Error).message)); } finally { setBusy(null); }
  };
  return (
    <Modal title="Export figure" onClose={close} width={440}>
      <div className="seg">
        {(['svg', 'pdf', 'png', 'gif'] as const).map((f) => <button key={f} className={o.format === f ? 'on' : ''} onClick={() => set({ format: f })}>{f.toUpperCase()}</button>)}
      </div>
      <div className="muted small">{o.format === 'svg' ? 'Vector, editable in Illustrator / Inkscape / Affinity. Text stays text.' : o.format === 'pdf' ? 'Vector PDF through the browser print dialog (“Save as PDF”).' : o.format === 'gif' ? 'Animation across conditions for slides and posters: arrow widths, colours and plots change from one condition to the next.' : 'Raster with embedded DPI metadata.'}</div>
      {o.format === 'gif' && (
        <div className="gif-opts">
          <div className="field"><span>Conditions (in order)</span>
            {conditions.length < 2 ? <div className="muted small">Import data with at least two conditions first.</div> : (
              <div className="gif-conds">
                {conditions.map((c) => {
                  const on = gifConds.includes(c.id);
                  return (
                    <label key={c.id} className="check small" style={{ ['--c' as string]: c.color }}>
                      <input type="checkbox" checked={on} onChange={() => setG({ ...g, conditions: on ? gifConds.filter((x) => x !== c.id) : [...gifConds, c.id] })} />
                      <i className="gif-dot" />{c.name}
                    </label>
                  );
                })}
              </div>
            )}
            <div className="muted small">The order follows Data → Conditions (drag to reorder there).</div>
          </div>
          <div className="row gap">
            <label className="field"><span>Hold (s)</span><input className="input" type="number" min={0.2} step={0.1} value={g.hold} onChange={(e) => setG({ ...g, hold: +e.target.value })} /></label>
            <label className="field"><span>Transition</span>
              <select className="input" value={g.tween} onChange={(e) => setG({ ...g, tween: +e.target.value })}>
                <option value={0}>cut</option><option value={4}>quick</option><option value={6}>smooth</option><option value={10}>slow</option>
              </select>
            </label>
          </div>
          <label className="field"><span>Resolution</span>
            <div className="seg">{[300, 600, 900].map((d) => <button key={d} className={g.dpi === d ? 'on' : ''} onClick={() => setG({ ...g, dpi: d })}>{d} dpi</button>)}</div>
          </label>
          {gifSize && <div className={`muted small ${gifSize.capped ? 'warn-text' : ''}`}>
            Frames: {gifSize.w} × {gifSize.h} px{gifSize.capped ? ` — capped at ${GIF_MAX_SIDE} px / ${GIF_MAX_PIXELS / 1e6} MP (the figure is large at natural size; pick a journal width above for the full ${g.dpi} dpi)` : ''}. Higher resolution = sharper but larger file and slower export.
          </div>}
          <div className="row gap wrap">
            <label className="check small"><input type="checkbox" checked={g.label} onChange={(e) => setG({ ...g, label: e.target.checked })} /> Show condition name</label>
            <label className="check small"><input type="checkbox" checked={g.loopBack} onChange={(e) => setG({ ...g, loopBack: e.target.checked })} /> Smooth loop back to the first</label>
          </div>
        </div>
      )}
      <label className="field"><span>Area</span>
        <div className="seg">
          {([['all', 'Entire figure'], ['view', 'Current view'], ['selection', 'Selection']] as const).map(([v, l]) => (
            <button key={v} className={(o.area ?? 'all') === v ? 'on' : ''} disabled={v === 'selection' && !hasSelection} onClick={() => set({ area: v })}>{l}</button>
          ))}
        </div>
      </label>
      {(o.area ?? 'all') === 'view' && <div className="muted small">Exports exactly what is framed on the canvas now (close this dialog and pan/zoom to adjust).</div>}
      <label className="field"><span>Size</span>
        <select className="input" value={preset} onChange={(e) => { setPreset(e.target.value); const p = FIGURE_SIZES.find((x) => x.id === e.target.value)!; set({ widthMm: p.w, heightMm: p.h }); }}>
          {FIGURE_SIZES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="custom">Custom…</option>
        </select>
      </label>
      {preset === 'custom' && (
        <div className="row gap">
          <label className="field"><span>Width (mm)</span><input className="input" type="number" value={o.widthMm} onChange={(e) => set({ widthMm: +e.target.value })} /></label>
          <label className="field"><span>Max height (mm)</span><input className="input" type="number" value={o.heightMm} onChange={(e) => set({ heightMm: +e.target.value })} /></label>
        </div>
      )}
      {o.format === 'png' && (
        <label className="field"><span>Resolution</span>
          <div className="seg">{[150, 300, 600].map((d) => <button key={d} className={o.dpi === d ? 'on' : ''} onClick={() => set({ dpi: d })}>{d} dpi</button>)}</div>
        </label>
      )}
      <label className="field"><span>Background</span>
        <div className="seg">{(['white', 'transparent'] as const).map((b) => <button key={b} className={o.background === b ? 'on' : ''} onClick={() => set({ background: b })}>{b}</button>)}</div>
      </label>
      <label className="field"><span>Margin</span><input className="input" type="number" value={o.margin} onChange={(e) => set({ margin: +e.target.value })} /></label>
      <div className="muted small">The grid, selection and handles are never exported.</div>
      <div className="row gap end">
        {busy != null && <span className="small muted">Rendering frames… {Math.round(busy * 100)}%</span>}
        {busy == null && msg && <span className="small ok">{msg}</span>}
        <button className="btn primary" onClick={run} disabled={busy != null || (o.format === 'gif' && gifConds.length < 2)}><Icon name="export" size={14} /> Export {o.format.toUpperCase()}</button>
      </div>
    </Modal>
  );
}
const defaults: ExportOptions = { format: 'svg', background: 'white', widthMm: 0, heightMm: 0, dpi: 300, margin: 16 };

function SaveTemplateDialog() {
  const [name, setName] = useState('My pathway');
  return (
    <Modal title="Save selection as template" onClose={close} width={420}>
      <p className="small muted">Bound metabolites and reactions are stored as compartment-free hints (e.g. <span className="mono">g6p</span>, <span className="mono">PFK</span>), so the template re-binds automatically to other GEMs.</p>
      <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { A().saveSelectionAsTemplate(name); close(); } }} />
      <div className="row end"><button className="btn primary" onClick={() => { A().saveSelectionAsTemplate(name); close(); }}>Save template</button></div>
    </Modal>
  );
}

function ImportReportDialog({ datasetId }: { datasetId: string }) {
  const ds = useStore((s) => s.datasets.find((d) => d.id === datasetId));
  const model = useStore((s) => s.model);
  const [q, setQ] = useState<Record<string, string>>({});
  if (!ds) return null;
  const pct = Math.round((ds.matchedFraction ?? 1) * 100);
  const table = ds.target === 'reaction' ? model?.reactions : model?.metabolites;
  return (
    <Modal title={`ID matching — ${ds.name}`} onClose={close} width={560}>
      <div className="match-bar"><div style={{ width: `${pct}%` }} /></div>
      <div className="row between"><b>{pct}% {ds.target}s matched</b><span className="muted">{ds.unmatched.length} unmatched</span></div>
      {model && pct < 30 && (
        <div className="notice">
          <b>This file looks like it was made for a different model.</b> Almost none of its IDs (e.g. <span className="mono">{ds.unmatched.slice(0, 3).join(', ')}</span>) exist in <b>{model.name}</b>
          {' '}(which uses IDs like <span className="mono">{Object.keys(ds.target === 'reaction' ? model.reactions : model.metabolites).slice(0, 3).join(', ')}</span>).
          Mapping them one by one is rarely worth it — remove this dataset and import the flux table simulated with this model.
          <div className="row gap" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => { A().removeDataset(ds.id); close(); }}>Remove this dataset</button>
          </div>
        </div>
      )}
      {ds.unmatched.length > 0 && model && (
        <div className="list scroll">
          {ds.unmatched.slice(0, 200).map((raw) => (
            <div key={raw} className="row gap">
              <span className="mono grow">{raw}</span>
              <input className="input" list="model-ids" placeholder="map to model id…" value={q[raw] ?? ''} onChange={(e) => setQ({ ...q, [raw]: e.target.value })} />
              <button className="btn" disabled={!table?.[q[raw] ?? '']} onClick={() => A().remapDatasetId(ds.id, raw, q[raw])}>Map</button>
            </div>
          ))}
          <datalist id="model-ids">{Object.keys(table ?? {}).slice(0, 5000).map((id) => <option key={id} value={id} />)}</datalist>
        </div>
      )}
      {!model && <div className="notice">No model loaded — IDs are kept as-is and matched against glyph bindings.</div>}
      <div className="row end"><button className="btn primary" onClick={close}>Done</button></div>
    </Modal>
  );
}

function PathDialog() {
  const model = useStore((s) => s.model);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cur, setCur] = useState(false);
  const opts = useMemo(() => Object.keys(model?.metabolites ?? {}), [model]);
  return (
    <Modal title="Find metabolic path" onClose={close} width={440}>
      <label className="field"><span>Start</span><input className="input" list="met-ids" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. glc__D_c" /></label>
      <label className="field"><span>End</span><input className="input" list="met-ids" value={to} onChange={(e) => setTo(e.target.value)} placeholder="e.g. succ_c" /></label>
      <datalist id="met-ids">{opts.slice(0, 5000).map((id) => <option key={id} value={id} />)}</datalist>
      <label className="check"><input type="checkbox" checked={cur} onChange={(e) => setCur(e.target.checked)} /> Allow currency metabolites (ATP, NADH, H₂O…) as links</label>
      <div className="row end"><button className="btn primary" disabled={!model?.metabolites[from] || !model?.metabolites[to]} onClick={() => { A().findPath(from, to, cur); close(); }}>Find fewest-reaction route</button></div>
    </Modal>
  );
}

function ValidationDialog() {
  const issues = useStore((s) => s.validation);
  const model = useStore((s) => s.model);
  return (
    <Modal title={`Model validation — ${model?.name ?? ''}`} onClose={close} width={520}>
      {!issues.length && <div className="ok">No issues found.</div>}
      {issues.map((i, k) => (
        <details key={k} className={`issue ${i.level}`}>
          <summary><span className={`tag ${i.level === 'error' ? 'warn' : ''}`}>{i.level}</span> {i.message}</summary>
          <div className="mono small muted">{i.ids.slice(0, 60).join(', ')}{i.ids.length > 60 ? ' …' : ''}</div>
        </details>
      ))}
    </Modal>
  );
}

function HelpDialog() {
  const rows: [string, string][] = [
    ['V', 'Select'], ['M', 'Metabolite (from model)'], ['S', 'Empty slot (template)'], ['R', 'Reaction tool'], ['T', 'Text'], ['Space (hold) + drag · right-drag · C', 'Pan the map'],
    ['P', 'Add plot to selected reaction(s)'], ['Ctrl K', 'Command palette'], ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'], ['Ctrl C / V / D', 'Copy / paste / duplicate'],
    ['Ctrl G', 'Group as pathway'], ['Ctrl A', 'Select all'], ['Del', 'Delete'], ['L', 'Lock selection (skipped by clicks; hold 3 s to unlock)'], ['Arrows (+Shift)', 'Nudge 1 (10) units'],
    ['Shift + drag', 'Constrain to 0° / 45° / 90°'], ['Alt + drag', 'Ignore smart guides'], ['F / Shift F', 'Fit all / fit selection'], ['[ / ]', 'Previous / next condition'],
    ['Double-click canvas', 'Add metabolite'], ['Drag outer ring of a node', 'Draw reaction (drop on empty = new slot)'], ['Double-click label', 'Edit text'],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={close} width={520}>
      <div className="kbd-grid">{rows.map(([k, v]) => <div key={k} className="kbd-row"><kbd>{k}</kbd><span>{v}</span></div>)}</div>
    </Modal>
  );
}
