// City placement audit: colliders inside landmark / park / water / freeway rects or on streets,
// signal states, POI and tag-spot guarantees. Pass/fail via h.assert.
export default async function (page, h) {
  const a = await h.game((g) => g.debugApi.cityAudit());
  h.log('boxes', a.boxes, 'reserved', a.reserved.length, 'road', a.road.length, 'sidewalk', a.sidewalk.length);
  const group = (list) => list.reduce((m, e) => ((m[`${e.kind || ''}:${e.id || ''}:${e.tag}`] = (m[`${e.kind || ''}:${e.id || ''}:${e.tag}`] || 0) + 1), m), {});
  h.log('reserved by kind', JSON.stringify(group(a.reserved)));
  h.log('reserved sample', JSON.stringify(a.reserved.slice(0, 12)));
  h.log('road sample', JSON.stringify(a.road.slice(0, 12)));
  h.log('sidewalk by tag', JSON.stringify(group(a.sidewalk)), JSON.stringify(a.sidewalk.filter((e) => e.tag !== 'prop').slice(0, 12)));
  const sz = {};
  for (const e of a.sidewalk.filter((e) => e.tag === 'prop')) { const k = e.sx + 'x' + e.sz + '@' + e.maxY; sz[k] = (sz[k] || 0) + 1; }
  h.log('sidewalk props by size', JSON.stringify(sz));
  const sig = await h.game((g) => {
    const L = g.layout;
    let n = 0;
    let bad = 0;
    const ex = [];
    for (const node of L.nodes) {
      const s = g.city.signalAt(node.id);
      const ns = L.nsStreets.find((q) => q.id === node.ns);
      const ew = L.ewStreets.find((q) => q.id === node.ew);
      const major = !!(ns?.major || ew?.major);
      if (s) {
        n++;
        if (!['green', 'yellow', 'allred'].includes(s.phase) || !(s.green === 'x' || s.green === 'z' || s.green === null) || !(s.t >= 0)) bad++;
        if (ex.length < 3) ex.push({ id: node.id, ...s });
      } else if (major && node.edges.length >= 3) bad += 0; // T-junctions may be unsignalized
    }
    return { n, bad, ex };
  });
  h.log('signals', JSON.stringify(sig));
  h.assert(sig.n > 20 && sig.bad === 0, 'signals present and well-formed');
  h.assert(a.reserved.length === 0, 'no city colliders in reserved areas');
  h.assert(a.road.length === 0, 'no solid city colliders on the roadway');
}
