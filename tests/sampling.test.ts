/**
 * Flux sampling results from COBRAGUI in the Map Builder: a samples dataset (one column per result) with
 * the sample arrays per reaction — what density and box plots read — and the mean as the mapped value.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importResultsToMap } from '../src/lab/bridge';
import { parseResultJson } from '../src/lab/resultFiles';
import type { SimulationResult } from '../src/lab/types';
import { emptyDoc } from '../src/store/project';
import { useStore } from '../src/store/store';

const result = (): SimulationResult => ({
  format: 'cobragui-result', id: 'smp1', name: 'Sampling WT', modelId: 'm', modelStateId: null, method: 'sampling', solverStatus: 'optimal',
  objectiveValue: 0.42, reactionFluxes: null, fva: null, metaboliteTurnover: null, exchanges: null, diagnostics: [],
  samples: {
    reactions: { PGI: [1, 2, 3, 4], PFK: [5, 6, 7, 8] },
    constant: { ATPM: 8.39 },
    summary: {
      PGI: { mean: 2.5, sd: 1.29, median: 2.5, q025: 1.075, q25: 1.75, q75: 3.25, q975: 3.925, min: 1, max: 4 },
      PFK: { mean: 6.5, sd: 1.29, median: 6.5, q025: 5.075, q25: 5.75, q75: 7.25, q975: 7.925, min: 5, max: 8 },
      ATPM: { mean: 8.39, sd: 0, median: 8.39, q025: 8.39, q25: 8.39, q75: 8.39, q975: 8.39, min: 8.39, max: 8.39 },
    },
  },
  metadata: {
    model: { id: 'm', modelId: 'e_coli_core', name: '', filename: 'textbook.json', checksum: '', format: 'json' }, state: { id: null, name: 'WT' },
    method: 'sampling', methodLabel: 'Flux sampling', solver: 'GLPK', cobraVersion: '0.32.1', objective: { coefficients: {}, direction: 'max' },
    objectiveIsModelDefault: true, medium: {}, boundChanges: [], parameters: { samples: 4 }, timestamp: '2026-10-28T10:00:00Z', elapsedSeconds: 0.1,
    solverStatusRaw: 'optimal', message: null, tolerance: null, sampling: { n: 4, drawn: 4, invalid: 0, warmupSeconds: 0.1, variable: 2, constant: 1 },
  },
} as SimulationResult);

test('a sampling result becomes a samples dataset in the Map Builder', () => {
  useStore.setState({ doc: emptyDoc(), datasets: [], conditions: [], mappings: [], model: null, past: [], future: [] });
  importResultsToMap([result()], 'sampling.json');
  const ds = useStore.getState().datasets.find((d) => d.kind === 'samples');
  assert.ok(ds, 'samples dataset created');
  const col = ds!.columns.indexOf(ds!.columns[0]);
  assert.deepEqual(ds!.samples!.PGI[col], [1, 2, 3, 4]);
  assert.deepEqual(ds!.samples!.ATPM[col], [8.39, 8.39, 8.39, 8.39]); // a constant reaction: its value in every sample
  assert.equal(ds!.values.PFK[col], 6.5); // mapped value = mean, as for a samples CSV
  assert.equal(useStore.getState().conditions.length, 1);
});

test('exported sampling JSON reads back with its samples', () => {
  const { results } = parseResultJson('s.json', JSON.stringify(result()));
  const r = results[0];
  assert.equal(r.method, 'sampling');
  assert.deepEqual(r.samples!.reactions.PGI, [1, 2, 3, 4]);
  assert.equal(r.samples!.constant.ATPM, 8.39);
  assert.equal(r.samples!.summary.PFK.q975, 7.925);
});
