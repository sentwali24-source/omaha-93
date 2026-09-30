// The 1993 pager: a black plastic belt pager with a green backlit dot-matrix LCD.
//
// Messages queue up and show one at a time (slide in, buzz, auto-dismiss). The LCD is drawn on a
// canvas with a hand-made 5×7 dot-matrix font, so it looks like a real pager at any DPR and costs
// nothing per frame (redrawn only when the message or its page changes).

import { clockText } from '../../core/math.js';

const COLS = 16;
const ROWS = 4; // row 0 = header (sender + time), rows 1..3 = message
const MAX_QUEUE = 6;

// 5×7 font: 7 rows per glyph, 5 bits per row (16 = leftmost dot).
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], "'": [12, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0], ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8], '/': [0, 1, 2, 4, 8, 16, 0], '&': [12, 18, 20, 8, 21, 18, 13],
  $: [4, 15, 20, 14, 5, 30, 4], '#': [10, 10, 31, 10, 31, 10, 10], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '@': [14, 17, 1, 13, 21, 21, 14], '+': [0, 4, 4, 31, 4, 4, 0],
  '=': [0, 0, 31, 0, 31, 0, 0], '*': [0, 4, 21, 14, 21, 4, 0], _: [0, 0, 0, 0, 0, 0, 31],
  '%': [24, 25, 2, 4, 8, 19, 3], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8],
  '▼': [0, 0, 31, 14, 4, 0, 0], // page-down arrow
};

/** Word-wrap `text` to `cols` (uppercase, unsupported characters dropped). */
function wrap(text, cols) {
  const clean = String(text || '')
    .toUpperCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .split('')
    .filter((c) => FONT[c] || c === '\n')
    .join('');
  const lines = [];
  for (const para of clean.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (!word) continue;
      let w = word;
      while (w.length > cols) {
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(w.slice(0, cols));
        w = w.slice(cols);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= cols) line += ' ' + w;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export class Pager {
  constructor(game, hud) {
    this.game = game;
    this.hud = hud;
    this.queue = [];
    this.current = null; // { from, text, lines, time, t, dur, page }
    this.gap = 0;

    const el = document.createElement('div');
    el.className = 'hud-pager';
    el.innerHTML = `
      <div class="pager-body">
        <div class="pager-top"><span class="pager-brand">BEEPMAX<b>II</b></span><span class="pager-led"></span></div>
        <div class="pager-lcd"><canvas></canvas></div>
        <div class="pager-keys"><span></span><span></span><span class="round"></span></div>
        <div class="pager-count"></div>
      </div>`;
    this.el = el;
    this.body = el.querySelector('.pager-body');
    this.canvas = el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.countEl = el.querySelector('.pager-count');
    this._count = -1;
  }

  push(from, text) {
    const now = this.game.time?.elapsed ?? 0;
    // de-dupe: the same message twice within a second (event + direct call)
    const last = this.queue[this.queue.length - 1] || this.current;
    if (last && last.from === from && last.text === text && now - last.at < 1.5) return false;
    const msg = { from: String(from || 'UNKNOWN'), text: String(text || ''), at: now };
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(msg);
    return true;
  }

  clear() {
    this.queue.length = 0;
    this.current = null;
    this.gap = 0;
    this.el.classList.remove('show', 'buzz');
  }

  update(dt) {
    if (!this.current) {
      if (this.gap > 0) {
        this.gap -= dt;
      } else if (this.queue.length) {
        this._show(this.queue.shift());
      }
    } else {
      const c = this.current;
      c.t += dt;
      if (c.t > 0.7 && c.buzzing) {
        c.buzzing = false;
        this.body.classList.remove('buzz');
      }
      const pages = Math.max(1, Math.ceil(c.lines.length / (ROWS - 1)));
      const page = Math.min(pages - 1, Math.floor(c.t / 2.6));
      if (page !== c.page) {
        c.page = page;
        this._render();
      }
      if (c.t >= c.dur) {
        this.current = null;
        this.gap = 0.45;
        this.el.classList.remove('show');
      }
    }
    const n = this.queue.length;
    if (n !== this._count) {
      this._count = n;
      this.countEl.textContent = n ? `+${n} MSG` : '';
      this.countEl.style.display = n ? 'block' : 'none';
    }
  }

  _show(msg) {
    const lines = wrap(msg.text, COLS);
    const pages = Math.max(1, Math.ceil(lines.length / (ROWS - 1)));
    const time = clockText(this.game.clock?.hour ?? 12).replace(' AM', 'A').replace(' PM', 'P');
    this.current = { ...msg, lines, time, t: 0, dur: Math.min(14, 4.5 + pages * 2.6 + msg.text.length * 0.02), page: -1, buzzing: true };
    this.el.classList.add('show');
    this.body.classList.remove('buzz');
    void this.body.offsetWidth; // restart the buzz animation
    this.body.classList.add('buzz');
  }

  /** Draw the LCD dot matrix for the current message/page. */
  _render() {
    const c = this.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pitch = Math.max(3, Math.round(3 * dpr)); // device px per dot (integer = crisp)
    const W = COLS * 6 * pitch;
    const H = ROWS * 8 * pitch + pitch * 2;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.canvas.style.width = `${W / dpr}px`;
      this.canvas.style.height = `${H / dpr}px`;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    const rows = [];
    // header: sender left, time right
    const from = c.from.toUpperCase().slice(0, COLS - c.time.length - 1);
    rows.push(from + ' '.repeat(Math.max(1, COLS - from.length - c.time.length)) + c.time);
    const start = Math.max(0, c.page) * (ROWS - 1);
    for (let i = 0; i < ROWS - 1; i++) rows.push(c.lines[start + i] || '');
    const pages = Math.ceil(c.lines.length / (ROWS - 1));
    if (pages > 1 && c.page < pages - 1) {
      const last = rows[ROWS - 1];
      rows[ROWS - 1] = (last + ' '.repeat(COLS)).slice(0, COLS - 1) + '▼';
    }
    const dot = pitch - Math.max(1, Math.round(dpr * 0.6));
    for (let r = 0; r < ROWS; r++) {
      const text = rows[r];
      // row 0 is the header; a dotted rule separates it from the message
      const y0 = r * 8 * pitch + (r > 0 ? pitch * 2 : 0);
      for (let col = 0; col < COLS; col++) {
        const g = FONT[text[col]] || FONT[' '];
        const x0 = col * 6 * pitch;
        for (let gy = 0; gy < 7; gy++) {
          const bits = g[gy];
          for (let gx = 0; gx < 5; gx++) {
            const on = (bits >> (4 - gx)) & 1;
            ctx.fillStyle = on ? 'rgba(12, 32, 10, 0.92)' : 'rgba(20, 50, 16, 0.07)';
            ctx.fillRect(x0 + gx * pitch, y0 + gy * pitch, dot, dot);
          }
        }
      }
    }
    // header rule (every other dot lit)
    ctx.fillStyle = 'rgba(12, 32, 10, 0.75)';
    const ry = Math.round(8.4 * pitch);
    for (let x = 0; x < W; x += pitch * 2) ctx.fillRect(x, ry, dot, Math.max(1, Math.round(dot * 0.6)));
  }
}
