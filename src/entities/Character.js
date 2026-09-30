import * as THREE from 'three';
import { buildCharacterGeometry, shoulderPad } from './character/model.js';
import { normalizeLook, lookKey, hashString } from './character/looks.js';
import { NB, PARENT, BONE_NAMES, buildScale, PROP } from './character/rig.js';
import {
  HX, HY, HZ, PROPV, newPose, lerpPose, lerpPoseMasked, poseIdle, poseWalk, poseRun, LOOPS, LOCOMOTION, ONESHOTS, sampleTrack,
} from './character/anims.js';
import { blobLayerFor } from './character/shadow.js';

export { normalizeLook, sideLook, randomLook, OUTFIT_IDS, HAT_IDS, HAIR_STYLES, HAIR_MALE, HAIR_FEMALE, SHOE_STYLES } from './character/looks.js';

// A stylized low-poly early-90s person: ONE SkinnedMesh (one draw call) per character.
//
// new Character(look)   look = { skin, shirt, shirt2, pants, shoes, hat, hatColor, bandana, hair, outfit,
//                                build 0.9..1.15, female, ... } — see character/looks.js for every field
//   .root               THREE.Group, feet at the origin, faces -Z, height ≈ 1.8 × build
//   .setAnim(name)      looping: idle walk run drive sit lean ko dance talk spray crouch (+ fight surrender)
//   .playOnce(name)     one-shot: punch punch2 kick hit getup sign jump cheer point
//   .update(dt, speed)  speed in m/s blends idle → walk → run
//   .setOutfit(partial) re-dress (rebuilds / reuses cached geometry)
//   .setVisible(bool)
//   .dispose()
// Extras: .hitStop(sec) freezes the animation briefly (impact feel), .resetPose() skips blending,
//   .onStep(foot, speed) footstep callback, .stepCount, .steer (-1..1 for the drive pose),
//   .isPlaying(name?), .getBoneWorldPosition(name, target).
//
// Geometry: every body part is merged into one BufferGeometry, rigidly weighted to its bone, with
// outfit colors in vertex colors; geometry is cached by look key and shared. All characters share
// one MeshLambertMaterial. Animation is procedural (character/anims.js).

export const CHARACTER_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
CHARACTER_MATERIAL.name = 'character';

const IDENTITY = new THREE.Matrix4();
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ geometry cache
const cache = new Map(); // key → { geometry, refs }
const idleKeys = []; // unreferenced keys kept for reuse (LRU)
const MAX_IDLE = 40;

function acquireGeometry(look, key) {
  let e = cache.get(key);
  if (!e) {
    e = { geometry: buildCharacterGeometry(look), refs: 0 };
    cache.set(key, e);
  }
  if (e.refs === 0) {
    const i = idleKeys.indexOf(key);
    if (i >= 0) idleKeys.splice(i, 1);
  }
  e.refs++;
  return e.geometry;
}

function releaseGeometry(key) {
  const e = cache.get(key);
  if (!e) return;
  e.refs--;
  if (e.refs > 0) return;
  e.refs = 0;
  idleKeys.push(key);
  while (idleKeys.length > MAX_IDLE) {
    const k = idleKeys.shift();
    const x = cache.get(k);
    if (x && x.refs === 0) {
      x.geometry.dispose();
      cache.delete(k);
    }
  }
}

// ------------------------------------------------------------------ visual ground height
// Characters' gameplay feet are at y = 0; sidewalks are drawn 0.15 m high. A ground function lifts
// the visual mesh onto curbs. Combat installs one from game.layout; override with setCharacterGround.
let groundFn = null;
export function setCharacterGround(fn) {
  groundFn = typeof fn === 'function' ? fn : null;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

let liveCount = 0;

export class Character {
  constructor(look = {}) {
    this.lookInput = { ...look };
    this.look = normalizeLook(this.lookInput);
    this.root = new THREE.Group();
    this.root.name = 'character';

    // skeleton
    this.bones = [];
    for (let i = 0; i < NB; i++) {
      const b = new THREE.Bone();
      b.name = BONE_NAMES[i];
      this.bones.push(b);
      if (PARENT[i] >= 0) this.bones[PARENT[i]].add(b);
    }
    this.skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));
    this._restHips = new THREE.Vector3();
    this._sx = 1;
    this._sy = 1;
    this._applyRig();

    this._key = lookKey(this.look);
    this.mesh = new THREE.SkinnedMesh(acquireGeometry(this.look, this._key), CHARACTER_MATERIAL);
    this.mesh.name = 'character-mesh';
    this.mesh.add(this.bones[0]);
    this.mesh.bind(this.skeleton, IDENTITY);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // generous fixed bounds (covers lying down / arms up) so culling never pops a limb
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);
    this.root.add(this.mesh);

    // animation state
    this.anim = 'idle';
    this.animTime = 0;
    this.time = Math.random() * 100;
    this.seed = (hashString(this._key) % 1000) / 100;
    this.ctx = { seed: this.seed, idle: this.look.idle, steer: 0 };
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.freeze = 0;
    this.xfade = 1;
    this.xfadeDur = 0.25;
    this.oneShot = null;
    this.oneShotName = null;
    this.oneShotT = 0;
    this.oneShotSnapW = 0;
    this._base = newPose();
    this._walk = newPose();
    this._run = newPose();
    this._from = newPose();
    this._os = newPose();
    this._osFrom = newPose();
    this._tmp = newPose();
    this._out = newPose();

    this.stepCount = 0;
    this.onStep = null;
    this._stepIdx = 0;

    this.visible = true;
    this._parent = null;
    this._blob = null;
    this._blobSlot = -1;
    this._ground = 0;
    this._groundTarget = 0;
    this._gx = 1e9;
    this._gz = 1e9;
    this.disposed = false;
    liveCount++;

    this._evaluate(0);
  }

  /** Current steering input for the drive pose (-1..1). */
  get steer() {
    return this.ctx.steer;
  }

  set steer(v) {
    this.ctx.steer = v || 0;
  }

  _applyRig() {
    const L = this.look;
    const { joints, sx, sy } = buildScale(L.build, L.female, shoulderPad(L));
    for (let i = 0; i < NB; i++) {
      const p = PARENT[i];
      const x = joints[i * 3] - (p >= 0 ? joints[p * 3] : 0);
      const y = joints[i * 3 + 1] - (p >= 0 ? joints[p * 3 + 1] : 0);
      const z = joints[i * 3 + 2] - (p >= 0 ? joints[p * 3 + 2] : 0);
      this.bones[i].position.set(x, y, z);
      this.skeleton.boneInverses[i].makeTranslation(-joints[i * 3], -joints[i * 3 + 1], -joints[i * 3 + 2]);
    }
    this._restHips.copy(this.bones[0].position);
    this._sx = sx;
    this._sy = sy;
  }

  // ---------------------------------------------------------------- API
  setAnim(name) {
    if (name === this.anim) return;
    if (ONESHOTS[name]) {
      this.playOnce(name);
      return;
    }
    if (!LOOPS[name] && !LOCOMOTION.has(name)) name = 'idle';
    if (name === this.anim) return;
    const loco = LOCOMOTION.has(name) && LOCOMOTION.has(this.anim);
    const prev = this.anim;
    this.anim = name;
    this.animTime = 0;
    if (!loco) {
      this._from.set(this._out);
      this.xfade = 0;
      this.xfadeDur = name === 'ko' ? 0.3 : prev === 'ko' ? 0.35 : 0.25;
    }
    if (name === 'ko' && this.oneShot && this.oneShotName !== 'hit') this.oneShot = null;
  }

  playOnce(name) {
    const os = ONESHOTS[name];
    if (!os) {
      if (LOOPS[name]) this.setAnim(name);
      return;
    }
    if (this.anim === 'ko' && name !== 'getup' && name !== 'hit') return;
    this._osFrom.set(this._out);
    this.oneShotSnapW = this.oneShot ? 1 : 0;
    this.oneShot = os;
    this.oneShotName = name;
    this.oneShotT = 0;
  }

  /** True while a one-shot (optionally a specific one) is playing. */
  isPlaying(name = null) {
    return !!this.oneShot && (!name || this.oneShotName === name);
  }

  /** Freeze the animation clock for a moment (hit-stop). */
  hitStop(sec = 0.06) {
    this.freeze = Math.max(this.freeze, sec);
  }

  /** Jump straight to the current loop's pose (after teleports / respawns). */
  resetPose() {
    this.xfade = 1;
    this.oneShot = null;
    this.oneShotName = null;
    this._evaluate(0);
  }

  /** Replace the whole look (setOutfit merges into the current one). */
  setLook(look = {}) {
    this.lookInput = {};
    this.setOutfit(look);
  }

  setOutfit(partial = {}) {
    Object.assign(this.lookInput, partial);
    const next = normalizeLook(this.lookInput);
    const key = lookKey(next);
    const prev = this.look;
    this.look = next;
    this.ctx.idle = next.idle;
    if (key === this._key) return;
    if (next.build !== prev.build || next.female !== prev.female || shoulderPad(next) !== shoulderPad(prev)) this._applyRig();
    const g = acquireGeometry(next, key);
    releaseGeometry(this._key);
    this._key = key;
    this.mesh.geometry = g;
  }

  setVisible(v) {
    this.visible = !!v;
    this.root.visible = this.visible;
    if (!this.visible && this._blob && this._blobSlot >= 0) this._blob.hide(this._blobSlot);
  }

  getBoneWorldPosition(name, target = new THREE.Vector3()) {
    const i = BONE_NAMES.indexOf(name);
    const b = this.bones[i >= 0 ? i : 0];
    b.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(b.matrixWorld);
  }

  update(dt, speed) {
    if (this.disposed) return;
    if (speed === undefined || speed === null || Number.isNaN(speed)) speed = this.anim === 'walk' ? 1.4 : this.anim === 'run' ? 5 : 0;
    this._evaluate(dt, speed);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    liveCount--;
    releaseGeometry(this._key);
    this.skeleton.dispose();
    if (this._blob) this._blob.release(this._blobSlot);
    this._blob = null;
    this._blobSlot = -1;
  }

  /** Debug / perf counters. */
  static stats() {
    let refs = 0;
    for (const e of cache.values()) refs += e.refs;
    return { live: liveCount, geometries: cache.size, idleGeometries: idleKeys.length, refs };
  }

  // ---------------------------------------------------------------- animation
  _evaluate(dt, speed = 0) {
    let adt = dt;
    if (this.freeze > 0) {
      this.freeze -= dt;
      adt = 0;
    }
    this.time += adt;
    this.animTime += adt;
    this.speed = damp(this.speed, Math.max(0, speed), 12, dt);

    const B = this._base;
    if (LOCOMOTION.has(this.anim)) this._locomotion(B, adt);
    else LOOPS[this.anim](B, this.animTime, this.ctx);

    if (this.xfade < 1) {
      this.xfade = Math.min(1, this.xfade + adt / this.xfadeDur);
      lerpPose(B, this._from, B, smooth(this.xfade));
    }

    const out = this._out;
    const os = this.oneShot;
    if (os) {
      this.oneShotT += adt;
      const t = this.oneShotT;
      if (t >= os.dur) {
        this.oneShot = null;
        this.oneShotName = null;
        out.set(B);
      } else {
        sampleTrack(this._os, os, t);
        const wIn = os.fadeIn > 0 ? clamp01(t / os.fadeIn) : 1;
        const wOut = clamp01((os.dur - t) / os.fadeOut);
        const w = smooth(Math.min(wIn, wOut));
        let from = B;
        if (this.oneShotSnapW > 0 && wIn < 1) {
          lerpPose(this._tmp, B, this._osFrom, this.oneShotSnapW * (1 - wIn));
          from = this._tmp;
        }
        lerpPoseMasked(out, from, this._os, w, os.mask);
        out[PROPV] = B[PROPV];
      }
    } else {
      out.set(B);
    }
    this._apply(out);
    this._groundAndBlob(dt);
  }

  _locomotion(P, adt) {
    const v = this.speed;
    const stride = 0.55 + v * 0.2;
    this.phase += adt * Math.PI * 2 * (v / (2 * stride));
    if (this.phase > 1e4) this.phase -= Math.PI * 2 * 1000;
    poseIdle(P, this.time, this.ctx);
    const wWalk = smooth(clamp01((v - 0.08) / 1.0));
    const wRun = smooth(clamp01((v - 2.6) / 2.2));
    if (wWalk > 0) {
      poseWalk(this._walk, this.phase, Math.min(1.25, Math.max(0.35, v / 1.5)), this.ctx);
      lerpPose(P, P, this._walk, wWalk);
    }
    if (wRun > 0) {
      poseRun(this._run, this.phase, Math.min(1.2, Math.max(0.65, v / 6)), this.ctx);
      lerpPose(P, P, this._run, wRun);
    }
    // heel strikes at phase π/2 + kπ
    const idx = Math.floor((this.phase - Math.PI / 2) / Math.PI);
    if (idx !== this._stepIdx) {
      this._stepIdx = idx;
      if (v > 0.35) {
        this.stepCount++;
        if (this.onStep) this.onStep(idx & 1, v);
      }
    }
  }

  _apply(P) {
    const bones = this.bones;
    for (let i = 0; i < NB; i++) bones[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const r = this._restHips;
    bones[0].position.set(r.x + P[HX] * this._sx, r.y + P[HY] * this._sy, r.z + P[HZ] * this._sx);
    const s = P[PROPV] > 0.5 ? 1 : 1e-4;
    bones[PROP].scale.setScalar(s);
  }

  _groundAndBlob(dt) {
    const root = this.root;
    const parent = root.parent;
    if (parent !== this._parent) {
      if (this._blob) this._blob.release(this._blobSlot);
      this._blob = null;
      this._blobSlot = -1;
      this._parent = parent;
      if (parent) {
        this._blob = blobLayerFor(root);
        if (this._blob) this._blobSlot = this._blob.alloc();
      }
    }
    const direct = !!parent && parent.isScene;
    const p = root.position;
    if (direct && groundFn && this.anim !== 'drive') {
      if (Math.abs(p.x - this._gx) + Math.abs(p.z - this._gz) > 0.2) {
        this._gx = p.x;
        this._gz = p.z;
        this._groundTarget = groundFn(p.x, p.z) || 0;
      }
    } else {
      this._groundTarget = 0;
    }
    this._ground = dt > 0 ? damp(this._ground, this._groundTarget, 18, dt) : this._groundTarget;
    this.mesh.position.y = this._ground;

    if (!this._blob || this._blobSlot < 0) return;
    if (!this.visible || !root.visible || this.anim === 'drive') {
      this._blob.hide(this._blobSlot);
      return;
    }
    let x;
    let y;
    let z;
    let h;
    if (direct) {
      x = p.x;
      z = p.z;
      h = p.y;
      y = this._ground + 0.03;
    } else {
      root.getWorldPosition(_v);
      x = _v.x;
      z = _v.z;
      h = 0;
      y = _v.y + 0.03;
    }
    const size = (this.anim === 'ko' ? 1.55 : this.anim === 'sit' ? 1.0 : 0.82) * this._sx * (1 - Math.min(0.55, Math.max(0, h) * 0.4));
    this._blob.set(this._blobSlot, x, y, z, size);
  }
}
