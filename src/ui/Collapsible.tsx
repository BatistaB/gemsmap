/**
 * Collapsible inspector sections (Map Builder Inspector and COBRAGUI Inspector).
 *
 * Works on the existing markup instead of wrapping every section in a component: a section is a
 * `.section` / `.li-sec` element whose header holds a `.section-title` / `.insp-sub`. Clicking the title
 * folds the section down to its header. The state is remembered per panel and per title (counts in
 * titles are ignored: "Connected reactions (26 of 104)" → "Connected reactions"), so a section stays
 * folded when you select another metabolite. Only data-* attributes are set, never React-managed props.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

const SECTION = '.section, .li-sec';
const TITLE = '.section-title, .insp-sub';
const KEY = (scope: string) => `gemsmap.collapsed.${scope}`;

const load = (scope: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(KEY(scope)) || '[]')); } catch { return new Set(); }
};
const save = (scope: string, s: Set<string>) => { try { localStorage.setItem(KEY(scope), JSON.stringify([...s])); } catch { /* ignore */ } };

/** Stable key of a section title (drops counts, units and condition names after "(" or "·"). */
export const sectionKey = (text: string) => text.split(/[(·:]/)[0].replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Direct child of `section` that contains `el`. */
function headerChild(section: Element, el: Element): Element | null {
  let cur: Element | null = el;
  while (cur && cur.parentElement !== section) cur = cur.parentElement;
  return cur;
}

/** Attach `ref` to the scrolling container of the inspector (a callback ref: works when the panel mounts later). */
export function useCollapsibleSections(scope: string) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => load(scope));
  const state = useRef(collapsed);
  state.current = collapsed;

  const apply = useCallback(() => {
    if (!root) return;
    root.querySelectorAll(SECTION).forEach((sec) => {
      const title = sec.querySelector(TITLE);
      const head = title && headerChild(sec, title);
      // only sections whose title sits in their first child are foldable (avoids folding lists of sub-titles)
      if (!title || !head || head !== sec.firstElementChild || sec.children.length < 2) { sec.removeAttribute('data-foldable'); sec.removeAttribute('data-collapsed'); return; }
      const key = sectionKey(title.textContent ?? '');
      if (!key) return;
      sec.setAttribute('data-foldable', key);
      head.setAttribute('data-sec-head', '');
      title.setAttribute('data-sec-title', '');
      if (state.current.has(key)) sec.setAttribute('data-collapsed', ''); else sec.removeAttribute('data-collapsed');
    });
  }, [root]);

  // re-scan whenever the inspector content changes (new selection, sections appearing)
  useEffect(() => {
    if (!root) return;
    apply();
    let t: number | undefined;
    const mo = new MutationObserver(() => { clearTimeout(t); t = window.setTimeout(apply, 0); });
    mo.observe(root, { childList: true, subtree: true });
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element;
      if (el.closest('button, a, input, select, label, textarea')) return;
      const title = el.closest('[data-sec-title]');
      const sec = title?.closest('[data-foldable]');
      if (!title || !sec) return;
      const key = sec.getAttribute('data-foldable')!;
      setCollapsed((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); save(scope, next); return next; });
    };
    root.addEventListener('click', onClick);
    return () => { mo.disconnect(); clearTimeout(t); root.removeEventListener('click', onClick); };
  }, [root, apply, scope]);
  useEffect(apply, [collapsed, apply]);

  const collapseAll = () => {
    const keys = Array.from(root?.querySelectorAll('[data-foldable]') ?? []).map((s) => s.getAttribute('data-foldable')!);
    const next = new Set([...collapsed, ...keys]);
    save(scope, next); setCollapsed(next);
  };
  const expandAll = () => { const next = new Set<string>(); save(scope, next); setCollapsed(next); };
  return { ref: setRoot, collapseAll, expandAll };
}

/** "Expand all · Collapse all" bar shown at the top of an inspector. */
export function SectionsBar({ api }: { api: { collapseAll: () => void; expandAll: () => void } }) {
  return (
    <div className="sections-bar">
      <span className="muted small">Sections</span>
      <button className="link small" onClick={api.expandAll} title="Show every section"><Icon name="expandDown" size={11} /> Expand all</button>
      <button className="link small" onClick={api.collapseAll} title="Fold every section to its title (click a title to open it)"><Icon name="expandUp" size={11} /> Collapse all</button>
    </div>
  );
}
