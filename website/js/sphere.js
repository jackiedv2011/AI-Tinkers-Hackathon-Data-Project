/*
 * Image sphere — WebGL2 instanced image tiles on a slowly turning sphere, seen from
 * outside. Front tiles are crisp and tilted by their position on the globe, tiles near
 * the silhouette foreshorten, back tiles show through small, soft and faded.
 * One draw call, one texture atlas; the page masks out the centre behind the copy.
 */
(function () {
  'use strict';

  const VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 aQuad;
  layout(location = 1) in vec3 aPos;
  layout(location = 2) in vec4 aTile;   // w, h, roll, seed
  layout(location = 3) in vec4 aCell;   // col, row, cropX, cropY
  uniform mat3 uRot;
  uniform float uCamZ, uFocal, uIntro, uFogNear, uFogFar;
  uniform vec2 uCanvas;
  out vec2 vUv;
  out vec2 vLocal;
  out vec2 vHalf;
  flat out vec4 vCell;
  out float vFog;
  out float vAlpha;
  void main() {
    vec3 n = normalize(aPos);
    vec3 up = abs(n.y) > 0.98 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 t = normalize(cross(up, n));
    vec3 b = cross(n, t);
    float c = cos(aTile.z), s = sin(aTile.z);
    vec3 tr = t * c + b * s;
    vec3 br = -t * s + b * c;

    float k = clamp((uIntro - aTile.w * 1.4) / 1.2, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - k, 4.0);
    vec2 size = aTile.xy * mix(0.55, 1.0, e);

    float dc = uCamZ - (uRot * n).z;
    vec3 p = uRot * (n + tr * aQuad.x * size.x + br * aQuad.y * size.y);
    float depth = max(uCamZ - p.z, 0.001);
    vec2 sp = uFocal * p.xy / depth;
    gl_Position = vec4(sp / (uCanvas * 0.5) * depth, 0.0, depth);

    vUv = vec2(aQuad.x + 0.5, 0.5 - aQuad.y);
    vLocal = aQuad * size;
    vHalf = size * 0.5;
    vCell = aCell;
    vFog = smoothstep(uFogNear, uFogFar, dc);
    vAlpha = e;
  }`;

  const FS = `#version 300 es
  precision highp float;
  uniform sampler2D uTex;
  uniform vec2 uGrid, uTexSize;
  uniform vec3 uBg;
  uniform float uLodMax, uRadius, uFade;
  in vec2 vUv;
  in vec2 vLocal;
  in vec2 vHalf;
  flat in vec4 vCell;
  in float vFog;
  in float vAlpha;
  out vec4 outColor;
  float sdRound(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float r = min(vHalf.x, vHalf.y) * uRadius;
    float d = sdRound(vLocal, vHalf, r);
    float cov = clamp(0.5 - d / max(fwidth(d), 1e-5), 0.0, 1.0);

    vec2 cellSize = 1.0 / uGrid;
    vec2 inCell = 0.5 + (vUv - 0.5) * vCell.zw;
    vec2 tx = (vCell.xy + inCell) * cellSize * uTexSize;
    float autoLod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx)))));
    float lod = autoLod + vFog * uLodMax;
    float m = exp2(lod) * 1.5 / 256.0;
    inCell = clamp(inCell, vec2(m), vec2(1.0 - m));
    vec3 col = textureLod(uTex, (vCell.xy + inCell) * cellSize, lod).rgb;
    col = mix(col, uBg, vFog * 0.55);
    float a = cov * vAlpha * (1.0 - vFog * uFade);
    outColor = vec4(col * a, a);
  }`;

  const STRIDE = 11;
  const COLS = 10;
  const CELL = 256;

  function shader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[sphere]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(gl) {
    const vs = shader(gl, gl.VERTEX_SHADER, VS);
    const fs = shader(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[sphere]', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }

  const atlasCache = new Map();
  function buildAtlas(urls) {
    const key = urls.join('|');
    if (!atlasCache.has(key)) {
      atlasCache.set(key, Promise.all(urls.map(loadImage)).then((imgs) => {
        const rows = Math.ceil(urls.length / COLS);
        const cv = document.createElement('canvas');
        cv.width = COLS * CELL;
        cv.height = rows * CELL;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#dcd8d4';
        ctx.fillRect(0, 0, cv.width, cv.height);
        imgs.forEach((im, i) => {
          if (!im) return;
          const s = Math.min(im.width, im.height);
          ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
        });
        return { canvas: cv, rows };
      }));
    }
    return atlasCache.get(key);
  }

  function create(canvas, opts) {
    const o = Object.assign({
      count: 320, seed: 7, sizeMin: 0.055, sizeMax: 0.095, camZ: 2.6, sil: 0.5,
      fogNear: 2.3, fogFar: 3.35, lodMax: 3, radius: 0.26, fade: 0.62,
      speed: 0.035, mouse: 0.1, scrollYaw: 0.0004, pitch: 0.18, roll: 1.2, maxDpr: 1.75,
      bg: [0.969, 0.961, 0.953], box: () => Math.max(2000, innerWidth * 1.2),
    }, opts);

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    const prog = program(gl);
    if (!prog) return null;
    gl.useProgram(prog);
    const U = {};
    ['uRot', 'uCamZ', 'uFocal', 'uIntro', 'uFogNear', 'uFogFar', 'uCanvas', 'uTex', 'uGrid', 'uTexSize', 'uBg', 'uLodMax', 'uRadius', 'uFade']
      .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instances: jittered Fibonacci sphere, mixed aspect ratios, free roll.
    const rand = rng(o.seed);
    const N = o.count;
    const order = o.tiles.map((_, i) => i).sort(() => rand() - 0.5);
    const base = new Float32Array(N * STRIDE);
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) / N) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963 + (rand() - 0.5) * 0.4;
      let px = Math.cos(th) * r, py = y + (rand() - 0.5) * 0.03, pz = Math.sin(th) * r;
      const l = Math.hypot(px, py, pz);
      px /= l; py /= l; pz /= l;
      const asp = [1, 0.75, 1.333, 0.8, 1.25, 1, 0.7, 1.4][Math.floor(rand() * 8)];
      const s = o.sizeMin + (o.sizeMax - o.sizeMin) * rand();
      const idx = order[i % order.length];
      const j = i * STRIDE;
      base[j] = px; base[j + 1] = py; base[j + 2] = pz;
      base[j + 3] = s * Math.sqrt(asp);
      base[j + 4] = s / Math.sqrt(asp);
      base[j + 5] = (rand() - 0.5) * o.roll;
      base[j + 6] = rand();
      base[j + 7] = idx % COLS;
      base[j + 8] = Math.floor(idx / COLS);
      base[j + 9] = asp >= 1 ? 1 : asp;
      base[j + 10] = asp >= 1 ? 1 / asp : 1;
    }
    const sorted = new Float32Array(N * STRIDE);
    const depth = new Float32Array(N);
    const idxs = Array.from({ length: N }, (_, i) => i);

    const inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, sorted.byteLength, gl.DYNAMIC_DRAW);
    [[1, 3, 0], [2, 4, 12], [3, 4, 28]].forEach(([loc, size, off]) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off);
      gl.vertexAttribDivisor(loc, 1);
    });

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let W = 1, H = 1, visible = true, ready = false, time = 0, last = performance.now();
    let mx = 0, my = 0, tmx = 0, tmy = 0, scroll = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr);
      W = canvas.clientWidth || 1;
      H = canvas.clientHeight || 1;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    }
    new ResizeObserver(resize).observe(canvas);
    resize();
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(canvas);
    window.addEventListener('pointermove', (e) => {
      tmx = (e.clientX / innerWidth) * 2 - 1;
      tmy = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });

    buildAtlas(o.tiles).then(({ canvas: atlas, rows }) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      gl.uniform1i(U.uTex, 0);
      gl.uniform2f(U.uGrid, COLS, rows);
      gl.uniform2f(U.uTexSize, atlas.width, atlas.height);
      gl.uniform3f(U.uBg, o.bg[0], o.bg[1], o.bg[2]);
      gl.uniform1f(U.uLodMax, o.lodMax);
      gl.uniform1f(U.uRadius, o.radius);
      gl.uniform1f(U.uFade, o.fade);
      ready = true;
      requestAnimationFrame(() => {
        canvas.classList.add('on');
        if (o.onReady) o.onReady();
      });
    });

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!ready || !visible || document.hidden) return;
      time = reduced.matches ? 10 : time + dt;
      const ease = Math.min(1, dt * 2.2);
      mx += (tmx - mx) * ease;
      my += (tmy - my) * ease;

      const yaw = reduced.matches ? 0.3 : time * o.speed + mx * o.mouse + scroll * o.scrollYaw;
      const pitch = o.pitch + Math.sin(time * 0.11) * 0.04 + my * o.mouse * 0.6;
      const ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(pitch), sb = Math.sin(pitch);
      // R = Ry(yaw) * Rx(pitch), column-major
      const R = [ca, 0, -sa, sa * sb, cb, ca * sb, sa * cb, -sb, ca * cb];

      // Far tiles first so faded back tiles blend under the crisp front ones.
      for (let i = 0; i < N; i++) {
        const j = i * STRIDE;
        depth[i] = -(-sa * base[j] + ca * sb * base[j + 1] + ca * cb * base[j + 2]);
      }
      idxs.sort((a, b) => depth[b] - depth[a]);
      for (let k = 0; k < N; k++) sorted.set(base.subarray(idxs[k] * STRIDE, idxs[k] * STRIDE + STRIDE), k * STRIDE);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sorted);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix3fv(U.uRot, false, R);
      gl.uniform1f(U.uCamZ, o.camZ);
      gl.uniform1f(U.uFocal, (o.box() * o.sil) / Math.tan(Math.asin(1 / o.camZ)));
      gl.uniform1f(U.uIntro, time);
      gl.uniform1f(U.uFogNear, o.fogNear);
      gl.uniform1f(U.uFogFar, o.fogFar);
      gl.uniform2f(U.uCanvas, W, H);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, N);
    }
    requestAnimationFrame(frame);

    return {
      setScroll(v) { scroll = v; },
    };
  }

  window.HeadroomSphere = { create };
})();
