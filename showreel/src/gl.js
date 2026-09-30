// WebGL2 compositor: layers -> sub-frame buffer -> linear-light accumulation (motion blur)
// -> bloom / chromatic aberration / glitch / grain -> screen.

const VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
vec3 s2l(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 l2s(vec3 c){ return pow(max(c, vec3(0.0)), vec3(1.0/2.2)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
`;

export class GL {
  constructor(canvas, w, h) {
    this.w = w;
    this.h = h;
    canvas.width = w;
    canvas.height = h;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.vao = gl.createVertexArray();
    this.progs = {};
    this.targets = {};
    this.textures = {};
    this.canvasTex = [];
  }

  program(name, fsBody) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
        throw new Error(`Shader ${name} failed: ${log}\n${numbered}`);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, HEADER + fsBody));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Link ${name}: ${gl.getProgramInfoLog(p)}`);
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const key = info.name.replace(/\[0\]$/, '');
      uniforms[key] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    }
    this.progs[name] = { p, uniforms };
    return this.progs[name];
  }

  _tex(w, h, internal, format, type, filter = 'linear') {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const f = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  target(name, w, h, float = true) {
    const gl = this.gl;
    const useF = float && this.floatOK;
    const tex = useF
      ? this._tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT)
      : this._tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`FBO ${name} incomplete: ${st}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const t = { name, tex, fbo, w, h };
    this.targets[name] = t;
    return t;
  }

  bind(t) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : this.w, t ? t.h : this.h);
  }

  clear(t, r = 0, g = 0, b = 0, a = 0) {
    const gl = this.gl;
    this.bind(t);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  blend(mode) {
    const gl = this.gl;
    if (!mode || mode === 'none') { gl.disable(gl.BLEND); return; }
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    switch (mode) {
      case 'normal': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'add': gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'screen': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
      case 'multiply': gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
      default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  // Upload (or re-upload) a 2D canvas into a persistent texture slot. No flip (the layer shaders
  // flip v) and premultiplied (matches canvas storage) -> the fastest path on SwiftShader.
  uploadCanvas(slot, canvas) {
    const gl = this.gl;
    let e = this.canvasTex[slot];
    if (!e || e.w !== canvas.width || e.h !== canvas.height) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, canvas.width, canvas.height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      e = this.canvasTex[slot] = { tex, w: canvas.width, h: canvas.height };
    }
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return e.tex;
  }

  // Named static texture from a canvas (uploaded once, or again when `force`).
  texture(name, canvas, force = false) {
    if (this.textures[name] && !force) return this.textures[name];
    const gl = this.gl;
    const tex = this.textures[name] || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures[name] = tex;
    return tex;
  }

  // Single-channel float texture (e.g. signed distance fields), linear filtered.
  floatTexture(name, w, h, data) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures[name] = tex;
    return tex;
  }

  draw(progName, uniforms, target, blend = 'none') {
    const gl = this.gl;
    const P = this.progs[progName];
    if (!P) throw new Error('No program ' + progName);
    this.bind(target);
    gl.useProgram(P.p);
    let unit = 0;
    const res = target ? [target.w, target.h] : [this.w, this.h];
    const all = { uRes: res, ...uniforms };
    for (const key in all) {
      const info = P.uniforms[key];
      if (!info) continue;
      const v = all[key];
      const { loc, type } = info;
      switch (type) {
        case gl.FLOAT: typeof v === 'number' ? gl.uniform1f(loc, v) : gl.uniform1fv(loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(loc, v); break;
        case gl.INT: case gl.BOOL: gl.uniform1i(loc, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(loc, false, v); break;
        case gl.SAMPLER_2D: {
          const tex = typeof v === 'string'
            ? (this.targets[v] ? this.targets[v].tex : this.textures[v])
            : v && v.tex ? v.tex : v;
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(loc, unit);
          unit++;
          break;
        }
      }
    }
    this.blend(blend);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// ---------------------------------------------------------------------------------------
// Built-in programs
export const PROGRAMS = {
  layer: `
uniform sampler2D uTex; uniform float uOpacity;
void main(){ o = texture(uTex, vec2(vUv.x, 1.0 - vUv.y)) * uOpacity; }`,

  layerLin: `
uniform sampler2D uTex; uniform float uOpacity;
void main(){ vec4 c = texture(uTex, vec2(vUv.x, 1.0 - vUv.y)) * uOpacity; vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0); o = vec4(s2l(rgb) * c.a, c.a); }`,

  accum: `
uniform sampler2D uTex; uniform float uW;
void main(){ vec3 c = texture(uTex, vUv).rgb; o = vec4(s2l(c) * uW, uW); }`,

  prefilter: `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh; uniform float uKnee;
void main(){
  vec2 h = uTexel;
  vec3 c = texture(uTex, vUv + vec2(-h.x, -h.y)).rgb + texture(uTex, vUv + vec2(h.x, -h.y)).rgb
         + texture(uTex, vUv + vec2(-h.x, h.y)).rgb + texture(uTex, vUv + vec2(h.x, h.y)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThresh + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contrib = max(soft, br - uThresh) / max(br, 1e-5);
  o = vec4(c * contrib, 1.0);
}`,

  down: `
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 h = uTexel * 0.5;
  vec4 s = texture(uTex, vUv) * 4.0;
  s += texture(uTex, vUv - h);
  s += texture(uTex, vUv + h);
  s += texture(uTex, vUv + vec2(h.x, -h.y));
  s += texture(uTex, vUv - vec2(h.x, -h.y));
  o = s / 8.0;
}`,

  up: `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uGain;
void main(){
  vec2 h = uTexel * 0.5;
  vec4 s = texture(uTex, vUv + vec2(-h.x * 2.0, 0.0));
  s += texture(uTex, vUv + vec2(-h.x, h.y)) * 2.0;
  s += texture(uTex, vUv + vec2(0.0, h.y * 2.0));
  s += texture(uTex, vUv + vec2(h.x, h.y)) * 2.0;
  s += texture(uTex, vUv + vec2(h.x * 2.0, 0.0));
  s += texture(uTex, vUv + vec2(h.x, -h.y)) * 2.0;
  s += texture(uTex, vUv + vec2(0.0, -h.y * 2.0));
  s += texture(uTex, vUv + vec2(-h.x, -h.y)) * 2.0;
  o = s / 12.0 * uGain;
}`,

  final: `
uniform sampler2D uAccum; uniform sampler2D uBloom;
uniform float uSeed, uBloomAmt, uCA, uGrain, uVig, uGlitch, uFlash, uExposure, uInvert, uScan, uWarp;
uniform vec3 uFlashCol;
uniform vec2 uShift;
uniform float uFlipOut;
void main(){
  // uFlipOut = 1 -> rows come out top-down when read back (ready for ffmpeg without vflip)
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipOut)) + uShift;
  // barrel warp for impacts (subtle lens punch)
  vec2 dc = uv - 0.5;
  uv = 0.5 + dc * (1.0 - uWarp * dot(dc, dc));
  // --- glitch: slice displacement + block corruption
  float g = uGlitch;
  vec2 guv = uv;
  if (g > 0.001) {
    float rows = 14.0 + floor(hash12(vec2(uSeed, 1.7)) * 40.0);
    float row = floor(uv.y * rows);
    float rr = hash12(vec2(row, floor(uSeed * 3.0)));
    float on = step(1.0 - 0.55 * g, hash12(vec2(row * 1.37, uSeed + 5.1)));
    guv.x += (rr - 0.5) * 0.22 * g * on;
    vec2 bs = vec2(24.0, 13.5) * (1.0 + floor(hash12(vec2(uSeed, 9.1)) * 3.0));
    vec2 blk = floor(uv * bs);
    float br = hash12(blk + floor(uSeed * 7.0));
    if (br > 1.0 - 0.18 * g) guv += (hash22(blk + uSeed) - 0.5) * 0.12 * g;
  }
  vec2 d = guv - 0.5;
  vec2 off = d * (uCA / uRes.x) * 2.0 + vec2(g * 0.012 * sin(uSeed * 91.0), 0.0);
  vec3 c;
  c.r = texture(uAccum, guv + off).r;
  c.g = texture(uAccum, guv).g;
  c.b = texture(uAccum, guv - off).b;
  c += texture(uBloom, guv).rgb * uBloomAmt;
  if (g > 0.001) {
    // posterize + channel swap on corrupted blocks
    vec2 blk2 = floor(uv * vec2(32.0, 18.0));
    float q = hash12(blk2 + floor(uSeed * 11.0));
    if (q > 1.0 - 0.12 * g) c = c.brg;
    if (q < 0.05 * g) c = floor(c * 4.0) / 4.0;
  }
  c *= uExposure;
  c = mix(c, s2l(uFlashCol), uFlash);
  float vig = smoothstep(1.15, 0.25, length(d * vec2(1.0, 1.25)));
  c *= mix(1.0, vig, uVig);
  vec3 s = l2s(c);
  s = mix(s, 1.0 - s, uInvert);
  // scanlines (only during glitch)
  s *= 1.0 - uScan * 0.18 * step(0.5, fract(gl_FragCoord.y * 0.25));
  // film grain: two octaves, luminance-weighted
  vec2 fc = gl_FragCoord.xy;
  float n1 = hash12(floor(fc * 0.75) + fract(uSeed * 0.137) * 997.0) - 0.5;
  float n2 = hash12(fc + fract(uSeed * 0.731) * 613.0) - 0.5;
  float n = n1 * 0.7 + n2 * 0.5;
  float lum = dot(s, vec3(0.299, 0.587, 0.114));
  s += n * uGrain * (0.55 + 0.45 * (1.0 - abs(lum - 0.45) * 1.6));
  s += (hash12(fc + uSeed * 3.1) - 0.5) / 255.0;
  o = vec4(clamp(s, 0.0, 1.0), 1.0);
}`,
};
