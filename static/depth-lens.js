// Depth lens: hovering the background lifts that region of the photo into a
// 3D point cloud, using a monocular depth map (Depth Anything V2) of the image.
(() => {
  const canvas = document.getElementById('depth-lens');
  if (!canvas) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const wide = matchMedia('(min-width: 1001px)');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  if (!fine.matches || calm.matches) return;
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: true });
  if (!gl) return;

  const VS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 aUv;
  uniform sampler2D uDepth;
  uniform vec2 uRes, uOff, uSize, uLens, uShift;
  uniform float uR, uAmt, uD0, uCell, uPop;
  out vec2 vUv; out float vW; out float vD;
  void main() {
    vec2 s = uOff + aUv * uSize;
    float w = smoothstep(uR, uR * 0.4, distance(s, uLens)) * uAmt;
    if (w < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    float d = pow(texture(uDepth, aUv).r, 0.6);
    float rel = d - uD0;
    // Parallax is proportional to disparity: shift = camera strafe, pop = camera dolly.
    vec2 p = s + w * rel * (uShift + (s - uLens) * uPop);
    vec2 c = p / uRes * 2.0 - 1.0;
    gl_Position = vec4(c.x, -c.y, 0.9 - d * 1.8, 1.0);
    gl_PointSize = uCell * mix(1.5, 0.42 + 0.5 * d, smoothstep(0.0, 0.5, w));
    vUv = aUv; vW = w; vD = d;
  }`;
  const FS = `#version 300 es
  precision mediump float;
  uniform sampler2D uImg;
  in vec2 vUv; in float vW; in float vD;
  out vec4 o;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    if (dot(q, q) > 0.25) discard;
    vec3 col = texture(uImg, vUv).rgb;
    vec3 pal = mix(vec3(0.20, 0.72, 1.0), vec3(1.0, 0.72, 0.42), smoothstep(0.05, 0.75, vD));
    float rim = smoothstep(0.0, 0.3, vW) * smoothstep(0.75, 0.3, vW);
    col = mix(col * (1.0 + 0.4 * vW) + 0.03 * vW, pal, 0.1 * vW + 0.45 * rim);
    float a = smoothstep(0.0, 0.3, vW);
    o = vec4(col * a, a);
  }`;
  const QVS = `#version 300 es
  layout(location=0) in vec2 aP;
  void main() { gl_Position = vec4(aP, 0.0, 1.0); }`;
  const QFS = `#version 300 es
  precision mediump float;
  uniform vec2 uLens; uniform float uR, uAmt, uH;
  out vec4 o;
  void main() {
    vec2 s = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
    float a = smoothstep(uR, uR * 0.45, distance(s, uLens)) * uAmt * 0.86;
    o = vec4(vec3(0.03, 0.055, 0.07) * a, a);
  }`;

  const program = (vs, fs) => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  };
  const load = (src) => new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
  const texture = (unit, im) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  Promise.all([load(canvas.dataset.image), load(canvas.dataset.depth)]).then(([img, dep]) => {
    const pts = program(VS, FS), quad = program(QVS, QFS);
    texture(0, img); texture(1, dep);

    // CPU copy of the depth map, to find the depth under the cursor (the pivot).
    const dc = document.createElement('canvas'); dc.width = dep.width; dc.height = dep.height;
    const dctx = dc.getContext('2d', { willReadFrequently: true }); dctx.drawImage(dep, 0, 0);
    const dpx = dctx.getImageData(0, 0, dep.width, dep.height).data;
    const depthAt = (u, v) => {
      const x = Math.min(dep.width - 1, Math.max(0, Math.round(u * dep.width)));
      const y = Math.min(dep.height - 1, Math.max(0, Math.round(v * dep.height)));
      return Math.pow(dpx[(y * dep.width + x) * 4] / 255, 0.6);
    };

    // Staggered grid of points over the whole image; the shader culls those outside the lens.
    const COLS = 400, ROWS = Math.round(COLS * img.height / img.width / 0.866);
    const uv = new Float32Array(COLS * ROWS * 2);
    for (let y = 0, i = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      uv[i++] = (x + (y % 2 ? 0.75 : 0.25)) / COLS;
      uv[i++] = (y + 0.5) / ROWS;
    }
    const vaoP = gl.createVertexArray(); gl.bindVertexArray(vaoP);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const vaoQ = gl.createVertexArray(); gl.bindVertexArray(vaoQ);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let dpr = 1, W = 0, H = 0, off = [0, 0], size = [1, 1];
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = Math.round(canvas.clientWidth * dpr); H = Math.round(canvas.clientHeight * dpr);
      canvas.width = W; canvas.height = H;
      const k = Math.max(W / img.width, H / img.height); // background-size: cover, centered
      size = [img.width * k, img.height * k]; off = [(W - size[0]) / 2, (H - size[1]) / 2];
    };
    resize(); addEventListener('resize', resize);

    const s = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, amt: 0, target: 0, d0: 0.3, raf: 0, last: 0, seen: false };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - s.last) / 1000 || 0.016); s.last = now;
      const k = 1 - Math.exp(-dt * 9);
      const px = s.x, py = s.y;
      s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k;
      const kv = 1 - Math.exp(-dt * 5);
      s.vx += ((s.x - px) / dt - s.vx) * kv; s.vy += ((s.y - py) / dt - s.vy) * kv;
      s.amt += (s.target - s.amt) * (1 - Math.exp(-dt * (s.target ? 5 : 7)));
      s.d0 += (depthAt((s.x - off[0]) / size[0], (s.y - off[1]) / size[1]) - s.d0) * (1 - Math.exp(-dt * 4));

      const R = Math.min(300, Math.max(170, innerWidth * 0.15)) * dpr * (0.75 + 0.25 * s.amt);
      const t = now / 1000, orbit = 95 * dpr;
      const clamp = (v) => Math.max(-1, Math.min(1, v / (1400 * dpr)));
      // Slow idle orbit of the virtual camera, plus a kick opposite to pointer motion.
      const shift = [Math.cos(t * 0.9) * orbit - clamp(s.vx) * 240 * dpr, Math.sin(t * 0.9) * orbit * 0.55 - clamp(s.vy) * 240 * dpr];

      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(quad.p); gl.bindVertexArray(vaoQ);
      gl.uniform2f(quad.u.uLens, s.x, s.y); gl.uniform1f(quad.u.uR, R); gl.uniform1f(quad.u.uAmt, s.amt); gl.uniform1f(quad.u.uH, H);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      gl.useProgram(pts.p); gl.bindVertexArray(vaoP);
      gl.uniform1i(pts.u.uImg, 0); gl.uniform1i(pts.u.uDepth, 1);
      gl.uniform2f(pts.u.uRes, W, H); gl.uniform2f(pts.u.uOff, off[0], off[1]); gl.uniform2f(pts.u.uSize, size[0], size[1]);
      gl.uniform2f(pts.u.uLens, s.x, s.y); gl.uniform2f(pts.u.uShift, shift[0], shift[1]);
      gl.uniform1f(pts.u.uR, R); gl.uniform1f(pts.u.uAmt, s.amt); gl.uniform1f(pts.u.uD0, s.d0);
      gl.uniform1f(pts.u.uCell, size[0] / COLS); gl.uniform1f(pts.u.uPop, 0.55 + 0.1 * Math.sin(t * 0.6));
      gl.drawArrays(gl.POINTS, 0, COLS * ROWS);

      s.raf = (s.target || s.amt > 0.003) ? requestAnimationFrame(frame) : 0;
      if (!s.raf) gl.clear(gl.COLOR_BUFFER_BIT);
    };
    const wake = () => { if (!s.raf) { s.last = performance.now(); s.raf = requestAnimationFrame(frame); } };

    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !wide.matches) { s.target = 0; return; }
      const r = canvas.getBoundingClientRect();
      s.tx = (e.clientX - r.left) * dpr; s.ty = (e.clientY - r.top) * dpr;
      if (!s.seen) { s.seen = true; s.x = s.tx; s.y = s.ty; }
      // Stay out of the way while the pointer is on a link or other control.
      s.target = e.target.closest && e.target.closest('a, button') ? 0 : 1;
      wake();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { s.target = 0; });
    addEventListener('blur', () => { s.target = 0; });
  }).catch((err) => console.warn('depth lens disabled:', err));
})();
