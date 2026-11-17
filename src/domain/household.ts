import { newId } from './ids';
import { assertParent, hashPin, isValidPin } from './parentAuth';
import { emptyProgress, gradeOf } from './progress';
import type { AppState, ChildRecord, Grade, Household, LearnerProfile, ParentSession, Settings } from './types';
import { GRADES } from './types';

/**
 * Several children on one device. Each child keeps their own progress, tickets,
 * requests and settings; the parent PIN and the reward catalogue are shared.
 * Domain functions keep working on a single-child AppState "view" (childView) and
 * the result is written back with mergeChildView.
 */

/** 2 = several children; 3 = per-child rev/updatedAt and random record ids. */
export const HOUSEHOLD_VERSION = 3;

export class HouseholdError extends Error {
  constructor(
    public code: 'not-found' | 'invalid' | 'last-child',
    message: string,
  ) {
    super(message);
    this.name = 'HouseholdError';
  }
}

export { gradeOf };

export function isGrade(n: unknown): n is Grade {
  return GRADES.includes(n as Grade);
}

export function findChild(h: Household, id: string | null): ChildRecord | null {
  return (id && h.children.find((c) => c.id === id)) || null;
}

/** The single-learner view the rest of the app works with. */
export function childView(h: Household, child: ChildRecord): AppState {
  return {
    version: h.version,
    profile: child.profile,
    parent: h.parent,
    settings: child.settings,
    progress: child.progress,
    tickets: child.tickets,
    rewards: h.rewards,
    requests: child.requests,
  };
}

/** Marks a child as changed (next rev, new timestamp). */
export function touchChild(child: ChildRecord, now: Date): ChildRecord {
  return { ...child, rev: (child.rev ?? 0) + 1, updatedAt: now.toISOString() };
}

/** Marks the shared part (parent PIN, rewards, language) as changed. */
export function touchShared(h: Household, now: Date): Household {
  return { ...h, rev: (h.rev ?? 0) + 1, updatedAt: now.toISOString() };
}

/** Writes a changed view back: child data to the child, shared data to the household. */
export function mergeChildView(h: Household, childId: string, view: AppState, now: Date = new Date()): Household {
  const sharedChanged = view.parent !== h.parent || view.rewards !== h.rewards;
  const base = sharedChanged ? touchShared({ ...h, parent: view.parent, rewards: view.rewards }, now) : h;
  return {
    ...base,
    children: h.children.map((c) =>
      c.id === childId
        ? touchChild(
            {
              ...c,
              profile: view.profile ?? c.profile,
              settings: view.settings,
              progress: view.progress,
              tickets: view.tickets,
              requests: view.requests,
            },
            now,
          )
        : c,
    ),
  };
}

function codeSalt(h: Household, childId: string): string {
  return `${h.parent.salt}:${childId}`;
}

export function hashChildCode(h: Household, childId: string, code: string): string {
  return hashPin(code, codeSalt(h, childId));
}

/** True when the child has no code, or the code matches. */
export function verifyChildCode(h: Household, childId: string, code: string): boolean {
  const child = findChild(h, childId);
  if (!child) return false;
  if (child.codeHash === null) return true;
  return child.codeHash === hashChildCode(h, childId, code);
}

export function newChildId(h: Household): string {
  let id = newId('child');
  while (h.children.some((c) => c.id === id)) id = newId('child');
  return id;
}

function cleanProfile(profile: LearnerProfile): LearnerProfile {
  const name = profile.name.trim().slice(0, 20);
  if (!name) throw new HouseholdError('invalid', 'A child needs a nickname');
  if (!isGrade(profile.grade)) throw new HouseholdError('invalid', 'Grade must be 2–6');
  return { ...profile, name };
}

/**
 * Adds a child. Requires a parent session unless this is the very first child
 * (onboarding), so a child cannot create extra profiles.
 */
export function addChild(
  h: Household,
  input: { profile: LearnerProfile; code: string | null; settings: Settings; record?: Partial<ChildRecord> },
  session: ParentSession | null,
  now: Date,
): { household: Household; id: string } {
  if (h.children.length > 0) assertParent(session, now);
  if (input.code !== null && !isValidPin(input.code)) throw new HouseholdError('invalid', 'The code must be 4 digits');
  const id = newChildId(h);
  const child: ChildRecord = {
    id,
    codeHash: null,
    progress: emptyProgress(),
    tickets: [],
    requests: [],
    ...input.record,
    profile: cleanProfile(input.profile),
    settings: input.settings,
    rev: 1,
    updatedAt: now.toISOString(),
  };
  child.codeHash = input.code ? hashChildCode(h, id, input.code) : null;
  return { household: { ...h, children: [...h.children, child] }, id };
}

/** Parent-only: edit a child's profile (name, grade, avatar…) and/or sign-in code. */
export function updateChild(
  h: Household,
  childId: string,
  patch: { profile?: Partial<LearnerProfile>; code?: string | null },
  session: ParentSession | null,
  now: Date,
): Household {
  assertParent(session, now);
  const child = findChild(h, childId);
  if (!child) throw new HouseholdError('not-found', 'Child not found');
  if (patch.code !== undefined && patch.code !== null && !isValidPin(patch.code)) {
    throw new HouseholdError('invalid', 'The code must be 4 digits');
  }
  const next: ChildRecord = touchChild({
    ...child,
    profile: patch.profile ? cleanProfile({ ...child.profile, ...patch.profile }) : child.profile,
    codeHash: patch.code === undefined ? child.codeHash : patch.code === null ? null : hashChildCode(h, childId, patch.code),
  }, now);
  return { ...h, children: h.children.map((c) => (c.id === childId ? next : c)) };
}

/** Parent-only: remove a child and all of their progress. The last child cannot be removed (use reset). */
export function removeChild(h: Household, childId: string, session: ParentSession | null, now: Date): Household {
  assertParent(session, now);
  if (!findChild(h, childId)) throw new HouseholdError('not-found', 'Child not found');
  if (h.children.length <= 1) throw new HouseholdError('last-child', 'Use “Reset everything” to remove the last child');
  return { ...h, children: h.children.filter((c) => c.id !== childId) };
}

/** Builds a household around one existing learner, keeping all of their progress. */
export function householdFromState(state: AppState, childId: string, now: Date): Household {
  if (!state.profile) throw new HouseholdError('invalid', 'State has no learner');
  const updatedAt = now.toISOString();
  return {
    version: HOUSEHOLD_VERSION,
    parent: state.parent,
    rewards: state.rewards,
    rev: 1,
    updatedAt,
    uiLang: state.settings.uiLang,
    children: [
      {
        id: childId,
        codeHash: null,
        profile: { ...state.profile, grade: isGrade(state.profile.grade) ? state.profile.grade : 6 },
        settings: state.settings,
        progress: state.progress,
        tickets: state.tickets,
        requests: state.requests,
        rev: 1,
        updatedAt,
      },
    ],
  };
}

/** Upgrades a version-2 household (no rev/updatedAt yet). Existing record ids are kept. */
export function upgradeHousehold(h: Household, now: Date): Household {
  const updatedAt = now.toISOString();
  return {
    ...h,
    version: HOUSEHOLD_VERSION,
    rev: h.rev ?? 1,
    updatedAt: h.updatedAt ?? updatedAt,
    children: h.children.map((c) => ({ ...c, rev: c.rev ?? 1, updatedAt: c.updatedAt ?? updatedAt })),
  };
}
