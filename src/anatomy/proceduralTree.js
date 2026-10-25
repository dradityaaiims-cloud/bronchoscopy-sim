// Procedural airway generator: SPEC (segments.js) -> plain-JSON airway tree.
// Output follows the schema documented in README.md ("Airway tree JSON").
import * as V from './math.js';
import { SPEC, LOBE_INFO } from './segments.js';

export const SCHEMA = 'bronchoscopy-airway-tree/1';
const round2 = (p) => p.map((x) => Math.round(x * 100) / 100);

/** Curve from the parent's end heading `tin` into `dir`, fully aligned by mid-length. */
function bentCenterline(start, tin, dir, length, step) {
  const n = Math.max(3, Math.ceil(length / step) + 1);
  const h = length / (n - 1);
  const pts = [start];
  let p = start;
  for (let i = 0; i < n - 1; i++) {
    const w = V.smooth01(V.clamp((i + 0.5) / (n - 1) / 0.5, 0, 1));
    p = round2(V.add(p, V.scale(V.norm(V.lerp(tin, dir, w)), h)));
    pts.push(p);
  }
  return pts;
}

/** Unlabelled subsegmental (a/b) and distal (1/2) stubs so peripheral paths exist. */
function stubSpecs(rand, generations) {
  const out = [];
  const grow = (parent, seg, gen) => {
    if (gen > generations) return;
    const d = V.norm(parent.dir);
    const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const ax1 = V.norm(V.cross(d, ref));
    const axis = gen % 2 === 1 ? ax1 : V.cross(d, ax1);
    const ang = ((24 + 6 * (rand() - 0.5)) * Math.PI) / 180;
    (gen === 1 ? ['a', 'b'] : ['1', '2']).forEach((suffix, k) => {
      const spec = {
        id: parent.id + suffix,
        parent: parent.id,
        level: gen === 1 ? 'subsegment' : 'distal',
        zone: seg.zone,
        lobe: seg.lobe,
        label: parent.label + suffix,
        name: `${seg.name} (${gen === 1 ? 'subsegment' : 'distal branch'} ${parent.label}${suffix})`,
        dir: V.rotate(d, axis, (k ? -1 : 1) * ang),
        len: seg.len * (gen === 1 ? 0.8 : 0.6),
        dia: Math.max(gen === 1 ? 3.0 : 2.2, seg.dia * (gen === 1 ? 0.68 : 0.48)),
        desc: `Subsegmental airway belonging to ${seg.label} (${seg.name}). Too small for a standard bronchoscope.`,
        segmentId: seg.id,
      };
      out.push(spec);
      grow(spec, seg, gen + 1);
    });
  };
  for (const seg of SPEC.filter((s) => s.level === 'segment')) grow(seg, seg, 1);
  return out;
}

export function generateProceduralTree({ seed = 7, generations = 2, step = 7 } = {}) {
  if (generations > 2) throw new Error('generations > 2 is not supported (no naming scheme)');
  const rand = V.mulberry32(seed);
  const nodes = {};
  for (const sp of [...SPEC, ...stubSpecs(rand, generations)]) {
    const parent = sp.parent ? nodes[sp.parent] : null;
    const dir = V.norm(sp.dir);
    let centerline;
    if (!parent) {
      // Root: straight, ending at the carina (origin).
      const n = Math.ceil(sp.len / 9) + 1;
      centerline = Array.from({ length: n }, (_, i) =>
        round2(V.scale(dir, -sp.len * (1 - i / (n - 1)))));
    } else {
      const c = parent.centerline;
      const tin = V.norm(V.sub(c[c.length - 1], c[c.length - 2]));
      centerline = bentCenterline(c[c.length - 1], tin, dir, sp.len, step);
    }
    const r0 = sp.dia / 2;
    const radii = centerline.map((_, i) =>
      Math.round(r0 * (1 - 0.06 * (i / (centerline.length - 1))) * 100) / 100);
    let length = 0;
    for (let i = 1; i < centerline.length; i++) length += V.len(V.sub(centerline[i], centerline[i - 1]));
    nodes[sp.id] = {
      id: sp.id, label: sp.label, name: sp.name, level: sp.level,
      lobe: sp.lobe, zone: sp.zone,
      // nearest named ancestor at segment level (or the node itself above that)
      segment: sp.segmentId ?? sp.id,
      parent: sp.parent, children: [],
      centerline, radii, length: Math.round(length * 100) / 100,
      desc: sp.desc,
    };
    if (parent) parent.children.push(sp.id);
  }
  return {
    schema: SCHEMA,
    units: 'mm',
    coordinateSystem: 'x = patient left, y = superior, z = anterior; origin at carina',
    source: { type: 'procedural', seed, generations },
    rootId: 'TR',
    lobes: LOBE_INFO,
    nodes,
  };
}
