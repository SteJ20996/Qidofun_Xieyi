// world.js —— 无限分块世界：程序生成的"底稿" + 玩家改动的"差异层" + 火势/演替/复原模拟
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const CH = 16;                 // 区块边长（格）
  const STEP = 0.5;              // 模拟步长（秒）
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];

  class World {
    constructor(seed) {
      this.seed = seed | 0;
      this.chunks = new Map();   // "cx,cy" -> 字符数组（底稿）
      this.diff = new Map();     // "x,y" -> 字（与底稿不同的格子）
      this.burn = new Map();     // "x,y" -> { t: 剩余燃烧秒数, lvl: 火势 }
      this.timers = new Map();   // "x,y" -> { to: 目标字, at: 世界时间 }
      this.steles = new Map();   // "x,y" -> 提示索引
      this.time = 30;            // 世界时间（秒），从清晨开始
      this.acc = 0;
      this.rng = U.mulberry32(this.seed ^ 0x5bd1e995);
      this.onChange = null;      // 回调：格子被模拟改变时通知（用于渲染缓存等）
    }

    chunk(cx, cy) {
      const k = U.key(cx, cy);
      let c = this.chunks.get(k);
      if (c) return c;
      c = new Array(CH * CH);
      const ox = cx * CH, oy = cy * CH;
      for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) c[j * CH + i] = G.baseTile(ox + i, oy + j, this.seed);
      const st = G.steleFor(cx, cy, this.seed, CH);
      if (st) {
        const idx = st.ly * CH + st.lx, d = DB[c[idx]];
        if (d.walk > 0 && d.kind !== 'water') { c[idx] = '碑'; this.steles.set(U.key(ox + st.lx, oy + st.ly), st.hint); }
      }
      this.chunks.set(k, c);
      return c;
    }
    base(x, y) {
      const cx = Math.floor(x / CH), cy = Math.floor(y / CH);
      return this.chunk(cx, cy)[(y - cy * CH) * CH + (x - cx * CH)];
    }
    get(x, y) { const d = this.diff.get(U.key(x, y)); return d !== undefined ? d : this.base(x, y); }
    info(x, y) { return DB[this.get(x, y)]; }
    set(x, y, ch) {
      const k = U.key(x, y);
      if (ch === this.base(x, y)) this.diff.delete(k); else this.diff.set(k, ch);
      if (DB[ch].flam <= 0) this.burn.delete(k);
      if (this.onChange) this.onChange(x, y, ch);
    }
    walkable(x, y) { return this.info(x, y).walk > 0; }
    isBurning(x, y) { return this.burn.has(U.key(x, y)); }
    steleHint(x, y) { const i = this.steles.get(U.key(x, y)); return i === undefined ? null : G.HINTS[i]; }

    // 点火：可燃格开始燃烧；火字本身也有寿命
    ignite(x, y, lvl) {
      const k = U.key(x, y), d = this.info(x, y);
      if (this.burn.has(k)) return false;
      if (d.kind === 'fire') { this.burn.set(k, { t: d.s * 2.2, lvl: d.s / 4 }); return true; }
      if (d.flam <= 0) return false;
      this.burn.set(k, { t: 5 + d.s * 0.45, lvl: lvl || 1 });
      return true;
    }
    extinguish(x, y) { this.burn.delete(U.key(x, y)); }

    // 夜里/白天通用：某格附近是否有光（虎怕光）
    lightNear(x, y, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if (d.light > 0 || this.isBurning(x + i, y + j)) return true;
      }
      return false;
    }

    tick(dt, px, py) {
      this.time += dt;
      this.acc += dt;
      while (this.acc >= STEP) { this.acc -= STEP; this.step(px, py); }
    }

    step(px, py) {
      const rng = this.rng;
      // —— 火势蔓延
      const spread = [];
      for (const [k, b] of this.burn) {
        const [x, y] = U.unkey(k);
        b.t -= STEP;
        for (const [dx, dy] of N4) {
          const nx = x + dx, ny = y + dy, nd = this.info(nx, ny);
          // 蔓延概率：疏木里的火大致自限，林与森里的火才会失控（分支因子 ≈ 1 / 1.4 / 1.7）
          if (nd.flam > 0 && !this.burn.has(U.key(nx, ny)) && rng() < nd.flam * 0.05 * b.lvl) spread.push([nx, ny, b.lvl]);
        }
        if (b.t <= 0) {
          this.burn.delete(k);
          this.set(x, y, '灰');
          this.timers.set(k, { to: '土', at: this.time + 25 + rng() * 25 });
        }
      }
      for (const [x, y, lvl] of spread) this.ignite(x, y, Math.min(lvl, 1.5));
      // —— 定时演化（灰 → 土）
      for (const [k, tm] of this.timers) {
        if (this.time >= tm.at) {
          this.timers.delete(k);
          const [x, y] = U.unkey(k);
          if (this.get(x, y) === '灰') this.set(x, y, tm.to);
        }
      }
      // —— 随机采样演替：只在玩家附近采样，省算力
      // 每步采样 300 格（约占范围的 10%），所以下面的概率要除以 10 才是每半秒的真实概率
      for (let n = 0; n < 300; n++) {
        const x = px + Math.floor(rng() * 56) - 28, y = py + Math.floor(rng() * 56) - 28;
        const k = U.key(x, y);
        if (!this.diff.has(k)) continue;            // 只有被改动过的格子才会"演替"，底稿本身是稳定的
        const ch = this.diff.get(k);
        if (ch === '土') {
          if (rng() < 0.35 && this.countAround(x, y, '草木林森田竹花') >= 1) this.set(x, y, '草');
        } else if (ch === '草') {
          if (rng() < 0.12 && this.countAround(x, y, '木林森') >= 2) this.set(x, y, '木');
        } else if (ch === '木') {
          if (rng() < 0.08 && this.countAround(x, y, '林森') >= 3) this.set(x, y, '林');
        } else if (ch === '白') {
          // 白纸慢慢被天地"写回"原字——但不会在玩家脚边突然长出山或水
          if (U.cheb(x, y, px, py) <= 1) continue;
          if (rng() < 0.04 && this.countAround(x, y, null) >= 5) this.set(x, y, this.base(x, y));
        }
      }
    }

    // 统计周围 8 格中属于 set 的字数；set 为 null 时统计"非白纸、非水"的格子
    countAround(x, y, set) {
      let n = 0;
      for (const [dx, dy] of N8) {
        const c = this.get(x + dx, y + dy);
        if (set ? set.indexOf(c) >= 0 : (c !== '白' && DB[c].kind !== 'water')) n++;
      }
      return n;
    }

    // 出生点：从原点螺旋向外找一块草地/田野
    findSpawn() {
      const good = '草田土沙';
      for (let r = 0; r < 200; r++) {
        for (let i = -r; i <= r; i++) for (const [x, y] of [[i, -r], [i, r], [-r, i], [r, i]]) {
          if (good.indexOf(this.get(x, y)) >= 0 && this.countAround(x, y, '水淼山') === 0) return { x, y };
        }
      }
      return { x: 0, y: 0 };
    }

    // ---------- 存档：只存差异层，世界本身可以从种子重新长出来 ----------
    serialize() {
      const diff = {}; for (const [k, v] of this.diff) diff[k] = v;
      const burn = {}; for (const [k, v] of this.burn) burn[k] = [Math.round(v.t * 10) / 10, v.lvl];
      const timers = {}; for (const [k, v] of this.timers) timers[k] = [v.to, Math.round(v.at)];
      return { seed: this.seed, time: Math.round(this.time * 10) / 10, diff, burn, timers };
    }
    restore(s) {
      this.time = s.time || 30;
      this.diff = new Map(Object.entries(s.diff || {}));
      this.burn = new Map(Object.entries(s.burn || {}).map(([k, v]) => [k, { t: v[0], lvl: v[1] }]));
      this.timers = new Map(Object.entries(s.timers || {}).map(([k, v]) => [k, { to: v[0], at: v[1] }]));
    }
  }

  root.World = World;
  root.World.CH = CH;
})();
