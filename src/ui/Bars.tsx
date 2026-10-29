import { useEffect, useRef, useState } from 'react';
import { saveProjectFile } from '../export/export';
import { A, useStore, type Tool } from '../store/store';
import type { CompareMode } from '../viz/types';
import { BrandMark } from './BrandMark';
import { Icon } from './icons';
import { WorkspaceLogo } from './WorkspaceLogo';
import { openFile } from './files';
import { useLab } from '../lab/store';
import { LabHeader } from '../lab/ui/CobraGui';
import { WorkspaceSwitcher } from '../lab/ui/MapLink';
import { pickModelFile } from '../lab/ui/Overview';
import { openTemplate } from '../templates/design/session';
import { emptyTemplate } from '../templates/format/schema';
import { exportOpenTemplate, pickTemplateFile, saveDesign } from './templates/templateFiles';
import { setUiScale, stepUiScale, UI_SCALES, uiScaleLabel, useUi } from './uiScale';

/** File menu row: the interface size steps without closing the menu, so the effect is seen at once. */
function InterfaceSize() {
  const scale = useUi((s) => s.scale);
  return (
    <div className="dd-row" title="Size of panels, menus and text (Ctrl Alt + / Ctrl Alt − / Ctrl Alt 0). The map and its exports do not change.">
      <span>Interface size</span>
      <span className="dd-steps">
        <button aria-label="Smaller interface" onClick={() => stepUiScale(-1)} disabled={scale <= UI_SCALES[0]}>−</button>
        <button className="dd-val" title="Back to 100 %" onClick={() => setUiScale(1)}>{uiScaleLabel(scale)}</button>
        <button aria-label="Larger interface" onClick={() => stepUiScale(1)} disabled={scale >= UI_SCALES[UI_SCALES.length - 1]}>+</button>
      </span>
    </div>
  );
}

function IconBtn({ icon, title, onClick, on, disabled }: { icon: string; title: string; onClick: () => void; on?: boolean; disabled?: boolean }) {
  return <button className={`icon-btn ${on ? 'on' : ''}`} title={title} onClick={onClick} disabled={disabled}><Icon name={icon} size={16} /></button>;
}

export function TopBar() {
  const name = useStore((s) => s.name);
  const tool = useStore((s) => s.tool);
  const canvas = useStore((s) => s.canvas);
  const k = useStore((s) => s.camera.k);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const labMode = useLab((s) => s.workspace === 'lab');
  const tplMode = useLab((s) => s.workspace === 'templates');
  const designing = useStore((s) => !!s.design);
  const a = A();
  useEffect(() => {
    if (!menu) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [menu]);
  const tools: [Tool, string, string][] = [['select', 'select', 'Select (V)'], ['pan', 'pan', 'Pan (C) — or hold Space and drag, or drag with the right mouse button'], ['metabolite', 'metabolite', 'Metabolite (M)'], ['slot', 'slot', 'Empty slot (S)'], ['reaction', 'reaction', 'Reaction (R)'], ['text', 'text', 'Text (T)']].filter(([t]) => !designing || t !== 'slot') as [Tool, string, string][];
  const item = (label: string, run: () => void, hint?: string) => <button onClick={() => { setMenu(false); run(); }}><span>{label}</span>{hint && <kbd>{hint}</kbd>}</button>;
  return (
    <header className="topbar">
      <div className="tb-row">
      <div className="tb-left">
        <div className="logo" role="img" aria-label="GEMsMAP" title="GEMsMAP — visualization and constraint-based analysis of genome-scale metabolic models"><BrandMark width={30} /></div>
        <WorkspaceSwitcher />
        <div className="menu-wrap" ref={ref}>
          <button className="menu-btn" onClick={() => setMenu(!menu)}>File</button>
          {menu && tplMode && (
            <div className="dropdown">
              {item('New template', () => openTemplate(emptyTemplate('New template'), 'new'))}
              {item('Import template (.gemsmap-template.json)…', pickTemplateFile, 'Ctrl O')}
              {designing && item('Save template', () => { saveDesign(); }, 'Ctrl S')}
              {designing && item('Export template…', exportOpenTemplate, 'Ctrl E')}
              {designing && item('Export figure of the template…', () => useStore.setState({ dialog: { kind: 'export' } }))}
              <div className="dd-sep" />
              {item('Go to the Map Builder', () => useLab.setState({ workspace: 'map' }))}
              <InterfaceSize />
              {item('Keyboard shortcuts', () => useStore.setState({ dialog: { kind: 'help' } }), '?')}
            </div>
          )}
          {menu && !tplMode && (
            <div className="dropdown">
              {item('New project', () => a.newProject())}
              {item('Open example (central carbon metabolism)', () => import('../demo/demo').then((m) => a.loadProject(m.demoProject())))}
              {item('Open project…', () => openFile('project'), 'Ctrl O')}
              {item('Save project (.gemsmap)', () => saveProjectFile(), 'Ctrl S')}
              <div className="dd-sep" />
              {item('Import GEM into COBRAGUI (COBRApy: SBML / JSON / MAT)…', () => { useLab.setState({ workspace: 'lab' }); pickModelFile(); })}
              {item('Import GEM into the map only (JSON / SBML)…', () => openFile('model'))}
              {item('Import fluxes / data…', () => openFile('data'))}
              <div className="dd-sep" />
              {item('Export figure…', () => useStore.setState({ dialog: { kind: 'export' } }), 'Ctrl E')}
              {item('Download model as COBRA JSON', () => import('../model/importers').then(async (m) => { const s = useStore.getState(); if (!s.model) return a.toast('No model loaded'); (await import('../export/export')).download(`${s.model.id}.json`, m.toCobraJson(s.model), 'application/json'); }))}
              <div className="dd-sep" />
              <InterfaceSize />
              {item('Keyboard shortcuts', () => useStore.setState({ dialog: { kind: 'help' } }), '?')}
            </div>
          )}
        </div>
        {!labMode && !tplMode && <input className="doc-name" value={name} onChange={(e) => useStore.setState({ name: e.target.value })} spellCheck={false} />}
      </div>
      <div className="tb-right">
        {!tplMode && <button className="search-btn" onClick={() => useStore.setState({ paletteOpen: true })}><Icon name="search" size={14} /><span>{labMode ? 'Search model or run a command' : 'Search or run a command'}</span><kbd>Ctrl K</kbd></button>}
        {!labMode && !tplMode && <button className="btn primary" onClick={() => useStore.setState({ dialog: { kind: 'export' } })}><Icon name="export" size={14} /> Export</button>}
      </div>
      </div>
      {labMode ? <div className="tb-center lab"><LabHeader /></div> : tplMode && !designing ? <div className="tb-center tb-brand"><WorkspaceLogo workspace="templates" /></div> : <div className="tb-center tb-tools">
        <WorkspaceLogo workspace={tplMode ? 'templates' : 'map'} />
        <div className="tb-tools-group">
          <IconBtn icon="panelL" title="Toggle left panel" on={leftOpen} onClick={() => useStore.setState({ leftOpen: !leftOpen })} />
          <span className="tb-sep" />
          {tools.map(([t, icon, title]) => <IconBtn key={t} icon={icon} title={title} on={tool === t} onClick={() => useStore.setState({ tool: t })} />)}
          <span className="tb-sep" />
          <IconBtn icon="undo" title="Undo (Ctrl Z)" onClick={a.undo} disabled={!canUndo} />
          <IconBtn icon="redo" title="Redo (Ctrl Shift Z)" onClick={a.redo} disabled={!canRedo} />
          <span className="tb-sep" />
          <IconBtn icon="grid" title="Show grid" on={canvas.showGrid} onClick={() => a.setCanvas({ showGrid: !canvas.showGrid })} />
          <IconBtn icon="magnet" title="Snap to grid" on={canvas.snap} onClick={() => a.setCanvas({ snap: !canvas.snap })} />
          <span className="tb-sep" />
          <button className="zoom" title="Zoom (wheel) — click to reset" onClick={() => a.setCamera({ k: 1 })}>{Math.round(k * 100)}%</button>
          <IconBtn icon="fit" title="Fit all (F)" onClick={a.fitAll} />
          <span className="tb-sep" />
          <IconBtn icon="panelR" title="Toggle inspector" on={rightOpen} onClick={() => useStore.setState({ rightOpen: !rightOpen })} />
        </div>
      </div>}
    </header>
  );
}

export function BottomBar() {
  const conditions = useStore((s) => s.conditions);
  const view = useStore((s) => s.view);
  const anim = useStore((s) => s.animation);
  const a = A();
  const dirRef = useRef(1);

  // condition animation loop
  useEffect(() => {
    if (!anim.playing || conditions.length < 2) return;
    const t = setInterval(() => {
      const s = useStore.getState();
      const i = s.conditions.findIndex((c) => c.id === s.view.activeCondition);
      const n = s.conditions.length;
      let j = i + dirRef.current;
      if (j >= n || j < 0) {
        if (s.animation.loop === 'once') { a.setAnimation({ playing: false }); return; }
        if (s.animation.loop === 'pingpong') { dirRef.current *= -1; j = i + dirRef.current; } else j = (j + n) % n;
      }
      a.setView({ activeCondition: s.conditions[j].id });
    }, anim.stepSeconds * 1000);
    return () => clearInterval(t);
  }, [anim.playing, anim.stepSeconds, anim.loop, conditions.length, a]);

  if (!conditions.length) {
    return <footer className="bottombar"><span className="muted small">No conditions yet — import a flux table (Data tab) or open the demo.</span></footer>;
  }
  const idx = conditions.findIndex((c) => c.id === view.activeCondition);
  const timed = conditions.every((c) => typeof c.time === 'number') && conditions.length > 2;
  return (
    <footer className="bottombar">
      <div className="bb-group">
        <span className="bb-label">Condition</span>
        <div className="cond-chips">
          {conditions.map((c) => (
            <button key={c.id} className={`cond-chip ${c.id === view.activeCondition ? 'on' : ''}`} onClick={() => a.setView({ activeCondition: c.id })} style={{ ['--c' as string]: c.color }}>
              <i />{c.name}
            </button>
          ))}
        </div>
      </div>
      {timed && (
        <div className="bb-group timeline">
          <input type="range" min={0} max={conditions.length - 1} value={Math.max(0, idx)} onChange={(e) => a.setView({ activeCondition: conditions[+e.target.value].id })} />
          <span className="mono small">{conditions[idx]?.time}</span>
        </div>
      )}
      <div className="bb-group">
        <IconBtn icon={anim.playing ? 'pause' : 'play'} title="Play through conditions" on={anim.playing} onClick={() => a.setAnimation({ playing: !anim.playing })} />
        <select className="input tiny" value={anim.loop} onChange={(e) => a.setAnimation({ loop: e.target.value as 'loop' })} title="Loop mode">
          <option value="loop">↻ loop</option><option value="pingpong">⇄ ping-pong</option><option value="once">→ once</option>
        </select>
        <select className="input tiny" value={anim.stepSeconds} onChange={(e) => a.setAnimation({ stepSeconds: +e.target.value })} title="Speed">
          {[0.5, 0.8, 1.2, 2, 3].map((s) => <option key={s} value={s}>{s}s / step</option>)}
        </select>
        <IconBtn icon="particles" title="Animated flux particles (presentation mode, not exported)" on={anim.particles} onClick={() => a.setAnimation({ particles: !anim.particles })} />
      </div>
      <div className="bb-group">
        <span className="bb-label">Compare</span>
        <select className="input tiny" value={view.compare} onChange={(e) => a.setView({ compare: e.target.value as CompareMode })}>
          <option value="absolute">absolute</option>
          <option value="difference">difference (Δ)</option>
          <option value="foldchange">fold change</option>
          <option value="log2fc">log₂ fold change</option>
        </select>
        {view.compare !== 'absolute' && (
          <>
            <span className="muted small">vs</span>
            <select className="input tiny" value={view.reference} onChange={(e) => a.setView({ reference: e.target.value })}>
              {conditions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
      </div>
    </footer>
  );
}
