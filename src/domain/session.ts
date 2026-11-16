import { findLesson } from '../data/curriculum';
import { localDate } from './dates';
import { ZONE_BY_SKILL, computeStreak, evaluateBadges, isLessonComplete, isLessonUnlocked } from './progress';
import { scheduleReview } from './review';
import { STREAK_MILESTONES, TICKETS, grantTickets } from './tickets';
import { CORE_STEPS } from './types';
import type {
  ActivityAttempt,
  ActivityType,
  AppState,
  ItemResult,
  Progress,
  ReviewFormat,
  StepId,
  TicketReason,
} from './types';

export type AttemptInput = Omit<ActivityAttempt, 'id' | 'lessonId' | 'step' | 'finishedAt' | 'practice'>;

export interface StepOutcome {
  state: AppState;
  /** Tickets granted by this step (after multiplier / cap). */
  earned: number;
  breakdown: { reason: TicketReason; amount: number }[];
  sessionCompleted: boolean;
  newBadges: string[];
  streakMilestone: number | null;
  practice: boolean;
}

/** Longest time a single activity can add to "time spent" (guards against an idle tab). */
const MAX_ACTIVITY_SECONDS = 15 * 60;

function reviewFormatOf(type: ActivityType, item: ItemResult): ReviewFormat {
  if (item.wordId) {
    if (type === 'spell') return 'spell';
    if (type === 'listen') return 'listen';
    return 'match';
  }
  return type === 'bridge' ? 'bridge' : 'gap';
}

function applyResults(progress: Progress, attempt: AttemptInput): Progress {
  const wordStats = { ...progress.wordStats };
  const grammarStats = { ...progress.grammarStats };
  const skill = progress.skillStats[attempt.skill] ?? { seen: 0, correct: 0 };
  const skillTally = { ...skill };
  let reviewQueue = progress.reviewQueue;
  const sessionsCompleted = progress.sessions.length;

  for (const item of attempt.items) {
    skillTally.seen++;
    if (item.firstTry) skillTally.correct++;
    if (item.wordId) {
      const w = wordStats[item.wordId] ?? { seen: 0, correct: 0, streak: 0 };
      wordStats[item.wordId] = {
        seen: w.seen + 1,
        correct: w.correct + (item.firstTry ? 1 : 0),
        streak: item.firstTry ? w.streak + 1 : 0,
      };
    }
    if (item.grammar) {
      const g = grammarStats[item.grammar] ?? { seen: 0, correct: 0 };
      grammarStats[item.grammar] = { seen: g.seen + 1, correct: g.correct + (item.firstTry ? 1 : 0) };
    }
    reviewQueue = scheduleReview(reviewQueue, item, reviewFormatOf(attempt.activityType, item), sessionsCompleted);
  }

  return {
    ...progress,
    wordStats,
    grammarStats,
    reviewQueue,
    skillStats: { ...progress.skillStats, [attempt.skill]: skillTally },
  };
}

/**
 * Records one finished step of a daily quest (a step may contain several short
 * activities) and awards Quest Tickets. Wrong answers never cost tickets, and speed
 * is never rewarded. Replaying a finished step is "practice": it updates learning
 * stats but grants nothing, so tickets cannot be farmed.
 */
export function completeStep(
  state: AppState,
  lessonId: string,
  step: StepId,
  attempts: AttemptInput[],
  now: Date,
): StepOutcome {
  const found = findLesson(lessonId);
  if (!found) throw new Error(`Unknown lesson ${lessonId}`);
  if (!isLessonUnlocked(state.progress, lessonId)) throw new Error('This quest is not open yet');
  const { lesson } = found;

  const doneBefore = state.progress.steps[lessonId] ?? [];
  const practice = doneBefore.includes(step);
  const wasComplete = isLessonComplete(state.progress, lessonId);
  const at = now.toISOString();

  let progress = state.progress;
  const recorded: ActivityAttempt[] = attempts.map((a, i) => ({
    ...a,
    seconds: Math.max(0, Math.min(MAX_ACTIVITY_SECONDS, Math.round(a.seconds))),
    id: `at-${progress.attempts.length + i + 1}`,
    lessonId,
    step,
    finishedAt: at,
    ...(practice ? { practice: true } : {}),
  }));
  for (const a of attempts) progress = applyResults(progress, a);
  progress = { ...progress, attempts: [...progress.attempts, ...recorded] };

  if (practice) {
    return { state: { ...state, progress }, earned: 0, breakdown: [], sessionCompleted: false, newBadges: [], streakMilestone: null, practice };
  }

  const zonePoints = { ...progress.zonePoints };
  for (const a of attempts) zonePoints[step === 'bonus' ? 'sky' : ZONE_BY_SKILL[a.skill]]++;
  progress = { ...progress, zonePoints, steps: { ...progress.steps, [lessonId]: [...doneBefore, step] } };

  let next: AppState = { ...state, progress };
  const breakdown: StepOutcome['breakdown'] = [];
  const grant = (base: number, reason: TicketReason, note: string) => {
    const r = grantTickets(next, base, reason, note, now, lessonId);
    next = r.state;
    if (r.granted > 0) breakdown.push({ reason, amount: r.granted });
  };

  grant(step === 'bonus' ? TICKETS.bonus : TICKETS.step, step === 'bonus' ? 'bonus' : 'step', `${lesson.title} · ${step}`);

  // Perseverance: tried again after a mistake and solved it (once per day).
  const today = localDate(now);
  const persevered = attempts.some((a) => a.items.some((i) => !i.firstTry && i.solved));
  if (persevered && !next.progress.tryAgainDays.includes(today)) {
    next = { ...next, progress: { ...next.progress, tryAgainDays: [...next.progress.tryAgainDays, today] } };
    grant(TICKETS.tryAgain, 'try-again', 'Tried again and got it');
  }

  let sessionCompleted = false;
  let streakMilestone: number | null = null;
  if (!wasComplete && isLessonComplete(next.progress, lessonId)) {
    sessionCompleted = true;
    const seconds = next.progress.attempts
      .filter((a) => a.lessonId === lessonId && !a.practice && CORE_STEPS.includes(a.step))
      .reduce((sum, a) => sum + a.seconds, 0);
    next = {
      ...next,
      progress: {
        ...next.progress,
        sessions: [...next.progress.sessions, { lessonId, completedAt: at, date: today, seconds }],
      },
    };
    grant(TICKETS.session, 'session', `${lesson.title} complete`);
    if (lesson.boss) grant(TICKETS.boss, 'boss', `Boss Mission: ${lesson.title}`);

    const streak = computeStreak(next.progress.sessions, now);
    if (STREAK_MILESTONES.includes(streak) && !next.progress.streakMilestones.includes(streak)) {
      streakMilestone = streak;
      next = { ...next, progress: { ...next.progress, streakMilestones: [...next.progress.streakMilestones, streak] } };
      grant(TICKETS.streak, 'streak', `${streak}-day streak`);
    }
  }

  const badges = evaluateBadges(next, now);
  return {
    state: badges.state,
    earned: breakdown.reduce((sum, b) => sum + b.amount, 0),
    breakdown,
    sessionCompleted,
    newBadges: badges.earned,
    streakMilestone,
    practice,
  };
}
