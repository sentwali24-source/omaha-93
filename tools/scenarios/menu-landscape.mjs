// Phone held sideways: run with --mobile. Switches the viewport to 844×390 landscape and walks the
// title → side → set → creator → play → pause, then back to portrait in play for the rotate hint.
//   node tools/smoke.mjs --port 5208 --no-server --mobile --out tools/out/menu-land \
//     --params "debug=1&quality=low" --script tools/scenarios/menu-landscape.mjs
export default async function (page, h) {
  const shot = async (name, ms = 1400) => {
    await h.wait(ms);
    await h.shot(name);
  };
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);

  await page.setViewportSize({ width: 844, height: 390 });
  await shot('40-land-title', 1500);
  h.assert(await noHScroll(), 'no horizontal scroll (title)');
  await page.tap('.m-item[data-key="new"]');
  await shot('41-land-side');
  await page.tap('.m-side-card[data-key="side-crips"]');
  await shot('42-land-set');
  h.assert(await noHScroll(), 'no horizontal scroll (set pick)');
  await page.tap('.m-set-card[data-key="set-rlc"]');
  await shot('43-land-creator', 2500);
  await page.tap('.m-chip[data-key="hat-bandana"]');
  await page.tap('.m-btn-go');
  await h.wait(1800);
  h.assert((await h.game((g) => g.mode)) === 'play', 'landscape flow reaches play');
  await h.game((g) => g.menu.showPause());
  await shot('44-land-pause');
  await h.game((g) => g.menu.hidePause());

  // back to portrait while playing: rotate hint appears, tap dismisses it
  await page.setViewportSize({ width: 390, height: 664 });
  await h.wait(1600);
  const shown = await page.evaluate(() => !document.querySelector('.m-rotate').hidden);
  h.assert(shown, 'rotate hint shown in portrait play on touch');
  await shot('45-portrait-rotate-hint', 300);
  if (shown) await page.tap('.m-rotate');
  await h.wait(300);
  h.assert(await page.evaluate(() => document.querySelector('.m-rotate').hidden), 'rotate hint dismissed');
}
