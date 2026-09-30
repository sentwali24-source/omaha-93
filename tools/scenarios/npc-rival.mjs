// NPC scenario: a Parkside Crip walks into Lakeview Bloods turf (24th & Lake) wearing colors:
// warning → attack when staying; throwing a sign starts it at once; neutral clothes are ignored;
// recruited homies jump in.
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const dialogs = collectDialog(page);
  // bring two homies along from the hood
  await h.game((g) => {
    const ids = g.gangs.members.filter((a) => a.faction === 'psc' && a.brain.role !== 'og').slice(0, 2);
    for (const a of ids) g.gangs.recruit(a);
  });
  // go to Lakeview Bloods turf, 24th & Lake
  await h.game((g) => {
    g.debugApi.teleport(150, -540);
    for (const a of g.gangs.homies) a.position.set(149, 0, -538);
  });
  await h.wait(2500);
  const groups = await h.game((g) => g.debugApi.gangs().groups.filter((q) => q.rel === 'rival'));
  h.log('rival groups', JSON.stringify(groups));
  h.assert(groups.length > 0, 'rival hangouts spawn in Lakeview turf');
  // stand ~14 m from the nearest rival group, facing it
  const grp = await h.game((g) => {
    const p = g.player.position;
    const gs = g.gangs.groups.filter((q) => q.rel === 'rival' && q.kind === 'hang');
    gs.sort((a, b) => Math.hypot(a.cx - p.x, a.cz - p.z) - Math.hypot(b.cx - p.x, b.cz - p.z));
    const q = gs[0];
    // approach along the sidewalk: find a free spot 13 m away with line of sight
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const x = q.cx + Math.cos(ang) * 13;
      const z = q.cz + Math.sin(ang) * 13;
      if (g.collision.isFree(x, z, 0.5) && g.collision.lineOfSight(x, 1.6, z, q.cx, 1.6, q.cz)) {
        g.debugApi.teleport(x, z);
        const dx = q.cx - x;
        const dz = q.cz - z;
        g.player.faceHeading(Math.atan2(-dx, -dz));
        g.cameraRig.yaw = g.player.heading - 0.35;
        for (const a of g.gangs.homies) a.position.set(x - Math.cos(ang) * 1.5, 0, z - Math.sin(ang) * 1.5);
        return { id: q.id, x: q.cx, z: q.cz, size: q.members.length };
      }
    }
    return null;
  });
  h.log('facing group', JSON.stringify(grp));
  await waitGame(h, 1.2);
  let st = await h.game((g, id) => {
    const q = g.gangs.groups.find((x) => x.id === id);
    return q ? { alert: q.alert, mode: q.mode, hostile: q.members.filter((a) => g.gangs.isHostile(a)).length } : null;
  }, grp.id);
  h.log('after approach', JSON.stringify(st));
  await h.shot('01-warned');
  h.assert(st && st.alert === 'warned', 'rivals warn the player first');
  h.assert(dialogs.some((d) => /set you claim|Where you from|You lost|slippin|Who you with|Wrong colors/.test(d)), 'warning line shown');
  // stay put → they attack
  await waitGame(h, 7.5);
  st = await h.game((g, id) => {
    const q = g.gangs.groups.find((x) => x.id === id);
    return { mode: q?.mode, hp: g.player.health, fighting: q ? q.members.filter((a) => a.brain.state === 'fight').length : 0, homies: g.gangs.homies.map((a) => a.brain.state) };
  }, grp.id);
  h.log('after staying', JSON.stringify(st));
  await h.shot('02-fight');
  h.assert(st.mode === 'fight' && st.fighting > 0, 'they attack when the player stays');
  h.assert(st.homies.some((s) => s === 'fight'), 'homies jump in');
  await waitGame(h, 4);
  const hp = await h.game((g) => ({ hp: g.player.health, homieHp: g.gangs.homies.map((a) => a.health), rivalsHurt: g.gangs.members.filter((a) => a.brain.rel === 'rival' && a.health < a.maxHealth).length }));
  h.log('damage', JSON.stringify(hp));
  h.assert(hp.hp < 100, 'rivals land punches on the player');
  h.assert(hp.rivalsHurt > 0, 'homies land punches on rivals');
  await h.shot('03-brawl');

  // reset: neutral clothes are ignored
  await h.game((g) => {
    g.player.health = 100;
    for (const a of [...g.gangs.homies]) g.gangs.dismiss(a, true);
    g.state.wearingColors = false;
    g.debugApi.teleport(-28, -1080); // Fort Street, Northfield Pirus hood (bloods)
  });
  await waitGame(h, 1.5);
  const neutral = await h.game((g) => {
    const p = g.player.position;
    const gs = g.gangs.groups.filter((q) => q.rel === 'rival' && q.kind === 'hang');
    gs.sort((a, b) => Math.hypot(a.cx - p.x, a.cz - p.z) - Math.hypot(b.cx - p.x, b.cz - p.z));
    const q = gs[0];
    if (!q) return null;
    g.debugApi.teleport(q.cx + 6, q.cz + 0.5);
    return { id: q.id };
  });
  if (neutral) {
    await waitGame(h, 3);
    const n2 = await h.game((g, id) => {
      const q = g.gangs.groups.find((x) => x.id === id);
      return q ? { alert: q.alert, mode: q.mode } : null;
    }, neutral.id);
    h.log('neutral clothes', JSON.stringify(n2));
    h.assert(n2 && n2.alert === 'none' && n2.mode === 'hang', 'rivals ignore a player in neutral clothes');
    // throwing a sign starts it anyway
    await h.game((g) => g.events.emit('player:sign', { setId: g.state.player.setId }));
    await waitGame(h, 0.6);
    const n3 = await h.game((g, id) => g.gangs.groups.find((x) => x.id === id)?.mode, neutral.id);
    h.log('after sign', n3);
    h.assert(n3 === 'fight', 'throwing a sign in their turf starts a fight');
    await h.shot('04-sign');
  } else h.log('no rival group found at Fort St');
  h.log('dialog lines:\n  ' + dialogs.slice(0, 24).join('\n  '));
}
