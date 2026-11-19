// 3D view of the race, built with Three.js. Loaded on demand (dynamic import from views.ts), so
// the rest of the app does not carry the library. Same rules and the same gate panels as the 2D
// view; only the drawing differs: a chase camera behind the car, gate arches with sign panels,
// spinning coins, emoji scenery and a sky that changes with each stage.
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, Texture } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GATE_COLORS, RIGHT, drawPanel, emojiFont, labelFont, roundRectPath } from './labels';
import { STAGES } from './raceSim';
import type { RaceSim, RaceView, SimEvent, SimGate, ViewOptions } from './raceSim';

// ───────────────────────── World layout (exported for tests) ─────────────────────────

/** Width of one lane in world units. */
export const LANE_W = 2.4;
/** World units per road unit: a row of gates appears this far ahead of the car. */
export const ROAD_LEN = 18;
export const PANEL_W = LANE_W - 0.25;
export const PANEL_H = 1.45;
/** Height of the sign panels' centre (the car passes underneath). */
export const PANEL_Y = 2.45;
const BAR_Y = 3.45;

export function roadHalfWidth(lanes: number): number {
  return (lanes * LANE_W) / 2 + 0.35;
}

export function laneX(lane: number, lanes: number): number {
  return (lane - (lanes - 1) / 2) * LANE_W;
}

/** Lane whose centre is nearest to world x (clamped to the road). */
export function laneFromX(x: number, lanes: number): number {
  return Math.max(0, Math.min(lanes - 1, Math.round(x / LANE_W + (lanes - 1) / 2)));
}

/** World z of something `d` road units ahead of the car. */
export function zAt(d: number): number {
  return -d * ROAD_LEN;
}

/**
 * Places the chase camera so that a full three-lane road fits the screen width at the car, for
 * any screen shape (tall phones get a wider field of view and a camera further back).
 * Returns the camera's distance factor.
 */
export function placeCamera(cam: PerspectiveCamera, aspect: number): number {
  cam.aspect = aspect;
  cam.fov = aspect < 0.8 ? 62 : aspect < 1.2 ? 56 : 50;
  const edge = new Vector3();
  const set = (k: number) => {
    // Behind and above the car, looking a little ahead of it: the car sits in the lower third with
    // its wheels clear of the bottom edge, and new gates appear well below the top of the screen.
    cam.position.set(0, k * 0.62, k * 0.8);
    cam.lookAt(0, 0.4, -k * 0.72);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  };
  const half = roadHalfWidth(3);
  let lo = 4;
  let hi = 60;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    set(mid);
    // The road's edges and the back of the car (wheels, bumper) must both be on screen.
    const fits = Math.abs(edge.set(half + 0.3, 0, 1.2).project(cam).x) <= 0.94 && edge.set(0, 0, 1.3).project(cam).y >= -0.9;
    if (fits) hi = mid;
    else lo = mid;
  }
  set(hi);
  return hi;
}

// ───────────────────────── Small texture helpers ─────────────────────────

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function redraw(t: CanvasTexture, draw: (ctx: CanvasRenderingContext2D) => void): void {
  const c = t.image as HTMLCanvasElement;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  draw(ctx);
  t.needsUpdate = true;
}

interface Particle {
  pos: Vector3;
  vel: Vector3;
  spin: number;
  life: number;
  max: number;
  color: Color;
  size: number;
  gravity: number;
}

interface Floater {
  sprite: Sprite;
  life: number;
  max: number;
}

interface GateObj {
  group: Group;
  panels: { mesh: Mesh; tex: CanvasTexture; lane: number }[];
  marks: Mesh[];
  resolved: boolean;
}

const MAX_PARTICLES = 260;
const PROPS = 34;

export class ThreeView implements RaceView {
  readonly kind = '3d' as const;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(55, 1, 0.1, 200);
  private camHome = new Vector3();
  private raycaster = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);

  private textures = new Map<string, Texture>();
  private disposables: { dispose(): void }[] = [];

  private groundMesh!: Mesh;
  private groundTex!: CanvasTexture;
  private roadMesh!: Mesh;
  private roadTex!: CanvasTexture;
  private roadLanes = 0;
  private roadStage = -1;
  private hemi!: HemisphereLight;

  private car = new Group();
  private wheels: Mesh[] = [];
  private gates = new Map<number, GateObj>();
  private coins = new Map<number, Object3D>();
  private coinGeo = new CylinderGeometry(0.45, 0.45, 0.12, 28);
  private coinMat = new MeshPhongMaterial({ color: '#ffc93c', emissive: '#7a5200', shininess: 90, specular: '#fff4c2' });
  private props: Sprite[] = [];
  private particles: Particle[] = [];
  private particleMesh: InstancedMesh;
  private floaters: Floater[] = [];
  private banner: Sprite | null = null;
  private bannerLife = 0;

  private stage = -1;
  private time = 0;
  private lastScroll = 0;
  private shake = 0;
  private slowFrames = 0;
  private dummy = new Object3D();

  constructor(
    readonly canvas: HTMLCanvasElement,
    private opts: ViewOptions,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene.add(this.camera); // the stage banner rides on the camera
    this.scene.fog = new Fog('#d8f1ff', 30, 80);
    this.hemi = new HemisphereLight('#ffffff', '#7ed957', 1.15);
    this.scene.add(this.hemi, new AmbientLight('#ffffff', 0.25));
    const sun = new DirectionalLight('#ffffff', 1.5);
    sun.position.set(5, 12, 6);
    this.scene.add(sun);

    this.buildGround();
    this.buildCar();
    this.buildProps();

    const pGeo = new BoxGeometry(0.16, 0.16, 0.16);
    const pMat = new MeshBasicMaterial({ color: '#ffffff' });
    this.particleMesh = new InstancedMesh(pGeo, pMat, MAX_PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    this.disposables.push(pGeo, pMat, this.coinGeo, this.coinMat);

    this.resize();
  }

  // ───────── scene building ─────────

  private buildGround(): void {
    this.groundTex = canvasTexture(16, 64, () => undefined);
    this.groundTex.wrapS = RepeatWrapping;
    this.groundTex.wrapT = RepeatWrapping;
    this.groundTex.repeat.set(1, 220 / 14);
    const groundMat = new MeshLambertMaterial({ map: this.groundTex });
    this.groundMesh = new Mesh(new PlaneGeometry(260, 220), groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(0, -0.02, -90);
    this.scene.add(this.groundMesh);

    this.roadTex = canvasTexture(256, 256, () => undefined);
    this.roadTex.wrapS = RepeatWrapping;
    this.roadTex.wrapT = RepeatWrapping;
    this.roadTex.repeat.set(1, 220 / 9);
    const roadMat = new MeshLambertMaterial({ map: this.roadTex });
    this.roadMesh = new Mesh(new PlaneGeometry(1, 220), roadMat);
    this.roadMesh.rotation.x = -Math.PI / 2;
    this.roadMesh.position.set(0, 0, -90);
    this.scene.add(this.roadMesh);
    this.disposables.push(this.groundTex, groundMat, this.groundMesh.geometry, this.roadTex, roadMat, this.roadMesh.geometry);
  }

  /** Road surface for this lane count and stage: asphalt, dashed lane lines, red-and-white curbs. */
  private paintRoad(lanes: number, stage: number): void {
    if (lanes === this.roadLanes && stage === this.roadStage) return;
    this.roadLanes = lanes;
    this.roadStage = stage;
    const half = roadHalfWidth(lanes);
    this.roadMesh.scale.x = half * 2;
    const st = STAGES[stage];
    redraw(this.roadTex, (ctx) => {
      const W = 256;
      const curb = (0.35 / (half * 2)) * W;
      ctx.fillStyle = st.road;
      ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ff5a5a';
        ctx.fillRect(0, i * 32, curb, 32);
        ctx.fillRect(W - curb, i * 32, curb, 32);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let l = 1; l < lanes; l++) {
        const x = curb + ((W - 2 * curb) * l) / lanes;
        roundRectPath(ctx, x - 4, 40, 8, 110, 4);
        ctx.fill();
      }
    });
    redraw(this.groundTex, (ctx) => {
      ctx.fillStyle = st.grass;
      ctx.fillRect(0, 0, 16, 32);
      ctx.fillStyle = st.grass2;
      ctx.fillRect(0, 32, 16, 32);
    });
  }

  private buildCar(): void {
    const body = new Mesh(new RoundedBoxGeometry(1.4, 0.55, 2.25, 4, 0.2), new MeshLambertMaterial({ color: this.opts.car.color }));
    body.position.y = 0.6;
    const stripe = new Mesh(new BoxGeometry(0.34, 0.02, 2.0), new MeshLambertMaterial({ color: '#ffffff' }));
    stripe.position.set(0, 0.885, 0);
    const cabin = new Mesh(new RoundedBoxGeometry(1.08, 0.5, 1.05, 4, 0.18), new MeshPhongMaterial({ color: '#bde7ff', shininess: 100, specular: '#ffffff' }));
    cabin.position.set(0, 1.05, 0.25);
    this.car.add(body, stripe, cabin);

    const wheelGeo = new CylinderGeometry(0.36, 0.36, 0.32, 20);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new MeshLambertMaterial({ color: '#14213d' });
    for (const [x, z] of [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.78], [0.72, 0.78]]) {
      const w = new Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.36, z);
      this.wheels.push(w);
      this.car.add(w);
    }
    const lampGeo = new SphereGeometry(0.11, 12, 8);
    const head = new MeshBasicMaterial({ color: '#fff3a8' });
    const tail = new MeshBasicMaterial({ color: '#ff4d4d' });
    for (const x of [-0.45, 0.45]) {
      const h = new Mesh(lampGeo, head);
      h.position.set(x, 0.65, -1.13);
      const t = new Mesh(lampGeo, tail);
      t.position.set(x, 0.65, 1.13);
      this.car.add(h, t);
    }
    const driver = new Sprite(new SpriteMaterial({ map: this.emojiTexture(this.opts.car.emoji), depthWrite: false }));
    driver.position.set(0, 1.62, 0.3);
    driver.scale.set(0.8, 0.8, 1);
    const shadow = new Mesh(new CircleGeometry(1, 28), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.95, 1.4, 1);
    shadow.position.y = 0.02;
    this.car.add(driver, shadow);
    this.scene.add(this.car);
    this.car.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) this.disposables.push(m.geometry);
      if (m.material) this.disposables.push(m.material as Material);
    });
  }

  private buildProps(): void {
    for (let i = 0; i < PROPS; i++) {
      const s = new Sprite(new SpriteMaterial({ depthWrite: false }));
      s.center.set(0.5, 0);
      this.placeProp(s, -6 - (i / PROPS) * 90, 0);
      this.props.push(s);
      this.scene.add(s);
      this.disposables.push(s.material);
    }
  }

  private placeProp(s: Sprite, z: number, stage: number): void {
    const props = STAGES[stage].props;
    const side = Math.random() < 0.5 ? -1 : 1;
    s.material.map = this.emojiTexture(props[Math.floor(Math.random() * props.length)]);
    s.material.needsUpdate = true;
    const size = 1.5 + Math.random() * 1.1;
    s.scale.set(size, size, 1);
    s.position.set(side * (roadHalfWidth(3) + 2 + Math.random() * 10), 0, z);
  }

  private emojiTexture(emoji: string): Texture {
    const key = `emoji:${emoji}`;
    let t = this.textures.get(key);
    if (!t) {
      t = canvasTexture(128, 128, (ctx) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = emojiFont(104);
        ctx.fillText(emoji, 64, 70);
      });
      this.textures.set(key, t);
    }
    return t;
  }

  private textTexture(text: string, color: string, fontPx = 64): CanvasTexture {
    const pad = fontPx * 0.4;
    const probe = document.createElement('canvas').getContext('2d');
    if (probe) probe.font = labelFont(fontPx);
    const w = Math.ceil((probe?.measureText(text).width ?? text.length * fontPx * 0.6) + pad * 2);
    return canvasTexture(w, Math.ceil(fontPx * 1.5), (ctx) => {
      ctx.font = labelFont(fontPx);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = fontPx * 0.16;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(text, w / 2, fontPx * 0.78);
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2, fontPx * 0.78);
    });
  }

  // ───────── gates ─────────

  private buildGate(g: SimGate, lanes: number): GateObj {
    const group = new Group();
    const half = roadHalfWidth(lanes);
    const postGeo = new BoxGeometry(0.3, BAR_Y + 0.2, 0.3);
    const postMat = new MeshLambertMaterial({ color: '#14213d' });
    for (const side of [-1, 1]) {
      const post = new Mesh(postGeo, postMat);
      post.position.set(side * (half + 0.25), (BAR_Y + 0.2) / 2, 0);
      group.add(post);
    }
    const barW = half * 2 + 0.9;
    const checker = canvasTexture(256, 32, (ctx) => {
      const sq = 16;
      for (let i = 0; i < 16; i++) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (i + r) % 2 === 0 ? '#14213d' : '#ffffff';
          ctx.fillRect(i * sq, r * sq, sq, sq);
        }
      }
    });
    checker.wrapS = RepeatWrapping;
    checker.repeat.set(barW / 2.6, 1);
    const barMat = new MeshLambertMaterial({ map: checker });
    const bar = new Mesh(new BoxGeometry(barW, 0.42, 0.42), barMat);
    bar.position.y = BAR_Y;
    group.add(bar);

    const panelGeo = new PlaneGeometry(PANEL_W, PANEL_H);
    const markGeo = new PlaneGeometry(LANE_W - 0.3, 0.55);
    const panels: GateObj['panels'] = [];
    const marks: Mesh[] = [];
    for (let i = 0; i < g.q.options.length; i++) {
      const tex = canvasTexture(512, Math.round((512 * PANEL_H) / PANEL_W), () => undefined);
      const mesh = new Mesh(panelGeo, new MeshBasicMaterial({ map: tex, transparent: true }));
      mesh.position.set(laneX(i, lanes), PANEL_Y, 0.25);
      mesh.rotation.x = -0.14;
      mesh.userData.lane = i;
      group.add(mesh);
      panels.push({ mesh, tex, lane: i });
      // A stripe on the road in the gate's colour shows which lane goes through which sign.
      const mark = new Mesh(markGeo, new MeshBasicMaterial({ color: GATE_COLORS[i % GATE_COLORS.length], transparent: true, opacity: 0.9 }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(laneX(i, lanes), 0.03, 0);
      group.add(mark);
      marks.push(mark);
    }
    const obj: GateObj = { group, panels, marks, resolved: false };
    this.paintPanels(obj, g);
    this.scene.add(group);
    return obj;
  }

  private paintPanels(obj: GateObj, g: SimGate): void {
    for (const p of obj.panels) {
      redraw(p.tex, (ctx) => {
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const scale = w / 140;
        drawPanel(ctx, g.q.options[p.lane], { lane: p.lane, resolved: g.resolved, isAnswer: p.lane === g.q.answer, isChosen: p.lane === g.chosen }, 6, 6, w - 12, h - 12, scale);
      });
    }
    obj.resolved = g.resolved;
    if (g.resolved) {
      for (const [i, m] of obj.marks.entries()) {
        (m.material as MeshBasicMaterial).color.set(i === g.q.answer ? RIGHT : '#9aa3b5');
      }
    }
  }

  private disposeGate(obj: GateObj): void {
    this.scene.remove(obj.group);
    const seen = new Set<unknown>();
    obj.group.traverse((o) => {
      const m = o as Mesh;
      for (const thing of [m.geometry, m.material, (m.material as MeshBasicMaterial | undefined)?.map]) {
        if (thing && !seen.has(thing)) {
          seen.add(thing);
          (thing as { dispose(): void }).dispose();
        }
      }
    });
  }

  // ───────── effects ─────────

  private burst(at: Vector3, color: string, n: number): void {
    if (this.opts.reducedMotion) n = Math.min(n, 5);
    const c = new Color(color);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      this.particles.push({
        pos: at.clone(),
        vel: new Vector3(Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s * 0.5),
        spin: Math.random() * 6,
        life: 1.1,
        max: 1.1,
        color: c,
        size: 0.7 + Math.random() * 0.8,
        gravity: 9,
      });
    }
  }

  private floatText(at: Vector3, text: string, color: string): void {
    const tex = this.textTexture(text, color);
    const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const img = tex.image as HTMLCanvasElement;
    const h = 0.9;
    sprite.scale.set((h * img.width) / img.height, h, 1);
    sprite.position.copy(at);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1.2, max: 1.2 });
  }

  private showBanner(text: string): void {
    if (this.banner) {
      this.camera.remove(this.banner);
      this.banner.material.map?.dispose();
      this.banner.material.dispose();
    }
    const tex = canvasTexture(1, 1, () => undefined);
    const fontPx = 72;
    const probe = (tex.image as HTMLCanvasElement).getContext('2d');
    if (probe) probe.font = labelFont(fontPx);
    const w = Math.ceil((probe?.measureText(text).width ?? 400) + fontPx * 1.4);
    const hPx = Math.round(fontPx * 1.6);
    const c = tex.image as HTMLCanvasElement;
    c.width = w;
    c.height = hPx;
    redraw(tex, (ctx) => {
      ctx.fillStyle = 'rgba(20,33,61,0.78)';
      roundRectPath(ctx, 0, 0, w, hPx, hPx / 2);
      ctx.fill();
      ctx.font = labelFont(fontPx);
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, hPx / 2 + 3);
    });
    this.banner = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const h = 0.42;
    this.banner.scale.set((h * w) / hPx, h, 1);
    this.banner.position.set(0, 0.15, -3);
    this.banner.renderOrder = 20;
    this.camera.add(this.banner);
    this.bannerLife = 2.2;
  }

  private applyStage(index: number): void {
    this.stage = index;
    const st = STAGES[index];
    this.canvas.style.background = `linear-gradient(180deg, ${st.sky[0]} 0%, ${st.sky[1]} 62%)`;
    (this.scene.fog as Fog).color.set(st.sky[1]);
    this.hemi.groundColor.set(st.grass);
    this.hemi.intensity = index === STAGES.length - 1 ? 0.8 : 1.15;
    this.paintRoad(this.roadLanes || 3, index);
    this.showBanner(st.name);
  }

  // ───────── RaceView ─────────

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(200, rect.width);
    const h = Math.max(200, rect.height);
    this.renderer.setSize(w, h, false);
    const k = placeCamera(this.camera, w / h);
    this.camHome.copy(this.camera.position);
    const fog = this.scene.fog as Fog;
    fog.near = k + ROAD_LEN * 0.55;
    fog.far = k + ROAD_LEN * 2.6;
  }

  laneAt(clientX: number, clientY: number, sim: RaceSim): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Tapping a sign picks its lane…
    const current = sim.gate ? this.gates.get(sim.gate.id) : undefined;
    if (current) {
      const hit = this.raycaster.intersectObjects(current.panels.map((p) => p.mesh), false)[0];
      if (hit) return hit.object.userData.lane as number;
    }
    // …otherwise the lane of the road under the finger…
    const point = new Vector3();
    if (this.raycaster.ray.intersectPlane(this.ground, point) && point.z < 4) return laneFromX(point.x, sim.lanes);
    // …and above the horizon, simply the left / middle / right part of the screen.
    return Math.max(0, Math.min(sim.lanes - 1, Math.floor(((clientX - rect.left) / rect.width) * sim.lanes)));
  }

  render(sim: RaceSim, dt: number, events: SimEvent[]): void {
    this.time += dt;
    this.paintRoad(sim.lanes, Math.max(0, this.stage));
    for (const e of events) this.handle(e, sim);
    if (this.stage < 0) this.applyStage(sim.stage);
    this.syncGates(sim);
    this.syncCoins(sim, dt);
    this.animate(sim, dt);
    this.adaptQuality(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private handle(e: SimEvent, sim: RaceSim): void {
    if (e.type === 'stage') {
      this.applyStage(e.index);
    } else if (e.type === 'coin') {
      const at = new Vector3(laneX(e.coin.lane, sim.lanes), 0.8, 0);
      this.burst(at, '#ffd166', 10);
      this.floatText(at.clone().setY(1.6), '+1', '#e0a922');
      this.coinsGone.add(e.coin.id);
    } else if (e.type === 'result') {
      const at = new Vector3(laneX(e.gate.chosen, sim.lanes), 1.4, 0);
      const obj = this.gates.get(e.gate.id);
      if (obj) this.paintPanels(obj, e.gate);
      if (e.gate.correct) {
        this.burst(at, RIGHT, 30);
        this.burst(at, '#ffd166', 18);
        this.burst(at, '#ff6b9a', 12);
        this.floatText(at.clone().setY(2.6), `+${e.points}`, '#16a34a');
        if (e.streak >= 3) this.floatText(at.clone().setY(3.6), `🔥 x${e.streak}`, '#ff6b6b');
      } else if (!this.opts.reducedMotion) {
        this.shake = 1;
      }
    }
  }

  private coinsGone = new Set<number>();

  private syncGates(sim: RaceSim): void {
    const live = sim.gate ? [...sim.passing, sim.gate] : sim.passing;
    const ids = new Set(live.map((g) => g.id));
    for (const [id, obj] of this.gates) {
      if (!ids.has(id)) {
        this.disposeGate(obj);
        this.gates.delete(id);
      }
    }
    for (const g of live) {
      let obj = this.gates.get(g.id);
      if (!obj) {
        obj = this.buildGate(g, g.q.options.length);
        this.gates.set(g.id, obj);
      }
      if (g.resolved && !obj.resolved) this.paintPanels(obj, g);
      obj.group.position.z = zAt(g.d);
    }
  }

  private syncCoins(sim: RaceSim, dt: number): void {
    const ids = new Set(sim.coins.map((c) => c.id));
    for (const [id, obj] of this.coins) {
      if (!ids.has(id) || this.coinsGone.has(id)) {
        this.scene.remove(obj);
        this.coins.delete(id);
      }
    }
    for (const c of sim.coins) {
      if (this.coinsGone.has(c.id)) continue;
      let obj = this.coins.get(c.id);
      if (!obj) {
        obj = new Object3D();
        const mesh = new Mesh(this.coinGeo, this.coinMat);
        mesh.rotation.x = Math.PI / 2;
        obj.add(mesh);
        obj.rotation.y = c.id;
        this.coins.set(c.id, obj);
        this.scene.add(obj);
      }
      obj.position.set(laneX(c.lane, sim.lanes), 0.8, zAt(c.d));
      if (!this.opts.reducedMotion) obj.rotation.y += dt * 4;
    }
    if (this.coinsGone.size > 200) this.coinsGone.clear();
  }

  private animate(sim: RaceSim, dt: number): void {
    const moved = (sim.scroll - this.lastScroll) * ROAD_LEN;
    this.lastScroll = sim.scroll;
    // Road and grass scroll towards the camera.
    this.roadTex.offset.y = (this.roadTex.offset.y + moved / 9) % 1;
    this.groundTex.offset.y = (this.groundTex.offset.y + moved / 14) % 1;
    for (const p of this.props) {
      p.position.z += moved;
      if (p.position.z > 0.5) this.placeProp(p, p.position.z - 92, sim.stage); // recycled before it fills the screen
    }

    // Car: lane, steering yaw and lean, spinning wheels, a little bounce.
    const steerDelta = sim.targetLane - sim.carLane;
    this.car.position.x = laneX(sim.carLane, sim.lanes);
    this.car.rotation.y = Math.max(-0.4, Math.min(0.4, -steerDelta * 0.45));
    this.car.rotation.z = Math.max(-0.12, Math.min(0.12, steerDelta * 0.15));
    this.car.position.y = this.opts.reducedMotion ? 0 : Math.abs(Math.sin(this.time * 13)) * 0.03;
    for (const w of this.wheels) w.rotation.x -= moved / 0.36;

    // Exhaust puffs (flames on a hot streak).
    if (dt > 0 && !this.opts.reducedMotion && Math.random() < dt * (sim.streak >= 3 ? 30 : 10)) {
      const hot = sim.streak >= 3;
      this.particles.push({
        pos: new Vector3(this.car.position.x + (Math.random() - 0.5) * 0.4, 0.5, 1.25),
        vel: new Vector3((Math.random() - 0.5) * 0.6, 0.6, 2.5 + Math.random()),
        spin: Math.random() * 3,
        life: 0.55,
        max: 0.55,
        color: new Color(hot ? (Math.random() < 0.5 ? '#ff9f1c' : '#ffd166') : '#ffffff'),
        size: hot ? 1.4 : 1.1,
        gravity: -1,
      });
    }

    // Particles.
    let n = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.size * Math.max(0.15, p.life / p.max);
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.spin * this.time, p.spin * this.time * 0.7, 0);
      this.dummy.scale.setScalar(k);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(n, this.dummy.matrix);
      this.particleMesh.setColorAt(n, p.color);
      n++;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    for (const f of this.floaters) {
      f.life -= dt;
      f.sprite.position.y += dt * 1.4;
      f.sprite.material.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        f.sprite.material.map?.dispose();
        f.sprite.material.dispose();
      }
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    // Fade answered gates as they pass under the camera.
    for (const obj of this.gates.values()) {
      if (!obj.resolved) continue;
      const fade = Math.max(0, Math.min(1, 1 - obj.group.position.z / 9));
      for (const p of obj.panels) (p.mesh.material as MeshBasicMaterial).opacity = fade;
    }

    if (this.banner) {
      this.bannerLife -= dt;
      this.banner.material.opacity = Math.max(0, Math.min(1, this.bannerLife * 2, (2.2 - this.bannerLife) * 4));
      if (this.bannerLife <= 0 && dt > 0) {
        this.camera.remove(this.banner);
        this.banner.material.map?.dispose();
        this.banner.material.dispose();
        this.banner = null;
      }
    }

    // Camera follows the car a little, and shakes gently after a miss.
    this.shake = Math.max(0, this.shake - dt * 3);
    this.camera.position.x = this.camHome.x + this.car.position.x * 0.25 + Math.sin(this.time * 55) * 0.18 * this.shake;
  }

  /** Lowers the resolution on slow devices so the game stays smooth. */
  private adaptQuality(dt: number): void {
    if (dt <= 0) return;
    this.slowFrames = dt > 1 / 32 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90 && this.renderer.getPixelRatio() > 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
      this.slowFrames = 0;
    }
  }

  destroy(): void {
    for (const obj of this.gates.values()) this.disposeGate(obj);
    this.gates.clear();
    for (const f of this.floaters) {
      f.sprite.material.map?.dispose();
      f.sprite.material.dispose();
    }
    if (this.banner) {
      this.banner.material.map?.dispose();
      this.banner.material.dispose();
    }
    for (const t of this.textures.values()) t.dispose();
    for (const d of this.disposables) d.dispose();
    this.particleMesh.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.style.background = '';
  }
}
