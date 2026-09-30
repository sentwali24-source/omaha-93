// Control reference tables for the Controls screen (ARCHITECTURE.md §5, core/input.js bindings).
// keys: array of keycaps; a nested array means "either of these" (rendered with a slash).

export const KEYBOARD = [
  { keys: [['W', 'A', 'S', 'D'], ['↑', '←', '↓', '→']], action: 'Walk / drive' },
  { keys: [['Mouse']], action: 'Look around (click the game to lock the mouse)' },
  { keys: [['Shift']], action: 'Run' },
  { keys: [['Space']], action: 'Jump · handbrake in a car' },
  { keys: [['Click'], ['J']], action: 'Punch (tap again for a combo)' },
  { keys: [['E']], action: 'Use / talk / shop (tap or hold)' },
  { keys: [['F']], action: 'Get in / out · carjack' },
  { keys: [['Q']], action: 'Throw up your set' },
  { keys: [['G']], action: 'Homies: follow / wait' },
  { keys: [['H']], action: 'Horn' },
  { keys: [['R']], action: 'Next radio station (in a car)' },
  { keys: [['C']], action: 'Camera distance' },
  { keys: [['M'], ['Tab']], action: 'Map' },
  { keys: [['Esc'], ['P']], action: 'Pause' },
];

export const TOUCH = [
  { keys: [['Left thumb']], action: 'Walk / drive (the stick appears under your thumb)' },
  { keys: [['Drag right side']], action: 'Look around' },
  { keys: [['PUNCH']], action: 'Punch (tap again for a combo)' },
  { keys: [['JUMP']], action: 'Jump' },
  { keys: [['SPRINT']], action: 'Hold to run' },
  { keys: [['CAR']], action: 'Get in / out · carjack (glows next to a car)' },
  { keys: [['ACTION']], action: 'Use / talk / shop (shows what it does; hold for tags)' },
  { keys: [['SIGN']], action: 'Throw up your set' },
  { keys: [['BRAKE'], ['HORN'], ['RADIO']], action: 'In a car: handbrake, horn, next station' },
  { keys: [['MAP'], ['Radar']], action: 'Full map' },
  { keys: [['❚❚']], action: 'Pause (top right)' },
];

export const GAMEPAD = [
  { keys: [['L stick']], action: 'Walk / steer' },
  { keys: [['R stick']], action: 'Look around' },
  { keys: [['A']], action: 'Jump · handbrake' },
  { keys: [['X']], action: 'Punch' },
  { keys: [['B']], action: 'Use / talk / shop' },
  { keys: [['Y']], action: 'Get in / out · carjack' },
  { keys: [['RT']], action: 'Run' },
  { keys: [['LT']], action: 'Brake / reverse' },
  { keys: [['LB']], action: 'Throw up your set' },
  { keys: [['RB']], action: 'Horn' },
  { keys: [['D-pad ↑']], action: 'Next radio station' },
  { keys: [['L3']], action: 'Camera distance' },
  { keys: [['R3']], action: 'Homies: follow / wait' },
  { keys: [['View']], action: 'Map' },
  { keys: [['Menu']], action: 'Pause' },
];

export const MENU_HINTS = {
  keyboard: [['↑↓←→', 'Move'], ['Enter', 'Select'], ['Esc', 'Back']],
  gamepad: [['D-pad', 'Move'], ['A', 'Select'], ['B', 'Back']],
  touch: [],
};
