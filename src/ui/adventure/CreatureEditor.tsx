import { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Egg, RotateCcw, Sparkles } from 'lucide-react';
import { useController } from '../../app/context.ts';
import { adv, closeEditor, dynastyName, layEggs, spawnPlayer } from '../../app/adventure.ts';
import { useStore } from '../../app/store.ts';
import {
  applyDietInstincts,
  designGenome,
  dietKind,
  evolveCost,
  FREE_GENES,
  GENE_GROUPS,
  PRESETS,
  presetBody,
} from '../../content/adventure.ts';
import { BRAIN_LEN } from '../../sim/brainLayout.ts';
import { Creature } from '../../sim/creature.ts';
import { G, GENE_INFO, seedForagerBrain, type GeneKey, type Genome } from '../../sim/genome.ts';
import { creatureName, genusName } from '../../sim/names.ts';
import { Rng } from '../../sim/rng.ts';
import { T } from '../../sim/tuning.ts';
import { drawCreatureShape } from '../../render/renderer.ts';
import { SpriteCache } from '../../render/sprites.ts';
import { Modal } from '../modals/Modal.tsx';
import { Slider } from '../common.tsx';

const rng = new Rng(Date.now());
const INFO = new Map(GENE_INFO.map((g) => [g.key, g]));
const DIET_WORD = { plants: 'plant-eater', both: 'omnivore', meat: 'meat-eater' } as const;

function starterBrain(diet: number): Float32Array {
  const b = new Float32Array(BRAIN_LEN);
  seedForagerBrain(b, rng, 0.08);
  applyDietInstincts(b, dietKind(diet));
  return b;
}

function previewCreature(g: Genome): Creature {
  return new Creature({ id: -1, name: '', genome: g, x: 0, y: 0, angle: 0, generation: 0, parentId: 0, mateId: 0, speciesId: 0, birthTime: 0, growth: 1, energyFraction: 1 });
}

/** Plain-number consequences of a design, so trade-offs are visible before committing. */
function derived(c: Creature) {
  const t = c.traits;
  const m = c.mass;
  const topSpeed = c.force / (m * T.drag);
  const rest =
    T.baseMetabolism * Math.pow(m, 0.75) + T.brainCost * t.hiddenCount + T.visionCost * t.visionRange * (0.5 + t.fov / (Math.PI * 2)) + T.plasticityCost * t.plasticity;
  const swim = rest + T.moveCost * c.force;
  return [
    { label: 'Top speed', value: `${Math.round(topSpeed)} μm/s`, f: topSpeed / 90, color: 'var(--cfp)' },
    { label: 'Energy tank', value: `${Math.round(c.maxEnergy)}`, f: c.maxEnergy / 330, color: 'var(--yfp)' },
    { label: 'Burn while swimming', value: `${swim.toFixed(1)}/s`, f: swim / 4, color: 'var(--mcherry)' },
    { label: 'Lasts on a full tank', value: `${Math.round(c.maxEnergy / swim)} s`, f: c.maxEnergy / swim / 160, color: 'var(--yfp)' },
    { label: 'Lifespan', value: `${Math.round(t.lifespan)} s`, f: t.lifespan / 300, color: 'var(--gfp)' },
    { label: 'Digests plants', value: `${Math.round(t.plantEff * 100)}%`, f: t.plantEff, color: 'var(--gfp)' },
    { label: 'Digests meat', value: `${Math.round(t.meatEff * 100)}%`, f: t.meatEff, color: 'var(--mcherry)' },
    { label: 'Turning', value: `${Math.round((c.turnRate * 180) / Math.PI)}°/s`, f: c.turnRate / 5, color: 'var(--cfp)' },
  ];
}

let sprites: SpriteCache | null = null;

function Preview({ creature }: { creature: Creature }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cref = useRef(creature);
  cref.current = creature;
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const size = 220;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    if (!sprites) sprites = new SpriteCache();
    let raf = 0;
    let clock = 0;
    let last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      const c = cref.current;
      c.swimPhase += dt * 10;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // A fixed scale, so size differences between designs are visible.
      const z = (size * 0.42) / 18;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * size * 0.56, dpr * size * 0.5);
      drawCreatureShape(ctx, sprites!, clock, c, 0, 0, Math.sin(clock * 0.7) * 0.18, z, false);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="editor-preview">
      <canvas ref={ref} style={{ width: 220, height: 220 }} aria-hidden="true" />
      <span className="reticle" aria-hidden="true" />
    </div>
  );
}

export function CreatureEditor({ mode, onExit }: { mode: 'create' | 'evolve'; onExit: () => void }) {
  const ctl = useController();
  const w = ctl.world;
  const player = mode === 'evolve' && w.player ? w.getCreature(w.player.id) : undefined;
  const ep = useStore(adv, (s) => Math.floor(s.ep));
  const dynasty = useStore(adv, (s) => s.dynasty);

  const [base] = useState<Genome>(() => {
    if (player) return designGenome(player.genome.body, player.brain.w);
    const body = presetBody(PRESETS[0]);
    return { body, brain: starterBrain(body[G.diet]) };
  });
  const [body, setBody] = useState<Float32Array>(() => base.body.slice());
  const [preset, setPreset] = useState(mode === 'create' ? PRESETS[0].id : '');
  const [name, setName] = useState(() => creatureName(rng));
  const [genus, setGenus] = useState(() => genusName(rng));
  const [epithet, setEpithet] = useState('ludens');
  const [clutch, setClutch] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const cost = mode === 'evolve' ? evolveCost(base.body, body) : 0;
  const dietChanged = dietKind(body[G.diet]) !== dietKind(base.body[G.diet]);

  const design = useMemo<Genome>(() => {
    const brain = base.brain.slice();
    if (mode === 'create' || dietChanged) applyDietInstincts(brain, dietKind(body[G.diet]));
    return { body: body.slice(), brain };
  }, [base, body, mode, dietChanged]);

  const creature = useMemo(() => previewCreature(design), [design]);
  const stats = useMemo(() => derived(creature), [creature]);
  const clutchInfo = mode === 'evolve' ? w.playerClutch(design) : null;
  const maxClutch = Math.max(0, Math.min(4, clutchInfo?.affordable ?? 0));
  const eggs = Math.max(1, Math.min(clutch, maxClutch));

  const setGene = (k: GeneKey, v: number) => {
    setBody((b) => {
      const n = b.slice();
      n[G[k]] = v;
      return n;
    });
    setPreset('');
    setError(null);
  };

  const onClose = () => {
    if (mode === 'create') onExit();
    else closeEditor(ctl);
  };

  const confirm = () => {
    if (mode === 'create') {
      const n = name.trim() || creatureName(rng);
      const gn = genus.trim() || genusName(rng);
      const ep2 = epithet.trim().toLowerCase() || 'ludens';
      spawnPlayer(ctl, design, n.charAt(0).toUpperCase() + n.slice(1), gn.charAt(0).toUpperCase() + gn.slice(1).toLowerCase(), ep2);
      return;
    }
    const err = layEggs(ctl, design, eggs, cost);
    if (err) setError(err);
  };

  const nextGen = (player?.generation ?? 0) + 1;
  const tooExpensive = cost > ep;
  const footer = (
    <div className="editor-foot">
      {mode === 'evolve' ? (
        <>
          <div className="editor-budget">
            <span className={`ep-chip mono ${tooExpensive ? 'over' : ''}`} title="Evolution points: earned by eating, winning fights and completing goals">
              <Sparkles size={14} /> {cost} / {ep} EP
            </span>
            <span className="clutch" role="group" aria-label="Number of eggs">
              <span className="faint">Eggs</span>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className="clutch-btn" aria-pressed={eggs === n} disabled={n > maxClutch} onClick={() => setClutch(n)}>
                  {n}
                </button>
              ))}
            </span>
          </div>
          {error && <span className="editor-error">{error}</span>}
          <button className="btn ghost" onClick={() => setBody(base.body.slice())} disabled={cost === 0}>
            <RotateCcw size={15} /> Undo changes
          </button>
          <button className="btn primary" onClick={confirm} disabled={tooExpensive || maxClutch < 1}>
            <Egg size={16} /> Lay {eggs} egg{eggs > 1 ? 's' : ''}
          </button>
        </>
      ) : (
        <button className="btn primary big" onClick={confirm}>
          <Sparkles size={17} /> Release into the dish
        </button>
      )}
    </div>
  );

  return (
    <Modal
      title={mode === 'create' ? 'Design your creature' : `Evolve ${dynastyName(dynasty, nextGen)}`}
      eyebrow={mode === 'create' ? 'Adventure · generation 1' : `Lay eggs · generation ${nextGen + 1}`}
      onClose={onClose}
      size="xl"
      className="creature-editor"
      footer={footer}
    >
      <div className="editor-grid">
        <div className="editor-left">
          <Preview creature={creature} />
          {mode === 'create' ? (
            <>
              <div className="editor-names">
                <label>
                  <span className="eyebrow">Name</span>
                  <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
                </label>
                <button className="icon-btn" onClick={() => setName(creatureName(rng))} title="Random name" aria-label="Random name">
                  <Dices size={17} />
                </button>
              </div>
              <div className="editor-names">
                <label>
                  <span className="eyebrow">Species</span>
                  <span className="species-inputs">
                    <input className="latin" value={genus} maxLength={14} onChange={(e) => setGenus(e.target.value)} aria-label="Genus" />
                    <input className="latin" value={epithet} maxLength={14} onChange={(e) => setEpithet(e.target.value)} aria-label="Species epithet" />
                  </span>
                </label>
                <button className="icon-btn" onClick={() => setGenus(genusName(rng))} title="Random genus" aria-label="Random genus">
                  <Dices size={17} />
                </button>
              </div>
            </>
          ) : (
            <p className="editor-note">
              Your baby gets <strong>exactly this body</strong>; its brain mutates a little, like everyone's. Any brothers and sisters get random mutations instead and live on their own. Will your design beat theirs?
            </p>
          )}
          <div className="editor-diet">
            You are a <strong className={`diet-${dietKind(body[G.diet])}`}>{DIET_WORD[dietKind(body[G.diet])]}</strong>.
            {mode === 'evolve' && dietChanged && <span className="faint"> Changing diet rewires your instincts for the new food.</span>}
          </div>
          <dl className="editor-stats">
            {stats.map((s) => (
              <div key={s.label} className="editor-stat">
                <dt>{s.label}</dt>
                <dd className="mono">{s.value}</dd>
                <span className="editor-stat-bar">
                  <span style={{ width: `${Math.max(3, Math.min(100, s.f * 100))}%`, background: s.color }} />
                </span>
              </div>
            ))}
          </dl>
        </div>

        <div className="editor-right">
          {mode === 'create' && (
            <div className="preset-row" role="group" aria-label="Starting body plan">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className="preset-btn"
                  aria-pressed={preset === p.id}
                  title={p.blurb}
                  onClick={() => {
                    setBody(presetBody(p));
                    setPreset(p.id);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {mode === 'create' && preset && <p className="faint preset-blurb">{PRESETS.find((p) => p.id === preset)?.blurb}</p>}
          {GENE_GROUPS.map((grp) => (
            <fieldset key={grp.title} className="gene-group">
              <legend className="eyebrow">{grp.title}</legend>
              {grp.genes.map((k) => {
                const info = INFO.get(k)!;
                const v = body[G[k]];
                const was = base.body[G[k]];
                const changed = mode === 'evolve' && Math.abs(v - was) > 0.005;
                return (
                  <div key={k} className={`gene-row ${changed ? 'changed' : ''}`} title={info.desc}>
                    <div className="gene-row-head">
                      <label htmlFor={`gene-${k}`}>{info.label}</label>
                      <span className="mono gene-val">
                        {info.format(v)}
                        {changed && !FREE_GENES.includes(k) && <span className="gene-cost"> · {Math.round(Math.abs(v - was) * 10 * 10) / 10} EP</span>}
                      </span>
                    </div>
                    <div className={`gene-slider ${k === 'hue' ? 'hue-slider' : ''}`}>
                      {mode === 'evolve' && <span className="gene-was" style={{ left: `${was * 100}%` }} aria-hidden="true" />}
                      <Slider id={`gene-${k}`} value={v} min={0} max={1} step={0.01} onChange={(x) => setGene(k, x)} label={info.label} />
                    </div>
                    {(info.low || info.high) && (
                      <div className="gene-ends faint">
                        <span>{info.low}</span>
                        <span>{info.high}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      </div>
    </Modal>
  );
}
