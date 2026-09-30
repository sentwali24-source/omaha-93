import * as THREE from 'three';

// Shared per-frame context for the NPC systems (Pedestrians, Gangs, Police).
// Built lazily, once per frame, by whichever NPC system updates first:
//
//   ctx.fx / ctx.fz        game.focus this frame
//   ctx.near               live on-foot actors within NEAR_R of the focus (reused array) —
//                          separation and quick perception without per-NPC allocations
//   ctx.vehicles           vehicles within VEH_R of the focus (dodging, pushing out of cars)
//   ctx.inView(x, z, r)    inside the camera frustum (spawn / despawn out of sight)
//   ctx.d2(x, z)           squared distance to the focus
//   ctx.jumped             focus teleported since last frame (respawn, debug teleport)
//   ctx.combatMoves        true once we have seen Combat integrate actor.velocity for NPCs
//                          (then steering must not integrate knockback a second time)

const NEAR_R = 85;
const VEH_R = 95;
const contexts = new WeakMap();

export function npcContext(game) {
  let c = contexts.get(game);
  if (!c) {
    c = new NpcContext(game);
    contexts.set(game, c);
  }
  c.refresh();
  return c;
}

class NpcContext {
  constructor(game) {
    this.game = game;
    this.frame = -1;
    this.near = [];
    this.vehicles = [];
    this.fx = 0;
    this.fz = 0;
    this._lastFx = null;
    this._lastFz = null;
    this.jumped = true;
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._sphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
    // the real Combat integrates actor.velocity for NPCs (ARCHITECTURE §15), so steering never
    // applies knockback itself; the probe below only matters for a Combat that doesn't
    this.combatMoves = !!game.combat?.update;
    this._probe = null; // { actor, x, z, vx, vz, dt }
    this._probeMisses = 0;
  }

  refresh() {
    const g = this.game;
    if (this.frame === g.time.frame) return;
    this.frame = g.time.frame;

    const f = g.focus;
    this.fx = f.x;
    this.fz = f.z;
    this.jumped = this._lastFx === null || Math.abs(f.x - this._lastFx) + Math.abs(f.z - this._lastFz) > 40;
    this._lastFx = f.x;
    this._lastFz = f.z;

    const cam = g.camera;
    cam.updateMatrixWorld();
    this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m);

    const near = this.near;
    near.length = 0;
    const r2 = NEAR_R * NEAR_R;
    const actors = g.actors;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.state === 'removed' || a.vehicle) continue;
      const dx = a.position.x - f.x;
      const dz = a.position.z - f.z;
      if (dx * dx + dz * dz < r2) near.push(a);
    }

    const vs = this.vehicles;
    vs.length = 0;
    const v2 = VEH_R * VEH_R;
    const vehicles = g.vehicles;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const dx = v.position.x - f.x;
      const dz = v.position.z - f.z;
      if (dx * dx + dz * dz < v2) vs.push(v);
    }

    this._checkProbe();
  }

  d2(x, z) {
    const dx = x - this.fx;
    const dz = z - this.fz;
    return dx * dx + dz * dz;
  }

  inView(x, z, r = 1.5) {
    const s = this._sphere;
    s.center.set(x, 1, z);
    s.radius = r;
    return this.frustum.intersectsSphere(s);
  }

  // ---------------------------------------------------------------- knockback detection
  // The contract says Combat "applies & decays actor.velocity for NPCs"; the skeleton stub only
  // decays it. Steering integrates knockback itself until it observes an NPC being displaced by
  // ~velocity·dt between two of our updates (i.e. Combat moved it), then stops doing so.

  /** Called by steering right after it moved an actor with a significant knockback velocity. */
  probe(actor) {
    if (this.combatMoves || this._probe || this._probeMisses > 6) return;
    const v = actor.velocity;
    this._probe = { actor, x: actor.position.x, z: actor.position.z, vx: v.x, vz: v.z, dt: this.game.time.dt };
  }

  _checkProbe() {
    const p = this._probe;
    if (!p) return;
    this._probe = null;
    const a = p.actor;
    if (a.state === 'removed') return;
    const dx = a.position.x - p.x;
    const dz = a.position.z - p.z;
    const moved = Math.hypot(dx, dz);
    const vlen = Math.hypot(p.vx, p.vz);
    const expect = vlen * p.dt;
    if (expect < 1e-3) return;
    const along = (dx * p.vx + dz * p.vz) / (vlen || 1);
    if (moved > expect * 0.35 && along > moved * 0.8) this.combatMoves = true;
    else if (moved < expect * 0.1) this._probeMisses++;
  }
}
