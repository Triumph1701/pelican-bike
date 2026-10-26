import * as THREE from 'three';

// Pooled point sprites with per-particle alpha and size
export class Particles {
  constructor(max, color, { additive = false, gravity = -2, drag = 1.5 } = {}) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.ttl = new Float32Array(max).fill(1);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.base = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uColor: { value: new THREE.Color(color) }, uScale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: this.uniforms,
      vertexShader: `attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  emit(p, v, ttl, size) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = ttl;
    this.ttl[i] = ttl;
    this.base[i] = size;
  }

  update(dt) {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] += this.gravity * dt;
      for (let a = 0; a < 3; a++) { this.vel[j + a] *= k; this.pos[j + a] += this.vel[j + a] * dt; }
      const t = Math.max(this.life[i], 0) / this.ttl[i];
      this.alpha[i] = Math.sin(t * Math.PI) * 0.9;
      this.size[i] = this.base[i] * (1.6 - t * 0.6);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}
