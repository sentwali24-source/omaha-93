// The in-play HUD (ARCHITECTURE.md §20): a 90s crime-game overlay built from plain DOM + canvas.
//
//   top-right   clock + day, green odometer cash, health (heart) + stamina, 5 police badges, rank/rep
//   corner      rotating radar (bottom-left on desktop, top-left on touch) — see hud/Minimap.js
//   location    "N 24th St & Lake St · Lakeview Bloods turf" + a big zone banner on zone change
//   center      slam-in big messages, dialog subtitles, the "press E" prompt with a hold ring
//   extras      toasts, the pager (hud/Pager.js), objective card, radio station, speedometer, FPS, fade
//
// Performance: every DOM write is cached (only written when the value changes), bars use transforms,
// the radar redraws at ~20 Hz, the location lookup runs at 4 Hz. Nothing here allocates per frame
// except when something actually changes on screen.

import './hud.css';
import { clockText, clamp } from '../core/math.js';
import { SIDES, rankForRep, nextRank, setById, zoneById, TURF_ZONES } from '../data/sets.js';
import { Minimap } from './hud/Minimap.js';
import { Pager } from './hud/Pager.js';
import { ICONS, TOAST_ICONS } from './hud/icons.js';
import { zoneInfo } from './hud/mapRender.js';

const MPH = 2.23694;
const SPEEDO_SEGMENTS = 14;
const MAX_TOASTS = 5;

// Default colors for the classic big messages.
const BIG_COLORS = {
  'KNOCKED OUT': '#ff2d3a',
  BUSTED: '#5d9bff',
  'MISSION PASSED': '#ffc23a',
  'MISSION FAILED': '#ff2d3a',
  'TURF TAKEN': '#ffc23a',
  'RANK UP': '#ffc23a',
};

const CASH_REASONS = { bail: 'BAIL', hospital: 'HOSPITAL BILL', respray: 'RESPRAY' };

let markerSeq = 1;

/** Tiny DOM helper: el('div', 'cls', parent, innerHTML?) */
function el(tag, className, parent, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.always = true;
    this.markers = new Map(); // id -> { id, x, z, type, color?, label? } (objects are kept by reference)
    this.visible = false;
    this._userHidden = false;

    // interaction prompt (also read by ui/Touch.js for the ACTION button)
    this.prompt = null;
    this.promptText = null;
    this.promptProgress = null;
    this.promptKind = 'tap';

    this._c = {}; // cache of the last values written to the DOM
    this._toasts = [];
    this._big = null; // { title, sub, color, t, dur }
    this._bigQueue = [];
    this._dialog = null;
    this._dialogQueue = [];
    this._banner = null;
    this._radioT = 0;
    this._hitT = 0;
    this._heatFlashT = 0;
    this._rankFlashT = 0;
    this._locT = 0;
    this._zoneKey = null;
    this._bannerHistory = new Map(); // zone key -> time last shown (anti-flicker at borders)
    this._downT = -1; // counts down to the fade-out after player:down
    this._owners = {}; // zoneId -> owner, to detect "turf lost"
    this._lastHealth = null;
    this._waypointId = null;
    this._lastNow = 0;

    this._build();
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    const g = this.game;
    const root = el('div', 'hud-root hidden', g.uiRoot);
    this.root = root;

    this.fpsEl = el('div', 'hud-fps', root);

    // objective card (top-left on desktop)
    this.objEl = el('div', 'hud-objective', root, '<div class="obj-tag">OBJECTIVE</div><div class="obj-text"></div><div class="obj-timer"></div>');
    this.objText = this.objEl.querySelector('.obj-text');
    this.objTimer = this.objEl.querySelector('.obj-timer');

    // ---- top-right stat stack
    const stats = el('div', 'hud-stats', root);
    this.statsEl = stats;
    const clock = el('div', 'hud-clock', stats, '<span class="clock-time"></span><span class="clock-ampm"></span><span class="clock-day"></span>');
    this.clockTime = clock.querySelector('.clock-time');
    this.clockAmpm = clock.querySelector('.clock-ampm');
    this.clockDay = clock.querySelector('.clock-day');

    const cash = el('div', 'hud-cash', stats, '<span class="cash-sign">$</span>');
    this.cashEl = cash;
    this.odo = [];
    const strip = Array.from({ length: 10 }, (_, i) => `<span>${i}</span>`).join('');
    for (let i = 0; i < 8; i++) {
      const col = el('span', 'odo', cash, `<span class="odo-strip">${strip}</span>`);
      this.odo.push({ col, strip: col.firstChild, d: -1, lead: null });
    }

    const health = el('div', 'hud-health', stats, `<span class="heart">${ICONS.heart}</span><div class="bar"><div class="ghost"></div><div class="fill"></div></div>`);
    this.healthEl = health;
    this.healthFill = health.querySelector('.bar .fill');
    this.healthGhost = health.querySelector('.ghost');
    const stam = el('div', 'hud-stamina', stats, '<div class="fill"></div>');
    this.stamEl = stam;
    this.stamFill = stam.firstChild;

    const heat = el('div', 'hud-heat', stats);
    this.heatEl = heat;
    this.badges = [];
    for (let i = 0; i < 5; i++) this.badges.push(el('span', 'badge', heat, ICONS.badge));

    const rank = el('div', 'hud-rank', stats, '<div class="rank-row"><span class="rank-name"></span><span class="rank-rep"></span></div><div class="rank-bar"><div class="fill"></div></div><div class="rank-next"></div>');
    this.rankEl = rank;
    this.rankName = rank.querySelector('.rank-name');
    this.rankRep = rank.querySelector('.rank-rep');
    this.rankFill = rank.querySelector('.fill');
    this.rankNext = rank.querySelector('.rank-next');

    this.toastEl = el('div', 'hud-toasts', stats);

    // ---- radar + location
    this.minimap = new Minimap(g, this);
    root.appendChild(this.minimap.el);
    this.locEl = el('div', 'hud-location', root, '<span class="loc-street"></span><span class="loc-area"></span>');
    this.locStreet = this.locEl.querySelector('.loc-street');
    this.locArea = this.locEl.querySelector('.loc-area');

    // ---- in-car: speedometer + radio
    const speedo = el('div', 'hud-speedo', root, '<div class="speedo-read"><span class="speedo-num">0</span><span class="speedo-unit">MPH</span></div><div class="speedo-bar"></div>');
    this.speedoEl = speedo;
    this.speedoNum = speedo.querySelector('.speedo-num');
    const bar = speedo.querySelector('.speedo-bar');
    this.speedoSegs = [];
    for (let i = 0; i < SPEEDO_SEGMENTS; i++) {
      const s = el('span', i >= SPEEDO_SEGMENTS - 3 ? 'seg red' : i >= SPEEDO_SEGMENTS - 6 ? 'seg amber' : 'seg', bar);
      this.speedoSegs.push(s);
    }
    this.radioEl = el('div', 'hud-radio', root, `<div class="radio-icon">${ICONS.tape}</div><div class="radio-text"><div class="radio-name"></div><div class="radio-genre"></div></div>`);
    this.radioName = this.radioEl.querySelector('.radio-name');
    this.radioGenre = this.radioEl.querySelector('.radio-genre');

    // ---- zone banner, big message, dialog, prompt
    this.bannerEl = el('div', 'hud-zone', root, '<div class="zone-title"></div><div class="zone-sub"></div>');
    this.bannerTitle = this.bannerEl.querySelector('.zone-title');
    this.bannerSub = this.bannerEl.querySelector('.zone-sub');

    this.bigEl = el('div', 'hud-big', root, '<div class="big-title"></div><div class="big-sub"></div>');
    this.bigTitle = this.bigEl.querySelector('.big-title');
    this.bigSub = this.bigEl.querySelector('.big-sub');

    this.dialogEl = el('div', 'hud-dialog', root, '<span class="dlg-speaker"></span><span class="dlg-text"></span>');
    this.dialogSpeaker = this.dialogEl.querySelector('.dlg-speaker');
    this.dialogText = this.dialogEl.querySelector('.dlg-text');

    this.promptEl = el(
      'div',
      'hud-prompt',
      root,
      '<div class="prompt-key"><svg class="prompt-ring" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="19"/><circle class="prog" cx="22" cy="22" r="19"/></svg><span class="prompt-cap">E</span></div><div class="prompt-text"><span class="prompt-hold">HOLD</span><span class="prompt-label"></span></div>',
    );
    this.promptCap = this.promptEl.querySelector('.prompt-cap');
    this.promptLabel = this.promptEl.querySelector('.prompt-label');
    this.promptRing = this.promptEl.querySelector('.prog');
    this._ringLen = 2 * Math.PI * 19;
    this.promptRing.style.strokeDasharray = `${this._ringLen}`;
    this.promptRing.style.strokeDashoffset = `${this._ringLen}`;

    // ---- pager
    this._pager = new Pager(g, this);
    root.appendChild(this._pager.el);

    // ---- fade (outside the root so it also covers while the HUD is hidden)
    this.fadeEl = el('div', 'hud-fade', g.uiRoot);
  }

  // ------------------------------------------------------------------ lifecycle
  init() {
    const g = this.game;
    const ev = g.events;
    this.minimap.build();
    this._layout();

    ev.on('resize', () => this._layout());
    ev.on('settings:change', () => {
      this._c.fps = null;
      if (g.settings?.subtitles === false) this._clearDialog();
    });
    ev.on('game:start', () => {
      this._reset();
      this._snapshotOwners();
    });
    ev.on('game:end', () => {
      this._reset();
      this.markers.clear();
      this._waypointId = null;
    });

    ev.on('cash:change', (e) => {
      const amt = Math.round(e?.amount || 0);
      if (!amt) return;
      const why = CASH_REASONS[e.reason] ? ` ${CASH_REASONS[e.reason]}` : '';
      this._amountToast('cash' + why, amt, (n) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US')}${why}`, amt > 0 ? 'cash' : 'cashLoss', 'cash');
    });
    ev.on('rep:change', (e) => {
      const amt = Math.round(e?.amount || 0);
      if (!amt) return;
      this._amountToast('rep', amt, (n) => `${n > 0 ? '+' : ''}${n} REP`, amt > 0 ? 'rep' : 'repLoss', 'rep');
    });
    ev.on('rank:up', (e) => {
      this._rankFlashT = 2.8;
      if (e?.rank?.name) this.toast(`RANK UP: ${e.rank.name.toUpperCase()}`, { color: '#ffc23a', icon: 'star', duration: 3.4 });
    });
    ev.on('heat:change', () => {
      this._heatFlashT = 1.8;
    });
    ev.on('pager', (e) => {
      if (e) this._pager.push(e.from, e.text);
    });
    ev.on('dialog', (e) => {
      if (e) this.dialog(e.speaker, e.text, { color: e.color, duration: e.duration });
    });
    ev.on('radio:station', (e) => this._showRadio(e?.station));
    ev.on('player:enterVehicle', () => {
      this._showRadio(g.audio?.radio?.station ?? null, true);
    });
    ev.on('player:down', (e) => {
      const busted = e?.reason === 'busted';
      this.bigMessage(busted ? 'BUSTED' : 'KNOCKED OUT', busted ? 'Bail comes out of your pocket' : 'Waking up back in the hood', { duration: 3.2 });
      this._downT = busted ? 2.5 : 2.9;
    });
    ev.on('player:respawn', () => {
      this._downT = -1;
      this.fade(false, 0.9);
    });
    ev.on('mission:start', (e) => {
      const m = e?.mission;
      if (!m) return;
      if (m.title) this.bigMessage(String(m.title), m.objective ? String(m.objective) : '', { color: '#ffc23a', duration: 3, style: 'title' });
      this.setObjective(m.objective || null);
    });
    ev.on('mission:update', (e) => {
      if (e?.mission && e.mission.objective !== undefined) this.setObjective(e.mission.objective);
    });
    ev.on('mission:complete', (e) => {
      this.bigMessage('MISSION PASSED', rewardText(e?.reward ?? e?.mission?.reward), { duration: 3.6 });
      this.setObjective(null);
    });
    ev.on('mission:fail', (e) => {
      const why = e?.reason || e?.mission?.failReason || '';
      this.bigMessage('MISSION FAILED', why ? String(why) : '', { duration: 3.4 });
      this.setObjective(null);
    });
    ev.on('turf:change', (e) => this._onTurfChange(e));
  }

  onGameStart() {
    // extra test helpers (window.__game.debugApi exists with ?debug)
    const api = this.game.debugApi;
    if (api && !api.pager) {
      api.pager = (from = 'OG', text = '911') => this.pager(from, text);
      api.bigMessage = (title = 'MISSION PASSED', sub = '') => this.bigMessage(title, sub);
      api.waypoint = (x, z) => this.game.mapScreen?.setWaypoint?.(x, z);
      api.hud = () => ({ visible: this.visible, zone: this._zoneKey, prompt: this.promptText, markers: [...this.markers.keys()], big: this._big?.title || null });
    }
  }

  _reset() {
    for (const t of this._toasts) t.el.remove();
    this._toasts.length = 0;
    this._bigQueue.length = 0;
    this._big = null;
    this.bigEl.className = 'hud-big';
    this._clearDialog();
    this._pager.clear();
    this.setObjective(null);
    this.setPrompt(null);
    this.bannerEl.classList.remove('show');
    this._banner = null;
    this._bannerHistory.clear();
    this._zoneKey = null;
    this._locT = 1;
    this._downT = -1;
    this._radioT = 0;
    this.radioEl.classList.remove('show');
    this._lastHealth = null;
    const touch = this._c.touch;
    this._c = { touch };
    for (const o of this.odo) {
      o.d = -1;
      o.lead = null;
    }
    this.minimap.invalidate();
    this.fade(false, 0.4);
  }

  _snapshotOwners() {
    for (const z of TURF_ZONES) {
      if (z.noTurf) continue;
      this._owners[z.id] = zoneInfo(this.game, z).owner;
    }
  }

  /** Recompute layout-dependent sizes (touch vs desktop radar). */
  _layout() {
    const g = this.game;
    const touch = !!(g.touch?.active ?? g.input?.isTouch);
    this.root.classList.toggle('touch', touch);
    this._c.touch = touch;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const short = Math.min(w, h);
    let size;
    if (touch) size = clamp(Math.round(short * 0.3), 104, 150);
    else size = h < 560 ? 150 : 188;
    this.minimap.el.style.width = `${size}px`;
    this.minimap.el.style.height = `${size}px`;
    this.root.style.setProperty('--mm', `${size}px`);
    this.minimap.resize(size);
  }

  // ------------------------------------------------------------------ public API
  show() {
    this._userHidden = false;
  }

  hide() {
    this._userHidden = true;
  }

  /** Called every frame by core Interactions: label or null, hold progress 0..1 or null. */
  setPrompt(text, progress = null, kind = 'tap') {
    const t = text || null;
    this.prompt = t;
    this.promptText = t;
    this.promptProgress = progress;
    this.promptKind = kind || 'tap';
    const c = this._c;
    if (c.promptText !== t) {
      c.promptText = t;
      this.promptEl.classList.toggle('show', !!t);
      if (t) this.promptLabel.textContent = t;
    }
    const hold = !!t && this.promptKind === 'hold';
    if (c.promptHold !== hold) {
      c.promptHold = hold;
      this.promptEl.classList.toggle('hold', hold);
    }
    const p = hold ? clamp(progress || 0, 0, 1) : 0;
    const q = Math.round(p * 100);
    if (c.promptProg !== q) {
      c.promptProg = q;
      this.promptRing.style.strokeDashoffset = `${this._ringLen * (1 - p)}`;
    }
  }

  /** Short popup near the stats, e.g. "+15 REP". opts: { color, icon, duration } */
  toast(text, { color = null, icon = null, duration = 2.4, key = null } = {}) {
    const t = el('div', 'hud-toast', null);
    if (icon) {
      const ico = el('span', 'toast-ico', t, TOAST_ICONS[icon] || '');
      if (!TOAST_ICONS[icon]) ico.textContent = String(icon);
    }
    const txt = el('span', 'toast-text', t);
    txt.textContent = String(text);
    if (color) t.style.setProperty('--tc', color);
    this.toastEl.prepend(t);
    const item = { el: t, txt, t: 0, dur: duration, key, amount: 0, out: false };
    this._toasts.unshift(item);
    while (this._toasts.length > MAX_TOASTS) this._toasts.pop().el.remove();
    return item;
  }

  /** Accumulating money / rep toast: rapid +$5 +$5 becomes one +$10. */
  _amountToast(key, amount, fmt, style, icon) {
    const last = this._toasts.find((x) => x.key === key && x.t < 1.4 && !x.out && Math.sign(x.amount) === Math.sign(amount));
    if (last) {
      last.amount += amount;
      last.txt.textContent = fmt(last.amount);
      last.t = 0;
      last.el.classList.remove('bump');
      void last.el.offsetWidth;
      last.el.classList.add('bump');
      return;
    }
    const colors = { cash: '#5dff7e', cashLoss: '#ff4b4b', rep: '#ffc23a', repLoss: '#d7a2a2' };
    const item = this.toast(fmt(amount), { color: colors[style], icon, key });
    item.amount = amount;
  }

  /**
   * Big slam-in center message. opts: { color, duration, style: 'slam' | 'title', priority }
   * priority 2 (KNOCKED OUT / BUSTED) interrupts whatever is showing and drops the queue.
   */
  bigMessage(title, sub = '', { color = null, duration = 3.2, style = 'slam', priority = null } = {}) {
    const T = String(title || '').toUpperCase();
    if (!T) return;
    const same = (m) => m && m.title === T;
    if (same(this._big) && this._big.t < this._big.dur - 0.5) {
      if (sub && !this._big.sub) {
        this._big.sub = String(sub);
        this.bigSub.textContent = this._big.sub;
      }
      return;
    }
    if (this._bigQueue.some(same)) return;
    const prio = priority ?? (T === 'KNOCKED OUT' || T === 'BUSTED' ? 2 : style === 'title' ? 0 : 1);
    const msg = { title: T, sub: sub ? String(sub) : '', color: color || BIG_COLORS[T] || '#ffffff', dur: duration, t: 0, style, out: false, prio };
    if (prio >= 2) this._bigQueue.length = 0;
    this._bigQueue.push(msg);
    if (this._bigQueue.length > 3) this._bigQueue.shift();
    // higher priority pre-empts what is on screen (results beat mission title cards, KO beats all)
    if (!this._big || prio > this._big.prio) this._nextBig();
  }

  _nextBig() {
    const m = this._bigQueue.shift();
    this._big = m || null;
    const e = this.bigEl;
    if (!m) {
      e.className = 'hud-big';
      return;
    }
    this.bigTitle.textContent = m.title;
    this.bigSub.textContent = m.sub;
    e.style.setProperty('--bc', m.color);
    e.className = 'hud-big';
    void e.offsetWidth; // restart CSS animation
    e.className = `hud-big show ${m.style === 'title' ? 'title' : 'slam'}`;
  }

  setObjective(text) {
    const t = text ? String(text) : null;
    if (this._c.obj === t) return;
    this._c.obj = t;
    this.objEl.classList.toggle('show', !!t);
    if (t) {
      this.objText.textContent = t;
      this.objEl.classList.remove('new');
      void this.objEl.offsetWidth;
      this.objEl.classList.add('new');
    }
  }

  /** Pager popup (queued). Plays the beep itself; the 'pager' event path leaves the beep to Audio. */
  pager(from, text) {
    if (this._pager.push(from, text)) {
      try {
        this.game.audio?.play?.('pager');
      } catch {
        /* audio is optional */
      }
    }
  }

  /** Subtitle line. opts: { color (speaker), duration } */
  dialog(speaker, text, { color = null, duration = null } = {}) {
    if (this.game.settings?.subtitles === false || !text) return;
    const line = { speaker: speaker ? String(speaker) : '', text: String(text), color: color || '#ffc23a', t: 0 };
    line.dur = duration || clamp(1.6 + line.text.length * 0.055, 2.2, 7);
    if (this._dialog && this._dialog.speaker === line.speaker && this._dialog.text === line.text) {
      this._dialog.t = 0;
      return;
    }
    this._dialogQueue.push(line);
    if (this._dialogQueue.length > 4) this._dialogQueue.shift();
    if (!this._dialog) this._nextDialog();
    else if (this._dialog.t > 1.2) this._dialog.dur = Math.min(this._dialog.dur, this._dialog.t + 0.4); // hurry the current line
  }

  _nextDialog() {
    const d = this._dialogQueue.shift() || null;
    this._dialog = d;
    this.dialogEl.classList.toggle('show', !!d);
    if (!d) return;
    this.dialogSpeaker.textContent = d.speaker ? `${d.speaker}:` : '';
    this.dialogSpeaker.style.color = d.color;
    this.dialogText.textContent = d.text;
  }

  _clearDialog() {
    this._dialogQueue.length = 0;
    this._dialog = null;
    this.dialogEl.classList.remove('show');
  }

  /** Map/radar marker. Returns its id. The object is kept by reference (mutate x/z to move it). */
  addMarker(m) {
    if (!m) return null;
    const id = m.id ?? `mk${markerSeq++}`;
    m.id = id;
    if (m.type === 'waypoint') {
      for (const [k, o] of this.markers) if (o.type === 'waypoint' && k !== id) this.markers.delete(k);
      this._waypointId = id;
    }
    this.markers.set(id, m);
    this.minimap.invalidate();
    return id;
  }

  removeMarker(id) {
    this.markers.delete(id);
    if (id === this._waypointId) this._waypointId = null;
    this.minimap.invalidate();
  }

  /** The current waypoint marker or null. */
  getWaypoint() {
    const m = this._waypointId != null ? this.markers.get(this._waypointId) : null;
    return m && m.type === 'waypoint' ? m : null;
  }

  /** Fade the screen to/from black. Resolves when done. */
  fade(toBlack, seconds = 0.6) {
    const e = this.fadeEl;
    e.style.transition = `opacity ${Math.max(0, seconds)}s linear`;
    e.style.opacity = toBlack ? '1' : '0';
    return new Promise((r) => setTimeout(r, Math.max(0, seconds) * 1000));
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const g = this.game;
    const want = g.mode === 'play' && !!g.player && !!g.state && !g.paused && !this._userHidden;
    if (want !== this.visible) {
      this.visible = want;
      this.root.classList.toggle('hidden', !want);
      if (want) this.minimap.invalidate();
      this._lastNow = 0;
    }
    const touch = !!(g.touch?.active ?? g.input?.isTouch);
    if (touch !== this._c.touch) this._layout();
    if (!want) return;

    // UI timers run on real time (capped): game dt is clamped and runs slow on weak devices
    const now = performance.now();
    const rdt = this._lastNow ? Math.min(0.25, (now - this._lastNow) / 1000) : dt;
    this._lastNow = now;

    this._updateStats(rdt);
    this._updateTimers(rdt);
    this._locT += rdt;
    if (this._locT >= 0.25) {
      this._locT = 0;
      this._updateLocation();
    }
    this._updateVehicle();
    this.minimap.update(rdt);
    this._pager.update(rdt);
    this._updateFps();
    this._updatePromptDevice();

    // after a KO / bust: fade out just before Game respawns the player
    if (this._downT > 0) {
      this._downT -= dt;
      if (this._downT <= 0) this.fade(true, 0.6);
    }

    // arriving at the waypoint clears it
    const wp = this.getWaypoint();
    if (wp) {
      const f = g.focus;
      if (Math.hypot(f.x - wp.x, f.z - wp.z) < 12) {
        this.removeMarker(wp.id);
        this.toast('WAYPOINT REACHED', { color: '#ff7fcf', duration: 1.8 });
      }
    }
  }

  _updateStats(dt) {
    const g = this.game;
    const st = g.state;
    const p = g.player;
    const c = this._c;

    // clock
    const hour = g.clock?.hour ?? 12;
    const minute = Math.floor(hour * 60);
    if (c.minute !== minute) {
      c.minute = minute;
      const txt = clockText(hour);
      const sp = txt.indexOf(' ');
      this.clockTime.textContent = txt.slice(0, sp);
      this.clockAmpm.textContent = txt.slice(sp + 1);
    }
    const day = g.clock?.day ?? 1;
    if (c.day !== day) {
      c.day = day;
      this.clockDay.textContent = `DAY ${day}`;
    }

    // cash odometer
    const cash = Math.max(0, Math.min(99999999, Math.round(st.cash || 0)));
    if (c.cash !== cash) {
      c.cash = cash;
      const s = String(cash).padStart(8, '0');
      const firstSig = cash === 0 ? 7 : 8 - String(cash).length;
      for (let i = 0; i < 8; i++) {
        const o = this.odo[i];
        const d = s.charCodeAt(i) - 48;
        if (o.d !== d) {
          o.d = d;
          o.strip.style.transform = `translate3d(0, ${-d * 10}%, 0)`;
        }
        const lead = i < firstSig;
        if (o.lead !== lead) {
          o.lead = lead;
          o.col.classList.toggle('lead', lead);
        }
      }
    }

    // health + damage flash (the pale "ghost" bar lags behind to show the chunk you lost)
    const maxH = p.maxHealth || 100;
    const hp = clamp((p.health || 0) / maxH, 0, 1);
    const hpq = Math.round(hp * 200);
    if (c.hp !== hpq) {
      const dropped = this._lastHealth != null && hp < this._lastHealth - 0.004;
      if (dropped) {
        this._hitT = 0.55;
        this.healthEl.classList.add('hit');
      }
      this._lastHealth = hp;
      c.hp = hpq;
      this.healthFill.style.transform = `scaleX(${hp})`;
      this.healthEl.classList.toggle('low', hp < 0.25);
      if (!dropped && this._hitT <= 0) {
        c.ghost = hpq;
        this.healthGhost.style.transform = `scaleX(${hp})`;
      }
    }
    if (this._hitT > 0) {
      this._hitT -= dt;
      if (this._hitT <= 0) {
        this.healthEl.classList.remove('hit');
        c.ghost = hpq;
        this.healthGhost.style.transform = `scaleX(${hp})`;
      }
    }

    // stamina (dim while full)
    const sta = clamp(p.stamina ?? 1, 0, 1);
    const staq = Math.round(sta * 100);
    if (c.sta !== staq) {
      c.sta = staq;
      this.stamFill.style.transform = `scaleX(${sta})`;
      this.stamEl.classList.toggle('full', staq >= 99);
      this.stamEl.classList.toggle('empty', staq < 15);
    }

    // heat badges
    const heat = clamp(Number(g.police?.heat) || 0, 0, 5);
    const full = Math.floor(heat + 0.001);
    const partial = heat - full > 0.15 ? full : -1;
    const hk = full * 10 + partial;
    if (c.heat !== hk) {
      c.heat = hk;
      for (let i = 0; i < 5; i++) {
        this.badges[i].classList.toggle('on', i < full);
        this.badges[i].classList.toggle('part', i === partial);
      }
      this.heatEl.classList.toggle('active', full > 0);
      this.root.classList.toggle('wanted', full > 0);
    }
    if (this._heatFlashT > 0) {
      this._heatFlashT -= dt;
      if (!c.heatFlash) {
        c.heatFlash = true;
        this.heatEl.classList.add('flash');
      }
    } else if (c.heatFlash) {
      c.heatFlash = false;
      this.heatEl.classList.remove('flash');
    }

    // rank + rep progress
    const rep = Math.max(0, Math.round(st.rep || 0));
    if (c.rep !== rep) {
      c.rep = rep;
      const rank = rankForRep(rep);
      const next = nextRank(rep);
      if (c.rankIdx !== rank.index) {
        c.rankIdx = rank.index;
        this.rankName.textContent = rank.name.toUpperCase();
      }
      this.rankRep.textContent = `${rep.toLocaleString('en-US')} REP`;
      if (next) {
        const f = clamp((rep - rank.rep) / (next.rep - rank.rep), 0, 1);
        this.rankFill.style.transform = `scaleX(${f})`;
        this.rankNext.textContent = `NEXT: ${next.name.toUpperCase()} · ${next.rep.toLocaleString('en-US')}`;
      } else {
        this.rankFill.style.transform = 'scaleX(1)';
        this.rankNext.textContent = 'TOP OF THE SET';
      }
    }
    if (this._rankFlashT > 0) {
      this._rankFlashT -= dt;
      if (!c.rankFlash) {
        c.rankFlash = true;
        this.rankEl.classList.add('up');
      }
    } else if (c.rankFlash) {
      c.rankFlash = false;
      this.rankEl.classList.remove('up');
    }

    // side color accents
    const side = st.player?.side;
    if (c.side !== side) {
      c.side = side;
      const sd = SIDES[side] || SIDES.crips;
      this.root.style.setProperty('--side', sd.color);
      this.root.style.setProperty('--side-light', sd.light);
      this.root.style.setProperty('--side-dark', sd.dark);
    }

    // mission timer on the objective card
    const timer = g.missions?.active?.timer;
    const tt = typeof timer === 'number' && c.obj ? Math.max(0, Math.ceil(timer)) : -1;
    if (c.timer !== tt) {
      c.timer = tt;
      this.objTimer.textContent = tt >= 0 ? `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}` : '';
      this.objEl.classList.toggle('urgent', tt >= 0 && tt <= 10);
    }
  }

  _updateTimers(dt) {
    // toasts
    for (let i = this._toasts.length - 1; i >= 0; i--) {
      const t = this._toasts[i];
      t.t += dt;
      if (t.t >= t.dur && !t.out) {
        t.out = true;
        t.el.classList.add('out');
      }
      if (t.t >= t.dur + 0.35) {
        t.el.remove();
        this._toasts.splice(i, 1);
      }
    }
    // big message
    const b = this._big;
    if (b) {
      b.t += dt;
      if (b.t >= b.dur && !b.out) {
        b.out = true;
        this.bigEl.classList.add('out');
      }
      if (b.t >= b.dur + 0.4) this._nextBig();
    }
    // dialog
    const d = this._dialog;
    if (d) {
      d.t += dt;
      if (d.t >= d.dur) this._nextDialog();
    }
    // zone banner
    if (this._banner) {
      this._banner.t += dt;
      if (this._banner.t >= 3.6) {
        this._banner = null;
        this.bannerEl.classList.remove('show');
      }
    }
    // radio name
    if (this._radioT > 0) {
      this._radioT -= dt;
      if (this._radioT <= 0) this.radioEl.classList.remove('show');
    }
  }

  // ------------------------------------------------------------------ location + zones
  _updateLocation() {
    const g = this.game;
    const f = g.focus;
    let d;
    try {
      d = g.layout.describe(f.x, f.z);
    } catch {
      return;
    }
    const zone = d.zone;
    const district = d.district;
    const info = zone && !zone.noTurf ? zoneInfo(g, zone) : null;

    // location line: "<street or landmark> · <Set> turf | <district>"
    const onStreet = g.layout.isRoad?.(f.x, f.z) || g.layout.isSidewalk?.(f.x, f.z);
    const place = d.landmark && !onStreet ? d.landmark.name : d.street || district?.name || '';
    let area;
    let areaColor;
    if (info && info.set) {
      area = `${info.set.name} turf`;
      areaColor = info.side.light;
    } else if (info) {
      area = `${zone.name} · contested`;
      areaColor = '#cfc8b4';
    } else {
      area = district?.name || '';
      areaColor = '#f4efe3';
    }
    const c = this._c;
    if (c.place !== place) {
      c.place = place;
      this.locStreet.textContent = place;
    }
    if (c.area !== area) {
      c.area = area;
      this.locArea.textContent = area;
      this.locArea.style.color = areaColor;
    }

    // zone change → banner + 'zone:enter'
    const key = `${zone?.id || '-'}|${district?.id || '-'}`;
    if (key !== this._zoneKey) {
      const first = this._zoneKey === null;
      const prevZone = first ? null : this._zoneKey.slice(0, this._zoneKey.indexOf('|'));
      this._zoneKey = key;
      g.events.emit('zone:enter', { zone, district });
      // a new district inside the same claimable zone does not re-announce the zone
      const zoneChanged = first || prevZone !== (zone?.id || '-');
      const now = g.time?.elapsed ?? 0;
      const lastShown = this._bannerHistory.get(key);
      if ((zoneChanged || !info) && (lastShown === undefined || now - lastShown > 6)) {
        this._bannerHistory.set(key, now);
        this._showBanner(zone, district, info);
      }
    }
  }

  _showBanner(zone, district, info) {
    let title;
    let sub;
    let color;
    let cls;
    if (info) {
      title = zone.name;
      if (info.set) {
        const mine = info.owner === this.game.state?.player?.setId;
        const rival = info.set.side !== this.game.state?.player?.side;
        sub = `${info.set.name} turf${mine ? ' · home' : ''}`;
        color = info.set.accent || info.side.light;
        cls = rival ? 'rival' : mine ? 'home' : 'ally';
      } else {
        sub = 'Contested ground';
        color = '#e8e2cf';
        cls = 'contested';
      }
    } else {
      title = district?.name || zone?.name || '';
      const heavy = (district?.policeLevel || 0) >= 1.2;
      sub = zone && zone.name !== title ? `${zone.name} · neutral ground` : heavy ? 'Neutral ground · heavy patrols' : 'Neutral ground';
      color = '#f4efe3';
      cls = 'neutral';
    }
    if (!title) return;
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    const e = this.bannerEl;
    e.style.setProperty('--zc', color);
    e.className = 'hud-zone';
    void e.offsetWidth;
    e.className = `hud-zone show ${cls}`;
    this._banner = { t: 0 };
  }

  _onTurfChange(e) {
    if (!e) return;
    const zone = zoneById(e.zoneId);
    const mySet = this.game.state?.player?.setId;
    const prev = this._owners[e.zoneId];
    this._owners[e.zoneId] = e.owner ?? null;
    this.minimap.invalidate();
    this._c.area = null; // re-color the location line
    if (!zone) return;
    if (e.owner && e.owner === mySet) {
      const side = SIDES[this.game.state?.player?.side];
      this.bigMessage('TURF TAKEN', zone.name, { color: this.game.playerSet?.accent || side?.light || BIG_COLORS['TURF TAKEN'] });
    } else if (prev && prev === mySet) {
      this.bigMessage(`LOST ${zone.name}`, e.owner ? `${setById(e.owner)?.name || 'Rivals'} took it` : '', { color: '#ff2d3a' });
    }
  }

  // ------------------------------------------------------------------ vehicle, radio, fps, prompt
  _updateVehicle() {
    const g = this.game;
    const v = g.player.vehicle;
    const c = this._c;
    const inCar = !!v;
    if (c.inCar !== inCar) {
      c.inCar = inCar;
      this.root.classList.toggle('in-car', inCar);
      c.mph = -1;
    }
    if (!inCar) return;
    const mph = Math.round(Math.abs(v.speed || 0) * MPH);
    if (c.mph !== mph) {
      c.mph = mph;
      this.speedoNum.textContent = String(mph);
      const lit = Math.round(clamp(mph / 90, 0, 1) * SPEEDO_SEGMENTS);
      if (c.segs !== lit) {
        c.segs = lit;
        for (let i = 0; i < SPEEDO_SEGMENTS; i++) this.speedoSegs[i].classList.toggle('on', i < lit);
      }
    }
  }

  _showRadio(station, quiet = false) {
    const stations = this.game.audio?.radio?.stations;
    if (!station && quiet && !(stations && stations.length)) return; // no radio system at all
    const name = station ? String(station.name || station.id || 'RADIO') : 'RADIO OFF';
    const genre = station ? String(station.genre || '') : '';
    this.radioName.textContent = name;
    this.radioGenre.textContent = genre;
    const e = this.radioEl;
    e.classList.remove('show');
    void e.offsetWidth;
    e.classList.add('show');
    this._radioT = 3.6;
  }

  _updateFps() {
    const g = this.game;
    const c = this._c;
    const on = !!g.settings?.showFps;
    if (c.fpsOn !== on) {
      c.fpsOn = on;
      this.fpsEl.style.display = on ? '' : 'none';
      c.fps = null;
    }
    if (!on) return;
    const p = g.perf;
    const key = p.fps * 1e7 + p.calls * 1000 + Math.round(p.triangles / 1000);
    if (c.fps !== key) {
      c.fps = key;
      this.fpsEl.textContent = `${p.fps} FPS · ${p.frameMs} MS · ${p.calls} DC · ${Math.round(p.triangles / 1000)}K TRI`;
    }
  }

  _updatePromptDevice() {
    const g = this.game;
    const c = this._c;
    const dev = g.input?.lastDevice || 'keyboard';
    const touchUi = !!g.touch?.visible;
    if (c.promptDev !== dev || c.promptTouch !== touchUi) {
      c.promptDev = dev;
      c.promptTouch = touchUi;
      this.promptCap.textContent = dev === 'gamepad' ? 'B' : 'E';
      this.promptEl.classList.toggle('pad', dev === 'gamepad');
      this.promptEl.classList.toggle('touch-ui', touchUi);
    }
  }
}

/** "+$200  +50 REP" from a mission reward ({ cash, rep } or a number = cash). */
function rewardText(reward) {
  if (reward == null) return '';
  if (typeof reward === 'number') return reward ? `+$${reward.toLocaleString('en-US')}` : '';
  const parts = [];
  if (reward.cash) parts.push(`+$${Number(reward.cash).toLocaleString('en-US')}`);
  if (reward.rep) parts.push(`+${reward.rep} REP`);
  return parts.join('   ');
}
