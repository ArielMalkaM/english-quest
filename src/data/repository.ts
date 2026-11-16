import { HOUSEHOLD_VERSION, householdFromState } from '../domain/household';
import type { AppState, Household } from '../domain/types';

/**
 * Persistence boundary. The UI only talks to this interface, so the local-storage
 * implementation can later be swapped for an HTTP client without touching features.
 */
export interface AppRepository {
  load(): Promise<Household | null>;
  save(household: Household): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'english-quest/state';
/** Untouched copy of a single-child save, kept when it is upgraded to a household. */
const V1_BACKUP_KEY = 'english-quest/state-v1-backup';

/** Id given to the child that existed before multi-child support. */
export const MIGRATED_CHILD_ID = 'child-1';

/**
 * Reads any saved format. Version 1 (one learner) is upgraded to a household with that
 * learner as the first child (grade 6), keeping every quest, ticket, word stat and request.
 */
export function parseSaved(raw: string): { household: Household; migrated: boolean } | null {
  const parsed = JSON.parse(raw) as (AppState | Household) & { version?: number };
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.version === HOUSEHOLD_VERSION && Array.isArray((parsed as Household).children)) {
    return { household: parsed as Household, migrated: false };
  }
  if (parsed.version === 1) {
    const v1 = parsed as AppState;
    if (!v1.profile) return null; // onboarding was never finished: nothing to keep
    const profile = { ...v1.profile, grade: v1.profile.grade ?? 6 };
    return { household: householdFromState({ ...v1, profile }, MIGRATED_CHILD_ID), migrated: true };
  }
  return null;
}

export class LocalStorageRepository implements AppRepository {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.localStorage) {}

  async load(): Promise<Household | null> {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return null;
      const result = parseSaved(raw);
      if (!result) return null;
      if (result.migrated) {
        if (!this.storage.getItem(V1_BACKUP_KEY)) this.storage.setItem(V1_BACKUP_KEY, raw);
        this.storage.setItem(KEY, JSON.stringify(result.household));
      }
      return result.household;
    } catch {
      return null;
    }
  }

  async save(household: Household): Promise<void> {
    try {
      this.storage.setItem(KEY, JSON.stringify(household));
    } catch {
      // Storage full or blocked (private mode): the app keeps working in memory.
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage.removeItem(KEY);
      this.storage.removeItem(V1_BACKUP_KEY);
    } catch {
      // ignore
    }
  }
}
