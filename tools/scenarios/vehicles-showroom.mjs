// Showroom line-up of every vehicle model (uses debugApi.showroom from Traffic).
//   node tools/smoke.mjs --port 5205 --no-server --out tools/out/vehicles-showroom --script tools/scenarios/vehicles-showroom.mjs
export default async function (page, h) {
  await h.wait(1500);
  const ok = await h.game((g) => {
    if (!g.debugApi?.showroom) return false;
    g.debugApi.showroom({ hour: 13 });
    return true;
  });
  h.assert(ok, 'debugApi.showroom exists');
  await h.wait(2500);
  await h.shot('10-showroom-front');
  await h.game((g) => g.debugApi.showroomView('side'));
  await h.wait(1500);
  await h.shot('11-showroom-side');
  await h.game((g) => g.debugApi.showroomView('rear'));
  await h.wait(1500);
  await h.shot('12-showroom-rear');
  await h.game((g) => g.debugApi.showroomView('close', 0));
  await h.wait(1200);
  await h.shot('13-close-sedan');
  for (let i = 1; i < 10; i++) {
    await h.game((g, i) => g.debugApi.showroomView('close', i), i);
    await h.wait(900);
    await h.shot(`14-close-${i}`);
  }
  const info = await h.game((g) => ({ perf: g.debugApi.perf(), n: g.vehicles.length }));
  h.log(JSON.stringify(info));
}
