import { A, parseKey, useStore } from '../store/store';

function Item({ label, onClick, hint, disabled }: { label: string; onClick: () => void; hint?: string; disabled?: boolean }) {
  return (
    <button className="cm-item" disabled={disabled} onClick={() => { useStore.setState({ contextMenu: null }); onClick(); }}>
      <span>{label}</span>{hint && <kbd>{hint}</kbd>}
    </button>
  );
}

export function ContextMenu() {
  const cm = useStore((s) => s.contextMenu);
  const doc = useStore((s) => s.doc);
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  if (!cm) return null;
  const a = A();
  const [kind, id] = cm.target ? parseKey(cm.target) : [null, null];
  const node = kind === 'node' && id ? doc.nodes[id] : null;
  const rxn = kind === 'reaction' && id ? doc.reactions[id] : null;
  const bound = !!(node?.metaboliteId && model?.metabolites[node.metaboliteId]);
  if (cm.target && a.isLocked(cm.target)) {
    return (
      <div className="context-menu" style={{ left: cm.x, top: cm.y }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="cm-title">Locked {kind}</div>
        <Item label="Unlock" onClick={() => a.unlock(cm.target!)} />
        <div className="cm-label">Tip: hold the mouse 3 s on it to unlock</div>
      </div>
    );
  }

  return (
    <div className="context-menu" style={{ left: cm.x, top: cm.y }} onPointerDown={(e) => e.stopPropagation()}>
      {node && (
        <>
          <div className="cm-title">{node.metaboliteId ?? node.label ?? 'slot'}</div>
          {node.template && model && (
            <>
              <div className="cm-label">Template mapping</div>
              <Item label="Change mapping / view evidence" onClick={() => useStore.setState({ selection: [`node:${node.id}`], rightOpen: true })} />
              {node.metaboliteId && <Item label="Clear mapping" onClick={() => a.setTemplateMapping(node.id, undefined)} />}
              {node.template.status === 'provisional' && node.metaboliteId && <Item label="Confirm mapping" onClick={() => a.setTemplateMapping(node.id, node.metaboliteId)} />}
              <div className="cm-sep" />
            </>
          )}
          {model && <Item label={bound ? 'Rebind metabolite…' : 'Bind to model metabolite…'} onClick={() => useStore.setState({ dialog: { kind: 'metabolite', at: node, bindNodeId: node.id } })} />}
          {bound && <div className="cm-sep" />}
          {bound && (
            <>
              <div className="cm-label">Expand network</div>
              <Item label="↑ 1 reaction upstream" onClick={() => a.expandNode(node.id, 'up', 1)} />
              <Item label="↑ 2 reactions upstream" onClick={() => a.expandNode(node.id, 'up', 2)} />
              <Item label="↓ 1 reaction downstream" onClick={() => a.expandNode(node.id, 'down', 1)} />
              <Item label="↓ 2 reactions downstream" onClick={() => a.expandNode(node.id, 'down', 2)} />
              <Item label="↓ 5 reactions downstream" onClick={() => a.expandNode(node.id, 'down', 5)} />
              <Item label="Find path to…" onClick={() => useStore.setState({ dialog: { kind: 'path' } })} />
            </>
          )}
          <div className="cm-sep" />
          <Item label="Add bar plot" onClick={() => a.addPlot({ kind: 'node', id: node.id }, 'bar')} />
        </>
      )}
      {rxn && (
        <>
          <div className="cm-title">{rxn.reactionId ?? rxn.label ?? 'reaction'}</div>
          <div className="cm-label">Add linked plot</div>
          {(['density', 'bar', 'line', 'heatmap', 'box', 'range'] as const).map((t) => <Item key={t} label={t === 'range' ? 'FVA / range' : t[0].toUpperCase() + t.slice(1)} onClick={() => a.addPlot({ kind: 'reaction', id: rxn.id }, t)} />)}
          <div className="cm-sep" />
          <Item label="Reverse drawn direction" onClick={() => a.reverseReaction(rxn.id)} />
          <Item label="Straight" onClick={() => a.updateReaction(rxn.id, { routing: 'straight', bend: undefined })} />
          <Item label="Curved" onClick={() => a.updateReaction(rxn.id, { routing: 'curved', bend: undefined })} />
          <Item label="Orthogonal" onClick={() => a.updateReaction(rxn.id, { routing: 'orthogonal', bend: undefined })} />
          <Item label="Flip label side" onClick={() => a.updateReaction(rxn.id, { labelFlip: !rxn.labelFlip })} />
          <div className="cm-sep" />
          {rxn.collapsed
            ? <Item label={`Expand ${rxn.collapsed.members.length} hidden reactions`} onClick={() => a.expandGlyph(rxn.id)} />
            : <Item label={selection.length > 1 ? 'Collapse selection into one arrow' : 'Collapse into summary arrow'} onClick={() => a.collapseSelection()} />}
          {model && !rxn.collapsed && doc.nodes[rxn.sources[0]]?.metaboliteId && doc.nodes[rxn.targets[0]]?.metaboliteId && (
            <Item label="Find routes in the model…" onClick={() => useStore.setState({ dialog: { kind: 'routes', from: rxn.sources[0], to: rxn.targets[0], replaceGlyph: rxn.id } })} />
          )}
          {rxn.reactionId && Object.values(doc.reactions).filter((o) => o.reactionId === rxn.reactionId).length > 1 && (
            <Item label={`Merge duplicate ${rxn.reactionId} arrows`} onClick={() => a.mergeDuplicates(rxn.reactionId!)} />
          )}
        </>
      )}
      {!cm.target && (
        <>
          <Item label="Add metabolite here" onClick={() => (model ? useStore.setState({ dialog: { kind: 'metabolite', at: cm.world } }) : a.addNode(cm.world, { label: 'M' }))} />
          <Item label="Add empty slot here" hint="S" onClick={() => a.addNode(cm.world, { label: `M${Object.keys(doc.nodes).length + 1}` })} />
          <Item label="Add text here" hint="T" onClick={() => a.addText(cm.world)} />
          <Item label="Add panel label" onClick={() => a.addText(cm.world, { text: 'b', size: 22, weight: 700, kind: 'panel' })} />
          <Item label="Paste" hint="Ctrl V" onClick={() => a.paste(0)} />
          <div className="cm-sep" />
          <Item label="Fit all" hint="F" onClick={() => a.fitAll()} />
        </>
      )}
      {selection.length > 1 && (
        <>
          <div className="cm-sep" />
          <Item label="Group as pathway" hint="Ctrl G" onClick={() => a.groupSelection('pathway')} />
          {!rxn && <Item label={selection.length === 2 ? 'Collapse everything between these two' : 'Collapse arrows into one'} onClick={() => a.collapseSelection()} />}
          <Item label="Group as compartment" onClick={() => a.groupSelection('compartment')} />
          <Item label="Save as template…" onClick={() => useStore.setState({ dialog: { kind: 'saveTemplate' } })} />
        </>
      )}
      {cm.target && (
        <>
          <div className="cm-sep" />
          <Item label="Lock (skip in selection)" hint="L" onClick={() => a.toggleLock()} />
          <Item label="Duplicate" hint="Ctrl D" onClick={() => a.duplicate()} />
          <Item label="Delete" hint="Del" onClick={() => a.deleteSelection()} />
        </>
      )}
    </div>
  );
}
