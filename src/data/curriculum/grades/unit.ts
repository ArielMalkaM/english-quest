// Turns a compact "unit spec" into a full week of five quests, using the activity
// mix that fits each grade's stage in the Israeli MoE English curriculum:
//   grade 2  – oral/aural only (listen, match pictures, talk) – no reading or writing demands
//   grade 3  – Foundation Level: first letters & sounds, copying and completing words
//   grade 4  – Foundation Level: decoding, short texts, building sentences
//   grade 5  – Band I (pre-A1 → A1): grammar in context, reading, short paragraphs
// Grade 6 keeps its hand-written weeks (week1.ts … week6.ts).
import type {
  Activity,
  DialogueActivity,
  Grade,
  Lesson,
  ListenActivity,
  MatchActivity,
  SpeakActivity,
  SpellActivity,
  WeeklyPlan,
  Word,
} from '../../../domain/types';
import { bridge, build, choice, dialogue, lesson, q, reading, sort, tip, word, write } from '../build';

type WordSpec = [en: string, he: string, emoji: string, example: string];
type Gap = [prompt: string, options: string[], answer: number, why: string];
type Turn = [says: string, replies: string[]];
type Question = [question: string, hint: string, evidence: number, options?: string[], answer?: number];

export interface UnitSpec {
  n: number;
  theme: string;
  themeHe: string;
  emoji: string;
  focus: string;
  focusHe: string;
  /** Grammar / literacy tag (see GRAMMAR in curriculum/index.ts). */
  grammar: string;
  /** Short Hebrew explanation for the grammar tip card. */
  tipHe: string;
  friend: [name: string, emoji: string];
  finalMission: string;
  finalMissionHe: string;
  /** 12 words / chunks. The example sentence must contain the word. */
  words: WordSpec[];
  /** 6 short model sentences that use the week's focus. */
  sentences: string[];
  /** 3 dialogue turns: the first reply is the right one. */
  chat: Turn[];
  /** Grades 3–5: 6 grammar gaps (3 per grammar quest). */
  gaps?: Gap[];
  /** Grades 3–5: a sort game (phonics or grammar). */
  sort?: { buckets: string[]; items: [string, number][]; why: string; grammar?: string };
  /** Grades 3–5: a short text with questions; questions point to evidence lines. */
  story?: { title: string; emoji: string; genre: string; lines: string[]; qs: Question[] };
  /** Grades 3–5: everyday writing task and the boss writing task. */
  write?: { prompt: string; promptHe: string; starters: string[]; boss: string; bossHe: string; bossStarters: string[] };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const MIN_WORDS: Record<Grade, [daily: number, boss: number]> = { 2: [0, 0], 3: [3, 6], 4: [6, 12], 5: [10, 20], 6: [8, 25] };

function wordMatch(words: Word[], withHebrew: boolean): MatchActivity {
  return {
    id: '',
    type: 'match',
    skill: 'vocabulary',
    title: 'Picture Match',
    titleHe: 'התאמת תמונות',
    how: 'Tap an English word, then its picture. Tap 🔊 to hear it.',
    howHe: 'הקישו על מילה באנגלית ואז על התמונה שלה.',
    pairs: words.map((w) => ({ a: w.en, b: withHebrew ? `${w.emoji} ${w.he}` : w.emoji, wordId: w.id })),
  };
}

function pickOptions(target: Word, pool: Word[], i: number): Word[] {
  const others = pool.filter((p) => p.id !== target.id);
  const options = [others[i % others.length], others[(i + 4) % others.length]].filter((d, n, arr) => arr.indexOf(d) === n);
  options.splice(i % (options.length + 1), 0, target);
  return options;
}

function listenWords(words: Word[], pool: Word[]): ListenActivity {
  return {
    id: '',
    type: 'listen',
    skill: 'listening',
    title: 'Echo Pictures',
    titleHe: 'תמונות מהדהדות',
    how: 'Listen to the word and choose its picture. You can replay as many times as you like.',
    howHe: 'הקשיבו למילה ובחרו את התמונה שלה. אפשר להשמיע שוב כמה שרוצים.',
    items: words.map((w, i) => {
      const options = pickOptions(w, pool, i);
      return {
        say: w.en,
        question: 'Which picture is it?',
        options: options.map((o) => ({ label: o.he, emoji: o.emoji })),
        answer: options.indexOf(w),
        wordId: w.id,
      };
    }),
  };
}

function listenSentences(words: Word[], pool: Word[]): ListenActivity {
  return {
    id: '',
    type: 'listen',
    skill: 'listening',
    title: 'Island Radio',
    titleHe: 'רדיו האי',
    how: 'Listen to the sentence. What is it about? Choose the picture.',
    howHe: 'הקשיבו למשפט. על מה הוא מדבר? בחרו את התמונה.',
    items: words.map((w, i) => {
      const options = pickOptions(w, pool, i + 1);
      return {
        say: w.example,
        question: 'What did you hear about?',
        options: options.map((o) => ({ label: o.he, emoji: o.emoji })),
        answer: options.indexOf(w),
        wordId: w.id,
      };
    }),
  };
}

function speak(title: string, titleHe: string, guide: string, phrases: string[]): SpeakActivity {
  return {
    id: '',
    type: 'speak',
    skill: 'speaking',
    title,
    titleHe,
    how: 'Listen, then say it out loud. No microphone? Just tap “I said it”.',
    howHe: 'הקשיבו ואז אמרו בקול. אין מיקרופון? פשוט הקישו "אמרתי".',
    guide,
    phrases,
  };
}

/** Copy-and-complete spelling: the word is shown in the sentence blank with its picture and sound. */
function spellWords(words: Word[]): SpellActivity {
  return {
    id: '',
    type: 'spell',
    skill: 'writing',
    title: 'Word Builder',
    titleHe: 'בונים מילים',
    how: 'Listen, look at the picture and type the word.',
    howHe: 'הקשיבו, הסתכלו בתמונה והקלידו את המילה.',
    items: words.map((w) => {
      const i = w.example.toLowerCase().indexOf(w.en.toLowerCase());
      const clue = i < 0 ? `${w.emoji} ___` : `${w.example.slice(0, i)}___${w.example.slice(i + w.en.length)}`;
      return { answer: w.en, clue, emoji: w.emoji, he: w.he, say: w.en, wordId: w.id };
    }),
  };
}

function chat(spec: UnitSpec, title: string, titleHe: string, turns: Turn[]): DialogueActivity {
  return dialogue(title, titleHe, `${spec.emoji} ${spec.theme}`, spec.friend, turns);
}

export function unit(grade: Grade, spec: UnitSpec): WeeklyPlan {
  const id = `g${grade}w${spec.n}`;
  const words = spec.words.map(([en, he, emoji, example]) => word(`${id}-${slug(en)}`, en, he, emoji, example));
  const first = words.slice(0, 6);
  const second = words.slice(6, 12);
  const mixed = words.filter((_, i) => i % 2 === 1);
  const L = (d: number) => `${id}d${d}`;
  const t = tip(spec.tipHe, ...spec.sentences.slice(0, 3));
  const recapWords = (ws: Word[]) => `Words: ${ws.map((w) => w.en).join(', ')}`;
  const recapFocus = `${spec.focus}: ${spec.sentences[0]}`;
  const [daily, bossMin] = MIN_WORDS[grade];

  let lessons: Lesson[];
  if (grade === 2) {
    // Oral/aural: listen, recognise, repeat, respond. Nothing to read or write on your own.
    lessons = [
      lesson(L(1), `Hello, ${spec.theme}!`, `שלום, ${spec.themeHe}!`, {
        learn: listenWords(first, words),
        tip: t,
        mission: wordMatch(first, true),
        create: speak('Say the Words', 'אומרים את המילים', spec.friend[1], first.map((w) => w.en)),
        recap: [recapWords(first)],
      }),
      lesson(L(2), 'More Words', 'עוד מילים', {
        learn: listenWords(second, words),
        tip: t,
        mission: wordMatch(second, true),
        create: speak('Say the Words', 'אומרים את המילים', spec.friend[1], second.map((w) => w.en)),
        recap: [recapWords(second)],
      }),
      lesson(L(3), 'Listen and Talk', 'מקשיבים ומדברים', {
        learn: listenSentences(first.slice(0, 5), words),
        tip: t,
        mission: chat(spec, `Chat with ${spec.friend[0]}`, `שיחה עם ${spec.friend[0]}`, spec.chat),
        create: speak('Say It Like Me', 'אומרים כמוני', spec.friend[1], spec.sentences.slice(0, 3)),
        recap: [recapFocus],
      }),
      lesson(L(4), 'Island Radio', 'רדיו האי', {
        learn: wordMatch(mixed, false),
        tip: t,
        mission: listenSentences(second.slice(0, 5), words),
        create: speak('Say It Like Me', 'אומרים כמוני', spec.friend[1], spec.sentences.slice(3, 6)),
        recap: [recapFocus, recapWords(mixed)],
      }),
      lesson(L(5), `Boss Mission: ${spec.finalMission}`, `משימת בוס: ${spec.finalMissionHe}`, {
        boss: true,
        learn: listenWords(mixed, words),
        tip: t,
        mission: chat(spec, `Talk to ${spec.friend[0]}`, `מדברים עם ${spec.friend[0]}`, spec.chat),
        create: speak(spec.finalMission, spec.finalMissionHe, spec.friend[1], spec.sentences),
        recap: [recapWords(words), recapFocus],
      }),
    ];
  } else {
    const gaps = spec.gaps ?? [];
    const story = spec.story!;
    const w = spec.write!;
    const storyQs = story.qs.map(([text, hint, evidence, options, answer]) => q(text, hint, evidence, options, answer));
    const sentenceCreate: Activity =
      grade === 3
        ? bridge('Sentence Bridge', 'גשר המשפטים', spec.grammar, spec.sentences.slice(3, 6))
        : build(spec.finalMission, spec.finalMissionHe, `Build a message about ${spec.theme.toLowerCase()}.`, `בנו הודעה על ${spec.themeHe}.`, spec.sentences.slice(3, 6));
    lessons = [
      lesson(L(1), `Meet the Words`, 'פוגשים את המילים', {
        learn: wordMatch(first, true),
        tip: t,
        mission: listenWords(first.slice(0, 5), words),
        create: spellWords(first.slice(0, grade === 3 ? 4 : 5)),
        recap: [recapWords(first)],
      }),
      lesson(L(2), spec.focus, spec.focusHe, {
        learn: choice(spec.focus, spec.focusHe, spec.grammar, `${spec.friend[1]} ${spec.friend[0]} needs your help with ${spec.theme.toLowerCase()}!`, gaps.slice(0, 3)),
        tip: t,
        mission: reading('story', story.title, story.title, story.genre, story.title, story.emoji, story.lines, storyQs),
        create: write('My Turn to Write', 'תורי לכתוב', w.prompt, w.promptHe, daily, w.starters, first.map((x) => x.en)),
        recap: [recapFocus],
      }),
      lesson(L(3), 'Sort and Chat', 'ממיינים ומשוחחים', {
        learn: spec.sort
          ? sort('Sorting Crates', 'ארגזי המיון', spec.sort.grammar ?? spec.grammar, spec.sort.buckets, spec.sort.items, spec.sort.why)
          : bridge('Sentence Bridge', 'גשר המשפטים', spec.grammar, spec.sentences.slice(0, 3)),
        tip: t,
        mission: chat(spec, `Chat with ${spec.friend[0]}`, `שיחה עם ${spec.friend[0]}`, spec.chat),
        create: bridge('Sentence Bridge', 'גשר המשפטים', spec.grammar, spec.sentences.slice(0, 3)),
        recap: [recapFocus],
      }),
      lesson(L(4), 'More Words', 'עוד מילים', {
        learn: wordMatch(second, true),
        tip: t,
        mission: listenSentences(second.slice(0, 5), words),
        create: sentenceCreate,
        recap: [recapWords(second)],
      }),
      lesson(L(5), `Boss Mission: ${spec.finalMission}`, `משימת בוס: ${spec.finalMissionHe}`, {
        boss: true,
        learn: choice(spec.focus, spec.focusHe, spec.grammar, `Final check: ${spec.focus.toLowerCase()}.`, gaps.slice(3, 6)),
        tip: t,
        mission: reading('detective', `${story.title}: Detective`, `${story.title}: בלשים`, story.genre, story.title, story.emoji, story.lines, storyQs),
        create: write(spec.finalMission, spec.finalMissionHe, w.boss, w.bossHe, bossMin, w.bossStarters, words.map((x) => x.en), {
          maxWords: bossMin * 3,
          panels: [spec.emoji, ...first.slice(0, 3).map((x) => x.emoji)],
        }),
        recap: [recapWords(words), recapFocus],
      }),
    ];
  }

  return {
    id,
    grade,
    number: spec.n,
    theme: spec.theme,
    themeHe: spec.themeHe,
    emoji: spec.emoji,
    grammarFocus: spec.focus,
    grammarFocusHe: spec.focusHe,
    finalMission: spec.finalMission,
    finalMissionHe: spec.finalMissionHe,
    friend: { name: spec.friend[0], emoji: spec.friend[1] },
    words,
    phrases: spec.sentences.slice(0, 4),
    scenes: [
      { emoji: words[0].emoji, label: words[0].en, words: words.slice(0, 3).map((x) => x.en) },
      { emoji: words[4].emoji, label: words[4].en, words: words.slice(4, 7).map((x) => x.en) },
      { emoji: words[8].emoji, label: words[8].en, words: words.slice(8, 11).map((x) => x.en) },
    ],
    lessons,
  };
}
