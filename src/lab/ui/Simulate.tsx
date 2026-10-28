import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../ui/icons';
import { fnum, METHOD_INFO, objectiveText, STATUS_LABEL } from '../format';
import { L, lab, useLab } from '../store';
import type { Method, SimulationResult } from '../types';
import { ErrorCard, InfoTip, SectionHead, StatusPill } from './common';
import { ObjectiveEditor } from './Objective';

const METHODS: Method[] = ['fba', 'pfba', 'loopless', 'fva', 'sampling'];

export function objectiveUnit(r: SimulationResult | null, names: (id: string) => string): string {
  const ids = Object.keys(r?.metadata.objective.coefficients ?? {});
  if (ids.length === 1 && /biomass|growth/i.test(`${ids[0]} ${names(ids[0])}`)) return 'h⁻¹';
  return '';
}

export function Simulate() {
  const model = useLab((s) => s.model)!;
  const states = useLab((s) => s.states);
  const st = useLab((s) => L.activeState(s));
  const method = useLab((s) => s.method);
  const params = useLab((s) => s.simParams);
  const running = useLab((s) => s.running);
  const editorOpen = useLab((s) => s.objectiveEditorOpen);
  const selection = useLab((s) => s.selection.reactions);
  const rxnFilters = useLab((s) => s.rxnFilters);
  const obj = L.objective(st);
  const nObj = Object.keys(obj.coefficients).length;
  const [subset, setSubset] = useState<'all' | 'selection'>('all');
  const mediumCount = useMemo(() => {
    let n = 0;
    for (const r of model.reactions) {
      if (r.type !== 'exchange') continue;
      if (L.uptakeOf(r, L.bounds(st, r)) > 0) n++;
    }
    return n;
  }, [model, st]);
  const bigFva = method === 'fva' && subset === 'all' && model.summary.reactions > 1200;
  const setP = (p: Partial<typeof params>) => useLab.setState((s) => ({ simParams: { ...s.simParams, ...p } }));
  const run = () => lab.simulate(method, { reactions: method === 'fva' && subset === 'selection' && selection.length ? selection : null });

  return (
    <div className="lab-page sim">
      <SectionHead title="Simulation" sub="COBRApy solves every method; the result keeps the exact state, medium and parameters used." />
      <div className="method-cards">
        {METHODS.map((m) => (
          <button key={m} className={`method-card ${method === m ? 'on' : ''}`} onClick={() => useLab.setState({ method: m })}>
            <div className="mc-title"><i className={`m-dot m-${m}`} />{METHOD_INFO[m].label}<InfoTip text={METHOD_INFO[m].more}>Learn more</InfoTip></div>
            <div className="mc-blurb">{METHOD_INFO[m].blurb}</div>
          </button>
        ))}
      </div>

      <div className="sim-config">
        <div className="sim-row">
          <span className="sim-k">Objective</span>
          <span className="mono grow">{objectiveText(obj)}</span>
          {st.objective && <span className="tag warn">changed</span>}
          <button className="btn small" onClick={() => useLab.setState({ objectiveEditorOpen: !editorOpen })}>{editorOpen ? 'Close' : 'Change objective'}</button>
        </div>
        {editorOpen && <div className="sim-editor"><ObjectiveEditor onDone={() => useLab.setState({ objectiveEditorOpen: false })} /></div>}
        <div className="sim-row">
          <span className="sim-k">Model state</span>
          <select className="input" value={st.id} onChange={(e) => lab.setActiveState(e.target.value)}>
            {states.map((s) => <option key={s.id} value={s.id}>{s.name}{s.changes.length ? ` · ${Object.keys(s.bounds).length} bound changes` : ''}</option>)}
          </select>
          <span className="muted small grow">{Object.keys(st.bounds).length ? `${Object.keys(st.bounds).length} reactions with modified bounds` : 'Unmodified model file'}</span>
          <button className="btn small" onClick={() => lab.duplicateState()}>Duplicate state</button>
        </div>
        <div className="sim-row">
          <span className="sim-k">Medium</span>
          <span className="grow">{mediumCount} compounds available{st.mediumLabel ? ` · ${st.mediumLabel}` : ''}</span>
          <button className="btn small" onClick={() => lab.setSection('medium')}>Configure medium</button>
        </div>
        <details className="adv sim-adv" open={method === 'sampling' || undefined} key={method === 'sampling' ? 'samp' : 'other'}>
          <summary>{method === 'sampling' ? 'Sampling options' : 'Advanced options'}</summary>
          <div className="sim-adv-grid">
            {(method === 'pfba' || method === 'fva') && (
              <label className="field"><span>Fraction of optimum <InfoTip text={method === 'pfba' ? 'pFBA keeps the objective ≥ this fraction of the optimum while minimizing total flux.' : 'FVA ranges are computed with the objective ≥ this fraction of the optimum.'} /></span>
                <input className="input tiny num" type="number" min={0} max={1} step={0.01} value={params.fractionOfOptimum} onChange={(e) => setP({ fractionOfOptimum: Math.min(1, Math.max(0, +e.target.value)) })} /></label>
            )}
            {method === 'fva' && (
              <>
                <label className="check"><input type="checkbox" checked={params.loopless} onChange={(e) => setP({ loopless: e.target.checked })} /> Loopless FVA (slower)</label>
                <label className="field"><span>Reactions</span>
                  <select className="input tiny" value={subset} onChange={(e) => setSubset(e.target.value as 'all' | 'selection')}>
                    <option value="all">All {model.summary.reactions} reactions</option>
                    <option value="selection" disabled={!selection.length}>Selected in explorer ({selection.length})</option>
                  </select></label>
                <label className="field"><span>pFBA factor <InfoTip text="Optional: also bound the total flux to ≤ factor × the pFBA minimum (≥ 1). Leave empty for standard FVA." /></span>
                  <input className="input tiny num" type="number" min={1} step={0.05} value={params.pfbaFactor ?? ''} placeholder="off" onChange={(e) => setP({ pfbaFactor: e.target.value === '' ? null : Math.max(1, +e.target.value) })} /></label>
                <label className="field"><span>Processes</span><input className="input tiny num" type="number" min={1} max={16} value={params.processes} onChange={(e) => setP({ processes: Math.max(1, +e.target.value | 0) })} /></label>
              </>
            )}
            {method === 'sampling' && (
              <>
                <label className="field"><span>Samples <InfoTip text="Number of flux vectors kept. Each sample costs `thinning` hit-and-run steps; a few hundred are enough for a first look." /></span>
                  <input className="input tiny num" type="number" min={1} max={20000} step={50} value={params.samples} onChange={(e) => setP({ samples: Math.max(1, Math.min(20000, +e.target.value | 0)) })} /></label>
                <label className="field"><span>Sampler <InfoTip text="OptGP (default) can use several processes. ACHR is single-process; both are COBRApy hit-and-run samplers." /></span>
                  <select className="input tiny" value={params.sampler} onChange={(e) => setP({ sampler: e.target.value as 'optgp' | 'achr' })}>
                    <option value="optgp">OptGP</option><option value="achr">ACHR</option>
                  </select></label>
                <label className="field"><span>Thinning <InfoTip text="Steps between two kept samples (COBRApy default 100). Larger values give less correlated samples and take longer." /></span>
                  <input className="input tiny num" type="number" min={1} max={10000} value={params.thinning} onChange={(e) => setP({ thinning: Math.max(1, Math.min(10000, +e.target.value | 0)) })} /></label>
                {params.sampler === 'optgp' && <label className="field"><span>Processes</span><input className="input tiny num" type="number" min={1} max={16} value={params.processes} onChange={(e) => setP({ processes: Math.max(1, +e.target.value | 0) })} /></label>}
                <label className="field"><span>Seed <InfoTip text="Fix it to get the same samples again (reproducible). Empty: random." /></span>
                  <input className="input tiny num" type="number" min={0} placeholder="any" title="Empty: a random seed" value={params.seed ?? ''} onChange={(e) => setP({ seed: e.target.value === '' ? null : Math.max(0, +e.target.value | 0) })} /></label>
                <label className="check" title="Sample only flux states that keep the objective above a fraction of its optimum (COBRApy fix_objective_as_constraint)">
                  <input type="checkbox" checked={params.objectiveFraction != null} onChange={(e) => setP({ objectiveFraction: e.target.checked ? 0.9 : null })} /> Keep objective ≥</label>
                {params.objectiveFraction != null && <input className="input tiny num" type="number" min={0} max={1} step={0.05} value={params.objectiveFraction} onChange={(e) => setP({ objectiveFraction: Math.min(1, Math.max(0, +e.target.value)) })} title="Fraction of the optimal objective" />}
                {params.objectiveFraction != null && <span className="muted small">× optimum</span>}
              </>
            )}
            {(method === 'fba' || method === 'loopless') && <span className="muted small">No extra parameters. The solver and tolerances come from COBRApy's configuration.</span>}
          </div>
          {Object.keys(rxnFilters).length > 0 && method === 'fva' && <div className="muted small">Tip: select the filtered rows in the explorer (header checkbox) to run FVA on just those.</div>}
        </details>
      </div>

      {method === 'sampling' && (
        <div className="note small">
          Sampling explores the whole space allowed by the constraints{params.objectiveFraction != null ? <> with the objective kept ≥ {params.objectiveFraction} × optimum</> : <> (the objective is not optimized unless you constrain it)</>}.
          Cost ≈ warmup ({model.summary.reactions * 2} LPs) + {params.samples.toLocaleString()} × {params.thinning} steps{model.summary.reactions > 1500 ? ' — on a model this size expect minutes; you can stop and keep the samples drawn so far' : ''}.
        </div>
      )}
      {bigFva && <div className="note small">FVA on {model.summary.reactions} reactions solves {model.summary.reactions * 2} LPs and can take a minute or more. For a quick look, select the reactions of interest in the explorer and run FVA on the selection.</div>}

      <div className="run-wrap">
        <button className="btn primary run-btn" disabled={!!running || !nObj} onClick={run}>
          {running ? <><span className="spinner" /> Running {METHOD_INFO[running.method].label}…</> : <><Icon name="play" size={13} /> Run {METHOD_INFO[method].label}</>}
        </button>
        {!nObj && <span className="warn-text small">Set an objective first.</span>}
      </div>
      <RunStatus />
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 100); return () => clearInterval(t); }, []);
  return <span className="mono">{((Date.now() - since) / 1000).toFixed(1)} s</span>;
}

export function RunStatus() {
  const running = useLab((s) => s.running);
  const last = useLab((s) => s.lastRun);
  const r = useLab((s) => L.result(s.lastRun?.resultId, s));
  if (running) return <RunningCard />;
  if (last?.cancelled) {
    return (
      <div className="run-status cancelled">
        <span><Icon name="stop" size={10} /> {METHOD_INFO[last.method ?? 'fba'].label} cancelled — nothing was saved.</span>
        {last.method !== 'fva' && <span className="muted small">A single solve cannot be interrupted inside the solver: it finishes in the background (a new run waits for it) and its answer is discarded.</span>}
      </div>
    );
  }
  if (last?.error) return <ErrorCard info={last.error} title="Simulation could not be completed" />;
  if (!r) return null;
  return <ResultStatusCard r={r} />;
}

function RunningCard() {
  const running = useLab((s) => s.running)!;
  const p = running.progress;
  const isFva = running.method === 'fva';
  const isSampling = running.method === 'sampling';
  const pct = p && p.total ? (p.done / p.total) * 100 : null;
  const label = METHOD_INFO[running.method].label;
  return (
    <div className="run-status running col">
      <div className="row gap">
        <span className="spinner" />
        <span className="grow">{running.stopping ? `Stopping ${label}…` : `Running ${label} on “${running.stateName}”…`} <Elapsed since={running.startedAt} /></span>
        {!running.stopping && <>
          {(isFva || isSampling) && p && p.done > 0 && (
            <button className="btn small" onClick={() => lab.cancelRun(true)} title={isSampling ? 'Stop after the current batch and keep the samples drawn so far, as a result marked “stopped at”' : 'Stop after the current chunk and save the intervals already computed, as a result marked “stopped at”'}>
              Stop & keep {p.done}
            </button>
          )}
          <button className="btn small danger" onClick={() => lab.cancelRun()} title="Stop and discard"><Icon name="stop" size={10} /> Stop</button>
        </>}
      </div>
      {isFva && (
        <div className="run-progress">
          <div className="rp-track"><span style={{ width: `${pct ?? 0}%` }} /></div>
          <span className="mono small muted">{p ? `${p.done.toLocaleString()} / ${p.total.toLocaleString()} reactions` : 'computing the optimum…'}</span>
        </div>
      )}
      {isSampling && (
        <div className="run-progress">
          <div className="rp-track"><span style={{ width: `${p?.phase === 'sampling' ? pct ?? 0 : 0}%` }} /></div>
          <span className="mono small muted">{!p || p.phase === 'warmup' || p.phase === 'solving' || p.phase === 'queued' ? 'warmup: extreme points of the flux space (one LP pair per reaction)…' : `${p.done.toLocaleString()} / ${p.total.toLocaleString()} samples`}</span>
        </div>
      )}
    </div>
  );
}

export function ResultStatusCard({ r }: { r: SimulationResult }) {
  const index = useLab((s) => s.index)!;
  const ok = r.solverStatus === 'optimal';
  const unit = objectiveUnit(r, (id) => index.rxn.get(id)?.name ?? '');
  if (!ok) {
    return (
      <div className="error-card">
        <div className="row gap"><StatusPill status={r.solverStatus} /><span className="ec-title">Model {STATUS_LABEL[r.solverStatus].toLowerCase()} — no flux distribution</span></div>
        <div className="ec-msg">“{r.name}”: the solver returned <b>{r.metadata.solverStatusRaw}</b>. No fluxes are shown — they are not zero, they do not exist for this problem.</div>
        {r.diagnostics.length > 0 && <div className="ec-hints"><div className="muted small">Possible areas to inspect:</div><ul>{r.diagnostics.map((d, i) => <li key={i}>{d}</li>)}</ul></div>}
        <div className="row gap">
          <button className="btn small" onClick={() => lab.setSection('medium')}>Medium</button>
          <button className="btn small" onClick={() => { lab.setSection('simulate'); useLab.setState({ objectiveEditorOpen: true }); }}>Objective</button>
          <button className="btn small" onClick={() => useLab.setState({ rxnFilters: { modifiedOnly: true }, explorerTab: 'reactions', section: 'explore' })}>Modified bounds</button>
          {r.metadata.message && <details className="ec-details"><summary>Show details</summary><pre>{r.metadata.message}</pre></details>}
        </div>
      </div>
    );
  }
  const nActive = r.reactionFluxes ? Object.values(r.reactionFluxes).filter((v) => !L.isZero(v)).length : null;
  return (
    <div className="run-status ok">
      <div className="rs-grid">
        <div><span>Status</span><StatusPill status={r.solverStatus} /></div>
        <div><span>Objective</span><b className="mono">{fnum(r.objectiveValue)} {unit}</b></div>
        {r.metadata.totalFlux != null && <div><span>Total flux (pFBA)</span><b className="mono">{fnum(r.metadata.totalFlux)}</b></div>}
        {nActive != null && <div><span>Active reactions</span><b className="mono">{nActive} / {Object.keys(r.reactionFluxes!).length}</b></div>}
        {r.samples && r.metadata.sampling && <div><span>Samples</span><b className="mono">{r.metadata.sampling.n}{r.metadata.partial ? ` of ${r.metadata.partial.total}` : ''}</b>{r.metadata.sampling.invalid > 0 && <span className="tag warn" title="Failed COBRApy's validation (bounds or mass balance) and were dropped">{r.metadata.sampling.invalid} invalid</span>}{r.metadata.partial && <span className="tag warn">stopped early</span>}</div>}
        {r.fva && <div><span>FVA reactions</span><b className="mono">{Object.keys(r.fva).length}{r.metadata.partial ? ` of ${r.metadata.partial.total}` : ''}</b>{r.metadata.partial && <span className="tag warn">stopped early</span>}</div>}
        <div><span>Solver</span><b>{r.metadata.solver}</b></div>
        <div><span>Time</span><b className="mono">{r.metadata.elapsedSeconds.toFixed(2)} s</b></div>
      </div>
      <div className="row gap wrap">
        <b className="grow ellipsis">{r.name}</b>
        <button className="btn small" onClick={() => lab.setSection('results')}>Open result</button>
        {r.reactionFluxes && <button className="btn small" onClick={() => { useLab.setState((s) => ({ sort: { ...s.sort, reactions: { key: 'absFlux', dir: 'desc' } }, hideZero: true, explorerTab: 'reactions', section: 'explore', rxnFilters: {} })); }}>Sort reactions by |flux|</button>}
        <button className="btn small primary" onClick={() => useLab.setState({ dialog: { kind: 'visualize-result', resultId: r.id } })}>Visualize result</button>
      </div>
    </div>
  );
}
