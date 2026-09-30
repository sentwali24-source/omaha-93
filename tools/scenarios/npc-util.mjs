// Shared helpers for the npc-* scenarios (not a scenario itself).

/** Wait until `seconds` of GAME time have passed (headless fps is low, dt is clamped). */
export async function waitGame(h, seconds, capMs = 60000) {
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  for (;;) {
    await h.wait(250);
    const t = await h.game((g) => g.time.elapsed);
    if (t - t0 >= seconds || Date.now() - start > capMs) return t - t0;
  }
}

/** Collect HUD subtitle / toast / pager lines printed by the stub HUD. */
export function collectDialog(page) {
  const lines = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[dialog]') || t.startsWith('[toast]') || t.startsWith('[pager]') || t.startsWith('[big]')) lines.push(t);
  });
  return lines;
}
