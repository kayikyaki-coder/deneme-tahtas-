// 01 — Kinetic type. "MOTION" always spans the frame width, so animating the variable width axis
// trades height for width (condensed = tall, expanded = squat). Waves, weight flips, echo rows,
// then everything but the first O falls away and the camera flies through the O's counter.
import { C } from '../util.js';
import { W, H, BEAT } from '../timeline.js';
import { E, seg, spring, snap, glide, clamp, lerp, TAU } from '../ease.js';
import { tracePath } from '../type.js';
import { contours, glyphBounds, mono } from '../draw.js';
import { hash1 } from '../util.js';
import * as grid from './grid.js';

let F;
const WORD = 'MOTION';
const TW = 1720;

export function init(R) {
  F = R.fonts.archivo;
}

const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

// Per-glyph axes over time (b = beats since section start)
function axes(b, i, n) {
  let wd = 62, wg = 900;
  // traveling width waves
  wd += 63 * bump((b - 1.0 - i * 0.07) / 0.5);
  wd += 63 * bump((b - 1.5 - (n - 1 - i) * 0.07) / 0.5);
  // expand + thin, then back to black at medium width
  const ex = snap(seg(b, 1.95 + i * 0.02, 2.3 + i * 0.02));
  const back = snap(seg(b, 2.7 + i * 0.02, 2.95 + i * 0.02));
  wd = lerp(wd, 125, ex);
  wg = lerp(wg, 180, ex);
  wd = lerp(wd, 100, back);
  wg = lerp(wg, 900, back);
  return { wdth: Math.min(125, wd), wght: wg };
}

function layoutAt(b) {
  const run = F.layout(WORD, 1000, { axes: (i, n) => axes(b, i, n), kerning: false });
  const k = TW / run.width;
  for (const g of run.glyphs) { g.x *= k; g.w *= k; }
  return { run, k, size: 1000 * k, s: run.s * k, cap: F.cap * run.s * k };
}

export function draw(L, tl, env) {
  const ctx = L.ctx();
  const b = tl / BEAT;

  // --- phase C background: next scene visible through the O counter
  const pz = seg(b, 3.5, 4.0);
  if (b >= 3.3) {
    grid.draw(L, tl - 4 * BEAT, env);
  }

  const lay = layoutAt(Math.min(b, 3.0));
  const { run, s, cap } = lay;
  const x0 = W / 2 - TW / 2;
  const baseY = H / 2 + cap / 2;

  // O (index 1) centering / morph data for phase C
  const pc = snap(seg(b, 3.0, 3.5));
  const oG = run.glyphs[1];
  const oAx = { wght: lerp(900, 520, pc), wdth: lerp(axes(3.0, 1, 6).wdth, 125, pc) };
  const oGlyph = F.glyph('O', oAx.wght, oAx.wdth);
  const oB = glyphBounds(oGlyph);
  const oScale = lerp(s, (700 / F.cap) * 1.0, pc);
  const oCx0 = x0 + oG.x + (oB.cx * s), oCy0 = baseY - oB.cy * s;
  const oCx = lerp(oCx0, W / 2, pc), oCy = lerp(oCy0, H / 2, pc);

  // camera zoom into the counter
  const inner = contours(oGlyph).map((c) => ({ c, b: glyphBounds(c) })).sort((a, b2) => a.b.w * a.b.h - b2.b.w * b2.b.h)[0];
  const icx = oCx + (inner.b.cx - oB.cx) * oScale, icy = oCy - (inner.b.cy - oB.cy) * oScale;
  const zoom = Math.pow(60, E.inCubic(pz));

  ctx.save();
  if (pz > 0) {
    ctx.translate(icx, icy);
    ctx.scale(zoom, zoom);
    ctx.translate(-icx, -icy);
  }

  // background (coral), with the O counter punched out once the next scene is underneath
  ctx.fillStyle = C.coral;
  if (b >= 3.3) {
    ctx.beginPath();
    ctx.rect(-1e5, -1e5, 2e5, 2e5);
    tracePath(ctx, inner.c, oCx - oB.cx * oScale, oCy + oB.cy * oScale, oScale);
    ctx.fill('evenodd');
  } else {
    ctx.fillRect(0, 0, W, H);
  }

  // --- echo rows (outline repeats) around the thin-expanded moment
  const echo = E.outCubic(seg(b, 2.0, 2.35)) * (1 - E.inCubic(seg(b, 2.6, 2.85)));
  if (echo > 0.001) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.5;
    const pitch = cap * 1.18;
    for (let r = -3; r <= 3; r++) {
      if (r === 0) continue;
      const dir = r % 2 === 0 ? 1 : -1;
      const slide = (1 - echo) * dir * 400 + Math.sin(b * 2 + r) * 12;
      const yy = baseY + r * pitch * echo;
      const filled = Math.abs(r) === 2;
      ctx.globalAlpha = clamp(echo * (1.1 - Math.abs(r) * 0.18));
      ctx.beginPath();
      for (const gl of run.glyphs) tracePath(ctx, gl.g, x0 + gl.x + slide, yy, s);
      if (filled) { ctx.fillStyle = C.ink; ctx.fill(); } else ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // --- main word
  ctx.fillStyle = C.ink;
  for (const gl of run.glyphs) {
    const i = gl.i;
    // slam-in: drop from above with spring, staggered
    const td = tl + 0.05 - i * 0.03;
    const drop = spring(td, 3.0, 0.5);
    let y = (1 - drop) * -760;
    let x = x0 + gl.x;
    let rot = 0;
    // phase C: everyone except the first O falls away
    if (i !== 1 && b > 3.0) {
      const tf = Math.max(0, tl - 3.0 * BEAT - hash1(i * 3.1) * 0.05);
      // pop up, then gravity; everything scatters away from the hero O
      y += 7000 * tf * tf - 900 * tf;
      rot = (i < 1 ? -1 : 1) * (3 + hash1(i * 7.7) * 4) * tf;
      x += (i < 1 ? -1 : 1) * (1500 + (i - 1) * 250 + hash1(i * 5.3) * 400) * tf;
    }
    if (i === 1 && b > 3.0) continue;
    if (b >= 3.3) {
      // keep fallers out of the portal
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1e5, -1e5, 2e5, 2e5);
      tracePath(ctx, inner.c, oCx - oB.cx * oScale, oCy + oB.cy * oScale, oScale);
      ctx.clip('evenodd');
    }
    const gb = glyphBounds(gl.g);
    const cx = x + gb.cx * s, cy = baseY + y - gb.cy * s;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    // landing squash
    const land = Math.exp(-Math.max(0, td - 0.12) * 14) * Math.max(0, Math.sin(Math.min(1, td / 0.25) * Math.PI));
    ctx.scale(1 + 0.06 * land, 1 - 0.08 * land);
    ctx.beginPath();
    tracePath(ctx, gl.g, -gb.cx * s, gb.cy * s, s);
    ctx.fill();
    ctx.restore();
    if (b >= 3.3) ctx.restore();
  }
  // the hero O during phase C
  if (b > 3.0) {
    ctx.beginPath();
    tracePath(ctx, oGlyph, oCx - oB.cx * oScale, oCy + oB.cy * oScale, oScale);
    ctx.fill();
  }

  // --- live spec readouts (variable axes of the middle glyph)
  if (b < 3.0) {
    const ax = axes(b, 2, 6);
    const ro = E.outExpo(seg(b, 0.35, 0.9));
    ctx.globalAlpha = ro;
    const yT = baseY + 46;
    mono(ctx, `WGHT ${String(Math.round(ax.wght)).padStart(3, '0')}`, x0, yT, { color: C.ink, size: 16, weight: 700 });
    mono(ctx, `WDTH ${String(Math.round(ax.wdth)).padStart(3, '0')}`, x0 + 150, yT, { color: C.ink, size: 16, weight: 700 });
    mono(ctx, 'ARCHIVO VARIABLE — 2 AXES — 1 FONT FILE', x0 + TW, yT, { color: C.ink, size: 16, weight: 700, align: 'right' });
    // axis meter
    ctx.fillRect(x0 + 300, yT - 6, 200, 2);
    ctx.fillRect(x0 + 300 + 200 * ((ax.wdth - 62) / 63) - 2, yT - 13, 4, 16);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  return {
    hud: { color: b > 3.9 ? C.ink : C.ink },
    fx: { vig: 0.22 },
  };
}

export const shutter = (tl) => (tl / BEAT > 3.5 ? 1.5 : 1);
export const mbBoost = (tl) => {
  const b = tl / BEAT;
  return b < 0.5 ? 2 : b > 3.45 ? 3 : b > 3.0 ? 1.5 : b > 0.9 ? 2 : 1;
};
