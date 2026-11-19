// Flat top-down view of the race on a 2D canvas. Used when WebGL (3D) is not available, or when
// the 2D look is chosen; same rules and the same gate panels as the 3D view.
import { STAGES } from './raceSim';
import type { RaceSim, RaceView, SimEvent, SimGate, ViewOptions } from './raceSim';
import { RIGHT, drawPanel, emojiFont, roundRectPath } from './labels';

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

export class Canvas2DView implements RaceView {
  readonly kind = '2d' as const;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private particles: Particle[] = [];
  private props: Prop[] = [];
  private lastScroll = 0;
  private shake = 0;
  private time = 0;
  private banner: { text: string; life: number } | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private opts: ViewOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported');
    this.ctx = ctx;
    this.resize();
  }

  // ───────── geometry ─────────

  private road() {
    const roadW = Math.min(this.w * 0.9, 540);
    return { roadW, x0: (this.w - roadW) / 2 };
  }

  private laneX(lane: number, lanes: number): number {
    const { x0, roadW } = this.road();
    return x0 + (roadW * (lane + 0.5)) / lanes;
  }

  private carY(): number {
    return this.h - Math.max(70, this.h * 0.14);
  }

  private carSize() {
    const cw = Math.min(64, (this.road().roadW / 3) * 0.55);
    return { cw, ch: cw * 1.5 };
  }

  private gateH(): number {
    return Math.max(58, Math.min(100, this.h * 0.12));
  }

  /** Screen y of something `d` road units ahead (gates: the bottom edge of the panels). */
  private yAt(d: number): number {
    const arrive = this.carY() - this.carSize().ch * 0.45;
    return arrive - d * (arrive + this.gateH());
  }

  private pxPerUnit(): number {
    return this.carY() - this.carSize().ch * 0.45 + this.gateH();
  }

  // ───────── RaceView ─────────

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(280, rect.width);
    this.h = Math.max(320, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  laneAt(clientX: number, _clientY: number, sim: RaceSim): number {
    const x = clientX - this.canvas.getBoundingClientRect().left;
    const { x0, roadW } = this.road();
    return Math.max(0, Math.min(sim.lanes - 1, Math.floor(((x - x0) / roadW) * sim.lanes)));
  }

  destroy(): void {
    this.particles = [];
  }

  render(sim: RaceSim, dt: number, events: SimEvent[]): void {
    this.time += dt;
    if (this.props.length === 0) for (let i = 0; i < 14; i++) this.props.push(this.newProp(sim, Math.random() * this.h));
    for (const e of events) this.handle(e, sim);
    this.animate(sim, dt);
    this.draw(sim);
  }

  private handle(e: SimEvent, sim: RaceSim): void {
    if (e.type === 'stage') {
      this.banner = { text: STAGES[e.index].name, life: 2.2 };
    } else if (e.type === 'coin') {
      const x = this.laneX(e.coin.lane, sim.lanes);
      const y = this.yAt(0);
      this.burst(x, y, '#ffd166', 8);
      this.floatText(x, y - 10, '+1', '#e0a922');
    } else if (e.type === 'result') {
      const x = this.laneX(e.gate.chosen, sim.lanes);
      const y = this.yAt(0);
      if (e.gate.correct) {
        this.burst(x, y, RIGHT, 26);
        this.burst(x, y, '#ffd166', 14);
        this.floatText(x, y - 20, `+${e.points}`, '#16a34a');
        if (e.streak >= 3) this.floatText(x, y - 52, `🔥 x${e.streak}`, '#ff6b6b');
      } else if (!this.opts.reducedMotion) {
        this.shake = 1;
      }
    }
  }

  private animate(sim: RaceSim, dt: number): void {
    const moved = (sim.scroll - this.lastScroll) * this.pxPerUnit();
    this.lastScroll = sim.scroll;
    for (const p of this.props) {
      p.y += moved;
      if (p.y > this.h + 40) Object.assign(p, this.newProp(sim, -40 - Math.random() * 60));
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.text ? -10 : 260) * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 3);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    // Exhaust puffs (and flames on a hot streak).
    if (dt > 0 && !this.opts.reducedMotion && Math.random() < dt * (sim.streak >= 3 ? 30 : 8)) {
      const hot = sim.streak >= 3;
      this.particles.push({
        x: this.laneX(sim.carLane, sim.lanes) + (Math.random() - 0.5) * 10,
        y: this.carY() + this.carSize().ch * 0.5,
        vx: (Math.random() - 0.5) * 30,
        vy: 60 + Math.random() * 40,
        life: 0.5,
        max: 0.5,
        color: hot ? (Math.random() < 0.5 ? '#ff9f1c' : '#ffd166') : 'rgba(255,255,255,0.8)',
        size: hot ? 5 + Math.random() * 4 : 4 + Math.random() * 3,
      });
    }
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

  private newProp(sim: RaceSim, y: number): Prop {
    const props = STAGES[sim.stage].props;
    return { side: Math.random() < 0.5 ? 0 : 1, x: 0.2 + Math.random() * 0.6, y, emoji: props[Math.floor(Math.random() * props.length)] };
  }

  // ───────── drawing ─────────

  private draw(sim: RaceSim): void {
    const { ctx, w, h } = this;
    const st = STAGES[sim.stage];
    const { x0, roadW } = this.road();
    const scrollPx = sim.scroll * this.pxPerUnit();
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.sin(this.time * 60) * 6 * this.shake, 0);

    // Grass with scrolling bands.
    ctx.fillStyle = st.grass;
    ctx.fillRect(-10, 0, w + 20, h);
    ctx.fillStyle = st.grass2;
    const band = 90;
    for (let y = (scrollPx % (band * 2)) - band * 2; y < h; y += band * 2) ctx.fillRect(-10, y, w + 20, band);

    // Scenery on both sides (only where there is room).
    if (x0 > 26) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = emojiFont(Math.min(34, x0 * 0.6));
      for (const p of this.props) ctx.fillText(p.emoji, p.side === 0 ? p.x * x0 : x0 + roadW + p.x * x0, p.y);
    }

    // Road, curbs and lane lines.
    ctx.fillStyle = st.road;
    ctx.fillRect(x0, 0, roadW, h);
    const curb = 22;
    for (let y = (scrollPx % (curb * 2)) - curb * 2; y < h; y += curb) {
      ctx.fillStyle = Math.floor((y - (scrollPx % (curb * 2))) / curb) % 2 === 0 ? '#ffffff' : '#ff6b6b';
      ctx.fillRect(x0 - 8, y, 8, curb);
      ctx.fillRect(x0 + roadW, y, 8, curb);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const dash = 30;
    for (let l = 1; l < sim.lanes; l++) {
      const lx = x0 + (roadW * l) / sim.lanes - 3;
      for (let y = (scrollPx % (dash * 2)) - dash * 2; y < h; y += dash * 2) {
        roundRectPath(ctx, lx, y, 6, dash, 3);
        ctx.fill();
      }
    }

    for (const c of sim.coins) this.drawCoin(this.laneX(c.lane, sim.lanes), this.yAt(c.d));
    for (const g of sim.passing) this.drawGate(g);
    if (sim.gate) this.drawGate(sim.gate);
    this.drawCar(sim);

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
      ctx.globalAlpha = Math.max(0, Math.min(1, this.banner.life * 2, (2.2 - this.banner.life) * 4));
      ctx.font = '800 26px Rubik, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(this.banner.text).width + 40;
      ctx.fillStyle = 'rgba(20,33,61,0.75)';
      roundRectPath(ctx, w / 2 - tw / 2, h * 0.42 - 26, tw, 52, 26);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.fillText(this.banner.text, w / 2, h * 0.42 + 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawCoin(x: number, y: number): void {
    const { ctx } = this;
    const squash = this.opts.reducedMotion ? 1 : 0.35 + 0.65 * Math.abs(Math.sin(this.time * 4 + y * 0.05));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, 1);
    ctx.fillStyle = '#e0a922';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-2, -6, 3, 9);
    ctx.restore();
  }

  private drawGate(g: SimGate): void {
    const { ctx } = this;
    const { x0, roadW } = this.road();
    const gh = this.gateH();
    const n = g.q.options.length;
    const bottom = this.yAt(g.d);
    const top = bottom - gh;
    ctx.globalAlpha = g.resolved ? Math.max(0.25, 1 - (bottom - this.carY()) / (this.h * 0.5)) : 1;

    // Posts and checkered top bar.
    ctx.fillStyle = '#14213d';
    roundRectPath(ctx, x0 - 14, top - 18, 12, gh + 26, 5);
    ctx.fill();
    roundRectPath(ctx, x0 + roadW + 2, top - 18, 12, gh + 26, 5);
    ctx.fill();
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
      drawPanel(ctx, g.q.options[i], { lane: i, resolved: g.resolved, isAnswer: i === g.q.answer, isChosen: i === g.chosen }, x0 + i * pw + pad, top + 2, pw - pad * 2, gh - 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawCar(sim: RaceSim): void {
    const { ctx } = this;
    const { cw, ch } = this.carSize();
    const tilt = Math.max(-0.35, Math.min(0.35, (sim.targetLane - sim.carLane) * 0.5));
    const fill = (x: number, y: number, w: number, h: number, r: number) => {
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fill();
    };
    ctx.save();
    ctx.translate(this.laneX(sim.carLane, sim.lanes), this.carY());
    ctx.rotate(tilt);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    fill(-cw / 2 + 4, -ch / 2 + 8, cw, ch, cw * 0.32);
    ctx.fillStyle = '#14213d';
    const ww = cw * 0.2;
    const wh = ch * 0.24;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fill(sx * (cw / 2) - ww / 2, sy * ch * 0.28 - wh / 2, ww, wh, 4);
    ctx.fillStyle = this.opts.car.color;
    fill(-cw / 2, -ch / 2, cw, ch, cw * 0.32);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    fill(-cw / 2 + 5, -ch / 2 + 5, cw * 0.22, ch - 10, 8);
    ctx.fillStyle = '#bde7ff';
    fill(-cw * 0.34, -ch * 0.36, cw * 0.68, ch * 0.18, 8);
    ctx.fillStyle = '#fff3a8';
    ctx.beginPath();
    ctx.arc(-cw * 0.3, -ch / 2 + 5, 4, 0, Math.PI * 2);
    ctx.arc(cw * 0.3, -ch / 2 + 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = emojiFont(cw * 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.opts.car.emoji, 0, ch * 0.08);
    ctx.restore();
  }
}
