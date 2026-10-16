import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../data/stats';
import { demoModel } from '../demo/demo';
import { searchModel } from '../model/search';
import { A, useStore, type Tool } from '../store/store';
import { BUILTIN_TEMPLATES, specToMapTemplate, type MapTemplate } from '../templates/templates';
import { compileTemplate } from '../templates/format/compile';
import { libraryItems, useTemplateLibrary } from '../templates/library/registry';
import { lab } from '../lab/store';
import { TemplateCoverageBadge } from './TemplateMapping';
import { PALETTES } from '../viz/palettes';
import type { NodeProperty, ReactionProperty, ScaleType } from '../viz/types';
import { Icon } from './icons';
import { fetchPublic, openFile } from './files';
import { ResizeHandle, usePanelWidth } from './Resizer';
import { useCollapsibleSections } from './Collapsible';
import { rem } from './uiScale';

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'pan', icon: 'pan', label: 'Pan', key: 'C' },
  { id: 'metabolite', icon: 'metabolite', label: 'Metabolite', key: 'M' },
  { id: 'slot', icon: 'slot', label: 'Slot', key: 'S' },
  { id: 'reaction', icon: 'reaction', label: 'Reaction', key: 'R' },
  { id: 'text', icon: 'text', label: 'Text', key: 'T' },
];

export function LeftPanel() {
  const pw = usePanelWidth('map-left', 272, 200, 640);
  const tab = useStore((s) => s.leftTab);
  const open = useStore((s) => s.leftOpen);
  const tabsRef = useRef<HTMLDivElement>(null);
  // click a section title (Pathway templates, Shapes, Model and Data sections) to fold it, like the inspectors
  const folds = useCollapsibleSections('map-left');
  // Hit-test the tabs by pointer position, at capture phase on the window: some browsers (seen in Opera)
  // let an invisible layer swallow most of the tab area, so the button itself never receives the event.
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (e.button !== 0 || !tabsRef.current) return;
      for (const b of Array.from(tabsRef.current.querySelectorAll<HTMLElement>('[data-tab]'))) {
        const r = b.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          useStore.setState({ leftTab: b.dataset.tab as 'elements' | 'model' | 'data' });
          return;
        }
      }
    };
    window.addEventListener('pointerdown', h, true);
    return () => window.removeEventListener('pointerdown', h, true);
  }, [open]);
  if (!open) return null;
  return (
    <aside className="panel left" style={{ width: pw.css }}>
      <ResizeHandle panel={pw} edge="right" />
      <div className="tabs" role="tablist" ref={tabsRef}>
        {(['elements', 'model', 'data'] as const).map((t, i) => (
          <button key={t} type="button" role="tab" data-tab={t} aria-selected={tab === t} className={tab === t ? 'on' : ''} title={`Alt+${i + 1}`}
            onClick={() => useStore.setState({ leftTab: t })}>{t === 'elements' ? 'Elements' : t === 'model' ? 'Model' : 'Data'}</button>
        ))}
      </div>
      <div className="panel-scroll" ref={folds.ref}>
        {tab === 'elements' && <ElementsTab />}
        {tab === 'model' && <ModelTab />}
        {tab === 'data' && <DataTab />}
      </div>
    </aside>
  );
}

function TemplateMini({ t }: { t: MapTemplate }) {
  const xs = t.nodes.map((n) => n.x), ys = t.nodes.map((n) => n.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
  const k = Math.min(52 / w, 36 / h);
  const P = (x: number, y: number) => [(x - x0) * k + 4 + (52 - w * k) / 2, (y - y0) * k + 4 + (36 - h * k) / 2];
  const byKey = new Map(t.nodes.map((n) => [n.key, n]));
  return (
    <svg width={rem(60)} height={rem(44)} viewBox="0 0 60 44" className="tpl-mini">
      {t.reactions.map((r, i) => {
        const a = byKey.get(r.sources[0]), b = byKey.get(r.targets[0]);
        if (!a || !b) return null;
        const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity={0.45} strokeWidth={0.8} />;
      })}
      {t.nodes.map((n) => { const [x, y] = P(n.x, n.y); return <circle key={n.key} cx={x} cy={y} r={1.8} fill="currentColor" />; })}
    </svg>
  );
}

function ElementsTab() {
  const tool = useStore((s) => s.tool);
  const user = useStore((s) => s.userTemplates);
  const model = useStore((s) => s.model);
  const slots = useStore((s) => Object.values(s.doc.nodes).filter((n) => !n.attach && (!n.metaboliteId || !s.model?.metabolites[n.metaboliteId]) && n.template?.status !== 'absent').length);
  const provisional = useStore((s) => Object.values(s.doc.nodes).filter((n) => n.template?.status === 'provisional').length);
  const a = A();
  const libUser = useTemplateLibrary((s) => s.user);
  // pathway templates come from the template library (built-in files + the user's own)
  const pathways = useMemo(() => libraryItems(libUser).map((i) => specToMapTemplate(compileTemplate(i.file))), [libUser]);
  const groups: [string, MapTemplate[]][] = [
    ['Pathway templates', pathways],
    ['Shapes', BUILTIN_TEMPLATES.filter((t) => t.category === 'shape')],
  ];
  return (
    <>
      <div className="section">
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} onClick={() => useStore.setState({ tool: t.id })}>
              <Icon name={t.icon} size={17} /><span>{t.label}</span><kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
      </div>
      {slots > 0 && (
        <div className="section callout">
          <div><b>{slots}</b> unbound slot{slots > 1 ? 's' : ''} on the canvas.</div>
          {model ? <button className="btn primary small" onClick={() => a.autoBindAll()}><Icon name="link" size={13} /> Auto-bind to {model.name}</button>
            : <button className="btn small" onClick={() => openFile('model')}>Load a GEM to bind</button>}
        </div>
      )}
      {provisional > 0 && model && (
        <div className="section callout">
          <div><b>{provisional}</b> provisional template mapping{provisional > 1 ? 's' : ''} (yellow <b>?</b>). Click a node to review its candidates.</div>
          <button className="btn small" onClick={() => a.confirmProvisional()}>Confirm all provisional</button>
        </div>
      )}
      {groups.map(([title, ts]) => (
        <div className="section" key={title}>
          <div className="row between"><div className="section-title">{title}</div>{title === 'Pathway templates' && <button className="link small" onClick={() => lab.setWorkspace('templates')} title="Create, edit, review, import and export templates">Template Builder →</button>}</div>
          <div className="tpl-list">
            {ts.map((t) => (
              <button key={t.id} className="tpl" onClick={() => a.openTemplate(t)} title={t.description}>
                <TemplateMini t={t} />
                <div className="grow">
                  <div className="tpl-name">{t.name}</div>
                  <div className="tpl-desc">{t.spec ? `${t.spec.biology.slots.filter((x) => x.level === 'required').length} core nodes · ${t.spec.compartmentSummary}` : t.description}</div>
                </div>
                {t.spec && model && <TemplateCoverageBadge spec={t.spec} model={model} />}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="section">
        <div className="section-title">My templates</div>
        {!user.length && <div className="muted small">Select part of a map → <Icon name="template" size={12} /> “Save as template”. Templates keep compartment-free hints and re-bind to any GEM.</div>}
        <div className="tpl-list">
          {user.map((t) => (
            <div key={t.id} className="tpl">
              <button className="tpl-hit" onClick={() => a.instantiateTemplate(t)}><TemplateMini t={t} /><div><div className="tpl-name">{t.name}</div><div className="tpl-desc">{t.description}</div></div></button>
              <button className="icon-btn" title="Delete template" onClick={() => a.deleteUserTemplate(t.id)}><Icon name="trash" size={13} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Annotations</div>
        <div className="row wrap gap">
          <button className="btn small" onClick={() => a.addText(center(), { text: 'a', size: 22, weight: 700, kind: 'panel' })}>Panel label</button>
          <button className="btn small" onClick={() => a.addText(center(), { text: 'Figure title', size: 16, weight: 700, kind: 'title' })}>Title</button>
          <button className="btn small" onClick={() => a.addText(center(), { text: 'Pathway', size: 11, weight: 600, italic: true })}>Pathway label</button>
          <button className="btn small" onClick={() => a.groupSelection('compartment', 'Mitochondrion')}>Compartment box</button>
        </div>
      </div>
    </>
  );
}

const center = () => {
  const s = useStore.getState();
  return { x: (s.viewport.w / 2 - s.camera.x) / s.camera.k, y: (s.viewport.h / 3 - s.camera.y) / s.camera.k };
};

function ModelTab() {
  const model = useStore((s) => s.model);
  const validation = useStore((s) => s.validation);
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchModel(model, q, undefined, 40), [model, q]);
  // only the metabolites in the current hits are looked up on the canvas (stable string key)
  const hitMets = hits.filter((h) => h.kind === 'metabolite').map((h) => h.id).join('|');
  const onCanvasKey = useStore((s) => {
    if (!hitMets) return '';
    const want = new Set(hitMets.split('|'));
    const out: string[] = [];
    for (const n of Object.values(s.doc.nodes)) if (n.metaboliteId && want.has(n.metaboliteId)) out.push(`${n.metaboliteId}=${n.id}`);
    return out.join('|');
  });
  const onCanvas = useMemo(() => new Map(onCanvasKey ? onCanvasKey.split('|').map((x) => x.split('=') as [string, string]) : []), [onCanvasKey]);
  const a = A();
  if (!model) {
    return (
      <div className="section">
        <div className="section-title">Genome-scale model</div>
        <p className="small muted">Import a COBRApy / BiGG JSON or an SBML file (fbc supported). Templates and data bind to it automatically.</p>
        <button className="btn primary block" onClick={() => openFile('model')}><Icon name="import" size={14} /> Import GEM (JSON / SBML)</button>
        <button className="btn block" onClick={() => a.importModel(demoModel())}>Use the built-in central carbon model</button>
        <p className="small muted">Tip: <span className="mono">e_coli_core.json</span> from BiGG works out of the box with the “Central carbon” template.</p>
      </div>
    );
  }
  const errors = validation.filter((v) => v.level === 'error').length;
  return (
    <>
      <div className="section">
        <div className="row between"><div className="section-title">{model.name}</div><button className="icon-btn" title="Replace model" onClick={() => openFile('model')}><Icon name="import" size={14} /></button></div>
        <div className="stats">
          <div><b>{Object.keys(model.metabolites).length}</b><span>metabolites</span></div>
          <div><b>{Object.keys(model.reactions).length}</b><span>reactions</span></div>
          <div><b>{Object.keys(model.genes).length}</b><span>genes</span></div>
        </div>
        <button className={`btn small block ${errors ? 'warn' : ''}`} onClick={() => useStore.setState({ dialog: { kind: 'validation' } })}>
          {errors ? `${errors} validation errors` : `Validation: ${validation.length} notes`}
        </button>
      </div>
      <div className="section">
        <div className="search-box"><Icon name="search" size={14} /><input placeholder="Search IDs, names, genes, EC, pathways…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="hits">
          {hits.map((h) => {
            const nid = h.kind === 'metabolite' ? onCanvas.get(h.id) : undefined;
            return (
              <div key={h.kind + h.id} className="hit">
                <span className={`kind k-${h.kind}`}>{h.kind[0].toUpperCase()}</span>
                <div className="hit-main"><div className="mono">{h.id}</div><div className="muted small ellipsis">{h.name}{h.detail ? ` · ${h.detail}` : ''}</div></div>
                <div className="hit-actions">
                  {h.kind === 'metabolite' && !nid && <button className="icon-btn" title="Add to canvas" onClick={() => a.addMetaboliteFromModel(h.id)}><Icon name="plus" size={13} /></button>}
                  {h.kind === 'metabolite' && nid && <button className="icon-btn" title="Focus on canvas" onClick={() => a.focusNode(nid)}><Icon name="fit" size={13} /></button>}
                  {h.kind === 'metabolite' && nid && <button className="icon-btn" title="Expand downstream" onClick={() => a.expandNode(nid, 'down', 1)}><Icon name="expandDown" size={13} /></button>}
                  {h.kind === 'reaction' && <button className="icon-btn" title="Add reaction with its metabolites" onClick={() => a.addModelReaction(h.id)}><Icon name="plus" size={13} /></button>}
                </div>
              </div>
            );
          })}
          {q && !hits.length && <div className="muted small">No match.</div>}
        </div>
      </div>
      <div className="section">
        <button className="btn block" onClick={() => useStore.setState({ dialog: { kind: 'path' } })}><Icon name="path" size={14} /> Find metabolic path…</button>
        <div className="muted small">Currency metabolites (ATP, NAD(P)H, H₂O, H⁺, Pi, CoA…) are skipped when expanding and path-finding.</div>
      </div>
    </>
  );
}

/** Example file that matches the loaded model (the demo CSV only fits the demo model). */
function ExampleLink() {
  const model = useStore((s) => s.model);
  const a = A();
  if (!model) return null;
  const isDemo = model.source === 'demo' || !!model.reactions['HEX1'];
  const file = isDemo ? 'examples/pfba_4conditions.csv' : null;
  if (!file) return null;
  const load = async () => {
    try { a.importDataset(file.split('/').pop()!, await (await fetchPublic(file)).text()); } catch (e) { a.toast(`Could not load example: ${(e as Error).message}`); }
  };
  return <button className="link" onClick={load} title="Import an example flux table made for this model">Load example fluxes for this model</button>;
}

const REACTION_PROPS: ReactionProperty[] =['width', 'color', 'opacity', 'label'];
const NODE_PROPS: NodeProperty[] = ['radius', 'fill', 'opacity'];

function DataTab() {
  const datasets = useStore((s) => s.datasets);
  const conditions = useStore((s) => s.conditions);
  const mappings = useStore((s) => s.mappings);
  const savedViews = useStore((s) => s.savedViews);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragCond, setDragCond] = useState<{ id: string; over: number } | null>(null);
  const a = A();
  return (
    <>
      <div className="section">
        <button className="btn primary block" onClick={() => openFile('data')}><Icon name="import" size={14} /> Import fluxes / data (CSV, TSV, JSON)</button>
        <div className="muted small">Wide tables (<span className="mono">reaction,WT,KO…</span>), time courses, FVA (<span className="mono">_min/_max</span>) and long-format samples (<span className="mono">reaction,condition,value</span>) are detected automatically. Result JSON files exported by COBRAGUI (or the legacy GEM Explorer) are added as conditions. <ExampleLink /></div>
      </div>
      <div className="section">
        <div className="section-title">Datasets</div>
        {!datasets.length && <div className="muted small">No data yet.</div>}
        {datasets.map((d) => (
          <div key={d.id} className="ds">
            <button className="icon-btn" title={d.visible ? 'Hide' : 'Show'} onClick={() => a.updateDataset(d.id, { visible: !d.visible })}><Icon name={d.visible ? 'eye' : 'eyeOff'} size={13} /></button>
            <div className="ds-main">
              {renaming === d.id
                ? <input className="input tiny" autoFocus defaultValue={d.name} onBlur={(e) => { a.updateDataset(d.id, { name: e.target.value }); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                : <div className="ds-name" onDoubleClick={() => setRenaming(d.id)} title="Double-click to rename">{d.name}</div>}
              <div className="muted small"><span className="tag">{d.kind}</span> {d.columns.length} cond · {Object.keys(d.values).length} {d.target}s · <button className="link" onClick={() => useStore.setState({ dialog: { kind: 'importReport', datasetId: d.id } })}>{Math.round((d.matchedFraction ?? 1) * 100)}% matched</button></div>
            </div>
            <button className="icon-btn" title="Remove" onClick={() => a.removeDataset(d.id)}><Icon name="trash" size={13} /></button>
          </div>
        ))}
      </div>
      {conditions.length > 0 && (
        <div className="section">
          <div className="section-title">Conditions</div>
          <div className="muted small">Drag ⋮⋮ (or use ↑ ↓) to reorder — plots, the legend and the condition bar follow this order.</div>
          {conditions.map((c, i) => (
            <div key={c.id} className={`row gap cond-row ${dragCond?.id === c.id ? 'dragging' : ''} ${dragCond && dragCond.id !== c.id && dragCond.over === i ? 'drop-here' : ''}`}
              onDragOver={(e) => { if (!dragCond) return; e.preventDefault(); if (dragCond.over !== i) setDragCond({ ...dragCond, over: i }); }}
              onDrop={(e) => { e.preventDefault(); if (dragCond) { const from = conditions.findIndex((x) => x.id === dragCond.id); a.moveCondition(dragCond.id, from < i ? i - 1 : i); } setDragCond(null); }}>
              <span className="cond-grip" draggable title="Drag to reorder"
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); setDragCond({ id: c.id, over: i }); }}
                onDragEnd={() => setDragCond(null)}>⋮⋮</span>
              <input type="color" value={c.color} onChange={(e) => a.updateCondition(c.id, { color: e.target.value })} />
              <input className="input tiny grow" value={c.name} onChange={(e) => a.updateCondition(c.id, { name: e.target.value })} />
              <input className="input tiny num" type="number" placeholder="t" value={c.time ?? ''} title="Time / order (for time-course plots)" onChange={(e) => a.updateCondition(c.id, { time: e.target.value === '' ? undefined : +e.target.value })} />
              <span className="cond-move">
                <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => a.moveCondition(c.id, i - 1)}>↑</button>
                <button className="icon-btn" title="Move down" disabled={i === conditions.length - 1} onClick={() => a.moveCondition(c.id, i + 1)}>↓</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {datasets.length > 0 && (
        <div className="section">
          <div className="section-title">Map data → visual</div>
          {mappings.map((m) => {
            const ds = datasets.find((d) => d.id === m.datasetId);
            const props = m.target === 'reaction' ? REACTION_PROPS : NODE_PROPS;
            return (
              <div key={m.id} className={`mapping ${m.enabled ? '' : 'off'}`}>
                <div className="row gap">
                  <input type="checkbox" checked={m.enabled} onChange={(e) => a.updateMapping(m.id, { enabled: e.target.checked })} />
                  <select className="input tiny grow" value={m.datasetId} onChange={(e) => { const d = datasets.find((x) => x.id === e.target.value)!; a.updateMapping(m.id, { datasetId: d.id, target: d.target, property: d.target === m.target ? m.property : d.target === 'reaction' ? 'width' : 'radius' }); }}>
                    {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <span className="muted">→</span>
                  <select className="input tiny" value={m.property} onChange={(e) => a.updateMapping(m.id, { property: e.target.value as ReactionProperty })}>
                    {props.map((p) => <option key={p} value={p}>{m.target === 'reaction' ? 'edge ' : 'node '}{p}</option>)}
                  </select>
                  <button className="icon-btn" onClick={() => a.removeMapping(m.id)}><Icon name="x" size={12} /></button>
                </div>
                <details className="adv">
                  <summary>Scale: {m.scale}{m.palette ? ` · ${m.palette}` : ''}{m.domain ? ` · [${fmt(m.domain[0])}, ${fmt(m.domain[1])}]` : ''}</summary>
                  <div className="row gap wrap">
                    <select className="input tiny" value={m.scale} onChange={(e) => a.updateMapping(m.id, { scale: e.target.value as ScaleType })}>
                      {(['linear', 'sqrt', 'log', 'percentile'] as ScaleType[]).map((s) => <option key={s}>{s}</option>)}
                    </select>
                    {m.property === 'color' && (
                      <label className="check small" title="Colour by signed value (diverging) instead of magnitude; arrows already show direction"><input type="checkbox" checked={!m.magnitude} onChange={(e) => a.updateMapping(m.id, { magnitude: !e.target.checked })} /> signed</label>
                    )}
                    {(m.property === 'color' || m.property === 'fill') && (
                      <select className="input tiny" value={m.palette ?? ''} onChange={(e) => a.updateMapping(m.id, { palette: e.target.value || undefined })}>
                        <option value="">auto</option>
                        {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}{p.kind === 'diverging' ? ' (div)' : ''}</option>)}
                      </select>
                    )}
                    <label className="small">min <input className="input tiny num" type="number" value={m.domain?.[0] ?? ''} onChange={(e) => a.updateMapping(m.id, { domain: e.target.value === '' ? undefined : [+e.target.value, m.domain?.[1] ?? 10] })} /></label>
                    <label className="small">max <input className="input tiny num" type="number" value={m.domain?.[1] ?? ''} onChange={(e) => a.updateMapping(m.id, { domain: e.target.value === '' ? undefined : [m.domain?.[0] ?? 0, +e.target.value] })} /></label>
                  </div>
                  {ds && <div className="muted small">Domain is computed over all conditions so switching condition never rescales.</div>}
                </details>
              </div>
            );
          })}
          <div className="row gap wrap">
            <button className="btn small" onClick={() => { const d = datasets.find((x) => x.target === 'reaction'); if (d) a.addMapping({ datasetId: d.id, target: 'reaction', property: 'color', scale: 'linear', magnitude: false, enabled: true }); }}><Icon name="plus" size={12} /> Reaction mapping</button>
            <button className="btn small" onClick={() => { const d = datasets.find((x) => x.target === 'metabolite'); if (d) a.addMapping({ datasetId: d.id, target: 'metabolite', property: 'radius', scale: 'sqrt', magnitude: true, enabled: true }); else a.toast('Import a metabolite dataset first'); }}><Icon name="plus" size={12} /> Metabolite mapping</button>
          </div>
        </div>
      )}
      <div className="section">
        <div className="section-title">Saved views</div>
        {savedViews.map((v) => (
          <div key={v.id} className="row gap">
            <button className="btn small grow" onClick={() => a.applySavedView(v)}>{v.name}</button>
            <button className="icon-btn" onClick={() => a.deleteSavedView(v.id)}><Icon name="x" size={12} /></button>
          </div>
        ))}
        <button className="btn small" onClick={() => { const s = useStore.getState(); a.saveView(`${s.view.activeCondition}${s.view.compare !== 'absolute' ? ` ${s.view.compare} vs ${s.view.reference}` : ''}`); }}><Icon name="plus" size={12} /> Save current view</button>
      </div>
    </>
  );
}
