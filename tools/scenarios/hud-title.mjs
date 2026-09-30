// Title screen (attract): HUD, touch controls and map must be hidden; then start and check they show.
export default async function (page, h) {
  // screenshots can time out on a heavily loaded machine: log and carry on
  const snap = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  // frame rates in headless tests can be tiny: wait for real frames, not milliseconds
  const frames = async (n) => {
    const f0 = await h.game((g) => g.time.frame);
    await page.waitForFunction((t) => window.__game.time.frame >= t, f0 + n, { timeout: 30000 });
  };
  await h.wait(1500);
  const a = await h.game((g) => ({ mode: g.mode, hud: g.hud.visible, touch: g.touch.visible, rootHidden: g.hud.root.classList.contains('hidden') }));
  h.log('attract', JSON.stringify(a));
  h.assert(a.mode === 'attract' && !a.hud && !a.touch && a.rootHidden, 'HUD hidden on the title screen');
  // M on the title screen must not open the map
  await h.press('KeyM');
  await h.wait(300);
  h.assert(await h.game((g) => !g.mapScreen.open), 'map stays closed in attract');
  await snap('90-title');
  await h.game((g) => g.menu.quickStart({ side: 'bloods', setId: 'nfp' }));
  await frames(4);
  h.log('banner', JSON.stringify(await h.game((g) => ({ cls: g.hud.bannerEl.className, op: getComputedStyle(g.hud.bannerEl).opacity, t: g.hud._banner, anim: g.hud.bannerEl.getAnimations().map((a) => [a.animationName, a.playState, a.currentTime]), rootCls: g.hud.root.className, ps: getComputedStyle(g.hud.bannerEl).animationPlayState }))));
  await h.wait(1500);
  h.log('banner later', JSON.stringify(await h.game((g) => ({ op: getComputedStyle(g.hud.bannerEl).opacity, t: g.hud._banner, anim: g.hud.bannerEl.getAnimations().map((a) => [a.animationName, a.playState, a.currentTime, a.startTime]), now: document.timeline.currentTime }))));
  const b = await h.game((g) => ({ mode: g.mode, hud: g.hud.visible, banner: g.hud.bannerTitle.textContent }));
  h.log('play', JSON.stringify(b));
  h.assert(b.hud, 'HUD visible in play');
  await snap('91-start-nfp');
  // hide()/show()
  await h.game((g) => g.hud.hide());
  await frames(3);
  h.assert(await h.game((g) => !g.hud.visible), 'hud.hide() hides');
  await h.game((g) => g.hud.show());
  await frames(3);
  h.assert(await h.game((g) => g.hud.visible), 'hud.show() shows');
  // quit to title clears everything
  await h.game((g) => { g.hud.addMarker({ type: 'waypoint', x: 0, z: -500 }); g.quitToTitle(); });
  await frames(3);
  const c = await h.game((g) => ({ hud: g.hud.visible, markers: g.hud.markers.size, mode: g.mode, frame: g.time.frame, cls: g.hud.root.className, err: g.hud._errored }));
  await h.wait(500);
  c.frame2 = await h.game((g) => g.time.frame);
  h.log('after quit', JSON.stringify(c));
  h.assert(!c.hud && c.markers === 0, 'quit to title hides HUD and clears markers');
}
