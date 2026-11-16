/** Normalises typed English so "Don’t " and "don't" compare equal. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.!?,;:"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
}

/** True when the text is mostly Latin letters (the child wrote in English). */
export function looksEnglish(s: string): boolean {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) return false;
  const latin = letters.replace(/[^A-Za-z]/g, '').length;
  return latin / letters.length >= 0.7;
}

/** Share of the target's words that appear in what was heard/typed (0..1). */
export function wordOverlap(target: string, heard: string): number {
  const want = normalize(target).split(' ').filter(Boolean);
  const got = new Set(normalize(heard).split(' '));
  if (want.length === 0) return 0;
  return want.filter((w) => got.has(w)).length / want.length;
}

/** Deterministic shuffle so a game looks the same on every render and in tests. */
export function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619) >>> 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
