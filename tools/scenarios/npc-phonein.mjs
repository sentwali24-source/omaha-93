// NPC scenario (short): no cop around, punch a civilian → the victim runs to a payphone and calls
// it in (heat from a phoned-in report), then heat decays once no cop has seen the player.
//   node tools/smoke.mjs --port 5214 --no-server --out tools/out/street-phonein --params "autostart=1&side=crips&set=psc&debug=1&quality=low&hour=13" --script tools/scenarios/npc-phonein.mjs
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  await h.game((g) => {
    window.__crimes = [];
    g.events.on('crime', (e) => window.__crimes.push({ type: e.type, witnessed: !!e.witnessed, reported: !!e.reported, t: +g.time.elapsed.toFixed(1) }));
    g.missions._pageIn = 9999;
  });
  // a payphone on a North O corner, the victim a few steps from it
  const setup = await h.game((g) => {
    const phone = g.shops.pois.find((p) => p.type === 'payphone' && p.district === 'north' && Math.hypot(p.x - 263, p.z + 822) > 250);
    g.debugApi.teleport(phone.x + 6, phone.z + 2);
    return { phone: phone.id, x: Math.round(phone.x), z: Math.round(phone.z) };
  });
  await waitGame(h, 1);
  await h.game((g) => {
    for (const o of [...g.police.cops]) o.position.x += 500;
    for (const u of g.police.units) u.vehicle.position.x += 500;
    const p = g.player.position;
    const v = g.debugApi.spawnPed(p.x + 1.1, p.z);
    v.brain.state = 'idle';
    v.brain.t = 30;
    window.__victim = v;
    const dx = v.position.x - p.x;
    const dz = v.position.z - p.z;
    g.player.faceHeading(Math.atan2(-dx, -dz));
    g.player.character.playOnce('punch');
    g.combat.melee(g.player, { damage: 12 });
  });
  h.log('setup', JSON.stringify(setup));
  let heat = 0;
  for (let i = 0; i < 40 && !heat; i++) {
    await waitGame(h, 1);
    heat = await h.game((g) => {
      // this test is about the phone call: keep patrols from wandering in
      for (const u of g.police.units) if (u.vehicle.position.distanceTo(g.player.position) < 90) u.vehicle.position.x += 300;
      for (const o of g.police.cops) if (!o.vehicle && o.position.distanceTo(g.player.position) < 60) o.position.x += 300;
      return g.police.heat;
    });
    if (i === 6) await h.shot('01-calling');
  }
  const crimes = await h.game(() => window.__crimes);
  h.log('crimes', JSON.stringify(crimes), 'heat', heat);
  h.assert(heat > 0 && crimes.some((c) => c.reported), 'the victim phones it in: heat from a reported crime');
  h.log('lines', lines.filter((l) => l.startsWith('[dialog]')).join(' | '));
  // decay: pretend the last sighting was 30 s ago and wait out one decay step (6.5 s)
  await h.game((g) => {
    g.police.lastSeen = g.time.elapsed - 30;
  });
  await waitGame(h, 8);
  const after = await h.game((g) => g.police.heat);
  h.log('heat after decay window', after);
  h.assert(after < heat || after === 0, 'heat decays when out of sight');
}
