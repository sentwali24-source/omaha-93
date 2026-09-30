// NPC scenario: street life downtown — civilians on sidewalks / crosswalks (top-down shot),
// then a fight breaks out and they scatter / cower; a fast car makes them dodge.
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const dialogs = collectDialog(page);
  await dialogs.ready;
  await h.game((g) => {
    g.debugApi.teleport(372, 128); // 16th & Farnam
    g.debugApi.setHour(13);
  });
  await waitGame(h, 8);
  const peds = await h.game((g) => {
    const L = g.layout;
    const list = g.pedestrians.peds.map((a) => ({ s: a.brain.state, walk: L.isSidewalk(a.position.x, a.position.z), road: L.isRoad(a.position.x, a.position.z), cross: !!a.brain.walker?.onCrosswalk }));
    const by = {};
    for (const p of list) by[p.s] = (by[p.s] || 0) + 1;
    return { n: list.length, by, onWalk: list.filter((p) => p.walk).length, onRoad: list.filter((p) => p.road && !p.cross).length, crossing: list.filter((p) => p.cross).length };
  });
  h.log('peds', JSON.stringify(peds));
  h.assert(peds.n >= 8, 'downtown has pedestrians');
  h.assert(peds.onWalk >= peds.n * 0.6, 'most pedestrians are on sidewalks');
  // top-down look at the block
  await h.game((g) => {
    g.__camUpdate = g.cameraRig.update;
    const p = g.player.position;
    g.cameraRig.update = function () {
      g.camera.position.set(p.x + 0.01, 95, p.z + 30);
      g.camera.lookAt(p.x, 0, p.z - 5);
    };
  });
  await waitGame(h, 0.5);
  await h.shot('01-topdown');
  await waitGame(h, 4);
  await h.shot('02-topdown-later');
  await h.game((g) => {
    g.cameraRig.update = g.__camUpdate;
  });
  // a fight breaks out right here: a rival crew jumps the player
  await h.game((g) => {
    const p = g.player.position;
    // pull a few civilians close so there's a crowd to scatter
    let k = 0;
    for (const a of g.pedestrians.peds) {
      if (k >= 5 || !a.alive) continue;
      const ang = (k / 5) * Math.PI * 2;
      a.position.set(p.x + Math.cos(ang) * 7, 0, p.z + Math.sin(ang) * 7);
      a.brain.state = 'idle';
      a.brain.t = 20;
      k++;
    }
    g.debugApi.spawnGang('lvb', p.x + 5, p.z + 2, 3, 'fighter');
    g.cameraRig.yaw = 0.3;
  });
  await waitGame(h, 5);
  const scared = await h.game((g) => {
    const p = g.player.position;
    const near = g.pedestrians.peds.filter((a) => a.position.distanceTo(p) < 40);
    return { hp: g.player.health, states: near.map((a) => a.brain.state) };
  });
  h.log('during fight', JSON.stringify(scared));
  h.assert(scared.hp < 100, 'the crew attacked the player');
  h.assert(scared.states.filter((s) => s === 'flee' || s === 'cower' || s === 'call').length >= 3, 'civilians flee / cower from the fight');
  await h.shot('03-scatter');
  // fast car: a speeding car heading at a pedestrian makes them jump aside
  const dodge = await h.game((g) => {
    for (const a of g.gangs.members) a.remove();
    const ped = g.pedestrians.spawnPed({ x: 330, z: 128 });
    ped.brain.state = 'idle';
    ped.brain.t = 30;
    const v = g.vehicles.find((q) => !q.isPolice && !q.driver);
    if (!v) return null;
    v.position.set(330, 0, 150);
    v.heading = 0; // north, straight at the ped
    v.speed = 16;
    v.controls.throttle = 1;
    v.ai = { stub: true };
    return ped.id;
  });
  await waitGame(h, 0.8);
  const dodged = await h.game((g, id) => {
    const a = g.pedestrians.peds.find((q) => q.id === id);
    return a ? { state: a.brain.state, alive: a.alive, x: +a.position.x.toFixed(1) } : null;
  }, dodge);
  h.log('dodge', JSON.stringify(dodged));
  h.assert(dodged && (dodged.state === 'dodge' || Math.abs(dodged.x - 330) > 1.5 || dodged.state === 'flee'), 'pedestrian jumps out of the way of a speeding car');
  h.log('dialog lines:\n  ' + dialogs.slice(0, 20).join('\n  '));
}
