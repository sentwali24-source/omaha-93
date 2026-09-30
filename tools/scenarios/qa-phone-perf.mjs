// Phone perf on 'low' (run with --mobile): draw calls / triangles at the busy spots, landscape,
// a few camera yaws each, then a police chase downtown. LAND=0 → portrait.
import { gameWait } from './qa-phone-util.mjs';
const SPOTS = [
  ['24th-lake-day', 150, -560, 13],
  ['24th-lake-night', 150, -560, 21.5],
  ['downtown-day', 370, 115, 13],
  ['downtown-night', 370, 115, 21.5],
  ['oldmarket-night', 515, 232, 21.5],
];
export default async function (page, h) {
  if (process.env.LAND !== '0') await page.setViewportSize({ width: 844, height: 390 });
  await gameWait(page, 2);
  const sample = async () => {
    const r = [];
    for (let i = 0; i < 4; i++) {
      await h.game((g, i) => { g.cameraRig.yaw = (i * Math.PI) / 2; }, i);
      await gameWait(page, 0.6);
      r.push(await h.game((g) => { const i = g.renderer.info.render; return { calls: i.calls, tris: i.triangles, perfCalls: g.perf.calls, fps: g.perf.fps }; }));
    }
    return { maxCalls: Math.max(...r.map((q) => q.calls)), avgCalls: Math.round(r.reduce((a, q) => a + q.calls, 0) / r.length), maxTris: Math.max(...r.map((q) => q.tris)), fps: r.map((q) => q.fps).join('/') };
  };
  for (const [name, x, z, hour] of SPOTS) {
    await h.game((g, a) => { g.debugApi.teleport(a.x, a.z); g.debugApi.setHour(a.hour); }, { x, z, hour });
    await gameWait(page, 3, 90000);
    const s = await sample();
    const c = await h.game((g) => g.debugApi.counts());
    h.log('perf', name, JSON.stringify(s), JSON.stringify(c));
    await h.shot(`p-${name}`);
  }
  // police chase downtown: heat 3, player driving
  await h.game((g) => { g.debugApi.teleport(420, 60); g.debugApi.setHour(21.5); });
  await gameWait(page, 1);
  const drove = await h.game((g) => { try { g.debugApi.driveCar?.('sedan'); return !!g.player.vehicle; } catch (e) { return String(e); } });
  await h.game((g) => g.debugApi.heat(3));
  await gameWait(page, 8, 120000);
  const pol = await h.game((g) => g.debugApi.police?.());
  const s = await sample();
  h.log('perf chase', 'drove', drove, JSON.stringify(s), JSON.stringify(await h.game((g) => g.debugApi.counts())), JSON.stringify(pol).slice(0, 300));
  await h.shot('p-chase');
  const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null));
  h.log('mem MB', mem, JSON.stringify(await h.game((g) => g.renderer.info.memory)), 'programs', await h.game((g) => g.renderer.info.programs?.length));
}
