// 00 — Boot: a single coral dot -> squash & stretch into a baseline -> three masked type rolls
// ("15 SECONDS." / "900 FRAMES." / "ZERO WASTED.") -> camera dives into the final period.
import { C } from '../util.js';
import { W, H, BEAT } from '../timeline.js';
import { E, seg, spring, snap, glide, clamp, lerp } from '../ease.js';
import { tracePath } from '../type.js';
import { mono } from '../draw.js';
import { scramble } from '../util.js';

let F, SIZE, RUNS, DOT_R;
const LINE_Y = 640;
const BASE_Y = 606;
const STATEMENTS = [
  { text: '15 SECONDS', cap: 'FIG. 01 — DURATION', val: '15.000 S' },
  { text: '900 FRAMES', cap: 'FIG. 02 — RESOLUTION', val: '900 F @ 60 FPS' },
  { text: 'ZERO WASTED', cap: 'FIG. 03 — EFFICIENCY', val: '0 % FILLER' },
];
const AX = { wght: 880, wdth: 108 };
const TARGET_W = 1460;

export function init(R) {
  F = R.fonts.archivo;
  // one size for all three statements, driven by the widest line (+ its period)
  let maxW = 0;
  for (const s of STATEMENTS) maxW = Math.max(maxW, F.layout(s.text, 1000, AX).width + 1000 * 0.22);
  SIZE = (TARGET_W / maxW) * 1000;
  DOT_R = SIZE * 0.085;
  RUNS = STATEMENTS.map((s) => {
    const run = F.layout(s.text, SIZE, AX);
    const total = run.width + SIZE * 0.22;
    return { ...s, run, x0: W / 2 - total / 2, dotX: W / 2 - total / 2 + run.width + SIZE * 0.13, total };
  });
}

// Continuous slot roll: transition j (at beat j+1) moves every line up by one "travel".
// Statement k enters on transition k and leaves on transition k+1, so lines never overlap.
function rollY(tl, k, i) {
  const cap = F.cap * (SIZE / F.upm);
  const travel = cap + 70;
  const pos = (j) => {
    const t0 = (j + 1) * BEAT - 0.06 + i * 0.008;
    return j === 0 ? glide(seg(tl, t0 + 0.06, t0 + 0.4)) : snap(seg(tl, t0, t0 + 0.24));
  };
  let y = (1 - pos(k)) * travel;
  if (k < 2) y -= pos(k + 1) * travel;
  return { y, vis: y > -travel + 1 && y < travel - 1 };
}

function drawDigitsRoll(ctx, run, tl, x0, yOff) {
  // slot-machine digits for "900": each wheel spins and lands, staggered
  const s = run.s;
  const cap = F.cap * s;
  const pitch = cap * 1.35;
  const t0 = 2 * BEAT + 0.04;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 20, BASE_Y + yOff - cap - 8, run.glyphs[2].x + run.glyphs[2].w + 40, cap + 16);
  ctx.clip();
  for (let j = 0; j < 3; j++) {
    const gl = run.glyphs[j];
    const target = +gl.ch;
    const p = seg(tl, t0, t0 + 0.22 + j * 0.07);
    const spins = 1 + j;
    const pos = target + (1 - E.outCubic(p)) * -10 * spins; // wheel position (digits)
    const base = Math.floor(pos);
    const fr = pos - base;
    for (let d = 0; d < 2; d++) {
      const digit = (((base + d) % 10) + 10) % 10;
      const g = F.glyph(String(digit), AX.wght, AX.wdth);
      const dx = (gl.w - g.adv * s) / 2;
      const yy = BASE_Y + yOff + (fr - d) * pitch;
      ctx.beginPath();
      tracePath(ctx, g, x0 + gl.x + dx, yy, s);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function draw(L, tl, env) {
  const ctx = L.ctx();
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // faint dot grid (design-tool canvas)
  const gridA = 0.07 * seg(tl, 0.05, 0.5);
  // camera dive into the final period (beat 3.5 -> 4)
  const pz = seg(tl, 3.58 * BEAT, 4 * BEAT);
  const last = RUNS[2];
  const dotX = last.dotX, dotY = LINE_Y - DOT_R - 2;
  const zk = E.inCubic(pz);
  const zoom = Math.pow(120, zk);
  const cx = lerp(dotX, W / 2, E.inOutCubic(pz)), cy = lerp(dotY, H / 2, E.inOutCubic(pz));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(zk * 0.22);
  ctx.scale(zoom, zoom);
  ctx.translate(-dotX, -dotY);

  if (gridA > 0) {
    ctx.fillStyle = C.paper;
    ctx.globalAlpha = gridA;
    for (let y = 30; y < H; y += 60) for (let x = 30; x < W; x += 60) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    ctx.globalAlpha = 1;
  }

  // --- the dot: pop, drop, squash into the baseline
  const tPop = 0.125 * BEAT;
  const tDrop = 0.5 * BEAT;
  const tLand = 0.8 * BEAT;
  const lineL = TARGET_W + 40;
  ctx.fillStyle = C.coral;
  if (tl >= tPop && tl < tLand) {
    const r0 = 15 * spring(tl - tPop, 3.6, 0.38);
    const pd = E.inCubic(seg(tl, tDrop, tLand));
    const y = lerp(H / 2, LINE_Y, pd);
    const v = pd > 0 && pd < 1 ? 1 : 0;
    const sy = 1 + v * 1.6 * Math.sin(pd * Math.PI);
    const sx = 1 / Math.sqrt(sy);
    ctx.beginPath();
    ctx.ellipse(W / 2, y - r0 * (sy - 1), r0 * sx, r0 * sy, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (tl >= tLand) {
    // splat into a line: fast horizontal growth with overshoot
    const k = seg(tl, tLand, tLand + 0.34);
    const w = lerp(30, lineL, snap(k)) + Math.sin(k * Math.PI) * 60;
    const th = lerp(14, 4, E.outExpo(seg(tl, tLand, tLand + 0.2)));
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2, LINE_Y - th / 2, w, th, th / 2);
    ctx.fill();
    // tick marks at the ends of the rail
    const tk = E.outExpo(seg(tl, tLand + 0.2, tLand + 0.5));
    if (tk > 0) {
      ctx.fillRect(W / 2 - lineL / 2 - 2, LINE_Y - 12 * tk, 4, 24 * tk);
      ctx.fillRect(W / 2 + lineL / 2 - 2, LINE_Y - 12 * tk, 4, 24 * tk);
    }
  }

  // --- statements, masked above the baseline
  const cap = F.cap * (SIZE / F.upm);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, BASE_Y - cap - 40, W, LINE_Y - 4 - (BASE_Y - cap - 40));
  ctx.clip();
  ctx.fillStyle = C.paper;
  for (let k = 0; k < 3; k++) {
    const S = RUNS[k];
    for (const gl of S.run.glyphs) {
      if (gl.ch === ' ') continue;
      const { y, vis } = rollY(tl, k, gl.i);
      if (!vis) continue;
      if (k === 1 && gl.i < 3) continue;
      ctx.beginPath();
      tracePath(ctx, gl.g, S.x0 + gl.x, BASE_Y + y, S.run.s);
      ctx.fill();
    }
    if (k === 1) {
      const { y, vis } = rollY(tl, 1, 0);
      if (vis) drawDigitsRoll(ctx, S.run, tl, S.x0, y);
    }
    // the period is always the brand dot
    const { y, vis } = rollY(tl, k, S.run.glyphs.length);
    if (vis) {
      ctx.fillStyle = C.coral;
      ctx.beginPath();
      ctx.arc(S.dotX, LINE_Y - DOT_R - 2 + y, DOT_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.paper;
    }
  }
  ctx.restore();

  // --- captions under the rail
  const ci = tl < 2 * BEAT ? 0 : tl < 3 * BEAT ? 1 : 2;
  const cp = seg(tl, (ci + 1) * BEAT, (ci + 1) * BEAT + 0.3);
  if (tl > BEAT) {
    ctx.globalAlpha = 0.75;
    mono(ctx, scramble(STATEMENTS[ci].cap, cp, ci * 3, tl), W / 2 - lineL / 2, LINE_Y + 40, { color: C.paper, size: 15 });
    mono(ctx, scramble(STATEMENTS[ci].val, cp, ci * 5 + 1, tl), W / 2 + lineL / 2, LINE_Y + 40, { color: C.paper, size: 15, align: 'right' });
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // final frames of the dive: coral takes over completely (seamless hand-off to the drop)
  if (pz > 0.97) {
    ctx.fillStyle = C.coral;
    ctx.globalAlpha = seg(pz, 0.97, 1);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  return {
    hud: { color: C.paper },
    fx: { vig: 0.35 },
  };
}

// Heavier shutter during the dive so the zoom streaks.
export const shutter = (tl) => (tl > 3.58 * BEAT ? 1.6 : 1);
export const mbBoost = (tl) => (tl > 3.45 * BEAT ? 4 : tl > 2 * BEAT && tl < 2 * BEAT + 0.6 ? 2 : 1);
