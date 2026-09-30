import * as THREE from 'three';
import { Actor } from '../Actor.js';
import { Character } from '../Character.js';
import { sideLook } from './looks.js';
import { SKIN_TONES } from '../../data/sets.js';

// Debug helpers added to game.debugApi (only with ?debug):
//   spawnDummy(x, z, look?, opts?) → actor id     a standing target Actor with a Character
//   dummies() → [{ id, health, state, x, z }]
//   clearDummies()
//   lineup(opts?) → count                          close-up line-up of looks in front of the camera
//   anim(name, once?)                               play an animation on every dummy (and the player)
//   player() → movement / combat state             camera() → rig state

const dummies = [];

function dummyUpdater(dt) {
  for (let i = dummies.length - 1; i >= 0; i--) {
    const a = dummies[i];
    if (a.state === 'removed') {
      dummies.splice(i, 1);
      continue;
    }
    a.character.update(dt, 0);
  }
}

export function installCharacterDebug(game) {
  const api = game.debugApi;
  if (!api || api.spawnDummy) return;

  const spawn = (x, z, look = {}, opts = {}) => {
    const character = new Character(look);
    const a = new Actor(game, {
      kind: opts.kind || 'gang',
      faction: opts.faction || 'civ',
      side: opts.side || null,
      character,
      x,
      z,
      heading: opts.heading ?? 0,
      maxHealth: opts.maxHealth ?? 60,
      name: opts.name || 'Dummy',
    });
    a.system = 'debug';
    a.brain = { noRevive: !!opts.noRevive, dummy: true };
    if (opts.anim) character.setAnim(opts.anim);
    game.addActor(a);
    dummies.push(a);
    return a;
  };

  api.spawnDummy = (x, z, look, opts) => spawn(x, z, look, opts).id;
  api.dummies = () => dummies.map((a) => ({ id: a.id, health: a.health, state: a.state, x: +a.position.x.toFixed(2), z: +a.position.z.toFixed(2), anim: a.character.anim, koTime: +a.koTime.toFixed(2) }));
  api.clearDummies = () => {
    for (const a of [...dummies]) a.remove();
    dummies.length = 0;
  };
  api.anim = (name, once = false) => {
    const list = [...dummies.map((a) => a.character)];
    for (const c of list) (once ? c.playOnce(name) : c.setAnim(name));
    return list.length;
  };
  api.characterStats = () => Character.stats();
  api.camera = () => game.cameraRig?.info?.();
  api.fx = () => ({ sparks: game.combat?.fx?.sparkPool.n, dust: game.combat?.fx?.dustPool.n });

  /**
   * Line-up of looks. opts: { set: 'outfits' | 'hair' | 'hats' | 'skin' | 'npc' | 'anims', side, x, z, heading, spacing }
   * Spawns in front of the player (or at x/z) and points the camera at them.
   */
  api.lineup = (opts = {}) => {
    api.clearDummies();
    const side = opts.side || 'crips';
    const other = side === 'crips' ? 'bloods' : 'crips';
    const sets = {
      outfits: [
        sideLook({ outfit: 'starter', hat: 'cap', hair: 'fade', skin: SKIN_TONES[4], shoeStyle: 'runner' }, side),
        sideLook({ outfit: 'flannel', hat: 'none', hair: 'cornrows', skin: SKIN_TONES[5], shoeStyle: 'runner' }, side),
        sideLook({ outfit: 'tee', hat: 'cap', capBack: true, hair: 'fade', skin: SKIN_TONES[3], chain: true, pager: true }, side),
        sideLook({ outfit: 'jersey', hat: 'none', hair: 'hightop', skin: SKIN_TONES[6], number: 32 }, side),
        sideLook({ outfit: 'hoodie', hat: 'beanie', hair: 'fade', skin: SKIN_TONES[2] }, side),
        sideLook({ outfit: 'tee', hat: 'bandana', hair: 'bald', skin: SKIN_TONES[5], shades: true }, other),
        { outfit: 'uniform', skin: SKIN_TONES[1], hair: 'fade', build: 1.08 },
        { outfit: 'civilian', variant: 'sweatshirt', shirt: '#c8202a', skin: SKIN_TONES[0], hair: 'curly', hairColor: '#5b3b21', pantsStyle: 'jeans', shoeStyle: 'runner' },
        { outfit: 'civilian', variant: 'windbreaker', shirt: '#2f8f8a', shirt2: '#5b3a7a', female: true, hair: 'ponytail', skin: SKIN_TONES[3], pantsStyle: 'jeans' },
        { outfit: 'civilian', variant: 'dress', shirt: '#7a2233', female: true, hair: 'long', skin: SKIN_TONES[4] },
      ],
      hair: ['fade', 'hightop', 'cornrows', 'afro', 'bald', 'curly', 'ponytail', 'long', 'bun', 'braids'].map((hair, i) => ({
        outfit: i % 2 ? 'tee' : 'civilian', variant: 'tshirt', shirt: '#e9e3d0', shirt2: '#3f5f8f', hair, female: i >= 6, skin: SKIN_TONES[(i + 2) % SKIN_TONES.length], hat: 'none',
      })),
      hats: [
        sideLook({ outfit: 'tee', hat: 'cap', hair: 'fade' }, side),
        sideLook({ outfit: 'tee', hat: 'cap', capBack: true, hair: 'fade' }, side),
        sideLook({ outfit: 'hoodie', hat: 'beanie', hair: 'fade' }, side),
        sideLook({ outfit: 'tee', hat: 'bandana', hair: 'fade' }, side),
        sideLook({ outfit: 'hoodie', hoodUp: true, hair: 'fade' }, other),
        { outfit: 'uniform', hat: 'police', hair: 'fade' },
        { outfit: 'civilian', variant: 'polo', hat: 'cap', hatColor: '#c8202a', hair: 'fade' },
      ],
      skin: SKIN_TONES.map((skin, i) => sideLook({ outfit: i % 2 ? 'tee' : 'flannel', skin, hair: ['fade', 'cornrows', 'hightop', 'curly', 'afro', 'fade', 'bald'][i], hat: 'none' }, i % 2 ? side : other)),
      npc: Array.from({ length: 10 }, (_, i) => ({ outfit: 'civilian', variant: ['tshirt', 'polo', 'buttonup', 'windbreaker', 'sweatshirt', 'overalls', 'jacket', 'dress', 'polo', 'tshirt'][i], female: i >= 7 || i === 3, skin: SKIN_TONES[i % 7] })),
    };
    let looks = opts.looks || sets[opts.set || 'outfits'] || sets.outfits;
    if (opts.range) looks = looks.slice(opts.range[0], opts.range[1]);
    const p = game.player?.position || game.cameraRig?.target || new THREE.Vector3();
    const heading = opts.heading ?? game.player?.heading ?? 0;
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const spacing = opts.spacing ?? 0.95;
    const cx = opts.x ?? p.x + fx * 4;
    const cz = opts.z ?? p.z + fz * 4;
    const n = looks.length;
    looks.forEach((look, i) => {
      const o = (i - (n - 1) / 2) * spacing;
      const a = spawn(cx + rx * o, cz + rz * o, look, { heading: heading + Math.PI, noRevive: true, anim: opts.anim || 'idle' });
      a.character.ctx.idle = 0;
    });
    if (game.player) game.player.character.setVisible(false);
    // camera: in front of the row, slightly above, looking at chest height
    const dist = opts.dist ?? Math.max(3.2, n * spacing * 0.62);
    const cam = new THREE.Vector3(cx - fx * dist, opts.camY ?? 1.45, cz - fz * dist);
    const look = new THREE.Vector3(cx, opts.lookY ?? 1.05, cz);
    if (game.cameraRig) game.cameraRig.debugView = { position: cam, lookAt: look, fov: opts.fov ?? 50 };
    return n;
  };
  api.endLineup = () => {
    api.clearDummies();
    if (game.cameraRig) game.cameraRig.debugView = null;
    if (game.player && !game.player.vehicle) game.player.character.setVisible(true);
  };

  game.city?.addUpdater?.(dummyUpdater);
}
