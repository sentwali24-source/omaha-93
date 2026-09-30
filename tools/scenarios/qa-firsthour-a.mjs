// First hour, part A: title (no autostart) → New Game by clicks → first minute of play with keys.
import { waitGame, collectDialog } from './npc-util.mjs';

export default async function (page, h) {
  const tap = async (sel) => { await page.waitForSelector(sel, { timeout: 60000 }); await page.click(sel, { timeout: 60000 }); };
  const lines = collectDialog(page);
  await lines.ready;
  await h.wait(1500);
  await h.shot('a01-title');
  await tap('.m-item[data-key="new"]');
  await h.wait(600);
  await h.shot('a02-side');
  await tap('.m-side-card[data-key="side-bloods"]');
  await h.wait(600);
  await h.shot('a03-set');
  await tap('.m-set-card[data-key="set-lvb"]');
  await h.wait(1200);
  await h.shot('a04-creator');
  await tap('.m-btn-go');
  await h.wait(2500);
  await h.shot('a05-first-frame');
  const st = await h.game((g) => ({ mode: g.mode, input: g.input.enabled, obj: g.hud.objective ?? null, pos: [g.player.position.x, g.player.position.z], hour: g.clock.hour, health: g.player.health, cash: g.state.cash, rep: g.state.rep, pageIn: g.missions._pageIn, where: g.layout.describe(g.player.position.x, g.player.position.z)?.zone?.name }));
  h.log('start', JSON.stringify(st));
  // walk forward with W + look around
  await h.hold('KeyW', 2500);
  await h.shot('a06-walk');
  await h.down('ShiftLeft'); await h.hold('KeyW', 2000); await h.up('ShiftLeft');
  await h.hold('KeyD', 800);
  await h.shot('a07-walk2');
  const st2 = await h.game((g) => ({ pos: [g.player.position.x, g.player.position.z], anim: g.player.state ?? null, prompt: g.hud.prompt }));
  h.log('after walk', JSON.stringify(st2));
  // wait for the pager
  await waitGame(h, 10, 120000);
  await h.shot('a08-pager');
  const st3 = await h.game((g) => ({ offer: g.missions.offer && { id: g.missions.offer.id, phone: g.missions.offer.phone && [g.missions.offer.phone.x, g.missions.offer.phone.z] }, pos: [g.player.position.x, g.player.position.z], markers: g.debugApi.hud?.().markers }));
  h.log('pager', JSON.stringify(st3));
  h.log('lines:\n  ' + lines.slice(0, 40).join('\n  '));
}
