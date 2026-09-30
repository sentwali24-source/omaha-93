// City visual check: free camera views (the camera rig is frozen for the shots), day / dusk /
// night lighting faked on the stub Environment. Views come from CITY_VIEWS env (JSON) or defaults.
const DEFAULT_VIEWS = [
  { name: 'overview', pos: [150, 420, 250], look: [100, 0, -500], light: 'day' },
  { name: '24th-lake-street', pos: [132, 2.2, -540], look: [150, 3, -600], light: 'day' },
];

function lightScript(g, mode) {
  const env = g.environment;
  const scene = g.scene;
  const set = (bg, hemi, sun, fogN, fogF, night) => {
    scene.background?.set?.(bg);
    if (scene.fog) {
      scene.fog.color.set(bg);
      scene.fog.near = fogN;
      scene.fog.far = fogF;
    }
    if (env.hemi) env.hemi.intensity = hemi;
    if (env.sun) env.sun.intensity = sun;
    g.city.setNight(night);
  };
  if (mode === 'day') set('#9cc3e6', 1.4, 2.0, g.quality.fogNear, g.quality.fogFar, 0);
  else if (mode === 'dusk') set('#6a5a78', 0.55, 0.5, 60, 480, 0.55);
  else set('#0c1020', 0.12, 0.02, 40, 420, 1);
}

export default async function (page, h) {
  const views = process.env.CITY_VIEWS ? JSON.parse(process.env.CITY_VIEWS) : DEFAULT_VIEWS;
  const info = await h.game((g) => ({ stats: g.city.stats, pois: g.city.pois.length, tags: g.city.tagSpots.length, parking: g.city.parkingSpots.length }));
  h.log('city', JSON.stringify(info));
  await h.game((g) => {
    g.cameraRig.update = () => {};
  });
  for (const v of views) {
    await h.game((g, v) => {
      const env = g.environment;
      const scene = g.scene;
      const set = (bg, hemi, sun, fogN, fogF, night) => {
        scene.background?.set?.(bg);
        if (scene.fog) {
          scene.fog.color.set(bg);
          scene.fog.near = fogN;
          scene.fog.far = fogF;
        }
        if (env.hemi) env.hemi.intensity = hemi;
        if (env.sun) env.sun.intensity = sun;
        g.city.setNight(night);
      };
      const m = v.light || 'day';
      if (m === 'day') set('#9cc3e6', 1.4, 2.0, v.fogNear ?? g.quality.fogNear, v.fogFar ?? g.quality.fogFar, 0);
      else if (m === 'dusk') set('#7a6a88', 0.6, 0.6, 60, 480, 0.5);
      else set('#0c1020', 0.14, 0.03, 40, 420, 1);
      if (v.player) g.debugApi.teleport(v.player[0], v.player[1]);
      g.camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
      g.camera.lookAt(v.look[0], v.look[1], v.look[2]);
      if (v.fov) {
        g.camera.fov = v.fov;
        g.camera.updateProjectionMatrix();
      }
    }, v);
    await h.wait(v.wait || 2500);
    await h.shot(v.name);
    const perf = await h.game((g) => ({ calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }));
    h.log(v.name, JSON.stringify(perf));
  }
  void lightScript;
}
