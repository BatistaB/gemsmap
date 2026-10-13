import { useEffect, useRef, useState } from 'react';
import { looksLikeProject } from '../store/project';
import { StartBanner } from '../store/recovery';
import { useStore } from '../store/store';
import { BottomBar, TopBar } from './Bars';
import { Canvas } from './Canvas';
import { CommandPalette } from './CommandPalette';
import { ContextMenu } from './ContextMenu';
import { Dialogs } from './Dialogs';
import { ErrorBoundary } from './ErrorBoundary';
import { handleFile } from './files';
import { Inspector } from './Inspector';
import { LeftPanel } from './LeftPanel';
import { lab, useLab } from '../lab/store';
import { isResultJson } from '../lab/resultFiles';
import { CobraGui, LabStatusBar } from '../lab/ui/CobraGui';
import { TemplateWorkspace } from './templates/TemplateWorkspace';
import { importTemplateText } from './templates/templateFiles';

function Toast() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return <div className="toast" key={toast.id}>{toast.text}</div>;
}

const MODEL_FILE = /\.(xml|sbml|mat)$/i;

/** COBRAGUI drops: models go to COBRApy, result files (JSON/CSV/TSV) to the result history, projects to the map. */
async function routeLabDrop(f: File) {
  const name = f.name.toLowerCase();
  if (MODEL_FILE.test(name)) return lab.importFile(f);
  if (/\.(csv|tsv|txt)$/.test(name)) return lab.importResults([f]);
  if (name.endsWith('.json')) {
    const head = await f.slice(0, 4000).text();
    if (isResultJson(head)) return lab.importResults([f]);
    if (!looksLikeProject(head)) return lab.importFile(f);
  }
  handleFile(f);
}

/** A drag of files from the computer (not a text selection or an element dragged inside the page). */
const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function App() {
  const [drag, setDrag] = useState(false);
  const dragTimer = useRef<number | undefined>(undefined);
  // the "drop here" overlay must never outlive the drag: browsers do not always send dragleave / drop
  // (Esc during the drag, release outside the window), so any sign that the drag is over hides it
  useEffect(() => {
    if (!drag) return;
    const off = () => { window.clearTimeout(dragTimer.current); setDrag(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') off(); };
    const events = ['dragend', 'drop', 'blur', 'pointerdown', 'mousemove'] as const; // pointer events do not fire during a drag
    events.forEach((ev) => window.addEventListener(ev, off));
    window.addEventListener('keydown', key);
    return () => { events.forEach((ev) => window.removeEventListener(ev, off)); window.removeEventListener('keydown', key); };
  }, [drag]);
  const workspace = useLab((s) => s.workspace);
  const labMode = workspace === 'lab';
  const tplMode = workspace === 'templates';
  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDrag(true);
        // dragover repeats while files are held over the page; silence means the drag went away
        window.clearTimeout(dragTimer.current);
        dragTimer.current = window.setTimeout(() => setDrag(false), 400);
      }}
      onDragLeave={(e) => { if (!e.relatedTarget || e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault(); setDrag(false);
        for (const f of Array.from(e.dataTransfer.files)) {
          if (labMode) routeLabDrop(f);
          else if (tplMode) f.text().then((t) => importTemplateText(f.name, t));
          else handleFile(f);
        }
      }}
    >
      <TopBar />
      {labMode ? (
        <ErrorBoundary name="COBRAGUI"><CobraGui /></ErrorBoundary>
      ) : tplMode ? (
        <ErrorBoundary name="Template Builder"><TemplateWorkspace /></ErrorBoundary>
      ) : (
        <div className="main">
          <ErrorBoundary name="Left panel"><LeftPanel /></ErrorBoundary>
          <div className="center">
            <ErrorBoundary name="Canvas"><Canvas /></ErrorBoundary>
            <ContextMenu />
          </div>
          <ErrorBoundary name="Inspector"><Inspector /></ErrorBoundary>
        </div>
      )}
      {labMode ? <LabStatusBar /> : tplMode ? null : <BottomBar />}
      <ErrorBoundary name="Dialog"><Dialogs /></ErrorBoundary>
      <CommandPalette />
      <Toast />
      <StartBanner />
      {drag && <div className="drop-overlay">{labMode ? 'Drop a model (SBML · COBRA JSON · MAT) — or result files (JSON · CSV · TSV) to add them to Results' : tplMode ? 'Drop a template (.gemsmap-template.json) to import it' : 'Drop a GEM (.json/.xml), a data table (.csv/.tsv) or a project (.gemsmap)'}</div>}
    </div>
  );
}
