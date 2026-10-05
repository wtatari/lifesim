import {
  BookOpen,
  ChartArea,
  Ellipsis,
  FlaskConical,
  Pause,
  Play,
  Skull,
  Sparkles,
  StepForward,
  Cherry,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSim } from '../app/context.ts';
import { SPEEDS, speedLabel } from '../app/controller.ts';
import { ui } from '../app/ui.ts';
import { useStore } from '../app/store.ts';
import { DISCOVERIES } from '../content/discoveries.ts';
import { formatTime, Logo, SEASON_ICON } from './common.tsx';

export function TopBar({ onHome, onNewWorld, onSave, onLoad }: { onHome: () => void; onNewWorld: () => void; onSave: () => void; onLoad: () => void }) {
  const ctl = useSim();
  const w = ctl.world;
  const season = w.season();
  const SeasonIcon = SEASON_ICON[season.name];
  const worldName = useStore(ui, (s) => s.worldName);
  const discovered = useStore(ui, (s) => s.discovered.length);
  const living = w.species.living().length;
  const lagging = !ctl.paused && Number.isFinite(ctl.speed) && ctl.actualSpeed < ctl.speed * 0.8;

  return (
    <header className="topbar glass" data-tour="topbar">
      <div className="topbar-left">
        <button className="brand" onClick={onHome} title="Back to the start screen">
          <Logo size={28} />
          <span className="brand-name">LifeSim</span>
        </button>
        <span className="world-name" title="Current world">
          {worldName}
        </span>
      </div>

      <div className="transport" data-tour="transport">
        <button
          className={`play-btn ${ctl.paused ? 'is-paused' : ''}`}
          onClick={() => ctl.togglePause()}
          aria-label={ctl.paused ? 'Play' : 'Pause'}
          title={ctl.paused ? 'Play (Space)' : 'Pause (Space)'}
        >
          {ctl.paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
        </button>
        {ctl.paused && (
          <button className="icon-btn" onClick={() => ctl.stepOnce()} aria-label="Advance one step" title="Advance one step (.)">
            <StepForward size={18} />
          </button>
        )}
        <button
          className="btn sm speed-cycle"
          onClick={() => {
            const i = SPEEDS.findIndex((x) => x === ctl.speed);
            ctl.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
          }}
          aria-label={`Speed ${speedLabel(ctl.speed)}. Tap to change.`}
        >
          {speedLabel(ctl.speed)}
        </button>
        <div className="segmented speed" role="group" aria-label="Simulation speed" data-tour="speed">
          {SPEEDS.map((s, i) => (
            <button
              key={i}
              aria-pressed={!ctl.paused && ctl.speed === s}
              onClick={() => ctl.setSpeed(s)}
              title={`${Number.isFinite(s) ? `${s}× speed` : 'As fast as your computer allows'} (${i + 1})`}
            >
              {speedLabel(s)}
            </button>
          ))}
        </div>
        {(lagging || !Number.isFinite(ctl.speed)) && !ctl.paused && (
          <span className="actual-speed mono" title="Speed your computer is actually achieving">
            ≈{Math.round(ctl.actualSpeed)}×
          </span>
        )}
      </div>

      <div className="topbar-right">
        <div className="vitals" data-tour="vitals">
          <Vital label="Pop" value={String(w.creatures.length)} title="Creatures alive" />
          <Vital label="Gen" value={String(w.totals.maxGeneration)} title="Highest generation reached" />
          <Vital label="Species" value={String(living)} title="Species alive" />
          <Vital label="Time" value={formatTime(w.time)} title="Time since the experiment started (simulated)" />
          <span className={`season season-${season.name}`} title={`Season: ${season.name}. Plants grow ${Math.round(season.factor * 100)}% as fast as average.`}>
            <SeasonIcon size={15} />
            <span className="season-name">{season.name}</span>
          </span>
          {w.config.berryMode !== 'good' && w.config.berryShare > 0 && (
            <span className={`toxicity ${w.berriesToxic ? 'is-toxic' : ''}`} title={w.berriesToxic ? 'Berries are poisonous right now' : 'Berries are safe right now'}>
              {w.berriesToxic ? <Skull size={14} /> : <Cherry size={14} />}
              <span>{w.berriesToxic ? 'Toxic' : 'Tasty'}</span>
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <button className="icon-btn show-mobile" onClick={() => ui.set((s) => ({ dockOpen: !s.dockOpen }))} title="Charts" aria-label="Show charts">
            <ChartArea size={19} />
          </button>
          <button className="icon-btn" onClick={() => ui.set({ modal: 'lab' })} title="Lab controls: environment & experiments (L)" aria-label="Lab controls" data-tour="lab-btn">
            <FlaskConical size={19} />
          </button>
          <button className="icon-btn" onClick={() => ui.set({ modal: 'guide', guideEntry: null })} title="Field guide: how it all works (G)" aria-label="Field guide" data-tour="guide-btn">
            <BookOpen size={19} />
          </button>
          <button className="icon-btn discoveries-btn" onClick={() => ui.set({ modal: 'discoveries' })} title="Discoveries" aria-label="Discoveries">
            <Sparkles size={19} />
            <span className="badge mono">
              {discovered}/{DISCOVERIES.length}
            </span>
          </button>
          <MoreMenu onHome={onHome} onNewWorld={onNewWorld} onSave={onSave} onLoad={onLoad} />
        </div>
      </div>
    </header>
  );
}

function Vital({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <span className="vital" title={title}>
      <span className="vital-label">{label}</span>
      <span className="vital-value mono">{value}</span>
    </span>
  );
}

function MoreMenu({ onHome, onNewWorld, onSave, onLoad }: { onHome: () => void; onNewWorld: () => void; onSave: () => void; onLoad: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const item = (label: string, fn: () => void, hint?: string) => (
    <button
      role="menuitem"
      className="menu-item"
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      <span>{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label="More">
        <Ellipsis size={19} />
      </button>
      {open && (
        <div className="menu glass" role="menu">
          {item('New world…', onNewWorld, 'N')}
          {item('Save to this browser', onSave)}
          {item('Load saved world', onLoad)}
          {item('Release creature from DNA code…', () => ui.set({ modal: 'import' }))}
          {item('Keyboard shortcuts', () => ui.set({ modal: 'shortcuts' }), '?')}
          <div className="menu-sep" />
          {item('Back to start screen', onHome)}
        </div>
      )}
    </div>
  );
}
