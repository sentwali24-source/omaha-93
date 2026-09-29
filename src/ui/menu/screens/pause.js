// Pause menu: Resume, Map, Settings, Controls, Save, Quit to title + a stats card for the player.
import { SIDES, TURF_ZONES, rankForRep, nextRank, setById } from '../../../data/sets.js';
import { money, clockText } from '../../../core/math.js';
import { el, shade } from '../dom.js';
import { paisleyTile } from '../paisley.js';
import { item } from './title.js';

export function pauseScreen(menu) {
  const game = menu.game;
  const st = game.state || {};
  const set = setById(st.player?.setId) || game.playerSet;
  const side = SIDES[st.player?.side] || game.playerSide || SIDES.crips;

  let saveItem = null;
  const items = [
    item(menu, 'Resume', () => menu.hidePause(), { key: 'resume' }),
    item(menu, 'Map', () => menu.openMap(), { key: 'map' }),
    item(menu, 'Settings', () => menu.go('settings'), { key: 'settings' }),
    item(menu, 'Controls', () => menu.go('controls'), { key: 'controls' }),
    (saveItem = item(menu, 'Save game', () => {
      let ok = false;
      try {
        ok = game.save();
      } catch (err) {
        console.error('[menu] save failed', err);
      }
      const msg = ok ? 'Game saved' : 'Could not save (storage full or blocked)';
      game.hud?.toast?.(msg, { icon: ok ? 'save' : undefined });
      menu.notice(ok ? '■ REC  Game saved' : msg);
      const label = saveItem.querySelector('.m-item-label');
      label.textContent = ok ? 'Saved ✓' : 'Save failed';
      setTimeout(() => {
        if (saveItem.isConnected) label.textContent = 'Save game';
      }, 1600);
    }, { key: 'save' })),
    item(menu, 'Quit to title', async () => {
      const ok = await menu.confirm({ title: 'Quit to title?', text: 'Your progress is saved first.', yes: 'Quit', no: 'Keep playing' });
      if (ok) menu.quitToTitle();
    }, { key: 'quit', cls: 'm-item-quit' }),
  ];

  const node = el(
    'section',
    { class: 'm-pause' },
    el(
      'div',
      { class: 'm-pause-col' },
      el('h2', { class: 'm-pause-title' }, el('span', { class: 'm-chroma', 'data-text': 'PAUSED' }, el('span', { class: 'm-fill', text: 'PAUSED' }))),
      el('nav', { class: 'm-mainlist', 'aria-label': 'Pause menu' }, items),
    ),
    statsCard(game, st, set, side),
  );
  node.style.setProperty('--side', side.color);
  node.style.setProperty('--side-light', side.light);
  node.style.setProperty('--side-dark', side.dark);
  return { el: node, focus: items[0], wrap: true };
}

function statsCard(game, st, set, side) {
  const rep = st.rep || 0;
  const rank = rankForRep(rep);
  const next = nextRank(rep);
  const progress = next ? (rep - rank.rep) / (next.rep - rank.rep) : 1;
  const claimable = TURF_ZONES.filter((z) => z.rect && !z.noTurf);
  let held = 0;
  for (const z of claimable) {
    // live owner from the Gangs system, falling back to the saved turf table
    let owner = st.turf?.[z.id]?.owner ?? null;
    try {
      const live = game.gangs?.getZoneOwner?.(z.id);
      if (live !== undefined) owner = live;
    } catch {
      /* keep the saved owner */
    }
    if (set && owner === set.id) held++;
  }
  const missions = st.missions?.completed?.length ?? st.stats?.missions ?? 0;
  const stats = st.stats || {};
  let where = '';
  try {
    const p = game.player?.position;
    if (p) where = game.layout.describe(p.x, p.z)?.street || '';
  } catch {
    where = '';
  }
  const url = paisleyTile(side.color, { shadow: shade(side.dark, -0.35) });

  return el(
    'aside',
    { class: 'm-stats', 'aria-label': 'Your stats' },
    el(
      'div',
      { class: 'm-stats-band', style: { backgroundImage: url ? `url(${url})` : 'none' } },
      el('span', { class: 'm-stats-name', text: st.player?.name || 'You' }),
      el('span', { class: 'm-stats-set', text: set ? `${set.name} · ${set.short}` : side.name }),
    ),
    el(
      'div',
      { class: 'm-stats-body' },
      el(
        'div',
        { class: 'm-rank' },
        el('div', { class: 'm-rank-top' }, el('span', { class: 'm-rank-name', text: rank.name }), el('span', { class: 'm-rank-rep', text: next ? `${rep} / ${next.rep} rep` : `${rep} rep` })),
        el('div', { class: 'm-rank-bar' }, el('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` } })),
        el('div', { class: 'm-rank-next', text: next ? `Next: ${next.name}` : 'Top of the food chain' }),
      ),
      el(
        'div',
        { class: 'm-stat-grid' },
        stat('Cash', money(st.cash || 0), 'cash'),
        stat('Turf held', `${held} / ${claimable.length}`),
        stat('Missions', String(missions)),
        stat('Fights won', String(stats.fightsWon || 0)),
        stat('Walls tagged', String(stats.tags || 0)),
        stat('Cars boosted', String(stats.carsJacked || 0)),
      ),
      el('div', { class: 'm-stats-where' }, el('span', { text: `Day ${game.clock?.day || 1} · ${clockText(game.clock?.hour ?? 12)}` }), where ? el('span', { text: where }) : null),
    ),
  );
}

function stat(label, value, cls = '') {
  return el('div', { class: `m-stat ${cls}`.trim() }, el('b', { text: value }), el('span', { text: label }));
}
