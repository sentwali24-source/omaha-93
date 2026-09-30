// Story missions 1–5 played for real in the integrated game (teleports only to skip the walking):
// pager → ringing payphone (HUD marker) → hold E to answer → talk to the OG at the hood → tag the
// block (hold E at each target wall) → boost the car and park it at the body shop → recruit two
// homies with "Roll with me" and bring them to the hood → run the message to the Old Market.
//   node tools/smoke.mjs --port 5214 --no-server --out tools/out/street-story --params "autostart=1&side=crips&set=psc&debug=1&quality=low" --script tools/scenarios/gameplay-story.mjs
import { waitGame, collectDialog } from './npc-util.mjs';

/** Poll until fn is truthy or `gameSecs` of game time pass (headless frame rates crawl). */
async function until(h, fn, arg, gameSecs = 6, capMs = 90000) {
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  for (;;) {
    const v = await h.game(fn, arg);
    if (v) return v;
    const t = await h.game((g) => g.time.elapsed);
    if (t - t0 > gameSecs || Date.now() - start > capMs) return v;
    await h.wait(250);
  }
}

async function holdE(h, gameSecs) {
  await h.down('KeyE');
  await waitGame(h, gameSecs, 90000);
  await h.up('KeyE');
}

const done = (id) => (g) => g.state.missions.completed.includes(id);

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  await h.game((g) => {
    window.__ev = [];
    for (const n of ['mission:start', 'mission:complete', 'mission:fail', 'rank:up', 'tag:complete']) g.events.on(n, (e) => window.__ev.push(`${n}:${e?.mission?.id || e?.rank?.name || e?.spot?.id || ''}${e?.reason ? '(' + e.reason + ')' : ''}`));
    g.missions._pageIn = Math.min(g.missions._pageIn, 1);
  });

  // ---- 1. pager + ringing payphone
  const offer = await until(h, (g) => g.debugApi.missions.offer(), null, 8);
  const hudMarks = await h.game((g) => g.debugApi.hud().markers);
  h.log('offer', JSON.stringify(offer), 'hud markers', JSON.stringify(hudMarks));
  h.assert(offer && offer.id === 'story1', 'the OG pages story1 first');
  h.assert(hudMarks.includes('mission:payphone'), 'ringing payphone is on the radar');
  h.assert(lines.some((l) => l.startsWith('[pager]') && /911|411/.test(l)), 'pager popup shows the code');
  await h.game((g) => {
    const poi = g.shops.pois.find((p) => p.id === g.missions.offer.phone.id);
    // stand on the sidewalk in front of the phone, facing it
    g.debugApi.teleport(poi.x - Math.sin(poi.heading) * -0.2, poi.z - Math.cos(poi.heading) * -0.2);
    g.player.faceHeading(poi.heading);
    g.cameraRig.yaw = poi.heading + 0.7;
    g.cameraRig.pitch = 0.15;
    g.cameraRig.snap();
  });
  const prompt = await until(h, (g) => (g.hud.prompt === 'Answer payphone' ? g.hud.prompt : null), null, 3);
  h.assert(prompt === 'Answer payphone', `prompt at the ringing phone (got ${prompt})`);
  await h.shot('01-payphone');
  await holdE(h, 0.4);
  const act = await until(h, (g) => g.debugApi.missions.active(), null, 3);
  h.log('story1', JSON.stringify(act));
  h.assert(act && act.id === 'story1', 'answering starts story1');

  // ---- story1: talk to the OG at the hood
  await h.game((g) => {
    const og = g.missions.active.data.og;
    const hood = g.missions.hoodPoi();
    const p = og?.alive ? og.position : hood;
    g.debugApi.teleport(p.x + 1.3, p.z + 0.4);
    g.player.faceHeading(Math.atan2(1.3, 0.4));
    g.cameraRig.yaw = g.player.heading + 0.6;
    g.cameraRig.snap();
  });
  await waitGame(h, 0.6);
  h.log('prompt at OG:', await h.game((g) => g.hud.prompt));
  await h.shot('02-og');
  await holdE(h, 0.4);
  h.assert(await until(h, done('story1'), null, 4), 'story1 complete after talking to the OG');

  // ---- story2: tag the block
  await h.game((g) => g.debugApi.startMission('story2'));
  const targets = await until(h, (g) => g.missions.active?.data?.targets && [...g.missions.active.data.targets], null, 3);
  h.log('story2 targets', JSON.stringify(targets));
  for (let i = 0; i < 6; i++) {
    const next = await h.game((g) => (g.missions.active?.id === 'story2' ? [...g.missions.active.data.targets][0] : null));
    if (!next) break;
    await h.game((g, id) => {
      g.debugApi.tagging.goto(id);
      g.cameraRig.yaw = g.player.heading + 0.8;
      g.cameraRig.pitch = 0.15;
      g.cameraRig.snap();
    }, next);
    await waitGame(h, 0.4);
    await h.down('KeyE');
    await until(h, (g, id) => g.tagging.ownerOf(id) === g.state.player.setId, next, 5);
    if (i === 0) await h.shot('03-tagging');
    await h.up('KeyE');
    await waitGame(h, 0.3);
  }
  h.assert(await until(h, done('story2'), null, 3), 'story2 complete after tagging the walls');
  await h.shot('04-tagged');

  // ---- story3: boost the car to the body shop
  await h.game((g) => g.debugApi.startMission('story3'));
  const car = await until(h, (g) => g.missions.active?.data?.car && { model: g.missions.active.data.car.model, garage: g.missions.active.data.garage.name }, null, 3);
  h.log('story3', JSON.stringify(car));
  await h.game((g) => {
    const c = g.missions.active.data.car;
    const p = c.getExitPoint();
    g.debugApi.teleport(p.x, p.z);
    g.player.enterVehicle(c);
  });
  await until(h, (g) => g.missions.active?.stage === 1, null, 3);
  await h.game((g) => {
    const gar = g.missions.active.data.garage;
    const c = g.player.vehicle;
    c.position.set(gar.x - Math.sin(gar.heading) * -3, 0, gar.z - Math.cos(gar.heading) * -3);
    c.speed = 0;
    c.velocity?.set?.(0, 0, 0);
    g.cameraRig.snap();
  });
  h.assert(await until(h, done('story3'), null, 5), 'story3 complete after parking at the body shop');

  // ---- story4: recruit two homies, bring them to the hood (needs rank 1)
  await h.game((g) => {
    if (!g.missions.available().some((m) => m.id === 'story4')) g.debugApi.give(0, 150);
  });
  const avail = await h.game((g) => g.missions.available().map((m) => m.id));
  h.log('available', JSON.stringify(avail));
  await h.game((g) => g.debugApi.startMission('story4'));
  const rec = await until(h, (g) => g.missions.active?.data?.recruitable?.length, null, 3);
  h.log('recruitable', rec);
  await h.game((g) => {
    const a = g.missions.active.data.recruitable[0];
    g.debugApi.teleport(a.position.x + 1.2, a.position.z);
    g.player.faceHeading(Math.PI / 2);
  });
  await waitGame(h, 0.5);
  h.log('prompt at homie:', await h.game((g) => g.hud.prompt));
  await holdE(h, 0.4);
  await waitGame(h, 0.3);
  await h.game((g) => {
    for (const a of g.missions.active.data.recruitable) if (!a.userData.homie) g.gangs.recruit(a);
  });
  await until(h, (g) => g.missions.active?.stage === 1, null, 3);
  await h.game((g) => {
    const hood = g.missions.hoodPoi();
    g.debugApi.teleport(hood.x + 2, hood.z + 2);
    for (const [i, a] of g.gangs.homies.entries()) a.position.set(hood.x + 3 + i, 0, hood.z + 3);
  });
  h.assert(await until(h, done('story4'), null, 5), 'story4 complete with two homies at the hood');
  await h.shot('05-homies-home');

  // ---- story5: run the message to the Old Market
  await h.game((g) => {
    if (!g.missions.available().some((m) => m.id === 'story5')) g.debugApi.give(0, 100);
    g.debugApi.startMission('story5');
  });
  const del = await until(h, (g) => g.missions.active?.data?.dest && { pickup: g.missions.active.data.pickup.name, dest: g.missions.active.data.dest.name || g.missions.active.data.dest.id }, null, 3);
  h.log('story5', JSON.stringify(del));
  await h.game((g) => {
    const p = g.missions.active.data.pickup;
    g.debugApi.teleport(p.x, p.z);
  });
  await until(h, (g) => g.missions.active?.stage === 1, null, 4);
  await h.game((g) => {
    const d = g.missions.active.data.dest;
    g.debugApi.teleport(d.x, d.z);
  });
  h.assert(await until(h, done('story5'), null, 5), 'story5 complete at the Old Market');
  await waitGame(h, 1);
  await h.shot('06-oldmarket');

  const end = await h.game((g) => ({ completed: g.state.missions.completed, rep: g.state.rep, cash: g.state.cash, rank: g.debugApi.state().rep, ev: window.__ev }));
  h.log('end', JSON.stringify(end));
  h.log('lines:\n  ' + lines.filter((l) => !l.startsWith('[toast] objective')).slice(0, 40).join('\n  '));
}
