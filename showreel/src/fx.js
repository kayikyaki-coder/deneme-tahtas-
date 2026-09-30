// Per-frame post-processing parameters driven by the beat grid (impacts, glitch break, grade).
import { BEAT, t2b } from './timeline.js';
import { pulse, seg, clamp } from './ease.js';
import { rgb01, C } from './util.js';

// Downbeat impacts: strength scales lens punch, chromatic aberration and exposure kick.
export const IMPACTS = [
  { b: 4, s: 1.0 },
  { b: 8, s: 0.45 },
  { b: 12, s: 0.55 },
  { b: 16, s: 0.5 },
  { b: 20, s: 0.45 },
  { b: 22, s: 0.7 },
  { b: 24, s: 0.85 },
  { b: 28, s: 1.25 },
];

// Glitch intensity envelope (beats) for the break; the stutter itself lives in timeline.STUTTER.
function glitchAmount(b) {
  let g = 0;
  if (b >= 22.5 && b < 24) {
    const k = seg(b, 22.5, 23.9);
    g = 0.25 + 0.75 * k;
    // stronger right on each retrigger
    const sub = b < 23 ? 0.25 : b < 23.5 ? 0.125 : 0.0625;
    const ph = ((b - 22.5) % sub) / sub;
    g *= 0.55 + 0.45 * Math.exp(-ph * 4);
  }
  return clamp(g, 0, 1);
}

export function postFX(t, sec, sceneFx = {}) {
  const b = t2b(t);
  let ca = 1.2;
  let warp = 0;
  let exposure = 1;
  let flash = 0;
  for (const im of IMPACTS) {
    const p = pulse(t, im.b * BEAT, 0.085) * im.s;
    ca += 16 * p;
    warp += 0.18 * p;
    exposure += 0.18 * p;
  }
  const glitch = glitchAmount(b);
  ca += glitch * 22;
  const P = {
    bloom: 0.0,
    thresh: 0.72,
    ca,
    grain: 0.045,
    vig: 0.28,
    glitch,
    flash,
    flashCol: rgb01(C.paper),
    exposure,
    invert: 0,
    scan: glitch > 0.2 ? glitch : 0,
    warp,
    shift: [0, 0],
    ...sceneFx,
  };
  if (sceneFx.ca !== undefined) P.ca = sceneFx.ca + (ca - 1.2);
  return P;
}
