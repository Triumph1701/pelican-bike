import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { lerp, smoothstep } from './util.js';

const WARM = new THREE.Color(0xff9a50), WHITE = new THREE.Color(0xfff4e6);
const FOG_DAY = new THREE.Color(0xb9d3e8), FOG_DUSK = new THREE.Color(0xe7a98a), FOG_NIGHT = new THREE.Color(0x1a2848);
const HEMI_DAY = new THREE.Color(0xcfe3ff), HEMI_NIGHT = new THREE.Color(0x24345e);

export function createSky(scene, renderer, normals) {
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);
  // The sun disc is extremely bright in HDR; clamp it so bloom and the PMREM env stay sane
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    'gl_FragColor = vec4( min( texColor, vec3( 2.5 ) ), 1.0 );'
  );
  const u = sky.material.uniforms;
  u.turbidity.value = 5.5;
  u.rayleigh.value = 1.8;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.82;
  if (u.cloudCoverage) {
    u.cloudCoverage.value = 0.35;
    u.cloudDensity.value = 0.45;
  }

  const water = new Water(new THREE.PlaneGeometry(5000, 5000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: 0x0a5a73,
    distortionScale: 2.4,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 3.5;
  scene.add(water);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -16;
  sc.right = sc.top = 16;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b6b3a, 0.7);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0);
  moon.position.set(-80, 120, 60);
  scene.add(hemi, moon);

  scene.fog = new THREE.Fog(FOG_DAY.clone(), 140, 720);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  let envRT = null, lastEnvEl = 999;

  const sunDir = new THREE.Vector3();
  const state = { elevation: 0, day: 1, night: 0, dusk: 0 };

  function refreshEnv() {
    scene.remove(sky);
    envScene.add(sky);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.04);
    envScene.remove(sky);
    scene.add(sky);
    scene.environment = envRT.texture;
  }

  // tod: hours, 0..24
  function setTime(tod) {
    const el = 72 * Math.sin(((tod - 6) / 12) * Math.PI);
    const az = 200 + (tod - 12) * 14;
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
    u.sunPosition.value.copy(sunDir);

    const day = smoothstep(-5, 8, el);
    const dusk = smoothstep(-6, 2, el) * smoothstep(30, 4, el);
    state.elevation = el;
    state.day = day;
    state.night = 1 - day;
    state.dusk = dusk;

    sun.intensity = 3.1 * smoothstep(-1.5, 7, el);
    sun.color.copy(WHITE).lerp(WARM, smoothstep(35, 3, el));
    sun.castShadow = el > -1;
    hemi.intensity = 0.45 + 0.3 * day;
    hemi.color.copy(HEMI_NIGHT).lerp(HEMI_DAY, day);
    moon.intensity = 1.1 * (1 - day);
    u.rayleigh.value = lerp(0.6, 1.8, day);

    scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, day).lerp(FOG_DUSK, dusk * 0.55);
    renderer.toneMappingExposure = lerp(0.85, 0.5, day);
    scene.environmentIntensity = 0.35 + 0.65 * day;

    const wu = water.material.uniforms;
    if (el > -2) {
      wu.sunDirection.value.copy(sunDir);
      wu.sunColor.value.copy(sun.color).multiplyScalar(smoothstep(-2, 6, el));
    } else {
      wu.sunDirection.value.copy(moon.position).normalize();
      wu.sunColor.value.setRGB(0.35, 0.42, 0.6);
    }
    wu.waterColor.value.setHex(0x0a5a73).multiplyScalar(0.25 + 0.75 * day);

    if (Math.abs(el - lastEnvEl) > 1.2) {
      lastEnvEl = el;
      refreshEnv();
    }
  }

  // Keep the shadow frustum centred on the rider
  function follow(target) {
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(sunDir.y > 0.02 ? sunDir : moon.position.clone().normalize(), 120);
  }

  function update(dt, time) {
    water.material.uniforms.time.value += dt * 0.6;
    if (u.time) u.time.value = time;
  }

  return { sky, water, sun, hemi, moon, sunDir, state, setTime, follow, update };
}
