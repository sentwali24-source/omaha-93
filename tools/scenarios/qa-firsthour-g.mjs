// First hour, part G: can a car actually reach every garage (story3 / boost jobs need the car
// within 7 m, under 3 m/s)? Static audit of all garages + one real drive with W/A/D into the
// story3 body shop from 45 m up its street.
import { until, waitGame, snap } from './qa-firsthour-util.mjs';
import { driveTo } from './qa-firsthour-c.mjs';

export default async function (page, h) {
  await h.game((g) => { g.missions._pageIn = 9999; });
  const audit = await h.game((g) => {
    const L = g.layout;
    return g.shops.pois.filter((p) => g.shops.kindOf(p) === 'garage').map((p) => {
      let road = 1e9;
      for (let dx = -12; dx <= 12; dx += 0.5) for (let dz = -12; dz <= 12; dz += 0.5) if (L.isRoad(p.x + dx, p.z + dz)) road = Math.min(road, Math.hypot(dx, dz));
      const e = L.nearestEdge(p.x, p.z);
      return { name: p.name, x: +p.x.toFixed(1), z: +p.z.toFixed(1), road: +road.toFixed(1), edgeDist: +e.dist.toFixed(1), free: g.collision.isFree(p.x, p.z, 1.2) };
    });
  });
  h.log('garages', JSON.stringify(audit));
  // note: layout.isRoad does not cover the street stubs west of 42nd St, so a few Midtown garages
  // report no road nearby although they sit on the Douglas / Leavenworth sidewalks (checked by eye)

  await h.game((g) => { g.state.missions.completed.push('story1', 'story2'); g.debugApi.startMission('story3'); });
  const m = await until(h, (g) => { const m = g.missions.active; return m?.data?.car && { gx: m.data.garage.x, gz: m.data.garage.z, name: m.data.garage.name }; }, null, 3);
  // enter the target car, then put it on the lane 45 m up the garage's street, pointed at it
  const start = await h.game((g, m) => {
    const L = g.layout;
    const { edge, t } = L.nearestEdge(m.gx, m.gz);
    const a = L.nodes[edge.a], b = L.nodes[edge.b];
    const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    // back up 45 m (towards a), travel towards b; right-hand lane
    const sx = px - ux * 45, sz = pz - uz * 45;
    const off = L.laneOffset(edge, 0);
    const car = g.missions.active.data.car;
    g.player.enterVehicle(car);
    car.position.set(sx - uz * off, 0, sz + ux * off);
    car.heading = Math.atan2(-ux, -uz);
    car.root?.rotation && (car.root.rotation.y = car.heading);
    car.speed = 0; car.velocity?.set?.(0, 0, 0);
    g.cameraRig.snap();
    return { x: car.position.x, z: car.position.z, road: L.isRoad(car.position.x, car.position.z), px, pz };
  }, m);
  h.log('story3 drive start', JSON.stringify(m), JSON.stringify(start));
  await waitGame(h, 0.5);
  await h.shot('g-drive-start');
  // drive along the street to abreast of the shop, then nose in
  await driveTo(h, start.px, start.pz, 5, 25);
  await driveTo(h, m.gx, m.gz, 5, 12);
  const done = await until(h, (g) => g.state.missions.completed.includes('story3'), null, 4);
  h.log('story3 by driving', !!done, JSON.stringify(await snap(h)), JSON.stringify(await h.game((g, m) => { const v = g.player.vehicle || g.missions.active?.data?.car; return v && { d: Math.hypot(v.position.x - m.gx, v.position.z - m.gz).toFixed(1), speed: v.speed }; }, m)));
  await h.shot('g-garage');
  h.assert(done, 'story3 completes by driving into the body shop');
}
