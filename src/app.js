// Navigation between chapters and the reference sheet. Views are built lazily.
(function () {
  const { el } = globalThis.UI;
  const { TOPICS, TopicView } = globalThis.Topics;
  const views = {};
  const nav = document.getElementById('nav');
  const main = document.getElementById('main');

  // Chapters in reading order, then the reference sheet.
  const CH = globalThis.CHAPTERS || {};
  const ITEMS = [
    ...TOPICS.map((t) => ({ id: t.id, label: (CH[t.id] || t).title })),
    { id: 'final', label: (CH.final || {}).title || 'Итоговый переход' },
    { id: 'summary', label: 'Что запомнить' },
  ].map((it, i) => ({ ...it, n: i + 1 }));
  const REF = { id: 'ref', label: 'Справка' };
  const SITE = 'https://idrigo.github.io/wind-coast-trainer/';
  const toc = el('details', { class: 'toc' });
  const tocLabel = el('span', { class: 'toc-label' });
  const tocList = el('ol', { class: 'toc-list' }, ...ITEMS.map((it) => el('li', {}, el('a', { href: `#${it.id}`, 'data-id': it.id }, it.label))));
  toc.append(el('summary', {}, el('span', { class: 'toc-word' }, 'Главы'), tocLabel), el('nav', { 'aria-label': 'Главы' }, tocList));
  nav.append(toc, el('a', { href: '#ref', class: 'ref-link', 'data-id': 'ref' }, 'Справка'));
  document.addEventListener('click', (e) => { if (toc.open && !toc.contains(e.target)) toc.open = false; });

  function pager(k) {
    const prev = ITEMS[k - 1], next = ITEMS[k + 1];
    return el('nav', { class: 'pager', 'aria-label': 'Соседние главы' },
      prev ? el('a', { href: `#${prev.id}`, class: 'pg-prev' }, el('span', {}, 'Назад'), el('b', {}, prev.label)) : el('span'),
      next ? el('a', { href: `#${next.id}`, class: 'pg-next' }, el('span', {}, next.id === 'summary' ? 'Итог' : `Глава ${next.n}`), el('b', {}, next.label)) : el('span'));
  }

  function ensure(id) {
    if (views[id]) return views[id];
    const k = ITEMS.findIndex((it) => it.id === id);
    if (id === 'cover') views[id] = { root: cover(main) };
    else if (id === 'summary') views[id] = { root: summary(main) };
    else if (id === 'final') views[id] = new globalThis.Final.FinalView(main);
    else if (id === 'ref') views[id] = { root: reference(main) };
    else views[id] = new TopicView(main, TOPICS.find((t) => t.id === id), CH[id]);
    if (k >= 0) {
      const v = views[id];
      if (id !== 'summary') v.root.querySelector('.ch-head').prepend(el('p', { class: 'ch-num' }, `Глава ${ITEMS[k].n}`));
      v.root.append(pager(k));
    }
    return views[id];
  }

  function show(id) {
    if (id !== 'ref' && !ITEMS.some((i) => i.id === id)) id = 'cover';
    const view = ensure(id);
    for (const [k, v] of Object.entries(views)) v.root.hidden = k !== id;
    if (view.map) view.map.activate();
    const cur = ITEMS.find((i) => i.id === id);
    tocLabel.textContent = cur ? `${cur.n}. ${cur.label}` : '';
    for (const a of nav.querySelectorAll('[data-id]')) a.setAttribute('aria-current', a.dataset.id === id ? 'page' : 'false');
    toc.open = false;
    window.scrollTo(0, 0);
  }

  // Title page: course name, start link and a QR code to the hosted copy.
  function cover(root) {
    const qr = el('a', { class: 'cover-qr', href: SITE, 'aria-label': `QR-код: ${SITE}` });
    qr.append(document.getElementById('qr-svg').content.cloneNode(true));
    const sec = el('section', { class: 'cover', id: 'view-cover' },
      el('div', { class: 'cover-text' },
        el('h1', { class: 'cover-title' }, 'Метеорология для\u00a0яхтсменов'),
        el('p', { class: 'cover-lead' }, UI.typo('Местные ветры, фронты и чтение прогноза. Тренажёр к\u00a0лекции «Прогноз погоды».')),
        el('a', { class: 'btn primary cover-start', href: `#${ITEMS[0].id}` }, `Глава 1. ${ITEMS[0].label}`)),
      el('figure', { class: 'cover-code' }, qr,
        el('figcaption', {}, el('span', {}, 'Открыть на телефоне'), el('a', { href: SITE }, SITE.replace('https://', '').replace(/\/$/, '')))));
    root.append(sec);
    return sec;
  }

  // Key points of every chapter on one page, for the end of the lecture.
  function summary(root) {
    const cards = ITEMS.filter((it) => CH[it.id] && CH[it.id].key && it.id !== 'final').map((it) => el('article', { class: 'sum-card' },
      el('h3', {}, el('span', { class: 'sum-n' }, String(it.n)), el('a', { href: `#${it.id}` }, it.label)),
      el('ul', {}, ...CH[it.id].key.map((t) => el('li', {}, UI.typo(t))))));
    const sec = el('section', { class: 'summary', id: 'view-summary' },
      el('header', { class: 'ch-head' }, el('h1', { class: 'ch-title' }, 'Что запомнить')),
      el('div', { class: 'sum-grid' }, ...cards));
    root.append(sec);
    return sec;
  }

  function reference(root) {
    const bf = [
      ['0', 'Штиль', '< 1', '0', 'зеркально гладкое'], ['1', 'Тихий', '1–3', '0–0,2', 'рябь'],
      ['2', 'Лёгкий', '4–6', '0,2–0,5', 'короткие волны, гребни не опрокидываются'], ['3', 'Слабый', '7–10', '0,5–1', 'изредка барашки'],
      ['4', 'Умеренный', '11–16', '1–2', 'барашки во многих местах'], ['5', 'Свежий', '17–21', '2–3', 'барашки повсюду, брызги'],
      ['6', 'Сильный', '22–27', '3–4', 'крупные волны, пенные гребни'], ['7', 'Крепкий', '28–33', '4–5,5', 'пена полосами по ветру'],
      ['8', 'Очень крепкий', '34–40', '5,5–7,5', 'длинные высокие волны, брызги с гребней'], ['9', 'Шторм', '41–47', '7–10', 'гребни опрокидываются'],
      ['10', 'Сильный шторм', '48–55', '9–12,5', 'море белое от пены'], ['11', 'Жестокий шторм', '56–63', '11,5–16', 'суда скрываются за волнами'],
      ['12', 'Ураган', '> 63', '> 14', 'воздух полон пены и брызг'],
    ];
    const fixes = [
      ['Солнечная погода у берега', 'плюс 5–10 уз бриза после полудня'],
      ['Ясно, антициклон за хребтом, в прогнозе NE 15 уз', 'ждать бору 25–35 уз, порывы 45'],
      ['Мысы и проливы', 'скорость ×1,3; под горой затишье и порывы сверху'],
      ['Высокий CAPE', 'грозы после полудня над горами, к вечеру у моря'],
      ['Расхождение направлений у берега', 'верить региональной модели и наблюдению'],
      ['Ансамбль', 'планировать по P90, а не по медиане'],
    ];
    const signs = [
      ['Барометр падает 3–5 гПа за 3 ч', 'сильный ветер через 6–12 ч'],
      ['Перистые сгущаются, гало', 'ухудшение через 12–24 ч'],
      ['После дождя ветер повернул по часовой', 'прошёл холодный фронт: порывисто, затем улучшение'],
      ['Кучевые растут в башни к полудню', 'шквалы и ливни после обеда'],
      ['Резко ясная видимость, горы близко', 'холодный сухой воздух, зимой бора'],
      ['Облачная шапка на гребне', 'бора'],
    ];
    const table = (head, rows, cls) => el('div', { class: 'tbl-wrap' }, el('table', { class: `tbl ${cls || ''}` },
      el('tr', {}, ...head.map((h) => el('th', {}, h))), ...rows.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, UI.typo(c)))))));
    const barbs = el('canvas', { class: 'barb-key', width: 760, height: 150, role: 'img', 'aria-label': 'Флажки ветра: 5, 10, 15, 25 и 50 узлов' });
    const sec = el('section', { class: 'ref', id: 'view-ref' },
      el('header', { class: 'ch-head' }, el('h1', { class: 'ch-title' }, 'Справка'), el('p', { class: 'ch-lead' }, 'Шкала Бофорта, поправки к прогнозу, признаки изменения погоды и слова из глав.')),
      el('div', { class: 'ref-grid' },
        el('div', {}, el('h3', {}, 'Шкала Бофорта'), table(['Балл', 'Название', 'Узлы', 'Волна, м', 'Состояние моря'], bf, 'bf'),
          el('p', { class: 'note' }, 'Средний ветер за 10 минут на высоте 10 м. 1 узел = 1,852 км/ч = 0,514 м/с; 10 м/с ≈ 20 уз. Порывы на 20–40 % сильнее среднего, в боре и при шквалах вдвое.'),
          el('h3', {}, 'Как читать флажок ветра'), barbs, el('p', { class: 'note' }, 'Слева направо: 5, 10, 15, 25 и 50 узлов. Ветер на всех флажках северо-восточный: древко смотрит туда, откуда он дует.')),
        el('div', {}, el('h3', {}, 'Поправки к прогнозу модели'), table(['Ситуация', 'Поправка'], fixes),
          el('h3', {}, 'Признаки изменения погоды'), table(['Наблюдение', 'Ожидание'], signs))));
    // How to read the symbols, and the words used in the trainer.
    const gl = [
      ['Флажок ветра', 'Древко указывает, откуда дует ветер. Короткое перо 5 уз, длинное 10 уз, треугольник 50 уз.'],
      ['Цвет воды и штрихи на карте', 'Цвет показывает средний ветер, бегущие штрихи показывают поток. Стрелки в таблице прогноза, как в большинстве приложений, показывают, куда дует ветер.'],
      ['Геострофический ветер', 'Ветер на высоте, где нет трения: дует вдоль изобар. У поверхности он слабее и повёрнут к низкому давлению.'],
      ['Изобары, H и L', 'Линии одинакового давления. H означает антициклон (высокое давление), L циклон (низкое). Чем гуще изобары, тем сильнее ветер.'],
      ['Ветровая волна и зыбь', 'Ветровую волну поднимает местный ветер, она короткая и крутая. Зыбь приходит издалека, она пологая.'],
      ['Ротор', 'Вихрь с горизонтальной осью под высоким берегом, с которого дует ветер: штиль и порывы с разных направлений.'],
      ['Ячейка модели', 'Квадрат сетки модели. Модель даёт среднее по ячейке, а не значение в точке.'],
      ['CAPE', 'Энергия неустойчивости атмосферы. При высоком CAPE возможны грозы.'],
      ['Ансамбль, P10, P50, P90', 'Модель считают 30–50 раз с разными начальными условиями. P50, медиана: половина прогонов выше, половина ниже. P90 превышают только 10 % прогонов, по нему планируют.'],
      ['Контрольный прогноз', 'Прогон ансамбля без изменений начальных условий, обычный прогноз модели.'],
      ['Время «+1»', 'На графиках «6:00+1» означает 06:00 следующего дня.'],
    ];
    sec.append(el('div', { class: 'ref-gloss' }, el('h3', {}, 'Слова, которые встречаются в тренажёре'),
      el('dl', { class: 'glossary' }, ...gl.flatMap(([t, d]) => [el('dt', {}, t), el('dd', {}, UI.typo(d))]))));
    root.append(sec);
    requestAnimationFrame(() => {
      const c = barbs.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 380, 75);
      [5, 10, 15, 25, 50].forEach((kn, i) => { globalThis.Draw.drawBarb(c, 40 + i * 72, 55, 45, kn, 38, globalThis.Draw.css('--ink')); c.fillStyle = globalThis.Draw.css('--muted'); c.font = '12px "IBM Plex Sans", system-ui, sans-serif'; c.fillText(`${kn} уз`, 26 + i * 72, 72); });
    });
    return sec;
  }

  globalThis.Trainer = { views }; // for automated checks
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || 'cover');
  // Redraw maps when fonts arrive or the theme changes.
  const redraw = () => { for (const v of document.querySelectorAll('.map-wrap')) v.dispatchEvent(new Event('themechange')); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
