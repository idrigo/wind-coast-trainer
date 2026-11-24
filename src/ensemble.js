// Scenarios that evolve in time, ensemble members and percentiles.
// A member is a set of normal deviates p = { s, d, t, t2, x, y, s2, u }; the control has all zeros.
// Spread grows with lead time through L(h) = 0.5 + h / 24 (forecast issued at 00 h of day 1).
(function () {
  const { sstep, clamp } = globalThis.Wind;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r) {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const KEYS = ['s', 'd', 't', 't2', 'x', 'y', 's2'];
  const CONTROL = { s: 0, d: 0, t: 0, t2: 0, x: 0, y: 0, s2: 0, u: 0 };

  function members(n, seed) {
    const r = rng(seed), ru = rng(seed * 7717 + 3), out = [{ ...CONTROL, control: true }];
    for (let i = 1; i < n; i++) {
      const p = { u: ru() };
      for (const k of KEYS) p[k] = clamp(normal(r), -2.5, 2.5);
      out.push(p);
    }
    return out;
  }

  // The weather that actually happens: a member drawn with 25 % wider deviates,
  // because raw ensembles are usually too narrow.
  function truth(seed) {
    const r = rng(seed * 7919 + 13), p = { u: rng(seed * 104729 + 5)() * 0.85 };
    for (const k of KEYS) p[k] = clamp(normal(r) * 1.25, -3, 3);
    return p;
  }

  const L = (h) => 0.5 + Math.max(0, h) / 24;

  const SCENARIOS = {
    summer: {
      id: 'summer', name: 'Летний день', season: 'Июль, антициклон',
      start: 5, end: 23, depart: [5, 17], departDefault: 11,
      stateAt(h, p) {
        const l = L(h);
        const t = 0.8 * p.t;
        return {
          G: Math.max(0, 5 * (1 + 0.35 * p.s * l)), Gdir: (350 + 25 * p.d * l + 360) % 360,
          hour: h, sun: 1, p0: 1018,
          storm: p.u < 0.7 ? {
            x0: 24 + 2.5 * p.x, y0: 24 + 1.5 * p.y, t0: 15 + t, vx: -6.5, vy: -7.6,
            tStart: 15 + t, tPeak: 16.8 + t, tEnd: 19.5 + t, peak: 25 * (1 + 0.15 * p.s2),
          } : null,
        };
      },
    },
    bora: {
      id: 'bora', name: 'Бора', season: 'Январь, антициклон над континентом',
      start: 6, end: 42, depart: [6, 36], departDefault: 10,
      stateAt(h, p) {
        const l = L(h);
        const on = 1 + 1.5 * p.t, dec = 20 + 3 * p.t2 * l;
        const Bo = clamp(0.85 * (1 + 0.15 * p.s * l), 0, 1.15) * sstep(on, on + 3, h) * (1 - sstep(dec, dec + 9, h));
        return { G: Math.max(0, 8 * (1 + 0.3 * p.s2 * l)), Gdir: 40 + 10 * p.d * l, hour: h, sun: 0.3, bora: Bo, p0: 1024 };
      },
    },
    front: {
      id: 'front', name: 'Холодный фронт', season: 'Октябрь, циклон над морем',
      start: 4, end: 26, depart: [4, 18], departDefault: 9,
      stateAt(h, p) {
        const l = L(h);
        return {
          hour: h, sun: 0.4,
          front: {
            t0: 14 + 2.0 * p.t, speed: 30 * (1 + 0.1 * p.s2), moveDir: 120, ref: [20, 15],
            preDir: 235 + 8 * p.d, postDir: 320 + 8 * p.d, preBase: 10, prePeak: 22 * (1 + 0.15 * p.s * l),
            postBase: Math.max(4, 12 * (1 + 0.3 * p.y * l)), postPeak: 27 * (1 + 0.15 * p.s * l), strength: 1,
          },
        };
      },
    },
  };

  function state(scn, h, p, res, effects) {
    const S = scn.stateAt(h, p);
    S.res = res || 0;
    if (effects) S.effects = effects;
    return S;
  }

  function series(x, y, scn, mem, hours, res) {
    const speed = [], gust = [], dir = [];
    for (const p of mem) {
      const sp = [], gu = [], di = [];
      for (const h of hours) {
        const w = globalThis.Wind.at(x, y, state(scn, h, p, res));
        sp.push(w.speed); gu.push(w.gust); di.push(w.dir);
      }
      speed.push(sp); gust.push(gu); dir.push(di);
    }
    return { speed, gust, dir };
  }

  function quantile(sorted, q) {
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  // arr2d[member][time] -> per-time percentiles.
  function percentiles(arr2d) {
    const nt = arr2d[0].length, out = { p10: [], p25: [], p50: [], p75: [], p90: [], mean: [] };
    for (let i = 0; i < nt; i++) {
      const col = arr2d.map((r) => r[i]).sort((a, b) => a - b);
      out.p10.push(quantile(col, 0.1)); out.p25.push(quantile(col, 0.25)); out.p50.push(quantile(col, 0.5));
      out.p75.push(quantile(col, 0.75)); out.p90.push(quantile(col, 0.9));
      out.mean.push(col.reduce((a, b) => a + b, 0) / col.length);
    }
    return out;
  }

  globalThis.Ens = { rng, members, truth, SCENARIOS, state, series, percentiles, quantile, CONTROL };
})();
