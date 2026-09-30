export default async function (page, h) {
  const r = await h.game((g) => {
    const out = [];
    g.city.group.traverse((o) => {
      if (!o.name.startsWith('city:pool')) return;
      const p = o.geometry.attributes.position;
      let near = 0;
      const ys = new Set();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        if (Math.abs(x - 150) < 60 && Math.abs(z + 600) < 60) { near++; ys.add(p.getY(i).toFixed(3)); }
      }
      out.push({ name: o.name, count: p.count, near, ys: [...ys].slice(0, 5), vis: o.visible, ro: o.renderOrder, hasColor: !!o.geometry.attributes.color, uv: !!o.geometry.attributes.uv, mat: o.material.type, blending: o.material.blending, map: !!o.material.map });
    });
    return out;
  });
  h.log(JSON.stringify(r));
}
