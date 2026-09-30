// Vehicles: F near the stub car → walk-to-door lerp → seated/hidden; drive; F exits only when slow;
// carjack an NPC-driven car emits vehicle:jacked { vehicle, from, by }; chase cam screenshots.
import { waitGame, waitUntil, P } from './player-util.mjs';

export default async function (page, h) {
  const info = await h.game((g) => {
    g.debugApi.setHour(15);
    const v = g.vehicles[0];
    const p = g.player;
    // stand 2.5 m beside the car
    p.position.set(v.position.x - 2.2, 0, v.position.z + 1.2);
    p._last.copy(p.position);
    g.cameraRig.snap();
    g.__ev = [];
    for (const n of ['player:enterVehicle', 'player:exitVehicle', 'vehicle:jacked']) g.events.on(n, (e) => g.__ev.push({ n, from: e.from?.id ?? null, by: e.by?.id ?? null }));
    return { car: [v.position.x, v.position.z], heading: v.heading, n: g.vehicles.length };
  });
  h.log('car', JSON.stringify(info));
  await h.press('KeyF');
  const mid = await waitUntil(h, (g) => g.player._enter && g.debugApi.player(), null, 1);
  h.log('entering', JSON.stringify(mid && { x: mid.x, z: mid.z, entering: mid.entering }));
  h.assert(mid && mid.entering, 'F starts the walk-to-door');
  const seated = await waitUntil(h, (g) => g.player.vehicle && g.debugApi.player(), null, 2);
  h.assert(seated && seated.inVehicle && !seated.visible, 'player seated and hidden in the car');

  // drive forward
  await h.down('KeyW');
  await waitGame(h, 2.5);
  const driving = await h.game((g) => ({ speed: g.player.vehicle?.speed, cam: g.debugApi.camera(), p: g.debugApi.player() }));
  await h.shot('car-chase');
  h.log('driving', JSON.stringify(driving));
  h.assert(driving.speed > 8, `throttle drives the car (${driving.speed?.toFixed?.(1)} m/s)`);
  h.assert(driving.cam.fov > 64, `chase cam FOV widens with speed (${driving.cam.fov})`);
  // F at speed: stays inside
  await h.press('KeyF');
  await waitGame(h, 0.2);
  const still = await P(h);
  h.assert(still.inVehicle, 'cannot bail out above 6 m/s');
  await h.up('KeyW');
  // brake with S until slow, then exit
  await h.down('KeyS');
  await waitUntil(h, (g) => Math.abs(g.player.vehicle?.speed || 0) < 2, null, 6);
  await h.up('KeyS');
  await waitGame(h, 0.3);
  await h.press('KeyF');
  const out = await waitUntil(h, (g) => !g.player.vehicle && g.debugApi.player(), null, 1);
  await waitGame(h, 0.4);
  await h.shot('car-exit');
  h.log('exited', JSON.stringify(out));
  h.assert(out && !out.inVehicle && out.visible, 'F exits when slow; player visible again');

  // carjack: give the car an NPC driver, then F
  await h.game((g) => {
    const v = g.vehicles[0];
    const id = g.debugApi.spawnDummy(v.position.x, v.position.z, { outfit: 'civilian', variant: 'polo' }, { kind: 'ped', noRevive: true });
    const npc = g.actors.find((a) => a.id === id);
    npc.character.setVisible(false);
    v.setDriver(npc);
    npc.vehicle = v;
    g.__npc = id;
    const p = g.player;
    p.position.set(v.position.x - 2, 0, v.position.z);
    p._last.copy(p.position);
  });
  await h.press('KeyF');
  const jacked = await waitUntil(h, (g) => g.player.vehicle && { ev: g.__ev.slice(), stats: g.state.stats.carsJacked, npc: g.__npc, me: g.player.id, driver: g.player.vehicle.driver?.id }, null, 2);
  h.log('jack', JSON.stringify(jacked));
  const ev = jacked?.ev.find((e) => e.n === 'vehicle:jacked');
  h.assert(ev && ev.from === jacked.npc && ev.by === jacked.me, 'vehicle:jacked { from: npc, by: player }');
  h.assert(jacked?.driver === jacked?.me, 'player is the driver after the jack');
  h.assert(jacked?.stats === 1, 'stats.carsJacked counted');
  const evs = await h.game((g) => g.__ev.map((e) => e.n).join(','));
  h.log('events', evs);
  // forced exit (e.g. respawn) works at any speed
  await h.down('KeyW');
  await waitGame(h, 1.5);
  await h.up('KeyW');
  const forced = await h.game((g) => g.player.exitVehicle(true) && g.debugApi.player());
  h.assert(forced && !forced.inVehicle, 'exitVehicle(true) works at speed');
}
