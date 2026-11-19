import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAB_ID, deviceId, openElsewhere, readLedger, releaseLedger, resetDeviceIdForTests, writeLedger } from './ledger';

const KEY = 'english-quest/bonus-ledger';
const DAY = '2026-11-16';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('window', { localStorage: storage });
  resetDeviceIdForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** What another browser tab would have written. */
function otherTab(usedMs: number, beatAgoMs: number, finished = false) {
  storage.setItem(KEY, JSON.stringify({ [`kid:${DAY}`]: { usedMs, finished, tab: 'other-tab', beat: Date.now() - beatAgoMs } }));
}

describe('tab ledger', () => {
  it('records time used and never lowers it', () => {
    writeLedger('kid', DAY, 50_000, false);
    writeLedger('kid', DAY, 20_000, false);
    expect(readLedger('kid', DAY)).toMatchObject({ usedMs: 50_000, finished: false, tab: TAB_ID });
    writeLedger('kid', DAY, 60_000, true);
    writeLedger('kid', DAY, 70_000, false);
    expect(readLedger('kid', DAY)).toMatchObject({ usedMs: 70_000, finished: true });
  });

  it('keeps children and days apart', () => {
    writeLedger('kid', DAY, 1000, false);
    writeLedger('sibling', DAY, 2000, false);
    expect(readLedger('kid', DAY)?.usedMs).toBe(1000);
    expect(readLedger('sibling', DAY)?.usedMs).toBe(2000);
    expect(readLedger('kid', '2026-11-17')).toBeNull();
  });

  it('blocks this tab while another live tab is playing', () => {
    otherTab(30_000, 1000);
    expect(openElsewhere('kid', DAY)).toBe(true);
    expect(openElsewhere('sibling', DAY)).toBe(false);
  });

  it('lets this tab play when the other tab went quiet, was released, or finished', () => {
    otherTab(30_000, 6000);
    expect(openElsewhere('kid', DAY)).toBe(false);
    otherTab(30_000, Date.now()); // released (beat 0)
    expect(openElsewhere('kid', DAY)).toBe(false);
    otherTab(30_000, 0, true);
    expect(openElsewhere('kid', DAY)).toBe(false);
  });

  it('never blocks the tab that wrote the record (so a refresh resumes)', () => {
    writeLedger('kid', DAY, 30_000, false);
    expect(openElsewhere('kid', DAY)).toBe(false);
  });

  it('a hidden or unloading tab saves its time without claiming the game', () => {
    otherTab(10_000, 500);
    writeLedger('kid', DAY, 40_000, false, false);
    expect(readLedger('kid', DAY)).toMatchObject({ usedMs: 40_000, beat: 0 });
  });

  it('release only gives up this tab’s own claim', () => {
    writeLedger('kid', DAY, 40_000, false);
    releaseLedger('kid', DAY);
    expect(readLedger('kid', DAY)).toMatchObject({ usedMs: 40_000, beat: 0 });
    otherTab(10_000, 100);
    releaseLedger('kid', DAY);
    expect(openElsewhere('kid', DAY)).toBe(true);
  });

  it('survives corrupt or blocked storage', () => {
    storage.setItem(KEY, '{not json');
    expect(readLedger('kid', DAY)).toBeNull();
    writeLedger('kid', DAY, 5000, false);
    expect(readLedger('kid', DAY)?.usedMs).toBe(5000);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => writeLedger('kid', DAY, 1, false)).not.toThrow();
    expect(readLedger('kid', DAY)).toBeNull();
    expect(openElsewhere('kid', DAY)).toBe(false);
  });

  it('keeps only the latest few records', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 20; i++) {
      vi.setSystemTime(1_800_000_000_000 + i * 1000);
      writeLedger(`kid${i}`, DAY, i, false);
    }
    const all = JSON.parse(storage.getItem(KEY) ?? '{}');
    expect(Object.keys(all)).toHaveLength(12);
    expect(readLedger('kid19', DAY)).not.toBeNull();
    expect(readLedger('kid0', DAY)).toBeNull();
  });
});

describe('device id', () => {
  it('is created once and then stays the same', () => {
    const id = deviceId();
    expect(id).toMatch(/^dev-/);
    resetDeviceIdForTests();
    expect(deviceId()).toBe(id);
  });

  it('falls back to a per-page id when storage is blocked', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(deviceId()).toBe(`dev-${TAB_ID}`);
  });
});
