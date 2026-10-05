import type { ReactNode } from 'react';
import { Leaf, Snowflake, Sprout, Sun } from 'lucide-react';
import type { SeasonName } from '../sim/world.ts';
import { speciesName, type Species } from '../sim/species.ts';

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`;
}

export const SEASON_ICON: Record<SeasonName, typeof Sun> = {
  spring: Sprout,
  summer: Sun,
  autumn: Leaf,
  winter: Snowflake,
};

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="lg-cell" cx="40%" cy="40%" r="60%">
          <stop offset="0" stopColor="#c8ffe0" />
          <stop offset="0.5" stopColor="#62f2a0" />
          <stop offset="1" stopColor="#1f8a5c" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28.5" fill="#050a12" stroke="#4fd6ff" strokeOpacity="0.85" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#4fd6ff" strokeOpacity="0.2" strokeWidth="1" />
      <path d="M17 39 q -6 3 -10 1" stroke="#62f2a0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="27" cy="36" r="11" fill="url(#lg-cell)" />
      <circle cx="31.5" cy="32" r="2.6" fill="#f2fbff" />
      <circle cx="32.3" cy="31.6" r="1.4" fill="#06121b" />
      <circle cx="44" cy="22" r="4.2" fill="#b98bff" />
      <circle cx="46" cy="38" r="2.4" fill="#62f2a0" opacity="0.8" />
    </svg>
  );
}

export function SpeciesName({ s, className }: { s: Pick<Species, 'genus' | 'epithet'>; className?: string }) {
  return <span className={`latin ${className ?? ''}`}>{speciesName(s)}</span>;
}

export function Meter({
  value,
  color,
  label,
  right,
}: {
  value: number;
  color: string;
  label: ReactNode;
  right?: ReactNode;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="mono">{right}</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${v * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/** Range slider that paints its filled part via a CSS variable. */
export function Slider({
  id,
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step ?? 'any'}
      value={value}
      aria-label={label}
      style={{ ['--fill' as string]: `${fill}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
