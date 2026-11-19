// Chooses how the race is drawn: the 3D view (Three.js, loaded only when the game opens) when the
// device supports WebGL, otherwise the flat 2D canvas view. The canvas is created here, so a
// failed 3D start can fall back to a fresh canvas (a canvas cannot switch from WebGL to 2D).
import type { RaceView, ViewOptions } from './raceSim';
import { Canvas2DView } from './view2d';

export type RendererChoice = '3d' | '2d';

/** Troubleshooting override: localStorage `english-quest/bonus-renderer` = "2d" or "3d". */
const PREF_KEY = 'english-quest/bonus-renderer';

export function preferredRenderer(): RendererChoice | null {
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v === '2d' || v === '3d' ? v : null;
  } catch {
    return null;
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the test context right away
    return true;
  } catch {
    return false;
  }
}

function newCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'bonus-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  return canvas;
}

/** Creates the view inside `container` (an empty, positioned element). */
export async function createRaceView(container: HTMLElement, opts: ViewOptions): Promise<RaceView> {
  const want = preferredRenderer() ?? '3d';
  if (want === '3d' && webglAvailable()) {
    const canvas = newCanvas(container);
    try {
      const { ThreeView } = await import('./view3d');
      return new ThreeView(canvas, opts);
    } catch (e) {
      console.warn('3D bonus game unavailable, using 2D', e);
      canvas.remove();
    }
  }
  return new Canvas2DView(newCanvas(container), opts);
}
