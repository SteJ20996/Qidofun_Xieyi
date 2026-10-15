// game.js —— 主迴圈、輸入、取／攻擊／放／製作／吃／睡、命飽暖力、鬼夜、死亡與復活、見聞錄、HUD、存檔
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB, ITEMS = G.ITEMS;
  const SAVE_KEY = 'xieyi.save.v4';
  const DAY = 240;                                  // 一晝夜 = 240 秒
  const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';
  const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const SLOTS = 12, STACK = 64, GHOST_NIGHT = 10, FERMENT_NIGHTS = 15;
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
        hp: 100, food: 100, warm: 100, sta: 100, staMax: 100, hurtT: 0, atkT: 0, bag: [], sel: 0, home: null, readSteles: [],
        places: {}, creatures: [], raftTaken: false, dragon: false, finished: false, deaths: 0, dead: false, warned: {}, torchT: 0, hangDay: 0, lastDay: 1 };
      this.stats = { gathered: 0, crafted: 0, kills: 0, read: 0, nights: 0 };
      this.keys = new Set();
      this.action = null;      // 進行中的動作（取）
      this.fx = [];
      this.paused = true;
      this.saveAcc = 0;
      this.last = 0;
      this.msgText = ''; this.hudSig = ''; this.barSig = '';
      this.spawn = this.world.findSpawn();
      if (save) this.load(save);
      else { this.player.x = this.player.rx = this.spawn.x; this.player.y = this.player.ry = this.spawn.y; }
      this.bindInput();
      this.buildBag();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------- 晝夜、潮汐、鬼夜 ----------
    dayT() { return (this.world.time % DAY) / DAY; }              // 0 日出, 0.25 正午, 0.5 日落, 0.75 子夜
    day() { return Math.floor(this.world.time / DAY) + 1; }
    nightNo() { return this.dayT() > 0.5 ? this.day() : this.day() - 1; }   // 這是第幾夜（日落後算當天的夜）
    daylight() { const t = this.dayT(); return U.smoothstep(-0.04, 0.08, t) * (1 - U.smoothstep(0.46, 0.58, t)); }
    darkness() { return 1 - this.daylight(); }
    isNight() { const t = this.dayT(); return t > 0.5 || t < 0.06; }
    ghostNight() { return this.darkness() > 0.5 && this.nightNo() >= GHOST_NIGHT; }
    ghostCap() { return Math.min(6, 2 + Math.floor((this.nightNo() - GHOST_NIGHT) / 2)); }
    shichen() { const hour = (6 + this.dayT() * 24) % 24; return SHICHEN[Math.floor(((hour + 1) % 24) / 2)] + '時'; }
    torchLit() { return this.darkness() > 0.5 && this.has('火把'); }
    playerLight() { return 4.5 - 1.5 * this.darkness() + (this.torchLit() ? 3 : 0); }

    // ---------- 主迴圈 ----------
    frame(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000 || 0.016); this.last = ts;
      if (!this.paused) this.update(dt);
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
    // 新的一天：果子發酵、宿醉過去、鬼夜預告
    newDay() {
      const p = this.player; p.lastDay = this.day();
      let fermented = 0;
      for (let i = p.bag.length - 1; i >= 0; i--) {
        const s = p.bag[i];
        if (s.n === '果' && s.d !== undefined && p.lastDay - s.d >= FERMENT_NIGHTS) { fermented += s.c; p.bag.splice(i, 1); }
      }
      if (fermented) { this.addItem('醉果', fermented); this.toast('果子醉了', '放過十五夜的果變成了醉果。吃了昏睡到天明，醒來傷身。'); }
      this.buildBag();
    }

    // ---------- 生存數值：命、飽、暖、力 ----------
    updateStats(dt) {
      const p = this.player, w = this.world, dark = this.darkness();
      const tile = w.get(p.x, p.y), td = DB[tile];
      p.food = Math.max(0, p.food - dt * 0.14);                 // 約 12 分鐘餓空
      let dw;
      if (td.shelter) dw = 5;
      else if (w.heatNear(p.x, p.y, 2)) dw = 4;
      else {
        dw = dark > 0.5 ? -0.7 : 1.5;
        if (tile === '雪') dw -= 1.2;
        if (td.kind === 'water') dw -= 1.0;
        if (dw < 0) { if (this.has('衣')) dw *= 0.5; if (this.torchLit()) dw *= 0.4; }
      }
      p.warm = U.clamp(p.warm + dw * dt, 0, 100);
      if (w.nearChar(p.x, p.y, '泉', 1)) { p.hp = Math.min(100, p.hp + 2 * dt); p.warm = Math.min(100, p.warm + 1.5 * dt); }   // 泉邊療傷
      if (this.torchLit()) { p.torchT += dt; if (p.torchT >= ITEMS['火把'].life) { p.torchT = 0; this.removeItem('火把', 1); this.message('一支火把燃盡了。'); } }
      // 力氣：歇著回得快
      const idle = p.moveT <= 0 && !this.action && this.keys.size === 0;
      p.sta = Math.min(p.staMax, p.sta + (idle ? 2.0 : 0.7) * dt);
      p.hurtT = Math.max(0, p.hurtT - dt); p.atkT = Math.max(0, p.atkT - dt);
      let dh = 0;
      if (p.food <= 0) dh -= 2;
      if (p.warm <= 0) dh -= 3;
      if (dh === 0 && p.hurtT <= 0 && p.food > 40 && p.warm > 30 && p.hangDay !== this.day()) dh = 0.3;   // 血慢慢回；宿醉那天不回
      p.hp = U.clamp(p.hp + dh * dt, 0, 100);
      // 提醒
      if (p.food < 25 && !p.warned.food) { p.warned.food = true; this.toast('你餓了', '摘野果、捉魚、獵鹿。生食傷身，灶上烤之。'); }
      if (p.food >= 40) p.warned.food = false;
      if (p.warm < 30 && !p.warned.warm) { p.warned.warm = true; this.toast('你冷了', '六石成灶，添木取暖；棉可為衣。'); }
      if (p.warm >= 50) p.warned.warm = false;
      const nn = this.nightNo();
      if (nn === GHOST_NIGHT - 1 && dark > 0.5 && !p.warned.eve) { p.warned.eve = true; this.toast('第九夜', '明晚起，鬼夜行。砌磚、造門、磨劍。', 8000); }
      if (this.ghostNight() && !p.warned['g' + nn]) { p.warned['g' + nn] = true; this.toast('第 ' + nn + ' 夜', '鬼來了。不畏火光，畏劍；磚與門擋得住，日出則散。', 8000); }
      if (p.hp <= 0) this.die(p.food <= 0 ? '餓' : p.warm <= 0 ? '凍' : '傷');
    }
    die(cause) {
      const p = this.player, w = this.world;
      p.dead = true; p.deaths++;
      if (p.bag.length) {
        let spot = null;
        for (const [dx, dy] of [[0, 0]].concat(N8)) {
          const x = p.x + dx, y = p.y + dy, d = w.info(x, y);
          if (d.walk > 0 && d.kind !== 'object' && d.kind !== 'place' && !w.stele(x, y)) { spot = [x, y]; break; }
        }
        if (spot) { w.set(spot[0], spot[1], '囊'); w.bags.set(U.key(spot[0], spot[1]), p.bag); }
        p.bag = [];
      }
      this.paused = true;
      $('dead-text').innerHTML = '第 ' + this.day() + ' 日，你' + ({ '餓': '餓死了', '凍': '凍死了', '傷': '傷重而亡' })[cause] + '。<br>囊落在原地，可以回去取。';
      $('dead').classList.remove('hidden');
      this.save();
    }
    respawn() {
      const p = this.player, w = this.world;
      const h = p.home, homeOk = h && w.get(h.x, h.y) === '床';
      const at = homeOk ? this.freeNear(h.x, h.y) : this.spawn;
      p.x = p.rx = at.x; p.y = p.ry = at.y; p.moveT = 0;
      p.hp = 60; p.food = 60; p.warm = 60; p.sta = p.staMax; p.hurtT = 0; p.torchT = 0; p.dead = false; p.warned = {};
      this.action = null;
      w.time = Math.floor(w.time / DAY) * DAY + DAY * 1.03;     // 在一個清晨醒來
      this.ents.list = this.ents.list.filter(e => e.type !== '虎' && e.type !== '鬼');
      $('dead').classList.add('hidden');
      this.paused = false;
      this.toast('你在一個清晨醒來', homeOk ? '在你的床邊。' : '在最初的地方。');
      this.buildBag();
    }
    freeNear(x, y) { for (const [dx, dy] of N8) if (this.world.walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy }; return this.spawn; }

    // ---------- 囊：十二格，果記得哪天摘的，工具有耐久 ----------
    has(n) { return this.player.bag.some(s => s.n === n); }
    count(n) { let c = 0; for (const s of this.player.bag) if (s.n === n) c += s.c; return c; }
    stackKey(s) { return s.n + (s.d !== undefined ? '@' + s.d : ''); }
    canAdd(n, c) {
      c = c || 1; const bag = this.player.bag, it = G.item(n);
      if (it && it.dur) return bag.length + c <= SLOTS;
      const day = n === '果' ? this.day() : undefined;
      for (const s of bag) if (s.n === n && s.d === day && s.c < STACK) c -= Math.min(c, STACK - s.c);
      return c <= 0 || bag.length + Math.ceil(c / STACK) <= SLOTS;
    }
    addItem(n, c, extra) {     // 回傳放不下的數量
      const bag = this.player.bag, it = G.item(n);
      if (it && it.dur) { while (c > 0 && bag.length < SLOTS) { bag.push(Object.assign({ n, c: 1, dur: it.dur }, extra || {})); c--; } this.barSig = ''; return c; }
      const day = n === '果' ? this.day() : undefined;
      for (const s of bag) { if (s.n === n && s.d === day && s.c < STACK) { const k = Math.min(c, STACK - s.c); s.c += k; c -= k; if (!c) break; } }
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
    heldTool() { const s = this.held(); const it = s && ITEMS[s.n]; return it && it.tool ? it.tool : null; }
    heldDmg() { const s = this.held(); const it = s && ITEMS[s.n]; return it && it.dmg ? it.dmg : 0; }
    wearTool() {
      const s = this.held(); if (!s || s.dur === undefined) return;
      s.dur--; this.barSig = '';
      if (s.dur <= 0) { const n = s.n; this.player.bag.splice(this.player.bag.indexOf(s), 1); if (this.player.sel >= this.player.bag.length) this.player.sel = Math.max(0, this.player.bag.length - 1); this.toast('「' + n + '」鈍壞了', '石子磨石，再做一把。'); SFX.fail(); }
    }

    // ---------- 移動：格子制 + 平滑插值 ----------
    pass(x, y) { const ch = this.world.get(x, y); return DB[ch].walk > 0 || (ch === '水' && this.has('竹筏')); }
    handleMove(dt) {
      const p = this.player;
      if (p.moveT > 0) {
        p.moveT -= dt;
        const k = 1 - Math.max(0, p.moveT) / p.stepDur;
        p.rx = U.lerp(p.fromX, p.x, k); p.ry = U.lerp(p.fromY, p.y, k);
        if (p.moveT <= 0) { p.rx = p.x; p.ry = p.y; this.onArrive(); }
        else return;
      }
      let dx = 0, dy = 0;
      for (const code of this.keys) { const d = DIRS[code]; if (d) { dx += d[0]; dy += d[1]; } }
      dx = U.sign(dx); dy = U.sign(dy);
      if (!dx && !dy) return;
      p.fx = dx; p.fy = dy;
      if (this.action) this.action = null;
      this.tryStep(dx, dy) || (dx && dy && (this.tryStep(dx, 0) || this.tryStep(0, dy)));
    }
    tryStep(dx, dy) {
      const p = this.player, w = this.world, nx = p.x + dx, ny = p.y + dy;
      if (!this.pass(nx, ny) || this.ents.beastAt(nx, ny)) return false;
      if (dx && dy && !(this.pass(p.x + dx, p.y) && this.pass(p.x, p.y + dy))) return false; // 不許卡著角過
      const d = w.info(nx, ny);
      p.fromX = p.x; p.fromY = p.y; p.x = nx; p.y = ny;
      p.stepDur = (0.17 / (d.walk > 0 ? d.walk : 0.6)) * (dx && dy ? 1.3 : 1);
      p.moveT = p.stepDur;
      return true;
    }
    onArrive() { this.world.trample(this.player.x, this.player.y); }
    facing() { return { x: this.player.x + this.player.fx, y: this.player.y + this.player.fy }; }

    // ---------- 取（E）：採集、攻擊、捉魚、讀碑、讀地標、問路、取魚、撿囊 ----------
    pressGather(silent) {
      if (this.action || this.player.dead) return;
      const p = this.player, w = this.world, t = this.facing(), e = this.ents.at(t.x, t.y);
      if (e) {
        if (e.type === '龍') { this.message('你的龍。'); return; }
        if (e.type === '魚') { this.catchFish(e); return; }
        if (e.type === '鳥') { this.message('鳥飛了。'); e.moveT = 0; return; }
        this.attack(e); return;
      }
      const ch = w.get(t.x, t.y), d = DB[ch];
      const pl = w.placeAt(t.x, t.y);
      if (pl) { this.readPlace(pl); return; }
      if (ch === '碑') { this.readStele(t); return; }
      if (ch === '囊') { this.pickBag(t); return; }
      if (ch === '漁') { this.harvestWeir(t); return; }
      if (ch === '門') { this.askRoad(t); return; }
      if (!d.yield) { if (!silent) this.message(ch === '白' ? '白紙上無物可取。' : '「' + ch + '」取不走。'); return; }
      const tool = this.heldTool();
      if (d.need && tool !== d.need) { if (!silent) this.message('「' + ch + '」要用' + G.TOOL_NAMES[d.need] + '。'); return; }
      for (const n in d.yield) if (!this.canAdd(n, d.yield[n])) { if (!silent) this.message('囊已滿。'); return; }
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
      const w = this.world, d = DB[a.ch];
      w.set(a.x, a.y, d.to || '白'); w.extinguish(a.x, a.y);
      let got = [];
      for (const n in d.yield) { this.addItem(n, d.yield[n]); got.push(n + (d.yield[n] > 1 ? '×' + d.yield[n] : '')); }
      if (d.bonus) for (const n in d.bonus) if (Math.random() < d.bonus[n]) { this.addItem(n, 1); got.push(n); }
      if (a.useTool) this.wearTool();
      this.stats.gathered++;
      this.fx.push({ type: 'float', x: a.x, y: a.y, text: '+' + got.join(' '), color: G.INK.black, t: 0, dur: 0.9 });
      SFX.absorb();
      this.action = null;
      if (this.keys.has('KeyE') || this.keys.has('Space')) this.pressGather(true);   // 按住 E 可以連取
    }
    catchFish(e) {
      if (Math.random() < (this.has('竹筏') ? 0.85 : 0.55)) {
        if (!this.canAdd('魚', 1)) { this.message('囊已滿。'); return; }
        this.ents.remove(e); this.addItem('魚', 1); this.message('捉到一條魚。'); SFX.absorb();
      } else { this.message('魚溜了。'); e.moveT = 0; }
    }
    attack(e) {
      const p = this.player, dmg = this.heldDmg(), s = this.held();
      if (!dmg) { this.message('徒手打不了「' + e.type + '」。石子磨石可成刀、劍。'); return; }
      if (p.atkT > 0) return;
      p.atkT = 0.45;
      e.hp -= dmg; this.wearTool(); SFX.write(); this.renderer.shake = 0.15;
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '−' + dmg, color: G.INK.red, t: 0, dur: 0.7 });
      if (e.hp <= 0) { this.kill(e); return; }
      if (e.type === '鹿') e.moveT = 0;
      else if (e.type === '虎') { e.calm = 2; e.moveT = 0.3; this.message('虎受創而退（還有 ' + e.hp + '）。'); }
      else if (e.type === '鬼') { e.moveT = 0.4; this.message('鬼（還有 ' + e.hp + '）。'); }
    }
    kill(e) {
      const drops = { '鹿': ['肉', 2], '虎': ['肉', 3], '鬼': ['魄', 1] }[e.type];
      this.ents.remove(e); this.stats.kills++;
      if (drops) { this.addItem(drops[0], drops[1]); this.message(({ '鹿': '獵得一鹿，得肉二。', '虎': '虎斃，得肉三。', '鬼': '鬼散了，留下一點魄。' })[e.type]); }
      if (e.type === '虎' || e.type === '鬼') SFX.fuse();
    }

    // ---------- 放（F）：放置、鋤地、烤、添柴、放生 ----------
    pressPlace() {
      const p = this.player, w = this.world, s = this.held();
      if (p.dead) return;
      if (!s) { this.message('囊中空空。'); return; }
      const name = s.n, t = this.facing(), base = w.get(t.x, t.y), bd = DB[base], it = ITEMS[name] || {};
      const fail = () => this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 });
      if (it.tool === '鋤') {
        if (base === '土' || base === '草') { w.set(t.x, t.y, '田'); this.wearTool(); this.message('鋤之成田。'); SFX.write(); }
        else { this.message('鋤只能鋤土與草。'); fail(); }
        return;
      }
      if (it.tool || it.kind === 'wear') { this.message('「' + name + '」在囊中即生效；工具用 E。'); return; }
      if (base === '灶') {
        if (G.COOK[name]) {
          if (!w.stoveLit(t.x, t.y)) { this.message('灶是冷的，先放些木柴。'); fail(); return; }
          this.removeItem(name, 1); this.addItem(G.COOK[name], 1);
          this.message('烤好了：' + G.COOK[name]); SFX.fuse();
          this.fx.push({ type: 'float', x: t.x, y: t.y, text: G.COOK[name], color: G.INK.red, t: 0, dur: 1 });
          return;
        }
        if (DB[name] && DB[name].flam > 0) { w.addFuel(t.x, t.y, DB[name].s * 15); this.removeItem(name, 1); this.message('添柴。灶火還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); return; }
        this.message('灶上放不下「' + name + '」。'); fail(); return;
      }
      if (DB[name] && DB[name].kind === 'beast') {
        if (this.ents.canStand(name, t.x, t.y, true) && !this.ents.at(t.x, t.y)) { this.ents.add(name, t.x, t.y, { calm: 6 }); this.removeItem(name, 1); this.message('放了「' + name + '」。'); SFX.write(); }
        else { this.message('這裡放不下「' + name + '」。'); fail(); }
        return;
      }
      if (!DB[name] || !DB[name].place) { this.message('「' + name + '」放不到地上。'); fail(); return; }
      if (DB[name].onWater) { if (base !== '水') { this.message('「' + name + '」要放在淺水上。'); fail(); return; } }
      else {
        if (!(bd.kind === 'ground' || bd.kind === 'blank')) { this.message('這裡放不下，先把地上的東西取走。'); fail(); return; }
        if (this.ents.beastAt(t.x, t.y)) { this.message('有東西擋著。'); fail(); return; }
      }
      w.set(t.x, t.y, name); this.removeItem(name, 1);
      if (name === '床') { p.home = { x: t.x, y: t.y }; this.toast('床放好了', '夜裡面向它按 R，一覺到天明。'); this.save(); }
      else this.message('放下「' + name + '」。');
      SFX.write();
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: name, color: DB[name].ink, t: 0, dur: 0.35 });
    }

    // ---------- 吃（V） ----------
    useItem() {
      const p = this.player, s = this.held(); if (!s || p.dead) return;
      const it = G.item(s.n), f = it.food, tl = ITEMS[s.n] || {};
      if (!f) { this.message(tl.tool || tl.kind === 'wear' ? '「' + s.n + '」在囊中即生效。' : '「' + s.n + '」不能吃，按 F 放到地上。'); return; }
      if (f.sleep) { this.drunkSleep(); return; }
      if (f.eat) p.food = Math.min(100, p.food + f.eat);
      if (f.hurt) { p.hp = Math.max(1, p.hp - f.hurt); p.hurtT = 3; }
      if (f.heal) p.hp = Math.min(100, p.hp + f.heal);
      this.removeItem(s.n, 1); SFX.absorb();
      this.message('吃了「' + s.n + '」' + (f.eat ? '，飽 +' + f.eat : '') + (f.hurt ? '，生冷傷身 −' + f.hurt : '') + (f.heal ? '，命 +' + f.heal : '') + '。');
    }

    // ---------- 製作（C） ----------
    toggleCraft() {
      const el = $('craft'); el.classList.toggle('hidden'); this.keys.clear();
      if (!el.classList.contains('hidden')) this.buildCraft();
    }
    canCraft(r) { for (const n in r.need) if (this.count(n) < r.need[n]) return false; return true; }
    buildCraft() {
      const p = this.player, list = $('craft-list'); list.innerHTML = '';
      $('craft-sta').textContent = Math.floor(p.sta) + '/' + p.staMax;
      G.RECIPES.forEach((r, i) => {
        const row = document.createElement('div'); row.className = 'recipe' + (this.canCraft(r) && p.sta >= r.sta ? '' : ' cant');
        const needs = Object.keys(r.need).map(n => '<span class="' + (this.count(n) >= r.need[n] ? 'ok' : 'lack') + '">' + n + ' ' + this.count(n) + '/' + r.need[n] + '</span>').join(' ');
        const title = r.out ? r.out + (r.n > 1 ? ' ×' + r.n : '') : (r.regrind ? '重磨' : '磨礪');
        let btns = '';
        if (r.choose) btns = r.choose.map(c => '<button data-r="' + r.id + '" data-c="' + c + '">' + c + '</button>').join('');
        else btns = '<button data-r="' + r.id + '">' + (r.regrind ? '磨' : '造') + '</button>';
        row.innerHTML = '<span class="num">' + (i + 1) + '</span><b>' + title + '</b><span class="needs">' + needs + '</span><span class="sta">力 ' + r.sta + '</span><span class="note">' + r.note + '</span><span class="btns">' + btns + '</span>';
        list.appendChild(row);
      });
      list.querySelectorAll('button').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); this.craft(b.dataset.r, b.dataset.c); }));
    }
    craft(id, choice) {
      const p = this.player, r = G.RECIPES.find(x => x.id === id); if (!r) return;
      if (!this.canCraft(r)) { this.message('材料不夠。'); SFX.fail(); return; }
      if (p.sta < r.sta) { this.message('力氣不夠，歇一歇。'); SFX.fail(); return; }
      let out = r.out, n = r.n || 1;
      if (r.choose) { if (!choice) { this.message('選一個方向：刀、鎬、鋤、劍、斧。'); return; } out = choice; }
      if (r.regrind) {
        const s = this.held(); if (!s || s.dur === undefined) { this.message('手裡要拿著工具。'); SFX.fail(); return; }
        for (const m in r.need) this.removeItem(m, r.need[m]);
        p.sta -= r.sta; s.dur = ITEMS[s.n].dur; this.barSig = ''; this.message('「' + s.n + '」磨利了。'); SFX.fuse(); this.buildCraft(); this.buildBag(); return;
      }
      if (!this.canAdd(out, n)) { this.message('囊已滿。'); SFX.fail(); return; }
      for (const m in r.need) this.removeItem(m, r.need[m]);
      p.sta -= r.sta; this.addItem(out, n); this.stats.crafted++;
      this.toast('造了「' + out + '」' + (n > 1 ? ' ×' + n : ''), G.item(out).flavor); SFX.fuse();
      this.buildCraft(); this.buildBag();
    }

    // ---------- 睡（R）、醉果 ----------
    bedNear() { const p = this.player; for (const [dx, dy] of [[p.fx, p.fy]].concat(N8)) if (this.world.get(p.x + dx, p.y + dy) === '床') return true; return false; }
    sleep() {
      const p = this.player; if (p.dead) return;
      if (!this.bedNear()) { this.message('要有床才能睡。六團棉、兩塊木。'); return; }
      if (!this.isNight()) { this.message('白日不眠。'); return; }
      if (this.ents.ghostNear(p.x, p.y, 8)) { this.message('附近有鬼，睡不著。'); SFX.fail(); return; }
      this.doSleep(false);
    }
    drunkSleep() {
      const p = this.player;
      this.removeItem('醉果', 1); p.food = Math.min(100, p.food + 10);
      this.toast('醉了', '天旋地轉，你昏睡過去。');
      this.doSleep(true);
    }
    doSleep(drunk) {
      const p = this.player, w = this.world, t = this.dayT();
      w.time += (t > 0.5 ? (1 - t) : -t) * DAY + 0.03 * DAY;
      for (let i = 0; i < 80; i++) w.step(p.x, p.y);          // 讓火燒完、灰化土
      p.warm = 100; p.sta = p.staMax; p.food = Math.max(0, p.food - 12);
      this.ents.list = this.ents.list.filter(e => e.type !== '虎' && e.type !== '鬼');
      this.stats.nights++;
      if (drunk) { p.hp = Math.max(1, p.hp - 15); p.hangDay = this.day(); this.toast('醒來頭疼', '命 −15，今天不回血。'); }
      else { p.hp = Math.min(100, p.hp + 10); this.toast('一夜無夢', '天亮了。'); }
      p.warned = {};
      this.save();
    }

    // ---------- 虎與鬼的攻擊 ----------
    tigerAttack(e) {
      const p = this.player;
      this.renderer.shake = 0.5; SFX.tiger();
      p.hp = Math.max(0, p.hp - 20); p.hurtT = 6;
      this.toast('虎！', '命 −20。有劍兩下可斃。');
    }
    ghostAttack(e) {
      const p = this.player;
      this.renderer.shake = 0.4; SFX.fail();
      p.hp = Math.max(0, p.hp - 12); p.hurtT = 6;
      this.message('鬼！命 −12。');
    }

    // ---------- 探索：發現、讀地標、讀碑、問路、魚梁、撿囊、見聞錄、地圖 ----------
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
        const at = this.freeNear(p.x, p.y); this.ents.add('龍', at.x, at.y); p.dragon = true; this.toast('黑處有龍', '牠跟你走了。夜能照路，虎與鬼不敢近。');
      }
      if (!first) { this.buildBag(); return; }
      this.stats.read++;
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
      for (const s of items) { const r = this.addItem(s.n, s.c, s.dur !== undefined ? { dur: s.dur } : undefined); if (r > 0) left.push({ n: s.n, c: r }); }
      if (left.length) { this.world.bags.set(k, left); this.message('囊已滿，還有些東西留在袋裡。'); }
      else { this.world.set(t.x, t.y, '白'); this.message('取回了落下的囊。'); }
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
      h += '<h3>日子</h3><p>第 ' + this.day() + ' 日 · 睡過 ' + this.stats.nights + ' 夜 · 走過 ' + w.seenCount() + ' 格 · 取了 ' + this.stats.gathered + ' 次 · 造了 ' + this.stats.crafted + ' 件 · 斃 ' + this.stats.kills + ' · 死過 ' + p.deaths + ' 次</p>';
      $('journal-body').innerHTML = h;
    }

    // ---------- 輸入 ----------
    bindInput() {
      window.addEventListener('keydown', (ev) => {
        if (ev.repeat && !DIRS[ev.code]) return;
        if (!$('start').classList.contains('hidden')) { if (ev.code === 'Enter') { ev.preventDefault(); $('btn-continue').classList.contains('hidden') ? $('btn-new').click() : $('btn-continue').click(); } return; }
        if (this.player.dead) { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); this.respawn(); } return; }
        if (!$('read').classList.contains('hidden')) { if (['KeyE', 'Enter', 'Space', 'Escape'].indexOf(ev.code) >= 0) { this.closeRead(); ev.preventDefault(); } return; }
        if (ev.code === 'Escape') { for (const id of ['help', 'map', 'journal', 'craft']) $(id).classList.add('hidden'); ev.preventDefault(); return; }
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
        if (this.paused || this.player.dead) return;
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
    }
    cycle(d) { const p = this.player; if (p.bag.length) p.sel = (p.sel + d + p.bag.length) % p.bag.length; this.buildBag(); }

    // ---------- HUD ----------
    buildBag() {
      const p = this.player, bar = $('bagbar');
      const sig = p.bag.map(s => s.n + s.c + (s.dur !== undefined ? 'd' + s.dur : '') + (s.d !== undefined ? '@' + s.d : '')).join(',') + '|' + p.sel + '|' + this.day();
      if (sig === this.barSig) return;
      this.barSig = sig; bar.innerHTML = '';
      for (let i = 0; i < SLOTS; i++) {
        const s = p.bag[i], el = document.createElement('div');
        el.className = 'slot bag' + (s ? '' : ' empty') + (s && i === p.sel ? ' sel' : '');
        if (s) {
          const it = G.item(s.n);
          let sub = '×' + s.c;
          if (s.dur !== undefined) sub = '耐 ' + s.dur;
          else if (s.d !== undefined) { const age = this.day() - s.d; sub = '×' + s.c + (age >= FERMENT_NIGHTS - 3 ? ' 醉' : age >= 1 ? ' ' + age + '夜' : ''); }
          el.innerHTML = '<span class="num">' + (i < 9 ? i + 1 : '') + '</span><span class="ch' + (s.n.length > 1 ? ' word' : '') + '">' + s.n + '</span><span class="cost">' + sub + '</span>';
          if (s.dur !== undefined) el.innerHTML += '<i class="dur" style="width:' + Math.round(100 * s.dur / it.dur) + '%"></i>';
          el.title = it.flavor;
        }
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; p.sel = i; this.buildBag(); });
        bar.appendChild(el);
      }
    }
    updateHUD() {
      const p = this.player, w = this.world, t = this.facing();
      const sig = [Math.round(p.hp), Math.round(p.food), Math.round(p.warm), Math.round(p.sta), p.staMax, this.shichen(), p.x, p.y, w.get(p.x, p.y), this.daylight() > 0.5, this.day(), w.tideName()].join('|');
      if (sig !== this.hudSig) {
        this.hudSig = sig;
        $('hpfill').style.height = Math.round(p.hp) + '%'; $('foodfill').style.height = Math.round(p.food) + '%'; $('warmfill').style.height = Math.round(p.warm) + '%'; $('stafill').style.height = Math.round(100 * p.sta / p.staMax) + '%';
        $('hpfill').parentNode.classList.toggle('low', p.hp < 30); $('foodfill').parentNode.classList.toggle('low', p.food < 25); $('warmfill').parentNode.classList.toggle('low', p.warm < 30); $('stafill').parentNode.classList.toggle('low', p.sta < 15);
        $('hplabel').textContent = '命 ' + Math.round(p.hp); $('foodlabel').textContent = '飽 ' + Math.round(p.food); $('warmlabel').textContent = '暖 ' + Math.round(p.warm); $('stalabel').textContent = '力 ' + Math.round(p.sta);
        const nn = this.nightNo();
        $('status').innerHTML = '<b>第 ' + this.day() + ' 日</b> &nbsp;' + this.shichen() + ' ' + (this.daylight() > 0.5 ? '日' : '月') + (this.isNight() ? '<span class="dim">（第 ' + nn + ' 夜' + (nn >= GHOST_NIGHT ? '，鬼夜' : '') + '）</span>' : '') + ' &nbsp;·&nbsp; ' + w.tideName() + ' &nbsp;·&nbsp; ' + G.biomeName(w.get(p.x, p.y)) + ' &nbsp;·&nbsp; <span class="dim">(' + p.x + ', ' + p.y + ')</span>';
      }
      let s;
      const ch = w.get(t.x, t.y), d = DB[ch], e = this.ents.at(t.x, t.y), plc = w.placeAt(t.x, t.y), hs = this.held();
      if (plc) s = '「' + plc.name + '」 · <kbd>E</kbd> 讀';
      else if (e && e.type === '龍') s = '你的龍。';
      else if (e) s = '「' + e.type + '」' + (e.hp > 1 ? '（' + e.hp + '）' : '') + ' · <kbd>E</kbd> ' + (e.type === '魚' ? '捉' : e.type === '鳥' ? '驚' : this.heldDmg() ? '攻擊（' + hs.n + '）' : '<i>徒手打不了</i>');
      else if (ch === '碑') s = '一塊古碑 · <kbd>E</kbd> 讀碑';
      else if (ch === '囊') s = '落下的囊 · <kbd>E</kbd> 取回';
      else if (ch === '漁') s = '魚梁 · <kbd>E</kbd> 取魚' + (w.time < (w.weirs.get(U.key(t.x, t.y)) || 0) ? '（魚還沒來）' : '');
      else if (ch === '門') s = '門 · <kbd>E</kbd> 問路';
      else {
        s = '面前：' + (ch === '白' ? '白紙' : '<b>' + ch + '</b>') + (w.isBurning(t.x, t.y) ? ' <i class="fire">燃燒中</i>' : '') + (ch === '灶' ? (w.stoveLit(t.x, t.y) ? ' <i class="fire">火旺</i>' : ' <i>冷灶</i>') : '');
        if (d.yield) {
          const tool = this.heldTool(), need = d.need && tool !== d.need;
          s += ' · <kbd>E</kbd> ' + (need ? '<i>要用' + G.TOOL_NAMES[d.need] + '</i>' : '取 ' + Object.keys(d.yield).map(n => n + (d.yield[n] > 1 ? '×' + d.yield[n] : '')).join(' ') + (d.fast ? (tool === d.fast ? '（' + d.fast + '，快）' : '（' + d.fast + '更快）') : ''));
        }
        if (hs) {
          const it = G.item(hs.n), tl = ITEMS[hs.n] || {};
          if (tl.tool === '鋤' && (ch === '土' || ch === '草')) s += ' · <kbd>F</kbd> 鋤成田';
          else if (ch === '灶') s += G.COOK[hs.n] ? ' · <kbd>F</kbd> 烤' : (DB[hs.n] && DB[hs.n].flam > 0 ? ' · <kbd>F</kbd> 添柴' : '');
          else if (DB[hs.n] && DB[hs.n].place) s += ' · <kbd>F</kbd> 放「' + hs.n + '」';
          if (it.food) s += ' · <kbd>V</kbd> 吃';
        }
        if (this.bedNear()) s += ' · <kbd>R</kbd> 睡';
      }
      if (this.msgUntil && performance.now() < this.msgUntil) s = this.msgText;
      if (s !== this.lastMsg) { this.lastMsg = s; $('msg').innerHTML = s; }
    }
    message(text) { this.msgText = '<i>' + text + '</i>'; this.msgUntil = performance.now() + 2400; this.lastMsg = null; }
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
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 4, seed: this.seed, savedAt: Date.now(), world: this.world.serialize(), ents: this.ents.serialize(),
          player: { x: p.x, y: p.y, fx: p.fx, fy: p.fy, hp: p.hp, food: p.food, warm: p.warm, sta: p.sta, staMax: p.staMax, bag: p.bag, sel: p.sel, home: p.home, readSteles: p.readSteles,
            places: p.places, creatures: p.creatures, raftTaken: p.raftTaken, dragon: p.dragon, finished: p.finished, deaths: p.deaths, torchT: p.torchT, hangDay: p.hangDay, lastDay: p.lastDay }, stats: this.stats }));
      } catch (err) { /* 隱私模式等情況下存不了，就算了 */ }
    }
    load(s) {
      const p = this.player;
      this.world.restore(s.world || {});
      this.ents.restore(s.ents);
      const sp = s.player || {};
      for (const k of ['x', 'y', 'fx', 'fy', 'hp', 'food', 'warm', 'sta', 'staMax', 'bag', 'sel', 'home', 'readSteles', 'places', 'creatures', 'raftTaken', 'dragon', 'finished', 'deaths', 'torchT', 'hangDay', 'lastDay']) if (sp[k] !== undefined) p[k] = sp[k];
      p.rx = p.x; p.ry = p.y; p.moveT = 0;
      Object.assign(this.stats, s.stats || {});
    }
    static readSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 4 ? s : null; } catch (e) { return null; } }
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
      game.toast('寫意', '取木、取棉、取石子；砌磚、造床、磨劍。第十夜起有鬼。按 H 看法子。', 7000);
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
