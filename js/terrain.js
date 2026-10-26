import * as THREE from 'three';
import { ROAD_HALF } from './path.js';
import { rng, smoothstep } from './util.js';
import { makeBannerTexture, makeCheckerTexture } from './textures.js';

const C = (h) => new THREE.Color(h);
const SAND_WET = C(0xbfa673), SAND = C(0xe8d49c), GRASS_A = C(0x86b94e), GRASS_B = C(0x4f8b36);
const ROCK = C(0x8e8a7d), SNOW = C(0xf4f4f1), SEABED = C(0x9c8657);

export function buildTerrain(field) {
  const SIZE = 340, SEG = 210;
  const base = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  base.rotateX(-Math.PI / 2);
  const bp = base.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setY(i, field.height(bp.getX(i), bp.getZ(i)));

  const geo = base.toNonIndexed();
  base.dispose();
  geo.computeVertexNormals();
  const p = geo.attributes.position, nrm = geo.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const col = new THREE.Color(), r = rng(5);
  for (let f = 0; f < p.count; f += 3) {
    const x = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const z = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const h = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const slope = nrm.getY(f);
    if (h < -0.8) col.copy(SEABED);
    else if (h < 0.5) col.copy(SAND_WET);
    else if (h < 1.7) col.copy(SAND);
    else {
      const n = field.noise.noise(x * 0.05, z * 0.05, 3.3) * 0.5 + 0.5;
      col.copy(GRASS_A).lerp(GRASS_B, n);
      if (h < 2.4) col.lerp(SAND, 0.5);
      col.lerp(ROCK, smoothstep(0.86, 0.7, slope));
      col.lerp(ROCK, smoothstep(22, 27, h));
      col.lerp(SNOW, smoothstep(31, 34, h));
    }
    col.offsetHSL(0, 0, (r() - 0.5) * 0.04);
    for (let k = 0; k < 3; k++) col.toArray(colors, (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function buildRoad(path, tex) {
  const { S, length } = path;
  const tiles = Math.round(length / 9);
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  const verts = [], uvs = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const s = (i / S) * length;
    path.frameAt(s, pos, tan, side);
    for (const k of [-1, 1]) {
      verts.push(pos.x + side.x * ROAD_HALF * k, pos.y + 0.03, pos.z + side.z * ROAD_HALF * k);
      uvs.push(k < 0 ? 0 : 1, (i / S) * tiles);
    }
    if (i < S) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    g.index.array.reverse();
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.02 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Start/finish gantry with a banner and a checkered line
export function buildArch(path) {
  const group = new THREE.Group();
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  path.frameAt(0, pos, tan, side);
  group.position.copy(pos);
  group.rotation.y = Math.atan2(tan.x, tan.z);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 });
  const W = ROAD_HALF + 0.7;
  for (const k of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.6, 12), poleMat);
    pole.position.set(W * k, 2.3, 0);
    pole.castShadow = true;
    group.add(pole);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(W * 2 + 0.4, 1.0, 0.08),
    new THREE.MeshStandardMaterial({ map: makeBannerTexture('鹈鹕环岛赛', 'PELICAN  ISLAND  TOUR'), roughness: 0.5 })
  );
  banner.position.y = 4.1;
  banner.castShadow = true;
  group.add(banner);

  const check = makeCheckerTexture();
  check.repeat.set(6, 1);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, 0.55),
    new THREE.MeshStandardMaterial({ map: check, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.045;
  line.receiveShadow = true;
  group.add(line);

  // Bunting flags between the poles
  const flagGeo = new THREE.ConeGeometry(0.12, 0.3, 3);
  flagGeo.rotateX(Math.PI);
  const hues = [0xff5a5f, 0xffc145, 0x2ec4b6, 0x5f6fff];
  for (let i = 0; i < 14; i++) {
    const t = i / 13, x = (t - 0.5) * 2 * W;
    const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: hues[i % 4], roughness: 0.6 }));
    f.position.set(x, 3.35 - Math.sin(t * Math.PI) * 0.35, 0);
    group.add(f);
  }
  return group;
}
