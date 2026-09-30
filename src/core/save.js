// localStorage persistence. Every access is wrapped: storage can be missing,
// full, or blocked (private mode), and the game must still run.
import { setById } from '../data/sets.js';

const SAVE_KEY = 'omaha93.save.v1';
const SETTINGS_KEY = 'omaha93.settings.v1';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function isMobileDevice() {
  try {
    return (
      matchMedia('(pointer: coarse)').matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
    );
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS = () => ({
  quality: isMobileDevice() ? 'low' : 'medium', // 'low' | 'medium' | 'high'
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  sensitivity: 1.0, // camera look multiplier
  invertY: false,
  showFps: false,
  touchScale: 1.0, // size multiplier for on-screen controls
  subtitles: true,
});

export function loadSettings() {
  return { ...DEFAULT_SETTINGS(), ...(read(SETTINGS_KEY) || {}) };
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, settings);
}

export function loadGame() {
  return sanitizeSave(read(SAVE_KEY));
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * A save that cannot be played (no valid player / set) counts as no save. Values a bad write or an
 * older build could leave behind (NaN saved as null, wrong types) are dropped so Game.continueGame
 * falls back to the new-game defaults for them instead of propagating NaN / strings.
 */
function sanitizeSave(data) {
  if (!isObj(data) || data.version !== 1 || !isObj(data.player)) return null;
  const set = setById(data.player.setId);
  if (!set) return null;
  data.player.side = set.side;
  if (typeof data.player.name !== 'string') data.player.name = 'Lil Homie';
  if (!isObj(data.player.look)) data.player.look = {};
  for (const k of ['cash', 'rep', 'health']) if (!isNum(data[k])) delete data[k];
  if (typeof data.wearingColors !== 'boolean') delete data.wearingColors;
  const c = data.clock;
  if (!isObj(c) || !isNum(c.hour) || c.hour < 0 || c.hour >= 24 || !isNum(c.day)) delete data.clock;
  const p = data.position;
  if (!isObj(p) || !isNum(p.x) || !isNum(p.z)) data.position = null;
  else if (!isNum(p.heading)) p.heading = 0;
  for (const k of ['turf', 'missions', 'stats', 'flags']) if (!isObj(data[k])) delete data[k];
  if (data.turf) for (const z of Object.keys(data.turf)) if (!isObj(data.turf[z]) || !isNum(data.turf[z].control)) delete data.turf[z];
  if (data.stats) for (const k of Object.keys(data.stats)) if (!isNum(data.stats[k])) delete data.stats[k];
  return data;
}

export function saveGame(state) {
  return write(SAVE_KEY, state);
}

export function hasSave() {
  return !!loadGame();
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
