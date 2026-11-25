// Final passage: choose a scenario, read the forecast from several sources, mark the risks on the given route,
// sail it in the "real" weather with one or two decisions on the way, then compare the marks with the
// forecast and with what happened.
(function () {
  const { el, fmtNum, fmtTime, control, Readout, chart } = globalThis.UI;
  const Wind = globalThis.Wind, Bay = globalThis.Bay, Ens = globalThis.Ens, W = Bay.W, H = Bay.H;
  const LIMITS = { mean: 25, gust: 35 };
  const KM_PER_MIN_PER_KN = 1.852 / 60;
  const STEPS = ['Ситуация', 'Прогноз', 'Риски', 'Переход', 'Разбор'];
  // The route is given: from the marina through the strait and past the cape to the harbour.
  const ROUTE = [[Bay.MARINA.x, Bay.MARINA.y], [22.6, 15.6], Bay.STRAIT.b, Bay.STRAIT.a, [20, 10], [14, 7.5], [9, 4], [6, 3.5], [4, 6], [3, 10], [Bay.HARBOUR.x, Bay.HARBOUR.y]];
  // Departure for each scenario, chosen so that its main hazard falls on the passage.
  const DEPART = { summer: 13, front: 11, night: 20 };
  const STEPS_NIGHT = ['Ситуация', 'Прогноз', 'Стоянка', 'Ночь', 'Разбор'];
  // Night anchorages: under a valley mouth (katabatic wind), on the open roadstead (swell from the sea) and
  // under the south shore of the Inner Bay (sheltered from both).
  const ANCH = [
    { id: 'A', x: 22.25, y: 20.1, name: 'у устья Северной долины', text: 'Северный берег Внутреннего залива, в 400 м от пляжа. Вечером здесь штиль и гладкая вода.' },
    { id: 'B', x: 14, y: 7.5, name: 'на открытом рейде во Внешнем заливе', text: 'Далеко от берега и от гор, вечером ветер слабый. Залив открыт на юг, к морю.' },
    { id: 'C', x: 24.5, y: 15.6, name: 'у южного берега Внутреннего залива', text: 'В 1 км от низкого южного берега, до марины 2 км.' },
  ];
  // Swell from the open sea reaches every anchorage outside the Inner Bay.
  const exposed = (x, y) => !(y > 13.8 && x > 19);
  // Way between anchorages by water: through the strait between the bays.
  const ANCH_PATH = [[22.25, 20.1], [24.5, 15.6], [22.6, 15.6], Bay.STRAIT.b, Bay.STRAIT.a, [20, 10], [14, 7.5]];
  const anchPath = (from, to) => {
    const i = ANCH_PATH.findIndex((q) => q[0] === from.x && q[1] === from.y), j = ANCH_PATH.findIndex((q) => q[0] === to.x && q[1] === to.y);
    return i <= j ? ANCH_PATH.slice(i, j + 1) : ANCH_PATH.slice(j, i + 1).reverse();
  };
  // Model runs. The app opens on the previous run; the fresh one differs, and the question is which to plan by.
  const OLDRUN = { summer: { u: 0.9 }, front: { t: 1.5 }, bora: { s: -1.2, t: 1.2 }, night: { t: -2 } };
  const RUNQ = {
    day: { text: 'Сейчас 07:30. В приложении региональная модель, прогон вчера 18:00. Следующий прогон, 06:00, появится около 10:00, до выхода.',
      q: 'По какому прогону планировать переход?', names: ['вчера 18:00', 'сегодня 06:00'],
      opts: [['По вчерашнему 18:00: он уже есть, а выход скоро', 0], ['Дождаться прогона 06:00, сравнить со вчерашним и перед выходом проверить ещё раз', 2], ['Всё равно: прогоны одной модели одинаковые', 0]] },
    night: { text: 'Сейчас 18:00. В приложении прогон сегодня 00:00. Прогон 12:00 вышел в 16:00, но приложение его ещё не загрузило.',
      q: 'Какой прогон смотреть на ночь?', names: ['сегодня 00:00', 'сегодня 12:00'],
      opts: [['Обновить приложение и смотреть прогон 12:00', 2], ['Прогон 00:00: разница в 12 часов не важна', 0], ['Смотреть только бюллетень', 0]] },
  };
  // Debrief line on the model run question.
  function runLine(st) {
    const Q = RUNQ[st.scn === 'night' ? 'night' : 'day'];
    if (st.runAns == null) return ['Прогон', 'вопрос пропущен'];
    return ['Прогон', `${Q.opts[st.runAns][1] === 2 ? 'верно' : 'неверно'}: ${Q.opts[st.runAns][0].toLowerCase()}. ${OLDTXT[st.scn]}`];
  }
  const OLDTXT = {
    summer: 'Во вчерашнем прогоне грозы не было, в свежем она есть после 15:00.',
    front: 'Во вчерашнем прогоне фронт приходил на 3 часа позже, чем в свежем.',
    bora: 'Во вчерашнем прогоне бора была слабее и начиналась позже.',
    night: 'В прогоне 00:00 стоковый ветер ночью был заметно слабее, чем в прогоне 12:00.',
  };

  // Risks the skipper can mark. `tol`: how far from the forecast zone a mark still counts, km (0: no place).
  const RISKS = [
    { id: 'storm', label: 'Гроза и шквал', short: 'Гроза', tol: 8 },
    { id: 'front', label: 'Холодный фронт: шквал и заход ветра', short: 'Фронт', tol: 5 },
    { id: 'bora', label: 'Бора: сильные порывы с гор', short: 'Бора', tol: 4 },
    { id: 'breeze', label: 'Бриз: ветер у берега усиливается после полудня', short: 'Бриз', tol: 4 },
    { id: 'kat', label: 'Стоковый ветер из долины', short: 'Сток', tol: 3.5 },
    { id: 'strait', label: 'Усиление ветра в проливе', short: 'Пролив', tol: 3 },
    { id: 'cape', label: 'Усиление ветра у мыса', short: 'Мыс', tol: 3 },
    { id: 'lee', label: 'Ветровая тень и порывы под высоким берегом', short: 'Тень', tol: 4 },
    { id: 'fog', label: 'Туман', short: 'Туман', tol: 0 },
    { id: 'wave', label: 'Высокая волна, больше 1,5 м', short: 'Волна', tol: 4 },
    { id: 'swell', label: 'Зыбь из открытого моря', short: 'Зыбь', tol: 4, night: true },
  ];
  // Swell from the open sea in each scenario, metres and direction it comes from.
  const SWELL = { summer: null, front: { h: 1.5, dir: 220 }, night: { h: 1.3, dir: 185 } };
  const waveAt = (scn, x, y, w) => globalThis.Wave.at(x, y, w, SWELL[scn]).hs;
  const waveFull = (scn, x, y, w) => globalThis.Wave.at(x, y, w, SWELL[scn]);
  const risksFor = (id) => RISKS.filter((R) => !R.night || id === 'night');
  const mag = (v) => Math.hypot(v[0], v[1]);
  // Whether a risk acts on the yacht at a point of the passage, from the wind there.
  const DETECT = {
    storm: (w) => mag(w.parts.st) > 8, front: (w) => w.tau != null && Math.abs(w.tau) < 0.5, bora: (w) => mag(w.parts.bo) > 12,
    breeze: (w) => mag(w.parts.br) > 5, kat: (w) => mag(w.parts.kat) > 6, strait: (w) => (w.mods.strait || 0) > 0.3,
    cape: (w) => (w.mods.cape || 0) > 0.3, lee: (w) => !!w.variable, fog: () => false, swell: () => false, wave: () => false,
  };

  const DESCR = {
    summer: 'Слабый градиент, ясно, жарко. Утром стоковый ветер из долин, днём бриз, к вечеру над горами грозы.',
    bora: 'Холодный воздух на плато, антициклон за хребтом, циклон над морем. Бора с ночи, ослабление к утру завтра.',
    front: 'С северо-запада идёт холодный фронт. До него юго-западный ветер крепчает, за ним шквал и порывистый северо-запад.',
    night: 'Тихий ясный вечер, слабый градиент. Ночь на якоре во Внутреннем заливе, утром переход.',
  };
  const BULLETIN = {
    night: 'ПРОГНОЗ ДЛЯ ПРИБРЕЖНЫХ ВОД. Выпуск 18:00.\nВетер переменный 2–6 уз,\nночью у берега ветер с суши 5–10 уз.\nВетровая волна до 0,3 м, зыбь с юга 1–1,5 м.\nЯсно, видимость хорошая.',
    summer: 'ПРОГНОЗ ДЛЯ ПРИБРЕЖНЫХ ВОД. Выпуск 06:00.\nВетер N–NW 3–8 уз, днём у берега бриз SW–W 10–14 уз.\nВолна 0,3–0,5 м.\nПосле 15:00 над горами возможны грозы, при грозе шквалы до 35 уз.\nВидимость хорошая, при грозе плохая.',
    bora: 'ШТОРМОВОЕ ПРЕДУПРЕЖДЕНИЕ. Выпуск 06:00.\nБора NE 25–35 уз, порывы до 55 уз во Внутреннем заливе,\nв проливе Узком и у подножия хребта.\nВ открытом море NE 12–20 уз.\nОслабление ночью и утром завтра.\nУ берега волна до 0,5 м, мористее 1–1,5 м.',
    front: 'ПРЕДУПРЕЖДЕНИЕ О СИЛЬНОМ ВЕТРЕ. Выпуск 06:00.\nХолодный фронт. До фронта SW 15–22 уз, порывы до 28 уз.\nПрохождение фронта около 14:00 ± 2–3 ч: шквалы до 40 уз, ливень, гроза.\nПосле фронта NW 20–27 уз, порывы 35 уз, ослабление к вечеру.\nВолна 1,5–2,5 м.',
  };

  // What the crew sees in the marina on the morning of departure (signs from the lecture).
  const OBS = {
    night: ['Вечер тихий, небо ясное. С юга идёт пологая зыбь, у пляжей Внешнего залива накат.', 'Барометр 1020 гПа, за 3 ч не изменился.', 'Температура 22 °C, точка росы 13 °C.'],
    summer: ['Небо ясное, к 10:00 над хребтом первые кучевые.', 'Барометр за 3 ч не изменился.', 'Температура 24 °C, точка росы 16 °C.'],
    bora: ['На гребне облачная шапка, горы видны резко.', 'Холодно и сухо.', 'Температура 3 °C, точка росы −8 °C.'],
    front: ['Перистые сгущаются, вокруг солнца гало. Зыбь с юго-запада.', 'Барометр за 3 ч упал на 4 гПа.', 'Температура 18 °C, точка росы 14 °C.'],
  };

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
    katEve: { text: 'Солнце село, с гор потянуло прохладой, у берега ветер с суши 3–5 уз. Небо ясное, первые звёзды.',
      opts: [['Следить за ветром: ясной ночью холодный воздух стекает с гор и к утру ветер у устьев долин крепчает', 2], ['Сразу уйти в марину', 1], ['Не обращать внимания: ветер слабый', 0]] },
    tower: { text: 'Над хребтом кучевые выросли в башню, верх расплывается наковальней.',
      opts: [['Приготовить рифы и следить за тучей по радару', 2], ['Сразу взять все рифы и идти под мотором', 1], ['Не обращать внимания: туча над горами', 0]] },
  };
  const SIDE = ['к северу', 'к северо-востоку', 'к востоку', 'к юго-востоку', 'к югу', 'к юго-западу', 'к западу', 'к северо-западу'];
  // The main decision on the way. Each option is sailed in the actual weather; the score follows from the outcomes.
  // kinds: go (carry on), wait (stop here for `h` hours), back (return to the marina), backwait (return, wait, go again)
  const DECIDE = {
    storm: [['Идти дальше по маршруту', { kind: 'go' }], ['Лечь в дрейф и переждать здесь 1,5 часа', { kind: 'wait', h: 1.5 }], ['Повернуть назад в марину', { kind: 'back' }]],
    front: [['Идти дальше по маршруту', { kind: 'go' }], ['Вернуться в марину, переждать фронт 3 часа и выйти снова', { kind: 'backwait', h: 3 }], ['Вернуться в марину и сегодня не выходить', { kind: 'back' }]],

  };
  // When and what the crew notices on this passage, from the weather that will actually happen.
  // Radar reflectivity, dBZ, of the actual weather: the thunderstorm cell and the rain at a cold front.
  // Showers are patchy; the pattern moves with the front.
  function noise(x, y) {
    const h = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (h(i, j) * (1 - sx) + h(i + 1, j) * sx) * (1 - sy) + (h(i, j + 1) * (1 - sx) + h(i + 1, j + 1) * sx) * sy;
  }
  // Growing cumulus tower over the ridge in the hours before the thunderstorm cell forms; g from 0 to 1.
  function tower(T, h) {
    return { x: T.x0, y: T.y0, g: Wind.sstep(T.tStart - 4, T.tStart, h) * (1 - Wind.sstep(T.tStart + 0.3, T.tStart + 1, h)) };
  }
  function radar(S, x, y) {
    let z = 0;
    if (S.front) {
      const F = S.front, a = F.moveDir * Math.PI / 180, nx = Math.sin(a), ny = Math.cos(a);
      const d = (S.hour - F.t0) * F.speed - ((x - F.ref[0]) * nx + (y - F.ref[1]) * ny); // km ahead of the front line, > 0 ahead
      const al = -(x - F.ref[0]) * ny + (y - F.ref[1]) * nx;
      const n1 = noise(al / 2.2, d / 2.2), n2 = noise(al / 4 + 17, d / 4 + 5);
      z = Math.max(z, 50 * Math.exp(-(((d - 0.6) / 2.2) ** 2)) * (0.7 + 0.4 * n1)); // squall line on the front
      if (d < 0) z = Math.max(z, 40 * Math.exp(d / 22) * Wind.sstep(0.45, 0.8, n2)); // showers behind it
      else z = Math.max(z, 26 * Math.exp(-d / 9) * Wind.sstep(0.25, 0.6, n2)); // light rain ahead
    }
    if (S.storm) {
      const T = S.storm, tr = Math.hypot(x - T.x0, y - T.y0);
      z = Math.max(z, 36 * Wind.sstep(T.tStart - 1.5, T.tStart, S.hour) * (1 - Wind.sstep(T.tStart + 0.3, T.tStart + 1, S.hour)) * Math.exp(-((tr / 1.3) ** 2))); // first echo in the tower
      const c = Wind.stormState(S.storm, S.hour);
      if (c.I > 0.02) {
        const r = Math.hypot(x - c.x, y - c.y), n = noise(x / 3 + 3, y / 3);
        z = Math.max(z, (24 + 36 * c.I) * Math.exp(-((r / (1.8 + 0.8 * c.I)) ** 2)) * (0.92 + 0.12 * n));
      }
    }
    return z;
  }

  // Bilinear interpolation of a cell value between cell centres.
  function interp(C, g, x, y) {
    const fx = Math.min(C.nx - 1.001, Math.max(0, x / C.res - 0.5)), fy = Math.min(C.ny - 1.001, Math.max(0, y / C.res - 0.5));
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, L = C.list, k = j * C.nx + i;
    return (g(L[k]) * (1 - tx) + g(L[k + 1]) * tx) * (1 - ty) + (g(L[k + C.nx]) * (1 - tx) + g(L[k + C.nx + 1]) * tx) * ty;
  }



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
  function sail(route, depart, windFn, endHour, dt = 2, legOff = 0) {
    let x = route[0][0], y = route[0][1], leg = 1, t = depart;
    const out = [];
    while (leg < route.length && t < endHour) {
      const [tx, ty] = route[leg], dx = tx - x, dy = ty - y, dist = Math.hypot(dx, dy);
      const b = bearing(dx, dy), w = windFn(x, y, t);
      const v = boatSpeed(w.speed, w.dir == null ? 90 : angAbs(w.dir, b));
      out.push({ t, x, y, w, v, heading: b, leg: leg + legOff });
      const step = v * KM_PER_MIN_PER_KN * dt;
      if (step >= dist) { x = tx; y = ty; leg++; t += (dist / (v * KM_PER_MIN_PER_KN)) / 60; }
      else { x += (dx / dist) * step; y += (dy / dist) * step; t += dt / 60; }
    }
    const arrived = leg >= route.length;
    if (arrived) out.push({ t, x, y, w: windFn(x, y, t), v: 0, heading: out.length ? out[out.length - 1].heading : 0, leg: route.length - 1 + legOff });
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
    if (id === 'summer' || id === 'night') { iso(w * 0.5, h * 0.62, 3, w * 0.16, h * 0.13, 0); letter('H', w * 0.5, h * 0.62, css('--accent')); }
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
        this.intro = el('details', { class: 'prose final-intro', open: '' }, el('summary', {}, 'Условия и порядок перехода'), ...(C.before || []).map((t) => el('p', {}, UI.typo(t)))),
        el('div', { class: 'final-grid' }, mapBox, this.panel),
        C.after && C.after.length ? el('div', { class: 'prose' }, ...C.after.map((t) => el('p', {}, UI.typo(t)))) : '',
        C.key && C.key.length ? el('section', { class: 'key', 'aria-label': 'Главное' }, el('h2', {}, 'Главное'), el('ul', {}, ...C.key.map((k) => el('li', {}, UI.typo(k))))) : '');
      root.append(this.root);
      this.map = new MapView(mapBox, { yacht: { x: Bay.MARINA.x, y: Bay.MARINA.y, showWind: false }, mode: 'none', onClick: (p) => this.onMapClick(p) });
      this.flat = new globalThis.FlatMap(mapBox, { onClick: (p) => this.onMapClick(p) }); // forecast map, steps 2 and 3
      this.flat.wrap.hidden = true;
      this.hint = el('div', { class: 'map-hint' }, '');
      mapBox.append(this.hint, Topics.legendScale());
      this.mem = Ens.members(30, 21);
      this.cellCache = new Map();
      this.st = { step: 0, scn: null, seed: 1 + Math.floor(Math.random() * 1e6), risks: {}, route: ROUTE, depart: 11 };
      this.go(0);
    }

    scn() { return Ens.SCENARIOS[this.st.scn]; }
    runP() { return this.st.run === 'new' ? Ens.CONTROL : { ...Ens.CONTROL, ...OLDRUN[this.st.scn] }; }
    runName() { return RUNQ[this.st.scn === 'night' ? 'night' : 'day'].names[this.st.run === 'new' ? 1 : 0]; }
    truthP() { return Ens.truth(this.st.seed); }
    cells(res, hour) {
      const key = `${this.st.scn}|${this.st.run}|${res}|${Math.round(hour * 2) / 2}`;
      if (!this.cellCache.has(key)) {
        if (this.cellCache.size > 120) this.cellCache.clear();
        const scn = this.scn(), h = Math.round(hour * 2) / 2;
        this.cellCache.set(key, Topics.modelCells((r) => Ens.state(scn, h, this.runP(), r), res));
      }
      return this.cellCache.get(key);
    }
    // Model wind at a point, interpolated between cell centres as forecast apps draw it: the 9 km model gives
    // a smooth field, the 2 km model shows the strait, the cape and the valleys.
    modelWind(res, x, y, hour) {
      const C = this.cells(res, hour), f = (g) => interp(C, g, x, y);
      const u = f((c) => c.u), v = f((c) => c.v);
      return { u, v, speed: f((c) => c.speed), gust: f((c) => c.gust), dir: Math.hypot(u, v) > 0.05 ? Wind.dirOf(u, v) : null, variable: false };
    }
    // Model precipitation: the radar picture averaged over each model cell, then interpolated.
    precipCells(res, hour) {
      const key = `${this.st.scn}|${this.st.run}|${res}|${Math.round(hour * 2) / 2}`;
      if (this._pk !== key) {
        const C = this.cells(res, hour), S = Ens.state(this.scn(), Math.round(hour * 2) / 2, this.runP(), res);
        this._pc = { res: C.res, nx: C.nx, ny: C.ny, list: C.list.map((c) => {
          const w = Math.min(c.size, W - c.x0), h = Math.min(c.size, H - c.y0);
          let z = 0, n = 0; for (let a = 1 / 6; a < 1; a += 1 / 3) for (let b = 1 / 6; b < 1; b += 1 / 3) { z += radar(S, c.x0 + a * w, c.y0 + b * h); n++; }
          return { z: z / n };
        }) };
        this._pk = key;
      }
      return this._pc;
    }
    // The forecast map draws model fields only, as forecast services do: fronts and storms show as precipitation.
    showModel(res, hour) {
      const P = this.layer === 'rain' ? this.precipCells(res, hour) : null, sc = this.st.scn;
      const wind = (x, y) => this.modelWind(res, x, y, hour);
      this.flat.set({
        wind, legend: this.layer,
        precip: P ? (x, y) => interp(P, (c) => c.z, x, y) : null,
        color: this.layer === 'wave' ? (x, y) => Draw.waveRGB(waveAt(sc, x, y, wind(x, y))) : null,
        arrows: this.layer === 'wave' ? (x, y) => { const q = waveFull(sc, x, y, wind(x, y)); return { u: q.u, v: q.v, h: q.hs }; } : null,
        flow: this.layer === 'wave' ? (x, y) => { const q = waveFull(sc, x, y, wind(x, y)); return [q.u * q.hs * 8, q.v * q.hs * 8]; } : null,
        route: this.st.scn === 'night' ? null : ROUTE, probe: this.probe,
        marks: [...(this.st.scn === 'night' ? ANCH.map((a) => ({ x: a.x, y: a.y, text: a.id, on: this.st.anchor === a.id })) : []), ...(this.riskMarks() || [])],
        tag: `${res >= 5 ? 'Глобальная модель 9 км' : 'Региональная модель 2 км'}, прогон ${this.runName()}. На карте ${fmtTime(hour)}`,
      });
    }

    // Open a scenario at a given step (0 choose, 1 forecast, 2 risks).
    applyPreset(preset) {
      const P = preset || {};
      if (P.scn && Ens.SCENARIOS[P.scn]) { this.pickScenario(P.scn, Math.max(1, Math.min(2, P.step ?? 1))); } else this.go(0);
    }
    pickScenario(id, step = 1) {
      Object.assign(this.st, { scn: id, depart: DEPART[id], risks: {}, anchor: null, run: 'old', runAns: null });
      this.activeRisk = null; this.result = null; this._fz = null;
      this.probe = id === 'night' ? [ANCH[0].x, ANCH[0].y] : [9, 4]; this.briefHour = id === 'night' ? 28.5 : DEPART[id]; this.briefModel = 2;
      this.go(step);
    }

    go(step) {
      this.st.step = step;
      this.intro.open = step === 0; // the conditions stay one click away after the first step
      this.map.follow = false;
      this.stepper.innerHTML = '';
      this.maxStep = Math.max(this.maxStep || 0, step);
      // Steps already reached can be reopened; the passage itself only through the decision.
      (this.st.scn === 'night' ? STEPS_NIGHT : STEPS).forEach((s, i) => {
        const open = i !== step && i <= this.maxStep && this.st.scn && (i <= 2 || (i === 4 && this.result));
        const lab = [el('span', {}, String(i + 1)), s];
        this.stepper.append(el('li', { class: i === step ? 'on' : i < this.maxStep || i < step ? 'done' : '' },
          open ? el('button', { type: 'button', class: 'step-btn', onclick: () => this.go(i) }, ...lab) : el('span', { class: 'step-btn', 'aria-current': i === step ? 'step' : null }, ...lab)));
      });
      this.body.innerHTML = '';
      this.map.mode = 'none';
      this.map.setRadar(null);
      const flat = step === 1 || step === 2, wasFlat = !this.flat.wrap.hidden;
      this.flat.wrap.hidden = !flat; this.map.wrap.hidden = flat;
      if (wasFlat && !flat) this.map.activate();
      if (this.running) { cancelAnimationFrame(this.running); this.running = null; }
      const night = this.st.scn === 'night';
      [this.stepScenario, this.stepBrief, night ? this.stepAnchor : this.stepRisks, night ? this.runNight : this.stepRun, night ? this.debriefNight : this.stepDebrief][step].call(this);
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
      if (this.st.step === 2 && this.activeRisk) { this.st.risks[this.activeRisk] = [p[0], p[1]]; this.refreshRisks(); }
      else if (this.st.step === 1 || this.st.step === 2) { this.probe = p; this.refreshBrief(); }
    }

    // Forecast tools: model on the map, forecast time, point for the meteogram. Open on the forecast step,
    // a collapsible block on the route, checklist and decision steps.
    forecastTools(main) {
      const scn = this.scn();
      this.meteo = el('canvas', { class: 'chart', style: 'height:200px' });
      this.meteoNote = el('div', { class: 'legend' });
      this.briefRO = new Readout(el('div'));
      const S0 = Bay.STRAIT, places = scn.id === 'night' ? [...ANCH.map((a) => [`Стоянка ${a.id}`, [a.x, a.y]]), ['Марина', [Bay.MARINA.x, Bay.MARINA.y - 0.6]]]
        : [['Марина', [Bay.MARINA.x, Bay.MARINA.y - 0.6]], ['Пролив', [(S0.a[0] + S0.b[0]) / 2, (S0.a[1] + S0.b[1]) / 2]], ['Мыс', [8.6, 3.9]], ['Порт Каменка', [Bay.HARBOUR.x + 0.6, Bay.HARBOUR.y]]];
      const at = el('div', { class: 'actions place-btns' }, ...places.map(([n, pt]) => el('button', { type: 'button', class: 'btn', onclick: () => { this.probe = pt; this.refreshBrief(); } }, n)));
      const box = el('div', { class: 'fc-tools' },
        control({ id: 'model', type: 'seg', label: 'Модель на карте', options: [[9, 'Глобальная 9 км'], [2, 'Региональная 2 км']] }, this.briefModel, (v) => { this.briefModel = v; this.refreshBrief(); }),
        control({ id: 'layer', type: 'seg', label: 'Слой карты', options: [['wind', 'Ветер'], ['wave', 'Волна'], ['rain', 'Осадки']] }, this.layer || 'wind', (v) => { this.layer = v; this.refreshBrief(); }),
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
      this.hint.textContent = 'Ветер пока не показан: выберите ситуацию. Маршрут ведёт от белого кружка (Марина Тихая) через пролив Узкий и мимо мыса Острый к квадрату (Порт Каменка), около 20 миль.';
      this.map.yacht = { x: Bay.MARINA.x, y: Bay.MARINA.y, showWind: false };
      this.map.showCells = false;
      this.map.overlays = { particles: false, colors: false, route: ROUTE };
      this.map.setField(() => ({ u: 0, v: 0, speed: 0, gust: 0, dir: null }));
      this.body.append(el('p', { class: 'lead' }, 'Прогноз здесь такой, как его дают модели. Погода на переходе будет одним из возможных вариантов.'));
      const list = el('div', { class: 'cards' });
      for (const id of ['summer', 'front', 'night']) {
        const S = Ens.SCENARIOS[id];
        list.append(el('button', { type: 'button', class: 'card', onclick: () => this.pickScenario(id) },
          el('div', { class: 'card-title' }, S.name), el('div', { class: 'card-sub' }, id === 'night' ? `${S.season}. С вечера до утра` : `${S.season}. Выход в ${fmtTime(DEPART[id])}`), el('div', { class: 'card-text' }, DESCR[id])));
      }
      this.body.append(list, el('p', { class: 'note' }, `Пределы экипажа: средний ветер до ${LIMITS.mean} уз, порывы до ${LIMITS.gust} уз.`));
    }

    // ------------------------------------------------------------ 2 briefing
    stepBrief() {
      const scn = this.scn();
      this.hint.textContent = 'Карта прогноза, как в приложениях: цвет показывает средний ветер по модели, бегущие штрихи показывают, куда он дует. Нажмите на карту, чтобы посмотреть метеограмму в точке.';
      this.map.mode = 'probe';
      this.map.yacht = null;
      const sk = el('canvas', { class: 'sketch', style: 'height:150px' });
      this.body.append(
        el('h3', {}, `${scn.name}. ${scn.season}`),
        el('div', { class: 'brief-grid' }, el('div', {}, el('div', { class: 'chart-title' }, 'Синоптическая ситуация'), sk), el('pre', { class: 'bulletin' }, BULLETIN[scn.id]),
          el('div', {}, el('div', { class: 'chart-title' }, 'Утром в марине'), el('ul', { class: 'theory' }, ...OBS[scn.id].map((t) => el('li', {}, t))))),
        this.runBox = el('div', { class: 'quiz run-q' }),
        this.forecastTools(true),
        this.navBar(['Ситуация', () => this.go(0)], [scn.id === 'night' ? 'Стоянка' : 'Риски', () => this.go(2)]),
      );
      requestAnimationFrame(() => sketch(sk, scn.id));
      this.refreshRun();
      this.refreshBrief();
    }
    // Which model run to trust: asked once, then both runs can be compared on the map.
    refreshRun() {
      const Q = RUNQ[this.st.scn === 'night' ? 'night' : 'day'], b = this.runBox;
      if (!b) return;
      b.innerHTML = '';
      b.append(el('div', { class: 'quiz-q' }, 'Свежесть прогноза'), el('p', {}, Q.text), el('div', { class: 'sit-q' }, Q.q));
      if (this.st.runAns == null) {
        b.append(...Q.opts.map(([txt, sc], k) => el('button', { type: 'button', class: 'quiz-opt', onclick: () => { this.st.runAns = k; this.st.run = 'new'; this.refreshRun(); this.refreshBrief(); } }, txt)));
        return;
      }
      const [txt, sc] = Q.opts[this.st.runAns];
      b.append(el('div', { class: `chk-item ${sc === 2 ? 'chk-ok' : 'chk-bad'}` }, el('span', { class: 'chk-k chk-you' }, sc === 2 ? 'Верно: ' : 'Неверно: '), txt),
        el('p', { class: 'note' }, `${this.st.scn === 'night' ? 'Приложение обновлено' : 'В 10:00 вышел прогон 06:00'}. Модель обновляют 2–4 раза в сутки, и свежий прогон точнее: у него меньше срок прогноза. Сравните прогоны на карте.`),
        control({ id: 'run', type: 'seg', label: 'Прогон на карте', options: [['old', Q.names[0]], ['new', Q.names[1]]] }, this.st.run, (v) => { this.st.run = v; this.refreshBrief(); }));
    }
    refreshBrief() {
      const scn = this.scn(), h = this.briefHour, p = this.probe;
      this.showModel(this.briefModel, h);
      if (!this.meteo || !this.meteo.isConnected) return;
      const w = this.modelWind(this.briefModel, p[0], p[1], h);
      this.briefRO.update(w, [`${Bay.areaName(p[0], p[1])}, ${fmtTime(h)}`], `Модель ${this.briefModel} км`);
      const hours = []; for (let t = scn.start; t <= scn.end; t += 1) hours.push(t);
      const key = `${scn.id}|${this.st.run}|${p[0]}|${p[1]}`;
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
        el('span', { class: 'lg lg-mean' }, 'глобальная 9 км'), el('span', { class: 'lg lg-p50' }, 'региональная 2 км'), el('span', { class: 'lg lg-dot' }, 'порывы региональной 2 км'));
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
        const w = this.modelWind(res, p[0], p[1], t), S = Ens.state(scn, t, this.runP(), res);
        return { t, w, p90: this._ens.p90[i], bf: Wind.beaufort(w.speed), pr: Wind.pressure(p[0], p[1], S), ts: this._ts[i], hs: waveAt(scn.id, p[0], p[1], w), wdir: waveFull(scn.id, p[0], p[1], w).dir };
      });
      const cell = (v, kn) => { const c = Draw.speedRGB(kn); return el('td', { style: `background:rgb(${c[0]},${c[1]},${c[2]});color:${kn >= 25 ? '#fff' : '#10243a'}` }, v); };
      const row = (name, f) => el('tr', {}, el('th', { scope: 'row' }, name), ...cols.map(f));
      const tbl = el('table', { class: 'fc-table' },
        row('Время', (c) => el('td', { class: Math.abs(c.t - this.briefHour) < 0.5 ? 'fc-now' : '' }, fmtTime(c.t).replace(/:00/, '').replace('завтра ', '+'))),
        row('Ветер', (c) => el('td', {}, c.w.dir == null ? '·' : el('span', { class: 'fc-arrow', style: `transform:rotate(${Math.round(c.w.dir)}deg)` }, '↓'), el('small', {}, Wind.compass(c.w.dir)))),
        row(`Средний, уз (${res} км)`, (c) => cell(fmtNum(c.w.speed), c.w.speed)),
        row('Порывы, уз', (c) => cell(fmtNum(c.w.gust), c.w.gust)),
        row('P90 ансамбля, уз', (c) => cell(fmtNum(c.p90), c.p90)),
        row('Волна, откуда', (c) => el('td', {}, c.wdir == null ? '·' : el('small', {}, Wind.compass(c.wdir)))),
        row('Волна, м', (c) => el('td', { style: (() => { const q = Draw.waveRGB(c.hs); return `background:rgb(${q[0]},${q[1]},${q[2]})`; })() }, fmtNum(c.hs, 1))),
        row('Баллы', (c) => el('td', {}, String(c.bf))),
        row('Давление, гПа', (c) => el('td', {}, fmtNum(c.pr))),
        row('Гроза, %', (c) => el('td', { class: c.ts >= 30 ? 'fc-ts' : '' }, c.ts ? String(c.ts) : '')));
      this.fcTable.innerHTML = '';
      this.fcTable.append(el('div', { class: 'chart-title' }, `Прогноз по часам: ${Bay.areaName(p[0], p[1])}`), el('div', { class: 'fc-scroll' }, tbl));
      const now = tbl.querySelector('.fc-now'), sc = this.fcTable.querySelector('.fc-scroll');
      if (now && sc) { // centre the current hour, snapped so that no column is half hidden under the row headers
        const head = tbl.querySelector('th').offsetWidth, colW = now.offsetWidth;
        sc.scrollLeft = Math.max(0, Math.round((now.offsetLeft - head - (sc.clientWidth - head) / 2) / colW) * colW);
      }
    }

    // ------------------------------------------------------------ 3 risks
    // The passage in the control forecast at full resolution: where and when each risk acts on the route.
    forecastZones() {
      if (this._fz && this._fz.scn === this.st.scn) return this._fz;
      if (this.st.scn === 'night') {
        const scn = this.scn(), z = {};
        for (const h of [23, 26, 28.5]) {
          const S = Ens.state(scn, h, Ens.CONTROL, 0);
          for (let x = 0.5; x < W; x += 1) for (let y = 0.5; y < H; y += 1) {
            if (Bay.isLand(x, y)) continue;
            const w = Wind.at(x, y, S);
            for (const R of RISKS) if (DETECT[R.id](w)) (z[R.id] = z[R.id] || []).push({ x, y, t: h });
            if (h === 23 && exposed(x, y)) (z.swell = z.swell || []).push({ x, y, t: h });
          }
        }
        this._fz = { scn: this.st.scn, zones: z, arrival: null };
        return this._fz;
      }
      const scn = this.scn(), run = sail(ROUTE, this.st.depart, (x, y, t) => Wind.at(x, y, Ens.state(scn, t, Ens.CONTROL, 0)), scn.end + 6, 2);
      const z = {};
      for (const s of run.samples) {
        for (const R of RISKS) if (DETECT[R.id](s.w)) (z[R.id] = z[R.id] || []).push({ x: s.x, y: s.y, t: s.t });
        if (waveAt(this.st.scn, s.x, s.y, s.w) > 1.5) (z.wave = z.wave || []).push({ x: s.x, y: s.y, t: s.t });
      }
      const T = scn.stateAt(16, Ens.CONTROL).storm, arr = run.arrival || scn.end;
      if (T) { // the storm counts where its cell goes while the yacht is out, even if the control misses the route
        const pts = [];
        for (let t = this.st.depart; t <= arr + 0.5; t += 0.25) { const c = Wind.stormState(T, t); if (c.I > 0.2) pts.push({ x: c.x, y: c.y, t }); }
        if (pts.length) z.storm = [...(z.storm || []), ...pts];
      }
      this._fz = { scn: this.st.scn, zones: z, arrival: run.arrival };
      return this._fz;
    }
    riskMarks() {
      if (!this.st.risks || this.st.step < 2) return null;
      return RISKS.filter((R) => Array.isArray(this.st.risks[R.id])).map((R) => ({ x: this.st.risks[R.id][0], y: this.st.risks[R.id][1], text: R.short, on: R.id === this.activeRisk }));
    }
    stepRisks() {
      const fz = this.forecastZones();
      this.map.mode = 'probe';
      this.map.yacht = { x: Bay.MARINA.x, y: Bay.MARINA.y, showWind: false };
      this.riskList = el('div', { class: 'risk-list', role: 'group', 'aria-label': 'Риски на переходе' });
      this.body.append(
        el('p', { class: 'lead' }, 'Какие опасности ждут на переходе и где? Выберите риск и нажмите на карту, где его ждёте.'),
        el('p', { class: 'note' }, `Выход в ${fmtTime(this.st.depart)}${fz.arrival ? `, прибытие по прогнозу около ${fmtTime(Math.round(fz.arrival * 2) / 2)}` : ''}. Пределы экипажа: средний ветер до ${LIMITS.mean} уз, порывы до ${LIMITS.gust} уз.`),
        this.riskList,
        this.forecastTools(false),
        this.navBar(['Прогноз', () => this.go(1)], ['Выйти', () => this.go(3)]));
      this.refreshRisks();
    }
    refreshRisks() {
      const A = this.st.risks;
      this.riskList.innerHTML = '';
      for (const R of risksFor(this.st.scn)) {
        const on = R.id in A, active = on && this.activeRisk === R.id;
        const state = !on ? '' : R.tol === 0 ? 'без отметки на карте' : Array.isArray(A[R.id]) ? (active ? 'отмечено, нажмите на карту, чтобы перенести' : 'отмечено на карте') : 'нажмите на карту, где ждёте';
        const b = el('button', { type: 'button', class: `quiz-opt risk-opt${active ? ' risk-active' : ''}`, 'aria-pressed': String(on) }, el('span', {}, R.label), state ? el('small', {}, state) : '');
        b.addEventListener('click', () => {
          if (!on) { A[R.id] = true; this.activeRisk = R.tol ? R.id : null; }
          else if (R.tol && !active) this.activeRisk = R.id;
          else { delete A[R.id]; if (this.activeRisk === R.id) this.activeRisk = null; }
          this.refreshRisks();
        });
        this.riskList.append(b);
      }
      const R = RISKS.find((q) => q.id === this.activeRisk);
      this.refreshAnchors();
      this.hint.textContent = R ? `Нажмите на карту, где ждёте: ${R.label.toLowerCase()}. Повторное нажатие на риск в списке снимает его.` : 'Выберите риск в списке, чтобы отметить его на карте. Без выбранного риска нажатие на карту показывает метеограмму в точке.';
      this.refreshBrief();
    }

    // ------------------------------------------------------------ 4 run
    // The actual weather. In the summer and front scenarios the storm cell or the front is steered onto the
    // route while the yacht is there, so the decision on the way matters; its strength and the rest of the
    // day still come from the drawn weather.
    truthState(t) {
      const S = Ens.state(this.scn(), t, this.truthP(), 0), R = this.rig;
      if (R && R.storm) S.storm = R.storm;
      if (R && R.dt0 && S.front) S.front = { ...S.front, t0: S.front.t0 + R.dt0 };
      if (R && R.kat) S.kat = Math.max(S.kat, Ens.state(this.scn(), t, Ens.CONTROL, 0).kat * 1.05);
      return S;
    }
    truthWind() { return (x, y, t) => Wind.at(x, y, this.truthState(t)); }
    computeRig() {
      const scn = this.scn(), tp = this.truthP(), dep = this.st.depart;
      this.rig = null;
      const run = sail(ROUTE, dep, this.truthWind(), scn.end + 6, 1), S = run.samples;
      const at = (t) => S.reduce((a, q) => (Math.abs(q.t - t) < Math.abs(a.t - t) ? q : a), S[0]);
      if (scn.id === 'summer') {
        const T = scn.stateAt(16, tp).storm || scn.stateAt(16, Ens.CONTROL).storm;
        // The cell crosses the last leg along the west shore, coming from the ridge in the north-east, 1 km
        // off the yacht's track so that it meets the strong outflow and not the calm centre.
        const c = S.reduce((a2, q) => (Math.hypot(q.x - 3.3, q.y - 9) < Math.hypot(a2.x - 3.3, a2.y - 9) ? q : a2), S[0]), a = 2.2;
        const v = Math.hypot(T.vx, T.vy), ox = (-T.vy / v) * 1.0, oy = (T.vx / v) * 1.0;
        this.rig = { storm: { ...T, x0: c.x + ox - T.vx * a, y0: c.y + oy - T.vy * a, t0: c.t - a, tStart: c.t - 2.2, tPeak: c.t - 0.4, tEnd: c.t + 2.5 }, tc: c.t, at: { x: c.x, y: c.y, t: c.t } };
      } else if (scn.id === 'front') {
        const c = at(dep + 1.6), F = scn.stateAt(dep, tp).front, r = Math.PI / 180;
        const sp = (c.x - F.ref[0]) * Math.sin(F.moveDir * r) + (c.y - F.ref[1]) * Math.cos(F.moveDir * r);
        this.rig = { dt0: c.t - sp / F.speed - F.t0, tc: c.t };
      }
    }
    // Sail one decision option from sample s. Returns the samples after s and where the yacht ended.
    simOption(o, s) {
      const scn = this.scn(), tf = this.truthWind(), end = scn.end + 6;
      const rest = (q) => [[q.x, q.y], ...ROUTE.slice(q.leg)];
      const back = (q) => [[q.x, q.y], ...ROUTE.slice(0, q.leg).reverse()];
      const hold = (q, h) => { const out = []; for (let t = q.t; t < q.t + h; t += 1 / 60) out.push({ t, x: q.x, y: q.y, w: tf(q.x, q.y, t), v: 0, heading: q.heading, leg: q.leg, moored: Math.hypot(q.x - Bay.MARINA.x, q.y - Bay.MARINA.y) < 1.5 }); return out; };
      const cont = (q) => sail(rest(q), q.t, tf, end, 1, q.leg - 1);
      if (o.kind === 'go') { const r = cont(s); return { samples: r.samples, arrived: r.arrived, arrival: r.arrival, dest: 'harbour' }; }
      if (o.kind === 'wait') {
        const w = hold(s, o.h), q = { ...s, t: s.t + o.h }, r = cont(q);
        return { samples: [...w, ...r.samples], arrived: r.arrived, arrival: r.arrival, dest: 'harbour' };
      }
      const b = sail(back(s), s.t, tf, end, 1).samples.map((q) => ({ ...q, leg: 1, moored: Math.hypot(q.x - Bay.MARINA.x, q.y - Bay.MARINA.y) < 0.3 }));
      const home = b[b.length - 1];
      if (o.kind === 'back') return { samples: [...b, ...hold({ ...home, x: Bay.MARINA.x, y: Bay.MARINA.y }, 0.1)], arrived: false, arrival: home.t, dest: 'marina' };
      const t1 = Math.max(home.t, s.t + o.h), w = hold({ ...home, x: Bay.MARINA.x, y: Bay.MARINA.y }, t1 - home.t);
      const r = sail(ROUTE, t1, tf, end, 1);
      return { samples: [...b, ...w, ...r.samples], arrived: r.arrived, arrival: r.arrival, dest: 'harbour' };
    }
    // Outcome of a stretch of the passage: 0 dangerous, 1 hard, 2 within the crew limits.
    outcome(sim) {
      const ev = detectEvents(sim.samples), live = sim.samples.filter((q) => !q.moored);
      const mg = live.reduce((a, q) => Math.max(a, q.w.gust), 0), mm = live.reduce((a, q) => Math.max(a, q.w.speed), 0);
      const sq = ev.find((e) => e.kind === 'squall');
      const cat = sq || mg > LIMITS.gust + 10 ? 0 : mg > LIMITS.gust || mm > LIMITS.mean ? 1 : 2;
      const home = sim.dest === 'marina', ok = sim.arrived || home;
      const value = cat * 3 + (ok ? 1 : 0) + (sim.arrived ? 1 : 0);
      const txt = `${cat === 0 ? (sq ? `шквал от грозы ${sq.area}, порывы до ${fmtNum(mg)} уз` : `опасно, порывы до ${fmtNum(mg)} уз`) : cat === 1 ? `тяжело, порывы до ${fmtNum(mg)} уз` : 'без превышения пределов'}${home ? ', яхта в марине' : sim.arrived ? `, прибытие в ${fmtTime(sim.arrival)}` : ', до порта не дошли'}`;
      return { cat, value, txt, mg };
    }
    // Questions on the way: an early sign (scored only) and the decision whose options are sailed.
    runQuestions(res) {
      const scn = this.scn(), S = res.samples, t0 = S[0].t, t1 = S[S.length - 1].t, out = [];
      const tc = this.rig && this.rig.tc;
      if (scn.id === 'summer') {
        if (tc - 2 > t0 + 0.2) out.push({ t: tc - 2, kind: 'tower' });
        out.push({ t: tc - 0.75, decide: 'storm' });
      } else out.push({ t: t0 + 0.3, decide: 'front' });
      return out.filter((q) => q.t < t1).sort((a, b) => a.t - b.t);
    }
    // What the crew sees when the decision is due, with the radar picture in words.
    decisionText(kind, s) {
      const S = this.truthState(s.t);
      if (kind === 'storm') {
        const c = Wind.stormState(S.storm, s.t), d = Math.hypot(c.x - s.x, c.y - s.y), b = (Math.atan2(c.x - s.x, c.y - s.y) * 180) / Math.PI;
        return `На радаре грозовая ячейка в ${fmtNum(d)} км ${SIDE[Math.round(((b + 360) % 360) / 45) % 8]} от яхты. Она смещается на юго-запад, к маршруту, около 10 км/ч. Над ней наковальня, слышен гром.`;
      }
      if (kind === 'front') {
        const F = S.front, r = Math.PI / 180, ahead = ((s.t - F.t0) * F.speed - ((s.x - F.ref[0]) * Math.sin(F.moveDir * r) + (s.y - F.ref[1]) * Math.cos(F.moveDir * r)));
        return `Барометр за час упал на 2 гПа, юго-западный ветер крепчает. Радар видит полосу ливней в ${fmtNum(-ahead)} км к северо-западу${-ahead > 20 ? ', за краем карты' : ''}. Она идёт на юго-восток со скоростью около ${fmtNum(F.speed)} км/ч и будет здесь примерно через ${fmtNum(-ahead / F.speed, 1)} ч.`;
      }
      return 'У выхода из марины вода тёмная и в полосах пены, с гор срываются порывы. Шапка на гребне держится, барометр растёт.';
    }

    stepRun() {
      const scn = this.scn(), r = ROUTE;
      this.activeRisk = null;
      this.map.showCells = false;
      this.map.yacht = { x: r[0][0], y: r[0][1], heading: 0 };
      this.hint.textContent = 'Фактическая погода: цвет и штрихи показывают реальный ветер, а не прогноз.';
      this.computeRig();
      const res = sail(r, this.st.depart, this.truthWind(), scn.end + 6, 1);
      res.dest = 'harbour';
      this.result = res;
      this.events = detectEvents(res.samples);
      this.sits = this.runQuestions(res);
      this.st.sitAns = [];
      this.sitBox = el('div', { class: 'sit', hidden: true, 'aria-live': 'assertive' });
      this.clock = el('div', { class: 'clock' });
      this.runRO = new Readout(el('div'));
      this.log = el('ul', { class: 'log', 'aria-live': 'polite' });
      this.alertBox = el('div', { class: 'alert', hidden: true, role: 'alert' });
      let speed = 20; // simulated minutes per second
      this.map.follow = true;
      this._trackIdx = 0;
      const radarCtl = control({ id: 'radar', type: 'toggle', label: 'Радар' }, !!this.radarOn, (v) => { this.radarOn = v; this.map.setRadar(v ? this._radarFn : null); });
      this.body.append(this.clock, this.sitBox, this.alertBox, this.runRO.root,
        control({ id: 'spd', type: 'seg', label: 'Скорость', options: [[10, '×10'], [20, '×20'], [60, '×60']] }, speed, (v) => { speed = v; }),
        control({ id: 'follow', type: 'toggle', label: 'Камера за яхтой' }, true, (v) => { this.map.follow = v; }),
        radarCtl,
        el('div', { class: 'chart-title' }, 'Журнал'), this.log,
        el('div', { class: 'actions' }, el('button', { type: 'button', class: 'btn', onclick: () => { skip = true; } }, 'Перемотать до события')));
      let idx = 0, last = performance.now(), lastField = -1, shown = 0, acc = 0, sitK = 0, paused = false, skip = false;
      const resume = () => { this.sitBox.hidden = true; paused = false; last = performance.now(); lastField = -1; this.running = requestAnimationFrame(tick); };
      const ask = (q) => {
        paused = true; skip = false;
        const s = res.samples[idx];
        this.sitBox.hidden = false; this.sitBox.innerHTML = '';
        const head = el('div', { class: 'sit-time' }, `${fmtTime(s.t)} · ${Bay.areaName(s.x, s.y)}`);
        if (!q.decide) { // an early sign: the answer is scored, the passage goes on
          const D = SIT[q.kind];
          this.sitBox.append(head, el('p', { class: 'sit-text' }, D.text), el('div', { class: 'sit-q' }, 'Что делать?'),
            ...D.opts.map(([txt, sc], k) => el('button', { type: 'button', class: 'quiz-opt', onclick: () => {
              this.st.sitAns.push({ t: s.t, text: D.text, opts: D.opts.map((o) => o[0]), choice: k, score: sc, best: D.opts.filter((o) => o[1] === 2).map((o) => o[0]) });
              this.log.prepend(el('li', {}, `${fmtTime(s.t)} Решение: ${txt.toLowerCase()}.`));
              resume();
            } }, txt)));
        } else {
          // Radar on, so the picture in the text is on the map too.
          if (!this.radarOn) { this.radarOn = true; radarCtl.querySelector('input').checked = true; this.map.setRadar(this._radarFn); }
          const opts = DECIDE[q.decide], sims = opts.map(([, o]) => this.simOption(o, s)), outs = sims.map((m) => this.outcome(m));
          const best = Math.max(...outs.map((o) => o.value)), bestCat = Math.max(...outs.map((o) => o.cat));
          const text = this.decisionText(q.decide, s);
          this.sitBox.append(head, el('p', { class: 'sit-text' }, text), el('div', { class: 'sit-q' }, 'Что делать?'),
            ...opts.map(([txt], k) => el('button', { type: 'button', class: 'quiz-opt', onclick: () => {
              const sc = outs[k].value === best ? 2 : outs[k].cat === bestCat ? 1 : 0;
              this.st.sitAns.push({ t: s.t, text, opts: opts.map((o) => o[0]), choice: k, score: sc, outs: outs.map((o) => o.txt), best: opts.filter((o, i) => outs[i].value === best).map((o) => o[0]) });
              this.log.prepend(el('li', {}, `${fmtTime(s.t)} Решение: ${txt.toLowerCase()}.`));
              const m = sims[k];
              res.samples = res.samples.slice(0, idx + 1).concat(m.samples.filter((q2) => q2.t > s.t));
              res.arrived = m.arrived; res.arrival = m.arrival; res.dest = m.dest;
              this.events = detectEvents(res.samples);
              shown = this.events.filter((e) => e.t <= s.t).length;
              this.sits = this.sits.filter((q2) => q2.t <= s.t);
              resume();
            } }, txt)));
        }
        this.sitBox.scrollIntoView({ block: 'nearest' });
      };
      const tick = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        acc += dt * speed;
        const next = this.sits[sitK];
        if (skip) { const ti = next ? res.samples.findIndex((q) => q.t >= next.t) : res.samples.length - 1; idx = Math.max(idx, ti < 0 ? res.samples.length - 1 : ti); skip = false; acc = 0; }
        while (acc >= 1 && idx < res.samples.length - 1 && !(next && res.samples[idx].t >= next.t)) { idx++; acc -= 1; }
        const s = res.samples[idx];
        const S = this.truthState(s.t);
        if (Math.abs(s.t - lastField) >= 1 / 6 || idx === res.samples.length - 1) {
          lastField = s.t;
          const ov = { route: r, track: res.samples.slice(0, idx + 1).map((q) => [q.x, q.y]) };
          if (S.front) ov.front = Wind.frontLine(S);
          if (S.storm) { ov.storm = Wind.stormState(S.storm, s.t); ov.tower = tower(S.storm, s.t); }
          if (S.bora > 0.45) ov.cap = true;
          this.map.overlays = ov;
          this.map.setField((x, y) => Wind.at(x, y, S));
          this._radarFn = (x, y) => radar(S, x, y);
          if (this.radarOn) this.map.setRadar(this._radarFn);
        } else if (idx - (this._trackIdx || 0) >= 6) { this._trackIdx = idx; this.map.overlays.track = res.samples.slice(0, idx + 1).map((q) => [q.x, q.y]); }
        this.map.yacht = { x: s.x, y: s.y, heading: s.heading };
        this.clock.textContent = `${fmtTime(s.t)} · ${s.moored ? 'в марине' : Bay.areaName(s.x, s.y)} · ${s.v ? `${fmtNum(s.v, 1)} уз хода` : 'стоим'}`;
        this.runRO.update(s.w, [], 'Фактический ветер');
        if (next && s.t >= next.t && !paused) { sitK++; ask(next); return; }
        while (shown < this.events.length && this.events[shown].t <= s.t) {
          const e = this.events[shown++];
          this.log.prepend(el('li', { class: `ev ev-${e.kind}` }, `${fmtTime(e.t)} ${e.text} ${e.area}`));
          if (e.kind !== 'bora') {
            this.alertBox.hidden = false;
            this.alertBox.textContent = e.kind === 'squall' ? `${fmtTime(e.t)}: шквал от грозы ${e.area}, порывы ${fmtNum(e.gust)} уз.`
              : `${fmtTime(e.t)}: ${e.text.replace(/,$/, '')} ${e.area}, выше предела экипажа (${e.kind === 'gust' ? LIMITS.gust : LIMITS.mean} уз).`;
          }
        }
        if (idx >= res.samples.length - 1) {
          this.running = null;
          this.log.prepend(el('li', {}, res.dest === 'marina' ? `${fmtTime(s.t)} Яхта вернулась в марину.` : res.arrived ? `${fmtTime(res.arrival)} Яхта в Порту Каменка.` : 'Время сценария вышло, яхта не дошла до порта.'));
          this.body.append(this.navBar(null, ['Разбор', () => this.go(4)]));
          return;
        }
        this.running = requestAnimationFrame(tick);
      };
      this.running = requestAnimationFrame(tick);
    }

    // ------------------------------------------------------------ night anchorage
    stepAnchor() {
      this.map.mode = 'probe';
      this.riskList = el('div', { class: 'risk-list', role: 'group', 'aria-label': 'Риски на стоянке' });
      this.anchorBox = el('div', { class: 'cards' });
      this.goBtn = el('button', { type: 'button', class: 'btn primary', onclick: () => this.go(3) }, 'Встать на якорь →');
      this.body.append(
        el('p', { class: 'lead' }, 'Где встать на якорь на ночь? Выберите стоянку и отметьте на карте, какие опасности ждёте ночью.'),
        this.anchorBox,
        el('h3', {}, 'Риски на ночь'),
        this.riskList,
        this.forecastTools(false),
        this.navBar(['Прогноз', () => this.go(1)], this.goBtn));
      this.refreshRisks();
    }
    refreshAnchors() {
      if (!this.anchorBox) return;
      this.anchorBox.innerHTML = '';
      for (const a of ANCH) this.anchorBox.append(el('button', { type: 'button', class: 'card', 'aria-pressed': String(this.st.anchor === a.id), onclick: () => { this.st.anchor = a.id; this.probe = [a.x, a.y]; this.refreshRisks(); } },
        el('div', { class: 'card-title' }, `Стоянка ${a.id}`), el('div', { class: 'card-sub' }, a.name), el('div', { class: 'card-text' }, a.text)));
      this.goBtn.disabled = !this.st.anchor;
    }
    // The night at anchor after sample `from` (or from the evening) for an option: stay, or move to another anchorage.
    simNight(o, from) {
      const tf = this.truthWind(), cur = ANCH.find((a) => a.id === (from ? from.at : this.st.anchor)), out = [];
      const t0 = from ? from.t : this.scn().start + 2, end = this.scn().end - 1;
      let t = t0, at = cur;
      if (o.kind === 'move') {
        const to = ANCH.find((a) => a.id === o.to), r = sail(anchPath(cur, to), t0, tf, end, 2);
        out.push(...r.samples.map((q) => ({ ...q, at: null })));
        t = r.arrival || end; at = to;
      }
      for (; t <= end; t += 1 / 30) { const w = tf(at.x, at.y, t); out.push({ t, x: at.x, y: at.y, w, v: 0, heading: w.dir == null ? 0 : w.dir, at: at.id }); }
      return { samples: out, at: at.id };
    }
    // How the night went: gusts at the anchorage and swell from the open sea.
    nightOutcome(sim) {
      const S = sim.samples.filter((q) => q.at), mg = S.reduce((a, q) => Math.max(a, q.w.gust), 0);
      const sw = S.some((q) => exposed(q.x, q.y)), peak = S.reduce((a, q) => (q.w.gust > a.w.gust ? q : a), S[0]);
      const cat = mg > 24 ? 0 : mg > 17 || sw ? 1 : 2;
      const wind = mg > 17 ? `ветер с берега, порывы до ${fmtNum(mg)} уз около ${fmtTime(peak.t).replace('завтра ', '')}` : `порывы до ${fmtNum(mg)} уз`;
      const txt = `${cat === 0 ? 'опасно' : cat === 1 ? 'тяжело' : 'спокойная ночь'}: ${wind}${sw ? ', всю ночь качка на зыби 1–1,5 м' : ''}`;
      return { cat, value: cat, txt, mg, sw };
    }
    runNight() {
      const scn = this.scn(), A = ANCH.find((a) => a.id === this.st.anchor) || ANCH[0];
      this.rig = { kat: true };
      this.map.showCells = false;
      this.map.follow = false;
      this.hint.textContent = 'Фактическая погода ночью: цвет и штрихи показывают реальный ветер.';
      const res = this.simNight({ kind: 'stay' });
      this.result = res;
      this.st.sitAns = [];
      // Questions: a sign before midnight, then the decision when the gusts at the anchorage pass 15 kn.
      // The decision comes when the gusts pass 15 kn or, on the roadstead, when the swell has kept everyone awake.
      const first = res.samples.find((q) => q.w.gust > 15);
      this.sits = [{ t: 21, kind: 'katEve' }];
      if (A.id === 'B') this.sits.push({ t: 23.5, decide: 'night' });
      else if (first) this.sits.push({ t: Math.max(21.5, first.t), decide: 'night' });
      this.sitBox = el('div', { class: 'sit', hidden: true, 'aria-live': 'assertive' });
      this.clock = el('div', { class: 'clock' });
      this.runRO = new Readout(el('div'));
      this.log = el('ul', { class: 'log', 'aria-live': 'polite' });
      let speed = 120;
      this.body.append(this.clock, this.sitBox, this.runRO.root,
        control({ id: 'spd', type: 'seg', label: 'Скорость', options: [[60, '×60'], [120, '×120'], [240, '×240']] }, speed, (v) => { speed = v; }),
        el('div', { class: 'chart-title' }, 'Журнал'), this.log,
        el('div', { class: 'actions' }, el('button', { type: 'button', class: 'btn', onclick: () => { skip = true; } }, 'Перемотать до события')));
      this.log.prepend(el('li', {}, `${fmtTime(res.samples[0].t)} Якорь отдан, стоянка ${A.id} ${A.name}.`));
      let idx = 0, last = performance.now(), lastField = -1, acc = 0, sitK = 0, paused = false, skip = false;
      const resume = () => { this.sitBox.hidden = true; paused = false; last = performance.now(); lastField = -1; this.running = requestAnimationFrame(tick); };
      const ask = (q) => {
        paused = true; skip = false;
        const s = res.samples[idx];
        this.sitBox.hidden = false; this.sitBox.innerHTML = '';
        const head = el('div', { class: 'sit-time' }, `${fmtTime(s.t)} · стоянка ${s.at || A.id}`);
        if (!q.decide) {
          const D = SIT[q.kind];
          this.sitBox.append(head, el('p', { class: 'sit-text' }, D.text), el('div', { class: 'sit-q' }, 'Что делать?'),
            ...D.opts.map(([txt, sc], k) => el('button', { type: 'button', class: 'quiz-opt', onclick: () => {
              this.st.sitAns.push({ t: s.t, text: D.text, opts: D.opts.map((o) => o[0]), choice: k, score: sc, best: D.opts.filter((o) => o[1] === 2).map((o) => o[0]) });
              this.log.prepend(el('li', {}, `${fmtTime(s.t)} Решение: ${txt.toLowerCase()}.`));
              resume();
            } }, txt)));
        } else {
          const opts = [['Остаться здесь до утра', { kind: 'stay' }], ...ANCH.filter((a) => a.id !== s.at).map((a) => [`Перейти на стоянку ${a.id}, ${a.name}`, { kind: 'move', to: a.id }])];
          const sims = opts.map(([, o]) => this.simNight(o, s)), outs = sims.map((m) => this.nightOutcome(m));
          const best = Math.max(...outs.map((o) => o.value));
          const text = exposed(s.x, s.y) ? `Ветер слабый, ${fmtNum(s.w.speed)} уз, но с юга идёт зыбь 1–1,5 м. Яхту качает с борта на борт, спать невозможно. До рассвета ещё пять часов.`
            : `Ветер с берега ${fmtNum(s.w.speed)} уз, порывы ${fmtNum(s.w.gust)} уз и крепчает. Холодный воздух стекает из долины, до рассвета ещё несколько часов.`;
          this.sitBox.append(head, el('p', { class: 'sit-text' }, text), el('div', { class: 'sit-q' }, 'Что делать?'),
            ...opts.map(([txt], k) => el('button', { type: 'button', class: 'quiz-opt', onclick: () => {
              const sc = outs[k].value === best ? 2 : outs[k].value === best - 1 ? 1 : 0;
              this.st.sitAns.push({ t: s.t, text, opts: opts.map((o) => o[0]), choice: k, score: sc, outs: outs.map((o) => o.txt), best: opts.filter((o, i) => outs[i].value === best).map((o) => o[0]) });
              this.log.prepend(el('li', {}, `${fmtTime(s.t)} Решение: ${txt.toLowerCase()}.`));
              res.samples = res.samples.slice(0, idx + 1).concat(sims[k].samples.filter((q2) => q2.t > s.t));
              res.at = sims[k].at;
              resume();
            } }, txt)));
        }
        this.sitBox.scrollIntoView({ block: 'nearest' });
      };
      const tick = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        acc += (dt * speed) / 2; // samples are 2 min apart
        const next = this.sits[sitK];
        if (skip) { const ti = next ? res.samples.findIndex((q) => q.t >= next.t) : res.samples.length - 1; idx = Math.max(idx, ti < 0 ? res.samples.length - 1 : ti); skip = false; acc = 0; }
        while (acc >= 1 && idx < res.samples.length - 1 && !(next && res.samples[idx].t >= next.t)) { idx++; acc -= 1; }
        const s = res.samples[idx], S = this.truthState(s.t);
        if (Math.abs(s.t - lastField) >= 1 / 6 || idx === res.samples.length - 1) {
          lastField = s.t;
          this.map.overlays = { night: S.hour % 24 > 20 || S.hour % 24 < 6, track: res.samples.slice(0, idx + 1).filter((q) => !q.at).map((q) => [q.x, q.y]) };
          this.map.setField((x, y) => Wind.at(x, y, S));
        }
        this.map.yacht = { x: s.x, y: s.y, heading: s.heading };
        this.clock.textContent = `${fmtTime(s.t)} · ${s.at ? `стоянка ${s.at}, на якоре` : 'переход на другую стоянку'}`;
        this.runRO.update(s.w, [], 'Фактический ветер у стоянки');
        if (next && s.t >= next.t && !paused) { sitK++; ask(next); return; }
        if (idx >= res.samples.length - 1) {
          this.running = null;
          this.log.prepend(el('li', {}, `${fmtTime(s.t)} Рассвет, ветер с берега стихает.`));
          this.body.append(this.navBar(null, ['Разбор', () => this.go(4)]));
          return;
        }
        this.running = requestAnimationFrame(tick);
      };
      this.running = requestAnimationFrame(tick);
    }
    debriefNight() {
      if (!this.result) { this.rig = { kat: true }; this.result = this.simNight({ kind: 'stay' }); }
      const res = this.result, A = ANCH.find((a) => a.id === this.st.anchor) || ANCH[0], SA = this.st.sitAns || [];
      this.map.mode = 'none';
      this.hint.textContent = 'Стоянка и ветер перед рассветом.';
      const o = this.nightOutcome(res);
      const verdict = o.cat === 0 ? ['Опасная ночь', 'bad'] : o.cat === 1 ? ['Тяжёлая ночь', 'warn'] : ['Спокойная ночь', 'ok'];
      // The same night at each anchorage with the evening scope.
      const keep = this.st.anchor, alt = ANCH.map((a) => { this.st.anchor = a.id; const r = this.nightOutcome(this.simNight({ kind: 'stay' })); return [a, r]; });
      this.st.anchor = keep;
      const Z = this.forecastZones().zones, Ar = this.st.risks;
      const near = (pt, zone) => Math.min(...zone.map((q) => Math.hypot(q.x - pt[0], q.y - pt[1])));
      let found = 0;
      const expected = RISKS.filter((R) => Z[R.id]);
      const items = RISKS.filter((R) => Z[R.id] || R.id in Ar).map((R) => {
        const exp = !!Z[R.id], mine = R.id in Ar, pt = Array.isArray(Ar[R.id]) ? Ar[R.id] : null;
        let you, good;
        if (!mine) { you = 'не отмечен'; good = !exp; }
        else if (!exp) { you = 'отмечен, но по прогнозу этой ночью его не было'; good = false; }
        else { found++; if (!R.tol) { you = 'отмечен'; good = true; } else if (!pt) { you = 'отмечен, место не указано'; good = false; } else { const d = near(pt, Z[R.id]); good = d <= R.tol; you = good ? `отмечен, место верное (${Bay.areaName(pt[0], pt[1])})` : `отмечен, но место в ${fmtNum(d)} км от зоны по прогнозу`; } }
        return el('div', { class: `chk-item ${good ? 'chk-ok' : 'chk-bad'}` }, el('div', { class: 'chk-title' }, R.label), el('div', {}, el('span', { class: 'chk-k chk-you' }, 'Вы: '), you),
          el('div', {}, el('span', { class: 'chk-k' }, 'По прогнозу: '), !exp ? 'не ожидался' : R.id === 'swell' ? 'везде за пределами Внутреннего залива' : R.id === 'kat' ? 'у устьев долин, сильнее всего перед рассветом' : `${Bay.areaName(Z[R.id][0].x, Z[R.id][0].y)}, ночью`));
      });
      const xs = res.samples.filter((q, i) => i % 3 === 0), cv = el('canvas', { class: 'chart', style: 'height:220px' }), css = Draw.css;
      const reg = xs.map((q) => this.modelWind(2, A.x, A.y, q.t));
      this.body.append(...[
        el('div', { class: `verdict v-${verdict[1]}` }, verdict[0]),
        el('dl', { class: 'score' },
          el('dt', {}, 'Стоянка'), el('dd', {}, `${A.id}, ${A.name}`),
          el('dt', {}, runLine(this.st)[0]), el('dd', {}, runLine(this.st)[1]),
          el('dt', {}, 'Риски'), el('dd', {}, `найдено ${found} из ${expected.length}`),
          el('dt', {}, 'Решения ночью'), el('dd', {}, SA.length ? `${SA.filter((a) => a.score === 2).length} из ${SA.length} ${UI.plural(SA.filter((a) => a.score === 2).length, 'верное', 'верных', 'верных')}` : 'вопросов не было')),
        el('h3', {}, 'Та же ночь на каждой стоянке'),
        el('ul', { class: 'opt-outs' }, ...alt.map(([a, r]) => el('li', { class: a.id === A.id ? 'mine' : '' }, `Стоянка ${a.id}, ${a.name}: ${r.txt}.`))),
        SA.length ? el('h3', {}, 'Решения ночью') : null,
        SA.length ? el('div', { class: 'chk-list' }, ...SA.map((a) => el('div', { class: `chk-item ${a.score === 2 ? 'chk-ok' : 'chk-bad'}` },
          el('div', { class: 'chk-title' }, `${fmtTime(a.t)}. ${a.text}`),
          el('div', {}, el('span', { class: 'chk-k chk-you' }, a.score === 2 ? 'Верно: ' : a.score === 1 ? 'Безопасно, но можно было лучше: ' : 'Неверно: '), a.opts[a.choice]),
          a.score === 2 ? null : el('div', {}, el('span', { class: 'chk-k' }, 'Лучше: '), a.best.map((x) => x.toLowerCase()).join(' или ')),
          a.outs ? el('ul', { class: 'opt-outs' }, ...a.opts.map((x, i) => el('li', { class: i === a.choice ? 'mine' : '' }, `${x}: ${a.outs[i]}.`))) : null))) : null,
        el('h3', {}, 'Риски на ночь'),
        el('div', { class: 'chk-list' }, ...items),
        el('div', { class: 'chart-box' }, el('div', { class: 'chart-title' }, 'Ветер у яхты за ночь, уз'), cv,
          el('div', { class: 'legend' }, el('span', { class: 'lg lg-truth' }, 'факт, средний'), el('span', { class: 'lg lg-truthg' }, 'факт, порывы'), el('span', { class: 'lg lg-mean' }, 'модель 2 км, порывы'), el('span', { class: 'lg lg-limit' }, 'порывы, опасные на стоянке'))),
        el('ul', { class: 'theory' },
          el('li', {}, `Региональная модель давала на стоянке ${A.id} порывы до ${fmtNum(Math.max(...reg.map((w) => w.gust)))} уз, факт ${fmtNum(o.mg)} уз. Стоковый ветер модели занижают в 1,5–2 раза.`),
          el('li', {}, 'Холодный воздух ночью стекает по долинам и сильнее всего дует у их устьев перед рассветом. Зыбь приходит из открытого моря и не зависит от местного ветра. Для ночной стоянки выбирают место в стороне от устьев долин и закрытое от моря.')),
        el('div', { class: 'actions' },
          el('button', { type: 'button', class: 'btn primary', onclick: () => { this.st.seed += 17; this.result = null; this.go(3); } }, 'Та же стоянка, другая ночь'),
          el('button', { type: 'button', class: 'btn', onclick: () => this.go(2) }, 'Выбрать другую стоянку'),
          el('button', { type: 'button', class: 'btn', onclick: () => { this.st.seed += 31; this.go(0); } }, 'Другой сценарий')),
      ].filter(Boolean));
      requestAnimationFrame(() => chart(cv, {
        x0: xs[0].t, x1: xs[xs.length - 1].t, y0: 0, y1: 40, xstep: 2, ystep: 10,
        xfmt: (x) => fmtTime(x).replace('завтра ', ''),
        hlines: [{ y: 24, color: css('--danger'), dash: [3, 3] }],
        lines: [
          { xs: xs.map((q) => q.t), ys: reg.map((w) => w.gust), color: css('--ink'), width: 1.5, dash: [5, 4] },
          { xs: xs.map((q) => q.t), ys: xs.map((q) => q.w.gust), color: css('--accent'), width: 2, dash: [2, 3] },
          { xs: xs.map((q) => q.t), ys: xs.map((q) => q.w.speed), color: css('--accent'), width: 3 },
        ],
      }));
      const last = res.samples[res.samples.length - 1], S = this.truthState(28.5);
      this.map.overlays = { night: true, track: res.samples.filter((q) => !q.at).map((q) => [q.x, q.y]) };
      this.map.yacht = { x: last.x, y: last.y, heading: last.heading, showWind: false };
      this.map.setField((x, y) => Wind.at(x, y, S));
    }

    // ------------------------------------------------------------ 5 debrief
    stepDebrief() {
      if (!this.result) {
        this.computeRig();
        this.result = sail(ROUTE, this.st.depart, this.truthWind(), this.scn().end + 6, 1);
        this.result.dest = 'harbour';
        this.events = detectEvents(this.result.samples);
      }
      const scn = this.scn(), res = this.result, ss = res.samples.filter((s, i) => i % 5 === 0 || i === res.samples.length - 1);
      this.map.mode = 'none';
      this.map.follow = false;
      this.map.setView('3d', true);
      this.hint.textContent = 'Пройденный путь, ваши отметки рисков и ветер в момент прибытия.';
      const fact = ss.map((s) => s.w), reg = ss.map((s) => this.modelWind(2, s.x, s.y, s.t));
      const ens = this.mem.map((p) => ss.map((s) => Wind.at(s.x, s.y, Ens.state(scn, s.t, p, 9)).gust));
      const E = Ens.percentiles(ens);
      const maxF = Math.max(...fact.map((w) => w.speed)), maxG = Math.max(...fact.map((w) => w.gust));
      const maxRM = Math.max(...reg.map((w) => w.speed)), maxRG = Math.max(...reg.map((w) => w.gust));
      const routeMax = ens.map((r) => Math.max(...r)).sort((a, b) => a - b);
      const p10 = Ens.quantile(routeMax, 0.1), p90 = Ens.quantile(routeMax, 0.9);
      const squall = this.events.some((e) => e.kind === 'squall');
      const verdict = res.dest === 'marina' ? (squall || maxG > LIMITS.gust ? ['Яхта вернулась в марину, но попала в непогоду', 'warn'] : ['Яхта вернулась в марину без превышения пределов', 'ok']) : !res.arrived ? ['Переход не завершён', 'bad'] : squall || maxG > LIMITS.gust + 10 ? ['Опасный переход', 'bad'] : maxG > LIMITS.gust || maxF > LIMITS.mean ? ['Тяжёлый переход', 'warn'] : ['Безопасный переход', 'ok'];
      const SA = this.st.sitAns || [];

      // Risks: marked by the skipper, expected by the forecast, and met on the way.
      const Z = this.forecastZones().zones, A = this.st.risks, happened = {};
      for (const s of res.samples) if (!s.moored) {
        for (const R of RISKS) if (!happened[R.id] && DETECT[R.id](s.w)) happened[R.id] = s;
        if (!happened.wave && waveAt(this.st.scn, s.x, s.y, s.w) > 1.5) happened.wave = s;
      }
      if (!happened.storm && this.rig && this.rig.at) happened.storm = this.rig.at; // the cell crossed the route even if the yacht kept clear
      const near = (pt, zone) => Math.min(...zone.map((q) => Math.hypot(q.x - pt[0], q.y - pt[1])));
      const at = (q) => `${Bay.areaName(q.x, q.y)}, ${fmtTime(q.t)}`;
      let found = 0, placed = 0;
      const expected = RISKS.filter((R) => Z[R.id]);
      const extra = RISKS.filter((R) => R.id in A && !Z[R.id]);
      const items = RISKS.filter((R) => Z[R.id] || R.id in A || happened[R.id]).map((R) => {
        const exp = !!Z[R.id], mine = R.id in A, pt = Array.isArray(A[R.id]) ? A[R.id] : null;
        let you, good;
        if (!mine) { you = 'не отмечен'; good = !exp; }
        else if (!exp) { you = 'отмечен, но по прогнозу на этом переходе его не было'; good = false; }
        else {
          found++;
          if (!R.tol) { you = 'отмечен'; good = true; placed++; }
          else if (!pt) { you = 'отмечен, место не указано'; good = false; }
          else { const d = near(pt, Z[R.id]); good = d <= R.tol; if (good) placed++; you = good ? `отмечен, место верное (${Bay.areaName(pt[0], pt[1])})` : `отмечен, но место в ${fmtNum(d)} км от зоны по прогнозу`; }
        }
        return el('div', { class: `chk-item ${good ? 'chk-ok' : 'chk-bad'}` },
          el('div', { class: 'chk-title' }, R.label),
          el('div', {}, el('span', { class: 'chk-k chk-you' }, 'Вы: '), you),
          el('div', {}, el('span', { class: 'chk-k' }, 'По прогнозу: '), exp ? at(Z[R.id][0]) : 'не ожидался'),
          el('div', {}, el('span', { class: 'chk-k' }, 'Было: '), happened[R.id] ? at(happened[R.id]) : 'не было'));
      });
      const withPlace = expected.filter((R) => R.tol).length;

      const xs = ss.map((s) => s.t), css = Draw.css;
      const ymax = Math.ceil(Math.max(maxG, E.p90.reduce((a, b) => Math.max(a, b), 0), LIMITS.gust) / 10) * 10 + 5;
      const cv = el('canvas', { class: 'chart', style: 'height:230px' });
      this.body.append(...[
        el('div', { class: `verdict v-${verdict[1]}` }, verdict[0]),
        el('dl', { class: 'score' },
          el('dt', {}, runLine(this.st)[0]), el('dd', {}, runLine(this.st)[1]),
          el('dt', {}, 'Риски'), el('dd', {}, `найдено ${found} из ${expected.length}${extra.length ? `, лишних ${extra.length}` : ''}`),
          withPlace ? el('dt', {}, 'Места') : null, withPlace ? el('dd', {}, `${placed - expected.filter((R) => !R.tol && R.id in A).length} из ${withPlace} отмечены верно`) : null,
          el('dt', {}, 'Решения в пути'), el('dd', {}, SA.length ? `${SA.filter((a) => a.score === 2).length} из ${SA.length} ${UI.plural(SA.filter((a) => a.score === 2).length, 'верное', 'верных', 'верных')}` : 'вопросов не было')),
        el('h3', {}, 'Риски на маршруте'),
        el('div', { class: 'chk-list' }, ...items),
        SA.length ? el('h3', {}, 'Решения в пути') : null,
        SA.length ? el('div', { class: 'chk-list' }, ...SA.map((a) => el('div', { class: `chk-item ${a.score === 2 ? 'chk-ok' : 'chk-bad'}` },
          el('div', { class: 'chk-title' }, `${fmtTime(a.t)}. ${a.text}`),
          el('div', {}, el('span', { class: 'chk-k chk-you' }, a.score === 2 ? 'Верно: ' : a.score === 1 ? 'Безопасно, но можно было лучше: ' : 'Неверно: '), a.opts[a.choice]),
          a.score === 2 ? null : el('div', {}, el('span', { class: 'chk-k' }, 'Лучше: '), a.best.map((o) => o.toLowerCase()).join(' или ')),
          a.outs ? el('ul', { class: 'opt-outs' }, ...a.opts.map((o, i) => el('li', { class: i === a.choice ? 'mine' : '' }, `${o}: ${a.outs[i]}.`))) : null))) : null,
        el('h3', {}, 'Ветер на переходе'),
        el('table', { class: 'tbl' },
          el('tr', {}, el('th', {}, 'На маршруте'), el('th', {}, 'Средний'), el('th', {}, 'Порывы')),
          el('tr', { class: 'row-fact' }, el('td', {}, 'Факт'), el('td', {}, `${fmtNum(maxF)} уз`), el('td', {}, `${fmtNum(maxG)} уз`)),
          el('tr', {}, el('td', {}, 'Региональная 2 км'), el('td', {}, `${fmtNum(maxRM)} уз`), el('td', {}, `${fmtNum(maxRG)} уз`)),
          el('tr', {}, el('td', {}, 'Ансамбль 9 км, P10–P90'), el('td', {}, '—'), el('td', {}, `${fmtNum(p10)}–${fmtNum(p90)} уз`))),
        el('div', { class: 'chart-box' }, el('div', { class: 'chart-title' }, 'Ветер вдоль пройденного пути, уз'), cv,
          el('div', { class: 'legend' }, el('span', { class: 'lg lg-truth' }, 'факт, средний'), el('span', { class: 'lg lg-truthg' }, 'факт, порывы'),
            el('span', { class: 'lg lg-mean' }, 'модель 2 км, порывы'), el('span', { class: 'lg lg-band' }, 'ансамбль порывов P10–P90'), el('span', { class: 'lg lg-limit' }, 'предел экипажа'),
            this.events.length ? el('span', { class: 'lg lg-ev' }, 'событие журнала') : null)),
        el('h3', {}, 'Сбылся ли прогноз'),
        el('ul', { class: 'theory' }, ...this.explain(ss, fact, reg, maxG, p10, p90).map((t) => el('li', {}, t))),
        this.events.length ? el('details', { class: 'log-box' }, el('summary', {}, `Журнал перехода (${this.events.length})`), el('ul', { class: 'log' }, ...this.events.map((e) => el('li', { class: `ev ev-${e.kind}` }, `${fmtTime(e.t)} ${e.text} ${e.area}`)))) : null,
        el('p', { class: 'note' }, res.dest === 'marina' ? `Выход ${fmtTime(this.st.depart)}, возвращение в марину в ${fmtTime(res.arrival)}.` : res.arrived ? `Выход ${fmtTime(this.st.depart)}, прибытие ${fmtTime(res.arrival)}.` : `Выход ${fmtTime(this.st.depart)}.`),
        el('div', { class: 'actions' },
          el('button', { type: 'button', class: 'btn primary', onclick: () => { this.st.seed += 17; this.result = null; this.go(3); } }, 'Тот же переход, другая погода'),
          el('button', { type: 'button', class: 'btn', onclick: () => this.go(2) }, 'Изменить отметки'),
          el('button', { type: 'button', class: 'btn', onclick: () => { this.st.seed += 31; this.go(0); } }, 'Другой сценарий')),
      ].filter(Boolean));
      const evMarks = this.events.map((e) => ({ x: e.t, y: e.gust, color: css('--danger') }));
      requestAnimationFrame(() => chart(cv, {
        x0: xs[0], x1: Math.max(xs[xs.length - 1], xs[0] + 1), y0: 0, y1: ymax, xstep: xs[xs.length - 1] - xs[0] > 8 ? 2 : 1, ystep: 10,
        xfmt: (x) => fmtTime(x).replace('завтра ', '+'),
        bands: [{ xs, lo: E.p10, hi: E.p90, color: css('--band') }],
        hlines: [{ y: LIMITS.gust, color: css('--danger'), dash: [3, 3] }],
        lines: [
          { xs, ys: reg.map((w) => w.gust), color: css('--ink'), width: 1.5, dash: [5, 4] },
          { xs, ys: fact.map((w) => w.gust), color: css('--accent'), width: 2, dash: [2, 3] },
          { xs, ys: fact.map((w) => w.speed), color: css('--accent'), width: 3 },
        ],
        marks: evMarks,
      }));
      this.map.overlays = { route: ROUTE, track: res.samples.map((q) => [q.x, q.y]), particles: false, marks: this.riskMarks() };
      this.map.showCells = false;
      const last = res.samples[res.samples.length - 1];
      this.map.yacht = { x: last.x, y: last.y, heading: last.heading, showWind: false };
      const S = this.truthState(last.t);
      this.map.setField((x, y) => Wind.at(x, y, S));
    }

    // Crew reacted correctly to a situation within 1.5 h before time t.
    prepared(t) { return (this.st.sitAns || []).some((a) => a.score === 2 && a.t <= t && t - a.t < 1.5); }

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
          storm: 'Порывы дал шквал от грозы. В контрольном прогнозе ячейки здесь в это время не было: модель показывает условия для гроз, но не место и время.',
          bora: 'Порывы дала струя боры. Под перевалами и на выходе из пролива ветер сильнее, чем в ячейках модели.',
          breeze: 'Ветер усилил бриз. В этот день он был сильнее или начался раньше, чем в модели.',
          kat: 'Ветер усилил стоковый поток из долины. Модели занижают такие ветры в 1,5–2 раза.',
          syn: 'Синоптический ветер в этот день был сильнее, чем в контрольном прогнозе. Это ошибка начальных данных, её показывает разброс ансамбля.',
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
        const fact = tc(this.truthP()) + ((this.rig && this.rig.dt0) || 0), dt = fact - tc(Ens.CONTROL);
        out.push(`Фронт прошёл у мыса в ${fmtTime(fact)}, в контрольном прогнозе в ${fmtTime(tc(Ens.CONTROL))} (${dt < 0 ? 'раньше' : 'позже'} на ${fmtNum(Math.abs(dt), 1)} ч).`);
      }
      if (scn.id === 'summer') {
        const T = (this.rig && this.rig.storm) || scn.stateAt(16, this.truthP()).storm;
        const hitSq = this.events.find((e) => e.kind === 'squall');
        if (!T) out.push(`В этот день гроза не развилась, хотя ансамбль давал её в ${this.mem.filter((p) => scn.stateAt(16, p).storm).length} из 30 прогонов. Планировать на грозу всё равно было правильно: решение принимают по прогнозу, а не по факту.`);
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
      if (s.moored) continue;
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

  globalThis.Final = { FinalView, sail, boatSpeed, detectEvents, radar };
})();
