// Switch to a quality level after boot (default medium), then shoot the Kountze spawn and the
// skyline from North Omaha with long screenshot timeouts (the smoke tool's own first shot can
// time out on a loaded machine at higher quality).
import { shot } from './landmarks-tour.mjs';

export default async function (page, h) {
  const q = process.env.LM_QUALITY || 'medium';
  await h.game((g, q) => g.applySettings({ quality: q }), q);
  await h.wait(2500);
  await shot(page, h, `quality-${q}-spawn`);
  const a = await h.game((g) => ({ q: g.settings.quality, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, shadows: g.renderer.shadowMap.enabled }));
  h.log('spawn', JSON.stringify(a));
  await h.game((g) => {
    g.debugApi.teleport(200, -300);
    g.debugApi.setHour(20.2);
    g.cameraRig.update = () => {};
    g.camera.position.set(196, 11, -318);
    g.camera.lookAt(380, 42, 60);
  });
  await h.wait(2500);
  await shot(page, h, `quality-${q}-skyline`);
  h.log('skyline', JSON.stringify(await h.game((g) => ({ calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }))));
}
