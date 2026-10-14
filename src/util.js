// util.js —— 基础工具：整数哈希、可复现随机数、梯度噪声 (fbm)
// 所有模块都挂在全局对象上（浏览器是 window，Node 测试时是 globalThis），不需要打包器。
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = {};

  // 二维整数哈希 → 32 位无符号整数。世界的一切"随机"都由 (x, y, seed) 决定，因此可以无限、可复现。
  U.hash2 = function (x, y, seed) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  };
  U.rand2 = (x, y, seed) => U.hash2(x, y, seed) / 4294967296; // [0, 1)

  // mulberry32：小而快的可播种随机数发生器
  U.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.lerp = (a, b, t) => a + (b - a) * t;
  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.smoothstep = (e0, e1, x) => { const t = U.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  U.key = (x, y) => x + ',' + y;
  U.unkey = (k) => { const i = k.indexOf(','); return [parseInt(k.slice(0, i), 10), parseInt(k.slice(i + 1), 10)]; };
  U.cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  // 经典 Perlin 风格梯度噪声，输出约在 [-0.71, 0.71]
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function grad(ix, iy, seed, dx, dy) {
    const a = (U.hash2(ix, iy, seed) & 0xffff) / 65536 * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  }
  U.noise2 = function (x, y, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const u = fade(fx), v = fade(fy);
    const n00 = grad(x0, y0, seed, fx, fy);
    const n10 = grad(x0 + 1, y0, seed, fx - 1, fy);
    const n01 = grad(x0, y0 + 1, seed, fx, fy - 1);
    const n11 = grad(x0 + 1, y0 + 1, seed, fx - 1, fy - 1);
    return U.lerp(U.lerp(n00, n10, u), U.lerp(n01, n11, u), v);
  };

  // 分形布朗运动：叠加多个八度，归一化到 [0, 1]，中心约 0.5
  U.fbm = function (x, y, seed, octaves, lac, gain) {
    octaves = octaves || 4; lac = lac || 2.0; gain = gain || 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * U.noise2(x * freq + i * 17.3, y * freq - i * 11.7, seed + i * 101);
      norm += amp; amp *= gain; freq *= lac;
    }
    return U.clamp((sum / norm) / 0.62 * 0.5 + 0.5, 0, 1);
  };

  root.U = U;
})();
