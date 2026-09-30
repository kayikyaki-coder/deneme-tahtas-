// Single source of truth for timing. Everything is locked to a 28-frames-per-beat grid:
// 60 fps / 28 = 128.571 BPM, and 48 kHz audio gets exactly 22400 samples per beat.
export const W = 1920;
export const H = 1080;
export const FPS = 60;
export const FRAMES = 900;
export const FPB = 28;
export const BEAT = FPB / FPS;
export const BAR = BEAT * 4;
export const DURATION = FRAMES / FPS;

export const b2t = (b) => b * BEAT;
// beats from seconds, rounded to 1/1000 frame so frame-aligned times land exactly on the grid
export const t2b = (t) => Math.round(t * FPS * 1000) / 1000 / FPB;

// Section boundaries in beats. `label` feeds the HUD.
export const SECTIONS = [
  { id: 'intro', b0: 0, b1: 4, label: '00 / BOOT SEQUENCE' },
  { id: 'kinetic', b0: 4, b1: 8, label: '01 / KINETIC TYPE' },
  { id: 'grid', b0: 8, b1: 12, label: '02 / SHAPE SYSTEMS' },
  { id: 'depth', b0: 12, b1: 16, label: '03 / 3D + DEPTH' },
  { id: 'liquid', b0: 16, b1: 20, label: '04 / LIQUID SIMULATION' },
  { id: 'particles', b0: 20, b1: 24, label: '05 / PARTICLES + GLITCH' },
  { id: 'rapid', b0: 24, b1: 28, label: '06 / EVERYTHING AT ONCE' },
  { id: 'outro', b0: 28, b1: 40, label: '07 / END CARD' },
].map((s, i) => ({ ...s, index: i, t0: b2t(s.b0), t1: b2t(s.b1) }));

export function sectionAt(t) {
  const b = t2b(t);
  for (const s of SECTIONS) if (b < s.b1) return s;
  return SECTIONS[SECTIONS.length - 1];
}

// ---------------------------------------------------------------------------
// Time remapping (freeze-frame stutters that mirror the audio beat-repeat).
// Each entry: from `at` (beats) until the next entry, content time plays from `src` (beats).
// Filled in from the audio glitch schedule; identity everywhere else.
export const STUTTER = [];

export function setStutter(list) {
  STUTTER.length = 0;
  for (const e of list) STUTTER.push(e);
  STUTTER.sort((a, b) => a.at - b.at);
}

// Returns { tc, rate }: content time and its local playback rate.
export function remap(t) {
  const b = t2b(t);
  let cur = null;
  for (const e of STUTTER) {
    if (b >= e.at && b < e.until) cur = e;
  }
  if (!cur) return { tc: t, rate: 1 };
  const rate = cur.rate ?? 1;
  return { tc: b2t(cur.src) + (t - b2t(cur.at)) * rate, rate };
}
