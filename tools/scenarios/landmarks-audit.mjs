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
    // city buildings that poke up into a freeway deck (anything taller than the deck soffit)
    out.deckHits = [];
    const seen = new Set();
    for (const p of g.debugApi.landmarks?.freeway?.(4) || []) {
      if (p.x > 1000) continue;
      const hw = p.w / 2;
      const rx = -p.dz;
      const rz = p.dx;
      const ax = p.x + rx * hw;
      const az = p.z + rz * hw;
      const bx = p.x - rx * hw;
      const bz = p.z - rz * hw;
      for (const b of col.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz))) {
        if (seen.has(b.id) || b.tag === 'landmark' || b.tag === 'water' || b.tag === 'bounds') continue;
        if (b.maxY < p.y - 1.6) continue;
        seen.add(b.id);
        out.deckHits.push({ tag: b.tag, x: +((b.minX + b.maxX) / 2).toFixed(1), z: +((b.minZ + b.maxZ) / 2).toFixed(1), maxY: +b.maxY.toFixed(1), deckY: +p.y.toFixed(1) });
      }
    }
    // any collider whose centre or corners stand in a roadway (curb to curb, graph edges and
    // intersections only: layout.isRoad also counts streets through parks where no road is drawn)
    const edgeRects = L.edges.map((e) => {
      const a = L.nodes[e.a];
      const b = L.nodes[e.b];
      const hw = e.width / 2;
      return e.axis === 'z' ? [a.x - hw, Math.min(a.z, b.z) - hw, a.x + hw, Math.max(a.z, b.z) + hw] : [Math.min(a.x, b.x) - hw, a.z - hw, Math.max(a.x, b.x) + hw, a.z + hw];
    });
    const onRoad = (x, z) => edgeRects.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
    out.inRoad = boxes
      .filter((b) => b.tag !== 'bounds' && b.tag !== 'water' && b.minY < 3)
      .filter((b) => {
        const i = 0.3;
        const pts = [[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2], [b.minX + i, b.minZ + i], [b.maxX - i, b.minZ + i], [b.minX + i, b.maxZ - i], [b.maxX - i, b.maxZ - i]];
        return pts.some(([x, z]) => onRoad(x, z));
      })
      .map((b) => ({ tag: b.tag, x: +((b.minX + b.maxX) / 2).toFixed(1), z: +((b.minZ + b.maxZ) / 2).toFixed(1), w: +(b.maxX - b.minX).toFixed(1), d: +(b.maxZ - b.minZ).toFixed(1), y: +b.maxY.toFixed(1) }));
    // city objects standing on the levee slope (x 689..700)
    out.levee = boxes
      .filter((b) => b.maxX > 689.5 && b.minX < 700 && b.tag !== 'landmark' && b.tag !== 'water' && b.tag !== 'bounds')
      .map((b) => ({ tag: b.tag, x: +((b.minX + b.maxX) / 2).toFixed(1), z: +((b.minZ + b.maxZ) / 2).toFixed(1), x1: +b.maxX.toFixed(1) }));
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
  h.log('inRoad', report.inRoad.length, JSON.stringify(report.inRoad.slice(0, 40)));
  h.log('levee', report.levee.length, JSON.stringify(report.levee.slice(0, 30)));
  h.log('deckHits', report.deckHits.length, JSON.stringify(report.deckHits.slice(0, 40)));
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
