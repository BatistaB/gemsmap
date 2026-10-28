/**
 * The Templates workspace: the library, or Template Design Mode — the Map
 * Builder canvas editing a template (nodes are template entities, not model
 * metabolites), with the template palette on the left and the template
 * inspector / review queue / validation on the right.
 */
import { useEffect, useMemo, useState } from 'react';
import { A, useStore, type Tool } from '../../store/store';
import { designActions } from '../../templates/design/actions';
import { autoIdentifySearch } from '../../templates/design/identitySearch';
import { closeTemplate, currentTemplate, isDirty, openTemplate, useTemplateSession } from '../../templates/design/session';
import { docToFile } from '../../templates/design/convert';
import { completeness, issueCounts, validateTemplateFile } from '../../templates/format/validate';
import type { AutoIdentifySummary } from '../../templates/format/identity';
import { fetchBiggIds, refreshBiggStatus, useBigg } from '../../templates/design/bigg';
import { duplicateTemplate, saveUserTemplate, useTemplateLibrary } from '../../templates/library/registry';
import { Canvas } from '../Canvas';
import { ContextMenu } from '../ContextMenu';
import { Modal } from '../Dialogs';
import { ErrorBoundary } from '../ErrorBoundary';
import { Icon } from '../icons';
import { SectionsBar, useCollapsibleSections } from '../Collapsible';
import { ResizeHandle, usePanelWidth } from '../Resizer';
import { CompletenessBlock } from './parts';
import { TemplateInspector } from './TemplateInspector';
import { TemplateLibrary } from './TemplateLibrary';
import { IssuesPanel, ReviewPanel } from './TemplateReview';
import { applyToMap, exportTemplate, saveDesign, saveImported, withNewId } from './templateFiles';

export function TemplateWorkspace() {
  const view = useTemplateSession((s) => s.view);
  const designing = useStore((s) => !!s.design);
  return (
    <>
      {view === 'designer' && designing ? <TemplateDesigner /> : <div className="main"><TemplateLibrary /></div>}
      <ImportDialog />
    </>
  );
}

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'pan', icon: 'pan', label: 'Pan', key: 'C' },
  { id: 'metabolite', icon: 'metabolite', label: 'Metabolite', key: 'M' },
  { id: 'reaction', icon: 'reaction', label: 'Reaction', key: 'R' },
  { id: 'text', icon: 'text', label: 'Label', key: 'T' },
];

function TemplateDesigner() {
  const panel = useTemplateSession((s) => s.panel);
  return (
    <div className="main tpl-design">
      <ErrorBoundary name="Template palette"><DesignLeftPanel /></ErrorBoundary>
      <div className="center">
        <div className="design-banner ui-only"><b>Template Design Mode</b> · nodes are <b>template entities</b> (biological identities), not model metabolites · double-click a node to define what it is</div>
        <ErrorBoundary name="Canvas"><Canvas /></ErrorBoundary>
        <ContextMenu />
      </div>
      {panel === 'review' && <ErrorBoundary name="Review"><ReviewPanel /></ErrorBoundary>}
      {panel === 'issues' && <ErrorBoundary name="Validation"><IssuesPanel /></ErrorBoundary>}
      <ErrorBoundary name="Inspector"><TemplateInspector /></ErrorBoundary>
    </div>
  );
}

const center = () => {
  const s = useStore.getState();
  return { x: (s.viewport.w / 2 - s.camera.x) / s.camera.k, y: (s.viewport.h / 3 - s.camera.y) / s.camera.k };
};

function DesignLeftPanel() {
  const pw = usePanelWidth('tpl-left', 264, 210, 520);
  const folds = useCollapsibleSections('template-left');
  const tool = useStore((s) => s.tool);
  const f = useStore((s) => s.design)!;
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const kind = useTemplateSession((s) => s.kind);
  const openId = useTemplateSession((s) => s.openId);
  const savedJson = useTemplateSession((s) => s.savedJson);
  const [auto, setAuto] = useState<AutoIdentifySummary | 'running' | null>(null);
  const [closing, setClosing] = useState(false);
  const [bigg, setBigg] = useState<ReturnType<typeof designActions.applyBiggIds> | 'running' | string | null>(null);
  const biggStatus = useBigg((s) => s.status);
  useEffect(() => { void refreshBiggStatus(); }, []);
  const runBigg = async () => {
    setBigg('running');
    try {
      const r = await fetchBiggIds(currentTemplate()!);
      if (!r.available) { setBigg('BiGG data not installed — run gemsmap bigg-data once'); return; }
      setBigg(designActions.applyBiggIds(r));
    } catch (e) { setBigg(`BiGG IDs unavailable: ${(e as Error).message} (start the backend)`); }
  };
  const file = useMemo(() => docToFile(f, doc), [f, doc]);
  const counts = useMemo(() => issueCounts(validateTemplateFile(file)), [file]);
  const comp = useMemo(() => completeness(file), [file]);
  const dirty = useMemo(() => isDirty(), [f, doc, savedJson]); // eslint-disable-line react-hooks/exhaustive-deps
  const toReview = f.biology.entities.filter((e) => e.identity.status !== 'confirmed' || e.identity.conflict).length + f.biology.reactions.filter((r) => r.identity.status !== 'confirmed').length;
  const selNode = selection.length === 1 && selection[0].startsWith('node:') ? doc.nodes[selection[0].slice(5)] : undefined;
  useTemplateLibrary((s) => s.user); // re-render when the library changes (saved state)
  const open = useStore((s) => s.leftOpen);
  const runAuto = async () => {
    setAuto('running');
    const r = await designActions.autoIdentify(autoIdentifySearch);
    setAuto(r);
    if (r) { useTemplateSession.setState({ panel: 'review' }); A().toast(`Auto Identify: ${r.resolved} suggested · ${r.review} need review · ${r.unresolved} unresolved${r.conflicts ? ` · ${r.conflicts} potential conflicts` : ''}`); }
  };
  const close = () => (isDirty() ? setClosing(true) : closeTemplate());
  const apply = () => {
    if (isDirty() || !openId) { if (!saveDesign()) return; }
    applyToMap(useTemplateSession.getState().openId ?? f.metadata.id);
  };
  if (!open) return null;
  return (
    <aside className="panel left tpl-left" style={{ width: pw.css }}>
      <ResizeHandle panel={pw} edge="right" />
      <SectionsBar api={folds} />
      <div className="panel-scroll" ref={folds.ref}>
        <div className="section">
          <div className="row gap"><b className="grow ellipsis" title={f.metadata.name}>{f.metadata.name}</b><span className="tag">{kind === 'builtin' ? 'Built-in · read-only' : kind === 'imported' ? 'Imported · not saved' : kind === 'new' ? 'New · not saved' : 'My template'}</span></div>
          <div className="muted small">v{f.metadata.template_version}{dirty ? ' · unsaved changes' : ' · saved'}</div>
        </div>
        <div className="section">
          <div className="section-title">Tools</div>
          <div className="tool-grid">
            {TOOLS.map((t) => (
              <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} onClick={() => useStore.setState({ tool: t.id })}>
                <Icon name={t.icon} size={17} /><span>{t.label}</span><kbd>{t.key}</kbd>
              </button>
            ))}
          </div>
          <div className="muted small">Double-click empty space: new metabolite · drag from a node's ring: new reaction · drop on empty space: extend the chain</div>
        </div>
        <div className="section">
          <div className="section-title">Add</div>
          <div className="row wrap gap">
            <button className="btn small" onClick={() => designActions.addMetaboliteAt(center())}>+ Metabolite</button>
            <button className="btn small" onClick={() => A().addText(center(), { text: 'Label', size: 11, weight: 600, italic: true })}>+ Label</button>
            <button className="btn small" onClick={() => A().groupSelection('pathway', 'Pathway module')}>Group as module</button>
            <button className="btn small" onClick={() => A().groupSelection('compartment', 'Mitochondria')}>Compartment box</button>
          </div>
          <div className="muted small">{selNode?.design?.kind === 'metabolite' ? 'Pathway link: see the Inspector → “+ Pathway link”.' : 'Pathway links (ports to other pathways) start from a selected metabolite.'}</div>
        </div>
        <div className="section">
          <div className="section-title">Identity</div>
          <button className="btn block" onClick={runAuto} disabled={auto === 'running'} title="Search the GEMsMAP library (and KEGG / ChEBI / MetaNetX when the backend runs) for every entity that is not confirmed. Confirmed identities are never changed.">
            {auto === 'running' ? <><span className="spinner sm" /> Identifying…</> : <><Icon name="sparkle" size={14} /> Auto Identify</>}
          </button>
          {auto && auto !== 'running' && (
            <div className="small auto-sum">
              <div>Automatically resolved (suggested): <b>{auto.resolved}</b></div>
              <div>Needs review: <b>{auto.review + auto.conflicts}</b></div>
              <div>Unresolved: <b>{auto.unresolved}</b></div>
              <div className="muted">Confirmed and kept: {auto.keptConfirmed}</div>
            </div>
          )}
          <button className="btn block" onClick={runBigg} disabled={bigg === 'running' || biggStatus?.available === false}
            title={biggStatus?.available === false ? 'Install the BiGG data first: gemsmap bigg-data' : 'Add BiGG universal IDs (and BiGG cross-references) where exactly one BiGG metabolite / reaction fits — templates then match models downloaded from BiGG by their own IDs'}>
            {bigg === 'running' ? <><span className="spinner sm" /> Looking up BiGG…</> : 'Add BiGG IDs'}
          </button>
          {typeof bigg === 'string' && bigg !== 'running' && <div className="tm-note small">{bigg}</div>}
          {bigg && typeof bigg === 'object' && (
            <div className="small auto-sum">
              <div>Metabolites: <b>{bigg.entities.added}</b> added · {bigg.entities.known} already had it · {bigg.entities.none} not in BiGG</div>
              <div>Reactions: <b>{bigg.reactions.added}</b> added · {bigg.reactions.known} already had it · {bigg.reactions.none} no clear match</div>
              {[...bigg.entities.review, ...bigg.reactions.review].length > 0 && <div className="muted">Several BiGG candidates (choose in the identity search): {[...bigg.entities.review, ...bigg.reactions.review].join('; ')}</div>}
            </div>
          )}
          <button className="btn block" onClick={() => useTemplateSession.setState({ panel: 'review' })}>Review queue {toReview ? <span className="tag warn">{toReview}</span> : <span className="tag on">all confirmed</span>}</button>
          <button className="btn block" onClick={() => useTemplateSession.setState({ panel: 'issues' })}>Validate template {counts.errors ? <span className="tag warn">{counts.errors} errors</span> : null}{counts.warnings ? <span className="tag">{counts.warnings} warnings</span> : null}{!counts.errors && !counts.warnings ? <span className="tag on">no problems</span> : null}</button>
        </div>
        <div className="section"><div className="section-title">Completeness</div><CompletenessBlock c={comp} /></div>
        <div className="section">
          <div className="section-title">Template</div>
          <button className="btn primary block" onClick={saveDesign} title="Ctrl S">{kind === 'builtin' ? 'Save as my version' : 'Save'}</button>
          <button className="btn block" onClick={() => { const copy = saveUserTemplate(duplicateTemplate(currentTemplate()!)); openTemplate(copy, 'user'); A().toast(`Duplicated as “${copy.metadata.name}”`); }}>Duplicate</button>
          <button className="btn block" onClick={() => exportTemplate(currentTemplate()!)}><Icon name="export" size={13} /> Export (.gemsmap-template.json)</button>
          <button className="btn block" onClick={apply} title="Save, then map onto the GEM loaded in the Map Builder (review dialog)">Apply to GEM…</button>
          <button className="btn block" onClick={close}>Close</button>
        </div>
      </div>
      {closing && (
        <Modal title="Unsaved changes" onClose={() => setClosing(false)} width={420}>
          <div>Save the changes to “{f.metadata.name}” before closing?</div>
          <div className="row gap end">
            <button className="btn" onClick={() => { setClosing(false); closeTemplate(); }}>Discard</button>
            <button className="btn" onClick={() => setClosing(false)}>Cancel</button>
            <button className="btn primary" onClick={() => { if (saveDesign()) { setClosing(false); closeTemplate(); } }}>{kind === 'builtin' ? 'Save as my version' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </aside>
  );
}

// ------------------------------------------------------------ import report

function ImportDialog() {
  const imp = useTemplateSession((s) => s.importing);
  const user = useTemplateLibrary((s) => s.user);
  const [demote, setDemote] = useState(false);
  const issues = useMemo(() => (imp ? validateTemplateFile(imp.file) : []), [imp]);
  if (!imp) return null;
  const f = imp.file;
  const c = issueCounts(issues);
  const comp = completeness(f);
  const exists = user.find((u) => u.metadata.id === f.metadata.id);
  const bySource = new Map<string, number>();
  for (const e of f.biology.entities) if (e.identity.status === 'confirmed') bySource.set(e.identity.source ?? 'unknown', (bySource.get(e.identity.source ?? 'unknown') ?? 0) + 1);
  const done = () => { useTemplateSession.setState({ importing: null }); setDemote(false); };
  const prepared = () => (demote ? demoted(f) : f);
  return (
    <Modal title={`Import template — ${imp.fileName}`} onClose={done} width={600}>
      <div><b>{f.metadata.name}</b> v{f.metadata.template_version} · {f.metadata.authors.join(', ') || 'unknown author'} · schema {f.schema_version}</div>
      <div className="muted small">{f.metadata.description}</div>
      <div className="tm-summary small">
        <span className={`tm-pill ${c.errors ? 'bad' : 'ok'}`}>{c.errors} errors</span><span className="tm-pill warn">{c.warnings} warnings</span>
        <span className="tm-pill">{f.layout.nodes.length} nodes · {f.biology.reactions.length} reactions</span>
      </div>
      <CompletenessBlock c={comp} />
      {imp.warnings.map((w) => <div key={w} className="tm-note small">{w}</div>)}
      {issues.filter((i) => i.severity !== 'info').slice(0, 8).map((i, k) => <div key={k} className={`issue-row ${i.severity}`}><span className="sev">{i.severity === 'error' ? '✕' : '⚠'}</span><span>{i.message}</span></div>)}
      {issues.filter((i) => i.severity !== 'info').length > 8 && <div className="muted small">… and more in the validation panel after opening.</div>}
      <div className="small">Confirmed identities in this file: {[...bySource.entries()].map(([k, v]) => `${v} by ${k}`).join(', ') || 'none'}. They were confirmed by the file's author, not by you.</div>
      <label className="check small"><input type="checkbox" checked={demote} onChange={(e) => setDemote(e.target.checked)} /> Treat every identity as a suggestion and review it myself</label>
      <div className="row gap end">
        <button className="btn" onClick={done}>Cancel</button>
        {exists && <button className="btn" onClick={() => { saveImported(prepared()); done(); }} title="Overwrite your template with the same id">Replace “{exists.metadata.name}”</button>}
        <button className="btn" onClick={() => { saveImported(exists ? withNewId(prepared()) : prepared()); done(); }}>{exists ? 'Save as a new template' : 'Save to library'}</button>
        <button className="btn primary" onClick={() => { const g = exists ? withNewId(prepared()) : prepared(); done(); openTemplate(g, 'imported'); if (c.errors || c.warnings) useTemplateSession.setState({ panel: 'issues' }); }}>Open and review</button>
      </div>
    </Modal>
  );
}

const demoted = (f: ReturnType<typeof currentTemplate> & object) => ({
  ...f,
  biology: {
    ...f.biology,
    entities: f.biology.entities.map((e) => (e.identity.status === 'confirmed' ? { ...e, identity: { ...e.identity, status: 'suggested' as const, source: 'imported' as const } } : e)),
    reactions: f.biology.reactions.map((r) => (r.identity.status === 'confirmed' ? { ...r, identity: { ...r.identity, status: 'suggested' as const, source: 'imported' as const } } : r)),
  },
});
