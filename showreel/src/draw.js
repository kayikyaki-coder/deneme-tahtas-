// Shared drawing helpers for scenes.
import { tracePath } from './type.js';

export const fitSize = (font, str, width, opts = {}) => {
  const r = font.layout(str, 1000, opts);
  return (width / r.width) * 1000;
};

export function glyphBounds(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const co = g.co;
  for (let k = 0; k < co.length; k += 2) {
    const x = co[k], y = co[k + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// Split a flattened glyph into its contours (each a standalone glyph-like object).
export function contours(g) {
  const out = [];
  let ops = [], co = [], k = 0;
  for (const op of g.ops) {
    const n = op === 0 || op === 1 ? 2 : op === 2 ? 4 : op === 3 ? 6 : 0;
    if (op === 0 && ops.length) {
      out.push({ ops, co: Float32Array.from(co) });
      ops = [];
      co = [];
    }
    ops.push(op);
    for (let i = 0; i < n; i++) co.push(g.co[k + i]);
    k += n;
  }
  if (ops.length) out.push({ ops, co: Float32Array.from(co) });
  return out;
}

// Fill a glyph with origin at baseline (x, y), `s` = px per font unit.
export function fillGlyph(ctx, g, x, y, s) {
  ctx.beginPath();
  tracePath(ctx, g, x, y, s);
  ctx.fill();
}

// Draw glyph scaled/rotated around its own visual center.
export function glyphAt(ctx, g, cx, cy, s, { rot = 0, sx = 1, sy = 1, stroke = false } = {}) {
  const b = glyphBounds(g);
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.beginPath();
  tracePath(ctx, g, -b.cx * s, b.cy * s, s);
  stroke ? ctx.stroke() : ctx.fill();
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

export function mono(ctx, text, x, y, { size = 15, weight = 500, align = 'left', spacing = 2.2, color } = {}) {
  ctx.font = `${weight} ${size}px "JetBrains Mono", monospace`;
  ctx.letterSpacing = spacing + 'px';
  ctx.textAlign = align;
  if (color) ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
