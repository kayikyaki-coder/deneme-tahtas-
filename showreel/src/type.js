// Variable-font engine. fontkit gives true outlines for any (wght, wdth); we cache a grid of
// instances and bilinearly interpolate point coordinates (identical contour structure across
// instances), so axes animate smoothly per glyph per sub-frame at negligible cost.
import * as fontkit from 'fontkit';

export async function loadFont(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  return new VFont(fontkit.create(buf));
}

function flatten(path) {
  const ops = [];
  const co = [];
  for (const c of path.commands) {
    switch (c.command) {
      case 'moveTo': ops.push(0); co.push(c.args[0], c.args[1]); break;
      case 'lineTo': ops.push(1); co.push(c.args[0], c.args[1]); break;
      case 'quadraticCurveTo': ops.push(2); co.push(...c.args); break;
      case 'bezierCurveTo': ops.push(3); co.push(...c.args); break;
      case 'closePath': ops.push(4); break;
    }
  }
  return { ops, co: Float32Array.from(co) };
}

function cell(val, ax, n) {
  const x = ((Math.min(ax.max, Math.max(ax.min, val)) - ax.min) / (ax.max - ax.min)) * n;
  let i = Math.floor(x);
  if (i >= n) i = n - 1;
  return [i, x - i];
}

export class VFont {
  constructor(f) {
    this.f = f;
    this.upm = f.unitsPerEm;
    this.ascent = f.ascent;
    this.descent = f.descent;
    this.cap = f.capHeight || f.ascent * 0.7;
    this.xh = f.xHeight || this.cap * 0.7;
    this.axes = f.variationAxes || {};
    this.isVar = !!(this.axes.wght || this.axes.wdth);
    this.N = { wght: 16, wdth: 12 };
    this.inst = new Map();
    this.gcache = new Map();
    this.kcache = new Map();
  }

  _axisVal(ax, i, n) {
    return ax.min + ((ax.max - ax.min) * i) / n;
  }

  _inst(i, j) {
    const key = i * 1000 + j;
    let v = this.inst.get(key);
    if (!v) {
      const s = {};
      if (this.axes.wght) s.wght = this._axisVal(this.axes.wght, i, this.N.wght);
      if (this.axes.wdth) s.wdth = this._axisVal(this.axes.wdth, j, this.N.wdth);
      v = this.f.getVariation(s);
      this.inst.set(key, v);
    }
    return v;
  }

  _grid(ch, i, j) {
    const key = ch + '|' + i + '|' + j;
    let g = this.gcache.get(key);
    if (!g) {
      const font = this.isVar ? this._inst(i, j) : this.f;
      const run = font.layout(ch);
      g = flatten(run.glyphs[0].path);
      g.adv = run.positions[0].xAdvance;
      this.gcache.set(key, g);
    }
    return g;
  }

  // Glyph outline at exact axis values (font units, y-up).
  glyph(ch, wght = 400, wdth = 100) {
    if (!this.isVar) return this._grid(ch, 0, 0);
    const aw = this.axes.wght, ad = this.axes.wdth;
    const [i, u] = aw ? cell(wght, aw, this.N.wght) : [0, 0];
    const [j, v] = ad ? cell(wdth, ad, this.N.wdth) : [0, 0];
    const g00 = this._grid(ch, i, j);
    const g10 = aw ? this._grid(ch, i + 1, j) : g00;
    const g01 = ad ? this._grid(ch, i, j + 1) : g00;
    const g11 = aw && ad ? this._grid(ch, i + 1, j + 1) : g00;
    const n = g00.co.length;
    if (g10.co.length !== n || g01.co.length !== n || g11.co.length !== n) {
      return u + v < 1 ? g00 : g11;
    }
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    const co = new Float32Array(n);
    const a = g00.co, b = g10.co, c = g01.co, d = g11.co;
    for (let k = 0; k < n; k++) co[k] = a[k] * w00 + b[k] * w10 + c[k] * w01 + d[k] * w11;
    return { ops: g00.ops, co, adv: g00.adv * w00 + g10.adv * w10 + g01.adv * w01 + g11.adv * w11 };
  }

  // Pair kerning (font units) from the nearest grid instance.
  kern(a, b, wght = 400, wdth = 100) {
    const aw = this.axes.wght, ad = this.axes.wdth;
    const i = aw ? Math.round(cell(wght, aw, this.N.wght).reduce((x, y) => x + y)) : 0;
    const j = ad ? Math.round(cell(wdth, ad, this.N.wdth).reduce((x, y) => x + y)) : 0;
    const key = a + b + '|' + i + '|' + j;
    let k = this.kcache.get(key);
    if (k === undefined) {
      const font = this.isVar ? this._inst(i, j) : this.f;
      const run = font.layout(a + b);
      k = run.positions.length > 1 ? run.positions[0].xAdvance - this._grid(a, i, j).adv : 0;
      this.kcache.set(key, k);
    }
    return k;
  }

  // Lay out a string. `axes(i)` may return per-glyph {wght, wdth}.
  layout(text, size, opts = {}) {
    const { wght = 400, wdth = 100, tracking = 0, axes = null, kerning = true } = opts;
    const s = size / this.upm;
    const glyphs = [];
    let x = 0;
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const ax = axes ? axes(i, chars.length) : { wght, wdth };
      const g = this.glyph(ch, ax.wght ?? wght, ax.wdth ?? wdth);
      const w = g.adv * s;
      glyphs.push({ ch, g, x, w, i });
      x += w + tracking * size;
      if (kerning && i < chars.length - 1) x += this.kern(ch, chars[i + 1], ax.wght ?? wght, ax.wdth ?? wdth) * s;
    }
    const width = glyphs.length ? x - tracking * size : 0;
    return { glyphs, width, size, s, cap: this.cap * s, asc: this.ascent * s, desc: this.descent * s };
  }
}

// Append a glyph outline to the current path. (x, y) is the baseline origin in px.
export function tracePath(ctx, g, x, y, s) {
  const { ops, co } = g;
  let k = 0;
  for (let n = 0; n < ops.length; n++) {
    switch (ops[n]) {
      case 0: ctx.moveTo(x + co[k] * s, y - co[k + 1] * s); k += 2; break;
      case 1: ctx.lineTo(x + co[k] * s, y - co[k + 1] * s); k += 2; break;
      case 2:
        ctx.quadraticCurveTo(x + co[k] * s, y - co[k + 1] * s, x + co[k + 2] * s, y - co[k + 3] * s);
        k += 4;
        break;
      case 3:
        ctx.bezierCurveTo(
          x + co[k] * s, y - co[k + 1] * s,
          x + co[k + 2] * s, y - co[k + 3] * s,
          x + co[k + 4] * s, y - co[k + 5] * s,
        );
        k += 6;
        break;
      case 4: ctx.closePath(); break;
    }
  }
}

// Convenience: fill a laid-out run. `each(glyph, ctx)` may apply per-glyph transforms (return false to skip).
export function drawRun(ctx, run, x, y, each = null) {
  for (const gl of run.glyphs) {
    if (gl.ch === ' ') continue;
    if (each) {
      ctx.save();
      const r = each(gl, ctx);
      if (r === false) { ctx.restore(); continue; }
      ctx.beginPath();
      tracePath(ctx, gl.g, x + gl.x, y, run.s);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      tracePath(ctx, gl.g, x + gl.x, y, run.s);
      ctx.fill();
    }
  }
}
