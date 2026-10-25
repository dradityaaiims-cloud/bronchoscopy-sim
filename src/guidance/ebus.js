// Convex-probe EBUS (CP-EBUS) simulation. The transducer sits at the scope tip and scans a sector in
// the plane spanned by the shaft (f) and the "up" side of the endoscopic image (u); roll the scope to
// scan elsewhere. Tissue classes come from the same schematic anatomy as the 3D map, so lymph nodes,
// vessels, esophagus and heart are where the map shows them. Teaching approximation, not a physics model.
import * as V from '../anatomy/math.js';
import { STATIONS, stationNorm } from '../anatomy/lymphNodes.js';
import { VESSELS, densify, heartNorm } from '../anatomy/mediastinum.js';

export const EBUS = { depth: 45, half: (30 * Math.PI) / 180 };

export function buildEbusScene(tree) {
  const vessels = VESSELS.map((v) => {
    const pts = densify(v.pts, 3);
    return { id: v.id, kind: v.kind, r: v.r, segs: pts.slice(1).map((b, i) => [pts[i], b]) };
  });
  return { tree, vessels };
}

/** distance from p to segment a-b, plus the interpolation parameter */
function segDist(p, a, b) {
  const ab = V.sub(b, a), t = V.clamp(V.dot(V.sub(p, a), ab) / (V.dot(ab, ab) || 1), 0, 1);
  return [V.len(V.sub(p, V.add(a, V.scale(ab, t)))), t];
}

/** The airway and vessel segments worth testing for a scan from `apex` (cheap spatial cull). */
export function nearStructures(scene, apex, reach = EBUS.depth + 15) {
  const d = scene.tree.segData, airways = [];
  for (let i = 0; i < d.length; i += 12) {
    const a = [d[i], d[i + 1], d[i + 2]], b = [d[i + 4], d[i + 5], d[i + 6]];
    const [dist, t] = segDist(apex, a, b);
    const r = d[i + 3] + (d[i + 7] - d[i + 3]) * t;
    if (dist - r < reach) airways.push({ a, b, ra: d[i + 3], rb: d[i + 7] });
  }
  const vessels = scene.vessels.map((v) => ({ ...v, segs: v.segs.filter(([a, b]) => segDist(apex, a, b)[0] - v.r < reach) })).filter((v) => v.segs.length);
  return { airways, vessels };
}

const hash = (x, y, t) => {
  let h = Math.imul(x * 374761393 + y * 668265263 + t * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * What lies at world point p. Returns {v: grey 0..255, tag, id}.
 * `n` is a noise value in [0,1) (speckle). Order matters: airway lumen, vessels, esophagus, nodes, heart, tissue.
 */
export function classify(near, p, n) {
  for (const s of near.airways) {
    const [d, t] = segDist(p, s.a, s.b), r = s.ra + (s.rb - s.ra) * t;
    if (d < r - 0.9) return { v: 14 + 12 * n, tag: 'airway' };          // water balloon / lumen: dark
    if (d < r + 0.9) return { v: 205, tag: 'wall' };                    // bright airway wall echo
  }
  for (const vs of near.vessels) {
    for (const [a, b] of vs.segs) {
      const [d] = segDist(p, a, b);
      if (d > vs.r + 0.8) continue;
      if (vs.kind === 'esophagus') return d > vs.r * 0.55 ? { v: 125 + 25 * n, tag: 'esophagus', id: vs.id } : { v: 70 + 30 * n, tag: 'esophagus', id: vs.id };
      return d > vs.r - 0.8 ? { v: 150, tag: 'vessel-wall', id: vs.id } : { v: 10 + 10 * n, tag: 'vessel', id: vs.id }; // anechoic blood
    }
  }
  for (const st of STATIONS) {
    const q = stationNorm(st, p);
    if (q < 1) return q > 0.9 ? { v: 170, tag: 'node', id: st.id } : { v: 92 + 38 * n, tag: 'node', id: st.id };  // hypoechoic with a capsule
  }
  const h = heartNorm(p);
  if (h < 1) return { v: h > 0.93 ? 130 : 26 + 14 * n, tag: 'heart' };
  return { v: 62 + 66 * n, tag: 'tissue' };                              // mediastinal fat / connective tissue speckle
}

/** Basis of the scan plane for a scope pose. */
export function scanPlane(pose) {
  const u = V.norm(pose.up), f = V.norm(pose.f);
  return { apex: V.add(pose.pos, V.scale(u, 1.5)), u, f };
}

/** Stations whose cross-section falls in the scan sector: [{st, depth, diam, a, b}] (a = along u, b = along f). */
export function visibleNodes(plane) {
  const side = V.cross(plane.u, plane.f), out = [];
  for (const st of STATIONS) {
    const n = V.sub(st.pos, plane.apex);
    const a = V.dot(n, plane.u), b = V.dot(n, plane.f), c = V.dot(n, side);
    if (Math.abs(c) >= st.r * 0.95 || a <= 0) continue;
    const rp = Math.sqrt(st.r * st.r - c * c), dist = Math.hypot(a, b);
    if (dist - rp > EBUS.depth || Math.abs(Math.atan2(b, a)) > EBUS.half + rp / dist) continue;
    out.push({ st, depth: dist, diam: 2 * rp, a, b });
  }
  return out.sort((x, y) => x.depth - y.depth);
}

/** Paint the sector into `canvas`. Returns the visible nodes (for captions and labels). */
export function drawEbus(canvas, scene, pose, { frame = 0, labels = true } = {}) {
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
  const plane = scanPlane(pose), near = nearStructures(scene, plane.apex);
  const img = ctx.createImageData(W, H), s = (H - 8) / EBUS.depth, top = 4;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const o = (py * W + px) * 4, x = (px - W / 2) / s, y = (py - top) / s, d = Math.hypot(x, y);
      img.data[o + 3] = 255;
      if (y < 0.4 || d > EBUS.depth || Math.abs(Math.atan2(x, y)) > EBUS.half) { img.data[o] = img.data[o + 1] = img.data[o + 2] = 5; continue; }
      const phi = Math.atan2(x, y);
      const p = V.add(plane.apex, V.scale(V.add(V.scale(plane.u, Math.cos(phi) * d), V.scale(plane.f, Math.sin(phi) * d)), 1));
      const c = classify(near, p, hash(px, py, frame));
      const v = V.clamp(c.v * (1 - 0.3 * (d / EBUS.depth)), 0, 255);
      img.data[o] = v * 0.96; img.data[o + 1] = v; img.data[o + 2] = v * 1.04;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = '#36e2b455'; ctx.fillStyle = '#36e2b4'; ctx.font = '10px ui-monospace, monospace'; ctx.lineWidth = 1;
  for (let mm = 10; mm <= 40; mm += 10) {
    ctx.beginPath(); ctx.arc(W / 2, top, mm * s, Math.PI / 2 - EBUS.half, Math.PI / 2 + EBUS.half); ctx.stroke();
    ctx.fillText(`${mm}`, W / 2 + mm * s * Math.sin(EBUS.half) + 2, top + mm * s * Math.cos(EBUS.half) + 3);
  }
  const vis = visibleNodes(plane);
  if (labels) {
    ctx.fillStyle = '#d6ff7e'; ctx.font = 'bold 11px ui-monospace, monospace';
    for (const v of vis) ctx.fillText(v.st.id, W / 2 + v.b * s - 8, top + v.a * s + 4);
  }
  ctx.fillStyle = '#8da0b6'; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('proximal', 4, H - 4); ctx.fillText('distal', W - 34, H - 4);
  return vis;
}
