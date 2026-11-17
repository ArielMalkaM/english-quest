import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAccount } from '../state/account';
import { useStore } from '../state/store';
import type { SyncOutcome } from './engine';
import { runSyncCycle } from './engine';
import type { LinkChoice } from './merge';
import { SupabaseRemote } from './remote';

export type SyncStatus = 'off' | 'syncing' | 'idle' | 'offline' | 'needs-choice' | 'needs-migration' | 'error';

export interface SyncInfo {
  status: SyncStatus;
  lastSyncAt: string | null;
  /** When status is needs-choice: the children already in the account. */
  accountChildren: { id: string; name: string }[];
  error: string | null;
  syncNow(): void;
  /** The parent's answer when this device and the account both have children. */
  choose(choice: Extract<LinkChoice, 'add' | 'replace'>): void;
}

const SyncContext = createContext<SyncInfo | null>(null);

export function useSync(): SyncInfo {
  const info = useContext(SyncContext);
  if (!info) throw new Error('useSync must be used inside <SyncProvider>');
  return info;
}

const PERIOD_MS = 45_000;
const AFTER_EDIT_MS = 1_500;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status: accountStatus, familyId } = useAccount();
  const store = useStore();
  const bridge = store.sync;
  const active = accountStatus === 'signed-in' && familyId !== null;
  const remote = useMemo(() => (supabase ? new SupabaseRemote(supabase) : null), []);

  const [status, setStatus] = useState<SyncStatus>('off');
  const [accountChildren, setAccountChildren] = useState<SyncInfo['accountChildren']>([]);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const run = useCallback(
    async (choice?: LinkChoice, manual = false) => {
      if (!active || !remote || !familyId) return;
      // While waiting for the parent's choice, only a choice or a manual tap tries again.
      if (statusRef.current === 'needs-choice' && !choice && !manual) return;
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      setStatus('syncing');
      let outcome: SyncOutcome;
      try {
        outcome = await runSyncCycle({ remote, familyId, get: bridge.get, apply: bridge.apply }, choice);
        // Another device changed the same thing a moment earlier: one more round merges it.
        if (outcome.kind === 'error' && outcome.error.kind === 'conflict') {
          outcome = await runSyncCycle({ remote, familyId, get: bridge.get, apply: bridge.apply });
        }
      } finally {
        running.current = false;
      }
      if (outcome.kind === 'synced') {
        setStatus('idle');
        setError(null);
        setAccountChildren([]);
      } else if (outcome.kind === 'needs-choice') {
        setStatus('needs-choice');
        setAccountChildren(outcome.accountChildren);
      } else {
        const kind = outcome.error.kind;
        setStatus(kind === 'offline' ? 'offline' : kind === 'needs-migration' ? 'needs-migration' : 'error');
        setError(outcome.error.message);
      }
      if (again.current) {
        again.current = false;
        void run();
      }
    },
    [active, remote, familyId, bridge],
  );

  // Signed in (or out): start or stop.
  useEffect(() => {
    if (!active) {
      setStatus('off');
      return;
    }
    void run();
    const timer = window.setInterval(() => void run(), PERIOD_MS);
    const wake = () => void run();
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    const visible = () => document.visibilityState === 'visible' && void run();
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [active, run]);

  // Upload shortly after anything changes on this device.
  const edits = store.localEdits;
  useEffect(() => {
    if (!active || edits === 0) return;
    const t = window.setTimeout(() => void run(), AFTER_EDIT_MS);
    return () => window.clearTimeout(t);
  }, [active, edits, run]);

  const lastSyncAt = store.household.sync?.familyId === familyId ? (store.household.sync?.lastSyncAt ?? null) : null;
  const info = useMemo<SyncInfo>(
    () => ({
      status,
      lastSyncAt,
      accountChildren,
      error,
      syncNow: () => void run(undefined, true),
      choose: (choice) => void run(choice, true),
    }),
    [status, lastSyncAt, accountChildren, error, run],
  );
  return <SyncContext.Provider value={info}>{children}</SyncContext.Provider>;
}
