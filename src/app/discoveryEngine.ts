import { DISCOVERIES, getDiscovery, type DiscoveryMemo } from '../content/discoveries.ts';
import { speciesName } from '../sim/species.ts';
import type { WorldEvent } from '../sim/world.ts';
import type { SimController } from './controller.ts';
import { pushLog, pushToast, ui } from './ui.ts';

/** Records a discovery (once) and celebrates it with a toast. */
export function discover(id: string, simTime?: number): void {
  const s = ui.get();
  if (s.discovered.includes(id)) return;
  const d = getDiscovery(id);
  if (!d) return;
  ui.set({ discovered: [...s.discovered, id] });
  pushToast({ kind: 'discovery', title: d.title, body: d.body, guide: d.guide, icon: d.icon }, 11000);
  pushLog({ t: simTime ?? 0, kind: 'discovery', text: `Discovery: ${d.title}` });
}

let playerSelections = 0;
/** Counts feed/breed actions toward the "artificial selection" discovery. */
export function notePlayerSelection(): void {
  playerSelections++;
  if (playerSelections >= 4) discover('artificial');
}

/**
 * Connects the discovery checks and the event log to a controller.
 * Returns a function that disconnects them.
 */
export function attachDiscoveries(ctl: SimController): () => void {
  const memo: DiscoveryMemo = { popHistory: [] };
  let lastCheck = -1;

  const onEvents = (events: WorldEvent[], c: SimController) => {
    const w = c.world;
    for (const e of events) {
      for (const d of DISCOVERIES) {
        if (d.onEvent && !ui.get().discovered.includes(d.id) && d.onEvent(e, w)) discover(d.id, w.time);
      }
      switch (e.type) {
        case 'speciation': {
          const sp = w.species.get(e.speciesId);
          const parent = w.species.get(e.parentSpeciesId);
          if (sp) pushLog({ t: w.time, kind: 'species', text: `New species: ${speciesName(sp)}${parent ? `, branched off ${speciesName(parent)}` : ''}`, speciesId: sp.id });
          break;
        }
        case 'extinction': {
          const sp = w.species.get(e.speciesId);
          if (sp) pushLog({ t: w.time, kind: 'extinct', text: `Extinct: ${speciesName(sp)} (peak population ${sp.peak})`, speciesId: sp.id });
          break;
        }
        case 'toxicFlip':
          pushLog({ t: w.time, kind: 'env', text: e.toxic ? 'The berries turned poisonous' : 'The berries are safe again' });
          break;
        case 'season':
          pushLog({ t: w.time, kind: 'env', text: `${e.season[0].toUpperCase()}${e.season.slice(1)} arrived` });
          break;
        case 'meteor':
          pushLog({ t: w.time, kind: 'player', text: `Meteor strike: ${e.killed} creature${e.killed === 1 ? '' : 's'} killed` });
          break;
        case 'lifeSupport':
          pushLog({ t: w.time, kind: 'env', text: e.hunter ? 'Life support released a hunter from the gene bank' : 'Life support released a creature from the gene bank', creatureId: e.id });
          break;
        default:
          break;
      }
    }
  };

  const onFrame = (c: SimController) => {
    const w = c.world;
    if (w.time < lastCheck) {
      lastCheck = -1;
      memo.popHistory = [];
    }
    if (w.time - lastCheck < 1) return;
    lastCheck = w.time;
    memo.popHistory.push({ t: w.time, pop: w.creatures.length });
    if (memo.popHistory.length > 150) memo.popHistory.splice(0, memo.popHistory.length - 120);
    const have = ui.get().discovered;
    for (const d of DISCOVERIES) {
      if (d.check && !have.includes(d.id) && d.check(w, memo)) discover(d.id, w.time);
    }
  };

  ctl.eventHooks.add(onEvents);
  ctl.frameHooks.add(onFrame);
  return () => {
    ctl.eventHooks.delete(onEvents);
    ctl.frameHooks.delete(onFrame);
  };
}
