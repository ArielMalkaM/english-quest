// In-memory stand-in for the Supabase tables, with the same rules as the SQL triggers
// (server time on every write, versions must grow, wish status only moves forward,
// history rows are never overwritten). Used by the sync tests to simulate several devices.
import type { SyncTable } from '../domain/types';
import type { AttemptRow, ChildRow, FamilyRow, PushBatch, RemoteSnapshot, RequestRow, TicketRow } from './rows';
import { statusRank } from './rows';
import type { RemoteApi } from './remote';
import { SyncError } from './remote';

export class MemoryRemote implements RemoteApi {
  family: FamilyRow;
  children: ChildRow[] = [];
  tickets: TicketRow[] = [];
  attempts: AttemptRow[] = [];
  requests: RequestRow[] = [];
  /** Set to make every call fail as if the device were offline. */
  offline = false;
  private clock = Date.UTC(2026, 10, 17, 8, 0, 0);

  constructor(public familyId = 'fam-1') {
    this.family = { id: familyId, pin_hash: null, pin_salt: null, rewards: [], ui_lang: 'he', rev: 0, updated_at: new Date(0).toISOString(), synced_at: this.tick() };
  }

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private guard() {
    if (this.offline) throw new SyncError('offline', 'Failed to fetch');
  }

  async listChildren(familyId: string) {
    this.guard();
    return this.children.filter((c) => c.family_id === familyId && !c.deleted_at).map((c) => ({ id: c.id, name: c.profile.name }));
  }

  async pull(familyId: string, since: Partial<Record<SyncTable, string>>): Promise<RemoteSnapshot> {
    this.guard();
    const after = <T extends { synced_at?: string }>(rows: T[], c: string | undefined) => rows.filter((r) => !c || Date.parse(r.synced_at!) > Date.parse(c) - 15_000).map((r) => structuredClone(r));
    const newest = (rows: { synced_at?: string }[], prev: string | undefined) => rows.reduce<string | undefined>((m, r) => (!m || Date.parse(r.synced_at!) > Date.parse(m) ? r.synced_at : m), prev);
    const family = after([this.family], since.families);
    const own = <T extends { family_id: string }>(rows: T[]) => rows.filter((r) => r.family_id === familyId);
    const children = after(own(this.children), since.children);
    const tickets = after(own(this.tickets), since.ticket_transactions);
    const attempts = after(own(this.attempts), since.attempts);
    const requests = after(own(this.requests), since.reward_requests);
    return {
      family: family[0] ?? null,
      children,
      tickets,
      attempts,
      requests,
      cursors: {
        families: newest(family, since.families),
        children: newest(children, since.children),
        ticket_transactions: newest(tickets, since.ticket_transactions),
        attempts: newest(attempts, since.attempts),
        reward_requests: newest(requests, since.reward_requests),
      },
    };
  }

  async push(familyId: string, b: PushBatch): Promise<void> {
    this.guard();
    if (b.family) {
      if (b.family.rev <= this.family.rev) throw new SyncError('conflict', 'stale_rev');
      this.family = { ...this.family, ...structuredClone(b.family), synced_at: this.tick() };
    }
    for (const row of b.children) {
      const i = this.children.findIndex((c) => c.family_id === familyId && c.id === row.id);
      if (i >= 0 && row.rev <= this.children[i].rev) throw new SyncError('conflict', 'stale_rev');
      const next = { ...structuredClone(row), synced_at: this.tick() };
      if (i >= 0) this.children[i] = next;
      else this.children.push(next);
    }
    for (const r of b.removed) {
      const c = this.children.find((x) => x.family_id === familyId && x.id === r.id);
      if (c) Object.assign(c, { deleted_at: r.at, synced_at: this.tick() });
    }
    const insertNew = <T extends { family_id: string; child_id: string; id: string; synced_at?: string }>(table: T[], rows: T[]) => {
      for (const row of rows) {
        if (!this.children.some((c) => c.family_id === row.family_id && c.id === row.child_id)) throw new SyncError('server', 'foreign key');
        if (!table.some((x) => x.family_id === row.family_id && x.child_id === row.child_id && x.id === row.id)) table.push({ ...structuredClone(row), synced_at: this.tick() });
      }
    };
    insertNew(this.tickets, b.tickets);
    insertNew(this.attempts, b.attempts);
    for (const row of b.requests) {
      const i = this.requests.findIndex((x) => x.family_id === row.family_id && x.child_id === row.child_id && x.id === row.id);
      if (i < 0) this.requests.push({ ...structuredClone(row), synced_at: this.tick() });
      else if (statusRank(row.status) > statusRank(this.requests[i].status)) this.requests[i] = { ...structuredClone(row), synced_at: this.tick() };
      else this.requests[i] = { ...this.requests[i], synced_at: this.tick() };
    }
  }
}
