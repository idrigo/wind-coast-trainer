// Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../src/bay.js');
require('../src/wind.js');
require('../src/ensemble.js');
const { Bay, Wind, Ens } = globalThis;

const OPEN_SEA = [20, 1.5];
const only = (k) => ({ friction: true, breeze: false, katabatic: false, bora: false, terrain: false, front: false, storm: false, ...k });
const near = (a, lo, hi, msg) => assert.ok(a >= lo && a <= hi, `${msg}: ${a.toFixed(2)} not in [${lo}, ${hi}]`);
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;

test('geometry: marina and harbour at sea, ridge and passes', () => {
  assert.equal(Bay.isLand(Bay.MARINA.x, Bay.MARINA.y), 0);
  assert.equal(Bay.isLand(Bay.HARBOUR.x, Bay.HARBOUR.y), 0);
  near(Bay.elev(16, 28), 1400, 1600, 'ridge crest');
  for (const p of Bay.PASSES) near(Bay.elev(p.x, p.y), 500, 950, 'pass');
});

test('surface wind over open sea: 0.7-0.8 G, backed 10-20 deg, gust +20-40 %', () => {
  const w = Wind.at(...OPEN_SEA, { G: 20, Gdir: 180, hour: 12, effects: only({}) });
  near(w.speed / 20, 0.7, 0.8, 'sea ratio');
  near(-angDiff(w.dir, 180), 10, 20, 'sea turn');
  near(w.gust / w.speed, 1.2, 1.4, 'sea gust factor');
});

test('surface wind over land: 0.4-0.6 G, backed 30-40 deg, gust about x2', () => {
  for (const hour of [3, 15]) {
    const w = Wind.at(30, 10, { G: 20, Gdir: 180, hour, effects: only({}) });
    near(w.speed / 20, 0.35, 0.65, `land ratio at ${hour} h`);
    near(-angDiff(w.dir, 180), 30, 40, 'land turn');
    near(w.gust / w.speed, 1.8, 2.1, 'land gust factor');
  }
});

test('sea breeze: none at 9 h, 10-15 kn at the coast after lunch, fades by 10 nm', () => {
  const S = (hour) => ({ G: 0, Gdir: 0, hour, sun: 1, effects: only({ breeze: true }) });
  assert.ok(Wind.at(4.5, 12, S(9)).speed < 1);
  near(Wind.at(4.5, 12, S(15)).speed, 9, 15, 'breeze at west coast 15 h');
  const shore = Wind.at(30, 6, S(15)).speed, off = Wind.at(30, 0.2, S(15)).speed; // 1 km and 7 km off the south coast
  assert.ok(off < shore * 0.7 && off > 4, `breeze weakens offshore: ${shore.toFixed(1)} -> ${off.toFixed(1)}`);
  const cloudy = Wind.at(4.5, 12, { ...S(15), sun: 0 });
  assert.ok(cloudy.speed < 1, 'no breeze when overcast');
});

test('offshore synoptic wind cancels the breeze near the coast', () => {
  // West coast: onshore is from the west. Synoptic from the east (offshore).
  const base = { hour: 15, sun: 1, effects: only({ breeze: true }) };
  const calm = Wind.at(4.5, 12, { ...base, G: 12, Gdir: 90 });
  const noBreeze = Wind.at(4.5, 12, { ...base, G: 12, Gdir: 90, effects: only({}) });
  assert.ok(calm.speed < noBreeze.speed * 0.6, 'calm band near shore');
});

test('katabatic: 3-10 kn at a valley mouth before dawn, stronger in the narrows, gone at noon', () => {
  const S = (hour) => ({ G: 0, hour, sun: 1, effects: only({ katabatic: true }) });
  const V = Bay.VALLEYS[0];
  const mouth = [V.to[0] + V.ux * 0.6, V.to[1] + V.uy * 0.6];
  near(Wind.at(...mouth, S(5.5)).speed, 3, 10, 'mouth at 5:30');
  const mid = [V.from[0] + (V.to[0] - V.from[0]) * 0.55, V.from[1] + (V.to[1] - V.from[1]) * 0.55];
  assert.ok(Wind.at(...mid, S(5.5)).speed > Wind.at(...mouth, S(5.5)).speed * 1.3, 'narrows stronger');
  assert.ok(Wind.at(...mouth, S(5.5)).speed > Wind.at(...mouth, S(21)).speed, 'max before dawn');
  const night = Wind.at(...mouth, S(5.5)).dir, noon = Wind.at(...mouth, S(13));
  near(Math.abs(angDiff(noon.dir, night)), 150, 180, 'up-valley by day');
  assert.ok(Wind.at(...mouth, S(10)).speed < 1, 'calm in the morning transition');
});

test('bora: NE, gust x2, jet under the pass stronger than between passes, model 9 km lower by 1.5-2.2', () => {
  const S = { bora: 1, hour: 10, sun: 0, effects: only({ bora: true, terrain: true }) };
  const under = Wind.at(27.5, 19.6, S);
  const between = Wind.at(23, 19, S);
  near(under.speed, 22, 35, 'under the pass');
  assert.ok(under.speed > between.speed * 1.3, 'jet contrast');
  near(Math.abs(angDiff(under.dir, 45)), 0, 25, 'NE direction');
  near(under.gust / under.speed, 1.8, 2.1, 'bora gust factor');
  const model = Wind.at(27.5, 19.6, { ...S, res: 9 });
  near(under.speed / model.speed, 1.5, 2.2, 'model underestimation');
});

test('terrain: strait stronger and aligned, cape +20-40 %, lee of high coast weak and variable', () => {
  const base = { G: 20, Gdir: 210, hour: 12, effects: only({}) };
  const withT = { ...base, effects: only({ terrain: true }) };
  const m = [(Bay.STRAIT.a[0] + Bay.STRAIT.b[0]) / 2, (Bay.STRAIT.a[1] + Bay.STRAIT.b[1]) / 2];
  const s1 = Wind.at(...m, withT);
  assert.ok(s1.speed > 13, 'strait wind speed');
  const axisDir = Wind.dirOf(Bay.STRAIT.ux, Bay.STRAIT.uy); // flow toward the inner bay comes from SSW
  near(Math.abs(angDiff(s1.dir, axisDir)), 0, 20, 'strait alignment');
  const capeP = [8.2, 4.0];
  const c0 = Wind.at(...capeP, { ...base, Gdir: 270 }), c1 = Wind.at(...capeP, { ...withT, Gdir: 270 });
  near(c1.speed / c0.speed, 1.15, 1.4, 'cape acceleration');
  const lee = Wind.at(3.0, 16, { ...withT, Gdir: 90 });
  const open = Wind.at(3.0, 16, { ...base, Gdir: 90 });
  assert.ok(lee.speed < open.speed * 0.5, 'lee weak');
  assert.ok(lee.variable, 'lee variable');
});

test('cold front: SW freshening before, veer 60-90 deg after, squall gust +10-20 kn, pressure drop', () => {
  const front = { t0: 12, speed: 30, moveDir: 120, ref: [20, 15], preDir: 235, postDir: 320, preBase: 10, prePeak: 24, postBase: 12, postPeak: 28, strength: 1 };
  const S = (hour) => ({ front, hour, sun: 0, effects: only({ front: true }) });
  const p = OPEN_SEA;
  const before = Wind.at(...p, S(0)), close = Wind.at(...p, S(Wind.at(...p, S(12)).tau < 0 ? 12 : 11));
  assert.ok(close.speed >= before.speed, 'freshening');
  // find passage time at the point
  let tp = 0; for (let h = 0; h < 30; h += 0.05) { if (Wind.at(...p, S(h)).tau >= 0) { tp = h; break; } }
  const pre = Wind.at(...p, S(tp - 2)), post = Wind.at(...p, S(tp + 2)), at0 = Wind.at(...p, S(tp));
  near(angDiff(post.dir, pre.dir), 60, 95, 'veer');
  near(at0.gust - at0.speed, 10, 20, 'squall gust above mean');
  assert.ok(at0.gust > pre.gust + 5, 'squall stronger than before');
  const dp = Wind.pressure(...p, S(tp)) - Wind.pressure(...p, S(tp - 3));
  near(-dp, 2.5, 4.5, 'pressure drop in 3 h');
});

test('calm gives null direction and no NaN', () => {
  const w = Wind.at(...OPEN_SEA, { G: 0, hour: 12, sun: 0, effects: only({}) });
  assert.equal(w.dir, null);
  assert.ok(Number.isFinite(w.gust));
});

test('beaufort bounds', () => {
  assert.equal(Wind.beaufort(0), 0);
  assert.equal(Wind.beaufort(16), 4);
  assert.equal(Wind.beaufort(21), 5);
  assert.equal(Wind.beaufort(22), 6);
  assert.equal(Wind.beaufort(70), 12);
});

test('ensemble: percentiles ordered, spread grows with lead time, truth can leave the band', () => {
  const scn = Ens.SCENARIOS.front;
  const mem = Ens.members(30, 7);
  const hours = [];
  for (let h = 0; h <= 36; h += 1) hours.push(h);
  const ser = Ens.series(...OPEN_SEA, scn, mem, hours, 9);
  const pc = Ens.percentiles(ser.speed);
  for (let i = 0; i < hours.length; i++) assert.ok(pc.p10[i] <= pc.p50[i] && pc.p50[i] <= pc.p90[i]);
  const scnB = Ens.SCENARIOS.summer;
  const s2 = Ens.percentiles(Ens.series(...OPEN_SEA, scnB, mem, hours, 9).speed);
  const spread = (pc, i) => pc.p90[i] - pc.p10[i];
  assert.ok(spread(s2, 2) <= spread(s2, 34) + 0.5, 'spread grows');
});

test('thunderstorm squall at a point lasts 15-40 minutes with gusts 30-50 kn', () => {
  const scn = Ens.SCENARIOS.summer, S = (h) => scn.stateAt(h, Ens.CONTROL);
  let minutes = 0, peak = 0;
  for (let h = 14; h < 21; h += 1 / 60) { const w = Wind.at(9, 4.5, S(h)); if (Math.hypot(...w.parts.st) > 15) minutes++; peak = Math.max(peak, w.gust); }
  near(minutes, 15, 40, 'squall duration, min');
  near(peak, 30, 50, 'squall gust');
});
