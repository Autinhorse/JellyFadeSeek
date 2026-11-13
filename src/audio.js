// 音效：全部用 Web Audio 现场合成，没有外部素材
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  init() { if (this.ctx) return; try { const A = window.AudioContext || window.webkitAudioContext; this.ctx = new A(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination); const n = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, n, n); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } catch (e) { this.ctx = null; } }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
  tone(f0, f1, dur, vol = 0.2, type = 'sine', delay = 0, pan = 0) {
    if (!this.ctx || this.muted) return; const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol = 0.2, freq = 1200, q = 1, delay = 0, pan = 0, type = 'lowpass') {
    if (!this.ctx || this.muted) return; const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    s.connect(f); f.connect(g); out.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  step(stance, running) { const v = running ? 0.16 : stance === 'walk' ? 0.07 : stance === 'crouch' ? 0.035 : 0.02; this.noise(0.09, v, running ? 500 : 320, 0.8); this.tone(running ? 150 : 110, 60, 0.07, v * 0.8, 'sine'); }
  hunterStep(dist, pan) { const v = Math.max(0, 1 - dist / 16); if (v <= 0.02) return; this.tone(300, 170, 0.08, 0.12 * v * v, 'triangle', 0, pan); this.noise(0.05, 0.05 * v * v, 900, 1, 0, pan); }
  spotted() { this.tone(520, 620, 0.12, 0.25, 'square'); this.tone(700, 980, 0.2, 0.25, 'square', 0.13); }
  lost() { this.tone(500, 330, 0.25, 0.14, 'triangle'); }
  fire(dist, pan) { const v = Math.max(0.15, 1 - dist / 25); this.tone(420, 90, 0.16, 0.3 * v, 'sine', 0, pan); this.noise(0.12, 0.2 * v, 2000, 0.7, 0, pan, 'bandpass'); }
  splat(dist, pan) { const v = Math.max(0.1, 1 - dist / 20); this.noise(0.22, 0.3 * v, 700, 0.6, 0, pan); this.tone(180, 70, 0.14, 0.2 * v, 'sine', 0, pan); }
  score() { this.tone(880, 880, 0.09, 0.14, 'triangle'); this.tone(1320, 1320, 0.16, 0.14, 'triangle', 0.08); }
  hidden() { this.tone(660, 990, 0.25, 0.07, 'sine'); }
  tick() { this.tone(900, 900, 0.05, 0.1, 'square'); }
  go() { this.tone(523, 523, 0.1, 0.2, 'square'); this.tone(659, 659, 0.1, 0.2, 'square', 0.1); this.tone(784, 784, 0.25, 0.2, 'square', 0.2); }
  stance() { this.tone(240, 180, 0.07, 0.07, 'triangle'); }
  bump() { this.tone(140, 90, 0.1, 0.14, 'square'); }
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 0.2, 'triangle', i * 0.13)); }
  lose() { [440, 370, 311, 233].forEach((f, i) => this.tone(f, f * 0.97, 0.22, 0.2, 'triangle', i * 0.17)); this.noise(0.5, 0.25, 600, 0.5); }
  hint() { this.tone(330, 330, 0.12, 0.14, 'sawtooth'); this.tone(330, 330, 0.12, 0.14, 'sawtooth', 0.2); }
}
