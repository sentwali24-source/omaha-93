// Controls screen (touch tab) from the pause menu, landscape + portrait. Run with --mobile.
import { gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await page.setViewportSize({ width: 844, height: 390 });
  await gameWait(page, 1);
  await h.game((g) => g.menu.showPause());
  await h.wait(800);
  await page.tap('[data-key="controls"]');
  await h.wait(1200);
  await h.shot('95-land-controls');
  const rows = await page.evaluate(() => { const s = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.offsetParent); return s ? { sh: s.scrollHeight, ch: s.clientHeight, cls: String(s.className) } : null; });
  h.log('controls scroller', JSON.stringify(rows), 'active tab', await page.evaluate(() => document.querySelector('.m-tab[aria-selected="true"]')?.textContent));
  await page.setViewportSize({ width: 390, height: 664 });
  await h.wait(1200);
  await h.shot('96-port-controls');
}
