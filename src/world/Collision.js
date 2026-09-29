// Static collision world: axis-aligned boxes in a uniform spatial hash.
// Characters are vertical capsules approximated as circles on XZ with a vertical span;
// vehicles are a few circles along their length. The city is a grid, so AABBs fit well.
//
// Box: { id, minX, minZ, maxX, maxZ, minY, maxY, tag }
// tags used by the game: 'building' 'house' 'landmark' 'prop' 'fence' 'tree' 'water' 'bounds'

export class CollisionWorld {
  constructor(cellSize = 24) {
    this.cell = cellSize;
    this.grid = new Map();
    this.boxes = new Map();
    this._nextId = 1;
    this._stamp = 0;
    this._query = [];
    this.lastNormal = { x: 0, z: 0 };
  }

  _key(cx, cz) {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  addBox(minX, minZ, maxX, maxZ, maxY = 12, minY = 0, tag = 'building') {
    if (minX > maxX) [minX, maxX] = [maxX, minX];
    if (minZ > maxZ) [minZ, maxZ] = [maxZ, minZ];
    const box = { id: this._nextId++, minX, minZ, maxX, maxZ, minY, maxY, tag, _stamp: 0 };
    this.boxes.set(box.id, box);
    const c = this.cell;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const k = this._key(cx, cz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(box);
      }
    }
    return box;
  }

  /** Box centred at (x, z) with half extents. */
  addCenteredBox(x, z, halfX, halfZ, maxY = 12, minY = 0, tag = 'building') {
    return this.addBox(x - halfX, z - halfZ, x + halfX, z + halfZ, maxY, minY, tag);
  }

  removeBox(box) {
    if (!box || !this.boxes.has(box.id)) return;
    this.boxes.delete(box.id);
    const c = this.cell;
    for (let cx = Math.floor(box.minX / c); cx <= Math.floor(box.maxX / c); cx++) {
      for (let cz = Math.floor(box.minZ / c); cz <= Math.floor(box.maxZ / c); cz++) {
        const list = this.grid.get(this._key(cx, cz));
        if (!list) continue;
        const i = list.indexOf(box);
        if (i >= 0) list.splice(i, 1);
      }
    }
  }

  /** Boxes overlapping the XZ rect. Returned array is reused — copy if you keep it. */
  query(minX, minZ, maxX, maxZ) {
    const out = this._query;
    out.length = 0;
    const stamp = ++this._stamp;
    const c = this.cell;
    const cx0 = Math.floor(minX / c);
    const cx1 = Math.floor(maxX / c);
    const cz0 = Math.floor(minZ / c);
    const cz1 = Math.floor(maxZ / c);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.grid.get(this._key(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle (p.x, p.z, radius r) out of every box whose vertical span overlaps [y0, y1].
   * Mutates p. Returns the number of boxes touched; this.lastNormal holds the summed push normal.
   */
  resolveCircle(p, r, y0 = 0.3, y1 = 1.8) {
    let contacts = 0;
    let nx = 0;
    let nz = 0;
    for (let iter = 0; iter < 3; iter++) {
      const boxes = this.query(p.x - r, p.z - r, p.x + r, p.z + r);
      let moved = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.maxY < y0 || b.minY > y1) continue;
        const cx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x;
        const cz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
        let dx = p.x - cx;
        let dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          dx /= d;
          dz /= d;
          p.x += dx * push;
          p.z += dz * push;
          nx += dx;
          nz += dz;
        } else {
          // centre inside box: exit along the axis of least penetration
          const left = p.x - b.minX + r;
          const rightPen = b.maxX - p.x + r;
          const top = p.z - b.minZ + r;
          const bottom = b.maxZ - p.z + r;
          const m = Math.min(left, rightPen, top, bottom);
          if (m === left) {
            p.x -= left;
            nx -= 1;
          } else if (m === rightPen) {
            p.x += rightPen;
            nx += 1;
          } else if (m === top) {
            p.z -= top;
            nz -= 1;
          } else {
            p.z += bottom;
            nz += 1;
          }
        }
        contacts++;
        moved = true;
      }
      if (!moved) break;
    }
    const nl = Math.hypot(nx, nz) || 1;
    this.lastNormal.x = nx / nl;
    this.lastNormal.z = nz / nl;
    return contacts;
  }

  /** True if a circle at (x, z) touches no box in [y0, y1]. */
  isFree(x, z, r, y0 = 0.3, y1 = 1.8) {
    const boxes = this.query(x - r, z - r, x + r, z + r);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.maxY < y0 || b.minY > y1) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return false;
    }
    return true;
  }

  /**
   * 3D ray vs boxes (slab test). dir need not be normalised; returns hit distance along the
   * normalised direction, or Infinity. Optional filter(box) -> bool to skip boxes.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter = null) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const boxes = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    let best = maxDist;
    let hit = false;
    const inv = (v) => (Math.abs(v) < 1e-9 ? 1e9 : 1 / v);
    const ix = inv(dx);
    const iy = inv(dy);
    const iz = inv(dz);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (filter && !filter(b)) continue;
      let t1 = (b.minX - ox) * ix;
      let t2 = (b.maxX - ox) * ix;
      let tmin = Math.min(t1, t2);
      let tmax = Math.max(t1, t2);
      t1 = (b.minY - oy) * iy;
      t2 = (b.maxY - oy) * iy;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (b.minZ - oz) * iz;
      t2 = (b.maxZ - oz) * iz;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= Math.max(tmin, 0) && tmin < best) {
        best = Math.max(tmin, 0);
        hit = true;
      }
    }
    return hit ? best : Infinity;
  }

  /** Line of sight between two points (e.g. eye heights ~1.6). */
  lineOfSight(ax, ay, az, bx, by, bz) {
    const d = Math.hypot(bx - ax, by - ay, bz - az);
    if (d < 1e-6) return true;
    return this.raycast(ax, ay, az, bx - ax, by - ay, bz - az, d, (b) => b.tag !== 'tree' && b.tag !== 'prop') >= d - 1e-3;
  }
}
