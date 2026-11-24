// Small DOM helpers, controls, wind readout and a line chart for meteograms.
(function () {
  const Wind = globalThis.Wind;

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }

  function fmtTime(h) {
    const day = Math.floor(h / 24), m = Math.round((h - day * 24) * 60);
    const hh = Math.floor(m / 60) % 24, mm = m % 60;
    const t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return day > 0 ? `завтра ${t}` : t;
  }
  const fmtNum = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
  const fmtDir = (d) => (d == null ? 'штиль' : `${Wind.compass(d)} ${Math.round(d / 5) * 5 % 360}°`);

  let uid = 0;
  // def: { id, type: range|dir|toggle|seg|button, label, min, max, step, value, fmt, options:[[value,label]] }
  function control(def, value, onChange) {
    const id = `c${++uid}-${def.id}`;
    if (def.type === 'toggle') {
      const input = el('input', { type: 'checkbox', id, checked: !!value });
      input.addEventListener('change', () => onChange(input.checked));
      return el('label', { class: 'ctl ctl-toggle', for: id }, input, el('span', { class: 'switch', 'aria-hidden': 'true' }), el('span', {}, def.label));
    }
    if (def.type === 'seg') {
      const wrap = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': def.label });
      const set = (v) => { for (const b of wrap.children) b.setAttribute('aria-checked', String(b.dataset.v === String(v))); };
      for (const [v, label] of def.options) {
        const b = el('button', { type: 'button', role: 'radio', 'data-v': String(v) }, label);
        b.addEventListener('click', () => { set(v); onChange(v); });
        wrap.append(b);
      }
      set(value);
      return el('div', { class: 'ctl' }, el('div', { class: 'ctl-label' }, def.label), wrap);
    }
    if (def.type === 'button') {
      return el('button', { type: 'button', class: 'btn', onclick: () => onChange() }, def.label);
    }
    const isDir = def.type === 'dir';
    const min = isDir ? 0 : def.min, max = isDir ? 355 : def.max, step = isDir ? 5 : def.step;
    const out = el('output', { for: id, class: 'ctl-value' });
    const show = (v) => {
      out.textContent = isDir ? fmtDir(+v) : def.fmt === 'time' ? fmtTime(+v) : def.fmt ? def.fmt(+v) : `${fmtNum(+v)} ${def.unit || ''}`;
    };
    const input = el('input', { type: 'range', id, min, max, step, value });
    input.addEventListener('input', () => { show(input.value); onChange(+input.value); });
    show(value);
    return el('div', { class: 'ctl' }, el('div', { class: 'ctl-row' }, el('label', { for: id, class: 'ctl-label' }, def.label), out), input);
  }

  class Readout {
    constructor(container) {
      this.root = el('div', { class: 'readout' });
      this.live = el('div', { class: 'sr-only', 'aria-live': 'polite' });
      this.barb = el('canvas', { class: 'readout-barb', width: 128, height: 128, 'aria-hidden': 'true' });
      this.main = el('div', { class: 'readout-main' });
      this.extra = el('div', { class: 'readout-extra' });
      this.root.append(el('div', { class: 'readout-top' }, this.barb, this.main), this.extra, this.live);
      container.append(this.root);
    }
    update(w, extra = [], title = 'Ветер у яхты') {
      const bf = Wind.beaufort(w.speed);
      this.main.innerHTML = '';
      this.main.append(
        el('div', { class: 'ro-title' }, title),
        el('div', { class: 'ro-big' },
          el('span', { class: 'ro-num', style: `--c:${globalThis.Draw.speedCSS(w.speed)}` }, fmtNum(w.speed)), el('span', { class: 'ro-unit' }, 'уз'),
          el('span', { class: 'ro-gust' }, 'порывы ', el('b', {}, fmtNum(w.gust)), ' уз')),
        el('div', { class: 'ro-meta' },
          w.speed < 1 ? 'штиль' : w.variable ? 'направление переменное' : `${fmtDir(w.dir)} (откуда)`, ' · ', `${bf} ${bfWord(bf)}`, ' · ', `${fmtNum(w.speed * 0.514, 1)}\u00a0м/с`),
      );
      clearTimeout(this._lt);
      this._lt = setTimeout(() => { this.live.textContent = `${title}: ${fmtNum(w.speed)} ${knots(w.speed)}, порывы ${fmtNum(w.gust)}`; }, 700);
      const c = this.barb.getContext('2d');
      c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 64, 64);
      globalThis.Draw.drawBarb(c, 32, 40, w.dir, w.speed, 28, globalThis.Draw.css('--ink'));
      this.extra.innerHTML = '';
      for (const line of extra) {
        if (!line) continue;
        this.extra.append(typeof line === 'string' ? el('div', { class: 'ro-line' }, line) : line);
      }
    }
  }
  function knots(v) { const n = Math.round(v), d = n % 10, dd = n % 100; return dd >= 11 && dd <= 14 ? 'узлов' : d === 1 ? 'узел' : d >= 2 && d <= 4 ? 'узла' : 'узлов'; }
  function bfWord(b) {
    const n = b % 10, nn = b % 100;
    const word = nn >= 11 && nn <= 14 ? 'баллов' : n === 1 ? 'балл' : n >= 2 && n <= 4 ? 'балла' : 'баллов';
    return `${word}, ${Wind.BF_NAMES[b]}`;
  }

  // Line chart. opts: { x0, x1, y0, y1, xfmt, yfmt, xstep, ystep, bands:[{xs, lo, hi, color}],
  //   lines:[{xs, ys, color, width, dash, alpha}], hlines:[{y, color, dash, label}], cursor, marks:[{x, label, color}] }
  function chart(canvas, o) {
    canvas._opts = o;
    if (!canvas._ro && typeof ResizeObserver !== 'undefined') {
      let lastW = canvas.clientWidth;
      canvas._ro = new ResizeObserver(() => { if (canvas.clientWidth && canvas.clientWidth !== lastW) { lastW = canvas.clientWidth; chart(canvas, canvas._opts); } });
      canvas._ro.observe(canvas);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 220;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const css = globalThis.Draw.css;
    const L = 38, R = 10, T = 12, B = 26;
    const X = (x) => L + ((x - o.x0) / (o.x1 - o.x0)) * (w - L - R);
    const Y = (y) => T + (1 - (y - o.y0) / (o.y1 - o.y0)) * (h - T - B);
    c.font = '12px "IBM Plex Sans", system-ui, sans-serif';
    c.strokeStyle = css('--grid'); c.fillStyle = css('--muted'); c.lineWidth = 1;
    for (let y = o.y0; y <= o.y1 + 1e-6; y += o.ystep) {
      c.beginPath(); c.moveTo(L, Y(y)); c.lineTo(w - R, Y(y)); c.stroke();
      c.textAlign = 'right'; c.fillText(o.yfmt ? o.yfmt(y) : String(y), L - 5, Y(y) + 4);
    }
    for (let x = Math.ceil(o.x0 / o.xstep) * o.xstep; x <= o.x1 + 1e-6; x += o.xstep) {
      c.beginPath(); c.moveTo(X(x), T); c.lineTo(X(x), h - B); c.stroke();
      c.textAlign = 'center'; c.fillText(o.xfmt ? o.xfmt(x) : String(x), X(x), h - B + 15);
    }
    c.save(); c.beginPath(); c.rect(L, T, w - L - R, h - T - B); c.clip();
    for (const b of o.bands || []) {
      c.fillStyle = b.color; c.beginPath();
      b.xs.forEach((x, i) => (i ? c.lineTo(X(x), Y(b.hi[i])) : c.moveTo(X(x), Y(b.hi[i]))));
      for (let i = b.xs.length - 1; i >= 0; i--) c.lineTo(X(b.xs[i]), Y(b.lo[i]));
      c.closePath(); c.fill();
    }
    for (const hl of o.hlines || []) {
      c.strokeStyle = hl.color; c.setLineDash(hl.dash || [4, 4]); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(L, Y(hl.y)); c.lineTo(w - R, Y(hl.y)); c.stroke(); c.setLineDash([]);
      if (hl.label) { c.fillStyle = hl.color; c.textAlign = 'left'; c.fillText(hl.label, L + 4, Y(hl.y) - 4); }
    }
    for (const ln of o.lines || []) {
      c.strokeStyle = ln.color; c.lineWidth = ln.width || 1.5; c.globalAlpha = ln.alpha ?? 1; c.setLineDash(ln.dash || []);
      c.beginPath();
      let pen = false;
      ln.xs.forEach((x, i) => { const y = ln.ys[i]; if (y == null) { pen = false; return; } pen ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)); pen = true; });
      c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
    }
    for (const m of o.marks || []) {
      c.fillStyle = m.color; c.beginPath(); c.arc(X(m.x), Y(m.y), 4, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    if (o.cursor != null) {
      c.strokeStyle = css('--ink'); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(X(o.cursor), T); c.lineTo(X(o.cursor), h - B); c.stroke();
    }
    if (o.ylabel) { c.fillStyle = css('--muted'); c.textAlign = 'left'; c.fillText(o.ylabel, L + 4, T + 10); }
  }

  globalThis.UI = { el, fmtTime, fmtNum, fmtDir, control, Readout, chart, bfWord };
})();
