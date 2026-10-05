import { useEffect } from 'react';
import { PanelRightClose, PanelRight } from 'lucide-react';
import { useSim } from '../app/context.ts';
import { ui } from '../app/ui.ts';
import { useStore } from '../app/store.ts';
import { Inspector } from './inspector/Inspector.tsx';
import { Overview } from './Overview.tsx';

export function SidePanel() {
  const ctl = useSim();
  const open = useStore(ui, (s) => s.panelOpen);
  const hasSelection = ctl.selectedId !== null && (!!ctl.selected() || !!ctl.selectedRecord());
  // On phones the panel is a bottom sheet: open it when something gets selected.
  const selectedId = ctl.selectedId;
  useEffect(() => {
    if (selectedId !== null && window.innerWidth <= 760 && ui.get().screen === 'lab') ui.set({ panelOpen: true });
  }, [selectedId]);
  return (
    <>
      <aside className={`side-panel glass ${open ? 'open' : 'closed'} ${hasSelection ? 'has-selection' : ''}`} aria-label={hasSelection ? 'Creature inspector' : 'World overview'} data-tour="side-panel">
        {hasSelection ? <Inspector /> : <Overview />}
      </aside>
      <button
        className={`panel-toggle glass ${open ? 'open' : ''}`}
        onClick={() => ui.set({ panelOpen: !open })}
        aria-label={open ? 'Hide side panel' : 'Show side panel'}
        title={open ? 'Hide panel' : 'Show panel'}
      >
        {open ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
      </button>
    </>
  );
}
