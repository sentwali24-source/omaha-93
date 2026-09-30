import * as THREE from 'three';
import { createRng, hash } from '../core/rng.js';
import { LANDMARKS } from '../data/map.js';
import { Cluster, Builder, roadRects, landParts, tick } from './landmarks/kit.js';
import { buildTextures } from './landmarks/textures.js';
import { buildSignAtlas } from './landmarks/signs.js';
import { buildMaterials, glowMaterial, glowPoints } from './landmarks/materials.js';
import { buildDowntown } from './landmarks/downtown.js';
import { buildLeahyMall } from './landmarks/leahy.js';
import { buildRiverfront } from './landmarks/riverfront.js';
import { buildRiver } from './landmarks/river.js';
import { buildIowa } from './landmarks/iowa.js';
import { buildFreeways } from './landmarks/freeways.js';
import { buildMidtown } from './landmarks/midtown.js';
import { buildNorth } from './landmarks/north.js';
import { buildProjects } from './landmarks/projects.js';
import { buildParks } from './landmarks/parks.js';
import { buildEppley } from './landmarks/eppley.js';

// Landmarks (ARCHITECTURE.md §9a): every LANDMARKS / PARKS / WATER / FREEWAYS entry of
// data/map.js, the Missouri River in flood, the Iowa shore with Council Bluffs and the Loess
// Hills, and the two river bridges. Built once at boot under city.group, with colliders.
//
//   export async function buildLandmarks(game, city, onProgress(p, label))
//
// Each district builder gets a shared context (ctx, see createContext) and writes geometry into
// Clusters (one merged mesh per material per cluster, see landmarks/kit.js). Animation (river,
// fountain, beacons, freeway cars, the Eppley jet, smoke) runs through one city updater.

const STEPS = [
  ['Downtown skyline', buildDowntown],
  ['Gene Leahy Mall', buildLeahyMall],
  ['Riverfront', buildRiverfront],
  ['Missouri River', buildRiver],
  ['Council Bluffs', buildIowa],
  ['Freeways', buildFreeways],
  ['Midtown', buildMidtown],
  ['North 24th Street', buildNorth],
  ['Housing projects', buildProjects],
  ['Parks', buildParks],
  ['Eppley Airfield', buildEppley],
];

export async function buildLandmarks(game, city, onProgress = () => {}) {
  const ctx = createContext(game, city);
  for (let i = 0; i < STEPS.length; i++) {
    const [label, fn] = STEPS[i];
    onProgress(i / STEPS.length, label);
    await tick();
    const t0 = performance.now();
    try {
      await fn(ctx);
    } catch (err) {
      console.error(`[landmarks] ${label} failed`, err);
    }
    ctx.stats.timings[label] = Math.round(performance.now() - t0);
  }
  finish(ctx);
  onProgress(1, 'Landmarks');
  return ctx;
}

const WHITE = new THREE.Color('#ffffff');

function createContext(game, city) {
  const T = buildTextures(game);
  const S = buildSignAtlas(game);
  const M = buildMaterials(game, T, S);
  for (const m of M.nightMaterials) if (!city.nightMaterials.includes(m)) city.nightMaterials.push(m);
  const group = new THREE.Group();
  group.name = 'landmarks';
  city.group.add(group);
  const layout = game.layout;
  const roads = roadRects(layout);
  const byId = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
  const glowData = { pos: [], col: [], size: [] };
  const blinkData = { pos: [], col: [], size: [] };
  const tmp = new THREE.Color();
  const push = (data, x, y, z, color, size) => {
    tmp.set(color);
    data.pos.push(x, y, z);
    data.col.push(tmp.r, tmp.g, tmp.b);
    data.size.push(size);
  };

  const ctx = {
    game,
    city,
    layout,
    col: game.collision,
    group,
    T,
    S,
    M,
    Builder,
    roads,
    detail: game.quality?.detail ?? 1,
    shadows: !!game.quality?.shadows,
    rng: createRng(hash('landmarks', game.seed || 1993)).next,
    stats: { meshes: 0, triangles: 0, timings: {} },
    forceNight: null,
    updaters: [],
    glowData,
    blinkData,
    lm: (id) => byId[id],
    cluster: (name) => new Cluster(ctx, name),
    /** Land (rect minus roads and sidewalks) inside a rect. */
    land: (r) => landParts(roads, r),
    /** Collider shorthand. */
    box: (x0, z0, x1, z1, maxY, tag = 'landmark', minY = 0) => game.collision.addBox(x0, z0, x1, z1, maxY, minY, tag),
    /** Static night glow sprite (lamp heads, floodlights, runway lights). */
    glow: (x, y, z, color, size = 3) => push(glowData, x, y, z, color, size),
    /** Blinking glow (aircraft beacons, barricade lamps). */
    blink: (x, y, z, color = '#ff2a1a', size = 4) => push(blinkData, x, y, z, color, size),
    /** Red aircraft-warning beacon: a small blinking lamp plus a blinking glow. */
    beacon(P, x, y, z, size = 0.8) {
      const b = P.get('beacon');
      const s = size / 2;
      b.quad(x - s, y - s, z + s, x + s, y - s, z + s, x + s, y + s, z + s, x - s, y + s, z + s, WHITE);
      b.quad(x + s, y - s, z + s, x + s, y - s, z - s, x + s, y + s, z - s, x + s, y + s, z + s, WHITE);
      b.quad(x + s, y - s, z - s, x - s, y - s, z - s, x - s, y + s, z - s, x + s, y + s, z - s, WHITE);
      b.quad(x - s, y - s, z - s, x - s, y - s, z + s, x - s, y + s, z + s, x - s, y + s, z - s, WHITE);
      b.quad(x - s, y + s, z + s, x + s, y + s, z + s, x + s, y + s, z - s, x - s, y + s, z - s, WHITE);
      push(blinkData, x, y, z, '#ff2a1a', 8);
    },
    /** Add a point of interest; merges with an existing City POI of the same type and name. */
    poi(p) {
      const full = {
        id: p.id,
        type: p.type,
        name: p.name,
        x: p.x,
        z: p.z,
        heading: p.heading || 0,
        zoneId: layout.zoneAt(p.x, p.z)?.id || null,
        district: layout.districtAt(p.x, p.z)?.id || null,
      };
      if (p.landmark) full.landmark = p.landmark;
      const dup = city.pois.find((q) => q.type === full.type && q.name === full.name && Math.hypot(q.x - full.x, q.z - full.z) < 60);
      if (dup) Object.assign(dup, { x: full.x, z: full.z, heading: full.heading });
      else city.pois.push(full);
      return full;
    },
    /** Taggable wall spot at (x, y, z); (nx, nz) = wall normal, pointing to where the tagger stands. */
    tag(t) {
      city.tagSpots.push({
        id: t.id,
        x: t.x,
        y: t.y ?? 1.6,
        z: t.z,
        nx: t.nx,
        nz: t.nz,
        w: t.w ?? 2.4,
        h: t.h ?? 1.4,
        zoneId: layout.zoneAt(t.x + t.nx * 2, t.z + t.nz * 2)?.id || null,
        district: layout.districtAt(t.x, t.z)?.id || null,
      });
    },
    park: (x, z, heading) => city.parkingSpots.push({ x, z, heading }),
    /** Per-frame animation: fn(dt, state) with state = { night, t }. */
    addUpdater: (fn) => ctx.updaters.push(fn),
  };
  return ctx;
}

/** Night glow sprites, blinking beacons, the per-frame updater and debug helpers. */
function finish(ctx) {
  const { game, city, M, T } = ctx;
  const glowMat = glowMaterial(T.glow, 0);
  const blinkMat = glowMaterial(T.glow, 1);
  let glow = null;
  let blink = null;
  if (ctx.glowData.pos.length) {
    glow = glowPoints(ctx.glowData, glowMat);
    glow.name = 'lm:glow';
    ctx.group.add(glow);
  }
  if (ctx.blinkData.pos.length) {
    blink = glowPoints(ctx.blinkData, blinkMat);
    blink.name = 'lm:blink';
    ctx.group.add(blink);
  }
  const updaters = ctx.updaters;
  const state = { night: 0, t: 0 };
  ctx.state = state;
  let debugHooked = false;

  city.addUpdater((dt) => {
    state.t += dt;
    const night = ctx.forceNight ?? game.environment?.night ?? 0;
    state.night = night;
    // lamp heads and runway lights switch on at dusk; glow sprites fade in with the dark
    M.lights.visible = night > 0.25;
    glowMat.opacity = Math.min(1, Math.max(0, (night - 0.2) / 0.5));
    if (glow) glow.visible = night > 0.2;
    // aircraft beacons: ~1 s on / 1 s off; the glow halo is faint by day
    const on = state.t % 1.8 < 0.9;
    M.beacon.visible = on;
    if (blink) {
      blink.visible = on;
      blinkMat.opacity = 0.3 + 0.7 * Math.min(1, night * 1.5);
    }
    // office towers: people work late, so the skyline windows come on through the evening
    // twilight (and go off at dawn) a little ahead of the general night lighting
    if (ctx.forceNight == null) {
      const h = game.clock?.hour ?? 12;
      const dusk = h > 12 ? smooth(18.9, 20.5, h) : 1 - smooth(5.6, 6.9, h);
      const v = Math.max(night, dusk * 0.42);
      M.office.emissiveIntensity = v;
      M.slab.emissiveIntensity = v;
      M.glass.emissiveIntensity = v;
    }
    // water: the Missouri runs south (+z) fast in flood, still water shimmers, falls pour
    M.water.map.offset.y += dt * 0.022;
    M.water.map.offset.x = Math.sin(state.t * 0.07) * 0.05;
    M.lake.map.offset.x = Math.sin(state.t * 0.21) * 0.06;
    M.lake.map.offset.y = Math.cos(state.t * 0.17) * 0.06;
    M.falls.map.offset.y += dt * 0.9;
    for (let i = 0; i < updaters.length; i++) updaters[i](dt, state);
    if (!debugHooked && game.debugApi) {
      debugHooked = true;
      installDebug(ctx);
    }
  });
}

function installDebug(ctx) {
  const { game, city } = ctx;
  const api = game.debugApi;
  const center = (l) => ({ x: (l.rect.x0 + l.rect.x1) / 2, z: (l.rect.z0 + l.rect.z1) / 2 });
  api.landmarks = {
    stats: () => ({ ...ctx.stats, glow: ctx.glowData.size.length, blink: ctx.blinkData.size.length }),
    list: () => LANDMARKS.map((l) => ({ id: l.id, name: l.name, ...center(l) })),
    /** Force the night look on landmark lights and every city night material (tests only). */
    night(n) {
      ctx.forceNight = n;
      if (n != null) for (const m of city.nightMaterials) m.emissiveIntensity = n;
    },
    /** Put the player just south of a landmark's footprint. */
    goto(id) {
      const l = ctx.lm(id);
      if (!l) return false;
      const c = center(l);
      api.teleport(c.x, l.rect.z1 + 6);
      return true;
    },
    meshes: () => ctx.group.children.map((m) => ({ name: m.name, tris: Math.round((m.geometry?.attributes.position.count || 0) / 3) })),
    /** Freeway deck samples every `step` m: [{ s, x, z, y (deck top), w }]. */
    freeway(step = 6) {
      const F = ctx.freeway;
      if (!F) return [];
      const q = { x: 0, z: 0, dx: 0, dz: 0 };
      const out = [];
      for (let s = 0; s < F.sGround; s += step) {
        F.path.at(s, q);
        out.push({ s, x: q.x, z: q.z, dx: q.dx, dz: q.dz, y: F.yAt(s), w: F.wAt(s) });
      }
      return out;
    },
    /** The Eppley jet: { t, phase, x, y, z }; jet(t) jumps its loop to time t (s). */
    jet(t) {
      if (!ctx.jet) return null;
      if (t != null) ctx.jet.t = t;
      const j = ctx.jet;
      return { t: +j.t.toFixed(1), phase: j.phase, x: +j.x.toFixed(1), y: +j.y.toFixed(1), z: +j.z.toFixed(1) };
    },
  };
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
