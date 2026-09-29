import * as THREE from 'three';
import { buildGraffitiAtlas, VARIANTS } from './gameplay/graffiti.js';
import { SprayParticles } from './gameplay/spray.js';
import { SETS, SIDES, setById, zoneById, areRivals, sideOfSet, rankForRep } from '../data/sets.js';
import { hash } from '../core/rng.js';
import { headingTo, lerp, clamp } from '../core/math.js';

// Turf tagging (ARCHITECTURE.md §19).
//
//   game.tagging.spots            [{ ...city.tagSpots[i], owner: setId|null, mesh }]
//   game.tagging.ownerOf(spotId)  → setId | null
//   game.tagging.setOwner(spotId, setId|null)          (missions use it to buff / hit walls)
//   game.tagging.spotsInZone(zoneId) / nearestSpot(x, z, filter?) / standPoint(spot)
//
// Every wall piece is a quad in ONE InstancedMesh (one shared material, one draw call) that samples
// a canvas-painted graffiti atlas (gameplay/graffiti.js). One extra instance is the "wet paint"
// overlay, revealed left to right while the player holds "Tag wall".
// Emits 'tag:complete' { spot, setId, prevOwner, byPlayer: true, x, z } when the player finishes a
// piece and 'tag:rival' { spot, setId, prevOwner } when an AI set paints over a wall.

const HOLD_TIME = 2.2;
const REACH = 2.4; // meters in front of the wall where the prompt appears
const FLAG = 'tagging.owners';
const OFFSET = 0.02; // decal offset from the wall (plus polygonOffset)
const RETAG_FAR = 70; // AI sets only repaint walls the player is not standing next to

export class Tagging {
  constructor(game) {
    this.game = game;
    this.spots = [];
    this._byId = new Map();
    this.near = null; // spot currently in reach (not owned by the player's set)
    this.spraying = false;
    this.progress = 0;
    this._iaPos = { x: 0, z: 0 };
    this._label = 'Tag wall';
    this._sprayLoop = null;
    this._retagIn = 40;
    this._enemyHitIn = 240;
    this._emitAcc = 0;
    this._uv = [0, 0, 1, 1];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._from = { x: 0, y: 0, z: 0 };
    this._to = { x: 0, y: 0, z: 0 };
  }

  // ------------------------------------------------------------------ setup
  init() {
    const game = this.game;
    const citySpots = game.city?.tagSpots || [];
    this.usingFallback = citySpots.length === 0;
    const src = this.usingFallback ? generateFallbackSpots(game) : citySpots;
    for (const s of src) {
      const zoneId = s.zoneId ?? game.layout.zoneAt(s.x, s.z)?.id ?? null;
      const spot = {
        ...s,
        zoneId,
        w: s.w || 3.2,
        h: s.h || 1.6,
        y: s.y ?? 1.7,
        owner: zoneById(zoneId)?.owner ?? null,
        variant: hash(s.id) % VARIANTS,
        mesh: null,
        index: this.spots.length,
      };
      this.spots.push(spot);
      this._byId.set(spot.id, spot);
    }
    this._buildMesh();
    this.spray = new SprayParticles(game);
    this._ia = game.interactions.add({
      id: 'tagging',
      position: () => this._iaPos,
      radius: 1.9,
      label: () => this._label,
      holdTime: HOLD_TIME,
      enabled: () => !!this.near,
      priority: 0,
      onInteract: () => this._finishTag(this.near),
      onHoldProgress: (p) => {
        this.progress = p;
      },
    });
  }

  _buildMesh() {
    const game = this.game;
    const low = game.quality.detail === 0;
    this.atlas = buildGraffitiAtlas({ cell: low ? 256 : 512 });
    const tex = new THREE.CanvasTexture(this.atlas.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(low ? 2 : 8, game.renderer.capabilities.getMaxAnisotropy?.() || 1);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture = tex;

    const count = this.spots.length + 1; // + wet-paint overlay
    const geo = new THREE.PlaneGeometry(1, 1);
    this.tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.revealAttr = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    geo.setAttribute('aTile', this.tileAttr);
    geo.setAttribute('aReveal', this.revealAttr);

    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    // paint reads a little brighter than the wall by day (readability), not at night
    this._boost = { value: 0.2 };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTagBoost = this._boost;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aTile;\nattribute float aReveal;\nvarying float vReveal;\nvarying vec2 vLocalUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vLocalUv = uv;\n  vReveal = aReveal;\n  vMapUv = aTile.xy + uv * aTile.zw;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTagBoost;\nvarying float vReveal;\nvarying vec2 vLocalUv;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uTagBoost;')
        .replace(
          '#include <map_fragment>',
          // wet paint appears left to right with a ragged, spray-like edge
          'if (vReveal < 0.999) {\n    float edge = vLocalUv.x + 0.07 * sin(vLocalUv.y * 19.0) + 0.04 * sin(vLocalUv.y * 47.0 + 1.3);\n    if (edge > vReveal * 1.15) discard;\n  }\n  #include <map_fragment>',
        );
    };
    mat.customProgramCacheKey = () => 'tag-decal-v2';
    this.material = mat;

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.name = 'tag-decals';
    mesh.receiveShadow = !!game.quality.shadows;
    mesh.renderOrder = 2;
    this.mesh = mesh;
    for (const spot of this.spots) {
      spot.mesh = mesh;
      this._placeInstance(spot.index, spot, OFFSET);
      this._applyTile(spot.index, spot.owner, spot.variant);
    }
    this.overlayIndex = count - 1;
    this._hideOverlay();
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    game.scene.add(mesh);
  }

  _placeInstance(i, spot, offset) {
    const nx = spot.nx ?? 0;
    const nz = spot.nz ?? 1;
    // fit the 2:1 art inside the wall rect
    const w = Math.min(spot.w, spot.h * 2);
    const h = w / 2;
    this._q.setFromAxisAngle(this._up, Math.atan2(nx, nz));
    this._p.set(spot.x + nx * offset, spot.y, spot.z + nz * offset);
    this._s.set(w, h, 1);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
  }

  _applyTile(i, owner, variant) {
    const a = this.atlas;
    const tile = owner && setById(owner) ? a.tileFor(owner, variant) : a.buffTile(variant);
    const uv = a.uv(tile, this._uv);
    this.tileAttr.setXYZW(i, uv[0], uv[1], uv[2], uv[3]);
    this.tileAttr.needsUpdate = true;
  }

  _hideOverlay() {
    this._m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(this.overlayIndex, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.revealAttr.setX(this.overlayIndex, 0);
    this.revealAttr.needsUpdate = true;
    this._overlaySpot = null;
  }

  // ------------------------------------------------------------------ lifecycle
  onGameStart() {
    const game = this.game;
    const saved = game.state?.flags?.[FLAG] || null;
    for (const spot of this.spots) {
      let owner;
      if (saved && Object.prototype.hasOwnProperty.call(saved, spot.id)) owner = saved[spot.id];
      else owner = this._zoneOwner(spot.zoneId);
      spot.owner = owner && setById(owner) ? owner : null;
      this._applyTile(spot.index, spot.owner, spot.variant);
    }
    this._retagIn = 40 + Math.random() * 30;
    this._enemyHitIn = 200 + Math.random() * 120;
    this._saveOwners();
    this._attachDebug();
  }

  onGameEnd() {
    this._stopSpray();
    this.near = null;
  }

  onPlayerRespawn() {
    this._stopSpray();
  }

  serialize(state) {
    this._saveOwners(state);
  }

  _saveOwners(state = this.game.state) {
    if (!state) return;
    state.flags = state.flags || {};
    const out = {};
    for (const s of this.spots) out[s.id] = s.owner;
    state.flags[FLAG] = out;
  }

  _zoneOwner(zoneId) {
    if (!zoneId) return null;
    const g = this.game.gangs;
    const o = g?.getZoneOwner ? g.getZoneOwner(zoneId) : this.game.state?.turf?.[zoneId]?.owner;
    return o === undefined ? zoneById(zoneId)?.owner ?? null : o;
  }

  // ------------------------------------------------------------------ API
  ownerOf(spotId) {
    return this._byId.get(spotId)?.owner ?? null;
  }

  spotById(spotId) {
    return this._byId.get(spotId) || null;
  }

  spotsInZone(zoneId) {
    return this.spots.filter((s) => s.zoneId === zoneId);
  }

  nearestSpot(x, z, filter = null) {
    let best = null;
    let bd = Infinity;
    for (const s of this.spots) {
      if (filter && !filter(s)) continue;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Repaint a wall without any rewards (missions, AI sets, save sync). */
  setOwner(spotId, setId, { silent = true } = {}) {
    const spot = this._byId.get(spotId);
    if (!spot) return false;
    const prevOwner = spot.owner;
    spot.owner = setId && setById(setId) ? setId : null;
    this._applyTile(spot.index, spot.owner, spot.variant);
    this._saveOwners();
    if (!silent && spot.owner) this.game.events.emit('tag:rival', { spot, setId: spot.owner, prevOwner });
    return true;
  }

  /** Point in front of a spot where a character stands to paint it. */
  standPoint(spot, out = { x: 0, z: 0 }) {
    out.x = spot.x + (spot.nx ?? 0) * 1.0;
    out.z = spot.z + (spot.nz ?? 1) * 1.0;
    return out;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const game = this.game;
    const player = game.player;
    const playerSet = game.state?.player?.setId;
    this.spray.update(dt);
    this._boost.value = 0.04 + 0.2 * (1 - (game.environment?.night || 0));
    if (!player || !playerSet) return;

    // which wall is in reach? (closest point on the wall segment, player in front of it)
    this.near = null;
    if (!player.vehicle && player.alive) {
      const px = player.position.x;
      const pz = player.position.z;
      let bestD = REACH;
      for (let i = 0; i < this.spots.length; i++) {
        const s = this.spots[i];
        if (s.owner === playerSet) continue;
        const dx = px - s.x;
        const dz = pz - s.z;
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
        const nx = s.nx ?? 0;
        const nz = s.nz ?? 1;
        const perp = dx * nx + dz * nz;
        if (perp < 0.1 || perp > REACH) continue;
        const along = clamp(dx * -nz + dz * nx, -s.w * 0.4, s.w * 0.4);
        const ax = s.x - nz * along;
        const az = s.z + nx * along;
        const d = Math.hypot(px - ax, pz - az);
        if (d < bestD) {
          bestD = d;
          this.near = s;
          this._iaPos.x = ax + nx * 0.7;
          this._iaPos.z = az + nz * 0.7;
        }
      }
    }
    if (this.near) {
      const o = this.near.owner ? setById(this.near.owner) : null;
      this._label = o ? `Tag over ${o.short}` : 'Tag wall';
    }

    // spraying = holding interact on our prompt
    const cur = game.interactions.current;
    const holding = !!this.near && !!cur && cur.id === 'tagging' && game.input.held('interact');
    if (holding) this._spray(dt, this.near);
    else if (this.spraying) this._stopSpray();

    this._aiRetag(dt, playerSet);
  }

  _spray(dt, spot) {
    const game = this.game;
    const player = game.player;
    const setId = game.state.player.setId;
    if (!this.spraying || this._overlaySpot !== spot) {
      this.spraying = true;
      this._overlaySpot = spot;
      this._placeInstance(this.overlayIndex, spot, OFFSET * 1.6);
      this._applyTile(this.overlayIndex, setId, spot.variant);
      this.mesh.instanceMatrix.needsUpdate = true;
      if (!this._sprayLoop) this._sprayLoop = game.audio?.loop?.('spray', { x: spot.x, z: spot.z, volume: 0.8 }) || null;
    }
    const p = clamp(game.interactions.progress || this.progress, 0, 1);
    this.revealAttr.setX(this.overlayIndex, Math.max(0.02, p));
    this.revealAttr.needsUpdate = true;

    // face the wall, shake the can
    const nx = spot.nx ?? 0;
    const nz = spot.nz ?? 1;
    player.faceHeading?.(headingTo(-nx, -nz));
    player.character?.setAnim?.('spray');

    // mist from the nozzle to the wet edge of the piece
    const w = Math.min(spot.w, spot.h * 2);
    // the art's left edge is on the +tangent side (tangent = (-nz, nx)), reveal runs left → right
    const along = lerp(w * 0.45, -w * 0.45, p);
    const h = player.heading;
    const f = this._from;
    f.x = player.position.x - Math.sin(h) * 0.45 + Math.cos(h) * 0.22;
    f.y = player.position.y + 1.45;
    f.z = player.position.z - Math.cos(h) * 0.45 - Math.sin(h) * 0.22;
    const t = this._to;
    t.x = spot.x - nz * along + nx * 0.05;
    t.y = spot.y + Math.sin(game.time.elapsed * 14) * w * 0.14;
    t.z = spot.z + nx * along + nz * 0.05;
    this._emitAcc += dt * 70;
    const n = Math.floor(this._emitAcc);
    if (n > 0) {
      this._emitAcc -= n;
      const side = SIDES[game.state.player.side];
      this.spray.emit(f, t, Math.random() < 0.5 ? side?.light || '#ffffff' : side?.color || '#ffffff', Math.min(n, 6));
    }
    this._sprayLoop?.setPosition?.(spot.x, spot.z);
  }

  _stopSpray() {
    if (this._sprayLoop) {
      try {
        this._sprayLoop.stop();
      } catch {
        /* ignore */
      }
      this._sprayLoop = null;
    }
    if (this.spraying) {
      this.spraying = false;
      this.game.player?.character?.setAnim?.('idle');
    }
    if (this.mesh && this._overlaySpot) this._hideOverlay();
  }

  _finishTag(spot) {
    const game = this.game;
    if (!spot || !game.state) return;
    const setId = game.state.player.setId;
    const prevOwner = spot.owner;
    this._stopSpray();
    spot.owner = setId;
    this._applyTile(spot.index, setId, spot.variant);
    this._saveOwners();
    game.state.stats.tags = (game.state.stats.tags || 0) + 1;
    game.audio?.play?.('tag_done', { x: spot.x, z: spot.z });
    game.player?.character?.playOnce?.('sign');
    game.events.emit('tag:complete', { spot, setId, prevOwner, byPlayer: true, x: spot.x, z: spot.z });
    if (spot.zoneId) game.gangs?.addInfluence?.(spot.zoneId, setId, 12);
    game.police?.reportCrime?.('tag', { x: spot.x, z: spot.z, severity: 1 });
    this.near = null;
  }

  // Rival sets slowly take their walls back in zones they own; now and then an enemy set
  // hits a wall in the player's own turf (the player has to go cover it back up).
  _aiRetag(dt, playerSet) {
    const game = this.game;
    this._retagIn -= dt;
    if (this._retagIn <= 0) {
      this._retagIn = 45 + Math.random() * 60;
      const p = game.focus;
      const cands = [];
      for (const s of this.spots) {
        const zo = this._zoneOwner(s.zoneId);
        if (!zo || zo === playerSet || s.owner === zo) continue;
        if ((s.x - p.x) ** 2 + (s.z - p.z) ** 2 < RETAG_FAR * RETAG_FAR) continue;
        cands.push([s, zo]);
      }
      if (cands.length) {
        const [s, zo] = cands[Math.floor(Math.random() * cands.length)];
        const wasPlayer = s.owner === playerSet;
        this.setOwner(s.id, zo, { silent: false });
        if (wasPlayer) game.gangs?.addInfluence?.(s.zoneId, zo, 8);
      }
    }

    this._enemyHitIn -= dt;
    if (this._enemyHitIn <= 0) {
      this._enemyHitIn = 200 + Math.random() * 160;
      if (rankForRep(game.state?.rep || 0).index < 1 || game.missions?.active) return;
      const mySide = sideOfSet(playerSet);
      const p = game.focus;
      const far2 = RETAG_FAR * RETAG_FAR;
      const mine = this.spots.filter((s) => s.owner === playerSet && this._zoneOwner(s.zoneId) === playerSet && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 > far2);
      const hitAlready = this.spots.filter((s) => this._zoneOwner(s.zoneId) === playerSet && s.owner && areRivals(s.owner, playerSet)).length;
      if (!mine.length || hitAlready >= 2) return;
      const s = mine[Math.floor(Math.random() * mine.length)];
      // the enemy set whose hood is closest to that wall does it
      let enemy = null;
      let bd = Infinity;
      for (const e of SETS) {
        if (e.side === mySide) continue;
        const d = (e.hood.x - s.x) ** 2 + (e.hood.z - s.z) ** 2;
        if (d < bd) {
          bd = d;
          enemy = e;
        }
      }
      if (!enemy) return;
      this.setOwner(s.id, enemy.id, { silent: false });
      const where = game.layout.describe(s.x, s.z).street || 'the block';
      game.hud?.toast?.(`${enemy.short} hit one of our walls on ${where}`, { color: SIDES[enemy.side].color, duration: 5 });
    }
  }

  // ------------------------------------------------------------------ debug
  _attachDebug() {
    const game = this.game;
    const api = game.debugApi;
    if (!api || api.tagging) return;
    api.tagging = {
      spots: () => this.spots.map((s) => ({ id: s.id, x: +s.x.toFixed(1), z: +s.z.toFixed(1), zoneId: s.zoneId, owner: s.owner })),
      near: () => (this.near ? this.near.id : null),
      /** Teleport in front of a spot (defaults to the nearest one not owned by the player's set). */
      goto: (id) => {
        const set = game.state?.player?.setId;
        const p = game.player.position;
        const s = id ? this._byId.get(id) : this.nearestSpot(p.x, p.z, (q) => q.owner !== set);
        if (!s) return null;
        const st = this.standPoint(s);
        api.teleport(st.x, st.z);
        game.player.faceHeading?.(headingTo(-(s.nx ?? 0), -(s.nz ?? 1)));
        return s.id;
      },
      finish: (id) => this._finishTag(id ? this._byId.get(id) : this.near),
      setOwner: (id, setId) => this.setOwner(id, setId),
      retagNow: () => {
        this._retagIn = 0;
        this._enemyHitIn = 0;
      },
      fallback: this.usingFallback,
    };
  }
}

// ------------------------------------------------------------------ fallback wall spots
// Only used when the city provides no tagSpots (stub city): raycast from the sidewalk into each
// block and keep flat, tall-enough wall faces, a few per turf zone.
function generateFallbackSpots(game) {
  const L = game.layout;
  const col = game.collision;
  const solid = (b) => b.tag === 'building' || b.tag === 'house' || b.tag === 'landmark';
  const found = [];
  const blocks = [...L.blocks].sort((a, b) => hash(a.id, 'tag') - hash(b.id, 'tag'));
  for (const b of blocks) {
    if (b.water || b.park) continue;
    for (const side of ['n', 's', 'e', 'w']) {
      if (!b.frontage[side]) continue;
      for (const t of [0.33, 0.67]) {
        let sx;
        let sz;
        let dx = 0;
        let dz = 0;
        if (side === 'n') {
          sx = lerp(b.x0, b.x1, t);
          sz = b.z0 - 0.5;
          dz = 1;
        } else if (side === 's') {
          sx = lerp(b.x0, b.x1, t);
          sz = b.z1 + 0.5;
          dz = -1;
        } else if (side === 'w') {
          sx = b.x0 - 0.5;
          sz = lerp(b.z0, b.z1, t);
          dx = 1;
        } else {
          sx = b.x1 + 0.5;
          sz = lerp(b.z0, b.z1, t);
          dx = -1;
        }
        const d = col.raycast(sx, 1.7, sz, dx, 0, dz, 12, solid);
        if (!Number.isFinite(d) || d < 0.3) continue;
        // flat for ±1.6 m along the wall and tall enough for a 1.6 m piece
        const tx = -dz;
        const tz = dx;
        const d1 = col.raycast(sx + tx * 1.6, 1.7, sz + tz * 1.6, dx, 0, dz, 12, solid);
        const d2 = col.raycast(sx - tx * 1.6, 1.7, sz - tz * 1.6, dx, 0, dz, 12, solid);
        const d3 = col.raycast(sx, 2.7, sz, dx, 0, dz, 12, solid);
        if (Math.abs(d1 - d) > 0.05 || Math.abs(d2 - d) > 0.05 || Math.abs(d3 - d) > 0.05) continue;
        const x = sx + dx * d;
        const z = sz + dz * d;
        if (!col.isFree(x - dx * 1.0, z - dz * 1.0, 0.4)) continue;
        const zone = L.zoneAt(x, z);
        found.push({ x, z, nx: -dx, nz: -dz, zoneId: zone?.id || null, district: b.district });
      }
    }
  }
  // spread them out: max per zone, min spacing
  const perZone = new Map();
  const out = [];
  for (const s of found) {
    const zone = zoneById(s.zoneId);
    const cap = !zone ? 2 : zone.noTurf ? (s.zoneId === 'downtown' || s.zoneId === 'oldmarket' ? 6 : 3) : 8;
    const n = perZone.get(s.zoneId) || 0;
    if (n >= cap) continue;
    if (out.some((o) => (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < 22 * 22)) continue;
    perZone.set(s.zoneId, n + 1);
    out.push({ id: `tag-fb-${out.length}`, y: 1.7, w: 3.2, h: 1.6, ...s });
  }
  return out;
}
