// Grade 6 bonus week: practice for the end-of-term English test (כיתה ו׳ – החומר למבחן).
// Covers the test sheet: word meanings and question words, the instruction sentences,
// capital letters, singular → plural, the verb "to be" (am / is / are, negatives, short forms),
// an unseen text and the "about me" writing task.
// It is "open now": every quest can be played straight away, outside the main path.
import type { MatchActivity, WeeklyPlan, Word } from '../../domain/types';
import { bridge, choice, lesson, match, q, reading, sort, spell, tip, word, write } from './build';

const words: Word[] = [
  // First six: question words (warm-ups of quests 1, 3 and 5 use these).
  word('w7-who', 'who', 'מי', '🙋', 'Who is your teacher?'),
  word('w7-what', 'what', 'מה', '❓', 'What is your name?'),
  word('w7-where', 'where', 'איפה', '🗺️', 'Where is my bag?'),
  word('w7-when', 'when', 'מתי', '⏰', 'When is your birthday?'),
  word('w7-which', 'which', 'איזה', '👉', 'Which colour do you like?'),
  word('w7-why', 'why', 'למה', '🤔', 'Why are you sad?'),
  // Next six (warm-ups of quests 2 and 4).
  word('w7-how', 'how', 'איך', '💬', 'How are you today?'),
  word('w7-how-much', 'how much', 'כמה (כסף / כמות)', '💰', 'How much is the bread?'),
  word('w7-how-many', 'how many', 'כמה (מספר)', '🔢', 'How many books do you have?'),
  word('w7-a-hundred', 'a hundred', 'מאה', '💯', 'There are a hundred children in my school.'),
  word('w7-shop', 'shop', 'חנות', '🏪', 'I buy bread at the shop.'),
  word('w7-kitchen', 'kitchen', 'מטבח', '🍳', 'Mum is in the kitchen.'),
  // The rest of the test word list.
  word('w7-build', 'build', 'לבנות', '🧱', 'We build a sandcastle.'),
  word('w7-bread', 'bread', 'לחם', '🍞', 'I eat bread in the morning.'),
  word('w7-summer', 'summer', 'קיץ', '☀️', 'It is hot in the summer.'),
  word('w7-week', 'week', 'שבוע', '📅', 'There are seven days in a week.'),
  word('w7-morning', 'morning', 'בוקר', '🌅', 'I go to school in the morning.'),
  word('w7-new', 'new', 'חדש', '✨', 'I have a new bike.'),
  word('w7-family', 'family', 'משפחה', '👪', 'My family is very big.'),
  word('w7-favourite', 'favourite', 'אהוב', '💖', 'My favourite colour is blue.'),
  word('w7-hobby', 'hobby', 'תחביב', '🎨', 'My hobby is drawing.'),
  word('w7-near', 'near', 'ליד', '📍', 'The shop is near my house.'),
  word('w7-teach', 'teach', 'ללמד', '👩‍🏫', 'I can teach you to swim.'),
  word('w7-town', 'town', 'עיר', '🏘️', 'I live in a small town.'),
  word('w7-math', 'math', 'מתמטיקה', '➗', 'I like math at school.'),
  word('w7-same', 'same', 'אותו (הדבר)', '👯', 'We are in the same class.'),
  word('w7-cooking', 'cooking', 'בישול', '🍲', 'My dad loves cooking.'),
];

const byEn = new Map(words.map((w) => [w.en, w]));

/** English word ↔ Hebrew meaning (the test asks for meanings only, not spelling). */
function meaningMatch(title: string, titleHe: string, list: string[]): MatchActivity {
  return {
    id: '',
    type: 'match',
    skill: 'vocabulary',
    title,
    titleHe,
    how: 'Tap an English word, then its Hebrew meaning.',
    howHe: 'הקישו על מילה באנגלית ואז על הפירוש שלה בעברית.',
    pairs: list.map((en) => {
      const w = byEn.get(en)!;
      return { a: w.en, b: `${w.emoji} ${w.he}`, wordId: w.id };
    }),
  };
}

export const week7: WeeklyPlan = {
  id: 'w7',
  number: 7,
  openNow: true,
  theme: 'Test Prep Quiz',
  themeHe: 'הכנה למבחן',
  emoji: '📝',
  grammarFocus: 'Test words, capital letters, plurals, am / is / are',
  grammarFocusHe: 'מילים למבחן, אותיות גדולות, רבים, am / is / are',
  finalMission: 'Pass the practice test',
  finalMissionHe: 'עוברים את מבחן התרגול',
  friend: { name: 'Quizzy', emoji: '🐙' },
  words,
  phrases: ['Answer the questions.', 'Learn the rules.', 'Learn how to spell the words.', 'Remember to use capital letters.', 'Add new words.'],
  scenes: [
    { emoji: '🍳', label: 'In the kitchen', words: ['kitchen', 'bread', 'cooking'] },
    { emoji: '🏘️', label: 'My town', words: ['town', 'shop', 'near'] },
    { emoji: '☀️', label: 'My summer', words: ['summer', 'family', 'hobby'] },
  ],
  lessons: [
    lesson('w7d1', 'Question Words and Test Words', 'מילות שאלה ומילים למבחן', {
      learn: meaningMatch('Question Word Match', 'התאמת מילות שאלה', ['who', 'what', 'where', 'when', 'which', 'why']),
      tip: tip(
        'מילות שאלה באות בתחילת השאלה: who = מי, what = מה, where = איפה, when = מתי, which = איזה, why = למה, how = איך. כמה? how much = כמה כסף / כמות, how many = כמה דברים שאפשר לספור.',
        'Who is your teacher?',
        'Where is the shop?',
        'How many books do you have?',
      ),
      mission: choice('Ask the Right Question', 'שואלים את השאלה הנכונה', 'question-words', 'Quizzy the octopus is asking questions. Which question word fits?', [
        ['___ is your name? – My name is Tal.', ['What', 'Where', 'When'], 0, 'שואלים על שם → What (מה).'],
        ['___ is the shop? – It is near my house.', ['Who', 'Where', 'Why'], 1, 'התשובה היא מקום → Where (איפה).'],
        ['___ is your birthday? – In the summer.', ['When', 'Which', 'Who'], 0, 'התשובה היא זמן → When (מתי).'],
        ['___ is your teacher? – Mrs. Cohen.', ['What', 'Who', 'How'], 1, 'התשובה היא אדם → Who (מי).'],
        ['___ are you sad? – Because my dog is sick.', ['Why', 'Where', 'Which'], 0, 'התשובה מתחילה ב-because → Why (למה).'],
        ['___ books do you have? – Ten books.', ['How much', 'How many', 'Which'], 1, 'סופרים ספרים (אפשר לספור) → How many.'],
        ['___ is the bread? – Five shekels.', ['How many', 'How much', 'Who'], 1, 'שואלים על מחיר (כסף) → How much.'],
        ['___ colour do you like, red or blue?', ['Which', 'Why', 'When'], 0, 'בוחרים מתוך כמה אפשרויות → Which (איזה).'],
      ]),
      create: {
        id: '',
        type: 'match',
        skill: 'reading',
        title: 'Test Instructions',
        titleHe: 'הוראות במבחן',
        how: 'Tap an English instruction, then its Hebrew meaning.',
        howHe: 'הקישו על הוראה באנגלית ואז על הפירוש שלה בעברית.',
        pairs: [
          { a: 'Answer the questions.', b: 'ענו על השאלות.' },
          { a: 'Learn the rules.', b: 'למדו את הכללים.' },
          { a: 'Learn how to spell the words.', b: 'למדו איך לאיית את המילים.' },
          { a: 'Remember to use capital letters.', b: 'זכרו להשתמש באותיות גדולות.' },
          { a: 'Add new words.', b: 'הוסיפו מילים חדשות.' },
          { a: 'Complete the sentences.', b: 'השלימו את המשפטים.' },
        ],
      },
      recap: ['Question words: who, what, where, when, which, why, how', 'how much (money) · how many (things you can count)', 'Test instructions: Answer the questions, Learn the rules…'],
    }),
    lesson('w7d2', 'Capital Letters', 'אותיות גדולות', {
      learn: sort('Capital or Small?', 'גדולה או קטנה?', 'capitals', ['Capital letter: Aa', 'small letter: aa'], [
        ['israel', 0], ['bread', 1], ['monday', 0], ['september', 0], ['kitchen', 1],
        ['english', 0], ['summer', 1], ['netanya', 0], ['tal', 0], ['town', 1],
      ], 'אות גדולה: שמות של אנשים, ערים, ארצות, ימים, חודשים ושפות. מילים רגילות – וגם עונות כמו summer – באות קטנה.'),
      tip: tip(
        'אות גדולה באה: בתחילת משפט · במילה I (אני) · בשמות של אנשים · בשמות של ימים וחודשים · בשמות של מקומות (ערים, ארצות, רחובות) · בשמות של בתי ספר, חברות, סרטים ושירים · בשמות של לאומים ושפות.',
        'Ron and Dan are going to Netanya in September.',
        'I live in Israel.',
        'My brother, Gal, goes to Dekel School.',
      ),
      mission: choice('Capital Detective', 'בלשי האותיות הגדולות', 'capitals', 'Which one is written correctly?', [
        ['___ live in Israel.', ['i', 'I'], 1, 'המילה I (אני) תמיד באות גדולה.'],
        ['I live in ___.', ['israel', 'Israel'], 1, 'שם של ארץ → אות גדולה.'],
        ['Ron and Dan are going to Netanya in ___.', ['september', 'September'], 1, 'שמות של חודשים → אות גדולה.'],
        ['My friend’s name is ___.', ['tal', 'Tal'], 1, 'שם של אדם → אות גדולה.'],
        ['My brother, Gal, goes to ___.', ['dekel school', 'Dekel School'], 1, 'שם של בית ספר → כל מילה בשם באות גדולה.'],
        ['I speak ___.', ['english', 'English'], 1, 'שמות של שפות → אות גדולה.'],
        ['We go to the beach in the ___.', ['summer', 'Summer'], 0, 'עונות השנה (summer) נכתבות באות קטנה!'],
        ['___ books are on the table.', ['my', 'My'], 1, 'תחילת משפט → אות גדולה.'],
        ['See you on ___!', ['Sunday', 'sunday'], 0, 'שמות של ימים → אות גדולה.'],
      ]),
      create: bridge('Capital Bridge', 'גשר האותיות הגדולות', 'capitals', [
        'Ron and Dan are going to Netanya in September.',
        'I live in Israel.',
        'My friend’s name is Tal.',
        'My brother, Gal, goes to Dekel School.',
        'I speak English.',
      ]),
      recap: ['Capital letters: I, names, places, days, months, languages', 'Every sentence starts with a capital letter', 'Seasons (summer) stay small'],
    }),
    lesson('w7d3', 'One or Many? Plurals', 'יחיד או רבים?', {
      learn: sort('Plural Crates', 'ארגזי הרבים', 'plurals', ['+s', '+es', 'y → ies', 'f / fe → ves'], [
        ['key', 0], ['box', 1], ['lady', 2], ['wife', 3], ['bird', 0], ['potato', 1],
        ['puppy', 2], ['leaf', 3], ['day', 0], ['match', 1], ['chief', 0], ['wolf', 3],
      ], 'רוב המילים: s. אחרי s, ss, x, sh, ch, o: es. עיצור + y → ies, אבל תנועה + y (key, day) → רק s. f / fe → ves. יוצא דופן: chief → chiefs.'),
      tip: tip(
        'רוב המילים: מוסיפים s (book → books). מילה שנגמרת ב-s, ss, x, sh, ch או o: מוסיפים es (box → boxes). עיצור לפני y: מורידים y וכותבים ies (lady → ladies). תנועה (a, e, i, o, u) לפני y: רק s (key → keys). f או fe → ves (wife → wives). יוצאי דופן: chief → chiefs, roof → roofs. וברבים אין a לפני המילה!',
        'a box → boxes',
        'a lady → ladies, a key → keys',
        'a wife → wives',
      ),
      mission: spell('Plural Gate', 'שער הרבים', 'plurals', [
        ['keys', 'a key → two ___', 'תנועה (e) לפני y → מוסיפים רק s.'],
        ['boxes', 'a box → two ___', 'x בסוף המילה → es.'],
        ['matches', 'a match → two ___', 'ch בסוף המילה → es.'],
        ['potatoes', 'a potato → two ___', 'o בסוף המילה → es.'],
        ['ladies', 'a lady → two ___', 'עיצור (d) לפני y → ies.'],
        ['puppies', 'a puppy → two ___', 'עיצור (p) לפני y → ies.'],
        ['wives', 'a wife → two ___', 'fe → ves.'],
        ['leaves', 'a leaf → two ___', 'f → ves.'],
        ['days', 'a day → two ___', 'תנועה (a) לפני y → מוסיפים רק s.'],
        ['chiefs', 'a chief → two ___', 'יוצא דופן: chief → chiefs.'],
      ]),
      create: match('Irregular Pairs', 'יוצאי הדופן', 'plurals', [
        ['a man', 'men'],
        ['a woman', 'women'],
        ['a child', 'children'],
        ['a tooth', 'teeth'],
        ['a foot', 'feet'],
        ['a mouse', 'mice'],
      ]),
      recap: ['Plurals: +s, +es, y → ies, f / fe → ves', 'Irregulars: men, women, children, teeth, feet, mice'],
    }),
    lesson('w7d4', 'To Be: Am, Is, Are', 'הפועל to be: am, is, are', {
      learn: choice('Am, Is or Are?', 'am, is או are?', 'to-be', 'Complete the sentences with am, is or are.', [
        ['I ___ a boy and you are a girl.', ['am', 'is', 'are'], 0, 'I → am.'],
        ['The Cohen family ___ at home now.', ['am', 'is', 'are'], 1, 'family היא משפחה אחת (it) → is.'],
        ['My name ___ Adam.', ['am', 'is', 'are'], 1, 'my name = it (יחיד) → is.'],
        ['All her friends ___ in the army.', ['am', 'is', 'are'], 2, 'friends ברבים (they) → are.'],
        ['The girls ___ ready for school.', ['am', 'is', 'are'], 2, 'girls ברבים (they) → are.'],
        ['The window is open and the door ___ open, too.', ['am', 'is', 'are'], 1, 'door אחת (it) → is.'],
        ['Mr. and Mrs. Cohen ___ in the living room.', ['am', 'is', 'are'], 2, 'שני אנשים (they) → are.'],
        ['The little children ___ in their room.', ['am', 'is', 'are'], 2, 'children זה רבים (they) → are.'],
      ]),
      tip: tip(
        'I → am. He / She / It ושם עצם ביחיד → is. You / We / They ושם עצם ברבים → are. שלילה: מוסיפים not אחרי am / is / are. קיצורים: I’m, he’s, it’s, we’re, they’re, וגם isn’t, aren’t. שימו לב: am מתחברת רק עם I (I’m not), אין amn’t!',
        'My name is Adam.',
        'They are not friends. → They’re not friends. → They aren’t friends.',
        'I am not nervous. → I’m not nervous.',
      ),
      mission: match('Short Forms', 'צורות מקוצרות', 'to-be', [
        ['I am', 'I’m'],
        ['he is', 'he’s'],
        ['they are', 'they’re'],
        ['it is not', 'it isn’t'],
        ['we are not', 'we aren’t'],
        ['I am not', 'I’m not'],
      ]),
      create: spell('Negative Gate', 'שער השלילה', 'to-be-negative', [
        ['is not', 'The bus is full. → It ___ empty.', 'צורה מלאה: is + not.'],
        ['isn’t', 'The door is open. → It ___ closed.', 'צורה מקוצרת: is not → isn’t.'],
        ['am not', 'I’m a woman. → I ___ a man.', 'צורה מלאה: am + not.'],
        ['I’m not', 'I’m a woman. → ___ a man.', 'קיצור עם I: I am not → I’m not.'],
        ['aren’t', 'My shoes are new. → They ___ old.', 'צורה מקוצרת: are not → aren’t.'],
        ['It’s not', 'The bag is light. → ___ heavy.', 'מחברים את it ו-is: It is not → It’s not.'],
      ]),
      recap: ['I am · he / she / it is · you / we / they are', 'Negative: is not → isn’t, are not → aren’t, I am not → I’m not'],
    }),
    lesson('w7d5', 'Boss Mission: Practice Test', 'משימת בוס: מבחן תרגול', {
      boss: true,
      learn: choice('Test Warm-Up', 'חזרה לפני המבחן', 'test-mix', 'A little bit of everything – just like the real test!', [
        ['one sheep → two ___', ['sheeps', 'sheep', 'sheepes'], 1, 'sheep לא משתנה ברבים!'],
        ['one fish → many ___', ['fish', 'fishs', 'fishies'], 0, 'fish לא משתנה ברבים.'],
        ['one goose → two ___', ['gooses', 'geese', 'geeses'], 1, 'goose → geese (כמו tooth → teeth).'],
        ['The children ___ in the garden.', ['is', 'am', 'are'], 2, 'children זה רבים → are.'],
        ['My parents ___ at work. They are at home.', ['aren’t', 'isn’t', 'am not'], 0, 'parents = they → aren’t.'],
        ['___ is your favourite hobby? – Cooking!', ['What', 'Who', 'Where'], 0, 'שואלים על דבר → What.'],
        ['We live in ___.', ['tel aviv', 'Tel Aviv', 'tel Aviv'], 1, 'שם של עיר → כל מילה בשם באות גדולה.'],
        ['___ is your house? – Near the shop.', ['Where', 'When', 'Who'], 0, 'התשובה היא מקום → Where.'],
      ]),
      tip: tip(
        'סיכום למבחן: מילות שאלה · אותיות גדולות · יחיד ורבים · am / is / are, שלילה וקיצורים. במבחן: קראו כל שאלה עד הסוף, ובכתיבה – אות גדולה בהתחלה ונקודה בסוף.',
        'My name is Maya. I am eleven years old.',
        'The boxes aren’t heavy.',
      ),
      mission: reading('detective', 'Unseen: My Town', 'אנסין: העיר שלי', 'Unseen text', 'My Town', '🏘️', [
        'My name is Maya and I am eleven years old.',
        'I live in a small town near Haifa, in Israel.',
        'There are a hundred children in my school.',
        'My mother is a teacher. She teaches math at my school.',
        'My favourite room in our house is the kitchen.',
        'Every morning my dad buys bread at the shop near our house.',
        'My hobby is cooking. On Friday I cook with my grandmother.',
        'In the summer my family and I build sandcastles on the beach.',
      ], [
        q('Where does Maya live?', 'חפשו את המילה live.', 1, ['In a big city', 'In a small town near Haifa', 'In Tel Aviv'], 1),
        q('How many children are there in Maya’s school?', 'חפשו מספר.', 2, ['Ten', 'Eleven', 'A hundred'], 2),
        q('What does Maya’s mother teach?', 'חפשו את המילה teaches.', 3, ['English', 'Math', 'Cooking'], 1),
        q('When does Dad buy bread?', 'חפשו את המילה bread.', 5, ['Every morning', 'On Friday', 'In the summer'], 0),
        q('What is Maya’s hobby?', 'חפשו את המילה hobby.', 6, ['Cooking', 'Reading', 'Football'], 0),
        q('Tap the sentence that tells us what Maya’s family does in the summer.', 'חפשו את המילה summer.', 7),
      ]),
      create: write(
        'All About Me',
        'כתיבה: על עצמי',
        'Write 4 sentences about yourself: your name, your age, where you live and your class. Remember: a capital letter at the start and a full stop (.) at the end of every sentence.',
        'כתבו 4 משפטים על עצמכם: השם שלכם, הגיל, איפה אתם גרים ובאיזו כיתה. זכרו: אות גדולה בתחילת כל משפט ונקודה בסוף.',
        15,
        ['My name is ', 'I am ', 'years old. ', 'I live in Israel. ', 'I am in Class 6.'],
        ['Israel', 'Class 6', 'years old', 'family', 'town', 'hobby', 'favourite'],
        { maxWords: 45, panels: ['🙋', '🎂', '🏠', '🏫'] },
      ),
      recap: ['You practised everything for the test!', 'Writing: capital letters and a full stop in every sentence'],
    }),
  ],
};
