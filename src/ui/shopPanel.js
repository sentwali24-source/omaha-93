import './shop.css';
import { money } from '../core/math.js';

// Small modal panel for shops, the payphone and the clothes/barber/record counters.
// 90s storefront styling (shop.css). Works with mouse, touch, keyboard (↑↓ / W S, Enter / E /
// Space, Esc / Backspace) and gamepad (d-pad, A, B). While open, game.input.enabled = false and
// every keydown is swallowed before the game's Input sees it (so Esc closes the panel instead of
// opening the pause menu); the previous input state is restored on close.
//
//   const panel = getShopPanel(game);
//   panel.open({
//     title, subtitle, accent: '#d4202c', icon: '✂',
//     sections: [{ id, title, kind: 'choice' | 'actions', value, options: [{ id, label, desc, price, badge, disabled, onPick }] }],
//     confirm: { label: (values) => 'Buy ($40)', disabled: (values) => false, onConfirm: (values) => {} } | null,
//     onChange: (values) => {}, onClose: (confirmed) => {}, closeLabel: 'Leave',
//   });
//   panel.close();  panel.isOpen

export function getShopPanel(game) {
  if (!game._shopPanel) game._shopPanel = new ShopPanel(game);
  return game._shopPanel;
}

export class ShopPanel {
  constructor(game) {
    this.game = game;
    this.el = null;
    this.opts = null;
    this.values = {};
    this.buttons = [];
    this.focus = 0;
    this._prevInput = true;
    this._pad = {};
    this._onKey = (e) => this._key(e);
  }

  get isOpen() {
    return !!this.el;
  }

  open(opts) {
    if (this.el) this.close(false, true);
    const game = this.game;
    this.opts = opts;
    this.values = {};
    for (const s of opts.sections || []) if (s.kind !== 'actions') this.values[s.id] = s.value ?? s.options[0]?.id;
    this._prevInput = game.input.enabled;
    game.input.enabled = false;
    game.input.exitPointerLock?.();
    game.hud?.setPrompt?.(null);

    const root = document.createElement('div');
    root.className = 'shop-backdrop';
    root.style.setProperty('--shop-accent', opts.accent || '#f2b632');
    if (game.input.isTouch || game.input.lastDevice === 'touch') root.classList.add('touch');
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.close(false);
    });
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', opts.title || 'Shop');

    const head = document.createElement('div');
    head.className = 'shop-header';
    head.innerHTML = `<div class="shop-icon"></div><div class="shop-titles"><div class="shop-title"></div><div class="shop-sub"></div></div>`;
    const icon = head.querySelector('.shop-icon');
    icon.textContent = opts.icon || '★';
    if (icon.textContent.length > 2) icon.classList.add('word');
    head.querySelector('.shop-title').textContent = opts.title || 'Shop';
    head.querySelector('.shop-sub').textContent = opts.subtitle || '';
    panel.appendChild(head);

    const body = document.createElement('div');
    body.className = 'shop-body';
    this.buttons = [];
    for (const s of opts.sections || []) {
      const sec = document.createElement('div');
      sec.className = `shop-section shop-${s.kind || 'choice'}`;
      if (s.title) {
        const t = document.createElement('div');
        t.className = 'shop-section-title';
        t.textContent = s.title;
        sec.appendChild(t);
      }
      const list = document.createElement('div');
      list.className = 'shop-options';
      for (const o of s.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shop-opt';
        b.disabled = !!o.disabled;
        b.innerHTML = `<span class="shop-opt-main"><span class="shop-opt-label"></span><span class="shop-opt-desc"></span></span><span class="shop-opt-tag"></span>`;
        b.querySelector('.shop-opt-label').textContent = o.label;
        b.querySelector('.shop-opt-desc').textContent = o.desc || '';
        const tag = b.querySelector('.shop-opt-tag');
        if (o.badge) tag.textContent = o.badge;
        else if (o.price != null) tag.textContent = o.price > 0 ? money(o.price) : 'FREE';
        else tag.remove();
        b.addEventListener('click', () => this._pick(s, o));
        b._section = s;
        b._option = o;
        list.appendChild(b);
        this.buttons.push(b);
      }
      sec.appendChild(list);
      body.appendChild(sec);
    }
    panel.appendChild(body);

    const foot = document.createElement('div');
    foot.className = 'shop-footer';
    const cash = document.createElement('div');
    cash.className = 'shop-cash';
    foot.appendChild(cash);
    this.cashEl = cash;
    if (opts.confirm) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'shop-btn shop-confirm';
      c.addEventListener('click', () => this._confirm());
      foot.appendChild(c);
      this.confirmEl = c;
      this.buttons.push(c);
    } else this.confirmEl = null;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'shop-btn shop-close';
    x.textContent = opts.closeLabel || 'Leave';
    x.addEventListener('click', () => this.close(false));
    foot.appendChild(x);
    this.buttons.push(x);
    panel.appendChild(foot);

    const hint = document.createElement('div');
    hint.className = 'shop-hint';
    hint.textContent = game.input.isTouch ? 'Tap to choose' : '↑↓ choose · Enter select · Esc leave';
    panel.appendChild(hint);

    root.appendChild(panel);
    game.uiRoot.appendChild(root);
    this.el = root;
    window.addEventListener('keydown', this._onKey, true);
    // first enabled, selected option gets focus
    const sel = this.buttons.findIndex((b) => !b.disabled && b._option && this.values[b._section.id] === b._option.id);
    this.focus = sel >= 0 ? sel : Math.max(0, this.buttons.findIndex((b) => !b.disabled));
    this._render();
    requestAnimationFrame(() => root.classList.add('open'));
    game.audio?.play?.('ui_select');
  }

  close(confirmed = false, silent = false) {
    if (!this.el) return;
    const opts = this.opts;
    window.removeEventListener('keydown', this._onKey, true);
    this.el.remove();
    this.el = null;
    this.opts = null;
    this.buttons = [];
    this.game.input.enabled = this._prevInput !== false;
    if (!silent) {
      try {
        opts?.onClose?.(confirmed);
      } catch (err) {
        console.error('[shopPanel] onClose threw', err);
      }
    }
  }

  /** Re-render labels / selection (after a purchase changes cash, for example). */
  refresh() {
    if (this.el) this._render();
  }

  _pick(section, option) {
    if (option.disabled) return;
    this.game.audio?.play?.('ui_click');
    if (section.kind === 'actions') {
      try {
        option.onPick?.(option, this.values);
      } catch (err) {
        console.error('[shopPanel] onPick threw', err);
      }
      this._render();
      return;
    }
    this.values[section.id] = option.id;
    this.focus = Math.max(0, this.buttons.findIndex((b) => b._option === option));
    try {
      this.opts.onChange?.(this.values);
    } catch (err) {
      console.error('[shopPanel] onChange threw', err);
    }
    this._render();
  }

  _confirm() {
    const c = this.opts?.confirm;
    if (!c || c.disabled?.(this.values)) {
      this.game.audio?.play?.('ui_click');
      this.el?.querySelector('.shop-panel')?.classList.remove('shake');
      void this.el?.offsetWidth;
      this.el?.querySelector('.shop-panel')?.classList.add('shake');
      return;
    }
    const values = { ...this.values };
    let keepOpen = false;
    try {
      keepOpen = c.onConfirm?.(values) === 'keep';
    } catch (err) {
      console.error('[shopPanel] onConfirm threw', err);
    }
    if (!keepOpen) this.close(true);
    else this._render();
  }

  _render() {
    const game = this.game;
    this.cashEl.textContent = game.state ? money(game.state.cash) : '';
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      if (b._option) {
        const selected = b._section.kind !== 'actions' && this.values[b._section.id] === b._option.id;
        b.classList.toggle('selected', selected);
        b.setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
      b.classList.toggle('focus', i === this.focus);
    }
    if (this.confirmEl) {
      const c = this.opts.confirm;
      this.confirmEl.textContent = typeof c.label === 'function' ? c.label(this.values) : c.label || 'OK';
      this.confirmEl.classList.toggle('disabled', !!c.disabled?.(this.values));
    }
    const f = this.buttons[this.focus];
    if (f && document.activeElement !== f) {
      try {
        f.focus({ preventScroll: true });
        f.scrollIntoView?.({ block: 'nearest' });
      } catch {
        /* ignore */
      }
    }
  }

  _move(dir) {
    const n = this.buttons.length;
    if (!n) return;
    let i = this.focus;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!this.buttons[i].disabled) break;
    }
    this.focus = i;
    this.game.audio?.play?.('ui_click', { volume: 0.4 });
    this._render();
  }

  _activate() {
    const b = this.buttons[this.focus];
    if (b && !b.disabled) b.click();
  }

  _key(e) {
    if (!this.el) return;
    // swallow every key so the game (pause, map, movement) doesn't react underneath
    e.stopPropagation();
    if (e.repeat && (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space')) {
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this._move(-1);
        break;
      case 'ArrowDown':
      case 'KeyS':
      case 'ArrowRight':
      case 'KeyD':
      case 'Tab':
        e.preventDefault();
        this._move(e.shiftKey && e.code === 'Tab' ? -1 : 1);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
      case 'KeyE':
        e.preventDefault();
        this._activate();
        break;
      case 'Escape':
      case 'Backspace':
      case 'KeyP':
        e.preventDefault();
        this.close(false);
        break;
      default:
        break;
    }
  }

  /** Gamepad navigation (the game's Input is disabled while the panel is open). */
  update() {
    if (!this.el) return;
    let pads;
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      return;
    }
    const pad = [...(pads || [])].find((p) => p && p.connected);
    if (!pad) return;
    const edge = (key, down) => {
      const was = this._pad[key];
      this._pad[key] = down;
      return down && !was;
    };
    const ay = pad.axes[1] || 0;
    if (edge('up', pad.buttons[12]?.pressed || ay < -0.6)) this._move(-1);
    if (edge('down', pad.buttons[13]?.pressed || ay > 0.6)) this._move(1);
    if (edge('a', pad.buttons[0]?.pressed)) this._activate();
    if (edge('b', pad.buttons[1]?.pressed)) this.close(false);
  }
}
