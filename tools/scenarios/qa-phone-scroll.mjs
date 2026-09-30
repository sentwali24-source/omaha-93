// Touch scrolling of the long menu lists (controls, settings) and the shop body on a landscape phone.
import { fingers, center, gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await page.setViewportSize({ width: 844, height: 390 });
  const F = await fingers(page);
  await gameWait(page, 1.5);
  const drag = async (sel, id) => {
    const c = await center(page, sel);
    if (!c) return 'no ' + sel;
    const before = await page.evaluate((s) => document.querySelector(s).scrollTop, sel);
    await F.down(id, c[0], c[1] + 40);
    for (let i = 1; i <= 8; i++) { await F.move(id, c[0], c[1] + 40 - i * 12); await h.wait(30); }
    await F.up(id);
    await h.wait(700);
    const after = await page.evaluate((s) => document.querySelector(s).scrollTop, sel);
    return `${sel}: ${before} -> ${after}`;
  };
  await h.game((g) => g.menu.showPause());
  await h.wait(700);
  await page.tap('[data-key="controls"]');
  await h.wait(1000);
  h.log(await drag('.m-ctl-panel', 1));
  await page.tap('[data-key="back"]').catch(() => {});
  await h.wait(800);
  await page.tap('[data-key="settings"]');
  await h.wait(1000);
  const scrollSel = await page.evaluate(() => { const e = [...document.querySelectorAll('.m-scroll, [class*="panel"]')].find((q) => q.offsetParent && q.scrollHeight > q.clientHeight + 4); return e ? '.' + [...e.classList].join('.') : null; });
  if (scrollSel) h.log(await drag(scrollSel, 2));
  await h.game((g) => g.menu.hidePause());
  await h.wait(700);
  await h.game((g) => { g.missions._pageIn = 9999; const id = g.debugApi.shops.goto('clothes'); g.debugApi.shops.use(id); });
  await h.wait(1500);
  h.log(await drag('.shop-body', 3));
}
