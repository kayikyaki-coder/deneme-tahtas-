// 07 — End card. Final hit: CLAUDE unfolds through the variable axes (thin-condensed ->
// black-expanded) from the centre out; the intro's coral line returns as the baseline and the
// brand dot lands at its end (same blip as frame 3). Slow push-in, then fade out.
import { C } from '../util.js';
import { W, H, BEAT, FRAMES, FPS } from '../timeline.js';
import { E, seg, spring, snap, glide, clamp, lerp, TAU } from '../ease.js';
import { tracePath } from '../type.js';
import { mono } from '../draw.js';

let F, S;
const NAME = 'CLAUDE';
const NW = 1380;

export function init(R) {
  F = R.fonts.archivo;
  S = R.fonts.serif;
}

export function draw(L, tl, env) {
  const ctx = L.ctx();
  const b = tl / BEAT;
  const tEnd = FRAMES / FPS - (28 * BEAT);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // dot grid (bookend with the intro)
  const ga = 0.06 * seg(b, 0.2, 1.2);
  ctx.fillStyle = C.paper;
  ctx.globalAlpha = ga;
  for (let y = 30; y < H; y += 60) for (let x = 30; x < W; x += 60) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  ctx.globalAlpha = 1;

  // slow push-in over the hold
  const push = 1 + 0.035 * E.outCubic(seg(tl, 0, tEnd)) + 0.06 * (1 - E.outExpo(seg(b, 0, 0.6)));
  ctx.save();
  ctx.translate(960, 540);
  ctx.scale(push, push);
  ctx.translate(-960, -540);

  // name: per-glyph axes spring open from the centre outwards
  const n = NAME.length;
  const axes = (i) => {
    const d = Math.abs(i - (n - 1) / 2);
    const k = spring(tl + 0.02 - d * 0.035, 3.2, 0.5);
    return { wght: lerp(600, 900, clamp(k, 0, 1.15)), wdth: Math.min(125, lerp(84, 125, k)) };
  };
  // fixed layout size from the final state so the unfold grows outward from the centre
  const final = F.layout(NAME, 1000, { wght: 900, wdth: 125 });
  const size = (NW / final.width) * 1000;
  const run = F.layout(NAME, size, { axes, kerning: false });
  const baseY = 560;
  const x0 = 960 - run.width / 2 - 30;
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  for (const gl of run.glyphs) tracePath(ctx, gl.g, x0 + gl.x, baseY, run.s);
  ctx.fill();

  // impact shockwave ring
  const rp = seg(tl, 0, 0.55);
  if (rp > 0 && rp < 1) {
    ctx.strokeStyle = C.coral;
    ctx.globalAlpha = (1 - rp) * 0.9;
    ctx.lineWidth = 10 * (1 - rp) + 1;
    ctx.beginPath();
    ctx.arc(960, 520, 80 + E.outExpo(rp) * 1100, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // baseline rail (the intro line returns) + brand dot at its end
  const railP = snap(seg(b, 0.55, 1.2));
  const fullW = NW + 120;
  const rx0 = 960 - fullW / 2 - 30;
  ctx.fillStyle = C.coral;
  if (railP > 0) ctx.fillRect(960 - (fullW / 2) * railP - 30, baseY + 34, fullW * railP, 4);
  const dotT = 2.0 * BEAT;
  const dr = 26 * spring(tl - dotT, 3.4, 0.35);
  if (dr > 0.1) {
    const drop = (1 - E.outBounce ? 0 : 0);
    ctx.beginPath();
    ctx.arc(x0 + run.width + 52, baseY - dr - 1 + drop, dr, 0, TAU);
    ctx.fill();
  }

  // subtitle in the serif italic, masked rise
  const sp = glide(seg(b, 1.0, 1.7));
  if (sp > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, baseY + 50, W, 140);
    ctx.clip();
    const sr = S.layout('motion designer', 92);
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    for (const gl of sr.glyphs) tracePath(ctx, gl.g, 960 - sr.width / 2 + gl.x, baseY + 140 + (1 - sp) * 120, sr.s);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // footer lines
  const t1 = seg(b, 0.6, 1.1);
  if (t1 > 0) {
    const s = 'SHOWREEL 2026 — 15 SECONDS — 900 FRAMES — 0 WASTED';
    ctx.globalAlpha = 0.7;
    mono(ctx, s.slice(0, Math.floor(s.length * t1)), 960, 290, { color: C.paper, size: 17, weight: 600, align: 'center' });
    ctx.globalAlpha = 1;
  }
  const t2 = seg(b, 2.0, 2.6);
  if (t2 > 0) {
    const s = 'AVAILABLE FOR NEW PROJECTS  →';
    mono(ctx, s.slice(0, Math.floor(s.length * t2)), 960, 850, { color: C.coral, size: 20, weight: 800, align: 'center' });
  }

  // fade to black over the last 12 frames
  const fo = seg(tl, tEnd - 12 / FPS, tEnd - 1 / FPS);
  if (fo > 0) {
    ctx.fillStyle = `rgba(0,0,0,${E.inCubic(fo)})`;
    ctx.fillRect(0, 0, W, H);
  }
  return {
    hud: { color: C.paper, label: '07 / YOUR PROJECT HERE', alpha: 1 - fo },
    fx: { bloom: 0.25, thresh: 0.62, vig: 0.4, flash: 0.22 * Math.exp(-Math.max(0, tl) * 40) },
  };
}

export const mbBoost = (tl) => (tl / BEAT < 0.7 ? 1.5 : 0.5);
