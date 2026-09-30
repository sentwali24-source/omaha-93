// Radio station name after a RADIO tap in a car, landscape + portrait (overlap with EXIT / stats).
import { fingers, center, gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  const F = await fingers(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await gameWait(page, 1.5);
  await h.game((g) => g.debugApi.driveCar?.('sedan'));
  await gameWait(page, 1.5);
  for (const [w, hh, tag] of [[844, 390, 'land'], [390, 664, 'port']]) {
    await page.setViewportSize({ width: w, height: hh });
    await gameWait(page, 0.8);
    const r = await center(page, '.tb-radio');
    await F.tap(r[0], r[1], 1, 100);
    await gameWait(page, 0.5);
    const rects = await page.evaluate(() => {
      const out = {};
      for (const s of ['.hud-radio', '.hud-stats', '.tb-car', '.tb-pause', '.tb-map', '.hud-speedo', '.hud-objective', '.hud-location']) { const e = document.querySelector(s); if (!e) continue; const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); out[s] = [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom), cs.opacity, cs.display === 'none' ? 'none' : '']; }
      return out;
    });
    h.log(tag, JSON.stringify(rects));
    await h.shot(`98-radio-${tag}`);
  }
}
