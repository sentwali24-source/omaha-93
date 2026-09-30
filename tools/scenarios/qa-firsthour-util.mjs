// Shared helpers for the qa-firsthour-* scenarios (not a scenario itself).
import { waitGame } from './npc-util.mjs';
export { waitGame };

/** Poll until fn is truthy or `gameSecs` of game time pass. */
export async function until(h, fn, arg, gameSecs = 6, capMs = 120000) {
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  for (;;) {
    const v = await h.game(fn, arg);
    if (v) return v;
    const t = await h.game((g) => g.time.elapsed);
    if (t - t0 > gameSecs || Date.now() - start > capMs) return v;
    await h.wait(300);
  }
}

/** Walk (real W key, camera turned toward the target like a mouse would) until within `stop` m. */
export async function walkTo(h, tx, tz, stop = 1.5, gameSecs = 12, sprint = false) {
  const aim = () => h.game((g, a) => {
    const p = g.player.vehicle ? g.player.vehicle.position : g.player.position;
    const dx = a.tx - p.x, dz = a.tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > a.stop) { g.cameraRig.yaw = Math.atan2(-dx, -dz); g.cameraRig.pitch = 0.15; }
    return d;
  }, { tx, tz, stop });
  let d = await aim();
  if (d <= stop) return d;
  if (sprint) await h.down('ShiftLeft');
  await h.down('KeyW');
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  for (;;) {
    await h.wait(250);
    d = await aim();
    const t = await h.game((g) => g.time.elapsed);
    if (d <= stop || t - t0 > gameSecs || Date.now() - start > 150000) break;
  }
  await h.up('KeyW');
  if (sprint) await h.up('ShiftLeft');
  return d;
}

export async function holdKey(h, code, gameSecs) {
  await h.down(code);
  await waitGame(h, gameSecs, 90000);
  await h.up(code);
}

/** Click through title → New Game → side → set → creator → Hit the block. */
export async function newGameByClicks(page, h, side = 'crips', set = 'psc') {
  const tap = async (sel) => { await page.waitForSelector(sel, { timeout: 60000 }); await page.click(sel, { timeout: 60000 }); };
  await tap('.m-item[data-key="new"]');
  await tap(`.m-side-card[data-key="side-${side}"]`);
  await tap(`.m-set-card[data-key="set-${set}"]`);
  await h.wait(800);
  await tap('.m-btn-go');
  await h.wait(1500);
}

export const snap = (h) => h.game((g) => ({
  t: +g.time.elapsed.toFixed(1),
  pos: g.player && [+g.player.position.x.toFixed(1), +g.player.position.z.toFixed(1)],
  hp: g.player?.health, cash: g.state?.cash, rep: g.state?.rep, heat: g.police?.heat,
  active: g.missions.active && { id: g.missions.active.id, stage: g.missions.active.stage, obj: g.missions.active.objective, timer: g.missions.active.timer && Math.round(g.missions.active.timer) },
  offer: g.missions.offer?.id || null, prompt: g.hud.prompt || null, input: g.input.enabled, paused: g.paused,
  done: g.state?.missions?.completed,
}));
