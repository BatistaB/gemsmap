export interface Palette {
  id: string;
  name: string;
  kind: 'sequential' | 'diverging';
  colorblindSafe: boolean;
  stops: string[];
}

export const PALETTES: Palette[] = [
  { id: 'blue-red', name: 'Blue – Red', kind: 'diverging', colorblindSafe: true, stops: ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'] },
  { id: 'cool-warm', name: 'Cool – Warm', kind: 'diverging', colorblindSafe: true, stops: ['#3b4cc0', '#6788ee', '#9abbff', '#c9d7f0', '#edd1c2', '#f7a889', '#e26952', '#b40426'] },
  { id: 'purple-orange', name: 'Purple – Orange', kind: 'diverging', colorblindSafe: true, stops: ['#542788', '#8073ac', '#b2abd2', '#d8daeb', '#f7f7f7', '#fee0b6', '#fdb863', '#e08214', '#b35806'] },
  { id: 'green-purple', name: 'Green – Purple', kind: 'diverging', colorblindSafe: true, stops: ['#1b7837', '#5aae61', '#a6dba0', '#d9f0d3', '#f7f7f7', '#e7d4e8', '#c2a5cf', '#9970ab', '#762a83'] },
  { id: 'viridis', name: 'Viridis', kind: 'sequential', colorblindSafe: true, stops: ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'] },
  { id: 'plasma', name: 'Plasma', kind: 'sequential', colorblindSafe: true, stops: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'] },
  { id: 'blues', name: 'Blues', kind: 'sequential', colorblindSafe: true, stops: ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'] },
  { id: 'reds', name: 'Reds', kind: 'sequential', colorblindSafe: true, stops: ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15'] },
  { id: 'greys', name: 'Grayscale', kind: 'sequential', colorblindSafe: true, stops: ['#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525'] },
];

/** Okabe–Ito inspired condition colours (colour-blind safe). */
export const CONDITION_COLORS = ['#e8505b', '#a05a5a', '#5b6ee1', '#2a2f8f', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#999999'];

export function getPalette(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  const v = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** t in [0,1] -> colour, interpolated between stops. */
export function samplePalette(p: Palette, t: number): string {
  const tt = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5));
  const pos = tt * (p.stops.length - 1);
  const i = Math.min(p.stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexToRgb(p.stops[i]);
  const b = hexToRgb(p.stops[i + 1]);
  return '#' + toHex(a[0] + (b[0] - a[0]) * f) + toHex(a[1] + (b[1] - a[1]) * f) + toHex(a[2] + (b[2] - a[2]) * f);
}

export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
