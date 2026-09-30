import * as THREE from 'three';
import { buildLandmarks } from './Landmarks.js';
import { createCityTextures } from './textures.js';
import { Batcher } from './city/batch.js';
import { makeAtlasMaterial } from './city/atlasMaterial.js';
import { CityContext } from './city/context.js';
import { buildGround } from './city/ground.js';
import { buildBlocks } from './city/blocks.js';
import { buildProps } from './city/props.js';
import { Signals } from './city/signals.js';
import { buildHorizon } from './city/horizon.js';
import { prepareNamed, finishCity } from './city/finish.js';
import { smoothstep } from '../core/math.js';

// The generic city of Omaha, summer 1993 (ARCHITECTURE.md §9): ground, streets and sidewalks,
// every non-landmark block (North Omaha houses and commercial strips, Midtown, Downtown, the Old
// Market, North Downtown / East Omaha industry), street furniture, traffic signals, the horizon
// beyond the map edge and the map-bounds colliders. Landmarks / parks / water / freeways are built
// by Landmarks.js inside build().
//
// Rendering: everything static is merged per (spatial chunk, material) by city/batch.js, so the
// city is ~6 draw calls per visible chunk. Walls, roofs, windows, props and trees share ONE atlas
// material (city/atlasMaterial.js) whose emissive atlas holds the lit windows for night.

const CHUNK = 300; // meters per render chunk

// batcher material keys
// (chunk = own finer grid; lod = hidden beyond the quality's detail distance)
const MATS = {
  surface: { tiled: true },
  paint: { tiled: true, renderOrder: 1, chunk: 150, lod: true },
  facade: { tiled: true },
  detail: { tiled: true, chunk: 150, lod: true },
  fence: { tiled: true, chunk: 150, lod: true },
  signs: { tiled: false },
  pool: { tiled: false, renderOrder: 2 },
};
const LOD_DIST = [170, 260, 420]; // by quality.detail

export class City {
  // attract: city updaters (water, fountains, signals) also run behind the title menu
  attract = true;

  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'city';
    game.scene.add(this.group);
    this.tagSpots = [];
    this.pois = [];
    this.parkingSpots = [];
    this.nightMaterials = [];
    this.updaters = [];
    this.signals = null;
    this.stats = null;
    this._night = -1;
  }

  /** Register a per-frame callback (animated water, fountains, blinking lights...). */
  addUpdater(fn) {
    this.updaters.push(fn);
  }

  /**
   * Traffic signal state at an intersection node, or null if it has no signal:
   * { green: 'x' | 'z' | null, phase: 'green' | 'yellow' | 'allred', t: seconds left in phase }.
   * The returned object is reused per node (read it, don't keep it).
   */
  signalAt(nodeId) {
    return this.signals ? this.signals.signalAt(nodeId) : null;
  }

  async build(onProgress = () => {}) {
    const game = this.game;
    const L = game.layout;
    const q = game.quality || { detail: 1 };
    const t0 = performance.now();
    const tick = () => new Promise((r) => setTimeout(r));

    // ---- textures + materials
    onProgress(0.01, 'Painting signs');
    const streetNames = new Set();
    for (const s of L.nsStreets) {
      streetNames.add(L.streetLabel(s, -10).toUpperCase());
      streetNames.add(L.streetLabel(s, 10).toUpperCase());
      if (s.northName) streetNames.add(s.northName.toUpperCase());
    }
    for (const s of L.ewStreets) streetNames.add(s.name.toUpperCase());
    const maxAniso = game.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    const aniso = Math.min(maxAniso, q.detail === 0 ? 2 : q.detail === 1 ? 4 : 8);
    const tex = createCityTextures({ detail: q.detail, anisotropy: aniso, streetNames: [...streetNames], seed: game.seed || 1993 });
    this.textures = tex;
    const T = { textures: Math.round(performance.now() - t0) };
    let tm = performance.now();
    const lap = (k) => {
      const now = performance.now();
      T[k] = Math.round(now - tm);
      tm = now;
    };
    const mats = this._materials(tex);
    this.materials = mats;
    await tick();

    // ---- context + base ground
    const B = L.bounds;
    const batcher = new Batcher({ minX: B.minX - 20, maxX: B.maxX + 20, minZ: B.minZ - 20, maxZ: B.maxZ + 20 }, CHUNK, MATS);
    const C = new CityContext(game, this, batcher, tex);
    this._ctx = C;
    this._baseGround(tex);
    prepareNamed(C);

    // ---- streets
    onProgress(0.08, 'Paving the streets');
    buildGround(C);
    lap('ground');
    await tick();

    // ---- buildings
    onProgress(0.18, 'Building the neighborhoods');
    tm = performance.now();
    await buildBlocks(C, (p) => onProgress(0.18 + p * 0.4, 'Building the neighborhoods'));
    lap('blocks');

    // ---- street furniture + signals
    onProgress(0.6, 'Streetlights and signals');
    await tick();
    buildProps(C);
    this.signals = new Signals(C);
    this.signals.build(this.group);
    finishCity(C);
    lap('props');
    await tick();

    // ---- meshes
    onProgress(0.66, 'Merging geometry');
    tm = performance.now();
    this._flush(batcher, mats, C, q);
    lap('flush');
    await tick();

    // ---- landmarks (LANDMARKS module), then the horizon and the map edge
    tm = performance.now();
    await buildLandmarks(game, this, (p, label) => onProgress(0.7 + p * 0.2, label));
    lap('landmarks');

    onProgress(0.92, 'The horizon');
    await tick();
    tm = performance.now();
    const hb = new Batcher({ minX: B.minX - 800, maxX: B.maxX, minZ: B.minZ - 800, maxZ: B.maxZ + 800 }, 700, MATS);
    C.B = hb;
    C.wireSegs = new Map();
    this.stats = { ...C.stats, horizonHouses: buildHorizon(C, q.detail === 0 ? 480 : 700) };
    this._flush(hb, mats, C, q, true);
    lap('horizon');

    const col = game.collision;
    const t = 5;
    col.addBox(B.minX - t, B.minZ - t, B.maxX + t, B.minZ, 50, -5, 'bounds');
    col.addBox(B.minX - t, B.maxZ, B.maxX + t, B.maxZ + t, 50, -5, 'bounds');
    col.addBox(B.minX - t, B.minZ, B.minX, B.maxZ, 50, -5, 'bounds');
    col.addBox(B.maxX, B.minZ, B.maxX + t, B.maxZ, 50, -5, 'bounds');

    this.stats.buildMs = Math.round(performance.now() - t0);
    this.stats.phases = T;
    this.stats.pois = this.pois.length;
    this.stats.tagSpots = this.tagSpots.length;
    this.stats.parkingSpots = this.parkingSpots.length;
    this._needDebug = !!game.debug;
    this.setNight(0);
    onProgress(1, 'Done');
  }

  _materials(tex) {
    const surface = makeAtlasMaterial({ map: tex.surface, vertexColors: true }, 'surface');
    const paint = makeAtlasMaterial({ map: tex.surface, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }, 'paint');
    const facade = makeAtlasMaterial({ map: tex.facade, emissiveMap: tex.facadeEmissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }, 'facade');
    facade.userData.cityNight = 'windows';
    const fence = makeAtlasMaterial({ map: tex.fence, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }, 'fence');
    const signs = new THREE.MeshLambertMaterial({ map: tex.signs, emissiveMap: tex.signsEmissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true });
    signs.userData.cityNight = 'lamps';
    signs.userData.nightScale = 1.25;
    const pool = new THREE.MeshBasicMaterial({ map: tex.pool, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
    // fog fades additive pools to black (not to the fog colour)
    pool.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  gl_FragColor.rgb *= ( 1.0 - fogFactor );
#endif`,
      );
    };
    pool.customProgramCacheKey = () => 'city-pool';
    this.nightMaterials.push(facade, signs);
    this.poolMat = pool;
    return { surface, paint, facade, detail: facade, fence, signs, pool };
  }

  _baseGround(tex) {
    // huge grass plane under everything west of the river (pushed back in depth so every city
    // surface wins), with coarse vertex-colour patches so the tiling does not read
    const x0 = -1400;
    const x1 = 700;
    const z0 = -2150;
    const z1 = 1250;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 42, 68);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    const rng = this.game.rng.fork ? this.game.rng.fork(77) : this.game.rng;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, x / 9, -z / 9);
      const k = 0.82 + rng.next() * 0.3;
      colors[i * 3] = k * (0.95 + rng.next() * 0.1);
      colors[i * 3 + 1] = k;
      colors[i * 3 + 2] = k * (0.9 + rng.next() * 0.1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshLambertMaterial({ map: tex.ground, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 });
    this._groundMat = mat;
    const m = new THREE.Mesh(g, mat);
    m.name = 'city:base-ground';
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.group.add(m);
  }

  _flush(batcher, mats, C, q, horizon = false) {
    const shadows = !!q.shadows;
    const meshes = batcher.build(mats, { castShadow: shadows && !horizon ? { facade: true } : {} });
    for (const m of meshes) {
      m.updateMatrix();
      if (m.material === mats.pool || m.material === mats.paint) m.receiveShadow = false;
      if (m.userData.lod && !horizon) this._lodAdd(m);
      this.group.add(m);
    }
    // wires: one LineSegments per chunk (LOD-culled like the small props)
    const wireMat = this.wireMat || (this.wireMat = new THREE.LineBasicMaterial({ color: 0x1c1c1e }));
    for (const [, arr] of C.wireSegs) {
      if (!arr.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const l = new THREE.LineSegments(g, wireMat);
      l.name = 'city:wires';
      l.matrixAutoUpdate = false;
      l.updateMatrix();
      if (!horizon) this._lodAdd(l);
      this.group.add(l);
    }
    C.wireSegs = new Map();
  }

  /** Register a mesh for distance culling (small props, paint, fences, wires). */
  _lodAdd(m) {
    if (!this._lod) this._lod = [];
    const bb = m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox);
    this._lod.push({ m, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z });
  }

  /** Distance-cull LOD meshes around the camera (cheap: a few hundred rect tests, 4× a second). */
  _updateLod(dt) {
    if (!this._lod) return;
    this._lodT = (this._lodT || 0) - dt;
    if (this._lodT > 0) return;
    this._lodT = 0.25;
    const cam = this.game.camera.position;
    const d = LOD_DIST[this.game.quality?.detail ?? 1] ?? 260;
    const d2 = d * d;
    const list = this._lod;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const dx = cam.x < e.x0 ? e.x0 - cam.x : cam.x > e.x1 ? cam.x - e.x1 : 0;
      const dz = cam.z < e.z0 ? e.z0 - cam.z : cam.z > e.z1 ? cam.z - e.z1 : 0;
      e.m.visible = dx * dx + dz * dz < d2;
    }
  }

  /** Debug: city colliders inside reserved areas (landmarks, parks, water, freeways) or on streets. */
  _audit() {
    const C = this._ctx;
    const L = this.game.layout;
    const out = { reserved: [], road: [], sidewalk: [], boxes: C?.boxLog?.length || 0 };
    if (!C?.boxLog) return out;
    for (const b of C.boxLog) {
      if (b.tag === 'bounds') continue;
      const sx = b.maxX - b.minX;
      const sz = b.maxZ - b.minZ;
      const m = b.tag === 'prop' ? 0.45 : 0.05; // thin poles may touch a footprint edge
      const r = C.isReserved(b.minX + m, b.minZ + m, b.maxX - m, b.maxZ - m, ['landmark', 'park', 'water', 'freeway'], 0);
      const big = sx > 1.2 || sz > 1.2;
      // low street furniture (signals, signs, hydrants) may stand under a freeway deck
      const underDeck = r?.kind === 'freeway' && b.maxY < 7;
      if (r && !underDeck && (big || r.kind !== 'park')) out.reserved.push({ kind: r.kind, id: r.id, tag: b.tag, maxY: b.maxY, x: +((b.minX + b.maxX) / 2).toFixed(1), z: +((b.minZ + b.maxZ) / 2).toFixed(1), sx: +sx.toFixed(1), sz: +sz.toFixed(1) });
      if (!big) continue;
      // sample the footprint: solid structures should stay off the roadway and the sidewalk
      let road = 0;
      let walk = 0;
      let n = 0;
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const x = b.minX + 0.1 + ((sx - 0.2) * i) / 4;
        const z = b.minZ + 0.1 + ((sz - 0.2) * j) / 4;
        n++;
        if (L.isRoad(x, z)) road++;
        else if (L.isSidewalk(x, z)) walk++;
      }
      const e = { tag: b.tag, x: +((b.minX + b.maxX) / 2).toFixed(1), z: +((b.minZ + b.maxZ) / 2).toFixed(1), sx: +sx.toFixed(1), sz: +sz.toFixed(1), maxY: b.maxY };
      if (road > 2) out.road.push(e);
      else if (walk > n * 0.3) out.sidewalk.push(e);
    }
    return out;
  }

  /**
   * Rain-soaked look (Environment calls this with env.wetness 0..1): asphalt, sidewalks and
   * lawns darken, paint a little less.
   */
  setWetness(w) {
    w = Math.max(0, Math.min(1, w || 0));
    if (Math.abs(w - (this._wet ?? -1)) < 0.01) return;
    this._wet = w;
    const m = this.materials;
    if (!m) return;
    m.surface.color.setScalar(1 - 0.34 * w);
    m.paint.color.setScalar(1 - 0.18 * w);
    this._groundMat?.color.setScalar(1 - 0.2 * w);
  }

  setNight(n) {
    n = Math.max(0, Math.min(1, n || 0));
    if (Math.abs(n - this._night) < 0.003) return;
    this._night = n;
    const win = smoothstep(0.12, 0.7, n);
    const lamps = smoothstep(0.18, 0.45, n);
    for (const m of this.nightMaterials) {
      if (!m || !('emissiveIntensity' in m)) continue;
      const k = m.userData?.cityNight;
      const v = k === 'windows' ? win : k === 'lamps' ? lamps : n;
      m.emissiveIntensity = v * (m.userData?.nightScale ?? 1);
    }
    if (this.poolMat) {
      this.poolMat.opacity = lamps * 0.95;
      this.poolMat.visible = lamps > 0.01;
    }
    this.signals?.setNight(n);
  }

  update(dt) {
    if (this._needDebug && this.game.debugApi) {
      // extra debug helpers (window.__game.debugApi) once Game has created the api
      this._needDebug = false;
      const api = this.game.debugApi;
      api.city = () => ({ ...this.stats, poiTypes: this.pois.reduce((m, p) => ((m[p.type] = (m[p.type] || 0) + 1), m), {}) });
      api.setNight = (v) => this.setNight(v);
      api.signal = (id) => this.signalAt(id);
      api.cityAudit = () => this._audit();
    }
    this.signals?.update(dt);
    this._updateLod(dt);
    for (const fn of this.updaters) fn(dt);
  }
}
