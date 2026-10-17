// world.js —— 一紙之島：程序生成的"底稿" + 玩家改動的"差異層" + 火勢/演替/復原模擬 + 潮汐、地標、探索迷霧、小路、灶與落囊
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const CH = 16;                 // 區塊邊長（格）
  const STEP = 0.5;              // 模擬步長（秒）
  const DAY = 300;               // 一晝夜（秒），潮汐隨之起落；v0.29 回到三百秒、一日從午夜算起（天亮 0.25、天黑 0.75），要跟 game.js 的 DAY 一致
  const MORNING = 0.26;
  // 牆的耐久（v0.29，不顯示，只計算）：野牛撞一下扣 1。磚 4，撞到剩一半就成了「墟」；墟（村裡的殘垣也是）2；窗、門 2，剩一半時字變色
  const WALL_HP = { '磚': 4, '墟': 2, '窗': 2, '門': 2 };          // 開局、讀舊存檔時的時刻：大清早（天亮之後一點點）
  const STOVE_CAP = 999, SHELF_SLOTS = 4;   // 灶與鼎的火最多存 999 息（v0.21，原 900）；灶的柴架四格
  const NET_DUR = { 1: 30, 2: 90, 3: 240 };   // 漁網的耐久：小中大各能取幾條魚（v0.17.1），取完就破、不再進魚，棉麻加固回滿
  const TIDE_WET = 0.7;          // 灘一天裡有七成時間在水下（退潮 0.12–0.42）；放在灘上的網魚來得慢，間隔除以這個數
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  // 天氣：雨。一場雨下 RAIN_MIN–RAIN_MAX 秒，停後隔 RAIN_GAP_MIN–RAIN_GAP_MAX 秒再來（真隨機，不走種子）；
  // 下雨時屋外的燈每盞每息有 rainLampP 的真隨機機會被澆壞（預設 RAIN_LAMP_P；開局由 game.js 照難度改成 DIFF.*.lampP：簡單 1/4500、一般 1/2500、困難 1/800）；ROOM_LIMIT 格內被磚圍得住才算屋裡
  // 霧障：每日擲 FOG_ROLLS 次、每次 FOG_P 的真隨機機會起一片霧（每日最多兩片，第二日起）；一片 FOG_MIN–FOG_MAX 格、形狀隨機長；
  // 起在玩家 FOG_NEAR 格外的陸地上；放著不管 FOG_LIFE 後自己散
  const FOG_ROLLS = 2, FOG_P = 0.25, FOG_NEAR = [8, 28], FOG_LIFE = DAY;
  const SEA_FOG_LIFE = 90;   // 蜃吐的海霧：九十息就散
  // 霧的形（v0.31 使用者定）：一片霧是一塊連續的形，面積十八格上下（FOG_AREA），可圓可方（超橢圓的次方 2–6）、扁圓不一、斜著放，
  // 邊上再疊兩三道慢慢轉的起伏，次方、扁圓、角度也慢慢變，所以形狀一直在變。蓋到一格超過 FOG_COVER（5%）就算霧，最多算 FOG_CAP（30）格（蓋得最多的那些）。
  // 霧不進圍起來、裡面能走的格子不超過 FOG_ROOM（45）格的屋子；其餘山、海、林都飄得過去，不回頭（v0.32 使用者定）。
  // 碰到這種屋子，被擋掉的那一塊撐到屋外別處（形變了、面積不變，最多撐到 FOG_GROW_MAX 倍），方向也拐開繞過去。海霧的面積是 SEA_FOG_AREA。
  const FOG_AREA = [16, 20], SEA_FOG_AREA = [6, 10], FOG_COVER = 0.05, FOG_CAP = 30, FOG_ROOM = 45, FOG_SAMPLE = 5, FOG_GROW_MAX = 6, FOG_EDGE = 8;
  const SUPER_K = (() => {   // 超橢圓 |x|^n + |y|^n = 1 的面積，n = 2.0、2.1 … 6.0（n=2 是 π，越方越近 4）
    const t = []; for (let i = 0; i <= 40; i++) { const n = 2 + i / 10; let a = 0; const M = 720; for (let j = 0; j < M; j++) { const ph = (j + 0.5) / M * Math.PI * 2, r = Math.pow(Math.pow(Math.abs(Math.cos(ph)), n) + Math.pow(Math.abs(Math.sin(ph)), n), -1 / n); a += r * r; } t.push(a * Math.PI / M); }
    return (n) => { const f = (U.clamp(n, 2, 6) - 2) * 10, i = Math.min(39, Math.floor(f)); return t[i] + (t[i + 1] - t[i]) * (f - i); };
  })();
  const SHIPS = G.SHIPS;                                        // 船的兩種（孤帆、方舟）：大小、命、船頭首骨格數
  const RAIN_MIN = DAY * 0.25, RAIN_MAX = DAY * 1.0, RAIN_GAP_MIN = DAY * 1.0, RAIN_GAP_MAX = DAY * 4.0, RAIN_LAMP_P = 1 / 2500, ROOM_LIMIT = 121;
  // 小屋：磚與門圍起的小空間，裡面不生生靈、生靈也進不去。多小才算看難度，由 game 透過 roomLimitFor(type) 告訴世界：獸一個門檻、魄一個門檻
  // （簡單 28／18、一般 18／8、困難 10／0，0 ＝ 磚擋不住魄）；MAX_ROOM 是各門檻的最大值，漫延數到這裡就停
  const MAX_ROOM = 28;
  // 霧障會動（v0.31 起是連續地飄：每息 1/FOG_STEP 格，方向每 FOG_STEP 息上下重新定一次）。以下是 v0.19 的舊說明：每 FOG_STEP 息上下挪一格（v0.19 起間隔六到十四成之間抖動），速度慢；FOG_LIGHT_R 格內有光（燈、火、旺灶、玩家手裡的光）就往反方向躲，沒光就順著自己的風向慢慢飄，風向有慣性、偶爾轉；挪完偶爾換形（尾巴掉一格、前頭長一格）
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
      this.time = DAY * MORNING; // 世界時間（秒），從大清早開始
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
      this.wallHp = new Map();        // 撞過的牆還剩多少耐久："x,y" -> 數（沒撞過的不記，照 WALL_HP）
      this.fogRoomCache = new Map();  // 霧進不進得去："x,y" -> 在不在四十五格以內的屋子裡（每步與地上的字一變就清）
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
    tideLow() { const t = (this.time % DAY) / DAY; return t > 0.37 && t < 0.67; }   // 白天裡的一段退潮（v0.29 一日改從午夜算，跟著挪了 0.25）
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
      if (this.fogRoomCache.size) this.fogRoomCache.clear();
      this.ver = (this.ver || 0) + 1;   // 地上的字變了：畫面那邊的視線快取看這個數失效（v0.31）
      if (old !== ch) this.wallHp.delete(k);   // 換了字，舊的耐久就不算了
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

    // 兩格之間看不看得見（v0.28）：中間的格子（不算兩端）有擋光的字——磚、門、墟——就看不見；窗不擋
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
    fogSea(x, y) { return DB[this.get(x, y)].kind === 'water' && DB[this.raw(x, y)].kind === 'water'; }
    // 這格在不在「圍起來、裡面能走的格子不超過 FOG_ROOM 格」的屋子裡（門算磚；四面要有人造的磚門窗墟，v0.34）；同一次漫延碰到的格子一起記下
    fogRoom(x, y) {
      const k0 = U.key(x, y), hit = this.fogRoomCache.get(k0); if (hit !== undefined) return hit;
      if (!this.passable(x, y)) { this.fogRoomCache.set(k0, false); return false; }
      const seen = new Set([k0]), q = [[x, y]]; let open = false, built = false;
      while (q.length) {
        if (seen.size > FOG_ROOM) { open = true; break; }
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) {
          const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k)) continue;
          if (this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } else if (DB[this.get(nx, ny)].kind === 'object') built = true;   // 四面有人造的磚、門、窗、墟才算屋子
        }
      }
      const room = !open && built;   // 山、水自己圍起來的小角落不算屋子，霧照樣飄進去（v0.34）
      for (const k of seen) this.fogRoomCache.set(k, room);
      return room;
    }
    static newFogShape(area) {   // 隨機一個霧的形：面積 area 格
      const R = U.trueRand, h = [];
      for (let i = 0, m = 2 + Math.floor(R() * 2); i < m; i++) h.push([2 + Math.floor(R() * 4), 0.04 + R() * 0.1, R() * 6.28, (R() - 0.5) * 0.08]);
      return { area, n: 2 + R() * 4, nA: 0.4 + R() * 0.8, nW: 0.004 + R() * 0.01, nP: R() * 6.28, q: 0.7 + R() * 0.6, qA: 0.1 + R() * 0.15, qW: 0.003 + R() * 0.008, qP: R() * 6.28, rot: R() * 6.28, rotW: (R() - 0.5) * 0.01, h };
    }
    // 霧在 (cx, cy)、霧齡 t 時的樣子：回傳「點 (dx, dy) 在不在霧裡」的判斷，與外框半徑
    fogForm(f, t, mul) {
      const sh = f.shape, n = U.clamp(sh.n + sh.nA * Math.sin(t * sh.nW + sh.nP), 2, 6), q = sh.q * (1 + sh.qA * Math.sin(t * sh.qW + sh.qP)), rot = sh.rot + t * sh.rotW;
      const sc = Math.sqrt(sh.area * (mul || 1) / SUPER_K(n)), a = sc * Math.sqrt(q), b = sc / Math.sqrt(q), c = Math.cos(rot), sn = Math.sin(rot);
      const hs = sh.h.map(([k, amp, ph, w]) => [k, amp, ph + w * t]);
      const edge = (cu, sv, ph) => {   // 方向 (cu, sv)（在形自己的座標裡）上的外框半徑
        let R = Math.pow(Math.pow(Math.abs(cu) / a, n) + Math.pow(Math.abs(sv) / b, n), -1 / n);
        if (hs.length) { let m = 1; for (const [k, amp, p0] of hs) m += amp * Math.sin(k * ph + p0); R *= m; }
        return R;
      };
      const inside = (dx, dy) => {
        const u = dx * c + dy * sn, v = -dx * sn + dy * c, r = Math.sqrt(u * u + v * v); if (r < 1e-6) return true;
        return r <= edge(u / r, v / r, hs.length ? Math.atan2(v, u) : 0);
      };
      let rmin = Infinity, rmax = 0;   // 外框最近、最遠的半徑（取 72 個方向，留一點餘裕）
      for (let i = 0; i < 72; i++) { const ph = i / 72 * Math.PI * 2, R = edge(Math.cos(ph), Math.sin(ph), ph); if (R < rmin) rmin = R; if (R > rmax) rmax = R; }
      return { inside, reach: rmax * 1.04, rmin: rmin * 0.96 };
    }
    // 霧蓋到哪些格、各蓋幾成（每格 5×5 個點），也記蓋到的那部分的中心（畫霧用）；只算這片霧能待的格子（不在四十五格以內的屋子裡、不是別的霧的格）。
    // 回傳的陣列另帶 area（能待的格子共蓋了幾格）、lost（被擋掉幾格）與被擋掉那一塊的中心 lx、ly
    fogCoverage(f, cx, cy, t, mul) {
      cx = cx === undefined ? f.x : cx; cy = cy === undefined ? f.y : cy; t = t === undefined ? f.age : t;
      const { inside, reach, rmin } = this.fogForm(f, t, mul), S = FOG_SAMPLE, out = [], R = Math.ceil(reach) + 1, reach2 = reach * reach, rmin2 = rmin * rmin;
      const ok = (x, y) => !this.fogRoom(x, y);
      let area = 0, lost = 0, lx = 0, ly = 0;
      for (let y = Math.floor(cy) - R; y <= Math.floor(cy) + R; y++) for (let x = Math.floor(cx) - R; x <= Math.floor(cx) + R; x++) {
        const nx = U.clamp(cx, x, x + 1) - cx, ny = U.clamp(cy, y, y + 1) - cy;          // 格子離中心最近的一點
        if (nx * nx + ny * ny > reach2) continue;                                         // 整格在外框外
        const fx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx)), fy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
        let n = 0, mx = 0, my = 0;
        if (fx * fx + fy * fy < rmin2) { n = S * S; mx = (x + 0.5) * n; my = (y + 0.5) * n; }   // 整格在裡面
        else for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const sx = x + (i + 0.5) / S, sy = y + (j + 0.5) / S; if (inside(sx - cx, sy - cy)) { n++; mx += sx; my += sy; } }
        if (!n) continue;
        const k = U.key(x, y), other = this.fogCells.get(k), c = n / (S * S);
        if ((other && other !== f.id) || !ok(x, y)) { lost += c; lx += (x + 0.5) * c; ly += (y + 0.5) * c; continue; }
        area += c; out.push({ x, y, k, c, mx: mx / n, my: my / n });
      }
      out.area = area; out.lost = lost; out.lx = lost ? lx / lost : cx; out.ly = lost ? ly / lost : cy;
      return out;
    }
    // 照形算格子；有一塊被屋子（或別的霧）擋掉，就把形撐大，讓能待的那部分面積仍是原本的：撐的倍數用二分法找（面積隨倍數遞增），最多 FOG_GROW_MAX 倍
    fogCover(f, cx, cy, t) {
      const want = f.shape.area, at = (m) => this.fogCoverage(f, cx, cy, t, m);
      let m0 = U.clamp(f.mul || 1, 1, FOG_GROW_MAX), cov = at(m0);
      if (Math.abs(cov.area - want) < 0.4 || (m0 <= 1 && cov.area >= want - 0.4)) { cov.mul = m0; return cov; }
      let lo, hi, cl = null, ch = null;
      if (cov.area < want) { lo = m0; cl = cov; hi = m0; while (hi < FOG_GROW_MAX) { hi = Math.min(FOG_GROW_MAX, hi * 2); ch = at(hi); if (ch.area >= want) break; lo = hi; cl = ch; } if (ch && ch.area < want) { ch.mul = hi; return ch; } }
      else { hi = m0; ch = cov; lo = m0; while (lo > 1) { lo = Math.max(1, lo / 2); cl = at(lo); if (cl.area <= want) break; hi = lo; ch = cl; } if (cl && cl.area > want) { cl.mul = lo; return cl; } }
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2, cm = at(mid); if (cm.area < want) { lo = mid; cl = cm; } else { hi = mid; ch = cm; } if (Math.abs(cm.area - want) < 0.4) { cm.mul = mid; return cm; } }
      const best = ch || cl; best.mul = ch ? hi : lo; return best;
    }
    fogCount(cov) { return cov.filter(e => e.c > FOG_COVER).sort((a, b) => b.c - a.c).slice(0, FOG_CAP); }   // 算作霧的格子：蓋過 5%、最多三十格
    setFogCells(f, cells) {
      for (const k of f.cells) if (this.fogCells.get(k) === f.id) this.fogCells.delete(k);
      f.cells = new Set(cells); for (const k of f.cells) this.fogCells.set(k, f.id);
    }
    // 起一片霧：給了形（shape）就照形算格子；只給格子（舊存檔、測試）就照那些格子，另配一個面積相當、中心在那裡的形，等它動了才照形重算
    addFog(cells, until, sea, shape, at) {
      const id = ++this.fogSeq, f = { id, cells: new Set(), until, sea: !!sea, moveAt: this.time + this.fogStep, dir: null, age: 0, ang: U.trueRand() * Math.PI * 2 };
      const list = [...(cells || [])];
      if (at) { f.x = at[0]; f.y = at[1]; } else if (list.length) { let sx = 0, sy = 0; for (const k of list) { const [x, y] = U.unkey(k); sx += x; sy += y; } f.x = sx / list.length + 0.5; f.y = sy / list.length + 0.5; } else { f.x = 0.5; f.y = 0.5; }
      f.shape = shape || World.newFogShape(Math.max(1, list.length));
      if (at && at[2] !== undefined) { f.age = at[2]; if (at[3] !== undefined) f.ang = at[3]; }
      this.fogs.set(id, f);
      if (list.length) this.setFogCells(f, list); else { const cov = this.fogCover(f); f.mul = cov.mul; this.setFogCells(f, this.fogCount(cov).map(e => e.k)); }
      f.base = f.cells.size; f.gx = f.x; f.gy = f.y;
      return f;
    }
    removeFog(id) { const f = this.fogs.get(id); if (!f) return; for (const k of f.cells) if (this.fogCells.get(k) === id) this.fogCells.delete(k); this.fogs.delete(id); }
    // 在玩家附近的陸地上起一片霧：找一處陸地當中心，配一個隨機的形；蓋得到的地太少（小島、橋上、屋邊）或壓到玩家身邊就換個地方（最多八次）
    spawnFog(px, py) {
      for (let attempt = 0; attempt < 8; attempt++) { const f = this.growFog(px, py); if (f) return f; }
      this.fogMiss = (this.fogMiss || 0) + 1;   // 都起不來：記一筆，測試與除錯用
      return null;
    }
    growFog(px, py) {
      const R = U.trueRand;
      let at = null;
      for (let i = 0; i < 80 && !at; i++) {
        const a = R() * Math.PI * 2, r = FOG_NEAR[0] + R() * (FOG_NEAR[1] - FOG_NEAR[0]);
        const x = px + Math.round(Math.cos(a) * r), y = py + Math.round(Math.sin(a) * r);
        if (this.fogLand(x, y) && !this.fogCells.has(U.key(x, y))) at = [x + 0.5, y + 0.5];
      }
      if (!at) { this.fogNoSeed = (this.fogNoSeed || 0) + 1; return null; }
      const shape = World.newFogShape(FOG_AREA[0] + R() * (FOG_AREA[1] - FOG_AREA[0]));
      const probe = { id: -1, shape, sea: false, age: 0 }, cells = this.fogCount(this.fogCover(probe, at[0], at[1], 0));
      if (cells.length < 10 || cells.some(e => Math.abs(e.x - px) <= 1 && Math.abs(e.y - py) <= 1)) return null;
      const f = this.addFog(null, this.time + FOG_LIFE, false, shape, at);
      if (this.onFog) this.onFog(f);
      return f;
    }
    // 蜃吐霧：在蜃與玩家之間的海面上起一片海霧（只蓋水，不蓋船、網、陸地）
    spawnSeaFog(mx, my, px, py) {
      const R = U.trueRand, dx = Math.sign(px - mx), dy = Math.sign(py - my);
      for (let i = 0; i < 30; i++) {
        const t = 2 + Math.floor(R() * 4), x = mx + dx * t + Math.round((R() - 0.5) * 4), y = my + dy * t + Math.round((R() - 0.5) * 4);
        if (!this.fogSea(x, y) || this.fogCells.has(U.key(x, y))) continue;
        const shape = World.newFogShape(SEA_FOG_AREA[0] + R() * (SEA_FOG_AREA[1] - SEA_FOG_AREA[0]));
        const probe = { id: -1, shape, sea: true, age: 0 }, cells = this.fogCount(this.fogCover(probe, x + 0.5, y + 0.5, 0));
        if (cells.length < 3 || cells.some(e => e.x === px && e.y === py)) continue;
        return this.addFog(null, this.time + SEA_FOG_LIFE, true, shape, [x + 0.5, y + 0.5]);
      }
      return null;
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
    // 定方向（v0.19 起的規則照舊）：FOG_LIGHT_R 格內有光就背著光走（略帶偏）；沒光就順著自己的風向，風向慢慢轉、偶爾大轉
    steerFog(f, px, py) {
      const R = U.trueRand, c = { x: f.x - 0.5, y: f.y - 0.5 };
      let src = this.nearestLight(Math.round(c.x), Math.round(c.y), FOG_LIGHT_R);
      if (this.playerLit()) { const d = Math.hypot(px - c.x, py - c.y); if (d <= FOG_LIGHT_R && (!src || d < src.d)) src = { x: px, y: py, d }; }
      if (src) f.ang = Math.atan2(c.y - src.y, c.x - src.x) + (R() - 0.5) * 0.5;
      else if (typeof f.ang !== 'number') f.ang = R() * Math.PI * 2;
      else f.ang += (R() - 0.5) * (R() < 0.15 ? 2.4 : 0.7);
      return !!src;
    }
    // 把霧挪到 (x, y)、霧齡 t，重算算作霧的格子。山、海都飄得過去，不回頭（v0.32）；碰到四十五格以內的屋子，形撐開繞過去、方向拐開；
    // 飄到海的盡頭（離島心 G.SEA_EDGE − FOG_EDGE 外）就轉回島這邊，免得飄出紙外
    placeFog(f, x, y, t) {
      const cov = this.fogCover(f, x, y, t), cells = this.fogCount(cov);
      const dx = x - f.gx, dy = y - f.gy; if (Math.abs(dx) + Math.abs(dy) > 1e-6) f.dir = [Math.sign(Math.round(dx * 10)), Math.sign(Math.round(dy * 10))];
      f.x = x; f.y = y; f.age = t; f.gx = x; f.gy = y; f.mul = cov.mul; this.setFogCells(f, cells.map(e => e.k));
      if (cov.lost > 0.3 && this.time >= (f.turnAt || 0)) {   // 碰上屋子：往屋子去的就拐成繞著走（偏外一點），四息內不再拐
        const oa = Math.atan2(cov.ly - y, cov.lx - x), d = Math.atan2(Math.sin(f.ang - oa), Math.cos(f.ang - oa));
        if (Math.abs(d) < Math.PI / 2) { f.ang = oa + (d >= 0 ? 1 : -1) * (Math.PI / 2 + 0.35); f.turnAt = this.time + 4; f.turned = (f.turned || 0) + 1; }
      }
      if (Math.hypot(x, y) > G.SEA_EDGE - FOG_EDGE) { const home = Math.atan2(-y, -x), d = Math.atan2(Math.sin(f.ang - home), Math.cos(f.ang - home)); if (Math.abs(d) > Math.PI / 2) f.ang = home + (U.trueRand() - 0.5) * 0.8; }
      return true;
    }
    // 測試與舊介面：定方向後一口氣挪一格的距離
    moveFog(f, px, py) {
      this.steerFog(f, px, py);
      return this.placeFog(f, f.gx + Math.cos(f.ang), f.gy + Math.sin(f.ang), f.age);
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
    // 牆挨野牛撞一下：回傳 'broken'（塌了）、'ruined'（磚成了墟）、'cracked'（窗門剩一半，字變色）或 'hit'
    hitWall(x, y) {
      const ch = this.get(x, y), full = WALL_HP[ch]; if (!full) return null;
      const k = U.key(x, y), hp = (this.wallHp.has(k) ? this.wallHp.get(k) : full) - 1;
      if (hp <= 0) return 'broken';
      if (ch === '磚' && hp <= full / 2) { this.set(x, y, '墟'); this.wallHp.set(k, hp); return 'ruined'; }
      this.wallHp.set(k, hp); return hp <= full / 2 && (ch === '窗' || ch === '門') ? 'cracked' : 'hit';
    }
    wallHurt(x, y) { const k = U.key(x, y), full = WALL_HP[this.get(x, y)]; return !!full && this.wallHp.has(k) && this.wallHp.get(k) <= full / 2; }   // 窗門剩一半：畫成另一個顏色
    // 圍住這格的屋子的四面（v0.28，算窗佔幾成）：從這格順著能走的格子漫延，碰到的不能走的格子就是四面，"x,y" -> 字；ROOM_LIMIT 格內圍不住回 null
    roomShell(x, y) {
      const seen = new Set([U.key(x, y)]), q = [[x, y]], shell = new Map();
      while (q.length) {
        if (seen.size > ROOM_LIMIT) return null;
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k) || shell.has(k)) continue; if (this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } else shell.set(k, this.get(nx, ny)); }
      }
      shell.area = seen.size;   // 屋內面積（能走的格數，含人站的那格）
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
      if (this.fogs.size && this.fogStep < 1e6) {   // 霧障連續地飄：每息 1/fogStep 格；形狀照霧齡慢慢變（測試把 fogStep 設很大就停住）
        const v = 1 / this.fogStep, k = FOG_STEP / this.fogStep;
        for (const f of this.fogs.values()) { f.x += Math.cos(f.ang) * v * dt; f.y += Math.sin(f.ang) * v * dt; f.age += dt * k; }
      }
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
      this.fogRoomCache.clear();
      for (const f of this.fogs.values()) {   // 霧障：每 fogStep 息上下重新定方向（躲光、隨風），每一步照現在的位置與形狀重算格子
        if (this.time >= f.moveAt) { f.moveAt = this.time + this.fogStep * (0.6 + U.trueRand() * 0.8); this.steerFog(f, px, py); }
        if (this.fogStep < 1e6) this.placeFog(f, f.x, f.y, f.age);   // 每半息照此刻的位置與形狀重算
      }
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
      const burn = {}; for (const [k, v] of this.burn) burn[k] = [U.r4(v.t), v.lvl];
      const timers = {}; for (const [k, v] of this.timers) timers[k] = [v.to, U.r4(v.at), v.from || '灰'];
      const scarecrows = {}; for (const [k, v] of this.scarecrows) scarecrows[k] = U.r4(v);
      const chests = {}; for (const [k, v] of this.chests) chests[k] = v;
      const shelves = {}; for (const [k, v] of this.shelves) if (v.length) shelves[k] = v.map(s => [s.n, s.c]);
      const nets = {}; for (const [k, v] of this.nets) nets[k] = [v.size, v.x, v.y, v.fish, U.r4(v.t), (v.under || []).join(''), v.dur === undefined ? NET_DUR[v.size] : v.dur, v.rf || 0];
      const stoves = {}; for (const [k, v] of this.stoves) stoves[k] = U.r4(v);
      const bags = {}; for (const [k, v] of this.bags) bags[k] = v;
      const weirs = {}; for (const [k, v] of this.weirs) weirs[k] = U.r4(v);
      const explored = {}; for (const [k, b] of this.explored) explored[k] = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
      const seen = this.places.filter(p => p.seen).map(p => p.id);
      const wallHp = {}; for (const [k, v] of this.wallHp) wallHp[k] = v;
      return { seed: this.seed, dayLen: DAY, time: U.r4(this.time), wallHp, diff, burn, timers, stoves, shelves, bags, weirs, explored, seen, scarecrows, chests, nets, rainUntil: U.r4(this.rainUntil), nextRainAt: U.r4(this.nextRainAt),
        fogs: [...this.fogs.values()].map(f => [U.r4(f.until), [...f.cells].join(';'), f.sea ? 1 : 0, f.shape, [U.r4(f.x), U.r4(f.y), U.r4(f.age || 0), U.r4(f.ang || 0)]]), fogPlan: this.fogPlan.map(U.r4), fogDay: this.fogDay,
        ships: Object.fromEntries([...this.ships].map(([k, v]) => [k, { kind: v.kind, hp: U.r4(v.hp), skulls: (v.skulls || []).map(([n, e]) => [n, U.r4(e)]), repairs: v.repairs || 0, cells: v.cells }])) };
    }
    restore(s, briefDay) {
      const t0 = s.time || DAY * MORNING; this.time = t0; this.timeShift = 0;
      if (s.dayLen !== DAY) {   // 舊存檔（一日長度不同）：日數不換算，時間設成那天的大清早（v0.29 使用者定）；存著的時刻跟著挪，倒數不變
        const d = briefDay > 0 ? briefDay - 1 : Math.floor(t0 / DAY);
        this.time = d * DAY + DAY * MORNING; this.timeShift = U.r4(this.time - t0);
      }
      const sh = (v) => typeof v === 'number' && v > 0 ? U.r4(v + this.timeShift) : v;
      this.diff = new Map(Object.entries(s.diff || {})); this.ver = (this.ver || 0) + 1;
      for (const [k, v] of this.diff) if (v === '牆') this.diff.set(k, '墟');   // v0.29 前的殘牆字
      this.wallHp = new Map(Object.entries(s.wallHp || {}));
      this.lamps = new Set(); for (const [k, v] of this.diff) if (v === '燈') this.lamps.add(k);
      this.rainUntil = sh(s.rainUntil || 0) > this.time ? sh(s.rainUntil) : 0;
      this.nextRainAt = sh(s.nextRainAt) || (this.time + DAY + U.trueRand() * DAY * 2);
      this.rainAcc = 0;
      this.fogs = new Map(); this.fogCells = new Map(); this.fogSeq = 0;
      for (const [u, cells, sea, shape, at] of s.fogs || []) { const until = sh(u); if (until > this.time && cells) this.addFog(cells.split(';'), until, sea, shape && shape.h ? shape : null, at); }   // v0.31 前的霧只有格子：照格子配一個形
      this.ships = new Map(); this.shipCells = new Map();
      for (const [k, v] of Object.entries(s.ships || {})) {
        if (Array.isArray(v)) {        // v0.11 的單格大船：當孤帆，船身找得到第二格水就留，找不到就沒了
          const [ax, ay] = U.unkey(k), old = { kind: '孤帆', hp: Math.min(v[0], SHIPS['孤帆'].hp), skulls: v[2] && v[1] > this.time ? [[v[2], v[1]]] : [], repairs: 0 };
          const water = (x, y) => { const t = this.get(x, y); return DB[t].kind === 'water' || t === '舟'; };
          const anchor = [[ax, ay], [ax, ay - 1]].find(([x, y]) => this.shipFits('孤帆', x, y, water));
          if (anchor) this.addShip(anchor[0], anchor[1], old); else { const b = this.base(ax, ay); this.set(ax, ay, DB[b].kind === 'water' ? b : '水'); }
          continue;
        }
        const rec = { kind: SHIPS[v.kind] ? v.kind : '孤帆', hp: v.hp, skulls: (v.skulls || []).map(([n, e]) => [n, sh(e)]).filter(x => x[1] > this.time), repairs: v.repairs || 0, cells: v.cells };
        this.ships.set(k, rec); for (const [x, y] of rec.cells) this.shipCells.set(U.key(x, y), k);
      }
      for (const [k, v] of this.diff) if (v === '舟' && !this.shipCells.has(k)) { const [x, y] = U.unkey(k), b = this.base(x, y); this.set(x, y, DB[b].kind === 'water' ? b : '水'); }   // 沒有記錄的舟字：還原成水
      this.fogPlan = (s.fogPlan || []).filter(t => typeof t === 'number').map(sh);
      this.fogDay = typeof s.fogDay === 'number' ? s.fogDay : Math.floor(this.time / DAY);
      this.burn = new Map(Object.entries(s.burn || {}).map(([k, v]) => [k, { t: v[0], lvl: v[1] }]));
      this.timers = new Map(Object.entries(s.timers || {}).map(([k, v]) => [k, { to: v[0], at: sh(v[1]), from: v[2] || '灰' }]));
      this.scarecrows = new Map(Object.entries(s.scarecrows || {}).map(([k, v]) => [k, sh(v)]));
      this.chests = new Map(Object.entries(s.chests || {}));
      this.shelves = new Map(Object.entries(s.shelves || {}).map(([k, v]) => [k, v.map(([n, c]) => ({ n, c }))]));
      this.nets = new Map(); this.netCells = new Map();
      for (const [k, v] of Object.entries(s.nets || {})) { const rec = { size: v[0], x: v[1], y: v[2], fish: v[3], t: sh(v[4]), under: v[5] ? Array.from(v[5]) : [], dur: v[6] === undefined ? NET_DUR[v[0]] : v[6], rf: v[7] || 0 }; rec.tidal = rec.under.indexOf('灘') >= 0; this.nets.set(k, rec); for (let j = 0; j < rec.size; j++) for (let i = 0; i < rec.size; i++) this.netCells.set(U.key(rec.x + i, rec.y + j), k); }
      this.stoves = new Map(Object.entries(s.stoves || {}));
      this.bags = new Map(Object.entries(s.bags || {}));
      this.weirs = new Map(Object.entries(s.weirs || {}).map(([k, v]) => [k, sh(v)]));
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
