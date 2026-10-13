// first: moves browser storage written under the old name before any module reads it
import { storageReady } from './store/legacy';
import { createRoot } from 'react-dom/client';
import { startAutosave } from './export/export';
import { emptyProject } from './store/project';
import { useStore } from './store/store';
import { App } from './ui/App';
import { installShortcuts } from './ui/shortcuts';
import './styles.css';
import './lab/lab.css';
import './ui/templates/templates.css';
import { loadTemplateLibrary } from './templates/library/registry';
import './templates/design/session';
import { lab } from './lab/store';

async function boot() {
  await storageReady;
  // user templates first: maps drawn with them re-map through the registry
  await loadTemplateLibrary();
  // always open clean: the autosaved session is offered by the start-up banner (store/recovery.tsx), never
  // reopened automatically — so a session that freezes the page can never lock the app
  useStore.getState().actions.loadProject(emptyProject());
  startAutosave();
  installShortcuts();
  lab.boot();
  if (import.meta.env.DEV) {
    (window as unknown as { gemsmap: typeof useStore }).gemsmap = useStore;
    import('./lab/store').then((m) => { (window as unknown as { gemsmapLab: unknown }).gemsmapLab = { useLab: m.useLab, lab: m.lab }; });
  }
  createRoot(document.getElementById('root')!).render(<App />);
}
boot().catch((e) => { console.error("GEMs MAP failed to start", e); });
