// sfx.js —— 極簡程序化音效：沒有任何音頻文件，全靠 Web Audio 現場合成
// 筆觸是掃頻的帶通噪聲；吸墨是反著來的；合字是一聲小磬；虎是低吼。
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
  SFX.toggle = function () { this.muted = !this.muted; this.rainSync(); return this.muted; };
  // 雨聲：一段低通噪聲循環，起雨淡入、收雨淡出；靜音或暫停時收起
  SFX.rain = function (on) { this.rainOn = !!on; this.rainSync(); };
  SFX.rainSync = function () {
    const want = this.rainOn && !this.muted && this.ctx;
    if (want && !this.rainNode) {
      try {
        const c = this.ctx; if (c.state === 'suspended') c.resume();
        const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.5;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 1.5);
        src.connect(f); f.connect(g); g.connect(this.out); src.start();
        this.rainNode = { src, g };
      } catch (e) { this.rainNode = null; }
    } else if (!want && this.rainNode) {
      const { src, g } = this.rainNode; this.rainNode = null;
      try { const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); src.stop(t + 1.3); } catch (e) { /* 收不掉也無妨 */ }
    }
  };
  SFX.play = function (fn) {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    try { fn(this.ctx, this.out, this.ctx.currentTime); } catch (e) { /* 音效失敗不影響遊戲 */ }
  };
  // 噪聲 + 帶通掃頻
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
  // 各種獸的聲音（v0.28）：撲咬時一聲，走近八格內先聽見一聲（soft：小聲些）
  function growl(c, out, t, f0, f1, dur, vol, lfoHz, lfoAmt, cut, type) {
    const osc = c.createOscillator(); osc.type = type || 'sawtooth'; osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f1, t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = lfoHz; const lg = c.createGain(); lg.gain.value = lfoAmt; lfo.connect(lg); lg.connect(osc.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f); f.connect(g); g.connect(out); osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  function hiss(c, out, t, dur, vol, lo) {
    const src = c.createBufferSource(); src.buffer = SFX.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = lo || 3800;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.06); g.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.05);
  }
  const BEAST = {
    '虎': (c, o, t, v) => growl(c, o, t, 78, 52, 0.85, 0.5 * v, 16, 10, 320),                                   // 低沉長吼
    '豹': (c, o, t, v) => { growl(c, o, t, 150, 115, 0.38, 0.4 * v, 34, 18, 950); swoosh(c, o, t, 1600, 700, 0.18, 0.12 * v); },   // 短促尖嘯
    '狼': (c, o, t, v) => { const g = c.createGain(); g.gain.value = 1; g.connect(o); tone(c, g, t, 330, 0.5, 0.16 * v, 'sine', 560); tone(c, g, t + 0.45, 560, 0.75, 0.14 * v, 'sine', 400); },   // 拉長的嚎
    '蛇': (c, o, t, v) => hiss(c, o, t, 0.7, 0.22 * v, 4200),                                                   // 嘶——
    '蛛': (c, o, t, v) => { for (let i = 0; i < 7; i++) swoosh(c, o, t + i * 0.035, 3200, 2400, 0.03, 0.1 * v); },   // 細碎的爬動聲
    '豬': (c, o, t, v) => { growl(c, o, t, 120, 95, 0.16, 0.35 * v, 45, 20, 700, 'square'); growl(c, o, t + 0.2, 110, 85, 0.2, 0.32 * v, 45, 20, 700, 'square'); },   // 兩聲哼哼
    '牛': (c, o, t, v) => growl(c, o, t, 140, 105, 1.1, 0.4 * v, 5, 4, 520),                                    // 長長一聲哞
  };
  SFX.beastTypes = Object.keys(BEAST);
  SFX.beast = function (type, soft) {
    const fn = BEAST[type]; if (!fn) { if (!soft) this.tiger(); return; }
    this.play((c, o, t) => fn(c, o, t, soft ? 0.45 : 1));
  };
  SFX.ram = function () { this.play((c, o, t) => { tone(c, o, t, 90, 0.25, 0.4, 'sine', 40); swoosh(c, o, t, 600, 180, 0.22, 0.25); }); };   // 野牛撞磚的悶響
  window.SFX = SFX;
})();
