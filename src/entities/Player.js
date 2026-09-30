import * as THREE from 'three';
import { Actor } from './Actor.js';
import { Character, sideLook } from './Character.js';
import { hashString } from './character/looks.js';
import { SKIN_TONES, SIDES, SETS } from '../data/sets.js';
import { clamp, damp, dampAngle, headingTo, angleDiff } from '../core/math.js';

// The player: tight third-person control on foot, a 3-hit combo, and cars.
//
//   player.setId, player.side, player.stamina 0..1
//   player.update(dt)          on foot: camera-relative move (analog walk/jog, sprint on stamina),
//                              jump (clears low fences), combo punches via combat.melee with soft
//                              lock-on, F: enter / carjack the nearest vehicle ≤ 3.5 m, Q: sign,
//                              G: homies. In a vehicle: input → vehicle.controls, F exits when slow.
//   player.enterVehicle(v) / exitVehicle(force = false) / respawn(x, z, heading)
//   player.applyLook(look)     rebuild the character (also on 'player:outfit' { look })
//   player.wearingColors / player.inVehicle / player.attacking / player.grounded
//
// Emits: player:enterVehicle / player:exitVehicle { vehicle }, vehicle:jacked { vehicle, from, by },
// player:sign { setId }, player:homies {}. Counts state.stats.distance (m, on foot + driving) and
// state.stats.carsJacked.

const WALK = 1.75;
const JOG = 4.7;
const SPRINT = 7.6;
const ACCEL = 24;
const DECEL = 32;
const AIR_CONTROL = 0.25;
const JUMP_V = 6.1;
const GRAVITY = 18;
const STEP = 0.18; // max collision substep (m) — smaller than the radius, so no tunneling
const RADIUS = 0.35;
const ENTER_RANGE = 3.5;
const ENTER_TIME = 0.35;
const EXIT_MAX_SPEED = 6;
const LOCK_RANGE = 2.5;

// jab → cross → push kick. chainAt: earliest time the next hit can start; grace: window after the
// hit ends in which a press still continues the combo.
const COMBO = [
  { anim: 'punch', damage: 8, knockback: 2.2, range: 1.45, arc: Math.PI * 0.55, delay: 0.1, chainAt: 0.2, dur: 0.3, grace: 0.32 },
  { anim: 'punch2', damage: 10, knockback: 2.8, range: 1.5, arc: Math.PI * 0.55, delay: 0.11, chainAt: 0.22, dur: 0.34, grace: 0.32 },
  { anim: 'kick', damage: 16, knockback: 7.5, range: 1.75, arc: Math.PI * 0.6, delay: 0.19, chainAt: 99, dur: 0.56, grace: 0 },
];

const _v = new THREE.Vector3();

const SIDE_SHADES = new Set();
for (const s of Object.values(SIDES)) for (const c of [s.color, s.dark, s.light]) SIDE_SHADES.add(c.toLowerCase());
for (const s of SETS) if (s.accent) SIDE_SHADES.add(s.accent.toLowerCase());
const isSideShade = (c) => typeof c === 'string' && SIDE_SHADES.has(c.toLowerCase());

/**
 * Player look = saved look + side colors (or neutral colors when not wearing colors).
 * Colors chosen explicitly in the character creator (Menu) or bought at a clothes store (Shops) are
 * kept, so the game shows exactly what the preview showed; missing colors come from the side palette.
 * When not wearing colors, a look that still carries the rag / side colors falls back to neutrals.
 */
export function resolvePlayerLook(look = {}, side = 'crips', wearingColors = true, seedKey = '') {
  const base = { outfit: 'tee', hat: 'cap', hair: 'fade', skin: SKIN_TONES[3], build: 1, shoeStyle: undefined, ...look };
  const auto = sideLook(base, side, { wearingColors, seed: hashString(String(seedKey)) });
  if (typeof look?.shirt !== 'string') return auto;
  if (!wearingColors) {
    const flagged = (look.bandana && (look.hat !== 'bandana' || isSideShade(look.bandana))) || isSideShade(look.shirt) || isSideShade(look.shirt2) || isSideShade(look.hatColor);
    if (flagged) return { ...auto, pants: look.pants || auto.pants, shoes: look.shoes || auto.shoes };
    return { ...auto, shirt: look.shirt, shirt2: look.shirt2 || auto.shirt2, hatColor: look.hatColor || auto.hatColor, bandana: look.hat === 'bandana' ? look.bandana || null : null };
  }
  return { ...auto, shirt: look.shirt, shirt2: look.shirt2 || auto.shirt2, hatColor: look.hatColor || auto.hatColor, bandana: look.bandana || auto.bandana };
}

export class Player extends Actor {
  constructor(game, { x, z, heading, side, setId, look = {}, name }) {
    const wearing = game.state?.wearingColors !== false;
    const character = new Character(resolvePlayerLook(look, side, wearing, setId));
    super(game, { kind: 'player', faction: setId, side, character, x, z, heading, maxHealth: 100, name, radius: RADIUS });
    this.setId = setId;
    this.stamina = 1;
    this.vy = 0;
    this.grounded = true;
    this.moveHeading = heading;
    this.moveSpeed = 0; // commanded ground speed (m/s)
    this.vel = { x: 0, z: 0 }; // own locomotion velocity (knockback lives in this.velocity)
    this.exhausted = false;
    this._staminaDelay = 0;
    this._sprinting = false;

    // combat
    this.comboStep = -1; // index of the hit in progress, -1 = none
    this.comboT = 0;
    this.comboQueued = false;
    this.attackHeading = heading;
    this.lungeT = 0;
    this.lungeV = 0;
    this.stagger = 0;
    this.inCombat = 0;
    this.signCooldown = 0;

    // vehicles
    this._enter = null; // walk-to-door state
    this.down = null; // 'busted' while waiting for Game's respawn

    this._last = new THREE.Vector3(x, 0, z);
    this._airFrom = 0;

    character.onStep = (foot, speed) => this._onStep(foot, speed);

    const ev = game.events;
    this._offs = [
      ev.on('player:outfit', (e) => this._onOutfit(e)),
      ev.on('player:down', (e) => {
        if (e?.reason === 'busted') {
          this.down = 'busted';
          if (!this.vehicle) this.character.setAnim('surrender');
        }
      }),
      ev.on('actor:hit', (e) => {
        if (e.target !== this) return;
        this.stagger = Math.max(this.stagger, e.damage >= 14 ? 0.42 : 0.26);
        this.inCombat = 5;
        this._endCombo();
      }),
    ];

    this._installDebug();
  }

  // ---------------------------------------------------------------- getters
  get wearingColors() {
    return this.game.state ? this.game.state.wearingColors !== false : true;
  }

  get inVehicle() {
    return !!this.vehicle;
  }

  get attacking() {
    return this.comboStep >= 0;
  }

  // ---------------------------------------------------------------- look
  applyLook(look) {
    const st = this.game.state;
    const base = look || st?.player?.look || {};
    const full = resolvePlayerLook(base, this.side, this.wearingColors, this.setId);
    this.character.setLook ? this.character.setLook(full) : this.character.setOutfit(full);
  }

  _onOutfit(e) {
    const st = this.game.state;
    if (e?.look && st?.player) st.player.look = { ...(st.player.look || {}), ...e.look };
    this.applyLook(st?.player?.look || e?.look);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.signCooldown = Math.max(0, this.signCooldown - dt);
    this.inCombat = Math.max(0, this.inCombat - dt);
    if (this._enter) {
      this._updateEnter(dt);
      return;
    }
    if (this.vehicle) {
      this._updateDriving(dt);
      return;
    }
    if (this.state !== 'active' || this.down) {
      this._updateDown(dt);
      return;
    }
    this._updateOnFoot(dt);
  }

  _updateOnFoot(dt) {
    const game = this.game;
    const input = game.input;
    const p = this.position;
    const yaw = game.cameraRig?.yaw ?? this.heading;

    this.stagger = Math.max(0, this.stagger - dt);
    const canAct = this.stagger <= 0;

    // ---- desired direction (camera relative)
    let mx = input.move.x;
    let my = input.move.y;
    let mag = Math.min(1, Math.hypot(mx, my));
    if (!canAct) mag = 0;
    let dirH = this.moveHeading;
    if (mag > 0.12) {
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      dirH = headingTo(fx * my + rx * mx, fz * my + rz * mx);
    } else {
      mag = 0;
    }

    // ---- speed target: analog walk → jog, sprint on stamina
    let target = 0;
    if (mag > 0) target = mag < 0.55 ? WALK * (0.35 + (mag / 0.55) * 0.65) : WALK + (JOG - WALK) * clamp((mag - 0.55) / 0.35, 0, 1);
    const wantSprint = input.held('sprint') && mag > 0.5 && !this.exhausted && this.grounded;
    this._sprinting = wantSprint && this.comboStep < 0;
    if (this._sprinting) target = SPRINT;
    if (this.comboStep >= 0) target *= 0.18;
    if (this.character.isPlaying('sign')) target *= 0.5;

    // stamina
    if (this._sprinting && this.moveSpeed > 3) {
      this.stamina = Math.max(0, this.stamina - dt * 0.2);
      this._staminaDelay = 0.7;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this._staminaDelay -= dt;
      if (this._staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * (this.exhausted ? 0.18 : 0.26));
      if (this.exhausted && this.stamina > 0.3) this.exhausted = false;
    }

    // ---- turn smoothing + accel / decel (sharp reversals brake first, like a pivot)
    if (this.grounded) {
      if (mag > 0) {
        const diff = Math.abs(angleDiff(this.moveHeading, dirH));
        if (diff > 2.4 && this.moveSpeed > 3.2) target = 0;
        const turnRate = this.moveSpeed > 6 ? 9 : this.moveSpeed > 3 ? 13 : 18;
        this.moveHeading = dampAngle(this.moveHeading, dirH, this.moveSpeed < 0.5 ? 30 : turnRate, dt);
      }
      const rate = target > this.moveSpeed ? ACCEL : DECEL;
      this.moveSpeed += clamp(target - this.moveSpeed, -rate * dt, rate * dt);
      this.vel.x = -Math.sin(this.moveHeading) * this.moveSpeed;
      this.vel.z = -Math.cos(this.moveHeading) * this.moveSpeed;
    } else {
      // limited air control
      const tx = mag > 0 ? -Math.sin(dirH) * Math.max(target, this.moveSpeed) : this.vel.x;
      const tz = mag > 0 ? -Math.cos(dirH) * Math.max(target, this.moveSpeed) : this.vel.z;
      this.vel.x = damp(this.vel.x, tx, 4 * AIR_CONTROL * 4, dt);
      this.vel.z = damp(this.vel.z, tz, 4 * AIR_CONTROL * 4, dt);
      if (mag > 0) this.moveHeading = dampAngle(this.moveHeading, dirH, 6, dt);
    }

    // ---- facing
    if (this.comboStep >= 0) this.faceHeading(dampAngle(this.heading, this.attackHeading, 28, dt));
    else if (this.moveSpeed > 0.05 || mag > 0) this.faceHeading(dampAngle(this.heading, this.moveHeading, 20, dt));

    // ---- jump
    if (canAct && this.grounded && this.comboStep < 0 && input.pressed('jump')) {
      this.vy = JUMP_V;
      this.grounded = false;
      this._airFrom = 0;
      this.character.playOnce('jump');
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      p.y += this.vy * dt;
      if (p.y <= 0) {
        const impact = -this.vy;
        p.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.moveSpeed *= 0.85;
        if (impact > 5) game.combat?.fx?.dust(p.x, 0.06, p.z, 4, 0.25);
        game.audio?.play?.('step', { x: p.x, z: p.z, volume: 0.7 });
      }
    }

    // attack step toward the locked target
    if (this.lungeT > 0) {
      const t = Math.min(dt, this.lungeT);
      this.lungeT -= dt;
      const k = t / (dt || 1);
      this.vel.x += -Math.sin(this.attackHeading) * this.lungeV * k;
      this.vel.z += -Math.cos(this.attackHeading) * this.lungeV * k;
    }

    // ---- integrate with collision (substeps; knockback from actor.velocity)
    this._move(dt);

    // knockback decay (Combat decays NPCs; the player decays its own)
    const k = Math.exp(-6 * dt);
    this.velocity.x *= k;
    this.velocity.z *= k;

    // ---- actions
    this._updateCombat(dt, canAct, mag, dirH);
    if (canAct && this.comboStep < 0 && this.grounded) {
      if (input.pressed('sign') && this.signCooldown <= 0) {
        this.signCooldown = 1.6;
        this.character.playOnce('sign');
        game.events.emit('player:sign', { setId: this.setId });
      }
      if (input.pressed('vehicle')) this._tryEnter();
    }
    if (input.pressed('homies')) game.events.emit('player:homies', {});

    // ---- animation (from actual displacement so running into walls doesn't moonwalk)
    let moved = Math.hypot(p.x - this._last.x, p.z - this._last.z);
    if (moved > 3) moved = 0; // teleported
    const actual = dt > 0 ? moved / dt : 0;
    this.speed = damp(this.speed, Math.min(actual, SPRINT + 2), 14, dt);
    if (this.grounded && game.state?.stats) game.state.stats.distance = (game.state.stats.distance || 0) + moved;
    this._last.copy(p);
    const idleAnim = this.inCombat > 0 && this.speed < 0.6 ? 'fight' : 'idle';
    if (this.character.anim !== idleAnim && (this.character.anim === 'idle' || this.character.anim === 'fight')) this.character.setAnim(idleAnim);
    if (this.character.anim !== 'idle' && this.character.anim !== 'fight') this.character.setAnim('idle');
    this.character.update(dt, this.grounded ? this.speed : Math.min(this.speed, 1));
  }

  _move(dt) {
    const game = this.game;
    const col = game.collision;
    const p = this.position;
    const dx = (this.vel.x + this.velocity.x) * dt;
    const dz = (this.vel.z + this.velocity.z) * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP));
    for (let i = 0; i < n; i++) {
      p.x += dx / n;
      p.z += dz / n;
      if (!col) continue;
      if (col.resolveCircle(p, this.radius, p.y + 0.3, p.y + 1.8)) {
        // slide: drop the velocity component going into the wall (no jitter against it)
        const nx = col.lastNormal.x;
        const nz = col.lastNormal.z;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx;
          this.vel.z -= vn * nz;
        }
        const kn = this.velocity.x * nx + this.velocity.z * nz;
        if (kn < 0) {
          this.velocity.x -= kn * nx;
          this.velocity.z -= kn * nz;
        }
      }
    }
    if (col && n > 0) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp < this.moveSpeed) this.moveSpeed = Math.max(sp, this.moveSpeed * 0.9);
    }
  }

  // ---------------------------------------------------------------- combat
  _updateCombat(dt, canAct, mag, dirH) {
    const input = this.game.input;
    const pressed = canAct && input.pressed('attack');
    if (this.comboStep < 0) {
      if (pressed && this.grounded) this._startHit(0, mag, dirH);
      return;
    }
    const hit = COMBO[this.comboStep];
    this.comboT += dt;
    if (pressed && this.comboT > 0.05) this.comboQueued = true;
    const next = this.comboStep + 1;
    if (this.comboQueued && next < COMBO.length && this.comboT >= hit.chainAt) {
      this._startHit(next, mag, dirH);
      return;
    }
    if (this.comboT > hit.dur + hit.grace) this._endCombo();
  }

  _startHit(step, mag, dirH) {
    const game = this.game;
    const hit = COMBO[step];
    this.comboStep = step;
    this.comboT = 0;
    this.comboQueued = false;
    this.inCombat = 5;
    // soft lock-on: nearest standing actor within 2.5 m in front (of the stick, or of the player)
    const aim = mag > 0 ? dirH : this.heading;
    const target = this._lockTarget(aim);
    const p = this.position;
    if (target) {
      const dx = target.position.x - p.x;
      const dz = target.position.z - p.z;
      this.attackHeading = headingTo(dx, dz);
      this.faceHeading(dampAngle(this.heading, this.attackHeading, 60, 0.05));
      // attack magnet: step in so the hit lands at ~1 m, before the hit resolves
      const d = Math.hypot(dx, dz);
      const gap = Math.max(0, d - 1.0);
      this.lungeT = hit.delay;
      this.lungeV = Math.min(9, gap / hit.delay);
    } else {
      this.attackHeading = aim;
      this.lungeT = hit.delay;
      this.lungeV = 1.2;
    }
    this.moveHeading = this.attackHeading;
    this.character.playOnce(hit.anim);
    game.combat?.melee(this, { damage: hit.damage, range: hit.range, arc: hit.arc, knockback: hit.knockback, delay: hit.delay });
  }

  _lockTarget(aim) {
    const game = this.game;
    const p = this.position;
    const fx = -Math.sin(aim);
    const fz = -Math.cos(aim);
    let best = null;
    let bestScore = Infinity;
    for (const a of game.actors) {
      if (a === this || a.state !== 'active' || a.vehicle || a.userData?.homie) continue;
      const dx = a.position.x - p.x;
      const dz = a.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > LOCK_RANGE || d < 1e-3) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < 0.3) continue; // within ~72° of the aim
      const score = d * (1.6 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  _endCombo() {
    this.comboStep = -1;
    this.comboT = 0;
    this.comboQueued = false;
  }

  _onStep(foot, speed) {
    if (this.vehicle || !this.grounded || this.state !== 'active') return;
    const p = this.position;
    this.game.audio?.play?.('step', { x: p.x, z: p.z, volume: Math.min(1, 0.3 + speed * 0.09), rate: 0.9 + Math.random() * 0.2 });
  }

  // ---------------------------------------------------------------- KO / busted
  _updateDown(dt) {
    const p = this.position;
    if (!this.grounded || p.y > 0) {
      this.vy -= GRAVITY * dt;
      p.y = Math.max(0, p.y + this.vy * dt);
      if (p.y <= 0) {
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.vel.x = damp(this.vel.x, 0, 8, dt);
    this.vel.z = damp(this.vel.z, 0, 8, dt);
    this.moveSpeed = 0;
    this._move(dt);
    const k = Math.exp(-5 * dt);
    this.velocity.x *= k;
    this.velocity.z *= k;
    this._endCombo();
    this.speed = 0;
    this._last.copy(p);
    this.character.update(dt, 0);
  }

  // ---------------------------------------------------------------- vehicles
  _nearestVehicle() {
    const p = this.position;
    let best = null;
    let bestD = ENTER_RANGE;
    for (const v of this.game.vehicles) {
      if (!v || v.health <= 0) continue;
      const d = Math.hypot(v.position.x - p.x, v.position.z - p.z);
      if (d > bestD) continue;
      const occupied = v.driver && v.driver !== this;
      if (occupied && Math.abs(v.speed || 0) > 5) continue; // too fast to grab the door
      bestD = d;
      best = v;
    }
    return best;
  }

  /** Driver-door point (US cars: driver on the left). */
  _doorPoint(v, out = { x: 0, z: 0 }) {
    const h = v.heading || 0;
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const side = (v.width || 1.9) / 2 + 0.38;
    out.x = v.position.x - rx * side + fx * 0.35;
    out.z = v.position.z - rz * side + fz * 0.35;
    return out;
  }

  _tryEnter() {
    const v = this._nearestVehicle();
    if (!v) return false;
    const p = this.position;
    this._enter = { v, t: 0, fx: p.x, fz: p.z, door: { x: 0, z: 0 } };
    this.moveSpeed = 0;
    this.vel.x = this.vel.z = 0;
    this._endCombo();
    return true;
  }

  _updateEnter(dt) {
    const e = this._enter;
    const v = e.v;
    const p = this.position;
    if (!this.game.vehicles.includes(v) || this.state !== 'active') {
      this._enter = null;
      return;
    }
    e.t += dt;
    const k = Math.min(1, e.t / ENTER_TIME);
    const s = k * k * (3 - 2 * k);
    const door = this._doorPoint(v, e.door);
    const ox = p.x;
    const oz = p.z;
    p.x = e.fx + (door.x - e.fx) * s;
    p.z = e.fz + (door.z - e.fz) * s;
    p.y = Math.max(0, p.y - dt * 4);
    const moved = Math.hypot(p.x - ox, p.z - oz);
    if (moved > 1e-4) this.faceHeading(dampAngle(this.heading, headingTo(p.x - ox, p.z - oz), 20, dt));
    if (k > 0.6) this.faceHeading(dampAngle(this.heading, v.heading || 0, 16, dt));
    this.speed = dt > 0 ? moved / dt : 0;
    this.character.update(dt, Math.min(this.speed, 4));
    this._last.copy(p);
    if (k >= 1) {
      this._enter = null;
      this.enterVehicle(v);
    }
  }

  enterVehicle(v) {
    if (!v) return;
    const game = this.game;
    this._enter = null;
    const prev = v.driver;
    if (prev && prev !== this) {
      // carjack: Traffic ejects the NPC driver as a fleeing pedestrian
      game.events.emit('vehicle:jacked', { vehicle: v, from: prev, by: this });
      if (game.state?.stats) game.state.stats.carsJacked = (game.state.stats.carsJacked || 0) + 1;
    }
    game.traffic?.release?.(v);
    v.setDriver?.(this);
    if (!v.setDriver) v.driver = this;
    this.vehicle = v;
    if (v.controls) {
      v.controls.throttle = 0;
      v.controls.steer = 0;
      v.controls.brake = 0;
      v.controls.handbrake = false;
    }
    this._endCombo();
    this.velocity.set(0, 0, 0);
    this.vel.x = this.vel.z = 0;
    this.moveSpeed = 0;
    this.speed = 0;
    this.character.setAnim('drive');
    this.character.setVisible(false);
    this.position.set(v.position.x, 0, v.position.z);
    this._last.copy(this.position);
    game.cameraRig?.onEnterVehicle?.(v);
    game.events.emit('player:enterVehicle', { vehicle: v });
  }

  exitVehicle(force = false) {
    const v = this.vehicle;
    if (!v) return false;
    if (!force && Math.abs(v.speed || 0) > EXIT_MAX_SPEED) return false;
    const game = this.game;
    let exit = null;
    try {
      exit = v.getExitPoint?.();
    } catch {
      exit = null;
    }
    if (!exit) exit = this._doorPoint(v);
    if (v.driver === this) v.setDriver ? v.setDriver(null) : (v.driver = null);
    if (v.controls) {
      v.controls.throttle = 0;
      v.controls.steer = 0;
      v.controls.brake = 0;
      v.controls.handbrake = false;
    }
    this.vehicle = null;
    this.position.set(exit.x, 0, exit.z);
    game.collision?.resolveCircle(this.position, this.radius, 0.3, 1.8);
    this.faceHeading(v.heading || 0);
    this.moveHeading = this.heading;
    this.moveSpeed = 0;
    this.vel.x = this.vel.z = 0;
    this.vy = 0;
    this.grounded = true;
    this._last.copy(this.position);
    this.character.setVisible(true);
    this.character.setAnim(this.down === 'busted' ? 'surrender' : 'idle');
    this.character.resetPose();
    game.events.emit('player:exitVehicle', { vehicle: v });
    return true;
  }

  _updateDriving(dt) {
    const game = this.game;
    const input = game.input;
    const v = this.vehicle;
    if (!game.vehicles.includes(v)) {
      this.exitVehicle(true);
      return;
    }
    const c = v.controls;
    if (c && !this.down) {
      let throttle = input.move.y;
      if (input.lastDevice === 'gamepad' && input.held('sprint')) throttle = Math.max(throttle, 1);
      const sp = v.speed || 0;
      let brake = 0;
      if (throttle < -0.1 && sp > 1) brake = -throttle;
      else if (throttle > 0.1 && sp < -1) brake = throttle;
      c.throttle = throttle;
      c.steer = input.move.x;
      c.brake = brake;
      c.handbrake = input.held('handbrake');
      if (input.pressed('horn')) v.horn?.();
    } else if (c) {
      c.throttle = 0;
      c.steer = 0;
      c.brake = 1;
    }
    const p = this.position;
    const moved = Math.hypot(v.position.x - p.x, v.position.z - p.z);
    if (moved < 50 && game.state?.stats) game.state.stats.distance = (game.state.stats.distance || 0) + moved;
    p.set(v.position.x, 0, v.position.z);
    this.faceHeading(v.heading || 0);
    this._last.copy(p);
    this.speed = Math.abs(v.speed || 0);
    this.character.steer = input.move.x;
    // stamina recovers while driving
    this.stamina = Math.min(1, this.stamina + dt * 0.2);
    if (!this.down && input.pressed('vehicle')) this.exitVehicle();
  }

  // ---------------------------------------------------------------- respawn / cleanup
  respawn(x, z, heading = 0) {
    if (this.vehicle) this.exitVehicle(true);
    this._enter = null;
    this.state = 'active';
    this.health = this.maxHealth;
    this.koTime = 0;
    this.down = null;
    this.stagger = 0;
    this.inCombat = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.velocity.set(0, 0, 0);
    this.vel.x = this.vel.z = 0;
    this.moveSpeed = 0;
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
    this.lastAttacker = null;
    this.aggro.clear();
    this._endCombo();
    this.position.set(x, 0, z);
    this.faceHeading(heading);
    this.moveHeading = heading;
    this._last.copy(this.position);
    this.character.setVisible(true);
    this.character.setAnim('idle');
    this.character.resetPose();
  }

  remove() {
    for (const off of this._offs) off();
    this._offs = [];
    super.remove();
  }

  _installDebug() {
    const api = this.game.debugApi;
    if (!api) return;
    api.player = () => {
      const g = this.game;
      const pl = g.player;
      if (!pl) return null;
      return {
        x: +pl.position.x.toFixed(3),
        y: +pl.position.y.toFixed(3),
        z: +pl.position.z.toFixed(3),
        heading: +pl.heading.toFixed(3),
        speed: +pl.speed.toFixed(2),
        moveSpeed: +pl.moveSpeed.toFixed(2),
        stamina: +pl.stamina.toFixed(2),
        grounded: pl.grounded,
        state: pl.state,
        health: pl.health,
        combo: pl.comboStep,
        anim: pl.character.anim,
        oneShot: pl.character.oneShotName,
        inVehicle: !!pl.vehicle,
        entering: !!pl._enter,
        visible: pl.character.visible,
        down: pl.down,
        distance: +(g.state?.stats?.distance || 0).toFixed(1),
      };
    };
    api.playerWorld = () => this.character.getBoneWorldPosition('head', _v).toArray();
  }
}
