// Close-up line-ups of every outfit / hair / hat / skin tone. Screenshots: lineup-<set>-<n>.png
// LINEUP_SETS=outfits,hair  LINEUP_ANIM=walk  env vars narrow the run.
export default async function (page, h) {
  await h.game(async (g) => {
    if (!g.debugApi.lineup) {
      const m = await import('/src/entities/character/debug.js');
      m.installCharacterDebug(g);
    }
    g.debugApi.setHour(13);
    if (!g.cameraRig._debugPatched && !g.cameraRig.supportsDebugView) {
      g.cameraRig._debugPatched = true;
      const orig = g.cameraRig.update.bind(g.cameraRig);
      g.cameraRig.update = function (dt) {
        const v = this.debugView;
        if (!v) return orig(dt);
        const cam = g.camera;
        cam.position.copy(v.position);
        cam.lookAt(v.lookAt);
        cam.fov = v.fov || 50;
        cam.updateProjectionMatrix();
      };
    }
  });
  const sets = (process.env.LINEUP_SETS || 'outfits,hair,hats,skin,npc').split(',');
  const anim = process.env.LINEUP_ANIM || 'idle';
  const per = Number(process.env.LINEUP_PER || 5);
  for (const set of sets) {
    for (let start = 0; start < 12; start += per) {
      const n = await h.game((g, a) => g.debugApi.lineup({ set: a.set, range: [a.start, a.start + a.per], spacing: 0.9, dist: 3.3, camY: 1.35, lookY: 1.05, fov: 45, anim: a.anim }), { set, start, per, anim });
      if (!n) break;
      await h.wait(1800);
      await h.shot(`lineup-${set}-${start / per}`);
      if (n < per) break;
    }
  }
  h.log(JSON.stringify(await h.game((g) => ({ stats: g.debugApi.characterStats(), perf: g.debugApi.perf() }))));
}
