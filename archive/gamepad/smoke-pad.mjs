// 手柄封存（v0.27）：從 scripts/smoke.mjs 抽出來的手柄測試，不能單獨執行；恢復時照每段的註解貼回原位，
// 並刪掉 smoke.mjs 裡「手柄已封存」那兩段替代測試。

// ======== 頁內：手柄大段（原本在「數值提醒」之後、「拆人造的東西先問一聲」之前） ========
  // ============ 手柄：Gamepad API，灌假手柄進去 ============
  { const mkPad = (id, mapping, nb, na) => ({ id, index: 0, connected: true, mapping, buttons: Array.from({ length: nb }, () => ({ pressed: false, value: 0, touched: false })), axes: Array.from({ length: na }, () => 0), timestamp: 0 });
    const fake = mkPad('Fake Pro (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'standard', 17, 4);
    const real = navigator.getGamepads; navigator.getGamepads = () => [fake];
    const pressBtn = (pad, i, on) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; };
    const frames = (n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const keysLine = () => document.getElementById('keys').textContent;
    let ok_lit = true; const ready = () => until(() => !PAD.learning || PAD.learning.idle, 4000);   // 精靈每一步要等鍵放開、各軸靜下來才收下一個
    ok('pad layer is loaded, nothing seen yet, the keys line still describes the keyboard', !!window.PAD && !PAD.seen && PAD.enabled && keysLine().indexOf('WASD') === 0);
    for (const id of ['craft', 'map', 'journal', 'help', 'chest', 'stove', 'warn', 'read']) document.getElementById(id).classList.add('hidden'); g.closeStove(); g.chestAt = null; g.keys.clear();
    pressBtn(fake, 1, true); await frames(3);
    ok('pressing A on a standard pad: the pad is recognised, E is held, the keys line now describes the pad', PAD.seen && PAD.standard && g.keys.has('KeyE') && toasts().indexOf('手柄已連上') >= 0 && keysLine().indexOf('手柄') === 0);
    pressBtn(fake, 1, false); await frames(3);
    ok('letting go of A releases E', !g.keys.has('KeyE'));
    for (let i = 1; i <= 4; i++) { w.set(p.x + i, p.y, '草'); const e = g.ents.at(p.x + i, p.y); if (e) g.ents.remove(e); }
    const x0 = p.x; fake.axes[0] = 0.9; await frames(3);
    ok('left stick to the right holds D', g.keys.has('KeyD'));
    await until(() => p.x > x0, 2000);
    ok('and the character actually walks east', p.x > x0, [x0, p.x]);
    fake.axes[0] = 0; await frames(3); ok('stick back to centre releases D', !g.keys.has('KeyD'));
    pressBtn(fake, 12, true); await frames(3); ok('d-pad up holds W', g.keys.has('KeyW')); pressBtn(fake, 12, false); await frames(3);
    const sel0 = p.sel; fake.axes[2] = 0.9; await frames(3); fake.axes[2] = 0; await frames(2);
    ok('right stick to the right moves the bag selection one slot', p.bag.length < 2 || p.sel === (sel0 + 1) % p.bag.length, [sel0, p.sel, p.bag.length]);
    pressBtn(fake, 9, true); await frames(3); pressBtn(fake, 9, false); await frames(3);
    ok('＋ opens the craft panel and the focus lands inside it', !hidden('craft') && !!document.querySelector('#craft .padfocus'));
    const f0 = document.querySelector('#craft .padfocus'); pressBtn(fake, 13, true); await frames(3); pressBtn(fake, 13, false); await frames(2);
    ok('d-pad down moves the focus to another control in the panel', document.querySelector('#craft .padfocus') !== f0 && !!document.querySelector('#craft .padfocus'));
    pressBtn(fake, 0, true); await frames(3); pressBtn(fake, 0, false); await frames(3);
    ok('B closes the panel and clears the focus', hidden('craft') && !document.querySelector('.padfocus'));
    pressBtn(fake, 0, true); await frames(3); pressBtn(fake, 0, false); await frames(3);
    ok('B with nothing open pauses; the pause panel has 回到主頁 and 手柄對應 and the focus sits in it', !hidden('pause') && g.userPaused && !!document.getElementById('pause-home') && !!document.getElementById('pause-pad') && !!document.querySelector('#pause .padfocus'));
    pressBtn(fake, 0, true); await frames(3); pressBtn(fake, 0, false); await frames(3);
    ok('B again resumes', hidden('pause') && !g.userPaused);
    face(0, 1); w.set(T().x, T().y, '灶'); for (const [k] of w.stoves) w.stoves.set(k, 0); g.addItem('木', 2); g.pressPlace(); await frames(3);
    const fb = document.querySelector('#stove .padfocus');
    ok('the stove panel gets a focus on its first button (a fuel)', !!fb && !!fb.dataset.fuel, fb && fb.outerHTML.slice(0, 60));
    pressBtn(fake, 1, true); await frames(3); pressBtn(fake, 1, false); await frames(3);
    ok('A on the focused button fuels the stove', w.stoveLit(T().x, T().y));
    pressBtn(fake, 0, true); await frames(3); pressBtn(fake, 0, false); await frames(3); ok('B leaves the stove', hidden('stove'));
    w.set(T().x, T().y, '草');
    g.warnEnabled = true; p.warnLow = {}; p.hp = p.hpMax * 0.1; await until(() => !hidden('warn'), 2000);
    pressBtn(fake, 1, true); await frames(3); pressBtn(fake, 1, false); await frames(3);
    ok('A closes the low-stat popup like Enter', hidden('warn') && !g.paused); g.warnEnabled = false; p.hp = p.hpMax; p.warnLow = {};
    PAD.learn(); await frames(2);
    ok('the mapping wizard opens on step 1 with a live readout of what the browser sees', !hidden('padmap') && document.getElementById('padmap-text').textContent.indexOf('第 1／20 步') >= 0 && document.getElementById('padmap-live').textContent.indexOf('17 鍵 4 軸') >= 0);
    const order = [5, 4, 7, 6, 1, 0, 3, 2, 9, 8, 11, 10, 15, 14, 13, 12];   // A B X Y L R ZL ZR － ＋ L3 R3 上下左右 要按的實體鍵，全部錯位
    for (const i of order) { await ready(); pressBtn(fake, i, true); await frames(3); pressBtn(fake, i, false); await frames(3); }
    ok('after sixteen buttons the wizard asks for the left stick', !hidden('padmap') && document.getElementById('padmap-text').textContent.indexOf('左搖桿往右') >= 0, document.getElementById('padmap-text').textContent.slice(0, 30));
    await ready(); fake.axes[2] = -0.9; await frames(3); fake.axes[2] = 0; await frames(3);   // 這支手柄把左搖桿往右推成軸 2 的負值
    await ready(); fake.axes[3] = 0.9; await frames(3); fake.axes[3] = 0; await frames(3);
    await ready(); fake.axes[0] = 0.9; await frames(3); fake.axes[0] = 0; await frames(3);
    await ready(); fake.axes[1] = 0.9; await frames(3); fake.axes[1] = 0; await frames(3);
    const saved = (JSON.parse(localStorage.getItem('xieyi.pad') || '{}'))[fake.id];
    ok('the learned mapping is saved per pad id: A is now button 5, up is 15, left stick x is axis 2 inverted', hidden('padmap') && PAD.custom && PAD.map.A === 5 && PAD.map.UP === 15 && PAD.axes.lx[0] === 2 && PAD.axes.lx[1] === -1 && !!saved && saved.buttons.A === 5, saved);
    pressBtn(fake, 5, true); await frames(3);
    ok('with the learned mapping, physical button 5 is A: E is held', g.keys.has('KeyE')); pressBtn(fake, 5, false); await frames(3);
    fake.axes[2] = -0.9; await frames(3); ok('and pushing the learned left stick right holds D', g.keys.has('KeyD')); fake.axes[2] = 0; await frames(3);
    PAD.useStandard(); ok('back to the standard mapping, the custom one is forgotten', !PAD.custom && PAD.map.A === 1 && !(JSON.parse(localStorage.getItem('xieyi.pad') || '{}'))[fake.id]);
    // —— 第三方手柄：對應不是標準的，十字鍵是一根閒置 3.29 的帽子軸，搖桿閒置偏一點
    navigator.getGamepads = () => []; await until(() => !PAD.seen, 9000);
    ok('when the pad goes away the keys line goes back to the keyboard', !PAD.seen && keysLine().indexOf('WASD') === 0 && toasts().indexOf('手柄斷了') >= 0);
    const hat = mkPad('Afterglow-like (Vendor: 20d6 Product: a719)', '', 12, 10); hat.axes[9] = 3.2857; hat.axes[0] = 0.12; navigator.getGamepads = () => [hat];
    await frames(4);
    ok('an idle hat axis at 3.29 and a slightly off-centre stick do not count as activity', !PAD.seen);
    pressBtn(hat, 2, true); await frames(3); pressBtn(hat, 2, false); await frames(3);
    ok('first press on a non-standard pad opens the wizard by itself and the readout says so', PAD.seen && !PAD.standard && !hidden('padmap') && document.getElementById('padmap-live').textContent.indexOf('非標準') >= 0 && document.getElementById('padmap-live').textContent.indexOf('12 鍵 10 軸') >= 0);
    for (const i of [2, 1, 3, 0, 4, 5, 6, 7, 8, 9, 10, 11]) { await ready(); pressBtn(hat, i, true); await frames(3); pressBtn(hat, i, false); await frames(3); }   // A B X Y L R ZL ZR － ＋ L3 R3
    ok('twelve buttons learned, now the d-pad', document.getElementById('padmap-text').textContent.indexOf('十字鍵上') >= 0, document.getElementById('padmap-text').textContent.slice(0, 40));
    for (const v of [-1, 0.1429, 0.7143, -0.4286]) { await ready(); hat.axes[9] = v; await frames(3); hat.axes[9] = 3.2857; await frames(3); }   // 帽子軸：上、下、左、右
    ok('the four d-pad directions are learned as positions on the hat axis', document.getElementById('padmap-text').textContent.indexOf('左搖桿往右') >= 0 && document.getElementById('padmap-text').textContent.indexOf('上＝軸9@-1.00') >= 0, document.getElementById('padmap-text').textContent.slice(0, 80));
    for (const i of [0, 1, 2, 3]) { await ready(); hat.axes[i] = 0.95; await frames(3); hat.axes[i] = i === 0 ? 0.12 : 0; await frames(3); }
    const hs = (JSON.parse(localStorage.getItem('xieyi.pad') || '{}'))[hat.id];
    ok('hat mapping saved: up is {ax 9, at −1}, A is button 2, the stick rest values are kept', hidden('padmap') && PAD.custom && PAD.map.UP && PAD.map.UP.ax === 9 && PAD.map.UP.at === -1 && PAD.map.A === 2 && !!hs && hs.rest && Math.abs(hs.rest[9] - 3.2857) < 1e-6 && Math.abs(hs.rest[0] - 0.12) < 1e-6, hs);
    hat.axes[9] = -1; await frames(3); ok('hat up holds W', g.keys.has('KeyW'));
    hat.axes[9] = -0.7143; await frames(3); ok('hat up-right still counts as up', g.keys.has('KeyW') && !g.keys.has('KeyD'));
    hat.axes[9] = -0.4286; await frames(3); ok('hat right holds D and lets go of W', g.keys.has('KeyD') && !g.keys.has('KeyW'));
    hat.axes[9] = 3.2857; await frames(3); ok('hat back to idle releases everything', !g.keys.has('KeyD') && !g.keys.has('KeyW'));
    hat.axes[0] = 0.4; await frames(3); const drift = !g.keys.has('KeyD'); hat.axes[0] = 0.95; await frames(3);
    ok('stick is read relative to its rest: 0.4 from a 0.12 rest is dead zone, 0.95 walks', drift && g.keys.has('KeyD')); hat.axes[0] = 0.12; await frames(3);
    pressBtn(hat, 2, true); await frames(3); ok('learned A (button 2) holds E', g.keys.has('KeyE')); pressBtn(hat, 2, false); await frames(3);
    pressBtn(hat, 1, true); await frames(3); pressBtn(hat, 1, false); await frames(3); hat.axes[9] = -1; await frames(3);
    ok('while paused, the pause panel shows the live readout with the judged direction', !hidden('pause') && document.getElementById('pause-live').textContent.indexOf('判定：上') >= 0 && document.getElementById('pause-live').textContent.indexOf('9=-1.00★') >= 0 && document.getElementById('pause-live').textContent.indexOf('現在的對應') >= 0, document.getElementById('pause-live').textContent.slice(0, 120));
    hat.axes[9] = 3.2857; await frames(2); pressBtn(hat, 1, true); await frames(3); pressBtn(hat, 1, false); await frames(3); ok('B resumes again', hidden('pause'));
    // —— 另一種帽子軸：閒置 0，上 −1 右 −0.43 下 0.14 左 0.71；左搖桿只有半幅；右搖桿是四顆按鍵
    PAD.useStandard(); navigator.getGamepads = () => []; await until(() => !PAD.seen, 9000);
    const odd = mkPad('Odd pad (Vendor: 0000 Product: 0001)', '', 24, 6); navigator.getGamepads = () => [odd];
    pressBtn(odd, 0, true); await frames(3); pressBtn(odd, 0, false); await frames(3);
    ok('the odd pad opens the wizard too', !hidden('padmap') && PAD.seen);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) { await ready(); pressBtn(odd, i, true); await frames(3); pressBtn(odd, i, false); await frames(3); }
    for (const v of [-1, 0.1429, 0.7143, -0.4286]) { await ready(); odd.axes[4] = v; await frames(3); odd.axes[4] = 0; await frames(3); }   // 帽子軸閒置 0
    await ready(); odd.axes[0] = 0.45; await frames(3); odd.axes[0] = 0; await frames(3);   // 左搖桿往右只到 0.45
    await ready(); odd.axes[1] = 0.45; await frames(3); odd.axes[1] = 0; await frames(3);
    await ready(); pressBtn(odd, 20, true); await frames(3); pressBtn(odd, 20, false); await frames(3);   // 右搖桿往右是鍵 20
    ok('a button for a stick direction adds a step asking the opposite direction', !hidden('padmap') && document.getElementById('padmap-text').textContent.indexOf('右搖桿往左') >= 0, document.getElementById('padmap-text').textContent.slice(0, 40));
    await ready(); pressBtn(odd, 21, true); await frames(3); pressBtn(odd, 21, false); await frames(3);
    await ready(); pressBtn(odd, 22, true); await frames(3); pressBtn(odd, 22, false); await frames(3);   // 右搖桿往下是鍵 22
    await ready(); pressBtn(odd, 23, true); await frames(3); pressBtn(odd, 23, false); await frames(3);   // 往上是鍵 23
    ok('odd pad learned: hat at rest 0, half-range left stick on axes 0/1, right stick as buttons 20/21', hidden('padmap') && PAD.custom && PAD.map.RIGHT && PAD.map.RIGHT.ax === 4 && Math.abs(PAD.map.RIGHT.at + 0.4286) < 1e-6 && PAD.axes.lx[0] === 0 && PAD.axes.rx && PAD.axes.rx.pos === 20 && PAD.axes.rx.neg === 21 && PAD.axes.ry.pos === 22 && PAD.axes.ry.neg === 23, [PAD.map.RIGHT, PAD.axes]);
    odd.axes[4] = -0.4286; await frames(3); ok('hat at rest 0: right (−0.43) holds D', g.keys.has('KeyD') && !g.keys.has('KeyW'));
    odd.axes[4] = 0.1429; await frames(3); ok('hat at rest 0: down (0.14) holds S', g.keys.has('KeyS') && !g.keys.has('KeyD'));
    odd.axes[4] = -1; await frames(3); ok('hat at rest 0: up (−1) holds W', g.keys.has('KeyW') && !g.keys.has('KeyS'));
    odd.axes[4] = 0; await frames(3); ok('hat back to 0 releases', !g.keys.has('KeyW'));
    odd.axes[0] = 0.45; await frames(3); ok('a half-range stick (0.45) still walks', g.keys.has('KeyD')); odd.axes[0] = 0; await frames(3);
    const selA = p.sel; pressBtn(odd, 20, true); await frames(3); pressBtn(odd, 20, false); await frames(3);
    ok('a button-stick to the right cycles the bag like the right stick', p.bag.length < 2 || p.sel === (selA + 1) % p.bag.length);
    // —— 精靈把方向全略過了：沒被綁走的標準十字鍵與左搖桿還是能走（保底）
    PAD.map.UP = -1; PAD.map.DOWN = -1; PAD.map.LEFT = -1; PAD.map.RIGHT = -1; PAD.axes.lx = [4, 1]; PAD.axes.ly = [5, 1];
    pressBtn(odd, 12, true); await frames(3); ok('fallback: standard d-pad button 12 (unbound) still holds W', g.keys.has('KeyW')); pressBtn(odd, 12, false); await frames(3);
    odd.axes[1] = 0.9; await frames(3); ok('fallback: standard left-stick axis 1 (unbound) still holds S', g.keys.has('KeyS')); odd.axes[1] = 0; await frames(3);
    // —— 幅度很小、閒置不在零、Y 反向的搖桿（像 12 位元資料塞在 16 位元欄位裡）：按住一秒多就收，照幅度放大
    PAD.useStandard(); navigator.getGamepads = () => []; await until(() => !PAD.seen, 9000);
    const tiny = mkPad('Tiny stick pad (Vendor: 0000 Product: 0002)', '', 16, 6); tiny.axes[4] = -0.9375; tiny.axes[5] = 0.9375; navigator.getGamepads = () => [tiny];
    pressBtn(tiny, 0, true); await frames(3); pressBtn(tiny, 0, false); await frames(3);
    ok('the tiny-stick pad opens the wizard and nothing walks while the sticks rest off-centre', !hidden('padmap') && !g.keys.has('KeyS') && !g.keys.has('KeyW'));
    for (let i = 0; i < 16; i++) { await ready(); pressBtn(tiny, i, true); await frames(3); pressBtn(tiny, i, false); await frames(3); }
    ok('sixteen buttons learned, now the left stick', document.getElementById('padmap-text').textContent.indexOf('左搖桿往右') >= 0);
    await ready(); tiny.axes[4] = -0.8125; await sleep(400); const early = document.getElementById('padmap-text').textContent.indexOf('左搖桿往右') >= 0; await until(() => document.getElementById('padmap-text').textContent.indexOf('左搖桿往下') >= 0, 3000); tiny.axes[4] = -0.9375; await frames(3);
    ok('a stick that only moves 0.125 is accepted after holding it a second or so', early && document.getElementById('padmap-text').textContent.indexOf('左搖桿往下') >= 0 && document.getElementById('padmap-text').textContent.indexOf('幅0.125') >= 0, document.getElementById('padmap-text').textContent.slice(0, 160));
    await ready(); tiny.axes[5] = 0.8125; await until(() => document.getElementById('padmap-text').textContent.indexOf('右搖桿往右') >= 0, 3000); tiny.axes[5] = 0.9375; await frames(3);
    await ready(); PAD.learnSkip(); await frames(2); PAD.learnSkip(); await frames(3);
    ok('learned: left stick x = axis 4 span 0.125, y = axis 5 inverted span 0.125', hidden('padmap') && PAD.custom && PAD.axes.lx[0] === 4 && PAD.axes.lx[1] === 1 && Math.abs(PAD.axes.lx[2] - 0.125) < 1e-3 && PAD.axes.ly[0] === 5 && PAD.axes.ly[1] === -1, PAD.axes);
    ok('at rest nothing moves', !g.keys.has('KeyS') && !g.keys.has('KeyW') && !g.keys.has('KeyD'));
    tiny.axes[4] = -0.8125; await frames(3); ok('pushing it right (−0.94 → −0.81) walks east', g.keys.has('KeyD')); tiny.axes[4] = -0.9375; await frames(3);
    tiny.axes[5] = 0.8125; await frames(3); ok('pushing it down (inverted: 0.94 → 0.81) walks south', g.keys.has('KeyS') && !g.keys.has('KeyW')); tiny.axes[5] = 0.9375; await frames(3);
    // —— 暫停面板的工具：對調、反向、校正中點、錄讀數
    PAD.swapSticks(); ok('swap sticks moves the learned left stick to the right stick', PAD.axes.rx[0] === 4 && PAD.axes.lx[0] === 2 && (JSON.parse(localStorage.getItem('xieyi.pad'))[tiny.id]).axes.rx[0] === 4);
    PAD.swapSticks(); PAD.flip('ly'); ok('flip y inverts the learned sign and saves it', PAD.axes.ly[1] === 1 && (JSON.parse(localStorage.getItem('xieyi.pad'))[tiny.id]).axes.ly[1] === 1); PAD.flip('ly');
    tiny.axes[4] = -0.8125; PAD.recenter(null, true); await frames(3); ok('recentre takes the current stick position as rest: no walking now', !g.keys.has('KeyD') && Math.abs(PAD.rest[4] + 0.8125) < 1e-6);
    tiny.axes[4] = -0.6875; await frames(3); ok('and pushing further from the new centre walks again', g.keys.has('KeyD')); tiny.axes[4] = -0.9375; PAD.recenter(null, true); await frames(3);
    PAD.recordMs = 400; PAD.record(); await frames(2); pressBtn(tiny, 3, true); tiny.axes[4] = -0.8125; await frames(3); pressBtn(tiny, 3, false); tiny.axes[4] = -0.9375; await until(() => !PAD.recording, 3000); await frames(2);
    const rec = document.getElementById('pause-rec').value;
    ok('the eight-second recorder reports id, counts, pressed buttons, every axis rest/min/max and the current mapping', !PAD.recording && rec.indexOf('山海有形手柄讀數 v2') === 0 && rec.indexOf('16 鍵 6 軸') >= 0 && rec.indexOf('[3]') >= 0 && rec.indexOf('4:-0.94[-0.94,-0.81]★') >= 0 && rec.indexOf('現在的對應') >= 0, rec.slice(0, 200));
    // —— v0.23：一根一直抖的軸（體感）、一根中途卡住的軸，都不能把精靈卡住；存的對應帶版本，舊版的不用；條狀讀數與直接指定
    PAD.useStandard(); navigator.getGamepads = () => []; await until(() => !PAD.seen, 9000);
    const shaky = mkPad('Shaky motion pad (Vendor: 0000 Product: 0003)', '', 16, 7); navigator.getGamepads = () => [shaky];
    let jitOn = true; const jit = () => { if (!jitOn) return; shaky.axes[6] = Math.random() * 0.5 - 0.25; requestAnimationFrame(jit); }; requestAnimationFrame(jit);
    pressBtn(shaky, 0, true); await frames(3); pressBtn(shaky, 0, false); await frames(3);
    ok('the bars show one row per axis and one box per button', !hidden('padmap') && document.querySelectorAll('#padmap-bars .padax').length === 7 && document.querySelectorAll('#padmap-bars .padbtn').length === 16);
    shaky.axes[5] = 0.7;   // 一開精靈就卡在 0.7 的軸：舊精靈會一直等它「回中」
    for (let i = 0; i < 12; i++) { await ready(); pressBtn(shaky, i, true); await frames(2); ok_lit = document.querySelector('#padmap-bars .padbtn[data-i="' + i + '"]').classList.contains('on') && ok_lit; await frames(1); pressBtn(shaky, i, false); await frames(3); }
    ok('a button held down lights its box', ok_lit);
    ok('the jittering axis is set aside as noise and the stuck one does not block the wizard', !!PAD.learning && PAD.learning.noisy[6] === true && !PAD.learning.noisy[5] && document.getElementById('padmap-text').textContent.indexOf('十字鍵上') >= 0, [PAD.learning && PAD.learning.noisy, document.getElementById('padmap-text').textContent.slice(0, 30)]);
    for (const i of [12, 13, 14, 15]) { await ready(); pressBtn(shaky, i, true); await frames(3); pressBtn(shaky, i, false); await frames(3); }
    await ready(); shaky.axes[0] = 0.9; await frames(3); shaky.axes[0] = 0; await frames(3);
    await ready(); shaky.axes[1] = 0.9; await frames(3); shaky.axes[1] = 0; await frames(3);
    await ready(); PAD.learnSkip(); await frames(2); PAD.learnSkip(); await frames(3); jitOn = false; shaky.axes[6] = 0;
    const sv3 = (JSON.parse(localStorage.getItem('xieyi.pad') || '{}'))[shaky.id];
    ok('learned with the noise around: left stick = axes 0 and 1, the saved mapping carries version 3', hidden('padmap') && PAD.axes.lx[0] === 0 && PAD.axes.lx[1] === 1 && PAD.axes.ly[0] === 1 && !!sv3 && sv3.v === 3, [PAD.axes, sv3 && sv3.v]);
    shaky.axes[0] = 0.9; await frames(3); ok('and the stick walks', g.keys.has('KeyD')); shaky.axes[0] = 0; await frames(3);
    const all = JSON.parse(localStorage.getItem('xieyi.pad') || '{}'); all['Old pad (Vendor: 0000 Product: 0004)'] = { buttons: { A: 7 }, axes: {}, rest: {} }; localStorage.setItem('xieyi.pad', JSON.stringify(all));
    ok('a mapping saved by an older version is not used any more', PAD.customFor('Old pad (Vendor: 0000 Product: 0004)') === null && !!PAD.customFor(shaky.id));
    pressBtn(shaky, 1, true); await frames(3); pressBtn(shaky, 1, false); await frames(3);
    ok('the pause panel shows the bars with buttons to set an axis as the left stick', !hidden('pause') && document.querySelectorAll('#pause-bars .padax').length === 7 && !!document.querySelector('#pause-bars button[data-assign="lx"][data-i="2"]'));
    shaky.axes[2] = -0.9; await frames(2); document.querySelector('#pause-bars button[data-assign="lx"][data-i="2"]').click(); shaky.axes[2] = 0;
    ok('clicking 設成左右 on axis 2 while pushing it the other way makes it the left stick x, inverted', PAD.axes.lx[0] === 2 && PAD.axes.lx[1] === -1 && (JSON.parse(localStorage.getItem('xieyi.pad'))[shaky.id]).axes.lx[0] === 2, PAD.axes.lx);
    pressBtn(shaky, 1, true); await frames(3); pressBtn(shaky, 1, false); await frames(3);
    // —— 標準對應但搖桿閒置不在零：第一眼記下閒置值，不會自己走
    PAD.useStandard(); navigator.getGamepads = () => []; await until(() => !PAD.seen, 9000);
    const driftPad = mkPad('Drifty (STANDARD GAMEPAD)', 'standard', 17, 4); driftPad.axes[1] = 0.9; navigator.getGamepads = () => [driftPad];
    pressBtn(driftPad, 1, true); await frames(3); pressBtn(driftPad, 1, false); await frames(3);
    ok('a standard pad whose y axis rests at 0.9 does not walk south by itself', PAD.seen && !g.keys.has('KeyS') && Math.abs(PAD.rest[1] - 0.9) < 1e-6);
    driftPad.axes[1] = 0.2; await frames(3); ok('moving it up from there (0.9 → 0.2) walks north', g.keys.has('KeyW')); driftPad.axes[1] = 0.9; await frames(3);
    // —— v0.25：手柄設定頁，二十個鍵位一個一個設；同一顆不綁兩個
    PAD.useStandard(); navigator.getGamepads = () => []; await until(() => !PAD.seen, 9000);
    const sp = mkPad('Setter (STANDARD GAMEPAD)', 'standard', 17, 4); navigator.getGamepads = () => [sp];
    pressBtn(sp, 1, true); await frames(3); pressBtn(sp, 1, false); await frames(3);
    PAD.openPadset(); await frames(2);
    const ptop = () => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && e.closest('.overlay') && e.closest('.overlay').id; };
    ok('opening 手柄設定 in the game pauses it and the page is the one on top', g.paused && g.userPaused && hidden('pause') && !hidden('padset') && ptop() === 'padset' && !hidden('padset-close') && !hidden('padset-home'), ptop());
    const prow = (n) => document.querySelector('#padset-rows tr[data-n="' + n + '"]'), pcur = (n) => prow(n).querySelector('.cur').textContent;
    ok('the 手柄設定 page lists twenty entries with what each does and what it is bound to now', !hidden('padset') && document.querySelectorAll('#padset-rows tr').length === 20 && pcur('A') === '鍵 1' && prow('A').querySelector('.does').textContent.indexOf('取') >= 0 && pcur('lx') === '軸 0' && pcur('ry') === '軸 3' && /標準對應/.test(document.getElementById('padset-status').textContent) && !prow('A').querySelector('button').disabled, [pcur('A'), pcur('lx')]);
    ok('the page shows the bars too', document.querySelectorAll('#padset-bars .padax').length === 4 && document.querySelectorAll('#padset-bars .padbtn').length === 17);
    prow('A').querySelector('button').click(); await frames(1);
    ok('設定 on A turns the row to listening and says what to press', prow('A').classList.contains('listening') && pcur('A') === '等你按……' && prow('A').querySelector('button').textContent === '取消' && /請按「A/.test(document.getElementById('padset-state').textContent) && hidden('padmap'));
    await ready(); pressBtn(sp, 5, true); await frames(3);
    const psv = (JSON.parse(localStorage.getItem('xieyi.pad') || '{}'))[sp.id];
    ok('pressing button 5 binds A to it, R (which had 5) becomes 無, and it is saved with version 3', !PAD.learning && PAD.map.A === 5 && PAD.map.R === -1 && pcur('A') === '鍵 5' && pcur('R') === '無' && !prow('A').classList.contains('listening') && !!psv && psv.v === 3 && psv.buttons.A === 5 && psv.buttons.R === -1, [PAD.map.A, PAD.map.R, psv]);
    await frames(3); ok('the button still held does not count as a new press on the page', !PAD.learning && !hidden('padset')); pressBtn(sp, 5, false); await frames(3);
    ok('every other entry kept its binding', PAD.map.B === 0 && PAD.map.X === 3 && PAD.map.UP === 12 && PAD.axes.lx[0] === 0 && PAD.custom);
    prow('ly').querySelector('button').click(); await frames(1); await ready(); sp.axes[2] = -0.97; await frames(3); sp.axes[2] = 0; await frames(3);
    ok('setting 左搖桿上下 by pushing axis 2 the wrong way: ly = axis 2 inverted, 右搖桿左右 (axis 2) becomes 無', !PAD.learning && PAD.axes.ly[0] === 2 && PAD.axes.ly[1] === -1 && PAD.axes.rx === null && pcur('ly') === '軸 2（反向）' && pcur('rx') === '無', [PAD.axes.ly, PAD.axes.rx]);
    sp.axes[2] = 0.9; ok('and that axis now reads as up', PAD.axis(sp, 'ly') < -0.5 && PAD.axis(sp, 'rx') === 0, [PAD.axis(sp, 'ly'), PAD.axis(sp, 'rx')]); sp.axes[2] = 0; await frames(3);
    prow('ZL').querySelector('button').click(); await frames(1); document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })); await frames(2);
    ok('Space while listening sets the entry to 無', !PAD.learning && PAD.map.ZL === -1 && pcur('ZL') === '無');
    prow('X').querySelector('button').click(); await frames(1); document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); await frames(2);
    ok('Escape while listening cancels and keeps the old binding; the page stays open', !PAD.learning && PAD.map.X === 3 && pcur('X') === '鍵 3' && !hidden('padset'));
    document.getElementById('padset-std').click(); await frames(2);
    ok('全部改回標準 restores every entry', PAD.map.A === 1 && PAD.map.R === 5 && PAD.map.ZL === 6 && PAD.axes.rx[0] === 2 && PAD.axes.ly[0] === 1 && pcur('A') === '鍵 1' && pcur('rx') === '軸 2' && !PAD.custom && !(JSON.parse(localStorage.getItem('xieyi.pad') || '{}'))[sp.id]);
    const px0 = g.player.x; document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true, cancelable: true })); await frames(2); document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd', bubbles: true }));
    ok('while the page is open the game does not get the keys', !g.keys.has('KeyD') && g.player.x === px0, [g.keys.has('KeyD'), px0, g.player.x, [...g.keys].join(), g.userPaused, g.paused]);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); await frames(2);
    ok('Escape (返回) goes back to the pause panel it came from, still paused', hidden('padset') && !hidden('pause') && g.userPaused && ptop() === 'pause');
    document.getElementById('pause-help').click(); await frames(1);
    ok('the help opened from the pause panel is on top of it', !hidden('help') && ptop() === 'help', ptop());
    document.getElementById('help-pad').click(); await frames(1);
    ok('手柄設定 from that help switches to the page; 返回 puts the pause panel and the help back', !hidden('padset') && hidden('help') && hidden('pause') && ptop() === 'padset' && (document.getElementById('padset-close').click(), !hidden('pause') && !hidden('help') && hidden('padset')));
    document.getElementById('help-pad').click(); await frames(1); pressBtn(sp, 0, true); await frames(3); pressBtn(sp, 0, false); await frames(3);
    ok('B on the pad goes back as well and the game stays paused', hidden('padset') && !hidden('pause') && g.userPaused && g.paused);
    document.getElementById('help').classList.add('hidden'); g.togglePause(); await frames(1);
    PAD.useStandard(); navigator.getGamepads = real; PAD.releaseAll(); PAD.seen = false; PAD.id = ''; PAD.index = -1; const kl = document.getElementById('keys'); if (PAD.keysHtml !== null) kl.innerHTML = PAD.keysHtml; await frames(2); g.keys.clear(); }

// ======== 頁內：v0.26「神兵與彈弓的專鍵」段裡的手柄部分（接在「Y twice」那項之後） ========
    // 手柄：L3 神兵、R3 彈弓、ZL 收神兵、右搖桿上見聞錄、下睡
    const realGp = navigator.getGamepads, fp = { id: 'Keys pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], timestamp: 0 };
    navigator.getGamepads = () => [fp]; PAD.useStandard();
    const pb = async (i) => { fp.buttons[i].pressed = true; fp.buttons[i].value = 1; await frames(3); fp.buttons[i].pressed = false; fp.buttons[i].value = 0; await frames(3); };
    const rs = async (v) => { fp.axes[3] = v; await frames(3); fp.axes[3] = 0; await frames(3); };
    await pb(10); ok('L3 on the pad takes out a god weapon', PAD.seen && held() === '九閽鳴雷');
    await pb(6); ok('ZL puts it away', held() === '石刀');
    await pb(11); ok('R3 takes out the slingshot', held() === '彈弓');
    await pb(11); ok('R3 again puts it away', held() === '石刀');
    await rs(-0.9); ok('right stick up opens 見聞錄', !hidden('journal'));
    await rs(-0.9); ok('and up again closes it', hidden('journal'));
    g.msgText = ''; await rs(0.9); ok('right stick down is 睡 (no bed here, so it says so)', g.msgText.indexOf('床') >= 0 || g.msgText.indexOf('睡') >= 0, g.msgText);
    const sel0 = p.sel; fp.axes[2] = 0.7; fp.axes[3] = 0.9; await frames(3); fp.axes[2] = 0; fp.axes[3] = 0; await frames(3);
    ok('a push mostly downward does not also flip the bag slot', p.sel === sel0);
    PAD.releaseAll(); navigator.getGamepads = realGp; PAD.seen = false; PAD.id = ''; PAD.index = -1; const kl = document.getElementById('keys'); if (PAD.keysHtml !== null) kl.innerHTML = PAD.keysHtml;

// ======== 起始頁：手柄的幾項（原本在「渡海帶走的膽氣」之後、「起始頁的文字選項」之前） ========
  // 起始頁也吃手柄：十字鍵在存檔格之間移焦點，A 選那格
  await page.goto(base, { waitUntil: 'load' });
  const padStart = await page.evaluate(async () => {
    const f = { id: 'Fake Pro', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [f];
    const frames = (n) => new Promise((res) => { let k = 0; const t = () => { if (++k >= n) res(); else requestAnimationFrame(t); }; requestAnimationFrame(t); });
    const before = document.querySelector('.save-card.on').dataset.slot;
    f.buttons[15].pressed = true; await frames(3); f.buttons[15].pressed = false; await frames(3);
    const focused = document.querySelector('#start .padfocus');
    f.buttons[1].pressed = true; await frames(3); f.buttons[1].pressed = false; await frames(3);
    return { before, focusedSlot: focused && focused.dataset.slot, after: document.querySelector('.save-card.on').dataset.slot, started: !!window.XIEYI, hint: document.getElementById('new-hint').textContent };
  });
  ok2('on the start screen the d-pad moves the focus to the next save card (even an empty one) and A picks it', padStart.before === '2' && padStart.focusedSlot === '3' && padStart.after === '3' && !padStart.started, padStart);
  await page.evaluate(() => { navigator.getGamepads = () => []; });
  await page.goto(base, { waitUntil: 'load' }); await page.click('#btn-pad'); await page.waitForTimeout(100);
  const ptop = () => page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && e.closest('.overlay') && e.closest('.overlay').id; });
  const ps0 = await page.evaluate(() => ({ open: !document.getElementById('padset').classList.contains('hidden'), start: !document.getElementById('start').classList.contains('hidden'), rows: document.querySelectorAll('#padset-rows tr').length, status: document.getElementById('padset-status').textContent, dis: document.querySelector('#padset-rows button').disabled, label: document.getElementById('btn-pad').textContent, home: !document.getElementById('padset-home').classList.contains('hidden'), back: !document.getElementById('padset-close').classList.contains('hidden') }));
  ps0.top = await ptop();
  ok2('the start page 手柄設定 button switches to the twenty-entry page (the start page is put away); without a pad it says to press a button first', ps0.open && !ps0.start && ps0.top === 'padset' && ps0.rows === 20 && /還沒看到手柄/.test(ps0.status) && ps0.dis && ps0.label === '手柄設定' && ps0.home && !ps0.back, ps0);
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  ok2('Enter on the page does not start a game behind it', await page.evaluate(() => !window.XIEYI && !document.getElementById('padset').classList.contains('hidden')));
  await page.click('#padset-home'); await page.waitForTimeout(80);
  ok2('回到主頁 goes back to the start page', await page.evaluate(() => document.getElementById('padset').classList.contains('hidden') && !document.getElementById('start').classList.contains('hidden')) && await ptop() === 'start');
  await page.click('#btn-help'); await page.waitForTimeout(80);
  ok2('生存之道 on the start page shows on top of it', await ptop() === 'help', await ptop());
  await page.click('#help-pad'); await page.waitForTimeout(80);
  ok2('手柄設定 from that help switches to the page; Esc goes back to the help over the start page', await ptop() === 'padset' && (await page.keyboard.press('Escape'), await page.waitForTimeout(80), await ptop()) === 'help' && await page.evaluate(() => !document.getElementById('start').classList.contains('hidden')));
  await page.click('#help-close'); await page.waitForTimeout(50);
  const wiz = await page.evaluate(async () => { const f = { id: 'Fake Pro', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [f];
    const frames = (n) => new Promise((res) => { let k = 0; const t = () => { if (++k >= n) res(); else requestAnimationFrame(t); }; requestAnimationFrame(t); });
    const top = () => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && e.closest('.overlay') && e.closest('.overlay').id; };
    f.buttons[1].pressed = true; await frames(3); f.buttons[1].pressed = false; await frames(3); document.getElementById('btn-pad').click(); await frames(2);
    const st = document.getElementById('padset-status').textContent, a = document.querySelector('#padset-rows tr[data-n="A"] .cur').textContent;
    document.getElementById('padset-wizard').click(); await frames(2);
    const r = { st, a, closed: document.getElementById('padset').classList.contains('hidden'), open: !document.getElementById('padmap').classList.contains('hidden'), top: top(), text: document.getElementById('padmap-text').textContent.slice(0, 20) };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); await frames(2);
    r.back = !document.getElementById('padset').classList.contains('hidden') && document.getElementById('padmap').classList.contains('hidden') && top() === 'padset';
    document.getElementById('padset-home').click(); await frames(2); r.home = top() === 'start'; return r; });
  ok2('with a pad seen, the page names it and its bindings; 照順序全部學一遍 brings the wizard on top, Esc comes back to the page, 回到主頁 to the start page', /Fake Pro/.test(wiz.st) && wiz.a === '鍵 1' && wiz.closed && wiz.open && wiz.top === 'padmap' && /第 1／20 步/.test(wiz.text) && wiz.back && wiz.home, wiz);
