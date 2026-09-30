// Night street views with a free camera: streetlight pools, lit windows, signs, signals.
import path from 'node:path';
const VIEWS = [
  { name: 'night-24th-high', hour: 23, pos: [135, 22, -660], look: [152, 0, -590] },
  { name: 'night-24th-street', hour: 22.3, pos: [144, 2.2, -680], look: [152, 3, -560] },
  { name: 'dusk-24th-street', hour: 20.6, pos: [144, 2.2, -680], look: [152, 3, -560] },
];
export default async function (page, h) {
  const out = path.resolve(process.argv[process.argv.indexOf('--out') + 1]);
  const shot = (n) => page.screenshot({ path: path.join(out, `${n}.png`), timeout: 120000 }).catch((e) => h.log('shot failed', e.message.slice(0, 60)));
  const only = process.env.VIEWS ? process.env.VIEWS.split(',') : null;
  if (process.env.VIEWS_JSON) VIEWS.splice(0, VIEWS.length, ...JSON.parse(process.env.VIEWS_JSON));
  await h.game((g) => {
    g.cameraRig.update = () => {};
    g.debugApi.weather('clear');
  });
  for (const v of VIEWS) {
    if (only && !only.includes(v.name)) continue;
    await h.game((g, v) => {
      g.debugApi.teleport(v.look[0] + 3, v.look[2]);
      g.debugApi.setHour(v.hour);
      g.camera.position.set(...v.pos);
      g.camera.lookAt(...v.look);
    }, v);
    await h.wait(2500);
    await shot(v.name);
    h.log(v.name, JSON.stringify(await h.game((g) => ({ night: g.environment.night, exp: g.renderer.toneMappingExposure, calls: g.perf.calls }))));
  }
}
