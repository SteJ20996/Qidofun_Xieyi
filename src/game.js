// game.js —— 主迴圈、輸入、取／攻擊／放／製作／吃／睡／上船、命飽暖力愜與膽氣、毒與魄、死亡與復活、見聞錄、HUD、存檔
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB, ITEMS = G.ITEMS;
  const SAVE_KEY = 'xieyi.save.v5', CARRY_KEY = 'xieyi.carry';
  const DAY = 240;
  const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';
  const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const SLOTS = 16, STACK = 64, CHEST_SLOTS = 24, TOOL_SLOTS = 6, GHOST_NIGHT = 13, FERMENT_NIGHTS = 15, SHIP_LEVEL = 8, TOTEM_LEVEL = 10, DECAY_LEVEL = 31, DECAY_DAYS = 3;
  // 膽氣：第 n 重升到 n+1 重要 20×(1+0.1n)² 點：20、24.2、28.8、33.8、39.2……八重共 300，十重 437，卅一重 4371
  const LEVEL_UNIT = 20;
  const levelCost = (n) => Math.round(LEVEL_UNIT * (1 + 0.1 * n) * (1 + 0.1 * n) * 100) / 100;
  const CUM = [0]; for (let n = 0; n < 120; n++) CUM.push(Math.round((CUM[n] + levelCost(n)) * 100) / 100);
  // 衣甲：五件一套，一百八十日勻速穿破；十五息內挨打越多壞得越快，且會累加
  const SLOT_ORDER = ['襯', '褲', '甲', '盔', '靴'], ARMOR_LIFE = 180 * DAY, HIT_MULT = [1, 1.05, 1.12, 1.2, 1.5];
  const FUEL = { '煤': 120 };   // 灶的好柴：一塊煤燒一百二十息
  const $ = (id) => document.getElementById(id);

  class Game {
    constructor(seed, save) {
      this.seed = seed | 0;
      this.world = new World(this.seed);
      this.ents = new Entities(this.world);
      this.world.onDiscover = (pl) => this.discover(pl);
      this.renderer = new Renderer($('world'), $('minimap'));
      this.mapAcc = 0;
      this.player = { x: 0, y: 0, rx: 0, ry: 0, fx: 0, fy: 1, fromX: 0, fromY: 0, moveT: 0, stepDur: 0.2,
        hp: 100, food: 100, warm: 100, sta: 100, staMax: 100, san: 100, cour: 0,
        hurtT: 0, atkT: 0, bag: [], sel: 0, tools: [], tool: -1, worn: { '襯': null, '褲': null, '甲': null, '盔': null, '靴': null }, hitWin: { start: -99, n: 0 }, home: null, readSteles: [], places: {}, creatures: [], raftTaken: false, dragon: false, finished: false,
        deaths: 0, dead: false, warned: {}, burn: {}, lastDay: 1,
        poisonT: 0, poisonPer: 0, biteN: 0, biteLast: -99, zeroSan: 0, insane: false, ctrl: true, ctrlT: 0, knock: 0, sailing: false, crossed: false, decayAt: 0 };
      this.stats = { gathered: 0, crafted: 0, kills: 0, read: 0, nights: 0, bites: 0 };
      this.keys = new Set();
      this.action = null;
      this.fx = [];
      this.paused = true;
      this.saveAcc = 0; this.sanAcc = 0;
      this.last = 0;
      this.msgText = ''; this.hudSig = ''; this.barSig = ''; this.courSig = '';
      this.chestAt = null; this.userPaused = false;
      this.spawn = this.world.findSpawn();
      if (save) this.load(save);
      else {
        this.player.x = this.player.rx = this.spawn.x; this.player.y = this.player.ry = this.spawn.y;
        try { const c = parseInt(localStorage.getItem(CARRY_KEY) || '0', 10); if (c > 0) { this.player.cour = c; localStorage.removeItem(CARRY_KEY); } } catch (e) { /* ignore */ }
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
    ghostNight() { return this.darkness() > 0.5 && this.nightNo() >= GHOST_NIGHT; }
    ghostCap() { return Math.min(6, 2 + Math.floor((this.nightNo() - GHOST_NIGHT) / 2)); }
    shichen() { const hour = (6 + this.dayT() * 24) % 24; return SHICHEN[Math.floor(((hour + 1) % 24) / 2)] + '時'; }
    level() { const c = this.player.cour; let l = 0; while (l + 1 < CUM.length && c >= CUM[l + 1]) l++; return l; }
    levelAt(l) { return CUM[Math.max(0, Math.min(CUM.length - 1, l))]; }     // 到第 l 重要累積多少膽氣
    levelCost(n) { return levelCost(n); }
    levelFrac() { const l = this.level(); return U.clamp((this.player.cour - CUM[l]) / levelCost(l), 0, 1); }
    mult() { return 1 + Math.min(10, this.level()) / 10; }                 // 膽氣越高回得越快，十重兩倍
    // 衣甲
    wornList() { const w = this.player.worn; return SLOT_ORDER.map(k => w[k]).filter(Boolean); }
    wornFull() { return this.wornList().length === 5; }
    ironCount() { return this.wornList().filter(s => ITEMS[s.n].iron).length; }
    ironFull() { return this.ironCount() === 4; }                                                // 鐵甲鐵褲鐵盔鐵靴齊：毒不侵
    armorRed() { return this.wornList().reduce((a, s) => a + (ITEMS[s.n].red || 0), 0); }      // 減傷：布五件一成，鐵四件加內襯三成
    ironSpeed() { return 1 - 0.0625 * this.ironCount(); }                                        // 四件鐵慢四分之一
    ironAtk() { return 1 + 0.0125 * this.ironCount(); }                                          // 四件鐵攻擊加半成
    ironDrain() { return 1 + 0.02 * this.ironCount(); }                                          // 四件鐵飢愜力掉得快八分
    wornWarm() { return this.wornList().some(s => ITEMS[s.n].warm); }
    // 山海衣：五件穿齊、十重膽氣，衣上浮出獸紋；脫下任何一件即隱
    totemOn() { return this.level() >= TOTEM_LEVEL && this.wornFull(); }
    ladder() { return this.totemOn() ? Math.floor((this.level() - TOTEM_LEVEL) / 7) : -1; }     // 十至十六重 0，十七重 1，二十四重 2……
    dmgMult() { const k = this.ladder(); return (k < 0 ? 1 : Math.pow(1.15, k + 1)) * this.ironAtk(); }        // 造成的傷害
    takenMult() { const k = this.ladder(); return (k < 0 ? 1 : Math.pow(1.15, -k)) * (1 - this.armorRed()); }  // 受到的傷害
    totemNear(x, y) { return this.totemOn() && U.cheb(x, y, this.player.x, this.player.y) <= 7; }
    durText(s) { if (s.dur === undefined) return '×' + s.c; const it = ITEMS[s.n] || {}; return it.slot ? Math.max(1, Math.ceil(s.dur / DAY)) + ' 日' : '耐 ' + s.dur; }
    wearRate(s) { return (s.wm || 1) * (HIT_MULT[this.player.hitWin.n] || 1); }                 // 這件現在的損耗速度
    effDays(s) { return Math.max(1, Math.ceil(s.dur / this.wearRate(s) / DAY)); }              // 照目前速度還能穿幾日
    wearItem(i) {        // 把囊裡第 i 格的衣甲穿上，原來那件回囊
      const p = this.player, s = p.bag[i]; if (!s) return false;
      const it = ITEMS[s.n]; if (!it || !it.slot) return false;
      const was = this.totemOn(), old = p.worn[it.slot];
      let piece;
      if (s.c > 1 && s.dur === undefined) { s.c--; piece = { n: s.n, c: 1 }; } else { p.bag.splice(i, 1); piece = s; }
      if (piece.dur === undefined) piece.dur = ARMOR_LIFE;
      if (piece.wm === undefined) piece.wm = 1;
      p.worn[it.slot] = piece;
      if (old) p.bag.splice(Math.min(i, p.bag.length), 0, old);
      if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
      this.barSig = ''; this.buildBag(); SFX.write();
      this.message('穿上「' + piece.n + '」' + (old ? '，脫下「' + old.n + '」' : '') + '。減傷 ' + Math.round(this.armorRed() * 100) + '%。');
      if (this.totemOn() && !was) this.toast('山海衣', '五件穿齊，十重膽氣，衣上浮出山海經裡的獸紋。七格內的獸慢一倍卻狠三分之二；你的刀更利，皮更厚。');
      return true;
    }
    takeOff(slot) {
      const p = this.player, s = p.worn[slot]; if (!s) return;
      if (p.bag.length >= SLOTS) { this.message('囊已滿。'); SFX.fail(); return; }
      const was = this.totemOn();
      p.worn[slot] = null; p.bag.push(s); this.barSig = ''; this.buildBag(); SFX.write();
      this.message('脫下「' + s.n + '」。' + (was ? '山海衣的獸紋隱去。' : ''));
    }
    armorHit() {         // 挨了一下：十五息內算同一輪，一下 1.05、兩下 1.12、三下 1.2、四下 1.5，五下甲襯褲碎
      const p = this.player, win = p.hitWin, now = this.world.time, worn = this.wornList();
      if (!worn.length) return;
      if (win.n && now - win.start > 15) { for (const s of worn) s.wm = (s.wm || 1) * HIT_MULT[win.n]; win.n = 0; }
      if (!win.n) win.start = now;
      win.n++;
      if (win.n >= 5) {
        for (const s of worn) s.wm = (s.wm || 1) * HIT_MULT[4];
        const gone = [];
        for (const k of ['甲', '襯', '褲']) if (p.worn[k]) { gone.push(p.worn[k].n); p.worn[k] = null; }
        win.n = 0; this.barSig = '';
        if (gone.length) { this.toast('衣甲碎了', '十五息內挨了五下，' + gone.join('、') + '都碎了。'); SFX.fail(); }
      }
    }
    addCourage(n) {
      const p = this.player, l0 = this.level(); p.cour += n;
      const l = this.level();
      if (l > l0) {
        let extra = '';
        if (l === SHIP_LEVEL) extra = '可以造大船了。';
        else if (l === TOTEM_LEVEL) extra = '五件衣甲穿齊，衣上便浮出山海衣的獸紋：七格內獸慢而狠，你的攻擊 ×1.15。';
        else if (l > TOTEM_LEVEL && (l - TOTEM_LEVEL) % 7 === 0) extra = '山海衣再深一層：攻擊再 ×1.15，受傷再 ÷1.15。';
        else if (l === DECAY_LEVEL + 1) extra = '過了卅一重，三日一減，不低於卅一重。';
        this.toast('膽氣長了一重', '第 ' + l + ' 重：回復 ' + Math.round(this.mult() * 100) / 100 + ' 倍。' + extra); SFX.learn();
        this.barSig = '';
      }
    }
    decayCourage() {
      const p = this.player, l = this.level(); if (l <= DECAY_LEVEL) return;
      const frac = (p.cour - CUM[l]) / levelCost(l);
      p.cour = Math.min(CUM[l] - 1, Math.floor(CUM[l - 1] + frac * levelCost(l - 1)));
      this.toast('膽氣衰減', '過了卅一重，三日一減：現在第 ' + this.level() + ' 重。', 6000);
    }
    // 照明：手裡的火把或蠟燭、頭上的燈帽
    heldLight() { const s = this.held(); const it = s && ITEMS[s.n]; return it && it.light ? it.light : 0; }
    lightRadius() { return Math.max(this.heldLight(), this.has('燈帽') ? ITEMS['燈帽'].light : 0); }
    hasLight() { return this.lightRadius() > 0; }
    torchLit() { return this.darkness() > 0.5 && this.hasLight(); }
    playerLight() { return 4.5 - 1.5 * this.darkness() + this.lightRadius(); }
    canAct() { const p = this.player; return !p.dead && p.knock <= 0 && p.ctrl; }
    vignette() {
      const p = this.player;
      return { red: p.hp < 50 ? (1 - p.hp / 50) * 0.6 : 0, green: p.poisonT > 0 ? 0.45 : 0, blue: p.insane ? 0.55 : (p.san < 20 ? 0.25 : 0) };
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
      if (!$('map').classList.contains('hidden')) { this.mapAcc += dt; if (this.mapAcc > 0.5) { this.mapAcc = 0; this.renderer.drawBigMap(this, $('bigmap')); } }
      requestAnimationFrame((t) => this.frame(t));
    }
    update(dt) {
      const p = this.player;
      this.world.tick(dt, p.x, p.y);
      if (this.day() !== p.lastDay) this.newDay();
      this.handleMove(dt);
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
        if (s.n === '果' && s.d !== undefined && p.lastDay - s.d >= FERMENT_NIGHTS) { fermented += s.c; p.bag.splice(i, 1); }
      }
      if (fermented) { this.addItem('醉果', fermented); this.toast('果子醉了', '放過十五夜的果變成了醉果。吃了昏迷一刻；二醉果合一淡水成酒。'); }
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
      if (w.nearChar(p.x, p.y, '泉', 1)) { p.hp = Math.min(100, p.hp + 2 * dt); p.warm = Math.min(100, p.warm + 1.5 * dt); }
      // 手裡的光會燒
      const hs = this.held(), hit = hs && ITEMS[hs.n];
      if (dark > 0.5 && hit && hit.light && hit.life) {
        p.burn[hs.n] = (p.burn[hs.n] || 0) + dt;
        if (p.burn[hs.n] >= hit.life) { p.burn[hs.n] = 0; this.removeItem(hs.n, 1); this.message('一支' + hs.n + '燃盡了。'); }
      }
      // 力：每兩息回一點；愜意：每十五息掉一點
      p.sta = Math.min(p.staMax, p.sta + 0.5 * m * dt);
      p.san = Math.max(0, p.san - dt / 15 * drain);
      this.sanAcc += dt;
      if (this.sanAcc >= 60) {                     // 每分鐘：鹿呦、鳥鳴、海浪各 +1
        this.sanAcc = 0; const heard = [];
        if (this.ents.nearOf('鹿', p.x, p.y, 10)) heard.push('鹿呦');
        if (this.ents.nearOf('鳥', p.x, p.y, 10)) heard.push('鳥鳴');
        if (w.nearChar(p.x, p.y, '淼', 8)) heard.push('海浪');
        if (heard.length) { p.san = Math.min(100, p.san + heard.length * m); this.fx.push({ type: 'float', x: p.x, y: p.y, text: heard.join(' ') + ' +' + heard.length, color: G.INK.water, t: 0, dur: 1.4 }); }
      }
      // 魄：四格內無光，蝕心耗力
      if (dark > 0.5 && !this.hasLight() && this.ents.ghostNear(p.x, p.y, 4)) { p.san = Math.max(0, p.san - 3 * dt); p.sta = Math.max(0, p.sta - 2 * dt * drain); if (!p.warned.drain) { p.warned.drain = true; this.toast('魄近身', '心裡發涼，手腳發軟。點亮火把或蠟燭。'); } }
      // 毒
      if (p.poisonT > 0) { p.poisonT -= dt; p.hp = Math.max(0, p.hp - p.poisonPer * dt); if (p.poisonT <= 0) { p.poisonPer = 0; this.message('毒勁過了。'); } }
      p.hurtT = Math.max(0, p.hurtT - dt); p.atkT = Math.max(0, p.atkT - dt);
      // 命：飽、愜意、力都在八成以上才回；餓、凍、力盡都耗
      let dh = 0;
      if (p.food <= 0) dh -= 2;
      if (p.warm <= 0) dh -= 3;
      if (p.sta <= 0) dh -= 2;
      if (dh === 0 && p.hurtT <= 0 && p.food >= 80 && p.san >= 80 && p.sta >= 80) dh = 1 * m;
      p.hp = U.clamp(p.hp + dh * dt, 0, 100);
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
      if (nn === GHOST_NIGHT - 1 && dark > 0.5 && !p.warned.eve) { p.warned.eve = true; this.toast('第十二夜', '明晚起，魄夜行。備好火把、蠟燭或燈帽。', 8000); }
      if (this.ghostNight() && !p.warned['g' + nn]) { p.warned['g' + nn] = true; this.toast('第 ' + nn + ' 夜', '魄來了。穿牆，不怕磚；手裡有光六格內即煙滅。', 8000); }
      // 衣甲：一百八十日勻速穿破；挨打那一輪過了十五息，加速便固定下來
      const win = p.hitWin;
      if (win.n && w.time - win.start > 15) { for (const s of this.wornList()) s.wm = (s.wm || 1) * HIT_MULT[win.n]; win.n = 0; }
      const wearRate = HIT_MULT[win.n] || 1;
      for (const k of SLOT_ORDER) {
        const s = p.worn[k]; if (!s) continue;
        s.dur -= dt * (s.wm || 1) * wearRate;
        if (s.dur <= 0) { p.worn[k] = null; this.barSig = ''; this.toast('「' + s.n + '」穿破了', '一百八十日的布與鐵，到頭了。'); SFX.fail(); }
      }
      // 膽氣過了卅一重，三日一減，不低於卅一重
      if (this.level() > DECAY_LEVEL) {
        if (!p.decayAt) p.decayAt = w.time + DECAY_DAYS * DAY;
        else if (w.time >= p.decayAt) { this.decayCourage(); p.decayAt = w.time + DECAY_DAYS * DAY; }
      } else p.decayAt = 0;
      // 渡海：開到海的盡頭
      if (p.sailing && !p.crossed && Math.hypot(p.x, p.y) > G.ISLAND_R + 20) this.crossSea();
      if (p.hp <= 0) this.die(p.food <= 0 ? '餓' : p.warm <= 0 ? '凍' : p.sta <= 0 ? '累' : p.poisonT > 0 ? '毒' : '傷');
    }
    die(cause) {
      const p = this.player, w = this.world;
      p.dead = true; p.deaths++; p.knock = 0; $('knock').classList.add('hidden');
      const drop = p.bag.concat(p.tools, this.wornList());
      const landOk = (x, y) => { const d = w.info(x, y); return d.walk > 0 && d.kind !== 'object' && d.kind !== 'place' && !w.stele(x, y) && DB[w.raw(x, y)].kind !== 'water' && w.raw(x, y) !== '灘'; };
      if (p.sailing) {           // 船停在最近的淺水上
        const sea = DB[w.get(p.x, p.y)].kind === 'water' && w.get(p.x, p.y) === '水' ? [p.x, p.y] : this.nearestTile(p.x, p.y, (x, y) => w.get(x, y) === '水', 60);
        if (sea) w.set(sea[0], sea[1], '舟');
      }
      if (drop.length) {
        const spot = this.nearestTile(p.x, p.y, landOk, 80) || [this.spawn.x, this.spawn.y];
        w.set(spot[0], spot[1], '包'); w.bags.set(U.key(spot[0], spot[1]), drop);
        p.bag = []; p.tools = []; p.tool = -1; for (const k of SLOT_ORDER) p.worn[k] = null;
      }
      this.paused = true;
      $('dead-text').innerHTML = '第 ' + this.day() + ' 日，你' + ({ '餓': '餓死了', '凍': '凍死了', '傷': '傷重而亡', '毒': '毒發身亡', '累': '力竭而亡' })[cause] + '。<br>荷包落在原地，可以回去取。膽氣歸零。';
      $('dead').classList.remove('hidden');
      this.save();
    }
    respawn() {
      const p = this.player, w = this.world;
      const h = p.home, homeOk = h && w.get(h.x, h.y) === '床';
      const at = homeOk ? this.freeNear(h.x, h.y) : this.spawn;
      p.x = p.rx = at.x; p.y = p.ry = at.y; p.moveT = 0;
      p.hp = 60; p.food = 60; p.warm = 60; p.sta = p.staMax; p.san = Math.max(p.san, 50); p.cour = 0; p.decayAt = 0; p.hitWin = { start: -99, n: 0 };
      p.hurtT = 0; p.dead = false; p.warned = {}; p.poisonT = 0; p.poisonPer = 0; p.biteN = 0; p.insane = false; p.ctrl = true; p.zeroSan = 0; p.sailing = false; p.crossed = false;
      this.action = null;
      w.time = Math.floor(w.time / DAY) * DAY + DAY * 1.03;
      this.ents.list = this.ents.list.filter(e => '虎豹狼蛇蛛魄'.indexOf(e.type) < 0);
      $('dead').classList.add('hidden');
      this.paused = false;
      this.toast('你在一個清晨醒來', homeOk ? '在你的床邊。' : '在最初的地方。');
      this.buildBag();
    }
    nearestTile(x0, y0, ok, maxR) {     // 由近而遠一圈圈找
      for (let r = 0; r <= maxR; r++) for (let i = -r; i <= r; i++) for (const [x, y] of r ? [[x0 + i, y0 - r], [x0 + i, y0 + r], [x0 - r, y0 + i], [x0 + r, y0 + i]] : [[x0, y0]]) if (ok(x, y)) return [x, y];
      return null;
    }
    freeNear(x, y) { for (const [dx, dy] of N8) if (this.world.walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy }; return this.spawn; }

    // ---------- 囊：十六格 ----------
    has(n) { return this.player.bag.some(s => s.n === n); }
    count(n) { let c = 0; for (const s of this.player.bag) if (s.n === n) c += s.c; return c; }
    canAdd(n, c) {
      c = c || 1; const bag = this.player.bag, it = G.item(n);
      if (it && it.dur) return Math.max(0, c - (TOOL_SLOTS - this.player.tools.length)) + bag.length <= SLOTS;
      const day = n === '果' ? this.day() : undefined;
      for (const s of bag) if (s.n === n && s.d === day && s.c < STACK) c -= Math.min(c, STACK - s.c);
      return c <= 0 || bag.length + Math.ceil(c / STACK) <= SLOTS;
    }
    addItem(n, c, extra) {
      const bag = this.player.bag, it = G.item(n);
      if ((it && it.dur) || (extra && extra.dur !== undefined)) {     // 工具與穿過的衣甲各佔一格
        const tools = this.player.tools, isTool = this.isTool(n);
        while (c > 0 && isTool && tools.length < TOOL_SLOTS) { tools.push(Object.assign({ n, c: 1, dur: it.dur }, extra || {})); if (this.player.tool < 0) this.player.tool = tools.length - 1; c--; }
        while (c > 0 && bag.length < SLOTS) { bag.push(Object.assign({ n, c: 1 }, it && it.dur ? { dur: it.dur } : {}, extra || {})); c--; }
        this.barSig = ''; return c;
      }
      const day = n === '果' ? (extra && extra.d !== undefined ? extra.d : this.day()) : undefined;
      for (const s of bag) { if (s.n === n && s.d === day && s.dur === undefined && s.c < STACK) { const k = Math.min(c, STACK - s.c); s.c += k; c -= k; if (!c) break; } }
      while (c > 0 && bag.length < SLOTS) { const k = Math.min(c, STACK); const s = { n, c: k }; if (day !== undefined) s.d = day; bag.push(s); c -= k; }
      this.barSig = '';
      return c;
    }
    removeItem(n, c) {
      const bag = this.player.bag;
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
      if (p.tools.length >= TOOL_SLOTS) { this.message('具欄滿了。'); SFX.fail(); return false; }
      p.bag.splice(i, 1); p.tools.push(s); if (p.tool < 0) p.tool = p.tools.length - 1;
      if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
      this.barSig = ''; this.buildBag(); this.message('「' + s.n + '」移進具欄。'); SFX.write(); return true;
    }
    unequipToBag(i) {
      const p = this.player, s = p.tools[i]; if (!s) return;
      if (p.bag.length >= SLOTS) { this.message('囊已滿。'); SFX.fail(); return; }
      p.tools.splice(i, 1); p.bag.push(s); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1;
      this.barSig = ''; this.buildBag(); this.message('「' + s.n + '」移回囊。'); SFX.write();
    }
    spendSta(n) { const p = this.player; if (p.sta < n) { this.message('力氣不夠，歇一歇。'); SFX.fail(); return false; } p.sta -= n; return true; }

    // ---------- 移動 ----------
    pass(x, y) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (this.player.sailing) return d.kind === 'water' || d.walk > 0;
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
      if (p.sailing && d.kind !== 'water') {        // 靠岸：船留在水上
        if (DB[w.get(p.x, p.y)].kind === 'water') w.set(p.x, p.y, '舟');
        p.sailing = false; this.message('靠岸了。船停在那裡。');
      }
      p.fromX = p.x; p.fromY = p.y; p.x = nx; p.y = ny;
      p.stepDur = (p.sailing ? 0.14 : 0.17 / (d.walk > 0 ? d.walk : 0.6)) * (dx && dy ? 1.3 : 1) / this.ironSpeed();
      p.moveT = p.stepDur;
      return true;
    }
    onArrive() { if (!this.player.sailing) this.world.trample(this.player.x, this.player.y); }
    facing() { return { x: this.player.x + this.player.fx, y: this.player.y + this.player.fy }; }

    // ---------- 取（E） ----------
    pressGather(silent) {
      if (this.action || !this.canAct()) { if (!this.canAct() && !silent) this.message(this.player.ctrl ? '' : '手腳不聽使喚。'); return; }
      const p = this.player, w = this.world, t = this.facing(), e = this.ents.at(t.x, t.y);
      if (e) {
        if (e.type === '龍') { this.message('你的龍。'); return; }
        if (e.type === '魄') { this.message('魄無形，打不著；用光。'); return; }
        if (e.type === '魚') { this.catchFish(e); return; }
        if (e.type === '鳥') { this.message('鳥飛了。'); e.moveT = 0; return; }
        this.attack(e); return;
      }
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
      const to = d.to || '白';
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
      const dmg = Math.round(base * this.dmgMult() * 100) / 100;
      p.atkT = 0.45; p.sta = Math.max(0, p.sta - this.ironDrain());
      e.hp = Math.round((e.hp - dmg) * 100) / 100; e.angry = true; this.wearTool(); SFX.write(); this.renderer.shake = 0.15;
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '−' + dmg, color: G.INK.red, t: 0, dur: 0.7 });
      if (e.hp <= 0) { this.kill(e); return; }
      const left = Math.ceil(e.hp * 10) / 10;
      if (e.type === '鹿') e.moveT = 0;
      else if (e.type === '虎' || e.type === '豹') { e.calm = 2; e.moveT = 0.3; this.message(e.type + '受創而退（還有 ' + left + '）。'); }
      else this.message(e.type + '（還有 ' + left + '）。');
    }
    kill(e) {
      const drops = { '鹿': ['肉', 2], '虎': ['肉', 3], '豹': ['肉', 2], '狼': ['肉', 2], '蛇': ['蛇肉', 1], '蟾': ['蟾蜍', 1] }[e.type];
      const cour = { '鹿': 3, '虎': 15, '豹': 10, '狼': 10, '蛇': 5, '蛛': 5, '蟾': 3 }[e.type] || 2;
      this.ents.remove(e); this.stats.kills++; this.addCourage(cour);
      if (drops) this.addItem(drops[0], drops[1]);
      this.message(({ '鹿': '獵得一鹿，得肉二。', '虎': '虎斃，得肉三。', '豹': '豹斃，得肉二。', '狼': '狼斃，得肉二。', '蛇': '蛇斃，留下屍身。', '蛛': '蜘蛛死了，什麼也沒留下。', '蟾': '蟾蜍死了。' })[e.type] || '斃。');
      if (e.type !== '鹿') SFX.fuse();
    }
    // 獸的撲咬與毒咬（由實體呼叫）
    hit(e, dmg) {
      const p = this.player, d = Math.round(dmg * (this.totemNear(e.x, e.y) ? 5 / 3 : 1) * this.takenMult() * 10) / 10;
      p.hp = Math.max(0, p.hp - d); p.hurtT = 6; this.renderer.shake = 0.5; SFX.tiger(); this.armorHit();
      this.message(e.type + '！命 −' + d + '。');
    }
    bite(e, per) {
      const p = this.player, now = this.world.time, per2 = Math.round(per * (this.totemNear(e.x, e.y) ? 5 / 3 : 1) * this.takenMult() * 10) / 10;
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
      if (!s) { this.message('囊中空空。'); return; }
      if (p.sailing) { this.message('船上做不了這個，先靠岸。'); return; }
      const name = s.n, t = this.facing(), base = w.get(t.x, t.y), bd = DB[base], it = ITEMS[name] || {};
      const fail = () => this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 });
      if (it.slot) { this.wearItem(p.sel); return; }
      if (it.tool && it.dur) { this.equipFromBag(p.sel); return; }
      if (it.tool || it.kind === 'wear') { this.message('「' + name + '」' + (it.light ? '拿在手上就亮。' : '在囊中即生效。')); return; }
      if (base === '灶') {
        const ck = G.COOK[name];
        if (ck) {
          const need = ck.n || 1;
          if (!w.stoveLit(t.x, t.y)) { this.message('灶是冷的，先放些木柴。'); fail(); return; }
          if (this.count(name) < need) { this.message('要 ' + need + ' 個' + name + '才夠。'); fail(); return; }
          for (const m in ck.extra || {}) if (this.count(m) < ck.extra[m]) { this.message('還要 ' + m + ' ×' + ck.extra[m] + '。'); fail(); return; }
          this.removeItem(name, need); for (const m in ck.extra || {}) this.removeItem(m, ck.extra[m]); this.addItem(ck.out, ck.k || 1);
          this.message((ck.verb || (ck.out === '玻璃瓶' ? '燒成了' : ck.out === '淡水瓶' ? '蒸餾成了' : '烤好了')) + '：' + ck.out + (ck.k > 1 ? ' ×' + ck.k : '')); SFX.fuse();
          this.fx.push({ type: 'float', x: t.x, y: t.y, text: ck.out, color: G.INK.red, t: 0, dur: 1 });
          return;
        }
        if (FUEL[name]) { w.addFuel(t.x, t.y, FUEL[name]); this.removeItem(name, 1); this.message('添煤。灶火還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); return; }
        if (DB[name] && DB[name].flam > 0) { w.addFuel(t.x, t.y, DB[name].s * 15); this.removeItem(name, 1); this.message('添柴。灶火還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); return; }
        this.message('灶上放不下「' + name + '」。'); fail(); return;
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
      if (!DB[tileName] || !DB[tileName].place) { this.message('「' + name + '」放不到地上。'); fail(); return; }
      if (DB[tileName].onWater) { if (base !== '水') { this.message('「' + name + '」要放在淺水上。'); fail(); return; } }
      else {
        if (!(bd.kind === 'ground' || bd.kind === 'blank')) { this.message('這裡放不下，先把地上的東西取走。'); fail(); return; }
        if (this.ents.beastAt(t.x, t.y)) { this.message('有東西擋著。'); fail(); return; }
      }
      w.set(t.x, t.y, tileName); this.removeItem(name, 1);
      if (tileName === '床') { p.home = { x: t.x, y: t.y }; this.toast('床放好了', '夜裡面向它按 R，一覺到天明。'); this.save(); }
      else if (tileName === '偶') { w.addScarecrow(t.x, t.y); this.toast('稻草人立起來了', '三十天內獸不近身：前半十格、後半七格。'); }
      else if (tileName === '櫃') { w.chests.set(U.key(t.x, t.y), []); this.message('櫃放好了。面向它按 E 開。'); }
      else if (tileName === '舟') { this.toast('大船下水了', '面向它按 E 上船。深水亦可渡，開到海的盡頭便渡海而去。'); }
      else this.message('放下「' + name + '」。');
      SFX.write();
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: tileName, color: DB[tileName].ink, t: 0, dur: 0.35 });
    }

    // ---------- 吃（V） ----------
    useItem() {
      const p = this.player, s = this.held(); if (!s || !this.canAct()) return;
      const it = G.item(s.n), f = it.food, tl = ITEMS[s.n] || {};
      if (tl.slot) { this.wearItem(p.sel); return; }
      if (s.n === '海水瓶') { this.message('海水鹹，喝不得。放在旺的灶上蒸餾。'); return; }
      if (!f) { this.message(tl.tool && tl.dur ? '「' + s.n + '」是工具，按 F 移進具欄。' : tl.tool || tl.kind === 'wear' ? '「' + s.n + '」在囊中即生效。' : '「' + s.n + '」不能吃，按 F 放到地上。'); return; }
      this.removeItem(s.n, 1);
      if (f.bottle) this.addItem('玻璃瓶', 1);
      if (f.knock) { this.knockOut(f); return; }
      const parts = [];
      if (f.eat) { p.food = Math.min(100, p.food + f.eat); parts.push('飽 +' + f.eat); }
      if (f.hurt) { p.hp = Math.max(1, p.hp - f.hurt); p.hurtT = 3; parts.push('生冷傷身 −' + f.hurt); }
      if (f.heal) { p.hp = Math.min(100, p.hp + f.heal); parts.push('命 +' + f.heal); }
      if (f.cure && p.poisonT > 0) { p.poisonT = 0; p.poisonPer = 0; parts.push('毒解了'); }
      if (f.san) { p.san = Math.min(100, p.san + f.san); parts.push('愜意 +' + f.san); }
      if (f.poison) { this.poison(f.poison[0], f.poison[1]); parts.push('中毒'); }
      SFX.absorb();
      this.message('吃了「' + s.n + '」，' + parts.join('，') + '。');
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
    buildCraft() {
      const p = this.player, list = $('craft-list'); list.innerHTML = '';
      $('craft-sta').textContent = Math.floor(p.sta) + '/' + p.staMax + ' · 膽氣第 ' + this.level() + ' 重';
      G.RECIPES.forEach((r, i) => {
        const locked = r.level && this.level() < r.level;
        const row = document.createElement('div'); row.className = 'recipe' + (this.canCraft(r) && p.sta >= r.sta && !locked ? '' : ' cant');
        const needs = Object.keys(r.need).map(n => '<span class="' + (this.count(n) >= r.need[n] ? 'ok' : 'lack') + '">' + n + ' ' + this.count(n) + '/' + r.need[n] + '</span>').join(' ');
        const title = r.out ? r.out + (r.n > 1 ? ' ×' + r.n : '') : (r.regrind ? '重磨' : '磨礪');
        let btns = '';
        if (r.choose) btns = r.choose.map(c => '<button data-r="' + r.id + '" data-c="' + c + '">' + c + '</button>').join('');
        else btns = '<button data-r="' + r.id + '">' + (r.regrind ? '磨' : '造') + '</button>';
        row.innerHTML = '<span class="num">' + (i + 1) + '</span><b>' + title + '</b><span class="needs">' + needs + '</span><span class="sta">力 ' + r.sta + (locked ? '<br><i>需' + r.level + '重</i>' : '') + '</span><span class="note">' + r.note + '</span><span class="btns">' + btns + '</span>';
        list.appendChild(row);
      });
      list.querySelectorAll('button').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); this.craft(b.dataset.r, b.dataset.c); }));
    }
    craft(id, choice) {
      const p = this.player, r = G.RECIPES.find(x => x.id === id); if (!r || !this.canAct()) return;
      if (r.level && this.level() < r.level) { this.message('膽氣不夠：要第 ' + r.level + ' 重。'); SFX.fail(); return; }
      if (!this.canCraft(r)) { this.message('材料不夠。'); SFX.fail(); return; }
      if (p.sta < r.sta) { this.message('力氣不夠，歇一歇。'); SFX.fail(); return; }
      let out = r.out, n = r.n || 1;
      if (r.choose) { if (!choice) { this.message('選一個方向：刀、鎬、鋤、劍、斧。'); return; } out = choice; }
      if (r.regrind) {
        const s = this.activeTool(); if (!s) { this.message('具欄裡要選中一把工具（P 換）。'); SFX.fail(); return; }
        for (const m in r.need) this.removeItem(m, r.need[m]);
        p.sta -= r.sta; s.dur = ITEMS[s.n].dur; this.barSig = ''; this.afterCraft(r); this.message('「' + s.n + '」磨利了。'); SFX.fuse(); this.buildCraft(); this.buildBag(); return;
      }
      if (!this.canAdd(out, n)) { this.message('囊已滿。'); SFX.fail(); return; }
      for (const m in r.need) this.removeItem(m, r.need[m]);
      p.sta -= r.sta; this.addItem(out, n); this.afterCraft(r);
      this.toast('造了「' + out + '」' + (n > 1 ? ' ×' + n : ''), G.item(out).flavor); SFX.fuse();
      this.buildCraft(); this.buildBag();
    }
    afterCraft(r) { const p = this.player; p.san = Math.min(100, p.san + 8 * this.mult()); this.addCourage(r.sta); this.stats.crafted++; }

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
      p.warm = 100; p.sta = p.staMax; p.food = Math.max(0, p.food - 12); p.san = Math.min(100, p.san + 20); p.hp = Math.min(100, p.hp + 10);
      this.ents.list = this.ents.list.filter(e => '虎豹狼蛇蛛魄'.indexOf(e.type) < 0);
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
    takeChest() {        // 櫃空了才拆得下來，拆回不長膽氣
      const k = this.chestAt; if (!k) return;
      const box = this.world.chests.get(k) || [];
      if (box.length) { this.message('櫃裡還有東西，先搬空。'); SFX.fail(); return; }
      if (!this.canAdd('櫃', 1)) { this.message('囊已滿。'); SFX.fail(); return; }
      const [x, y] = U.unkey(k);
      this.world.set(x, y, '白'); this.addItem('櫃', 1); this.closeChest(); this.buildBag(); this.message('拆下了櫃。'); SFX.absorb();
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
      const bg = $('chest-bag'); bg.innerHTML = ''; for (let i = 0; i < SLOTS; i++) bg.appendChild(mk(p.bag[i], i, 'bag'));
    }
    moveStack(from, i) {
      const box = this.world.chests.get(this.chestAt), p = this.player;
      if (!box) return;
      if (from === 'chest') {
        const s = box[i]; if (!s) return;
        const left = this.addItem(s.n, s.c, { dur: s.dur, d: s.d, wm: s.wm });
        if (left > 0) { s.c = left; this.message('囊裡放不下這麼多。'); } else box.splice(i, 1);
      } else {
        const s = p.bag[i]; if (!s) return;
        if (box.length >= CHEST_SLOTS) { this.message('櫃滿了。'); return; }
        box.push(s); p.bag.splice(i, 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); this.barSig = '';
      }
      SFX.write(); this.buildChest(); this.buildBag();
    }

    // ---------- 船 ----------
    board(t) {
      const p = this.player, w = this.world;
      const b = w.base(t.x, t.y);                 // 船開走了，水面還原
      w.set(t.x, t.y, DB[b] && DB[b].kind === 'water' ? b : '水');
      p.fromX = p.x; p.fromY = p.y; p.x = t.x; p.y = t.y; p.moveT = 0.2; p.stepDur = 0.2; p.sailing = true;
      this.toast('上船了', '深水亦可渡。開到海的盡頭便渡海而去；撞上岸就靠岸。');
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
      if (pl.effect === 'well' && pl.drank !== this.day()) { pl.drank = this.day(); p.hp = Math.min(100, p.hp + 15); this.message('井水清冽，命 +15。'); }
      if (pl.effect === 'raft' && !p.raftTaken) { if (this.addItem('竹筏', 1) === 0) { p.raftTaken = true; this.toast('船裡有一隻竹筏', '囊中有筏，可行於淺水。'); } else this.message('囊滿了，筏子先留在船裡。'); }
      if (pl.effect === 'dragon' && !p.dragon && !this.ents.list.some(e => e.type === '龍')) {
        const at = this.freeNear(p.x, p.y); this.ents.add('龍', at.x, at.y); p.dragon = true; this.toast('黑處有龍', '牠跟你走了。夜能照路，獸與魄不敢近。');
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
      for (const s of items) { const r = this.addItem(s.n, s.c, { dur: s.dur, d: s.d, wm: s.wm }); if (r > 0) left.push({ n: s.n, c: r, dur: s.dur, d: s.d, wm: s.wm }); }
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
      h += '<h3>日子</h3><p>第 ' + this.day() + ' 日 · 膽氣第 ' + this.level() + ' 重（' + Math.floor(p.cour) + '，下一重 ' + this.levelAt(this.level() + 1) + '） · 睡過 ' + this.stats.nights + ' 夜 · 走過 ' + w.seenCount() + ' 格 · 取了 ' + this.stats.gathered + ' 次 · 造了 ' + this.stats.crafted + ' 件 · 斃 ' + this.stats.kills + ' · 被咬 ' + this.stats.bites + ' 口 · 死過 ' + p.deaths + ' 次</p>';
      $('journal-body').innerHTML = h;
    }

    // ---------- 輸入 ----------
    bindInput() {
      window.addEventListener('keydown', (ev) => {
        if (ev.repeat && !DIRS[ev.code]) return;
        if (!$('start').classList.contains('hidden')) { if (ev.code === 'Enter') { ev.preventDefault(); $('btn-continue').classList.contains('hidden') ? $('btn-new').click() : $('btn-continue').click(); } return; }
        if (this.player.dead) { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); this.respawn(); } return; }
        if (!$('voyage').classList.contains('hidden')) return;
        if (this.userPaused) { if (ev.code === 'Escape') { this.togglePause(); ev.preventDefault(); } return; }
        if (this.player.knock > 0) { ev.preventDefault(); return; }
        if (!$('read').classList.contains('hidden')) { if (['KeyE', 'Enter', 'Space', 'Escape'].indexOf(ev.code) >= 0) { this.closeRead(); ev.preventDefault(); } return; }
        if (this.chestAt) { if (['KeyE', 'Escape'].indexOf(ev.code) >= 0) { this.closeChest(); ev.preventDefault(); } return; }
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
          if (/^Digit[1-9]$/.test(ev.code)) { const r = G.RECIPES[+ev.code[5] - 1]; if (r && !r.choose) this.craft(r.id); ev.preventDefault(); }
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
      $('chest-take').addEventListener('click', () => this.takeChest());
      $('btn-pause').addEventListener('click', () => this.togglePause());
      $('pause-resume').addEventListener('click', () => this.togglePause());
      $('btn-map').addEventListener('click', () => { if (this.userPaused || this.player.dead || this.player.knock > 0) return; $('journal').classList.add('hidden'); $('craft').classList.add('hidden'); this.toggleMap(); });
      $('minimap').addEventListener('click', () => $('btn-map').click());
      $('voyage-back').addEventListener('click', () => { $('voyage').classList.add('hidden'); this.paused = false; this.message('回頭。再開出去就走了。'); });
      $('voyage-new').addEventListener('click', () => { try { localStorage.setItem(CARRY_KEY, String(this.player.cour)); } catch (e) { /* ignore */ } Game.clearSave(); location.reload(); });
    }
    cycle(d) { const p = this.player; if (p.bag.length) p.sel = (p.sel + d + p.bag.length) % p.bag.length; this.buildBag(); }
    togglePause() {
      if (this.player.dead || !$('start').classList.contains('hidden') || !$('voyage').classList.contains('hidden')) return;
      this.userPaused = !this.userPaused; this.paused = this.userPaused;
      $('pause').classList.toggle('hidden', !this.userPaused); this.keys.clear(); this.action = null;
    }

    // ---------- HUD ----------
    buildBag() {
      const p = this.player, bar = $('bagbar');
      const sig = p.bag.map(s => s.n + s.c + (s.dur !== undefined ? 'd' + s.dur : '') + (s.d !== undefined ? '@' + s.d : '')).join(',') + '|' + p.sel + '|' + this.day() + '|' + p.tools.map(s => s.n + s.dur).join(',') + '|' + p.tool
        + '|' + SLOT_ORDER.map(k => p.worn[k] ? p.worn[k].n + this.effDays(p.worn[k]) : '').join(',') + '|' + (this.totemOn() ? 1 : 0) + '|' + this.ironCount();
      if (sig === this.barSig) return;
      this.barSig = sig; bar.innerHTML = '';
      for (let i = 0; i < SLOTS; i++) {
        const s = p.bag[i], el = document.createElement('div');
        el.className = 'slot bag' + (s ? '' : ' empty') + (s && i === p.sel ? ' sel' : '');
        if (s) {
          const it = G.item(s.n);
          let sub = '×' + s.c;
          if (s.dur !== undefined) sub = this.durText(s);
          else if (s.d !== undefined) { const age = this.day() - s.d; sub = '×' + s.c + (age >= FERMENT_NIGHTS - 3 ? ' 將醉' : age >= 1 ? ' ' + age + '夜' : ''); }
          el.innerHTML = '<span class="num">' + (i < 9 ? i + 1 : '') + '</span><span class="ch' + (s.n.length > 1 ? ' word' : '') + '">' + s.n + '</span><span class="cost">' + sub + '</span>';
          if (s.dur !== undefined) el.innerHTML += '<i class="dur" style="width:' + Math.round(100 * s.dur / (it.dur || ARMOR_LIFE)) + '%"></i>';
          el.title = it.flavor;
        }
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (this.isTool(s.n) && this.equipFromBag(i)) return; p.sel = i; this.buildBag(); });
        bar.appendChild(el);
      }
      const tb = $('toolbar'); tb.innerHTML = '';
      for (let i = 0; i < TOOL_SLOTS; i++) {
        const s = p.tools[i], el = document.createElement('div');
        el.className = 'slot bag tool' + (s ? '' : ' empty') + (s && i === p.tool ? ' sel' : '');
        if (s) {
          const it = ITEMS[s.n];
          el.innerHTML = '<span class="ch' + (s.n.length > 1 ? ' word' : '') + '">' + s.n + '</span><span class="cost">耐 ' + s.dur + '</span><i class="dur" style="width:' + Math.round(100 * s.dur / it.dur) + '%"></i>';
          el.title = it.flavor + '（點一下手持，再點一下空手；右鍵移回囊）';
        } else el.title = '具欄：工具放這裡，P 換手持';
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (ev.button === 2) { this.unequipToBag(i); return; } p.tool = (p.tool === i) ? -1 : i; this.buildBag(); });
        el.addEventListener('contextmenu', (ev) => ev.preventDefault());
        tb.appendChild(el);
      }
      // 身上：上排襯褲甲，下排盔靴；下面四行是現在的數
      [['襯', '褲', '甲'], ['盔', '靴']].forEach((keys, ri) => {
        const row = $('worn' + (ri + 1)); row.innerHTML = '';
        for (const k of keys) {
          const s = p.worn[k], el = document.createElement('div');
          el.className = 'slot bag worn' + (s ? '' : ' empty');
          if (s) { const rate = Math.round(this.wearRate(s) * 100) / 100; el.innerHTML = '<span class="ch word">' + s.n + '</span><span class="cost">' + this.effDays(s) + '日</span><i class="dur" style="width:' + Math.round(100 * s.dur / ARMOR_LIFE) + '%"></i>'; el.title = ITEMS[s.n].flavor + '（照目前損耗速度 ×' + rate + ' 還能穿 ' + this.effDays(s) + ' 日；點一下脫下）'; }
          else { el.innerHTML = '<span class="ch">' + k + '</span>'; el.title = '身上：' + k + '。囊裡選中衣甲按 F 穿上。'; }
          el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (s) this.takeOff(k); });
          row.appendChild(el);
        }
      });
      const on = this.totemOn();
      $('wornstats').innerHTML = (on ? '<div class="totem">山海衣 · 獸紋已顯</div>' : '')
        + '<div><span>傷害獲取</span><b>' + Math.round(this.takenMult() * 100) + '%</b></div>'
        + '<div><span>移動速度</span><b>' + Math.round(this.ironSpeed() * 100) + '%</b></div>'
        + '<div><span>傷害輸出</span><b>' + Math.round(this.dmgMult() * 100) + '%</b></div>'
        + '<div><span>現今蟲獸傷害輸出</span><b>' + (on ? 167 : 100) + '%</b></div>';
    }
    updateHUD() {
      const p = this.player, w = this.world, t = this.facing();
      // 身上的四個數會隨膽氣、衣甲變，變了就重畫囊與身上
      const ws = (this.totemOn() ? 1 : 0) + '|' + Math.round(this.takenMult() * 1000) + '|' + Math.round(this.dmgMult() * 1000) + '|' + Math.round(this.ironSpeed() * 1000) + '|' + this.wornList().map(s => this.effDays(s)).join(',');
      if (ws !== this.wornSig) { this.wornSig = ws; this.barSig = ''; }
      if (this.barSig === '') this.buildBag();
      const sig = [Math.round(p.hp), Math.round(p.food), Math.round(p.warm), Math.round(p.sta), p.staMax, Math.round(p.san), this.shichen(), p.x, p.y, w.get(p.x, p.y), this.daylight() > 0.5, this.day(), w.tideName(), p.sailing].join('|');
      if (sig !== this.hudSig) {
        this.hudSig = sig;
        const fill = (id, v) => $(id).style.setProperty('--p', U.clamp(v, 0, 1).toFixed(3));
        fill('hpfill', p.hp / 100); fill('foodfill', p.food / 100); fill('warmfill', p.warm / 100); fill('stafill', p.sta / p.staMax); fill('sanfill', p.san / 100);
        $('hpfill').parentNode.classList.toggle('low', p.hp < 30); $('foodfill').parentNode.classList.toggle('low', p.food < 25); $('warmfill').parentNode.classList.toggle('low', p.warm < 30); $('stafill').parentNode.classList.toggle('low', p.sta < 15); $('sanfill').parentNode.classList.toggle('low', p.san < 20);
        $('hplabel').innerHTML = '命<br>' + Math.round(p.hp); $('foodlabel').innerHTML = '飽<br>' + Math.round(p.food); $('warmlabel').innerHTML = '暖<br>' + Math.round(p.warm); $('stalabel').innerHTML = '力<br>' + Math.round(p.sta); $('sanlabel').innerHTML = '愜<br>' + Math.round(p.san);
        const nn = this.nightNo();
        $('status').innerHTML = '<b>第 ' + this.day() + ' 日</b> &nbsp;' + this.shichen() + ' ' + (this.daylight() > 0.5 ? '日' : '月') + (this.isNight() ? '<span class="dim">（第 ' + nn + ' 夜' + (nn >= GHOST_NIGHT ? '，魄夜' : '') + '）</span>' : '') + ' &nbsp;·&nbsp; ' + w.tideName() + ' &nbsp;·&nbsp; ' + (p.sailing ? '船上' : G.biomeName(w.get(p.x, p.y))) + ' &nbsp;·&nbsp; <span class="dim">(' + p.x + ', ' + p.y + ')</span>';
      }
      const lv = this.level(), daysLeft = p.decayAt ? Math.max(1, Math.ceil((p.decayAt - w.time) / DAY)) : 0;
      const cs = p.cour + '|' + lv + '|' + daysLeft;
      if (cs !== this.courSig) {
        this.courSig = cs;
        $('mapwrap').style.setProperty('--cour', Math.round(100 * this.levelFrac()) + '%');
        $('courlabel').textContent = (lv === 0 ? '膽氣 · 初' : '膽氣 · 第 ' + lv + ' 重') + (this.totemOn() ? ' · 山海衣' : '');
        const dec = $('courdecay');
        if (lv > DECAY_LEVEL && daysLeft) { dec.classList.remove('hidden'); dec.textContent = '卅一重以上三日一減 · 還有 ' + daysLeft + ' 日'; }
        else dec.classList.add('hidden');
      }
      let s;
      const ch = w.get(t.x, t.y), d = DB[ch], e = this.ents.at(t.x, t.y), plc = w.placeAt(t.x, t.y), hs = this.held();
      if (p.knock > 0) s = '昏迷中……';
      else if (p.insane && !p.ctrl) s = '<i>手腳不聽使喚……</i>';
      else if (p.sailing) s = '船上 · 撞岸即靠岸' + (e && e.type === '魚' ? ' · <kbd>E</kbd> 捉魚' : '');
      else if (plc) s = '「' + plc.name + '」 · <kbd>E</kbd> 讀' + (hs && hs.n === '玻璃瓶' && (ch === '泉' || ch === '井') ? '　<kbd>E</kbd> 取淡水' : '');
      else if (e && e.type === '龍') s = '你的龍。';
      else if (e && e.type === '魄') s = '魄 · 無形。手裡有光六格內即煙滅';
      else if (e) s = '「' + e.type + '」' + (e.type === '蟾' ? (e.venom ? '（有毒）' : '（無毒）') : '') + (e.hp > 1 ? '（' + e.hp + '）' : '') + ' · <kbd>E</kbd> ' + (e.type === '魚' ? '捉' : e.type === '鳥' ? '驚' : this.heldDmg() ? '攻擊（' + this.activeTool().n + '）' : '<i>徒手打不了，具欄裡選把刀劍</i>');
      else if (ch === '碑') s = '一塊古碑 · <kbd>E</kbd> 讀碑';
      else if (ch === '包') s = '落下的荷包 · <kbd>E</kbd> 取回';
      else if (ch === '漁') s = '魚梁 · <kbd>E</kbd> 取魚' + (w.time < (w.weirs.get(U.key(t.x, t.y)) || 0) ? '（魚還沒來）' : '');
      else if (ch === '門') s = '門 · <kbd>E</kbd> 問路';
      else if (ch === '櫃') s = '櫃 · <kbd>E</kbd> 開';
      else if (ch === '舟') s = '大船 · <kbd>E</kbd> 上船';
      else if (ch === '偶') { const days = w.scareDays(t.x, t.y); s = '稻草人 · 還能守 ' + Math.ceil(days) + ' 天' + (hs && hs.n === '偶' ? ' · <kbd>F</kbd> 續' : '') + ' · <kbd>E</kbd> 拆下（重放重計）'; }
      else {
        s = '面前：' + (ch === '白' ? '白紙' : '<b>' + ch + '</b>') + (w.isBurning(t.x, t.y) ? ' <i class="fire">燃燒中</i>' : '') + (ch === '灶' ? (w.stoveLit(t.x, t.y) ? ' <i class="fire">火旺</i>' : ' <i>冷灶</i>') : '');
        const tool = this.heldTool();
        if (hs && hs.n === '玻璃瓶' && d.kind === 'water') s += ' · <kbd>E</kbd> 取海水';
        else if (tool === '鋤' && (ch === '土' || ch === '草')) s += ' · <kbd>E</kbd> 鋤成田';
        else if (d.yield) {
          const need = d.need && tool !== d.need;
          s += ' · <kbd>E</kbd> ' + (need ? '<i>要用' + G.TOOL_NAMES[d.need] + '</i>' : '取 ' + Object.keys(d.yield).map(n => n + (d.yield[n] > 1 ? '×' + d.yield[n] : '')).join(' ') + (d.fast ? (tool === d.fast ? '（' + d.fast + '，快）' : '（' + d.fast + '更快）') : ''));
        }
        if (hs) {
          const it = G.item(hs.n), tl = ITEMS[hs.n] || {};
          if (tl.slot) s += ' · <kbd>F</kbd> 穿上';
          else if (tl.tool && tl.dur) s += ' · <kbd>F</kbd> 移進具欄';
          else if (ch === '灶') { const ck = G.COOK[hs.n]; s += ck ? ' · <kbd>F</kbd> ' + (ck.out === '玻璃瓶' ? '燒瓶（沙三）' : ck.out === '淡水瓶' ? '蒸餾' : ck.out === '鐵' ? '煉鐵（礦二煤一）' : '烤') : (FUEL[hs.n] ? ' · <kbd>F</kbd> 添煤' : DB[hs.n] && DB[hs.n].flam > 0 ? ' · <kbd>F</kbd> 添柴' : ''); }
          else if ((DB[tl.tile || hs.n] || {}).place) s += ' · <kbd>F</kbd> 放「' + hs.n + '」';
          if (it.food) s += ' · <kbd>V</kbd> ' + (hs.n.indexOf('瓶') >= 0 || hs.n === '果酒' ? '喝' : '吃');
        }
        if (this.bedNear()) s += ' · <kbd>R</kbd> 睡';
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
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 5, seed: this.seed, savedAt: Date.now(), world: this.world.serialize(), ents: this.ents.serialize(),
          player: { x: p.x, y: p.y, fx: p.fx, fy: p.fy, hp: p.hp, food: p.food, warm: p.warm, sta: p.sta, staMax: p.staMax, san: p.san, cour: p.cour, bag: p.bag, sel: p.sel, home: p.home, readSteles: p.readSteles,
            places: p.places, creatures: p.creatures, raftTaken: p.raftTaken, dragon: p.dragon, finished: p.finished, deaths: p.deaths, burn: p.burn, lastDay: p.lastDay, poisonT: p.poisonT, poisonPer: p.poisonPer, sailing: p.sailing, tools: p.tools, tool: p.tool, decayAt: p.decayAt, worn: p.worn, hitWin: p.hitWin }, stats: this.stats }));
      } catch (err) { /* 隱私模式等情況下存不了，就算了 */ }
    }
    load(s) {
      const p = this.player;
      this.world.restore(s.world || {});
      this.ents.restore(s.ents);
      const sp = s.player || {};
      for (const k of ['x', 'y', 'fx', 'fy', 'hp', 'food', 'warm', 'sta', 'staMax', 'san', 'cour', 'bag', 'sel', 'home', 'readSteles', 'places', 'creatures', 'raftTaken', 'dragon', 'finished', 'deaths', 'burn', 'lastDay', 'poisonT', 'poisonPer', 'sailing', 'tools', 'tool', 'decayAt', 'worn', 'hitWin']) if (sp[k] !== undefined) p[k] = sp[k];
      // 舊存檔裡已經不存在的東西丟掉，身上的衣甲要對得上格子
      const known = (s) => !!(s && G.item(s.n));
      p.bag = (p.bag || []).filter(known); p.tools = (p.tools || []).filter(known);
      if (p.tool >= p.tools.length) p.tool = p.tools.length - 1;
      const worn = {}; for (const k of SLOT_ORDER) { const s = p.worn && p.worn[k]; worn[k] = known(s) && ITEMS[s.n].slot === k ? s : null; } p.worn = worn;
      if (!p.hitWin || typeof p.hitWin.n !== 'number') p.hitWin = { start: -99, n: 0 };
      p.rx = p.x; p.ry = p.y; p.moveT = 0;
      Object.assign(this.stats, s.stats || {});
    }
    static readSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 5 ? s : null; } catch (e) { return null; } }
    static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
  }

  // ---------- 啟動畫面 ----------
  function boot() {
    const q = new URLSearchParams(location.search);
    const save = Game.readSave();
    let game = null;
    const start = (seed, useSave) => {
      if (game) return;
      SFX.init();
      game = new Game(seed, useSave ? save : null);
      window.XIEYI = { game, Game, DAY };
      $('start').classList.add('hidden');
      game.paused = false;
      game.toast('寫意', '取木、取棉、取石子；砌磚、造床、磨劍。第十三夜起有魄，備好火把。按 H 看法子。', 7000);
      setTimeout(() => { if (game) game.toast('聽說島上有一座塔', '從塔上能看見整張紙。黃昏時跟著鳥走。', 8000); }, 5000);
      window.addEventListener('beforeunload', () => game.save());
      document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
    };
    const seedInput = $('seed');
    seedInput.value = q.get('seed') || String(Math.floor(Math.random() * 1e6));
    if (save) { $('btn-continue').classList.remove('hidden'); $('save-info').textContent = '上次的島 #' + save.seed + '，第 ' + (Math.floor((save.world.time || 0) / DAY) + 1) + ' 日'; }
    $('btn-continue').addEventListener('click', () => start(save.seed, true));
    $('btn-new').addEventListener('click', () => { Game.clearSave(); let s = parseInt(seedInput.value, 10); if (isNaN(s)) s = Array.from(seedInput.value).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7); start(s, false); });
    $('btn-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
    $('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
    if (q.get('autostart')) { Game.clearSave(); start(parseInt(q.get('seed') || '42', 10), false); }
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
