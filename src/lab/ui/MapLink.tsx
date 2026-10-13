/** Small pieces of COBRAGUI that live inside the Map Builder UI. */
import { inspectInModel } from '../bridge';
import { lab, useLab } from '../store';
import type { EntityRef } from '../types';

export function InspectInModelButton({ r }: { r: EntityRef }) {
  const known = useLab((s) => (r.kind === 'reaction' ? s.index?.rxn.has(r.id) : s.index?.met.has(r.id)));
  if (!known) return null;
  return <button className="btn small insp-action" onClick={() => inspectInModel(r)} title="Open in the COBRAGUI inspector (bounds, flux, connected reactions)">Inspect in COBRAGUI →</button>;
}

export function WorkspaceSwitcher() {
  const w = useLab((s) => s.workspace);
  const running = useLab((s) => s.running);
  return (
    <div className="ws-switch" role="tablist" aria-label="Workspace">
      <button role="tab" aria-selected={w === 'lab'} className={w === 'lab' ? 'on' : ''} onClick={() => lab.setWorkspace('lab')} title="COBRAGUI — explore, edit and simulate the GEM with COBRApy">
        COBRAGUI{running && <span className="spinner sm" />}
      </button>
      <button role="tab" aria-selected={w === 'map'} className={w === 'map' ? 'on' : ''} onClick={() => lab.setWorkspace('map')} title="Map Builder — pathway figures, flux mapping, export">
        Map Builder
      </button>
      <button role="tab" aria-selected={w === 'templates'} className={w === 'templates' ? 'on' : ''} onClick={() => lab.setWorkspace('templates')} title="Template Builder — model-independent pathway templates (biological identity + layout), reusable with any GEM">
        Templates
      </button>
    </div>
  );
}
