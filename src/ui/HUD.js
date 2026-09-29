// STUB — replaced by the HUD agent. Keeps the public API from ARCHITECTURE.md.
export class HUD {
  constructor(game) {
    this.game = game;
    this.always = true;
    this.el = document.createElement('div');
    this.el.className = 'hud-stub';
    this.el.style.cssText = 'position:fixed;left:12px;bottom:12px;color:#fff;font:14px monospace;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';
    game.uiRoot.appendChild(this.el);
    this.prompt = null;
    this.markers = new Map();
  }

  show() {}
  hide() {}
  setPrompt(text) {
    this.prompt = text;
  }
  toast(text) {
    console.log('[toast]', text);
  }
  bigMessage(title, sub) {
    console.log('[big]', title, sub || '');
  }
  setObjective() {}
  pager(from, text) {
    console.log('[pager]', from, text);
  }
  dialog(speaker, text) {
    console.log('[dialog]', speaker, text);
  }
  addMarker(m) {
    this.markers.set(m.id, m);
    return m.id;
  }
  removeMarker(id) {
    this.markers.delete(id);
  }
  fade() {}

  update() {
    const g = this.game;
    if (g.mode !== 'play' || !g.player) {
      this.el.textContent = '';
      return;
    }
    const p = g.player.position;
    const loc = g.layout.describe(p.x, p.z);
    this.el.textContent = `${loc.street}\n${loc.zone ? loc.zone.name : loc.district.name}\n$${g.state.cash}  HP ${Math.round(g.player.health)}  FPS ${g.perf.fps}${this.prompt ? '\n[E] ' + this.prompt : ''}`;
  }
}
