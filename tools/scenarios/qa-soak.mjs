// Stability soak: teleports across districts, heat on/off, missions started/aborted, cars
// entered/exited, quit to title and back twice. Tracks GPU memory (geometries/textures),
// actors, vehicles, scene children, event handlers, interactions and JS heap for leaks.
import { waitGame } from './player-util.mjs';

const STOPS = [
  [150, -560], // N 24th & Lake
  [370, 115], // downtown
  [515, 232], // Old Market
  [-40, -520], // 30th
  [200, -300],
  [690, 80], // river
];

async function metrics(h, cdp) {
  const m = await h.game((g) => {
    let deep = 0;
    g.scene.traverse(() => deep++);
    const handlers = {};
    let total = 0;
    for (const [k, l] of g.events.handlers) {
      handlers[k] = l.length;
      total += l.length;
    }
    return {
      mode: g.mode,
      t: +g.time.elapsed.toFixed(0),
      geo: g.renderer.info.memory.geometries,
      tex: g.renderer.info.memory.textures,
      progs: g.renderer.info.programs?.length,
      actors: g.actors.length,
      vehicles: g.vehicles.length,
      children: g.scene.children.length,
      deep,
      handlers: total,
      handlerMap: handlers,
      interactions: g.interactions.items.size,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      calls: g.perf.calls,
      tris: g.perf.triangles,
      markers: g.hud?.markers?.size,
      nan: g.actors.filter((a) => !Number.isFinite(a.position.x + a.position.z)).length + g.vehicles.filter((v) => !Number.isFinite(v.position.x + v.position.z + v.speed)).length,
      uiNodes: document.getElementById('ui-root')?.getElementsByTagName('*').length,
    };
  });
  if (cdp) {
    try {
      const hu = await cdp.send('Runtime.getHeapUsage');
      m.heapMB = Math.round(hu.usedSize / 1e6);
      const w = await cdp.send('Runtime.evaluate', { expression: 'window' });
      const d = await cdp.send('Runtime.evaluate', { expression: 'document' });
      const lw = await cdp.send('DOMDebugger.getEventListeners', { objectId: w.result.objectId });
      const ld = await cdp.send('DOMDebugger.getEventListeners', { objectId: d.result.objectId });
      m.winListeners = lw.listeners.length;
      m.docListeners = ld.listeners.length;
    } catch (e) {
      m.cdpErr = e.message;
    }
  }
  return m;
}

function brief(m) {
  const { handlerMap, ...rest } = m;
  return JSON.stringify(rest);
}

export default async function (page, h) {
  let cdp = null;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    /* ignore */
  }
  const cycles = Number(process.env.SOAK_CYCLES || 2);
  const games = Number(process.env.SOAK_GAMES || 3);
  const snaps = [];
  await waitGame(h, 3);
  let base = await metrics(h, cdp);
  h.log('BASE', brief(base));
  snaps.push(base);
  for (let gi = 0; gi < games; gi++) {
    for (let c = 0; c < cycles; c++) {
      for (let s = 0; s < STOPS.length; s++) {
        const [x, z] = STOPS[s];
        await h.game((g, a) => g.debugApi.teleport(a.x, a.z), { x, z });
        await waitGame(h, 2.5, 20000);
        if (s === 1) await h.game((g) => g.debugApi.heat(3));
        if (s === 3) await h.game((g) => g.debugApi.heat(0));
        if (s === 2) {
          const r = await h.game((g) => {
            const av = g.missions.available();
            const m = av.find((x) => x && !x.locked) || av[0];
            const ok = m ? g.debugApi.startMission(m.id) : false;
            return { ok: !!ok, id: m?.id };
          });
          await waitGame(h, 1.5, 15000);
          await h.game((g) => g.missions.abort());
          h.log('mission', JSON.stringify(r));
        }
        if (s === 4) {
          await h.game((g) => g.debugApi.driveCar('sedan'));
          await h.hold('KeyW', 1500);
          await h.game((g) => g.player.vehicle && g.player.exitVehicle(true));
        }
      }
      const m = await metrics(h, cdp);
      h.log(`game${gi} cycle${c}`, brief(m));
      snaps.push(m);
    }
    if (gi < games - 1) {
      await h.game((g) => g.quitToTitle());
      await h.wait(2500);
      const t = await metrics(h, cdp);
      h.log(`title${gi}`, brief(t));
      await h.game((g) => g.menu.quickStart({ side: 'bloods', setId: null, name: 'Soak' }));
      await waitGame(h, 3);
      const n = await metrics(h, cdp);
      h.log(`newgame${gi + 1}`, brief(n));
      snaps.push(n);
    }
  }
  const last = snaps[snaps.length - 1];
  const diff = {};
  for (const k of Object.keys(last.handlerMap)) {
    const d = last.handlerMap[k] - (base.handlerMap[k] || 0);
    if (d) diff[k] = d;
  }
  h.log('HANDLER DIFF', JSON.stringify(diff));
  await h.shot('soak-end');
}
