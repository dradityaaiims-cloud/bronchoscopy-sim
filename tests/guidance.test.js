import test from 'node:test';
import assert from 'node:assert/strict';
import { generateProceduralTree, prepareTree, validateTree } from '../src/anatomy/index.js';
import { STATIONS, stationNorm } from '../src/anatomy/lymphNodes.js';
import { VESSELS, densify } from '../src/anatomy/mediastinum.js';
import { buildEbusScene, nearStructures, classify, visibleNodes, scanPlane, EBUS } from '../src/guidance/ebus.js';
import { Scope } from '../src/sim/scope.js';
import * as V from '../src/anatomy/math.js';

const tree = prepareTree(validateTree(generateProceduralTree()));
const scene = buildEbusScene(tree);
const st = (id) => STATIONS.find((s) => s.id === id);
const at = (p) => classify(nearStructures(scene, p, 80), p, 0.5);

test('densify passes through its control points', () => {
  const pts = VESSELS[0].pts, d = densify(pts, 2);
  assert.deepEqual(d[0], pts[0]);
  assert.deepEqual(d.at(-1), pts.at(-1));
  for (let i = 1; i < d.length; i++) assert.ok(V.len(V.sub(d[i], d[i - 1])) < 4.5);
});

test('stationNorm: <1 at the centre, >1 well outside', () => {
  const s = st('7');
  assert.ok(stationNorm(s, s.pos) < 0.01);
  assert.ok(stationNorm(s, V.add(s.pos, [3 * s.r, 0, 0])) > 2);
});

test('classification: node, aorta, esophagus and airway lumen are told apart', () => {
  assert.equal(at(st('7').pos).tag, 'node');
  assert.equal(at(st('7').pos).id, '7');
  assert.equal(at(VESSELS[0].pts[2]).tag, 'vessel');                     // inside the aorta
  assert.equal(at(VESSELS[6].pts[2]).tag, 'esophagus');
  assert.equal(at([0, 40, 5]).tag, 'airway');                            // trachea lumen
  assert.equal(at([0, 40, 90]).tag, 'tissue');                           // far from everything
});

test('scan plane: a scope in the trachea facing 12 o clock sees right-side stations only when rolled', () => {
  const sc = new Scope(tree);
  sc.place('TR', tree.nodes.TR.length - 30);            // 30 mm above the carina, roll 0: transducer faces anterior
  const anterior = visibleNodes(scanPlane(sc.pose)).map((v) => v.st.id);
  sc.roll = Math.PI / 2;                                // roll toward the patient's right
  const right = visibleNodes(scanPlane(sc.pose)).map((v) => v.st.id);
  assert.ok(right.includes('4R'), `4R should be seen when scanning to the right: ${right}`);
  assert.ok(!anterior.includes('4R'));
  for (const v of visibleNodes(scanPlane(sc.pose))) assert.ok(v.depth < EBUS.depth + v.diam);
});
