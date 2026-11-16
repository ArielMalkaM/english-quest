import type { AppState, ParentAuth, ParentSession } from './types';

/** Parent area re-locks after this long. */
export const PARENT_SESSION_MS = 10 * 60 * 1000;

export class NotAuthorizedError extends Error {
  constructor() {
    super('Parent authorization required');
    this.name = 'NotAuthorizedError';
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Small non-cryptographic hash (FNV-1a, salted and stretched). This keeps the PIN
 * out of plain sight in local storage for the prototype; a real backend must
 * replace it with server-side authentication.
 */
export function hashPin(pin: string, salt: string): string {
  let h = 0x811c9dc5;
  const input = `${salt}:${pin}:${salt}`;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

export function makeSalt(seed: number): string {
  return `eq-${(seed >>> 0).toString(36)}`;
}

export function setPin(auth: ParentAuth, pin: string): ParentAuth {
  if (!isValidPin(pin)) throw new Error('PIN must be exactly 4 digits');
  return { ...auth, pinHash: hashPin(pin, auth.salt) };
}

export function verifyPin(auth: ParentAuth, pin: string): boolean {
  return auth.pinHash !== null && auth.pinHash === hashPin(pin, auth.salt);
}

/** Returns a parent session when the PIN is right, otherwise null. */
export function unlockParent(state: AppState, pin: string, now: Date): ParentSession | null {
  return verifyPin(state.parent, pin) ? { unlockedAt: now.getTime() } : null;
}

export function isParentAuthorized(session: ParentSession | null, now: Date): boolean {
  if (!session) return false;
  const age = now.getTime() - session.unlockedAt;
  return age >= 0 && age < PARENT_SESSION_MS;
}

export function assertParent(session: ParentSession | null, now: Date): void {
  if (!isParentAuthorized(session, now)) throw new NotAuthorizedError();
}
