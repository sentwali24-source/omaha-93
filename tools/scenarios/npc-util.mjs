// Shared helpers for the npc-* scenarios (not a scenario itself).

/** Wait until `seconds` of GAME time have passed (headless fps is low, dt is clamped). */
export async function waitGame(h, seconds, capMs = 120000) {
  const t0 = await h.game((g) => g.time.elapsed);
  const start = Date.now();
  for (;;) {
    await h.wait(250);
    const t = await h.game((g) => g.time.elapsed);
    if (t - t0 >= seconds || Date.now() - start > capMs) return t - t0;
  }
}

/**
 * Collect HUD subtitle / toast / pager / big-message lines. The real HUD renders to the DOM only,
 * so this wraps its methods to also print '[dialog] speaker: text' etc. on the console.
 */
export function collectDialog(page) {
  const lines = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[dialog]') || t.startsWith('[toast]') || t.startsWith('[pager]') || t.startsWith('[big]')) lines.push(t);
  });
  lines.ready = page.evaluate(() => {
    const hud = window.__game?.hud;
    if (!hud || hud.__spied) return;
    hud.__spied = true;
    const wrap = (name, fmt) => {
      const orig = hud[name].bind(hud);
      hud[name] = (...a) => {
        try {
          console.log(fmt(...a));
        } catch {
          /* ignore */
        }
        return orig(...a);
      };
    };
    wrap('dialog', (s, t) => `[dialog] ${s}: ${t}`);
    wrap('toast', (t) => `[toast] ${t}`);
    wrap('pager', (f, t) => `[pager] ${f}: ${t}`);
    wrap('bigMessage', (t, s) => `[big] ${t}${s ? ' — ' + s : ''}`);
    wrap('setObjective', (t) => `[toast] objective: ${t}`);
  });
  return lines;
}
