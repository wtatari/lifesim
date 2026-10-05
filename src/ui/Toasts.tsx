import {
  Activity,
  Baby,
  Brain,
  Dna,
  Drumstick,
  FlaskConical,
  Flame,
  GitBranch,
  Hand,
  Heart,
  HeartPulse,
  History,
  Hourglass,
  Info,
  Lightbulb,
  Route,
  Scissors,
  Skull,
  Snowflake,
  Sparkles,
  Swords,
  Target,
  Trophy,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { dismissToast, openGuide, ui } from '../app/ui.ts';
import { useStore } from '../app/store.ts';
import type { DiscoveryIcon } from '../content/discoveries.ts';

export const DISCOVERY_ICONS: Record<DiscoveryIcon, typeof Baby> = {
  baby: Baby,
  heart: Heart,
  history: History,
  'git-branch': GitBranch,
  skull: Skull,
  swords: Swords,
  lightbulb: Lightbulb,
  flask: FlaskConical,
  snowflake: Snowflake,
  brain: Brain,
  hourglass: Hourglass,
  activity: Activity,
  flame: Flame,
  route: Route,
  target: Target,
  'heart-pulse': HeartPulse,
  hand: Hand,
  scissors: Scissors,
  dna: Dna,
  zap: Zap,
  drumstick: Drumstick,
};

export function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon =
          t.kind === 'discovery' && t.icon ? (DISCOVERY_ICONS[t.icon as DiscoveryIcon] ?? Sparkles) : t.kind === 'goal' ? Trophy : t.kind === 'warning' ? TriangleAlert : Info;
        return (
          <div key={t.id} className={`toast glass toast-${t.kind}`} role="status">
            <span className="toast-icon">
              <Icon size={18} />
            </span>
            <div className="toast-main">
              {t.kind === 'discovery' && <span className="eyebrow toast-eyebrow">Discovery</span>}
              {t.kind === 'goal' && <span className="eyebrow toast-eyebrow">Goal complete</span>}
              <strong>{t.title}</strong>
              <p>{t.body}</p>
              {t.guide && (
                <button
                  className="link-btn"
                  onClick={() => {
                    openGuide(t.guide!);
                    dismissToast(t.id);
                  }}
                >
                  Read more in the field guide →
                </button>
              )}
            </div>
            <button className="icon-btn sm toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
