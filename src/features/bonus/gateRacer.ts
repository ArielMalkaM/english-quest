// English Gate Racer: the game loop. It advances the rules (RaceSim) and hands the result to a view
// — the 3D Three.js view, or the flat 2D canvas view when 3D is not available (see views.ts).
//
// Every question sends one row of gates down the road; whichever lane the car is in when the gates
// reach it is the child's answer. Coins sit between the gates. Wrong answers never stop the car.
import type { GateQuestion } from '../../domain/bonusQuestions';
import { RaceSim } from './raceSim';
import type { RaceView, RacerResult, SimEvent } from './raceSim';

export type { RacerResult } from './raceSim';
export { POINTS_RIGHT, STREAK_MAX, STREAK_STEP } from './raceSim';
export { GATE_COLORS, MISSED, RIGHT } from './labels';

export interface RacerCallbacks {
  /** A new row of gates is on its way (null between questions). */
  onQuestion(q: GateQuestion | null): void;
  onResult(r: RacerResult): void;
  onCoin(): void;
  /** Active play time simulated this frame (the time charged to the allowance). */
  onTick(dtMs: number): void;
}

export interface RacerOptions {
  view: RaceView;
  nextQuestion: () => GateQuestion;
  gateSeconds: number;
  /** Seconds already played today (a resumed game continues in the same scenery). */
  playedSeconds?: number;
  callbacks: RacerCallbacks;
}

/** Longest step the rules advance at once (long frames are split into steps). */
const STEP_S = 0.04;
/** A long stall (frozen tab, debugger) is not played time: at most this much is simulated and charged. */
const MAX_FRAME_MS = 250;

export class GateRacer {
  readonly sim: RaceSim;
  private raf = 0;
  private last = 0;
  private running = false;
  private destroyed = false;

  constructor(private opts: RacerOptions) {
    this.sim = new RaceSim({
      nextQuestion: opts.nextQuestion,
      gateSeconds: opts.gateSeconds,
      playedSeconds: opts.playedSeconds,
      onQuestion: (q) => opts.callbacks.onQuestion(q),
      onResult: (r) => opts.callbacks.onResult(r),
      onCoin: () => opts.callbacks.onCoin(),
    });
    this.redraw();
  }

  get view(): RaceView {
    return this.opts.view;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (!this.destroyed) this.redraw();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.pause();
    this.destroyed = true;
    this.opts.view.destroy();
  }

  steer(dir: -1 | 1): void {
    this.sim.steer(dir);
    this.snapWhenStopped();
  }

  /** Tap/click on the race: drive to the lane under the finger. */
  tapAt(clientX: number, clientY = 0): void {
    const lane = this.opts.view.laneAt(clientX, clientY, this.sim);
    if (lane === null) return;
    this.sim.setLane(lane);
    this.snapWhenStopped();
  }

  resize(): void {
    if (this.destroyed) return;
    this.opts.view.resize();
    if (!this.running) this.redraw();
  }

  /** While paused (e.g. the tutorial) the car jumps straight to its lane so the child sees it move. */
  private snapWhenStopped(): void {
    if (this.running || this.destroyed) return;
    this.sim.snap();
    this.redraw();
  }

  private takeEvents(): SimEvent[] {
    const events = this.sim.events;
    this.sim.events = [];
    return events;
  }

  private redraw(): void {
    this.opts.view.render(this.sim, 0, this.takeEvents());
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const ms = Math.min(MAX_FRAME_MS, Math.max(0, now - this.last));
    this.last = now;
    this.opts.callbacks.onTick(ms);
    if (!this.running) return; // the tick may have ended the game
    for (let left = ms / 1000; left > 0; left -= STEP_S) this.sim.update(Math.min(STEP_S, left));
    this.opts.view.render(this.sim, ms / 1000, this.takeEvents());
    this.raf = requestAnimationFrame(this.frame);
  };
}
