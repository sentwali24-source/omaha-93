// Monkey test (fast-forward): random virtual stick + random action presses/holds for many in-game
// minutes, random sidewalk teleports, heat spikes; menus / shop panels opened by accident are closed
// again. Any system that throws is re-armed so every distinct error gets logged.
//   MONKEY_FRAMES=12000 node tools/smoke.mjs ... --script tools/scenarios/qa-monkey.mjs
export default async function (page, h) {
  const total = Number(process.env.MONKEY_FRAMES || 12000);
  const res = await h.game(
    (g, total) => {
      const actions = ['attack', 'jump', 'sprint', 'vehicle', 'interact', 'sign', 'homies', 'horn', 'radio', 'camera'];
      const errs = [];
      const origErr = console.error;
      console.error = (...a) => {
        errs.push(a.map((x) => (x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ').slice(0, 400));
        origErr.apply(console, a);
      };
      const r = g.renderer.render;
      g.renderer.render = () => {};
      const stats = { teleports: 0, shopsClosed: 0, pauses: 0, inCar: 0, kos: 0, busts: 0, missions: 0 };
      g.events.on('player:down', (e) => (e.reason === 'busted' ? stats.busts++ : stats.kos++));
      g.events.on('mission:start', () => stats.missions++);
      const held = new Set();
      try {
        for (let i = 0; i < total; i++) {
          if (i % 20 === 0) {
            g.input.setVirtualMove(Math.random() * 2 - 1, Math.random() < 0.7 ? Math.random() : -Math.random());
            for (const a of held) g.input.setVirtualButton(a, false);
            held.clear();
            const n = Math.floor(Math.random() * 3);
            for (let k = 0; k < n; k++) {
              const a = actions[Math.floor(Math.random() * actions.length)];
              if (Math.random() < 0.5) g.input.tap(a);
              else {
                g.input.setVirtualButton(a, true);
                held.add(a);
              }
            }
            g.input.addLook((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 20);
          }
          if (i % 600 === 300 && g.mode === 'play' && !g.player.vehicle) {
            const p = g.layout.randomSidewalkPoint(Math.random);
            if (p) {
              g.debugApi.teleport(p.x, p.z);
              stats.teleports++;
            }
          }
          if (i % 1500 === 700 && g.mode === 'play') g.debugApi.heat(Math.floor(Math.random() * 5));
          if (i % 2000 === 1000 && g.mode === 'play' && !g.missions.active) {
            const av = g.missions.available();
            if (av.length) g.debugApi.startMission(av[Math.floor(Math.random() * av.length)].id);
          }
          if (g.shops?.panel?.isOpen) {
            g.shops.panel.close(false, true);
            stats.shopsClosed++;
          }
          if (g.mapScreen?.open) g.mapScreen.close();
          if (g.paused || g.menu.pauseOpen) {
            g.menu.hidePause();
            stats.pauses++;
          }
          if (!g.input.enabled && g.mode === 'play') g.input.enabled = true;
          if (g.player?.vehicle) stats.inCar++;
          g._last = performance.now() - 50;
          g._frame();
          g.camera.updateMatrixWorld();
          for (const k in g.systems) if (g.systems[k]) g.systems[k]._errored = false;
        }
      } finally {
        g.renderer.render = r;
        console.error = origErr;
        for (const a of held) g.input.setVirtualButton(a, false);
        g.input.setVirtualMove(0, 0);
      }
      const nan = g.actors.filter((a) => !Number.isFinite(a.position.x + a.position.z)).length + g.vehicles.filter((v) => !Number.isFinite(v.position.x + v.position.z + v.speed)).length;
      return { stats, nan, errs: [...new Set(errs)].slice(0, 20), t: Math.round(g.time.elapsed), actors: g.actors.length, vehicles: g.vehicles.length, cash: g.state.cash, mode: g.mode };
    },
    total,
  );
  h.log('monkey', JSON.stringify(res, null, 1));
  h.assert(!res.errs.length, 'errors during monkey run');
  await h.wait(1500);
  await h.shot('monkey-end');
}
