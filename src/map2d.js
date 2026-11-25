// Flat forecast map in the style of forecast services: wind speed as a colour field over sea and land,
// streaks moving with the wind, coastline, route and marks. North up, drawn on a 2D canvas.
//   set({ wind, precip, route, probe, marks, tag }), wind(x, y) -> { u, v, speed }, precip(x, y) -> dBZ
(function () {
  const Bay = globalThis.Bay, Draw = globalThis.Draw;
  const W = Bay.W, H = Bay.H;
  const GX = 161, GY = 121, GD = W / (GX - 1); // field grid, 0.25 km
  const MW = 960, MH = 720; // land mask and coastline, px
  const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let LAND = null; // shared: land shading and coastline image

  function landImage() {
    if (LAND) return LAND;
    const c = document.createElement('canvas'); c.width = MW; c.height = MH;
    const g = c.getContext('2d'), img = g.createImageData(MW, MH), d = img.data, land = new Uint8Array(MW * MH);
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) land[j * MW + i] = Bay.elev(((i + 0.5) / MW) * W, H - ((j + 0.5) / MH) * H) > 0 ? 1 : 0;
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      const k = j * MW + i, q = k * 4;
      let edge = false;
      if (land[k]) for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < MW && jj < MH && !land[jj * MW + ii]) { edge = true; break; } }
      if (edge) { d[q] = 20; d[q + 1] = 34; d[q + 2] = 52; d[q + 3] = 230; }
      else if (land[k]) { d[q] = 30; d[q + 1] = 30; d[q + 2] = 20; d[q + 3] = 34; } // land a little darker than the sea
    }
    g.putImageData(img, 0, 0);
    LAND = c;
    return c;
  }

  class FlatMap {
    constructor(box, opts) {
      this.opts = opts || {};
      this.wrap = document.createElement('div'); this.wrap.className = 'flat-map';
      this.cv = document.createElement('canvas'); this.cv.setAttribute('role', 'img'); this.cv.setAttribute('aria-label', 'Карта прогноза ветра');
      this.tagEl = document.createElement('div'); this.tagEl.className = 'map-tag';
      this.legend = document.createElement('div'); this.legend.className = 'radar-legend'; this.legend.hidden = true;
      this.legend.innerHTML = '<b>Осадки по модели</b><span class="rl-bar">' + Draw.RADAR.map(([, c]) => `<i style="background:rgb(${c[0]},${c[1]},${c[2]})"></i>`).join('') + '</span><span class="rl-lab"><span>слабый дождь</span><span>ливень</span><span>гроза</span></span>';
      this.waveLegend = document.createElement('div'); this.waveLegend.className = 'radar-legend'; this.waveLegend.hidden = true;
      this.waveLegend.innerHTML = '<b>Волна по модели, м</b><span class="rl-bar">' + Draw.WAVE.map(([, c]) => `<i style="background:rgb(${c[0]},${c[1]},${c[2]})"></i>`).join('') + '</span><span class="rl-lab">' + Draw.WAVE.filter((q, i) => i % 2 === 0).map(([h]) => `<span>${String(h).replace('.', ',')}</span>`).join('') + '</span>';
      this.wrap.append(this.cv, this.tagEl, this.legend, this.waveLegend);
      box.appendChild(this.wrap);
      this.field = document.createElement('canvas'); this.field.width = GX; this.field.height = GY;
      this.trail = document.createElement('canvas');
      this.U = new Float32Array(GX * GY); this.V = new Float32Array(GX * GY);
      this.st = {};
      const N = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 500 : 1000;
      this.P = Array.from({ length: N }, () => this._spawn({}));
      this.cv.addEventListener('pointerdown', (e) => { this._d = { x: e.clientX, y: e.clientY }; });
      this.cv.addEventListener('pointerup', (e) => {
        if (!this._d || Math.hypot(e.clientX - this._d.x, e.clientY - this._d.y) > 8) return;
        const r = this.cv.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W, y = H - ((e.clientY - r.top) / r.height) * H;
        if (this.opts.onClick) this.opts.onClick([x, y]);
      });
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => this._resize()).observe(this.wrap);
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    set(st) {
      this.st = st;
      this.tagEl.textContent = st.tag || ''; this.tagEl.hidden = !st.tag;
      this.legend.hidden = !st.precip; this.waveLegend.hidden = !st.color;
      const img = this.field.getContext('2d').createImageData(GX, GY), d = img.data;
      for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
        const x = i * GD, y = H - j * GD, k = j * GX + i, q = k * 4, w = st.wind ? st.wind(x, y) : { u: 0, v: 0, speed: 0 };
        const f = st.flow ? st.flow(x, y) : null;
        this.U[k] = f ? f[0] : w.u; this.V[k] = f ? f[1] : w.v;
        let c;
        if (st.precip) { // rain layer: rain colours on a grey map, as in forecast apps
          const z = st.precip(x, y), r = Draw.radarRGBA(z), a = r ? r[3] / 255 : 0, g = [206, 212, 218];
          c = r ? [0, 1, 2].map((n) => Math.round(g[n] * (1 - a) + r[n] * a)) : g;
        } else c = st.color ? st.color(x, y) : Draw.speedRGB(w.speed);
        d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
      }
      this.field.getContext('2d').putImageData(img, 0, 0);
      this._resize();
    }

    _resize() {
      const w = this.wrap.clientWidth;
      if (!w) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1), h = Math.round(w * (H / W));
      if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) {
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.cv.style.height = `${h}px`;
        this.trail.width = this.cv.width; this.trail.height = this.cv.height;
      }
      this.dpr = dpr;
    }

    _spawn(p) { p.x = Math.random() * W; p.y = Math.random() * H; p.age = 0; p.max = 40 + Math.random() * 60; return p; }
    _uv(x, y) {
      const fx = Math.min(GX - 1.001, Math.max(0, x / GD)), fy = Math.min(GY - 1.001, Math.max(0, (H - y) / GD));
      const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * GX + i, U = this.U, V = this.V;
      const b = (A) => (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + GX] * (1 - tx) + A[k + GX + 1] * tx) * ty;
      return [b(U), b(V)];
    }

    _loop() {
      requestAnimationFrame(this._loop);
      if (!this.wrap.offsetParent || !this.cv.width) return;
      const c = this.cv.getContext('2d'), cw = this.cv.width, ch = this.cv.height, dpr = this.dpr || 1;
      const X = (x) => (x / W) * cw, Y = (y) => ((H - y) / H) * ch;
      // Streaks: fade the old trails, then move each particle with the wind (10 kt is about 1.5 px per frame).
      const t = this.trail.getContext('2d');
      t.globalCompositeOperation = 'destination-in'; t.fillStyle = 'rgba(0,0,0,0.86)'; t.fillRect(0, 0, cw, ch);
      t.globalCompositeOperation = 'source-over';
      if (!REDUCED) {
        t.strokeStyle = this.st.precip ? 'rgba(30,44,60,0.5)' : 'rgba(255,255,255,0.75)'; t.lineWidth = 1 * dpr; t.beginPath();
        const k = 0.0062;
        for (const p of this.P) {
          const [u, v] = this._uv(p.x, p.y), sp = Math.hypot(u, v);
          const nx = p.x + u * k, ny = p.y + v * k;
          if (++p.age > p.max || sp < 0.4 || nx < 0 || ny < 0 || nx > W || ny > H) { this._spawn(p); continue; }
          t.moveTo(X(p.x), Y(p.y)); t.lineTo(X(nx), Y(ny));
          p.x = nx; p.y = ny;
        }
        t.stroke();
      }
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(this.field, 0, 0, cw, ch);
      c.drawImage(landImage(), 0, 0, cw, ch);
      c.drawImage(this.trail, 0, 0);
      this._overlays(c, X, Y, dpr);
    }

    _overlays(c, X, Y, dpr) {
      const st = this.st, ink = '#12263a';
      c.font = `600 ${12 * dpr}px "IBM Plex Sans", system-ui, sans-serif`; c.textBaseline = 'middle';
      const label = (txt, x, y, fg, bg) => {
        const w = c.measureText(txt).width + 10 * dpr, h = 18 * dpr;
        c.fillStyle = bg; c.fillRect(x - w / 2, y - h / 2, w, h);
        c.fillStyle = fg; c.textAlign = 'center'; c.fillText(txt, x, y + 0.5 * dpr);
      };
      // Place names, small and quiet.
      c.font = `italic 600 ${12 * dpr}px "Source Serif 4", Georgia, serif`; c.fillStyle = 'rgba(15,40,64,0.75)'; c.textAlign = 'center';
      const S0 = Bay.STRAIT;
      for (const [t, x, y] of [['пролив Узкий', (S0.a[0] + S0.b[0]) / 2 + 2.6, (S0.a[1] + S0.b[1]) / 2], ['мыс Острый', Bay.CAPE.x - 2.6, Bay.CAPE.y + 1.2]]) c.fillText(t, X(x), Y(y));
      c.font = `600 ${12 * dpr}px "IBM Plex Sans", system-ui, sans-serif`;
      if (st.route && st.route.length > 1) {
        c.lineJoin = 'round'; c.lineCap = 'round';
        for (const [col, lw] of [['rgba(255,255,255,0.9)', 5], [ink, 2.5]]) {
          c.strokeStyle = col; c.lineWidth = lw * dpr; c.beginPath();
          st.route.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.stroke();
        }
      }
      // Marina (circle) and harbour (square), as on the 3D map.
      c.fillStyle = '#fff'; c.strokeStyle = ink; c.lineWidth = 2.5 * dpr;
      c.beginPath(); c.arc(X(Bay.MARINA.x), Y(Bay.MARINA.y), 7 * dpr, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#a3246f'; c.fillRect(X(Bay.HARBOUR.x) - 7 * dpr, Y(Bay.HARBOUR.y) - 7 * dpr, 14 * dpr, 14 * dpr);
      c.strokeStyle = '#fff'; c.lineWidth = 2 * dpr; c.strokeRect(X(Bay.HARBOUR.x) - 7 * dpr, Y(Bay.HARBOUR.y) - 7 * dpr, 14 * dpr, 14 * dpr);
      if (st.probe) {
        const px = X(st.probe[0]), py = Y(st.probe[1]);
        c.strokeStyle = '#e0621c'; c.lineWidth = 2.5 * dpr; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 18 * dpr); c.stroke();
        c.fillStyle = '#e0621c'; c.beginPath(); c.arc(px, py - 18 * dpr, 5 * dpr, 0, Math.PI * 2); c.fill();
      }
      if (st.arrows) { // wave direction on a 2.5 km grid over the water
        for (let y = 1.25; y < H; y += 2.5) for (let x = 1.25; x < W; x += 2.5) {
          if (Bay.isLand(x, y)) continue;
          const a = st.arrows(x, y); if (!a || !a.h) continue;
          const L = (10 + Math.min(3, a.h) * 7) * dpr;
          Draw.drawArrow(c, X(x), Y(y), a.u, a.v, L, 'rgba(255,255,255,0.9)', 4 * dpr);
          Draw.drawArrow(c, X(x), Y(y), a.u, a.v, L, ink, 1.6 * dpr);
        }
      }
      for (const m of st.marks || []) {
        const px = X(m.x), py = Y(m.y);
        c.strokeStyle = '#a3246f'; c.lineWidth = 2 * dpr; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 16 * dpr); c.stroke();
        c.fillStyle = '#a3246f'; c.beginPath(); c.arc(px, py, 3 * dpr, 0, Math.PI * 2); c.fill();
        label(m.text, px, py - 25 * dpr, m.on ? '#fff' : '#a3246f', m.on ? '#a3246f' : 'rgba(255,255,255,0.95)');
      }
    }
  }

  globalThis.FlatMap = FlatMap;
})();
