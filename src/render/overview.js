// Right pane: glassy colour-coded lungs, tapered airway tree, mediastinal landmarks,
// IASLC lymph node stations, live scope marker, trail, orbitable camera, DOM labels.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { STATIONS, NODE_SCALE } from '../anatomy/lymphNodes.js';
import { buildStructures } from './structures.js';

const MAX_TRAIL = 8000;
// Padding (mm) around each lobe's airways; roughly the thickness of lung beyond the last stubs.
const LOBE_PAD = { RUL: 17, RML: 15, RLL: 18, LUL: 17, LING: 14, LLL: 18 };
const ICO = (() => { // 12 icosahedron directions used to inflate sample points
  const t = (1 + Math.sqrt(5)) / 2;
  return [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((v) => new THREE.Vector3(...v).normalize());
})();

/** Taubin smoothing (shrink pass then inflate pass): rounds the hull without shrinking it. */
function smoothMesh(geo, iterations = 8) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const nbr = Array.from({ length: pos.count }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b);
  }
  const next = new Float32Array(pos.array.length);
  const pass = (lambda) => {
    for (let v = 0; v < pos.count; v++) {
      let x = 0, y = 0, z = 0;
      for (const n of nbr[v]) { x += pos.getX(n); y += pos.getY(n); z += pos.getZ(n); }
      const k = nbr[v].size || 1;
      next[3 * v] = pos.getX(v) + lambda * (x / k - pos.getX(v));
      next[3 * v + 1] = pos.getY(v) + lambda * (y / k - pos.getY(v));
      next[3 * v + 2] = pos.getZ(v) + lambda * (z / k - pos.getZ(v));
    }
    pos.array.set(next);
  };
  for (let it = 0; it < iterations; it++) { pass(0.5); pass(-0.53); }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Airway tube whose radius follows the node's per-point radii. */
function taperedTube(nd, sides = 12, scale = 1) {
  const n = nd.centerline.length;
  const pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = nd.centerline[i], U = nd.rt.U[i], T = nd.rt.T[i];
    const R = [T[1] * U[2] - T[2] * U[1], T[2] * U[0] - T[0] * U[2], T[0] * U[1] - T[1] * U[0]];
    const r = Math.max(0.9, nd.radii[i] * scale);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
      pos.push(p[0] + U[0] * c + R[0] * s, p[1] + U[1] * c + R[1] * s, p[2] + U[2] * c + R[2] * s);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k, b = i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Glassy lung material: low base opacity, opaque-ish fresnel rim. */
function lungMaterial(color) {
  const m = new THREE.MeshPhysicalMaterial({
    color, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide,
    roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3,
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
      outgoingLight += diffuseColor.rgb * rim * 0.7;
      diffuseColor.a = mix(diffuseColor.a, 0.8, rim);
      #include <opaque_fragment>`);
  };
  return m;
}

export class Overview {
  constructor(container, labelLayer, tree, { onStation } = {}) {
    this.tree = tree;
    this.container = container;
    this.labelLayer = labelLayer;
    this.onStation = onStation || (() => {});
    this.labelsOn = true;
    this.markerOn = true;
    this.nodesOn = true;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;   // cross-section plane
    this.clipPlane = new THREE.Plane();
    this.section = null;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 10, 3000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 1100;
    this.resetView();

    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x302028, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(120, 260, 340); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.7); rim.position.set(-200, -80, -260); this.scene.add(rim);

    this._buildLobes();
    this._buildAirways();
    this.structures = buildStructures();
    this.scene.add(this.structures);
    this._buildStations();
    this._buildMarker();
    this._buildTrail();
    this._buildLabels();

    this._bindPicking();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resetView() {
    this.controls.target.set(0, -25, 10);
    this.camera.position.set(0, -10, 560); // looking at the patient from the front
    this.controls.update();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _buildLobes() {
    this.lobeGroup = new THREE.Group();
    const pts = {};
    for (const nd of this.tree.list) {
      if (!nd.zone || nd.level === 'trachea') continue;
      (pts[nd.zone] ||= []).push(...nd.centerline.map((p) => new THREE.Vector3(...p)));
    }
    for (const [zone, list] of Object.entries(pts)) {
      const cloud = [];
      for (const p of list) for (const d of ICO) cloud.push(p.clone().addScaledVector(d, LOBE_PAD[zone]));
      const hull = new ConvexGeometry(cloud);
      hull.deleteAttribute('normal'); hull.deleteAttribute('uv'); // per-face attributes would stop vertices merging
      const geo = mergeVertices(hull, 1e-3);
      smoothMesh(geo);
      const mesh = new THREE.Mesh(geo, lungMaterial(this.tree.lobes[zone].color));
      mesh.renderOrder = 1;
      this.lobeGroup.add(mesh);
    }
    this.scene.add(this.lobeGroup);
  }

  _buildAirways() {
    const mk = (color, emissive = 0x000000) => new THREE.MeshPhysicalMaterial({ color, emissive, roughness: 0.4, clearcoat: 0.5, transparent: true });
    this.matBase = mk(0xf1e2d3);
    this.matCur = mk(0xffd23f, 0x6a5200);
    this.matTarget = mk(0x2ee6a6, 0x0b6b50);
    this.branchMesh = {};
    const group = new THREE.Group();
    for (const nd of this.tree.list) {
      const mesh = new THREE.Mesh(taperedTube(nd), this.matBase);
      mesh.renderOrder = 2;
      this.branchMesh[nd.id] = mesh;
      group.add(mesh);
    }
    this.airways = group;
    this.scene.add(group);
  }

  /** Fade the procedural airway tree (used by the CT overlay slider). */
  setAirwayOpacity(o) {
    for (const m of [this.matBase, this.matCur, this.matTarget]) { m.opacity = o; m.depthWrite = o > 0.95; }
  }

  /** Add a DOM label that follows a 3D point; returns {el, pos, cls}. */
  addLabel(text, pos, cls) {
    const el = document.createElement('div');
    el.className = `lbl ${cls}`;
    el.textContent = text;
    this.labelLayer.appendChild(el);
    const l = { el, pos: new THREE.Vector3(...pos), cls };
    this.labels.push(l);
    return l;
  }

  _buildStations() {
    this.stationGroup = new THREE.Group();
    this.stationMeshes = [];
    const base = new THREE.MeshStandardMaterial({ color: 0xb6e35a, roughness: 0.5, emissive: 0x2c4a08 });
    for (const st of STATIONS) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), base.clone());
      mesh.scale.set(st.r * NODE_SCALE[0], st.r * NODE_SCALE[1], st.r * NODE_SCALE[2]);
      mesh.position.set(...st.pos);
      mesh.renderOrder = 3;
      mesh.userData.station = st;
      this.stationMeshes.push(mesh);
      this.stationGroup.add(mesh);
    }
    this.scene.add(this.stationGroup);
  }

  _buildMarker() {
    // bright red tip dot: a camera-facing sprite (solid red, white outline, soft glow) drawn after
    // everything else, so translucent lobes and highlighted tubes never tint it
    this.marker = new THREE.Group();
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const glow = g.createRadialGradient(64, 64, 14, 64, 64, 64);
    glow.addColorStop(0, 'rgba(255,40,40,0.75)'); glow.addColorStop(1, 'rgba(255,40,40,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 128, 128);
    g.beginPath(); g.arc(64, 64, 22, 0, Math.PI * 2);
    g.fillStyle = '#ff1010'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke();
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false }));
    this.dot.scale.setScalar(34);
    this.dot.renderOrder = 20;
    this.halo = this.dot;   // pulsed in update()
    const coneGeo = new THREE.ConeGeometry(2.6, 11, 12);
    coneGeo.rotateX(Math.PI / 2); // cone tip toward +z of the group = viewing direction
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xff1010, depthTest: false }));
    cone.position.z = 12; cone.renderOrder = 19;
    this.marker.add(this.dot, cone);
    this.tipUser = true;
    this.marker.userData.noClip = true;
    this.scene.add(this.marker);

    // EBUS scan fan (hidden until the convex EBUS panel is open)
    this.fan = new THREE.Mesh(new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    this.fan.renderOrder = 9;
    this.fan.visible = false;
    this.fan.frustumCulled = false;
    this.fan.userData.noClip = true;
    this.scene.add(this.fan);
  }

  /** Show/hide the bright red tip dot (user toggle, independent of the quiz hiding it). */
  setTipVisible(on) { this.tipUser = on; this.marker.visible = this.markerOn && on; }

  /** Draw the convex-EBUS sector as a translucent fan at the scope tip (plane null hides it). */
  setEbusFan(plane, e) {
    this.fan.visible = !!plane;
    if (!plane) return;
    const pts = [plane.apex];
    for (let i = 0; i <= 12; i++) {
      const phi = -e.half + (2 * e.half * i) / 12;
      pts.push([0, 1, 2].map((k) => plane.apex[k] + (plane.u[k] * Math.cos(phi) + plane.f[k] * Math.sin(phi)) * e.depth));
    }
    const pos = [], idx = [];
    pts.forEach((p) => pos.push(...p));
    for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
    this.fan.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.fan.geometry.setIndex(idx);
    this.fan.geometry.computeBoundingSphere();
  }

  _buildTrail() {
    this.trailPts = new Float32Array(MAX_TRAIL * 3);
    this.trailN = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPts, 3));
    g.setDrawRange(0, 0);
    this.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff9f1c, depthTest: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 9;
    this.trail.userData.noClip = true;
    this.scene.add(this.trail);
  }

  _buildLabels() {
    this.labels = [];
    const add = (text, pos, cls) => {
      const el = document.createElement('div');
      el.className = `lbl ${cls}`;
      el.textContent = text;
      this.labelLayer.appendChild(el);
      this.labels.push({ el, pos: new THREE.Vector3(...pos), cls });
    };
    for (const nd of this.tree.list) {
      if (['segment', 'lobar', 'main'].includes(nd.level)) add(nd.label, nd.centerline.at(-1), `lbl-${nd.level}`);
    }
    for (const st of STATIONS) add(st.id, st.pos.map((v, i) => v + (i === 2 ? st.r + 2 : 0)), 'lbl-station');
  }

  /** Click a station to select it (drags are ignored). */
  _bindPicking() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = this.stationGroup.visible ? ray.intersectObjects(this.stationMeshes)[0] : null;
      this.selectStation(hit ? hit.object.userData.station.id : null);
    });
  }

  selectStation(id) {
    for (const m of this.stationMeshes) {
      const on = m.userData.station.id === id;
      m.material.color.set(on ? 0xffe14a : 0xb6e35a);
      m.material.emissive.set(on ? 0x7a6200 : 0x2c4a08);
    }
    this.onStation(STATIONS.find((s) => s.id === id) || null);
  }

  setNodesVisible(on) {
    this.stationGroup.visible = on;
    this.nodesOn = on;
    if (!on) this.selectStation(null);
  }
  setVesselsVisible(on) { this.structures.visible = on; }

  clearTrail() { this.trailN = 0; this.trail.geometry.setDrawRange(0, 0); }

  _addTrail(p) {
    const n = this.trailN;
    if (n > 0) {
      const dx = p[0] - this.trailPts[3 * n - 3], dy = p[1] - this.trailPts[3 * n - 2], dz = p[2] - this.trailPts[3 * n - 1];
      if (dx * dx + dy * dy + dz * dz < 2.25) return;
    }
    if (n >= MAX_TRAIL) return;
    this.trailPts.set(p, 3 * n);
    this.trailN++;
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailN);
  }

  /** Highlight helpers (ids may be null). */
  setCurrent(id) {
    if (this.curId && this.curId !== this.targetId) this.branchMesh[this.curId].material = this.matBase;
    this.curId = id;
    if (id && this.markerOn && id !== this.targetId) this.branchMesh[id].material = this.matCur;
  }
  setTarget(id) {
    if (this.targetId) this.branchMesh[this.targetId].material = this.matBase;
    this.targetId = id;
    if (id) this.branchMesh[id].material = this.matTarget;
  }
  /** Show/hide scope marker, trail and current-branch highlight (hidden during the quiz). */
  setMarkerVisible(on) {
    this.markerOn = on;
    this.marker.visible = on && this.tipUser;
    this.trail.visible = on;
    if (this.curId && this.curId !== this.targetId) this.branchMesh[this.curId].material = on ? this.matCur : this.matBase;
  }
  setLabelsVisible(on) {
    this.labelsOn = on;
    this.labelLayer.style.display = on ? '' : 'none';
  }

  // ── robotic case overlays ──────────────────────────────────────────────

  /** Show the CT-planned target (green) and, hidden until revealed, the true lesion (orange). */
  showCase(nodule) {
    this.clearCase();
    this.caseGroup = new THREE.Group();
    const ball = (r, color, opacity) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity, depthWrite: false }));
      m.renderOrder = 6;
      return m;
    };
    this.targetBall = ball(nodule.r, 0x2ee6a6, 0.4);
    this.targetBall.position.set(...nodule.displayed);
    this.trueBall = ball(nodule.r, 0xff8a3d, 0.55);
    this.trueBall.position.set(...nodule.center);
    this.trueBall.visible = false;
    // a see-through halo keeps the planned target visible even behind lung tissue
    const halo = new THREE.Mesh(new THREE.SphereGeometry(nodule.r * 1.9, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x2ee6a6, transparent: true, opacity: 0.16, depthTest: false, depthWrite: false }));
    halo.renderOrder = 7;
    this.targetBall.add(halo);
    this.caseGroup.add(this.targetBall, this.trueBall);
    this.scene.add(this.caseGroup);
  }
  moveTarget(p) { this.targetBall?.position.set(...p); }
  revealNodule(on) { if (this.trueBall) this.trueBall.visible = on; }

  /** Planned route as a dashed green polyline through the chosen airways. */
  setRoute(ids) {
    if (this.routeLine) { this.scene.remove(this.routeLine); this.routeLine.geometry.dispose(); this.routeLine = null; }
    if (!ids) return;
    const pts = [];
    for (const id of ids) for (const p of this.tree.nodes[id].centerline) pts.push(new THREE.Vector3(...p));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0x2ee6a6, dashSize: 4, gapSize: 3, depthTest: false }));
    line.computeLineDistances();
    line.renderOrder = 7;
    this.routeLine = line;
    this.scene.add(line);
  }

  /** Shape-sensed catheter: thick tube through the sensed points (null clears). */
  setCatheter(points) {
    if (this.cath) { this.scene.remove(this.cath); this.cath.geometry.dispose(); this.cath = null; }
    if (!points || points.length < 3) return;
    const stride = Math.max(1, Math.floor(points.length / 60));
    const sel = points.filter((_, i) => i % stride === 0 || i === points.length - 1).map((p) => new THREE.Vector3(...p));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sel), sel.length * 3, 1.5, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false }));
    mesh.renderOrder = 9;
    mesh.userData.noClip = true;
    this.cath = mesh;
    this.scene.add(mesh);
  }

  clearCase() {
    for (const k of ['caseGroup']) if (this[k]) { this.scene.remove(this[k]); this[k] = null; }
    this.targetBall = this.trueBall = null;
    this.setRoute(null);
    this.setCatheter(null);
  }

  // ── cross-section ──────────────────────────────────────────────────────

  /**
   * Cut the model with a plane. axis: 'y' axial, 'z' coronal, 'x' sagittal (null = off).
   * Keeps the side with coordinate <= pos (>= pos if flip). The scope dot, trail and catheter are never cut.
   */
  setSection(axis, pos = 0, flip = false) {
    this.section = axis ? { axis, pos, flip, follow: this.section?.follow ?? false } : null;
    for (const m of [this.matBase, this.matCur, this.matTarget]) { m.side = axis ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true; }
    this._applySection();
  }

  setSectionFollow(on) { if (this.section) this.section.follow = on; }

  /** Put the camera on the side the cut is meant to be viewed from. */
  viewSection(axis) {
    this.controls.target.set(0, -25, 10);
    // radiological conventions: axial seen from below (anterior up, patient left on the right), coronal from the front, sagittal from the left
    const p = { y: [0, -540, 40], z: [0, -10, 560], x: [560, -10, 0] }[axis] || [0, -10, 560];
    this.camera.position.set(...p);
    this.controls.update();
  }

  _applySection() {
    const sec = this.section;
    if (sec) {
      const i = 'xyz'.indexOf(sec.axis), n = [0, 0, 0];
      n[i] = sec.flip ? 1 : -1;
      this.clipPlane.normal.set(...n);
      this.clipPlane.constant = sec.flip ? -sec.pos : sec.pos;
      this._sectionQuad(sec, i);
    } else if (this.sectionQuad) this.sectionQuad.visible = false;
    this._clipObjects(sec ? [this.clipPlane] : null);
  }

  /** A faint plate showing where the cut is. */
  _sectionQuad(sec, i) {
    if (!this.sectionQuad) {
      const geo = new THREE.PlaneGeometry(380, 380);
      this.sectionQuad = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
      this.sectionQuad.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x6aa8ff })));
      this.sectionQuad.userData.noClip = true;
      this.scene.add(this.sectionQuad);
    }
    const q = this.sectionQuad;
    q.visible = true;
    q.rotation.set(sec.axis === 'y' ? -Math.PI / 2 : 0, sec.axis === 'x' ? Math.PI / 2 : 0, 0);
    q.position.set(0, -25, 10);
    q.position.setComponent(i, sec.pos);
  }

  _clipObjects(planes) {
    const visit = (o) => {
      if (o.userData?.noClip) return;
      for (const m of [].concat(o.material || [])) {
        if (m.userData.clipped !== !!planes) { m.clippingPlanes = planes; m.userData.clipped = !!planes; m.needsUpdate = true; }
      }
      o.children.forEach(visit);
    };
    visit(this.scene);
  }

  update(pose, nodeId) {
    if (this.section) {
      if (this.section.follow) {
        const pos = pose.pos['xyz'.indexOf(this.section.axis)];
        if (Math.abs(pos - this.section.pos) > 0.25) { this.section.pos = pos; this._applySection(); this.onSectionMove?.(pos); }
      }
      if ((this._clipTick = (this._clipTick || 0) + 1) % 45 === 0) this._clipObjects([this.clipPlane]); // objects created since the cut was set
    }
    if (this.markerOn) {
      this.dot.scale.setScalar(34 * (1 + 0.12 * Math.sin(performance.now() / 180)));
      this.marker.position.set(...pose.pos);
      this.marker.lookAt(this.marker.position.clone().add(new THREE.Vector3(...pose.f)));
      this._addTrail(pose.pos);
    }
    if (nodeId !== this.curId) this.setCurrent(nodeId);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.labelsOn) {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      const v = new THREE.Vector3();
      for (const l of this.labels) {
        v.copy(l.pos).project(this.camera);
        const vis = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && (l.cls !== 'lbl-station' || this.nodesOn) && (l.cls !== 'lbl-ct' || l.el.dataset.ct === '1');
        l.el.style.display = vis ? '' : 'none';
        if (vis) l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      }
    }
  }
}
