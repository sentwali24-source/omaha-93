// Multi-touch helpers for phone QA scenarios (CDP touch events → real pointer events).
export async function fingers(page) {
  const cdp = await page.context().newCDPSession(page);
  const active = new Map(); // id -> [x, y]
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...active].map(([id, p]) => ({ x: p[0], y: p[1], id })) });
  // CDP: touchEnd lists the points that lift (a touchMove without a point does not release it)
  const lift = (id, p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p[0], y: p[1], id }] });
  return {
    async down(id, x, y) {
      active.set(id, [x, y]);
      await send('touchStart');
    },
    async move(id, x, y) {
      active.set(id, [x, y]);
      await send('touchMove');
    },
    async up(id) {
      const p = active.get(id);
      active.delete(id);
      if (p) await lift(id, p);
    },
    async upAll() {
      active.clear();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async tap(x, y, id = 90, ms = 80) {
      active.set(id, [x, y]);
      await send('touchStart');
      await page.waitForTimeout(ms);
      active.delete(id);
      await lift(id, [x, y]);
    },
    active,
  };
}

export async function center(page, sel) {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height];
  }, sel);
}

/** Wait until `sec` seconds of game time (sum of dt while playing) have passed. */
export async function gameWait(page, sec, timeout = 60000) {
  const t0 = await page.evaluate(() => window.__game.time.elapsed);
  await page.waitForFunction(({ t0, sec }) => (window.__game.time.elapsed) - t0 >= sec, { t0, sec }, { timeout, polling: 200 }).catch(() => {});
}
