import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Trophy } from 'lucide-react';
import { discover } from '../../app/discoveryEngine.ts';
import { openGuide, ui } from '../../app/ui.ts';
import { b2Index, w3Index } from '../../sim/brain.ts';
import { IN, OUT } from '../../sim/brainLayout.ts';
import type { Creature } from '../../sim/creature.ts';
import { G, randomGenome } from '../../sim/genome.ts';
import { T } from '../../sim/tuning.ts';
import { World } from '../../sim/world.ts';
import { Renderer } from '../../render/renderer.ts';
import { PAL } from '../../render/palette.ts';
import { Slider } from '../common.tsx';
import { Modal } from '../modals/Modal.tsx';

const GOAL = 5;
const WINDOW = 20;

function makeArena(): { world: World; c: Creature } {
  const world = new World(
    {
      seed: 'neuron-lab',
      radius: 240,
      startPopulation: 0,
      plantRate: 0,
      maxPlants: 12,
      hotspotShare: 0,
      berryShare: 0,
      seasonAmp: 0,
      predation: false,
      reproduction: false,
      lifeSupport: 0,
      recordStats: false,
      benchmark: false,
    },
    { empty: true },
  );
  world.recordEvents = false;
  for (let i = 0; i < 10; i++) world.spawnPlant(0);
  for (const p of world.plants) {
    p.energy = p.maxEnergy;
    p.r = T.plantRadius;
  }
  const g = randomGenome(world.rng, { hue: 0.36 });
  g.brain.fill(0);
  g.body[G.size] = 0.4;
  g.body[G.speed] = 0.55;
  g.body[G.vision] = 0.55;
  g.body[G.fov] = 0.55;
  g.body[G.plasticity] = 0;
  g.body[G.brain] = 0;
  g.brain[b2Index(OUT.thrust)] = 0.85;
  g.brain[b2Index(OUT.bite)] = -2;
  const sp = world.species.create(g, 0, null, 0, world.rng, true);
  const c = world.addCreature(g, 0, 0, 0, { species: sp, generation: 0, growth: 1, energyFraction: 0.5 });
  return { world, c };
}

/**
 * A creature driven by ONE neuron: Turn = tanh(weight × plant direction + bias).
 * The learner tunes the weight and bias by hand to make it find food.
 */
export function NeuronLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [weight, setWeight] = useState(-1.5);
  const [bias, setBias] = useState(0.3);
  const [live, setLive] = useState({ x: 0, sum: 0, out: 0, eaten: 0 });
  const [won, setWon] = useState(false);
  const arena = useRef(makeArena());
  const params = useRef({ weight, bias });
  params.current = { weight, bias };
  const eatTimes = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new Renderer(canvas);
    r.fit(arena.current.world.config.radius, true);
    const ro = new ResizeObserver(() => {
      r.resize();
      r.fit(arena.current.world.config.radius, true);
    });
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let uiTimer = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { world, c } = arena.current;
      c.brain.w[w3Index(OUT.turn, IN.plantDir)] = params.current.weight;
      c.brain.w[b2Index(OUT.turn)] = params.current.bias;
      acc += dt;
      while (acc >= T.dt) {
        acc -= T.dt;
        const before = c.plantsEaten;
        world.step();
        c.energy = c.maxEnergy * 0.5;
        c.health = c.maxHealth;
        c.age = 5;
        if (c.plantsEaten > before) {
          eatTimes.current.push(world.time);
          const p = world.spawnPlant(0);
          if (p) {
            p.energy = p.maxEnergy;
            p.r = T.plantRadius;
          }
        }
      }
      eatTimes.current = eatTimes.current.filter((t) => t > world.time - WINDOW);
      r.render(world, { selectedId: c.id, hoveredId: null, highlightSpecies: null, showVision: true, trail: null, pointer: null, toolRadius: 0, toolColor: PAL.cfp, alpha: acc / T.dt }, dt);
      uiTimer += dt;
      if (uiTimer > 0.1) {
        uiTimer = 0;
        const x = c.brain.input[IN.plantDir];
        const sum = params.current.weight * x + params.current.bias;
        setLive({ x, sum, out: c.brain.output[OUT.turn], eaten: eatTimes.current.length });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!won && live.eaten >= GOAL) {
      setWon(true);
      discover('neuron-lab');
    }
  }, [live.eaten, won]);

  const reset = () => {
    arena.current = makeArena();
    eatTimes.current = [];
    setWon(false);
  };

  // tanh plot geometry
  const PW = 220;
  const PH = 110;
  const px = (s: number) => PW / 2 + (s / 4) * (PW / 2 - 10);
  const py = (o: number) => PH / 2 - o * (PH / 2 - 10);
  let curve = '';
  for (let s = -4; s <= 4.001; s += 0.1) curve += `${curve ? 'L' : 'M'}${px(s).toFixed(1)},${py(Math.tanh(s)).toFixed(1)}`;
  const sumClamped = Math.max(-4, Math.min(4, live.sum));

  return (
    <Modal title="Neuron Lab" eyebrow="One neuron, one decision" onClose={() => ui.set({ modal: null })} size="xl" className="neuron-modal">
      <div className="neuron-lab">
        <div className="nl-arena">
          <canvas ref={canvasRef} className="nl-canvas" aria-label="A creature controlled by one neuron" role="img" />
          <div className={`nl-score ${won ? 'won' : ''}`}>
            {won ? (
              <>
                <Trophy size={16} /> Challenge complete! It found {GOAL} plants in under {WINDOW} s.
              </>
            ) : (
              <>
                Plants eaten in the last {WINDOW} s: <span className="mono">{live.eaten}</span> / {GOAL}
              </>
            )}
          </div>
          <button className="btn sm nl-reset" onClick={reset}>
            <RotateCcw size={13} /> Reset arena
          </button>
        </div>

        <div className="nl-side">
          <ol className="nl-steps">
            <li className={weight < 0 ? 'now' : 'done'}>
              Right now the weight is <strong>negative</strong>: when a plant is on the right (direction &gt; 0), the neuron says turn <em>left</em>, away from food.
            </li>
            <li className={weight > 0 ? (won ? 'done' : 'now') : ''}>
              Drag the <strong>weight</strong> above zero, so a plant on the right means turn right.
            </li>
            <li className={won ? 'done' : ''}>
              Larger weights turn harder. Use the <strong>bias</strong> to remove any drift. Goal: {GOAL} plants in {WINDOW} seconds.
            </li>
          </ol>

          <svg className="nl-diagram" viewBox="0 0 330 150" role="img" aria-label="Neuron diagram">
            <defs>
              <marker id="nl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#a9b6c7" />
              </marker>
            </defs>
            <g>
              <circle cx="40" cy="58" r="20" fill="#060b12" stroke={PAL.gfp} strokeWidth="2" />
              <text x="40" y="62" textAnchor="middle" className="svg-val">{live.x.toFixed(2)}</text>
              <text x="40" y="96" textAnchor="middle" className="svg-cap">Plant direction</text>
            </g>
            <line x1="62" y1="58" x2="146" y2="66" stroke={weight >= 0 ? PAL.cfp : PAL.mcherry} strokeWidth={1 + Math.min(6, Math.abs(weight) * 1.5)} strokeLinecap="round" />
            <text x="104" y="52" textAnchor="middle" className="svg-cap" fill={weight >= 0 ? PAL.cfp : PAL.mcherry}>
              × {weight.toFixed(2)}
            </text>
            <g>
              <circle cx="40" cy="130" r="9" fill="#060b12" stroke="#6f7d90" strokeWidth="1.5" />
              <text x="40" y="133" textAnchor="middle" className="svg-cap">1</text>
              <line x1="50" y1="126" x2="150" y2="86" stroke={bias >= 0 ? PAL.cfp : PAL.mcherry} strokeWidth={1 + Math.abs(bias) * 2} strokeLinecap="round" opacity="0.8" />
              <text x="86" y="140" textAnchor="start" className="svg-cap">bias {bias >= 0 ? '+' : ''}{bias.toFixed(2)}</text>
            </g>
            <circle cx="174" cy="72" r="28" fill="#060b12" stroke={PAL.yfp} strokeWidth="2" />
            <text x="174" y="67" textAnchor="middle" className="svg-cap">Σ · tanh</text>
            <text x="174" y="84" textAnchor="middle" className="svg-val">{live.out.toFixed(2)}</text>
            <text x="174" y="118" textAnchor="middle" className="svg-cap">neuron</text>
            <line x1="204" y1="72" x2="252" y2="72" stroke="#a9b6c7" strokeWidth="1.5" markerEnd="url(#nl-arrow)" />
            <text x="290" y="68" textAnchor="middle" className="svg-big">{live.out > 0.15 ? 'turn ↻' : live.out < -0.15 ? 'turn ↺' : 'straight'}</text>
            <text x="290" y="88" textAnchor="middle" className="svg-cap">Turn</text>
          </svg>

          <div className="nl-math mono">
            sum = {weight.toFixed(2)} × {live.x.toFixed(2)} {bias >= 0 ? '+' : '−'} {Math.abs(bias).toFixed(2)} = {live.sum.toFixed(2)} → tanh → {live.out.toFixed(2)}
          </div>

          <div className="nl-controls">
            <label htmlFor="nl-weight">
              Weight <span className={`mono ${weight >= 0 ? 'pos' : 'neg'}`}>{weight.toFixed(2)}</span>
            </label>
            <Slider id="nl-weight" min={-4} max={4} step={0.05} value={weight} onChange={setWeight} label="Weight" />
            <label htmlFor="nl-bias">
              Bias <span className={`mono ${bias >= 0 ? 'pos' : 'neg'}`}>{bias.toFixed(2)}</span>
            </label>
            <Slider id="nl-bias" min={-2} max={2} step={0.05} value={bias} onChange={setBias} label="Bias" />
          </div>

          <div className="nl-tanh">
            <svg viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Activation function">
              <line x1={0} y1={PH / 2} x2={PW} y2={PH / 2} stroke="rgba(150,190,235,0.15)" />
              <line x1={PW / 2} y1={0} x2={PW / 2} y2={PH} stroke="rgba(150,190,235,0.15)" />
              <path d={curve} fill="none" stroke={PAL.yfp} strokeWidth="2" />
              <circle cx={px(sumClamped)} cy={py(Math.tanh(sumClamped))} r="5" fill={PAL.cfp} />
              <text x={6} y={12} className="svg-cap">+1</text>
              <text x={6} y={PH - 4} className="svg-cap">−1</text>
            </svg>
            <p className="note">
              The activation function <strong>tanh</strong> squashes any sum into −1…+1. Small sums pass through; huge sums saturate.{' '}
              <button className="link-btn" onClick={() => openGuide('neuron')}>
                More about neurons
              </button>
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
