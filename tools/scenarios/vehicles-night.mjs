// Night drive: headlights / taillights / brake lights on the player's car and traffic at 22:00.
import { waitGame } from './player-util.mjs';

export default async function (page, h) {
  await h.game((g) => {
    g.debugApi.setHour(22);
    g.debugApi.teleport(144, -40);
    g.debugApi.driveCar('lowrider');
    const v = g.player.vehicle;
    v.position.set(144, 0, -150);
    v.heading = Math.PI;
    g.cameraRig.snap();
  });
  await waitGame(h, 1.5);
  await h.down('KeyW');
  await waitGame(h, 2);
  await h.up('KeyW');
  await h.shot('night-0-drive');
  await h.down('KeyS');
  await waitGame(h, 0.6);
  const st = await h.game((g) => ({ night: g.environment.night, lights: g.player.vehicle.lightsOn, braking: g.player.vehicle.braking, perf: g.debugApi.perf() }));
  await h.shot('night-1-brake');
  await h.up('KeyS');
  h.log('night', JSON.stringify(st));
  h.assert(st.night > 0.6, 'it is night');
  h.assert(st.lights, 'headlights on at night');
  // look back at the car from the front
  await h.game((g) => {
    const v = g.player.vehicle;
    g.debugApi.freeCam({ x: v.position.x + 3, y: 1.6, z: v.position.z + 9 }, { x: v.position.x, y: 0.7, z: v.position.z });
  });
  await waitGame(h, 0.4);
  await h.shot('night-2-front');
  await h.game((g) => g.debugApi.freeCam(null));
}
