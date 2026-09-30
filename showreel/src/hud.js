// Viewfinder / editor HUD that frames the whole reel.
import { C, rgba, scramble } from './util.js';
import { FPS, FRAMES, SECTIONS, W, H, BEAT } from './timeline.js';
import { seg, E, clamp } from './ease.js';

const MONO = '"JetBrains Mono", monospace';
const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');

function timecode(t) {
  const f = Math.max(0, Math.round(t * FPS));
  const s = Math.floor(f / FPS);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f % FPS)}`;
}

export function drawHUD(L, { t, f, sec, hud = {} }) {
  if (hud.hide) return;
  const ctx = L.ctx();
  ctx.save();
  const col = hud.color || C.paper;
  const alpha = hud.alpha ?? 1;
  const boot = seg(t, 0.02, 0.5);
  if (boot <= 0) return;
  ctx.globalAlpha = alpha;

  // corner brackets
  const I = 34, Lb = 26 * E.outExpo(boot);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[I, I, 1, 1], [W - I, I, -1, 1], [I, H - I, 1, -1], [W - I, H - I, -1, -1]]) {
    ctx.moveTo(x, y + dy * Lb);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * Lb, y);
  }
  ctx.stroke();

  ctx.font = `500 15px ${MONO}`;
  ctx.letterSpacing = '2.2px';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col;
  const type = (s, p) => s.slice(0, Math.floor(s.length * clamp(p)));

  // top-left identity
  const p1 = seg(t, 0.06, 0.55);
  ctx.textAlign = 'left';
  ctx.fillText(type('CLAUDE — MOTION DESIGN', p1), 64, 70);
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillText(type('SHOWREEL 2026 · 1920×1080 · 60 FPS', seg(t, 0.2, 0.75)), 64, 94);
  ctx.globalAlpha = alpha;

  // top-right: REC + timecode
  ctx.textAlign = 'right';
  const tc = timecode(Math.min(t, FRAMES / FPS));
  ctx.fillText(type('TC ' + tc, seg(t, 0.1, 0.4)), W - 64, 70);
  const blink = Math.floor(t / (BEAT / 2)) % 2 === 0;
  if (boot > 0.5) {
    ctx.globalAlpha = alpha * (blink ? 1 : 0.25);
    ctx.fillStyle = hud.rec || C.coral;
    ctx.beginPath();
    ctx.arc(W - 64 - ctx.measureText('TC ' + tc).width - 110, 64.5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.fillText('REC', W - 64 - ctx.measureText('TC ' + tc).width - 26, 70);
  }
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillText(type(`BPM 128.57 · BEAT ${pad(Math.floor(t / BEAT) + 1)}/32`, seg(t, 0.25, 0.8)), W - 64, 94);
  ctx.globalAlpha = alpha;

  // bottom-left: section label with a decode effect on every section change
  ctx.textAlign = 'left';
  const label = hud.label || sec.label;
  const since = t - sec.t0;
  const dec = sec.index === 0 ? seg(t, 0.3, 0.9) : seg(since, 0.0, 0.32);
  ctx.fillText(scramble(label, dec, sec.index * 7, t), 64, H - 58);

  // bottom-right: frame counter
  ctx.textAlign = 'right';
  ctx.fillText(`F ${pad(Math.min(f, FRAMES - 1), 4)} / ${FRAMES}`, W - 64, H - 58);

  // progress rail with section ticks
  const x0 = 64, x1 = W - 64, y = H - 42;
  const grow = E.outExpo(seg(t, 0.1, 0.8));
  ctx.globalAlpha = alpha * 0.28;
  ctx.fillRect(x0, y, (x1 - x0) * grow, 2);
  ctx.globalAlpha = alpha;
  const prog = clamp(t / (FRAMES / FPS));
  ctx.fillRect(x0, y, (x1 - x0) * prog * grow, 2);
  for (const s of SECTIONS) {
    const x = x0 + (x1 - x0) * (s.t0 / (FRAMES / FPS));
    if (x > x1 || s.index === 0) continue;
    ctx.globalAlpha = alpha * (t >= s.t0 ? 1 : 0.35) * grow;
    ctx.fillRect(x - 1, y - 5, 2, 12);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
