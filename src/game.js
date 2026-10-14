// game.js —— 主循环、输入、玩家动作（吸墨 / 写字 / 合字 / 读碑 / 休息）、HUD、存档
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB;
  const SAVE_KEY = 'xieyi.save.v1';
  const DAY = 240;                                  // 一昼夜 = 240 秒
  const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';
  const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const $ = (id) => document.getElementById(id);

  class Game {
    constructor(seed, save) {
      this.seed = seed | 0;
      this.world = new World(this.seed);
      this.ents = new Entities(this.world);
      this.renderer = new Renderer($('world'), $('minimap'));
      this.player = { x: 0, y: 0, rx: 0, ry: 0, fx: 0, fy: 1, fromX: 0, fromY: 0, moveT: 0, stepDur: 0.2,
        ink: 20, maxInk: 60, known: G.START_KNOWN.slice(), sel: 1, page: 0, home: null, readSteles: [] };
      this.stats = { absorbed: 0, written: 0, fused: 0, learned: 0 };
      this.keys = new Set();
      this.action = null;
      this.fx = [];
      this.paused = true;
      this.saveAcc = 0;
      this.last = 0;
      this.msgText = ''; this.hudSig = ''; this.barSig = '';
      if (save) this.load(save);
      else { const sp = this.world.findSpawn(); this.player.x = this.player.rx = sp.x; this.player.y = this.player.ry = sp.y; }
      this.bindInput();
      this.buildHotbar();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------- 昼夜 ----------
    dayT() { return (this.world.time % DAY) / DAY; }              // 0 日出, 0.25 正午, 0.5 日落, 0.75 子夜
    daylight() { const t = this.dayT(); return U.smoothstep(-0.04, 0.08, t) * (1 - U.smoothstep(0.46, 0.58, t)); }
    darkness() { return 1 - this.daylight(); }
    shichen() { const hour = (6 + this.dayT() * 24) % 24; return SHICHEN[Math.floor(((hour + 1) % 24) / 2)] + '时'; }

    // ---------- 主循环 ----------
    frame(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000 || 0.016); this.last = ts;
      if (!this.paused) this.update(dt);
      this.renderer.draw(this, dt, ts / 1000);
      requestAnimationFrame((t) => this.frame(t));
    }
    update(dt) {
      const p = this.player;
      this.world.tick(dt, p.x, p.y);
      this.handleMove(dt);
      this.updateAction(dt);
      this.ents.update(dt, this);
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t >= f.dur) this.fx.splice(i, 1); }
      this.saveAcc += dt; if (this.saveAcc > 20) { this.saveAcc = 0; this.save(); }
      this.updateHUD();
    }

    // ---------- 移动：格子制 + 平滑插值 ----------
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
      if (!w.walkable(nx, ny) || this.ents.beastAt(nx, ny)) return false;
      if (dx && dy && !(w.walkable(p.x + dx, p.y) && w.walkable(p.x, p.y + dy))) return false; // 不许卡着角过
      p.fromX = p.x; p.fromY = p.y; p.x = nx; p.y = ny;
      p.stepDur = (0.17 / w.info(nx, ny).walk) * (dx && dy ? 1.3 : 1);
      p.moveT = p.stepDur;
      return true;
    }
    onArrive() {
      const p = this.player, e = this.ents.at(p.x, p.y);
      if (e && e.type === '丶') this.collect(e);
    }
    facing() { return { x: this.player.x + this.player.fx, y: this.player.y + this.player.fy }; }

    // ---------- 吸墨 ----------
    pressAbsorb(silent) {
      if (this.action) return;
      const p = this.player, t = this.facing(), e = this.ents.at(t.x, t.y);
      if (e && (e.type === '日' || e.type === '月' || e.type === '丶')) { this.collect(e); return; }
      const ch = this.world.get(t.x, t.y), d = DB[ch];
      if (ch === '碑') { this.readStele(t); return; }
      if (!d.absorb) { if (!silent) this.message(ch === '白' ? '白纸无墨可吸' : '这里没有可吸的墨'); return; }
      if (p.ink >= p.maxInk) { if (!silent) this.message('砚台已满，先写点什么吧'); return; }
      this.action = { type: 'absorb', x: t.x, y: t.y, ch, t: 0, dur: 0.15 + 0.07 * d.s };
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
      const p = this.player, d = DB[a.ch];
      this.world.set(a.x, a.y, '白'); this.world.extinguish(a.x, a.y);
      const gain = Math.min(d.s, p.maxInk - p.ink);
      p.ink += gain; this.stats.absorbed++;
      this.fx.push({ type: 'float', x: a.x, y: a.y, text: '+' + d.s, color: G.INK.black, t: 0, dur: 0.9 });
      this.learn(a.ch);
      SFX.absorb();
      this.action = null;
      if (this.keys.has('KeyE') || this.keys.has('Space')) this.pressAbsorb(true);   // 按住 E 可以连续吸
    }
    collect(e) {
      const p = this.player;
      this.ents.remove(e);
      if (e.type === '丶') { p.ink = Math.min(p.maxInk, p.ink + e.ink); this.fx.push({ type: 'float', x: e.x, y: e.y, text: '+' + e.ink, t: 0, dur: 0.9 }); return; }
      p.ink = Math.min(p.maxInk, p.ink + 4);
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '+4', color: G.INK.red, t: 0, dur: 1 });
      this.message(e.type === '月' ? '你从水里捞起了月亮。' : '你从沙上拾起了一片日光。');
      this.learn(e.type);
    }

    // ---------- 写字 ----------
    selected() { return this.player.known[this.player.sel]; }
    // 判定：这个字写在这个格子上会发生什么
    evalWrite(ch, x, y) {
      const w = this.world, base = w.get(x, y), bd = DB[base], wd = DB[ch];
      const e = this.ents.beastAt(x, y);
      if (ch === '口' && e && e.cage <= 0) return { ok: true, mode: 'cage', cost: wd.s, result: '囚', msg: '「口」困住了「' + e.type + '」' };
      if (ch === '水' && bd.kind !== 'fire' && w.isBurning(x, y)) return { ok: true, mode: 'douse', cost: wd.s, result: base, msg: '水灭了「' + base + '」上的火' };
      const f = G.FUSE.get(base + ch);
      if (f) return { ok: true, mode: 'fuse', cost: G.writeCost(ch, base, f.result), result: f.result, msg: f.msg };
      if (ch === '火' && bd.flam > 0 && !w.isBurning(x, y)) return { ok: true, mode: 'ignite', cost: wd.s, result: base, msg: '火焚「' + base + '」' };
      if (base === '白') {
        if (!wd.tile) return { ok: false, msg: G.failReason(base, ch) || '「' + ch + '」不能单独成物' };
        return { ok: true, mode: 'blank', cost: wd.s, result: ch, msg: '写下「' + ch + '」' };
      }
      return { ok: false, msg: G.failReason(base, ch) };
    }
    pressWrite() {
      const ch = this.selected(); if (!ch) return;
      const p = this.player, t = this.facing(), r = this.evalWrite(ch, t.x, t.y);
      if (!r.ok) { this.message(r.msg); this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 }); SFX.fail(); return; }
      if (p.ink < r.cost) { this.message('墨不够：需要 ' + r.cost + '，只有 ' + Math.floor(p.ink)); this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 }); SFX.fail(); return; }
      p.ink -= r.cost; this.stats.written++;
      const w = this.world;
      if (r.mode === 'cage') { this.ents.beastAt(t.x, t.y).cage = 30; }
      else if (r.mode === 'ignite') { w.ignite(t.x, t.y, 1); }
      else if (r.mode === 'douse') { w.extinguish(t.x, t.y); this.message(r.msg); }
      else {
        const base = w.get(t.x, t.y);
        w.set(t.x, t.y, r.result);
        if (DB[r.result].kind === 'fire') w.ignite(t.x, t.y);
        if (r.mode === 'fuse') { this.stats.fused++; this.message(r.msg + '：' + base + ' + ' + ch + ' = ' + r.result); this.learn(r.result); SFX.fuse(); }
        if (r.result === '休') { p.home = { x: t.x, y: t.y }; this.save(); }
      }
      if (this.action) this.action = null;
      SFX.write();
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: r.mode === 'cage' ? '口' : (r.result || ch), color: DB[r.result] ? DB[r.result].ink : G.INK.black, t: 0, dur: 0.35 });
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: '−' + r.cost, color: G.INK.red, t: 0, dur: 0.9 });
      this.buildHotbar();
    }

    // ---------- 学字、读碑、休息、虎 ----------
    learn(ch) {
      const p = this.player;
      if (!DB[ch] || !DB[ch].learn || p.known.indexOf(ch) >= 0) return;
      p.known.push(ch); this.stats.learned++; SFX.learn();
      this.toast('习得新字「' + ch + '」', DB[ch].flavor);
      this.buildHotbar();
    }
    readStele(t) {
      const p = this.player, hint = this.world.steleHint(t.x, t.y), k = U.key(t.x, t.y);
      if (!hint) return;
      if (p.readSteles.indexOf(k) < 0) { p.readSteles.push(k); p.maxInk = Math.min(240, p.maxInk + 10); this.toast('读碑有得', '砚台宽了十分（墨量上限 ' + p.maxInk + '）'); }
      this.toast('碑文', hint, 9000);
    }
    sleep() {
      const p = this.player;
      if (this.world.get(p.x, p.y) !== '休') { this.message('只有站在「休」上才能休息'); return; }
      const t = this.dayT();
      if (t > 0.08 && t < 0.5) { this.message('白日不眠。'); return; }
      this.world.time += (t > 0.5 ? (1 - t) : -t) * DAY + 0.02 * DAY;
      for (let i = 0; i < 80; i++) this.world.step(p.x, p.y);  // 让火烧完、灰化土
      p.ink = Math.min(p.maxInk, p.ink + 8);
      this.ents.list = this.ents.list.filter(e => e.type !== '虎');
      this.toast('一夜无梦', '天亮了。');
      this.save();
    }
    tigerAttack(e) {
      const p = this.player;
      this.renderer.shake = 0.5; SFX.tiger();
      if (p.ink < 1) { this.message('虎扑了过来——但你已无墨可失。'); return; }
      const lost = Math.max(3, Math.floor(p.ink * 0.3));
      p.ink -= lost;
      const n = Math.min(3, lost), each = Math.floor(lost / n), rest = lost - each * n;
      let placed = 0;
      for (let tries = 0; tries < 40 && placed < n; tries++) {
        const x = p.x + Math.floor(Math.random() * 7) - 3, y = p.y + Math.floor(Math.random() * 7) - 3;
        if (U.cheb(x, y, p.x, p.y) < 2 || !this.world.walkable(x, y) || this.ents.at(x, y)) continue;
        this.ents.add('丶', x, y, { ink: each + (placed === 0 ? rest : 0), life: 120 }); placed++;
      }
      this.toast('虎！', '你失了 ' + lost + ' 墨，墨点四散，可以再去拾回。');
    }

    // ---------- 输入 ----------
    bindInput() {
      window.addEventListener('keydown', (ev) => {
        if (ev.repeat && !DIRS[ev.code]) return;
        if (!$('start').classList.contains('hidden')) { if (ev.code === 'Enter') { ev.preventDefault(); $('btn-continue').classList.contains('hidden') ? $('btn-new').click() : $('btn-continue').click(); } return; }
        if (ev.code === 'KeyH' || ev.code === 'Escape') { $('help').classList.toggle('hidden', ev.code === 'Escape' ? true : undefined); ev.preventDefault(); return; }
        if (!$('help').classList.contains('hidden')) return;
        const p = this.player;
        if (DIRS[ev.code]) { this.keys.add(ev.code); ev.preventDefault(); return; }
        switch (ev.code) {
          case 'KeyE': case 'Space': this.keys.add(ev.code); this.pressAbsorb(); break;
          case 'KeyF': case 'Enter': this.pressWrite(); break;
          case 'KeyR': this.sleep(); break;
          case 'KeyM': $('minimap').classList.toggle('hidden'); break;
          case 'KeyN': this.message(SFX.toggle() ? '已静音' : '声音已开'); break;
          case 'BracketLeft': case 'KeyQ': this.cycle(-1); break;
          case 'BracketRight': case 'KeyZ': this.cycle(1); break;
          case 'Equal': case 'NumpadAdd': this.renderer.tile = Math.min(56, this.renderer.tile + 4); break;
          case 'Minus': case 'NumpadSubtract': this.renderer.tile = Math.max(28, this.renderer.tile - 4); break;
          default:
            if (/^Digit[1-9]$/.test(ev.code)) { const i = p.page * 9 + (+ev.code[5] - 1); if (i < p.known.length) { p.sel = i; this.buildHotbar(); } }
            else return;
        }
        ev.preventDefault();
      });
      window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
      window.addEventListener('blur', () => this.keys.clear());
      const cv = $('world');
      cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
      cv.addEventListener('mousedown', (ev) => {
        if (this.paused) return;
        const r = this.renderer, T = r.tile, p = this.player;
        const wx = Math.floor((ev.clientX - (r.w / 2 - r.camX * T)) / T), wy = Math.floor((ev.clientY - (r.h / 2 - r.camY * T)) / T);
        if (U.cheb(wx, wy, p.x, p.y) !== 1) { this.message('太远了，走近一点。'); return; }
        p.fx = wx - p.x; p.fy = wy - p.y;
        if (ev.button === 2) this.pressAbsorb(); else this.pressWrite();
      });
      cv.addEventListener('wheel', (ev) => { this.cycle(ev.deltaY > 0 ? 1 : -1); ev.preventDefault(); }, { passive: false });
    }
    cycle(d) { const p = this.player; p.sel = (p.sel + d + p.known.length) % p.known.length; p.page = Math.floor(p.sel / 9); this.buildHotbar(); }

    // ---------- HUD ----------
    buildHotbar() {
      const p = this.player, bar = $('hotbar'), t = this.facing();
      p.page = Math.min(p.page, Math.floor((p.known.length - 1) / 9));
      if (p.sel >= p.known.length) p.sel = 0;
      const sig = p.known.join('') + '|' + p.sel + '|' + p.page + '|' + p.known.length;
      if (sig !== this.barSig) {
        this.barSig = sig; bar.innerHTML = '';
        const start = p.page * 9;
        p.known.slice(start, start + 9).forEach((ch, i) => {
          const el = document.createElement('div');
          el.className = 'slot' + (start + i === p.sel ? ' sel' : '');
          el.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="ch">' + ch + '</span><span class="cost">' + DB[ch].s + '画</span>';
          el.title = DB[ch].flavor;
          el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); p.sel = start + i; this.buildHotbar(); });
          bar.appendChild(el);
        });
        if (p.known.length > 9) { const pg = document.createElement('div'); pg.className = 'page'; pg.textContent = (p.page + 1) + '/' + Math.ceil(p.known.length / 9) + '\n[ ]'; bar.appendChild(pg); }
      }
    }
    updateHUD() {
      const p = this.player, w = this.world, t = this.facing();
      // 墨量
      const pct = Math.round(100 * p.ink / p.maxInk);
      const sig = pct + '|' + Math.floor(p.ink) + '|' + p.maxInk + '|' + this.shichen() + '|' + p.x + ',' + p.y + '|' + w.get(p.x, p.y) + '|' + (this.daylight() > 0.5);
      if (sig !== this.hudSig) {
        this.hudSig = sig;
        $('inkfill').style.height = pct + '%';
        $('inklabel').textContent = '墨 ' + Math.floor(p.ink) + '/' + p.maxInk;
        $('status').innerHTML = '<b>' + this.shichen() + '</b> ' + (this.daylight() > 0.5 ? '日' : '月') + ' &nbsp;·&nbsp; ' + G.biomeName(w.get(p.x, p.y)) + ' &nbsp;·&nbsp; <span class="dim">(' + p.x + ', ' + p.y + ')</span>';
      }
      // 面前的提示
      const ch = w.get(t.x, t.y), d = DB[ch], e = this.ents.at(t.x, t.y), sel = this.selected();
      let s;
      if (e && (e.type === '日' || e.type === '月')) s = '面前有「' + e.type + '」在闪动 · <kbd>E</kbd> 吸取';
      else if (e && e.type === '丶') s = '一点墨 · <kbd>E</kbd> 拾取';
      else if (ch === '碑') s = '一块古碑 · <kbd>E</kbd> 读碑';
      else {
        s = '面前：' + (ch === '白' ? '白纸' : '<b>' + ch + '</b>（' + d.s + '画）') + (w.isBurning(t.x, t.y) ? ' <i class="fire">燃烧中</i>' : '');
        if (e) s += ' · 「' + e.type + '」' + (e.cage > 0 ? '（被困）' : '');
        if (d.absorb) s += ' · <kbd>E</kbd> 吸墨 +' + d.s;
        if (sel) { const r = this.evalWrite(sel, t.x, t.y); s += r.ok ? ' · <kbd>F</kbd> 写「' + sel + '」→ <b>' + r.result + '</b>（−' + r.cost + '墨）' : ' · <kbd>F</kbd> 写「' + sel + '」：<i>' + (r.msg || '不可') + '</i>'; }
      }
      if (w.get(p.x, p.y) === '休') s += ' · <kbd>R</kbd> 休息';
      if (this.msgUntil && performance.now() < this.msgUntil) s = this.msgText;
      if (s !== this.lastMsg) { this.lastMsg = s; $('msg').innerHTML = s; }
    }
    message(text) { this.msgText = '<i>' + text + '</i>'; this.msgUntil = performance.now() + 2200; this.lastMsg = null; }
    toast(title, body, ms) {
      const el = document.createElement('div'); el.className = 'toast';
      el.innerHTML = '<b>' + title + '</b>' + (body ? '<span>' + body + '</span>' : '');
      $('toasts').appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, ms || 4500);
    }

    // ---------- 存档：只记差异，世界从种子重新长出 ----------
    save() {
      const p = this.player;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, seed: this.seed, savedAt: Date.now(), world: this.world.serialize(), ents: this.ents.serialize(),
          player: { x: p.x, y: p.y, fx: p.fx, fy: p.fy, ink: p.ink, maxInk: p.maxInk, known: p.known, sel: p.sel, home: p.home, readSteles: p.readSteles }, stats: this.stats }));
      } catch (err) { /* 隐私模式等情况下存不了，就算了 */ }
    }
    load(s) {
      const p = this.player;
      this.world.restore(s.world || {});
      this.ents.restore(s.ents);
      Object.assign(p, s.player || {}); p.rx = p.x; p.ry = p.y; p.moveT = 0;
      if (!p.known || !p.known.length) p.known = G.START_KNOWN.slice();
      Object.assign(this.stats, s.stats || {});
    }
    static readSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 1 ? s : null; } catch (e) { return null; } }
    static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
  }

  // ---------- 启动画面 ----------
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
      game.toast('写意', '写木成木，写水成水。按 H 查看帮助。', 6000);
      window.addEventListener('beforeunload', () => game.save());
      document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
    };
    const seedInput = $('seed');
    seedInput.value = q.get('seed') || String(Math.floor(Math.random() * 1e6));
    if (save) { $('btn-continue').classList.remove('hidden'); $('save-info').textContent = '上次的世界 #' + save.seed + '，已学 ' + (save.player.known || []).length + ' 字'; }
    $('btn-continue').addEventListener('click', () => start(save.seed, true));
    $('btn-new').addEventListener('click', () => { Game.clearSave(); let s = parseInt(seedInput.value, 10); if (isNaN(s)) s = Array.from(seedInput.value).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7); start(s, false); });
    $('btn-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
    $('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
    if (q.get('autostart')) { Game.clearSave(); start(parseInt(q.get('seed') || '42', 10), false); }
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
