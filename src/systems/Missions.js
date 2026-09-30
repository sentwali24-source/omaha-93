import { SETS, SIDES, setById, zoneById, areRivals, rankForRep, RANKS, TURF_ZONES } from '../data/sets.js';
import { STORY, JOBS, JOB_TEMPLATES, OGS, PAGER_CODES, FLAVOR_PAGES, HOMIE_NAMES } from '../data/missions.js';
import { TEMPLATES, makeParkedCar } from './gameplay/missionTemplates.js';
import { WorldMarkers } from './gameplay/markers.js';
import { PhoneRinger } from './gameplay/phoneRing.js';
import { getShopPanel } from '../ui/shopPanel.js';
import { money } from '../core/math.js';

// Missions (ARCHITECTURE.md §19).
//
//   game.missions.available() → [{ id, title, template, story, rank, reward, desc }]
//   game.missions.active        { id, title, template, story, objective, markers, timer, reward, stage } | null
//   game.missions.start(id) → bool / abort()
//   game.missions.offer         the job the pager is buzzing about ({ id, title, code, phone }) | null
//   game.missions.payphoneLabel(poi) / usePayphone(poi)   (Shops wires payphone POIs to these)
//
// Flow: the OG pages the player ('911' urgent / '411' info) and the nearest payphone rings
// (sound + marker). Answering it (or calling back from any payphone for $0.25) plays the briefing
// as HUD dialog and starts the job. Jobs are templates (gameplay/missionTemplates.js) filled with
// live world targets; the story chain (data/missions.js) unlocks by rank.
// Emits mission:start / mission:update / mission:complete { mission, reward } / mission:fail
// { mission, reason }, and 'pager' { from, text }.

const MARK_COLORS = { mission: '#f2b632', target: '#ff5a5a', payphone: '#7dffb0', hood: '#9ad3ff', shop: '#9ad3ff', waypoint: '#ffffff' };
const COOLDOWN_PASS = 60;
const COOLDOWN_FAIL = 40;
const OFFER_TIME = 150;

export class Missions {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.offer = null;
    this._pageIn = 20;
    this._cooldowns = {};
    this._jobs = [];
    this._jobSeq = 0;
    this._dialog = [];
    this._dialogT = 0;
    this._later = [];
    this._failMsg = null;
    this._lastObjective = null;
    this._bigQ = [];
    this._bigT = 0;
    this.markers = new WorldMarkers(game);
    this.ringer = new PhoneRinger(game);
  }

  // ------------------------------------------------------------------ lifecycle
  init() {
    const ev = this.game.events;
    ev.on('player:down', ({ reason }) => {
      const m = this.active;
      if (m) this.fail(m, reason === 'busted' ? 'You got busted' : 'You got knocked out', { down: true });
    });
    ev.on('rank:up', () => {
      if (!this.active && !this.offer && this._nextStory()) this._pageIn = Math.min(this._pageIn, 14);
    });
    for (const name of ['tag:complete', 'tag:rival', 'actor:ko', 'fight:won', 'player:enterVehicle', 'player:exitVehicle', 'turf:change', 'heat:change']) {
      ev.on(name, (payload) => this._event(name, payload));
    }
  }

  onGameStart(isNew) {
    const st = this.game.state;
    st.missions = { completed: [], counter: 0, ...(st.missions || {}) };
    if (!Array.isArray(st.missions.completed)) st.missions.completed = [];
    this._reset();
    this._pageIn = isNew ? 7 : 25;
    this._attachDebug();
  }

  onGameEnd() {
    if (this.active) this._cleanup(this.active);
    this.active = null;
    this._reset();
  }

  onPlayerRespawn() {
    if (this._failMsg) {
      const r = this._failMsg;
      this._failMsg = null;
      this.later(0.8, () => this.announce('MISSION FAILED', r, { color: '#d4202c', duration: 3.5 }));
    }
  }

  serialize(state) {
    state.missions = { ...(state.missions || {}), completed: [...(state.missions?.completed || [])], counter: state.missions?.counter || 0 };
  }

  _reset() {
    this._dropOffer();
    this.ringer.stop();
    this.markers.clear();
    this._dialog.length = 0;
    this._dialogT = 0;
    this._later.length = 0;
    this._cooldowns = {};
    this._jobs = [];
    this._failMsg = null;
    this._bigQ.length = 0;
    this._bigT = 0;
    this.game.hud?.setObjective?.(null);
    this._lastObjective = null;
  }

  /** Big center-screen message, queued so mission / turf / rank messages never overlap. */
  announce(title, sub = '', opts = {}) {
    this._bigQ.push({ title, sub, opts });
    if (this._bigT <= 0) this._nextBig();
  }

  _nextBig() {
    const b = this._bigQ.shift();
    if (!b) return;
    this.game.hud?.bigMessage?.(b.title, b.sub, b.opts);
    this._bigT = (b.opts.duration || 3.5) + 0.3;
  }

  // ------------------------------------------------------------------ who / where
  get setId() {
    return this.game.state?.player?.setId;
  }

  get set() {
    return setById(this.setId);
  }

  get side() {
    return this.game.state?.player?.side || this.set?.side || 'crips';
  }

  get ogName() {
    return OGS[this.setId]?.name || 'the OG';
  }

  /** The story's rival: the enemy-side set whose hood is closest to ours. */
  get rival() {
    const me = this.set;
    if (!me) return SETS[0];
    let best = null;
    let bd = Infinity;
    for (const s of SETS) {
      if (s.side === me.side) continue;
      const d = (s.hood.x - me.hood.x) ** 2 + (s.hood.z - me.hood.z) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best || SETS[0];
  }

  _zoneOwner(zoneId) {
    const g = this.game.gangs;
    const o = g?.getZoneOwner ? g.getZoneOwner(zoneId) : this.game.state?.turf?.[zoneId]?.owner;
    return o === undefined ? zoneById(zoneId)?.owner ?? null : o;
  }

  hoodZoneId() {
    const s = this.set;
    if (!s) return null;
    return this.game.layout.zoneAt(s.hood.x, s.hood.z)?.id || s.turf?.[0] || null;
  }

  /** 'hood' | 'rival' | 'contested' | 'rivalHome' | zoneId → zoneId */
  pickZone(kind) {
    const me = this.setId;
    const hood = this.set?.hood || { x: 0, z: 0 };
    const center = (z) => ({ x: (z.rect.x0 + z.rect.x1) / 2, z: (z.rect.z0 + z.rect.z1) / 2 });
    const byDist = (list) => list.sort((a, b) => {
      const ca = center(a);
      const cb = center(b);
      return (ca.x - hood.x) ** 2 + (ca.z - hood.z) ** 2 - ((cb.x - hood.x) ** 2 + (cb.z - hood.z) ** 2);
    });
    const claimable = TURF_ZONES.filter((z) => !z.noTurf && z.rect);
    if (kind === 'hood') return this.hoodZoneId();
    if (kind === 'rivalHome') {
      const r = this.rival;
      const home = r.turf?.find((z) => this._zoneOwner(z) === r.id);
      if (home) return home;
      kind = 'rival';
    }
    if (kind === 'rival') {
      const rivals = byDist(claimable.filter((z) => {
        const o = this._zoneOwner(z.id);
        return o && areRivals(o, me);
      }));
      return rivals[0]?.id || this.rival.turf?.[0] || null;
    }
    if (kind === 'contested') {
      const open = byDist(claimable.filter((z) => this._zoneOwner(z.id) !== me && !zoneById(z.id).owner));
      if (open.length) return open[0].id;
      return this.pickZone('rival');
    }
    return zoneById(kind) ? kind : null;
  }

  pois(types) {
    const list = this.game.shops?.pois?.length ? this.game.shops.pois : this.game.city?.pois || [];
    const want = Array.isArray(types) ? types : [types];
    const kind = (p) => this.game.shops?.kindOf?.(p) ?? p.type;
    return list.filter((p) => want.includes(kind(p)));
  }

  /** Nearest (or random within range) POI of the given type(s). */
  poi(types, { near = this.game.focus, minDist = 0, maxDist = Infinity, filter = null, random = false } = {}) {
    const c = this.pois(types).filter((p) => {
      const d = Math.hypot(p.x - near.x, p.z - near.z);
      return d >= minDist && d <= maxDist && (!filter || filter(p));
    });
    if (!c.length) return null;
    if (random) return c[Math.floor(Math.random() * c.length)];
    c.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
    return c[0];
  }

  poiInDistrict(districtId, near = this.game.focus) {
    const L = this.game.layout;
    const c = this.pois(['record', 'food', 'clothes', 'store', 'barber', 'payphone']).filter((p) => (p.district || L.districtAt(p.x, p.z)?.id) === districtId || L.zoneAt(p.x, p.z)?.id === districtId);
    if (!c.length) return null;
    c.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
    return c[Math.floor(Math.random() * Math.min(2, c.length))];
  }

  /** A walkable point inside a zone (a POI there, else a sidewalk point near its center). */
  pointInZone(zoneId, setId = null) {
    const zone = zoneById(zoneId);
    if (!zone?.rect) return null;
    const L = this.game.layout;
    const inZone = (p) => L.zoneAt(p.x, p.z)?.id === zoneId;
    if (setId) {
      const hood = this.pois('hood').find((p) => p.id === `hood-${setId}` && inZone(p));
      if (hood) return hood;
    }
    const shop = this.pois(['store', 'food', 'payphone', 'barber']).find(inZone);
    if (shop) return shop;
    const cx = (zone.rect.x0 + zone.rect.x1) / 2;
    const cz = (zone.rect.z0 + zone.rect.z1) / 2;
    const n = L.nearestNode(cx, cz);
    if (!n) return null;
    const off = 9;
    for (const [dx, dz] of [[off, off], [-off, off], [off, -off], [-off, -off]]) {
      const p = { x: n.x + dx, z: n.z + dz, name: L.describe(n.x, n.z).street };
      if (this.game.collision.isFree(p.x, p.z, 0.6)) return p;
    }
    return { x: n.x, z: n.z, name: L.describe(n.x, n.z).street };
  }

  hoodPoi() {
    const id = `hood-${this.setId}`;
    const p = this.pois('hood').find((q) => q.id === id) || this.game.city?.pois?.find((q) => q.id === id);
    if (p) return p;
    const s = this.set;
    return s ? { id, type: 'hood', name: `${s.short} hood`, x: s.hood.x, z: s.hood.z } : null;
  }

  placeName(p) {
    if (!p) return 'the spot';
    if (p.type === 'hood') return p.id === `hood-${this.setId}` ? 'the hood' : p.name || 'the hood';
    if (p.type === 'payphone' || !p.name) return this.game.layout.describe(p.x, p.z).street || 'the corner';
    return p.name;
  }

  /** gangs.spawnMember, defensively (stubs return null). */
  spawn(setId, x, z, role = 'hang') {
    try {
      const a = this.game.gangs?.spawnMember?.({ setId, x, z, role });
      return a && a.position ? a : null;
    } catch (err) {
      console.warn('[missions] spawnMember failed', err);
      return null;
    }
  }

  spawnParkedCar(model, from, minDist, maxDist) {
    const game = this.game;
    const spots = (game.city?.parkingSpots || []).filter((s) => {
      const d = Math.hypot(s.x - from.x, s.z - from.z);
      return d >= minDist && d <= maxDist && game.vehiclesNear(s.x, s.z, 4).length === 0;
    });
    let spot = spots[Math.floor(Math.random() * spots.length)];
    if (!spot) {
      // curbside on a nearby street: every road segment whose middle is in range, in random order
      const L = game.layout;
      const edges = L.edges.filter((e) => {
        const a = L.nodes[e.a];
        const b = L.nodes[e.b];
        const d = Math.hypot((a.x + b.x) / 2 - from.x, (a.z + b.z) / 2 - from.z);
        return d >= minDist && d <= maxDist * 1.5;
      });
      for (let i = edges.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [edges[i], edges[j]] = [edges[j], edges[i]];
      }
      for (const e of edges) {
        const a = L.nodes[e.a];
        const b = L.nodes[e.b];
        const t = 0.3 + Math.random() * 0.4;
        const off = e.width / 2 - 1.4;
        const x = a.x + (b.x - a.x) * t + (e.axis === 'z' ? off : 0);
        const z = a.z + (b.z - a.z) * t + (e.axis === 'x' ? off : 0);
        if (!game.collision.isFree(x, z, 1.2) || game.vehiclesNear(x, z, 5).length) continue;
        // right-hand traffic: the east curb faces north, the south curb faces east
        spot = { x, z, heading: e.axis === 'z' ? 0 : -Math.PI / 2 };
        break;
      }
    }
    if (!spot) return null;
    const { vehicle, own } = makeParkedCar(game, model, spot.x, spot.z, spot.heading || 0);
    this._pendingOwnCar = own;
    return vehicle;
  }

  /** Weather for the finale. Environment may only know clear/overcast/rain, so fall back. */
  setStorm(on, restoreAfter = 0) {
    const env = this.game.environment;
    if (!env?.setWeather) return;
    // Environment knows 'thunderstorm' (and returns false for kinds it doesn't know); lock it so
    // the random weather cycle can't clear the sky in the middle of the finale
    const apply = (w, opts) => {
      try {
        return env.setWeather(w, opts) !== false;
      } catch {
        return false;
      }
    };
    if (on) {
      if (!this._stormOn) this._prevWeather = env.weather || 'overcast';
      this._stormOn = true;
      if (!apply('thunderstorm', { lock: true }) && !apply('storm', { lock: true })) apply('rain', { lock: true });
    } else {
      if (!this._stormOn) return;
      this._stormOn = false;
      const prev = this._prevWeather === 'thunderstorm' || this._prevWeather === 'storm' ? 'rain' : this._prevWeather || 'overcast';
      if (restoreAfter > 0) this.later(restoreAfter, () => apply(prev, { lock: false }));
      else apply(prev, { lock: false });
    }
  }

  // ------------------------------------------------------------------ availability
  _storyDone(id) {
    return !!this.game.state?.missions?.completed?.includes(id);
  }

  _rankIndex() {
    return rankForRep(this.game.state?.rep || 0).index;
  }

  /** Next story mission not yet completed (regardless of rank). */
  _nextStoryAny() {
    return STORY.find((s) => !this._storyDone(s.id)) || null;
  }

  /** Next story mission if the player's rank unlocks it. */
  _nextStory() {
    const s = this._nextStoryAny();
    return s && this._rankIndex() >= s.rank ? s : null;
  }

  _jobDef(template) {
    const j = JOBS[template];
    this._jobSeq++;
    const title = j.titles[Math.floor(Math.random() * j.titles.length)];
    // tokens known before the job starts (the rest come from live targets in setup)
    const tokens = { homie: HOMIE_NAMES[Math.floor(Math.random() * HOMIE_NAMES.length)] };
    return { id: `job-${template}-${this._jobSeq}`, template, title, story: false, rank: 0, reward: { ...j.reward }, code: PAGER_CODES.info, pitch: j.pitch, brief: j.brief, objective: j.objective, params: { timer: j.timer }, tokens };
  }

  _refreshJobs() {
    const now = this.game.time.elapsed;
    this._jobs = this._jobs.filter((j) => !(this._cooldowns[j.template] > now));
    if (!this._storyDone('story1')) return;
    const want = 3;
    const templates = JOB_TEMPLATES.filter((t) => !(this._cooldowns[t] > now) && !this._jobs.some((j) => j.template === t) && this._templateOk(t));
    while (this._jobs.length < want && templates.length) {
      const i = Math.floor(Math.random() * templates.length);
      this._jobs.push(this._jobDef(templates.splice(i, 1)[0]));
    }
  }

  _templateOk(t) {
    const g = this.game;
    switch (t) {
      case 'lose_heat':
        return !!g.police?.setHeat && (g.police.heat || 0) === 0;
      case 'recruit':
        return !!g.gangs;
      case 'wheels':
        return this.pois('garage').length > 0;
      case 'tag_run':
        return !!g.tagging?.spots?.length;
      default:
        return true;
    }
  }

  available() {
    if (!this.game.state) return [];
    this._refreshJobs();
    const out = [];
    const story = this._nextStory();
    if (story) out.push(this._summary(story));
    for (const j of this._jobs) out.push(this._summary(j));
    return out;
  }

  _summary(def) {
    const t = def.tokens || {};
    const desc = def.pitch || def.brief?.[def.brief.length - 1]?.[1] || '';
    return { id: def.id, title: this._fill(def.title, t), template: def.template, story: STORY.includes(def), rank: def.rank || 0, reward: { ...def.reward }, desc: this._fill(desc, t) };
  }

  _findDef(id) {
    return STORY.find((s) => s.id === id) || this._jobs.find((j) => j.id === id) || (JOBS[id] ? this._jobDef(id) : null);
  }

  // ------------------------------------------------------------------ start / end
  start(id, { fromPhone = false } = {}) {
    const game = this.game;
    if (!game.state || !game.player) return false;
    if (this.active) {
      if (this.active.id === id) return true;
      return false;
    }
    const def = this._findDef(id);
    if (!def) return false;
    const T = TEMPLATES[def.template];
    if (!T) return false;
    const story = STORY.includes(def);
    const m = {
      id: def.id,
      def,
      template: def.template,
      title: def.title,
      story,
      rank: def.rank || 0,
      reward: { ...(def.reward || { cash: 50, rep: 20 }) },
      objective: '',
      markers: [],
      timer: null,
      stage: 0,
      status: 'setup',
      giver: this.ogName,
      data: { spawned: [] },
      tokens: { ...(def.tokens || {}) },
      _marks: new Map(),
      _ias: [],
    };
    this._pendingOwnCar = false;
    let ok = false;
    try {
      ok = !!T.setup(this, m, { ...(def.params || {}) });
    } catch (err) {
      console.error(`[missions] ${def.template}.setup failed`, err);
      ok = false;
    }
    if (m.data.car && this._pendingOwnCar) m.data.ownCar = true;
    if (!ok) {
      this._cleanup(m);
      game.hud?.toast?.("Nothing moving on that right now. Try again later.", { duration: 3 });
      this._cooldowns[def.template] = game.time.elapsed + 20;
      this._jobs = this._jobs.filter((j) => j.id !== def.id);
      return false;
    }
    m.title = this._fill(def.title, m.tokens);
    // taking any job silences the pager offer (the OG pages again later if it was a different one)
    if (this.offer) this._dropOffer();
    this._jobs = this._jobs.filter((j) => j.id !== def.id);
    this.active = m;
    m.status = 'active';
    if (m.data.car) game.traffic?.release?.(m.data.car);
    try {
      T.begin?.(this, m);
    } catch (err) {
      console.error(`[missions] ${def.template}.begin failed`, err);
    }
    if (this.active !== m) return true; // passed / failed immediately
    if (def.brief) for (const [who, text] of def.brief) this.say(who, text, m);
    game.events.emit('mission:start', { mission: m }); // the HUD shows the title card
    return true;
  }

  abort() {
    if (this.active) this.fail(this.active, 'Job dropped', { abort: true });
    else this.active = null;
  }

  pass(m) {
    if (!m || m.status !== 'active') return;
    const game = this.game;
    m.status = 'complete';
    this._cleanup(m);
    const reward = { cash: m.reward.cash || 0, rep: m.reward.rep || 0 };
    const st = game.state;
    if (m.story && !st.missions.completed.includes(m.id)) st.missions.completed.push(m.id);
    st.missions.counter = (st.missions.counter || 0) + 1;
    st.stats.missions = (st.stats.missions || 0) + 1;
    this._cooldowns[m.template] = game.time.elapsed + COOLDOWN_PASS;
    this.active = null;
    game.hud?.setObjective?.(null);
    this._lastObjective = null;
    game.events.emit('mission:complete', { mission: m, reward });
    this.announce('MISSION PASSED', `+${money(reward.cash)}   +${reward.rep} REP`, { color: '#f2b632', duration: 3.5 });
    this._dialog.length = 0;
    if (m.def.outro) for (const [who, text] of m.def.outro) this.say(who, text, m);
    if (m.def.ending) this._ending(m);
    this._pageIn = 45 + Math.random() * 30;
    game.save?.();
  }

  fail(m, reason = 'Mission failed', { down = false, abort = false } = {}) {
    if (!m || m.status !== 'active') return;
    const game = this.game;
    m.status = 'failed';
    this._cleanup(m);
    this.active = null;
    this._cooldowns[m.template] = game.time.elapsed + (abort ? 15 : COOLDOWN_FAIL);
    game.hud?.setObjective?.(null);
    this._lastObjective = null;
    this._dialog.length = 0;
    game.events.emit('mission:fail', { mission: m, reason });
    if (down) this._failMsg = reason;
    else this.announce(abort ? 'JOB DROPPED' : 'MISSION FAILED', abort ? '' : reason, { color: '#d4202c', duration: 3.5 });
    this._pageIn = 40 + Math.random() * 20;
  }

  _ending(m) {
    const game = this.game;
    const e = m.def.ending;
    game.state.flags = game.state.flags || {};
    game.state.flags['missions.ended'] = true;
    const delay = 5 + (m.def.outro?.length || 0) * 4;
    this.later(delay, () => {
      this.announce(e.title, this._fill(e.sub, m.tokens), { color: SIDES[this.side]?.color, duration: 7 });
      for (const [who, text] of e.lines) this.say(who, text, m);
      game.hud?.toast?.('Story complete. Free roam: tag, take turf, pick up jobs at any payphone.', { duration: 7 });
    });
  }

  _cleanup(m) {
    const T = TEMPLATES[m.template];
    try {
      T?.cleanup?.(this, m);
    } catch (err) {
      console.error(`[missions] ${m.template}.cleanup failed`, err);
    }
    for (const key of [...m._marks.keys()]) this.unmark(m, key);
    for (const h of m._ias) h.remove();
    m._ias.length = 0;
  }

  // ------------------------------------------------------------------ helpers used by templates
  mark(m, key, { x = 0, z = 0, follow = null, kind = 'checkpoint', type = 'mission', label = '', color = null, radius = 2.4, height = 2.4, yOffset = 2.4 } = {}) {
    this.unmark(m, key);
    const game = this.game;
    const c = color || MARK_COLORS[type] || MARK_COLORS.mission;
    const pos = follow ? follow.position || follow : { x, z };
    const world = this.markers.add({ x: pos.x, z: pos.z, color: c, kind, radius, height });
    if (follow) world.follow(follow, yOffset);
    const hudMarker = { id: `mission:${m.id}:${key}`, x: pos.x, z: pos.z, type, color: c, label };
    try {
      game.hud?.addMarker?.(hudMarker);
    } catch (err) {
      console.warn('[missions] hud.addMarker failed', err);
    }
    const rec = { key, world, hud: hudMarker, follow };
    m._marks.set(key, rec);
    m.markers.push(hudMarker);
    return rec;
  }

  unmark(m, key) {
    const rec = m._marks.get(key);
    if (!rec) return;
    rec.world.remove();
    try {
      this.game.hud?.removeMarker?.(rec.hud.id);
    } catch {
      /* ignore */
    }
    m._marks.delete(key);
    const i = m.markers.indexOf(rec.hud);
    if (i >= 0) m.markers.splice(i, 1);
  }

  addInteraction(m, def) {
    const h = this.game.interactions.add({ ...def, enabled: () => this.active === m && (def.enabled ? def.enabled() : true) });
    m._ias.push(h);
    return h;
  }

  objective(m, text) {
    if (text === m._objRaw) return;
    m._objRaw = text;
    const t = this._fill(text, m.tokens);
    if (m.objective === t) return;
    m.objective = t;
    this._showObjective(m, true);
    this.game.events.emit('mission:update', { mission: m });
  }

  _showObjective(m, force = false) {
    const secs = m.timer != null ? Math.max(0, Math.ceil(m.timer)) : null;
    if (!force && secs === this._lastSecs) return;
    this._lastSecs = secs;
    const text = secs != null ? `${m.objective}  ·  ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : m.objective;
    if (!force && text === this._lastObjective) return;
    this._lastObjective = text;
    this.game.hud?.setObjective?.(text);
  }

  /** Queue a line of dialog. speaker: 'og' | 'you' | 'contact' | 'homie' | a name. */
  say(speaker, text, m = this.active) {
    const game = this.game;
    const side = SIDES[this.side];
    let name = speaker;
    let color = '#f4efe3';
    if (speaker === 'og') {
      name = this.ogName;
      color = side?.light || color;
    } else if (speaker === 'you') {
      name = game.state?.player?.name || 'You';
    } else if (speaker === 'contact') {
      name = m?.data?.contact || 'Contact';
      color = '#ffe08a';
    } else if (speaker === 'homie') {
      name = m?.tokens?.homie || 'Homie';
      color = side?.light || color;
    }
    this._dialog.push({ speaker: name, text: this._fill(text, m?.tokens || {}), color });
  }

  later(seconds, fn) {
    this._later.push({ t: seconds, fn });
  }

  _fill(text, extra) {
    if (!text) return '';
    // world-derived tokens are computed only when a line actually uses them
    const base = {
      name: () => this.game.state?.player?.name || 'Lil Homie',
      og: () => this.ogName,
      greet: () => SIDES[this.side]?.greet || 'homie',
      set: () => this.set?.name || 'the set',
      short: () => this.set?.short || 'the set',
      side: () => SIDES[this.side]?.name || '',
      rival: () => this.rival?.name,
      rivalShort: () => this.rival?.short,
      rivalZone: () => zoneById(this.pickZone('rivalHome'))?.name || 'their turf',
      hoodZone: () => zoneById(this.hoodZoneId())?.name || 'the hood',
      contested: () => zoneById(this.pickZone('contested'))?.name || 'the Near North Side',
      zone: () => zoneById(this.hoodZoneId())?.name || 'the hood',
    };
    return text.replace(/\{(\w+)\}/g, (all, k) => {
      const v = extra?.[k] ?? base[k]?.();
      return v == null ? all : String(v);
    });
  }

  // ------------------------------------------------------------------ pager + payphones
  _page() {
    const game = this.game;
    let def = this._nextStory();
    if (!def) {
      this._refreshJobs();
      def = this._jobs[Math.floor(Math.random() * this._jobs.length)] || null;
    }
    // now and then (never before the first job) the pager is just Mama or a friend
    if (!def || (this._storyDone('story1') && Math.random() < 0.12)) {
      const f = FLAVOR_PAGES[Math.floor(Math.random() * FLAVOR_PAGES.length)];
      this._sendPage(f.from, `${f.number} ${f.code}`);
      game.hud?.toast?.(`${f.from}: "${f.text}"`, { duration: 4 });
      this._pageIn = def ? 25 + Math.random() * 15 : 70 + Math.random() * 40;
      return;
    }
    const phone = this.poi('payphone', { near: game.focus });
    const og = OGS[this.setId] || { name: 'OG', number: '555-0100' };
    this.offer = { id: def.id, title: this._fill(def.title, def.tokens || {}), code: def.code || PAGER_CODES.info, phone, t: OFFER_TIME, marker: null };
    this._sendPage(og.name, `${og.number} ${this.offer.code}`);
    if (phone) {
      this.offer.marker = this.markers.add({ x: phone.x, z: phone.z, color: MARK_COLORS.payphone, radius: 1.3, height: 2.2 });
      this.offer.hudId = `mission:payphone`;
      try {
        game.hud?.addMarker?.({ id: this.offer.hudId, x: phone.x, z: phone.z, type: 'payphone', color: MARK_COLORS.payphone, label: 'Payphone' });
      } catch {
        /* ignore */
      }
      this.ringer.start(phone);
    }
    const meaning = this.offer.code === PAGER_CODES.urgent ? 'urgent' : 'got info';
    game.hud?.setObjective?.(`Pager: ${this.offer.code} (${meaning}) from ${og.name}. Call back from a payphone.`);
    this._lastObjective = null;
  }

  _sendPage(from, text) {
    this.game.events.emit('pager', { from, text });
    this.game.hud?.pager?.(from, text);
  }

  _dropOffer() {
    const o = this.offer;
    if (!o) return;
    o.marker?.remove();
    if (o.hudId) {
      try {
        this.game.hud?.removeMarker?.(o.hudId);
      } catch {
        /* ignore */
      }
    }
    this.ringer.stop();
    this.offer = null;
    if (!this.active) {
      this.game.hud?.setObjective?.(null);
      this._lastObjective = null;
    }
  }

  payphoneLabel(poi) {
    if (this.offer) return this.offer.phone === poi ? 'Answer payphone' : 'Call back the pager ($0.25)';
    return 'Use payphone ($0.25)';
  }

  /** Payphone interaction (Shops calls this for every 'payphone' POI). */
  usePayphone(poi) {
    const game = this.game;
    const shops = game.shops;
    if (this.offer) {
      const ringing = this.offer.phone === poi;
      if (!ringing && !(shops?.pay?.(0.25, 'payphone') ?? true)) return;
      game.audio?.play?.('ui_select');
      const id = this.offer.id;
      this._dropOffer();
      if (!this.start(id, { fromPhone: true })) this._pageIn = 30;
      return;
    }
    if (!(shops?.pay?.(0.25, 'payphone') ?? true)) return;
    this._phoneMenu();
  }

  _phoneMenu() {
    const game = this.game;
    const panel = getShopPanel(game);
    const side = SIDES[this.side];
    if (this.active) {
      const m = this.active;
      panel.open({
        title: `Call ${this.ogName}`,
        subtitle: `Current job: ${m.title}`,
        icon: '☎',
        accent: side?.color,
        sections: [
          {
            id: 'act',
            kind: 'actions',
            title: m.objective,
            options: [
              { id: 'keep', label: "I'm on it", desc: 'Hang up and finish the job', onPick: () => panel.close() },
              {
                id: 'drop',
                label: 'Drop the job',
                desc: m.story ? 'You can pick it back up later' : 'The OG will find somebody else',
                onPick: () => {
                  panel.close();
                  this.abort();
                },
              },
            ],
          },
        ],
        closeLabel: 'Hang up',
      });
      return;
    }
    const list = this.available();
    const locked = this._nextStoryAny();
    const opts = list.map((j) => ({
      id: j.id,
      label: j.story ? `★ ${j.title}` : j.title,
      desc: j.desc,
      badge: `${money(j.reward.cash)} · ${j.reward.rep} REP`,
      onPick: () => {
        panel.close();
        this.start(j.id, { fromPhone: true });
      },
    }));
    if (locked && !list.some((j) => j.id === locked.id)) {
      const need = RANKS[locked.rank]?.name || 'more rep';
      opts.push({ id: 'locked', label: `★ ${locked.title}`, desc: `The OG wants you to come up first. Reach ${need}.`, badge: 'LOCKED', disabled: true });
    }
    if (!opts.length) opts.push({ id: 'none', label: 'Nothing right now', desc: `${this.ogName} says: "Call me later, ${side?.greet || 'homie'}."`, disabled: true });
    panel.open({
      title: `Call ${this.ogName}`,
      subtitle: `"What you need, ${side?.greet || 'homie'}?"`,
      icon: '☎',
      accent: side?.color,
      sections: [{ id: 'jobs', kind: 'actions', title: 'Work', options: opts }],
      closeLabel: 'Hang up',
    });
  }

  // ------------------------------------------------------------------ events + update
  _event(name, payload) {
    const m = this.active;
    if (!m || m.status !== 'active') return;
    const T = TEMPLATES[m.template];
    try {
      T.event?.(this, m, name, payload);
    } catch (err) {
      console.error(`[missions] ${m.template}.event(${name}) failed`, err);
    }
  }

  update(dt) {
    const game = this.game;
    this._bigT -= dt;
    if (this._bigT <= 0 && this._bigQ.length) this._nextBig();
    if (!game.state || !game.player) return;
    this.markers.update(dt);
    this.ringer.update(dt);

    // scheduled callbacks
    for (let i = this._later.length - 1; i >= 0; i--) {
      const l = this._later[i];
      l.t -= dt;
      if (l.t <= 0) {
        this._later.splice(i, 1);
        try {
          l.fn();
        } catch (err) {
          console.error('[missions] later() callback threw', err);
        }
      }
    }

    // dialog queue: one line at a time
    this._dialogT -= dt;
    if (this._dialogT <= 0 && this._dialog.length) {
      const line = this._dialog.shift();
      const dur = Math.min(6.5, Math.max(2.6, 1.6 + line.text.length * 0.05));
      this._dialogT = dur + 0.25;
      game.hud?.dialog?.(line.speaker, line.text, { color: line.color, duration: dur });
    }

    const m = this.active;
    if (m) {
      // moving HUD markers follow their targets
      for (const rec of m._marks.values()) {
        if (!rec.follow) continue;
        const p = rec.follow.position || rec.follow;
        if (Math.abs(rec.hud.x - p.x) + Math.abs(rec.hud.z - p.z) > 0.5) {
          rec.hud.x = p.x;
          rec.hud.z = p.z;
          game.hud?.updateMarker?.(rec.hud.id, p.x, p.z);
        }
        if (rec.follow.state === 'removed' || rec.follow.state === 'ko') this.unmark(m, rec.key);
      }
      if (m.timer != null) {
        m.timer -= dt;
        if (m.timer <= 0) {
          m.timer = 0;
          this.fail(m, 'Out of time');
          return;
        }
      }
      try {
        TEMPLATES[m.template].update?.(this, m, dt);
      } catch (err) {
        if (!m._updateErr) console.error(`[missions] ${m.template}.update failed`, err);
        m._updateErr = true;
      }
      if (this.active === m) this._showObjective(m);
      return;
    }

    if (this.offer) {
      this.offer.t -= dt;
      if (this.offer.t <= 0) {
        this._dropOffer();
        this._pageIn = 60 + Math.random() * 30;
      }
      return;
    }
    this._pageIn -= dt;
    if (this._pageIn <= 0) {
      this._pageIn = 60;
      this._page();
    }
  }

  // ------------------------------------------------------------------ debug
  _attachDebug() {
    const game = this.game;
    const api = game.debugApi;
    if (!api) return;
    api.startMission = (id) => this.start(id);
    api.completeObjective = () => {
      const m = this.active;
      if (!m) return false;
      TEMPLATES[m.template].skip?.(this, m);
      return true;
    };
    api.missions = {
      available: () => this.available(),
      active: () => (this.active ? { id: this.active.id, template: this.active.template, title: this.active.title, objective: this.active.objective, stage: this.active.stage, timer: this.active.timer, markers: this.active.markers.map((mk) => ({ id: mk.id, type: mk.type, x: +mk.x.toFixed(1), z: +mk.z.toFixed(1) })) } : null),
      offer: () => (this.offer ? { id: this.offer.id, code: this.offer.code, phone: this.offer.phone?.id || null } : null),
      page: () => {
        this._dropOffer();
        this._page();
        return this.offer ? this.offer.id : null;
      },
      answer: () => {
        if (!this.offer) return false;
        const id = this.offer.id;
        this._dropOffer();
        return this.start(id, { fromPhone: true });
      },
      abort: () => this.abort(),
      story: () => STORY.map((s) => ({ id: s.id, title: s.title, rank: s.rank, done: this._storyDone(s.id) })),
      completeStory: (upTo) => {
        for (const s of STORY) {
          if (s.order > upTo) break;
          if (!this._storyDone(s.id)) game.state.missions.completed.push(s.id);
        }
      },
      state: () => ({ ...game.state.missions }),
      dialogQueue: () => this._dialog.length,
    };
  }
}
