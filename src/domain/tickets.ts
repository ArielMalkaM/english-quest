import { isInWeekOf, localDate } from './dates';
import { newId } from './ids';
import { assertParent } from './parentAuth';
import type {
  AppState,
  Grade,
  ParentSession,
  Reward,
  RewardRequest,
  TicketReason,
  TicketTransaction,
} from './types';

export const TICKETS = {
  step: 2,
  session: 2,
  tryAgain: 1,
  bonus: 3,
  boss: 5,
  streak: 5,
  welcome: 3,
} as const;

/**
 * Most tickets a child can earn from learning in one day (before the parent's
 * multiplier). The same for every grade, so a younger child with quicker quests
 * cannot out-earn an older one by playing many quests in a row.
 */
export const DAILY_TICKET_CAP = 25;

type QuestReward = 'step' | 'bonus' | 'session' | 'boss';

/**
 * Quest rewards by grade. Grades 2–4 have shorter, easier quests, so each one is
 * worth less: about three quests reach the daily cap, against two in grades 5–6.
 */
export function questTickets(grade: Grade): Record<QuestReward, number> {
  if (grade <= 4) return { step: 1, bonus: 2, session: 2, boss: 4 };
  return { step: TICKETS.step, bonus: TICKETS.bonus, session: TICKETS.session, boss: TICKETS.boss };
}

export const STREAK_MILESTONES = [3, 5, 7, 14, 21, 30];

/** Earned by learning (counts toward the daily cap); gifts, refunds and the welcome gift do not. */
const LEARNING_REASONS: ReadonlySet<TicketReason> = new Set(['step', 'session', 'try-again', 'bonus', 'boss', 'streak']);

export class TicketError extends Error {
  constructor(
    public code: 'not-enough' | 'reward-unavailable' | 'bad-status' | 'not-found' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'TicketError';
  }
}

export function balance(txs: TicketTransaction[]): number {
  return txs.reduce((sum, t) => sum + t.amount, 0);
}

/** Tickets earned (not refunds/holds) in the week containing `now`. */
export function earnedThisWeek(txs: TicketTransaction[], now: Date): number {
  return txs
    .filter((t) => t.amount > 0 && t.reason !== 'refund' && t.reason !== 'parent-gift' && isInWeekOf(t.at, now))
    .reduce((sum, t) => sum + t.amount, 0);
}

/** Tickets earned from learning on the local calendar day of `now`. */
export function earnedToday(txs: TicketTransaction[], now: Date): number {
  const today = localDate(now);
  return txs
    .filter((t) => t.amount > 0 && LEARNING_REASONS.has(t.reason) && localDate(new Date(t.at)) === today)
    .reduce((sum, t) => sum + t.amount, 0);
}

/** The daily cap after the parent's multiplier (a ×2 week doubles the cap too). */
export function dailyCap(state: AppState): number {
  return Math.round(DAILY_TICKET_CAP * (state.settings.bonusMultiplier || 1));
}

/**
 * Grants tickets for learning. Applies the parent's bonus multiplier, the daily
 * cap and the optional weekly cap. Never grants a negative amount: mistakes cost nothing.
 */
export function grantTickets(
  state: AppState,
  base: number,
  reason: TicketReason,
  note: string,
  now: Date,
  lessonId?: string,
): { state: AppState; granted: number } {
  if (base <= 0) return { state, granted: 0 };
  let amount = Math.round(base * (state.settings.bonusMultiplier || 1));
  if (LEARNING_REASONS.has(reason)) {
    amount = Math.min(amount, Math.max(0, dailyCap(state) - earnedToday(state.tickets, now)));
  }
  const cap = state.settings.weeklyTicketCap;
  if (cap !== null) {
    const room = Math.max(0, cap - earnedThisWeek(state.tickets, now));
    amount = Math.min(amount, room);
  }
  if (amount <= 0) return { state, granted: 0 };
  const tx: TicketTransaction = {
    id: newId('tx'),
    at: now.toISOString(),
    amount,
    reason,
    note,
    ...(lessonId ? { lessonId } : {}),
  };
  return { state: { ...state, tickets: [...state.tickets, tx] }, granted: amount };
}

/** Child action: ask a parent for a reward. Tickets are held until the parent decides. */
export function requestReward(state: AppState, rewardId: string, now: Date): AppState {
  const reward = state.rewards.find((r) => r.id === rewardId);
  if (!reward || !reward.active) throw new TicketError('reward-unavailable', 'Reward is not available');
  if (balance(state.tickets) < reward.cost) throw new TicketError('not-enough', 'Not enough tickets yet');
  const request: RewardRequest = {
    id: newId('req'),
    rewardId: reward.id,
    title: reward.title,
    titleHe: reward.titleHe,
    emoji: reward.emoji,
    cost: reward.cost,
    status: 'pending',
    requestedAt: now.toISOString(),
  };
  const hold: TicketTransaction = {
    id: newId('tx'),
    at: now.toISOString(),
    amount: -reward.cost,
    reason: 'request',
    note: reward.title,
    requestId: request.id,
  };
  return { ...state, requests: [...state.requests, request], tickets: [...state.tickets, hold] };
}

function findRequest(state: AppState, id: string): RewardRequest {
  const req = state.requests.find((r) => r.id === id);
  if (!req) throw new TicketError('not-found', 'Request not found');
  return req;
}

function patchRequest(state: AppState, id: string, patch: Partial<RewardRequest>): AppState {
  return { ...state, requests: state.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/** Parent-only: approve or decline a pending request. Declining refunds the tickets. */
export function decideRequest(
  state: AppState,
  requestId: string,
  decision: 'approve' | 'decline',
  session: ParentSession | null,
  now: Date,
): AppState {
  assertParent(session, now);
  const req = findRequest(state, requestId);
  if (req.status !== 'pending') throw new TicketError('bad-status', 'Request was already decided');
  const at = now.toISOString();
  if (decision === 'approve') return patchRequest(state, requestId, { status: 'approved', decidedAt: at });
  const refund: TicketTransaction = {
    id: newId('tx'),
    at,
    amount: req.cost,
    reason: 'refund',
    note: req.title,
    requestId,
  };
  return {
    ...patchRequest(state, requestId, { status: 'declined', decidedAt: at }),
    tickets: [...state.tickets, refund],
  };
}

/** Parent-only: mark an approved reward as given to the child. */
export function fulfillRequest(
  state: AppState,
  requestId: string,
  session: ParentSession | null,
  now: Date,
): AppState {
  assertParent(session, now);
  const req = findRequest(state, requestId);
  if (req.status !== 'approved') throw new TicketError('bad-status', 'Only approved requests can be fulfilled');
  return patchRequest(state, requestId, { status: 'fulfilled', fulfilledAt: now.toISOString() });
}

/** Parent-only: create or update a reward option. */
export function saveReward(
  state: AppState,
  reward: Omit<Reward, 'id'> & { id?: string },
  session: ParentSession | null,
  now: Date,
): AppState {
  assertParent(session, now);
  const cost = Math.round(reward.cost);
  if (!reward.title.trim() || !Number.isFinite(cost) || cost < 1) {
    throw new TicketError('invalid', 'A reward needs a title and a cost of at least 1 ticket');
  }
  if (reward.id) {
    return {
      ...state,
      rewards: state.rewards.map((r) => (r.id === reward.id ? { ...r, ...reward, id: r.id, cost } : r)),
    };
  }
  const id = newId('rw');
  return { ...state, rewards: [...state.rewards, { ...reward, id, cost }] };
}

/** Parent-only: remove a reward option. Existing requests keep their own copy of the title. */
export function removeReward(state: AppState, rewardId: string, session: ParentSession | null, now: Date): AppState {
  assertParent(session, now);
  return { ...state, rewards: state.rewards.filter((r) => r.id !== rewardId) };
}

/** Parent-only: a manual gift of tickets (not affected by cap or multiplier). */
export function giftTickets(
  state: AppState,
  amount: number,
  note: string,
  session: ParentSession | null,
  now: Date,
): AppState {
  assertParent(session, now);
  const n = Math.round(amount);
  if (!Number.isFinite(n) || n < 1) throw new TicketError('invalid', 'Gift must be at least 1 ticket');
  const tx: TicketTransaction = {
    id: newId('tx'),
    at: now.toISOString(),
    amount: n,
    reason: 'parent-gift',
    note,
  };
  return { ...state, tickets: [...state.tickets, tx] };
}
