// Render core. Scenes draw into a software 2D canvas; sub-frames are accumulated in linear light
// (true motion blur), then a JS post chain applies bloom, lens punch, chromatic aberration, glitch,
// HUD, grain and dithering. WebGL (SwiftShader) is only used for shader-driven layers.
import { GL } from './gl.js';
import { W, H, FPS, remap, sectionAt, setStutter } from './timeline.js';
import { loadFont } from './type.js';
import { drawHUD } from './hud.js';
import { postFX } from './fx.js';
import { SCENES, SHADERS } from './scenes/index.js';
import { mulberry32 } from './util.js';

const R = (window.reel = { ready: false });

// sRGB byte -> linear
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN[i] = Math.pow(i / 255, 2.2);
// sqrt(linear) index -> sRGB 0..255 (float; rounding/dither happens at write)
const LUTN = 16383;
const TOS = new Float32Array(LUTN + 1);
for (let i = 0; i <= LUTN; i++) TOS[i] = 255 * Math.pow(i / LUTN, 2 / 2.2);

class Layers {
  constructor(ctx) {
    this.main = ctx;
  }
  ctx() {
    return this.main;
  }
  // Shader layer rendered by WebGL, composited onto the 2D canvas.
  shader(name, uniforms = {}, opts = {}) {
    R.gl.draw(name, uniforms, null, 'none');
    const ctx = this.main;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opts.opacity ?? 1;
    ctx.globalCompositeOperation = opts.blend || 'source-over';
    ctx.drawImage(R.glCanvas, 0, 0, R.w, R.h);
    ctx.restore();
  }
  // Offscreen group (group opacity / masks / blend). Draw into the returned ctx, then call done().
  group(opts = {}) {
    const i = (R.gi = ((R.gi || 0) + 1) % 4);
    let c = R.groups[i];
    if (!c) {
      c = R.groups[i] = document.createElement('canvas');
      c.width = R.w;
      c.height = R.h;
    }
    const g = c.getContext('2d');
    g.reset();
    g.setTransform(R.s, 0, 0, R.s, 0, 0);
    const main = this.main;
    g.canvas_ = c;
    g.done = (o2 = {}) => {
      main.save();
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalAlpha = o2.opacity ?? opts.opacity ?? 1;
      main.globalCompositeOperation = o2.blend || opts.blend || 'source-over';
      main.drawImage(c, 0, 0);
      main.restore();
    };
    return g;
  }
}
R.Layers = Layers;

R.init = async (opts = {}) => {
  const s = opts.scale || 1;
  R.s = s;
  R.w = Math.round(W * s);
  R.h = Math.round(H * s);
  R.N = R.w * R.h;
  R.groups = [];
  R.canvas = document.createElement('canvas');
  R.canvas.width = R.w;
  R.canvas.height = R.h;
  R.ctx = R.canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  R.hudCanvas = document.createElement('canvas');
  R.hudCanvas.width = R.w;
  R.hudCanvas.height = R.h;
  R.hudCtx = R.hudCanvas.getContext('2d', { willReadFrequently: true });
  R.acc = new Float32Array(R.N * 3);
  R.out = new Uint8ClampedArray(R.N * 4);
  R.bw = Math.ceil(R.w / 4);
  R.bh = Math.ceil(R.h / 4);
  R.bloomA = new Float32Array(R.bw * R.bh * 3);
  R.bloomB = new Float32Array(R.bw * R.bh * 3);
  R.bloomT = new Float32Array(R.bw * R.bh * 3);
  // vignette base map (1 center -> 0 corners)
  R.vmap = new Float32Array(R.N);
  for (let y = 0; y < R.h; y++)
    for (let x = 0; x < R.w; x++) {
      const dx = x / R.w - 0.5, dy = (y / R.h - 0.5) * 0.8;
      const d = Math.sqrt(dx * dx + dy * dy) / 0.64;
      R.vmap[y * R.w + x] = Math.max(0, 1 - d * d * d * 0.9);
    }
  // film grain plates: softened gaussian-ish noise, cycled per frame with random offsets
  R.grain = [];
  const rnd = mulberry32(99);
  for (let k = 0; k < 3; k++) {
    const raw = new Float32Array(R.N);
    for (let i = 0; i < R.N; i++) raw[i] = rnd() + rnd() + rnd() - 1.5;
    const g = new Int8Array(R.N);
    for (let y = 0; y < R.h; y++)
      for (let x = 0; x < R.w; x++) {
        const i = y * R.w + x;
        const l = x > 0 ? raw[i - 1] : raw[i], r = x < R.w - 1 ? raw[i + 1] : raw[i];
        const u = y > 0 ? raw[i - R.w] : raw[i], d = y < R.h - 1 ? raw[i + R.w] : raw[i];
        g[i] = Math.max(-127, Math.min(127, Math.round((raw[i] * 0.6 + (l + r + u + d) * 0.1) * 150)));
      }
    R.grain.push(g);
  }
  R.glCanvas = document.getElementById('out');
  R.gl = new GL(R.glCanvas, R.w, R.h);
  for (const [name, src] of Object.entries(SHADERS)) R.gl.program(name, src);
  R.fonts = {
    archivo: await loadFont('assets/fonts/Archivo.ttf'),
    serif: await loadFont('assets/fonts/InstrumentSerif-Italic.ttf'),
    serifR: await loadFont('assets/fonts/InstrumentSerif-Regular.ttf'),
    mono: await loadFont('assets/fonts/JetBrainsMono.ttf'),
  };
  await Promise.all([
    document.fonts.load('500 16px "JetBrains Mono"'),
    document.fonts.load('800 16px "JetBrains Mono"'),
    document.fonts.load('italic 16px "Instrument Serif"'),
    document.fonts.load('16px "Instrument Serif"'),
    document.fonts.load('900 16px "Archivo"'),
  ]);
  if (opts.stutter) setStutter(opts.stutter);
  for (const sc of Object.values(SCENES)) if (sc.init) await sc.init(R);
  R.ready = true;
  return { w: R.w, h: R.h };
};

function accumulate(first, w) {
  const d32 = new Uint32Array(R.ctx.getImageData(0, 0, R.w, R.h).data.buffer);
  const acc = R.acc, N = R.N;
  if (first) {
    for (let p = 0, j = 0; p < N; p++, j += 3) {
      const v = d32[p];
      acc[j] = LIN[v & 255] * w;
      acc[j + 1] = LIN[(v >>> 8) & 255] * w;
      acc[j + 2] = LIN[(v >>> 16) & 255] * w;
    }
  } else {
    for (let p = 0, j = 0; p < N; p++, j += 3) {
      const v = d32[p];
      acc[j] += LIN[v & 255] * w;
      acc[j + 1] += LIN[(v >>> 8) & 255] * w;
      acc[j + 2] += LIN[(v >>> 16) & 255] * w;
    }
  }
}

// Separable box blur on a 3-channel float image (result in src), radius r.
function boxBlur(src, tmp, w, h, r) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w * 3;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x)) * 3 + c];
      for (let x = 0; x < w; x++) {
        tmp[row + x * 3 + c] = sum * k;
        const xa = Math.min(w - 1, x + r + 1), xs = Math.max(0, x - r);
        sum += src[row + xa * 3 + c] - src[row + xs * 3 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w * 3 + x * 3 + c];
      for (let y = 0; y < h; y++) {
        src[y * w * 3 + x * 3 + c] = sum * k;
        const ya = Math.min(h - 1, y + r + 1), ys = Math.max(0, y - r);
        sum += tmp[ya * w * 3 + x * 3 + c] - tmp[ys * w * 3 + x * 3 + c];
      }
    }
  }
}

function bloom(P) {
  const { acc, w, h, bw, bh, bloomA, bloomB, bloomT } = R;
  const th = P.thresh, knee = th * 0.5;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = by * 4; yy < Math.min(h, by * 4 + 4); yy += 2)
        for (let xx = bx * 4; xx < Math.min(w, bx * 4 + 4); xx += 2) {
          const j = (yy * w + xx) * 3;
          r += acc[j]; g += acc[j + 1]; b += acc[j + 2]; n++;
        }
      r /= n; g /= n; b /= n;
      const br = Math.max(r, g, b);
      let soft = Math.min(Math.max(br - th + knee, 0), 2 * knee);
      soft = (soft * soft) / (4 * knee + 1e-5);
      const cf = Math.max(soft, br - th) / Math.max(br, 1e-5);
      const o = (by * bw + bx) * 3;
      bloomA[o] = r * cf; bloomA[o + 1] = g * cf; bloomA[o + 2] = b * cf;
    }
  bloomB.set(bloomA);
  const rs = Math.max(1, Math.round(3 * R.s));
  boxBlur(bloomA, bloomT, bw, bh, rs);
  boxBlur(bloomA, bloomT, bw, bh, rs);
  const rl = Math.max(2, Math.round(14 * R.s));
  boxBlur(bloomB, bloomT, bw, bh, rl);
  boxBlur(bloomB, bloomT, bw, bh, rl);
  boxBlur(bloomB, bloomT, bw, bh, rl);
  for (let i = 0; i < bloomA.length; i++) bloomA[i] = bloomA[i] * 0.6 + bloomB[i] * 0.9;
}

function post(f, P) {
  const { w, h, acc, out, vmap, bw, bh, bloomA } = R;
  const hud = new Uint32Array(R.hudCtx.getImageData(0, 0, w, h).data.buffer);
  const useBloom = P.bloom > 0.001;
  if (useBloom) bloom(P);
  const grain = R.grain[f % 3];
  const goff = Math.floor(mulberry32(f * 7 + 1)() * R.N);
  const N = R.N;
  const gAmp = (P.grain * 255) / 150;
  const cx = w / 2, cy = h / 2;
  const caK = (P.ca * R.s) / (w / 2); // px of R/B split at the frame edge -> per-px factor
  const exp = P.exposure;
  const vig = P.vig;
  const flash = P.flash;
  const fl = P.flashCol.map((c) => Math.pow(c, 2.2));
  const inv = P.invert > 0.5;
  const warp = P.warp;
  const bamt = P.bloom;
  const G = P.glitch;
  const rnd = mulberry32(Math.floor(f * 13 + 7));
  let rowShift = null, blocks = null;
  const BX = 24, BY = 14;
  if (G > 0.001) {
    rowShift = new Int32Array(h);
    const rows = 10 + Math.floor(rnd() * 40);
    const rh = Math.ceil(h / rows);
    for (let r = 0; r < rows; r++) {
      const on = rnd() < 0.55 * G;
      const sh = on ? Math.round((rnd() - 0.5) * 0.25 * G * w) : 0;
      for (let y = r * rh; y < Math.min(h, (r + 1) * rh); y++) rowShift[y] = sh;
    }
    blocks = new Int32Array(BX * BY * 3);
    for (let i = 0; i < BX * BY; i++) {
      if (rnd() < 0.16 * G) {
        blocks[i * 3] = Math.round((rnd() - 0.5) * 0.12 * G * w);
        blocks[i * 3 + 1] = Math.round((rnd() - 0.5) * 0.12 * G * h);
        blocks[i * 3 + 2] = rnd() < 0.5 ? 1 : 2; // 1 = channel swap, 2 = posterize
      }
    }
  }
  const scan = P.scan;
  const shiftX = Math.round(P.shift[0] * w), shiftY = Math.round(P.shift[1] * h);
  const inv3 = 1 / 3;
  for (let y = 0; y < h; y++) {
    const scanK = scan > 0 && (y >> 1) % 2 === 0 ? 1 - scan * 0.18 : 1;
    const byRow = Math.floor((y / h) * BY) * BX;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let sx = x + shiftX, sy = y + shiftY;
      let mode = 0;
      if (rowShift) {
        sx += rowShift[y];
        const bi = byRow + Math.floor((x / w) * BX);
        sx += blocks[bi * 3];
        sy += blocks[bi * 3 + 1];
        mode = blocks[bi * 3 + 2];
      }
      if (warp > 0.0005) {
        const dx = (sx - cx) / w, dy = (sy - cy) / w;
        const k = 1 - warp * (dx * dx + dy * dy) * 2.2;
        sx = cx + (sx - cx) * k;
        sy = cy + (sy - cy) * k;
      }
      const ox = (sx - cx) * caK, oy = (sy - cy) * caK;
      let xr = Math.round(sx + ox), yr = Math.round(sy + oy);
      let xg = Math.round(sx), yg = Math.round(sy);
      let xb = Math.round(sx - ox), yb = Math.round(sy - oy);
      xr = xr < 0 ? 0 : xr >= w ? w - 1 : xr; yr = yr < 0 ? 0 : yr >= h ? h - 1 : yr;
      xg = xg < 0 ? 0 : xg >= w ? w - 1 : xg; yg = yg < 0 ? 0 : yg >= h ? h - 1 : yg;
      xb = xb < 0 ? 0 : xb >= w ? w - 1 : xb; yb = yb < 0 ? 0 : yb >= h ? h - 1 : yb;
      let r = acc[(yr * w + xr) * 3];
      let g = acc[(yg * w + xg) * 3 + 1];
      let b = acc[(yb * w + xb) * 3 + 2];
      if (useBloom) {
        const fx = Math.min(bw - 1.001, Math.max(0, xg / 4 - 0.5)), fy = Math.min(bh - 1.001, Math.max(0, yg / 4 - 0.5));
        const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
        const a0 = (y0 * bw + x0) * 3, a1 = a0 + 3, a2 = a0 + bw * 3, a3 = a2 + 3;
        const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty), w2 = (1 - tx) * ty, w3 = tx * ty;
        r += (bloomA[a0] * w0 + bloomA[a1] * w1 + bloomA[a2] * w2 + bloomA[a3] * w3) * bamt;
        g += (bloomA[a0 + 1] * w0 + bloomA[a1 + 1] * w1 + bloomA[a2 + 1] * w2 + bloomA[a3 + 1] * w3) * bamt;
        b += (bloomA[a0 + 2] * w0 + bloomA[a1 + 2] * w1 + bloomA[a2 + 2] * w2 + bloomA[a3 + 2] * w3) * bamt;
      }
      if (mode === 1) { const t = r; r = b; b = g; g = t; }
      const v = 1 - vig * (1 - vmap[i]);
      r = (r * exp + (fl[0] - r * exp) * flash) * v;
      g = (g * exp + (fl[1] - g * exp) * flash) * v;
      b = (b * exp + (fl[2] - b * exp) * flash) * v;
      let R8 = TOS[Math.min(LUTN, (Math.sqrt(r > 0 ? r : 0) * LUTN) | 0)];
      let G8 = TOS[Math.min(LUTN, (Math.sqrt(g > 0 ? g : 0) * LUTN) | 0)];
      let B8 = TOS[Math.min(LUTN, (Math.sqrt(b > 0 ? b : 0) * LUTN) | 0)];
      if (mode === 2) { R8 = Math.round(R8 / 64) * 64; G8 = Math.round(G8 / 64) * 64; B8 = Math.round(B8 / 64) * 64; }
      if (inv) { R8 = 255 - R8; G8 = 255 - G8; B8 = 255 - B8; }
      R8 *= scanK; G8 *= scanK; B8 *= scanK;
      const hv = hud[i];
      const ha = hv >>> 24;
      if (ha) {
        const a = ha / 255;
        R8 += ((hv & 255) - R8) * a;
        G8 += (((hv >>> 8) & 255) - G8) * a;
        B8 += (((hv >>> 16) & 255) - B8) * a;
      }
      const lum = (R8 + G8 + B8) * inv3;
      const gw = 0.55 + 0.45 * (1 - Math.abs(lum - 115) / 140);
      const n = grain[(i + goff) % N] * gAmp * gw;
      const o = i * 4;
      out[o] = R8 + n;
      out[o + 1] = G8 + n;
      out[o + 2] = B8 + n;
      out[o + 3] = 255;
    }
  }
}

// Render one output frame (sub-frame accumulation + post). Pure function of `f`.
R.render = (f, opts = {}) => {
  const t0 = performance.now();
  let mb = Math.max(1, opts.mb ?? 8);
  const shutter = opts.shutter ?? 0.5;
  const t = f / FPS;
  const { tc, rate } = remap(t);
  const sec = sectionAt(tc);
  const scene = SCENES[sec.id];
  const shut = shutter * (scene.shutter ? scene.shutter(tc - sec.t0, tc) : 1);
  const boost = scene.mbBoost ? scene.mbBoost(tc - sec.t0, tc) : 1;
  mb = Math.max(1, Math.round(mb * boost));
  let fx = {};
  let hud = {};
  let tDraw = 0, tAcc = 0;
  for (let i = 0; i < mb; i++) {
    const dt = mb === 1 ? 0 : (((i + 0.5) / mb - 0.5) * shut) / FPS;
    const ts = tc + dt * rate;
    const ctx = R.ctx;
    ctx.reset();
    ctx.setTransform(R.s, 0, 0, R.s, 0, 0);
    const L = new Layers(ctx);
    // tlN: nominal (frame-centre) local time -> scenes use it for hard cuts so that sub-frames
    // never straddle a cut
    const env = { R, t: ts, f, sec, tReal: t + dt, sub: i, mb, tlN: tc - sec.t0 };
    const a = performance.now();
    const res = scene.draw(L, ts - sec.t0, env) || {};
    const b = performance.now();
    if (i === mb >> 1) {
      fx = res.fx || {};
      hud = res.hud || {};
    }
    accumulate(i === 0, 1 / mb);
    tDraw += b - a;
    tAcc += performance.now() - b;
  }
  const hctx = R.hudCtx;
  hctx.reset();
  hctx.setTransform(R.s, 0, 0, R.s, 0, 0);
  drawHUD({ ctx: () => hctx }, { t, f, sec, hud });
  const P = postFX(t, sec, fx);
  const tp = performance.now();
  post(f, P);
  const tPost = performance.now() - tp;
  return { ms: performance.now() - t0, sec: sec.id, tc, mb, prof: { draw: tDraw, acc: tAcc, post: tPost } };
};

// Ship the finished frame to the local render server as raw RGBA (top-down rows).
R.capture = async (f) => {
  const r = await fetch('/frame?f=' + f, { method: 'POST', body: new Blob([R.out]) });
  return r.status;
};
