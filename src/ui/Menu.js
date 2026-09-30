import './menu.css';
import { SETS, setsForSide, setById } from '../data/sets.js';
import { clockText } from '../core/math.js';
import { el, focusablesIn } from './menu/dom.js';
import { noiseTile } from './menu/paisley.js';
import { defaultLook, cleanName } from './menu/looks.js';
import { MENU_HINTS } from './menu/controlsData.js';
import { titleScreen, aboutScreen } from './menu/screens/title.js';
import { sideScreen, setScreen, creatorScreen } from './menu/screens/newgame.js';
import { settingsScreen, controlsScreen } from './menu/screens/options.js';
import { pauseScreen } from './menu/screens/pause.js';

// Title / new-game flow / pause menus (ARCHITECTURE.md §20, MENU agent).
//
// One overlay (.m-root) holds a stack of screens. Each screen is built fresh by a factory in
// ui/menu/screens/* and returns { el, focus?, wrap?, onShow?, onHide?, update?(dt) }.
// Two contexts:
//   'title'  attract mode — the city flyover renders behind; input.enabled = false
//   'pause'  in play      — game.setPaused(true) while open
// Navigation: mouse / touch, arrows or WASD + Enter / Esc, gamepad D-pad + A / B. Hover moves the
// highlight like a console menu. The VHS layer (scanlines, grain, tracking band, OSD with tape
// counter and camcorder date stamp) sits above the screens and ignores the pointer.
//
// Sounds: 'ui_click' when the highlight moves, 'ui_select' when something is activated.

const SCREENS = {
  title: titleScreen,
  about: aboutScreen,
  side: sideScreen,
  set: setScreen,
  creator: creatorScreen,
  settings: settingsScreen,
  controls: controlsScreen,
  pause: pauseScreen,
};

const DIR_KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ROTATE_KEY = 'omaha93.rotateHint';

export class Menu {
  constructor(game) {
    this.game = game;
    this.always = true;
    this.pauseOpen = false;
    this.context = null; // 'title' | 'pause' | null (closed)
    this.stack = []; // [{ id, params, focusKey }]
    this.current = null; // live screen object
    this.modal = null;
    this.flow = { side: null, setId: null, draft: null }; // new-game draft (kept while going back)
    this._tape = 0;
    this._osdSec = -1;
    this._sfxAt = 0;
    this._orphanPause = 0;
    this._rotateCheck = 0;
    this._pad = { prev: [], dir: null, hold: 0 };
    this._debugInstalled = false;
    this._rotateDismissed = readFlag(ROTATE_KEY);
    this._touchMode = !!game.input?.isTouch; // no auto-highlight while the player is tapping
    this._pendingFocus = null;

    this._buildDom();
    this._bindInput();
    game.events?.on?.('resize', () => this._updateRotateHint());
    game.events?.on?.('settings:change', () => this._syncLite());
  }

  // ================================================================ public API (§20)

  /** OMAHA '93 title over the attract flyover. */
  showTitle() {
    this.pauseOpen = false;
    this.flow = { side: null, setId: null, draft: null };
    this._tape = 0;
    this._open('title');
    this._inputOff();
    this.game.hud?.hide?.();
    this._updateRotateHint();
    this.stack = [];
    this.go('title');
  }

  /** Skip the menus (tests / ?autostart): straight into play with a default look. */
  quickStart({ side = 'crips', setId = null, name = 'Tester' } = {}) {
    const set = (setId && setById(setId)) || setsForSide(side)[0] || SETS[0];
    this.game.audio?.unlock?.();
    this.pauseOpen = false;
    this._close();
    this._inputOn();
    this.game.startNewGame({ name: cleanName(name) || 'Lil Homie', side: set.side, setId: set.id, look: defaultLook(set.side, set.id) });
    this.game.hud?.show?.();
    this._updateRotateHint();
  }

  /** Pause menu (Game calls this on Esc / P, and when the tab is hidden). */
  showPause() {
    const g = this.game;
    if (g.mode !== 'play' || this.pauseOpen) return;
    this.pauseOpen = true;
    g.setPaused(true);
    this._open('pause');
    this.stack = [];
    this.go('pause');
    this._updateRotateHint();
  }

  hidePause() {
    const g = this.game;
    this.pauseOpen = false;
    if (this.context === 'pause') this._close();
    if (g.mode === 'play' && g.paused) g.setPaused(false);
    this._updateRotateHint();
  }

  /** Settings screen from anywhere (title or in play). */
  showSettings() {
    if (this.game.mode === 'play') {
      if (!this.pauseOpen) this.showPause();
    } else if (this.context !== 'title') {
      this.showTitle();
    }
    if (this.current?.id !== 'settings') this.go('settings');
  }

  // ================================================================ system hooks

  onGameStart() {
    this.pauseOpen = false;
    if (this.context) this._close();
    this._inputOn();
    this._updateRotateHint();
  }

  onGameEnd() {
    this.pauseOpen = false;
    this._updateRotateHint();
  }

  update(dt) {
    const g = this.game;
    if (!this._debugInstalled && g.debugApi) this._installDebug();

    // Paused in play with no menu and no map (e.g. the map closed without resuming): show the pause
    // menu so the player is never stuck on a frozen screen.
    if (g.mode === 'play' && g.paused && !this.pauseOpen && !g.mapScreen?.open) {
      this._orphanPause += dt;
      if (this._orphanPause > 0.3) {
        this._orphanPause = 0;
        this.pauseOpen = true;
        this._open('pause');
        this.stack = [];
        this.go('pause');
      }
    } else {
      this._orphanPause = 0;
    }

    this._rotateCheck -= dt;
    if (this._rotateCheck <= 0) {
      this._rotateCheck = 1;
      this._updateRotateHint();
    }

    if (!this.context) return;
    this._tape += dt;
    this._tickOsd();
    if (this.current?.update) {
      try {
        this.current.update(dt);
      } catch (err) {
        if (!this._screenErr) console.error('[menu] screen update failed', err);
        this._screenErr = true;
      }
    }
    this._pollPad(dt);
  }

  // ================================================================ screen stack

  go(id, params = {}) {
    if (!SCREENS[id]) return;
    const top = this.stack[this.stack.length - 1];
    if (top) top.focusKey = document.activeElement?.dataset?.key || null;
    this.stack.push({ id, params, focusKey: null });
    this._show(this.stack[this.stack.length - 1], 'fwd');
  }

  back() {
    if (this.modal) {
      this.modal.resolve(false);
      return;
    }
    if (this.stack.length <= 1) {
      if (this.context === 'pause') this.hidePause();
      return;
    }
    this.stack.pop();
    this._show(this.stack[this.stack.length - 1], 'back');
  }

  /** Replace the whole stack (e.g. back to the root after a finished sub-flow). */
  reset(id, params = {}) {
    this.stack = [];
    this.go(id, params);
  }

  _show(entry, dir) {
    let scr;
    try {
      scr = SCREENS[entry.id](this, entry.params || {});
    } catch (err) {
      // keep whatever is on screen rather than leaving the player on an empty overlay
      console.error(`[menu] could not build screen "${entry.id}"`, err);
      if (this.stack[this.stack.length - 1] === entry) this.stack.pop();
      return;
    }
    const prev = this.current;
    if (prev) {
      try {
        prev.onHide?.();
      } catch (err) {
        console.error('[menu] onHide failed', err);
      }
      prev.el.remove();
    }
    this._screenErr = false;
    scr.id = entry.id;
    this.current = scr;
    this.root.dataset.screen = entry.id;
    scr.el.classList.add('m-screen', dir === 'back' ? 'm-enter-back' : 'm-enter');
    this.stage.append(scr.el);
    try {
      scr.onShow?.();
    } catch (err) {
      console.error('[menu] onShow failed', err);
    }
    let target = null;
    if (entry.focusKey) target = scr.el.querySelector(`[data-key="${cssEscape(entry.focusKey)}"]`);
    if (!target) target = scr.focus || focusablesIn(scr.el).find((n) => n.type !== 'text') || null;
    // With a keyboard / gamepad the default control is highlighted right away; on touch nothing is
    // highlighted until the first arrow / D-pad press (which then starts from that control).
    this._pendingFocus = target;
    if (target && !this._touchMode) this.focusEl(target, true);
    this._updateHints();
  }

  _open(context) {
    this.context = context;
    this._syncLite();
    this.root.hidden = false;
    this.root.dataset.ctx = context;
    this.osdMode.textContent = context === 'pause' ? 'PAUSE ❚❚' : 'PLAY ▶';
    this._osdSec = -1;
  }

  _close() {
    if (this.modal) this.modal.resolve(false);
    if (this.current) {
      try {
        this.current.onHide?.();
      } catch (err) {
        console.error('[menu] onHide failed', err);
      }
      this.current.el.remove();
      this.current = null;
    }
    this.stack = [];
    this.context = null;
    this.root.hidden = true;
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  /** Lighter VHS layer on 'low' quality. */
  _syncLite() {
    this.root.classList.toggle('m-lite', this.game.settings?.quality === 'low');
  }

  _inputOff() {
    if (this.game.input) this.game.input.enabled = false;
  }

  _inputOn() {
    if (this.game.input) this.game.input.enabled = true;
  }

  // ================================================================ game actions (used by screens)

  /** Leave the menus into play with a short VHS static cut. `start` calls into Game. */
  launch(start) {
    if (this._launching) return;
    this._launching = true;
    this.root.style.pointerEvents = 'none';
    this.sfx('ui_select');
    this.cut.classList.remove('m-cut-out');
    this.cut.classList.add('m-cut-on');
    setTimeout(() => {
      this._launching = false;
      this.root.style.pointerEvents = '';
      this._close();
      this.pauseOpen = false;
      this._inputOn();
      try {
        start();
      } catch (err) {
        console.error('[menu] could not start the game', err);
      }
      if (this.game.mode === 'play') this.game.hud?.show?.();
      else if (!this.context) this.showTitle();
      this.cut.classList.add('m-cut-out');
      setTimeout(() => this.cut.classList.remove('m-cut-on', 'm-cut-out'), 520);
      this._updateRotateHint();
    }, 300);
  }

  continueGame() {
    this.launch(() => {
      if (!this.game.continueGame()) {
        this.showTitle();
        this.game.hud?.toast?.('That save could not be loaded');
      }
    });
  }

  startNewGame({ name, side, setId, look }) {
    this.launch(() => this.game.startNewGame({ name, side, setId, look }));
  }

  openMap() {
    const ms = this.game.mapScreen;
    if (!ms?.toggle) return;
    // Hide the pause UI but stay paused: the map screen owns pausing until it closes.
    this.pauseOpen = false;
    this._close();
    try {
      ms.toggle();
    } catch (err) {
      console.error('[menu] map failed to open', err);
    }
    if (!ms.open) {
      // map unavailable: straight back to the pause menu
      this.pauseOpen = true;
      this._open('pause');
      this.go('pause');
    }
  }

  quitToTitle() {
    this.pauseOpen = false;
    this._close();
    this.game.quitToTitle();
    if (!this.context) this.showTitle();
  }

  // ================================================================ building blocks for screens

  /**
   * Menu button. `label` may be a string or nodes. opts: cls, key (focus memory), sub (second line),
   * sound (default 'ui_select', null = silent), attrs.
   */
  button(label, onActivate, opts = {}) {
    const b = el('button', { type: 'button', class: opts.cls || 'm-btn', ...(opts.attrs || {}) });
    if (opts.key) b.dataset.key = opts.key;
    if (label != null) {
      if (typeof label === 'string') b.append(el('span', { class: 'm-btn-label', text: label }));
      else b.append(label);
    }
    if (opts.sub) b.append(el('span', { class: 'm-btn-sub', text: opts.sub }));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.audio?.unlock?.();
      if (opts.sound !== null) this.sfx(opts.sound || 'ui_select');
      onActivate?.(e, b);
    });
    return b;
  }

  /** Button with an icon + text label (the text can collapse on narrow screens, see .m-compact). */
  iconButton(icon, text, onActivate, opts = {}) {
    const label = el('span', { class: 'm-btn-label' }, el('span', { class: 'm-ico', 'aria-hidden': 'true', text: icon }), el('span', { class: 'm-btn-text', text }));
    const b = this.button(label, onActivate, opts);
    b.setAttribute('aria-label', text);
    return b;
  }

  /** Standard "◀ Back" footer button. */
  backButton(text = 'Back') {
    return this.iconButton('◀', text, () => this.back(), { cls: 'm-btn m-btn-ghost m-btn-back', key: 'back', sound: 'ui_click' });
  }

  /** Header with the 3-step tape-chapter strip for the new-game flow. */
  header(step, title, sub) {
    const steps = ['Side', 'Set', 'Look'];
    return el(
      'header',
      { class: 'm-head' },
      step
        ? el(
            'div',
            { class: 'm-steps', 'aria-label': `Step ${step} of 3` },
            steps.map((s, i) => el('span', { class: i + 1 === step ? 'on' : i + 1 < step ? 'done' : '' }, el('b', { text: `0${i + 1}` }), ` ${s}`)),
          )
        : null,
      el('h2', { class: 'm-h2', text: title }),
      sub ? el('p', { class: 'm-sub', text: sub }) : null,
    );
  }

  /** Yes / no dialog over the current screen. Resolves true on yes. */
  confirm({ title, text, yes = 'Yes', no = 'Cancel', danger = false }) {
    if (this.modal) this.modal.resolve(false);
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      let done = false;
      let layer = null;
      const finish = (v) => {
        if (done) return;
        done = true;
        layer.remove();
        this.modal = null;
        if (prevFocus && this.root.contains(prevFocus)) this.focusEl(prevFocus, true);
        resolve(v);
      };
      const noBtn = this.button(no, () => finish(false), { cls: 'm-btn m-btn-ghost', sound: 'ui_click' });
      const yesBtn = this.button(yes, () => finish(true), { cls: `m-btn ${danger ? 'm-btn-danger' : 'm-btn-primary'}` });
      layer = el(
        'div',
        { class: 'm-modal-layer', onclick: (e) => e.target === layer && finish(false) },
        el(
          'div',
          { class: 'm-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          el('div', { class: 'm-modal-osd', text: danger ? '■ WARNING' : '▶ CONFIRM' }),
          el('div', { class: 'm-modal-title', text: title }),
          text ? el('p', { class: 'm-modal-text', text }) : null,
          el('div', { class: 'm-modal-actions' }, noBtn, yesBtn),
        ),
      );
      this.root.append(layer);
      this.modal = { el: layer, resolve: finish };
      this.focusEl(noBtn, true);
    });
  }

  /** Short inline notice at the bottom of the menu (e.g. "Game saved"). */
  notice(text) {
    this.noticeEl.textContent = text;
    this.noticeEl.classList.remove('on');
    void this.noticeEl.offsetWidth; // restart the animation
    this.noticeEl.classList.add('on');
  }

  sfx(name, volume) {
    const now = performance.now();
    if (name === 'ui_click' && now - this._sfxAt < 45) return;
    this._sfxAt = now;
    try {
      this.game.audio?.play?.(name, volume != null ? { volume } : undefined);
    } catch {
      /* audio is optional */
    }
  }

  focusEl(node, silent = false, scroll = true) {
    if (!node) return;
    const changed = document.activeElement !== node;
    try {
      node.focus({ preventScroll: true });
    } catch {
      node.focus();
    }
    if (scroll) {
      try {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* ignore */
      }
    }
    if (changed && !silent) this.sfx('ui_click', 0.6);
  }

  // ================================================================ DOM + input

  _buildDom() {
    const noise = noiseTile();
    this.stage = el('div', { class: 'm-stage' });
    this.osdMode = el('div', { class: 'm-osd-mode', text: 'PLAY ▶' });
    this.osdCounter = el('div', { class: 'm-osd-counter', text: 'SP 0:00:00' });
    this.osdDate = el('span', { class: 'm-osd-date' });
    this.osdTime = el('span', { class: 'm-osd-time' });
    this.osdPlace = el('div', { class: 'm-osd-place' });
    this.hints = el('div', { class: 'm-hints', 'aria-hidden': 'true' });
    this.noticeEl = el('div', { class: 'm-notice', role: 'status' });
    this.root = el(
      'div',
      { class: 'm-root', hidden: true, 'data-ctx': 'title' },
      el('div', { class: 'm-backdrop' }),
      this.stage,
      el(
        'div',
        { class: 'm-vhs', 'aria-hidden': 'true' },
        el('div', { class: 'm-noise', style: noise ? { backgroundImage: `url(${noise})` } : null }),
        el('div', { class: 'm-scan' }),
        el('div', { class: 'm-track' }),
      ),
      el(
        'div',
        { class: 'm-osd', 'aria-hidden': 'true' },
        this.osdMode,
        this.osdCounter,
        el('div', { class: 'm-osd-stamp' }, this.osdPlace, el('div', null, this.osdDate, this.osdTime)),
      ),
      this.hints,
      this.noticeEl,
    );
    this.cut = el('div', { class: 'm-cut', 'aria-hidden': 'true', style: noise ? { backgroundImage: `url(${noise})` } : null }, el('span', { text: 'PLAY ▶' }));
    this.rotateEl = el(
      'button',
      { type: 'button', class: 'm-rotate', hidden: true, 'aria-label': 'Rotate your phone for the best view. Tap to dismiss.' },
      el('span', { class: 'm-rotate-icon', 'aria-hidden': 'true' }),
      el('span', { text: 'Rotate your phone for the best view' }),
      el('span', { class: 'm-rotate-x', 'aria-hidden': 'true', text: '✕' }),
    );
    this.rotateEl.addEventListener('click', () => {
      this._rotateDismissed = true;
      writeFlag(ROTATE_KEY);
      this._updateRotateHint();
    });
    this.root.classList.toggle('m-touch', this._touchMode);
    const ui = this.game.uiRoot || document.body;
    ui.append(this.root, this.cut, this.rotateEl);
  }

  _bindInput() {
    // Audio needs a user gesture: unlock on the first few pointer/key events.
    let unlocks = 0;
    const unlock = () => {
      try {
        this.game.audio?.unlock?.();
      } catch {
        /* ignore */
      }
      if (++unlocks > 6) {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('pointerup', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('pointerup', unlock, true);
    window.addEventListener('keydown', unlock, true);

    // Capture phase on window: runs before core/input.js, so menu keys never leak into gameplay.
    window.addEventListener('keydown', (e) => this._onKey(e), true);
    window.addEventListener(
      'pointerdown',
      (e) => this._setTouchMode(e.pointerType === 'touch' || e.pointerType === 'pen'),
      true,
    );

    // Mouse hover moves the highlight (console-style). Touch just taps.
    this.root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest?.('button');
      if (!b || b.disabled || !this.root.contains(b)) return;
      const scope = this.modal?.el || this.current?.el;
      if (!scope || !scope.contains(b) || document.activeElement === b) return;
      if (document.activeElement?.type === 'text') return; // don't steal focus from typing
      this.focusEl(b, false, false);
    });
  }

  _onKey(e) {
    if (!this.context) return;
    if (this._launching) {
      // the tape is already rolling into gameplay
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this._setTouchMode(false);
    const t = e.target;
    const tag = t?.tagName;
    const isText = tag === 'INPUT' && (t.type === 'text' || t.type === 'search');
    if (isText) {
      // Enter / Esc / ↓ finish typing and move on; ↑ moves back up.
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        this.moveFocus(e.key === 'ArrowUp' ? 'up' : 'down');
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = DIR_KEYS[e.code];
    if (dir) {
      if (tag === 'INPUT' && t.type === 'range' && (dir === 'left' || dir === 'right')) {
        if (e.code.startsWith('Key')) {
          // WASD on a slider steps it like the arrow keys
          e.preventDefault();
          stepRange(t, dir === 'right' ? 1 : -1);
        }
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.moveFocus(dir);
      return;
    }
    if (e.key === 'Escape' || e.key === 'Backspace') {
      // At a root screen Esc falls through: in the pause menu Game then calls hidePause().
      if (!this.modal && this.stack.length <= 1) {
        if (e.key === 'Backspace') e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.sfx('ui_click');
      this.back();
      return;
    }
    if (e.code === 'Space' || e.key === 'Enter') {
      if (tag === 'BUTTON') {
        // core/input.js preventDefaults Space; click explicitly so both keys activate buttons
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) t.click();
      } else if (!this.root.contains(document.activeElement)) {
        e.preventDefault();
        this.moveFocus('down');
      }
    }
  }

  /** Spatial navigation: move the highlight to the nearest control in a direction. */
  moveFocus(dir) {
    const scope = this.modal?.el || this.current?.el;
    if (!scope) return;
    const items = focusablesIn(scope);
    if (!items.length) return;
    const cur = items.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) {
      const p = this._pendingFocus;
      this.focusEl(p && items.includes(p) ? p : items[0]);
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (it === cur) continue;
      const q = it.getBoundingClientRect();
      if (!q.width && !q.height) continue;
      const qx = q.left + q.width / 2;
      const qy = q.top + q.height / 2;
      let along;
      let gap;
      let off;
      if (dir === 'down' || dir === 'up') {
        along = dir === 'down' ? q.top - r.top : r.bottom - q.bottom;
        if (along <= 2 || (dir === 'down' ? qy <= cy : qy >= cy)) continue;
        gap = Math.max(0, Math.max(q.left, r.left) - Math.min(q.right, r.right));
        off = Math.abs(qx - cx);
      } else {
        along = dir === 'right' ? q.left - r.left : r.right - q.right;
        if (along <= 2 || (dir === 'right' ? qx <= cx : qx >= cx)) continue;
        gap = Math.max(0, Math.max(q.top, r.top) - Math.min(q.bottom, r.bottom));
        off = Math.abs(qy - cy);
      }
      const score = along + gap * 4 + off * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (!best && !this.modal && this.current?.wrap && (dir === 'down' || dir === 'up')) {
      best = dir === 'down' ? items[0] : items[items.length - 1];
    }
    if (best) this.focusEl(best);
  }

  _pollPad(dt) {
    let pads;
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : null;
    } catch {
      return;
    }
    if (!pads) return;
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (!pad) return;
    const btn = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
    const prev = this._pad.prev;
    const edge = (i) => btn(i) && !prev[i];
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    let dir = null;
    if (btn(12) || ay < -0.6) dir = 'up';
    else if (btn(13) || ay > 0.6) dir = 'down';
    else if (btn(14) || ax < -0.6) dir = 'left';
    else if (btn(15) || ax > 0.6) dir = 'right';
    if (dir) {
      if (dir !== this._pad.dir) {
        this._pad.dir = dir;
        this._pad.hold = -0.35; // first repeat after a short delay
        this._padMove(dir);
      } else {
        this._pad.hold += dt;
        if (this._pad.hold > 0.14) {
          this._pad.hold = 0;
          this._padMove(dir);
        }
      }
    } else {
      this._pad.dir = null;
    }
    const a0 = edge(0);
    const b1 = edge(1);
    for (let i = 0; i < 16; i++) prev[i] = btn(i);
    if (a0) {
      const a = document.activeElement;
      if (a && this.root.contains(a) && a.tagName === 'BUTTON') a.click();
      else this.moveFocus('down');
    }
    if (b1) {
      if (this.context === 'pause' && this.stack.length <= 1 && !this.modal) this.hidePause();
      else this.back();
    }
    if (dir || a0 || b1) {
      if (this.game.input) this.game.input.lastDevice = 'gamepad';
      this._setTouchMode(false);
    }
  }

  _padMove(dir) {
    const a = document.activeElement;
    if (a && a.type === 'range' && (dir === 'left' || dir === 'right')) {
      stepRange(a, dir === 'right' ? 1 : -1);
      return;
    }
    this.moveFocus(dir);
  }

  _setTouchMode(on) {
    if (this._touchMode === on) return;
    this._touchMode = on;
    this.root.classList.toggle('m-touch', on);
    this._updateHints();
  }

  _updateHints() {
    const device = this._touchMode ? 'touch' : this.game.input?.lastDevice === 'gamepad' ? 'gamepad' : 'keyboard';
    const atRoot = this.stack.length <= 1;
    this.hints.textContent = '';
    for (const [k, v] of MENU_HINTS[device] || []) {
      let label = v;
      if (v === 'Back' && atRoot) {
        if (this.context !== 'pause') continue; // nothing to go back to on the title
        label = 'Resume';
      }
      this.hints.append(el('span', null, el('kbd', { text: k }), ` ${label}`));
    }
    this.hints.hidden = !this.hints.childElementCount;
  }

  // ---------------------------------------------------------------- VHS on-screen display
  _tickOsd() {
    const g = this.game;
    const secs = Math.floor(this.context === 'pause' ? g.time?.elapsed || 0 : this._tape);
    if (secs === this._osdSec) return;
    this._osdSec = secs;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    this.osdCounter.textContent = `SP ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    // camcorder date stamp: day 1 = July 1, 1993
    const day = g.clock?.day || 1;
    const d = new Date(Date.UTC(1993, 6, day));
    this.osdDate.textContent = `${MONTHS[d.getUTCMonth()]}. ${d.getUTCDate()} 1993`;
    this.osdTime.textContent = clockText(g.clock?.hour ?? 19);
    if (this.context === 'title' && g.layout && g.focus) {
      try {
        const where = g.layout.describe(g.focus.x, g.focus.z);
        this.osdPlace.textContent = (where?.street || where?.district?.name || '').replace(/^near /, '').toUpperCase();
      } catch {
        this.osdPlace.textContent = '';
      }
    }
  }

  // ---------------------------------------------------------------- phone portrait hint
  _updateRotateHint() {
    const g = this.game;
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    const show = g.mode === 'play' && !g.paused && !this.context && !!g.input?.isTouch && portrait && !this._rotateDismissed;
    if (this.rotateEl.hidden === !show) return;
    this.rotateEl.hidden = !show;
  }

  _installDebug() {
    this._debugInstalled = true;
    const api = this.game.debugApi;
    api.menu = {
      screen: () => this.current?.id || null,
      stack: () => this.stack.map((s) => s.id),
      context: () => this.context,
      go: (id, params) => this.go(id, params),
      back: () => this.back(),
      flow: () => JSON.parse(JSON.stringify(this.flow)),
      previewOk: () => !!this.current?.preview?.ok,
    };
  }
}

function stepRange(input, sign) {
  const step = Number(input.step) || 1;
  const v = Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + sign * step));
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function cssEscape(s) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private mode: dismissal lasts this session only */
  }
}
