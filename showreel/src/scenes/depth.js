// 03 — 3D / depth. The flat grid from 02 is re-rendered through a perspective camera that starts
// exactly top-down (1 world unit = 1 px on the ground plane), so the cut is invisible. Columns
// extrude from the centre, the camera tilts into an orbit, beat shockwaves roll across the field,
// and a whip-pan (with a heavy shutter) throws us into the liquid section.
import { C, hexToRgb, noise2 } from '../util.js';
import { W, H, BEAT } from '../timeline.js';
import { E, seg, snap, clamp, lerp, pulse } from '../ease.js';
import { cell, CELL, GAP, CC, CR } from './grid.js';
import { mono } from '../draw.js';

const FOCAL = 1500;
const RAD = Math.PI / 180;
const SPAN = 11; // cells each side of centre
const INK = hexToRgb(C.ink);
const LIGHT = norm([-0.45, 0.75, 0.5]);

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function camera(b) {
  const tilt = snap(seg(b, 0.25, 2.2));
  const el = lerp(90, 34, tilt); // elevation of the camera above the horizon
  let yaw = lerp(0, 38, E.inOutCubic(seg(b, 0.3, 2.9)));
  // whip pan into the next section
  yaw += 200 * E.inExpo(seg(b, 3.45, 4.0));
  const D = lerp(FOCAL, 2350, E.inOutCubic(seg(b, 0.25, 2.4)));
  const target = [0, lerp(0, 60, tilt), lerp(0, -80, tilt)];
  const th = -el * RAD, ps = yaw * RAD;
  const f = [Math.sin(ps) * Math.cos(th), Math.sin(th), -Math.cos(ps) * Math.cos(th)];
  const r = [Math.cos(ps), 0, Math.sin(ps)];
  const u = [-Math.sin(ps) * Math.sin(th), Math.cos(th), Math.cos(ps) * Math.sin(th)];
  const pos = [target[0] - f[0] * D, target[1] - f[1] * D, target[2] - f[2] * D];
  return { f, r, u, pos, F: FOCAL * (D / FOCAL) * lerp(1, 0.78, tilt) };
}

function project(cam, x, y, z) {
  const dx = x - cam.pos[0], dy = y - cam.pos[1], dz = z - cam.pos[2];
  const zc = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  const xc = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
  const yc = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
  return [W / 2 + (cam.F * xc) / zc, H / 2 - (cam.F * yc) / zc, zc];
}

// Column height for cell (c, r) at beat b.
function height(c, r, b, cd) {
  const dc = c - CC, dr = r - CR;
  const d = Math.hypot(dc, dr);
  const grow = snap(seg(b, 0.05 + d * 0.05, 0.05 + d * 0.05 + 0.7));
  const wave = 0.5 + 0.5 * Math.sin(d * 0.9 - b * 3.2 + cd.ph * 1.5);
  const n = 0.5 + 0.5 * noise2(c * 0.35 + b * 0.25, r * 0.35 - b * 0.2);
  let h = 40 + 330 * (0.35 * wave + 0.4 * n + 0.25 * cd.h);
  // beat shockwaves: a ring that travels outward from the centre
  for (const bb of [1, 2, 3]) {
    const front = (b - bb) * 9;
    if (front > -1 && front < 20) h += 260 * Math.exp(-((d - front) ** 2) / 1.6) * pulse(b, bb, 1.2);
  }
  // settle flat for the whip-out? keep height; scale by growth
  return h * grow;
}

function faceColor(rgb, k, fog) {
  const r = rgb[0] * k, g = rgb[1] * k, b = rgb[2] * k;
  return `rgb(${Math.round(lerp(r, INK[0], fog))},${Math.round(lerp(g, INK[1], fog))},${Math.round(lerp(b, INK[2], fog))})`;
}

export function draw(L, tl, env) {
  const ctx = L.ctx();
  const b = tl / BEAT;
  const cam = camera(b);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  const half = (CELL - GAP) / 2;
  const cols = [];
  for (let r = CR - SPAN; r <= CR + SPAN; r++) {
    for (let c = CC - SPAN; c <= CC + SPAN; c++) {
      const cd = cell(c, r);
      const x = (c - CC) * CELL, z = (r - CR) * CELL;
      const dx = x - cam.pos[0], dy = -cam.pos[1], dz = z - cam.pos[2];
      const depth = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
      if (depth < 50) continue;
      const hgt = height(c, r, b, cd);
      cols.push({ c, r, x, z, cd, hgt, dist: Math.hypot(dx, dz, dy + hgt * 0.5) });
    }
  }
  cols.sort((a, b2) => b2.dist - a.dist);

  const toC = (p) => p;
  for (const col of cols) {
    const { x, z, hgt, cd } = col;
    const x0 = x - half, x1 = x + half, z0 = z - half, z1 = z + half;
    const P = [
      project(cam, x0, 0, z0), project(cam, x1, 0, z0), project(cam, x1, 0, z1), project(cam, x0, 0, z1),
      project(cam, x0, hgt, z0), project(cam, x1, hgt, z0), project(cam, x1, hgt, z1), project(cam, x0, hgt, z1),
    ];
    // near-plane: skip any column that reaches the camera plane (no clipping needed)
    let near = false;
    for (const p of P) if (p[2] < 120) near = true;
    if (near) continue;
    // cull fully off-screen
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of P) {
      if (p[0] < minx) minx = p[0];
      if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1];
      if (p[1] > maxy) maxy = p[1];
    }
    if (maxx < -50 || minx > W + 50 || maxy < -50 || miny > H + 50) continue;
    const rgb = hexToRgb(cd.fg);
    const fog = clamp((col.dist - 2600) / 5200) * 0.85;
    const cp = cam.pos;
    // side faces: [normal, corner indices]
    const faces = [
      [[0, 0, -1], [0, 1, 5, 4], z0],
      [[1, 0, 0], [1, 2, 6, 5], x1],
      [[0, 0, 1], [2, 3, 7, 6], z1],
      [[-1, 0, 0], [3, 0, 4, 7], x0],
    ];
    if (hgt > 0.5) {
      for (const [n, idx] of faces) {
        const fx = x + n[0] * half, fz = z + n[2] * half;
        const vis = (cp[0] - fx) * n[0] + (cp[2] - fz) * n[2] > 0;
        if (!vis) continue;
        const lam = Math.max(0, n[0] * LIGHT[0] + n[2] * LIGHT[2]);
        const k = 0.42 + 0.4 * lam;
        const pa = P[idx[0]], pb = P[idx[1]], pc = P[idx[2]], pd = P[idx[3]];
        const g = ctx.createLinearGradient(0, (pa[1] + pb[1]) / 2, 0, (pc[1] + pd[1]) / 2);
        g.addColorStop(0, faceColor(rgb, k * 0.55, fog));
        g.addColorStop(1, faceColor(rgb, k, fog));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.lineTo(pc[0], pc[1]);
        ctx.lineTo(pd[0], pd[1]);
        ctx.closePath();
        ctx.fill();
      }
    }
    // top face + a crisp highlight edge
    ctx.fillStyle = faceColor(rgb, 1, fog);
    ctx.beginPath();
    ctx.moveTo(P[4][0], P[4][1]);
    ctx.lineTo(P[5][0], P[5][1]);
    ctx.lineTo(P[6][0], P[6][1]);
    ctx.lineTo(P[7][0], P[7][1]);
    ctx.closePath();
    ctx.fill();
    if (hgt > 20) {
      ctx.strokeStyle = `rgba(255,255,255,${0.18 * (1 - fog)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // technical overlay: camera readout
  const ov = E.outExpo(seg(b, 0.6, 1.1)) * (1 - seg(b, 3.4, 3.6));
  if (ov > 0.01) {
    ctx.globalAlpha = ov * 0.9;
    const el = lerp(90, 34, snap(seg(b, 0.25, 2.2)));
    mono(ctx, `CAM  EL ${el.toFixed(1)}°  FOV ${(2 * Math.atan(W / 2 / cam.F) / RAD).toFixed(1)}°  ${cols.length} MESHES`, 64, 150, { color: C.paper, size: 15, weight: 600 });
    ctx.globalAlpha = 1;
  }

  return {
    hud: { color: C.paper },
    fx: { vig: lerp(0.2, 0.38, seg(b, 0, 1)), bloom: 0.3 * seg(b, 0.2, 1.2), thresh: 0.62 },
  };
}

export const shutter = (tl) => {
  const b = tl / BEAT;
  return b > 3.45 ? 1.9 : 1;
};
export const mbBoost = (tl) => {
  const b = tl / BEAT;
  return b > 3.4 ? 3 : 1;
};
