// Menu screens tour (no autostart): title → side → set → creator (live preview) → back out →
// settings → controls → about. Screenshots of each screen, state asserted through window.__game.
//   node tools/smoke.mjs --port 5208 --no-server --out tools/out/menu-screens \
//     --params "debug=1&quality=low" --script tools/scenarios/menu-screens.mjs [--mobile]
export default async function (page, h) {
  const shot = async (name, ms = 1400) => {
    await h.wait(ms);
    await h.shot(name);
  };
  const screen = () => h.game((g) => g.debugApi?.menu?.screen?.() ?? null);

  await h.wait(1500);
  h.assert((await h.game((g) => g.menu.context)) === 'title', 'title menu is open');
  h.assert((await h.game((g) => g.input.enabled)) === false, 'input disabled on the title');
  await shot('10-title', 1200);

  // keyboard: move the highlight down and back up
  await h.press('ArrowDown');
  await h.press('ArrowUp');

  await page.click('.m-item[data-key="new"]');
  h.assert((await screen()) === 'side', 'side pick after New Game');
  await shot('11-side');

  await page.click('.m-side-card[data-key="side-bloods"]');
  h.assert((await screen()) === 'set', 'set pick after choosing a side');
  await shot('12-set', 1200);

  await page.click('.m-set-card[data-key="set-lvb"]');
  h.assert((await screen()) === 'creator', 'creator after claiming a set');
  await h.wait(2500);
  h.assert(await h.game((g) => g.debugApi.menu.previewOk()), 'live 3D preview running');
  await shot('13-creator', 800);

  // change a few options and type a name
  await page.click('.m-chip[data-key="hat-beanie"]');
  await page.click('.m-chip[data-key="outfit-hoodie"]');
  await page.click('.m-swatch[data-key^="skin-"]:nth-child(2)');
  await page.fill('.m-name-input', 'Lil Scooter');
  await page.keyboard.press('Enter');
  const flow = await h.game((g) => g.debugApi.menu.flow());
  h.assert(flow.draft.hat === 'beanie' && flow.draft.outfit === 'hoodie', 'creator options applied');
  h.assert(flow.draft.name === 'Lil Scooter', 'name typed');
  await shot('14-creator-changed', 1500);

  // back out with Esc (creator → set → side → title); preview must be disposed
  await h.press('Escape');
  await h.wait(200);
  h.assert((await screen()) === 'set', 'Esc goes back to set pick');
  await h.press('Escape');
  await h.press('Escape');
  await h.wait(300);
  h.assert((await screen()) === 'title', 'Esc returns to title');

  await page.click('.m-item[data-key="settings"]');
  await shot('15-settings');
  await page.click('.m-seg[data-key="quality-high"]');
  h.assert((await h.game((g) => g.settings.quality)) === 'high', 'quality applied');
  await page.click('.m-seg[data-key="quality-low"]');
  await page.click('.m-toggle[data-key="showFps"]');
  h.assert((await h.game((g) => g.settings.showFps)) === true, 'toggle applied');
  await page.click('.m-toggle[data-key="showFps"]');
  await h.press('Escape');

  await page.click('.m-item[data-key="controls"]');
  await shot('16-controls');
  await page.click('.m-tab[data-key="tab-gamepad"]');
  await shot('17-controls-pad', 400);
  await h.press('Escape');

  await page.click('.m-item[data-key="about"]');
  await shot('18-about');
  await h.press('Escape');
  h.assert((await screen()) === 'title', 'back on the title');

  // loading screen styles (same markup as src/main.js), shown on top for a screenshot
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'loading';
    d.id = 'test-loading';
    d.innerHTML = `
    <div class="loading-title">OMAHA <span>'93</span></div>
    <div class="loading-sub">North Omaha · Downtown · Old Market — Summer 1993</div>
    <div class="loading-bar"><div class="loading-fill" style="width:62%"></div></div>
    <div class="loading-label">Building the city</div>`;
    document.getElementById('ui-root').appendChild(d);
  });
  await shot('19-loading', 900);
  await page.evaluate(() => document.getElementById('test-loading')?.remove());
}
