// 3D orientation compass: the patient's A/P, R/L, S/I axes as seen from the scope, projected in 2D on a
// canvas at the screen's native pixel ratio, so the letters stay sharp whatever the scope view's
// (adaptive) render resolution is. Same projection as a perspective camera looking along the scope.
const AXES = [ // [direction (x=left, y=up, z=anterior), letter, colour]
  [[0, 0, 1], 'A', '#36e2b4'], [[0, 0, -1], 'P', '#36e2b4'],
  [[-1, 0, 0], 'R', '#ffb02e'], [[1, 0, 0], 'L', '#ffb02e'],
  [[0, 1, 0], 'S', '#6aa8ff'], [[0, -1, 0], 'I', '#6aa8ff'],
];
const D = 5.2; // virtual camera distance behind the origin

export class Compass {
  constructor(pane) {
    this.pane = pane;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'compass3d';
    this.canvas.setAttribute('aria-hidden', 'true');
    pane.append(this.canvas);
    this.size = 0;
    new ResizeObserver(() => this.resize()).observe(pane);
    this.resize();
  }

  resize() {
    const m = Math.min(this.pane.clientWidth, this.pane.clientHeight);
    if (!m) return;
    const s = Math.round(m * 0.26), g = Math.round(m * 0.035), dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.size = s;
    Object.assign(this.canvas.style, { width: `${s}px`, height: `${s}px`, right: `${g}px`, bottom: `${g}px` });
    this.canvas.width = Math.round(s * dpr); this.canvas.height = Math.round(s * dpr);
    this.dpr = dpr;
  }

  /** pose: {f, up, right} unit vectors in patient coordinates. */
  draw(pose) {
    const s = this.size;
    if (!s) return;
    const g = this.canvas.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, s, s);
    const c = s / 2, K = 0.4 * s * (D - 1);
    g.fillStyle = 'rgba(7,11,16,0.72)'; g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(54,226,180,0.5)'; g.lineWidth = 1; g.stroke();

    const pts = AXES.map(([d, ch, col]) => {
      const x = d[0] * pose.right[0] + d[1] * pose.right[1] + d[2] * pose.right[2];
      const y = d[0] * pose.up[0] + d[1] * pose.up[1] + d[2] * pose.up[2];
      const a = d[0] * pose.f[0] + d[1] * pose.f[1] + d[2] * pose.f[2]; // + = ahead of the scope (farther)
      const z = D + a;
      return { ch, col, px: c + (x / z) * K, py: c - (y / z) * K, z, a };
    }).sort((p, q) => q.z - p.z); // far first

    g.lineCap = 'round';
    for (const p of pts) {                                  // far ends first, near ends on top
      g.globalAlpha = 0.5 + 0.35 * (-p.a + 1) / 2;
      g.strokeStyle = p.col; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(c, c); g.lineTo(c + (p.px - c) * 0.8, c + (p.py - c) * 0.8); g.stroke();
      const r = 0.1 * s * (D / p.z);
      g.globalAlpha = 0.6 + 0.4 * (-p.a + 1) / 2;
      g.fillStyle = p.col; g.beginPath(); g.arc(p.px, p.py, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#04130e'; g.font = `700 ${Math.round(r * 1.35)}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.ch, p.px, p.py + 0.5);
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#ffffffcc'; g.lineWidth = 1.2;           // "looking down the scope" reticle
    g.beginPath(); g.arc(c, c, 0.035 * s, 0, Math.PI * 2); g.stroke();
  }
}
