// 3D relief model of the bay (Three.js r128): terrain diorama, water coloured by wind speed with a crisp
// coastline, arrows showing where the wind blows, wind streaks, yacht marker, clouds, front, storm and
// model-grid blocks. One WebGL renderer is shared by all views; only the active view renders.
// Interface used by topics and the final simulator:
//   new MapView(container, { yacht, mode, onYacht, onClick })
//   setField(fn, cells), overlays (object) + drawStatic(), showCells, yacht (setter), mode, follow,
//   activate(), setView('3d' | 'top'), toast(text)
(function () {
  const Bay = globalThis.Bay, Draw = globalThis.Draw, Ens = globalThis.Ens;
  const W = Bay.W, H = Bay.H;
  const EX = 0.003; // scene units per metre of height: 1 unit = 1 km, relief exaggerated x3
  const BASE = -1.1;
  const GX = 81, GY = 61, GD = 0.5;
  const MQ = (q) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
  const COARSE = MQ('(pointer: coarse)');
  const REDUCED = MQ('(prefers-reduced-motion: reduce)');
  const X = (x) => x - W / 2, Z = (y) => H / 2 - y;
  const surf = (x, y) => (Bay.isLand(x, y) ? Math.max(4, Bay.elev(x, y)) * EX : 0);
  const D2R = Math.PI / 180;
  const FOV = 36, T18 = Math.tan((FOV / 2) * D2R);
  const WW = COARSE ? 1200 : 1600, WH = WW * 0.75; // water texture, px
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // Render-only relief detail: ridged value noise on land, so the mountains get spurs and gullies.
  // The wind model keeps the smooth elevation.
  function hash(i, j) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function ridged(x, y) { let s = 0, amp = 0.55, f = 0.5; for (let o = 0; o < 4; o++) { const n = 1 - Math.abs(vnoise(x * f + 17, y * f - 9) * 2 - 1); s += n * n * amp; amp *= 0.5; f *= 2.13; } return s; }
  function elevR(x, y) { const e = Bay.elev(x, y); if (e <= 0) return e; const k = Math.min(1, e / 260); return Math.max(4, e + (ridged(x, y) - 0.42) * k * (110 + 0.14 * e)); }

  // Neutral relief ramp, so that wind colours on the water never look like land.
  const HYPSO = [[0, [0.66, 0.67, 0.56]], [250, [0.6, 0.62, 0.5]], [600, [0.63, 0.6, 0.5]], [1000, [0.6, 0.56, 0.5]], [1350, [0.66, 0.64, 0.6]], [1600, [0.84, 0.83, 0.81]]];
  function hypso(e) {
    if (e <= HYPSO[0][0]) return HYPSO[0][1];
    for (let i = 1; i < HYPSO.length; i++) if (e <= HYPSO[i][0]) {
      const [a, c0] = HYPSO[i - 1], [b, c1] = HYPSO[i], t = (e - a) / (b - a);
      return c0.map((v, k) => v + (c1[k] - v) * t);
    }
    return HYPSO[HYPSO.length - 1][1];
  }

  let glOK = null;
  function webglOK() {
    if (glOK !== null) return glOK;
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      glOK = !!gl;
      const ext = gl && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    } catch (e) { glOK = false; }
    return glOK;
  }

  // ------------------------------------------------------------------ shared assets
  let shared = null;
  function getShared() {
    if (shared) return shared;
    const nx = COARSE ? 170 : 260, ny = Math.round(nx * 0.75);
    const g = new THREE.PlaneGeometry(W, H, nx, ny);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + W / 2, y = H / 2 - pos.getZ(i);
      let h, c;
      if (Bay.isLand(x, y)) { const e = elevR(x, y); h = e * EX; c = hypso(e); }
      else { const d = -Bay.sd(x, y), t = Math.min(1, d / 3); h = -0.05 - Math.min(0.5, d * 0.12); c = [0.62 - 0.3 * t, 0.66 - 0.25 * t, 0.66 - 0.15 * t]; }
      pos.setY(i, h); col.set(c, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();

    const edge = [], st = 0.2;
    for (let x = 0; x < W; x += st) edge.push([x, 0]);
    for (let y = 0; y < H; y += st) edge.push([W, y]);
    for (let x = W; x > 0; x -= st) edge.push([x, H]);
    for (let y = H; y >= 0; y -= st) edge.push([0, y]);
    const sp = [], sc = [];
    for (let i = 0; i < edge.length - 1; i++) {
      const [ax, ay] = edge[i], [bx, by] = edge[i + 1];
      const at = Math.max(0, surf(ax, ay)), bt = Math.max(0, surf(bx, by));
      const ca = Bay.isLand(ax, ay) ? [0.45, 0.41, 0.36] : [0.18, 0.42, 0.56], cb = Bay.isLand(bx, by) ? [0.45, 0.41, 0.36] : [0.18, 0.42, 0.56];
      const bot = [0.13, 0.12, 0.11];
      sp.push(X(ax), at, Z(ay), X(bx), bt, Z(by), X(bx), BASE, Z(by), X(ax), at, Z(ay), X(bx), BASE, Z(by), X(ax), BASE, Z(ay));
      sc.push(...ca, ...cb, ...bot, ...ca, ...bot, ...bot);
    }
    const sk = new THREE.BufferGeometry();
    sk.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sk.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sk.computeVertexNormals();

    // Baked relief texture: hypsometric tint, hillshade from the north-west, valleys darker, beaches.
    const TW = COARSE ? 1024 : 1400, TH = Math.round(TW * 0.75), tc = document.createElement('canvas'); tc.width = TW; tc.height = TH;
    const tctx = tc.getContext('2d'), ti = tctx.createImageData(TW, TH), LX = -0.5, LY = 0.5, LZ = 0.71, px = W / TW;
    const E = new Float32Array(TW * TH);
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) E[j * TW + i] = elevR(((i + 0.5) / TW) * W, H - ((j + 0.5) / TH) * H);
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
      const x = ((i + 0.5) / TW) * W, y = H - ((j + 0.5) / TH) * H, k = j * TW + i, e = E[k], q = k * 4;
      let r, gg, b;
      if (e <= 0) { const dep = Math.min(1, -Bay.sd(x, y) / 3); r = 0.78 - 0.45 * dep; gg = 0.76 - 0.36 * dep; b = 0.66 - 0.2 * dep; }
      else {
        const i0 = Math.max(0, i - 1), i1 = Math.min(TW - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(TH - 1, j + 1);
        const gx = (E[j * TW + i1] - E[j * TW + i0]) / ((i1 - i0) * px * 1000) * 2.2, gy = (E[j0 * TW + i] - E[j1 * TW + i]) / ((j1 - j0) * px * 1000) * 2.2;
        const nl = Math.hypot(gx, gy, 1), sh = Math.max(0, (-gx * LX - gy * LY + LZ) / nl), slope = Math.min(1, Math.hypot(gx, gy) / 2.5);
        const ao = 1 - clamp((Bay.elevSmooth(x, y) - e) / 420, -0.14, 0.3);
        const base = hypso(e), rock = [0.55, 0.52, 0.48];
        const kk = (0.55 + 0.62 * sh) * ao;
        [r, gg, b] = base.map((v, n) => (v * (1 - slope * 0.5) + rock[n] * slope * 0.5) * kk);
        if (e < 14) { const s2 = 1 - e / 14; r = r * (1 - s2) + 0.88 * s2; gg = gg * (1 - s2) + 0.84 * s2; b = b * (1 - s2) + 0.72 * s2; }
      }
      ti.data[q] = clamp(r, 0, 1) * 255; ti.data[q + 1] = clamp(gg, 0, 1) * 255; ti.data[q + 2] = clamp(b, 0, 1) * 255; ti.data[q + 3] = 255;
    }
    tctx.putImageData(ti, 0, 0);
    const terrainTex = new THREE.CanvasTexture(tc); terrainTex.anisotropy = 8;

    // Water: depth tint, sea mask and a crisp coastline at 40 px per km.
    const mk = () => { const c = document.createElement('canvas'); c.width = WW; c.height = WH; return c; };
    const base = mk(), mask = mk(), coastL = mk(), coastD = mk();
    const bi = base.getContext('2d').createImageData(WW, WH), mi = mask.getContext('2d').createImageData(WW, WH);
    const cl = coastL.getContext('2d').createImageData(WW, WH), cd = coastD.getContext('2d').createImageData(WW, WH);
    const land = new Uint8Array(WW * WH);
    for (let j = 0; j < WH; j++) for (let i = 0; i < WW; i++) land[j * WW + i] = Bay.elev(((i + 0.5) / WW) * W, H - ((j + 0.5) / WH) * H) > 0 ? 1 : 0;
    for (let j = 0; j < WH; j++) for (let i = 0; i < WW; i++) {
      const k = j * WW + i, p = k * 4;
      if (land[k]) continue;
      const x = ((i + 0.5) / WW) * W, y = H - ((j + 0.5) / WH) * H, t = Math.min(1, -Bay.sd(x, y) / 4);
      bi.data[p] = 70 - 40 * t; bi.data[p + 1] = 150 - 60 * t; bi.data[p + 2] = 180 - 40 * t; bi.data[p + 3] = 255;
      mi.data[p + 3] = 255;
      let nb = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < WW && jj < WH && land[jj * WW + ii]) nb = 1; }
      if (nb) { cl.data[p] = 18; cl.data[p + 1] = 38; cl.data[p + 2] = 58; cl.data[p + 3] = 200; cd.data[p] = cd.data[p + 1] = cd.data[p + 2] = 255; cd.data[p + 3] = 210; }
    }
    base.getContext('2d').putImageData(bi, 0, 0); mask.getContext('2d').putImageData(mi, 0, 0);
    coastL.getContext('2d').putImageData(cl, 0, 0); coastD.getContext('2d').putImageData(cd, 0, 0);

    // Cloud puff: several soft lobes, bright top, greyer base.
    const pc = document.createElement('canvas'); pc.width = pc.height = 128;
    const p2 = pc.getContext('2d'), rp = Ens.rng(5);
    for (let k = 0; k < 9; k++) {
      const cx = 30 + rp() * 68, cy = 40 + rp() * 50, rr = 18 + rp() * 22;
      const gr = p2.createRadialGradient(cx - rr * 0.3, cy - rr * 0.35, rr * 0.1, cx, cy, rr);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(245,247,250,0.85)'); gr.addColorStop(1, 'rgba(235,238,243,0)');
      p2.fillStyle = gr; p2.beginPath(); p2.arc(cx, cy, rr, 0, Math.PI * 2); p2.fill();
    }
    p2.globalCompositeOperation = 'source-atop';
    const sh2 = p2.createLinearGradient(0, 40, 0, 120); sh2.addColorStop(0, 'rgba(255,255,255,0)'); sh2.addColorStop(1, 'rgba(120,130,148,0.55)');
    p2.fillStyle = sh2; p2.fillRect(0, 0, 128, 128);
    const puff = new THREE.CanvasTexture(pc);

    const rc = Ens.rng(7), cu = [];
    for (let y = 1; y < H; y += 2.2) for (let x = 1; x < W; x += 2.2) {
      const s = Bay.sd(x, y);
      if (s > 1.8 && s < 3.6 && Bay.elev(x, y) < 1100 && Bay.ridgeS(x, y) < 0) cu.push([x + (rc() - 0.5), y + (rc() - 0.5)]);
    }
    // Barb stations: a 3 km grid on open water plus the places where local effects live.
    const arrowPts = [];
    for (let y = 1.5; y < H; y += 3) for (let x = 1.5; x < W; x += 3) if (!Bay.isLand(x, y) && Bay.sd(x, y) < -0.7) arrowPts.push([x, y]);
    for (const p of [[21.1, 13.07], [8.2, 3.5], [22.6, 19.6], [29.6, 18.2], [25.2, 16.4], [3.0, 13.0], [12.6, 0.8], [15.2, 3.2]]) {
      if (!Bay.isLand(p[0], p[1]) && !arrowPts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.6)) arrowPts.push(p);
    }
    const s = new THREE.Shape();
    s.moveTo(0, -0.5); s.lineTo(0.32, -0.05); s.lineTo(0.11, -0.05); s.lineTo(0.11, 0.5); s.lineTo(-0.11, 0.5); s.lineTo(-0.11, -0.05); s.lineTo(-0.32, -0.05); s.closePath();
    const arrowGeo = new THREE.ShapeGeometry(s);
    arrowGeo.rotateX(-Math.PI / 2); // flat on the water; the tip ends up at +Z (south)
    arrowGeo.rotateY(Math.PI); //      turn it to -Z (north), so yaw -(dir+180) points downwind
    shared = { terrain: g, terrainTex, skirt: sk, waterBase: base, waterMask: mask, coastL, coastD, puff, cu, arrowPts, arrowGeo, elevCache: new Map() };
    return shared;
  }

  function meanElev(x0, y0, w, h) {
    const n = Math.max(3, Math.min(40, Math.round(Math.max(w, h) / 0.3)));
    let s = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) s += Math.max(0, Bay.elev(x0 + ((i + 0.5) * w) / n, y0 + ((j + 0.5) * h) / n));
    return s / (n * n);
  }

  // ------------------------------------------------------------------ 3D wind barbs
  // Barb lying flat: staff from the station toward where the wind comes from, feathers on the clockwise side.
  function barbSegments(kn, len) { // returns [[ax, az, bx, bz], ...] for a north wind (staff toward -Z) and pennants as triangles
    const seg = [], tri = [];
    if (kn < 2.5) return { seg, tri, calm: true };
    seg.push([0, 0, 0, -len]);
    let n = Math.round(kn / 5) * 5, pos = len; const step = len * 0.16, fl = len * 0.42;
    while (n >= 50) { tri.push([0, -pos, fl, -(pos - step * 0.5), 0, -(pos - step)]); pos -= step * 1.25; n -= 50; }
    while (n >= 10) { seg.push([0, -pos, fl, -(pos + step * 0.6)]); pos -= step; n -= 10; }
    if (n >= 5) { if (pos === len) pos -= step; seg.push([0, -pos, fl * 0.5, -(pos + step * 0.3)]); }
    return { seg, tri };
  }
  function barbMesh(kn, len, color, th) {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color });
    const { seg, tri, calm } = barbSegments(kn, len);
    if (calm) { const r = new THREE.Mesh(new THREE.RingGeometry(len * 0.14, len * 0.14 + th, 24), mat); r.rotation.x = -Math.PI / 2; g.add(r); return g; }
    for (const [ax, az, bx, bz] of seg) {
      const L = Math.hypot(bx - ax, bz - az), m = new THREE.Mesh(new THREE.BoxGeometry(th, th, L + th), mat);
      m.position.set((ax + bx) / 2, 0, (az + bz) / 2); m.rotation.y = Math.atan2(bx - ax, bz - az); g.add(m);
    }
    for (const [x1, z1, x2, z2, x3, z3] of tri) {
      const sh = new THREE.Shape(); sh.moveTo(x1, -z1); sh.lineTo(x2, -z2); sh.lineTo(x3, -z3); sh.closePath();
      const tg = new THREE.ShapeGeometry(sh); tg.rotateX(-Math.PI / 2); g.add(new THREE.Mesh(tg, mat));
    }
    return g;
  }
  function addBarbLines(out, cx, cy, cz, dir, kn, len) { // into a flat position array for LineSegments
    const { seg, tri, calm } = barbSegments(kn, len), a = -dir * D2R, ca = Math.cos(a), sa = Math.sin(a);
    const P = (x, z) => [cx + x * ca + z * sa, cy, cz - x * sa + z * ca];
    if (calm) { for (let k = 0; k < 12; k++) { const t0 = (k / 12) * Math.PI * 2, t1 = ((k + 1) / 12) * Math.PI * 2, r = len * 0.14; out.push(cx + r * Math.cos(t0), cy, cz + r * Math.sin(t0), cx + r * Math.cos(t1), cy, cz + r * Math.sin(t1)); } return; }
    for (const [ax, az, bx, bz] of seg) out.push(...P(ax, az), ...P(bx, bz));
    for (const [x1, z1, x2, z2, x3, z3] of tri) out.push(...P(x1, z1), ...P(x2, z2), ...P(x2, z2), ...P(x3, z3), ...P(x3, z3), ...P(x1, z1));
  }

  // ------------------------------------------------------------------ shared renderer
  let R = null, ACTIVE = null;
  function getRenderer() {
    if (R) return R;
    R = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: COARSE ? 'default' : 'high-performance' });
    R.setPixelRatio(Math.min(COARSE ? 1.5 : 2, window.devicePixelRatio || 1));
    if (!COARSE) { R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; }
    const el = R.domElement;
    el.className = 'map-canvas';
    el.tabIndex = 0;
    el.setAttribute('role', 'application');
    el.setAttribute('aria-roledescription', 'карта');
    el.setAttribute('aria-label', 'Объёмная карта бухты. Стрелки клавиатуры двигают яхту.');
    // Our listeners are registered before any OrbitControls, so they run first.
    const fwd = (name) => (e) => ACTIVE && ACTIVE[name](e);
    el.addEventListener('pointerdown', fwd('_down'));
    el.addEventListener('pointermove', fwd('_move'));
    el.addEventListener('pointerup', fwd('_up'));
    el.addEventListener('pointercancel', fwd('_cancel'));
    el.addEventListener('touchstart', fwd('_touch'), { passive: false });
    el.addEventListener('keydown', fwd('_key'));
    el.addEventListener('wheel', fwd('_wheel'), { passive: false });
    el.addEventListener('webglcontextlost', (e) => e.preventDefault());
    return R;
  }

  class MapView {
    constructor(container, opts = {}) {
      this.opts = opts;
      this.wrap = document.createElement('div');
      this.wrap.className = 'map-wrap';
      container.appendChild(this.wrap);
      this.mode = opts.mode || 'yacht';
      this.overlays = {};
      this.showCells = false;
      this.follow = false;
      this.alive = true;
      this.fieldU = new Float32Array(GX * GY); this.fieldV = new Float32Array(GX * GY);
      this.fieldS = new Float32Array(GX * GY); this.fieldVar = new Uint8Array(GX * GY);
      this._s = new Float32Array(4);
      this._yacht = opts.yacht ? { ...opts.yacht } : null;
      if (!globalThis.THREE || !webglOK()) {
        this.wrap.classList.add('no-gl');
        this.wrap.textContent = 'Для 3D-карты нужен браузер с поддержкой WebGL.';
        return;
      }
      this.S = getShared();
      this.renderer = getRenderer();
      this._initScene();
      this._initUI();
      this._updateYacht();
      this.wrap.addEventListener('themechange', () => { this._applyTheme(); this._paintWater(); this._sizes = null; });
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.wrap);
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    // Take over the shared canvas. Called when the view becomes visible.
    activate() {
      if (!this.renderer) return;
      if (ACTIVE && ACTIVE !== this) ACTIVE.controls.enabled = false;
      ACTIVE = this;
      this.wrap.insertBefore(this.renderer.domElement, this.wrap.firstChild);
      this.controls.enabled = true;
      this.renderer.domElement.style.touchAction = COARSE ? 'pan-y' : 'none';
      this.w = 0; this.resize();
    }

    _initScene() {
      const scene = new THREE.Scene();
      this.scene = scene;
      this.camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.1, 400);
      this.hemi = new THREE.HemisphereLight(0xe4f0ff, 0x5d5140, 0.8);
      this.sun = new THREE.DirectionalLight(0xfff0dc, 0.85);
      this.sun.position.set(-22, 30, -16); // from the north-west, as on relief maps
      if (!COARSE) {
        this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0006;
        Object.assign(this.sun.shadow.camera, { left: -27, right: 27, top: 24, bottom: -24, near: 1, far: 120 });
      }
      scene.add(this.hemi, this.sun, this.sun.target);
      this.terrain = new THREE.Mesh(this.S.terrain, new THREE.MeshLambertMaterial({ map: this.S.terrainTex }));
      this.terrain.castShadow = this.terrain.receiveShadow = !COARSE;
      this.skirt = new THREE.Mesh(this.S.skirt, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      scene.add(this.terrain, this.skirt);
      this.waterCanvas = document.createElement('canvas'); this.waterCanvas.width = WW; this.waterCanvas.height = WH;
      this._lay = document.createElement('canvas'); this._lay.width = WW; this._lay.height = WH;
      this._small = document.createElement('canvas'); this._small.width = GX; this._small.height = GY;
      this.waterTex = new THREE.CanvasTexture(this.waterCanvas);
      this.waterTex.anisotropy = 8;
      const wg = new THREE.PlaneGeometry(W, H); wg.rotateX(-Math.PI / 2);
      // Unlit water: colours match the legend exactly; drawn before fog, clouds and other transparent effects.
      this.water = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: this.waterTex, transparent: true }));
      this.water.position.y = 0.002; this.water.renderOrder = -1;
      scene.add(this.water);
      this.fx = new THREE.Group(); scene.add(this.fx);
      this.anim = [];

      const N = COARSE ? 900 : 2000, L = COARSE ? 7 : 10;
      this.P = { N, L, x: new Float32Array(N), y: new Float32Array(N), age: new Float32Array(N), life: new Float32Array(N), land: new Uint8Array(N), hist: new Float32Array(N * L * 3) };
      const pg = new THREE.BufferGeometry();
      this.pPos = new Float32Array(N * (L - 1) * 2 * 3);
      this.pCol = new Float32Array(N * (L - 1) * 2 * 4);
      pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
      pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
      this.particles = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      this.particles.frustumCulled = false; this.particles.renderOrder = 5; // after the transparent water
      scene.add(this.particles);
      for (let i = 0; i < N; i++) this._spawn(i, true);


      this.yachtG = this._buildYacht();
      scene.add(this.yachtG);
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      const c = this.controls;
      c.enabled = false;
      c.enableDamping = true; c.dampingFactor = 0.08;
      c.minDistance = 10; c.maxDistance = 95; c.maxPolarAngle = 1.38;
      c.screenSpacePanning = false; c.enableKeys = false; c.enableZoom = false; // zoom: Ctrl + wheel, buttons
      c.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_ROTATE };
      c.addEventListener('start', () => { this._userMoved = true; });
      this.renderer.domElement.style.touchAction = COARSE ? 'pan-y' : 'none';
      this._applyTheme();
      this._view = '3d';
    }

    _applyTheme() {
      const bg = new THREE.Color(Draw.css('--scene-bg'));
      const dark = bg.getHSL({}).l < 0.3, night = !!(this.overlays && this.overlays.night);
      const sky = night ? new THREE.Color(dark ? 0x070d16 : 0x46566e) : bg;
      this.scene.background = sky; this.scene.fog = new THREE.Fog(sky, 80, 190);
      this.hemi.intensity = night ? 0.45 : dark ? 0.6 : 0.82;
      this.sun.intensity = night ? 0.3 : dark ? 0.6 : 0.85;
      this.sun.color.set(night || dark ? 0xc8d6ff : 0xfff0dc);
      this.dark = dark;
      this._barbColor = dark || night ? 0xffffff : 0x10243a;
      if (this.water) this.water.material.color.set(night ? 0x8090aa : dark ? 0xc8d0da : 0xffffff);
    }

    _buildYacht() {
      const g = new THREE.Group();
      const s = new THREE.Shape();
      s.moveTo(0, -0.34); s.bezierCurveTo(0.13, -0.15, 0.13, 0.14, 0.09, 0.27); s.lineTo(-0.09, 0.27); s.bezierCurveTo(-0.13, 0.14, -0.13, -0.15, 0, -0.34);
      const hg = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: false });
      hg.rotateX(Math.PI / 2); hg.translate(0, 0.11, 0);
      const hull = new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ color: 0xe0621c }));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 6), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      mast.position.set(0, 0.57, -0.04);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.15, 0, 0, 1.0, 0, 0, 0.16, 0.42], 3));
      sg.computeVertexNormals();
      const sail = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      this.sailPivot = new THREE.Group(); this.sailPivot.position.set(0, 0, -0.04); this.sailPivot.add(sail);
      this.boat = new THREE.Group(); this.boat.add(hull, mast, this.sailPivot); this.boat.scale.setScalar(2);
      // Wind barb at the yacht, lifted a little above the water.
      this.windArrow = new THREE.Group(); this.windArrow.position.y = 0.6;
      g.add(this.boat, this.windArrow);
      return g;
    }

    _initUI() {
      this.labelBox = document.createElement('div'); this.labelBox.className = 'map-labels';
      this.wrap.appendChild(this.labelBox);
      this.yMark = document.createElement('div'); this.yMark.className = 'yacht-mark';
      this.yLabel = document.createElement('div'); this.yLabel.className = 'lbl lbl-yacht';
      this.labelBox.append(this.yMark, this.yLabel);
      const box = document.createElement('div'); box.className = 'view-btns';
      const mk = (label, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); box.appendChild(b); return b; };
      mk('3D', 'Объёмный вид', () => this.setView('3d', true));
      mk('Сверху', 'Вид сверху', () => this.setView('top', true));
      const nb = mk('Названия', 'Показать названия мест', () => { this._showNames = !this._showNames; nb.setAttribute('aria-pressed', String(this._showNames)); nb.classList.toggle('on', this._showNames); this._sizes = null; });
      mk('+', 'Приблизить', () => this._zoom(0.8));
      mk('−', 'Отдалить', () => this._zoom(1.25));
      this.wrap.appendChild(box);
      this.compass = document.createElement('div'); this.compass.className = 'compass'; this.compass.setAttribute('aria-hidden', 'true');
      this.compass.innerHTML = '<svg viewBox="-19 -19 38 38"><polygon points="0,-14 5,2 0,-1 -5,2" fill="#c62f3a"/><polygon points="0,14 5,-2 0,1 -5,-2" fill="#12263a"/><text x="0" y="-5" font-size="0" /><text x="0" y="17.5" text-anchor="middle" font-size="7" font-weight="700" fill="#12263a"></text></svg><span style="position:absolute;top:-1px;left:50%;transform:translateX(-50%);font:700 9px/1 system-ui;color:#c62f3a">N</span>';
      this.wrap.appendChild(this.compass);
      this.toastEl = document.createElement('div'); this.toastEl.className = 'map-toast'; this.toastEl.hidden = true; this.toastEl.setAttribute('aria-live', 'polite');
      this.wrap.appendChild(this.toastEl);
    }

    toast(text) {
      if (!this.toastEl) return;
      this.toastEl.textContent = text || ''; this.toastEl.hidden = !text;
      clearTimeout(this._tt);
      if (text) this._tt = setTimeout(() => { this.toastEl.hidden = true; }, 4000);
    }

    get yacht() { return this._yacht; }
    set yacht(v) { this._yacht = v ? { ...v } : null; this._updateYacht(); }

    _updateYacht() {
      if (!this.yachtG) return;
      const y = this._yacht;
      this.yachtG.visible = !!y;
      this.yMark.hidden = !y; this.yLabel.hidden = !y;
      if (!y) return;
      const h = Math.max(0, surf(y.x, y.y));
      this.yachtG.position.set(X(y.x), h, Z(y.y));
      const w = this.fn ? this.fn(y.x, y.y) : null;
      const showWind = y.showWind !== false && w && w.dir != null && w.speed >= 1;
      let heading = y.heading;
      if (heading == null) heading = w && w.dir != null ? (w.dir + 50) % 360 : 0;
      this.boat.rotation.y = -heading * D2R;
      if (w && w.dir != null) {
        const rel = ((w.dir - heading + 540) % 360) - 180;
        this.sailPivot.rotation.y = (rel > 0 ? -1 : 1) * Math.min(1.3, (Math.abs(rel) / 2) * D2R);
      }
      this.windArrow.visible = !!showWind;
      this.yLabel.hidden = !(y.showWind !== false && w);
      if (w) this.yLabel.innerHTML = w.speed < 1 ? 'штиль' : `<b>${Math.round(w.speed)}</b> уз · порывы ${Math.round(w.gust)}`;
      if (showWind) {
        const key = `${Math.round(w.speed / 5)}|${this._barbColor}`;
        if (this._barbKey !== key) {
          for (const ch of [...this.windArrow.children]) { this.windArrow.remove(ch); ch.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); }
          this.windArrow.add(barbMesh(w.speed, 3.2, this._barbColor, 0.12));
          this._barbKey = key;
        }
        this.windArrow.rotation.y = -w.dir * D2R;
      }
      this._yPos = new THREE.Vector3(X(y.x), h + 0.15, Z(y.y));
      this._yLabelPos = new THREE.Vector3(X(y.x), h + 1.7, Z(y.y));
      this._sizes = null;
    }

    // ---------------------------------------------------------------- input (forwarded from the shared canvas)
    _ndc(e) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
    _pick(e) {
      const ray = this._ray || (this._ray = new THREE.Raycaster());
      ray.setFromCamera(this._ndc(e), this.camera);
      const objs = this.blocks && this.blocks.visible ? [this.blocks] : [this.terrain, this.water];
      const hit = ray.intersectObjects(objs, false)[0];
      let p;
      if (hit) p = hit.point;
      else { p = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null; }
      return [Math.min(W - 0.2, Math.max(0.2, p.x + W / 2)), Math.min(H - 0.2, Math.max(0.2, H / 2 - p.z))];
    }
    _nearYacht(e) {
      if (!this._yacht || !this._yPos || this.mode !== 'yacht') return false;
      const v = this._yPos.clone().project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
      return Math.hypot(((v.x + 1) / 2) * r.width + r.left - e.clientX, ((1 - v.y) / 2) * r.height + r.top - e.clientY) < 44;
    }
    _setYacht(p) { this._yacht = { ...(this._yacht || {}), x: p[0], y: p[1] }; this._updateYacht(); this.opts.onYacht && this.opts.onYacht(this._yacht); }
    _touch(e) {
      // One finger scrolls the page (or drags the yacht); two fingers rotate and zoom the map.
      if (e.touches.length === 1 && this._nearYacht(e.touches[0])) e.preventDefault();
      this.controls.enabled = e.touches.length >= 2 && !this._drag;
    }
    _down(e) {
      this._d = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (e.pointerType === 'mouse') this.controls.enabled = true;
      if (this._nearYacht(e)) {
        this._drag = true; this.controls.enabled = false;
        try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
      }
    }
    _move(e) { if (this._drag) { const p = this._pick(e); if (p) this._setYacht(p); } }
    _up(e) {
      if (this._drag) { this._drag = false; this._d = null; if (e.pointerType === 'mouse') this.controls.enabled = true; return; }
      const d = this._d; this._d = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 600) return;
      const p = this._pick(e); if (!p) return;
      if (this.mode === 'yacht') this._setYacht(p);
      else if (this.mode !== 'none' && this.opts.onClick) this.opts.onClick(p);
    }
    _cancel() { this._drag = false; this._d = null; }
    _key(e) {
      if (this.mode !== 'yacht' || !this._yacht) return;
      const d = { ArrowUp: [0, 0.5], ArrowDown: [0, -0.5], ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0] }[e.key];
      if (!d) return;
      e.preventDefault();
      this._setYacht([Math.min(W - 0.2, Math.max(0.2, this._yacht.x + d[0])), Math.min(H - 0.2, Math.max(0.2, this._yacht.y + d[1]))]);
    }
    _wheel(e) {
      if (!(e.ctrlKey || e.metaKey)) return; // plain wheel scrolls the page
      e.preventDefault();
      this._zoom(e.deltaY > 0 ? 1.1 : 0.9);
    }
    _zoom(f) {
      if (!this.controls) return;
      this._userMoved = true;
      const off = this.camera.position.clone().sub(this.controls.target);
      const L = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, off.length() * f));
      this.camera.position.copy(this.controls.target).add(off.setLength(L));
    }

    // ---------------------------------------------------------------- camera
    _fit(kind) {
      const asp = this.camera.aspect || 1.6, tanH = T18 * asp;
      if (kind === 'top') {
        const h = Math.max((H / 2 + 1) / T18, (W / 2 + 1) / tanH) * 1.04;
        return { p: new THREE.Vector3(0, h, 0.01), t: new THREE.Vector3(0, 0, 0) };
      }
      // Narrow (portrait-ish) screens look more from above, so the bay fills the frame.
      const steep = Math.max(0, Math.min(1, (1.5 - asp) / 0.5));
      const t = new THREE.Vector3(0, -0.5, -1 + steep * 2), dir = new THREE.Vector3(-3, 29.5 + 14 * steep, 41 - 12 * steep).normalize();
      const dist = Math.max(46, ((W / 2 + 1.5) / tanH) * (1.12 - 0.14 * steep));
      return { p: t.clone().add(dir.multiplyScalar(dist)), t };
    }
    setView(kind, animate) {
      if (!this.camera) return;
      this._view = kind;
      this._userMoved = false;
      const to = this._fit(kind);
      if (!animate || REDUCED) { this.camera.position.copy(to.p); this.controls.target.copy(to.t); this.controls.update(); return; }
      const p0 = this.camera.position.clone(), t0 = this.controls.target.clone(), start = performance.now();
      this._tween = () => {
        const k = Math.max(0, Math.min(1, (performance.now() - start) / 700)), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        this.camera.position.lerpVectors(p0, to.p, e); this.controls.target.lerpVectors(t0, to.t, e);
        if (k >= 1) this._tween = null;
      };
    }

    resize() {
      if (!this.renderer || !this.wrap.clientWidth || ACTIVE !== this) return;
      const w = Math.round(this.wrap.clientWidth);
      const narrow = w < 620;
      const h = Math.round(narrow ? Math.max(240, Math.min(w * 0.85, window.innerHeight * 0.5)) : Math.max(420, Math.min(w * 0.6, window.innerHeight * 0.74)));
      if (w === this.w && h === this.h) return;
      const first = !this.w;
      this.w = w; this.h = h;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      if (first || !this._userMoved) this.setView(this._view || '3d', false);
      this._sizes = null;
    }

    // ---------------------------------------------------------------- field
    setField(fn, cells) {
      this.fn = fn;
      this.cells = cells || null;
      for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
        const w = fn(i * GD, j * GD), k = j * GX + i;
        this.fieldU[k] = w.u; this.fieldV[k] = w.v; this.fieldS[k] = w.speed; this.fieldVar[k] = w.variable ? 1 : 0;
      }
      if (!this.renderer) return;
      this._paintWater();
      this.drawStatic();
      this._updateYacht();
    }

    // Writes u, v, speed, variable into this._s.
    _sample(x, y) {
      const s = this._s;
      if (this.cells && this.showCells) {
        const C = this.cells, c = C.list[Math.floor(y / C.res) * C.nx + Math.floor(x / C.res)];
        if (c) { s[0] = c.u; s[1] = c.v; s[2] = c.speed; } else { s[0] = s[1] = s[2] = 0; }
        s[3] = 0; return s;
      }
      const fx = Math.min(GX - 1.001, Math.max(0, x / GD)), fy = Math.min(GY - 1.001, Math.max(0, y / GD));
      const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * GX + i;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const U = this.fieldU, V = this.fieldV, S = this.fieldS;
      s[0] = U[k] * w00 + U[k + 1] * w10 + U[k + GX] * w01 + U[k + GX + 1] * w11;
      s[1] = V[k] * w00 + V[k + 1] * w10 + V[k + GX] * w01 + V[k + GX + 1] * w11;
      s[2] = S[k] * w00 + S[k + 1] * w10 + S[k + GX] * w01 + S[k + GX + 1] * w11;
      s[3] = this.fieldVar[Math.round(fy) * GX + Math.round(fx)];
      return s;
    }
    sample(x, y) { return Array.from(this._sample(x, y)); }

    _paintWater() {
      if (!this.renderer) return;
      const c = this.waterCanvas.getContext('2d'), o = this.overlays || {};
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.clearRect(0, 0, WW, WH);
      c.drawImage(this.S.waterBase, 0, 0);
      if (o.colors !== false) {
        const lc = this._lay.getContext('2d'), sc = this._small.getContext('2d'), img = sc.createImageData(GX, GY);
        for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
          const k = ((GY - 1 - j) * GX + i) * 4, col = Draw.speedRGB(this.fieldS[j * GX + i]);
          img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
        }
        sc.putImageData(img, 0, 0);
        lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, WW, WH);
        lc.imageSmoothingEnabled = true; lc.imageSmoothingQuality = 'high';
        lc.drawImage(this._small, -WW / (GX - 1) / 2, -WH / (GY - 1) / 2, WW + WW / (GX - 1), WH + WH / (GY - 1));
        lc.globalCompositeOperation = 'destination-in';
        lc.drawImage(this.S.waterMask, 0, 0);
        c.globalAlpha = 0.86; c.drawImage(this._lay, 0, 0); c.globalAlpha = 1;
      }
      c.drawImage(this.dark ? this.S.coastD : this.S.coastL, 0, 0);
      // Wind barbs on the water: the staff points to where the wind comes from.
      if (o.colors !== false && o.barbs !== false) {
        const small = this.w && this.w < 560, len = ((small ? 2.6 : 1.5) / W) * WW, ink = this.dark || o.night ? '#ffffff' : '#10243a', halo = this.dark || o.night ? 'rgba(10,20,32,0.75)' : 'rgba(255,255,255,0.85)';
        this.S.arrowPts.forEach(([x, y], idx) => {
          if (small && idx % 2) return;
          const s = this._sample(x, y), sp = s[2];
          const px = (x / W) * WW, py = ((H - y) / H) * WH, dir = sp > 0.3 ? (Math.atan2(-s[0], -s[1]) * 180) / Math.PI : null;
          Draw.drawBarb(c, px, py, dir == null ? null : (dir + 360) % 360, sp, len, halo, len / (small ? 7 : 9));
          Draw.drawBarb(c, px, py, dir == null ? null : (dir + 360) % 360, sp, len, ink, len / (small ? 16 : 22));
          c.fillStyle = ink; c.beginPath(); c.arc(px, py, len / 18, 0, Math.PI * 2); c.fill();
        });
      }
      this.waterTex.needsUpdate = true;
    }

    // ---------------------------------------------------------------- overlays
    _disposeFx() {
      if (!this.fx) return;
      for (const ch of [...this.fx.children]) {
        this.fx.remove(ch);
        ch.traverse((m) => {
          if (m.geometry && !m.isSprite) m.geometry.dispose();
          if (m.material) { if (m.material.map && m.material.map !== this.S.puff) m.material.map.dispose(); m.material.dispose(); }
        });
      }
    }

    drawStatic() {
      if (!this.renderer) return;
      const o = this.overlays || {};
      this._disposeFx();
      this.anim = [];
      for (const l of this._fxLabels || []) l.remove();
      this._fxLabels = [];
      this._staticLabels();
      const blocksOn = !!(this.cells && this.showCells);
      this.terrain.visible = this.skirt.visible = this.water.visible = !blocksOn;
      if (blocksOn) this._blocks(this.cells); else if (this.blocks) this.blocks.visible = false;
      if (this.blockArrows) this.blockArrows.visible = blocksOn;
      if (o.cap) this._cap();
      if (o.cumulus > 0.2) this._cumulus(o.cumulus);
      if (o.pool > 0) this._pool(o.pool);
      if (o.pressure) for (const p of o.pressure) this._label(p.t, p.x, p.y, surf(p.x, p.y) + (p.z ?? 3.2), `lbl-press lbl-${p.t === 'H' ? 'high' : 'low'}`, p.sub, 2);
      if (o.front) this._front(o.front);
      if (o.storm && o.storm.I > 0.02) this._storm(o.storm);
      if (o.route && o.route.length > 1) this._route(o.route);
      if (o.probe) this._probe(o.probe);
      if (o.fog && o.fog.density > 0.02) this._fog(o.fog);
      this.particles.visible = o.particles !== false && !REDUCED;
      const wasDark = this.dark;
      this._applyTheme();
      if (wasDark !== this.dark || !!o.night !== this._lastNight || o.colors === false) { this._lastNight = !!o.night; this._paintWater(); }
      this._sizes = null;
    }

    setOverlays(o) { this.overlays = o || {}; this.drawStatic(); }

    _sprite(x, y, h, scale, color, opacity, parent) {
      const m = new THREE.SpriteMaterial({ map: this.S.puff, color, transparent: true, opacity, depthWrite: false, fog: true });
      const s = new THREE.Sprite(m);
      s.position.set(X(x), h, Z(y)); s.scale.set(scale, scale * 0.7, 1);
      (parent || this.fx).add(s);
      return s;
    }

    _cap() {
      const R0 = Bay.RIDGE, r = Ens.rng(11);
      for (let t = -0.25; t < 1.0; t += 0.022) {
        const x = R0.a[0] + (R0.b[0] - R0.a[0]) * t + R0.nx * 0.5, y = R0.a[1] + (R0.b[1] - R0.a[1]) * t + R0.ny * 0.5;
        const dx = (r() - 0.5) * 0.6, dy = (r() - 0.5) * 0.6, dh = r() * 0.15, sc = 1.4 + r() * 0.8;
        if (x < 0 || y < 0 || x > W || y > H) continue;
        this._sprite(x + dx, y + dy, Math.max(0, Bay.elev(x, y)) * EX + 0.25 + dh, sc, 0xffffff, 0.85);
      }
      this._label('облачная шапка', 24.5, 26.2, 6.0, 'lbl-note', null, 3);
    }

    _fog(F) {
      const r = Ens.rng(41), n = COARSE ? 110 : 200, dens = F.density;
      for (let i = 0, tries = 0; i < n && tries < 3000; tries++) {
        const x = r() * W, y = r() * H, e = Bay.elev(x, y);
        let ok;
        if (F.type === 'adv') ok = e <= 0 || (e < 120 && r() < 0.3);
        else ok = (e <= 0 && ((y > 14.3 && x > 20 && x < 31) || Bay.sd(x, y) > -1.2)) || (e > 0 && e < 200 && r() < 0.35); // bays and valley floors
        if (!ok) continue;
        i++;
        const h = Math.max(0, e) * EX + (F.lifted ? 0.9 + r() * 0.4 : 0.12 + r() * 0.35);
        this._sprite(x, y, h, (F.type === 'adv' ? 3.4 : 3.0) + r() * 2, 0xf2f5f8, (F.lifted ? 0.45 : 0.72) * dens);
      }
    }

    _cumulus(k) {
      for (const [x, y] of this.S.cu) {
        const h = Math.max(0, Bay.elev(x, y)) * EX + 2.0;
        for (let i = 0; i < 3; i++) this._sprite(x + (i - 1) * 0.45, y, h + (i === 1 ? 0.25 : 0), (1.0 + 0.9 * k) * (i === 1 ? 1.2 : 0.9), 0xffffff, 0.92);
      }
    }

    _pool(depth) {
      const s = new THREE.Shape();
      [[11.6, 30], [40, 17], [40, 30]].forEach(([x, y], i) => (i ? s.lineTo(X(x), y - H / 2) : s.moveTo(X(x), y - H / 2)));
      const top = (900 + 650 * depth) * EX, bottom = 650 * EX;
      const g = new THREE.ExtrudeGeometry(s, { depth: top - bottom, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, bottom, 0);
      this.fx.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x78bff5, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })));
      this._label('холодный воздух −10 °C', 35, 22.5, top + 0.3, 'lbl-cold', null, 2);
    }

    _front(F) {
      const ts = [];
      for (let t = -80; t <= 80; t += 0.25) { const x = F.x + F.tx * t, y = F.y + F.ty * t; if (x >= 0 && x <= W && y >= 0 && y <= H) ts.push(t); }
      if (ts.length < 2) return;
      const t0 = ts[0], t1 = ts[ts.length - 1], len = t1 - t0, tm = (t0 + t1) / 2, r = Ens.rng(23);
      const cx = F.x + F.tx * tm, cy = F.y + F.ty * tm;
      const gc = document.createElement('canvas'); gc.width = 4; gc.height = 64;
      const g2 = gc.getContext('2d'), gr = g2.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, 'rgba(90,140,230,0)'); gr.addColorStop(1, 'rgba(90,140,230,0.55)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 4, 64);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(len, 5.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      curtain.position.set(X(cx), 2.75, Z(cy)); curtain.rotation.y = Math.atan2(F.ty, F.tx);
      this.fx.add(curtain);
      const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.25), new THREE.MeshBasicMaterial({ color: 0x3f7be0 }));
      line.position.set(X(cx), 0.06, Z(cy)); line.rotation.y = Math.atan2(F.ty, F.tx);
      this.fx.add(line);
      for (let t = t0; t <= t1; t += 1.6) {
        const x = F.x + F.tx * t - F.nx * 0.4, y = F.y + F.ty * t - F.ny * 0.4;
        this._sprite(x, y, Math.max(Math.max(0, Bay.elev(x, y)) * EX + 2.2, 3.0) + r() * 1.2, 2.4 + r(), 0x6b7380, 0.85);
      }
      const lt = t0 + len * 0.5;
      this._label('холодный фронт', F.x + F.tx * lt, F.y + F.ty * lt, 5.6, 'lbl-front', null, 2);
    }

    _storm(S) {
      const g = new THREE.Group(); this.fx.add(g);
      const R0 = 2.0 * (0.6 + 0.6 * S.I), r = Ens.rng(31);
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2, rr = r() * R0;
        const sx = S.x + Math.cos(a) * rr, sy = S.y + Math.sin(a) * rr, base = Math.max(3.2, surf(sx, sy) + 2.6);
        this._sprite(sx, sy, base + r() * 2.6, 2.6 + r() * 1.6, i < 8 ? 0x4a5160 : 0xd9dee6, 0.9 * Math.min(1, S.I * 1.5), g);
      }
      const anvil = this._sprite(S.x - 1.5, S.y - 1, Math.max(6.3, surf(S.x, S.y) + 6), 9, 0xe6e9ee, 0.75 * S.I, g); anvil.scale.set(10 * (0.5 + S.I), 2.2, 1);
      const nR = COARSE ? 140 : 260, rp = new Float32Array(nR * 6), drops = new Float32Array(nR * 3);
      for (let i = 0; i < nR; i++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 2; drops[i * 3] = X(S.x + Math.cos(a) * rr); drops[i * 3 + 1] = Z(S.y + Math.sin(a) * rr); drops[i * 3 + 2] = r() * 3.2; }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x6f86a6, transparent: true, opacity: 0.7 * S.I }));
      rain.frustumCulled = false; g.add(rain);
      // Gust front at the edge of the strong outflow core (2 km), where the squall hits.
      const ry = Math.max(0.06, surf(S.x, S.y) + 0.08);
      for (const [r0, r1, col] of [[2.0, 2.25, 0xffffff], [2.25, 2.45, 0x12263a]]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 * Math.max(0.4, S.I), side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(X(S.x), ry, Z(S.y)); ring.renderOrder = 7; g.add(ring);
      }
      this._label('фронт порывов', S.x + 2.2, S.y - 2.2, 0.6, 'lbl-danger', null, 2);
      const light = new THREE.PointLight(0xdde6ff, 0, 18); light.position.set(X(S.x), 4, Z(S.y)); g.add(light);
      this.anim.push((t, dt) => {
        for (let i = 0; i < nR; i++) {
          let z = drops[i * 3 + 2] - dt * 6; if (z < 0) z += 3.2; drops[i * 3 + 2] = z;
          const o = i * 6, x = drops[i * 3], zz = drops[i * 3 + 1];
          rp[o] = x; rp[o + 1] = z + 0.35; rp[o + 2] = zz; rp[o + 3] = x - 0.03; rp[o + 4] = z; rp[o + 5] = zz;
        }
        rg.attributes.position.needsUpdate = true;
        if (!REDUCED) light.intensity = S.I > 0.5 && Math.random() < 0.012 ? 2.5 : light.intensity * 0.85;
      });
    }

    _tube(points, radius, color, y = 0.09) {
      const path = new THREE.CurvePath();
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        path.add(new THREE.LineCurve3(new THREE.Vector3(X(a[0]), y, Z(a[1])), new THREE.Vector3(X(b[0]), y, Z(b[1]))));
      }
      return new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(8, points.length * 12), radius, 6, false), new THREE.MeshBasicMaterial({ color }));
    }

    _route(r) {
      this.fx.add(this._tube(r, 0.16, new THREE.Color(0x12263a), 0.07));
      this.fx.add(this._tube(r, 0.09, new THREE.Color(0xffffff), 0.1));
      r.forEach(([x, y], i) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(i ? 0.32 : 0.26, 14, 10), new THREE.MeshBasicMaterial({ color: i === r.length - 1 ? 0xe0621c : 0x12263a }));
        s.position.set(X(x), 0.14, Z(y)); this.fx.add(s);
      });
    }

    _probe(p) {
      const h = surf(p[0], p[1]);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), new THREE.MeshBasicMaterial({ color: 0xe0621c }));
      m.position.set(X(p[0]), h + 1.2, Z(p[1])); this.fx.add(m);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: 0xe0621c }));
      b.position.set(X(p[0]), h + 2.4, Z(p[1])); this.fx.add(b);
    }

    _blocks(C) {
      if (this._blocksFor === C) { this.blocks.visible = true; return; }
      if (this.blocks) { this.scene.remove(this.blocks, this.blockArrows); this.blocks.geometry.dispose(); this.blocks.material.dispose(); this.blockArrows.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); }
      const n = C.list.length;
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      const bl = [], big = [];
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), ec = this.S.elevCache;
      C.list.forEach((c, i) => {
        const w = Math.min(c.size, W - c.x0), h = Math.min(c.size, H - c.y0);
        if (w <= 0 || h <= 0) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); return; }
        const key = `${c.x0}|${c.y0}|${c.size}`;
        if (!ec.has(key)) ec.set(key, meanElev(c.x0, c.y0, w, h));
        const e = ec.get(key), top = c.land ? Math.max(0.03, e * EX) : 0.02, gap = Math.min(0.06, c.size * 0.04);
        m4.compose(new THREE.Vector3(X(c.x0 + w / 2), BASE, Z(c.y0 + h / 2)), q, new THREE.Vector3(w - gap, top - BASE, h - gap));
        mesh.setMatrixAt(i, m4);
        const k = c.land ? hypso(e) : Draw.speedRGB(c.speed).map((v) => v / 255);
        col.setRGB(k[0], k[1], k[2]); mesh.setColorAt(i, col);
        const skip = c.size < 1.5 && ((c.x0 / c.size) % 2 || (c.y0 / c.size) % 2); // 1 km grid: every other cell
        if (skip) return;
        if (c.size >= 3) big.push([X(c.x0 + w / 2), top + 0.08, Z(c.y0 + h / 2), c]); // coarse grid: one solid barb per cell
        else addBarbLines(bl, X(c.x0 + w / 2), top + 0.06, Z(c.y0 + h / 2), c.dir ?? 0, c.speed, Math.min(1.6, Math.max(0.9, c.size * 0.45)));
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = !COARSE;
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(bl, 3));
      const arrows = new THREE.Group(), ink = this._barbColor ?? 0x10243a;
      arrows.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: ink })));
      for (const [x, y, z, c] of big) {
        const b = barbMesh(c.speed, Math.min(3.4, c.size * 0.42), ink, 0.14);
        b.position.set(x, y, z); b.rotation.y = -(c.dir ?? 0) * D2R; arrows.add(b);
      }
      this.scene.add(mesh, arrows);
      this.blocks = mesh; this.blockArrows = arrows; this._blocksFor = C;
    }

    // ---------------------------------------------------------------- labels with priority and collision
    _label(text, x, y, h, cls, sub, prio = 3) {
      const d = document.createElement('div');
      d.className = `lbl ${cls || ''}`;
      d.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
      d._p = new THREE.Vector3(X(x), h, Z(y)); d._prio = prio;
      this.labelBox.appendChild(d);
      this._fxLabels.push(d);
      return d;
    }
    _staticLabels() {
      if (this._staticList) return;
      this._staticList = [];
      // Place names, hidden unless the «Названия» button is on.
      const save = this._fxLabels; this._fxLabels = [];
      const N = (t, x, y, dh = 0.5) => this._label(t, x, y, surf(x, y) + dh, 'lbl-name', null, 4);
      N('Внутренний залив', 26, 19.6); N('Внешний залив', 15.5, 8.8); N('Открытое море', 27, 2.6); N('пролив Узкий', 18.4, 13.2);
      N('мыс Острый', 8.1, 6.4); N('о. Камень', 12.6, 3.2, 1.4); N('Восточный перевал', 29.6, 21.75, 0.8); N('Северный перевал', 22, 25.25, 0.8);
      N('Северная долина', 22.3, 22.6, 0.6); N('Восточная долина', 33, 19.2, 0.6); N('Плато', 35, 28.5);
      this._staticList = this._fxLabels; this._fxLabels = save;
      // Start and destination markers.
      this._marks = [[Bay.MARINA, 'place-mark marina', 'Марина Тихая'], [Bay.HARBOUR, 'place-mark harbour', 'Порт Каменка']].map(([P0, cls, title]) => {
        const d = document.createElement('div'); d.className = cls; d.title = title; d.setAttribute('aria-label', title);
        d._p = new THREE.Vector3(X(P0.x), 0.05, Z(P0.y)); this.labelBox.appendChild(d); return d;
      });
    }
    _placeLabels() {
      const w = this.w, h = this.h, v = this._lv || (this._lv = new THREE.Vector3());
      const narrow = w < 560;
      if (!this._sizes) {
        this._sizes = true;
        for (const d of [...(this._staticList || []), ...(this._fxLabels || []), this.yLabel]) { d._w = d.offsetWidth; d._h = d.offsetHeight; }
      }
      const items = [];
      const add = (d, p, prio) => {
        if (d.hidden) return;
        v.copy(p).project(this.camera);
        if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05 || (narrow && d.classList.contains('lbl-minor')) || (d.classList.contains('lbl-name') && !this._showNames)) { d.style.visibility = 'hidden'; return; }
        const hw = (d._w || 60) / 2, hh = d._h || 16;
        const cx = Math.min(w - hw - 4, Math.max(hw + 4, ((v.x + 1) / 2) * w)), cy = Math.min(h - 2, Math.max(hh + 2, ((1 - v.y) / 2) * h));
        items.push({ d, prio, x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy, cx, cy });
      };
      if (this._yLabelPos && !this.yLabel.hidden) add(this.yLabel, this._yLabelPos, 0);
      for (const d of this._fxLabels || []) add(d, d._p, d._prio);
      for (const d of this._staticList || []) add(d, d._p, d._prio);
      items.sort((a, b) => a.prio - b.prio);
      const kept = [{ x0: w - 200, x1: w, y0: h - 46, y1: h }]; // view buttons
      for (const d of this._marks || []) {
        v.copy(d._p).project(this.camera);
        const mx = ((v.x + 1) / 2) * w, my = ((1 - v.y) / 2) * h;
        const under = this._yacht && Math.hypot(X(this._yacht.x) - d._p.x, Z(this._yacht.y) - d._p.z) < 0.6;
        d.style.visibility = v.z > 1 || under ? 'hidden' : '';
        d.style.transform = `translate(${Math.round(mx)}px, ${Math.round(my)}px) translate(-50%, -50%)`;
        if (!under) kept.push({ x0: mx - 12, x1: mx + 12, y0: my - 12, y1: my + 12 });
      }
      for (const it of items) {
        const hit = kept.some((k) => it.x0 < k.x1 + 2 && it.x1 > k.x0 - 2 && it.y0 < k.y1 + 1 && it.y1 > k.y0 - 1);
        if (hit && it.prio > 0) { it.d.style.visibility = 'hidden'; continue; }
        if (hit && it.prio === 0) { it.y0 -= 22; it.y1 -= 22; }
        kept.push(it);
        it.d.style.visibility = '';
        it.d.style.transform = `translate(${Math.round(it.x0)}px, ${Math.round(it.y0)}px)`;
      }
      if (this._yPos && this._yacht) {
        v.copy(this._yPos).project(this.camera);
        this.yMark.style.visibility = v.z > 1 ? 'hidden' : '';
        this.yMark.style.transform = `translate(${Math.round(((v.x + 1) / 2) * w)}px, ${Math.round(((1 - v.y) / 2) * h)}px) translate(-50%, -50%)`;
      }
    }

    // ---------------------------------------------------------------- particles
    _spawn(i, randomAge) {
      const P = this.P;
      let x = 0, y = 0;
      for (let k = 0; k < 6; k++) { x = Math.random() * W; y = Math.random() * H; if (!Bay.isLand(x, y) || Math.random() < 0.3) break; } // about 70 % over water
      P.x[i] = x; P.y[i] = y; P.age[i] = randomAge ? Math.random() * 40 : 0; P.life[i] = 35 + Math.random() * 30;
      P.land[i] = Bay.isLand(x, y);
      const h = surf(x, y) + 0.1, base = i * P.L * 3;
      for (let k = 0; k < P.L; k++) { P.hist[base + k * 3] = X(x); P.hist[base + k * 3 + 1] = h; P.hist[base + k * 3 + 2] = Z(y); }
    }
    _stepParticles(dt) {
      // A trail sample every 40 ms regardless of frame rate; a 10 kn trail is about 1 km long.
      this._pAcc = (this._pAcc || 0) + dt;
      const push = this._pAcc >= 0.04; if (push) this._pAcc = 0;
      const P = this.P, L = P.L, pos = this.pPos, col = this.pCol, hist = P.hist, night = this.dark || this.overlays.night;
      const tint = this.overlays.tint;
      for (let i = 0; i < P.N; i++) {
        const s = this._sample(P.x[i], P.y[i]);
        let u = s[0], v = s[1];
        if (push) {
          if (s[3]) { const a = (Math.random() - 0.5) * 2.4, cu = Math.cos(a), su = Math.sin(a); const uu = u * cu - v * su; v = u * su + v * cu; u = uu; }
          const sp = s[2], boost = sp > 0.1 && sp < 8 ? Math.sqrt(8 / sp) : 1, k = 0.011 * boost;
          const x1 = P.x[i] + u * k, y1 = P.y[i] + v * k;
          P.age[i] += 1;
          if (P.age[i] > P.life[i] || x1 < 0 || y1 < 0 || x1 > W || y1 > H || sp < 0.4) this._spawn(i, false);
          else {
            P.x[i] = x1; P.y[i] = y1;
            const base = i * L * 3;
            hist.copyWithin(base, base + 3, base + L * 3);
            const ld = Bay.isLand(x1, y1); P.land[i] = ld;
            hist[base + (L - 1) * 3] = X(x1); hist[base + (L - 1) * 3 + 1] = (ld ? surf(x1, y1) + 0.35 : 0) + 0.1 + (this.cells && this.showCells ? 0.05 : 0); hist[base + (L - 1) * 3 + 2] = Z(y1);
          }
        }
        // Colour against what is under the streak: navy on light water, white on dark water and at night.
        let cr = 1, cg = 1, cb = 1;
        if (tint && night) [cr, cg, cb] = tint;
        else if (!night) {
          const rgb = P.land[i] ? [190, 185, 170] : Draw.speedRGB(s[2]), lum = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) / 255;
          if (lum > 0.45) { cr = 0.06; cg = 0.13; cb = 0.24; }
        }
        const fade = Math.min(1, P.age[i] / 4) * Math.min(1, (P.life[i] - P.age[i]) / 6) * (P.land[i] ? 0.7 : 1);
        for (let s2 = 0; s2 < L - 1; s2++) {
          const o = (i * (L - 1) + s2) * 6, hb = (i * L + s2) * 3;
          pos[o] = hist[hb]; pos[o + 1] = hist[hb + 1]; pos[o + 2] = hist[hb + 2];
          pos[o + 3] = hist[hb + 3]; pos[o + 4] = hist[hb + 4]; pos[o + 5] = hist[hb + 5];
          const c = (i * (L - 1) + s2) * 8, a0 = fade * (0.3 + (0.7 * s2) / (L - 1)), a1 = fade * (0.3 + (0.7 * (s2 + 1)) / (L - 1));
          col[c] = cr; col[c + 1] = cg; col[c + 2] = cb; col[c + 3] = a0;
          col[c + 4] = cr; col[c + 5] = cg; col[c + 6] = cb; col[c + 7] = a1;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.geometry.attributes.color.needsUpdate = true;
    }

    // ---------------------------------------------------------------- loop
    _loop(now) {
      if (!this.alive) return;
      requestAnimationFrame(this._loop);
      if (ACTIVE !== this || !this.renderer) { this._last = now; return; }
      if (COARSE && now - (this._lastDraw || 0) < 30) return; // about 30 fps on phones
      const dt = Math.min(0.05, (now - (this._last || now)) / 1000); this._last = now; this._lastDraw = now;
      if (this._wPainted !== (this.w < 560)) { this._wPainted = this.w < 560; if (this.fn) this._paintWater(); }
      if (this._tween) this._tween(now);
      if (this.follow && this._yacht && !REDUCED) {
        const tx = Math.max(-W / 2 + 9, Math.min(W / 2 - 9, X(this._yacht.x))), tz = Math.max(-H / 2 + 6, Math.min(H / 2 - 6, Z(this._yacht.y)));
        const d = new THREE.Vector3(tx, this.controls.target.y, tz).sub(this.controls.target).multiplyScalar(0.04);
        this.controls.target.add(d); this.camera.position.add(d);
      }
      this.controls.update();
      if (this.compass) this.compass.style.transform = `rotate(${this.controls.getAzimuthalAngle()}rad)`;
      if (this.track !== this.overlays.track) this._updateTrack();
      if (this.fn && this.particles.visible) this._stepParticles(dt);
      for (const f of this.anim) f(now, dt);
      this._placeLabels();
      this.renderer.render(this.scene, this.camera);
    }

    _updateTrack() {
      this.track = this.overlays.track;
      if (this.trackMesh) { this.scene.remove(this.trackMesh); this.trackMesh.geometry.dispose(); this.trackMesh.material.dispose(); this.trackMesh = null; }
      if (this.track && this.track.length > 1) { this.trackMesh = this._tube(this.track, 0.12, new THREE.Color(0xe0621c), 0.12); this.scene.add(this.trackMesh); }
    }

    destroy() { this.alive = false; if (this._ro) this._ro.disconnect(); this._disposeFx(); this.wrap.remove(); }
  }

  globalThis.MapView = MapView;
  globalThis.Scene3D = { hypso, EX };
})();
