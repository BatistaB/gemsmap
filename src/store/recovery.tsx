/**
 * Start-up banner: the app always opens clean, and offers to continue the temporary session.
 *
 * The map is written to a temporary session every 5 minutes (export/export.ts → startAutosave), and
 * COBRAGUI remembers its last model. Nothing is reopened automatically — a session that makes the page
 * freeze can therefore never lock the app. The banner lets the user continue the temporary session,
 * reopen the last COBRAGUI model, download the session as a .gemsmap file, or just start working.
 */
import { useState } from 'react';
import { loadAutosave, loadAutosavedModel } from '../export/export';
import { lab } from '../lab/store';
import { isProjectFormat } from './project';
import { useStore } from './store';

interface TempSession { name?: string; format?: string; doc?: { nodes?: object; reactions?: object }; model?: unknown; _modelInIdb?: string; _savedAt?: number; [k: string]: unknown }

function readTemp(): TempSession | null {
  const p = loadAutosave() as TempSession | null;
  if (!p || !isProjectFormat(p.format)) return null;
  const n = Object.keys(p.doc?.nodes ?? {}).length + Object.keys(p.doc?.reactions ?? {}).length;
  return n ? p : null;
}

const when = (t?: number) => {
  if (!t) return '';
  const d = new Date(t), today = new Date().toDateString() === d.toDateString();
  return today ? `today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
};

async function withModel(p: TempSession): Promise<TempSession> {
  if (p._modelInIdb && !p.model) {
    const m = await loadAutosavedModel();
    if (m) { const { _modelInIdb: _drop, ...rest } = p; void _drop; return { ...rest, model: m }; }
  }
  return p;
}

export function StartBanner() {
  const [temp] = useState(readTemp);
  const [lastModel] = useState(() => lab.lastModel());
  const [open, setOpen] = useState(!!temp || !!lastModel);
  const [busy, setBusy] = useState('');
  if (!open) return null;
  const cont = async () => {
    if (!temp) return;
    setBusy('Opening the last session…');
    try {
      const p = await withModel(temp);
      useStore.getState().actions.loadProject(p as never);
      useStore.getState().actions.toast(`Continued “${temp.name ?? 'last session'}”`);
      setOpen(false);
    } catch (e) { setBusy(`Could not open it: ${(e as Error).message}`); }
  };
  const download = async () => {
    if (!temp) return;
    try {
      const p = await withModel(temp);
      const name = `${String(p.name || 'last_session').replace(/[^\w.-]+/g, '_')}_autosave.gemsmap`;
      const url = URL.createObjectURL(new Blob([JSON.stringify(p)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setBusy(`Saved ${name}${p.model ? '' : ' (without its model)'}`);
    } catch (e) { setBusy(`Could not read it: ${(e as Error).message}`); }
  };
  const reopenModel = () => { void lab.restoreLast(); setBusy(`Reopening ${lastModel?.name ?? 'the last model'} in COBRAGUI…`); };
  return (
    <div className="start-banner" role="status">
      <div className="sb-text">
        <b>Welcome back.</b>{' '}
        {temp ? <>Your last session <b>“{temp.name ?? 'Untitled'}”</b> was autosaved{temp._savedAt ? ` (${when(temp._savedAt)})` : ''}. </> : null}
        Open a project with <b>File → Open project…</b>, or:
      </div>
      <div className="sb-actions">
        {temp && <button className="btn small primary" onClick={cont}>Continue last session</button>}
        {temp && <button className="btn small" onClick={download} title="Save the autosaved session as a project file">Download it (.gemsmap)</button>}
        {lastModel && <button className="btn small" onClick={reopenModel} title="COBRAGUI keeps your imported models on the backend">Reopen COBRAGUI model{lastModel.name ? `: ${lastModel.name}` : ''}</button>}
        <button className="btn small" onClick={() => setOpen(false)}>Start fresh</button>
      </div>
      {busy && <div className="small">{busy}</div>}
      <div className="muted small">The session is autosaved every 5 minutes; save your work as a project (Ctrl S) to keep it for good.</div>
    </div>
  );
}
