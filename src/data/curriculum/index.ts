import type { Grade, Lesson, WeeklyPlan, Word } from '../../domain/types';
import { GRADES } from '../../domain/types';
import { grade2 } from './grades/grade2';
import { grade3 } from './grades/grade3';
import { grade4 } from './grades/grade4';
import { grade5 } from './grades/grade5';
import { week1 } from './week1';
import { week2 } from './week2';
import { week3 } from './week3';
import { week4 } from './week4';
import { week5 } from './week5';
import { week6 } from './week6';
import { week7 } from './week7';

/**
 * Each grade has its own six-week plan. Grade 6 keeps the original lesson ids (w1d1…), so saved progress stays valid.
 * Grade 6 also has a bonus test-prep week (week 7) whose quests are all open from the start.
 */
export const CURRICULA: Record<Grade, WeeklyPlan[]> = {
  2: grade2,
  3: grade3,
  4: grade4,
  5: grade5,
  6: [week1, week2, week3, week4, week5, week6, week7].map((w) => ({ ...w, grade: 6 as const })),
};

export function weeksFor(grade: Grade): WeeklyPlan[] {
  return CURRICULA[grade] ?? CURRICULA[6];
}

const ORDER = new Map<Grade, string[]>(GRADES.map((g) => [g, weeksFor(g).flatMap((w) => w.lessons.map((l) => l.id))]));

/** Every quest of a grade in playing order. */
export function lessonOrder(grade: Grade): string[] {
  return ORDER.get(grade) ?? (ORDER.get(6) as string[]);
}

/** Grade 6 plan (the original six weeks). */
export const WEEKS: WeeklyPlan[] = CURRICULA[6];
export const LESSON_ORDER: string[] = lessonOrder(6);

const ALL_WEEKS = GRADES.flatMap((g) => CURRICULA[g]);

/** Lesson ids are unique across grades, so lookups search every plan. */
export function findLesson(lessonId: string): { week: WeeklyPlan; lesson: Lesson; index: number } | null {
  for (const week of ALL_WEEKS) {
    const index = week.lessons.findIndex((l) => l.id === lessonId);
    if (index >= 0) return { week, lesson: week.lessons[index], index };
  }
  return null;
}

const WORD_INDEX = new Map<string, Word>(ALL_WEEKS.flatMap((w) => w.words.map((word) => [word.id, word] as const)));

export function findWord(id: string): Word | undefined {
  return WORD_INDEX.get(id);
}

export function weekOfWord(id: string): WeeklyPlan | undefined {
  return ALL_WEEKS.find((w) => w.words.some((word) => word.id === id));
}

/** Where each grade sits in the Israeli Ministry of Education English curriculum. */
export const GRADE_INFO: Record<Grade, { he: string; letter: string; stage: string; stageHe: string; focus: string; focusHe: string }> = {
  2: {
    he: 'כיתה ב׳',
    letter: 'ב׳',
    stage: 'Pre-Foundation (oral English for young learners)',
    stageHe: 'טרום-יסוד: אנגלית בעל-פה לגיל הצעיר',
    focus: 'Listening and speaking: recognising words and chunks, repeating and responding. No independent reading or writing.',
    focusHe: 'הקשבה ודיבור: זיהוי מילים וצירופים, חזרה ותגובה. בלי דרישה לקרוא או לכתוב לבד.',
  },
  3: {
    he: 'כיתה ג׳',
    letter: 'ג׳',
    stage: 'Foundation Level – beginning literacy',
    stageHe: 'רמת יסוד – ראשית קרוא וכתוב',
    focus: 'Letters and sounds, decoding short words, sight words, copying and completing words, patterned sentences.',
    focusHe: 'אותיות וצלילים, פענוח מילים קצרות, מילים מוכרות, העתקה והשלמה של מילים, משפטים בתבנית קבועה.',
  },
  4: {
    he: 'כיתה ד׳',
    letter: 'ד׳',
    stage: 'Foundation Level – completing literacy',
    stageHe: 'רמת יסוד – השלמת קרוא וכתוב',
    focus: 'Digraphs and “magic e”, reading short connected texts, building and writing simple sentences.',
    focusHe: 'צירופי אותיות (sh, ch) ו-e קסומה, קריאת טקסטים קצרים, בנייה וכתיבה של משפטים פשוטים.',
  },
  5: {
    he: 'כיתה ה׳',
    letter: 'ה׳',
    stage: 'Band I – first year (pre-A1 → A1)',
    stageHe: 'Band I – שנה ראשונה (pre-A1 → A1)',
    focus: 'Social interaction, information from short texts, short written presentation; present simple, present continuous, there is/are, was/were.',
    focusHe: 'אינטראקציה חברתית, הבנת מידע מטקסטים קצרים, הצגה בכתב; הווה פשוט וממושך, there is/are, was/were.',
  },
  6: {
    he: 'כיתה ו׳',
    letter: 'ו׳',
    stage: 'Band I – end of elementary benchmark (CEFR A1)',
    stageHe: 'Band I – רף סוף בית הספר היסודי (CEFR A1)',
    focus: 'Band I vocabulary, past simple, future forms, comparatives; reading short texts for information and writing ~30-word paragraphs.',
    focusHe: 'אוצר מילים של Band I, עבר פשוט, עתיד, השוואות; קריאת טקסטים קצרים וכתיבת פסקה של כ-30 מילים.',
  },
};

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
  // Grades 2–5
  'chunk-it-is': { en: 'Chunks: Hello! It is red.', he: 'צירופים: Hello! It is red.' },
  'chunk-i-have': { en: 'Chunks: I have… / How many?', he: 'צירופים: I have… / How many?' },
  'chunk-it-can': { en: 'Chunks: It is big. It can jump.', he: 'צירופים: It is big. It can jump.' },
  'chunk-this-is': { en: 'Chunks: This is my…', he: 'צירופים: This is my…' },
  'chunk-commands': { en: 'Chunks: classroom commands', he: 'צירופים: הוראות' },
  'chunk-i-like': { en: 'Chunks: I like / I don’t like', he: 'צירופים: I like / I don’t like' },
  'a-an': { en: 'a / an, This is…', he: 'a / an ו-This is…' },
  'phonics-cvc': { en: 'Phonics: short vowel words (CVC)', he: 'צלילים: מילים קצרות עם תנועה קצרה' },
  'have-has': { en: 'have / has', he: 'have / has' },
  like: { en: 'I like / Do you like…?', he: 'I like / Do you like…?' },
  'days-time': { en: 'Days of the week, on + day', he: 'ימי השבוע ו-on' },
  digraphs: { en: 'Phonics: sh / ch', he: 'צלילים: sh / ch' },
  'magic-e': { en: 'Phonics: magic e', he: 'צלילים: e קסומה' },
  'prep-place': { en: 'Prepositions of place + there is/are', he: 'מילות מקום + there is/are' },
  'like-ing': { en: 'like / love / hate + -ing', he: 'like / love / hate + ing' },
  'some-any-basic': { en: 'some / any', he: 'some / any' },
  // Grade 6 test-prep week
  'question-words': { en: 'Question words', he: 'מילות שאלה' },
  capitals: { en: 'Capital letters', he: 'אותיות גדולות' },
  'to-be': { en: 'To be: am, is, are', he: 'הפועל to be: am, is, are' },
  'to-be-negative': { en: 'To be: negatives and short forms', he: 'to be: שלילה וקיצורים' },
  'test-mix': { en: 'Test review mix', he: 'חזרה מעורבת למבחן' },
};
