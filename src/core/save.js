// localStorage persistence. Every access is wrapped: storage can be missing,
// full, or blocked (private mode), and the game must still run.
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
  const data = read(SAVE_KEY);
  if (!data || data.version !== 1) return null;
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
