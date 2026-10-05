import { useSim } from '../../app/context.ts';
import { ui } from '../../app/ui.ts';
import { useStore } from '../../app/store.ts';
import { formatTime } from '../common.tsx';

const KIND_LABEL: Record<string, string> = {
  species: 'species',
  extinct: 'extinct',
  env: 'world',
  player: 'you',
  discovery: 'discovery',
  lesson: 'lesson',
  birth: 'birth',
  death: 'death',
};

export function EventLog() {
  const ctl = useSim();
  const log = useStore(ui, (s) => s.log);
  const items = log.slice(-80).reverse();
  return (
    <div className="event-log scroll">
      {items.length === 0 ? (
        <p className="note">Nothing notable yet. New species, extinctions, discoveries and changes in the world will be listed here.</p>
      ) : (
        <ol>
          {items.map((e) => (
            <li key={e.id} className={`log-${e.kind}`}>
              <span className="mono log-time">T+{formatTime(e.t)}</span>
              <span className="log-kind">{KIND_LABEL[e.kind]}</span>
              {e.speciesId !== undefined && ctl.world.species.get(e.speciesId)?.extinctAt === null ? (
                <button className="link-btn" onClick={() => ctl.setHighlightSpecies(e.speciesId!)}>
                  {e.text}
                </button>
              ) : e.creatureId !== undefined && ctl.world.getCreature(e.creatureId) ? (
                <button className="link-btn" onClick={() => ctl.select(e.creatureId!, { focus: true })}>
                  {e.text}
                </button>
              ) : (
                <span>{e.text}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
