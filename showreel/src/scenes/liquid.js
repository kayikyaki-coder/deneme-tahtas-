// 04 — Liquid. Signed-distance metaballs (smooth-min) shaded as glossy jelly in a fragment shader.
// The blobs orbit and pulse on the kick, then pour into the word FLUID (a CPU-built SDF of the
// type, smooth-unioned with the balls), wobble, and burst into droplets.
import { C, rgb01, hash1 } from '../util.js';
import { W, H, BEAT } from '../timeline.js';
import { E, seg, snap, glide, clamp, lerp, pulse, TAU } from '../ease.js';
import { tracePath } from '../type.js';
import { mono } from '../draw.js';

const NB = 22;
const NT = 8; // droplets born from the type when it bursts
const SW = 960, SH = 540; // SDF resolution (half of design res)

// Pass A (half res): the expensive signed distance field.
export const FIELD = `
uniform sampler2D uText;
uniform vec4 uBalls[${NB}];
uniform float uTextMix, uTextGrow, uK, uTime, uWobble;
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
void main(){
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * vec2(1920.0, 1080.0);
  float d = 1e4;
  for (int i = 0; i < ${NB}; i++){
    vec4 b = uBalls[i];
    if (b.z <= 0.0) continue;
    d = smin(d, length(p - b.xy) - b.z, uK * b.w);
  }
  if (uTextMix > 0.0) {
    vec2 wob = vec2(sin(p.y * 0.012 + uTime * 6.0), cos(p.x * 0.01 + uTime * 5.0)) * uWobble;
    float dt = texture(uText, vec2((p.x + wob.x) / 1920.0, 1.0 - (p.y + wob.y) / 1080.0)).r;
    d = smin(d, mix(600.0, dt + uTextGrow, uTextMix), uK * 0.9);
  }
  o = vec4(d, 0.0, 0.0, 1.0);
}`;

// Pass B (full res): shading from the bilinearly-upsampled field (SDFs upsample cleanly).
export const SHADER = `
uniform sampler2D uField;
uniform float uTime;
uniform vec3 uBg, uBg2, uC1, uC2, uC3, uShadow;
float D(vec2 p){ return texture(uField, vec2(p.x / 1920.0, 1.0 - p.y / 1080.0)).r; }
void main(){
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * vec2(1920.0, 1080.0);
  float d = D(p);
  float e = 3.0;
  vec2 g = vec2(D(p + vec2(e, 0.0)) - D(p - vec2(e, 0.0)), D(p + vec2(0.0, e)) - D(p - vec2(0.0, e)));
  float gl = length(g);
  g = gl > 1e-4 ? g / gl : vec2(0.0);
  float ds = D(p - vec2(26.0, 38.0));
  float sh = (1.0 - smoothstep(-25.0, 34.0, ds)) * 0.5;
  vec3 bg = mix(uBg2, uBg, smoothstep(0.0, 1080.0, p.y + 200.0 * sin(p.x * 0.002 + uTime * 0.6)));
  bg = mix(bg, uShadow, sh);
  float inside = -d;
  float s = smoothstep(0.0, 42.0, inside);
  vec3 n = normalize(vec3(g * (1.0 - s) * 1.5, 0.3 + s));
  vec3 L = normalize(vec3(-0.55, 0.65, 0.75));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 80.0);
  float spec2 = pow(clamp(dot(n, normalize(vec3(0.6, -0.35, 0.8))), 0.0, 1.0), 24.0);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.0);
  float band = 0.5 + 0.5 * sin(p.x * 0.004 - p.y * 0.003 + uTime * 1.3);
  vec3 base = mix(uC1, uC2, band * 0.75);
  vec3 col = base * (0.5 + 0.58 * diff);
  col = mix(col, uC3, fres * 0.5);
  col += vec3(1.0) * spec * 0.9 + uC3 * spec2 * 0.22;
  col *= 0.84 + 0.16 * smoothstep(0.0, 14.0, inside);
  float aa = clamp(0.5 - d * (uRes.x / 1920.0), 0.0, 1.0);
  o = vec4(mix(bg, col, aa), 1.0);
}`;

let sdf = null;

// Felzenszwalb-Huttenlocher squared EDT (1D)
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}

export function init(R) {
  // render the word at SDF resolution, then build a signed distance field (in design px)
  const F = R.fonts.archivo;
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const x = c.getContext('2d', { willReadFrequently: true });
  const run = F.layout('FLUID', 1000, { wght: 900, wdth: 112 });
  const size = (1500 / run.width) * 1000;
  const r2 = F.layout('FLUID', size, { wght: 900, wdth: 112 });
  const k = SW / 1920;
  x.scale(k, k);
  x.fillStyle = '#fff';
  x.beginPath();
  const bx = 960 - r2.width / 2, by = 540 + r2.cap / 2;
  for (const gl of r2.glyphs) tracePath(x, gl.g, bx + gl.x, by, r2.s);
  x.fill();
  const img = x.getImageData(0, 0, SW, SH).data;
  const N = SW * SH;
  const out = new Float64Array(N), inn = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const on = img[i * 4 + 3] > 127;
    out[i] = on ? 0 : 1e20;
    inn[i] = on ? 1e20 : 0;
  }
  edt2d(out, SW, SH);
  edt2d(inn, SW, SH);
  sdf = new Float32Array(N);
  // flip rows so texture v=0 is the bottom (shader samples with 1 - y)
  for (let y = 0; y < SH; y++)
    for (let xx = 0; xx < SW; xx++) {
      const i = y * SW + xx;
      sdf[(SH - 1 - y) * SW + xx] = (Math.sqrt(out[i]) - Math.sqrt(inn[i])) / k;
    }
  R.gl.floatTexture('liquidText', SW, SH, sdf);
  R.gl.target('liquidField', Math.round(R.w / 2), Math.round(R.h / 2));
}

function balls(tl) {
  const b = tl / BEAT;
  const arr = new Float32Array(NB * 4);
  // whip-in: the arrangement spins in fast and settles (continues the 3D whip-pan)
  const spin = -2.6 * (1 - E.outExpo(seg(b, 0, 0.9)));
  const conv = snap(seg(b, 1.7, 2.3)); // pour into the type
  const implode = E.inExpo(seg(b, 3.35, 3.97));
  for (let i = 0; i < NB - NT; i++) {
    const main = i < 8;
    const a0 = (i / NB) * TAU + hash1(i) * 0.8;
    const w = (main ? 0.9 : -1.6) * (1 + hash1(i + 9) * 0.6);
    const ang = a0 + w * tl + spin;
    let rad = main ? 170 + 150 * Math.sin(tl * 2.1 + i) : 330 + 60 * Math.sin(tl * 3 + i * 2);
    let r = main ? 95 + 40 * hash1(i + 3) : 22 + 20 * hash1(i + 5);
    // kick pulse
    let kick = 0;
    for (let k = 0; k < 4; k++) kick += pulse(b, k, 0.25);
    r *= 1 + 0.16 * kick * (main ? 1 : 0.5);
    let x = 960 + Math.cos(ang) * rad * 1.45;
    let y = 540 + Math.sin(ang) * rad * 0.85;
    // converge into the word: main balls line up along the word, satellites stay as droplets
    if (main) {
      const tx = 960 + (i / 7 - 0.5) * 1300, ty = 540 + Math.sin(i * 1.7 + tl * 4) * 30;
      x = lerp(x, tx, conv);
      y = lerp(y, ty, conv);
      r = lerp(r, 58 + 20 * Math.sin(tl * 5 + i), conv);
    }
    // finale: everything drains into a single drop at the centre (the particle burst starts there)
    if (implode > 0) {
      x = lerp(x, 960, implode);
      y = lerp(y, 540, implode);
      r = lerp(r, main ? 16 : 6, implode);
    }
    arr[i * 4] = x;
    arr[i * 4 + 1] = y;
    arr[i * 4 + 2] = Math.max(0, r);
    arr[i * 4 + 3] = main ? 1 : 0.55;
  }
  // type droplets: pinch off the letters and rush to the centre as the word drains away
  const pop = seg(b, 3.3, 3.97);
  for (let j = 0; j < NT; j++) {
    const i = NB - NT + j;
    if (pop <= 0) { arr[i * 4 + 2] = 0; continue; }
    const sx = 960 + (j / (NT - 1) - 0.5) * 1350, sy = 540 + (hash1(j + 40) - 0.5) * 160;
    const k = E.inCubic(pop);
    arr[i * 4] = lerp(sx, 960, k);
    arr[i * 4 + 1] = lerp(sy, 540, k) - Math.sin(k * Math.PI) * 120 * (hash1(j + 60) - 0.5);
    arr[i * 4 + 2] = (40 + 24 * hash1(j + 70)) * Math.min(1, pop * 6) * (1 - 0.8 * k);
    arr[i * 4 + 3] = 0.8;
  }
  return arr;
}

export function draw(L, tl, env) {
  const b = tl / BEAT;
  const textIn = snap(seg(b, 1.75, 2.3));
  const textOut = E.inCubic(seg(b, 3.3, 3.8));
  const gl = env.R.gl;
  gl.draw('liquidField', {
    uText: 'liquidText',
    uBalls: balls(tl),
    uTextMix: textIn,
    uTextGrow: lerp(140, 0, textIn) + textOut * 120,
    uK: 70,
    uTime: tl,
    uWobble: 3 + 14 * pulse(b, 3, 0.3) + 10 * pulse(b, 2.5, 0.25),
  }, gl.targets.liquidField, 'none');
  L.shader('liquid', {
    uField: 'liquidField',
    uTime: tl,
    uBg: rgb01(C.cobalt),
    uBg2: rgb01('#1E33C9'),
    uC1: rgb01(C.coral),
    uC2: rgb01(C.pink),
    uC3: rgb01('#FFE3F1'),
    uShadow: rgb01('#12208F'),
  });
  const ctx = L.ctx();
  const ov = E.outExpo(seg(b, 0.5, 1.0)) * (1 - seg(b, 3.4, 3.7));
  if (ov > 0.01) {
    ctx.globalAlpha = ov * 0.9;
    mono(ctx, `SDF · SMOOTH-MIN k=70 · ${NB} BODIES · 1 SHADER`, 64, 150, { color: C.paper, size: 15, weight: 600 });
    ctx.globalAlpha = 1;
  }
  return { hud: { color: C.paper }, fx: { vig: 0.3 } };
}

export const shutter = (tl) => (tl / BEAT < 0.5 ? 1.8 : 1);
export const mbBoost = (tl) => (tl / BEAT < 0.5 ? 1 : tl / BEAT > 3.5 ? 1 : 0.5);
