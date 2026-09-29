// Context "use" prompts: shops, payphones, homies to recruit, tag spots, mission givers.
// The player presses (or holds) the interact action near one. Only the best candidate
// is shown on the HUD at a time.
//
//   const h = game.interactions.add({
//     position: { x, z } | () => ({ x, z }),
//     radius: 2,                       // meters
//     label: 'Use payphone' | () => string,
//     holdTime: 0,                     // seconds; 0 = tap
//     enabled: () => true,
//     priority: 0,                     // higher wins over distance
//     onInteract: (game) => {},
//     onHoldProgress: (p) => {},       // optional, 0..1 while holding
//   });
//   h.remove();

let nextId = 1;

export class Interactions {
  constructor(game) {
    this.game = game;
    this.items = new Map();
    this.current = null;
    this.progress = 0;
  }

  add(def) {
    const id = def.id ?? `ia${nextId++}`;
    const item = {
      radius: 2,
      holdTime: 0,
      priority: 0,
      enabled: () => true,
      ...def,
      id,
    };
    this.items.set(id, item);
    return { id, remove: () => this.remove(id) };
  }

  remove(id) {
    if (this.current && this.current.id === id) {
      this.current = null;
      this.progress = 0;
    }
    this.items.delete(id);
  }

  _pos(item) {
    return typeof item.position === 'function' ? item.position() : item.position;
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    const hud = game.hud;
    if (!player || player.vehicle || !player.alive || game.mode !== 'play') {
      this.current = null;
      this.progress = 0;
      hud?.setPrompt(null);
      return;
    }
    const px = player.position.x;
    const pz = player.position.z;
    let best = null;
    let bestScore = Infinity;
    for (const item of this.items.values()) {
      let ok = true;
      try {
        ok = item.enabled();
      } catch {
        ok = false;
      }
      if (!ok) continue;
      const p = this._pos(item);
      if (!p) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d > item.radius) continue;
      const score = d - item.priority * 100;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (best !== this.current) {
      this.current = best;
      this.progress = 0;
    }
    if (!best) {
      hud?.setPrompt(null);
      return;
    }

    const label = typeof best.label === 'function' ? best.label() : best.label;
    const input = game.input;
    if (best.holdTime > 0) {
      if (input.held('interact')) {
        this.progress = Math.min(1, this.progress + dt / best.holdTime);
        best.onHoldProgress?.(this.progress);
        if (this.progress >= 1) {
          this.progress = 0;
          this._fire(best);
        }
      } else if (this.progress > 0) {
        this.progress = Math.max(0, this.progress - dt * 2);
        best.onHoldProgress?.(this.progress);
      }
    } else if (input.pressed('interact')) {
      this._fire(best);
    }
    hud?.setPrompt(label, best.holdTime > 0 ? this.progress : null, best.holdTime > 0 ? 'hold' : 'tap');
  }

  _fire(item) {
    try {
      item.onInteract?.(this.game, item);
    } catch (err) {
      console.error('[interactions] onInteract threw', err);
    }
  }
}
