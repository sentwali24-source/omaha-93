// Tag a wall by holding E, check ownership / rewards / save flags, look at the decals.
//   node tools/smoke.mjs --port 5207 --no-server --out tools/out/gameplay-tag --script tools/scenarios/gameplay-tag.mjs
export default async function (page, h) {
  const info = await h.game((g) => ({
    fallback: g.debugApi.tagging.fallback,
    spots: g.tagging.spots.length,
    byZone: g.tagging.spots.reduce((m, s) => ((m[s.zoneId] = (m[s.zoneId] || 0) + 1), m), {}),
    owners: g.tagging.spots.reduce((m, s) => ((m[s.owner] = (m[s.owner] || 0) + 1), m), {}),
  }));
  h.log('spots', JSON.stringify(info));
  h.assert(info.spots > 20, 'expected > 20 tag spots');

  // stand in front of the nearest wall we don't own, camera over the shoulder
  const id = await h.game((g) => {
    const id = g.debugApi.tagging.goto();
    g.cameraRig.yaw = g.player.heading + 0.7;
    g.cameraRig.pitch = 0.18;
    g.cameraRig.snap?.();
    return id;
  });
  h.log('spot', id);
  await h.wait(900);
  const before = await h.game((g) => ({ rep: g.state.rep, cash: g.state.cash, near: g.debugApi.tagging.near(), prompt: g.hud.prompt, owner: g.tagging.ownerOf(g.debugApi.tagging.near()) }));
  h.log('before', JSON.stringify(before));
  h.assert(before.near === id, 'spot should be in reach');
  await h.shot('10-before');

  await h.down('KeyE');
  let shot = false;
  let done = false;
  for (let i = 0; i < 40 && !done; i++) {
    await h.wait(250);
    const s = await h.game((g, id) => ({ p: g.interactions.progress, owner: g.tagging.ownerOf(id), spraying: g.tagging.spraying }), id);
    if (!shot && s.p > 0.45) {
      shot = true;
      await h.game((g) => {
        g.cameraRig.yaw = g.player.heading + 0.7;
      });
      await h.shot('11-spraying');
      h.log('mid-spray', JSON.stringify(s));
    }
    done = s.owner === 'psc';
  }
  await h.up('KeyE');
  await h.wait(600);
  const after = await h.game((g, id) => ({
    owner: g.tagging.ownerOf(id),
    rep: g.state.rep,
    cash: g.state.cash,
    tags: g.state.stats.tags,
    flag: g.state.flags['tagging.owners']?.[id],
    control: g.state.turf[g.tagging.spotById(id).zoneId],
  }), id);
  h.log('after', JSON.stringify(after));
  h.assert(after.owner === 'psc', 'spot should be owned by the player set');
  h.assert(after.rep === before.rep + 15, 'tag should give +15 rep');
  h.assert(after.cash === before.cash + 5, 'tag should give +$5');
  h.assert(after.tags === 1, 'stats.tags should be 1');
  h.assert(after.flag === 'psc', 'owners saved in flags');
  await h.game((g) => {
    g.cameraRig.yaw = g.player.heading + 0.9;
    g.cameraRig.pitch = 0.12;
    g.cameraRig.distance = 5;
  });
  await h.wait(500);
  await h.shot('12-tagged');

  // a tour of a few decals from different sets
  for (const setId of ['lvb', 'ngc', 'wbb']) {
    const sid = await h.game((g, setId) => {
      const s = g.tagging.spots.find((q) => q.owner === setId) || g.tagging.spots.find((q) => q.owner && q.owner !== 'psc');
      if (!s) return null;
      g.debugApi.teleport(s.x + s.nx * 5, s.z + s.nz * 5);
      g.player.faceHeading(Math.atan2(s.nx, s.nz));
      g.cameraRig.yaw = Math.atan2(s.nx, s.nz) + 0.25;
      g.cameraRig.pitch = 0.1;
      g.cameraRig.snap();
      return s.id + ':' + s.owner;
    }, setId);
    h.log('view', sid);
    await h.wait(700);
    await h.shot(`13-view-${setId}`);
  }

  // save round-trip: owners survive in state.flags
  const saved = await h.game((g) => {
    g.save();
    const raw = JSON.parse(localStorage.getItem('omaha93.save.v1'));
    return Object.values(raw.flags['tagging.owners']).filter((o) => o === 'psc').length;
  });
  h.log('saved psc walls', saved);
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify({ calls: perf.calls, triangles: perf.triangles, fps: perf.fps }));
}
