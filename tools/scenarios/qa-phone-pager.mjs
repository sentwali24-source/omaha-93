// Pager on a landscape phone: readable size, no overlap with objective / stats. Run with --mobile.
import { gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await page.setViewportSize({ width: 844, height: 390 });
  await gameWait(page, 2);
  const id = await h.game((g) => g.debugApi.missions.page());
  await page.waitForSelector('.hud-pager.show', { timeout: 30000 }).catch(() => h.log('pager never showed'));
  await h.wait(1200);
  const r = await page.evaluate(() => {
    const out = {};
    for (const s of ['.hud-pager', '.hud-objective', '.hud-stats', '.hud-minimap', '.tb-pause', '.tb-map']) { const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect(); out[s] = [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }
    const txt = [...document.querySelectorAll('.hud-pager *')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => [e.textContent.trim().slice(0, 30), Math.round(parseFloat(getComputedStyle(e).fontSize) * (e.getBoundingClientRect().height / (e.offsetHeight || 1)))]);
    return { out, txt };
  });
  h.log('pager', id, JSON.stringify(r));
  await h.shot('97-land-pager');
}
