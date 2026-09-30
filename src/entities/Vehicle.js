import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.js';
import { MODELS, VEHICLE_MODELS, WHEEL_STYLES, makeScheme, getBodyGeometry, burntScheme } from './vehicleModels.js';
import { getBodyMaterial } from './vehicles/materials.js';
import { getVehicleFx, prepareWheelStyle } from './vehicles/fx.js';

// Vehicles (ARCHITECTURE.md §16): procedural 1993 street cars with arcade physics.
//
// new Vehicle(game, { model, color, x, z, heading, police, variant?, scheme?, rng? })
//   model: sedan coupe lowrider wagon pickup hatch van police bus   (variant 'aero' = newer sedan)
//
// Physics is a planar arcade model: world velocity + heading, speed-dependent steering, lateral
// grip that drops on the handbrake (drifts), per-model mass / acceleration / top speed. Collisions:
// 3–5 circles along the body against game.collision, circle pairs against other cars (impulses on
// both, angular kick), and an oriented box against actors (run-overs above 4 m/s).
// Rendering: ONE body mesh per car (shared cached geometry + shared material); wheels, lamps,
// smoke, skids and contact shadows go through the shared instanced systems in vehicles/fx.js.

export { VEHICLE_MODELS };

const REVERSE_TOP = 9;
const GRAVITY = 14;
let nextUid = 1;

// scratch (no per-frame allocations)
const _tmp = { x: 0, z: 0 };
const _carM = new THREE.Matrix4();
const _locM = new THREE.Matrix4();
const _wM = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v3 = new THREE.Vector3();
const _s3 = new THREE.Vector3();
const _out = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, z: 0 };
const GEAR_LO = [0, 0, 0.2, 0.42, 0.65];
const GEAR_HI = [0, 0.24, 0.46, 0.7, 1.0];

export class Vehicle {
  constructor(game, { model = 'sedan', color = null, x = 0, z = 0, heading = 0, police = false, variant = null, scheme = null, rng = null } = {}) {
    if (!MODELS[model]) model = 'sedan';
    this.uid = nextUid++;
    this.game = game;
    this.model = model;
    this.spec = MODELS[model];
    this.variant = model === 'sedan' ? variant : null;
    this.isPolice = !!police || model === 'police';
    this.scheme = scheme || makeScheme(model, rng || Math.random, { color: color || undefined, variant: this.variant });
    this.color = color || this.scheme.colors[0];
    this.fx = getVehicleFx(game);

    const s = this.spec;
    this.length = s.length;
    this.width = s.width;
    this.height = s.height;
    this.radius = s.radius;
    this.mass = s.mass;
    this.maxSpeed = s.top;

    // scene graph: root (ground, heading) → pivot (suspension pitch/roll/heave) → body mesh
    this.root = new THREE.Group();
    this.root.name = `vehicle-${model}`;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = heading;
    this.pivot = new THREE.Group();
    this.pivot.position.y = 0.55;
    this.body = new THREE.Mesh(getBodyGeometry(model, this.scheme), getBodyMaterial());
    this.body.position.y = -0.55;
    this.body.castShadow = !!game.quality?.shadows;
    this.body.receiveShadow = !!game.quality?.shadows;
    this.body.userData.vehicle = this;
    this.pivot.add(this.body);
    this.root.add(this.pivot);

    // state
    this.heading = heading;
    this.velocity = new THREE.Vector3(); // world m/s (y unused)
    this.speed = 0; // signed forward m/s
    this.lateral = 0; // sideways slip m/s (+ = sliding toward the right side)
    this.yawRate = 0;
    this.spin = 0; // impulse-driven angular velocity (collisions)
    this.steerAngle = 0;
    this.health = 100;
    this.totaled = false;
    this.driver = null;
    this.ai = null;
    this.parked = false;
    this.siren = false;
    this.controls = { throttle: 0, steer: 0, brake: 0, handbrake: false };
    this.rpm = 0; // 0..1 engine note for audio
    this.gear = 1;
    this.engineOn = false;
    this.braking = false;
    this.reversing = false;
    this.skid = 0; // 0..1 tire slip
    this.lightsOn = false;
    this.turnSignal = 0; // -1 left, +1 right (AI blinkers)
    this.asleep = false;
    this.disposed = false;
    this.userData = {};

    // suspension + hydraulics
    this.pitch = 0;
    this.pitchV = 0;
    this.roll = 0;
    this.rollV = 0;
    this.heave = 0;
    this.heaveV = 0;
    this.hopY = 0;
    this.hopV = 0;
    this.idleT = 0;
    this._prevVf = 0;
    this._accelLong = 0;

    this.wheelStyle = prepareWheelStyle(WHEEL_STYLES[this.scheme.wheel] || WHEEL_STYLES.hubcap);
    this.wheelSpin = 0;
    this.hornT = -10;
    this._hornFrame = -1;
    this._crashT = -10;
    this._smokeAcc = 0;
    this._tireSmokeAcc = 0;
    this._skidPrev = [null, null];
    this._skidSoundT = -10;
    this._err = false;

    // world-space collision circles (kept current as the car moves)
    const n = s.circles.length;
    this._cx = new Float32Array(n);
    this._cz = new Float32Array(n);
    this._updateCircles();
  }

  get position() {
    return this.root.position;
  }

  /** Someone (player, cop, virtual traffic driver) or an AI is at the wheel. */
  get driven() {
    return !!(this.driver || this.ai);
  }

  setDriver(actor) {
    this.driver = actor || null;
    if (actor) {
      this.parked = false;
      this.asleep = false;
    } else {
      const c = this.controls;
      c.throttle = 0;
      c.steer = 0;
      c.brake = 0;
    }
  }

  /** Free spot beside the driver door (US: left side), else passenger side, behind, in front. */
  getExitPoint() {
    const p = this.position;
    const h = this.heading;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const side = this.width / 2 + 0.75;
    const cands =
      this.model === 'bus'
        ? [
            [side, this.length / 2 - 1.2],
            [side, 0],
            [-side, this.length / 2 - 1.2],
            [0, -(this.length / 2 + 0.9)],
          ]
        : [
            [-side, 0.25],
            [side, 0.25],
            [-side, -0.9],
            [side, -0.9],
            [0, -(this.length / 2 + 0.9)],
            [0, this.length / 2 + 0.9],
          ];
    const col = this.game.collision;
    for (const [lx, lf] of cands) {
      const x = p.x + rx * lx + fx * lf;
      const z = p.z + rz * lx + fz * lf;
      if (col && !col.isFree(x, z, 0.4)) continue;
      if (this._pointInOtherVehicle(x, z, 0.45)) continue;
      return { x, z };
    }
    const [lx, lf] = cands[0];
    return { x: p.x + rx * lx + fx * lf, z: p.z + rz * lx + fz * lf };
  }

  _pointInOtherVehicle(x, z, pad) {
    const list = this.game.vehicles;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v === this || v.disposed) continue;
      const dx = x - v.position.x;
      const dz = z - v.position.z;
      if (dx * dx + dz * dz > (v.radius + pad) * (v.radius + pad)) continue;
      const h = v.heading;
      const lf = dx * -Math.sin(h) + dz * -Math.cos(h);
      const lx = dx * Math.cos(h) + dz * -Math.sin(h);
      if (Math.abs(lx) < v.width / 2 + pad && Math.abs(lf) < v.length / 2 + pad) return true;
    }
    return false;
  }

  /** Honk. In a police car the player's horn toggles the siren; lowriders hop on the horn. */
  horn() {
    const game = this.game;
    const now = game.time.elapsed;
    if (this._hornFrame === game.time.frame || now - this.hornT < 0.25) return;
    this._hornFrame = game.time.frame;
    this.hornT = now;
    const p = this.position;
    if (this.isPolice && this.driver && this.driver === game.player) {
      this.siren = !this.siren;
      game.audio?.play?.('siren_yelp', { x: p.x, z: p.z });
      return;
    }
    const rate = this.model === 'bus' ? 0.7 : this.model === 'hatch' ? 1.25 : this.model === 'pickup' || this.model === 'van' ? 0.88 : 1;
    game.audio?.play?.('horn', { x: p.x, z: p.z, volume: this.driver === game.player ? 0.9 : 0.55, rate });
    if (this.model === 'lowrider' && Math.abs(this.speed) < 3) this.hop(1);
  }

  /** Hydraulic hop (lowriders only). power 0..1.5 */
  hop(power = 1) {
    if (this.model !== 'lowrider' || this.totaled) return false;
    if (this.hopY > 0.02 || this.hopV > 0) return false;
    this.hopV = 3.4 * power;
    this.heaveV -= 1.2;
    this.asleep = false;
    return true;
  }

  /** Apply body damage (0..100 scale). Health 0 = totaled (won't start, dark smoke). */
  damage(amount) {
    if (this.totaled || !(amount > 0)) return;
    const k = this.model === 'bus' ? 0.45 : this.isPolice ? 0.8 : 1;
    this.health = Math.max(0, this.health - amount * k);
    if (this.health <= 0) this._total();
  }

  repair() {
    this.health = 100;
    if (this.totaled) {
      this.totaled = false;
      this.body.geometry = getBodyGeometry(this.model, this.scheme);
    }
  }

  /** Change the paint job (garage respray). color = main paint hex; null = new random scheme. */
  respray(color = null) {
    this.scheme = makeScheme(this.model, Math.random, { color: color || undefined, variant: this.variant });
    this.color = this.scheme.colors[0];
    this.wheelStyle = prepareWheelStyle(WHEEL_STYLES[this.scheme.wheel] || WHEEL_STYLES.hubcap);
    this.body.geometry = getBodyGeometry(this.model, this.totaled ? burntScheme(this.scheme) : this.scheme);
  }

  /** Alias used by the body shop (Shops): new main paint color. */
  setColor(hex) {
    this.respray(hex || null);
  }

  _total() {
    if (this.totaled) return;
    this.totaled = true;
    this.health = 0;
    this.siren = false;
    this.engineOn = false;
    this.body.geometry = getBodyGeometry(this.model, burntScheme(this.scheme));
    const p = this.position;
    for (let i = 0; i < 8; i++) {
      this.fx.emitSmoke(p.x + (Math.random() - 0.5) * 2, 1, p.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 1, 3.4, 2.4, 0.05, 0.9);
    }
    this.game.events.emit('vehicle:totaled', { vehicle: this });
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (this.disposed) return;
    this.fx.beginFrame(dt);
    try {
      this._simulate(dt);
    } catch (err) {
      if (!this._err) console.error('[vehicle] update failed', err);
      this._err = true;
    }
    this._render(dt);
  }

  _simulate(dt) {
    const game = this.game;
    const c = this.controls;
    const m = this.spec;
    const driven = this.driven;
    if (!driven) {
      c.throttle = 0;
      c.steer = 0;
      c.brake = 0;
      c.handbrake = true;
    }
    const v = this.velocity;
    const moving = v.x * v.x + v.z * v.z > 0.0025 || Math.abs(this.spin) > 0.01 || Math.abs(this.yawRate) > 0.01;
    const airborne = this.hopY > 0 || this.hopV > 0;
    if (!driven && !moving && !airborne && Math.abs(this.pitchV) + Math.abs(this.rollV) + Math.abs(this.heaveV) < 0.01) {
      // parked and settled: sleep (still rendered)
      this.asleep = true;
      v.x = v.z = 0;
      this.speed = 0;
      this.lateral = 0;
      this.rpm = 0;
      this.engineOn = false;
      this.braking = false;
      this.reversing = false;
      this.skid = 0;
      return;
    }
    this.asleep = false;

    if (this.driver && this.driver === game.player && game.input?.pressed?.('horn')) this.horn();

    this.engineOn = driven && !this.totaled;
    const throttle = this.engineOn ? clamp(c.throttle || 0, -1, 1) : 0;
    const steerIn = clamp(c.steer || 0, -1, 1);
    const handbrake = !!c.handbrake;

    let h = this.heading;
    let fx = -Math.sin(h);
    let fz = -Math.cos(h);
    let rx = Math.cos(h);
    let rz = -Math.sin(h);
    let vf = v.x * fx + v.z * fz;
    let vr = v.x * rx + v.z * rz;

    // ---- longitudinal: throttle / brake / reverse
    let accel = 0;
    let braking = false;
    let reversing = false;
    if (throttle > 0.02) {
      if (vf < -0.6) {
        accel = m.brake * throttle;
        braking = true;
      } else {
        const t = clamp(vf / m.top, 0, 1);
        accel = m.accel * throttle * (1 - t * t) * (vf < 5 ? 1.2 : 1);
      }
    } else if (throttle < -0.02) {
      if (vf > 0.6) {
        accel = -m.brake * -throttle;
        braking = true;
      } else {
        const t = clamp(-vf / REVERSE_TOP, 0, 1);
        accel = -m.accel * 0.65 * -throttle * (1 - t);
        reversing = vf < -0.3 || throttle < -0.2;
      }
    }
    // resistive forces never flip the sign of vf
    let resist = Math.abs(vf) * 0.035 + (Math.abs(throttle) < 0.05 ? (driven ? 1.0 : 3.5) : 0.25);
    if (c.brake > 0) {
      resist += m.brake * clamp(c.brake, 0, 1);
      if (c.brake > 0.15) braking = true;
    }
    if (handbrake) resist += driven ? 5.5 : 9;
    vf += accel * dt;
    const dv = resist * dt;
    if (Math.abs(vf) <= dv) vf = 0;
    else vf -= Math.sign(vf) * dv;
    if (vf > m.top * 1.05) vf = m.top * 1.05;

    // ---- steering + yaw (bicycle model with a grip limit; handbrake → oversteer)
    const sp = Math.abs(vf);
    const maxSteer = this.maxSteerAt(sp);
    this.steerAngle = damp(this.steerAngle, steerIn * maxSteer, lerp(11, 6, clamp(sp / 30, 0, 1)), dt);
    let yawTarget = (-vf * Math.tan(this.steerAngle)) / m.wheelbase;
    const latMax = (handbrake ? m.grip * 1.7 : m.grip) / Math.max(sp, 1.5);
    yawTarget = clamp(yawTarget, -latMax, latMax);
    if (handbrake && sp > 3) yawTarget *= 1.4;
    this.yawRate = damp(this.yawRate, yawTarget, handbrake ? 5 : 12, dt);
    this.spin = damp(this.spin, 0, 2.6, dt);
    h += (this.yawRate + this.spin) * dt;
    this.heading = h;

    // world velocity from the old heading, re-projected on the new one (slip emerges here)
    const wx = fx * vf + rx * vr;
    const wz = fz * vf + rz * vr;
    fx = -Math.sin(h);
    fz = -Math.cos(h);
    rx = Math.cos(h);
    rz = -Math.sin(h);
    vf = wx * fx + wz * fz;
    vr = wx * rx + wz * rz;
    const sliding = Math.abs(vr) > 4;
    const grip = handbrake ? 1.3 : m.grip * (sliding ? 0.5 : 1);
    const vrNew = damp(vr, 0, grip, dt);
    if (!handbrake && Math.abs(vf) > 0.5) vf += Math.sign(vf) * (Math.abs(vr) - Math.abs(vrNew)) * 0.5;
    vr = vrNew;
    v.x = fx * vf + rx * vr;
    v.z = fz * vf + rz * vr;
    this.speed = vf;
    this.lateral = vr;
    this.braking = braking && Math.abs(vf) > 0.3;
    this.reversing = reversing;

    // ---- integrate + world collision (substeps at speed so walls are not tunneled)
    const p = this.position;
    const travel = Math.hypot(v.x, v.z) * dt;
    const steps = Math.min(4, Math.max(1, Math.ceil(travel / 0.5)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      p.x += v.x * sdt;
      p.z += v.z * sdt;
      this._collideWorld();
    }
    this._updateCircles();
    this._collideVehicles();
    this._collideActors();

    // ---- engine note (4-speed automatic)
    const f = clamp(Math.abs(this.speed) / m.top, 0, 1);
    this.gear = f < 0.24 ? 1 : f < 0.46 ? 2 : f < 0.7 ? 3 : 4;
    const lo = GEAR_LO[this.gear];
    const hi = GEAR_HI[this.gear];
    let rpmT = this.engineOn ? 0.16 + 0.8 * clamp((f - lo) / (hi - lo), 0, 1) : 0;
    if (this.engineOn && Math.abs(throttle) > 0.1 && Math.abs(vf) < 3) rpmT = Math.max(rpmT, 0.2 + 0.55 * Math.abs(throttle));
    if (this.engineOn && sliding) rpmT = Math.min(1, rpmT + 0.15);
    this.rpm = damp(this.rpm, rpmT, 7, dt);

    // ---- tire slip for skids / smoke / sound
    let skid = Math.min(1, Math.abs(vr) / 6);
    if (braking && Math.abs(vf) > 9 && Math.abs(throttle) > 0.5) skid = Math.max(skid, 0.55);
    if (handbrake && driven && Math.abs(vf) > 4) skid = Math.max(skid, 0.75);
    this.skid = skid;

    // ---- suspension (weight transfer) and hydraulics
    const aLong = (this.speed - this._prevVf) / Math.max(dt, 1e-3);
    this._prevVf = this.speed;
    this._accelLong = damp(this._accelLong, clamp(aLong, -25, 25), 10, dt);
    const pitchT = clamp(this._accelLong * 0.0075, -0.075, 0.05);
    const rollT = clamp(-vf * this.yawRate * 0.011, -0.075, 0.075);
    let heaveT = 0;
    let rollExtra = 0;
    if (this.model === 'lowrider' && driven && !this.totaled && Math.abs(vf) < 0.4) {
      // idling lowrider: hydraulics dance (bounce + three-wheel side-to-side)
      this.idleT += dt;
      const dance = clamp((this.idleT - (this.driver === game.player ? 2.5 : 1.2)) * 0.8, 0, 1);
      if (dance > 0) {
        const t = game.time.elapsed;
        heaveT = (0.06 + 0.04 * Math.sin(t * 0.7)) * Math.sin(t * 6.2) * dance;
        rollExtra = 0.05 * Math.sin(t * 3.1) * dance * (Math.sin(t * 0.37) > 0 ? 1 : 0);
      }
    } else {
      this.idleT = 0;
    }
    this.pitchV += ((pitchT - this.pitch) * 85 - this.pitchV * 11) * dt;
    this.pitch += this.pitchV * dt;
    this.rollV += ((rollT + rollExtra - this.roll) * 85 - this.rollV * 11) * dt;
    this.roll += this.rollV * dt;
    this.heaveV += ((heaveT - this.heave) * 120 - this.heaveV * 12) * dt;
    this.heave += this.heaveV * dt;
    if (airborne) {
      this.hopV -= GRAVITY * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) {
        this.hopY = 0;
        if (this.hopV < -1.6) {
          this.hopV = -this.hopV * 0.32;
          this.heaveV -= 1.5;
          this.pitchV -= 0.8;
        } else {
          this.hopV = 0;
        }
      }
    }
    this.wheelSpin += (vf * dt) / m.wheelR;
    if (this.wheelSpin > 1e4 || this.wheelSpin < -1e4) this.wheelSpin %= Math.PI * 2;
  }

  /** Max front-wheel angle at a given speed (the AI inverts this for steering). */
  maxSteerAt(speed) {
    return this.spec.steer * lerp(1, 0.26, clamp(Math.abs(speed) / 30, 0, 1));
  }

  _updateCircles() {
    const p = this.position;
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const cs = this.spec.circles;
    for (let i = 0; i < cs.length; i++) {
      // circle offsets are model z (−z = front): world = p − f · z
      this._cx[i] = p.x - fx * cs[i];
      this._cz[i] = p.z - fz * cs[i];
    }
  }

  // ------------------------------------------------------------------ collisions
  _collideWorld() {
    const col = this.game.collision;
    if (!col) return;
    const p = this.position;
    const m = this.spec;
    const R = m.circleR;
    const cs = m.circles;
    let nx = 0;
    let nz = 0;
    let contacts = 0;
    for (let i = 0; i < cs.length; i++) {
      const fx = -Math.sin(this.heading);
      const fz = -Math.cos(this.heading);
      const ox = -fx * cs[i];
      const oz = -fz * cs[i];
      _tmp.x = p.x + ox;
      _tmp.z = p.z + oz;
      const k = col.resolveCircle(_tmp, R, 0.3, 1.6);
      if (!k) continue;
      const dx = _tmp.x - (p.x + ox);
      const dz = _tmp.z - (p.z + oz);
      p.x += dx;
      p.z += dz;
      // off-center pushes rotate the car so it scrapes along walls
      const lever = -cs[i];
      const lat = dx * Math.cos(this.heading) + dz * -Math.sin(this.heading);
      this.heading -= ((lat * lever) / (lever * lever + m.length * m.length * 0.25)) * 0.6;
      nx += col.lastNormal.x;
      nz += col.lastNormal.z;
      contacts++;
    }
    if (!contacts) return;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const v = this.velocity;
    const vn = v.x * nx + v.z * nz;
    if (vn >= 0) return;
    const impact = -vn;
    const e = impact > 3 ? 0.28 : 0.05;
    v.x -= nx * vn * (1 + e);
    v.z -= nz * vn * (1 + e);
    // tangential friction grows with the hit
    const vt = v.x * nx + v.z * nz;
    const tx = v.x - nx * vt;
    const tz = v.z - nz * vt;
    const loss = Math.min(0.45, impact * 0.03);
    v.x -= tx * loss;
    v.z -= tz * loss;
    this.yawRate *= 0.6;
    if (impact > 2.5) this._impact(impact, null);
  }

  _impact(impact, other) {
    const game = this.game;
    const dmg = (impact - 3.5) * 2.1 + (impact > 14 ? (impact - 14) * 1.6 : 0);
    if (dmg > 0) this.damage(dmg * (other ? clamp(other.mass / this.mass, 0.4, 3) : 1));
    this.heaveV += Math.min(2, impact * 0.08);
    this.pitchV -= Math.min(1.5, impact * 0.05);
    const now = game.time.elapsed;
    if (impact > 4 && now - this._crashT > 0.35) {
      this._crashT = now;
      game.events.emit('vehicle:crash', { vehicle: this, impact, other: other || null });
      if (this.driver && this.driver === game.player) game.cameraRig?.shake?.(clamp(impact / 22, 0.08, 1));
    }
  }

  _collideVehicles() {
    const list = this.game.vehicles;
    const p = this.position;
    const m = this.spec;
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (o === this || o.disposed) continue;
      if (!o.asleep && o.uid < this.uid) continue; // both awake: the lower uid handles the pair
      const op = o.position;
      const dx = p.x - op.x;
      const dz = p.z - op.z;
      const rr = this.radius + o.radius;
      if (dx * dx + dz * dz > rr * rr) continue;
      // deepest circle pair
      const rs = m.circleR + o.spec.circleR;
      let best = 0;
      let bi = -1;
      let bj = -1;
      for (let i = 0; i < this._cx.length; i++) {
        for (let j = 0; j < o._cx.length; j++) {
          const ex = this._cx[i] - o._cx[j];
          const ez = this._cz[i] - o._cz[j];
          const d2 = ex * ex + ez * ez;
          if (d2 >= rs * rs) continue;
          const pen = rs - Math.sqrt(d2);
          if (pen > best) {
            best = pen;
            bi = i;
            bj = j;
          }
        }
      }
      if (bi < 0) continue;
      let nx = this._cx[bi] - o._cx[bj];
      let nz = this._cz[bi] - o._cz[bj];
      const nl = Math.hypot(nx, nz);
      if (nl < 1e-5) {
        nx = dx || 1;
        nz = dz;
        const l2 = Math.hypot(nx, nz) || 1;
        nx /= l2;
        nz /= l2;
      } else {
        nx /= nl;
        nz /= nl;
      }
      const ia = 1 / this.mass;
      const ib = 1 / o.mass;
      const sum = ia + ib;
      // positional separation (mass weighted)
      p.x += nx * best * (ia / sum);
      p.z += nz * best * (ia / sum);
      op.x -= nx * best * (ib / sum);
      op.z -= nz * best * (ib / sum);
      o.asleep = false;
      // velocity impulse + angular kick on both cars
      const va = this.velocity;
      const vb = o.velocity;
      const vrel = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
      if (vrel < 0) {
        const impact = -vrel;
        const e = impact > 3 ? 0.3 : 0.08;
        const j = (-(1 + e) * vrel) / sum;
        va.x += nx * j * ia;
        va.z += nz * j * ia;
        vb.x -= nx * j * ib;
        vb.z -= nz * j * ib;
        const cx = (this._cx[bi] + o._cx[bj]) / 2;
        const cz = (this._cz[bi] + o._cz[bj]) / 2;
        const jx = nx * j;
        const jz = nz * j;
        this.spin += clamp((((cz - p.z) * jx - (cx - p.x) * jz) / m.inertia) * 0.8, -2.5, 2.5);
        o.spin -= clamp((((cz - op.z) * jx - (cx - op.x) * jz) / o.spec.inertia) * 0.8, -2.5, 2.5);
        if (impact > 2.5) {
          this._impact(impact, o);
          o._impact(impact, this);
          const player = this.game.player;
          if (player) {
            const now = this.game.time.elapsed;
            if (this.driver === player && o.ai) o.ai.hitByPlayer = now;
            if (o.driver === player && this.ai) this.ai.hitByPlayer = now;
          }
        }
      }
      o._updateCircles();
      this._updateCircles();
    }
  }

  _collideActors() {
    const game = this.game;
    const actors = game.actors;
    const p = this.position;
    const v = this.velocity;
    const h = this.heading;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const hw0 = this.width / 2;
    const hl0 = this.length / 2;
    const reach = this.radius + 1;
    const now = game.time.elapsed;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (!a || a.vehicle || a.state !== 'active' || a === this.driver) continue;
      const ap = a.position;
      if (ap.y > 1.2 + this.hopY) continue; // jumped onto / over the hood
      const dx = ap.x - p.x;
      const dz = ap.z - p.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      const ar = a.radius || 0.35;
      const lx = dx * rx + dz * rz;
      const lf = dx * fx + dz * fz;
      const hw = hw0 + ar;
      const hl = hl0 + ar;
      if (Math.abs(lx) >= hw || Math.abs(lf) >= hl) continue;
      const penX = hw - Math.abs(lx);
      const penF = hl - Math.abs(lf);
      let nx;
      let nz;
      let pen;
      if (penF < penX) {
        const s = lf >= 0 ? 1 : -1;
        nx = fx * s;
        nz = fz * s;
        pen = penF;
      } else {
        const s = lx >= 0 ? 1 : -1;
        nx = rx * s;
        nz = rz * s;
        pen = penX;
      }
      const av = a.velocity;
      const hitSpeed = v.x * nx + v.z * nz - ((av?.x || 0) * nx + (av?.z || 0) * nz);
      if (hitSpeed > 4 && a.alive) {
        const ud = a.userData || (a.userData = {});
        if (!(ud._carHitBy === this && now - ud._carHitT < 1.0)) {
          ud._carHitBy = this;
          ud._carHitT = now;
          const dmg = clamp((hitSpeed - 3) * 5.5, 6, 100);
          // thrown ahead and off to the side they were on
          const sp = Math.hypot(v.x, v.z) || 1;
          const side = lx >= 0 ? 1 : -1;
          _dir.x = nx * 0.45 + (v.x / sp) * 0.35 + rx * side * 0.55;
          _dir.z = nz * 0.45 + (v.z / sp) * 0.35 + rz * side * 0.55;
          const dl = Math.hypot(_dir.x, _dir.z) || 1;
          const attacker = this.driver && !this.driver.isVirtual ? this.driver : null;
          a.takeDamage?.(dmg, attacker, { x: _dir.x / dl, z: _dir.z / dl }, 2.5 + hitSpeed * 0.85);
          game.events.emit('vehicle:hitActor', { vehicle: this, actor: a, speed: hitSpeed });
          const loss = clamp(90 / this.mass, 0.01, 0.08);
          v.x *= 1 - loss;
          v.z *= 1 - loss;
          this.heaveV += 0.6;
          if (this.driver === game.player) game.cameraRig?.shake?.(0.18);
        }
      }
      // push the actor out of the body (slow nudges just move people aside)
      ap.x += nx * (pen + 0.02);
      ap.z += nz * (pen + 0.02);
      game.collision?.resolveCircle(ap, ar, 0.3, 1.6);
    }
  }

  // ------------------------------------------------------------------ rendering
  _render(dt) {
    const fx = this.fx;
    const p = this.position;
    const h = this.heading;
    p.y = this.hopY;
    this.root.rotation.y = h;
    const hopPitch = this.hopY > 0 ? clamp(this.hopY * 0.55, 0, 0.3) : 0;
    this.pivot.rotation.set(this.pitch + hopPitch, 0, this.roll);
    this.pivot.position.y = 0.55 + this.heave;

    const camD2 = fx.distSqToCamera(p.x, p.z);
    if (camD2 < 170 * 170) fx.pushBlob(p.x, 0.04, p.z, h, this.width + 0.5, this.length + 0.5);
    const visible = fx.isVisible(p.x, 1, p.z, this.radius + 1.5);
    if (!visible) {
      this._skidPrev[0] = this._skidPrev[1] = null;
      if (camD2 < 150 * 150 && (!this.asleep || this.totaled)) this._emitSmoke(dt, false);
      return;
    }
    this._pushWheels();
    this._pushLights(camD2);
    if (!this.asleep || this.totaled) this._emitSmoke(dt, camD2 < 90 * 90);
  }

  _pushWheels() {
    const m = this.spec;
    const p = this.position;
    _e.set(0, this.heading, 0, 'YXZ');
    _qc.setFromEuler(_e);
    _v3.set(p.x, this.hopY, p.z);
    _s3.set(1, 1, 1);
    _carM.compose(_v3, _qc, _s3);
    const spin = this.wheelSpin;
    const lockRear = this.controls.handbrake && this.driven;
    for (let i = 0; i < m.wheels.length; i++) {
      const w = m.wheels[i];
      // left wheels are turned 180° so their outer face points out; spin flips with them
      const yaw = (w.front ? -this.steerAngle : 0) + (w.left ? Math.PI : 0);
      const s = !w.front && lockRear ? 0 : w.left ? spin : -spin;
      _e.set(s, yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _v3.set(w.x, w.r, w.z);
      _s3.set(w.w, w.r, w.r);
      _locM.compose(_v3, _q, _s3);
      _wM.multiplyMatrices(_carM, _locM);
      this.fx.pushWheel(_wM, this.wheelStyle);
    }
  }

  /** World position of a model-space point (ignores suspension tilt) into out {x, y, z}. */
  _local(x, y, z, out) {
    const h = this.heading;
    const c = Math.cos(h);
    const s = Math.sin(h);
    const p = this.position;
    out.x = p.x + x * c + z * s;
    out.y = this.hopY + y + this.heave;
    out.z = p.z - x * s + z * c;
    return out;
  }

  _pushLights(camD2) {
    const fx = this.fx;
    const game = this.game;
    const L = this.spec.lights;
    const night = fx.night;
    const alive = this.engineOn && !this.totaled;
    this.lightsOn = alive && (night > 0.22 || fx.gloom > 0.3);
    const h = this.heading;
    const back = h + Math.PI;
    const t = game.time.elapsed;
    const out = _out;
    const glowK = 0.55 + 0.45 * night; // lamps read brighter at night
    // headlights (police wig-wag while the siren runs at night)
    if (this.lightsOn) {
      const wig = this.siren && night > 0.3 ? ((t * 3.2) % 1 < 0.5 ? 0 : 1) : -1;
      const I = 0.3 + 0.95 * night;
      const sz = 0.38 + 0.42 * night;
      for (let i = 0; i < L.head.length; i++) {
        const k = wig < 0 ? 1 : i === wig ? 1.2 : 0.25;
        const q = L.head[i];
        this._local(q[0], q[1], q[2], out);
        fx.pushGlow(out.x, out.y, out.z, sz, sz, 0, h, 1.0 * I * k, 0.94 * I * k, 0.78 * I * k);
      }
      if (night > 0.3 && camD2 < 150 * 150) {
        // light pool on the road ahead
        const n = (night - 0.3) / 0.7;
        const d = this.length / 2 + (this.model === 'bus' ? 6.5 : 5.2);
        this._local(0, 0, -d, out);
        fx.pushGlow(out.x, 0.16, out.z, this.width * 1.25, 6.2, 2, h, 0.3 * n, 0.27 * n, 0.2 * n);
      }
    }
    // taillights: running lamps + brake lamps
    const brake = alive && (this.braking || this.controls.brake > 0.2);
    if (this.lightsOn || brake) {
      const run = this.lightsOn ? 0.32 + 0.25 * night : 0;
      const I = (run + (brake ? 0.95 : 0)) * glowK;
      const sz = 0.26 + (brake ? 0.14 : 0) + 0.12 * night;
      for (const q of L.tail) {
        this._local(q[0], q[1], q[2], out);
        fx.pushGlow(out.x, out.y, out.z, sz, sz, 0, back, 1.0 * I, 0.06 * I, 0.04 * I);
      }
    }
    if (this.reversing && alive) {
      for (const q of L.rev) {
        this._local(q[0], q[1], q[2], out);
        fx.pushGlow(out.x, out.y, out.z, 0.24, 0.24, 0, back, 0.8 * glowK, 0.8 * glowK, 0.75 * glowK);
      }
    }
    // turn signals (AI blinkers)
    if (this.turnSignal && alive && (t * 1.6) % 1 < 0.55) {
      const idx = this.turnSignal < 0 ? 0 : 1;
      const I = 0.85 * glowK;
      let q = L.turnF[idx];
      this._local(q[0], q[1], q[2], out);
      fx.pushGlow(out.x, out.y, out.z, 0.24, 0.24, 0, h, 1.0 * I, 0.5 * I, 0.05 * I);
      q = L.turnR[idx];
      this._local(q[0], q[1], q[2], out);
      fx.pushGlow(out.x, out.y, out.z, 0.24, 0.24, 0, back, 1.0 * I, 0.5 * I, 0.05 * I);
    }
    // police light bar (or dash lights on an unmarked car)
    if (this.siren && this.isPolice && !this.totaled) {
      const ph = (t * 2.4) % 1;
      const redOn = ph < 0.5 && (ph * 6) % 1 < 0.62;
      const blueOn = ph >= 0.5 && (ph * 6) % 1 < 0.62;
      const bar = L.bar || UNMARKED_BAR;
      const big = 0.55 + 0.6 * night;
      if (redOn) {
        const q = bar[0];
        this._local(q[0], q[1], q[2], out);
        fx.pushGlow(out.x, out.y, out.z, big, big, 1, 0, 1.6, 0.1, 0.08);
        if (night > 0.25) fx.pushGlow(out.x, out.y, out.z, 4.5, 4.5, 1, 0, 0.3 * night, 0.02, 0.02);
      }
      if (blueOn) {
        const q = bar[1];
        this._local(q[0], q[1], q[2], out);
        fx.pushGlow(out.x, out.y, out.z, big, big, 1, 0, 0.12, 0.3, 1.8);
        if (night > 0.25) fx.pushGlow(out.x, out.y, out.z, 4.5, 4.5, 1, 0, 0.02, 0.06, 0.36 * night);
      }
    }
  }

  _emitSmoke(dt, near) {
    const fx = this.fx;
    const out = _out;
    const m = this.spec;
    // engine smoke from under the hood when damaged; black when totaled
    let rate = 0;
    let gray = 0.7;
    let size = 1.1;
    if (this.totaled) {
      rate = 9;
      gray = 0.04;
      size = 1.6;
    } else if (this.health < 35) {
      rate = 2.5 + (35 - this.health) * 0.22;
      gray = this.health < 15 ? 0.22 : 0.62;
    }
    if (rate > 0) {
      this._smokeAcc += rate * dt;
      const hoodZ = this.model === 'bus' ? m.length / 2 - 1.2 : -m.length / 2 + 0.9;
      while (this._smokeAcc >= 1) {
        this._smokeAcc -= 1;
        this._local((Math.random() - 0.5) * 0.6, m.height * 0.62, hoodZ + (Math.random() - 0.5) * 0.5, out);
        const vx = this.velocity.x * 0.3 + (Math.random() - 0.5) * 0.6;
        const vz = this.velocity.z * 0.3 + (Math.random() - 0.5) * 0.6;
        fx.emitSmoke(out.x, out.y, out.z, vx, 1.1 + Math.random() * 0.8, vz, size * 0.5, size * 2.4, this.totaled ? 2.8 : 1.9, gray, this.totaled ? 0.85 : 0.6);
      }
    }
    // tire smoke + skid marks from the rear wheels
    const skidding = this.skid > 0.4 && Math.abs(this.speed) + Math.abs(this.lateral) > 2.5 && this.hopY <= 0;
    if (skidding) {
      this._tireSmokeAcc += (8 + 18 * this.skid) * dt;
      while (this._tireSmokeAcc >= 1) {
        this._tireSmokeAcc -= 1;
        const w = m.wheels[2 + (Math.random() < 0.5 ? 0 : 1)];
        this._local(w.x, 0.25, w.z, out);
        fx.emitSmoke(out.x, out.y, out.z, (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 0.35, 1.9, 1.2, 0.92, 0.42 * this.skid);
      }
      const now = this.game.time.elapsed;
      if (near && now - this._skidSoundT > 0.9) {
        this._skidSoundT = now;
        this.game.audio?.play?.('skid', { x: this.position.x, z: this.position.z, volume: clamp(this.skid, 0.3, 1) });
      }
    } else {
      this._tireSmokeAcc = 0;
    }
    if (skidding && near) {
      for (let k = 0; k < 2; k++) {
        const w = m.wheels[2 + k];
        this._local(w.x, 0, w.z, out);
        let prev = this._skidPrev[k];
        if (!prev) {
          this._skidPrev[k] = { x: out.x, z: out.z };
          continue;
        }
        const dx = out.x - prev.x;
        const dz = out.z - prev.z;
        if (dx * dx + dz * dz > 0.36) {
          fx.addSkid(prev.x, prev.z, out.x, out.z, w.w * 0.95);
          prev.x = out.x;
          prev.z = out.z;
        }
      }
    } else {
      this._skidPrev[0] = this._skidPrev[1] = null;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ai = null;
    this.driver = null;
    // body geometry and material are shared caches: never dispose them here
    this.pivot.remove(this.body);
    this.root.remove(this.pivot);
  }
}

// unmarked car: red/blue dash lights behind the windshield
const UNMARKED_BAR = [
  [-0.22, 1.22, -0.55],
  [0.22, 1.22, -0.55],
];
