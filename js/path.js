import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { lerp, smoothstep } from './util.js';

export const ROAD_HALF = 1.75;
const UP = new THREE.Vector3(0, 1, 0);

// Closed scenic loop around the island
export function createPath() {
  const pts = [];
  const N = 56;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const R = 72 + 16 * Math.sin(2 * t + 0.3) + 9 * Math.cos(3 * t + 1.1);
    const y = 4.4 + 2.2 * Math.sin(2 * t + 0.8) + 1.0 * Math.sin(5 * t);
    pts.push(new THREE.Vector3(R * Math.cos(t), y, R * Math.sin(t)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const length = curve.getLength();

  const S = 1400;
  const px = new Float32Array(S), py = new Float32Array(S), pz = new Float32Array(S);
  const tmp = new THREE.Vector3();
  const CELL = 8, grid = new Map();
  for (let i = 0; i < S; i++) {
    curve.getPointAt(i / S, tmp);
    px[i] = tmp.x; py[i] = tmp.y; pz[i] = tmp.z;
    const key = `${Math.floor(tmp.x / CELL)},${Math.floor(tmp.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }

  const near = { d: 0, y: 0, i: 0 };
  function nearest(x, z, maxD) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), rr = Math.ceil(maxD / CELL);
    let best = maxD * maxD, bi = -1;
    for (let a = -rr; a <= rr; a++)
      for (let b = -rr; b <= rr; b++) {
        const list = grid.get(`${cx + a},${cz + b}`);
        if (!list) continue;
        for (const i of list) {
          const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
          if (d < best) { best = d; bi = i; }
        }
      }
    if (bi < 0) return null;
    near.d = Math.sqrt(best); near.y = py[bi]; near.i = bi;
    return near;
  }

  const wrap = (s) => ((s % length) + length) % length;
  // Position, tangent and right-hand side vector at arc length s
  function frameAt(s, pos, tan, side) {
    const u = wrap(s) / length;
    curve.getPointAt(u, pos);
    curve.getTangentAt(u, tan);
    if (side) side.crossVectors(tan, UP).normalize();
  }

  const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _sd = new THREE.Vector3();
  // Signed curvature, positive when the road bends right
  function curvatureAt(s) {
    curve.getTangentAt(wrap(s - 1) / length, _t1);
    curve.getTangentAt(wrap(s + 1) / length, _t2);
    _sd.crossVectors(_t1, UP).normalize();
    return _t2.sub(_t1).dot(_sd) / 2;
  }

  return { curve, length, S, px, py, pz, nearest, frameAt, curvatureAt, wrap };
}

export function createHeightField(path) {
  const noise = new ImprovedNoise();
  const fbm = (x, z) =>
    noise.noise(x * 0.012, z * 0.012, 1.7) +
    noise.noise(x * 0.03, z * 0.03, 4.1) * 0.45 +
    noise.noise(x * 0.08, z * 0.08, 9.3) * 0.15;

  function raw(x, z) {
    const r = Math.hypot(x, z), n = fbm(x, z);
    const coast = 128 + n * 24 + 9 * Math.sin(Math.atan2(z, x) * 3);
    const land = smoothstep(coast + 12, coast - 16, r);
    const hills = 3 + (n + 0.6) * 9 + 30 * Math.exp(-(r * r) / (2 * 26 * 26));
    return lerp(-7, hills, land);
  }

  function height(x, z) {
    const h = raw(x, z);
    const n = path.nearest(x, z, 12);
    if (!n) return h;
    const w = smoothstep(ROAD_HALF + 0.5, 11, n.d);
    return lerp(n.y - 0.12, h, w);
  }
  return { height, raw, noise };
}
