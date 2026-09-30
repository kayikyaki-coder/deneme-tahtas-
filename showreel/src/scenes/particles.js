// 05 — Particles + glitch. 9k particles burst out of the liquid, get sucked onto a rotating 3D
// torus knot exactly on the beat, explode on the next kick, and then the frame breaks down:
// beat-repeat stutters (time remap mirrors the audio), RGB-split sliced type "DON'T BLINK."
// Positions are analytic functions of time, so any frame renders independently (parallel-safe).
import { C, mulberry32, hexToRgb } from '../util.js';
import { W, H, BEAT } from '../timeline.js';
import { E, seg, snap, clamp, lerp, pulse, TAU } from '../ease.js';
import { tracePath } from '../type.js';
import { mono } from '../draw.js';

const N = 9000;
const COLS = [C.paper, C.coral, C.pink, C.lime, C.lilac];
const WEIGHT = [0.34, 0.3, 0.12, 0.12, 0.12];
let P = null;
let F;

export function init(R) {
  F = R.fonts.archivo;
  const rnd = mulberry32(2024);
  P = {
    dir: new Float32Array(N * 2),
    spd: new Float32Array(N),
    phi: new Float32Array(N),
    off: new Float32Array(N * 3),
    col: new Uint8Array(N),
    size: new Float32Array(N),
    seed: new Float32Array(N),
    ex: new Float32Array(N * 3),
  };
  for (let i = 0; i < N; i++) {
    const a = rnd() * TAU;
    P.dir[i * 2] = Math.cos(a);
    P.dir[i * 2 + 1] = Math.sin(a);
    P.spd[i] = 250 + Math.pow(rnd(), 0.6) * 900;
    P.phi[i] = rnd() * TAU;
    // tube offset (random point in a disc-ish volume)
    const u = rnd() * TAU, v = rnd() * TAU, rr = 26 * Math.sqrt(rnd());
    P.off[i * 3] = Math.cos(u) * Math.sin(v) * rr;
    P.off[i * 3 + 1] = Math.sin(u) * Math.sin(v) * rr;
    P.off[i * 3 + 2] = Math.cos(v) * rr;
    let r = rnd(), k = 0, acc = 0;
    for (; k < COLS.length; k++) { acc += WEIGHT[k]; if (r < acc) break; }
    P.col[i] = Math.min(k, COLS.length - 1);
    P.size[i] = 1.6 + rnd() * 2.2;
    P.seed[i] = rnd() * 100;
    // explosion direction (3D)
    const ea = rnd() * TAU, eb = Math.acos(2 * rnd() - 1);
    const es = 500 + rnd() * 1300;
    P.ex[i * 3] = Math.cos(ea) * Math.sin(eb) * es;
    P.ex[i * 3 + 1] = Math.sin(ea) * Math.sin(eb) * es;
    P.ex[i * 3 + 2] = Math.cos(eb) * es;
  }
}

// torus knot (2,3) point + rotation + perspective
function knot(i, tl, b, out) {
  const phi = P.phi[i];
  const Rr = 250, r = 105;
  const pk = 1 + 0.12 * pulse(b, 1.0, 0.18) + 0.06 * pulse(b, 1.5, 0.15);
  let x = (Rr + r * Math.cos(3 * phi)) * Math.cos(2 * phi) + P.off[i * 3];
  let y = (Rr + r * Math.cos(3 * phi)) * Math.sin(2 * phi) + P.off[i * 3 + 1];
  let z = -r * Math.sin(3 * phi) + P.off[i * 3 + 2];
  x *= pk * 0.95; y *= pk * 0.95; z *= pk * 0.95;
  const ay = tl * 1.9 + 0.4, ax = 0.55 + Math.sin(tl * 1.3) * 0.25;
  const cy = Math.cos(ay), sy = Math.sin(ay);
  let x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  let y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
  out[0] = x1; out[1] = y1; out[2] = z2;
}

const tmp = new Float32Array(3);
function pos(i, tl, out) {
  const b = tl / BEAT;
  // phase 1: burst from the centre, decelerating, with a swirl
  const t1 = Math.min(tl, 0.5 * BEAT + 0.05);
  const k1 = 1 - Math.exp(-t1 * 6.5);
  const sd = P.seed[i];
  let bx = 960 + P.dir[i * 2] * P.spd[i] * k1 * 0.75;
  let by = 540 + P.dir[i * 2 + 1] * P.spd[i] * k1 * 0.55;
  const sw = t1 * 1.4;
  bx += Math.sin(by * 0.004 + sd + sw * 3) * 60 * k1;
  by += Math.cos(bx * 0.004 + sd * 1.3 + sw * 3) * 60 * k1;
  // phase 2 -> 3: sucked onto the knot, landing exactly on beat 1
  knot(i, tl, b, tmp);
  const FOC = 900;
  const zz = tmp[2] + 900;
  const kx = 960 + (tmp[0] * FOC) / zz, ky = 540 + (tmp[1] * FOC) / zz;
  const suck = seg(b, 0.45 + (sd % 1) * 0.08, 1.0);
  const e = E.inExpo(suck);
  let x = lerp(bx, kx, e), y = lerp(by, ky, e);
  let depth = lerp(1, 900 / zz, e);
  // phase 4: explosion on beat 2 (3D outward from the knot position)
  if (b > 2.0) {
    const k = 1 - Math.exp(-(tl - 2 * BEAT) * 4.2);
    knot(i, 2 * BEAT, 2.0, tmp);
    const ex = tmp[0] + P.ex[i * 3] * k, ey = tmp[1] + P.ex[i * 3 + 1] * k, ez = tmp[2] + P.ex[i * 3 + 2] * k * 0.6;
    const zz2 = Math.max(120, ez + 900);
    x = 960 + (ex * FOC) / zz2;
    y = 540 + (ey * FOC) / zz2 + k * k * 60;
    depth = 900 / zz2;
  }
  out[0] = x;
  out[1] = y;
  out[2] = depth;
}

const pa = new Float32Array(3), pb = new Float32Array(3);

function sliceText(L, ctx, tl, b) {
  // "DON'T" then "BLINK." — sliced, RGB-split glitch type
  const word = b < 3.0 ? "DON'T" : 'BLINK.'; // b is frame-nominal here
  const run = F.layout(word, 1000, { wght: 900, wdth: 125 });
  const size = ((word === 'BLINK.' ? 1500 : 1300) / run.width) * 1000;
  const r = F.layout(word, size, { wght: 900, wdth: 125 });
  const g = L.group();
  const x0 = 960 - r.width / 2, y0 = 540 + r.cap / 2;
  g.fillStyle = C.paper;
  g.beginPath();
  for (const gl of r.glyphs) tracePath(g, gl.g, x0 + gl.x, y0, r.s);
  g.fill();
  const c = g.canvas_;
  const rnd = mulberry32(Math.floor(tl * 60) * 31 + 7);
  const s = c.width / W;
  const strips = 16;
  const sh = Math.ceil(c.height / strips);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const split = (6 + rnd() * 18) * s;
  for (const [comp, dx, tint] of [['lighter', -split, 'r'], ['lighter', 0, 'g'], ['lighter', split, 'b']]) {
    ctx.globalCompositeOperation = comp;
    for (let k = 0; k < strips; k++) {
      const off = rnd() < 0.35 ? (rnd() - 0.5) * 160 * s : 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, k * sh, c.width, sh);
      ctx.clip();
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      // tint channel: draw the white type through a colour multiply
      ctx.drawImage(tintCanvas(c, tint), dx + off, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

const tints = {};
function tintCanvas(src, ch) {
  let t = tints[ch];
  if (!t || t.width !== src.width) {
    t = tints[ch] = document.createElement('canvas');
    t.width = src.width;
    t.height = src.height;
  }
  const x = t.getContext('2d');
  x.globalCompositeOperation = 'copy';
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = ch === 'r' ? '#ff0000' : ch === 'g' ? '#00ff00' : '#0000ff';
  x.fillRect(0, 0, t.width, t.height);
  return t;
}

export function draw(L, tl, env) {
  const ctx = L.ctx();
  const b = tl / BEAT;
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  // faint radial glow behind the knot
  const gl = 0.35 * seg(b, 0.6, 1.0) * (1 - seg(b, 2.0, 2.6));
  if (gl > 0.001) {
    const g = ctx.createRadialGradient(960, 540, 0, 960, 540, 700);
    g.addColorStop(0, `rgba(255,90,54,${0.28 * gl})`);
    g.addColorStop(1, 'rgba(255,90,54,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // streaks: segment from the previous sub-frame position to the current one
  const dt = (0.5 / Math.max(1, env.mb)) / 60 * 1.2;
  ctx.lineCap = 'round';
  for (let c = 0; c < COLS.length; c++) {
    ctx.strokeStyle = COLS[c];
    for (const sz of [0, 1]) {
      ctx.lineWidth = sz ? 3.4 : 2.0;
      ctx.beginPath();
      for (let i = sz; i < N; i += 2) {
        if (P.col[i] !== c) continue;
        pos(i, tl - dt, pa);
        pos(i, tl, pb);
        if (pb[0] < -20 || pb[0] > W + 20 || pb[1] < -20 || pb[1] > H + 20) continue;
        let dx = pb[0] - pa[0], dy = pb[1] - pa[1];
        const dl = Math.hypot(dx, dy);
        if (dl > 90) { pa[0] = pb[0] - (dx / dl) * 90; pa[1] = pb[1] - (dy / dl) * 90; dx = pb[0] - pa[0]; dy = pb[1] - pa[1]; }
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0] + (Math.abs(dx) + Math.abs(dy) < 0.3 ? 0.3 : 0), pb[1]);
      }
      ctx.stroke();
    }
  }
  // glitch break: sliced RGB-split type
  const bN = Math.round((env.tlN / BEAT) * 1e4) / 1e4;
  if (bN >= 2.5) sliceText(L, ctx, tl, bN);

  // tape-stop: the picture sinks into black as the audio pitch-dives (real time, not remapped)
  const realB = (env.tReal - env.sec.t0) / BEAT;
  const dark = E.inQuad(seg(realB, 3.72, 3.98));
  if (dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.fillRect(0, 0, W, H);
  }
  // readout
  const ov = E.outExpo(seg(b, 1.0, 1.3)) * (1 - seg(b, 2.0, 2.2));
  if (ov > 0.01) {
    ctx.globalAlpha = ov * 0.9;
    mono(ctx, `${N} PARTICLES · TORUS KNOT (2,3) · 0 SIMULATION STEPS`, 64, 150, { color: C.paper, size: 15, weight: 600 });
    ctx.globalAlpha = 1;
  }
  return {
    hud: { color: C.paper },
    fx: { bloom: 0.55, thresh: 0.5, vig: 0.4 },
  };
}

export const mbBoost = (tl) => {
  const b = tl / BEAT;
  return b < 0.35 || (b > 0.8 && b < 1.1) || (b > 1.95 && b < 2.3) ? 1 : 0.5;
};
