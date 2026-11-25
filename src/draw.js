// Shared 2D drawing helpers: speed colour scale, theme tokens, wind barb, arrow.
(function () {
  const SCALE = [
    [0, [222, 231, 237]], [5, [135, 198, 232]], [10, [82, 182, 138]], [15, [226, 208, 74]],
    [20, [240, 160, 48]], [25, [229, 96, 46]], [30, [200, 40, 60]], [40, [150, 30, 120]], [55, [80, 20, 100]],
  ];
  function speedRGB(kn) {
    if (!(kn > SCALE[0][0])) return SCALE[0][1];
    for (let i = 1; i < SCALE.length; i++) {
      if (kn <= SCALE[i][0]) {
        const [k0, c0] = SCALE[i - 1], [k1, c1] = SCALE[i], t = (kn - k0) / (k1 - k0);
        return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * t));
      }
    }
    return SCALE[SCALE.length - 1][1];
  }
  const speedCSS = (kn, a = 1) => { const c = speedRGB(kn); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
  function hexRGB(hex) {
    const m = hex.replace('#', '');
    const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function drawBarb(ctx, x, y, dir, kn, len, color, width) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || Math.max(1.2, len / 22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (dir == null || kn < 2.5) { ctx.beginPath(); ctx.arc(x, y, len * 0.18, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); return; }
    ctx.translate(x, y);
    ctx.rotate((dir * Math.PI) / 180);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
    let n = Math.round(kn / 5) * 5, pos = -len;
    const step = len * 0.16, fl = len * 0.42;
    while (n >= 50) { ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(fl, pos + step * 0.5); ctx.lineTo(0, pos + step); ctx.closePath(); ctx.fill(); if (width) ctx.stroke(); pos += step * 1.25; n -= 50; }
    while (n >= 10) { ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(fl, pos - step * 0.6); ctx.stroke(); pos += step; n -= 10; }
    if (n >= 5) { if (pos === -len) pos += step; ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(fl * 0.5, pos - step * 0.3); ctx.stroke(); }
    ctx.restore();
  }

  // Arrow centred at (x, y) along (u, v) with v pointing up on screen.
  function drawArrow(ctx, x, y, u, v, scale, color, width) {
    const L = Math.hypot(u, v);
    if (L < 1e-6) return;
    const dx = (u / L) * scale, dy = -(v / L) * scale;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - dx / 2, y - dy / 2); ctx.lineTo(x + dx / 2, y + dy / 2); ctx.stroke();
    const a = Math.atan2(dy, dx), hx = x + dx / 2, hy = y + dy / 2, hl = Math.max(5, Math.min(10, scale * 0.35));
    ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * 2, hy + Math.sin(a) * 2);
    ctx.lineTo(hx - hl * Math.cos(a - 0.5), hy - hl * Math.sin(a - 0.5));
    ctx.lineTo(hx - hl * Math.cos(a + 0.5), hy - hl * Math.sin(a + 0.5));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // Radar and precipitation classes: dBZ threshold and RGBA colour, from light rain to a thunderstorm core.
  const RADAR = [[12, [150, 220, 130, 150]], [20, [70, 185, 75, 180]], [28, [25, 140, 55, 195]], [35, [240, 215, 45, 215]], [42, [245, 145, 30, 225]], [48, [220, 45, 40, 235]], [55, [170, 25, 150, 240]]];
  function radarRGBA(z) { let c = null; for (const [z0, rgba] of RADAR) if (z >= z0) c = rgba; return c; }
  // Wave height scale, metres.
  const WAVE = [[0, [222, 231, 237]], [0.5, [135, 198, 232]], [1, [82, 182, 138]], [1.5, [226, 208, 74]], [2, [240, 160, 48]], [3, [210, 60, 50]], [4, [150, 30, 120]]];
  function waveRGB(h) {
    if (!(h > 0)) return WAVE[0][1];
    for (let i = 1; i < WAVE.length; i++) if (h <= WAVE[i][0]) { const [a, ca] = WAVE[i - 1], [b, cb] = WAVE[i], t = (h - a) / (b - a); return [0, 1, 2].map((j) => Math.round(ca[j] + (cb[j] - ca[j]) * t)); }
    return WAVE[WAVE.length - 1][1];
  }
  globalThis.Draw = { speedRGB, speedCSS, css, hexRGB, drawBarb, drawArrow, RADAR, radarRGBA, waveRGB, WAVE };
})();
