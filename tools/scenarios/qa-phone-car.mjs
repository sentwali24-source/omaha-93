// Phone driving with touch (landscape): a car on the road via the CAR button, gas / steer / reverse
// with the stick, BRAKE; then the shop panel and the settings slider by touch. Run with --mobile.
import { fingers, center, gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await page.setViewportSize({ width: 844, height: 390 });
  const F = await fingers(page);
  const vp = page.viewportSize();
  await gameWait(page, 2);
  const sx = 120, sy = vp.height - 110;
  // a car parked on the lane next to us: spawn one and walk to its door
  const car = await h.game((g) => {
    const v = null;
    const p = g.player.position;
    const q = g.vehiclesNear(p.x, p.z, 200, (c) => !c.driver && !c.isPolice).sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
    if (!q) return null;
    g.debugApi.teleport(q.position.x - Math.cos(q.heading) * 2.2, q.position.z + Math.sin(q.heading) * 2.2);
    return { x: +q.position.x.toFixed(1), z: +q.position.z.toFixed(1), heading: +q.heading.toFixed(2), model: q.model, spawned: !!v };
  });
  h.log('car', JSON.stringify(car));
  await gameWait(page, 1);
  const cb = await center(page, '.tb-car');
  await F.tap(cb[0], cb[1], 1, 100);
  await page.waitForFunction(() => !!window.__game.player.vehicle, null, { timeout: 20000 }).catch(() => {});
  await gameWait(page, 1.5);
  const cs = () => h.game((g) => { const v = g.player.vehicle; return v ? { speed: +(v.speed ?? 0).toFixed(2), x: +v.position.x.toFixed(1), z: +v.position.z.toFixed(1), hd: +v.heading.toFixed(2), ctl: { t: +v.controls.throttle.toFixed(2), s: +v.controls.steer.toFixed(2), b: +(v.controls.brake || 0).toFixed(2), hb: v.controls.handbrake } } : null; });
  h.log('in', JSON.stringify(await cs()));
  // reverse first (a parked car can have its nose against something), then forward
  await F.down(2, sx, sy);
  await F.move(2, sx, sy + 60);
  await gameWait(page, 2.5, 90000);
  h.log('reverse', JSON.stringify(await cs()));
  await F.move(2, sx, sy - 60);
  await gameWait(page, 3, 90000);
  h.log('forward', JSON.stringify(await cs()));
  await F.move(2, sx + 55, sy - 50);
  await gameWait(page, 1.5);
  h.log('steer right', JSON.stringify(await cs()));
  await h.shot('70-drive');
  const bk = await center(page, '.tb-brake');
  await F.down(3, bk[0], bk[1]);
  await gameWait(page, 1.5);
  h.log('brake+gas', JSON.stringify(await cs()));
  await F.up(3);
  await F.up(2);
  await gameWait(page, 1.5);
  h.log('coast', JSON.stringify(await cs()));
  // exit
  const ex = await center(page, '.tb-car');
  await F.tap(ex[0], ex[1], 4, 100);
  await page.waitForFunction(() => !window.__game.player.vehicle, null, { timeout: 20000 }).catch(() => {});
  await gameWait(page, 1);
  // shop panel in landscape
  const shop = await h.game((g) => { g.missions._pageIn = 9999; const id = g.debugApi.shops?.goto?.('food'); if (id) g.debugApi.shops.use(id); return id; });
  await gameWait(page, 0.2);
  await h.wait(1200);
  const sp = await page.evaluate(() => { const e = document.querySelector('.shop-panel, .shop-root, .shop'); if (!e) return null; const r = e.getBoundingClientRect(); const tb = getComputedStyle(document.querySelector('.touch-root')).visibility; return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), sh: e.scrollHeight, ch: e.clientHeight, touchRoot: tb }; });
  h.log('shop', shop, JSON.stringify(sp));
  await h.shot('71-land-shop');
  const leave = await page.evaluate(() => { const b = [...document.querySelectorAll('.shop-btn, button')].find((q) => q.offsetParent && /leave|close/i.test(q.textContent + (q.getAttribute('aria-label') || ''))); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  if (leave) { await F.tap(leave[0], leave[1], 5, 100); await h.wait(800); }
  h.log('shop closed', JSON.stringify(await h.game((g) => ({ panel: g.debugApi.shops?.panelOpen?.(), input: g.input.enabled }))));
  // settings: drag the touch size slider
  await h.game((g) => g.menu.showPause());
  await h.wait(800);
  const st = await center(page, '[data-key="settings"]');
  await F.tap(st[0], st[1], 6, 100);
  await h.wait(1200);
  await page.evaluate(() => document.querySelector('[data-key="touchScale"]')?.scrollIntoView({ block: 'center' }));
  await h.wait(400);
  const sl = await center(page, '[data-key="touchScale"]');
  const v0 = await h.game((g) => g.settings.touchScale);
  if (sl) {
    await F.down(7, sl[0] - sl[2] * 0.3, sl[1]);
    for (let i = 1; i <= 6; i++) await F.move(7, sl[0] - sl[2] * 0.3 + i * sl[2] * 0.1, sl[1]);
    await F.up(7);
  }
  await h.wait(600);
  const v1 = await h.game((g) => g.settings.touchScale);
  h.log('touchScale drag', v0, '->', v1, JSON.stringify(sl));
  await h.shot('72-land-settings');
}
