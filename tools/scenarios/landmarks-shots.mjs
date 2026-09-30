// Landmarks visual check: freezes the camera rig and takes screenshots from fixed viewpoints.
// Views come from the LM_VIEWS env var (JSON array) or the default list below:
//   { name, pos: [x, y, z], look: [x, y, z], night: 0..1, far, fogNear, fogFar, wait }
// Night views also dim the (stub) environment lights so emissive windows can be judged.
const DEFAULT = [
  { name: 'downtown-day', pos: [250, 60, 260], look: [380, 30, 60] },
];

export default async function (page, h) {
  const views = process.env.LM_VIEWS ? JSON.parse(process.env.LM_VIEWS) : DEFAULT;
  const stats = await h.game((g) => g.debugApi.landmarks?.stats?.());
  h.log('landmark stats', JSON.stringify(stats));
  for (const v of views) {
    await h.game((g, v) => {
      const THREE = g.camera.constructor;
      g.cameraRig.update = () => {};
      if (v.player) g.debugApi.teleport(v.player[0], v.player[1]);
      g.camera.far = v.far || 3000;
      g.camera.fov = v.fov || 62;
      g.camera.updateProjectionMatrix();
      const fog = g.scene.fog;
      const night = v.night || 0;
      if (fog) {
        fog.near = v.fogNear ?? 300;
        fog.far = v.fogFar ?? 2600;
      }
      const env = g.environment;
      if (!env._lmSaved) env._lmSaved = { hemi: env.hemi?.intensity, sun: env.sun?.intensity, bg: g.scene.background?.clone?.(), fog: fog?.color?.clone?.() };
      const s = env._lmSaved;
      if (env.hemi) env.hemi.intensity = s.hemi * (1 - night * 0.88);
      if (env.sun) env.sun.intensity = s.sun * (1 - night * 0.95);
      if (g.scene.background && s.bg) g.scene.background.copy(s.bg).lerp(g.scene.background.clone().setRGB(0.02, 0.03, 0.07), night);
      if (fog && s.fog) fog.color.copy(s.fog).lerp(fog.color.clone().setRGB(0.03, 0.04, 0.08), night);
      g.debugApi.landmarks.night(night);
      env.night = night;
      // hide the stub City's placeholder boxes so only real geometry is judged
      for (const m of g.city.group.children) {
        if (m.name === 'landmarks' || !m.material?.color) continue;
        if (m.material.color.getHexString() === 'a49a8a') m.visible = !(v.hideStub ?? true);
      }
      g.camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
      g.camera.lookAt(v.look[0], v.look[1], v.look[2]);
      void THREE;
    }, v);
    await h.wait(v.wait || 1500);
    await h.shot(v.name);
    const perf = await h.game((g) => ({ calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }));
    h.log(v.name, JSON.stringify(perf));
  }
}
