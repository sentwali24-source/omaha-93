// Unified input: keyboard + mouse (pointer lock), touch (fed by ui/Touch.js), gamepad.
//
// Per frame, gameplay code reads:
//   input.move      {x, y}  -1..1, y+ = forward / throttle, x+ = right / steer right
//   input.look      {dx, dy} pixels of camera look this frame (already scaled by sensitivity)
//   input.held(a)   action is down
//   input.pressed(a)  action went down this frame
//   input.released(a) action went up this frame
//
// Actions: sprint jump attack interact vehicle horn map pause radio sign homies camera handbrake
// Game.js calls beginFrame() before updates and endFrame() after.

const KEY_ACTIONS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
  KeyJ: 'attack',
  KeyE: 'interact',
  KeyF: 'vehicle',
  KeyH: 'horn',
  KeyM: 'map', Tab: 'map',
  Escape: 'pause', KeyP: 'pause',
  KeyR: 'radio',
  KeyQ: 'sign',
  KeyG: 'homies',
  KeyC: 'camera',
};

// Space doubles as handbrake while driving: gameplay code reads 'jump' on foot and
// 'handbrake' in a car; both are raised by the same key.
const ALIASES = { jump: ['handbrake'] };

const GAMEPAD_BUTTONS = {
  0: 'jump', // A
  1: 'interact', // B
  2: 'attack', // X
  3: 'vehicle', // Y
  4: 'sign', // LB
  5: 'horn', // RB
  6: 'down', // LT (brake/reverse when driving)
  7: 'sprint', // RT (sprint / gas)
  8: 'map', // back
  9: 'pause', // start
  10: 'camera', // L3
  11: 'homies', // R3
  12: 'radio', // dpad up
};

export class Input {
  constructor(game, element) {
    this.game = game;
    this.element = element;
    this.enabled = true;
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };

    this._down = new Set(); // raw keyboard/mouse
    this._virtualDown = new Set(); // touch buttons
    this._padDown = new Set();
    this._held = new Set();
    this._prevHeld = new Set();
    this._taps = new Set(); // went down and maybe up inside one frame
    this._pressed = new Set();
    this._released = new Set();
    this._virtualMove = { x: 0, y: 0 };
    this._padMove = { x: 0, y: 0 };
    this._rawLook = { dx: 0, dy: 0 };
    this.pointerLocked = false;
    this.isTouch = false;
    this.lastDevice = 'keyboard'; // 'keyboard' | 'touch' | 'gamepad'

    try {
      this.isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    } catch {
      /* ignore */
    }

    this._bind();
  }

  _bind() {
    const isTyping = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const a = KEY_ACTIONS[e.code];
      if (!a) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this._down.has(a)) this._taps.add(a);
      this._down.add(a);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => {
      const a = KEY_ACTIONS[e.code];
      if (a) this._down.delete(a);
    });
    window.addEventListener('blur', () => {
      this._down.clear();
      this._virtualDown.clear();
    });

    const el = this.element;
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.pointerLocked && this.game?.mode === 'play' && !this.isTouch) {
          this.requestPointerLock();
        } else {
          this._taps.add('attack');
          this._down.add('attack');
        }
      }
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._down.delete('attack');
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this._rawLook.dx += e.movementX || 0;
      this._rawLook.dy += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === el;
    });
  }

  requestPointerLock() {
    try {
      const p = this.element.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  exitPointerLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }

  // ---- Touch UI hooks (called by ui/Touch.js) ----
  setVirtualMove(x, y) {
    this._virtualMove.x = x;
    this._virtualMove.y = y;
    if (x || y) this.lastDevice = 'touch';
  }

  addLook(dx, dy) {
    this._rawLook.dx += dx;
    this._rawLook.dy += dy;
    this.lastDevice = 'touch';
  }

  setVirtualButton(action, down) {
    if (down) {
      if (!this._virtualDown.has(action)) this._taps.add(action);
      this._virtualDown.add(action);
      this.lastDevice = 'touch';
    } else {
      this._virtualDown.delete(action);
    }
  }

  /** Programmatic tap (tests, UI buttons). */
  tap(action) {
    this._taps.add(action);
  }

  _pollGamepad() {
    this._padDown.clear();
    this._padMove.x = this._padMove.y = 0;
    let pads;
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      return;
    }
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(pad.axes[0] || 0);
      const ly = dz(pad.axes[1] || 0);
      const rx = dz(pad.axes[2] || 0);
      const ry = dz(pad.axes[3] || 0);
      this._padMove.x = lx;
      this._padMove.y = -ly;
      this._rawLook.dx += rx * 14;
      this._rawLook.dy += ry * 10;
      pad.buttons.forEach((b, i) => {
        const a = GAMEPAD_BUTTONS[i];
        if (a && (b.pressed || b.value > 0.5)) this._padDown.add(a);
      });
      if (lx || ly || rx || ry || this._padDown.size) this.lastDevice = 'gamepad';
      break;
    }
  }

  beginFrame() {
    this._pollGamepad();
    this._prevHeld = this._held;
    this._held = new Set([...this._down, ...this._virtualDown, ...this._padDown]);
    for (const [a, extra] of Object.entries(ALIASES)) {
      if (this._held.has(a)) extra.forEach((x) => this._held.add(x));
      if (this._taps.has(a)) extra.forEach((x) => this._taps.add(x));
    }
    this._pressed.clear();
    this._released.clear();
    for (const a of this._held) if (!this._prevHeld.has(a)) this._pressed.add(a);
    for (const a of this._taps) this._pressed.add(a);
    for (const a of this._prevHeld) if (!this._held.has(a)) this._released.add(a);

    // Movement: keyboard digital + touch analog + gamepad analog.
    let x = 0;
    let y = 0;
    if (this._held.has('left')) x -= 1;
    if (this._held.has('right')) x += 1;
    if (this._held.has('up')) y += 1;
    if (this._held.has('down')) y -= 1;
    x += this._virtualMove.x + this._padMove.x;
    y += this._virtualMove.y + this._padMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;

    const s = this.game?.settings?.sensitivity ?? 1;
    const inv = this.game?.settings?.invertY ? -1 : 1;
    this.look.dx = this.enabled ? this._rawLook.dx * s : 0;
    this.look.dy = this.enabled ? this._rawLook.dy * s * inv : 0;
  }

  endFrame() {
    this._taps.clear();
    this._rawLook.dx = 0;
    this._rawLook.dy = 0;
  }

  held(a) {
    return this.enabled && this._held.has(a);
  }

  pressed(a) {
    return this.enabled && this._pressed.has(a);
  }

  released(a) {
    return this.enabled && this._released.has(a);
  }

  /** Menu-level actions (pause / map) work even while gameplay input is disabled. */
  pressedAlways(a) {
    return this._pressed.has(a);
  }
}
