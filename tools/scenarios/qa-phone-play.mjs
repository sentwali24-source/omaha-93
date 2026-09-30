// Phone play with touch only (run with --mobile). LAND=1 env → 844×390 landscape.
//   node tools/smoke.mjs --port 5222 --no-server --mobile --out tools/out/qa-phone-play \
//     --params "autostart=1&side=bloods&set=lvb&debug=1" --script tools/scenarios/qa-phone-play.mjs
import { fingers, center, gameWait } from './qa-phone-util.mjs';

export default async function (page, h) {
  if (process.env.LAND !== '0') await page.setViewportSize({ width: 844, height: 390 });
  const F = await fingers(page);
  const vp = page.viewportSize();
  const st = () => h.game((g) => ({ x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2), mv: { ...g.input._virtualMove }, vdown: [...g.input._virtualDown], held: [...g.touch._held.values()].map((q) => q.def.id), stick: !!g.touch._stick, look: !!g.touch._look, yaw: +g.cameraRig.yaw.toFixed(3), vis: g.touch.visible, speed: +(g.player.velocity ? Math.hypot(g.player.velocity.x, g.player.velocity.z) : 0).toFixed(2), anim: g.player.state || g.player.anim }));
  await gameWait(page, 2);
  h.log('quality', await h.game((g) => g.settings.quality), 'perf', JSON.stringify(await h.game((g) => g.perf)));
  await h.shot('20-land-idle');

  // 1. walk with stick + look drag, release in reverse order
  const s0 = await st();
  const sx = 120, sy = vp.height - 110;
  await F.down(1, sx, sy);
  await F.move(1, sx, sy - 40);
  await F.move(1, sx + 5, sy - 80);
  await F.down(2, vp.width * 0.55, vp.height * 0.4);
  for (let i = 1; i <= 5; i++) { await F.move(2, vp.width * 0.55 + i * 10, vp.height * 0.4); await h.wait(50); }
  await gameWait(page, 1.5);
  const s1 = await st();
  h.log('walking', JSON.stringify(s1));
  await F.up(1); // stick first, look still down
  await h.wait(300);
  const s2 = await st();
  h.log('after stick up', JSON.stringify(s2));
  h.assert(s2.mv.x === 0 && s2.mv.y === 0 && !s2.stick && s2.look, 'stick released while look finger stays');
  await F.up(2);
  await h.wait(300);
  const s3 = await st();
  h.assert(!s3.look && !s3.stick, 'all released');
  h.assert(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 0.5, 'walked');

  // 2. sprint hold + stick; lift stick, then sprint
  const sprint = await center(page, '.tb-sprint');
  await F.down(3, sx, sy);
  await F.move(3, sx, sy - 90);
  await F.down(4, sprint[0], sprint[1]);
  await gameWait(page, 1);
  const s4 = await st();
  h.log('sprinting', JSON.stringify(s4));
  h.assert(s4.vdown.includes('sprint'), 'sprint held');
  await F.up(4);
  await h.wait(200);
  const s5 = await st();
  h.assert(!s5.vdown.includes('sprint') && s5.mv.y > 0.5, 'sprint released, stick still held');
  await F.up(3);
  await h.wait(200);

  // 3. finger on a button slides off it and lifts elsewhere
  const jump = await center(page, '.tb-jump');
  await F.down(5, jump[0], jump[1]);
  await F.move(5, jump[0] - 150, jump[1] - 100);
  await F.up(5);
  await h.wait(200);
  const s6 = await st();
  h.log('slide-off', JSON.stringify(s6));
  h.assert(!s6.vdown.length && !s6.held.length, 'button released after sliding off');

  // 4. stick held, MAP tapped with another finger, map closed with a tap, stick finger lifts
  const mapB = await center(page, '.tb-map');
  await F.down(6, sx, sy);
  await F.move(6, sx, sy - 80);
  await F.tap(mapB[0], mapB[1], 7);
  await h.wait(800);
  const m1 = await h.game((g) => ({ open: g.mapScreen.open, paused: g.paused, mv: { ...g.input._virtualMove } }));
  h.log('map open', JSON.stringify(m1));
  h.assert(m1.open && m1.mv.y === 0, 'map opened, stick zeroed');
  await h.shot('21-land-map');
  // map layout check at phone size
  const mapUi = await page.evaluate(() => [...document.querySelectorAll('.map-root *')].filter((e) => e.offsetParent && e.children.length === 0 && e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 24), l: Math.round(r.left), r: Math.round(r.right), tp: Math.round(r.top), b: Math.round(r.bottom), fs: getComputedStyle(e).fontSize }; }).filter((q) => q.r > innerWidth || q.l < 0 || q.b > innerHeight || parseFloat(q.fs) < 10).slice(0, 12));
  h.log('map ui issues', JSON.stringify(mapUi));
  await F.tap(vp.width * 0.45, vp.height * 0.5, 8);
  await h.wait(500);
  const wp = await h.game((g) => g.hud.getWaypoint?.());
  h.log('waypoint', JSON.stringify(wp));
  h.assert(!!wp, 'tap sets waypoint');
  await h.shot('22-land-map-wp');
  const close = await center(page, '.map-close');
  await F.tap(close[0], close[1], 9);
  await h.wait(800);
  await F.move(6, sx + 10, sy - 90);
  await h.wait(300);
  const m2 = await h.game((g) => ({ open: g.mapScreen.open, paused: g.paused, mv: { ...g.input._virtualMove }, stick: !!g.touch._stick }));
  h.log('after map close, old finger moving', JSON.stringify(m2));
  await F.up(6);
  await h.wait(300);
  const m3 = await st();
  h.assert(!m3.stick && m3.mv.y === 0, 'stick clean after map');

  // 5. punch a ped with PUNCH taps
  await h.game((g) => { const p = g.player.position; const f = g.player.heading ?? 0; window.__ped = g.debugApi.spawnPed(p.x - Math.sin(f) * 1.4, p.z - Math.cos(f) * 1.4); });
  const punch = await center(page, '.tb-punch');
  const hp0 = await h.game(() => window.__ped?.health);
  for (let i = 0; i < 6; i++) { await F.tap(punch[0], punch[1], 10 + i, 60); await h.wait(250); }
  await gameWait(page, 0.5);
  const hp1 = await h.game((g) => ({ hp: window.__ped?.health, state: window.__ped?.brain?.state, d: window.__ped ? +window.__ped.position.distanceTo(g.player.position).toFixed(1) : null }));
  h.log('punch ped', hp0, JSON.stringify(hp1));
  await h.shot('23-land-punch');

  // 6. pause → settings by tapping
  const pz = await center(page, '.tb-pause');
  await F.tap(pz[0], pz[1], 20);
  await h.wait(900);
  h.assert(await h.game((g) => g.paused), 'pause button pauses');
  await h.shot('24-land-pause');
  const keys = await page.evaluate(() => [...document.querySelectorAll('[data-key]')].filter((e) => e.offsetParent).map((e) => e.dataset.key));
  h.log('pause keys', keys.join(','));

  // settings from pause
  const setBtn = await page.evaluate(() => { const e = [...document.querySelectorAll('[data-key]')].find((q) => q.offsetParent && /settings/.test(q.dataset.key)); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, e.dataset.key]; });
  h.log('settings btn', JSON.stringify(setBtn));
  if (setBtn) {
    await F.tap(setBtn[0], setBtn[1], 21);
    await h.wait(1200);
    await h.shot('25-land-settings');
    const sk = await page.evaluate(() => [...document.querySelectorAll('[data-key]')].filter((e) => e.offsetParent).map((e) => e.dataset.key));
    h.log('settings keys', sk.join(','));
    const small = await page.evaluate(() => [...document.querySelectorAll('.m-screen *, .menu-root *')].filter((e) => e.offsetParent && e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11).map((e) => e.textContent.trim().slice(0, 20) + ':' + getComputedStyle(e).fontSize).slice(0, 10));
    h.log('tiny text', JSON.stringify(small));
  }
  await h.game((g) => g.menu.hidePause());
  await h.wait(800);
  h.assert(await h.game((g) => !g.paused && g.touch.visible), 'resumed with controls');

  // 7. tag a wall by holding ACTION
  const spot = await h.game((g) => g.debugApi.tagging.goto());
  await gameWait(page, 1);
  const act = await center(page, '.tb-action');
  const pr = await h.game((g) => ({ prompt: g.hud.promptText, kind: g.hud.promptKind, near: g.debugApi.tagging.near() }));
  h.log('tag spot', spot, JSON.stringify(pr));
  const tags0 = await h.game((g) => g.state.stats.tags);
  await F.down(30, act[0], act[1]);
  await gameWait(page, 1.2);
  await h.shot('26-land-tagging');
  h.log('tag progress', JSON.stringify(await h.game((g) => ({ p: g.interactions.progress, hp: g.hud.promptProgress, ring: document.querySelector('.tb-ring circle').style.strokeDashoffset }))));
  await gameWait(page, 6, 90000);
  await F.up(30);
  await h.wait(500);
  const tags1 = await h.game((g, id) => ({ tags: g.state.stats.tags, owner: g.debugApi.tagging.spots().find((q) => q.id === id)?.owner }), spot);
  h.log('tags', tags0, JSON.stringify(tags1));
  h.assert(tags1.tags > tags0, 'holding ACTION finishes a tag');
  await h.shot('27-land-tagged');

  // 8. payphone
  const phone = await h.game((g) => {
    const ph = g.missions.poi('payphone', { near: g.player.position });
    if (!ph) return null;
    g.debugApi.teleport(ph.x + 1.2, ph.z + 1.2);
    return { x: ph.x, z: ph.z };
  });
  await gameWait(page, 1);
  const pp = await h.game((g) => ({ prompt: g.hud.promptText, kind: g.hud.promptKind, cash: g.state.cash }));
  h.log('payphone', JSON.stringify(phone), JSON.stringify(pp));
  await h.shot('28-land-payphone');
  if (pp.prompt) {
    await F.tap(act[0], act[1], 31, 120);
    await gameWait(page, 2);
    h.log('after phone', JSON.stringify(await h.game((g) => ({ cash: g.state.cash, dialog: document.querySelector('.hud-dialog')?.textContent?.trim().slice(0, 100), mission: g.debugApi.missions.active()?.title, offer: g.debugApi.missions.offer() }))));
    await h.shot('29-land-phone-call');
  }

  // 9. car: CAR button, drive with the stick, BRAKE, HORN, RADIO, EXIT
  const car = await h.game((g) => {
    const p = g.player.position;
    const v = g.vehiclesNear(p.x, p.z, 200, (q) => !q.driver && !q.isPolice).sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
    if (!v) return null;
    const hx = -Math.cos(v.heading), hz = Math.sin(v.heading);
    g.debugApi.teleport(v.position.x + hx * 2.2, v.position.z + hz * 2.2);
    return { id: v.id, model: v.model };
  });
  await gameWait(page, 1);
  const carB = await center(page, '.tb-car');
  h.log('car', JSON.stringify(car), 'glow', await page.evaluate(() => document.querySelector('.tb-car').classList.contains('glow')));
  await F.tap(carB[0], carB[1], 32, 100);
  await page.waitForFunction(() => !!window.__game.player.vehicle, null, { timeout: 20000 }).catch(() => {});
  await gameWait(page, 1.5);
  const inCar = await h.game((g) => ({ in: !!g.player.vehicle, touchCar: g.touch.inCar, radio: g.audio?.radio?.station?.name ?? null }));
  h.log('in car', JSON.stringify(inCar));
  h.assert(inCar.in, 'CAR enters the car');
  await h.shot('30-land-car');
  const carState = () => h.game((g) => { const v = g.player.vehicle; return v ? { speed: +(v.speed ?? 0).toFixed(2), x: +v.position.x.toFixed(1), z: +v.position.z.toFixed(1), ctl: { ...v.controls }, horn: g.input.held('horn') } : null; });
  await F.down(33, sx, sy);
  await F.move(33, sx, sy - 90);
  await gameWait(page, 3, 90000);
  const c1 = await carState();
  h.log('gas', JSON.stringify(c1));
  await F.move(33, sx + 70, sy - 70);
  await gameWait(page, 1);
  h.log('steer', JSON.stringify(await carState()));
  const brake = await center(page, '.tb-brake');
  await F.down(34, brake[0], brake[1]);
  await gameWait(page, 0.6);
  const c2 = await carState();
  h.log('brake', JSON.stringify(c2), JSON.stringify(await h.game((g) => [...g.input._held])));
  await F.up(34);
  await F.up(33);
  const horn = await center(page, '.tb-horn');
  await F.down(35, horn[0], horn[1]);
  await gameWait(page, 0.4);
  h.log('horn held', JSON.stringify(await carState()));
  await F.up(35);
  const radio = await center(page, '.tb-radio');
  const r0 = await h.game((g) => document.querySelector('.hud-radio')?.textContent?.trim());
  await F.tap(radio[0], radio[1], 36, 100);
  await gameWait(page, 1);
  const r1 = await h.game((g) => document.querySelector('.hud-radio')?.textContent?.trim());
  h.log('radio', JSON.stringify(r0), '->', JSON.stringify(r1));
  await h.shot('31-land-driving');
  // EXIT
  await gameWait(page, 2);
  const exitB = await center(page, '.tb-car');
  await F.tap(exitB[0], exitB[1], 37, 100);
  await page.waitForFunction(() => !window.__game.player.vehicle, null, { timeout: 20000 }).catch(() => {});
  await gameWait(page, 1);
  const out = await h.game((g) => ({ in: !!g.player.vehicle, label: g.touch.carLabel.textContent, touchCar: g.touch.inCar }));
  h.log('exit', JSON.stringify(out));
  h.assert(!out.in, 'EXIT leaves the car');
  await h.shot('32-land-exit');
}
