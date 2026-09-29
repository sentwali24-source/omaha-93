// Mission markers seen from afar (day and night) and a tag wall at night.
//   node tools/smoke.mjs --port 5207 --no-server --out tools/out/gameplay-markers --script tools/scenarios/gameplay-markers.mjs
async function look(h, dist) {
  await h.game((g, dist) => {
    const mk = g.missions.active.markers[0];
    const a = Math.random() * 6.28;
    let x = mk.x + Math.cos(a) * dist;
    let z = mk.z + Math.sin(a) * dist;
    // stand on a road so buildings don't block the whole view
    const r = g.layout.nearestEdge(x, z);
    const n1 = g.layout.nodes[r.edge.a];
    const n2 = g.layout.nodes[r.edge.b];
    x = n1.x + (n2.x - n1.x) * r.t;
    z = n1.z + (n2.z - n1.z) * r.t;
    g.debugApi.teleport(x, z);
    const hd = Math.atan2(-(mk.x - x), -(mk.z - z));
    g.player.faceHeading(hd);
    g.cameraRig.yaw = hd;
    g.cameraRig.pitch = 0.05;
    g.cameraRig.snap();
  }, dist);
  await h.wait(900);
}

export default async function (page, h) {
  await h.game((g) => {
    g.missions._pageIn = 9999;
    g.debugApi.startMission('delivery');
  });
  await h.wait(500);
  await look(h, 25);
  await h.shot('40-marker-25m');
  await look(h, 140);
  await h.shot('41-marker-140m');
  await look(h, 320);
  await h.shot('42-marker-320m');
  await h.game((g) => g.debugApi.setHour(22.5));
  await h.wait(600);
  await look(h, 60);
  await h.shot('43-marker-night');
  await h.game((g) => {
    const s = g.tagging.spots.find((q) => q.owner === 'lvb');
    g.debugApi.teleport(s.x + s.nx * 5, s.z + s.nz * 5);
    g.cameraRig.yaw = Math.atan2(s.nx, s.nz);
    g.cameraRig.pitch = 0.1;
    g.cameraRig.snap();
  });
  await h.wait(700);
  await h.shot('44-tag-night');
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify({ calls: perf.calls, triangles: perf.triangles }));
}
