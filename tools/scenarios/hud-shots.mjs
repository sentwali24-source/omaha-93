// Quick HUD look check: on foot with toasts + big message + pager, in a car, and the map.
//   node tools/smoke.mjs --port 5215 --no-server --out tools/out/ui-hud-shots \
//     --params "autostart=1&side=crips&set=ngc&debug=1&quality=low" --script tools/scenarios/hud-shots.mjs [--mobile]
export default async function (page, h) {
  const shot = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  if (await h.game(() => navigator.maxTouchPoints > 0)) await page.setViewportSize({ width: 844, height: 390 });
  await h.wait(2500);
  await h.game((g) => {
    g.debugApi.give(120, 40);
    g.debugApi.bigMessage('TURF TAKEN', 'Hamilton & 30th');
    g.debugApi.pager('Unc Ray', '555-0177 911');
    g.police.setHeat?.(2);
  });
  await h.wait(1600);
  await shot('60-hud-events');
  await h.game((g) => { g.police.setHeat?.(0); g.debugApi.driveCar('coupe'); });
  await h.hold('KeyW', 2500);
  await shot('61-hud-car');
  await h.game((g) => { g.player.exitVehicle(true); g.mapScreen.toggle(); });
  await h.wait(1800);
  await shot('62-map');
  await h.game((g) => g.mapScreen.close());
}
