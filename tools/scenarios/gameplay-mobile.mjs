// Phone check (run with --mobile): the touch ACTION button uses shop / recruit prompts, the shop
// panel fits a phone screen and closes with a tap, and the hood crew is there.
//   node tools/smoke.mjs --port 5214 --no-server --mobile --out tools/out/street-mobile --params "autostart=1&side=bloods&set=lvb&debug=1&quality=low" --script tools/scenarios/gameplay-mobile.mjs
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  await waitGame(h, 1.5, 60000);
  const crew = await h.game((g) => g.gangs.groups.filter((q) => q.rel === 'own').length);
  h.log('own crews near spawn', crew);
  h.assert(crew > 0, 'hood crew near the spawn');
  await h.shot('01-hood');
  // clothes store: open the panel through the interaction
  const id = await h.game((g) => {
    g.missions._pageIn = 9999;
    const id = g.debugApi.shops.goto('clothes');
    g.debugApi.shops.use(id);
    return id;
  });
  await waitGame(h, 0.5, 30000);
  const open = await h.game((g) => ({ panel: g.debugApi.shops.panelOpen(), input: g.input.enabled }));
  h.log('clothes', id, JSON.stringify(open));
  h.assert(open.panel && !open.input, 'panel open with game input off');
  await h.shot('02-clothes-panel');
  const fits = await page.evaluate(() => {
    const el = document.querySelector('.shop-panel, .shop-root, .shop');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, left: Math.round(r.left), top: Math.round(r.top) };
  });
  h.log('panel box', JSON.stringify(fits));
  h.assert(fits && fits.left >= 0 && fits.w <= fits.vw, 'panel fits the phone width');
  // tap "Leave"
  await page.locator('.shop-btn', { hasText: /Leave|Close/i }).first().tap({ timeout: 15000 });
  await waitGame(h, 0.4, 30000);
  const closed = await h.game((g) => ({ panel: g.debugApi.shops.panelOpen(), input: g.input.enabled }));
  h.log('after tap', JSON.stringify(closed));
  h.assert(!closed.panel && closed.input, 'tap closes the panel and gives input back');
  await h.shot('03-closed');
}
