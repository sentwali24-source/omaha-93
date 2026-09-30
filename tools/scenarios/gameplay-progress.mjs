// Progression rewards table + rank-up flow (big message + pager from the OG).
//   node tools/smoke.mjs --port 5207 --no-server --out tools/out/gameplay-progress --script tools/scenarios/gameplay-progress.mjs
export default async function (page, h) {
  await h.game((g) => {
    g.missions._pageIn = 9999;
    window.__big = [];
    window.__pages = [];
    const hud = g.hud;
    const big = hud.bigMessage.bind(hud);
    hud.bigMessage = (t, s, o) => {
      window.__big.push(`${t} | ${s || ''}`);
      return big(t, s, o);
    };
    g.events.on('pager', (p) => window.__pages.push(`${p.from}: ${p.text}`));
  });
  const snap = () => h.game((g) => ({ rep: g.state.rep, cash: g.state.cash }));
  let a = await snap();

  // fight:won vs a rival in rival turf (x1.5): stand in LVB turf as PSC
  await h.game((g) => {
    const lvb = g.missions.pois('hood').find((p) => p.id === 'hood-lvb');
    g.debugApi.teleport(lvb.x, lvb.z);
    const fake = { id: 99901, kind: 'gang', faction: 'lvb', position: { x: lvb.x, z: lvb.z } };
    g.events.emit('fight:won', { target: fake });
    g.events.emit('actor:ko', { target: fake, attacker: g.player }); // same actor: no double pay
  });
  let b = await snap();
  h.log('fight in rival turf', b.rep - a.rep);
  h.assert(b.rep - a.rep === 15, 'fight:won in rival turf = +15 rep');

  // same-side KO pays nothing; civilian KO costs 5 rep
  a = b;
  await h.game((g) => {
    g.events.emit('fight:won', { target: { id: 99902, kind: 'gang', faction: 'ngc', position: { x: 0, z: 0 } } });
    g.events.emit('actor:ko', { target: { id: 99903, kind: 'ped', position: { x: 0, z: 0 } }, attacker: g.player });
  });
  b = await snap();
  h.log('ally + civilian', b.rep - a.rep);
  h.assert(b.rep - a.rep === -5, 'civilian KO = -5 rep, ally KO = 0');

  // sign in rival turf while wearing colors (+2, cooldown)
  a = b;
  await h.game((g) => {
    g.events.emit('player:sign', { setId: 'psc' });
    g.events.emit('player:sign', { setId: 'psc' });
  });
  b = await snap();
  h.assert(b.rep - a.rep === 2, 'sign in rival turf = +2 once (cooldown)');

  // turf:change to the player's set and away from it
  a = b;
  await h.game((g) => {
    g.state.turf.lake24.owner = 'psc';
    g.events.emit('turf:change', { zoneId: 'lake24', owner: 'psc', control: 10 });
  });
  b = await snap();
  h.assert(b.rep - a.rep === 100 && b.cash - a.cash === 50, 'turf taken = +100 rep +$50');
  await h.game((g) => {
    g.state.turf.kountze.owner = 'lvb';
    g.events.emit('turf:change', { zoneId: 'kountze', owner: 'lvb', control: 5 });
  });

  // rank up: big message + OG pager
  await h.game((g) => g.addRep(200, 'debug'));
  // queued messages + a delayed page run on game time (slow in headless): poll
  for (let i = 0; i < 150; i++) {
    const n = await h.game(() => window.__big.length + (window.__pages.length ? 10 : 0));
    if (n >= 13) break;
    await h.wait(500);
  }
  // shown or still waiting in the announcement queue
  const big = await h.game((g) => [...window.__big, ...g.missions._bigQ.map((b) => `${b.title} | ${b.sub}`)]);
  const pages = await h.game(() => window.__pages);
  h.log('big messages', JSON.stringify(big));
  h.log('pages', JSON.stringify(pages));
  h.assert(big.some((m) => m.startsWith('TURF TAKEN')), 'TURF TAKEN shown');
  h.assert(big.some((m) => m.startsWith('LOST KOUNTZE PARK')), 'LOST <zone> shown');
  h.assert(big.some((m) => m.startsWith('RANK UP')), 'RANK UP shown');
  h.assert(pages.some((p) => p.startsWith('Big Tone')), 'OG pages after rank up');
  const r = await h.game((g) => ({ rep: g.state.rep, rank: g.debugApi.state().rep }));
  h.log('final', JSON.stringify(r));
}
