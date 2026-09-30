// First hour, part B: pager → payphone → story1 (OG) → story2 (tag) with real keys; teleports only skip long walks.
import { collectDialog } from './npc-util.mjs';
import { until, walkTo, holdKey, newGameByClicks, snap, waitGame } from './qa-firsthour-util.mjs';

async function answerPhone(h, lines) {
  const offer = await until(h, (g) => g.missions.offer && { id: g.missions.offer.id, x: g.missions.offer.phone.x, z: g.missions.offer.phone.z, heading: g.missions.offer.phone.heading }, null, 20);
  h.log('offer', JSON.stringify(offer));
  if (!offer) return null;
  // skip the walk: drop the player 7 m away along the sidewalk-facing direction, then walk up
  await h.game((g, o) => { const fx = -Math.sin(o.heading), fz = -Math.cos(o.heading); g.debugApi.teleport(o.x - fx * 1.5 + 5, o.z - fz * 1.5 + 3); }, offer);
  await waitGame(h, 0.3);
  const d = await walkTo(h, offer.x, offer.z, 1.6, 10);
  const pr = await until(h, (g) => g.hud.prompt, null, 2);
  h.log('at phone dist', d.toFixed(2), 'prompt', pr);
  await h.shot(`b-phone-${offer.id}`);
  await holdKey(h, 'KeyE', 0.5);
  const act = await until(h, (g) => g.missions.active?.id, null, 3);
  h.log('active after phone', act, JSON.stringify(await snap(h)));
  return act;
}

export default async function (page, h) {
  const lines = collectDialog(page);
  await lines.ready;
  await h.wait(800);
  await newGameByClicks(page, h, 'crips', 'psc');
  h.log('start', JSON.stringify(await snap(h)));
  await answerPhone(h, lines);
  // story1: walk to the OG
  const og = await h.game((g) => { const o = g.missions.active?.data?.og; return o && { x: o.position.x, z: o.position.z, alive: o.alive }; });
  h.log('og', JSON.stringify(og));
  if (og) {
    await h.game((g, o) => g.debugApi.teleport(o.x + 6, o.z + 4), og);
    await waitGame(h, 0.3);
    await h.shot('b-og-approach');
    const d = await walkTo(h, og.x, og.z, 1.8, 10);
    const pr = await until(h, (g) => g.hud.prompt, null, 2);
    h.log('at og dist', d.toFixed(2), 'prompt', pr, 'obj', await h.game((g) => g.missions.active?.objective));
    await holdKey(h, 'KeyE', 0.5);
    await waitGame(h, 1);
    h.log('after og', JSON.stringify(await snap(h)));
    await h.shot('b-og-done');
  }
  // next page quickly
  await h.game((g) => { g.missions._pageIn = 1; });
  const act2 = await answerPhone(h, lines);
  if (act2 === 'story2') {
    for (let i = 0; i < 3; i++) {
      const next = await h.game((g) => { const m = g.missions.active; if (m?.id !== 'story2') return null; const id = [...m.data.targets][0]; const s = g.tagging.spotById(id); const st = g.tagging.standPoint(s); return { id, sx: s.x, sz: s.z, x: st.x, z: st.z }; });
      h.log('wall', JSON.stringify(next));
      if (!next) break;
      await h.game((g, n) => g.debugApi.teleport(n.x + (n.x - n.sx) * 3, n.z + (n.z - n.sz) * 3), next);
      await waitGame(h, 0.3);
      const d = await walkTo(h, next.x, next.z, 0.7, 8);
      // face the wall like a player would
      await h.game((g, n) => { g.cameraRig.yaw = Math.atan2(-(n.sx - g.player.position.x), -(n.sz - g.player.position.z)); }, next);
      await waitGame(h, 0.3);
      const pr = await until(h, (g) => g.hud.prompt, null, 2);
      h.log('at wall dist', d.toFixed(2), 'prompt', pr);
      await h.down('KeyE');
      const ok = await until(h, (g, id) => g.tagging.ownerOf(id) === g.state.player.setId, next.id, 8);
      if (i === 0) await h.shot('b-tagging');
      await h.up('KeyE');
      h.log('tagged', ok, JSON.stringify(await snap(h)));
      await waitGame(h, 0.5);
    }
    await h.shot('b-story2-end');
  }
  h.log('end', JSON.stringify(await snap(h)));
  h.log('lines:\n  ' + lines.slice(0, 60).join('\n  '));
}
