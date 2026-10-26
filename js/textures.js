import * as THREE from 'three';
import { rng } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Overlapping feather scales, tiles horizontally
export function makeFeatherTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f6f3ec';
  g.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let row = 0; row < 22; row++) {
    for (let col = -1; col < 17; col++) {
      const x = col * 16 + (row % 2) * 8, y = row * 12;
      const s = 228 + r() * 22;
      const grd = g.createLinearGradient(x, y - 8, x, y + 10);
      grd.addColorStop(0, `rgb(${s},${s - 4},${s - 12})`);
      grd.addColorStop(1, '#fdfbf6');
      g.fillStyle = grd;
      g.strokeStyle = 'rgba(140,128,105,0.32)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.ellipse(x, y, 9, 9, 0, 0, Math.PI);
      g.fill(); g.stroke();
    }
  }
  return toTex(c);
}

export function makeRoadTexture(aniso) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#3b3d42';
  g.fillRect(0, 0, 256, 512);
  const r = rng(3);
  for (let i = 0; i < 7000; i++) {
    const v = (36 + r() * 56) | 0;
    g.fillStyle = `rgba(${v},${v},${v + 5},0.55)`;
    g.fillRect(r() * 256, r() * 512, 1.6, 1.6);
  }
  g.fillStyle = '#ebe7dc';
  g.fillRect(12, 0, 7, 512);
  g.fillRect(237, 0, 7, 512);
  g.fillStyle = '#f2c230';
  g.fillRect(124, 40, 8, 220);
  return toTex(c, true, aniso);
}

// Tileable normal map from a sum of integer-frequency waves
export function makeWaterNormals() {
  const N = 256, [c, g] = canvas(N, N), img = g.createImageData(N, N);
  const H = new Float32Array(N * N), r = rng(11);
  const waves = [];
  for (let i = 0; i < 40; i++) {
    const kx = Math.round((r() * 2 - 1) * 14), ky = Math.round((r() * 2 - 1) * 14);
    const k = Math.hypot(kx, ky);
    if (k < 1) continue;
    waves.push({ kx, ky, p: r() * 6.283, a: 1 / Math.pow(k, 1.15) });
  }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let h = 0;
      for (const w of waves) h += w.a * Math.sin((2 * Math.PI * (w.kx * x + w.ky * y)) / N + w.p);
      H[y * N + x] = h;
    }
  const at = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
  const s = 3.2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * s, ny = -(at(x, y + 1) - at(x, y - 1)) * s;
      const l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return toTex(c, false);
}

export function makeChainTexture() {
  const [c, g] = canvas(64, 16);
  g.fillStyle = '#1b1b1d';
  g.fillRect(0, 0, 64, 16);
  for (let i = 0; i < 2; i++) {
    g.fillStyle = i ? '#8c9096' : '#c9ccd1';
    g.beginPath();
    g.roundRect(i * 32 + 2, 3, 28, 10, 5);
    g.fill();
    g.fillStyle = '#2b2b2e';
    g.beginPath(); g.arc(i * 32 + 8, 8, 2.2, 0, 7); g.arc(i * 32 + 24, 8, 2.2, 0, 7); g.fill();
  }
  return toTex(c);
}

export function makeStripeTexture(a, b, bands) {
  const [c, g] = canvas(16, 256);
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(0, (i * 256) / bands, 16, 256 / bands + 1);
  }
  return toTex(c);
}

export function makeCheckerTexture() {
  const [c, g] = canvas(64, 64);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  const t = toTex(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function makeBannerTexture(title, sub) {
  const [c, g] = canvas(1024, 256);
  const grd = g.createLinearGradient(0, 0, 1024, 0);
  grd.addColorStop(0, '#ff6b4a'); grd.addColorStop(0.5, '#ffb347'); grd.addColorStop(1, '#ff6b4a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 1024; i += 48) g.fillRect(i, 0, 22, 256);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = '900 104px "PingFang SC","Microsoft YaHei",sans-serif';
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 12;
  g.fillText(title, 512, 128);
  g.font = '700 46px "Avenir Next","Helvetica Neue",sans-serif';
  g.fillText(sub, 512, 205);
  return toTex(c);
}

export function makeWickerTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#8a5a2b';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#c38a4c' : '#a8733d';
      g.beginPath();
      g.roundRect(x * 16 + 1, y * 16 + 2, 14, 12, 4);
      g.fill();
    }
  return toTex(c);
}
