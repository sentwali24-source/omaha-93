// Eppley jet check: jumps the jet loop to a few times and points a frozen camera at it, so the
// shots show the approach over the river, the rollout, the turn, the takeoff roll and the climb.
import { shot } from './landmarks-tour.mjs';

const STOPS = [
  // [name, jetT, camera offset from the jet [dx, dy, dz], hour]
  ['approach-river', 15, [-120, -20, -110], 17],
  ['rollout', 26, [-60, 14, 70], 17],
  ['takeoff-roll', 54, [70, 10, -30], 17],
  ['climb-river', 62, [-150, -30, 40], 17],
  ['approach-night', 17, [-110, -10, -120], 22],
];

export default async function (page, h) {
  await h.game((g) => {
    g.debugApi.teleport(640, -830);
    g._lmRig = g.cameraRig.update;
    g.cameraRig.update = () => {};
  });
  for (const [name, t, off, hour] of STOPS) {
    await h.game((g, a) => {
      g.debugApi.setHour(a.hour);
      g.debugApi.landmarks.jet(a.t);
      // aim at the jet every frame so it stays framed while the loop runs
      const upd = () => {
        const j = g.debugApi.landmarks.jet();
        g.camera.position.set(j.x + a.off[0], Math.max(3, j.y + a.off[1]), j.z + a.off[2]);
        g.camera.lookAt(j.x, j.y + 3, j.z);
      };
      g.cameraRig.update = upd;
      upd();
    }, { t, off, hour });
    await h.wait(1800);
    await shot(page, h, `jet-${name}`);
    h.log(name, JSON.stringify(await h.game((g) => g.debugApi.landmarks.jet())));
  }
}
