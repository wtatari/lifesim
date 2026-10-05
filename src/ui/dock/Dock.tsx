import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSim } from '../../app/context.ts';
import { ui, openGuide, type DockTab } from '../../app/ui.ts';
import { useStore } from '../../app/store.ts';
import { TRAIT_KEYS, type StatSample, type TraitKey } from '../../sim/stats.ts';
import { speciesName, type Species } from '../../sim/species.ts';
import { hueColor, PAL } from '../../render/palette.ts';
import { drawAxes, drawHover, drawLine, drawStacked, niceMax, prepare, timeLabel, xAt, type ChartGeom, type Series } from './chart.ts';
import { EventLog } from './EventLog.tsx';
import { SpeciesTree } from './SpeciesTree.tsx';

const TABS: { id: DockTab; label: string }[] = [
  { id: 'population', label: 'Population' },
  { id: 'traits', label: 'Traits' },
  { id: 'skill', label: 'Skill & learning' },
  { id: 'species', label: 'Tree of life' },
  { id: 'log', label: 'Log' },
];

export function Dock() {
  const open = useStore(ui, (s) => s.dockOpen);
  const tab = useStore(ui, (s) => s.dockTab);
  return (
    <section className={`dock glass ${open ? 'open' : 'closed'}`} aria-label="Charts" data-tour="dock">
      <div className="dock-head">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={open && tab === t.id}
              onClick={() => ui.set({ dockTab: t.id, dockOpen: true })}
              data-tour={`dock-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="icon-btn sm" onClick={() => ui.set({ dockOpen: !open })} aria-label={open ? 'Collapse charts' : 'Expand charts'} title={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {open && (
        <div className="dock-body">
          {tab === 'population' && <PopulationChart />}
          {tab === 'traits' && <TraitsChart />}
          {tab === 'skill' && <SkillChart />}
          {tab === 'species' && <SpeciesTree />}
          {tab === 'log' && <EventLog />}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------

export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 600, h: 160 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

interface ChartFrameProps {
  samples: StatSample[];
  series: Series[];
  stacked?: Series[];
  yMax: number;
  yMin?: number;
  rightMax?: number;
  yLabel?: (v: number) => string;
  rightLabel?: (v: number) => string;
  format?: (s: Series, v: number) => string;
  empty?: string;
}

function ChartFrame({ samples, series, stacked, yMax, yMin = 0, rightMax, yLabel, rightLabel, format, empty }: ChartFrameProps) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const g: ChartGeom = { x0: 40, x1: size.w - (rightMax !== undefined ? 44 : 12), y0: 10, y1: size.h - 22 };
  const n = samples.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    prepare(ctx, canvas, size.w, size.h);
    if (n < 2) return;
    drawAxes(ctx, g, samples.map((s) => s.t), yMax, { yLabel, rightMax, rightLabel, yMin });
    if (stacked) drawStacked(ctx, g, stacked, yMax);
    for (const s of series) drawLine(ctx, g, s, s.right && rightMax !== undefined ? rightMax : yMax, s.right ? 0 : yMin);
    if (hoverX !== null) drawHover(ctx, g, hoverX);
  });

  let hoverIdx = -1;
  if (hoverX !== null && n > 1) hoverIdx = Math.max(0, Math.min(n - 1, Math.round(((hoverX - g.x0) / (g.x1 - g.x0)) * (n - 1))));
  const fmt = format ?? ((_s: Series, v: number) => (Number.isFinite(v) ? (Math.abs(v) < 10 ? v.toFixed(2) : String(Math.round(v))) : '–'));

  return (
    <div className="chart" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
        onPointerMove={(e) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const x = e.clientX - r.left;
          setHoverX(x >= g.x0 && x <= g.x1 ? x : null);
        }}
        onPointerLeave={() => setHoverX(null)}
        role="img"
        aria-label="Chart"
      />
      {n < 2 && <div className="chart-empty">{empty ?? 'Collecting data… let the world run for a few seconds.'}</div>}
      {hoverIdx >= 0 && (
        <div className="tooltip chart-tt" style={{ left: Math.min(xAt(g, hoverIdx, n) + 12, size.w - 190), top: 8 }}>
          <strong className="mono">T+{timeLabel(samples[hoverIdx].t)}</strong>
          {[...(stacked ?? []).filter((s) => (s.values[hoverIdx] ?? 0) > 0).slice(-8).reverse(), ...series].map((s) => (
            <div key={s.key} className="tt-row">
              <i style={{ background: s.color }} />
              <span>{s.label}</span>
              <span className="mono">{fmt(s, s.values[hoverIdx])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function PopulationChart() {
  const ctl = useSim();
  const w = ctl.world;
  const [mode, setMode] = useState<'species' | 'diet'>('species');
  const samples = w.stats.samples;
  const v = ctl.version;

  const { stacked, lines, yMax, rightMax, legend } = useMemo(() => {
    const plants: Series = { key: 'plants', label: 'Plants', color: PAL.gfp, values: samples.map((s) => s.plants), dashed: true, right: true };
    let stacked: Series[];
    let legend: { label: string; color: string; species?: Species }[] = [];
    if (mode === 'diet') {
      stacked = [
        { key: 'herb', label: 'Grazers', color: '#3fc488', values: samples.map((s) => s.herb) },
        { key: 'omni', label: 'Omnivores', color: '#e0b54a', values: samples.map((s) => s.omni) },
        { key: 'carn', label: 'Hunters', color: '#e64a6a', values: samples.map((s) => s.carn) },
      ];
      legend = stacked.map((s) => ({ label: s.label, color: s.color }));
    } else {
      const ids = new Set<number>();
      for (const s of samples) for (const k in s.species) ids.add(Number(k));
      const sps = [...ids].map((id) => w.species.get(id)).filter((s): s is Species => !!s).sort((a, b) => a.bornAt - b.bornAt || a.id - b.id);
      stacked = sps.map((sp) => ({
        key: `sp${sp.id}`,
        label: speciesName(sp),
        color: hueColor(sp.hue, 62, sp.extinctAt === null ? 52 : 34),
        values: samples.map((s) => s.species[sp.id] ?? 0),
      }));
      legend = sps
        .filter((s) => s.extinctAt === null)
        .sort((a, b) => b.population - a.population)
        .slice(0, 6)
        .map((s) => ({ label: speciesName(s), color: hueColor(s.hue, 70, 58), species: s }));
    }
    const yMax = niceMax(Math.max(10, ...samples.map((s) => s.pop)) * 1.05);
    const rightMax = niceMax(Math.max(10, ...samples.map((s) => s.plants)) * 1.05);
    return { stacked, lines: [plants], yMax, rightMax, legend };
  }, [samples, mode, v, w]);

  return (
    <div className="panel-chart">
      <div className="chart-side">
        <div className="segmented" role="group" aria-label="Group population by">
          <button aria-pressed={mode === 'species'} onClick={() => setMode('species')}>
            Species
          </button>
          <button aria-pressed={mode === 'diet'} onClick={() => setMode('diet')}>
            Diet
          </button>
        </div>
        <ul className="chart-legend">
          {legend.map((l) => (
            <li key={l.label}>
              <i style={{ background: l.color }} />
              <span className={l.species ? 'latin' : ''}>{l.label}</span>
            </li>
          ))}
          <li>
            <i className="dash" style={{ borderColor: PAL.gfp }} />
            <span>Plants (right axis)</span>
          </li>
        </ul>
        <button className="link-btn" onClick={() => openGuide(mode === 'diet' ? 'predator-prey' : 'carrying-capacity')}>
          {mode === 'diet' ? 'Why do hunters and prey cycle?' : 'What limits a population?'}
        </button>
      </div>
      <ChartFrame samples={samples} stacked={stacked} series={lines} yMax={yMax} rightMax={rightMax} />
    </div>
  );
}

const TRAIT_META: Record<TraitKey, { label: string; color: string; guide: string }> = {
  size: { label: 'Body size', color: '#62f2a0', guide: 'metabolism' },
  speed: { label: 'Muscle', color: '#ffcf5a', guide: 'arms-race' },
  diet: { label: 'Diet (meat)', color: '#ff5d7a', guide: 'food-chain' },
  vision: { label: 'Eyesight', color: '#4fd6ff', guide: 'senses' },
  fov: { label: 'Field of view', color: '#7fb8ff', guide: 'senses' },
  brain: { label: 'Brain size', color: '#8a96ff', guide: 'brain-cost' },
  plasticity: { label: 'Learning rate', color: '#9be7c4', guide: 'learning' },
  mutation: { label: 'Mutation rate', color: '#e6edf5', guide: 'mutation' },
  fertility: { label: 'Breeding threshold', color: '#f2e07a', guide: 'life-history' },
  investment: { label: 'Baby size', color: '#ffa86b', guide: 'life-history' },
  maturity: { label: 'Growth time', color: '#c0a5ff', guide: 'life-history' },
};

function TraitsChart() {
  const ctl = useSim();
  const samples = ctl.world.stats.samples;
  const [on, setOn] = useState<TraitKey[]>(['size', 'speed', 'vision', 'brain']);
  const series: Series[] = on.map((k) => ({
    key: k,
    label: TRAIT_META[k].label,
    color: TRAIT_META[k].color,
    values: samples.map((s) => (k === 'brain' ? (s.traits.brain - 2) / 10 : s.traits[k])),
  }));
  return (
    <div className="panel-chart">
      <div className="chart-side">
        <p className="note">Average gene value across all living creatures (0 = low end, 1 = high end). Lines that drift steadily are evolution in action.</p>
        <div className="trait-chips">
          {TRAIT_KEYS.map((k) => {
            const active = on.includes(k);
            return (
              <button
                key={k}
                className={`trait-chip ${active ? 'active' : ''}`}
                style={{ ['--c' as string]: TRAIT_META[k].color }}
                onClick={() => setOn(active ? on.filter((x) => x !== k) : [...on, k])}
                aria-pressed={active}
              >
                {TRAIT_META[k].label}
              </button>
            );
          })}
        </div>
      </div>
      <ChartFrame
        samples={samples}
        series={series}
        yMax={1}
        yLabel={(v) => v.toFixed(2)}
        format={(s, v) => (s.key === 'brain' ? `${(v * 10 + 2).toFixed(1)} neurons` : Number.isFinite(v) ? v.toFixed(2) : '–')}
      />
    </div>
  );
}

function SkillChart() {
  const ctl = useSim();
  const w = ctl.world;
  const samples = w.stats.samples;
  const skill: Series = { key: 'skill', label: 'Foraging skill (plants/min)', color: PAL.gfp, values: samples.map((s) => s.skill), fill: true };
  const learned: Series = { key: 'learned', label: 'Learned change (right axis)', color: PAL.yfp, values: samples.map((s) => s.learned), right: true };
  const showToxic = w.config.berryMode !== 'good';
  const toxic: Series = { key: 'toxic', label: 'Toxic share of berries eaten', color: PAL.mcherry, values: samples.map((s) => s.toxicShare), right: true, dashed: true };
  const yMax = niceMax(Math.max(10, ...samples.map((s) => (Number.isFinite(s.skill) ? s.skill : 0))) * 1.1);
  return (
    <div className="panel-chart">
      <div className="chart-side">
        <p className="note">
          <strong style={{ color: PAL.gfp }}>Skill</strong>: plants per minute a grazer’s brain finds in a standard test arena.
        </p>
        <p className="note">
          <strong style={{ color: PAL.yfp }}>Learning</strong>: how far tastes have moved from instinct.
        </p>
        <button className="link-btn" onClick={() => openGuide('neuroevolution')}>
          How do brains improve without a teacher?
        </button>
      </div>
      <ChartFrame
        samples={samples}
        series={showToxic ? [skill, learned, toxic] : [skill, learned]}
        yMax={yMax}
        rightMax={1}
        rightLabel={(v) => v.toFixed(2)}
        format={(s, v) => (!Number.isFinite(v) ? '–' : s.key === 'toxic' ? `${Math.round(v * 100)}%` : s.key === 'skill' ? v.toFixed(1) : v.toFixed(2))}
      />
    </div>
  );
}
