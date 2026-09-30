// Content check: dump the city sign atlas and the landmark sign atlas at source resolution,
// then take a few street-level shots of storefront signs and billboards.
import fs from 'node:fs';
import path from 'node:path';
export default async function (page, h) {
  const out = path.resolve(process.argv[process.argv.indexOf('--out') + 1]);
  const atlases = await h.game((g, crop0) => {
    const res = {};
    const c = g.city?.textures?.signs?.image;
    if (c?.toDataURL) res.city = c.toDataURL('image/png');
    const crop = crop0 && JSON.parse(crop0);
    if (c && crop) {
      const [x, y, w, hh, k] = crop;
      const o = document.createElement('canvas');
      o.width = w * k;
      o.height = hh * k;
      const ctx = o.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, x, y, w, hh, 0, 0, w * k, hh * k);
      res.crop = o.toDataURL('image/png');
    }
    return res;
  }, process.env.CS_CROP || null);
  for (const [k, v] of Object.entries(atlases)) fs.writeFileSync(path.join(out, `atlas-${k}.png`), Buffer.from(v.split(',')[1], 'base64'));
  const views = JSON.parse(process.env.CS_VIEWS || '[]');
  for (const v of views) {
    await h.game((g, v) => {
      g.debugApi.setHour(v.hour ?? 13);
      g.debugApi.teleport(v.player[0], v.player[1]);
      g.cameraRig.update = () => {};
      g.camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
      g.camera.lookAt(v.look[0], v.look[1], v.look[2]);
    }, v);
    await h.wait(v.wait || 2500);
    await h.shot(v.name);
  }
}
