// Render-cost breakdown (software GL): time renderer.render + a 1-pixel readback (forces the GPU
// work to finish) for the full scene and with parts hidden. Minimum of 3 runs, in ms.
export default async function (page, h) {
  await h.game((g) => { g.debugApi.teleport(150, -556); g.debugApi.setHour(Number(new URLSearchParams(location.search).get('hour')) || 19.5); });
  await h.wait(3000);
  const r = await h.game((g) => {
    const R = g.renderer;
    const gl = R.getContext();
    const px = new Uint8Array(4);
    const time = () => {
      let best = 1e9;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        R.render(g.scene, g.camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        best = Math.min(best, performance.now() - t0);
      }
      return +best.toFixed(1);
    };
    const kids = g.scene.children;
    const vis = kids.map((o) => o.visible);
    const only = (pred) => kids.forEach((o, i) => (o.visible = vis[i] && pred(o)));
    const res = {};
    res.full = time();
    only((o) => o !== g.environment.sky.mesh);
    res.noSky = time();
    only((o) => o === g.environment.sky.mesh);
    res.skyOnly = time();
    only((o) => o === g.city.group || o.isLight);
    res.cityOnly = time();
    only((o) => o !== g.city.group);
    res.noCity = time();
    // city parts: only the city group, one mesh category at a time
    only((o) => o === g.city.group || o.isLight);
    const cat = (m) => (m.name.startsWith('lm:') ? 'landmarks' : m.name.replace(/^city:/, '').replace(/:.*$/, ''));
    const meshes = [];
    g.city.group.traverse((m) => { if (m.isMesh || m.isLine || m.isInstancedMesh) meshes.push([m, m.visible]); });
    const cats = [...new Set(meshes.map(([m]) => cat(m)))];
    res.parts = {};
    for (const c of cats) {
      for (const [m, v] of meshes) m.visible = v && cat(m) === c;
      res.parts[c] = time();
    }
    for (const [m, v] of meshes) m.visible = v;
    kids.forEach((o, i) => (o.visible = vis[i]));
    const sh = R.shadowMap.enabled;
    R.shadowMap.enabled = false;
    res.noShadows = time();
    R.shadowMap.enabled = sh;
    res.size = [R.domElement.width, R.domElement.height];
    return res;
  });
  h.log('cost', JSON.stringify(r));
}
