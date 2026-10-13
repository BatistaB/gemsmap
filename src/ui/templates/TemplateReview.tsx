/**
 * Template review queue and validation issues — the Template Builder's
 * counterpart of the Metabolite Review: every element with its identity,
 * status and source; click a row to select it on the canvas and review it.
 */
import { useMemo, useState } from 'react';
import { designActions } from '../../templates/design/actions';
import { docToFile } from '../../templates/design/convert';
import { equationText } from '../../templates/design/identitySearch';
import type { IdentityStatus, TemplateFile } from '../../templates/format/schema';
import { issueCounts, validateTemplateFile, type TemplateIssue } from '../../templates/format/validate';
import { useTemplateSession } from '../../templates/design/session';
import { key, useStore } from '../../store/store';
import { compartmentLabel } from '../../templates/format/schema';
import { GenericTag, IdentifierLine, StatusBadge } from './parts';

interface Row { id: string; kind: 'metabolite' | 'reaction'; element: string; detail: string; identity: string; status: IdentityStatus; confidence?: 'high' | 'probable'; generic?: boolean; source?: string; conflict?: boolean; ids: Record<string, string[] | undefined>; entityId?: string }

function rowsOf(f: TemplateFile): Row[] {
  const ents = new Map(f.biology.entities.map((e) => [e.id, e]));
  const drawn = new Set(f.layout.nodes.map((n) => n.metabolite));
  const out: Row[] = [];
  for (const m of f.biology.metabolites) {
    const e = ents.get(m.entity);
    if (!e) continue;
    out.push({
      id: m.id, kind: 'metabolite', element: m.label || e.short || e.name, detail: `${compartmentLabel(m.compartment).toLowerCase()}${drawn.has(m.id) ? '' : ' · side compound'}`,
      identity: e.identity.status === 'ambiguous' ? `${e.identity.candidates?.length ?? '?'} candidates` : e.identity.status === 'unresolved' ? '—' : e.name,
      status: e.identity.status, confidence: e.identity.confidence, generic: e.generic, source: e.identity.source, conflict: !!e.identity.conflict, ids: e.identifiers, entityId: e.id,
    });
  }
  for (const r of f.biology.reactions) {
    out.push({ id: r.id, kind: 'reaction', element: r.name, detail: equationText(f, r, 'short'), identity: r.canonicalName ?? (r.identifiers['kegg.reaction']?.[0] ?? (r.ec[0] ? `EC ${r.ec[0]}` : '—')), status: r.identity.status, confidence: r.identity.confidence, source: r.identity.source, ids: r.identifiers });
  }
  return out;
}

const ORDER: Record<IdentityStatus, number> = { ambiguous: 0, unresolved: 1, suggested: 2, confirmed: 3 };
/** Probable suggestions before high-confidence ones. */
const rank = (r: Row) => ORDER[r.status] * 2 + (r.status === 'suggested' && r.confidence === 'high' ? 1 : 0);

/** Select the element on the canvas (first drawn instance / arrow). */
function focus(kind: 'metabolite' | 'reaction', id: string) {
  const s = useStore.getState();
  if (kind === 'metabolite') {
    const n = Object.values(s.doc.nodes).find((x) => x.design?.kind === 'metabolite' && x.design.id === id);
    if (n) { s.actions.focusNode(n.id); return n.id; }
  } else {
    const g = Object.values(s.doc.reactions).find((x) => x.design?.kind === 'reaction' && x.design.id === id);
    if (g) { s.actions.focusNode(g.sources[0]); useStore.setState({ selection: [key('reaction', g.id)] }); }
  }
  return undefined;
}

export function ReviewPanel() {
  const f = useStore((s) => s.design);
  const [filter, setFilter] = useState<'review' | 'all' | 'metabolite' | 'reaction'>('review');
  const rows = useMemo(() => (f ? rowsOf(f) : []), [f]);
  if (!f) return null;
  const shown = rows.filter((r) => (filter === 'review' ? r.status !== 'confirmed' || r.conflict : filter === 'all' ? true : r.kind === filter)).sort((a, b) => rank(a) - rank(b) || (a.kind < b.kind ? -1 : 1));
  const n = (st: IdentityStatus) => rows.filter((r) => r.status === st).length;
  const review = (r: Row) => {
    const nodeId = focus(r.kind, r.id);
    useStore.setState({ dialog: r.kind === 'metabolite' ? { kind: 'identity', nodeId, entityId: r.entityId } : { kind: 'identity', reactionId: r.id } });
  };
  return (
    <aside className="panel right tpl-side">
      <div className="side-head"><b>Template review</b><span className="grow" /><button className="icon-btn" onClick={() => useTemplateSession.setState({ panel: 'none' })} title="Close">✕</button></div>
      <div className="tm-summary small">
        <span className="tm-pill ok">✓ {n('confirmed')}</span><span className="tm-pill warn">? {n('suggested')}</span><span className="tm-pill warn">⚠ {n('ambiguous')}</span><span className="tm-pill">○ {n('unresolved')}</span>
      </div>
      <div className="seg small">
        {(['review', 'all', 'metabolite', 'reaction'] as const).map((k) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k === 'review' ? 'Needs review' : k === 'all' ? 'All' : k === 'metabolite' ? 'Metabolites' : 'Reactions'}</button>)}
      </div>
      <div className="panel-scroll">
        <table className="rv-table">
          <thead><tr><th>Element</th><th>Identity</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.kind + r.id} onClick={() => focus(r.kind, r.id)} onDoubleClick={() => review(r)}>
                <td><b>{r.element}</b><div className="muted small ellipsis" title={r.detail}>{r.kind === 'reaction' ? 'Reaction · ' : ''}{r.detail}</div></td>
                <td><div className="small">{r.identity}</div><IdentifierLine ids={r.ids} max={2} /></td>
                <td>
                  <StatusBadge status={r.status} conflict={r.conflict} confidence={r.confidence} compact />{r.generic && <> <GenericTag /></>}
                  {r.status === 'suggested' && r.confidence && <div className="muted small">{r.confidence}</div>}
                  <div className="muted small">{r.source ?? ''}</div>
                  <div className="row gap">
                    <button className="link small" onClick={(e) => { e.stopPropagation(); review(r); }}>review</button>
                    {r.status === 'suggested' && <button className="link small" onClick={(e) => { e.stopPropagation(); if (r.kind === 'metabolite') designActions.confirmEntity(r.entityId!); else designActions.confirmReaction(r.id); }}>confirm</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div className="muted small pad">Nothing to review — every identity is confirmed.</div>}
      </div>
    </aside>
  );
}

const SEV: Record<TemplateIssue['severity'], string> = { error: '✕', warning: '⚠', info: 'i' };

export function IssuesPanel() {
  const f = useStore((s) => s.design);
  const doc = useStore((s) => s.doc);
  const [showInfo, setShowInfo] = useState(false);
  // validate the template as drawn (layout from the canvas)
  const issues = useMemo(() => (f ? validateTemplateFile(docToFile(f, doc)) : []), [f, doc]);
  if (!f) return null;
  const c = issueCounts(issues);
  const shown = issues.filter((i) => showInfo || i.severity !== 'info');
  const go = (i: TemplateIssue) => {
    const el = i.element;
    if (!el) return;
    if (el.kind === 'reaction') focus('reaction', el.id);
    else if (el.kind === 'metabolite') focus('metabolite', el.id);
    else if (el.kind === 'entity') { const m = f.biology.metabolites.find((x) => x.entity === el.id); if (m) focus('metabolite', m.id); }
    else if (el.kind === 'connector') { const n = Object.values(useStore.getState().doc.nodes).find((x) => x.design?.kind === 'port' && x.design.id === el.id); if (n) useStore.getState().actions.focusNode(n.id); }
  };
  return (
    <aside className="panel right tpl-side">
      <div className="side-head"><b>Validation</b><span className="grow" /><button className="icon-btn" onClick={() => useTemplateSession.setState({ panel: 'none' })} title="Close">✕</button></div>
      <div className="tm-summary small">
        <span className={`tm-pill ${c.errors ? 'bad' : 'ok'}`}>{c.errors} errors</span><span className="tm-pill warn">{c.warnings} warnings</span>
        <label className="check small"><input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> {c.infos} notes</label>
      </div>
      <div className="panel-scroll">
        {!shown.length && <div className="muted small pad">{c.errors + c.warnings ? '' : 'No problems found.'}</div>}
        {shown.map((i, k) => (
          <button key={k} className={`issue-row ${i.severity}`} onClick={() => go(i)} title={i.code}>
            <span className="sev">{SEV[i.severity]}</span><span>{i.message}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
