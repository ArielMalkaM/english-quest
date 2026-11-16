import type { Lesson, WeeklyPlan, Word } from '../../domain/types';
import { week1 } from './week1';
import { week2 } from './week2';
import { week3 } from './week3';
import { week4 } from './week4';
import { week5 } from './week5';
import { week6 } from './week6';

export const WEEKS: WeeklyPlan[] = [week1, week2, week3, week4, week5, week6];

/** Every quest in playing order. */
export const LESSON_ORDER: string[] = WEEKS.flatMap((w) => w.lessons.map((l) => l.id));

export function findLesson(lessonId: string): { week: WeeklyPlan; lesson: Lesson; index: number } | null {
  for (const week of WEEKS) {
    const index = week.lessons.findIndex((l) => l.id === lessonId);
    if (index >= 0) return { week, lesson: week.lessons[index], index };
  }
  return null;
}

const WORD_INDEX = new Map<string, Word>(WEEKS.flatMap((w) => w.words.map((word) => [word.id, word] as const)));

export function findWord(id: string): Word | undefined {
  return WORD_INDEX.get(id);
}

export function weekOfWord(id: string): WeeklyPlan | undefined {
  return WEEKS.find((w) => w.words.some((word) => word.id === id));
}

/** Suggested weekday for each quest of a week (Israeli school week). */
export const DAY_LABELS: { en: string; he: string }[] = [
  { en: 'Mon', he: 'יום ב׳' },
  { en: 'Tue', he: 'יום ג׳' },
  { en: 'Wed', he: 'יום ד׳' },
  { en: 'Thu', he: 'יום ה׳' },
  { en: 'Weekend', he: 'סופ״ש' },
];

export const GRAMMAR: Record<string, { en: string; he: string }> = {
  'present-simple': { en: 'Present simple', he: 'הווה פשוט' },
  frequency: { en: 'Frequency words', he: 'מילות תדירות' },
  'ps-negative': { en: 'Present simple: negatives', he: 'הווה פשוט: שלילה' },
  'ps-questions': { en: 'Present simple: questions', he: 'הווה פשוט: שאלות' },
  'there-is-are': { en: 'There is / there are', he: 'There is / there are' },
  articles: { en: 'Articles: a, an, the', he: 'a, an, the' },
  possessives: { en: 'Possessives', he: 'שייכות' },
  plurals: { en: 'Plurals', he: 'רבים' },
  'be-past': { en: 'Was / were', he: 'was / were' },
  'past-regular': { en: 'Past simple: -ed verbs', he: 'עבר פשוט: פעלים עם ed' },
  'past-irregular': { en: 'Past simple: irregular verbs', he: 'עבר פשוט: פעלים מיוחדים' },
  'past-neg-q': { en: 'Past simple: negatives and questions', he: 'עבר פשוט: שלילה ושאלות' },
  'present-continuous': { en: 'Present continuous', he: 'הווה ממושך' },
  'pc-neg-q': { en: 'Present continuous: negatives and questions', he: 'הווה ממושך: שלילה ושאלות' },
  'ps-vs-pc': { en: 'Habit or right now?', he: 'הרגל או עכשיו?' },
  'going-to': { en: 'Going to (plans)', he: 'going to (תוכניות)' },
  'prep-time': { en: 'Prepositions: in, on, at', he: 'מילות יחס: in, on, at' },
  will: { en: 'Will / won’t', he: 'will / won’t' },
  'some-any': { en: 'Some / any, imperatives, Let’s', he: 'some / any, הוראות ו-Let’s' },
  'future-mix': { en: 'Future plans + prepositions', he: 'עתיד ומילות יחס' },
  can: { en: 'Can / can’t', he: 'can / can’t' },
  comparatives: { en: 'Comparatives (-er than)', he: 'השוואה (er than)' },
  superlatives: { en: 'Superlatives (the -est)', he: 'הכי (the -est)' },
  connectors: { en: 'Connectors: and, but, or, because', he: 'מילות קישור' },
};
