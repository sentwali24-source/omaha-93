import * as THREE from 'three';

// STUB — replaced by the Player/Character agent. Keeps the public API from ARCHITECTURE.md.
//
// new Character(look) where look = { skin, shirt, pants, shoes, hat, hatColor, bandana, hair, outfit, build }
//   .root          THREE.Group, origin at the feet, model faces -Z
//   .setAnim(name) looping: idle walk run drive sit lean ko dance talk spray
//   .playOnce(name) one-shot overlay: punch punch2 kick hit getup sign jump cheer
//   .update(dt, speed)  speed in m/s drives walk/run cadence
//   .setOutfit(partialLook)
//   .setVisible(bool)
//   .dispose()

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class Character {
  constructor(look = {}) {
    this.look = { skin: '#8d5a3b', shirt: '#dddddd', pants: '#2a2a33', shoes: '#eeeeee', ...look };
    this.root = new THREE.Group();
    this.anim = 'idle';
    this.oneShot = null;
    this.oneShotT = 0;
    this.phase = 0;

    this.mats = {
      skin: new THREE.MeshLambertMaterial({ color: this.look.skin }),
      shirt: new THREE.MeshLambertMaterial({ color: this.look.shirt }),
      pants: new THREE.MeshLambertMaterial({ color: this.look.pants }),
      shoes: new THREE.MeshLambertMaterial({ color: this.look.shoes }),
    };
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);

    const torso = new THREE.Mesh(box(0.5, 0.62, 0.28), this.mats.shirt);
    torso.position.y = 1.2;
    const head = new THREE.Mesh(box(0.26, 0.28, 0.26), this.mats.skin);
    head.position.y = 1.68;
    body.add(torso, head);

    const limb = (w, h, mat, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(box(w, h, w), mat);
      m.position.y = -h / 2;
      pivot.add(m);
      body.add(pivot);
      return pivot;
    };
    this.armL = limb(0.14, 0.62, this.mats.shirt, -0.33, 1.5);
    this.armR = limb(0.14, 0.62, this.mats.shirt, 0.33, 1.5);
    this.legL = limb(0.18, 0.88, this.mats.pants, -0.13, 0.9);
    this.legR = limb(0.18, 0.88, this.mats.pants, 0.13, 0.9);
    body.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  setAnim(name) {
    this.anim = name;
  }

  playOnce(name) {
    this.oneShot = name;
    this.oneShotT = 0;
  }

  setOutfit(partial) {
    Object.assign(this.look, partial);
    if (partial.skin) this.mats.skin.color.set(partial.skin);
    if (partial.shirt) this.mats.shirt.color.set(partial.shirt);
    if (partial.pants) this.mats.pants.color.set(partial.pants);
    if (partial.shoes) this.mats.shoes.color.set(partial.shoes);
  }

  setVisible(v) {
    this.root.visible = v;
  }

  update(dt, speed = 0) {
    if (this.anim === 'ko') {
      this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, -Math.PI / 2, 10, dt);
      this.body.position.y = THREE.MathUtils.damp(this.body.position.y, 0.15, 10, dt);
      return;
    }
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, 0, 10, dt);
    this.body.position.y = 0;
    this.phase += dt * (2 + speed * 1.6);
    const swing = Math.min(1, speed / 3) * 0.7;
    const s = Math.sin(this.phase) * swing;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s;
    this.armR.rotation.x = s;
    if (this.oneShot) {
      this.oneShotT += dt;
      if (this.oneShot.startsWith('punch')) this.armR.rotation.x = -Math.PI / 2 * Math.sin(Math.min(1, this.oneShotT / 0.3) * Math.PI);
      if (this.oneShotT > 0.4) this.oneShot = null;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}
