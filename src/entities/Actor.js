import * as THREE from 'three';

// Base class for everything that walks: the player, pedestrians, set members, police.
// Visuals live in `character` (entities/Character.js); the actor owns gameplay state.
//
// kind:    'player' | 'ped' | 'gang' | 'cop'
// faction: 'civ' | 'police' | <setId>          (see data/sets.js)
// side:    'crips' | 'bloods' | null
// state:   'active' | 'ko' | 'removed'
//
// Position is character.root.position (feet on the ground, y = 0 unless jumping).

let nextId = 1;

export class Actor {
  constructor(game, { kind, faction = 'civ', side = null, character, x = 0, z = 0, heading = 0, maxHealth = 100, radius = 0.35, name = '' }) {
    this.id = nextId++;
    this.game = game;
    this.kind = kind;
    this.faction = faction;
    this.side = side;
    this.name = name;
    this.character = character;
    this.root = character.root;
    this.root.position.set(x, 0, z);
    this.heading = heading;
    this.root.rotation.y = heading;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.radius = radius;
    this.state = 'active';
    this.koTime = 0; // seconds spent knocked out
    this.vehicle = null; // Vehicle currently driven/ridden
    this.velocity = new THREE.Vector3(); // knockback / external impulses (decays)
    this.speed = 0; // current ground speed m/s (for animation)
    this.lastAttacker = null;
    this.lastHitAt = -1e9; // game.time.elapsed of last hit taken
    this.aggro = new Map(); // actorId -> seconds of remaining hostility (AI use)
    this.brain = null; // AI state bag, owned by whichever system spawned the actor
    this.system = null; // name of owning system ('pedestrians' | 'gangs' | 'police' | ...)
    this.userData = {};
  }

  get position() {
    return this.root.position;
  }

  get alive() {
    return this.state === 'active';
  }

  /** Apply damage; knocks out at 0 health. dir {x,z} = push direction (optional). */
  takeDamage(amount, attacker = null, dir = null, knockback = 0) {
    if (this.state !== 'active') return false;
    this.health = Math.max(0, this.health - amount);
    this.lastAttacker = attacker;
    this.lastHitAt = this.game.time.elapsed;
    if (attacker) this.aggro.set(attacker.id, 20);
    if (dir && knockback) {
      this.velocity.x += dir.x * knockback;
      this.velocity.z += dir.z * knockback;
    }
    this.character.playOnce?.('hit');
    this.game.events.emit('actor:hit', { target: this, attacker, damage: amount });
    if (this.health <= 0) this.knockOut(attacker);
    return true;
  }

  knockOut(attacker = null) {
    if (this.state !== 'active') return;
    this.state = 'ko';
    this.koTime = 0;
    this.health = 0;
    this.character.setAnim('ko');
    this.game.events.emit('actor:ko', { target: this, attacker });
  }

  revive(fraction = 0.5) {
    if (this.state !== 'ko') return;
    this.state = 'active';
    this.health = Math.max(1, Math.round(this.maxHealth * fraction));
    this.character.playOnce?.('getup');
    this.character.setAnim('idle');
  }

  heal(amount) {
    if (this.state !== 'active') return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Remove from the scene and from game.actors. */
  remove() {
    if (this.state === 'removed') return;
    this.state = 'removed';
    this.game.removeActor(this);
    this.character.dispose?.();
  }

  faceHeading(h) {
    this.heading = h;
    this.root.rotation.y = h;
  }
}
