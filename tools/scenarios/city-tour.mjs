// World visual tour: player-camera views at key places and hours (+ an overview with a free
// camera). CITY_TOUR env (comma list of names) limits the stops. Screenshots get a long timeout
// (software WebGL on a loaded machine).
import path from 'node:path';

const STOPS = [
  // name, x, z, hour, yaw, pitch, weather
  ['24th-lake-1930', 150, -556, 19.5, 0, 0.1],
  ['24th-lake-2200', 150, -556, 22, 0, 0.1],
  ['24th-south-dusk', 146, -600, 20.3, Math.PI, 0.08],
  ['downtown-noon', 370, 115, 12.5, 0, 0.15],
  ['oldmarket', 515, 232, 16, Math.PI / 2, 0.12],
  ['kountze-house', 200, -690, 18.8, Math.PI * 0.6, 0.1],
  ['24th-south-night', 146, -600, 22.5, Math.PI, 0.08],
  ['rain', 146, -600, 15, Math.PI, 0.08, 'rain'],
  ['storm-night', 146, -600, 23, Math.PI, 0.08, 'thunderstorm'],
];

export default async function (page, h) {
  const outDir = path.dirname(process.argv[process.argv.indexOf('--out') + 1] ? path.resolve(process.argv[process.argv.indexOf('--out') + 1], 'x') : 'x');
  const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`), timeout: 120000 }).catch((e) => h.log('shot failed', name, e.message.slice(0, 80)));
  const only = process.env.CITY_TOUR ? process.env.CITY_TOUR.split(',') : null;
  for (const [name, x, z, hour, yaw, pitch, weather] of STOPS) {
    if (only && !only.includes(name)) continue;
    await h.game((g, a) => {
      g.debugApi.teleport(a.x, a.z);
      g.debugApi.setHour(a.hour);
      g.debugApi.weather?.(a.weather || 'clear');
      if (a.weather === 'thunderstorm') setTimeout(() => g.debugApi.lightning?.(300), 2600);
      if (g.cameraRig) {
        g.cameraRig.yaw = a.yaw;
        g.cameraRig.pitch = a.pitch;
        g.cameraRig.snap?.();
      }
    }, { x, z, hour, yaw, pitch, weather });
    await h.wait(3000);
    await shot(name);
    const info = await h.game((g) => ({ where: g.layout.describe(g.player.position.x, g.player.position.z).street, calls: g.perf.calls, tris: g.perf.triangles, night: +g.environment.night.toFixed(2) }));
    h.log(name, JSON.stringify(info));
  }
  if (!only || only.includes('overview')) {
    await h.game((g) => {
      g.debugApi.weather?.('clear');
      g.debugApi.setHour(17.5);
      g.cameraRig.update = () => {};
      g.camera.position.set(60, 260, -900);
      g.camera.lookAt(300, 0, -150);
    });
    await h.wait(2500);
    await shot('overview');
  }
}
