// Player driving: throttle, steering, handbrake drift, crash into a wall, run over a dummy,
// lowrider hop, police siren toggle.
//   node tools/smoke.mjs --port 5205 --no-server --out tools/out/vehicles-drive --script tools/scenarios/vehicles-drive.mjs
export default async function (page, h) {
  // wait for N seconds of GAME time (the shared test machine can run at 2-5 fps)
  const gwait = async (sec, maxMs = 60000) => {
    const t0 = await h.game((g) => g.time.elapsed);
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      await h.wait(120);
      if ((await h.game((g) => g.time.elapsed)) - t0 >= sec) return;
    }
  };
  const ghold = async (code, sec) => {
    await h.down(code);
    await gwait(sec);
    await h.up(code);
  };
  await h.wait(1500);
  await h.game((g) => {
    g.__veh = { crash: [], hit: [], total: 0 };
    g.events.on('vehicle:crash', (e) => g.__veh.crash.push({ impact: +e.impact.toFixed(1), player: e.vehicle.driver === g.player }));
    g.events.on('vehicle:hitActor', (e) => g.__veh.hit.push({ speed: +e.speed.toFixed(1), hp: e.actor.health }));
    g.events.on('vehicle:totaled', () => g.__veh.total++);
    g.debugApi.freezeTraffic(true);
  });
  // a straight stretch of Dodge St (wide, long)
  const start = await h.game((g) => {
    g.debugApi.teleport(-300, 0);
    return g.debugApi.driveCar('coupe');
  });
  h.log('car', JSON.stringify(start));
  await h.game((g) => {
    const v = g.player.vehicle;
    v.position.set(-360, 0, 2.2);
    v.heading = -Math.PI / 2; // east along Dodge
    v.velocity.set(0, 0, 0);
    g.cameraRig.snap?.();
  });
  await gwait(0.3);
  await h.shot('30-in-car');
  await ghold('KeyW', 3);
  let s = await h.game((g) => g.debugApi.playerCar());
  h.log('after throttle', JSON.stringify(s));
  h.assert(s && s.speed > 8, `throttle accelerates (speed ${s?.speed})`);
  h.assert(s && s.rpm > 0.1, 'rpm exposed');
  await h.shot('31-driving');
  // steer right while holding throttle
  const h0 = s.heading;
  await h.down('KeyW');
  await ghold('KeyD', 0.8);
  await h.up('KeyW');
  s = await h.game((g) => g.debugApi.playerCar());
  h.log('after steer', JSON.stringify(s));
  h.assert(s.heading < h0 - 0.1, `steering right turns the car (heading ${h0} → ${s.heading})`);
  // handbrake drift: throttle + steer left + space
  await h.game((g) => {
    const v = g.player.vehicle;
    v.position.set(-380, 0, 2.2);
    v.heading = -Math.PI / 2;
    v.velocity.set(20, 0, 0);
  });
  await h.down('KeyW');
  await h.down('KeyA');
  await gwait(0.25);
  await h.down('Space');
  let maxSlip = 0;
  for (let i = 0; i < 6; i++) {
    await gwait(0.15);
    const q = await h.game((g) => g.debugApi.playerCar());
    maxSlip = Math.max(maxSlip, Math.abs(q.lateral));
    if (i === 3) await h.shot('32-drift');
  }
  await h.up('Space');
  await h.up('KeyA');
  await h.up('KeyW');
  await gwait(0.4);
  await h.shot('33-after-drift');
  h.log('max slip', maxSlip);
  h.assert(maxSlip > 2, `handbrake makes the car slide (slip ${maxSlip.toFixed(2)})`);
  const skids = await h.game((g) => g._vehicleFx.skids.count);
  h.log('skid marks', skids);
  h.assert(skids > 0, 'skid marks drawn');

  // ---- crash into a building: find a block with a building, drive at its face
  const wall = await h.game((g) => {
    const L = g.layout;
    const blk = L.blocks.find((b) => !b.park && !b.water && !b.landmark && b.x0 > -250 && b.x0 < 0 && b.z0 > 20 && b.z1 - b.z0 > 20);
    const v = g.player.vehicle;
    const cz = (blk.z0 + blk.z1) / 2;
    v.position.set(blk.x1 + 10, 0, cz);
    v.heading = Math.PI / 2; // facing west, toward the block
    v.velocity.set(-16, 0, 0);
    v.health = 100;
    g.__veh.crash.length = 0;
    return { x1: blk.x1, cz, free: g.collision.isFree(blk.x1 - 3.5, cz, 0.5) };
  });
  h.log('wall', JSON.stringify(wall));
  await ghold('KeyW', 1.4);
  await h.shot('34-crash');
  s = await h.game((g) => ({ car: g.debugApi.playerCar(), crash: g.__veh.crash }));
  h.log('crash', JSON.stringify(s));
  h.assert(s.crash.some((c) => c.player && c.impact > 5), 'vehicle:crash emitted for the player car');
  h.assert(s.car.health < 100, `crash damages the car (health ${s.car.health})`);
  h.assert(s.car.x > wall.x1 - 3, `car did not pass through the wall (x ${s.car.x})`);

  // ---- run over a dummy on Dodge
  await h.game((g) => {
    const v = g.player.vehicle;
    v.position.set(-150, 0, 2.2);
    v.heading = -Math.PI / 2;
    v.velocity.set(14, 0, 0);
    v.health = 100;
    g.debugApi.spawnDummy(-118, 2.2);
    g.debugApi.spawnDummy(-105, -6);
  });
  await ghold('KeyW', 2.2);
  await h.shot('35-runover');
  s = await h.game((g) => ({ hits: g.__veh.hit, dummies: g.debugApi.dummies() }));
  h.log('hits', JSON.stringify(s));
  h.assert(s.hits.length >= 1, 'vehicle:hitActor emitted');
  h.assert(s.dummies.some((d) => d.health < 100), 'dummy took damage');

  // ---- slow nudge doesn't hurt
  await h.game((g) => {
    const v = g.player.vehicle;
    v.position.set(-60, 0, 2.2);
    v.heading = -Math.PI / 2;
    v.velocity.set(2, 0, 0);
    g.debugApi.spawnDummy(-55, 2.4);
    g.__veh.hit.length = 0;
  });
  await gwait(2.5);
  s = await h.game((g) => ({ hits: g.__veh.hit.length, d: g.debugApi.dummies().slice(-1)[0] }));
  h.log('nudge', JSON.stringify(s));
  h.assert(s.hits === 0 && s.d.health === 100, 'slow nudge only pushes');

  // ---- lowrider hop
  await h.game((g) => g.debugApi.driveCar('lowrider'));
  await gwait(0.6);
  await h.down('KeyH');
  await gwait(0.12);
  await h.up('KeyH');
  s = await h.game((g) => g.debugApi.playerCar());
  await h.shot('36-hop');
  h.log('hop', JSON.stringify(s));
  h.assert(s.hopY > 0.05, 'lowrider hops on the horn');
  await gwait(1.5);

  // ---- police car: horn toggles the siren
  await h.game((g) => g.debugApi.driveCar('police'));
  await gwait(0.4);
  await h.down('KeyH');
  await gwait(0.12);
  await h.up('KeyH');
  await gwait(0.2);
  s = await h.game((g) => g.debugApi.playerCar());
  h.log('police', JSON.stringify(s));
  h.assert(s.siren === true, 'siren toggles in a police car');
  await h.shot('37-siren');

  // ---- exit point & totaled state
  const ex = await h.game((g) => {
    const v = g.player.vehicle;
    const e = v.getExitPoint();
    v.damage(200);
    return { e, totaled: v.totaled, free: g.collision.isFree(e.x, e.z, 0.4) };
  });
  h.log('exit', JSON.stringify(ex));
  h.assert(ex.free && ex.totaled, 'exit point free, car totaled at 0 health');
  await ghold('KeyW', 1);
  s = await h.game((g) => g.debugApi.playerCar());
  h.assert(Math.abs(s.speed) < 1, `totaled car won't drive (speed ${s.speed})`);
  await gwait(1.5);
  await h.shot('38-totaled');
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify({ calls: perf.calls, tris: perf.triangles, fps: perf.fps }));
}
