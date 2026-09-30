// Atmosphere: exercise every sound code path headless (AudioContext exists in Chromium).
//   node tools/smoke.mjs --port 5203 --no-server --out tools/out/atmosphere-audio \
//     --params "autostart=1&side=crips&debug=1&quality=medium" --script tools/scenarios/atmosphere-audio.mjs
const SFX = ['punch', 'hit', 'whoosh', 'step', 'spray', 'door', 'horn', 'pager', 'cash', 'ui_click', 'ui_select', 'ko', 'skid', 'crash', 'cheer', 'bust', 'glass', 'engine_start', 'tag_done', 'mission_pass', 'mission_fail', 'rank_up', 'siren_yelp', 'thunder', 'static'];
const LOOPS = ['engine', 'siren', 'rain', 'crowd', 'spray'];

export default async function (page, h) {
  await h.game((g) => g.audio.unlock());
  await h.wait(800);
  let a = await h.game((g) => g.debugApi.audio());
  h.log('after unlock', JSON.stringify(a));
  h.assert(a.state === 'running', 'AudioContext running after unlock');

  // one-shots, positional and not
  for (const name of SFX) {
    const ok = await h.game((g, name) => {
      const p = g.player.position;
      const r1 = g.audio.play(name);
      const r2 = g.audio.play(name, { x: p.x + 12, z: p.z - 5, volume: 0.8, rate: 1.1 });
      return r1 || r2;
    }, name);
    h.assert(ok, `play(${name}) scheduled`);
    // let voices drain below the cap (16 on 'low') so the next sound is not dropped by design
    for (let i = 0; i < 10; i++) {
      await h.wait(150);
      if ((await h.game((g) => g.debugApi.audio().voices)) < 8) break;
    }
  }
  // loops with every handle method
  for (const name of LOOPS) {
    await h.game((g, name) => {
      const p = g.player.position;
      const l = g.audio.loop(name, { x: p.x + 5, z: p.z, volume: 0.5 });
      l.setVolume(0.8);
      l.setRate(name === 'engine' ? 0.6 : 1);
      l.setPosition(p.x - 8, p.z + 3);
      l.setMode?.('yelp');
      window.__loops = window.__loops || [];
      window.__loops.push(l);
    }, name);
  }
  await h.wait(1500);
  await h.game(() => {
    for (const l of window.__loops) l.stop();
  });

  // events → sounds
  await h.game((g) => {
    const p = g.player;
    const ev = g.events;
    ev.emit('actor:hit', { target: p, attacker: null, damage: 20 });
    ev.emit('pager', { from: 'OG', text: '911' });
    ev.emit('cash:change', { amount: 50, total: 110, reason: 'test' });
    ev.emit('rank:up', { rank: { name: 'Homie' } });
    ev.emit('tag:complete', { spot: { x: p.position.x + 3, z: p.position.z }, setId: 'psc' });
    ev.emit('weather:lightning', { distance: 300, intensity: 0.9 });
    ev.emit('vehicle:crash', { vehicle: g.vehicles[0], impact: 15 });
    ev.emit('heat:change', { level: 2 });
  });
  await h.wait(1500);

  // drive: radio on, cycle all stations (+ off), sirens with heat
  await h.game((g) => {
    const v = g.vehicles[0];
    if (v) g.player.enterVehicle(v);
    g.debugApi.heat(3);
    g.police.heat = 3;
  });
  await h.wait(2500);
  a = await h.game((g) => g.debugApi.audio());
  h.log('driving', JSON.stringify(a));
  h.assert(a.active, 'radio active while driving');
  h.assert(a.playing && a.playing.bar >= 0, 'radio is playing a program');
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await h.game((g) => g.audio.radio.next());
    await h.wait(2200);
    a = await h.game((g) => g.debugApi.audio());
    seen.push(`${a.station}:${a.playing?.genre ?? '-'}:${a.playing?.bar ?? '-'}`);
  }
  h.log('stations', seen.join(' | '));
  // drive a bit: engine rpm + skid + horn code paths
  await h.hold('KeyW', 1500);
  await h.game((g) => {
    const v = g.player.vehicle;
    if (v) {
      v.speed = 18;
      v.controls.handbrake = true;
    }
  });
  await h.wait(600);
  await h.hold('KeyH', 400);
  a = await h.game((g) => g.debugApi.audio());
  h.log('loops while driving', JSON.stringify(a.loops));
  await h.game((g) => {
    const v = g.player.vehicle;
    if (v) {
      v.speed = 0;
      v.controls.handbrake = false;
    }
    g.player.exitVehicle(true);
    g.police.heat = 0;
  });
  await h.wait(800);
  a = await h.game((g) => g.debugApi.audio());
  h.log('on foot', JSON.stringify(a));
  h.assert(!a.active, 'radio inactive on foot');

  // pause / resume, settings change, rain ambience
  await h.game((g) => {
    g.setPaused(true);
    g.applySettings({ musicVolume: 0.3, sfxVolume: 0.7 });
    g.setPaused(false);
    g.debugApi.weather('thunderstorm');
  });
  await h.wait(2500);
  a = await h.game((g) => g.debugApi.audio());
  h.log('storm', JSON.stringify(a));
  await h.shot('audio-end');
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify(perf));
}
