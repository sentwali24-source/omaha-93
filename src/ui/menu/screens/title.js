// Title screen (over the live attract flyover) and the About / disclaimer screen.
import { hasSave, loadGame } from '../../../core/save.js';
import { rankForRep, setById, SIDES } from '../../../data/sets.js';
import { money } from '../../../core/math.js';
import { el } from '../dom.js';

export function titleScreen(menu) {
  const save = hasSave() ? loadGame() : null;
  const items = [];

  if (save) {
    const set = setById(save.player?.setId);
    const rank = rankForRep(save.rep || 0);
    const side = SIDES[save.player?.side];
    const sub = [save.player?.name, set?.name, rank.name, `Day ${save.clock?.day || 1}`, money(save.cash || 0)].filter(Boolean).join('  ·  ');
    const b = item(menu, 'Continue', () => menu.continueGame(), { key: 'continue', sub });
    if (side) b.style.setProperty('--item-accent', side.light);
    items.push(b);
  }
  items.push(
    item(menu, 'New Game', () => {
      menu.flow = { side: null, setId: null, draft: null };
      menu.go('side');
    }, { key: 'new' }),
    item(menu, 'Settings', () => menu.go('settings'), { key: 'settings' }),
    item(menu, 'Controls', () => menu.go('controls'), { key: 'controls' }),
    item(menu, 'About', () => menu.go('about'), { key: 'about' }),
  );

  const node = el(
    'section',
    { class: 'm-title', 'aria-label': "Omaha '93" },
    el(
      'div',
      { class: 'm-title-col' },
      el(
        'h1',
        { class: 'm-logo', 'aria-label': "Omaha '93" },
        el('span', { class: 'm-logo-omaha m-chroma', 'data-text': 'OMAHA' }, el('span', { class: 'm-fill', text: 'OMAHA' })),
        el('span', { class: 'm-logo-93', text: '\u201993' }),
      ),
      el('div', { class: 'm-tagline' }, el('span', { text: 'North O · Downtown · Old Market' }), el('b', { text: 'Summer 1993' })),
      el('nav', { class: 'm-mainlist', 'aria-label': 'Main menu' }, items),
    ),
    el('div', { class: 'm-title-note' }, el('span', { class: 'm-portrait-note', text: 'Best played in landscape' }), el('span', { text: 'A work of fiction' })),
  );

  return { el: node, focus: items[0], wrap: true };
}

/** Big list item: label + optional second line. */
export function item(menu, label, fn, { key, sub, cls = '' } = {}) {
  const b = menu.button(null, fn, { cls: `m-item ${cls}`.trim(), key });
  b.append(el('span', { class: 'm-item-mark', 'aria-hidden': 'true', text: '▶' }), el('span', { class: 'm-item-label', text: label }));
  if (sub) b.append(el('span', { class: 'm-item-sub', text: sub }));
  return b;
}

export function aboutScreen(menu) {
  const back = menu.backButton();
  const node = el(
    'section',
    { class: 'm-about' },
    menu.header(0, 'About', "Omaha '93"),
    el(
      'div',
      { class: 'm-panel m-about-panel m-scroll' },
      el('div', { class: 'm-about-label', text: '■ Disclaimer' }),
      el('p', {
        class: 'm-about-lead',
        text: 'All sets, characters and events in this game are fictional. Real 1993 Omaha places — North 24th Street, the Old Market, downtown — are used as a setting, with respect for the North Omaha community.',
      }),
      el('p', {
        text: 'Summer 1993 was the summer of the Great Flood: the Missouri ran high and brown past the riverfront, and it rained more days than it didn’t. Pagers buzzed, payphones rang, and the tape deck did the rest.',
      }),
      el('p', { text: 'Conflict here is fists, spray paint, fast cars and police heat. No firearms, no drugs.' }),
      el('div', { class: 'm-about-label', text: '■ Credits' }),
      el('p', { class: 'm-about-built' }, 'Built with ', el('b', { text: 'Three.js' }), '. Every model, texture and sound is generated in code — nothing downloaded.'),
      el('p', { class: 'm-about-fine', text: 'Fonts: Anton, Bebas Neue, VT323 (SIL Open Font License) and Permanent Marker (Apache License 2.0).' }),
    ),
    el('footer', { class: 'm-foot' }, back),
  );
  return { el: node, focus: back };
}
