// Shared helpers for player-* scenarios (not a scenario itself).
// Game time runs slower than real time when the machine is loaded, so wait on game time.
export async function waitGame(h, sec, maxReal = 60000) {
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  for (;;) {
    await h.wait(120);
    const t = await h.game((g) => g.time.elapsed);
    if (t - t0 >= sec || Date.now() - start > maxReal) return t - t0;
  }
}

/** Poll fn(g) (serializable) until it returns truthy or game time runs out. */
export async function waitUntil(h, fn, arg, sec = 10, maxReal = 90000) {
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  for (;;) {
    const v = await h.game(fn, arg);
    if (v) return v;
    const t = await h.game((g) => g.time.elapsed);
    if (t - t0 >= sec || Date.now() - start > maxReal) return null;
    await h.wait(80);
  }
}

export const P = (h) => h.game((g) => g.debugApi.player());
