export default async function (page, h) {
  const r = await h.game((g) => {
    const C = g.city._ctx;
    const bl = g.layout.blocks.filter((b) => b.district === 'riverfront' || (b.x1 > 575 && b.x0 < 700)).map((b) => ({ id: b.id, d: b.district, x: [b.x0, b.x1], z: [b.z0, b.z1], lm: b.landmark, park: b.park, water: b.water, paved: C.blockPaved.get(b.id), zone: g.layout.zoneAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)?.id }));
    const stores = g.city.pois.filter((p) => p.name.includes('Bait'));
    return { riverStore: C.riverStore, bl, stores };
  });
  h.log(JSON.stringify(r));
}
