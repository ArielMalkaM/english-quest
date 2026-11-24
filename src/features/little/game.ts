import type { LittleTopic, LittleWord } from './topics';

export interface LittleRound {
  target: LittleWord;
  options: LittleWord[];
}

/** Rounds in one "Find it!" game. */
export const ROUNDS = 6;

/** Small seeded random generator, so a game can be rebuilt and tested. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Two pictures to choose from in the first rounds, then three. */
export function choicesFor(round: number): number {
  return round < 2 ? 2 : 3;
}

/**
 * Builds a gentle "Find it!" game: every word of the topic is asked before any
 * repeats, the same word is never asked twice in a row, and each round shows the
 * target among different pictures in a random place.
 */
export function buildRounds(topic: LittleTopic, seed: number, count = ROUNDS): LittleRound[] {
  const rnd = random(seed);
  const targets: LittleWord[] = [];
  while (targets.length < count) {
    let next = shuffle(topic.words, rnd);
    if (targets.length > 0 && next[0].id === targets[targets.length - 1].id) next = [...next.slice(1), next[0]];
    targets.push(...next);
  }
  return targets.slice(0, count).map((target, i) => {
    const others = shuffle(
      topic.words.filter((x) => x.id !== target.id),
      rnd,
    ).slice(0, choicesFor(i) - 1);
    return { target, options: shuffle([target, ...others], rnd) };
  });
}

// ── Stars (kept on this device) ──

export interface TopicProgress {
  /** Heard every picture card at least once. */
  looked: boolean;
  /** "Find it!" games finished. */
  games: number;
}

export type LittleProgress = Record<string, TopicProgress>;

export const MAX_STARS = 3;

/** One star for meeting all the words, one for each finished game, up to three. */
export function starsOf(progress: LittleProgress, topicId: string): number {
  const p = progress[topicId];
  if (!p) return 0;
  return Math.min(MAX_STARS, (p.looked ? 1 : 0) + p.games);
}

export function withLooked(progress: LittleProgress, topicId: string): LittleProgress {
  const p = progress[topicId] ?? { looked: false, games: 0 };
  return { ...progress, [topicId]: { ...p, looked: true } };
}

export function withGame(progress: LittleProgress, topicId: string): LittleProgress {
  const p = progress[topicId] ?? { looked: false, games: 0 };
  return { ...progress, [topicId]: { ...p, games: p.games + 1 } };
}

/** Reads saved progress, ignoring anything malformed. */
export function parseProgress(raw: string | null): LittleProgress {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: LittleProgress = {};
    for (const [id, v] of Object.entries(data as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const { looked, games } = v as Record<string, unknown>;
      out[id] = {
        looked: looked === true,
        games: typeof games === 'number' && Number.isFinite(games) && games > 0 ? Math.floor(games) : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

const STORAGE_KEY = 'english-quest/little-explorers';

export function loadProgress(): LittleProgress {
  try {
    return parseProgress(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveProgress(progress: LittleProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Stars are a nice-to-have; the games work without them.
  }
}
