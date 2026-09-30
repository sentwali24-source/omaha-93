// Count tag spots per turf zone after the protected-landmark filter.
export default async function (page, h) {
  const r = await h.game((g) => {
    const per = {};
    for (const s of g.tagging.spots) per[s.zoneId] = (per[s.zoneId] || 0) + 1;
    const prot = g.tagging.spots.filter((s) => { const l = g.layout.landmarkAt(s.x - (s.nx || 0), s.z - (s.nz || 0)); return l && ['omahastar', 'centralhigh', 'northhigh', 'jewell'].includes(l.id); }).length;
    return { total: g.tagging.spots.length, city: g.city.tagSpots.length, per, prot };
  });
  h.log(JSON.stringify(r));
  h.assert(r.prot === 0, 'protected walls still taggable');
}
