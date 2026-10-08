import { useState } from 'react';
import { BookOpen, Bot, Brain, ChevronDown, ChevronUp, Egg, Home, Pause, Play, Sparkles, Swords, Trophy, Users } from 'lucide-react';
import { useSim } from '../../app/context.ts';
import { adv, continueAs, openEvolveEditor, setAutopilot, setBiteHeld } from '../../app/adventure.ts';
import { useStore } from '../../app/store.ts';
import { ui } from '../../app/ui.ts';
import { GOALS } from '../../content/adventure.ts';
import { PAL } from '../../render/palette.ts';
import type { Creature } from '../../sim/creature.ts';
import { formatAge, formatTime, Meter, SpeciesName } from '../common.tsx';
import { Portrait } from '../inspector/Portrait.tsx';
import { Modal } from '../modals/Modal.tsx';
import { MusicToggle } from '../MusicToggle.tsx';
import { CreatureEditor } from './CreatureEditor.tsx';

const CAUSE_TEXT: Record<string, string> = {
  starved: 'starved to death',
  eaten: 'was eaten by a predator',
  'old age': 'died of old age',
  poisoned: 'was poisoned',
  smitten: 'was removed',
  meteor: 'was hit by a meteor',
};

export function AdventureHUD({ onHome, onRestart }: { onHome: () => void; onRestart: () => void }) {
  const ctl = useSim();
  const w = ctl.world;
  const phase = useStore(adv, (s) => s.phase);
  const editor = useStore(adv, (s) => s.editor);
  const pl = w.player;
  const c = pl ? w.getCreature(pl.id) : undefined;

  return (
    <>
      {phase === 'play' && c && (
        <>
          <PlayerCard c={c} />
          <TopActions onHome={onHome} />
          <Goals />
          <ActionBar c={c} />
          <ControlsHint />
          {ctl.paused && !editor && (
            <button className="adv-paused glass" onClick={() => ctl.setPaused(false)}>
              <Play size={16} fill="currentColor" /> Paused · click or press P to continue
            </button>
          )}
        </>
      )}
      {editor && <CreatureEditor mode={editor} onExit={onHome} />}
      {phase === 'dead' && <DeathDialog onRestart={onRestart} />}
      {phase === 'extinct' && <ExtinctDialog onRestart={onRestart} onHome={onHome} />}
    </>
  );
}

function PlayerCard({ c }: { c: Creature }) {
  const ctl = useSim();
  const w = ctl.world;
  const sp = w.species.get(c.speciesId);
  const pl = w.player!;
  const autopilot = useStore(adv, (s) => s.autopilot);
  const e = c.energy / c.maxEnergy;
  const h = c.health / c.maxHealth;
  const adult = c.growth >= 1;
  return (
    <section className={`adv-card glass ${c.pain > 0.2 ? 'hurt' : ''} ${e < 0.25 ? 'starving' : ''}`} aria-label="Your creature">
      <div className="adv-card-head">
        <Portrait creature={c} size={64} />
        <div className="adv-id">
          <strong className="adv-name">{c.name}</strong>
          {sp && <SpeciesName s={sp} className="adv-species" />}
          <span className="faint mono adv-gen">
            gen {c.generation + 1} · {adult ? 'adult' : 'juvenile'} · {formatAge(c.age)}
          </span>
        </div>
      </div>
      <Meter value={e} color={e < 0.25 ? PAL.mcherry : PAL.yfp} label="Energy" right={`${Math.round(e * 100)}%`} />
      <Meter value={h} color={PAL.gfp} label="Health" right={`${Math.round(h * 100)}%`} />
      {adult ? (
        <Meter value={c.ageFraction} color="var(--ink-3)" label="Life lived" right={`${Math.round(Math.max(0, c.traits.lifespan - c.age))} s left`} />
      ) : (
        <Meter value={c.growth} color={PAL.cfp} label="Growing up" right={`${Math.round(c.growth * 100)}%`} />
      )}
      <div className="drive" title="Your creature's neural network keeps deciding what it would do, even while you steer. Turn on autopilot to let it drive.">
        <span className="eyebrow">{autopilot ? 'Its brain is driving' : 'Its brain wants to'}</span>
        <InstinctBar label="swim" v={pl.instinct[0]} />
        <InstinctBar label="turn" v={pl.instinct[1]} signed />
        <span className={`drive-bite ${pl.instinct[2] > 0.3 ? 'on' : ''}`}>bite</span>
      </div>
    </section>
  );
}

function InstinctBar({ label, v, signed }: { label: string; v: number; signed?: boolean }) {
  const x = Math.max(-1, Math.min(1, v));
  const style = signed
    ? { left: `${50 + Math.min(0, x) * 50}%`, width: `${Math.abs(x) * 50}%` }
    : { left: '0%', width: `${Math.max(0, x) * 100}%` };
  return (
    <span className="drive-bar">
      <span className="drive-label">{label}</span>
      <span className={`drive-track ${signed ? 'signed' : ''}`}>
        <span className="drive-fill" style={style} />
      </span>
    </span>
  );
}

function TopActions({ onHome }: { onHome: () => void }) {
  const ctl = useSim();
  const ep = useStore(adv, (s) => Math.floor(s.ep));
  const alive = useStore(adv, (s) => s.progress.alive);
  const autopilot = useStore(adv, (s) => s.autopilot);
  const panelOpen = useStore(ui, (s) => s.panelOpen);
  return (
    <div className="adv-top glass">
      <span className="ep-chip mono" title="Evolution points: earned by eating, winning fights and completing goals. Spend them to evolve when you lay eggs.">
        <Sparkles size={14} /> {ep} EP
      </span>
      <span className="kin-chip mono" title="Members of your bloodline alive right now">
        <Users size={14} /> {alive}
      </span>
      <span className="adv-sep" />
      <button className="icon-btn" onClick={() => ctl.togglePause()} aria-label={ctl.paused ? 'Play' : 'Pause'} title={ctl.paused ? 'Play (P)' : 'Pause (P)'}>
        {ctl.paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      <button className={`icon-btn ${autopilot ? 'active' : ''}`} aria-pressed={autopilot} onClick={() => setAutopilot(ctl, !autopilot)} title="Autopilot: let your creature's own brain drive (T)" aria-label="Autopilot">
        <Bot size={18} />
      </button>
      <button className={`icon-btn ${panelOpen ? 'active' : ''}`} aria-pressed={panelOpen} onClick={() => ui.set({ panelOpen: !panelOpen })} title="Look inside: brain, DNA and family (B)" aria-label="Inspect your creature">
        <Brain size={18} />
      </button>
      <button className="icon-btn" onClick={() => ui.set({ modal: 'guide', guideEntry: null })} title="Field guide (G)" aria-label="Field guide">
        <BookOpen size={18} />
      </button>
      <MusicToggle size={18} />
      <button className="icon-btn" onClick={onHome} title="Back to the start screen" aria-label="Exit adventure">
        <Home size={18} />
      </button>
    </div>
  );
}

function Goals() {
  const done = useStore(adv, (s) => s.goalsDone);
  const progress = useStore(adv, (s) => s.progress);
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  const pending = GOALS.filter((g) => !done.includes(g.id));
  const shown = pending.slice(0, 3);
  return (
    <section className="adv-goals glass" aria-label="Goals">
      <button className="adv-goals-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Trophy size={15} />
        <span>Goals</span>
        <span className="mono faint">
          {done.length}/{GOALS.length}
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <ul>
          {shown.map((g) => {
            const p = g.progress?.(progress);
            return (
              <li key={g.id} title={g.hint}>
                <span className="goal-title">{g.title}</span>
                <span className="goal-reward mono">+{g.reward}</span>
                {p && (
                  <span className="goal-bar">
                    <span style={{ width: `${(p[0] / p[1]) * 100}%` }} />
                  </span>
                )}
                <span className="goal-hint faint">{g.hint}</span>
              </li>
            );
          })}
          {pending.length === 0 && <li className="faint">Every goal complete. Keep your dynasty going!</li>}
        </ul>
      )}
    </section>
  );
}

function ActionBar({ c }: { c: Creature }) {
  const ctl = useSim();
  const ready = ctl.world.playerCanBreed();
  const hunter = c.traits.diet > 0.4;
  return (
    <div className="adv-actions">
      <button
        className={`adv-btn bite ${hunter ? 'hunter' : ''} ${c.biting ? 'on' : ''}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setBiteHeld(true);
        }}
        onPointerUp={() => setBiteHeld(false)}
        onPointerCancel={() => setBiteHeld(false)}
        onContextMenu={(e) => e.preventDefault()}
        title="Hold to bite (Space). Biting costs energy; it hurts whatever is in front of you."
      >
        <Swords size={22} />
        <span>Bite</span>
        <kbd>Space</kbd>
      </button>
      <button className={`adv-btn eggs ${ready.ready ? 'ready' : ''}`} onClick={() => openEvolveEditor(ctl)} title={ready.ready ? 'Lay eggs and evolve your next generation (E)' : ready.reason}>
        <Egg size={22} />
        <span>{ready.ready ? 'Lay eggs & evolve' : ready.reason}</span>
        <kbd>E</kbd>
      </button>
    </div>
  );
}

function ControlsHint() {
  const show = useStore(adv, (s) => s.showControls);
  if (!show) return null;
  return (
    <div className="adv-controls glass" aria-label="Controls">
      <span>
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> or arrows to swim
      </span>
      <span>or hold the mouse / finger where you want to go</span>
    </div>
  );
}

function DeathDialog({ onRestart }: { onRestart: () => void }) {
  const ctl = useSim();
  const lost = useStore(adv, (s) => s.lost);
  const heirs = ctl.world
    .playerLineageAlive()
    .slice()
    .sort((a, b) => b.generation - a.generation || b.energy / b.maxEnergy - a.energy / a.maxEnergy)
    .slice(0, 6);
  return (
    <Modal title={`${lost?.name ?? 'You'} ${CAUSE_TEXT[lost?.cause ?? ''] ?? 'died'}`} eyebrow="Your bloodline lives on" onClose={() => heirs[0] && continueAs(ctl, heirs[0].id)} size="md">
      <p className="lede">Death is part of evolution, but your genes live on in your family. Pick one to carry on as:</p>
      <ul className="heir-list">
        {heirs.map((h) => (
          <li key={h.id}>
            <button className="heir" onClick={() => continueAs(ctl, h.id)}>
              <Portrait creature={h} size={52} />
              <span className="heir-text">
                <strong>{h.name}</strong>
                <span className="faint mono">
                  gen {h.generation + 1} · {h.growth >= 1 ? 'adult' : `${Math.round(h.growth * 100)}% grown`} · energy {Math.round((h.energy / h.maxEnergy) * 100)}%
                </span>
              </span>
              <span className="heir-go">Play →</span>
            </button>
          </li>
        ))}
      </ul>
      <button className="link-btn" onClick={onRestart}>
        Or start over with a new design
      </button>
    </Modal>
  );
}

function ExtinctDialog({ onRestart, onHome }: { onRestart: () => void; onHome: () => void }) {
  const ctl = useSim();
  const s = useStore(adv, (x) => x);
  const lineage = ctl.world.player?.lineage.size ?? 1;
  return (
    <Modal
      title="Your bloodline is extinct"
      eyebrow={`${s.lost?.name ?? 'Your last creature'} ${CAUSE_TEXT[s.lost?.cause ?? ''] ?? 'died'}`}
      onClose={onHome}
      size="md"
      footer={
        <>
          <button className="btn ghost" onClick={onHome}>
            Back to start
          </button>
          <button className="btn primary" onClick={onRestart}>
            Design a new creature
          </button>
        </>
      }
    >
      <p className="lede">99% of all species that ever lived on Earth are extinct. Yours lasted:</p>
      <div className="extinct-stats">
        <div>
          <span className="mono">{formatTime(s.progress.survived)}</span>
          <span className="faint">survived</span>
        </div>
        <div>
          <span className="mono">{s.progress.generation + 1}</span>
          <span className="faint">generations</span>
        </div>
        <div>
          <span className="mono">{lineage}</span>
          <span className="faint">family members born</span>
        </div>
        <div>
          <span className="mono">{s.peakAlive}</span>
          <span className="faint">alive at the peak</span>
        </div>
        <div>
          <span className="mono">{s.goalsDone.length}</span>
          <span className="faint">goals</span>
        </div>
        <div>
          <span className="mono">{Math.floor(s.earned)}</span>
          <span className="faint">EP earned</span>
        </div>
      </div>
      <p className="faint">Tip: look at which designs survive best in the wild. Bodies that are cheap to run, and instincts that find food, tend to win.</p>
    </Modal>
  );
}
