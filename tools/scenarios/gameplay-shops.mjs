// Every shop type: buy, change clothes / colors, haircut, tape, respray, rest at the hood,
// payphone job menu; verifies state, events, input restore and the saved game.
//   node tools/smoke.mjs --port 5207 --no-server --out tools/out/gameplay-shops --script tools/scenarios/gameplay-shops.mjs [--mobile]
async function goto(h, type) {
  const id = await h.game((g, type) => {
    const id = g.debugApi.shops.goto(type);
    const poi = g.shops.pois.find((p) => p.id === id);
    g.cameraRig.yaw = (poi?.heading || 0) + 2.6;
    g.cameraRig.pitch = 0.25;
    g.cameraRig.snap();
    return id;
  }, type);
  await waitFor(h, (g, id) => g.interactions.current?.id === `shop:${id}`, id);
  const prompt = await h.game((g) => g.hud.prompt);
  h.log(`at ${type} (${id}): prompt "${prompt}"`);
  return { id, prompt };
}

/** Poll a game predicate until it is truthy (headless frame rates vary wildly). */
async function waitFor(h, fn, arg, ms = 8000) {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < ms) {
    v = await h.game(fn, arg);
    if (v) return v;
    await h.wait(150);
  }
  return v;
}

async function clickText(h, text) {
  const el = h.page.locator('.shop-opt, .shop-btn', { hasText: text }).first();
  await el.click({ timeout: 15000 });
  await h.wait(250);
}

export default async function (page, h) {
  const mobile = await h.game(() => matchMedia('(pointer: coarse)').matches);
  await h.game((g) => {
    window.__buys = [];
    window.__outfits = [];
    g.events.on('shop:purchase', (p) => window.__buys.push({ type: p.shop.type, item: p.item, cost: p.cost }));
    g.events.on('player:outfit', (p) => window.__outfits.push(p.look));
    g.debugApi.give(500);
    g.player.health = 40;
    // keep the pager quiet during the shop tour
    g.missions._pageIn = 9999;
  });
  const fb = await h.game((g) => g.debugApi.shops.fallbackTypes());
  h.log('fallback POI types:', fb.join(','));

  // store + food
  let r = await goto(h, 'store');
  h.assert(/Pop & chips/.test(r.prompt), 'store prompt');
  await h.press('KeyE');
  await waitFor(h, (g) => g.player.health > 40);
  let s = await h.game((g) => ({ hp: g.player.health, cash: g.state.cash }));
  h.log('after snack', JSON.stringify(s));
  h.assert(s.hp === 70 && s.cash === 557, 'snack: +30 HP, -$3');
  r = await goto(h, 'food');
  await h.press('KeyE');
  await waitFor(h, (g) => g.player.health >= 100);
  s = await h.game((g) => ({ hp: g.player.health, cash: g.state.cash }));
  h.log('after dinner', JSON.stringify(s));
  h.assert(s.hp === 100 && s.cash === 549, 'dinner: full HP, -$8');

  // clothes: go neutral in a flannel with a beanie
  r = await goto(h, 'clothes');
  await h.press('KeyE');
  await waitFor(h, (g) => g.debugApi.shops.panelOpen());
  const open = await h.game((g) => ({ panel: g.debugApi.shops.panelOpen(), input: g.input.enabled }));
  h.assert(open.panel && open.input === false, 'clothes panel open, game input disabled');
  await clickText(h, 'Flannel');
  await clickText(h, 'Beanie');
  await clickText(h, 'Go neutral');
  await h.shot(mobile ? '30-clothes-mobile' : '30-clothes');
  const label = await h.page.locator('.shop-confirm').textContent();
  h.log('confirm label:', label);
  await clickText(h, 'Buy');
  await h.wait(400);
  s = await h.game((g) => ({ colors: g.state.wearingColors, look: g.state.player.look, cash: g.state.cash, input: g.input.enabled, panel: g.debugApi.shops.panelOpen(), outfits: window.__outfits.length }));
  h.log('after clothes', JSON.stringify(s));
  h.assert(s.colors === false && s.look.outfit === 'flannel' && s.look.hat === 'beanie', 'neutral flannel + beanie saved');
  h.assert(s.cash === 549 - 35 - 12, 'clothes cost $47');
  h.assert(s.input === true && !s.panel, 'panel closed and input restored');
  h.assert(s.outfits === 1, 'player:outfit emitted');

  // barber: braids via keyboard (arrows + Enter), then confirm
  r = await goto(h, 'barber');
  await h.press('KeyE');
  await waitFor(h, (g) => g.debugApi.shops.panelOpen());
  await clickText(h, 'Braids');
  await h.shot('31-barber');
  await clickText(h, 'Cut it');
  s = await h.game((g) => ({ hair: g.state.player.look.hair, cash: g.state.cash }));
  h.assert(s.hair === 'braids' && s.cash === 490, 'barber: braids, -$12');

  // record store: buy a tape, Esc closes without opening the pause menu
  r = await goto(h, 'record');
  await h.press('KeyE');
  await waitFor(h, (g) => g.debugApi.shops.panelOpen());
  await clickText(h, 'Northside Summer Mixtape');
  await h.wait(300);
  await h.shot('32-records');
  await h.press('Escape');
  await waitFor(h, (g) => !g.debugApi.shops.panelOpen());
  await h.wait(400);
  s = await h.game((g) => ({ tape: g.state.flags['radio.1'], cash: g.state.cash, paused: g.paused, input: g.input.enabled, panel: g.debugApi.shops.panelOpen() }));
  h.log('after tape', JSON.stringify(s));
  h.assert(s.tape === true && s.cash === 480, 'tape bought: flags radio.1');
  h.assert(!s.paused && s.input && !s.panel, 'Esc closed the panel only');

  // garage: park the car next to the body shop, get out, respray (-2 stars)
  const car = await h.game((g) => {
    const v = g.vehicles.find((q) => !q.isPolice);
    if (!v) return null;
    const id = g.debugApi.shops.goto('garage');
    const poi = g.shops.pois.find((p) => p.id === id);
    g.player.enterVehicle(v);
    v.position.set(poi.x + 3, 0, poi.z + 3);
    g.player.exitVehicle(true);
    g.debugApi.teleport(poi.x, poi.z);
    g.debugApi.heat(3);
    return v.color;
  });
  await waitFor(h, (g) => /Respray/.test(g.hud.prompt || ''));
  r = { prompt: await h.game((g) => g.hud.prompt) };
  h.log('garage prompt:', r.prompt);
  h.assert(/Respray/.test(r.prompt || ''), 'garage offers a respray');
  await h.press('KeyE');
  await waitFor(h, (g) => g.police.heat < 3);
  s = await h.game((g) => ({ heat: g.police.heat, cash: g.state.cash, color: g.shops.lastCar?.color }));
  h.log('after respray', JSON.stringify(s), 'old color', car);
  h.assert(s.heat === 1 && s.cash === 380 && s.color !== car, 'respray: new color, heat -2, -$100');
  await h.game((g) => g.debugApi.heat(0));

  // payphone: four calls cost a dollar; the job menu lists work
  r = await goto(h, 'payphone');
  h.assert(/payphone/i.test(r.prompt || ''), 'payphone prompt');
  await h.game((g) => {
    g.state.missions.completed.push('story1');
  });
  await h.press('KeyE');
  await waitFor(h, (g) => g.debugApi.shops.panelOpen());
  await h.wait(400);
  await h.shot(mobile ? '33-payphone-menu-mobile' : '33-payphone-menu');
  const jobs = await h.page.locator('.shop-opt').allTextContents();
  h.log('jobs:', JSON.stringify(jobs));
  h.assert(jobs.length >= 2, 'payphone lists jobs');
  await h.page.locator('.shop-opt').first().click();
  await waitFor(h, (g) => !!g.missions.active);
  const act = await h.game((g) => g.missions.active?.title);
  h.log('started from payphone:', act);
  h.assert(!!act, 'job started from the payphone menu');
  await h.press('KeyE');
  await waitFor(h, (g) => g.debugApi.shops.panelOpen());
  await clickText(h, 'Drop the job');
  await waitFor(h, (g) => !g.missions.active);
  s = await h.game((g) => ({ active: !!g.missions.active, change: g.state.flags['shops.change'], cash: g.state.cash }));
  h.log('after dropping', JSON.stringify(s));
  h.assert(!s.active, 'job dropped from the payphone');
  for (let i = 0; i < 2; i++) {
    await waitFor(h, (g) => g.interactions.current?.id?.startsWith('shop:') && g.input.enabled);
    await h.press('KeyE');
    await waitFor(h, (g) => g.debugApi.shops.panelOpen());
    await h.press('Escape');
    await waitFor(h, (g) => !g.debugApi.shops.panelOpen());
  }
  s = await h.game((g) => ({ change: g.state.flags['shops.change'], cash: g.state.cash }));
  h.log('after 4 calls', JSON.stringify(s));
  h.assert(s.cash === 379 && s.change === 0, 'four calls = $1');

  // hood: chill = heal + save
  await h.game((g) => {
    g.player.health = 20;
  });
  r = await goto(h, 'hood');
  await h.press('KeyE');
  await waitFor(h, (g) => g.player.health >= 100 && g.input.enabled);
  await h.wait(300);
  s = await h.game((g) => {
    const raw = JSON.parse(localStorage.getItem('omaha93.save.v1'));
    return { hp: g.player.health, savedHp: raw.health, savedLook: raw.player.look, savedColors: raw.wearingColors, tape: raw.flags['radio.1'] };
  });
  h.log('after chilling', JSON.stringify(s));
  h.assert(s.hp === 100 && s.savedHp === 100, 'healed and saved');
  h.assert(s.savedLook.outfit === 'flannel' && s.savedColors === false && s.tape === true, 'save has look, colors, tape');
  const buys = await h.game(() => window.__buys.map((b) => `${b.type}:${b.cost}`));
  h.log('purchases', buys.join(' '));
  await h.shot('34-hood');
}
