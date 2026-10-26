import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_HALF } from './path.js';
import { rng, std } from './util.js';
import { makeStripeTexture } from './textures.js';

const shared = { time: { value: 0 }, wind: { value: 1 } };
export const propUniforms = shared;

function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Sway vertices by height; works for any instanced, vertex-colored plant
function windMaterial(opts, strength) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uWind = shared.wind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      float ph = ip.x * 0.37 + ip.z * 0.21;
      float h = max(position.y, 0.0);
      float sway = (sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 3.1 + ph * 1.7) * 0.25) * uWind;
      transformed.x += sway * ${strength.toFixed(4)} * h * h;
      transformed.z += sway * ${(strength * 0.6).toFixed(4)} * h * h;`
    );
  };
  return m;
}

function palmGeometry() {
  const parts = [];
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const g = new THREE.CylinderGeometry(0.17 - i * 0.012, 0.2 - i * 0.012, 0.95, 7);
    const bend = (i / segs) ** 2 * 1.4;
    g.rotateZ(-0.05 * i);
    g.translate(bend, 0.48 + i * 0.92, 0);
    parts.push(paint(g, i % 2 ? 0x8b6b45 : 0x7a5c39));
  }
  const top = new THREE.Vector3(1.4, 6.6, 0);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.PlaneGeometry(0.9, 3.4, 1, 6);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) + 1.7;
      p.setXYZ(k, p.getX(k) * Math.sin((y / 3.4) * Math.PI) * 0.9, -0.12 * y * y + 0.35 * y, y);
    }
    g.rotateY((i / 9) * Math.PI * 2 + 0.3);
    g.translate(top.x, top.y, top.z);
    parts.push(paint(g.toNonIndexed(), i % 2 ? 0x3f8f3a : 0x56a845));
  }
  for (let i = 0; i < 3; i++) {
    const g = new THREE.SphereGeometry(0.18, 7, 6);
    g.translate(top.x + Math.cos(i * 2.1) * 0.22, top.y - 0.2, Math.sin(i * 2.1) * 0.22);
    parts.push(paint(g, 0x5b3d22));
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  merged.computeVertexNormals();
  return merged;
}

function bladeGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [-0.05, 0, 0, 0.05, 0, 0, -0.03, 0.35, 0.02, 0.03, 0.35, 0.02, 0, 0.62, 0.06];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  const c = [];
  for (let i = 0; i < 5; i++) {
    const t = v[i * 3 + 1] / 0.62;
    c.push(0.18 + t * 0.35, 0.38 + t * 0.35, 0.12 + t * 0.08);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

function flowerGeometry() {
  const stem = paint(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4).translate(0, 0.2, 0), 0x3d7a2c);
  const parts = [stem];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.SphereGeometry(0.05, 5, 4).scale(1, 0.35, 1);
    p.translate(Math.cos((i / 5) * 6.283) * 0.055, 0.41, Math.sin((i / 5) * 6.283) * 0.055);
    parts.push(paint(p, 0xffffff));
  }
  parts.push(paint(new THREE.SphereGeometry(0.035, 6, 5).translate(0, 0.42, 0), 0xffd23f));
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

// Scatter instances on the terrain, avoiding the road and the shoreline
function scatter(field, path, count, seed, test, place, nearRoad = 0) {
  const r = rng(seed), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const e = new THREE.Euler(), out = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 40) {
    let x, z;
    if (nearRoad) {
      // Sample relative to the road so verge plants are cheap to place
      const i = (r() * path.S) | 0, j = (i + 1) % path.S;
      const tx = path.px[j] - path.px[i], tz = path.pz[j] - path.pz[i], tl = Math.hypot(tx, tz) || 1;
      const off = (ROAD_HALF + 0.3 + r() ** 1.6 * nearRoad) * (r() < 0.5 ? -1 : 1);
      x = path.px[i] - (tz / tl) * off; z = path.pz[i] + (tx / tl) * off;
    } else {
      x = (r() * 2 - 1) * 160; z = (r() * 2 - 1) * 160;
    }
    const h = field.height(x, z);
    const n = path.nearest(x, z, 30);
    const d = n ? n.d : 99;
    if (!test(h, d, x, z, r)) continue;
    const sc = place(r);
    e.set(0, r() * Math.PI * 2, 0);
    q.setFromEuler(e);
    s.setScalar(sc);
    m.compose(new THREE.Vector3(x, h - 0.05, z), q, s);
    out.push(m.clone());
  }
  return out;
}

function instanced(geo, mat, matrices, shadow = true) {
  const im = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = shadow;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

export function buildVegetation(field, path, quality) {
  const group = new THREE.Group();
  const palms = scatter(field, path, 90, 21, (h, d) => h > 1.0 && h < 9 && d > 5, (r) => 0.8 + r() * 0.5);
  group.add(instanced(palmGeometry(), windMaterial({ side: THREE.DoubleSide }, 0.004), palms));

  const pines = [];
  const coneGeo = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6).translate(0, 0.6, 0), 0x6b4a2b),
    paint(new THREE.ConeGeometry(1.4, 2.4, 7).translate(0, 2.0, 0), 0x2f6b34),
    paint(new THREE.ConeGeometry(1.1, 2.0, 7).translate(0, 3.0, 0), 0x3a7d3b),
    paint(new THREE.ConeGeometry(0.75, 1.6, 7).translate(0, 3.9, 0), 0x46903f),
  ].map((g) => g.toNonIndexed()));
  pines.push(...scatter(field, path, 110, 33, (h, d) => h > 9 && h < 26 && d > 6, (r) => 0.7 + r() * 0.7));
  group.add(instanced(coneGeo, windMaterial({ flatShading: true }, 0.003), pines));

  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp = rockGeo.attributes.position, rr = rng(9);
  for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * (0.8 + rr() * 0.4), rp.getY(i) * (0.6 + rr() * 0.3), rp.getZ(i) * (0.8 + rr() * 0.4));
  rockGeo.computeVertexNormals();
  const rocks = scatter(field, path, 70, 44, (h, d) => h > -1.5 && d > 4.5, (r) => 0.3 + r() ** 2 * 1.6);
  group.add(instanced(rockGeo, new THREE.MeshStandardMaterial({ color: 0x8a867c, flatShading: true, roughness: 1 }), rocks));

  const grassCount = Math.round(26000 * quality);
  const blades = scatter(field, path, grassCount, 55, (h, d) => h > 2.2 && h < 24 && d > ROAD_HALF + 0.3, (r) => 0.6 + r() * 0.9, 26);
  group.add(instanced(bladeGeometry(), windMaterial({ side: THREE.DoubleSide }, 0.35), blades, false));

  const flowers = scatter(field, path, Math.round(1600 * quality), 66, (h, d) => h > 2.4 && h < 20 && d > ROAD_HALF + 0.4, (r) => 0.7 + r() * 0.6, 14);
  const fl = instanced(flowerGeometry(), windMaterial({}, 0.4), flowers, false);
  const fc = new THREE.Color(), pal = [0xff6b9a, 0xffffff, 0xffd166, 0xb388ff, 0xff8c42];
  const fr = rng(4);
  for (let i = 0; i < flowers.length; i++) fl.setColorAt(i, fc.setHex(pal[(fr() * pal.length) | 0]));
  group.add(fl);
  return group;
}

// Street lamps along the road; their bulbs are glow-only and bloom at night
export function buildLamps(path) {
  const group = new THREE.Group();
  const poleMat = std(0x2d3138, { metalness: 0.7, roughness: 0.35 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffc46b, emissiveIntensity: 0 });
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  const poleG = new THREE.CylinderGeometry(0.06, 0.09, 4.2, 8).translate(0, 2.1, 0);
  const armG = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6).rotateZ(Math.PI / 2).translate(-0.5, 4.15, 0);
  const headG = new THREE.CylinderGeometry(0.12, 0.28, 0.22, 10).translate(-1.0, 4.05, 0);
  const bulbG = new THREE.SphereGeometry(0.14, 12, 8).translate(-1.0, 3.92, 0);
  const n = Math.floor(path.length / 22), poles = [], bulbs = [];
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * (path.length / n);
    path.frameAt(s, pos, tan, side);
    const k = i % 2 ? 1 : -1;
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(side.x * k, side.z * k) - Math.PI / 2);
    m.setPosition(pos.x + side.x * (ROAD_HALF + 0.8) * k, pos.y - 0.1, pos.z + side.z * (ROAD_HALF + 0.8) * k);
    poles.push(m);
  }
  const pg = mergeGeometries([poleG, armG, headG]);
  group.add(instanced(pg, poleMat, poles));
  group.add(instanced(bulbG, bulbMat, poles, false));
  return { group, bulbMat };
}

export function buildLighthouse(field) {
  const g = new THREE.Group();
  // Walk outward along a bearing until the land ends, then step back onto the cliff
  const a = 2.72;
  let R = 90;
  while (R < 170 && field.height(Math.cos(a) * R, Math.sin(a) * R) > 2.5) R += 1;
  const x = Math.cos(a) * (R - 7), z = Math.sin(a) * (R - 7);
  g.position.set(x, field.height(x, z) - 0.3, z);
  const stripes = makeStripeTexture('#f5f2ea', '#d6303a', 8);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 16, 24, 1), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }));
  tower.position.y = 8;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.4, 20), std(0x9a958a, { flatShading: true }));
  base.position.y = 0.7;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 20), std(0x2b2f36, { metalness: 0.6 }));
  deck.position.y = 16.1;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe08a, emissiveIntensity: 0.3, transparent: true, opacity: 0.9 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.6, 16), lampMat);
  lamp.position.y = 17.1;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 16), std(0xc4262f, { roughness: 0.4 }));
  roof.position.y = 18.7;
  [tower, base, deck, roof].forEach((m) => { m.castShadow = m.receiveShadow = true; });
  g.add(tower, base, deck, lamp, roof);

  const beamGeo = new THREE.ConeGeometry(4.5, 70, 32, 1, true).translate(0, -35, 0).rotateZ(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying float vX; void main(){ vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uOpacity; varying float vX; void main(){ float f = 1.0 - smoothstep(0.0, 70.0, vX); gl_FragColor = vec4(1.0,0.92,0.7, f*f*uOpacity); }',
  });
  const beam = new THREE.Group();
  for (const k of [0, Math.PI]) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.rotation.y = k;
    beam.add(b);
  }
  beam.position.y = 17.1;
  g.add(beam);
  return { group: g, beam, beamMat, lampMat };
}

export function buildBoats() {
  const boats = [];
  const group = new THREE.Group();
  const hullMat = std(0xf3efe6, { roughness: 0.5 }), sailMat = std(0xfffaf0, { side: THREE.DoubleSide, roughness: 0.9 });
  const trimMat = std(0x1f5fa8);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.2, 0); hullShape.quadraticCurveTo(-1.6, -0.9, 0, -0.95);
    hullShape.quadraticCurveTo(1.6, -0.9, 2.6, 0.2); hullShape.lineTo(-2.2, 0.2);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 1.4, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.2 }), hullMat);
    hull.geometry.translate(0, 0, -0.7);
    hull.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 1.75), trimMat);
    stripe.position.set(0.2, 0.05, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 6), std(0x8b6b45));
    mast.position.set(0.2, 3.1, 0);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0); sailShape.lineTo(0, 5.4); sailShape.quadraticCurveTo(1.4, 2.4, 2.4, 0); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape, 8), i % 2 ? sailMat : std(0xff7f50, { side: THREE.DoubleSide }));
    sail.position.set(0.3, 0.6, 0);
    sail.castShadow = true;
    b.add(hull, stripe, mast, sail);
    const ang = i * 1.6 + 0.4, R = 175 + i * 18;
    b.userData = { ang, R, speed: 0.012 + i * 0.003, phase: i * 1.3 };
    group.add(b);
    boats.push(b);
  }
  return { group, boats };
}

export function buildClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.95 });
  const r = rng(77), geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group();
    const puffs = 4 + ((r() * 5) | 0);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.Mesh(geo, mat);
      const s = 4 + r() * 6;
      m.scale.set(s, s * 0.7, s);
      m.position.set((k - puffs / 2) * 5 + r() * 3, r() * 3, r() * 5);
      c.add(m);
    }
    const a = r() * Math.PI * 2, R = 120 + r() * 260;
    c.position.set(Math.cos(a) * R, 55 + r() * 35, Math.sin(a) * R);
    c.userData.drift = 0.6 + r() * 0.8;
    group.add(c);
  }
  return { group, mat };
}

export function buildGulls() {
  const group = new THREE.Group();
  const mat = std(0xffffff, { side: THREE.DoubleSide });
  const tipMat = std(0x30343a, { side: THREE.DoubleSide });
  const gulls = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.8, 2.4), mat);
    const wings = [];
    for (const k of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45).rotateX(-Math.PI / 2).translate(0.7 * k, 0, 0), mat);
      const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.3).rotateX(-Math.PI / 2).translate(1.5 * k, 0, -0.06), tipMat);
      pivot.add(w, tip);
      g.add(pivot);
      wings.push({ pivot, k });
    }
    g.add(body);
    g.userData = { wings, R: 18 + Math.random() * 40, h: 18 + Math.random() * 18, speed: 0.15 + Math.random() * 0.15, phase: Math.random() * 6.28, cx: (Math.random() - 0.5) * 140, cz: (Math.random() - 0.5) * 140 };
    group.add(g);
    gulls.push(g);
  }
  return { group, gulls };
}

export function buildStars() {
  const n = 2500, p = new Float32Array(n * 3), r = rng(101);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const v = new THREE.Vector3(s * Math.cos(th), Math.abs(u) * 0.95 + 0.05, s * Math.sin(th)).normalize().multiplyScalar(900);
    v.toArray(p, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { points: pts, mat };
}

export function buildFireflies(path) {
  const n = 260, p = new Float32Array(n * 3), seed = new Float32Array(n), r = rng(202);
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    path.frameAt(r() * path.length, pos, tan, side);
    const off = (ROAD_HALF + 1 + r() * 8) * (r() < 0.5 ? -1 : 1);
    p.set([pos.x + side.x * off, pos.y + 0.4 + r() * 1.6, pos.z + side.z * off], i * 3);
    seed[i] = r() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: shared.time, uOpacity: { value: 0 }, uScale: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec3 p = position + vec3(sin(uTime*0.7+seed)*0.6, sin(uTime*1.3+seed*2.0)*0.3, cos(uTime*0.6+seed)*0.6);
      vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
      vA = 0.5 + 0.5*sin(uTime*3.0 + seed*7.0); gl_PointSize = uScale * 90.0 / -mv.z; }`,
    fragmentShader: `uniform float uOpacity; varying float vA;
      void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(1.0,0.95,0.45, a*a*vA*uOpacity); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { points: pts, mat };
}
