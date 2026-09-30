// Debug: rain streak visibility + light pools at night.
import path from 'node:path';
export default async function (page, h) {
  const out = path.resolve(process.argv[process.argv.indexOf('--out') + 1]);
  const shot = (n) => page.screenshot({ path: path.join(out, `${n}.png`), timeout: 120000 }).catch((e) => h.log('shot failed', e.message.slice(0, 60)));
  await h.game((g) => {
    g.debugApi.teleport(146, -600);
    g.debugApi.setHour(23);
    g.debugApi.weather('thunderstorm');
    g.cameraRig.yaw = 0;
    g.cameraRig.pitch = 0.05;
    g.cameraRig.snap();
  });
  await h.wait(2500);
  const info = await h.game((g) => {
    const e = g.debugApi.env();
    const rf = g.environment.rainFx;
    const pools = [];
    g.city.group.traverse((o) => { if (o.name === 'city:pool') pools.push({ vis: o.visible, n: o.geometry.attributes.position.count }); });
    return { drops: e.rainDrops, streakVis: rf.streaks.visible, op: rf.uniforms.uOpacity.value, color: rf.uniforms.uColor.value.toArray(), center: rf.uniforms.uCenter.value.toArray(), cam: g.camera.position.toArray(), poolMat: { op: g.city.poolMat.opacity, vis: g.city.poolMat.visible }, pools };
  });
  h.log(JSON.stringify(info));
  await shot('rain-normal');
  await h.game((g) => { const u = g.environment.rainFx.uniforms; u.uWidth.value = 0.03; g.environment.rainFx.update = () => {}; u.uOpacity.value = 1; });
  await h.wait(1500);
  await shot('rain-thick');
}
