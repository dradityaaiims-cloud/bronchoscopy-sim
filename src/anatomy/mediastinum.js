// Schematic mediastinal landmarks shared by the 3D map, the EBUS ultrasound and the CT guidance
// (same frame as the airway tree: mm, x left, y superior, z anterior, origin at the carina).
// Illustrative geometry for teaching, not measurements.

export const HEART = { center: [26, -64, 54], scale: [36, 44, 32], rotZ: -0.5 };

/** kind: artery | vein | esophagus. pts are Catmull-Rom control points. */
export const VESSELS = [
  { id: 'aorta', kind: 'artery', r: 12, color: 0xc4453d, pts: [[8, -40, 42], [6, 8, 40], [9, 30, 27], [16, 37, 4], [24, 26, -18], [25, -10, -32], [22, -80, -38], [20, -150, -38]] },
  { id: 'pulmonary trunk', kind: 'vein', r: 10, color: 0x4f7fd0, pts: [[16, -48, 52], [14, -22, 38], [8, -18, 22]] },
  { id: 'right pulmonary artery', kind: 'vein', r: 8, color: 0x4f7fd0, pts: [[8, -18, 22], [-12, -26, 14], [-38, -30, 10], [-52, -44, 6]] },
  { id: 'left pulmonary artery', kind: 'vein', r: 8, color: 0x4f7fd0, pts: [[8, -18, 22], [28, -20, 6], [46, -24, -4], [58, -38, -8]] },
  { id: 'SVC', kind: 'vein', r: 8, color: 0x4f7fd0, pts: [[-18, 84, 14], [-19, 30, 20], [-19, -34, 28]] },
  { id: 'azygos', kind: 'vein', r: 4, color: 0x4f7fd0, pts: [[-6, -8, -30], [-14, -2, -14], [-16, -6, 4], [-19, -8, 18]] },
  { id: 'esophagus', kind: 'esophagus', r: 6.5, color: 0xd9a38e, pts: [[2, 112, -14], [3, 50, -22], [6, 0, -27], [10, -60, -30], [14, -130, -30]] },
];

/** Uniform Catmull-Rom through pts, sampled about every `step` mm (pure JS). */
export function densify(pts, step = 2) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Normalised distance inside the (rotated) heart ellipsoid: <1 means inside. */
export function heartNorm(p) {
  const c = Math.cos(-HEART.rotZ), s = Math.sin(-HEART.rotZ);
  const dx = p[0] - HEART.center[0], dy = p[1] - HEART.center[1], dz = p[2] - HEART.center[2];
  const x = c * dx - s * dy, y = s * dx + c * dy;
  return Math.hypot(x / HEART.scale[0], y / HEART.scale[1], dz / HEART.scale[2]);
}
