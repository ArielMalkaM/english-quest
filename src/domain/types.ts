// ───────────────────────── Curriculum content models ─────────────────────────

export type Lang = 'he' | 'en';

export type Skill =
  | 'vocabulary'
  | 'grammar'
  | 'reading'
  | 'listening'
  | 'writing'
  | 'speaking'
  | 'creative';

export type ZoneId = 'woods' | 'lab' | 'harbor' | 'cave' | 'market' | 'sky';

export interface Word {
  id: string;
  en: string;
  he: string;
  emoji: string;
  example: string;
}

interface ActivityBase {
  id: string;
  title: string;
  titleHe: string;
  skill: Skill;
  /** Grammar tag id (see data/curriculum/grammar.ts) when the activity practises grammar. */
  grammar?: string;
  /** One-line instruction shown above the game. */
  how: string;
  howHe: string;
}

export interface MatchActivity extends ActivityBase {
  type: 'match';
  pairs: { a: string; b: string; wordId?: string }[];
}

export interface SpellActivity extends ActivityBase {
  type: 'spell';
  items: { answer: string; clue: string; emoji?: string; he?: string; say?: string; wordId?: string; sentence?: string }[];
}

export interface ListenActivity extends ActivityBase {
  type: 'listen';
  items: {
    say: string;
    question: string;
    options: { label: string; emoji?: string }[];
    answer: number;
    wordId?: string;
  }[];
}

export interface ChoiceActivity extends ActivityBase {
  type: 'choice';
  /** Short story intro shown above the items. */
  intro?: string;
  items: { prompt: string; options: string[]; answer: number; why: string }[];
}

export interface BridgeActivity extends ActivityBase {
  type: 'bridge';
  items: { sentence: string; he?: string; extra?: string[] }[];
}

export interface SortActivity extends ActivityBase {
  type: 'sort';
  buckets: string[];
  items: { text: string; bucket: number }[];
  why: string;
}

export interface ReadingQuestion {
  q: string;
  options?: string[];
  answer?: number;
  /** Index of the line that proves the answer (tap-the-clue / evidence). */
  evidence?: number;
  hint: string;
}

export interface ReadingActivity extends ActivityBase {
  type: 'reading';
  mode: 'story' | 'detective';
  genre: string;
  textTitle: string;
  emoji: string;
  lines: string[];
  questions: ReadingQuestion[];
}

export interface DialogueActivity extends ActivityBase {
  type: 'dialogue';
  scene: string;
  partner: { name: string; emoji: string };
  turns: { says: string; options: { text: string; ok: boolean; note?: string }[] }[];
}

export interface BuildActivity extends ActivityBase {
  type: 'build';
  goal: string;
  goalHe: string;
  lines: string[];
}

export interface WriteActivity extends ActivityBase {
  type: 'write';
  prompt: string;
  promptHe: string;
  minWords: number;
  maxWords?: number;
  starters: string[];
  wordBank: string[];
  /** Emoji "comic panels" shown as picture prompts. */
  panels?: string[];
}

export interface SceneActivity extends ActivityBase {
  type: 'scene';
  scenes: { emoji: string; label: string; words: string[] }[];
}

export interface SpeakActivity extends ActivityBase {
  type: 'speak';
  /** Emoji of the island friend who "listens". */
  guide: string;
  phrases: string[];
}

export interface SpeedActivity extends ActivityBase {
  type: 'speed';
  seconds: number;
  items: { prompt: string; options: string[]; answer: number; wordId?: string }[];
}

export type Activity =
  | MatchActivity
  | SpellActivity
  | ListenActivity
  | ChoiceActivity
  | BridgeActivity
  | SortActivity
  | ReadingActivity
  | DialogueActivity
  | BuildActivity
  | WriteActivity
  | SceneActivity
  | SpeakActivity
  | SpeedActivity;

export type ActivityType = Activity['type'];

export interface GrammarTip {
  he: string;
  examples: string[];
}

/** A lesson = one 10–20 minute daily quest. */
export interface Lesson {
  id: string;
  title: string;
  titleHe: string;
  boss?: boolean;
  learn: Activity;
  tip: GrammarTip;
  mission: Activity;
  create: Activity;
  /** "You learned…" recap lines (English). */
  recap: string[];
}

export interface WeeklyPlan {
  id: string;
  number: number;
  theme: string;
  themeHe: string;
  emoji: string;
  grammarFocus: string;
  grammarFocusHe: string;
  finalMission: string;
  finalMissionHe: string;
  friend: { name: string; emoji: string };
  words: Word[];
  phrases: string[];
  scenes: SceneActivity['scenes'];
  lessons: Lesson[];
}

// ───────────────────────── Learner / app state models ─────────────────────────

export type StepId = 'warmup' | 'learn' | 'mission' | 'create' | 'bonus';
export const CORE_STEPS: StepId[] = ['warmup', 'learn', 'mission', 'create'];

export interface LearnerProfile {
  name: string;
  avatar: { emoji: string; color: string; gear: string };
  favoriteTheme: string;
  dailyGoalMinutes: 10 | 15 | 20;
  createdAt: string;
}

export interface Settings {
  uiLang: Lang;
  reducedMotion: boolean;
  largeText: boolean;
  sound: boolean;
  /** Max tickets that can be earned per week (Sun–Sat). null = no cap. */
  weeklyTicketCap: number | null;
  /** Multiplier applied to earned tickets (1, 1.5, 2). */
  bonusMultiplier: number;
}

export interface ParentAuth {
  pinHash: string | null;
  salt: string;
}

/** In-memory proof that the parent PIN was entered recently. Never persisted. */
export interface ParentSession {
  unlockedAt: number;
}

export interface ItemResult {
  key: string;
  firstTry: boolean;
  solved: boolean;
  wordId?: string;
  grammar?: string;
  /** Full correct sentence, used to re-serve grammar mistakes in a new format. */
  sentence?: string;
}

export interface ActivityAttempt {
  id: string;
  lessonId: string;
  step: StepId;
  activityType: ActivityType;
  skill: Skill;
  finishedAt: string;
  seconds: number;
  items: ItemResult[];
  /** Free text the child wrote (kept locally so a parent can read it). */
  text?: string;
  practice?: boolean;
}

export interface SessionRecord {
  lessonId: string;
  completedAt: string;
  /** Local calendar date YYYY-MM-DD. */
  date: string;
  seconds: number;
}

export type TicketReason =
  | 'step'
  | 'session'
  | 'try-again'
  | 'bonus'
  | 'boss'
  | 'streak'
  | 'welcome'
  | 'request'
  | 'refund'
  | 'parent-gift';

export interface TicketTransaction {
  id: string;
  at: string;
  /** Signed: positive = earned/refunded, negative = held for a reward request. */
  amount: number;
  reason: TicketReason;
  note: string;
  requestId?: string;
  lessonId?: string;
}

export interface Reward {
  id: string;
  title: string;
  titleHe: string;
  emoji: string;
  cost: number;
  active: boolean;
}

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'fulfilled';

export interface RewardRequest {
  id: string;
  rewardId: string;
  title: string;
  titleHe: string;
  emoji: string;
  cost: number;
  status: RequestStatus;
  requestedAt: string;
  decidedAt?: string;
  fulfilledAt?: string;
}

export type ReviewFormat = 'match' | 'spell' | 'listen' | 'bridge' | 'gap';

export interface ReviewItem {
  key: string;
  kind: 'word' | 'sentence';
  wordId?: string;
  sentence?: string;
  grammar?: string;
  /** Leitner box: 0 = just missed. */
  box: number;
  /** Due once this many sessions have been completed. */
  dueAfterSession: number;
  lastFormat: ReviewFormat;
  lapses: number;
}

export interface Tally {
  seen: number;
  correct: number;
}

export interface Progress {
  /** lessonId -> steps completed (first-time completions only). */
  steps: Record<string, StepId[]>;
  sessions: SessionRecord[];
  attempts: ActivityAttempt[];
  wordStats: Record<string, Tally & { streak: number }>;
  skillStats: Partial<Record<Skill, Tally>>;
  grammarStats: Record<string, Tally>;
  reviewQueue: ReviewItem[];
  zonePoints: Record<ZoneId, number>;
  badges: { id: string; at: string }[];
  tryAgainDays: string[];
  streakMilestones: number[];
}

export interface AppState {
  version: number;
  profile: LearnerProfile | null;
  parent: ParentAuth;
  settings: Settings;
  progress: Progress;
  tickets: TicketTransaction[];
  rewards: Reward[];
  requests: RewardRequest[];
}
