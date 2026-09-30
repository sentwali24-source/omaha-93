// KO → KNOCKED OUT card, fade to black, respawn in the hood, fade back in (real Game respawn flow).
//   node tools/smoke.mjs --port 5215 --no-server --out tools/out/ui-hud-ko \
//     --params "autostart=1&side=crips&set=psc&debug=1&quality=low" --script tools/scenarios/hud-ko.mjs [--mobile]
export default async function (page, h) {
  const shot = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  await h.wait(2000);
  await h.game((g) => g.debugApi.teleport(372, 120));
  await h.wait(800);
  await h.game((g) => g.player.takeDamage(999, null));
  await h.wait(1500);
  const s1 = await h.game((g) => ({ big: g.hud._big?.title || null, alive: g.player.alive }));
  h.log('down', JSON.stringify(s1));
  h.assert(s1.big === 'KNOCKED OUT', 'KNOCKED OUT card');
  await shot('70-ko');
  await page.waitForFunction(() => window.__game.player.alive, null, { timeout: 60000 }).catch(() => {});
  // the fade back in is a 0.9 s CSS transition: give a starved headless compositor time
  await page.waitForFunction(() => Number(getComputedStyle(window.__game.hud.fadeEl).opacity) < 0.5, null, { timeout: 15000 }).catch(() => {});
  const s2 = await h.game((g) => ({ alive: g.player.alive, fade: getComputedStyle(g.hud.fadeEl).opacity, where: g.layout.describe(g.player.position.x, g.player.position.z).street, hud: g.hud.visible, fps: g.perf.fps }));
  h.log('respawn', JSON.stringify(s2));
  h.assert(s2.alive && Number(s2.fade) < 0.5 && s2.hud, 'respawned, faded back in, HUD up');
  await shot('71-respawn');
}
