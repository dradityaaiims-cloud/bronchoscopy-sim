import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRule, RULES, GENERAL } from '../src/ui/bobaRules.js';
import { SECTIONS } from '../src/learn/content.js';
import { STATIONS, nearbyStations } from '../src/anatomy/lymphNodes.js';
import { generateProceduralTree } from '../src/anatomy/index.js';

const base = (o = {}) => ({
  t: 0, mode: 'explore', labelsShown: true, node: { id: 'TR', label: 'Trachea', level: 'trachea', desc: 'd' },
  scope: { blocked: null, s: 0 }, near: [], seenNodes: new Set(['TR']),
  flags: { moved: true, flexed: true, rolled: true, usedLabels: true, usedNodes: true, usedEbus: true, usedSection: true, openedLearn: true, toured: true },
  quiz: null, nav: null, ...o,
});

test('a calm, experienced user gets no proactive tip', () => {
  assert.equal(nextRule(base({ t: 100 }), new Map(), Date.now()), null);
});
test('blocked at the carina triggers the aiming tip', () => {
  assert.equal(nextRule(base({ scope: { blocked: 'carina' } }), new Map(), Date.now())?.id, 'blocked');
});
test('a new user who has not moved is told how to drive', () => {
  assert.equal(nextRule(base({ t: 30, flags: { ...base().flags, moved: false } }), new Map(), Date.now())?.id, 'move');
});
test('entering a new named airway shows its teaching text once', () => {
  const node = { id: 'RUL', label: 'RUL', level: 'lobar', desc: 'trifurcates' };
  const ctx = base({ node });
  const r = nextRule(ctx, new Map(), Date.now());
  assert.equal(r.id, 'node');
  assert.match(r.text(ctx), /trifurcates/);
  const fired = new Map([[r.key, Date.now()]]);
  assert.equal(nextRule({ ...ctx, seenNodes: new Set(['RUL']) }, fired, Date.now()), null);
});
test('a rule is not repeated inside its cooldown', () => {
  const now = 1e6;
  assert.equal(nextRule(base({ scope: { blocked: 'carina' } }), new Map([['blocked', now - 1000]]), now), null);
});
test('every rule and general tip is a non-empty string', () => {
  for (const r of RULES) assert.ok(r.text(base({ near: ['7'], node: { id: 'x', label: 'x', desc: 'a longer teaching text' } })).length > 10, r.id);
  assert.ok(GENERAL.every((g) => g.length > 10));
});

test('learn content: unique ids, every table row matches its header width', () => {
  assert.equal(new Set(SECTIONS.map((s) => s.id)).size, SECTIONS.length);
  for (const s of SECTIONS) for (const b of s.blocks) if (b.table) for (const r of b.table.rows) assert.equal(r.length, b.table.head.length, `${s.id}: ${r[0]}`);
});
test('learn "Show in scope" rows all name real airways', () => {
  const t = generateProceduralTree();
  for (const s of SECTIONS) for (const b of s.blocks) if (b.table?.go != null) for (const r of b.table.rows) assert.ok(t.nodes[r[b.table.go]], r[b.table.go]);
});

test('lymph node stations: unique ids, none inside an airway lumen, adjacency works', () => {
  assert.equal(new Set(STATIONS.map((s) => s.id)).size, STATIONS.length);
  const t = generateProceduralTree();
  for (const s of STATIONS) {
    for (const n of Object.values(t.nodes)) {
      if (n.level === 'subsegment' || n.level === 'distal') continue;
      for (let i = 0; i < n.centerline.length - 1; i++) {
        const [a, b] = [n.centerline[i], n.centerline[i + 1]];
        const ab = b.map((x, k) => x - a[k]), ap = s.pos.map((x, k) => x - a[k]);
        const h = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
        const d = Math.hypot(...ap.map((x, k) => x - ab[k] * h));
        assert.ok(d > n.radii[i] + s.r * 0.5, `${s.id} overlaps ${n.id}`);
      }
    }
  }
  const carina = nearbyStations([0, -2, 0]).map((s) => s.id);
  for (const id of ['7', '10R']) assert.ok(carina.includes(id), `${id} near the carina: ${carina}`);
});

test('robotic tips: confirm before sampling, eccentric and wrong-airway advice', () => {
  const rob = (o) => base({ mode: 'robotic', rob: { stage: 'nav', probeIn: true, distance: 50, offRoute: false, offSecs: 0, rebusLast: undefined, rebusN: 0, cbctN: 0, samples: 0, chosen: 'x', ...o } });
  const id = (c) => nextRule(c, new Map(), Date.now())?.id ?? null;
  assert.equal(id(rob({ distance: 8 })), 'rob-near');
  assert.equal(id(rob({ probeIn: false })), 'rob-confirm');
  assert.equal(id(rob({ probeIn: false, rebusN: 1, rebusLast: 'eccentric' })), 'rob-ecc');
  assert.equal(id(rob({ probeIn: false, rebusN: 1, rebusLast: 'none' })), 'rob-none');
  assert.equal(id(rob({ offRoute: true, offSecs: 20 })), 'rob-off');
  assert.equal(id(base({ mode: 'robotic', rob: { stage: 'plan', chosen: null } })), 'rob-plan');
  assert.equal(id(rob({ distance: 50 })), null);
});
