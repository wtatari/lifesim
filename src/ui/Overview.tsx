import { MousePointer2, Crown, Baby, Swords, Lightbulb, Hourglass, Shuffle } from 'lucide-react';
import { useSim } from '../app/context.ts';
import { ui, openGuide } from '../app/ui.ts';
import { useStore } from '../app/store.ts';
import { getScenario } from '../content/scenarios.ts';
import type { Creature } from '../sim/creature.ts';
import { speciesName } from '../sim/species.ts';
import { hueColor, PAL } from '../render/palette.ts';
import { dietLabel } from './inspector/Inspector.tsx';
import { formatAge } from './common.tsx';

export function Overview() {
  const ctl = useSim();
  const w = ctl.world;
  const scenarioId = useStore(ui, (s) => s.scenarioId);
  const sc = getScenario(scenarioId);
  const species = w.species.living().sort((a, b) => b.population - a.population);
  const total = Math.max(1, w.creatures.length);
  const recent = w.stats.samples.filter((s) => s.t > w.time - 60);
  const births = recent.reduce((a, s) => a + s.births, 0);
  const deaths = recent.reduce((a, s) => a + s.deaths, 0);
  const spanSec = recent.length ? w.time - recent[0].t + w.stats.interval : 0;
  const rate = (n: number) => (spanSec >= 10 ? ((n / spanSec) * 60).toFixed(1) : '…');
  const skill = w.lastSkill;

  const pickBy = (score: (c: Creature) => number): Creature | null => {
    let best: Creature | null = null;
    let bs = 0;
    for (const c of w.creatures) {
      const s = score(c);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  };
  const notables: { icon: typeof Crown; label: string; c: Creature | null; value: (c: Creature) => string }[] = [
    { icon: Baby, label: 'Most babies', c: pickBy((c) => c.children), value: (c) => `${c.children} ${c.children === 1 ? 'baby' : 'babies'}` },
    { icon: Hourglass, label: 'Oldest', c: pickBy((c) => c.age), value: (c) => formatAge(c.age) },
    { icon: Swords, label: 'Top hunter', c: pickBy((c) => c.kills), value: (c) => `${c.kills} ${c.kills === 1 ? 'kill' : 'kills'}` },
    { icon: Lightbulb, label: 'Most learned', c: pickBy((c) => c.brain.learningEvents), value: (c) => `${c.brain.learningEvents} ${c.brain.learningEvents === 1 ? 'lesson' : 'lessons'}` },
  ];

  return (
    <section className="overview" aria-label="World overview">
      <div className="hint-card">
        <MousePointer2 size={18} />
        <div>
          <strong>Click any creature</strong> to look inside its brain, read its DNA and trace its family.
        </div>
      </div>

      <div className="ov-section">
        <div className="eyebrow">This world</div>
        <h2 className="ov-title">{sc.title}</h2>
        <p className="note">{sc.watch}</p>
      </div>

      <div className="stat-grid">
        <Stat label="Births / min" value={rate(births)} />
        <Stat label="Deaths / min" value={rate(deaths)} />
        <Stat
          label="Foraging skill"
          value={Number.isNaN(skill) ? '…' : skill.toFixed(1)}
          unit="plants/min"
          onInfo={() => openGuide('neuroevolution')}
        />
        <Stat label="Common ancestor" value={w.mrca ? `gen ${w.mrca.generation}` : 'none yet'} onInfo={() => openGuide('common-ancestor')} />
      </div>

      <div className="ov-section">
        <div className="ov-row">
          <div className="eyebrow">Species alive · {species.length}</div>
          <button className="link-btn" onClick={() => ui.set({ dockOpen: true, dockTab: 'species' })}>
            Tree of life
          </button>
        </div>
        <ul className="species-list" data-tour="species-list">
          {species.map((s) => {
            const d = dietLabel(s.avg.diet);
            const active = ctl.highlightSpecies === s.id;
            return (
              <li key={s.id}>
                <button
                  className={`species-item ${active ? 'active' : ''}`}
                  onClick={() => ctl.setHighlightSpecies(active ? null : s.id)}
                  title={active ? 'Show all species' : 'Highlight this species in the dish'}
                >
                  <span className="dot" style={{ background: hueColor(s.hue, 75, 62) }} />
                  <span className="species-main">
                    <span className="latin">{speciesName(s)}</span>
                    <span className="species-bar">
                      <span style={{ width: `${(s.population / total) * 100}%`, background: hueColor(s.hue, 70, 55) }} />
                    </span>
                  </span>
                  <span className="species-meta">
                    <span className="mono">{s.population}</span>
                    <span className="species-diet" style={{ color: d.color }}>
                      {d.label}
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn sm"
                  title="Select a random member"
                  aria-label={`Select a random ${speciesName(s)}`}
                  onClick={() => {
                    const members = w.creatures.filter((c) => c.speciesId === s.id);
                    if (members.length) ctl.select(members[Math.floor(Math.random() * members.length)].id, { focus: true });
                  }}
                >
                  <Shuffle size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ov-section">
        <div className="eyebrow">Notable creatures</div>
        <ul className="notables">
          {notables.map((n) =>
            n.c ? (
              <li key={n.label}>
                <button className="notable" onClick={() => ctl.select(n.c!.id, { focus: true })}>
                  <n.icon size={15} />
                  <span className="notable-label">{n.label}</span>
                  <span className="notable-name" style={{ color: hueColor(n.c.traits.hue, 75, 70) }}>
                    {n.c.name}
                  </span>
                  <span className="mono faint">{n.value(n.c)}</span>
                </button>
              </li>
            ) : null,
          )}
        </ul>
      </div>
      <p className="note faint">
        Tip: the colours mean the same everywhere. <span style={{ color: PAL.gfp }}>Green</span> is plants,{' '}
        <span style={{ color: PAL.berry }}>violet</span> berries, <span style={{ color: PAL.mcherry }}>red</span> meat & hunters,{' '}
        <span style={{ color: PAL.cfp }}>cyan</span> your selection.
      </p>
    </section>
  );
}

function Stat({ label, value, unit, onInfo }: { label: string; value: string; unit?: string; onInfo?: () => void }) {
  return (
    <div className="stat">
      <span className="eyebrow">
        {label}
        {onInfo && (
          <button className="info-dot" onClick={onInfo} aria-label={`About ${label}`}>
            ?
          </button>
        )}
      </span>
      <span className="stat-value mono">
        {value}
        {unit && <small> {unit}</small>}
      </span>
    </div>
  );
}
