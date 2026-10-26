import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createPath, createHeightField } from './path.js';
import { buildTerrain, buildRoad, buildArch } from './terrain.js';
import { buildVegetation, buildLamps, buildLighthouse, buildBoats, buildClouds, buildGulls, buildStars, buildFireflies, propUniforms } from './props.js';
import { createSky } from './sky.js';
import { createBicycle, BIKE } from './bicycle.js';
import { createPelican } from './pelican.js';
import { createFishField, fishMaterial } from './fish.js';
import { Particles } from './particles.js';
import { AudioFX } from './audio.js';
import { CameraRig } from './camera.js';
import { makeRoadTexture, makeWaterNormals } from './textures.js';
import { clamp, damp, lerp, smoothstep, nextFrame } from './util.js';
import { createUI } from './ui.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
const QUALITY = isTouch ? 0.45 : 1;

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uStrength: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uStrength; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      // Subtle chromatic fringe toward the edges
      float ca = dot(d, d) * 0.0025;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + d * ca * 4.0).r;
      c.b = texture2D(tDiffuse, vUv - d * ca * 4.0).b;
      c.rgb *= 1.0 - uStrength * smoothstep(0.25, 0.85, length(d) * 1.25);
      c.rgb += (hash(vUv * 900.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = c;
    }`,
};

async function boot() {
  const progress = (p, text) => { $('loadbar').style.width = `${p * 100}%`; $('loadtext').textContent = text; return nextFrame(); };

  const canvas = $('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    $('fatal').hidden = false;
    $('fatal').textContent = '你的浏览器不支持 WebGL2，无法显示 3D 场景。请换用最新版 Chrome / Edge / Safari / Firefox。';
    return;
  }
  let pixelRatio = Math.min(devicePixelRatio, isTouch ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 6000);

  await progress(0.08, '铺设环岛公路...');
  const path = createPath();
  const field = createHeightField(path);

  await progress(0.2, '堆出小岛地形...');
  scene.add(buildTerrain(field));
  scene.add(buildRoad(path, makeRoadTexture(renderer.capabilities.getMaxAnisotropy())));
  scene.add(buildArch(path));

  await progress(0.38, '种下椰子树和小花...');
  scene.add(buildVegetation(field, path, QUALITY));
  const lamps = buildLamps(path);
  scene.add(lamps.group);
  const lighthouse = buildLighthouse(field);
  scene.add(lighthouse.group);

  await progress(0.55, '调配天空与海水...');
  const env = createSky(scene, renderer, makeWaterNormals());
  if (isTouch) env.sun.shadow.mapSize.set(1024, 1024);
  const boats = buildBoats();
  const clouds = buildClouds();
  const gulls = buildGulls();
  const stars = buildStars();
  const fireflies = buildFireflies(path);
  scene.add(boats.group, clouds.group, gulls.group, stars.points, fireflies.points);

  await progress(0.7, '给鹈鹕戴上骑行帽...');
  const bike = createBicycle();
  const pelican = createPelican(bike);
  bike.group.add(pelican.root);
  scene.add(bike.group, pelican.scarf.mesh);
  const fish = createFishField(scene, path);

  const dust = new Particles(260, 0xd9c7a0, { gravity: 0.4, drag: 2.2 });
  const sparkle = new Particles(300, 0xffd36b, { additive: true, gravity: -3.5, drag: 1.2 });
  const splash = new Particles(400, 0xe8f6ff, { gravity: -9, drag: 0.4 });
  scene.add(dust.points, sparkle.points, splash.points);

  await progress(0.85, '预热着色器...');
  const rt = new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 0.88);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  const rig = new CameraRig(camera, canvas, path, field.height);
  const audio = new AudioFX();

  // Gameplay state
  const G = {
    s: 6, lat: 0.4, latV: 0, speed: 0, lean: 0, yaw: 0, steerVis: 0,
    auto: true, input: { left: 0, right: 0, go: 0, brake: 0 },
    tod: 16.5, todAuto: true, todFast: false,
    score: 0, combo: 0, lastCatch: -99, dist: 0, time: 0, started: false,
  };
  const B = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3(), eye: new THREE.Vector3(), speed: 0, s: 0 };

  const ui = createUI({ G, rig, audio, camera, renderer, composer, path, pelican, bike });
  ui.setFish(fish.list);
  env.setTime(G.tod);

  const P = new THREE.Vector3(), T = new THREE.Vector3(), SD = new THREE.Vector3();
  const left = new THREE.Vector3(), up = new THREE.Vector3(), basis = new THREE.Matrix4(), rollQ = new THREE.Quaternion();
  const ZAXIS = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const beak = new THREE.Vector3(), pouchW = new THREE.Vector3();
  const LAT_MAX = 1.35;
  const DUSK_CLOUD = new THREE.Color(0xff9e7a), NIGHT_CLOUD = new THREE.Color(0x1c2a4a);
  let prevS = G.s, prevLatV = 0, gullTimer = 6;

  function ride(dt) {
    const inp = G.input;
    // Throttle
    let target, pedaling = true;
    if (G.auto) {
      const climb = path.py[Math.floor((path.wrap(G.s + 6) / path.length) * path.S)] - path.py[Math.floor((path.wrap(G.s) / path.length) * path.S)];
      target = 7.6 - climb * 0.6;
    } else {
      target = inp.go ? 13 : inp.brake ? 0 : Math.max(G.speed * 0.995, 4.5);
    }
    if (!G.started) target = 6;
    const accel = target > G.speed ? 2.6 : inp.brake && !G.auto ? 7 : 1.6;
    G.speed += clamp(target - G.speed, -accel * dt, accel * dt);
    if (G.speed < target - 0.05 || inp.go) pedaling = true;
    else if (G.speed > target + 0.05 || inp.brake) pedaling = false;
    else pedaling = G.auto || G.speed > 0.5;
    if (G.speed < 0.05) pedaling = false;

    // Lateral movement across the lane
    let latTarget;
    const ahead = fish.nextAhead(G.s, 26);
    if (G.auto) {
      // Aim the beak, not the wheels: leaning shifts the head sideways
      latTarget = (ahead ? ahead.fish.lat : Math.sin(G.s * 0.03) * 0.5) - Math.sin(G.lean) * 1.95;
      const want = clamp((latTarget - G.lat) * 2.2, -1.6, 1.6);
      G.latV += (want - G.latV) * damp(3, dt);
    } else {
      const u = inp.right - inp.left;
      G.latV += (u * 1.9 - G.latV) * damp(5, dt);
    }
    G.lat += G.latV * dt;
    if (Math.abs(G.lat) > LAT_MAX) { G.lat = Math.sign(G.lat) * LAT_MAX; G.latV *= -0.2; }
    G.s = path.wrap(G.s + G.speed * dt);
    G.dist += G.speed * dt;
    if (prevS > path.length * 0.9 && G.s < path.length * 0.1) ui.lap();
    prevS = G.s;

    // Orientation: tangent + lane-change yaw, then roll into the turn
    path.frameAt(G.s, P, T, SD);
    const spd = Math.max(G.speed, 0.5);
    G.yaw = Math.atan2(G.latV, spd);
    const kappa = path.curvatureAt(G.s);
    const latAcc = (G.latV - prevLatV) / Math.max(dt, 1e-3);
    prevLatV = G.latV;
    const leanT = clamp(Math.atan((G.speed * G.speed * kappa + latAcc * 0.6) / 9.8), -0.6, 0.6);
    G.lean += (leanT - G.lean) * damp(6, dt);
    G.steerVis += (clamp(-(kappa * 1.2 + G.yaw * 0.9 + G.lean * 0.15), -0.5, 0.5) - G.steerVis) * damp(8, dt);

    B.fwd.copy(T).multiplyScalar(Math.cos(G.yaw)).addScaledVector(SD, Math.sin(G.yaw)).normalize();
    left.crossVectors(THREE.Object3D.DEFAULT_UP, B.fwd).normalize();
    up.crossVectors(B.fwd, left);
    basis.makeBasis(left, up, B.fwd);
    bike.group.quaternion.setFromRotationMatrix(basis);
    rollQ.setFromAxisAngle(ZAXIS, G.lean);
    bike.group.quaternion.multiply(rollQ);
    bike.group.position.copy(P).addScaledVector(SD, G.lat);
    bike.group.position.y += 0.03;
    bike.group.updateMatrixWorld(true);

    B.pos.copy(bike.group.position);
    B.up.set(0, 1, 0).applyQuaternion(bike.group.quaternion);
    B.right.copy(left).negate();
    B.speed = G.speed;
    B.s = G.s;
    return { pedaling, ahead };
  }

  function catchFish(f) {
    const now = G.time;
    G.combo = now - G.lastCatch < 5 ? G.combo + 1 : 1;
    G.lastCatch = now;
    G.score += 1;
    pelican.openJaw();
    setTimeout(() => { pelican.gulp(); audio.gulp(G.combo); }, 260);
    for (let i = 0; i < 26; i++) {
      tmp2.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3).addScaledVector(B.fwd, G.speed * 0.8);
      sparkle.emit(f.mesh.position, tmp2, 0.6 + Math.random() * 0.5, 0.05 + Math.random() * 0.05);
    }
    if (Math.random() < 0.55) {
      const m = new THREE.Mesh(fish.geo, fishMaterial);
      bike.addBasketFish(m);
    }
    ui.onCatch(f.mesh.position, G.combo);
  }

  let lastT = -1;
  let frames = 0, acc = 0, adaptT = 0;

  function frame(now) {
    const dt = lastT < 0 ? 1 / 60 : Math.min((now - lastT) / 1000, 1 / 20);
    lastT = now;
    G.time += dt;
    propUniforms.time.value = G.time;

    // Time of day
    if (G.todAuto) G.tod = (G.tod + dt * (G.todFast ? 1.2 : 1 / 30)) % 24;
    env.setTime(G.tod);
    const night = env.state.night, dusk = env.state.dusk;

    const { pedaling, ahead } = ride(dt);
    const headOn = night > 0.35;
    bike.update(dt, G.speed, G.steerVis, night, headOn, pedaling);

    // Pelican gaze and beak anticipation
    let lookYaw = 0;
    if (ahead && ahead.d < 9) {
      bike.group.worldToLocal(tmp.copy(ahead.fish.mesh.position));
      lookYaw = Math.atan2(tmp.x, Math.max(tmp.z - 0.3, 0.3));
      if (ahead.d < 2.6) pelican.openJaw();
    }
    pelican.update(dt, { crank: bike.state.crank, time: G.time, speed: G.speed, lookYaw });

    pelican.beakTip(beak);
    fish.update(dt, G.time, G.dist, beak, (out) => pelican.pouchWorld(out), catchFish);
    fishMaterial.emissiveIntensity = 0.5 + night * 1.6;

    // Particles
    if (G.speed > 5 && Math.random() < (G.speed - 5) * 0.12) {
      tmp.copy(B.pos).addScaledVector(B.fwd, BIKE.rear.z).addScaledVector(B.right, (Math.random() - 0.5) * 0.1);
      tmp.y += 0.03;
      tmp2.copy(B.fwd).multiplyScalar(-G.speed * 0.12).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6));
      dust.emit(tmp, tmp2, 0.9 + Math.random() * 0.6, 0.06 + Math.random() * 0.05);
    }
    dust.uniforms.uColor.value.setRGB(0.85, 0.78, 0.63).multiplyScalar(0.25 + 0.75 * env.state.day);
    dust.update(dt);
    sparkle.update(dt);
    splash.update(dt);

    // Ambient life
    env.follow(B.pos);
    env.update(dt, G.time);
    lamps.bulbMat.emissiveIntensity = smoothstep(0.25, 0.75, night) * 6;
    lighthouse.beam.rotation.y += dt * 0.7;
    lighthouse.beamMat.uniforms.uOpacity.value = smoothstep(0.3, 0.8, night) * 0.35;
    lighthouse.lampMat.emissiveIntensity = 0.3 + night * 5;
    stars.mat.opacity = smoothstep(0.55, 0.95, night);
    stars.points.position.copy(camera.position);
    fireflies.mat.uniforms.uOpacity.value = smoothstep(0.6, 0.95, night);
    fireflies.mat.uniforms.uScale.value = renderer.getPixelRatio();
    clouds.mat.color.setRGB(1, 1, 1).lerp(DUSK_CLOUD, dusk * 0.7).multiplyScalar(0.3 + 0.7 * env.state.day);
    clouds.mat.emissive.copy(DUSK_CLOUD).multiplyScalar(dusk * 0.35).lerp(NIGHT_CLOUD, night * (1 - dusk));
    for (const c of clouds.group.children) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 420) c.position.x = -420;
    }
    for (const b of boats.boats) {
      const u = b.userData;
      u.ang += u.speed * dt;
      b.position.set(Math.cos(u.ang) * u.R, Math.sin(G.time * 1.3 + u.phase) * 0.15 + 0.2, Math.sin(u.ang) * u.R);
      b.rotation.set(Math.sin(G.time * 1.1 + u.phase) * 0.06, -u.ang, Math.sin(G.time * 0.9 + u.phase) * 0.08);
      if (Math.random() < 0.15) {
        tmp.set(Math.cos(u.ang) * u.R, 0.1, Math.sin(u.ang) * u.R).add(tmp2.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
        splash.emit(tmp, tmp2.set((Math.random() - 0.5), 1.5 + Math.random(), (Math.random() - 0.5)), 0.8, 0.25);
      }
    }
    for (const g of gulls.gulls) {
      const u = g.userData, a = G.time * u.speed + u.phase;
      g.position.set(B.pos.x * 0.3 + u.cx + Math.cos(a) * u.R, u.h + Math.sin(a * 2) * 2, B.pos.z * 0.3 + u.cz + Math.sin(a) * u.R);
      g.rotation.set(0, -a, Math.sin(a) * 0.3 + 0.35);
      const flap = Math.sin(G.time * 7 + u.phase * 3) * 0.55;
      for (const w of u.wings) w.pivot.rotation.z = flap * w.k;
    }
    gullTimer -= dt;
    if (gullTimer < 0) { gullTimer = 7 + Math.random() * 10; if (env.state.day > 0.5) audio.gull(Math.random() * 2 - 1); }

    // Camera, audio, UI
    pelican.eyeWorld(B.eye);
    rig.update(dt, B);
    audio.update(G.speed, !pedaling && G.speed > 1);
    vignette.uniforms.uTime.value = G.time;
    // Bloom only catches emissives by day; the HDR sky would otherwise wash the frame out
    bloom.strength = lerp(0.12, 0.75, night);
    bloom.threshold = lerp(3.0, 0.75, night);
    ui.update(dt, B);

    composer.render(dt);
    ui.afterRender();

    // Adaptive resolution: drop pixel ratio if we stay under ~40fps
    frames++; acc += dt; adaptT += dt;
    if (acc > 2.5) {
      const fps = frames / acc;
      if (fps < 40 && pixelRatio > 0.75 && adaptT > 4) {
        pixelRatio = Math.max(0.75, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        composer.setPixelRatio(pixelRatio);
        composer.setSize(innerWidth, innerHeight);
      }
      frames = 0; acc = 0;
    }
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.resolution.set(innerWidth, innerHeight);
  });

  // Warm up: compile shaders and render one frame before revealing
  ride(0.016);
  rig.update(0.016, B);
  await renderer.compileAsync(scene, camera).catch(() => {});
  await progress(1, '出发！');
  renderer.setAnimationLoop(frame);
  $('loader').classList.add('done');
  setTimeout(() => $('loader').remove(), 700);
  ui.showIntro(() => {
    G.started = true;
    rig.setMode('chase');
  });
}

boot().catch((e) => {
  console.error(e);
  $('fatal').hidden = false;
  $('fatal').textContent = '场景加载失败：' + e.message;
});
