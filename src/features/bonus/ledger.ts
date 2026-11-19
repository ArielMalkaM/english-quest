// Cross-tab guard for the bonus game. The household save is only written by the tab that changes
// it, so a second tab could still hold an old copy. This small shared record lets every tab see
// the real time already used today and whether the game is open somewhere else right now.

const KEY = 'english-quest/bonus-ledger';
/** A tab that has not written for this long is considered closed. */
const ALIVE_MS = 5000;

export interface LedgerEntry {
  usedMs: number;
  finished: boolean;
  tab: string;
  beat: number;
}

export const TAB_ID = Math.random().toString(36).slice(2);

const DEVICE_KEY = 'english-quest/device-id';
let device: string | null = null;

/**
 * Stable id of this browser/device: bonus play time is recorded per device and added up across
 * devices. All tabs of a browser share it (the tab guard below keeps them to one game at a time).
 */
export function deviceId(): string {
  if (device) return device;
  try {
    device = window.localStorage.getItem(DEVICE_KEY);
    if (!device) {
      device = `dev-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      window.localStorage.setItem(DEVICE_KEY, device);
    }
  } catch {
    device = `dev-${TAB_ID}`; // storage blocked: this page load counts as its own device
  }
  return device;
}

/** Test hook: forget the cached device id. */
export function resetDeviceIdForTests(): void {
  device = null;
}

function readAll(): Record<string, LedgerEntry> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, LedgerEntry>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const keyOf = (childId: string, date: string) => `${childId}:${date}`;

export function readLedger(childId: string, date: string): LedgerEntry | null {
  return readAll()[keyOf(childId, date)] ?? null;
}

/**
 * Records time used (never lower than what is already there). With `claim`, marks this tab as the
 * one playing; without it (tab hidden or unloading) the record is saved but another tab may take over.
 */
export function writeLedger(childId: string, date: string, usedMs: number, finished: boolean, claim = true): void {
  try {
    const all = readAll();
    const k = keyOf(childId, date);
    const prev = all[k];
    all[k] = {
      usedMs: Math.max(prev?.usedMs ?? 0, usedMs),
      finished: Boolean(prev?.finished || finished),
      tab: TAB_ID,
      beat: claim ? Date.now() : 0,
    };
    // Keep only the latest few days.
    const keys = Object.keys(all).sort((a, b) => all[b].beat - all[a].beat).slice(0, 12);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keys.map((x) => [x, all[x]]))));
  } catch {
    // Storage blocked: the household save still records the time.
  }
}

/** This tab is leaving (refresh, close, navigation): let the next page or tab take over at once. */
export function releaseLedger(childId: string, date: string): void {
  try {
    const all = readAll();
    const e = all[keyOf(childId, date)];
    if (!e || e.tab !== TAB_ID) return;
    all[keyOf(childId, date)] = { ...e, beat: 0 };
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** True while another open tab is running today's game for this child. */
export function openElsewhere(childId: string, date: string): boolean {
  const e = readLedger(childId, date);
  return Boolean(e && e.tab !== TAB_ID && !e.finished && Date.now() - e.beat < ALIVE_MS);
}
