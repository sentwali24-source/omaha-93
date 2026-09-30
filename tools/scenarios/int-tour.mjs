// Integration tour: teleport around and screenshot key places at different times.
export default async function (page, h) {
  const stops = [
    ['24th-lake-dusk', 150, -560, 19.8, 0],
    ['24th-lake-night', 150, -560, 22.5, 0],
    ['downtown-noon', 370, 115, 12.5, 0],
    ['oldmarket', 515, 232, 16, Math.PI / 2],
    ['skyline-from-north', 200, -300, 20.2, Math.PI * 0.85],
    ['river', 690, 80, 18.5, -Math.PI / 2],
    ['30th-hilltop', -40, -520, 14, 0],
  ];
  for (const [name, x, z, hour, yaw] of stops) {
    await h.game((g, a) => {
      g.debugApi.teleport(a.x, a.z);
      g.debugApi.setHour(a.hour);
      if (g.cameraRig) { g.cameraRig.yaw = a.yaw; g.cameraRig.pitch = 0.15; g.cameraRig.snap?.(); }
    }, { x, z, hour, yaw });
    await h.wait(3500);
    await h.shot(name);
    const info = await h.game((g) => ({ where: g.layout.describe(g.player.position.x, g.player.position.z).street, perf: g.perf.calls + ' calls ' + g.perf.triangles + ' tris', actors: g.actors.length, veh: g.vehicles.length }));
    h.log(name, JSON.stringify(info));
  }
  // drive test
  await h.game((g) => { g.debugApi.teleport(140 + 5, -300); g.debugApi.setHour(13); });
  await h.wait(1500);
  const near = await h.game((g) => { const p = g.player.position; const v = g.vehiclesNear(p.x, p.z, 60).filter((v) => !v.driver)[0]; if (v) { g.debugApi.teleport(v.position.x + 2.5, v.position.z); } return !!v; });
  await h.wait(800);
  await h.press('KeyF');
  await h.wait(1500);
  await h.hold('KeyW', 4000);
  await h.shot('driving');
  const d = await h.game((g) => ({ inCar: !!g.player.vehicle, speed: g.player.vehicle?.speed, model: g.player.vehicle?.model }));
  h.log('drive', JSON.stringify({ near, ...d }));
}
