// Schematics for the topics, redrawn from the lecture diagrams and driven by the same numbers as the model:
// synoptic chart (pressure, cyclone, anticyclone, fronts, wind barbs), frontal cross-sections with a station
// record, breeze cross-section with the sum of winds, katabatic and valley wind, bora, terrain effects,
// convection and thunderstorms, model resolution. Drawn on a light card in both themes.
(function () {
  const Bay = globalThis.Bay, Wind = globalThis.Wind, Draw = globalThis.Draw;
  const P = {
    ink: '#1c2a44', grey: '#5f6b7a', soft: '#8a95a5', blue: '#3466b0', orange: '#e0520a', red: '#c62f3a',
    seaTop: '#5b98c6', seaDeep: '#1f4c74', seaPlan: '#bcd7ee', landTop: '#d9c9a3', landLow: '#b39c72', rock: '#a99b86', rockDark: '#857763',
    planLand: '#e4dac2', cold: 'rgba(96,150,222,0.26)', warm: 'rgba(238,150,92,0.20)', card: '#f4f7fb',
  };
  const FONT = (s, w = 500) => `${w} ${s}px "IBM Plex Sans", system-ui, sans-serif`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const fmt = (x) => String(Math.round(x));
  const fmt1 = (x) => x.toFixed(1).replace('.', ',');

  // ------------------------------------------------------------------ text
  let CW = 600;
  function txt(c, t, x, y, o = {}) {
    let size = Math.max(12, o.size || 13);
    c.font = FONT(size, o.weight || 500);
    let tw = c.measureText(t).width;
    const max = Math.min(o.max || Infinity, CW - 8);
    while (tw > max && size > 11) { size -= 0.5; c.font = FONT(size, o.weight || 500); tw = c.measureText(t).width; }
    const align = o.align || 'left';
    let left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    left = Math.max(4, Math.min(CW - 4 - tw, left));
    c.textAlign = 'left'; c.textBaseline = o.base || 'alphabetic';
    if (o.halo) { c.lineWidth = 4; c.strokeStyle = o.halo; c.lineJoin = 'round'; c.strokeText(t, left, y); }
    c.fillStyle = o.color || P.ink; c.fillText(t, left, y);
    return tw;
  }
  const lines = (c, arr, x, y, lh, o) => arr.forEach((t, i) => txt(c, t, x, y + i * lh, o));
  function tag(c, t, x, y, color, o = {}) { // label on a rounded plate
    c.font = FONT(o.size || 12.5, 600);
    const tw = c.measureText(t).width, pw = tw + 12, ph = 20;
    let left = o.align === 'right' ? x - pw : o.align === 'left' ? x : x - pw / 2;
    left = Math.max(2, Math.min(CW - 2 - pw, left));
    c.fillStyle = color; roundRect(c, left, y - ph + 4, pw, ph, 4); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(t, left + 6, y - 2);
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ------------------------------------------------------------------ drawing kit
  function sky(c, x, y, w, h, mode) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    if (mode === 'night') { g.addColorStop(0, '#132039'); g.addColorStop(1, '#3a4d70'); }
    else if (mode === 'dusk') { g.addColorStop(0, '#5a6f95'); g.addColorStop(1, '#e8c7a8'); }
    else if (mode === 'storm') { g.addColorStop(0, '#9aa6b6'); g.addColorStop(1, '#dde3ea'); }
    else { g.addColorStop(0, '#b9d6ef'); g.addColorStop(1, '#f2f7fc'); }
    c.fillStyle = g; c.fillRect(x, y, w, h);
    if (mode === 'night') { c.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 40; i++) { const sx = x + ((i * 137) % 997) / 997 * w, sy = y + ((i * 71) % 389) / 389 * h * 0.55; c.fillRect(sx, sy, 1.4, 1.4); } }
  }
  function sea(c, x, y, w, h, t = 0, rough = 0.3) {
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, P.seaTop); g.addColorStop(1, P.seaDeep);
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1.2;
    for (let r = 0; r < 4; r++) {
      const yy = y + 5 + r * 9; c.beginPath();
      for (let xx = x; xx <= x + w; xx += 6) { const z = yy + Math.sin(xx * 0.08 + t * 2 + r) * (1 + rough * 2); xx === x ? c.moveTo(xx, z) : c.lineTo(xx, z); }
      c.stroke();
    }
    c.restore();
  }
  function ground(c, pts, bottom, top = P.landTop, low = P.landLow) {
    let minY = Infinity; for (const p of pts) minY = Math.min(minY, p[1]);
    const g = c.createLinearGradient(0, minY, 0, bottom); g.addColorStop(0, top); g.addColorStop(1, low);
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.lineTo(pts[pts.length - 1][0], bottom); c.lineTo(pts[0][0], bottom); c.closePath();
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(80,60,30,0.35)'; c.lineWidth = 1.5; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  }
  function poly(c, pts, fill) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill(); }
  function sun(c, x, y, r) {
    const g = c.createRadialGradient(x, y, r * 0.4, x, y, r * 2.4); g.addColorStop(0, 'rgba(255,214,90,0.55)'); g.addColorStop(1, 'rgba(255,214,90,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f7c437'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  function moon(c, x, y, r) { c.fillStyle = '#f3f1e6'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(0,0,0,0.08)'; c.beginPath(); c.arc(x + r * 0.3, y - r * 0.2, r * 0.25, 0, Math.PI * 2); c.fill(); }
  // Cumulus with a flat shaded base. s = size, yb = base level.
  function cumulus(c, x, yb, s, o = {}) {
    const puffs = o.puffs || [[-0.95, -0.3, 0.5], [-0.45, -0.72, 0.62], [0.15, -0.95, 0.72], [0.72, -0.62, 0.56], [1.05, -0.28, 0.42], [0.05, -0.38, 0.62], [-0.5, -0.25, 0.5], [0.6, -0.25, 0.5]];
    const tint = o.dark ? ['#a7afbb', '#6d7686'] : ['#ffffff', '#c9d0da'];
    c.save(); c.beginPath(); c.rect(x - s * 3, yb - s * 4, s * 6, s * 4 + 0.5); c.clip();
    for (const [dx, dy, r] of puffs) {
      const px = x + dx * s, py = yb + dy * s, rr = r * s;
      const g = c.createRadialGradient(px - rr * 0.35, py - rr * 0.45, rr * 0.1, px, py, rr);
      g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1]);
      c.fillStyle = g; c.beginPath(); c.arc(px, py, rr, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    c.fillStyle = o.dark ? 'rgba(60,66,78,0.5)' : 'rgba(120,130,145,0.35)'; c.fillRect(x - s * 1.25, yb - s * 0.12, s * 2.5, s * 0.12);
  }
  // Cumulonimbus: cauliflower tower from base yb to the anvil at yt, anvil spreading downwind (dir = +1 right).
  function cumulonimbus(c, x, yb, yt, s, dir = 1, o = {}) {
    const dark = o.dark ?? true, w0 = s * 3.4, towerTop = yt + s * 0.9, n = 7, hgt = yb - towerTop;
    const L = x - w0 / 2, R = x + w0 / 2;
    // Anvil first (behind the tower).
    const ag = c.createLinearGradient(0, yt - s * 0.2, 0, yt + s * 0.8); ag.addColorStop(0, '#fbfcfd'); ag.addColorStop(1, '#c3cad4');
    c.fillStyle = ag; c.beginPath();
    c.moveTo(x - dir * w0 * 0.42, towerTop + s * 0.3);
    c.bezierCurveTo(x - dir * w0 * 0.6, yt + s * 0.1, x - dir * w0 * 0.3, yt - s * 0.15, x, yt - s * 0.12);
    c.bezierCurveTo(x + dir * s * 2.2, yt - s * 0.2, x + dir * s * 4.2, yt - s * 0.05, x + dir * s * 4.8, yt + s * 0.12);
    c.bezierCurveTo(x + dir * s * 4.3, yt + s * 0.5, x + dir * s * 2.2, yt + s * 0.45, x + dir * w0 * 0.42, towerTop + s * 0.5);
    c.closePath(); c.fill();
    // Tower silhouette with bulges on both edges.
    c.beginPath(); c.moveTo(L, yb);
    for (let k = 1; k <= n; k++) { const y = yb - (hgt * k) / n, xl = L + (w0 * 0.14 * k) / n; c.quadraticCurveTo(xl - s * (0.42 + 0.1 * Math.sin(k * 2.1)), y + hgt / (2 * n), xl, y); }
    c.bezierCurveTo(L + w0 * 0.2, towerTop - s * 0.9, R - w0 * 0.2, towerTop - s * 0.9, R - w0 * 0.14, towerTop);
    for (let k = n - 1; k >= 0; k--) { const y = yb - (hgt * k) / n, xr = R - (w0 * 0.14 * k) / n; c.quadraticCurveTo(xr + s * (0.42 + 0.1 * Math.cos(k * 1.7)), y - hgt / (2 * n), xr, y); }
    c.closePath();
    const tg = c.createLinearGradient(0, towerTop - s, 0, yb);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.45, dark ? '#dde1e7' : '#eef1f4'); tg.addColorStop(0.8, dark ? '#9099a8' : '#c9d0da'); tg.addColorStop(1, dark ? '#4c5565' : '#9aa3b0');
    c.fillStyle = tg; c.fill();
    // Shade the right side and darken the base inside the silhouette.
    const sg = c.createLinearGradient(L, 0, R, 0); sg.addColorStop(0, 'rgba(255,255,255,0.18)'); sg.addColorStop(0.5, 'rgba(40,50,70,0)'); sg.addColorStop(1, 'rgba(40,50,70,0.25)');
    c.fillStyle = sg; c.fill();
    const bg = c.createLinearGradient(0, yb - s * 0.9, 0, yb); bg.addColorStop(0, 'rgba(45,50,62,0)'); bg.addColorStop(1, dark ? 'rgba(40,45,56,0.85)' : 'rgba(90,96,108,0.45)');
    c.fillStyle = bg; c.fill();
    c.strokeStyle = 'rgba(120,130,145,0.35)'; c.lineWidth = 1; c.stroke();
  }
  function stratus(c, x, y, w, h, color = '#c9cfd8') { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#eef1f5'); g.addColorStop(1, color); c.fillStyle = g; roundRect(c, x, y, w, h, h / 2); c.fill(); }
  function cirrus(c, x, y, len, alpha = 0.9) {
    c.save(); c.strokeStyle = `rgba(255,255,255,${alpha})`; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + len * 0.3, y - 6, x + len * 0.6, y - 2, x + len, y - 12); c.stroke();
    c.strokeStyle = `rgba(150,160,175,${alpha * 0.6})`; c.lineWidth = 1; c.stroke();
    c.restore();
  }
  function rain(c, x0, x1, y0, y1, t, dens = 1, color = 'rgba(70,110,170,0.55)', slant = -3) {
    c.save(); c.strokeStyle = color; c.lineWidth = 1.2;
    const n = Math.round(((x1 - x0) / 7) * dens);
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i * 7.31) % (x1 - x0)), off = ((t * 140 + i * 23) % (y1 - y0));
      c.beginPath(); c.moveTo(x, y0 + off); c.lineTo(x + slant, y0 + off + 9); c.stroke();
    }
    c.restore();
  }
  function lightning(c, x, y0, y1, t) {
    if (Math.sin(t * 7.3) < 0.75) return;
    c.save(); c.strokeStyle = '#fff6b0'; c.lineWidth = 2.5; c.shadowColor = '#fff3a0'; c.shadowBlur = 8;
    c.beginPath(); c.moveTo(x, y0); let y = y0, xx = x;
    while (y < y1) { y += 12; xx += (Math.sin(y * 1.7 + t) > 0 ? 6 : -6); c.lineTo(xx, Math.min(y, y1)); }
    c.stroke(); c.restore();
  }
  // Polyline arrow with marching dashes and a solid head.
  function flow(c, pts, color, width, t, speed, dashed = true) {
    c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
    if (dashed && speed > 0) { c.setLineDash([width * 3.2, width * 2.2]); c.lineDashOffset = -t * speed; }
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    c.setLineDash([]);
    const [x1, y1] = pts[pts.length - 1], [x0, y0] = pts[pts.length - 2], a = Math.atan2(y1 - y0, x1 - x0), hl = 6 + width * 2.2;
    c.beginPath(); c.moveTo(x1 + Math.cos(a) * 2, y1 + Math.sin(a) * 2);
    c.lineTo(x1 - hl * Math.cos(a - 0.45), y1 - hl * Math.sin(a - 0.45)); c.lineTo(x1 - hl * Math.cos(a + 0.45), y1 - hl * Math.sin(a + 0.45));
    c.closePath(); c.fill(); c.restore();
  }
  const arrow = (c, x0, y0, x1, y1, color, width) => flow(c, [[x0, y0], [x1, y1]], color, width, 0, 0, false);
  function barb(c, x, y, dir, kn, len = 26, color = P.ink) {
    Draw.drawBarb(c, x, y, dir, kn, len, 'rgba(255,255,255,0.85)', len / 7);
    Draw.drawBarb(c, x, y, dir, kn, len, color);
  }
  function boat(c, x, y, s = 1) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = P.orange; c.beginPath(); c.moveTo(-12, -2); c.lineTo(12, -2); c.lineTo(8, 5); c.lineTo(-9, 5); c.closePath(); c.fill();
    c.strokeStyle = P.ink; c.lineWidth = 1.3; c.beginPath(); c.moveTo(0, -2); c.lineTo(0, -26); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(1, -25); c.lineTo(1, -4); c.lineTo(11, -4); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  function card(c, x, y, w, h) { c.save(); c.shadowColor = 'rgba(20,30,50,0.12)'; c.shadowBlur = 8; c.shadowOffsetY = 2; c.fillStyle = '#fff'; roundRect(c, x, y, w, h, 8); c.fill(); c.restore(); }

  // ------------------------------------------------------------------ 1. synoptic chart
  // Pressure field in km on a 3000 x (3000*h/w) chart: cyclone L, anticyclone H.
  function synField(p, Hkm = 2000) {
    const Lc = { x: 1050, y: Hkm * 0.56, s: 520, d: 1013 - p.low }, Hc = { x: 2350, y: Hkm * 0.36, s: 720, d: p.high - 1013 };
    const pr = (x, y) => 1013 - Lc.d * Math.exp(-((x - Lc.x) ** 2 + (y - Lc.y) ** 2) / (2 * Lc.s ** 2)) + Hc.d * Math.exp(-((x - Hc.x) ** 2 + (y - Hc.y) ** 2) / (2 * Hc.s ** 2));
    // Wind in knots: geostrophic from the gradient (rho 1.25, f 1e-4: V = 8000 dp/dn), friction over the sea.
    const wind = (x, y, surface) => {
      const e = 5, dpx = (pr(x + e, y) - pr(x - e, y)) / (2 * e * 1000) * 100, dpy = (pr(x, y + e) - pr(x, y - e)) / (2 * e * 1000) * 100; // Pa per m
      let u = -8000 * dpy * 1.944, v = 8000 * dpx * 1.944; // y grows to the north
      if (surface) { const a = (15 * Math.PI) / 180, k = 0.75; [u, v] = [k * (u * Math.cos(a) - v * Math.sin(a)), k * (u * Math.sin(a) + v * Math.cos(a))]; }
      const sp = Math.hypot(u, v);
      return { u, v, speed: sp, dir: sp > 0.5 ? Wind.dirOf(u, v) : null };
    };
    return { pr, wind, Lc, Hc };
  }
  function marching(f, nx, ny, X, Y, level) { // segments of the contour f = level on a grid
    const seg = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const v = [f[j][i], f[j][i + 1], f[j + 1][i + 1], f[j + 1][i]], P0 = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const a = v[k], b = v[(k + 1) % 4];
        if ((a < level) !== (b < level)) { const t = (level - a) / (b - a), A = P0[k], B = P0[(k + 1) % 4]; pts.push([X(A[0] + (B[0] - A[0]) * t), Y(A[1] + (B[1] - A[1]) * t)]); }
      }
      if (pts.length >= 2) seg.push([pts[0], pts[1]]); if (pts.length === 4) seg.push([pts[2], pts[3]]);
    }
    return seg;
  }
  function drawSynoptic(c, w, h, p, t) {
    const KM = 3000 / w, H = h * KM, F = synField(p, H);
    const X = (km) => km / KM, Y = (km) => h - km / KM;
    // Chart paper: sea and a continent in the north-east.
    c.fillStyle = '#e6eff6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#efe9da';
    c.beginPath(); c.moveTo(X(900), 0); c.bezierCurveTo(X(1300), Y(H * 0.85), X(1700), Y(H * 0.95), X(2050), Y(H * 0.72));
    c.bezierCurveTo(X(2350), Y(H * 0.55), X(2700), Y(H * 0.66), w, Y(H * 0.5)); c.lineTo(w, 0); c.closePath(); c.fill();
    c.strokeStyle = '#b8ad92'; c.lineWidth = 1.2; c.stroke();
    // Warm sector.
    const L = F.Lc, wf = [[L.x, L.y], [L.x + 350, L.y - 120], [L.x + 700, L.y - 330]], cf = [[L.x, L.y], [L.x + 120, L.y - 380], [L.x + 60, L.y - 780]];
    poly(c, [...wf, [L.x + 640, L.y - 760], ...cf.slice().reverse()].map(([x, y]) => [X(x), Y(y)]), 'rgba(236,150,110,0.16)');
    // Isobars every 4 hPa.
    const nx = 76, ny = Math.round(76 * h / w) + 1, grid = [];
    for (let j = 0; j < ny; j++) { const row = []; for (let i = 0; i < nx; i++) row.push(F.pr((i / (nx - 1)) * 3000, (j / (ny - 1)) * H)); grid.push(row); }
    const gx = (i) => (i / (nx - 1)) * w, gy = (j) => h - (j / (ny - 1)) * h;
    c.lineCap = 'round';
    for (let lv = 960; lv <= 1048; lv += 4) {
      const seg = marching(grid, nx, ny, gx, gy, lv); if (!seg.length) continue;
      c.strokeStyle = lv === 1012 ? 'rgba(40,55,80,0.65)' : 'rgba(40,55,80,0.42)'; c.lineWidth = lv % 8 === 0 ? 1.6 : 1.1;
      c.beginPath(); for (const [a, b] of seg) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } c.stroke();
      const s0 = seg[Math.floor(seg.length * 0.37)][0];
      const nearC = [F.Lc, F.Hc].some((C0) => Math.hypot(s0[0] - X(C0.x), s0[1] - Y(C0.y)) < 46);
      if (!nearC && s0[0] > 20 && s0[0] < w - 40 && s0[1] > 20 && s0[1] < h - 20) txt(c, String(lv), s0[0], s0[1] + 4, { size: 12, color: P.grey, halo: '#e6eff6', align: 'center' });
    }
    // Fronts: warm (semicircles) and cold (triangles), symbols on the side the front moves to.
    const frontLine = (pts, color, kind) => {
      const pp = pts.map(([x, y]) => [X(x), Y(y)]);
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 3.2; c.beginPath(); pp.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
      for (let k = 0; k < pp.length - 1; k++) {
        const [ax, ay] = pp[k], [bx, by] = pp[k + 1], L2 = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L2, uy = (by - ay) / L2;
        const nx2 = kind === 'warm' ? uy : -uy, ny2 = kind === 'warm' ? -ux : ux;
        for (let s = 14; s < L2 - 6; s += 30) {
          const px = ax + ux * s, py = ay + uy * s;
          c.beginPath();
          if (kind === 'warm') { c.arc(px, py, 6.5, Math.atan2(ny2, nx2) - Math.PI / 2, Math.atan2(ny2, nx2) + Math.PI / 2); }
          else { c.moveTo(px - ux * 7, py - uy * 7); c.lineTo(px + nx2 * 10, py + ny2 * 10); c.lineTo(px + ux * 7, py + uy * 7); }
          c.closePath(); c.fill();
        }
      }
    };
    frontLine(wf, '#d0373d', 'warm'); frontLine(cf, '#2c62c9', 'cold');
    // Barbs.
    const step = w < 600 ? 62 : 74;
    for (let yy = step * 0.6; yy < h - 10; yy += step) for (let xx = step * 0.6; xx < w - 10; xx += step) {
      const q = F.wind(xx * KM, (h - yy) * KM, p.surface);
      c.fillStyle = P.ink; c.beginPath(); c.arc(xx, yy, 1.8, 0, Math.PI * 2); c.fill();
      if (q.speed >= 2.5) barb(c, xx, yy, q.dir, Math.min(65, q.speed), w < 600 ? 20 : 24, '#22304a');
    }
    // Centres.
    const centre = (C, letter, color, pv) => { const x = X(C.x), y = Y(C.y); txt(c, letter, x, y + 13, { size: 38, weight: 800, color, align: 'center', halo: 'rgba(255,255,255,0.8)' }); txt(c, pv, x, y + 32, { size: 12.5, weight: 700, color, align: 'center', halo: '#e6eff6' }); };
    centre(F.Lc, 'L', '#c62f3a', `${fmt(p.low)} гПа`); centre(F.Hc, 'H', '#2c5fb0', `${fmt(p.high)} гПа`);
    // Observer.
    const ox = p.point[0] * w, oy = p.point[1] * h, q = F.wind(ox * KM, (h - oy) * KM, p.surface), pr = F.pr(ox * KM, (h - oy) * KM);
    if (p.bb && q.dir != null) { // Buys-Ballot: back to the wind, low on the left and a little ahead
      c.save(); c.setLineDash([5, 5]); c.strokeStyle = 'rgba(198,47,58,0.8)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(ox, oy); c.lineTo(X(F.Lc.x), Y(F.Lc.y)); c.stroke(); c.restore();
    }
    c.fillStyle = 'rgba(224,82,10,0.18)'; c.beginPath(); c.arc(ox, oy, 26, 0, Math.PI * 2); c.fill();
    barb(c, ox, oy, q.dir, Math.min(65, q.speed), 40, P.orange);
    c.fillStyle = P.orange; c.beginPath(); c.arc(ox, oy, 4.5, 0, Math.PI * 2); c.fill();
    tag(c, `${fmt1(pr)} гПа · ${q.dir == null ? 'штиль' : `${Wind.compass(q.dir)} ${fmt(q.speed)} уз`}`, ox, oy - 30, P.ink);
    txt(c, p.surface ? (w < 600 ? 'у поверхности: 0,75 от изобарного, поворот 15° к L' : 'ветер у поверхности над морем: 0,75 от изобарного, поворот 15° к L') : 'ветер на высоте: вдоль изобар, L слева', 8, h - 10, { size: 12, color: P.grey, halo: '#e6eff6' });
    p._out = { pr, q };
  }

  // ------------------------------------------------------------------ 2. fronts
  const FRONT = {
    warm: { speed: 30, label: 'Тёплый фронт' },
    cold: { speed: 30, label: 'Холодный фронт' },
    occl: { speed: 25, label: 'Окклюзия' },
  };
  // Weather at the station tau hours from the passage (lecture table «Прохождение фронтов»).
  function frontWx(kind, tau) {
    const S = sstep;
    if (kind === 'warm') return {
      dir: tau < 0 ? 150 + 15 * S(-24, 0, tau) : 225, speed: tau < 0 ? 8 + 6 * S(-18, 0, tau) : 12, gust: 0,
      p: 1013 - 7 * S(-24, 0, tau), temp: tau < 0 ? 8 : 13, rain: tau > -10 && tau < 0 ? 0.7 * S(-10, -6, tau) : tau >= 0 && tau < 5 ? 0.15 : 0,
    };
    if (kind === 'cold') return {
      dir: 230 + 85 * S(-0.4, 0.4, tau), speed: tau < 0 ? 12 + 10 * Math.exp(tau / 5) : 13 + 15 * Math.exp(-tau / 3), gust: 16 * Math.exp(-((tau / 0.35) ** 2)),
      p: tau < 0 ? 1012 - 5 * Math.exp(tau / 6) : 1007 + 9 * (1 - Math.exp(-tau / 4)), temp: tau < 0 ? 17 : 10, rain: Math.abs(tau) < 0.7 ? 1 : tau > 0 && tau < 4 ? 0.2 : tau > -5 && tau < -0.7 ? 0.25 : 0,
    };
    return {
      dir: 160 + 120 * S(-1, 1.5, tau), speed: 9 + 5 * Math.exp(-((tau / 4) ** 2)), gust: 6 * Math.exp(-((tau / 0.6) ** 2)),
      p: tau < 0 ? 1011 - 6 * S(-20, 0, tau) : 1005 + 6 * (1 - Math.exp(-tau / 5)), temp: tau < 0 ? 9 : 8, rain: tau > -9 && tau < 2 ? 0.6 : 0,
    };
  }
  const FRONT_TEXT = {
    warm: [
      ['за 12–24 ч', 'Перистые облака сгущаются, гало вокруг солнца. Давление начинает падать.'],
      ['за 3–10 ч', 'Высокослоистые, затем слоисто-дождевые облака. Непрерывный дождь, морось. Ветер усиливается до 10–15 уз и отступает к SE.'],
      ['прохождение', 'Дождь кончается, ветер заходит вправо на SW. Давление перестаёт падать, теплеет.'],
      ['после', 'Тёплый сектор: низкая слоистая облачность, морось, плохая видимость, туман над холодной водой.'],
    ],
    cold: [
      ['за 12–24 ч', 'Юго-западный ветер, тёплый влажный воздух. Давление медленно падает.'],
      ['за 0,5–6 ч', 'Низкая рваная облачность, юго-западный ветер крепчает до 15–25 уз. Давление падает быстрее.'],
      ['прохождение', 'Стена кучево-дождевых, ливень, гроза. Порыв на 10–20 уз выше среднего, заход ветра вправо на 60–90°.'],
      ['после', 'Давление резко растёт, холоднее, видимость отличная. Порывистый северо-запад ещё 1–2 часа, затем ослабевает.'],
    ],
    occl: [
      ['за 12–24 ч', 'Как перед тёплым фронтом: перистые, затем высокослоистые облака, давление падает.'],
      ['за 0,5–9 ч', 'Обложной дождь, ветер 10–15 уз.'],
      ['прохождение', 'Дождь сменяется ливнями, ветер заходит вправо.'],
      ['после', 'Давление растёт, ливни ослабевают.'],
    ],
  };
  function frontStage(kind, tau) {
    const T = FRONT_TEXT[kind];
    if (tau >= 0.7) return T[3];
    if (tau >= -0.5) return T[2];
    return tau < (kind === 'warm' ? -10 : kind === 'occl' ? -9 : -6) ? T[0] : T[1];
  }
  // Warm or cold front in a west-east cross-section (after the Met Office diagram). The front moves east
  // and passes over the yacht, which stays in place. tau: hours from the passage at the yacht. Not to scale.
  function wrapLines(c, s, maxW, size, weight) {
    c.font = FONT(size, weight);
    const out = []; let cur = '';
    for (const wd of s.split(' ')) { const t2 = cur ? `${cur} ${wd}` : wd; if (cur && c.measureText(t2).width > maxW) { out.push(cur); cur = wd; } else cur = t2; }
    if (cur) out.push(cur);
    return out;
  }
  function frontScene(c, w, H, p, t) {
    const nb = w < 600, strip = nb ? 74 : 64, yb = H - 26, yT = strip + 6, Hs = yb - yT, Z = (f) => yb - f * Hs;
    const warm = p.kind === 'warm', occl = p.kind === 'occl', tau = p.tau, pph = w * 0.022;
    const xy = w * (warm ? 0.72 : occl ? 0.55 : 0.5), xf = xy + tau * pph, HX = (hh) => xf + hh * pph;
    const orange = '#d0553a', blue = '#2a6fb0', red = '#d0373d';
    const vis = (x) => x > 24 && x < w - 24;
    sky(c, 0, 0, w, yb, !warm && Math.abs(tau) < 1 ? 'storm' : 'day');
    sea(c, 0, yb, w, H - yb, t, 0.4);
    c.save(); c.beginPath(); c.rect(0, 0, w, yb); c.clip();
    const lab = (s, x, y, o = {}) => { if (vis(x)) txt(c, s, x, y, { size: nb ? 11.5 : 13, weight: 600, color: P.ink, halo: 'rgba(255,255,255,0.75)', ...o }); };
    const N = 40, line = [];
    let wx = [];
    // Front symbols on the side the front moves to: triangles for cold, semicircles for warm.
    const symbols = (ln, round, color) => {
      c.fillStyle = color;
      const s = nb ? 6 : 9;
      for (let i = 4; i < N - 1; i += nb ? 6 : 4) {
        const [x0, y0] = ln[i - 1], [x1, y1] = ln[i + 1], [px, py] = ln[i];
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        c.beginPath();
        if (!round) { c.moveTo(px - ux * s, py - uy * s); c.lineTo(px + nx * s * 1.5, py + ny * s * 1.5); c.lineTo(px + ux * s, py + uy * s); }
        else c.arc(px, py, s, Math.atan2(uy, ux), Math.atan2(uy, ux) + Math.PI);
        c.closePath(); c.fill();
      }
    };
    const stroke = (ln, color) => { c.strokeStyle = color; c.lineWidth = 3.5; c.lineJoin = 'round'; c.beginPath(); ln.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
    if (occl) {
      // The cold front has caught up with the warm front: cold air behind, cool air ahead, warm air lifted off the sea.
      const R = w * 0.24, cfPt = (q) => [xf - R * q * q, yb - 0.8 * Hs * q];
      const L = w * 0.62, yWF = (x) => Math.max(yT, yb - 0.78 * Hs * Math.pow(Math.max(0, (x - xf) / L), 1.5));
      const cl = [], wl = [];
      for (let i = 0; i <= N; i++) { cl.push(cfPt(i / N)); const x = xf + (L * 1.3 * i) / N; wl.push([x, yWF(x)]); }
      poly(c, [[-w, yb], ...cl, [-w, cl[N][1]]], P.cold);
      poly(c, [...wl, [2 * w, wl[N][1]], [2 * w, yb]], P.cold);
      poly(c, [...wl, [2 * w, wl[N][1]], [2 * w, yb]], 'rgba(255,255,255,0.3)');
      poly(c, [[-w, yT - 6], [2 * w, yT - 6], [2 * w, wl[N][1]], ...wl.slice().reverse(), ...cl, [-w, cl[N][1]]], P.warm);
      // Ahead: cirrus, altostratus, then nimbostratus with steady rain; at and behind the front: showers.
      const n0 = HX(-0.5), n1 = HX(8);
      stratus(c, n0, Z(nb ? 0.27 : 0.34), n1 - n0, Hs * (nb ? 0.12 : 0.2), '#7f8898');
      rain(c, n0 + 4, n1 - 6, Z(0.15), yb, t, 1.4);
      const xs = HX(-3.5);
      cumulus(c, xs, Z(0.24), nb ? 13 : 20, { dark: true });
      rain(c, xs - (nb ? 12 : 22), xs + (nb ? 12 : 22), Z(0.22), yb, t, 1.2);
      cumulus(c, HX(-10), Z(0.24), nb ? 10 : 15);
      stratus(c, HX(8.5), Z(0.56), HX(16.5) - HX(8.5), Hs * 0.08, '#b9c1cc');
      for (let k = 0; k < (nb ? 2 : 4); k++) cirrus(c, HX(18.5 + k * 1.2) - 12, Z(0.9 - (k % 2) * 0.05), nb ? 22 : 34);
      flow(c, [[HX(-2), Z(0.42)], [HX(5), yWF(HX(5)) - Hs * 0.1], [HX(12), yWF(HX(12)) - Hs * 0.08], [HX(18), yWF(HX(18)) - Hs * 0.08]], orange, 2.5, t, 30);
      flow(c, [[HX(-11), Z(0.07)], [xf - w * 0.03, Z(0.07)]], blue, 3, t, 40);
      lab('тёплый воздух вытеснен вверх', HX(nb ? 6 : -4), Z(nb ? 0.6 : 0.7), { color: '#b0482a', weight: 700, align: 'center' });
      lab('холодный воздух', HX(nb ? -12 : -9), Z(0.03) - 4, { color: blue, weight: 700, align: 'center' });
      lab('прохладный воздух', HX(14), Z(0.06), { color: blue, weight: 700, align: 'center' });
      if (!nb) {
        lab('слоисто-дождевые', (n0 + n1) / 2, Z(0.38), { align: 'center', weight: 500 });
        lab('высокослоистые', HX(12.5), Z(0.6), { align: 'center', weight: 500 });
        lab('перистые', HX(20), Z(0.8), { align: 'center', weight: 500 });
      }
      const purple = '#8e3fa8';
      stroke(cl, purple); stroke(wl, purple); symbols(cl, false, purple); symbols(wl, true, purple);
      wx = nb ? [[-9, 'Ливни слабее'], [-2.5, 'Ливни'], [4, 'Дождь'], [14, 'Облака гуще']]
        : [[-9, 'Ливни ослабевают'], [-2.5, 'Дождь сменяется ливнями'], [4, 'Обложной дождь'], [14, 'Перистые, затем высокослоистые']];
    } else if (warm) {
      const L = w * 0.62, yWF = (x) => Math.max(yT, yb - 0.78 * Hs * Math.pow(Math.max(0, (x - xf) / L), 1.5));
      for (let i = 0; i <= N; i++) { const x = xf + (L * 1.3 * i) / N; line.push([x, yWF(x)]); }
      const end = line[N];
      poly(c, [...line, [2 * w, end[1]], [2 * w, yb]], P.cold);
      poly(c, [[-w, yb], ...line, [2 * w, end[1]], [2 * w, yT - 6], [-w, yT - 6]], P.warm);
      // Warm sector behind the front: low cloud and drizzle.
      stratus(c, HX(-12), Z(0.2), HX(-0.3) - HX(-12), Hs * 0.05, '#aeb6c2');
      rain(c, HX(-5), xf - 2, Z(0.17), yb, t, 0.5, 'rgba(70,110,170,0.45)', -1);
      // Ahead of it: nimbostratus with steady rain, altostratus, cirrus.
      const n0 = HX(0.4), n1 = HX(9.5);
      stratus(c, n0, Z(nb ? 0.27 : 0.36), n1 - n0, Hs * (nb ? 0.12 : 0.22), '#7f8898');
      rain(c, n0 + 4, n1 - 6, Z(0.15), yb, t, 1.5);
      stratus(c, HX(9), Z(0.56), HX(17.5) - HX(9), Hs * 0.08, '#b9c1cc');
      for (let k = 0; k < (nb ? 2 : 4); k++) cirrus(c, HX(19.5 + k * 1.2) - 12, Z(0.9 - (k % 2) * 0.05), nb ? 22 : 34);
      flow(c, [[HX(-2.5), Z(0.05)], [HX(5), yWF(HX(5)) - Hs * 0.07], [HX(12), yWF(HX(12)) - Hs * 0.07], [HX(18), yWF(HX(18)) - Hs * 0.08]], orange, 2.5, t, 30);
      flow(c, [[HX(21), yWF(HX(21)) + Hs * 0.16], [HX(12), Z(0.08)]], blue, 2.5, t, 25);
      lab('тёплый воздух', HX(-6), Z(nb ? 0.55 : 0.68), { color: '#b0482a', weight: 700, align: 'center' });
      lab('холодный воздух', HX(15), Z(0.06), { color: blue, weight: 700, align: 'center' });
      if (!nb) {
        lab('слоисто-дождевые', (n0 + n1) / 2, Z(0.4), { align: 'center', weight: 500 });
        lab('высокослоистые', HX(13.2), Z(0.6), { align: 'center', weight: 500 });
        lab('перистые', HX(21), Z(0.8), { align: 'center', weight: 500 });
      }
      wx = nb ? [[-4, 'Морось'], [4.5, 'Дождь'], [13, 'Облака гуще'], [21, 'Перистые']]
        : [[-4, 'Низкие облака, морось'], [4.5, 'Обложной дождь'], [13, 'Облака сгущаются'], [21, 'Перистые, гало']];
    } else {
      const R = w * 0.4, cfPt = (q) => [xf - R * q * q, yb - 0.8 * Hs * q];
      for (let i = 0; i <= N; i++) line.push(cfPt(i / N));
      const end = line[N];
      poly(c, [[-w, yb], ...line, [-w, end[1]]], P.cold);
      poly(c, [[xf, yb], [2 * w, yb], [2 * w, yT - 6], [-w, yT - 6], [-w, end[1]], ...line.slice().reverse()], P.warm);
      // Behind the front: showers, then clearing. Ahead: low ragged cloud of the warm sector.
      cumulus(c, HX(-10.5), Z(0.24), nb ? 11 : 17);
      const xs = HX(-5.5);
      cumulus(c, xs, Z(0.26), nb ? 14 : 22, { dark: true });
      rain(c, xs - (nb ? 14 : 26), xs + (nb ? 14 : 26), Z(0.24), yb, t, 1.2);
      stratus(c, xf + w * 0.035, Z(0.2), HX(10) - xf - w * 0.035, Hs * 0.05, '#aeb6c2');
      rain(c, HX(1.5), HX(5), Z(0.17), yb, t, 0.4, 'rgba(70,110,170,0.4)', -1);
      cumulonimbus(c, xf - w * 0.012, Z(0.18), Z(0.88), nb ? 15 : 26, 1);
      rain(c, xf - w * 0.045, xf + w * 0.02, Z(0.17), yb, t, 2.2, 'rgba(60,95,160,0.65)');
      lightning(c, xf - w * 0.01, Z(0.2), yb, t);
      const c1 = cfPt(0.35), c2 = cfPt(0.62), b1 = cfPt(0.62), b2 = cfPt(0.3);
      flow(c, [[HX(4), Z(0.05)], [c1[0] + w * 0.035, c1[1]], [c2[0] + w * 0.04, c2[1] - Hs * 0.04]], orange, 2.5, t, 30);
      flow(c, [[b1[0] - w * 0.08, b1[1] + Hs * 0.04], [b2[0] - w * 0.05, b2[1] + Hs * 0.06], [xf - w * 0.04, Z(0.06)]], blue, 3, t, 40);
      lab('холодный воздух', HX(nb ? -12 : -9), Z(0.06), { color: blue, weight: 700, align: 'center' });
      lab('тёплый воздух', HX(7), Z(nb ? 0.55 : 0.68), { color: '#b0482a', weight: 700, align: 'center' });
      if (!nb) { lab('кучево-дождевые', xf - w * 0.012, Z(0.93), { align: 'center', weight: 500 }); lab('кучевые', HX(-10.5), Z(0.3), { align: 'center', weight: 500 }); }
      wx = nb ? [[-10.5, 'Ясно'], [-5.5, 'Ливни'], [0, 'Гроза, шквал'], [6, 'Морось']]
        : [[-10.5, 'Прояснение'], [-5.5, 'Ливни'], [0, 'Ливень, гроза, шквал'], [6, 'Низкие облака, морось']];
    }
    // Front line with its chart symbols on the side it moves to.
    if (line.length) { stroke(line, warm ? red : blue); symbols(line, warm, warm ? red : blue); }
    c.restore();
    // Weather strip on top, moving with the front.
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(0, 0, w, strip);
    wx.forEach(([hh, str], i) => {
      const x = HX(hh), size = nb ? 11.5 : 13.5;
      if (x < -40 || x > w + 40) return;
      const ls = wrapLines(c, str, nb ? 78 : Math.min(170, w * 0.17), size, 600), y0 = (i % 2 ? (nb ? 44 : 40) : 16) + (ls.length === 1 ? 6 : 0);
      ls.forEach((ln, k) => txt(c, ln, x, y0 + k * (size + 2), { size, weight: 600, color: P.ink, align: 'center' }));
    });
    // Ground line: the front and its motion, the yacht in place.
    if (xf > -20 && xf < w + 20) {
      txt(c, warm ? 'тёплый фронт' : occl ? 'окклюзия' : 'холодный фронт', xf - 6, H - 8, { size: nb ? 11 : 12.5, weight: 700, color: '#fff', align: 'right' });
      arrow(c, xf + 4, H - 12, xf + (nb ? 30 : 44), H - 12, '#fff', 2.5);
    }
    if (!nb) { txt(c, 'запад', 8, H - 8, { size: 12, color: '#e8f0f8' }); txt(c, 'восток', w - 8, H - 8, { size: 12, color: '#e8f0f8', align: 'right' }); }
    boat(c, xy, yb + 1, nb ? 0.85 : 1);
    const st = Math.abs(tau) < 0.13 ? 'фронт над яхтой' : tau < 0 ? `до фронта ${fmt1(-tau)} ч` : `фронт прошёл ${fmt1(tau)} ч назад`;
    tag(c, `яхта: ${st}`, xy, yb - (nb ? 30 : 34), P.ink, { align: xy > w - 140 ? 'right' : 'center' });
  }
  function drawFronts(c, w, h, p, t) {
    const nb = w < 600, secH = Math.round(h * (nb ? 0.6 : 0.64));
    frontScene(c, w, secH, p, t);
    record(c, w, h, p, secH, nb);
  }
  // Station record under the section: pressure, wind barbs and precipitation against time.
  function record(c, w, h, p, secH, nb) {
    const kind = p.kind, tau = p.tau, sys = false, t0 = -24, t1 = 12;
    const R = { x: 46, y: secH + 22, w: w - 60, h: h - secH - 40 };
    txt(c, 'Запись на яхте: давление, ветер, осадки', 8, secH + 14, { size: 12.5, weight: 700, color: P.ink });
    const TX = (tt) => R.x + ((tt - t0) / (t1 - t0)) * R.w;
    c.fillStyle = '#fff'; c.fillRect(R.x, R.y, R.w, R.h);
    c.strokeStyle = 'rgba(28,42,68,0.12)'; c.lineWidth = 1;
    for (let tt = t0; tt <= t1; tt += 6) { c.beginPath(); c.moveTo(TX(tt), R.y); c.lineTo(TX(tt), R.y + R.h); c.stroke(); if (sys && nb && tt % 12) continue; const lb = sys ? (tt === 0 ? 'тёплый' : tt === 12 ? 'холодный' : `${tt > 0 ? '+' : ''}${tt} ч`) : tt === 0 ? 'фронт' : `${tt > 0 ? '+' : ''}${tt} ч`; txt(c, lb, TX(tt), R.y + R.h + 14, { size: 11.5, color: P.grey, align: 'center' }); }
    const pr = [], rn = [];
    for (let tt = t0; tt <= t1; tt += 0.25) { const q = frontWx(kind, tt); pr.push([TX(tt), q.p]); rn.push([TX(tt), q.rain]); }
    const pmin = 1002, pmax = 1016, PY = (v) => R.y + R.h - 8 - ((v - pmin) / (pmax - pmin)) * (R.h * 0.5);
    for (const [x, r] of rn) if (r > 0.05) { c.fillStyle = `rgba(52,102,176,${0.15 + 0.45 * r})`; c.fillRect(x - 2, R.y + R.h - 6 - r * 18, 4, r * 18); }
    c.strokeStyle = P.orange; c.lineWidth = 2.2; c.beginPath(); pr.forEach(([x, v], i) => (i ? c.lineTo(x, PY(v)) : c.moveTo(x, PY(v)))); c.stroke();
    for (const pv of [1004, 1008, 1012, 1016]) { const yy = PY(pv); if (yy < R.y + 6 || yy > R.y + R.h) continue; c.strokeStyle = 'rgba(224,82,10,0.18)'; c.beginPath(); c.moveTo(R.x, yy); c.lineTo(R.x + R.w, yy); c.stroke(); txt(c, String(pv), R.x - 4, yy + 4, { size: 11.5, color: P.orange, align: 'right' }); }
    txt(c, 'гПа', 4, R.y + 12, { size: 11.5, color: P.orange });
    const bstep = nb ? 6 : 3;
    for (let tt = t0; tt <= t1; tt += sys ? bstep * 1.5 : bstep) { const q = frontWx(kind, tt); barb(c, TX(tt), R.y + 26, q.dir, q.speed, nb ? 18 : 22, P.ink); }
    c.strokeStyle = P.orange; c.lineWidth = 2; c.beginPath(); c.moveTo(TX(clamp(tau, t0, t1)), R.y); c.lineTo(TX(clamp(tau, t0, t1)), R.y + R.h); c.stroke();
    p._out = frontWx(kind, tau);
  }

  // ------------------------------------------------------------------ 3. breeze and the sum of winds
  function drawBreeze(c, w, h, p, t) {
    const nb = w < 600, A = { w, h: nb ? 250 : 270 };
    const hour = Wind.h24(p.hour), sunf = p.sun, sup = clamp(1 - p.G / 25, 0, 1);
    const day = Wind.breezeDay(hour) * sunf * sup, night = (hour >= 20 ? sstep(20, 23, hour) : hour < 9 ? 1 - sstep(6, 9, hour) : 0) * sunf * sup;
    const isDay = hour >= 6.5 && hour <= 19.5;
    sky(c, 0, 0, w, A.h, isDay ? 'day' : 'night');
    const yb = A.h * 0.7, xc = w * 0.5;
    sea(c, 0, yb, xc, A.h - yb, t);
    ground(c, [[xc, yb], [w * 0.62, yb - 6], [w * 0.78, yb - A.h * 0.08], [w, yb - A.h * 0.18]], A.h);
    const fr = clamp((hour - 6) / 13, 0, 1);
    if (isDay) sun(c, w * (0.08 + 0.84 * fr), 36 + 26 * Math.cos(fr * Math.PI) ** 2, 15); else moon(c, w - 46, 40, 14);
    if (sunf < 0.5) { cumulus(c, w * 0.3, 70, 22, { dark: true }); cumulus(c, w * 0.62, 64, 26, { dark: true }); cumulus(c, w * 0.85, 76, 20, { dark: true }); }
    const k = day > 0.2 ? day : night > 0.2 ? -night * 0.6 : 0;
    const title = k > 0 ? 'Дневной (морской) бриз' : k < 0 ? 'Ночной (береговой) бриз' : sunf < 0.5 ? 'Облачно: бриза нет' : 'Бриза нет';
    txt(c, title, 14, 26, { size: 17, weight: 700, color: isDay ? P.ink : '#fff' });
    const seaT = k > 0 ? 'море прохладное · высокое P' : k < 0 ? 'море тёплое · низкое P' : 'море';
    const landT = k > 0 ? 'суша тёплая · низкое P' : k < 0 ? 'суша холодная · высокое P' : 'суша';
    txt(c, seaT, xc / 2, yb + 30, { size: 13, color: '#fff', align: 'center', weight: 600, max: xc - 12 });
    txt(c, landT, w * 0.76, yb + 30, { size: 13, color: P.ink, align: 'center', weight: 600, max: w * 0.46 });
    const inkB = isDay ? 'rgba(70,80,95,0.8)' : 'rgba(210,220,235,0.85)';
    if (k !== 0) {
      const s = Math.abs(k), width = 2.5 + 5 * s, sp = 20 + 60 * s;
      const L0 = w * 0.12, R0 = w * 0.8, top = A.h * 0.26, low = yb - 22;
      const loop = k > 0
        ? { surf: [[L0, low], [R0 - 40, low]], up: [[R0, low - 10], [R0, top + 10]], aloft: [[R0 - 10, top], [L0 + 10, top]], down: [[L0, top + 10], [L0, low - 10]] }
        : { surf: [[R0, low - 10], [L0 + 40, low]], up: [[L0, low - 10], [L0, top + 10]], aloft: [[L0 + 10, top], [R0 - 10, top]], down: [[R0, top + 10], [R0, low - 10]] };
      flow(c, loop.up, inkB, 2, t, sp * 0.6); flow(c, loop.aloft, inkB, 2, t, sp * 0.6); flow(c, loop.down, inkB, 2, t, sp * 0.6);
      flow(c, loop.surf, P.orange, width, t, sp);
      tag(c, k > 0 ? `ветер с моря ${fmt(13 * day)} уз` : `ветер с суши ${fmt(5 * night)} уз`, (L0 + R0) / 2, low - 16, P.orange);
      if (k > 0.35) cumulus(c, w * 0.8, top - 6, 12 + 10 * k);
    }
    // ---- sum of winds, plan view, the lecture's three cases
    const B = { x: 0, y: A.h + 10, w, h: h - A.h - 10 };
    c.fillStyle = '#fff'; c.fillRect(B.x, B.y, B.w, B.h);
    txt(c, 'У берега днём: синоптический ветер + бриз', 12, B.y + 22, { size: 14, weight: 700 });
    const n = p.n, tx = -n[1], ty = n[0];
    const toF = (v) => [v[0] * n[0] + v[1] * n[1], v[0] * tx + v[1] * ty];
    const syn = toF(p.syn), br = toF(p.br), sum = [syn[0] + br[0], syn[1] + br[1]];
    const pw = nb ? w - 24 : Math.min(420, w * 0.55), ph = B.h - 44, px0 = 12, py0 = B.y + 32;
    // Sea and shore, shore on the right.
    const g = c.createLinearGradient(px0, 0, px0 + pw, 0); g.addColorStop(0, '#9fc5e6'); g.addColorStop(0.62, '#cfe3f3'); g.addColorStop(0.621, P.planLand); g.addColorStop(1, '#d8cba9');
    c.fillStyle = g; roundRect(c, px0, py0, pw, ph, 8); c.fill();
    c.strokeStyle = 'rgba(80,60,30,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(px0 + pw * 0.62, py0); c.lineTo(px0 + pw * 0.62, py0 + ph); c.stroke();
    txt(c, 'море', px0 + 10, py0 + 18, { size: 12, color: '#3f6f98', weight: 600 }); txt(c, 'берег', px0 + pw - 10, py0 + 18, { size: 12, color: '#7a6a45', weight: 600, align: 'right' });
    const ox = px0 + pw * 0.4, oy = py0 + ph * 0.58;
    const maxV = Math.max(14, Math.hypot(...sum), Math.hypot(...syn), Math.hypot(...br)), sc = (Math.min(pw * 0.36, ph * 0.42)) / maxV;
    const end = (v) => [ox + v[0] * sc, oy - v[1] * sc];
    // Vector addition: dashed parallelogram.
    c.save(); c.setLineDash([4, 4]); c.strokeStyle = 'rgba(60,70,90,0.45)'; c.lineWidth = 1.2;
    const eS = end(syn), eB = end(br), eT = end(sum);
    c.beginPath(); c.moveTo(eS[0], eS[1]); c.lineTo(eT[0], eT[1]); c.lineTo(eB[0], eB[1]); c.stroke(); c.restore();
    const vec = (v, col, wd, label) => {
      if (Math.hypot(...v) < 0.7) return;
      const e = end(v);
      c.save(); c.globalAlpha = 0.9; flow(c, [[ox, oy], e], '#fff', wd + 3, 0, 0, false); c.restore();
      flow(c, [[ox, oy], e], col, wd, 0, 0, false);
      tag(c, label, e[0] + (v[0] >= 0 ? 8 : -8), e[1] + (v[1] >= 0 ? -6 : 22), col, { align: v[0] >= 0 ? 'left' : 'right' });
    };
    vec(syn, '#1f3b66', 4, `синоптический ${fmt(Math.hypot(...syn))}`);
    vec(br, P.orange, 4, `бриз ${fmt(Math.hypot(...br))}`);
    vec(sum, '#111', 6, `у берега ${fmt(Math.hypot(...sum))} уз`);
    c.fillStyle = '#111'; c.beginPath(); c.arc(ox, oy, 4, 0, Math.PI * 2); c.fill();
    // Which case is it.
    const cross = syn[0], along = syn[1], sS = Math.hypot(...syn);
    const cs = sS < 2 ? 'none' : Math.abs(along) > Math.abs(cross) * 1.2 ? 'along' : cross > 0 ? 'onshore' : 'offshore';
    const cases = [['onshore', 'с моря', '10 + бриз 10 = 20 уз днём'], ['offshore', 'с берега', 'у берега штиль, бриз слабый'], ['along', 'вдоль берега', 'поворот к берегу и усиление']];
    const cx0 = nb ? 12 : px0 + pw + 22, cy0 = nb ? py0 + ph + 16 : py0;
    cases.forEach(([key, name, note], i) => {
      const yy = cy0 + i * (nb ? 40 : 46), on = key === cs;
      c.fillStyle = on ? 'rgba(224,82,10,0.12)' : 'rgba(28,42,68,0.05)'; roundRect(c, cx0, yy, (nb ? w - 24 : w - cx0 - 12), nb ? 34 : 40, 6); c.fill();
      if (on) { c.strokeStyle = P.orange; c.lineWidth = 2; c.stroke(); }
      txt(c, `Синоптический ${name}`, cx0 + 10, yy + (nb ? 15 : 17), { size: 13, weight: 700, color: on ? P.orange : P.ink });
      txt(c, note, cx0 + 10, yy + (nb ? 30 : 34), { size: 12.5, color: P.grey });
    });
    if (cs === 'none') txt(c, 'Слабый фон: у берега дует только бриз.', cx0 + 10, cy0 + (nb ? 136 : 160), { size: 12.5, color: P.grey });
  }

  // ------------------------------------------------------------------ 4. katabatic and valley wind
  function drawKatabatic(c, w, h, p, t) {
    const hour = Wind.h24(p.hour), kn = Wind.katNight(hour) * p.sun * clamp(1 - p.G / 15, 0, 1), dv = Wind.breezeDay(hour) * p.sun;
    const night = hour < 6 || hour > 20, nb = w < 600, H0 = h, hh = h - 46;
    sky(c, 0, 0, w, hh, night ? 'night' : 'day');
    const yb = hh - 34;
    sea(c, 0, yb, w * 0.2, hh - yb, t);
    const S = [[w * 0.16, yb], [w * 0.3, yb - hh * 0.12], [w * 0.54, yb - hh * 0.4], [w * 0.74, yb - hh * 0.62], [w, yb - hh * 0.7]];
    ground(c, S, hh, '#b9a98c', '#8f7f64');
    if (night) moon(c, w - 46, 46, 16); else sun(c, w - 46, 46, 16);
    const along = (f, off) => {
      const seg = f * (S.length - 1), i = Math.min(S.length - 2, Math.floor(seg)), u = seg - i;
      const x = S[i][0] + (S[i + 1][0] - S[i][0]) * u, y = S[i][1] + (S[i + 1][1] - S[i][1]) * u;
      const dx = S[i + 1][0] - S[i][0], dy = S[i + 1][1] - S[i][1], L = Math.hypot(dx, dy);
      return [x + (dy / L) * off, y - (dx / L) * off];
    };
    const tc = night ? '#fff' : P.ink;
    if (kn > 0.05) {
      c.save(); const g = c.createLinearGradient(0, yb - hh * 0.7, 0, yb); g.addColorStop(0, 'rgba(120,170,235,0.25)'); g.addColorStop(1, 'rgba(120,170,235,0.5)'); c.fillStyle = g; c.beginPath();
      for (let f = 0; f <= 1; f += 0.02) { const [x, y] = along(f, 12 + 12 * f); f ? c.lineTo(x, y) : c.moveTo(x, y); }
      for (let f = 1; f >= 0; f -= 0.02) { const [x, y] = along(f, 0); c.lineTo(x, y); }
      c.closePath(); c.fill(); c.restore();
      const width = 2.5 + 4 * kn, sp = 25 + 70 * kn;
      for (const [f0, f1] of [[0.95, 0.72], [0.66, 0.42], [0.36, 0.12]]) flow(c, [along(f0, 16), along(f1, 16)], '#7fb2ff', width, t, sp);
      flow(c, [[w * 0.17, yb - 14], [w * 0.03, yb - 14]], '#7fb2ff', width + 1, t, sp);
      for (const f of [0.55, 0.8]) for (let q = -1; q <= 1; q++) { const [x, y] = along(f, 30); arrow(c, x + q * 9, y, x + q * 9, y - 24, 'rgba(255,255,255,0.7)', 1.3); }
      txt(c, nb ? 'ясная ночь: склон остывает, воздух тяжелеет' : 'ясная ночь: склон остывает излучением, воздух на нём тяжелеет', 12, 22, { size: 13.5, color: tc });
      txt(c, 'холодный воздух стекает по склону', nb ? 12 : 100, nb ? 48 : hh * 0.32, { size: nb ? 14 : 17, weight: 700, color: '#9cc4ff' });
      lines(c, ['в бухте ветер с берега 3–10 уз, максимум перед рассветом', `сейчас у устья Северной долины ${fmt(p.mouth)} уз`], 2, H0 - 26, 17, { size: 13, color: P.ink });
    } else if (dv > 0.1) {
      const width = 2.5 + 4 * dv, sp = 25 + 60 * dv;
      for (const [f0, f1] of [[0.08, 0.3], [0.38, 0.62], [0.7, 0.92]]) flow(c, [along(f0, 16), along(f1, 16)], P.orange, width, t, sp);
      if (dv > 0.5) cumulus(c, w * 0.8, yb - hh * 0.78, 18);
      txt(c, nb ? 'склоны греются, воздух поднимается' : 'склоны греются, воздух поднимается вдоль них', nb ? 12 : 100, 46, { size: nb ? 14 : 15, color: P.orange, weight: 700 });
      lines(c, ['днём ветер дует вверх по долине, у устья складывается с бризом', `сейчас у устья Северной долины ${fmt(p.mouth)} уз`], 2, H0 - 26, 17, { size: 13, color: P.ink });
    } else {
      txt(c, p.sun < 0.5 ? 'облачно: склон не остывает и не греется, стокового ветра нет' : p.G >= 12 ? 'сильный синоптический ветер размывает стоковый' : 'утро: стоковый ветер стих, долинный ещё не начался', 12, 50, { size: 15, color: tc });
    }
  }

  // Plan view of a valley from the bay (left) to its upper basin (right) with a gorge in the middle.
  // The same air passes every section, so in the gorge it moves about twice as fast.
  function drawValley(c, w, h, p, t, top) {
    const nb = w < 600, hour = Wind.h24(p.hour);
    const kn = Wind.katNight(hour) * p.sun * clamp(1 - p.G / 15, 0, 1), dv = Wind.breezeDay(hour) * p.sun;
    const mode = kn > 0.05 ? -1 : dv > 0.1 ? 1 : 0; // -1 down-valley (night), +1 up-valley (day)
    const bx = 8, by = top + 30, bw = w - 16, bh = h - by - 30, cy = by + bh / 2;
    txt(c, 'Долина сверху', 8, top + 18, { size: 14, weight: 700 });
    c.fillStyle = P.planLand; c.fillRect(bx, by, bw, bh);
    const sx = (s) => bx + s * bw;
    // Half-width of the valley floor along its axis (fractions of the box height).
    const K = [[0.14, 0.42], [0.24, 0.3], [0.38, 0.2], [0.5, 0.1], [0.6, 0.12], [0.72, 0.3], [0.86, 0.38], [1, 0.24]];
    const hw = (s) => { if (s <= K[0][0]) return 0.5; for (let i = 1; i < K.length; i++) if (s <= K[i][0]) { const [a, va] = K[i - 1], [b, vb] = K[i]; const q = sstep(a, b, s); return (va + (vb - va) * q) * bh; } return K[K.length - 1][1] * bh; };
    // Bay on the left, valley floor, ridges.
    c.fillStyle = P.seaPlan; c.fillRect(bx, by, sx(0.14) - bx, bh);
    c.fillStyle = '#efe7cf'; c.beginPath();
    for (let s = 0.12; s <= 1.0001; s += 0.01) c.lineTo(sx(s), cy - hw(s));
    for (let s = 1; s >= 0.12; s -= 0.01) c.lineTo(sx(s), cy + hw(s));
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(120,95,55,0.75)'; c.lineWidth = 2;
    for (const sg of [-1, 1]) { c.beginPath(); for (let s = 0.14; s <= 1.0001; s += 0.01) { const y = cy + sg * hw(s); s === 0.14 ? c.moveTo(sx(s), y) : c.lineTo(sx(s), y); } c.stroke(); }
    c.save(); c.beginPath(); c.rect(bx, by, bw, bh); c.clip();
    c.strokeStyle = 'rgba(120,95,55,0.25)'; c.lineWidth = 1;
    for (const sg of [-1, 1]) for (let k = 1; k <= 3; k++) { c.beginPath(); for (let s = 0.16; s <= 1.0001; s += 0.01) { const y = cy + sg * (hw(s) + k * 9); s === 0.16 ? c.moveTo(sx(s), y) : c.lineTo(sx(s), y); } c.stroke(); }
    c.restore();
    txt(c, 'бухта', sx(0.07), by + 18, { size: 12, color: '#3f6f98', weight: 600, align: 'center' });
    txt(c, 'сужение', sx(0.5), cy - hw(0.5) - 12, { size: 12, color: P.ink, weight: 600, align: 'center', halo: P.planLand });
    if (!nb) txt(c, 'верховье долины', sx(0.86), by + 16, { size: 12, color: P.grey, align: 'center' });
    if (!mode) { txt(c, p.sun < 0.5 ? 'облачно: ни стокового, ни долинного ветра' : p.G >= 12 ? 'сильный синоптический ветер размыл стоковый' : 'ветер в долине сменяется: сейчас штиль', sx(0.56), cy + 5, { size: 13, weight: 600, align: 'center', halo: '#efe7cf' }); return; }
    // Moving dashes: local speed inversely proportional to the width, so they bunch in the basin and stretch in the gorge.
    const S0 = 0.1, S1 = 0.97, M = 200, T = [0];
    for (let i = 1; i <= M; i++) { const s = S0 + ((S1 - S0) * i) / M; T.push(T[i - 1] + hw(s)); }
    const Tt = T[M], col = mode < 0 ? '#3f7fd6' : '#d0553a', minHw = hw(0.5);
    for (const lane of [-0.55, 0, 0.55]) for (let k = 0; k < 16; k++) {
      let tau = ((k / 16 + t * 0.12) % 1) * Tt;
      if (mode < 0) tau = Tt - tau; // night: from the basin toward the bay
      let i = 1; while (i < M && T[i] < tau) i++;
      const s = S0 + ((S1 - S0) * i) / M, spd = minHw / hw(s), len = 5 + 14 * spd, x = sx(s), y = cy + lane * hw(s) * 0.8;
      c.strokeStyle = col; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - (mode < 0 ? -len / 2 : len / 2), y); c.lineTo(x + (mode < 0 ? -len / 2 : len / 2), y); c.stroke();
    }
    const v = Math.max(1, p.mouth), dir = mode < 0 ? 90 : 270;
    for (const [s, kk] of [[0.82, v], [0.5, 2 * v], [0.22, v]]) {
      const x = sx(s);
      barb(c, x, by + bh + 20, dir, kk, nb ? 22 : 26, P.ink);
      txt(c, `${fmt(kk)} уз`, x + (nb ? 28 : 34), by + bh + 24, { size: 12.5, weight: 700, color: P.ink });
    }
    const msg = mode < 0 ? (nb ? 'в сужении вдвое быстрее' : 'ночью воздух стекает к бухте, в сужении вдвое быстрее') : (nb ? 'в сужении вдвое сильнее' : 'днём ветер дует вверх по долине, в сужении вдвое сильнее');
    tag(c, msg, nb ? w - 8 : sx(0.5), by - 4, col, { align: nb ? 'right' : 'center' });
  }
  function drawKatabaticPlan(c, w, h, p, t) {
    const h1 = w < 620 ? 350 : 330;
    drawKatabatic(c, w, h1, p, t);
    drawValley(c, w, h, p, t, h1);
  }

  // ------------------------------------------------------------------ 5. bora
  function boraProfile(N) {
    const out = [];
    for (let i = 0; i < N; i++) {
      const km = (i / (N - 1)) * 30;
      out.push(km < 10 ? 0 : km < 16.5 ? 1500 * Math.pow((km - 10) / 6.5, 1.25) : km < 18 ? 1500 - ((km - 16.5) / 1.5) * 500 : 1000 - Math.min(1, (km - 18) / 3) * 100);
    }
    return out;
  }
  function drawBora(c, w, h, p, t) {
    const nb = w < 600;
    sky(c, 0, 0, w, h, 'day');
    const N = 301, prof = boraProfile(N), top = 62, base = h - 34, zs = (base - top) / 1900;
    const X = (i) => (i / (N - 1)) * w, Y = (z) => base - z * zs, I = (km) => Math.round((km / 30) * N);
    const win = I(9), model = prof.map((_, i) => { let s = 0, n = 0; for (let j = i - win / 2; j <= i + win / 2; j++) { s += prof[clamp(Math.round(j), 0, N - 1)]; n++; } return s / n; });
    sea(c, 0, base, X(I(10)), h - base, t, clamp(p.Bo, 0, 1));
    ground(c, prof.map((z, i) => [X(i), Y(z)]).slice(I(10) - 1), h, '#c6b79c', '#97866a');
    // Snow on the crest in winter.
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.moveTo(X(I(15.2)), Y(prof[I(15.2)])); for (let i = I(15.2); i <= I(17.4); i++) c.lineTo(X(i), Y(prof[i])); c.lineTo(X(I(17.4)), Y(prof[I(17.4)]) + 8); c.lineTo(X(I(15.2)), Y(prof[I(15.2)]) + 8); c.closePath(); c.fill();
    if (p.cold) {
      const lvl = p.high ? 1560 : 1250;
      c.save(); const g = c.createLinearGradient(0, Y(lvl), 0, Y(900)); g.addColorStop(0, 'rgba(110,160,230,0.25)'); g.addColorStop(1, 'rgba(90,140,220,0.5)'); c.fillStyle = g; c.beginPath();
      let started = false;
      for (let i = N - 1; i >= 0; i--) { if (prof[i] > lvl || X(i) < w * 0.5) break; started ? c.lineTo(X(i), Y(prof[i])) : c.moveTo(X(i), Y(prof[i])); started = true; }
      c.lineTo(X(I(16.3)), Y(lvl)); c.lineTo(w, Y(lvl)); c.closePath(); c.fill(); c.restore();
      txt(c, 'холодный воздух −10 °C', w - 12, Y(1180), { size: 13.5, weight: 700, color: '#1d4f95', align: 'right', halo: '#cfe0f3' });
    }
    c.save(); c.strokeStyle = P.ink; c.setLineDash([6, 5]); c.lineWidth = 1.6; c.beginPath(); model.forEach((z, i) => (i ? c.lineTo(X(i), Y(z)) : c.moveTo(X(i), Y(z)))); c.stroke(); c.restore();
    const mMax = Math.max(...model), iM = model.indexOf(mMax);
    tag(c, 'модель 9 км: хребет около 1000 м', X(iM) + 30, Y(mMax) + 30, 'rgba(28,42,68,0.8)', { align: 'left' });
    txt(c, '1500 м', X(I(16.5)) + 8, Y(1500) + 18, { size: 12, color: P.grey });
    if (p.high) { txt(c, 'H', w - 36, 36, { size: 28, weight: 800, color: '#2c5fb0', align: 'center' }); txt(c, nb ? 'антициклон' : 'антициклон за хребтом', w - 12, 54, { size: 12, color: P.grey, align: 'right' }); }
    if (p.low) { txt(c, 'L', 30, 36, { size: 28, weight: 800, color: P.red, align: 'center' }); txt(c, nb ? 'циклон' : 'циклон над морем', 12, 54, { size: 12, color: P.grey }); }
    if (p.high && p.low) { c.globalAlpha = 0.55; arrow(c, w - 62, 28, 58, 28, P.grey, 2); c.globalAlpha = 1; txt(c, 'давление падает к морю', w / 2, 22, { size: 12, color: P.grey, align: 'center' }); }
    const Bo = p.Bo;
    if (Bo > 0.05) {
      const k = clamp(Bo, 0, 1), wd = 2.5 + 3 * k, iC = I(16.5), crestY = Y(1500);
      flow(c, [[w - 20, Y(1000) - 46], [X(iC) + 60, crestY - 24]], P.blue, wd, t, 30 * k);
      flow(c, [[X(iC) + 10, crestY - 20], [X(iC) - 30, crestY + 26]], P.blue, wd + 0.5, t, 60 * k);
      flow(c, [[X(I(14.5)) + 10, Y(prof[I(14.5)]) - 18], [X(I(12)) + 4, Y(prof[I(12)]) - 14]], P.blue, wd + 1.5, t, 110 * k);
      flow(c, [[X(I(12)) - 6, base - 12], [X(I(7)), base - 10]], P.blue, wd + 2.5, t, 150 * k);
      flow(c, [[X(I(6)), base - 10], [16, base - 10]], P.blue, wd + 1, t, 100 * k);
      if (Bo >= 0.45) { cumulus(c, X(iC) + 4, crestY - 8, 15); txt(c, nb ? 'шапка на гребне' : 'облачная шапка на гребне', X(iC) - 30, crestY - 34, { size: 13, color: P.ink, halo: '#e3edf7', align: 'right' }); }
      txt(c, 'разгон на спуске,', 12, nb ? 92 : h * 0.46, { size: nb ? 14 : 17, weight: 700, color: P.blue });
      txt(c, 'порывы вдвое сильнее', 12, (nb ? 92 : h * 0.46) + (nb ? 18 : 21), { size: nb ? 14 : 17, weight: 700, color: P.blue });
      txt(c, `на плато ${fmt(p.plateau)} уз`, w - 12, Y(1000) - 66, { size: 13, align: 'right', halo: '#e3edf7' });
      tag(c, `под перевалом ${fmt(p.foot)} уз, порывы ${fmt(p.footG)}`, 8, base - 26, P.blue, { align: 'left' });
      txt(c, 'у берега: NE, ясно', 12, h - 12, { size: 13.5, color: '#fff', weight: 600 });
    } else {
      txt(c, !p.cold ? 'без холодного воздуха на плато перетекать через хребет нечему' : 'холодный воздух есть, но нет перепада давления к морю', 12, h * 0.5, { size: 15, color: P.grey });
    }
  }

  // ------------------------------------------------------------------ 6. terrain
  function drawTerrain(c, w, h, p, t) {
    const narrow = w < 620, gap = 12, pw = narrow ? w : (w - gap * 2) / 3, ph = narrow ? 170 : h - 58;
    const panels = [
      { key: 'cape', title: 'Мыс', cap: 'ускорение на 20–40 %, волна круче' },
      { key: 'strait', title: 'Пролив', cap: 'воронка: сильнее, вдоль пролива' },
      { key: 'lee', title: 'Высокий берег', cap: 'тень на 5–10 высот, штиль и ротор' },
    ];
    panels.forEach((Q, i) => {
      const x0 = narrow ? 0 : i * (pw + gap), y0 = narrow ? i * (ph + 50) + 24 : 26, on = p.active === Q.key;
      c.save(); c.translate(x0, y0); roundRect(c, 0, 0, pw, ph, 8); c.clip();
      if (Q.key === 'lee') { sky(c, 0, 0, pw, ph, 'day'); sea(c, pw * 0.3, ph * 0.9, pw * 0.7, ph * 0.1, t); }
      else { const g = c.createLinearGradient(0, 0, 0, ph); g.addColorStop(0, '#a9cbe8'); g.addColorStop(1, '#7fb0d8'); c.fillStyle = g; c.fillRect(0, 0, pw, ph); }
      const ink = '#1c2a44', sp = 40;
      if (Q.key === 'cape') {
        poly(c, [[0, ph * 0.48], [pw * 0.28, ph * 0.56], [pw * 0.52, ph * 0.74], [pw * 0.66, ph], [0, ph]], P.planLand);
        [[0.12, 0.62, 1], [0.27, 0.62, 1], [0.42, 0.78, 1.25], [0.55, 0.92, 1.4]].forEach(([yy, len, k]) => flow(c, [[pw * 0.08, ph * yy * 0.8], [pw * (0.08 + len * 0.8), ph * yy * 0.8]], ink, 2.6, t, sp * k));
        txt(c, '×1,3', x0 + pw * 0.72, ph * 0.82, { size: 26, weight: 800, color: P.orange });
      } else if (Q.key === 'strait') {
        poly(c, [[0, 0], [pw, 0], [pw, ph * 0.23], [pw * 0.62, ph * 0.38], [pw * 0.38, ph * 0.38], [0, ph * 0.23]], P.planLand);
        poly(c, [[0, ph], [pw, ph], [pw, ph * 0.77], [pw * 0.62, ph * 0.62], [pw * 0.38, ph * 0.62], [0, ph * 0.77]], P.planLand);
        [[0.43, 0.6, 1], [0.5, 0.75, 1.4], [0.57, 0.6, 1]].forEach(([yy, len, k]) => flow(c, [[pw * 0.06, ph * yy], [pw * (0.06 + len), ph * yy]], ink, 2.6, t, sp * k));
      } else {
        ground(c, [[0, ph * 0.34], [pw * 0.3, ph * 0.4]], ph, '#b8a684', '#8b7a5e'); c.fillStyle = '#8b7a5e'; c.fillRect(pw * 0.29, ph * 0.4, 3, ph * 0.6);
        [[0.22], [0.31]].forEach(([yy]) => flow(c, [[pw * 0.06, ph * yy], [pw * 0.92, ph * yy]], ink, 2.6, t, sp));
        c.strokeStyle = P.blue; c.lineWidth = 2.6; c.beginPath(); c.arc(pw * 0.53, ph * 0.66, ph * 0.13, -0.2 + t * 2, Math.PI * 1.6 + t * 2); c.stroke();
        txt(c, 'ротор', x0 + pw * 0.72, ph * 0.56, { size: 15, weight: 700, color: P.blue });
        flow(c, [[pw * 0.42, ph * 0.42], [pw * 0.92, ph * 0.86]], P.grey, 1.6, t, 50);
      }
      c.restore();
      if (on) { c.strokeStyle = P.orange; c.lineWidth = 3; roundRect(c, x0 + 1.5, y0 + 1.5, pw - 3, ph - 3, 8); c.stroke(); }
      txt(c, Q.title, x0 + pw / 2, y0 - 8, { size: 15, weight: 700, align: 'center' });
      txt(c, on && p.delta != null ? `${Q.cap} · у яхты ${p.delta}` : Q.cap, x0 + pw / 2, y0 + ph + 19, { size: 12.5, align: 'center', color: on ? '#b8420a' : P.ink, weight: on ? 700 : 500, max: pw - 6 });
    });
  }

  // ------------------------------------------------------------------ 7. convection and thunderstorms
  const CONV = [
    [10, 13, 'Облако подтягивает воздух', 'Тёплый влажный воздух у воды стекается к растущему облаку и поднимается в нём. Под облаком ветер дует к нему, слабый.'],
    [13, 15, 'Облако растёт', 'Башня поднимается выше 5–6 км, вершина становится волокнистой. До грозы 30–60 минут: следите за облаком и радаром.'],
    [15, 17.5, 'Ливень и шквал', 'Из облака идут ливень и холодный нисходящий поток. Он растекается по воде, впереди идёт линия шквала: порыв 30–50 уз за минуту, поворот ветра до 180°, вал белой воды. Шквал длится 15–40 минут.'],
    [17.5, 21.01, 'Распад', 'Нисходящий поток гасит восходящий. Остаётся наковальня и слабый дождь, ветер стихает.'],
  ];
  // A single thunderstorm over the sea, stage by stage: inflow and updraft, growth, downpour with the squall
  // line running out ahead of the cell, decay. The yacht on the left meets the squall line.
  function drawConvection(c, w, h, p, t) {
    const hour = clamp(p.hour, 10, 21), nb = w < 600, idx = Math.max(0, CONV.findIndex((s) => hour >= s[0] && hour < s[1])), st = CONV[idx];
    const u = clamp((hour - st[0]) / (st[1] - st[0]), 0, 1);
    const sh = h - (nb ? 150 : 110), yb = sh - 30, cx = w * 0.6, xy = w * 0.16;
    sky(c, 0, 0, w, sh, idx === 2 ? 'storm' : idx === 3 ? 'dusk' : 'day');
    const xg = idx === 2 ? cx - 40 - (cx - 40 - w * 0.03) * u : null; // squall line position
    sea(c, 0, yb, w, sh - yb, t, idx === 2 ? 0.9 : 0.3);
    if (idx < 2) sun(c, w * 0.1, 36, 13);
    const warm = 'rgba(214,92,40,0.85)', cold = '#3f7fd6', cb = yb - sh * 0.34, inflow = idx === 0 ? 0.4 + 0.6 * u : idx === 1 ? 1 : 0;
    // Inflow at the surface toward the cloud and the updraft inside it.
    if (inflow > 0) {
      const wd = 2 + 2.5 * inflow, sp = 20 + 40 * inflow;
      flow(c, [[cx - w * 0.36, yb - 12], [cx - 30, yb - 14], [cx - 14, cb + 10]], warm, wd, t, sp);
      flow(c, [[cx + w * 0.34, yb - 12], [cx + 30, yb - 14], [cx + 14, cb + 10]], warm, wd, t, sp);
      flow(c, [[cx, cb - 6], [cx, cb - sh * (idx === 0 ? 0.12 + 0.1 * u : 0.4)]], warm, wd + 1, t, sp * 1.4);
    }
    if (idx === 0) {
      const s = (nb ? 16 : 22) + (nb ? 8 : 12) * u;
      cumulus(c, cx, cb, s);
      if (u > 0.5) cumulus(c, cx + 4, cb - s * 0.9, s * 0.8);
    } else if (idx === 1) {
      const n = 3 + Math.round(2 * u), s = nb ? 26 : 34;
      for (let k = 0; k < n; k++) cumulus(c, cx + (k % 2 ? 4 : -3), cb - k * s * 0.85, s - k * 2, { dark: k === 0 });
    } else {
      cumulonimbus(c, cx, cb, 34, nb ? 30 : 40, -1, { dark: idx === 2 });
    }
    if (idx === 2) {
      // Downpour and the cold downdraft that spreads over the water as a cold pool.
      rain(c, cx - 34, cx + 36, cb, yb, t, 2.6, 'rgba(60,90,150,0.65)');
      lightning(c, cx + 10, cb, yb, t);
      flow(c, [[cx - 4, cb - sh * 0.2], [cx - 4, yb - 10]], cold, 4.5, t, 90);
      const poolH = sh * 0.11;
      c.save(); const g = c.createLinearGradient(0, yb - poolH, 0, yb); g.addColorStop(0, 'rgba(90,140,220,0.15)'); g.addColorStop(1, 'rgba(90,140,220,0.45)');
      c.fillStyle = g; c.beginPath(); c.moveTo(xg - 6, yb);
      c.quadraticCurveTo(xg - 2, yb - poolH, xg + 40, yb - poolH); c.lineTo(cx + 70, yb - poolH * 0.8); c.quadraticCurveTo(cx + 110, yb - poolH * 0.5, cx + 120, yb);
      c.closePath(); c.fill(); c.restore();
      flow(c, [[cx - 12, yb - 8], [xg + 8, yb - 8]], cold, 5, t, 140);
      flow(c, [[cx + 12, yb - 8], [cx + 90, yb - 8]], cold, 3, t, 70);
      // Squall line: shelf cloud above the nose of the cold pool and a roll of white water under it.
      // The shelf hangs from the cloud base and reaches forward to the squall line, so it grows as the line runs out.
      const s0 = Math.max(xg + 24, cx - (nb ? 30 : 40) * 1.7 + 8), sg = c.createLinearGradient(0, cb - 6, 0, cb + 34);
      sg.addColorStop(0, '#4c5565'); sg.addColorStop(1, 'rgba(70,78,92,0.35)');
      c.fillStyle = sg; c.beginPath(); c.moveTo(s0, cb - 6);
      c.quadraticCurveTo((s0 + xg) / 2, cb - 2, xg - 4, cb + 30);
      c.quadraticCurveTo((s0 + xg) / 2 + 10, cb + 24, s0, cb + 8); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 9; k++) { const x = xg - 4 + k * 6 + Math.sin(t * 6 + k) * 2; c.beginPath(); c.arc(x, yb - 2 - (k % 3) * 2, 3 + (k % 2), 0, Math.PI * 2); c.fill(); }
      c.save(); c.setLineDash([6, 5]); c.strokeStyle = P.red; c.lineWidth = 2.5; c.beginPath(); c.moveTo(xg - 4, cb + 30); c.lineTo(xg - 4, yb + 4); c.stroke(); c.restore();
      tag(c, 'линия шквала', xg - 6, cb + 52, P.red, { align: xg < w * 0.3 ? 'left' : 'right' });
    }
    if (idx === 3) rain(c, cx - 20, cx + 24, cb + 10, yb, t, 0.6, 'rgba(70,110,170,0.4)');
    // The yacht and its wind: toward the cloud before the squall line, from the cloud after it.
    boat(c, xy, yb + 1, nb ? 0.85 : 1);
    const hit = idx === 2 && xg <= xy + 6, kn = idx === 0 ? 4 + 3 * u : idx === 1 ? 8 : idx === 2 ? (hit ? 40 : 10) : 5;
    const dir = hit || idx === 3 ? 90 : 270;
    // Above the level of the shelf cloud, so the squall-line label never covers it.
    const yw = yb - sh * 0.5;
    barb(c, xy, yw, dir, kn, nb ? 24 : 30, P.ink);
    txt(c, `у яхты ${fmt(kn)} уз, ${hit || idx === 3 ? 'от тучи' : 'к туче'}`, xy, yw + (nb ? 22 : 26), { size: 12.5, weight: 700, align: 'center', halo: 'rgba(255,255,255,0.8)' });
    // Stage strip and description.
    const S0 = sh + 10, sw = (w - 16) / CONV.length;
    CONV.forEach((s, i) => {
      const x = 8 + i * sw, on = i === idx;
      c.fillStyle = on ? P.orange : 'rgba(28,42,68,0.08)'; roundRect(c, x + 1, S0, sw - 2, 8, 4); c.fill();
      if (!nb || on) txt(c, s[2], x + 2, S0 + 22, { size: 12, color: on ? P.ink : P.grey, weight: on ? 700 : 500, max: nb ? w - 16 : sw - 6 });
    });
    const words = st[3].split(' '), maxW = w - 16, out = [];
    c.font = FONT(13.5); let line = '';
    for (const wd of words) { const tst = line ? `${line} ${wd}` : wd; if (c.measureText(tst).width > maxW) { out.push(line); line = wd; } else line = tst; }
    out.push(line);
    lines(c, out.slice(0, nb ? 6 : 4), 8, S0 + 44, 18, { size: 13.5, color: P.ink });
  }

  // ------------------------------------------------------------------ 8. model resolution
  const RES_PATH = [[13, 1.5], [20.7, 12.4], [21.5, 13.75], [25.5, 17.5], [25.9, 23.6], [31, 29.5]];
  let resProfile = null;
  function pathSamples() {
    if (resProfile) return resProfile;
    const pts = []; let dist = 0;
    for (let i = 1; i < RES_PATH.length; i++) {
      const [ax, ay] = RES_PATH[i - 1], [bx, by] = RES_PATH[i], L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 0.1);
      for (let k = 0; k < n; k++) { const u = k / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u; pts.push({ x, y, d: dist + L * u, z: Bay.isLand(x, y) ? Math.max(0, Bay.elev(x, y)) : 0, land: !!Bay.isLand(x, y) }); }
      dist += L;
    }
    resProfile = { pts, L: dist };
    return resProfile;
  }
  const cellCache = new Map();
  function cellInfo(res, i, j) {
    const key = `${res}|${i}|${j}`;
    if (!cellCache.has(key)) {
      const x0 = i * res, y0 = j * res, w = Math.min(res, Bay.W - x0), h = Math.min(res, Bay.H - y0), n = Math.max(3, Math.min(30, Math.round(res / 0.3)));
      let s = 0, l = 0;
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const x = x0 + ((a + 0.5) * w) / n, y = y0 + ((b + 0.5) * h) / n, land = Bay.isLand(x, y); l += land ? 1 : 0; s += land ? Math.max(0, Bay.elev(x, y)) : 0; }
      cellCache.set(key, { z: s / (n * n), land: l / (n * n) > 0.5 });
    }
    return cellCache.get(key);
  }
  function drawResolution(c, w, h, p, t) {
    sky(c, 0, 0, w, h, 'day');
    const { pts, L } = pathSamples(), left = 50, right = w - 12, base = h - 56, top = 56, zs = (base - top) / 1700;
    const X = (d) => left + (d / L) * (right - left), Y = (z) => base - z * zs;
    sea(c, left, base, right - left, 18, t);
    ground(c, pts.map((q) => [X(q.d), Y(q.z)]), base + 18);
    for (const q of pts) if (!q.land) { c.fillStyle = P.seaTop; c.fillRect(X(q.d) - 0.5, base - 2, (right - left) / pts.length + 1.5, 20); }
    const res = p.res, steps = [];
    for (const q of pts) { const ci = cellInfo(res, Math.floor(q.x / res), Math.floor(q.y / res)); steps.push({ d: q.d, z: ci.land ? ci.z : 0 }); }
    c.save(); c.globalAlpha = 0.22; c.fillStyle = P.orange; c.beginPath(); c.moveTo(left, base);
    steps.forEach((s, i) => { const x = X(s.d); if (i && steps[i - 1].z !== s.z) c.lineTo(x, Y(steps[i - 1].z)); c.lineTo(x, Y(s.z)); });
    c.lineTo(right, base); c.closePath(); c.fill(); c.restore();
    c.save(); c.strokeStyle = P.orange; c.lineWidth = 2.5; c.setLineDash([7, 4]); c.beginPath();
    steps.forEach((s, i) => { const x = X(s.d); if (!i) c.moveTo(x, Y(s.z)); else { if (steps[i - 1].z !== s.z) c.lineTo(x, Y(steps[i - 1].z)); c.lineTo(x, Y(s.z)); } });
    c.stroke(); c.restore();
    for (const z of [0, 500, 1000, 1500]) { txt(c, `${z} м`, left - 6, Y(z) + 4, { size: 12, color: P.grey, align: 'right' }); c.strokeStyle = 'rgba(28,42,68,0.1)'; c.lineWidth = 1; c.beginPath(); c.moveTo(left, Y(z)); c.lineTo(right, Y(z)); c.stroke(); }
    const trueMax = Math.max(...pts.map((q) => q.z)), modMax = Math.max(...steps.map((s) => s.z)), iT = pts.findIndex((q) => q.z === trueMax);
    tag(c, `на самом деле ${Math.round(trueMax / 10) * 10} м`, X(pts[iT].d) - 6, Y(trueMax) - 6, P.ink, { align: 'right' });
    tag(c, `в модели ${res} км: ${Math.round(modMax / 10) * 10} м`, X(pts[iT].d) - 6, Y(modMax) + 24, P.orange, { align: 'right' });
    [['пролив Узкий', 21.1, 13.07, 0], ['Внутренний залив', 25.5, 17.5, 1]].forEach(([lab, mx, my, row]) => {
      let best = pts[0], bd = 1e9; for (const q of pts) { const d = Math.hypot(q.x - mx, q.y - my); if (d < bd) { bd = d; best = q; } }
      const ci = cellInfo(res, Math.floor(mx / res), Math.floor(my / res)), x = X(best.d);
      c.strokeStyle = P.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(x, base + 18); c.lineTo(x, base + (row ? 36 : 22)); c.stroke();
      txt(c, `${lab}: ${ci.land ? 'в модели суша' : 'в модели вода'}`, x, base + (row ? 50 : 34), { size: 12, align: 'center', weight: 700, color: ci.land ? P.red : P.blue, halo: '#fff' });
    });
    txt(c, nb(w) ? 'море — пролив — марина — хребет — плато' : 'разрез: открытое море — пролив — марина — хребет — плато', 8, 20, { size: 13, color: P.grey });
    c.fillStyle = P.orange; c.fillRect(8, 32, 18, 3); txt(c, `пунктир — рельеф на сетке ${res} км`, 32, 38, { size: 12, color: P.grey });
  }
  const nb = (w) => w < 600;


  // ------------------------------------------------------------------ 0. wind, barbs and the Beaufort scale
  const BF = [
    [0, 'Штиль', 'Calm', 0, 1, '0', 'зеркально гладкое'], [1, 'Тихий', 'Light air', 1, 3, '0–0,2', 'рябь'],
    [2, 'Лёгкий', 'Light breeze', 4, 6, '0,2–0,5', 'короткие волны, гребни не опрокидываются'], [3, 'Слабый', 'Gentle breeze', 7, 10, '0,5–1', 'изредка барашки'],
    [4, 'Умеренный', 'Moderate breeze', 11, 16, '1–2', 'барашки во многих местах'], [5, 'Свежий', 'Fresh breeze', 17, 21, '2–3', 'барашки повсюду, брызги'],
    [6, 'Сильный', 'Strong breeze', 22, 27, '3–4', 'крупные волны, пенные гребни'], [7, 'Крепкий', 'Near gale', 28, 33, '4–5,5', 'пена ложится полосами по ветру'],
    [8, 'Очень крепкий', 'Gale', 34, 40, '5,5–7,5', 'длинные высокие волны, брызги срываются с гребней'], [9, 'Шторм', 'Strong gale', 41, 47, '7–10', 'гребни опрокидываются'],
    [10, 'Сильный шторм', 'Storm', 48, 55, '9–12,5', 'море белое от пены'], [11, 'Жестокий шторм', 'Violent storm', 56, 63, '11,5–16', 'суда скрываются за волнами'],
    [12, 'Ураган', 'Hurricane', 64, 99, 'более 14', 'воздух полон пены и брызг'],
  ];
  const bfOf = (kn) => BF[Wind.beaufort(kn)];
  function drawBeaufort(c, w, h, p, t) {
    const kn = p.kn, B = Wind.beaufort(kn), row = BF[B], nb = w < 600;
    const sceneH = nb ? 250 : h - 10, sw = nb ? w : w * 0.6;
    const dark = clamp((B - 5) / 7, 0, 1);
    sky(c, 0, 0, sw, sceneH, B >= 8 ? 'storm' : 'day');
    if (dark > 0) { c.fillStyle = `rgba(60,70,90,${0.35 * dark})`; c.fillRect(0, 0, sw, sceneH); }
    const yb = sceneH * 0.5, amp = Math.min(sceneH * 0.2, 3 + B * B * 0.55), L = 70 + B * 12;
    // Sea body with wave crests moving downwind (to the right).
    const wave = (x, k) => yb + Math.sin((x - t * (18 + B * 6) * k) / L * Math.PI * 2) * amp * k + Math.sin((x * 1.7 - t * 30) / L) * amp * 0.25;
    const g = c.createLinearGradient(0, yb - amp, 0, sceneH); g.addColorStop(0, B >= 10 ? '#7f97ad' : '#4f8dbd'); g.addColorStop(1, '#173d62');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, sceneH); for (let x = 0; x <= sw; x += 4) c.lineTo(x, wave(x, 1)); c.lineTo(sw, sceneH); c.closePath(); c.fill();
    for (let r = 1; r <= 4; r++) { c.strokeStyle = `rgba(255,255,255,${0.12 + 0.02 * r})`; c.lineWidth = 1.2; c.beginPath(); for (let x = 0; x <= sw; x += 5) { const y = wave(x + r * 37, 0.6) + r * (sceneH - yb) / 5; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    // Whitecaps, foam streaks, spray.
    const caps = B < 3 ? 0 : B === 3 ? 2 : B === 4 ? 6 : B === 5 ? 12 : 18 + (B - 6) * 4;
    for (let i = 0; i < caps; i++) {
      const x = ((i * 97.3 + t * (20 + B * 6)) % (sw + 40)) - 20, rr = i % 4, y = rr === 0 ? wave(x, 1) : wave(x + rr * 37, 0.6) + rr * (sceneH - yb) / 5;
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.ellipse(x, y - 1, 6 + B, 2.2 + B * 0.2, 0, 0, Math.PI * 2); c.fill();
    }
    if (B >= 7) { c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 1.6; for (let i = 0; i < (B - 6) * 9; i++) { const x = (i * 53.7 + t * 40) % sw, y = yb + 10 + ((i * 37) % (sceneH - yb - 14)); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 26, y + 1); c.stroke(); } }
    if (B >= 8) { c.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < (B - 7) * 30; i++) { const x = (i * 31.3 + t * 120) % sw, y = yb - amp - 6 + ((i * 17) % (amp + 10)); c.fillRect(x, y, 2, 2); } }
    if (B >= 10) { c.fillStyle = `rgba(255,255,255,${0.15 * (B - 9)})`; c.fillRect(0, yb - amp, sw, sceneH - yb + amp); }
    // Yacht with the sail area for this wind.
    const bx = sw * 0.42, by = wave(bx, 1) - 2, tilt = Math.min(0.45, 0.04 * B) * (B > 0 ? 1 : 0);
    c.save(); c.translate(bx, by); c.rotate(tilt);
    c.fillStyle = '#e0520a'; c.beginPath(); c.moveTo(-30, -3); c.lineTo(30, -3); c.lineTo(22, 9); c.lineTo(-24, 9); c.closePath(); c.fill();
    c.strokeStyle = '#1c2a44'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -3); c.lineTo(0, -74); c.stroke();
    const sail = B <= 4 ? 1 : B === 5 ? 0.8 : B === 6 ? 0.62 : B <= 8 ? 0.42 : 0;
    if (sail > 0) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(2, -72 + 70 * (1 - sail)); c.lineTo(2, -6); c.lineTo(2 + 34 * sail + 6, -6); c.closePath(); c.fill(); c.stroke(); }
    if (B <= 7) { c.fillStyle = '#f2f2f2'; c.beginPath(); c.moveTo(-2, -70); c.lineTo(-2 - 26 * Math.max(0.5, sail), -4); c.lineTo(-4, -4); c.closePath(); c.fill(); c.stroke(); }
    c.restore();
    txt(c, B <= 4 ? 'полные паруса' : B === 5 ? 'первый риф' : B === 6 ? 'второй риф' : B <= 8 ? 'штормовые паруса' : 'без парусов, к укрытию заранее', bx, sceneH - 10, { size: 12.5, color: '#fff', align: 'center', weight: 600 });
    // Card: number, name, units, waves, barb.
    const cx = nb ? 0 : sw + 14, cy = nb ? sceneH + 12 : 8, cw = nb ? w : w - sw - 14;
    card(c, cx, cy, cw, nb ? h - sceneH - 16 : h - 18);
    txt(c, String(B), cx + 16, cy + 56, { size: 52, weight: 800, color: P.ink });
    c.fillStyle = Draw.speedCSS(Math.max(5, kn)); c.fillRect(cx + 16, cy + 62, B >= 10 ? 60 : 30, 5);
    txt(c, B === 1 ? 'балл' : B >= 2 && B <= 4 ? 'балла' : 'баллов', cx + 16 + (B >= 10 ? 66 : 36), cy + 54, { size: 14, color: P.grey });
    txt(c, row[1], cx + 16, cy + 82, { size: 18, weight: 700 });
    txt(c, row[2], cx + 16, cy + 101, { size: 12.5, color: P.grey });
    const ms = kn * 0.514, kmh = kn * 1.852;
    const info = [`${fmt(kn)} уз = ${fmt1(ms)} м/с = ${fmt(kmh)} км/ч`, `диапазон балла: ${row[3]}–${B === 12 ? '…' : row[4]} уз`, `волна в открытом море: ${row[5]} м`];
    c.font = FONT(13); let ln = 'море:'; for (const wd of row[6].split(' ')) { if (c.measureText(`${ln} ${wd}`).width > cw - 34) { info.push(ln); ln = wd; } else ln = `${ln} ${wd}`; } info.push(ln);
    lines(c, info, cx + 16, cy + 128, 20, { size: 13, max: cw - 30 });
    const bxx = cx + cw - (nb ? 70 : 60), byy = cy + 70;
    barb(c, bxx, byy, p.dir, kn, 46, P.ink);
    txt(c, `флажок: ${Wind.compass(p.dir)}`, bxx, cy + 120, { size: 12, color: P.grey, align: 'center' });
  }

  // ------------------------------------------------------------------ 9. fog
  // Radiation fog: clear calm night cools the surface air to the dew point; gone 1–3 h after sunrise.
  // Advection fog: warm moist air over a sea colder than its dew point; holds day and night, even in wind.
  function fogState(o) {
    if (o.type === 'adv') {
      const sat = clamp((o.Td - o.sst + 1) / 2.5, 0, 1), windOk = o.G > 20 ? 0.3 : 1;
      const T = Math.max(o.sst + 0.5, Math.min(o.T, o.sst + 1.5));
      return { T, Td: Math.min(o.Td, T), density: sat * windOk, lifted: o.G > 20 && sat > 0.3, spread: Math.max(0, T - o.Td) };
    }
    const tn = (o.hour - 19 + 24) % 24, rate = (o.clear ? 1.0 : 0.2) * (o.G > 5 ? 0.4 : 1);
    const Traw = tn <= 11 ? o.T - rate * tn : o.T - rate * 11 + 2.2 * (tn - 11);
    const T = Math.max(Traw, o.Td);
    const deficit = o.Td - Traw; // > 0 means saturated
    const density = o.G > 7 ? 0 : clamp((deficit + 0.4) / 2.2, 0, 1) * (o.G > 5 ? 0.5 : 1);
    return { T, Td: o.Td, density, spread: Math.max(0, T - o.Td) };
  }
  function visibility(d) { return d > 0.75 ? 'менее 200 м' : d > 0.45 ? '200–500 м' : d > 0.15 ? '0,5–1 км' : null; }
  function drawFog(c, w, h, p, t) {
    const F = fogState(p), nb = w < 600, adv = p.type === 'adv';
    // Temperature profile panel.
    const PW = nb ? w : w * 0.36, PH = nb ? 200 : h - 20, px = 0, py = nb ? h - PH : 10;
    // Scene.
    const SW = nb ? w : w - PW - 12, SH = nb ? h - PH - 12 : h, sx = nb ? 0 : PW + 12;
    const hour = Wind.h24(p.hour), night = !adv && (hour < 6.5 || hour > 19.5);
    c.save(); c.translate(sx, 0);
    sky(c, 0, 0, SW, SH, night ? 'night' : adv ? 'storm' : 'day');
    const yb = SH * 0.72;
    const drawLayer = () => {
    if (F.density > 0.02) {
      const top = yb - (adv ? 40 + 50 * F.density : 18 + 40 * F.density) * (F.lifted ? 0.5 : 1), y0 = F.lifted ? top - 40 : top;
      const x0 = adv ? -20 : SW * 0.12, x1 = adv ? SW + 20 : SW * 0.88, bot = F.lifted ? top : yb + 8;
      c.save();
      const gg = c.createLinearGradient(0, y0, 0, bot);
      gg.addColorStop(0, `rgba(238,242,246,${0.55 * F.density})`); gg.addColorStop(1, `rgba(236,240,245,${0.95 * F.density})`);
      c.fillStyle = gg; c.beginPath(); c.moveTo(x0, bot);
      for (let x = x0; x <= x1; x += 8) c.lineTo(x, y0 + Math.sin(x * 0.045 + t * 0.4) * 5 + Math.sin(x * 0.11) * 3);
      c.lineTo(x1, bot); c.closePath(); c.fill();
      for (let k = 0; k < 16; k++) {
        const bx = x0 + ((k + 0.5) / 16) * (x1 - x0) + Math.sin(t * 0.3 + k) * 6, by = y0 + 2, rr = 18 + (k % 3) * 8;
        const rg2 = c.createRadialGradient(bx, by, 2, bx, by, rr); rg2.addColorStop(0, `rgba(245,247,250,${0.75 * F.density})`); rg2.addColorStop(1, 'rgba(245,247,250,0)');
        c.fillStyle = rg2; c.beginPath(); c.arc(bx, by, rr, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      tag(c, F.lifted ? 'ветер поднял туман в низкие облака' : `туман, видимость ${visibility(F.density) || 'более 1 км'}`, SW / 2, y0 - 26, '#5f6b7a');
    } else if (F.spread < 2.5) tag(c, 'дымка: до тумана меньше 2 °C', SW / 2, yb - 30, '#5f6b7a');
    };
    if (adv) {
      sea(c, 0, yb, SW * 0.7, SH - yb, t);
      ground(c, [[SW * 0.7, yb], [SW * 0.82, yb - SH * 0.18], [SW, yb - SH * 0.3]], SH);
      flow(c, [[20, yb - 40], [SW * 0.55, yb - 40]], P.orange, 4, t, 40);
      tag(c, `тёплый влажный воздух, Td ${fmt(p.Td)} °C`, 20, yb - 52, P.orange, { align: 'left' });
      txt(c, `море ${fmt(p.sst)} °C`, 14, SH - 10, { size: 13, color: '#fff', weight: 700 });
    } else {
      sea(c, SW * 0.32, yb, SW * 0.36, SH - yb, t, 0.1);
      drawLayer();
      ground(c, [[0, yb - SH * 0.45], [SW * 0.2, yb - SH * 0.2], [SW * 0.32, yb]], SH); ground(c, [[SW * 0.68, yb], [SW * 0.8, yb - SH * 0.25], [SW, yb - SH * 0.5]], SH);
      if (night) moon(c, SW - 40, 36, 13); else sun(c, SW * 0.18, 40 + Math.max(0, 7.5 - hour) * 8, 14);
      if (!p.clear) { cumulus(c, SW * 0.4, 60, 24, { dark: true }); cumulus(c, SW * 0.7, 56, 22, { dark: true }); }
      if (night && p.clear) for (const xx of [0.12, 0.86]) arrow(c, SW * xx, yb - SH * 0.32, SW * xx, yb - SH * 0.32 - 24, 'rgba(255,255,255,0.7)', 1.4);
    }
    if (adv) drawLayer();
    txt(c, adv ? 'Адвективный туман' : 'Радиационный туман', 12, 24, { size: 16, weight: 700, color: night ? '#fff' : P.ink });
    if (!adv) txt(c, `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`, 12, 44, { size: 13, color: night ? '#dfe6f0' : P.grey });
    c.restore();
    // Profile: temperature and dew point with height.
    card(c, px + 2, py, PW - 4, PH);
    const L0 = px + 44, R0 = px + PW - 14, T0 = py + 30, B0 = py + PH - 30;
    const tmin = Math.min(F.Td, F.T) - 3, tmax = Math.max(F.T, adv ? p.T : p.T) + 3;
    const XT = (v) => L0 + ((v - tmin) / (tmax - tmin)) * (R0 - L0), YZ = (z) => B0 - (z / 400) * (B0 - T0);
    txt(c, 'Высота и температура', px + 12, py + 20, { size: 13, weight: 700 });
    c.strokeStyle = 'rgba(28,42,68,0.12)'; c.lineWidth = 1;
    for (const z of [0, 100, 200, 300, 400]) { c.beginPath(); c.moveTo(L0, YZ(z)); c.lineTo(R0, YZ(z)); c.stroke(); txt(c, `${z} м`, L0 - 4, YZ(z) + 4, { size: 11.5, color: P.grey, align: 'right' }); }
    // Profile shape: inversion at night or over cold sea, ordinary lapse otherwise.
    const aloft = adv ? p.T : p.T - 1;
    const Tz = (z) => { const surf = F.T; const inv = adv || night || hour < 9 ? 1 : 0; return inv ? surf + (aloft - surf) * (1 - Math.exp(-z / 90)) - 0.006 * z * 0.3 : surf - 0.008 * z; };
    if (F.density > 0.02) { const ztop = adv ? 120 + 150 * F.density : 40 + 90 * F.density; c.fillStyle = 'rgba(150,160,175,0.22)'; c.fillRect(L0, YZ(ztop), R0 - L0, YZ(0) - YZ(ztop)); txt(c, 'туман', R0 - 4, YZ(ztop) + 16, { size: 12, color: P.ink, align: 'right', weight: 600 }); }
    c.strokeStyle = P.blue; c.setLineDash([6, 4]); c.lineWidth = 2; c.beginPath(); c.moveTo(XT(F.Td), YZ(0)); c.lineTo(XT(F.Td - 0.6), YZ(400)); c.stroke(); c.setLineDash([]);
    c.strokeStyle = P.red; c.lineWidth = 2.5; c.beginPath(); for (let z = 0; z <= 400; z += 10) { const x = XT(Tz(z)), y = YZ(z); z ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    txt(c, `T ${fmt1(F.T)} °C`, XT(Tz(200)) + 8, YZ(200), { size: 12.5, weight: 700, color: P.red, halo: '#fff' });
    txt(c, `Td ${fmt1(F.Td)} °C`, XT(F.Td) - 8, YZ(330), { size: 12.5, weight: 700, color: P.blue, align: 'right', halo: '#fff' });
    txt(c, `T − Td = ${fmt1(F.spread)} °C${F.spread >= 2 ? ` · облака от ≈${fmt(125 * F.spread)} м` : ''}`, px + 12, py + PH - 10, { size: 12.5, weight: 700, max: PW - 20 });
    p._out = F;
  }

  // ------------------------------------------------------------------ 0. heating, rising air and pressure
  // Sea | land cross-section. Day: land warmer, thermal rises and cools 1 °C per 100 m, cumulus at the dew
  // point (base = 125 m × (T − Td)), L over land, H over sea, surface wind H -> L. Night: land colder, cold air
  // drains down the slope, H over land, L over sea.
  const HEAT = { day: { sea: 20, land: 28 }, night: { sea: 18, land: 12 }, top: 3000 };
  function heatOut(p) {
    const T = HEAT[p.night ? 'night' : 'day'], base = 125 * Math.max(0, T.land - p.td);
    return { T, base, cloud: !p.night && base <= 2800, wind: p.night ? 4 : 10, dir: p.night ? 90 : 270 };
  }
  function drawHeat(c, w, h, p, t) {
    const nb = w < 600, o = heatOut(p), night = !!p.night;
    const yb = h - (nb ? 64 : 58), yTop = 58, xc = w * 0.42;
    const yAt = (m) => yb - (Math.min(m, HEAT.top) / HEAT.top) * (yb - yTop);
    sky(c, 0, 0, w, yb, night ? 'night' : 'day');
    sea(c, 0, yb, xc, h - yb, t);
    const S = [[xc, yb], [w * 0.55, yb - 4], [w * 0.75, yb - 16], [w * 0.9, yb - 44], [w, yb - 62]];
    ground(c, S, h);
    const gy = (x) => { for (let i = 0; i < S.length - 1; i++) if (x <= S[i + 1][0]) { const u = (x - S[i][0]) / (S[i + 1][0] - S[i][0]); return S[i][1] + (S[i + 1][1] - S[i][1]) * u; } return S[S.length - 1][1]; };
    if (night) moon(c, w - 40, 36, 14); else sun(c, w * (nb ? 0.86 : 0.62), 34, 16);
    const ink = night ? '#e8eef6' : P.ink, soft = night ? 'rgba(220,230,245,0.8)' : 'rgba(70,80,95,0.8)';
    // Height scale on the left.
    c.save(); c.strokeStyle = night ? 'rgba(255,255,255,0.18)' : 'rgba(28,42,68,0.12)'; c.lineWidth = 1; c.setLineDash([3, 5]);
    for (const m of [1000, 2000, 3000]) { c.beginPath(); c.moveTo(44, yAt(m)); c.lineTo(w, yAt(m)); c.stroke(); txt(c, `${m / 1000} км`, 6, yAt(m) + 4, { size: 12, color: soft }); }
    c.restore();
    // Surface temperatures.
    txt(c, `море ${o.T.sea} °C`, xc / 2, h - 18, { size: 14, weight: 700, color: '#fff', align: 'center' });
    txt(c, `суша ${o.T.land} °C`, w * 0.72, h - 18, { size: 14, weight: 700, color: P.ink, align: 'center' });
    // Pressure centres at the surface.
    const big = (s, x, y, col) => { c.font = `700 ${nb ? 30 : 36}px "Source Serif 4", Georgia, serif`; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y); c.textAlign = 'left'; };
    const xs = w * 0.17, xl = w * 0.68;
    if (!night) {
      // Thermal: a warm column rising from the land, temperatures every 1000 m up to the cloud base.
      const yg = gy(xl), top = o.cloud ? yAt(o.base) : yAt(2400);
      const g = c.createLinearGradient(0, yg, 0, top); g.addColorStop(0, 'rgba(238,120,60,0.34)'); g.addColorStop(1, 'rgba(238,120,60,0.06)');
      c.fillStyle = g; c.beginPath(); c.moveTo(xl - 26, yg); c.quadraticCurveTo(xl - 34, (yg + top) / 2, xl - 40, top); c.lineTo(xl + 40, top); c.quadraticCurveTo(xl + 34, (yg + top) / 2, xl + 26, yg); c.closePath(); c.fill();
      for (const dx of [-14, 14]) flow(c, [[xl + dx, yg - 8], [xl + dx, top + 14]], P.orange, 3, t, 40);
      for (let m = 0; m <= 2000; m += 1000) {
        if (o.cloud && m > o.base - 150) break;
        txt(c, `${o.T.land - m / 100} °C`, xl + 46, (m === 0 ? yg - 12 : yAt(m)) + 4, { size: 13, weight: 600, color: P.ink, halo: 'rgba(255,255,255,0.8)' });
      }
      if (o.cloud) {
        const cs = nb ? 22 : clamp(w * 0.026, 26, 36);
        cumulus(c, xl, top, cs);
        if (!nb) txt(c, `облако: воздух остыл до точки росы ${p.td} °C`, xl - 150, top - cs * 3.1, { size: 13, weight: 600, color: P.ink, max: 300 });
        c.save(); c.strokeStyle = 'rgba(28,42,68,0.55)'; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(xl - 70, top); c.lineTo(xl + 70, top); c.stroke(); c.restore();
        txt(c, `${Math.round(o.base / 10) * 10} м`, nb ? xl + 34 : xl - 74, nb ? top - 8 : top + 4, { size: 13, weight: 700, align: nb ? 'left' : 'right', color: P.ink, halo: 'rgba(255,255,255,0.8)' });
      } else if (!nb) txt(c, 'воздух сухой: до точки росы не остыл, облака нет', xl - 160, yAt(2600), { size: 13, weight: 600, color: P.ink, max: 340 });
      const ty = nb ? yTop - 34 : yAt(900);
      txt(c, 'тёплый воздух легче и поднимается', nb ? 8 : xl - 260, ty, { size: 13, color: P.orange, weight: 700, halo: 'rgba(255,255,255,0.8)', max: nb ? w * 0.72 : 230 });
      txt(c, '−1 °C на каждые 100 м', nb ? 8 : xl - 260, ty + 18, { size: 13, color: P.ink, halo: 'rgba(255,255,255,0.8)', max: nb ? w * 0.72 : 230 });
      // Sinking over the sea and the return flow aloft.
      const ya = yAt(1700);
      flow(c, [[xl - 50, ya], [xs + 20, ya]], soft, 2, t, 25);
      flow(c, [[xs, ya + 14], [xs, yb - 54]], soft, 2, t, 25);
      txt(c, 'воздух опускается', nb ? xs + 8 : xs - 6, ya + 34, { size: 12.5, color: soft, align: nb ? 'left' : 'right', max: nb ? w * 0.4 : xs - 4 });
      big('H', xs, yb - 20, '#2f62a8'); big('L', xl - (nb ? 50 : 66), gy(xl - 60) - 20, '#c62f3a');
      flow(c, [[xs + 30, yb - 28], [xl - (nb ? 72 : 96), gy(xl - 90) - 28]], P.orange, 5, t, 60);
      tag(c, `ветер с моря ≈ ${o.wind} уз`, (xs + xl) / 2 - 20, yb - 44, P.orange);
    } else {
      // Night: cold air layer on the slope drains to the sea.
      c.save(); c.fillStyle = 'rgba(120,170,235,0.42)'; c.beginPath();
      for (let x = xc; x <= w; x += 6) { const y = gy(x) - 16 - 10 * ((x - xc) / (w - xc)); x === xc ? c.moveTo(x, y) : c.lineTo(x, y); }
      for (let x = w; x >= xc; x -= 6) c.lineTo(x, gy(x)); c.closePath(); c.fill(); c.restore();
      flow(c, [[w - 10, gy(w - 10) - 12], [w * 0.8, gy(w * 0.8) - 10], [xc + 20, yb - 10], [xs + 40, yb - 12]], '#9cc4ff', 4.5, t, 45);
      txt(c, 'суша остыла: холодный воздух тяжелее', nb ? 8 : w * 0.46, yAt(1500), { size: 13.5, weight: 700, color: '#cfe0ff', max: nb ? w - 16 : w * 0.5 });
      txt(c, 'и стекает по склону к морю', nb ? 8 : w * 0.46, yAt(1500) + 19, { size: 13.5, color: '#cfe0ff', max: nb ? w - 16 : w * 0.5 });
      flow(c, [[xs, yb - 50], [xs, yAt(1000)]], soft, 2, t, 20);
      big('L', xs, yb - 20, '#ff8a92'); big('H', xl, gy(xl) - 34, '#9cc4ff');
      tag(c, `ветер с берега ≈ ${o.wind} уз`, (xs + xl) / 2, yb - 30, '#3466b0');
    }
    p._out = o;
  }

  // ------------------------------------------------------------------ 2b. vertical section from L to H
  // Surfaces of equal pressure (1000, 900, 800, 700 hPa) sit lower over the cyclone and higher over the
  // anticyclone (height = 8 km × ln(Ps / p), deviation drawn 2.5× larger). Where the sea-level pressure
  // crosses a multiple of 4 hPa, the chart has an isobar: dense ticks mean strong wind.
  function drawIsobars(c, w, h, p, t) {
    const nb = w < 600, x0 = 40, x1 = w - (nb ? 56 : 80), yb = h - (nb ? 70 : 62), yTop = 34, zMax = 3600;
    const Y = (z) => yb - (z / zMax) * (yb - yTop);
    const f = (x) => clamp((x - x0) / (x1 - x0), 0, 1);
    const Ps = (x) => p.low + (p.high - p.low) * (0.5 - 0.5 * Math.cos(Math.PI * f(x)));
    // Height of a pressure surface; the tilt is exaggerated 2.5 times about the point where sea-level pressure is
    // 1000 hPa, so the 1000 hPa surface meets the sea exactly at the 1000 tick.
    const zOf = (pp, x) => 8000 * Math.log(1000 / pp) + 2.5 * 8000 * Math.log(Ps(x) / 1000);
    sky(c, 0, 0, w, yb, 'day');
    sea(c, 0, yb, w, h - yb, t, 0.3);
    // Columns of air: lighter over L, heavier over H.
    const col = (x, txtS, color) => { c.fillStyle = color; c.fillRect(x - 16, yTop, 32, yb - yTop); txt(c, txtS, x, yTop - 10, { size: 12, color: P.grey, align: 'center', max: 140 }); };
    col(x0 + 20, nb ? 'столб легче' : 'столб воздуха легче', 'rgba(198,47,58,0.08)');
    col(x1 - 20, nb ? 'столб тяжелее' : 'столб воздуха тяжелее', 'rgba(52,102,176,0.10)');
    // Surfaces of equal pressure.
    for (const pp of [1000, 900, 800, 700]) {
      c.strokeStyle = 'rgba(28,42,68,0.7)'; c.lineWidth = 1.6; c.beginPath();
      let started = false;
      for (let x = x0 - 20; x <= x1 + 20; x += 4) { const z = zOf(pp, x); if (z < 0) { started = false; continue; } const y = Y(z); if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y); }
      c.stroke();
      txt(c, `${pp} гПа`, x1 + 24, Y(Math.max(0, zOf(pp, x1 + 20))) + 4, { size: 12, color: P.ink, weight: 600 });
    }
    // Rising air over L with cloud, sinking over H with clear sky, surface flow from H to L.
    cumulus(c, x0 + 40, Y(1900), nb ? 16 : 22, { dark: true });
    flow(c, [[x0 + 40, Y(300)], [x0 + 40, Y(1700)]], '#d0553a', 2.5, t, 30);
    flow(c, [[x1 - 40, Y(2600)], [x1 - 40, Y(500)]], P.blue, 2.5, t, 30);
    const big = (s, x, col2) => { c.font = `700 ${nb ? 28 : 34}px "Source Serif 4", Georgia, serif`; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.strokeText(s, x, Y(2900)); c.fillStyle = col2; c.fillText(s, x, Y(2900)); c.textAlign = 'left'; };
    big('L', x0 + 40, '#c62f3a'); big('H', x1 - 40, '#2f62a8');
    txt(c, nb ? 'поднимается' : 'воздух поднимается', x0 + 54, Y(1100), { size: 12.5, color: '#b0482a', weight: 600, halo: 'rgba(255,255,255,0.8)' });
    txt(c, 'опускается', x1 - 54, Y(1100), { size: 12.5, color: P.blue, weight: 600, align: 'right', halo: 'rgba(255,255,255,0.8)' });
    // Sea-level isobars: ticks where pressure crosses a multiple of 4 hPa.
    const ticks = [];
    for (let x = x0; x <= x1; x += 1) { const a = Ps(x), b = Ps(x + 1); const k = Math.ceil(a / 4) * 4; if (k <= b && k > a) ticks.push([x, k]); }
    c.strokeStyle = P.ink; c.lineWidth = 2;
    ticks.forEach(([x, k], i) => {
      c.beginPath(); c.moveTo(x, yb - 2); c.lineTo(x, yb + 10); c.stroke();
      const show = nb ? i % 2 === 0 : true;
      if (show) txt(c, String(k), x, yb + 24, { size: 11.5, color: P.ink, align: 'center' });
    });
    // Wind strongest where the ticks are densest (middle), weak near the centres.
    const xm = (x0 + x1) / 2;
    flow(c, [[x1 - 60, yb - 14], [xm + 40, yb - 14], [xm - 40, yb - 14], [x0 + 60, yb - 14]], '#d0553a', 4, t, 60);
    tag(c, 'ветер от H к L', xm, yb - 26, '#d0553a');
    txt(c, nb ? 'изобары на карте: гуще в середине, там ветер сильнее' : 'Изобары на карте у поверхности моря, через 4 гПа: где они гуще, там ветер сильнее', 8, h - 10, { size: 12.5, color: P.ink, weight: 600, max: w - 16 });
    p._out = { ticks: ticks.length };
  }


  // ------------------------------------------------------------------ global and regional models
  // Grid and forecast range from the lecture table «Основные модели» (models used for the Adriatic).
  const MODELS = [
    ['GFS', 13, 16, 'g'], ['AIFS (нейросеть)', 28, 15, 'g'], ['ECMWF IFS', 9, 10, 'g'], ['ICON', 13, 7.5, 'g'], ['UKMO', 10, 7, 'g'],
    ['ICON-EU', 7, 5, 'r'], ['Swiss HD', 2, 3, 'r'], ['ICON-D2', 2, 2, 'r'], ['AROME', 1.3, 2, 'r'],
  ];
  // Which models to read at a given lead time, days.
  function modelsFor(lead) {
    if (lead <= 2) return ['AROME', 'ICON-D2', 'Swiss HD'];
    if (lead <= 5) return ['ICON-EU', 'ECMWF IFS', 'ICON'];
    return ['ECMWF IFS', 'GFS', 'ICON', 'UKMO'];
  }
  function drawModels(c, w, h, p) {
    const nb = w < 620, lead = p.lead, use = modelsFor(lead);
    const cw = nb ? w : w * 0.58, x0 = nb ? 112 : 136, x1 = cw - 18, top = 34, rowH = nb ? 24 : 27;
    const X = (d) => x0 + (x1 - x0) * Math.sqrt(d / 16); // square-root scale gives the first days more room
    c.fillStyle = '#f7f9fb'; c.fillRect(0, 0, w, h);
    txt(c, 'Сетка и горизонт прогноза', 10, 20, { size: 14, weight: 700 });
    const yAxis = top + MODELS.length * rowH + 14;
    c.strokeStyle = 'rgba(28,42,68,0.15)'; c.lineWidth = 1;
    for (const d of [0, 1, 2, 3, 5, 7, 10, 16]) {
      const x = X(d); c.beginPath(); c.moveTo(x, top - 4); c.lineTo(x, yAxis - 8); c.stroke();
      txt(c, d === 0 ? '0' : `${d}`, x, yAxis + 4, { size: 11.5, color: P.grey, align: 'center' });
    }
    txt(c, 'сутки вперёд', x1, yAxis + 20, { size: 11.5, color: P.grey, align: 'right' });
    MODELS.forEach(([name, km, days, kind], i) => {
      const y = top + i * rowH, on = use.includes(name), reach = days >= lead, col = kind === 'g' ? P.blue : P.orange;
      if (i === 5) { c.strokeStyle = 'rgba(28,42,68,0.35)'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(6, y - 2); c.lineTo(x1, y - 2); c.stroke(); c.setLineDash([]); }
      c.globalAlpha = reach ? (on ? 1 : 0.45) : 0.15;
      c.fillStyle = col; c.fillRect(X(0), y + 4, X(days) - X(0), rowH - 9);
      c.globalAlpha = 1;
      txt(c, name, x0 - 8, y + rowH / 2 + 4, { size: nb ? 11.5 : 12.5, weight: on ? 700 : 500, color: reach ? P.ink : P.soft, align: 'right' });
      const lab = `${String(km).replace('.', ',')} км`, bx = X(days);
      txt(c, lab, bx + 4 < x1 - 40 ? bx + 4 : bx - 4, y + rowH / 2 + 4, { size: 11.5, weight: 600, color: bx + 4 < x1 - 40 ? P.grey : '#fff', align: bx + 4 < x1 - 40 ? 'left' : 'right' });
    });
    c.font = FONT(11.5, 700);
    txt(c, 'региональные', x1, 20, { size: 11.5, color: P.orange, weight: 700, align: 'right' });
    txt(c, 'глобальные', x1 - c.measureText('региональные').width - 14, 20, { size: 11.5, color: P.blue, weight: 700, align: 'right' });
    // Lead-time cursor.
    const xc = X(lead);
    c.strokeStyle = P.red; c.lineWidth = 2; c.beginPath(); c.moveTo(xc, top - 6); c.lineTo(xc, yAxis - 6); c.stroke();
    tag(c, lead < 1 ? `через ${Math.round(lead * 24)} ч` : `через ${String(lead).replace('.', ',')} сут`, xc, top - 8, P.red, { align: xc > x1 - 60 ? 'right' : 'center' });
    // The bay under the grid of the chosen model.
    const g = p.grid, bx0 = nb ? 10 : cw + 16, by0 = nb ? yAxis + 50 : 40;
    const bh = Math.min((nb ? w - 20 : w - cw - 26) * 0.75, h - by0 - 50), bw = bh / 0.75;
    const BX = (x) => bx0 + (x / 40) * bw, BY = (y) => by0 + bh - (y / 30) * bh;
    txt(c, `Бухта на сетке ${String(g).replace('.', ',')} км`, bx0, by0 - 10, { size: 14, weight: 700 });
    c.fillStyle = P.planLand; c.fillRect(bx0, by0, bw, bh);
    c.fillStyle = P.seaPlan; c.beginPath(); Bay.SEA.forEach(([x, y], i) => (i ? c.lineTo(BX(x), BY(y)) : c.moveTo(BX(x), BY(y)))); c.closePath(); c.fill();
    c.fillStyle = P.planLand; c.beginPath(); Bay.ISLAND.forEach(([x, y], i) => (i ? c.lineTo(BX(x), BY(y)) : c.moveTo(BX(x), BY(y)))); c.closePath(); c.fill();
    c.strokeStyle = g >= 5 ? 'rgba(28,42,68,0.55)' : 'rgba(28,42,68,0.22)'; c.lineWidth = g >= 5 ? 1.5 : 0.8;
    for (let x = 0; x <= 40.01; x += g) { c.beginPath(); c.moveTo(BX(x), by0); c.lineTo(BX(x), by0 + bh); c.stroke(); }
    for (let y = 0; y <= 30.01; y += g) { c.beginPath(); c.moveTo(bx0, BY(y)); c.lineTo(bx0 + bw, BY(y)); c.stroke(); }
    c.strokeStyle = P.ink; c.lineWidth = 1; c.strokeRect(bx0, by0, bw, bh);
    const n = Math.round((40 / g) * (30 / g));
    lines(c, [`${n} ${n % 10 === 1 && n % 100 !== 11 ? 'ячейка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'ячейки' : 'ячеек'} на карту 40 × 30 км.`,
      g >= 5 ? 'Пролив и мыс меньше ячейки: модель их не видит.' : 'Видны пролив, мыс и долины.'], bx0, by0 + bh + 20, 17, { size: 12.5, color: P.ink });
    p._out = { use };
  }

  // ------------------------------------------------------------------ class
  const DRAW = { isobars: drawIsobars, heat: drawHeat, beaufort: drawBeaufort, fog: drawFog, synoptic: drawSynoptic, fronts: drawFronts, breeze: drawBreeze, katabatic: drawKatabaticPlan, bora: drawBora, terrain: drawTerrain, convection: drawConvection, resolution: drawResolution, models: drawModels };
  const HEIGHT = { isobars: [360, 400], heat: [460, 520], beaufort: [360, 520], fog: [340, 520], synoptic: [520, 460], fronts: [600, 640], breeze: [520, 640], katabatic: [600, 610], bora: [340, 340], terrain: [260, 700], convection: [460, 540], resolution: [330, 340], models: [360, 700] };
  const TITLES = {
    heat: 'Море и суша в разрезе: нагрев, подъём воздуха, давление',
    isobars: 'Разрез от циклона к антициклону: поверхности одинакового давления',
    beaufort: 'Шкала Бофорта: море, паруса и флажок ветра', fog: 'Туман: температура, точка росы и где он ложится',
    synoptic: 'Синоптическая карта: изобары, центры давления, фронты, ветер', fronts: 'Фронт в разрезе с запада на восток и запись на яхте', breeze: 'Бриз в разрезе и сумма ветров у берега',
    katabatic: 'Склон в разрезе и долина сверху', bora: 'Бора в разрезе: плато — хребет — море', terrain: 'Рельеф: мыс, пролив, высокий берег',
    convection: 'Гроза над морем: от облака до шквала', resolution: 'Рельеф в разрезе: факт и модель',
  };

  class Section {
    constructor(container, opts = {}) {
      this.opts = opts;
      this.box = document.createElement('figure'); this.box.className = 'section' + (opts.big ? ' section-big' : '');
      this.cap = document.createElement('figcaption'); this.cap.className = 'section-title';
      this.canvas = document.createElement('canvas'); this.canvas.className = 'section-canvas';
      this.canvas.setAttribute('role', 'img');
      this.box.append(this.cap, this.canvas); container.appendChild(this.box);
      this.type = null; this.p = null; this.alive = true; this._vis = true;
      this._io = new IntersectionObserver((e) => { this._vis = e[0].isIntersecting; }); this._io.observe(this.box);
      if (opts.onPoint) this._pointer(opts.onPoint);
      this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    }
    _pointer(cb) {
      const cv = this.canvas; cv.style.touchAction = 'pan-y'; cv.style.cursor = 'crosshair';
      let d = null;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0.02, 0.98), clamp((e.clientY - r.top) / r.height, 0.02, 0.98)]; };
      cv.addEventListener('pointerdown', (e) => { d = { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' }; if (d.mouse) cb(pos(e)); });
      cv.addEventListener('pointermove', (e) => { if (d && d.mouse && e.buttons) cb(pos(e)); });
      cv.addEventListener('pointerup', (e) => { if (d && !d.mouse && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) cb(pos(e)); d = null; });
    }
    set(type, p) {
      this.type = type; this.p = p; this.box.hidden = !type;
      if (type) { this.cap.textContent = TITLES[type]; this.canvas.setAttribute('aria-label', TITLES[type]); }
      this._dirty = true;
      if (type) this._draw(performance.now()); // draw now so derived values (p._out) are ready
    }
    _draw(now) {
      const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const w = Math.max(280, this.canvas.clientWidth || 600), hh = HEIGHT[this.type], h = w < 620 ? hh[1] : hh[0];
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.canvas.style.height = h + 'px'; }
      const c = this.canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      c.fillStyle = P.card; c.fillRect(0, 0, w, h);
      CW = w;
      DRAW[this.type](c, w, h, this.p, reduced ? 0 : now / 1000);
    }
    _loop(now) {
      if (!this.alive) return;
      requestAnimationFrame(this._loop);
      if (!this.type || !this._vis) return;
      const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced && !this._dirty) return;
      if (now - (this._lastT || 0) < 33 && !this._dirty) return;
      this._lastT = now; this._dirty = false;
      this._draw(now);
    }
  }

  globalThis.Section = Section;
  globalThis.Schemes = { modelsFor, heatOut, BF, bfOf, fogState, visibility, synField, frontWx, frontStage, FRONT, FRONT_TEXT, CONV };
})();
