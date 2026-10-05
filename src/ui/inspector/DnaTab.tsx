import { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { useController } from '../../app/context.ts';
import { discover } from '../../app/discoveryEngine.ts';
import { openGuide } from '../../app/ui.ts';
import { B1_OFFSET, B2_OFFSET, H_MAX, INPUT_INFO, N_IN, N_OUT, OUTPUT_INFO, W1_OFFSET, W2_OFFSET, W3_OFFSET } from '../../sim/brainLayout.ts';
import type { Creature } from '../../sim/creature.ts';
import { GENE_INFO, N_BODY, toDnaCode, type Genome } from '../../sim/genome.ts';
import { copyText } from '../clipboard.ts';

type Origin = 'mother' | 'father' | 'mutation' | 'founder';

function origins(g: Genome, mother: Genome | null, father: Genome | null): { body: Origin[]; brain: Origin[] } {
  const pick = (v: number, m: number | undefined, f: number | undefined): Origin => {
    if (m === undefined) return 'founder';
    if (v === m) return 'mother';
    if (f !== undefined && v === f) return 'father';
    return 'mutation';
  };
  return {
    body: Array.from(g.body, (v, i) => pick(v, mother?.body[i], father?.body[i])),
    brain: Array.from(g.brain, (v, i) => pick(v, mother?.brain[i], father?.brain[i])),
  };
}

const GENE_COLORS = ['#62f2a0', '#ffcf5a', '#ff8fb0', '#ff5d7a', '#4fd6ff', '#7fb8ff', '#c0a5ff', '#ffa86b', '#f2e07a', '#9be7c4', '#62f2a0', '#8a96ff', '#e6edf5', '#b98bff'];

function weightFill(w: number): string {
  const m = Math.min(1, Math.abs(w) / 3);
  return w >= 0 ? `rgba(79, 214, 255, ${0.08 + 0.92 * m})` : `rgba(255, 93, 122, ${0.08 + 0.92 * m})`;
}

export function DnaTab({ c }: { c: Creature }) {
  const ctl = useController();
  const g = c.genome;
  const [mother, father] = c.parentGenomes;
  const org = useMemo(() => origins(g, mother, father), [g, mother, father]);
  const mutated = org.body.filter((o) => o === 'mutation').length + org.brain.filter((o) => o === 'mutation').length;
  const fromFather = org.body.filter((o) => o === 'father').length + org.brain.filter((o) => o === 'father').length;
  const code = useMemo(() => toDnaCode(g), [g]);
  const cell = 11;
  const H = c.traits.hiddenCount;

  return (
    <div className="dna-tab">
      <div className="insp-section">
        <h3 className="section-title">
          Genome <span className="faint">({N_BODY} body genes · {g.brain.length} brain genes)</span>
        </h3>
        <p className="note">
          {mother
            ? father
              ? `A mix of two parents: ${g.body.length + g.brain.length - mutated - fromFather} genes from its mother, ${fromFather} from its father, and ${mutated} new mutations.`
              : `A copy of its single parent’s DNA with ${mutated} mutations.`
            : 'A founder: its DNA was not inherited from anyone in this dish.'}{' '}
          <button className="link-btn" onClick={() => openGuide('dna')}>
            How DNA works
          </button>
        </p>

        <div className="dna-legend">
          {mother && <span><i className="o-mother" />mother</span>}
          {father && <span><i className="o-father" />father</span>}
          {mother && <span><i className="o-mutation" />mutation</span>}
        </div>

        <div className="dna-strip" role="list" aria-label="Body genes">
          {GENE_INFO.map((info, i) => {
            const v = g.body[i];
            return (
              <div className={`gene-band o-${org.body[i]}`} key={info.key} role="listitem" title={`${info.label}: ${info.format(v)} (${org.body[i]})`}>
                <span className="gene-fill" style={{ height: `${12 + v * 88}%`, background: GENE_COLORS[i] }} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="insp-section">
        <h3 className="section-title">Body genes</h3>
        <dl className="genes">
          {GENE_INFO.map((info, i) => {
            const v = g.body[i];
            return (
              <div className="gene-row" key={info.key}>
                <dt>
                  <span className="gene-swatch" style={{ background: GENE_COLORS[i] }} />
                  {info.label}
                </dt>
                <dd>
                  <span className="gene-scale">
                    <span className="gene-low">{info.low}</span>
                    <span className="gene-track">
                      <span className="gene-mark" style={{ left: `${v * 100}%`, background: GENE_COLORS[i] }} />
                    </span>
                    <span className="gene-high">{info.high}</span>
                  </span>
                  <span className="mono gene-val">{info.format(v)}</span>
                  {org.body[i] === 'mutation' && <span className="mut-flag" title="Mutated in this creature">mut</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div className="insp-section">
        <h3 className="section-title">Brain genes</h3>
        <p className="note">Each row is one neuron: the starting strength of every connection arriving at it. Faded rows belong to switched-off neurons, unused "junk DNA" that still mutates.</p>
        <svg
          className="brain-genes"
          width={(N_IN + 1) * cell + 70}
          height={(H_MAX + N_OUT * 2) * cell + 30}
          role="img"
          aria-label="Brain gene heat map"
        >
          <text x={0} y={9} className="svg-label">
            hidden ← senses
          </text>
          {Array.from({ length: H_MAX }, (_, h) => (
            <g key={h} opacity={h < H ? 1 : 0.28} transform={`translate(70, ${14 + h * cell})`}>
              <text x={-6} y={cell - 3} textAnchor="end" className="svg-label">
                H{h + 1}
              </text>
              {Array.from({ length: N_IN }, (_, i) => {
                const k = W1_OFFSET + h * N_IN + i;
                return (
                  <rect key={i} x={i * cell} y={0} width={cell - 1} height={cell - 1} rx={2} fill={weightFill(g.brain[k])} className={`o-${org.brain[k]}`}>
                    <title>{`${INPUT_INFO[i].label} → H${h + 1}: ${g.brain[k].toFixed(2)} (${org.brain[k]})`}</title>
                  </rect>
                );
              })}
              <rect x={N_IN * cell + 3} y={0} width={cell - 1} height={cell - 1} rx={5} fill={weightFill(g.brain[B1_OFFSET + h])}>
                <title>{`Bias of H${h + 1}: ${g.brain[B1_OFFSET + h].toFixed(2)}`}</title>
              </rect>
            </g>
          ))}
          <text x={0} y={14 + H_MAX * cell + 12} className="svg-label">
            actions
          </text>
          {Array.from({ length: N_OUT }, (_, o) => (
            <g key={o} transform={`translate(70, ${14 + H_MAX * cell + 16 + o * cell})`}>
              <text x={-6} y={cell - 3} textAnchor="end" className="svg-label">
                {OUTPUT_INFO[o].label}
              </text>
              {Array.from({ length: H_MAX }, (_, h) => {
                const k = W2_OFFSET + o * H_MAX + h;
                return (
                  <rect key={h} x={h * cell} y={0} width={cell - 1} height={cell - 1} rx={2} fill={weightFill(g.brain[k])} opacity={h < H ? 1 : 0.28} className={`o-${org.brain[k]}`}>
                    <title>{`H${h + 1} → ${OUTPUT_INFO[o].label}: ${g.brain[k].toFixed(2)}`}</title>
                  </rect>
                );
              })}
              <rect x={N_IN * cell + 3} y={0} width={cell - 1} height={cell - 1} rx={5} fill={weightFill(g.brain[B2_OFFSET + o])}>
                <title>{`Bias of ${OUTPUT_INFO[o].label}: ${g.brain[B2_OFFSET + o].toFixed(2)}`}</title>
              </rect>
            </g>
          ))}
          <text x={0} y={14 + (H_MAX + N_OUT) * cell + 28} className="svg-label">
            reflexes
          </text>
          {Array.from({ length: N_OUT }, (_, o) => (
            <g key={`r${o}`} transform={`translate(70, ${14 + (H_MAX + N_OUT) * cell + 20 + o * cell})`}>
              {Array.from({ length: N_IN }, (_, i) => {
                const k = W3_OFFSET + o * N_IN + i;
                return (
                  <rect key={i} x={i * cell} y={0} width={cell - 1} height={cell - 1} rx={2} fill={weightFill(g.brain[k])} className={`o-${org.brain[k]}`}>
                    <title>{`${INPUT_INFO[i].label} → ${OUTPUT_INFO[o].label} (reflex): ${g.brain[k].toFixed(2)}`}</title>
                  </rect>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      <div className="insp-section">
        <h3 className="section-title">DNA code</h3>
        <p className="note">Everything needed to rebuild this creature. Paste it into “Release creature from DNA code” in any LifeSim world.</p>
        <textarea className="dna-code mono" readOnly value={code} rows={3} aria-label="DNA code" onFocus={(e) => e.currentTarget.select()} />
        <button
          className="btn sm"
          onClick={async () => {
            await copyText(code);
            discover('engineer', ctl.world.time);
          }}
        >
          <Copy size={13} /> Copy DNA code
        </button>
      </div>
    </div>
  );
}
