// Portrait play: the rotate hint shows (after a pause/resume, as autostart skips the menu flow)
// and hides by itself after ~10 s. Run with --mobile.
import { gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await gameWait(page, 1);
  await h.game((g) => { g.menu.showPause(); });
  await h.wait(500);
  await h.game((g) => { g.menu.hidePause(); });
  await h.wait(800);
  h.log('cond', JSON.stringify(await h.game((g) => ({ mode: g.mode, paused: g.paused, ctx: g.menu.context, touch: g.input.isTouch, w: innerWidth, h: innerHeight, dis: g.menu._rotateDismissed }))));
  const rot0 = await page.evaluate(() => !document.querySelector('.m-rotate').hidden);
  await gameWait(page, 11, 240000);
  const rot1 = await page.evaluate(() => !document.querySelector('.m-rotate').hidden);
  h.log('rotate hint', rot0, '->', rot1, 'flag', await page.evaluate(() => Object.keys(localStorage).filter((k) => /rotate/i.test(k))));
  h.assert(rot0 && !rot1, 'rotate hint shows, then hides by itself');
}
