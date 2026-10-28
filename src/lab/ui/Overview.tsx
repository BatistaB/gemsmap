import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui/icons';
import { api } from '../api';
import { objectiveText } from '../format';
import { L, lab, useLab } from '../store';
import type { ModelWarning } from '../types';
import { ErrorCard } from './common';
import { AnnotationCard } from './MetaboliteAnalysis';

export function pickModelFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xml,.sbml,.json,.mat';
  input.onchange = () => { const f = input.files?.[0]; if (f) lab.importFile(f); };
  input.click();
}

export function Overview() {
  const model = useLab((s) => s.model);
  return model ? <ModelDashboard /> : <ImportScreen />;
}

function ImportScreen() {
  const backend = useLab((s) => s.backend);
  const busy = useLab((s) => s.busy);
  const err = useLab((s) => s.importError);
  const [examples, setExamples] = useState<{ name: string; label: string }[]>([]);
  const [over, setOver] = useState(false);
  useEffect(() => { if (backend.status === 'online') api.examples().then(setExamples, () => setExamples([])); }, [backend.status]);
  return (
    <div className="lab-page center-page">
      <div className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = e.dataTransfer.files[0]; if (f) lab.importFile(f); }}>
        <svg width="2.75rem" height="2.75rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="9" cy="18" r="2.5" /><path d="M8.3 7l7.3 1M16.8 10.3l-6.4 5.6" /></svg>
        <div className="empty-title">Drop a metabolic model here</div>
        <div className="muted">SBML · COBRA JSON · MATLAB .mat</div>
        <button className="btn primary" disabled={backend.status !== 'online' || !!busy} onClick={pickModelFile}><Icon name="import" size={14} /> Import model</button>
        {examples.length > 0 && (
          <div className="examples">
            <span className="muted small">or try an example bundled with COBRApy:</span>
            {examples.map((x) => <button key={x.name} className="link" disabled={!!busy} onClick={() => lab.importExample(x.name)}>{x.label}</button>)}
          </div>
        )}
        {busy && <div className="busy"><span className="spinner" /> {busy}</div>}
      </div>
      {err && <ErrorCard info={err} />}
      <BackendCard />
    </div>
  );
}

export function BackendCard() {
  const backend = useLab((s) => s.backend);
  if (backend.status === 'online') {
    return <div className="muted small center">GEMsMAP {backend.health?.version} · COBRApy {backend.health?.cobraVersion} · solver {backend.health?.defaultSolver} · backend ready</div>;
  }
  if (backend.status === 'checking') return <div className="muted small center"><span className="spinner" /> Connecting to the COBRApy backend…</div>;
  return (
    <div className="error-card">
      <div className="ec-title">COBRApy backend is not running</div>
      <div className="ec-msg">COBRAGUI runs all science in Python (COBRApy). Start GEMsMAP in a terminal, keep that window open, then retry:</div>
      <pre className="cmd">gemsmap</pre>
      <div className="muted small">Development checkout: <span className="mono">npm run backend</span> (the first time, <span className="mono">npm run backend:setup</span> creates <span className="mono">backend/.venv</span> and installs COBRApy, FastAPI and uvicorn).</div>
      <div><button className="btn small" onClick={() => lab.checkBackend()}>Retry connection</button></div>
    </div>
  );
}

function ModelDashboard() {
  const model = useLab((s) => s.model)!;
  const st = useLab((s) => L.activeState(s));
  const flux = useLab((s) => L.fluxResult(s));
  const results = useLab((s) => s.results.length);
  const sm = model.summary;
  const modified = Object.keys(st.bounds).length > 0 || !!st.objective;
  const active = flux?.reactionFluxes ? Object.values(flux.reactionFluxes).filter((v) => !L.isZero(v)).length : null;
  const errors = model.warnings.filter((w) => w.level === 'error').length;
  return (
    <div className="lab-page overview">
      <div className="ov-card">
        <div className="ov-main">
          <div className="insp-kind">Model</div>
          <div className="ov-title">{model.name}</div>
          <div className="mono small muted">{model.filename} · {model.format.toUpperCase()} · sha256 {model.checksum.slice(0, 12)}</div>
          <div className="ov-stats">
            <div><b>{sm.reactions.toLocaleString()}</b><span>reactions</span></div>
            <div><b>{sm.metabolites.toLocaleString()}</b><span>metabolites</span></div>
            <div><b>{sm.genes.toLocaleString()}</b><span>genes</span></div>
            <div><b>{sm.compartments}</b><span>compartments</span></div>
          </div>
        </div>
        <div className="ov-side">
          <div className="kv"><span>Objective</span><span className="mono">{objectiveText(L.objective(st))}</span></div>
          <div className="kv"><span>Solver</span><span>{sm.solver}</span></div>
          <div className="kv"><span>State</span><span>{st.name}</span></div>
          <div className="kv"><span>Status</span><span>{modified ? <span className="modified-dot">● Modified</span> : <span className="ok">Ready</span>}</span></div>
        </div>
      </div>
      <div className="quick-actions">
        <button className="qa" onClick={() => lab.setSection('explore')}><Icon name="search" size={16} /><b>Explore model</b><span>Search and browse metabolites, reactions, genes</span></button>
        <button className="qa" onClick={() => lab.setSection('medium')}><Icon name="particles" size={16} /><b>Configure medium</b><span>{sm.mediumSize} compounds available in the file</span></button>
        <button className="qa" onClick={() => { lab.setSection('simulate'); useLab.setState({ objectiveEditorOpen: true }); }}><Icon name="sparkle" size={16} /><b>Change objective</b><span className="mono">{Object.keys(L.objective(st).coefficients).join(', ') || 'none'}</span></button>
        <button className="qa primary" onClick={() => lab.setSection('simulate')}><Icon name="play" size={16} /><b>Run simulation</b><span>FBA · pFBA · loopless · FVA</span></button>
      </div>
      <div className="ov-grid">
        <div className="ov-panel">
          <div className="insp-sub">Import & validation</div>
          <div className="ok small">Model imported successfully {errors ? <span className="warn-text">· {errors} issue{errors > 1 ? 's' : ''} to review</span> : ''}</div>
          {model.warnings.length === 0 && <div className="muted small">No validation notes.</div>}
          {model.warnings.map((w) => <WarningRow key={w.code} w={w} />)}
          {model.validation.loader?.length > 0 && (
            <details className="small"><summary className="muted">COBRApy reader messages · {model.validation.loader.length}</summary><pre className="log-pre">{model.validation.loader.join('\n')}</pre></details>
          )}
        </div>
        <div className="ov-panel">
          <div className="insp-sub">Model statistics</div>
          <div className="stat-table">
            <Stat k="Exchange reactions" v={sm.exchange} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: false, rxnFilters: { types: ['exchange'] }, metFilters: {}, sort: null })} />
            {sm.demand > 0 && <Stat k="Demand reactions" v={sm.demand} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: false, rxnFilters: { types: ['demand'] }, metFilters: {}, sort: null })} />}
            {sm.sink > 0 && <Stat k="Sink reactions" v={sm.sink} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: false, rxnFilters: { types: ['sink'] }, metFilters: {}, sort: null })} />}
            <Stat k="Transport reactions" v={sm.transport} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: false, rxnFilters: { types: ['transport'] }, metFilters: {}, sort: null })} />
            <Stat k="Internal reactions" v={sm.internal} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: false, rxnFilters: { types: ['internal'] }, metFilters: {}, sort: null })} />
            <Stat k="Reversible" v={sm.reversible} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: false, rxnFilters: { reversibility: 'reversible' }, metFilters: {}, sort: null })} />
            <Stat k="Irreversible" v={sm.irreversible} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: false, rxnFilters: { reversibility: 'irreversible' }, metFilters: {}, sort: null })} />
            {sm.blockedByBounds > 0 && <Stat k="Blocked by bounds" v={sm.blockedByBounds} />}
            {sm.subsystems > 0 && <Stat k="Subsystems" v={sm.subsystems} />}
            {active != null && <>
              <div className="stat-sep">Active result · {flux!.name}</div>
              <Stat k="Active reactions" v={active} onClick={() => lab.applyView({ id: '', name: '', tab: 'reactions', query: '', hideZero: true, rxnFilters: {}, metFilters: {}, sort: { key: 'absFlux', dir: 'desc' } })} />
              <Stat k="Zero-flux reactions" v={Object.keys(flux!.reactionFluxes!).length - active} />
            </>}
          </div>
          {results === 0 && <div className="note small">No simulation yet. Configure a medium and objective, then run FBA or pFBA.</div>}
        </div>
        <AnnotationCard />
      </div>
    </div>
  );
}

function Stat({ k, v, onClick }: { k: string; v: number; onClick?: () => void }) {
  return onClick
    ? <button className="stat-row" onClick={onClick}><span>{k}</span><b className="mono">{v.toLocaleString()}</b></button>
    : <div className="stat-row"><span>{k}</span><b className="mono">{v.toLocaleString()}</b></div>;
}

function WarningRow({ w }: { w: ModelWarning }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMet = ['disconnected-metabolite', 'dead-end', 'no-formula'].includes(w.code);
  return (
    <div className={`warn-row l-${w.level}`} ref={ref}>
      <button className="warn-head" onClick={() => setOpen(!open)}>
        <i className={`lvl l-${w.level}`} /><b className="mono">{w.count.toLocaleString()}</b><span className="grow">{w.title}</span><span className="muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="warn-body">
          {w.detail && <pre className="log-pre">{w.detail}</pre>}
          {w.ids.length > 0 && (
            <>
              <div className="warn-ids">{w.ids.slice(0, 40).map((id) => <button key={id} className="chip" onClick={() => lab.navigate({ kind: isMet ? 'metabolite' : 'reaction', id })}>{id}</button>)}{w.ids.length > 40 && <span className="muted small">+{w.ids.length - 40} more</span>}</div>
              <button className="btn small" onClick={() => lab.showInExplorer(isMet ? 'metabolites' : 'reactions', w.ids, `${w.title.split(' ').slice(0, 3).join(' ')} (${w.count})`)}>Show all in explorer</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
