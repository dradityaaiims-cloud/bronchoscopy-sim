// Auto-generated navigation routes to the displayed (CT-derived) target. Pure JS.
import * as V from '../anatomy/math.js';
import { routeTo } from '../anatomy/airwayTree.js';
import { terminalAirways } from './geometry.js';

const LETTERS = 'ABCDEF';

/**
 * Candidate routes: the terminal airway nearest the target in each of the closest segments.
 * dist is measured to the displayed target (what the planner sees).
 */
export function planRoutes(tree, target, n = 4) {
  const bySeg = new Map();
  for (const nd of terminalAirways(tree)) {
    const end = nd.centerline[nd.centerline.length - 1];
    const dist = V.len(V.sub(end, target));
    const cur = bySeg.get(nd.segment);
    if (!cur || dist < cur.dist) bySeg.set(nd.segment, { id: nd.id, dist });
  }
  const best = [...bySeg.values()].sort((a, b) => a.dist - b.dist).slice(0, n);
  return best.map((b, i) => {
    const route = routeTo(tree, b.id);
    const pathLen = route.reduce((s, id) => s + tree.nodes[id].length, 0);
    return { key: LETTERS[i], id: b.id, segment: tree.nodes[b.id].segment, dist: b.dist, route, pathLen, turns: route.length - 1 };
  });
}

/** Route-choice score 0..1: 1 for the closest candidate, losing 0.1 per extra mm of end-to-target distance. */
export function routeQuality(candidates, chosenId) {
  const c = candidates.find((x) => x.id === chosenId);
  if (!c) return 0;
  return V.clamp(1 - (c.dist - candidates[0].dist) / 10, 0, 1);
}

/** Next airway on the planned route after `nodeId` (null if off-route or at the end). */
export function nextOnRoute(route, nodeId) {
  const i = route.indexOf(nodeId);
  return i >= 0 && i < route.length - 1 ? route[i + 1] : null;
}
