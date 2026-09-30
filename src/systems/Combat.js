import { Fx } from './fx.js';
import { setCharacterGround } from '../entities/Character.js';
import { installCharacterDebug } from '../entities/character/debug.js';

// Melee combat for everyone who can throw hands (player, homies, gang members, cops).
//
//   combat.melee(attacker, { damage = 10, range = 1.5, arc = 0.6π, knockback = 3, delay = 0.12,
//                            multi = false, anim = null })
//       schedules a hit that resolves `delay` seconds later against the best target in front
//       (or every target in the arc with multi). anim: optional one-shot to play on the attacker.
//   combat.update(dt)  resolves pending hits; applies & decays actor.velocity for NPCs; advances
//       koTime; revives NPCs 15–25 s after a KO unless actor.brain?.noRevive; runs hit FX.
//   combat.fx          pooled sparks / flashes / dust (systems/fx.js), usable by other systems.
//
// Emits through Actor: actor:hit / actor:ko. Emits 'fight:won' { target } when a kind 'gang' actor
// is KO'd by the player or a homie (attacker.userData.homie === true); counts state.stats.kos
// (player KOs) and state.stats.fightsWon. Vehicles call target.takeDamage directly for run-overs.

const MAX_PENDING = 64;
const STEP = 0.2;

export class Combat {
  constructor(game) {
    this.game = game;
    this.attract = true; // NPCs hit by attract-mode traffic still revive; debug helpers install early
    this.pending = [];
    this._pool = [];
    this.fx = new Fx(game);
    this._debugInstalled = false;
  }

  init() {
    const game = this.game;
    // characters stand on the 0.15 m sidewalks visually (gameplay ground stays flat)
    const layout = game.layout;
    if (layout?.isSidewalk) setCharacterGround((x, z) => (layout.isSidewalk(x, z) ? 0.15 : 0));

    game.events.on('actor:hit', (e) => this._onHit(e));
    game.events.on('actor:ko', (e) => this._onKO(e));
  }

  onGameEnd() {
    for (const h of this.pending) this._pool.push(h);
    this.pending.length = 0;
    this.fx.clear();
  }

  // ---------------------------------------------------------------- API
  melee(attacker, opts = {}) {
    if (!attacker || attacker.state !== 'active') return;
    const { damage = 10, range = 1.5, arc = Math.PI * 0.6, knockback = 3, delay = 0.12, multi = false, anim = null } = opts;
    if (this.pending.length >= MAX_PENDING) return;
    const h = this._pool.pop() || {};
    h.attacker = attacker;
    h.damage = damage;
    h.range = range;
    h.cosHalf = Math.cos(Math.min(Math.PI, arc) / 2);
    h.knockback = knockback;
    h.t = delay;
    h.multi = multi;
    this.pending.push(h);
    if (anim) attacker.character?.playOnce?.(anim);
    const p = attacker.position;
    this.game.audio?.play?.('whoosh', { x: p.x, z: p.z, volume: 0.5, rate: 0.9 + Math.random() * 0.25 });
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const game = this.game;
    if (!this._debugInstalled && game.debugApi) {
      this._debugInstalled = true;
      installCharacterDebug(game);
    }

    // pending hits
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const h = this.pending[i];
      h.t -= dt;
      if (h.t > 0) continue;
      this.pending.splice(i, 1);
      this._resolve(h);
      h.attacker = null;
      this._pool.push(h);
    }

    // knockback, KO timers, revives
    const player = game.player;
    const col = game.collision;
    const actors = game.actors;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.state === 'removed') continue;
      if (a.state === 'ko') {
        const prev = a.koTime;
        a.koTime += dt;
        if (prev < 0.55 && a.koTime >= 0.55 && !a.vehicle) {
          const p = a.position;
          this.fx.dust(p.x, 0.1, p.z, 7, 0.6);
        }
        if (a !== player && !a.brain?.noRevive) {
          const u = a.userData || (a.userData = {});
          if (u.reviveAt == null) u.reviveAt = 15 + Math.random() * 10;
          if (a.koTime >= u.reviveAt) {
            u.reviveAt = null;
            a.revive?.(0.4);
          }
        }
      }
      if (a === player || a.vehicle) continue;
      const v = a.velocity;
      if (Math.abs(v.x) + Math.abs(v.z) < 0.01) {
        v.x = 0;
        v.z = 0;
        continue;
      }
      const p = a.position;
      const mx = v.x * dt;
      const mz = v.z * dt;
      const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / STEP));
      for (let s = 0; s < n; s++) {
        p.x += mx / n;
        p.z += mz / n;
        if (col && col.resolveCircle(p, a.radius || 0.35, p.y + 0.3, p.y + 1.8)) {
          const nx = col.lastNormal.x;
          const nz = col.lastNormal.z;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= vn * nx * 1.3;
            v.z -= vn * nz * 1.3;
          }
        }
      }
      const k = Math.exp(-6 * dt);
      v.x *= k;
      v.z *= k;
    }

    this.fx.update(dt);
  }

  _friendly(a, t) {
    const player = this.game.player;
    const aHomie = a.userData?.homie === true;
    const tHomie = t.userData?.homie === true;
    if (a === player && tHomie) return true;
    if (aHomie && (t === player || tHomie)) return true;
    return false;
  }

  _resolve(h) {
    const game = this.game;
    const a = h.attacker;
    if (!a || a.state !== 'active' || a.vehicle) return;
    const fx = -Math.sin(a.heading);
    const fz = -Math.cos(a.heading);
    const ap = a.position;
    let best = null;
    let bestScore = Infinity;
    let hits = 0;
    const actors = game.actors;
    for (let i = 0; i < actors.length; i++) {
      const t = actors[i];
      if (t === a || t.state !== 'active' || t.vehicle) continue;
      if (this._friendly(a, t)) continue;
      const tp = t.position;
      const dx = tp.x - ap.x;
      const dz = tp.z - ap.z;
      const d = Math.hypot(dx, dz);
      if (d > h.range + (t.radius || 0.35)) continue;
      if (Math.abs(tp.y - ap.y) > 1.2) continue;
      const cos = d > 0.3 ? (dx * fx + dz * fz) / d : 1;
      if (cos < h.cosHalf) continue;
      if (h.multi) {
        this._apply(h, a, t, dx, dz, d);
        hits++;
        continue;
      }
      const score = d + (1 - cos) * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best) {
      const tp = best.position;
      const dx = tp.x - ap.x;
      const dz = tp.z - ap.z;
      this._apply(h, a, best, dx, dz, Math.hypot(dx, dz));
      hits++;
    }
    return hits;
  }

  _apply(h, a, t, dx, dz, d) {
    const dir = this._dir || (this._dir = { x: 0, z: 0 });
    if (d > 1e-3) {
      dir.x = dx / d;
      dir.z = dz / d;
    } else {
      dir.x = -Math.sin(a.heading);
      dir.z = -Math.cos(a.heading);
    }
    t.takeDamage(h.damage, a, dir, h.knockback);
    const tp = t.position;
    const cx = tp.x - dir.x * 0.22;
    const cz = tp.z - dir.z * 0.22;
    const cy = tp.y + (h.knockback >= 5 ? 1.15 : 1.42);
    this.fx.flash(cx, cy, cz, h.knockback >= 5 ? 0.75 : 0.5);
    this.fx.sparks(cx, cy, cz, h.knockback >= 5 ? 12 : 7, '#ffd98a', dir);
    if (h.knockback >= 5) this.fx.dust(tp.x, 0.08, tp.z, 5, 0.3);
    // hit-stop: freeze both animations for a beat
    const stop = h.knockback >= 5 ? 0.09 : 0.055;
    a.character?.hitStop?.(stop);
    t.character?.hitStop?.(stop);
  }

  // ---------------------------------------------------------------- events
  _onHit({ target, attacker, damage }) {
    const game = this.game;
    const player = game.player;
    if (!player) return;
    if (attacker === player) game.cameraRig?.shake?.(Math.min(0.5, 0.12 + (damage || 0) / 60));
    else if (target === player) game.cameraRig?.shake?.(Math.min(0.7, 0.25 + (damage || 0) / 50));
    // run-overs: vehicles call takeDamage with the driver as attacker
    if (attacker?.vehicle && target) {
      const p = target.position;
      this.fx.dust(p.x, 0.1, p.z, 6, 0.4);
      this.fx.flash(p.x, 1.0, p.z, 0.8);
    }
  }

  _onKO({ target, attacker }) {
    const game = this.game;
    const player = game.player;
    if (!target) return;
    const by = attacker || target.lastAttacker;
    const st = game.state;
    if (by && by === player && target !== player && st?.stats) st.stats.kos = (st.stats.kos || 0) + 1;
    if (target.kind === 'gang' && by && (by === player || by.userData?.homie === true)) {
      if (st?.stats) st.stats.fightsWon = (st.stats.fightsWon || 0) + 1;
      game.events.emit('fight:won', { target });
    }
    if (target === player) game.cameraRig?.shake?.(0.6);
    if (target.userData) target.userData.reviveAt = null;
  }
}
