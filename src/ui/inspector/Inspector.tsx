import { Copy, Crosshair, LocateFixed, X, Heart, Baby, Skull } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSim } from '../../app/context.ts';
import { ui, type InspectorTab } from '../../app/ui.ts';
import { useStore } from '../../app/store.ts';
import { discover, notePlayerSelection } from '../../app/discoveryEngine.ts';
import { analyseInstincts } from '../../sim/instincts.ts';
import { toDnaCode } from '../../sim/genome.ts';
import type { Creature } from '../../sim/creature.ts';
import { speciesName } from '../../sim/species.ts';
import { hueColor, PAL } from '../../render/palette.ts';
import { formatAge, formatTime, Meter } from '../common.tsx';
import { BrainView } from './BrainView.tsx';
import { Portrait } from './Portrait.tsx';
import { BodyTab } from './BodyTab.tsx';
import { DnaTab } from './DnaTab.tsx';
import { FamilyTab } from './FamilyTab.tsx';
import { copyText } from '../clipboard.ts';

export function dietLabel(diet: number): { label: string; color: string } {
  if (diet < 0.35) return { label: 'Grazer', color: PAL.gfp };
  if (diet > 0.65) return { label: 'Hunter', color: PAL.mcherry };
  return { label: 'Omnivore', color: PAL.yfp };
}

export function Inspector() {
  const ctl = useSim();
  const c = ctl.selected();
  const rec = ctl.selectedRecord();
  const tab = useStore(ui, (s) => s.inspectorTab);
  if (!c && !rec) return null;
  const id = c?.id ?? rec!.id;
  const name = c?.name ?? rec!.name;
  const speciesId = c?.speciesId ?? rec!.speciesId;
  const sp = ctl.world.species.get(speciesId);
  const gen = c?.generation ?? rec!.generation;
  const diet = dietLabel(c?.traits.diet ?? rec!.diet);
  const hue = c?.traits.hue ?? rec!.hue;

  const tabs: { id: InspectorTab; label: string }[] = [
    { id: 'brain', label: 'Brain' },
    { id: 'body', label: 'Body' },
    { id: 'dna', label: 'DNA' },
    { id: 'family', label: 'Family' },
  ];

  return (
    <section className="inspector" aria-label={`Specimen ${name}`}>
      <div className="insp-head">
        <Portrait creature={c} size={92} />
        <div className="insp-title">
          <div className="eyebrow mono">
            Specimen #{id} · Gen {gen}
          </div>
          <h2 className="insp-name">{name}</h2>
          <div className="insp-species">
            <span className="dot" style={{ background: hueColor(sp?.hue ?? hue, 75, 62) }} />
            {sp ? <span className="latin">{speciesName(sp)}</span> : <span className="faint">unknown species</span>}
          </div>
          <div className="insp-badges">
            <span className="chip" style={{ borderColor: diet.color, color: diet.color }}>
              {diet.label}
            </span>
            {c && !c.isAdult && (
              <span className="chip">
                <Baby size={12} /> growing up
              </span>
            )}
            {c?.favored && (
              <span className="chip" style={{ color: PAL.yfp }}>
                <Heart size={11} /> fed by you
              </span>
            )}
            {!c && (
              <span className="chip" style={{ color: PAL.mcherry, borderColor: 'rgba(255,93,122,.4)' }}>
                <Skull size={11} /> died
              </span>
            )}
          </div>
        </div>
        <div className="insp-actions">
          <button className="icon-btn sm" onClick={() => ctl.select(null)} aria-label="Close inspector" title="Close (Esc)">
            <X size={16} />
          </button>
          {c && (
            <>
              <button
                className={`icon-btn sm ${ctl.follow ? 'active' : ''}`}
                onClick={() => ctl.setFollow(!ctl.follow)}
                aria-pressed={ctl.follow}
                aria-label="Follow with camera"
                title="Follow with the camera (F)"
                data-tour="follow"
              >
                <LocateFixed size={16} />
              </button>
              <button className="icon-btn sm" onClick={() => ctl.select(c.id, { focus: true })} aria-label="Zoom to creature" title="Zoom in on it">
                <Crosshair size={16} />
              </button>
              <button
                className="icon-btn sm"
                onClick={async () => {
                  await copyText(toDnaCode(c.genome));
                  discover('engineer', ctl.world.time);
                  ui.set({});
                }}
                aria-label="Copy DNA code"
                title="Copy its DNA code (paste it into any LifeSim world)"
              >
                <Copy size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {c ? (
        <>
          <div className="insp-vitals">
            <Meter label="Energy" value={c.energy / c.maxEnergy} color={PAL.yfp} right={`${Math.round(c.energy)}/${Math.round(c.maxEnergy)}`} />
            <Meter label="Health" value={c.health / c.maxHealth} color={PAL.gfp} right={`${Math.round((c.health / c.maxHealth) * 100)}%`} />
            <Meter
              label="Age"
              value={c.age / c.traits.lifespan}
              color={c.age > c.traits.lifespan ? PAL.mcherry : PAL.ink2}
              right={`${formatAge(c.age)} / ${formatAge(c.traits.lifespan)}`}
            />
          </div>
          <div className="tabs" role="tablist" data-tour="inspector-tabs">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => ui.set({ inspectorTab: t.id })} data-tour={`tab-${t.id}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="insp-body scroll">
            {tab === 'brain' && <BrainTab c={c} />}
            {tab === 'body' && <BodyTab c={c} />}
            {tab === 'dna' && <DnaTab c={c} />}
            {tab === 'family' && <FamilyTab id={c.id} />}
          </div>
          <div className="insp-footer">
            <button
              className="btn sm"
              onClick={() => {
                ctl.world.feed(c.id);
                ctl.renderer?.effects.add('feed', c.x, c.y, PAL.yfp, c.radius);
                notePlayerSelection();
                ctl.touch();
              }}
              title="Fill its energy and heal it"
            >
              <Heart size={13} /> Feed
            </button>
            <button
              className="btn sm"
              onClick={() => {
                const b = ctl.world.cloneCreature(c.id);
                if (b) ctl.renderer?.effects.add('birth', b.x, b.y, PAL.cfp, b.radius + 4);
                notePlayerSelection();
                ctl.touch();
              }}
              title="Make it have a baby right now: artificial selection"
            >
              <Baby size={13} /> Breed
            </button>
            <button
              className="btn sm danger"
              onClick={() => {
                ctl.renderer?.effects.add('smite', c.x, c.y, '#d9f0ff', c.radius);
                ctl.world.smite(c.id);
                ctl.touch();
              }}
              title="Remove it from the gene pool"
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <DeadSummary id={id} />
      )}
    </section>
  );
}

function DeadSummary({ id }: { id: number }) {
  const ctl = useSim();
  const rec = ctl.world.records.get(id)!;
  return (
    <div className="insp-body scroll">
      <div className="dead-card">
        <p>
          <strong>{rec.name}</strong> died {rec.cause === 'eaten' ? 'in a hunter’s jaws' : rec.cause === 'starved' ? 'of starvation' : rec.cause === 'old age' ? 'of old age' : rec.cause === 'poisoned' ? 'from poisonous berries' : rec.cause === 'meteor' ? 'in a meteor strike' : 'by your hand'} at T+{formatTime(rec.died ?? 0)}, aged {formatAge((rec.died ?? 0) - rec.born)}.
        </p>
        <dl className="kv">
          <dt>Babies</dt>
          <dd className="mono">{rec.children}</dd>
          <dt>Plants & berries eaten</dt>
          <dd className="mono">{rec.plantsEaten}</dd>
          <dt>Kills</dt>
          <dd className="mono">{rec.kills}</dd>
        </dl>
        <p className="faint">{rec.children > 0 ? 'Its genes live on in its descendants.' : 'It left no babies: its exact genes are gone.'}</p>
      </div>
      <FamilyTab id={id} />
    </div>
  );
}

const TASTE_LABELS = [
  { label: 'Plants', color: PAL.gfp },
  { label: 'Berries', color: PAL.berry },
  { label: 'Meat', color: PAL.mcherry },
];

function BrainTab({ c }: { c: Creature }) {
  const ctl = useSim();
  // Re-analyse a couple of times per second (cheap).
  const bucket = Math.floor(ctl.version / 3);
  const instincts = useMemo(() => analyseInstincts(c.brain, ctl.world.config.predation), [c, bucket, ctl.world.config.predation]);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? instincts : instincts.slice(0, 4);
  return (
    <div className="brain-tab">
      <BrainView creature={c} />
      <div className="insp-section" data-tour="instincts">
        <h3 className="section-title">
          What its brain does <span className="faint">(probed live)</span>
        </h3>
        <ul className="instincts">
          {shown.map((i) => (
            <li key={i.text} className={`tone-${i.tone}`}>
              <span className="instinct-bar" style={{ width: `${Math.min(100, i.strength * 60)}%` }} />
              {i.text}
            </li>
          ))}
        </ul>
        {instincts.length > 4 && (
          <button className="btn sm ghost" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show fewer' : `Show all ${instincts.length}`}
          </button>
        )}
      </div>
      <div className="insp-section" data-tour="tastes">
        <h3 className="section-title">Learned tastes</h3>
        {c.brain.plastic ? (
          <>
            <div className="tastes">
              {TASTE_LABELS.map((t, k) => {
                const v = c.brain.liking[k];
                const pos = ((v + 1.5) / 3.5) * 100;
                const one = ((1 + 1.5) / 3.5) * 100;
                const zero = (1.5 / 3.5) * 100;
                return (
                  <div className="taste" key={t.label}>
                    <span className="taste-label">{t.label}</span>
                    <div className="taste-track">
                      <span className="taste-zero" style={{ left: `${zero}%` }} />
                      <span className="taste-instinct" style={{ left: `${one}%` }} title="Instinct (no learning)" />
                      <span className="taste-fill" style={{ left: `${Math.min(pos, one)}%`, width: `${Math.abs(pos - one)}%`, background: v < 1 ? PAL.mcherry : t.color }} />
                      <span className="taste-knob" style={{ left: `${pos}%`, borderColor: v < 0 ? PAL.mcherry : t.color }} />
                    </div>
                    <span className={`taste-val mono ${v < 0 ? 'neg' : ''}`}>{v < 0 ? 'avoids' : `×${v.toFixed(2)}`}</span>
                  </div>
                );
              })}
            </div>
            <p className="note">
              Tasty meals turn a liking up, poison turns it down; below zero the brain’s wiring for that food flips and it steers away. Learning rate: <span className="mono">{Math.round(c.traits.plasticity * 100)}%</span>. Learned this life: <span className="mono">{c.brain.learningEvents}</span> lessons.
            </p>
          </>
        ) : (
          <p className="note">This creature cannot learn: its learning-rate gene is almost zero, so it lives by instinct alone. That saves energy.</p>
        )}
      </div>
    </div>
  );
}
