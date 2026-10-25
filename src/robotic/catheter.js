// Catheter shape (what shape sensing would report): the path through the airways to the tip,
// plus a short articulated tail in the aim direction. Pure JS.
import * as V from '../anatomy/math.js';
import { routeTo, sampleNode } from '../anatomy/airwayTree.js';

/** Points from the top of the trachea to the tip, ~`step` mm apart, then the bent distal tail. */
export function catheterShape(tree, scope, step = 1.5, tail = 8) {
  const pts = [];
  for (const id of routeTo(tree, scope.nodeId)) {
    const nd = tree.nodes[id];
    const end = id === scope.nodeId ? scope.s : nd.length;
    for (let s = 0; s < end; s += step) pts.push(sampleNode(nd, s).pos);
  }
  const pose = scope.pose;
  pts.push(pose.pos);
  for (let k = 1; k <= 4; k++) {
    const dir = V.norm(V.lerp(pose.frame.T, pose.f, k / 4));
    pts.push(V.add(pts[pts.length - 1], V.scale(dir, tail / 4)));
  }
  return pts;
}

/** Total sensed length (mm) of a shape polyline. */
export function shapeLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += V.len(V.sub(pts[i], pts[i - 1]));
  return l;
}
