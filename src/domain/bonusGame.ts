// Daily Bonus Adventure: rules for when the 5-minute bonus game is open and how its use is recorded.
//
// - It unlocks on a local day (same day boundary as quest sessions, see dates.localDate) once the
//   child has finished a whole quest that day. No quest finished today → no bonus.
// - One allowance per day: 5 minutes of active play, shared by every device of the family.
// - Each device records its own play time and results ("parts"). A device's numbers only ever go
//   up, so a refresh, a replayed or stale save, or a second tab cannot hand out time again; parts of
//   different devices are added up, so playing on a phone and a tablet still totals 5 minutes.
// - The allowance lapses at the end of the local day.
import { localDate } from './dates';
import type { BonusDay, BonusPart, Progress } from './types';

export const BONUS_ALLOWANCE_MS = 5 * 60 * 1000;
/** Days of bonus history kept on the child record. */
export const KEEP_BONUS_DAYS = 30;

export type BonusStatus = 'locked' | 'ready' | 'playing' | 'done';

export interface BonusStats {
  score: number;
  correct: number;
  answered: number;
  coins: number;
  bestStreak: number;
}

export const ZERO_STATS: BonusStats = { score: 0, correct: 0, answered: 0, coins: 0, bestStreak: 0 };
const ZERO_PART: BonusPart = { ...ZERO_STATS, usedMs: 0 };

export function emptyBonusDay(date: string): BonusDay {
  return { date, ...ZERO_PART };
}

/** True when a whole quest was completed on this local date. */
export function earnedBonusOn(progress: Progress, date: string): boolean {
  return progress.sessions.some((s) => s.date === date);
}

export function bonusDay(progress: Progress, date: string): BonusDay | null {
  return progress.bonusDays?.[date] ?? null;
}

export function remainingMs(day: BonusDay | null): number {
  return Math.max(0, BONUS_ALLOWANCE_MS - (day?.usedMs ?? 0));
}

export function bonusStatus(progress: Progress, now: Date): BonusStatus {
  const date = localDate(now);
  if (!earnedBonusOn(progress, date)) return 'locked';
  const day = bonusDay(progress, date);
  if (!day || day.usedMs <= 0) return day?.finishedAt ? 'done' : 'ready';
  if (day.finishedAt || remainingMs(day) <= 0) return 'done';
  return 'playing';
}

/** Show the "you unlocked it" pop-up once: unlocked today and not answered yet. */
export function shouldPromptBonus(progress: Progress, now: Date): boolean {
  const date = localDate(now);
  return earnedBonusOn(progress, date) && !bonusDay(progress, date)?.promptedAt && bonusStatus(progress, now) === 'ready';
}

/** The tutorial is shown until the child has played any bonus game before. */
export function hasPlayedBonus(progress: Progress): boolean {
  return Object.values(progress.bonusDays ?? {}).some((d) => d.usedMs > 0);
}

// ───────────────────────── Per-device parts ─────────────────────────

function maxPart(a: BonusPart, b: BonusPart): BonusPart {
  return {
    usedMs: Math.max(a.usedMs, b.usedMs),
    score: Math.max(a.score, b.score),
    correct: Math.max(a.correct, b.correct),
    answered: Math.max(a.answered, b.answered),
    coins: Math.max(a.coins, b.coins),
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
  };
}

function sumParts(parts: BonusPart[]): BonusPart {
  return parts.reduce(
    (t, p) => ({
      usedMs: t.usedMs + p.usedMs,
      score: t.score + p.score,
      correct: t.correct + p.correct,
      answered: t.answered + p.answered,
      coins: t.coins + p.coins,
      bestStreak: Math.max(t.bestStreak, p.bestStreak),
    }),
    ZERO_PART,
  );
}

/** What this device has recorded for the day (zero when it has not played yet). */
export function partOf(day: BonusDay | null, device: string): BonusPart {
  return day?.parts?.[device] ?? ZERO_PART;
}

/** Results of the whole day minus this device's part: what other devices added. */
export function othersOf(day: BonusDay | null, device: string): BonusStats {
  if (!day) return ZERO_STATS;
  const own = partOf(day, device);
  return {
    score: Math.max(0, day.score - own.score),
    correct: Math.max(0, day.correct - own.correct),
    answered: Math.max(0, day.answered - own.answered),
    coins: Math.max(0, day.coins - own.coins),
    bestStreak: day.bestStreak,
  };
}

/** Day totals shown to the child: other devices' results plus this game's. */
export function addStats(a: BonusStats, b: BonusStats): BonusStats {
  return {
    score: a.score + b.score,
    correct: a.correct + b.correct,
    answered: a.answered + b.answered,
    coins: a.coins + b.coins,
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
  };
}

// ───────────────────────── Merging ─────────────────────────

function prune(days: Record<string, BonusDay>): Record<string, BonusDay> {
  const keys = Object.keys(days).sort();
  if (keys.length <= KEEP_BONUS_DAYS) return days;
  return Object.fromEntries(keys.slice(-KEEP_BONUS_DAYS).map((k) => [k, days[k]]));
}

/**
 * Combines two records of the same day (two saves, two tabs or two devices). Each device's part
 * takes the larger value of each field; the day totals are the sum of all parts, and never lower
 * than either record already said. Earliest prompt / start / finish times win.
 */
export function mergeBonusDay(a: BonusDay, b: BonusDay): BonusDay {
  const earlier = (x?: string, y?: string) => (!x ? y : !y ? x : x < y ? x : y);
  const parts: Record<string, BonusPart> = { ...(a.parts ?? {}) };
  for (const [device, p] of Object.entries(b.parts ?? {})) parts[device] = parts[device] ? maxPart(parts[device], p) : p;
  const total = sumParts(Object.values(parts));
  const best = maxPart(maxPart(a, b), total);
  const promptedAt = earlier(a.promptedAt, b.promptedAt);
  const startedAt = earlier(a.startedAt, b.startedAt);
  const finishedAt = earlier(a.finishedAt, b.finishedAt);
  return {
    date: a.date,
    ...(promptedAt ? { promptedAt } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...best,
    usedMs: Math.min(BONUS_ALLOWANCE_MS, best.usedMs),
    ...(Object.keys(parts).length > 0 ? { parts } : {}),
  };
}

export function mergeBonusDays(
  a: Record<string, BonusDay> | undefined,
  b: Record<string, BonusDay> | undefined,
): Record<string, BonusDay> | undefined {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const [date, day] of Object.entries(b)) out[date] = out[date] ? mergeBonusDay(out[date], day) : day;
  return prune(out);
}

function writeDay(progress: Progress, date: string, change: (day: BonusDay) => BonusDay): Progress {
  const current = bonusDay(progress, date) ?? emptyBonusDay(date);
  const next = mergeBonusDay(current, change(current));
  return { ...progress, bonusDays: prune({ ...(progress.bonusDays ?? {}), [date]: next }) };
}

// ───────────────────────── Recording ─────────────────────────

/** The child answered the pop-up (Play now or Play later): do not show it again today. */
export function markBonusPrompted(progress: Progress, now: Date): Progress {
  const date = localDate(now);
  if (!earnedBonusOn(progress, date) || bonusDay(progress, date)?.promptedAt) return progress;
  return writeDay(progress, date, (d) => ({ ...d, promptedAt: now.toISOString() }));
}

/** This device's running totals for the day's game. */
export interface BonusCheckpoint extends BonusStats {
  /** Stable id of the device (see features/bonus/ledger.deviceId). */
  device: string;
  /** Play time on this device today. */
  usedMs: number;
  finished?: boolean;
}

const clean = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/**
 * Saves the state of a running game for its day. Values can only grow (see mergeBonusDay), so an
 * old or replayed checkpoint never gives time back. Ignored when that day did not earn a bonus.
 */
export function recordBonus(progress: Progress, date: string, cp: BonusCheckpoint, now: Date): Progress {
  if (!earnedBonusOn(progress, date) || !cp.device) return progress;
  const at = now.toISOString();
  const part: BonusPart = {
    usedMs: Math.min(BONUS_ALLOWANCE_MS, clean(cp.usedMs)),
    score: clean(cp.score),
    correct: clean(cp.correct),
    answered: clean(cp.answered),
    coins: clean(cp.coins),
    bestStreak: clean(cp.bestStreak),
  };
  const next = writeDay(progress, date, (d) => ({
    ...d,
    promptedAt: d.promptedAt ?? at,
    startedAt: d.startedAt ?? at,
    parts: { ...(d.parts ?? {}), [cp.device]: part },
  }));
  const day = bonusDay(next, date) as BonusDay;
  if (day.finishedAt || !(cp.finished || day.usedMs >= BONUS_ALLOWANCE_MS)) return next;
  return { ...next, bonusDays: { ...next.bonusDays, [date]: { ...day, finishedAt: at } } };
}
