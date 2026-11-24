// Parametric wind field: synoptic background plus local corrections with coefficients from the lecture.
// Wind.at(x, y, state) -> { u, v, speed, dir, gust, variable, land, parts, mods, tau }
// u, v: where the air moves (east, north), knots. dir: meteorological "from", degrees.
//
// state fields (all optional):
//   G, Gdir      geostrophic (gradient) wind, knots and "from" degrees
//   hour         local hour; may exceed 24 for multi-day scenarios
//   sun          0..1, clear-sky factor for breeze, valley and katabatic winds
//   bora         0..1, intensity of the bora setup
//   front        { t0, speed, moveDir, ref:[x,y], preDir, postDir, preBase, prePeak,
//                  postBase, postPeak, strength }
//   storm        { x0, y0, t0, vx, vy, tStart, tPeak, tEnd, peak }
//   effects      { friction, breeze, katabatic, bora, terrain, front, storm } booleans
//   res          0 = reality at the point; otherwise model grid size, km
(function () {
  const Bay = globalThis.Bay;
  const D2R = Math.PI / 180;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const h24 = (h) => ((h % 24) + 24) % 24;
  const vecFrom = (dir, spd) => [-spd * Math.sin(dir * D2R), -spd * Math.cos(dir * D2R)];
  const dirOf = (u, v) => (Math.atan2(-u, -v) / D2R + 360) % 360;
  const mag = (p) => Math.hypot(p[0], p[1]);

  // Diurnal shapes.
  const breezeDay = (h) => { h = h24(h); return sstep(10.5, 13, h) * (1 - sstep(16.5, 19.5, h)); };
  const landBreezeNight = (h) => { h = h24(h); if (h >= 20) return sstep(20, 23, h); if (h < 9) return 1 - sstep(6, 9, h); return 0; };
  // Katabatic: starts after sunset, grows through the night, maximum before dawn, gone by mid-morning.
  const katNight = (h) => {
    const t = h24(h - 19);
    if (t < 9.5) return sstep(0, 1.5, t) * (0.35 + (0.65 * t) / 9.5); // grows through the night, maximum before dawn (04:30)
    if (t < 14.5) return 1 - sstep(10.5, 14.5, t);
    return 0;
  };
  // Land wind factor: maximum after noon, minimum at night (0.75..1.25 of 0.5 G).
  const landDiurnal = (h) => 0.75 + 0.5 * Math.max(0, Math.cos(((h24(h) - 15) / 24) * 2 * Math.PI));

  // How much of a phenomenon a model with grid `res` km reproduces.
  const scaleMeso = (res) => (res ? 1 / (1 + res / 11) : 1); // katabatic: 9 km -> 0.55
  const scaleBora = (res) => (res ? 1 / (1 + res / 25) : 1); // bora intensity: 9 km -> 0.74
  const scaleJet = (res) => (res ? 1 / (1 + (res / 8) ** 2) : 1); // jets under passes
  const scaleBreeze = (res) => (res ? 1 / (1 + res / 11) : 1); // breeze: 9 km -> 0.55, 2 km -> 0.85
  const scaleLocal = (res) => (res ? 1 / (1 + (res / 1.5) ** 2) : 1); // capes, strait, lee

  const DEFAULT_EFFECTS = { friction: true, breeze: true, katabatic: true, bora: true, terrain: true, front: true, storm: true };

  // March upwind from (x, y) until land; returns distance and highest terrain within 1.6 km behind the coast.
  function upwind(x, y, dir) {
    const sx = Math.sin(dir * D2R), sy = Math.cos(dir * D2R);
    for (let i = 1; i <= 48; i++) {
      const d = i * 0.25, px = x + sx * d, py = y + sy * d;
      if (Bay.isLand(px, py)) {
        let H = 0;
        for (let j = 0; j <= 8; j++) H = Math.max(H, Bay.elev(px + sx * j * 0.2, py + sy * j * 0.2));
        return { d, H, island: Bay.isIsland(px, py) };
      }
    }
    return { d: Infinity, H: 0 };
  }

  function frontState(x, y, S) {
    const F = S.front, k = F.strength ?? 1;
    const nx = Math.sin(F.moveDir * D2R), ny = Math.cos(F.moveDir * D2R);
    const s = (x - F.ref[0]) * nx + (y - F.ref[1]) * ny;
    const tau = S.hour - (F.t0 + s / F.speed);
    let G, dir, gf;
    if (tau < 0) {
      G = F.preBase + (F.prePeak - F.preBase) * k * Math.exp(tau / 5);
      gf = 1;
    } else {
      G = F.postBase + (F.postPeak - F.postBase) * k * Math.exp(-tau / 3);
      gf = 1 + 0.15 * sstep(0.3, 1, tau); // unstable air behind the front
    }
    dir = F.preDir + (F.postDir - F.preDir) * sstep(-0.4, 0.4, tau);
    const b = Math.exp(-((tau / 0.35) ** 2));
    return { G, dir, gf, tau, meanAdd: 6 * b * k, gustAdd: 10 * b * k };
  }

  // Front line position at a given hour: point on the line and its direction (for drawing).
  function frontLine(S) {
    const F = S.front;
    const nx = Math.sin(F.moveDir * D2R), ny = Math.cos(F.moveDir * D2R);
    const s = (S.hour - F.t0) * F.speed;
    return { x: F.ref[0] + nx * s, y: F.ref[1] + ny * s, tx: -ny, ty: nx, nx, ny };
  }

  function pressure(x, y, S) {
    if (S.front) {
      const F = S.front, nx = Math.sin(F.moveDir * D2R), ny = Math.cos(F.moveDir * D2R);
      const s = (x - F.ref[0]) * nx + (y - F.ref[1]) * ny;
      const tau = S.hour - (F.t0 + s / F.speed);
      return tau < 0 ? 1014 - 8 * Math.exp(tau / 6) : 1006 + 9 * (1 - Math.exp(-tau / 4));
    }
    return S.p0 ?? 1016;
  }

  function stormState(T, h) {
    const I = sstep(T.tStart, T.tPeak, h) * (1 - sstep(T.tPeak + 1, T.tEnd, h));
    return { x: T.x0 + T.vx * (h - T.t0), y: T.y0 + T.vy * (h - T.t0), I };
  }

  function at(x, y, S) {
    const E = Object.assign({}, DEFAULT_EFFECTS, S.effects || {});
    const res = S.res || 0;
    const h = S.hour ?? 12;
    const land = !!Bay.isLand(x, y);
    const mods = {};

    // 1. Background (synoptic or frontal) wind at the surface.
    let G = S.G || 0, Gdir = S.Gdir || 0, gfFront = 1, meanAdd = 0, gustAdd = 0, tau = null;
    if (S.front && E.front) {
      const F = frontState(x, y, S);
      G = F.G; Gdir = F.dir; gfFront = F.gf; meanAdd = F.meanAdd; gustAdd = F.gustAdd; tau = F.tau;
    }
    const up = upwind(x, y, Gdir);
    const wL = land ? 1 : up.d < Infinity ? Math.exp(-up.d / 2) : 0;
    let f = 1, turn = 0;
    if (E.friction) {
      f = 0.75 * (1 - wL) + 0.5 * landDiurnal(h) * wL;
      turn = 15 * (1 - wL) + 35 * wL;
    }
    const synSpd = G * f + meanAdd;
    let syn = vecFrom(Gdir - turn, synSpd);
    const gfSyn = (E.friction ? 1.3 * (1 - wL) + 2.0 * wL : 1.3) * gfFront;
    let variable = false;
    if ((E.lee ?? E.terrain) && !land && up.d < Infinity) {
      const Ls = up.island ? 6 : (7.5 * up.H) / 1000; // shadow 5-10 heights of the coast; behind an island several miles
      if (Ls > 0.3 && up.d < Ls) {
        const r = up.d / Ls, sh = 0.2 + 0.8 * r * r, fac = 1 - (1 - sh) * scaleLocal(res);
        syn = [syn[0] * fac, syn[1] * fac];
        mods.lee = 1 - fac;
        variable = mods.lee > 0.35 && synSpd > 6;
      }
    }

    // 2. Sea breeze by day, land breeze by night: along the gradient of the smoothed land fraction.
    let br = [0, 0];
    if (E.breeze) {
      const sun = S.sun ?? 1;
      const sup = S.front && E.front ? 0 : clamp(1 - G / 25, 0, 1);
      const day = breezeDay(h) * sun * sup * 13 * scaleBreeze(res);
      const night = landBreezeNight(h) * sun * sup * 5 * scaleBreeze(res);
      const g = Bay.gradL(x, y), gm = mag(g);
      if (gm > 1e-5) {
        const m = clamp(gm / 0.05, 0, 1), a = (day - night) * m;
        br = [(g[0] / gm) * a, (g[1] / gm) * a];
      }
      // Local onshore flow toward the nearest heated shore (also inside the enclosed inner bay).
      if (!land && day > 0.2) {
        const d0 = -Bay.sd(x, y);
        if (d0 < 4) {
          const ex = Bay.sd(x + 0.2, y) - Bay.sd(x - 0.2, y), ey = Bay.sd(x, y + 0.2) - Bay.sd(x, y - 0.2), em = Math.hypot(ex, ey);
          if (em > 1e-4) { const a2 = (day / 13) * 3 * Math.exp(-d0 / 1.5) * scaleLocal(res); br = [br[0] + (ex / em) * a2, br[1] + (ey / em) * a2]; }
        }
      }
    }

    // 3. Katabatic drainage at night, valley wind by day.
    let kat = [0, 0];
    if (E.katabatic) {
      const sun = S.sun ?? 1;
      const kn = katNight(h) * sun * clamp(1 - G / 15, 0, 1) * scaleMeso(res);
      const dv = breezeDay(h) * sun * clamp(1 - G / 20, 0, 1) * scaleMeso(res);
      const sdist = Bay.sd(x, y);
      if (kn > 0) {
        if (land) {
          const gh = Bay.gradH(x, y), gm = mag(gh);
          if (gm > 5) { const m = clamp(gm / 150, 0, 1) * 3.5 * kn; kat[0] -= (gh[0] / gm) * m; kat[1] -= (gh[1] / gm) * m; }
        } else if (sdist > -1.5) {
          const g = Bay.gradL(x, y), gm = mag(g);
          if (gm > 1e-5) { const m = 3 * kn * Math.exp(sdist / 0.7); kat[0] -= (g[0] / gm) * m; kat[1] -= (g[1] / gm) * m; }
        }
      }
      for (const V of Bay.VALLEYS) {
        const q = Bay.segParam(x, y, V.from[0], V.from[1], V.to[0], V.to[1]);
        let w = 0, mult = 1;
        if (q.a >= -0.05 && q.a <= 1) {
          w = Math.exp(-((q.c / 0.7) ** 2));
          mult = 1 + scaleLocal(res) * Math.exp(-(((q.a - 0.55) / 0.15) ** 2)); // narrows: twice as strong
        } else if (q.a > 1) {
          const beyond = (q.a - 1) * V.len, wid = 0.7 + 0.35 * beyond;
          w = Math.exp(-((q.c / wid) ** 2)) * Math.exp(-beyond / 2.5) * Math.sqrt(0.7 / wid);
        }
        if (w > 0.01) {
          const down = 5 * kn * w * mult;
          const upv = q.a <= 1.3 ? 5 * dv * w * mult : 0;
          kat[0] += V.ux * (down - upv); kat[1] += V.uy * (down - upv);
        }
      }
    }

    // 4. Bora: cold air spills over the ridge, jets under the passes.
    let bo = [0, 0];
    if (E.bora && S.bora > 0) {
      const Bo = S.bora * scaleBora(res);
      const s = Bay.ridgeS(x, y);
      let V;
      if (s > 0.8) V = 18 * Bo;
      else {
        let jet = 0.85;
        for (const P of Bay.PASSES) {
          const rx = x - P.x, ry = y - P.y;
          const along = -(rx + ry) * Math.SQRT1_2; // downstream distance along the NE->SW axis
          const cross = Math.abs(rx - ry) * Math.SQRT1_2;
          if (along > -1.5) jet += 0.5 * scaleJet(res) * Math.exp(-((cross / 2.5) ** 2));
        }
        V = 19 * Bo * jet * Math.exp(Math.min(0, s) / 60);
      }
      bo = vecFrom(45, V);
    }

    // 5. Thunderstorm outflow.
    let st = [0, 0];
    if (E.storm && S.storm) {
      const c = stormState(S.storm, h);
      if (c.I > 0.01) {
        const dx = x - c.x, dy = y - c.y, r = Math.hypot(dx, dy), Rc = 2.0;
        let sp = r < Rc ? Math.min(1, r / 0.4) : Math.exp(-(r - Rc) / 2.5); // strong flat core, gust front at its edge
        const mv = Math.hypot(S.storm.vx, S.storm.vy) || 1;
        if (r > 0.01) sp *= 1 + 0.2 * ((dx * S.storm.vx + dy * S.storm.vy) / (r * mv));
        sp *= c.I * S.storm.peak;
        if (r > 0.01) st = [(dx / r) * sp, (dy / r) * sp];
      }
    }

    let u = syn[0] + br[0] + kat[0] + bo[0] + st[0];
    let v = syn[1] + br[1] + kat[1] + bo[1] + st[1];

    // 6. Terrain: strait funnel, cape acceleration, island flanks.
    if (E.terrain && !land) {
      const kL = scaleLocal(res);
      const S0 = Bay.STRAIT;
      const q = Bay.segParam(x, y, S0.a[0], S0.a[1], S0.b[0], S0.b[1]);
      const w = kL * Math.exp(-((q.c / 0.8) ** 2)) * sstep(-0.7, 0, q.a) * (1 - sstep(1, 1.7, q.a));
      const spd = Math.hypot(u, v);
      if (w > 0.01 && spd > 0.1) {
        const dot = (u * S0.ux + v * S0.uy) / spd, sgn = dot >= 0 ? 1 : -1;
        if (Math.abs(dot) < 0.35) { // wind across the strait: sheltered between the banks, gusty
          u *= 1 - 0.45 * w; v *= 1 - 0.45 * w; mods.straitCross = w;
        } else {
          const k = 1.15 + 0.15 * Math.abs(dot);
          u = u * (1 - w) + S0.ux * sgn * spd * k * w;
          v = v * (1 - w) + S0.uy * sgn * spd * k * w;
          mods.strait = w;
        }
      }
      const C = Bay.CAPE, dc = Math.hypot(x - C.x, y - C.y);
      let wc = kL * Math.exp(-((dc / 1.8) ** 2));
      const upT = upwind(x, y, dirOf(u, v));
      if (upT.d < 1.5) wc *= upT.d / 1.5;
      { const sp0 = Math.hypot(u, v) || 1, along = ((x - C.x) * u + (y - C.y) * v) / sp0; // downstream of the tip = lee, no acceleration
        if (along > 0.3) wc *= Math.exp(-(((along - 0.3) / 0.7) ** 2)); }
      if (wc > 0.01) { u *= 1 + 0.35 * wc; v *= 1 + 0.35 * wc; mods.cape = wc; }
      const I = Bay.ISLE, sp2 = Math.hypot(u, v);
      if (sp2 > 0.5) {
        const fx = u / sp2, fy = v / sp2, rx = x - I.x, ry = y - I.y;
        const along = rx * fx + ry * fy, cross = Math.abs(rx * fy - ry * fx);
        if (Math.abs(along) < I.r + 0.6 && cross > I.r) {
          const wi = kL * 0.25 * Math.exp(-(((cross - I.r - 0.5) / 0.8) ** 2));
          if (wi > 0.01) { u *= 1 + wi; v *= 1 + wi; mods.island = wi; }
        }
      }
    }

    const speed = Math.hypot(u, v);
    const parts = { syn, br, kat, bo, st };
    const m = [mag(syn), mag(br), mag(kat), mag(bo), mag(st)];
    const gfs = [gfSyn, 1.25, 1.4, 2.0, 1.6];
    const msum = m.reduce((a, b) => a + b, 0);
    const gf = msum > 0.01 ? m.reduce((a, mi, i) => a + mi * gfs[i], 0) / msum : 1.3;
    let gust = speed * gf + gustAdd;
    if (variable) gust = Math.max(gust, 0.8 * synSpd);
    return { u, v, speed, dir: speed > 0.05 ? dirOf(u, v) : null, gust, variable, land, parts, mods, tau };
  }

  // Beaufort number from mean speed in knots (upper bounds from the deck).
  const BF = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
  const BF_NAMES = ['штиль', 'тихий', 'лёгкий', 'слабый', 'умеренный', 'свежий', 'сильный', 'крепкий',
    'очень крепкий', 'шторм', 'сильный шторм', 'жестокий шторм', 'ураган'];
  function beaufort(kn) {
    for (let i = 0; i < BF.length; i++) if (kn < BF[i] + 0.5) return i;
    return 12;
  }
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = (d) => (d == null ? '—' : COMPASS[Math.round(d / 22.5) % 16]);

  globalThis.Wind = {
    at, pressure, frontLine, stormState, beaufort, BF_NAMES, compass, vecFrom, dirOf,
    breezeDay, katNight, sstep, clamp, h24,
  };
})();
