import { TURF_ZONES, zoneById } from '../data/sets.js';

// STUB — replaced by the NPC agent. Keeps the public API from ARCHITECTURE.md.
export class Gangs {
  constructor(game) {
    this.game = game;
    this.members = [];
    this.homies = [];
  }

  getZoneOwner(zoneId) {
    const t = this.game.state?.turf?.[zoneId];
    return t ? t.owner : zoneById(zoneId)?.owner ?? null;
  }

  getControl(zoneId) {
    return this.game.state?.turf?.[zoneId]?.control ?? 0;
  }

  /** Shift turf control toward setId. Flips owner when control drops below 0. */
  addInfluence(zoneId, setId, amount) {
    const st = this.game.state;
    if (!st) return;
    const zone = zoneById(zoneId);
    if (!zone || zone.noTurf) return;
    const t = st.turf[zoneId] || (st.turf[zoneId] = { owner: null, control: 0 });
    if (t.owner === setId || t.owner === null) {
      t.owner = setId;
      t.control = Math.min(100, t.control + amount);
    } else {
      t.control -= amount;
      if (t.control < 0) {
        t.owner = setId;
        t.control = Math.min(100, -t.control);
        this.game.events.emit('turf:change', { zoneId, owner: setId, control: t.control });
        return;
      }
    }
    this.game.events.emit('turf:influence', { zoneId, owner: t.owner, control: t.control });
  }

  spawnMember() {
    return null;
  }

  zones() {
    return TURF_ZONES;
  }

  update() {}
}
