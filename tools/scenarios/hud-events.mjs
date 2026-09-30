// HUD event coverage: prompt (tap + hold), KO big message + fade + respawn, busted, turf taken,
// mission start/complete, rank up, toasts stacking, zone banners across districts.
export default async function (page, h) {
  // screenshots can time out on a heavily loaded machine: log and carry on
  const snap = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  await h.wait(1200);
  await h.game((g) => {
    const p = g.player.position;
    window.__ia = g.interactions.add({ position: { x: p.x + 0.5, z: p.z }, radius: 4, label: 'Use payphone', holdTime: 0, onInteract: () => g.hud.toast('RING RING', {}) });
  });
  await h.wait(500);
  await snap('50-prompt');
  await h.game(() => window.__ia.remove());
  await h.game((g) => {
    const p = g.player.position;
    window.__ia = g.interactions.add({ position: { x: p.x + 0.5, z: p.z }, radius: 4, label: 'Tag wall', holdTime: 3 });
  });
  await h.down('KeyE');
  await h.wait(1500);
  await snap('51-prompt-hold');
  await h.up('KeyE');
  await h.game(() => window.__ia.remove());

  // mission flow through the real Missions system: page → answer → skip objectives → passed
  await h.game((g) => {
    g.debugApi.missions.page();
    g.debugApi.missions.answer();
  });
  await h.wait(900);
  await snap('52-mission-start');
  await h.wait(2000);
  await snap('53-mission-update');
  for (let i = 0; i < 6 && (await h.game((g) => !!g.missions.active)); i++) {
    await h.game((g) => g.debugApi.completeObjective());
    await h.wait(700);
  }
  await h.game((g) => {
    g.addCash(200, 'mission');
    g.addRep(50, 'mission');
    g.addRep(60, 'bonus');
  });
  await h.wait(1200);
  await snap('54-mission-passed');
  const st = await h.game((g) => ({ rank: g.hud.rankName.textContent, toasts: g.hud._toasts.map((t) => t.txt.textContent) }));
  h.log(JSON.stringify(st));

  // turf taken: flip the contested 30th & Spencer zone to the player
  await h.wait(3000);
  await h.game((g) => g.gangs.addInfluence('spencer', g.state.player.setId, 20));
  await h.game((g) => g.gangs.addInfluence('lake24', g.state.player.setId, 90));
  await h.wait(900);
  await snap('55-turf-taken');

  // knocked out → fade → respawn
  await h.wait(3500);
  await h.game((g) => g.player.takeDamage(40, null));
  await h.wait(300);
  await snap('56-damage');
  await h.game((g) => g.player.knockOut(null));
  await h.wait(900);
  await snap('57-ko');
  await h.wait(3200);
  await snap('58-ko-fade');
  await h.wait(2500);
  const after = await h.game((g) => ({ fade: g.hud.fadeEl.style.opacity, alive: g.player.alive }));
  h.log('after respawn', JSON.stringify(after));
  await snap('59-respawned');

  // zone banners: downtown (neutral) then Old Market, then a rival zone
  await h.game((g) => g.debugApi.teleport(360, 60));
  await h.wait(1500);
  await snap('60-zone-downtown');
  await h.game((g) => g.debugApi.teleport(-300, -450));
  await h.wait(1500);
  await snap('61-zone-rival');
}
