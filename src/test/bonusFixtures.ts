// Shared test fixtures for the Daily Bonus Adventure tests.
import { findLesson, lessonOrder } from '../data/curriculum';
import { createInitialState, startProfile } from '../data/seed';
import { localDate } from '../domain/dates';
import type { AppState, Grade, Progress } from '../domain/types';
import { CORE_STEPS } from '../domain/types';

/** Monday 16 Nov 2026, 17:00 local time. */
export const NOW = new Date(2026, 10, 16, 17, 0, 0);
export const TODAY = localDate(NOW);
export const YESTERDAY = '2026-11-15';

export const STATS = { score: 30, correct: 3, answered: 4, coins: 20, bestStreak: 2 };

export function newChild(grade: Grade): AppState {
  return startProfile(
    createInitialState(),
    { name: 'Test', grade, avatar: { emoji: '🦊', color: '#2ec4b6', gear: '🧭' }, favoriteTheme: 'Animals', dailyGoalMinutes: 15, createdAt: NOW.toISOString() },
    null,
    NOW,
  );
}

/**
 * A child of `grade` who finished the first `completed` quests of their plan; the last one on
 * `lastDate`, the others the days before. With `metWords`, every word of the weeks they reached
 * has been seen once (correctly).
 */
export function childAfter(grade: Grade, completed = 1, opts: { lastDate?: string; metWords?: boolean } = {}): AppState {
  const s = newChild(grade);
  const ids = lessonOrder(grade).slice(0, completed);
  const steps: Progress['steps'] = {};
  for (const id of ids) steps[id] = [...CORE_STEPS];
  const sessions = ids.map((lessonId, i) => ({
    lessonId,
    completedAt: NOW.toISOString(),
    date: i === ids.length - 1 ? (opts.lastDate ?? TODAY) : `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
    seconds: 600,
  }));
  const wordStats: Progress['wordStats'] = {};
  if (opts.metWords) {
    for (const id of ids) for (const w of findLesson(id)?.week.words ?? []) wordStats[w.id] = { seen: 1, correct: 1, streak: 1 };
  }
  return { ...s, progress: { ...s.progress, steps, sessions, wordStats } };
}
