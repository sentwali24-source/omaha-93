// Fight balance probe: the player (J spam with soft lock-on) vs N rival fighters, logging both sides' HP.
import { waitGame } from './qa-firsthour-util.mjs';

async function brawl(h, n, role, capGame = 20) {
  const ids = await h.game((g, a) => {
    const p = g.player; p.health = p.maxHealth; p.stamina = 1;
    const rival = g.state.player.side === 'bloods' ? 'ngc' : 'lvb';
    return g.debugApi.spawnGang(rival, p.position.x + 3, p.position.z - 3, a.n, a.role);
  }, { n, role });
  const t0 = await h.game((g) => g.time.elapsed);
  let last = '';
  for (let k = 0; k < 4000; k++) {
    const s = await h.game((g, ids) => {
      const p = g.player;
      const foes = g.actors.filter((a) => ids.includes(a.id));
      const up = foes.filter((a) => a.state === 'active');
      let best = null, bd = 1e9;
      for (const a of up) { const d = Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z); if (d < bd) { bd = d; best = a; } }
      if (best) g.cameraRig.yaw = Math.atan2(-(best.position.x - p.position.x), -(best.position.z - p.position.z));
      return { t: +g.time.elapsed.toFixed(2), hp: Math.round(p.health), alive: p.alive, foes: foes.map((a) => Math.round(a.health)), up: up.length, d: +bd.toFixed(2), kos: g.state.stats.kos || 0 };
    }, ids);
    const line = JSON.stringify(s);
    if (k % 12 === 0 || !s.alive || !s.up) h.log(`${n}x${role}`, line);
    if (!s.alive || !s.up || s.t - t0 > capGame) { h.log(`RESULT ${n}x${role}: ${!s.alive ? 'PLAYER DOWN' : !s.up ? 'WON' : 'timeout'} after ${(s.t - t0).toFixed(1)} game s, hp ${s.hp}, foes ${JSON.stringify(s.foes)}`); break; }
    if (s.d > 1.3) { await h.down('KeyW'); await h.wait(200); await h.up('KeyW'); } else { await h.press('KeyJ'); await h.wait(120); }
    last = line;
  }
  // clean up
  await h.game((g, ids) => { for (const a of g.actors.filter((a) => ids.includes(a.id))) a.remove?.(); if (!g.player.alive) g.respawnPlayer?.('ko'); }, ids);
  await waitGame(h, 2);
}

export default async function (page, h) {
  await h.game((g) => { g.missions._pageIn = 9999; g.debugApi.teleport(40, -300); });
  await waitGame(h, 1);
  const spec = await h.game(() => new URLSearchParams(location.search).get('fights') || '1:fighter,1:hang,3:hang');
  for (const f of spec.split(',')) { const [n, role] = f.split(':'); await brawl(h, +n, role); }
}
