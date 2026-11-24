# Interactive wind trainer: design

Date: 2026-11-24. Approved in conversation with the course author.

## Intent

Turn the weather lecture of the Bora Sailing captain course into an interactive web trainer.
Students place a yacht on a map and see what wind it gets, topic by topic, then pass a final
scenario: read a forecast, plan a route through a fictional bay avoiding local hazards, sail it,
and compare forecast with what happened.

## Goals

- Eight topic trainers, each a map where the yacht can be dragged and the wind at that point is
  shown (mean, gust, direction, Beaufort), with 2–3 lines of theory taken from the deck.
- One final simulator in a fictional bay with three scenarios.
- One self-contained HTML file, usable on a laptop and a phone, published online.
- All UI copy in Russian, numbers consistent with the lecture.

## Non-goals

- Physical flow simulation. Wind is a parametric field: synoptic background plus local
  corrections with coefficients from the lecture.
- Real geography. The bay is fictional.
- Accounts, score storage, multiplayer.

## Anti-goals

- Numbers that contradict the deck (e.g. bora gust factor, breeze timing, cape acceleration).
- A game that rewards ignoring the forecast and getting lucky every time.

## Topics kept

1. Ветер у поверхности: sea 0.7–0.8 of geostrophic, 10–20° turn; land 0.4–0.6, 30–40°;
   gusts +20–40 % over sea, ×2 over land; offshore wind gusty near the coast.
2. Бриз и синоптический ветер: hour slider, synoptic direction and speed; breeze 10–15 kn,
   starts 11–12 h, peak after lunch, fades within ~10 nm; onshore synoptic adds, offshore
   cancels near shore.
3. Катабатический и горно-долинный ветер: night drainage 3–10 kn at valley mouths, max before
   dawn, ×2 in valley narrows; day valley wind.
4. Бора: toggles for cold air on the plateau, high behind the ridge, low over the sea; NE,
   gusts ×2, strongest under passes and at the bay exit; cloud cap.
5. Ветер и рельеф: cape +20–40 %, strait funnelling along its axis, lee of a high coast over
   5–10 heights, island edges and shadow.
6. Холодный фронт и шквал: time slider through the four stages from the deck; SW freshening,
   front gust +10–20 kn, veer to NW by 60–90°, barometer trace.
7. Разрешение модели: grid 25 / 9 / 3 / 1 km over the same bay, model value = cell average,
   "truth" at the yacht point; ridge height smoothed.
8. Ансамбль и разброс: meteogram at the yacht point, 30 members, P10/P50/P90, narrow vs wide
   spread, ensemble mean hides extremes.

Dropped: atmosphere layers, global circulation, tropical cyclones, NWP pipeline, services,
cloud classification. Beaufort and Adriatic winds tables go into a reference panel.

## Final simulator

Fictional bay "Бухта Тихая" (name is a builder call): inner gulf with two valley mouths, a
ridge with a plateau and passes, a narrow strait, a cape, an island, open sea and a destination
harbour along the coast.

Scenarios: summer breeze with afternoon thunderstorm; bora; approaching cold front.

Flow: briefing (synoptic sketch, global 9 km model map, regional 2 km map, ensemble meteogram,
official warning) -> 2–3 questions on the forecast -> choose departure time and place
waypoints -> time-lapse run with events (gust limit exceeded, squall, bora zone) ->
debrief (forecast P50/P90 vs actual along the track, where the model was wrong).
The actual weather is one ensemble member drawn at random, sometimes perturbed outside the
spread, to show that raw ensembles are too narrow.

## Approaches considered

- Parametric wind field in Canvas + vanilla JS (chosen): small, fast on phones, numbers
  controllable and traceable to the lecture.
- Real 2D flow solver: too heavy for a phone, hard to make it reproduce lecture numbers.
- Pre-rendered images per state: no free yacht placement.

## Builder calls

Map geometry, colours, yacht speed polar (simple), scoring wording, bay name, exact scenario
timings. All recorded in the code as constants.
