// Left pane: first-person bronchoscope view (raymarched, see scopeShader.js).
import * as THREE from 'three';
import { K, vertexShader, fragmentShader } from './scopeShader.js';

const FAR = 1e5;

export class ScopeView {
  constructor(container, tree) {
    this.tree = tree;
    this.container = container;
    this.nSeg = tree.segData.length / 12;
    this.dist = new Float32Array(this.nSeg);
    this.order = Array.from({ length: this.nSeg }, (_, i) => i);
    this.lastSel = [Infinity, 0, 0];

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.maxScale = Math.min(window.devicePixelRatio || 1, 1.25);
    this.scale = this.maxScale;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'scope-canvas';

    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uPos: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector3() },
      uUp: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3() },
      uFov: { value: (120 * Math.PI) / 180 }, uTime: { value: 0 }, uBreath: { value: 1 },
      uA: { value: new Float32Array(K * 4) }, uB: { value: new Float32Array(K * 4) }, uI: { value: new Float32Array(K * 4) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, depthTest: false });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.camera = new THREE.Camera();

    this.frames = 0; this.acc = 0;
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(w, h, false);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.uniforms.uRes.value.copy(s);
  }

  /** Keep the K segments nearest the camera (cheap CPU cull; shader cost ~ K). */
  _select(pos) {
    const [lx, ly, lz] = this.lastSel;
    if ((pos[0] - lx) ** 2 + (pos[1] - ly) ** 2 + (pos[2] - lz) ** 2 < 0.25) return;
    this.lastSel = [...pos];
    const d = this.tree.segData;
    for (let i = 0; i < this.nSeg; i++) {
      const o = i * 12;
      const ax = d[o], ay = d[o + 1], az = d[o + 2];
      const bx = d[o + 4] - ax, by = d[o + 5] - ay, bz = d[o + 6] - az;
      const px = pos[0] - ax, py = pos[1] - ay, pz = pos[2] - az;
      const h = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz || 1)));
      const qx = px - bx * h, qy = py - by * h, qz = pz - bz * h;
      // small airways count as farther away, so the long view down big lumens isn't culled
      const w = 1 + (1 - d[o + 10]) * 1.5;
      this.dist[i] = (qx * qx + qy * qy + qz * qz) * w * w;
    }
    this.order.sort((i, j) => this.dist[i] - this.dist[j]);
    const { uA, uB, uI } = this.uniforms;
    for (let k = 0; k < K; k++) {
      const i = k < this.nSeg ? this.order[k] : -1;
      if (i < 0) { uA.value.fill(FAR, k * 4, k * 4 + 3); uB.value.fill(FAR, k * 4, k * 4 + 3); continue; }
      const o = i * 12;
      uA.value.set(d.subarray(o, o + 4), k * 4);
      uB.value.set(d.subarray(o + 4, o + 8), k * 4);
      uI.value.set(d.subarray(o + 8, o + 12), k * 4);
    }
    uA.value.needsUpdate = uB.value.needsUpdate = uI.value.needsUpdate = true;
  }

  /** pose: {pos,f,up,right} from Scope.pose; time in seconds; dt in seconds. */
  render(pose, time, dt) {
    this._select(pose.pos);
    const u = this.uniforms;
    u.uPos.value.set(...pose.pos); u.uFwd.value.set(...pose.f);
    u.uUp.value.set(...pose.up); u.uRight.value.set(...pose.right);
    u.uTime.value = time;
    u.uBreath.value = 1 + 0.012 * Math.sin(time * 1.3);
    this.renderer.render(this.scene, this.camera);
    this._adapt(dt);
  }

  /** Adaptive resolution: trade sharpness for frame rate on slower laptops. */
  _adapt(dt) {
    this.acc += dt; this.frames++;
    if (this.frames < 40) return;
    const avg = this.acc / this.frames;
    this.frames = 0; this.acc = 0;
    const next = avg > 0.026 ? this.scale * 0.8 : avg < 0.015 ? this.scale * 1.15 : this.scale;
    const clamped = Math.min(this.maxScale, Math.max(0.3, next));
    if (Math.abs(clamped - this.scale) > 0.02) { this.scale = clamped; this.resize(); }
  }
}
