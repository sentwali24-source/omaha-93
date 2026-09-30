// Integrated audio check: get into a real car with F, drive, engine pitch vs speed, radio station
// switch with R ('radio:station' event), sirens with heat, exit, punch (actor:hit → punch sfx).
export default async function (page, h) {
  await h.game((g) => {
    g.audio.unlock();
    window.__radioEv = [];
    g.events.on('radio:station', (e) => window.__radioEv.push(e.station?.id ?? null));
    g.debugApi.setHour(13);
  });
  await h.wait(3000);
  const found = await h.game((g) => {
    const p = g.player.position;
    const v = g.vehicles.filter((v) => !v.driver && !v.isPolice).sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0];
    if (!v) return null;
    const ex = v.getExitPoint ? v.getExitPoint() : { x: v.position.x + 2.5, z: v.position.z };
    g.debugApi.teleport(ex.x, ex.z);
    return { model: v.model, x: v.position.x, z: v.position.z };
  });
  h.log('car', JSON.stringify(found), JSON.stringify(await h.game((g) => ({ n: g.vehicles.length, parked: g.traffic.parked?.length, list: g.vehicles.slice(0, 6).map((v) => ({ p: v.parked, d: !!v.driver, dn: v.driver?.kind, pol: v.isPolice })) }))));
  await h.wait(800);
  await h.press('KeyF');
  for (let i = 0; i < 20; i++) {
    await h.wait(750);
    if (await h.game((g) => !!g.player.vehicle && g.player.state !== 'entering')) break;
  }
  await h.wait(1000);
  let s = await h.game((g) => ({ inCar: !!g.player.vehicle, radio: g.audio.radio.active, station: g.audio.radio.station?.id, loops: [...g.audio._loops].map((l) => l.name) }));
  h.log('entered', JSON.stringify(s));
  h.assert(s.inCar && s.radio, 'in a real car with the radio on');
  const samples = [];
  await h.down('KeyW');
  for (let i = 0; i < 6; i++) {
    await h.wait(1500);
    samples.push(await h.game((g) => ({ speed: +(g.player.vehicle?.speed ?? 0).toFixed(1), vrpm: +(g.player.vehicle?.rpm ?? 0).toFixed(2), arpm: +(g.audio._engineRpm ?? 0).toFixed(2) })));
  }
  await h.up('KeyW');
  h.log('engine', JSON.stringify(samples));
  await h.press('KeyR');
  await h.wait(1200);
  await h.press('KeyR');
  await h.wait(1200);
  s = await h.game((g) => ({ station: g.audio.radio.station?.id, events: window.__radioEv }));
  h.log('radio', JSON.stringify(s));
  h.assert(s.events.length >= 2, 'radio:station emitted on R');
  await h.game((g) => g.debugApi.heat(3));
  await h.wait(4000);
  s = await h.game((g) => ({ heat: g.police.heat, loops: [...g.audio._loops].map((l) => l.name + (l.external ? '(ext)' : '')), cruisers: g.vehicles.filter((v) => v.isPolice).length }));
  h.log('heat', JSON.stringify(s));
  await h.game((g) => { g.police.clear?.(); g.debugApi.heat(0); const v = g.player.vehicle; if (v) v.speed = 0; });
  await h.wait(1500);
  await h.press('KeyF');
  for (let i = 0; i < 16; i++) {
    await h.wait(750);
    if (await h.game((g) => !g.player.vehicle)) break;
  }
  await h.wait(800);
  s = await h.game((g) => ({ inCar: !!g.player.vehicle, radio: g.audio.radio.active, loops: [...g.audio._loops].map((l) => l.name) }));
  h.log('exited', JSON.stringify(s));
  await h.game((g) => { window.__hits = 0; g.events.on('actor:hit', () => window.__hits++); const p = g.player; g.pedestrians.spawnPed({ x: p.position.x - Math.sin(p.heading) * 1.2, z: p.position.z - Math.cos(p.heading) * 1.2 }); });
  for (let i = 0; i < 4; i++) { await h.press('KeyJ'); await h.wait(450); }
  s = await h.game((g) => ({ hits: window.__hits, voices: g.debugApi.audio().voices }));
  h.log('punch', JSON.stringify(s));
}
