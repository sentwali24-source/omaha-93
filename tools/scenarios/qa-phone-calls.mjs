// Draw-call breakdown by scene child at 24th & Lake (phone landscape, low). Run with --mobile.
import { gameWait } from './qa-phone-util.mjs';
export default async function (page, h) {
  await page.setViewportSize({ width: 844, height: 390 });
  await h.game((g) => { g.debugApi.teleport(150, -560); g.debugApi.setHour(21.5); g.cameraRig.yaw = Math.PI; });
  await gameWait(page, 3, 90000);
  const r = await h.game((g) => {
    const R = g.renderer, S = g.scene, C = g.camera;
    const draw = () => { R.info.reset(); const a = R.info.autoReset; R.info.autoReset = false; R.render(S, C); R.info.autoReset = a; return { calls: R.info.render.calls, tris: R.info.render.triangles }; };
    const all = draw();
    const out = [];
    for (const ch of S.children) {
      if (!ch.visible) continue;
      ch.visible = false;
      const d = draw();
      ch.visible = true;
      let meshes = 0;
      ch.traverse((o) => { if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) meshes++; });
      out.push({ name: ch.name || ch.type, calls: all.calls - d.calls, tris: all.tris - d.tris, meshes });
    }
    return { all, parts: out.filter((q) => q.calls > 2).sort((a, b) => b.calls - a.calls).slice(0, 14) };
  });
  h.log('breakdown', JSON.stringify(r));
}
