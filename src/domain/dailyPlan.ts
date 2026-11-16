import { findLesson, findWord } from '../data/curriculum';
import { dueReviews, nextFormat } from './review';
import type {
  Activity,
  BridgeActivity,
  ListenActivity,
  MatchActivity,
  Progress,
  ReviewItem,
  SpeedActivity,
  SpellActivity,
  StepId,
  WeeklyPlan,
  Word,
} from './types';

/** Rough minutes per step, shown on the quest screen. */
export const STEP_MINUTES: Record<StepId, number> = { warmup: 2, learn: 5, mission: 5, create: 4, bonus: 2 };

function blankExample(w: Word): string {
  const i = w.example.toLowerCase().indexOf(w.en.toLowerCase());
  if (i < 0) return `___ = ${w.he}`;
  return `${w.example.slice(0, i)}___${w.example.slice(i + w.en.length)}`;
}

function matchGame(id: string, words: Word[], withEmoji: boolean): MatchActivity {
  return {
    id,
    type: 'match',
    skill: 'vocabulary',
    title: 'Word Match',
    titleHe: 'התאמת מילים',
    how: 'Tap an English card, then its partner.',
    howHe: 'הקישו על כרטיס באנגלית ואז על בן הזוג שלו.',
    pairs: words.map((w) => ({ a: w.en, b: withEmoji ? `${w.emoji} ${w.he}` : w.he, wordId: w.id })),
  };
}

function listenGame(id: string, words: Word[], pool: Word[]): ListenActivity {
  return {
    id,
    type: 'listen',
    skill: 'vocabulary',
    title: 'Echo Pictures',
    titleHe: 'תמונות מהדהדות',
    how: 'Listen to the word and choose its picture.',
    howHe: 'הקשיבו למילה ובחרו את התמונה שלה.',
    items: words.map((w, i) => {
      const others = pool.filter((p) => p.id !== w.id);
      const distractors = [others[i % others.length], others[(i + 3) % others.length]].filter(
        (d, n, arr) => arr.indexOf(d) === n,
      );
      const options = [...distractors];
      options.splice(i % (distractors.length + 1), 0, w);
      return {
        say: w.en,
        question: 'Which picture matches the word?',
        options: options.map((o) => ({ label: o.he, emoji: o.emoji })),
        answer: options.indexOf(w),
        wordId: w.id,
      };
    }),
  };
}

function spellGame(id: string, words: Word[]): SpellActivity {
  return {
    id,
    type: 'spell',
    skill: 'vocabulary',
    title: 'Spell to Unlock',
    titleHe: 'מאייתים ופותחים',
    how: 'Type the missing word. Tap 🔊 to hear it.',
    howHe: 'הקלידו את המילה החסרה. הקישו 🔊 כדי לשמוע אותה.',
    items: words.map((w) => ({ answer: w.en, clue: blankExample(w), emoji: w.emoji, he: w.he, say: w.en, wordId: w.id })),
  };
}

function longestWord(sentence: string): string {
  return sentence
    .split(/\s+/)
    .map((t) => t.replace(/[^A-Za-z’']/g, ''))
    .reduce((best, t) => (t.length > best.length ? t : best), '');
}

/** Turns due review items into short games — always in a different format than last time. */
export function buildReviewActivities(due: ReviewItem[], week: WeeklyPlan): Activity[] {
  const out: Activity[] = [];
  // Grade 2 is oral only: a word that would come back as spelling comes back as listening.
  const formatOf = (d: ReviewItem) => {
    const f = nextFormat('word', d.lastFormat);
    return week.grade === 2 && f === 'spell' ? 'listen' : f;
  };
  const byFormat = (format: string) =>
    due.filter((d) => d.kind === 'word' && formatOf(d) === format)
      .map((d) => findWord(d.wordId ?? ''))
      .filter((w): w is Word => Boolean(w));

  const matchWords = byFormat('match');
  if (matchWords.length > 0) {
    const pad = week.words.filter((w) => !matchWords.includes(w)).slice(0, Math.max(0, 3 - matchWords.length));
    out.push({ ...matchGame('review-match', [...matchWords, ...pad], true), title: 'Comeback Match', titleHe: 'התאמה חוזרת' });
  }
  const spellWords = byFormat('spell');
  if (spellWords.length > 0) out.push({ ...spellGame('review-spell', spellWords), title: 'Comeback Spell', titleHe: 'איות חוזר' });
  const listenWords = byFormat('listen');
  if (listenWords.length > 0) {
    out.push({ ...listenGame('review-listen', listenWords, [...new Set([...listenWords, ...week.words])]), title: 'Comeback Echo', titleHe: 'הד חוזר' });
  }

  const sentences = due.filter((d) => d.kind === 'sentence' && d.sentence);
  const bridges = sentences.filter((d) => nextFormat('sentence', d.lastFormat) === 'bridge');
  if (bridges.length > 0) {
    const a: BridgeActivity = {
      id: 'review-bridge',
      type: 'bridge',
      skill: 'grammar',
      title: 'Comeback Bridge',
      titleHe: 'גשר חוזר',
      how: 'You met these sentences before. Rebuild them!',
      howHe: 'כבר פגשתם את המשפטים האלה. בנו אותם מחדש!',
      items: bridges.map((d) => ({ sentence: d.sentence as string })),
    };
    out.push(a);
  }
  const gaps = sentences.filter((d) => nextFormat('sentence', d.lastFormat) === 'gap');
  if (gaps.length > 0) {
    const a: SpellActivity = {
      id: 'review-gap',
      type: 'spell',
      skill: 'grammar',
      title: 'Comeback Echo Gap',
      titleHe: 'משלימים לפי שמיעה',
      how: 'Listen to the sentence and type the missing word.',
      howHe: 'הקשיבו למשפט והקלידו את המילה החסרה.',
      items: gaps.map((d) => {
        const sentence = d.sentence as string;
        const answer = longestWord(sentence);
        return { answer, clue: sentence.replace(answer, '___'), say: sentence, sentence };
      }),
    };
    out.push(a);
  }
  return out;
}

/** Warm-up: this week's words in a rotating format, plus spaced-review "comeback" games. */
export function buildWarmup(week: WeeklyPlan, lessonIndex: number, progress: Progress): Activity[] {
  const half = lessonIndex % 2 === 0 ? week.words.slice(0, 6) : week.words.slice(6, 12);
  const words = lessonIndex === 4 ? week.words.filter((_, i) => i % 2 === 1) : half;
  const id = `${week.id}d${lessonIndex + 1}-warmup`;
  const main: Activity =
    lessonIndex === 0
      ? matchGame(id, words, true)
      : lessonIndex === 1 || lessonIndex === 4
        ? listenGame(id, words.slice(0, 5), week.words)
        : lessonIndex === 2
          ? week.grade === 2
            ? listenGame(id, words.slice(0, 5), week.words)
            : spellGame(id, words.slice(0, 5))
          : matchGame(id, words, false);
  const due = dueReviews(progress.reviewQueue, progress.sessions.length, 5);
  return [main, ...buildReviewActivities(due, week)];
}

function speedGame(id: string, week: WeeklyPlan, offset: number): SpeedActivity {
  const words = week.words;
  return {
    id,
    type: 'speed',
    skill: 'vocabulary',
    title: 'Sky Speed Round',
    titleHe: 'סיבוב מהיר בשמיים',
    how: 'How many can you get before the balloon lands? No rush – every answer counts.',
    howHe: 'כמה תספיקו לפני שהבלון נוחת? בלי לחץ – כל תשובה נחשבת.',
    seconds: 60,
    items: words.map((w, i) => {
      const d1 = words[(i + 2 + offset) % words.length];
      const d2 = words[(i + 5 + offset) % words.length];
      const options = [d1.en, d2.en];
      options.splice((i + offset) % 3, 0, w.en);
      return { prompt: `${w.emoji} ${w.he}`, options, answer: options.indexOf(w.en), wordId: w.id };
    }),
  };
}

/** Optional bonus: a different playful format each day (only listening and talking in grades 2–3). */
export function buildBonus(week: WeeklyPlan, lessonIndex: number): Activity {
  const id = `${week.id}d${lessonIndex + 1}-bonus`;
  const grade = week.grade ?? 6;
  if (grade === 2 && (lessonIndex === 0 || lessonIndex === 3)) {
    const words = week.words.slice(lessonIndex === 0 ? 0 : 6).slice(0, 6);
    return { ...listenGame(id, words, week.words), title: 'Sky Echo', titleHe: 'הד בשמיים' };
  }
  if (lessonIndex === 1 || lessonIndex === 4 || (grade <= 3 && lessonIndex === 2)) {
    return {
      id,
      type: 'speak',
      skill: 'speaking',
      title: `Talk to ${week.friend.name}`,
      titleHe: `מדברים עם ${week.friend.name}`,
      how: 'Listen, then say it out loud. No microphone? Just tap “I said it”.',
      howHe: 'הקשיבו ואז אמרו בקול. אין מיקרופון? פשוט הקישו "אמרתי".',
      guide: week.friend.emoji,
      phrases: week.phrases,
    };
  }
  if (lessonIndex === 2) {
    return {
      id,
      type: 'scene',
      skill: 'creative',
      title: 'Scene Maker',
      titleHe: 'יוצרים סצנה',
      how: 'Pick a scene and write two English sentences about it.',
      howHe: 'בחרו סצנה וכתבו עליה שני משפטים באנגלית.',
      scenes: week.scenes,
    };
  }
  return speedGame(id, week, lessonIndex);
}

/** The activities a child plays for one step of a quest. */
export function stepActivities(lessonId: string, step: StepId, progress: Progress): Activity[] {
  const found = findLesson(lessonId);
  if (!found) return [];
  const { week, lesson, index } = found;
  switch (step) {
    case 'warmup':
      return buildWarmup(week, index, progress);
    case 'learn':
      return [lesson.learn];
    case 'mission':
      return [lesson.mission];
    case 'create':
      return [lesson.create];
    case 'bonus':
      return [buildBonus(week, index)];
  }
}
