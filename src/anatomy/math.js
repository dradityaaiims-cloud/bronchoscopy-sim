// Tiny vec3 helpers on plain [x, y, z] arrays. No three.js dependency, so the
// anatomy + scope-state code runs unchanged in Node (tests, export script).

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const smooth01 = (t) => t * t * (3 - 2 * t);
export const angleBetween = (a, b) => Math.acos(clamp(dot(norm(a), norm(b)), -1, 1));

/** Rodrigues rotation of v about unit `axis` by `ang` radians. */
export function rotate(v, axis, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const k = norm(axis);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** Component of v perpendicular to unit t, normalised (null if degenerate). */
export function perpUnit(v, t) {
  const p = sub(v, scale(t, dot(v, t)));
  return len(p) < 1e-4 ? null : norm(p);
}

/** Seeded PRNG so the procedural tree is reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
