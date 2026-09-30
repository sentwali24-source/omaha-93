import { angleDiff, clamp, headingTo } from '../../core/math.js';

// Simple road driver for police cruisers (used when game.traffic has no makeAIDriver, and for
// every pursuit manoeuvre: routing, direct chase, ramming, stopping, roadblocks).
// It only writes vehicle.controls — Vehicle.update() does the physics.
//
//   patrol   follow the right-hand lane of the road graph, random turns, obey signals, keep
//            distance to the car ahead
//   route    Dijkstra over intersections toward a goal, then direct pursuit when close + visible
//   stop     brake to a halt (officers getting out, roadblocks)

export class RoadDriver {
  constructor(game, vehicle) {
    this.game = game;
    this.v = vehicle;
    const L = game.layout;
    const near = L.nearestEdge(vehicle.position.x, vehicle.position.z);
    this.edge = near.edge;
    // travel toward whichever end the car faces
    const a = L.nodes[this.edge.a];
    const b = L.nodes[this.edge.b];
    const hb = headingTo(b.x - a.x, b.z - a.z);
    const towardB = Math.abs(angleDiff(vehicle.heading, hb)) < Math.PI / 2;
    this.fromNode = towardB ? a.id : b.id;
    this.toNode = towardB ? b.id : a.id;
    this.turning = false;
    this.path = null;
    this.pathI = 0;
    this.pathT = 0;
    this.goalNode = -1;
    this.stuckT = 0;
    this.reverseT = 0;
    this.reverseSteer = 0;
  }

  // ------------------------------------------------------------------ low level
  /** Steer toward (tx, tz) at target speed; brakes for sharp turns. */
  steerTo(tx, tz, targetSpeed, dt, sharpness = 2.2) {
    const v = this.v;
    const c = v.controls;
    if (this._recover(dt, c)) return;
    const dx = tx - v.position.x;
    const dz = tz - v.position.z;
    const desired = headingTo(dx, dz);
    let err = angleDiff(v.heading, desired);
    // target well behind us and close: reverse-turn is silly, just turn hard
    c.steer = clamp(-err * sharpness, -1, 1);
    const turnSlow = 1 - Math.min(0.75, Math.abs(err) / 1.5);
    this.speedControl(targetSpeed * turnSlow, c);
    this._watchStuck(dt, c);
  }

  speedControl(want, c = this.v.controls) {
    const v = this.v;
    c.handbrake = false;
    if (v.speed < want - 0.3) {
      c.throttle = clamp((want - v.speed) * 0.35 + 0.25, 0, 1);
      c.brake = 0;
    } else if (v.speed > want + 0.8) {
      const b = clamp((v.speed - want) * 0.25, 0.15, 1);
      c.brake = b;
      c.throttle = v.speed > 1 ? -b : 0; // negative throttle brakes while moving forward
    } else {
      c.throttle = want > 0.5 ? 0.15 : 0;
      c.brake = 0;
    }
  }

  /** Brake to a stop (stays stopped). */
  stop() {
    const v = this.v;
    const c = v.controls;
    c.steer = 0;
    c.handbrake = Math.abs(v.speed) < 1;
    if (v.speed > 0.4) {
      c.brake = 1;
      c.throttle = -1;
    } else if (v.speed < -0.4) {
      c.brake = 1;
      c.throttle = 1;
    } else {
      c.brake = 1;
      c.throttle = 0;
    }
    this.stuckT = 0;
  }

  _watchStuck(dt, c) {
    const v = this.v;
    if (c.throttle > 0.3 && Math.abs(v.speed) < 0.8) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.4) {
      this.stuckT = 0;
      this.reverseT = 1.3;
      this.reverseSteer = c.steer >= 0 ? -1 : 1;
    }
  }

  _recover(dt, c) {
    if (this.reverseT <= 0) return false;
    this.reverseT -= dt;
    c.throttle = -0.85;
    c.brake = 0;
    c.steer = this.reverseSteer;
    c.handbrake = false;
    return true;
  }

  // ------------------------------------------------------------------ patrol (lane following)
  _pickNextEdge(atNodeId, cameEdge) {
    const L = this.game.layout;
    const opts = L.neighbors(atNodeId).filter((nb) => nb.edge !== cameEdge);
    if (!opts.length) return { edge: cameEdge, node: L.otherEnd(cameEdge, atNodeId) };
    const straight = opts.find((nb) => nb.edge.axis === cameEdge.axis);
    if (straight && Math.random() < 0.55) return straight;
    return opts[Math.floor(Math.random() * opts.length)];
  }

  patrol(dt, speedMul = 0.72) {
    const L = this.game.layout;
    const v = this.v;
    const p = v.position;
    const edge = this.edge;
    if (this.turning) {
      const s = L.laneStart(edge, this.fromNode, 0);
      if (Math.hypot(s.x - p.x, s.z - p.z) < 4.5) this.turning = false;
      else {
        this.steerTo(s.x, s.z, 6.5, dt);
        return;
      }
    }
    const s = L.laneStart(edge, this.fromNode, 0);
    const e = L.laneEnd(edge, this.fromNode, 0);
    const lx = e.x - s.x;
    const lz = e.z - s.z;
    const len = Math.hypot(lx, lz) || 1;
    const ux = lx / len;
    const uz = lz / len;
    const along = (p.x - s.x) * ux + (p.z - s.z) * uz;
    const remain = len - along;
    if (remain < 5) {
      const nb = this._pickNextEdge(this.toNode, edge);
      this.fromNode = this.toNode;
      this.edge = nb.edge;
      this.toNode = nb.node.id;
      this.turning = true;
      return;
    }
    const la = Math.min(len, along + 9);
    const tx = s.x + ux * la;
    const tz = s.z + uz * la;
    let want = (edge.speed || 12) * speedMul;
    // traffic signal at the end of this edge
    const sig = this.game.city?.signalAt?.(this.toNode);
    if (sig && remain < 22 && (sig.green !== edge.axis || sig.phase !== 'green')) {
      want = Math.min(want, Math.max(0, (remain - 6) * 0.7));
    }
    want = Math.min(want, this._gapAhead());
    this.steerTo(tx, tz, want, dt, 2.6);
  }

  /** Allowed speed given the nearest vehicle ahead in our lane. */
  _gapAhead() {
    const v = this.v;
    const fx = -Math.sin(v.heading);
    const fz = -Math.cos(v.heading);
    let limit = 99;
    const vs = this.game.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const o = vs[i];
      if (o === v) continue;
      const dx = o.position.x - v.position.x;
      const dz = o.position.z - v.position.z;
      const along = dx * fx + dz * fz;
      if (along < 0 || along > 18) continue;
      const side = Math.abs(dx * -fz + dz * fx);
      if (side > 2.2) continue;
      limit = Math.min(limit, Math.max(0, (along - 6) * 0.9));
    }
    return limit;
  }

  // ------------------------------------------------------------------ routing
  /** Drive toward (gx, gz) via the road graph. direct = allowed to aim straight at the goal. */
  route(gx, gz, dt, speed = 19, direct = false) {
    const L = this.game.layout;
    const v = this.v;
    const p = v.position;
    const dGoal = Math.hypot(gx - p.x, gz - p.z);
    if (direct || dGoal < 16) {
      this.path = null;
      this.steerTo(gx, gz, speed, dt, 2.4);
      return dGoal;
    }
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0) {
      this.pathT = 1.6;
      const goal = L.nearestNode(gx, gz);
      const start = this._startNode();
      this.path = shortestPath(L, start.id, goal.id);
      this.pathI = 0;
      this.goalNode = goal.id;
    }
    if (!this.path || !this.path.length) {
      this.steerTo(gx, gz, speed * 0.6, dt);
      return dGoal;
    }
    // advance along the node path
    let n = L.nodes[this.path[this.pathI]];
    while (this.pathI < this.path.length - 1 && Math.hypot(n.x - p.x, n.z - p.z) < 9) {
      this.pathI++;
      n = L.nodes[this.path[this.pathI]];
    }
    if (this.pathI >= this.path.length - 1 && Math.hypot(n.x - p.x, n.z - p.z) < 9) {
      this.steerTo(gx, gz, speed * 0.7, dt);
      return dGoal;
    }
    // slow for the upcoming turn
    let want = speed;
    const next = this.path[this.pathI + 1];
    const dn = Math.hypot(n.x - p.x, n.z - p.z);
    if (next !== undefined && dn < 30) {
      const nn = L.nodes[next];
      const turn = Math.abs(angleDiff(headingTo(n.x - p.x, n.z - p.z), headingTo(nn.x - n.x, nn.z - n.z)));
      if (turn > 0.6) want = Math.min(want, 8 + dn * 0.45);
    }
    this.steerTo(n.x, n.z, want, dt, 2.4);
    return dGoal;
  }

  _startNode() {
    // the node ahead of the car on its current edge (so we don't route backwards)
    const L = this.game.layout;
    const v = this.v;
    const fx = -Math.sin(v.heading);
    const fz = -Math.cos(v.heading);
    let best = null;
    let bs = Infinity;
    for (const n of L.nodes) {
      const dx = n.x - v.position.x;
      const dz = n.z - v.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 140) continue;
      const ahead = (dx * fx + dz * fz) / (d || 1);
      const s = d * (ahead > 0.3 ? 1 : 2.5);
      if (s < bs) {
        bs = s;
        best = n;
      }
    }
    return best || L.nearestNode(v.position.x, v.position.z);
  }

  /** Re-seat on the lane graph after a chase (for patrolling again). */
  reseat() {
    const L = this.game.layout;
    const v = this.v;
    const near = L.nearestEdge(v.position.x, v.position.z);
    this.edge = near.edge;
    const a = L.nodes[this.edge.a];
    const b = L.nodes[this.edge.b];
    const hb = headingTo(b.x - a.x, b.z - a.z);
    const towardB = Math.abs(angleDiff(v.heading, hb)) < Math.PI / 2;
    this.fromNode = towardB ? a.id : b.id;
    this.toNode = towardB ? b.id : a.id;
    this.turning = true;
    this.path = null;
  }
}

/** Dijkstra over layout nodes; returns node ids (start → goal) or null. */
export function shortestPath(L, startId, goalId) {
  if (startId === goalId) return [startId];
  const n = L.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[startId] = 0;
  const open = [startId];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goalId) break;
    const node = L.nodes[cur];
    for (const eid of node.edges) {
      const e = L.edges[eid];
      const o = e.a === cur ? e.b : e.a;
      if (done[o]) continue;
      const nd = dist[cur] + e.length / (e.major ? 1.25 : 1);
      if (nd < dist[o]) {
        dist[o] = nd;
        prev[o] = cur;
        open.push(o);
      }
    }
  }
  if (prev[goalId] === -1) return null;
  const out = [];
  for (let c = goalId; c !== -1; c = prev[c]) out.push(c);
  return out.reverse();
}

/** Compass word for a heading ("northbound"...). */
export function compass(heading) {
  const h = ((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  // 0 = north, PI/2 = west, PI = south, 3PI/2 = east
  const i = Math.round(h / (Math.PI / 2)) % 4;
  return ['northbound', 'westbound', 'southbound', 'eastbound'][i];
}
