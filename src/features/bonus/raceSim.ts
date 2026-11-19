// English Gate Racer — the game rules, independent of how the race is drawn (2D canvas or 3D).
//
// Distances are in "road units": a row of gates appears at distance 1 and reaches the car at
// distance 0 after exactly `gateSeconds`; negative distances are behind the car. Lanes are
// numbered from the left. Views read this state every frame and react to the events it emits.
import type { GateQuestion } from '../../domain/bonusQuestions';

export const POINTS_RIGHT = 10;
export const STREAK_STEP = 5;
export const STREAK_MAX = 20;

/** Coins trail behind each row of gates, in one lane. */
const COIN_TRAIL = [0.17, 0.24, 0.31, 0.38];
/** A coin is collected within this distance of the car… */
const COIN_REACH = 0.066;
/** …when the car is less than this many lanes from it. */
const COIN_SIDE = 0.45;

/** Scenery changes every ~75 seconds so the ride keeps getting more exciting. */
export const STAGE_SECONDS = 75;
export interface Stage {
  name: string;
  grass: string;
  grass2: string;
  road: string;
  /** Sky gradient (top, horizon) for the 3D view. */
  sky: [string, string];
  props: string[];
}
export const STAGES: Stage[] = [
  { name: 'Meadow Road', grass: '#7ed957', grass2: '#6cc94a', road: '#4d5b8c', sky: ['#5fb4ff', '#d8f1ff'], props: ['🌳', '🌼', '🌷', '🐞', '🌲'] },
  { name: 'Beach Road', grass: '#ffe08a', grass2: '#f7d36e', road: '#4b6a9b', sky: ['#3fa9f5', '#fff1c4'], props: ['🌴', '🐚', '🦀', '⛱️', '🌊'] },
  { name: 'Candy Road', grass: '#ffc6e5', grass2: '#ffb3dc', road: '#7a4f9e', sky: ['#ff8fd0', '#fff0fa'], props: ['🍭', '🍬', '🧁', '🍩', '🎈'] },
  { name: 'Space Road', grass: '#1f2551', grass2: '#262d63', road: '#3c3f78', sky: ['#050a2b', '#2b2f7a'], props: ['⭐', '🪐', '🚀', '🌙', '✨'] },
];

export function stageAt(playSeconds: number): number {
  return Math.min(STAGES.length - 1, Math.max(0, Math.floor(playSeconds / STAGE_SECONDS)));
}

export interface SimGate {
  id: number;
  q: GateQuestion;
  /** Distance from the car (1 = just appeared, 0 = at the car). */
  d: number;
  resolved: boolean;
  chosen: number;
  correct: boolean;
}

export interface SimCoin {
  id: number;
  lane: number;
  d: number;
  taken: boolean;
}

export type SimEvent =
  | { type: 'spawn'; gate: SimGate }
  | { type: 'result'; gate: SimGate; points: number; streak: number }
  | { type: 'coin'; coin: SimCoin }
  | { type: 'stage'; index: number };

export interface RacerResult {
  question: GateQuestion;
  chosen: number;
  correct: boolean;
  /** Points this answer earned (base + streak bonus). */
  points: number;
  streak: number;
}

export interface SimHooks {
  nextQuestion: () => GateQuestion;
  gateSeconds: number;
  /** Seconds already played today (a resumed game continues in the same scenery). */
  playedSeconds?: number;
  onQuestion(q: GateQuestion | null): void;
  onResult(r: RacerResult): void;
  onCoin(): void;
}

export class RaceSim {
  lanes = 3;
  /** Lane the child is steering to, and where the car is (fractional while it moves). */
  targetLane = 1;
  carLane = 1;
  gate: SimGate | null = null;
  /** Answered gates still on screen behind the car. */
  passing: SimGate[] = [];
  coins: SimCoin[] = [];
  /** Road units travelled (views scroll the road and scenery with it). */
  scroll = 0;
  playSeconds: number;
  streak = 0;
  stage: number;
  /** Events since the view last looked (the view clears them). */
  events: SimEvent[] = [];
  private gapLeft = 0.8;
  private ids = 0;

  constructor(private hooks: SimHooks) {
    this.playSeconds = hooks.playedSeconds ?? 0;
    this.stage = stageAt(this.playSeconds);
    this.events.push({ type: 'stage', index: this.stage });
  }

  /** Road units per second. */
  get speed(): number {
    return 1 / this.hooks.gateSeconds;
  }

  steer(dir: -1 | 1): void {
    this.setLane(this.targetLane + dir);
  }

  setLane(lane: number): void {
    this.targetLane = Math.max(0, Math.min(this.lanes - 1, Math.round(lane)));
  }

  /** Puts the car straight into its lane (used while paused, e.g. in the tutorial). */
  snap(): void {
    this.carLane = this.targetLane;
  }

  update(dt: number): void {
    const v = this.speed;
    this.playSeconds += dt;
    this.scroll += v * dt;

    const stage = stageAt(this.playSeconds);
    if (stage !== this.stage) {
      this.stage = stage;
      this.events.push({ type: 'stage', index: stage });
    }

    // Car follows the chosen lane smoothly.
    this.carLane += (this.targetLane - this.carLane) * Math.min(1, dt * 12);

    // Next question after a short breather.
    if (!this.gate) {
      this.gapLeft -= dt;
      if (this.gapLeft <= 0) this.spawnGate();
    }

    if (this.gate) {
      this.gate.d -= v * dt;
      if (this.gate.d <= 0) this.resolve(this.gate);
    }
    for (const g of this.passing) g.d -= v * dt;
    this.passing = this.passing.filter((g) => g.d > -0.5);

    for (const c of this.coins) {
      c.d -= v * dt;
      if (!c.taken && Math.abs(c.d) < COIN_REACH && Math.abs(c.lane - this.carLane) < COIN_SIDE) {
        c.taken = true;
        this.events.push({ type: 'coin', coin: c });
        this.hooks.onCoin();
      }
    }
    this.coins = this.coins.filter((c) => !c.taken && c.d > -0.2);
  }

  private spawnGate(): void {
    const q = this.hooks.nextQuestion();
    this.lanes = q.options.length;
    this.targetLane = Math.max(0, Math.min(this.lanes - 1, Math.round(this.targetLane)));
    this.carLane = Math.max(0, Math.min(this.lanes - 1, this.carLane));
    this.gate = { id: ++this.ids, q, d: 1, resolved: false, chosen: -1, correct: false };
    const lane = Math.floor(Math.random() * this.lanes);
    for (const offset of COIN_TRAIL) this.coins.push({ id: ++this.ids, lane, d: 1 + offset, taken: false });
    this.events.push({ type: 'spawn', gate: this.gate });
    this.hooks.onQuestion(q);
  }

  private resolve(g: SimGate): void {
    g.resolved = true;
    g.chosen = Math.max(0, Math.min(this.lanes - 1, Math.round(this.carLane)));
    g.correct = g.chosen === g.q.answer;
    let points = 0;
    if (g.correct) {
      this.streak++;
      points = POINTS_RIGHT + Math.min(STREAK_MAX, Math.max(0, this.streak - 1) * STREAK_STEP);
    } else {
      this.streak = 0;
    }
    this.events.push({ type: 'result', gate: g, points, streak: this.streak });
    this.hooks.onResult({ question: g.q, chosen: g.chosen, correct: g.correct, points, streak: this.streak });
    this.passing.push(g);
    this.gate = null;
    this.gapLeft = g.correct ? 1.4 : 2.6;
    this.hooks.onQuestion(null);
  }
}

/** How a race is drawn. Views only read the simulation; they never change the rules. */
export interface RaceView {
  readonly kind: '2d' | '3d';
  /** The canvas this view draws on (created by views.ts inside the road area). */
  readonly canvas: HTMLCanvasElement;
  /** Draws the current state; `dt` (seconds) animates effects, 0 while paused. */
  render(sim: RaceSim, dt: number, events: SimEvent[]): void;
  resize(): void;
  /** Lane under a tap/click on the race, or null when it did not hit the road. */
  laneAt(clientX: number, clientY: number, sim: RaceSim): number | null;
  destroy(): void;
}

export interface ViewOptions {
  car: { emoji: string; color: string };
  reducedMotion: boolean;
}
