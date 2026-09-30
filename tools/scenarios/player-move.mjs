// Movement: acceleration, walls (no tunneling / jitter), sliding, knockback into a thin wall,
// fence jump, sprint stamina, camera-relative movement. Test arena on 24th St north of Lake.
import { waitGame, waitUntil, P } from './player-util.mjs';

export default async function (page, h) {
  await h.game((g) => {
    g.debugApi.setHour(13);
    g.debugApi.teleport(140, -596);
    const p = g.player;
    p.faceHeading(0);
    p.moveHeading = 0;
    g.cameraRig.yaw = 0;
    g.cameraRig.snap();
    // wall across the street 6 m north, 0.4 m thick
    g.__testBoxes = [g.collision.addBox(128, -602.4, 152, -602, 3, 0, 'building')];
  });

  // walk (hold W) into the wall
  await h.down('KeyW');
  await waitGame(h, 0.45);
  const early = await P(h);
  await waitGame(h, 2.2);
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await waitGame(h, 0.15);
    samples.push(await P(h));
  }
  await h.shot('move-wall');
  await h.up('KeyW');
  const zs = samples.map((s) => s.z);
  h.log('accel speed after 0.45 s:', early.moveSpeed, '| wall z samples', zs.join(', '));
  const zmin = Math.min(...zs);
  const zmax = Math.max(...zs);
  h.assert(early.moveSpeed > 3.5, `accelerates to a jog quickly (${early.moveSpeed})`);
  h.assert(zmin > -602.0, `no tunneling through wall (z=${zmin})`);
  h.assert(zmax - zmin < 0.02, `no jitter against wall (range ${(zmax - zmin).toFixed(3)})`);
  h.assert(Math.abs(zmin - -601.65) < 0.08, `stops a radius off the wall (z=${zmin})`);
  h.assert(samples[samples.length - 1].speed < 1.2, `animation speed drops against the wall (${samples[samples.length - 1].speed})`);

  // slide along the wall: W + D, x increases while z stays
  const b0 = await P(h);
  await h.down('KeyW');
  await h.down('KeyD');
  await waitGame(h, 1.2);
  await h.up('KeyD');
  await h.up('KeyW');
  const b1 = await P(h);
  h.log('slide x', b0.x, '->', b1.x, 'z', b1.z);
  h.assert(b1.x > b0.x + 1.5, 'slides along the wall (camera-relative right)');
  h.assert(b1.z > -602.0, 'still in front of the wall after sliding');

  // knockback impulse into a thin (5 cm) fence must not tunnel
  await h.game((g) => {
    g.debugApi.teleport(140, -590);
    g.__testBoxes.push(g.collision.addBox(130, -592.05, 150, -592.0, 3, 0, 'fence'));
    g.player.velocity.set(0, 0, -24);
  });
  await waitGame(h, 1.0);
  const kb = await P(h);
  h.log('knockback into thin fence z', kb.z);
  h.assert(kb.z > -592.0, `knockback does not tunnel a thin fence (z=${kb.z})`);

  // low fence (0.9 m): blocked when walking, cleared when jumping
  await h.game((g) => {
    for (const b of g.__testBoxes) g.collision.removeBox(b);
    g.__testBoxes = [g.collision.addBox(128, -588.1, 152, -588.0, 0.9, 0, 'fence')];
    g.debugApi.teleport(140, -583);
    g.player.faceHeading(0);
    g.player.moveHeading = 0;
    g.cameraRig.yaw = 0;
    g.cameraRig.snap();
  });
  await h.down('KeyW');
  await waitGame(h, 2.0);
  await h.up('KeyW');
  const blocked = await P(h);
  h.log('fence walk z', blocked.z);
  h.assert(blocked.z > -588.0 && blocked.z < -587.5, `low fence blocks walking (z=${blocked.z})`);

  await h.game((g) => {
    g.debugApi.teleport(140, -583);
    g.player.faceHeading(0);
    g.player.moveHeading = 0;
  });
  await h.down('KeyW');
  const atJump = await waitUntil(h, (g) => g.player.position.z < -585.6 && g.debugApi.player(), null, 4);
  await h.down('Space');
  await waitGame(h, 0.08);
  await h.up('Space');
  let maxY = 0;
  for (let i = 0; i < 30; i++) {
    const s = await P(h);
    maxY = Math.max(maxY, s.y);
    if (i === 3) await h.shot('move-jump');
    if (s.z < -590 && s.grounded) break;
    await waitGame(h, 0.05);
  }
  await waitGame(h, 0.3);
  await h.up('KeyW');
  const cleared = await P(h);
  h.log('jump from z', atJump?.z, '-> z', cleared.z, 'maxY', maxY.toFixed(2));
  h.assert(cleared.z < -588.3, `jump clears the low fence (z=${cleared.z})`);
  h.assert(maxY > 0.8, `jump height ${maxY}`);

  // sprint drains stamina, recovers after, decelerates to a stop
  await h.game((g) => {
    for (const b of g.__testBoxes) g.collision.removeBox(b);
    g.debugApi.teleport(140, -560);
    g.player.faceHeading(Math.PI);
    g.player.moveHeading = Math.PI;
    g.cameraRig.yaw = Math.PI;
    g.cameraRig.snap();
  });
  const d0 = (await P(h)).distance;
  await h.down('ShiftLeft');
  await h.down('KeyW');
  let peak = 0;
  for (let i = 0; i < 8; i++) {
    await waitGame(h, 0.3);
    peak = Math.max(peak, (await P(h)).moveSpeed);
  }
  await h.shot('move-sprint');
  const sprinted = await P(h);
  await h.up('KeyW');
  await h.up('ShiftLeft');
  h.log('sprint peak', peak, 'stamina', sprinted.stamina, 'distance +', (sprinted.distance - d0).toFixed(1));
  h.assert(peak > 7, `sprint speed ${peak}`);
  h.assert(sprinted.stamina < 0.8, `sprint drains stamina (${sprinted.stamina})`);
  h.assert(sprinted.distance - d0 > 8 && sprinted.distance - d0 < 30, 'stats.distance accumulates (no teleport spikes)');
  await waitGame(h, 2.0);
  const rec = await P(h);
  h.log('recovered stamina', rec.stamina, 'speed', rec.moveSpeed);
  h.assert(rec.stamina > sprinted.stamina, 'stamina recovers');
  h.assert(rec.moveSpeed < 0.2, `decelerates to a stop (${rec.moveSpeed})`);
}
