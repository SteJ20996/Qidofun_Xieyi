// sfx.js —— 极简程序化音效：没有任何音频文件，全靠 Web Audio 现场合成
// 笔触是扫频的带通噪声；吸墨是反着来的；合字是一声小磬；虎是低吼。
(function () {
  'use strict';
  const SFX = { ctx: null, out: null, muted: false, noiseBuf: null };
  SFX.init = function () {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = 0.45; this.out.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 1.0, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch (e) { this.ctx = null; }
  };
  SFX.toggle = function () { this.muted = !this.muted; return this.muted; };
  SFX.play = function (fn) {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    try { fn(this.ctx, this.out, this.ctx.currentTime); } catch (e) { /* 音效失败不影响游戏 */ }
  };
  // 噪声 + 带通扫频
  function swoosh(c, out, t, f0, f1, dur, vol) {
    const src = c.createBufferSource(); src.buffer = SFX.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(c, out, t, freq, dur, vol, type, slideTo) {
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  SFX.write = function () { this.play((c, o, t) => swoosh(c, o, t, 500, 2400, 0.32, 0.5)); };
  SFX.absorb = function () { this.play((c, o, t) => { swoosh(c, o, t, 2200, 350, 0.3, 0.35); tone(c, o, t, 260, 0.3, 0.08, 'sine', 620); }); };
  SFX.fuse = function () { this.play((c, o, t) => { tone(c, o, t, 784, 0.7, 0.18, 'sine'); tone(c, o, t + 0.02, 1175, 0.9, 0.08, 'sine'); tone(c, o, t, 392, 0.5, 0.06, 'triangle'); }); };
  SFX.learn = function () { this.play((c, o, t) => { [523, 659, 784].forEach((f, i) => tone(c, o, t + i * 0.09, f, 0.35, 0.12, 'triangle')); }); };
  SFX.fail = function () { this.play((c, o, t) => { tone(c, o, t, 140, 0.18, 0.2, 'sine', 55); swoosh(c, o, t, 900, 200, 0.15, 0.15); }); };
  SFX.tiger = function () {
    this.play((c, o, t) => {
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(75, t); osc.frequency.linearRampToValueAtTime(55, t + 0.6);
      const lfo = c.createOscillator(); lfo.frequency.value = 18; const lg = c.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(osc.frequency);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(f); f.connect(g); g.connect(o); osc.start(t); lfo.start(t); osc.stop(t + 0.75); lfo.stop(t + 0.75);
    });
  };
  window.SFX = SFX;
})();
