// Menus/map tapped while another finger still rests on the screen (thumb left on the stick).
import { fingers, center, gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  if (process.env.LAND !== '0') await page.setViewportSize({ width: 844, height: 390 });
  const F = await fingers(page);
  const vp = page.viewportSize();
  await gameWait(page, 1.5);
  const sx = 120, sy = vp.height - 110;
  const ev = [];
  await page.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'pointerup', 'click']) window.addEventListener(t, (e) => window.__ev.push(`${t}:${e.pointerId ?? ''}:${e.target.className?.baseVal ?? e.target.className}`.slice(0, 60)), true); });
  // A: map close with a resting thumb
  await F.down(1, sx, sy); await F.move(1, sx, sy - 60);
  const mapB = await center(page, '.tb-map');
  await F.tap(mapB[0], mapB[1], 2);
  await h.wait(900);
  const close = await center(page, '.map-close');
  await F.tap(close[0], close[1], 3, 90);
  await h.wait(900);
  const a = await h.game((g) => ({ open: g.mapScreen.open, ev: window.__ev.splice(0) }));
  h.log('A map close w/ resting thumb', JSON.stringify(a));
  await F.up(1);
  await h.wait(300);
  if (a.open) await F.tap(close[0], close[1], 4, 90);
  await h.wait(900);
  const b = await h.game((g) => ({ open: g.mapScreen.open, ev: window.__ev.splice(0) }));
  h.log('B map close, no other finger', JSON.stringify(b));
  // C: pause → resume with a resting thumb
  await F.down(5, sx, sy); await F.move(5, sx, sy - 60);
  const pz = await center(page, '.tb-pause');
  await F.tap(pz[0], pz[1], 6);
  await h.wait(1200);
  const items = await page.evaluate(() => [...document.querySelectorAll('[data-key]')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.key, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }));
  h.log('pause items', JSON.stringify(items));
  await h.shot('50-pause');
  const res = items.find((q) => /resume/.test(q[0]));
  if (res) await F.tap(res[1], res[2], 7, 90);
  await h.wait(1200);
  const c = await h.game((g) => ({ paused: g.paused, ev: window.__ev.splice(0) }));
  h.log('C resume w/ resting thumb', JSON.stringify(c));
  await F.upAll();
  await h.wait(300);
  if (c.paused && res) { await F.tap(res[1], res[2], 8, 90); await h.wait(1000); h.log('C2 resume, no other finger', JSON.stringify(await h.game((g) => ({ paused: g.paused, ev: window.__ev.splice(0) })))); }
}
