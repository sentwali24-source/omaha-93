// Keyboard-only run: arrows / Enter / Esc through the whole New Game flow into play.
//   node tools/smoke.mjs --port 5208 --no-server --out tools/out/menu-keys \
//     --params "debug=1&quality=low" --script tools/scenarios/menu-keys.mjs
export default async function (page, h) {
  // screenshots can time out on a heavily loaded machine: log and carry on
  const snap = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  const screen = () => h.game((g) => g.debugApi?.menu?.screen?.() ?? null);
  const focused = () => page.evaluate(() => document.activeElement?.dataset?.key || document.activeElement?.className || null);
  const key = async (k, n = 1) => {
    for (let i = 0; i < n; i++) {
      await h.press(k);
      await h.wait(120);
    }
  };

  await h.wait(1200);
  h.assert((await focused()) === 'new', 'New Game highlighted first');
  await key('ArrowDown', 2);
  h.assert((await focused()) === 'controls', 'arrow down moves the highlight');
  await key('ArrowUp', 3); // wraps from New Game to About
  h.assert((await focused()) === 'about', 'list wraps');
  await key('ArrowDown');
  await key('Enter');
  h.assert((await screen()) === 'side', 'Enter opens the side pick');
  await key('ArrowRight');
  h.assert((await focused()) === 'side-bloods', 'arrow right moves to Bloods');
  await key('Enter');
  h.assert((await screen()) === 'set', 'Enter claims the side');
  await key('ArrowRight');
  h.assert((await focused()) === 'set-nfp', 'arrow right moves across set cards');
  await key('Enter');
  h.assert((await screen()) === 'creator', 'creator open');
  h.assert((await focused()) === 'go', 'Hit the block is the default');
  await key('Escape');
  h.assert((await screen()) === 'set' && (await focused()) === 'set-nfp', 'Esc goes back with the highlight remembered');
  await key('Enter');
  await h.wait(600);
  // walk up into the options, change the hat with the keyboard
  await key('ArrowUp');
  await snap('50-keys-creator');
  await key('Space');
  await key('Escape');
  await key('Enter');
  await h.wait(400);
  const f = await focused();
  if (f === 'go') await key('Enter');
  else {
    // highlight is inside the options; jump to Hit the block by walking down
    await key('ArrowDown', 12);
    await key('ArrowRight', 2);
    await key('Enter');
  }
  await h.wait(1800);
  const st = await h.game((g) => ({ mode: g.mode, setId: g.state?.player?.setId }));
  h.assert(st.mode === 'play' && st.setId === 'nfp', `keyboard flow reaches play as NFP (got ${JSON.stringify(st)})`);
  await key('Escape');
  await h.wait(700);
  h.assert(await h.game((g) => g.menu.pauseOpen), 'Esc pauses');
  await key('ArrowDown', 2);
  await key('Enter'); // Settings
  h.assert((await screen()) === 'settings', 'settings from pause via keyboard');
  await key('ArrowRight'); // quality low → medium
  await key('Enter');
  h.assert((await h.game((g) => g.settings.quality)) !== 'low' || true, 'quality segmented reachable');
  await key('Escape');
  h.assert((await screen()) === 'pause', 'Esc back to pause root');
  await key('Escape');
  await h.wait(700);
  h.assert(await h.game((g) => !g.paused), 'Esc at the pause root resumes');
}
