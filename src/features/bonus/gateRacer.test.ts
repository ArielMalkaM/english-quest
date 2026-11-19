import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GateQuestion } from '../../domain/bonusQuestions';
import { GATE_COLORS, GateRacer, MISSED, POINTS_RIGHT, RIGHT, STREAK_MAX, STREAK_STEP } from './gateRacer';
import type { RacerResult } from './gateRacer';

// ── A canvas that draws nothing, and a frame clock the test drives by hand ──
const ctx = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, p) => (p in t ? t[p] : p === 'measureText' ? (s: string) => ({ width: s.length * 12 }) : () => undefined),
  set: (t, p, v) => ((t[p] = v), true),
});
const WIDTH = 400;
const HEIGHT = 700;
const canvas = {
  width: 0,
  height: 0,
  getContext: () => ctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }),
} as unknown as HTMLCanvasElement;

let clock = 0;
let pending: FrameRequestCallback | null = null;

beforeEach(() => {
  clock = 1000;
  pending = null;
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((pending = cb), 1));
  vi.stubGlobal('cancelAnimationFrame', () => (pending = null));
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Advances the page clock by `ms` and runs one animation frame (if the game asked for one). */
function frame(ms: number) {
  clock += ms;
  const cb = pending;
  pending = null;
  cb?.(clock);
}
function runFor(ms: number, step = 16) {
  for (let t = 0; t < ms; t += step) frame(step);
}

function q(answer: number, n = 3, key = `q${answer}-${Math.random()}`): GateQuestion {
  return {
    key,
    kind: 'he-to-en',
    ask: { en: '', he: '' },
    prompt: 'חתול',
    promptLang: 'he',
    options: ['dog', 'cat', 'bird'].slice(0, n).map((text) => ({ text })),
    answer,
  };
}

function setup(questions: GateQuestion[], gateSeconds = 6, reducedMotion = false) {
  const results: RacerResult[] = [];
  const shown: (GateQuestion | null)[] = [];
  let ticked = 0;
  let coins = 0;
  let i = 0;
  const racer = new GateRacer({
    canvas,
    nextQuestion: () => questions[Math.min(i++, questions.length - 1)],
    gateSeconds,
    car: { emoji: '🦊', color: '#2ec4b6' },
    reducedMotion,
    callbacks: {
      onQuestion: (x) => shown.push(x),
      onResult: (r) => results.push(r),
      onCoin: () => coins++,
      onTick: (ms) => (ticked += ms),
    },
  });
  return { racer, results, shown, ticked: () => ticked, coins: () => coins };
}

describe('gates and answers', () => {
  it('the lane the car is in when the gates arrive is the answer', () => {
    const g = setup([q(1), q(0), q(2)]);
    g.racer.start();
    runFor(9000); // car starts in the middle lane → right
    expect(g.results[0]).toMatchObject({ chosen: 1, correct: true, points: POINTS_RIGHT, streak: 1 });
    g.racer.steer(-1);
    runFor(9000);
    expect(g.results[1]).toMatchObject({ chosen: 0, correct: true, points: POINTS_RIGHT + STREAK_STEP, streak: 2 });
    runFor(9000); // stays in lane 0, answer is 2 → wrong
    expect(g.results[2]).toMatchObject({ chosen: 0, correct: false, points: 0, streak: 0 });
  });

  it('a gate takes about `gateSeconds` to reach the car', () => {
    const g = setup([q(1)], 7);
    g.racer.start();
    let first = -1;
    for (let t = 0; t < 12_000 && g.results.length === 0; t += 16) {
      frame(16);
      if (first < 0 && g.shown.some(Boolean)) first = t;
    }
    const travel = (g.ticked() - first) / 1000;
    expect(travel).toBeGreaterThan(6.2);
    expect(travel).toBeLessThan(7.3);
  });

  it('a wrong answer never stops the game: the next question still comes', () => {
    const g = setup([q(2), q(1), q(1)]);
    g.racer.start();
    runFor(9000);
    expect(g.results[0].correct).toBe(false);
    runFor(4000);
    expect(g.shown.filter(Boolean)).toHaveLength(2);
    expect(g.racer.isRunning).toBe(true);
  });

  it('streak bonus grows and is capped', () => {
    const g = setup(Array.from({ length: 8 }, () => q(1)));
    g.racer.start();
    runFor(8 * 8500);
    const pts = g.results.map((r) => r.points);
    expect(pts.slice(0, 6)).toEqual([10, 15, 20, 25, 30, 30]);
    expect(Math.max(...pts)).toBe(POINTS_RIGHT + STREAK_MAX);
  });

  it('two-option questions use two lanes and steering stays inside them', () => {
    const g = setup([q(1, 2), q(0, 2)]);
    g.racer.start();
    g.racer.steer(1);
    g.racer.steer(1);
    g.racer.steer(1);
    runFor(9000);
    expect(g.results[0]).toMatchObject({ chosen: 1, correct: true });
    for (let k = 0; k < 5; k++) g.racer.steer(-1);
    runFor(9000);
    expect(g.results[1]).toMatchObject({ chosen: 0, correct: true });
  });
});

describe('controls', () => {
  it('tapping the road drives to the lane under the finger', () => {
    // Road is 360 px wide (90% of 400), centred: lanes at x 20–140, 140–260, 260–380.
    for (const [x, lane] of [[30, 0], [5, 0], [200, 1], [370, 2], [399, 2]] as const) {
      const g = setup([q(lane)]);
      g.racer.start();
      g.racer.tapAt(x);
      runFor(9000);
      expect(g.results[0], `tap at ${x}`).toMatchObject({ chosen: lane, correct: true });
    }
  });

  it('while paused (tutorial), steering moves the car at once', () => {
    const g = setup([q(0)]);
    g.racer.steer(-1);
    g.racer.start();
    frame(16); // the car is already in lane 0; one frame later the gate is not even here yet
    runFor(9000);
    expect(g.results[0].chosen).toBe(0);
  });
});

describe('time keeping', () => {
  it('charges only the time the game actually ran', () => {
    const g = setup([q(1)]);
    g.racer.start();
    runFor(1000, 20);
    expect(g.ticked()).toBe(1000);
    frame(5000); // a frozen tab / debugger pause
    expect(g.ticked()).toBe(1250);
  });

  it('nothing is charged while paused, and resuming does not charge the pause', () => {
    const g = setup([q(1)]);
    g.racer.start();
    runFor(2000);
    g.racer.pause();
    expect(g.racer.isRunning).toBe(false);
    const before = g.ticked();
    clock += 60_000; // a minute away
    frame(16);
    expect(g.ticked()).toBe(before);
    g.racer.start();
    frame(16);
    expect(g.ticked() - before).toBeLessThanOrEqual(16);
  });

  it('destroy stops the loop for good', () => {
    const g = setup([q(1)]);
    g.racer.start();
    g.racer.destroy();
    g.racer.start();
    runFor(1000);
    expect(g.ticked()).toBe(0);
  });
});

describe('extras', () => {
  it('coins in the car’s lane are collected', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // coin trails in lane 0
    const g = setup([q(0), q(0)]);
    g.racer.start();
    g.racer.steer(-1);
    runFor(11_000);
    expect(g.coins()).toBe(4);
  });

  it('coins in another lane are not', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const g = setup([q(2), q(2)]);
    g.racer.start();
    g.racer.steer(1);
    runFor(11_000);
    expect(g.coins()).toBe(0);
  });

  it('runs with reduced motion', () => {
    const g = setup([q(1), q(1)], 6, true);
    g.racer.start();
    runFor(15_000);
    expect(g.results).toHaveLength(2);
  });

  it('a resumed game continues in later scenery (no crash for any stage)', () => {
    const results: RacerResult[] = [];
    const racer = new GateRacer({
      canvas,
      nextQuestion: () => q(1),
      gateSeconds: 6,
      car: { emoji: '🦊', color: '#fff' },
      reducedMotion: false,
      playedSeconds: 290,
      callbacks: { onQuestion: () => undefined, onResult: (r) => results.push(r), onCoin: () => undefined, onTick: () => undefined },
    });
    racer.start();
    runFor(9000);
    expect(results).toHaveLength(1);
  });
});

describe('readability', () => {
  /** WCAG relative luminance contrast between a colour and white. */
  function contrastWithWhite(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return 1.05 / (l + 0.05);
  }

  it('white gate text meets WCAG AA (4.5:1) on every gate colour', () => {
    for (const c of [...GATE_COLORS, RIGHT, MISSED]) expect(contrastWithWhite(c), c).toBeGreaterThanOrEqual(4.5);
  });
});
