import type { StylePresetId } from './types';

/** Visual theme tokens used by the scene renderer (never alter data). */
export interface Theme {
  background: string;
  nodeFill: string;
  nodeStroke: string;
  slotStroke: string;
  edge: string;
  edgeMuted: string;
  metLabel: string;
  rxnLabel: string;
  text: string;
  plotAxis: string;
  groupFill: string;
  groupStroke: string;
  font: string;
  nodeStrokeWidth: number;
}

const FONT = 'Helvetica, Arial, sans-serif';

export const THEMES: Record<StylePresetId, Theme & { name: string }> = {
  nature: { name: 'Nature clean', background: '#ffffff', nodeFill: '#111111', nodeStroke: '#111111', slotStroke: '#8a8f98', edge: '#3a3a3a', edgeMuted: '#c4c7cc', metLabel: '#111111', rxnLabel: '#2b3fb8', text: '#111111', plotAxis: '#555555', groupFill: '#f6f7f9', groupStroke: '#d4d7dd', font: FONT, nodeStrokeWidth: 0 },
  cell: { name: 'Cell graphical', background: '#ffffff', nodeFill: '#ffffff', nodeStroke: '#1f2937', slotStroke: '#94a3b8', edge: '#374151', edgeMuted: '#cbd5e1', metLabel: '#1f2937', rxnLabel: '#7c3aed', text: '#111827', plotAxis: '#6b7280', groupFill: '#fef9ef', groupStroke: '#f1d9a6', font: FONT, nodeStrokeWidth: 1.8 },
  minimal: { name: 'Minimal', background: '#ffffff', nodeFill: '#6b7280', nodeStroke: '#6b7280', slotStroke: '#9ca3af', edge: '#9ca3af', edgeMuted: '#e5e7eb', metLabel: '#374151', rxnLabel: '#6b7280', text: '#374151', plotAxis: '#9ca3af', groupFill: '#fafafa', groupStroke: '#e5e7eb', font: FONT, nodeStrokeWidth: 0 },
  presentation: { name: 'Presentation', background: '#ffffff', nodeFill: '#0f172a', nodeStroke: '#0f172a', slotStroke: '#64748b', edge: '#1e293b', edgeMuted: '#cbd5e1', metLabel: '#0f172a', rxnLabel: '#2563eb', text: '#0f172a', plotAxis: '#475569', groupFill: '#f1f5f9', groupStroke: '#cbd5e1', font: FONT, nodeStrokeWidth: 0 },
  dark: { name: 'Dark', background: '#0f1115', nodeFill: '#e5e7eb', nodeStroke: '#e5e7eb', slotStroke: '#6b7280', edge: '#cbd5e1', edgeMuted: '#374151', metLabel: '#f3f4f6', rxnLabel: '#93c5fd', text: '#f3f4f6', plotAxis: '#9ca3af', groupFill: '#171a21', groupStroke: '#2a2f3a', font: FONT, nodeStrokeWidth: 0 },
  grayscale: { name: 'Print grayscale', background: '#ffffff', nodeFill: '#000000', nodeStroke: '#000000', slotStroke: '#808080', edge: '#333333', edgeMuted: '#bbbbbb', metLabel: '#000000', rxnLabel: '#444444', text: '#000000', plotAxis: '#555555', groupFill: '#f4f4f4', groupStroke: '#cccccc', font: FONT, nodeStrokeWidth: 0 },
};

/** Figure size presets (mm) for journals. */
export const FIGURE_SIZES = [
  { id: 'auto', name: 'Fit content', w: 0, h: 0 },
  { id: 'single', name: 'Single column (89 mm)', w: 89, h: 0 },
  { id: 'onehalf', name: '1.5 column (120 mm)', w: 120, h: 0 },
  { id: 'double', name: 'Double column (183 mm)', w: 183, h: 0 },
  { id: 'fullpage', name: 'Full page (183 × 247 mm)', w: 183, h: 247 },
  { id: 'a4', name: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  { id: 'slide', name: '16:9 slide (338.7 × 190.5 mm)', w: 338.7, h: 190.5 },
] as const;
