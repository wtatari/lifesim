import { useState } from 'react';
import { Dice5, Lock } from 'lucide-react';
import { useSim } from '../../app/context.ts';
import { openGuide, pushToast, ui } from '../../app/ui.ts';
import { useStore } from '../../app/store.ts';
import { discover } from '../../app/discoveryEngine.ts';
import { DISCOVERIES } from '../../content/discoveries.ts';
import { SCENARIOS } from '../../content/scenarios.ts';
import { fromDnaCode } from '../../sim/genome.ts';
import { DEFAULT_CONFIG, type WorldConfig } from '../../sim/world.ts';
import { DISCOVERY_ICONS } from '../Toasts.tsx';
import { Slider } from '../common.tsx';
import { Modal } from './Modal.tsx';

export const DISH_SIZES = [
  { id: 'small', label: 'Small', radius: 600, note: '~40 creatures · fast' },
  { id: 'medium', label: 'Medium', radius: 800, note: '~80 creatures' },
  { id: 'large', label: 'Large', radius: 1100, note: '~150 creatures · slower' },
] as const;

export function sizeOverrides(radius: number): Partial<WorldConfig> {
  const k = (radius / DEFAULT_CONFIG.radius) ** 2;
  return { radius, plantRate: DEFAULT_CONFIG.plantRate * k, maxPlants: Math.round(DEFAULT_CONFIG.maxPlants * k) };
}

export function NewWorldDialog({ onCreate }: { onCreate: (scenarioId: string, overrides: Partial<WorldConfig>) => void }) {
  const current = useStore(ui, (s) => s.scenarioId);
  const [scenario, setScenario] = useState(current);
  const [size, setSize] = useState<number>(800);
  const [pop, setPop] = useState(50);
  const [seed, setSeed] = useState('');
  const sc = SCENARIOS.find((s) => s.id === scenario)!;
  return (
    <Modal
      title="New world"
      eyebrow="Start a fresh experiment"
      onClose={() => ui.set({ modal: null })}
      size="lg"
      footer={
        <>
          <span className="faint">Your current world is saved automatically every minute.</span>
          <button
            className="btn primary"
            onClick={() => {
              const overrides: Partial<WorldConfig> = { ...sizeOverrides(size) };
              if (sc.config.startPopulation !== 0) overrides.startPopulation = Math.round(pop * (size / 800) ** 2);
              if (seed.trim()) overrides.seed = seed.trim();
              onCreate(scenario, overrides);
            }}
          >
            Create world
          </button>
        </>
      }
    >
      <div className="scenario-grid">
        {SCENARIOS.map((s) => (
          <button key={s.id} className={`scenario-card ${scenario === s.id ? 'active' : ''}`} onClick={() => setScenario(s.id)} aria-pressed={scenario === s.id}>
            <span className="eyebrow">{s.tagline}</span>
            <strong>{s.title}</strong>
            <span>{s.description}</span>
          </button>
        ))}
      </div>
      <div className="form-grid">
        <div className="form-field">
          <span className="form-label">Dish size</span>
          <div className="segmented" role="group" aria-label="Dish size">
            {DISH_SIZES.map((d) => (
              <button key={d.id} aria-pressed={size === d.radius} onClick={() => setSize(d.radius)} title={d.note}>
                {d.label}
              </button>
            ))}
          </div>
          <span className="faint form-hint">{DISH_SIZES.find((d) => d.radius === size)?.note}</span>
        </div>
        {sc.config.startPopulation !== 0 && (
          <div className="form-field">
            <label className="form-label" htmlFor="nw-pop">
              Starting population <span className="mono">{Math.round(pop * (size / 800) ** 2)}</span>
            </label>
            <Slider id="nw-pop" min={16} max={120} step={1} value={pop} onChange={setPop} label="Starting population" />
          </div>
        )}
        <div className="form-field">
          <label className="form-label" htmlFor="nw-seed">
            Seed <span className="faint">(same seed + settings = same world)</span>
          </label>
          <div className="seed-row">
            <input id="nw-seed" className="text-input mono" placeholder="random" value={seed} onChange={(e) => setSeed(e.target.value)} />
            <button className="icon-btn" onClick={() => setSeed(String(Math.floor(Math.random() * 1e6)))} aria-label="Random seed" title="Random seed">
              <Dice5 size={17} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function DiscoveriesDialog() {
  const found = useStore(ui, (s) => s.discovered);
  return (
    <Modal title="Discoveries" eyebrow={`${found.length} of ${DISCOVERIES.length} found`} onClose={() => ui.set({ modal: null })} size="lg">
      <p className="note">Discoveries unlock when your world demonstrates an idea. They are remembered across worlds, so try different scenarios and the Lab controls to find them all.</p>
      <div className="discovery-grid">
        {DISCOVERIES.map((d) => {
          const has = found.includes(d.id);
          const Icon = DISCOVERY_ICONS[d.icon];
          return (
            <button key={d.id} className={`discovery-card ${has ? 'found' : 'locked'}`} onClick={() => has && openGuide(d.guide)} disabled={!has} title={has ? 'Open in the field guide' : 'Not discovered yet'}>
              <span className="disc-icon">{has ? <Icon size={18} /> : <Lock size={15} />}</span>
              <strong>{d.title}</strong>
              <span>{has ? d.body : 'Keep watching the dish…'}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['.', 'Advance one step (when paused)'],
  ['1 – 6', 'Speed: 1×, 2×, 4×, 8×, 16×, max'],
  ['V', 'Inspect tool'],
  ['P / B', 'Grow plants / berries'],
  ['F', 'Follow the selected creature'],
  ['H', 'Feed tool'],
  ['C / X', 'Breed / remove tool'],
  ['M', 'Meteor tool'],
  ['Esc', 'Deselect / close'],
  ['+ / −', 'Zoom in / out'],
  ['0', 'Show the whole dish'],
  ['Tab', 'Select the next creature'],
  ['L', 'Lab controls'],
  ['G', 'Field guide'],
  ['N', 'New world'],
  ['?', 'This list'],
];

export function ShortcutsDialog() {
  return (
    <Modal title="Keyboard shortcuts" onClose={() => ui.set({ modal: null })} size="sm">
      <dl className="shortcuts">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export function ImportDnaDialog() {
  const ctl = useSim();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const release = () => {
    try {
      const g = fromDnaCode(code);
      const p = ctl.world.randomPointInDish(0.6);
      const c = ctl.world.spawnGenome(g, p.x, p.y);
      ctl.renderer?.effects.add('spawn', c.x, c.y, '#4fd6ff', c.radius + 4);
      ctl.select(c.id, { focus: true });
      discover('engineer', ctl.world.time);
      pushToast({ kind: 'info', title: `${c.name} released`, body: 'Built from the DNA code you pasted. Its body and instincts come entirely from that code.' }, 5000);
      ui.set({ modal: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That does not look like a DNA code.');
    }
  };
  return (
    <Modal
      title="Release a creature from DNA"
      eyebrow="Genetic engineering"
      onClose={() => ui.set({ modal: null })}
      size="md"
      footer={
        <button className="btn primary" onClick={release} disabled={!code.trim()}>
          Release into the dish
        </button>
      }
    >
      <p className="note">
        Paste a code copied from any creature’s DNA tab (in this world or another). The creature is rebuilt from the code alone: body, colour and inherited brain wiring.{' '}
        <button className="link-btn" onClick={() => openGuide('dna')}>
          How DNA works
        </button>
      </p>
      <textarea
        id="dna-import"
        className="dna-code mono"
        rows={5}
        placeholder="LIFESIM-DNA:…"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError('');
        }}
        aria-label="DNA code"
      />
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
