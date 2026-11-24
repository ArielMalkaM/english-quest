/**
 * Little Explorers: first English words for a 4-year-old. Everything is a big
 * picture and a spoken word — no reading or typing needed. Emoji are limited to
 * ones that render on Windows 10 (Unicode 12 and older).
 */

export interface LittleWord {
  id: string;
  en: string;
  he: string;
  emoji: string;
  /** Numbers: how many times the picture is shown. */
  count?: number;
}

export interface LittleTopic {
  id: string;
  en: string;
  he: string;
  emoji: string;
  /** Tile colour. */
  color: string;
  /** How the game asks for a word: "Find the dog!" or "Find red!". */
  ask: 'the' | 'bare';
  words: LittleWord[];
}

const w = (topic: string, en: string, he: string, emoji: string, count?: number): LittleWord => ({
  id: `${topic}-${en.replace(/\s+/g, '-')}`,
  en,
  he,
  emoji,
  ...(count ? { count } : {}),
});

export const LITTLE_TOPICS: LittleTopic[] = [
  {
    id: 'animals',
    en: 'Animals',
    he: 'חיות',
    emoji: '🐶',
    color: '#ffd166',
    ask: 'the',
    words: [
      w('animals', 'dog', 'כלב', '🐶'),
      w('animals', 'cat', 'חתול', '🐱'),
      w('animals', 'cow', 'פרה', '🐮'),
      w('animals', 'duck', 'ברווז', '🦆'),
      w('animals', 'fish', 'דג', '🐟'),
      w('animals', 'lion', 'אריה', '🦁'),
      w('animals', 'horse', 'סוס', '🐴'),
      w('animals', 'bird', 'ציפור', '🐦'),
    ],
  },
  {
    id: 'colors',
    en: 'Colors',
    he: 'צבעים',
    emoji: '🌈',
    color: '#ff9fb2',
    ask: 'bare',
    words: [
      w('colors', 'red', 'אדום', '🔴'),
      w('colors', 'blue', 'כחול', '🔵'),
      w('colors', 'yellow', 'צהוב', '🟡'),
      w('colors', 'green', 'ירוק', '🟢'),
      w('colors', 'purple', 'סגול', '🟣'),
      w('colors', 'brown', 'חום', '🟤'),
    ],
  },
  {
    id: 'fruit',
    en: 'Fruit',
    he: 'פירות',
    emoji: '🍎',
    color: '#9be15d',
    ask: 'the',
    words: [
      w('fruit', 'apple', 'תפוח', '🍎'),
      w('fruit', 'banana', 'בננה', '🍌'),
      w('fruit', 'grapes', 'ענבים', '🍇'),
      w('fruit', 'orange', 'תפוז', '🍊'),
      w('fruit', 'strawberry', 'תות', '🍓'),
      w('fruit', 'watermelon', 'אבטיח', '🍉'),
    ],
  },
  {
    id: 'numbers',
    en: 'Numbers',
    he: 'מספרים',
    emoji: '⭐',
    color: '#8fd3ff',
    ask: 'bare',
    words: [
      w('numbers', 'one', 'אחת', '⭐', 1),
      w('numbers', 'two', 'שתיים', '⭐', 2),
      w('numbers', 'three', 'שלוש', '⭐', 3),
      w('numbers', 'four', 'ארבע', '⭐', 4),
      w('numbers', 'five', 'חמש', '⭐', 5),
    ],
  },
  {
    id: 'body',
    en: 'My Body',
    he: 'הגוף שלי',
    emoji: '🙂',
    color: '#ffb37a',
    ask: 'the',
    words: [
      w('body', 'eyes', 'עיניים', '👀'),
      w('body', 'nose', 'אף', '👃'),
      w('body', 'ear', 'אוזן', '👂'),
      w('body', 'mouth', 'פה', '👄'),
      w('body', 'hand', 'יד', '✋'),
      w('body', 'foot', 'כף רגל', '🦶'),
    ],
  },
  {
    id: 'family',
    en: 'Family',
    he: 'משפחה',
    emoji: '🏠',
    color: '#c9b6ff',
    ask: 'bare',
    words: [
      w('family', 'mommy', 'אמא', '👩'),
      w('family', 'daddy', 'אבא', '👨'),
      w('family', 'baby', 'תינוק', '👶'),
      w('family', 'grandma', 'סבתא', '👵'),
      w('family', 'grandpa', 'סבא', '👴'),
      w('family', 'sister', 'אחות', '👧'),
      w('family', 'brother', 'אח', '👦'),
    ],
  },
  {
    id: 'toys',
    en: 'Toys',
    he: 'צעצועים',
    emoji: '🧸',
    color: '#7fe0d4',
    ask: 'the',
    words: [
      w('toys', 'ball', 'כדור', '⚽'),
      w('toys', 'car', 'מכונית', '🚗'),
      w('toys', 'teddy bear', 'דובי', '🧸'),
      w('toys', 'balloon', 'בלון', '🎈'),
      w('toys', 'train', 'רכבת', '🚂'),
      w('toys', 'book', 'ספר', '📖'),
    ],
  },
];

export function findTopic(id: string): LittleTopic | undefined {
  return LITTLE_TOPICS.find((t) => t.id === id);
}

/** What the game says out loud, e.g. "Find the dog!" or "Find red!". */
export function askFor(topic: LittleTopic, word: LittleWord): string {
  return topic.ask === 'the' ? `Find the ${word.en}!` : `Find ${word.en}!`;
}
