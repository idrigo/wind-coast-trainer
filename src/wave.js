// Significant wave height: wind sea from the local wind and the fetch, plus swell from the open sea that
// islands and capes shade. Simple fetch-limited growth (JONSWAP), capped at the fully developed sea.
(function () {
  const Bay = globalThis.Bay, W = Bay.W, H = Bay.H, D2R = Math.PI / 180;
  const OPEN = 150; // km of open sea beyond the map edge

  // Distance over water towards the direction `from`, km; Infinity when the ray leaves the map over water.
  function ray(x, y, from, max = 60) {
    const dx = Math.sin(from * D2R), dy = Math.cos(from * D2R);
    for (let d = 0.3; d < max; d += 0.3) {
      const px = x + dx * d, py = y + dy * d;
      if (px < 0 || py < 0 || px > W || py > H) return Infinity;
      if (Bay.isLand(px, py)) return d;
    }
    return Infinity;
  }
  function windSea(kn, fetchKm) {
    const U = kn * 0.5144, F = Math.min(fetchKm, OPEN) * 1000;
    return Math.min(1.6e-3 * U * Math.sqrt(F / 9.81), (0.243 * U * U) / 9.81);
  }
  // w: wind at the point (speed, dir from, mods); swell: { h, dir } or null. Heights in metres.
  function at(x, y, w, swell) {
    if (Bay.isLand(x, y)) return { hs: 0, sea: 0, sw: 0, fetch: 0, shade: 0, u: 0, v: 0, dir: null };
    let sea = 0, fetch = 0;
    if (w && w.dir != null && w.speed > 1) {
      const f = ray(x, y, w.dir);
      fetch = f === Infinity ? OPEN : f;
      sea = windSea(w.speed, fetch) * ((w.mods && w.mods.cape) > 0.3 ? 1.15 : 1); // waves focus on a headland
    }
    let sw = 0, open = 0;
    if (swell && swell.h > 0) {
      for (const da of [-12, 0, 12]) if (ray(x, y, swell.dir + da) === Infinity) open++;
      sw = swell.h * (0.12 + (0.88 * open) / 3); // behind land only what bends round it
    }
    // Mean direction: the wind sea runs with the wind, the swell keeps its own; weighted by energy (height squared).
    let u = 0, v = 0;
    if (sea > 0) { const a = (w.dir + 180) * D2R; u += sea * sea * Math.sin(a); v += sea * sea * Math.cos(a); }
    if (sw > 0) { const a = (swell.dir + 180) * D2R; u += sw * sw * Math.sin(a); v += sw * sw * Math.cos(a); }
    const m = Math.hypot(u, v);
    return { hs: Math.hypot(sea, sw), sea, sw, fetch, shade: swell && swell.h > 0 ? 1 - open / 3 : 0,
      u: m ? u / m : 0, v: m ? v / m : 0, dir: m ? ((Math.atan2(-u, -v) / D2R) + 360) % 360 : null }; // u, v: where it runs; dir: where from
  }
  globalThis.Wave = { at, ray, windSea };
})();
