// Safe areas (iPhone 13 notch + home bar) via CDP Emulation.setSafeAreaInsetsOverride. Run with --mobile.
// Checks that interactive UI stays out of the insets in landscape and portrait, in play, map, pause.
import { gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  const cdp = await page.context().newCDPSession(page);
  const setInsets = async (ins) => {
    try {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins });
      return true;
    } catch (e) {
      h.log('no safe-area override:', e.message);
      return false;
    }
  };
  const check = (ins) => page.evaluate((ins) => {
    const vw = innerWidth, vh = innerHeight, out = [];
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:env(safe-area-inset-left);top:env(safe-area-inset-top);right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const pr = probe.getBoundingClientRect();
    probe.remove();
    for (const e of document.querySelectorAll('button, .tb, .hud-minimap, .hud-stats, .hud-location, .hud-objective, .map-close, .m-item, .hud-speedo')) {
      const cs = getComputedStyle(e);
      if (!e.offsetParent && cs.position !== 'fixed') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > vh) continue;
      if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1) out.push(`${e.className.baseVal ?? e.className}`.slice(0, 40) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    return { safe: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.right), Math.round(pr.bottom)], out: out.slice(0, 20) };
  }, ins);
  await gameWait(page, 1.5);
  // landscape, notch on the left
  await page.setViewportSize({ width: 844, height: 390 });
  const ok = await setInsets({ left: 47, top: 0, right: 47, bottom: 21 });
  if (!ok) return;
  await gameWait(page, 1);
  h.log('land play', JSON.stringify(await check()));
  await h.shot('80-safe-land');
  await h.game((g) => g.mapScreen.show());
  await h.wait(900);
  h.log('land map', JSON.stringify(await check()));
  await h.shot('81-safe-land-map');
  await h.game((g) => g.mapScreen.close());
  await h.game((g) => g.menu.showPause());
  await h.wait(900);
  h.log('land pause', JSON.stringify(await check()));
  await h.shot('82-safe-land-pause');
  await h.game((g) => g.menu.hidePause());
  await h.wait(500);
  // car in landscape
  await h.game((g) => g.debugApi.driveCar?.('sedan'));
  await gameWait(page, 1);
  h.log('land car', JSON.stringify(await check()));
  await h.shot('83-safe-land-car');
  await h.game((g) => g.player.exitVehicle?.(true));
  // portrait
  await page.setViewportSize({ width: 390, height: 664 });
  await setInsets({ left: 0, top: 47, right: 0, bottom: 34 });
  await gameWait(page, 1);
  h.log('port play', JSON.stringify(await check()));
  await h.shot('84-safe-port');
  await h.game((g) => g.mapScreen.show());
  await h.wait(900);
  h.log('port map', JSON.stringify(await check()));
  await h.shot('85-safe-port-map');
  await h.game((g) => g.mapScreen.close());
}
