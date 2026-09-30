// Settings and Controls screens (shared by the title menu and the pause menu).
import { DEFAULT_SETTINGS } from '../../../core/save.js';
import { el } from '../dom.js';
import { KEYBOARD, TOUCH, GAMEPAD } from '../controlsData.js';

const pct = (v) => `${Math.round(v * 100)}%`;

// ------------------------------------------------------------------ settings
export function settingsScreen(menu) {
  const game = menu.game;
  const s = () => game.settings || {};
  const syncers = [];
  const apply = (partial) => {
    try {
      game.applySettings(partial);
    } catch (err) {
      console.error('[menu] applySettings failed', err);
    }
  };

  const segmented = (key, options) => {
    const buttons = options.map((o) =>
      menu.button(o.label, () => {
        apply({ [key]: o.id });
        sync();
      }, { cls: 'm-seg', key: `${key}-${o.id}`, attrs: { 'aria-pressed': 'false' } }),
    );
    const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', s()[key] === options[i].id ? 'true' : 'false'));
    sync();
    syncers.push(sync);
    return el('div', { class: 'm-segs', role: 'group' }, buttons);
  };

  const slider = (key, { min, max, step, fmt, sound = false, label = key }) => {
    const out = el('output', { class: 'm-range-val' });
    const input = el('input', { type: 'range', class: 'm-range', min, max, step, 'aria-label': label, 'data-key': key });
    const sync = () => {
      const v = Number(s()[key] ?? min);
      input.value = String(v);
      out.textContent = fmt(v);
      input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    };
    input.addEventListener('input', () => {
      const v = Number(input.value);
      apply({ [key]: v });
      out.textContent = fmt(v);
      input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    });
    if (sound) input.addEventListener('change', () => menu.sfx('ui_click'));
    sync();
    syncers.push(sync);
    return el('div', { class: 'm-range-row' }, input, out);
  };

  const toggle = (key, label = key) => {
    const b = menu.button(el('span', { class: 'm-toggle-knob', 'aria-hidden': 'true' }), () => {
      apply({ [key]: !s()[key] });
      sync();
    }, { cls: 'm-toggle', key, sound: 'ui_click', attrs: { role: 'switch', 'aria-checked': 'false', 'aria-label': label } });
    const state = el('span', { class: 'm-toggle-text' });
    b.append(state);
    const sync = () => {
      const on = !!s()[key];
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      state.textContent = on ? 'On' : 'Off';
    };
    sync();
    syncers.push(sync);
    return b;
  };

  const row = (label, control, note) =>
    el('div', { class: 'm-set-row' }, el('div', { class: 'm-set-label' }, el('span', { text: label }), note ? el('small', { text: note }) : null), el('div', { class: 'm-set-ctl' }, control));

  const section = (title, ...rows) => el('div', { class: 'm-set-section' }, el('div', { class: 'm-set-title', text: title }), rows);

  const done = menu.backButton('Done');
  const reset = menu.button('Reset defaults', async () => {
    const ok = await menu.confirm({ title: 'Reset settings?', text: 'Quality, volume and controls go back to the defaults.', yes: 'Reset', no: 'Cancel' });
    if (!ok) return;
    apply(DEFAULT_SETTINGS());
    syncers.forEach((f) => f());
    menu.notice('Settings reset');
  }, { cls: 'm-btn m-btn-ghost', key: 'reset' });

  const node = el(
    'section',
    { class: 'm-flow m-settings' },
    menu.header(0, 'Settings', null),
    el(
      'div',
      { class: 'm-panel m-settings-panel m-scroll' },
      section(
        'Video',
        row('Quality', segmented('quality', [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }]), 'Low for phones. Applies right away; building detail updates on the next launch.'),
        row('Show FPS', toggle('showFps', 'Show FPS')),
      ),
      section(
        'Sound',
        row('Master volume', slider('masterVolume', { min: 0, max: 1, step: 0.05, fmt: pct, sound: true, label: 'Master volume' })),
        row('Music & radio', slider('musicVolume', { min: 0, max: 1, step: 0.05, fmt: pct, sound: true, label: 'Music and radio volume' })),
        row('Sound effects', slider('sfxVolume', { min: 0, max: 1, step: 0.05, fmt: pct, sound: true, label: 'Sound effects volume' })),
        row('Subtitles', toggle('subtitles', 'Subtitles')),
      ),
      section(
        'Controls',
        row('Look sensitivity', slider('sensitivity', { min: 0.3, max: 2.5, step: 0.05, fmt: (v) => `${v.toFixed(2)}×`, label: 'Look sensitivity' })),
        row('Invert look Y', toggle('invertY', 'Invert look Y')),
        row('Touch controls size', slider('touchScale', { min: 0.7, max: 1.5, step: 0.05, fmt: pct, label: 'Touch controls size' }), 'On-screen buttons on phones and tablets'),
      ),
    ),
    el('footer', { class: 'm-foot' }, done, reset),
  );
  return { el: node, focus: node.querySelector('[aria-pressed="true"]') || done };
}

// ------------------------------------------------------------------ controls
export function controlsScreen(menu) {
  const input = menu.game.input;
  const tabs = [
    { id: 'keyboard', label: 'Keyboard & mouse', rows: KEYBOARD },
    { id: 'touch', label: 'Touch', rows: TOUCH },
    { id: 'gamepad', label: 'Gamepad', rows: GAMEPAD },
  ];
  let active = input?.lastDevice === 'gamepad' ? 'gamepad' : input?.isTouch ? 'touch' : 'keyboard';
  const table = el('div', { class: 'm-ctl-table', role: 'table' });
  const tabButtons = tabs.map((t) =>
    menu.button(t.label, () => {
      active = t.id;
      render();
    }, { cls: 'm-tab', key: `tab-${t.id}`, sound: 'ui_click', attrs: { role: 'tab', 'aria-selected': 'false' } }),
  );

  function render() {
    tabButtons.forEach((b, i) => b.setAttribute('aria-selected', tabs[i].id === active ? 'true' : 'false'));
    const tab = tabs.find((t) => t.id === active);
    table.textContent = '';
    table.dataset.kind = active;
    for (const r of tab.rows) {
      const keys = el('div', { class: 'm-ctl-keys', role: 'cell' });
      r.keys.forEach((group, gi) => {
        if (gi) keys.append(el('span', { class: 'm-ctl-or', text: '/' }));
        for (const k of group) keys.append(el('kbd', { class: k.length > 3 ? 'wide' : '', text: k }));
      });
      table.append(el('div', { class: 'm-ctl-row', role: 'row' }, keys, el('div', { class: 'm-ctl-action', role: 'cell', text: r.action })));
    }
  }
  render();

  const back = menu.backButton();
  const node = el(
    'section',
    { class: 'm-flow m-controls' },
    menu.header(0, 'Controls', 'Keyboard + mouse, touch, or any standard gamepad.'),
    el('div', { class: 'm-tabs', role: 'tablist' }, tabButtons),
    el('div', { class: 'm-panel m-ctl-panel m-scroll' }, table),
    el('footer', { class: 'm-foot' }, back),
  );
  return { el: node, focus: tabButtons[tabs.findIndex((t) => t.id === active)] };
}
