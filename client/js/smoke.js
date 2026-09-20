const SIM_RESOLUTION = 128;
const DYE_RESOLUTION = 384;
const VELOCITY_DISSIPATION = 0.45;
const PRESSURE = 0.8;
const PRESSURE_ITERATIONS = 20;
const CURL = 18;
const SPLAT_RADIUS = 0.3;
const SPLAT_FORCE = 5000;
const AMBIENT_FORCE = 4;
const BUOYANCY = 1.2;
const DENSITY_RELAX = 0.4;
const DENSITY_FADE = 0.15;
const DETAIL_RELAX = 0.22;
const MID_DRIFT = 0.25;
const BASE_DRIFT = 0.1;
const SHAPE_HALF_W = 0.42;
const SHAPE_HALF_H = 0.39;
const OPEN_MS = 1000;
const OPEN_GROW = 0.6;
const CLOSE_MS = 1800;
const OPEN_RELAX = 40;
const CLOSE_FADE = 1.2;
const CLOSE_DRIFT = 30;
const CLOSE_DRIFT_SPREAD = 0.6;
const CLOSE_TURBULENCE = 1.4;
const WIDEN_FORCE = 1200;
const WIDEN_MAX = 300;
const WIDEN_MIN_DELTA = 0.0005;
const WIDEN_RADIUS = 50;
const POOF_SPLATS = 6;
const POOF_FORCE = 350;
const POOF_RADIUS = 1.2;
const MAX_DT = 1 / 60;
const MAX_SUBSTEPS = 6;
const SMOKE_OPACITY = 0.88;
const FRONT_OPACITY = 0.5;
const SMOKE_TIME_WRAP_S = 1000;

const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * snoise(p);
    p = p * 2.0 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return sum;
}
float billow(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * (1.0 - abs(snoise(p)));
    p = p * 2.1 + vec2(3.1, 7.7);
    amp *= 0.48;
  }
  return sum;
}
float panelShape(vec2 q, vec2 halfSize) {
  vec2 b = abs(q) - halfSize;
  return length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
}`;

const SHAPE_GLSL = `
uniform vec2 aspect;
uniform vec2 center;
uniform vec2 halfSize;
uniform float scale;
uniform vec2 seed;
uniform float time;
float shapeTarget(vec2 p) {
  vec2 q = (p - center) / scale;
  float bulge = -(0.5 + 0.5 * fbm(q * 0.8 + seed)) * 0.10;
  float ln = fbm(q * 2.2 + vec2(time * 0.03, -time * 0.04) + seed * 1.7) * 0.05;
  float sd = panelShape(q, halfSize / scale) + bulge + ln;
  return 1.0 - smoothstep(-0.03, 0.10, sd);
}`;

const VERT = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const HEAD = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;`;

const FRAG = {
  splat: `${HEAD}
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}`,
  advection: `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}`,
  dyeAdvection: `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float midDrift;
void main() {
  vec2 v = texture2D(uVelocity, vUv).xy * texelSize;
  vec4 front = texture2D(uSource, vUv - dt * v);
  vec4 mid = texture2D(uSource, vUv - dt * midDrift * v);
  gl_FragColor = vec4(front.rg, mid.ba);
}`,
  divergence: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}`,
  curl: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`,
  vorticity: `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`,
  pressure: `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`,
  gradientSubtract: `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`,
  clear: `${HEAD}
uniform sampler2D uTexture;
uniform float value;
void main() {
  gl_FragColor = value * texture2D(uTexture, vUv);
}`,
  ambient: `${HEAD}
${NOISE_GLSL}
uniform sampler2D uVelocity;
uniform vec2 aspect;
uniform float dt;
uniform float time;
uniform float force;
uniform float buoyancy;
uniform vec2 drift;
void main() {
  vec2 v = texture2D(uVelocity, vUv).xy;
  vec2 p = (vUv - 0.5) * aspect;
  vec2 f = vec2(snoise(p * 1.5 + vec2(time * 0.12, 0.0)), snoise(p * 1.5 + vec2(7.3, -time * 0.1)));
  v += (f * force + vec2(0.0, buoyancy) + drift) * dt;
  gl_FragColor = vec4(v, 0.0, 1.0);
}`,
  source: `${HEAD}
${NOISE_GLSL}
${SHAPE_GLSL}
uniform sampler2D uDye;
uniform float dt;
uniform float gain;
uniform float densityRelax;
uniform float densityFade;
uniform float detailRelax;
void main() {
  vec4 d = texture2D(uDye, vUv);
  vec2 p = (vUv - 0.5) * aspect;
  float target = shapeTarget(p) * gain;
  float detail = billow(p * 0.9 + vec2(0.0, -time * 0.05) + seed);
  float detailMid = billow(p * 0.7 + vec2(0.0, -time * 0.03) + seed + 17.0);
  float rateFront = target > d.r ? densityRelax : densityFade;
  float rateMid = target > d.b ? densityRelax : densityFade;
  d.r += (target - d.r) * min(1.0, rateFront * dt);
  d.g += (detail - d.g) * min(1.0, detailRelax * dt);
  d.b += (target - d.b) * min(1.0, rateMid * dt);
  d.a += (detailMid - d.a) * min(1.0, detailRelax * dt);
  gl_FragColor = d;
}`,
  base: `${HEAD}
${NOISE_GLSL}
${SHAPE_GLSL}
uniform sampler2D uBase;
uniform float dt;
uniform float gain;
uniform float densityRelax;
uniform float densityFade;
uniform float detailRelax;
void main() {
  vec2 prev = texture2D(uBase, vUv).rg;
  float dens = prev.r;
  vec2 p = (vUv - 0.5) * aspect;
  float target = shapeTarget(p) * gain;
  float detail = billow(p * 0.55 + vec2(0.0, -time * 0.02) + seed + 31.0);
  detail = prev.g + (detail - prev.g) * min(1.0, detailRelax * dt);
  float erode = billow(p * 1.3 + vec2(time * 0.12, time * 0.18) + seed * 2.0);
  float rate = target > dens ? densityRelax : densityFade;
  dens += (target - dens) * min(1.0, rate * dt);
  gl_FragColor = vec4(dens, detail, erode, 1.0);
}`,
  display: `${HEAD}
uniform sampler2D uDye;
uniform sampler2D uBase;
uniform float dissolve;
uniform float opacity;
uniform float frontOpacity;
vec4 layer(float dens, float detail, float erode, float gx, float gy, float tone) {
  dens = clamp(dens, 0.0, 1.0);
  detail = clamp(detail, 0.0, 1.0);
  vec3 N = normalize(vec3(gx * 13.0, gy * 13.0, 1.0));
  float lit = 0.5 + 0.5 * dot(N, normalize(vec3(-0.4, 0.8, 0.6)));
  vec3 col = mix(vec3(0.77, 0.79, 0.84), vec3(1.0, 1.0, 0.99), clamp(lit * 0.5 + detail * 0.5, 0.0, 1.0));
  col = mix(vec3(0.72, 0.74, 0.78), col, smoothstep(0.0, 0.8, dens)) * tone;
  float a = pow(dens, 1.6) * (0.9 + 0.1 * detail);
  a *= smoothstep(dissolve * 0.7, dissolve * 0.7 + 0.4, mix(detail, erode, 0.65)) * (1.0 - smoothstep(0.7, 1.0, dissolve));
  return vec4(col * a, a);
}
vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}
void main() {
  vec4 c = texture2D(uDye, vUv);
  vec4 l = texture2D(uDye, vL);
  vec4 r = texture2D(uDye, vR);
  vec4 t = texture2D(uDye, vT);
  vec4 b = texture2D(uDye, vB);
  vec3 bc = texture2D(uBase, vUv).rgb;
  float bl = texture2D(uBase, vL).g;
  float br = texture2D(uBase, vR).g;
  float bt = texture2D(uBase, vT).g;
  float bb = texture2D(uBase, vB).g;
  vec4 base = layer(bc.r, bc.g, bc.b, bl - br, bb - bt, 0.94);
  vec4 mid = layer(c.b, c.a, bc.b, l.a - r.a, b.a - t.a, 0.97);
  vec4 front = layer(c.r, c.g, bc.b, l.g - r.g, b.g - t.g, 1.0) * frontOpacity;
  vec4 o = over(front, over(mid, base));
  gl_FragColor = o * opacity;
}`,
};

(function initSmoke() {
  const canvases = Array.from(document.querySelectorAll("canvas.smoke"));
  const anchors = Array.from(document.querySelectorAll("[data-smoke]"));
  if (!canvases.length || !anchors.length) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const panels = [];
  for (const canvas of canvases) {
    const panel = setupPanel(canvas);
    if (!panel) return;
    panels.push(panel);
  }
  document.documentElement.classList.add("smoke-gl");

  function setupPanel(canvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
    gl.getExtension("OES_texture_float_linear");
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    if (!vs) return null;
    const programs = {};
    for (const name of Object.keys(FRAG)) {
      const program = link(gl, vs, FRAG[name]);
      if (!program) return null;
      programs[name] = program;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    return {
      canvas,
      gl,
      programs,
      fbos: null,
      size: null,
      shape: null,
      seed: [0, 0],
      phase: "idle",
      phaseStart: 0,
      last: 0,
      pointer: null,
      mouseSplat: null,
      splats: [],
      closeDrift: [0, 0],
      lastHx: null,
      smokeHx: 0,
    };
  }

  function compile(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    return shader;
  }

  function link(gl, vs, fragSrc) {
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i).name;
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  function createFBO(gl, w, h, internalFormat, format, type, filter) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(gl, w, h, internalFormat, format, type, filter) {
    let a = createFBO(gl, w, h, internalFormat, format, type, filter);
    let b = createFBO(gl, w, h, internalFormat, format, type, filter);
    return {
      width: w,
      height: h,
      texelSizeX: a.texelSizeX,
      texelSizeY: a.texelSizeY,
      get read() {
        return a;
      },
      get write() {
        return b;
      },
      swap() {
        const t = a;
        a = b;
        b = t;
      },
    };
  }

  function eachFBO(fbo, fn) {
    if (fbo.swap) {
      fn(fbo.read);
      fn(fbo.write);
    } else {
      fn(fbo);
    }
  }

  function release(gl, fbo) {
    eachFBO(fbo, (f) => {
      gl.deleteFramebuffer(f.fbo);
      gl.deleteTexture(f.texture);
    });
  }

  function clearFields(panel) {
    const { gl, fbos } = panel;
    if (!fbos) return;
    for (const fbo of Object.values(fbos)) {
      eachFBO(fbo, (f) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });
    }
  }

  function resolution(canvas, base) {
    let aspect = canvas.width / canvas.height;
    if (aspect < 1) aspect = 1 / aspect;
    const max = Math.round(base * aspect);
    return canvas.width > canvas.height ? { w: max, h: base } : { w: base, h: max };
  }

  function allocate(panel) {
    const { gl, canvas } = panel;
    const old = panel.fbos;
    const sim = resolution(canvas, SIM_RESOLUTION);
    const dye = resolution(canvas, DYE_RESOLUTION);
    panel.fbos = {
      velocity: createDoubleFBO(gl, sim.w, sim.h, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR),
      dye: createDoubleFBO(gl, dye.w, dye.h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR),
      base: createDoubleFBO(gl, dye.w, dye.h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR),
      divergence: createFBO(gl, sim.w, sim.h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST),
      curl: createFBO(gl, sim.w, sim.h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST),
      pressure: createDoubleFBO(gl, sim.w, sim.h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST),
    };
    panel.size = { w: canvas.width, h: canvas.height };
    if (!old) return false;
    for (const name of ["velocity", "dye", "base"]) {
      const u = use(panel, "clear", panel.fbos[name].read);
      gl.uniform1i(u.uTexture, old[name].read.attach(0));
      gl.uniform1f(u.value, 1);
      blit(gl);
    }
    for (const fbo of Object.values(old)) release(gl, fbo);
    return true;
  }

  function use(panel, name, target) {
    const { gl } = panel;
    const p = panel.programs[name];
    gl.useProgram(p.program);
    if (target) {
      gl.uniform2f(p.uniforms.texelSize, target.texelSizeX, target.texelSizeY);
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.uniform2f(p.uniforms.texelSize, 1 / panel.canvas.width, 1 / panel.canvas.height);
      gl.viewport(0, 0, panel.canvas.width, panel.canvas.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    return p.uniforms;
  }

  function blit(gl) {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function fit(panel, now) {
    const { canvas } = panel;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!panel.fbos || panel.size.w !== w || panel.size.h !== h) {
      if (!allocate(panel)) prime(panel, now);
    }
  }

  function shapeOf(panel) {
    const anchor = anchors.find((el) => el.offsetWidth > 0 && el.offsetHeight > 0);
    if (!anchor) return panel.shape;
    const r = panel.canvas.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    if (!r.width || !r.height) return panel.shape;
    const aspect = r.width / r.height;
    return {
      cx: ((a.left + a.width / 2 - r.left) / r.width - 0.5) * aspect,
      cy: 0.5 - (a.top + a.height / 2 - r.top) / r.height,
      hx: (SHAPE_HALF_W * a.width) / r.height,
      hy: (SHAPE_HALF_H * a.height) / r.height,
      scale: a.height / r.height,
    };
  }

  function phaseState(panel, now) {
    const s = panel.shape || { cx: 0, cy: 0, hx: 0.4, hy: 0.4, scale: 1 };
    const st = {
      ...s,
      relax: DENSITY_RELAX,
      fade: DENSITY_FADE,
      gain: 1,
      dissolve: 0,
      force: AMBIENT_FORCE,
      buoyancy: BUOYANCY,
      drift: [0, 0],
    };
    const age = still ? Infinity : panel.phaseStart < 0 ? 0 : Math.max(0, now - panel.phaseStart);
    if (panel.phase === "opening" || panel.phase === "open") {
      const u = Math.min(1, age / OPEN_MS);
      const gu = Math.min(1, age / (OPEN_MS * OPEN_GROW));
      const g = gu * gu * (3 - 2 * gu);
      st.cx = s.cx * g;
      st.cy = s.cy * g;
      st.hx = Math.max(0.01, s.hx * g);
      st.hy = Math.max(0.01, s.hy * g);
      const k = Math.max(0, 1 - age / (OPEN_MS * 2));
      st.relax = DENSITY_RELAX + (OPEN_RELAX - DENSITY_RELAX) * k * k;
      st.fade = DENSITY_FADE + (OPEN_RELAX - DENSITY_FADE) * k * k;
      if (u >= 1) panel.phase = "open";
    } else if (panel.phase === "closing") {
      const u = Math.min(1, age / CLOSE_MS);
      st.gain = 0;
      st.fade = CLOSE_FADE;
      st.force = AMBIENT_FORCE * CLOSE_TURBULENCE;
      st.drift = panel.closeDrift;
      st.dissolve = u * u * (3 - 2 * u);
    }
    return st;
  }

  function setShape(panel, u, st, time) {
    const { gl } = panel;
    gl.uniform2f(u.aspect, panel.canvas.width / panel.canvas.height, 1);
    gl.uniform2f(u.center, st.cx, st.cy);
    gl.uniform2f(u.halfSize, st.hx, st.hy);
    gl.uniform1f(u.scale, st.scale);
    gl.uniform2f(u.seed, ...panel.seed);
    gl.uniform1f(u.time, time);
  }

  function runSource(panel, st, dt, time) {
    const { gl, fbos } = panel;
    let u = use(panel, "source", fbos.dye.write);
    gl.uniform1i(u.uDye, fbos.dye.read.attach(0));
    setShape(panel, u, st, time);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.gain, st.gain);
    gl.uniform1f(u.densityRelax, st.relax);
    gl.uniform1f(u.densityFade, st.fade);
    gl.uniform1f(u.detailRelax, dt >= 1000 ? 1 : DETAIL_RELAX);
    blit(gl);
    fbos.dye.swap();

    u = use(panel, "base", fbos.base.write);
    gl.uniform1i(u.uBase, fbos.base.read.attach(0));
    setShape(panel, u, st, time);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.gain, st.gain);
    gl.uniform1f(u.densityRelax, st.relax);
    gl.uniform1f(u.densityFade, st.fade);
    gl.uniform1f(u.detailRelax, dt >= 1000 ? 1 : DETAIL_RELAX);
    blit(gl);
    fbos.base.swap();
  }

  function prime(panel, now) {
    const st = { ...phaseState(panel, now), gain: 1 };
    runSource(panel, st, 1000, 0);
  }

  function splat(panel, x, y, dx, dy, radius) {
    const { gl, fbos } = panel;
    const u = use(panel, "splat", fbos.velocity.write);
    gl.uniform1i(u.uTarget, fbos.velocity.read.attach(0));
    gl.uniform1f(u.aspectRatio, panel.canvas.width / panel.canvas.height);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, dx, dy, 0);
    gl.uniform1f(u.radius, splatRadius(panel, radius / 100));
    blit(gl);
    fbos.velocity.swap();
  }

  function poof(panel, count, force) {
    const r = panel.canvas.getBoundingClientRect();
    const spread = 0.04;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = 0.5 + Math.cos(a) * spread * (r.height / r.width);
      const y = 0.5 + Math.sin(a) * spread;
      panel.splats.push({ x, y, dx: Math.cos(a) * force, dy: Math.sin(a) * force, radius: POOF_RADIUS });
    }
  }

  function widenPush(panel, dt) {
    const { cx, cy, hx } = panel.shape;
    const prev = panel.lastHx;
    panel.lastHx = hx;
    if (prev === null) {
      panel.smokeHx = hx;
      return;
    }
    const swept = hx - Math.max(prev, panel.smokeHx);
    const relax = hx > panel.smokeHx ? DENSITY_RELAX : DENSITY_FADE;
    panel.smokeHx += (hx - panel.smokeHx) * Math.min(1, relax * dt);
    if (swept <= WIDEN_MIN_DELTA) return;
    const m = Math.min(WIDEN_MAX, swept * WIDEN_FORCE);
    const aspect = panel.canvas.width / panel.canvas.height;
    const y = 0.5 + cy;
    panel.splats.push({ x: 0.5 + (cx - hx) / aspect, y, dx: -m, dy: 0, radius: WIDEN_RADIUS });
    panel.splats.push({ x: 0.5 + (cx + hx) / aspect, y, dx: m, dy: 0, radius: WIDEN_RADIUS });
  }

  function step(panel, st, dt, time) {
    const { gl, fbos } = panel;
    let u;

    if (panel.mouseSplat) {
      const { x, y, dx, dy } = panel.mouseSplat;
      panel.mouseSplat = null;
      splat(panel, x, y, dx, dy, SPLAT_RADIUS);
    }
    for (const s of panel.splats) splat(panel, s.x, s.y, s.dx, s.dy, s.radius);
    panel.splats = [];

    u = use(panel, "ambient", fbos.velocity.write);
    gl.uniform1i(u.uVelocity, fbos.velocity.read.attach(0));
    gl.uniform2f(u.aspect, panel.canvas.width / panel.canvas.height, 1);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.force, st.force);
    gl.uniform1f(u.buoyancy, st.buoyancy);
    gl.uniform2f(u.drift, st.drift[0], st.drift[1]);
    blit(gl);
    fbos.velocity.swap();

    u = use(panel, "curl", fbos.curl);
    gl.uniform1i(u.uVelocity, fbos.velocity.read.attach(0));
    blit(gl);

    u = use(panel, "vorticity", fbos.velocity.write);
    gl.uniform1i(u.uVelocity, fbos.velocity.read.attach(0));
    gl.uniform1i(u.uCurl, fbos.curl.attach(1));
    gl.uniform1f(u.curl, CURL);
    gl.uniform1f(u.dt, dt);
    blit(gl);
    fbos.velocity.swap();

    u = use(panel, "divergence", fbos.divergence);
    gl.uniform1i(u.uVelocity, fbos.velocity.read.attach(0));
    blit(gl);

    u = use(panel, "clear", fbos.pressure.write);
    gl.uniform1i(u.uTexture, fbos.pressure.read.attach(0));
    gl.uniform1f(u.value, PRESSURE);
    blit(gl);
    fbos.pressure.swap();

    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      u = use(panel, "pressure", fbos.pressure.write);
      gl.uniform1i(u.uDivergence, fbos.divergence.attach(0));
      gl.uniform1i(u.uPressure, fbos.pressure.read.attach(1));
      blit(gl);
      fbos.pressure.swap();
    }

    u = use(panel, "gradientSubtract", fbos.velocity.write);
    gl.uniform1i(u.uPressure, fbos.pressure.read.attach(0));
    gl.uniform1i(u.uVelocity, fbos.velocity.read.attach(1));
    blit(gl);
    fbos.velocity.swap();

    u = use(panel, "advection", fbos.velocity.write);
    gl.uniform2f(u.texelSize, fbos.velocity.texelSizeX, fbos.velocity.texelSizeY);
    const velocityId = fbos.velocity.read.attach(0);
    gl.uniform1i(u.uVelocity, velocityId);
    gl.uniform1i(u.uSource, velocityId);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, VELOCITY_DISSIPATION);
    blit(gl);
    fbos.velocity.swap();

    u = use(panel, "dyeAdvection", fbos.dye.write);
    gl.uniform2f(u.texelSize, fbos.velocity.texelSizeX, fbos.velocity.texelSizeY);
    gl.uniform1i(u.uVelocity, fbos.velocity.read.attach(0));
    gl.uniform1i(u.uSource, fbos.dye.read.attach(1));
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.midDrift, MID_DRIFT);
    blit(gl);
    fbos.dye.swap();

    u = use(panel, "advection", fbos.base.write);
    gl.uniform2f(u.texelSize, fbos.velocity.texelSizeX, fbos.velocity.texelSizeY);
    gl.uniform1i(u.uVelocity, fbos.velocity.read.attach(0));
    gl.uniform1i(u.uSource, fbos.base.read.attach(1));
    gl.uniform1f(u.dt, dt * BASE_DRIFT);
    gl.uniform1f(u.dissipation, 0);
    blit(gl);
    fbos.base.swap();

    runSource(panel, st, dt, time);
  }

  function render(panel, st) {
    const { gl, fbos } = panel;
    const u = use(panel, "display", null);
    gl.uniform2f(u.texelSize, fbos.dye.texelSizeX, fbos.dye.texelSizeY);
    gl.uniform1i(u.uDye, fbos.dye.read.attach(0));
    gl.uniform1i(u.uBase, fbos.base.read.attach(1));
    gl.uniform1f(u.dissolve, st.dissolve);
    gl.uniform1f(u.opacity, SMOKE_OPACITY);
    gl.uniform1f(u.frontOpacity, FRONT_OPACITY);
    blit(gl);
  }

  function splatRadius(panel, radius) {
    const aspect = panel.canvas.width / panel.canvas.height;
    return aspect > 1 ? radius * aspect : radius;
  }

  function visible(panel) {
    return panel.canvas.clientWidth > 0 && panel.canvas.clientHeight > 0;
  }

  let running = false;
  function frame() {
    running = false;
    if (document.hidden) return;
    const now = performance.now();
    const time = (now / 1000) % SMOKE_TIME_WRAP_S;
    let any = false;
    for (const panel of panels) {
      if (!visible(panel) || panel.phase === "idle") {
        panel.pointer = null;
        panel.last = 0;
        continue;
      }
      any = true;
      if (panel.phaseStart < 0) panel.phaseStart = now;
      fit(panel, now);
      panel.shape = shapeOf(panel) || panel.shape;
      const st = phaseState(panel, now);
      const elapsed = panel.last ? Math.min((now - panel.last) / 1000, MAX_DT * MAX_SUBSTEPS) : MAX_DT;
      panel.last = now;
      if (!still && panel.phase === "open") widenPush(panel, elapsed);
      if (!still) {
        const n = Math.max(1, Math.ceil(elapsed / MAX_DT));
        for (let i = 0; i < n; i++) step(panel, st, elapsed / n, time);
      }
      render(panel, st);
    }
    if (any && !still) start();
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function open() {
    for (const panel of panels) {
      if (!visible(panel)) continue;
      panel.seed = [Math.random() * 100, Math.random() * 100];
      panel.phase = still ? "open" : "opening";
      panel.phaseStart = -1;
      panel.last = 0;
      panel.pointer = null;
      panel.mouseSplat = null;
      panel.splats = [];
      panel.lastHx = null;
      panel.smokeHx = 0;
      fit(panel, 0);
      panel.shape = shapeOf(panel) || panel.shape;
      clearFields(panel);
      prime(panel, 0);
      if (!still) poof(panel, POOF_SPLATS, POOF_FORCE);
    }
    start();
  }

  function close() {
    if (still) return;
    for (const panel of panels) {
      if (panel.phase === "idle" || panel.phase === "closing") continue;
      panel.phase = "closing";
      panel.phaseStart = -1;
      const a = (Math.random() * 2 - 1) * CLOSE_DRIFT_SPREAD;
      panel.closeDrift = [Math.sin(a) * CLOSE_DRIFT, Math.cos(a) * CLOSE_DRIFT];
      poof(panel, POOF_SPLATS, POOF_FORCE);
    }
    start();
  }

  function reset() {
    for (const panel of panels) {
      panel.phase = "idle";
      panel.splats = [];
      panel.mouseSplat = null;
      clearFields(panel);
      if (panel.fbos) {
        const { gl } = panel;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, panel.canvas.width, panel.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
  }

  window.smoke = { open, close, reset };

  const observer = new ResizeObserver(start);
  for (const panel of panels) observer.observe(panel.canvas);
  document.addEventListener("visibilitychange", start);

  function stir(clientX, clientY) {
    if (still) return;
    for (const panel of panels) {
      if (!visible(panel) || panel.phase === "idle") continue;
      const r = panel.canvas.getBoundingClientRect();
      const x = (clientX - r.left) / r.width;
      const y = 1 - (clientY - r.top) / r.height;
      const prev = panel.pointer;
      panel.pointer = { x, y };
      if (!prev) continue;
      const aspect = r.width / r.height;
      let dx = (x - prev.x) * SPLAT_FORCE;
      let dy = (y - prev.y) * SPLAT_FORCE;
      if (aspect < 1) dx *= aspect;
      if (aspect > 1) dy /= aspect;
      const s = panel.mouseSplat;
      panel.mouseSplat = s ? { x, y, dx: s.dx + dx, dy: s.dy + dy } : { x, y, dx, dy };
    }
  }

  function release() {
    for (const panel of panels) panel.pointer = null;
  }

  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") stir(e.clientX, e.clientY);
  });
  window.addEventListener("touchmove", (e) => stir(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  window.addEventListener("touchend", release);
  window.addEventListener("touchcancel", release);
})();
