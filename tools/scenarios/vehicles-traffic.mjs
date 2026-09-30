// Let traffic run ~50 s around the player and check that no car is stuck, overlapping another
// or off the road. Overhead screenshots along the way.
//   node tools/smoke.mjs --port 5205 --no-server --out tools/out/vehicles-traffic --script tools/scenarios/vehicles-traffic.mjs
export default async function (page, h) {
  await h.wait(2000);
  const snap = () =>
    h.game((g) => {
      const out = {};
      for (const v of g.traffic.cars) {
        if (v.userData.owner !== 'traffic') continue;
        out[v.uid] = { x: v.position.x, z: v.position.z, t: g.time.elapsed };
      }
      return out;
    });
  let r = await h.game((g) => g.debugApi.trafficReport());
  h.log('start', JSON.stringify(r));
  h.assert(r.cars > 0, 'traffic spawned');
  h.assert(r.parked > 0, 'parked cars spawned');
  await h.game((g) => {
    const p = g.player.position;
    g.debugApi.freeCam({ x: p.x + 40, y: 55, z: p.z + 55 }, { x: p.x, y: 0, z: p.z });
  });
  let prev = await snap();
  let worstOverlap = 0;
  let worstOffRoad = 0;
  const stuckSeen = {};
  // game time runs far slower than real time under software GL: sample on game time
  const gwait = async (sec, maxMs = 120000) => {
    const t0 = await h.game((g) => g.time.elapsed);
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      await h.wait(250);
      if ((await h.game((g) => g.time.elapsed)) - t0 >= sec) return;
    }
  };
  const waitMax = {};
  for (let i = 0; i < 5; i++) {
    await gwait(7);
    r = await h.game((g) => g.debugApi.trafficReport());
    h.log(`t${i}`, JSON.stringify(r));
    worstOverlap = Math.max(worstOverlap, r.overlaps);
    worstOffRoad = Math.max(worstOffRoad, r.offRoad);
    await h.shot(`2${i}-traffic`);
    const cur = await snap();
    // cars present in both samples that barely moved: why?
    const still = await h.game(
      (g, prev) => {
        const res = [];
        for (const v of g.traffic.cars) {
          const p0 = prev[v.uid];
          if (!p0 || v.userData.owner !== 'traffic') continue;
          const d = Math.hypot(v.position.x - p0.x, v.position.z - p0.z);
          if (d < 2) {
            const ai = v.ai;
            const sig = ai?.waiting != null ? g.city.signalAt?.(ai.waiting) : null;
            res.push({
              uid: v.uid,
              model: v.model,
              d: +d.toFixed(2),
              at: [Math.round(v.position.x), Math.round(v.position.z)],
              vDes: +(ai?.vDes ?? -1).toFixed(2),
              waiting: ai?.waiting ?? null,
              sig: sig ? sig.phase + ':' + sig.green : null,
              blocker: ai?.blocker ? ai.blocker.model || ai.blocker.kind || 'x' : null,
              blockerUid: ai?.blocker?.uid ?? null,
              waitT: +(ai?.waitT ?? 0).toFixed(1),
              rec: ai?.recoveries,
              totaled: v.totaled,
            });
          }
        }
        return res;
      },
      prev,
    );
    if (still.length) h.log('not moving', JSON.stringify(still));
    for (const s of still) {
      stuckSeen[s.uid] = (stuckSeen[s.uid] || 0) + 1;
      waitMax[s.uid] = Math.max(waitMax[s.uid] || 0, s.waitT);
    }
    prev = cur;
  }
  // a red light holds a car ≤ ~22 s; stuck = never moved across the samples and waited > 25 s
  const chronic = Object.entries(stuckSeen).filter(([uid, n]) => n >= 4 && (waitMax[uid] || 0) > 25);
  h.log('chronic', JSON.stringify(chronic), JSON.stringify(waitMax));
  h.assert(chronic.length === 0, `no car stuck for 25 s+ of game time (${chronic.length})`);
  h.assert(worstOverlap === 0, `no overlapping cars (worst ${worstOverlap})`);
  h.assert(worstOffRoad <= 1, `cars stay on the road (worst ${worstOffRoad})`);
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify({ calls: perf.calls, tris: perf.triangles, fps: perf.fps }));
}
