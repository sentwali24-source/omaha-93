// Touch controls (run with --mobile, or on desktop with touch=1 in --params).
// Uses CDP touch events so multi-touch (stick + look + buttons) is exercised for real.
export default async function (page, h) {
  // screenshots can time out on a heavily loaded machine: log and carry on
  const snap = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i + 1 })) });
  const vp = page.viewportSize();
  const center = (sel) => h.game((g, s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);

  await h.wait(2500);
  const vis = await h.game((g) => ({ active: g.touch.active, visible: g.touch.visible, isTouch: g.input.isTouch }));
  h.log('touch state', JSON.stringify(vis));
  h.assert(vis.visible, 'touch controls visible in play');
  await snap('40-touch-idle');

  // joystick (finger 1) + look drag (finger 2) at the same time
  const p0 = await h.game((g) => ({ x: g.player.position.x, z: g.player.position.z, yaw: g.cameraRig.yaw }));
  const sx = 90, sy = vp.height - 150;
  await touch('touchStart', [[sx, sy, 1]]);
  await touch('touchMove', [[sx, sy - 50, 1]]);
  await touch('touchMove', [[sx, sy - 70, 1]]);
  await touch('touchStart', [[sx, sy - 70, 1], [vp.width * 0.6, vp.height * 0.4, 2]]);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [[sx, sy - 70, 1], [vp.width * 0.6 + i * 12, vp.height * 0.4, 2]]);
    await h.wait(60);
  }
  const mv = await h.game((g) => ({ ...g.input._virtualMove }));
  h.log('virtual move', JSON.stringify(mv));
  h.assert(mv.y > 0.6, 'stick pushes forward');
  await h.wait(1200);
  await snap('41-touch-stick');
  await touch('touchEnd', [[sx, sy - 70, 1]]);
  await touch('touchEnd', []);
  await h.wait(300);
  const p1 = await h.game((g) => ({ x: g.player.position.x, z: g.player.position.z, yaw: g.cameraRig.yaw, mv: { ...g.input._virtualMove } }));
  h.log('moved', JSON.stringify({ p0, p1 }));
  h.assert(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, 'player walked with the stick');
  h.assert(Math.abs(p1.yaw - p0.yaw) > 0.01, 'look drag turned the camera');
  h.assert(p1.mv.x === 0 && p1.mv.y === 0, 'stick released');

  // a hold interaction: the ACTION button shows the label + progress ring
  await h.game((g) => {
    const p = g.player.position;
    window.__ia = g.interactions.add({ position: { x: p.x + 0.5, z: p.z }, radius: 4, label: 'Tag wall', holdTime: 2.5, onInteract: () => g.hud.toast('TAGGED', { color: '#ff4fb8' }) });
  });
  await h.wait(600);
  const act = await center('.tb-action');
  await touch('touchStart', [[act[0], act[1], 3]]);
  await h.wait(1600);
  const prog = await h.game((g) => ({ p: g.interactions.progress, label: g.touch.promptText.textContent }));
  h.log('hold', JSON.stringify(prog));
  h.assert(prog.p > 0.05, 'holding ACTION advances the hold interaction');
  await snap('42-touch-hold');
  await touch('touchEnd', []);
  await h.game(() => window.__ia.remove());

  // pager on mobile
  await h.game((g) => g.events.emit('pager', { from: 'OG Mack', text: '411 - Payphone on 24th & Lake. Come solo.' }));
  await h.wait(1500);
  await snap('43-touch-pager');

  // MAP button opens the map; tap sets a waypoint; close button closes it
  const mapBtn = await center('.tb-map');
  await touch('touchStart', [[mapBtn[0], mapBtn[1], 4]]);
  await touch('touchEnd', []);
  await h.wait(1000);
  h.assert(await h.game((g) => g.mapScreen.open), 'MAP button opens the map');
  await touch('touchStart', [[vp.width * 0.5, vp.height * 0.3, 5]]);
  await touch('touchEnd', []);
  await h.wait(500);
  h.assert(await h.game((g) => !!g.hud.getWaypoint()), 'tap sets a waypoint');
  // pinch zoom
  const cx = vp.width / 2, cy = vp.height / 2;
  await touch('touchStart', [[cx - 40, cy, 6], [cx + 40, cy, 7]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[cx - 40 - i * 15, cy, 6], [cx + 40 + i * 15, cy, 7]]);
  await touch('touchEnd', []);
  await h.wait(600);
  await snap('44-touch-map');
  const closeBtn = await center('.map-close');
  await touch('touchStart', [[closeBtn[0], closeBtn[1], 8]]);
  await touch('touchEnd', []);
  await h.wait(600);
  h.assert(await h.game((g) => !g.mapScreen.open && !g.paused), 'close button closes the map');

  // in-car controls
  // the nearest empty (parked) car: stand next to its driver door
  const carAt = await h.game((g) => {
    const p = g.player.position;
    const v = g.vehiclesNear(p.x, p.z, 150, (q) => !q.driver && !q.isPolice).sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0] || g.vehicles.find((q) => !q.driver);
    if (!v) return null;
    const hx = -Math.cos(v.heading), hz = Math.sin(v.heading); // left side of the car
    g.debugApi.teleport(v.position.x + hx * 2.2, v.position.z + hz * 2.2);
    return { x: v.position.x, z: v.position.z };
  });
  h.log('car at', JSON.stringify(carAt));
  await h.wait(1200);
  const carBtn = await center('.tb-car');
  await touch('touchStart', [[carBtn[0], carBtn[1], 9]]);
  await touch('touchEnd', []);
  await page.waitForFunction(() => !!window.__game.player.vehicle, null, { timeout: 8000 }).catch(() => {});
  h.assert(await h.game((g) => !!g.player.vehicle), 'CAR button enters the car');
  h.log('in car', JSON.stringify(await h.game((g) => ({ inCar: g.touch.inCar, brake: getComputedStyle(document.querySelector('.tb-brake')).display, horn: getComputedStyle(document.querySelector('.tb-horn')).display, punch: getComputedStyle(document.querySelector('.tb-punch')).display }))));
  await touch('touchStart', [[sx, sy, 10]]);
  await touch('touchMove', [[sx + 20, sy - 70, 10]]);
  await h.wait(2500);
  await snap('45-touch-car');
  await touch('touchEnd', []);

  // PAUSE hides the controls (and the HUD); resume brings them back
  const pauseBtn = await center('.tb-pause');
  await touch('touchStart', [[pauseBtn[0], pauseBtn[1], 11]]);
  await touch('touchEnd', []);
  await h.wait(500);
  const paused = await h.game((g) => ({ paused: g.paused, touch: g.touch.visible, hud: g.hud.visible }));
  h.assert(paused.paused && !paused.touch && !paused.hud, 'pause hides touch + HUD');
  await h.game((g) => g.menu.hidePause());
  await h.wait(400);

  // landscape phone
  await page.setViewportSize({ width: 844, height: 390 });
  await h.wait(800);
  await h.game((g) => { g.player.exitVehicle?.(true); });
  await h.wait(600);
  await h.game((g) => {
    const p = g.player.position;
    window.__ia = g.interactions.add({ position: { x: p.x + 0.5, z: p.z }, radius: 4, label: 'Roll with me', holdTime: 0 });
    g.hud.setObjective('Bring 2 homies back to Kountze Park');
  });
  await h.wait(900);
  await snap('46-touch-landscape');
  await h.game(() => window.__ia.remove());
}

