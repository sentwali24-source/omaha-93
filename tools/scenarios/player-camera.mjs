// Camera: wall pull-in (≥ 0.3 m off walls), side walls, look input, C presets, auto-recenter.
import { waitGame, waitUntil, P } from './player-util.mjs';

export default async function (page, h) {
  // back to a wall: player faces north 1 m in front of a wall; the camera wants to be behind it
  await h.game((g) => {
    g.debugApi.setHour(12);
    g.debugApi.teleport(140, -591);
    const p = g.player;
    p.faceHeading(0);
    p.moveHeading = 0;
    g.cameraRig.yaw = 0;
    g.cameraRig.pitch = 0.24;
    g.cameraRig.snap();
    g.__wall = g.collision.addBox(126, -590, 154, -588, 6, 0, 'building');
  });
  await waitGame(h, 0.4);
  const c1 = await h.game((g) => g.debugApi.camera());
  await h.shot('cam-backwall');
  h.log('back wall cam', JSON.stringify(c1));
  h.assert(c1.z <= -590.25, `camera stays in front of the wall (z=${c1.z})`);
  h.assert(c1.distance < 1.2, `camera pulled in (${c1.distance})`);

  // wall to the side: orbit the camera to the east, a wall 1.5 m east of the player
  await h.game((g) => {
    g.collision.removeBox(g.__wall);
    g.__wall = g.collision.addBox(141.5, -600, 143, -580, 6, 0, 'building');
    g.cameraRig.yaw = Math.PI / 2; // looking west → camera sits on the east side
  });
  await waitGame(h, 0.4);
  const c2 = await h.game((g) => g.debugApi.camera());
  await h.shot('cam-sidewall');
  h.log('side wall cam', JSON.stringify(c2));
  h.assert(c2.x <= 141.5 - 0.2, `camera kept off the side wall (x=${c2.x})`);

  // pull back out smoothly when the wall goes away
  await h.game((g) => g.collision.removeBox(g.__wall));
  await waitGame(h, 1.2);
  const c3 = await h.game((g) => g.debugApi.camera());
  h.log('free cam', JSON.stringify(c3));
  h.assert(c3.distance > 3.5, `camera eases back out (${c3.distance})`);

  // mouse look: 100 px → 0.35 rad
  const y0 = (await h.game((g) => g.debugApi.camera())).yaw;
  await h.game((g) => g.input.addLook(100, 0));
  await waitGame(h, 0.1);
  const y1 = (await h.game((g) => g.debugApi.camera())).yaw;
  h.log('look yaw', y0, '->', y1);
  h.assert(Math.abs(y0 - y1 - 0.35) < 0.02, `look input turns the camera ${(y0 - y1).toFixed(3)} rad per 100 px`);

  // C taps cycle presets
  const pr0 = (await h.game((g) => g.debugApi.camera())).preset;
  await h.press('KeyC');
  await waitGame(h, 0.15);
  const pr1 = (await h.game((g) => g.debugApi.camera())).preset;
  h.log('preset', pr0, '->', pr1);
  h.assert(pr1 === (pr0 + 1) % 3, 'C cycles camera distance');
  await h.press('KeyC');
  await waitGame(h, 0.1);
  await h.press('KeyC');
  await waitGame(h, 0.1);

  // auto-recenter: camera 1 rad off, walk forward-ish without look input
  await h.game((g) => {
    g.debugApi.teleport(140, -560);
    g.player.faceHeading(Math.PI);
    g.player.moveHeading = Math.PI;
    g.cameraRig.yaw = Math.PI;
    g.cameraRig.snap();
  });
  await waitGame(h, 0.2);
  await h.game((g) => g.input.setVirtualMove(0.45, 0.9));
  await waitGame(h, 3.5);
  const r = await h.game((g) => ({ cam: g.debugApi.camera(), p: g.debugApi.player() }));
  await h.game((g) => g.input.setVirtualMove(0, 0));
  const off = Math.abs(((r.cam.yaw - r.p.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  h.log('recenter: yaw', r.cam.yaw, 'heading', r.p.heading, 'offset', off.toFixed(3));
  h.assert(off < 0.5 && Math.abs(r.cam.yaw - Math.PI) > 0.8, 'camera follows the moving player around (auto-recenter)');
  await h.shot('cam-recenter');
}
