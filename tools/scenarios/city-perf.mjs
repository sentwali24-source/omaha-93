// City performance + content audit: POI / tag spot / parking counts, then draw calls at a few spots
// (full scene, and the city group alone) with a per-mesh-name breakdown of what the city draws.
// CITY_SPOTS env (JSON [[name, x, z, yaw, hour]]) overrides the spots.
const SPOTS = [
  ['24th-lake', 150, -560, 0, 13],
  ['kountze', 200, -700, Math.PI * 0.85, 13],
  ['downtown', 370, 115, 0, 13],
  ['oldmarket', 515, 232, Math.PI / 2, 13],
];

export default async function (page, h) {
  const audit = await h.game((g) => {
    const c = g.city;
    const types = {};
    for (const p of c.pois) types[p.type] = (types[p.type] || 0) + 1;
    const zones = g.gangs?.zones?.() || [];
    const perZone = {};
    for (const z of zones) perZone[z.id] = { tags: 0, stores: 0 };
    for (const t of c.tagSpots) if (perZone[t.zoneId]) perZone[t.zoneId].tags++;
    for (const p of c.pois) if (p.type === 'store' && perZone[p.zoneId]) perZone[p.zoneId].stores++;
    const hoods = c.pois.filter((p) => p.type === 'hood').map((p) => p.id);
    return { stats: { buildMs: c.stats?.buildMs, phases: c.stats?.phases }, types, perZone, hoods, parking: c.parkingSpots.length, tagSpots: c.tagSpots.length, nightMats: c.nightMaterials.length, children: c.group.children.length };
  });
  h.log('audit', JSON.stringify(audit));
  const spots = process.env.CITY_SPOTS ? JSON.parse(process.env.CITY_SPOTS) : SPOTS;
  for (const [name, x, z, yaw, hour, weather] of spots) {
    await h.game((g, a) => {
      g.debugApi.teleport(a.x, a.z);
      g.debugApi.setHour(a.hour);
      g.debugApi.weather?.(a.weather || 'clear');
      if (g.cameraRig) {
        g.cameraRig.yaw = a.yaw;
        g.cameraRig.pitch = 0.12;
        g.cameraRig.snap?.();
      }
    }, { x, z, yaw, hour, weather });
    await h.wait(3000);
    if (!process.env.NOSHOT) await h.shot(`perf-${name}`).catch((e) => h.log('shot failed', e.message.slice(0, 60)));
    const r = await h.game((g) => {
      const R = g.renderer;
      const scene = g.scene;
      const cam = g.camera;
      const measure = () => {
        R.info.reset();
        R.render(scene, cam);
        return { calls: R.info.render.calls, tris: R.info.render.triangles };
      };
      const auto = R.info.autoReset;
      R.info.autoReset = false;
      const full = measure();
      const vis = scene.children.map((o) => o.visible);
      scene.children.forEach((o) => (o.visible = o === g.city.group));
      const city = measure();
      scene.children.forEach((o, i) => (o.visible = vis[i]));
      R.info.autoReset = auto;
      const names = {};
      let fogged = 0;
      const m4 = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
      const e = m4.elements;
      const planes = [
        [e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]],
        [e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]],
        [e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]],
        [e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]],
        [e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]],
        [e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]],
      ].map((p) => {
        const l = Math.hypot(p[0], p[1], p[2]);
        return p.map((v) => v / l);
      });
      g.city.group.traverseVisible((o) => {
        if (!o.geometry) return;
        const gs = o.geometry;
        if (!gs.boundingSphere) gs.computeBoundingSphere();
        const s = gs.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
        const rad = gs.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
        if (o.frustumCulled !== false) for (const p of planes) if (p[0] * s.x + p[1] * s.y + p[2] * s.z + p[3] < -rad) return;
        if (g.scene.fog && s.distanceTo(cam.position) - rad > g.scene.fog.far) fogged++;
        const k = (o.name || o.type).replace(/[:#-]\d+.*$/, '');
        names[k] = (names[k] || 0) + (Array.isArray(o.material) ? o.material.length : 1);
      });
      return { full, city, fogged, far: +cam.far.toFixed(0), fog: +g.scene.fog.far.toFixed(0), names };
    });
    h.log(name, JSON.stringify(r));
  }
}
