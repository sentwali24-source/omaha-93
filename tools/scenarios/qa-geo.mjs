// GPU geometry / texture growth while standing in one place for many in-game minutes (traffic and
// peds keep spawning / despawning around the player). Fast-forward loop plus a few real frames per
// segment so renderer.info.memory stays current.
export default async function (page, h) {
  await h.game((g) => {
    window.__ff = (frames) => {
      const r = g.renderer.render;
      g.renderer.render = () => {};
      try {
        for (let i = 0; i < frames; i++) {
          g._last = performance.now() - 50;
          g._frame();
          g.camera.updateMatrixWorld();
        }
      } finally {
        g.renderer.render = r;
      }
    };
  });
  const segs = Number(process.env.GEO_SEGMENTS || 16);
  const [x, z] = (process.env.GEO_AT || '370,115').split(',').map(Number);
  await h.game((g, a) => g.debugApi.teleport(a.x, a.z), { x, z });
  for (let s = 0; s < segs; s++) {
    await h.game((g) => window.__ff(600));
    await h.wait(1500); // real frames: uploads / disposals show up in renderer.info
    const m = await h.game((g) => {
      const inScene = new Set();
      g.scene.traverse((o) => o.geometry && inScene.add(o.geometry));
      const bodies = new Set(g.vehicles.map((v) => v.body?.geometry).filter(Boolean));
      return { t: Math.round(g.time.elapsed), geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures, inScene: inScene.size, vehicles: g.vehicles.length, bodyGeos: bodies.size, actors: g.actors.length, char: g.debugApi.characterStats?.() };
    });
    h.log('geo', JSON.stringify(m));
  }
}
