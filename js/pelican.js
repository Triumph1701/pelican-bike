import * as THREE from 'three';
import { std, rod, stick, solveTwoBone, orientBone, beakGeometry, damp, UNIT_CYL } from './util.js';
import { makeFeatherTexture } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const L_THIGH = 0.46, L_SHIN = 0.46, L_ARM = 0.3, L_FORE = 0.33;
const THIGH_GEO = new THREE.CylinderGeometry(0.55, 1, 1, 12);
const FEATHER_GEO = new THREE.SphereGeometry(1, 10, 6);

function feather(mat, w, len, y, tilt) {
  const m = new THREE.Mesh(FEATHER_GEO, mat);
  m.scale.set(0.009, w, len / 2);
  m.position.set(0, y, len * 0.42);
  m.rotation.x = tilt;
  m.castShadow = true;
  return m;
}

function footGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.03);
  s.lineTo(-0.075, 0.1);
  s.quadraticCurveTo(-0.04, 0.075, 0, 0.125);
  s.quadraticCurveTo(0.04, 0.075, 0.075, 0.1);
  s.lineTo(0, -0.03);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.012, -0.03);
  return g;
}

export function createPelican(bike) {
  const fTex = makeFeatherTexture();
  fTex.repeat.set(3, 3);
  const M = {
    body: std(0xffffff, { map: fTex, bumpMap: fTex, bumpScale: 0.6, roughness: 0.85 }),
    wing: std(0xeceae4, { map: fTex, roughness: 0.85 }),
    primary: std(0x26272b, { roughness: 0.7 }),
    head: std(0xfaf0c8, { roughness: 0.8 }),
    beak: std(0xf4a63e, { roughness: 0.38 }),
    tip: std(0xd5512b, { roughness: 0.4 }),
    pouch: new THREE.MeshPhysicalMaterial({ color: 0xf08a52, roughness: 0.42, sheen: 0.6, sheenColor: 0xffc49a, clearcoat: 0.25 }),
    leg: std(0xe7944e, { roughness: 0.55 }),
    eye: std(0xffffff, { roughness: 0.2 }),
    iris: std(0xf7e27a, { roughness: 0.25 }),
    pupil: std(0x0d0d0f, { roughness: 0.1 }),
    skin: std(0xf2b6a0, { roughness: 0.6 }),
    cap: std(0xe63946, { roughness: 0.5 }),
    capW: std(0xffffff, { roughness: 0.5 }),
    scarf: std(0xd62828, { side: THREE.DoubleSide, roughness: 0.75 }),
  };
  const root = new THREE.Group();
  const upper = new THREE.Group();
  root.add(upper);
  const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), M.body));
  body.scale.set(0.26, 0.29, 0.44);
  body.position.set(0, 1.27, -0.12);
  body.rotation.x = -0.55;
  const chest = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), M.body));
  chest.scale.set(0.19, 0.22, 0.19);
  chest.position.set(0, 1.45, 0.09);
  upper.add(body, chest);
  for (let i = 0; i < 5; i++) {
    const t = shadowed(new THREE.Mesh(FEATHER_GEO, i % 2 ? M.wing : M.body));
    t.scale.set(0.05, 0.012, 0.17);
    t.position.set((i - 2) * 0.04, 1.1, -0.55);
    t.rotation.set(-0.35, (i - 2) * 0.22, 0);
    upper.add(t);
  }

  const neckCurve = new THREE.CatmullRomCurve3([V(0, 1.42, 0.1), V(0, 1.66, 0.06), V(0, 1.85, 0.12), V(0, 1.97, 0.23)]);
  upper.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 28, 0.074, 14), M.body)));
  const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 10, 24), M.scarf));
  ring.position.set(0, 1.56, 0.08);
  ring.rotation.x = Math.PI / 2 - 0.35;
  upper.add(ring);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.99, 0.25);
  upper.add(head);
  const skull = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), M.head));
  skull.scale.set(0.1, 0.11, 0.13);
  head.add(skull);
  for (let i = 0; i < 4; i++) {
    const c = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 6), M.head));
    c.position.set((i - 1.5) * 0.018, 0.06, -0.1);
    c.rotation.x = -1.9 + i * 0.08;
    head.add(c);
  }
  const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.cap));
  cap.scale.set(1, 0.75, 1.12);
  cap.position.set(0, 0.035, -0.012);
  const capStripe = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.006, 6, 32).rotateX(Math.PI / 2), M.capW);
  capStripe.scale.z = 1.12;
  capStripe.position.set(0, 0.04, -0.012);
  const visor = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), M.cap));
  visor.position.set(0, 0.04, 0.07);
  visor.rotation.x = -0.12;
  head.add(cap, capStripe, visor);

  const eyes = [];
  for (const sx of [1, -1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.07, 0.022, 0.055);
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.033, 12, 8), M.skin);
    patch.scale.set(0.5, 1, 1.2);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), M.eye);
    ball.position.x = sx * 0.008;
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), M.iris);
    iris.position.set(sx * 0.02, 0, 0.01);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), M.pupil);
    pupil.position.set(sx * 0.031, 0, 0.016);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(sx * 0.038, 0.005, 0.02);
    e.add(patch, ball, iris, pupil, glint);
    head.add(e);
    eyes.push(e);
  }

  // Beak: fixed upper mandible, hinged lower jaw carrying the pouch
  const upperBeak = shadowed(new THREE.Mesh(beakGeometry(0.6, 0.072, 0.03, 0.038, 0.016, 0.05), M.beak));
  upperBeak.position.set(0, -0.012, 0.08);
  const hook = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.055, 8), M.tip));
  hook.position.set(0, -0.068, 0.67);
  hook.rotation.x = Math.PI - 0.5;
  head.add(upperBeak, hook);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.04, 0.085);
  head.add(jaw);
  jaw.add(shadowed(new THREE.Mesh(beakGeometry(0.57, 0.066, 0.026, 0.016, 0.01, 0.045), M.beak)));
  // Sagging throat pouch: deepest near the throat, tapering toward the beak tip
  const pouchGeo = new THREE.SphereGeometry(1, 28, 18);
  const pp = pouchGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const z = pp.getZ(i), y = pp.getY(i);
    const sag = y < 0 ? 1 + 0.9 * (1 - (z + 1) / 2) : 1;
    pp.setY(i, y * sag);
  }
  pouchGeo.computeVertexNormals();
  const pouch = shadowed(new THREE.Mesh(pouchGeo, M.pouch));
  pouch.scale.set(0.058, 0.07, 0.25);
  pouch.position.set(0, -0.05, 0.25);
  pouch.rotation.x = 0.1;
  jaw.add(pouch);

  // Wings
  const wings = [];
  for (const sx of [1, -1]) {
    const upperBone = new THREE.Group(), foreBone = new THREE.Group();
    const ua = shadowed(new THREE.Mesh(FEATHER_GEO, M.wing));
    ua.scale.set(0.055, L_ARM / 2 + 0.03, 0.085);
    ua.position.set(0, L_ARM / 2, 0.03);
    upperBone.add(ua);
    for (let i = 0; i < 4; i++) upperBone.add(feather(M.wing, 0.045, 0.15, 0.05 + i * 0.07, 0.4));
    const fa = shadowed(new THREE.Mesh(FEATHER_GEO, M.wing));
    fa.scale.set(0.045, L_FORE / 2 + 0.02, 0.07);
    fa.position.set(0, L_FORE / 2, 0.025);
    foreBone.add(fa);
    for (let i = 0; i < 6; i++) foreBone.add(feather(i > 3 ? M.primary : M.wing, 0.04, 0.2 + i * 0.012, 0.03 + i * 0.05, 0.3));
    for (let i = 0; i < 5; i++) {
      const p = feather(M.primary, 0.035, 0.26 - i * 0.015, L_FORE - 0.02, -0.5 + i * 0.28);
      p.position.z += 0.02;
      foreBone.add(p);
    }
    const hand = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), M.wing));
    hand.position.y = L_FORE;
    foreBone.add(hand);
    upper.add(upperBone, foreBone);
    wings.push({ sx, upperBone, foreBone, shoulder: V(sx * 0.2, 1.43, 0.02), elbow: V(), grip: V() });
  }

  // Legs
  const legs = [];
  const footGeo = footGeometry();
  for (const sx of [1, -1]) {
    const thigh = shadowed(new THREE.Mesh(THIGH_GEO, M.body));
    const shin = shadowed(new THREE.Mesh(UNIT_CYL, M.leg));
    const knee = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), M.leg));
    const foot = shadowed(new THREE.Mesh(footGeo, M.leg));
    root.add(thigh, shin, knee, foot);
    legs.push({ sx, thigh, shin, knee, foot, hip: V(sx * 0.12, 1.04, -0.17), kneeP: V(), ankle: V(), end: V() });
  }

  const scarf = createScarf(M.scarf);
  const s = { bob: V(), jaw: 0, jawT: 0, pouch: 0, pouchV: 0, blink: 0, nextBlink: 2, look: 0 };
  const tmp = V(), tmp2 = V(), hint = V(), pole = V(), invQ = new THREE.Quaternion();

  function update(dt, ctx) {
    const c = ctx.crank;
    s.bob.set(Math.sin(c) * 0.012, Math.abs(Math.sin(c)) * -0.018 + 0.01, 0);
    upper.position.copy(s.bob);
    upper.rotation.z = Math.sin(c) * 0.025;

    for (const w of wings) {
      tmp.copy(w.shoulder).applyEuler(upper.rotation).add(s.bob);
      bike.gripLocal(w.sx > 0 ? 0 : 1, w.grip);
      pole.set(w.sx * 1, 0.5, -0.5);
      solveTwoBone(tmp, w.grip, L_ARM, L_FORE, pole, w.elbow, tmp2);
      // Bones live inside `upper`, so undo its bob/roll
      invQ.copy(upper.quaternion).invert();
      const toUpper = (v) => v.clone().sub(s.bob).applyQuaternion(invQ);
      const a = w.shoulder, e = toUpper(w.elbow), g = toUpper(tmp2);
      hint.set(0, -0.6, -1);
      orientBone(w.upperBone, a, e, hint);
      orientBone(w.foreBone, e, g, hint);
    }

    for (let i = 0; i < 2; i++) {
      const lg = legs[i];
      bike.pedalLocal(i, lg.ankle).add(tmp.set(0, 0.035, -0.035));
      tmp2.copy(lg.hip).add(s.bob);
      pole.set(lg.sx * 0.45, 0.25, 1);
      solveTwoBone(tmp2, lg.ankle, L_THIGH, L_SHIN, pole, lg.kneeP, lg.end);
      stick(lg.thigh, tmp2, lg.kneeP, 0.075);
      stick(lg.shin, lg.kneeP, lg.end, 0.022);
      lg.knee.position.copy(lg.kneeP);
      lg.foot.position.copy(lg.end).add(tmp.set(0, -0.025, 0.035));
    }

    // Head tracks the nearest fish, beak opens on demand, pouch is a damped spring
    s.look += (THREE.MathUtils.clamp(ctx.lookYaw || 0, -0.5, 0.5) - s.look) * damp(4, dt);
    head.rotation.set(Math.sin(c * 2) * 0.03 - 0.05, s.look, -s.look * 0.3);
    s.jaw += (s.jawT - s.jaw) * damp(14, dt);
    s.jawT = Math.max(0, s.jawT - dt * 1.6);
    jaw.rotation.x = s.jaw * 0.55;
    upperBeak.rotation.x = -s.jaw * 0.12;
    const accel = -Math.cos(c * 2) * 4 - s.pouch * 140 - s.pouchV * 9;
    s.pouchV += accel * dt;
    s.pouch += s.pouchV * dt;
    pouch.scale.set(0.058 + s.pouch * 0.02, 0.07 + s.pouch * 0.08, 0.25 + s.pouch * 0.01);

    s.nextBlink -= dt;
    if (s.nextBlink < 0) { s.blink = 0.14; s.nextBlink = 2 + Math.random() * 4; }
    s.blink = Math.max(0, s.blink - dt);
    for (const e of eyes) e.scale.y = s.blink > 0 ? 0.12 : 1;

    scarf.update(dt, root, ctx.time, ctx.speed);
  }

  return {
    root, head, pouch, scarf, update,
    openJaw() { s.jawT = 1; },
    gulp() { s.pouchV += 1.6; },
    beakTip(out) { return head.localToWorld(out.set(0, -0.06, 0.6)); },
    pouchWorld(out) { return pouch.getWorldPosition(out); },
    eyeWorld(out) { return head.localToWorld(out.set(0, 0.05, 0.02)); },
  };
}

// Verlet ribbon that trails behind the neck in world space
function createScarf(mat) {
  const N = 14, SEG = 0.07, W = 0.075;
  const pts = Array.from({ length: N }, () => new THREE.Vector3());
  const prev = Array.from({ length: N }, () => new THREE.Vector3());
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  let init = false, acc = 0;
  const anchor = new THREE.Vector3(), side = new THREE.Vector3(), d = new THREE.Vector3(), w = new THREE.Vector3();
  const g = new THREE.Vector3(0, -9.8, 0), f = new THREE.Vector3(), v = new THREE.Vector3();
  const back = new THREE.Vector3();

  function update(dt, root, time, speed) {
    root.localToWorld(anchor.set(0, 1.56, -0.02));
    side.set(1, 0, 0).transformDirection(root.matrixWorld);
    back.set(0, 0, -1).transformDirection(root.matrixWorld);
    if (!init) {
      for (let i = 0; i < N; i++) { pts[i].copy(anchor).addScaledVector(back, i * SEG); prev[i].copy(pts[i]); }
      init = true;
    }
    acc += Math.min(dt, 0.05);
    const h = 1 / 120;
    while (acc >= h) {
      acc -= h;
      pts[0].copy(anchor);
      for (let i = 1; i < N; i++) {
        v.subVectors(pts[i], prev[i]).divideScalar(h);
        const fl = Math.min(speed, 12) * 0.35;
        f.set(Math.sin(time * 13 + i * 0.9) * fl, Math.sin(time * 9 + i * 1.3) * fl * 1.2, Math.cos(time * 11 + i) * fl);
        f.sub(v).multiplyScalar(5).add(g);
        prev[i].copy(pts[i]);
        pts[i].addScaledVector(v, h * 0.995).addScaledVector(f, h * h);
      }
      for (let it = 0; it < 4; it++)
        for (let i = 1; i < N; i++) {
          d.subVectors(pts[i], pts[i - 1]);
          const len = d.length() || 1e-6, diff = (len - SEG) / len;
          if (i === 1) pts[i].addScaledVector(d, -diff);
          else { pts[i].addScaledVector(d, -diff * 0.5); pts[i - 1].addScaledVector(d, diff * 0.5); }
        }
    }
    for (let i = 0; i < N; i++) {
      d.subVectors(pts[Math.min(i + 1, N - 1)], pts[Math.max(i - 1, 0)]).normalize();
      w.crossVectors(d, side).normalize().multiplyScalar(W * (1 - (i / N) * 0.35) * 0.5);
      pos.set([pts[i].x + w.x, pts[i].y + w.y, pts[i].z + w.z, pts[i].x - w.x, pts[i].y - w.y, pts[i].z - w.z], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  return { mesh, update };
}
