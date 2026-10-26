import * as THREE from 'three';
import { rod, std, gearGeometry, smoothstep } from './util.js';
import { makeChainTexture, makeWickerTexture } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Bike-local frame: +Z forward, +Y up, +X is the rider's left
export const BIKE = { R: 0.34, rear: V(0, 0.34, -0.56), front: V(0, 0.34, 0.6), bb: V(0, 0.29, -0.02), crank: 0.15, gear: 2.4 };
const H1 = V(0, 0.92, 0.41), H2 = V(0, 0.74, 0.47), S = V(0, 0.86, -0.2), SEAT = V(0, 0.97, -0.245);
const DRIVE_X = -0.075;

function fender(R, start, arc, mat) {
  const wrap = new THREE.Group();
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 6, 32, arc), mat);
  m.scale.z = 2.2;
  m.rotation.z = start;
  wrap.rotation.y = Math.PI / 2;
  m.castShadow = true;
  wrap.add(m);
  return wrap;
}

function buildWheel(mats) {
  const g = new THREE.Group(), R = BIKE.R;
  const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.024, 0.026, 12, 56), mats.rubber);
  const wall = new THREE.Mesh(new THREE.TorusGeometry(R - 0.042, 0.012, 6, 56), mats.cream);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.011, 6, 56), mats.chrome);
  for (const m of [tire, wall, rim]) { m.rotation.y = Math.PI / 2; m.castShadow = true; g.add(m); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 12).rotateZ(Math.PI / 2), mats.chrome);
  g.add(hub);
  const pts = [];
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2, side = k % 2 ? 0.035 : -0.035, lace = k % 4 < 2 ? 0.45 : -0.45;
    pts.push(side, Math.sin(a + lace) * 0.022, Math.cos(a + lace) * 0.022);
    pts.push(0, Math.sin(a) * (R - 0.055), Math.cos(a) * (R - 0.055));
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const spokeMat = new THREE.LineBasicMaterial({ color: 0xd9dde3, transparent: true });
  g.add(new THREE.LineSegments(sg, spokeMat));
  // Motion-blur disc fades in as the spokes become a blur
  const blur = new THREE.Mesh(
    new THREE.RingGeometry(0.03, R - 0.055, 32).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xc8ccd2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  g.add(blur);
  const refl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.025), mats.amber);
  refl.position.set(0, 0.2, 0);
  g.add(refl);
  return { g, spokeMat, blurMat: blur.material };
}

export function createBicycle() {
  const mats = {
    frame: std(0x22b3a6, { metalness: 0.5, roughness: 0.25 }),
    chrome: std(0xdfe3e8, { metalness: 1, roughness: 0.15 }),
    rubber: std(0x1c1c1f, { roughness: 0.9 }),
    cream: std(0xefe6d2, { roughness: 0.8 }),
    leather: std(0x7a4529, { roughness: 0.5 }),
    dark: std(0x2a2b30, { metalness: 0.5, roughness: 0.45 }),
    gold: std(0xf0c040, { metalness: 1, roughness: 0.22 }),
    amber: std(0xff9a1f, { emissive: 0x4a2000, roughness: 0.3 }),
  };
  const bike = new THREE.Group();
  const { rear, front, bb } = BIKE;

  bike.add(
    rod(bb, S, 0.021, mats.frame),
    rod(S, V(0, 0.895, 0.415), 0.02, mats.frame),
    rod(bb, H2, 0.026, mats.frame),
    rod(H2, H1, 0.031, mats.frame),
    rod(S.clone().add(V(0, -0.02, 0)), SEAT, 0.013, mats.chrome)
  );
  for (const sx of [-0.055, 0.055]) {
    const r = V(sx, rear.y, rear.z);
    bike.add(rod(V(sx * 0.4, bb.y, bb.z), r, 0.012, mats.frame), rod(V(sx * 0.35, S.y, S.z), r, 0.011, mats.frame));
  }
  const bbShell = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12).rotateZ(Math.PI / 2), mats.frame);
  bbShell.position.copy(bb);
  bike.add(bbShell);

  const saddle = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mats.leather);
  saddle.scale.set(0.09, 0.032, 0.14);
  saddle.position.copy(SEAT).add(V(0, 0.025, 0.02));
  saddle.castShadow = true;
  bike.add(saddle);

  const rearW = buildWheel(mats), frontW = buildWheel(mats);
  rearW.g.position.copy(rear);
  bike.add(rearW.g);
  const rf = fender(BIKE.R + 0.05, -0.25, 2.3, mats.frame);
  rf.position.copy(rear);
  bike.add(rf);

  const cog = new THREE.Mesh(gearGeometry(0.045, 14, 0.008), mats.chrome);
  cog.position.x = DRIVE_X;
  rearW.g.add(cog);

  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 0.2 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), tailMat);
  tail.position.set(0, rear.y + 0.12, rear.z - 0.39);
  const tailLight = new THREE.PointLight(0xff2020, 0, 3, 2);
  tailLight.position.copy(tail.position).add(V(0, 0, -0.05));
  bike.add(tail, tailLight);

  // Crank set
  const crank = new THREE.Group();
  crank.position.copy(bb);
  bike.add(crank);
  const ring = new THREE.Mesh(gearGeometry(0.1, 32, 0.01), mats.chrome);
  ring.position.x = DRIVE_X;
  crank.add(ring);
  const pedals = [];
  for (const side of [1, -1]) {
    const dir = side === -1 ? -1 : 1;
    const armEnd = V(0.11 * side, BIKE.crank * dir, 0);
    crank.add(rod(V(0.06 * side, 0, 0), armEnd, 0.014, mats.chrome));
    const pedal = new THREE.Group();
    pedal.position.set(0.14 * side, BIKE.crank * dir, 0);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.09), mats.dark);
    plate.castShadow = true;
    const refl = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.01, 0.015), mats.amber);
    refl.position.z = -0.045;
    pedal.add(plate, refl);
    crank.add(pedal);
    pedals.push(pedal);
  }

  // Chain: closed loop around chainring and cog, links scroll with the crank
  const chainPts = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI / 2 - (i / 16) * Math.PI;
    chainPts.push(V(DRIVE_X, bb.y + Math.sin(a) * 0.1, bb.z + Math.cos(a) * 0.1));
  }
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 - (i / 10) * Math.PI;
    chainPts.push(V(DRIVE_X, rear.y + Math.sin(a) * 0.045, rear.z + Math.cos(a) * 0.045));
  }
  const chainCurve = new THREE.CatmullRomCurve3(chainPts, true);
  const chainTex = makeChainTexture();
  const chainLen = chainCurve.getLength();
  chainTex.repeat.set(chainLen / 0.025, 1);
  const chain = new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 160, 0.0065, 5, true), std(0xffffff, { map: chainTex, metalness: 0.8, roughness: 0.35 }));
  bike.add(chain);

  // Steering assembly rotates about the head-tube axis
  const fork = new THREE.Group();
  fork.position.copy(H2);
  bike.add(fork);
  const L = (v) => v.clone().sub(H2);
  for (const sx of [-0.05, 0.05]) fork.add(rod(L(V(sx * 0.8, H2.y - 0.02, H2.z)), L(V(sx, front.y, front.z)), 0.013, mats.chrome));
  frontW.g.position.copy(L(front));
  fork.add(frontW.g);
  const ff = fender(BIKE.R + 0.05, 1.2, 2.1, mats.frame);
  ff.position.copy(L(front));
  fork.add(ff);
  const stemTop = V(0, 1.0, 0.4), barC = V(0, 1.01, 0.43);
  fork.add(rod(L(H1), L(stemTop), 0.016, mats.chrome), rod(L(stemTop), L(barC), 0.014, mats.chrome));
  const grips = [];
  for (const side of [1, -1]) {
    const end = V(0.26 * side, 1.035, 0.37);
    fork.add(rod(L(barC), L(end), 0.012, mats.chrome));
    fork.add(rod(L(V(0.2 * side, 1.03, 0.385)), L(end.clone().add(V(0.02 * side, 0, -0.005))), 0.02, mats.rubber));
    grips.push(L(V(0.24 * side, 1.033, 0.375)));
  }
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.gold);
  bell.position.copy(L(V(0.13, 1.03, 0.41)));
  fork.add(bell);

  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.07, 16).rotateX(Math.PI / 2), mats.chrome);
  lamp.position.copy(L(V(0, 0.93, 0.5)));
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 0 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 16), lensMat);
  lens.position.copy(lamp.position).add(V(0, 0, 0.036));
  const head = new THREE.SpotLight(0xfff1cc, 0, 34, 0.42, 0.55, 1.4);
  head.position.copy(lens.position);
  head.target.position.copy(lens.position).add(V(0, -0.7, 6));
  fork.add(lamp, lens, head, head.target);

  // Wicker basket that fills up with caught fish
  const basket = new THREE.Group();
  basket.position.copy(L(V(0, 0.86, 0.66)));
  const wick = makeWickerTexture();
  wick.repeat.set(4, 1);
  const bmat = std(0xffffff, { map: wick, side: THREE.DoubleSide, roughness: 0.9 });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.17, 16, 1, true), bmat);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16).rotateX(-Math.PI / 2), bmat);
  floor.position.y = -0.085;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 24).rotateX(Math.PI / 2), mats.leather);
  lip.position.y = 0.085;
  shell.castShadow = true;
  basket.add(shell, floor, lip);
  fork.add(basket, rod(L(V(0, 0.8, 0.6)), L(V(0, 0.5, 0.6)), 0.008, mats.chrome));

  const axis = H1.clone().sub(H2).normalize();
  const state = { wheel: 0, crank: 0 };
  const basketFish = [];

  return {
    group: bike, fork, mats, state,
    update(dt, speed, steer, night, headOn, pedaling = true) {
      const w = speed / BIKE.R;
      state.wheel += w * dt;
      if (pedaling) state.crank += (w / BIKE.gear) * dt;
      rearW.g.rotation.x = frontW.g.rotation.x = state.wheel;
      crank.rotation.x = state.crank;
      for (const p of pedals) p.rotation.x = -state.crank;
      fork.quaternion.setFromAxisAngle(axis, steer);
      chainTex.offset.x = ((state.crank * 0.1) / chainLen) * chainTex.repeat.x;
      const blur = smoothstep(14, 40, w);
      for (const wh of [rearW, frontW]) { wh.blurMat.opacity = blur * 0.45; wh.spokeMat.opacity = 1 - blur * 0.8; }
      const lit = headOn ? 1 : 0;
      head.intensity = lit * 26;
      lensMat.emissiveIntensity = lit * 4;
      tailMat.emissiveIntensity = 0.2 + night * 2;
      tailLight.intensity = night * 0.25;
    },
    pedalLocal(i, out) {
      return out.copy(pedals[i].position).applyAxisAngle(V(1, 0, 0), state.crank).add(bb);
    },
    gripLocal(i, out) {
      return out.copy(grips[i]).applyQuaternion(fork.quaternion).add(H2);
    },
    addBasketFish(mesh) {
      if (basketFish.length >= 7) return false;
      const k = basketFish.length;
      mesh.position.set(Math.cos(k * 2.4) * 0.07, -0.02 + Math.floor(k / 3) * 0.04, Math.sin(k * 2.4) * 0.07);
      mesh.rotation.set(0.3 * (k % 2 ? 1 : -1), k * 0.9, 1.2);
      mesh.scale.setScalar(0.5);
      basket.add(mesh);
      basketFish.push(mesh);
      return true;
    },
  };
}
