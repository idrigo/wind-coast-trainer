// Final passage: choose a scenario, read the forecast from several sources, plan the route, fill the
// pre-departure checklist, decide (go, wait, change the route or stay), sail in the "real" weather and
// compare forecast with what happened, item by item.
(function () {
  const { el, fmtNum, fmtTime, control, Readout, chart } = globalThis.UI;
  const Wind = globalThis.Wind, Bay = globalThis.Bay, Ens = globalThis.Ens;
  const LIMITS = { mean: 25, gust: 35 };
  const KM_PER_MIN_PER_KN = 1.852 / 60;
  const STEPS = ['Ситуация', 'Прогноз', 'Маршрут', 'Чек-лист', 'Решение', 'Переход', 'Разбор'];

  const DESCR = {
    summer: 'Слабый градиент, ясно, жарко. Утром стоковый ветер из долин, днём бриз, к вечеру над горами грозы.',
    bora: 'Холодный воздух на плато, антициклон за хребтом, циклон над морем. Бора с ночи, ослабление к утру завтра.',
    front: 'С северо-запада идёт холодный фронт. До него юго-западный ветер крепчает, за ним шквал и порывистый северо-запад.',
  };
  const BULLETIN = {
    summer: 'ПРОГНОЗ ДЛЯ ПРИБРЕЖНЫХ ВОД. Выпуск 06:00.\nВетер N–NW 3–8 уз, днём у берега бриз SW–W 10–14 уз.\nВолна 0,3–0,5 м.\nПосле 15:00 над горами возможны грозы, при грозе шквалы до 35 уз.\nВидимость хорошая, при грозе плохая.',
    bora: 'ШТОРМОВОЕ ПРЕДУПРЕЖДЕНИЕ. Выпуск 06:00.\nБора NE 25–35 уз, порывы до 55 уз во Внутреннем заливе,\nв проливе Узком и у подножия хребта.\nВ открытом море NE 12–20 уз.\nОслабление ночью и утром завтра.\nУ берега волна до 0,5 м, мористее 1–1,5 м.',
    front: 'ПРЕДУПРЕЖДЕНИЕ О СИЛЬНОМ ВЕТРЕ. Выпуск 06:00.\nХолодный фронт. До фронта SW 15–22 уз, порывы до 28 уз.\nПрохождение фронта около 14:00 ± 2–3 ч: шквалы до 40 уз, ливень, гроза.\nПосле фронта NW 20–27 уз, порывы 35 уз, ослабление к вечеру.\nВолна 1,5–2,5 м.',
  };

  // What the crew sees in the marina on the morning of departure (signs from the lecture).
  const OBS = {
    summer: ['Небо ясное, к 10:00 над хребтом первые кучевые.', 'Барометр за 3 ч не изменился.', 'Температура 24 °C, точка росы 16 °C.'],
    bora: ['На гребне облачная шапка, горы видны резко.', 'Холодно и сухо.', 'Температура 3 °C, точка росы −8 °C.'],
    front: ['Перистые сгущаются, вокруг солнца гало. Зыбь с юго-запада.', 'Барометр за 3 ч упал на 4 гПа.', 'Температура 18 °C, точка росы 14 °C.'],
  };

  // Hour when the front passes the cape for ensemble member p.
  function frontAtCape(scn, p) {
    const F = scn.stateAt(12, p).front, r = Math.PI / 180, nx = Math.sin(F.moveDir * r), ny = Math.cos(F.moveDir * r);
    return F.t0 + ((Bay.CAPE.x - F.ref[0]) * nx + (Bay.CAPE.y - F.ref[1]) * ny) / F.speed;
  }
  const overlaps = (a0, a1, b0, b1) => a0 <= b1 && b0 <= a1;

  // Pre-departure checklist. `ok(c)` gives the answer that follows from the forecast; `fact(c)` says what happened.
  // c: { scn, depart, arrive, p90, frontP10, frontP90, stormFrom, stormTo, ...fact fields in the debrief }
  const CHECK = [
    { id: 'warn', label: 'Официальный прогноз и предупреждения', opts: ['Предупреждений нет', 'О грозах', 'О сильном ветре', 'Штормовое'],
      ok: (c) => ({ summer: 1, front: 2, bora: 3 })[c.scn] },
    { id: 'gust', label: 'Порывы на маршруте по P90 ансамбля против предела экипажа', opts: [`Не выше ${LIMITS.gust} уз`, `Выше ${LIMITS.gust} уз`],
      ok: (c) => (c.p90 > LIMITS.gust ? 1 : 0) },
    { id: 'local', label: 'Местные поправки', many: true,
      opts: ['Бриз после полудня: у берега плюс 5–10 уз', 'Стоковый ветер из долин ночью и утром', 'Бора: порывы вдвое сильнее среднего', 'Мыс и пролив: скорость ×1,3'],
      ok: (c) => ({ summer: [0, 1, 3], bora: [2, 3], front: [3] })[c.scn] },
    { id: 'front', label: 'Фронт и заход ветра', opts: ['Фронта нет', 'Фронт пройдёт во время перехода', 'Фронт пройдёт до выхода или после прихода'],
      ok: (c) => (c.scn !== 'front' ? 0 : overlaps(c.frontP10, c.frontP90, c.depart, c.arrive) ? 1 : 2) },
    { id: 'storm', label: 'Грозы', opts: ['Гроз не ожидается', 'Грозы возможны во время перехода', 'Грозы возможны, но не во время перехода'],
      ok: (c) => (c.stormFrom == null ? 0 : overlaps(c.stormFrom, c.stormTo, c.depart, c.arrive) ? 1 : 2) },
    { id: 'fog', label: 'Туман: разница T − Td', opts: ['Туман возможен: меньше 2 °C', 'Тумана не будет: больше 2 °C'], ok: () => 1 },
    { id: 'shelter', label: 'Укрытие и запасная гавань', opts: ['Не нужны', 'Вернуться в Марину Тихую'], ok: () => 1 },
    { id: 'reef', label: 'План рифов', opts: ['Полные паруса', 'Рифы до выхода', 'Рифы при усилении в пути'],
      ok: (c) => (c.p90 > 28 ? 1 : 2) },
    { id: 'window', label: 'Окно выхода', opts: ['Выбранное время подходит', 'Лучше выйти в другое время или не выходить'],
      ok: (c) => (c.risky ? 1 : 0) },
    { id: 'watch', label: 'Что проверять в пути', many: true,
      opts: ['Барометр каждый час', 'Кучевые над горами', 'Шапка на гребне', 'Ветер у мыса и в проливе против прогноза', 'Тёмные тучи и шквалы с наветра'],
      ok: (c) => ({ summer: [1, 3, 4], bora: [2, 3], front: [0, 3, 4] })[c.scn] },
  ];
  // Situations on the way: signs seen from the deck shortly before an event, and what to do. Score 2: right, 0: wrong.
  const SIT = {
    squall: { text: 'С наветра идёт тёмная туча, под ней полоса ливня, слышен гром. Ветер стих и потянул к туче.',
      opts: [['Взять рифы и искать стоянку, уходить от тучи', 2], ['Взять рифы, убрать лишние паруса и готовиться к шквалу', 2], ['Идти как шли: туча пройдёт стороной', 0]] },
    front: { text: 'На северо-западе тёмный вал облаков. Барометр за час упал на 2 гПа, юго-западный ветер крепчает.',
      opts: [['Взять рифы и искать стоянку', 2], ['Взять рифы и готовиться к заходу ветра вправо и порывам', 2], ['Идти как шли: до порта недалеко', 0]] },
    bora: { text: 'Впереди вода тёмная и в барашках, с гор срываются полосы пены. Шапка на гребне держится.',
      opts: [['Взять рифы до входа в полосу и держаться дальше от подножия', 2], ['Взять рифы и искать стоянку', 2], ['Идти под полными парусами', 0]] },
    jet: { text: 'Впереди вода в барашках и полосах пены, ветер заметно крепчает.',
      opts: [['Взять рифы до входа в полосу усиления', 2], ['Взять рифы и искать стоянку', 2], ['Идти под полными парусами', 0]] },
    prefront: { text: 'Перистые облака сгущаются, барометр за час упал на 1 гПа.',
      opts: [['Идти дальше, приготовить рифы и следить за барометром', 2], ['Сразу взять все рифы и вернуться', 1], ['Ничего не менять, барометр не смотреть', 0]] },
    calm: { text: 'Ветер ровный, небо чистое, барометр стоит.',
      opts: [['Идти дальше и сверять ветер с прогнозом у мыса и в проливе', 2], ['Взять рифы на всякий случай', 1], ['Перестать следить за погодой', 0]] },
    tower: { text: 'Над хребтом кучевые выросли в башню, верх расплывается наковальней.',
      opts: [['Приготовить рифы, следить за тучей и держаться ближе к укрытию', 2], ['Сразу вернуться в марину', 1], ['Не обращать внимания: туча над горами', 0]] },
  };
  // When and what the crew notices on this passage, from the weather that will actually happen.
  function situations(scn, res, events, tp) {
    const S = res.samples, t0 = S[0].t, t1 = S[S.length - 1].t, out = [];
    const add = (t, kind) => { const tt = Math.max(t0 + 0.15, t); if (tt >= t1 || out.some((q) => Math.abs(q.t - tt) < 0.75)) return; out.push({ t: tt, kind }); };
    const sq = events.find((e) => e.kind === 'squall');
    if (sq) add(sq.t - 0.4, 'squall');
    const k = S.findIndex((q) => q.w.tau != null && q.w.tau >= -0.6);
    if (k > 0) add(S[k].t, 'front');
    const ex = events.find((e) => e.kind === 'gust' || e.kind === 'strong' || e.kind === 'bora');
    if (ex) add(ex.t - 0.3, scn.id === 'bora' ? 'bora' : 'jet');
    const T = scn.id === 'summer' ? scn.stateAt(16, tp).storm : null;
    if (T && !sq && T.tStart > t0 && T.tStart < t1) add(T.tStart, 'tower');
    // A quiet passage still has a moment to check the weather.
    if (!out.length) add(t0 + (t1 - t0) * 0.4, scn.id === 'front' ? 'prefront' : scn.id === 'summer' ? 'tower' : 'calm');
    return out.sort((a, b) => a.t - b.t).slice(0, 3);
  }

  const sameAns = (Q, a, ok) => (Q.many ? [...(a || [])].sort().join() === [...ok].sort().join() : a === ok);
  const ansText = (Q, a) => (a == null || (Q.many && !a.length) ? (Q.many ? 'ничего не отмечено' : 'нет ответа') : Q.many ? a.map((i) => Q.opts[i]).join('; ') : Q.opts[a]);

  // Simple yacht performance: speed made good along the course, knots.
  function boatSpeed(tws, twa) {
    if (tws < 6) return 5.5; // motor
    const P = [[45, 0.42], [60, 0.5], [90, 0.55], [120, 0.55], [150, 0.48], [180, 0.4]];
    const k = (a) => { for (let i = 1; i < P.length; i++) if (a <= P[i][0]) { const t = (a - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t; } return 0.4; };
    const sail = (a) => { let v = Math.min(7.5, tws * k(a)); if (tws > 25) v *= 0.85; return Math.max(3, v); };
    if (twa < 45) return Math.max(2, sail(45) * Math.cos(((45 - twa) * Math.PI) / 180) * (tws > 18 ? 0.8 : 1));
    return sail(twa);
  }
  const bearing = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const angAbs = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  // Sail a route in the given weather. windFn(x, y, hour) -> wind. Returns samples every `dt` minutes.
  function sail(route, depart, windFn, endHour, dt = 2) {
    let x = route[0][0], y = route[0][1], leg = 1, t = depart;
    const out = [];
    while (leg < route.length && t < endHour) {
      const [tx, ty] = route[leg], dx = tx - x, dy = ty - y, dist = Math.hypot(dx, dy);
      const b = bearing(dx, dy), w = windFn(x, y, t);
      const v = boatSpeed(w.speed, w.dir == null ? 90 : angAbs(w.dir, b));
      out.push({ t, x, y, w, v, heading: b });
      const step = v * KM_PER_MIN_PER_KN * dt;
      if (step >= dist) { x = tx; y = ty; leg++; t += (dist / (v * KM_PER_MIN_PER_KN)) / 60; }
      else { x += (dx / dist) * step; y += (dy / dist) * step; t += dt / 60; }
    }
    const arrived = leg >= route.length;
    if (arrived) out.push({ t, x, y, w: windFn(x, y, t), v: 0, heading: out.length ? out[out.length - 1].heading : 0 });
    return { samples: out, arrived, arrival: arrived ? t : null };
  }

  function sketch(canvas, id) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth || 300, h = canvas.clientHeight || 170;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = Draw.css;
    c.fillStyle = css('--sea'); c.fillRect(0, 0, w, h);
    c.fillStyle = css('--land'); c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.55); c.bezierCurveTo(w * 0.7, h * 0.5, w * 0.45, h * 0.35, 0, h * 0.42); c.closePath(); c.fill();
    c.strokeStyle = css('--ink'); c.lineWidth = 1.1; c.font = '700 22px "IBM Plex Sans", system-ui, sans-serif'; c.textAlign = 'center';
    const iso = (x, y, n, rx, ry, rot) => { for (let i = 1; i <= n; i++) { c.beginPath(); c.ellipse(x, y, rx * i, ry * i, rot, 0, Math.PI * 2); c.stroke(); } };
    const letter = (t, x, y, col) => { c.fillStyle = col; c.fillText(t, x, y + 8); };
    if (id === 'summer') { iso(w * 0.5, h * 0.62, 3, w * 0.16, h * 0.13, 0); letter('H', w * 0.5, h * 0.62, css('--accent')); }
    if (id === 'bora') {
      iso(w * 0.82, h * 0.2, 3, w * 0.08, h * 0.08, 0); iso(w * 0.18, h * 0.82, 3, w * 0.07, h * 0.07, 0);
      letter('H', w * 0.82, h * 0.2, css('--accent')); letter('L', w * 0.18, h * 0.82, css('--danger'));
      Draw.drawArrow(c, w * 0.52, h * 0.5, -1, -1, 46, css('--front'), 3);
    }
    if (id === 'front') {
      iso(w * 0.16, h * 0.18, 3, w * 0.09, h * 0.1, 0.4); letter('L', w * 0.16, h * 0.18, css('--danger'));
      c.strokeStyle = css('--front'); c.fillStyle = css('--front'); c.lineWidth = 3;
      c.beginPath(); c.moveTo(w * 0.22, h * 0.3); c.quadraticCurveTo(w * 0.3, h * 0.65, w * 0.2, h * 0.98); c.stroke();
      for (let t = 0.1; t < 0.95; t += 0.18) {
        const x = (1 - t) * (1 - t) * w * 0.22 + 2 * (1 - t) * t * w * 0.3 + t * t * w * 0.2, y = (1 - t) * (1 - t) * h * 0.3 + 2 * (1 - t) * t * h * 0.65 + t * t * h * 0.98;
        c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 10, y); c.lineTo(x, y + 6); c.closePath(); c.fill();
      }
      Draw.drawArrow(c, w * 0.62, h * 0.72, 1, 1, 40, css('--ink'), 2.5);
      c.fillStyle = css('--muted'); c.font = '12px "IBM Plex Sans", system-ui, sans-serif'; c.fillText('тёплый сектор, SW', w * 0.66, h * 0.92);
    }
    c.fillStyle = css('--muted'); c.font = '12px "IBM Plex Sans", system-ui, sans-serif'; c.textAlign = 'left';
    c.fillText('континент', 8, 16); c.fillText('море', 8, h - 8);
    c.strokeStyle = css('--accent'); c.lineWidth = 2; c.strokeRect(w * 0.45, h * 0.38, w * 0.12, h * 0.16);
    c.fillStyle = css('--accent'); c.font = '600 12px "IBM Plex Sans", system-ui, sans-serif'; c.textAlign = 'left'; c.fillText('наша бухта', w * 0.58 + 4, h * 0.38 + 12);
  }

  class FinalView {
    constructor(root) {
      const C = (globalThis.CHAPTERS || {}).final || { title: 'Итоговый переход', lead: '', before: [] };
      this.root = el('article', { class: 'chapter final', id: 'view-final' });
      const mapBox = el('div', { class: 'final-map' });
      this.panel = el('div', { class: 'final-panel' });
      this.stepper = el('ol', { class: 'stepper', 'aria-label': 'Этапы перехода' });
      this.body = el('div', { class: 'final-body' });
      this.panel.append(this.stepper, this.body);
      this.root.append(
        el('header', { class: 'ch-head' }, el('h1', { class: 'ch-title' }, C.title), C.lead ? el('p', { class: 'ch-lead' }, C.lead) : ''),
        el('div', { class: 'prose' }, ...(C.before || []).map((t) => el('p', {}, t))),
        el('div', { class: 'final-grid' }, mapBox, this.panel));
      root.append(this.root);
      this.map = new MapView(mapBox, { yacht: { x: Bay.MARINA.x, y: Bay.MARINA.y, showWind: false }, mode: 'none', onClick: (p) => this.onMapClick(p) });
      this.hint = el('div', { class: 'map-hint' }, '');
      mapBox.append(this.hint, Topics.legendScale());
      this.mem = Ens.members(30, 21);
      this.cellCache = new Map();
      this.st = { step: 0, scn: null, seed: 1 + Math.floor(Math.random() * 1e6), check: {}, decision: null, route: [[Bay.MARINA.x, Bay.MARINA.y]], depart: 9, est: { mean: '', gust: '' } };
      this.go(0);
    }

    scn() { return Ens.SCENARIOS[this.st.scn]; }
    truthP() { return Ens.truth(this.st.seed); }
    cells(res, hour) {
      const key = `${this.st.scn}|${res}|${Math.round(hour * 2) / 2}`;
      if (!this.cellCache.has(key)) {
        if (this.cellCache.size > 120) this.cellCache.clear();
        const scn = this.scn(), h = Math.round(hour * 2) / 2;
        this.cellCache.set(key, Topics.modelCells((r) => Ens.state(scn, h, Ens.CONTROL, r), res));
      }
      return this.cellCache.get(key);
    }
    // Model wind at a point. The global model is shown as its cells; the regional model is interpolated
    // between cell centres, as forecast apps draw it, so its 2 km grid is not visible.
    modelWind(res, x, y, hour) {
      const C = this.cells(res, hour);
      if (res >= 5) {
        const c = C.list[Math.floor(y / C.res) * C.nx + Math.floor(x / C.res)];
        return c ? { u: c.u, v: c.v, speed: c.speed, gust: c.gust, dir: c.dir, variable: false } : { u: 0, v: 0, speed: 0, gust: 0, dir: null };
      }
      const fx = Math.min(C.nx - 1.001, Math.max(0, x / C.res - 0.5)), fy = Math.min(C.ny - 1.001, Math.max(0, y / C.res - 0.5));
      const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, L = C.list, k = j * C.nx + i;
      const mix = (f) => (f(L[k]) * (1 - tx) + f(L[k + 1]) * tx) * (1 - ty) + (f(L[k + C.nx]) * (1 - tx) + f(L[k + C.nx + 1]) * tx) * ty;
      const u = mix((c) => c.u), v = mix((c) => c.v), speed = mix((c) => c.speed), gust = mix((c) => c.gust);
      return { u, v, speed, gust, dir: Math.hypot(u, v) > 0.05 ? Wind.dirOf(u, v) : null, variable: false };
    }
    showModel(res, hour) {
      const C = this.cells(res, hour), scn = this.scn(), S = Ens.state(scn, hour, Ens.CONTROL, res);
      this.map.showCells = res >= 5;
      const ov = { route: this.st.route.length > 1 ? this.st.route : null, probe: this.probe };
      if (S.front) ov.front = Wind.frontLine(S);
      if (S.bora > 0.45) ov.cap = true;
      this.map.overlays = ov;
      this.map.setField((x, y) => this.modelWind(res, x, y, hour), C);
    }

    // Open a scenario at a given step (0 choose, 1 forecast, 2 route).
    applyPreset(preset) {
      const P = preset || {};
      if (P.scn && Ens.SCENARIOS[P.scn]) {
        const S = Ens.SCENARIOS[P.scn];
        Object.assign(this.st, { scn: P.scn, depart: S.departDefault, check: {}, decision: null, route: [[Bay.MARINA.x, Bay.MARINA.y]] });
        this.probe = [9, 4]; this.briefHour = 12; this.briefModel = 2;
        this.go(Math.max(1, Math.min(2, P.step ?? 1)));
      } else this.go(0);
    }

    go(step) {
      this.st.step = step;
      this.map.follow = false;
      this.stepper.innerHTML = '';
      this.maxStep = Math.max(this.maxStep || 0, step);
      // Steps already reached can be reopened; the passage itself only through the decision.
      STEPS.forEach((s, i) => {
        const open = i !== step && i <= this.maxStep && this.st.scn && (i <= 4 || (i === 6 && this.result));
        const lab = [el('span', {}, String(i + 1)), s];
        this.stepper.append(el('li', { class: i === step ? 'on' : i < this.maxStep || i < step ? 'done' : '' },
          open ? el('button', { type: 'button', class: 'step-btn', onclick: () => this.go(i) }, ...lab) : el('span', { class: 'step-btn', 'aria-current': i === step ? 'step' : null }, ...lab)));
      });
      this.body.innerHTML = '';
      this.map.mode = 'none';
      if (this.running) { cancelAnimationFrame(this.running); this.running = null; }
      [this.stepScenario, this.stepBrief, this.stepRoute, this.stepCheck, this.stepDecide, this.stepRun, this.stepDebrief][step].call(this);
      const r0 = this.stepper.getBoundingClientRect();
      if (r0.top < 0 || r0.top > window.innerHeight) this.stepper.scrollIntoView({ block: 'start' });
    }

    // Bottom bar with the way back and the way forward.
    navBar(back, next) {
      const b = back ? el('button', { type: 'button', class: 'btn', onclick: back[1] }, `← ${back[0]}`) : el('span');
      const n = next ? (next.nodeType ? next : el('button', { type: 'button', class: 'btn primary', onclick: next[1] }, `${next[0]} →`)) : el('span');
      return el('div', { class: 'final-nav' }, b, n);
    }

    onMapClick(p) {
      if (this.st.step === 2) this.addPoint(p);
      else if (this.st.step === 1 || this.st.step === 3 || this.st.step === 4) { this.probe = p; this.refreshBrief(); }
    }

    // Forecast tools: model on the map, forecast time, point for the meteogram. Open on the forecast step,
    // a collapsible block on the route, checklist and decision steps.
    forecastTools(main) {
      const scn = this.scn();
      this.meteo = el('canvas', { class: 'chart', style: 'height:200px' });
      this.meteoNote = el('div', { class: 'legend' });
      this.briefRO = new Readout(el('div'));
      const S0 = Bay.STRAIT, places = [['Марина', [Bay.MARINA.x, Bay.MARINA.y - 0.6]], ['Пролив', [(S0.a[0] + S0.b[0]) / 2, (S0.a[1] + S0.b[1]) / 2]], ['Мыс', [8.6, 3.9]], ['Порт Каменка', [Bay.HARBOUR.x + 0.6, Bay.HARBOUR.y]]];
      const at = el('div', { class: 'actions place-btns' }, ...places.map(([n, pt]) => el('button', { type: 'button', class: 'btn', onclick: () => { this.probe = pt; this.refreshBrief(); } }, n)));
      const box = el('div', { class: 'fc-tools' },
        control({ id: 'model', type: 'seg', label: 'Модель на карте', options: [[9, 'Глобальная 9 км'], [2, 'Региональная 2 км']] }, this.briefModel, (v) => { this.briefModel = v; this.refreshBrief(); }),
        control({ id: 'bh', type: 'range', label: 'Время прогноза', min: scn.start, max: scn.end, step: 0.5, fmt: 'time' }, this.briefHour, (v) => { this.briefHour = v; this.refreshBrief(); }),
        el('div', {}, el('div', { class: 'chart-title' }, this.st.step === 2 ? 'Метеограмма: выберите место' : 'Метеограмма: нажмите на карту или выберите место'), at),
        this.briefRO.root,
        el('div', { class: 'chart-box' }, el('div', { class: 'chart-title' }, 'Метеограмма в выбранной точке: средний ветер, уз'), this.meteo, this.meteoNote),
        this.fcTable = el('div', { class: 'fc-table-wrap' }));
      if (main) return box;
      const d = el('details', { class: 'fc-box' }, el('summary', {}, 'Прогноз: карта и метеограмма'), box,
        el('details', { class: 'fc-bull' }, el('summary', {}, 'Бюллетень и наблюдения утром'), el('pre', { class: 'bulletin' }, BULLETIN[scn.id]), el('ul', { class: 'theory' }, ...OBS[scn.id].map((t) => el('li', {}, t)))));
      d.open = !!this.fcOpen;
      d.addEventListener('toggle', () => { this.fcOpen = d.open; this.refreshBrief(); });
      return d;
    }

    // ------------------------------------------------------------ 1 scenario
    stepScenario() {
      this.hint.textContent = 'Ветер пока не показан: выберите ситуацию. Маршрут — от белого кружка (Марина Тихая) через узкий пролив, мимо мыса на западе к квадрату (Порт Каменка), около 20 миль.';
      this.map.yacht = { x: Bay.MARINA.x, y: Bay.MARINA.y, showWind: false };
      this.map.showCells = false;
      this.map.overlays = { particles: false, colors: false };
      this.map.setField(() => ({ u: 0, v: 0, speed: 0, gust: 0, dir: null }));
      this.body.append(el('p', { class: 'lead' }, 'Прогноз здесь такой, как его дают модели. Погода на переходе будет одним из возможных вариантов.'));
      const list = el('div', { class: 'cards' });
      for (const id of ['summer', 'bora', 'front']) {
        const S = Ens.SCENARIOS[id];
        list.append(el('button', { type: 'button', class: 'card', onclick: () => { this.st.scn = id; this.st.depart = S.departDefault; this.st.check = {}; this.st.decision = null; this.st.route = [[Bay.MARINA.x, Bay.MARINA.y]]; this.probe = [9, 4]; this.briefHour = 12; this.briefModel = 2; this.go(1); } },
          el('div', { class: 'card-title' }, S.name), el('div', { class: 'card-sub' }, S.season), el('div', { class: 'card-text' }, DESCR[id])));
      }
      this.body.append(list, el('p', { class: 'note' }, `Пределы экипажа: средний ветер до ${LIMITS.mean} уз, порывы до ${LIMITS.gust} уз.`));
    }

    // ------------------------------------------------------------ 2 briefing
    stepBrief() {
      const scn = this.scn();
      this.hint.textContent = 'Глобальная модель 9 км показана ячейками: так она видит рельеф и ветер. Региональная 2 км сглажена, как в приложениях прогноза. Нажмите на карту, чтобы посмотреть метеограмму в точке.';
      this.map.mode = 'probe';
      this.map.yacht = null;
      const sk = el('canvas', { class: 'sketch', style: 'height:150px' });
      this.body.append(
        el('h3', {}, `${scn.name}. ${scn.season}`),
        el('div', { class: 'brief-grid' }, el('div', {}, el('div', { class: 'chart-title' }, 'Синоптическая ситуация'), sk), el('pre', { class: 'bulletin' }, BULLETIN[scn.id]),
          el('div', {}, el('div', { class: 'chart-title' }, 'Утром в марине'), el('ul', { class: 'theory' }, ...OBS[scn.id].map((t) => el('li', {}, t))))),
        this.forecastTools(true),
        this.navBar(['Ситуация', () => this.go(0)], ['Маршрут', () => this.go(2)]),
      );
      requestAnimationFrame(() => sketch(sk, scn.id));
      this.refreshBrief();
    }
    refreshBrief() {
      const scn = this.scn(), h = this.briefHour, p = this.probe;
      this.showModel(this.briefModel, h);
      if (!this.meteo || !this.meteo.isConnected) return;
      const w = this.modelWind(this.briefModel, p[0], p[1], h);
      this.briefRO.update(w, [`${Bay.areaName(p[0], p[1])}, ${fmtTime(h)}`], `Модель ${this.briefModel} км`);
      const hours = []; for (let t = scn.start; t <= scn.end; t += 1) hours.push(t);
      const key = `${scn.id}|${p[0]}|${p[1]}`;
      if (this._mk !== key) {
        this._mk = key;
        this._ens = Ens.percentiles(Ens.series(p[0], p[1], scn, this.mem, hours, 9).speed);
        this._g9 = hours.map((t) => this.modelWind(9, p[0], p[1], t).speed);
        this._r2 = hours.map((t) => this.modelWind(2, p[0], p[1], t));
      }
      const E = this._ens, css = Draw.css;
      const ymax = Math.max(20, Math.ceil(Math.max(...E.p90, ...this._r2.map((r) => r.gust)) / 10) * 10);
      chart(this.meteo, {
        x0: scn.start, x1: scn.end, y0: 0, y1: ymax, xstep: scn.end - scn.start > 24 ? 6 : 3, ystep: ymax > 40 ? 10 : 5,
        xfmt: (x) => (x >= 24 ? `${x - 24}:00+1` : `${x}:00`),
        bands: [{ xs: hours, lo: E.p10, hi: E.p90, color: css('--band') }],
        lines: [
          { xs: hours, ys: E.p90, color: css('--warn'), width: 1.5 },
          { xs: hours, ys: this._g9, color: css('--muted'), width: 2, dash: [5, 4] },
          { xs: hours, ys: this._r2.map((r) => r.speed), color: css('--ink'), width: 2 },
          { xs: hours, ys: this._r2.map((r) => r.gust), color: css('--ink'), width: 1, dash: [2, 3] },
        ],
        cursor: h,
      });
      this.meteoNote.innerHTML = '';
      this.meteoNote.append(el('span', { class: 'lg lg-band' }, 'ансамбль P10–P90, 9 км'), el('span', { class: 'lg lg-p90' }, 'P90'),
        el('span', { class: 'lg lg-mean' }, 'глобальная 9 км'), el('span', { class: 'lg lg-p50' }, 'региональная 2 км'), el('span', { class: 'lg lg-dot' }, 'её порывы'));
      this.forecastTable(hours);
    }

    // Hourly table in the style of forecast services: wind from the model on the map, ensemble P90,
    // Beaufort force, sea-level pressure and the share of ensemble members with a thunderstorm nearby.
    forecastTable(hours) {
      if (!this.fcTable) return;
      const scn = this.scn(), p = this.probe, res = this.briefModel;
      const key = `${scn.id}|${p[0]}|${p[1]}`;
      if (this._tsKey !== key) {
        this._tsKey = key;
        this._ts = hours.map((t) => {
          let n = 0;
          for (const m of this.mem) {
            const S = Ens.state(scn, t, m, 9);
            if (S.storm) { const c = Wind.stormState(S.storm, t); if (c.I > 0.2 && Math.hypot(c.x - p[0], c.y - p[1]) < 8) { n++; continue; } }
            if (S.front) { const w = Wind.at(p[0], p[1], S); if (w.tau != null && Math.abs(w.tau) < 0.75) n++; }
          }
          return Math.round((n / this.mem.length) * 100);
        });
      }
      const cols = hours.map((t, i) => {
        const w = this.modelWind(res, p[0], p[1], t), S = Ens.state(scn, t, Ens.CONTROL, res);
        return { t, w, p90: this._ens.p90[i], bf: Wind.beaufort(w.speed), pr: Wind.pressure(p[0], p[1], S), ts: this._ts[i] };
      });
      const cell = (v, kn) => { const c = Draw.speedRGB(kn); return el('td', { style: `background:rgb(${c[0]},${c[1]},${c[2]});color:${kn >= 25 ? '#fff' : '#10243a'}` }, v); };
      const row = (name, f) => el('tr', {}, el('th', { scope: 'row' }, name), ...cols.map(f));
      const tbl = el('table', { class: 'fc-table' },
        row('Время', (c) => el('td', { class: Math.abs(c.t - this.briefHour) < 0.5 ? 'fc-now' : '' }, fmtTime(c.t).replace(/:00/, '').replace('завтра ', '+'))),
        row('Ветер', (c) => el('td', {}, c.w.dir == null ? '·' : el('span', { class: 'fc-arrow', style: `transform:rotate(${Math.round(c.w.dir)}deg)` }, '↓'), el('small', {}, Wind.compass(c.w.dir)))),
        row(`Средний, уз (${res} км)`, (c) => cell(fmtNum(c.w.speed), c.w.speed)),
        row('Порывы, уз', (c) => cell(fmtNum(c.w.gust), c.w.gust)),
        row('P90 ансамбля, уз', (c) => cell(fmtNum(c.p90), c.p90)),
        row('Баллы', (c) => el('td', {}, String(c.bf))),
        row('Давление, гПа', (c) => el('td', {}, fmtNum(c.pr))),
        row('Гроза, %', (c) => el('td', { class: c.ts >= 30 ? 'fc-ts' : '' }, c.ts ? String(c.ts) : '')));
      this.fcTable.innerHTML = '';
      this.fcTable.append(el('div', { class: 'chart-title' }, `Прогноз по часам: ${Bay.areaName(p[0], p[1])}`), el('div', { class: 'fc-scroll' }, tbl));
      const now = tbl.querySelector('.fc-now'), sc = this.fcTable.querySelector('.fc-scroll');
      if (now && sc) sc.scrollLeft = Math.max(0, now.offsetLeft - sc.clientWidth / 2);
    }

    // ------------------------------------------------------------ 4 route
    stepRoute() {
      const scn = this.scn();
      this.map.mode = 'route';
      this.map.yacht = { x: Bay.MARINA.x, y: Bay.MARINA.y, showWind: false };
      this.map.setView('top', true);
      this.hint.textContent = 'Нажимайте на воду, чтобы ставить точки маршрута от белого кружка к квадрату порта. Чтобы пройти пролив, нажмите в него: точки встанут по его оси. Приблизить — «+» или двумя пальцами. Цвет воды — прогноз из блока «Прогноз».';
      this.briefHour = this.st.depart;
      this.routeMsg = el('div', { class: 'note', 'aria-live': 'polite' });
      this.planBox = el('div', { class: 'plan' });
      this.goBtn = el('button', { type: 'button', class: 'btn primary', onclick: () => this.go(3) }, 'Чек-лист →');
      this.body.append(
        el('p', { class: 'lead' }, 'Проложите маршрут по воде и выберите время выхода.'),
        el('div', { class: 'actions' },
          el('button', { type: 'button', class: 'btn', onclick: () => { if (this.st.route.length > 1) this.st.route.pop(); this.refreshRoute(); } }, 'Отменить точку'),
          el('button', { type: 'button', class: 'btn', onclick: () => { this.st.route = [[Bay.MARINA.x, Bay.MARINA.y]]; this.refreshRoute(); } }, 'Сбросить'),
          el('button', { type: 'button', class: 'btn', onclick: () => this.addPoint([Bay.HARBOUR.x, Bay.HARBOUR.y]) }, 'Завершить в порту')),
        this.routeMsg,
        control({ id: 'depart', type: 'range', label: 'Время выхода', min: scn.depart[0], max: scn.depart[1], step: 0.5, fmt: 'time' }, this.st.depart, (v) => { this.st.depart = v; this.refreshRoute(); }),
        this.planBox,
        this.forecastTools(false),
        this.navBar(['Прогноз', () => this.go(1)], this.goBtn),
      );
      this.refreshRoute();
    }
    addPoint(p) {
      const r = this.st.route, last = r[r.length - 1];
      const say = (m) => { this.routeMsg.textContent = m; this.map.toast(m); };
      if (this.routeDone()) { say('Маршрут уже завершён в порту. Отмените точку, чтобы изменить его.'); return; }
      const S0 = Bay.STRAIT, q = Bay.segParam(p[0], p[1], S0.a[0], S0.a[1], S0.b[0], S0.b[1]);
      if (q.c < 1.0 && q.a > -0.4 && q.a < 1.4) { // tap near the strait: put points on both ends of its axis
        const ends = Math.hypot(last[0] - S0.b[0], last[1] - S0.b[1]) < Math.hypot(last[0] - S0.a[0], last[1] - S0.a[1]) ? [S0.b, S0.a] : [S0.a, S0.b];
        for (const e of ends) {
          const prev = r[r.length - 1];
          if (Bay.legOnLand(prev[0], prev[1], e[0], e[1])) { say('До пролива отрезок пересекает берег. Поставьте точку ближе ко входу в пролив.'); this.refreshRoute(); return; }
          r.push([e[0], e[1]]);
        }
        this.map.toast(''); this.routeMsg.textContent = ''; this.refreshRoute(); return;
      }
      if (Math.hypot(p[0] - Bay.HARBOUR.x, p[1] - Bay.HARBOUR.y) < 1.2) p = [Bay.HARBOUR.x, Bay.HARBOUR.y];
      if (Bay.isLand(p[0], p[1])) { say('Точка на суше. Поставьте её на воде.'); return; }
      const hit = Bay.legOnLand(last[0], last[1], p[0], p[1]);
      if (hit) { say(`Отрезок пересекает берег (${Bay.areaName(hit.x, hit.y)}). Добавьте промежуточную точку.`); return; }
      r.push(p); this.routeMsg.textContent = ''; this.map.toast('');
      this.refreshRoute();
    }
    routeDone() { const l = this.st.route[this.st.route.length - 1]; return this.st.route.length > 1 && l[0] === Bay.HARBOUR.x && l[1] === Bay.HARBOUR.y; }
    updateGo() { this.goBtn.disabled = !this.routeDone(); }
    refreshRoute() {
      const scn = this.scn(), r = this.st.route;
      this.refreshBrief();
      this.planBox.innerHTML = '';
      const L = r.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0), 0);
      this.planBox.append(el('div', { class: 'ro-line' }, `Длина маршрута ${fmtNum(L / 1.852, 1)} мили (${fmtNum(L, 1)} км), точек маршрута: ${r.length - 1}.`));
      this.updateGo();
      if (!this.routeDone()) return;
      const plan = sail(r, this.st.depart, (x, y, t) => this.modelWind(2, x, y, t), scn.end + 6, 5);
      this.plan = plan;
      let mx = 0, gx = 0, at = null;
      for (const s of plan.samples) { if (s.w.speed > mx) mx = s.w.speed; if (s.w.gust > gx) { gx = s.w.gust; at = s; } }
      const routeMax = this.mem.map((p) => Math.max(...plan.samples.map((s) => Wind.at(s.x, s.y, Ens.state(scn, s.t, p, 9)).gust)));
      routeMax.sort((a, b) => a - b);
      this.planEns = { p10: Ens.quantile(routeMax, 0.1), p50: Ens.quantile(routeMax, 0.5), p90: Ens.quantile(routeMax, 0.9) };
      const tbl = el('table', { class: 'tbl' },
        el('tr', {}, el('th', {}, 'Прогноз на маршруте'), el('th', {}, 'Средний'), el('th', {}, 'Порывы')),
        el('tr', {}, el('td', {}, 'Региональная 2 км'), el('td', {}, `${fmtNum(mx)} уз`), el('td', {}, `${fmtNum(gx)} уз`)),
        el('tr', {}, el('td', {}, 'Ансамбль 9 км, порывы P50 / P90'), el('td', {}, '—'), el('td', {}, `${fmtNum(this.planEns.p50)} / ${fmtNum(this.planEns.p90)} уз`)));
      this.planBox.append(
        el('div', { class: 'ro-line' }, plan.arrived ? `По региональной модели: прибытие ${fmtTime(plan.arrival)}, в пути ${fmtNum(plan.arrival - this.st.depart, 1)} ч.` : 'По региональной модели яхта не успевает дойти до конца сценария.'),
        tbl,
        at ? el('div', { class: 'ro-line' }, `Сильнее всего по модели: ${Bay.areaName(at.x, at.y)}, ${fmtTime(at.t)}.`) : '',
      );
    }

    // Forecast facts the checklist is judged against: route timing by the regional model, ensemble P90 of the
    // highest gust on the route, front timing at the cape, the hours when thunderstorms are possible.
    planCtx() {
      const scn = this.scn(), plan = this.plan, depart = this.st.depart;
      const arrive = plan && plan.arrived ? plan.arrival : scn.end;
      const c = { scn: scn.id, depart, arrive, p90: this.planEns ? this.planEns.p90 : 0, stormFrom: null, stormTo: null };
      if (scn.id === 'front') {
        const times = this.mem.map((p) => frontAtCape(scn, p)).sort((a, b) => a - b);
        c.frontP10 = Ens.quantile(times, 0.1); c.frontP50 = Ens.quantile(times, 0.5); c.frontP90 = Ens.quantile(times, 0.9);
        c.stormFrom = c.frontP10 - 0.5; c.stormTo = c.frontP90 + 0.5;
      }
      if (scn.id === 'summer') { c.stormFrom = 15; c.stormTo = 21; }
      c.risky = c.p90 > LIMITS.gust || (c.scn === 'front' && overlaps(c.frontP10, c.frontP90, depart, arrive)) || (c.stormFrom != null && overlaps(c.stormFrom, c.stormTo, depart, arrive));
      return c;
    }

    // ------------------------------------------------------------ 4 checklist
    stepCheck() {
      this.hint.textContent = 'Карта показывает прогноз из блока «Прогноз». Нажмите на карту, чтобы посмотреть метеограмму в точке.';
      this.map.mode = 'probe';
      const plan = this.plan, E = this.planEns || {};
      const est = (key, label) => {
        const inp = el('input', { type: 'number', id: `est-${key}`, min: 0, max: 90, step: 1, value: this.st.est[key], inputmode: 'numeric' });
        inp.addEventListener('input', () => { this.st.est[key] = inp.value; });
        return el('label', { class: 'est', for: `est-${key}` }, el('span', {}, label), inp, el('span', {}, 'уз'));
      };
      this.body.append(
        el('p', { class: 'lead' }, 'Пройдите по пунктам. Всё нужное есть в прогнозе, на карте и в том, что видно утром в марине.'),
        this.forecastTools(false),
        el('p', { class: 'note' }, `Выход ${fmtTime(this.st.depart)}${plan && plan.arrived ? `, прибытие по модели ${fmtTime(plan.arrival)}` : ''}. Порывы на маршруте: модель 2 км ${fmtNum(Math.max(...(plan ? plan.samples.map((q) => q.w.gust) : [0])))} уз, ансамбль P50 ${fmtNum(E.p50 || 0)}, P90 ${fmtNum(E.p90 || 0)} уз. Предел экипажа: средний ${LIMITS.mean}, порывы ${LIMITS.gust} уз.`));
      CHECK.forEach((Q, qi) => {
        const box = el('div', { class: 'quiz chk-q', role: 'group', 'aria-labelledby': `chk${qi}` }, el('div', { class: 'quiz-q', id: `chk${qi}` }, `${qi + 1}. ${Q.label}`));
        const btns = Q.opts.map((txt, ai) => {
          const b = el('button', { type: 'button', class: 'quiz-opt', 'aria-pressed': 'false' }, txt);
          b.addEventListener('click', () => {
            if (Q.many) { const cur = new Set(this.st.check[Q.id] || []); cur.has(ai) ? cur.delete(ai) : cur.add(ai); this.st.check[Q.id] = [...cur]; }
            else this.st.check[Q.id] = ai;
            sync();
          });
          return b;
        });
        const sync = () => btns.forEach((b, k) => { const a = this.st.check[Q.id]; b.setAttribute('aria-pressed', String(Q.many ? (a || []).includes(k) : a === k)); });
        sync();
        box.append(...btns);
        if (Q.id === 'gust') box.append(el('div', { class: 'ests' }, est('mean', 'Ваш прогноз: максимальный средний ветер'), est('gust', 'Ваш прогноз: максимальный порыв')));
        this.body.append(box);
      });
      this.body.append(this.navBar(['Маршрут', () => this.go(2)], ['Решение', () => this.go(4)]));
    }

    // ------------------------------------------------------------ 5 decision
    stepDecide() {
      const a = this.st.check;
      this.hint.textContent = 'Карта показывает прогноз из блока «Прогноз». Нажмите на карту, чтобы посмотреть метеограмму в точке.';
      this.map.mode = 'probe';
      // Risks the skipper marked in the checklist.
      const marked = [];
      if (a.warn > 0) marked.push(`предупреждение: ${CHECK[0].opts[a.warn].toLowerCase()}`);
      if (a.gust === 1) marked.push(`порывы по P90 выше ${LIMITS.gust} уз`);
      if (a.front === 1) marked.push('фронт во время перехода');
      if (a.storm === 1) marked.push('грозы во время перехода');
      if (a.window === 1) marked.push('выбранное время не подходит');
      const pick = (d) => {
        this.st.decision = d;
        if (d === 'go') this.go(5);
        else if (d === 'stay') this.go(6);
        else this.go(2);
      };
      this.body.append(
        el('p', { class: 'lead' }, marked.length ? `По вашему чек-листу: ${marked.join('; ')}.` : 'По вашему чек-листу опасностей на переходе нет.'),
        this.forecastTools(false),
        el('div', { class: 'cards' },
          el('button', { type: 'button', class: 'card', onclick: () => pick('go') }, el('div', { class: 'card-title' }, 'Идти'), el('div', { class: 'card-text' }, `Выход в ${fmtTime(this.st.depart)} по проложенному маршруту.`)),
          el('button', { type: 'button', class: 'card', onclick: () => pick('wait') }, el('div', { class: 'card-title' }, 'Ждать'), el('div', { class: 'card-text' }, 'Выбрать другое время выхода и снова пройти чек-лист.')),
          el('button', { type: 'button', class: 'card', onclick: () => pick('route') }, el('div', { class: 'card-title' }, 'Менять маршрут'), el('div', { class: 'card-text' }, 'Проложить маршрут иначе и снова пройти чек-лист.')),
          el('button', { type: 'button', class: 'card', onclick: () => pick('stay') }, el('div', { class: 'card-title' }, 'Остаться в марине'), el('div', { class: 'card-text' }, 'Сегодня не выходить.'))),
        this.navBar(['Чек-лист', () => this.go(3)], null));
    }

    // ------------------------------------------------------------ 6 run
    stepRun() {
      const scn = this.scn(), tp = this.truthP(), r = this.st.route;
      this.map.showCells = false;
      this.map.yacht = { x: r[0][0], y: r[0][1], heading: 0 };
      this.hint.textContent = 'Фактическая погода. Цвет и линии — реальный ветер, а не прогноз.';
      const truthFn = (x, y, t) => Wind.at(x, y, Ens.state(scn, t, tp, 0));
      const res = sail(r, this.st.depart, truthFn, scn.end + 6, 1);
      this.result = res;
      this.events = detectEvents(res.samples);
      this.sits = situations(scn, res, this.events, tp);
      this.st.sitAns = [];
      this.sitBox = el('div', { class: 'sit', hidden: true, 'aria-live': 'assertive' });
      this.clock = el('div', { class: 'clock' });
      this.runRO = new Readout(el('div'));
      this.log = el('ul', { class: 'log', 'aria-live': 'polite' });
      this.alertBox = el('div', { class: 'alert', hidden: true, role: 'alert' });
      let speed = 20; // simulated minutes per second
      this.map.follow = true;
      this._trackIdx = 0;
      this.body.append(this.clock, this.sitBox, this.alertBox, this.runRO.root,
        control({ id: 'spd', type: 'seg', label: 'Скорость', options: [[10, '×10'], [20, '×20'], [60, '×60']] }, speed, (v) => { speed = v; }),
        control({ id: 'follow', type: 'toggle', label: 'Камера за яхтой' }, true, (v) => { this.map.follow = v; }),
        el('div', { class: 'chart-title' }, 'Журнал'), this.log,
        el('div', { class: 'actions' }, el('button', { type: 'button', class: 'btn', onclick: () => { skip = true; } }, 'Перемотать до события')));
      let idx = 0, last = performance.now(), lastField = -1, shown = 0, acc = 0, sitK = 0, paused = false, skip = false;
      // Pause at a situation and ask what to do; the run continues after the answer.
      const ask = (q) => {
        paused = true; skip = false;
        const D = SIT[q.kind];
        this.sitBox.hidden = false; this.sitBox.innerHTML = '';
        this.sitBox.append(el('div', { class: 'sit-time' }, `${fmtTime(q.t)} · ${Bay.areaName(res.samples[idx].x, res.samples[idx].y)}`), el('p', { class: 'sit-text' }, D.text), el('div', { class: 'sit-q' }, 'Что делать?'),
          ...D.opts.map(([txt, sc], k) => el('button', { type: 'button', class: 'quiz-opt', onclick: () => {
            this.st.sitAns.push({ t: q.t, kind: q.kind, choice: k, score: sc });
            this.log.prepend(el('li', {}, `${fmtTime(q.t)} Решение: ${txt.toLowerCase()}.`));
            this.sitBox.hidden = true; paused = false; last = performance.now(); this.running = requestAnimationFrame(tick);
          } }, txt)));
        this.sitBox.scrollIntoView({ block: 'nearest' });
      };
      const tick = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        acc += dt * speed;
        const next = this.sits[sitK];
        if (skip) { const ti = next ? res.samples.findIndex((q) => q.t >= next.t) : res.samples.length - 1; idx = Math.max(idx, ti < 0 ? res.samples.length - 1 : ti); skip = false; acc = 0; }
        while (acc >= 1 && idx < res.samples.length - 1 && !(next && res.samples[idx].t >= next.t)) { idx++; acc -= 1; }
        const s = res.samples[idx];
        const S = Ens.state(scn, s.t, tp, 0);
        if (Math.abs(s.t - lastField) >= 1 / 6 || idx === res.samples.length - 1) {
          lastField = s.t;
          const ov = { route: r, track: res.samples.slice(0, idx + 1).map((q) => [q.x, q.y]) };
          if (S.front) ov.front = Wind.frontLine(S);
          if (S.storm) ov.storm = Wind.stormState(S.storm, s.t);
          if (S.bora > 0.45) ov.cap = true;
          this.map.overlays = ov;
          this.map.setField((x, y) => Wind.at(x, y, S));
        } else if (idx - (this._trackIdx || 0) >= 6) { this._trackIdx = idx; this.map.overlays.track = res.samples.slice(0, idx + 1).map((q) => [q.x, q.y]); }
        this.map.yacht = { x: s.x, y: s.y, heading: s.heading };
        this.clock.textContent = `${fmtTime(s.t)} · ${Bay.areaName(s.x, s.y)} · ${fmtNum(s.v, 1)} уз хода`;
        this.runRO.update(s.w, [], 'Фактический ветер');
        if (next && s.t >= next.t && !paused) { sitK++; ask(next); return; }
        while (shown < this.events.length && this.events[shown].t <= s.t) {
          const e = this.events[shown++];
          this.log.prepend(el('li', { class: `ev ev-${e.kind}` }, `${fmtTime(e.t)} ${e.text} ${e.area}`));
          if (e.kind !== 'bora') {
            this.alertBox.hidden = false;
            const prep = this.prepared(e.t);
            this.alertBox.textContent = prep ? `${fmtTime(e.t)}: ${e.kind === 'squall' ? 'шквал от грозы' : e.text.replace(/,$/, '').toLowerCase()} ${e.area}. Рифы взяты заранее, экипаж готов.` : e.kind === 'squall' ? `${fmtTime(e.t)}: шквал от грозы ${e.area}. В жизни — заранее убрать паруса и уходить от ячейки.`
              : `${fmtTime(e.t)}: ${e.text.replace(/,$/, '')} ${e.area} — выше предела экипажа (${e.kind === 'gust' ? LIMITS.gust : LIMITS.mean} уз). В жизни — рифы, другой курс или возвращение.`;
          }
        }
        if (idx >= res.samples.length - 1) {
          this.running = null;
          this.log.prepend(el('li', {}, res.arrived ? `${fmtTime(res.arrival)} Яхта в Порту Каменка.` : 'Время сценария вышло, яхта не дошла до порта.'));
          this.body.append(this.navBar(null, ['Разбор', () => this.go(6)]));
          return;
        }
        this.running = requestAnimationFrame(tick);
      };
      this.running = requestAnimationFrame(tick);
    }

    // ------------------------------------------------------------ 6 debrief
    stepDebrief() {
      const stay = this.st.decision === 'stay';
      if (stay || !this.result) { // the passage that would have happened
        this.result = sail(this.st.route, this.st.depart, (x, y, t) => Wind.at(x, y, Ens.state(this.scn(), t, this.truthP(), 0)), this.scn().end + 6, 1);
        this.events = detectEvents(this.result.samples);
      }
      const scn = this.scn(), res = this.result, ss = res.samples.filter((s, i) => i % 5 === 0 || i === res.samples.length - 1);
      this.map.mode = 'none';
      this.map.follow = false;
      this.map.setView('3d', true);
      this.hint.textContent = 'Пройденный путь и ветер в момент прибытия.';
      const fact = ss.map((s) => s.w), reg = ss.map((s) => this.modelWind(2, s.x, s.y, s.t));
      const ens = this.mem.map((p) => ss.map((s) => Wind.at(s.x, s.y, Ens.state(scn, s.t, p, 9)).gust));
      const E = Ens.percentiles(ens);
      const maxF = Math.max(...fact.map((w) => w.speed)), maxG = Math.max(...fact.map((w) => w.gust));
      const maxRM = Math.max(...reg.map((w) => w.speed)), maxRG = Math.max(...reg.map((w) => w.gust));
      const routeMax = ens.map((r) => Math.max(...r)).sort((a, b) => a - b);
      const p10 = Ens.quantile(routeMax, 0.1), p90 = Ens.quantile(routeMax, 0.9);
      const squall = this.events.some((e) => e.kind === 'squall');
      const verdict = !res.arrived ? ['Переход не завершён', 'bad'] : squall || maxG > LIMITS.gust + 10 ? ['Опасный переход', 'bad'] : maxG > LIMITS.gust || maxF > LIMITS.mean ? ['Тяжёлый переход', 'warn'] : ['Безопасный переход', 'ok'];
      const shown = stay ? [`Остались в марине. Переход в ${fmtTime(this.st.depart)} был бы ${({ ok: 'безопасным', warn: 'тяжёлым', bad: 'опасным' })[verdict[1]]}`, verdict[1] === 'ok' ? 'warn' : 'ok'] : verdict;
      const c = this.planCtx(), F = this.facts(maxF, maxG), SA = stay ? [] : this.st.sitAns || [];
      const danger = this.events.filter((e) => e.kind === 'squall' || e.kind === 'gust' || e.kind === 'strong');
      const ready = danger.filter((e) => this.prepared(e.t)).length;
      let right = 0;
      const items = CHECK.map((Q) => {
        const a = this.st.check[Q.id], ok = Q.ok(c), same = sameAns(Q, a, ok);
        if (same) right++;
        return el('div', { class: `chk-item ${same ? 'chk-ok' : 'chk-bad'}` },
          el('div', { class: 'chk-title' }, Q.label),
          el('div', {}, el('span', { class: 'chk-k chk-you' }, same ? 'Вы, совпадает с прогнозом: ' : 'Вы: '), ansText(Q, a)),
          same ? null : el('div', {}, el('span', { class: 'chk-k' }, 'По прогнозу: '), ansText(Q, ok)),
          el('div', {}, el('span', { class: 'chk-k' }, stay ? 'Было бы: ' : 'Было: '), F[Q.id]));
      });

      const xs = ss.map((s) => s.t), css = Draw.css;
      const ymax = Math.ceil(Math.max(maxG, E.p90.reduce((a, b) => Math.max(a, b), 0), +this.st.est.gust || 0, LIMITS.gust) / 10) * 10 + 5;
      const cv = el('canvas', { class: 'chart', style: 'height:230px' });
      const estM = +this.st.est.mean, estG = +this.st.est.gust;
      const cmp = (est, f) => (!est ? 'не указан' : Math.abs(est - f) <= 3 ? `${est} уз — точно` : est < f ? `${est} уз — занижен на ${fmtNum(f - est)}` : `${est} уз — завышен на ${fmtNum(est - f)}`);

      this.body.append(...[
        el('div', { class: `verdict v-${shown[1]}` }, shown[0]),
        el('dl', { class: 'score' },
          el('dt', {}, 'Чек-лист'), el('dd', {}, `${right} из ${CHECK.length} совпадают с прогнозом`),
          stay ? null : el('dt', {}, 'Решения в пути'), stay ? null : el('dd', {}, SA.length ? `${SA.filter((a) => a.score === 2).length} из ${SA.length} верные` : 'ситуаций не было'),
          stay || !danger.length ? null : el('dt', {}, 'Готовность'), stay || !danger.length ? null : el('dd', {}, `экипаж был готов к ${ready} из ${danger.length} опасных моментов`)),
        SA.length ? el('h3', {}, 'Решения в пути') : null,
        SA.length ? el('div', { class: 'chk-list' }, ...SA.map((a) => el('div', { class: `chk-item ${a.score === 2 ? 'chk-ok' : 'chk-bad'}` },
          el('div', { class: 'chk-title' }, `${fmtTime(a.t)}. ${SIT[a.kind].text}`),
          el('div', {}, el('span', { class: 'chk-k chk-you' }, a.score === 2 ? 'Верно: ' : a.score === 1 ? 'Осторожно, но можно было иначе: ' : 'Неверно: '), SIT[a.kind].opts[a.choice][0]),
          a.score === 2 ? null : el('div', {}, el('span', { class: 'chk-k' }, 'Лучше: '), SIT[a.kind].opts.filter((o) => o[1] === 2).map((o) => o[0].toLowerCase()).join(' или '))))) : null,
        el('h3', {}, `Чек-лист: ${right} из ${CHECK.length} пунктов совпадают с прогнозом`),
        el('div', { class: 'chk-list' }, ...items),
        el('h3', {}, stay ? 'Если бы вышли' : 'Ветер на переходе'),
        el('table', { class: 'tbl' },
          el('tr', {}, el('th', {}, 'На маршруте'), el('th', {}, 'Средний'), el('th', {}, 'Порывы')),
          el('tr', { class: 'row-fact' }, el('td', {}, 'Факт'), el('td', {}, `${fmtNum(maxF)} уз`), el('td', {}, `${fmtNum(maxG)} уз`)),
          el('tr', {}, el('td', {}, 'Региональная 2 км'), el('td', {}, `${fmtNum(maxRM)} уз`), el('td', {}, `${fmtNum(maxRG)} уз`)),
          el('tr', {}, el('td', {}, 'Ансамбль 9 км, P10–P90'), el('td', {}, '—'), el('td', {}, `${fmtNum(p10)}–${fmtNum(p90)} уз`)),
          el('tr', {}, el('td', {}, 'Ваш прогноз'), el('td', {}, cmp(estM, maxF)), el('td', {}, cmp(estG, maxG)))),
        el('div', { class: 'chart-box' }, el('div', { class: 'chart-title' }, 'Ветер вдоль пройденного пути, уз'), cv,
          el('div', { class: 'legend' }, el('span', { class: 'lg lg-truth' }, 'факт, средний'), el('span', { class: 'lg lg-truthg' }, 'факт, порывы'),
            el('span', { class: 'lg lg-p50' }, 'модель 2 км, порывы'), el('span', { class: 'lg lg-band' }, 'ансамбль порывов P10–P90'), el('span', { class: 'lg lg-limit' }, 'предел экипажа'),
            estG ? el('span', { class: 'lg lg-est' }, 'ваш прогноз порывов') : null, this.events.length ? el('span', { class: 'lg lg-ev' }, 'событие журнала') : null)),
        el('h3', {}, 'Сбылся ли прогноз'),
        el('ul', { class: 'theory' }, ...this.explain(ss, fact, reg, maxG, p10, p90).map((t) => el('li', {}, t))),
        el('h3', {}, 'Что можно было сделать иначе'),
        el('ul', { class: 'theory' }, ...this.advice().map((t) => el('li', {}, t))),
        this.events.length ? el('details', { class: 'log-box' }, el('summary', {}, `Журнал перехода (${this.events.length})`), el('ul', { class: 'log' }, ...this.events.map((e) => el('li', { class: `ev ev-${e.kind}` }, `${fmtTime(e.t)} ${e.text} ${e.area}`)))) : null,
        el('p', { class: 'note' }, `${res.arrived ? `Выход ${fmtTime(this.st.depart)}, прибытие ${fmtTime(res.arrival)}.` : `Выход ${fmtTime(this.st.depart)}.`} Решение: ${({ go: 'идти', stay: 'остаться в марине' })[this.st.decision] || 'идти'}.`),
        el('div', { class: 'actions' },
          el('button', { type: 'button', class: 'btn primary', onclick: () => { this.st.seed += 17; this.result = null; this.go(this.st.decision === 'stay' ? 6 : 5); } }, 'Тот же план, другой факт'),
          el('button', { type: 'button', class: 'btn', onclick: () => this.go(2) }, 'Изменить маршрут'),
          el('button', { type: 'button', class: 'btn', onclick: () => { this.st.seed += 31; this.go(0); } }, 'Другой сценарий')),
      ].filter(Boolean));
      const evMarks = this.events.map((e) => ({ x: e.t, y: e.gust, color: css('--danger') }));
      requestAnimationFrame(() => chart(cv, {
        x0: xs[0], x1: Math.max(xs[xs.length - 1], xs[0] + 1), y0: 0, y1: ymax, xstep: xs[xs.length - 1] - xs[0] > 8 ? 2 : 1, ystep: 10,
        xfmt: (x) => fmtTime(x).replace('завтра ', '+'),
        bands: [{ xs, lo: E.p10, hi: E.p90, color: css('--band') }],
        hlines: [{ y: LIMITS.gust, color: css('--danger'), dash: [3, 3] }, ...(estG ? [{ y: estG, color: css('--est'), dash: [2, 3] }] : [])],
        lines: [
          { xs, ys: reg.map((w) => w.gust), color: css('--ink'), width: 1.5, dash: [5, 4] },
          { xs, ys: fact.map((w) => w.gust), color: css('--accent'), width: 1.2 },
          { xs, ys: fact.map((w) => w.speed), color: css('--accent'), width: 3 },
        ],
        marks: evMarks,
      }));
      const ov = { route: this.st.route, track: res.samples.map((q) => [q.x, q.y]), particles: false };
      this.map.overlays = ov;
      this.map.showCells = false;
      const last = res.samples[res.samples.length - 1];
      this.map.yacht = { x: last.x, y: last.y, heading: last.heading, showWind: false };
      const S = Ens.state(scn, last.t, this.truthP(), 0);
      this.map.setField((x, y) => Wind.at(x, y, S));
    }

    // Crew reacted correctly to a situation within 1.5 h before time t.
    prepared(t) { return (this.st.sitAns || []).some((a) => a.score === 2 && a.t <= t && t - a.t < 1.5); }

    // What actually happened, in the terms of each checklist item.
    facts(maxF, maxG) {
      const scn = this.scn(), tp = this.truthP(), S = this.result.samples, m = (v) => Math.hypot(v[0], v[1]);
      const mx = (f) => S.reduce((a, q) => Math.max(a, f(q.w)), 0);
      const sq = this.events.find((e) => e.kind === 'squall'), over = this.events.filter((e) => e.kind === 'gust' || e.kind === 'strong' || e.kind === 'squall');
      const T = scn.id === 'summer' ? scn.stateAt(16, tp).storm : null;
      const local = [];
      if (mx((w) => m(w.parts.br)) > 5) local.push(`бриз до ${fmtNum(mx((w) => m(w.parts.br)))} уз`);
      if (mx((w) => m(w.parts.kat)) > 3) local.push(`стоковый ветер до ${fmtNum(mx((w) => m(w.parts.kat)))} уз`);
      if (mx((w) => m(w.parts.bo)) > 10) local.push(`бора до ${fmtNum(mx((w) => m(w.parts.bo)))} уз`);
      if (mx((w) => Math.max(w.mods.cape || 0, w.mods.strait || 0)) > 0.3) local.push('усиление у мыса и в проливе');
      let front = 'Фронта не было.';
      if (scn.id === 'front') {
        const k = S.findIndex((q) => q.w.tau != null && q.w.tau >= 0);
        front = k < 0 ? `Фронт пришёл после прихода, у мыса в ${fmtTime(frontAtCape(scn, tp))}.` : k === 0 ? 'Фронт прошёл до выхода.' : `Фронт прошёл над яхтой в ${fmtTime(S[k].t)}.`;
      }
      const storm = sq ? `Шквал от грозы в ${fmtTime(sq.t)} ${sq.area}.` : T ? `Гроза была около ${fmtTime(T.tStart)}–${fmtTime(T.tEnd)}, яхта с ней разминулась.` : scn.id === 'summer' ? 'Гроза в этот день не развилась.' : 'Шквалов от грозы не было.';
      const win = this.safeWindows();
      return {
        warn: scn.id === 'summer' ? (T ? 'Гроза была.' : 'Гроза не развилась.') : scn.id === 'bora' ? `Бора, порывы на маршруте до ${fmtNum(maxG)} уз.` : `Фронт прошёл у мыса в ${fmtTime(frontAtCape(scn, tp))}.`,
        gust: `Средний до ${fmtNum(maxF)} уз, порывы до ${fmtNum(maxG)} уз.`,
        local: local.length ? `${local.join(', ')}.` : 'Местные эффекты на маршруте были слабыми.',
        front, storm,
        fog: 'Тумана не было.',
        shelter: over.length ? `Пределы экипажа превышены ${over.length} раз: запасной вариант был нужен.` : 'Не понадобились.',
        reef: `Порывы до ${fmtNum(maxG)} уз.`,
        window: win.length ? `Без превышения пределов можно было выйти: ${win.map(([a, b]) => (a === b ? fmtTime(a) : `${fmtTime(a)}–${fmtTime(b)}`)).join(', ')}.` : 'Безопасного времени выхода с этим маршрутом не было.',
        watch: this.events.length ? `Первое событие в журнале: ${fmtTime(this.events[0].t)} ${this.events[0].text.replace(/,$/, '')} ${this.events[0].area}.` : 'Событий в журнале не было.',
      };
    }
    safeWindows() {
      if (this._safeKey === `${this.st.seed}|${this.st.route.join(';')}`) return this._safe;
      const scn = this.scn(), tp = this.truthP(), r = this.st.route, safe = [];
      const truthFn = (x, y, t) => Wind.at(x, y, Ens.state(scn, t, tp, 0));
      for (let d = scn.depart[0]; d <= scn.depart[1]; d += 1) {
        const run = sail(r, d, truthFn, scn.end + 6, 3);
        if (run.arrived && !detectEvents(run.samples).some((e) => e.kind !== 'bora')) safe.push(d);
      }
      const ranges = [];
      for (const d of safe) { const lr = ranges[ranges.length - 1]; if (lr && d - lr[1] <= 1) lr[1] = d; else ranges.push([d, d]); }
      this._safeKey = `${this.st.seed}|${this.st.route.join(';')}`; this._safe = ranges;
      return ranges;
    }

    // Which departure times would have been safe on this route in the weather that actually happened.
    advice() {
      const ranges = this.safeWindows(), out = [];
      const inWin = ranges.some(([a, b]) => this.st.depart >= a && this.st.depart <= b);
      if (!ranges.length) out.push(this.st.decision === 'stay' ? 'Безопасного времени выхода с этим маршрутом не было: остаться в марине было верно.' : 'Безопасного времени выхода с этим маршрутом не было: правильное решение — остаться в марине.');
      else if (this.st.decision === 'stay') out.push(inWin ? `Выход в ${fmtTime(this.st.depart)} прошёл бы без превышения пределов. Решение остаться было осторожнее, чем требовалось в этот раз.` : `Выход в ${fmtTime(this.st.depart)} превысил бы пределы экипажа.`);
      else if (!inWin) out.push(`Ваш выход в ${fmtTime(this.st.depart)} в безопасное окно не попал.`);
      out.push('Это видно только задним числом. Перед выходом решение принимают по прогнозу: по P90 ансамбля, предупреждениям и местным поправкам.');
      return out;
    }

    explain(ss, fact, reg, maxG, p10, p90) {
      const out = [], scn = this.scn(), m = (v) => Math.hypot(v[0], v[1]);
      let k = 0, best = -Infinity;
      fact.forEach((w, i) => { const d = w.gust - reg[i].gust; if (d > best) { best = d; k = i; } });
      const s = ss[k], w = fact[k], where = `${Bay.areaName(s.x, s.y)} в ${fmtTime(s.t)}`;
      if (best > 6) {
        out.push(`Наибольшая ошибка модели ${where}: модель 2 км дала порывы ${fmtNum(reg[k].gust)} уз, факт ${fmtNum(w.gust)} уз.`);
        // Attribute by how much each component of the real wind exceeded the same component in the model.
        const M = Wind.at(s.x, s.y, Ens.state(scn, s.t, Ens.CONTROL, 2));
        const causes = [
          ['storm', m(w.parts.st) - m(M.parts.st)], ['bora', m(w.parts.bo) - m(M.parts.bo)], ['breeze', m(w.parts.br) - m(M.parts.br)],
          ['kat', m(w.parts.kat) - m(M.parts.kat)], ['syn', m(w.parts.syn) - m(M.parts.syn)],
          ['strait', (w.mods.strait || 0) - (M.mods.strait || 0) > 0.3 ? w.speed * 0.2 : 0],
          ['cape', (w.mods.cape || 0) - (M.mods.cape || 0) > 0.3 ? w.speed * 0.2 : 0],
        ].filter((c) => c[1] > 2.5).sort((a, b) => b[1] - a[1]).slice(0, 2);
        const TXT = {
          storm: 'Причина — шквал от грозы: в контрольном прогнозе ячейки здесь в это время не было. Модель показывает условия для гроз, но не место и время.',
          bora: 'Причина — струя боры: под перевалами и на выходе из пролива ветер сильнее, чем в ячейках модели.',
          breeze: 'Причина — бриз: в этот день он был сильнее или начался раньше, чем в модели.',
          kat: 'Причина — стоковый ветер из долины: модели занижают катабатические ветры в 1,5–2 раза.',
          syn: 'Причина — фон: синоптический ветер в этот день был сильнее, чем в контрольном прогнозе. Это ошибка начальных данных, её показывает разброс ансамбля.',
          strait: 'Пролив Узкий шириной 1 км меньше ячейки модели: воронка усилила ветер и развернула его вдоль пролива.',
          cape: 'У мыса поток ускоряется на 20–40 %, а в модели этого почти нет.',
        };
        for (const [c] of causes) out.push(TXT[c]);
        if (!causes.length) out.push('Разница складывается из нескольких небольших местных эффектов и порывистости, которых нет в ячейке модели.');
        if (w.tau != null && Math.abs(w.tau) < 1) out.push('В этот момент проходил холодный фронт: шквал на 10–20 уз выше среднего.');
      } else {
        const rg = Math.max(...reg.map((r) => r.gust));
        if (rg - maxG > 6) out.push(`Региональная модель дала на маршруте порывы до ${fmtNum(rg)} уз, факт ${fmtNum(maxG)} уз: в этот раз модель завысила ветер.`);
        else out.push('Региональная модель на маршруте ошиблась не больше чем на 6 уз в порывах.');
      }
      if (scn.id === 'front') {
        const tc = (p) => { const F = scn.stateAt(12, p).front, nx = Math.sin((F.moveDir * Math.PI) / 180), ny = Math.cos((F.moveDir * Math.PI) / 180); return F.t0 + ((Bay.CAPE.x - F.ref[0]) * nx + (Bay.CAPE.y - F.ref[1]) * ny) / F.speed; };
        const dt = tc(this.truthP()) - tc(Ens.CONTROL);
        out.push(`Фронт прошёл у мыса в ${fmtTime(tc(this.truthP()))}, в контрольном прогнозе в ${fmtTime(tc(Ens.CONTROL))} (${dt < 0 ? 'раньше' : 'позже'} на ${fmtNum(Math.abs(dt), 1)} ч).`);
      }
      if (scn.id === 'summer') {
        const T = scn.stateAt(16, this.truthP()).storm;
        const hitSq = this.events.find((e) => e.kind === 'squall');
        if (!T) out.push(`В этот день гроза не развилась, хотя ансамбль давал её в ${this.mem.filter((p) => scn.stateAt(16, p).storm).length} из 30 сценариев. Планировать на грозу всё равно было правильно: решение принимают по прогнозу, а не по факту.`);
        else if (hitSq) out.push(`Гроза развилась около ${fmtTime(T.tStart)} и застала яхту: шквал в ${fmtTime(hitSq.t)} ${hitSq.area}.`);
        else out.push(`Гроза развилась около ${fmtTime(T.tStart)}, сильнее всего была около ${fmtTime(T.tPeak)}; яхта с ней разминулась.`);
      }
      if (maxG > p90) out.push(`Факт выше P90 ансамбля (${fmtNum(p90)} уз). Так бывает чаще, чем один раз из десяти: сырые ансамбли слишком узкие, а сетка 9 км не видит местных усилений.`);
      else if (maxG < p10) out.push('Факт ниже P10 ансамбля: в этот раз погода оказалась мягче прогноза.');
      else out.push(`Факт в пределах ансамбля (P10–P90 ${fmtNum(p10)}–${fmtNum(p90)} уз): прогноз сбылся.`);
      return out;
    }
  }

  function detectEvents(samples) {
    const ev = [], lastT = {};
    for (const s of samples) {
      const w = s.w, area = Bay.areaName(s.x, s.y), mag = (v) => Math.hypot(v[0], v[1]);
      const hits = [];
      if (mag(w.parts.st) > 12) hits.push(['squall', 'Шквал от грозы,']);
      if (mag(w.parts.bo) > 18) hits.push(['bora', 'Бора,']);
      if (w.gust > LIMITS.gust) hits.push(['gust', `Порыв ${fmtNum(w.gust)} уз,`]);
      if (w.speed > LIMITS.mean) hits.push(['strong', `Средний ветер ${fmtNum(w.speed)} уз,`]);
      for (const [kind, text] of hits) {
        if (lastT[kind] != null && s.t - lastT[kind] < 0.5) { lastT[kind] = s.t; continue; }
        lastT[kind] = s.t;
        ev.push({ t: s.t, kind, text, area, gust: w.gust, x: s.x, y: s.y });
      }
    }
    return ev;
  }

  globalThis.Final = { FinalView, sail, boatSpeed, detectEvents };
})();
