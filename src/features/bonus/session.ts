// Bookkeeping for one bonus game on this device: what can be played when the screen opens, the
// 5-minute clock, the results, and the checkpoints written to the child's record. Pure (no React,
// no storage), so refresh / resume / multi-device behaviour is easy to test.
import type { BonusCheckpoint, BonusStats } from '../../domain/bonusGame';
import { BONUS_ALLOWANCE_MS, addStats, bonusDay, earnedBonusOn, hasPlayedBonus, othersOf, partOf } from '../../domain/bonusGame';
import type { Progress } from '../../domain/types';

/** Coins for a right answer, and for driving all the way to the end of the 5 minutes. */
export const COINS_RIGHT = 5;
export const COINS_FINISH = 20;

/** mm:ss for the countdown (rounded up, so 00:00 only when the time is really over). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface RunStart {
  /** Time used today on all devices (drives the clock). */
  totalUsed: number;
  /** Time used today on this device. */
  ownUsed: number;
  /** This device's results so far today. */
  own: BonusStats;
  /** Results other devices added today. */
  others: BonusStats;
}

export type Entry =
  | { kind: 'locked' }
  | { kind: 'busy' }
  | { kind: 'used-up'; stats: BonusStats }
  | { kind: 'play'; start: RunStart; tutorial: boolean };

/**
 * What the bonus screen shows when it opens. `ledger` is this browser's shared tab record (it can
 * be a little ahead of the saved child record, by up to one checkpoint); `elsewhere` is true while
 * another tab of this browser is running the game.
 */
export function planEntry(
  progress: Progress,
  date: string,
  device: string,
  ledger: { usedMs: number; finished: boolean } | null,
  elsewhere: boolean,
): Entry {
  if (!earnedBonusOn(progress, date)) return { kind: 'locked' };
  if (elsewhere) return { kind: 'busy' };
  const day = bonusDay(progress, date);
  const saved = day?.usedMs ?? 0;
  const totalUsed = Math.min(BONUS_ALLOWANCE_MS, Math.max(saved, ledger?.usedMs ?? 0));
  const ownPart = partOf(day, device);
  const own: BonusStats = { score: ownPart.score, correct: ownPart.correct, answered: ownPart.answered, coins: ownPart.coins, bestStreak: ownPart.bestStreak };
  const others = othersOf(day, device);
  if (day?.finishedAt || ledger?.finished || totalUsed >= BONUS_ALLOWANCE_MS) return { kind: 'used-up', stats: addStats(others, own) };
  return {
    kind: 'play',
    // Time the tab record has beyond the last save was played in this browser.
    start: { totalUsed, ownUsed: ownPart.usedMs + (totalUsed - saved), own, others },
    tutorial: !hasPlayedBonus(progress) && totalUsed === 0,
  };
}

export interface AnswerResult {
  correct: boolean;
  points: number;
  streak: number;
}

/** The running game: one clock for the day, results kept per device. */
export class BonusRun {
  totalUsed: number;
  ownUsed: number;
  own: BonusStats;
  readonly others: BonusStats;
  finished = false;

  constructor(start: RunStart) {
    this.totalUsed = Math.min(BONUS_ALLOWANCE_MS, start.totalUsed);
    this.ownUsed = start.ownUsed;
    this.own = { ...start.own };
    this.others = start.others;
  }

  get leftMs(): number {
    return Math.max(0, BONUS_ALLOWANCE_MS - this.totalUsed);
  }

  /** Day totals shown on screen. */
  get stats(): BonusStats {
    return addStats(this.others, this.own);
  }

  /** Adds played time; returns true when the 5 minutes are used up. */
  tick(ms: number): boolean {
    if (this.finished) return true;
    const add = Math.min(Math.max(0, ms), this.leftMs);
    this.totalUsed += add;
    this.ownUsed += add;
    return this.leftMs <= 0;
  }

  answer(r: AnswerResult): void {
    if (this.finished) return;
    const s = this.own;
    this.own = {
      score: s.score + r.points,
      correct: s.correct + (r.correct ? 1 : 0),
      answered: s.answered + 1,
      coins: s.coins + (r.correct ? COINS_RIGHT : 0),
      bestStreak: Math.max(s.bestStreak, r.streak),
    };
  }

  coin(): void {
    if (!this.finished) this.own = { ...this.own, coins: this.own.coins + 1 };
  }

  /** Ends the game. Running out of time earns the finish bonus; a game that outlived its day does not. */
  finish(expired = false): void {
    if (this.finished) return;
    if (!expired) {
      const rest = this.leftMs;
      this.totalUsed += rest;
      this.ownUsed += rest;
      this.own = { ...this.own, coins: this.own.coins + COINS_FINISH };
    }
    this.finished = true;
  }

  checkpoint(device: string): BonusCheckpoint {
    return { ...this.own, device, usedMs: this.ownUsed, finished: this.finished };
  }
}

