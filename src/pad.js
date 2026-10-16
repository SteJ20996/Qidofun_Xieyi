// pad.js —— 手柄：瀏覽器 Gamepad API。沒開面板時照 Nintendo 布局（A 右、B 下、X 上、Y 左）把手柄對應成鍵盤事件丟給遊戲；
// 面板開著時十字鍵／左搖桿移焦點、A 按下、B 關掉。對應不是標準的手柄用「手柄對應」精靈學一遍（v0.25 起另有「手柄設定」頁一個一個換），按手柄 id 存在 localStorage xieyi.pad。
// 第三方手柄的各種報法都吃：十字鍵是一根「帽子軸」（閒置 3.29 或 0，八個位置各一個值）、扳機是軸、搖桿是四顆按鍵、搖桿幅度只有一半、閒置不在 0。
// 每個鍵的綁法：鍵號（number）、軸上的一個值 {ax, at}（連同該軸閒置值 rest 判定）、-1 沒有；搖桿：[軸號, 正負] 或 {pos: 鍵號, neg: 鍵號}。
(function () {
  'use strict';
  const STORE_KEY = 'xieyi.pad';
  const BTN = ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', 'MINUS', 'PLUS', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
  const STD = { A: 1, B: 0, X: 3, Y: 2, L: 4, R: 5, ZL: 6, ZR: 7, MINUS: 8, PLUS: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };   // W3C 標準對應：0 下 1 右 2 左 3 上，Nintendo 布局就是 B A Y X
  const STD_AXES = { lx: [0, 1], ly: [1, 1], rx: [2, 1], ry: [3, 1] };   // [軸的索引, 正負]：往右、往下是正
  const STICKS = { lx: 1, ly: 1, rx: 1, ry: 1 };
  const STICK_NEG = { lx: ['lx-', '左搖桿往左推到底'], ly: ['ly-', '左搖桿往上推到底'], rx: ['rx-', '右搖桿往左推到底'], ry: ['ry-', '右搖桿往上推到底'] };   // 搖桿若是按鍵，再問反方向
  // 沒開面板時各鍵做什麼：丟鍵盤事件給遊戲；hold 的鍵按著不放（取、攻擊按住連取）
  const ACTIONS = { A: { code: 'KeyE', hold: true }, B: { code: 'Escape' }, X: { code: 'KeyF' }, Y: { code: 'KeyV' }, L: { code: 'KeyQ' }, R: { code: 'Tab' }, ZL: { code: 'KeyP' }, ZR: { code: 'KeyE', hold: true }, MINUS: { code: 'KeyM' }, PLUS: { code: 'KeyC' }, L3: { code: 'KeyJ' }, R3: { code: 'KeyR' } };
  const DIR_CODE = { UP: 'KeyW', DOWN: 'KeyS', LEFT: 'KeyA', RIGHT: 'KeyD' };
  const DIR_NAME = { UP: '上', DOWN: '下', LEFT: '左', RIGHT: '右' };
  const PANELS = ['dead', 'warn', 'takeask', 'fogask', 'seaask', 'padmap', 'padset', 'help', 'voyage', 'pause', 'read', 'chest', 'stove', 'craft', 'map', 'journal', 'start'];   // 由上到下，先找到誰就是最上面那層
  const TOGGLES = { PLUS: 1, MINUS: 1, L3: 1 };   // 面板開著時仍照丟的鍵（C、M、J 都是開關）
  const MAP_VERSION = 3;   // v0.23：存的對應帶版本，舊版學到的（可能學錯的）一律不用，重新來過
  const STILL = 0.05, CALM_MS = 220, NOISY_MS = 1500;   // 精靈每一步開始前：各軸 0.22 息內晃動不到 0.05 才算靜下來；一點五息都靜不下來的軸當雜訊（體感、陀螺儀）不看
  const DEAD = 0.4, MOVE = 0.3, AXIS_MIN = 0.12, TINY = 0.03, HOLD_MS = 1200, REPEAT0 = 350, REPEAT = 120, STICK_REPEAT = 260, HAT_TOL = 0.3, LOST_FRAMES = 90;   // MOVE：搖桿算推動的門檻；AXIS_MIN：鍵那步收軸的門檻（帽子軸的某些位置離閒置只有 0.14）；TINY／HOLD_MS：搖桿幅度很小時，按住一秒多就收變化最大的那根軸
  const STEPS = [['A', 'A（右邊那顆）'], ['B', 'B（下面那顆）'], ['X', 'X（上面那顆）'], ['Y', 'Y（左邊那顆）'], ['L', 'L（左肩）'], ['R', 'R（右肩）'], ['ZL', 'ZL（左扳機）'], ['ZR', 'ZR（右扳機）'], ['MINUS', '－'], ['PLUS', '＋'], ['L3', '左搖桿按下去'], ['R3', '右搖桿按下去'], ['UP', '十字鍵上'], ['DOWN', '十字鍵下'], ['LEFT', '十字鍵左'], ['RIGHT', '十字鍵右'], ['lx', '左搖桿往右推到底'], ['ly', '左搖桿往下推到底'], ['rx', '右搖桿往右推到底'], ['ry', '右搖桿往下推到底']];
  // 手柄設定頁（v0.25）：二十個鍵位一列一個，寫名稱與遊戲裡做什麼；點「設定」再按那顆就換
  const ENTRY_NAME = { A: 'A', B: 'B', X: 'X', Y: 'Y', L: 'L', R: 'R', ZL: 'ZL', ZR: 'ZR', MINUS: '－', PLUS: '＋', L3: 'L3（左搖桿按下）', R3: 'R3（右搖桿按下）', UP: '十字鍵上', DOWN: '十字鍵下', LEFT: '十字鍵左', RIGHT: '十字鍵右', lx: '左搖桿左右', ly: '左搖桿上下', rx: '右搖桿左右', ry: '右搖桿上下' };
  const ENTRY_DOES = { A: '取／攻擊（按住連取）；面板裡按下', B: '關面板／暫停', X: '放（F）', Y: '吃喝、用（V）', L: '囊裡上一格', R: '囊裡下一格', ZL: '換工具', ZR: '攻擊（同 A）', MINUS: '地圖', PLUS: '製作', L3: '見聞錄', R3: '睡', UP: '往上走；面板裡移焦點', DOWN: '往下走', LEFT: '往左走', RIGHT: '往右走', lx: '走（左右）', ly: '走（上下）', rx: '換囊格', ry: '（沒用到）' };
  const PAD_KEYS_HTML = '手柄：左搖桿／十字鍵 走 · <b>A</b> 取／攻擊 · <b>B</b> 關／暫停 · <b>X</b> 放／用 · <b>Y</b> 吃／用 · <b>L</b><b>R</b> 換囊格 · <b>ZL</b> 換工具 · <b>ZR</b> 攻擊 · <b>＋</b> 製作 · <b>－</b> 地圖 · <b>L3</b> 見聞 · <b>R3</b> 睡 · 面板裡十字鍵移焦點、A 按下、B 關';
  const $ = (id) => document.getElementById(id);
  const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));   // 發在 document：跟真的按鍵一樣先經過 window 的捕獲（設定頁、精靈先攔），再冒泡到遊戲
  const isDown = (b) => !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);
  const num = (v) => typeof v === 'number' && isFinite(v);
  const put = (el, t) => { if (el && el.textContent !== (window.I18N ? window.I18N.t(t) : t)) el.textContent = t; };   // 選了簡體時頁面上的字已被轉過：先轉再比，免得每幀重寫

  const PAD = {
    enabled: true, seen: false, id: '', index: -1, map: Object.assign({}, STD), axes: JSON.parse(JSON.stringify(STD_AXES)), rest: {}, custom: false, standard: true,
    down: {}, dirHeld: {}, heldCodes: {}, focus: null, focusIdx: -1, lastPanel: null, rep: { dir: null, at: 0 }, stick: { dir: 0, at: 0 }, learning: null, lastGp: null, lost: 0, keysHtml: null, lastDir: null,
    // ---------- 自訂對應的存取 ----------
    allCustom() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; } },
    customFor(id) { const c = this.allCustom()[id]; return c && c.v >= MAP_VERSION ? c : null; },   // 舊版存的不用
    saveFor(id, m) { try { const all = this.allCustom(); all[id] = Object.assign({ v: MAP_VERSION }, m); localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } },
    forgetFor(id) { try { const all = this.allCustom(); delete all[id]; localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } },
    use(gp) {               // 換了手柄：有自訂對應就用，沒有就用標準的；搖桿的閒置值從第一眼記下（偏得不多才信）
      this.id = gp.id; this.index = gp.index; this.standard = gp.mapping === 'standard';
      const c = this.customFor(gp.id);
      this.map = c ? Object.assign({}, STD, c.buttons) : Object.assign({}, STD);
      this.axes = c ? Object.assign(JSON.parse(JSON.stringify(STD_AXES)), c.axes) : JSON.parse(JSON.stringify(STD_AXES));
      this.rest = c && c.rest ? Object.assign({}, c.rest) : {};
      if (!c) this.recenter(gp, false);   // 第一眼看到時各軸停在哪裡就是閒置值（有的手柄閒置不在零，不記的話人會自己走）
      this.custom = !!c; this.down = {};
    },
    useStandard() { this.forgetFor(this.id); this.map = Object.assign({}, STD); this.axes = JSON.parse(JSON.stringify(STD_AXES)); this.rest = {}; this.custom = false; this.note('手柄對應', '改回標準對應。'); },
    restOf(i) { const r = this.rest[i]; return num(r) ? r : 0; },
    // 一個綁法現在按著沒有
    bound(gp, m) {
      if (m === undefined || m === null || m === -1) return false;
      if (typeof m === 'number') return isDown(gp.buttons[m]);
      if (Array.isArray(m)) return m.some(x => this.bound(gp, x));
      if (m.ax === undefined) return false;
      const v = gp.axes[m.ax]; if (!num(v)) return false;
      const rest = this.restOf(m.ax);
      if (Math.abs(rest) > 1.5) { if (Math.abs(v) > 1.5) return false; let d = Math.abs(v - m.at); d = Math.min(d, 2 - d); return d < HAT_TOL; }   // 閒置 3.29 的帽子軸：八個位置繞一圈，斜角算到相鄰的兩個方向
      const tol = Math.min(0.35, Math.max(0.12, Math.abs(m.at - rest) / 2));   // 其他軸（扳機、閒置 0 的帽子軸、數位搖桿）：離學到的值夠近就算按著
      return Math.abs(v - m.at) <= tol;
    },
    pressed(gp, name) { return this.bound(gp, this.map[name]); },
    axis(gp, name) {
      const a = this.axes[name]; if (!a) return 0;
      if (!Array.isArray(a)) return (this.bound(gp, a.pos) ? 1 : 0) - (this.bound(gp, a.neg) ? 1 : 0);   // 搖桿是按鍵
      const v = gp.axes[a[0]]; if (!num(v) || Math.abs(v) > 1.5) return 0;
      const span = a[2] && a[2] > TINY ? a[2] : 1;   // 學到的幅度：有的搖桿推到底只動 0.1，照幅度放大到 ±1
      return Math.max(-1, Math.min(1, (v - this.restOf(a[0])) * a[1] / span));
    },
    // ---------- 暫停面板的工具：校正中點、對調搖桿、反向、錄讀數 ----------
    recenter(gp, save) { gp = gp || this.lastGp; if (!gp) return false; gp.axes.forEach((v, i) => { if (num(v) && Math.abs(v) <= 1) this.rest[i] = v; }); if (save) this.persist(); return true; },
    persist() {   // 把現在這套（含手動調整）當成這支手柄的自訂對應存起來
      const buttons = {}; for (const n of BTN) if (JSON.stringify(this.map[n]) !== JSON.stringify(STD[n])) buttons[n] = this.map[n];
      this.saveFor(this.id, { buttons, axes: JSON.parse(JSON.stringify(this.axes)), rest: Object.assign({}, this.rest) }); this.custom = true;
    },
    swapSticks() { const l = [this.axes.lx, this.axes.ly]; this.axes.lx = this.axes.rx; this.axes.ly = this.axes.ry; this.axes.rx = l[0]; this.axes.ry = l[1]; this.persist(); this.note('手柄', '左右搖桿對調了。'); },
    flip(name) { const a = this.axes[name]; if (Array.isArray(a)) a[1] = -a[1]; else if (a) { const t = a.pos; a.pos = a.neg; a.neg = t; } this.persist(); this.note('手柄', (name === 'lx' ? '左搖桿左右' : name === 'ly' ? '左搖桿上下' : name === 'rx' ? '右搖桿左右' : '右搖桿上下') + '反向了。'); },
    record(ms) {   // 錄一段：各軸閒置值與最小最大、按過的鍵、幾鍵幾軸、id；錄完寫進文字框並複製到剪貼簿
      const gp = this.lastGp; if (!gp) { this.note('手柄', '還沒看到手柄。'); return; }
      const R = { until: performance.now() + (ms || this.recordMs || 8000), rest: Array.from(gp.axes).map(v => (num(v) ? v : 0)), min: Array.from(gp.axes).map(v => (num(v) ? v : 0)), max: Array.from(gp.axes).map(v => (num(v) ? v : 0)), btns: new Set(), id: gp.id, mapping: gp.mapping, nb: gp.buttons.length, na: gp.axes.length };
      this.recording = R; const box = $('pause-rec'); if (box) { box.classList.remove('hidden'); box.value = '錄音中……請依序：左搖桿繞一圈、右搖桿繞一圈、十字鍵四向各按一下、再按 A B X Y。'; }
    },
    recordStep(gp, now) {
      const R = this.recording; if (!R) return;
      gp.axes.forEach((v, i) => { if (!num(v)) return; if (v < R.min[i]) R.min[i] = v; if (v > R.max[i]) R.max[i] = v; });
      gp.buttons.forEach((b, i) => { if (isDown(b)) R.btns.add(i); });
      if (now < R.until) return;
      this.recording = null;
      const axes = R.rest.map((r, i) => i + ':' + r.toFixed(2) + '[' + R.min[i].toFixed(2) + ',' + R.max[i].toFixed(2) + ']' + (R.max[i] - R.min[i] > TINY ? '★' : '')).join(' ');
      const text = '山海有形手柄讀數 v2 | ' + (R.id || '').slice(0, 60) + ' | 對應 ' + (R.mapping || '非標準') + ' | ' + R.nb + ' 鍵 ' + R.na + ' 軸 | 按過的鍵 [' + [...R.btns].sort((a, b) => a - b).join(',') + '] | 軸 閒置[最小,最大]（★有動）：' + axes + ' | 現在的對應：' + this.summary();
      const box = $('pause-rec'); if (box) { box.classList.remove('hidden'); box.value = text; }
      this.lastRecord = text;
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => this.note('讀數錄好了', '已複製到剪貼簿，貼給開發者即可；下面的框裡也有。'), () => this.note('讀數錄好了', '在下面的框裡，全選複製。')); else this.note('讀數錄好了', '在下面的框裡，全選複製。'); } catch (e) { this.note('讀數錄好了', '在下面的框裡，全選複製。'); }
    },
    usedButtons() { const s = new Set(); const take = (m) => { if (typeof m === 'number' && m >= 0) s.add(m); else if (Array.isArray(m)) m.forEach(take); else if (m && typeof m === 'object' && m.ax === undefined) { take(m.pos); take(m.neg); } }; for (const n in this.map) take(this.map[n]); for (const n in this.axes) take(this.axes[n]); return s; },
    usedAxes() { const s = new Set(); for (const n in this.map) { const m = this.map[n]; if (m && typeof m === 'object' && m.ax !== undefined) s.add(m.ax); } for (const n in this.axes) { const a = this.axes[n]; if (Array.isArray(a)) s.add(a[0]); } return s; },
    // 方向：十字鍵優先，再看左搖桿的主軸；學過的對應都沒反應時，再看沒被綁走的標準十字鍵（鍵 12–15）與標準左搖桿（軸 0、1），免得精靈學錯就走不動
    direction(gp) {
      const st = {}; for (const d in DIR_CODE) st[d] = this.pressed(gp, d);
      if (st.UP) return 'UP'; if (st.DOWN) return 'DOWN'; if (st.LEFT) return 'LEFT'; if (st.RIGHT) return 'RIGHT';
      let lx = this.axis(gp, 'lx'), ly = this.axis(gp, 'ly');
      if (Math.abs(lx) > DEAD || Math.abs(ly) > DEAD) return Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'RIGHT' : 'LEFT') : (ly > 0 ? 'DOWN' : 'UP');
      if (this.custom) {
        const ub = this.usedButtons(), ua = this.usedAxes();
        for (const d in DIR_CODE) { const i = STD[d]; if (!ub.has(i) && isDown(gp.buttons[i])) return d; }
        const ax = (i) => { const v = gp.axes[i]; return !ua.has(i) && num(v) && Math.abs(v) <= 1.5 ? v - this.restOf(i) : 0; };
        lx = ax(0); ly = ax(1);
        if (Math.abs(lx) > 0.6 || Math.abs(ly) > 0.6) return Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'RIGHT' : 'LEFT') : (ly > 0 ? 'DOWN' : 'UP');
      }
      return null;
    },
    note(title, body) {
      const g = window.XIEYI && window.XIEYI.game;
      if (g && g.toast) g.toast(title, body, 7000);
      const h = $('new-hint'); if (h && $('start') && !$('start').classList.contains('hidden')) h.textContent = title + '：' + body;
      const m = $('padset-msg'); if (m && !$('padset').classList.contains('hidden')) m.textContent = title + '：' + body;   // 設定頁開著時起始頁收起來了，提示寫在頁裡
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
      if (!gp) { if (this.seen && ++this.lost > LOST_FRAMES) this.onLost(); else if (this.seen) this.releaseAll(); this.lastGp = null; return; }
      this.lost = 0; this.lastGp = gp;
      if (gp.id !== this.id || gp.index !== this.index) this.use(gp);
      const any = gp.buttons.some(isDown) || gp.axes.some((v, i) => num(v) && Math.abs(v - (this.rest[i] !== undefined ? this.rest[i] : (Math.abs(v) > 1.5 ? v : 0))) > 0.6);   // 第一次有動靜才算連上（帽子軸閒置的 3.29 不算動靜）
      if (!this.seen) { if (!any) { gp.axes.forEach((v, i) => { if (num(v) && Math.abs(v) > 1.5 && this.rest[i] === undefined) this.rest[i] = v; }); return; } this.seen = true; this.onConnect(gp); }
      if (this.recording) this.recordStep(gp, now);
      if (this.learning) { this.learnStep(gp); return; }
      const dir = this.direction(gp); this.lastDir = dir;
      const rx = this.axis(gp, 'rx');
      const panel = this.panel();
      if (panel) { this.holdDirs(null); this.navigate(panel, dir, now); if (panel.id === 'pause') { this.liveText(gp, $('pause-live')); this.liveBars(gp, $('pause-bars'), null, true); } else if (panel.id === 'padset') { this.liveBars(gp, $('padset-bars'), null, false); this.liveText(gp, $('padset-live')); } }
      else {
        this.clearFocus(); this.holdDirs(dir);
        const sd = Math.abs(rx) > 0.6 ? (rx > 0 ? 1 : -1) : 0;   // 右搖桿左右：換囊格，按著會連跳
        if (sd !== this.stick.dir) { this.stick.dir = sd; this.stick.at = now + REPEAT0; if (sd) this.tap(sd > 0 ? 'Tab' : 'KeyQ'); }
        else if (sd && now >= this.stick.at) { this.stick.at = now + STICK_REPEAT; this.tap(sd > 0 ? 'Tab' : 'KeyQ'); }
      }
      for (const n of BTN) {   // 按鍵：按下那一幀觸發，放開時放掉按著的鍵
        if (DIR_CODE[n]) continue;
        const was = !!this.down[n], is = this.pressed(gp, n); this.down[n] = is;
        if (is && !was) this.press(n, panel); else if (!is && was) this.release(n);
      }
    },
    onConnect(gp) {
      const name = (gp.id || '手柄').replace(/\s*\(.*$/, '').slice(0, 40);
      const k = $('keys'); if (k) { if (this.keysHtml === null) this.keysHtml = k.innerHTML; k.innerHTML = PAD_KEYS_HTML; }   // keysHtml 在載入時就記下繁體原文（見檔尾），選了簡體也不會記成簡體
      this.renderPadset();
      if (!this.standard && !this.custom && $('padset') && $('padset').classList.contains('hidden')) { this.note('手柄已連上', name + '。這支手柄的對應不是標準的，先學一遍；推搖桿時看面板下面哪一條在動。'); this.learn(); }
      else this.note('手柄已連上', name + (this.custom ? '（用你學過的對應）' : '') + '。A 取、B 關、X 放、Y 用、L／R 換囊格、ZL 換工具、＋製作、－地圖。哪顆不對就到暫停或起始頁的「手柄設定」單獨換。');
    },
    onLost() {   // 手柄不見了（藍牙斷了、拔掉了）：放掉按著的鍵，按鍵列換回鍵盤的
      this.releaseAll(); this.seen = false; this.lost = 0; this.id = ''; this.index = -1; this.lastDir = null;
      const k = $('keys'); if (k && this.keysHtml !== null) k.innerHTML = this.keysHtml;
      if (this.learning) this.learnCancel();
      this.note('手柄斷了', '再按一下手柄上任一鍵就會接回來。'); this.renderPadset();
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
    // ---------- 讀數：瀏覽器看到什麼、遊戲判定成什麼（精靈最下面一行、暫停面板） ----------
    describe(m) { if (m === undefined || m === null || m === -1) return '無'; if (typeof m === 'number') return '鍵' + m; if (Array.isArray(m)) return m.map(x => this.describe(x)).join('或'); if (m.ax !== undefined) return '軸' + m.ax + '@' + (+m.at).toFixed(2); return '鍵' + m.pos + '／' + m.neg; },
    describeStick(a) { if (!a) return '無'; if (Array.isArray(a)) return '軸' + a[0] + (a[1] < 0 ? '反' : '') + (a[2] ? '幅' + a[2] : ''); return '鍵' + this.describe(a.pos) + '／' + this.describe(a.neg); },
    summary() { return BTN.map(n => (DIR_NAME[n] || n) + '＝' + this.describe(this.map[n])).join(' ') + ' 左搖桿＝' + this.describeStick(this.axes.lx) + '，' + this.describeStick(this.axes.ly) + ' 右搖桿＝' + this.describeStick(this.axes.rx) + '，' + this.describeStick(this.axes.ry); },
    liveText(gp, el, rest) {
      if (!el) return;
      const down = []; gp.buttons.forEach((b, i) => { if (isDown(b)) down.push(i); });
      const axes = Array.from(gp.axes).map((v, i) => { const r = rest ? rest[i] : this.restOf(i); const mark = num(v) && Math.abs(v - (num(r) ? r : 0)) > MOVE ? '★' : ''; return i + '=' + (num(v) ? v.toFixed(2) : '?') + mark; }).join(' ');
      let judged = '';
      if (!this.learning) { const d = this.direction(gp), names = BTN.filter(n => !DIR_CODE[n] && this.pressed(gp, n)); judged = ' · 判定：' + ((d ? DIR_NAME[d] : '') + ' ' + names.join(' ')).trim() || ' · 判定：（沒有）'; if (judged === ' · 判定：') judged = ' · 判定：（沒有）'; }
      const t = '瀏覽器看到：' + (gp.id || '').slice(0, 48) + ' · 對應 ' + (gp.mapping || '非標準') + ' · ' + gp.buttons.length + ' 鍵 ' + gp.axes.length + ' 軸 · 按著的鍵 [' + down.join(', ') + '] · 軸 ' + axes + '（★＝離閒置超過 0.3）' + judged + (this.learning ? '' : ' · 現在的對應：' + this.summary());
      if (el.textContent !== t) el.textContent = t;
    },
    // 條狀讀數：每根軸一條（中間是閒置值，紅點是現在），每顆鍵一個格子，按著的亮起來；assign 為真時每根軸旁邊有「設成左右／上下」
    liveBars(gp, el, rest, assign) {
      if (!el) return;
      const na = gp.axes.length, nb = gp.buttons.length, sig = na + ':' + nb + ':' + (assign ? 1 : 0);
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig; let h = '<div class="padaxes">';
        for (let i = 0; i < na; i++) h += '<div class="padax" data-i="' + i + '"><span class="padlab">軸 ' + i + '</span><span class="padtrack"><span class="padrest"></span><span class="padnow"></span></span><span class="padval"></span>' + (assign ? '<button class="ghost small" data-assign="lx" data-i="' + i + '">設成左右</button><button class="ghost small" data-assign="ly" data-i="' + i + '">設成上下</button>' : '') + '</div>';
        h += '</div><div class="padbtns">'; for (let i = 0; i < nb; i++) h += '<span class="padbtn" data-i="' + i + '">' + i + '</span>'; h += '</div>';
        el.innerHTML = h;
        el.querySelectorAll('button[data-assign]').forEach(b => b.addEventListener('click', () => this.assign(b.dataset.assign, +b.dataset.i)));
      }
      const pos = (v) => Math.max(0, Math.min(100, (v + 1) * 50));
      el.querySelectorAll('.padax').forEach(row => {
        const i = +row.dataset.i, v = gp.axes[i], r = rest ? rest[i] : this.restOf(i), far = num(v) && Math.abs(v) > 1.5;
        const now = row.querySelector('.padnow'), rr = row.querySelector('.padrest'), val = row.querySelector('.padval');
        now.style.left = (far ? 50 : pos(num(v) ? v : 0)) + '%'; now.style.opacity = far ? 0.25 : 1;
        rr.style.left = (num(r) && Math.abs(r) <= 1 ? pos(r) : 50) + '%';
        const moving = num(v) && !far && Math.abs(v - (num(r) && Math.abs(r) <= 1.5 ? r : 0)) > MOVE;
        row.classList.toggle('moving', moving || (far === false && num(r) && Math.abs(r) > 1.5));
        const t = num(v) ? (far ? v.toFixed(2) + ' 閒置' : v.toFixed(2)) : '?'; if (val.textContent !== t) val.textContent = t;
      });
      el.querySelectorAll('.padbtn').forEach(c => c.classList.toggle('on', isDown(gp.buttons[+c.dataset.i])));
    },
    assign(name, i) {   // 暫停面板：直接指定哪根軸是左搖桿的左右／上下。推著往右（往下）時點，方向就對；沒推著點也行，不對再按「反向」
      const gp = this.lastGp; if (!gp) { this.note('手柄', '還沒看到手柄。'); return; }
      const r = num(this.rest[i]) ? this.rest[i] : 0, v = gp.axes[i], d = num(v) ? v - r : 0;
      this.axes[name] = [i, Math.abs(d) > MOVE ? (d > 0 ? 1 : -1) : 1];
      this.persist(); this.note('手柄', (name === 'lx' ? '左搖桿左右' : '左搖桿上下') + '＝軸 ' + i + (Math.abs(d) > MOVE ? '，方向照你現在推的' : '；方向不對就按「反向」') + '。');
    },
    // ---------- 學對應：一顆一顆按，搖桿往右往下推；帽子軸、扳機軸、按鍵式搖桿、半幅搖桿都認得 ----------
    learnOrHint() { if (!this.seen) { this.note('還沒看到手柄', '先按一下手柄上任一鍵（藍牙或 USB 接上電腦後），瀏覽器才會把它交給遊戲。'); return false; } this.learn(); return true; },
    learn() {
      this.releaseAll();
      this.learning = { i: 0, steps: STEPS.map(s => s.slice()), buttons: {}, axes: {}, rest: null, idle: false, hatAxes: {}, slow: null, base: null, noisy: {}, restOf: {}, win: null, wait0: 0, ui: 'padmap' };
      $('padmap').classList.remove('hidden'); this.renderLearn();
    },
    renderLearn() {
      const L = this.learning; if (!L) return;
      if (L.single) { this.learnState('先放開，等一下……'); this.renderPadset(); return; }
      const [, label] = L.steps[L.i];
      const show = (n) => STICKS[n] ? this.describeStick(L.axes[n]) : n.length === 3 && n[2] === '-' ? '（反向）' : this.describe(L.buttons[n]);
      const done = L.steps.slice(0, L.i).map(([n, l]) => l.replace(/（.*$/, '').replace(/推到底$/, '') + '＝' + show(n)).join('、');
      $('padmap-text').innerHTML = '第 ' + (L.i + 1) + '／' + L.steps.length + ' 步：請按 <b>' + label + '</b>' + (L.i ? '<br><span class="dim small">已記：' + done + '</span>' : '');
    },
    learnStep(gp) {
      const L = this.learning, now = performance.now();
      const ax = Array.from(gp.axes).map(v => (num(v) ? v : 0));
      const down = []; gp.buttons.forEach((b, i) => { if (isDown(b)) down.push(i); });
      if (!L.rest) { if (down.length) return; L.rest = ax.slice(); }   // 第一眼：只拿來當「還沒學到的軸」的閒置值
      this.liveText(gp, $(L.ui + '-live'), L.base || L.rest); this.liveBars(gp, $(L.ui + '-bars'), L.base || L.rest, false);
      if (!L.idle) {
        // 每一步開始前：上一步的鍵放開、上一步收的軸離開那個值，再等各軸靜下來一會兒，把那時的各軸當這一步的基準。
        // 偏掉、卡住、慢慢飄的軸都會變成基準的一部分，不會卡住精靈；一直靜不下來的軸（體感、雜訊）標成雜訊，之後不看。
        const released = !L.hold || Math.abs(ax[L.hold.ax] - L.hold.at) > 0.1;
        if (down.length || !released) { L.win = null; if (!L.wait0) L.wait0 = now; this.learnState('先放開，等一下……'); return; }
        if (!L.wait0) L.wait0 = now;
        if (!L.win) { L.win = { t: now, lo: ax.slice(), hi: ax.slice() }; return; }
        ax.forEach((v, i) => { if (v < L.win.lo[i]) L.win.lo[i] = v; if (v > L.win.hi[i]) L.win.hi[i] = v; });
        const shaky = ax.map((v, i) => !L.noisy[i] && L.win.hi[i] - L.win.lo[i] > STILL);
        if (shaky.some(Boolean)) {
          if (now - L.wait0 > NOISY_MS) shaky.forEach((sh, i) => { if (sh) L.noisy[i] = true; });
          L.win = { t: now, lo: ax.slice(), hi: ax.slice() }; this.learnState('等搖桿與手柄靜下來……'); return;
        }
        if (now - L.win.t < CALM_MS) return;
        L.base = ax.slice(); L.idle = true; L.win = null; L.wait0 = 0; L.slow = null; L.hold = null; this.learnState('好，請按。'); return;
      }
      const base = L.base;
      const moved = []; ax.forEach((v, i) => { if (!L.noisy[i] && Math.abs(v - base[i]) > AXIS_MIN) moved.push(i); });
      moved.sort((a, b) => Math.abs(ax[b] - base[b]) - Math.abs(ax[a] - base[a]));   // 動得最多的排前面
      const big = moved.filter(i => Math.abs(ax[i] - base[i]) > MOVE);
      const [name] = L.steps[L.i];
      const usedB = Object.values(L.buttons).filter(v => typeof v === 'number').concat(...Object.values(L.axes).filter(a => !Array.isArray(a)).map(a => [a.pos, a.neg].filter(x => typeof x === 'number')));
      const takenAx = (k) => Object.values(L.buttons).some(m => m && typeof m === 'object' && m.ax === k);   // 已經學成十字鍵或扳機的軸
      if (STICKS[name] || (name.length === 3 && name[2] === '-')) {
        const base2 = name.slice(0, 2);
        const free = (k) => !!L.single || (!L.hatAxes[k] && !takenAx(k) && !Object.entries(L.axes).some(([n, a]) => n !== base2 && Array.isArray(a) && a[0] === k));   // 單設一個：不排除，設完再把重複的別的項目清掉
        // 搖桿幅度很小的手柄：沒有軸動超過 0.3，就看哪根軸動了一點點（> 0.03）且按住一秒多，收它並記下幅度
        let tiny = null;
        if (!big.length && name.length === 2) {
          let bi = -1, bd = TINY; ax.forEach((v, i) => { if (L.noisy[i] || !free(i)) return; const d = Math.abs(v - base[i]); if (d > bd) { bd = d; bi = i; } });
          if (bi < 0) L.slow = null;
          else if (!L.slow || L.slow.ax !== bi) L.slow = { ax: bi, since: now };
          else if (now - L.slow.since >= HOLD_MS) tiny = bi;
        }
        const pick = big.find(free);
        if ((pick !== undefined || tiny !== null) && name.length === 2) {   // 搖桿是軸：動得最多、還沒被別的鍵用掉的那根
          const i = pick !== undefined ? pick : tiny;
          const span = Math.min(1, Math.max(TINY, Math.abs(ax[i] - base[i])));
          L.axes[base2] = span < 0.95 ? [i, ax[i] > base[i] ? 1 : -1, +span.toFixed(3)] : [i, ax[i] > base[i] ? 1 : -1]; L.restOf[i] = base[i]; L.hold = { ax: i, at: ax[i] }; L.slow = null;
        } else {
          const b = down.find(k => !usedB.includes(k)); if (b === undefined) return;
          if (name.length === 2) { L.axes[base2] = { pos: b, neg: -1 }; L.steps.splice(L.i + 1, 0, STICK_NEG[base2]); }   // 搖桿是按鍵：記正向，再加一步問反向
          else { L.axes[base2] = Object.assign({}, L.axes[base2] || { pos: -1 }, { neg: b }); }
        }
      } else {
        const b = down.find(k => !usedB.includes(k));
        if (b !== undefined) L.buttons[name] = b;
        else {
          const free = (k) => !!L.single || !Object.values(L.axes).some(a => Array.isArray(a) && a[0] === k);
          let i = big.find(free); if (i === undefined) i = moved.find(free); if (i === undefined) return;
          L.buttons[name] = { ax: i, at: ax[i] }; L.restOf[i] = base[i]; L.hold = { ax: i, at: ax[i] }; if (Math.abs(base[i]) > 1.5) L.hatAxes[i] = true;   // 軸上的一個值：帽子軸的方向、扳機拉到底
        }
      }
      this.learnAdvance();
    },
    learnState(t) { const L = this.learning, el = $((L ? L.ui : 'padmap') + '-state'); if (!el) return; if (L && L.single) { const lab = L.steps[L.i][1]; t = (/推到底$/.test(lab) ? '請把' + lab : '請按「' + lab + '」') + (t === '好，請按。' ? '' : '　' + t) + '（空白鍵＝設成無，Esc＝取消）'; } put(el, t); },
    learnSkip() { const L = this.learning; if (!L) return; const [name] = L.steps[L.i]; if (STICKS[name]) delete L.axes[name]; else if (name.length === 3 && name[2] === '-') { /* 反向沒有就算了 */ } else L.buttons[name] = -1; this.learnAdvance(); },
    learnAdvance() {
      const L = this.learning; L.idle = false; L.i++; L.win = null; L.wait0 = 0;
      if (L.i < L.steps.length) { this.renderLearn(); return; }
      if (L.single) { this.finishOne(L); return; }
      const rest = {}; (L.rest || []).forEach((v, i) => { if (Math.abs(v) > 0.02) rest[i] = v; }); for (const k in L.restOf) { if (Math.abs(L.restOf[k]) > 0.02) rest[k] = L.restOf[k]; else delete rest[k]; }   // 學到的軸用那一步的基準當閒置值
      this.map = Object.assign({}, STD, L.buttons); this.axes = Object.assign(JSON.parse(JSON.stringify(STD_AXES)), L.axes); this.rest = rest; this.custom = true;
      this.saveFor(this.id, { buttons: L.buttons, axes: L.axes, rest });
      this.learning = null; $('padmap').classList.add('hidden'); this.down = {};
      if (L.back) this.backToPadset();
      this.note('手柄對應存好了', '以後這支手柄都用這套。暫停面板最下面一行會即時顯示讀數與判定；方向不對就再學或改回標準。');
    },
    learnCancel() { const L = this.learning, single = L && L.single; this.learning = null; $('padmap').classList.add('hidden'); this.down = {}; if (single) { const st = $('padset-state'); if (st) st.textContent = ''; this.renderPadset(); } if (L && L.back) this.backToPadset(); },
    backToPadset() { $('padset').classList.remove('hidden'); this.renderPadset(); },   // 從設定頁開的精靈：學完或取消都回設定頁
    // ---------- 手柄設定頁：二十個鍵位一個一個設 ----------
    friendly(m, stick) {
      if (m === undefined || m === null || m === -1) return '無';
      if (stick) { if (Array.isArray(m)) return '軸 ' + m[0] + (m[1] < 0 ? '（反向）' : '') + (m[2] ? '，幅度 ' + m[2] : ''); return '鍵 ' + this.friendly(m.pos) + '／' + this.friendly(m.neg); }
      if (typeof m === 'number') return '鍵 ' + m;
      if (Array.isArray(m)) return m.map(x => this.friendly(x)).join(' 或 ');
      if (m.ax !== undefined) return '軸 ' + m.ax + ' 到 ' + (+m.at).toFixed(2);
      return '無';
    },
    // 點「手柄設定」就切換過去：把起始頁（或暫停、幫助）收起來，記下從哪裡來，「返回」時原樣放回；遊戲裡沒暫停就先暫停
    openPadset() {
      const el = $('padset'); if (!el) return;
      const g = window.XIEYI && window.XIEYI.game;
      if (g && !g.paused && !g.player.dead) g.togglePause();
      if (!this.padBack) this.padBack = ['start', 'pause', 'help'].filter(id => $(id) && !$(id).classList.contains('hidden'));
      for (const id of ['start', 'pause', 'help', 'padmap']) { const o = $(id); if (o) o.classList.add('hidden'); }
      const back = $('padset-close'); if (back) back.classList.toggle('hidden', !g);   // 起始頁進來的只要「回到主頁」
      const m = $('padset-msg'); if (m) m.textContent = '';
      el.classList.remove('hidden'); this.renderPadset();
    },
    closePadset() {   // 返回：回到進來前的那一頁
      if (this.learning && this.learning.single) this.learnCancel();
      const el = $('padset'); if (el) el.classList.add('hidden');
      for (const id of this.padBack || []) { const o = $(id); if (o) o.classList.remove('hidden'); }
      this.padBack = null;
    },
    padsetHome() {   // 回到主頁：遊戲裡跟暫停面板的「回到主頁」一樣先存檔；起始頁進來的就回起始頁
      if (this.learning) this.learnCancel();
      if (window.XIEYI && window.XIEYI.game && $('pause-home')) { $('pause-home').click(); return; }
      for (const id of ['padset', 'help']) { const o = $(id); if (o) o.classList.add('hidden'); }
      $('start').classList.remove('hidden'); this.padBack = null;
    },
    renderPadset() {
      const tb = $('padset-rows'); if (!tb) return;
      if (!tb.dataset.built) {
        tb.dataset.built = '1';
        tb.innerHTML = STEPS.map(([n]) => '<tr data-n="' + n + '"><th>' + ENTRY_NAME[n] + '</th><td class="does dim">' + ENTRY_DOES[n] + '</td><td class="cur"></td><td><button class="ghost small" data-set="' + n + '">設定</button></td></tr>').join('');
        tb.querySelectorAll('button[data-set]').forEach(b => b.addEventListener('click', () => this.learnOne(b.dataset.set)));
      }
      const L = this.learning && this.learning.single ? this.learning : null;
      tb.querySelectorAll('tr').forEach(row => {
        const n = row.dataset.n, on = !!L && L.single === n, cur = row.querySelector('.cur'), b = row.querySelector('button');
        row.classList.toggle('listening', on);
        put(cur, on ? '等你按……' : this.friendly(STICKS[n] ? this.axes[n] : this.map[n], !!STICKS[n]));
        put(b, on ? '取消' : '設定'); b.disabled = !this.seen;
      });
      const st = $('padset-status');
      if (st) { const t = this.seen ? '手柄：' + (this.id || '').replace(/\s*\(.*$/, '').slice(0, 40) + '（' + (this.standard ? '標準對應' : '非標準對應') + (this.custom ? '，用你設定的' : '，照預設') + '）。點一列的「設定」，再按手柄上那一顆；搖桿往右（往下）推到底。' : '還沒看到手柄：接上手柄（藍牙或 USB），按一下手柄上任一鍵。'; put(st, t); }
    },
    learnOne(name) {   // 只設一個鍵位：跟精靈同一套判法（等靜下來、雜訊軸不看），設完跟現在的對應合併
      if (!this.seen || !this.lastGp) { this.note('還沒看到手柄', '先按一下手柄上任一鍵，再點「設定」。'); this.renderPadset(); return; }
      const was = this.learning && this.learning.single; if (this.learning) this.learnCancel(); if (was === name) return;
      const step = STEPS.find(s => s[0] === name); if (!step) return;
      this.releaseAll();
      this.learning = { i: 0, steps: [step.slice()], buttons: {}, axes: {}, rest: null, idle: false, hatAxes: {}, slow: null, base: null, noisy: {}, restOf: {}, win: null, wait0: 0, ui: 'padset', single: name };
      this.renderLearn();
    },
    finishOne(L) {
      const name = L.single, m = Object.assign({}, this.map), a = JSON.parse(JSON.stringify(this.axes)), cleared = [];
      for (const k in L.buttons) m[k] = L.buttons[k];
      if (STICKS[name]) a[name] = L.axes[name] || null; else for (const k in L.axes) a[k] = L.axes[k];
      // 同一顆鍵、同一根軸不綁兩個：別的項目原本用它的，改成無
      const nb = STICKS[name] ? null : m[name], na = STICKS[name] ? a[name] : null;
      const clearB = (b) => { if (typeof b !== 'number' || b < 0) return; for (const n of BTN) if (n !== name && m[n] === b) { m[n] = -1; cleared.push(n); } for (const n in STICKS) { const s = a[n]; if (n !== name && s && !Array.isArray(s) && (s.pos === b || s.neg === b)) { a[n] = null; cleared.push(n); } } };
      if (typeof nb === 'number') clearB(nb);
      else if (nb && typeof nb === 'object' && nb.ax !== undefined) for (const n of BTN) if (n !== name && m[n] && typeof m[n] === 'object' && m[n].ax === nb.ax && Math.abs(m[n].at - nb.at) < 0.15) { m[n] = -1; cleared.push(n); }
      if (Array.isArray(na)) for (const n in STICKS) if (n !== name && Array.isArray(a[n]) && a[n][0] === na[0]) { a[n] = null; cleared.push(n); }
      if (na && !Array.isArray(na)) { clearB(na.pos); clearB(na.neg); }
      for (const k in L.restOf) { if (Math.abs(L.restOf[k]) > 0.02) this.rest[k] = L.restOf[k]; else delete this.rest[k]; }
      this.map = m; this.axes = a; this.custom = true; this.persist();
      this.learning = null; this.down = {}; if (this.lastGp) for (const n of BTN) this.down[n] = this.pressed(this.lastGp, n);   // 剛按的那顆還按著：不當成新的一下（免得在面板裡又按到「設定」）
      const st = $('padset-state'); if (st) st.textContent = '';
      this.renderPadset();
      this.note('手柄設定', ENTRY_NAME[name] + '＝' + this.friendly(STICKS[name] ? a[name] : m[name], !!STICKS[name]) + (cleared.length ? '；' + cleared.map(n => ENTRY_NAME[n]).join('、') + ' 原本也用它，改成無' : '') + '。');
    },
    bind() {
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
      on('padmap-skip', () => this.learnSkip());
      on('padmap-cancel', () => this.learnCancel());
      on('padmap-std', () => { this.learnCancel(); this.useStandard(); });
      on('help-pad', () => this.openPadset());
      on('btn-pad', () => this.openPadset());
      on('pause-pad', () => this.openPadset());
      on('padset-close', () => this.closePadset());
      on('padset-home', () => this.padsetHome());
      on('padset-wizard', () => { if (!this.seen) { this.note('還沒看到手柄', '先按一下手柄上任一鍵，再學。'); return; } $('padset').classList.add('hidden'); this.learn(); this.learning.back = true; });
      on('padset-std', () => { if (this.learning) this.learnCancel(); this.useStandard(); this.renderPadset(); });
      on('padset-center', () => { if (this.recenter(null, true)) this.note('手柄', '以現在搖桿停的位置當中點。'); else this.note('手柄', '還沒看到手柄。'); });
      on('pause-center', () => { if (this.recenter(null, true)) this.note('手柄', '以現在搖桿停的位置當中點。'); else this.note('手柄', '還沒看到手柄。'); });
      on('pause-swap', () => this.swapSticks());
      on('pause-flipy', () => this.flip('ly'));
      on('pause-flipx', () => this.flip('lx'));
      on('pause-record', () => this.record());
      window.addEventListener('keydown', (ev) => {
        if (!this.learning && $('padset') && !$('padset').classList.contains('hidden')) {   // 設定頁開著：Esc 返回，其他鍵不給遊戲與起始頁（免得回車落筆開新島、走路）
          if (ev.code === 'Escape') { this.closePadset(); ev.preventDefault(); } ev.stopImmediatePropagation(); return;
        }
        if (!this.learning) return; if (ev.code === 'Escape') this.learnCancel(); else if (ev.code === 'Space') this.learnSkip(); ev.preventDefault(); ev.stopImmediatePropagation(); }, true);
    },
    loop() {
      const tick = (t) => { if (this.enabled && !document.hidden) { try { this.poll(t); } catch (e) { /* 手柄壞了也別把遊戲拖垮 */ } } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    },
  };
  window.PAD = PAD;
  { const k0 = document.getElementById('keys'); if (k0) PAD.keysHtml = k0.innerHTML; }   // 按鍵列的原文：在轉簡體之前記下
  window.addEventListener('DOMContentLoaded', () => { PAD.bind(); PAD.loop(); });
})();
