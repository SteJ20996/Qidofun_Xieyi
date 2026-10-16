// game.js —— 主迴圈、輸入、取／攻擊／放／製作／吃／睡／上船、命飽暖力愜與膽氣、毒與魄、死亡與復活、見聞錄、HUD、存檔
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB, ITEMS = G.ITEMS;
  // 三格存檔：第一格沿用舊鍵 xieyi.save.v5（舊存檔照讀），第二、三格是 xieyi.save.v5.2、.3；xieyi.slot 記上次玩的是哪一格；xieyi.carry 是渡海帶走的膽氣（值@格）
  const SAVE_KEY = 'xieyi.save.v5', CARRY_KEY = 'xieyi.carry', SLOT_KEY = 'xieyi.slot', SAVE_SLOTS = 3, SLOT_NAMES = ['', '一', '二', '三'];
  const DAY = 240;
  const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';
  const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const BASE_SLOTS = 16, STACK = 64, CHEST_SLOTS = 24, BASE_TOOLS = 6, MAX_POUCHES = 4, FERMENT_NIGHTS = 15, SHIP_LEVEL = 8, TOTEM_LEVEL = 10, DECAY_LEVEL = 31, DECAY_DAYS = 3;
  // 難度：魄從第幾夜起、受傷與攻擊倍率、夜裡狼虎豹蛇的數量倍率
  // warn：數值不到四分之一要不要彈窗提醒（困難只閃不彈）；room／ghostRoom：牆與門圍起不超過幾格的小屋擋得住獸／魄（0 ＝ 牆擋不住魄，只有光）
  const DIFF = { easy: { key: 'easy', name: '簡單', ghost: 21, taken: 0.9, dmg: 1.1, beasts: 1, warn: true, room: 28, ghostRoom: 18 }, normal: { key: 'normal', name: '一般', ghost: 13, taken: 1, dmg: 1, beasts: 1, warn: true, room: 18, ghostRoom: 8 }, hard: { key: 'hard', name: '困難', ghost: 9, taken: 1.1, dmg: 0.9, beasts: 1.5, warn: false, room: 10, ghostRoom: 0 } };
  // 九閽鳴雷：卅一重方可造、可掄；三格內諸獸同受其傷；隨身則膽氣二日一減、下限廿五重
  const HAMMER = '九閽鳴雷', HAMMER_LEVEL = 31, HAMMER_RANGE = 3, HAMMER_FLOOR = 25, HAMMER_DECAY_DAYS = 2;
  const TAME_CHANCE = [0.35, 0.25, 0.10], EAGLE_FEED = 40, TURTLE_PEACE_DAYS = 5;   // 馴鷹的機率看已經跟著幾隻；餵魚回力；龜卜吉兆幾日無魄
  // 膽氣：第 n 重升到 n+1 重要 20×(1+0.1n)² 點：20、24.2、28.8、33.8、39.2……八重共 300，十重 437，卅一重 4371
  const LEVEL_UNIT = 20;
  const levelCost = (n) => Math.round(LEVEL_UNIT * (1 + 0.1 * n) * (1 + 0.1 * n));   // 四捨五入到個位：20、24、29、34、39、45、51、58、65、72、80……
  const CUM = [0]; for (let n = 0; n < 120; n++) CUM.push(CUM[n] + levelCost(n));
  // 衣甲：五件一套，一百八十日勻速穿破；十五息內挨打越多壞得越快，且會累加
  const SLOT_ORDER = ['襯', '褲', '甲', '盔', '靴', '帽'], ARMOR_SLOTS = ['襯', '褲', '甲', '盔', '靴'], ARMOR_LIFE = 180 * DAY, HIT_MULT = [1, 1.05, 1.12, 1.2, 1.5];
  const FUEL = { '煤': 120, '精煤': 300 };   // 灶的好柴：一塊煤燒一百二十息，精煤三百息
  const TURTLE_SAN = 30;                      // 殺龜不祥：愜意掉三十
  const KILL_ONLY_LEVEL = 22, KILL_DAY = 0.8, KILL_NIGHT = 1.05;   // 廿二重起膽氣只從斃敵對生靈得來（製作採集讀碑都不長）；斃敵的膽氣白日八成、夜裡加半成（四捨五入）
  const WARN_LIGHT = 0.5, WARN_POP = 0.25;    // 五條數值不到五成亮燈、不到四分之一彈窗提醒（回到五成以上才會再提醒）
  const WEAR_CAP = 6, REPAIR_WM = 1.5, HAT_FUEL = 400;
  const FOG_TOLL = 0.1, FAN_REACH = 3;
  // 海：船分孤帆與方舟（大小、命、船頭首骨格數在 G.SHIPS）。修船每次回滿命的 SHIP_REPAIR_FRAC，第 n 次修要 n 塊木板。
  // 船毀了落水，SWIM_TIME 息內游上岸，否則溺死；游泳時飽、愜意、力的消耗 ×SWIM_DRAIN、力不回反掉，武器傷害 ×SWIM_DMG。
  // 燭龍焚溟在船上揮，自己的船也挨傷害的 GOD_SELF；膽氣不滿 SEA_WARN_LEVEL 重（卅一重，神兵的門檻）出海先問；讀檔時海上還有沒解決的蜃，膽氣減 SEA_PENALTY 重
  const SHIP_REPAIR_FRAC = 0.25, SWIM_TIME = 60, SWIM_DRAIN = 2, SWIM_DMG = 0.75, SWIM_STEP = 0.32, GOD_SELF = 0.1, SEA_WARN_LEVEL = 31, SEA_PENALTY = 5;
  // 獸首骨：殺虎豹狼有 SKULL_P 的機會掉，掉一個或兩個（SKULL_TWO 的機會兩個）；放在船頭鎮船，日數見 ITEMS 的 ward，各鎮各的、到期風化，船頭格數見 G.SHIPS
  const SKULL_P = 0.35, SKULL_TWO = 0.3;
  const SEA_GOD = '燭龍焚溟', SEA_FOLK = '蜃龜';   // 海中之物：燭龍焚溟全傷、九閽鳴雷減半；其餘反過來   // 霧障：不吹散就五樣數值各掉當前的一成（四捨五入，命不低於一）；扇子選中按 V 吹得到三格   // 衣甲損耗倍率封頂；修補後從 1.5 倍起算；燈帽一根蠟燭四百息
  const $ = (id) => document.getElementById(id);

  class Game {
    constructor(seed, save, diff, slot) {
      this.seed = seed | 0;
      this.slot = Math.min(SAVE_SLOTS, Math.max(1, (slot | 0) || 1));   // 存在哪一格
      this.diff = DIFF[(save && save.diff) || diff] || DIFF.normal;
      this.world = new World(this.seed);
      this.ents = new Entities(this.world);
      this.world.playerLit = () => this.hasLight();   // 霧障躲光：玩家手裡或帽上的光也算
      this.world.roomLimitFor = (type) => type === '魄' ? this.diff.ghostRoom : this.diff.room;   // 小屋多小才擋得住，看難度
      this.world.onDiscover = (pl) => this.discover(pl);
      this.world.onWeather = (on) => { if (on) this.toast('下雨了', '雨會澆壞屋外的燈，四面有牆的屋裡不怕。'); else this.message('雨停了。'); };
      this.world.onFog = (f) => { const c = this.world.fogCenter(f), p = this.player, dx = c.x - p.x, dy = c.y - p.y; this.toast('起霧了', this.dirName(dx, dy) + '約 ' + Math.round(Math.hypot(dx, dy)) + ' 步起了一片霧障（' + f.cells.size + ' 格）。走進去，命飽暖力愜意各掉一成；帶著扇子可以吹散。'); };
      this.world.onLampRuined = (x, y) => { this.toast('雨澆壞了一盞燈', '在 (' + x + ', ' + y + ')，燈沒了。屋外的燈每盞每息有千五分之一的機會淋壞。'); SFX.fail(); };
      this.renderer = new Renderer($('world'), $('minimap'));
      this.mapAcc = 0;
      this.player = { x: 0, y: 0, rx: 0, ry: 0, fx: 0, fy: 1, fromX: 0, fromY: 0, moveT: 0, stepDur: 0.2,
        hp: 100, hpMax: 100, food: 100, warm: 100, sta: 100, staMax: 100, san: 100, cour: 0, pillsMade: 0, pillsEaten: 0,
        hurtT: 0, atkT: 0, bag: [], sel: 0, tools: [], tool: -1, worn: { '襯': null, '褲': null, '甲': null, '盔': null, '靴': null, '帽': null }, hitWin: { start: -99, n: 0 }, totemOff: false, craftLog: {}, pouches: 0, noGhostUntil: 0, inFog: 0, ship: null, swimming: false, swimT: 0, home: null, readSteles: [], places: {}, creatures: [], raftTaken: false, dragon: false, finished: false,
        deaths: 0, dead: false, warned: {}, warnLow: {}, burn: {}, lastDay: 1,
        poisonT: 0, poisonPer: 0, biteN: 0, biteLast: -99, zeroSan: 0, insane: false, ctrl: true, ctrlT: 0, knock: 0, sailing: false, crossed: false, decayAt: 0 };
      this.stats = { gathered: 0, crafted: 0, kills: 0, read: 0, nights: 0, bites: 0 };
      this.keys = new Set();
      this.action = null;
      this.fx = [];
      this.paused = true;
      this.saveAcc = 0; this.sanAcc = 0;
      this.last = 0;
      this.msgText = ''; this.hudSig = ''; this.barSig = ''; this.courSig = '';
      this.chestAt = null; this.userPaused = false; this.craftCat = '全部'; this.fogAsk = null; this.seaAsk = null; this.skullP = SKULL_P;
      this.stoveAt = null; this.stoveSig = ''; this.warnOpen = false; this.warnEnabled = true;   // warnEnabled：煙霧測試關掉，免得途中彈窗把遊戲停住
      this.spawn = this.world.findSpawn();
      if (save) this.load(save);
      else {
        this.player.x = this.player.rx = this.spawn.x; this.player.y = this.player.ry = this.spawn.y;
        try {   // 渡海帶來的膽氣：值@格；沒寫格（舊格式）就誰先開新島誰拿
          const raw = localStorage.getItem(CARRY_KEY) || '', at = raw.indexOf('@'), forSlot = at >= 0 ? parseInt(raw.slice(at + 1), 10) : 0, c = parseInt(raw, 10);
          if (c > 0 && (!forSlot || forSlot === this.slot)) { this.player.cour = c; localStorage.removeItem(CARRY_KEY); }
        } catch (e) { /* ignore */ }
      }
      this.bindInput();
      this.buildBag();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------- 晝夜、潮汐、魄夜、膽氣 ----------
    dayT() { return (this.world.time % DAY) / DAY; }
    day() { return Math.floor(this.world.time / DAY) + 1; }
    nightNo() { return this.dayT() > 0.5 ? this.day() : this.day() - 1; }
    daylight() { const t = this.dayT(); return U.smoothstep(-0.04, 0.08, t) * (1 - U.smoothstep(0.46, 0.58, t)); }
    darkness() { return 1 - this.daylight(); }
    isNight() { const t = this.dayT(); return t > 0.5 || t < 0.06; }
    ghostNight() { return this.darkness() > 0.5 && this.nightNo() >= this.diff.ghost && this.world.time >= (this.player.noGhostUntil || 0); }
    peaceDays() { const left = (this.player.noGhostUntil || 0) - this.world.time; return left > 0 ? Math.ceil(left / DAY - 1e-6) : 0; }
    tameCount() { return this.ents.tamed().length; }
    tameChance() { return TAME_CHANCE[Math.min(TAME_CHANCE.length - 1, this.tameCount())]; }
    feedEagle(e) {      // 手持魚面向鷹按 F：野的投魚馴，馴了的餵魚回力
      this.removeItem('魚', 1);
      if (e.tame) { e.sta = Math.min(100, e.sta + EAGLE_FEED); e.hp = Math.min(DB['鷹'].hp, e.hp + 10); this.message('鷹吃了魚，力 +' + EAGLE_FEED + '（' + Math.round(e.sta) + '）。'); SFX.absorb(); return; }
      const chance = this.tameChance(); e.angry = false; e.angryT = 0;
      if (Math.random() < chance) { e.tame = true; e.sta = e.sta === undefined ? 100 : e.sta; e.foe = null; this.toast('鷹馴了', '牠跟你走了，替你打獸；餵魚回力。現在跟著你的鷹：' + this.tameCount() + ' 隻。'); SFX.learn(); this.addCourage(5); }
      else this.message('鷹吃了魚，還是不肯跟你走（這次 ' + Math.round(chance * 100) + '%）。');
      this.barSig = '';
    }
    eagleHit(e, t) { this.fx.push({ type: 'float', x: t.x, y: t.y, text: '−20', color: G.INK.red, t: 0, dur: 0.7 }); }
    companionDied(e, killer) { this.ents.remove(e); this.toast('鷹死了', (killer ? '「' + killer.type + '」殺了你的鷹。' : '你的鷹死了。')); SFX.fail(); }
    gatherCompanions() { const p = this.player; for (const e of this.ents.tamed()) { const at = this.freeNear(p.x, p.y, true); e.x = e.rx = at.x; e.y = e.ry = at.y; } }
    ghostCap() { return Math.min(6, 2 + Math.floor((this.nightNo() - this.diff.ghost) / 2)); }
    shichen() { const hour = (6 + this.dayT() * 24) % 24; return SHICHEN[Math.floor(((hour + 1) % 24) / 2)] + '時'; }
    slots() { return BASE_SLOTS + 2 * this.player.pouches; }          // 錦囊：每個多兩格
    toolSlots() { return BASE_TOOLS + this.player.pouches; }           // 錦囊：每個多一格具欄
    beastMult() { return this.diff.beasts; }
    hasHammer() { return this.player.tools.some(s => s.n === HAMMER) || this.player.bag.some(s => s.n === HAMMER); }
    decayFloor() { return this.hasHammer() ? HAMMER_FLOOR : DECAY_LEVEL; }
    decayDays() { return this.hasHammer() ? HAMMER_DECAY_DAYS : DECAY_DAYS; }
    level() { return Game.levelOf(this.player.cour); }
    levelAt(l) { return CUM[Math.max(0, Math.min(CUM.length - 1, l))]; }     // 到第 l 重要累積多少膽氣
    levelCost(n) { return levelCost(n); }
    levelFrac() { const l = this.level(); return U.clamp((this.player.cour - CUM[l]) / levelCost(l), 0, 1); }
    mult() { return 1 + Math.min(10, this.level()) / 10; }                 // 膽氣越高回得越快，十重兩倍
    // 衣甲
    wornList() { const w = this.player.worn; return SLOT_ORDER.map(k => w[k]).filter(Boolean); }
    wornFull() { return ARMOR_SLOTS.every(k => this.player.worn[k]); }
    ownedPiece(n) { return this.wornList().find(s => s.n === n) || this.player.bag.find(s => s.n === n) || null; }   // 同一類衣甲只留一件
    ironCount() { return this.wornList().filter(s => ITEMS[s.n].iron).length; }
    ironFull() { return this.ironCount() === 3; }                                                // 鐵甲鐵盔鐵靴齊：毒不侵
    armorRed() { return this.wornList().reduce((a, s) => a + (ITEMS[s.n].red || 0), 0); }      // 減傷：布五件一成，鐵三件加內襯布褲三成
    ironSpeed() { return 1 - 0.25 * this.ironCount() / 3; }                                      // 三件鐵慢四分之一
    ironAtk() { return 1 + 0.05 * this.ironCount() / 3; }                                        // 三件鐵攻擊加半成
    ironDrain() { return (1 + 0.08 * this.ironCount() / 3) * (this.player.swimming ? SWIM_DRAIN : 1); }   // 落水游泳時再翻倍                                      // 三件鐵飢愜力掉得快八分
    wornWarm() { return this.wornList().some(s => ITEMS[s.n].warm); }
    // 山海衣：五件穿齊、十重膽氣，衣上浮出獸紋；脫下任何一件即隱
    totemReady() { return this.level() >= TOTEM_LEVEL && this.wornFull(); }
    totemOn() { return this.totemReady() && !this.player.totemOff; }
    toggleTotem() {
      const p = this.player; p.totemOff = !p.totemOff; this.barSig = '';
      if (!this.totemReady()) this.message(p.totemOff ? '開關撥到「關」。' : '開關撥到「開」，但要五件穿齊、膽氣十重，獸紋才會顯。');
      else this.message(p.totemOff ? '山海衣收起獸紋，暫作普通服。' : '山海衣獸紋再現。'); SFX.toggle(); SFX.toggle();
    }
    ladder() { return this.totemOn() ? Math.floor((this.level() - TOTEM_LEVEL) / 7) : -1; }     // 十至十六重 0，十七重 1，二十四重 2……
    dmgMult() { const k = this.ladder(); return (k < 0 ? 1 : Math.pow(1.15, k + 1)) * this.ironAtk() * this.diff.dmg * (this.player.swimming ? SWIM_DMG : 1); }        // 造成的傷害
    takenMult() { const k = this.ladder(); return (k < 0 ? 1 : Math.pow(1.15, -k)) * (1 - this.armorRed()) * this.diff.taken; }  // 受到的傷害
    totemNear(x, y) { return this.totemOn() && U.cheb(x, y, this.player.x, this.player.y) <= 7; }
    lifeOf(s) { const it = ITEMS[s.n] || {}; return (it.life || 180) * DAY; }     // 衣甲壽命：一般一百八十日，鎢鋼三百六十日
    durText(s) { if (s.dur === undefined) return '×' + s.c; const it = ITEMS[s.n] || {}; return it.slot ? Math.max(1, Math.ceil(s.dur / DAY)) + ' 日' : '耐 ' + s.dur; }
    wearRate(s) { return (s.wm || 1) * (HIT_MULT[this.player.hitWin.n] || 1); }                 // 這件現在的損耗速度
    effDays(s) { return Math.max(1, Math.ceil(s.dur / this.wearRate(s) / DAY)); }              // 照目前速度還能穿幾日
    wearItem(i) {        // 把囊裡第 i 格的衣甲穿上，原來那件回囊
      const p = this.player, s = p.bag[i]; if (!s) return false;
      const it = ITEMS[s.n]; if (!it || !it.slot) return false;
      const was = this.totemOn(), old = p.worn[it.slot];
      let piece;
      if (s.c > 1 && s.dur === undefined) { s.c--; piece = { n: s.n, c: 1 }; } else { p.bag.splice(i, 1); piece = s; }
      if (piece.dur === undefined && !it.light) piece.dur = this.lifeOf(piece);
      if (piece.wm === undefined) piece.wm = 1;
      p.worn[it.slot] = piece;
      if (old) p.bag.splice(Math.min(i, p.bag.length), 0, old);
      if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
      this.barSig = ''; this.buildBag(); SFX.write();
      this.message(it.light ? '戴上「' + piece.n + '」。' : '穿上「' + piece.n + '」' + (old ? '，脫下「' + old.n + '」' : '') + '。減傷 ' + Math.round(this.armorRed() * 100) + '%。');
      if (this.totemOn() && !was) this.toast('山海衣', '五件穿齊，十重膽氣，衣上浮出山海經裡的獸紋。七格內的獸慢一倍卻狠三分之二；你的攻擊 ' + Math.round(this.dmgMult() * 100) + '%、受傷 ' + Math.round(this.takenMult() * 100) + '%。');
      return true;
    }
    repairWorn(slot) {   // 布件用麻布一、鐵件用鐵一，力 4：壽命回滿，損耗從 1.5 倍重新起算；燈帽則是續蠟燭
      const p = this.player, s = p.worn[slot]; if (!s || !this.canAct()) return false;
      if (slot === '帽') { if (this.count('蠟燭') < 1) { this.message('續燈帽要一根蠟燭。'); SFX.fail(); return false; } this.removeItem('蠟燭', 1); s.fuel = HAT_FUEL; this.barSig = ''; this.buildBag(); this.message('燈帽續上一根蠟燭：四百息。'); SFX.write(); return true; }
      const it = ITEMS[s.n], mat = it.tung ? '鎢鋼' : it.iron ? '鐵' : '麻布', sta = it.tung ? 12 : 4, food = it.tung ? 15 : 0;   // 鎢鋼具修補耗力也耗飽
      if (this.count(mat) < 1) { this.message('修補「' + s.n + '」要' + mat + '一' + (food ? '、力 ' + sta + '、飽 ' + food : '') + '。'); SFX.fail(); return false; }
      if (food && p.food < food) { this.message('太餓了，修不動鎢鋼。'); SFX.fail(); return false; }
      if (!this.spendSta(sta)) return false;
      if (food) p.food -= food;
      this.removeItem(mat, 1); s.dur = this.lifeOf(s); s.wm = REPAIR_WM; this.barSig = ''; this.buildBag(); SFX.fuse();
      this.message('「' + s.n + '」修補好了：壽命回滿，損耗從 150% 起算。'); return true;
    }
    takeOff(slot) {
      const p = this.player, s = p.worn[slot]; if (!s) return;
      if (p.bag.length >= this.slots()) { this.message('囊已滿。'); SFX.fail(); return; }
      const was = this.totemOn();
      p.worn[slot] = null; p.bag.push(s); this.barSig = ''; this.buildBag(); SFX.write();
      this.message('脫下「' + s.n + '」。' + (was ? '山海衣的獸紋隱去。' : ''));
    }
    armorHit() {         // 挨了一下：十五息內算同一輪，一下 1.05、兩下 1.12、三下 1.2、四下 1.5，五下甲襯褲碎
      const p = this.player, win = p.hitWin, now = this.world.time, worn = this.wornList();
      if (!worn.length) return;
      if (win.n && now - win.start > 15) { for (const s of worn) s.wm = Math.min(WEAR_CAP, (s.wm || 1) * HIT_MULT[win.n]); win.n = 0; }
      if (!win.n) win.start = now;
      win.n++;
      if (win.n >= 5) {
        for (const s of worn) s.wm = Math.min(WEAR_CAP, (s.wm || 1) * HIT_MULT[4]);
        const gone = [];
        for (const k of ['甲', '襯', '褲']) if (p.worn[k]) { gone.push(p.worn[k].n); p.worn[k] = null; }
        win.n = 0; this.barSig = '';
        if (gone.length) { this.toast('衣甲碎了', '十五息內挨了五下，' + gone.join('、') + '都碎了。'); SFX.fail(); }
      }
    }
    addCourage(n, src) {   // src 'kill'：斃敵對生靈；其餘（製作、採集、讀碑、捕魚、煉丹）廿二重起就不長了
      const p = this.player, l0 = this.level();
      if (src !== 'kill' && l0 >= KILL_ONLY_LEVEL) { if (n > 0 && !this.killOnlyHinted) { this.killOnlyHinted = true; this.toast('膽氣不長了', '廿二重起，膽氣只從斃敵對的生靈得來：白日八成、夜裡加半成。'); } return; }
      p.cour += n;
      const l = this.level();
      if (l > l0) {
        let extra = '';
        if (l === SHIP_LEVEL) extra = '可以造孤帆與方舟了。';
        else if (l === TOTEM_LEVEL) extra = '五件衣甲穿齊，衣上便浮出山海衣的獸紋：七格內獸慢而狠，你的攻擊 ×1.15。';
        else if (l > TOTEM_LEVEL && (l - TOTEM_LEVEL) % 7 === 0) extra = '山海衣再深一層：攻擊再 ×1.15，受傷再 ÷1.15。';
        else if (l === KILL_ONLY_LEVEL) extra = '從此膽氣只從斃敵對的生靈得來：白日八成、夜裡加半成。';
        else if (l === DECAY_LEVEL + 1) extra = '過了卅一重，三日一減，不低於卅一重。';
        this.toast('膽氣長了一重', '第 ' + l + ' 重：回復 ' + Math.round(this.mult() * 100) + '%。' + extra); SFX.learn();
        this.barSig = '';
      }
    }
    dropLevels(n) {          // 直接掉 n 重，保留這一重裡的進度比例
      const p = this.player, l = this.level(); if (l <= 0) return;
      const frac = this.levelFrac(), nl = Math.max(0, l - n);
      p.cour = this.levelAt(nl) + Math.floor(frac * levelCost(nl)); p.decayAt = 0; this.courSig = '';
    }
    decayCourage() {
      const p = this.player, l = this.level(); if (l <= this.decayFloor()) return;
      const frac = (p.cour - CUM[l]) / levelCost(l);
      p.cour = Math.min(CUM[l] - 1, Math.floor(CUM[l - 1] + frac * levelCost(l - 1)));
      this.toast('膽氣衰減', (this.hasHammer() ? '身攜九閽鳴雷，二日一減' : '過了卅一重，三日一減') + '：現在第 ' + this.level() + ' 重。', 6000);
    }
    // 照明：手裡的火把或蠟燭、頭上的燈帽
    heldLight() { const s = this.held(); const it = s && ITEMS[s.n]; return it && it.light ? it.light : 0; }
    hat() { return this.player.worn['帽'] || null; }                                     // 戴在頭上的燈帽才亮
    anyHat() { return this.player.worn['帽'] || this.player.bag.find(s => s.n === '燈帽') || null; }
    hatLight() { const h = this.hat(); return h && h.fuel > 0 ? ITEMS['燈帽'].light : 0; }
    lightRadius() { return Math.max(this.heldLight(), this.hatLight()); }
    hasLight() { return this.lightRadius() > 0; }
    torchLit() { return this.darkness() > 0.5 && this.hasLight(); }
    playerLight() { return 4.5 - 1.5 * this.darkness() + this.lightRadius(); }
    canAct() { const p = this.player; return !p.dead && p.knock <= 0 && p.ctrl; }
    vignette() {
      const p = this.player;
      return { red: p.hp < p.hpMax / 2 ? (1 - p.hp / (p.hpMax / 2)) * 0.6 : 0, green: p.poisonT > 0 ? 0.45 : 0, blue: p.insane ? 0.55 : p.swimming ? 0.4 : (p.san < 20 ? 0.25 : 0) };
    }

    // ---------- 主迴圈 ----------
    frame(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000 || 0.016); this.last = ts;
      const p = this.player;
      if (!this.paused) {
        if (p.knock > 0) {                       // 昏迷：五倍速過一刻，周圍照常
          const step = Math.min(dt * 5, p.knock);
          this.keys.clear(); this.action = null;
          this.update(step);
          p.knock -= step;
          $('knock-left').textContent = '還有 ' + Math.ceil(p.knock) + ' 息';
          if (p.knock <= 0) this.wake();
        } else this.update(dt);
      }
      this.renderer.draw(this, dt, ts / 1000);
      SFX.rain(!this.paused && this.world.raining());
      if (!$('map').classList.contains('hidden')) { this.mapAcc += dt; if (this.mapAcc > 0.5) { this.mapAcc = 0; this.renderer.drawBigMap(this, $('bigmap')); } }
      requestAnimationFrame((t) => this.frame(t));
    }
    update(dt) {
      const p = this.player;
      this.world.tick(dt, p.x, p.y);
      if (this.day() !== p.lastDay) this.newDay();
      this.handleMove(dt);
      if (p.sailing && p.ship && p.ship.skulls && p.ship.skulls.length) {   // 船頭的首骨到期風化
        const gone = p.ship.skulls.filter(x => x[1] <= this.world.time).map(x => x[0]);
        if (gone.length) { this.shipSkulls(p.ship); this.message('船頭的' + gone.join('、') + '風化了' + (p.ship.skulls.length ? '，還有' + p.ship.skulls.map(x => x[0]).join('、') + '鎮著。' : '，船頭空了。')); }
      }
      this.checkFog();
      this.checkWarn();
      this.tickStove();
      this.updateAction(dt);
      this.ents.update(dt, this);
      this.updateStats(dt);
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t >= f.dur) this.fx.splice(i, 1); }
      this.saveAcc += dt; if (this.saveAcc > 20) { this.saveAcc = 0; this.save(); }
      this.updateHUD();
    }
    newDay() {
      const p = this.player; p.lastDay = this.day();
      let fermented = 0;
      for (let i = p.bag.length - 1; i >= 0; i--) {
        const s = p.bag[i];
        if (s.n !== '果') continue;
        const ds = this.fruitDays(s);
        let k = 0; while (k < ds.length && p.lastDay - ds[k] >= FERMENT_NIGHTS) k++;   // 由陳到新，前面幾顆放滿了十五夜
        if (!k) continue;
        ds.splice(0, k); s.c -= k; fermented += k;
        if (s.c <= 0) p.bag.splice(i, 1);
      }
      if (fermented) {
        const left = this.addItem('醉果', fermented);
        if (left > 0) this.addItem('果', left, { d: p.lastDay - FERMENT_NIGHTS });   // 囊滿放不下的，先留在果裡，明天再醉
        this.toast('果子醉了', (fermented - left) + ' 顆放滿十五夜的果變成了醉果' + (left > 0 ? '，囊滿，還有 ' + left + ' 顆沒處放' : '') + '。吃了昏迷一刻；二醉果合一淡水成酒。');
      }
      this.buildBag();
    }

    // ---------- 生存數值：命、飽、暖、力、愜意 ----------
    updateStats(dt) {
      const p = this.player, w = this.world, dark = this.darkness(), m = this.mult();
      const tile = w.get(p.x, p.y), td = DB[tile];
      const drain = this.ironDrain();
      p.food = Math.max(0, p.food - dt * 0.14 * drain);
      let dw;
      if (td.shelter) dw = 5;
      else if (w.heatNear(p.x, p.y, 2)) dw = 4;
      else {
        dw = dark > 0.5 ? -0.7 : 1.5;
        if (tile === '雪') dw -= 1.2;
        if (td.kind === 'water') dw -= 1.0;
        if (dw < 0) { if (this.wornWarm()) dw *= 0.5; if (this.torchLit()) dw *= 0.4; }
      }
      p.warm = U.clamp(p.warm + dw * dt, 0, 100);
      if (w.nearChar(p.x, p.y, '泉', 1)) { p.hp = Math.min(p.hpMax, p.hp + 2 * dt); p.warm = Math.min(100, p.warm + 1.5 * dt); }
      // 手裡的光會燒
      const hs = this.held(), hit = hs && ITEMS[hs.n];
      if (dark > 0.5 && hit && hit.light && hit.life) {
        p.burn[hs.n] = (p.burn[hs.n] || 0) + dt;
        if (p.burn[hs.n] >= hit.life) { p.burn[hs.n] = 0; this.removeItem(hs.n, 1); this.message('一支' + hs.n + '燃盡了。'); }
      }
      const hat = this.hat();
      const otherLight = w.lightNear(p.x, p.y, 3) || this.heldLight() > 0 || this.ents.dragonNear(p.x, p.y, 3);   // 三格內有別的光，燈帽先熄著
      if (dark > 0.5 && hat && hat.fuel > 0 && !otherLight) { hat.fuel = Math.max(0, hat.fuel - dt); if (hat.fuel <= 0) { this.toast('燈帽暗了', '蠟燭燒完了。選中蠟燭按 V 續上。'); this.barSig = ''; } }
      // 力：每兩息回一點；愜意：每十五息掉一點
      if (p.swimming) p.sta = Math.max(0, p.sta - 0.25 * SWIM_DRAIN * dt);       // 游泳：力不回，反而掉
      else p.sta = Math.min(p.staMax, p.sta + 0.5 * m * dt);
      if (p.swimming) { p.swimT -= dt; if (p.swimT <= 0) { p.hp = 0; this.die('溺'); return; } }
      p.san = Math.max(0, p.san - dt / 15 * drain);
      this.sanAcc += dt;
      if (this.sanAcc >= 60) {                     // 每分鐘：鹿呦、鳥鳴、海浪各 +1
        this.sanAcc = 0; const heard = [];
        if (this.ents.nearOf('鹿', p.x, p.y, 10)) heard.push('鹿呦');
        if (this.ents.nearOf('鳥', p.x, p.y, 10)) heard.push('鳥鳴');
        if (w.nearChar(p.x, p.y, '淼', 8)) heard.push('海浪');
        if (heard.length) { p.san = Math.min(100, p.san + Math.round(heard.length * m)); this.fx.push({ type: 'float', x: p.x, y: p.y, text: heard.join(' ') + ' +' + heard.length, color: G.INK.water, t: 0, dur: 1.4 }); }
      }
      // 魄：四格內無光，蝕心耗力
      if (dark > 0.5 && !this.hasLight() && this.ents.ghostNear(p.x, p.y, 4)) { p.san = Math.max(0, p.san - 3 * dt); p.sta = Math.max(0, p.sta - 2 * dt * drain); if (!p.warned.drain) { p.warned.drain = true; this.toast('魄近身', '心裡發涼，手腳發軟。點亮火把或蠟燭。'); } }
      // 毒
      if (p.poisonT > 0) { p.poisonT -= dt; p.hp = Math.max(0, p.hp - p.poisonPer * dt); if (p.poisonT <= 0) { p.poisonPer = 0; this.message('毒勁過了。'); } }
      p.hurtT = Math.max(0, p.hurtT - dt); p.atkT = Math.max(0, p.atkT - dt);
      // 命：飽、愜意、力都在八成以上才回；餓、凍、力盡都耗。先看是不是已經沒命了，免得回血把零命救回來
      if (p.hp <= 0) { this.die(p.food <= 0 ? '餓' : p.warm <= 0 ? '凍' : p.sta <= 0 ? '累' : p.poisonT > 0 ? '毒' : '傷'); return; }
      let dh = 0;
      if (p.food <= 0) dh -= 2;
      if (p.warm <= 0) dh -= 3;
      if (p.sta <= 0) dh -= 2;
      if (dh === 0 && p.hurtT <= 0 && p.food >= 80 && p.san >= 80 && p.sta >= 80) dh = 1 * m;
      p.hp = U.clamp(p.hp + dh * dt, 0, p.hpMax);
      // 神志：愜意歸零則時能控時失控，失控越來越長
      if (p.san <= 0) {
        if (!p.insane) { p.insane = true; p.ctrl = true; p.ctrlT = 2; p.zeroSan = 0; this.toast('神志不清', '畫面泛藍，手腳不聽使喚。做點東西、吃點好的、睡一覺。'); }
        p.zeroSan += dt; p.ctrlT -= dt;
        if (p.ctrlT <= 0) { p.ctrl = !p.ctrl; p.ctrlT = p.ctrl ? 2 : Math.min(8, 2 + p.zeroSan / 10); if (!p.ctrl) this.action = null; }
      } else if (p.insane && p.san >= 10) { p.insane = false; p.ctrl = true; p.zeroSan = 0; this.message('神志清明了些。'); }
      // 提醒
      if (p.food < 25 && !p.warned.food) { p.warned.food = true; this.toast('你餓了', '摘野果、捉魚、獵鹿。生食傷身，灶上烤之。'); }
      if (p.food >= 40) p.warned.food = false;
      if (p.warm < 30 && !p.warned.warm) { p.warned.warm = true; this.toast('你冷了', '六石成灶，添木取暖；棉可為衣。'); }
      if (p.warm >= 50) p.warned.warm = false;
      if (p.san < 25 && !p.warned.san) { p.warned.san = true; this.toast('心裡發悶', '愜意快盡了。做點東西 +8，睡床 +20，果酒 +20，聽聽鹿呦鳥鳴海浪。'); }
      if (p.san >= 40) p.warned.san = false;
      const nn = this.nightNo();
      if (nn === this.diff.ghost - 1 && dark > 0.5 && !p.warned.eve) { p.warned.eve = true; this.toast('第 ' + nn + ' 夜', '明晚起，魄夜行。備好火把、蠟燭或燈帽。', 8000); }
      if (this.ghostNight() && !p.warned['g' + nn]) { p.warned['g' + nn] = true; this.toast('第 ' + nn + ' 夜', '魄來了。穿牆，不怕磚；手裡有光六格內即煙滅。', 8000); }
      // 衣甲：一百八十日勻速穿破；挨打那一輪過了十五息，加速便固定下來
      const win = p.hitWin;
      if (win.n && w.time - win.start > 15) { for (const s of this.wornList()) s.wm = Math.min(WEAR_CAP, (s.wm || 1) * HIT_MULT[win.n]); win.n = 0; }
      const wearRate = HIT_MULT[win.n] || 1;
      for (const k of SLOT_ORDER) {
        const s = p.worn[k]; if (!s || s.dur === undefined) continue;
        s.dur -= dt * (s.wm || 1) * wearRate;
        if (s.dur <= 0) { p.worn[k] = null; this.barSig = ''; this.toast('「' + s.n + '」穿破了', '壽命到頭了。'); SFX.fail(); }
      }
      // 膽氣過了卅一重，三日一減，不低於卅一重
      if (this.level() > this.decayFloor()) {
        if (!p.decayAt) p.decayAt = w.time + this.decayDays() * DAY;
        else if (w.time >= p.decayAt) { this.decayCourage(); p.decayAt = w.time + this.decayDays() * DAY; }
      } else p.decayAt = 0;
      // 渡海：開到海的盡頭
      if (p.sailing && !p.crossed && Math.hypot(p.x, p.y) > G.SEA_EDGE) this.crossSea();
      if (p.hp <= 0) this.die(p.food <= 0 ? '餓' : p.warm <= 0 ? '凍' : p.sta <= 0 ? '累' : p.poisonT > 0 ? '毒' : '傷');
    }
    die(cause) {
      const p = this.player, w = this.world;
      p.dead = true; p.deaths++; p.knock = 0; $('knock').classList.add('hidden');
      const drop = p.bag.concat(p.tools, this.wornList());
      for (const s of drop) if (s.dur !== undefined) s.dur = Math.max(1, Math.floor(s.dur / 2));   // 留下的東西，有耐久的全打對折（可修）
      const landOk = (x, y) => { const d = w.info(x, y); return d.walk > 0 && d.kind !== 'object' && d.kind !== 'place' && !w.stele(x, y) && DB[w.raw(x, y)].kind !== 'water' && w.raw(x, y) !== '灘'; };
      if (p.sailing) {           // 船停在最近的淺水上
        this.parkShip(p.x, p.y, true, 60); p.sailing = false;
      }
      if (drop.length) {
        const spot = this.nearestTile(p.x, p.y, landOk, 80) || [this.spawn.x, this.spawn.y];
        w.set(spot[0], spot[1], '包'); w.bags.set(U.key(spot[0], spot[1]), drop);
        p.bag = []; p.tools = []; p.tool = -1; for (const k of SLOT_ORDER) p.worn[k] = null;
      }
      this.paused = true;
      $('dead-text').innerHTML = '第 ' + this.day() + ' 日，你' + ({ '餓': '餓死了', '凍': '凍死了', '傷': '傷重而亡', '毒': '毒發身亡', '累': '力竭而亡', '溺': '沒能游上岸，溺死了' })[cause] + '。<br>荷包落在原地，可以回去取，有耐久的東西都折了一半。膽氣減六成。';
      $('dead').classList.remove('hidden');
      this.save();
    }
    respawn() {
      const p = this.player, w = this.world;
      const h = p.home, homeOk = h && w.get(h.x, h.y) === '床';
      let at = homeOk ? this.freeNear(h.x, h.y) : this.spawn;
      const landOk = (x, y) => w.walkable(x, y) && DB[w.get(x, y)].kind !== 'water';
      if (!landOk(at.x, at.y)) { const t = this.nearestTile(at.x, at.y, landOk, 40); if (t) at = { x: t[0], y: t[1] }; }   // 出生點被蓋住或淹了，就找最近能站的地
      p.x = p.rx = at.x; p.y = p.ry = at.y; p.moveT = 0;
      p.hp = Math.min(p.hpMax, 60); p.food = 60; p.warm = 60; p.sta = p.staMax; p.san = Math.max(p.san, 50); p.cour = Math.floor(p.cour * 0.4); p.decayAt = 0; p.hitWin = { start: -99, n: 0 };
      p.swimming = false; p.swimT = 0; p.ship = null;
      p.hurtT = 0; p.dead = false; p.warned = {}; p.poisonT = 0; p.poisonPer = 0; p.biteN = 0; p.insane = false; p.ctrl = true; p.zeroSan = 0; p.sailing = false; p.crossed = false;
      this.action = null;
      w.time = Math.floor(w.time / DAY) * DAY + DAY * 1.03;
      this.ents.list = this.ents.list.filter(e => '虎豹狼蛇蛛魄'.indexOf(e.type) < 0);
      this.gatherCompanions();
      $('dead').classList.add('hidden');
      this.paused = false;
      this.toast('你在一個清晨醒來', homeOk ? '在你的床邊。' : '在最初的地方。');
      this.buildBag();
    }
    // ---------- 海：船的命、首骨鎮船、蜃、落水 ----------
    shipMax(s) { return (G.SHIPS[s && s.kind] || G.SHIPS['孤帆']).hp; }
    shipSkulls(s) { const now = this.world.time; s.skulls = (s.skulls || []).filter(x => x[1] > now); return s.skulls; }   // 到期的首骨風化、自己掉
    shipWarded() { const s = this.player.ship; return !!(s && this.shipSkulls(s).length); }
    wardDaysOf(s) { const a = this.shipSkulls(s); return a.length ? Math.max(0, Math.ceil((Math.max(...a.map(x => x[1])) - this.world.time) / DAY - 1e-6)) : 0; }   // 鎮到最晚風化的那一個
    wardDays() { return this.player.ship ? this.wardDaysOf(this.player.ship) : 0; }
    shipSkullName() { const s = this.player.ship, a = s ? this.shipSkulls(s) : []; return a.length ? a[0][0] : ''; }
    shipCells() { const p = this.player; return this.world.shipFootprint(p.ship ? p.ship.kind : '孤帆', p.x, p.y); }   // 行船時船身在哪幾格
    shipText(s) { const a = this.shipSkulls(s), k = G.SHIPS[s.kind] || G.SHIPS['孤帆']; return s.kind + ' · 命 ' + Math.round(s.hp) + '/' + k.hp + ' · 船頭' + (a.length ? a.map(x => x[0]).join('、') + '（' + a.length + '/' + k.slots + '）還鎮 ' + this.wardDaysOf(s) + ' 日' : '空著（放得下 ' + k.slots + ' 個首骨）'); }
    mountSkull(rec, name) {
      if (!rec) return;
      const now = this.world.time, alive = this.shipSkulls(rec), slots = (G.SHIPS[rec.kind] || G.SHIPS['孤帆']).slots;
      if (alive.length >= slots) { this.message(rec.kind + '的船頭只放得下 ' + slots + ' 個首骨，都放滿了：' + alive.map(a => a[0]).join('、') + '。'); SFX.fail(); return; }
      alive.push([name, now + ITEMS[name].ward * DAY]);   // 各鎮各的：從放上去那一刻算，到期風化
      this.removeItem(name, 1); this.buildBag(); SFX.learn();
      this.message('船頭放上' + name + '（' + alive.length + '/' + slots + '）：鎮 ' + ITEMS[name].ward + ' 日後風化；船頭最久鎮到 ' + this.wardDaysOf(rec) + ' 日後，這段時間蜃不敢撞船。');
    }
    repairShip(rec) {          // 第 n 次修要 n 塊木板，每次回滿命的四分之一
      if (!rec) return;
      const max = this.shipMax(rec), cost = (rec.repairs || 0) + 1;
      if (rec.hp >= max) { this.message('船好好的，不用補。'); return; }
      if (this.count('木板') < cost) { this.message('這是第 ' + cost + ' 次修，要木板 ' + cost + ' 塊（每修一次多一塊），囊裡只有 ' + this.count('木板') + ' 塊。'); SFX.fail(); return; }
      rec.hp = Math.min(max, rec.hp + Math.round(max * SHIP_REPAIR_FRAC)); rec.repairs = cost; this.removeItem('木板', cost); this.buildBag(); SFX.write();
      this.message('木板 ' + cost + ' 塊補上船身：命 ' + Math.round(rec.hp) + '/' + max + '。下次修要 ' + (cost + 1) + ' 塊。');
    }
    hintOnce(text) { if (this.msgText.indexOf(text) < 0) this.message(text); }
    seaMonsterRose(m) { const p = this.player, dx = m.x - p.x, dy = m.y - p.y; this.toast('蜃！', this.dirName(dx, dy) + '約 ' + Math.round(Math.hypot(dx, dy)) + ' 步，深海裡浮上一頭蜃。牠會撞船、吐霧；船頭有獸首骨就不敢近。'); SFX.tiger(); }
    ramShip(e) {
      const p = this.player, s = p.ship; if (!p.sailing || !s) return;
      const dmg = Math.round(DB[e.type].ram * this.diff.taken);
      s.hp = Math.max(0, s.hp - dmg); this.renderer.shake = 0.6; SFX.tiger();
      this.fx.push({ type: 'float', x: p.x, y: p.y, text: '船 −' + dmg, color: G.INK.red, t: 0, dur: 0.9 });
      if (s.hp <= 0) { this.wreck(); return; }
      this.message('蜃撞船！' + s.kind + '的命 ' + Math.round(s.hp) + '/' + this.shipMax(s) + '。');
    }
    wreck() {
      const p = this.player; p.sailing = false; p.ship = null; p.swimming = true; p.swimT = SWIM_TIME; this.action = null;
      const shore = this.nearestShore();
      this.toast('船毀了！', SWIM_TIME + ' 息內游到岸上，否則溺死。' + (shore ? '最近的岸在' + shore.dir + '約 ' + shore.n + ' 步。' : '') + '游泳時飽、愜意、力掉得快一倍，武器傷害少四分之一。', 9000); SFX.fail();
    }
    nearestShore() {
      const p = this.player, w = this.world, t = this.nearestTile(p.x, p.y, (x, y) => { const d = w.info(x, y); return d.walk > 0 && d.kind !== 'water'; }, 60);
      return t ? { x: t[0], y: t[1], dir: this.dirName(t[0] - p.x, t[1] - p.y), n: Math.max(Math.abs(t[0] - p.x), Math.abs(t[1] - p.y)) } : null;
    }

    // ---------- 霧障 ----------
    dirName(dx, dy) {
      const a = Math.atan2(dy, dx) * 180 / Math.PI, names = ['東', '東南', '南', '西南', '西', '西北', '北', '東北'];
      return names[((Math.round(a / 45) % 8) + 8) % 8] + '方';
    }
    checkFog() {          // 走進一片霧障：問要不要用扇子；同一片霧裡走動不再問，出去再進來才問
      const p = this.player; if (p.dead || p.knock > 0 || this.fogAsk) return;
      const f = this.world.fogAt(p.x, p.y);
      if (!f) { p.inFog = 0; return; }
      if (p.inFog === f.id) return;
      this.askFog(f);
    }
    askFog(f) {
      const n = this.count('扇');
      this.fogAsk = f.id; this.paused = true; this.keys.clear(); this.action = null;
      $('fogask-text').innerHTML = '一片霧障，' + f.cells.size + ' 格。不吹散就硬闖，命、飽、暖、力、愜意各掉當前的一成（不會致命）。' + (n ? '<br>囊中有扇子 ' + n + ' 把。' : '<br>你身上沒有扇子（草四木一可紮一把）。');
      $('fogask-use').classList.toggle('hidden', !n); $('fogask-use').textContent = '用一把扇子吹散（' + n + '）';
      $('fogask-no').textContent = n ? '不用，硬闖' : '穿霧而過';
      $('fogask').classList.remove('hidden');
    }
    closeFog() { $('fogask').classList.add('hidden'); this.fogAsk = null; this.paused = false; }
    // ---------- 灶：面向灶按 F 開界面，在界面裡添柴、烤、燒、煉；世界照常走，火照常燒 ----------
    openStove(t) { this.stoveAt = U.key(t.x, t.y); $('stove').classList.remove('hidden'); this.keys.clear(); this.action = null; this.stoveSig = ''; this.buildStove(); }
    closeStove() { $('stove').classList.add('hidden'); this.stoveAt = null; }
    stovePos() { const [x, y] = U.unkey(this.stoveAt); return { x, y }; }
    fuelOf(name) { return FUEL[name] || (DB[name] && DB[name].flam > 0 ? DB[name].s * 15 : 0); }   // 一件燒幾息：煤精煤照表，木類筆畫乘十五
    stoveFuel(name) {
      if (!this.stoveAt) return false;
      const t = this.stovePos(), w = this.world, sec = this.fuelOf(name);
      if (!sec || this.count(name) < 1) return false;
      w.addFuel(t.x, t.y, sec); this.removeItem(name, 1); this.message((FUEL[name] ? '添煤' : '添柴') + '。灶火還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); this.buildBag(); this.buildStove(); return true;
    }
    stoveCook(name) {
      if (!this.stoveAt) return false;
      const t = this.stovePos(), w = this.world, ck = G.COOK[name]; if (!ck) return false;
      const need = ck.n || 1;
      if (!w.stoveLit(t.x, t.y)) { this.message('灶是冷的，先添些柴。'); SFX.fail(); return false; }
      if (this.count(name) < need) { this.message('要 ' + need + ' 個' + name + '才夠。'); SFX.fail(); return false; }
      for (const m in ck.extra || {}) if (this.count(m) < ck.extra[m]) { this.message('還要 ' + m + ' ×' + ck.extra[m] + '。'); SFX.fail(); return false; }
      this.removeItem(name, need); for (const m in ck.extra || {}) this.removeItem(m, ck.extra[m]); this.addItem(ck.out, ck.k || 1);
      this.message((ck.verb || (ck.out === '玻璃瓶' ? '燒成了' : ck.out === '淡水瓶' ? '蒸餾成了' : '烤好了')) + '：' + ck.out + (ck.k > 1 ? ' ×' + ck.k : '')); SFX.fuse();
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: ck.out, color: G.INK.red, t: 0, dur: 1 });
      this.buildBag(); this.buildStove(); return true;
    }
    stoveVerb(ck) { return ck.verb === '煉成了' ? '煉' : ck.out === '玻璃瓶' ? '燒' : ck.out === '淡水瓶' ? '蒸餾' : '烤'; }
    buildStove() {
      if (!this.stoveAt) return;
      const t = this.stovePos(), w = this.world, lit = w.stoveLit(t.x, t.y);
      $('stove-fire').innerHTML = lit ? '<i class="fire">火旺，還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息</i>' : '<i>灶是冷的，先添柴</i>';
      const fuels = [];
      for (const s of this.player.bag) { const sec = this.fuelOf(s.n); if (sec && !fuels.some(f => f.n === s.n)) fuels.push({ n: s.n, c: this.count(s.n), sec }); }
      $('stove-fuel').innerHTML = fuels.length ? fuels.map(f => '<button class="ghost" data-fuel="' + f.n + '"><span class="ch">' + f.n + '</span> ×' + f.c + ' <small>+' + f.sec + ' 息</small></button>').join('') : '<span class="dim">囊裡沒有能燒的東西（木、煤、精煤……）。</span>';
      const cooks = [];
      for (const n in G.COOK) { const c = this.count(n); if (c > 0) cooks.push({ n, c, ck: G.COOK[n] }); }
      const needText = (n, ck) => n + (ck.n > 1 ? ' ×' + ck.n : '') + Object.keys(ck.extra || {}).map(m => ' + ' + m + ' ×' + ck.extra[m]).join('');
      $('stove-cook').innerHTML = cooks.length ? cooks.map(({ n, c, ck }) => {
        const can = lit && c >= (ck.n || 1) && Object.keys(ck.extra || {}).every(m => this.count(m) >= ck.extra[m]);
        return '<button data-cook="' + n + '"' + (can ? '' : ' disabled') + '><span class="ch">' + n + '</span> ×' + c + ' <small>' + this.stoveVerb(ck) + '：' + needText(n, ck) + ' → ' + ck.out + (ck.k > 1 ? ' ×' + ck.k : '') + '</small></button>';
      }).join('') : '<span class="dim">囊裡沒有能烤、燒、煉的東西。</span>';
      $('stove-fuel').querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.stoveFuel(b.dataset.fuel)));
      $('stove-cook').querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.stoveCook(b.dataset.cook)));
    }
    tickStove() {         // 界面開著時：灶被拆了就關；火滅了或囊變了就重畫；剩幾息每息更新
      if (!this.stoveAt) return;
      const t = this.stovePos(), w = this.world;
      if (w.get(t.x, t.y) !== '灶' || U.cheb(this.player.x, this.player.y, t.x, t.y) > 1) { this.closeStove(); return; }
      const sig = (w.stoveLit(t.x, t.y) ? 1 : 0) + '|' + this.player.bag.map(s => s.n + s.c).join(',');
      if (sig !== this.stoveSig) { this.stoveSig = sig; this.buildStove(); }
      else if (w.stoveLit(t.x, t.y)) { const left = Math.round(w.stoveFuel(t.x, t.y)); if (left !== this.stoveLeft) { this.stoveLeft = left; $('stove-fire').innerHTML = '<i class="fire">火旺，還能燒 ' + left + ' 息</i>'; } }
    }
    // ---------- 數值提醒：不到五成亮燈（HUD），不到四分之一彈窗（困難只亮燈）；回到五成以上才會再提醒 ----------
    vitalFracs() { const p = this.player; return [['hp', '命', p.hp / p.hpMax], ['food', '飽', p.food / 100], ['warm', '暖', p.warm / 100], ['sta', '力', p.sta / p.staMax], ['san', '愜意', p.san / 100]]; }
    checkWarn() {
      const p = this.player; if (p.dead) return;
      if (!p.warnLow) p.warnLow = {};
      const low = [];
      for (const [k, name, frac] of this.vitalFracs()) { if (frac < WARN_POP) { if (!p.warnLow[k]) low.push([k, name]); } else if (frac >= WARN_LIGHT) p.warnLow[k] = false; }
      if (!low.length) return;
      if (this.warnOpen || this.fogAsk || this.seaAsk || p.knock > 0 || this.paused) return;   // 別的彈窗開著就等一等
      for (const [k] of low) p.warnLow[k] = true;
      if (this.diff.warn && this.warnEnabled) this.showWarn(low);
    }
    showWarn(low) {
      const ADVICE = { hp: '別打了：吃藥療傷，找有牆的地方歇著。飽、愜意、力都在八成以上，命才慢慢回。', food: '吃點東西：野果、烤魚、烤肉。餓到底會掉命。', warm: '靠近火把、灶火或燈，穿上衣甲，別在夜裡吹風。冷到底會掉命。', sta: '停下手上的活，歇著或睡一覺。力竭會掉命。', san: '點亮火把、離開黑處與魄，做點東西、吃點好的。愜意歸零會神志不清。' };
      this.warnOpen = true; this.paused = true; this.keys.clear(); this.action = null;
      $('warn-title').textContent = low.map(x => x[1]).join('、') + '不到四分之一';
      $('warn-text').innerHTML = low.map(([k, name]) => '<b>' + name + '</b>：' + ADVICE[k]).join('<br>');
      $('warn').classList.remove('hidden');
    }
    closeWarn() { $('warn').classList.add('hidden'); this.warnOpen = false; this.paused = false; }
    fogUseFan() {
      const id = this.fogAsk; if (!id || this.count('扇') < 1) return;
      this.closeFog(); this.blowFog(this.world.fogs.get(id));
    }
    fogRefuse() {
      const id = this.fogAsk; if (!id) return;
      this.closeFog(); this.player.inFog = id; this.fogToll();
    }
    blowFog(f) {
      if (!f) return;
      const c = this.world.fogCenter(f);
      this.removeItem('扇', 1); this.world.removeFog(f.id); this.player.inFog = 0;
      this.fx.push({ type: 'write', x: Math.round(c.x), y: Math.round(c.y), ch: '風', color: G.INK.water, t: 0, dur: 0.7 });
      this.message('一把扇子搧下去，霧障散了。囊中還有扇子 ' + this.count('扇') + ' 把。'); SFX.absorb(); this.buildBag();
    }
    fogToll() {           // 五樣數值各掉當前的一成，四捨五入；命不會因此歸零
      const p = this.player, cut = (v) => Math.round(v * FOG_TOLL), parts = [];
      const lose = { '命': cut(p.hp), '飽': cut(p.food), '暖': cut(p.warm), '力': cut(p.sta), '愜意': cut(p.san) };
      p.hp = Math.max(Math.min(p.hp, 1), p.hp - lose['命']); p.food -= lose['飽']; p.warm -= lose['暖']; p.sta -= lose['力']; p.san -= lose['愜意'];
      for (const k in lose) parts.push(k + ' −' + lose[k]);
      this.fx.push({ type: 'float', x: p.x, y: p.y, text: '霧', color: G.INK.ash, t: 0, dur: 1.2 });
      this.message('穿霧而過：' + parts.join('、') + '。'); SFX.fail();
    }
    // 停船：只停在真的水上。灘在漲潮時讀起來是「水」，停在那裡退潮就擱淺，還會堵住去燈塔的路
    parkShip(x, y, shallowOnly, maxR) {
      const w = this.world, s = this.player.ship || World.newShip('孤帆');
      const ok = (i, j) => (shallowOnly ? w.raw(i, j) === '水' : DB[w.raw(i, j)].kind === 'water') && !w.shipCells.has(U.key(i, j));
      const fits = (i, j) => w.shipFits(s.kind, i, j, ok);
      const at = fits(x, y) ? [x, y] : this.nearestTile(x, y, fits, maxR);
      if (at) { w.addShip(at[0], at[1], s); this.player.ship = null; }
      return at;
    }
    nearestTile(x0, y0, ok, maxR) {     // 由近而遠一圈圈找
      for (let r = 0; r <= maxR; r++) for (let i = -r; i <= r; i++) for (const [x, y] of r ? [[x0 + i, y0 - r], [x0 + i, y0 + r], [x0 - r, y0 + i], [x0 + r, y0 + i]] : [[x0, y0]]) if (ok(x, y)) return [x, y];
      return null;
    }
    freeNear(x, y, outside) {   // outside：找給生靈站的格子，不能在小屋裡
      for (const [dx, dy] of N8) if (this.world.walkable(x + dx, y + dy) && !(outside && this.world.sheltered(x + dx, y + dy, '鷹'))) return { x: x + dx, y: y + dy };
      if (outside) for (let r = 2; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((Math.abs(dx) === r || Math.abs(dy) === r) && this.world.walkable(x + dx, y + dy) && !this.world.sheltered(x + dx, y + dy, '鷹')) return { x: x + dx, y: y + dy };
      return this.spawn;
    }

    // ---------- 囊：十六格 ----------
    has(n) { return this.player.bag.some(s => s.n === n); }
    count(n) { let c = 0; for (const s of this.player.bag) if (s.n === n) c += s.c; return c; }
    canAdd(n, c) {
      c = c || 1; const bag = this.player.bag, it = G.item(n);
      if (it && (it.dur || it.single)) return Math.max(0, c - (it.dur ? this.toolSlots() - this.player.tools.length : 0)) + bag.length <= this.slots();
      for (const s of bag) if (s.n === n && s.dur === undefined && s.c < STACK) c -= Math.min(c, STACK - s.c);
      return c <= 0 || bag.length + Math.ceil(c / STACK) <= this.slots();
    }
    addItem(n, c, extra) {
      const bag = this.player.bag, it = G.item(n);
      if ((it && (it.dur || it.single)) || (extra && (extra.dur !== undefined || extra.store))) {     // 工具、穿過的衣甲、燈帽、裝著東西的櫃各佔一格
        const tools = this.player.tools, isTool = this.isTool(n);
        while (c > 0 && isTool && tools.length < this.toolSlots()) { tools.push(Object.assign({ n, c: 1, dur: it.dur }, extra || {})); if (this.player.tool < 0) this.player.tool = tools.length - 1; c--; }
        while (c > 0 && bag.length < this.slots()) { bag.push(Object.assign({ n, c: 1 }, it && it.dur ? { dur: it.dur } : {}, it && it.single && it.fuel !== undefined ? { fuel: it.fuel } : {}, extra || {})); c--; }
        this.barSig = ''; return c;
      }
      // 果：每顆帶著摘下的日數（extra.ds 由陳到新；舊格式 extra.d 整批同一天；沒給就是今天摘的），不分堆，陳的先放
      let days = null;
      if (n === '果') { days = extra && extra.ds ? extra.ds.slice().sort((a, b) => a - b) : []; while (days.length < c) days.push(extra && extra.d !== undefined ? extra.d : this.day()); }
      for (const s of bag) {
        if (s.n !== n || s.dur !== undefined || s.store || s.c >= STACK) continue;
        const k = Math.min(c, STACK - s.c);
        if (days) { this.fruitDays(s); s.ds.push(...days.splice(0, k)); s.ds.sort((a, b) => a - b); }
        s.c += k; c -= k; if (!c) break;
      }
      while (c > 0 && bag.length < this.slots()) { const k = Math.min(c, STACK); const s = { n, c: k }; if (days) s.ds = days.splice(0, k); bag.push(s); c -= k; }
      this.barSig = '';
      return c;
    }
    // 果：一疊裡每顆各記摘下的日數 ds（由陳到新）；舊存檔整疊一個 d 的，補成 ds
    fruitDays(s) {
      if (!Array.isArray(s.ds)) s.ds = [];
      const d0 = s.d !== undefined ? s.d : this.day();
      while (s.ds.length < s.c) s.ds.push(d0);
      if (s.ds.length > s.c) s.ds.length = s.c;
      delete s.d;
      s.ds.sort((a, b) => a - b);
      return s.ds;
    }
    fruitNote(s) {       // 滑鼠停在果上：每批放了幾夜
      const ds = this.fruitDays(s), today = this.day(), m = new Map();
      for (const d of ds) { const a = today - d; m.set(a, (m.get(a) || 0) + 1); }
      return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([a, k]) => (a >= 1 ? a + ' 夜' : '今天摘的') + ' ×' + k).join('、') + '；先吃最陳的，放滿十五夜變醉果。';
    }
    // 先吃陳的：每一顆都從所有果裡挑摘得最早的；回傳拿掉的那幾顆的日數
    takeFruit(c) {
      const p = this.player, bag = p.bag, taken = [];
      while (c > 0) {
        let best = null;
        for (const s of bag) { if (s.n !== '果' || s.c <= 0) continue; this.fruitDays(s); if (!best || s.ds[0] < best.ds[0]) best = s; }
        if (!best) break;
        taken.push(best.ds.shift()); best.c--; c--;
        if (best.c <= 0) bag.splice(bag.indexOf(best), 1);
      }
      if (p.sel >= bag.length) p.sel = Math.max(0, bag.length - 1);
      this.barSig = '';
      return taken;
    }
    removeItem(n, c) {
      const bag = this.player.bag;
      if (n === '果') { this.takeFruit(c); return; }
      for (let i = bag.length - 1; i >= 0 && c > 0; i--) { if (bag[i].n !== n) continue; const k = Math.min(c, bag[i].c); bag[i].c -= k; c -= k; if (bag[i].c <= 0) bag.splice(i, 1); }
      if (this.player.sel >= bag.length) this.player.sel = Math.max(0, bag.length - 1);
      this.barSig = '';
    }
    held() { return this.player.bag[this.player.sel] || null; }
    // 具欄：六格工具，P 換手持（含空手）
    isTool(n) { const it = ITEMS[n]; return !!(it && it.tool && it.dur); }
    activeTool() { return this.player.tools[this.player.tool] || null; }
    heldTool() { const s = this.activeTool(); return s ? ITEMS[s.n].tool : null; }
    heldDmg() { const s = this.activeTool(); return s ? (ITEMS[s.n].dmg || 0) : 0; }
    wearTool() {
      const p = this.player, s = this.activeTool(); if (!s) return;
      s.dur--; this.barSig = '';
      if (s.dur <= 0) { const n = s.n; p.tools.splice(p.tool, 1); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1; this.toast('「' + n + '」鈍壞了', '石子磨石，再做一把。'); SFX.fail(); }
    }
    cycleTool(d) {
      const p = this.player, n = p.tools.length;
      if (!n) { p.tool = -1; this.message('具欄空空。石一、石子一、木一可磨出工具。'); return; }
      p.tool = p.tool + d; if (p.tool >= n) p.tool = -1; else if (p.tool < -1) p.tool = n - 1;
      this.message(p.tool < 0 ? '空手。' : '手持「' + p.tools[p.tool].n + '」。'); this.buildBag();
    }
    equipFromBag(i) {
      const p = this.player, s = p.bag[i]; if (!s || !this.isTool(s.n)) return false;
      if (p.tools.length >= this.toolSlots()) { this.message('具欄滿了。'); SFX.fail(); return false; }
      p.bag.splice(i, 1); p.tools.push(s); if (p.tool < 0) p.tool = p.tools.length - 1;
      if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
      this.barSig = ''; this.buildBag(); this.message('「' + s.n + '」移進具欄。'); SFX.write(); return true;
    }
    unequipToBag(i) {
      const p = this.player, s = p.tools[i]; if (!s) return;
      if (p.bag.length >= this.slots()) { this.message('囊已滿。'); SFX.fail(); return; }
      p.tools.splice(i, 1); p.bag.push(s); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1;
      this.barSig = ''; this.buildBag(); this.message('「' + s.n + '」移回囊。'); SFX.write();
    }
    spendSta(n) { const p = this.player; if (p.sta < n) { this.message('力氣不夠，歇一歇。'); SFX.fail(); return false; } p.sta -= n; return true; }

    // ---------- 移動 ----------
    pass(x, y) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (this.player.sailing || this.player.swimming) return d.kind === 'water' || d.walk > 0;
      const w = this.world, p = this.player;
      if (ch === '水' && w.raw(x, y) === '灘' && w.raw(p.x, p.y) === '灘') return true;   // 漲潮困在灘上：可涉水走到別的灘
      return d.walk > 0 || (ch === '水' && this.has('竹筏'));
    }
    handleMove(dt) {
      const p = this.player;
      if (p.moveT > 0) {
        p.moveT -= dt;
        const k = 1 - Math.max(0, p.moveT) / p.stepDur;
        p.rx = U.lerp(p.fromX, p.x, k); p.ry = U.lerp(p.fromY, p.y, k);
        if (p.moveT <= 0) { p.rx = p.x; p.ry = p.y; this.onArrive(); }
        else return;
      }
      if (p.knock > 0 || p.dead) return;
      let dx = 0, dy = 0;
      if (p.insane && !p.ctrl) { const d = N8[Math.floor(Math.random() * 8)]; dx = d[0]; dy = d[1]; }   // 失控：亂走
      else for (const code of this.keys) { const d = DIRS[code]; if (d) { dx += d[0]; dy += d[1]; } }
      dx = U.sign(dx); dy = U.sign(dy);
      if (!dx && !dy) return;
      p.fx = dx; p.fy = dy;
      if (this.action) this.action = null;
      this.tryStep(dx, dy) || (dx && dy && (this.tryStep(dx, 0) || this.tryStep(0, dy)));
    }
    tryStep(dx, dy) {
      const p = this.player, w = this.world, nx = p.x + dx, ny = p.y + dy;
      if (!this.pass(nx, ny) || this.ents.beastAt(nx, ny)) return false;
      if (dx && dy && !(this.pass(p.x + dx, p.y) && this.pass(p.x, p.y + dy))) return false;
      const d = w.info(nx, ny);
      if (p.sailing) {
        const kind = p.ship ? p.ship.kind : '孤帆';
        if (d.kind !== 'water') {        // 船頭撞岸：靠岸，船留在水上（灘不算水，退潮會擱淺）
          if (!this.parkShip(p.x, p.y, false, 8)) { this.message('灘上靠不了岸，退潮會擱淺。往深一點的水去。'); return false; }
          p.sailing = false; this.message('靠岸了。船停在那裡。');
        } else if (!w.shipFits(kind, nx, ny, (x, y) => DB[w.get(x, y)].kind === 'water' && !w.shipCells.has(U.key(x, y)))) {
          this.hintOnce(kind + '的船身' + (kind === '方舟' ? '二乘三' : '一乘二') + '，這邊過不去，找寬一點的水。'); return false;
        }
      }
      if (p.swimming && d.kind !== 'water') { p.swimming = false; p.swimT = 0; this.toast('上岸了', '撿回一條命。船沒了，要渡海得再造一艘。'); SFX.learn(); }
      p.fromX = p.x; p.fromY = p.y; p.x = nx; p.y = ny;
      p.stepDur = (p.sailing ? 0.14 / ((G.SHIPS[p.ship ? p.ship.kind : '孤帆'] || G.SHIPS['孤帆']).speed || 1) : p.swimming ? SWIM_STEP : 0.17 / (d.walk > 0 ? d.walk : 0.6)) * (dx && dy ? 1.3 : 1) / this.ironSpeed();
      p.moveT = p.stepDur;
      return true;
    }
    onArrive() { if (!this.player.sailing) this.world.trample(this.player.x, this.player.y); }
    facing() { return { x: this.player.x + this.player.fx, y: this.player.y + this.player.fy }; }

    // ---------- 取（E） ----------
    pressGather(silent) {
      if (this.action || !this.canAct()) { if (!this.canAct() && !silent) this.message(this.player.ctrl ? '' : '手腳不聽使喚。'); return; }
      const p = this.player, w = this.world, t = this.facing(), e = this.ents.at(t.x, t.y);
      if (this.heldTool() === '鎚') {
        const targets = this.ents.list.filter(o => '鹿虎豹狼蛇蛛蟾蜃'.indexOf(o.type) >= 0 && U.cheb(o.x, o.y, p.x, p.y) <= HAMMER_RANGE);
        if (targets.length || (e && e.type !== '龍')) { this.hammerStrike(targets); return; }
      }
      if (this.heldTool() === '焚') {
        const targets = this.ents.list.filter(o => ('鹿虎豹狼蛇蛛蟾蜃龜'.indexOf(o.type) >= 0 || (o.type === '鷹' && !o.tame)) && U.cheb(o.x, o.y, p.x, p.y) <= HAMMER_RANGE);
        if (targets.length || (e && e.type !== '龍')) { this.fireStrike(targets); return; }
      }
      if (e) {
        if (e.type === '龍') { this.message('你的龍。'); return; }
        if (e.type === '魄') { this.message('魄無形，打不著；用光。'); return; }
        if (e.type === '魚') { this.catchFish(e); return; }
        if (e.type === '鳥') { this.message('鳥飛了。'); e.moveT = 0; return; }
        this.attack(e); return;
      }
      if (p.swimming) { this.message('游泳時騰不出手，先上岸。'); return; }
      if (p.sailing) { this.message('船上做不了這個，先靠岸。'); return; }
      const ch = w.get(t.x, t.y), d = DB[ch], hs = this.held();
      // 空瓶取水
      if (hs && hs.n === '玻璃瓶') {
        if (d.kind === 'water') { this.removeItem('玻璃瓶', 1); this.addItem('海水瓶', 1); this.message('取了一瓶海水。'); SFX.absorb(); return; }
        if (ch === '泉' || ch === '井') { this.removeItem('玻璃瓶', 1); this.addItem('淡水瓶', 1); this.message('取了一瓶淡水。'); SFX.absorb(); return; }
      }
      const pl = w.placeAt(t.x, t.y);
      if (pl) { this.readPlace(pl); return; }
      if (ch === '碑') { this.readStele(t); return; }
      if (ch === '包') { this.pickBag(t); return; }
      if (ch === '漁') { this.harvestWeir(t); return; }
      if (d.net) { this.useNet(t); return; }
      if (ch === '門') { this.askRoad(t); return; }
      if (ch === '櫃') { this.openChest(t); return; }
      if (ch === '舟') { this.board(t); return; }
      const tool = this.heldTool();
      if (tool === '鋤' && (ch === '土' || ch === '草')) {
        if (p.sta < 1) { if (!silent) this.message('力氣不夠，歇一歇。'); return; }
        p.sta = Math.max(0, p.sta - this.ironDrain()); w.set(t.x, t.y, '田'); w.extinguish(t.x, t.y); this.wearTool(); this.addCourage(1); this.message('鋤之成田。'); SFX.write();
        this.fx.push({ type: 'write', x: t.x, y: t.y, ch: '田', color: DB['田'].ink, t: 0, dur: 0.35 });
        return;
      }
      if (!d.yield) { if (!silent) this.message(ch === '白' ? '白紙上無物可取。' : '「' + ch + '」取不走。'); return; }
      if (d.need && tool !== d.need) { if (!silent) this.message('「' + ch + '」要用' + G.TOOL_NAMES[d.need] + '。'); return; }
      for (const n in d.yield) if (!this.canAdd(n, d.yield[n])) { if (!silent) this.message('囊已滿。'); return; }
      if (p.sta < 1) { if (!silent) this.message('力氣不夠，歇一歇。'); return; }
      let time = d.time;
      const useTool = (d.fast && tool === d.fast) || (d.need && tool === d.need);
      if (useTool) time /= 2;
      if (ch === '磚' && tool === '鎬') time = 1.0;
      this.action = { type: 'gather', x: t.x, y: t.y, ch, t: 0, dur: time, useTool };
    }
    updateAction(dt) {
      const a = this.action; if (!a) return;
      const t = this.facing();
      if (t.x !== a.x || t.y !== a.y || this.world.get(a.x, a.y) !== a.ch) { this.action = null; return; }
      a.t += dt;
      if (a.t >= a.dur) this.finishGather(a);
    }
    finishGather(a) {
      const w = this.world, p = this.player, d = DB[a.ch];
      const under = w.base(a.x, a.y), onWater = d.onWater && (DB[under].kind === 'water' || under === '灘');
      const to = onWater ? under : (d.to || '白');                       // 拆回橋、魚梁：底下原本是水或灘就還原，不會憑空多出陸地
      w.set(a.x, a.y, to); w.extinguish(a.x, a.y);
      if (d.regrow) w.schedule(a.x, a.y, to, a.ch, d.regrow);         // 草木會長回來
      let got = [];
      for (const n in d.yield) { this.addItem(n, d.yield[n]); got.push(n + (d.yield[n] > 1 ? '×' + d.yield[n] : '')); }
      if (d.bonus) for (const n in d.bonus) if (Math.random() < d.bonus[n]) { this.addItem(n, 1); got.push(n); }
      if (a.useTool) this.wearTool();
      p.sta = Math.max(0, p.sta - this.ironDrain()); this.stats.gathered++;
      if (d.kind !== 'object') this.addCourage(1);                          // 採天然的才長膽氣，拆回自己放的不算
      if (a.ch === '草' && Math.random() < 0.1 && this.ents.spawnSpiderNear(a.x, a.y)) this.message('草裡爬出一隻蜘蛛。別惹牠。');
      this.fx.push({ type: 'float', x: a.x, y: a.y, text: '+' + got.join(' '), color: G.INK.black, t: 0, dur: 0.9 });
      SFX.absorb();
      this.action = null;
      if (this.keys.has('KeyE') || this.keys.has('Space')) this.pressGather(true);
    }
    catchFish(e) {
      if (Math.random() < (this.has('竹筏') || this.player.sailing ? 0.85 : 0.55)) {
        if (!this.canAdd('魚', 1)) { this.message('囊已滿。'); return; }
        this.ents.remove(e); this.addItem('魚', 1); this.addCourage(1); this.message('捉到一條魚。'); SFX.absorb();
      } else { this.message('魚溜了。'); e.moveT = 0; }
    }
    attack(e) {
      const p = this.player, base = this.heldDmg();
      if (!base) { this.message('徒手打不了「' + e.type + '」。石子磨石可成刀、劍，放進具欄。'); return; }
      if (p.atkT > 0) return;
      if (p.sta < 1) { this.message('力氣不夠，歇一歇。'); return; }
      const dmg = Math.round(base * this.dmgMult());
      if (e.type === '鷹') { if (e.tame) { e.tame = false; this.message('你打了自己的鷹，牠不跟你了。'); } e.angryT = 12; }
      p.atkT = 0.45; p.sta = Math.max(0, p.sta - this.ironDrain());
      e.hp -= dmg; e.angry = true; this.wearTool(); SFX.write(); this.renderer.shake = 0.15;
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '−' + dmg, color: G.INK.red, t: 0, dur: 0.7 });
      if (e.hp <= 0) { this.kill(e); return; }
      const left = Math.ceil(e.hp);
      if (e.type === '鹿') e.moveT = 0;
      else if (e.type === '虎' || e.type === '豹') { e.calm = 2; e.moveT = 0.3; this.message(e.type + '受創而退（還有 ' + left + '）。'); }
      else this.message(e.type + '（還有 ' + left + '）。');
    }
    hammerStrike(targets) {
      const p = this.player;
      if (this.level() < HAMMER_LEVEL) { this.message(HAMMER + '要膽氣卅一重才掄得動。'); SFX.fail(); return; }
      if (p.atkT > 0) return;
      if (p.sta < 3) { this.message('力氣不夠，歇一歇。'); return; }
      if (!targets.length) { this.message('三格內沒有獸。'); return; }
      const full = Math.round(ITEMS[HAMMER].dmg * this.dmgMult()), half = Math.round(ITEMS[HAMMER].dmg * this.dmgMult() * 0.5);
      p.atkT = 1.5; p.sta = Math.max(0, p.sta - 3 * this.ironDrain()); this.wearTool(); this.renderer.shake = 0.8; SFX.tiger();
      const slain = this.godHits(targets, (o) => SEA_FOLK.indexOf(o.type) >= 0 ? half : full);
      this.fx.push({ type: 'write', x: p.x, y: p.y, ch: '雷', color: G.INK.red, t: 0, dur: 0.5 });
      this.message('九閽鳴雷落地：' + targets.length + ' 頭獸同受 ' + full + ' 傷（海中之物減半，' + half + '）' + (slain ? '，' + slain + ' 頭斃命' : '') + '。');
    }
    // 燭龍焚溟：三格內諸獸同受灼燒；海中之物全傷，陸上天上減半
    fireStrike(targets) {
      const p = this.player;
      if (this.level() < HAMMER_LEVEL) { this.message(SEA_GOD + '要膽氣卅一重才揮得動。'); SFX.fail(); return; }
      if (p.atkT > 0) return;
      if (p.sta < 3) { this.message('力氣不夠，歇一歇。'); return; }
      if (!targets.length) { this.message('三格內沒有獸。'); return; }
      const full = Math.round(ITEMS[SEA_GOD].dmg * this.dmgMult()), half = Math.round(ITEMS[SEA_GOD].dmg * this.dmgMult() * 0.5);
      p.atkT = 1.5; p.sta = Math.max(0, p.sta - 3 * this.ironDrain()); this.wearTool(); this.renderer.shake = 0.6; SFX.tiger();
      const slain = this.godHits(targets, (o) => SEA_FOLK.indexOf(o.type) >= 0 ? full : half);
      this.fx.push({ type: 'write', x: p.x, y: p.y, ch: '焚', color: G.INK.red, t: 0, dur: 0.6 });
      let selfNote = '';
      if (p.sailing && p.ship) {             // 火也燎到自己的船：怪物所受的十分之一
        const self = Math.round(full * GOD_SELF); p.ship.hp = Math.max(0, p.ship.hp - self); selfNote = '；火燎到自己的船 −' + self;
        this.fx.push({ type: 'float', x: p.x, y: p.y + 1, text: '船 −' + self, color: G.INK.red, t: 0, dur: 0.9 });
        if (p.ship.hp <= 0) { this.message('燭龍的火燒穿了自己的船！'); this.wreck(); return; }
      }
      this.message('燭龍焚溟：' + targets.length + ' 頭同受灼燒，海中之物 ' + full + '、陸上天上 ' + half + (slain ? '，' + slain + ' 頭斃命' : '') + selfNote + '。');
    }
    godHits(targets, dmgOf) {
      let slain = 0;
      for (const o of targets) {
        const dmg = dmgOf(o); o.hp -= dmg; o.angry = true; if (o.type === '鷹') o.angryT = 12;
        this.fx.push({ type: 'float', x: o.x, y: o.y, text: '−' + dmg, color: G.INK.red, t: 0, dur: 0.8 });
        if (o.hp <= 0) { this.kill(o); slain++; }
      }
      return slain;
    }
    kill(e) {
      const drops = { '鹿': ['肉', 2], '虎': ['肉', 3], '豹': ['肉', 2], '狼': ['肉', 2], '蛇': ['蛇肉', 1], '蟾': [e.venom ? '毒蟾肉' : '蟾蜍肉', 1], '龜': ['龜甲', 1] }[e.type];
      const cour = { '鹿': 3, '虎': 15, '豹': 10, '狼': 10, '蛇': 5, '蛛': 5, '蟾': 3, '鷹': 5, '龜': 3, '蜃': 40 }[e.type] || 2;
      const hostile = e.type !== '鹿' && e.type !== '龜', gain = hostile ? Math.round(cour * (this.isNight() ? KILL_NIGHT : KILL_DAY)) : cour;   // 敵對的：白日八成、夜裡加半成
      this.ents.remove(e); this.stats.kills++; this.addCourage(gain, hostile ? 'kill' : 'other');
      if (drops) this.addItem(drops[0], drops[1]);
      if (e.type === '龜') { const p = this.player; p.san = Math.max(0, p.san - TURTLE_SAN); this.toast('殺龜不祥', '龜是靈物，殺之心裡不安：愜意減 ' + TURTLE_SAN + '。留下龜甲。'); SFX.fuse(); return; }
      if ('虎豹狼'.indexOf(e.type) >= 0 && Math.random() < this.skullP) {      // 獸首骨：一個或兩個
        const n = Math.random() < SKULL_TWO ? 2 : 1; this.addItem(e.type + '首骨', n);
        this.toast('得了' + e.type + '首骨' + (n > 1 ? ' ×' + n : ''), '放在船頭鎮船：' + ITEMS[e.type + '首骨'].ward + ' 日內蜃不敢撞船。在船上選中按 V，或面向停著的船按 F。');
      }
      if (e.type === '蜃') {                  // 蜃死，吐出的霧也收回去
        for (const f of [...this.world.fogs.values()]) if (f.sea) this.world.removeFog(f.id);
        this.toast('蜃斃', '海上的霧收了。膽氣 +40。'); SFX.fuse(); return;
      }
      this.message((({ '鹿': '獵得一鹿，得肉二。', '虎': '虎斃，得肉三。', '豹': '豹斃，得肉二。', '狼': '狼斃，得肉二。', '蛇': '蛇斃，留下屍身。', '蛛': '蜘蛛死了，什麼也沒留下。', '蟾': '蟾蜍死了。', '鷹': '鷹落了下來。', '龜': '龜死了，留下龜甲。' })[e.type] || '斃。') + (hostile ? '膽氣 +' + gain + (this.isNight() ? '（夜裡加半成）' : '（白日八成）') : ''));
      if (e.type !== '鹿') SFX.fuse();
    }
    // 獸的撲咬與毒咬（由實體呼叫）
    hit(e, dmg) {
      const p = this.player, d = Math.round(dmg * (this.totemNear(e.x, e.y) ? 5 / 3 : 1) * this.takenMult());
      p.hp = Math.max(0, p.hp - d); p.hurtT = 6; this.renderer.shake = 0.5; SFX.tiger(); this.armorHit();
      this.message(e.type + '！命 −' + d + '。');
    }
    bite(e, per) {
      const p = this.player, now = this.world.time, per2 = Math.round(per * (this.totemNear(e.x, e.y) ? 5 / 3 : 1) * this.takenMult());
      this.armorHit();
      if (this.ironFull()) { p.hurtT = 3; this.renderer.shake = 0.2; SFX.fail(); this.message(e.type + '咬在鐵甲上，毒牙咬不進。'); return; }
      p.biteN = (now - p.biteLast <= 6) ? p.biteN + 1 : 1; p.biteLast = now; this.stats.bites++;
      this.poison(per2, 5); p.hurtT = 6; this.renderer.shake = 0.3; SFX.fail();
      if (p.biteN >= 15) { p.hp = 0; this.message('連咬十五口，毒發身亡。'); return; }
      this.message(e.type + '咬了你一口（連咬 ' + p.biteN + '）。中毒：每秒 −' + per2 + '。藥可解。');
    }
    poison(per, sec) { const p = this.player; if (this.ironFull()) return; p.poisonPer = Math.max(p.poisonPer, per); p.poisonT = Math.max(p.poisonT, sec); }

    // ---------- 放（F） ----------
    pressPlace() {
      const p = this.player, w = this.world, s = this.held();
      if (!this.canAct()) return;
      { const t0 = this.facing(); if (w.get(t0.x, t0.y) === '灶' && !p.sailing && !p.swimming) { this.openStove(t0); return; } }   // 灶：開界面，在裡面添柴、烤、燒、煉
      if (!s) { this.message('囊中空空。'); return; }
      const name = s.n, t = this.facing(), base = w.get(t.x, t.y), bd = DB[base], it = ITEMS[name] || {};
      if (p.swimming) { this.message('游泳時騰不出手，先上岸。'); return; }
      if (base === '舟' && (it.ward || name === '木板')) { const rec = w.shipAt(t.x, t.y); if (it.ward) this.mountSkull(rec, name); else this.repairShip(rec); return; }
      if (p.sailing && !(it.tile && DB[it.tile] && DB[it.tile].net)) { this.message('船上做不了這個，先靠岸。'); return; }   // 船上可以下網
      const fail = () => this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 });
      const ent = this.ents.at(t.x, t.y);
      if (ent && ent.type === '鷹' && name === '魚') { this.feedEagle(ent); return; }
      if (it.slot) { this.wearItem(p.sel); return; }
      if (it.tool && it.dur) { this.equipFromBag(p.sel); return; }
      if (it.tool || it.kind === 'wear') { this.message('「' + name + '」' + (it.light ? '拿在手上就亮。' : '在囊中即生效。')); return; }
      if (base === '鼎') {
        if (FUEL[name]) { w.addFuel(t.x, t.y, FUEL[name]); this.removeItem(name, 1); this.message('鼎下添煤。還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); return; }
        if (DB[name] && DB[name].flam > 0) { w.addFuel(t.x, t.y, DB[name].s * 15); this.removeItem(name, 1); this.message('鼎下添柴。還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); return; }
        if (name === '蟾蜍肉' || name === '毒蟾肉') { this.refinePill(t, name); return; }
        this.message('鼎裡只煉蟾蜍肉；木或煤是柴。'); fail(); return;
      }
      if (base === '偶' && name === '偶') {         // 續稻草人
        w.addScarecrow(t.x, t.y); this.removeItem('偶', 1); this.message('稻草人續上了：還能守 ' + Math.ceil(w.scareDays(t.x, t.y)) + ' 天。'); SFX.fuse(); return;
      }
      if (DB[name] && DB[name].kind === 'beast') {
        if (this.ents.canStand(name, t.x, t.y, true) && !this.ents.at(t.x, t.y)) { this.ents.add(name, t.x, t.y, { calm: 6 }); this.removeItem(name, 1); this.message('放了「' + name + '」。'); SFX.write(); }
        else { this.message('這裡放不下「' + name + '」。'); fail(); }
        return;
      }
      const tileName = it.tile || name;             // 大船放下是「舟」
      if (DB[tileName] && DB[tileName].net) { this.placeNet(t, tileName, name); return; }
      if (!DB[tileName] || !DB[tileName].place) { this.message('「' + name + '」放不到地上。'); fail(); return; }
      if (it.ship) {                    // 船：船身每格都要是真的淺水，沒被別的船、網、地標佔著
        const kind = it.ship, k = G.SHIPS[kind], cells = w.shipFootprint(kind, t.x, t.y);
        const bad = cells.find(([x, y]) => w.raw(x, y) !== '水' || w.get(x, y) !== '水' || w.shipCells.has(U.key(x, y)) || w.placeAt(x, y) || w.netAt(x, y));
        if (bad) { this.message(kind + '要 ' + k.w + '×' + k.h + ' 格真的淺水才放得下，面前那格是船身的' + (kind === '方舟' ? '左邊中間' : '上頭') + '。'); fail(); return; }
        w.addShip(t.x, t.y, World.newShip(kind)); this.removeItem(name, 1);
        this.toast(kind + '下水了', '面向它按 E 上船。命 ' + k.hp + '，船頭放得下 ' + k.slots + ' 個首骨。深水亦可渡，開到海的盡頭便渡海而去。'); SFX.write();
        this.fx.push({ type: 'write', x: t.x, y: t.y, ch: '舟', color: DB['舟'].ink, t: 0, dur: 0.35 });
        return;
      }
      if (DB[tileName].onWater) {       // 放在水上的東西只放真的淺水；灘上只准架橋（漲潮退潮都走得過，使用者裁定）
        const raw = w.raw(t.x, t.y), ok = raw === '水' || (tileName === '橋' && raw === '灘');
        if (!ok) { this.message(raw === '灘' ? '灘上漲潮才有水，退潮就擱淺了，「' + name + '」要放在真的淺水上；灘上只能架橋。' : '「' + name + '」要放在淺水上。'); fail(); return; }
      }
      else {
        if (!(bd.kind === 'ground' || bd.kind === 'blank')) { this.message('這裡放不下，先把地上的東西取走。'); fail(); return; }
        if (this.ents.beastAt(t.x, t.y)) { this.message('有東西擋著。'); fail(); return; }
      }
      w.set(t.x, t.y, tileName);
      if (s.store) { p.bag.splice(p.bag.indexOf(s), 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); this.barSig = ''; } else this.removeItem(name, 1);   // 裝著東西的櫃：拿掉的是手上這一個
      if (tileName === '床') { p.home = { x: t.x, y: t.y }; this.toast('床放好了', '夜裡面向它按 R，一覺到天明。'); this.save(); }
      else if (tileName === '偶') { w.addScarecrow(t.x, t.y); this.toast('稻草人立起來了', '三十天內獸不近身：前半十格、後半七格。'); }
      else if (tileName === '櫃') { w.chests.set(U.key(t.x, t.y), s.store || []); this.message(s.store ? '櫃放好了，裡面 ' + s.store.length + ' 樣東西都在。面向它按 E 開。' : '櫃放好了。面向它按 E 開。'); }
      else this.message('放下「' + name + '」。');
      SFX.write();
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: tileName, color: DB[tileName].ink, t: 0, dur: 0.35 });
    }

    // ---------- 漁網 ----------
    placeNet(t, tile, name) {
      const w = this.world, size = DB[tile].net, cells = [];
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) cells.push([t.x + i, t.y + j]);
      for (const [x, y] of cells) {
        const ch = w.get(x, y);
        if (DB[ch].kind !== 'water' || w.placeAt(x, y)) { this.message(size === 1 ? '小網要放在淺水上。' : '要有 ' + size + '×' + size + ' 格的水面才放得下（面前那格是左上角）。'); this.fx.push({ type: 'fail', x, y, t: 0, dur: 0.6 }); return; }
        if (size === 1 && ch !== '水') { this.message('小網只放得了淺水；深水要中網或大網。'); this.fx.push({ type: 'fail', x, y, t: 0, dur: 0.6 }); return; }
        if (w.raw(x, y) === '灘') { this.message('潮間的灘上下不了網，退潮會擱淺。'); this.fx.push({ type: 'fail', x, y, t: 0, dur: 0.6 }); return; }
      }
      w.addNet(t.x, t.y, size, w.time); this.removeItem(name, 1); SFX.write();
      const r = w.netRule(size);
      this.message('下了' + name + '：每 ' + r.every + ' 息一條魚，存 ' + r.cap + ' 條。面向按 E 取魚，空網再按 E 收回。');
    }
    useNet(t) {
      const w = this.world, rec = w.netAt(t.x, t.y); if (!rec) return;
      const fish = w.netFish(rec, w.time), name = rec.size === 1 ? '漁網' : rec.size === 2 ? '中漁網' : '大漁網';
      if (fish > 0) {
        let take = 0; while (take < fish && this.canAdd('魚', 1)) { this.addItem('魚', 1); take++; }
        if (!take) { this.message('囊已滿。'); return; }
        rec.fish -= take; if (rec.fish <= 0) rec.t = w.time; this.addCourage(1); this.message('網裡得魚 ' + take + ' 條' + (rec.fish ? '，還剩 ' + rec.fish + ' 條' : '') + '。'); SFX.absorb(); return;
      }
      if (!this.canAdd(name, 1)) { this.message('囊已滿。'); return; }
      w.removeNet(rec); this.addItem(name, 1); this.message('收回了' + name + '。'); SFX.absorb();
    }

    // ---------- 煉丹 ----------
    pillChance(name) { const p = this.player, venom = name === '毒蟾肉'; return p.pillsMade < 3 ? (venom ? 0.12 : 0.08) : (venom ? 0.02 : 0.01); }
    refinePill(t, name) {
      const p = this.player, w = this.world;
      if (!w.stoveLit(t.x, t.y)) { this.message('鼎是冷的，先添柴。'); SFX.fail(); return; }
      if (!this.spendSta(3)) return;
      const chance = this.pillChance(name); this.removeItem(name, 1);
      if (Math.random() < chance) {       // 真隨機
        p.pillsMade++; this.addItem('丹', 1); this.addCourage(3);
        this.toast('煉成一顆丹', '第 ' + p.pillsMade + ' 顆。選中按 V 服下，命上限 ' + (p.pillsEaten < 50 ? '+3%' : '+0.5%') + '。' + (p.pillsMade === 3 ? '從第四顆起，成功率降為無毒肉 1%、有毒肉 2%。' : '')); SFX.learn();
      } else { this.message('丹沒成，一塊' + name + '化了煙（這次 ' + Math.round(chance * 100) + '%）。'); SFX.fail(); }
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: '丹', color: G.INK.red, t: 0, dur: 1 });
    }
    eatPill() {
      const p = this.player; p.pillsEaten++;
      const n = p.pillsEaten, before = p.hpMax;
      p.hpMax = Math.round(100 + 3 * Math.min(n, 50) + 0.5 * Math.max(0, n - 50));   // 前五十顆每顆 +3，之後每顆 +0.5，四捨五入到個位（兩顆合 +1）
      const gain = p.hpMax - before; p.hp = Math.min(p.hpMax, p.hp + Math.max(0, gain));
      this.toast('服下第 ' + n + ' 顆丹', '命上限 ' + (gain > 0 ? '+' + gain : '這顆記半，下一顆合 +1') + '，現在 ' + p.hpMax + '。' + (n === 50 ? '從第五十一顆起每兩顆 +1。' : '')); SFX.learn(); this.hudSig = '';
    }

    // ---------- 吃（V） ----------
    useItem() {
      const p = this.player, s = this.held(); if (!s || !this.canAct()) return;
      const it = G.item(s.n), f = it.food, tl = ITEMS[s.n] || {};
      if (tl.slot) { this.wearItem(p.sel); return; }
      if (s.n === '丹') { this.removeItem('丹', 1); this.eatPill(); return; }
      if (ITEMS[s.n] && ITEMS[s.n].ward) {
        if (p.sailing && p.ship) this.mountSkull(p.ship, s.n);
        else this.message('首骨要放在船頭：在船上選中按 V，或面向停著的船按 F。');
        return;
      }
      if (s.n === '木板' && p.sailing && p.ship) { this.repairShip(p.ship); return; }
      if (s.n === '扇') {
        let best = null, bd = 1e9;
        for (const f of this.world.fogs.values()) for (const k of f.cells) { const [x, y] = U.unkey(k), d = U.cheb(x, y, p.x, p.y); if (d <= FAN_REACH && d < bd) { bd = d; best = f; } }
        if (best) this.blowFog(best); else this.message('三格內沒有霧障。扇子留著，走進霧障時會問你要不要用。');
        return;
      }
      if (s.n === '龜甲') {
        this.removeItem('龜甲', 1);
        if (Math.random() < 0.25) { p.noGhostUntil = Math.max(p.noGhostUntil || 0, this.world.time) + TURTLE_PEACE_DAYS * DAY; this.toast('龜卜：吉', '裂紋成「安」字。五日內魄不來。'); SFX.learn(); }
        else { this.toast('龜卜：不吉', '甲裂無象，白費了一片龜甲。'); SFX.fail(); }
        return;
      }
      if (s.n === '錦囊') {
        if (p.pouches >= MAX_POUCHES) { this.message('已經用了四個錦囊，囊再大也背不動了。'); SFX.fail(); return; }
        this.removeItem('錦囊', 1); p.pouches++; this.barSig = ''; this.buildBag();
        this.toast('錦囊用了', '囊多了兩格、具欄多了一格：現在 ' + this.slots() + ' 格與 ' + this.toolSlots() + ' 格。最多四個。'); SFX.learn(); return;
      }
      if (s.n === '蠟燭') {
        const hat = this.anyHat();
        if (hat && hat.fuel < HAT_FUEL) { this.removeItem('蠟燭', 1); hat.fuel = HAT_FUEL; this.barSig = ''; this.buildBag(); this.message('燈帽續上一根蠟燭：四百息。'); SFX.write(); return; }
        this.message(hat ? '燈帽裡的蠟燭還是滿的。' : '蠟燭拿在手上就亮；有燈帽時按 V 可以續進去。'); return;
      }
      if (s.n === '海水瓶') { this.message('海水鹹，喝不得。放在旺的灶上蒸餾。'); return; }
      if (!f) { this.message(tl.tool && tl.dur ? '「' + s.n + '」是工具，按 F 移進具欄。' : tl.tool || tl.kind === 'wear' ? '「' + s.n + '」在囊中即生效。' : '「' + s.n + '」不能吃，按 F 放到地上。'); return; }
      const ate = s.n === '果' ? this.takeFruit(1) : null; if (!ate) this.removeItem(s.n, 1);
      const age = ate && ate.length ? this.day() - ate[0] : 0;
      if (f.bottle) this.addItem('玻璃瓶', 1);
      if (f.knock) { this.knockOut(f); return; }
      const parts = [];
      if (f.eat) { p.food = Math.min(100, p.food + f.eat); parts.push('飽 +' + f.eat); }
      if (f.hurt) { p.hp = Math.max(1, p.hp - f.hurt); p.hurtT = 3; parts.push('生冷傷身 −' + f.hurt); }
      if (f.heal) { p.hp = Math.min(p.hpMax, p.hp + f.heal); parts.push('命 +' + f.heal); }
      if (f.cure && p.poisonT > 0) { p.poisonT = 0; p.poisonPer = 0; parts.push('毒解了'); }
      if (f.san) { p.san = Math.min(100, p.san + f.san); parts.push('愜意 +' + f.san); }
      if (f.poison) { this.poison(f.poison[0], f.poison[1]); parts.push('中毒'); }
      SFX.absorb();
      this.message('吃了「' + s.n + '」' + (age >= 1 ? '（最陳的那顆，放了 ' + age + ' 夜）' : '') + '，' + parts.join('，') + '。');
    }
    knockOut(f) {
      const p = this.player;
      p.knock = f.knock; this.action = null; this.keys.clear(); p.wakeFx = f;
      $('knock').classList.remove('hidden');
      this.toast('醉了', '天旋地轉，你昏了過去。一刻鐘後才醒，周圍照常。');
    }
    wake() {
      const p = this.player, f = p.wakeFx || {};
      $('knock').classList.add('hidden');
      if (f.eat) p.food = Math.min(100, p.food + f.eat);
      if (f.san) p.san = Math.min(100, p.san + f.san);
      if (f.sta) p.sta = Math.max(0, p.sta + f.sta);
      this.toast('醒了', '飽 +2，愜意 +1，力 −5。');
    }

    // ---------- 製作（C） ----------
    toggleCraft() {
      const el = $('craft'); el.classList.toggle('hidden'); this.keys.clear();
      if (!el.classList.contains('hidden')) this.buildCraft();
    }
    canCraft(r) { for (const n in r.need) if (this.count(n) < r.need[n]) return false; return true; }
    visibleRecipes() { return this.craftCat === '全部' ? G.RECIPES : G.RECIPES.filter(r => r.cat === this.craftCat); }
    buildCraft() {
      const p = this.player, list = $('craft-list'); list.innerHTML = '';
      $('craft-sta').textContent = Math.floor(p.sta) + '/' + p.staMax + ' · 膽氣第 ' + this.level() + ' 重';
      const cats = $('craft-cats'); cats.innerHTML = '';
      for (const c of G.CRAFT_CATS) {
        const b = document.createElement('button'); b.className = c === this.craftCat ? 'on' : '';
        const n = c === '全部' ? G.RECIPES.length : G.RECIPES.filter(r => r.cat === c).length;
        b.innerHTML = c + '<small>' + n + '</small>';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); this.craftCat = c; this.buildCraft(); });
        cats.appendChild(b);
      }
      this.visibleRecipes().forEach((r, i) => {
        const locked = r.level && this.level() < r.level;
        const row = document.createElement('div'); row.className = 'recipe' + (this.canCraft(r) && p.sta >= r.sta && !locked ? '' : ' cant');
        const needs = Object.keys(r.need).map(n => '<span class="' + (this.count(n) >= r.need[n] ? 'ok' : 'lack') + '">' + n + ' ' + this.count(n) + '/' + r.need[n] + '</span>').join(' ');
        const owned = r.out && ITEMS[r.out] && ITEMS[r.out].slot && this.ownedPiece(r.out);
        const title = (r.out ? r.out + (r.n > 1 ? ' ×' + r.n : '') : (r.regrind ? '重磨' : '磨礪')) + (owned ? ' <i class="dim">已有</i>' : '');
        let btns = '';
        if (r.choose) btns = r.choose.map(c => '<button data-r="' + r.id + '" data-c="' + c + '">' + c + '</button>').join('');
        else btns = '<button data-r="' + r.id + '">' + (r.regrind ? '磨' : owned ? '翻新' : '造') + '</button>';
        row.innerHTML = '<span class="num">' + (i + 1) + '</span><b>' + title + '</b><span class="needs">' + needs + '</span><span class="sta">力 ' + r.sta + (locked ? '<br><i>需' + r.level + '重</i>' : '') + '</span><span class="note">' + r.note + '</span><span class="btns">' + btns + '</span>';
        list.appendChild(row);
      });
      list.querySelectorAll('button').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); this.craft(b.dataset.r, b.dataset.c); }));
    }
    craft(id, choice) {
      const p = this.player, r = G.RECIPES.find(x => x.id === id); if (!r || !this.canAct()) return;
      if (p.swimming) { this.message('游泳時做不了東西，先上岸。'); return; }
      if (r.level && this.level() < r.level) { this.message('膽氣不夠：要第 ' + r.level + ' 重。'); SFX.fail(); return; }
      if (!this.canCraft(r)) { this.message('材料不夠。'); SFX.fail(); return; }
      if (p.sta < r.sta) { this.message('力氣不夠，歇一歇。'); SFX.fail(); return; }
      let out = r.out, n = r.n || 1;
      if (r.choose) { if (!choice) { this.message('選一個方向：刀、鎬、鋤、劍、斧。'); return; } out = choice; }
      if (r.choose && ITEMS[out] && ITEMS[out].tung && p.food < 10) { this.message('太餓了，鍛不動鎢鋼。'); SFX.fail(); return; }
      if (r.regrind) {
        const s = this.activeTool(); if (!s) { this.message('具欄裡要選中一把工具（P 換）。'); SFX.fail(); return; }
        const tung = !!ITEMS[s.n].tung, extraSta = tung ? 5 : 0, food = tung ? 10 : 0;   // 鎢鋼具重磨耗力八、飽十
        if (p.sta < r.sta + extraSta) { this.message('力氣不夠，歇一歇（鎢鋼具要力 ' + (r.sta + extraSta) + '）。'); SFX.fail(); return; }
        if (food && p.food < food) { this.message('太餓了，磨不動鎢鋼。'); SFX.fail(); return; }
        for (const m in r.need) this.removeItem(m, r.need[m]);
        p.sta -= r.sta + extraSta; if (food) p.food -= food; s.dur = ITEMS[s.n].dur; this.barSig = ''; this.afterCraft(r); this.message('「' + s.n + '」磨利了。'); SFX.fuse(); this.buildCraft(); this.buildBag(); return;
      }
      const def = ITEMS[out], owned = def && def.slot ? this.ownedPiece(out) : null;
      if (owned) {       // 同一類衣甲只留一件：再造只是翻新
        for (const m in r.need) this.removeItem(m, r.need[m]);
        p.sta -= r.sta; const gain = this.afterCraft(r);
        if (def.light) owned.fuel = HAT_FUEL; else { owned.dur = this.lifeOf(owned); owned.wm = 1; }
        this.barSig = ''; this.toast('「' + out + '」翻新了', '同一類衣甲只留一件：壽命回滿，損耗重新起算。　愜意 +' + gain); SFX.fuse();
        this.buildCraft(); this.buildBag(); return;
      }
      if (!this.canAdd(out, n)) { this.message('囊已滿。'); SFX.fail(); return; }
      for (const m in r.need) this.removeItem(m, r.need[m]);
      p.sta -= r.sta; this.addItem(out, n); const gain = this.afterCraft(r);
      this.toast('造了「' + out + '」' + (n > 1 ? ' ×' + n : ''), G.item(out).flavor + '　愜意 +' + gain); SFX.fuse();
      this.buildCraft(); this.buildBag();
    }
    afterCraft(r) {
      const p = this.player, now = this.world.time, e = p.craftLog[r.id], n = e && now - e.t <= 60 ? e.n + 1 : 1;
      p.craftLog[r.id] = { t: now, n };
      const gain = Math.round([8, 4, 2, 1][Math.min(n - 1, 3)] * this.mult());
      p.san = Math.min(100, p.san + gain); this.addCourage(r.sta); this.stats.crafted++;
      return gain;
    }

    // ---------- 睡（R） ----------
    bedNear() { const p = this.player; for (const [dx, dy] of [[p.fx, p.fy]].concat(N8)) if (this.world.get(p.x + dx, p.y + dy) === '床') return true; return false; }
    sleep() {
      const p = this.player; if (!this.canAct()) return;
      if (!this.bedNear()) { this.message('要有床才能睡。六團棉、兩塊木。'); return; }
      if (this.dayT() <= 0.5) { this.message(this.dayT() < 0.1 ? '天已經亮了，睡不著。' : '白日不眠。'); return; }
      if (this.ents.ghostNear(p.x, p.y, 8)) { this.message('附近有魄，睡不著。點亮火把把它們趕走。'); SFX.fail(); return; }
      const w = this.world, t = this.dayT();
      w.time += (1 - t) * DAY + 0.03 * DAY;
      for (let i = 0; i < 80; i++) w.step(p.x, p.y);
      p.warm = 100; p.sta = p.staMax; p.food = Math.max(0, p.food - 12); p.san = Math.min(100, p.san + 20); p.hp = Math.min(p.hpMax, p.hp + 10);
      this.ents.list = this.ents.list.filter(e => '虎豹狼蛇蛛魄'.indexOf(e.type) < 0);
      this.gatherCompanions();
      this.stats.nights++; p.warned = {};
      this.toast('一夜無夢', '天亮了。愜意 +20。');
      this.save();
    }

    // ---------- 櫃 ----------
    openChest(t) {
      this.chestAt = U.key(t.x, t.y);
      if (!this.world.chests.has(this.chestAt)) this.world.chests.set(this.chestAt, []);
      $('chest').classList.remove('hidden'); this.keys.clear(); this.buildChest();
    }
    closeChest() { $('chest').classList.add('hidden'); this.chestAt = null; }
    takeChest() {        // 連裡面的東西一起拆下（東西記在囊裡那個「櫃」上，重放回去就還在）；拆回不長膽氣
      const k = this.chestAt; if (!k) return;
      const box = this.world.chests.get(k) || [], p = this.player;
      if (box.length ? p.bag.length >= this.slots() : !this.canAdd('櫃', 1)) { this.message('囊已滿。'); SFX.fail(); return; }
      const [x, y] = U.unkey(k);
      this.world.set(x, y, '白'); this.world.chests.delete(k);
      if (box.length) this.addItem('櫃', 1, { store: box }); else this.addItem('櫃', 1);
      this.closeChest(); this.buildBag(); this.message(box.length ? '拆下了櫃，裡面 ' + box.length + ' 樣東西還在櫃裡。' : '拆下了櫃。'); SFX.absorb();
    }
    buildChest() {
      const box = this.world.chests.get(this.chestAt) || [], p = this.player;
      const mk = (s, i, from) => {
        const el = document.createElement('div'); el.className = 'slot bag' + (s ? '' : ' empty');
        if (s) { el.innerHTML = '<span class="ch' + (s.n.length > 1 ? ' word' : '') + '">' + s.n + '</span><span class="cost">' + this.durText(s) + '</span>'; el.title = G.item(s.n).flavor; }
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; this.moveStack(from, i); });
        return el;
      };
      const cg = $('chest-grid'); cg.innerHTML = ''; for (let i = 0; i < CHEST_SLOTS; i++) cg.appendChild(mk(box[i], i, 'chest'));
      const bg = $('chest-bag'); bg.innerHTML = ''; for (let i = 0; i < this.slots(); i++) bg.appendChild(mk(p.bag[i], i, 'bag'));
    }
    moveStack(from, i) {
      const box = this.world.chests.get(this.chestAt), p = this.player;
      if (!box) return;
      if (from === 'chest') {
        const s = box[i]; if (!s) return;
        const ds = s.n === '果' ? this.fruitDays(s).slice() : undefined;
        const left = this.addItem(s.n, s.c, { dur: s.dur, wm: s.wm, fuel: s.fuel, ds });
        if (left > 0) { s.c = left; if (ds) s.ds = ds.slice(ds.length - left); this.message('囊裡放不下這麼多。'); } else box.splice(i, 1);
      } else {
        const s = p.bag[i]; if (!s) return;
        if (s.store && s.store.length) { this.message('裝著東西的櫃放不進櫃裡，先放到地上。'); return; }
        if (box.length >= CHEST_SLOTS) { this.message('櫃滿了。'); return; }
        box.push(s); p.bag.splice(i, 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); this.barSig = '';
      }
      SFX.write(); this.buildChest(); this.buildBag();
    }

    // ---------- 船 ----------
    board(t) {
      const rec = this.world.shipAt(t.x, t.y); if (!rec) return;
      if (this.level() < SEA_WARN_LEVEL) { this.askSea(rec); return; }
      this.doBoard(rec);
    }
    askSea(rec) {
      this.seaAsk = rec; this.paused = true; this.keys.clear(); this.action = null;
      const a = this.shipSkulls(rec);
      $('seaask-text').innerHTML = '<b>建議卅一重、帶上神兵再下海。</b>你的膽氣第 ' + this.level() + ' 重；卅一重可鑄九閽鳴雷與燭龍焚溟，海裡的蜃只怕燭龍焚溟。<br>海上有蜃：命九百，撞船一下二十五，吐海霧；船毀了只有六十息游上岸。' + (a.length ? '這艘' + rec.kind + '船頭有' + a.map(x => x[0]).join('、') + '鎮著，最久到 ' + this.wardDaysOf(rec) + ' 日後。' : '這艘' + rec.kind + '船頭沒有首骨。') + '<br>真的要出海？';
      $('seaask').classList.remove('hidden');
    }
    closeSea() { $('seaask').classList.add('hidden'); this.seaAsk = null; this.paused = false; }
    seaGo() { const rec = this.seaAsk; this.closeSea(); if (rec && rec.cells && this.world.ships.get(U.key(rec.cells[0][0], rec.cells[0][1])) === rec) this.doBoard(rec); }
    doBoard(rec) {
      const p = this.player, w = this.world, [ax, ay] = rec.cells[0];     // 船開走了，水面還原；船的命與船頭首骨跟著人走
      w.removeShip(U.key(ax, ay));
      p.ship = { kind: rec.kind, hp: rec.hp, skulls: this.shipSkulls(rec), repairs: rec.repairs || 0 };
      p.fromX = p.x; p.fromY = p.y; p.x = ax; p.y = ay; p.moveT = 0.2; p.stepDur = 0.2; p.sailing = true;
      this.toast('上了' + rec.kind, this.shipText(p.ship) + '。深水亦可渡，開到海的盡頭便渡海而去；撞上岸就靠岸。海上有蜃。');
    }
    crossSea() {
      const p = this.player; p.crossed = true; this.paused = true;
      $('voyage-text').innerHTML = '第 ' + this.day() + ' 日，你駕著自己造的船，開出了這張紙。<br>膽氣第 ' + this.level() + ' 重 · 睡過 ' + this.stats.nights + ' 夜 · 讀了 ' + this.stats.read + ' 處 · 死過 ' + p.deaths + ' 次。';
      $('voyage').classList.remove('hidden');
      this.save();
    }

    // ---------- 探索 ----------
    discover(pl) {
      const p = this.player;
      if (p.places[pl.id]) return;
      p.places[pl.id] = 1;
      this.toast('發現：' + pl.name, pl.name === '燈' ? '最遠的燈，在島外。' : '去看看。');
      SFX.learn();
    }
    readPlace(pl) {
      const p = this.player, w = this.world, first = p.places[pl.id] !== 2;
      p.places[pl.id] = 2;
      $('read-title').textContent = pl.name;
      $('read-text').textContent = pl.text;
      $('read').classList.remove('hidden');
      this.keys.clear();
      if (pl.effect === 'well' && pl.drank !== this.day()) { pl.drank = this.day(); p.hp = Math.min(p.hpMax, p.hp + 15); this.message('井水清冽，命 +15。'); }
      if (pl.effect === 'raft' && !p.raftTaken) { if (this.addItem('竹筏', 1) === 0) { p.raftTaken = true; this.toast('船裡有一隻竹筏', '囊中有筏，可行於淺水。'); } else this.message('囊滿了，筏子先留在船裡。'); }
      if (pl.effect === 'dragon' && !p.dragon && !this.ents.list.some(e => e.type === '龍')) {
        const at = this.freeNear(p.x, p.y, true); this.ents.add('龍', at.x, at.y); p.dragon = true; this.toast('黑處有龍', '牠跟你走了。夜能照路，獸與魄不敢近。');
      }
      if (!first) { this.buildBag(); return; }
      this.stats.read++; p.san = Math.min(100, p.san + 10); this.addCourage(10);
      if (pl.effect === 'reveal') { w.revealAll(pl.x, pl.y); this.toast('看見整張紙', '島上的一切都畫到地圖上了。按 M 看。'); }
      else if (pl.effect === 'bricks') { this.addItem('磚', 6); this.addItem('石子', 3); this.toast('錯字砌的磚', '磚 ×6、石子 ×3。'); }
      else if (pl.effect === 'end') {
        const n = w.places.filter(x => p.places[x.id] === 2).length;
        if (n >= w.places.length) { p.finished = true; this.toast('你讀完了這張紙', '第 ' + this.day() + ' 日。島上八處，你都去過了。', 9000); }
        else this.toast('燈', '還有 ' + (w.places.length - n) + ' 處沒讀。', 6000);
      }
      SFX.learn(); this.buildBag(); this.save();
    }
    closeRead() { $('read').classList.add('hidden'); }
    readStele(t) {
      const p = this.player, s = this.world.stele(t.x, t.y), k = U.key(t.x, t.y);
      if (!s) return;
      if (p.readSteles.indexOf(k) < 0) { p.readSteles.push(k); p.staMax = Math.min(200, p.staMax + 10); this.toast('讀碑有得', '力氣上限 +10（' + p.staMax + '）'); }
      this.toast('碑文', s.hint, 9000);
    }
    askRoad(t) {
      const p = this.player, w = this.world;
      let best = null, bd = Infinity;
      for (const pl of w.places) { if (p.places[pl.id] === 2) continue; const d = U.dist(t.x, t.y, pl.x, pl.y); if (d < bd) { bd = d; best = pl; } }
      if (!best) { this.toast('問路', '門說：八處你都去過了。'); return; }
      const dx = best.x - t.x, dy = best.y - t.y, a = Math.atan2(-dy, dx);
      const dirs = ['東', '東北', '北', '西北', '西', '西南', '南', '東南'];
      const dir = dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
      this.toast('問路', '門說：往' + dir + '約 ' + Math.round(Math.max(Math.abs(dx), Math.abs(dy))) + ' 步，有' + best.name + '。', 7000);
      SFX.learn();
    }
    harvestWeir(t) {
      const w = this.world, k = U.key(t.x, t.y), ready = w.weirs.get(k) || 0;
      if (w.time < ready) { this.message('魚還沒來，約還要 ' + Math.ceil(ready - w.time) + ' 息。'); return; }
      if (!this.canAdd('魚', 1)) { this.message('囊已滿。'); return; }
      this.addItem('魚', 1); w.weirs.set(k, w.time + 60);
      this.message('漁獲一魚。'); SFX.absorb();
    }
    pickBag(t) {
      const k = U.key(t.x, t.y), items = this.world.bags.get(k) || [];
      const left = [];
      for (const s of items) {
        const ds = s.n === '果' ? this.fruitDays(s).slice() : undefined;
        const r = this.addItem(s.n, s.c, { dur: s.dur, wm: s.wm, fuel: s.fuel, ds });
        if (r > 0) left.push({ n: s.n, c: r, dur: s.dur, wm: s.wm, fuel: s.fuel, ds: ds ? ds.slice(ds.length - r) : undefined });
      }
      if (left.length) { this.world.bags.set(k, left); this.message('囊已滿，還有些東西留在荷包裡。'); }
      else { this.world.set(t.x, t.y, '白'); this.message('取回了荷包。'); }
      SFX.absorb();
    }
    saw(type) {
      const p = this.player;
      if (p.creatures.indexOf(type) >= 0) return;
      p.creatures.push(type);
      this.toast('初見「' + type + '」', DB[type].flavor);
    }
    toggleMap() {
      const el = $('map'), p = this.player, w = this.world;
      el.classList.toggle('hidden'); this.keys.clear();
      if (el.classList.contains('hidden')) return;
      this.renderer.drawBigMap(this, $('bigmap'));
      const seen = w.places.filter(x => x.seen).length, read = w.places.filter(x => p.places[x.id] === 2).length;
      $('mapinfo').textContent = '第 ' + this.day() + ' 日 · ' + w.tideName() + ' · 已見 ' + seen + '/' + w.places.length + ' 處 · 已讀 ' + read + ' 處';
    }
    toggleJournal() {
      const el = $('journal'), p = this.player, w = this.world;
      el.classList.toggle('hidden'); this.keys.clear();
      if (el.classList.contains('hidden')) return;
      const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      let h = '<h3>地方</h3><ul>';
      for (const pl of w.places) {
        const st = p.places[pl.id] || 0;
        h += '<li>' + (st === 0 ? '<span class="dim">＿＿</span>' : '<b>' + pl.name + '</b>' + (st === 2 ? '　' + esc(pl.text) : '　<span class="dim">（見過，未讀）</span>')) + '</li>';
      }
      h += '</ul><h3>生靈</h3><p>' + (p.creatures.length ? p.creatures.join('　') : '<span class="dim">還沒見過</span>') + '</p>';
      h += '<h3>日子</h3><p>第 ' + this.day() + ' 日 · 膽氣第 ' + this.level() + ' 重（' + Math.floor(p.cour) + '，下一重 ' + this.levelAt(this.level() + 1) + '） · 睡過 ' + this.stats.nights + ' 夜 · 走過 ' + w.seenCount() + ' 格 · 取了 ' + this.stats.gathered + ' 次 · 造了 ' + this.stats.crafted + ' 件 · 斃 ' + this.stats.kills + ' · 被咬 ' + this.stats.bites + ' 口 · 死過 ' + p.deaths + ' 次 · 存檔第' + SLOT_NAMES[this.slot] + '格</p>';
      $('journal-body').innerHTML = h;
    }

    // ---------- 輸入 ----------
    bindInput() {
      window.addEventListener('keydown', (ev) => {
        if (ev.repeat && !DIRS[ev.code]) return;
        if (!$('start').classList.contains('hidden')) return;   // 起始頁的按鍵在 boot() 裡管
        if (this.player.dead) { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); this.respawn(); } return; }
        if (this.seaAsk) {
          if (ev.code === 'KeyY' || ev.code === 'Enter') this.seaGo(); else if (ev.code === 'KeyN' || ev.code === 'Escape') this.closeSea();
          ev.preventDefault(); return;
        }
        if (this.warnOpen) { if (['Enter', 'Escape', 'Space', 'KeyE'].indexOf(ev.code) >= 0) this.closeWarn(); ev.preventDefault(); return; }
        if (this.fogAsk) {
          if (ev.code === 'KeyY' || ev.code === 'Enter') { if (this.count('扇')) this.fogUseFan(); else this.fogRefuse(); }
          else if (ev.code === 'KeyN' || ev.code === 'Escape') this.fogRefuse();
          ev.preventDefault(); return;
        }
        if (!$('voyage').classList.contains('hidden')) return;
        if (this.userPaused) { if (ev.code === 'Escape') { if (!$('help').classList.contains('hidden')) $('help').classList.add('hidden'); else this.togglePause(); ev.preventDefault(); } return; }   // 暫停時開著幫助：Esc 先關幫助
        if (this.player.knock > 0) { ev.preventDefault(); return; }
        if (!$('read').classList.contains('hidden')) { if (['KeyE', 'Enter', 'Space', 'Escape'].indexOf(ev.code) >= 0) { this.closeRead(); ev.preventDefault(); } return; }
        if (this.chestAt) { if (['KeyE', 'Escape'].indexOf(ev.code) >= 0) { this.closeChest(); ev.preventDefault(); } return; }
        if (this.stoveAt) { if (['KeyE', 'KeyF', 'Escape', 'Enter'].indexOf(ev.code) >= 0) { this.closeStove(); ev.preventDefault(); } return; }
        if (ev.code === 'Escape') {
          const open = ['help', 'map', 'journal', 'craft'].filter(id => !$(id).classList.contains('hidden'));
          if (open.length) open.forEach(id => $(id).classList.add('hidden')); else this.togglePause();
          ev.preventDefault(); return;
        }
        if (ev.code === 'KeyH') { $('help').classList.toggle('hidden'); ev.preventDefault(); return; }
        if (!$('help').classList.contains('hidden')) return;
        if (ev.code === 'KeyM') { $('journal').classList.add('hidden'); $('craft').classList.add('hidden'); this.toggleMap(); ev.preventDefault(); return; }
        if (ev.code === 'KeyJ') { $('map').classList.add('hidden'); $('craft').classList.add('hidden'); this.toggleJournal(); ev.preventDefault(); return; }
        if (ev.code === 'KeyC') { $('map').classList.add('hidden'); $('journal').classList.add('hidden'); this.toggleCraft(); ev.preventDefault(); return; }
        const craftOpen = !$('craft').classList.contains('hidden');
        if (craftOpen) {
          if (/^Digit[1-9]$/.test(ev.code)) { const r = this.visibleRecipes()[+ev.code[5] - 1]; if (r && !r.choose) this.craft(r.id); ev.preventDefault(); }
          return;
        }
        if (!$('map').classList.contains('hidden') || !$('journal').classList.contains('hidden')) return;
        const p = this.player;
        if (DIRS[ev.code]) { this.keys.add(ev.code); ev.preventDefault(); return; }
        if (/^Digit[1-9]$/.test(ev.code)) { const n = +ev.code[5] - 1; if (n < p.bag.length) p.sel = n; this.buildBag(); ev.preventDefault(); return; }
        switch (ev.code) {
          case 'KeyE': case 'Space': this.keys.add(ev.code); this.pressGather(); break;
          case 'KeyF': case 'Enter': this.pressPlace(); break;
          case 'KeyV': this.useItem(); break;
          case 'KeyR': this.sleep(); break;
          case 'KeyP': this.cycleTool(1); break;
          case 'KeyN': this.message(SFX.toggle() ? '已靜音' : '聲音已開'); break;
          case 'BracketLeft': case 'KeyQ': this.cycle(-1); break;
          case 'BracketRight': case 'KeyZ': case 'Tab': this.cycle(1); break;
          case 'Equal': case 'NumpadAdd': this.renderer.tile = Math.min(56, this.renderer.tile + 4); break;
          case 'Minus': case 'NumpadSubtract': this.renderer.tile = Math.max(28, this.renderer.tile - 4); break;
          default: return;
        }
        ev.preventDefault();
      });
      window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
      window.addEventListener('blur', () => this.keys.clear());
      const cv = $('world');
      cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
      cv.addEventListener('mousedown', (ev) => {
        if (this.paused || this.player.dead || this.player.knock > 0) return;
        const r = this.renderer, T = r.tile, p = this.player;
        const wx = Math.floor((ev.clientX - (r.w / 2 - r.camX * T)) / T), wy = Math.floor((ev.clientY - (r.h / 2 - r.camY * T)) / T);
        if (U.cheb(wx, wy, p.x, p.y) !== 1) { this.message('太遠了，走近一點。'); return; }
        p.fx = wx - p.x; p.fy = wy - p.y;
        if (ev.button === 2) this.pressPlace(); else this.pressGather();
      });
      cv.addEventListener('wheel', (ev) => { this.cycle(ev.deltaY > 0 ? 1 : -1); ev.preventDefault(); }, { passive: false });
      $('dead-btn').addEventListener('click', () => this.respawn());
      $('read').addEventListener('mousedown', () => this.closeRead());
      $('journal-close').addEventListener('click', () => this.toggleJournal());
      $('map-close').addEventListener('click', () => this.toggleMap());
      $('craft-close').addEventListener('click', () => this.toggleCraft());
      $('chest-close').addEventListener('click', () => this.closeChest());
      $('stove-close').addEventListener('click', () => this.closeStove());
      $('warn-ok').addEventListener('click', () => this.closeWarn());
      $('chest-take').addEventListener('click', () => this.takeChest());
      $('btn-pause').addEventListener('click', () => this.togglePause());
      $('totemswitch').addEventListener('click', () => { if (!this.player.dead) this.toggleTotem(); });
      $('pause-resume').addEventListener('click', () => this.togglePause());
      $('pause-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
      $('pause-home').addEventListener('click', () => { this.save(); location.reload(); });   // 回到主頁：先存檔，再回起始頁
      $('btn-map').addEventListener('click', () => { if (this.userPaused || this.player.dead || this.player.knock > 0) return; $('journal').classList.add('hidden'); $('craft').classList.add('hidden'); this.toggleMap(); });
      $('minimap').addEventListener('click', () => $('btn-map').click());
      $('seaask-go').addEventListener('click', () => this.seaGo());
      $('seaask-no').addEventListener('click', () => this.closeSea());
      $('fogask-use').addEventListener('click', () => this.fogUseFan());
      $('fogask-no').addEventListener('click', () => this.fogRefuse());
      $('voyage-back').addEventListener('click', () => { $('voyage').classList.add('hidden'); this.paused = false; this.message('回頭。再開出去就走了。'); });
      $('voyage-new').addEventListener('click', () => { try { localStorage.setItem(CARRY_KEY, this.player.cour + '@' + this.slot); } catch (e) { /* ignore */ } Game.clearSave(this.slot); location.reload(); });   // 這一格清掉，重載後還選著它，落筆就寫回這格
    }
    cycle(d) { const p = this.player; if (p.bag.length) p.sel = (p.sel + d + p.bag.length) % p.bag.length; this.buildBag(); }
    togglePause() {
      if (this.player.dead || this.fogAsk || this.seaAsk || this.warnOpen || !$('start').classList.contains('hidden') || !$('voyage').classList.contains('hidden')) return;
      this.userPaused = !this.userPaused; this.paused = this.userPaused;
      $('pause').classList.toggle('hidden', !this.userPaused); this.keys.clear(); this.action = null;
    }

    // ---------- HUD ----------
    sortBag() {            // 囊分兩段：可食的在前，其餘在後；選中的跟著走
      const p = this.player, sel = p.bag[p.sel], edible = (s) => { const it = G.item(s.n); return it && it.food ? 1 : 0; };
      p.bag.sort((a, b) => edible(b) - edible(a));
      if (sel) p.sel = Math.max(0, p.bag.indexOf(sel)); else if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
    }
    buildBag() {
      const p = this.player, bar = $('bagbar'); this.sortBag();
      const sig = p.bag.map(s => s.n + s.c + (s.dur !== undefined ? 'd' + s.dur : '') + (s.n === '果' ? '@' + this.fruitDays(s).join('.') : '')).join(',') + '|' + p.sel + '|' + this.day() + '|' + p.tools.map(s => s.n + s.dur).join(',') + '|' + p.tool
        + '|' + SLOT_ORDER.map(k => p.worn[k] ? p.worn[k].n + (p.worn[k].dur !== undefined ? this.effDays(p.worn[k]) : Math.ceil((p.worn[k].fuel || 0) / 10)) : '').join(',') + '|' + this.slots() + '|' + (this.totemOn() ? 1 : 0) + '|' + this.ironCount();
      if (sig === this.barSig) return;
      this.barSig = sig; bar.innerHTML = '';
      const nEd = p.bag.filter(s => { const it = G.item(s.n); return it && it.food; }).length, mkLabel = (t) => { const l = document.createElement('span'); l.className = 'rowlabel sub'; l.textContent = t; return l; };
      bar.appendChild(mkLabel('食'));
      for (let i = 0; i < this.slots(); i++) {
        if (i === nEd) bar.appendChild(mkLabel('物'));
        const s = p.bag[i], el = document.createElement('div');
        el.className = 'slot bag' + (s ? '' : ' empty') + (s && i === p.sel ? ' sel' : '');
        if (s) {
          const it = G.item(s.n);
          let sub = '×' + s.c;
          if (s.dur !== undefined) sub = this.durText(s);
          else if (s.fuel !== undefined) sub = s.fuel > 0 ? Math.ceil(s.fuel) + '息' : '滅';
          else if (s.n === '果') { const age = this.day() - this.fruitDays(s)[0]; sub = '×' + s.c + (age >= FERMENT_NIGHTS - 3 ? ' 將醉' : age >= 1 ? ' ' + age + '夜' : ''); }
          else if (s.store) sub = s.store.length + '樣';
          el.innerHTML = '<span class="num">' + (i < 9 ? i + 1 : '') + '</span><span class="ch' + (s.n.length > 1 ? ' word' : '') + (s.n.length > 2 ? ' long' : '') + '">' + s.n + '</span><span class="cost">' + sub + '</span>';
          if (s.dur !== undefined) { const pct = Math.round(100 * s.dur / (it.dur || this.lifeOf(s))); el.classList.add('ringed'); el.innerHTML += '<i class="ring' + (pct <= 25 ? ' low' : '') + '" style="--p:' + pct + '%"></i>'; }   // 耐久：一圈環包著格子
          else if (s.fuel !== undefined) el.innerHTML += '<i class="dur" style="width:' + Math.round(100 * s.fuel / HAT_FUEL) + '%"></i>';
          el.title = it.flavor + (s.n === '果' ? '\n' + this.fruitNote(s) : '') + (s.store ? '\n裡面：' + s.store.map(x => x.n + '×' + x.c).join('、') : '');
        }
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (this.isTool(s.n) && this.equipFromBag(i)) return; p.sel = i; this.buildBag(); });
        bar.appendChild(el);
      }
      const tb = $('toolbar'); tb.innerHTML = '';
      for (let i = 0; i < this.toolSlots(); i++) {
        const s = p.tools[i], el = document.createElement('div');
        el.className = 'slot bag tool' + (s ? '' : ' empty') + (s && i === p.tool ? ' sel' : '');
        if (s) {
          const it = ITEMS[s.n];
          el.innerHTML = '<span class="ch' + (s.n.length > 1 ? ' word' : '') + (s.n.length > 2 ? ' long' : '') + '">' + s.n + '</span><span class="cost">耐 ' + s.dur + '</span><i class="ring' + (s.dur / it.dur <= 0.25 ? ' low' : '') + '" style="--p:' + Math.round(100 * s.dur / it.dur) + '%"></i>'; el.classList.add('ringed');
          el.title = it.flavor + '（點一下手持，再點一下空手；右鍵移回囊）';
        } else el.title = '具欄：工具放這裡，P 換手持';
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (ev.button === 2) { this.unequipToBag(i); return; } p.tool = (p.tool === i) ? -1 : i; this.buildBag(); });
        el.addEventListener('contextmenu', (ev) => ev.preventDefault());
        tb.appendChild(el);
      }
      // 身上：上排襯褲甲，下排盔靴；下面四行是現在的數
      [['襯', '褲', '甲'], ['盔', '靴', '帽']].forEach((keys, ri) => {
        const row = $('worn' + (ri + 1)); row.innerHTML = '';
        for (const k of keys) {
          const s = p.worn[k], el = document.createElement('div');
          el.className = 'slot bag worn' + (s ? '' : ' empty');
          if (s && s.fuel !== undefined) { el.innerHTML = '<span class="ch word">' + s.n + '</span><span class="cost">' + (s.fuel > 0 ? Math.ceil(s.fuel) + '息' : '滅') + '</span><i class="dur" style="width:' + Math.round(100 * s.fuel / HAT_FUEL) + '%"></i>'; el.title = ITEMS[s.n].flavor + '（點一下脫下，右鍵用一根蠟燭續上）'; }
          else if (s) { const rate = Math.round(this.wearRate(s) * 100) + '%'; el.innerHTML = '<span class="ch word' + (s.n.length > 2 ? ' long' : '') + '">' + s.n + '</span><span class="cost">' + this.effDays(s) + '日</span><i class="dur" style="width:' + Math.round(100 * s.dur / this.lifeOf(s)) + '%"></i>'; el.title = ITEMS[s.n].flavor + '（照目前損耗速度 ' + rate + ' 還能穿 ' + this.effDays(s) + ' 日；點一下脫下，右鍵修補：' + (ITEMS[s.n].tung ? '鎢鋼一、力 12、飽 15' : (ITEMS[s.n].iron ? '鐵' : '麻布') + '一、力 4') + '）'; }
          else { el.innerHTML = '<span class="ch">' + k + '</span>'; el.title = '身上：' + k + '。囊裡選中衣甲按 F 穿上。'; }
          el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (ev.button === 2) this.repairWorn(k); else this.takeOff(k); });
          el.addEventListener('contextmenu', (ev) => ev.preventDefault());
          row.appendChild(el);
        }
      });
      const on = this.totemOn(), sw = $('totemswitch');
      sw.classList.toggle('on', !p.totemOff); sw.classList.toggle('ready', this.totemReady());
      sw.querySelector('.state').textContent = p.totemOff ? '關 · 普通服' : (this.totemReady() ? '開 · 山海衣' : '開（未齊）');
      $('wornstats').innerHTML = (on ? '<div class="totem">山海衣 · 獸紋已顯</div>' : '')
        + '<div><span>傷害獲取</span><b>' + Math.round(this.takenMult() * 100) + '%</b></div>'
        + '<div><span>移動速度</span><b>' + Math.round(this.ironSpeed() * 100) + '%</b></div>'
        + '<div><span>傷害輸出</span><b>' + Math.round(this.dmgMult() * 100) + '%</b></div>'
        + '<div><span>現今蟲獸傷害輸出</span><b>' + (on ? 167 : 100) + '%</b></div>';
    }
    updateHUD() {
      const p = this.player, w = this.world, t = this.facing();
      // 身上的四個數會隨膽氣、衣甲變，變了就重畫囊與身上
      const hat = this.hat();
      const ws = (this.totemOn() ? 1 : 0) + (this.totemReady() ? 1 : 0) + '|' + (hat ? Math.ceil(hat.fuel / 10) : '') + '|' + Math.round(this.takenMult() * 1000) + '|' + Math.round(this.dmgMult() * 1000) + '|' + Math.round(this.ironSpeed() * 1000) + '|' + this.wornList().map(s => this.effDays(s)).join(',');
      if (ws !== this.wornSig) { this.wornSig = ws; this.barSig = ''; }
      if (this.barSig === '') this.buildBag();
      const sig = [Math.round(p.hp), Math.round(p.food), Math.round(p.warm), Math.round(p.sta), p.staMax, Math.round(p.san), this.shichen(), p.x, p.y, w.get(p.x, p.y), this.daylight() > 0.5, this.day(), w.tideName(), p.sailing, this.peaceDays(), w.raining(), p.ship ? Math.round(p.ship.hp) + ':' + this.wardDays() : '', p.swimming ? Math.ceil(p.swimT) : ''].join('|');
      // 夥伴：右邊一隻一隻，命與力直條
      const comps = this.ents.tamed(), csig = comps.map(e => e.type + Math.round(e.hp) + '/' + Math.round(e.sta)).join(',');
      if (csig !== this.compSig) {
        this.compSig = csig; const box = $('companions'); box.innerHTML = '';
        for (const e of comps) {
          const el = document.createElement('div'); el.className = 'comp'; el.title = e.type + ' · 命 ' + Math.round(e.hp) + '/' + DB[e.type].hp + ' · 力 ' + Math.round(e.sta) + '/100（餵魚 +40）';
          el.innerHTML = '<span class="ch">' + e.type + '</span><div class="vbars"><i class="hp" style="height:' + Math.round(100 * e.hp / DB[e.type].hp) + '%"></i><i class="sta" style="height:' + Math.round(e.sta) + '%"></i></div>';
          box.appendChild(el);
        }
      }
      if (sig !== this.hudSig) {
        this.hudSig = sig;
        const fill = (id, v) => $(id).style.setProperty('--p', U.clamp(v, 0, 1).toFixed(3));
        fill('hpfill', p.hp / p.hpMax); fill('foodfill', p.food / 100); fill('warmfill', p.warm / 100); fill('stafill', p.sta / p.staMax); fill('sanfill', p.san / 100);
        for (const [k, , v] of this.vitalFracs()) { const el = $(k + 'fill').parentNode; el.classList.toggle('warn', v < WARN_LIGHT); el.classList.toggle('low', v < WARN_POP); }   // 不到五成亮燈，不到四分之一轉紅
        $('hplabel').innerHTML = '命<br>' + Math.round(p.hp) + (p.hpMax > 100 ? '<small>／' + Math.round(p.hpMax) + '</small>' : ''); $('foodlabel').innerHTML = '飽<br>' + Math.round(p.food); $('warmlabel').innerHTML = '暖<br>' + Math.round(p.warm); $('stalabel').innerHTML = '力<br>' + Math.round(p.sta); $('sanlabel').innerHTML = '愜<br>' + Math.round(p.san);
        const nn = this.nightNo();
        $('status').innerHTML = '<b>第 ' + this.day() + ' 日</b> &nbsp;' + this.shichen() + ' ' + (this.daylight() > 0.5 ? '日' : '月') + (w.raining() ? '雨' : '') + (this.isNight() ? '<span class="dim">（第 ' + nn + ' 夜' + (nn >= this.diff.ghost ? '，魄夜' : '') + '）</span>' : '') + ' &nbsp;·&nbsp; ' + w.tideName() + ' &nbsp;·&nbsp; ' + (p.sailing ? '船上 · ' + (p.ship ? p.ship.kind + ' ' + Math.round(p.ship.hp) + '/' + this.shipMax(p.ship) : '') + (this.shipWarded() ? ' · 船頭' + this.shipSkullName() + ' ' + this.wardDays() + ' 日' : '') : p.swimming ? '<b style="color:#b4392a">落水 · 還有 ' + Math.ceil(p.swimT) + ' 息</b>' : G.biomeName(w.get(p.x, p.y))) + (this.peaceDays() ? ' &nbsp;·&nbsp; <span class="dim">龜卜 · ' + this.peaceDays() + ' 日無魄</span>' : '') + ' &nbsp;·&nbsp; <span class="dim">(' + p.x + ', ' + p.y + ') · ' + this.diff.name + '</span>';
      }
      const lv = this.level(), daysLeft = p.decayAt ? Math.max(1, Math.ceil((p.decayAt - w.time) / DAY - 1e-6)) : 0;
      const cs = p.cour + '|' + lv + '|' + daysLeft + '|' + (this.hasHammer() ? 1 : 0);
      if (cs !== this.courSig) {
        this.courSig = cs;
        $('mapwrap').style.setProperty('--cour', Math.round(100 * this.levelFrac()) + '%');
        $('courlabel').textContent = (lv === 0 ? '膽氣 · 初' : '膽氣 · 第 ' + lv + ' 重') + (this.totemOn() ? ' · 山海衣' : '');
        const dec = $('courdecay');
        if (lv > this.decayFloor() && daysLeft) { dec.classList.remove('hidden'); dec.textContent = (this.hasHammer() ? '攜九閽鳴雷：廿五重以上二日一減' : '卅一重以上三日一減') + ' · 還有 ' + daysLeft + ' 日'; }
        else dec.classList.add('hidden');
      }
      let s;
      const ch = w.get(t.x, t.y), d = DB[ch], e = this.ents.at(t.x, t.y), plc = w.placeAt(t.x, t.y), hs = this.held();
      if (p.knock > 0) s = '昏迷中……';
      else if (p.insane && !p.ctrl) s = '<i>手腳不聽使喚……</i>';
      else if (p.swimming) {
        if (!this.shoreAt || performance.now() - this.shoreAt > 400) { this.shoreAt = performance.now(); this.shore = this.nearestShore(); }
        s = '<b>落水了！還有 ' + Math.ceil(p.swimT) + ' 息</b>' + (this.shore ? ' · 最近的岸：' + this.shore.dir + '約 ' + this.shore.n + ' 步' : '') + (e && e.type === '蜃' ? ' · <kbd>E</kbd> 打蜃' : '');
      }
      else if (p.sailing) s = (p.ship ? this.shipText(p.ship) : '船上') + ' · 撞岸即靠岸' + (e && e.type === '魚' ? ' · <kbd>E</kbd> 捉魚' : e && e.type === '蜃' ? ' · <kbd>E</kbd> 打蜃' : '') + (hs && ITEMS[hs.n] && ITEMS[hs.n].ward ? ' · <kbd>V</kbd> 放上船頭' : hs && hs.n === '木板' ? ' · <kbd>V</kbd> 補船' : '');
      else if (plc) s = '「' + plc.name + '」 · <kbd>E</kbd> 讀' + (hs && hs.n === '玻璃瓶' && (ch === '泉' || ch === '井') ? '　<kbd>E</kbd> 取淡水' : '');
      else if (e && e.type === '龍') s = '你的龍。';
      else if (e && e.type === '魄') s = '魄 · 無形。手裡有光六格內即煙滅';
      else if (e && e.type === '鷹') s = '鷹' + (e.tame ? '（你的 · 命 ' + Math.round(e.hp) + ' 力 ' + Math.round(e.sta) + '）' : e.angry ? '（怒）' : '（半友好）') + (hs && hs.n === '魚' ? ' · <kbd>F</kbd> ' + (e.tame ? '餵魚（力 +40）' : '投魚馴服（' + Math.round(this.tameChance() * 100) + '%）') : ' · 手持魚按 F ' + (e.tame ? '餵' : '馴')) + ' · <kbd>E</kbd> 攻擊';
      else if (e) s = '「' + e.type + '」' + (e.type === '蟾' ? (e.venom ? '（有毒）' : '（無毒）') : '') + (e.hp > 1 ? '（' + e.hp + '）' : '') + ' · <kbd>E</kbd> ' + (e.type === '魚' ? '捉' : e.type === '鳥' ? '驚' : this.heldDmg() ? '攻擊（' + this.activeTool().n + '）' : '<i>徒手打不了，具欄裡選把刀劍</i>');
      else if (w.fogAt(t.x, t.y)) { const n = this.count('扇'); s = '霧障 · 走進去會問你要不要用扇子吹散' + (n ? '（囊中 ' + n + ' 把' + (hs && hs.n === '扇' ? '；<kbd>V</kbd> 現在就搧' : '') + '）' : '（沒有扇子：草四木一可紮一把）'); }
      else if (ch === '碑') s = '一塊古碑 · <kbd>E</kbd> 讀碑';
      else if (ch === '包') s = '落下的荷包 · <kbd>E</kbd> 取回';
      else if (d.net) { const rec = w.netAt(t.x, t.y), f = rec ? w.netFish(rec, w.time) : 0, r = w.netRule(d.net); s = (d.net === 1 ? '小網' : d.net === 2 ? '中網' : '大網') + ' · 魚 ' + f + '/' + r.cap + '（' + r.every + ' 息一條）' + (f ? ' · <kbd>E</kbd> 取魚' : ' · <kbd>E</kbd> 收回'); }
      else if (ch === '漁') s = '魚梁 · <kbd>E</kbd> 取魚' + (w.time < (w.weirs.get(U.key(t.x, t.y)) || 0) ? '（魚還沒來）' : '');
      else if (ch === '門') s = '門 · <kbd>E</kbd> 問路';
      else if (ch === '櫃') s = '櫃 · <kbd>E</kbd> 開';
      else if (ch === '舟') { const rec = w.shipAt(t.x, t.y); s = (rec ? this.shipText(rec) : '船') + ' · <kbd>E</kbd> 上船' + (hs && ITEMS[hs.n] && ITEMS[hs.n].ward ? ' · <kbd>F</kbd> 首骨放上船頭' : hs && hs.n === '木板' ? ' · <kbd>F</kbd> 補船' : ''); }
      else if (ch === '偶') { const days = w.scareDays(t.x, t.y); s = '稻草人 · 還能守 ' + Math.ceil(days) + ' 天' + (hs && hs.n === '偶' ? ' · <kbd>F</kbd> 續' : '') + ' · <kbd>E</kbd> 拆下（重放重計）'; }
      else {
        s = '面前：' + (ch === '白' ? '白紙' : '<b>' + ch + '</b>') + (w.isBurning(t.x, t.y) ? ' <i class="fire">燃燒中</i>' : '') + ((ch === '灶' || ch === '鼎') ? (w.stoveLit(t.x, t.y) ? ' <i class="fire">火旺 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息</i>' : ' <i>冷的，先添柴</i>') : '');
        const tool = this.heldTool();
        if (hs && hs.n === '玻璃瓶' && d.kind === 'water') s += ' · <kbd>E</kbd> 取海水';
        else if (tool === '鋤' && (ch === '土' || ch === '草')) s += ' · <kbd>E</kbd> 鋤成田';
        else if (d.yield) {
          const need = d.need && tool !== d.need;
          s += ' · <kbd>E</kbd> ' + (need ? '<i>要用' + G.TOOL_NAMES[d.need] + '</i>' : '取 ' + Object.keys(d.yield).map(n => n + (d.yield[n] > 1 ? '×' + d.yield[n] : '')).join(' ') + (d.fast ? (tool === d.fast ? '（' + d.fast + '，快）' : '（' + d.fast + '更快）') : ''));
        }
        if (hs) {
          const it = G.item(hs.n), tl = ITEMS[hs.n] || {};
          if (tl.slot) s += ' · <kbd>F</kbd> ' + (tl.light ? '戴上' : '穿上');
          else if (hs.n === '錦囊') s += ' · <kbd>V</kbd> 用掉（囊多兩格、具欄多一格）';
          else if (tl.tool && tl.dur) s += ' · <kbd>F</kbd> 移進具欄';
          else if (ch === '鼎') s += (hs.n === '蟾蜍肉' || hs.n === '毒蟾肉') ? ' · <kbd>F</kbd> 煉丹' : (FUEL[hs.n] || (DB[hs.n] && DB[hs.n].flam > 0)) ? ' · <kbd>F</kbd> 添柴' : '';
          else if (ch === '灶') s += ' · <kbd>F</kbd> 開灶';
          else if ((DB[tl.tile || hs.n] || {}).place) s += ' · <kbd>F</kbd> 放「' + hs.n + '」';
          if (it.food) s += ' · <kbd>V</kbd> ' + (hs.n.indexOf('瓶') >= 0 || hs.n === '果酒' ? '喝' : '吃');
        }
        if (this.bedNear()) s += ' · <kbd>R</kbd> 睡';
        if (ch === '灶') s += (hs ? '' : ' · <kbd>F</kbd> 開灶') + '<br><span class="dim">灶：按 F 開灶，在灶裡添柴、烤魚肉、燒瓶、蒸餾、煉鐵煉鎢鋼</span>';
        if (ch === '鼎') s += '<br><span class="dim">鼎：選中木或煤按 F 添柴；火旺時選中蟾蜍肉或毒蟾肉按 F 煉丹（這次 ' + Math.round(this.pillChance('蟾蜍肉') * 100) + '%／' + Math.round(this.pillChance('毒蟾肉') * 100) + '%，已煉 ' + p.pillsMade + ' 顆）</span>';
      }
      if (this.msgUntil && performance.now() < this.msgUntil) s = this.msgText;
      if (s !== this.lastMsg) { this.lastMsg = s; $('msg').innerHTML = s; }
    }
    message(text) { if (!text) return; this.msgText = '<i>' + text + '</i>'; this.msgUntil = performance.now() + 2400; this.lastMsg = null; }
    toast(title, body, ms) {
      const el = document.createElement('div'); el.className = 'toast';
      el.innerHTML = '<b>' + title + '</b>' + (body ? '<span>' + body + '</span>' : '');
      $('toasts').appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, ms || 4500);
    }

    // ---------- 存檔 ----------
    save() {
      const p = this.player;
      try {
        localStorage.setItem(Game.slotKey(this.slot), JSON.stringify({ v: 5, seed: this.seed, diff: this.diff.key, savedAt: Date.now(), brief: this.brief(), world: this.world.serialize(), ents: this.ents.serialize(),
          player: { x: p.x, y: p.y, fx: p.fx, fy: p.fy, hp: p.hp, food: p.food, warm: p.warm, sta: p.sta, staMax: p.staMax, san: p.san, cour: p.cour, bag: p.bag, sel: p.sel, home: p.home, readSteles: p.readSteles,
            places: p.places, creatures: p.creatures, raftTaken: p.raftTaken, dragon: p.dragon, finished: p.finished, deaths: p.deaths, burn: p.burn, lastDay: p.lastDay, poisonT: p.poisonT, poisonPer: p.poisonPer, sailing: p.sailing, tools: p.tools, tool: p.tool, decayAt: p.decayAt, worn: p.worn, hitWin: p.hitWin, totemOff: p.totemOff, pouches: p.pouches, noGhostUntil: p.noGhostUntil, hpMax: p.hpMax, pillsMade: p.pillsMade, pillsEaten: p.pillsEaten, inFog: p.inFog, ship: p.ship, swimming: p.swimming, swimT: p.swimT }, stats: this.stats }));
      } catch (err) { /* 隱私模式等情況下存不了，就算了 */ }
    }
    load(s) {
      const p = this.player;
      this.world.restore(s.world || {});
      this.ents.restore(s.ents);
      const sp = s.player || {};
      for (const k of ['x', 'y', 'fx', 'fy', 'hp', 'food', 'warm', 'sta', 'staMax', 'san', 'cour', 'bag', 'sel', 'home', 'readSteles', 'places', 'creatures', 'raftTaken', 'dragon', 'finished', 'deaths', 'burn', 'lastDay', 'poisonT', 'poisonPer', 'sailing', 'tools', 'tool', 'decayAt', 'worn', 'hitWin', 'totemOff', 'pouches', 'noGhostUntil', 'hpMax', 'pillsMade', 'pillsEaten', 'inFog', 'ship', 'swimming', 'swimT']) if (sp[k] !== undefined) p[k] = sp[k];
      if (p.sailing && !p.ship) p.ship = World.newShip('孤帆');     // 舊存檔在船上：給一條滿命的孤帆
      if (p.ship && !p.ship.kind) p.ship = { kind: '孤帆', hp: Math.min(p.ship.hp, G.SHIPS['孤帆'].hp), skulls: p.ship.skull && p.ship.ward > this.world.time ? [[p.ship.skull, p.ship.ward]] : [], repairs: 0 };   // v0.11 的船
      const rename = (list) => { for (const it of list || []) if (it && it.n === '大船') it.n = '孤帆'; };   // v0.11 的大船就是現在的孤帆
      rename(p.bag); for (const l of this.world.chests.values()) rename(l); for (const l of this.world.bags.values()) rename(l);
      if ((s.ents || []).some(e => e.t === '蜃')) {              // 沒解決的蜃：讀檔後牠散了，但膽氣減五重
        const before = this.level(); this.dropLevels(SEA_PENALTY);
        this.toast('蜃沒了結', '讀檔時海上的蜃散了，可你是逃掉的：膽氣第 ' + before + ' 重減到第 ' + this.level() + ' 重。其餘都在。', 10000);
      }
      // 舊存檔裡已經不存在的東西丟掉，身上的衣甲要對得上格子
      const known = (s) => !!(s && G.item(s.n));
      p.bag = (p.bag || []).filter(known); p.tools = (p.tools || []).filter(known);
      for (const s of p.bag) if (s.store) { s.store = s.store.filter(known); if (!s.store.length) delete s.store; }   // 拆下來的櫃裡的東西也要是還存在的
      if (p.tool >= p.tools.length) p.tool = p.tools.length - 1;
      const worn = {}; for (const k of SLOT_ORDER) { const s = p.worn && p.worn[k]; worn[k] = known(s) && ITEMS[s.n].slot === k ? s : null; } p.worn = worn;
      if (!p.hitWin || typeof p.hitWin.n !== 'number') p.hitWin = { start: -99, n: 0 };
      for (const s of p.bag) if (s.n === '燈帽' && s.fuel === undefined) { s.fuel = HAT_FUEL; s.c = 1; }   // 舊存檔的燈帽補上蠟燭
      const fr = p.bag.filter(s => s.n === '果');   // 舊存檔按日分堆的果合成一疊，每顆的日數記進 ds
      if (fr.length) { const ds = []; for (const s of fr) ds.push(...this.fruitDays(s)); p.bag = p.bag.filter(s => s.n !== '果'); this.addItem('果', ds.length, { ds }); }
      p.rx = p.x; p.ry = p.y; p.moveT = 0;
      Object.assign(this.stats, s.stats || {});
    }
    brief() { const p = this.player; return { day: this.day(), night: this.nightNo(), isNight: this.isNight(), level: this.level(), deaths: p.deaths, nights: this.stats.nights }; }   // 起始頁的存檔格要顯示的摘要
    static slotKey(n) { return n > 1 ? SAVE_KEY + '.' + n : SAVE_KEY; }
    static readSave(n) { try { const s = JSON.parse(localStorage.getItem(Game.slotKey(n || 1))); return s && s.v === 5 ? s : null; } catch (e) { return null; } }
    static clearSave(n) { try { localStorage.removeItem(Game.slotKey(n || 1)); } catch (e) { /* ignore */ } }
    static levelOf(cour) { let l = 0; while (l + 1 < CUM.length && cour >= CUM[l + 1]) l++; return l; }
    // 一格存檔的摘要：島號、難度、第幾日第幾夜、膽氣第幾重、死過幾次、睡過幾夜、存檔時刻。舊存檔沒有 brief，就從世界時間與膽氣算
    static summary(s) {
      const t = (s.world && s.world.time) || 0, b = s.brief || {}, p = s.player || {}, frac = (t % DAY) / DAY;
      const day = b.day || Math.floor(t / DAY) + 1, night = b.night !== undefined ? b.night : (frac > 0.5 ? day : day - 1), isNight = b.isNight !== undefined ? b.isNight : (frac > 0.5 || frac < 0.06);
      const level = b.level !== undefined ? b.level : Game.levelOf(p.cour || 0), when = s.savedAt ? new Date(s.savedAt) : null, pad = (n) => (n < 10 ? '0' : '') + n;
      return { seed: s.seed, diff: (DIFF[s.diff] || DIFF.normal).name, day, night, isNight, level, deaths: b.deaths !== undefined ? b.deaths : (p.deaths || 0), nights: b.nights !== undefined ? b.nights : ((s.stats || {}).nights || 0), savedAt: s.savedAt || 0,
        dayText: '第 ' + day + ' 日 · ' + (isNight && night > 0 ? '第 ' + night + ' 夜' : night > 0 ? '過了 ' + night + ' 夜' : '未入夜'),
        whenText: when ? pad(when.getMonth() + 1) + '/' + pad(when.getDate()) + ' ' + pad(when.getHours()) + ':' + pad(when.getMinutes()) : '' };
    }
  }

  // ---------- 啟動畫面 ----------
  function boot() {
    const q = new URLSearchParams(location.search);
    const saves = [null]; for (let n = 1; n <= SAVE_SLOTS; n++) saves[n] = Game.readSave(n);
    let game = null, diff = DIFF[q.get('diff')] ? q.get('diff') : 'normal', slot = 1, armed = null;
    {   // 預設選哪一格：網址 ?slot=、上次玩的那格、最近存的那格、第一格
      const qs = parseInt(q.get('slot'), 10); let last = 0, newest = 0; try { last = parseInt(localStorage.getItem(SLOT_KEY), 10); } catch (e) { /* ignore */ }
      for (let n = 1; n <= SAVE_SLOTS; n++) if (saves[n] && (!newest || (saves[n].savedAt || 0) > (saves[newest].savedAt || 0))) newest = n;
      slot = qs >= 1 && qs <= SAVE_SLOTS ? qs : last >= 1 && last <= SAVE_SLOTS ? last : newest || 1;
    }
    const DESC = { easy: '第二十一夜起有魄；受傷九成、攻擊加一成。', normal: '第十三夜起有魄。', hard: '第九夜起有魄；受傷加一成、攻擊九成，夜裡狼虎豹蛇一倍半。' };
    const pickDiff = (k) => { diff = k; document.querySelectorAll('.diffrow button').forEach(b => b.classList.toggle('on', b.dataset.diff === k)); $('diff-desc').textContent = DESC[k]; };
    document.querySelectorAll('.diffrow button').forEach(b => b.addEventListener('click', () => pickDiff(b.dataset.diff)));
    pickDiff(diff);
    const start = (seed, useSave) => {
      if (game) return;
      SFX.init();
      game = new Game(seed, useSave ? saves[slot] : null, diff, slot);
      try { localStorage.setItem(SLOT_KEY, String(slot)); } catch (e) { /* ignore */ }
      window.XIEYI = { game, Game, DAY, DIFF };
      $('start').classList.add('hidden');
      game.paused = false;
      game.toast('山海有形', '取木、取棉、取石子；砌磚、造床、磨劍。第 ' + game.diff.ghost + ' 夜起有魄，備好火把。按 H 看法子。', 7000);
      setTimeout(() => { if (game) game.toast('聽說島上有一座塔', '從塔上能看見整張紙。黃昏時跟著鳥走。', 8000); }, 5000);
      window.addEventListener('beforeunload', () => game.save());
      document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
    };
    // 三格存檔：每格寫島號、難度、第幾日第幾夜、膽氣第幾重、死過幾次、睡過幾夜、存檔時刻。點格子選它；「繼續」讀那格；「落筆」寫進選著的格，格裡有存檔要再按一次才覆蓋；「刪」也要按兩次
    const disarm = () => { if (!armed) return; armed.el.textContent = armed.text; armed.el.classList.remove('arm'); clearTimeout(armed.t); armed = null; };
    const arm = (el, text) => { disarm(); armed = { el, text: el.textContent, t: setTimeout(disarm, 3000) }; el.textContent = text; el.classList.add('arm'); };
    const pick = (n) => { slot = n; disarm(); document.querySelectorAll('.save-card').forEach(c => c.classList.toggle('on', +c.dataset.slot === n)); $('new-hint').textContent = saves[n] ? '第' + SLOT_NAMES[n] + '格有存檔，落筆會覆蓋它。' : '落筆寫在第' + SLOT_NAMES[n] + '格。'; };
    const renderSaves = () => {
      const box = $('saves'); box.innerHTML = '';
      for (let n = 1; n <= SAVE_SLOTS; n++) {
        const s = saves[n], card = document.createElement('div');
        card.className = 'save-card' + (s ? '' : ' empty'); card.dataset.slot = n;
        if (s) {
          const m = Game.summary(s);
          card.innerHTML = '<div class="save-no">' + SLOT_NAMES[n] + '</div><div class="save-body"><b>島 #' + m.seed + '</b> · ' + m.diff + '<br>' + m.dayText + ' · 膽氣第 ' + m.level + ' 重<br><span class="dim small">' + (m.deaths ? '死過 ' + m.deaths + ' 次 · ' : '') + '睡過 ' + m.nights + ' 夜' + (m.whenText ? ' · 存於 ' + m.whenText : '') + '</span></div><div class="save-btns"><button class="save-go">繼續</button><button class="save-del ghost">刪</button></div>';
          card.querySelector('.save-go').addEventListener('click', (ev) => { ev.stopPropagation(); pick(n); start(s.seed, true); });
          card.querySelector('.save-del').addEventListener('click', (ev) => { ev.stopPropagation(); const b = ev.currentTarget; if (armed && armed.el === b) { disarm(); Game.clearSave(n); saves[n] = null; renderSaves(); pick(n); } else arm(b, '真的刪？'); });
        } else card.innerHTML = '<div class="save-no">' + SLOT_NAMES[n] + '</div><div class="save-body"><b>空格</b><br>選這一格，落筆開新島。</div>';
        card.addEventListener('click', () => pick(n));
        box.appendChild(card);
      }
      pick(slot);
    };
    renderSaves();
    const seedInput = $('seed');
    seedInput.value = q.get('seed') || String(Math.floor(Math.random() * 1e6));
    const newGame = () => { Game.clearSave(slot); saves[slot] = null; let s = parseInt(seedInput.value, 10); if (isNaN(s)) s = Array.from(seedInput.value).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7); start(s, false); };
    $('btn-new').addEventListener('click', () => { if (game) return; const b = $('btn-new'); if (saves[slot] && !(armed && armed.el === b)) { arm(b, '覆蓋第' + SLOT_NAMES[slot] + '格？'); return; } disarm(); newGame(); });
    window.addEventListener('keydown', (ev) => { if (game || ev.code !== 'Enter') return; ev.preventDefault(); if (saves[slot]) start(saves[slot].seed, true); else $('btn-new').click(); });   // 回車：選著的格有存檔就繼續，空的就落筆
    $('btn-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
    $('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
    if (q.get('autostart')) { Game.clearSave(slot); saves[slot] = null; start(parseInt(q.get('seed') || '42', 10), false); }
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
