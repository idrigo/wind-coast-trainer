# Wind trainer "Бухта Тихая"

Interactive course built from the weather lecture deck, read as one connected story in 14 chapters.
Each chapter builds on the previous ones: heating, rising air and pressure (the base for everything else);
pressure and cyclones; wind barbs and the Beaufort scale; fronts; breeze; katabatic and valley winds;
bora; terrain; convection and thunderstorms; fog; model resolution; global and regional models (grid, forecast range, update cycle); ensembles (with links
to real services); and the final passage game with three scenarios (summer breeze with thunderstorm, bora,
cold front): forecast tools with an hourly table, route, pre-departure checklist, go / wait / change route / stay
decision, situations on the way and a debrief item by item. Each chapter page is: title and lead, short prose, one large figure (schematic or 3D bay)
with its live caption and controls, more prose, key points, link to the next chapter.
Design: `DESIGN.md`.

- `src/bay.js` fictional bay geometry, elevation and smoothed fields
- `src/wind.js` parametric wind model; coefficients follow the deck
- `src/ensemble.js` time-dependent scenarios, ensemble members, percentiles
- `src/scene3d.js` 3D relief model (Three.js 0.128 from jsDelivr): terrain, water coloured by wind,
  wind streaks, yacht, clouds, front, storm, model-grid blocks
- `src/section.js` schematics redrawn from the lecture diagrams (`../assets/*.png`): heating and pressure, synoptic chart,
  fronts, Beaufort sea state, breeze and sum of winds, katabatic, bora, terrain, convection, fog, resolution
- `src/draw.js`, `src/ui.js` colour scale, barbs, controls, readout, charts
- `src/chapters.js` chapter text (title, lead, prose before and after the figure, key points)
- `src/topics.js`, `src/final.js`, `src/app.js` figures and controls per chapter, final passage, navigation

Build and test:

    python3 build.py          # dist/index.html (self-hosting), dist/trainer.html (Artifact body)
    node --test test/wind.test.mjs

`dist/index.html` is self-contained apart from Google Fonts and Three.js and can be put on any static host.
Published copy: https://idrigo.github.io/wind-coast-trainer/ (GitHub Pages, branch `gh-pages` holds `dist/`).
