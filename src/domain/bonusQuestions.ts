// Questions for the Daily Bonus Adventure (English Gate Racer), built from the child's own plan:
// the words and grammar items of quests they have already reached, matched to their grade.
//
//   Grade 2 (oral)        hear / see an English word → drive through its picture
//   Grade 3               Hebrew + picture → English word, English word → picture
//   Grade 4               + complete a sentence with a word, simple grammar choices
//   Grades 5–6            mostly grammar choices from their quests, plus "choose the right reply"
import { findLesson, lessonOrder, weeksFor } from '../data/curriculum';
import { gradeOf, isLessonComplete, nextLessonId } from './progress';
import type { Activity, AppState, Grade, Lesson, Progress, WeeklyPlan, Word } from './types';

export type QuestionKind = 'listen-pick' | 'he-to-en' | 'en-to-pic' | 'gap' | 'grammar' | 'reply';

export interface GateOption {
  /** English text on the gate ('' for picture gates). */
  text: string;
  emoji?: string;
  /**
   * Hebrew word under a picture gate. Like the app's listening games (picture + Hebrew label), it
   * makes pictures of abstract words (days, school subjects…) unambiguous.
   */
  he?: string;
}

export interface GateQuestion {
  key: string;
  kind: QuestionKind;
  /** Short instruction above the question. */
  ask: { en: string; he: string };
  /** The question itself: English, or Hebrew for he-to-en. */
  prompt: string;
  promptLang: 'en' | 'he';
  promptEmoji?: string;
  /** Spoken (English) when the question appears. */
  say?: string;
  options: GateOption[];
  answer: number;
  /** Optional Hebrew explanation shown after a miss. */
  why?: string;
  wordId?: string;
}

/** Longest text that still fits on a gate on a phone. */
const MAX_GATE_TEXT = 24;
const MAX_REPLY_TEXT = 26;

const KIND_WEIGHTS: Record<Grade, Partial<Record<QuestionKind, number>>> = {
  2: { 'listen-pick': 1 },
  3: { 'he-to-en': 0.55, 'en-to-pic': 0.45 },
  4: { 'he-to-en': 0.35, 'en-to-pic': 0.15, gap: 0.25, grammar: 0.25 },
  5: { 'he-to-en': 0.25, gap: 0.25, grammar: 0.35, reply: 0.15 },
  6: { 'he-to-en': 0.2, gap: 0.25, grammar: 0.4, reply: 0.15 },
};

/** Seconds a gate takes to reach the car: younger children get more time to read and steer. */
export const GATE_SECONDS: Record<Grade, number> = { 2: 7.5, 3: 7, 4: 6.5, 5: 6.2, 6: 6 };

type Rng = () => number;

function shuffle<T>(list: T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Puts the answer among the distractors at a random position. */
function place<T>(answer: T, distractors: T[], rng: Rng): { options: T[]; answer: number } {
  const options = [...distractors];
  const at = Math.floor(rng() * (options.length + 1));
  options.splice(at, 0, answer);
  return { options, answer: at };
}

function activitiesOf(l: Lesson): Activity[] {
  return [l.learn, l.mission, l.create];
}

/** What the child has reached in their own grade's plan. */
function reached(progress: Progress, grade: Grade) {
  const order = lessonOrder(grade);
  const next = nextLessonId(progress, grade);
  const upTo = next === null ? order.length - 1 : order.indexOf(next);
  const lessonIds = order.slice(0, upTo + 1);
  // Open-now bonus weeks sit outside the main path: count their quests once they are done.
  for (const w of weeksFor(grade).filter((x) => x.openNow)) {
    for (const l of w.lessons) if (!lessonIds.includes(l.id) && isLessonComplete(progress, l.id)) lessonIds.push(l.id);
  }
  const completed = lessonIds.filter((id) => isLessonComplete(progress, id));
  const weeks: WeeklyPlan[] = [];
  for (const id of lessonIds) {
    const w = findLesson(id)?.week;
    if (w && !weeks.includes(w)) weeks.push(w);
  }
  // A child who switched grade may not have finished anything in the new plan yet: use its first week.
  if (weeks.length === 0) weeks.push(weeksFor(grade)[0]);
  const lessons = (completed.length > 0 ? completed : weeks[0].lessons.map((l) => l.id))
    .map((id) => findLesson(id)?.lesson)
    .filter((l): l is Lesson => Boolean(l));
  return { weeks, lessons, current: weeks[weeks.length - 1] };
}

interface WordPick {
  word: Word;
  week: WeeklyPlan;
}

/** At most this many "needs practice" words lead each round, so the game stays mostly fun. */
const MAX_REINFORCE = 4;

interface WordPool {
  /** Words the child often gets wrong: asked first (reinforcement). */
  weak: WordPick[];
  /** Everything else, this week's words listed twice so they tend to come earlier. */
  rest: WordPick[];
}

/** Familiar words only (already met in quests) once there are enough of them. */
function wordPool(progress: Progress, weeks: WeeklyPlan[], current: WeeklyPlan): WordPool {
  const all = weeks.flatMap((week) => week.words.map((word) => ({ word, week })));
  const met = all.filter((p) => (progress.wordStats[p.word.id]?.seen ?? 0) > 0);
  const base = met.length >= 6 ? met : all;
  const weak: WordPick[] = [];
  const rest: WordPick[] = [];
  for (const p of base) {
    const s = progress.wordStats[p.word.id];
    if (s && s.seen >= 2 && s.correct / s.seen < 0.6) {
      weak.push(p);
      continue;
    }
    rest.push(p);
    if (p.week === current) rest.push(p);
  }
  return { weak, rest };
}

/** One round of words: a few weak words first, then the rest in a weighted random order, no repeats. */
function wordRound(pool: WordPool, rng: Rng): WordPick[] {
  const weak = shuffle(pool.weak, rng);
  const order = [...weak.slice(0, MAX_REINFORCE), ...shuffle([...weak.slice(MAX_REINFORCE), ...pool.rest], rng)];
  const seen = new Set<string>();
  return order.filter((p) => !seen.has(p.word.id) && (seen.add(p.word.id), true));
}

/** Two distractor words: same week first, never the same English, Hebrew or picture as the answer. */
function distractorWords(target: Word, week: WeeklyPlan, weeks: WeeklyPlan[], rng: Rng, count = 2): Word[] {
  const pool = [...shuffle(week.words, rng), ...shuffle(weeks.flatMap((w) => w.words), rng)];
  const out: Word[] = [];
  for (const w of pool) {
    if (out.length >= count) break;
    const clash = [target, ...out].some((x) => x.id === w.id || x.en.toLowerCase() === w.en.toLowerCase() || x.he === w.he || x.emoji === w.emoji);
    if (!clash && w.en.length <= MAX_GATE_TEXT) out.push(w);
  }
  return out;
}

function blankExample(w: Word): string | null {
  const i = w.example.toLowerCase().indexOf(w.en.toLowerCase());
  if (i < 0 || w.example.length > 60) return null;
  return `${w.example.slice(0, i)}___${w.example.slice(i + w.en.length)}`;
}

function wordQuestion(kind: QuestionKind, pick: WordPick, weeks: WeeklyPlan[], rng: Rng): GateQuestion | null {
  const { word, week } = pick;
  const others = distractorWords(word, week, weeks, rng);
  if (others.length < 2) return null;
  const key = `${kind}:${word.id}`;
  switch (kind) {
    case 'listen-pick': {
      const { options, answer } = place(word, others, rng);
      return {
        key, kind, wordId: word.id, answer,
        ask: { en: 'Listen and find:', he: 'הקשיבו ומצאו:' },
        prompt: word.en, promptLang: 'en', say: word.en,
        options: options.map((o) => ({ text: '', emoji: o.emoji, he: o.he })),
      };
    }
    case 'en-to-pic': {
      const { options, answer } = place(word, others, rng);
      return {
        key, kind, wordId: word.id, answer,
        ask: { en: 'Drive to the picture of:', he: 'סעו לתמונה של:' },
        prompt: word.en, promptLang: 'en', say: word.en,
        options: options.map((o) => ({ text: '', emoji: o.emoji, he: o.he })),
      };
    }
    case 'he-to-en': {
      if (word.en.length > MAX_GATE_TEXT) return null;
      const { options, answer } = place(word, others, rng);
      return {
        key, kind, wordId: word.id, answer,
        ask: { en: 'What is the English word for…', he: 'איך אומרים באנגלית…' },
        prompt: word.he, promptLang: 'he', promptEmoji: word.emoji,
        options: options.map((o) => ({ text: o.en })),
      };
    }
    case 'gap': {
      const sentence = blankExample(word);
      if (!sentence || word.en.length > MAX_GATE_TEXT) return null;
      const { options, answer } = place(word, others, rng);
      return {
        key, kind, wordId: word.id, answer,
        ask: { en: 'Complete the sentence:', he: 'השלימו את המשפט:' },
        prompt: sentence, promptLang: 'en', promptEmoji: word.emoji,
        options: options.map((o) => ({ text: o.en })),
      };
    }
    default:
      return null;
  }
}

/** Grammar "fill the gap" items from the child's completed quests, trimmed to three short gates. */
function grammarQuestions(lessons: Lesson[], rng: Rng): GateQuestion[] {
  const out: GateQuestion[] = [];
  for (const l of lessons) {
    for (const a of activitiesOf(l)) {
      if (a.type !== 'choice') continue;
      a.items.forEach((item, i) => {
        const right = item.options[item.answer];
        if (!right || !item.prompt.includes('___')) return;
        const wrong = shuffle(item.options.filter((o, n) => n !== item.answer && o !== right), rng).slice(0, 2);
        if (wrong.length < 1 || [right, ...wrong].some((o) => o.length > MAX_GATE_TEXT)) return;
        const { options, answer } = place(right, wrong, rng);
        out.push({
          key: `grammar:${l.id}:${a.id || a.title}:${i}`,
          kind: 'grammar',
          ask: { en: 'Choose the missing word:', he: 'בחרו את המילה החסרה:' },
          prompt: item.prompt,
          promptLang: 'en',
          options: options.map((text) => ({ text })),
          answer,
          why: item.why,
        });
      });
    }
  }
  return out;
}

/** "Choose the right reply" turns from the child's completed chats. */
function replyQuestions(lessons: Lesson[], rng: Rng): GateQuestion[] {
  const out: GateQuestion[] = [];
  for (const l of lessons) {
    for (const a of activitiesOf(l)) {
      if (a.type !== 'dialogue') continue;
      a.turns.forEach((turn, i) => {
        const right = turn.options.filter((o) => o.ok);
        const wrong = turn.options.filter((o) => !o.ok);
        if (right.length !== 1 || wrong.length < 1) return;
        const picked = shuffle(wrong, rng).slice(0, 2);
        if ([right[0], ...picked].some((o) => o.text.length > MAX_REPLY_TEXT)) return;
        const { options, answer } = place(right[0].text, picked.map((o) => o.text), rng);
        out.push({
          key: `reply:${l.id}:${i}`,
          kind: 'reply',
          ask: { en: `${a.partner.emoji} ${a.partner.name} says:`, he: `${a.partner.emoji} ${a.partner.name} אומר/ת:` },
          prompt: turn.says,
          promptLang: 'en',
          say: turn.says,
          options: options.map((text) => ({ text })),
          answer,
        });
      });
    }
  }
  return out;
}

/** A question is valid when it has 2–3 distinct options and the answer points at one of them. */
export function isValidQuestion(q: GateQuestion): boolean {
  if (q.options.length < 2 || q.options.length > 3) return false;
  if (q.answer < 0 || q.answer >= q.options.length) return false;
  const labels = q.options.map((o) => `${o.text}|${o.emoji ?? ''}`);
  if (new Set(labels).size !== labels.length) return false;
  return q.options.every((o) => o.text.trim() !== '' || Boolean(o.emoji));
}

export interface QuestionDeck {
  grade: Grade;
  next(): GateQuestion;
}

/**
 * Endless stream of questions for one game, in rounds: every available question is asked once
 * before any comes back, and the same question never appears twice in a row. Within a round the
 * kinds are mixed by the grade's weights; word questions keep their order (weak words first).
 */
export function createQuestionDeck(state: Pick<AppState, 'profile' | 'progress'>, rng: Rng = Math.random): QuestionDeck {
  const grade = gradeOf(state);
  const { weeks, lessons, current } = reached(state.progress, grade);
  const pool = wordPool(state.progress, weeks, current);
  const weights = KIND_WEIGHTS[grade];

  const build = (kind: QuestionKind): GateQuestion[] => {
    if (kind === 'grammar') return shuffle(grammarQuestions(lessons, rng).filter(isValidQuestion), rng);
    if (kind === 'reply') return shuffle(replyQuestions(lessons, rng).filter(isValidQuestion), rng);
    return wordRound(pool, rng)
      .map((p) => wordQuestion(kind, p, weeks, rng))
      .filter((q): q is GateQuestion => q !== null && isValidQuestion(q));
  };

  const queues = new Map<QuestionKind, GateQuestion[]>();
  const fill = (k: QuestionKind) => queues.set(k, build(k));
  const wanted = Object.keys(weights) as QuestionKind[];
  wanted.forEach(fill);
  let kinds = wanted.filter((k) => (queues.get(k) ?? []).length > 0);
  if (kinds.length === 0) {
    // Always have something to ask: picture questions suit every reader.
    kinds = [grade === 2 ? 'listen-pick' : 'en-to-pic'];
    kinds.forEach(fill);
  }
  let last: GateQuestion | null = null;
  /** Same question, or the same word asked another way, right after itself. */
  const repeats = (q: GateQuestion) => last !== null && (q.key === last.key || (q.wordId !== undefined && q.wordId === last.wordId));

  const pickKind = (open: QuestionKind[]): QuestionKind => {
    const total = open.reduce((s, k) => s + (weights[k] ?? 1), 0);
    let r = rng() * total;
    for (const k of open) {
      r -= weights[k] ?? 1;
      if (r <= 0) return k;
    }
    return open[open.length - 1];
  };

  return {
    grade,
    next() {
      let open = kinds.filter((k) => (queues.get(k) ?? []).length > 0);
      if (open.length === 0) {
        kinds.forEach(fill); // new round
        open = kinds.filter((k) => (queues.get(k) ?? []).length > 0);
      }
      if (open.length > 0) {
        const queue = queues.get(pickKind(open)) as GateQuestion[];
        let q = queue.shift() as GateQuestion;
        if (repeats(q)) {
          // Swap with the first question (of any kind) that is not a repeat; at the end of a round
          // the only ones left may all be repeats, so then the next round is added behind them.
          const takeAlternative = (): GateQuestion | null => {
            for (const k of kinds) {
              const list = queues.get(k) as GateQuestion[];
              const i = list.findIndex((x) => !repeats(x));
              if (i >= 0) return list.splice(i, 1)[0];
            }
            return null;
          };
          let alt = takeAlternative();
          if (!alt) {
            for (const k of kinds) (queues.get(k) as GateQuestion[]).push(...build(k));
            alt = takeAlternative();
          }
          if (alt) {
            queue.unshift(q);
            q = alt;
          }
        }
        last = q;
        return q;
      }
      // Unreachable with any real plan; a safe question keeps the game going.
      const w = weeks[0].words;
      return { key: 'fallback', kind: 'en-to-pic', ask: { en: 'Drive to the picture of:', he: 'סעו לתמונה של:' }, prompt: w[0].en, promptLang: 'en', options: [{ text: '', emoji: w[0].emoji }, { text: '', emoji: w[1].emoji }], answer: 0 };
    },
  };
}
