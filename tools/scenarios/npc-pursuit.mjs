// NPC scenario: car pursuit. 3 stars while driving north on 16th St → several cruisers with
// sirens + a roadblock ahead; 4 stars → cruisers ram; stop the car → officers get out → busted.
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const dialogs = collectDialog(page);
  await dialogs.ready;
  const ok = await h.game((g) => {
    const v = g.vehicles.find((q) => !q.isPolice);
    if (!v) return false;
    g.debugApi.teleport(386, 150);
    v.position.set(385, 0, 140);
    v.heading = 0; // north on 16th St
    v.root.rotation.y = 0;
    v.speed = 0;
    g.player.enterVehicle(v);
    g.cameraRig.yaw = 0;
    return true;
  });
  h.assert(ok, 'got a car');
  await waitGame(h, 1);
  await h.game((g) => g.debugApi.heat(3));
  // drive north
  await h.down('KeyW');
  await waitGame(h, 2.5);
  await h.up('KeyW');
  await waitGame(h, 1.5);
  let pol = await h.game((g) => ({ ...g.debugApi.police(), car: { x: Math.round(g.player.vehicle.position.x), z: Math.round(g.player.vehicle.position.z), speed: +g.player.vehicle.speed.toFixed(1) } }));
  h.log('3 stars', JSON.stringify({ heat: pol.heat, car: pol.car, units: pol.units }));
  h.assert(pol.units.filter((u) => u.pursuit).length >= 3, '3 stars: several cruisers in pursuit');
  h.assert(pol.units.filter((u) => u.pursuit).every((u) => u.siren), 'pursuit cruisers run their sirens');
  h.assert(pol.units.some((u) => u.mode === 'block'), '3 stars: a roadblock is set up ahead');
  await h.shot('01-pursuit');
  // pursuers close in over time
  const d0 = await h.game((g) => Math.min(...g.police.units.filter((u) => u.pursuit).map((u) => u.vehicle.position.distanceTo(g.player.vehicle.position))));
  await waitGame(h, 5);
  const d1 = await h.game((g) => Math.min(...g.police.units.filter((u) => u.pursuit).map((u) => u.vehicle.position.distanceTo(g.player.vehicle.position))));
  h.log('closest pursuer', d0.toFixed(1), '→', d1.toFixed(1));
  h.assert(d1 < d0 || d1 < 20, 'cruisers close in on the stopped car');
  await h.game((g) => g.debugApi.heat(4));
  await waitGame(h, 5);
  pol = await h.game((g) => g.debugApi.police());
  h.log('4 stars', JSON.stringify(pol.units.map((u) => [u.mode, u.x, u.z, u.inCar])));
  await h.shot('02-boxed-in');
  // stay stopped: officers reach the car door → busted
  let busted = false;
  await h.game(() => {
    window.__busted = false;
    window.__game.events.on('player:busted', () => (window.__busted = true));
  });
  for (let i = 0; i < 40 && !busted; i++) {
    await waitGame(h, 0.5);
    busted = await h.game(() => window.__busted);
    const m = await h.game((g) => ({ heap: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6), actors: g.actors.length, veh: g.vehicles.length, cops: g.police.cops.length, units: g.police.units.length, scene: g.scene.children.length, fps: g.perf.fps, t: +g.time.elapsed.toFixed(1) }));
    h.log('tick', JSON.stringify(m));
  }
  pol = await h.game((g) => g.debugApi.police());
  h.log('bust', JSON.stringify({ busted, foot: pol.foot.length }));
  h.assert(busted, 'officers bust the player in the stopped car');
  await h.shot('03-busted-car');
  h.log('dialog lines:\n  ' + dialogs.slice(0, 20).join('\n  '));
}
