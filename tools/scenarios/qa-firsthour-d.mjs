// First hour, part D: story4 (recruits must still be there when the player walks up, even if the
// job started far away), story5 (envelope timer), story6 (first beef: fight the crew with J).
import { collectDialog } from './npc-util.mjs';
import { until, walkTo, holdKey, snap, waitGame } from './qa-firsthour-util.mjs';

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  await h.game((g) => { g.state.missions.completed.push('story1', 'story2', 'story3'); g.debugApi.give(250, 150); g.missions._pageIn = 9999; });
  const skip4 = await h.game(() => /skip4/.test(location.search));
  if (skip4) {
    await h.game((g) => { g.state.missions.completed.push('story4'); g.debugApi.give(80, 60); const hood = g.missions.hoodPoi(); for (const a of g.gangs.members.filter((a) => a.faction === g.state.player.setId && a.brain.role !== 'og' && a.state === 'active').sort((a, b) => Math.hypot(a.position.x - hood.x, a.position.z - hood.z) - Math.hypot(b.position.x - hood.x, b.position.z - hood.z)).slice(0, 2)) g.gangs.recruit(a); });
  } else {
  // ---- story4, started from far away (Old Market) so the recruit spot is out of Gangs' range
  await h.game((g) => g.debugApi.teleport(500, 200));
  await waitGame(h, 1);
  const ok4 = await h.game((g) => g.debugApi.startMission('story4'));
  const rec = await until(h, (g) => { const m = g.missions.active; return m?.data?.recruitable && { n: m.data.recruitable.length, place: m.tokens.place, sx: m.data.spot.x, sz: m.data.spot.z, fallback: m.data.fallback }; }, null, 3);
  h.log('story4', ok4, JSON.stringify(rec));
  await waitGame(h, 3); // several Gangs retire passes while the player is ~1 km away
  const alive = await h.game((g) => g.missions.active.data.recruitable.map((a) => a.state));
  h.log('recruits after 3 s far away', JSON.stringify(alive));
  h.assert(alive.every((s) => s === 'active'), 'story4 recruits survive while the player is far');
  for (let i = 0; i < (rec?.n || 0); i++) {
    const a = await h.game((g, i) => { const x = g.missions.active?.data?.recruitable?.[i]; return x && { x: x.position.x, z: x.position.z, homie: !!x.userData?.homie, state: x.state }; }, i);
    if (!a || a.homie) continue;
    if (i === 0) await h.game((g, a) => g.debugApi.teleport(a.x + 5, a.z + 3), a);
    await waitGame(h, 0.3);
    const d = await walkTo(h, a.x, a.z, 1.5, 8);
    const pr = await until(h, (g) => g.hud.prompt, null, 2);
    h.log('recruit', i, 'dist', d.toFixed(2), 'prompt', pr);
    await holdKey(h, 'KeyE', 0.4);
    await waitGame(h, 0.4);
  }
  const hs = await h.game((g) => ({ homies: g.gangs.homies.length, obj: g.missions.active?.objective }));
  h.log('after recruiting', JSON.stringify(hs));
  h.assert(hs.homies >= 2, 'recruited two homies');
  await h.shot('d-recruited');
  const hood = await h.game((g) => { const p = g.missions.hoodPoi(); return { x: p.x, z: p.z }; });
  await h.game((g, hood) => { g.debugApi.teleport(hood.x + 18, hood.z + 12); for (const [i, a] of g.gangs.homies.entries()) a.position.set(hood.x + 19 + i, 0, hood.z + 14); }, hood);
  await walkTo(h, hood.x, hood.z, 3, 10);
  h.assert(await until(h, (g) => g.state.missions.completed.includes('story4'), null, 4), 'story4 complete');
  h.log('after story4', JSON.stringify(await snap(h)));
  }

  const only6 = await h.game(() => /only6/.test(location.search));
  if (only6) await h.game((g) => { g.state.missions.completed.push('story5'); g.debugApi.give(120, 70); });
  else {
  // ---- story5 timer sanity from each end
  await waitGame(h, 0.5);
  const ok5 = await h.game((g) => g.debugApi.startMission('story5'));
  const del = await until(h, (g) => { const m = g.missions.active; return m?.data?.dest && { dest: m.tokens.dest, time: m.data.time, dist: Math.round(Math.hypot(m.data.pickup.x - m.data.dest.x, m.data.pickup.z - m.data.dest.z)), px: m.data.pickup.x, pz: m.data.pickup.z, dx: m.data.dest.x, dz: m.data.dest.z }; }, null, 3);
  h.log('story5', ok5, JSON.stringify(del), 'sprint secs needed ~', del && Math.round(del.dist * 1.3 / 7.6));
  await h.game((g, d) => g.debugApi.teleport(d.px + 5, d.pz + 3), del);
  await walkTo(h, del.px, del.pz, 1.5, 6);
  await until(h, (g) => g.missions.active?.stage === 1, null, 3);
  h.log('story5 picked up', JSON.stringify(await snap(h)));
  await h.game((g, d) => g.debugApi.teleport(d.dx + 6, d.dz + 4), del);
  await walkTo(h, del.dx, del.dz, 2.5, 6);
  h.assert(await until(h, (g) => g.state.missions.completed.includes('story5'), null, 4), 'story5 complete');
  await h.shot('d-story5');
  h.log('after story5', JSON.stringify(await snap(h)));
  }

  // ---- story6: first beef
  await waitGame(h, 0.5);
  const avail = await h.game((g) => g.missions.available().map((m) => m.id));
  h.log('available after story5', JSON.stringify(avail), 'rep', await h.game((g) => g.state.rep));
  await h.game((g) => { if (!g.missions.available().some((m) => m.id === 'story6')) g.debugApi.give(0, 300 - g.state.rep); });
  await h.game((g) => { if (/solo/.test(location.search)) for (const a of [...g.gangs.homies]) g.gangs.dismiss(a, true); });
  const ok6 = await h.game((g) => g.debugApi.startMission('story6'));
  const beef = await until(h, (g) => { const m = g.missions.active; return m?.data?.pt && { x: m.data.pt.x, z: m.data.pt.z, zone: m.tokens.zone, rival: m.data.rival.id, need: m.data.need }; }, null, 3);
  h.log('story6', ok6, JSON.stringify(beef), 'homies', await h.game((g) => g.gangs.homies.length));
  await h.game((g, b) => { g.debugApi.teleport(b.x + 55, b.z + 45); for (const [i, a] of g.gangs.homies.entries()) a.position.set(b.x + 56 + i, 0, b.z + 47); }, beef);
  await walkTo(h, beef.x, beef.z, 20, 10, true);
  const st1 = await until(h, (g) => g.missions.active?.stage === 1 && g.missions.active.data.spawned.length, null, 4);
  h.log('crew spawned', st1, JSON.stringify(await snap(h)));
  await h.shot('d-beef-crew');
  // fight: go at the nearest standing foe and swing with J
  const t0 = Date.now();
  let lastHp = 100;
  for (let k = 0; k < 400 && Date.now() - t0 < 420000; k++) {
    const s = await h.game((g) => {
      const m = g.missions.active;
      const p = g.player;
      if (!m || m.id !== 'story6' || m.stage !== 1 || !p.alive) return { done: true, stage: m?.stage, hp: p.health, alive: p.alive };
      const foes = m.data.spawned.filter((a) => a.state === 'active');
      let best = null, bd = 1e9;
      for (const a of foes) { const d = Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z); if (d < bd) { bd = d; best = a; } }
      if (best) { g.cameraRig.yaw = Math.atan2(-(best.position.x - p.position.x), -(best.position.z - p.position.z)); }
      return { d: bd, hp: Math.round(p.health), ko: m.data.ko.size, need: m.data.need, foes: foes.length, homies: g.gangs.homies.filter((a) => a.alive).length, t: +g.time.elapsed.toFixed(1) };
    });
    if (s.done) { h.log('fight end', JSON.stringify(s)); break; }
    if (k % 10 === 0 || s.hp < lastHp - 20) { h.log('fight', JSON.stringify(s)); lastHp = s.hp; }
    if (s.d > 1.4) { await h.down('KeyW'); await h.wait(250); await h.up('KeyW'); }
    else { await h.press('KeyJ'); await h.wait(150); }
    if (k === 30) await h.shot('d-beef-fight');
  }
  h.log('after fight', JSON.stringify(await snap(h)));
  await h.shot('d-beef-after');
  h.log('lines:\n  ' + lines.filter((l) => !l.startsWith('[toast] objective')).slice(-60).join('\n  '));
}
