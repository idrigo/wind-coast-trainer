// Geometry of the fictional bay. Coordinates in km: x east 0..40, y north 0..30.
// Exposes globalThis.Bay. Works in the browser and in Node (for tests).
(function () {
  const W = 40, H = 30;

  // Sea outline, counter-clockwise from the south-west corner. Land is everything outside,
  // plus the island polygon.
  const SEA = [
    [0, 0], [40, 0], [40, 6], [34, 6.5], [28, 7.5], [24, 8.5], [22.5, 10.5],
    [21.2, 12.2], [22.0, 13.6], [23, 14.6], [26.5, 14.8], [29.5, 16], [30.5, 18],
    [29.5, 20], [27, 21], [24, 21.2], [21.5, 20.2], [20.5, 18.5], [21.2, 16.5],
    [21.8, 15.0], [21.0, 13.9], [20.2, 12.6], [19.5, 11], [17, 11.5], [13, 11],
    [10.5, 9.5], [9, 7.5], [8.2, 5.0], [7.4, 5.6], [6.6, 8.0], [5.5, 11], [4.5, 14],
    [3.2, 17], [2.5, 21], [2.2, 25], [2.0, 30], [0, 30],
  ];
  const ISLAND = [
    [11.3, 3.0], [11.9, 2.1], [13.0, 1.9], [13.9, 2.6], [14.0, 3.6], [13.3, 4.5],
    [12.2, 4.6], [11.4, 4.0],
  ];

  const MARINA = { x: 25.5, y: 17.5, name: 'Марина Тихая' };
  const HARBOUR = { x: 2.9, y: 16.2, name: 'Порт Каменка' };
  const CAPE = { x: 8.2, y: 5.0, name: 'мыс Острый' };
  const ISLE = { x: 12.6, y: 3.2, r: 1.2, name: 'о. Камень' };
  // Strait centre line from the outer bay end to the inner bay end.
  const STRAIT = { a: [20.7, 12.4], b: [21.5, 13.75], name: 'пролив Узкий' };
  // Main ridge: an infinite line through these points; the plateau lies on its north-east side.
  const RIDGE = { a: [16, 28], b: [40, 17] };
  const PASSES = [
    { x: 22.0, y: 25.25, name: 'пер. Северный' },
    { x: 29.6, y: 21.75, name: 'пер. Восточный' },
  ];
  // Valleys from the crest (from) to the mouth on the inner bay shore (to).
  const VALLEYS = [
    { from: [22.0, 25.0], to: [22.2, 20.65], name: 'долина Северная' },
    { from: [35.0, 19.6], to: [30.45, 18.5], name: 'долина Восточная' },
  ];
  // High west coast north of the cape.
  const WEST_RIDGE = { a: [6.8, 9.5], b: [6.0, 26.5], h: 850 };

  for (const s of [STRAIT]) {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy);
    s.len = L; s.ux = dx / L; s.uy = dy / L;
  }
  for (const v of VALLEYS) {
    const dx = v.to[0] - v.from[0], dy = v.to[1] - v.from[1], L = Math.hypot(dx, dy);
    v.len = L; v.ux = dx / L; v.uy = dy / L;
  }
  {
    const dx = RIDGE.b[0] - RIDGE.a[0], dy = RIDGE.b[1] - RIDGE.a[1], L = Math.hypot(dx, dy);
    RIDGE.ux = dx / L; RIDGE.uy = dy / L;
    // Normal pointing to the plateau (north-east side).
    RIDGE.nx = -RIDGE.uy; RIDGE.ny = RIDGE.ux;
    if (RIDGE.nx < 0) { RIDGE.nx = -RIDGE.nx; RIDGE.ny = -RIDGE.ny; }
  }

  function inPoly(x, y, P) {
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function landAnalytic(x, y) {
    if (x < 0 || y < 0) return false;
    if (x > W) return y > 6.3;
    if (y > H) return x > 2.0;
    return inPoly(x, y, ISLAND) || !inPoly(x, y, SEA);
  }

  // Signed distance from the ridge line, positive on the plateau side.
  function ridgeS(x, y) {
    return (x - RIDGE.a[0]) * RIDGE.nx + (y - RIDGE.a[1]) * RIDGE.ny;
  }

  // Projection on segment: a in [0,1] along, c perpendicular distance to the infinite line,
  // d distance to the segment.
  function segParam(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const a = ((x - ax) * dx + (y - ay) * dy) / L2;
    const px = ax + a * dx, py = ay + a * dy;
    const c = Math.hypot(x - px, y - py);
    const ac = Math.max(0, Math.min(1, a));
    const d = Math.hypot(x - (ax + ac * dx), y - (ay + ac * dy));
    return { a, c, d };
  }

  // ---------------------------------------------------------------- grids
  const DX = 0.1, NX = Math.round(W / DX) + 1, NY = Math.round(H / DX) + 1;
  const mask = new Uint8Array(NX * NY);
  const dist = new Float32Array(NX * NY); // distance to the coast, km (unsigned)
  const elevG = new Float32Array(NX * NY);

  const LDX = 0.5, LNX = Math.round(W / LDX) + 1, LNY = Math.round(H / LDX) + 1;
  const landFrac = new Float32Array(LNX * LNY);
  const gLx = new Float32Array(LNX * LNY), gLy = new Float32Array(LNX * LNY);

  const SDX = 0.25, SNX = Math.round(W / SDX) + 1, SNY = Math.round(H / SDX) + 1;
  const hsm = new Float32Array(SNX * SNY);
  const gHx = new Float32Array(SNX * SNY), gHy = new Float32Array(SNX * SNY);

  function chamfer(src, out, target) {
    // Distance (in cells) from cells where src==target to the nearest cell where src!=target.
    const INF = 1e9;
    for (let i = 0; i < src.length; i++) out[i] = src[i] === target ? INF : 0;
    const a = 1, b = Math.SQRT2;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i; let v = out[k]; if (v === 0) continue;
      if (i > 0) v = Math.min(v, out[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, out[k - NX] + a);
        if (i > 0) v = Math.min(v, out[k - NX - 1] + b);
        if (i < NX - 1) v = Math.min(v, out[k - NX + 1] + b);
      }
      out[k] = v;
    }
    for (let j = NY - 1; j >= 0; j--) for (let i = NX - 1; i >= 0; i--) {
      const k = j * NX + i; let v = out[k]; if (v === 0) continue;
      if (i < NX - 1) v = Math.min(v, out[k + 1] + a);
      if (j < NY - 1) {
        v = Math.min(v, out[k + NX] + a);
        if (i < NX - 1) v = Math.min(v, out[k + NX + 1] + b);
        if (i > 0) v = Math.min(v, out[k + NX - 1] + b);
      }
      out[k] = v;
    }
  }

  function elevAnalytic(x, y, d) {
    // d: distance to the coast on land, km.
    const cap = 1900 * (1 - Math.exp(-d / 0.7));
    const hills = 420 * (1 - Math.exp(-d / 1.3));
    const s = ridgeS(x, y);
    let ridge = s < 0 ? 1500 * Math.exp(-((s / 3) ** 2)) : 900 + 600 * Math.exp(-((s / 1.6) ** 2));
    for (const p of PASSES) ridge -= 650 * Math.exp(-((Math.hypot(x - p.x, y - p.y) / 1.8) ** 2));
    const wq = segParam(x, y, WEST_RIDGE.a[0], WEST_RIDGE.a[1], WEST_RIDGE.b[0], WEST_RIDGE.b[1]);
    const west = WEST_RIDGE.h * (0.82 + 0.12 * Math.sin(y * 0.55) + 0.06 * Math.sin(y * 1.7 + 1)) * Math.exp(-((wq.d / (1.3 + 0.4 * Math.sin(y * 0.6))) ** 2));
    let h = Math.min(cap, Math.max(hills, ridge, west));
    for (const v of VALLEYS) {
      const q = segParam(x, y, v.from[0], v.from[1], v.to[0], v.to[1]);
      if (q.a > -0.1 && q.a < 1.1) h -= 420 * Math.exp(-((q.d / 0.9) ** 2)) * (0.5 + 0.5 * Math.min(1, Math.max(0, q.a)));
    }
    return Math.max(4, h);
  }

  function blur(src, nx, ny, sigmaCells) {
    const r = Math.ceil(sigmaCells * 3), k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigmaCells * sigmaCells)); k.push(w); sum += w; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const tmp = new Float32Array(nx * ny), out = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let v = 0;
      for (let t = -r; t <= r; t++) { const ii = Math.min(nx - 1, Math.max(0, i + t)); v += src[j * nx + ii] * k[t + r]; }
      tmp[j * nx + i] = v;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let v = 0;
      for (let t = -r; t <= r; t++) { const jj = Math.min(ny - 1, Math.max(0, j + t)); v += tmp[jj * nx + i] * k[t + r]; }
      out[j * nx + i] = v;
    }
    return out;
  }

  function init() {
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      mask[j * NX + i] = landAnalytic(i * DX, j * DX) ? 1 : 0;
    }
    const dl = new Float32Array(NX * NY), ds = new Float32Array(NX * NY);
    chamfer(mask, dl, 1); // land cells: distance to sea
    chamfer(mask, ds, 0); // sea cells: distance to land
    for (let k = 0; k < mask.length; k++) dist[k] = (mask[k] ? dl[k] : ds[k]) * DX;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      elevG[k] = mask[k] ? elevAnalytic(i * DX, j * DX, dist[k]) : -Math.min(80, 8 + dist[k] * 12);
    }

    // Land fraction on an extended grid (pad 15 km), blurred with sigma 4 km, cropped.
    const PAD = 30, ex = LNX + 2 * PAD, ey = LNY + 2 * PAD, ext = new Float32Array(ex * ey);
    for (let j = 0; j < ey; j++) for (let i = 0; i < ex; i++) {
      const x = (i - PAD) * LDX, y = (j - PAD) * LDX;
      ext[j * ex + i] = x >= 0 && x <= W && y >= 0 && y <= H ? isLand(x, y) : landAnalytic(x, y) ? 1 : 0;
    }
    const bl = blur(ext, ex, ey, 6 / LDX); // sea-breeze scale: felt up to about 10 nm offshore
    for (let j = 0; j < LNY; j++) for (let i = 0; i < LNX; i++) landFrac[j * LNX + i] = bl[(j + PAD) * ex + i + PAD];
    for (let j = 0; j < LNY; j++) for (let i = 0; i < LNX; i++) {
      const k = j * LNX + i;
      const i0 = Math.max(0, i - 1), i1 = Math.min(LNX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(LNY - 1, j + 1);
      gLx[k] = (landFrac[j * LNX + i1] - landFrac[j * LNX + i0]) / ((i1 - i0) * LDX);
      gLy[k] = (landFrac[j1 * LNX + i] - landFrac[j0 * LNX + i]) / ((j1 - j0) * LDX);
    }

    // Smoothed elevation (sigma 1 km) and its gradient, m per km.
    const raw = new Float32Array(SNX * SNY);
    for (let j = 0; j < SNY; j++) for (let i = 0; i < SNX; i++) raw[j * SNX + i] = Math.max(0, elev(i * SDX, j * SDX));
    const sm = blur(raw, SNX, SNY, 1 / SDX);
    hsm.set(sm);
    for (let j = 0; j < SNY; j++) for (let i = 0; i < SNX; i++) {
      const k = j * SNX + i;
      const i0 = Math.max(0, i - 1), i1 = Math.min(SNX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(SNY - 1, j + 1);
      gHx[k] = (hsm[j * SNX + i1] - hsm[j * SNX + i0]) / ((i1 - i0) * SDX);
      gHy[k] = (hsm[j1 * SNX + i] - hsm[j0 * SNX + i]) / ((j1 - j0) * SDX);
    }
  }

  function bil(arr, nx, ny, dx, x, y) {
    const fx = Math.min(nx - 1.001, Math.max(0, x / dx)), fy = Math.min(ny - 1.001, Math.max(0, y / dx));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * nx + i;
    return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - ty) + (arr[k + nx] * (1 - tx) + arr[k + nx + 1] * tx) * ty;
  }

  function isLand(x, y) {
    if (x < 0 || y < 0 || x > W || y > H) return landAnalytic(x, y) ? 1 : 0;
    return mask[Math.round(y / DX) * NX + Math.round(x / DX)];
  }
  const elev = (x, y) => bil(elevG, NX, NY, DX, x, y);
  // Signed distance to the coast: positive on land, negative at sea, km.
  const sd = (x, y) => (isLand(x, y) ? 1 : -1) * bil(dist, NX, NY, DX, x, y);
  const landFraction = (x, y) => bil(landFrac, LNX, LNY, LDX, x, y);
  const gradL = (x, y) => [bil(gLx, LNX, LNY, LDX, x, y), bil(gLy, LNX, LNY, LDX, x, y)];
  const gradH = (x, y) => [bil(gHx, SNX, SNY, SDX, x, y), bil(gHy, SNX, SNY, SDX, x, y)];
  const elevSmooth = (x, y) => bil(hsm, SNX, SNY, SDX, x, y);

  // Mean elevation over a square cell of the given size (km), used for the resolution topic.
  function cellElev(cx, cy, size) {
    const n = Math.max(2, Math.round(size / 0.25));
    let s = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      s += Math.max(0, elev(cx - size / 2 + ((i + 0.5) * size) / n, cy - size / 2 + ((j + 0.5) * size) / n));
    }
    return s / (n * n);
  }

  // Leg crosses land? Samples every 50 m.
  function legOnLand(x0, y0, x1, y1) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L / 0.05));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (isLand(x, y)) return { x, y };
    }
    return null;
  }

  // Name of the area for log messages.
  function areaName(x, y) {
    if (Math.hypot(x - HARBOUR.x, y - HARBOUR.y) < 1.5) return 'у Порта Каменка';
    if (Math.hypot(x - MARINA.x, y - MARINA.y) < 1.5) return 'у марины';
    const sq = segParam(x, y, STRAIT.a[0], STRAIT.a[1], STRAIT.b[0], STRAIT.b[1]);
    if (sq.d < 1.2) return 'в проливе Узком';
    if (y > 14.3 && x > 20 && x < 31 && y < 21.5) return 'во Внутреннем заливе';
    if (Math.hypot(x - CAPE.x, y - CAPE.y) < 3) return 'у мыса Острый';
    if (Math.hypot(x - ISLE.x, y - ISLE.y) < 3) return 'у острова Камень';
    if (x < 7.5 && y > 6) return 'у западного берега';
    if (y > 5 && x > 9 && x < 25 && y < 12) return 'во Внешнем заливе';
    return 'в открытом море';
  }

  globalThis.Bay = {
    W, H, SEA, ISLAND, MARINA, HARBOUR, CAPE, ISLE, STRAIT, RIDGE, PASSES, VALLEYS, WEST_RIDGE,
    init, isLand, isIsland: (x, y) => inPoly(x, y, ISLAND), elev, sd, landFraction, gradL, gradH, elevSmooth, ridgeS, segParam,
    cellElev, legOnLand, areaName,
  };
  init();
})();
