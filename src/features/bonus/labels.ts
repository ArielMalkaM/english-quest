// Gate panels and their labels, drawn with the 2D canvas API. Used directly by the 2D view and
// as textures for the signs in the 3D view, so both show exactly the same panels.
import type { GateOption } from '../../domain/bonusQuestions';

/** Gate fills; each keeps white label text at 4.5:1 contrast or better (WCAG AA). */
export const GATE_COLORS = ['#d63d3d', '#0f7f74', '#6a4df0'];
export const RIGHT = '#15803d';
export const MISSED = '#556070';
/** Fill of gates that were neither the answer nor the child's choice, once answered. */
export const OTHER = 'rgba(255,255,255,0.35)';

export const labelFont = (size: number) => `800 ${size}px Rubik, "Segoe UI", system-ui, sans-serif`;
export const emojiFont = (size: number) => `${size}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

export type LabelLayout = { size: number; lines: string[] };
const layoutCache = new Map<string, LabelLayout>();

/** Font size and line breaks for a label (one or two balanced lines), measured once and cached. */
export function layoutLabel(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, maxSize = 30): LabelLayout {
  const key = `${text}|${Math.round(maxW)}|${Math.round(maxH)}|${maxSize}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;
  const width = (s: string) => ctx.measureText(s).width;
  const min = Math.max(10, Math.round(maxSize / 3));
  let size = Math.floor(Math.min(maxSize, maxH * 0.5));
  ctx.font = labelFont(size);
  while (size > Math.round(maxSize / 2) && width(text) > maxW) ctx.font = labelFont(--size);
  const words = text.split(' ');
  let out: LabelLayout;
  if (width(text) <= maxW || words.length < 2) {
    while (size > min && width(text) > maxW) ctx.font = labelFont(--size);
    out = { size, lines: [text] };
  } else {
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
    while (size > min && Math.max(width(lines[0]), width(lines[1])) > maxW) ctx.font = labelFont(--size);
    out = { size, lines };
  }
  if (layoutCache.size > 300) layoutCache.clear();
  layoutCache.set(key, out);
  return out;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dim: boolean, stroke: number): void {
  if (!dim) {
    ctx.lineWidth = stroke;
    ctx.strokeStyle = 'rgba(20,33,61,0.35)';
    ctx.strokeText(text, x, y + 1);
  }
  ctx.fillText(text, x, y + 1);
}

/** Draws one option's label centred at (cx, cy) inside maxW × maxH. */
export function drawOptionLabel(ctx: CanvasRenderingContext2D, o: GateOption, cx: number, cy: number, maxW: number, maxH: number, dim: boolean, maxSize = 30): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  const stroke = Math.max(3, maxSize / 7);
  const textColor = dim ? 'rgba(20,33,61,0.6)' : '#ffffff';
  if (!o.text && o.emoji) {
    if (dim) ctx.globalAlpha *= 0.6;
    if (!o.he) {
      ctx.font = emojiFont(Math.min(maxH * 0.85, maxW * 0.7));
      ctx.fillText(o.emoji, cx, cy + 2);
    } else {
      // Picture on top, its Hebrew word underneath.
      ctx.font = emojiFont(Math.min(maxH * 0.52, maxW * 0.5));
      ctx.fillText(o.emoji, cx, cy - maxH * 0.2);
      let size = Math.floor(Math.max(12, maxH * 0.3));
      ctx.font = labelFont(size);
      while (size > 9 && ctx.measureText(o.he).width > maxW) ctx.font = labelFont(--size);
      ctx.direction = 'rtl';
      ctx.fillStyle = textColor;
      outlined(ctx, o.he, cx, cy + maxH * 0.3, dim, stroke);
    }
    ctx.restore();
    return;
  }
  const text = o.emoji ? `${o.emoji} ${o.text}` : o.text;
  const { size, lines } = layoutLabel(ctx, text, maxW, maxH, maxSize);
  ctx.font = labelFont(size);
  ctx.fillStyle = textColor;
  if (lines.length === 1) {
    outlined(ctx, lines[0], cx, cy, dim, stroke);
  } else {
    outlined(ctx, lines[0], cx, cy - size * 0.58, dim, stroke);
    outlined(ctx, lines[1], cx, cy + size * 0.62, dim, stroke);
  }
  ctx.restore();
}

export interface PanelState {
  /** Lane index (gives the colour while unanswered). */
  lane: number;
  resolved: boolean;
  isAnswer: boolean;
  isChosen: boolean;
}

export function panelFill(s: PanelState): string {
  if (!s.resolved) return GATE_COLORS[s.lane % GATE_COLORS.length];
  if (s.isAnswer) return RIGHT;
  if (s.isChosen) return MISSED;
  return OTHER;
}

/** A complete gate panel (shadow, colour, ring and ✓ on the right answer, label) in the given box. */
export function drawPanel(ctx: CanvasRenderingContext2D, o: GateOption, s: PanelState, x: number, y: number, w: number, h: number, scale = 1): void {
  const r = 14 * scale;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRectPath(ctx, x, y + 4 * scale, w, h - 4 * scale, r);
  ctx.fill();
  ctx.fillStyle = panelFill(s);
  roundRectPath(ctx, x, y, w, h - 4 * scale, r);
  ctx.fill();
  if (s.resolved && s.isAnswer) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4 * scale;
    roundRectPath(ctx, x + 2 * scale, y + 2 * scale, w - 4 * scale, h - 8 * scale, r - 2 * scale);
    ctx.stroke();
  }
  ctx.restore();
  const dim = s.resolved && !s.isAnswer && !s.isChosen;
  drawOptionLabel(ctx, o, x + w / 2, y + (h - 4 * scale) / 2, w - 10 * scale, h - 12 * scale, dim, 30 * scale);
  if (s.resolved && s.isAnswer) {
    const bx = x + w - 6 * scale;
    const by = y + 4 * scale;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, by, 13 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RIGHT;
    ctx.font = `800 ${17 * scale}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', bx, by + scale);
    ctx.restore();
  }
}
