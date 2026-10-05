import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SimController } from './controller.ts';

export const SimContext = createContext<SimController | null>(null);

export function useController(): SimController {
  const c = useContext(SimContext);
  if (!c) throw new Error('SimContext missing');
  return c;
}

/**
 * Returns the controller and re-renders the component whenever the
 * simulation reports a change (a few times per second while running).
 */
export function useSim(): SimController {
  const c = useController();
  useSyncExternalStore(c.subscribe, c.getVersion);
  return c;
}
