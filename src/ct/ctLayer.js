// CT-derived airway overlay for the 3D map: GLB lumen surface + labelled centerlines, already
// registered to the procedural skeleton's frame by tools/ct (landmark registration).
// Data: AeroPath (CC BY 4.0, SINTEF / St. Olavs Hospital), see public/ct/ATTRIBUTION.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const base = (p) => `${import.meta.env.BASE_URL}${p}`;

/** @returns {Promise<CtLayer|null>} null if the CT assets are not present (the app still works). */
export async function loadCtLayer(overview) {
  try {
    const [gltf, treeRes] = await Promise.all([
      new GLTFLoader().loadAsync(base('ct/airway_ct.glb')),
      fetch(base('ct/airway_ct_centerline.json')),
    ]);
    if (!treeRes.ok) throw new Error('centerline json missing');
    return new CtLayer(overview, gltf.scene, await treeRes.json());
  } catch (e) {
    console.warn('CT overlay unavailable:', e.message);
    return null;
  }
}

export class CtLayer {
  constructor(overview, meshRoot, tree) {
    this.overview = overview;
    this.tree = tree;
    this.group = new THREE.Group();
    this.fade = 0;

    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0x8fc4ff, roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    meshRoot.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals(); o.material = this.mat; o.renderOrder = 4; } });
    this.group.add(meshRoot);

    // centerlines coloured by lobe, with a label at the start of each labelled segment/lobar branch
    this.lines = new THREE.Group();
    const zoneCol = (z) => new THREE.Color(tree.lobes[z]?.color ?? '#ffffff');
    this.labels = [];
    // one label per named airway: the widest CT branch carrying that label
    const best = {};
    for (const nd of Object.values(tree.nodes)) {
      if (nd.label.includes('·') || !['segment', 'lobar', 'main'].includes(nd.level)) continue;
      if (!best[nd.label] || nd.radii[0] > best[nd.label].radii[0]) best[nd.label] = nd;
    }
    for (const nd of Object.values(tree.nodes)) {
      const geo = new THREE.BufferGeometry().setFromPoints(nd.centerline.map((p) => new THREE.Vector3(...p)));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: zoneCol(nd.zone), depthTest: false, transparent: true, opacity: 0.95 }));
      line.renderOrder = 8;
      this.lines.add(line);
    }
    for (const nd of Object.values(best)) {
      this.labels.push(overview.addLabel(nd.label, nd.centerline[Math.floor(nd.centerline.length / 2)], 'lbl-ct'));
    }
    this.lines.visible = false;
    this.group.add(this.lines);
    this.group.visible = false;
    overview.scene.add(this.group);
    overview.ct = this;
  }

  /** 0 = procedural model only, 1 = CT mesh only. */
  setFade(t) {
    this.fade = t;
    this.group.visible = t > 0.001 || this.lines.visible;
    this.mat.opacity = Math.min(0.92, t * 1.0);
    this.overview.setAirwayOpacity(1 - 0.92 * t);
  }

  setCenterlines(on) {
    this.lines.visible = on;
    for (const l of this.labels) l.el.dataset.ct = on ? '1' : '0';
    this.group.visible = this.fade > 0.001 || on;
  }
}
