/**
 * Narrow windows hide side panels so the map (or the COBRAGUI tables) keep room. Each panel closes when the
 * window, in design px (it follows the interface size), gets narrower than its threshold, and reopens when the
 * window widens again — unless the user toggled it in between: a panel the user opened stays open, one the
 * user closed stays closed. The panel buttons in the top bar always work.
 */
import { useLab } from '../lab/store';
import { useStore } from '../store/store';
import { useUi } from './uiScale';

interface Rule { below: number; isOpen: () => boolean; setOpen: (open: boolean) => void }

const RULES: Rule[] = [
  // Map Builder / Template Builder inspector, then their left panel
  { below: 1000, isOpen: () => useStore.getState().rightOpen, setOpen: (rightOpen) => useStore.setState({ rightOpen }) },
  { below: 760, isOpen: () => useStore.getState().leftOpen, setOpen: (leftOpen) => useStore.setState({ leftOpen }) },
  // COBRAGUI inspector (it reopens by itself when an entity is opened)
  { below: 1150, isOpen: () => useLab.getState().inspectorOpen, setOpen: (inspectorOpen) => useLab.setState({ inspectorOpen }) },
];

/** Once, after the stores are ready. */
export function installAutoCollapse() {
  const narrow = RULES.map(() => false);
  const autoClosed = RULES.map(() => false);
  let told = false;
  const check = (vw: number) => {
    let closed = false;
    RULES.forEach((r, i) => {
      const now = vw < r.below;
      if (now && !narrow[i] && r.isOpen()) { r.setOpen(false); autoClosed[i] = true; closed = true; }
      if (!now && narrow[i]) { if (autoClosed[i] && !r.isOpen()) r.setOpen(true); autoClosed[i] = false; }
      narrow[i] = now;
    });
    if (closed && !told) {
      told = true;
      useStore.getState().actions.toast('Small window: side panels hidden to make room — reopen them with the panel buttons, or make the interface smaller (File → Interface size)');
    }
  };
  check(useUi.getState().vw);
  useUi.subscribe((s, prev) => { if (s.vw !== prev.vw) check(s.vw); });
}
