// The 3D view needs WebGL (not available in tests), but its layout maths is plain Three.js and runs
// in Node: these tests check the camera framing, lane positions and gate readability for real
// screen shapes, from a tall phone to a wide laptop.
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LANE_W, PANEL_H, PANEL_W, PANEL_Y, ROAD_LEN, laneFromX, laneX, placeCamera, roadHalfWidth, zAt } from './view3d';

const SCREENS: [string, number, number][] = [
  ['small phone (portrait)', 360, 520],
  ['phone (portrait)', 390, 640],
  ['tablet (portrait)', 768, 820],
  ['tablet (landscape)', 1024, 560],
  ['laptop', 1280, 600],
  ['wide desktop', 1920, 760],
];

function camFor(w: number, h: number) {
  const cam = new PerspectiveCamera();
  placeCamera(cam, w / h);
  return cam;
}

/** Screen pixels of a world point on a w × h canvas. */
function px(cam: PerspectiveCamera, p: Vector3, w: number, h: number) {
  const n = p.clone().project(cam);
  return { x: ((n.x + 1) / 2) * w, y: ((1 - n.y) / 2) * h, inFront: n.z < 1 };
}

describe('lanes', () => {
  it('centres lanes on the road and maps positions back to lanes', () => {
    expect(laneX(1, 3)).toBe(0);
    expect(laneX(0, 3)).toBe(-LANE_W);
    expect(laneX(0, 2)).toBe(-LANE_W / 2);
    for (const lanes of [2, 3]) {
      for (let l = 0; l < lanes; l++) expect(laneFromX(laneX(l, lanes), lanes)).toBe(l);
      expect(laneFromX(-100, lanes)).toBe(0);
      expect(laneFromX(100, lanes)).toBe(lanes - 1);
    }
    expect(roadHalfWidth(3)).toBeGreaterThan(laneX(2, 3) + LANE_W / 2 - 0.01);
  });

  it('gates appear ROAD_LEN ahead and reach the car at z = 0', () => {
    expect(zAt(1)).toBe(-ROAD_LEN);
    expect(zAt(0) + 0).toBe(0);
  });

  it('sign panels never overlap the next lane, and the car passes under them', () => {
    expect(PANEL_W).toBeLessThan(LANE_W);
    expect(PANEL_Y - PANEL_H / 2).toBeGreaterThan(1.6); // car incl. the driver is about 1.6 tall
  });
});

describe.each(SCREENS)('camera on a %s', (_name, w, h) => {
  const cam = camFor(w, h);

  it('shows the whole road width at the car and puts the car in the lower part of the screen', () => {
    const half = roadHalfWidth(3);
    const left = px(cam, new Vector3(-half, 0, 0), w, h);
    const right = px(cam, new Vector3(half, 0, 0), w, h);
    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(right.x).toBeLessThanOrEqual(w);
    const car = px(cam, new Vector3(0, 0.6, 0), w, h);
    expect(car.y / h).toBeGreaterThan(0.55);
    expect(car.y / h).toBeLessThan(0.8);
    // The whole car is visible: rear bumper and wheels are above the bottom edge.
    const rear = px(cam, new Vector3(0, 0, 1.25), w, h);
    expect(rear.y / h).toBeLessThan(0.97);
  });

  it('a new row of gates is on screen as soon as it appears', () => {
    for (const lane of [0, 1, 2]) {
      const sign = px(cam, new Vector3(laneX(lane, 3), PANEL_Y + PANEL_H / 2, zAt(1)), w, h);
      expect(sign.inFront).toBe(true);
      expect(sign.y).toBeGreaterThan(0);
      expect(sign.x).toBeGreaterThan(0);
      expect(sign.x).toBeLessThan(w);
    }
  });

  // Tall phones must fit three lanes into a narrow screen, so far signs are smaller there; the
  // question panel shows the same answers as colour-coded chips in lane order for that reason.
  const minHalfway = w / h < 0.8 ? 45 : 60;
  it(`signs are big enough to read from halfway (≥ ${minHalfway} px wide) and grow as they come`, () => {
    const width = (d: number) => {
      const a = px(cam, new Vector3(-PANEL_W / 2, PANEL_Y, zAt(d)), w, h);
      const b = px(cam, new Vector3(PANEL_W / 2, PANEL_Y, zAt(d)), w, h);
      return b.x - a.x;
    };
    expect(width(0.5)).toBeGreaterThanOrEqual(minHalfway);
    expect(width(0.1)).toBeGreaterThan(width(0.5) * 1.3);
  });
});
