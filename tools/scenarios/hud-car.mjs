// In-car HUD: get in a car, drive, radio name, speedometer, radar zoom-out.
export default async function (page, h) {
  // screenshots can time out on a heavily loaded machine: log and carry on
  const snap = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  await h.wait(1200);
  // the real Traffic system's debug helper spawns a car on the nearest lane and seats the player
  await h.game((g) => g.debugApi.driveCar('coupe'));
  const inCar = await page.waitForFunction(() => !!window.__game.player.vehicle, null, { timeout: 8000 }).then(() => true, () => false);
  h.assert(inCar, 'player got into the car');
  await h.game((g) => g.events.emit('radio:station', { station: { id: 'kbnc', name: 'KBNC 94.1 The Bounce', genre: 'Hip-hop & R&B' } }));
  await h.down('KeyW');
  await h.wait(3500);
  await snap('30-car');
  await h.wait(2500);
  const st = await h.game((g) => ({ speed: g.player.vehicle?.speed, mph: g.hud.speedoNum.textContent, radius: g.hud.minimap.radiusM }));
  h.log(JSON.stringify(st));
  await snap('31-car-fast');
  await h.up('KeyW');
  await h.game((g) => g.police.setHeat(3));
  await h.wait(800);
  await snap('32-car-heat');
}
