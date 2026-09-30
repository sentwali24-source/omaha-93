// Combat: 3-hit combo (8/10/16), soft lock-on, knockback, KO, fight:won, NPC revive, hit FX.
import { waitGame, waitUntil, P } from './player-util.mjs';

export default async function (page, h) {
  const setup = await h.game((g) => {
    g.debugApi.setHour(14);
    g.debugApi.teleport(140, -596);
    const p = g.player;
    p.faceHeading(0);
    p.moveHeading = 0;
    g.cameraRig.yaw = 0.5;
    g.cameraRig.pitch = 0.2;
    g.cameraRig.snap();
    g.__won = [];
    g.__hits = [];
    g.events.on('fight:won', (e) => g.__won.push(e.target.id));
    g.events.on('actor:hit', (e) => g.__hits.push({ t: e.target.id, a: e.attacker?.id, d: e.damage }));
    // dummy 1.9 m ahead and a bit to the right: lock-on should turn the player toward it
    const id = g.debugApi.spawnDummy(140.7, -597.8, { outfit: 'starter', side: 'bloods', shirt: '#d4202c', shirt2: '#15161a', hat: 'cap', hatColor: '#d4202c', bandana: '#d4202c' }, { kind: 'gang', faction: 'lvb', side: 'bloods', maxHealth: 60, heading: Math.PI });
    return { id, player: g.player.id };
  });
  h.log('dummy', setup.id);
  await waitGame(h, 0.3);

  // jab → cross → kick, pressed from an in-page per-frame driver at game-time offsets (the machine
  // is too loaded for real-time key timing): each press 0.14 s into the previous hit.
  await h.game((g) => {
    const p = g.player;
    let pressed = 0;
    let lastStep = -2;
    let release = false;
    const press = () => {
      g.input.setVirtualButton('attack', true);
      release = true;
      pressed++;
    };
    g.city.addUpdater(() => {
      if (release) {
        g.input.setVirtualButton('attack', false);
        release = false;
        return;
      }
      if (pressed >= 3) return;
      if (pressed === 0) return press();
      if (p.comboStep === pressed - 1 && p.comboT > 0.14 && lastStep !== p.comboStep) {
        lastStep = p.comboStep;
        press();
      }
    });
  });
  const a1 = await waitUntil(h, (g) => g.__hits.length >= 1 && { hits: g.__hits.slice(), p: g.debugApi.player(), fx: g.debugApi.fx() }, null, 1);
  await h.shot('fight-hit1');
  h.log('after jab', JSON.stringify(a1?.hits), 'heading', a1?.p.heading, 'fx', JSON.stringify(a1?.fx));
  h.assert(a1?.hits[0]?.d === 8 && a1?.hits[0]?.t === setup.id, 'jab deals 8 to the dummy');
  h.assert(a1?.p.heading < -0.1, `soft lock-on turned toward the target (heading ${a1?.p.heading})`);
  h.assert(a1?.fx.sparks > 0, 'hit sparks spawned');
  await waitUntil(h, (g) => g.__hits.length >= 3, null, 2);
  await waitGame(h, 0.05);
  await h.shot('fight-kick');
  const a3 = await h.game((g) => ({ hits: g.__hits.slice(), d: g.debugApi.dummies()[0] }));
  h.log('combo hits', JSON.stringify(a3.hits), 'dummy', JSON.stringify(a3.d));
  h.assert(a3.hits.map((x) => x.d).join(',') === '8,10,16', 'combo damage 8 / 10 / 16');
  await waitGame(h, 0.6);
  const d3 = await h.game((g) => g.debugApi.dummies()[0]);
  const dist = Math.hypot(d3.x - 140.7, d3.z + 597.8);
  h.log('dummy after kick', JSON.stringify(d3), 'pushed', dist.toFixed(2));
  h.assert(dist > 1.0, `finisher knockback pushes the dummy (${dist.toFixed(2)} m)`);
  h.assert(d3.health === 26, `dummy health 60-34=26 (${d3.health})`);

  // keep punching until KO → fight:won
  for (let i = 0; i < 12; i++) {
    const s = await h.game((g) => ({ st: g.debugApi.dummies()[0]?.state, won: g.__won.length }));
    if (s.st === 'ko') break;
    // walk toward the dummy if it slid away
    await h.game((g) => {
      const d = g.actors.find((a) => a.system === 'debug');
      const p = g.player;
      const dx = d.position.x - p.position.x;
      const dz = d.position.z - p.position.z;
      const len = Math.hypot(dx, dz);
      if (len > 1.4) {
        p.position.x += (dx / len) * (len - 1.2);
        p.position.z += (dz / len) * (len - 1.2);
      }
    });
    await h.press('KeyJ');
    await waitGame(h, 0.25);
  }
  await waitGame(h, 0.7);
  await h.shot('fight-ko');
  const ko = await h.game((g) => ({ d: g.debugApi.dummies()[0], won: g.__won.slice(), stats: g.state.stats }));
  h.log('ko', JSON.stringify(ko));
  h.assert(ko.d.state === 'ko', 'dummy knocked out');
  h.assert(ko.won.length === 1 && ko.won[0] === setup.id, 'fight:won emitted once for the gang dummy');
  h.assert(ko.stats.kos === 1 && ko.stats.fightsWon === 1, 'stats.kos / fightsWon counted');
  h.assert(ko.d.anim === 'ko', 'dummy plays the ko animation');

  // revive: shorten the revive timer for the test
  await h.game((g) => {
    const d = g.actors.find((a) => a.system === 'debug');
    d.userData.reviveAt = d.koTime + 0.5;
  });
  const rev = await waitUntil(h, (g) => g.debugApi.dummies()[0]?.state === 'active' && g.debugApi.dummies()[0], null, 3);
  await waitGame(h, 0.6);
  await h.shot('fight-getup');
  h.log('revived', JSON.stringify(rev));
  h.assert(rev && rev.state === 'active', 'NPC revives after its KO timer');

  // taking hits: dummy punches the player → player staggers, camera shakes
  const tk = await h.game((g) => {
    const d = g.actors.find((a) => a.system === 'debug');
    const p = g.player;
    d.position.set(p.position.x, 0, p.position.z - 1.0);
    d.faceHeading(Math.PI);
    g.combat.melee(d, { damage: 12, delay: 0.01, anim: 'punch2' });
    return p.health;
  });
  await waitGame(h, 0.15);
  const after = await h.game((g) => ({ hp: g.player.health, stagger: g.player.stagger, trauma: g.cameraRig._trauma }));
  h.log('player hit', tk, '->', JSON.stringify(after));
  h.assert(after.hp === tk - 12, 'player takes NPC melee damage');
  h.assert(after.stagger > 0, 'player staggers when hit');

  // player KO → state 'ko', Game schedules respawn
  await h.game((g) => g.player.takeDamage(500, null));
  await waitGame(h, 0.8);
  await h.shot('fight-player-ko');
  const pk = await P(h);
  h.log('player ko', JSON.stringify(pk));
  h.assert(pk.state === 'ko' && pk.anim === 'ko', 'player KO state + animation');
  const resp = await waitUntil(h, (g) => g.player.state === 'active' && g.debugApi.player(), null, 6);
  h.log('respawned', JSON.stringify(resp));
  h.assert(resp && resp.health === 100, 'Game respawned the player via player.respawn()');
}
