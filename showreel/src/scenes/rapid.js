// 06 — Everything at once. Eight 14-frame cards cut on 8th notes, each a micro style-frame for a
// discipline. The last card is chopped by the pre-drop silence (27.75 -> 28 is pure black).
import { C } from '../util.js';
import { W, H, BEAT } from '../timeline.js';
import { E, seg, spring, snap, glide, clamp, lerp, TAU } from '../ease.js';
import { tracePath } from '../type.js';
import { mono, roundRect } from '../draw.js';
import { hash1, mulberry32 } from '../util.js';

let F, M;
export function init(R) {
  F = R.fonts.archivo;
  M = R.fonts.mono;
}

function word(ctx, text, cx, cy, width, ax, color, font = F) {
  const r0 = font.layout(text, 1000, ax);
  const size = (width / r0.width) * 1000;
  const r = font.layout(text, size, ax);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const gl of r.glyphs) tracePath(ctx, gl.g, cx - r.width / 2 + gl.x, cy + r.cap / 2, r.s);
  ctx.fill();
  return r;
}

const CARDS = [
  // TYPE — the width axis snaps open
  (ctx, p, lt) => {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    const k = E.outExpo(p);
    const wd = lerp(62, 125, k), wg = lerp(300, 900, k);
    const size = 460;
    const r = F.layout('TYPE', size, { wght: wg, wdth: wd });
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    for (const gl of r.glyphs) tracePath(ctx, gl.g, 960 - r.width / 2 + gl.x, 540 + r.cap / 2, r.s);
    ctx.fill();
    mono(ctx, `WDTH ${Math.round(wd)} · WGHT ${Math.round(wg)}`, 960, 540 + r.cap / 2 + 70, { color: C.paper, size: 18, weight: 700, align: 'center' });
    return C.paper;
  },
  // SHAPE — circle -> square -> diamond morph on coral
  (ctx, p) => {
    ctx.fillStyle = C.coral;
    ctx.fillRect(0, 0, W, H);
    const k = snap(clamp(p * 1.3));
    const s = 620;
    ctx.save();
    ctx.translate(960, 540);
    ctx.rotate(k * Math.PI * 0.75);
    ctx.fillStyle = C.ink;
    roundRect(ctx, -s / 2, -s / 2, s, s, lerp(s / 2, 0, k));
    ctx.fill();
    ctx.restore();
    word(ctx, 'SHAPE', 960, 540, 1100, { wght: 900, wdth: 125 }, C.paper);
    return C.ink;
  },
  // 3D — spinning wireframe cube on cobalt
  (ctx, p, lt) => {
    ctx.fillStyle = C.cobalt;
    ctx.fillRect(0, 0, W, H);
    const a = lt * 5 + 0.6, b2 = lt * 3.2 + 0.4;
    const V = [];
    for (let i = 0; i < 8; i++) {
      let x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, z = i & 4 ? 1 : -1;
      let x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
      let y1 = y * Math.cos(b2) - z1 * Math.sin(b2), z2 = y * Math.sin(b2) + z1 * Math.cos(b2);
      const s = 330 * (1 + 0.1 * (1 - E.outExpo(p)));
      const pz = 4 / (4 + z2);
      V.push([960 + x1 * s * pz, 540 + y1 * s * pz]);
    }
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      ctx.moveTo(V[i][0], V[i][1]);
      ctx.lineTo(V[j][0], V[j][1]);
    }
    ctx.stroke();
    ctx.fillStyle = C.lime;
    for (const v of V) { ctx.beginPath(); ctx.arc(v[0], v[1], 12, 0, TAU); ctx.fill(); }
    word(ctx, '3D', 960, 540, 520, { wght: 900, wdth: 125 }, C.paper);
    return C.paper;
  },
  // UI — toggle flips on, cursor clicks
  (ctx, p, lt) => {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);
    const on = snap(seg(p, 0.15, 0.55));
    const tw = 520, th = 260, x = 960 - tw / 2, y = 330;
    ctx.fillStyle = on > 0.5 ? C.coral : '#D8D2C6';
    ctx.fillStyle = `rgb(${Math.round(lerp(216, 255, on))},${Math.round(lerp(210, 90, on))},${Math.round(lerp(198, 54, on))})`;
    roundRect(ctx, x, y, tw, th, th / 2);
    ctx.fill();
    const kx = lerp(x + th / 2, x + tw - th / 2, on);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(kx, y + th / 2, th / 2 - 22 + 18 * Math.sin(on * Math.PI), th / 2 - 22, 0, 0, TAU);
    ctx.fill();
    // cursor
    const cx = lerp(1320, kx + 40, E.outCubic(seg(p, 0, 0.2))), cy = lerp(900, y + th / 2 + 40, E.outCubic(seg(p, 0, 0.2)));
    const press = 1 - 0.15 * Math.sin(seg(p, 0.12, 0.3) * Math.PI);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(press * 1.6, press * 1.6);
    ctx.fillStyle = C.ink;
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 44); ctx.lineTo(11, 33); ctx.lineTo(20, 52); ctx.lineTo(28, 48); ctx.lineTo(19, 30); ctx.lineTo(34, 30); ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    word(ctx, 'UI', 960, 800, 300, { wght: 900, wdth: 125 }, C.ink);
    return C.ink;
  },
  // VFX — light burst
  (ctx, p, lt) => {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    const k = E.outExpo(p);
    const rnd = mulberry32(77);
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const a = rnd() * TAU, l0 = 60 + rnd() * 200, l1 = l0 + (200 + rnd() * 900) * k;
      ctx.strokeStyle = i % 3 === 0 ? C.coral : i % 3 === 1 ? C.lime : C.paper;
      ctx.lineWidth = 2 + rnd() * 5;
      ctx.beginPath();
      ctx.moveTo(960 + Math.cos(a) * l0 * k, 540 + Math.sin(a) * l0 * k);
      ctx.lineTo(960 + Math.cos(a) * l1, 540 + Math.sin(a) * l1);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(960, 540, 0, 960, 540, 420 * (0.6 + 0.4 * k));
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.3, 'rgba(255,160,120,0.55)');
    g.addColorStop(1, 'rgba(255,90,54,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    word(ctx, 'VFX', 960, 540, 900, { wght: 900, wdth: 125 }, C.ink);
    return C.paper;
  },
  // SOUND — waveform bars
  (ctx, p, lt) => {
    ctx.fillStyle = C.lime;
    ctx.fillRect(0, 0, W, H);
    const n = 48, bw = 1800 / n;
    ctx.fillStyle = C.ink;
    for (let i = 0; i < n; i++) {
      const env = Math.sin((i / (n - 1)) * Math.PI);
      const h = (80 + 520 * env * (0.5 + 0.5 * Math.sin(i * 0.9 + lt * 40) * Math.cos(i * 0.37 - lt * 23))) * (0.4 + 0.6 * E.outExpo(p));
      roundRect(ctx, 60 + i * bw + 5, 540 - h / 2, bw - 10, h, (bw - 10) / 2);
      ctx.fill();
    }
    ctx.fillStyle = C.lime;
    const r = F.layout('SOUND', 1000, { wght: 900, wdth: 125 });
    const size = (1200 / r.width) * 1000;
    const r2 = F.layout('SOUND', size, { wght: 900, wdth: 125 });
    ctx.lineWidth = 16;
    ctx.strokeStyle = C.lime;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const gl of r2.glyphs) tracePath(ctx, gl.g, 960 - r2.width / 2 + gl.x, 540 + r2.cap / 2, r2.s);
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.fill();
    return C.ink;
  },
  // CODE — typing
  (ctx, p, lt) => {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    const lines = [
      'const reel = frames.map(f =>',
      '  render(scene(f / 60), { blur: 8 }));',
      'export default reel; // 900/900 ✓',
    ];
    const chars = Math.floor(E.outCubic(p) * 110);
    let used = 0;
    ctx.font = '600 34px "JetBrains Mono", monospace';
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].slice(0, Math.max(0, chars - used));
      used += lines[i].length;
      ctx.fillStyle = i === 2 ? C.lime : C.paper;
      ctx.globalAlpha = 0.55;
      ctx.fillText(s, 360, 250 + i * 56);
    }
    ctx.globalAlpha = 1;
    word(ctx, 'CODE', 960, 640, 1150, { wght: 900, wdth: 125 }, C.lime);
    return C.paper;
  },
  // ALL OF IT.
  (ctx, p, lt) => {
    ctx.fillStyle = C.coral;
    ctx.fillRect(0, 0, W, H);
    const k = 1.25 - 0.25 * E.outExpo(p * 2);
    ctx.save();
    ctx.translate(960, 540);
    ctx.scale(k, k);
    ctx.translate(-960, -540);
    word(ctx, 'ALL OF IT.', 960, 540, 1500, { wght: 900, wdth: 125 }, C.ink);
    ctx.restore();
    return C.ink;
  },
];

export function draw(L, tl, env) {
  const ctx = L.ctx();
  const b = tl / BEAT;
  const bN = Math.round((env.tlN / BEAT) * 1e4) / 1e4;
  // pre-drop silence: pure black
  if (bN >= 3.75) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    return { hud: { color: C.paper, alpha: 0.5 }, fx: { vig: 0, grain: 0.03 } };
  }
  const k = Math.max(0, Math.min(7, Math.floor(bN / 0.5)));
  const lt = tl - k * 0.5 * BEAT;
  const p = lt / (0.5 * BEAT);
  // entry: snap-zoom from alternating directions
  const dir = k % 2 === 0 ? 1 : -1;
  const ent = E.outExpo(clamp(p / 0.45));
  ctx.save();
  ctx.translate(960 + dir * (1 - ent) * 240, 540 + (k % 3 === 0 ? (1 - ent) * 120 : 0));
  const sc = 1 + 0.18 * (1 - ent);
  ctx.scale(sc, sc);
  ctx.rotate(dir * (1 - ent) * 0.06);
  ctx.translate(-960, -540);
  ctx.fillStyle = C.ink;
  ctx.fillRect(-400, -400, W + 800, H + 800);
  const hudCol = CARDS[k](ctx, p, lt);
  ctx.restore();
  // card index tag
  mono(ctx, `06.${k + 1}`, 64, 150, { color: hudCol, size: 15, weight: 700 });
  return { hud: { color: hudCol }, fx: { vig: 0.25 } };
}

export const shutter = () => 1.2;
