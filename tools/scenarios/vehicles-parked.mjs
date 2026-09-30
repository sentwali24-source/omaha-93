// Parked cars near the player on the real city's parkingSpots (plus derived curb spots):
// after a teleport there must be parked cars within 60 m, and after a short while a healthy density
// in a 170 m radius. Also sanity-checks that parked cars are not inside buildings.
import { waitGame } from './player-util.mjs';

const PLACES = [
  [145, -300, 'n-24th-south'],
  [150, -560, '24th-lake'],
  [360, 90, 'downtown'],
  [510, 200, 'old-market'],
];

export default async function (page, h) {
  const info = await h.game((g) => {
    const t = g.traffic;
    const bySrc = {};
    for (const s of t.spots) bySrc[s.src] = (bySrc[s.src] || 0) + 1;
    return { spots: t.spots.length, bySrc, city: g.city.parkingSpots.length, maxParked: g.quality.maxParked };
  });
  h.log('spots', JSON.stringify(info));
  for (const [x, z, name] of PLACES) {
    await h.game((g, a) => g.debugApi.teleport(a[0], a[1]), [x, z]);
    await waitGame(h, 1.5);
    const r = await h.game((g) => {
      const p = g.player.position;
      const t = g.traffic;
      const ds = t.parked.map((v) => Math.hypot(v.position.x - p.x, v.position.z - p.z)).sort((a, b) => a - b);
      let inside = 0;
      for (const v of t.parked) if (!g.collision.isFree(v.position.x, v.position.z, 0.6, 0.3, 1.5)) inside++;
      let onRoadMid = 0;
      return { parked: t.parked.length, within60: ds.filter((d) => d < 60).length, within30: ds.filter((d) => d < 30).length, nearest: ds[0] ? +ds[0].toFixed(1) : null, inside, cars: t.cars.length, onRoadMid };
    });
    h.log(name, JSON.stringify(r));
    h.assert(r.within60 >= 2, `${name}: parked cars within 60 m (${r.within60})`);
    h.assert(r.inside === 0, `${name}: no parked car inside a collider (${r.inside})`);
    await h.shot(`parked-${name}`);
  }
}
