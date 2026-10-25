// Simulated cone-beam CT: real (anonymised, resampled) CT slices with the synthetic nodule and the
// catheter inserted. Volume grid: public/ct/ct_volume.* (see tools/ct). Tool-in-lesion is judged
// from the true geometry and displayed as a measurement.
import * as V from '../anatomy/math.js';
import { stationNorm } from '../anatomy/lymphNodes.js';

export class CtVolume {
  constructor(meta, data) {
    this.meta = meta;
    [this.nx, this.ny, this.nz] = meta.dims;
    this.o = meta.origin;
    this.step = meta.step;
    this.data = data;
  }

  /** Trilinear sample in mm coordinates (0..255); air outside the grid. */
  at(x, y, z) {
    const fx = (x - this.o[0]) / this.step, fy = (y - this.o[1]) / this.step, fz = (z - this.o[2]) / this.step;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= this.nx - 1 || fy >= this.ny - 1 || fz >= this.nz - 1) return 0;
    const ix = fx | 0, iy = fy | 0, iz = fz | 0, tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const d = this.data, ny = this.ny, nz = this.nz;
    const g = (a, b, c) => d[((ix + a) * ny + (iy + b)) * nz + (iz + c)];
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(g(0, 0, 0), g(0, 0, 1), tz), l(g(0, 1, 0), g(0, 1, 1), tz), ty),
             l(l(g(1, 0, 0), g(1, 0, 1), tz), l(g(1, 1, 0), g(1, 1, 1), tz), ty), tx);
  }
}

export async function loadCtVolume() {
  const base = import.meta.env.BASE_URL;
  try {
    const [m, b] = await Promise.all([fetch(`${base}ct/ct_volume.json`), fetch(`${base}ct/ct_volume.bin`)]);
    if (!m.ok || !b.ok) return null;
    return new CtVolume(await m.json(), new Uint8Array(await b.arrayBuffer()));
  } catch { return null; }
}

/** Plane -> world mapping. u,v in [-0.5, 0.5] (right/up on screen) around centre c, field of view fov mm. */
export const PLANES = {
  axial: { fixed: 1, name: 'Axial', world: (c, u, v, fov, pos) => [c[0] + u * fov, pos, c[2] + v * fov] },       // x right, anterior up
  coronal: { fixed: 2, name: 'Coronal', world: (c, u, v, fov, pos) => [c[0] + u * fov, c[1] + v * fov, pos] },   // x right, superior up
  sagittal: { fixed: 0, name: 'Sagittal', world: (c, u, v, fov, pos) => [pos, c[1] + v * fov, c[2] - u * fov] }, // anterior left, superior up
};

/** Soft-tissue grey for the nodule (~HU 30 on the [-1000,400] window). */
const NODULE_GREY = 184;

/**
 * Draw one slice. opts: {center:[x,y,z] view centre, fov, nodule, shape: [pts], tip, fwd}
 * Returns nothing; draws into `canvas`.
 */
export function renderSlice(canvas, vol, planeId, pos, opts) {
  const P = PLANES[planeId], n = canvas.width, ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  const { center, fov, nodule } = opts;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const u = px / (n - 1) - 0.5, v = 0.5 - py / (n - 1);
      const w = P.world(center, u, v, fov, pos);
      let g = vol.at(w[0], w[1], w[2]);
      if (nodule) {
        const d = Math.hypot(w[0] - nodule.center[0], w[1] - nodule.center[1], w[2] - nodule.center[2]);
        if (d < nodule.r + 0.8) {
          const k = V.clamp((nodule.r + 0.8 - d) / 1.6, 0, 1);
          g = g + (NODULE_GREY + ((px * 7 + py * 13) % 9) - 4 - g) * k;
        }
      }
      let rgb = null;
      if (opts.stations) {   // lymph node stations: soft-tissue ovals with a green outline
        for (const st of opts.stations) {
          const q = stationNorm(st, w);
          if (q < 1) { if (q > 0.84) rgb = [110, 255, 170]; else g += (178 - g) * 0.85; break; }
        }
      }
      const o = (py * n + px) * 4;
      img.data[o] = rgb ? rgb[0] : g; img.data[o + 1] = rgb ? rgb[1] : g; img.data[o + 2] = rgb ? rgb[2] : g; img.data[o + 3] = 255;
    }
  }
  // catheter: bright wire wherever the shape passes within ~1.3 mm of this plane
  const px2 = (w) => {
    const u = planeId === 'sagittal' ? (center[2] - w[2]) / fov : (w[0] - center[0]) / fov;
    const v = planeId === 'axial' ? (w[2] - center[2]) / fov : (w[1] - center[1]) / fov;
    return [(u + 0.5) * (n - 1), (0.5 - v) * (n - 1)];
  };
  const fixed = P.fixed;
  for (const q of opts.shape || []) {
    if (Math.abs(q[fixed] - pos) > 1.3) continue;
    const [x, y] = px2(q);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = Math.round(x) + dx, Y = Math.round(y) + dy;
      if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const o = (Y * n + X) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (opts.tip && Math.abs(opts.tip[fixed] - pos) < 4) {
    const [x, y] = px2(opts.tip);
    ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
  }
  if (opts.stations && opts.labels !== false) {
    ctx.fillStyle = '#d6ff7e'; ctx.font = 'bold 11px ui-monospace, monospace';
    for (const st of opts.stations) {
      if (Math.abs(st.pos[fixed] - pos) > st.r) continue;
      const [x, y] = px2(st.pos);
      if (x > 0 && y > 0 && x < n && y < n) ctx.fillText(st.id, x - 6, y + 4);
    }
  }
  ctx.fillStyle = '#36e2b4'; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(P.name.toUpperCase(), 6, 14);
  // orientation letters: x runs left->right = patient right->left
  ctx.fillStyle = '#ffb02e'; ctx.font = 'bold 11px ui-monospace, monospace';
  const [lft, rgt, tp] = planeId === 'sagittal' ? ['A', 'P', 'S'] : planeId === 'axial' ? ['R', 'L', 'A'] : ['R', 'L', 'S'];
  ctx.fillText(lft, 4, n / 2 + 4); ctx.fillText(rgt, n - 12, n / 2 + 4); ctx.fillText(tp, n / 2 - 3, 12);
  ctx.fillText(`${planeId === 'sagittal' ? 'x' : planeId === 'axial' ? 'y' : 'z'} ${pos.toFixed(0)} mm`, 6, n - 6);
}

/** Verdict shown with the CBCT: is the catheter tip / working tool inside or beside the lesion? */
export function cbctAssessment(tip, nodule) {
  const edge = V.len(V.sub(nodule.center, tip)) - nodule.r;
  return { edge, inLesion: edge < 0, text: edge < 0 ? `Tool in lesion (${(-edge).toFixed(1)} mm inside the edge).` : `Tool adjacent: ${edge.toFixed(1)} mm from the lesion edge.` };
}
