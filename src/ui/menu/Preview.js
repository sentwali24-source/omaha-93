import * as THREE from 'three';
import { Character } from '../../entities/Character.js';

// Live 3D preview for the character creator: its own small WebGLRenderer (transparent canvas over
// the card's CSS backdrop), a turntable that spins on its own and follows drags, and a Character
// playing its idle animation. Structural look changes (outfit, hat, hair, build, body) rebuild the
// Character; pure recolors go through character.setOutfit(). dispose() frees everything, including
// the WebGL context (browsers cap how many can live at once).

const STRUCTURAL = ['outfit', 'hat', 'hair', 'build', 'female'];
const AUTO_SPIN = 0.5; // rad/s

export class CharacterPreview {
  constructor(host, { accent = '#1f5fe0' } = {}) {
    this.host = host;
    this.ok = false;
    this.character = null;
    this.look = null;
    this.yaw = Math.PI - 0.45; // models face -Z, the camera looks down -Z: start three-quarter front
    this.spinVel = 0;
    this.dragging = false;
    this.lastX = 0;
    this.idleSince = 0;
    this.width = 0;
    this.height = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'm-preview-canvas';
    this.canvas.setAttribute('aria-label', 'Character preview — drag to spin');
    host.appendChild(this.canvas);

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (err) {
      console.warn('[menu] character preview unavailable', err);
      host.classList.add('m-preview-failed');
      return;
    }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 0.75, 0.1, 40);
    this.camera.position.set(0, 1.12, 5.9);
    this.camera.lookAt(0, 0.95, 0);

    // warm key from the front, cool sky fill, side-colored rim from behind (the "neon" edge)
    this.scene.add(new THREE.HemisphereLight(0xffe4c8, 0x2a1d33, 1.5));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.3);
    key.position.set(2.2, 3.8, 4.2);
    this.scene.add(key);
    this.rim = new THREE.DirectionalLight(accent, 3.2);
    this.rim.position.set(-3, 2.6, -3.5);
    this.scene.add(this.rim);
    const rim2 = new THREE.DirectionalLight(0xffa860, 1.2);
    rim2.position.set(3.5, 1.5, -2.5);
    this.scene.add(rim2);

    // soft contact shadow + a turntable ring
    const shadowTex = radialTexture();
    this.floorGeo = new THREE.CircleGeometry(0.85, 32);
    this.floorMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false });
    const floor = new THREE.Mesh(this.floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    this.scene.add(floor);
    this.ringGeo = new THREE.RingGeometry(0.98, 1.05, 64);
    this.ringMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    this.scene.add(ring);

    this.spin = new THREE.Group();
    this.scene.add(this.spin);

    this._bindDrag();
    this._resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(host);
    }
    this.ok = true;
  }

  setAccent(color) {
    if (!this.ok) return;
    this.rim.color.set(color);
    this.ringMat.color.set(color);
  }

  /** Show `look` (§12). Rebuilds the Character only when its shape changes. */
  setLook(look) {
    const prev = this.look;
    this.look = { ...look };
    if (!this.ok) return;
    if (this.character && prev && STRUCTURAL.every((k) => prev[k] === look[k])) {
      try {
        this.character.setOutfit(this.look);
        return;
      } catch (err) {
        console.warn('[menu] setOutfit failed, rebuilding preview', err);
      }
    }
    this._rebuild();
  }

  playOnce(name) {
    try {
      this.character?.playOnce?.(name);
    } catch {
      /* optional animation */
    }
  }

  _rebuild() {
    this._disposeCharacter();
    try {
      this.character = new Character(this.look);
      this.character.root.rotation.y = 0;
      this.spin.add(this.character.root);
      this.character.setAnim?.('idle');
    } catch (err) {
      console.warn('[menu] preview character failed', err);
      this.character = null;
    }
  }

  _disposeCharacter() {
    if (!this.character) return;
    this.spin.remove(this.character.root);
    try {
      this.character.dispose?.();
    } catch {
      /* ignore */
    }
    this.character = null;
  }

  _bindDrag() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.spinVel = 0;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.yaw += dx * 0.012;
      this.spinVel = dx * 0.6;
    });
    const end = () => {
      this.dragging = false;
      this.idleSince = 0;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  _resize() {
    if (!this.renderer) return;
    const w = Math.max(1, Math.round(this.host.clientWidth));
    const h = Math.max(1, Math.round(this.host.clientHeight));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole body in frame on narrow or wide canvases
    const fitH = 2.35;
    const fitW = 1.5;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const distH = fitH / 2 / Math.tan(vFov / 2);
    const distW = fitW / 2 / (Math.tan(vFov / 2) * this.camera.aspect);
    const d = Math.max(distH, distW);
    this.camera.position.set(0, 1.12, d);
    this.camera.lookAt(0, 0.98, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.ok) return;
    if (!this.dragging) {
      this.idleSince += dt;
      // coast after a flick, then settle back into the slow showroom spin
      this.spinVel *= Math.exp(-3 * dt);
      const auto = this.idleSince > 1.2 ? AUTO_SPIN : 0;
      this.yaw += (auto + this.spinVel) * dt;
    }
    this.spin.rotation.y = this.yaw;
    try {
      this.character?.update?.(dt, 0);
    } catch {
      /* a broken animation must not kill the menu */
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro?.disconnect();
    this._disposeCharacter();
    if (this.renderer) {
      this.floorGeo.dispose();
      this.floorMat.map?.dispose();
      this.floorMat.dispose();
      this.ringGeo.dispose();
      this.ringMat.dispose();
      this.renderer.dispose();
      try {
        this.renderer.forceContextLoss();
      } catch {
        /* ignore */
      }
      this.renderer = null;
    }
    this.canvas.remove();
    this.ok = false;
  }
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
