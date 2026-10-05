import { useSim } from '../../app/context.ts';
import { energyBudget } from '../../sim/budget.ts';
import type { Creature } from '../../sim/creature.ts';
import { G, GENE_INFO } from '../../sim/genome.ts';
import { openGuide } from '../../app/ui.ts';
import { formatAge } from '../common.tsx';

const SHOWN: { gene: keyof typeof G; guide: string }[] = [
  { gene: 'size', guide: 'metabolism' },
  { gene: 'speed', guide: 'metabolism' },
  { gene: 'diet', guide: 'food-chain' },
  { gene: 'vision', guide: 'senses' },
  { gene: 'fov', guide: 'senses' },
  { gene: 'brain', guide: 'brain-cost' },
  { gene: 'plasticity', guide: 'learning' },
  { gene: 'maturity', guide: 'life-history' },
  { gene: 'fertility', guide: 'life-history' },
  { gene: 'investment', guide: 'life-history' },
  { gene: 'mutation', guide: 'mutation' },
];

export function BodyTab({ c }: { c: Creature }) {
  useSim();
  const budget = energyBudget(c);
  const total = budget.reduce((a, b) => a + b.value, 0);
  const t = c.traits;
  return (
    <div className="body-tab">
      <div className="insp-section">
        <h3 className="section-title">Energy budget</h3>
        <div className="budget-bar" role="img" aria-label="Where its energy goes">
          {budget
            .filter((b) => b.value > 0.0005)
            .map((b) => (
              <span key={b.key} style={{ width: `${(b.value / total) * 100}%`, background: b.color }} title={`${b.label}: ${b.value.toFixed(2)}/s`} />
            ))}
        </div>
        <ul className="budget-legend">
          {budget
            .filter((b) => b.value > 0.0005)
            .map((b) => (
              <li key={b.key}>
                <i style={{ background: b.color }} />
                <span>{b.label}</span>
                <span className="mono">{b.value.toFixed(2)}/s</span>
              </li>
            ))}
        </ul>
        <p className="note">
          Burning <span className="mono">{total.toFixed(2)}</span> energy per second. With a full tank and no food it would last about{' '}
          <span className="mono">{formatAge(c.maxEnergy / Math.max(0.01, total))}</span>.
        </p>
      </div>

      <div className="insp-section">
        <h3 className="section-title">Traits built by its genes</h3>
        <dl className="traits">
          {SHOWN.map(({ gene, guide }) => {
            const info = GENE_INFO[G[gene]];
            const v = c.genome.body[G[gene]];
            return (
              <div className="trait" key={gene}>
                <dt>
                  <button className="link-btn" onClick={() => openGuide(guide)} title={info.desc}>
                    {info.label}
                  </button>
                </dt>
                <dd>
                  <span className="trait-bar">
                    <span style={{ width: `${v * 100}%` }} />
                  </span>
                  <span className="mono trait-val">{info.format(v)}</span>
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="note">
          Digests <span className="mono">{Math.round(t.plantEff * 100)}%</span> of plant energy and <span className="mono">{Math.round(t.meatEff * 100)}%</span> of meat energy.
          Lifespan <span className="mono">{formatAge(t.lifespan)}</span>.
        </p>
      </div>

      <div className="insp-section">
        <h3 className="section-title">Life so far</h3>
        <dl className="kv">
          <dt>Plants eaten</dt>
          <dd className="mono">{c.plantsEaten}</dd>
          <dt>Berries eaten</dt>
          <dd className="mono">
            {c.berriesEaten}
            {c.toxicEaten > 0 && <span className="neg"> (+{c.toxicEaten} toxic)</span>}
          </dd>
          <dt>Meat eaten</dt>
          <dd className="mono">{Math.round(c.meatEaten)}</dd>
          <dt>Kills</dt>
          <dd className="mono">{c.kills}</dd>
          <dt>Babies</dt>
          <dd className="mono">{c.children}</dd>
          <dt>Distance swum</dt>
          <dd className="mono">{(c.distance / 1000).toFixed(1)} mm</dd>
        </dl>
      </div>
    </div>
  );
}
