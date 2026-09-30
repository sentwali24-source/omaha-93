import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDiff } from '../core/math.js';
import { SPAWNS, FREEWAYS } from '../data/map.js';

// GTA-style third-person camera.
//
//   yaw, pitch, distance; target (Vector3, what the camera looks at — game.focus on the title screen)
//   update(dt)       on foot: orbit from input.look, collision pull-in (raycast target → camera, stays
//                    ≥ 0.3 m off walls), auto-recenter behind the player after ~1.5 s of moving
//                    without look input, C taps cycle near/mid/far, holding C looks behind.
//                    In cars: lagging chase cam behind the heading, distance and FOV widen with speed.
//   setAttract(bool) title screen: slow looping flyover through SPAWNS.attract (24th & Lake at street
//                    level → skyline → Old Market → North 30th), lifted over anything solid.
//   snap()           jump to the desired pose next frame (teleports / respawns)
//   shake(amount)    0..1 trauma, decays
//   setOverride({ position, lookAt, fov } | null)   hard camera override (menus, debug line-ups)
//
// yaw uses the actor heading convention (0 = looking north / -Z). Player movement is relative to it.

const LOOK_RATE = 0.0035; // rad per look pixel (sensitivity is applied by Input)
const PITCH_MIN = -0.32;
const PITCH_MAX = 1.2;
const PITCH_DEFAULT = 0.24;
const PRESETS = [3.0, 4.3, 6.4];
const TARGET_H = 1.55;
const WALL_GAP = 0.3;
const BASE_FOV = 62;

const camFilter = (b) => b.tag !== 'tree' && b.tag !== 'prop' && b.tag !== 'water';

export class CameraRig {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.attract = true; // system flag: also update() on the title screen
    this.attractMode = false;
    this.yaw = 0;
    this.pitch = PITCH_DEFAULT;
    this.presetIndex = 1;
    this.distance = PRESETS[1];
    this.target = new THREE.Vector3(150, 0, -560);
    this.override = null;
    this.supportsDebugView = true;

    this._snap = true;
    this._trauma = 0;
    this._shakeT = 0;
    this._lookIdle = 10;
    this._curDist = this.distance;
    this._fov = BASE_FOV;
    this._camHold = 0;
    this._lookBehind = false;
    this._carOffset = 0;
    this._koSpin = 0;
    this._aim = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._camXZ = { x: 0, z: 0 };

    // attract flyover
    this._path = null;
    this._s = 0;
    this._cursor = 0;
    this._lookSm = new THREE.Vector3();
  }

  /** Debug / menu alias (debug.js line-ups set this). */
  get debugView() {
    return this.override;
  }

  set debugView(v) {
    this.override = v || null;
  }

  setOverride(view) {
    this.override = view || null;
  }

  setAttract(on) {
    this.attractMode = !!on;
    this._snap = true;
    if (on) {
      this._s = 0;
      this._cursor = 0;
    } else {
      this._fov = BASE_FOV;
      this._setFov(BASE_FOV);
    }
  }

  snap() {
    this._snap = true;
  }

  shake(amount = 0.3) {
    this._trauma = Math.min(1, this._trauma + Math.max(0, amount));
  }

  onEnterVehicle(v) {
    this._carOffset = 0;
    // start the chase cam from wherever we are looking, it swings behind the car on its own
    if (v) this._lookIdle = 10;
  }

  get touchBonus() {
    return this.game.input?.isTouch ? 0.8 : 0;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const game = this.game;
    const cam = this.camera;
    if (this.override) {
      const v = this.override;
      if (v.position) cam.position.copy(v.position);
      if (v.lookAt) cam.lookAt(v.lookAt);
      if (v.fov && v.fov !== cam.fov) this._setFov(v.fov);
      return;
    }
    if (this.attractMode || !game.player || game.mode !== 'play') {
      this._updateAttract(dt);
      return;
    }
    const player = game.player;
    const input = game.input;

    // C: tap = cycle distance, hold = look behind
    if (input.pressed('camera')) this._camHold = 0.0001;
    if (this._camHold > 0) {
      if (input.held('camera')) {
        this._camHold += dt;
        this._lookBehind = this._camHold > 0.28;
      } else {
        if (this._camHold <= 0.28) this.cycleDistance();
        this._camHold = 0;
        this._lookBehind = false;
      }
    }

    const lx = input.look.dx;
    const ly = input.look.dy;
    const looking = lx !== 0 || ly !== 0;
    if (looking) this._lookIdle = 0;
    else this._lookIdle += dt;

    if (player.vehicle) this._updateCar(dt, player.vehicle, lx, ly, looking);
    else this._updateFoot(dt, player, lx, ly, looking);
  }

  cycleDistance() {
    this.presetIndex = (this.presetIndex + 1) % PRESETS.length;
  }

  _updateFoot(dt, player, lx, ly, looking) {
    const p = player.position;
    const snap = this._snap;
    // target: head height; vertical smoothing keeps jumps from yanking the view
    const tx = p.x;
    const ty = p.y * 0.6 + TARGET_H;
    const tz = p.z;
    if (snap) this._aim.set(tx, ty, tz);
    else {
      this._aim.x = damp(this._aim.x, tx, 22, dt);
      this._aim.y = damp(this._aim.y, ty, 9, dt);
      this._aim.z = damp(this._aim.z, tz, 22, dt);
    }
    this.target.copy(this._aim);

    const down = player.state !== 'active' || !!player.down;
    if (looking) {
      this.yaw -= lx * LOOK_RATE;
      this.pitch = clamp(this.pitch + ly * LOOK_RATE, PITCH_MIN, PITCH_MAX);
    } else if (down) {
      // knocked out / busted: slow crane up and around
      this._koSpin += dt;
      this.yaw += dt * 0.22;
      this.pitch = damp(this.pitch, 0.72, 1.2, dt);
    } else if (player.speed > 0.8 && this._lookIdle > 1.5) {
      // auto-recenter behind the player (not when running toward the camera; weaker when the stick
      // is held sideways so strafing doesn't spin the view)
      const diff = angleDiff(this.yaw, player.heading);
      const mv = this.game.input.move;
      const ml = Math.hypot(mv.x, mv.y) || 1;
      const fwd = Math.max(0, mv.y / ml);
      if (Math.abs(diff) < 2.1 && fwd > 0.2) {
        const k = 1 - Math.exp(-dt * 1.7 * fwd * fwd * Math.min(1, player.speed / 4));
        this.yaw += diff * k;
        this.pitch = damp(this.pitch, PITCH_DEFAULT, 0.9, dt);
      }
    }
    if (snap) {
      this.yaw = player.heading;
      this.pitch = PITCH_DEFAULT;
    }
    const sprint = player._sprinting && player.speed > 5 ? 0.5 : 0;
    const want = (down ? 6.2 : PRESETS[this.presetIndex] + this.touchBonus) + sprint;
    this.distance = snap ? want : damp(this.distance, want, 3, dt);
    // back against a wall: swing toward the most open side instead of staring down at the head
    if (!looking && !this._lookBehind && (snap || this._lookIdle > 0.35)) this._avoidWalls(dt, this.distance, snap);
    const yaw = this.yaw + (this._lookBehind ? Math.PI : 0);
    this._place(dt, yaw, this.pitch, this.distance, snap);
    this._fov = damp(this._fov, BASE_FOV + (sprint ? 4 : 0), 3, dt);
    this._finish(dt);
  }

  _updateCar(dt, v, lx, ly, looking) {
    const snap = this._snap;
    const sp = Math.abs(v.speed || 0);
    const tx = v.position.x;
    const ty = (v.position.y || 0) + 1.35;
    const tz = v.position.z;
    if (snap) this._aim.set(tx, ty, tz);
    else {
      this._aim.x = damp(this._aim.x, tx, 14, dt);
      this._aim.y = damp(this._aim.y, ty, 6, dt);
      this._aim.z = damp(this._aim.z, tz, 14, dt);
    }
    this.target.copy(this._aim);
    if (looking) {
      this._carOffset -= lx * LOOK_RATE;
      this.pitch = clamp(this.pitch + ly * LOOK_RATE, -0.1, 0.9);
    } else if (this._lookIdle > 1.0) {
      this._carOffset = damp(this._carOffset, 0, 2.2, dt);
      this.pitch = damp(this.pitch, 0.23 - Math.min(0.05, sp * 0.002), 1.5, dt);
    }
    const heading = (v.heading || 0) + (this._lookBehind ? Math.PI : 0);
    const want = heading + this._carOffset;
    // lag behind the heading, tighter at speed
    this.yaw = snap ? want : dampAngle(this.yaw, want, looking ? 30 : 2.6 + sp * 0.06, dt);
    if (snap) this.pitch = 0.23;
    const len = v.length || 4.8;
    const dist = len * 1.0 + 2.1 + sp * 0.06 + this.touchBonus + (this.presetIndex - 1) * 1.2;
    this.distance = snap ? dist : damp(this.distance, dist, 2.5, dt);
    this._place(dt, this.yaw, this.pitch, this.distance, snap);
    this._fov = damp(this._fov, BASE_FOV + Math.min(14, sp * 0.45), 2, dt);
    this._finish(dt);
  }

  /** Free distance from the target along (yaw, pitch), capped at dist. */
  _rayDist(yaw, pitch, dist) {
    const col = this.game.collision;
    if (!col) return dist;
    const cp = Math.cos(pitch);
    const t = this._aim;
    const hit = col.raycast(t.x, t.y, t.z, Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp, dist + WALL_GAP, camFilter);
    return hit < Infinity ? Math.max(0, hit - WALL_GAP) : dist;
  }

  _avoidWalls(dt, dist, snap) {
    const here = this._rayDist(this.yaw, this.pitch, dist);
    if (here > dist * 0.55) return;
    let best = 0;
    let bestScore = here;
    for (const off of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 1.9, -1.9]) {
      const d = this._rayDist(this.yaw + off, this.pitch, dist);
      const score = d - Math.abs(off) * 0.35;
      if (score > bestScore + 0.6) {
        bestScore = score;
        best = off;
      }
    }
    if (best) {
      this.yaw += snap ? best : best * (1 - Math.exp(-dt * 2.2));
      return;
    }
    // boxed in on every side (narrow gap between buildings): crane up over the shoulder instead
    for (const pitch of [0.7, 1.05]) {
      if (pitch <= this.pitch + 0.05) continue;
      if (this._rayDist(this.yaw, pitch, dist) > here + 0.8) {
        this.pitch = snap ? pitch : damp(this.pitch, pitch, 2.5, dt);
        return;
      }
    }
  }

  /** Orbit position around the target with wall pull-in. */
  _place(dt, yaw, pitch, dist, snap) {
    const game = this.game;
    const col = game.collision;
    const cp = Math.cos(pitch);
    const dir = this._dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    const t = this._aim;
    let allowed = dist;
    if (col) {
      const hit = col.raycast(t.x, t.y, t.z, dir.x, dir.y, dir.z, dist + WALL_GAP, camFilter);
      if (hit < Infinity) allowed = Math.max(0.35, hit - WALL_GAP);
    }
    // pull in instantly (never see through walls), ease back out
    if (snap || allowed < this._curDist) this._curDist = allowed;
    else this._curDist = damp(this._curDist, allowed, 3.2, dt);
    const d = this._curDist;
    const pos = this._pos.set(t.x + dir.x * d, t.y + dir.y * d, t.z + dir.z * d);
    // tight spot: lift a little so the player doesn't fill the screen
    if (d < dist * 0.6) pos.y += (1 - d / (dist * 0.6)) * 0.45;
    if (pos.y < 0.35) pos.y = 0.35;
    // keep the lens off walls sideways too
    if (col) {
      const xz = this._camXZ;
      xz.x = pos.x;
      xz.z = pos.z;
      col.resolveCircle(xz, 0.22, pos.y - 0.2, pos.y + 0.2);
      pos.x = xz.x;
      pos.z = xz.z;
    }
  }

  _finish(dt) {
    const cam = this.camera;
    const pos = this._pos;
    cam.position.copy(pos);
    // shake: trauma² scaled smooth noise, decays over ~0.6 s
    this._shakeT += dt;
    let roll = 0;
    if (this._trauma > 0.001) {
      const s = this._trauma * this._trauma;
      const t = this._shakeT * 32;
      cam.position.x += (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * s * 0.09;
      cam.position.y += (Math.sin(t * 1.37 + 1.2) + Math.sin(t * 3.1) * 0.5) * s * 0.07;
      cam.position.z += (Math.sin(t * 0.97 + 2.4) + Math.sin(t * 2.3) * 0.5) * s * 0.09;
      roll = Math.sin(t * 0.83) * s * 0.035;
      this._trauma = Math.max(0, this._trauma - dt * 1.8);
    }
    cam.lookAt(this._aim);
    if (roll) cam.rotateZ(roll);
    if (Math.abs(cam.fov - this._fov) > 0.05) this._setFov(this._fov);
    this._snap = false;
  }

  _setFov(f) {
    this.camera.fov = f;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- attract flyover
  _buildAttractPath() {
    const A = SPAWNS.attract || [];
    const lake24 = A[0] || { x: 150, z: -560 };
    const dt = A[1] || { x: 360, z: 90 };
    const om = A[2] || { x: 510, z: 200 };
    const n30 = A[3] || { x: -40, z: -450 };
    // Street-level legs fly over street centerlines (24th x = 140, Lake z = -570, Farnam z = 120,
    // Howard z = 230, 30th x = -40); the rest is high enough, and _lift() adds clearance anyway.
    const x24 = 140;
    const zl = -570;
    const x30 = -40;
    // [x, y, z, lookX, lookY, lookZ, speed m/s]
    const K = [
      [x24, 7.5, zl + 12, x24, 5, zl + 120, 6],
      [x24, 8, zl + 65, x24 + 5, 7, zl + 170, 6.5],
      [x24, 12, zl + 125, x24 + 30, 16, zl + 270, 8],
      [x24 + 8, 30, zl + 175, dt.x - 60, 40, dt.z - 150, 11],
      [x24 + 30, 60, -300, dt.x, 55, dt.z - 50, 14],
      [x24 + 65, 80, -170, dt.x, 55, dt.z - 30, 15],
      [225, 84, -60, dt.x + 20, 50, dt.z - 40, 14],
      [232, 70, 60, dt.x + 60, 40, dt.z + 20, 13],
      [270, 48, 118, dt.x + 60, 35, 125, 12],
      [350, 44, 120, om.x - 30, 25, 140, 11],
      [430, 38, 122, om.x - 10, 18, om.z - 20, 10],
      [468, 24, 165, om.x - 10, 10, om.z + 30, 8],
      [472, 15, 212, om.x + 30, 8, om.z + 32, 7],
      [505, 12, 229, om.x + 70, 8, om.z + 32, 6.5],
      [548, 13, 230, om.x + 130, 10, om.z + 15, 7],
      [605, 32, 205, dt.x + 20, 45, dt.z - 30, 10],
      [650, 70, 100, dt.x - 10, 50, dt.z - 70, 14],
      [560, 110, -170, n30.x + 240, 20, n30.z + 50, 22],
      [330, 110, -330, n30.x + 40, 10, n30.z + 20, 22],
      [130, 70, -350, x30, 8, n30.z + 30, 16],
      [10, 30, -345, x30, 6, n30.z, 11],
      [x30, 9, -380, x30, 6, n30.z - 50, 7],
      [x30, 8, -470, x30, 6, zl - 10, 6.5],
      [x30, 8.5, zl + 30, x30 + 60, 6, zl - 5, 6.5],
      [x30 + 35, 9, zl, x24 - 20, 12, zl, 7],
      [80, 8, zl, x24, 8, zl - 5, 6.5],
      [125, 7.5, zl - 1, x24 + 10, 6, zl + 30, 6],
    ];
    const pts = K.map((k) => new THREE.Vector3(k[0], k[1], k[2]));
    const looks = K.map((k) => new THREE.Vector3(k[3], k[4], k[5]));
    const path = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const lookPath = new THREE.CatmullRomCurve3(looks, true, 'centripetal');
    // arc-length samples with speed and a minimum safe height per sample
    const N = 900;
    const u = new Float32Array(N + 1);
    const s = new Float32Array(N + 1);
    const speed = new Float32Array(N + 1);
    const lift = new Float32Array(N + 1);
    const base = new Float32Array(N + 1);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    path.getPoint(0, a);
    let total = 0;
    const nk = K.length;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      path.getPoint(t, b);
      if (i > 0) total += a.distanceTo(b);
      u[i] = t;
      s[i] = total;
      const f = t * nk;
      const k0 = Math.floor(f) % nk;
      const k1 = (k0 + 1) % nk;
      const w = f - Math.floor(f);
      speed[i] = K[k0][6] + (K[k1][6] - K[k0][6]) * w;
      base[i] = b.y;
      lift[i] = Math.max(b.y, this._clearance(b.x, b.z));
      a.copy(b);
    }
    // limit climb/descent slope (rises before obstacles, eases down after), twice around the loop
    const slope = 0.4;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) lift[i] = Math.max(lift[i], lift[i + 1] - slope * (s[i + 1] - s[i]));
      lift[N] = Math.max(lift[N], lift[0]);
      for (let i = 1; i <= N; i++) lift[i] = Math.max(lift[i], lift[i - 1] - slope * (s[i] - s[i - 1]));
      lift[0] = Math.max(lift[0], lift[N]);
    }
    this._path = { path, lookPath, u, s, speed, lift, base, total, N };
  }

  /** Lowest safe camera height at (x, z): tallest solid thing nearby + clearance. */
  _clearance(x, z) {
    let need = 0;
    const col = this.game.collision;
    if (col) {
      const r = 8;
      const boxes = col.query(x - r, z - r, x + r, z + r);
      for (let i = 0; i < boxes.length; i++) {
        const bx = boxes[i];
        if (bx.tag === 'bounds' || bx.tag === 'water') continue;
        const cx = x < bx.minX ? bx.minX : x > bx.maxX ? bx.maxX : x;
        const cz = z < bx.minZ ? bx.minZ : z > bx.maxZ ? bx.maxZ : z;
        const d = Math.hypot(x - cx, z - cz);
        const reach = bx.tag === 'tree' ? 8 : 6;
        if (d > reach) continue;
        need = Math.max(need, bx.maxY + (bx.tag === 'tree' ? 3 : 5));
      }
    }
    // elevated freeway decks have no colliders: pass well over them (cobra-head light poles and
    // guide-sign gantries stand ~11 m above the deck)
    for (const f of FREEWAYS) {
      const c = f.corridor;
      if (x > c.x0 - 8 && x < c.x1 + 8 && z > c.z0 - 8 && z < c.z1 + 8) need = Math.max(need, (f.deckY || 8) + 14);
    }
    return need;
  }

  _updateAttract(dt) {
    if (!this._path) this._buildAttractPath();
    const P = this._path;
    const cam = this.camera;
    // advance along the arc length at the local speed
    let i = this._cursor;
    const sp = P.speed[i] + (P.speed[Math.min(P.N, i + 1)] - P.speed[i]) * 0.5;
    this._s += sp * dt;
    if (this._s >= P.total) {
      this._s -= P.total;
      i = 0;
    }
    while (i < P.N - 1 && P.s[i + 1] < this._s) i++;
    this._cursor = i;
    const seg = Math.max(1e-6, P.s[i + 1] - P.s[i]);
    const w = clamp((this._s - P.s[i]) / seg, 0, 1);
    const u = P.u[i] + (P.u[i + 1] - P.u[i]) * w;
    const pos = P.path.getPoint(u, this._tmp);
    const liftY = P.lift[i] + (P.lift[i + 1] - P.lift[i]) * w;
    const baseY = P.base[i] + (P.base[i + 1] - P.base[i]) * w;
    const extra = Math.max(0, liftY - baseY);
    pos.y = Math.max(pos.y, liftY);
    const look = P.lookPath.getPoint(u, this._tmp2);
    look.y += extra * 0.6;
    if (this._snap) this._lookSm.copy(look);
    else {
      this._lookSm.x = damp(this._lookSm.x, look.x, 1.6, dt);
      this._lookSm.y = damp(this._lookSm.y, look.y, 1.6, dt);
      this._lookSm.z = damp(this._lookSm.z, look.z, 1.6, dt);
    }
    cam.position.copy(pos);
    cam.lookAt(this._lookSm);
    if (Math.abs(cam.fov - 55) > 0.05) this._setFov(55);
    // focus for spawners: a ground point ahead of the lens
    const fx = this._lookSm.x - pos.x;
    const fz = this._lookSm.z - pos.z;
    const fl = Math.hypot(fx, fz) || 1;
    this.target.set(pos.x + (fx / fl) * 35, 0, pos.z + (fz / fl) * 35);
    this.yaw = Math.atan2(-fx, -fz);
    this._snap = false;
  }

  /** Debug: camera state. */
  info() {
    const c = this.camera.position;
    return { yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), distance: +this._curDist.toFixed(2), preset: this.presetIndex, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), fov: +this.camera.fov.toFixed(1), attract: this.attractMode, s: this._path ? +this._s.toFixed(1) : 0, total: this._path ? +this._path.total.toFixed(0) : 0 };
  }
}
