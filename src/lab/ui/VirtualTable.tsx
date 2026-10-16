import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { SortSpec } from '../types';
import { rem, useUi } from '../../ui/uiScale';

export interface Col<T> {
  key: string;
  label: ReactNode;
  /** design px number or any CSS grid track ("minmax(160px, 2fr)"); both follow the interface size. */
  width: number | string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  sortable?: boolean;
  title?: string;
}

interface Props<T> {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  /** design px */
  rowHeight?: number;
  sort?: SortSpec | null;
  onSort?: (key: string) => void;
  selected?: Set<string>;
  active?: string | null;
  onRowClick?: (r: T, e: React.MouseEvent, index: number) => void;
  onRowDoubleClick?: (r: T, col: string, e: React.MouseEvent) => void;
  onContextMenu?: (r: T, e: React.MouseEvent) => void;
  onKeyNav?: (r: T, index: number) => void;
  rowClass?: (r: T) => string;
  empty?: ReactNode;
}

/** Fixed-row-height virtualized grid: only visible rows are in the DOM, so 10k rows stay instant. */
export function VirtualTable<T>({ rows, cols, rowKey, rowHeight = 24, sort, onSort, selected, active, onRowClick, onRowDoubleClick, onContextMenu, onKeyNav, rowClass, empty }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(500);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  // the interface size scales the rows: positions are computed in screen pixels, sizes written in rem
  const factor = useUi((s) => s.factor);
  const template = cols.map((c) => (typeof c.width === 'number' ? rem(c.width) : c.width.replace(/(\d*\.?\d+)px/g, (_, n) => rem(+n)))).join(' ');
  const minWidth = rem(cols.reduce((a, c) => a + (typeof c.width === 'number' ? c.width : 160), 0));
  const headH = 26 * factor;
  const rowH = rowHeight * factor;
  const start = Math.max(0, Math.floor((scroll - headH) / rowH) - 6);
  const end = Math.min(rows.length, Math.ceil((scroll + height) / rowH) + 6);
  const activeIndex = active ? rows.findIndex((r) => rowKey(r) === active) : -1;

  const onKey = (e: React.KeyboardEvent) => {
    if (!onKeyNav || !rows.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(rows.length - 1, activeIndex + (e.key === 'ArrowDown' ? 1 : -1)));
    onKeyNav(rows[i], i);
    const el = ref.current;
    if (el) {
      const top = i * rowH, bottom = top + rowH + headH;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    }
  };

  return (
    <div className="vt" ref={ref} tabIndex={0} onKeyDown={onKey} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
      <div className="vt-inner" style={{ minWidth }}>
        <div className="vt-head" style={{ gridTemplateColumns: template, height: headH }}>
          {cols.map((c) => {
            const on = sort?.key === c.key;
            return (
              <div key={c.key} className={`vt-th ${c.align ?? ''} ${c.sortable !== false && onSort ? 'sortable' : ''} ${on ? 'on' : ''}`} title={c.title}
                onClick={() => c.sortable !== false && onSort?.(c.key)}>
                <span className="ellipsis">{c.label}</span>
                {on && <span className="vt-sort">{sort!.dir === 'asc' ? '↑' : '↓'}</span>}
              </div>
            );
          })}
        </div>
        <div className="vt-body" style={{ height: rows.length * rowH }}>
          {rows.slice(start, end).map((r, i) => {
            const k = rowKey(r);
            const idx = start + i;
            return (
              <div key={k} className={`vt-row ${selected?.has(k) ? 'sel' : ''} ${active === k ? 'active' : ''} ${rowClass?.(r) ?? ''}`}
                style={{ top: idx * rowH, height: rowH, gridTemplateColumns: template }}
                onClick={(e) => { if (!(e.target as HTMLElement).closest('input, select, textarea, button')) onRowClick?.(r, e, idx); }}
                onDoubleClick={(e) => { const col = (e.target as HTMLElement).closest('[data-col]')?.getAttribute('data-col'); if (col) onRowDoubleClick?.(r, col, e); }}
                onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); onContextMenu(r, e); } }}>
                {cols.map((c) => <div key={c.key} data-col={c.key} className={`vt-td ${c.align ?? ''}`}>{c.render(r)}</div>)}
              </div>
            );
          })}
        </div>
        {!rows.length && <div className="vt-empty">{empty ?? 'No rows'}</div>}
      </div>
    </div>
  );
}

/** Click / Ctrl-click / Shift-click selection over an ordered list of keys. */
export function nextSelection(keys: string[], current: string[], k: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, anchor: string | null): string[] {
  if (e.shiftKey && anchor) {
    const a = keys.indexOf(anchor), b = keys.indexOf(k);
    if (a >= 0 && b >= 0) {
      const range = keys.slice(Math.min(a, b), Math.max(a, b) + 1);
      return Array.from(new Set([...current, ...range]));
    }
  }
  if (e.ctrlKey || e.metaKey) return current.includes(k) ? current.filter((x) => x !== k) : [...current, k];
  return [];
}
