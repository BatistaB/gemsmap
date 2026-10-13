import type { Bounds, LabReaction, Objective, SolverStatus } from './types';

export const FLUX_UNIT = 'mmol gDW⁻¹ h⁻¹';

/** Compact number for tables: 6 significant digits, no exponent unless needed. */
export function fnum(v: number | null | undefined, digits = 4): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-4) return v.toExponential(2).replace('-', '−');
  const s = Number(v.toPrecision(digits + 2)).toString();
  return s.replace('-', '−');
}

/** FVA interval width; solver noise below the zero threshold (incl. tiny negative widths) shows as 0. */
export const fvaWidth = (min: number | null | undefined, max: number | null | undefined, tol: number) =>
  min == null || max == null ? null : Math.abs(max - min) < tol ? 0 : max - min;

export const fbound = (b: number | null | undefined, side: 'lower' | 'upper') => (b == null ? (side === 'lower' ? '−∞' : '∞') : fnum(b));
export const fbounds = (b: Bounds) => `[${fbound(b[0], 'lower')}, ${fbound(b[1], 'upper')}]`;

export function objectiveText(o: Objective | null | undefined): string {
  if (!o || !Object.keys(o.coefficients).length) return 'none';
  const terms = Object.entries(o.coefficients).map(([id, c], i) => `${c < 0 ? '− ' : i ? '+ ' : ''}${fnum(Math.abs(c), 3)} × ${id}`);
  return `${o.direction === 'max' ? 'max' : 'min'} ${terms.join(' ')}`;
}

export const STATUS_LABEL: Record<SolverStatus, string> = {
  optimal: 'Optimal', infeasible: 'Infeasible', unbounded: 'Unbounded',
  infeasible_or_unbounded: 'Infeasible or unbounded', undefined: 'Undefined', error: 'Error',
};

export const METHOD_INFO: Record<string, { label: string; short: string; blurb: string; more: string }> = {
  fba: {
    label: 'FBA', short: 'FBA', blurb: 'Find an optimal flux distribution.',
    more: 'Linear programming: maximizes (or minimizes) the objective subject to steady-state mass balance (S·v = 0) and reaction bounds. Many flux distributions can share the same optimum; FBA returns one of them.',
  },
  pfba: {
    label: 'pFBA', short: 'pFBA', blurb: 'Optimal solution that minimizes total flux.',
    more: 'Parsimonious FBA: first finds the optimal objective, then fixes it (or a fraction of it) and minimizes the sum of absolute fluxes. Gives a more unique, enzyme-economical flux distribution.',
  },
  loopless: {
    label: 'Loopless FBA', short: 'Loopless', blurb: 'Avoid thermodynamically infeasible internal loops.',
    more: 'CycleFreeFlux (COBRApy loopless_solution): removes internal cycles from an optimal FBA solution while preserving exchange fluxes and the objective value.',
  },
  fva: {
    label: 'FVA', short: 'FVA', blurb: 'Feasible flux range of each reaction.',
    more: 'Flux variability analysis: for each reaction independently, the minimum and maximum flux compatible with the constraints and a fraction of the optimal objective. The intervals are not a joint flux distribution — the midpoint is not a solution.',
  },
};

export function reactionTypeLabel(t: LabReaction['type']) {
  return { exchange: 'Exchange', demand: 'Demand', sink: 'Sink', transport: 'Transport', internal: 'Internal' }[t];
}

export const timeLabel = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((c) => {
    const s = c == null ? '' : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
