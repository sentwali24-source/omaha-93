// Full click-through: New Game → side → set → creator → Hit the block → in play → pause menu
// (Esc) → settings inside pause → save → resume → quit to title → Continue shows → overwrite
// warning on a second New Game → Continue back into play.
//   node tools/smoke.mjs --port 5208 --no-server --out tools/out/menu-flow \
//     --params "debug=1&quality=low" --script tools/scenarios/menu-flow.mjs [--mobile]
export default async function (page, h) {
  // screenshots can time out on a heavily loaded machine: log and carry on
  const shot = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  const screen = () => h.game((g) => g.debugApi?.menu?.screen?.() ?? null);
  const tap = async (sel) => { await page.waitForSelector(sel, { timeout: 60000 }); await page.click(sel, { force: true, timeout: 60000 }); };

  await h.wait(1200);
  await tap('.m-item[data-key="new"]');
  await tap('.m-side-card[data-key="side-crips"]');
  await tap('.m-set-card[data-key="set-ngc"]');
  await h.wait(1200);
  await tap('.m-chip[data-key="outfit-flannel"]');
  await tap('.m-chip[data-key="hair-braids"]');
  await page.fill('.m-name-input', 'Kev-O');
  await shot('19-creator-ready');
  await tap('.m-btn-go');
  await h.wait(1800);

  const st = await h.game((g) => ({
    mode: g.mode,
    paused: g.paused,
    input: g.input.enabled,
    menu: g.menu.context,
    player: g.state?.player,
  }));
  h.log('in play', JSON.stringify(st));
  h.assert(st.mode === 'play', 'New Game reaches play');
  h.assert(st.input === true, 'input enabled in play');
  h.assert(st.menu === null, 'menu closed in play');
  h.assert(st.player?.name === 'Kev-O' && st.player?.setId === 'ngc' && st.player?.side === 'crips', 'player config passed to startNewGame');
  h.assert(st.player?.look?.outfit === 'flannel' && st.player?.look?.hair === 'braids' && st.player?.look?.shirt === '#1f5fe0', 'look built from the creator');
  await shot('20-in-play');

  // Esc → Game → menu.showPause()
  await h.press('Escape');
  await h.wait(900);
  h.assert(await h.game((g) => g.paused && g.menu.pauseOpen), 'Esc opens the pause menu');
  await shot('21-pause');

  await tap('.m-item[data-key="settings"]');
  await h.wait(1500);
  await shot('22-pause-settings');
  await h.press('Escape');
  await h.wait(400);
  h.assert((await screen()) === 'pause' && (await h.game((g) => g.paused)), 'Esc in pause settings returns to the pause menu');

  await tap('.m-item[data-key="save"]');
  await h.wait(350);
  await shot('23-pause-saved');
  h.assert(await h.game(() => !!localStorage.getItem('omaha93.save.v1')), 'save written');

  await h.press('Escape');
  await h.wait(900);
  h.assert(await h.game((g) => !g.paused && !g.menu.pauseOpen && g.input.enabled), 'Esc resumes');

  await h.game((g) => g.menu.showPause());
  await h.wait(1500);
  h.log('before quit', JSON.stringify(await h.game((g) => ({ paused: g.paused, pauseOpen: g.menu.pauseOpen, screen: g.debugApi.menu.screen(), map: g.mapScreen.open }))));
  await tap('.m-item[data-key="quit"]');
  await h.wait(400);
  await shot('24-quit-confirm');
  await tap('.m-modal .m-btn-primary');
  await h.wait(1500);
  h.assert(await h.game((g) => g.mode === 'attract' && g.menu.context === 'title' && g.input.enabled === false), 'quit returns to the title');
  h.assert(!!(await page.$('.m-item[data-key="continue"]')), 'Continue offered after a save');
  await shot('25-title-continue');

  // New game again → overwrite warning at the last step
  await tap('.m-item[data-key="new"]');
  await tap('.m-side-card[data-key="side-bloods"]');
  await tap('.m-set-card[data-key="set-nfp"]');
  await h.wait(800);
  await tap('.m-btn-go');
  await h.wait(500);
  h.assert(!!(await page.$('.m-modal')), 'overwrite warning shown');
  await shot('26-overwrite');
  await tap('.m-modal .m-btn-ghost');
  await h.wait(300);
  h.assert((await h.game((g) => g.mode)) === 'attract', 'keeping the save stays in the menu');

  // back to the title and continue
  await h.press('Escape');
  await h.press('Escape');
  await h.press('Escape');
  await h.wait(400);
  await tap('.m-item[data-key="continue"]');
  await h.wait(1800);
  const c = await h.game((g) => ({ mode: g.mode, name: g.state?.player?.name, input: g.input.enabled }));
  h.assert(c.mode === 'play' && c.name === 'Kev-O' && c.input, 'Continue loads the save');
  await shot('27-continued');
}
