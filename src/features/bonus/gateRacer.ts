// English Gate Racer: a small canvas game loop (no engine, no dependencies).
//
// A top-down road scrolls towards the player. Every question sends one row of gates down the
// road; whichever lane the car is in when the gates reach it is the child's answer. Coins sit
// between the gates for extra steering fun. Wrong answers never stop the car.
import type { GateQuestion } from '../../domain/bonusQuestions';

export interface RacerResult {
  question: GateQuestion;
  chosen: number;
  correct: boolean;
  /** Points this answer earned (base + streak bonus). */
  points: number;
  streak: number;
}

export interface RacerCallbacks {
  /** A new row of gates is on its way (null between questions). */
  onQuestion(q: GateQuestion | null): void;
  onResult(r: RacerResult): void;
  onCoin(): void;
  /** Active play time simulated this frame (the time charged to the allowance). */
  onTick(dtMs: number): void;
}

export interface RacerOptions {
  canvas: HTMLCanvasElement;
  nextQuestion: () => GateQuestion;
  gateSeconds: number;
  car: { emoji: string; color: string };
  reducedMotion: boolean;
  /** Seconds already played today (a resumed game continues in the same scenery). */
  playedSeconds?: number;
  callbacks: RacerCallbacks;
}

export const POINTS_RIGHT = 10;
export const STREAK_STEP = 5;
export const STREAK_MAX = 20;

/** Gate fills; each keeps white label text at 4.5:1 contrast or better (WCAG AA). */
export const GATE_COLORS = ['#d63d3d', '#0f7f74', '#6a4df0'];
export const RIGHT = '#15803d';
export const MISSED = '#556070';

/** Scenery changes every ~75 seconds so the ride keeps getting more exciting. */
const STAGES = [
  { name: 'Meadow Road', grass: '#7ed957', grass2: '#6cc94a', road: '#4d5b8c', props: ['🌳', '🌼', '🌷', '🐞', '🌲'] },
  { name: 'Beach Road', grass: '#ffe08a', grass2: '#f7d36e', road: '#4b6a9b', props: ['🌴', '🐚', '🦀', '⛱️', '🌊'] },
  { name: 'Candy Road', grass: '#ffc6e5', grass2: '#ffb3dc', road: '#7a4f9e', props: ['🍭', '🍬', '🧁', '🍩', '🎈'] },
  { name: 'Space Road', grass: '#1f2551', grass2: '#262d63', road: '#3c3f78', props: ['⭐', '🪐', '🚀', '🌙', '✨'] },
];
const STAGE_SECONDS = 75;

const labelFont = (size: number) => `800 ${size}px Rubik, "Segoe UI", system-ui, sans-serif`;

interface Gate {
  q: GateQuestion;
  y: number;
  resolved: boolean;
  chosen: number;
  correct: boolean;
}

interface Coin {
  x: number; // 0..1 across the road
  y: number;
  taken: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  text?: string;
}

interface Prop {
  side: 0 | 1;
  x: number; // 0..1 inside the side strip
  y: number;
  emoji: string;
}

export class GateRacer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private running = false;
  private destroyed = false;

  private gate: Gate | null = null;
  private passing: Gate[] = [];
  private coins: Coin[] = [];
  private particles: Particle[] = [];
  private props: Prop[] = [];
  private scroll = 0;
  private playSeconds = 0;
  private gapLeft = 0.8;
  private streak = 0;
  private shake = 0;

  /** Lane the child is steering to, and where the car is drawn (in lanes, can be fractional). */
  private targetLane = 1;
  private carLane = 1;
  private lanes = 3;
  private stageShown = -1;
  private banner: { text: string; life: number } | null = null;
  private labelCache = new Map<string, { size: number; lines: string[] }>();

  constructor(private opts: RacerOptions) {
    const ctx = opts.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported');
    this.ctx = ctx;
    this.playSeconds = opts.playedSeconds ?? 0;
    this.resize();
    for (let i = 0; i < 14; i++) this.props.push(this.newProp(Math.random() * this.h));
    this.draw();
  }

  // ───────── public controls ─────────

  start(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.draw();
  }

  destroy(): void {
    this.destroyed = true;
    this.pause();
  }

  get isRunning(): boolean {
    return this.running;
  }

  steer(dir: -1 | 1): void {
    this.targetLane = Math.max(0, Math.min(this.lanes - 1, this.targetLane + dir));
    this.snapWhenStopped();
  }

  /** While paused (e.g. the tutorial) the car jumps straight to its lane so the child sees it move. */
  private snapWhenStopped(): void {
    if (this.running) return;
    this.carLane = this.targetLane;
    this.draw();
  }

  /** Tap/click on the road: drive to the lane under the finger. */
  tapAt(clientX: number): void {
    const rect = this.opts.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const { x0, roadW } = this.road();
    const lane = Math.floor(((x - x0) / roadW) * this.lanes);
    this.targetLane = Math.max(0, Math.min(this.lanes - 1, lane));
    this.snapWhenStopped();
  }

  resize(): void {
    const c = this.opts.canvas;
    const rect = c.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(280, rect.width);
    this.h = Math.max(320, rect.height);
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.running) this.draw();
  }

  // ───────── geometry ─────────

  private road() {
    const roadW = Math.min(this.w * 0.9, 540);
    const x0 = (this.w - roadW) / 2;
    return { roadW, x0 };
  }

  private laneX(lane: number): number {
    const { x0, roadW } = this.road();
    return x0 + (roadW * (lane + 0.5)) / this.lanes;
  }

  private carY(): number {
    return this.h - Math.max(70, this.h * 0.14);
  }

  private carSize() {
    const { roadW } = this.road();
    const cw = Math.min(64, (roadW / 3) * 0.55);
    return { cw, ch: cw * 1.5 };
  }

  private gateH(): number {
    return Math.max(58, Math.min(100, this.h * 0.12));
  }

  /** Pixels per second: a gate takes `gateSeconds` from the top of the screen to the car. */
  private speed(): number {
    return (this.carY() + this.gateH()) / this.opts.gateSeconds;
  }

  private stage() {
    return STAGES[Math.min(STAGES.length - 1, Math.floor(this.playSeconds / STAGE_SECONDS))];
  }

  // ───────── loop ─────────

  private frame = (now: number) => {
    if (!this.running) return;
    // A long stall (frozen tab, debugger) is not played time: at most 250 ms is simulated and charged,
    // so the clock always matches what the child actually got to play.
    const ms = Math.min(250, Math.max(0, now - this.last));
    this.last = now;
    this.opts.callbacks.onTick(ms);
    if (!this.running) return; // the tick may have ended the game
    for (let left = ms / 1000; left > 0; left -= 0.04) this.update(Math.min(0.04, left));
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const v = this.speed();
    this.playSeconds += dt;
    this.scroll += v * dt;

    const stageIndex = Math.min(STAGES.length - 1, Math.floor(this.playSeconds / STAGE_SECONDS));
    if (stageIndex !== this.stageShown) {
      this.stageShown = stageIndex;
      this.banner = { text: STAGES[stageIndex].name, life: 2.2 };
    }
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }

    // Car follows the chosen lane smoothly.
    this.carLane += (this.targetLane - this.carLane) * Math.min(1, dt * 12);

    // Next question after a short breather.
    if (!this.gate) {
      this.gapLeft -= dt;
      if (this.gapLeft <= 0) this.spawnGate();
    }

    const carY = this.carY();
    const { ch } = this.carSize();
    if (this.gate) {
      this.gate.y += v * dt;
      if (!this.gate.resolved && this.gate.y >= carY - ch * 0.45) this.resolve(this.gate);
    }
    for (const g of this.passing) g.y += v * dt;
    this.passing = this.passing.filter((g) => g.y < this.h + this.gateH() * 2);

    const carX = this.laneX(this.carLane);
    const { x0, roadW } = this.road();
    for (const c of this.coins) {
      c.y += v * dt;
      if (!c.taken && Math.abs(c.y - (carY - ch * 0.1)) < ch * 0.5 && Math.abs(x0 + c.x * roadW - carX) < roadW / this.lanes / 2.2) {
        c.taken = true;
        this.opts.callbacks.onCoin();
        this.burst(x0 + c.x * roadW, c.y, '#ffd166', 8);
        this.floatText(x0 + c.x * roadW, c.y - 10, '+1', '#e0a922');
      }
    }
    this.coins = this.coins.filter((c) => !c.taken && c.y < this.h + 30);

    for (const p of this.props) {
      p.y += v * dt;
      if (p.y > this.h + 40) Object.assign(p, this.newProp(-40 - Math.random() * 60));
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.text ? -10 : 260) * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 3);

    // Exhaust puffs (and flames on a hot streak).
    if (!this.opts.reducedMotion && Math.random() < dt * (this.streak >= 3 ? 30 : 8)) {
      const hot = this.streak >= 3;
      this.particles.push({
        x: carX + (Math.random() - 0.5) * 10,
        y: carY + ch * 0.5,
        vx: (Math.random() - 0.5) * 30,
        vy: 60 + Math.random() * 40,
        life: 0.5,
        max: 0.5,
        color: hot ? (Math.random() < 0.5 ? '#ff9f1c' : '#ffd166') : 'rgba(255,255,255,0.8)',
        size: hot ? 5 + Math.random() * 4 : 4 + Math.random() * 3,
      });
    }
  }

  private spawnGate(): void {
    const q = this.opts.nextQuestion();
    this.lanes = q.options.length;
    this.targetLane = Math.max(0, Math.min(this.lanes - 1, Math.round(this.targetLane)));
    this.carLane = Math.max(0, Math.min(this.lanes - 1, this.carLane));
    this.gate = { q, y: -this.gateH(), resolved: false, chosen: -1, correct: false };
    // A short trail of coins after the gates, in a random lane.
    const lane = Math.floor(Math.random() * this.lanes);
    for (let i = 1; i <= 4; i++) this.coins.push({ x: (lane + 0.5) / this.lanes, y: -this.gateH() - 70 - i * 46, taken: false });
    this.opts.callbacks.onQuestion(q);
  }

  private resolve(g: Gate): void {
    g.resolved = true;
    g.chosen = Math.max(0, Math.min(this.lanes - 1, Math.round(this.carLane)));
    g.correct = g.chosen === g.q.answer;
    const x = this.laneX(g.chosen);
    let points = 0;
    if (g.correct) {
      this.streak++;
      points = POINTS_RIGHT + Math.min(STREAK_MAX, Math.max(0, this.streak - 1) * STREAK_STEP);
      this.burst(x, g.y, RIGHT, 26);
      this.burst(x, g.y, '#ffd166', 14);
      this.floatText(x, g.y - 20, `+${points}`, '#16a34a');
      if (this.streak >= 3) this.floatText(x, g.y - 52, `🔥 x${this.streak}`, '#ff6b6b');
    } else {
      this.streak = 0;
      if (!this.opts.reducedMotion) this.shake = 1;
    }
    this.opts.callbacks.onResult({ question: g.q, chosen: g.chosen, correct: g.correct, points, streak: this.streak });
    this.passing.push(g);
    this.gate = null;
    this.gapLeft = g.correct ? 1.4 : 2.6;
    this.opts.callbacks.onQuestion(null);
  }

  private burst(x: number, y: number, color: string, n: number): void {
    if (this.opts.reducedMotion) n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 220;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.9, max: 0.9, color, size: 3 + Math.random() * 5 });
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    this.particles.push({ x, y, vx: 0, vy: -50, life: 1.1, max: 1.1, color, size: 26, text });
  }

  private newProp(y: number): Prop {
    const props = this.stage().props;
    return { side: Math.random() < 0.5 ? 0 : 1, x: 0.2 + Math.random() * 0.6, y, emoji: props[Math.floor(Math.random() * props.length)] };
  }

  // ───────── drawing ─────────

  private draw(): void {
    const { ctx, w, h } = this;
    const st = this.stage();
    const { x0, roadW } = this.road();
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.sin(this.playSeconds * 60) * 6 * this.shake, 0);

    // Grass with scrolling bands.
    ctx.fillStyle = st.grass;
    ctx.fillRect(-10, 0, w + 20, h);
    ctx.fillStyle = st.grass2;
    const band = 90;
    for (let y = (this.scroll % (band * 2)) - band * 2; y < h; y += band * 2) ctx.fillRect(-10, y, w + 20, band);

    // Scenery on both sides (only where there is room).
    const side = x0;
    if (side > 26) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.min(34, side * 0.6)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      for (const p of this.props) {
        const px = p.side === 0 ? p.x * side : x0 + roadW + p.x * side;
        ctx.fillText(p.emoji, px, p.y);
      }
    }

    // Road, curbs and lane lines.
    ctx.fillStyle = st.road;
    ctx.fillRect(x0, 0, roadW, h);
    const curb = 22;
    for (let y = (this.scroll % (curb * 2)) - curb * 2; y < h; y += curb) {
      ctx.fillStyle = Math.floor((y - (this.scroll % (curb * 2))) / curb) % 2 === 0 ? '#ffffff' : '#ff6b6b';
      ctx.fillRect(x0 - 8, y, 8, curb);
      ctx.fillRect(x0 + roadW, y, 8, curb);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const dash = 30;
    for (let l = 1; l < this.lanes; l++) {
      const lx = x0 + (roadW * l) / this.lanes - 3;
      for (let y = (this.scroll % (dash * 2)) - dash * 2; y < h; y += dash * 2) this.roundRect(lx, y, 6, dash, 3, true);
    }

    for (const c of this.coins) this.drawCoin(x0 + c.x * roadW, c.y);
    for (const g of this.passing) this.drawGate(g);
    if (this.gate) this.drawGate(this.gate);
    this.drawCar();

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.text) {
        ctx.font = `800 ${p.size}px Rubik, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#fff';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (this.banner) {
      const a = Math.min(1, this.banner.life * 2, (2.2 - this.banner.life) * 4);
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = '800 26px Rubik, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(this.banner.text).width + 40;
      ctx.fillStyle = 'rgba(20,33,61,0.75)';
      this.roundRect(w / 2 - tw / 2, h * 0.42 - 26, tw, 52, 26, true);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(this.banner.text, w / 2, h * 0.42 + 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawCoin(x: number, y: number): void {
    const { ctx } = this;
    const r = 11;
    const squash = this.opts.reducedMotion ? 1 : 0.35 + 0.65 * Math.abs(Math.sin(this.playSeconds * 4 + y * 0.05));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, 1);
    ctx.fillStyle = '#e0a922';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-2, -6, 3, 9);
    ctx.restore();
  }

  private drawGate(g: Gate): void {
    const { ctx } = this;
    const { x0, roadW } = this.road();
    const gh = this.gateH();
    const n = g.q.options.length;
    const top = g.y - gh;
    const fade = g.resolved ? Math.max(0.25, 1 - (g.y - this.carY()) / (this.h * 0.5)) : 1;
    ctx.globalAlpha = fade;

    // Posts and checkered top bar.
    ctx.fillStyle = '#14213d';
    this.roundRect(x0 - 14, top - 18, 12, gh + 26, 5, true);
    this.roundRect(x0 + roadW + 2, top - 18, 12, gh + 26, 5, true);
    const sq = 9;
    for (let i = 0; i * sq < roadW + 16; i++) {
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle = (i + r) % 2 === 0 ? '#14213d' : '#ffffff';
        ctx.fillRect(x0 - 8 + i * sq, top - 18 + r * sq, Math.min(sq, roadW + 16 - i * sq), sq);
      }
    }

    const pad = 5;
    const pw = roadW / n;
    for (let i = 0; i < n; i++) {
      const px = x0 + i * pw + pad;
      const py = top + 2;
      const w = pw - pad * 2;
      const h = gh - 6;
      let fill = GATE_COLORS[i % GATE_COLORS.length];
      if (g.resolved) {
        if (i === g.q.answer) fill = RIGHT;
        else if (i === g.chosen) fill = MISSED;
        else fill = 'rgba(255,255,255,0.35)';
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      this.roundRect(px, py + 4, w, h, 14, true);
      ctx.fillStyle = fill;
      this.roundRect(px, py, w, h, 14, true);
      if (g.resolved && i === g.q.answer) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        this.roundRect(px + 2, py + 2, w - 4, h - 4, 12, false);
      }
      this.drawLabel(g.q.options[i], px + w / 2, py + h / 2, w - 10, h - 8, g.resolved && i !== g.q.answer && i !== g.chosen);
      if (g.resolved && i === g.q.answer) this.badge(px + w - 6, py + 4, '✓', RIGHT);
    }
    ctx.globalAlpha = 1;
  }

  private drawLabel(o: GateQuestion['options'][number], cx: number, cy: number, maxW: number, maxH: number, dim: boolean): void {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    if (!o.text && o.emoji) {
      ctx.save();
      if (dim) ctx.globalAlpha *= 0.6;
      const emojiFont = (s: number) => `${s}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      if (!o.he) {
        ctx.font = emojiFont(Math.min(maxH * 0.85, maxW * 0.7));
        ctx.fillText(o.emoji, cx, cy + 2);
        ctx.restore();
        return;
      }
      // Picture on top, its Hebrew word underneath.
      ctx.font = emojiFont(Math.min(maxH * 0.52, maxW * 0.5));
      ctx.fillText(o.emoji, cx, cy - maxH * 0.2);
      let size = Math.floor(Math.max(12, maxH * 0.3));
      ctx.font = labelFont(size);
      while (size > 9 && ctx.measureText(o.he).width > maxW) ctx.font = labelFont(--size);
      ctx.direction = 'rtl';
      ctx.fillStyle = dim ? 'rgba(20,33,61,0.6)' : '#ffffff';
      this.outlined(o.he, cx, cy + maxH * 0.3, dim);
      ctx.restore();
      return;
    }
    const text = o.emoji ? `${o.emoji} ${o.text}` : o.text;
    const { size, lines } = this.layoutLabel(text, maxW, maxH);
    ctx.font = labelFont(size);
    ctx.fillStyle = dim ? 'rgba(20,33,61,0.6)' : '#ffffff';
    if (lines.length === 1) {
      this.outlined(lines[0], cx, cy, dim);
    } else {
      this.outlined(lines[0], cx, cy - size * 0.58, dim);
      this.outlined(lines[1], cx, cy + size * 0.62, dim);
    }
  }

  /** Font size and line breaks for a gate label; measured once per text and gate size. */
  private layoutLabel(text: string, maxW: number, maxH: number): { size: number; lines: string[] } {
    const key = `${text}|${Math.round(maxW)}|${Math.round(maxH)}`;
    const cached = this.labelCache.get(key);
    if (cached) return cached;
    const { ctx } = this;
    const width = (s: string) => ctx.measureText(s).width;
    let size = Math.floor(Math.min(30, maxH * 0.5));
    ctx.font = labelFont(size);
    while (size > 14 && width(text) > maxW) ctx.font = labelFont(--size);
    const words = text.split(' ');
    let out: { size: number; lines: string[] };
    if (width(text) <= maxW || words.length < 2) {
      while (size > 10 && width(text) > maxW) ctx.font = labelFont(--size);
      out = { size, lines: [text] };
    } else {
      // Two balanced lines for long answers.
      let best = 1;
      let bestW = Infinity;
      for (let i = 1; i < words.length; i++) {
        const wv = Math.max(width(words.slice(0, i).join(' ')), width(words.slice(i).join(' ')));
        if (wv < bestW) {
          bestW = wv;
          best = i;
        }
      }
      const lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
      size = Math.floor(Math.min(size, maxH * 0.4));
      ctx.font = labelFont(size);
      while (size > 10 && Math.max(width(lines[0]), width(lines[1])) > maxW) ctx.font = labelFont(--size);
      out = { size, lines };
    }
    if (this.labelCache.size > 200) this.labelCache.clear();
    this.labelCache.set(key, out);
    return out;
  }

  private outlined(text: string, x: number, y: number, dim: boolean): void {
    const { ctx } = this;
    if (!dim) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,33,61,0.35)';
      ctx.strokeText(text, x, y + 1);
    }
    ctx.fillText(text, x, y + 1);
  }

  private badge(x: number, y: number, text: string, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '800 17px Rubik, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  private drawCar(): void {
    const { ctx } = this;
    const { cw, ch } = this.carSize();
    const x = this.laneX(this.carLane);
    const y = this.carY();
    const tilt = Math.max(-0.35, Math.min(0.35, (this.targetLane - this.carLane) * 0.5));
    const color = this.opts.car.color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    this.roundRect(-cw / 2 + 4, -ch / 2 + 8, cw, ch, cw * 0.32, true);
    // Wheels
    ctx.fillStyle = '#14213d';
    const ww = cw * 0.2;
    const wh = ch * 0.24;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.roundRect(sx * (cw / 2) - ww / 2, sy * ch * 0.28 - wh / 2, ww, wh, 4, true);
    // Body
    ctx.fillStyle = color;
    this.roundRect(-cw / 2, -ch / 2, cw, ch, cw * 0.32, true);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    this.roundRect(-cw / 2 + 5, -ch / 2 + 5, cw * 0.22, ch - 10, 8, true);
    // Windshield
    ctx.fillStyle = '#bde7ff';
    this.roundRect(-cw * 0.34, -ch * 0.36, cw * 0.68, ch * 0.18, 8, true);
    // Headlights
    ctx.fillStyle = '#fff3a8';
    ctx.beginPath();
    ctx.arc(-cw * 0.3, -ch / 2 + 5, 4, 0, Math.PI * 2);
    ctx.arc(cw * 0.3, -ch / 2 + 5, 4, 0, Math.PI * 2);
    ctx.fill();
    // Driver
    ctx.font = `${cw * 0.6}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.opts.car.emoji, 0, ch * 0.08);
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number, fill: boolean): void {
    const { ctx } = this;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    if (fill) ctx.fill();
    else ctx.stroke();
  }
}
