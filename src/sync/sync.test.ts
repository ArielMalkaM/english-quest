import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DEMO_CHILD_CODE, createDemoHousehold, createInitialHousehold, createInitialState, startProfile } from '../data/seed';
import { addChild, childView, findChild, mergeChildView, removeChild, verifyChildCode } from '../domain/household';
import { setPin, verifyPin } from '../domain/parentAuth';
import { isLessonComplete } from '../domain/progress';
import { completeStep } from '../domain/session';
import { balance, decideRequest, requestReward } from '../domain/tickets';
import type { Household, LearnerProfile, StepId } from '../domain/types';
import { CORE_STEPS } from '../domain/types';
import type { LinkChoice } from './merge';
import { runSyncCycle } from './engine';
import { MemoryRemote } from './memoryRemote';

const NOW = new Date(2026, 10, 17, 17, 0, 0);
const parent = { unlockedAt: NOW.getTime() };

/** One phone / tablet / computer: its own saved household, synced through the shared account. */
class Device {
  constructor(public h: Household, private remote: MemoryRemote) {}
  sync(choice?: LinkChoice) {
    return runSyncCycle({ remote: this.remote, familyId: this.remote.familyId, get: () => this.h, apply: (fn) => (this.h = fn(this.h)), now: () => NOW }, choice);
  }
  child(name: string) {
    const c = this.h.children.find((x) => x.profile.name === name);
    if (!c) throw new Error(`no child ${name} on this device`);
    return c;
  }
  /** Plays one whole quest (all four steps) as that child. */
  play(name: string, lessonId: string, at = NOW) {
    const c = this.child(name);
    const view = CORE_STEPS.reduce(
      (s, step: StepId) =>
        completeStep(s, lessonId, step, [{ activityType: 'choice', skill: 'grammar', seconds: 60, items: [{ key: 'k', firstTry: true, solved: true }] }], at).state,
      childView(this.h, c),
    );
    this.h = mergeChildView(this.h, c.id, view, at);
  }
  balance(name: string) {
    return balance(this.child(name).tickets);
  }
}

const profile = (name: string, grade: LearnerProfile['grade']): LearnerProfile => ({
  name,
  grade,
  avatar: { emoji: '🦊', color: '#fff', gear: '🧭' },
  favoriteTheme: 'Animals',
  dailyGoalMinutes: 15,
  createdAt: NOW.toISOString(),
});

/** A device that finished onboarding with one child and a parent PIN. */
function onboarded(name: string, grade: LearnerProfile['grade'], pin = '1234'): Household {
  const start = startProfile({ ...createInitialState(), settings: DEFAULT_SETTINGS }, profile(name, grade), pin, NOW);
  const h = createInitialHousehold();
  return addChild({ ...h, parent: start.parent, rev: 1, updatedAt: NOW.toISOString() }, { profile: profile(name, grade), code: null, settings: start.settings, record: { tickets: start.tickets } }, null, NOW).household;
}

describe('first sign-in on a device (linking to the family account)', () => {
  it('uploads the first device’s family, then a new device downloads all of it', async () => {
    const remote = new MemoryRemote();
    const pc = new Device(createDemoHousehold(NOW), remote);
    const up = await pc.sync();
    expect(up.kind).toBe('synced');
    expect(remote.children.map((c) => c.profile.name)).toEqual(['Noam', 'Maya']);
    expect(remote.tickets.length).toBe(pc.h.children.reduce((n, c) => n + c.tickets.length, 0));
    expect(remote.family.pin_hash).toBe(pc.h.parent.pinHash);

    const tablet = new Device(createInitialHousehold(), remote);
    expect((await tablet.sync()).kind).toBe('synced');
    for (const name of ['Noam', 'Maya']) {
      const a = pc.child(name);
      const b = tablet.child(name);
      // Same records; the downloaded copy lists them by time instead of creation order.
      const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id));
      expect({ ...b.progress, attempts: byId(b.progress.attempts) }).toEqual({ ...a.progress, attempts: byId(a.progress.attempts) });
      expect(byId(b.tickets)).toEqual(byId(a.tickets));
      expect(byId(b.requests)).toEqual(byId(a.requests));
      expect(balance(b.tickets)).toBe(balance(a.tickets));
      expect(b.profile).toEqual(a.profile);
    }
    expect(verifyPin(tablet.h.parent, '1234')).toBe(true);
    expect(verifyChildCode(tablet.h, tablet.child('Maya').id, DEMO_CHILD_CODE)).toBe(true);
    expect(tablet.h.rewards).toEqual(pc.h.rewards);
  });

  it('asks the parent when both the device and the account already have children', async () => {
    const remote = new MemoryRemote();
    await new Device(createDemoHousehold(NOW), remote).sync();
    const phone = new Device(onboarded('Dana', 5, '9999'), remote);
    const r = await phone.sync();
    expect(r.kind).toBe('needs-choice');
    if (r.kind === 'needs-choice') expect(r.accountChildren.map((c) => c.name)).toEqual(['Noam', 'Maya']);
    expect(phone.h.sync).toBeUndefined(); // nothing changed until the parent decides
  });

  it('“add”: keeps this device’s children next to the account’s, and the account’s PIN wins', async () => {
    const remote = new MemoryRemote();
    await new Device(createDemoHousehold(NOW), remote).sync();
    const phone = new Device(onboarded('Dana', 5, '9999'), remote);
    expect((await phone.sync('add')).kind).toBe('synced');
    expect(phone.h.children.map((c) => c.profile.name).sort()).toEqual(['Dana', 'Maya', 'Noam']);
    expect(remote.children.filter((c) => !c.deleted_at).map((c) => c.profile.name).sort()).toEqual(['Dana', 'Maya', 'Noam']);
    expect(verifyPin(phone.h.parent, '1234')).toBe(true);
    expect(phone.balance('Dana')).toBeGreaterThan(0);
  });

  it('“add” gives a clashing child a new id and its code still works', async () => {
    const remote = new MemoryRemote();
    const first = createDemoHousehold(NOW); // Maya is child-maya with code 1111
    await new Device(first, remote).sync();
    const other = createDemoHousehold(NOW); // a second device with the same ids
    const phone = new Device(other, remote);
    await phone.sync('add');
    const mayas = phone.h.children.filter((c) => c.profile.name === 'Maya');
    expect(mayas).toHaveLength(2);
    expect(new Set(mayas.map((c) => c.id)).size).toBe(2);
    for (const m of mayas) expect(verifyChildCode(phone.h, m.id, DEMO_CHILD_CODE)).toBe(true);
  });

  it('“replace”: this device shows only the account’s children', async () => {
    const remote = new MemoryRemote();
    await new Device(createDemoHousehold(NOW), remote).sync();
    const phone = new Device(onboarded('Dana', 5), remote);
    await phone.sync('replace');
    expect(phone.h.children.map((c) => c.profile.name)).toEqual(['Noam', 'Maya']);
    expect(remote.children.some((c) => c.profile.name === 'Dana')).toBe(false);
  });
});

describe('everyday syncing between devices', () => {
  async function twoDevices() {
    const remote = new MemoryRemote();
    const pc = new Device(createDemoHousehold(NOW), remote);
    await pc.sync();
    const tablet = new Device(createInitialHousehold(), remote);
    await tablet.sync();
    return { remote, pc, tablet };
  }

  it('shows progress made on one device on the other', async () => {
    const { pc, tablet } = await twoDevices();
    const before = tablet.balance('Maya');
    pc.play('Maya', 'g3w1d4');
    await pc.sync();
    await tablet.sync();
    expect(isLessonComplete(tablet.child('Maya').progress, 'g3w1d4')).toBe(true);
    expect(tablet.balance('Maya')).toBe(pc.balance('Maya'));
    expect(tablet.balance('Maya')).toBeGreaterThan(before);
  });

  it('keeps everything when the same child played on two devices before they synced', async () => {
    const { pc, tablet } = await twoDevices();
    const start = pc.balance('Noam');
    pc.play('Noam', 'w2d2');
    const earnedPc = pc.balance('Noam') - start;
    tablet.play('Noam', 'w2d2', new Date(NOW.getTime() + 5000)); // same quest, other device, offline
    const earnedTablet = tablet.balance('Noam') - start;
    await pc.sync();
    expect((await tablet.sync()).kind).toBe('synced'); // merges and sends a newer version
    await pc.sync();
    // Every ticket from both devices is kept, and both devices agree.
    expect(tablet.balance('Noam')).toBe(start + earnedPc + earnedTablet);
    expect(pc.balance('Noam')).toBe(tablet.balance('Noam'));
    expect(pc.child('Noam').progress.attempts.length).toBe(tablet.child('Noam').progress.attempts.length);
    expect(isLessonComplete(pc.child('Noam').progress, 'w2d2')).toBe(true);
    expect(pc.child('Noam').rev).toBe(tablet.child('Noam').rev);
  });

  it('lets two children play on two devices at the same time without overwriting each other', async () => {
    const { pc, tablet } = await twoDevices();
    pc.play('Noam', 'w2d2');
    tablet.play('Maya', 'g3w1d4');
    await pc.sync();
    await tablet.sync();
    await pc.sync();
    for (const d of [pc, tablet]) {
      expect(isLessonComplete(d.child('Noam').progress, 'w2d2')).toBe(true);
      expect(isLessonComplete(d.child('Maya').progress, 'g3w1d4')).toBe(true);
    }
  });

  it('brings a parent’s approval to the child’s device, and never moves a wish back', async () => {
    const { pc, tablet } = await twoDevices();
    const noam = tablet.child('Noam');
    const pending = noam.requests.find((r) => r.status === 'pending')!;
    const approved = decideRequest(childView(tablet.h, noam), pending.id, 'approve', parent, NOW);
    tablet.h = mergeChildView(tablet.h, noam.id, approved, NOW);
    await tablet.sync();
    await pc.sync();
    expect(pc.child('Noam').requests.find((r) => r.id === pending.id)?.status).toBe('approved');
    // The PC still had the old "pending" copy; sending it again must not undo the approval.
    await pc.sync();
    await tablet.sync();
    expect(tablet.child('Noam').requests.find((r) => r.id === pending.id)?.status).toBe('approved');
  });

  it('sends a new wish from the child’s device to the parent’s', async () => {
    const { pc, tablet } = await twoDevices();
    const maya = tablet.child('Maya');
    const view = requestReward(childView(tablet.h, maya), 'rw-dessert', NOW);
    tablet.h = mergeChildView(tablet.h, maya.id, view, NOW);
    await tablet.sync();
    await pc.sync();
    expect(pc.child('Maya').requests.some((r) => r.status === 'pending')).toBe(true);
    expect(pc.balance('Maya')).toBe(tablet.balance('Maya'));
  });

  it('removes a child on every device when the parent removes them on one', async () => {
    const { remote, pc, tablet } = await twoDevices();
    pc.h = removeChild(pc.h, pc.child('Maya').id, parent, NOW);
    await pc.sync();
    expect(pc.h.removedChildren).toEqual([]);
    expect(remote.children.find((c) => c.profile.name === 'Maya')?.deleted_at).toBeTruthy();
    await tablet.sync();
    expect(tablet.h.children.map((c) => c.profile.name)).toEqual(['Noam']);
  });

  it('shares a new child, a changed PIN and edited rewards', async () => {
    const { pc, tablet } = await twoDevices();
    pc.h = addChild(pc.h, { profile: profile('Ori', 2), code: '2468', settings: DEFAULT_SETTINGS }, parent, NOW).household;
    pc.h = { ...pc.h, parent: setPin(pc.h.parent, '7777'), rewards: pc.h.rewards.slice(1), rev: pc.h.rev + 1, updatedAt: NOW.toISOString() };
    await pc.sync();
    await tablet.sync();
    expect(verifyChildCode(tablet.h, tablet.child('Ori').id, '2468')).toBe(true);
    expect(verifyPin(tablet.h.parent, '7777')).toBe(true);
    expect(tablet.h.rewards).toEqual(pc.h.rewards);
  });

  it('keeps working offline and uploads everything once back online', async () => {
    const { remote, pc, tablet } = await twoDevices();
    remote.offline = true;
    pc.play('Noam', 'w2d2');
    const r = await pc.sync();
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.kind).toBe('offline');
    expect(isLessonComplete(pc.child('Noam').progress, 'w2d2')).toBe(true); // still saved on the device
    remote.offline = false;
    expect((await pc.sync()).kind).toBe('synced');
    await tablet.sync();
    expect(tablet.balance('Noam')).toBe(pc.balance('Noam'));
  });

  it('does nothing extra when nothing changed', async () => {
    const { pc, tablet } = await twoDevices();
    const r = await pc.sync();
    expect(r.kind === 'synced' && r.uploaded).toBe(0);
    const t = await tablet.sync(); // just downloaded everything: nothing to send back
    expect(t.kind === 'synced' && t.uploaded).toBe(0);
    const again = await pc.sync();
    expect(again.kind === 'synced' && again.uploaded).toBe(0);
  });

  it('downloads only what changed after the first sync', async () => {
    const { pc, tablet } = await twoDevices();
    await tablet.sync();
    pc.play('Maya', 'g3w1d4');
    await pc.sync();
    const r = await tablet.sync();
    // Rows from the last few seconds are re-read on purpose; the bulk of history is not.
    expect(r.kind === 'synced' && r.downloaded).toBeLessThan(60);
    expect(findChild(tablet.h, tablet.child('Maya').id)).toBeTruthy();
  });
});
