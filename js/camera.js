import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { damp } from './util.js';

const SHOTS = ['side', 'front', 'aerial', 'roadside', 'wheel', 'circle'];

export class CameraRig {
  constructor(camera, dom, path, height) {
    this.camera = camera;
    this.path = path;
    this.height = height;
    this.mode = 'intro';
    this.controls = new OrbitControls(camera, dom);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 45;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.look = new THREE.Vector3();
    this.shot = 0;
    this.shotTime = 0;
    this.fixed = new THREE.Vector3();
    this.onCut = null;
    this.t = 0;
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._tan = new THREE.Vector3();
    this._side = new THREE.Vector3();
  }

  setMode(m) {
    this.mode = m;
    this.controls.enabled = m === 'orbit';
    this.shotTime = 0;
    this.snap = true;
    if (m === 'orbit') this.controls.target.copy(this.look);
  }

  update(dt, b) {
    const cam = this.camera, v = this._v;
    this.t += dt;
    let fov = 55, k = 5, desired = null, look = null;
    if (this.mode === 'chase') {
      desired = v.copy(b.pos).addScaledVector(b.fwd, -4.3).addScaledVector(b.up, 1.9).addScaledVector(b.right, 0.8);
      look = this._p.copy(b.pos).addScaledVector(b.up, 1.3).addScaledVector(b.fwd, 2);
      fov = 52 + b.speed * 1.1;
      k = 3.5;
    } else if (this.mode === 'pov') {
      cam.position.copy(b.eye).addScaledVector(b.up, 0.06).addScaledVector(b.fwd, -0.04);
      look = this._p.copy(b.eye).addScaledVector(b.fwd, 6).addScaledVector(b.up, -0.9);
      this.look.copy(look);
      cam.lookAt(look);
      cam.up.copy(b.up);
      this.setFov(72);
      return;
    } else if (this.mode === 'orbit') {
      const delta = v.copy(b.pos).addScaledVector(b.up, 1.1).sub(this.controls.target);
      cam.position.add(delta);
      this.controls.target.add(delta);
      this.controls.update();
      this.look.copy(this.controls.target);
      this.setFov(50);
      cam.up.set(0, 1, 0);
      return;
    } else {
      // Intro and cinematic modes cycle through shots
      this.shotTime += dt;
      const dur = this.mode === 'intro' ? 9 : 6;
      if (this.shotTime > dur) {
        this.shotTime = 0;
        this.shot = (this.shot + 1) % SHOTS.length;
        this.snap = true;
        if (this.onCut && this.mode === 'cinema') this.onCut();
      }
      const name = this.mode === 'intro' ? 'circle' : SHOTS[this.shot];
      look = this._p.copy(b.pos).addScaledVector(b.up, 1.2);
      k = 6;
      if (name === 'side') {
        desired = v.copy(b.pos).addScaledVector(b.right, -3.4).addScaledVector(b.up, 1.0).addScaledVector(b.fwd, 0.4 + this.shotTime * 0.15);
        fov = 42;
      } else if (name === 'front') {
        desired = v.copy(b.pos).addScaledVector(b.fwd, 4.6).addScaledVector(b.up, 0.75).addScaledVector(b.right, 0.6);
        fov = 40;
      } else if (name === 'aerial') {
        desired = v.copy(b.pos).addScaledVector(b.fwd, -9 + this.shotTime).addScaledVector(b.up, 13 - this.shotTime);
        fov = 48;
      } else if (name === 'roadside') {
        if (this.snap) {
          this.path.frameAt(b.s + 26, this.fixed, this._tan, this._side);
          this.fixed.addScaledVector(this._side, 4.2);
          this.fixed.y += 1.1;
        }
        desired = v.copy(this.fixed);
        fov = 30 - Math.min(this.shotTime, 6) * 1.5;
        k = 50;
      } else if (name === 'wheel') {
        desired = v.copy(b.pos).addScaledVector(b.right, 1.25).addScaledVector(b.up, 0.45).addScaledVector(b.fwd, -0.2);
        look = this._p.copy(b.pos).addScaledVector(b.up, 0.5).addScaledVector(b.fwd, -0.1);
        fov = 50;
      } else {
        const a = this.t * 0.25;
        const r = this.mode === 'intro' ? 6.5 : 5;
        desired = v.copy(b.pos).addScaledVector(b.right, Math.cos(a) * r).addScaledVector(b.fwd, Math.sin(a) * r).addScaledVector(b.up, 1.8);
        fov = 45;
      }
    }

    const gy = this.height(desired.x, desired.z) + 0.6;
    if (desired.y < gy) desired.y = gy;
    if (desired.y < 0.8) desired.y = 0.8;
    if (this.snap) { cam.position.copy(desired); this.look.copy(look); this.snap = false; }
    else {
      cam.position.lerp(desired, damp(k, dt));
      this.look.lerp(look, damp(k * 1.5, dt));
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    this.setFov(fov, dt);
  }

  setFov(f, dt) {
    const cam = this.camera;
    const nf = dt ? cam.fov + (f - cam.fov) * damp(3, dt) : f;
    if (Math.abs(nf - cam.fov) > 0.01) { cam.fov = nf; cam.updateProjectionMatrix(); }
  }
}
