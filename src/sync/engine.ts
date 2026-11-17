// One sync round: link (first time) → pull and merge → push → remember what was sent.
// Local data is always saved first; syncing only ever adds to it, so the app keeps
// working offline and catches up on the next round.
import type { Household } from '../domain/types';
import type { LinkChoice } from './merge';
import { applyRemote, collectPush, linkPlan, markPushed, startLink } from './merge';
import type { RemoteApi } from './remote';
import { SyncError } from './remote';
import { emptyBatch } from './rows';

export interface SyncDeps {
  remote: RemoteApi;
  familyId: string;
  /** The latest household (it can change while the network is busy). */
  get(): Household;
  /** Applies a change to the latest household and saves it on the device. */
  apply(fn: (h: Household) => Household): void;
  now?: () => Date;
}

export type SyncOutcome =
  | { kind: 'synced'; at: string; uploaded: number; downloaded: number }
  | { kind: 'needs-choice'; accountChildren: { id: string; name: string }[] }
  | { kind: 'error'; error: SyncError };

/**
 * @param choice the parent's answer when this device and the account both have children
 *   ('add' this device's children to the account, or 'replace' them with the account's).
 */
export async function runSyncCycle(deps: SyncDeps, choice?: LinkChoice): Promise<SyncOutcome> {
  const now = deps.now ?? (() => new Date());
  try {
    const h = deps.get();
    if (h.sync?.familyId !== deps.familyId) {
      const accountChildren = await deps.remote.listChildren(deps.familyId);
      const plan = linkPlan(h, deps.familyId, accountChildren.length);
      const pick: LinkChoice | null = plan === 'ask' ? (choice ?? null) : plan === 'synced' ? null : plan;
      if (plan === 'ask' && !pick) return { kind: 'needs-choice', accountChildren };
      if (pick) deps.apply((cur) => startLink(cur, deps.familyId, pick, accountChildren.map((c) => c.id)));
    }

    const snap = await deps.remote.pull(deps.familyId, deps.get().sync?.cursors ?? {});
    deps.apply((cur) => applyRemote(cur, snap));
    const downloaded = snap.children.length + snap.tickets.length + snap.attempts.length + snap.requests.length;

    const { batch, marks } = collectPush(deps.get());
    let uploaded = 0;
    if (!emptyBatch(batch)) {
      await deps.remote.push(deps.familyId, batch);
      uploaded = batch.children.length + batch.tickets.length + batch.attempts.length + batch.requests.length + (batch.family ? 1 : 0);
    }
    const at = now();
    deps.apply((cur) => markPushed(cur, marks, at));
    return { kind: 'synced', at: at.toISOString(), uploaded, downloaded };
  } catch (e) {
    return { kind: 'error', error: e instanceof SyncError ? e : new SyncError('server', e instanceof Error ? e.message : String(e)) };
  }
}
