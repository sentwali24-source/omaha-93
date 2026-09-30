// HUD against the real game systems: pager + payphone marker from Missions, a mission card, zone
// banner, real prompts (payphone, tag wall, Roll with me), in-car HUD with the real radio, the map
// with a waypoint, heat badges. With --mobile the viewport is switched to landscape (844×390).
//   node tools/smoke.mjs --port 5215 --no-server --out tools/out/ui-hud-live \
//     --params "autostart=1&side=bloods&set=lvb&debug=1&quality=low" --script tools/scenarios/hud-live.mjs [--mobile]
export default async function (page, h) {
  const mobile = await h.game(() => navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  if (mobile) await page.setViewportSize({ width: 844, height: 390 });
  const hud = () => h.game((g) => g.debugApi.hud());
  const promptAt = async (label, fn) => {
    const at = await h.game(fn);
    if (!at) {
      h.log(label, 'nothing found');
      return null;
    }
    await h.game((g, a) => {
      g.debugApi.teleport(a.x, a.z);
      g.cameraRig?.snap?.();
    }, at);
    let prompt = null;
    for (let i = 0; i < 12 && !prompt; i++) {
      await h.wait(400);
      prompt = await h.game((g) => g.hud.promptText);
    }
    const touchLabel = await h.game((g) => (g.touch.visible ? g.touch.promptText.textContent : null));
    h.log(label, JSON.stringify({ prompt, touchLabel }));
    return prompt;
  };

  await h.wait(2500);
  h.assert((await hud()).visible, 'HUD visible in play');
  await h.shot('50-play');

  // pager + payphone marker straight from the Missions system
  const offer = await h.game((g) => g.debugApi.missions.page());
  await h.wait(1500);
  const st1 = await h.game((g) => ({ markers: [...g.hud.markers.values()].map((m) => `${m.id}:${m.type}${m.important ? '!' : ''}`), pager: document.querySelector('.hud-pager')?.className || null, obj: document.querySelector('.hud-objective')?.textContent || '' }));
  h.log('offer', offer, JSON.stringify(st1));
  await h.shot('51-pager');

  // answer it → mission title card, objective, mission markers
  const started = await h.game((g) => g.debugApi.missions.answer());
  await h.wait(1200);
  const act = await h.game((g) => g.debugApi.missions.active());
  h.log('mission', started, JSON.stringify(act));
  await h.shot('52-mission');

  // real prompts
  await promptAt('payphone', (g) => {
    const p = g.player.position;
    const ph = g.city.pois.filter((q) => q.type === 'payphone').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    return ph ? { x: ph.x + 0.8, z: ph.z + 0.8 } : null;
  });
  const tag = await promptAt('tag wall', (g) => {
    const mine = g.state.player.setId;
    const p = g.player.position;
    const s = g.tagging.spots.filter((q) => q.owner !== mine).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!s) return null;
    const nx = s.nx ?? s.normal?.x ?? 0;
    const nz = s.nz ?? s.normal?.z ?? 0;
    return { x: s.x + nx * 1.2, z: s.z + nz * 1.2 };
  });
  if (tag) await h.shot('53-prompt-tag');
  await h.game((g) => g.debugApi.missions.abort());
  const roll = await promptAt('homie', (g) => {
    const mine = g.state.player.setId;
    const a = g.actors.find((q) => q.kind === 'gang' && q.setId === mine && q.alive && !q.userData?.homie);
    return a ? { x: a.position.x + 1.1, z: a.position.z } : null;
  });
  if (roll) await h.shot('54-prompt-homie');

  // zone banner: walk into another set's turf
  await h.game((g) => g.debugApi.teleport(150, -560));
  await h.wait(900);
  await h.game((g) => g.debugApi.teleport(372, 120));
  await h.wait(2200);
  h.log('zone', JSON.stringify((await hud()).zone));
  await h.shot('55-zone');

  // in a car: speedometer + real radio popup
  await h.game((g) => g.debugApi.teleport(150, -420));
  await h.wait(600);
  await h.game((g) => g.debugApi.driveCar('lowrider'));
  await h.wait(900);
  const radio = await h.game((g) => ({ show: document.querySelector('.hud-radio')?.classList.contains('show'), text: document.querySelector('.hud-radio')?.textContent, station: g.audio.radio?.station?.name, inCar: g.touch.inCar }));
  h.log('radio', JSON.stringify(radio));
  await h.down('KeyW');
  await h.wait(3000);
  await h.shot('56-car');
  await h.up('KeyW');
  const car = await h.game((g) => ({ mph: g.hud.speedoNum.textContent, speed: g.player.vehicle?.speed }));
  h.log('car', JSON.stringify(car));
  await h.game((g) => g.player.exitVehicle(true));
  await h.wait(1200);
  const off = await h.game(() => ({ show: document.querySelector('.hud-radio')?.classList.contains('show'), text: document.querySelector('.hud-radio')?.textContent }));
  h.log('radio after exit', JSON.stringify(off));
  h.assert(!off.show || !/OFF/.test(off.text || ''), 'no RADIO OFF popup on foot');

  // heat badges
  await h.game((g) => g.police.setHeat?.(2));
  await h.wait(800);
  await h.shot('57-heat');
  await h.game((g) => g.police.setHeat?.(0));

  // map with a waypoint
  await h.game((g) => g.debugApi.waypoint(515, 232));
  await h.game((g) => g.mapScreen.toggle());
  await h.wait(1500);
  h.assert(await h.game((g) => g.mapScreen.open && g.paused), 'map open and paused');
  await h.shot('58-map');
  await h.game((g) => g.mapScreen.close());
  await h.wait(800);
  h.assert(await h.game((g) => !g.mapScreen.open && !g.paused), 'map closed and resumed');
  await h.shot('59-after-map');
}
