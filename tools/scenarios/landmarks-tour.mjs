// Landmarks tour: screenshots of every landmark group from a free camera (the camera rig is
// frozen) at a chosen hour. Select groups with LM_GROUPS="north,parks" (default: all).
//   view: [name, playerX, playerZ, hour, camPos[x,y,z], lookAt[x,y,z]]
//   or    [name, playerX, playerZ, hour, null, null, yaw, pitch]  (normal game camera)
const GROUPS = {
  check: [
    ['kountze', 290, -800, 14, [300, 22, -795], [290, 0, -840]],
    ['kountze-sw', 275, -815, 14, [262, 12, -800], [295, 0, -845]],
    ['miller', 50, -1110, 12, [60, 35, -1100], [50, 0, -1200]],
    ['fairdeal', 140, -440, 12, [150, 9, -445], [122, 3, -462]],
  ],
  skyline: [
    ['skyline-dusk', 200, -300, 20.2, null, null, 2.7, 0.12],
    ['skyline-north-dusk', 200, -300, 20.2, [196, 11, -318], [380, 42, 60]],
    ['skyline-north-night', 200, -300, 22.5, [196, 11, -318], [380, 42, 60]],
    ['skyline-24lake-dusk', 150, -560, 20.2, [150, 14, -575], [380, 40, 60]],
  ],
  downtown: [
    ['downtown-day', 330, 240, 12, [250, 70, 280], [390, 30, 60]],
    ['downtown-night', 330, 240, 21.5, [250, 70, 280], [390, 30, 60]],
    ['civic-day', 300, 120, 12, [220, 30, 200], [320, 15, 130]],
  ],
  leahy: [['leahy-day', 515, 110, 13, [555, 18, 125], [500, 0, 88]]],
  riverfront: [
    ['heartland-day', 640, 130, 12, [620, 25, 170], [640, 5, 60]],
    ['heartland-night', 640, 130, 21.5, [620, 25, 170], [640, 5, 60]],
    ['asarco-rail', 640, -200, 12, [560, 40, -120], [660, 0, -300]],
  ],
  river: [
    ['river-day', 690, 80, 12, [680, 20, 180], [860, 5, 0]],
    ['river-iowa', 690, 80, 18.5, [690, 30, -60], [1200, 40, 20]],
    ['bridges', 690, 80, 12, [640, 40, 150], [850, 10, -200]],
  ],
  freeways: [
    ['northfwy', 30, -400, 12, [40, 20, -330], [0, 8, -520]],
    ['i480', 300, -80, 12, [260, 22, -60], [420, 8, -110]],
  ],
  midtown: [
    ['joslyn-central', 200, 10, 12, [210, 25, 40], [190, 5, -40]],
    ['creighton', 120, -140, 12, [130, 30, -120], [120, 10, -180]],
    ['mutual-kiewit', -170, 70, 12, [-120, 30, 80], [-190, 15, 60]],
  ],
  north: [
    ['north24-day', 140, -440, 12, [150, 14, -410], [140, 3, -490]],
    ['north24-night', 140, -440, 21.5, [150, 14, -410], [140, 3, -490]],
    ['lake24', 160, -560, 12, [120, 16, -545], [175, 3, -600]],
    ['fortomaha', -80, -1100, 12, [-60, 40, -1090], [-90, 0, -1190]],
    ['northhigh', -280, -900, 12, [-250, 30, -905], [-285, 5, -950]],
  ],
  projects: [
    ['pleasantview', -40, -410, 12, [-20, 30, -405], [-40, 0, -460]],
    ['logan', 200, -260, 12, [210, 30, -250], [200, 0, -310]],
    ['spencer-hilltop', -40, -700, 12, [-30, 30, -700], [-40, 0, -760]],
  ],
  parks: [
    ['kountze', 290, -800, 14, [300, 22, -795], [290, 0, -840]],
    ['kountze-player', 285, -815, 14, null, null, 3.0, 0.2],
    ['kountze-night', 290, -800, 21.5, [300, 22, -795], [290, 0, -840]],
    ['miller', 50, -1110, 12, [60, 35, -1100], [50, 0, -1200]],
    ['bemis', -175, -210, 12, [-150, 25, -205], [-175, 0, -245]],
  ],
  eppley: [
    ['eppley-day', 500, -760, 12, [480, 40, -740], [560, 0, -1000]],
    ['eppley-night', 500, -760, 21.5, [480, 40, -740], [560, 0, -1000]],
    ['eppley-terminal', 560, -780, 15, [600, 25, -770], [560, 5, -870]],
    ['jet-approach', 690, -700, 17, [680, 12, -640], [800, 25, -780], null, null, 12],
    ['jet-takeoff', 600, -800, 17, [640, 20, -830], [640, 5, -1000], null, null, 70],
  ],
};

import path from 'node:path';

// page.screenshot with a long timeout (the machine is shared; SwiftShader frames can be slow)
export async function shot(page, h, name) {
  const i = process.argv.indexOf('--out');
  const dir = path.resolve(i > 0 ? process.argv[i + 1] : 'tools/out/landmarks');
  try {
    await page.screenshot({ path: path.join(dir, `${name}.png`), timeout: 150000 });
  } catch (e) {
    h.log('screenshot failed', name, e.message.split('\n')[0]);
  }
}

export default async function (page, h) {
  const want = process.env.LM_GROUPS ? process.env.LM_GROUPS.split(',') : Object.keys(GROUPS);
  for (const gname of want) {
    for (const v of GROUPS[gname] || []) {
      const [name, px, pz, hour, cam, look, yaw, pitch, jetT] = v;
      await h.game((g, a) => {
        if (!g._lmRigUpdate) g._lmRigUpdate = g.cameraRig.update;
        g.cameraRig.update = a.cam ? () => {} : g._lmRigUpdate;
        g.debugApi.teleport(a.px, a.pz);
        g.debugApi.setHour(a.hour);
        if (a.jetT != null) g.debugApi.landmarks.jet(a.jetT);
        if (a.cam) {
          g.camera.position.set(...a.cam);
          g.camera.lookAt(...a.look);
        } else if (g.cameraRig) {
          g.cameraRig.yaw = a.yaw;
          g.cameraRig.pitch = a.pitch ?? 0.15;
          g.cameraRig.snap?.();
        }
      }, { px, pz, hour, cam, look, yaw, pitch, jetT });
      await h.wait(Number(process.env.LM_WAIT || 3000));
      await shot(page, h, `${gname}-${name}`);
      const perf = await h.game((g) => `${g.renderer.info.render.calls} calls ${g.renderer.info.render.triangles} tris`);
      const jet = jetT != null ? JSON.stringify(await h.game((g) => g.debugApi.landmarks.jet())) : '';
      h.log(name, perf, jet);
    }
  }
}
