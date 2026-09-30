// Diagnostic: does keyboard movement work right after New Game by clicks?
export default async function (page, h) {
  const tap = async (sel) => { await page.waitForSelector(sel, { timeout: 60000 }); await page.click(sel, { timeout: 60000 }); };
  await h.wait(1000);
  await tap('.m-item[data-key="new"]');
  await tap('.m-side-card[data-key="side-bloods"]');
  await tap('.m-set-card[data-key="set-lvb"]');
  await h.wait(800);
  await tap('.m-btn-go');
  await h.wait(2000);
  const s = () => h.game((g) => ({ ae: document.activeElement?.tagName + '.' + document.activeElement?.className, en: g.input.enabled, mv: { ...g.input.move }, down: [...g.input._down], held: [...g.input._held], pos: [+g.player.position.x.toFixed(2), +g.player.position.z.toFixed(2)], t: +g.time.elapsed.toFixed(2), paused: g.paused, mode: g.mode, locked: g.player.locked ?? g.player.frozen ?? null, ctl: g.player.controlsEnabled ?? null }));
  h.log('before', JSON.stringify(await s()));
  await h.down('KeyW');
  for (let i = 0; i < 6; i++) { await h.wait(400); h.log('W', JSON.stringify(await s())); }
  await h.up('KeyW');
  await page.mouse.click(640, 360);
  await h.wait(300);
  await h.down('KeyW');
  for (let i = 0; i < 4; i++) { await h.wait(400); h.log('W after click', JSON.stringify(await s())); }
  await h.up('KeyW');
}
