// Pure merge rules between this device's Household and the family account.
//
// - Tickets and activity attempts are history: lists from all devices are combined by id,
//   so nothing earned on any device is ever lost.
// - Wishes are combined by id; a status only moves forward (pending → approved/declined → fulfilled).
// - A child's profile, settings and progress carry a version (rev). Compared with the version
//   both sides had at the last sync: if only one side changed, it wins; if both changed (the same
//   child played on two devices before they synced), progress is merged (completed quests,
//   sessions, badges combined; word and skill counters take the larger value) and the newer
//   profile/settings win.
// - The shared part (parent PIN, rewards) follows the same rule with the household rev.
import { mergeBonusDays } from '../domain/bonusGame';
import { newId } from '../domain/ids';
import type { ActivityAttempt, ChildRecord, Household, Progress, RewardRequest, SyncState, SyncTable, Tally, TicketTransaction } from '../domain/types';
import type { ChildRow, PushBatch, RemoteSnapshot } from './rows';
import {
  attemptToRow,
  childToRow,
  familyToRow,
  laterIso,
  requestChangedAt,
  requestToRow,
  rowToAttempt,
  rowToRequest,
  rowToTicket,
  statusRank,
  ticketToRow,
  time,
} from './rows';

/** Records newer than pushedUntil minus this margin are (re)sent; the server ignores duplicates. */
const PUSH_MARGIN_MS = 2 * 60 * 1000;

export function freshSync(familyId: string): SyncState {
  return { familyId, cursors: {}, familyRev: 0, childRev: {}, pushedUntil: {}, lastSyncAt: null };
}

// ───────────────────────── Linking a device to the account (first sign-in) ─────────────────────────

/**
 * What to do when a device signs in to a family account it is not linked to yet.
 * - download: this device has no children → take the account's family.
 * - upload: the account has no children yet → this device's family becomes the account's.
 * - ask: both have children → the parent chooses (add this device's children, or use the account's only).
 */
export type LinkPlan = 'synced' | 'download' | 'upload' | 'ask';
export type LinkChoice = 'download' | 'upload' | 'add' | 'replace';

export function linkPlan(h: Household, familyId: string, remoteChildren: number): LinkPlan {
  if (h.sync?.familyId === familyId) return 'synced';
  if (h.children.length === 0) return 'download';
  if (remoteChildren === 0) return 'upload';
  return 'ask';
}

export function startLink(h: Household, familyId: string, choice: LinkChoice, remoteChildIds: string[] = []): Household {
  const sync = freshSync(familyId);
  if (choice === 'download' || choice === 'replace') {
    // The account's family replaces this device's (rev 0 lets every account value win).
    return { ...h, children: [], removedChildren: [], rev: 0, sync };
  }
  if (choice === 'upload') return { ...h, removedChildren: [], sync };
  // add: keep this device's children next to the account's; the account's PIN and rewards win.
  const taken = new Set(remoteChildIds);
  const children = h.children.map((c) => {
    if (!taken.has(c.id)) return c;
    let id = newId('child');
    while (taken.has(id)) id = newId('child');
    return { ...c, id, codeKey: c.codeKey ?? c.id };
  });
  return { ...h, children, removedChildren: [], rev: 0, sync };
}

// ───────────────────────── Pull: apply what changed on the account ─────────────────────────

function byTime<T>(get: (x: T) => string) {
  return (a: T, b: T) => time(get(a)) - time(get(b));
}

function unionById<T extends { id: string }>(local: T[], incoming: T[], order: (a: T, b: T) => number): T[] {
  if (incoming.length === 0) return local;
  const seen = new Set(local.map((x) => x.id));
  const added = incoming.filter((x) => !seen.has(x.id) && (seen.add(x.id), true));
  return added.length === 0 ? local : [...local, ...added].sort(order);
}

function mergeRequests(local: RewardRequest[], incoming: RewardRequest[]): RewardRequest[] {
  if (incoming.length === 0) return local;
  const map = new Map(local.map((r) => [r.id, r]));
  let changed = false;
  for (const r of incoming) {
    const mine = map.get(r.id);
    if (!mine || statusRank(r.status) > statusRank(mine.status)) {
      map.set(r.id, r);
      changed = true;
    }
  }
  return changed ? [...map.values()].sort(byTime((r) => r.requestedAt)) : local;
}

function maxTally<T extends Tally>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || v.seen > out[k].seen) out[k] = v;
  return out;
}

/** Both devices changed the same child: combine instead of picking one. */
export function mergeProgress(win: Progress, other: Progress): Progress {
  const steps: Progress['steps'] = { ...win.steps };
  for (const [lesson, list] of Object.entries(other.steps)) {
    const mine = steps[lesson] ?? [];
    steps[lesson] = [...mine, ...list.filter((s) => !mine.includes(s))];
  }
  const sessions = new Map<string, Progress['sessions'][number]>();
  for (const s of [...win.sessions, ...other.sessions]) {
    const seen = sessions.get(s.lessonId);
    if (!seen || time(s.completedAt) < time(seen.completedAt)) sessions.set(s.lessonId, s);
  }
  const badges = new Map<string, Progress['badges'][number]>();
  for (const b of [...win.badges, ...other.badges]) {
    const seen = badges.get(b.id);
    if (!seen || time(b.at) < time(seen.at)) badges.set(b.id, b);
  }
  const review = new Map(other.reviewQueue.map((r) => [r.key, r]));
  for (const r of win.reviewQueue) review.set(r.key, r);
  const zonePoints = { ...win.zonePoints };
  for (const z of Object.keys(zonePoints) as (keyof Progress['zonePoints'])[]) zonePoints[z] = Math.max(zonePoints[z], other.zonePoints[z] ?? 0);
  return {
    ...win,
    steps,
    sessions: [...sessions.values()].sort(byTime((s) => s.completedAt)),
    badges: [...badges.values()].sort(byTime((b) => b.at)),
    wordStats: maxTally(win.wordStats, other.wordStats),
    skillStats: maxTally(win.skillStats as Record<string, Tally>, other.skillStats as Record<string, Tally>),
    grammarStats: maxTally(win.grammarStats, other.grammarStats),
    reviewQueue: [...review.values()],
    zonePoints,
    tryAgainDays: [...new Set([...win.tryAgainDays, ...other.tryAgainDays])].sort(),
    streakMilestones: [...new Set([...win.streakMilestones, ...other.streakMilestones])].sort((a, b) => a - b),
    attempts: unionById(win.attempts, other.attempts, byTime((a) => a.finishedAt)),
    // Bonus game time and results only move forward, so playing on two devices never adds time.
    ...(win.bonusDays || other.bonusDays ? { bonusDays: mergeBonusDays(win.bonusDays, other.bonusDays) } : {}),
  };
}

function childFromRow(row: ChildRow): ChildRecord {
  return {
    id: row.id,
    codeHash: row.code_hash,
    ...(row.code_key ? { codeKey: row.code_key } : {}),
    profile: row.profile,
    settings: row.settings,
    progress: { ...row.progress, attempts: [] },
    tickets: [],
    requests: [],
    rev: row.rev,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function newestRecord(c: ChildRecord): string | undefined {
  let best: string | undefined;
  for (const t of c.tickets) best = laterIso(best, t.at);
  for (const a of c.progress.attempts) best = laterIso(best, a.finishedAt);
  for (const r of c.requests) best = laterIso(best, requestChangedAt(r));
  return best;
}

export function applyRemote(h: Household, snap: RemoteSnapshot): Household {
  const sync = h.sync;
  if (!sync) return h;
  let next: Household = h;
  const childRev = { ...sync.childRev };
  const pushedUntil = { ...sync.pushedUntil };
  let familyRev = sync.familyRev;

  // Shared part.
  const f = snap.family;
  if (f && f.rev > sync.familyRev) {
    const localChanged = h.rev > sync.familyRev;
    const remoteWins = !localChanged || time(f.updated_at) >= time(h.updatedAt);
    if (remoteWins) {
      next = {
        ...next,
        parent: { pinHash: f.pin_hash ?? (localChanged ? h.parent.pinHash : null), salt: f.pin_salt ?? h.parent.salt },
        rewards: f.rewards,
        rev: localChanged ? Math.max(h.rev, f.rev) + 1 : f.rev,
        updatedAt: new Date(f.updated_at).toISOString(),
      };
    } else {
      next = { ...next, rev: Math.max(h.rev, f.rev) + 1 };
    }
    if (!localChanged) familyRev = f.rev;
  }

  // Children.
  const removedHere = new Set((h.removedChildren ?? []).map((r) => r.id));
  let children = [...next.children];
  const created = new Set<string>();
  for (const row of snap.children) {
    const i = children.findIndex((c) => c.id === row.id);
    if (row.deleted_at) {
      if (i >= 0) children.splice(i, 1);
      delete childRev[row.id];
      delete pushedUntil[row.id];
      continue;
    }
    if (removedHere.has(row.id)) continue;
    if (i < 0) {
      children.push(childFromRow(row));
      childRev[row.id] = row.rev;
      created.add(row.id);
      continue;
    }
    const local = children[i];
    const base = sync.childRev[row.id] ?? 0;
    if (row.rev <= base) continue; // account has nothing new for this child
    const remote = childFromRow(row);
    if (local.rev <= base) {
      // Only the account changed: take it (keep this device's history lists; they are combined below).
      children[i] = { ...remote, progress: { ...remote.progress, attempts: local.progress.attempts }, tickets: local.tickets, requests: local.requests };
      childRev[row.id] = row.rev;
    } else {
      // Both changed: merge, and give the result a new version so it is sent back.
      const remoteNewer = time(remote.updatedAt) > time(local.updatedAt);
      const [win, other] = remoteNewer ? [remote, local] : [local, remote];
      children[i] = {
        ...local,
        profile: win.profile,
        settings: win.settings,
        codeHash: win.codeHash,
        codeKey: win.codeKey,
        progress: mergeProgress({ ...win.progress, attempts: local.progress.attempts }, { ...other.progress, attempts: [] }),
        rev: Math.max(local.rev, row.rev) + 1,
        updatedAt: laterIso(local.updatedAt, remote.updatedAt) as string,
      };
    }
  }

  // History lists.
  const group = <T extends { child_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.child_id, [...(m.get(r.child_id) ?? []), r]);
    return m;
  };
  const tickets = group(snap.tickets);
  const attempts = group(snap.attempts);
  const requests = group(snap.requests);
  children = children.map((c) => {
    const t = tickets.get(c.id);
    const a = attempts.get(c.id);
    const r = requests.get(c.id);
    if (!t && !a && !r) return c;
    const merged: ChildRecord = {
      ...c,
      tickets: t ? unionById<TicketTransaction>(c.tickets, t.map(rowToTicket), byTime((x) => x.at)) : c.tickets,
      progress: a ? { ...c.progress, attempts: unionById<ActivityAttempt>(c.progress.attempts, a.map(rowToAttempt), byTime((x) => x.finishedAt)) } : c.progress,
      requests: r ? mergeRequests(c.requests, r.map(rowToRequest)) : c.requests,
    };
    return merged;
  });
  // A child that just arrived from the account is already up there in full.
  for (const c of children) {
    if (created.has(c.id)) {
      const newest = newestRecord(c);
      if (newest) pushedUntil[c.id] = newest;
    }
  }

  const cursors = { ...sync.cursors };
  for (const [table, value] of Object.entries(snap.cursors) as [SyncTable, string][]) cursors[table] = laterIso(cursors[table], value);

  return { ...next, children, sync: { ...sync, familyRev, childRev, pushedUntil, cursors } };
}

// ───────────────────────── Push: what this device still has to send ─────────────────────────

export interface PushMarks {
  familyRev: number | null;
  childRev: Record<string, number>;
  pushedUntil: Record<string, string>;
  pushedRecent: Record<string, string[]>;
  removed: string[];
}

export function collectPush(h: Household): { batch: PushBatch; marks: PushMarks } {
  const sync = h.sync;
  const batch: PushBatch = { family: null, children: [], removed: [], tickets: [], attempts: [], requests: [] };
  const marks: PushMarks = { familyRev: null, childRev: {}, pushedUntil: {}, pushedRecent: {}, removed: [] };
  if (!sync) return { batch, marks };
  const fid = sync.familyId;

  if (h.rev > sync.familyRev) {
    batch.family = familyToRow(h);
    marks.familyRev = h.rev;
  }
  for (const c of h.children) {
    if (c.rev > (sync.childRev[c.id] ?? 0)) {
      batch.children.push(childToRow(fid, c));
      marks.childRev[c.id] = c.rev;
    }
    // Records newer than the last upload, minus a safety margin for clock adjustments;
    // records inside the margin that were already sent are skipped by id.
    const since = sync.pushedUntil[c.id] ? time(sync.pushedUntil[c.id]) - PUSH_MARGIN_MS : -Infinity;
    const sent = new Set(sync.pushedRecent?.[c.id] ?? []);
    const fresh = (id: string, at: string) => time(at) > since && !sent.has(`${id}@${at}`);
    for (const t of c.tickets) if (fresh(t.id, t.at)) batch.tickets.push(ticketToRow(fid, c.id, t));
    for (const a of c.progress.attempts) if (fresh(a.id, a.finishedAt)) batch.attempts.push(attemptToRow(fid, c.id, a));
    for (const r of c.requests) if (fresh(r.id, requestChangedAt(r))) batch.requests.push(requestToRow(fid, c.id, r));
    const newest = laterIso(sync.pushedUntil[c.id], newestRecord(c));
    if (newest) {
      marks.pushedUntil[c.id] = newest;
      const edge = time(newest) - PUSH_MARGIN_MS;
      marks.pushedRecent[c.id] = [
        ...c.tickets.filter((t) => time(t.at) > edge).map((t) => `${t.id}@${t.at}`),
        ...c.progress.attempts.filter((a) => time(a.finishedAt) > edge).map((a) => `${a.id}@${a.finishedAt}`),
        ...c.requests.filter((r) => time(requestChangedAt(r)) > edge).map((r) => `${r.id}@${requestChangedAt(r)}`),
      ];
    }
  }
  for (const r of h.removedChildren ?? []) {
    batch.removed.push(r);
    marks.removed.push(r.id);
  }
  return { batch, marks };
}

/** After a successful upload: remember what the account now has. */
export function markPushed(h: Household, marks: PushMarks, now: Date): Household {
  const sync = h.sync;
  if (!sync) return h;
  const removed = new Set(marks.removed);
  const childRev = { ...sync.childRev, ...marks.childRev };
  for (const id of removed) delete childRev[id];
  return {
    ...h,
    removedChildren: (h.removedChildren ?? []).filter((r) => !removed.has(r.id)),
    sync: {
      ...sync,
      familyRev: marks.familyRev ?? sync.familyRev,
      childRev,
      pushedUntil: { ...sync.pushedUntil, ...marks.pushedUntil },
      pushedRecent: { ...sync.pushedRecent, ...marks.pushedRecent },
      lastSyncAt: now.toISOString(),
    },
  };
}
