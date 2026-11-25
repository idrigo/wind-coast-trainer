# Trainer review, 2026-11-25

Scope: all 14 chapters and the reference page of `dist/index.html`, read in full and checked on screenshots
at 1400 px and 390 px, light theme only. The final passage was played through («Летний день», route via the strait
and the cape, «Идти»). Tests: 13 pass. No console errors.
Status (same day): all items are fixed in `src/` and built into `dist/`, except 1.1 (the author keeps the chapter
order). Kept by decision: the model still weakens the katabatic wind under strong synoptic wind (1.8); the prose now
states only what the map shows. Checked on screenshots at 1400 px and 390 px (light), final passage played through;
tests 13 pass, no console errors. Not yet published to the artifact or to GitHub Pages.

Priority: **A** misleads or breaks the story, **B** visibly wrong or untidy, **C** polish.

## 1. Narrative and clarity

| # | Pri | Where | Problem | Proposed fix |
|---|---|---|---|---|
| 1.1 | A | ch. 2 «Давление, циклоны» | The map shows wind barbs, warm and cold fronts and a warm sector, and the readout gives «8 баллов, очень крепкий». Barbs and Beaufort come in ch. 3, fronts in ch. 4. The text admits it: «читать их будем в следующей главе». | Put «Ветер: флажки и шкала Бофорта» before «Давление» (it does not depend on it), and drop the fronts from the ch. 2 map or say that they come in ch. 4. |
| 1.2 | A | ch. 2, first sentence | «То же самое происходит и в масштабе тысяч километров» says that cyclones work like local heating. That is wrong. | «Давление различается и на расстояниях в тысячи километров.» |
| 1.3 | B | ch. 2, after the figure | «На яхте важно, как изменилось давление за последние 3 часа» stands alone. The key point «Барометр упал больше чем на 3 гПа за 3 часа: ветер усилится» has no explanation. | Link them: when a cyclone approaches, the isobars over the yacht get closer together and the barometer falls. A fall of more than 3 hPa in 3 hours means the wind will increase. |
| 1.4 | B | ch. 3 | «Порыв опускает к воде воздух сверху» reverses cause and effect. «Это средний ветер за 10 минут» does not say what «это» refers to. The sentences on wind sea and swell have nothing to do with the figure or the exercise. | «Порыв — это воздух сверху, где ветер сильнее, опустившийся к воде». «Балл определяют по среднему ветру за 10 минут…». Cut the swell sentences or move them to the reference page. |
| 1.5 | A | ch. 4, stage text (`section.js:290`) | «Ветер … отступает к SE» is not a term, and the table under it says «заходит вправо». | Before the warm front: «ветер поворачивает влево, к SE»; after it: «вправо». |
| 1.6 | B | ch. 4 | The key point uses «гало», which the prose does not mention. «Разрез идёт с запада на восток» comes after the paragraph that describes the figure. | Add cirrus and halo to the warm-front sentence. Move the orientation sentence above «Под разрезом…». |
| 1.7 | B | ch. 5 «Бриз» | This is the first 3D map, but the text that explains it («Цвет воды…, флажки…») comes after the figure. The streak lines are not explained anywhere. The text promises «линия кучевых облаков над берегом», but on the map the clouds are scattered over all of the land. | Move the map description above the figure and mention the streaks. Either draw the clouds as a line along the coast or change the sentence. |
| 1.8 | B | ch. 6 «Стоковый» | «Ночью… между ними штиль» cannot be seen: at 05:00 the whole sea is covered in streaks (see 3.1). The first two sentences use «стекает» twice and repeat ch. 1. «Сильный синоптический ветер размывает стоковый» is still not from the lecture (open since the handoff). | Remove the repeat. Decide on the «размывает» sentence. |
| 1.9 | A | ch. 8 «Рельеф» | The text says «наветренная сторона — та, откуда дует ветер» and then «под высоким наветренным берегом… тень». Read with that definition, the shadow is on the wrong side. «Ротор» is in the figure but not in the text. | «Если ветер дует с высокого берега, под ним на 5–10 его высот лежит ветровая тень: штиль, порывы с разных направлений, ротор — вихрь с горизонтальной осью». |
| 1.10 | B | ch. 8 | «найдите тень у западного берега» does not say which western shore. «Под картой написано, какой был бы ветер…» only describes the readout. | Name the place (for example «у западного берега Внешнего залива»). Delete the meta sentence. |
| 1.11 | A | ch. 9 «Грозы» | One screen shows two different «yachts»: the readout says «6 уз, S», the schematic says «у яхты 10 уз, к туче». The same feature has three names: «фронт порывов» (map, readout), «линия шквала» (schematic), «тёмная ровная полоса» (text). | Make it clear that the schematic is a generic cloud, or tie it to the time slider. Use one term, «фронт порывов», and say once that it is seen as a dark flat band. |
| 1.12 | B | ch. 10 «Туман» | «Точку росы можно узнать из METAR, сводок погоды аэропортов, и в сервисах прогноза» mixes prepositions. «устойчиво» has not been explained. | «Точку росы дают METAR (сводки погоды аэропортов) и сервисы прогноза». Replace «устойчиво» or explain it in ch. 1. |
| 1.13 | B | ch. 11–12 | The chart shows AIFS (нейросеть) and UKMO, which the text never mentions. «проверяйте время прогона внизу карты» does not say which map. The ridge is «900 м» at 9 km in ch. 11 and «около 1000 м» in ch. 7. | Mention AIFS/UKMO in one line or drop them. Write «время прогона в подписи карты сервиса». Use one number. |
| 1.14 | A | ch. 11 and 13, «Посмотреть на реальных данных» | «Сервисы показывают те же модели, что и тренажёр» is wrong: the trainer model is invented. The block appears word for word in both chapters. It uses terms the course does not explain (CAPE, NAVTEX, Gusts/Waves/Radar). | «Проверяйте время прогона и сравнивайте 2–3 модели». Keep the block in one chapter and remove the unexplained terms. |
| 1.15 | B | ch. 13 «Ансамбль» | The same thing is called «прогоны», «сценарии» and, in the glossary, «сценарии». | Use «прогон» everywhere. |
| 1.16 | A | ch. 14 «Итоговый переход» | Three sets of names for the same scenarios: the text has «антициклон, бора или фронт», the cards «Летний день / Бора / Холодный фронт», ch. 13 «Антициклон / Фронт / Бора». | Use one set everywhere. |
| 1.17 | A | ch. 14 | `CHAPTERS.final.after` and `final.key` are never shown (`FinalView` renders only `before`). | Show them in the debrief or delete them. |
| 1.18 | A | ch. 14, debrief | After ignoring the thunderstorm warning (checklist 3 of 10), the result is a green «Безопасный переход». That rewards luck, which the design's anti-goals rule out. | The headline should judge the decision as well as the outcome, for example «Без превышений, но решение не по прогнозу (3 из 10)». |
| 1.19 | B | ch. 14 | «Потом погода случится на самом деле» is a calque. «Порывы… по P90 ансамбля против предела экипажа» also reads like a translation. In the meteogram legend, «её порывы» does not say whose gusts. | «Затем вы пройдёте маршрут в фактической погоде…». «P90 порывов в сравнении с пределом экипажа». «порывы региональной 2 км». |

## 2. AI-sounding text («нейрослоп»), against the author's own rules

| # | Pri | Where | Pattern | Fix |
|---|---|---|---|---|
| 2.1 | A | `final.js:611–612` alerts | «В жизни — заранее убрать паруса…», «В жизни — рифы…» (the banned «как в жизни»). | «Надо было заранее…» or a plain action. |
| 2.2 | B | `final.js` debrief and hints | «X — Y» telegrams: «Причина — бриз: …», «правильное решение — остаться в марине», «13 уз — занижен на 4», «Маршрут — от белого кружка…», «Цвет воды — прогноз…», «Цвет и линии — реальный ветер». | Rewrite as sentences: «Порывы усилил бриз: …», «Правильно было остаться в марине». |
| 2.3 | B | `topics.js:30–36`, glossary (`app.js:94–103`), t10 readout | Lists in the form «Windy — карты моделей…», «H — антициклон», «P50 — медиана», «Пролив шириной 1 км — 0,11 ячейки», «эта ячейка — суша». | Glossary layout `dt/dd` is fine without dashes. Readout: «Пролив шириной 1 км занимает 0,11 ячейки». |
| 2.4 | C | «Главное» lists | Almost every chapter uses the same «наблюдение: вывод» formula (ch. 2, 4 ×2, 9, 10). | Write some of them as plain sentences. |
| 2.5 | B | ch. 3, 5, 10, 11 | Sentences that describe the figure instead of saying what it shows: «На схеме видно, как выглядят…», «На схеме показаны…», «На карте показаны ячейки…». The captions under the figures repeat the prose (the ch. 9 stage text nearly word for word; the ch. 5 cards repeat paragraph 2; the ch. 3 card repeats the readout). | Keep the information in one place. |
| 2.6 | C | ch. 3 card, ch. 14 cards | The English «Fresh breeze» under «Свежий». The magenta subtitles «Июль, антициклон» work like eyebrows. | Remove the English. Put the subtitle in plain grey text or drop it. |

## 3. Layout and design

| # | Pri | Where | Problem |
|---|---|---|---|
| 3.1 | A | all 3D maps (ch. 5–10, 13, 14) | Dense dark streaks cover the water and the land, and in the night scenes (ch. 6, 10) they are white and look like rain. They hide what the chapter is about: calm between the valleys, the lee shadow, the fog. Fewer and shorter streaks, lower alpha, none over land. |
| 3.2 | B | ch. 14 «Переход» | With «Камера за яхтой» on, the map draws offset: an empty grey strip of about 160 px on the left and 80 px at the bottom. |
| 3.3 | B | ch. 14, all steps | The two intro paragraphs stay above every step, so at 1400×900 the stepper and the map start at about 565 px and each step needs scrolling. Collapse the intro after step 1. |
| 3.4 | B | ch. 14 hourly table | The first visible column is half hidden under the sticky row header («018», «INW»), on desktop and phone. |
| 3.5 | B | ch. 14 checklist | Multi-select items (3, 10) look the same as single-select ones. Add «можно несколько». |
| 3.6 | B | ch. 14 debrief text | Joined options keep their capitals («…; Стоковый ветер…; Мыс и пролив…»). «Было: бриз…» starts in lower case, the other lines in upper case. Double colon in «Было: Без превышения пределов можно было выйти: 05:00–16:00». «1 из 1 верные». In the chart legend, «модель 2 км, порывы» has a solid swatch but the line is dashed, and the two magenta «факт» lines are hard to tell apart. |
| 3.7 | B | ch. 2 | The slider row is misaligned because «Давление в центре антициклона» wraps to two lines. On the phone, the cross-section labels «поднимается» and «опускается» run into each other, and the 992/1008/1012 labels collide with the tooltip and the front. |
| 3.8 | B | ch. 4 | The weather strip puts its labels in two staggered rows, and «Перистые, гало» touches the right edge. On the phone, «холодный воздух» sits on the front line. |
| 3.9 | B | ch. 6 | The «ночью воздух стекает к бухте…» chip sits on the top edge of the plan view. On the phone, the slope titles run into the ↑↑↑ arrows. The ↑↑↑ arrows (radiation cooling) are not labelled, here or in ch. 10. |
| 3.10 | B | ch. 7 | The «L, центр за картой (юго-запад), 1004 гПа» label is cut off by the bottom of the 3D canvas. The video comes after «Главное». It was empty in headless Chrome; check it in a real browser. |
| 3.11 | C | ch. 3 | The info card is half empty. «первый риф» sits far from the boat. |
| 3.12 | C | ch. 8 | The cape schematic does not show the flow speeding up: the arrows are straight and almost the same length. |
| 3.13 | C | ch. 10 | By default the yacht marker sits on top of the marina marker. The «Td» label sits on the Td line. |
| 3.14 | C | ch. 11 legend | «пунктир» has a solid swatch. |
| 3.15 | C | ch. 12 chart | The GFS label is inside its bar, the others are outside. «через 1 сут» is an abbreviation. |
| 3.16 | C | ch. 13 | The last x label is «18:00» where it should be «18:00+1». «Другой факт» is active while «Показать факт» is off. |
| 3.17 | C | reference page | The header shows «Справка» twice (chapter label and link). The left column is empty under the barb key. The glossary entry «Стрелки на карте» says the map has arrows, but the maps use barbs and streaks; arrows appear only in the hourly table. |
| 3.18 | C | phone pager | When stacked, «Глава N» comes above «Назад». |

## 4. Small fixes

- `topics.js:284` «До ячейки 4 миль» uses the wrong plural: use a mile-plural helper like `knots()`.
- `chapters.js`: put non-breaking spaces between numbers and units, and inside ranges and names that break badly («100 / м», «1– / 7 км», «Swiss / HD», «за 3 / ч»). A small `nbsp()` pass over the chapter text at render time would cover it.
- ch. 1 readout title «Ветер у берега» is the same as the site title.
- Names change between chapters: «Катабатика» (nav short) / «Стоковый и долинный ветер» (title) / «Катабатический и горно-долинный ветер» (`topics.js` title). «P» in the ch. 5 schematic («высокое P») where the rest of the course uses H/L.
