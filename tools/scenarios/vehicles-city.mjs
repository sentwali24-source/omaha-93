// Driving in the real city: F into the nearest parked car, cruise down 24th St, turn onto Dodge with
// the handbrake, crash into a building, exit. The chase camera is sampled every frame for clipping
// (inside a collider or with a wall between the car and the lens).
import { waitGame, waitUntil } from './player-util.mjs';

async function camWatch(h, on) {
  await h.game((g, on) => {
    if (!g.__camw) {
      g.__camw = { on: false, n: 0, inside: 0, blocked: 0, worst: [] };
      g.city.addUpdater(() => {
        const w = g.__camw;
        if (!w.on || !g.player?.vehicle) return;
        const c = g.camera.position;
        const t = g.cameraRig.target;
        w.n++;
        const boxes = g.collision.query(c.x - 0.3, c.z - 0.3, c.x + 0.3, c.z + 0.3);
        for (const b of boxes) {
          if (b.tag === 'tree' || b.tag === 'prop' || b.tag === 'water') continue;
          if (c.x > b.minX + 0.05 && c.x < b.maxX - 0.05 && c.z > b.minZ + 0.05 && c.z < b.maxZ - 0.05 && c.y > b.minY && c.y < b.maxY) {
            w.inside++;
            if (w.worst.length < 5) w.worst.push({ x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1), tag: b.tag });
            break;
          }
        }
        const dx = c.x - t.x;
        const dy = c.y - t.y;
        const dz = c.z - t.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 0.5) {
          const hit = g.collision.raycast(t.x, t.y, t.z, dx / d, dy / d, dz / d, d, (b) => b.tag !== 'tree' && b.tag !== 'prop' && b.tag !== 'water');
          if (hit < d - 0.15) w.blocked++;
        }
      });
    }
    g.__camw.on = on;
  }, on);
}

export default async function (page, h) {
  await h.game((g) => {
    g.debugApi.setHour(18.6);
    g.__ev = { crash: [], enter: 0, exit: 0 };
    g.events.on('vehicle:crash', (e) => g.__ev.crash.push(+e.impact.toFixed?.(2) || e.impact));
    g.events.on('player:enterVehicle', () => g.__ev.enter++);
    g.events.on('player:exitVehicle', () => g.__ev.exit++);
  });
  await waitGame(h, 0.5);
  // walk up to the nearest parked car and press F
  const car = await h.game((g) => {
    const p = g.player.position;
    let best = null;
    let bd = Infinity;
    for (const v of g.traffic.parked) {
      const d = Math.hypot(v.position.x - p.x, v.position.z - p.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (!best) return null;
    const hd = best.heading;
    // stand 2 m out from the driver door (left side)
    g.player.position.set(best.position.x - Math.cos(hd) * 2.4, 0, best.position.z + Math.sin(hd) * 2.4);
    g.player._last.copy(g.player.position);
    g.cameraRig.snap();
    return { model: best.model, d: +bd.toFixed(1), x: best.position.x, z: best.position.z, uid: best.uid };
  });
  h.log('nearest parked', JSON.stringify(car));
  h.assert(car && car.d < 60, 'a parked car near the spawn');
  await h.press('KeyF');
  const seated = await waitUntil(h, (g) => g.player.vehicle && g.player.vehicle.model, null, 3);
  h.assert(!!seated, 'F enters the parked car');
  await waitGame(h, 0.3);
  await h.shot('city-0-seated');

  // put the car on 24th St heading south, a block north of Cuming
  await h.game((g) => {
    const v = g.player.vehicle;
    v.position.set(144, 0, -330);
    v.heading = Math.PI;
    v.velocity.set(0, 0, 0);
    v.speed = 0;
    g.cameraRig.snap();
  });
  await camWatch(h, true);
  await h.down('KeyW');
  await waitGame(h, 2.5);
  await h.shot('city-1-24th');
  await waitGame(h, 2.5);
  const run1 = await h.game((g) => ({ car: g.debugApi.playerCar(), cam: g.debugApi.camera(), w: g.__camw }));
  h.log('24th run', JSON.stringify(run1));
  h.assert(run1.car.speed > 12, `accelerates down 24th (${run1.car.speed} m/s)`);
  await h.shot('city-2-24th-fast');
  // handbrake turn to the right
  await h.down('KeyD');
  await h.down('Space');
  await waitGame(h, 0.6);
  const drift = await h.game((g) => g.debugApi.playerCar());
  await h.shot('city-3-handbrake');
  await h.up('Space');
  await waitGame(h, 0.5);
  await h.up('KeyD');
  await waitGame(h, 1.2);
  h.log('drift', JSON.stringify(drift));
  h.assert(Math.abs(drift.lateral) > 1.5 || drift.skid > 0.2, `handbrake slides the rear (lateral ${drift.lateral}, skid ${drift.skid})`);
  await h.up('KeyW');

  // Dodge St eastbound, then steer into a building on the south side
  await h.game((g) => {
    const v = g.player.vehicle;
    v.position.set(170, 0, 4);
    v.heading = -Math.PI / 2;
    v.velocity.set(0, 0, 0);
    g.cameraRig.snap();
  });
  await h.down('KeyW');
  await waitGame(h, 3);
  await h.shot('city-4-dodge');
  const dodge = await h.game((g) => g.debugApi.playerCar());
  h.log('dodge', JSON.stringify(dodge));
  // aim at the nearest building box
  const target = await h.game((g) => {
    const v = g.player.vehicle;
    const p = v.position;
    let best = null;
    let bd = Infinity;
    for (const b of g.collision.query(p.x - 60, p.z - 60, p.x + 60, p.z + 60)) {
      if (b.tag !== 'building' && b.tag !== 'landmark') continue;
      if (b.maxY < 4) continue;
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const d = Math.hypot(cx - p.x, cz - p.z);
      if (d > 14 && d < bd) {
        bd = d;
        best = { cx, cz, d };
      }
    }
    if (!best) return null;
    v.heading = Math.atan2(-(best.cx - p.x), -(best.cz - p.z));
    const s = Math.max(12, Math.abs(v.speed));
    v.velocity.set(-Math.sin(v.heading) * s, 0, -Math.cos(v.heading) * s);
    g.cameraRig.snap();
    return best;
  });
  h.log('crash target', JSON.stringify(target));
  const crash = await waitUntil(h, (g) => g.__ev.crash.length && g.__ev.crash, null, 5);
  await waitGame(h, 0.15);
  await h.shot('city-5-crash');
  await h.up('KeyW');
  const after = await h.game((g) => ({ car: g.debugApi.playerCar(), w: g.__camw }));
  h.log('crash', JSON.stringify({ crash, after }));
  h.assert(!!crash, 'hitting a building emits vehicle:crash');
  h.assert(after.car.health < 100, `crash damages the car (${after.car.health})`);
  await waitGame(h, 1.0);
  await h.shot('city-6-after-crash');
  await camWatch(h, false);
  const w = await h.game((g) => g.__camw);
  h.log('camera samples', JSON.stringify(w));
  h.assert(w.inside === 0, `chase cam never inside a building (${w.inside}/${w.n})`);
  h.assert(w.blocked <= Math.max(2, w.n * 0.01), `chase cam keeps line of sight (${w.blocked}/${w.n} blocked)`);

  // stop and get out
  await h.down('KeyS');
  await waitUntil(h, (g) => Math.abs(g.player.vehicle?.speed || 0) < 1.5, null, 5);
  await h.up('KeyS');
  await h.press('KeyF');
  const out = await waitUntil(h, (g) => !g.player.vehicle && g.debugApi.player(), null, 2);
  h.assert(out && out.visible, 'F exits');
  const free = await h.game((g) => g.collision.isFree(g.player.position.x, g.player.position.z, 0.3, 0.3, 1.8));
  h.assert(free, 'exit point is free');
  await waitGame(h, 0.5);
  await h.shot('city-7-exit');
}
