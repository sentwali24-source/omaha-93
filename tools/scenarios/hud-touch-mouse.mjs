// Desktop with ?touch=1: the mouse acts as a finger on the touch controls.
export default async function (page, h) {
  await h.wait(2000);
  const st = await h.game((g) => ({ active: g.touch.active, visible: g.touch.visible }));
  h.assert(st.visible, 'touch UI visible with touch=1');
  const p0 = await h.game((g) => ({ x: g.player.position.x, z: g.player.position.z }));
  await page.mouse.move(120, 560);
  await page.mouse.down();
  await page.mouse.move(120, 480, { steps: 5 });
  await h.wait(1500);
  await h.shot('80-touch-mouse');
  await page.mouse.up();
  const p1 = await h.game((g) => ({ x: g.player.position.x, z: g.player.position.z }));
  h.assert(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, 'mouse-driven stick moves the player');
  // PUNCH via mouse
  const r = await h.game(() => { const b = document.querySelector('.tb-punch').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.move(r[0], r[1]);
  await page.mouse.down();
  await h.wait(120);
  const held = await h.game((g) => g.input._virtualDown.has('attack'));
  await page.mouse.up();
  h.assert(held, 'PUNCH raises attack');
  // settings.touchScale
  await h.game((g) => g.applySettings({ touchScale: 1.3 }));
  await h.wait(500);
  await h.shot('81-touch-scale');
  await h.game((g) => g.applySettings({ touchScale: 1 }));
}
