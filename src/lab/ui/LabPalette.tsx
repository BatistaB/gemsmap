/** Ctrl/Cmd+K in COBRAGUI: global model search (grouped) + COBRA commands, keyboard-first. */
import Fuse from 'fuse.js';
import { edits } from '../edits';
import { openMetaboliteEditor, openReactionEditor } from './edit/EditDialogs';
import { useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import { addMetabolitesToMap, addReactionsToMap } from '../bridge';
import { METHOD_INFO } from '../format';
import type { Hit } from '../search';
import { L, lab, useLab } from '../store';
import type { LabSection, Method } from '../types';
import { pickResultFiles } from './importResults';
import { pickModelFile } from './Overview';
import { UI_SCALE_COMMANDS } from '../../ui/uiScale';

interface Cmd { id: string; label: string; group: string; hint?: string; run: () => void }

function labCommands(): Cmd[] {
  const s = useLab.getState();
  const hasModel = !!s.model;
  const go = (sec: LabSection) => () => lab.setSection(sec);
  const cmds: Cmd[] = [
    ...(['pfba', 'fba', 'loopless', 'fva'] as Method[]).map((m) => ({ id: 'run-' + m, group: 'Simulate', label: `Run ${METHOD_INFO[m].label}`, hint: m === s.method ? 'header ▶' : undefined, run: () => { useLab.setState({ method: m }); lab.simulate(m); } })),
    { id: 'objective', group: 'Model', label: 'Change objective', run: () => { lab.setSection('simulate'); useLab.setState({ objectiveEditorOpen: true }); } },
    { id: 'medium', group: 'Model', label: 'Configure medium', run: go('medium') },
    { id: 'find-r', group: 'Find', label: 'Find reaction', hint: 'R then F', run: () => { lab.setTab('reactions'); setTimeout(() => document.getElementById('lab-explorer-search')?.focus(), 30); } },
    { id: 'find-m', group: 'Find', label: 'Find metabolite', hint: 'M then F', run: () => { lab.setTab('metabolites'); setTimeout(() => document.getElementById('lab-explorer-search')?.focus(), 30); } },
    { id: 'find-g', group: 'Find', label: 'Find gene', run: () => { lab.setTab('genes'); setTimeout(() => document.getElementById('lab-explorer-search')?.focus(), 30); } },
    { id: 'hide-zero', group: 'View', label: s.hideZero ? 'Show zero-flux rows' : 'Hide zero flux', run: () => useLab.setState({ hideZero: !s.hideZero, section: 'explore' }) },
    { id: 'sort-flux', group: 'View', label: 'Sort reactions by |flux| ↓', run: () => useLab.setState((t) => ({ sort: { ...t.sort, reactions: { key: 'absFlux', dir: 'desc' } }, explorerTab: 'reactions', section: 'explore' })) },
    { id: 'add-sel', group: 'Map', label: `Add selection to map (${s.selection.reactions.length || s.selection.metabolites.length})`, run: () => (s.selection.reactions.length ? addReactionsToMap(s.selection.reactions) : addMetabolitesToMap(s.selection.metabolites)) },
    { id: 'vis-result', group: 'Map', label: 'Visualize active result on map', run: () => { const r = L.fluxResult(); if (r) useLab.setState({ dialog: { kind: 'visualize-result', resultId: r.id } }); } },
    { id: 'compare', group: 'Compare', label: 'Compare results', run: go('compare') },
    { id: 'dup', group: 'State', label: 'Duplicate current state', run: () => lab.duplicateState() },
    { id: 'new-state', group: 'State', label: 'New state from the model file', run: () => lab.newState() },
    { id: 'undo', group: 'State', label: 'Undo (state change or model edit)', hint: 'Ctrl Z', run: () => lab.undo() },
    { id: 'redo', group: 'State', label: 'Redo (state change or model edit)', hint: 'Ctrl Shift Z', run: () => lab.redo() },
    { id: 'revert', group: 'State', label: 'Revert state to the model file', run: () => lab.resetState() },
    { id: 'new-reaction', group: 'Edit model', label: 'New reaction…', run: () => openReactionEditor() },
    { id: 'new-metabolite', group: 'Edit model', label: 'New metabolite (search model and databases)…', run: () => openMetaboliteEditor() },
    { id: 'validate-model', group: 'Edit model', label: 'Validate model', run: () => useLab.setState({ dialog: { kind: 'validate-model' } }) },
    { id: 'export-patch', group: 'Edit model', label: 'Export model patch (model_patch.json)', run: () => edits.exportPatch() },
    { id: 'save-model', group: 'File', label: 'Save modified model as SBML / JSON / MAT…', run: () => useLab.setState({ dialog: { kind: 'export-model' } }) },
    { id: 'import', group: 'File', label: 'Import model (SBML / JSON / MAT)…', run: pickModelFile },
    { id: 'import-results', group: 'File', label: 'Import results (JSON / CSV / TSV)…', run: pickResultFiles },
    ...(['overview', 'explore', 'medium', 'simulate', 'results', 'compare'] as LabSection[]).map((x) => ({ id: 'go-' + x, group: 'Go to', label: x[0].toUpperCase() + x.slice(1), run: go(x) })),
    { id: 'to-map', group: 'Go to', label: 'Switch to Map Builder', run: () => lab.setWorkspace('map') },
    { id: 'log', group: 'View', label: 'Show activity log', run: () => useLab.setState({ logOpen: true }) },
    { id: 'inspector', group: 'View', label: 'Toggle inspector', run: () => useLab.setState({ inspectorOpen: !s.inspectorOpen }) },
    ...UI_SCALE_COMMANDS,
  ];
  return hasModel ? cmds : cmds.filter((c) => ['import', 'to-map'].includes(c.id) || c.id.startsWith('ui-'));
}

type Item = { type: 'hit'; hit: Hit } | { type: 'cmd'; cmd: Cmd };

export function LabPalette() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const search = useLab((s) => s.searchIndex);
  const cmds = useMemo(labCommands, []);
  const fuse = useMemo(() => new Fuse(cmds, { keys: ['label', 'group'], threshold: 0.38, ignoreLocation: true }), [cmds]);
  const close = () => useStore.setState({ paletteOpen: false });
  const groups = useMemo(() => {
    const out: { title: string; items: Item[] }[] = [];
    const t = q.trim();
    if (t && search) {
      const hits = search.search(t, undefined, 60);
      for (const [kind, title] of [['metabolite', 'Metabolites'], ['reaction', 'Reactions'], ['gene', 'Genes']] as const) {
        const items = hits.filter((h) => h.kind === kind).slice(0, 6).map((hit) => ({ type: 'hit' as const, hit }));
        if (items.length) out.push({ title, items });
      }
    }
    const c = t ? fuse.search(t, { limit: 8 }).map((r) => r.item) : cmds.slice(0, 10);
    if (c.length) out.push({ title: 'Commands', items: c.map((cmd) => ({ type: 'cmd' as const, cmd })) });
    return out;
  }, [q, search, fuse, cmds]);
  const flat = groups.flatMap((g) => g.items);
  const run = (it: Item | undefined, alt = false) => {
    if (!it) return;
    close();
    if (it.type === 'cmd') return it.cmd.run();
    const { kind, id } = it.hit;
    if (alt) { if (kind === 'reaction') addReactionsToMap([id], 'vertical'); else if (kind === 'metabolite') addMetabolitesToMap([id], false); return; }
    if (useLab.getState().section === 'overview') lab.setSection('explore');
    lab.navigate({ kind, id });
  };
  let i = -1;
  return (
    <div className="modal-backdrop top" onPointerDown={close}>
      <div className="palette lab-palette" onPointerDown={(e) => e.stopPropagation()}>
        <input autoFocus className="palette-input" placeholder="Search metabolites, reactions, genes — or type a command (Run pFBA, medium…)" value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowDown') { setSel((x) => Math.min(flat.length - 1, x + 1)); e.preventDefault(); }
            if (e.key === 'ArrowUp') { setSel((x) => Math.max(0, x - 1)); e.preventDefault(); }
            if (e.key === 'Enter') run(flat[sel], e.shiftKey);
          }} />
        <div className="palette-list">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="pl-group">{g.title}</div>
              {g.items.map((it) => {
                i++;
                const at = i;
                if (it.type === 'cmd') {
                  return (
                    <button key={it.cmd.id} className={`palette-item ${at === sel ? 'active' : ''}`} onMouseEnter={() => setSel(at)} onClick={() => run(it)}>
                      <span className="pi-group">{it.cmd.group}</span><span className="pi-label">{it.cmd.label}</span>{it.cmd.hint && <kbd>{it.cmd.hint}</kbd>}
                    </button>
                  );
                }
                const h = it.hit;
                return (
                  <div key={h.kind + h.id} className={`palette-item hit ${at === sel ? 'active' : ''}`} onMouseEnter={() => setSel(at)} onClick={() => run(it)}>
                    <span className={`kind k-${h.kind}`}>{h.kind[0].toUpperCase()}</span>
                    <span className="mono strong">{h.id}</span>
                    <span className="pi-label ellipsis">{h.name}{h.detail ? <span className="muted"> · {h.detail}</span> : null}</span>
                    <span className="pi-actions">
                      {h.kind !== 'gene' && <button className="btn small" title="Shift+Enter" onClick={(e) => { e.stopPropagation(); run(it, true); }}>Add to map</button>}
                      {h.kind === 'reaction' && <button className="btn small" onClick={(e) => { e.stopPropagation(); close(); lab.setObjectiveReaction(h.id); }}>Set objective</button>}
                      {h.kind === 'metabolite' && <button className="btn small" onClick={(e) => { e.stopPropagation(); close(); lab.showInExplorer('reactions', useLab.getState().index?.metRxns.get(h.id) ?? [], `Connected to ${h.id}`); }}>Connected reactions</button>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {!flat.length && <div className="muted small pad">Nothing found</div>}
        </div>
        <div className="palette-foot muted small"><kbd>↑↓</kbd> move · <kbd>Enter</kbd> inspect / run · <kbd>Shift Enter</kbd> add to map · <kbd>Esc</kbd> close</div>
      </div>
    </div>
  );
}
