// Map screen: open with M, set a waypoint by clicking, pan/zoom, close with M.
export default async function (page, h) {
  await h.wait(1200);
  await h.game((g) => g.hud.addMarker({ id: 'm1', type: 'mission', x: 150, z: -560, label: 'OG Mack' }));
  await h.press('KeyM');
  await h.wait(1200);
  const open = await h.game((g) => ({ open: g.mapScreen.open, paused: g.paused }));
  h.assert(open.open && open.paused, 'map opens and pauses');
  await h.page.mouse.click(760, 250);
  await h.wait(500);
  const wp = await h.game((g) => g.hud.getWaypoint());
  h.assert(!!wp, 'click sets a waypoint');
  h.log('waypoint', JSON.stringify(wp));
  await h.shot('20-map');
  // zoom in with the wheel around the player
  await h.page.mouse.move(640, 360);
  for (let i = 0; i < 4; i++) {
    await h.page.mouse.wheel(0, -240);
    await h.wait(150);
  }
  await h.wait(600);
  await h.shot('21-map-zoom');
  // drag
  await h.page.mouse.move(640, 360);
  await h.page.mouse.down();
  await h.page.mouse.move(500, 300, { steps: 6 });
  await h.page.mouse.up();
  await h.wait(400);
  await h.shot('22-map-drag');
  // zoom all the way out
  await h.game((g) => { for (let i = 0; i < 12; i++) g.mapScreen._zoomAt(640, 360, 0.7); });
  await h.wait(500);
  await h.shot('23-map-full');
  await h.press('KeyM');
  await h.wait(800);
  const closed = await h.game((g) => ({ open: g.mapScreen.open, paused: g.paused }));
  h.assert(!closed.open && !closed.paused, 'map closes and resumes');
  await h.shot('24-after-map');
}
