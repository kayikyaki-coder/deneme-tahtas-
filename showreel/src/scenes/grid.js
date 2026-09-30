// 02 — Shape systems. A 15x9 Bauhaus grid: camera pulls out of the centre cell, then three
// beat-locked ripples (rotate / card-flip recolour / collapse into column tops for the 3D scene).
import { C, hash2, mulberry32 } from '../util.js';
import { W, H, BEAT } from '../timeline.js';
import { E, seg, spring, snap, clamp, lerp, TAU, bezier } from '../ease.js';
const pullEase = bezier(0.55, 0, 0.1, 1);
import { mono } from '../draw.js';

export const COLS = 9, ROWS = 5, CELL = 216, OX = -12, OY = 0;
export const GAP = 18;
export const CC = 4, CR = 2; // centre cell
const PAL = [C.paper, C.coral, C.ink, C.cobalt, C.lime];
const WEIGHTS = [0.3, 0.26, 0.2, 0.16, 0.08];
const PAIR = {
  [C.paper]: [C.ink, C.coral, C.cobalt],
  [C.ink]: [C.paper, C.coral, C.lime],
  [C.coral]: [C.ink, C.paper, C.paper],
  [C.cobalt]: [C.paper, C.lime, C.coral],
  [C.lime]: [C.ink, C.cobalt, C.ink],
};

function pick(r) {
  let a = 0;
  for (let i = 0; i < PAL.length; i++) {
    a += WEIGHTS[i];
    if (r < a) return PAL[i];
  }
  return PAL[0];
}

// Deterministic cell design, shared with the 3D scene (col/row can exceed the 15x9 frame).
const cache = new Map();
export function cell(c, r) {
  const key = c * 1000 + r;
  let v = cache.get(key);
  if (v) return v;
  const rnd = mulberry32(((c + 57) * 7919 + (r + 31) * 104729) ^ 0x5bd1e995);
  rnd(); rnd();
  let bg = pick(rnd());
  const opts = PAIR[bg];
  let fg = opts[Math.floor(rnd() * opts.length)];
  let type = [0, 1, 2, 2, 1, 3, 4, 5, 6][Math.floor(rnd() * 9)];
  let rot = Math.floor(rnd() * 4);
  if (c === CC && r === CR) { bg = C.paper; fg = C.cobalt; type = 0; rot = 0; }
  v = { bg, fg, type, rot, h: rnd(), ph: rnd() };
  cache.set(key, v);
  return v;
}

// Bauhaus shape set in local cell space [-s/2, s/2] (rotation applied by caller).
function shape(ctx, type, s, k = 1) {
  const h = s / 2;
  ctx.beginPath();
  switch (type) {
    case 0: ctx.arc(0, 0, h * 0.8 * k, 0, TAU); break;
    case 1: // semicircle standing on the bottom edge
      ctx.moveTo(-h * k, h); ctx.arc(0, h, h * k, Math.PI, TAU); ctx.closePath(); break;
    case 2: // quarter circle from the bottom-left corner
      ctx.moveTo(-h, h); ctx.arc(-h, h, s * k, -Math.PI / 2, 0); ctx.closePath(); break;
    case 3: // leaf: two opposite quarter circles overlap
      ctx.moveTo(-h, h); ctx.arc(-h, h, s * k, -Math.PI / 2, 0); ctx.closePath();
      ctx.moveTo(h, -h); ctx.arc(h, -h, s * k, Math.PI / 2, Math.PI); ctx.closePath(); break;
    case 4: // right triangle
      ctx.moveTo(-h, h); ctx.lineTo(-h + s * k, h); ctx.lineTo(-h, h - s * k); ctx.closePath(); break;
    case 5: // ring
      ctx.arc(0, 0, h * 0.8 * k, 0, TAU); ctx.arc(0, 0, h * 0.4 * k, 0, TAU, true); break;
    case 6: // half tile
      ctx.rect(-h, 0, s, h * k); break;
  }
  ctx.fill(type === 5 || type === 3 ? 'evenodd' : 'nonzero');
}

export const cellCenter = (c, r) => [OX + c * CELL + CELL / 2, OY + r * CELL + CELL / 2];

// Collapse progress of a cell into a plain (gapped) square: used at the end of the scene.
export function collapseAt(b, c, r) {
  const d = Math.hypot(c - CC, (r - CR) * 1.1);
  return snap(seg(b, 3.0 + d * 0.05, 3.0 + d * 0.05 + 0.5));
}

export function draw(L, tl, env) {
  const ctx = L.ctx();
  const b = tl / BEAT;
  // pull out of the centre cell
  const zp = pullEase(seg(b, -0.05, 1.0));
  const Z = Math.pow(4.2, 1 - zp);
  ctx.save();
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.scale(Z, Z);
  ctx.rotate((1 - zp) * -0.12);
  ctx.translate(-W / 2, -H / 2);

  for (let r = -1; r <= ROWS; r++) {
    for (let c = -1; c <= COLS; c++) {
      const [x, y] = cellCenter(c, r);
      // cull outside of view
      const sx = (x - W / 2) * Z + W / 2, sy = (y - H / 2) * Z + H / 2;
      if (sx < -CELL * Z || sx > W + CELL * Z || sy < -CELL * Z || sy > H + CELL * Z) continue;
      const cd = cell(c, r);
      const d = Math.hypot(c - CC, r - CR);
      // reveal ripple during the pull-out
      const rev = d < 0.5 ? 1 : spring(tl + 0.3 - d * 0.045, 3.4, 0.55);
      // beat 1: quarter turn ripple
      const turn = snap(seg(b, 1.0 + d * 0.06, 1.0 + d * 0.06 + 0.5));
      // beat 2: diagonal card-flip, colours swap at the midpoint
      const fd = (c + r) * 0.045;
      const flip = seg(b, 2.0 + fd, 2.0 + fd + 0.42);
      const fl = E.inOutCubic(flip);
      const swapped = fl > 0.5;
      const sxk = Math.abs(Math.cos(fl * Math.PI));
      // beat 3: collapse to a gapped square
      const col = collapseAt(b, c, r);
      let bg = swapped ? cd.fg : cd.bg;
      let fg = swapped ? cd.bg : cd.fg;

      ctx.save();
      ctx.translate(x, y);
      // background tile (shrinks to leave gaps during collapse)
      const inset = lerp(0, GAP / 2, col);
      const tileS = CELL - inset * 2;
      ctx.save();
      ctx.scale(sxk, 1);
      const tk = clamp(rev * 1.0);
      ctx.fillStyle = bg;
      ctx.fillRect((-tileS / 2) * tk, (-tileS / 2) * tk, tileS * tk, tileS * tk);
      // shape
      const shK = clamp(rev) * (1 - E.inBack(clamp(col * 1.4)));
      if (shK > 0.001) {
        ctx.rotate(((cd.rot + turn) * Math.PI) / 2);
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.rect(-CELL / 2, -CELL / 2, CELL, CELL);
        ctx.clip();
        shape(ctx, cd.type, CELL, shK);
      }
      ctx.restore();
      ctx.restore();
    }
  }
  ctx.restore();

  return { hud: { color: b > 3.2 ? C.paper : C.ink }, fx: { vig: 0.2 } };
}

export const mbBoost = (tl) => (tl / BEAT < 1.1 ? 1.5 : 1);
