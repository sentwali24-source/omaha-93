// New Game flow: 1) pick a side  2) claim a set  3) get fresh (character creator)  → hit the block.
import { SIDES, SKIN_TONES, OUTFITS, HATS, setsForSide, setById, zoneById } from '../../../data/sets.js';
import { hasSave, loadGame } from '../../../core/save.js';
import { el, shade } from '../dom.js';
import { paisleyTile } from '../paisley.js';
import { drawTurfMap, rivalNeighbors } from '../minimap.js';
import { CharacterPreview } from '../Preview.js';
import {
  HAIR_STYLES, BUILD_MIN, BUILD_MAX, buildLook, defaultDraft, randomDraft, flagColors, nameSuggestions, cleanName, randomName,
} from '../looks.js';

const SIDE_CTA = { crips: 'Ride blue', bloods: 'Ride red' };

function sideVars(node, side) {
  node.style.setProperty('--side', side.color);
  node.style.setProperty('--side-dark', side.dark);
  node.style.setProperty('--side-light', side.light);
}

function rag(color, dark) {
  const url = paisleyTile(color, { shadow: shade(dark, -0.35) });
  return url ? `url(${url})` : 'none';
}

function backButton(menu) {
  return menu.backButton();
}

// ------------------------------------------------------------------ 1. side
export function sideScreen(menu) {
  const cards = Object.values(SIDES).map((side) => {
    const sets = setsForSide(side.id);
    const card = menu.button(
      null,
      () => {
        if (menu.flow.side !== side.id) {
          menu.flow.setId = null;
          menu.flow.draft = null;
        }
        menu.flow.side = side.id;
        menu.go('set');
      },
      { cls: `m-card m-side-card m-side-${side.id}`, key: `side-${side.id}`, attrs: { 'aria-label': `${side.name}: ${side.blurb}` } },
    );
    sideVars(card, side);
    card.style.setProperty('--rag', rag(side.color, side.dark));
    card.append(
      el('span', { class: 'm-rag', 'aria-hidden': 'true' }),
      el('span', { class: 'm-side-knot', 'aria-hidden': 'true' }),
      el(
        'span',
        { class: 'm-side-inner' },
        el('span', { class: 'm-side-name', text: side.name }),
        el('span', { class: 'm-side-shout', text: `“${side.shout}”` }),
        el('span', { class: 'm-side-blurb', text: side.blurb }),
        el('span', { class: 'm-side-sets' }, sets.map((s) => el('span', { class: 'm-chip-static' }, el('b', { text: s.short }), ` ${s.name}`))),
        el('span', { class: 'm-card-cta', text: `${SIDE_CTA[side.id] || 'Choose'} ▶` }),
      ),
    );
    return card;
  });

  const node = el(
    'section',
    { class: 'm-flow m-sidepick' },
    menu.header(1, 'Pick a side', 'Blue or red. Once you claim it, the whole city knows.'),
    el('div', { class: 'm-side-grid m-scroll' }, cards, el('div', { class: 'm-vs', 'aria-hidden': 'true', text: 'VS' })),
    el('footer', { class: 'm-foot' }, backButton(menu)),
  );
  const pre = menu.flow.side ? cards[Object.keys(SIDES).indexOf(menu.flow.side)] : cards[0];
  return { el: node, focus: pre };
}

// ------------------------------------------------------------------ 2. set
export function setScreen(menu) {
  const side = SIDES[menu.flow.side] || SIDES.crips;
  const sets = setsForSide(side.id);
  const layout = menu.game.layout;
  const maps = [];

  const cards = sets.map((set) => {
    const card = menu.button(
      null,
      () => {
        if (menu.flow.setId !== set.id) menu.flow.draft = null;
        menu.flow.setId = set.id;
        menu.go('creator');
      },
      { cls: 'm-card m-set-card', key: `set-${set.id}`, attrs: { 'aria-label': `${set.name}. ${set.blurb}` } },
    );
    sideVars(card, side);
    card.style.setProperty('--accent', set.accent);
    const hood = safeDescribe(layout, set.hood.x, set.hood.z);
    const turf = set.turf.map((id) => zoneById(id)?.name).filter(Boolean).join(' · ');
    const beef = rivalNeighbors(set).map((s) => s.short).join(' · ') || 'Across town';
    const canvas = el('canvas', { class: 'm-set-map', width: 384, height: 216, 'aria-hidden': 'true' });
    maps.push([canvas, set]);
    card.append(
      el(
        'span',
        { class: 'm-set-band', style: { backgroundImage: rag(set.accent, side.dark) } },
        el('span', { class: 'm-set-short', text: set.short }),
        el('span', { class: 'm-set-name', text: set.name }),
      ),
      el('span', { class: 'm-set-mapwrap' }, canvas),
      el(
        'span',
        { class: 'm-set-info' },
        kv('Hood', hood || '—'),
        kv('Turf', turf || '—'),
        kv('Beef', beef),
      ),
      el('span', { class: 'm-set-blurb', text: set.blurb }),
      el('span', { class: 'm-card-cta', text: `Claim ${set.short} ▶` }),
    );
    return card;
  });

  const draw = () => {
    for (const [c, s] of maps) {
      try {
        drawTurfMap(c, layout, s, 384, 216);
      } catch (err) {
        console.warn('[menu] turf map failed', err);
      }
    }
  };

  const legendEl = el(
    'div',
    { class: 'm-legend', 'aria-hidden': 'true' },
    el('span', null, el('i', { class: 'own', style: { background: side.color } }), 'Your turf'),
    el('span', null, el('i', { class: 'ally', style: { background: side.color } }), 'Allies'),
    el('span', null, el('i', { class: 'rival', style: { background: SIDES[side.rival].color } }), 'Rivals'),
    el('span', null, el('i', { class: 'open' }), 'Up for grabs'),
    el('span', null, el('i', { class: 'star', text: '★' }), 'Hood'),
  );

  const node = el(
    'section',
    { class: 'm-flow m-setpick' },
    menu.header(2, 'Claim a set', `Three ${side.name} sets run North O. Pick the one you came up with.`),
    el('div', { class: 'm-set-grid m-scroll' }, cards),
    el('footer', { class: 'm-foot' }, backButton(menu), legendEl),
  );
  sideVars(node, side);
  const pre = cards.find((c) => c.dataset.key === `set-${menu.flow.setId}`) || cards[0];
  return {
    el: node,
    focus: pre,
    onShow() {
      draw();
      // redraw once the webfonts are in so map labels use them
      if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => node.isConnected && draw());
    },
  };
}

function kv(k, v) {
  return el('span', { class: 'm-kv' }, el('b', { text: k }), el('span', { text: v }));
}

function safeDescribe(layout, x, z) {
  try {
    return layout?.describe?.(x, z)?.street || '';
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------ 3. creator
export function creatorScreen(menu) {
  const flow = menu.flow;
  const side = SIDES[flow.side] || SIDES.crips;
  const set = setById(flow.setId) || setsForSide(side.id)[0];
  if (!flow.draft) flow.draft = defaultDraft(side.id, set.id);
  const draft = flow.draft;
  if (!draft.placeholder) draft.placeholder = randomName(side.id);
  let preview = null;
  let buildTimer = 0;
  let pendingBuild = false;
  const groups = [];

  // ---- preview column
  const stageHost = el('div', { class: 'm-preview-stage' });
  const tagName = el('span', { class: 'm-tag-name' });
  const previewCol = el(
    'div',
    { class: 'm-preview', style: { backgroundImage: rag(side.color, side.dark) } },
    el('span', { class: 'm-preview-glow', 'aria-hidden': 'true' }),
    stageHost,
    el('div', { class: 'm-preview-tag' }, tagName, el('span', { class: 'm-tag-set', text: set.name })),
    el('div', { class: 'm-preview-hint', text: 'Drag to spin' }),
  );

  const refreshTag = () => {
    tagName.textContent = cleanName(draft.name) || draft.placeholder;
  };
  const refreshPreview = () => {
    preview?.setLook(buildLook(draft, side.id));
  };
  const refreshAll = () => {
    for (const g of groups) g.sync();
    nameInput.value = draft.name;
    buildRange.value = String(draft.build);
    outfitDesc.textContent = OUTFITS.find((o) => o.id === draft.outfit)?.desc || '';
    refreshTag();
    refreshPreview();
  };

  // ---- options column
  const nameInput = el('input', {
    type: 'text',
    class: 'm-name-input',
    maxlength: 16,
    placeholder: draft.placeholder,
    autocomplete: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: 'done',
    'aria-label': 'Street name',
    'data-key': 'name',
  });
  nameInput.value = draft.name;
  nameInput.addEventListener('input', () => {
    if (nameInput.value.length > 16) nameInput.value = nameInput.value.slice(0, 16);
    draft.name = nameInput.value;
    refreshTag();
  });
  nameInput.addEventListener('change', () => {
    draft.name = cleanName(nameInput.value);
    nameInput.value = draft.name;
    refreshTag();
  });
  const dice = menu.button(el('span', { class: 'm-dice', 'aria-hidden': 'true' }), () => {
    draft.name = randomName(side.id);
    nameInput.value = draft.name;
    refreshTag();
    preview?.playOnce('point');
  }, { cls: 'm-btn m-btn-icon', key: 'dice', attrs: { 'aria-label': 'Random name', title: 'Random name' } });
  const suggestions = el(
    'div',
    { class: 'm-chips m-suggest' },
    nameSuggestions(side.id, 4).map((n, i) =>
      menu.button(n, () => {
        draft.name = n;
        nameInput.value = n;
        refreshTag();
      }, { cls: 'm-chip m-chip-sm', key: `sug-${i}`, sound: 'ui_click' }),
    ),
  );

  const skin = choiceGroup(menu, 'skin', SKIN_TONES.map((c, i) => ({ id: c, swatch: c, label: `Skin tone ${i + 1}` })), () => draft.skin, (v) => {
    draft.skin = v;
    refreshPreview();
  }, 'swatch');
  const flag = choiceGroup(menu, 'flag', flagColors(side.id, set).map((c, i) => ({ id: c, swatch: c, label: ['Side color', 'Set color', 'Dark'][i] || 'Color' })), () => draft.flag, (v) => {
    draft.flag = v;
    refreshPreview();
  }, 'swatch');
  const outfitDesc = el('div', { class: 'm-opt-desc' });
  const outfit = choiceGroup(menu, 'outfit', OUTFITS.map((o) => ({ id: o.id, label: o.name })), () => draft.outfit, (v) => {
    draft.outfit = v;
    outfitDesc.textContent = OUTFITS.find((o) => o.id === v)?.desc || '';
    refreshPreview();
  });
  const hat = choiceGroup(menu, 'hat', HATS.map((h) => ({ id: h.id, label: h.name })), () => draft.hat, (v) => {
    draft.hat = v;
    refreshPreview();
  });
  const hair = choiceGroup(menu, 'hair', HAIR_STYLES.map((h) => ({ id: h.id, label: h.name })), () => draft.hair, (v) => {
    draft.hair = v;
    refreshPreview();
  });
  const body = choiceGroup(menu, 'body', [{ id: 'm', label: 'Guy' }, { id: 'f', label: 'Girl' }], () => (draft.female ? 'f' : 'm'), (v) => {
    draft.female = v === 'f';
    refreshPreview();
  });
  groups.push(skin, flag, outfit, hat, hair, body);

  const buildRange = el('input', {
    type: 'range',
    class: 'm-range',
    min: BUILD_MIN,
    max: BUILD_MAX,
    step: 0.01,
    'aria-label': 'Build',
    'data-key': 'build',
  });
  buildRange.value = String(draft.build);
  buildRange.addEventListener('input', () => {
    draft.build = Number(buildRange.value);
    pendingBuild = true; // rebuilt at most every 120 ms while dragging
  });
  buildRange.addEventListener('change', () => {
    draft.build = Number(buildRange.value);
    pendingBuild = false;
    refreshPreview();
  });

  const options = el(
    'div',
    { class: 'm-options m-scroll' },
    optRow('Street name', el('div', { class: 'm-name-row' }, nameInput, dice), suggestions),
    optRow('Skin tone', skin.el),
    optRow('Your colors', flag.el, el('div', { class: 'm-opt-desc', text: 'Wearing colors: shirt, hat and the rag in your pocket.' })),
    optRow('Fit', outfit.el, outfitDesc),
    optRow('Hat', hat.el),
    optRow('Hair', hair.el),
    optRow('Body', body.el, el('div', { class: 'm-build' }, el('span', { text: 'Slim' }), buildRange, el('span', { text: 'Big' }))),
  );

  const randomize = menu.iconButton('\u2684', 'Random', () => {
    const keepName = draft.name;
    Object.assign(draft, randomDraft(side.id, set.id));
    if (keepName && Math.random() < 0.5) draft.name = keepName;
    refreshAll();
    preview?.playOnce('sign');
  }, { cls: 'm-btn m-btn-ghost m-btn-random', key: 'random' });

  const go = menu.button(el('span', { class: 'm-btn-label', text: 'Hit the block ▶' }), async () => {
    const name = cleanName(draft.name) || draft.placeholder || 'Lil Homie';
    if (hasSave()) {
      const old = loadGame();
      const who = old?.player?.name ? `${old.player.name} (${setById(old.player.setId)?.name || 'saved game'})` : 'your saved game';
      const ok = await menu.confirm({
        title: 'Overwrite save?',
        text: `Starting fresh replaces ${who}. There's only one tape in this deck.`,
        yes: 'Start fresh',
        no: 'Keep it',
        danger: true,
      });
      if (!ok) return;
    }
    draft.name = name;
    preview?.playOnce('cheer');
    menu.startNewGame({ name, side: side.id, setId: set.id, look: buildLook(draft, side.id) });
  }, { cls: 'm-btn m-btn-primary m-btn-go', key: 'go' });

  const node = el(
    'section',
    { class: 'm-flow m-creator' },
    menu.header(3, 'Get fresh', `${set.name} · ${side.name}`),
    el('div', { class: 'm-creator-body' }, previewCol, options),
    el('footer', { class: 'm-foot' }, backButton(menu), randomize, go),
  );
  sideVars(node, side);
  refreshAll();

  const scr = {
    el: node,
    focus: go,
    preview: null,
    onShow() {
      preview = new CharacterPreview(stageHost, { accent: side.light });
      scr.preview = preview;
      refreshPreview();
      setTimeout(() => preview?.playOnce('sign'), 700);
    },
    onHide() {
      preview?.dispose();
      preview = null;
      scr.preview = null;
    },
    update(dt) {
      if (pendingBuild) {
        buildTimer += dt;
        if (buildTimer > 0.12) {
          buildTimer = 0;
          pendingBuild = false;
          refreshPreview();
        }
      }
      preview?.update(dt);
    },
  };
  return scr;
}

function optRow(label, ...content) {
  return el('div', { class: 'm-opt' }, el('div', { class: 'm-opt-label', text: label }), el('div', { class: 'm-opt-body' }, content));
}

/**
 * Row of mutually exclusive options (chips or color swatches).
 * @returns {{ el, sync() }} sync() re-reads the current value and updates the pressed states.
 */
function choiceGroup(menu, key, options, get, set, kind = 'chip') {
  const buttons = options.map((o) => {
    const b = menu.button(kind === 'swatch' ? null : o.label, () => {
      set(o.id);
      sync();
    }, { cls: kind === 'swatch' ? 'm-swatch' : 'm-chip', key: `${key}-${o.id}`, sound: 'ui_click', attrs: { 'aria-label': o.label, 'aria-pressed': 'false', title: o.label } });
    if (o.swatch) b.style.setProperty('--sw', o.swatch);
    b.dataset.value = o.id;
    return b;
  });
  const node = el('div', { class: kind === 'swatch' ? 'm-swatches' : 'm-chips', role: 'group' }, buttons);
  function sync() {
    const v = get();
    for (const b of buttons) b.setAttribute('aria-pressed', b.dataset.value === v ? 'true' : 'false');
  }
  sync();
  return { el: node, sync };
}
