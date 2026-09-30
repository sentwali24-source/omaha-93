// Traffic at signalized intersections, using the real City's signalAt (the stub City had no signals;
// then this scenario overrides g.city.signalAt with the documented cycle (14 s green, 3 s yellow, 1 s all-red per axis) on every
// node that involves a major street, then counts cars that enter an intersection box on red.
//   node tools/smoke.mjs --port 5205 --no-server --out tools/out/vehicles-signals --script tools/scenarios/vehicles-signals.mjs
export default async function (page, h) {
  const gwait = async (sec, maxMs = 90000) => {
    const t0 = await h.game((g) => g.time.elapsed);
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      await h.wait(200);
      if ((await h.game((g) => g.time.elapsed)) - t0 >= sec) return;
    }
  };
  await h.wait(1200);
  const node = await h.game((g) => {
    const L = g.layout;
    const major = new Set([...L.nsStreets, ...L.ewStreets].filter((s) => s.major).map((s) => s.id));
    const n0 = L.nodes.find((q) => q.ns === '24th' && q.ew === 'lake');
    const real = !!g.city.signalAt(n0.id);
    if (!real) g.city.signalAt = (id) => {
      const n = L.nodes[id];
      if (!major.has(n.ns) && !major.has(n.ew)) return null;
      const t = (g.time.elapsed + id * 7.3) % 36;
      if (t < 14) return { green: 'x', phase: 'green', t };
      if (t < 17) return { green: 'x', phase: 'yellow', t: t - 14 };
      if (t < 18) return { green: null, phase: 'allred', t: t - 17 };
      if (t < 32) return { green: 'z', phase: 'green', t: t - 18 };
      if (t < 35) return { green: 'z', phase: 'yellow', t: t - 32 };
      return { green: null, phase: 'allred', t: t - 35 };
    };
    // watch every box entry
    g.__sig = { entries: 0, onRed: [], log: [] };
    const seen = new Map();
    g.city.addUpdater(() => {
      for (const v of g.traffic.cars) {
        const ai = v.ai;
        if (!ai || ai.mode !== 'cruise') continue;
        for (const c of ai.claims) {
          const was = seen.get(c) || false;
          if (c.inBox && !was) {
            const s = g.city.signalAt(c.node);
            g.__sig.entries++;
            if (s && (s.green !== c.axis || s.phase === 'allred')) g.__sig.onRed.push({ uid: v.uid, node: c.node, axis: c.axis, turn: c.turn, phase: s.phase, green: s.green, t: +s.t.toFixed(2), speed: +v.speed.toFixed(1), vDes: +(ai.vDes ?? -1).toFixed(1), shift: ai.shift, rec: +ai.recoverT.toFixed(2), waitT: +ai.waitT.toFixed(1), blockT: +ai.blockT.toFixed(1), waiting: ai.waiting, prevDist: +(c._pd ?? -1).toFixed(2), claimAge: +(g.time.elapsed - c.t).toFixed(1), steer: +v.controls.steer.toFixed(2), thr: +v.controls.throttle.toFixed(2), brk: +v.controls.brake.toFixed(2) });
          }
          seen.set(c, c.inBox);
          c._pd = c.dist;
        }
      }
    });
    // neutral clothes so the Lakeview Bloods on the corner leave the observer alone
    g.state.wearingColors = false;
    g.player.applyLook();
    // camera over 24th & Lake (major × major), player parked on the corner
    const n = L.nodes.find((q) => q.ns === '24th' && q.ew === 'lake');
    g.debugApi.teleport(n.x + 14, n.z + 14);
    g.traffic._nearEdgesAt.x = 1e9; // re-sample spawn edges around the new focus
    g.traffic.onPlayerRespawn();
    g.debugApi.freeCam({ x: n.x + 26, y: 30, z: n.z + 34 }, { x: n.x, y: 0, z: n.z });
    return { id: n.id, x: n.x, z: n.z, real };
  });
  h.log('node', JSON.stringify(node));
  for (let i = 0; i < (process.env.SIG_N ? +process.env.SIG_N : 6); i++) {
    await gwait(6);
    const st = await h.game(
      (g, id) => {
        const n = g.layout.nodes[id];
        const s = g.city.signalAt(id);
        const q = { x: 0, z: 0 };
        for (const v of g.traffic.cars) if (v.ai?.waiting === id) q[Math.abs(Math.sin(v.heading)) > 0.7 ? 'x' : 'z']++;
        return { sig: s, waiting: q, entries: g.__sig.entries, red: g.__sig.onRed.length, rep: g.debugApi.trafficReport() };
      },
      node.id,
    );
    h.log(`t${i}`, JSON.stringify({ sig: st.sig, waiting: st.waiting, entries: st.entries, red: st.red, cars: st.rep.cars, overlaps: st.rep.overlaps, stuck: st.rep.stuck.length }));
    await h.shot(`4${i}-signal`);
  }
  const res = await h.game((g) => g.__sig);
  h.log('on red', JSON.stringify(res.onRed.slice(0, 10)));
  h.assert(res.entries > 5, `cars crossed intersections (${res.entries})`);
  h.assert(res.onRed.length <= Math.max(1, res.entries * 0.03), `cars stop on red (${res.onRed.length} of ${res.entries} entries on red)`);
}
