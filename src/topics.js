// Eight topic trainers. Each topic: controls -> wind state -> map field, readout lines and extras.
(function () {
  const { el, fmtNum, fmtTime, control, Readout, chart } = globalThis.UI;
  const Wind = globalThis.Wind, Bay = globalThis.Bay, Ens = globalThis.Ens;
  const OFF = { friction: true, breeze: false, katabatic: false, bora: false, terrain: false, lee: false, front: false, storm: false };
  const fx = (o) => ({ ...OFF, ...o });
  const pct = (x) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)} %`;
  const nm = (km) => fmtNum(km / 1.852, 1);

  function modelCells(stateFn, res) {
    const nx = Math.floor(Bay.W / res) + 1, ny = Math.floor(Bay.H / res) + 1, list = [];
    const k = Math.max(2, Math.min(10, Math.round(res / 0.6)));
    const S = stateFn(res);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let u = 0, v = 0, g = 0, land = 0;
      for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
        const x = Math.min(Bay.W, i * res + ((a + 0.5) * res) / k), y = Math.min(Bay.H, j * res + ((b + 0.5) * res) / k);
        const w = Wind.at(x, y, S); u += w.u; v += w.v; g += w.gust; land += w.land ? 1 : 0;
      }
      u /= k * k; v /= k * k; g /= k * k;
      const speed = Math.hypot(u, v);
      list.push({ x0: i * res, y0: j * res, size: res, land: land / (k * k) > 0.5, u, v, speed, gust: Math.max(g, speed * 1.2), dir: speed > 0.05 ? Wind.dirOf(u, v) : null });
    }
    return { res, nx, ny, list };
  }
  const cellAt = (C, x, y) => C.list[Math.floor(y / C.res) * C.nx + Math.floor(x / C.res)];
  const cellWind = (c) => ({ u: c.u, v: c.v, speed: c.speed, gust: c.gust, dir: c.dir, variable: false });

  const SERVICES = [
    ['Windy', 'https://www.windy.com', 'Карты моделей ECMWF, GFS и ICON, сравнение моделей в точке, карта порывов.'],
    ['Meteologix', 'https://meteologix.com', 'Региональная модель Swiss HD с сеткой 1–4 км, сравнение моделей, карта порывов.'],
    ['ECMWF Open Charts', 'https://charts.ecmwf.int', 'Метеограммы ансамбля ECMWF: медиана и разброс 51 прогона.'],
    ['Meteoblue', 'https://www.meteoblue.com', 'Ансамбль из нескольких моделей для выбранной точки.'],
    ['Meteoalarm', 'https://www.meteoalarm.org', 'Официальные предупреждения по регионам Европы.'],
    ['Метеослужба Черногории', 'https://www.meteo.co.me', 'Официальный прогноз и предупреждения.'],
    ['DHMZ, Хорватия', 'https://meteo.hr', 'Морской прогноз для Адриатики.'],
  ];
  function servicesBox() {
    return el('div', { class: 'services' }, el('h3', {}, 'Посмотреть на реальных данных'),
      el('dl', { class: 'svc-list' }, ...SERVICES.flatMap(([n, u, d]) => [el('dt', {}, el('a', { href: u, target: '_blank', rel: 'noopener' }, n)), el('dd', {}, UI.typo(d))])),
      el('p', { class: 'note' }, 'Проверяйте время прогона и сравнивайте 2–3 модели.'));
  }

  // A video next to the chapter. The artifact viewer blocks YouTube frames, so only the standalone page
  // (built with ALLOW_EMBED) embeds the player; elsewhere the block is a plain link.
  function videoBox(vd) {
    const url = `https://www.youtube.com/watch?v=${vd.id}`;
    const cap = el('figcaption', {}, vd.caption, ' ', el('a', { href: url, target: '_blank', rel: 'noopener' }, 'Открыть на YouTube'));
    if (!globalThis.ALLOW_EMBED) return el('figure', { class: 'video video-link' }, cap);
    const frame = el('iframe', { src: `https://www.youtube-nocookie.com/embed/${vd.id}`, title: vd.caption, loading: 'lazy',
      allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin' });
    return el('figure', { class: 'video' }, el('div', { class: 'video-frame' }, frame), cap);
  }

  const TOPICS = [
    // ------------------------------------------------------------------ 0. heating and pressure
    {
      id: 'heat', short: 'Нагрев', title: 'Солнце, тёплый воздух и давление', scheme: true,
      controls: [
        { id: 'tod', type: 'seg', label: 'Время суток', options: [['day', 'День'], ['night', 'Ночь']] },
        { id: 'td', type: 'range', label: 'Точка росы', min: 4, max: 26, step: 1, unit: '°C' },
      ],
      defaults: { tod: 'day', td: 16 },
      section: (v) => ({ type: 'heat', p: { night: v.tod === 'night', td: v.td } }),
      readout: (v, p) => {
        const o = p._out || Schemes.heatOut(p);
        const cloud = p.night ? 'Ночью воздух не поднимается, облаков нет'
          : o.cloud ? `Облако там, где воздух остыл до точки росы ${v.td} °C: ≈ ${fmtNum(Math.round(o.base / 10) * 10)} м = 125 м × (${o.T.land} − ${v.td})` : `Облаков нет: воздух остыл бы до ${v.td} °C только выше 2,8 км`;
        return { w: { speed: o.wind, gust: o.wind * 1.3, dir: o.dir }, extra: [cloud], title: 'Ветер у поверхности' };
      },
    },
    // ------------------------------------------------------------------ 2. pressure, cyclones
    {
      id: 't2', num: 2, short: 'Давление', title: 'Давление, циклоны и антициклоны', scheme: true,
      controls: [
        { id: 'low', type: 'range', label: 'Давление в центре циклона', min: 975, max: 1008, step: 1, unit: 'гПа' },
        { id: 'high', type: 'range', label: 'Давление в центре антициклона', min: 1016, max: 1036, step: 1, unit: 'гПа' },
        { id: 'surface', type: 'toggle', label: 'Ветер у поверхности (трение)' },
        { id: 'bb', type: 'toggle', label: 'Правило Бёйс-Балло' },
      ],
      defaults: { low: 992, high: 1028, surface: true, bb: true, point: [0.47, 0.62] },
      section: (v) => ({ type: 'synoptic', p: { low: v.low, high: v.high, surface: v.surface, bb: v.bb, point: v.point } }),
      build(view) { const box = el('div', { class: 'second-figure' }); view.vsec = new Section(box); return [box]; },
      after(view) { view.vsec.set('isobars', { low: view.v.low, high: view.v.high }); },
      readout: (v, p) => {
        const o = p._out || { pr: 1013, q: { speed: 0, dir: null } };
        return { w: { speed: o.q.speed, gust: o.q.speed * 1.3, dir: o.q.dir }, extra: [`Давление ${UI.fmtNum(o.pr, 1)} гПа`, v.surface ? 'Ветер у поверхности над морем' : 'Ветер на высоте, вдоль изобар', 'Нажмите на карту, чтобы перенести точку'], title: 'Ветер в точке' };
      },
    },
    // ------------------------------------------------------------------ 1. wind and Beaufort
    {
      id: 't1', num: 1, short: 'Ветер', title: 'Ветер: флажки и шкала Бофорта', scheme: true,
      controls: [
        { id: 'kn', type: 'range', label: 'Средний ветер', min: 0, max: 70, step: 1, unit: 'уз' },
        { id: 'dir', type: 'dir', label: 'Ветер, откуда' },
      ],
      defaults: { kn: 18, dir: 45 },
      section: (v) => ({ type: 'beaufort', p: { kn: v.kn, dir: v.dir } }),
      readout: (v) => {
        const B = Wind.beaufort(v.kn), row = Schemes.BF[B];
        return { w: { speed: v.kn, gust: v.kn * 1.3, dir: v.kn < 1 ? null : v.dir }, extra: ['Порывы над морем: средний ветер × 1,3'], title: 'Ветер' };
      },
    },
    // ------------------------------------------------------------------ 3. fronts
    {
      id: 't3', num: 3, short: 'Фронты', title: 'Атмосферные фронты', scheme: true,
      controls: [
        { id: 'kind', type: 'seg', label: 'Фронт', options: [['warm', 'Тёплый'], ['cold', 'Холодный'], ['occl', 'Окклюзия']] },
        { id: 'tau', type: 'range', label: 'Время на яхте', min: -24, max: 12, step: 0.25, fmt: (x) => (Math.abs(x) < 0.13 ? 'фронт над яхтой' : x < 0 ? `за ${UI.fmtNum(-x, 1)} ч до фронта` : `через ${UI.fmtNum(x, 1)} ч после`) },
      ],
      defaults: { kind: 'warm', tau: -8 },
      section: (v) => ({ type: 'fronts', p: { kind: v.kind, tau: v.tau } }),
      build(view) { view.stage = el('div', { class: 'stage' }); view.ftable = el('div', { class: 'tbl-wrap' }); return [view.stage, view.ftable]; },
      readout: (v, p) => {
        const o = p._out || Schemes.frontWx(v.kind, v.tau);
        return { w: { speed: o.speed, gust: o.speed * 1.2 + o.gust * 0.6, dir: o.dir }, extra: [`Давление ${UI.fmtNum(o.p, 1)} гПа, температура ${UI.fmtNum(o.temp)} °C`, o.rain > 0.6 ? 'Сильные осадки' : o.rain > 0.1 ? 'Дождь или морось' : 'Без осадков'], title: 'Погода на яхте' };
      },
      after(view) {
        const v = view.v, st = Schemes.frontStage(v.kind, v.tau);
        view.stage.innerHTML = '';
        view.stage.append(el('div', { class: 'stage-head' }, `${Schemes.FRONT[v.kind].label}: ${st[0]}`), el('div', {}, st[1]));
        const T = {
          warm: ['непрерывный дождь, морось', 'перистые, слоистые, слоисто-дождевые', 'медленно растёт', 'падает, затем ровно', '10–15 уз, заходит вправо'],
          cold: ['ливни, шквалы', 'кучево-дождевые', 'резко падает', 'падает, после фронта резко растёт', '15–30 уз, заход вправо на 60–90°'],
          occl: ['дождь, затем шквалы', 'слоистые, дождевые', 'меняется', 'падает, затем растёт', '10–15 уз'],
        };
        const rows = ['Осадки', 'Облака', 'Температура', 'Давление', 'Ветер'];
        view.ftable.innerHTML = '';
        const cols = [[Schemes.FRONT[v.kind].label, T[v.kind]]];
        view.ftable.append(el('table', { class: 'tbl' }, el('tr', {}, el('th', {}, 'При прохождении'), ...cols.map(([h]) => el('th', {}, h))), ...rows.map((r, i) => el('tr', {}, el('td', {}, r), ...cols.map(([, col]) => el('td', {}, col[i]))))));
      },
    },
    // ------------------------------------------------------------------ 2
    {
      id: 't4', num: 4, short: 'Бриз', title: 'Бриз',
      controls: [
        { id: 'preset', type: 'seg', label: 'Показать', options: [['day', 'Дневной бриз'], ['night', 'Ночной бриз']] },
        { id: 'hour', type: 'range', label: 'Время', min: 0, max: 23.5, step: 0.5, fmt: 'time' },
        { id: 'Gdir', type: 'dir', label: 'Синоптический ветер, откуда' },
        { id: 'G', type: 'range', label: 'Синоптический ветер', min: 0, max: 25, step: 1, unit: 'уз' },
        { id: 'clear', type: 'toggle', label: 'Ясно' },
      ],
      defaults: { preset: 'day', hour: 14.5, Gdir: 90, G: 4, clear: true },
      onControl(view, id) { if (id === 'preset') { view.v.hour = view.v.preset === 'night' ? 3 : 14.5; view.v.clear = true; view.v.G = Math.min(view.v.G, 4); view.rebuildControls(); } else if (id === 'hour') { view.v.preset = view.v.hour >= 9 && view.v.hour <= 19.5 ? 'day' : 'night'; } },
      yacht: { x: 4.4, y: 11 },
      section: (v, view, w, p) => {
        const g = Bay.gradL(p.x, p.y), gm = Math.hypot(g[0], g[1]);
        return { type: 'breeze', p: { hour: v.hour, sun: v.clear ? 1 : 0.1, G: v.G, n: gm > 1e-4 ? [g[0] / gm, g[1] / gm] : [1, 0], syn: w.parts.syn, br: w.parts.br } };
      },
      compute(v) {
        const S = { G: v.G, Gdir: v.Gdir, hour: v.hour, sun: v.clear ? 1 : 0.1, effects: fx({ breeze: true, lee: true, terrain: true }) };
        return {
          fn: (x, y) => Wind.at(x, y, S),
          overlays: { cumulus: Wind.breezeDay(v.hour) * (v.clear ? 1 : 0), night: v.hour < 6 || v.hour > 20 },
          extra: (w, p) => {
            const br = Math.hypot(...w.parts.br), d = Math.max(0, -Bay.sd(p.x, p.y));
            return [
              `Бриз в точке ${fmtNum(br)} уз${w.parts.br[0] * Bay.gradL(p.x, p.y)[0] + w.parts.br[1] * Bay.gradL(p.x, p.y)[1] < 0 ? ' (с берега)' : ''}`,
              w.land ? 'Яхта на суше.' : `До берега ${nm(d)} мили (${fmtNum(d, 1)} км)`,
              Wind.breezeDay(v.hour) > 0.3 && v.clear ? 'Над прогретым берегом встают кучевые облака.' : null,
            ];
          },
        };
      },
    },
    // ------------------------------------------------------------------ 3
    {
      id: 't5', num: 5, short: 'Стоковый', title: 'Стоковый и долинный ветер',
      controls: [
        { id: 'hour', type: 'range', label: 'Время', min: 0, max: 23.5, step: 0.5, fmt: 'time' },
        { id: 'G', type: 'range', label: 'Синоптический ветер', min: 0, max: 20, step: 1, unit: 'уз' },
        { id: 'Gdir', type: 'dir', label: 'Синоптический ветер, откуда' },
        { id: 'clear', type: 'toggle', label: 'Ясно' },
      ],
      defaults: { hour: 5, G: 2, Gdir: 0, clear: true },
      yacht: { x: 22.4, y: 19.7 },
      section: (v, view) => {
        const V = Bay.VALLEYS[0], m = Wind.at(V.to[0] + V.ux * 0.6, V.to[1] + V.uy * 0.6, view.r.S);
        return { type: 'katabatic', p: { hour: v.hour, sun: v.clear ? 1 : 0.1, G: v.G, mouth: m.speed } };
      },
      compute(v) {
        const S = { G: v.G, Gdir: v.Gdir, hour: v.hour, sun: v.clear ? 1 : 0.1, effects: fx({ katabatic: true, breeze: true, lee: true, terrain: true }) };
        return {
          S,
          overlays: { tint: Wind.katNight(v.hour) > 0.2 && v.clear ? [0.72, 0.86, 1] : null, cumulus: v.clear && Wind.breezeDay(v.hour) > 0.5 ? 0.5 : 0, night: v.hour < 6 || v.hour > 20 },
          fn: (x, y) => Wind.at(x, y, S),
          extra: (w) => {
            const k = Math.hypot(...w.parts.kat), night = Wind.katNight(v.hour) > 0.05;
            return [
              `Из них ${night ? 'стоковый' : 'долинный и склоновый'} ветер: ${fmtNum(k)} уз`,
              v.G >= 12 ? 'Синоптический ветер размывает стоковый.' : null,
            ];
          },
        };
      },
    },
    // ------------------------------------------------------------------ 4
    {
      id: 't6', num: 6, short: 'Бора', title: 'Бора',
      controls: [
        { id: 'cold', type: 'toggle', label: 'Холодный воздух на плато' },
        { id: 'high', type: 'toggle', label: 'Антициклон за хребтом' },
        { id: 'low', type: 'toggle', label: 'Циклон над морем' },
      ],
      defaults: { cold: true, high: true, low: true },
      yacht: { x: 27.5, y: 19.6 },
      video: { id: '1kuMhiQGEYY', caption: 'Бора в Хорватии: съёмка с дороги, канал H&M na cestách.' },
      section: (v, view) => {
        const S = view.r.S, pl = Wind.at(34, 26, S), ft = Wind.at(27.5, 19.6, S);
        return { type: 'bora', p: { cold: v.cold, high: v.high, low: v.low, Bo: S.bora, plateau: pl.speed, foot: ft.speed, footG: ft.gust } };
      },
      compute(v, view) {
        const n = (v.cold ? 1 : 0) + (v.high ? 1 : 0) + (v.low ? 1 : 0);
        const Bo = v.cold ? [0, 0.2, 0.5, 1][n] : 0;
        const base = { G: v.high || v.low ? 6 : 3, Gdir: 40, hour: 10, sun: 0, bora: Bo, effects: fx({ bora: true, terrain: true, lee: true }) };
        const key9 = `${Bo}|${base.G}`;
        if (view._c9key !== key9) { view._c9 = modelCells((r) => ({ ...base, res: r }), 9); view._c9key = key9; }
        const C9 = view._c9;
        return {
          fn: (x, y) => Wind.at(x, y, base),
          S: base,
          overlays: {
            cap: Bo >= 0.45, pool: v.cold ? (v.high ? 1 : 0.55) : 0,
            pressure: [v.high && { t: 'H', sub: 'центр за картой, 1030 гПа', x: 34, y: 27, z: 3.4 }, v.low && { t: 'L', sub: 'центр за картой (юго-запад), 1004 гПа', x: 5, y: 6, z: 2.6 }].filter(Boolean),
          },
          extra: (w, p) => {
            const m = cellAt(C9, p.x, p.y) || { speed: 0, gust: 0 };
            return [
              Bo === 0 ? 'Без холодного воздуха на плато боры нет.' : Bo < 0.45 ? 'Условия неполные: слабый ветер с гор.' : 'Бора. На гребне облачная шапка.',
              `Модель 9 км здесь: ${fmtNum(m.speed)} уз, порывы ${fmtNum(m.gust)}`,
            ];
          },
        };
      },
    },
    // ------------------------------------------------------------------ 5
    {
      id: 't7', num: 7, short: 'Рельеф', title: 'Ветер и рельеф',
      controls: [
        { id: 'Gdir', type: 'dir', label: 'Ветер, откуда' },
        { id: 'G', type: 'range', label: 'Ветер на высоте', min: 5, max: 35, step: 1, unit: 'уз' },
        { id: 'terrain', type: 'toggle', label: 'Учитывать рельеф' },
      ],
      defaults: { Gdir: 210, G: 20, terrain: true },
      yacht: { x: 21.1, y: 13.1 },
      section: (v, view, w, p) => {
        const w0 = Wind.at(p.x, p.y, { ...view.r.S, effects: fx({}) }), m = w.mods;
        const active = m.strait > 0.2 ? 'strait' : m.cape > 0.2 ? 'cape' : m.lee > 0.1 ? 'lee' : null;
        return { type: 'terrain', p: { active, delta: active && w0.speed > 0.5 ? pct(w.speed / w0.speed - 1) : null } };
      },
      compute(v) {
        const S = { G: v.G, Gdir: v.Gdir, hour: 12, effects: fx({ terrain: v.terrain, lee: v.terrain }) };
        const S0 = { ...S, effects: fx({}) };
        return {
          S,
          fn: (x, y) => Wind.at(x, y, S),
          extra: (w, p) => {
            const w0 = Wind.at(p.x, p.y, S0), m = w.mods, out = [`Без рельефа: ${fmtNum(w0.speed)} уз`];
            if (m.strait > 0.2) out.push(`Пролив: ${pct(w.speed / w0.speed - 1)}, ветер вдоль пролива`);
            if (m.cape > 0.2) out.push(`Мыс: ${pct(w.speed / w0.speed - 1)}`);
            if (m.island > 0.05) out.push(`Край острова: ${pct(w.speed / w0.speed - 1)}`);
            if (m.lee > 0.1) out.push(`Тень берега: ${pct(w.speed / w0.speed - 1)}${w.variable ? ', направление переменное' : ''}`);
            return out;
          },
        };
      },
    },
    // ------------------------------------------------------------------ waves
    {
      id: 'waves', short: 'Волна', title: 'Волна', legend: 'wave',
      controls: [
        { id: 'Gdir', type: 'dir', label: 'Ветер, откуда' },
        { id: 'G', type: 'range', label: 'Ветер на высоте', min: 5, max: 35, step: 1, unit: 'уз' },
        { id: 'swell', type: 'toggle', label: 'Зыбь с юга 1,5 м' },
      ],
      defaults: { Gdir: 210, G: 22, swell: true },
      yacht: { x: 9.6, y: 3.4 },
      compute(v) {
        const S = { G: v.G, Gdir: v.Gdir, hour: 12, effects: fx({ terrain: true, lee: true }) };
        const sw = v.swell ? { h: 1.5, dir: 185 } : null, fn = (x, y) => Wind.at(x, y, S);
        return {
          S, fn, title: 'Ветер у яхты',
          overlays: { colorFn: (x, y) => globalThis.Wave.at(x, y, fn(x, y), sw).hs, arrowFn: (x, y) => { const q = globalThis.Wave.at(x, y, fn(x, y), sw); return { u: q.u, v: q.v, h: q.hs }; } },
          extra: (w, p) => {
            const q = globalThis.Wave.at(p.x, p.y, w, sw);
            return [`Волна ${fmtNum(q.hs, 1)} м${q.dir != null ? `, идёт с ${Wind.compass(q.dir)}` : ''}`, `Ветровая ${fmtNum(q.sea, 1)} м, разгон ${q.fetch >= 150 ? 'с открытого моря' : `${fmtNum(q.fetch)} км`}`, ...(sw ? [`Зыбь ${fmtNum(q.sw, 1)} м${q.shade > 0.5 ? ', тень берега' : ''}`] : [])];
          },
        };
      },
    },
    // ------------------------------------------------------------------ 8. convection and thunderstorms
    {
      id: 't8', num: 8, short: 'Грозы', title: 'Конвекция и грозы',
      controls: [{ id: 'hour', type: 'range', label: 'Время', min: 10, max: 21, step: 0.25, fmt: 'time' }],
      defaults: { hour: 16.5 },
      yacht: { x: 9.5, y: 6.2 },
      section: (v) => ({ type: 'convection', p: { hour: v.hour } }),
      compute(v) {
        const T = Ens.SCENARIOS.summer.stateAt(16, Ens.CONTROL).storm;
        const S = { G: 4, Gdir: 350, hour: v.hour, sun: 1, storm: T, effects: fx({ storm: true, breeze: true, terrain: true, lee: true }) };
        const c = Wind.stormState(T, v.hour);
        return {
          T, S, fn: (x, y) => Wind.at(x, y, S),
          overlays: { storm: c, cumulus: v.hour >= 11 && v.hour < 15 ? 0.4 + 0.6 * Wind.sstep(11, 15, v.hour) : 0 },
          extra: (w, p) => {
            const d = Math.hypot(p.x - c.x, p.y - c.y);
            return [c.I < 0.05 ? 'Гроза ещё не развилась или уже распалась.' : d < 2.4 ? 'Яхта под ячейкой: ливень, шквал, видимость 100–300 м.' : d < 6 ? `Фронт порывов рядом, до ячейки ${UI.fmtNum(d / 1.852, 1)} мили.` : `До ячейки ${UI.fmtNum(d / 1.852, 0)} ${UI.plural(d / 1.852, 'миля', 'мили', 'миль')}.`];
          },
        };
      },
    },
    // ------------------------------------------------------------------ 9. fog
    {
      id: 't9', num: 9, short: 'Туман', title: 'Туман',
      controls: (v) => [
        { id: 'type', type: 'seg', label: 'Тип', options: [['rad', 'Радиационный'], ['adv', 'Адвективный']], rebuild: true },
        ...(v.type === 'rad' ? [
          { id: 'hour', type: 'range', label: 'Время', min: 0, max: 23.5, step: 0.25, fmt: 'time' },
          { id: 'T', type: 'range', label: 'Температура вечером, в 19:00', min: 6, max: 26, step: 0.5, unit: '°C' },
          { id: 'Td', type: 'range', label: 'Точка росы', min: 0, max: 22, step: 0.5, unit: '°C' },
          { id: 'G', type: 'range', label: 'Ветер', min: 0, max: 15, step: 1, unit: 'уз' },
          { id: 'clear', type: 'toggle', label: 'Ясно' },
        ] : [
          { id: 'Ta', type: 'range', label: 'Воздух над морем', min: 10, max: 28, step: 0.5, unit: '°C' },
          { id: 'Tda', type: 'range', label: 'Точка росы воздуха', min: 6, max: 24, step: 0.5, unit: '°C' },
          { id: 'sst', type: 'range', label: 'Температура моря', min: 8, max: 26, step: 0.5, unit: '°C' },
          { id: 'G', type: 'range', label: 'Ветер с моря', min: 0, max: 25, step: 1, unit: 'уз' },
        ]),
      ],
      defaults: { type: 'rad', hour: 5, T: 16, Td: 12, G: 2, clear: true, Ta: 20, Tda: 16, sst: 14 },
      yacht: { x: 22.8, y: 19.2 },
      fog(v) { return v.type === 'adv' ? Schemes.fogState({ type: 'adv', T: v.Ta, Td: v.Tda, sst: v.sst, G: v.G }) : Schemes.fogState({ type: 'rad', hour: v.hour, T: v.T, Td: v.Td, G: v.G, clear: v.clear }); },
      section: (v) => ({ type: 'fog', p: v.type === 'adv' ? { type: 'adv', T: v.Ta, Td: v.Tda, sst: v.sst, G: v.G, hour: 13 } : { type: 'rad', hour: v.hour, T: v.T, Td: v.Td, G: v.G, clear: v.clear } }),
      compute(v) {
        const F = this.fog(v), adv = v.type === 'adv';
        const S = { G: v.G, Gdir: adv ? 200 : 20, hour: adv ? 13 : v.hour, sun: adv ? 0 : v.clear ? 1 : 0.1, effects: fx({ lee: true, katabatic: !adv, breeze: !adv }) };
        return {
          fn: (x, y) => Wind.at(x, y, S),
          overlays: { fog: { type: v.type, density: F.density, lifted: F.lifted }, night: !adv && (v.hour < 6 || v.hour > 20) },
          extra: () => [`T ${UI.fmtNum(F.T, 1)} °C, Td ${UI.fmtNum(F.Td, 1)} °C, T − Td = ${UI.fmtNum(F.spread, 1)} °C`, F.density > 0.15 ? `Туман: видимость ${Schemes.visibility(F.density)}` : F.spread < 2 ? 'Дымка, туман близко' : 'Тумана нет'],
        };
      },
    },
    // ------------------------------------------------------------------ 7
    {
      id: 't10', num: 10, short: 'Разрешение', title: 'Разрешение модели',
      controls: [
        { id: 'scn', type: 'seg', label: 'Ситуация', options: [['bora', 'Бора'], ['breeze', 'Бриз, 15:00'], ['sw', 'SW 20 уз']] },
        { id: 'res', type: 'seg', label: 'Сетка модели', options: [[25, '25 км'], [9, '9 км'], [3, '3 км'], [1, '1 км']] },
        { id: 'truth', type: 'toggle', label: 'Показать факт' },
      ],
      defaults: { scn: 'bora', res: 9, truth: false },
      yacht: { x: 21.1, y: 13.1 },
      section: (v) => ({ type: 'resolution', p: { res: v.res } }),
      compute(v, view) {
        const base = {
          bora: { G: 6, Gdir: 40, hour: 10, sun: 0, bora: 1 },
          breeze: { G: 3, Gdir: 0, hour: 15, sun: 1 },
          sw: { G: 20, Gdir: 215, hour: 12, sun: 0.3 },
        }[v.scn];
        const stateFn = (res) => ({ ...base, res });
        const key = v.scn + v.res;
        if (view._cellKey !== key) { view._cells = modelCells(stateFn, v.res); view._cellKey = key; }
        const C = view._cells, T = stateFn(0);
        view.map.showCells = !v.truth;
        let ridge = 0;
        for (const c of C.list) ridge = Math.max(ridge, Bay.cellElev(c.x0 + c.size / 2, c.y0 + c.size / 2, c.size));
        return {
          fn: v.truth ? (x, y) => Wind.at(x, y, T) : (x, y) => { const c = cellAt(C, x, y); return c ? cellWind(c) : Wind.at(x, y, T); },
          cells: C,
          title: v.truth ? 'Факт в точке' : `Модель ${v.res} км, ячейка`,
          extra: (w, p) => {
            const c = cellAt(C, p.x, p.y), t = Wind.at(p.x, p.y, T);
            return [
              v.truth ? `Модель ${v.res} км в этой ячейке: ${fmtNum(c.speed)} уз, порывы ${fmtNum(c.gust)}` : `Факт в точке: ${fmtNum(t.speed)} уз, порывы ${fmtNum(t.gust)}`,
              `Пролив шириной 1 км занимает ${fmtNum(1 / v.res, 2)} ячейки`,
              c && c.land && !Bay.isLand(p.x, p.y) ? 'Яхта на воде, но модель считает эту ячейку сушей: трение и ветер как на берегу.' : null,
            ];
          },
        };
      },
    },
    // ------------------------------------------------------------------ 8
    {
      id: 'models', short: 'Модели', title: 'Глобальные и региональные модели', scheme: true,
      controls: [
        { id: 'lead', type: 'seg', label: 'Срок прогноза', options: [[0.25, '6 ч'], [1, 'сутки'], [2, '2 суток'], [4, '4 суток'], [7, 'неделя'], [12, '12 суток']] },
        { id: 'grid', type: 'seg', label: 'Сетка над бухтой', options: [[13, 'GFS 13 км'], [9, 'ECMWF 9 км'], [2, 'ICON-D2 2 км'], [1.3, 'AROME 1,3 км']] },
      ],
      defaults: { lead: 1, grid: 13 },
      section: (v) => ({ type: 'models', p: { lead: v.lead, grid: v.grid } }),
      build(view) { view.mtext = el('div', { class: 'stage' }); return [view.mtext]; },
      after(view) {
        const lead = view.v.lead, use = Schemes.modelsFor(lead);
        const why = lead <= 2 ? 'Региональные модели ещё считают этот срок и видят бухту, мысы и проливы. Глобальные берут для общей картины: где циклон и фронт.'
          : lead <= 5 ? 'Самые подробные региональные модели так далеко не считают. ICON-EU с сеткой 7 км и глобальные модели показывают, будет ли фронт, бора или циклон, но местный ветер сглажен.'
            : 'Так далеко считают только глобальные модели. Детали ветра у берега на таком сроке не важны: смотрят, придёт ли циклон или фронт и как сходятся модели между собой.';
        view.mtext.innerHTML = '';
        view.mtext.append(el('div', { class: 'stage-head' }, `${lead < 1 ? 'Через 6 часов' : lead === 1 ? 'Через сутки' : lead === 7 ? 'Через неделю' : `Через ${lead} суток`}: ${use.join(', ')}`), el('div', {}, why));
      },
    },
    {
      id: 't11', num: 11, short: 'Ансамбль', title: 'Ансамбль и разброс', underMap: true,
      controls: [
        { id: 'scn', type: 'seg', label: 'Ситуация', options: [['summer', 'Летний день'], ['front', 'Холодный фронт'], ['bora', 'Бора']] },
        { id: 'hour', type: 'range', label: 'Время на карте', min: 0, max: 42, step: 0.5, fmt: 'time' },
        { id: 'truth', type: 'toggle', label: 'Показать факт' },
        { id: 'reseed', type: 'button', label: 'Другой факт' },
      ],
      defaults: { scn: 'front', hour: 12, truth: false, seed: 3 },
      yacht: { x: 9.5, y: 4.0 },
      build(view) {
        view.chartCanvas = el('canvas', { class: 'chart', style: 'height:220px' });
        view.legend = el('div', { class: 'legend' });
        const a = (href, t) => el('a', { href, target: '_blank', rel: 'noopener' }, t);
        return [el('div', { class: 'chart-box' }, el('div', { class: 'chart-title' }, 'Метеограмма в точке яхты: средний ветер, уз'), view.chartCanvas, view.legend,
          el('p', { class: 'chart-links' }, 'Такие метеограммы для своей точки: ',
            a('https://charts.ecmwf.int/products/opencharts_meteogram', 'ECMWF ENS'), ' и ',
            a('https://www.meteoblue.com/en/weather/forecast/multimodelensemble', 'Meteoblue MultiModel Ensemble'), '.'))];
      },
      services: true,
      onControl(view, id) { if (id === 'reseed') { view.v.seed = (view.v.seed || 3) + 1; view.v.truth = true; view.rebuildControls(); } },
      compute(v, view) {
        const scn = Ens.SCENARIOS[v.scn];
        if (!view._mem) view._mem = Ens.members(30, 11);
        const tp = Ens.truth(v.seed);
        const S = v.truth ? Ens.state(scn, v.hour, tp, 0) : Ens.state(scn, v.hour, Ens.CONTROL, 9);
        view._tp = tp;
        const ov = {};
        if (S.front) ov.front = Wind.frontLine(S);
        if (S.storm) ov.storm = Wind.stormState(S.storm, v.hour);
        if (S.bora > 0.45) ov.cap = true;
        return {
          fn: (x, y) => Wind.at(x, y, S), overlays: ov,
          title: v.truth ? `Факт, ${fmtTime(v.hour)}` : `Контрольный прогноз 9 км, ${fmtTime(v.hour)}`,
        };
      },
      after(view, p) {
        const v = view.v, scn = Ens.SCENARIOS[v.scn], hours = [];
        for (let h = 0; h <= 42; h += 1) hours.push(h);
        const key = `${v.scn}|${p.x.toFixed(2)}|${p.y.toFixed(2)}|${v.seed}`;
        if (view._serKey !== key) {
          view._ser = Ens.series(p.x, p.y, scn, view._mem, hours, 9);
          view._pc = Ens.percentiles(view._ser.speed);
          view._truthSer = Ens.series(p.x, p.y, scn, [view._tp], hours, 0).speed[0];
          view._serKey = key;
        }
        const pc = view._pc, css = Draw.css;
        const ymax = Math.max(20, Math.ceil(Math.max(...pc.p90, ...(v.truth ? view._truthSer : [])) / 10) * 10);
        const lines = view._ser.speed.map((ys) => ({ xs: hours, ys, color: css('--ink'), width: 1, alpha: 0.3 }));
        lines.push({ xs: hours, ys: pc.p10, color: css('--muted'), width: 1 });
        lines.push({ xs: hours, ys: pc.mean, color: css('--ink'), width: 1.5, dash: [5, 4] });
        lines.push({ xs: hours, ys: pc.p50, color: css('--ink'), width: 2 });
        lines.push({ xs: hours, ys: pc.p90, color: css('--warn'), width: 2 });
        if (v.truth) lines.push({ xs: hours, ys: view._truthSer, color: css('--truth'), width: 3 });
        chart(view.chartCanvas, {
          x0: 0, x1: 42, y0: 0, y1: ymax, xstep: 6, ystep: ymax > 40 ? 10 : 5,
          xfmt: (x) => (x >= 24 ? `${x - 24}:00+1` : `${x}:00`),
          bands: [{ xs: hours, lo: pc.p10, hi: pc.p90, color: css('--band') }, { xs: hours, lo: pc.p25, hi: pc.p75, color: css('--band2') }],
          lines, cursor: v.hour,
        });
        const i = Math.round(v.hour), spread = Math.round(pc.p90[i]) - Math.round(pc.p10[i]);
        let above = 0;
        for (let k = 0; k < hours.length; k++) if (view._truthSer[k] > pc.p90[k]) above++;
        view.legend.innerHTML = '';
        view.legend.append(...[
          el('span', { class: 'lg lg-mem' }, `${view._ser.speed.length} прогонов`), el('span', { class: 'lg lg-band' }, 'P10–P90'), el('span', { class: 'lg lg-p50' }, 'медиана P50'),
          el('span', { class: 'lg lg-mean' }, 'среднее'), el('span', { class: 'lg lg-p90' }, 'P90'),
          v.truth ? el('span', { class: 'lg lg-t8' }, 'факт') : null].filter(Boolean),
          el('div', { class: 'legend-note' },
            `${fmtTime(v.hour)}: P10 ${fmtNum(pc.p10[i])}, P50 ${fmtNum(pc.p50[i])}, P90 ${fmtNum(pc.p90[i])} уз. Разброс P90 − P10 = ${spread} уз: ${spread < 5 ? 'узкий (меньше 5 уз), прогноз надёжен' : spread <= 10 ? 'средний (5–10 уз)' : 'широкий (больше 10 уз), планировать по P90'}.`,
            v.truth ? ` Факт выше P90 в ${above} из ${hours.length} часов.` : ''),
        );
      },
    },
  ];

  // ---------------------------------------------------------------- view
  // Short how-to under the 3D map.
  const MAP_HINT = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
    ? 'Нажмите на воду, чтобы поставить яхту. Двумя пальцами карту можно вращать.'
    : 'Перетащите яхту или щёлкните по воде. Карту можно вращать мышью.';

  // Chapter page: title and lead, short prose, the figure with its controls and live caption, prose, key points.
  class TopicView {
    constructor(root, T, chapter) {
      this.T = T;
      this.v = { ...T.defaults };
      const C = chapter || { title: T.title, lead: '', before: [], after: [], key: [] };
      const prose = (arr) => (arr && arr.length ? el('div', { class: 'prose' }, ...arr.map((t) => el('p', {}, UI.typo(t)))) : null);
      this.root = el('article', { class: `chapter${T.scheme ? ' chapter-scheme' : ''}`, id: `view-${T.id}` });
      const head = el('header', { class: 'ch-head' }, el('h1', { class: 'ch-title' }, C.title), C.lead ? el('p', { class: 'ch-lead' }, UI.typo(C.lead)) : null);
      const fig = el('figure', { class: 'plate' });
      const stage = el('div', { class: 'plate-stage' });
      this.ctlBox = el('div', { class: 'controls' });
      this.readout = new Readout(el('div'));
      this.extraBox = el('div', { class: 'extras' });
      const under = el('div', { class: 'plate-under' });
      fig.append(stage, this.readout.root, this.ctlBox, this.extraBox, under);
      this.root.append(head, prose(C.before) || '', fig, prose(C.after) || '',
        T.video ? videoBox(T.video) : '',
        C.key && C.key.length ? el('section', { class: 'key', 'aria-label': 'Главное' }, el('h2', {}, 'Главное'), el('ul', {}, ...C.key.map((k) => el('li', {}, UI.typo(k))))) : '',
        T.services ? servicesBox() : '');
      root.append(this.root);
      if (T.scheme) {
        this.map = null;
        this.section = new Section(stage, { big: true, onPoint: (pt) => { this.v.point = pt; this.schedule(); } });
      } else {
        this.map = new MapView(stage, { yacht: T.yacht, mode: 'yacht', onYacht: () => this.updateReadout() });
        stage.append(el('div', { class: 'map-foot' }, T.legend === 'wave' ? waveScale() : legendScale(), el('p', { class: 'map-hint' }, MAP_HINT)));
        this.section = new Section(under);
      }
      if (T.build) (T.underMap ? under : this.extraBox).append(...T.build(this));
      if (T.buildPanel) this.extraBox.append(...T.buildPanel(this));
      this.rebuildControls();
      this.recompute();
    }
    // Put the topic into a given state (used by automated checks).
    applyPreset(preset, yacht, view) {
      this.v = { ...this.T.defaults, ...(preset || {}) };
      this.rebuildControls();
      if (this.map) {
        if (yacht) this.map.yacht = { ...this.map.yacht, ...yacht };
        this.map.setView(view || '3d', true);
      }
      this.recompute();
    }
    rebuildControls() {
      const T = this.T, defs = typeof T.controls === 'function' ? T.controls(this.v) : T.controls;
      this.ctlBox.innerHTML = '';
      for (const d of defs) {
        this.ctlBox.append(control(d, this.v[d.id], (val) => {
          if (d.type !== 'button') this.v[d.id] = val;
          if (T.onControl) T.onControl(this, d.id);
          if (d.rebuild) this.rebuildControls();
          this.schedule();
        }));
      }
    }
    schedule() {
      if (this._pending) return;
      this._pending = true;
      requestAnimationFrame(() => { this._pending = false; this.recompute(); });
    }
    recompute() {
      if (this.T.scheme) { this.r = {}; this.updateReadout(); return; }
      this.r = this.T.compute(this.v, this);
      this.map.overlays = this.r.overlays || {};
      this.map.setField(this.r.fn, this.r.cells);
      this.updateReadout();
    }
    updateReadout() {
      const T = this.T;
      if (T.scheme) {
        const sc = T.section(this.v, this);
        this.section.set(sc.type, sc.p);
        const ro = T.readout ? T.readout(this.v, sc.p) : null;
        this.readout.root.hidden = !ro;
        if (ro) this.readout.update(ro.w, ro.extra, ro.title);
        if (T.after) T.after(this);
        return;
      }
      const p = this.map.yacht, w = this.r.fn(p.x, p.y);
      this.readout.update(w, this.r.extra ? this.r.extra(w, p) : [], this.r.title);
      if (T.section) { const sc = T.section(this.v, this, w, p); this.section.set(sc.type, sc.p); } else this.section.set(null);
      if (T.after) T.after(this, p);
    }
  }

  function legendScale() {
    const box = el('div', { class: 'scale', 'aria-label': 'Шкала скорости ветра, узлы' });
    for (const k of [0, 5, 10, 15, 20, 25, 30, 40, 50]) box.append(el('span', { style: `--c:${Draw.speedCSS(k)}` }, String(k)));
    box.prepend(el('span', { class: 'scale-title' }, 'Ветер, уз'));
    return box;
  }

  function waveScale() {
    const box = el('div', { class: 'scale', 'aria-label': 'Шкала высоты волны, метры' });
    for (const [h, c] of Draw.WAVE) box.append(el('span', { style: `--c:rgb(${c[0]},${c[1]},${c[2]})` }, fmtNum(h, h % 1 ? 1 : 0)));
    box.prepend(el('span', { class: 'scale-title' }, 'Волна, м'));
    return box;
  }

  globalThis.Topics = { TOPICS, TopicView, legendScale, waveScale, modelCells };
})();
