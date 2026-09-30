// Pager → payphone → briefing → mission, then every template and the whole story chain via the
// debug helpers (startMission / completeObjective), plus fail conditions and the saved state.
//   node tools/smoke.mjs --port 5207 --no-server --out tools/out/gameplay-missions --script tools/scenarios/gameplay-missions.mjs
const TEMPLATES = ['tag_run', 'wheels', 'beef', 'escort', 'recruit', 'lose_heat', 'delivery'];

async function waitFor(h, fn, arg, ms = 12000) {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < ms) {
    v = await h.game(fn, arg);
    if (v) return v;
    await h.wait(200);
  }
  return v;
}

async function lookAtMarker(h) {
  await h.game((g) => {
    const m = g.missions.active;
    const mk = m?.markers?.[0];
    if (!mk) return;
    const p = g.player.position;
    const dx = mk.x - p.x;
    const dz = mk.z - p.z;
    const hd = Math.atan2(-dx, -dz);
    g.player.faceHeading(hd);
    g.cameraRig.yaw = hd;
    g.cameraRig.pitch = 0.08;
    g.cameraRig.snap();
  });
}

async function run(h, id, maxSkips = 8) {
  const ok = await h.game((g, id) => g.debugApi.startMission(id), id);
  if (!ok) {
    h.assert(false, `start ${id} failed`);
    return false;
  }
  const a = await h.game((g) => g.debugApi.missions.active());
  h.log(`start ${id}: "${a?.title}" · ${a?.objective} · markers ${a?.markers.length}`);
  for (let i = 0; i < maxSkips; i++) {
    await h.wait(450);
    const still = await h.game((g, id) => !!g.missions.active && g.missions.active.id.includes(id), id);
    if (!still) break;
    const stage = await h.game((g) => g.missions.active.stage);
    await h.game((g) => g.debugApi.completeObjective());
    // let the mission's update() see the new state (headless frames can be slow)
    await waitFor(h, (g, stage) => !g.missions.active || g.missions.active.stage !== stage, stage, 2500);
  }
  await waitFor(h, (g, id) => window.__mlog.some((e) => e.id.includes(id) && e.type !== 'start'), id, 5000);
  const res = await h.game((g, id) => window.__mlog.filter((e) => e.id.includes(id)).map((e) => e.type), id);
  const passed = res.includes('complete');
  h.assert(passed, `${id} should complete (events: ${res.join(',')})`);
  return passed;
}

export default async function (page, h) {
  await h.game((g) => {
    window.__mlog = [];
    for (const t of ['start', 'update', 'complete', 'fail']) {
      g.events.on(`mission:${t}`, ({ mission, reward, reason }) => {
        if (t !== 'update') window.__mlog.push({ type: t, id: mission.id, reward, reason });
      });
    }
    window.__pages = [];
    g.events.on('pager', (p) => window.__pages.push(p));
    // the first page normally comes ~7 s into a new game; headless can be very slow
    g.missions._pageIn = Math.min(g.missions._pageIn, 1.5);
  });

  // 1. the pager goes off shortly after a new game and the nearest payphone rings
  let offer = null;
  for (let i = 0; i < 90 && !offer; i++) {
    await h.wait(500);
    offer = await h.game((g) => g.debugApi.missions.offer());
  }
  const gt = await h.game((g) => g.time.elapsed.toFixed(1));
  h.log('game time at first page', gt);
  const pages = await h.game(() => window.__pages);
  h.log('offer', JSON.stringify(offer), 'pages', JSON.stringify(pages));
  h.assert(offer && offer.id === 'story1', 'first page should offer story1');
  h.assert(pages.length >= 1 && /911/.test(pages[0].text), 'pager text has 911');

  // walk up to the ringing payphone and answer it with E
  await h.game((g) => {
    const id = g.missions.offer.phone.id;
    const poi = g.shops.pois.find((p) => p.id === id);
    g.debugApi.teleport(poi.x, poi.z);
    g.player.faceHeading(poi.heading || 0);
    g.cameraRig.yaw = (poi.heading || 0) + 0.8;
    g.cameraRig.pitch = 0.2;
    g.cameraRig.snap();
  });
  await h.wait(900);
  const label = await h.game((g) => g.hud.prompt);
  h.log('prompt at phone:', label);
  h.assert(label === 'Answer payphone', 'prompt should be "Answer payphone"');
  await h.shot('20-payphone-ringing');
  await h.press('KeyE');
  await h.wait(800);
  const act = await h.game((g) => g.debugApi.missions.active());
  h.log('after answering:', JSON.stringify(act));
  h.assert(act && act.id === 'story1', 'story1 active after answering');
  await lookAtMarker(h);
  await h.wait(600);
  await h.shot('21-story1-marker');

  // walk to the OG: teleport next to the hood and use "Talk to"
  await h.game((g) => {
    const hood = g.missions.hoodPoi();
    g.debugApi.teleport(hood.x + 0.5, hood.z + 0.5);
  });
  await h.wait(900);
  const talk = await h.game((g) => g.hud.prompt);
  h.log('prompt at hood:', talk);
  await h.press('KeyE');
  await h.wait(900);
  const s1 = await h.game(() => window.__mlog.filter((e) => e.id === 'story1').map((e) => e.type));
  h.assert(s1.includes('complete'), 'story1 completes by talking to the OG');
  const st1 = await h.game((g) => ({ cash: g.state.cash, rep: g.state.rep, completed: g.state.missions.completed }));
  h.log('after story1', JSON.stringify(st1));

  // 2. every side-job template once
  for (const t of TEMPLATES) await run(h, t);

  // a mid-mission screenshot with a far marker: a delivery run
  await h.game((g) => g.debugApi.startMission('delivery'));
  await h.wait(400);
  await h.game((g) => {
    const mk = g.missions.active.markers[0];
    g.debugApi.teleport(mk.x + 45, mk.z + 30);
  });
  await lookAtMarker(h);
  await h.wait(900);
  await h.shot('22-delivery-marker');
  // fail by timer
  await h.game((g) => g.debugApi.completeObjective());
  await waitFor(h, (g) => g.missions.active?.stage === 1);
  await h.game((g) => {
    if (g.missions.active) g.missions.active.timer = 0.2;
  });
  await waitFor(h, () => window.__mlog.some((e) => e.type === 'fail'));
  const failed = await h.game(() => window.__mlog.filter((e) => e.type === 'fail').map((e) => e.reason));
  h.log('fail reasons', JSON.stringify(failed));
  h.assert(failed.includes('Out of time'), 'delivery fails when the timer runs out');

  // fail by KO: player:down fails the job, message after respawn
  await h.game((g) => g.debugApi.startMission('beef'));
  await h.wait(300);
  await h.game((g) => g.player.knockOut());
  await waitFor(h, () => window.__mlog.some((e) => e.reason === 'You got knocked out'));
  const koFail = await h.game(() => window.__mlog.filter((e) => e.type === 'fail').map((e) => e.reason));
  h.assert(koFail.includes('You got knocked out'), 'KO fails the mission');
  await waitFor(h, (g) => g.player.alive && !g._respawnTimer, null, 20000);

  // 3. the story chain in order (debug bypasses the rank locks)
  for (let n = 2; n <= 10; n++) await run(h, `story${n}`, 10);
  await h.wait(1500);
  const end = await h.game((g) => ({
    completed: g.state.missions.completed,
    counter: g.state.missions.counter,
    ended: g.state.flags['missions.ended'],
    stats: g.state.stats.missions,
    rep: g.state.rep,
    cash: g.state.cash,
    turf: Object.fromEntries(Object.entries(g.state.turf).filter(([, t]) => t.owner === 'psc')),
    avail: g.missions.available().map((a) => a.id),
  }));
  h.log('end', JSON.stringify(end));
  h.assert(end.completed.length === 10, 'all 10 story missions completed');
  h.assert(end.ended === true, 'ending flag set');

  // saved?
  const saved = await h.game((g) => {
    g.save();
    const raw = JSON.parse(localStorage.getItem('omaha93.save.v1'));
    return raw.missions;
  });
  h.log('saved missions', JSON.stringify(saved));
  h.assert(saved.completed.length === 10, 'save has the completed story');
  await h.shot('23-end');
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify({ calls: perf.calls, triangles: perf.triangles, fps: perf.fps }));
}
