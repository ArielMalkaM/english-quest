import { stepActivities } from '../domain/dailyPlan';
import { addDays } from '../domain/dates';
import { makeSalt, setPin } from '../domain/parentAuth';
import { emptyProgress } from '../domain/progress';
import type { AttemptInput } from '../domain/session';
import { completeStep } from '../domain/session';
import { TICKETS, decideRequest, grantTickets, requestReward } from '../domain/tickets';
import type { Activity, AppState, ItemResult, Reward, Settings, StepId } from '../domain/types';
import { LESSON_ORDER } from './curriculum';

export const STATE_VERSION = 1;
export const DEMO_PIN = '1234';

export const DEFAULT_REWARDS: Reward[] = [
  { id: 'rw-movie', title: 'Choose a family movie', titleHe: 'לבחור סרט משפחתי', emoji: '🎬', cost: 20, active: true },
  { id: 'rw-game', title: '30 minutes extra game time', titleHe: '30 דקות משחק נוספות', emoji: '🎮', cost: 15, active: true },
  { id: 'rw-dessert', title: 'Pick Friday dessert', titleHe: 'לבחור קינוח לשישי', emoji: '🍰', cost: 12, active: true },
  { id: 'rw-activity', title: 'Choose a family activity', titleHe: 'לבחור פעילות משפחתית', emoji: '🚲', cost: 30, active: true },
  { id: 'rw-gift', title: 'Small allowance / gift', titleHe: 'דמי כיס קטנים / מתנה', emoji: '🎁', cost: 40, active: true },
];

export const DEFAULT_SETTINGS: Settings = {
  uiLang: 'he',
  reducedMotion: false,
  largeText: false,
  sound: true,
  weeklyTicketCap: null,
  bonusMultiplier: 1,
};

/** Brand-new install: no profile yet (onboarding), seeded rewards. */
export function createInitialState(): AppState {
  return {
    version: STATE_VERSION,
    profile: null,
    parent: { pinHash: null, salt: makeSalt(20200601) },
    settings: { ...DEFAULT_SETTINGS },
    progress: emptyProgress(),
    tickets: [],
    rewards: DEFAULT_REWARDS.map((r) => ({ ...r })),
    requests: [],
  };
}

/** Finishes onboarding. Adds a small welcome gift so the ticket pouch is never empty. */
export function startProfile(
  state: AppState,
  profile: NonNullable<AppState['profile']>,
  pin: string | null,
  now: Date,
): AppState {
  let next: AppState = { ...state, profile };
  if (pin) next = { ...next, parent: setPin(next.parent, pin) };
  if (next.tickets.length === 0) {
    next = grantTickets(next, TICKETS.welcome, 'welcome', 'Welcome to Quest Island!', now).state;
  }
  return next;
}

function syntheticItems(activity: Activity, seed: number): ItemResult[] {
  // Deterministic "mostly right, sometimes needed a second try" pattern.
  const result = (key: string, i: number, extra: Partial<ItemResult> = {}): ItemResult => ({
    key,
    firstTry: (i * 7 + seed) % 5 !== 0,
    solved: true,
    grammar: activity.grammar,
    ...extra,
  });
  switch (activity.type) {
    case 'match':
      return activity.pairs.map((p, i) => result(`${activity.id}:${i}`, i, { wordId: p.wordId }));
    case 'spell':
      return activity.items.map((it, i) => result(`${activity.id}:${i}`, i, { wordId: it.wordId, sentence: it.sentence }));
    case 'listen':
      return activity.items.map((it, i) => result(`${activity.id}:${i}`, i, { wordId: it.wordId }));
    case 'speed':
      return activity.items.slice(0, 8).map((it, i) => result(`${activity.id}:${i}`, i, { wordId: it.wordId }));
    case 'choice':
      return activity.items.map((it, i) =>
        result(`${activity.id}:${i}`, i, { sentence: it.prompt.replace('___', it.options[it.answer]) }),
      );
    case 'bridge':
      return activity.items.map((it, i) => result(`${activity.id}:${i}`, i, { sentence: it.sentence }));
    case 'sort':
      return activity.items.map((_, i) => result(`${activity.id}:${i}`, i));
    case 'reading':
      return activity.questions.map((_, i) => result(`${activity.id}:${i}`, i));
    case 'dialogue':
      return activity.turns.map((_, i) => result(`${activity.id}:${i}`, i));
    case 'build':
      return activity.lines.map((line, i) => result(`${activity.id}:${i}`, i, { sentence: line }));
    default:
      return [{ key: `${activity.id}:0`, firstTry: true, solved: true }];
  }
}

const DEMO_TEXTS = [
  'I wake up at seven. I eat cereal for breakfast.',
  'After school I usually eat lunch. Then I do my homework.',
  'What time do you wake up? Do you play football after school?',
];

/**
 * A deterministic, lived-in demo: "Noam" has played for six days, finished week 1,
 * started week 2, and has one approved and one pending wish. Parent PIN = DEMO_PIN.
 */
export function createDemoState(now: Date): AppState {
  let state = startProfile(
    createInitialState(),
    {
      name: 'Noam',
      avatar: { emoji: '🤖', color: '#2ec4b6', gear: '🧭' },
      favoriteTheme: 'Space and robots',
      dailyGoalMinutes: 15,
      createdAt: addDays(now, -6).toISOString(),
    },
    DEMO_PIN,
    addDays(now, -6),
  );

  const steps: StepId[] = ['warmup', 'learn', 'mission', 'create'];
  LESSON_ORDER.slice(0, 6).forEach((lessonId, day) => {
    const at = addDays(now, day - 6);
    at.setHours(17, 0, 0, 0);
    const playSteps: StepId[] = day % 2 === 0 ? [...steps, 'bonus'] : steps;
    playSteps.forEach((step, s) => {
      const attempts: AttemptInput[] = stepActivities(lessonId, step, state.progress).map((activity, i) => ({
        activityType: activity.type,
        skill: activity.skill,
        seconds: 120 + ((day * 37 + s * 53 + i * 11) % 150),
        items: syntheticItems(activity, day + s),
        ...(activity.type === 'write' ? { text: DEMO_TEXTS[day % DEMO_TEXTS.length] } : {}),
      }));
      state = completeStep(state, lessonId, step, attempts, new Date(at.getTime() + s * 4 * 60000)).state;
    });
  });

  const unlocked = { unlockedAt: addDays(now, -2).getTime() };
  state = requestReward(state, 'rw-dessert', addDays(now, -2));
  state = decideRequest(state, state.requests[0].id, 'approve', unlocked, addDays(now, -2));
  state = requestReward(state, 'rw-game', addDays(now, -1));
  return state;
}
