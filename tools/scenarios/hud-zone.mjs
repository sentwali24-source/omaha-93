// Zone banner across zones/districts (emits zone:enter).
export default async function (page, h) {
  // screenshots can time out on a heavily loaded machine: log and carry on
  const snap = (n) => h.shot(n).catch((e) => h.log('shot skipped', n, String(e.message).split('\n')[0]));
  await h.wait(1000);
  await h.game((g) => { window.__zones = []; g.events.on('zone:enter', (e) => window.__zones.push((e.zone?.id || '-') + '/' + e.district?.id)); });
  const spots = [[360, 60, 'downtown'], [-300, -450, 'westlake'], [520, 200, 'oldmarket'], [-100, -900, 'amesnorth']];
  for (const [x, z, name] of spots) {
    await h.game((g, a) => g.debugApi.teleport(a[0], a[1]), [x, z]);
    await h.wait(1300);
    const st = await h.game((g) => ({ key: g.hud._zoneKey, banner: g.hud.bannerEl.className, title: g.hud.bannerTitle.textContent }));
    h.log(name, JSON.stringify(st));
    await snap(`70-zone-${name}`);
  }
  h.log('events', JSON.stringify(await h.game(() => window.__zones)));
}
