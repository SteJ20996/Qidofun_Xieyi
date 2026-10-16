// pad.js —— 手柄：瀏覽器 Gamepad API。沒開面板時照 Nintendo 布局（A 右、B 下、X 上、Y 左）把手柄對應成鍵盤事件丟給遊戲；
// 面板開著時十字鍵／左搖桿移焦點、A 按下、B 關掉；對應不是標準的手柄用「手柄對應」精靈學一遍，存在 localStorage xieyi.pad（按手柄的 id 各存各的）
(function () {
  'use strict';
  const STORE_KEY = 'xieyi.pad';
  const BTN = ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', 'MINUS', 'PLUS', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
  const STD = { A: 1, B: 0, X: 3, Y: 2, L: 4, R: 5, ZL: 6, ZR: 7, MINUS: 8, PLUS: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };   // W3C 標準對應：0 下 1 右 2 左 3 上，Nintendo 布局就是 B A Y X
  const STD_AXES = { lx: [0, 1], ly: [1, 1], rx: [2, 1], ry: [3, 1] };   // [軸的索引, 正負]：往右、往下是正
  // 沒開面板時各鍵做什麼：丟鍵盤事件給遊戲；hold 的鍵按著不放（取、攻擊按住連取）
  const ACTIONS = { A: { code: 'KeyE', hold: true }, B: { code: 'Escape' }, X: { code: 'KeyF' }, Y: { code: 'KeyV' }, L: { code: 'KeyQ' }, R: { code: 'Tab' }, ZL: { code: 'KeyP' }, ZR: { code: 'KeyE', hold: true }, MINUS: { code: 'KeyM' }, PLUS: { code: 'KeyC' }, L3: { code: 'KeyJ' }, R3: { code: 'KeyR' } };
  const DIR_CODE = { UP: 'KeyW', DOWN: 'KeyS', LEFT: 'KeyA', RIGHT: 'KeyD' };
  const PANELS = ['dead', 'warn', 'fogask', 'seaask', 'padmap', 'voyage', 'pause', 'read', 'chest', 'stove', 'craft', 'map', 'journal', 'help', 'start'];   // 由上到下，先找到誰就是最上面那層
  const TOGGLES = { PLUS: 1, MINUS: 1, L3: 1 };   // 面板開著時仍照丟的鍵（C、M、J 都是開關）
  const DEAD = 0.4, REPEAT0 = 350, REPEAT = 120, STICK_REPEAT = 260;
  const STEPS = [['A', 'A（右邊那顆）'], ['B', 'B（下面那顆）'], ['X', 'X（上面那顆）'], ['Y', 'Y（左邊那顆）'], ['L', 'L（左肩）'], ['R', 'R（右肩）'], ['ZL', 'ZL（左扳機）'], ['ZR', 'ZR（右扳機）'], ['MINUS', '－'], ['PLUS', '＋'], ['L3', '左搖桿按下去'], ['R3', '右搖桿按下去'], ['UP', '十字鍵上'], ['DOWN', '十字鍵下'], ['LEFT', '十字鍵左'], ['RIGHT', '十字鍵右'], ['lx', '左搖桿往右推到底'], ['ly', '左搖桿往下推到底'], ['rx', '右搖桿往右推到底'], ['ry', '右搖桿往下推到底']];
  const $ = (id) => document.getElementById(id);
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const isDown = (b) => !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);

  const PAD = {
    enabled: true, seen: false, id: '', index: -1, map: Object.assign({}, STD), axes: JSON.parse(JSON.stringify(STD_AXES)), custom: false, standard: true,
    down: {}, dirHeld: {}, heldCodes: {}, focus: null, focusIdx: -1, lastPanel: null, rep: { dir: null, at: 0 }, stick: { dir: 0, at: 0 }, learning: null, lastGp: null,
    // ---------- 自訂對應的存取 ----------
    allCustom() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; } },
    customFor(id) { return this.allCustom()[id] || null; },
    saveFor(id, m) { try { const all = this.allCustom(); all[id] = m; localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } },
    forgetFor(id) { try { const all = this.allCustom(); delete all[id]; localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } },
    use(gp) {               // 換了手柄：有自訂對應就用，沒有就用標準的
      this.id = gp.id; this.index = gp.index; this.standard = gp.mapping === 'standard';
      const c = this.customFor(gp.id);
      this.map = c ? Object.assign({}, STD, c.buttons) : Object.assign({}, STD);
      this.axes = c ? Object.assign(JSON.parse(JSON.stringify(STD_AXES)), c.axes) : JSON.parse(JSON.stringify(STD_AXES));
      this.custom = !!c; this.down = {};
    },
    useStandard() { this.forgetFor(this.id); this.map = Object.assign({}, STD); this.axes = JSON.parse(JSON.stringify(STD_AXES)); this.custom = false; this.note('手柄對應', '改回標準對應。'); },
    pressed(gp, name) { const i = this.map[name]; return i !== undefined && i >= 0 ? isDown(gp.buttons[i]) : false; },
    axis(gp, name) { const a = this.axes[name]; if (!a) return 0; const v = gp.axes[a[0]]; return typeof v === 'number' ? v * a[1] : 0; },
    note(title, body) {
      const g = window.XIEYI && window.XIEYI.game;
      if (g && g.toast) g.toast(title, body, 7000);
      const h = $('new-hint'); if (h && !$('start').classList.contains('hidden')) h.textContent = title + '：' + body;
    },
    // ---------- 每幀 ----------
    gamepad() {
      let gps; try { gps = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { this.enabled = false; return null; }
      if (!gps) return null;
      let gp = null;
      for (const g of gps) { if (!g || g.connected === false) continue; if (g.id === this.id && g.index === this.index) return g; if (!gp) gp = g; }
      return gp;
    },
    poll(now) {
      const gp = this.gamepad();
      if (!gp) { if (this.seen) { this.releaseAll(); } this.lastGp = null; return; }
      this.lastGp = gp;
      if (gp.id !== this.id || gp.index !== this.index) this.use(gp);
      const any = gp.buttons.some(isDown) || gp.axes.some(v => Math.abs(v) > 0.6);   // 瀏覽器本來就要按過鍵才把手柄給頁面；第一次有動靜才算連上
      if (!this.seen) { if (!any) return; this.seen = true; this.onConnect(gp); }
      if (this.learning) { this.learnStep(gp); return; }
      const st = {}; for (const n of BTN) st[n] = this.pressed(gp, n);
      const lx = this.axis(gp, 'lx'), ly = this.axis(gp, 'ly'), rx = this.axis(gp, 'rx');
      let dir = null;   // 方向：十字鍵優先，再看左搖桿的主軸
      if (st.UP) dir = 'UP'; else if (st.DOWN) dir = 'DOWN'; else if (st.LEFT) dir = 'LEFT'; else if (st.RIGHT) dir = 'RIGHT';
      else if (Math.abs(lx) > DEAD || Math.abs(ly) > DEAD) dir = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'RIGHT' : 'LEFT') : (ly > 0 ? 'DOWN' : 'UP');
      const panel = this.panel();
      if (panel) { this.holdDirs(null); this.navigate(panel, dir, now); }
      else {
        this.clearFocus(); this.holdDirs(dir);
        const sd = Math.abs(rx) > 0.6 ? (rx > 0 ? 1 : -1) : 0;   // 右搖桿左右：換囊格，按著會連跳
        if (sd !== this.stick.dir) { this.stick.dir = sd; this.stick.at = now + REPEAT0; if (sd) this.tap(sd > 0 ? 'Tab' : 'KeyQ'); }
        else if (sd && now >= this.stick.at) { this.stick.at = now + STICK_REPEAT; this.tap(sd > 0 ? 'Tab' : 'KeyQ'); }
      }
      for (const n of BTN) {   // 按鍵：按下那一幀觸發，放開時放掉按著的鍵
        if (DIR_CODE[n]) continue;
        const was = !!this.down[n], is = st[n]; this.down[n] = is;
        if (is && !was) this.press(n, panel); else if (!is && was) this.release(n);
      }
    },
    onConnect(gp) {
      const name = (gp.id || '手柄').replace(/\s*\(.*$/, '').slice(0, 40);
      if (!this.standard && !this.custom) { this.note('手柄已連上', name + '。這支手柄的對應不是標準的，先學一遍。'); this.learn(); }
      else this.note('手柄已連上', name + (this.custom ? '（用你學過的對應）' : '') + '。A 取、B 關、X 放、Y 用、L／R 換囊格、ZL 換工具、＋製作、－地圖。幫助裡可以重學對應。');
    },
    tap(code) { key('keydown', code); key('keyup', code); },
    press(n, panel) {
      const act = ACTIONS[n]; if (!act) return;
      if (panel) {
        if (n === 'A') { if (this.focus && document.contains(this.focus)) this.activate(this.focus); else this.tap('Enter'); return; }
        if (n === 'B') { this.tap('Escape'); return; }
        if (TOGGLES[n]) this.tap(act.code);
        return;
      }
      key('keydown', act.code);
      if (act.hold) this.heldCodes[n] = act.code; else key('keyup', act.code);
    },
    release(n) { const c = this.heldCodes[n]; if (c) { delete this.heldCodes[n]; key('keyup', c); } },
    releaseAll() { this.holdDirs(null); for (const n in this.heldCodes) this.release(n); this.down = {}; this.clearFocus(); },
    holdDirs(dir) {
      for (const d in DIR_CODE) {
        const want = d === dir;
        if (want && !this.dirHeld[d]) { this.dirHeld[d] = true; key('keydown', DIR_CODE[d]); }
        else if (!want && this.dirHeld[d]) { delete this.dirHeld[d]; key('keyup', DIR_CODE[d]); }
      }
    },
    // ---------- 面板裡：移焦點、按下 ----------
    panel() { for (const id of PANELS) { const el = $(id); if (el && !el.classList.contains('hidden')) return el; } return null; },
    candidates(panel) {
      return Array.from(panel.querySelectorAll('button, .slot, .save-card')).filter(el => !el.disabled && !el.classList.contains('hidden') && !(el.classList.contains('slot') && el.classList.contains('empty')) && el.offsetParent !== null && el.getClientRects().length);   // 空的囊格不算，空的存檔格要算（選它落筆）
    },
    firstOf(cs) { return cs.find(el => el.classList.contains('on')) || cs[0] || null; },
    navigate(panel, dir, now) {
      const cs = this.candidates(panel);
      if (panel !== this.lastPanel) { this.lastPanel = panel; this.rep.dir = null; this.setFocus(this.firstOf(cs), cs); }
      else if (!this.focus || !cs.includes(this.focus)) this.setFocus(cs[Math.min(Math.max(this.focusIdx, 0), cs.length - 1)] || this.firstOf(cs), cs);   // 面板重畫了：焦點停在原來的位置
      if (!dir) { this.rep.dir = null; return; }
      if (this.rep.dir === dir) { if (now < this.rep.at) return; this.rep.at = now + REPEAT; }
      else { this.rep.dir = dir; this.rep.at = now + REPEAT0; }
      const next = this.neighbour(cs, this.focus, dir); if (next) this.setFocus(next, cs);
    },
    neighbour(cs, from, dir) {
      const others = cs.filter(el => el !== from); if (!from || !others.length) return others[0] || null;
      const r = from.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      let best = null, bd = Infinity;
      for (const el of others) {
        const q = el.getBoundingClientRect(), dx = (q.left + q.right) / 2 - cx, dy = (q.top + q.bottom) / 2 - cy;
        let p, o;
        if (dir === 'LEFT') { p = -dx; o = dy; } else if (dir === 'RIGHT') { p = dx; o = dy; } else if (dir === 'UP') { p = -dy; o = dx; } else { p = dy; o = dx; }
        if (p <= 4) continue;
        const d = p + Math.abs(o) * 2.5; if (d < bd) { bd = d; best = el; }
      }
      return best;
    },
    setFocus(el, cs) {
      if (this.focus && this.focus !== el) this.focus.classList.remove('padfocus');
      this.focus = el || null;
      if (el) { el.classList.add('padfocus'); this.focusIdx = cs ? cs.indexOf(el) : -1; if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    },
    clearFocus() { if (this.focus) this.focus.classList.remove('padfocus'); this.focus = null; this.lastPanel = null; this.rep.dir = null; },
    activate(el) {
      if (el.classList.contains('slot')) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      else el.click();
    },
    // ---------- 學對應：一顆一顆按，搖桿往右往下推 ----------
    learn() {
      this.releaseAll();
      this.learning = { i: 0, buttons: {}, axes: {}, idle: false };
      $('padmap').classList.remove('hidden'); this.renderLearn();
    },
    renderLearn() {
      const L = this.learning; if (!L) return;
      const [, label] = STEPS[L.i];
      const done = STEPS.slice(0, L.i).map(([n, l]) => l.replace(/（.*$/, '') + '＝' + (n.length === 2 && 'lxlyrxry'.indexOf(n) >= 0 ? (L.axes[n] ? '軸 ' + L.axes[n][0] : '略') : (L.buttons[n] >= 0 ? '鍵 ' + L.buttons[n] : '略'))).join('、');
      $('padmap-text').innerHTML = '第 ' + (L.i + 1) + '／' + STEPS.length + ' 步：請按 <b>' + label + '</b>' + (L.i ? '<br><span class="dim small">已記：' + done + '</span>' : '');
    },
    learnStep(gp) {
      const L = this.learning, [name] = STEPS[L.i], isAxis = name.length === 2 && 'lxlyrxry'.indexOf(name) >= 0;
      const pressedNow = []; gp.buttons.forEach((b, i) => { if (isDown(b)) pressedNow.push(i); });
      const hot = []; gp.axes.forEach((v, i) => { if (Math.abs(v) > 0.6) hot.push(i); });
      if (!L.idle) { if (!pressedNow.length && !hot.length) L.idle = true; return; }   // 上一步的鍵放開、搖桿回中之後才收下一個
      if (isAxis) { if (!hot.length) return; const i = hot[0]; L.axes[name] = [i, gp.axes[i] > 0 ? 1 : -1]; }
      else { const i = pressedNow.find(k => !Object.values(L.buttons).includes(k)); if (i === undefined) return; L.buttons[name] = i; }
      this.learnAdvance();
    },
    learnSkip() { const L = this.learning; if (!L) return; const [name] = STEPS[L.i]; if (name.length === 2 && 'lxlyrxry'.indexOf(name) >= 0) delete L.axes[name]; else L.buttons[name] = -1; this.learnAdvance(); },
    learnAdvance() {
      const L = this.learning; L.idle = false; L.i++;
      if (L.i < STEPS.length) { this.renderLearn(); return; }
      this.map = Object.assign({}, STD, L.buttons); this.axes = Object.assign(JSON.parse(JSON.stringify(STD_AXES)), L.axes); this.custom = true;
      this.saveFor(this.id, { buttons: L.buttons, axes: L.axes });
      this.learning = null; $('padmap').classList.add('hidden'); this.down = {};
      this.note('手柄對應存好了', '以後這支手柄都用這套。幫助裡可以重學或改回標準。');
    },
    learnCancel() { this.learning = null; $('padmap').classList.add('hidden'); this.down = {}; },
    bind() {
      if ($('padmap-skip')) $('padmap-skip').addEventListener('click', () => this.learnSkip());
      if ($('padmap-cancel')) $('padmap-cancel').addEventListener('click', () => this.learnCancel());
      if ($('padmap-std')) $('padmap-std').addEventListener('click', () => { this.learnCancel(); this.useStandard(); });
      if ($('help-pad')) $('help-pad').addEventListener('click', () => { $('help').classList.add('hidden'); if (!this.seen) { this.note('還沒看到手柄', '先按一下手柄上的任一鍵，瀏覽器才會把它交給遊戲。'); return; } this.learn(); });
      window.addEventListener('keydown', (ev) => { if (!this.learning) return; if (ev.code === 'Escape') this.learnCancel(); else if (ev.code === 'Space') this.learnSkip(); ev.preventDefault(); ev.stopImmediatePropagation(); }, true);
    },
    loop() {
      const tick = (t) => { if (this.enabled && !document.hidden) { try { this.poll(t); } catch (e) { /* 手柄壞了也別把遊戲拖垮 */ } } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    },
  };
  window.PAD = PAD;
  window.addEventListener('DOMContentLoaded', () => { PAD.bind(); PAD.loop(); });
})();
