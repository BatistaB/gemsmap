/**
 * Header indicator of structural edits: "Edited · n" when the working model differs from the imported
 * file, with the list of model changes, undo / redo, validation, export and the model patch.
 */
import { Icon } from '../../../ui/icons';
import { edits, historyOf } from '../../edits';
import { uniqueId } from '../../editUtils';
import { uid, useLab } from '../../store';
import { Popover } from '../common';
import { draftFrom } from './ReactionEditor';
import { openMetaboliteEditor, openReactionEditor } from './EditDialogs';

const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function EditsMenu() {
  const model = useLab((s) => s.model)!;
  const h = historyOf(model);
  const n = h?.count ?? 0;
  return (
    <Popover align="right" className="changes-pop edits-pop" trigger={(o, t) => (
      <button className={`mod-btn ${n ? 'mod edited' : ''} ${o ? 'on' : ''}`} onClick={t} title={n ? 'The working model differs from the imported file' : 'Structure: reactions, metabolites, boundary reactions'}>
        {n ? <><Icon name="tidy" size={11} /> Edited · {n}{h?.dirty && <span className="dirty-dot" title="Not exported to a file yet">●</span>}</> : <span className="muted"><Icon name="tidy" size={11} /> Structure</span>}
      </button>
    )}>
      {(close) => (
        <div className="changes">
          <div className="row between"><b>Model changes · {model.filename}</b><span className="muted small">{n} edit{n === 1 ? '' : 's'}</span></div>
          <div className="muted small">{n
            ? <>Simulations, the medium and exports use the edited model. Edits are kept in COBRAGUI and re-applied when this model is opened again{h?.dirty ? '; they are not in any file yet.' : '; the last export includes them.'}</>
            : 'The model is the imported file. Add or edit reactions and metabolites from the explorer, the inspector or the right-click menu.'}</div>
          <div className="row gap wrap">
            <button className="btn small" onClick={() => { close(); openReactionEditor(); }}><Icon name="plus" size={11} /> Reaction</button>
            <button className="btn small" onClick={() => { close(); openMetaboliteEditor(); }}><Icon name="plus" size={11} /> Metabolite</button>
            <button className="btn small" onClick={() => { close(); useLab.setState({ dialog: { kind: 'validate-model' } }); }}>Validate model</button>
          </div>
          {h?.loadErrors.length ? <div className="ed-msg warn"><span>⚠</span>{h.loadErrors.join(' ')}</div> : null}
          {n > 0 && (
            <>
              <div className="row gap">
                <button className="btn small" onClick={() => { moveOrder('undo'); edits.undo(); }} title="Ctrl+Z walks back model edits and state changes in the order they were made">Undo: {h!.items[n - 1]?.label.slice(0, 40)}</button>
                {h!.redo.length > 0 && <button className="btn small" onClick={() => { moveOrder('redo'); edits.redo(); }}>Redo</button>}
              </div>
              <div className="change-list">
                {[...h!.items].reverse().map((c) => (
                  <details key={c.id} className="change">
                    <summary className="row between"><span className="small">{c.label}</span><span className="muted small">{hhmm(c.time)}</span></summary>
                    {(c.details ?? []).map((x, i) => <div key={i} className="mono small">{x}</div>)}
                  </details>
                ))}
              </div>
              <div className="row gap wrap">
                <button className="btn small primary" onClick={() => { close(); useLab.setState({ dialog: { kind: 'export-model' } }); }}>Export model…</button>
                <button className="btn small" onClick={() => edits.exportPatch()} title="model_patch.json: the edits and their net effect (added / removed / changed), to document or reproduce them">Export patch</button>
                <span className="grow" />
                <button className="btn small danger" onClick={() => { if (window.confirm(`Revert all ${n} structural edits? The model becomes the imported file again.`)) { close(); edits.discard(); } }}>Discard all</button>
              </div>
            </>
          )}
          {!n && h?.redo.length ? <button className="btn small" onClick={() => { moveOrder('redo'); edits.redo(); }}>Redo: {h.redo[0].label}</button> : null}
        </div>
      )}
    </Popover>
  );
}

export function duplicateReaction(id: string) {
  const s = useLab.getState();
  const r = s.index?.rxn.get(id);
  if (!r || !s.model) return;
  const d = draftFrom(r, s.model, s.index!);
  openReactionEditor(undefined, { ...d, id: uniqueId(`${id}_copy`, (x) => s.index!.rxn.has(x)), name: d.name ? `${d.name} (copy)` : '' });
}

export function duplicateMetabolite(id: string) {
  const m = useLab.getState().index?.met.get(id);
  if (!m) return;
  openMetaboliteEditor(undefined, { name: m.name, compartment: m.compartment, formula: m.formula ?? '', charge: m.charge, annotation: m.annotation });
}

export function newReactionWith(met: string, side: 'reactant' | 'product' = 'reactant') {
  const m = useLab.getState().index?.met.get(met);
  openReactionEditor(undefined, { rows: [{ key: uid('row'), met, amount: 1, side }], ...(m ? { compartment: m.compartment } : {}) });
}


/** Keep Ctrl+Z's order in step when the menu undoes / redoes a model edit directly. */
function moveOrder(dir: 'undo' | 'redo') {
  useLab.setState((s) => {
    const from = dir === 'undo' ? s.undoOrder : s.redoOrder;
    const i = from.lastIndexOf('model');
    const rest = i < 0 ? from : [...from.slice(0, i), ...from.slice(i + 1)];
    return dir === 'undo' ? { undoOrder: rest, redoOrder: [...s.redoOrder, 'model' as const] } : { redoOrder: rest, undoOrder: [...s.undoOrder, 'model' as const] };
  });
}
