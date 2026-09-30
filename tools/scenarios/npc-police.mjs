// NPC scenario: police heat. Punch a civilian in front of a cop downtown → heat → officers chase
// on foot → stand still → BUSTED → jail respawn clears heat. Then: an unwitnessed assault gets
// phoned in by a civilian; heat decays once no cop has seen the player for a while.
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const dialogs = collectDialog(page);
  await dialogs.ready;
  const events = [];
  await h.game((g) => {
    window.__npcEvents = [];
    for (const n of ['crime', 'heat:change', 'player:busted', 'player:respawn']) g.events.on(n, (e) => window.__npcEvents.push({ n, level: e?.level, type: e?.type, witnessed: e?.witnessed, reported: e?.reported, t: +g.time.elapsed.toFixed(1) }));
  });
  // downtown, 16th & Douglas
  await h.game((g) => {
    g.debugApi.teleport(372, 72);
    g.player.faceHeading(Math.PI / 2); // facing west
    g.cameraRig.yaw = Math.PI / 2 + 0.6;
  });
  await waitGame(h, 1);
  const setup = await h.game((g) => {
    const p = g.player.position;
    const cop = g.debugApi.spawnCop(p.x - 7, p.z + 1.5, 'patrol');
    const ped = g.debugApi.spawnPed(p.x - 1.1, p.z);
    ped.brain.state = 'idle';
    ped.brain.t = 30;
    return { cop, ped: ped.id, units: g.debugApi.police().units.length };
  });
  h.log('setup', JSON.stringify(setup));
  await waitGame(h, 0.5);
  // punch the civilian (same path as the player's combo: combat.melee)
  for (let i = 0; i < 2; i++) {
    await h.game((g) => {
      const ped = g.pedestrians.peds.find((a) => a.alive && a.position.distanceTo(g.player.position) < 2.5);
      if (ped) {
        const dx = ped.position.x - g.player.position.x;
        const dz = ped.position.z - g.player.position.z;
        g.player.faceHeading(Math.atan2(-dx, -dz));
      }
      g.player.character.playOnce('punch');
      g.combat.melee(g.player, { damage: 12 });
    });
    await waitGame(h, 0.5);
  }
  let pol = await h.game((g) => g.debugApi.police());
  h.log('after punching a civilian', JSON.stringify({ heat: pol.heat, points: pol.points }));
  h.assert(pol.heat >= 1, 'a cop who saw the assault raises heat');
  await h.shot('01-assault');
  // hit the officer → assaulting an officer escalates
  await h.game((g) => {
    const cop = g.police.cops.find((o) => !o.vehicle && o.alive);
    cop.takeDamage(10, g.player, { x: -1, z: 0 }, 2);
  });
  await waitGame(h, 2.5);
  pol = await h.game((g) => g.debugApi.police());
  h.log('after hitting a cop', JSON.stringify(pol));
  h.assert(pol.heat >= 2, 'assaulting an officer escalates to 2+ stars');
  h.assert(pol.units.some((u) => u.pursuit), 'a cruiser joins the pursuit');
  await h.shot('02-cops-coming');
  // stand still: officers close in and cuff
  let busted = false;
  for (let i = 0; i < 24 && !busted; i++) {
    await waitGame(h, 0.5);
    busted = await h.game(() => window.__npcEvents.some((e) => e.n === 'player:busted'));
    if (i === 3) await h.shot('03-closing-in');
  }
  pol = await h.game((g) => g.debugApi.police());
  h.log('bust', JSON.stringify({ busted, heat: pol.heat, foot: pol.foot }));
  h.assert(busted, "officer reaching the stopped player for 1.5 s → 'player:busted'");
  await h.shot('04-busted');
  await waitGame(h, 4.5);
  const after = await h.game((g) => ({ heat: g.police.heat, x: Math.round(g.player.position.x), z: Math.round(g.player.position.z), units: g.police.units.filter((u) => u.pursuit).length }));
  h.log('after respawn', JSON.stringify(after));
  h.assert(after.heat === 0 && after.units === 0, 'respawn clears heat and the pursuit');

  // ---- civilian phones it in (no cop around), then heat decays
  await h.game((g) => {
    g.state.wearingColors = false; // neutral clothes: faster decay
    g.debugApi.teleport(-240, -760); // North O side street
    g.player.faceHeading(0);
  });
  await waitGame(h, 1);
  await h.game((g) => {
    for (const o of [...g.police.cops]) if (o.position.distanceTo(g.player.position) < 80) o.position.set(o.position.x + 400, 0, o.position.z);
    for (const u of g.police.units) u.vehicle.position.x += 400;
    const p = g.player.position;
    const victim = g.debugApi.spawnPed(p.x, p.z - 1.1);
    victim.brain.state = 'idle';
    victim.brain.t = 30;
    const w = g.debugApi.spawnPed(p.x + 6, p.z - 2);
    w.brain.state = 'idle';
    w.brain.t = 30;
    victim.takeDamage(12, g.player, { x: 0, z: -1 }, 2);
  });
  let reported = false;
  for (let i = 0; i < 80 && !reported; i++) {
    await waitGame(h, 0.5);
    reported = await h.game((g) => g.police.heat > 0);
  }
  const ev = await h.game(() => window.__npcEvents.filter((e) => e.n === 'crime').slice(-3));
  h.log('phoned-in', JSON.stringify({ reported, crimes: ev }));
  h.assert(reported, 'a civilian witness phones the crime in after a delay');
  // stay out of sight: heat decays
  const decayStart = await h.game((g) => g.time.elapsed);
  let decayed = false;
  for (let i = 0; i < 90 && !decayed; i++) {
    await waitGame(h, 1);
    decayed = await h.game((g) => g.police.heat === 0);
    if (!decayed && i % 6 === 0) {
      // keep cops from finding us: this test is about decay
      await h.game((g) => {
        for (const u of g.police.units) if (u.vehicle.position.distanceTo(g.player.position) < 90) u.vehicle.position.x += 300;
        for (const o of g.police.cops) if (!o.vehicle && o.position.distanceTo(g.player.position) < 60) o.position.x += 300;
      });
    }
  }
  const took = await h.game((g, t0) => +(g.time.elapsed - t0).toFixed(1), decayStart);
  h.log('decay', JSON.stringify({ decayed, gameSeconds: took }));
  h.assert(decayed, 'heat decays when no cop sees the player');
  const heatLog = await h.game(() => window.__npcEvents.filter((e) => e.n === 'heat:change').map((e) => `${e.level}@${e.t}`).join(' '));
  h.log('heat log', heatLog);
  h.log('dialog lines:\n  ' + dialogs.slice(0, 30).join('\n  '));
  void events;
}
