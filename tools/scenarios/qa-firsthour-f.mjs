// First hour, part F: control tips queue behind the brief (car / fight / homies); walking works
// right after a bust (measured over game time, not real time).
import { until, waitGame } from './qa-firsthour-util.mjs';

async function walked(h, secs) {
  const p0 = await h.game((g) => [g.player.position.x, g.player.position.z, g.time.elapsed]);
  await h.down('KeyW');
  await waitGame(h, secs);
  await h.up('KeyW');
  const p1 = await h.game((g) => [g.player.position.x, g.player.position.z, g.time.elapsed]);
  return { m: +Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2), s: +(p1[2] - p0[2]).toFixed(2) };
}

export default async function (page, h) {
  await h.game((g) => { g.missions._pageIn = 9999; });
  for (const [id, want] of [['story3', /press F/], ['story4', /G tells them/], ['story6', /press J/]]) {
    const q = await h.game((g, id) => {
      g.missions.active && g.missions.abort();
      const st = g.state;
      for (const s of ['story1', 'story2', 'story3', 'story4', 'story5']) if (s < id && !st.missions.completed.includes(s)) st.missions.completed.push(s);
      if (st.rep < 300) g.debugApi.give(0, 300 - st.rep);
      g.missions._dialog.length = 0;
      const ok = g.debugApi.startMission(id);
      return { ok, queue: g.missions._dialog.map((l) => `${l.speaker}: ${l.text}`) };
    }, id);
    h.log(id, JSON.stringify(q));
    h.assert(q.ok && q.queue.some((l) => l.startsWith('TIP') && want.test(l)), `${id} queues its control tip after the brief`);
    await waitGame(h, 0.3);
  }
  // twice: the tip is once per save
  const again = await h.game((g) => { g.missions.abort(); g.missions._dialog.length = 0; g.missions._cooldowns = {}; g.debugApi.startMission('story6'); return g.missions._dialog.filter((l) => l.speaker === 'TIP').length; });
  h.log('tips on a repeat', again);
  h.assert(again === 0, 'tips show once');
  await h.game((g) => g.missions.abort());
  // bust, then walk
  await h.game((g) => { g.debugApi.teleport(40, -300); });
  await waitGame(h, 0.5);
  h.log('walk before bust', JSON.stringify(await walked(h, 1)));
  await h.game((g) => { g.debugApi.heat(1); const p = g.player.position; g.debugApi.spawnCop(p.x + 2, p.z + 1); });
  await until(h, (g) => g.police.busted, null, 15);
  await until(h, (g) => g.state.stats.busted > 0 && !g.player.down && g.player.state === 'active', null, 15);
  await waitGame(h, 0.5);
  const w = await walked(h, 1);
  h.log('walk after bust', JSON.stringify(w), JSON.stringify(await h.game((g) => ({ input: g.input.enabled, down: g.player.down, anim: g.player.character?.anim, stagger: g.player.stagger }))));
  h.assert(w.m > 2, 'player walks after a bust');
}
