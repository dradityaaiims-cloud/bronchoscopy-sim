// Radial EBUS: what a 360-degree miniature probe at the catheter tip would show, from the true
// catheter-to-nodule geometry. `rebusScene` is pure (tested); drawRebus paints it to a canvas.
import * as V from '../anatomy/math.js';

export const REBUS_RANGE = 15; // mm radius of the displayed image

/**
 * The probe images the plane through the tip perpendicular to its axis `f`.
 * The (spherical) lesion cuts that plane in a disc: centre `c` (in-plane offset), radius `rEff`.
 */
export function rebusScene(tip, f, up, right, nodule) {
  const fwd = V.norm(f);
  const to = V.sub(nodule.center, tip);
  const h = V.dot(to, fwd);                          // how far the lesion centre is beyond the probe plane
  const rEff = nodule.r * nodule.r > h * h ? Math.sqrt(nodule.r * nodule.r - h * h) : 0;
  const cx = V.dot(to, right), cy = V.dot(to, up);   // in-plane offset, image coordinates (mm)
  const off = Math.hypot(cx, cy);
  let pattern = 'none';
  if (rEff > 0.5) {
    if (off < 0.45 * rEff) pattern = 'concentric';          // probe lies inside the lesion
    else if (off - rEff < REBUS_RANGE) pattern = 'eccentric'; // lesion to one side
  }
  const bearing = Math.atan2(cx, cy); // 0 = image up, positive clockwise
  const clock = Math.round(((bearing + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 12) || 12;
  return { pattern, cx, cy, rEff, off, bearing, clock, gap: Math.max(0, off - rEff) };
}

export const PATTERN_TEXT = {
  concentric: 'Concentric: the probe is inside the lesion.',
  eccentric: 'Eccentric: the lesion is beside the probe. The tool may be adjacent, not in.',
  none: 'No lesion seen: the probe is in aerated lung or the lesion is out of range.',
};

function hash(x, y, t) {
  let h = Math.imul(x * 374761393 + y * 668265263 + t * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Paint a radial-EBUS image: aerated lung = bright speckle, lesion = darker homogeneous tissue. */
export function drawRebus(canvas, scene, frame = 0) {
  const n = canvas.width, ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  const half = n / 2, mmPerPx = REBUS_RANGE / half;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const ux = (px - half) * mmPerPx, uy = (half - py) * mmPerPx;
      const rho = Math.hypot(ux, uy);
      const o = (py * n + px) * 4;
      if (rho > REBUS_RANGE) { img.data[o + 3] = 255; continue; }
      const noise = hash(px, py, frame);
      const inLesion = scene.rEff > 0 && Math.hypot(ux - scene.cx, uy - scene.cy) < scene.rEff;
      const edge = scene.rEff > 0 && Math.abs(Math.hypot(ux - scene.cx, uy - scene.cy) - scene.rEff) < 0.45;
      let v;
      if (rho < 1.1) v = 8;                                           // probe / catheter shadow
      else if (rho < 1.5) v = 200;                                    // airway wall echo ring
      else if (inLesion) v = 70 + noise * 40;                         // homogeneous, darker
      else v = 40 + Math.pow(noise, 1.4) * 215 * (1 - 0.35 * rho / REBUS_RANGE); // aerated-lung "snowstorm"
      if (edge) v = Math.max(v, 190);                                 // bright lesion boundary
      img.data[o] = v * 0.92; img.data[o + 1] = v * 0.95; img.data[o + 2] = v; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = '#36e2b455'; ctx.lineWidth = 1;
  for (const mm of [5, 10]) { ctx.beginPath(); ctx.arc(half, half, mm / mmPerPx, 0, Math.PI * 2); ctx.stroke(); }
}
