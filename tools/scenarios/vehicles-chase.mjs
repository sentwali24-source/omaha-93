// Police pursuit + carjacking in the real city.
//  1. Carjack: stop a traffic car next to the player, F → vehicle:jacked, the NPC driver comes out as a
//     fleeing pedestrian (game.pedestrians.spawnPed) and the car is ours.
//  2. heat(3) while driving: cruisers close in; no cruiser (or any car) ever sits inside a building.
//  3. Traffic's own makeAIDriver chase: a traffic car routed toward the player closes the distance.
import { waitGame, waitUntil } from './player-util.mjs';

export default async function (page, h) {
  const only = process.env.CHASE_ONLY || '';
  if (only === 'traffic') {
    await h.game((g) => {
      g.debugApi.driveCar('sedan');
      g.__inside = { n: 0 };
    });
    return trafficChase(h);
  }
  // ---- 1. carjack
  const setup = await h.game((g) => {
    g.debugApi.setHour(17);
    g.__ev = { jacked: [], peds0: g.pedestrians.peds.length };
    g.events.on('vehicle:jacked', (e) => g.__ev.jacked.push({ from: e.from?.isVirtual ? 'virtual' : e.from?.kind, by: e.by === g.player }));
    // a traffic car on the nearest lane, then stand at its driver door
    const L = g.layout;
    const p = g.player.position;
    const ne = L.nearestEdge(p.x, p.z);
    const e = ne.edge;
    const a = L.nodes[e.a];
    const b = L.nodes[e.b];
    const t = Math.max(0.3, Math.min(0.7, ne.t));
    const cx = a.x + (b.x - a.x) * t;
    const cz = a.z + (b.z - a.z) * t;
    const d = L.edgeDir(e, e.a);
    const off = L.laneOffset(e, 0);
    const v = g.traffic.spawnCar({ x: cx - d.z * off, z: cz + d.x * off, heading: Math.atan2(-d.x, -d.z), model: 'sedan', ai: 'cruise', owner: 'traffic', speed: 0 });
    v.velocity.set(0, 0, 0);
    const hd = v.heading;
    g.player.position.set(v.position.x - Math.cos(hd) * 2.3, 0, v.position.z + Math.sin(hd) * 2.3);
    g.player._last.copy(g.player.position);
    g.cameraRig.snap();
    g.__jackCar = v;
    return { uid: v.uid, virtual: !!v.driver?.isVirtual };
  });
  h.log('jack setup', JSON.stringify(setup));
  await h.press('KeyF');
  const jacked = await waitUntil(h, (g) => g.player.vehicle === g.__jackCar && g.__ev.jacked.length, null, 3);
  await waitGame(h, 0.8);
  const jr = await h.game((g) => {
    const peds = g.pedestrians.peds;
    const newest = peds[peds.length - 1];
    return {
      jacked: g.__ev.jacked,
      peds: peds.length,
      peds0: g.__ev.peds0,
      newest: newest ? { state: newest.brain.state, d: +Math.hypot(newest.position.x - g.player.position.x, newest.position.z - g.player.position.z).toFixed(1) } : null,
      inCar: g.player.vehicle === g.__jackCar,
      managed: g.traffic.cars.includes(g.__jackCar),
      stats: g.state.stats.carsJacked,
    };
  });
  h.log('carjack', JSON.stringify(jr));
  await h.shot('chase-0-jacked');
  h.assert(!!jacked && jr.inCar, 'F carjacks the traffic car');
  h.assert(jr.jacked.length === 1 && jr.jacked[0].from === 'virtual', 'vehicle:jacked from the NPC driver');
  h.assert(jr.peds > jr.peds0 && jr.newest && /flee|run|panic/.test(jr.newest.state), `ejected driver is a fleeing pedestrian (${jr.newest?.state})`);
  h.assert(!jr.managed, 'traffic stops managing the jacked car');

  // ---- 2. police pursuit
  await h.game((g) => {
    // watchdog: any car inside a building box
    g.__inside = { n: 0, list: [] };
    g.city.addUpdater(() => {
      for (const v of g.vehicles) {
        const x = v.position.x;
        const z = v.position.z;
        for (const b of g.collision.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1)) {
          if (b.tag === 'tree' || b.tag === 'prop' || b.tag === 'water' || b.tag === 'fence' || b.maxY < 1.2) continue;
          if (x > b.minX + 0.3 && x < b.maxX - 0.3 && z > b.minZ + 0.3 && z < b.maxZ - 0.3) {
            g.__inside.n++;
            if (g.__inside.list.length < 6) g.__inside.list.push({ uid: v.uid, model: v.model, police: v.isPolice, x: +x.toFixed(1), z: +z.toFixed(1), tag: b.tag });
            break;
          }
        }
      }
    });
    const v = g.player.vehicle;
    v.position.set(144, 0, -420);
    v.heading = Math.PI;
    v.velocity.set(0, 0, 0);
    g.cameraRig.snap();
    g.debugApi.heat(3);
  });
  await h.down('KeyW');
  await waitGame(h, 3);
  await h.up('KeyW');
  await h.down('KeyS');
  await waitGame(h, 1.5);
  await h.up('KeyS');
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await waitGame(h, 3);
    const s = await h.game((g) => {
      const p = g.player.vehicle?.position || g.player.position;
      const cr = g.police.cruisers.map((c) => Math.round(Math.hypot(c.position.x - p.x, c.position.z - p.z)));
      return { heat: g.police.heat, cruisers: cr, inside: g.__inside.n, pursuit: g.police.units?.filter((u) => u.pursuit).length };
    });
    samples.push(s);
    h.log(`pursuit t${i}`, JSON.stringify(s));
    if (i === 2) await h.shot('chase-1-pursuit');
  }
  await h.shot('chase-2-pursuit');
  const minD = Math.min(...samples.flatMap((s) => s.cruisers));
  h.assert(samples.some((s) => s.cruisers.length > 0), 'cruisers respond at 3 stars');
  h.assert(minD < 40, `a cruiser closes in (${minD} m)`);
  const ins = await h.game((g) => g.__inside);
  h.log('inside', JSON.stringify(ins));
  h.assert(ins.n === 0, `no car inside a building (${ins.n})`);

  await trafficChase(h);
}

async function trafficChase(h) {
  // ---- 3. Traffic makeAIDriver chase
  const ch = await h.game((g) => {
    g.debugApi.heat(0);
    g.police.clear?.();
    const p = g.player.vehicle.position;
    const v = g.traffic.spawnCar({ model: 'police', owner: 'traffic', ai: { mode: 'chase', target: g.player } });
    if (!v) return null;
    g.__chaser = v;
    return { uid: v.uid, d: Math.round(Math.hypot(v.position.x - p.x, v.position.z - p.z)) };
  });
  h.log('traffic chaser', JSON.stringify(ch));
  if (ch) {
    let d2 = null;
    for (let i = 0; i < 4; i++) {
      await waitGame(h, 5);
      d2 = await h.game((g) => {
        const p = g.player.vehicle.position;
        const v = g.__chaser;
        return { d: Math.round(Math.hypot(v.position.x - p.x, v.position.z - p.z)), mode: v.ai?.mode, speed: +v.speed.toFixed(1), inside: g.__inside.n, route: v.ai?.route?.length ?? null, at: [Math.round(v.position.x), Math.round(v.position.z)], player: [Math.round(p.x), Math.round(p.z)] };
      });
      h.log(`traffic chaser t${i}`, JSON.stringify(d2));
      if (d2.d < 25) break;
    }
    h.assert(d2.d < ch.d * 0.6 || d2.d < 25, `makeAIDriver chase closes in (${ch.d} → ${d2.d} m)`);
    h.assert(d2.inside === 0, 'chaser never inside a building');
    await h.shot('chase-3-traffic-chaser');
  }
}
