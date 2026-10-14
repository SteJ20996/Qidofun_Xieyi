// game.js —— 主循環、輸入、玩家動作（吸 / 寫 / 放 / 造詞 / 研墨 / 吃 / 獵 / 讀碑 / 休息）、生存數值、HUD、存檔
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB, WORDS = G.WORDS;
  const SAVE_KEY = 'xieyi.save.v3';
  const DAY = 240;                                  // 一晝夜 = 240 秒
  const SHICHEN = '子醜寅卯辰巳午未申酉戌亥';
  const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const BAG_SLOTS = 8, STACK = 20;
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
        ink: 20, maxInk: 60, known: G.START_KNOWN.slice(), sel: 1, page: 0, home: null, readSteles: [],
        hp: 100, food: 100, warm: 100, hurtT: 0, bag: [], bsel: 0, row: 'dict', torchT: 0, deaths: 0, dead: false, warned: {},
        places: {}, creatures: [], raftTaken: false, finished: false };
      this.stats = { absorbed: 0, written: 0, fused: 0, learned: 0, words: 0, cooked: 0, hunted: 0 };
      this.keys = new Set();
      this.action = null;      // 進行中的動作（吸字）
      this.combine = null;     // 造詞狀態：{ name }
      this.fx = [];
      this.paused = true;
      this.saveAcc = 0;
      this.last = 0;
      this.msgText = ''; this.hudSig = ''; this.barSig = ''; this.bagSig = '';
      this.spawn = this.world.findSpawn();
      if (save) this.load(save);
      else { this.player.x = this.player.rx = this.spawn.x; this.player.y = this.player.ry = this.spawn.y; }
      this.bindInput();
      this.buildHotbar();
      this.buildBag();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------- 晝夜 ----------
    dayT() { return (this.world.time % DAY) / DAY; }              // 0 日出, 0.25 正午, 0.5 日落, 0.75 子夜
    day() { return Math.floor(this.world.time / DAY) + 1; }
    daylight() { const t = this.dayT(); return U.smoothstep(-0.04, 0.08, t) * (1 - U.smoothstep(0.46, 0.58, t)); }
    darkness() { return 1 - this.daylight(); }
    shichen() { const hour = (6 + this.dayT() * 24) % 24; return SHICHEN[Math.floor(((hour + 1) % 24) / 2)] + '時'; }
    torchLit() { return this.darkness() > 0.5 && this.has('火把'); }
    playerLight() { return 4.5 - 1.5 * this.darkness() + (this.torchLit() ? 3 : 0); }

    // ---------- 主循環 ----------
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
      this.handleMove(dt);
      this.updateAction(dt);
      this.ents.update(dt, this);
      this.updateStats(dt);
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t >= f.dur) this.fx.splice(i, 1); }
      this.saveAcc += dt; if (this.saveAcc > 20) { this.saveAcc = 0; this.save(); }
      this.updateHUD();
    }

    // ---------- 生存數值：命、飽、暖 ----------
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
        if (dw < 0) { if (this.has('草衣')) dw *= 0.5; if (this.torchLit()) dw *= 0.4; }
      }
      p.warm = U.clamp(p.warm + dw * dt, 0, 100);
      if (w.nearChar(p.x, p.y, '泉', 1)) { p.hp = Math.min(100, p.hp + 2 * dt); p.warm = Math.min(100, p.warm + 1.5 * dt); }   // 泉邊療傷
      if (this.torchLit()) { p.torchT += dt; if (p.torchT >= WORDS['火把'].life) { p.torchT = 0; this.removeItem('火把', 1); this.message('一支火把燃盡了。'); } }
      p.hurtT = Math.max(0, p.hurtT - dt);
      let dh = 0;
      if (p.food <= 0) dh -= 2;
      if (p.warm <= 0) dh -= 3;
      if (dh === 0 && p.hurtT <= 0 && p.food > 40 && p.warm > 40) dh = 0.6;
      p.hp = U.clamp(p.hp + dh * dt, 0, 100);
      // 提醒一次
      if (p.food < 25 && !p.warned.food) { p.warned.food = true; this.toast('你餓了', '摘果、捉魚、獵鹿。生食傷身，灶上烤之。'); }
      if (p.food >= 40) p.warned.food = false;
      if (p.warm < 30 && !p.warned.warm) { p.warned.warm = true; this.toast('你冷了', '寫「土」，再在土上寫「火」，便是一口灶。'); }
      if (p.warm >= 50) p.warned.warm = false;
      if (p.hp <= 0) this.die(p.food <= 0 ? '餓' : p.warm <= 0 ? '凍' : '傷');
    }
    die(cause) {
      const p = this.player, w = this.world;
      p.dead = true; p.deaths++;
      // 囊落在原地（或旁邊能放的地方）
      if (p.bag.length) {
        let spot = null;
        for (const [dx, dy] of [[0, 0]].concat(N8)) {
          const x = p.x + dx, y = p.y + dy, d = w.info(x, y);
          if (d.walk > 0 && d.kind !== 'object' && !w.stele(x, y)) { spot = [x, y]; break; }
        }
        if (spot) { w.set(spot[0], spot[1], '囊'); w.bags.set(U.key(spot[0], spot[1]), p.bag); }
        p.bag = [];
      }
      this.paused = true;
      $('dead-text').innerHTML = '第 ' + this.day() + ' 日，你' + ({ '餓': '餓死了', '凍': '凍死了', '傷': '傷重而亡' })[cause] + '。墨盡。<br>囊落在原地，可以回去取。';
      $('dead').classList.remove('hidden');
      this.save();
    }
    respawn() {
      const p = this.player, w = this.world;
      const h = p.home, homeOk = h && (w.get(h.x, h.y) === '休' || w.get(h.x, h.y) === '木屋');
      const at = homeOk ? h : this.spawn;
      p.x = p.rx = at.x; p.y = p.ry = at.y; p.moveT = 0;
      p.hp = 60; p.food = 60; p.warm = 60; p.ink = Math.floor(p.ink / 2); p.hurtT = 0; p.torchT = 0; p.dead = false; p.warned = {};
      this.action = null; this.combine = null;
      // 在一個清晨醒來
      w.time = Math.floor(w.time / DAY) * DAY + DAY * 1.03;
      this.ents.list = this.ents.list.filter(e => e.type !== '虎');
      $('dead').classList.add('hidden');
      this.paused = false;
      this.toast('你在一個清晨醒來', homeOk ? '在你的營地。' : '在最初的地方。');
      this.bagSig = '';
    }

    // ---------- 囊 ----------
    has(n) { return this.player.bag.some(s => s.n === n); }
    count(n) { let c = 0; for (const s of this.player.bag) if (s.n === n) c += s.c; return c; }
    canAdd(n) { const bag = this.player.bag; return bag.length < BAG_SLOTS || bag.some(s => s.n === n && s.c < STACK); }
    addItem(n, c) {     // 返回放不下的數量
      const bag = this.player.bag;
      for (const s of bag) { if (s.n === n && s.c < STACK) { const k = Math.min(c, STACK - s.c); s.c += k; c -= k; if (!c) break; } }
      while (c > 0 && bag.length < BAG_SLOTS) { const k = Math.min(c, STACK); bag.push({ n, c: k }); c -= k; }
      this.bagSig = '';
      return c;
    }
    removeItem(n, c) {
      const bag = this.player.bag;
      for (let i = bag.length - 1; i >= 0 && c > 0; i--) { if (bag[i].n !== n) continue; const k = Math.min(c, bag[i].c); bag[i].c -= k; c -= k; if (bag[i].c <= 0) bag.splice(i, 1); }
      if (this.player.bsel >= bag.length) this.player.bsel = Math.max(0, bag.length - 1);
      this.bagSig = '';
    }
    selectedItem() { const s = this.player.bag[this.player.bsel]; return s ? s.n : null; }
    selected() { return this.player.known[this.player.sel]; }

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
    onArrive() {
      const p = this.player, e = this.ents.at(p.x, p.y);
      this.world.trample(p.x, p.y);
      if (e && e.type === '丶') this.collect(e);
    }
    facing() { return { x: this.player.x + this.player.fx, y: this.player.y + this.player.fy }; }

    // ---------- 取：吸字入囊 / 拾 / 捉 / 獵 / 讀碑 ----------
    pressGather(silent) {
      if (this.action || this.player.dead) return;
      const p = this.player, w = this.world, t = this.facing(), e = this.ents.at(t.x, t.y);
      if (e) {
        if (e.type === '日' || e.type === '月' || e.type === '丶') { this.collect(e); return; }
        if (e.cage > 0) {
          if (!this.canAdd(e.type)) { this.message('囊已滿'); return; }
          this.ents.remove(e); this.addItem(e.type, 1); this.message('「' + e.type + '」收入囊中。放到地上，它還是活的。'); SFX.absorb(); return;
        }
        this.hunt(e); return;
      }
      const ch = w.get(t.x, t.y), d = DB[ch];
      const pl = w.placeAt(t.x, t.y);
      if (pl) { this.readPlace(pl); return; }
      if (ch === '碑') { this.readStele(t); return; }
      if (ch === '囊') { this.pickBag(t); return; }
      if (ch === '漁') { this.harvestWeir(t); return; }
      if (!d.absorb) { if (!silent) this.message(ch === '白' ? '白紙上無物可取' : '這裡沒有可取的字'); return; }
      if (!this.canAdd(ch)) { if (!silent) this.message('囊已滿。按 X 研墨，或按 V 吃掉些什麼。'); return; }
      this.action = { type: 'absorb', x: t.x, y: t.y, ch, t: 0, dur: (0.15 + 0.07 * d.s) * (this.has('石刀') ? 0.5 : 1) };
    }
    updateAction(dt) {
      const a = this.action; if (!a) return;
      const t = this.facing();
      if (a.type === 'absorb') {
        if (t.x !== a.x || t.y !== a.y || this.world.get(a.x, a.y) !== a.ch) { this.action = null; return; }
        a.t += dt;
        if (a.t >= a.dur) this.finishAbsorb(a);
      }
    }
    finishAbsorb(a) {
      const w = this.world;
      w.set(a.x, a.y, '白'); w.extinguish(a.x, a.y);
      this.addItem(a.ch, 1); this.stats.absorbed++;
      this.fx.push({ type: 'float', x: a.x, y: a.y, text: '+' + a.ch, color: G.INK.black, t: 0, dur: 0.9 });
      this.learn(a.ch);
      SFX.absorb();
      this.action = null;
      if (this.keys.has('KeyE') || this.keys.has('Space')) this.pressGather(true);   // 按住 E 可以連續取
    }
    hunt(e) {
      const knife = this.has('石刀');
      if (e.type === '魚') {
        if (Math.random() < (this.has('竹筏') ? 0.85 : 0.55)) {
          if (!this.canAdd('魚')) { this.message('囊已滿'); return; }
          this.ents.remove(e); this.addItem('魚', 1); this.stats.hunted++; this.message('捉到一條魚。'); SFX.absorb();
        } else { this.message('魚溜了。'); e.moveT = 0; }
      } else if (e.type === '鳥') { this.message('鳥飛了。'); e.moveT = 0; }
      else if (e.type === '鹿') {
        if (!knife) { this.message('徒手捉不住鹿。石上加刀，可以為獵。'); e.moveT = 0; return; }
        if (!this.canAdd('肉')) { this.message('囊已滿'); return; }
        this.ents.remove(e); this.addItem('肉', 2); this.stats.hunted++; this.message('獵得一鹿，得肉二。'); SFX.write();
      } else if (e.type === '虎') {
        if (!knife) { this.message('你拿什麼打虎？'); return; }
        e.hp--; SFX.write(); this.renderer.shake = 0.2;
        if (e.hp <= 0) { this.ents.remove(e); this.addItem('肉', 3); this.stats.hunted++; this.toast('虎斃', '得肉三。'); }
        else { e.calm = 3; e.moveT = 0.3; this.message('虎受創而退。'); }
      }
    }
    collect(e) {
      const p = this.player;
      this.ents.remove(e);
      if (e.type === '丶') { p.ink = Math.min(p.maxInk, p.ink + e.ink); this.fx.push({ type: 'float', x: e.x, y: e.y, text: '+' + e.ink, t: 0, dur: 0.9 }); return; }
      p.ink = Math.min(p.maxInk, p.ink + 4);
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '+4', color: G.INK.red, t: 0, dur: 1 });
      this.message(e.type === '月' ? '你從水裡撈起了月亮。' : '你從沙上拾起了一片日光。');
      this.learn(e.type);
    }
    readStele(t) {
      const p = this.player, s = this.world.stele(t.x, t.y), k = U.key(t.x, t.y);
      if (!s) return;
      if (p.readSteles.indexOf(k) < 0) { p.readSteles.push(k); p.maxInk = Math.min(240, p.maxInk + 10); this.toast('讀碑有得', '硯臺寬了十分（墨量上限 ' + p.maxInk + '）'); }
      this.learn(s.teach);
      this.toast('碑文', s.hint, 9000);
    }
    pickBag(t) {
      const k = U.key(t.x, t.y), items = this.world.bags.get(k) || [];
      const left = [];
      for (const s of items) { const r = this.addItem(s.n, s.c); if (r > 0) left.push({ n: s.n, c: r }); }
      if (left.length) { this.world.bags.set(k, left); this.message('囊已滿，還有些東西留在袋裡。'); }
      else { this.world.set(t.x, t.y, '白'); this.message('取回了落下的囊。'); }
      SFX.absorb();
    }

    // ---------- 寫：字典之字寫在地上（付墨）；囊中之物放在地上（不付墨） ----------
    evalWrite(ch, x, y, free) {
      const w = this.world, base = w.get(x, y), bd = DB[base], wd = DB[ch];
      const e = this.ents.beastAt(x, y);
      const cost = (c) => (free ? 0 : c);
      if (ch === '龍') {
        if (this.ents.list.some(o => o.type === '龍')) return { ok: false, msg: '龍已在你身邊' };
        if (base !== '白') return { ok: false, msg: '龍要寫在白紙上' };
        return { ok: true, mode: 'summon', cost: cost(wd.s), result: '龍', msg: '寫龍成龍' };
      }
      if (base === '門' && ch === '口') return { ok: true, mode: 'ask', cost: cost(wd.s), result: '問', msg: '門中有口，是為問' };
      if (ch === '口' && e && e.cage <= 0) return { ok: true, mode: 'cage', cost: cost(wd.s), result: '囚', msg: '「口」困住了「' + e.type + '」' };
      if (ch === '水' && bd.kind !== 'fire' && w.isBurning(x, y)) return { ok: true, mode: 'douse', cost: cost(wd.s), result: base, msg: '水滅了「' + base + '」上的火' };
      const f = G.FUSE.get(base + ch);
      if (f) return { ok: true, mode: 'fuse', cost: cost(G.writeCost(ch, base, f.result)), result: f.result, msg: f.msg };
      if (ch === '火' && bd.flam > 0 && !w.isBurning(x, y)) return { ok: true, mode: 'ignite', cost: cost(wd.s), result: base, msg: '火焚「' + base + '」' };
      if (base === '白') {
        if (!wd.tile) return { ok: false, msg: G.failReason(base, ch) || '「' + ch + '」不能單獨成物' };
        return { ok: true, mode: 'blank', cost: cost(wd.s), result: ch, msg: '寫下「' + ch + '」' };
      }
      return { ok: false, msg: G.failReason(base, ch) };
    }
    applyWrite(r, ch, t) {
      const w = this.world, p = this.player;
      if (r.mode === 'cage') { this.ents.beastAt(t.x, t.y).cage = 30; }
      else if (r.mode === 'ignite') { w.ignite(t.x, t.y, 1); }
      else if (r.mode === 'douse') { w.extinguish(t.x, t.y); this.message(r.msg); }
      else if (r.mode === 'summon') { this.ents.add('龍', t.x, t.y); this.toast('寫龍成龍', '它會隨你同行，夜能照路，虎不敢近。'); }
      else if (r.mode === 'ask') { this.askRoad(t); }
      else {
        const base = w.get(t.x, t.y);
        w.set(t.x, t.y, r.result);
        if (DB[r.result].kind === 'fire') w.ignite(t.x, t.y);
        if (r.result === '灶' && r.mode === 'fuse') w.addFuel(t.x, t.y, 90);
        if (r.mode === 'fuse') { this.stats.fused++; this.message(r.msg + '：' + base + ' + ' + ch + ' = ' + r.result); this.learn(r.result); SFX.fuse(); }
        if (r.result === '休') { p.home = { x: t.x, y: t.y }; this.save(); }
        if (r.result === '漁') this.message('水中有魚，是為漁：隔一陣子就有魚，面向它按 E 取。');
      }
      if (this.action) this.action = null;
      if (r.mode !== 'fuse') SFX.write();
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: r.mode === 'cage' ? '口' : (r.result || ch), color: DB[r.result] ? DB[r.result].ink : G.INK.black, t: 0, dur: 0.35 });
    }
    pressWrite() {
      const p = this.player; if (p.dead) return;
      if (p.row === 'bag') { this.placeItem(); return; }
      const ch = this.selected(); if (!ch) return;
      const t = this.facing(), r = this.evalWrite(ch, t.x, t.y, false);
      if (!r.ok) { this.message(r.msg); this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 }); SFX.fail(); return; }
      if (p.ink < r.cost) { this.message('墨不夠：需要 ' + r.cost + '，只有 ' + Math.floor(p.ink) + '。按 X 研墨。'); this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 }); SFX.fail(); return; }
      p.ink -= r.cost; this.stats.written++;
      this.applyWrite(r, ch, t);
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: '−' + r.cost, color: G.INK.red, t: 0, dur: 0.9 });
    }
    placeItem() {
      const p = this.player, w = this.world, name = this.selectedItem();
      if (!name) { this.message('囊中空空。'); return; }
      const t = this.facing(), it = G.item(name), base = w.get(t.x, t.y), fail = () => this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 });
      if (name === '籠') {
        const e = this.ents.beastAt(t.x, t.y);
        if (!e || e.type === '龍') { this.message(e ? '龍是你的朋友。' : '籠裡空空，面向獸再放。'); fail(); return; }
        if (!this.canAdd(e.type)) { this.message('囊已滿。'); return; }
        this.ents.remove(e); this.addItem(e.type, 1); this.message('「' + e.type + '」入籠，收入囊中。籠還在。'); SFX.absorb(); return;
      }
      if (base === '灶') {
        if (G.COOK[name]) {
          if (!w.stoveLit(t.x, t.y)) { this.message('灶是冷的，先添些木柴。'); fail(); return; }
          this.removeItem(name, 1); this.addItem(G.COOK[name], 1); this.stats.cooked++;
          this.message('烤好了：' + G.COOK[name]); SFX.fuse();
          this.fx.push({ type: 'float', x: t.x, y: t.y, text: G.COOK[name], color: G.INK.red, t: 0, dur: 1 });
          return;
        }
        if (DB[name] && DB[name].flam > 0) { w.addFuel(t.x, t.y, DB[name].s * 15); this.removeItem(name, 1); this.message('添柴。灶火還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); return; }
        this.message('灶上放不下「' + name + '」'); fail(); return;
      }
      if (DB[name] && DB[name].kind === 'beast' && !G.FUSE.get(base + name)) {
        if (this.ents.canStand(name, t.x, t.y, true) && !this.ents.at(t.x, t.y)) { this.ents.add(name, t.x, t.y, { calm: 6 }); this.removeItem(name, 1); this.message('寫' + name + '成' + name + '。'); SFX.write(); }
        else { this.message('這裡放不下「' + name + '」'); fail(); }
        return;
      }
      if (it.kind === 'build') {
        if (base !== '白') { this.message('要放在白紙上。'); fail(); return; }
        w.set(t.x, t.y, name); this.removeItem(name, 1);
        if (DB[name] && DB[name].shelter) { p.home = { x: t.x, y: t.y }; this.toast('木屋立起來了', '入內則暖，獸不得入。站在其中按 R 可睡。'); }
        else this.toast('燈立起來了', '長明不滅。夜裡照路，虎不敢近。');
        SFX.fuse(); this.save();
        this.fx.push({ type: 'write', x: t.x, y: t.y, ch: name.length > 1 ? name[1] : name, color: DB[name] ? DB[name].ink : G.INK.brown, t: 0, dur: 0.35 });
        return;
      }
      if (!DB[name]) { this.message('「' + name + '」放不到地上。'); fail(); return; }
      const r = this.evalWrite(name, t.x, t.y, true);
      if (!r.ok) { this.message(r.msg || '放不下'); fail(); return; }
      this.applyWrite(r, name, t);
      this.removeItem(name, 1);
    }

    // ---------- 造詞、研墨、吃 ----------
    startCombine() {
      const p = this.player; if (p.dead) return;
      if (p.row !== 'bag') { p.row = 'bag'; this.buildHotbar(); this.buildBag(); }
      const name = this.selectedItem();
      if (!name) { this.message('囊中空空，無物可寫。'); return; }
      if (!DB[name]) { this.message('「' + name + '」已是詞，不可再寫。'); return; }
      this.combine = { name };
      this.message('在「' + name + '」上寫什麼？按數字選字，Esc 取消。');
    }
    finishCombine(ch) {
      const p = this.player, c = this.combine; this.combine = null;
      if (!c || !this.has(c.name)) return;
      const word = G.wordFor(c.name, ch);
      if (!word) { this.message('「' + c.name + '」與「' + ch + '」不成詞。'); SFX.fail(); return; }
      const cost = DB[ch].s;
      if (p.ink < cost) { this.message('墨不夠：寫「' + ch + '」需要 ' + cost + '，只有 ' + Math.floor(p.ink) + '。'); SFX.fail(); return; }
      if (!this.canAdd(word) && this.count(c.name) > 1) { this.message('囊已滿。'); return; }
      p.ink -= cost; this.removeItem(c.name, 1); this.addItem(word, 1); this.stats.words++;
      this.toast('造詞「' + word + '」', WORDS[word].flavor); SFX.fuse();
      this.fx.push({ type: 'float', x: p.x, y: p.y, text: word, color: G.INK.red, t: 0, dur: 1.2 });
    }
    grind() {
      const p = this.player, name = this.selectedItem(); if (!name || p.dead) return;
      if (p.ink >= p.maxInk) { this.message('硯臺已滿。'); return; }
      const gain = Math.min(G.item(name).s, p.maxInk - p.ink);
      p.ink += gain; this.removeItem(name, 1);
      this.message('研「' + name + '」為墨，+' + gain + '。'); SFX.absorb();
      this.fx.push({ type: 'float', x: p.x, y: p.y, text: '+' + gain, t: 0, dur: 0.9 });
    }
    useItem() {
      const p = this.player, name = this.selectedItem(); if (!name || p.dead) return;
      const it = G.item(name);
      if (it.food) {
        const f = it.food;
        if (f.eat) p.food = Math.min(100, p.food + f.eat);
        if (f.hurt) { p.hp = Math.max(1, p.hp - f.hurt); p.hurtT = 3; }
        if (f.heal) p.hp = Math.min(100, p.hp + f.heal);
        this.removeItem(name, 1); SFX.absorb();
        this.message('吃了「' + name + '」' + (f.eat ? '，飽 +' + f.eat : '') + (f.hurt ? '，生冷傷身 −' + f.hurt : '') + (f.heal ? '，命 +' + f.heal : '') + '。');
        return;
      }
      if (it.kind === 'tool' || it.kind === 'wear') { this.message('「' + name + '」在囊中即生效。'); return; }
      if (it.kind === 'build') { this.message('面向白紙按 F，放下它。'); return; }
      if (DB[name] && DB[name].kind === 'beast') { this.message('面向地面按 F，它會活過來。'); return; }
      this.message('「' + name + '」不能吃。按 F 放到地上，或按 X 研墨。');
    }

    // ---------- 探索：發現、讀地標、見聞錄、地圖 ----------
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
      if (!first) return;
      this.stats.read = (this.stats.read || 0) + 1;
      if (pl.effect === 'reveal') { w.revealAll(pl.x, pl.y); this.toast('看見整張紙', '島上的一切都畫到地圖上了。按 M 看。'); this.learn('登'); }
      else if (pl.effect === 'ink') { p.ink = Math.min(p.maxInk, p.ink + 10); this.toast('錯字也是墨', '墨 +10'); }
      else if (pl.effect === 'dragon') { this.learn('龍'); this.toast('黑處有龍', '你學會了寫「龍」。寫在白紙上試試。'); }
      else if (pl.effect === 'end') {
        const n = w.places.filter(x => p.places[x.id] === 2).length;
        if (n >= w.places.length) { p.finished = true; this.toast('你讀完了這張紙', '第 ' + this.day() + ' 日。島上八處，你都去過了。', 9000); }
        else this.toast('燈', '還有 ' + (w.places.length - n) + ' 處沒讀。', 6000);
      }
      SFX.learn();
      this.save();
    }
    closeRead() { $('read').classList.add('hidden'); }
    // 門中有口，是為問：門會告訴你最近一處沒讀過的地方
    askRoad(t) {
      const p = this.player, w = this.world;
      let best = null, bd = Infinity;
      for (const pl of w.places) { if (p.places[pl.id] === 2) continue; const d = U.dist(t.x, t.y, pl.x, pl.y); if (d < bd) { bd = d; best = pl; } }
      if (!best) { this.toast('問路', '門說：八處你都去過了。'); return; }
      const dx = best.x - t.x, dy = best.y - t.y, a = Math.atan2(-dy, dx);           // 北在上
      const dirs = ['東', '東北', '北', '西北', '西', '西南', '南', '東南'];
      const dir = dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
      this.toast('問路', '門說：往' + dir + '約 ' + Math.round(Math.max(Math.abs(dx), Math.abs(dy))) + ' 步，有' + best.name + '。', 7000);
      SFX.learn();
    }
    // 水中有魚，是為漁：魚梁隔一陣子就有魚
    harvestWeir(t) {
      const w = this.world, k = U.key(t.x, t.y), ready = w.weirs.get(k) || 0;
      if (w.time < ready) { this.message('魚還沒來，約還要 ' + Math.ceil(ready - w.time) + ' 息。'); return; }
      if (!this.canAdd('魚')) { this.message('囊已滿。'); return; }
      this.addItem('魚', 1); w.weirs.set(k, w.time + 60); this.stats.hunted++;
      this.message('漁獲一魚。'); SFX.absorb();
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: '+魚', color: G.INK.water, t: 0, dur: 0.9 });
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
      h += '<h3>字</h3><p>' + p.known.length + ' 字：' + p.known.join('') + '</p>';
      h += '<h3>日子</h3><p>第 ' + this.day() + ' 日 · 走過 ' + w.seenCount() + ' 格 · 死過 ' + p.deaths + ' 次 · 造詞 ' + (this.stats.words || 0) + ' 次</p>';
      $('journal-body').innerHTML = h;
    }

    // ---------- 學字、休息、虎 ----------
    learn(ch) {
      const p = this.player;
      if (!DB[ch] || !DB[ch].learn || p.known.indexOf(ch) >= 0) return;
      p.known.push(ch); this.stats.learned++; SFX.learn();
      this.toast('習得新字「' + ch + '」', DB[ch].flavor);
      this.buildHotbar();
    }
    sleep() {
      const p = this.player, here = this.world.get(p.x, p.y);
      if (here !== '休' && !DB[here].shelter) { this.message('只有在「休」或屋中才能休息。'); return; }
      const t = this.dayT();
      if (t > 0.08 && t < 0.5) { this.message('白日不眠。'); return; }
      this.world.time += (t > 0.5 ? (1 - t) : -t) * DAY + 0.02 * DAY;
      for (let i = 0; i < 80; i++) this.world.step(p.x, p.y);  // 讓火燒完、灰化土
      p.warm = 100; p.food = Math.max(0, p.food - 12); p.hp = Math.min(100, p.hp + 20);
      this.ents.list = this.ents.list.filter(e => e.type !== '虎');
      this.toast('一夜無夢', '天亮了。');
      this.save();
    }
    tigerAttack(e) {
      const p = this.player;
      this.renderer.shake = 0.5; SFX.tiger();
      p.hp = Math.max(0, p.hp - 20); p.hurtT = 6;
      let lost = 0;
      if (p.ink >= 1) {
        lost = Math.max(3, Math.floor(p.ink * 0.3)); p.ink -= lost;
        const n = Math.min(3, lost), each = Math.floor(lost / n), rest = lost - each * n;
        let placed = 0;
        for (let tries = 0; tries < 40 && placed < n; tries++) {
          const x = p.x + Math.floor(Math.random() * 7) - 3, y = p.y + Math.floor(Math.random() * 7) - 3;
          if (U.cheb(x, y, p.x, p.y) < 2 || !this.world.walkable(x, y) || this.ents.at(x, y)) continue;
          this.ents.add('丶', x, y, { ink: each + (placed === 0 ? rest : 0), life: 120 }); placed++;
        }
      }
      this.toast('虎！', '命 −20' + (lost ? '，失了 ' + lost + ' 墨，墨點四散。' : '。'));
    }

    // ---------- 輸入 ----------
    bindInput() {
      window.addEventListener('keydown', (ev) => {
        if (ev.repeat && !DIRS[ev.code]) return;
        if (!$('start').classList.contains('hidden')) { if (ev.code === 'Enter') { ev.preventDefault(); $('btn-continue').classList.contains('hidden') ? $('btn-new').click() : $('btn-continue').click(); } return; }
        if (this.player.dead) { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); this.respawn(); } return; }
        if (!$('read').classList.contains('hidden')) { if (['KeyE', 'Enter', 'Space', 'Escape'].indexOf(ev.code) >= 0) { this.closeRead(); ev.preventDefault(); } return; }
        if (ev.code === 'Escape') { if (this.combine) { this.combine = null; this.message('作罷。'); } for (const id of ['help', 'map', 'journal']) $(id).classList.add('hidden'); ev.preventDefault(); return; }
        if (ev.code === 'KeyM') { $('journal').classList.add('hidden'); this.toggleMap(); ev.preventDefault(); return; }
        if (ev.code === 'KeyJ') { $('map').classList.add('hidden'); this.toggleJournal(); ev.preventDefault(); return; }
        if (!$('map').classList.contains('hidden') || !$('journal').classList.contains('hidden')) return;
        if (ev.code === 'KeyH') { $('help').classList.toggle('hidden'); ev.preventDefault(); return; }
        if (!$('help').classList.contains('hidden')) return;
        const p = this.player;
        if (DIRS[ev.code]) { this.keys.add(ev.code); ev.preventDefault(); return; }
        if (/^Digit[1-9]$/.test(ev.code)) {
          const n = +ev.code[5] - 1;
          if (this.combine) { const ch = p.known[p.page * 9 + n]; if (ch) this.finishCombine(ch); }
          else if (p.row === 'dict') { const i = p.page * 9 + n; if (i < p.known.length) p.sel = i; }
          else { if (n < p.bag.length) p.bsel = n; }
          this.buildHotbar(); this.buildBag(); ev.preventDefault(); return;
        }
        switch (ev.code) {
          case 'KeyE': case 'Space': this.keys.add(ev.code); this.pressGather(); break;
          case 'KeyF': case 'Enter': this.pressWrite(); break;
          case 'Tab': p.row = p.row === 'dict' ? 'bag' : 'dict'; this.buildHotbar(); this.buildBag(); break;
          case 'KeyC': this.startCombine(); break;
          case 'KeyV': this.useItem(); break;
          case 'KeyX': this.grind(); break;
          case 'KeyR': this.sleep(); break;
          case 'KeyN': this.message(SFX.toggle() ? '已靜音' : '聲音已開'); break;
          case 'BracketLeft': case 'KeyQ': this.cycle(-1); break;
          case 'BracketRight': case 'KeyZ': this.cycle(1); break;
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
        if (ev.button === 2) this.pressGather(); else this.pressWrite();
      });
      cv.addEventListener('wheel', (ev) => { this.cycle(ev.deltaY > 0 ? 1 : -1); ev.preventDefault(); }, { passive: false });
      $('dead-btn').addEventListener('click', () => this.respawn());
      $('read').addEventListener('mousedown', () => this.closeRead());
      $('journal-close').addEventListener('click', () => this.toggleJournal());
      $('map-close').addEventListener('click', () => this.toggleMap());
    }
    cycle(d) {
      const p = this.player;
      if (p.row === 'dict') { p.sel = (p.sel + d + p.known.length) % p.known.length; p.page = Math.floor(p.sel / 9); }
      else if (p.bag.length) p.bsel = (p.bsel + d + p.bag.length) % p.bag.length;
      this.buildHotbar(); this.buildBag();
    }

    // ---------- HUD ----------
    buildHotbar() {
      const p = this.player, bar = $('hotbar');
      p.page = Math.min(p.page, Math.floor((p.known.length - 1) / 9));
      if (p.sel >= p.known.length) p.sel = 0;
      const sig = p.known.join('') + '|' + p.sel + '|' + p.page + '|' + p.row;
      if (sig === this.barSig) return;
      this.barSig = sig; bar.innerHTML = '';
      bar.classList.toggle('active', p.row === 'dict');
      const start = p.page * 9;
      p.known.slice(start, start + 9).forEach((ch, i) => {
        const el = document.createElement('div');
        el.className = 'slot' + (start + i === p.sel ? ' sel' : '') + (DB[ch].tile ? '' : ' radical');
        el.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="ch">' + ch + '</span><span class="cost">' + DB[ch].s + '畫</span>';
        el.title = DB[ch].flavor;
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (this.combine) { this.finishCombine(ch); } else { p.row = 'dict'; p.sel = start + i; } this.buildHotbar(); this.buildBag(); });
        bar.appendChild(el);
      });
      if (p.known.length > 9) { const pg = document.createElement('div'); pg.className = 'page'; pg.textContent = (p.page + 1) + '/' + Math.ceil(p.known.length / 9) + '\n[ ]'; bar.appendChild(pg); }
    }
    buildBag() {
      const p = this.player, bar = $('bagbar');
      const sig = p.bag.map(s => s.n + s.c).join(',') + '|' + p.bsel + '|' + p.row;
      if (sig === this.bagSig) return;
      this.bagSig = sig; bar.innerHTML = '';
      bar.classList.toggle('active', p.row === 'bag');
      for (let i = 0; i < BAG_SLOTS; i++) {
        const s = p.bag[i], el = document.createElement('div');
        el.className = 'slot bag' + (s ? '' : ' empty') + (s && i === p.bsel ? ' sel' : '');
        if (s) { const it = G.item(s.n); el.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="ch' + (s.n.length > 1 ? ' word' : '') + '">' + s.n + '</span><span class="cost">×' + s.c + '</span>'; el.title = it.flavor; }
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; p.row = 'bag'; p.bsel = i; this.buildHotbar(); this.buildBag(); });
        bar.appendChild(el);
      }
    }
    updateHUD() {
      const p = this.player, w = this.world, t = this.facing();
      const pct = Math.round(100 * p.ink / p.maxInk);
      const sig = [pct, Math.floor(p.ink), p.maxInk, this.shichen(), p.x, p.y, w.get(p.x, p.y), this.daylight() > 0.5, Math.round(p.hp), Math.round(p.food), Math.round(p.warm), this.day()].join('|');
      if (sig !== this.hudSig) {
        this.hudSig = sig;
        $('inkfill').style.height = pct + '%';
        $('inklabel').textContent = '墨 ' + Math.floor(p.ink) + '/' + p.maxInk;
        $('hpfill').style.height = Math.round(p.hp) + '%'; $('foodfill').style.height = Math.round(p.food) + '%'; $('warmfill').style.height = Math.round(p.warm) + '%';
        $('hpfill').parentNode.classList.toggle('low', p.hp < 30); $('foodfill').parentNode.classList.toggle('low', p.food < 25); $('warmfill').parentNode.classList.toggle('low', p.warm < 30);
        $('status').innerHTML = '<b>第 ' + this.day() + ' 日</b> &nbsp;' + this.shichen() + ' ' + (this.daylight() > 0.5 ? '日' : '月') + ' &nbsp;·&nbsp; ' + w.tideName() + ' &nbsp;·&nbsp; ' + G.biomeName(w.get(p.x, p.y)) + ' &nbsp;·&nbsp; <span class="dim">(' + p.x + ', ' + p.y + ')</span>';
      }
      let s;
      if (this.combine) s = '在「' + this.combine.name + '」上寫什麼？按數字選字（<kbd>Esc</kbd> 取消）';
      else {
        const ch = w.get(t.x, t.y), d = DB[ch], e = this.ents.at(t.x, t.y);
        const plc = w.placeAt(t.x, t.y);
        if (plc) s = '「' + plc.name + '」 · <kbd>E</kbd> 讀';
        else if (e && (e.type === '日' || e.type === '月')) s = '面前有「' + e.type + '」在閃動 · <kbd>E</kbd> 吸取';
        else if (e && e.type === '丶') s = '一點墨 · <kbd>E</kbd> 拾取';
        else if (e && e.cage > 0) s = '被困的「' + e.type + '」 · <kbd>E</kbd> 收入囊中';
        else if (e && e.type === '龍') s = '你的龍。';
        else if (e) s = '「' + e.type + '」 · <kbd>E</kbd> ' + (e.type === '魚' ? '捉' : e.type === '鳥' ? '驚' : this.has('石刀') ? '獵' : '徒手不可獵');
        else if (ch === '碑') s = '一塊古碑 · <kbd>E</kbd> 讀碑';
        else if (ch === '囊') s = '落下的囊 · <kbd>E</kbd> 取回';
        else if (ch === '漁') s = '魚梁 · <kbd>E</kbd> 取魚' + (w.time < (w.weirs.get(U.key(t.x, t.y)) || 0) ? '（魚還沒來）' : '');
        else {
          s = '面前：' + (ch === '白' ? '白紙' : '<b>' + ch + '</b>（' + d.s + '畫）') + (w.isBurning(t.x, t.y) ? ' <i class="fire">燃燒中</i>' : '') + (ch === '灶' ? (w.stoveLit(t.x, t.y) ? ' <i class="fire">火旺</i>' : ' <i>冷灶</i>') : '');
          if (d.absorb) s += ' · <kbd>E</kbd> 取';
          if (p.row === 'dict') {
            const sel = this.selected();
            if (sel) { const r = this.evalWrite(sel, t.x, t.y, false); s += r.ok ? ' · <kbd>F</kbd> 寫「' + sel + '」→ <b>' + r.result + '</b>（−' + r.cost + '墨）' : ' · <kbd>F</kbd> 寫「' + sel + '」：<i>' + (r.msg || '不可') + '</i>'; }
          } else {
            const it = this.selectedItem();
            if (it) {
              let act = '放';
              if (ch === '灶') act = G.COOK[it] ? '烤' : (DB[it] && DB[it].flam > 0 ? '添柴' : '放');
              else if (DB[it] && DB[it].tile) { const r = this.evalWrite(it, t.x, t.y, true); act = r.ok ? '放 → ' + r.result : '<i>' + r.msg + '</i>'; }
              s += ' · 囊中「' + it + '」：<kbd>F</kbd> ' + act + ' · <kbd>V</kbd> 用 · <kbd>X</kbd> 研墨 · <kbd>C</kbd> 造詞';
            } else s += ' · 囊中空空';
          }
        }
        const here = w.get(p.x, p.y);
        if (here === '休' || DB[here].shelter) s += ' · <kbd>R</kbd> 休息';
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

    // ---------- 存檔：只記差異，世界從種子重新長出 ----------
    save() {
      const p = this.player;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 3, seed: this.seed, savedAt: Date.now(), world: this.world.serialize(), ents: this.ents.serialize(),
          player: { x: p.x, y: p.y, fx: p.fx, fy: p.fy, ink: p.ink, maxInk: p.maxInk, known: p.known, sel: p.sel, home: p.home, readSteles: p.readSteles,
            hp: p.hp, food: p.food, warm: p.warm, bag: p.bag, torchT: p.torchT, deaths: p.deaths, places: p.places, creatures: p.creatures, raftTaken: p.raftTaken, finished: p.finished }, stats: this.stats }));
      } catch (err) { /* 隱私模式等情況下存不了，就算了 */ }
    }
    load(s) {
      const p = this.player;
      this.world.restore(s.world || {});
      this.ents.restore(s.ents);
      const sp = s.player || {};
      for (const k of ['x', 'y', 'fx', 'fy', 'ink', 'maxInk', 'known', 'sel', 'home', 'readSteles', 'hp', 'food', 'warm', 'bag', 'torchT', 'deaths', 'places', 'creatures', 'raftTaken', 'finished']) if (sp[k] !== undefined) p[k] = sp[k];
      p.rx = p.x; p.ry = p.y; p.moveT = 0;
      if (!p.known || !p.known.length) p.known = G.START_KNOWN.slice();
      for (const ch of G.START_KNOWN) if (p.known.indexOf(ch) < 0) p.known.push(ch);
      Object.assign(this.stats, s.stats || {});
    }
    static readSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 3 ? s : null; } catch (e) { return null; } }
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
      game.toast('寫意', '取字入囊，寫字成物。按 H 查看造字之法。', 6000);
      setTimeout(() => { if (game) game.toast('聽說島上有一座塔', '從塔上能看見整張紙。黃昏時跟著鳥走。', 8000); }, 4000);
      window.addEventListener('beforeunload', () => game.save());
      document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
    };
    const seedInput = $('seed');
    seedInput.value = q.get('seed') || String(Math.floor(Math.random() * 1e6));
    if (save) { $('btn-continue').classList.remove('hidden'); $('save-info').textContent = '上次的島 #' + save.seed + '，第 ' + (Math.floor((save.world.time || 0) / DAY) + 1) + ' 日，已學 ' + (save.player.known || []).length + ' 字'; }
    $('btn-continue').addEventListener('click', () => start(save.seed, true));
    $('btn-new').addEventListener('click', () => { Game.clearSave(); let s = parseInt(seedInput.value, 10); if (isNaN(s)) s = Array.from(seedInput.value).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7); start(s, false); });
    $('btn-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
    $('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
    if (q.get('autostart')) { Game.clearSave(); start(parseInt(q.get('seed') || '42', 10), false); }
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
