// Phone first run (run with --mobile, params "debug=1" only): quality default, title → play by tapping,
// overflow checks per screen, then the first seconds of play.
export default async function (page, h) {
  const overflow = () => page.evaluate(() => {
    const out = [];
    const vw = innerWidth, vh = innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.closest('[hidden]')) continue;
      if (r.right > vw + 2 || r.left < -2) out.push(`${el.tagName}.${[...el.classList].join('.')} x:${Math.round(r.left)}..${Math.round(r.right)}`);
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && el.children.length === 0 && el.textContent.trim()) out.push(`TEXT-OVER ${el.tagName}.${[...el.classList].join('.')} "${el.textContent.trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
    }
    return { sw: document.documentElement.scrollWidth, vw, out: out.slice(0, 15) };
  });
  const q = await h.game((g) => ({ q: g.settings.quality, isTouch: g.input.isTouch, touchActive: g.touch.active, mode: g.mode, dpr: devicePixelRatio, pr: g.renderer.getPixelRatio() }));
  h.log('boot', JSON.stringify(q));
  h.assert(q.q === 'low', 'quality defaults to low on a phone');
  const land = process.env.LAND === '1';
  if (land) await page.setViewportSize({ width: 844, height: 390 });
  await h.wait(1500);
  await h.shot('10-title');
  h.log('title overflow', JSON.stringify(await overflow()));
  const keys = await page.evaluate(() => [...document.querySelectorAll('[data-key]')].filter((e) => e.offsetParent).map((e) => e.dataset.key));
  h.log('title keys', keys.join(','));
  await page.tap('.m-item[data-key="new"]');
  await h.wait(1500);
  await h.shot('11-after-new');
  h.log('screen', await page.evaluate(() => [...document.querySelectorAll('[data-key]')].filter((e) => e.offsetParent).map((e) => e.dataset.key).join(',')));
  h.log('overflow', JSON.stringify(await overflow()));

  await page.tap('.m-side-card[data-key="side-bloods"]');
  await h.wait(1500);
  await h.shot('12-set');
  h.log('set overflow', JSON.stringify(await overflow()));
  await page.tap('.m-set-card[data-key="set-lvb"]');
  await h.wait(2500);
  await h.shot('13-creator');
  h.log('creator overflow', JSON.stringify(await overflow()));
  // name field: focus it (phone keyboard) and type
  const nameBox = await page.evaluate(() => { const e = document.querySelector('[data-key="name"]'); const r = e.getBoundingClientRect(); return { tag: e.tagName, top: r.top, bottom: r.bottom, h: innerHeight }; });
  h.log('name box', JSON.stringify(nameBox));
  const go = await page.evaluate(() => { const e = document.querySelector('.m-btn-go'); const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, visible: r.bottom <= innerHeight }; });
  h.log('go button', JSON.stringify(go));
  await page.tap('.m-btn-go');
  const t0 = Date.now();
  await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 60000 }).catch(() => {});
  h.log('to play ms', Date.now() - t0);
  await h.wait(1500);
  await h.shot('14-play-0');
  const st = await h.game((g) => ({ mode: g.mode, touch: g.touch.visible, hudVisible: g.hud.visible, objective: g.hud.objectiveText ?? document.querySelector('.hud-objective')?.textContent, perf: g.perf, rotate: !document.querySelector('.m-rotate')?.hidden }));
  h.log('play', JSON.stringify(st));
  h.log('play overflow', JSON.stringify(await overflow()));
  await h.wait(6000);
  await h.shot('15-play-6s');
  const st2 = await h.game((g) => ({ perf: g.perf, hour: g.state.clock.hour, pager: document.querySelector('.hud-pager, .pager')?.textContent?.slice(0, 120) }));
  h.log('play 6s', JSON.stringify(st2));
  const mem = await page.evaluate(() => performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1e6), total: Math.round(performance.memory.totalJSHeapSize / 1e6) } : null);
  h.log('mem MB', JSON.stringify(mem), 'geom/tex', JSON.stringify(await h.game((g) => g.renderer.info.memory)));
}
