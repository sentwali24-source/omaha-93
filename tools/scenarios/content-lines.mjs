// Content check: capture the text of a few generated lines (rank-up to OG, dispatch from mid-block,
// a boost-mission brief) by wrapping the HUD, and make sure the grammar fixes hold at runtime.
export default async function (page, h) {
  await h.game((g) => {
    g.__lines = [];
    const hud = g.hud;
    const d = hud.dialog.bind(hud);
    hud.dialog = (s, t, o) => { g.__lines.push(`dialog ${s}: ${t}`); return d(s, t, o); };
    const b = hud.bigMessage.bind(hud);
    hud.bigMessage = (t, s, o) => { g.__lines.push(`big ${t} | ${s}`); return b(t, s, o); };
    const tt = hud.toast.bind(hud);
    hud.toast = (t, o) => { g.__lines.push(`toast ${t}`); return tt(t, o); };
  });
  await h.game((g) => g.debugApi.give(0, 4100));
  await h.wait(3000);
  // dispatch from the middle of a block (layout.describe returns "near ...")
  for (let i = 0; i < 12; i++) {
    const said = await h.game((g) => {
      g.time.elapsed += 10; // software GL: game time crawls, skip the subtitle throttle
      g.police._lastDispatch = -1e9;
      g.police._dispatch('assault', 100, -530);
      g.__near = g.layout.describe(100, -530).street;
      return g.__lines.some((l) => l.startsWith('dialog Dispatch'));
    });
    if (said) break;
    await h.wait(2500);
  }
  await h.wait(500);
  await h.shot('dispatch');
  const out = await h.game((g) => ({ near: g.__near, lines: g.__lines }));
  h.log('describe:', out.near);
  for (const l of out.lines) h.log(l);
  h.assert(!out.lines.some((l) => /near near| a OG|You're a OG/.test(l)), 'no near-near / a OG');
}
