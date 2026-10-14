// world.js —— 一纸之岛：程序生成的"底稿" + 玩家改动的"差异层" + 火势/演替/复原模拟 + 潮汐、地标、探索迷雾、小路、灶与落囊
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const CH = 16;                 // 区块边长（格）
  const STEP = 0.5;              // 模拟步长（秒）
  const DAY = 240;               // 一昼夜（秒），潮汐随之起落
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];

  class World {
    constructor(seed) {
      this.seed = seed | 0;
      this.chunks = new Map();   // "cx,cy" -> 字符数组（底稿）
      this.diff = new Map();     // "x,y" -> 字（与底稿不同的格子）
      this.burn = new Map();     // "x,y" -> { t: 剩余燃烧秒数, lvl: 火势 }
      this.timers = new Map();   // "x,y" -> { to: 目标字, at: 世界时间 }
      this.stoves = new Map();   // "x,y" -> 灶里剩余的柴火（秒）
      this.bags = new Map();     // "x,y" -> 落在地上的囊（物品列表）
      this.steps = new Map();    // "x,y" -> 走过的次数（走多了就成路）
      this.explored = new Map(); // "cx,cy" -> 位图：哪些格子被看见过
      this.steles = new Map();   // "x,y" -> { teach, hint }
      for (const s of G.stelePlan(this.seed)) this.steles.set(U.key(s.x, s.y), s);
      // 地标：大字占地若干格；村按模板盖印，只有井可读
      const taken = new Set(this.steles.keys());
      this.places = G.placePlan(this.seed, taken);
      this.placeTiles = new Map(); // "x,y" -> { place, ch, big }
      for (const pl of this.places) {
        if (pl.template) {
          pl.template.forEach((row, j) => Array.from(row).forEach((ch, i) => { if (ch === '井') this.placeTiles.set(U.key(pl.x + i, pl.y + j), { place: pl, ch, big: false }); }));
        } else {
          for (let j = 0; j < pl.h; j++) for (let i = 0; i < pl.w; i++) this.placeTiles.set(U.key(pl.x + i, pl.y + j), { place: pl, ch: pl.ch, big: true });
        }
        pl.seen = false;
      }
      this.time = 30;            // 世界时间（秒），从清晨开始
      this.acc = 0; this.seenAcc = 0;
      this.rng = U.mulberry32(this.seed ^ 0x5bd1e995);
      this.onDiscover = null;    // 回调：首次看见某处地标
    }

    chunk(cx, cy) {
      const k = U.key(cx, cy);
      let c = this.chunks.get(k);
      if (c) return c;
      c = new Array(CH * CH);
      const ox = cx * CH, oy = cy * CH;
      for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) c[j * CH + i] = G.baseTile(ox + i, oy + j, this.seed);
      const put = (x, y, ch) => { if (x >= ox && x < ox + CH && y >= oy && y < oy + CH) c[(y - oy) * CH + (x - ox)] = ch; };
      for (const s of this.steles.values()) put(s.x, s.y, '碑');
      for (const pl of this.places) {
        if (pl.template) pl.template.forEach((row, j) => Array.from(row).forEach((ch, i) => put(pl.x + i, pl.y + j, ch)));
        else for (let j = 0; j < pl.h; j++) for (let i = 0; i < pl.w; i++) put(pl.x + i, pl.y + j, pl.ch);
      }
      this.chunks.set(k, c);
      return c;
    }
    base(x, y) {
      const cx = Math.floor(x / CH), cy = Math.floor(y / CH);
      return this.chunk(cx, cy)[(y - cy * CH) * CH + (x - cx * CH)];
    }
    // 潮汐：滩在退潮时是沙，涨潮时是水
    tideLow() { const t = (this.time % DAY) / DAY; return t > 0.12 && t < 0.42; }
    tideName() { return this.tideLow() ? '退潮' : '涨潮'; }
    get(x, y) {
      const d = this.diff.get(U.key(x, y));
      const b = d !== undefined ? d : this.base(x, y);
      return b === '滩' ? (this.tideLow() ? '沙' : '水') : b;
    }
    raw(x, y) { const d = this.diff.get(U.key(x, y)); return d !== undefined ? d : this.base(x, y); }
    info(x, y) { return DB[this.get(x, y)]; }
    set(x, y, ch) {
      const k = U.key(x, y), old = this.get(x, y);
      if (ch === this.base(x, y)) this.diff.delete(k); else this.diff.set(k, ch);
      if (DB[ch].flam <= 0) this.burn.delete(k);
      if (old === '灶' && ch !== '灶') this.stoves.delete(k);
      if (ch === '灶' && !this.stoves.has(k)) this.stoves.set(k, 0);
      if (old === '囊' && ch !== '囊') this.bags.delete(k);
    }
    walkable(x, y) { return this.info(x, y).walk > 0; }
    isBurning(x, y) { return this.burn.has(U.key(x, y)); }
    stele(x, y) { return this.steles.get(U.key(x, y)) || null; }
    placeAt(x, y) { const e = this.placeTiles.get(U.key(x, y)); return e ? e.place : null; }
    isBig(x, y) { const e = this.placeTiles.get(U.key(x, y)); return !!(e && e.big); }
    nearChar(x, y, ch, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (this.get(x + i, y + j) === ch) return true;
      return false;
    }
    // 灶
    stoveFuel(x, y) { return this.stoves.get(U.key(x, y)) || 0; }
    stoveLit(x, y) { return this.get(x, y) === '灶' && this.stoveFuel(x, y) > 0; }
    addFuel(x, y, sec) { const k = U.key(x, y); this.stoves.set(k, Math.min(900, (this.stoves.get(k) || 0) + sec)); }

    // ---------- 探索：看过的格子才会画到地图上 ----------
    seenBits(cx, cy) { const k = U.key(cx, cy); let b = this.explored.get(k); if (!b) { b = new Uint8Array(32); this.explored.set(k, b); } return b; }
    isSeen(x, y) {
      const cx = Math.floor(x / CH), cy = Math.floor(y / CH), b = this.explored.get(U.key(cx, cy));
      if (!b) return false;
      const i = (y - cy * CH) * CH + (x - cx * CH);
      return (b[i >> 3] & (1 << (i & 7))) !== 0;
    }
    markSeen(px, py, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = px + dx, y = py + dy, cx = Math.floor(x / CH), cy = Math.floor(y / CH);
        const i = (y - cy * CH) * CH + (x - cx * CH), b = this.seenBits(cx, cy);
        b[i >> 3] |= (1 << (i & 7));
      }
      for (const pl of this.places) {
        if (pl.seen) continue;
        const cxp = pl.x + (pl.w - 1) / 2, cyp = pl.y + (pl.h - 1) / 2;
        if (Math.hypot(cxp - px, cyp - py) <= r + Math.max(pl.w, pl.h) / 2) { pl.seen = true; if (this.onDiscover) this.onDiscover(pl); }
      }
    }
    revealAll(px, py) { this.markSeen(px, py, 80); }
    seenCount() { let n = 0; for (const b of this.explored.values()) for (const v of b) { let x = v; while (x) { n += x & 1; x >>= 1; } } return n; }
    // 走的人多了，也便成了路
    trample(x, y) {
      const k = U.key(x, y), n = (this.steps.get(k) || 0) + 1;
      this.steps.set(k, n);
      if (n >= 6 && '草土沙花'.indexOf(this.raw(x, y)) >= 0 && !this.placeTiles.has(k)) this.set(x, y, '路');
    }

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

    // 某格附近是否有光（虎怕光）/ 有热（人怕冷）
    lightNear(x, y, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if (d.light > 0 || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j)) return true;
      }
      return false;
    }
    heatNear(x, y, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if (d.kind === 'fire' || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j)) return true;
      }
      return false;
    }

    tick(dt, px, py) {
      this.time += dt;
      this.acc += dt; this.seenAcc += dt;
      if (this.seenAcc >= 0.5) { this.seenAcc = 0; this.markSeen(px, py, 9); }
      while (this.acc >= STEP) { this.acc -= STEP; this.step(px, py); }
    }

    step(px, py) {
      const rng = this.rng;
      // —— 灶里的柴
      for (const [k, f] of this.stoves) { if (f > 0) this.stoves.set(k, Math.max(0, f - STEP)); }
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
      // —— 随机采样演替：每步采样 300 格（约占范围的 10%），所以下面的概率要除以 10 才是每半秒的真实概率
      for (let n = 0; n < 300; n++) {
        const x = px + Math.floor(rng() * 56) - 28, y = py + Math.floor(rng() * 56) - 28;
        const k = U.key(x, y);
        if (!this.diff.has(k)) continue;            // 只有被改动过的格子才会"演替"，底稿本身是稳定的
        const ch = this.diff.get(k);
        if (ch === '土') {
          if (rng() < 0.35 && this.countAround(x, y, '草木林森田竹花果') >= 1) this.set(x, y, '草');
        } else if (ch === '草') {
          if (rng() < 0.12 && this.countAround(x, y, '木林森果') >= 2) this.set(x, y, '木');
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

    // 出生点：从岛心螺旋向外找一块草地/田野
    findSpawn() {
      const good = '草田土沙';
      for (let r = 0; r < 200; r++) {
        for (let i = -r; i <= r; i++) for (const [x, y] of [[i, -r], [i, r], [-r, i], [r, i]]) {
          if (good.indexOf(this.get(x, y)) >= 0 && this.countAround(x, y, '水淼山') === 0 && !this.placeTiles.has(U.key(x, y))) return { x, y };
        }
      }
      return { x: 0, y: 0 };
    }

    // ---------- 存档：只存差异层，世界本身可以从种子重新长出来 ----------
    serialize() {
      const diff = {}; for (const [k, v] of this.diff) diff[k] = v;
      const burn = {}; for (const [k, v] of this.burn) burn[k] = [Math.round(v.t * 10) / 10, v.lvl];
      const timers = {}; for (const [k, v] of this.timers) timers[k] = [v.to, Math.round(v.at)];
      const stoves = {}; for (const [k, v] of this.stoves) stoves[k] = Math.round(v);
      const bags = {}; for (const [k, v] of this.bags) bags[k] = v;
      const explored = {}; for (const [k, b] of this.explored) explored[k] = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
      const seen = this.places.filter(p => p.seen).map(p => p.id);
      return { seed: this.seed, time: Math.round(this.time * 10) / 10, diff, burn, timers, stoves, bags, explored, seen };
    }
    restore(s) {
      this.time = s.time || 30;
      this.diff = new Map(Object.entries(s.diff || {}));
      this.burn = new Map(Object.entries(s.burn || {}).map(([k, v]) => [k, { t: v[0], lvl: v[1] }]));
      this.timers = new Map(Object.entries(s.timers || {}).map(([k, v]) => [k, { to: v[0], at: v[1] }]));
      this.stoves = new Map(Object.entries(s.stoves || {}));
      this.bags = new Map(Object.entries(s.bags || {}));
      this.explored = new Map();
      for (const [k, hex] of Object.entries(s.explored || {})) { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16) || 0; this.explored.set(k, b); }
      const seen = new Set(s.seen || []);
      for (const pl of this.places) pl.seen = seen.has(pl.id);
    }
  }

  root.World = World;
  root.World.CH = CH;
  root.World.DAY = DAY;
})();
