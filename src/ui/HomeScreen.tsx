import { useEffect, useState } from 'react';
import { ArrowRight, Check, Egg, Gamepad2, GraduationCap, History, Microscope, Sparkles } from 'lucide-react';
import { ui } from '../app/ui.ts';
import { useStore } from '../app/store.ts';
import { loadSaveMeta, type SaveMeta } from '../app/persist.ts';
import { LESSONS } from '../content/lessons.ts';
import { SCENARIOS } from '../content/scenarios.ts';
import { DISCOVERIES } from '../content/discoveries.ts';
import { formatTime, Logo } from './common.tsx';
import { MusicToggle } from './MusicToggle.tsx';

export function HomeScreen({
  onLesson,
  onScenario,
  onContinue,
  onAdventure,
}: {
  onLesson: (id: string) => void;
  onScenario: (id: string) => void;
  onContinue: () => void;
  onAdventure: () => void;
}) {
  const completed = useStore(ui, (s) => s.completedLessons);
  const discovered = useStore(ui, (s) => s.discovered.length);
  const [save, setSave] = useState<SaveMeta | null>(null);
  useEffect(() => {
    loadSaveMeta().then(setSave);
  }, []);
  const nextLesson = LESSONS.find((l) => !completed.includes(l.id)) ?? LESSONS[0];

  return (
    <div className="home">
      <div className="home-scrim" aria-hidden="true" />
      <main className="home-main scroll">
        <div className="home-hero">
          <div className="home-brand">
            <Logo size={40} />
            <span className="brand-name">LifeSim</span>
            <span className="live-chip mono">
              <span className="live-dot" /> live specimen
            </span>
            <MusicToggle />
          </div>
          <h1 className="home-title">
            Evolve minds
            <br />
            in a petri dish.
          </h1>
          <p className="home-lede">
            Every creature here has a <strong>neural-network brain</strong> and <strong>DNA</strong>. They hunt, graze, learn and breed, and with every generation natural selection reshapes their bodies and rewires their brains. Watch it happen, look inside, and change the rules.
          </p>
          <div className="home-cta">
            <button className="btn primary big" onClick={() => onLesson(nextLesson.id)}>
              <GraduationCap size={18} />
              {completed.length === 0 ? 'Start the Academy' : `Continue the Academy: ${nextLesson.title}`}
            </button>
            <button className="btn big adventure-cta" onClick={onAdventure}>
              <Gamepad2 size={18} /> Create your creature
            </button>
            <button className="btn big" onClick={() => onScenario('ecosystem')}>
              <Microscope size={18} /> Open the sandbox
            </button>
            {save && (
              <button className="btn big ghost" onClick={onContinue} title={`Saved ${new Date(save.savedAt).toLocaleString()}`}>
                <History size={18} /> Resume “{save.name}” · T+{formatTime(save.time)} · gen {save.generation}
              </button>
            )}
          </div>
          <div className="home-meta">
            <span>
              <Sparkles size={14} /> {discovered}/{DISCOVERIES.length} discoveries
            </span>
            <span>
              <GraduationCap size={14} /> {completed.length}/{LESSONS.length} lessons
            </span>
          </div>
        </div>

        <section className="home-section" aria-labelledby="adventure-h">
          <button className="adventure-card" onClick={onAdventure}>
            <span className="adventure-card-icon" aria-hidden="true">
              <Egg size={26} />
            </span>
            <span className="adventure-card-text">
              <span className="eyebrow">Adventure mode</span>
              <strong id="adventure-h">Design a creature. Play as it. Evolve your bloodline.</strong>
              <span>
                Build a body from DNA, then swim, eat, fight and lay eggs. Each generation you spend evolution points to redesign your baby, while its wild brothers and sisters mutate on their own. Can your design out-compete natural selection?
              </span>
            </span>
            <ArrowRight size={18} className="lesson-arrow" />
          </button>
        </section>

        <section className="home-section" aria-labelledby="academy-h">
          <div className="home-section-head">
            <h2 id="academy-h">The Academy</h2>
            <p>Six short, hands-on lessons. Each one sets up a world and guides you through an idea.</p>
          </div>
          <ol className="lesson-list">
            {LESSONS.map((l, i) => {
              const done = completed.includes(l.id);
              return (
                <li key={l.id}>
                  <button className={`lesson-card ${done ? 'done' : ''}`} onClick={() => onLesson(l.id)}>
                    <span className="lesson-num mono">{done ? <Check size={15} /> : String(i + 1).padStart(2, '0')}</span>
                    <span className="lesson-text">
                      <strong>{l.title}</strong>
                      <span>{l.subtitle}</span>
                    </span>
                    <span className="lesson-min mono">{l.minutes} min</span>
                    <ArrowRight size={16} className="lesson-arrow" />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="home-section" aria-labelledby="sandbox-h">
          <div className="home-section-head">
            <h2 id="sandbox-h">Sandbox worlds</h2>
            <p>Pick a starting point, then use the Lab controls to change food, seasons, mutation and more.</p>
          </div>
          <div className="scenario-grid home-scenarios">
            {SCENARIOS.map((s) => (
              <button key={s.id} className="scenario-card" onClick={() => onScenario(s.id)}>
                <span className="eyebrow">{s.tagline}</span>
                <strong>{s.title}</strong>
                <span>{s.description}</span>
              </button>
            ))}
          </div>
        </section>
        <footer className="home-foot faint">
          Runs entirely in your browser. Built with a custom simulation engine, Canvas and React.
        </footer>
      </main>
    </div>
  );
}
