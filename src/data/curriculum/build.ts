// Small authoring helpers so the weekly content files stay compact and readable.
import type {
  Activity,
  BridgeActivity,
  BuildActivity,
  ChoiceActivity,
  DialogueActivity,
  GrammarTip,
  Lesson,
  ListenActivity,
  MatchActivity,
  ReadingActivity,
  ReadingQuestion,
  SceneActivity,
  SortActivity,
  SpellActivity,
  Word,
  WriteActivity,
} from '../../domain/types';

export const word = (id: string, en: string, he: string, emoji: string, example: string): Word => ({
  id,
  en,
  he,
  emoji,
  example,
});

export function choice(
  title: string,
  titleHe: string,
  grammar: string,
  intro: string,
  items: [prompt: string, options: string[], answer: number, why: string][],
): ChoiceActivity {
  return {
    id: '',
    type: 'choice',
    skill: 'grammar',
    title,
    titleHe,
    grammar,
    intro,
    how: 'Choose the words that complete the story.',
    howHe: 'בחרו את המילים שמשלימות את הסיפור.',
    items: items.map(([prompt, options, answer, why]) => ({ prompt, options, answer, why })),
  };
}

export function bridge(title: string, titleHe: string, grammar: string, sentences: string[]): BridgeActivity {
  return {
    id: '',
    type: 'bridge',
    skill: 'grammar',
    title,
    titleHe,
    grammar,
    how: 'Put the word planks in order to repair the bridge.',
    howHe: 'סדרו את קרשי המילים כדי לתקן את הגשר.',
    items: sentences.map((sentence) => ({ sentence })),
  };
}

export function sort(
  title: string,
  titleHe: string,
  grammar: string,
  buckets: string[],
  items: [text: string, bucket: number][],
  why: string,
): SortActivity {
  return {
    id: '',
    type: 'sort',
    skill: 'grammar',
    title,
    titleHe,
    grammar,
    buckets,
    why,
    how: 'Sort every card into the right crate.',
    howHe: 'מיינו כל כרטיס לארגז הנכון.',
    items: items.map(([text, bucket]) => ({ text, bucket })),
  };
}

export function spell(
  title: string,
  titleHe: string,
  grammar: string,
  items: [answer: string, clue: string, he: string][],
): SpellActivity {
  return {
    id: '',
    type: 'spell',
    skill: 'grammar',
    title,
    titleHe,
    grammar,
    how: 'Type the missing word to unlock the gate.',
    howHe: 'הקלידו את המילה החסרה כדי לפתוח את השער.',
    items: items.map(([answer, clue, he]) => ({ answer, clue, he, sentence: clue.replace(/^.*→\s*/, '').replace('___', answer) })),
  };
}

export function match(title: string, titleHe: string, grammar: string, pairs: [string, string][]): MatchActivity {
  return {
    id: '',
    type: 'match',
    skill: 'grammar',
    title,
    titleHe,
    grammar,
    how: 'Tap two cards that belong together.',
    howHe: 'הקישו על שני כרטיסים ששייכים זה לזה.',
    pairs: pairs.map(([a, b]) => ({ a, b })),
  };
}

export const q = (text: string, hint: string, evidence: number, options?: string[], answer?: number): ReadingQuestion => ({
  q: text,
  hint,
  evidence,
  options,
  answer,
});

export function reading(
  mode: 'story' | 'detective',
  title: string,
  titleHe: string,
  genre: string,
  textTitle: string,
  emoji: string,
  lines: string[],
  questions: ReadingQuestion[],
): ReadingActivity {
  return {
    id: '',
    type: 'reading',
    skill: 'reading',
    mode,
    title,
    titleHe,
    genre,
    textTitle,
    emoji,
    lines,
    questions,
    how:
      mode === 'detective'
        ? 'Detective mode: answer, then tap the line that proves it.'
        : 'Read the text. Answer, or tap the sentence with the clue.',
    howHe:
      mode === 'detective'
        ? 'מצב בלש: ענו, ואז הקישו על השורה שמוכיחה את התשובה.'
        : 'קראו את הטקסט. ענו, או הקישו על המשפט עם הרמז.',
  };
}

type Opt = string | [label: string, emoji: string];

export function listen(
  title: string,
  titleHe: string,
  items: [say: string, question: string, options: Opt[], answer: number][],
): ListenActivity {
  return {
    id: '',
    type: 'listen',
    skill: 'listening',
    title,
    titleHe,
    how: 'Listen carefully, then choose. You can replay as many times as you like.',
    howHe: 'הקשיבו היטב ובחרו. אפשר להשמיע שוב כמה שרוצים.',
    items: items.map(([say, question, options, answer]) => ({
      say,
      question,
      answer,
      options: options.map((o) => (typeof o === 'string' ? { label: o } : { label: o[0], emoji: o[1] })),
    })),
  };
}

/** For each turn the FIRST reply is the right one; the game shuffles them. */
export function dialogue(
  title: string,
  titleHe: string,
  scene: string,
  partner: [name: string, emoji: string],
  turns: [says: string, replies: (string | [text: string, note: string])[]][],
): DialogueActivity {
  return {
    id: '',
    type: 'dialogue',
    skill: 'speaking',
    title,
    titleHe,
    scene,
    partner: { name: partner[0], emoji: partner[1] },
    how: 'Choose the best reply to keep the chat going.',
    howHe: 'בחרו את התשובה הכי מתאימה כדי להמשיך את השיחה.',
    turns: turns.map(([says, replies]) => ({
      says,
      options: replies.map((r, i) =>
        typeof r === 'string' ? { text: r, ok: i === 0 } : { text: r[0], ok: i === 0, note: r[1] },
      ),
    })),
  };
}

export function build(title: string, titleHe: string, goal: string, goalHe: string, lines: string[]): BuildActivity {
  return {
    id: '',
    type: 'build',
    skill: 'writing',
    title,
    titleHe,
    goal,
    goalHe,
    lines,
    how: 'Build each sentence from the word cards, then type your final message.',
    howHe: 'בנו כל משפט מכרטיסי המילים, ואז הקלידו את ההודעה הסופית.',
  };
}

export function write(
  title: string,
  titleHe: string,
  prompt: string,
  promptHe: string,
  minWords: number,
  starters: string[],
  wordBank: string[],
  extra: { maxWords?: number; panels?: string[] } = {},
): WriteActivity {
  return {
    id: '',
    type: 'write',
    skill: 'writing',
    title,
    titleHe,
    prompt,
    promptHe,
    minWords,
    starters,
    wordBank,
    ...extra,
    how: 'Write in English. Tap a starter or a word if you want help.',
    howHe: 'כתבו באנגלית. אפשר להקיש על פתיח או מילה לעזרה.',
  };
}

export function scene(title: string, titleHe: string, scenes: SceneActivity['scenes']): SceneActivity {
  return {
    id: '',
    type: 'scene',
    skill: 'writing',
    title,
    titleHe,
    scenes,
    how: 'Pick a scene and write two English sentences about it.',
    howHe: 'בחרו סצנה וכתבו עליה שני משפטים באנגלית.',
  };
}

export const tip = (he: string, ...examples: string[]): GrammarTip => ({ he, examples });

export function lesson(
  id: string,
  title: string,
  titleHe: string,
  parts: { learn: Activity; tip: GrammarTip; mission: Activity; create: Activity; recap: string[]; boss?: boolean },
): Lesson {
  return {
    id,
    title,
    titleHe,
    boss: parts.boss,
    tip: parts.tip,
    recap: parts.recap,
    learn: { ...parts.learn, id: `${id}-learn` },
    mission: { ...parts.mission, id: `${id}-mission` },
    create: { ...parts.create, id: `${id}-create` },
  };
}
