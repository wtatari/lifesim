import { OUT } from './brainLayout.ts';
import type { Creature } from './creature.ts';
import { T } from './tuning.ts';

export interface BudgetItem {
  key: 'body' | 'swim' | 'brain' | 'eyes' | 'learning' | 'jaws';
  label: string;
  /** Energy per second. */
  value: number;
  color: string;
}

/** Where a creature's energy goes right now (same formula the simulation uses). */
export function energyBudget(c: Creature): BudgetItem[] {
  const t = c.traits;
  const m075 = Math.pow(c.mass, 0.75);
  let thrust = c.brain.output[OUT.thrust];
  if (thrust < 0) thrust *= T.backwardFactor;
  return [
    { key: 'body', label: 'Staying alive', value: T.baseMetabolism * m075, color: '#a9b6c7' },
    { key: 'swim', label: 'Swimming', value: T.moveCost * Math.abs(thrust) * c.force, color: '#ffcf5a' },
    { key: 'brain', label: 'Brain', value: T.brainCost * t.hiddenCount, color: '#8a96ff' },
    { key: 'eyes', label: 'Eyes', value: T.visionCost * t.visionRange * (0.5 + t.fov / (Math.PI * 2)), color: '#4fd6ff' },
    { key: 'learning', label: 'Learning', value: T.plasticityCost * t.plasticity, color: '#62f2a0' },
    { key: 'jaws', label: 'Jaws', value: c.biting ? T.biteCost * m075 : 0, color: '#ff5d7a' },
  ];
}
