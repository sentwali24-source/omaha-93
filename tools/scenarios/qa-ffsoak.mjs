// Fast-forward stability soak: steps the real game loop (Game._frame, dt = 50 ms) inside the page
// with rendering skipped, so many in-game minutes of AI / physics / missions / respawns run in a
// few real minutes even on software WebGL. Between segments it teleports across districts, toggles
// heat, starts / aborts missions, drives, fights, gets KO'd / busted, quits to the title and starts
// new games, and records entity / scene / listener / heap counts to spot leaks and NaN.
//   FF_SEGMENTS=24 FF_FRAMES=600 node tools/smoke.mjs ... --script tools/scenarios/qa-ffsoak.mjs
const STOPS = [
  [150, -560], // N 24th & Lake
  [370, 115], // downtown
  [515, 232], // Old Market
  [-40, -520], // N 30th
  [200, -300],
  [690, 80], // riverfront
  [60, -150],
];

async function install(h) {
  await h.game((g) => {
    window.__ff = (frames) => {
      const r = g.renderer.render;
      g.renderer.render = () => {};
      const t0 = performance.now();
      try {
        for (let i = 0; i < frames; i++) {
          g._last = performance.now() - 50;
          g._frame();
          g.camera.updateMatrixWorld();
        }
      } finally {
        g.renderer.render = r;
      }
      return Math.round(performance.now() - t0);
    };
    window.__metrics = () => {
      let deep = 0;
      g.scene.traverse(() => deep++);
      let handlers = 0;
      for (const l of g.events.handlers.values()) handlers += l.length;
      const nan =
        g.actors.filter((a) => !Number.isFinite(a.position.x + a.position.z + a.position.y)).length +
        g.vehicles.filter((v) => !Number.isFinite(v.position.x + v.position.z + v.speed + v.heading)).length;
      const cs = g.debugApi.characterStats?.() || {};
      return {
        mode: g.mode,
        t: Math.round(g.time.elapsed),
        hour: +g.clock.hour.toFixed(1),
        actors: g.actors.length,
        removedInActors: g.actors.filter((a) => a.state === 'removed').length,
        vehicles: g.vehicles.length,
        disposedInVehicles: g.vehicles.filter((v) => v.disposed).length,
        cars: g.traffic.cars.length,
        parked: g.traffic.parked.length,
        aband: g.traffic.abandoned.length,
        peds: g.pedestrians.peds.length,
        gang: g.gangs.members.length,
        homies: g.gangs.homies.length,
        cops: g.police.cops.length,
        units: g.police.units.length,
        children: g.scene.children.length,
        deep,
        handlers,
        ia: g.interactions.items.size,
        markers: g.hud.markers.size,
        charLive: cs.live,
        charGeo: cs.geometries,
        geo: g.renderer.info.memory.geometries,
        tex: g.renderer.info.memory.textures,
        nan,
        heat: g.police.heat,
        mission: g.missions.active?.id || null,
        cash: g.state?.cash,
      };
    };
  });
}

export default async function (page, h) {
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const u = await cdp.send('Runtime.getHeapUsage');
    return Math.round(u.usedSize / 1e5) / 10;
  };
  const segs = Number(process.env.FF_SEGMENTS || 24);
  const frames = Number(process.env.FF_FRAMES || 600);
  await install(h);
  const ff = (n) => h.game((g, n) => window.__ff(n), n);
  const M = () => h.game(() => window.__metrics());
  const log = async (label) => {
    const m = await M();
    m.heapMB = await heap();
    h.log(label, JSON.stringify(m));
    return m;
  };
  const ms = await ff(40);
  h.log('probe 40 frames ms', ms);
  const base = await log('BASE');
  const story = ['story1', 'story2', 'story3', 'story4', 'story5', 'story6', 'story7', 'story8', 'story9', 'story10'];
  let games = 0;
  for (let s = 0; s < segs; s++) {
    const [x, z] = STOPS[s % STOPS.length];
    const act = s % 6;
    const info = await h.game(
      (g, a) => {
        const out = {};
        if (g.mode !== 'play') return { skipped: true };
        g.input.setVirtualMove(0, 0);
        if (g.player.vehicle) g.player.exitVehicle(true);
        if (g.missions.active) g.missions.abort();
        g.debugApi.teleport(a.x, a.z);
        if (a.act === 0) {
          out.mission = a.mission;
          out.ok = g.debugApi.startMission(a.mission);
          g.debugApi.heat(0);
        } else if (a.act === 1) {
          // drive around with 3 stars
          g.debugApi.driveCar(['sedan', 'lowrider', 'pickup', 'coupe'][a.s % 4]);
          g.debugApi.heat(3);
          g.input.setVirtualMove(0.25, 1);
        } else if (a.act === 2) {
          // rival crew next to the player: brawl
          const rivals = g.state.player.side === 'crips' ? ['lvb', 'nfp', 'wbb'] : ['psc', 'ngc', 'rlc'];
          const enemy = rivals[a.s % 3];
          out.enemy = enemy;
          try {
            out.spawned = g.debugApi.spawnGang(enemy, a.x + 3, a.z + 2, 3, 'fighter').length;
          } catch (e) {
            out.err = e.message;
          }
          g.debugApi.heat(0);
        } else if (a.act === 3) {
          // cops on foot at 2 stars around a standing player
          g.debugApi.heat(2);
          try {
            g.debugApi.spawnCop(a.x + 4, a.z + 3, 'foot');
          } catch (e) {
            out.err = e.message;
          }
        } else if (a.act === 4) {
          // homies ride along
          const setId = g.state.player.setId;
          const ids = g.debugApi.spawnGang(setId, a.x + 2, a.z + 2, 2, 'hang');
          for (const m of g.actors) if (ids.includes(m.id)) g.gangs.recruit(m);
          g.debugApi.driveCar('wagon');
          g.input.setVirtualMove(-0.2, 0.8);
          g.debugApi.heat(0);
        } else {
          g.debugApi.heat(0);
          g.debugApi.setHour((a.s * 3.7) % 24);
          g.environment.setWeather?.(['rain', 'clear', 'thunderstorm', 'overcast'][a.s % 4]);
        }
        return out;
      },
      { x, z, act, s, mission: story[Math.floor(s / 6) % story.length] },
    );
    // punch continuously during the brawl segment
    if (act === 2) {
      for (let k = 0; k < 6; k++) {
        await h.game((g) => {
          g.input.tap('attack');
        });
        await ff(Math.floor(frames / 6));
      }
    } else {
      await ff(frames);
    }
    if (act === 0) await h.game((g) => g.debugApi.completeObjective?.());
    const m = await log(`seg${s} act${act} ${JSON.stringify(info)}`);
    if (m.nan) h.assert(false, `NaN positions in seg ${s}`);
    // quit to title / new game / continue every 8 segments
    if (s % 8 === 7) {
      games++;
      await h.game((g) => g.quitToTitle());
      await ff(200);
      await log(`title${games}`);
      await h.game((g, n) => (n % 2 ? g.continueGame() : g.menu.quickStart({ side: n % 4 ? 'bloods' : 'crips', name: 'Soak' + n })), games);
      await ff(100);
      await log(`game${games}`);
    }
  }
  await h.game((g) => g.input.setVirtualMove(0, 0));
  await h.wait(1500);
  const end = await log('END');
  h.log('DELTA', JSON.stringify({ handlers: end.handlers - base.handlers, ia: end.ia - base.ia, children: end.children - base.children, heap: +(end.heapMB - base.heapMB).toFixed(1) }));
  await h.shot('ffsoak-end');
}
