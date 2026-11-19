import { afterEach, describe, expect, it } from 'vitest';
import { lessonOrder } from '../data/curriculum';
import { NOW, STATS, TODAY, YESTERDAY, childAfter, newChild } from '../test/bonusFixtures';
import {
  BONUS_ALLOWANCE_MS,
  KEEP_BONUS_DAYS,
  bonusDay,
  bonusStatus,
  emptyBonusDay,
  hasPlayedBonus,
  markBonusPrompted,
  mergeBonusDay,
  mergeBonusDays,
  othersOf,
  partOf,
  recordBonus,
  remainingMs,
  shouldPromptBonus,
} from './bonusGame';
import { localDate } from './dates';
import { completeStep } from './session';
import type { AttemptInput } from './session';
import { balance } from './tickets';
import type { AppState, BonusDay, StepId } from './types';
import { CORE_STEPS } from './types';

const cp = (usedMs: number, extra: Partial<typeof STATS> & { device?: string; finished?: boolean } = {}) => ({ ...STATS, device: 'phone', usedMs, ...extra });
const attempt: AttemptInput[] = [{ activityType: 'choice', skill: 'grammar', seconds: 60, items: [{ key: 'k', firstTry: true, solved: true }] }];

/** Plays the four required steps of a quest; `times[i]` is when step i is finished. */
function playQuest(s: AppState, lessonId: string, times: Date[]): AppState {
  return CORE_STEPS.reduce((acc, step: StepId, i) => completeStep(acc, lessonId, step, attempt, times[i]).state, s);
}

describe('daily unlock', () => {
  it('is locked until a quest is finished today', () => {
    expect(bonusStatus(newChild(6).progress, NOW)).toBe('locked');
    expect(shouldPromptBonus(newChild(6).progress, NOW)).toBe(false);
    expect(bonusStatus(childAfter(6, 1, { lastDate: YESTERDAY }).progress, NOW)).toBe('locked');
  });

  it('unlocks when the last required step of a quest is completed', () => {
    const first = lessonOrder(4)[0];
    let s = newChild(4);
    for (const [i, step] of CORE_STEPS.entries()) {
      expect(bonusStatus(s.progress, NOW), `before ${step}`).toBe('locked');
      s = completeStep(s, first, step, attempt, new Date(NOW.getTime() + i * 60_000)).state;
    }
    expect(bonusStatus(s.progress, NOW)).toBe('ready');
    expect(shouldPromptBonus(s.progress, NOW)).toBe(true);
  });

  it('the optional bonus step and practice replays do not unlock anything', () => {
    const first = lessonOrder(6)[0];
    // Yesterday's finished quest, replayed today as practice.
    const done = playQuest(newChild(6), first, CORE_STEPS.map(() => new Date(2026, 10, 15, 17)));
    let s = completeStep(done, first, 'learn', attempt, NOW).state; // practice
    s = completeStep(s, first, 'bonus', attempt, NOW).state; // optional step
    expect(s.progress.sessions.filter((x) => x.date === TODAY)).toHaveLength(0);
    expect(bonusStatus(s.progress, NOW)).toBe('locked');
  });

  it('a second quest the same day does not open a second bonus', () => {
    const [a, b] = lessonOrder(6);
    let s = playQuest(newChild(6), a, CORE_STEPS.map(() => NOW));
    s = { ...s, progress: recordBonus(s.progress, TODAY, cp(BONUS_ALLOWANCE_MS, { finished: true }), NOW) };
    s = playQuest(s, b, CORE_STEPS.map(() => NOW));
    expect(s.progress.sessions.filter((x) => x.date === TODAY)).toHaveLength(2);
    expect(Object.keys(s.progress.bonusDays ?? {})).toEqual([TODAY]);
    expect(bonusStatus(s.progress, NOW)).toBe('done');
    expect(shouldPromptBonus(s.progress, NOW)).toBe(false);
  });

  it('the pop-up is shown once: answering it is final and repeat answers change nothing', () => {
    const p = childAfter(6).progress;
    const answered = markBonusPrompted(p, NOW);
    expect(shouldPromptBonus(answered, NOW)).toBe(false);
    expect(bonusStatus(answered, NOW)).toBe('ready'); // "Play later" keeps it available
    expect(markBonusPrompted(answered, new Date(NOW.getTime() + 3600_000))).toBe(answered);
    expect(markBonusPrompted(newChild(6).progress, NOW)).toEqual(newChild(6).progress);
  });

  it('a game that was started counts as answered (no pop-up after Play now + refresh)', () => {
    const p = recordBonus(childAfter(6).progress, TODAY, cp(1000), NOW);
    expect(shouldPromptBonus(p, NOW)).toBe(false);
    expect(bonusStatus(p, NOW)).toBe('playing');
  });
});

/** Node's environment (tests run in Node; the app's type settings only include browser types). */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe('day boundaries', () => {
  const originalTz = env.TZ;
  afterEach(() => {
    env.TZ = originalTz;
  });

  it('a quest finished at 23:59 unlocks that day only; the next day is locked again', () => {
    const late = new Date(2026, 10, 16, 23, 59, 30);
    const s = playQuest(newChild(6), lessonOrder(6)[0], CORE_STEPS.map(() => late));
    expect(bonusStatus(s.progress, late)).toBe('ready');
    expect(bonusStatus(s.progress, new Date(2026, 10, 17, 0, 0, 1))).toBe('locked');
  });

  it('a quest that crosses midnight unlocks the day it was finished', () => {
    const times = [new Date(2026, 10, 16, 23, 40), new Date(2026, 10, 16, 23, 50), new Date(2026, 10, 16, 23, 58), new Date(2026, 10, 17, 0, 6)];
    const s = playQuest(newChild(6), lessonOrder(6)[0], times);
    expect(s.progress.sessions[0].date).toBe('2026-11-17');
    expect(bonusStatus(s.progress, new Date(2026, 10, 16, 23, 59))).toBe('locked');
    expect(bonusStatus(s.progress, new Date(2026, 10, 17, 8, 0))).toBe('ready');
  });

  it('time left from yesterday does not carry over', () => {
    let p = childAfter(6, 1, { lastDate: YESTERDAY }).progress;
    p = recordBonus(p, YESTERDAY, cp(60_000), new Date(2026, 10, 15, 18));
    expect(bonusStatus(p, NOW)).toBe('locked');
    expect(remainingMs(bonusDay(p, TODAY))).toBe(BONUS_ALLOWANCE_MS); // a new day starts fresh once earned
  });

  it('uses the device time zone, like quest sessions do', () => {
    const instant = new Date(Date.UTC(2026, 10, 19, 22, 30)); // 19 Nov 22:30 UTC
    env.TZ = 'Asia/Jerusalem';
    expect(localDate(instant)).toBe('2026-11-20');
    env.TZ = 'America/New_York';
    expect(localDate(instant)).toBe('2026-11-19');
  });

  it('a daylight-saving change day is still one day', () => {
    env.TZ = 'Asia/Jerusalem'; // clocks go back on 25 Oct 2026
    expect(localDate(new Date(2026, 9, 25, 0, 30))).toBe('2026-10-25');
    expect(localDate(new Date(2026, 9, 25, 23, 30))).toBe('2026-10-25');
    env.TZ = 'America/New_York'; // clocks go back on 1 Nov 2026
    expect(localDate(new Date(2026, 10, 1, 0, 30))).toBe('2026-11-01');
    expect(localDate(new Date(2026, 10, 1, 23, 30))).toBe('2026-11-01');
  });
});

describe('recording play time', () => {
  it('moves through ready → playing → done', () => {
    let p = childAfter(6).progress;
    expect(bonusStatus(p, NOW)).toBe('ready');
    p = recordBonus(p, TODAY, cp(120_000), NOW);
    expect(bonusStatus(p, NOW)).toBe('playing');
    expect(remainingMs(bonusDay(p, TODAY))).toBe(180_000);
    p = recordBonus(p, TODAY, cp(BONUS_ALLOWANCE_MS), NOW);
    expect(bonusStatus(p, NOW)).toBe('done');
    expect(bonusDay(p, TODAY)?.finishedAt).toBe(NOW.toISOString());
  });

  it('never gives time back: stale, replayed or forged checkpoints', () => {
    let p = childAfter(6).progress;
    p = recordBonus(p, TODAY, cp(120_000), NOW);
    expect(recordBonus(p, TODAY, cp(10_000), NOW).bonusDays?.[TODAY].usedMs).toBe(120_000);
    expect(recordBonus(p, TODAY, cp(-5), NOW).bonusDays?.[TODAY].usedMs).toBe(120_000);
    expect(recordBonus(p, TODAY, cp(Number.NaN), NOW).bonusDays?.[TODAY].usedMs).toBe(120_000);
    const replay = recordBonus(p, TODAY, cp(120_000), NOW);
    expect(replay.bonusDays?.[TODAY]).toEqual(p.bonusDays?.[TODAY]);
  });

  it('caps time at 5 minutes and keeps a finished game finished', () => {
    let p = recordBonus(childAfter(6).progress, TODAY, cp(10 * BONUS_ALLOWANCE_MS), NOW);
    expect(bonusDay(p, TODAY)?.usedMs).toBe(BONUS_ALLOWANCE_MS);
    p = recordBonus(childAfter(6).progress, TODAY, cp(50_000, { finished: true }), NOW);
    const finishedAt = bonusDay(p, TODAY)?.finishedAt;
    p = recordBonus(p, TODAY, cp(60_000, { finished: false }), new Date(NOW.getTime() + 1000));
    expect(bonusDay(p, TODAY)?.finishedAt).toBe(finishedAt);
    expect(bonusStatus(p, NOW)).toBe('done');
  });

  it('results only go up, so re-sent results are never counted twice', () => {
    let p = recordBonus(childAfter(6).progress, TODAY, cp(10_000, { coins: 40, score: 90 }), NOW);
    p = recordBonus(p, TODAY, cp(20_000, { coins: 40, score: 90 }), NOW);
    p = recordBonus(p, TODAY, cp(30_000, { coins: 10, score: 5 }), NOW);
    expect(bonusDay(p, TODAY)).toMatchObject({ coins: 40, score: 90, usedMs: 30_000 });
  });

  it('is ignored on a day that did not earn a bonus, and for an empty device id', () => {
    const locked = childAfter(6, 1, { lastDate: YESTERDAY }).progress;
    expect(recordBonus(locked, TODAY, cp(1), NOW)).toBe(locked);
    const p = childAfter(6).progress;
    expect(recordBonus(p, TODAY, cp(1, { device: '' }), NOW)).toBe(p);
  });

  it('keeps the first start / prompt time', () => {
    let p = markBonusPrompted(childAfter(6).progress, NOW);
    p = recordBonus(p, TODAY, cp(1000), new Date(NOW.getTime() + 5000));
    p = recordBonus(p, TODAY, cp(2000), new Date(NOW.getTime() + 9000));
    expect(bonusDay(p, TODAY)).toMatchObject({ promptedAt: NOW.toISOString(), startedAt: new Date(NOW.getTime() + 5000).toISOString() });
  });

  it('does not touch tickets or other progress', () => {
    const s = childAfter(6);
    const p = recordBonus(s.progress, TODAY, cp(BONUS_ALLOWANCE_MS, { finished: true, coins: 999 }), NOW);
    expect({ ...p, bonusDays: undefined }).toEqual({ ...s.progress, bonusDays: undefined });
    expect(balance(s.tickets)).toBe(balance(newChild(6).tickets));
  });

  it('tutorial shows until the first real play', () => {
    expect(hasPlayedBonus(childAfter(6).progress)).toBe(false);
    expect(hasPlayedBonus(markBonusPrompted(childAfter(6).progress, NOW))).toBe(false);
    expect(hasPlayedBonus(recordBonus(childAfter(6).progress, TODAY, cp(1), NOW))).toBe(true);
  });
});

describe('several devices and merging', () => {
  it('adds up the time of different devices (phone + tablet share one 5 minutes)', () => {
    let p = childAfter(6).progress;
    p = recordBonus(p, TODAY, cp(120_000, { device: 'phone', coins: 10 }), NOW);
    p = recordBonus(p, TODAY, cp(150_000, { device: 'tablet', coins: 7 }), NOW);
    expect(bonusDay(p, TODAY)).toMatchObject({ usedMs: 270_000, coins: 17 });
    p = recordBonus(p, TODAY, cp(60_000, { device: 'laptop' }), NOW);
    expect(bonusDay(p, TODAY)?.usedMs).toBe(BONUS_ALLOWANCE_MS);
    expect(bonusDay(p, TODAY)?.finishedAt).toBeDefined();
  });

  it('partOf / othersOf split the day into this device and the rest', () => {
    let p = childAfter(6).progress;
    p = recordBonus(p, TODAY, cp(100_000, { device: 'phone', score: 50, correct: 5, answered: 6, coins: 30, bestStreak: 4 }), NOW);
    p = recordBonus(p, TODAY, cp(20_000, { device: 'tablet', score: 10, correct: 1, answered: 2, coins: 6, bestStreak: 1 }), NOW);
    const day = bonusDay(p, TODAY);
    expect(partOf(day, 'tablet')).toMatchObject({ usedMs: 20_000, score: 10 });
    expect(othersOf(day, 'tablet')).toEqual({ score: 50, correct: 5, answered: 6, coins: 30, bestStreak: 4 });
    expect(partOf(day, 'new-device').usedMs).toBe(0);
  });

  it('merging is order-independent and idempotent', () => {
    const base = childAfter(6).progress;
    const a = bonusDay(recordBonus(base, TODAY, cp(90_000, { device: 'phone' }), NOW), TODAY) as BonusDay;
    const b = bonusDay(recordBonus(recordBonus(base, TODAY, cp(30_000, { device: 'phone' }), NOW), TODAY, cp(40_000, { device: 'tablet' }), NOW), TODAY) as BonusDay;
    const ab = mergeBonusDay(a, b);
    expect(ab).toEqual(mergeBonusDay(b, a));
    expect(mergeBonusDay(ab, ab)).toEqual(ab);
    expect(mergeBonusDay(ab, a)).toEqual(ab);
    expect(ab.usedMs).toBe(130_000); // phone max(90, 30) + tablet 40
  });

  it('a finished record stays finished after any merge', () => {
    const done: BonusDay = { ...emptyBonusDay(TODAY), usedMs: 300_000, finishedAt: NOW.toISOString() };
    const other: BonusDay = { ...emptyBonusDay(TODAY), usedMs: 10_000, parts: { tablet: { ...STATS, usedMs: 10_000 } } };
    expect(mergeBonusDay(other, done)).toMatchObject({ usedMs: BONUS_ALLOWANCE_MS, finishedAt: NOW.toISOString() });
  });

  it('keeps the newest 30 days of history', () => {
    const days: Record<string, BonusDay> = {};
    for (let i = 0; i < 40; i++) {
      const d = localDate(new Date(2026, 8, 1 + i));
      days[d] = emptyBonusDay(d);
    }
    const merged = mergeBonusDays(days, { [TODAY]: emptyBonusDay(TODAY) }) ?? {};
    expect(Object.keys(merged)).toHaveLength(KEEP_BONUS_DAYS);
    expect(merged[TODAY]).toBeDefined();
    expect(mergeBonusDays(undefined, days)).toBe(days);
    expect(mergeBonusDays(days, undefined)).toBe(days);
  });
});
