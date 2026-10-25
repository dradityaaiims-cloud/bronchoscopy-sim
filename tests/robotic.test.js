import test from 'node:test';
import assert from 'node:assert/strict';
import { generateProceduralTree, prepareTree, validateTree } from '../src/anatomy/index.js';
import { placeNodule, tipRelation } from '../src/robotic/geometry.js';
import { CASES, DIFFICULTY } from '../src/robotic/cases.js';
import { planRoutes, routeQuality, nextOnRoute } from '../src/robotic/planning.js';
import { rebusScene } from '../src/robotic/rebus.js';
import { sample, TOOLS } from '../src/robotic/sampling.js';
import { scoreCase } from '../src/robotic/scoring.js';
import { catheterShape, shapeLength } from '../src/robotic/catheter.js';
import { Scope } from '../src/sim/scope.js';
import { cbctAssessment, CtVolume, renderSlice } from '../src/robotic/cbct.js';
import * as V from '../src/anatomy/math.js';

const tree = prepareTree(validateTree(generateProceduralTree()));
const nod = (c) => placeNodule(tree, c);

test('every case references a real, terminal airway and has sensible geometry', () => {
  for (const c of CASES) {
    const nd = tree.nodes[c.ref];
    assert.ok(nd, `${c.id}: ${c.ref}`);
    assert.equal(nd.children.length, 0, `${c.id} should end at a terminal airway`);
    assert.equal(nd.segment, c.segment, `${c.id} segment label`);
    const n = nod(c);
    const end = nd.centerline.at(-1);
    const d = V.len(V.sub(n.center, end));
    if (c.sign) assert.ok(d < n.r, `${c.id}: bronchus-sign lesion should touch the airway end`);
    else assert.ok(d > n.r, `${c.id}: no-sign lesion should lie beside the airway`);
    assert.ok(Math.abs(n.divergenceMm - Math.hypot(...c.divergence)) < 1e-9);
    assert.ok(['Easy', 'Medium', 'Hard', 'Expert'].includes(DIFFICULTY(c)));
  }
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
});

test('route planning: closest candidate first, routes start at the trachea and are connected', () => {
  for (const c of CASES) {
    const n = nod(c);
    const routes = planRoutes(tree, n.displayed);
    assert.equal(routes.length, 4);
    for (let i = 1; i < routes.length; i++) assert.ok(routes[i].dist >= routes[i - 1].dist);
    for (const r of routes) {
      assert.equal(r.route[0], 'TR');
      for (let i = 1; i < r.route.length; i++) assert.equal(tree.nodes[r.route[i]].parent, r.route[i - 1]);
    }
    assert.equal(routeQuality(routes, routes[0].id), 1);
    assert.ok(routeQuality(routes, routes[3].id) <= routeQuality(routes, routes[1].id));
  }
  const r = planRoutes(tree, nod(CASES[0]).displayed)[0];
  assert.equal(nextOnRoute(r.route, 'TR'), r.route[1]);
  assert.equal(nextOnRoute(r.route, r.id), null);
  assert.equal(nextOnRoute(r.route, 'LMB'), null);
});

test('divergence cases misdirect the plan to a neighbouring airway; the true best airway differs', () => {
  for (const id of ['c5', 'c6']) {
    const c = CASES.find((x) => x.id === id), n = nod(c);
    const planned = planRoutes(tree, n.displayed)[0].id, truth = planRoutes(tree, n.center)[0].id;
    assert.notEqual(planned, truth, `${id}: following the plan should not end at the best airway for the true lesion`);
    assert.ok(n.divergenceMm > 8);
  }
});

test('r-EBUS: concentric inside, eccentric beside, none far away', () => {
  const c = CASES[0], n = nod(c);
  const up = [0, 0, 1], right = [1, 0, 0], f = [0, -1, 0];
  const mk = (tipOffset) => rebusScene(V.add(n.center, tipOffset), f, up, right, n);
  assert.equal(mk([0, 0, 0]).pattern, 'concentric');
  assert.equal(mk([n.r * 0.9, 0, 0]).pattern, 'eccentric');
  assert.equal(mk([60, 0, 0]).pattern, 'none');
  // a lesion far ahead of the probe plane is not in the image
  assert.equal(mk([0, n.r * 3 + 20, 0]).pattern, 'none');
  // bearing: lesion on image-right => positive x bearing
  assert.ok(mk([-n.r * 0.9, 0, 0]).cx > 0);
  // clock position: lesion to the image right => 3 o'clock; above => 12
  assert.equal(mk([-n.r * 0.9, 0, 0]).clock, 3);
  assert.equal(mk([0, 0, -n.r * 0.9]).clock, 12);
});

test('sampling: geometry decides, reach differs by tool, outcomes are reproducible', () => {
  const n = nod(CASES[0]);
  const tip = V.sub(n.center, [0, -2, 0]);              // 2 mm above the lesion centre
  const f = [0, -1, 0];
  for (const t of Object.keys(TOOLS)) assert.ok(sample(t, tip, f, n, 3, 0).inLesion, t);
  // 15 mm short of the lesion: needle (reach 18) still gets there, forceps/brush do not
  const far = V.add(n.center, [0, 15 + n.r, 0]);
  assert.ok(sample('needle', far, f, n, 3, 0).inLesion);
  assert.ok(!sample('forceps', far, f, n, 3, 0).inLesion);
  assert.ok(!sample('brush', far, f, n, 3, 0).inLesion);
  // same inputs -> same answer
  assert.deepEqual(sample('needle', tip, f, n, 3, 1), sample('needle', tip, f, n, 3, 1));
  // outside the lesion and pointing away misses
  const outside = V.add(n.center, [0, n.r + 4, 0]);
  assert.ok(!sample('needle', outside, [0, 1, 0], n, 3, 0).inLesion);
  assert.ok(sample('needle', outside, [0, -1, 0], n, 3, 0).inLesion);
});

test('tipRelation and CBCT assessment agree', () => {
  const n = nod(CASES[2]);
  const inside = tipRelation(n.center, [0, -1, 0], n);
  assert.ok(inside.inside && cbctAssessment(n.center, n).inLesion);
  const beside = V.add(n.center, [n.r + 5, 0, 0]);
  assert.ok(!tipRelation(beside, [0, -1, 0], n).inside);
  assert.ok(Math.abs(cbctAssessment(beside, n).edge - 5) < 1e-9);
});

test('scoring: a perfect case is 100; skipping confirmation and sampling is penalised', () => {
  const base = {
    case: CASES[0], divergenceMm: 3, routeQuality: 1, routeBest: 'RB1a1', routeChosen: 'RB1a1', timeSec: 100, contacts: 0,
    rebus: ['concentric'], cbct: [{ edge: -3, inLesion: true }], targetUpdated: false,
    samples: [{ tool: 'needle', diagnostic: true, inLesion: true, minDist: 0, edge: -5, confirmedFirst: true, reason: '' }],
  };
  const best = scoreCase(base);
  assert.equal(best.total, 100);
  assert.ok(best.success && best.feedback.well.length >= 3);
  const sloppy = scoreCase({ ...base, rebus: [], cbct: [], contacts: 5, timeSec: 600, routeQuality: 0.2,
    samples: [{ tool: 'forceps', diagnostic: false, inLesion: false, minDist: 20, edge: 14, confirmedFirst: false, reason: 'missed' }] });
  assert.ok(sloppy.total < 30, `sloppy ${sloppy.total}`);
  assert.ok(!sloppy.success);
  assert.ok(sloppy.feedback.improve.some((s) => /confirm/i.test(s)));
  // later diagnostic pass scores less than the first
  const second = scoreCase({ ...base, samples: [{ ...base.samples[0], diagnostic: false }, base.samples[0]] });
  assert.equal(second.parts.find((p) => p.label === 'Sampling').got, 28);
  // divergence case: recognised vs not
  const div = { ...base, case: CASES[4], divergenceMm: 12, rebus: ['eccentric'], cbct: [{ edge: 6, inLesion: false }, { edge: -2, inLesion: true }] };
  assert.ok(scoreCase(div).feedback.well.some((s) => /recognised/.test(s)));
  assert.ok(scoreCase(div).feedback.teach.some((s) => /divergence/i.test(s)));
});

test('catheter shape runs from the trachea to the tip and grows as the scope advances', () => {
  const sc = new Scope(tree);
  sc.place('TR', 20);
  const a = shapeLength(catheterShape(tree, sc));
  sc.place('RB3', 10);
  const pts = catheterShape(tree, sc);
  const b = shapeLength(pts);
  assert.ok(b > a + 100);
  assert.ok(V.len(V.sub(pts[0], tree.nodes.TR.centerline[0])) < 1);
});

test('CBCT slices render and the nodule is brighter than lung', () => {
  const vol = new CtVolume({ dims: [10, 10, 10], origin: [-10, -10, -10], step: 2 }, new Uint8Array(1000).fill(10));
  const mk = () => { const px = new Uint8ClampedArray(20 * 20 * 4); return { width: 20, height: 20, getContext: () => ({ createImageData: () => ({ data: px }), putImageData() {}, strokeStyle: '', beginPath() {}, arc() {}, stroke() {}, fillText() {}, fillStyle: '', font: '' }), px }; };
  const c = mk();
  renderSlice(c, vol, 'axial', 0, { center: [0, 0, 0], fov: 8, nodule: { center: [0, 0, 0], r: 2 }, shape: [], tip: null });
  assert.ok(c.px[(10 * 20 + 10) * 4] > 100, 'centre pixel is nodule');
  assert.equal(c.px[(0 * 20 + 0) * 4], 10, 'corner stays lung');
});
