import * as THREE from 'three';

const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

export const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1);

export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Deterministic PRNG so the island looks the same on every visit
export function rng(seed = 1) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const std = (color, o = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

// Place a unit cylinder (height 1 along +Y) between points a and b
export function stick(mesh, a, b, r = 1) {
  _d.subVectors(b, a);
  const len = _d.length() || 1e-6;
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
  mesh.scale.set(r, len, r);
  return mesh;
}

export function rod(a, b, r, material, geo = UNIT_CYL) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return stick(m, a, b, r);
}

// Analytic two-bone IK: returns the middle joint, bending toward poleHint
export function solveTwoBone(root, target, l1, l2, poleHint, outJoint, outEnd) {
  _dir.subVectors(target, root);
  let dist = _dir.length();
  _dir.divideScalar(dist || 1);
  dist = clamp(dist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _pole.copy(poleHint).addScaledVector(_dir, -poleHint.dot(_dir)).normalize();
  outJoint.copy(root).addScaledVector(_dir, a).addScaledVector(_pole, h);
  if (outEnd) outEnd.copy(root).addScaledVector(_dir, dist);
  return outJoint;
}

// Orient an object so local +Y runs a→b and local +Z leans toward `hint`
export function orientBone(obj, a, b, hint) {
  _y.subVectors(b, a).normalize();
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  obj.position.copy(a);
  obj.quaternion.setFromRotationMatrix(_m);
}

// Tapered elliptical tube along +Z, used for beaks
export function beakGeometry(L, w0, w1, h0, h1, droop) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 14, 14);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) + 0.5;
    const w = lerp(w0, w1, t), h = lerp(h0, h1, t);
    p.setXYZ(i, p.getX(i) * w, p.getY(i) * h - droop * t * t, t * L);
  }
  g.computeVertexNormals();
  return g;
}

export function gearGeometry(r, teeth, depth) {
  const s = new THREE.Shape();
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.9;
    i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(rr, 0);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.6, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
