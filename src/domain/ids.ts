/**
 * Record ids. Tickets, attempts and requests used to be numbered per device
 * (tx-1, tx-2…), which would collide once two devices add records for the same child.
 * New records get a random suffix instead, so lists from several devices can simply
 * be combined. Old ids are kept as they are.
 */

type IdSource = () => string;

function randomSuffix(): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

let source: IdSource = randomSuffix;

export function newId(prefix: string): string {
  return `${prefix}-${source()}`;
}

/** Runs fn with a different id source (used for the deterministic demo data). */
export function withIdSource<T>(next: IdSource, fn: () => T): T {
  const previous = source;
  source = next;
  try {
    return fn();
  } finally {
    source = previous;
  }
}

/** Predictable ids: "<tag>0001", "<tag>0002"… */
export function sequentialIds(tag: string): IdSource {
  let n = 0;
  return () => `${tag}${(++n).toString().padStart(4, '0')}`;
}
