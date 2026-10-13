export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Gaussian KDE with Silverman's bandwidth, evaluated on `n` points over [lo, hi]. */
export function kde(xs: number[], lo: number, hi: number, n = 64): [number, number][] {
  if (!xs.length) return [];
  const s = sd(xs) || Math.abs(mean(xs)) * 0.02 || 1e-3;
  const bw = 1.06 * s * Math.pow(xs.length, -0.2);
  const out: [number, number][] = [];
  const norm = 1 / (xs.length * bw * Math.sqrt(2 * Math.PI));
  for (let i = 0; i < n; i++) {
    const x = lo + ((hi - lo) * i) / (n - 1);
    let d = 0;
    for (const v of xs) {
      const z = (x - v) / bw;
      d += Math.exp(-0.5 * z * z);
    }
    out.push([x, d * norm]);
  }
  return out;
}

/** Deterministic PRNG (mulberry32) — used for the demo so figures are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal };
}

export function niceTicks(lo: number, hi: number, count = 3): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [lo];
  const span = hi - lo;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 5 ? 10 : err >= 2 ? 5 : err >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function fmt(v: number | null | undefined, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.001) return v.toExponential(1);
  return String(+v.toPrecision(digits));
}
