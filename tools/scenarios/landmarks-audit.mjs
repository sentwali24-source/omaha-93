// Landmarks audit: stats, per-landmark colliders, generic city buildings that intrude into
// landmark footprints, freeway pillars standing in roadways, water colliders and the landmark
// draw-call share at a few viewpoints. Prints a JSON report (no screenshots unless LM_SHOTS=1).
export default async function (page, h) {
  const report = await h.game(async (g) => {
    const map = await import('/src/data/map.js');
    const L = g.layout;
    const col = g.collision;
    const out = { stats: g.debugApi.landmarks?.stats?.(), landmarks: [], intruders: [], pillarsInRoad: [], water: {} };
    const boxes = [...col.boxes.values()];
    const inRect = (b, r, m = 0) => b.maxX > r.x0 - m && b.minX < r.x1 + m && b.maxZ > r.z0 - m && b.minZ < r.z1 + m;
    for (const l of map.LANDMARKS) {
      const r = l.rect;
      const mine = boxes.filter((b) => inRect(b, r) && b.tag !== 'bounds');
      const byTag = {};
      for (const b of mine) byTag[b.tag] = (byTag[b.tag] || 0) + 1;
      out.landmarks.push({ id: l.id, tags: byTag });
    }
    // generic city boxes (building/house) that overlap a landmark footprint's land (not roads)
    for (const l of map.LANDMARKS) {
      for (const b of boxes) {
        if (b.tag !== 'building' && b.tag !== 'house') continue;
        if (!inRect(b, l.rect, -0.5)) continue;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        out.intruders.push({ lm: l.id, tag: b.tag, cx: +cx.toFixed(1), cz: +cz.toFixed(1), w: +(b.maxX - b.minX).toFixed(1), d: +(b.maxZ - b.minZ).toFixed(1) });
      }
    }
    for (const f of map.FREEWAYS) {
      for (const b of boxes) {
        if (!inRect(b, f.corridor) || b.tag === 'bounds' || b.tag === 'water') continue;
        const pts = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ], [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]];
        const road = pts.some(([x, z]) => L.isRoad(x, z));
        if (road) out.pillarsInRoad.push({ fw: f.id, tag: b.tag, x: +((b.minX + b.maxX) / 2).toFixed(1), z: +((b.minZ + b.maxZ) / 2).toFixed(1), w: +(b.maxX - b.minX).toFixed(1), d: +(b.maxZ - b.minZ).toFixed(1) });
      }
    }
    for (const w of map.WATER) {
      out.water[w.id] = boxes.filter((b) => b.tag === 'water' && inRect(b, w)).length;
    }
    out.meshes = g.debugApi.landmarks?.meshes?.().sort((a, b) => b.tris - a.tris).slice(0, 25);
    out.meshCount = g.debugApi.landmarks?.meshes?.().length;
    return out;
  });
  h.log('stats', JSON.stringify(report.stats));
  h.log('landmark colliders', JSON.stringify(report.landmarks.map((l) => `${l.id}:${JSON.stringify(l.tags)}`)));
  h.log('intruders', report.intruders.length, JSON.stringify(report.intruders.slice(0, 40)));
  h.log('pillarsInRoad', report.pillarsInRoad.length, JSON.stringify(report.pillarsInRoad.slice(0, 40)));
  h.log('water', JSON.stringify(report.water));
  h.log('meshCount', report.meshCount, 'top', JSON.stringify(report.meshes));

  // landmark draw-call share at viewpoints (player teleported, normal game camera)
  const views = process.env.LM_POINTS ? JSON.parse(process.env.LM_POINTS) : [[290, -835], [150, -560], [360, 90], [520, 200], [650, 60]];
  for (const [x, z] of views) {
    await h.game((g, p) => g.debugApi.teleport(p[0], p[1]), [x, z]);
    await h.wait(2500);
    const r = await h.game((g) => {
      const info = g.renderer.info.render;
      const grp = g.city.group.getObjectByName('landmarks');
      g.renderer.render(g.scene, g.camera);
      const all = { calls: info.calls, tris: info.triangles };
      grp.visible = false;
      g.renderer.render(g.scene, g.camera);
      const without = { calls: info.calls, tris: info.triangles };
      grp.visible = true;
      return { all, lmCalls: all.calls - without.calls, lmTris: all.tris - without.tris, q: g.settings.quality };
    });
    h.log(`view ${x},${z}`, JSON.stringify(r));
    if (process.env.LM_SHOTS) await h.shot(`audit-${x}_${z}`);
  }
}
