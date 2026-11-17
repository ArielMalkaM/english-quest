// Database row shapes (see supabase/schema.sql + migrations) and conversions to/from app data.
import type {
  ActivityAttempt,
  ChildRecord,
  Household,
  LearnerProfile,
  Progress,
  Reward,
  RewardRequest,
  Settings,
  SyncTable,
  TicketTransaction,
} from '../domain/types';

export interface FamilyRow {
  id: string;
  pin_hash: string | null;
  pin_salt: string | null;
  rewards: Reward[];
  ui_lang: string;
  rev: number;
  updated_at: string;
  synced_at?: string;
}

/** A child's progress as stored on the server: everything except the attempts list (own table). */
export type StoredProgress = Omit<Progress, 'attempts'>;

export interface ChildRow {
  family_id: string;
  id: string;
  profile: LearnerProfile;
  settings: Settings;
  code_hash: string | null;
  code_key: string | null;
  progress: StoredProgress;
  rev: number;
  updated_at: string;
  deleted_at: string | null;
  synced_at?: string;
}

export interface TicketRow {
  family_id: string;
  child_id: string;
  id: string;
  at: string;
  amount: number;
  reason: TicketTransaction['reason'];
  note: string;
  request_id: string | null;
  lesson_id: string | null;
  synced_at?: string;
}

export interface AttemptRow {
  family_id: string;
  child_id: string;
  id: string;
  lesson_id: string;
  step: string;
  finished_at: string;
  data: Omit<ActivityAttempt, 'id' | 'lessonId' | 'step' | 'finishedAt'>;
  synced_at?: string;
}

export interface RequestRow {
  family_id: string;
  child_id: string;
  id: string;
  status: RewardRequest['status'];
  data: RewardRequest;
  updated_at: string;
  synced_at?: string;
}

/** Rows changed since the cursors, plus the new cursors. */
export interface RemoteSnapshot {
  family: FamilyRow | null;
  children: ChildRow[];
  tickets: TicketRow[];
  attempts: AttemptRow[];
  requests: RequestRow[];
  cursors: Partial<Record<SyncTable, string>>;
}

export interface PushBatch {
  family: Omit<FamilyRow, 'id' | 'synced_at'> | null;
  children: ChildRow[];
  removed: { id: string; at: string }[];
  tickets: TicketRow[];
  attempts: AttemptRow[];
  requests: RequestRow[];
}

export const emptyBatch = (b: PushBatch) =>
  !b.family && b.children.length + b.removed.length + b.tickets.length + b.attempts.length + b.requests.length === 0;

// ───────────────────────── App → rows ─────────────────────────

export function familyToRow(h: Household): Omit<FamilyRow, 'id' | 'synced_at'> {
  return { pin_hash: h.parent.pinHash, pin_salt: h.parent.salt, rewards: h.rewards, ui_lang: h.uiLang, rev: h.rev, updated_at: h.updatedAt };
}

export function storedProgress(p: Progress): StoredProgress {
  const { attempts: _attempts, ...rest } = p;
  void _attempts;
  return rest;
}

export function childToRow(familyId: string, c: ChildRecord): ChildRow {
  return {
    family_id: familyId,
    id: c.id,
    profile: c.profile,
    settings: c.settings,
    code_hash: c.codeHash,
    code_key: c.codeKey ?? null,
    progress: storedProgress(c.progress),
    rev: c.rev,
    updated_at: c.updatedAt,
    deleted_at: null,
  };
}

export const ticketToRow = (familyId: string, childId: string, t: TicketTransaction): TicketRow => ({
  family_id: familyId,
  child_id: childId,
  id: t.id,
  at: t.at,
  amount: t.amount,
  reason: t.reason,
  note: t.note,
  request_id: t.requestId ?? null,
  lesson_id: t.lessonId ?? null,
});

export function attemptToRow(familyId: string, childId: string, a: ActivityAttempt): AttemptRow {
  const { id, lessonId, step, finishedAt, ...data } = a;
  return { family_id: familyId, child_id: childId, id, lesson_id: lessonId, step, finished_at: finishedAt, data };
}

export const requestToRow = (familyId: string, childId: string, r: RewardRequest): RequestRow => ({
  family_id: familyId,
  child_id: childId,
  id: r.id,
  status: r.status,
  data: r,
  updated_at: requestChangedAt(r),
});

// ───────────────────────── Rows → app ─────────────────────────

export function rowToTicket(r: TicketRow): TicketTransaction {
  return {
    id: r.id,
    at: new Date(r.at).toISOString(),
    amount: r.amount,
    reason: r.reason,
    note: r.note,
    ...(r.request_id ? { requestId: r.request_id } : {}),
    ...(r.lesson_id ? { lessonId: r.lesson_id } : {}),
  };
}

export function rowToAttempt(r: AttemptRow): ActivityAttempt {
  return { ...r.data, id: r.id, lessonId: r.lesson_id, step: r.step as ActivityAttempt['step'], finishedAt: new Date(r.finished_at).toISOString() };
}

export const rowToRequest = (r: RequestRow): RewardRequest => ({ ...r.data, status: r.status });

// ───────────────────────── Helpers ─────────────────────────

export function requestChangedAt(r: RewardRequest): string {
  return [r.requestedAt, r.decidedAt, r.fulfilledAt].filter((x): x is string => Boolean(x)).sort().at(-1) ?? r.requestedAt;
}

/** Wish statuses only move forward: pending → approved / declined → fulfilled. */
export function statusRank(s: RewardRequest['status']): number {
  return s === 'pending' ? 0 : s === 'fulfilled' ? 2 : 1;
}

export const time = (iso: string | undefined | null) => (iso ? Date.parse(iso) : 0);

export function laterIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return time(b) > time(a) ? b : a;
}
