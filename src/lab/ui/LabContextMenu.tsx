import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { A } from '../../store/store';
import { addMetabolitesToMap, addReactionsToMap, focusInMap, glyphFor } from '../bridge';
import { L, lab, refKey, useLab } from '../store';
import type { EntityRef } from '../types';
import { openBoundary, openMetaboliteEditor, openReactionEditor } from './edit/EditDialogs';
import { duplicateMetabolite, duplicateReaction, newReactionWith } from './edit/EditsMenu';

const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => A().toast(`Copied ${what}`), () => A().toast('Clipboard unavailable'));

export function LabContextMenu() {
  const cm = useLab((s) => s.contextMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!cm) return;
    const close = (e: Event) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) useLab.setState({ contextMenu: null }); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') useLab.setState({ contextMenu: null }); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', close, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('wheel', close, true); window.removeEventListener('keydown', key); };
  }, [cm]);
  useLayoutEffect(() => {
    if (!cm || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(cm.x, window.innerWidth - r.width - 8), y: Math.min(cm.y, window.innerHeight - r.height - 8) });
  }, [cm]);
  if (!cm || !cm.refs.length) return null;
  const close = () => useLab.setState({ contextMenu: null });
  const item = (label: string, run: () => void, opts: { hint?: string; disabled?: boolean } = {}) => (
    <button className="cm-item" disabled={opts.disabled} onClick={() => { close(); run(); }}><span>{label}</span>{opts.hint && <kbd>{opts.hint}</kbd>}</button>
  );
  return (
    <div className="context-menu lab-cm" ref={ref} style={{ left: pos.x || cm.x, top: pos.y || cm.y, position: 'fixed' }} onContextMenu={(e) => e.preventDefault()}>
      {cm.refs.length > 1 ? <Multi refs={cm.refs} item={item} /> : <Single r={cm.refs[0]} item={item} />}
    </div>
  );
}

type ItemFn = (label: string, run: () => void, opts?: { hint?: string; disabled?: boolean }) => JSX.Element;

function Single({ r, item }: { r: EntityRef; item: ItemFn }) {
  const s = useLab.getState();
  const index = s.index!;
  const fav = s.favorites.includes(refKey(r));
  const onMap = glyphFor(r);
  const flux = L.fluxResult(s);
  if (r.kind === 'metabolite') {
    const m = index.met.get(r.id);
    return (
      <>
        <div className="cm-title">{r.id}</div>
        {item('View details', () => lab.navigate(r))}
        {item('View reactions', () => lab.showInExplorer('reactions', index.metRxns.get(r.id) ?? [], `Connected to ${r.id}`))}
        {item('Add to a new reaction', () => newReactionWith(r.id))}
        <div className="cm-label">Create boundary reaction</div>
        {item('Create Exchange', () => openBoundary(r.id, 'exchange'))}
        {item('Create Sink', () => openBoundary(r.id, 'sink'))}
        {item('Create Demand', () => openBoundary(r.id, 'demand'))}
        <div className="cm-sep" />
        {item('Edit metabolite', () => openMetaboliteEditor(r.id))}
        {item('Duplicate…', () => duplicateMetabolite(r.id))}
        {item('Delete…', () => useLab.setState({ dialog: { kind: 'delete-metabolite', id: r.id } }))}
        <div className="cm-sep" />
        {item('Add to map', () => addMetabolitesToMap([r.id], false))}
        {onMap && item('Focus in map', () => focusInMap(r))}
        {item(fav ? 'Remove from favorites' : 'Add to favorites', () => lab.toggleFavorite(r))}
        <div className="cm-sep" />
        {item('Copy ID', () => copy(r.id, 'ID'))}
        {item('Copy name', () => copy(m?.name ?? r.id, 'name'), { disabled: !m?.name })}
        {item('Copy formula', () => copy(m?.formula ?? '', 'formula'), { disabled: !m?.formula })}
      </>
    );
  }
  if (r.kind === 'reaction') {
    const rx = index.rxn.get(r.id);
    const st = L.activeState(s);
    return (
      <>
        <div className="cm-title">{r.id}</div>
        {item('Inspect', () => lab.navigate(r))}
        {item('Edit reaction', () => openReactionEditor(r.id))}
        {item('Set as objective', () => lab.setObjectiveReaction(r.id))}
        {item('Edit bounds', () => lab.navigate(r))}
        {item('Block reaction', () => lab.blockReactions([r.id]))}
        {st.bounds[r.id] && item('Reset bounds to model file', () => lab.resetBounds([r.id]))}
        <div className="cm-sep" />
        {item('Add to map', () => addReactionsToMap([r.id], 'vertical'))}
        {onMap && item('Focus in map', () => focusInMap(r))}
        {item(fav ? 'Remove from favorites' : 'Add to favorites', () => lab.toggleFavorite(r))}
        {flux && <>
          <div className="cm-label">Simulation</div>
          {item('Show flux', () => lab.navigate(r))}
          {item('Show FVA (this reaction)', () => lab.simulate('fva', { reactions: [r.id] }))}
          {item('Compare with…', () => lab.setSection('compare'))}
          {item('Visualize on map', () => { addReactionsToMap([r.id], 'vertical', false); useLab.setState({ dialog: { kind: 'visualize-result', resultId: flux.id } }); })}
        </>}
        <div className="cm-sep" />
        {item('Duplicate…', () => duplicateReaction(r.id))}
        {item('Delete reaction…', () => useLab.setState({ dialog: { kind: 'delete-reaction', id: r.id } }))}
        <div className="cm-sep" />
        {item('Copy ID', () => copy(r.id, 'ID'))}
        {item('Copy equation', () => copy(rx?.equation ?? '', 'equation'))}
      </>
    );
  }
  if (r.kind === 'gene') {
    const g = index.gene.get(r.id);
    return (
      <>
        <div className="cm-title">{r.id}</div>
        {item('Inspect', () => lab.navigate(r))}
        {item('Associated reactions', () => lab.showInExplorer('reactions', g?.reactions ?? [], `Gene ${r.id}`))}
        {item('Add reactions to map', () => addReactionsToMap(g?.reactions ?? [], 'vertical'))}
        {item('Copy ID', () => copy(r.id, 'ID'))}
      </>
    );
  }
  const rids = index.subsystems.get(r.id) ?? [];
  return (
    <>
      <div className="cm-title">{r.id}</div>
      {item('Inspect', () => lab.navigate(r))}
      {item(`Add subsystem to map (${rids.length})`, () => addReactionsToMap(rids, 'hierarchical'))}
      {item('Filter table', () => useLab.setState((st) => ({ rxnFilters: { ...st.rxnFilters, subsystems: [r.id] }, explorerTab: 'reactions', section: 'explore' })))}
    </>
  );
}

function Multi({ refs, item }: { refs: EntityRef[]; item: ItemFn }) {
  const ids = refs.map((r) => r.id);
  const kind = refs[0].kind;
  const index = useLab.getState().index!;
  if (kind === 'metabolite') {
    return (
      <>
        <div className="cm-title">{refs.length} metabolites</div>
        {item(`Add ${refs.length} to map`, () => addMetabolitesToMap(ids))}
        {item('Connected reactions', () => lab.showInExplorer('reactions', Array.from(new Set(ids.flatMap((m) => index.metRxns.get(m) ?? []))), `Connected to ${ids.length} metabolites`))}
        {item('Filter to selection', () => lab.showInExplorer('metabolites', ids, `Selection (${ids.length})`))}
        {item('Clear selection', () => lab.clearSelection())}
      </>
    );
  }
  return (
    <>
      <div className="cm-title">{refs.length} reactions</div>
      {item(`Add ${refs.length} to map`, () => addReactionsToMap(ids))}
      {item(`Block ${refs.length}…`, () => useLab.setState({ dialog: { kind: 'confirm-block', rids: ids } }))}
      {item('Reset bounds', () => lab.resetBounds(ids))}
      {item('FVA on these', () => lab.simulate('fva', { reactions: ids }))}
      {item('Create filter from selection', () => lab.showInExplorer('reactions', ids, `Selection (${ids.length})`))}
      {item('Clear selection', () => lab.clearSelection())}
    </>
  );
}
