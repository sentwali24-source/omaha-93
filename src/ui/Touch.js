// On-screen touch controls (ARCHITECTURE.md §20) for phones / tablets (input.isTouch), or any
// device with ?touch=1 (testing; the mouse then acts as a finger).
//
//   left ~42%    floating joystick: appears where the thumb lands → input.setVirtualMove
//   right side   drag to look → input.addLook
//   bottom-right PUNCH, JUMP, SPRINT (hold), CAR, ACTION (shows the prompt, supports hold), SIGN, MAP
//                in a car: BRAKE (handbrake), HORN, RADIO, EXIT, MAP
//   top-right    PAUSE → game.menu.showPause()
//
// Multi-touch safe: every pointer is tracked by pointerId. Buttons go through
// input.setVirtualButton(action, down). Everything is released when the controls hide
// (pause, map, menus, attract). Sizes scale with settings.touchScale and the screen size.

import './hud/touch.css';
import { clamp } from '../core/math.js';
import { ICONS } from './hud/icons.js';

const LOOK_SCALE = 1.2;
const STICK_ZONE = 0.42; // fraction of the screen width that spawns the joystick
const DEADZONE = 0.12;

// mode: 'foot' | 'car' | 'both'. action = input action; tap = UI callback instead.
const BUTTONS = [
  { id: 'punch', action: 'attack', label: 'PUNCH', icon: 'fist', mode: 'foot' },
  { id: 'jump', action: 'jump', label: 'JUMP', icon: 'jump', mode: 'foot' },
  { id: 'sprint', action: 'sprint', label: 'SPRINT', icon: 'sprint', mode: 'foot' },
  { id: 'car', action: 'vehicle', label: 'CAR', icon: 'car', mode: 'both' },
  { id: 'action', action: 'interact', label: 'ACTION', icon: 'hand', mode: 'foot' },
  { id: 'sign', action: 'sign', label: 'SIGN', icon: 'sign', mode: 'foot' },
  { id: 'map', tap: 'map', label: 'MAP', icon: 'map', mode: 'both' },
  { id: 'brake', action: 'jump', label: 'BRAKE', icon: 'brake', mode: 'car' }, // 'jump' also raises 'handbrake'
  { id: 'horn', action: 'horn', label: 'HORN', icon: 'horn', mode: 'car' },
  { id: 'radio', action: 'radio', label: 'RADIO', icon: 'tape', mode: 'car' },
];

export class Touch {
  constructor(game) {
    this.game = game;
    this.always = true;
    const param = game.params?.get?.('touch');
    this.forced = param === '1' || param === 'true';
    this.disabled = param === '0' || param === 'false';
    if (this.forced && game.input) game.input.isTouch = true; // the whole game behaves like a touch device
    this.mouseMode = false; // a touch device being used with a mouse (touch laptops)
    this.visible = false;
    this.inCar = false;

    this._stick = null; // { id, bx, by, x, y }
    this._look = null; // { id, x, y }
    this._held = new Map(); // pointerId -> button def
    this._c = {};
    this._nearCarT = 0;
    this._build();
  }

  /** Touch controls are in use (drives the HUD's touch layout). */
  get active() {
    if (this.disabled) return false;
    return this.forced || (!!this.game.input?.isTouch && !this.mouseMode);
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    const root = document.createElement('div');
    root.className = 'touch-root';
    root.innerHTML = `
      <div class="touch-stick"><div class="stick-anchor"></div><div class="stick-base"><i></i><i></i><i></i><i></i></div><div class="stick-knob"></div></div>
      <div class="touch-cluster"></div>
      <button type="button" class="tb tb-pause" aria-label="Pause">${ICONS.pause}</button>`;
    this.game.uiRoot.appendChild(root);
    this.el = root;
    this.stickEl = root.querySelector('.touch-stick');
    this.baseEl = root.querySelector('.stick-base');
    this.knobEl = root.querySelector('.stick-knob');
    this.anchorEl = root.querySelector('.stick-anchor'); // CSS-positioned rest spot (knows the safe areas)
    const cluster = root.querySelector('.touch-cluster');
    this.buttons = {};
    for (const def of BUTTONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tb tb-${def.id} mode-${def.mode}`;
      b.innerHTML = `<span class="tb-icon">${ICONS[def.icon] || ''}</span><span class="tb-label">${def.label}</span>`;
      if (def.id === 'action') {
        b.insertAdjacentHTML(
          'beforeend',
          '<svg class="tb-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg><span class="tb-prompt"><span class="tb-prompt-text"></span><span class="tb-prompt-hold">HOLD</span></span>',
        );
      }
      cluster.appendChild(b);
      this.buttons[def.id] = { el: b, def };
      this._bindButton(b, def);
    }
    const pause = root.querySelector('.tb-pause');
    this._bindButton(pause, { id: 'pause', tap: 'pause' });
    this.actionEl = this.buttons.action.el;
    this.promptText = this.actionEl.querySelector('.tb-prompt-text');
    this.ring = this.actionEl.querySelector('.tb-ring circle');
    this._ringLen = 2 * Math.PI * 46;
    this.ring.style.strokeDasharray = `${this._ringLen}`;
    this.ring.style.strokeDashoffset = `${this._ringLen}`;
    this.carLabel = this.buttons.car.el.querySelector('.tb-label');

    // the open area: joystick on the left, look on the right
    root.addEventListener('pointerdown', (e) => this._onDown(e));
    root.addEventListener('pointermove', (e) => this._onMove(e));
    root.addEventListener('pointerup', (e) => this._onUp(e));
    root.addEventListener('pointercancel', (e) => this._onUp(e));
    root.addEventListener('lostpointercapture', (e) => this._onUp(e));
    // no scrolling, no pinch-zoom, no double-tap zoom, no long-press menu
    const stop = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    root.addEventListener('touchstart', stop, { passive: false });
    root.addEventListener('touchmove', stop, { passive: false });
    root.addEventListener('touchend', stop, { passive: false });
    root.addEventListener('contextmenu', stop);
    document.addEventListener('gesturestart', stop, { passive: false });
    // a real finger anywhere switches a touch laptop back from mouse mode
    // (also brings the controls back after a gamepad was used: they hide while it is active)
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'touch') return;
        if (this.mouseMode) {
          this.mouseMode = false;
          this.el.classList.remove('mouse');
        }
        if (this.game.input && this.game.input.lastDevice === 'gamepad') this.game.input.lastDevice = 'touch';
      },
      true,
    );
  }

  _bindButton(b, def) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.visible) return;
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      b.classList.add('down');
      if (def.tap) {
        this._tap(def.tap);
        return;
      }
      this._held.set(e.pointerId, { def, el: b });
      this.game.input?.setVirtualButton(def.action, true);
    });
    const up = (e) => {
      b.classList.remove('down');
      const h = this._held.get(e.pointerId);
      if (!h) return;
      this._held.delete(e.pointerId);
      // another finger may still hold the same action (e.g. BRAKE + JUMP share 'jump')
      for (const o of this._held.values()) if (o.def.action === h.def.action) return;
      this.game.input?.setVirtualButton(h.def.action, false);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  }

  _tap(what) {
    const g = this.game;
    if (what === 'map') {
      this._releaseAll();
      g.mapScreen?.toggle?.();
    } else if (what === 'pause') {
      this._releaseAll();
      g.menu?.showPause?.();
    }
  }

  init() {
    this.game.events.on('resize', () => this._layout());
    this.game.events.on('settings:change', () => this._layout());
    this._layout();
  }

  _layout() {
    const s = Number(this.game.settings?.touchScale) || 1;
    const short = Math.min(window.innerWidth, window.innerHeight);
    const ts = clamp(s, 0.6, 1.6) * clamp(short / 400, 0.78, 1.3);
    this._ts = ts;
    this.el.style.setProperty('--ts', ts.toFixed(3));
    this.game.hud?.root?.style.setProperty('--ts', ts.toFixed(3));
    this._stickR = 58 * ts;
    this._restStick();
  }

  // ------------------------------------------------------------------ joystick + look
  _onDown(e) {
    if (!this.visible) return;
    const g = this.game;
    if (e.pointerType === 'mouse' && !this.forced) {
      // mouse on a touch-capable device: get out of the way and use pointer lock
      this.mouseMode = true;
      this.el.classList.add('mouse');
      this._releaseAll();
      g.input?.requestPointerLock?.();
      return;
    }
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    // tapping the radar opens the map
    const mm = g.hud?.minimap?.el;
    if (mm) {
      const r = mm.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (Math.hypot(x - cx, y - cy) < r.width / 2) {
        this._tap('map');
        return;
      }
    }
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!this._stick && x < window.innerWidth * STICK_ZONE) {
      const R = this._stickR;
      const bx = clamp(x, R + 10, window.innerWidth * STICK_ZONE);
      const by = clamp(y, R + 10, window.innerHeight - R - 10);
      this._stick = { id: e.pointerId, bx, by, x, y };
      this.stickEl.classList.add('active');
      this._updateStick();
    } else if (!this._look) {
      this._look = { id: e.pointerId, x, y };
    }
  }

  _onMove(e) {
    const s = this._stick;
    if (s && e.pointerId === s.id) {
      s.x = e.clientX;
      s.y = e.clientY;
      this._updateStick();
      return;
    }
    const l = this._look;
    if (l && e.pointerId === l.id) {
      const dx = e.clientX - l.x;
      const dy = e.clientY - l.y;
      l.x = e.clientX;
      l.y = e.clientY;
      if (dx || dy) this.game.input?.addLook(dx * LOOK_SCALE, dy * LOOK_SCALE);
    }
  }

  _onUp(e) {
    if (this._stick && e.pointerId === this._stick.id) {
      this._stick = null;
      this.game.input?.setVirtualMove(0, 0);
      this.stickEl.classList.remove('active');
      this._restStick();
    }
    if (this._look && e.pointerId === this._look.id) this._look = null;
  }

  _updateStick() {
    const s = this._stick;
    const R = this._stickR;
    let dx = s.x - s.bx;
    let dy = s.y - s.by;
    let len = Math.hypot(dx, dy);
    if (len > R) {
      // floating stick: the base follows the thumb when it overshoots
      const k = (len - R) / len;
      s.bx += dx * k;
      s.by += dy * k;
      dx = s.x - s.bx;
      dy = s.y - s.by;
      len = R;
    }
    let nx = dx / R;
    let ny = dy / R;
    const n = Math.hypot(nx, ny);
    if (n < DEADZONE) {
      nx = 0;
      ny = 0;
    } else {
      const k = (n - DEADZONE) / (1 - DEADZONE) / n;
      nx *= k;
      ny *= k;
    }
    this.game.input?.setVirtualMove(clamp(nx, -1, 1), clamp(-ny, -1, 1));
    this.baseEl.style.transform = `translate3d(${s.bx}px, ${s.by}px, 0)`;
    this.knobEl.style.transform = `translate3d(${s.bx + dx}px, ${s.by + dy}px, 0)`;
  }

  _restStick() {
    if (this._stick) return;
    const r = this.anchorEl.getBoundingClientRect();
    this.baseEl.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    this.knobEl.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
  }

  _releaseAll() {
    const input = this.game.input;
    for (const h of this._held.values()) {
      input?.setVirtualButton(h.def.action, false);
      h.el.classList.remove('down');
    }
    this._held.clear();
    for (const b of Object.values(this.buttons)) b.el.classList.remove('down');
    if (this._stick) {
      this._stick = null;
      this.stickEl.classList.remove('active');
    }
    this._look = null;
    input?.setVirtualMove(0, 0);
    this._restStick();
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const g = this.game;
    const show = this.active && g.mode === 'play' && !!g.player && !g.paused && g.hud?.visible !== false && g.input?.lastDevice !== 'gamepad';
    if (show !== this.visible) {
      this.visible = show;
      this.el.classList.toggle('show', show);
      if (!show) this._releaseAll();
    }
    if (!show) return;

    const c = this._c;
    const p = g.player;
    const inCar = !!p.vehicle;
    if (inCar !== this.inCar) {
      this.inCar = inCar;
      this.el.classList.toggle('in-car', inCar);
      this.carLabel.textContent = inCar ? 'EXIT' : 'CAR';
      // a finger holding a foot-only button (e.g. SPRINT) must not stay stuck when the layout swaps
      for (const [id, h] of this._held) {
        if (h.def.mode !== 'both') {
          this._held.delete(id);
          g.input?.setVirtualButton(h.def.action, false);
          h.el.classList.remove('down');
        }
      }
    }

    // ACTION shows the current interaction prompt and its hold progress
    const hud = g.hud;
    const text = inCar ? null : hud?.promptText || null;
    if (c.text !== text) {
      c.text = text;
      this.actionEl.classList.toggle('has-prompt', !!text);
      this.promptText.textContent = text || '';
    }
    const hold = !!text && hud?.promptKind === 'hold';
    if (c.hold !== hold) {
      c.hold = hold;
      this.actionEl.classList.toggle('hold', hold);
    }
    const prog = hold ? clamp(hud?.promptProgress || 0, 0, 1) : 0;
    const q = Math.round(prog * 100);
    if (c.prog !== q) {
      c.prog = q;
      this.ring.style.strokeDashoffset = `${this._ringLen * (1 - prog)}`;
    }

    // CAR glows when there is a car close enough to get into
    this._nearCarT -= dt;
    if (this._nearCarT <= 0) {
      this._nearCarT = 0.25;
      let near = false;
      if (!inCar && g.vehiclesNear) {
        const pos = p.position;
        near = g.vehiclesNear(pos.x, pos.z, 4.5).length > 0;
      }
      if (c.near !== near) {
        c.near = near;
        this.buttons.car.el.classList.toggle('glow', near);
      }
    }
  }
}
