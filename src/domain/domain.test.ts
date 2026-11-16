import { describe, expect, it } from 'vitest';
import { LESSON_ORDER, WEEKS } from '../data/curriculum';
import { createDemoState, createInitialState, startProfile } from '../data/seed';
import { buildWarmup, stepActivities } from './dailyPlan';
import { NotAuthorizedError, PARENT_SESSION_MS, hashPin, isParentAuthorized, isValidPin, unlockParent, verifyPin } from './parentAuth';
import { isLessonComplete, isLessonUnlocked, nextLessonId, weeklySummary } from './progress';
import { REVIEW_INTERVALS, dueReviews, nextFormat, scheduleReview } from './review';
import type { AttemptInput } from './session';
import { completeStep } from './session';
import { TICKETS, TicketError, balance, decideRequest, fulfillRequest, giftTickets, grantTickets, requestReward, saveReward } from './tickets';
import { CORE_STEPS } from './types';
import type { AppState, ItemResult, ReviewItem, StepId } from './types';

const NOW = new Date(2026, 10, 16, 17, 0, 0); // Monday
const parent = { unlockedAt: NOW.getTime() };

function child(pin: string | null = '4321'): AppState {
  return startProfile(
    createInitialState(),
    { name: 'Test', grade: 6, avatar: { emoji: '🦊', color: '#fff', gear: '🧭' }, favoriteTheme: 'Animals', dailyGoalMinutes: 15, createdAt: NOW.toISOString() },
    pin,
    NOW,
  );
}

const attempt = (items: Partial<ItemResult>[] = [{}]): AttemptInput[] => [
  {
    activityType: 'choice',
    skill: 'grammar',
    seconds: 120,
    items: items.map((it, i) => ({ key: `k${i}`, firstTry: true, solved: true, ...it })),
  },
];

function playLesson(state: AppState, lessonId: string, now: Date, steps: StepId[] = CORE_STEPS): AppState {
  return steps.reduce((s, step) => completeStep(s, lessonId, step, attempt(), now).state, state);
}

describe('ticket balance and reward redemption', () => {
  it('starts with the welcome gift and sums transactions', () => {
    const s = child();
    expect(balance(s.tickets)).toBe(TICKETS.welcome);
    expect(balance(giftTickets(s, 10, 'gift', parent, NOW).tickets)).toBe(TICKETS.welcome + 10);
  });

  it('holds tickets when the child requests a reward and blocks requests they cannot afford', () => {
    const s = giftTickets(child(), 20, 'gift', parent, NOW);
    expect(() => requestReward(s, 'rw-gift', NOW)).toThrowError(TicketError);
    const requested = requestReward(s, 'rw-dessert', NOW);
    expect(requested.requests).toHaveLength(1);
    expect(requested.requests[0].status).toBe('pending');
    expect(balance(requested.tickets)).toBe(TICKETS.welcome + 20 - 12);
  });

  it('refunds on decline, keeps the hold on approve, and only fulfils approved requests', () => {
    let s = giftTickets(child(), 40, 'gift', parent, NOW);
    s = requestReward(s, 'rw-dessert', NOW);
    s = requestReward(s, 'rw-game', NOW);
    const [first, second] = s.requests;
    const before = balance(s.tickets);

    s = decideRequest(s, first.id, 'decline', parent, NOW);
    expect(balance(s.tickets)).toBe(before + 12);
    expect(s.requests[0].status).toBe('declined');

    expect(() => fulfillRequest(s, second.id, parent, NOW)).toThrowError(TicketError);
    s = decideRequest(s, second.id, 'approve', parent, NOW);
    expect(balance(s.tickets)).toBe(before + 12);
    s = fulfillRequest(s, second.id, parent, NOW);
    expect(s.requests[1].status).toBe('fulfilled');
    expect(() => decideRequest(s, second.id, 'decline', parent, NOW)).toThrowError(TicketError);
  });

  it('does not offer paused rewards', () => {
    let s = giftTickets(child(), 40, 'gift', parent, NOW);
    const dessert = s.rewards.find((r) => r.id === 'rw-dessert')!;
    s = saveReward(s, { ...dessert, active: false }, parent, NOW);
    expect(() => requestReward(s, 'rw-dessert', NOW)).toThrowError(TicketError);
  });

  it('applies the weekly cap and the bonus multiplier to earned tickets', () => {
    const base = child();
    const doubled = grantTickets({ ...base, settings: { ...base.settings, bonusMultiplier: 2 } }, 3, 'step', 'x', NOW);
    expect(doubled.granted).toBe(6);
    const capped = { ...base, settings: { ...base.settings, weeklyTicketCap: TICKETS.welcome + 4 } };
    const first = grantTickets(capped, 3, 'step', 'x', NOW);
    const second = grantTickets(first.state, 3, 'step', 'x', NOW);
    const third = grantTickets(second.state, 3, 'step', 'x', NOW);
    expect([first.granted, second.granted, third.granted]).toEqual([3, 1, 0]);
  });
});

describe('session completion', () => {
  it('awards tickets per step and completes the session after the four core steps', () => {
    let s = child();
    const start = balance(s.tickets);
    const first = completeStep(s, 'w1d1', 'warmup', attempt(), NOW);
    expect(first.earned).toBe(TICKETS.step);
    expect(first.sessionCompleted).toBe(false);
    s = first.state;
    s = completeStep(s, 'w1d1', 'learn', attempt(), NOW).state;
    s = completeStep(s, 'w1d1', 'mission', attempt(), NOW).state;
    expect(isLessonComplete(s.progress, 'w1d1')).toBe(false);
    const last = completeStep(s, 'w1d1', 'create', attempt(), NOW);
    expect(last.sessionCompleted).toBe(true);
    expect(isLessonComplete(last.state.progress, 'w1d1')).toBe(true);
    expect(last.state.progress.sessions).toHaveLength(1);
    expect(balance(last.state.tickets)).toBe(start + 4 * TICKETS.step + TICKETS.session);
    expect(last.newBadges).toContain('first-quest');
  });

  it('never takes tickets away for mistakes and rewards trying again once per day', () => {
    const s = child();
    const missed = completeStep(s, 'w1d1', 'learn', attempt([{ firstTry: false, solved: true }, { firstTry: false, solved: false }]), NOW);
    expect(missed.earned).toBe(TICKETS.step + TICKETS.tryAgain);
    const again = completeStep(missed.state, 'w1d1', 'mission', attempt([{ firstTry: false, solved: true }]), NOW);
    expect(again.earned).toBe(TICKETS.step);
    expect(again.state.tickets.every((t) => t.amount > 0)).toBe(true);
  });

  it('treats replays as practice with no tickets', () => {
    const s = playLesson(child(), 'w1d1', NOW);
    const replay = completeStep(s, 'w1d1', 'learn', attempt(), NOW);
    expect(replay.practice).toBe(true);
    expect(replay.earned).toBe(0);
    expect(balance(replay.state.tickets)).toBe(balance(s.tickets));
    expect(replay.state.progress.sessions).toHaveLength(1);
  });

  it('keeps later quests locked until the previous one is complete', () => {
    const s = child();
    expect(nextLessonId(s.progress, 6)).toBe('w1d1');
    expect(isLessonUnlocked(s.progress, 'w1d2')).toBe(false);
    expect(() => completeStep(s, 'w1d2', 'warmup', attempt(), NOW)).toThrow();
    const after = playLesson(s, 'w1d1', NOW);
    expect(nextLessonId(after.progress, 6)).toBe('w1d2');
    expect(isLessonUnlocked(after.progress, 'w1d2')).toBe(true);
  });

  it('gives the boss bonus and the week badge on the Boss Mission', () => {
    let s = child();
    for (const id of LESSON_ORDER.slice(0, 4)) s = playLesson(s, id, NOW);
    s = playLesson(s, 'w1d5', NOW, ['warmup', 'learn', 'mission']);
    const boss = completeStep(s, 'w1d5', 'create', attempt(), NOW);
    expect(boss.breakdown.map((b) => b.reason)).toEqual(expect.arrayContaining(['step', 'session', 'boss']));
    expect(boss.newBadges).toContain('week-1');
  });

  it('summarises the week for the parent', () => {
    const s = playLesson(child(), 'w1d1', NOW);
    const summary = weeklySummary(s, NOW);
    expect(summary.questsCompleted).toBe(1);
    expect(summary.daysCompleted).toBe(1);
    expect(summary.minutes).toBe(8);
  });
});

describe('adaptive review scheduling', () => {
  const miss: ItemResult = { key: 'a', wordId: 'w1-wake', firstTry: false, solved: true };
  const hit: ItemResult = { ...miss, firstTry: true };

  it('queues a missed word for a later session, never the current one', () => {
    const queue = scheduleReview([], miss, 'match', 3);
    expect(queue).toHaveLength(1);
    expect(queue[0].dueAfterSession).toBe(4);
    expect(dueReviews(queue, 3, 5)).toHaveLength(0);
    expect(dueReviews(queue, 4, 5)).toHaveLength(1);
  });

  it('brings mistakes back in a different game format', () => {
    expect(nextFormat('word', 'match')).not.toBe('match');
    expect(nextFormat('word', 'listen')).toBe('match');
    expect(nextFormat('sentence', 'gap')).toBe('bridge');
    expect(nextFormat('sentence', 'bridge')).toBe('gap');
  });

  it('spaces out correct reviews and retires mastered items', () => {
    let queue = scheduleReview([], miss, 'match', 0);
    let session = queue[0].dueAfterSession;
    for (let box = 1; box < REVIEW_INTERVALS.length; box++) {
      queue = scheduleReview(queue, hit, 'spell', session);
      expect(queue[0].box).toBe(box);
      expect(queue[0].dueAfterSession).toBe(session + REVIEW_INTERVALS[box]);
      session = queue[0].dueAfterSession;
    }
    expect(scheduleReview(queue, hit, 'spell', session)).toHaveLength(0);
  });

  it('ignores a correct answer that arrives before the item is due, and resets on a new miss', () => {
    const queue = scheduleReview([], miss, 'match', 0);
    expect(scheduleReview(queue, hit, 'spell', 0)).toEqual(queue);
    const promoted = scheduleReview(queue, hit, 'spell', 1);
    const lapsed = scheduleReview(promoted, miss, 'listen', 2);
    expect(lapsed[0].box).toBe(0);
    expect(lapsed[0].lapses).toBe(2);
  });

  it('adds due words to the next warm-up as a comeback game in a new format', () => {
    const s = child();
    const learn = completeStep(s, 'w1d1', 'learn', [
      { activityType: 'match', skill: 'vocabulary', seconds: 60, items: [{ key: 'x', wordId: 'w1-wake', firstTry: false, solved: true }] },
    ], NOW);
    expect(buildWarmup(WEEKS[0], 0, learn.state.progress)).toHaveLength(1); // not yet due
    const done = playLesson(learn.state, 'w1d1', NOW, ['warmup', 'mission', 'create']);
    const warmup = buildWarmup(WEEKS[0], 1, done.progress);
    const comeback = warmup.find((a) => a.id.startsWith('review-'));
    expect(comeback?.type).toBe('spell');
  });

  it('orders due items by box, then by how often they were missed', () => {
    const item = (key: string, box: number, lapses: number): ReviewItem => ({ key, kind: 'word', box, lapses, dueAfterSession: 0, lastFormat: 'match' });
    const due = dueReviews([item('a', 1, 1), item('b', 0, 1), item('c', 0, 3)], 0, 2);
    expect(due.map((d) => d.key)).toEqual(['c', 'b']);
  });
});

describe('parent authorization', () => {
  it('validates and verifies the PIN without storing it in plain text', () => {
    const s = child('4321');
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(s.parent.pinHash).not.toBe('4321');
    expect(s.parent.pinHash).toBe(hashPin('4321', s.parent.salt));
    expect(verifyPin(s.parent, '4321')).toBe(true);
    expect(verifyPin(s.parent, '1234')).toBe(false);
    expect(unlockParent(s, '0000', NOW)).toBeNull();
    expect(unlockParent(s, '4321', NOW)).toEqual({ unlockedAt: NOW.getTime() });
  });

  it('never unlocks when no PIN has been set', () => {
    const s = child(null);
    expect(verifyPin(s.parent, '')).toBe(false);
    expect(unlockParent(s, '0000', NOW)).toBeNull();
  });

  it('expires the parent session', () => {
    expect(isParentAuthorized(null, NOW)).toBe(false);
    expect(isParentAuthorized(parent, new Date(NOW.getTime() + PARENT_SESSION_MS - 1))).toBe(true);
    expect(isParentAuthorized(parent, new Date(NOW.getTime() + PARENT_SESSION_MS))).toBe(false);
  });

  it('blocks every parent action without a valid session — a child cannot approve their own request', () => {
    let s = giftTickets(child(), 20, 'gift', parent, NOW);
    s = requestReward(s, 'rw-dessert', NOW);
    const id = s.requests[0].id;
    const expired = { unlockedAt: NOW.getTime() - PARENT_SESSION_MS - 1 };
    expect(() => decideRequest(s, id, 'approve', null, NOW)).toThrowError(NotAuthorizedError);
    expect(() => decideRequest(s, id, 'approve', expired, NOW)).toThrowError(NotAuthorizedError);
    expect(() => fulfillRequest(s, id, null, NOW)).toThrowError(NotAuthorizedError);
    expect(() => giftTickets(s, 5, 'x', null, NOW)).toThrowError(NotAuthorizedError);
    expect(() => saveReward(s, { title: 'X', titleHe: 'X', emoji: '🎁', cost: 1, active: true }, null, NOW)).toThrowError(NotAuthorizedError);
    expect(s.requests[0].status).toBe('pending');
  });
});

describe('curriculum content', () => {
  it('has six weeks of five quests, each with twelve theme words', () => {
    expect(WEEKS).toHaveLength(6);
    for (const week of WEEKS) {
      expect(week.lessons).toHaveLength(5);
      expect(week.words).toHaveLength(12);
      expect(week.lessons[4].boss).toBe(true);
      expect(week.lessons.slice(0, 4).every((l) => !l.boss)).toBe(true);
    }
    expect(new Set(LESSON_ORDER).size).toBe(30);
  });

  it('has valid answers, evidence lines and exactly one right reply per dialogue turn', () => {
    const activities = WEEKS.flatMap((w) => w.lessons.flatMap((l) => [l.learn, l.mission, l.create]));
    expect(new Set(activities.map((a) => a.id)).size).toBe(activities.length);
    for (const a of activities) {
      if (a.type === 'choice') {
        for (const it of a.items) {
          expect(it.prompt).toContain('___');
          expect(it.options[it.answer]).toBeDefined();
          expect(new Set(it.options).size).toBe(it.options.length);
        }
      }
      if (a.type === 'listen') for (const it of a.items) expect(it.options[it.answer]).toBeDefined();
      if (a.type === 'reading') {
        for (const question of a.questions) {
          expect(question.options || question.evidence !== undefined).toBeTruthy();
          if (question.options) expect(question.options[question.answer ?? -1]).toBeDefined();
          if (question.evidence !== undefined) expect(a.lines[question.evidence]).toBeDefined();
        }
      }
      if (a.type === 'dialogue') for (const turn of a.turns) expect(turn.options.filter((o) => o.ok)).toHaveLength(1);
      if (a.type === 'sort') for (const it of a.items) expect(a.buckets[it.bucket]).toBeDefined();
      if (a.type === 'spell') for (const it of a.items) expect(it.clue).toContain('___');
      if (a.type === 'write' && a.minWords >= 25) expect(a.maxWords).toBeGreaterThanOrEqual(35);
    }
  });

  it('ends every week with a ~30-word paragraph and reuses the week theme words in its activities', () => {
    for (const week of WEEKS) {
      const boss = week.lessons[4].create;
      expect(boss.type === 'write' && boss.minWords).toBe(25);
      const text = JSON.stringify(week.lessons).toLowerCase();
      const reused = week.words.filter((w) => text.includes(w.en.toLowerCase()));
      expect(reused.length).toBeGreaterThanOrEqual(9);
    }
  });

  it('gives every quest a warm-up, three authored activities and a bonus', () => {
    const progress = createInitialState().progress;
    for (const id of LESSON_ORDER) {
      for (const step of [...CORE_STEPS, 'bonus'] as StepId[]) {
        expect(stepActivities(id, step, progress).length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('seeded demo data', () => {
  it('is deterministic and lived-in', () => {
    const a = createDemoState(NOW);
    const b = createDemoState(NOW);
    expect(a).toEqual(b);
    expect(a.progress.sessions).toHaveLength(6);
    expect(isLessonComplete(a.progress, 'w1d5')).toBe(true);
    expect(nextLessonId(a.progress, 6)).toBe('w2d2');
    expect(a.requests.map((r) => r.status)).toEqual(['approved', 'pending']);
    expect(balance(a.tickets)).toBeGreaterThan(0);
    expect(a.progress.reviewQueue.length).toBeGreaterThan(0);
  });
});
