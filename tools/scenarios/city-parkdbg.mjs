export default async function (page, h) {
  await h.wait(4000);
  const r = await h.game((g) => {
    const f = g.game?.focus || g.focus;
    const T = g.traffic;
    let near = 0, free = 0, fill = 0, cityNear = 0, cityFree = 0;
    for (const s of T.spots) {
      const d = Math.hypot(s.x - f.x, s.z - f.z);
      if (d > 170) continue;
      near++;
      if (s.fill) fill++;
      const ok = g.collision.isFree(s.x, s.z, 1.05, 0.3, 1.5);
      if (ok) free++;
      if (s.src === 'city') { cityNear++; if (ok) cityFree++; }
    }
    return { focus: [f.x, f.z], spots: T.spots.length, near, fill, free, cityNear, cityFree, parked: T.parked.length, frozen: T.frozen, stats: T.stats, max: g.quality.maxParked };
  });
  h.log(JSON.stringify(r));
}
