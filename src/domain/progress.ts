import { findLesson, lessonOrder, weeksFor } from '../data/curriculum';
import { addDays, isInWeekOf, localDate } from './dates';
import { earnedThisWeek } from './tickets';
import { CORE_STEPS } from './types';
import type { AppState, Grade, Progress, SessionRecord, Skill, Tally, ZoneId } from './types';

/** The learner's grade; profiles from before grades existed count as grade 6. */
export function gradeOf(state: Pick<AppState, 'profile'>): Grade {
  return state.profile?.grade ?? 6;
}

export const ZONE_BY_SKILL: Record<Skill, ZoneId> = {
  vocabulary: 'woods',
  grammar: 'lab',
  reading: 'harbor',
  listening: 'cave',
  speaking: 'cave',
  writing: 'market',
  creative: 'sky',
};

/**
 * Activities needed for each restoration level. Tuned so a zone only becomes fully
 * restored near the end of the six seeded weeks.
 */
export const ZONE_LEVELS: Record<ZoneId, number[]> = {
  woods: [1, 8, 20, 36],
  lab: [1, 6, 14, 24],
  harbor: [1, 4, 9, 15],
  cave: [1, 3, 7, 11],
  market: [1, 6, 14, 24],
  sky: [1, 4, 10, 18],
};
export const MAX_ZONE_LEVEL = 4;

export function zoneLevel(zone: ZoneId, points: number): number {
  return ZONE_LEVELS[zone].filter((t) => points >= t).length;
}

export function emptyProgress(): Progress {
  return {
    steps: {},
    sessions: [],
    attempts: [],
    wordStats: {},
    skillStats: {},
    grammarStats: {},
    reviewQueue: [],
    zonePoints: { woods: 0, lab: 0, harbor: 0, cave: 0, market: 0, sky: 0 },
    badges: [],
    tryAgainDays: [],
    streakMilestones: [],
  };
}

export function isLessonComplete(progress: Progress, lessonId: string): boolean {
  const done = progress.steps[lessonId] ?? [];
  return CORE_STEPS.every((s) => done.includes(s));
}

/** The next quest of the grade's plan, or null when every quest of that plan is finished. */
export function nextLessonId(progress: Progress, grade: Grade): string | null {
  return lessonOrder(grade).find((id) => !isLessonComplete(progress, id)) ?? null;
}

/** A quest opens once every quest before it in its own grade's plan is complete. */
export function isLessonUnlocked(progress: Progress, lessonId: string): boolean {
  const grade = findLesson(lessonId)?.week.grade ?? 6;
  const order = lessonOrder(grade);
  const next = nextLessonId(progress, grade);
  if (next === null) return order.includes(lessonId);
  return order.indexOf(lessonId) >= 0 && order.indexOf(lessonId) <= order.indexOf(next);
}

/** Consecutive days with a completed quest, counting today or (if none yet) yesterday. */
export function computeStreak(sessions: SessionRecord[], now: Date): number {
  const days = new Set(sessions.map((s) => s.date));
  let cursor = days.has(localDate(now)) ? now : addDays(now, -1);
  let streak = 0;
  while (days.has(localDate(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 0 = not met yet, 1 = met, 2 = growing, 3 = mastered. */
export function wordMastery(stat: (Tally & { streak: number }) | undefined): 0 | 1 | 2 | 3 {
  if (!stat || stat.seen === 0) return 0;
  if (stat.correct >= 4 && stat.streak >= 2) return 3;
  if (stat.correct >= 2) return 2;
  return 1;
}

export function masteredWordCount(progress: Progress): number {
  return Object.values(progress.wordStats).filter((s) => wordMastery(s) === 3).length;
}

function accuracy(t: Tally | undefined): number {
  return t && t.seen > 0 ? t.correct / t.seen : 0;
}

// ───────────────────────── Badges ─────────────────────────

export interface BadgeDef {
  id: string;
  emoji: string;
  title: string;
  titleHe: string;
  how: string;
  howHe: string;
  earned: (s: AppState, now: Date) => boolean;
}

const countAttempts = (s: AppState, pred: (a: AppState['progress']['attempts'][number]) => boolean) =>
  s.progress.attempts.filter((a) => !a.practice && pred(a)).length;

const COMMON_BADGES: BadgeDef[] = [
  { id: 'first-quest', emoji: '🧭', title: 'First Steps', titleHe: 'צעדים ראשונים', how: 'Finish your first quest', howHe: 'סיימו את המשימה הראשונה', earned: (s) => s.progress.sessions.length >= 1 },
  { id: 'five-quests', emoji: '🗺️', title: 'Trail Finder', titleHe: 'מגלי שבילים', how: 'Finish 5 quests', howHe: 'סיימו 5 משימות', earned: (s) => s.progress.sessions.length >= 5 },
  { id: 'fifteen-quests', emoji: '🏔️', title: 'Island Hero', titleHe: 'גיבורי האי', how: 'Finish 15 quests', howHe: 'סיימו 15 משימות', earned: (s) => s.progress.sessions.length >= 15 },
  { id: 'streak-3', emoji: '🔥', title: '3-Day Spark', titleHe: 'ניצוץ של 3 ימים', how: 'Play 3 days in a row', howHe: 'שחקו 3 ימים ברצף', earned: (s, now) => computeStreak(s.progress.sessions, now) >= 3 || s.progress.streakMilestones.includes(3) },
  { id: 'streak-7', emoji: '🌟', title: 'Week of Wonder', titleHe: 'שבוע של פלא', how: 'Play 7 days in a row', howHe: 'שחקו 7 ימים ברצף', earned: (s, now) => computeStreak(s.progress.sessions, now) >= 7 || s.progress.streakMilestones.includes(7) },
  { id: 'words-10', emoji: '🌳', title: 'Word Gardener', titleHe: 'גנן המילים', how: 'Master 10 words', howHe: 'שלטו ב-10 מילים', earned: (s) => masteredWordCount(s.progress) >= 10 },
  { id: 'words-30', emoji: '🦜', title: 'Word Wizard', titleHe: 'קוסם המילים', how: 'Master 30 words', howHe: 'שלטו ב-30 מילים', earned: (s) => masteredWordCount(s.progress) >= 30 },
  { id: 'writer', emoji: '✏️', title: 'Message Maker', titleHe: 'יוצר ההודעות', how: 'Finish 5 writing missions', howHe: 'סיימו 5 משימות כתיבה', earned: (s) => countAttempts(s, (a) => a.skill === 'writing') >= 5 },
  { id: 'listener', emoji: '🎧', title: 'Sharp Ears', titleHe: 'אוזניים חדות', how: 'Finish 5 listening missions', howHe: 'סיימו 5 משימות האזנה', earned: (s) => countAttempts(s, (a) => a.skill === 'listening') >= 5 },
  { id: 'bonus-3', emoji: '🎈', title: 'Sky Explorer', titleHe: 'חוקר השמיים', how: 'Finish 3 bonus missions', howHe: 'סיימו 3 משימות בונוס', earned: (s) => countAttempts(s, (a) => a.step === 'bonus') >= 3 },
  { id: 'comeback', emoji: '💪', title: 'Never Give Up', titleHe: 'לא מוותרים', how: 'Try again and solve it on 3 different days', howHe: 'נסו שוב והצליחו ב-3 ימים שונים', earned: (s) => s.progress.tryAgainDays.length >= 3 },
  { id: 'first-wish', emoji: '💌', title: 'Wish Sender', titleHe: 'שולח המשאלות', how: 'Send your first wish to a parent', howHe: 'שלחו משאלה ראשונה להורה', earned: (s) => s.requests.length >= 1 },
];

const BADGE_CACHE = new Map<Grade, BadgeDef[]>();

/** Common badges plus one "week champion" badge per week of the grade's plan. */
export function badgesFor(grade: Grade): BadgeDef[] {
  const cached = BADGE_CACHE.get(grade);
  if (cached) return cached;
  const list: BadgeDef[] = [
    ...COMMON_BADGES,
    ...weeksFor(grade).map(
    (w): BadgeDef => ({
      // Grade 6 keeps the original ids so badges already earned stay earned.
      id: grade === 6 ? `week-${w.number}` : `g${grade}-week-${w.number}`,
      emoji: w.emoji,
      title: `${w.theme} Champion`,
      titleHe: `אלופי "${w.themeHe}"`,
      how: `Finish the Boss Mission of week ${w.number}`,
      howHe: `סיימו את משימת הבוס של שבוע ${w.number}`,
      earned: (s) => isLessonComplete(s.progress, w.lessons[w.lessons.length - 1].id),
    }),
    ),
  ];
  BADGE_CACHE.set(grade, list);
  return list;
}

/** Badge lookup by id for any grade (week badges show the grade's own week title). */
export function findBadge(id: string, grade: Grade): BadgeDef | undefined {
  return badgesFor(grade).find((b) => b.id === id);
}

/** Adds any newly earned badges. Returns the new state and the ids just earned. */
export function evaluateBadges(state: AppState, now: Date): { state: AppState; earned: string[] } {
  const have = new Set(state.progress.badges.map((b) => b.id));
  const earned = badgesFor(gradeOf(state)).filter((b) => !have.has(b.id) && b.earned(state, now)).map((b) => b.id);
  if (earned.length === 0) return { state, earned };
  const at = now.toISOString();
  return {
    state: {
      ...state,
      progress: { ...state.progress, badges: [...state.progress.badges, ...earned.map((id) => ({ id, at }))] },
    },
    earned,
  };
}

// ───────────────────────── Weekly summary (parent + child review) ─────────────────────────

export interface WeeklySummary {
  minutes: number;
  daysCompleted: number;
  questsCompleted: number;
  ticketsEarned: number;
  skills: { skill: Skill; count: number; accuracy: number }[];
  strengths: Skill[];
  grammarPractised: string[];
  grammarToPractise: string[];
  wordsToRevisit: string[];
  writing: { at: string; text: string }[];
}

export function weeklySummary(state: AppState, now: Date): WeeklySummary {
  const { progress } = state;
  const attempts = progress.attempts.filter((a) => isInWeekOf(a.finishedAt, now));
  const sessions = progress.sessions.filter((s) => isInWeekOf(s.completedAt, now));

  const bySkill = new Map<Skill, Tally & { count: number }>();
  const grammar = new Map<string, Tally>();
  for (const a of attempts) {
    const t = bySkill.get(a.skill) ?? { seen: 0, correct: 0, count: 0 };
    t.count++;
    for (const item of a.items) {
      t.seen++;
      if (item.firstTry) t.correct++;
      if (item.grammar) {
        const g = grammar.get(item.grammar) ?? { seen: 0, correct: 0 };
        g.seen++;
        if (item.firstTry) g.correct++;
        grammar.set(item.grammar, g);
      }
    }
    bySkill.set(a.skill, t);
  }

  const skills = [...bySkill.entries()].map(([skill, t]) => ({
    skill,
    count: t.count,
    accuracy: t.seen > 0 ? t.correct / t.seen : 1,
  }));

  const weakWords = Object.entries(progress.wordStats)
    .filter(([, s]) => s.seen >= 2 && accuracy(s) < 0.6)
    .map(([id]) => id);
  const queued = progress.reviewQueue.filter((q) => q.kind === 'word' && q.wordId).map((q) => q.wordId as string);

  return {
    minutes: Math.round(attempts.reduce((sum, a) => sum + a.seconds, 0) / 60),
    daysCompleted: new Set(sessions.map((s) => s.date)).size,
    questsCompleted: sessions.length,
    ticketsEarned: earnedThisWeek(state.tickets, now),
    skills: skills.sort((a, b) => b.count - a.count),
    strengths: skills.filter((s) => s.accuracy >= 0.8 && s.count >= 1).map((s) => s.skill),
    grammarPractised: [...grammar.keys()],
    grammarToPractise: Object.entries(progress.grammarStats)
      .filter(([, t]) => t.seen >= 3 && accuracy(t) < 0.7)
      .map(([id]) => id),
    wordsToRevisit: [...new Set([...queued, ...weakWords])].slice(0, 12),
    writing: attempts
      .filter((a) => a.text)
      .map((a) => ({ at: a.finishedAt, text: a.text as string }))
      .slice(-5),
  };
}
