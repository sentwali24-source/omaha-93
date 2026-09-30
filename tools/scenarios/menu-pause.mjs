// Pause menu over live play (use with autostart):
//   node tools/smoke.mjs --port 5208 --no-server --out tools/out/menu-pause \
//     --params "autostart=1&side=bloods&set=lvb&debug=1&quality=low" --script tools/scenarios/menu-pause.mjs [--mobile]
export default async function (page, h) {
  await h.wait(1500);
  h.assert(await h.game((g) => g.mode === 'play' && g.input.enabled && !g.menu.context), 'autostart reaches play with input on');
  await h.game((g) => g.debugApi.give(420, 180));
  await h.game((g) => g.menu.showPause());
  await h.wait(900);
  h.assert(await h.game((g) => g.paused && g.menu.pauseOpen && !g.input.enabled), 'showPause pauses');
  await h.shot('30-pause');

  await page.click('.m-item[data-key="controls"]');
  await h.wait(600);
  await h.shot('31-pause-controls');
  await page.click('.m-foot .m-btn');
  await h.wait(300);

  // Map from pause: stays paused while the map is open, or falls back to the pause menu
  await page.click('.m-item[data-key="map"]');
  await h.wait(600);
  const m = await h.game((g) => ({ mapOpen: !!g.mapScreen.open, paused: g.paused, pauseOpen: g.menu.pauseOpen }));
  h.log('map', JSON.stringify(m));
  h.assert(m.paused && (m.mapOpen || m.pauseOpen), 'map opens (or pause menu stays) while paused');
  if (m.mapOpen) await h.game((g) => g.mapScreen.close());
  await h.wait(600);

  await h.game((g) => g.menu.hidePause());
  await h.wait(500);
  h.assert(await h.game((g) => !g.paused && !g.menu.pauseOpen && g.input.enabled), 'hidePause resumes');

  // ?autostart path used a default look
  const look = await h.game((g) => g.state.player.look);
  h.assert(look && look.shirt && look.outfit && look.bandana, 'quickStart default look');

  await h.game((g) => g.menu.showSettings());
  await h.wait(600);
  h.assert(await h.game((g) => g.debugApi.menu.screen() === 'settings' && g.paused), 'showSettings in play opens settings over pause');
  await h.shot('32-settings-from-play');
  await h.game((g) => g.menu.hidePause());
  await h.wait(800);
  await h.shot('33-resumed');
}
