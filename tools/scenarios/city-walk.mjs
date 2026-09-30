// Walk into a few city colliders (house, storefront, fence, pole) and check the player stops at
// the collider face; a side-view screenshot shows whether the wall is where the collider is.
import path from 'node:path';
export default async function (page, h) {
  const out = path.resolve(process.argv[process.argv.indexOf('--out') + 1]);
  const shot = (n) => page.screenshot({ path: path.join(out, `${n}.png`), timeout: 120000 }).catch((e) => h.log('shot failed', e.message.slice(0, 60)));
  // pick targets from the city's own collider log near the spawn
  const targets = await h.game((g) => {
    const C = g.city._ctx;
    const p = g.player.position;
    const L = g.layout;
    const res = [];
    const want = { house: 1, building: 1, fence: 1, prop: 1 };
    const boxes = C.boxLog.slice().sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - p.x, (a.minZ + a.maxZ) / 2 - p.z) - Math.hypot((b.minX + b.maxX) / 2 - p.x, (b.minZ + b.maxZ) / 2 - p.z));
    for (const b of boxes) {
      if (!want[b.tag]) continue;
      if (b.tag === 'fence' && b.maxY > 1.3) continue;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      // approach from the sidewalk side: find the face whose outside point is on a sidewalk
      const cands = [[cx, b.maxZ + 3, 0], [cx, b.minZ - 3, Math.PI], [b.maxX + 3, cz, Math.PI / 2], [b.minX - 3, cz, -Math.PI / 2]];
      const c = cands.find(([x, z]) => L.isSidewalk(x, z) && g.collision.isFree(x, z, 0.4, 0.3, 1.8));
      if (!c) continue;
      want[b.tag]--;
      res.push({ tag: b.tag, box: [b.minX, b.minZ, b.maxX, b.maxZ, b.maxY], start: c });
      if (!Object.values(want).some((v) => v > 0)) break;
    }
    return res;
  });
  for (const t of targets) {
    await h.game((g, t) => {
      g.debugApi.teleport(t.start[0], t.start[1]);
      g.player.heading = t.start[2];
      g.cameraRig.yaw = t.start[2];
      g.cameraRig.snap();
    }, t);
    await h.wait(800);
    // walk toward the box (heading faces it: moving from outside toward the center)
    await h.game((g, t) => {
      const [x0, z0, x1, z1] = t.box;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const p = g.player.position;
      const hd = Math.atan2(-(cx - p.x), -(cz - p.z));
      g.cameraRig.yaw = hd;
      g.cameraRig.snap();
    }, t);
    await h.hold('KeyW', 6000);
    // then stand exactly against the collider face (slow software GL: walking may not get there)
    await h.game((g, t) => {
      const [x0, z0, x1, z1] = t.box;
      const [sx, sz] = t.start;
      const x = sx > x1 ? x1 + 0.5 : sx < x0 ? x0 - 0.5 : sx;
      const z = sz > z1 ? z1 + 0.5 : sz < z0 ? z0 - 0.5 : sz;
      g.debugApi.teleport(x, z);
    }, t);
    await h.wait(500);
    const r = await h.game((g, t) => {
      const p = g.player.position;
      const [x0, z0, x1, z1] = t.box;
      const dx = Math.max(x0 - p.x, 0, p.x - x1);
      const dz = Math.max(z0 - p.z, 0, p.z - z1);
      return { p: [+p.x.toFixed(2), +p.z.toFixed(2)], y: +p.y.toFixed(2), distToBox: +Math.hypot(dx, dz).toFixed(2) };
    }, t);
    h.log(t.tag, JSON.stringify(t.box.map((v) => +v.toFixed(2))), JSON.stringify(r));
    await h.game((g, t) => {
      const p = g.player.position;
      const [x0, z0, x1, z1] = t.box;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      // side view: perpendicular to the approach direction
      const ax = p.x - cx, az = p.z - cz;
      const l = Math.hypot(ax, az) || 1;
      g.cameraRig.update = () => {};
      g.camera.position.set(p.x + (-az / l) * 6 + (ax / l) * 2, 2.2, p.z + (ax / l) * 6 + (az / l) * 2);
      g.camera.lookAt(p.x, 1.0, p.z);
    }, t);
    await h.wait(900);
    await shot(`walk-${t.tag}`);
    await h.game((g) => { delete g.cameraRig.update; });
  }
}
