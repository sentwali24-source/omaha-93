// Landscape phone: clothes shop panel fits and scrolls, mission title card + briefing over the touch
// controls, knocked out while holding the stick + SPRINT → controls come back clean. Run with --mobile.
import { fingers, center, gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await page.setViewportSize({ width: 844, height: 390 });
  const F = await fingers(page);
  const vp = page.viewportSize();
  await gameWait(page, 2);
  const id = await h.game((g) => { g.missions._pageIn = 9999; const id = g.debugApi.shops.goto('clothes'); g.debugApi.shops.use(id); return id; });
  await h.wait(1500);
  const box = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('[class*="shop"]')].filter((e) => e.offsetParent || getComputedStyle(e).position === 'fixed').map((e) => { const r = e.getBoundingClientRect(); return { c: String(e.className).slice(0, 30), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), sh: e.scrollHeight, ch: e.clientHeight, ov: getComputedStyle(e).overflowY }; });
    return cands.filter((q) => q.r - q.l > 200).slice(0, 8);
  });
  h.log('clothes', id, JSON.stringify(box));
  await h.shot('90-land-clothes');
  const btns = await page.evaluate(() => [...document.querySelectorAll('.shop-root button, [class*="shop"] button')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 18), Math.round(r.top), Math.round(r.bottom), Math.round(r.height)]; }));
  h.log('shop buttons', JSON.stringify(btns));
  const leave = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((q) => q.offsetParent && /leave|close|✕/i.test(q.textContent + (q.getAttribute('aria-label') || ''))); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, b.textContent.trim().slice(0, 10)]; });
  h.log('leave', JSON.stringify(leave));
  if (leave) { await F.tap(leave[0], leave[1], 1, 100); await h.wait(900); }
  h.log('closed', JSON.stringify(await h.game((g) => ({ panel: g.debugApi.shops.panelOpen(), input: g.input.enabled, touch: g.touch.visible }))));

  // mission start: title card + briefing dialog
  const av = await h.game((g) => g.debugApi.missions.available().map((m) => m.id || m).slice(0, 5));
  h.log('available', JSON.stringify(av));
  const started = await h.game((g, id) => g.debugApi.startMission(id), av[0]);
  await h.wait(1500);
  await h.shot('91-land-mission-card');
  await gameWait(page, 3);
  await h.shot('92-land-mission-brief');
  h.log('mission', JSON.stringify(await h.game((g) => g.debugApi.missions.active())));

  // KO while holding stick + sprint
  const sx = 120, sy = vp.height - 110;
  const sp = await center(page, '.tb-sprint');
  await F.down(2, sx, sy);
  await F.move(2, sx, sy - 80);
  await F.down(3, sp[0], sp[1]);
  await gameWait(page, 0.5);
  await h.game((g) => { g.player.takeDamage(999, null); });
  await gameWait(page, 1);
  await h.shot('93-land-ko');
  const ko = await h.game((g) => ({ hp: g.player.health, touch: g.touch.visible, held: [...g.input._virtualDown], mv: { ...g.input._virtualMove }, down: g.player.state }));
  h.log('ko', JSON.stringify(ko));
  await F.up(3);
  await F.up(2);
  await page.waitForFunction(() => window.__game.player.health > 0, null, { timeout: 90000 }).catch(() => {});
  await gameWait(page, 2);
  const back = await h.game((g) => ({ hp: g.player.health, touch: g.touch.visible, held: [...g.input._virtualDown], mv: { ...g.input._virtualMove }, stick: !!g.touch._stick }));
  h.log('respawned', JSON.stringify(back));
  h.assert(back.touch && !back.held.length && !back.stick, 'controls back and clean after KO');
  await h.shot('94-land-respawn');
}
