// Everything here is synthesized with WebAudio, no sample files
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [
  [48, 55, 64, 71], // Cmaj7
  [45, 52, 60, 67], // Am7
  [41, 48, 57, 64], // Fmaj7
  [43, 50, 59, 62], // G
];
const PENTA = [72, 74, 76, 79, 81, 84];

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
  }

  init() {
    if (this.ctx) return this.ctx.resume();
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);

    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.wind = this.loopNoise('bandpass', 500, 0.6);
    this.roll = this.loopNoise('lowpass', 260, 0.8);
    this.whir = this.loopNoise('bandpass', 2400, 6);

    this.step = 0;
    this.nextNote = ctx.currentTime + 0.2;
    this.timer = setInterval(() => this.schedule(), 30);
    document.addEventListener('visibilitychange', () => (document.hidden ? ctx.suspend() : ctx.resume()));
  }

  loopNoise(type, freq, q) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
    return { f, g };
  }

  update(speed, braking) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = Math.min(speed / 14, 1);
    this.wind.g.gain.setTargetAtTime(v * v * 0.35, t, 0.3);
    this.wind.f.frequency.setTargetAtTime(350 + v * 900, t, 0.3);
    this.roll.g.gain.setTargetAtTime(v * 0.22, t, 0.2);
    this.whir.g.gain.setTargetAtTime((braking ? 0.05 : 0.012) * v, t, 0.1);
  }

  env(node, t, a, peak, dec) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  tone(type, freq, t, peak, dec, dest = this.sfx, a = 0.005) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    this.env(g, t, a, peak, dec);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + dec + 0.05);
    return o;
  }

  bell() {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    for (const off of [0, 0.2])
      for (const [ratio, amp] of [[1, 0.25], [2.76, 0.1], [5.4, 0.05]]) this.tone('sine', 2100 * ratio, t + off, amp, 1.2);
  }

  gulp(combo = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const o = this.tone('sine', 420, t, 0.4, 0.22);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
    const base = 76 + Math.min(combo, 6) * 2;
    this.tone('triangle', mtof(base), t + 0.1, 0.16, 0.25);
    this.tone('triangle', mtof(base + 7), t + 0.18, 0.16, 0.4);
  }

  gull(pan = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    p.connect(g).connect(this.sfx);
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.28;
      const o = this.tone('sine', 1500, s, 0.8, 0.22, p, 0.02);
      o.frequency.exponentialRampToValueAtTime(980, s + 0.22);
    }
  }

  fanfare() {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => this.tone('square', mtof(m), t + i * 0.11, 0.06, i === 3 ? 0.6 : 0.15));
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.4);
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  // Generative lo-fi loop: arpeggio, bass, pad and a wandering pentatonic melody
  schedule() {
    const ctx = this.ctx, eighth = 60 / 92 / 2;
    while (this.nextNote < ctx.currentTime + 0.15) {
      const t = this.nextNote, st = this.step;
      const chord = CHORDS[Math.floor(st / 16) % 4], beat = st % 16;
      const arp = [0, 1, 2, 3, 2, 1, 2, 3][beat % 8];
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      lp.connect(this.music);
      this.tone('triangle', mtof(chord[arp] + 12), t, 0.09, 0.35, lp);
      if (beat % 4 === 0) this.tone('sine', mtof(chord[0] - 12), t, 0.22, 0.5, this.music, 0.01);
      if (beat === 0) {
        for (const m of chord.slice(1)) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
          o.type = 'sawtooth';
          o.frequency.value = mtof(m);
          o.detune.value = (Math.random() - 0.5) * 14;
          f.type = 'lowpass';
          f.frequency.value = 700;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.025, t + 0.6);
          g.gain.exponentialRampToValueAtTime(0.0001, t + eighth * 16);
          o.connect(f).connect(g).connect(this.music);
          o.start(t);
          o.stop(t + eighth * 16 + 0.1);
        }
      }
      if (beat % 2 === 0 && Math.random() < 0.3) this.tone('sine', mtof(PENTA[(Math.random() * PENTA.length) | 0]), t, 0.07, 0.8, this.music);
      this.step++;
      this.nextNote += eighth;
    }
  }
}
