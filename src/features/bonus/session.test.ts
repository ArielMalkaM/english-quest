import { describe, expect, it } from 'vitest';
import { BONUS_ALLOWANCE_MS, bonusDay, recordBonus } from '../../domain/bonusGame';
import type { Progress } from '../../domain/types';
import { NOW, STATS, TODAY, YESTERDAY, childAfter } from '../../test/bonusFixtures';
import { BonusRun, COINS_FINISH, COINS_RIGHT, planEntry } from './session';
import type { RunStart } from './session';

const MIN = 60_000;

function startOf(progress: Progress, device = 'phone', ledger: { usedMs: number; finished: boolean } | null = null): RunStart {
  const e = planEntry(progress, TODAY, device, ledger, false);
  if (e.kind !== 'play') throw new Error(`expected a playable game, got ${e.kind}`);
  return e.start;
}

/** Plays `ms` of game time in 16 ms frames, answering one gate every 6 s (alternating right/wrong). */
function playFor(run: BonusRun, ms: number): boolean {
  let over = false;
  let sinceGate = 0;
  let streak = 0;
  for (let t = 0; t < ms && !over; t += 16) {
    over = run.tick(16);
    sinceGate += 16;
    if (sinceGate >= 6000) {
      sinceGate = 0;
      const correct = run.own.answered % 2 === 0;
      streak = correct ? streak + 1 : 0;
      run.answer({ correct, points: correct ? 10 : 0, streak });
    }
  }
  return over;
}

const save = (p: Progress, run: BonusRun, device = 'phone', at = NOW) => recordBonus(p, TODAY, run.checkpoint(device), at);

describe('opening the bonus screen', () => {
  it('is locked without a quest finished today', () => {
    expect(planEntry(childAfter(6, 1, { lastDate: YESTERDAY }).progress, TODAY, 'phone', null, false).kind).toBe('locked');
  });

  it('is blocked while another tab is playing', () => {
    expect(planEntry(childAfter(6).progress, TODAY, 'phone', null, true).kind).toBe('busy');
  });

  it('starts fresh, with the tutorial for a first-time player', () => {
    const e = planEntry(childAfter(6).progress, TODAY, 'phone', null, false);
    expect(e).toMatchObject({ kind: 'play', tutorial: true, start: { totalUsed: 0, ownUsed: 0 } });
  });

  it('skips the tutorial once any bonus game was played (even on another day)', () => {
    const base = childAfter(6, 2, { lastDate: TODAY });
    const p = { ...base.progress, sessions: [...base.progress.sessions, { lessonId: 'x', completedAt: NOW.toISOString(), date: YESTERDAY, seconds: 1 }] };
    const played = recordBonus(p, YESTERDAY, { ...STATS, device: 'phone', usedMs: 1000 }, NOW);
    expect(planEntry(played, TODAY, 'phone', null, false)).toMatchObject({ kind: 'play', tutorial: false });
  });

  it('shows the results instead of a new game once the 5 minutes are used', () => {
    const done = recordBonus(childAfter(6).progress, TODAY, { ...STATS, device: 'phone', usedMs: BONUS_ALLOWANCE_MS }, NOW);
    expect(planEntry(done, TODAY, 'phone', null, false)).toEqual({ kind: 'used-up', stats: STATS });
    // The tab record alone is enough (the save to the child record may not have happened yet).
    const p = childAfter(6).progress;
    expect(planEntry(p, TODAY, 'phone', { usedMs: BONUS_ALLOWANCE_MS, finished: false }, false).kind).toBe('used-up');
    expect(planEntry(p, TODAY, 'phone', { usedMs: 10, finished: true }, false).kind).toBe('used-up');
  });
});

describe('a running game', () => {
  it('counts down 5 minutes and ends exactly at zero', () => {
    const run = new BonusRun(startOf(childAfter(6).progress));
    expect(run.leftMs).toBe(BONUS_ALLOWANCE_MS);
    expect(playFor(run, 4 * MIN)).toBe(false);
    expect(run.leftMs).toBeCloseTo(MIN, -2);
    expect(playFor(run, 2 * MIN)).toBe(true);
    expect(run.totalUsed).toBe(BONUS_ALLOWANCE_MS);
    expect(run.tick(5000)).toBe(true);
    expect(run.totalUsed).toBe(BONUS_ALLOWANCE_MS);
  });

  it('scores answers: points, coins, accuracy inputs and best streak', () => {
    const run = new BonusRun(startOf(childAfter(6).progress));
    run.answer({ correct: true, points: 10, streak: 1 });
    run.answer({ correct: true, points: 15, streak: 2 });
    run.answer({ correct: false, points: 0, streak: 0 });
    run.coin();
    expect(run.stats).toEqual({ score: 25, correct: 2, answered: 3, coins: 2 * COINS_RIGHT + 1, bestStreak: 2 });
  });

  it('adds the finish bonus once, and nothing after the end', () => {
    const run = new BonusRun(startOf(childAfter(6).progress));
    playFor(run, 30_000);
    const coins = run.own.coins;
    run.finish();
    run.finish();
    run.answer({ correct: true, points: 10, streak: 1 });
    run.coin();
    expect(run.own.coins).toBe(coins + COINS_FINISH);
    expect(run.totalUsed).toBe(BONUS_ALLOWANCE_MS);
    expect(run.checkpoint('phone')).toMatchObject({ device: 'phone', finished: true, usedMs: BONUS_ALLOWANCE_MS });
  });

  it('a game that outlives its day ends without the finish bonus and without using up time', () => {
    const run = new BonusRun(startOf(childAfter(6).progress));
    playFor(run, 30_000);
    const before = { ...run.own };
    run.finish(true);
    expect(run.own).toEqual(before);
    expect(run.totalUsed).toBeCloseTo(30_000, -2);
    expect(run.finished).toBe(true);
  });
});

describe('refresh and interrupted games', () => {
  it('a refresh resumes with the time and results already earned', () => {
    let p = childAfter(6).progress;
    const first = new BonusRun(startOf(p));
    playFor(first, 100_000);
    p = save(p, first); // last checkpoint before the refresh
    playFor(first, 7_000); // played a little more; only the tab record (ledger) saw it
    const ledger = { usedMs: first.totalUsed, finished: false };

    const resumed = new BonusRun(startOf(p, 'phone', ledger));
    expect(resumed.totalUsed).toBe(first.totalUsed);
    expect(resumed.ownUsed).toBe(first.ownUsed);
    expect(resumed.stats).toEqual({ ...first.stats, ...bonusStatsAtSave(p) });
    expect(resumed.leftMs).toBe(first.leftMs);
  });

  it('closing the app mid-game and finishing later still adds up to exactly 5 minutes', () => {
    let p = childAfter(6).progress;
    let total = 0;
    for (const chunk of [40_000, 75_000, 20_000]) {
      const run = new BonusRun(startOf(p));
      playFor(run, chunk);
      p = save(p, run);
      total += chunk;
      expect(bonusDay(p, TODAY)?.usedMs).toBeCloseTo(total, -2);
    }
    const last = new BonusRun(startOf(p));
    expect(playFor(last, 10 * MIN)).toBe(true);
    last.finish();
    p = save(p, last);
    expect(bonusDay(p, TODAY)?.usedMs).toBe(BONUS_ALLOWANCE_MS);
    expect(planEntry(p, TODAY, 'phone', null, false).kind).toBe('used-up');
  });

  it('cannot be restarted for another 5 minutes, whatever is replayed', () => {
    let p = childAfter(6).progress;
    const run = new BonusRun(startOf(p));
    playFor(run, 10 * MIN);
    run.finish();
    p = save(p, run);
    // Replaying an early checkpoint, or a fresh "zero" game from the same device.
    p = recordBonus(p, TODAY, { ...STATS, device: 'phone', usedMs: 1000, finished: false }, NOW);
    p = recordBonus(p, TODAY, { score: 0, correct: 0, answered: 0, coins: 0, bestStreak: 0, device: 'phone', usedMs: 0 }, NOW);
    expect(planEntry(p, TODAY, 'phone', null, false).kind).toBe('used-up');
  });

  it('a second device continues the same day with only the time that is left', () => {
    let p = childAfter(6).progress;
    const phone = new BonusRun(startOf(p, 'phone'));
    playFor(phone, 200_000);
    p = save(p, phone, 'phone');

    const tablet = new BonusRun(startOf(p, 'tablet'));
    expect(tablet.ownUsed).toBe(0);
    expect(tablet.leftMs).toBeCloseTo(100_000, -2);
    expect(tablet.stats).toEqual(phone.stats); // the day's results so far are shown
    expect(playFor(tablet, 5 * MIN)).toBe(true);
    tablet.finish();
    p = save(p, tablet, 'tablet');
    const day = bonusDay(p, TODAY);
    expect(day?.usedMs).toBe(BONUS_ALLOWANCE_MS);
    expect(day?.answered).toBe(phone.own.answered + tablet.own.answered);
    expect(planEntry(p, TODAY, 'phone', null, false).kind).toBe('used-up');
  });
});

function bonusStatsAtSave(p: Progress) {
  const d = bonusDay(p, TODAY);
  return d ? { score: d.score, correct: d.correct, answered: d.answered, coins: d.coins, bestStreak: d.bestStreak } : {};
}
