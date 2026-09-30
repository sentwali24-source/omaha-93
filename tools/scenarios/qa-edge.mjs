// Stability edge cases: KO then quit to title, busted during a mission, homies riding along,
// resize, tab hidden, quality switch at runtime, save/continue round trip, corrupted saves.
import { waitGame, waitUntil } from './player-util.mjs';

const nanCheck = (g) => {
  let bad = 0;
  for (const a of g.actors) if (!Number.isFinite(a.position.x) || !Number.isFinite(a.position.z)) bad++;
  for (const v of g.vehicles) if (!Number.isFinite(v.position.x) || !Number.isFinite(v.position.z) || !Number.isFinite(v.speed)) bad++;
  return bad;
};

export default async function (page, h) {
  const only = (process.env.EDGE || 'ko,bust,homies,resize,hidden,quality,save,corrupt').split(',');
  await waitGame(h, 2);

  if (only.includes('ko')) {
    // 1. KO, then quit to title before the respawn fires, then a new game
    await h.game((g) => g.player.knockOut(null));
    await waitGame(h, 0.6);
    await h.game((g) => g.quitToTitle());
    await h.wait(800);
    await h.game((g) => g.menu.quickStart({ side: 'crips', name: 'EdgeKO' }));
    const s0 = await h.game((g) => ({ cash: g.state.cash, ko: g.state.stats.knockedOut, timer: !!g._respawnTimer }));
    await waitGame(h, 5, 60000);
    const s1 = await h.game((g) => ({ cash: g.state.cash, ko: g.state.stats.knockedOut, timer: !!g._respawnTimer, alive: g.player.alive, big: g.debugApi.hud?.().big }));
    h.log('ko-quit', JSON.stringify({ s0, s1 }));
    h.assert(s1.cash === 60 && s1.ko === 0, 'stale KO respawn leaked into the new game');
  }

  if (only.includes('bust')) {
    // 2. busted during a mission (Police emits player:busted)
    const st = await h.game((g) => {
      const av = g.missions.available();
      const m = av.find((x) => x && !x.locked) || av[0];
      return m ? { ok: g.debugApi.startMission(m.id), id: m.id } : null;
    });
    await waitGame(h, 1);
    await h.game((g) => g.events.emit('player:busted', {}));
    await waitGame(h, 5, 60000);
    const r = await h.game((g) => ({ active: g.missions.active?.id || null, alive: g.player.alive, down: g.player.down, x: Math.round(g.player.position.x), z: Math.round(g.player.position.z), busted: g.state.stats.busted, heat: g.police.heat }));
    h.log('bust-mission', JSON.stringify({ st, r }));
    h.assert(!r.active && r.alive && !r.down, 'bust during mission did not resolve');
  }

  if (only.includes('homies')) {
    // 3. recruit homies, drive with them, exit, KO in car, quit while they ride
    const rec = await h.game((g) => {
      const setId = g.state.player.setId;
      const p = g.player.position;
      const ids = g.debugApi.spawnGang(setId, p.x + 3, p.z + 2, 2, 'hang');
      let n = 0;
      for (const a of g.actors) if (ids.includes(a.id) && g.gangs.recruit(a)) n++;
      return n;
    });
    await waitGame(h, 1);
    await h.game((g) => g.debugApi.driveCar('sedan'));
    await waitGame(h, 1);
    const inCar = await h.game((g) => ({ riding: g.gangs.homies.filter((a) => a.brain.riding).length, actors: g.actors.length, nan: 0 }));
    await h.hold('KeyW', 1200);
    await h.game((g) => g.player.exitVehicle(true));
    await waitGame(h, 1);
    const out = await h.game((g) => ({ riding: g.gangs.homies.filter((a) => a.brain.riding).length, inActors: g.gangs.homies.filter((a) => g.actors.includes(a)).length }));
    // KO while driving (e.g. a scripted hit): must not leave the player driving a car while KO'd
    await h.game((g) => g.debugApi.driveCar('coupe'));
    await waitGame(h, 0.5);
    await h.game((g) => g.player.knockOut(null));
    await h.hold('KeyW', 1500);
    const ko = await h.game((g) => ({ inCar: !!g.player.vehicle, throttle: g.player.vehicle?.controls.throttle ?? null, speed: g.player.vehicle ? +g.player.vehicle.speed.toFixed(1) : null }));
    await waitGame(h, 4.5, 60000);
    const ko2 = await h.game((g) => ({ inCar: !!g.player.vehicle, alive: g.player.alive, homies: g.gangs.homies.length }));
    // recruit again and quit to title while they ride
    await h.game((g) => {
      const setId = g.state.player.setId;
      const p = g.player.position;
      const ids = g.debugApi.spawnGang(setId, p.x + 3, p.z + 2, 2, 'hang');
      for (const a of g.actors) if (ids.includes(a.id)) g.gangs.recruit(a);
      g.debugApi.driveCar('sedan');
    });
    await waitGame(h, 0.5);
    const riding = await h.game((g) => g.gangs.homies.filter((a) => a.brain.riding).length);
    await h.game((g) => g.quitToTitle());
    await h.wait(1000);
    const title = await h.game((g) => ({ homies: g.gangs.homies.length, removedInList: g.actors.filter((a) => a.state === 'removed').length, player: !!g.player }));
    await h.game((g) => g.menu.quickStart({ side: 'crips', name: 'EdgeH' }));
    await waitGame(h, 1);
    h.log('homies', JSON.stringify({ rec, inCar, out, ko, ko2, riding, title }));
    h.assert(out.riding === 0 && out.inActors === out.inActors, 'homies stuck riding');
    h.assert(title.removedInList === 0, 'removed actors left in game.actors');
  }

  if (only.includes('resize')) {
    for (const [w, hh] of [[800, 600], [390, 844], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: hh });
      await h.wait(700);
      const r = await h.game((g) => ({ aspect: +g.camera.aspect.toFixed(3), cw: g.renderer.domElement.width, ch: g.renderer.domElement.height }));
      h.log('resize', w, hh, JSON.stringify(r));
    }
  }

  if (only.includes('hidden')) {
    const r = await h.game((g) => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      const paused = g.paused;
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      return { paused, pauseOpen: g.menu.pauseOpen };
    });
    await h.wait(500);
    await h.game((g) => g.menu.hidePause());
    await h.wait(500);
    const r2 = await h.game((g) => ({ paused: g.paused, enabled: g.input.enabled }));
    h.log('hidden', JSON.stringify({ r, r2 }));
  }

  if (only.includes('quality')) {
    const out = [];
    for (const q of ['high', 'low', 'medium', 'low']) {
      await h.game((g, q) => g.applySettings({ quality: q }), q);
      await waitGame(h, 1.5, 30000);
      out.push(await h.game((g) => ({ q: g.quality.name, calls: g.perf.calls, tris: g.perf.triangles, far: g.camera.far, shadows: g.renderer.shadowMap.enabled, sunShadow: g.environment.sun.castShadow, veh: g.vehicles.length, actors: g.actors.length })));
    }
    h.log('quality', JSON.stringify(out));
  }

  h.log('nan', await h.game(nanCheck));

  if (only.includes('save')) {
    const before = await h.game((g) => {
      g.debugApi.give(1234, 150);
      g.debugApi.teleport(372, 118);
      const z = Object.keys(g.state.turf)[0];
      g.gangs.addInfluence(z, g.state.player.setId, 25);
      g.debugApi.missions.completeStory(1);
      g.save();
      return { cash: g.state.cash, rep: g.state.rep, x: Math.round(g.player.position.x), z: Math.round(g.player.position.z), turf: JSON.stringify(g.state.turf[z]), zone: z, completed: g.state.missions.completed.slice(), hour: +g.clock.hour.toFixed(2) };
    });
    await page.goto(page.url().replace('autostart=1&', ''), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.mode !== 'boot', null, { timeout: 90000 });
    await h.wait(1000);
    await h.game((g) => g.continueGame());
    await waitGame(h, 1.5);
    const after = await h.game((g, z) => ({ cash: g.state.cash, rep: g.state.rep, x: Math.round(g.player.position.x), z: Math.round(g.player.position.z), turf: JSON.stringify(g.state.turf[z]), completed: g.state.missions.completed.slice(), hour: +g.clock.hour.toFixed(2), mode: g.mode }), before.zone);
    h.log('save', JSON.stringify({ before, after }));
    h.assert(after.cash === before.cash && after.x === before.x && after.z === before.z, 'save round trip lost state');
  }

  if (only.includes('corrupt')) {
    const cases = [
      '{"version":1}',
      '{"version":1,"player":null,"cash":5}',
      '{"version":1,"player":{"side":"crips","setId":"nope"},"cash":"lots"}',
      '{"version":1,"player":{"name":"X","side":"bloods","setId":"lvb"},"position":{"x":null,"z":"abc"},"turf":null,"missions":null,"stats":null,"flags":null,"clock":{"hour":"x"}}',
      '{not json',
      '{"version":0,"player":{"side":"crips"}}',
    ];
    for (const c of cases) {
      const r = await h.game((g, c) => {
        if (g.mode === 'play') g.quitToTitle();
        localStorage.setItem('omaha93.save.v1', c);
        let ok;
        let err = null;
        try {
          ok = g.continueGame();
        } catch (e) {
          err = e.message;
        }
        const p = g.player;
        return { ok, err, mode: g.mode, player: p ? [p.position.x, p.position.z].map((v) => (Number.isFinite(v) ? Math.round(v) : String(v))) : null, cash: g.state?.cash, hour: g.clock.hour };
      }, c);
      await waitGame(h, 0.8, 15000);
      h.log('corrupt', c.slice(0, 40), JSON.stringify(r));
    }
    await h.game((g) => {
      if (g.mode === 'play') g.quitToTitle();
      g.menu.quickStart({ side: 'bloods', name: 'After' });
    });
    await waitGame(h, 1);
  }
  h.log('nan-end', await h.game(nanCheck));
}
