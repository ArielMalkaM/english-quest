import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for the optional family account. Configured with
 * VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (the public "publishable" or legacy
 * "anon" key — safe to ship in the browser; the database rules in supabase/schema.sql
 * keep every family's rows private). Without them the app runs exactly as before,
 * fully on this device, and the account features are hidden.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          // PKCE puts ?code=… in the query string, which does not clash with the #/ hash router.
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          // Links from emails are handled in state/account.tsx so the app controls the messages.
          detectSessionInUrl: false,
          storageKey: 'english-quest/auth',
        },
      })
    : null;

export const accountsEnabled = supabase !== null;

/** Where email links (confirm sign-up, reset password) should return to. */
export function authRedirect(kind: 'confirm' | 'reset'): string {
  return `${window.location.origin}${window.location.pathname}?eq=${kind}`;
}
