// Shared math helpers. World conventions (see ARCHITECTURE.md):
//   1 unit = 1 meter, +Y up, +X east, -Z north.
//   heading (yaw, radians): 0 = facing north (-Z), PI/2 = facing west (-X).
//   Models are built facing -Z and placed with object.rotation.y = heading.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential smoothing toward target. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Wrap angle to (-PI, PI]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed difference b - a in (-PI, PI]. */
export const angleDiff = (a, b) => wrapAngle(b - a);

/** Smoothly turn angle a toward b. */
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** Heading that faces direction (dx, dz). */
export const headingTo = (dx, dz) => Math.atan2(-dx, -dz);

/** Unit forward vector for a heading, written into out {x, z} (returns out). */
export function forward(heading, out = { x: 0, z: 0 }) {
  out.x = -Math.sin(heading);
  out.z = -Math.cos(heading);
  return out;
}

/** Unit right vector for a heading. */
export function right(heading, out = { x: 0, z: 0 }) {
  out.x = Math.cos(heading);
  out.z = -Math.sin(heading);
  return out;
}

export const dist2D = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
export const distSq2D = (ax, az, bx, bz) => (bx - ax) * (bx - ax) + (bz - az) * (bz - az);

/** Point inside rect {x0, x1, z0, z1} (x0 < x1, z0 < z1). */
export const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Random point on unit disc using provided rng (or Math.random). */
export function randomInDisc(radius, rng = Math.random) {
  const a = rng() * TAU;
  const r = Math.sqrt(rng()) * radius;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Format dollars like "$1,250". */
export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

/** Format a game-clock hour (e.g. 19.75) as "7:45 PM". */
export function clockText(hour) {
  const h = ((hour % 24) + 24) % 24;
  let hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${ampm}`;
}
