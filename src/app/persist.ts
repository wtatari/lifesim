import { del, get, set } from 'idb-keyval';
import { deserializeWorld, serializeWorld, type SavedWorld } from '../sim/serialize.ts';
import type { World } from '../sim/world.ts';

/**
 * Worlds are saved in this browser's IndexedDB (gzip-compressed when the
 * browser supports it). Storage can be unavailable (private windows, blocked
 * site data), so every call fails gracefully.
 */
const KEY = 'lifesim.world.v1';
const META_KEY = 'lifesim.world.meta.v1';

export interface SaveMeta {
  name: string;
  scenarioId: string;
  savedAt: number;
  time: number;
  population: number;
  generation: number;
}

async function compress(text: string): Promise<Blob | string> {
  if (typeof CompressionStream === 'undefined') return text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}

async function decompress(data: Blob | string): Promise<string> {
  if (typeof data === 'string') return data;
  const stream = data.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export async function saveWorld(w: World, name: string, scenarioId: string): Promise<boolean> {
  try {
    const data = serializeWorld(w, { name, scenarioId });
    await set(KEY, await compress(JSON.stringify(data)));
    const meta: SaveMeta = { name, scenarioId, savedAt: Date.now(), time: w.time, population: w.creatures.length, generation: w.totals.maxGeneration };
    await set(META_KEY, meta);
    return true;
  } catch {
    return false;
  }
}

export async function loadSaveMeta(): Promise<SaveMeta | null> {
  try {
    return ((await get(META_KEY)) as SaveMeta | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function loadWorld(): Promise<{ world: World; data: SavedWorld } | null> {
  try {
    const raw = (await get(KEY)) as Blob | string | undefined;
    if (!raw) return null;
    const data = JSON.parse(await decompress(raw)) as SavedWorld;
    return { world: deserializeWorld(data), data };
  } catch {
    return null;
  }
}

export async function clearSave(): Promise<void> {
  try {
    await del(KEY);
    await del(META_KEY);
  } catch {
    /* ignore */
  }
}
