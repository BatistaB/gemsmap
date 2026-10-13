/** Template Library: built-in and user templates, all in the same file format. */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import { discardRecoveredDraft, loadRecoveredDraft, openTemplate, useTemplateSession } from '../../templates/design/session';
import { emptyTemplate, SCOPE_LABEL } from '../../templates/format/schema';
import { completeness } from '../../templates/format/validate';
import { deleteUserTemplate, libraryItems, loadTemplateLibrary, useTemplateLibrary, type LibraryItem } from '../../templates/library/registry';
import { Icon } from '../icons';
import { applyToMap, duplicateAndOpen, exportTemplate, pickTemplateFile } from './templateFiles';
import { ReviewTag, TemplatePreview } from './parts';
import { BiggPanel } from './BiggPanel';

export function TemplateLibrary() {
  const user = useTemplateLibrary((s) => s.user);
  const loaded = useTemplateLibrary((s) => s.loaded);
  const recovered = useTemplateSession((s) => s.recovered);
  const model = useStore((s) => s.model);
  const [q, setQ] = useState('');
  useEffect(() => { void loadTemplateLibrary(); void loadRecoveredDraft(); }, []);
  const items = useMemo(() => libraryItems(user), [user]);
  const ql = q.trim().toLowerCase();
  const shown = items.filter((i) => !ql || [i.file.metadata.name, i.file.metadata.pathway, ...i.file.metadata.tags, i.file.metadata.scope.taxa.join(' ')].join(' ').toLowerCase().includes(ql));
  const newTemplate = () => openTemplate(emptyTemplate('New template'), 'new');
  return (
    <div className="tpl-library">
      <div className="lib-head">
        <div>
          <h2>Template Library</h2>
          <div className="muted">Model-independent pathway templates. A template knows <b>what</b> each molecule is; the matcher finds what it is called in a GEM. No model needed to design one.</div>
        </div>
        <span className="grow" />
        <div className="search-box lib-search"><Icon name="search" size={14} /><input placeholder="Filter templates…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn" onClick={pickTemplateFile}><Icon name="import" size={14} /> Import template</button>
        <button className="btn primary" onClick={newTemplate}><Icon name="plus" size={14} /> New template</button>
      </div>
      {recovered && (
        <div className="notice lib-recover">
          Unsaved changes to <b>{recovered.file.metadata.name}</b> from your last session.
          <button className="btn small primary" onClick={() => { openTemplate(recovered.file, recovered.kind, { savedJson: null }); useTemplateSession.setState({ openId: recovered.openId, recovered: null }); }}>Resume</button>
          <button className="btn small" onClick={discardRecoveredDraft}>Discard</button>
        </div>
      )}
      <BiggPanel />
      <div className="lib-model muted small">{model ? <>GEM in the Map Builder: <b>{model.name}</b> — “Apply” maps a template onto it with the review dialog.</> : 'No GEM loaded in the Map Builder — templates can still be designed, validated and exported.'}</div>
      {!loaded && <div className="muted small pad">Loading your templates…</div>}
      {sectionsOf(shown).map(([title, list]) => (
        <section key={title} className="lib-section">
          <h3>{title} <span className="muted">{list.length}</span></h3>
          <div className="lib-grid">
            {list.map((i) => <TemplateCard key={i.file.metadata.id} item={i} canApply={!!model} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Library sections in gallery order (metadata.section; the user's own templates last). */
function sectionsOf(items: LibraryItem[]): [string, LibraryItem[]][] {
  const by = new Map<string, LibraryItem[]>();
  for (const i of items) {
    const s = i.file.metadata.section || (i.kind === 'builtin' ? 'Built-in' : 'My templates');
    by.set(s, [...(by.get(s) ?? []), i]);
  }
  return [...by].sort((a, b) => +(a[0] === 'My templates') - +(b[0] === 'My templates'));
}

function TemplateCard({ item, canApply }: { item: LibraryItem; canApply: boolean }) {
  const f = item.file;
  const md = f.metadata;
  const c = useMemo(() => completeness(f), [f]);
  const drawn = new Set(f.layout.nodes.filter((n) => !n.attach).map((n) => n.metabolite));
  const nMets = f.biology.metabolites.filter((m) => drawn.has(m.id)).length;
  const [confirmDel, setConfirmDel] = useState(false);
  const open = () => openTemplate(f, item.kind);
  return (
    <div className="lib-card">
      <button className="lib-preview" onClick={open} title="Open in Template Design Mode"><TemplatePreview f={f} /></button>
      <div className="lib-body">
        <div className="row gap"><b className="lib-name">{md.name}</b><span className={`tag ${item.kind === 'builtin' ? '' : 'on'}`}>{item.kind === 'builtin' ? 'Built-in' : 'User'}</span></div>
        <div className="muted small">{md.pathway}</div>
        {(md.review_status || md.source) && (
          <div className="row gap wrap small">
            <ReviewTag md={md} />
            {md.source && <span className="muted">{md.source.url ? <a href={md.source.url} target="_blank" rel="noreferrer">{md.source.reference}{md.source.pathway_id ? ` ${md.source.pathway_id}` : ''}</a> : md.source.reference} · own drawing, not an official {md.source.reference} map</span>}
          </div>
        )}
        <div className="lib-stats small">
          <span title="Drawn metabolites (side compounds not counted)">{nMets} metabolites</span>
          <span>{f.biology.reactions.length} reactions</span>
          <span title={md.scope.note}>{SCOPE_LABEL[md.scope.level]}{md.scope.taxa.length ? ` · ${md.scope.taxa.join(', ')}` : ''}</span>
          <span title={`Metabolites identified ${c.metabolitesIdentified}/${c.metabolites} · reactions ${c.reactionsIdentified}/${c.reactions} · preferred compartments ${c.compartmentsDefined}/${c.metabolites} (optional)`}>{Math.round(c.overall * 100)}% complete</span>
        </div>
        <div className="muted small">{md.authors.join(', ') || 'unknown author'} · v{md.template_version}{md.derived_from ? ` · from ${md.derived_from.name}` : ''}</div>
        <div className="row gap wrap lib-actions">
          <button className="btn small primary" onClick={open}>Open</button>
          <button className="btn small" onClick={() => duplicateAndOpen(f, `${md.name} — copy`)} title="Make your own editable copy">Duplicate</button>
          <button className="btn small" onClick={() => exportTemplate(f)}>Export</button>
          <button className="btn small" onClick={() => applyToMap(md.id)} title={canApply ? 'Map onto the GEM loaded in the Map Builder (with review)' : 'Insert into the Map Builder (load a GEM to map it)'}>Apply to GEM</button>
          {item.kind === 'user' && (confirmDel
            ? <><button className="btn small warn" onClick={() => deleteUserTemplate(md.id)}>Delete for good</button><button className="btn small" onClick={() => setConfirmDel(false)}>Keep</button></>
            : <button className="icon-btn" title="Delete template" onClick={() => setConfirmDel(true)}><Icon name="trash" size={13} /></button>)}
        </div>
      </div>
    </div>
  );
}

