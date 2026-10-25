import test from 'node:test';
import assert from 'node:assert/strict';
import { generateProceduralTree, validateTree, prepareTree, heading, routeTo } from '../src/anatomy/index.js';
import { Scope } from '../src/sim/scope.js';
import * as V from '../src/anatomy/math.js';

const raw = generateProceduralTree();
const tree = prepareTree(validateTree(JSON.parse(JSON.stringify(raw)))); // also proves JSON round-trip
const N = tree.nodes;
const h = (id) => heading(N[id]);

test('all standard segments and lobar airways exist', () => {
  const ids = ['TR', 'RMB', 'LMB', 'RUL', 'BI', 'RML', 'RLL', 'LUL', 'LLL', 'LING',
    ...Array.from({ length: 10 }, (_, i) => `RB${i + 1}`),
    'LB1+2', 'LB3', 'LB4', 'LB5', 'LB6', 'LB7+8', 'LB9', 'LB10'];
  for (const id of ids) assert.ok(N[id], id);
  assert.equal(Object.values(N).filter((n) => n.level === 'segment').length, 18);
});

test('segment orientation: superior/inferior, anterior/posterior, medial/lateral', () => {
  assert.ok(h('RB1')[1] > 0.5, 'RB1 superior');
  assert.ok(h('RB2')[2] < 0 && h('RB3')[2] > 0, 'RB2 posterior, RB3 anterior');
  assert.ok(h('RB4')[0] < h('RB5')[0], 'RB4 lateral to RB5 (patient right = -x)');
  assert.ok(h('RB6')[2] < -0.5, 'RB6 posterior');
  assert.ok(h('RB7')[0] > h('RB9')[0], 'RB7 medial to RB9');
  assert.ok(h('RB8')[2] > h('RB10')[2], 'RB8 anterior to RB10');
  assert.ok(h('LB1+2')[1] > 0.5 && h('LB1+2')[2] < 0, 'LB1+2 superior, posterior');
  assert.ok(h('LB3')[2] > 0.5, 'LB3 anterior');
  assert.ok(h('LB4')[1] > h('LB5')[1], 'LB4 superior to LB5');
  assert.ok(h('LB6')[2] < -0.5, 'LB6 posterior');
  assert.ok(h('LB9')[0] > h('LB7+8')[0], 'LB9 lateral to LB7+8');
  assert.ok(h('LB10')[2] < h('LB7+8')[2], 'LB10 posterior to LB7+8');
  for (const id of ['RMB', 'RUL', 'RB1', 'RB9']) assert.ok(h(id)[0] < 0, `${id} on patient right`);
  for (const id of ['LMB', 'LUL', 'LB1+2', 'LB9']) assert.ok(h(id)[0] > 0, `${id} on patient left`);
});

test('right main bronchus is shorter and steeper than the left', () => {
  assert.ok(N.RMB.length < N.LMB.length);
  assert.ok(V.angleBetween(h('RMB'), [0, -1, 0]) < V.angleBetween(h('LMB'), [0, -1, 0]));
});

test('lumen diameters decrease down the tree', () => {
  const d = (id) => N[id].radii[0] * 2;
  assert.ok(d('TR') > d('RMB') && d('RMB') > d('RUL') && d('RUL') > d('RB1') && d('RB1') > d('RB1a') && d('RB1a') > d('RB1a1'));
  assert.ok(d('LMB') < d('TR'));
});

test('lungs have plausible extent (mm from carina)', () => {
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const n of Object.values(N)) if (n.id !== 'TR') for (const p of n.centerline) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  assert.ok(max[1] > 35 && max[1] < 100, `apex ${max[1]}`);
  assert.ok(min[1] < -110 && min[1] > -230, `base ${min[1]}`);
  assert.ok(min[0] > -170 && max[0] < 170, `width ${min[0]}..${max[0]}`);
});

test('frames are orthonormal; start distance is zero at the carina', () => {
  for (const n of Object.values(N)) n.rt.T.forEach((T, i) => {
    assert.ok(Math.abs(V.dot(T, n.rt.U[i])) < 1e-6);
    assert.ok(Math.abs(V.len(n.rt.U[i]) - 1) < 1e-6);
  });
  assert.ok(Math.abs(N.TR.rt.startDist + N.TR.length) < 1e-9);
  assert.equal(N.RMB.rt.startDist, 0);
});

test('routeTo gives the airway path', () => {
  assert.deepEqual(routeTo(tree, 'RB6'), ['TR', 'RMB', 'BI', 'RLL', 'RB6']);
  assert.deepEqual(routeTo(tree, 'LB4'), ['TR', 'LMB', 'LUL', 'LING', 'LB4']);
});

test('carina view: roll 0 puts the right main bronchus on screen right', () => {
  const p = new Scope(tree).pose;
  const toRmb = V.sub(N.RMB.centerline[2], p.pos);
  assert.ok(V.dot(toRmb, p.right) > 0, 'RMB right of view');
  assert.ok(p.up[2] > 0.9, 'up is anterior');
});

test('scope: needs aim to enter a branch; entering keeps the view direction', () => {
  const sc = new Scope(tree);
  sc.move(40); // straight ahead: stops at the carina
  assert.equal(sc.nodeId, 'TR');
  assert.equal(sc.blocked, 'carina');

  // aim at the right main bronchus by flexing toward it
  const target = V.norm(V.sub(N.RMB.centerline[2], sc.pose.pos));
  const toward = V.perpUnit(target, sc.pose.frame.T);
  sc.roll = Math.atan2(V.dot(toward, sc.pose.frame.R), V.dot(toward, sc.pose.frame.U));
  sc.flex = V.angleBetween(target, sc.pose.frame.T);
  const before = sc.pose.f;
  sc.move(5);
  assert.equal(sc.nodeId, 'RMB');
  assert.ok(V.angleBetween(before, sc.pose.f) < 0.05, 'aim preserved across junction');

  sc.move(-60); // withdraw back out
  assert.equal(sc.nodeId, 'TR');
});

test('scope: confined to a branch for the quiz', () => {
  const sc = new Scope(tree);
  sc.place('RB3', 10);
  sc.confine = 'RB3';
  sc.move(500);
  assert.equal(sc.nodeId, 'RB3');
  sc.move(-500);
  assert.equal(sc.s, 0);
});
