export default async function (page, h) {
  await h.wait(1000);
  await h.game((g) => { g.debugApi.freezeTraffic(true); g.debugApi.teleport(-300, 0); g.debugApi.driveCar('coupe'); const v = g.player.vehicle; v.position.set(-360, 0, 2.2); v.heading = -Math.PI/2; v.velocity.set(0,0,0);
    g.__log = []; const orig = v.update.bind(v); v.update = (dt) => { const s0 = v.speed; orig(dt); g.__log.push([+dt.toFixed(3), +s0.toFixed(3), +v.speed.toFixed(3), v.controls.throttle, performance.now()|0]); };
  });
  await h.down('KeyW');
  await h.wait(1500);
  await h.up('KeyW');
  const log = await h.game((g) => g.__log);
  h.log(log.length, JSON.stringify(log.slice(0, 40)));
}
