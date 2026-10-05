import { Bomb, Copy, Heart, MousePointer2, Sprout, Cherry, Zap } from 'lucide-react';
import { useSim } from '../app/context.ts';
import { TOOLS, type ToolId } from '../app/controller.ts';

const ICONS: Record<ToolId, typeof Heart> = {
  inspect: MousePointer2,
  plant: Sprout,
  berry: Cherry,
  feed: Heart,
  clone: Copy,
  smite: Zap,
  meteor: Bomb,
};

export function ToolRail() {
  const ctl = useSim();
  const active = TOOLS.find((t) => t.id === ctl.tool)!;
  return (
    <>
      <nav className="toolrail glass" aria-label="Tools" data-tour="tools">
        {TOOLS.map((t, i) => {
          const Icon = ICONS[t.id];
          return (
            <span key={t.id} className="tool-slot">
              {(i === 1 || i === 3 || i === 6) && <span className="tool-sep" aria-hidden="true" />}
              <button
                className={`tool-btn ${ctl.tool === t.id ? 'active' : ''}`}
                style={{ ['--tool' as string]: t.color }}
                onClick={() => ctl.setTool(t.id)}
                aria-pressed={ctl.tool === t.id}
                aria-label={t.label}
                title={`${t.label} (${t.key})`}
              >
                <Icon size={19} />
              </button>
            </span>
          );
        })}
      </nav>
      {ctl.tool !== 'inspect' && (
        <div className="tool-hint glass" role="status">
          <strong style={{ color: active.color }}>{active.label}</strong>
          <span>{active.hint}</span>
          <button className="btn sm ghost" onClick={() => ctl.setTool('inspect')}>
            Done
          </button>
        </div>
      )}
    </>
  );
}
