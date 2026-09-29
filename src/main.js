import './ui/styles.css';
import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const params = new URLSearchParams(location.search);

function showFatal(message) {
  uiRoot.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML = `<h1>OMAHA '93</h1><p></p>`;
  box.querySelector('p').textContent = message;
  uiRoot.appendChild(box);
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function start() {
  if (!webglAvailable()) {
    showFatal('This game needs WebGL. Try a recent Chrome, Safari, Firefox or Edge.');
    return;
  }

  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `
    <div class="loading-title">OMAHA <span>'93</span></div>
    <div class="loading-sub">North Omaha · Downtown · Old Market — Summer 1993</div>
    <div class="loading-bar"><div class="loading-fill"></div></div>
    <div class="loading-label">Loading…</div>`;
  uiRoot.appendChild(loading);
  const fill = loading.querySelector('.loading-fill');
  const label = loading.querySelector('.loading-label');

  const game = new Game({ canvas, uiRoot, params });
  try {
    await game.boot((p, text) => {
      fill.style.width = `${Math.round(p * 100)}%`;
      if (text) label.textContent = text;
    });
  } catch (err) {
    console.error(err);
    showFatal(`Something broke while loading: ${err && err.message ? err.message : err}`);
    return;
  }
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);

  // ?autostart=1&side=crips&set=<setId> skips the menus (used by tests and quick play).
  if (params.has('autostart')) {
    const side = params.get('side') || 'crips';
    const setId = params.get('set') || null;
    game.menu.quickStart?.({ side, setId, name: params.get('name') || 'Tester' });
  } else {
    game.menu.showTitle?.();
  }
}

start();
