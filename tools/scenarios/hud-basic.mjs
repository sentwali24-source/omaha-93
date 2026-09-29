// HUD smoke: in-play HUD, radar blips, toasts, pager, dialog, big message, zone banner, FPS.
export default async function (page, h) {
  await h.wait(1500);
  await h.game((g) => {
    g.applySettings({ showFps: true });
    g.addCash(50, 'test');
    g.addRep(15, 'test');
    g.police.setHeat(2);
    g.hud.setObjective('Tag 3 Northfield Pirus walls on Fort St (1/3)');
    // fake actors so every radar blip type shows up (the NPC stubs spawn nobody)
    const Actor = Object.getPrototypeOf(g.player.constructor);
    const Group = g.player.root.constructor;
    const mk = (kind, side, faction, x, z) => {
      const character = { root: new Group(), setAnim() {}, playOnce() {}, update() {}, setVisible() {}, dispose() {} };
      const a = new Actor(g, { kind, side, faction, character, x, z });
      g.addActor(a);
      return a;
    };
    const p = g.player.position;
    mk('gang', 'bloods', 'lvb', p.x + 22, p.z - 34);
    mk('gang', 'bloods', 'lvb', p.x + 28, p.z - 38);
    mk('cop', null, 'police', p.x - 44, p.z + 12);
    g.gangs.homies.push(mk('gang', 'crips', 'psc', p.x - 8, p.z + 6));
    const V = g.vehicles[0].constructor;
    const v = new V(g, { model: 'police', x: p.x - 70, z: p.z - 40, police: true });
    v.siren = true;
    g.addVehicle(v);
    g.hud.addMarker({ id: 'tgt', type: 'target', x: p.x + 60, z: p.z + 40, label: 'Rival car' });
    g.hud.addMarker({ id: 'far', type: 'mission', x: p.x - 400, z: p.z + 300 });
    g.city.pois.push({ id: 'c1', type: 'clothes', x: p.x + 40, z: p.z + 20 }, { id: 'f1', type: 'food', x: p.x - 30, z: p.z - 50 }, { id: 'p1', type: 'payphone', x: p.x + 8, z: p.z - 14 }, { id: 'g1', type: 'garage', x: p.x - 60, z: p.z + 60 });
    g.hud.minimap._pois = null;
  });
  await h.wait(1500);
  await h.shot('10-hud');
  await h.game((g) => {
    g.events.emit('pager', { from: 'OG Mack', text: '911 - Meet me at the payphone on 24th & Lake. Bring the homies, we got business.' });
    g.hud.pager('Lil Dre', '143 - Mama says come home for dinner');
    g.hud.dialog('Big Loc', "What's crackin', cuz? You claimin' or what?", { color: '#7fb0ff' });
  });
  await h.wait(1600);
  await h.shot('11-pager');
  await h.game((g) => g.hud.bigMessage('BUSTED', 'Bail comes out of your pocket'));
  await h.wait(900);
  await h.shot('12-big');
  const st = await h.game((g) => ({ pagerQueue: g.hud._pager.queue.length, perf: g.perf.calls, fps: g.hud.fpsEl.textContent }));
  h.log(JSON.stringify(st));
  await h.wait(8000);
  await h.shot('13-second-page');
}
