import * as THREE from 'three';
import { Actor } from '../Actor.js';
import { Character } from '../Character.js';
import { headingTo } from '../../core/math.js';

// Vehicle / traffic debug helpers, added to game.debugApi (only with ?debug) by Traffic.update:
//   showroom({ x, z, lit })        line up every model on Dodge St, free camera on the row
//   showroomView(view, i)          'front' | 'rear' | 'side' | 'close' (car i) | 'closeRear'
//   freeCam(pos | null, look)      override the camera after the rig ({x,y,z} or [x,y,z])
//   spawnCar(opts)                 traffic.spawnCar
//   driveCar(model, opts)          spawn a car on the nearest lane and put the player in it
//   spawnDummy(x, z)               a standing civilian to run over
//   trafficReport()                stuck / overlapping / off-road diagnostics
//   playerCar()                    state of the player's car
//   hop()                          lowrider hop for the player's car
//   freezeTraffic(bool)            stop spawning/despawning

const SHOWROOM = [
  ['sedan', null],
  ['sedan', 'aero'],
  ['coupe', null],
  ['lowrider', null],
  ['wagon', null],
  ['pickup', null],
  ['hatch', null],
  ['van', null],
  ['police', null],
  ['bus', null],
];

const v3 = (p) => (Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p.x, p.y ?? 0, p.z));

export function installVehicleDebug(game, traffic) {
  const api = game.debugApi;
  if (!api || api.showroom) return;
  let cam = null;
  let show = null;
  const apply = () => {
    if (!cam) return;
    game.camera.position.copy(cam.pos);
    game.camera.lookAt(cam.look);
  };
  // city updaters run after the camera rig every frame (play + attract)
  if (game.city?.addUpdater) game.city.addUpdater(apply);
  else if (game.cameraRig) {
    const orig = game.cameraRig.update.bind(game.cameraRig);
    game.cameraRig.update = (dt) => {
      orig(dt);
      apply();
    };
  }

  api.freeCam = (pos, look) => {
    cam = pos ? { pos: v3(pos), look: v3(look || { x: pos.x ?? pos[0], y: 0, z: (pos.z ?? pos[2]) - 10 }) } : null;
    return !!cam;
  };

  api.freezeTraffic = (on = true) => {
    traffic.frozen = !!on;
    return traffic.frozen;
  };

  api.spawnCar = (opts = {}) => {
    const v = traffic.spawnCar(opts);
    return v ? { uid: v.uid, model: v.model, x: v.position.x, z: v.position.z } : null;
  };

  api.showroom = ({ x = 60, z = 0, lit = false } = {}) => {
    traffic.frozen = true;
    traffic._clearOwn();
    if (show) for (const v of show.cars) game.removeVehicle(v);
    const cars = [];
    let cursor = x;
    for (const [model, variant] of SHOWROOM) {
      const w = model === 'bus' ? 2.55 : 2.0;
      cursor += w / 2 + 2.0;
      const v = traffic.spawnCar({ x: cursor, z, heading: 0, model, variant, owner: 'debug' });
      cursor += w / 2 + 2.0;
      if (lit) v.setDriver(traffic._virtualDriver(v));
      cars.push(v);
    }
    const cx = (x + cursor) / 2;
    show = { cars, x0: x, x1: cursor, cx, z };
    if (game.player) {
      const p = game.player;
      if (p.vehicle) p.exitVehicle?.(true);
      p.position.set(x - 6, 0, z + 11);
    }
    api.showroomView('front');
    return cars.map((v) => ({ model: v.model, variant: v.variant, uid: v.uid }));
  };

  api.showroomView = (view = 'front', i = 0) => {
    if (!show) return false;
    const { cx, z, x0, x1, cars } = show;
    const span = x1 - x0;
    if (view === 'front') api.freeCam({ x: cx, y: 3.2, z: z - span * 0.62 }, { x: cx, y: 0.6, z });
    else if (view === 'rear') api.freeCam({ x: cx, y: 3.2, z: z + span * 0.62 }, { x: cx, y: 0.6, z });
    else if (view === 'side') api.freeCam({ x: x0 - 8, y: 2.4, z: z - 10 }, { x: cx - 4, y: 0.8, z });
    else if (view === 'top') api.freeCam({ x: cx, y: 24, z: z + 8 }, { x: cx, y: 0, z });
    else {
      const v = cars[Math.max(0, Math.min(cars.length - 1, i))];
      const k = v.model === 'bus' ? 2.2 : 1;
      const p = v.position;
      if (view === 'closeRear') api.freeCam({ x: p.x - 3.6 * k, y: 1.9 * k, z: p.z + 5.4 * k }, { x: p.x, y: 0.75 * k, z: p.z });
      else api.freeCam({ x: p.x + 3.6 * k, y: 1.9 * k, z: p.z - 5.4 * k }, { x: p.x, y: 0.75 * k, z: p.z });
    }
    return true;
  };

  api.driveCar = (model = 'coupe', opts = {}) => {
    const p = game.player;
    if (!p) return null;
    if (p.vehicle) p.exitVehicle?.(true);
    const L = game.layout;
    const ne = L.nearestEdge(p.position.x, p.position.z);
    const e = ne.edge;
    const a = L.nodes[e.a];
    const b = L.nodes[e.b];
    const t = Math.max(0.25, Math.min(0.75, ne.t));
    const cx = a.x + (b.x - a.x) * t;
    const cz = a.z + (b.z - a.z) * t;
    const d = L.edgeDir(e, e.a);
    const off = L.laneOffset(e, 0);
    const v = traffic.spawnCar({ x: cx - d.z * off, z: cz + d.x * off, heading: headingTo(d.x, d.z), model, owner: 'debug', ...opts });
    p.position.set(v.position.x, 0, v.position.z);
    p.enterVehicle?.(v);
    game.cameraRig?.snap?.();
    return { uid: v.uid, x: v.position.x, z: v.position.z, heading: v.heading };
  };

  api.playerCar = () => {
    const v = game.player?.vehicle;
    if (!v) return null;
    return {
      model: v.model,
      x: +v.position.x.toFixed(2),
      z: +v.position.z.toFixed(2),
      y: +v.position.y.toFixed(2),
      heading: +v.heading.toFixed(3),
      speed: +v.speed.toFixed(2),
      lateral: +v.lateral.toFixed(2),
      rpm: +v.rpm.toFixed(2),
      gear: v.gear,
      health: +v.health.toFixed(1),
      totaled: v.totaled,
      skid: +v.skid.toFixed(2),
      siren: v.siren,
      hopY: +v.hopY.toFixed(2),
    };
  };

  api.hop = () => game.player?.vehicle?.hop(1.2) ?? false;

  api.spawnDummy = (x, z, heading = 0) => {
    const ch = new Character({ skin: '#8d5a3b', shirt: '#c8a060', pants: '#2a2a33', outfit: 'civilian', hat: 'none' });
    const a = new Actor(game, { kind: 'ped', faction: 'civ', character: ch, x, z, heading, name: 'Dummy' });
    a.system = 'debug';
    game.addActor(a);
    traffic.dummies.push(a);
    return { id: a.id };
  };

  api.dummies = () => traffic.dummies.map((a) => ({ id: a.id, health: a.health, state: a.state, x: +a.position.x.toFixed(2), z: +a.position.z.toFixed(2) }));

  api.trafficReport = () => traffic.report();
}
