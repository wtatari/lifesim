import { IN, N_IN, OUT } from './brainLayout.ts';
import type { Brain } from './brain.ts';

/**
 * "What does this brain do?" — an automatic, plain-language summary of a
 * creature's behaviour, found by showing its brain test situations and
 * watching how the outputs respond. This is the same idea AI researchers use
 * to interpret neural networks (probing).
 */
export interface Instinct {
  text: string;
  /** How strong the effect is (for sorting). */
  strength: number;
  tone: 'food' | 'social' | 'body' | 'odd';
}

function run(brain: Brain, set: Partial<Record<keyof typeof IN, number>>): Float32Array {
  const x = new Float32Array(N_IN);
  x[IN.energy] = 0.6;
  for (const k in set) x[IN[k as keyof typeof IN]] = set[k as keyof typeof IN]!;
  const out = new Float32Array(3);
  brain.probe(x, out);
  return out;
}

export function analyseInstincts(brain: Brain, canBite: boolean): Instinct[] {
  const res: Instinct[] = [];
  const base = run(brain, {});

  // Default behaviour with nothing in sight.
  if (base[OUT.thrust] > 0.35) res.push({ text: 'Cruises forward when it sees nothing', strength: base[OUT.thrust] * 0.5, tone: 'body' });
  else if (base[OUT.thrust] < -0.15) res.push({ text: 'Backs up when it sees nothing', strength: 0.5, tone: 'odd' });
  else res.push({ text: 'Sits still unless something catches its eye', strength: 0.3, tone: 'odd' });
  if (Math.abs(base[OUT.turn]) > 0.45) res.push({ text: `Swims in circles (turns ${base[OUT.turn] > 0 ? 'right' : 'left'})`, strength: Math.abs(base[OUT.turn]) * 0.6, tone: 'odd' });

  // Steering toward or away from each kind of thing.
  const steer = (dirKey: keyof typeof IN, nearKey: keyof typeof IN, extra: Partial<Record<keyof typeof IN, number>> = {}) => {
    const l = run(brain, { [dirKey]: -0.6, [nearKey]: 0.5, ...extra });
    const r = run(brain, { [dirKey]: 0.6, [nearKey]: 0.5, ...extra });
    const ahead = run(brain, { [dirKey]: 0, [nearKey]: 0.85, ...extra });
    return { steer: r[OUT.turn] - l[OUT.turn], approach: ahead[OUT.thrust] - base[OUT.thrust], bite: ahead[OUT.bite] };
  };

  const plant = steer('plantDir', 'plantNear');
  if (plant.steer > 0.25) res.push({ text: 'Steers toward plants', strength: plant.steer, tone: 'food' });
  else if (plant.steer < -0.25) res.push({ text: 'Steers away from plants', strength: -plant.steer, tone: 'odd' });

  const berry = steer('berryDir', 'berryNear');
  if (berry.steer > 0.25) res.push({ text: 'Steers toward berries', strength: berry.steer, tone: 'food' });
  else if (berry.steer < -0.25) res.push({ text: 'Avoids berries', strength: -berry.steer, tone: 'food' });

  const meat = steer('meatDir', 'meatNear');
  if (meat.steer > 0.25) res.push({ text: 'Goes for meat', strength: meat.steer, tone: 'food' });
  else if (meat.steer < -0.25) res.push({ text: 'Avoids meat', strength: -meat.steer * 0.6, tone: 'food' });

  const stranger = steer('creatureDir', 'creatureNear', { kin: 0 });
  if (stranger.steer > 0.3) res.push({ text: 'Chases other creatures', strength: stranger.steer, tone: 'social' });
  else if (stranger.steer < -0.3) res.push({ text: 'Keeps away from other creatures', strength: -stranger.steer, tone: 'social' });

  if (canBite) {
    const kin = steer('creatureDir', 'creatureNear', { kin: 1 });
    if (stranger.bite > 0.3) {
      if (kin.bite > 0.3) res.push({ text: 'Bites anything in front of it, even family', strength: stranger.bite + 0.3, tone: 'social' });
      else res.push({ text: 'Bites strangers but spares its family', strength: stranger.bite + 0.5, tone: 'social' });
    }
  }

  const bigger = steer('creatureDir', 'creatureNear', { threat: 1 });
  const smaller = steer('creatureDir', 'creatureNear', { threat: -1 });
  if (bigger.steer < smaller.steer - 0.4) res.push({ text: 'Turns away from bigger creatures', strength: (smaller.steer - bigger.steer) * 0.8, tone: 'social' });

  const pain = run(brain, { pain: 1 });
  if (pain[OUT.thrust] - base[OUT.thrust] > 0.25) res.push({ text: 'Speeds up when hurt (escape reflex)', strength: pain[OUT.thrust] - base[OUT.thrust], tone: 'body' });

  const wall = run(brain, { wall: 0.8 });
  if (Math.abs(wall[OUT.turn] - base[OUT.turn]) > 0.35) res.push({ text: 'Turns away from the dish wall', strength: Math.abs(wall[OUT.turn] - base[OUT.turn]) * 0.8, tone: 'body' });
  else if (wall[OUT.thrust] - base[OUT.thrust] < -0.35) res.push({ text: 'Stops at the dish wall', strength: 0.4, tone: 'body' });

  const hungry = run(brain, { energy: 0.1 });
  const full = run(brain, { energy: 0.95 });
  const dHunger = hungry[OUT.thrust] - full[OUT.thrust];
  if (dHunger > 0.3) res.push({ text: 'Searches harder when hungry', strength: dHunger * 0.8, tone: 'body' });
  else if (dHunger < -0.3) res.push({ text: 'Slows down when hungry (saves energy)', strength: -dHunger * 0.6, tone: 'body' });

  const tick = run(brain, { clock: 1 });
  const tock = run(brain, { clock: -1 });
  if (Math.abs(tick[OUT.turn] - tock[OUT.turn]) > 0.4) res.push({ text: 'Wiggles side to side to the beat of its internal rhythm', strength: 0.35, tone: 'body' });

  res.sort((a, b) => b.strength - a.strength);
  return res;
}
