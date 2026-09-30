// First hour, part E (quality medium, New Game by clicks): buy food + clothes with the keyboard,
// input comes back after the panel; drive a car and press F at speed; get heat and get busted;
// pause → save → quit → Continue restores the save.
import { collectDialog } from './npc-util.mjs';
import { until, walkTo, holdKey, snap, waitGame, newGameByClicks } from './qa-firsthour-util.mjs';

async function goToPoi(h, type) {
  const poi = await h.game((g, type) => {
    const p = g.player.position;
    const list = g.shops.pois.filter((q) => g.shops.kindOf(q) === type).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const q = list[0];
    return q && { x: q.x, z: q.z, heading: q.heading || 0, name: q.name };
  }, type);
  if (!poi) return null;
  // come at it from the street side (POIs face the street along their heading)
  await h.game((g, q) => { const fx = -Math.sin(q.heading), fz = -Math.cos(q.heading); g.debugApi.teleport(q.x - fx * 5, q.z - fz * 5); }, poi);
  await waitGame(h, 0.3);
  const d = await walkTo(h, poi.x, poi.z, 0.5, 6);
  const pr = await until(h, (g) => g.hud.prompt, null, 2);
  h.log(type, poi.name, 'dist', d.toFixed(2), 'prompt', pr);
  return poi;
}

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  // subtitle timeline: when each line actually goes up, and for how long it stayed
  await h.game((g) => {
    const hud = g.hud;
    window.__subs = [];
    const orig = hud._nextDialog.bind(hud);
    hud._nextDialog = () => {
      const prev = hud._dialog;
      if (prev) window.__subs.push(`${prev.speaker}: shown ${prev.t.toFixed(1)}s of ${prev.dur.toFixed(1)}s`);
      return orig();
    };
  });
  await h.wait(800);
  await newGameByClicks(page, h, 'crips', 'rlc');
  await h.game((g) => { g.missions._pageIn = 9999; g.player.health = 55; });
  h.log('start', JSON.stringify(await snap(h)));
  await waitGame(h, 2.5);
  h.log('tip lines', JSON.stringify(lines.filter((l) => l.includes('TIP'))));
  // ---- food
  await goToPoi(h, 'food');
  await h.press('KeyE');
  await waitGame(h, 0.5);
  h.log('after food', JSON.stringify(await snap(h)));
  // ---- clothes: panel with keyboard
  await goToPoi(h, 'clothes');
  await h.press('KeyE');
  await until(h, (g) => g.shops.panel.isOpen, null, 2);
  await h.shot('e-clothes-panel');
  const panel1 = await h.game((g) => ({ open: g.shops.panel.isOpen, input: g.input.enabled, items: [...document.querySelectorAll('.shop-panel button')].map((b) => b.textContent.trim().slice(0, 40)).slice(0, 14) }));
  h.log('clothes panel', JSON.stringify(panel1));
  if (panel1.open) {
    await h.press('ArrowDown'); await h.press('Enter');
    await h.wait(500);
    await h.press('Escape');
  }
  await h.wait(500);
  const after = await h.game((g) => ({ open: g.shops.panel.isOpen, input: g.input.enabled, paused: g.paused, colors: g.state.wearingColors, cash: g.state.cash, look: g.state.player.look?.outfit }));
  h.log('after clothes', JSON.stringify(after));
  h.assert(!after.open && after.input && !after.paused, 'panel closed and input back after Esc');
  const p0 = await h.game((g) => [g.player.position.x, g.player.position.z]);
  await h.hold('KeyS', 1500);
  const p1 = await h.game((g) => [g.player.position.x, g.player.position.z]);
  h.log('walks after panel', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2));
  // ---- car: F at speed
  const car = await h.game((g) => {
    const p = g.player.position;
    const v = g.vehicles.filter((v) => !v.driver && !v.isPolice && v.model !== 'bus').sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0];
    return v && { x: v.position.x, z: v.position.z, model: v.model };
  });
  await h.game((g, c) => g.debugApi.teleport(c.x + 3, c.z + 2), car);
  await waitGame(h, 0.3);
  await walkTo(h, car.x, car.z, 2.4, 5);
  await h.press('KeyF');
  const inCar = await until(h, (g) => !!g.player.vehicle, null, 4);
  h.log('in car', inCar, car.model);
  if (inCar) {
    await h.down('KeyW');
    const sp = await until(h, (g) => Math.abs(g.player.vehicle?.speed || 0) > 9 && g.player.vehicle.speed, null, 6);
    h.log('speed before F', sp);
    await h.press('KeyF');
    await waitGame(h, 0.2);
    h.log('right after F', JSON.stringify(await h.game((g) => ({ inCar: !!g.player.vehicle, speed: g.player.vehicle?.speed, wanted: g.player._exitWanted }))));
    const out = await until(h, (g) => !g.player.vehicle, null, 5);
    await h.up('KeyW');
    h.log('got out while holding W', out, JSON.stringify(await snap(h)));
    h.assert(out, 'F at speed brakes and gets out');
    await h.shot('e-exit');
  }
  // ---- heat → busted
  await h.game((g) => g.debugApi.heat(1));
  const cop = await h.game((g) => { const p = g.player.position; return g.debugApi.spawnCop(p.x + 6, p.z + 4); });
  h.log('cop', JSON.stringify(cop));
  const busted = await until(h, (g) => g.police.busted || g.player.down === 'busted', null, 25);
  h.log('busted?', busted, JSON.stringify(await h.game((g) => g.debugApi.police())));
  await h.shot('e-busted');
  const resp = await until(h, (g) => !g.player.down && g.player.state === 'active' && g.police.heat === 0 && g.input.enabled && Math.hypot(g.player.position.x - (-9999), 0) && g.state.stats.busted > 0, null, 15);
  h.log('after bust', !!resp, JSON.stringify(await snap(h)), JSON.stringify(await h.game((g) => g.layout.describe(g.player.position.x, g.player.position.z)?.street)));
  await waitGame(h, 1);
  await h.shot('e-released');
  const q0 = await h.game((g) => [g.player.position.x, g.player.position.z]);
  await h.hold('KeyW', 1500);
  const q1 = await h.game((g) => [g.player.position.x, g.player.position.z]);
  h.log('walks after bust', Math.hypot(q1[0] - q0[0], q1[1] - q0[1]).toFixed(2));
  // ---- pause → save → quit → continue
  const before = await h.game((g) => ({ cash: g.state.cash, rep: g.state.rep, pos: [Math.round(g.player.position.x), Math.round(g.player.position.z)], look: g.state.player.look?.outfit, flags: Object.keys(g.state.flags || {}) }));
  await h.press('Escape');
  await h.wait(800);
  await page.click('.m-item[data-key="save"]', { timeout: 60000 });
  await h.wait(400);
  await page.click('.m-item[data-key="quit"]', { timeout: 60000 });
  await h.wait(400);
  await page.click('.m-modal .m-btn-primary', { timeout: 60000 });
  await h.wait(1500);
  await page.click('.m-item[data-key="continue"]', { timeout: 60000 });
  await h.wait(2000);
  const aft = await h.game((g) => ({ mode: g.mode, input: g.input.enabled, cash: g.state.cash, rep: g.state.rep, pos: [Math.round(g.player.position.x), Math.round(g.player.position.z)], look: g.state.player.look?.outfit, flags: Object.keys(g.state.flags || {}) }));
  h.log('save', JSON.stringify(before), 'continue', JSON.stringify(aft));
  h.assert(aft.mode === 'play' && aft.input && aft.cash === before.cash && aft.rep === before.rep, 'Continue restores cash/rep');
  await h.shot('e-continued');
  // the car tip follows the story3 brief (flags persist in the save, so it shows once)
  const q = await h.game((g) => { g.state.missions.completed.push('story1', 'story2'); g.debugApi.startMission('story3'); return g.missions._dialog.map((l) => `${l.speaker}: ${l.text}`); });
  h.log('story3 queue', JSON.stringify(q));
  h.assert(q.some((l) => l.startsWith('TIP') && /press F/.test(l)), 'car tip queued after the story3 brief');
  h.log('subtitles:\n  ' + (await h.game(() => window.__subs)).join('\n  '));
  h.log('lines:\n  ' + lines.filter((l) => !l.startsWith('[toast] objective')).slice(0, 50).join('\n  '));
}
