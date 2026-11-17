import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { authRedirect, supabase } from '../lib/supabase';

/**
 * The parent's family account (Supabase Auth, email + password). Registering once
 * creates the family in the database; every device the parent signs in on stays signed in.
 * Syncing children's progress through the account comes in a later step.
 */

export type AccountStatus = 'off' | 'loading' | 'signed-out' | 'signed-in';

/** Messages produced by opening a link from an account email. */
export type AccountNotice = 'confirmed' | 'confirmed-sign-in' | 'link-expired' | 'link-failed' | 'password-updated';

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; code: string };

export interface Account {
  status: AccountStatus;
  email: string | null;
  /** The family row created for this parent at sign-up (null until loaded, or if the database is not set up). */
  familyId: string | null;
  /** The family row could not be read — usually supabase/schema.sql has not been run yet. */
  familyError: boolean;
  /** Opened a password-reset link: the parent must choose a new password. */
  recovery: boolean;
  notice: AccountNotice | null;
  actions: {
    signUp(email: string, password: string): Promise<AuthResult>;
    signIn(email: string, password: string): Promise<AuthResult>;
    signOut(): Promise<void>;
    sendReset(email: string): Promise<AuthResult>;
    resendConfirmation(email: string): Promise<AuthResult>;
    updatePassword(password: string): Promise<AuthResult>;
    cancelRecovery(): Promise<void>;
    clearNotice(): void;
  };
}

const AccountContext = createContext<Account | null>(null);

export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error('useAccount must be used inside <AccountProvider>');
  return account;
}

const fail = (error: AuthError | Error | null, fallback = 'unexpected_failure'): AuthResult => ({
  ok: false,
  code: (error && 'code' in error && typeof error.code === 'string' && error.code) || fallback,
});

/** Reads ?code / ?eq / error parameters an email link put in the address, then removes them. */
function takeLinkParams(): { code: string | null; kind: string | null; error: string | null } {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.startsWith('#error') ? url.hash.slice(1) : '');
  const result = {
    code: url.searchParams.get('code'),
    kind: url.searchParams.get('eq'),
    error: url.searchParams.get('error_code') ?? url.searchParams.get('error') ?? hash.get('error_code') ?? hash.get('error'),
  };
  if (result.code || result.kind || result.error) {
    window.history.replaceState(null, '', `${url.pathname}#/parent`);
  }
  return result;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(supabase ? 'loading' : 'off');
  const [session, setSession] = useState<Session | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyError, setFamilyError] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState<AccountNotice | null>(null);

  // Start-up: finish a link from an email (if any), then follow the session.
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let alive = true;
    const link = takeLinkParams();

    const { data: sub } = client.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      setStatus(next ? 'signed-in' : 'signed-out');
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });

    (async () => {
      if (link.error) {
        setNotice(link.error === 'otp_expired' ? 'link-expired' : 'link-failed');
      } else if (link.code) {
        const { error } = await client.auth.exchangeCodeForSession(link.code);
        if (!alive) return;
        if (error) {
          // A confirm link opened in another browser cannot sign in here, but the email is confirmed.
          setNotice(link.kind === 'confirm' ? 'confirmed-sign-in' : error.code === 'otp_expired' ? 'link-expired' : 'link-failed');
        } else if (link.kind === 'reset') {
          setRecovery(true);
        } else if (link.kind === 'confirm') {
          setNotice('confirmed');
        }
      }
      const { data } = await client.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      setStatus(data.session ? 'signed-in' : 'signed-out');
    })();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load the family created for this parent at sign-up.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    const client = supabase;
    if (!client || !userId) {
      setFamilyId(null);
      setFamilyError(false);
      return;
    }
    let alive = true;
    client
      .from('families')
      .select('id')
      .eq('owner_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setFamilyId((data as { id: string } | null)?.id ?? null);
        setFamilyError(Boolean(error) || !data);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const account = useMemo<Account>(() => {
    const client = supabase;
    const off: AuthResult = { ok: false, code: 'accounts_off' };
    return {
      status,
      email: session?.user.email ?? null,
      familyId,
      familyError,
      recovery,
      notice,
      actions: {
        async signUp(email, password) {
          if (!client) return off;
          const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirect('confirm') } });
          if (error) return fail(error);
          // With email confirmation on, an address that is already registered comes back with no identities.
          if (data.user && (data.user.identities?.length ?? 0) === 0) return { ok: false, code: 'user_already_exists' };
          return { ok: true, needsConfirmation: !data.session };
        },
        async signIn(email, password) {
          if (!client) return off;
          const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
          return error ? fail(error, 'invalid_credentials') : { ok: true };
        },
        async signOut() {
          if (!client) return;
          await client.auth.signOut({ scope: 'local' });
          setRecovery(false);
        },
        async sendReset(email) {
          if (!client) return off;
          const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect('reset') });
          return error ? fail(error) : { ok: true };
        },
        async resendConfirmation(email) {
          if (!client) return off;
          const { error } = await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authRedirect('confirm') } });
          return error ? fail(error) : { ok: true };
        },
        async updatePassword(password) {
          if (!client) return off;
          const { error } = await client.auth.updateUser({ password });
          if (error) return fail(error);
          setRecovery(false);
          setNotice('password-updated');
          return { ok: true };
        },
        async cancelRecovery() {
          setRecovery(false);
          if (client) await client.auth.signOut({ scope: 'local' });
        },
        clearNotice() {
          setNotice(null);
        },
      },
    };
  }, [status, session, familyId, familyError, recovery, notice]);

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
