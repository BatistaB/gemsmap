import { useState } from 'react';
import { Icon } from '../../ui/icons';
import { api, ApiError, saveBlob } from '../api';
import { fnum, METHOD_INFO, timeLabel } from '../format';
import { BUILTIN_VIEWS, L, lab, useLab, type LogEntry } from '../store';
import type { LabSection, Method } from '../types';
import { MetaboliteAnalysis } from './MetaboliteAnalysis';
import { Compare } from './Compare';
import { Popover } from './common';
import { Explorer } from './Explorer';
import { LabInspector } from './Inspector';
import { LabContextMenu } from './LabContextMenu';
import { LabDialogs } from './LabDialogs';
import { EditsMenu } from './edit/EditsMenu';
import { MediumEditor } from './Medium';
import { Overview } from './Overview';
import { Results } from './Results';
import { Simulate } from './Simulate';
import { ResizeHandle, usePanelWidth } from '../../ui/Resizer';

const SECTIONS: { id: LabSection; label: string; icon: string; key?: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'file' },
  { id: 'explore', label: 'Explore', icon: 'search' },
  { id: 'medium', label: 'Medium', icon: 'particles' },
  { id: 'simulate', label: 'Simulation', icon: 'play' },
  { id: 'results', label: 'Results', icon: 'plot' },
  { id: 'compare', label: 'Compare', icon: 'swap' },
  { id: 'annotation', label: 'Metabolite analysis', icon: 'sparkle' },
];

export function CobraGui() {
  const model = useLab((s) => s.model);
  const section = useLab((s) => s.section);
  const busy = useLab((s) => s.busy);
  if (!model) {
    return (
      <div className="lab">
        <div className="lab-main"><Overview /></div>
        {busy && model === null && null}
      </div>
    );
  }
  return (
    <div className="lab">
      <LabSidebar />
      <main className="lab-main">
        {section === 'overview' && <Overview />}
        {section === 'explore' && <Explorer />}
        {section === 'medium' && <MediumEditor />}
        {section === 'simulate' && <Simulate />}
        {section === 'results' && <Results />}
        {section === 'compare' && <Compare />}
        {section === 'annotation' && <MetaboliteAnalysis />}
      </main>
      <LabInspector />
      <LabContextMenu />
      <LabDialogs />
    </div>
  );
}

function LabSidebar() {
  const pw = usePanelWidth('lab-side', 188, 52, 420);
  const section = useLab((s) => s.section);
  const results = useLab((s) => s.results);
  const favorites = useLab((s) => s.favorites);
  const savedViews = useLab((s) => s.savedViews);
  const index = useLab((s) => s.index)!;
  const running = useLab((s) => s.running);
  return (
    <nav className={`lab-side ${pw.width < 110 ? 'compact' : ''}`} style={{ width: pw.width }}>
      <ResizeHandle panel={pw} edge="right" />
      <div className="pane-scroll ls-scroll">
      <div className="ls-group">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`ls-item ${section === s.id ? 'on' : ''}`} onClick={() => lab.setSection(s.id)}>
            <Icon name={s.icon} size={15} /><span>{s.label}</span>
            {s.id === 'results' && results.length > 0 && <span className="ls-count">{results.length}</span>}
            {s.id === 'simulate' && running && <span className="spinner sm" />}
          </button>
        ))}
      </div>
      <div className="ls-group">
        <div className="ls-title">Favorites</div>
        {!favorites.length && <div className="ls-hint">Star entities (☆ in the inspector) to pin them here.</div>}
        {favorites.map((k) => {
          const i = k.indexOf(':');
          const kind = k.slice(0, i) as 'reaction' | 'metabolite' | 'gene' | 'subsystem', id = k.slice(i + 1);
          return (
            <button key={k} className="ls-fav" title={kind === 'metabolite' ? index.met.get(id)?.name : index.rxn.get(id)?.name} onClick={() => lab.navigate({ kind, id })}>
              <span className={`kind k-${kind}`}>{kind[0].toUpperCase()}</span><span className="ellipsis mono">{id}</span>
            </button>
          );
        })}
      </div>
      <div className="ls-group">
        <div className="ls-title">Views</div>
        {[...BUILTIN_VIEWS.slice(0, 3), ...savedViews].map((v) => (
          <button key={v.id} className="ls-view" onClick={() => lab.applyView(v)}><span className="ellipsis">{v.name}</span></button>
        ))}
      </div>
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------ header (inside the shared top bar)

/** COBRAGUI has its own logo (docs/brand/cobragui-logo.png), at the left of its header row. */
function CobraGuiLogo() {
  return <img className="cobragui-logo" src={`${import.meta.env.BASE_URL}brand/cobragui-logo.png`} alt="COBRAGUI" title="COBRAGUI — a graphical user interface for COBRApy: explore, edit and simulate the GEM" draggable={false} />;
}

export function LabHeader() {
  const model = useLab((s) => s.model);
  const running = useLab((s) => s.running);
  const method = useLab((s) => s.method);
  if (!model) return <CobraGuiLogo />;
  return (
    <>
      <CobraGuiLogo />
      <div className="lab-header">
        <span className="lh-model" title={`${model.filename} · sha256 ${model.checksum.slice(0, 12)}`}><span className="muted">Model</span> <b>{model.name}</b></span>
        <StateSwitcher />
        <ModifiedIndicator />
        <EditsMenu />
        <div className="run-split">
          <button className="btn primary small" disabled={!!running} onClick={() => lab.simulate(method)} title="Run with the active state">
            {running ? <><span className="spinner sm light" /> {METHOD_INFO[running.method].short}…</> : <>Run {METHOD_INFO[method].short} <Icon name="play" size={11} /></>}
          </button>
          {running ? (
            <button className="btn small split stop-btn" onClick={() => lab.cancelRun()} disabled={!!running.stopping} title={`Stop ${METHOD_INFO[running.method].label} (nothing is saved)`}>
              <Icon name="stop" size={10} />
            </button>
          ) : <Popover align="right" trigger={(o, t) => <button className={`btn primary small split ${o ? 'on' : ''}`} onClick={t}>▾</button>}>
            {(close) => (
              <div className="menu-list">
                {(['fba', 'pfba', 'loopless', 'fva'] as Method[]).map((m) => (
                  <button key={m} className={m === method ? 'on' : ''} onClick={() => { useLab.setState({ method: m }); lab.simulate(m); close(); }}>
                    <span>Run {METHOD_INFO[m].label}</span><span className="muted small">{METHOD_INFO[m].blurb}</span>
                  </button>
                ))}
                <div className="dd-sep" />
                <button onClick={() => { lab.setSection('simulate'); close(); }}>Simulation options…</button>
              </div>
            )}
          </Popover>}
        </div>
      </div>
    </>
  );
}

function StateSwitcher() {
  const states = useLab((s) => s.states);
  const active = useLab((s) => L.activeState(s));
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <Popover trigger={(o, t) => (
      <button className={`state-btn ${o ? 'on' : ''}`} onClick={t} title="Model state (scenario)"><span className="muted">State</span> <b>{active.name}</b> ▾</button>
    )}>
      {(close) => (
        <div className="menu-list state-menu">
          <div className="menu-label">Model states</div>
          {states.map((s) => (
            <div key={s.id} className={`menu-row ${s.id === active.id ? 'on' : ''}`}>
              {renaming === s.id
                ? <input className="input tiny" autoFocus defaultValue={s.name} onBlur={(e) => { lab.renameState(s.id, e.target.value); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} />
                : <button onClick={() => { lab.setActiveState(s.id); close(); }}>
                  <span>{s.id === active.id ? '● ' : ''}{s.name}</span>
                  <span className="muted small">{Object.keys(s.bounds).length} bounds{s.objective ? ' · objective' : ''}</span>
                </button>}
              <button className="icon-btn tiny" title="Rename" onClick={() => setRenaming(s.id)}><Icon name="text" size={11} /></button>
              <button className="icon-btn tiny" title="Duplicate" onClick={() => lab.duplicateState(s.id)}><Icon name="plus" size={11} /></button>
              {states.length > 1 && <button className="icon-btn tiny" title="Delete state" onClick={() => lab.deleteState(s.id)}><Icon name="trash" size={11} /></button>}
            </div>
          ))}
          <div className="dd-sep" />
          <button onClick={() => { const id = lab.duplicateState(); if (id) setRenaming(id); }}>Duplicate “{active.name}”…</button>
          <button onClick={() => { lab.newState(); close(); }}>New state from the model file</button>
          <button onClick={() => { lab.setSection('compare'); close(); }}>Compare states…</button>
        </div>
      )}
    </Popover>
  );
}

function ModifiedIndicator() {
  const st = useLab((s) => L.activeState(s));
  const model = useLab((s) => s.model)!;
  const n = Object.keys(st.bounds).length + (st.objective ? 1 : 0);
  const exportMods = () => {
    const blob = new Blob([JSON.stringify({ format: 'cobragui-modifications', version: 1, model: { filename: model.filename, checksum: model.checksum }, state: st.name, bounds: st.bounds, objective: st.objective, changes: st.changes }, null, 1)], { type: 'application/json' });
    saveBlob(blob, `${st.name.replace(/\W+/g, '_')}_modifications.json`);
  };
  return (
    <Popover align="right" className="changes-pop" trigger={(o, t) => (
      <button className={`mod-btn ${n ? 'mod' : ''} ${o ? 'on' : ''}`} onClick={t} title="Model modifications in this state">
        {n ? <><span className="modified-dot">●</span> Modified · {n}</> : <span className="muted">Unmodified</span>}
      </button>
    )}>
      {() => (
        <div className="changes">
          <div className="row between"><b>Model modifications · {st.name}</b><span className="muted small">{st.changes.length} recorded</span></div>
          <div className="muted small">{Object.keys(st.bounds).length} reactions with modified bounds{st.objective ? ' · objective changed' : ''}. The imported file is never modified.</div>
          <div className="change-list">
            {!st.changes.length && <div className="muted small">No changes yet.</div>}
            {[...st.changes].reverse().slice(0, 80).map((c) => (
              <div key={c.id} className="change">
                <div className="row between"><button className="link mono" onClick={() => c.target !== 'Objective' && c.target !== 'Model' && lab.navigate({ kind: 'reaction', id: c.target })}>{c.target}</button><span className="muted small">{timeLabel(c.time)}</span></div>
                <div className="mono small">{c.before} → {c.after}</div>
                {c.note && <div className="muted small">{c.note}</div>}
              </div>
            ))}
          </div>
          <div className="row gap wrap">
            <button className="btn small" disabled={!st.undo.length} onClick={lab.undo}><Icon name="undo" size={12} /> Undo</button>
            <button className="btn small" disabled={!st.redo.length} onClick={lab.redo}><Icon name="redo" size={12} /> Redo</button>
            <button className="btn small warn" disabled={!n} onClick={() => { if (window.confirm(`Revert all ${n} modifications of “${st.name}” to the model file?`)) lab.resetState(); }}>Revert</button>
            <button className="btn small" disabled={!st.changes.length} onClick={exportMods}>Export modifications</button>
            <button className="btn small" onClick={() => useLab.setState({ dialog: { kind: 'export-model' } })}>Save as model…</button>
          </div>
        </div>
      )}
    </Popover>
  );
}

// ------------------------------------------------------------------ status bar

export function LabStatusBar() {
  const backend = useLab((s) => s.backend);
  const model = useLab((s) => s.model);
  const flux = useLab((s) => L.fluxResult(s));
  const fva = useLab((s) => L.fvaResult(s));
  const running = useLab((s) => s.running);
  const logOpen = useLab((s) => s.logOpen);
  const settings = useLab((s) => s.settings);
  const busy = useLab((s) => s.busy);
  return (
    <footer className="bottombar lab-status">
      <span className={`be-dot ${backend.status}`} title={backend.status === 'online' ? `COBRApy ${backend.health?.cobraVersion} · solvers ${backend.health?.solvers.join(', ')}` : 'Backend offline — start GEMs MAP with the gemsmap command'} />
      <span className="small">{backend.status === 'online' ? `COBRApy ${backend.health?.cobraVersion} · ${backend.health?.defaultSolver}` : backend.status === 'checking' ? 'Connecting…' : <button className="link" onClick={() => lab.checkBackend()}>Backend offline — retry</button>}</span>
      {busy && <span className="small"><span className="spinner sm" /> {busy}</span>}
      {running && <span className="small"><span className="spinner sm" /> {running.stopping ? 'Stopping' : 'Running'} {METHOD_INFO[running.method].label}…{running.progress ? ` ${running.progress.done}/${running.progress.total}` : ''}
        {!running.stopping && <button className="link small" onClick={() => lab.cancelRun()}>Stop</button>}</span>}
      {model && <>
        <span className="sb-sep" />
        <span className="small muted">Flux:</span>{flux ? <button className="link small" onClick={() => lab.setSection('results')}>{flux.name} · obj {fnum(flux.objectiveValue)}</button> : <span className="small muted">—</span>}
        {fva && <><span className="small muted">FVA:</span><button className="link small" onClick={() => lab.setSection('results')}>{fva.name}</button></>}
      </>}
      <span className="grow" />
      <Popover align="right" trigger={(o, t) => <button className={`link small ${o ? 'on' : ''}`} onClick={t}>Zero threshold |v| &lt; {settings.zeroTolerance}</button>}>
        {() => (
          <div className="filters settings-pop">
            <div className="f-title">Numerical zero</div>
            <label className="field"><span>|flux| &lt;</span><input className="input tiny" type="number" step="any" min={0} value={settings.zeroTolerance} onChange={(e) => lab.setSettings({ zeroTolerance: Math.max(0, +e.target.value || 0) })} /></label>
            <div className="muted small">Values below the threshold count as zero for “hide zero”, active-reaction counts and comparison categories. The solver's own tolerance is reported in each result.</div>
            <div className="row gap">{[1e-12, 1e-9, 1e-6].map((v) => <button key={v} className="btn small" onClick={() => lab.setSettings({ zeroTolerance: v })}>{v}</button>)}</div>
          </div>
        )}
      </Popover>
      <button className={`link small ${logOpen ? 'on' : ''}`} onClick={() => useLab.setState({ logOpen: !logOpen })}>Activity log</button>
      {backend.health && <AboutPopover />}
      {logOpen && <LogPanel />}
    </footer>
  );
}

/** Version and the environment, in one block to paste into a bug report (no model or file names: they may be private). */
export function diagnosticsText(): string {
  const h = useLab.getState().backend.health;
  return [
    `GEMs MAP ${h?.version ?? 'unknown'}`,
    `Python ${h?.python ?? '?'} on ${h?.platform ?? '?'}`,
    `COBRApy ${h?.cobraVersion ?? '?'}, solvers: ${h?.solvers.join(', ') ?? '?'} (default ${h?.defaultSolver ?? '?'})`,
    `Browser: ${navigator.userAgent}`,
    `Address: ${location.origin}`,
  ].join('\n');
}

function AboutPopover() {
  const version = useLab((s) => s.backend.health?.version);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(diagnosticsText()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  };
  return (
    <Popover align="right" trigger={(o, t) => <button className={`link small ${o ? 'on' : ''}`} onClick={t} title="Version and diagnostics">GEMs MAP {version}</button>}>
      {() => (
        <div className="filters settings-pop">
          <div className="f-title">GEMs MAP {version}</div>
          <div className="muted small">To report a problem, paste this block into your report. It lists versions only, no model or file names.</div>
          <textarea className="input mono small" readOnly rows={5} value={diagnosticsText()} onFocus={(e) => e.currentTarget.select()} />
          <div className="row gap"><button className="btn small" onClick={copy}>{copied ? 'Copied' : 'Copy diagnostics'}</button></div>
        </div>
      )}
    </Popover>
  );
}

function LogPanel() {
  const log = useLab((s) => s.log);
  const icon = (l: LogEntry['level']) => (l === 'error' ? '✕' : l === 'warn' ? '!' : '·');
  return (
    <div className="log-panel">
      <div className="row between"><b>Activity log</b><button className="icon-btn tiny" onClick={() => useLab.setState({ logOpen: false })}><Icon name="x" size={11} /></button></div>
      <div className="log-list">
        {!log.length && <div className="muted small">Nothing yet.</div>}
        {[...log].reverse().map((e, i) => <div key={i} className={`log-line l-${e.level}`}><span className="mono muted">{new Date(e.time).toLocaleTimeString()}</span><span className="log-ico">{icon(e.level)}</span><span>{e.text}</span></div>)}
      </div>
    </div>
  );
}

export async function exportModelFile(format: 'sbml' | 'json' | 'mat') {
  const s = useLab.getState();
  if (!s.model) return;
  const st = L.activeState(s);
  try {
    const { blob, filename } = await api.exportModel(s.model.id, L.stateSpec(st), format);
    saveBlob(blob, filename);
    lab.log('info', `Model exported with state “${st.name}”: ${filename}`);
  } catch (e) {
    lab.log('error', `Model export failed: ${e instanceof ApiError ? e.info.message : String(e)}`);
  }
}
