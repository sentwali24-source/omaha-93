// JUMP / SIGN / look-drag response by touch (landscape). Run with --mobile.
import { fingers, center, gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await page.setViewportSize({ width: 844, height: 390 });
  const F = await fingers(page);
  await gameWait(page, 2);
  await h.game((g) => { window.__signs = 0; g.events.on('player:sign', () => window.__signs++); window.__air = 0; window.__airT = setInterval(() => { if (!g.player.grounded) window.__air++; }, 30); });
  h.log('grounded before', await h.game((g) => ({ gr: g.player.grounded, y: g.player.position.y, vy: g.player.vy ?? g.player.velY })));
  const j = await center(page, '.tb-jump');
  await F.tap(j[0], j[1], 1, 120);
  await gameWait(page, 1);
  h.log('grounded 1s after jump', await h.game((g) => ({ gr: g.player.grounded, y: g.player.position.y, air: window.__air })));
  const s = await center(page, '.tb-sign');
  await F.tap(s[0], s[1], 2, 120);
  await gameWait(page, 1);
  const y0 = await h.game((g) => g.cameraRig.yaw);
  await F.down(3, 500, 200);
  for (let i = 1; i <= 10; i++) { await F.move(3, 500 + i * 30, 200); await h.wait(40); }
  await F.up(3);
  await gameWait(page, 0.3);
  const y1 = await h.game((g) => g.cameraRig.yaw);
  const r = await h.game(() => ({ air: window.__air, signs: window.__signs }));
  h.log('jump air samples', r.air, 'signs', r.signs, 'yaw change for 300px drag (deg)', ((y1 - y0) * 180 / Math.PI).toFixed(1));
  h.assert(r.air > 0, 'JUMP leaves the ground');
  h.assert(r.signs > 0, 'SIGN throws up the set');
}
