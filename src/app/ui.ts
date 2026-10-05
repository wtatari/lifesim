import { createStore } from './store.ts';

export type Modal = null | 'guide' | 'lab' | 'newWorld' | 'neuron' | 'shortcuts' | 'discoveries' | 'import';
export type DockTab = 'population' | 'traits' | 'skill' | 'species' | 'log';
export type InspectorTab = 'brain' | 'body' | 'dna' | 'family';

export interface Toast {
  id: number;
  kind: 'discovery' | 'info' | 'warning' | 'lesson';
  title: string;
  body: string;
  /** Field Guide entry to open from the toast. */
  guide?: string;
  icon?: string;
}

export interface LogEntry {
  id: number;
  t: number;
  kind: 'birth' | 'death' | 'species' | 'extinct' | 'env' | 'player' | 'discovery' | 'lesson';
  text: string;
  speciesId?: number;
  creatureId?: number;
}

export interface UiState {
  screen: 'home' | 'lab';
  scenarioId: string;
  worldName: string;
  modal: Modal;
  guideEntry: string | null;
  dockOpen: boolean;
  dockTab: DockTab;
  inspectorTab: InspectorTab;
  /** Side panel visibility (relevant on small screens). */
  panelOpen: boolean;
  toasts: Toast[];
  log: LogEntry[];
  lessonId: string | null;
  lessonStep: number;
  /** Discoveries made, persisted across worlds. */
  discovered: string[];
  /** Lessons completed, persisted. */
  completedLessons: string[];
  /** Brain view: show learned likings instead of instincts. */
  brainShowLearned: boolean;
  /** Brain surgery mode: clicking a connection edits it. */
  surgery: boolean;
}

const STORAGE_KEY = 'lifesim.progress.v1';

function loadProgress(): Pick<UiState, 'discovered' | 'completedLessons'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        discovered: Array.isArray(p.discovered) ? p.discovered : [],
        completedLessons: Array.isArray(p.completedLessons) ? p.completedLessons : [],
      };
    }
  } catch {
    /* storage unavailable: progress simply isn't remembered */
  }
  return { discovered: [], completedLessons: [] };
}

export const ui = createStore<UiState>({
  screen: 'home',
  scenarioId: 'ecosystem',
  worldName: 'Living ecosystem',
  modal: null,
  guideEntry: null,
  dockOpen: true,
  dockTab: 'population',
  inspectorTab: 'brain',
  panelOpen: true,
  toasts: [],
  log: [],
  lessonId: null,
  lessonStep: 0,
  brainShowLearned: false,
  surgery: false,
  ...loadProgress(),
});

ui.subscribe(() => {
  const s = ui.get();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ discovered: s.discovered, completedLessons: s.completedLessons }));
  } catch {
    /* ignore */
  }
});

let toastId = 1;
/** Discoveries wait their turn so the screen never fills with cards. */
const queued: { t: Omit<Toast, 'id'>; ttl: number }[] = [];
const MAX_DISCOVERY_TOASTS = 2;

export function pushToast(t: Omit<Toast, 'id'>, ttlMs = 9000): number {
  if (t.kind === 'discovery' && ui.get().toasts.filter((x) => x.kind === 'discovery').length >= MAX_DISCOVERY_TOASTS) {
    queued.push({ t, ttl: ttlMs });
    return -1;
  }
  const id = toastId++;
  ui.set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
  if (ttlMs > 0) setTimeout(() => dismissToast(id), ttlMs);
  return id;
}

export function dismissToast(id: number): void {
  ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  if (queued.length && ui.get().toasts.filter((x) => x.kind === 'discovery').length < MAX_DISCOVERY_TOASTS) {
    const next = queued.shift()!;
    setTimeout(() => pushToast(next.t, next.ttl), 400);
  }
}

export function clearToasts(): void {
  queued.length = 0;
  ui.set({ toasts: [] });
}

let logId = 1;
export function pushLog(e: Omit<LogEntry, 'id'>): void {
  ui.set((s) => {
    const log = s.log.length > 300 ? s.log.slice(-250) : s.log.slice();
    log.push({ ...e, id: logId++ });
    return { log };
  });
}

export function openGuide(entry: string | null = null): void {
  ui.set({ modal: 'guide', guideEntry: entry });
}
