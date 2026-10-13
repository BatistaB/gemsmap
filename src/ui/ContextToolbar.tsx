import { useState } from 'react';
import { legendPos, plotAnchorApprox } from '../store/project';
import { A, parseKey, useStore } from '../store/store';
import type { PlotType } from '../viz/types';
import { Icon } from './icons';

function Btn({ icon, title, onClick, label }: { icon: string; title: string; onClick: () => void; label?: string }) {
  return (
    <button className="ctx-btn" title={title} onClick={onClick}>
      <Icon name={icon} size={15} />
      {label && <span>{label}</span>}
    </button>
  );
}

const Sep = () => <span className="ctx-sep" />;

/** Floating, selection-aware actions (the Figma-like contextual UI). */
export function ContextToolbar() {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const camera = useStore((s) => s.camera);
  const model = useStore((s) => s.model);
  const [menu, setMenu] = useState<null | 'align' | 'plot'>(null);
  if (!selection.length) return null;

  const a = A();
  const kinds = selection.map((k) => parseKey(k)[0]);
  const nodeIds = a.selectedNodeIds();
  const nodes = nodeIds.map((id) => doc.nodes[id]).filter(Boolean);
  const reactions = selection.filter((k) => k.startsWith('reaction:')).map((k) => doc.reactions[parseKey(k)[1]]).filter(Boolean);
  const onlyNodes = kinds.every((k) => k === 'node');

  // position above the selection bbox
  let pts = nodes.map((n) => ({ x: n.x, y: n.y }));
  if (!pts.length) {
    for (const k of selection) {
      const [kind, id] = parseKey(k);
      if (kind === 'text' && doc.texts[id]) pts.push({ x: doc.texts[id].x, y: doc.texts[id].y - 14 });
      if (kind === 'legend') pts.push(legendPos(doc));
      if (kind === 'plot' && doc.plots[id]) { const an = plotAnchorApprox(doc, doc.plots[id].anchor); if (an) pts.push({ x: an.x + doc.plots[id].dx + doc.plots[id].w / 2, y: an.y + doc.plots[id].dy }); }
    }
  }
  if (!pts.length) return null;
  const x = ((Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2) * camera.k + camera.x;
  const y = Math.min(...pts.map((p) => p.y)) * camera.k + camera.y - 46;

  const single = selection.length === 1;
  const singleNode = single && kinds[0] === 'node' ? doc.nodes[parseKey(selection[0])[1]] : null;
  const singleRxn = single && kinds[0] === 'reaction' ? reactions[0] : null;
  const routable = (g: { sources: string[]; targets: string[] }) => {
    const s = doc.nodes[g.sources[0]]?.metaboliteId, t = doc.nodes[g.targets[0]]?.metaboliteId;
    return !!model && !!s && !!t && !!model.metabolites[s] && !!model.metabolites[t];
  };
  const twoBound =onlyNodes && nodes.length === 2 && nodes.every((n) => n.metaboliteId) && !!model;

  const plotMenu = () => (
    <div className="ctx-menu">
      {(['density', 'bar', 'line', 'heatmap', 'box', 'range'] as PlotType[]).map((t) => (
        <button key={t} onClick={() => { a.addPlotsForSelection(t); setMenu(null); }}>{t === 'range' ? 'FVA / range' : t[0].toUpperCase() + t.slice(1)}</button>
      ))}
    </div>
  );

  return (
    <div className="ctx-toolbar" style={{ left: Math.max(8, x), top: Math.max(8, y) }} onPointerDown={(e) => e.stopPropagation()}>
      {singleNode && (
        <>
          {model && <Btn icon="link" title="Bind to model metabolite (double-click)" label={singleNode.metaboliteId ? 'Rebind' : 'Bind'} onClick={() => useStore.setState({ dialog: { kind: 'metabolite', at: singleNode, bindNodeId: singleNode.id } })} />}
          {model && singleNode.metaboliteId && (
            <>
              <Btn icon="expandUp" title="Expand 1 reaction upstream" onClick={() => a.expandNode(singleNode.id, 'up', 1)} />
              <Btn icon="expandDown" title="Expand 1 reaction downstream" onClick={() => a.expandNode(singleNode.id, 'down', 1)} />
            </>
          )}
          <Btn icon="plot" title="Add plot for this metabolite" onClick={() => a.addPlot({ kind: 'node', id: singleNode.id }, 'bar')} />
        </>
      )}
      {singleRxn && (
        <>
          <div className="ctx-wrap">
            <Btn icon="plot" title="Add linked mini-plot (P)" label="Plot" onClick={() => setMenu(menu === 'plot' ? null : 'plot')} />
            {menu === 'plot' && plotMenu()}
          </div>
          <Btn icon="swap" title="Reverse drawn direction" onClick={() => a.reverseReaction(singleRxn.id)} />
          <Btn icon="curve" title="Straight / curved / orthogonal" onClick={() => a.updateReaction(singleRxn.id, { routing: singleRxn.routing === 'straight' ? 'curved' : singleRxn.routing === 'curved' ? 'orthogonal' : 'straight', bend: undefined })} />
          {singleRxn.collapsed && <Btn icon="expandDown" title="Expand the hidden reactions" label="Expand" onClick={() => a.expandGlyph(singleRxn.id)} />}
          {!singleRxn.collapsed && routable(singleRxn) && (
            <Btn icon="path" title="Find routes between these two metabolites in the model" label={singleRxn.reactionId ? 'Routes' : 'Find routes'} onClick={() => useStore.setState({ dialog: { kind: 'routes', from: singleRxn.sources[0], to: singleRxn.targets[0], replaceGlyph: singleRxn.id } })} />
          )}
        </>
      )}
      {!single && reactions.length > 1 && !onlyNodes && (
        <>
          <div className="ctx-wrap">
            <Btn icon="plot" title="Add a plot to every selected reaction" label="Plots" onClick={() => setMenu(menu === 'plot' ? null : 'plot')} />
            {menu === 'plot' && plotMenu()}
          </div>
          <Btn icon="group" title="Collapse the selected arrows into one summary arrow (expandable)" label="Collapse" onClick={() => a.collapseSelection()} />
        </>
      )}
      {onlyNodes && nodes.length === 2 && (
        <Btn icon="group" title="Collapse everything drawn between these two metabolites into one arrow" label="Collapse between" onClick={() => a.collapseSelection()} />
      )}
      {nodes.length >= 2 && !singleRxn && (
        <>
          {!single && <Sep />}
          <Btn icon="vertical" title="Vertical pathway" onClick={() => a.layoutSelection('vertical')} />
          <Btn icon="horizontal" title="Horizontal pathway" onClick={() => a.layoutSelection('horizontal')} />
          <Btn icon="circle" title="Circular (cycles: TCA, urea…)" onClick={() => a.layoutSelection('circle')} />
          <Btn icon="hier" title="Hierarchical" onClick={() => a.layoutSelection('hierarchical')} />
          <Btn icon="gridLayout" title="Grid" onClick={() => a.layoutSelection('grid')} />
          <Btn icon="organic" title="Organic (force-directed)" onClick={() => a.layoutSelection('organic')} />
          <Sep />
          <div className="ctx-wrap">
            <Btn icon="alignLeft" title="Align & distribute" onClick={() => setMenu(menu === 'align' ? null : 'align')} />
            {menu === 'align' && (
              <div className="ctx-menu grid3">
                <button title="Align left" onClick={() => a.alignSelection('left')}><Icon name="alignLeft" /></button>
                <button title="Align centre (vertical axis)" onClick={() => a.alignSelection('centerX')}><Icon name="alignCX" /></button>
                <button title="Align right" onClick={() => a.alignSelection('right')}><Icon name="alignRight" /></button>
                <button title="Align top" onClick={() => a.alignSelection('top')}><Icon name="alignTop" /></button>
                <button title="Align middle (horizontal axis)" onClick={() => a.alignSelection('centerY')}><Icon name="alignCY" /></button>
                <button title="Align bottom" onClick={() => a.alignSelection('bottom')}><Icon name="alignBottom" /></button>
                <button title="Distribute horizontally" onClick={() => a.distributeSelection('x')}><Icon name="distH" /></button>
                <button title="Distribute vertically" onClick={() => a.distributeSelection('y')}><Icon name="distV" /></button>
                <button title="Equal spacing (layout spacing)" onClick={() => { const n = nodes; const vx = Math.max(...n.map((q) => q.x)) - Math.min(...n.map((q) => q.x)); const vy = Math.max(...n.map((q) => q.y)) - Math.min(...n.map((q) => q.y)); a.distributeSelection(vx > vy ? 'x' : 'y', true); }}><Icon name="tidy" /></button>
              </div>
            )}
          </div>
          <Btn icon="tidy" title="Tidy selection (auto-detect row / column / ring)" label="Tidy" onClick={() => a.tidySelection()} />
          <Btn icon="group" title="Group as pathway (Ctrl+G)" onClick={() => a.groupSelection('pathway')} />
          <Btn icon="template" title="Save selection as reusable template" onClick={() => useStore.setState({ dialog: { kind: 'saveTemplate' } })} />
          {twoBound && <Btn icon="path" title="Find shortest metabolic path between these two" label="Path" onClick={() => a.findPath(nodes[0].metaboliteId!, nodes[1].metaboliteId!)} />}
        </>
      )}
      <Sep />
      <Btn icon="lock" title="Lock: skip in clicks and box selection (L). Hold 3 s to unlock." onClick={() => a.toggleLock()} />
      <Btn icon="trash" title="Delete (Del)" onClick={() => a.deleteSelection()} />
    </div>
  );
}
