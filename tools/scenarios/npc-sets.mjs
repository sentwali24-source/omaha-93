// NPC scenario: start a new game as every set (quitToTitle + menu.quickStart in one page) and
// check that the set's crew is posted up at its hood and greets the player there.
//   node tools/smoke.mjs --port 5214 --no-server --out tools/out/street-sets --params "autostart=1&side=crips&set=psc&debug=1&quality=low&hour=20" --script tools/scenarios/npc-sets.mjs
import { waitGame, collectDialog } from './npc-util.mjs';

const SETS = [
  ['crips', 'psc'],
  ['crips', 'ngc'],
  ['crips', 'rlc'],
  ['bloods', 'lvb'],
  ['bloods', 'nfp'],
  ['bloods', 'wbb'],
];

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  const only = process.env.NPC_SETS ? process.env.NPC_SETS.split(',') : null; // e.g. NPC_SETS=nfp,wbb
  for (const [side, setId] of SETS) {
    if (only && !only.includes(setId)) continue;
    const before = lines.length;
    await h.game(
      (g, a) => {
        g.quitToTitle();
        g.menu.quickStart({ side: a.side, setId: a.setId, name: 'Tester' });
        g.clock.hour = 20;
        g.missions._pageIn = 9999;
      },
      { side, setId },
    );
    await waitGame(h, 2.5, 90000);
    const info = await h.game((g) => {
      const p = g.player.position;
      const own = g.gangs.groups.filter((q) => q.rel === 'own');
      const near = own.map((q) => Math.round(Math.hypot(q.cx - p.x, q.cz - p.z))).sort((a, b) => a - b);
      // face the nearest own crew for the screenshot
      const q = own.sort((a, b) => Math.hypot(a.cx - p.x, a.cz - p.z) - Math.hypot(b.cx - p.x, b.cz - p.z))[0];
      if (q) {
        const hd = Math.atan2(-(q.cx - p.x), -(q.cz - p.z));
        g.cameraRig.yaw = hd + 0.35;
        g.cameraRig.pitch = 0.12;
        g.cameraRig.snap();
      }
      return { set: g.state.player.setId, where: g.layout.describe(p.x, p.z).street, crews: near, og: g.gangs.members.some((a) => a.brain.role === 'og' && a.faction === g.state.player.setId) };
    });
    // walk up to the crew so they greet
    await h.game((g) => {
      const p = g.player.position;
      const m = g.gangs.members.filter((a) => a.faction === g.state.player.setId && a.alive).sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
      if (m) g.debugApi.teleport(m.position.x + 1.6, m.position.z + 0.6);
    });
    await waitGame(h, 2.5, 90000);
    const greet = lines.slice(before).filter((l) => l.startsWith('[dialog]'));
    h.log(setId, JSON.stringify(info), 'lines:', greet.join(' | '));
    h.assert(info.crews.length && info.crews[0] < 30, `${setId}: own crew posted up near the hood spawn`);
    h.assert(info.og, `${setId}: the OG is at the hood`);
    h.assert(greet.some((l) => new RegExp(`\\((${setId.toUpperCase()})\\)`).test(l)), `${setId}: greeted by the set`);
    await h.shot(`hood-${setId}`).catch((e) => h.log('screenshot failed', e.message.split('\n')[0]));
  }
  const perf = await h.game((g) => g.debugApi.perf());
  h.log('perf', JSON.stringify({ calls: perf.calls, triangles: perf.triangles, counts: await h.game((g) => g.debugApi.counts()) }));
}
