import type { AppState } from '../domain/types';
import { STATE_VERSION } from './seed';

/**
 * Persistence boundary. The UI only talks to this interface, so the local-storage
 * implementation can later be swapped for an HTTP client without touching features.
 */
export interface AppRepository {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'english-quest/state';

export class LocalStorageRepository implements AppRepository {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.localStorage) {}

  async load(): Promise<AppState | null> {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppState;
      return parsed && parsed.version === STATE_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(state: AppState): Promise<void> {
    try {
      this.storage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked (private mode): the app keeps working in memory.
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
}
