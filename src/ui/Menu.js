import { SETS, SIDES, setsForSide } from '../data/sets.js';

// STUB — replaced by the Menu agent. Keeps the public API from ARCHITECTURE.md.
export class Menu {
  constructor(game) {
    this.game = game;
    this.always = true;
    this.pauseOpen = false;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#fff;font:20px sans-serif;background:rgba(0,0,0,.35)';
    game.uiRoot.appendChild(this.el);
  }

  showTitle() {
    this.el.style.display = 'flex';
    this.el.innerHTML = '<h1>OMAHA \'93</h1>';
    for (const side of Object.values(SIDES)) {
      const b = document.createElement('button');
      b.textContent = `Play as ${side.name}`;
      b.onclick = () => this.quickStart({ side: side.id });
      this.el.appendChild(b);
    }
  }

  quickStart({ side = 'crips', setId = null, name = 'Tester' } = {}) {
    const set = (setId && SETS.find((s) => s.id === setId)) || setsForSide(side)[0];
    this.el.style.display = 'none';
    this.game.audio.unlock?.();
    this.game.startNewGame({ name, side: set.side, setId: set.id, look: {} });
  }

  showPause() {
    this.pauseOpen = true;
    this.game.setPaused(true);
  }

  hidePause() {
    this.pauseOpen = false;
    this.game.setPaused(false);
  }

  update() {}
}
