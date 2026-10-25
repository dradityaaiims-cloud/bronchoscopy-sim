// Validation + runtime preparation of an airway-tree JSON (from any provider).
// prepareTree adds non-enumerable runtime data (arclength, parallel-transport
// frames, flat segment table for the shader) so the raw JSON stays serialisable.
import * as V from './math.js';
import { RING_STYLE, NAMED_LEVELS } from './segments.js';

export function validateTree(t) {
  const fail = (m) => { throw new Error(`Invalid airway tree: ${m}`); };
  if (!t || typeof t.schema !== 'string' || !t.schema.startsWith('bronchoscopy-airway-tree/')) fail('bad schema tag');
  if (!t.nodes || !t.nodes[t.rootId]) fail('missing root node');
  for (const [id, nd] of Object.entries(t.nodes)) {
    if (nd.id !== id) fail(`${id}: id mismatch`);
    if (!nd.label) fail(`${id}: missing label`);
    const c = nd.centerline;
    if (!Array.isArray(c) || c.length < 2 || c.some((p) => p.length !== 3 || p.some((x) => !Number.isFinite(x)))) fail(`${id}: bad centerline`);
    if (!Array.isArray(nd.radii) || nd.radii.length !== c.length) fail(`${id}: radii/centerline length mismatch`);
    if (nd.parent) {
      const p = t.nodes[nd.parent];
      if (!p) fail(`${id}: unknown parent ${nd.parent}`);
      if (!p.children.includes(id)) fail(`${id}: not listed in parent's children`);
      if (V.len(V.sub(c[0], p.centerline[p.centerline.length - 1])) > 0.5) fail(`${id}: does not start at parent's end`);
    }
    for (const ch of nd.children) if (!t.nodes[ch]) fail(`${id}: unknown child ${ch}`);
  }
  return t;
}

const hidden = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: false, writable: true });

export function prepareTree(t) {
  const list = Object.values(t.nodes);
  const segRows = [];
  for (const nd of list) {
    const c = nd.centerline;
    const n = c.length;
    const s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + V.len(V.sub(c[i], c[i - 1])));
    const T = c.map((_, i) => V.norm(V.sub(c[Math.min(i + 1, n - 1)], c[Math.max(i - 1, 0)])));

    // Parallel-transport "up" vector. Roll 0 means up ≈ anterior (supine patient,
    // operator at the head), so the right main bronchus appears on screen right.
    const parentRt = nd.parent ? t.nodes[nd.parent].rt : null;
    const seed = parentRt ? parentRt.U[parentRt.U.length - 1] : [0, 0, 1];
    let u0 = V.perpUnit(seed, T[0]) || V.perpUnit([0, 0, 1], T[0]) || V.perpUnit([1, 0, 0], T[0]);
    const U = [u0];
    for (let i = 1; i < n; i++) {
      const ax = V.cross(T[i - 1], T[i]);
      const ang = V.angleBetween(T[i - 1], T[i]);
      const u = V.len(ax) < 1e-6 ? U[i - 1] : V.rotate(U[i - 1], ax, ang);
      U.push(V.perpUnit(u, T[i]) || U[i - 1]);
    }
    hidden(nd, 'rt', { s, T, U, startDist: 0 });
  }
  // Distance along the airways from the carina (negative in the trachea).
  const root = t.nodes[t.rootId];
  root.rt.startDist = -root.length;
  const walk = (nd) => {
    for (const id of nd.children) {
      const ch = t.nodes[id];
      ch.rt.startDist = nd.rt.startDist + nd.length;
      walk(ch);
    }
  };
  walk(root);

  // Flat segment table consumed by the scope shader:
  // [ax ay az ra | bx by bz rb | s0 s1 ringStrength ringSpacing]
  for (const nd of list) {
    const [strength, spacing] = RING_STYLE[nd.level] || [0.1, 1.5];
    for (let i = 0; i + 1 < nd.centerline.length; i++) {
      segRows.push(...nd.centerline[i], nd.radii[i], ...nd.centerline[i + 1], nd.radii[i + 1],
        nd.rt.s[i], nd.rt.s[i + 1], strength, spacing);
    }
  }
  hidden(t, 'segData', new Float32Array(segRows));
  hidden(t, 'list', list);
  hidden(t, 'root', root);
  return t;
}

/** Position, tangent T, up U, right R (= T x U) and radius at arclength s of a node. */
export function sampleNode(nd, s) {
  const { s: S, T, U } = nd.rt;
  const x = V.clamp(s, 0, S[S.length - 1]);
  let i = 0;
  while (i < S.length - 2 && x > S[i + 1]) i++;
  const f = S[i + 1] > S[i] ? (x - S[i]) / (S[i + 1] - S[i]) : 0;
  const tan = V.norm(V.lerp(T[i], T[i + 1], f));
  const up = V.perpUnit(V.lerp(U[i], U[i + 1], f), tan) || U[i];
  return {
    pos: V.lerp(nd.centerline[i], nd.centerline[i + 1], f),
    T: tan, U: up, R: V.cross(tan, up),
    radius: nd.radii[i] + (nd.radii[i + 1] - nd.radii[i]) * f,
  };
}

/** Node ids from the trachea down to `id` (inclusive). */
export function routeTo(t, id) {
  const r = [];
  for (let n = t.nodes[id]; n; n = n.parent ? t.nodes[n.parent] : null) r.unshift(n.id);
  return r;
}

export const isNamed = (nd) => NAMED_LEVELS.includes(nd.level);

/** Mean heading of a node (end - start), handy for orientation checks. */
export const heading = (nd) => V.norm(V.sub(nd.centerline[nd.centerline.length - 1], nd.centerline[0]));
