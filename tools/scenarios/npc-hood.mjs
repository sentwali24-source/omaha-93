// NPC scenario: stroll through your own hood (PSC, Kountze Park) — greetings, recruit homies
// with E ("Roll with me"), follow / wait with G, homies riding in the car.
export default async function (page, h) {
  const dialogs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[dialog]') || t.startsWith('[toast]') || t.startsWith('[pager]')) dialogs.push(t);
  });
  await h.wait(1500);
  const info = await h.game((g) => g.debugApi.gangs());
  h.log('groups', JSON.stringify(info.groups));
  // walk up to the nearest own-set member
  const target = await h.game((g) => {
    const p = g.player.position;
    const own = g.gangs.members.filter((a) => a.faction === g.state.player.setId && a.brain.role !== 'og' && a.alive);
    own.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p));
    const a = own[0];
    if (!a) return null;
    // stand 1.4 m from them, facing them
    const dx = a.position.x - p.x;
    const dz = a.position.z - p.z;
    const d = Math.hypot(dx, dz);
    g.debugApi.teleport(a.position.x - (dx / d) * 1.4, a.position.z - (dz / d) * 1.4);
    g.player.faceHeading(Math.atan2(-dx, -dz));
    g.cameraRig.yaw = g.player.heading + 0.5;
    return { id: a.id, name: a.name, x: a.position.x, z: a.position.z };
  });
  h.log('walk up to', JSON.stringify(target));
  await h.game((g) => {
    for (const q of g.gangs.groups) q.greetCd = 0;
  });
  await h.wait(2500);
  await h.shot('01-greet');
  const prompt = await h.game((g) => ({ prompt: g.hud.prompt, cur: g.interactions.current?.id || null }));
  h.log('prompt', JSON.stringify(prompt));
  h.assert(prompt.prompt === 'Roll with me', 'recruit prompt shows next to an own-set member');
  await h.press('KeyE');
  await h.wait(800);
  let homies = await h.game((g) => g.gangs.homies.map((a) => ({ id: a.id, homie: a.userData.homie, state: a.brain.state })));
  h.log('homies after E', JSON.stringify(homies));
  h.assert(homies.length === 1 && homies[0].homie, 'recruited one homie with E');
  // recruit two more via the API path the prompt uses
  await h.game((g) => {
    const p = g.player.position;
    const own = g.gangs.members.filter((a) => a.faction === g.state.player.setId && !a.userData.homie && a.brain.role !== 'og' && a.alive);
    own.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p));
    for (const a of own.slice(0, 3)) g.gangs.recruit(a);
  });
  homies = await h.game((g) => g.gangs.homies.length);
  h.assert(homies === 3, `max 3 homies (got ${homies})`);
  // walk away north-west for a few seconds: homies follow in formation
  await h.game((g) => {
    g.cameraRig.yaw = 0.6;
  });
  await h.hold('KeyW', 3500);
  await h.wait(1500);
  await h.shot('02-follow');
  const fol = await h.game((g) => {
    const p = g.player.position;
    return g.gangs.homies.map((a) => ({ d: +a.position.distanceTo(p).toFixed(1), state: a.brain.state, anim: a.brain.anim }));
  });
  h.log('follow distances', JSON.stringify(fol));
  h.assert(fol.every((f) => f.d < 8), 'homies keep up with the player');
  // G: wait here
  await h.game((g) => g.events.emit('player:homies', {}));
  await h.wait(300);
  const mode = await h.game((g) => ({ mode: g.gangs.homieMode, states: g.gangs.homies.map((a) => a.brain.state) }));
  h.assert(mode.mode === 'wait', 'G toggles to wait');
  await h.hold('KeyW', 2000);
  await h.wait(500);
  const waitD = await h.game((g) => g.gangs.homies.map((a) => +a.position.distanceTo(g.player.position).toFixed(1)));
  h.log('wait distances', JSON.stringify(waitD));
  await h.game((g) => g.events.emit('player:homies', {}));
  await h.wait(2500);
  // car: get in the stub parked car nearby → homies ride hidden
  const car = await h.game((g) => {
    const v = g.vehicles.find((q) => !q.isPolice);
    if (!v) return null;
    g.debugApi.teleport(v.position.x - 3, v.position.z);
    for (const a of g.gangs.homies) a.position.set(v.position.x - 4, 0, v.position.z + 1);
    g.player.enterVehicle(v);
    return { x: v.position.x, z: v.position.z };
  });
  await h.wait(600);
  const riding = await h.game((g) => g.gangs.homies.map((a) => ({ riding: !!a.brain.riding, inActors: g.actors.includes(a) })));
  h.log('riding', JSON.stringify(riding));
  h.assert(riding.length && riding.every((r) => r.riding && !r.inActors), 'homies ride hidden in the car');
  await h.game((g) => g.player.exitVehicle(true));
  await h.wait(800);
  const out = await h.game((g) => g.gangs.homies.map((a) => ({ riding: !!a.brain.riding, inActors: g.actors.includes(a), visible: a.root.visible })));
  h.assert(out.every((r) => !r.riding && r.inActors && r.visible), 'homies climb out with the player');
  await h.shot('03-out-of-car');
  h.log('dialog lines:\n  ' + dialogs.slice(0, 20).join('\n  '));
  h.assert(dialogs.some((d) => d.startsWith('[dialog]') && /crackin|in the house|all day|There go|head up|proud|Handle your business|squad cars/i.test(d)), 'own-set greeting line was shown');
}
