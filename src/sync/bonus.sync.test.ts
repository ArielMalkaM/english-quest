// Daily Bonus Adventure across devices of one family account (in-memory account, real sync engine).
import { describe, expect, it } from 'vitest';
import { lessonOrder } from '../data/curriculum';
import { createInitialHousehold, createInitialState, DEFAULT_SETTINGS, startProfile } from '../data/seed';
import { BONUS_ALLOWANCE_MS, bonusDay, bonusStatus, markBonusPrompted, recordBonus, shouldPromptBonus } from '../domain/bonusGame';
import { localDate } from '../domain/dates';
import { addChild, childView, mergeChildView } from '../domain/household';
import { completeStep } from '../domain/session';
import { balance } from '../domain/tickets';
import type { Household, LearnerProfile, Progress, StepId } from '../domain/types';
import { CORE_STEPS } from '../domain/types';
import { BonusRun, planEntry } from '../features/bonus/session';
import { runSyncCycle } from './engine';
import { MemoryRemote } from './memoryRemote';

const NOW = new Date(2026, 10, 17, 17, 0, 0);
const TODAY = localDate(NOW);

class Device {
  constructor(
    public h: Household,
    private remote: MemoryRemote,
    public id: string,
  ) {}
  sync() {
    return runSyncCycle({ remote: this.remote, familyId: this.remote.familyId, get: () => this.h, apply: (fn) => (this.h = fn(this.h)), now: () => NOW });
  }
  get kid() {
    return this.h.children[0];
  }
  private change(fn: (p: Progress) => Progress) {
    const view = childView(this.h, this.kid);
    this.h = mergeChildView(this.h, this.kid.id, { ...view, progress: fn(view.progress) }, NOW);
  }
  playQuest(lessonId: string) {
    const view = CORE_STEPS.reduce(
      (s, step: StepId) => completeStep(s, lessonId, step, [{ activityType: 'choice', skill: 'grammar', seconds: 60, items: [{ key: 'k', firstTry: true, solved: true }] }], NOW).state,
      childView(this.h, this.kid),
    );
    this.h = mergeChildView(this.h, this.kid.id, view, NOW);
  }
  answerPopup() {
    this.change((p) => markBonusPrompted(p, NOW));
  }
  /** Opens the bonus screen on this device and plays up to `ms`; returns how long it could play. */
  playBonus(ms: number): number {
    const e = planEntry(this.kid.progress, TODAY, this.id, null, false);
    if (e.kind !== 'play') return 0;
    const run = new BonusRun(e.start);
    const before = run.totalUsed;
    run.tick(ms);
    run.answer({ correct: true, points: 10, streak: 1 });
    if (run.leftMs <= 0) run.finish();
    this.change((p) => recordBonus(p, TODAY, run.checkpoint(this.id), NOW));
    return run.totalUsed - before;
  }
  day() {
    return bonusDay(this.kid.progress, TODAY);
  }
}

const profile: LearnerProfile = { name: 'Noa', grade: 5, avatar: { emoji: '🦊', color: '#fff', gear: '🧭' }, favoriteTheme: 'Animals', dailyGoalMinutes: 15, createdAt: NOW.toISOString() };

async function twoDevices() {
  const remote = new MemoryRemote();
  const start = startProfile({ ...createInitialState(), settings: DEFAULT_SETTINGS }, profile, '1234', NOW);
  const base = createInitialHousehold();
  const h = addChild({ ...base, parent: start.parent, rev: 1, updatedAt: NOW.toISOString() }, { profile, code: null, settings: start.settings, record: { tickets: start.tickets } }, null, NOW).household;
  const phone = new Device(h, remote, 'phone');
  await phone.sync();
  const tablet = new Device(createInitialHousehold(), remote, 'tablet');
  await tablet.sync();
  return { phone, tablet };
}

describe('bonus game across devices', () => {
  it('a quest finished on the phone unlocks the bonus on the tablet; the pop-up is answered once', async () => {
    const { phone, tablet } = await twoDevices();
    phone.playQuest(lessonOrder(5)[0]);
    phone.answerPopup();
    await phone.sync();
    await tablet.sync();
    expect(bonusStatus(tablet.kid.progress, NOW)).toBe('ready');
    expect(shouldPromptBonus(tablet.kid.progress, NOW)).toBe(false);
  });

  it('time played on the phone is used up on the tablet too', async () => {
    const { phone, tablet } = await twoDevices();
    phone.playQuest(lessonOrder(5)[0]);
    expect(phone.playBonus(200_000)).toBe(200_000);
    await phone.sync();
    await tablet.sync();
    expect(tablet.playBonus(5 * 60_000)).toBe(100_000);
    await tablet.sync();
    await phone.sync();
    for (const d of [phone, tablet]) {
      expect(d.day()?.usedMs).toBe(BONUS_ALLOWANCE_MS);
      expect(bonusStatus(d.kid.progress, NOW)).toBe('done');
      expect(d.playBonus(60_000)).toBe(0);
    }
  });

  it('playing on both devices offline still totals 5 minutes after they sync', async () => {
    const { phone, tablet } = await twoDevices();
    phone.playQuest(lessonOrder(5)[0]);
    await phone.sync();
    await tablet.sync();
    // Both offline: each thinks it has the whole 5 minutes.
    phone.playBonus(180_000);
    tablet.playBonus(200_000);
    await phone.sync();
    await tablet.sync();
    await phone.sync();
    for (const d of [phone, tablet]) {
      expect(d.day()?.usedMs).toBe(BONUS_ALLOWANCE_MS);
      expect(d.day()?.answered).toBe(2);
      expect(d.day()?.parts && Object.keys(d.day()?.parts ?? {}).sort()).toEqual(['phone', 'tablet']);
      expect(bonusStatus(d.kid.progress, NOW)).toBe('done');
    }
  });

  it('syncing again and again changes nothing (no duplicated time or results)', async () => {
    const { phone, tablet } = await twoDevices();
    phone.playQuest(lessonOrder(5)[0]);
    phone.playBonus(90_000);
    await phone.sync();
    await tablet.sync();
    const snapshot = JSON.stringify(tablet.day());
    for (let i = 0; i < 3; i++) {
      await phone.sync();
      await tablet.sync();
    }
    expect(JSON.stringify(tablet.day())).toBe(snapshot);
    expect(JSON.stringify(phone.day())).toBe(snapshot);
  });

  it('the bonus game never creates or changes Quest Tickets', async () => {
    const { phone, tablet } = await twoDevices();
    phone.playQuest(lessonOrder(5)[0]);
    const tickets = balance(phone.kid.tickets);
    phone.playBonus(BONUS_ALLOWANCE_MS);
    await phone.sync();
    await tablet.sync();
    expect(balance(phone.kid.tickets)).toBe(tickets);
    expect(balance(tablet.kid.tickets)).toBe(tickets);
  });
});
