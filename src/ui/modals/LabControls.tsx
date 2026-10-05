import type { ReactNode } from 'react';
import { Bomb, Sprout, Swords, UserPlus, Wheat } from 'lucide-react';
import { useSim } from '../../app/context.ts';
import { openGuide, pushLog, ui } from '../../app/ui.ts';
import type { BerryMode, WorldConfig } from '../../sim/world.ts';
import { PAL } from '../../render/palette.ts';
import { Slider, Switch } from '../common.tsx';
import { Modal } from './Modal.tsx';

function Row({ label, value, children, teaches, guide, htmlFor }: { label: string; value?: ReactNode; children: ReactNode; teaches?: string; guide?: string; htmlFor?: string }) {
  return (
    <div className="lab-row">
      <div className="lab-row-head">
        <label htmlFor={htmlFor}>{label}</label>
        {value !== undefined && <span className="mono lab-val">{value}</span>}
      </div>
      <div className="lab-control">{children}</div>
      {teaches && (
        <p className="lab-teach">
          {teaches}{' '}
          {guide && (
            <button className="link-btn" onClick={() => openGuide(guide)}>
              Learn why
            </button>
          )}
        </p>
      )}
    </div>
  );
}

export function LabControls() {
  const ctl = useSim();
  const w = ctl.world;
  const c = w.config;
  const set = (patch: Partial<WorldConfig>) => {
    w.setConfig(patch);
    ctl.touch();
  };
  const log = (text: string) => pushLog({ t: w.time, kind: 'player', text });

  return (
    <Modal title="Lab controls" eyebrow="Change the world, watch evolution respond" onClose={() => ui.set({ modal: null })} size="lg">
      <div className="lab-grid">
        <section className="lab-section">
          <h3>Food</h3>
          <Row label="Plant growth" value={`${c.plantRate.toFixed(0)} / s`} teaches="More food → bigger populations; less food → fiercer competition." guide="carrying-capacity" htmlFor="lab-plant">
            <Slider id="lab-plant" min={2} max={40} step={1} value={c.plantRate} onChange={(v) => set({ plantRate: v })} label="Plant growth rate" />
          </Row>
          <Row label="Berries" value={`${Math.round(c.berryShare * 100)}% of food`} htmlFor="lab-berry">
            <Slider id="lab-berry" min={0} max={0.6} step={0.01} value={c.berryShare} onChange={(v) => set({ berryShare: v })} label="Share of berries" />
          </Row>
          <Row label="Berry toxicity" teaches="Switching berries reward creatures that can learn." guide="changing-environment">
            <div className="segmented" role="group" aria-label="Berry toxicity">
              {(
                [
                  ['good', 'Always tasty'],
                  ['shifting', 'Switching'],
                  ['toxic', 'Always toxic'],
                ] as [BerryMode, string][]
              ).map(([m, label]) => (
                <button key={m} aria-pressed={c.berryMode === m} onClick={() => set({ berryMode: m })}>
                  {label}
                </button>
              ))}
            </div>
          </Row>
          {c.berryMode === 'shifting' && (
            <Row label="Switch every" value={`${c.berryPeriod} s`} htmlFor="lab-period">
              <Slider id="lab-period" min={20} max={300} step={10} value={c.berryPeriod} onChange={(v) => set({ berryPeriod: v })} label="Toxicity switch period" />
            </Row>
          )}
        </section>

        <section className="lab-section">
          <h3>Climate</h3>
          <Row label="Seasons" value={c.seasonAmp < 0.02 ? 'off' : `±${Math.round(c.seasonAmp * 100)}%`} teaches="Harsh winters make natural selection stronger." guide="seasons" htmlFor="lab-season">
            <Slider id="lab-season" min={0} max={0.9} step={0.05} value={c.seasonAmp} onChange={(v) => set({ seasonAmp: v })} label="Season strength" />
          </Row>
          <Row label="Year length" value={`${Math.round(c.seasonLength / 60)} min`} htmlFor="lab-year">
            <Slider id="lab-year" min={60} max={900} step={30} value={c.seasonLength} onChange={(v) => set({ seasonLength: v })} label="Length of a year" />
          </Row>
        </section>

        <section className="lab-section">
          <h3>Evolution</h3>
          <Row label="Mutation strength" value={`${c.mutationScale.toFixed(1)}×`} teaches="At 0× nothing new appears and evolution stops. Very high values scramble useful genes." guide="mutation" htmlFor="lab-mut">
            <Slider id="lab-mut" min={0} max={4} step={0.1} value={c.mutationScale} onChange={(v) => set({ mutationScale: v })} label="Mutation strength" />
          </Row>
          <Row label="Two parents" teaches="Mix DNA with a nearby mate of the same species when breeding." guide="crossover">
            <div className="switch-row">
              <Switch id="lab-sex" checked={c.sexual} onChange={(v) => set({ sexual: v })} label="Two-parent reproduction" />
              <span className="faint">{c.sexual ? 'on' : 'off: every baby is a clone with mutations'}</span>
            </div>
          </Row>
          <Row label="Lamarckian experiment" teaches="Let parents pass on what they learned. Real biology doesn’t work this way. Compare and see why it matters." guide="lamarck">
            <div className="switch-row">
              <Switch id="lab-lamarck" checked={c.lamarckian} onChange={(v) => set({ lamarckian: v })} label="Lamarckian inheritance" />
              <span className="faint">{c.lamarckian ? 'on: learned tastes become instincts' : 'off (realistic)'}</span>
            </div>
          </Row>
        </section>

        <section className="lab-section">
          <h3>Ecology</h3>
          <Row label="Predation" teaches="Allow creatures to bite each other." guide="food-chain">
            <div className="switch-row">
              <Switch id="lab-pred" checked={c.predation} onChange={(v) => set({ predation: v })} label="Allow predation" />
              <span className="faint">{c.predation ? 'jaws work' : 'everyone is peaceful'}</span>
            </div>
          </Row>
          <Row label="Life support" value={c.lifeSupport ? `≥ ${c.lifeSupport} creatures` : 'off'} teaches="Revive genomes from the gene bank when the population gets too small." guide="life-support" htmlFor="lab-ls">
            <Slider id="lab-ls" min={0} max={30} step={1} value={c.lifeSupport} onChange={(v) => set({ lifeSupport: v })} label="Minimum population" />
          </Row>
          <Row label="Keep hunters alive" value={c.hunterSupport ? `≥ ${c.hunterSupport}` : 'off'} htmlFor="lab-hs">
            <Slider id="lab-hs" min={0} max={10} step={1} value={c.hunterSupport} onChange={(v) => set({ hunterSupport: v })} label="Minimum number of hunters" />
          </Row>
        </section>

        <section className="lab-section lab-events">
          <h3>Events</h3>
          <div className="event-buttons">
            <button
              className="event-btn"
              onClick={() => {
                w.introduce(true, 5);
                log('You released 5 hunters');
                ctl.touch();
              }}
            >
              <Swords size={18} color={PAL.mcherry} />
              <strong>Release hunters</strong>
              <span>5 meat-eaters join the dish</span>
            </button>
            <button
              className="event-btn"
              onClick={() => {
                w.introduce(false, 6);
                log('You released 6 newcomers');
                ctl.touch();
              }}
            >
              <UserPlus size={18} color={PAL.cfp} />
              <strong>Release grazers</strong>
              <span>6 plant-eaters from the gene bank</span>
            </button>
            <button
              className="event-btn"
              onClick={() => {
                w.bloom(250);
                log('You triggered a plant bloom');
                ctl.touch();
              }}
            >
              <Sprout size={18} color={PAL.gfp} />
              <strong>Plant bloom</strong>
              <span>250 plants sprout at once</span>
            </button>
            <button
              className="event-btn"
              onClick={() => {
                w.famine();
                log('You caused a famine');
                ctl.touch();
              }}
            >
              <Wheat size={18} color={PAL.yfp} />
              <strong>Famine</strong>
              <span>Half of all plants wither</span>
            </button>
            <button
              className="event-btn"
              onClick={() => {
                const R = c.radius;
                for (let k = 0; k < 3; k++) {
                  const a = Math.random() * Math.PI * 2;
                  const d = Math.sqrt(Math.random()) * R * 0.75;
                  w.meteor(Math.cos(a) * d, Math.sin(a) * d, 150);
                }
                ui.set({ modal: null });
                ctl.touch();
              }}
            >
              <Bomb size={18} color="#ff9b5a" />
              <strong>Meteor shower</strong>
              <span>Three strikes at random</span>
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
