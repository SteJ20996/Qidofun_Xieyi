// world.js —— 一紙之島：程序生成的"底稿" + 玩家改動的"差異層" + 火勢/演替/復原模擬 + 潮汐、地標、探索迷霧、小路、灶與落囊
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const CH = 16;                 // 區塊邊長（格）
  const STEP = 0.5;              // 模擬步長（秒）
  const DAY = 240;               // 一晝夜（秒），潮汐隨之起落
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  // 天氣：雨。一場雨下 RAIN_MIN–RAIN_MAX 秒，停後隔 RAIN_GAP_MIN–RAIN_GAP_MAX 秒再來（真隨機，不走種子）；
  // 下雨時屋外的燈每盞每息有 RAIN_LAMP_P 的真隨機機會被澆壞；ROOM_LIMIT 格內被牆圍得住才算屋裡
  const RAIN_MIN = DAY * 0.25, RAIN_MAX = DAY * 1.0, RAIN_GAP_MIN = DAY * 1.0, RAIN_GAP_MAX = DAY * 4.0, RAIN_LAMP_P = 1 / 1500, ROOM_LIMIT = 121;

  class World {
    constructor(seed) {
      this.seed = seed | 0;
      this.chunks = new Map();   // "cx,cy" -> 字符數組（底稿）
      this.diff = new Map();     // "x,y" -> 字（與底稿不同的格子）
      this.burn = new Map();     // "x,y" -> { t: 剩餘燃燒秒數, lvl: 火勢 }
      this.timers = new Map();   // "x,y" -> { from: 現在的字, to: 目標字, at: 世界時間 }（灰化土、草木長回來）
      this.scarecrows = new Map(); // "x,y" -> 稻草人失效的世界時間
      this.chests = new Map();   // "x,y" -> 櫃裡的東西
      this.nets = new Map();     // 錨點 "x,y" -> { size, x, y, fish, t }：漁網（一乘一、二乘二、三乘三）
      this.netCells = new Map(); // 每一格 -> 錨點
      this.stoves = new Map();   // "x,y" -> 灶裡剩餘的柴火（秒）
      this.bags = new Map();     // "x,y" -> 落在地上的囊（物品列表）
      this.weirs = new Map();    // "x,y" -> 魚梁下一次有魚的時間
      this.steps = new Map();    // "x,y" -> 走過的次數（走多了就成路）
      this.explored = new Map(); // "cx,cy" -> 位圖：哪些格子被看見過
      this.steles = new Map();   // "x,y" -> { teach, hint }
      for (const s of G.stelePlan(this.seed)) this.steles.set(U.key(s.x, s.y), s);
      // 地標：大字佔地若干格；村按模板蓋印，只有井可讀
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
      this.time = 30;            // 世界時間（秒），從清晨開始
      this.acc = 0; this.seenAcc = 0;
      this.rng = U.mulberry32(this.seed ^ 0x5bd1e995);
      this.onDiscover = null;    // 回調：首次看見某處地標
      this.lamps = new Set();    // "x,y"：玩家放的燈（雨會澆壞屋外的）
      this.rainUntil = 0;        // 雨下到幾時（0 = 沒下）
      this.nextRainAt = DAY * 1.5 + U.trueRand() * DAY * 2.5;   // 第一場雨不早於第二日
      this.rainAcc = 0; this.rainLampP = RAIN_LAMP_P;
      this.onWeather = null;     // 回調：雨起（true）／雨停（false）
      this.onLampRuined = null;  // 回調：某盞燈被雨澆壞
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
    // 潮汐：灘在退潮時是沙，漲潮時是水
    tideLow() { const t = (this.time % DAY) / DAY; return t > 0.12 && t < 0.42; }
    tideName() { return this.tideLow() ? '退潮' : '漲潮'; }
    get(x, y) {
      const d = this.diff.get(U.key(x, y));
      const b = d !== undefined ? d : this.base(x, y);
      return b === '灘' ? (this.tideLow() ? '沙' : '水') : b;
    }
    raw(x, y) { const d = this.diff.get(U.key(x, y)); return d !== undefined ? d : this.base(x, y); }
    info(x, y) { return DB[this.get(x, y)]; }
    set(x, y, ch) {
      const k = U.key(x, y), old = this.get(x, y);
      if (ch === this.base(x, y)) this.diff.delete(k); else this.diff.set(k, ch);
      if (DB[ch].flam <= 0) this.burn.delete(k);
      if ((old === '灶' || old === '鼎') && ch !== '灶' && ch !== '鼎') this.stoves.delete(k);
      if ((ch === '灶' || ch === '鼎') && !this.stoves.has(k)) this.stoves.set(k, 0);
      if (old === '包' && ch !== '包') this.bags.delete(k);
      if (old === '偶' && ch !== '偶') this.scarecrows.delete(k);
      if ('網罟罾'.indexOf(old) >= 0 && '網罟罾'.indexOf(ch) < 0 && this.netCells.has(k)) { const rec = this.nets.get(this.netCells.get(k)); if (rec) this.removeNet(rec); }
      if (old === '櫃' && ch !== '櫃') this.chests.delete(k);
      if (ch === '燈') this.lamps.add(k); else if (old === '燈') this.lamps.delete(k);
      if (old === '漁' && ch !== '漁') this.weirs.delete(k);
      if (ch === '漁' && !this.weirs.has(k)) this.weirs.set(k, this.time + 45);
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
    // 幾秒後若格子還是 from，就變成 to（灰化土、草木長回來）
    schedule(x, y, from, to, sec) { this.timers.set(U.key(x, y), { from, to, at: this.time + sec }); }
    // 稻草人：前半三十天十格、後半七格；再放一個續三十天，最多四十天
    addScarecrow(x, y) {
      const k = U.key(x, y), now = this.time, cur = Math.max(now, this.scarecrows.get(k) || 0);
      this.scarecrows.set(k, Math.min(now + 40 * DAY, cur + 30 * DAY));
    }
    scareDays(x, y) { const e = this.scarecrows.get(U.key(x, y)); return e ? Math.max(0, (e - this.time) / DAY) : 0; }
    scared(x, y) {
      for (const [k, e] of this.scarecrows) {
        const days = (e - this.time) / DAY; if (days <= 0) continue;
        const [sx, sy] = U.unkey(k);
        if (U.cheb(x, y, sx, sy) <= (days > 15 ? 10 : 7)) return true;
      }
      return false;
    }
    // 漁網：小網三條九十息一條，中網八條三十息一條，大網二十條十息一條；魚是懶算的
    addNet(x, y, size, now) {
      const key = U.key(x, y), rec = { size, x, y, fish: 0, t: now, under: [] }, ch = size === 1 ? '網' : size === 2 ? '罟' : '罾';
      this.nets.set(key, rec);
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { rec.under.push(this.raw(x + i, y + j)); this.netCells.set(U.key(x + i, y + j), key); this.set(x + i, y + j, ch); }   // 記住網下原本的水，收網時還原
      return rec;
    }
    netAt(x, y) { const a = this.netCells.get(U.key(x, y)); return a ? this.nets.get(a) || null : null; }
    netRule(size) { return size === 1 ? { cap: 3, every: 90 } : size === 2 ? { cap: 8, every: 30 } : { cap: 20, every: 10 }; }
    netFish(rec, now) {
      const r = this.netRule(rec.size), n = Math.floor((now - rec.t) / r.every);
      if (n > 0) { rec.fish = Math.min(r.cap, rec.fish + n); rec.t += n * r.every; }
      if (rec.fish >= r.cap) rec.t = now;
      return rec.fish;
    }
    removeNet(rec) {
      const key = U.key(rec.x, rec.y); this.nets.delete(key);
      for (let j = 0; j < rec.size; j++) for (let i = 0; i < rec.size; i++) {
        const cx = rec.x + i, cy = rec.y + j; this.netCells.delete(U.key(cx, cy));
        const u = rec.under && rec.under[j * rec.size + i], b = this.base(cx, cy);
        this.set(cx, cy, u && u !== '網' && u !== '罟' && u !== '罾' ? u : (DB[b] && DB[b].kind === 'water' ? b : '水'));
      }
    }
    // 灶
    stoveFuel(x, y) { return this.stoves.get(U.key(x, y)) || 0; }
    stoveLit(x, y) { const c = this.get(x, y); return (c === '灶' || c === '鼎') && this.stoveFuel(x, y) > 0; }
    addFuel(x, y, sec) { const k = U.key(x, y); this.stoves.set(k, Math.min(900, (this.stoves.get(k) || 0) + sec)); }

    // ---------- 探索：看過的格子才會畫到地圖上 ----------
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
      if (n >= 6 && '草土沙花礫'.indexOf(this.raw(x, y)) >= 0 && !this.placeTiles.has(k)) this.set(x, y, '路');
    }

    // 點火：可燃格開始燃燒；火字本身也有壽命
    ignite(x, y, lvl) {
      const k = U.key(x, y), d = this.info(x, y);
      if (this.burn.has(k)) return false;
      if (d.kind === 'fire') { this.burn.set(k, { t: d.s * 2.2, lvl: d.s / 4 }); return true; }
      if (d.flam <= 0) return false;
      this.burn.set(k, { t: 5 + d.s * 0.45, lvl: lvl || 1 });
      return true;
    }
    extinguish(x, y) { this.burn.delete(U.key(x, y)); }

    // 某格附近是否有光（虎怕光）/ 有熱（人怕冷）
    lightNear(x, y, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if (d.light > 0 || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j)) return true;
      }
      return false;
    }
    // ---------- 天氣：雨 ----------
    raining() { return this.time < this.rainUntil; }
    passable(x, y) { const d = this.info(x, y); return d.walk > 0 && !d.gate; }   // 門雖能走，算牆
    // 屋裡：從這格四鄰出發順著能走的格子漫延，不可通行的字與門擋住；ROOM_LIMIT 格內圍得住才算屋裡
    covered(x, y) {
      const seen = new Set(), q = [];
      const push = (nx, ny) => { const k = U.key(nx, ny); if (!seen.has(k) && this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } };
      for (const [dx, dy] of N4) push(x + dx, y + dy);
      while (q.length) {
        if (seen.size > ROOM_LIMIT) return false;
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) push(cx + dx, cy + dy);
      }
      return true;
    }
    // 每息一次：屋外的燈各擲一次真隨機，中了就澆壞、消失
    rainLamps() {
      for (const k of Array.from(this.lamps)) {
        const [x, y] = U.unkey(k);
        if (this.get(x, y) !== '燈') { this.lamps.delete(k); continue; }
        if (this.covered(x, y) || U.trueRand() >= this.rainLampP) continue;
        this.set(x, y, '白');
        if (this.onLampRuined) this.onLampRuined(x, y);
      }
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
      // —— 天氣：雨起雨停（真隨機，不走種子）；下雨時每息看一次屋外的燈
      if (this.rainUntil > 0 && this.time >= this.rainUntil) { this.rainUntil = 0; this.nextRainAt = this.time + RAIN_GAP_MIN + U.trueRand() * (RAIN_GAP_MAX - RAIN_GAP_MIN); if (this.onWeather) this.onWeather(false); }
      else if (this.rainUntil <= 0 && this.time >= this.nextRainAt) { this.rainUntil = this.time + RAIN_MIN + U.trueRand() * (RAIN_MAX - RAIN_MIN); if (this.onWeather) this.onWeather(true); }
      if (this.raining()) { this.rainAcc += STEP; while (this.rainAcc >= 1) { this.rainAcc -= 1; this.rainLamps(); } } else this.rainAcc = 0;
      // —— 灶裡的柴
      for (const [k, f] of this.stoves) { if (f > 0) this.stoves.set(k, Math.max(0, f - STEP)); }
      // —— 火勢蔓延
      const spread = [];
      for (const [k, b] of this.burn) {
        const [x, y] = U.unkey(k);
        b.t -= STEP;
        for (const [dx, dy] of N4) {
          const nx = x + dx, ny = y + dy, nd = this.info(nx, ny);
          // 蔓延概率：疏木裡的火大致自限，林與森裡的火才會失控（分支因子 ≈ 1 / 1.4 / 1.7）
          if (nd.flam > 0 && !this.burn.has(U.key(nx, ny)) && rng() < nd.flam * 0.05 * b.lvl) spread.push([nx, ny, b.lvl]);
        }
        if (b.t <= 0) {
          this.burn.delete(k);
          this.set(x, y, '灰');
          this.timers.set(k, { from: '灰', to: '土', at: this.time + 25 + rng() * 25 });
        }
      }
      for (const [x, y, lvl] of spread) this.ignite(x, y, Math.min(lvl, 1.5));
      // —— 定時演化（灰 → 土；取過的草木長回來）
      for (const [k, tm] of this.timers) {
        if (this.time >= tm.at) {
          this.timers.delete(k);
          const [x, y] = U.unkey(k);
          if (this.get(x, y) === (tm.from || '灰') && !this.placeTiles.has(k)) this.set(x, y, tm.to);
        }
      }
      // —— 隨機採樣演替：每步採樣 300 格（約佔範圍的 10%），所以下面的概率要除以 10 才是每半秒的真實概率
      for (let n = 0; n < 300; n++) {
        const x = px + Math.floor(rng() * 56) - 28, y = py + Math.floor(rng() * 56) - 28;
        const k = U.key(x, y);
        if (!this.diff.has(k)) continue;            // 只有被改動過的格子才會"演替"，底稿本身是穩定的
        const ch = this.diff.get(k);
        if (ch === '土') {
          if (rng() < 0.35 && this.countAround(x, y, '草木林森田竹花果棉') >= 1) this.set(x, y, '草');
        } else if (ch === '草') {
          if (rng() < 0.12 && this.countAround(x, y, '木林森果') >= 2) this.set(x, y, '木');
        } else if (ch === '木' && this.base(x, y) === '果') {
          if (rng() < 0.05) this.set(x, y, '果');                       // 摘過的果樹又結果
        } else if (ch === '草' && this.base(x, y) === '棉') {
          if (rng() < 0.05) this.set(x, y, '棉');                       // 採過的棉又開花
        } else if (ch === '木') {
          if (rng() < 0.08 && this.countAround(x, y, '林森') >= 3) this.set(x, y, '林');
        } else if (ch === '白') {
          // 白紙慢慢被天地"寫回"原字——但不會在玩家腳邊突然長出山或水
          if (U.cheb(x, y, px, py) <= 1) continue;
          if (rng() < 0.04 && this.countAround(x, y, null) >= 5) this.set(x, y, this.base(x, y));
        }
      }
    }

    // 統計周圍 8 格中屬於 set 的字數；set 為 null 時統計"非白紙、非水"的格子
    countAround(x, y, set) {
      let n = 0;
      for (const [dx, dy] of N8) {
        const c = this.get(x + dx, y + dy);
        if (set ? set.indexOf(c) >= 0 : (c !== '白' && DB[c].kind !== 'water')) n++;
      }
      return n;
    }

    // 出生點：從島心螺旋向外找一塊草地/田野
    findSpawn() {
      const good = '草田土沙';
      for (let r = 0; r < 200; r++) {
        for (let i = -r; i <= r; i++) for (const [x, y] of [[i, -r], [i, r], [-r, i], [r, i]]) {
          if (good.indexOf(this.get(x, y)) >= 0 && this.countAround(x, y, '水淼山') === 0 && !this.placeTiles.has(U.key(x, y))) return { x, y };
        }
      }
      return { x: 0, y: 0 };
    }

    // ---------- 存檔：只存差異層，世界本身可以從種子重新長出來 ----------
    serialize() {
      const diff = {}; for (const [k, v] of this.diff) diff[k] = v;
      const burn = {}; for (const [k, v] of this.burn) burn[k] = [Math.round(v.t * 10) / 10, v.lvl];
      const timers = {}; for (const [k, v] of this.timers) timers[k] = [v.to, Math.round(v.at), v.from || '灰'];
      const scarecrows = {}; for (const [k, v] of this.scarecrows) scarecrows[k] = Math.round(v);
      const chests = {}; for (const [k, v] of this.chests) chests[k] = v;
      const nets = {}; for (const [k, v] of this.nets) nets[k] = [v.size, v.x, v.y, v.fish, Math.round(v.t), (v.under || []).join('')];
      const stoves = {}; for (const [k, v] of this.stoves) stoves[k] = Math.round(v);
      const bags = {}; for (const [k, v] of this.bags) bags[k] = v;
      const weirs = {}; for (const [k, v] of this.weirs) weirs[k] = Math.round(v);
      const explored = {}; for (const [k, b] of this.explored) explored[k] = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
      const seen = this.places.filter(p => p.seen).map(p => p.id);
      return { seed: this.seed, time: Math.round(this.time * 10) / 10, diff, burn, timers, stoves, bags, weirs, explored, seen, scarecrows, chests, nets, rainUntil: Math.round(this.rainUntil), nextRainAt: Math.round(this.nextRainAt) };
    }
    restore(s) {
      this.time = s.time || 30;
      this.diff = new Map(Object.entries(s.diff || {}));
      this.lamps = new Set(); for (const [k, v] of this.diff) if (v === '燈') this.lamps.add(k);
      this.rainUntil = (s.rainUntil || 0) > this.time ? s.rainUntil : 0;
      this.nextRainAt = s.nextRainAt || (this.time + DAY + U.trueRand() * DAY * 2);
      this.rainAcc = 0;
      this.burn = new Map(Object.entries(s.burn || {}).map(([k, v]) => [k, { t: v[0], lvl: v[1] }]));
      this.timers = new Map(Object.entries(s.timers || {}).map(([k, v]) => [k, { to: v[0], at: v[1], from: v[2] || '灰' }]));
      this.scarecrows = new Map(Object.entries(s.scarecrows || {}));
      this.chests = new Map(Object.entries(s.chests || {}));
      this.nets = new Map(); this.netCells = new Map();
      for (const [k, v] of Object.entries(s.nets || {})) { const rec = { size: v[0], x: v[1], y: v[2], fish: v[3], t: v[4], under: v[5] ? Array.from(v[5]) : [] }; this.nets.set(k, rec); for (let j = 0; j < rec.size; j++) for (let i = 0; i < rec.size; i++) this.netCells.set(U.key(rec.x + i, rec.y + j), k); }
      this.stoves = new Map(Object.entries(s.stoves || {}));
      this.bags = new Map(Object.entries(s.bags || {}));
      this.weirs = new Map(Object.entries(s.weirs || {}));
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
