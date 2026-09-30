// Mission rival crews after the mission ends: start "defend the hood" (story9), stand still until
// the crew knocks the player out (mission fails), then keep standing at the respawn point and count
// how often the leftover crew knocks the player out again. Fast-forward loop, no rendering.
export default async function (page, h) {
  await h.game((g) => {
    window.__ff = (frames, stop) => {
      const r = g.renderer.render;
      g.renderer.render = () => {};
      try {
        for (let i = 0; i < frames; i++) {
          g._last = performance.now() - 50;
          g._frame();
          g.camera.updateMatrixWorld();
          if (stop && stop()) return i;
        }
      } finally {
        g.renderer.render = r;
      }
      return frames;
    };
    window.__kos = 0;
    window.__ev = [];
    g.events.on('actor:ko', (e) => {
      if (e.target === g.player) window.__kos++;
    });
    for (const n of ['mission:start', 'mission:complete', 'mission:fail', 'player:respawn']) g.events.on(n, (e) => window.__ev.push(`${n}:${e?.mission?.id || e?.reason || ''}`));
  });
  const hostileNear = (g) => {
    const p = g.player.position;
    return g.gangs.members.filter((a) => a.alive && g.gangs.isHostile(a) && Math.hypot(a.position.x - p.x, a.position.z - p.z) < 30).length;
  };
  const mission = process.env.CREW_MISSION || 'story9';
  const start = await h.game((g, id) => {
    const s = g.hoodSpawn();
    g.debugApi.teleport(s.x + 1, s.z + 1);
    g.debugApi.missions.completeStory(8);
    return g.debugApi.startMission(id);
  }, mission);
  const f1 = await h.game((g) => window.__ff(4000, () => window.__kos > 0));
  const atKo = await h.game((g) => ({ frames: 0, mission: g.missions.active?.id || null, ev: window.__ev.slice() }));
  // wait out the respawn
  await h.game((g) => window.__ff(120));
  const atRespawn = await h.game((g, src) => ({ alive: g.player.alive, hostileNear: new Function('g', `return (${src})(g)`)(g) }), hostileNear.toString());
  const kos0 = await h.game(() => window.__kos);
  await h.game((g) => window.__ff(1600)); // 80 s standing at the hood
  const after = await h.game((g, src) => ({ kos: window.__kos, hostileNear: new Function('g', `return (${src})(g)`)(g), hunt: g.gangs.groups.filter((q) => q.kind === 'hunt').length, members: g.gangs.members.length, cash: g.state.cash }), hostileNear.toString());
  h.log('crew', JSON.stringify({ mission, start, framesToKo: f1, atKo, atRespawn, kosAfterFirst: after.kos - kos0, after }));
}
