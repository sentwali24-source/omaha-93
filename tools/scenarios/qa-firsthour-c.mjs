// First hour, part C: story3 (walk to the car, F, drive it to the body shop with real keys),
// story4 (recruit two homies with E, lead them home), story5 (envelope run, timer sanity).
import { collectDialog } from './npc-util.mjs';
import { until, walkTo, holdKey, snap, waitGame } from './qa-firsthour-util.mjs';

/** Drive with W + A/D steering toward a target until within r, then brake. */
export async function driveTo(h, tx, tz, r = 6, gameSecs = 25) {
  let steer = null;
  const setSteer = async (k) => { if (k === steer) return; if (steer) await h.up(steer); if (k) await h.down(k); steer = k; };
  await h.down('KeyW');
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  let st;
  for (;;) {
    st = await h.game((g, a) => {
      const v = g.player.vehicle; if (!v) return { none: true };
      const dx = a.tx - v.position.x, dz = a.tz - v.position.z;
      const want = Math.atan2(-dx, -dz);
      let diff = want - v.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      g.cameraRig.snap?.();
      return { d: Math.hypot(dx, dz), diff, speed: v.speed, t: g.time.elapsed };
    }, { tx, tz });
    if (st.none || st.d < r || st.t - t0 > gameSecs || Date.now() - start > 240000) break;
    await setSteer(st.diff > 0.12 ? 'KeyA' : st.diff < -0.12 ? 'KeyD' : null);
    if (st.d < 25 && Math.abs(st.speed) > 8) { await h.up('KeyW'); await h.hold('KeyS', 150); await h.down('KeyW'); }
    await h.wait(200);
  }
  await setSteer(null);
  await h.up('KeyW');
  await h.down('KeyS');
  await until(h, (g) => !g.player.vehicle || Math.abs(g.player.vehicle.speed) < 1, null, 4);
  await h.up('KeyS');
  return st;
}

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  await h.game((g) => { g.state.missions.completed.push('story1', 'story2'); g.debugApi.give(110, 95); g.missions._pageIn = 9999; });
  // ---- story3
  await h.game((g) => g.debugApi.startMission('story3'));
  const car = await until(h, (g) => { const m = g.missions.active; const c = m?.data?.car; return c && { x: c.position.x, z: c.position.z, model: c.model, target: m.tokens.target, garage: m.data.garage.name, gx: m.data.garage.x, gz: m.data.garage.z, street: m.tokens.street, obj: m.objective }; }, null, 3);
  h.log('story3', JSON.stringify(car));
  await h.game((g, c) => g.debugApi.teleport(c.x + 7, c.z + 5), car);
  await waitGame(h, 0.3);
  const d = await walkTo(h, car.x, car.z, 2.4, 8);
  await h.shot('c-car-approach');
  h.log('at car', d.toFixed(2), 'prompt', await h.game((g) => g.hud.prompt));
  await h.press('KeyF');
  const inCar = await until(h, (g) => !!g.player.vehicle && g.player.vehicle.model, null, 4);
  h.log('in car', inCar, JSON.stringify(await snap(h)));
  if (inCar) {
    // skip most of the drive: put the car 60 m out from the garage, then drive the rest
    await h.game((g, c) => { const v = g.player.vehicle; const dx = v.position.x - c.gx, dz = v.position.z - c.gz; const L = Math.hypot(dx, dz) || 1; v.position.set(c.gx + dx / L * 60, 0, c.gz + dz / L * 60); v.speed = 0; g.cameraRig.snap(); }, car);
    await waitGame(h, 0.5);
    await h.shot('c-driving');
    const r = await driveTo(h, car.gx, car.gz, 6, 30);
    h.log('drive end', JSON.stringify(r), JSON.stringify(await snap(h)));
    await waitGame(h, 1);
    await h.shot('c-garage');
  }
  h.log('after story3', JSON.stringify(await snap(h)));
  // ---- story4
  await h.game((g) => g.missions.active && g.missions.abort());
  await waitGame(h, 0.5);
  const ok4 = await h.game((g) => g.debugApi.startMission('story4'));
  const rec = await until(h, (g) => { const m = g.missions.active; return m?.data?.recruitable && { n: m.data.recruitable.length, list: m.data.recruitable.map((a) => [a.position.x, a.position.z]), obj: m.objective, place: m.tokens.place, fallback: m.data.fallback }; }, null, 3);
  h.log('story4', ok4, JSON.stringify(rec));
  if (rec?.n) {
    for (let i = 0; i < rec.n; i++) {
      const a = await h.game((g, i) => { const x = g.missions.active?.data?.recruitable?.[i]; return x && { x: x.position.x, z: x.position.z, homie: !!x.userData?.homie }; }, i);
      if (!a || a.homie) continue;
      if (i === 0) await h.game((g, a) => g.debugApi.teleport(a.x + 5, a.z + 3), a);
      await waitGame(h, 0.2);
      await walkTo(h, a.x, a.z, 1.6, 8);
      const pr = await until(h, (g) => g.hud.prompt, null, 2);
      h.log('recruit prompt', pr);
      await holdKey(h, 'KeyE', 0.5);
      await waitGame(h, 0.4);
      h.log('homies', await h.game((g) => g.gangs.homies.length), await h.game((g) => g.missions.active?.objective));
    }
    await h.shot('c-recruited');
    // walk home: teleport player + homies 25 m from the hood, then walk the rest (homies follow)
    await h.game((g) => { const hood = g.missions.hoodPoi(); g.debugApi.teleport(hood.x + 20, hood.z + 15); for (const [i, a] of g.gangs.homies.entries()) a.position.set(hood.x + 21 + i, 0, hood.z + 17); });
    const hood = await h.game((g) => { const p = g.missions.hoodPoi(); return { x: p.x, z: p.z }; });
    await walkTo(h, hood.x, hood.z, 3, 12);
    await until(h, (g) => g.state.missions.completed.includes('story4'), null, 4);
    h.log('after story4', JSON.stringify(await snap(h)), 'homies', await h.game((g) => g.gangs.homies.map((a) => [a.position.x.toFixed(0), a.position.z.toFixed(0), a.brain?.state])));
    await h.shot('c-story4');
  }
  // ---- story5
  await h.game((g) => g.missions.active && g.missions.abort());
  await waitGame(h, 0.5);
  const ok5 = await h.game((g) => { if (!g.missions.available().some((m) => m.id === 'story5')) g.debugApi.give(0, 100); return g.debugApi.startMission('story5'); });
  const del = await until(h, (g) => { const m = g.missions.active; return m?.data?.dest && { px: m.data.pickup.x, pz: m.data.pickup.z, dx: m.data.dest.x, dz: m.data.dest.z, dest: m.tokens.dest, time: m.data.time, dist: Math.hypot(m.data.pickup.x - m.data.dest.x, m.data.pickup.z - m.data.dest.z) }; }, null, 3);
  h.log('story5', ok5, JSON.stringify(del));
  if (del) {
    await h.game((g, d) => g.debugApi.teleport(d.px + 6, d.pz + 3), del);
    await walkTo(h, del.px, del.pz, 2, 8);
    await until(h, (g) => g.missions.active?.stage === 1, null, 3);
    h.log('picked up', JSON.stringify(await snap(h)));
    await h.game((g, d) => g.debugApi.teleport(d.dx + 12, d.dz + 8), del);
    await waitGame(h, 0.3);
    await h.shot('c-oldmarket-approach');
    await walkTo(h, del.dx, del.dz, 2.5, 10, true);
    await until(h, (g) => g.state.missions.completed.includes('story5'), null, 4);
    h.log('after story5', JSON.stringify(await snap(h)));
    await h.shot('c-story5');
  }
  h.log('lines:\n  ' + lines.filter((l) => !l.startsWith('[toast] objective')).slice(0, 60).join('\n  '));
}
