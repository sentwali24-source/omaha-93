// Title-screen flyover (run WITHOUT autostart): verify the loop never enters a collision box and
// screenshot 24th & Lake, the skyline reveal, the Old Market and North 30th.
import { waitGame } from './player-util.mjs';

export default async function (page, h) {
  const check = await h.game((g) => {
    const rig = g.cameraRig;
    if (!rig._path) rig._buildAttractPath();
    const P = rig._path;
    const col = g.collision;
    const v = { x: 0, y: 0, z: 0 };
    let inside = 0;
    let minClear = Infinity;
    let maxY = 0;
    let minY = Infinity;
    for (let i = 0; i <= P.N; i++) {
      const pt = P.path.getPoint(P.u[i]);
      const y = Math.max(pt.y, P.lift[i]);
      maxY = Math.max(maxY, y);
      minY = Math.min(minY, y);
      const boxes = col.query(pt.x - 4, pt.z - 4, pt.x + 4, pt.z + 4);
      for (const b of boxes) {
        if (b.tag === 'bounds' || b.tag === 'water') continue;
        const inXZ = pt.x >= b.minX && pt.x <= b.maxX && pt.z >= b.minZ && pt.z <= b.maxZ;
        if (inXZ && y >= b.minY && y <= b.maxY) inside++;
        const cx = Math.max(b.minX, Math.min(pt.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pt.z, b.maxZ));
        const dy = y > b.maxY ? y - b.maxY : 0;
        const d = Math.hypot(pt.x - cx, pt.z - cz, dy);
        minClear = Math.min(minClear, d);
      }
    }
    return { total: P.total, n: P.N, inside, minClear, maxY, minY, mode: g.mode };
  });
  h.log('attract path', JSON.stringify(check));
  h.assert(check.mode === 'attract', 'title screen (attract mode)');
  h.assert(check.inside === 0, 'flyover never enters a collision box');
  h.assert(check.minClear > 2, `flyover keeps clearance (${check.minClear.toFixed(2)} m)`);
  h.assert(check.minY < 12, `starts near street level (${check.minY.toFixed(1)} m)`);

  const shots = [
    ['attract-0-lake24', 0.0],
    ['attract-1-rise', 0.1],
    ['attract-2-skyline', 0.2],
    ['attract-3-farnam', 0.3],
    ['attract-4-oldmarket', 0.4],
    ['attract-5-river', 0.49],
    ['attract-6-north30', 0.8],
    ['attract-7-lake', 0.93],
  ];
  for (const [name, f] of shots) {
    await h.game((g, f) => {
      const rig = g.cameraRig;
      rig._s = rig._path.total * f;
      rig._cursor = 0;
      rig._snap = true;
    }, f);
    await waitGame(h, 0.3);
    const c = await h.game((g) => g.debugApi.camera());
    h.log(name, JSON.stringify({ x: c.x, y: c.y, z: c.z, s: c.s }));
    await h.shot(name);
  }
  // it actually moves on its own
  const a = await h.game((g) => g.cameraRig._s);
  await waitGame(h, 1.0);
  const b = await h.game((g) => g.cameraRig._s);
  h.assert(b > a, 'flyover advances');
}
