import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** Value to sort by when the table sorts itself (no `onSort` given). null / undefined sort last. */
  sortValue?: (row: T) => number | string | boolean | null | undefined;
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

const cmp = (a: unknown, b: unknown) => (typeof a === 'string' || typeof b === 'string'
  ? String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  : Number(a) - Number(b));

/**
 * Fixed-row-height virtualized grid: only visible rows are in the DOM, so 10k rows stay instant.
 * Sorting: with `onSort` the caller sorts the rows; without it the table sorts by each column's
 * `sortValue` (click: sort, again: reverse, third click: original order).
 */
export function VirtualTable<T>({ rows: input, cols, rowKey, rowHeight = 24, sort: outerSort, onSort: outerOnSort, selected, active, onRowClick, onRowDoubleClick, onContextMenu, onKeyNav, rowClass, empty }: Props<T>) {
  const [ownSort, setOwnSort] = useState<SortSpec | null>(null);
  const self = !outerOnSort;
  const sort = self ? ownSort : outerSort;
  const onSort = self
    ? (k: string) => {
      const col = cols.find((c) => c.key === k);
      if (!col?.sortValue) return;
      // numbers start high → low, text A → Z
      const first = input.map((r) => col.sortValue!(r)).find((v) => v != null && v !== '');
      const dir0 = typeof first === 'string' ? 'asc' : 'desc';
      setOwnSort((c) => (c?.key !== k ? { key: k, dir: dir0 } : c.dir === dir0 ? { key: k, dir: dir0 === 'asc' ? 'desc' : 'asc' } : null));
    }
    : outerOnSort;
  const rows = useMemo(() => {
    const col = self && ownSort ? cols.find((c) => c.key === ownSort.key) : undefined;
    if (!col?.sortValue) return input;
    const sign = ownSort!.dir === 'asc' ? 1 : -1;
    const val = col.sortValue;
    return input.map((r, i) => ({ r, i, v: val(r) })).sort((a, b) => {
      const na = a.v == null || a.v === '', nb = b.v == null || b.v === '';
      if (na || nb) return na === nb ? a.i - b.i : na ? 1 : -1;
      return sign * cmp(a.v, b.v) || a.i - b.i;
    }).map((x) => x.r);
  }, [input, cols, self, ownSort]);
  const canSort = (c: Col<T>) => c.sortable !== false && (self ? !!c.sortValue : !!outerOnSort);
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
              <div key={c.key} className={`vt-th ${c.align ?? ''} ${canSort(c) ? 'sortable' : ''} ${on ? 'on' : ''}`} title={c.title}
                onClick={() => canSort(c) && onSort?.(c.key)}>
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
