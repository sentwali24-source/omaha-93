import * as THREE from 'three';
import { SETS, SIDES, OUTFITS, HATS, NEUTRAL_COLORS } from '../data/sets.js';
import { NAMED_POIS } from '../data/map.js';
import { Progression } from './progression.js';
import { PRICES, HEAL, OUTFIT_PRICES, HAT_PRICES, HAIRCUTS, TAPES, RESPRAY_COLORS, FALLBACK_NAMES, SHOP_ICONS } from './gameplay/catalog.js';
import { buildFallbackProps } from './gameplay/fallbackProps.js';
import { getShopPanel } from '../ui/shopPanel.js';
import { headingTo, money } from '../core/math.js';

// Shops (ARCHITECTURE.md §19): an interaction on every city POI.
//
//   store     pop & chips, +30 HP, $3            food    chicken dinner, +100 HP, $8
//   clothes   outfit + hat + "Wear your colors" / "Go neutral" (panel) → state.wearingColors,
//             state.player.look, emits 'player:outfit' { look }
//   barber    new hair, $12 (panel)              record  buy a tape, $10 → state.flags['radio.<n>']
//   garage    respray the player's last car when it's parked next to the shop: new color and
//             2 fewer heat stars, $100
//   payphone  missions (game.missions.usePayphone), $0.25 a call
//   hood      the player's own set hangout: "Chill with the homies" → heal + save
//
// game.shops.pois (city POIs + fallbacks), game.shops.open (POI of the open panel or null),
// game.shops.pay(amount, reason) → bool (keeps fractional change so a quarter really costs a quarter).
// Emits 'shop:purchase' { shop, item, cost }. Owns the Progression listener (progression.js).

const SHOP_TYPES = ['store', 'food', 'clothes', 'barber', 'garage', 'record', 'payphone'];
const RADIUS = { payphone: 1.7, hood: 2.4, garage: 3.5 };
const LABEL_TYPES = { store: 'Corner store', food: 'Food', clothes: 'Clothes', barber: 'Barber', garage: 'Body shop', record: 'Record store', payphone: 'Payphone', hood: 'The hood' };

export class Shops {
  constructor(game) {
    this.game = game;
    this.open = null;
    this.pois = [];
    this.fallbackTypes = [];
    this.lastCar = null;
    this.progression = new Progression(game);
    this.panel = getShopPanel(game);
    this._handles = [];
    this._later = [];
    this._labels = new WeakMap();
  }

  // ------------------------------------------------------------------ setup
  init() {
    const game = this.game;
    this.progression.init();
    const city = game.city;
    if (city && !Array.isArray(city.pois)) city.pois = [];
    const pois = city?.pois || [];

    // hangouts must exist for every set (the stub city already adds them)
    for (const s of SETS) {
      if (!pois.some((p) => p.id === `hood-${s.id}`)) {
        pois.push({ id: `hood-${s.id}`, type: 'hood', name: `${s.short} hood`, x: s.hood.x, z: s.hood.z, heading: s.hood.heading || 0, zoneId: game.layout.zoneAt(s.hood.x, s.hood.z)?.id || null, district: 'north', fallback: true });
      }
    }
    // fallback storefronts ONLY for types the city has none of (stub city)
    const missing = SHOP_TYPES.filter((t) => !pois.some((p) => this.kindOf(p) === t));
    if (missing.length) {
      const extra = generateFallbackPois(game, missing, pois);
      pois.push(...extra);
      this.fallbackTypes = missing;
      if (extra.length) {
        this.props = buildFallbackProps(game, extra);
        game.scene.add(this.props);
      }
    }
    this.pois = pois;
    for (const poi of pois) this._register(poi);

    game.events.on('player:exitVehicle', ({ vehicle } = {}) => {
      if (vehicle) this.lastCar = vehicle;
    });
    game.events.on('player:enterVehicle', ({ vehicle } = {}) => {
      if (vehicle) this.lastCar = vehicle;
    });
  }

  /** POI type with aliases folded in ('phone booth' is a payphone). */
  kindOf(poi) {
    const t = poi?.type;
    return t === 'phone booth' || t === 'phonebooth' || t === 'phone' ? 'payphone' : t;
  }

  _register(poi) {
    const game = this.game;
    const type = this.kindOf(poi);
    if (!LABEL_TYPES[type]) return;
    const own = () => poi.id === `hood-${game.state?.player?.setId}`;
    // priority 0: the nearest prompt wins, so homies' "Roll with me" at a hood / store still shows
    const h = game.interactions.add({
      id: `shop:${poi.id}`,
      position: poi,
      radius: RADIUS[type] || 2.2,
      priority: 0,
      label: () => this._label(poi),
      enabled: () => !!game.state && !this.panel.isOpen && (type !== 'hood' || own()),
      onInteract: () => this.use(poi),
    });
    this._handles.push(h);
  }

  // prompt labels are built once per POI (Interactions asks every frame)
  _label(poi) {
    const type = this.kindOf(poi);
    if (type === 'payphone') return this.game.missions?.payphoneLabel?.(poi) || 'Use payphone ($0.25)';
    let l = this._labels.get(poi);
    if (!l) {
      l = {
        store: `Pop & chips (${money(PRICES.snack)})`,
        food: `Chicken dinner (${money(PRICES.dinner)})`,
        clothes: `Shop ${poi.name || 'clothes'}`,
        barber: `Haircut (${money(PRICES.haircut)})`,
        respray: `Respray your ride (${money(PRICES.respray)})`,
        garage: `${poi.name || 'Body shop'}: bring a car`,
        record: 'Browse tapes',
        hood: 'Chill with the homies (save)',
      };
      this._labels.set(poi, l);
    }
    if (type === 'garage') return this._carAt(poi) ? l.respray : l.garage;
    return l[type] || poi.name || 'Use';
  }

  onGameStart() {
    this.lastCar = null;
    this._later.length = 0;
    this._attachDebug();
  }

  onGameEnd() {
    this.panel.close(false, true);
    this.open = null;
    this.lastCar = null;
  }

  onPlayerRespawn() {
    if (this.panel.isOpen) this.panel.close(false, true);
    this.open = null;
  }

  serialize() {}

  update(dt) {
    this.panel.update();
    for (let i = this._later.length - 1; i >= 0; i--) {
      const l = this._later[i];
      l.t -= dt;
      if (l.t <= 0) {
        this._later.splice(i, 1);
        l.fn();
      }
    }
  }

  // ------------------------------------------------------------------ money
  /** Charge the player; keeps fractional change (quarters) in state.flags['shops.change']. */
  pay(amount, reason = 'shop') {
    const st = this.game.state;
    if (!st) return false;
    st.flags = st.flags || {};
    const owed = (st.flags['shops.change'] || 0) + amount;
    const whole = Math.floor(owed + 1e-6);
    if (whole > st.cash) {
      this.game.hud?.toast?.("You're broke, homie", { color: '#d4202c', duration: 2.5 });
      this.game.audio?.play?.('ui_click');
      return false;
    }
    st.flags['shops.change'] = +(owed - whole).toFixed(2);
    if (whole > 0) this.game.addCash(-whole, reason);
    return true;
  }

  _purchase(poi, item, cost) {
    this.game.events.emit('shop:purchase', { shop: poi, item, cost });
  }

  // ------------------------------------------------------------------ using a shop
  use(poi) {
    const game = this.game;
    if (!game.state || !game.player) return;
    switch (this.kindOf(poi)) {
      case 'store':
        return this._eat(poi, 'pop & chips', PRICES.snack, HEAL.snack);
      case 'food':
        return this._eat(poi, 'chicken dinner', PRICES.dinner, HEAL.dinner);
      case 'clothes':
        return this._clothes(poi);
      case 'barber':
        return this._barber(poi);
      case 'garage':
        return this._garage(poi);
      case 'record':
        return this._records(poi);
      case 'payphone':
        if (game.missions?.usePayphone) game.missions.usePayphone(poi);
        return;
      case 'hood':
        return this._chill(poi);
      default:
    }
  }

  _eat(poi, item, cost, heal) {
    const game = this.game;
    const p = game.player;
    if (!this.pay(cost, poi.type)) return;
    const before = p.health;
    p.heal?.(heal);
    if (game.state) game.state.health = p.health;
    this._purchase(poi, item, cost);
    game.audio?.play?.('cash');
    const got = Math.round(p.health - before);
    game.hud?.toast?.(got > 0 ? `+${got} HP  ·  ${item}` : `${item}. You already full.`, { color: '#7dff9a', duration: 2.4 });
  }

  _chill(poi) {
    const game = this.game;
    const hud = game.hud;
    hud?.fade?.(true, 0.4);
    game.input.enabled = false;
    this._later.push({
      t: 0.6,
      fn: () => {
        const p = game.player;
        if (p?.alive) p.health = p.maxHealth;
        game.clock.hour = (game.clock.hour + 1) % 24;
        game.input.enabled = !game.paused;
        const ok = game.save();
        hud?.fade?.(false, 0.6);
        hud?.toast?.(ok ? 'Kicked it with the homies. Game saved.' : 'Kicked it with the homies.', { color: SIDES[game.state.player.side]?.light, duration: 3 });
        game.player?.character?.playOnce?.('cheer');
      },
    });
  }

  // ---- clothes ---------------------------------------------------------
  lookFor({ outfit, hat, colors }) {
    const st = this.game.state;
    const side = SIDES[st.player.side] || SIDES.crips;
    const base = { ...(st.player.look || {}) };
    const wear = colors === 'colors';
    const neutral = NEUTRAL_COLORS;
    const look = { ...base, outfit, hat };
    switch (outfit) {
      case 'starter':
        look.shirt = wear ? side.color : neutral[3];
        look.shirt2 = wear ? '#f4f2ea' : neutral[0];
        look.pants = '#2a2a33';
        break;
      case 'flannel':
        look.shirt = wear ? side.dark : neutral[2];
        look.shirt2 = wear ? side.color : neutral[1];
        look.pants = '#b9a47c';
        break;
      case 'tee':
        look.shirt = '#f4f2ea';
        look.shirt2 = '#f4f2ea';
        look.pants = '#34507a';
        break;
      case 'jersey':
        look.shirt = wear ? side.color : neutral[4];
        look.shirt2 = '#f4f2ea';
        look.pants = '#1f1f24';
        break;
      case 'hoodie':
      default:
        look.shirt = wear ? side.dark : neutral[1];
        look.shirt2 = wear ? side.color : neutral[2];
        look.pants = '#2a2a33';
        break;
    }
    look.shoes = '#eeeeee';
    look.hatColor = hat === 'none' ? null : wear ? side.color : '#1c1c1c';
    look.bandana = wear ? side.color : hat === 'bandana' ? '#1c1c1c' : null;
    return look;
  }

  _applyLook(look) {
    const p = this.game.player;
    try {
      p?.character?.setOutfit?.(look);
    } catch (err) {
      console.warn('[shops] setOutfit failed', err);
    }
  }

  _clothes(poi) {
    const game = this.game;
    const st = game.state;
    const cur = st.player.look || {};
    const original = { ...cur };
    const start = { outfit: cur.outfit || 'tee', hat: cur.hat || 'none', colors: st.wearingColors === false ? 'neutral' : 'colors' };
    const side = SIDES[st.player.side];
    const cost = (v) => {
      let c = 0;
      if (v.outfit !== start.outfit || v.colors !== start.colors) c += OUTFIT_PRICES[v.outfit] || 30;
      if (v.hat !== start.hat || (v.colors !== start.colors && v.hat !== 'none')) c += HAT_PRICES[v.hat] || 0;
      return c;
    };
    this.open = poi;
    this.panel.open({
      title: poi.name || 'Clothes',
      subtitle: 'Fresh fits for the summer. Try it on.',
      icon: SHOP_ICONS.clothes,
      accent: side?.color,
      sections: [
        { id: 'outfit', title: 'Fit', value: start.outfit, options: OUTFITS.map((o) => ({ id: o.id, label: o.name, desc: o.desc, price: OUTFIT_PRICES[o.id] })) },
        { id: 'hat', title: 'On your head', value: start.hat, options: HATS.map((h) => ({ id: h.id, label: h.name, price: HAT_PRICES[h.id] })) },
        {
          id: 'colors',
          title: 'Colors',
          value: start.colors,
          options: [
            { id: 'colors', label: 'Wear your colors', desc: `Flamed up in ${side?.name === 'Crips' ? 'blue' : 'red'}. Rivals notice you, rep for signs.` },
            { id: 'neutral', label: 'Go neutral', desc: 'Plain colors. Rivals leave you alone unless you start it.' },
          ],
        },
      ],
      onChange: (v) => this._applyLook(this.lookFor(v)),
      confirm: {
        label: (v) => (cost(v) > 0 ? `Buy (${money(cost(v))})` : 'Keep it'),
        disabled: (v) => cost(v) > (st.cash || 0),
        onConfirm: (v) => {
          const c = cost(v);
          if (c > 0 && !this.pay(c, 'clothes')) return 'keep';
          const look = this.lookFor(v);
          st.player.look = look;
          st.wearingColors = v.colors === 'colors';
          this._applyLook(look);
          if (c > 0) this._purchase(poi, { outfit: v.outfit, hat: v.hat, colors: st.wearingColors }, c);
          game.events.emit('player:outfit', { look });
          game.hud?.toast?.(st.wearingColors ? 'Repping the set.' : 'Low key. Colors off.', { color: st.wearingColors ? side?.light : '#e8e4d8', duration: 2.6 });
          return undefined;
        },
      },
      onClose: (confirmed) => {
        this.open = null;
        if (!confirmed) this._applyLook(original);
      },
    });
  }

  // ---- barber ----------------------------------------------------------
  _barber(poi) {
    const game = this.game;
    const st = game.state;
    const original = { ...(st.player.look || {}) };
    const start = original.hair || 'fade';
    this.open = poi;
    this.panel.open({
      title: poi.name || 'Barber shop',
      subtitle: '"Sit down, young man. What we doing today?"',
      icon: SHOP_ICONS.barber,
      accent: '#1f6fd8',
      sections: [{ id: 'hair', title: 'Cut', value: start, options: HAIRCUTS.map((h) => ({ id: h.id, label: h.name, desc: h.desc, price: PRICES.haircut })) }],
      onChange: (v) => this._applyLook({ ...original, hair: v.hair }),
      confirm: {
        label: (v) => (v.hair === start ? 'Keep it' : `Cut it (${money(PRICES.haircut)})`),
        disabled: (v) => v.hair !== start && (st.cash || 0) < PRICES.haircut,
        onConfirm: (v) => {
          if (v.hair === start) return undefined;
          if (!this.pay(PRICES.haircut, 'barber')) return 'keep';
          st.player.look = { ...original, hair: v.hair };
          this._applyLook(st.player.look);
          this._purchase(poi, { hair: v.hair }, PRICES.haircut);
          game.events.emit('player:outfit', { look: st.player.look });
          game.hud?.toast?.('Looking sharp.', { duration: 2.2 });
          return undefined;
        },
      },
      onClose: (confirmed) => {
        this.open = null;
        if (!confirmed) this._applyLook(original);
      },
    });
  }

  // ---- record store ------------------------------------------------------
  _records(poi) {
    const game = this.game;
    const st = game.state;
    st.flags = st.flags || {};
    this.open = poi;
    this.panel.open({
      title: poi.name || 'Record store',
      subtitle: 'Cassettes $10. Pop one in your car deck.',
      icon: SHOP_ICONS.record,
      accent: '#e0287a',
      sections: [
        {
          id: 'tapes',
          kind: 'actions',
          title: 'Tapes',
          options: TAPES.map((t) => {
            const owned = !!st.flags[`radio.${t.n}`];
            return {
              id: `tape${t.n}`,
              label: t.name,
              desc: `${t.artist} · ${t.desc}`,
              price: owned ? null : PRICES.tape,
              badge: owned ? 'OWNED' : null,
              disabled: owned,
              onPick: () => {
                if (!this.pay(PRICES.tape, 'record')) return;
                st.flags[`radio.${t.n}`] = true;
                this._purchase(poi, { tape: t.n, name: t.name }, PRICES.tape);
                game.hud?.toast?.(`New tape: ${t.name}`, { color: '#ff7fbf', duration: 3 });
                // reopen so the list shows it as owned
                this.panel.close(true, true);
                this._records(poi);
              },
            };
          }),
        },
      ],
      closeLabel: 'Leave',
      onClose: () => {
        this.open = null;
      },
    });
  }

  // ---- body shop -----------------------------------------------------------
  _carAt(poi) {
    const v = this.lastCar;
    const game = this.game;
    if (!v || !game.vehicles.includes(v) || game.player?.vehicle) return null;
    return Math.hypot(v.position.x - poi.x, v.position.z - poi.z) < 12 ? v : null;
  }

  _garage(poi) {
    const game = this.game;
    const v = this._carAt(poi);
    if (!v) {
      game.hud?.toast?.('Park your ride right here and they can respray it.', { duration: 3 });
      return;
    }
    if (!this.pay(PRICES.respray, 'respray')) return;
    const options = RESPRAY_COLORS.filter((c) => c.toLowerCase() !== String(v.color).toLowerCase());
    const color = options[Math.floor(Math.random() * options.length)];
    applyVehicleColor(v, color);
    const police = game.police;
    const heat = police?.heat || 0;
    if (heat > 0) police?.setHeat?.(Math.max(0, heat - 2));
    this._purchase(poi, { respray: color }, PRICES.respray);
    game.audio?.play?.('spray', { x: v.position.x, z: v.position.z });
    game.hud?.toast?.(heat > 0 ? 'Fresh paint. The heat is cooling off.' : 'Fresh paint. Looks brand new.', { color: '#9ad3ff', duration: 3 });
  }

  // ------------------------------------------------------------------ debug
  _attachDebug() {
    const game = this.game;
    const api = game.debugApi;
    if (!api || api.shops) return;
    api.shops = {
      list: (type) => this.pois.filter((p) => !type || p.type === type).map((p) => ({ id: p.id, type: p.type, name: p.name, x: +p.x.toFixed(1), z: +p.z.toFixed(1), fallback: !!p.fallback })),
      /** Teleport onto the nearest POI of a type; returns its id. */
      goto: (type) => {
        const p = game.player.position;
        const list = this.pois.filter((q) => q.type === type && (type !== 'hood' || q.id === `hood-${game.state.player.setId}`));
        list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const poi = list[0];
        if (!poi) return null;
        api.teleport(poi.x, poi.z);
        game.player.faceHeading?.(poi.heading || 0);
        return poi.id;
      },
      use: (id) => {
        const poi = this.pois.find((q) => q.id === id);
        if (poi) this.use(poi);
        return !!poi;
      },
      panelOpen: () => this.panel.isOpen,
      fallbackTypes: () => [...this.fallbackTypes],
    };
  }
}

/** Repaint a car. Uses vehicle.setColor when the Vehicle class has it. */
function applyVehicleColor(v, hex) {
  if (typeof v.setColor === 'function') {
    v.setColor(hex);
    return;
  }
  const old = new THREE.Color(v.color || '#000000');
  v.color = hex;
  v.root?.traverse?.((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m?.color && m.color.equals(old)) m.color.set(hex);
  });
}

// ------------------------------------------------------------------ fallback POIs
// Sidewalk points near an anchor, facing the buildings (away from the street).
function sidewalkSpots(game, ax, az, minR, maxR) {
  const L = game.layout;
  const col = game.collision;
  const out = [];
  for (const e of L.edges) {
    const a = L.nodes[e.a];
    const b = L.nodes[e.b];
    if (Math.min(a.x, b.x) - maxR > ax || Math.max(a.x, b.x) + maxR < ax) continue;
    if (Math.min(a.z, b.z) - maxR > az || Math.max(a.z, b.z) + maxR < az) continue;
    const off = e.width / 2 + L.SIDEWALK * 0.55;
    for (let t = 0.14; t < 0.9; t += 0.18) {
      const cx = a.x + (b.x - a.x) * t;
      const cz = a.z + (b.z - a.z) * t;
      for (const side of [-1, 1]) {
        const x = cx + (e.axis === 'z' ? side * off : 0);
        const z = cz + (e.axis === 'x' ? side * off : 0);
        const d = Math.hypot(x - ax, z - az);
        if (d < minR || d > maxR) continue;
        if (!L.isSidewalk(x, z) || L.isWater(x, z) || !col.isFree(x, z, 0.8)) continue;
        const heading = e.axis === 'z' ? headingTo(side, 0) : headingTo(0, side);
        out.push({ x, z, heading, d });
      }
    }
  }
  return out.sort((p, q) => p.d - q.d);
}

function generateFallbackPois(game, types, existing) {
  const L = game.layout;
  const hood = (id) => SETS.find((s) => s.id === id)?.hood;
  const downtown = { x: 400, z: 120 };
  const oldmarket = { x: 515, z: 200 };
  const midtown = { x: -150, z: 60 };
  const anchors = {
    store: [...SETS.map((s) => s.hood), downtown, oldmarket, midtown, { x: 0, z: -690 }, { x: 200, z: -300 }],
    food: [...NAMED_POIS.filter((p) => p.type === 'food').map((p) => ({ ...p.near, name: p.name })), hood('psc'), hood('ngc'), hood('wbb'), oldmarket],
    clothes: [hood('lvb'), hood('ngc'), hood('psc'), oldmarket],
    barber: [hood('lvb'), hood('psc'), hood('rlc'), hood('nfp'), downtown],
    garage: [hood('ngc'), hood('nfp'), hood('wbb'), hood('rlc'), { x: 450, z: -400 }, midtown],
    record: [hood('lvb'), hood('ngc'), oldmarket, downtown],
    payphone: [
      ...SETS.flatMap((s) => [s.hood, { x: s.hood.x + 60, z: s.hood.z - 40 }]),
      downtown,
      { x: 330, z: 20 },
      { x: 450, z: 250 },
      oldmarket,
      { x: 520, z: 140 },
      midtown,
      { x: -300, z: 150 },
      { x: 0, z: -690 },
      { x: 200, z: -300 },
      { x: 620, z: -300 },
    ],
  };
  const out = [];
  const taken = existing.map((p) => ({ x: p.x, z: p.z }));
  for (const type of types) {
    const names = FALLBACK_NAMES[type] || [type];
    (anchors[type] || []).forEach((a, i) => {
      if (!a) return;
      const minR = type === 'payphone' ? 5 : 12;
      const spots = sidewalkSpots(game, a.x, a.z, minR, 120);
      const s = spots.find((p) => taken.every((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 > 11 * 11));
      if (!s) return;
      taken.push(s);
      out.push({
        id: `fb-${type}-${i}`,
        type,
        name: a.name || names[i % names.length],
        x: s.x,
        z: s.z,
        heading: s.heading,
        zoneId: L.zoneAt(s.x, s.z)?.id || null,
        district: L.districtAt(s.x, s.z)?.id || null,
        fallback: true,
      });
    });
  }
  return out;
}
