// Touch HOMIES button (follow / wait) and the big touchScale layout. Run with --mobile.
import { fingers, center, gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  const F = await fingers(page);
  await gameWait(page, 2);
  const vis0 = await page.evaluate(() => getComputedStyle(document.querySelector('.tb-homies')).display);
  h.log('homies btn without homies', vis0);
  h.assert(vis0 === 'none', 'HOMIES hidden without homies');
  // recruit one of the hood crew
  const rec = await h.game((g) => {
    const p = g.player.position;
    const a = g.gangs.members.filter((m) => m.alive && m.faction === g.state.player.setId && !g.gangs.homies.includes(m)).sort((x, y) => x.position.distanceTo(p) - y.position.distanceTo(p))[0];
    if (!a) return null;
    g.gangs.recruit(a);
    return { id: a.id, n: g.gangs.homies.length };
  });
  await gameWait(page, 1);
  h.log('recruited', JSON.stringify(rec));
  const box = async () => page.evaluate(() => { const r = document.querySelector('.tb-homies').getBoundingClientRect(); return { d: getComputedStyle(document.querySelector('.tb-homies')).display, l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  h.log('portrait homies btn', JSON.stringify(await box()));
  await h.shot('60-port-homies');
  const b = await center(page, '.tb-homies');
  await F.tap(b[0], b[1], 1, 100);
  await gameWait(page, 0.6);
  const m1 = await h.game((g) => g.gangs.homieMode);
  await F.tap(b[0], b[1], 2, 100);
  await gameWait(page, 0.6);
  const m2 = await h.game((g) => g.gangs.homieMode);
  h.log('mode after taps', m1, m2);
  h.assert(m1 === 'wait' && m2 === 'follow', 'HOMIES toggles wait / follow');
  // landscape
  await page.setViewportSize({ width: 844, height: 390 });
  await gameWait(page, 1);
  h.log('landscape homies btn', JSON.stringify(await box()), 'map', JSON.stringify(await center(page, '.tb-map')), 'car', JSON.stringify(await center(page, '.tb-car')));
  await h.shot('61-land-homies');
  // biggest touch size
  await h.game((g) => g.setSettings ? g.setSettings({ touchScale: 1.6 }) : g.applySettings?.({ touchScale: 1.6 }));
  await gameWait(page, 1);
  const rects = await page.evaluate(() => {
    const out = {};
    for (const s of ['.tb-car', '.tb-action', '.tb-sign', '.tb-homies', '.tb-map', '.tb-pause', '.hud-stats', '.hud-minimap', '.hud-location']) { const e = document.querySelector(s); if (!e) continue; const r = e.getBoundingClientRect(); out[s] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }
    return out;
  });
  h.log('ts1.6 rects', JSON.stringify(rects), 'ts', await h.game((g) => g.touch._ts));
  await h.shot('62-land-ts16');
}
