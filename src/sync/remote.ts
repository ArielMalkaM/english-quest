import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { SyncTable } from '../domain/types';
import type { AttemptRow, ChildRow, FamilyRow, PushBatch, RemoteSnapshot, RequestRow, TicketRow } from './rows';
import { laterIso } from './rows';

/** The family account as the sync engine sees it. */
export interface RemoteApi {
  /** Children that are not removed (used when a device first links to the account). */
  listChildren(familyId: string): Promise<{ id: string; name: string }[]>;
  /** Rows written since the cursors (all rows when a cursor is missing). */
  pull(familyId: string, since: Partial<Record<SyncTable, string>>): Promise<RemoteSnapshot>;
  push(familyId: string, batch: PushBatch): Promise<void>;
}

export class SyncError extends Error {
  constructor(
    public kind: 'offline' | 'needs-migration' | 'conflict' | 'denied' | 'server',
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/** Rows written at almost the same moment can commit out of order; re-reading a few seconds is cheap (merging is idempotent). */
const OVERLAP_MS = 15_000;
const PAGE = 1000;
const CHUNK = 500;

function toSyncError(e: PostgrestError | Error | unknown): SyncError {
  if (e instanceof SyncError) return e;
  const err = e as Partial<PostgrestError> & { message?: string };
  const msg = err.message ?? String(e);
  // A missing sync column (migration not run) or a stale API schema cache right after running it.
  // Only these count: other errors can mention the trigger names (eq_touch_synced_at…) too.
  if (err.code === 'PGRST204' || /column .*(synced_at|code_key).*(does not exist|not find)|schema cache/i.test(msg)) {
    return new SyncError('needs-migration', `${err.code ?? ''} ${msg}`.trim());
  }
  if (msg.includes('stale_rev')) return new SyncError('conflict', msg);
  if (err.code === '42501' || err.code === 'PGRST301') return new SyncError('denied', msg);
  if (/fetch|network|Failed to fetch|NetworkError|Load failed/i.test(msg)) return new SyncError('offline', msg);
  return new SyncError('server', msg);
}

function sinceFilter(cursor: string | undefined): string | null {
  return cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
}

export class SupabaseRemote implements RemoteApi {
  constructor(private db: SupabaseClient) {}

  async listChildren(familyId: string) {
    const { data, error } = await this.db.from('children').select('id, profile').eq('family_id', familyId).is('deleted_at', null);
    if (error) throw toSyncError(error);
    return ((data ?? []) as Pick<ChildRow, 'id' | 'profile'>[]).map((r) => ({ id: r.id, name: r.profile?.name ?? '' }));
  }

  private async pullTable<T extends { synced_at?: string }>(table: SyncTable, familyId: string, cursor: string | undefined): Promise<T[]> {
    const out: T[] = [];
    const from = sinceFilter(cursor);
    for (let page = 0; ; page++) {
      let q = this.db.from(table).select('*').eq(table === 'families' ? 'id' : 'family_id', familyId);
      if (from) q = q.gt('synced_at', from);
      const { data, error } = await q.order('synced_at', { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw toSyncError(error);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  async pull(familyId: string, since: Partial<Record<SyncTable, string>>): Promise<RemoteSnapshot> {
    try {
      const [families, children, tickets, attempts, requests] = await Promise.all([
        this.pullTable<FamilyRow>('families', familyId, since.families),
        this.pullTable<ChildRow>('children', familyId, since.children),
        this.pullTable<TicketRow>('ticket_transactions', familyId, since.ticket_transactions),
        this.pullTable<AttemptRow>('attempts', familyId, since.attempts),
        this.pullTable<RequestRow>('reward_requests', familyId, since.reward_requests),
      ]);
      const newest = (rows: { synced_at?: string }[], prev: string | undefined) => rows.reduce<string | undefined>((m, r) => laterIso(m, r.synced_at), prev);
      return {
        family: families[0] ?? null,
        children,
        tickets,
        attempts,
        requests,
        cursors: {
          families: newest(families, since.families),
          children: newest(children, since.children),
          ticket_transactions: newest(tickets, since.ticket_transactions),
          attempts: newest(attempts, since.attempts),
          reward_requests: newest(requests, since.reward_requests),
        },
      };
    } catch (e) {
      throw toSyncError(e);
    }
  }

  async push(familyId: string, b: PushBatch): Promise<void> {
    try {
      const check = (r: { error: PostgrestError | null }) => {
        if (r.error) throw toSyncError(r.error);
      };
      const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, i * CHUNK + CHUNK));
      if (b.family) check(await this.db.from('families').update(b.family).eq('id', familyId));
      // Children first: tickets, attempts and wishes point to them.
      for (const part of chunks(b.children)) check(await this.db.from('children').upsert(part, { onConflict: 'family_id,id' }));
      for (const r of b.removed) check(await this.db.from('children').update({ deleted_at: r.at }).eq('family_id', familyId).eq('id', r.id));
      for (const part of chunks(b.tickets)) check(await this.db.from('ticket_transactions').upsert(part, { onConflict: 'family_id,child_id,id', ignoreDuplicates: true }));
      for (const part of chunks(b.attempts)) check(await this.db.from('attempts').upsert(part, { onConflict: 'family_id,child_id,id', ignoreDuplicates: true }));
      for (const part of chunks(b.requests)) check(await this.db.from('reward_requests').upsert(part, { onConflict: 'family_id,child_id,id' }));
    } catch (e) {
      throw toSyncError(e);
    }
  }
}
