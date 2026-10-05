import { useCallback, useEffect, useState } from 'react';
import { SimContext } from './app/context.ts';
import { SimController, SPEEDS, TOOLS, type ToolId } from './app/controller.ts';
import { attachDiscoveries } from './app/discoveryEngine.ts';
import { loadWorld, saveWorld } from './app/persist.ts';
import { clearToasts, pushToast, ui } from './app/ui.ts';
import { useStore } from './app/store.ts';
import { getLesson } from './content/lessons.ts';
import { createWorld, getScenario } from './content/scenarios.ts';
import type { WorldConfig } from './sim/world.ts';
import { WorldCanvas } from './ui/WorldCanvas.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { ToolRail } from './ui/ToolRail.tsx';
import { SidePanel } from './ui/SidePanel.tsx';
import { Dock } from './ui/dock/Dock.tsx';
import { MapCluster } from './ui/MapCluster.tsx';
import { Toasts } from './ui/Toasts.tsx';
import { HomeScreen } from './ui/HomeScreen.tsx';
import { FieldGuide } from './ui/modals/FieldGuide.tsx';
import { LabControls } from './ui/modals/LabControls.tsx';
import { DiscoveriesDialog, ImportDnaDialog, NewWorldDialog, ShortcutsDialog } from './ui/modals/Dialogs.tsx';
import { LessonCoach } from './ui/lesson/LessonCoach.tsx';
import { NeuronLab } from './ui/lesson/NeuronLab.tsx';

function ambientWorld() {
  return createWorld(getScenario('ecosystem'), { seed: 'home-dish', startPopulation: 70 });
}

export function App() {
  const [ctl] = useState(() => new SimController(ambientWorld()));
  // Handy for debugging and automated tests: window.__lifesim is the controller.
  useEffect(() => {
    const w = window as unknown as { __lifesim?: SimController; __lifesimUi?: typeof ui };
    w.__lifesim = ctl;
    w.__lifesimUi = ui;
  }, [ctl]);
  const screen = useStore(ui, (s) => s.screen);
  const modal = useStore(ui, (s) => s.modal);
  const lessonId = useStore(ui, (s) => s.lessonId);
  const panelOpen = useStore(ui, (s) => s.panelOpen);
  const dockOpen = useStore(ui, (s) => s.dockOpen);

  // Keep the camera framing the part of the dish that isn't covered by panels.
  useEffect(() => {
    const measure = () => {
      const r = ctl.renderer;
      if (!r) return;
      if (ui.get().screen !== 'lab') {
        r.setInsets({ left: 0, right: 0, top: 0, bottom: 0 });
        return;
      }
      const W = window.innerWidth;
      const H = window.innerHeight;
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const mobile = W <= 760;
      const top = rect('.topbar');
      const rail = rect('.toolrail');
      const panel = rect('.side-panel.open');
      const dock = rect('.dock.open');
      const ins = { left: 0, right: 0, top: top ? Math.round(top.bottom) : 0, bottom: 0 };
      if (mobile) {
        ins.bottom = Math.round(Math.max(rail ? H - rail.top : 0, panel ? H - panel.top : 0, dock ? H - dock.top : 0));
      } else {
        ins.left = rail ? Math.round(rail.right) : 0;
        ins.right = panel ? Math.round(W - panel.left) : 0;
        ins.bottom = dock ? Math.round(H - dock.top) : 0;
      }
      r.setInsets(ins);
    };
    const id = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [ctl]);

  // ---------------------------------------------------------------- saving
  const saveNow = useCallback(
    async (silent: boolean) => {
      const s = ui.get();
      if (s.screen !== 'lab' || s.lessonId) return;
      const ok = await saveWorld(ctl.world, s.worldName, s.scenarioId);
      if (!silent)
        pushToast(
          ok
            ? { kind: 'info', title: 'World saved', body: 'Saved in this browser. Resume it from the start screen.' }
            : { kind: 'warning', title: 'Could not save', body: 'This browser blocked storage (private window or blocked site data).' },
          4000,
        );
    },
    [ctl],
  );

  useEffect(() => {
    if (screen !== 'lab') return;
    const id = window.setInterval(() => void saveNow(true), 60_000);
    const onVis = () => {
      if (document.hidden) void saveNow(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [screen, saveNow]);

  // ------------------------------------------------------------ discoveries
  useEffect(() => {
    if (screen !== 'lab') return;
    return attachDiscoveries(ctl);
  }, [screen, ctl]);

  // A slow drifting camera on the start screen.
  useEffect(() => {
    if (screen !== 'home') return;
    const hook = (c: SimController) => {
      const r = c.renderer;
      if (!r) return;
      const t = performance.now() / 1000;
      const R = c.world.config.radius;
      const wide = r.width > 900;
      r.target.zoom = r.fitZoom() * (wide ? 1.5 : 1.3);
      r.target.x = (wide ? -R * 0.32 : 0) + Math.cos(t * 0.035) * R * 0.18;
      r.target.y = Math.sin(t * 0.05) * R * 0.16;
    };
    ctl.frameHooks.add(hook);
    ctl.select(null);
    return () => {
      ctl.frameHooks.delete(hook);
    };
  }, [screen, ctl]);

  // ------------------------------------------------------------- navigation
  const startWorld = useCallback(
    (scenarioId: string, overrides: Partial<WorldConfig> = {}, name?: string) => {
      const sc = getScenario(scenarioId);
      const w = createWorld(sc, overrides);
      clearToasts();
      ctl.setWorld(w);
      ctl.setSpeed(1);
      ctl.setTool('inspect');
      ui.set({
        screen: 'lab',
        scenarioId,
        worldName: name ?? sc.title,
        modal: null,
        log: [],
        lessonId: null,
        lessonStep: 0,
        dockTab: 'population',
        surgery: false,
        panelOpen: window.innerWidth > 760,
        dockOpen: window.innerWidth > 760,
      });
      if (!name) pushToast({ kind: 'info', title: sc.title, body: sc.watch }, 9000);
    },
    [ctl],
  );

  const startLesson = useCallback(
    (id: string) => {
      const l = getLesson(id);
      if (!l) return;
      startWorld(l.scenario, l.overrides ?? {}, l.title);
      ui.set({ lessonId: id, lessonStep: 0 });
    },
    [startWorld],
  );

  const goHome = useCallback(() => {
    void saveNow(true);
    clearToasts();
    ui.set({ screen: 'home', lessonId: null, modal: null });
    ctl.setWorld(ambientWorld());
    ctl.setSpeed(1);
  }, [ctl, saveNow]);

  const continueSaved = useCallback(async () => {
    const r = await loadWorld();
    if (!r) {
      pushToast({ kind: 'warning', title: 'No saved world found', body: 'Saves live in this browser only. Start a new world instead.' }, 5000);
      return;
    }
    ctl.setWorld(r.world);
    ctl.setSpeed(1);
    ctl.setTool('inspect');
    clearToasts();
    ui.set({ screen: 'lab', scenarioId: r.data.scenarioId, worldName: r.data.name, modal: null, log: [], lessonId: null, lessonStep: 0 });
    pushToast({ kind: 'info', title: `Welcome back to “${r.data.name}”`, body: 'Your world continues exactly where you left it.' }, 5000);
  }, [ctl]);

  // --------------------------------------------------------------- keyboard
  useEffect(() => {
    if (screen !== 'lab') return;
    const toolByKey = new Map<string, ToolId>(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ui.get().modal) return;
      const k = e.key;
      if (k === ' ') {
        e.preventDefault();
        ctl.togglePause();
      } else if (k === '.') {
        if (ctl.paused) ctl.stepOnce();
      } else if (k >= '1' && k <= '6') {
        ctl.setSpeed(SPEEDS[Number(k) - 1]);
      } else if (k === 'Escape') {
        if (ui.get().surgery) ui.set({ surgery: false });
        else if (ctl.tool !== 'inspect') ctl.setTool('inspect');
        else ctl.select(null);
      } else if (k === 'f' || k === 'F') {
        if (ctl.selected()) ctl.setFollow(!ctl.follow);
      } else if (k === '+' || k === '=') {
        ctl.zoom(1.4);
      } else if (k === '-' || k === '_') {
        ctl.zoom(1 / 1.4);
      } else if (k === '0') {
        ctl.fitView();
      } else if (k === 'Tab') {
        e.preventDefault();
        const list = ctl.world.creatures;
        if (!list.length) return;
        const i = list.findIndex((c) => c.id === ctl.selectedId);
        const next = list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length];
        ctl.select(next.id, { focus: true });
      } else if (k === 'l' || k === 'L') {
        ui.set({ modal: 'lab' });
      } else if (k === 'g' || k === 'G') {
        ui.set({ modal: 'guide', guideEntry: null });
      } else if (k === 'n' || k === 'N') {
        ui.set({ modal: 'newWorld' });
      } else if (k === '?') {
        ui.set({ modal: 'shortcuts' });
      } else {
        const tool = toolByKey.get(k.toLowerCase());
        if (tool) ctl.setTool(tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, ctl]);

  return (
    <SimContext.Provider value={ctl}>
      <div className={`app screen-${screen} ${panelOpen ? 'panel-open' : 'panel-closed'} ${dockOpen ? 'dock-open' : 'dock-closed'}`}>
        <WorldCanvas />
        {screen === 'home' ? (
          <HomeScreen onLesson={startLesson} onScenario={(id) => startWorld(id)} onContinue={continueSaved} />
        ) : (
          <>
            <TopBar onHome={goHome} onNewWorld={() => ui.set({ modal: 'newWorld' })} onSave={() => void saveNow(false)} onLoad={continueSaved} />
            <ToolRail />
            <SidePanel />
            <Dock />
            <MapCluster />
            {lessonId && <LessonCoach onStartLesson={startLesson} onExit={() => ui.set({ lessonId: null })} />}
          </>
        )}
        <Toasts />
        {modal === 'guide' && <FieldGuide />}
        {modal === 'lab' && <LabControls />}
        {modal === 'newWorld' && <NewWorldDialog onCreate={(id, o) => startWorld(id, o)} />}
        {modal === 'discoveries' && <DiscoveriesDialog />}
        {modal === 'shortcuts' && <ShortcutsDialog />}
        {modal === 'import' && <ImportDnaDialog />}
        {modal === 'neuron' && <NeuronLab />}
      </div>
    </SimContext.Provider>
  );
}
