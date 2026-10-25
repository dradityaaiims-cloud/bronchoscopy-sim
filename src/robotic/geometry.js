// Nodule geometry and the catheter-to-nodule relationship (pure JS, unit-tested).
// All positions are mm in the airway-tree frame (x left, y superior, z anterior; origin at carina).
import * as V from '../anatomy/math.js';

/** Airways with no children: the places a catheter can end up. */
export const terminalAirways = (tree) => tree.list.filter((n) => !n.children.length);

/**
 * Place a nodule near the end of airway `spec.ref`.
 *   bronchus sign present: the airway leads straight into the lesion;
 *   absent: the lesion lies beside the airway, `gap` mm of lung parenchyma away from the wall.
 * `divergence` (mm) is how far the *displayed* CT target is from the true lesion.
 */
export function placeNodule(tree, spec) {
  const nd = tree.nodes[spec.ref];
  if (!nd) throw new Error(`unknown airway ${spec.ref}`);
  const c = nd.centerline;
  const end = c[c.length - 1];
  const dir = V.norm(V.sub(end, c[c.length - 2]));
  const r = spec.diameter / 2;
  const rnd = V.mulberry32(spec.seed ?? 1);
  let center;
  if (spec.sign) {
    center = V.add(end, V.scale(dir, 0.2 * r));
  } else {
    const ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const a = V.norm(V.cross(dir, ref));
    const b = V.cross(dir, a);
    const th = rnd() * Math.PI * 2;
    const perp = V.add(V.scale(a, Math.cos(th)), V.scale(b, Math.sin(th)));
    center = V.add(V.add(end, V.scale(dir, 0.5 * r)), V.scale(perp, r + (spec.gap ?? 6)));
  }
  const div = spec.divergence ?? [0, 0, 0];
  return {
    ref: spec.ref, center, r, diameter: spec.diameter, sign: !!spec.sign, gap: spec.gap ?? 0,
    divergence: div, divergenceMm: V.len(div),
    displayed: V.add(center, div), // where the CT-based plan says the lesion is
  };
}

/** Catheter tip pose -> relationship to the true nodule. */
export function tipRelation(tipPos, fwd, nodule) {
  const to = V.sub(nodule.center, tipPos);
  const dist = V.len(to);
  const along = V.dot(to, V.norm(fwd));
  return {
    dist,                       // tip to lesion centre
    edge: dist - nodule.r,      // tip to lesion surface (negative = inside)
    inside: dist < nodule.r,
    along,                      // component of the centre ahead of the tip
    aimAngle: Math.acos(V.clamp(along / (dist || 1), -1, 1)), // 0 = tip points straight at the lesion
  };
}

/** Distance from point p to segment ab. */
export function distToSegment(p, a, b) {
  const ab = V.sub(b, a);
  const t = V.clamp(V.dot(V.sub(p, a), ab) / (V.dot(ab, ab) || 1), 0, 1);
  return V.len(V.sub(p, V.add(a, V.scale(ab, t))));
}
