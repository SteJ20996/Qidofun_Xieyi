// world.js —— 一紙之島：程序生成的"底稿" + 玩家改動的"差異層" + 火勢/演替/復原模擬 + 潮汐、地標、探索迷霧、小路、灶與落囊
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const CH = 16;                 // 區塊邊長（格）
  const STEP = 0.5;              // 模擬步長（秒）
  const DAY = 375;               // 一晝夜（秒），潮汐隨之起落；v0.17 從 240 加長到 300、v0.28 再加四分之一，要跟 game.js 的 DAY 一致
  const STOVE_CAP = 999, SHELF_SLOTS = 4;   // 灶與鼎的火最多存 999 息（v0.21，原 900）；灶的柴架四格
  const NET_DUR = { 1: 30, 2: 90, 3: 240 };   // 漁網的耐久：小中大各能取幾條魚（v0.17.1），取完就破、不再進魚，棉麻加固回滿
  const TIDE_WET = 0.7;          // 灘一天裡有七成時間在水下（退潮 0.12–0.42）；放在灘上的網魚來得慢，間隔除以這個數
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  // 天氣：雨。一場雨下 RAIN_MIN–RAIN_MAX 秒，停後隔 RAIN_GAP_MIN–RAIN_GAP_MAX 秒再來（真隨機，不走種子）；
  // 下雨時屋外的燈每盞每息有 rainLampP 的真隨機機會被澆壞（預設 RAIN_LAMP_P；開局由 game.js 照難度改成 DIFF.*.lampP：簡單 1/4500、一般 1/2500、困難 1/800）；ROOM_LIMIT 格內被磚圍得住才算屋裡
  // 霧障：每日擲 FOG_ROLLS 次、每次 FOG_P 的真隨機機會起一片霧（每日最多兩片，第二日起）；一片 FOG_MIN–FOG_MAX 格、形狀隨機長；
  // 起在玩家 FOG_NEAR 格外的陸地上；放著不管 FOG_LIFE 後自己散
  const FOG_ROLLS = 2, FOG_P = 0.25, FOG_MIN = 8, FOG_MAX = 12, FOG_NEAR = [8, 28], FOG_LIFE = DAY;
  const SEA_FOG_MIN = 6, SEA_FOG_MAX = 10, SEA_FOG_LIFE = 90;   // 蜃吐的海霧：六到十格，九十息就散
  const SHIPS = G.SHIPS;                                        // 船的兩種（孤帆、方舟）：大小、命、船頭首骨格數
  const RAIN_MIN = DAY * 0.25, RAIN_MAX = DAY * 1.0, RAIN_GAP_MIN = DAY * 1.0, RAIN_GAP_MAX = DAY * 4.0, RAIN_LAMP_P = 1 / 2500, ROOM_LIMIT = 121;
  // 小屋：磚與門圍起的小空間，裡面不生生靈、生靈也進不去。多小才算看難度，由 game 透過 roomLimitFor(type) 告訴世界：獸一個門檻、魄一個門檻
  // （簡單 28／18、一般 18／8、困難 10／0，0 ＝ 磚擋不住魄）；MAX_ROOM 是各門檻的最大值，漫延數到這裡就停
  const MAX_ROOM = 28;
  // 霧障會動：每 FOG_STEP 息上下挪一格（v0.19 起間隔六到十四成之間抖動），速度慢；FOG_LIGHT_R 格內有光（燈、火、旺灶、玩家手裡的光）就往反方向躲，沒光就順著自己的風向慢慢飄，風向有慣性、偶爾轉；挪完偶爾換形（尾巴掉一格、前頭長一格）
  const FOG_STEP = 6, FOG_LIGHT_R = 10;

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
      this.shelves = new Map();  // "x,y" -> 灶的柴架：最多四格 [{ n, c }]，存著的燃料點一下就燒
      this.shelfSlots = SHELF_SLOTS; this.stoveCap = STOVE_CAP;
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
      this.fogs = new Map();     // id -> { id, cells: Set("x,y"), until }：霧障
      this.fogCells = new Map(); // "x,y" -> id
      this.fogPlan = [];         // 今天還沒起的霧（世界時間）
      this.fogDay = Math.floor(this.time / DAY);   // 已經擲過的那一日（第一日不起霧）
      this.fogSeq = 0; this.fogP = FOG_P; this.fogStep = FOG_STEP;
      this.playerLit = () => false;   // 回調：玩家手裡（或帽上）有沒有光，霧障躲光用
      this.roomCache = new Map();     // "x,y" -> 圍起來的格數（超過 MAX_ROOM 記 MAX_ROOM+1，磚上門上水裡記 Infinity）；每步與每次改格清掉
      this.roomLimitFor = () => 0;    // 回調：某種生靈被多小的屋子擋住（0 ＝ 擋不住），game 依難度給
      this.onFog = null;         // 回調：起了一片霧
      this.ships = new Map();    // 錨點 "x,y" -> { kind, hp, skulls: [[首骨, 鎮到幾時]…], repairs, cells }：停著的船
      this.shipCells = new Map(); // 船身每一格 -> 錨點
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
      if (this.roomCache.size) this.roomCache.clear();
      if (ch === this.base(x, y)) this.diff.delete(k); else this.diff.set(k, ch);
      if (DB[ch].flam <= 0) this.burn.delete(k);
      if ((old === '灶' || old === '鼎') && ch !== '灶' && ch !== '鼎') this.stoves.delete(k);
      if (old === '灶' && ch !== '灶') this.shelves.delete(k);   // 柴架跟著灶走（拆灶時遊戲端先把它記到囊裡那個灶上）
      if ((ch === '灶' || ch === '鼎') && !this.stoves.has(k)) this.stoves.set(k, 0);
      if (old === '包' && ch !== '包') this.bags.delete(k);
      if (old === '偶' && ch !== '偶') this.scarecrows.delete(k);
      if ('網罟罾'.indexOf(old) >= 0 && '網罟罾'.indexOf(ch) < 0 && this.netCells.has(k)) { const rec = this.nets.get(this.netCells.get(k)); if (rec) this.removeNet(rec); }
      if (old === '櫃' && ch !== '櫃') this.chests.delete(k);
      if (ch === '燈') this.lamps.add(k); else if (old === '燈') this.lamps.delete(k);
      if (old === '舟' && ch !== '舟' && this.shipCells.has(k)) { const ak = this.shipCells.get(k); this.shipCells.delete(k); this.removeShip(ak); }   // 船身一格被改掉，整艘沒了
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
    addNet(x, y, size, now, dur, rf) {   // dur／rf：收回再放的網帶著原本的耐久與加固次數
      const key = U.key(x, y), rec = { size, x, y, fish: 0, t: now, under: [], dur: dur === undefined ? NET_DUR[size] : dur, rf: rf || 0 }, ch = size === 1 ? '網' : size === 2 ? '罟' : '罾';
      this.nets.set(key, rec);
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { rec.under.push(this.raw(x + i, y + j)); this.netCells.set(U.key(x + i, y + j), key); this.set(x + i, y + j, ch); }   // 記住網下原本的水，收網時還原
      rec.tidal = rec.under.indexOf('灘') >= 0;   // 有一格是灘就算灘上的網：魚來得慢三成
      return rec;
    }
    netDur(size) { return NET_DUR[size]; }
    netAt(x, y) { const a = this.netCells.get(U.key(x, y)); return a ? this.nets.get(a) || null : null; }
    netRule(size, tidal) { const r = size === 1 ? { cap: 3, every: 90 } : size === 2 ? { cap: 8, every: 30 } : { cap: 20, every: 10 }; return tidal ? { cap: r.cap, every: Math.round(r.every / TIDE_WET) } : r; }   // 灘上 129／43／14 息一條
    netFish(rec, now) {
      if (rec.dur !== undefined && rec.dur <= 0) { rec.t = now; return rec.fish; }   // 破網不進魚，裡面剩的還拿得走
      const r = this.netRule(rec.size, rec.tidal), n = Math.floor((now - rec.t) / r.every);
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
    addFuel(x, y, sec) { const k = U.key(x, y); this.stoves.set(k, Math.min(STOVE_CAP, (this.stoves.get(k) || 0) + sec)); }
    stoveRoom(x, y) { return STOVE_CAP - this.stoveFuel(x, y); }   // 還能添幾息
    shelf(x, y) { const k = U.key(x, y); if (!this.shelves.has(k)) this.shelves.set(k, []); return this.shelves.get(k); }

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
    revealAll(px, py) { this.markSeen(px, py, G.SEA_EDGE); }
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

    // 兩格之間看不看得見（v0.28）：中間的格子（不算兩端）有擋光的字——磚、門、殘牆——就看不見；窗不擋
    clear(x0, y0, x1, y1) {
      let x = x0, y = y0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      while (true) {
        if (x === x1 && y === y1) return true;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
        if (x === x1 && y === y1) return true;
        const d = this.info(x, y); if (d && d.opaque) return false;
      }
    }
    // 某格附近是否有光（虎怕光）/ 有熱（人怕冷）；磚擋光：屋裡的燈照不出去（v0.28）
    lightNear(x, y, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if ((d.light > 0 || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j)) && this.clear(x + i, y + j, x, y)) return true;
      }
      return false;
    }
    // ---------- 霧障 ----------
    fogAt(x, y) { const id = this.fogCells.get(U.key(x, y)); return id ? this.fogs.get(id) : null; }
    fogLand(x, y) { const d = this.info(x, y); return d.walk > 0 && d.kind !== 'water' && DB[this.raw(x, y)].kind !== 'water'; }
    addFog(cells, until, sea) {
      const id = ++this.fogSeq, f = { id, cells: new Set(cells), until, sea: !!sea, moveAt: this.time + this.fogStep, dir: null };
      this.fogs.set(id, f); for (const k of f.cells) this.fogCells.set(k, id);
      return f;
    }
    removeFog(id) { const f = this.fogs.get(id); if (!f) return; for (const k of f.cells) if (this.fogCells.get(k) === id) this.fogCells.delete(k); this.fogs.delete(id); }
    // 在玩家附近的陸地上長一片霧：從一格起，隨機往四鄰長，有時團成一塊、有時拖成一條、有時分岔
    spawnFog(px, py) {          // 起頭的那格若在小島或橋上長不到五格，換個地方再試（最多六次）
      for (let attempt = 0; attempt < 6; attempt++) { const f = this.growFog(px, py); if (f) return f; }
      this.fogMiss = (this.fogMiss || 0) + 1;   // 六次都起不來：記一筆，測試與除錯用
      return null;
    }
    growFog(px, py) {
      const R = U.trueRand;
      let seed = null;
      for (let i = 0; i < 80 && !seed; i++) {
        const a = R() * Math.PI * 2, r = FOG_NEAR[0] + R() * (FOG_NEAR[1] - FOG_NEAR[0]);
        const x = px + Math.round(Math.cos(a) * r), y = py + Math.round(Math.sin(a) * r);
        if (this.fogLand(x, y) && !this.fogCells.has(U.key(x, y))) seed = [x, y];
      }
      if (!seed) { this.fogNoSeed = (this.fogNoSeed || 0) + 1; return null; }
      const want = FOG_MIN + Math.floor(R() * (FOG_MAX - FOG_MIN + 1));
      const mode = R(), dir = N4[Math.floor(R() * 4)];   // mode < 0.4 團；< 0.75 拖成一條；其餘分岔
      const cells = [seed], have = new Set([U.key(seed[0], seed[1])]);
      for (let tries = 0; tries < 400 && cells.length < want; tries++) {
        const from = mode < 0.4 ? cells[Math.floor(R() * cells.length)] : mode < 0.75 ? cells[cells.length - 1 - Math.floor(R() * Math.min(3, cells.length))] : cells[Math.floor(R() * R() * cells.length)];
        const d = mode >= 0.4 && mode < 0.75 && R() < 0.6 ? dir : N4[Math.floor(R() * 4)];
        const nx = from[0] + d[0], ny = from[1] + d[1], k = U.key(nx, ny);
        if (have.has(k) || this.fogCells.has(k) || !this.fogLand(nx, ny) || (Math.abs(nx - px) <= 1 && Math.abs(ny - py) <= 1)) continue;
        have.add(k); cells.push([nx, ny]);
      }
      if (cells.length < 5) return null;
      const f = this.addFog(have, this.time + FOG_LIFE);
      if (this.onFog) this.onFog(f);
      return f;
    }
    // 蜃吐霧：在蜃與玩家之間的海面上長一片海霧（只蓋水，不蓋船、網、陸地）
    fogSea(x, y) { return DB[this.get(x, y)].kind === 'water' && DB[this.raw(x, y)].kind === 'water'; }
    spawnSeaFog(mx, my, px, py) {
      const R = U.trueRand, dx = Math.sign(px - mx), dy = Math.sign(py - my);
      let seed = null;
      for (let i = 0; i < 30 && !seed; i++) {
        const t = 2 + Math.floor(R() * 4), x = mx + dx * t + Math.round((R() - 0.5) * 4), y = my + dy * t + Math.round((R() - 0.5) * 4);
        if (this.fogSea(x, y) && !this.fogCells.has(U.key(x, y)) && !(x === px && y === py)) seed = [x, y];
      }
      if (!seed) return null;
      const want = SEA_FOG_MIN + Math.floor(R() * (SEA_FOG_MAX - SEA_FOG_MIN + 1)), cells = [seed], have = new Set([U.key(seed[0], seed[1])]);
      for (let tries = 0; tries < 200 && cells.length < want; tries++) {
        const from = cells[Math.floor(R() * cells.length)], d = N4[Math.floor(R() * 4)], nx = from[0] + d[0], ny = from[1] + d[1], k = U.key(nx, ny);
        if (have.has(k) || this.fogCells.has(k) || !this.fogSea(nx, ny) || (nx === px && ny === py)) continue;
        have.add(k); cells.push([nx, ny]);
      }
      if (cells.length < 3) return null;
      return this.addFog(have, this.time + SEA_FOG_LIFE, true);
    }
    // ---------- 船 ----------
    shipAt(x, y) { const ak = this.shipCells.get(U.key(x, y)); return ak ? this.ships.get(ak) || null : null; }
    shipFootprint(kind, ax, ay) { return (SHIPS[kind] || SHIPS['孤帆']).off.map(([dx, dy]) => [ax + dx, ay + dy]); }
    shipFits(kind, ax, ay, ok) { return this.shipFootprint(kind, ax, ay).every(([x, y]) => ok(x, y)); }
    addShip(ax, ay, rec) {              // 把船停在錨點：船身每格寫成「舟」
      const cells = this.shipFootprint(rec.kind, ax, ay), ak = U.key(ax, ay);
      rec.cells = cells; this.ships.set(ak, rec);
      for (const [x, y] of cells) { this.shipCells.set(U.key(x, y), ak); this.set(x, y, '舟'); }
      return rec;
    }
    removeShip(ak) {                    // 船開走或毀了：船身還原成底下的水
      const rec = this.ships.get(ak); if (!rec) return null;
      this.ships.delete(ak);
      for (const [x, y] of rec.cells) { const k = U.key(x, y); if (this.shipCells.get(k) === ak) { this.shipCells.delete(k); const b = this.base(x, y); if (this.get(x, y) === '舟') this.set(x, y, DB[b] && DB[b].kind === 'water' ? b : '水'); } }
      return rec;
    }
    shipCenter(rec) { let sx = 0, sy = 0; for (const [x, y] of rec.cells) { sx += x; sy += y; } return { x: sx / rec.cells.length + 0.5, y: sy / rec.cells.length + 0.5 }; }
    fogCenter(f) { let sx = 0, sy = 0; for (const k of f.cells) { const [x, y] = U.unkey(k); sx += x; sy += y; } return { x: sx / f.cells.size, y: sy / f.cells.size }; }
    // 最近的光：地上的燈、火場、旺灶，r 格內找最近的一處
    nearestLight(x, y, r) {
      let best = null;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if (!(d.light > 0 || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j))) continue;
        const dist = Math.hypot(i, j); if (!best || dist < best.d) best = { x: x + i, y: y + j, d: dist };
      }
      return best;
    }
    // 霧障挪一格：FOG_LIGHT_R 格內有光就往反方向躲（燈火、旺灶、手裡有光的玩家，取最近的）；沒光就順著自己的風向飄。
    // v0.19 改得自然些：八個方向（含斜角）、風向 f.ang 有慣性（每步微轉、偶爾大轉、卡住就掉頭）、走過的方向會拉動風向；挪完有一半機會換形（morphFog）。
    moveFog(f, px, py) {
      const c = this.fogCenter(f), R = U.trueRand;
      let src = this.nearestLight(Math.round(c.x), Math.round(c.y), FOG_LIGHT_R);
      if (this.playerLit()) { const d = Math.hypot(px - c.x, py - c.y); if (d <= FOG_LIGHT_R && (!src || d < src.d)) src = { x: px, y: py, d }; }
      if (src) f.ang = Math.atan2(c.y - src.y, c.x - src.x) + (R() - 0.5) * 0.5;      // 背光，略帶偏
      else if (typeof f.ang !== 'number') f.ang = R() * Math.PI * 2;
      else f.ang += (R() - 0.5) * (R() < 0.15 ? 2.4 : 0.7);                             // 風向慢慢轉，偶爾大轉
      const ux = Math.cos(f.ang), uy = Math.sin(f.ang), dot = (d) => (d[0] * ux + d[1] * uy) / Math.hypot(d[0], d[1]);
      const order = N8.slice().sort((a, b) => dot(b) - dot(a));
      const ok = f.sea ? (x, y) => this.fogSea(x, y) : (x, y) => this.fogLand(x, y);
      let moved = false;
      for (const [dx, dy] of order) {
        const next = [];
        let fits = true;
        for (const k of f.cells) {
          const [x, y] = U.unkey(k), nx = x + dx, ny = y + dy, nk = U.key(nx, ny), other = this.fogCells.get(nk);
          if (!ok(nx, ny) || (other && other !== f.id)) { fits = false; break; }
          next.push(nk);
        }
        if (!fits) continue;
        for (const k of f.cells) if (this.fogCells.get(k) === f.id) this.fogCells.delete(k);
        f.cells = new Set(next); for (const k of f.cells) this.fogCells.set(k, f.id);
        f.dir = [dx, dy]; const l = Math.hypot(dx, dy); f.ang = Math.atan2(uy + dy / l, ux + dx / l);   // 實際走的方向把風向拉一拉
        moved = true; break;
      }
      if (!moved) f.ang += Math.PI * (0.5 + R() * 0.5);      // 哪邊都挪不動：掉頭
      if (R() < 0.5) this.morphFog(f, ok);
      return moved;
    }
    // 換形：最背著風向、只連著一格的尾巴掉一格，順著風向的邊上長一格；格數不變、仍連著、不踩別的霧
    morphFog(f, ok) {
      if (f.cells.size < 4) return false;
      const R = U.trueRand, c = this.fogCenter(f), ux = Math.cos(f.ang), uy = Math.sin(f.ang), cells = [...f.cells].map(k => U.unkey(k));
      const has = (x, y) => f.cells.has(U.key(x, y)), along = (x, y) => (x - c.x) * ux + (y - c.y) * uy;
      const deg = (x, y) => N4.reduce((n, [dx, dy]) => n + (has(x + dx, y + dy) ? 1 : 0), 0);
      const tails = cells.filter(([x, y]) => deg(x, y) === 1).sort((a, b) => along(a[0], a[1]) - along(b[0], b[1]));
      if (!tails.length) return false;
      const tail = tails[0], front = [];
      for (const [x, y] of cells) for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (has(nx, ny) || !ok(nx, ny) || this.fogCells.has(U.key(nx, ny)) || along(nx, ny) <= 0.05) continue;
        if (Math.abs(nx - tail[0]) + Math.abs(ny - tail[1]) === 1 && deg(nx, ny) === 1) continue;   // 只靠尾巴連著的不長
        front.push([nx, ny]);
      }
      if (!front.length) return false;
      const [gx, gy] = front[Math.floor(R() * front.length)], tk = U.key(tail[0], tail[1]), gk = U.key(gx, gy);
      f.cells.delete(tk); if (this.fogCells.get(tk) === f.id) this.fogCells.delete(tk);
      f.cells.add(gk); this.fogCells.set(gk, f.id);
      return true;
    }

    // ---------- 天氣：雨 ----------
    raining() { return this.time < this.rainUntil; }
    passable(x, y) { const d = this.info(x, y); return d.walk > 0 && !d.gate; }   // 門雖能走，算磚
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
    // 圍住這格的屋子的四面（v0.28，算窗佔幾成）：從這格順著能走的格子漫延，碰到的不能走的格子就是四面，"x,y" -> 字；ROOM_LIMIT 格內圍不住回 null
    roomShell(x, y) {
      const seen = new Set([U.key(x, y)]), q = [[x, y]], shell = new Map();
      while (q.length) {
        if (seen.size > ROOM_LIMIT) return null;
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k) || shell.has(k)) continue; if (this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } else shell.set(k, this.get(nx, ny)); }
      }
      return shell;
    }
    // 小屋：從這格順著能走的格子四向漫延（門算磚），數圍起來有幾格；超過 MAX_ROOM 就回 MAX_ROOM+1，磚上、門上、水裡回 Infinity
    roomSize(x, y) {
      const k0 = U.key(x, y), hit = this.roomCache.get(k0);
      if (hit !== undefined) return hit;
      if (!this.passable(x, y)) { this.roomCache.set(k0, Infinity); return Infinity; }
      const seen = new Set([k0]), q = [[x, y]];
      let size = 0;
      while (q.length) {
        if (seen.size > MAX_ROOM) { size = MAX_ROOM + 1; break; }
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (!seen.has(k) && this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } }
      }
      if (!size) { size = seen.size; for (const k of seen) this.roomCache.set(k, size); }   // 同一間屋裡的格子一起記下
      else this.roomCache.set(k0, size);
      return size;
    }
    // 這格是不是「某種生靈進不來」的小屋裡：門檻由難度決定（type 是生靈的字；魄另一個門檻）
    sheltered(x, y, type) { const lim = this.roomLimitFor(type); return lim > 0 && this.roomSize(x, y) <= lim; }
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
      // —— 霧障：到時的先起；換日擲兩次；放了一日的自己散
      for (let i = this.fogPlan.length - 1; i >= 0; i--) if (this.time >= this.fogPlan[i]) { this.fogPlan.splice(i, 1); this.spawnFog(px, py); }
      const today = Math.floor(this.time / DAY);
      if (today !== this.fogDay) {
        this.fogDay = today;
        for (let i = 0; i < FOG_ROLLS; i++) if (U.trueRand() < this.fogP) this.fogPlan.push(today * DAY + U.trueRand() * DAY);
      }
      for (const [id, f] of this.fogs) if (this.time >= f.until) this.removeFog(id);
      for (const f of this.fogs.values()) if (this.time >= f.moveAt) { f.moveAt = this.time + this.fogStep * (0.6 + U.trueRand() * 0.8); this.moveFog(f, px, py); }   // 霧障慢慢挪（間隔有快有慢），躲著光
      this.roomCache.clear();
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
      const shelves = {}; for (const [k, v] of this.shelves) if (v.length) shelves[k] = v.map(s => [s.n, s.c]);
      const nets = {}; for (const [k, v] of this.nets) nets[k] = [v.size, v.x, v.y, v.fish, Math.round(v.t), (v.under || []).join(''), v.dur === undefined ? NET_DUR[v.size] : v.dur, v.rf || 0];
      const stoves = {}; for (const [k, v] of this.stoves) stoves[k] = Math.round(v);
      const bags = {}; for (const [k, v] of this.bags) bags[k] = v;
      const weirs = {}; for (const [k, v] of this.weirs) weirs[k] = Math.round(v);
      const explored = {}; for (const [k, b] of this.explored) explored[k] = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
      const seen = this.places.filter(p => p.seen).map(p => p.id);
      return { seed: this.seed, time: Math.round(this.time * 10) / 10, diff, burn, timers, stoves, shelves, bags, weirs, explored, seen, scarecrows, chests, nets, rainUntil: Math.round(this.rainUntil), nextRainAt: Math.round(this.nextRainAt),
        fogs: [...this.fogs.values()].map(f => [Math.round(f.until), [...f.cells].join(';'), f.sea ? 1 : 0]), fogPlan: this.fogPlan.map(Math.round), fogDay: this.fogDay,
        ships: Object.fromEntries([...this.ships].map(([k, v]) => [k, { kind: v.kind, hp: Math.round(v.hp), skulls: (v.skulls || []).map(([n, e]) => [n, Math.round(e)]), repairs: v.repairs || 0, cells: v.cells }])) };
    }
    restore(s) {
      this.time = s.time || 30;
      this.diff = new Map(Object.entries(s.diff || {}));
      this.lamps = new Set(); for (const [k, v] of this.diff) if (v === '燈') this.lamps.add(k);
      this.rainUntil = (s.rainUntil || 0) > this.time ? s.rainUntil : 0;
      this.nextRainAt = s.nextRainAt || (this.time + DAY + U.trueRand() * DAY * 2);
      this.rainAcc = 0;
      this.fogs = new Map(); this.fogCells = new Map(); this.fogSeq = 0;
      for (const [until, cells, sea] of s.fogs || []) if (until > this.time && cells) this.addFog(cells.split(';'), until, sea);
      this.ships = new Map(); this.shipCells = new Map();
      for (const [k, v] of Object.entries(s.ships || {})) {
        if (Array.isArray(v)) {        // v0.11 的單格大船：當孤帆，船身找得到第二格水就留，找不到就沒了
          const [ax, ay] = U.unkey(k), old = { kind: '孤帆', hp: Math.min(v[0], SHIPS['孤帆'].hp), skulls: v[2] && v[1] > this.time ? [[v[2], v[1]]] : [], repairs: 0 };
          const water = (x, y) => { const t = this.get(x, y); return DB[t].kind === 'water' || t === '舟'; };
          const anchor = [[ax, ay], [ax, ay - 1]].find(([x, y]) => this.shipFits('孤帆', x, y, water));
          if (anchor) this.addShip(anchor[0], anchor[1], old); else { const b = this.base(ax, ay); this.set(ax, ay, DB[b].kind === 'water' ? b : '水'); }
          continue;
        }
        const rec = { kind: SHIPS[v.kind] ? v.kind : '孤帆', hp: v.hp, skulls: (v.skulls || []).filter(x => x[1] > this.time), repairs: v.repairs || 0, cells: v.cells };
        this.ships.set(k, rec); for (const [x, y] of rec.cells) this.shipCells.set(U.key(x, y), k);
      }
      for (const [k, v] of this.diff) if (v === '舟' && !this.shipCells.has(k)) { const [x, y] = U.unkey(k), b = this.base(x, y); this.set(x, y, DB[b].kind === 'water' ? b : '水'); }   // 沒有記錄的舟字：還原成水
      this.fogPlan = (s.fogPlan || []).filter(t => typeof t === 'number');
      this.fogDay = typeof s.fogDay === 'number' ? s.fogDay : Math.floor(this.time / DAY);
      this.burn = new Map(Object.entries(s.burn || {}).map(([k, v]) => [k, { t: v[0], lvl: v[1] }]));
      this.timers = new Map(Object.entries(s.timers || {}).map(([k, v]) => [k, { to: v[0], at: v[1], from: v[2] || '灰' }]));
      this.scarecrows = new Map(Object.entries(s.scarecrows || {}));
      this.chests = new Map(Object.entries(s.chests || {}));
      this.shelves = new Map(Object.entries(s.shelves || {}).map(([k, v]) => [k, v.map(([n, c]) => ({ n, c }))]));
      this.nets = new Map(); this.netCells = new Map();
      for (const [k, v] of Object.entries(s.nets || {})) { const rec = { size: v[0], x: v[1], y: v[2], fish: v[3], t: v[4], under: v[5] ? Array.from(v[5]) : [], dur: v[6] === undefined ? NET_DUR[v[0]] : v[6], rf: v[7] || 0 }; rec.tidal = rec.under.indexOf('灘') >= 0; this.nets.set(k, rec); for (let j = 0; j < rec.size; j++) for (let i = 0; i < rec.size; i++) this.netCells.set(U.key(rec.x + i, rec.y + j), k); }
      this.stoves = new Map(Object.entries(s.stoves || {}));
      this.bags = new Map(Object.entries(s.bags || {}));
      this.weirs = new Map(Object.entries(s.weirs || {}));
      this.explored = new Map();
      for (const [k, hex] of Object.entries(s.explored || {})) { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16) || 0; this.explored.set(k, b); }
      const seen = new Set(s.seen || []);
      for (const pl of this.places) pl.seen = seen.has(pl.id);
    }
  }

  World.SHIPS = SHIPS;
  World.newShip = (kind) => ({ kind: SHIPS[kind] ? kind : '孤帆', hp: (SHIPS[kind] || SHIPS['孤帆']).hp, skulls: [], repairs: 0 });
  root.World = World;
  root.World.CH = CH;
  root.World.DAY = DAY;
})();
