// NPC scenario: turf. A rival crew rolls into the player's zone (beef, announced on the pager),
// locals and the player fight them off → BEEF SQUASHED + influence. Also: addInfluence claims a
// neutral zone and flips a rival zone (turf:change), and a hangout close-up at dusk.
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const lines = collectDialog(page);
  await h.game((g) => {
    window.__turf = [];
    g.events.on('turf:influence', (e) => window.__turf.push(['influence', e.zoneId, e.owner, Math.round(e.control), e.reason || '']));
    g.events.on('turf:change', (e) => window.__turf.push(['change', e.zoneId, e.prev, e.owner, Math.round(e.control)]));
    g.events.on('pager', (e) => window.__turf.push(['pager', e.from, e.text]));
    g.debugApi.setHour(20.5);
  });
  // hangout close-up (fixed camera a few meters off the hood group)
  await h.game((g) => {
    const q = g.gangs.groups.find((x) => x.rel === 'own' && x.spot?.type === 'hood') || g.gangs.groups[0];
    g.__camUpdate = g.cameraRig.update;
    g.cameraRig.update = function () {
      g.camera.position.set(q.cx - 5.5, 2.4, q.cz + 4.5);
      g.camera.lookAt(q.cx, 0.9, q.cz);
    };
  });
  await waitGame(h, 1);
  await h.shot('01-hangout');
  await h.game((g) => {
    g.cameraRig.update = g.__camUpdate;
  });
  const control0 = await h.game((g) => g.gangs.getControl('kountze'));
  const started = await h.game((g) => g.debugApi.beefNow());
  h.assert(started, 'beef event starts');
  await waitGame(h, 0.5);
  let info = await h.game((g) => ({ beef: g.debugApi.gangs().beef, marker: g.hud.markers.get('beef') || null, turf: window.__turf.slice() }));
  h.log('beef', JSON.stringify(info));
  h.assert(info.turf.some((e) => e[0] === 'pager' && /ROLLIN/.test(e[2])), 'the OG pages the player about the crew');
  h.assert(!!info.marker, 'a map marker follows the crew');
  // the crew walks toward the hood; bring the player to meet them
  await waitGame(h, 6);
  const crewPos = await h.game((g) => {
    const b = g.gangs.beef;
    const a = b.group.members.find((m) => m.alive);
    return { x: a.position.x, z: a.position.z, state: a.brain.state };
  });
  h.log('crew at', JSON.stringify(crewPos));
  await h.game((g, p) => {
    g.debugApi.teleport(p.x + 10, p.z + 3);
    g.cameraRig.yaw = Math.atan2(10, 3);
  }, crewPos);
  await waitGame(h, 3);
  const fight = await h.game((g) => {
    const b = g.gangs.beef;
    return { states: b.group.members.map((m) => m.brain.state), mode: b.group.mode, hp: g.player.health };
  });
  h.log('crew vs player', JSON.stringify(fight));
  h.assert(fight.states.includes('fight'), 'the crew fights the player');
  await h.shot('02-beef-fight');
  // finish them (player's fists, fast-forwarded)
  await h.game((g) => {
    for (const a of g.gangs.beef.group.members) if (a.alive) a.takeDamage(500, g.player, { x: 1, z: 0 }, 2);
  });
  await waitGame(h, 1);
  info = await h.game((g, c0) => ({ beef: g.gangs.beef ? 'active' : 'over', control: g.gangs.getControl('kountze'), c0, marker: !!g.hud.markers.get('beef') }), control0);
  h.log('after', JSON.stringify(info));
  h.assert(info.beef === 'over' && !info.marker, 'beef squashed when the crew is down');
  h.assert(lines.some((l) => /BEEF SQUASHED/.test(l)), 'BEEF SQUASHED toast');
  // turf flips
  await h.game((g) => {
    g.gangs.addInfluence('spencer', 'psc', 20); // neutral → claimed
    g.gangs.addInfluence('lake24', 'psc', 90); // LVB 70 → flips to PSC
    g.gangs.addInfluence('downtown', 'psc', 50); // noTurf: ignored
  });
  const t = await h.game((g) => ({ log: window.__turf.filter((e) => e[0] === 'change'), spencer: g.gangs.getZoneOwner('spencer'), lake: g.gangs.getZoneOwner('lake24'), lakeC: g.gangs.getControl('lake24'), dt: g.gangs.getZoneOwner('downtown') }));
  h.log('turf', JSON.stringify(t));
  h.assert(t.spencer === 'psc' && t.lake === 'psc' && t.dt === null, 'addInfluence claims / flips zones, ignores noTurf');
  h.assert(t.log.length >= 2, "'turf:change' emitted on flips");
  // serialize writes clean turf
  const ser = await h.game((g) => {
    g.gangs.serialize(g.state);
    return g.state.turf.lake24;
  });
  h.log('serialized lake24', JSON.stringify(ser));
  h.log('lines:\n  ' + lines.slice(0, 16).join('\n  '));
}
