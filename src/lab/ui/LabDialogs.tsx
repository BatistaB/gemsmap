import { useState } from 'react';
import { useStore } from '../../store/store';
import { Icon } from '../../ui/icons';
import { sendComparisonToMap, sendResultToMap, type ResultMappingChoice } from '../bridge';
import { fbounds } from '../format';
import { L, lab, useLab } from '../store';
import type { CompareRow } from '../types';
import { exportModelFile } from './CobraGui';
import { EDITOR_DIALOGS, EditorDialogs } from './edit/EditDialogs';

export function LabDialogs() {
  const d = useLab((s) => s.dialog);
  if (!d) return null;
  // the structural editor has its own frame (a stray click outside never drops a draft)
  if (EDITOR_DIALOGS.includes(d.kind)) return <EditorDialogs d={d} />;
  const close = () => useLab.setState({ dialog: null });
  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div className="modal lab-modal" onPointerDown={(e) => e.stopPropagation()}>
        {d.kind === 'visualize-result' && <VisualizeResult id={d.resultId} close={close} />}
        {d.kind === 'visualize-comparison' && <VisualizeComparison close={close} />}
        {d.kind === 'confirm-block' && <ConfirmBlock rids={d.rids} close={close} />}
        {d.kind === 'export-model' && <ExportModel close={close} />}
      </div>
    </div>
  );
}

function Head({ title, close }: { title: string; close: () => void }) {
  return <div className="modal-head"><span>{title}</span><button className="icon-btn" onClick={close}><Icon name="x" size={14} /></button></div>;
}

function mapCoverage(ids: string[]) {
  const doc = useStore.getState().doc;
  const set = new Set(ids);
  return Object.values(doc.reactions).filter((g) => g.reactionId && set.has(g.reactionId)).length;
}

function VisualizeResult({ id, close }: { id: string; close: () => void }) {
  const r = L.result(id);
  const covered = r ? mapCoverage(Object.keys(r.reactionFluxes ?? r.fva ?? {})) : 0;
  const [c, setC] = useState<ResultMappingChoice>({ width: true, color: 'magnitude', turnoverRadius: false, fvaRange: true });
  if (!r) return null;
  // only the data travel: the map is never changed (draw specific reactions with “Add to map”)
  const go = () => { sendResultToMap(r, c); close(); };
  return (
    <>
      <Head title="Visualize result in the Map Builder" close={close} />
      <div className="modal-body" style={{ width: 520 }}>
        <div><b>Dataset:</b> {r.name} <span className="muted small">· {r.metadata.methodLabel} · state {r.metadata.state.name}</span></div>
        <div className="muted small">{covered ? `${covered} reactions of this result are already drawn on the map.` : 'No reaction of this result is on the map yet.'} Only the data are sent — no reaction is drawn. Model ids are preserved, so the arrows already on the map bind by themselves; to draw a specific reaction use <b>Add to map</b> (Explorer, Inspector or right-click).</div>
        <div className="insp-sub">Suggested mappings</div>
        {r.reactionFluxes ? (
          <div className="map-sugg">
            <label className="check"><input type="checkbox" checked={c.width} onChange={(e) => setC({ ...c, width: e.target.checked })} /> Reaction |flux| <span className="arrow">→</span> edge thickness</label>
            <label className="check"><span className="grow">Reaction flux <span className="arrow">→</span> edge colour</span>
              <select className="input tiny" value={c.color} onChange={(e) => setC({ ...c, color: e.target.value as ResultMappingChoice['color'] })}>
                <option value="magnitude">|flux| (sequential)</option><option value="signed">signed flux (diverging)</option><option value="none">none</option>
              </select></label>
            <label className="check muted"><input type="checkbox" checked disabled /> Flux direction <span className="arrow">→</span> arrow direction (always: arrows follow the sign of the flux)</label>
            {r.metaboliteTurnover && <label className="check"><input type="checkbox" checked={c.turnoverRadius} onChange={(e) => setC({ ...c, turnoverRadius: e.target.checked })} /> Metabolite turnover <span className="arrow">→</span> node size</label>}
          </div>
        ) : (
          <div className="note small">FVA intervals are sent as ranges (not as fluxes). On the map, select reactions and add an “FVA / range” plot (right-click → Add linked plot) to show them.</div>
        )}
        <div className="row end gap"><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={go}>Send to Map Builder</button></div>
      </div>
    </>
  );
}

function VisualizeComparison({ close }: { close: () => void }) {
  const cmp = useLab((s) => s.compare.result);
  const a = L.result(cmp?.a.id), b = L.result(cmp?.b.id);
  const [metric, setMetric] = useState<'log2fc' | 'delta'>('log2fc');
  const [width, setWidth] = useState(true);
  if (!cmp || !a || !b) return null;
  const rows = cmp.reactions as CompareRow[];
  const reversals = rows.filter((r) => r.category === 'reversal').length;
  // only the data travel: the map is never changed (draw specific reactions with “Add to map”)
  const go = () => { sendComparisonToMap(cmp, a, b, metric, width); close(); };
  return (
    <>
      <Head title="Visualize comparison" close={close} />
      <div className="modal-body" style={{ width: 520 }}>
        <div><b>{b.name}</b> <span className="muted">vs reference</span> <b>{a.name}</b></div>
        <div className="insp-sub">Suggested mappings</div>
        <div className="map-sugg">
          <label className="check"><span className="grow">Comparison <span className="arrow">→</span> diverging reaction colour</span>
            <select className="input tiny" value={metric} onChange={(e) => setMetric(e.target.value as 'log2fc' | 'delta')}>
              <option value="log2fc">log₂FC |v|</option><option value="delta">Δ flux (B − A)</option>
            </select></label>
          <label className="check"><input type="checkbox" checked={width} onChange={(e) => setWidth(e.target.checked)} /> |flux| in B <span className="arrow">→</span> edge thickness</label>
        </div>
        <div className="muted small">Only the data are sent — no reaction is drawn. To draw specific reactions use <b>Add to map</b>.</div>
        {metric === 'log2fc' && reversals > 0 && <div className="note small">{reversals} direction reversals have no log₂FC and will be drawn neutral. Δ flux shows them (sign change) — or inspect them in the comparison table.</div>}
        <div className="row end gap"><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={go}>Send to Map Builder</button></div>
      </div>
    </>
  );
}

function ConfirmBlock({ rids, close }: { rids: string[]; close: () => void }) {
  const index = useLab((s) => s.index)!;
  const st = useLab((s) => L.activeState(s));
  return (
    <>
      <Head title={`Block ${rids.length} reaction${rids.length > 1 ? 's' : ''}?`} close={close} />
      <div className="modal-body" style={{ width: 480 }}>
        <div>Bounds will be set to <span className="mono">[0, 0]</span> in state <b>{st.name}</b>. This is recorded as one modification and can be undone.</div>
        <div className="block-list">
          {rids.slice(0, 14).map((id) => { const r = index.rxn.get(id)!; return <div key={id} className="kv small"><span className="mono">{id}</span><span className="mono">{fbounds(L.bounds(st, r))} → [0, 0]</span></div>; })}
          {rids.length > 14 && <div className="muted small">…and {rids.length - 14} more</div>}
        </div>
        <div className="row end gap"><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => { lab.blockReactions(rids); close(); }}>Block {rids.length}</button></div>
      </div>
    </>
  );
}

function ExportModel({ close }: { close: () => void }) {
  const st = useLab((s) => L.activeState(s));
  const model = useLab((s) => s.model)!;
  const curated = useLab((s) => s.annotation?.curation.accepted ?? 0);
  const formulas = useLab((s) => s.annotation?.curation.formulas ?? 0);
  const editCount = useLab((s) => (s.model as { edits?: { count: number } } | null)?.edits?.count ?? 0);
  const [busy, setBusy] = useState(false);
  const run = async (f: 'sbml' | 'json' | 'mat') => { setBusy(true); await exportModelFile(f); setBusy(false); close(); };
  return (
    <>
      <Head title="Save as model" close={close} />
      <div className="modal-body" style={{ width: 460 }}>
        <div>Writes a <b>new</b> model file from <span className="mono">{model.filename}</span> with state <b>{st.name}</b> applied ({Object.keys(st.bounds).length} bound changes{st.objective ? ', objective changed' : ''}). The imported file is never modified.</div>
        {editCount > 0 && <div className="note small">Includes the <b>{editCount}</b> structural edit{editCount > 1 ? 's' : ''} (reactions / metabolites added, changed or removed), listed in the model notes.</div>}
        {curated > 0 && <div className="note small">Includes the metabolite curation: <b>{curated}</b> metabolites with MetaNetX cross-references added{formulas ? <>, <b>{formulas}</b> formulas filled</> : null}. SBML writes them as MIRIAM annotations.</div>}
        <div className="row gap">
          <button className="btn" disabled={busy} onClick={() => run('sbml')}>SBML (.xml)</button>
          <button className="btn" disabled={busy} onClick={() => run('json')}>COBRA JSON</button>
          <button className="btn" disabled={busy} onClick={() => run('mat')}>MATLAB (.mat)</button>
        </div>
        {busy && <div className="muted small"><span className="spinner sm" /> COBRApy is writing the file…</div>}
      </div>
    </>
  );
}
