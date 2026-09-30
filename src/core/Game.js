import * as THREE from 'three';
import { EventBus } from './events.js';
import { Input } from './input.js';
import { Interactions } from './Interactions.js';
import { createRng } from './rng.js';
import { loadSettings, saveSettings, loadGame, saveGame } from './save.js';
import { CollisionWorld } from '../world/Collision.js';
import { Layout } from '../world/layout.js';
import { City } from '../world/City.js';
import { Environment } from '../world/Environment.js';
import { Player } from '../entities/Player.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Combat } from '../systems/Combat.js';
import { Traffic } from '../systems/Traffic.js';
import { Pedestrians } from '../systems/Pedestrians.js';
import { Gangs } from '../systems/Gangs.js';
import { Police } from '../systems/Police.js';
import { Tagging } from '../systems/Tagging.js';
import { Missions } from '../systems/Missions.js';
import { Shops } from '../systems/Shops.js';
import { Audio } from '../audio/Audio.js';
import { HUD } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { MapScreen } from '../ui/MapScreen.js';
import { Touch } from '../ui/Touch.js';
import { SETS, SIDES, TURF_ZONES, rankForRep, setById } from '../data/sets.js';
import { SPAWNS } from '../data/map.js';

// Per-quality budgets. Systems read game.quality.* instead of hard-coding counts.
export const QUALITY = {
  low: { name: 'low', pixelRatio: 1, antialias: false, shadows: false, shadowSize: 0, far: 560, fogNear: 90, fogFar: 520, maxTraffic: 12, maxParked: 24, maxPeds: 16, maxGang: 14, detail: 0 },
  medium: { name: 'medium', pixelRatio: 1.5, antialias: true, shadows: true, shadowSize: 1024, far: 850, fogNear: 140, fogFar: 800, maxTraffic: 20, maxParked: 40, maxPeds: 26, maxGang: 22, detail: 1 },
  high: { name: 'high', pixelRatio: 2, antialias: true, shadows: true, shadowSize: 2048, far: 1300, fogNear: 220, fogFar: 1250, maxTraffic: 28, maxParked: 60, maxPeds: 36, maxGang: 30, detail: 2 },
};

// Update order. `attract` systems also run behind the title menu; `always` run even when paused.
const ORDER = [
  'player', 'traffic', 'pedestrians', 'gangs', 'police', 'vehicles', 'combat',
  'tagging', 'missions', 'shops', 'interactions', 'camera', 'environment', 'city',
  'audio', 'hud', 'map', 'touch', 'menu',
];

const HOURS_PER_SECOND = 1 / 90; // one in-game hour every 90 real seconds

export function newGameState({ name, side, setId, look }) {
  const turf = {};
  for (const z of TURF_ZONES) turf[z.id] = { owner: z.owner, control: z.owner ? 70 : 0 };
  return {
    version: 1,
    player: { name: name || 'Lil Homie', side, setId, look: look || {} },
    cash: 60,
    rep: 0,
    health: 100,
    wearingColors: true,
    clock: { hour: 18.25, day: 1 },
    position: null, // {x, z, heading} — null = set hood spawn
    turf,
    missions: { completed: [], counter: 0 },
    stats: { fightsWon: 0, kos: 0, tags: 0, carsJacked: 0, busted: 0, knockedOut: 0, missions: 0, distance: 0 },
    flags: {},
  };
}

export class Game {
  constructor({ canvas, uiRoot, params }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.params = params; // URLSearchParams
    this.debug = params.has('debug');
    this.events = new EventBus();
    this.settings = loadSettings();
    if (params.get('quality') && QUALITY[params.get('quality')]) this.settings.quality = params.get('quality');
    this.quality = QUALITY[this.settings.quality] || QUALITY.medium;
    this.seed = Number(params.get('seed')) || 1993;
    this.rng = createRng(this.seed);
    this.mode = 'boot'; // 'boot' | 'attract' | 'play'
    this.paused = false;
    this.time = { elapsed: 0, dt: 0, frame: 0 };
    this.clock = { hour: Number(params.get('hour')) || 19.1, day: 1 };
    this.actors = [];
    this.vehicles = [];
    this.systems = {};
    this.player = null;
    this.state = null;
    this.perf = { fps: 0, frameMs: 0, calls: 0, triangles: 0, _acc: 0, _frames: 0 };
    this._respawnTimer = null;
    this._autosave = 0;
  }

  // ---------------------------------------------------------------- boot
  async boot(onProgress = () => {}) {
    const q = this.quality;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, q.far);
    this.camera.position.set(0, 60, 120);
    this.scene.add(this.camera);

    this.input = new Input(this, this.canvas);
    this.interactions = new Interactions(this);
    this.collision = new CollisionWorld(24);

    onProgress(0.05, 'Laying out the streets');
    this.layout = new Layout(this);
    await tick();

    onProgress(0.1, 'Building the city');
    this.city = new City(this);
    await this.city.build((p, label) => onProgress(0.1 + p * 0.6, label));

    onProgress(0.72, 'Setting the sun');
    this.environment = new Environment(this);

    onProgress(0.8, 'Waking up the neighborhood');
    this.audio = new Audio(this);
    this.cameraRig = new CameraRig(this);
    this.combat = new Combat(this);
    this.traffic = new Traffic(this);
    this.pedestrians = new Pedestrians(this);
    this.gangs = new Gangs(this);
    this.police = new Police(this);
    this.tagging = new Tagging(this);
    this.missions = new Missions(this);
    this.shops = new Shops(this);
    this.hud = new HUD(this);
    this.mapScreen = new MapScreen(this);
    this.touch = new Touch(this);
    this.menu = new Menu(this);

    const vehicles = {
      attract: true,
      update: (dt) => {
        const list = this.vehicles;
        for (let i = 0; i < list.length; i++) list[i].update(dt);
      },
    };
    const interactions = { update: (dt) => this.interactions.update(dt) };

    this.systems = {
      player: null,
      traffic: this.traffic,
      pedestrians: this.pedestrians,
      gangs: this.gangs,
      police: this.police,
      vehicles,
      combat: this.combat,
      tagging: this.tagging,
      missions: this.missions,
      shops: this.shops,
      interactions,
      camera: this.cameraRig,
      environment: this.environment,
      city: this.city,
      audio: this.audio,
      hud: this.hud,
      map: this.mapScreen,
      touch: this.touch,
      menu: this.menu,
    };

    for (const name of ORDER) {
      const s = this.systems[name];
      if (s && s.init) {
        try {
          await s.init();
        } catch (err) {
          console.error(`[game] ${name}.init failed`, err);
        }
      }
    }

    this.events.on('actor:ko', ({ target }) => {
      if (target === this.player) this._scheduleRespawn('ko');
    });
    this.events.on('player:busted', () => this._scheduleRespawn('busted'));

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') {
        this.save();
        if (!this.paused) this.menu.showPause?.();
      }
    });
    this.resize();

    onProgress(1, 'Ready');
    this.mode = 'attract';
    this.cameraRig.setAttract?.(true);
    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());

    if (this.debug) {
      window.__game = this;
      this.debugApi = createDebugApi(this);
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.events.emit('resize', { width: w, height: h });
  }

  applySettings(partial = {}) {
    Object.assign(this.settings, partial);
    saveSettings(this.settings);
    if (partial.quality && QUALITY[partial.quality]) {
      this.quality = QUALITY[partial.quality];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
      this.renderer.shadowMap.enabled = this.quality.shadows;
      this.camera.far = this.quality.far;
      this.camera.updateProjectionMatrix();
      this.resize();
    }
    this.events.emit('settings:change', this.settings);
  }

  // ---------------------------------------------------------------- game lifecycle
  startNewGame(config) {
    this.state = newGameState(config);
    this._beginPlay(true);
  }

  continueGame() {
    const saved = loadGame();
    if (!saved) return false;
    const fresh = newGameState(saved.player);
    this.state = { ...fresh, ...saved, stats: { ...fresh.stats, ...saved.stats }, turf: { ...fresh.turf, ...saved.turf } };
    this._beginPlay(false);
    return true;
  }

  _beginPlay(isNew) {
    const st = this.state;
    // a KO / bust from the previous session must not respawn (and charge) the new one
    this._respawnTimer = null;
    this._autosave = 0;
    this.clock.hour = st.clock?.hour ?? 18.25;
    this.clock.day = st.clock?.day ?? 1;
    const spawn = st.position || this.hoodSpawn();
    this.player = new Player(this, {
      x: spawn.x,
      z: spawn.z,
      heading: spawn.heading || 0,
      side: st.player.side,
      setId: st.player.setId,
      look: st.player.look,
      name: st.player.name,
    });
    this.player.health = Math.max(30, st.health || 100);
    this.addActor(this.player);
    this.systems.player = this.player;
    this.mode = 'play';
    this.paused = false;
    this.cameraRig.setAttract?.(false);
    this.cameraRig.snap?.();
    for (const name of ORDER) {
      const s = this.systems[name];
      if (s && s !== this.player && s.onGameStart) {
        try {
          s.onGameStart(isNew);
        } catch (err) {
          console.error(`[game] ${name}.onGameStart failed`, err);
        }
      }
    }
    this.events.emit('game:start', { isNew });
    this.save();
  }

  quitToTitle() {
    this.save();
    for (const name of ORDER) {
      const s = this.systems[name];
      if (s && s !== this.player && s.onGameEnd) {
        try {
          s.onGameEnd();
        } catch (err) {
          console.error(`[game] ${name}.onGameEnd failed`, err);
        }
      }
    }
    if (this.player) {
      if (this.player.vehicle) this.player.exitVehicle?.(true);
      this.player.remove();
    }
    this.player = null;
    this.systems.player = null;
    this._respawnTimer = null;
    this.mode = 'attract';
    this.paused = false;
    this.input.exitPointerLock();
    this.cameraRig.setAttract?.(true);
    this.events.emit('game:end', {});
    this.menu.showTitle?.();
  }

  setPaused(paused) {
    if (this.mode !== 'play') return;
    this.paused = paused;
    this.input.enabled = !paused;
    if (paused) this.input.exitPointerLock();
    this.events.emit(paused ? 'game:pause' : 'game:resume', {});
  }

  save() {
    if (this.mode !== 'play' || !this.state || !this.player) return false;
    const st = this.state;
    const p = this.player;
    st.clock = { hour: this.clock.hour, day: this.clock.day };
    st.health = p.health;
    if (!p.vehicle && p.alive) st.position = { x: p.position.x, z: p.position.z, heading: p.heading };
    for (const name of ORDER) {
      const s = this.systems[name];
      if (s && s.serialize) {
        try {
          s.serialize(st);
        } catch (err) {
          console.error(`[game] ${name}.serialize failed`, err);
        }
      }
    }
    return saveGame(st);
  }

  // ---------------------------------------------------------------- player helpers
  get playerSet() {
    return this.state ? setById(this.state.player.setId) : null;
  }

  get playerSide() {
    return this.state ? SIDES[this.state.player.side] : null;
  }

  /** Spawn point at the player's set hood. */
  hoodSpawn(setId = this.state?.player.setId) {
    const set = setById(setId) || SETS[0];
    return { x: set.hood.x, z: set.hood.z, heading: set.hood.heading || 0 };
  }

  addCash(amount, reason = '') {
    if (!this.state) return;
    this.state.cash = Math.max(0, Math.round(this.state.cash + amount));
    this.events.emit('cash:change', { amount, total: this.state.cash, reason });
  }

  addRep(amount, reason = '') {
    if (!this.state) return;
    const before = rankForRep(this.state.rep);
    this.state.rep = Math.max(0, Math.round(this.state.rep + amount));
    const after = rankForRep(this.state.rep);
    this.events.emit('rep:change', { amount, total: this.state.rep, rank: after, reason });
    if (after.index > before.index) this.events.emit('rank:up', { rank: after });
  }

  /** The point AI systems spawn around: the player, or the attract camera target. */
  get focus() {
    if (this.player) return this.player.vehicle ? this.player.vehicle.position : this.player.position;
    return this.cameraRig?.target || this.camera.position;
  }

  _scheduleRespawn(reason) {
    if (this._respawnTimer != null) return;
    this._respawnTimer = { reason, t: reason === 'busted' ? 3.2 : 3.6 };
    this.events.emit('player:down', { reason });
  }

  respawnPlayer(reason) {
    const p = this.player;
    if (!p) return;
    if (p.vehicle) p.exitVehicle?.(true);
    let spawn;
    if (reason === 'busted') {
      spawn = SPAWNS.jail;
      const fine = Math.min(this.state.cash, 100 + Math.round(this.state.cash * 0.1));
      this.addCash(-fine, 'bail');
      this.state.stats.busted++;
    } else {
      spawn = this.hoodSpawn();
      const lost = Math.round(this.state.cash * 0.1);
      this.addCash(-lost, 'hospital');
      this.state.stats.knockedOut++;
    }
    p.respawn?.(spawn.x, spawn.z, spawn.heading || 0);
    this.cameraRig.snap?.();
    for (const name of ORDER) {
      const s = this.systems[name];
      if (s && s !== p && s.onPlayerRespawn) {
        try {
          s.onPlayerRespawn(reason);
        } catch (err) {
          console.error(`[game] ${name}.onPlayerRespawn failed`, err);
        }
      }
    }
    this.events.emit('player:respawn', { reason });
    this.save();
  }

  // ---------------------------------------------------------------- entities
  addActor(actor) {
    this.actors.push(actor);
    this.scene.add(actor.root);
    return actor;
  }

  removeActor(actor) {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
    if (actor.root.parent) actor.root.parent.remove(actor.root);
  }

  addVehicle(v) {
    this.vehicles.push(v);
    this.scene.add(v.root);
    return v;
  }

  removeVehicle(v) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    if (v.root.parent) v.root.parent.remove(v.root);
    v.dispose?.();
  }

  /** Actors within radius of (x, z), optional filter. */
  actorsNear(x, z, radius, filter = null) {
    const out = [];
    const r2 = radius * radius;
    for (const a of this.actors) {
      if (a.state === 'removed') continue;
      const dx = a.position.x - x;
      const dz = a.position.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (filter && !filter(a)) continue;
      out.push(a);
    }
    return out;
  }

  vehiclesNear(x, z, radius, filter = null) {
    const out = [];
    const r2 = radius * radius;
    for (const v of this.vehicles) {
      const dx = v.position.x - x;
      const dz = v.position.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (filter && !filter(v)) continue;
      out.push(v);
    }
    return out;
  }

  // ---------------------------------------------------------------- loop
  _frame() {
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    this.time.dt = dt;
    this.time.frame++;

    const input = this.input;
    input.beginFrame();

    if (this.mode === 'play') {
      if (input.pressedAlways('pause')) {
        if (this.mapScreen.open) this.mapScreen.close?.();
        else if (this.paused) this.menu.hidePause?.();
        else this.menu.showPause?.();
      } else if (input.pressedAlways('map') && !this.menu.pauseOpen) {
        this.mapScreen.toggle?.();
      }
    }

    const playing = this.mode === 'play' && !this.paused;
    if (playing) {
      this.time.elapsed += dt;
      this.clock.hour += dt * HOURS_PER_SECOND;
      if (this.clock.hour >= 24) {
        this.clock.hour -= 24;
        this.clock.day++;
      }
      if (this._respawnTimer) {
        this._respawnTimer.t -= dt;
        if (this._respawnTimer.t <= 0) {
          const { reason } = this._respawnTimer;
          this._respawnTimer = null;
          this.respawnPlayer(reason);
        }
      }
      this._autosave += dt;
      if (this._autosave > 45) {
        this._autosave = 0;
        this.save();
      }
    } else if (this.mode === 'attract') {
      this.time.elapsed += dt;
      this.clock.hour += dt * HOURS_PER_SECOND * 0.25;
      if (this.clock.hour >= 24) this.clock.hour -= 24;
    }

    for (let i = 0; i < ORDER.length; i++) {
      const s = this.systems[ORDER[i]];
      if (!s || !s.update) continue;
      if (playing || s.always || (this.mode === 'attract' && s.attract)) {
        try {
          s.update(dt);
        } catch (err) {
          if (!s._errored) console.error(`[game] ${ORDER[i]}.update threw`, err);
          s._errored = true;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
    input.endFrame();

    const perf = this.perf;
    perf._acc += dt;
    perf._frames++;
    if (perf._acc >= 1) {
      perf.fps = Math.round(perf._frames / perf._acc);
      perf.frameMs = +((perf._acc / perf._frames) * 1000).toFixed(1);
      perf.calls = this.renderer.info.render.calls;
      perf.triangles = this.renderer.info.render.triangles;
      perf._acc = 0;
      perf._frames = 0;
    }
  }
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

// Test/debug helpers, available as window.__game.debugApi when the URL has ?debug
function createDebugApi(game) {
  return {
    teleport(x, z) {
      const p = game.player;
      if (!p) return;
      if (p.vehicle) {
        p.vehicle.position.set(x, 0, z);
      } else {
        p.position.set(x, 0, z);
      }
      game.cameraRig.snap?.();
    },
    setHour(h) {
      game.clock.hour = h;
    },
    give(cash = 1000, rep = 0) {
      game.addCash(cash, 'debug');
      if (rep) game.addRep(rep, 'debug');
    },
    heat(level) {
      game.police?.setHeat?.(level);
    },
    state: () => game.state,
    perf: () => ({ ...game.perf }),
    counts: () => ({
      actors: game.actors.length,
      vehicles: game.vehicles.length,
      byKind: game.actors.reduce((m, a) => ((m[a.kind] = (m[a.kind] || 0) + 1), m), {}),
    }),
  };
}
