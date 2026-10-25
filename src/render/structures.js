// Schematic mediastinal structures for the 3D map (same frame as the airway tree).
// Purely illustrative: they give the lymph node stations their anatomic landmarks.
import * as THREE from 'three';
import { HEART, VESSELS } from '../anatomy/mediastinum.js';

const V = (a) => new THREE.Vector3(...a);

function tube(points, radius, color, opacity = 0.7) {
  const curve = new THREE.CatmullRomCurve3(points.map(V));
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.45, metalness: 0, transparent: true, opacity, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 14, false), mat);
  m.renderOrder = 1;
  return m;
}

export function buildStructures() {
  const g = new THREE.Group();

  // heart: anterior-inferior-left
  const heartMat = new THREE.MeshStandardMaterial({ color: 0xa83b3b, roughness: 0.5, transparent: true, opacity: 0.3, depthWrite: false });
  const heart = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), heartMat);
  heart.scale.set(...HEART.scale);
  heart.position.set(...HEART.center);
  heart.rotation.z = HEART.rotZ;
  heart.renderOrder = 1;
  g.add(heart);

  const opacity = { artery: 0.5, vein: 0.5, esophagus: 0.45 };
  for (const v of VESSELS) g.add(tube(v.pts, v.r, v.color, v.id === 'azygos' ? 0.55 : opacity[v.kind]));
  return g;
}
