import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';

export function fishGeometry() {
  const body = new THREE.SphereGeometry(1, 16, 10).scale(0.06, 0.1, 0.2);
  const tail = new THREE.ConeGeometry(0.09, 0.14, 3).scale(0.25, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.24);
  const fin = new THREE.ConeGeometry(0.04, 0.09, 3).scale(0.2, 1, 1).translate(0, 0.11, -0.02);
  return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), fin.toNonIndexed()]);
}

export const fishMaterial = new THREE.MeshStandardMaterial({
  color: 0xffc23a, metalness: 0.85, roughness: 0.22, emissive: 0x7a4a00, emissiveIntensity: 0.6,
});

export function createFishField(scene, path) {
  const geo = fishGeometry();
  const r = rng(808);
  const N = 34;
  const list = [];
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const mesh = new THREE.Mesh(geo, fishMaterial);
    mesh.castShadow = true;
    scene.add(mesh);
    const s = 30 + (i / N) * (path.length - 40) + r() * 4;
    list.push({ mesh, s, lat: (r() * 2 - 1) * 1.05, state: 'idle', t: 0, from: new THREE.Vector3(), respawnAt: 0, phase: r() * 6 });
  }

  function place(f, time) {
    path.frameAt(f.s, pos, tan, side);
    f.mesh.position.copy(pos).addScaledVector(side, f.lat);
    f.mesh.position.y += 1.86 + Math.sin(time * 2.2 + f.phase) * 0.08;
    f.mesh.rotation.set(0, time * 2 + f.phase, Math.sin(time * 3 + f.phase) * 0.3);
  }

  const target = new THREE.Vector3();
  // dist: total distance ridden, used for respawn timing
  function update(dt, time, dist, beakTip, pouchWorld, onCatch) {
    for (const f of list) {
      if (f.state === 'idle') {
        place(f, time);
        if (f.mesh.position.distanceToSquared(beakTip) < 0.5 * 0.5) {
          f.state = 'fly';
          f.t = 0;
          f.from.copy(f.mesh.position);
          onCatch(f);
        }
      } else if (f.state === 'fly') {
        f.t += dt * 3.2;
        const e = Math.min(f.t, 1);
        pouchWorld(target);
        f.mesh.position.lerpVectors(f.from, target, e * e * (3 - 2 * e));
        f.mesh.position.y += Math.sin(e * Math.PI) * 0.25;
        f.mesh.scale.setScalar(1 - e * 0.85);
        f.mesh.rotation.x += dt * 12;
        if (f.t >= 1) {
          f.state = 'gone';
          f.mesh.visible = false;
          f.respawnAt = dist + path.length * 0.65;
        }
      } else if (dist > f.respawnAt) {
        f.state = 'idle';
        f.mesh.visible = true;
        f.mesh.scale.setScalar(1);
        f.lat = (Math.random() * 2 - 1) * 1.05;
      }
    }
  }

  // Next uncaught fish ahead within `range`, for the autopilot and the pelican's gaze
  function nextAhead(s, range) {
    let best = null, bd = range;
    for (const f of list) {
      if (f.state !== 'idle') continue;
      const d = path.wrap(f.s - s);
      if (d > 0.3 && d < bd) { bd = d; best = f; }
    }
    return best ? { fish: best, d: bd } : null;
  }

  return { list, update, nextAhead, geo };
}
