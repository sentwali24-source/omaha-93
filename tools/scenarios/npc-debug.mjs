import { waitGame, collectDialog } from './npc-util.mjs';
export default async function (page, h) {
  const lines = collectDialog(page);
  const r = await h.game((g) => {
    const q = g.gangs.groups.find((x) => x.rel === 'own');
    const a = q.members.find((m) => m.brain.role !== 'og');
    g.debugApi.teleport(a.position.x + 1.4, a.position.z);
    for (const x of g.gangs.groups) x.greetCd = 0;
    return { id: q.id, cd: q.greetCd, player: g.state.player.name };
  });
  h.log(JSON.stringify(r));
  await waitGame(h, 4);
  const r2 = await h.game((g, id) => {
    const q = g.gangs.groups.find((x) => x.id === id);
    const p = g.player.position;
    return { cd: q.greetCd, nd: Math.min(...q.members.map((m) => m.position.distanceTo(p))), onFoot: !g.player.vehicle, st: g.player.state, mode: g.mode };
  }, r.id);
  h.log(JSON.stringify(r2), lines.join(' | '));
}
