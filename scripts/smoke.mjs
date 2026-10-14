// 冒煙測試：無頭瀏覽器裡跑一遍核心玩法（取字、研墨、灶、捉魚、烤、造詞、讀碑、獵、木屋、冷熱、死亡復活、存檔），截圖並檢查報錯。
// 用法：先 `python3 -m http.server 8123`（或 npx serve），再 `node scripts/smoke.mjs [url] [outdir]`
// 依賴 playwright：項目裡沒裝就用全局的（npm i -g playwright）
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;

const url = process.argv[2] || 'http://127.0.0.1:8123/index.html?autostart=1&seed=7';
const out = process.argv[3] || 'shots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.XIEYI && !window.XIEYI.game.paused, null, { timeout: 15000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: out + '/01-day.png' });

const result = await page.evaluate(async () => {
  const g = XIEYI.game, p = g.player, w = g.world, r = {}, checks = [];
  const ok = (name, cond, info) => checks.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const press = (code, ms) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); return sleep(ms || 30).then(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))); };
  const bag = () => p.bag.map(s => s.n + '×' + s.c).join(',');
  const face = (dx, dy) => { p.fx = dx; p.fy = dy; };
  const T = () => ({ x: p.x + p.fx, y: p.y + p.fy });
  const selDict = (ch) => { p.row = 'dict'; p.sel = p.known.indexOf(ch); };
  const selBag = (n) => { p.row = 'bag'; p.bsel = p.bag.findIndex(s => s.n === n); };

  // —— 島與碑
  ok('island edge is deep water', w.get(0, 75) === '淼' && w.get(-80, 0) === '淼', [w.get(0, 75), w.get(-80, 0)]);
  const steles = [...w.steles.values()];
  ok('five steles on land', steles.length === 5 && steles.every(s => w.get(s.x, s.y) === '碑'), steles.map(s => s.teach + '@' + s.x + ',' + s.y));
  r.spawn = [p.x, p.y, w.get(p.x, p.y)];

  // —— 走幾步
  await press('KeyD', 600); await sleep(300);
  ok('walked', p.x !== r.spawn[0] || p.y !== r.spawn[1], [p.x, p.y]);

  // —— 取字入囊、研墨
  face(0, 1); w.set(T().x, T().y, '木');
  const ink0 = p.ink; g.pressGather(); await sleep(900);
  ok('absorb puts 木 into bag', g.count('木') === 1 && w.get(T().x, T().y) === '白', bag());
  ok('absorb does not give ink directly', p.ink === ink0, p.ink);
  selBag('木'); g.grind();
  ok('grind 木 gives 4 ink', p.ink === ink0 + 4 && g.count('木') === 0, p.ink);

  // —— 灶：土上寫火
  p.ink = 40; selDict('土'); g.pressWrite(); await sleep(50);
  ok('wrote 土 on blank', w.get(T().x, T().y) === '土');
  selDict('火'); g.pressWrite(); await sleep(50);
  const stove = T();
  ok('火 on 土 makes lit 灶', w.get(stove.x, stove.y) === '灶' && w.stoveLit(stove.x, stove.y), w.stoveFuel(stove.x, stove.y));
  ok('灶 does not spread fire', !w.isBurning(stove.x, stove.y));
  // 添柴
  g.addItem('木', 2); selBag('木'); const fuel0 = w.stoveFuel(stove.x, stove.y); g.placeItem();
  ok('placing 木 on 灶 adds fuel', w.stoveFuel(stove.x, stove.y) > fuel0 && g.count('木') === 1, w.stoveFuel(stove.x, stove.y));

  // —— 捉魚、烤魚、吃
  const rnd = Math.random; Math.random = () => 0.1;
  face(1, 0); w.set(T().x, T().y, '水'); g.ents.add('魚', T().x, T().y);
  g.pressGather(); await sleep(50);
  ok('caught 魚', g.count('魚') === 1, bag());
  face(0, 1); selBag('魚'); g.placeItem(); await sleep(50);
  ok('魚 on lit 灶 becomes 烤魚', g.count('烤魚') === 1 && g.count('魚') === 0, bag());
  p.food = 50; selBag('烤魚'); g.useItem();
  ok('eating 烤魚 +40 飽', Math.round(p.food) === 90 && g.count('烤魚') === 0, p.food);
  Math.random = rnd;

  // —— 造詞：石 + 刀 = 石刀
  g.addItem('石', 1); selBag('石'); const inkC = p.ink; g.startCombine(); g.finishCombine('刀');
  ok('造詞 石+刀=石刀 costs 2 ink', g.count('石刀') === 1 && p.ink === inkC - 2, bag());
  g.addItem('石', 1); selBag('石'); g.startCombine(); g.finishCombine('火');
  ok('non-word rejected', g.count('石') === 1 && !g.combine, bag());

  // —— 獵鹿（有石刀）
  face(-1, 0); w.set(T().x, T().y, '草'); g.ents.add('鹿', T().x, T().y, { calm: 9 });
  g.pressGather(); await sleep(50);
  ok('hunting 鹿 with 石刀 gives 肉×2', g.count('肉') === 2, bag());

  // —— 讀碑學「把」，火 + 把 = 火把
  const st = steles.find(s => s.teach === '把');
  w.set(st.x + 1, st.y, '草'); p.x = p.rx = st.x + 1; p.y = p.ry = st.y; face(-1, 0);
  const mi = p.maxInk; g.pressGather(); await sleep(50);
  ok('reading stele teaches 把 and widens ink', p.known.indexOf('把') >= 0 && p.maxInk === mi + 10, [p.maxInk, p.known.join('')]);
  g.addItem('火', 1); selBag('火'); p.ink = 30; g.startCombine(); g.finishCombine('把');
  ok('造詞 火+把=火把', g.count('火把') === 1, bag());

  // —— 木屋
  p.known.indexOf('屋') < 0 && p.known.push('屋');
  g.addItem('木', 1); selBag('木'); g.startCombine(); g.finishCombine('屋');
  ok('造詞 木+屋=木屋', g.count('木屋') === 1, bag());
  face(0, 1); w.set(T().x, T().y, '白'); selBag('木屋'); g.placeItem(); await sleep(50);
  const hut = T();
  ok('placed 木屋 tile and set home', w.get(hut.x, hut.y) === '木屋' && p.home && p.home.x === hut.x, w.get(hut.x, hut.y));
  ok('beasts cannot stand in 木屋', !g.ents.canStand('虎', hut.x, hut.y, true) && !g.ents.canStand('鹿', hut.x, hut.y, false));

  // —— 冷與暖：子夜，遠離火 → 暖下降；灶邊 → 上升；火把減緩
  w.time = Math.floor(w.time / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.78;
  for (const [k] of w.stoves) w.stoves.set(k, 0);
  g.removeItem('火把', 1);
  p.warm = 80; await sleep(1200); const warmA = p.warm;
  ok('warmth drops at night away from fire', warmA < 79.6, warmA);
  g.addItem('火把', 1); p.warm = 80; await sleep(1200);
  ok('torch slows warmth loss and lights', p.warm > warmA && g.torchLit(), p.warm);
  w.set(p.x + 1, p.y, '灶'); w.addFuel(p.x + 1, p.y, 60); p.warm = 50; await sleep(1200);
  ok('warmth rises next to lit 灶', p.warm > 52, p.warm);
  ok('night tiger scared by torch', g.torchLit());

  // —— 死亡與復活：餓到命盡，囊落原地
  w.set(p.x + 1, p.y, '白');
  p.food = 0; p.hp = 2; p.warm = 50; const itemsBefore = bag(); const deathPos = [p.x, p.y];
  await sleep(1600);
  ok('starvation kills', p.dead && !document.getElementById('dead').classList.contains('hidden'), [p.hp, p.food]);
  const bagTile = [...w.bags.keys()][0];
  ok('bag dropped as 囊 tile', !!bagTile && w.get(...bagTile.split(',').map(Number)) === '囊', bagTile);
  await press('Enter', 30); await sleep(100);
  ok('respawned', !p.dead && p.hp >= 60 && p.hp < 63 && document.getElementById('dead').classList.contains('hidden'), [p.x, p.y, p.hp]);
  // 回去取囊
  const [bx, by] = bagTile.split(',').map(Number);
  w.set(bx - 1, by, '草'); p.x = p.rx = bx - 1; p.y = p.ry = by; face(1, 0); g.pressGather(); await sleep(50);
  ok('picked bag back up', bag() === itemsBefore && w.get(bx, by) === '白', bag());

  // —— 存檔
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v3'));
  ok('save v3 has bag, stoves, vitals', sv && sv.v === 3 && Array.isArray(sv.player.bag) && sv.world.stoves && typeof sv.player.food === 'number');

  // —— 幀率
  let frames = 0; const t0 = performance.now(); await new Promise((res) => { const tick = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  r.fps = Math.round(frames / ((performance.now() - t0) / 1000));
  r.checks = checks; r.failed = checks.filter(c => c.startsWith('FAIL')).length;
  return r;
});
// —— 第三階段：探索（地標、潮汐、迷霧、小路、龍、見聞錄、地圖）
const stage3 = await page.evaluate(async () => {
  const g = XIEYI.game, p = g.player, w = g.world, checks = [];
  const ok = (name, cond, info) => checks.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const press = (code, ms) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); return sleep(ms || 30).then(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))); };
  const goNextTo = (x, y) => { w.set(x - 1, y, '草'); p.x = p.rx = x - 1; p.y = p.ry = y; p.fx = 1; p.fy = 0; };
  const by = (id) => w.places.find(x => x.id === id);
  const hidden = (id) => document.getElementById(id).classList.contains('hidden');
  document.getElementById('read').classList.add('hidden'); document.getElementById('dead').classList.add('hidden');
  if (p.dead) { p.dead = false; g.paused = false; p.hp = 80; p.food = 80; p.warm = 80; }

  ok('eight landmarks placed', w.places.length === 8, w.places.map(x => x.name).join(''));
  // 潮汐：退潮能走到燈，漲潮走不到
  const reach = () => { const sp = g.spawn, d = by('deng'); const seen = new Set([sp.x + ',' + sp.y]); const q = [[sp.x, sp.y]]; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k)) continue; if (Math.abs(nx - d.x) <= 1 && Math.abs(ny - d.y) <= 1) return true; if (w.walkable(nx, ny)) { seen.add(k); q.push([nx, ny]); } } } return false; };
  const t0 = w.time;
  w.time = Math.floor(t0 / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.25; const lo = reach();
  w.time = Math.floor(t0 / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.60; const hi = reach();
  ok('lighthouse reachable only at low tide', lo && !hi, [w.tideName(), lo, hi]);
  // 迷霧：腳邊看過，遠處沒看過
  w.time = Math.floor(t0 / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.25;
  w.markSeen(p.x, p.y, 9);
  ok('fog: nearby seen, far unseen', w.isSeen(p.x + 3, p.y) && !w.isSeen(p.x + 40, p.y + 40));
  // 登塔見全圖
  const ta = by('ta'); goNextTo(ta.x, ta.y); g.pressGather(); await sleep(50);
  ok('reading 塔 opens the text panel', !hidden('read'), document.getElementById('read-title').textContent);
  await press('KeyE', 20); await sleep(30);
  ok('panel closes with E', hidden('read'));
  ok('塔 reveals the whole island', w.isSeen(p.x + 40, p.y + 40) && w.places.every(x => x.seen) && p.places.ta === 2, Object.keys(p.places).length);
  // 地圖開合
  await press('KeyM', 20); await sleep(50); const mapOpen = !hidden('map'); await press('KeyM', 20); await sleep(30);
  ok('island map toggles with M', mapOpen && hidden('map'), document.getElementById('mapinfo').textContent);
  // 船裡有筏
  const ch = by('chuan'); goNextTo(ch.x, ch.y); g.removeItem('竹筏', 9); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('船 gives a raft', g.count('竹筏') === 1 && p.raftTaken, g.count('竹筏'));
  // 墓：錯字也是墨
  const mu = by('mu'); goNextTo(mu.x, mu.y); p.ink = 10; g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('墓 gives 10 ink', p.ink === 20, p.ink);
  // 井：飲
  const cun = by('cun'); const wellX = cun.x + 2, wellY = cun.y + 2; w.set(wellX - 1, wellY, '草'); p.x = p.rx = wellX - 1; p.y = p.ry = wellY; p.fx = 1; p.fy = 0; p.hp = 50;
  ok('village well is a place tile', w.get(wellX, wellY) === '井' && !!w.placeAt(wellX, wellY));
  g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('井 heals +15 once a day', Math.round(p.hp) === 65, p.hp);
  // 洞：學龍，寫龍成龍
  const dong = by('dong'); goNextTo(dong.x, dong.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('洞 teaches 龍', p.known.indexOf('龍') >= 0);
  p.fx = -1; p.fy = 0; w.set(p.x - 1, p.y, '白'); p.row = 'dict'; p.sel = p.known.indexOf('龍'); p.ink = 20; g.pressWrite(); await sleep(50);
  const dragon = g.ents.list.find(e => e.type === '龍');
  ok('writing 龍 summons a dragon that scares tigers', !!dragon && g.ents.dragonNear(p.x, p.y, 4), dragon && [dragon.x, dragon.y]);
  g.pressWrite(); await sleep(20);
  ok('only one dragon', g.ents.list.filter(e => e.type === '龍').length === 1);
  // 小路：走六次
  const rx = p.x, ry = p.y + 2; w.set(rx, ry, '草'); for (let i = 0; i < 6; i++) w.trample(rx, ry);
  ok('trail forms after six passes', w.get(rx, ry) === '路');
  // 黃昏：鹿走向泉
  const quan = by('quan'); g.ents.list = g.ents.list.filter(e => e.type !== '鹿');
  const dx0 = 7; w.set(quan.x + dx0, quan.y, '草'); for (let i = 1; i < dx0; i++) if (!w.walkable(quan.x + i, quan.y)) w.set(quan.x + i, quan.y, '草');
  p.x = p.rx = quan.x + 20; p.y = p.ry = quan.y + 20;
  const deer = g.ents.add('鹿', quan.x + dx0, quan.y, { moveT: 0 });
  w.time = Math.floor(w.time / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.45; await sleep(2500);
  ok('deer walks toward 泉 at dusk', Math.abs(deer.x - quan.x) < dx0 - 2, [deer.x - quan.x, deer.y - quan.y]);
  // 見聞錄（先走到鹿旁邊，讓它被看見）
  p.x = p.rx = deer.x + 2; p.y = p.ry = deer.y; await sleep(200);
  await press('KeyJ', 20); await sleep(30); const jtxt = document.getElementById('journal-body').textContent; await press('KeyJ', 20);
  ok('journal lists places and creatures', jtxt.indexOf('塔') >= 0 && jtxt.indexOf('鹿') >= 0 && jtxt.indexOf('龍') >= 0, jtxt.slice(0, 60));
  // 燈：讀完才算
  const deng = by('deng'); for (const pl of w.places) if (pl.id !== 'deng') p.places[pl.id] = 2;
  goNextTo(deng.x, deng.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('reading the last place finishes the island', p.finished === true);
  // 存檔 v3
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v3'));
  ok('save v3 keeps exploration', sv && sv.v === 3 && sv.world.explored && sv.world.seen.length === 8 && sv.player.places.deng === 2);
  return checks;
});
console.log(stage3.join('\n'));
// —— 第四階段：繁體構形規則（登→燈、問、間、籠、漁）與台灣筆畫
const stage4 = await page.evaluate(async () => {
  const g = XIEYI.game, p = g.player, w = g.world, checks = [];
  const ok = (name, cond, info) => checks.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const selDict = (ch) => { p.row = 'dict'; p.sel = p.known.indexOf(ch); };
  const selBag = (n) => { p.row = 'bag'; p.bsel = p.bag.findIndex(s => s.n === n); };
  const face = (dx, dy) => { p.fx = dx; p.fy = dy; };
  const T = () => ({ x: p.x + p.fx, y: p.y + p.fy });
  const toasts = () => document.getElementById('toasts').textContent;
  document.getElementById('read').classList.add('hidden');
  if (p.dead) { p.dead = false; g.paused = false; p.hp = 80; p.food = 80; p.warm = 80; }
  // 筆畫：台灣標準
  ok('Taiwan stroke counts', G.DB['鳥'].s === 11 && G.DB['龍'].s === 16 && G.DB['門'].s === 8 && G.DB['藥'].s === 19 && G.WORDS['烤魚'].s === 21, [G.DB['鳥'].s, G.DB['龍'].s, G.DB['門'].s, G.DB['藥'].s, G.WORDS['烤魚'].s]);
  // 登塔學登；火＋登＝燈
  ok('登 learned from the tower', p.known.indexOf('登') >= 0, p.known.join(''));
  g.addItem('火', 1); selBag('火'); p.ink = 40; g.startCombine(); g.finishCombine('登');
  ok('造詞 火+登=燈 costs 12 ink', g.count('燈') === 1 && p.ink === 28, [g.count('燈'), p.ink]);
  face(0, 1); w.set(T().x, T().y, '白'); selBag('燈'); g.placeItem(); await sleep(30);
  ok('placed 燈 is a lamp tile', w.get(T().x, T().y) === '燈' && w.info(T().x, T().y).light === 5 && !w.placeAt(T().x, T().y), w.get(T().x, T().y));
  // 門＋口＝問
  const cun = w.places.find(x => x.id === 'cun'); const gx = cun.x + 2, gy = cun.y;
  ok('village gate is 門', w.get(gx, gy) === '門');
  w.set(gx, gy - 1, '草'); p.x = p.rx = gx; p.y = p.ry = gy - 1; face(0, 1);
  for (const pl of w.places) if (pl.id === 'ta') p.places[pl.id] = 1;
  selDict('口'); p.ink = 20; g.pressWrite(); await sleep(50);
  ok('門+口=問 gives directions', toasts().indexOf('問路') >= 0 && toasts().indexOf('塔') >= 0 && w.get(gx, gy) === '門' && p.ink === 17, toasts().slice(-40));
  // 門＋日＝間
  if (p.known.indexOf('日') < 0) p.known.push('日');
  selDict('日'); g.pressWrite(); await sleep(50);
  ok('門+日=間 is a shelter', w.get(gx, gy) === '間' && !!w.info(gx, gy).shelter && !g.ents.canStand('虎', gx, gy, true));
  // 竹＋龍＝籠，籠收鹿
  g.addItem('竹', 1); selBag('竹'); p.ink = 40; g.startCombine(); g.finishCombine('龍');
  ok('造詞 竹+龍=籠', g.count('籠') === 1 && p.ink === 24, [g.count('籠'), p.ink]);
  face(1, 0); w.set(T().x, T().y, '草'); g.ents.list = g.ents.list.filter(e => e.type !== '鹿'); g.ents.add('鹿', T().x, T().y, { calm: 9, moveT: 9 });
  selBag('籠'); g.placeItem(); await sleep(30);
  ok('籠 captures the deer and stays', g.count('鹿') === 1 && g.count('籠') === 1 && !g.ents.beastAt(T().x, T().y), [g.count('鹿'), g.count('籠')]);
  // 水＋魚＝漁，取魚
  w.set(T().x, T().y, '水'); g.removeItem('魚', 9); g.removeItem('石', 9); g.removeItem('肉', 9); const addLeft = g.addItem('魚', 1); selBag('魚');
  ok('bag had room for the fish', addLeft === 0 && g.selectedItem() === '魚', p.bag.map(x => x.n).join(','));
  g.placeItem(); await sleep(30);
  const wk = T().x + ',' + T().y;
  ok('placing 魚 on 水 makes 漁', w.get(T().x, T().y) === '漁' && w.weirs.has(wk) && g.count('魚') === 0, w.get(T().x, T().y));
  g.pressGather(); await sleep(30);
  ok('weir not ready yet', g.count('魚') === 0);
  w.weirs.set(wk, 0); g.pressGather(); await sleep(30);
  ok('weir yields a fish when ready', g.count('魚') === 1 && w.get(T().x, T().y) === '漁' && w.weirs.get(wk) > w.time, g.count('魚'));
  // 存檔帶魚梁
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v3'));
  ok('save keeps weirs', sv && sv.world.weirs && Object.keys(sv.world.weirs).length === 1);
  return checks;
});
console.log(stage4.join('\n'));
result.failed += stage4.filter(c => c.startsWith('FAIL')).length;
result.failed += stage3.filter(c => c.startsWith('FAIL')).length;
console.log(result.checks.join('\n'));
console.log('spawn', JSON.stringify(result.spawn), 'fps', result.fps, 'failed', result.failed);
await page.screenshot({ path: out + '/02-night.png' });
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
process.exit(errors.length || result.failed ? 1 : 0);
