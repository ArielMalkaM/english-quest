import type { ActivityType, Skill, StepId, TicketReason, ZoneId } from '../../domain/types';

type Label = { emoji: string; en: string; he: string };

export const STEP_META: Record<StepId, Label> = {
  warmup: { emoji: '🌱', en: 'Warm-up', he: 'חימום' },
  learn: { emoji: '🧪', en: 'Learn by playing', he: 'לומדים במשחק' },
  mission: { emoji: '🧭', en: 'Mission challenge', he: 'אתגר המשימה' },
  create: { emoji: '✏️', en: 'Create & communicate', he: 'יוצרים ומתקשרים' },
  bonus: { emoji: '🎈', en: 'Bonus mission', he: 'משימת בונוס' },
};

export const TYPE_META: Record<ActivityType, Label> = {
  match: { emoji: '🃏', en: 'Match the pairs', he: 'התאמת זוגות' },
  spell: { emoji: '🔐', en: 'Spell to unlock', he: 'מאייתים ופותחים' },
  listen: { emoji: '🎧', en: 'Listen and choose', he: 'מקשיבים ובוחרים' },
  choice: { emoji: '📖', en: 'Story gaps', he: 'משלימים סיפור' },
  bridge: { emoji: '🌉', en: 'Sentence bridge', he: 'גשר המשפטים' },
  sort: { emoji: '📦', en: 'Sort the crates', he: 'ממיינים לארגזים' },
  reading: { emoji: '🔎', en: 'Reading mission', he: 'משימת קריאה' },
  dialogue: { emoji: '💬', en: 'Choose what to say', he: 'בוחרים מה לומר' },
  build: { emoji: '✉️', en: 'Build a message', he: 'בונים הודעה' },
  write: { emoji: '✏️', en: 'Write', he: 'כותבים' },
  scene: { emoji: '🖼️', en: 'Scene writer', he: 'כותבים על סצנה' },
  speak: { emoji: '🎤', en: 'Talk to the guide', he: 'מדברים עם המדריך' },
  speed: { emoji: '⚡', en: 'Speed round', he: 'סיבוב מהיר' },
};

export const SKILL_META: Record<Skill, Label> = {
  vocabulary: { emoji: '🌳', en: 'Vocabulary', he: 'אוצר מילים' },
  grammar: { emoji: '🧪', en: 'Grammar', he: 'דקדוק' },
  reading: { emoji: '⚓', en: 'Reading', he: 'קריאה' },
  listening: { emoji: '🎧', en: 'Listening', he: 'האזנה' },
  speaking: { emoji: '💬', en: 'Speaking & conversation', he: 'דיבור ושיחה' },
  writing: { emoji: '✏️', en: 'Writing', he: 'כתיבה' },
  creative: { emoji: '🎈', en: 'Creative missions', he: 'משימות יצירה' },
};

export const ZONES: Record<ZoneId, Label & { about: string; aboutHe: string; stages: string[] }> = {
  woods: { emoji: '🌳', en: 'Word Woods', he: 'יער המילים', about: 'Vocabulary and spelling', aboutHe: 'אוצר מילים ואיות', stages: ['🍂', '🌱', '🌿', '🌳', '🌳🦜'] },
  lab: { emoji: '🧪', en: 'Grammar Lab', he: 'מעבדת הדקדוק', about: 'Sentence puzzles', aboutHe: 'חידות משפטים', stages: ['🏚️', '🔧', '💡', '🧪', '🧪⚡'] },
  harbor: { emoji: '⚓', en: 'Story Harbor', he: 'נמל הסיפורים', about: 'Reading missions', aboutHe: 'משימות קריאה', stages: ['🌫️', '🔨', '🌉', '⛵', '⛵🏮'] },
  cave: { emoji: '🎧', en: 'Sound Cave', he: 'מערת הצלילים', about: 'Listening and speaking', aboutHe: 'האזנה ודיבור', stages: ['🕳️', '🔦', '🎵', '💎', '💎🎶'] },
  market: { emoji: '✉️', en: 'Message Market', he: 'שוק ההודעות', about: 'Writing and messages', aboutHe: 'כתיבה והודעות', stages: ['🧱', '⛺', '🏪', '🎪', '🎪🎏'] },
  sky: { emoji: '🎈', en: 'Bonus Sky', he: 'שמי הבונוס', about: 'Creative and surprise missions', aboutHe: 'משימות יצירה והפתעה', stages: ['☁️', '🌤️', '🎈', '🌈', '🌈🪁'] },
};

export const REASON_META: Record<TicketReason, { en: string; he: string }> = {
  step: { en: 'Activity finished', he: 'פעילות הושלמה' },
  session: { en: 'Daily quest complete', he: 'משימה יומית הושלמה' },
  'try-again': { en: 'Tried again and solved it', he: 'ניסיתם שוב והצלחתם' },
  bonus: { en: 'Bonus mission', he: 'משימת בונוס' },
  boss: { en: 'Boss Mission', he: 'משימת בוס' },
  streak: { en: 'Streak milestone', he: 'רצף ימים' },
  welcome: { en: 'Welcome gift', he: 'מתנת פתיחה' },
  request: { en: 'Wish sent', he: 'משאלה נשלחה' },
  refund: { en: 'Tickets returned', he: 'כרטיסים הוחזרו' },
  'parent-gift': { en: 'Gift from a parent', he: 'מתנה מההורים' },
};
