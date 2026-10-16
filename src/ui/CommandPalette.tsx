import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';
import { saveProjectFile } from '../export/export';
import { searchModel } from '../model/search';
import { A, key, useStore } from '../store/store';
import { BUILTIN_TEMPLATES } from '../templates/templates';
import type { StylePresetId } from '../viz/types';
import { THEMES } from '../viz/presets';
import { openFile } from './files';
import { lab, useLab } from '../lab/store';
import { LabPalette } from '../lab/ui/LabPalette';
import { UI_SCALE_COMMANDS } from './uiScale';

interface Cmd { id: string; label: string; group: string; hint?: string; run: () => void }

export function commands(): Cmd[] {
  const a = A();
  const s = useStore.getState();
  const cmds: Cmd[] = [
    { id: 'add-met', group: 'Create', label: 'Add metabolite', hint: 'M', run: () => useStore.setState({ tool: 'metabolite' }) },
    { id: 'add-slot', group: 'Create', label: 'Add empty slot (template node)', hint: 'S', run: () => useStore.setState({ tool: 'slot' }) },
    { id: 'add-rxn', group: 'Create', label: 'Reaction tool', hint: 'R', run: () => useStore.setState({ tool: 'reaction' }) },
    { id: 'add-text', group: 'Create', label: 'Add text', hint: 'T', run: () => useStore.setState({ tool: 'text' }) },
    { id: 'add-plot', group: 'Create', label: 'Add density plot to selected reactions', hint: 'P', run: () => a.addPlotsForSelection('density') },
    { id: 'add-heat', group: 'Create', label: 'Add heatmap to selected reactions', run: () => a.addPlotsForSelection('heatmap') },
    { id: 'add-bar', group: 'Create', label: 'Add bar chart to selected reactions', run: () => a.addPlotsForSelection('bar') },
    { id: 'layout-v', group: 'Layout', label: 'Vertical layout', run: () => a.layoutSelection('vertical') },
    { id: 'layout-h', group: 'Layout', label: 'Horizontal layout', run: () => a.layoutSelection('horizontal') },
    { id: 'layout-c', group: 'Layout', label: 'Circular layout', run: () => a.layoutSelection('circle') },
    { id: 'layout-g', group: 'Layout', label: 'Grid layout', run: () => a.layoutSelection('grid') },
    { id: 'layout-hi', group: 'Layout', label: 'Hierarchical layout', run: () => a.layoutSelection('hierarchical') },
    { id: 'layout-o', group: 'Layout', label: 'Organic layout', run: () => a.layoutSelection('organic') },
    { id: 'tidy', group: 'Layout', label: 'Tidy selection', run: () => a.tidySelection() },
    { id: 'group', group: 'Layout', label: 'Group as pathway', hint: 'Ctrl G', run: () => a.groupSelection('pathway') },
    { id: 'compartment', group: 'Layout', label: 'Group as compartment', run: () => a.groupSelection('compartment') },
    { id: 'collapse', group: 'Layout', label: 'Collapse selection into one arrow (hide reactions)', run: () => a.collapseSelection() },
    { id: 'expand', group: 'Layout', label: 'Expand selected collapsed arrow', run: () => a.selectedIds('reaction').forEach((id) => a.expandGlyph(id)) },
    { id: 'routes', group: 'Model', label: 'Find routes for the selected arrow…', run: () => { const g = s.doc.reactions[a.selectedIds('reaction')[0]]; if (g) useStore.setState({ dialog: { kind: 'routes', from: g.sources[0], to: g.targets[0], replaceGlyph: g.id } }); else a.toast('Select an arrow first'); } },
    { id: 'autobind', group: 'Model', label: 'Auto-bind template slots to model', run: () => a.autoBindAll() },
    { id: 'path', group: 'Model', label: 'Find metabolic path…', run: () => useStore.setState({ dialog: { kind: 'path' } }) },
    { id: 'validate', group: 'Model', label: 'Show model validation', run: () => useStore.setState({ dialog: { kind: 'validation' } }) },
    { id: 'import-gem', group: 'File', label: 'Import GEM (JSON / SBML)…', run: () => openFile('model') },
    { id: 'import-flux', group: 'File', label: 'Import fluxes / data (CSV, TSV)…', run: () => openFile('data') },
    { id: 'open', group: 'File', label: 'Open project (.gemsmap)…', run: () => openFile('project') },
    { id: 'save', group: 'File', label: 'Save project (.gemsmap)', hint: 'Ctrl S', run: () => saveProjectFile() },
    { id: 'export', group: 'File', label: 'Export SVG / PDF / PNG…', hint: 'Ctrl E', run: () => useStore.setState({ dialog: { kind: 'export' } }) },
    { id: 'demo', group: 'File', label: 'Open central carbon demo', run: () => import('../demo/demo').then((m) => a.loadProject(m.demoProject())) },
    { id: 'new', group: 'File', label: 'New empty project', run: () => a.newProject() },
    { id: 'save-tpl', group: 'File', label: 'Save selection as template…', run: () => useStore.setState({ dialog: { kind: 'saveTemplate' } }) },
    { id: 'grid', group: 'View', label: 'Toggle grid', run: () => a.setCanvas({ showGrid: !s.canvas.showGrid }) },
    { id: 'snap', group: 'View', label: 'Toggle snap to grid', run: () => a.setCanvas({ snap: !s.canvas.snap }) },
    { id: 'fit', group: 'View', label: 'Fit all', hint: 'F', run: () => a.fitAll() },
    { id: 'particles', group: 'View', label: 'Toggle flux particles', run: () => a.setAnimation({ particles: !s.animation.particles }) },
    { id: 'play', group: 'View', label: 'Play / pause condition animation', run: () => a.setAnimation({ playing: !s.animation.playing }) },
    ...UI_SCALE_COMMANDS,
    { id: 'rxn-ids', group: 'Labels', label: 'Show reaction IDs', run: () => a.setStyle({ reactionLabel: 'id' }) },
    { id: 'rxn-names', group: 'Labels', label: 'Show reaction names', run: () => a.setStyle({ reactionLabel: 'name' }) },
    { id: 'met-ids', group: 'Labels', label: 'Show metabolite IDs', run: () => a.setStyle({ metaboliteLabel: 'id' }) },
    { id: 'met-names', group: 'Labels', label: 'Show metabolite names', run: () => a.setStyle({ metaboliteLabel: 'name' }) },
    { id: 'flux-vals', group: 'Labels', label: 'Toggle flux values', run: () => a.setStyle({ showFluxValues: !s.style.showFluxValues }) },
    { id: 'to-lab', group: 'Workspace', label: 'Switch to COBRAGUI (COBRApy)', run: () => lab.setWorkspace('lab') },
    { id: 'help', group: 'Help', label: 'Keyboard shortcuts', hint: '?', run: () => useStore.setState({ dialog: { kind: 'help' } }) },
    ...s.conditions.map((c) => ({ id: 'cond-' + c.id, group: 'Condition', label: `Change condition → ${c.name}`, run: () => a.setView({ activeCondition: c.id }) })),
    ...(['absolute', 'difference', 'foldchange', 'log2fc'] as const).map((m) => ({ id: 'cmp-' + m, group: 'Condition', label: `Compare mode: ${m}`, run: () => a.setView({ compare: m }) })),
    ...(Object.keys(THEMES) as StylePresetId[]).map((p) => ({ id: 'style-' + p, group: 'Style', label: `Style preset: ${THEMES[p].name}`, run: () => a.setStyle({ preset: p }) })),
    ...BUILTIN_TEMPLATES.map((t) => ({ id: 'tpl-' + t.id, group: 'Template', label: `Insert template: ${t.name}`, run: () => a.openTemplate(t) })),
    { id: 'tpl-confirm', group: 'Template', label: 'Confirm all provisional template mappings', run: () => a.confirmProvisional() },
    ...s.userTemplates.map((t) => ({ id: 'tpl-' + t.id, group: 'Template', label: `Insert my template: ${t.name}`, run: () => a.instantiateTemplate(t) })),
  ];
  return cmds;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const workspace = useLab((s) => s.workspace);
  if (!open) return null;
  if (workspace === 'templates') return null;
  return workspace === 'lab' ? <LabPalette /> : <Palette />;
}

function Palette() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const model = useStore((s) => s.model);
  const doc = useStore((s) => s.doc);
  const cmds = useMemo(() => commands(), []);
  const fuse = useMemo(() => new Fuse(cmds, { keys: ['label', 'group'], threshold: 0.4, ignoreLocation: true }), [cmds]);
  const closeP = () => useStore.setState({ paletteOpen: false });

  const items = useMemo(() => {
    const out: Cmd[] = [];
    const base = q.trim() ? fuse.search(q, { limit: 12 }).map((r) => r.item) : cmds.slice(0, 12);
    out.push(...base);
    if (q.trim().length >= 2) {
      const ql = q.trim().toLowerCase().replace(/^find\s+/, '');
      // on-canvas elements
      for (const n of Object.values(doc.nodes)) {
        const label = (n.metaboliteId ?? '') + ' ' + (n.label ?? '');
        if (label.toLowerCase().includes(ql)) out.push({ id: 'focus-' + n.id, group: 'On canvas', label: `Focus ${n.metaboliteId ?? n.label}`, run: () => A().focusNode(n.id) });
        if (out.length > 30) break;
      }
      for (const g of Object.values(doc.reactions)) {
        if (((g.reactionId ?? '') + ' ' + (g.label ?? '')).toLowerCase().includes(ql)) {
          out.push({ id: 'focus-r-' + g.id, group: 'On canvas', label: `Focus reaction ${g.reactionId ?? g.label}`, run: () => { const n = g.sources[0]; A().focusNode(n); useStore.setState({ selection: [key('reaction', g.id)] }); } });
        }
      }
      for (const h of searchModel(model, ql, ['metabolite', 'reaction'], 8)) {
        out.push(h.kind === 'metabolite'
          ? { id: 'm-' + h.id, group: 'Model · add', label: `Add ${h.id} — ${h.name}`, run: () => A().addMetaboliteFromModel(h.id) }
          : { id: 'r-' + h.id, group: 'Model · add', label: `Add reaction ${h.id} — ${h.name}`, run: () => A().addModelReaction(h.id) });
      }
    }
    return out;
  }, [q, fuse, cmds, doc, model]);

  const run = (c: Cmd | undefined) => { if (!c) return; closeP(); c.run(); };
  return (
    <div className="modal-backdrop top" onPointerDown={closeP}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          autoFocus className="palette-input" placeholder="Type a command, metabolite or reaction…" value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeP();
            if (e.key === 'ArrowDown') { setSel((s) => Math.min(items.length - 1, s + 1)); e.preventDefault(); }
            if (e.key === 'ArrowUp') { setSel((s) => Math.max(0, s - 1)); e.preventDefault(); }
            if (e.key === 'Enter') run(items[sel]);
          }}
        />
        <div className="palette-list">
          {items.map((c, i) => (
            <button key={c.id + i} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
              <span className="pi-group">{c.group}</span>
              <span className="pi-label">{c.label}</span>
              {c.hint && <kbd>{c.hint}</kbd>}
            </button>
          ))}
          {!items.length && <div className="muted small pad">Nothing found</div>}
        </div>
      </div>
    </div>
  );
}
