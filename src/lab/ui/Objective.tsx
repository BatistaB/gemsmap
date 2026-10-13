import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../ui/icons';
import { fnum } from '../format';
import { L, lab, useLab } from '../store';
import type { Objective } from '../types';
import { ELink, NumberInput, Seg } from './common';

/** Interactive objective editor: search reactions, set weights, choose direction. Raw text is secondary. */
export function ObjectiveEditor({ onDone }: { onDone?: () => void }) {
  const st = useLab((s) => L.activeState(s));
  const index = useLab((s) => s.index)!;
  const search = useLab((s) => s.searchIndex)!;
  const modelObj = useLab((s) => s.model!.summary.objective);
  const current = L.objective(st);
  const [terms, setTerms] = useState<[string, number][]>(Object.entries(current.coefficients));
  const [dir, setDir] = useState<Objective['direction']>(current.direction);
  const [q, setQ] = useState('');
  const [raw, setRaw] = useState<string | null>(null);
  const [rawErr, setRawErr] = useState<string | null>(null);
  useEffect(() => { setTerms(Object.entries(current.coefficients)); setDir(current.direction); }, [st.id, JSON.stringify(current)]); // eslint-disable-line react-hooks/exhaustive-deps
  const hits = useMemo(() => (q.trim() ? search.search(q, ['reaction'], 8) : []), [q, search]);
  const draft: Objective = { coefficients: Object.fromEntries(terms.filter(([, w]) => w !== 0)), direction: dir };
  const changed = JSON.stringify(draft) !== JSON.stringify(current);
  const preview = terms.length ? terms.map(([id, w], i) => `${i && w >= 0 ? '+ ' : w < 0 ? '− ' : ''}${fnum(Math.abs(w), 3)} × ${id}`).join(' ') : '—';

  const parseRaw = (text: string) => {
    const out: [string, number][] = [];
    for (const part of text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
      const [id, c = '1'] = part.split(':').map((x) => x.trim());
      if (!index.rxn.has(id)) return setRawErr(`Unknown reaction “${id}”`);
      const v = Number(c);
      if (!Number.isFinite(v)) return setRawErr(`Invalid coefficient for ${id}: “${c}”`);
      out.push([id, v]);
    }
    setRawErr(null);
    setTerms(out);
  };

  return (
    <div className="objective-editor">
      <div className="row between">
        <span className="insp-sub">Objective</span>
        <Seg value={dir} options={['max', 'min'] as const} onChange={setDir} labels={{ max: 'Maximize', min: 'Minimize' }} />
      </div>
      <div className="obj-terms">
        {terms.map(([id, w], i) => (
          <div key={id} className="obj-term">
            <NumberInput value={w} onCommit={(v) => setTerms(terms.map((t, j) => (j === i ? [t[0], v ?? 0] : t)))} className="obj-w" title="Weight" />
            <span className="muted">×</span>
            <div className="grow"><ELink r={{ kind: 'reaction', id }}>{id}</ELink><div className="muted small ellipsis">{index.rxn.get(id)?.name}</div></div>
            <button className="icon-btn tiny" title="Remove" onClick={() => setTerms(terms.filter((_, j) => j !== i))}><Icon name="x" size={11} /></button>
          </div>
        ))}
        {!terms.length && <div className="muted small">No objective — add a reaction below.</div>}
      </div>
      <div className="obj-add">
        <div className="search-box"><Icon name="plus" size={13} /><input placeholder="Add reaction: search id, name, e.g. biomass…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {hits.length > 0 && (
          <div className="obj-hits">
            {hits.map((h) => (
              <button key={h.id} disabled={terms.some(([id]) => id === h.id)} onClick={() => { setTerms([...terms, [h.id, 1]]); setQ(''); }}>
                <span className="mono strong">{h.id}</span><span className="muted small ellipsis">{h.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="obj-preview"><span className="muted small">Objective:</span> <span className="mono">{dir === 'max' ? 'maximize' : 'minimize'} {preview}</span></div>
      <details className="adv" open={raw != null} onToggle={(e) => setRaw((e.target as HTMLDetailsElement).open ? terms.map(([id, w]) => `${id}:${w}`).join(', ') : null)}>
        <summary>Advanced: edit as text</summary>
        <textarea className="input mono" value={raw ?? ''} onChange={(e) => setRaw(e.target.value)} placeholder="BIOMASS:1, EX_product_e:0.2" />
        <div className="row gap"><button className="btn small" onClick={() => raw != null && parseRaw(raw)}>Parse</button>{rawErr && <span className="small warn-text">{rawErr}</span>}</div>
      </details>
      <div className="row gap end">
        {st.objective && <button className="btn small" onClick={() => { lab.setObjective(null); onDone?.(); }} title={`Model file objective: ${Object.keys(modelObj.coefficients).join(', ')}`}>Reset to model objective</button>}
        <button className="btn small primary" disabled={!changed || !terms.length} onClick={() => { lab.setObjective(draft); onDone?.(); }}>Apply objective</button>
      </div>
    </div>
  );
}
