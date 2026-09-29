import { SIDES, setById, zoneById, areRivals, nextRank } from '../data/sets.js';
import { OGS } from '../data/missions.js';
import { money } from '../core/math.js';

// Progression rewards (ARCHITECTURE.md §19, "Progression rewards"). A listener module owned by
// Shops: every rep / cash reward for world events lives here, so NPC / PLAYER code never touches
// money directly.
//
// | fight:won vs rival gang member                  | +10 rep (x1.5 in rival turf)
// | actor:ko of a civilian by the player            | -5 rep, crime
// | tag:complete                                    | +15 rep, +$5
// | turf:change to the player's set                 | +100 rep, +$50, big message "TURF TAKEN"
// | turf:change away from the player's set          | big message "LOST <zone>"
// | player:sign in rival turf while wearing colors  | +2 rep (and trouble)
// | mission:complete                                | mission.reward
// | rank:up                                         | big message + pager from the OG

const SIGN_COOLDOWN = 8; // seconds between rep for throwing up signs

export class Progression {
  constructor(game) {
    this.game = game;
    this._owners = new Map(); // zoneId -> last known owner (to detect "lost")
    this._signAt = -1e9;
    this._rewarded = new WeakSet(); // actors already paid out for (fight:won + actor:ko dedupe)
  }

  init() {
    const ev = this.game.events;
    ev.on('fight:won', (p) => this._fightWon(p?.target));
    ev.on('actor:ko', (p) => this._ko(p));
    ev.on('tag:complete', (p) => this._tag(p));
    ev.on('turf:change', (p) => this._turf(p));
    ev.on('player:sign', () => this._sign());
    ev.on('mission:complete', (p) => this._mission(p));
    ev.on('rank:up', (p) => this._rankUp(p?.rank));
    ev.on('game:start', () => this._syncOwners());
  }

  get playerSet() {
    return this.game.state?.player?.setId || null;
  }

  _zoneOwnerNow(zoneId) {
    const g = this.game.gangs;
    const o = g?.getZoneOwner ? g.getZoneOwner(zoneId) : this.game.state?.turf?.[zoneId]?.owner;
    return o === undefined ? null : o;
  }

  _syncOwners() {
    this._owners.clear();
    const turf = this.game.state?.turf || {};
    for (const id of Object.keys(turf)) this._owners.set(id, this._zoneOwnerNow(id) ?? turf[id]?.owner ?? null);
  }

  /** Is (x, z) in turf owned by a set of the other side? */
  _inRivalTurf(x, z) {
    const zone = this.game.layout.zoneAt(x, z);
    if (!zone) return false;
    const owner = this._zoneOwnerNow(zone.id);
    return !!owner && areRivals(owner, this.playerSet);
  }

  _big(title, sub, opts) {
    const m = this.game.missions;
    if (m?.announce) m.announce(title, sub, opts);
    else this.game.hud?.bigMessage?.(title, sub, opts);
  }

  _toast(text, color) {
    this.game.hud?.toast?.(text, { color, duration: 2.2 });
  }

  _fightWon(target) {
    const game = this.game;
    if (!game.state || !target || target.kind !== 'gang' || this._rewarded.has(target)) return;
    if (!areRivals(target.faction, this.playerSet)) return;
    this._rewarded.add(target);
    const p = game.player?.position || target.position;
    const mult = this._inRivalTurf(p.x, p.z) ? 1.5 : 1;
    const rep = Math.round(10 * mult);
    game.addRep(rep, 'fight');
    this._toast(`+${rep} REP`, SIDES[game.state.player.side]?.light);
  }

  _ko({ target, attacker } = {}) {
    const game = this.game;
    if (!game.state || !target || !attacker) return;
    const byPlayer = attacker === game.player || attacker.kind === 'player';
    if (!byPlayer) return;
    if (target.kind === 'ped') {
      game.addRep(-5, 'civilian');
      this._toast('-5 REP', '#d4202c');
      game.police?.reportCrime?.('assault', { x: target.position.x, z: target.position.z, severity: 1, victim: target });
    } else if (target.kind === 'gang') {
      // Combat emits fight:won for these; this is the fallback when it doesn't (deduped).
      this._fightWon(target);
    }
  }

  _tag(p) {
    const game = this.game;
    if (!game.state || !p || p.byPlayer === false || p.setId !== this.playerSet) return;
    game.addRep(15, 'tag');
    game.addCash(5, 'tag');
    this._toast('+15 REP  +$5', SIDES[game.state.player.side]?.light);
  }

  _turf({ zoneId, owner } = {}) {
    const game = this.game;
    if (!game.state || !zoneId) return;
    const me = this.playerSet;
    const prev = this._owners.has(zoneId) ? this._owners.get(zoneId) : zoneById(zoneId)?.owner ?? null;
    this._owners.set(zoneId, owner ?? null);
    const name = zoneById(zoneId)?.name || 'turf';
    if (owner === me && prev !== me) {
      // message first so a rank-up from this reward queues behind it
      this._big('TURF TAKEN', `${name} is ${setById(me)?.short || 'yours'} now   +${money(50)}  +100 REP`, { color: SIDES[game.state.player.side]?.color, duration: 3.5 });
      game.addRep(100, 'turf');
      game.addCash(50, 'turf');
    } else if (prev === me && owner !== me) {
      const by = setById(owner);
      this._big(`LOST ${name.toUpperCase()}`, by ? `The ${by.short} took it` : 'The block went quiet', { color: '#d4202c', duration: 4 });
    }
  }

  _sign() {
    const game = this.game;
    const player = game.player;
    if (!game.state || !player || !game.state.wearingColors) return;
    if (game.time.elapsed - this._signAt < SIGN_COOLDOWN) return;
    if (!this._inRivalTurf(player.position.x, player.position.z)) return;
    this._signAt = game.time.elapsed;
    game.addRep(2, 'sign');
    this._toast('+2 REP', SIDES[game.state.player.side]?.light);
  }

  _mission({ reward } = {}) {
    const game = this.game;
    if (!game.state || !reward) return;
    if (reward.cash) game.addCash(reward.cash, 'mission');
    if (reward.rep) game.addRep(reward.rep, 'mission');
  }

  _rankUp(rank) {
    const game = this.game;
    if (!game.state || !rank) return;
    const side = SIDES[game.state.player.side];
    const next = nextRank(game.state.rep);
    this._big('RANK UP', `You're a ${rank.name} now${next ? ` · next: ${next.name}` : ''}`, { color: side?.color, duration: 3.5 });
    const og = OGS[this.playerSet] || { name: 'OG', number: '555-0100' };
    // the OG notices a little later — like a real page would
    game.missions?.later?.(3.5, () => {
      game.events.emit('pager', { from: og.name, text: `${og.number} 411` });
      game.hud?.pager?.(og.name, `${og.number} 411`);
      game.hud?.toast?.(`${og.name}: "Heard you moving up, ${side?.greet || 'homie'}. ${rank.name}. Keep it up."`, { duration: 5 });
    });
  }
}
