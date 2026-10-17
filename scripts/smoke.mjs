// 冒煙測試：無頭瀏覽器裡跑一遍核心玩法（採集、製作、磨礪、放置、戰鬥、睡覺、發酵、魄夜、毒、稻草人、愜意、膽氣、瓶酒、櫃、船、地標、潮汐、存檔），截圖並檢查報錯。
// 用法：先 `python3 -m http.server 8123`，再 `NODE_PATH=$(npm root -g) node scripts/smoke.mjs [url] [outdir]`
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
  const g = XIEYI.game, p = g.player, w = g.world, DAY = XIEYI.DAY, checks = [], r = {};
  const ok = (name, cond, info) => checks.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const press = (code, ms) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); return sleep(ms || 30).then(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))); };
  const face = (dx, dy) => { p.fx = dx; p.fy = dy; };
  const T = () => ({ x: p.x + p.fx, y: p.y + p.fy });
  const hold = (n) => { const ti = p.tools.findIndex(s => s.n === n); if (ti >= 0) { p.tool = ti; return true; } const i = p.bag.findIndex(s => s.n === n); p.sel = i < 0 ? 0 : i; return i >= 0; };
  const tool = (n) => p.tools.find(s => s.n === n);
  const unarm = () => { p.tool = -1; };
  const bag = () => p.bag.map(s => s.n + '×' + s.c + (s.dur !== undefined ? '(' + s.dur + ')' : '')).join(',');
  const clearBag = () => { p.bag = []; p.sel = 0; };
  const trim = (keep) => { p.bag = p.bag.filter(s => keep.indexOf(s.n) >= 0); p.sel = 0; g.barSig = ''; };
  const toasts = () => document.getElementById('toasts').textContent;
  const hidden = (id) => document.getElementById(id).classList.contains('hidden');
  const takeYes = () => { if (!hidden('takeask')) document.getElementById('takeask-yes').click(); };   // 拆人造的東西會先問，測試裡直接答「拆」
  const calm = () => { p.san = 100; p.insane = false; p.ctrl = true; p.zeroSan = 0; p.hp = Math.max(p.hp, 60); p.knock = 0; setDay(0.53); g.ents.list = g.ents.list.filter(e => e.type !== '魄'); g.action = null; g.keys.clear(); };   // 測試裡真實時間會過，夜裡魄把愜意吸到零人就「手腳不聽使喚」；長等待之後先弄清醒
  const goNextTo = (x, y) => { w.set(x - 1, y, '草'); p.x = p.rx = x - 1; p.y = p.ry = y; face(1, 0); };
  const setDay = (frac) => { w.time = Math.floor(w.time / DAY) * DAY + DAY * frac; };
  const until = async (cond, ms) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < (ms || 8000)) await sleep(40); return cond(); };
  const gather = async (ch) => { face(0, 1); w.set(T().x, T().y, ch); g.action = null; g.pressGather(); await until(() => !g.action, 12000); };

  try {
  g.ents.seaP = 0;   // 蜃也是：專門的海上測試自己開
  w.fogP = 0;   // 霧障是真隨機的，測試途中跳出彈窗會把遊戲停住；專門的霧障測試自己開
  g.warnEnabled = false; w.fogStep = 1e9;   // 數值提醒的彈窗與霧障的挪動也先關掉，各自的測試再開
  g.ents.snuffP = 0; g.ents.dashT = 1e9;   // 魄吹燈與撲燈也是真隨機、真時間：專門的測試自己開
  // ============ A. 島與採集 ============
  ok('the island is twice the old area: radius 85, sea edge 113, deep water beyond', G.ISLAND_R === 85 && G.SEA_EDGE === 113 && w.get(0, G.ISLAND_R + 20) === '淼' && w.get(-(G.ISLAND_R + 25), 0) === '淼');
  ok('eight landmarks placed', w.places.length === 8, w.places.map(x => x.name).join(''));
  ok('five steles', w.steles.size === 5);
  const sp0 = [p.x, p.y]; await press('KeyD', 600); await sleep(300);
  ok('walked', p.x !== sp0[0] || p.y !== sp0[1]);
  clearBag();
  await gather('木');
  ok('gathering 木 gives 木 and leaves blank', g.count('木') === 1 && w.get(T().x, T().y) === '白', bag());
  await gather('棉');
  ok('gathering 棉 gives 棉×2, leaves 草', g.count('棉') === 2 && w.get(T().x, T().y) === '草', bag());
  await gather('礫');
  ok('gathering 礫 gives 石子×2, leaves 沙', g.count('石子') === 2 && w.get(T().x, T().y) === '沙', bag());
  await gather('石');
  ok('gathering 石 by hand takes 3 s', g.count('石') >= 1, bag());
  face(0, 1); w.set(T().x, T().y, '山'); g.pressGather(); await sleep(50);
  ok('山 needs a pickaxe', !g.action && w.get(T().x, T().y) === '山');
  await gather('果');
  const fruit = p.bag.find(s => s.n === '果');
  ok('gathering 果 stamps each piece with the day', fruit && fruit.c === 2 && Array.isArray(fruit.ds) && fruit.ds.length === 2 && fruit.ds.every(d => d === g.day()) && w.get(T().x, T().y) === '木', bag());
  p.food = 50; hold('果'); g.useItem();
  ok('fresh 果 is edible (+20)', Math.round(p.food) === 70 && g.count('果') === 1, [p.food, g.count('果')]);

  // ============ B. 製作與磨礪 ============
  clearBag(); g.addItem('土', 4); g.addItem('草', 6); g.addItem('木', 12); g.addItem('棉', 10); g.addItem('石', 12); g.addItem('石子', 8); g.addItem('竹', 12);
  p.sta = 100;
  g.craft('brick'); ok('brick recipe: 2 磚 for 2 土 1 草, 3 力', g.count('磚') === 2 && g.count('土') === 2 && g.count('草') === 5 && p.sta === 97, [bag(), p.sta]);
  g.craft('door'); g.craft('bed'); g.craft('stove'); g.craft('torch');
  g.removeItem('竹', 99); g.removeItem('棉', 99);   // 騰出格子
  g.craft('lamp');
  ok('door/bed/stove/torch(×4 from 石子1 草3 木2)/lamp crafted', g.count('門') === 1 && g.count('床') === 1 && g.count('灶') === 1 && g.count('火把') === 3 && g.count('燈') === 1, bag());
  g.removeItem('土', 99); g.removeItem('草', 99); g.removeItem('燈', 99); g.removeItem('火把', 99);   // 騰出格子，工具不疊
  g.craft('grind', '石劍'); g.craft('grind', '石鎬'); g.craft('grind', '石斧'); g.craft('grind', '石鋤');
  const sword = tool('石劍');
  ok('grinding makes tools with durability and they go to the tool bar', !!sword && sword.dur === 40 && tool('石鎬') && tool('石斧') && tool('石鋤') && p.tools.length === 4 && !p.bag.some(s => s.dur !== undefined), bag());
  const staBefore = p.sta; p.sta = 2; const bricks = g.count('磚'); g.craft('brick');
  ok('crafting needs stamina', g.count('磚') === bricks && p.sta === 2); p.sta = staBefore;
  sword.dur = 5; hold('石劍'); const pebbles = g.count('石子'); g.craft('regrind');
  ok('regrind restores durability for one 石子', sword.dur === 40 && g.count('石子') === pebbles - 1, [sword.dur, g.count('石子')]);
  await press('KeyC', 20); await sleep(30);
  ok('craft panel opens with C and lists recipes', !hidden('craft') && document.querySelectorAll('#craft-list .recipe').length === G.RECIPES.length);
  ok('sixteen bag slots', document.querySelectorAll('#bagbar .slot').length === 16);
  ok('craft panel has category buttons on the left, 全部 selected', document.querySelectorAll('#craft-cats button').length === G.CRAFT_CATS.length && document.querySelector('#craft-cats button.on').textContent.indexOf('全部') === 0);
  [...document.querySelectorAll('#craft-cats button')].find(b => b.textContent.indexOf('衣甲') === 0).click(); await sleep(30);
  ok('picking 衣甲 shows only armour recipes and digit keys follow the visible list', document.querySelectorAll('#craft-list .recipe').length === G.RECIPES.filter(r => r.cat === '衣甲').length && g.visibleRecipes()[0].id === 'lining' && [...document.querySelectorAll('#craft-list .recipe b')].every(b => b.textContent.indexOf('磚') < 0));
  ok('every recipe has a category', G.RECIPES.every(r => G.CRAFT_CATS.indexOf(r.cat) > 0));
  [...document.querySelectorAll('#craft-cats button')].find(b => b.textContent.indexOf('全部') === 0).click(); await sleep(30);
  ok('six tool slots', document.querySelectorAll('#toolbar .slot').length === 6 && document.querySelectorAll('#toolbar .slot.sel').length === 1);
  await press('KeyC', 20); await sleep(30); ok('craft panel closes', hidden('craft'));

  // ============ C. 放置、擋路、灶、鋤、鎬 ============
  face(1, 0); w.set(T().x, T().y, '白'); hold('磚'); g.pressPlace();
  ok('placed 磚 blocks beasts and ghosts', w.get(T().x, T().y) === '磚' && !g.ents.canStand('虎', T().x, T().y, true) && !g.ents.canStand('狼', T().x, T().y, true) && !g.pass(T().x, T().y), w.get(T().x, T().y));
  face(0, -1); w.set(T().x, T().y, '沙'); w.set(T().x, T().y, '木'); hold('門'); g.pressPlace();
  ok('cannot place on a tree before clearing it', w.get(T().x, T().y) === '木');
  w.set(T().x, T().y, '草'); const tr0 = U.trueRand; U.trueRand = () => 0.9; const grass0 = g.count('草'); g.pressPlace(); U.trueRand = tr0;
  ok('v0.29: a 門 goes straight onto grass; this time the grass is crushed', w.get(T().x, T().y) === '門' && g.count('草') === grass0 && g.msgText.indexOf('壓壞') >= 0, g.count('草'));
  ok('placed 門: player passes, ghosts do not', w.get(T().x, T().y) === '門' && g.pass(T().x, T().y) && !g.ents.canStand('狼', T().x, T().y, true) && !g.ents.canStand('虎', T().x, T().y, true));
  face(-1, 0); w.set(T().x, T().y, '花'); hold('床'); const fl0 = g.count('花'); U.trueRand = () => 0.1; g.pressPlace(); U.trueRand = tr0;
  const bed = T();
  ok('placed 床 sets home', w.get(bed.x, bed.y) === '床' && p.home && p.home.x === bed.x, p.home);
  ok('v0.29: a 床 on 花 — half the time the flower is picked up as it goes down', g.count('花') === fl0 + 1, [fl0, g.count('花')]);
  face(0, 1); w.set(T().x, T().y, '田'); hold('灶'); const stander = g.ents.add('鹿', T().x, T().y, { calm: 99, moveT: 99 }); g.pressPlace();
  ok('v0.29: nothing goes down on a tile a creature stands on', w.get(T().x, T().y) === '田' && g.count('灶') === 1 && g.msgText.indexOf('有生靈') >= 0);
  g.ents.list = g.ents.list.filter(e => e !== stander); w.set(T().x, T().y, '沙'); g.pressPlace();
  const stove = T();
  ok('placed 灶 is cold', w.get(stove.x, stove.y) === '灶' && !w.stoveLit(stove.x, stove.y));
  hold('木'); const wood0 = g.count('木'); g.pressPlace();
  ok('F facing a stove opens the stove panel and consumes nothing', !hidden('stove') && g.stoveAt === stove.x + ',' + stove.y && g.count('木') === wood0 && document.getElementById('stove-fire').textContent.indexOf('冷') >= 0);
  document.querySelector('#stove-fuel button[data-fuel="木"]').click();
  ok('wood fuels the stove from the panel', w.stoveLit(stove.x, stove.y) && g.count('木') === wood0 - 1 && document.getElementById('stove-fire').textContent.indexOf('火旺') >= 0, w.stoveFuel(stove.x, stove.y));
  g.addItem('魚', 1); g.buildStove(); document.querySelector('#stove-cook button[data-cook="魚"]').click();
  ok('魚 cooked in the stove panel becomes 烤魚', g.count('烤魚') === 1 && g.count('魚') === 0, bag());
  await press('KeyE', 30);
  ok('E closes the stove panel', hidden('stove') && !g.stoveAt);
  p.food = 50; hold('烤魚'); g.useItem();
  ok('eating 烤魚 +40', Math.round(p.food) === 90 && g.count('烤魚') === 0, p.food);
  w.set(stove.x, stove.y, '土'); hold('石鋤'); g.action = null; g.pressGather();
  ok('鋤 in hand turns 土 into 田 with E and wears', w.get(stove.x, stove.y) === '田' && tool('石鋤').dur === 39 && !g.action);
  w.set(stove.x, stove.y, '山'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  ok('鎬 mines 山 into 石 and yields 石×2', w.get(stove.x, stove.y) === '石' && g.count('石') >= 2, [w.get(stove.x, stove.y), g.count('石')]);
  w.set(stove.x, stove.y, '木'); hold('石斧'); g.action = null; g.pressGather();
  ok('斧 halves wood time', g.action && Math.abs(g.action.dur - 0.7) < 0.01, g.action && g.action.dur); g.action = null;

  // ============ D. 戰鬥 ============
  hold('石劍'); const sd0 = tool('石劍').dur;
  face(0, 1); w.set(T().x, T().y, '草'); g.ents.list = g.ents.list.filter(e => e.type !== '虎');
  const tiger = g.ents.add('虎', T().x, T().y, { calm: 9, moveT: 9 });
  g.pressGather(); ok('sword hits tiger for 40 (300 hp)', tiger.hp === 260, tiger.hp);
  g.pressGather(); ok('attack has a cooldown', tiger.hp === 260);
  for (let i = 0; i < 7; i++) { p.atkT = 0; tiger.x = T().x; tiger.y = T().y; g.pressGather(); }
  ok('eight blows kill the tiger, 肉×3, sword wears 8', !g.ents.list.includes(tiger) && g.count('肉') === 3 && tool('石劍').dur === sd0 - 8, bag());
  const deer = g.ents.add('鹿', T().x, T().y, { calm: 9, moveT: 9 }); p.atkT = 0; g.pressGather();
  ok('one blow kills a deer, 肉×2', !g.ents.list.includes(deer) && g.count('肉') === 5, g.count('肉'));
  const deer2 = g.ents.add('鹿', T().x, T().y, { calm: 9, moveT: 9 }); hold('木'); unarm(); p.atkT = 0; g.pressGather();
  ok('bare hands cannot attack', g.ents.list.includes(deer2) && deer2.hp === 30); g.ents.remove(deer2);

  // ============ E. 睡覺、發酵、醉果 ============
  g.ents.list = g.ents.list.filter(e => e.type !== '魄');
  setDay(0.83); const dayBefore = g.day(); p.warm = 40; p.sta = 20; g.sleep(); await sleep(30);
  ok('sleeping in a bed skips to morning', g.day() === dayBefore + 1 && p.warm === 100 && p.sta === p.staMax && g.stats.nights === 1, [g.day(), p.warm]);
  setDay(0.83); const ghost = g.ents.add('魄', p.x + 3, p.y, { moveT: 99 }); const t1 = w.time; g.sleep();
  ok('cannot sleep with a ghost nearby', w.time === t1, g.msgText); g.ents.remove(ghost);
  setDay(0.83); p.san = 50; g.sleep(); await sleep(30);
  ok('sleeping restores 20 sanity', Math.round(p.san) === 70, p.san);
  setDay(0.27); const tN = w.time; g.sleep();
  ok('no napping after sunrise', w.time === tN, g.msgText);
  setDay(0.53); g.removeItem('果', 99); g.removeItem('肉', 99); g.removeItem('磚', 99);
  g.addItem('果', 2); g.addItem('果', 3, { d: g.day() - 15 });
  const fstacks = () => p.bag.filter(s => s.n === '果'), dNow = g.day();
  ok('fruit picked on different days shares one stack, oldest first inside', fstacks().length === 1 && fstacks()[0].c === 5 && fstacks()[0].ds.join() === [dNow - 15, dNow - 15, dNow - 15, dNow, dNow].join(), JSON.stringify(fstacks()));
  w.time += DAY; await until(() => g.count('醉果') === 3, 3000);
  ok('only the fruit older than 15 nights ferments, the rest stays', g.count('醉果') === 3 && g.count('果') === 2 && fstacks()[0].ds.every(d => d === g.day() - 1), bag());
  g.addItem('果', 1, { d: g.day() - 5 }); p.food = 50; hold('果'); g.useItem();
  ok('eating takes the oldest fruit first', g.count('果') === 2 && fstacks()[0].ds.every(d => d === g.day() - 1) && g.msgText.indexOf('5 夜') >= 0, g.msgText);
  g.removeItem('醉果', 99);
  // ============ F. 魄夜、毒、豹狼、稻草人 ============
  p.hp = 100; p.poisonT = 0; p.san = 100;
  w.time = DAY * 12 + DAY * 0.93;   // 第 13 日的夜 → 第十三夜
  ok('night thirteen is ghost night', g.day() === 13 && g.nightNo() === 13 && g.ghostNight() && g.ghostCap() === 2, [g.day(), g.nightNo(), g.ghostCap()]);
  w.time = DAY * 9 + DAY * 0.93; ok('no ghosts on night ten any more', !g.ghostNight());
  w.time = DAY * 12 + DAY * 0.93;
  // 手裡沒光：魄四格內蝕心耗力
  for (const [k] of w.stoves) w.stoves.set(k, 0);
  for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) if (w.info(p.x + dx, p.y + dy).light) w.set(p.x + dx, p.y + dy, '白');
  g.ents.list = g.ents.list.filter(e => '魄龍'.indexOf(e.type) < 0);
  trim(['木', '石', '石子', '草', '土', '石劍', '石鎬', '磚']); hold('木');
  const gh = g.ents.add('魄', p.x + 3, p.y, { moveT: 99 }); const san0 = p.san; p.sta = 0.5; p.hp = 100; p.food = 90; p.warm = 90;
  await sleep(1200);
  ok('ghost drains sanity and stamina without light', p.san < san0 - 1 && p.sta === 0 && g.ents.list.includes(gh), [san0 - p.san, p.sta]);
  ok('zero stamina bleeds hp', p.hp < 100, p.hp); p.sta = 80;
  w.set(p.x + 5, p.y + 5, '磚');
  ok('ghost passes bricks, wolves do not', g.ents.canStand('魄', p.x + 5, p.y + 5, true) && !g.ents.canStand('狼', p.x + 5, p.y + 5, true));
  // 手持火把：只把魄逼到六格外，不再煙滅（v0.20）
  g.addItem('火把', 1); hold('火把'); gh.moveT = 0; await until(() => U.cheb(gh.x, gh.y, p.x, p.y) > 6, 5000);
  ok('a held torch drives the ghost back beyond six tiles; it does not dissipate', g.ents.list.includes(gh) && !(gh.fade < 1) && U.cheb(gh.x, gh.y, p.x, p.y) > 6 && g.hasLight(), U.cheb(gh.x, gh.y, p.x, p.y));
  g.ents.remove(gh);
  g.removeItem('火把', 9); hold('木'); g.addItem('燈帽', 1);
  ok('a lamp hat in the bag gives no light until worn', g.lightRadius() === 0);
  hold('燈帽'); g.pressPlace(); const hat = p.worn['帽'];
  ok('worn on the head (beside the helmet) it lights with its 400-second candle', hat && hat.fuel === 400 && g.lightRadius() === 2 && p.worn['盔'] === null, hat && hat.fuel);
  hat.fuel = 0.3; await until(() => hat.fuel <= 0, 3000);
  ok('when the candle burns out the hat goes dark', hat.fuel === 0 && g.lightRadius() === 0);
  g.addItem('蠟燭', 1); hold('蠟燭'); g.useItem();
  ok('a candle refills the hat', hat.fuel === 400 && g.count('蠟燭') === 0 && g.lightRadius() === 2);
  hold('木'); hat.fuel = 300; w.set(p.x + 2, p.y + 2, '燈'); await sleep(400);
  ok('with another light within three tiles the hat candle does not burn', hat.fuel === 300, hat.fuel);
  w.set(p.x + 2, p.y + 2, '白'); await sleep(300);
  ok('away from other lights it burns again', hat.fuel < 300, hat.fuel);
  g.takeOff('帽'); g.removeItem('燈帽', 1); hold('木');
  // 白天：林裡凍住，林外煙滅
  w.time = DAY * 13 + DAY * 0.48;
  const g1 = g.ents.add('魄', p.x + 20, p.y + 20, { moveT: 99 }); w.set(p.x + 20, p.y + 20, '林');
  const g2 = g.ents.add('魄', p.x + 22, p.y + 22, { moveT: 99 }); w.set(p.x + 22, p.y + 22, '草');
  await until(() => !g.ents.list.includes(g2), 4000);
  ok('by day a ghost in the woods freezes, one outside dissipates', g.ents.list.includes(g1) && g1.frozen && !g.ents.list.includes(g2));
  g.ents.remove(g1);
  // 毒蛇：咬一口中毒九秒、每秒一點五（v0.28.1 起，原本五秒每秒三）；連咬十五口必死
  hold('木'); w.time = DAY * 13 + DAY * 0.53;
  face(1, 0); w.set(T().x, T().y, '草'); const snake = g.ents.add('蛇', T().x, T().y, { moveT: 0, atk: 0 }); p.hp = 100; p.biteN = 0; p.biteLast = -99;
  await until(() => p.poisonT > 0, 3000);
  ok('snake bite poisons (1.5/s for 9 s)', p.poisonT > 5 && p.poisonT <= 9 && p.poisonPer === 1.5 && p.biteN === 1, [p.poisonT, p.poisonPer, p.biteN]);
  ok('hostile beasts bite every 2.67 s and maul every 1.6 s (a quarter slower)', Math.abs(snake.atk - 2.0 * 4 / 3) < 0.3 && snake.hp === 90, [snake.atk, snake.hp]);
  const hpP = p.hp; await sleep(1000);
  ok('poison drains hp and screen tints green', p.hp < hpP && g.vignette().green > 0, [hpP - p.hp]);
  g.addItem('藥', 1); hold('藥'); g.useItem();
  ok('藥 cures poison', p.poisonT === 0 && p.poisonPer === 0);
  g.ents.remove(snake);
  p.hp = 100; p.biteN = 14; p.biteLast = w.time; p.cour = 100; const swd = tool('石劍'); if (swd) swd.dur = 20; const snake2 = g.ents.add('蛇', T().x, T().y, { moveT: 0, atk: 0 });
  await until(() => p.dead, 3000);
  ok('fifteenth consecutive bite kills', p.dead, [p.hp, p.biteN]);
  g.ents.remove(snake2); await press('Enter', 20); await sleep(80);
  ok('respawn keeps 40% of courage (100 → 40)', !p.dead && p.cour === 40, p.cour);
  ok('durable things in the 荷包 are halved', [...w.bags.values()].some(v => v.some(s => s.n === '石劍' && s.dur === 10)), [...w.bags.values()].flat().filter(s => s.dur !== undefined).map(s => s.n + s.dur).join(','));
  ok('belongings drop as one 荷包', w.bags.size >= 1 && [...w.bags.keys()].every(k => { const [x, y] = k.split(',').map(Number); return w.get(x, y) === '包'; }) && [...w.bags.values()].some(v => v.some(s => s.n === '石劍')), w.bags.size);
  // 蜘蛛不惹不咬；除草十分之一出蜘蛛
  w.set(T().x, T().y, '草'); g.ents.list = g.ents.list.filter(e => e.type !== '蛛');
  const spider = g.ents.add('蛛', p.x + 1, p.y + 1, { moveT: 0, atk: 0 }); p.poisonT = 0; await sleep(700);
  ok('spider leaves you alone unless provoked', p.poisonT === 0 && !spider.angry && g.ents.list.includes(spider));
  spider.x = p.x + 1; spider.y = p.y + 1; spider.moveT = 99;
  g.addItem('石劍', 1); hold('石劍'); face(1, 1); p.atkT = 0; g.pressGather();
  ok('attacking a spider makes it angry (90 hp − 40)', spider.angry && spider.hp === 50, spider.hp);
  g.ents.remove(spider);
  const rnd2 = Math.random; Math.random = () => 0.05; const spiders0 = g.ents.count('蛛');
  face(0, 1); w.set(T().x, T().y, '草'); hold('木'); g.action = null; g.pressGather(); await until(() => !g.action, 4000); Math.random = rnd2;
  ok('cutting grass can startle a spider (1/10)', g.ents.count('蛛') === spiders0 + 1);
  g.ents.list = g.ents.list.filter(e => e.type !== '蛛');
  // 豹：一撲十滴血
  w.time = DAY * 13 + DAY * 0.53; hold('木'); face(1, 0); w.set(T().x, T().y, '林');
  for (const [k] of w.stoves) w.stoves.set(k, 0);
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (w.info(p.x + dx, p.y + dy).light) w.set(p.x + dx, p.y + dy, '白');
  const leo = g.ents.add('豹', T().x, T().y, { moveT: 0, atk: 0, calm: 0 }); p.hp = 100; await until(() => p.hp < 100, 3000);
  ok('leopard hits for 10', Math.round(p.hp) === 90, p.hp); g.ents.remove(leo);
  // 稻草人：十格內獸不能站
  w.set(T().x, T().y, '土'); g.addItem('偶', 2); hold('偶'); g.pressPlace();
  const sc = T();
  ok('scarecrow placed with 30 days', w.get(sc.x, sc.y) === '偶' && Math.round(w.scareDays(sc.x, sc.y)) === 30, w.scareDays(sc.x, sc.y));
  for (const dx of [7, 8, 9, 10]) w.set(sc.x + dx, sc.y, '草');
  ok('beasts cannot come within ten tiles of a fresh scarecrow', !g.ents.canStand('虎', sc.x + 9, sc.y, true) && !g.ents.canStand('蛇', sc.x + 10, sc.y, true) && g.ents.canStand('鹿', sc.x + 9, sc.y, true) && g.ents.canStand('魄', sc.x + 9, sc.y, true));
  g.pressPlace();
  ok('a second scarecrow extends to forty days at most', Math.round(w.scareDays(sc.x, sc.y)) === 40, w.scareDays(sc.x, sc.y));
  w.scarecrows.set(sc.x + ',' + sc.y, w.time + 10 * DAY);
  ok('in the last fifteen days the radius is seven', !g.ents.canStand('虎', sc.x + 7, sc.y, true) && g.ents.canStand('虎', sc.x + 8, sc.y, true));
  w.scarecrows.delete(sc.x + ',' + sc.y);

  // ============ H. 愜意、膽氣、力、瓶與酒、櫃、昏迷、船 ============
  // 愜意：製作 +8；歸零失控；回到 10 解除
  trim(['木', '石', '石子', '草', '土', '石劍', '石鎬', '磚']);
  p.san = 50; p.cour = 0; g.addItem('土', 2); g.addItem('草', 1); p.sta = 50; g.craft('brick');
  ok('crafting adds 8 sanity and courage equal to its stamina ×1.25 (normal difficulty bonus, kept to four decimals: 3.75)', p.san === 58 && p.cour === 3.75, [p.san, p.cour]);
  g.addItem('土', 8); g.addItem('草', 4); p.sta = 100; const sg = [];
  for (let i = 0; i < 4; i++) { const s0 = p.san; g.craft('brick'); sg.push(Math.round((p.san - s0) * 100) / 100); }
  ok('repeating the same recipe within 60 s gives 4, 2, 1, 1 sanity', sg.join(',') === '4,2,1,1', sg);
  p.san = 0; await sleep(300);
  ok('zero sanity makes you insane with blue tint', p.insane && g.vignette().blue > 0.5);
  const ctrl0 = p.ctrl; p.ctrlT = 0; await sleep(200);
  ok('control alternates while insane', p.ctrl !== ctrl0);
  p.san = 12; await sleep(200);
  ok('sanity above ten restores control', !p.insane && p.ctrl);
  // 膽氣：每 20 點一重，回復倍率
  p.cour = 45; g.addCourage(0);
  ok('courage level 2 gives 1.2x recovery', g.level() === 2 && Math.abs(g.mult() - 1.2) < 1e-9);
  ok('level thresholds grow as 20×(1+0.1n)², kept to four decimals (v0.29)', g.levelCost(0) === 20 && g.levelCost(1) === 24.2 && g.levelCost(2) === 28.8 && g.levelCost(3) === 33.8 && g.levelCost(4) === 39.2 && g.levelAt(1) === 20 && g.levelAt(2) === 44.2 && g.levelAt(8) === 300 && g.levelAt(10) === 437 && g.levelAt(31) === 4371, [g.levelAt(8), g.levelAt(10), g.levelAt(31)]);
  ok('ship recipe locked below level 8', (() => { g.addItem('木板', 8); g.addItem('船槳', 1); g.addItem('船帆', 1); p.sta = 100; g.craft('ship'); return g.count('孤帆') === 0; })());
  p.cour = 300; g.craft('ship');
  ok('a 孤帆 is craftable at level 8 for 8 planks, an oar and a sail', g.count('孤帆') === 1 && g.level() === 8 && g.count('木板') === 0, [g.count('孤帆'), g.level()]);
  g.addItem('木板', 36); g.addItem('船槳', 4); g.addItem('船帆', 3); g.addItem('鐵', 8); g.addItem('麻布', 6); g.addItem('鎢鋼', 2); p.sta = 100; g.craft('ark');
  ok('a 方舟 costs far more: 36 planks, 4 oars, 3 sails, 8 iron, 6 cloth, 2 tungsten steel', g.count('方舟') === 1 && g.count('木板') === 0 && g.count('鐵') === 0 && g.count('鎢鋼') === 0, [g.count('方舟'), g.count('木板')]);
  // 衣甲與山海衣：五件穿齊、至少一件鎢鋼、十六重膽氣才有獸紋；脫下一件就是普通衣甲
  p.cour = g.levelAt(16); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']);
  g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('布甲', 1); g.addItem('布帽', 1); g.addItem('布靴', 1); g.addItem('鎢鋼靴', 1);
  for (const n of ['內襯', '布褲', '布甲', '布帽']) { hold(n); g.pressPlace(); }
  ok('four cloth pieces worn: 9% less damage, no 山海衣 yet', Math.abs(g.armorRed() - 0.09) < 1e-9 && !g.totemOn() && g.wornList().length === 4 && g.dmgMult() === 1, g.armorRed());
  hold('布靴'); g.useItem();
  ok('five cloth pieces at level 16 are still plain clothes: a tungsten piece is required', !g.totemOn() && !g.totemReady() && g.wornList().length === 5 && Math.abs(g.armorRed() - 0.10) < 1e-9 && g.dmgMult() === 1, g.armorRed());
  hold('鎢鋼靴'); g.useItem();
  ok('swapping in 鎢鋼靴 wakes the 山海衣: attack ×1.15 (and the iron piece its 1/60), taken ×0.83 (17% armour)', g.totemOn() && Math.abs(g.armorRed() - 0.17) < 1e-9 && Math.abs(g.dmgMult() - 1.15 * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83) < 1e-9 && g.has('布靴'), [g.dmgMult(), g.takenMult()]);
  p.cour = g.levelAt(15); ok('at level 15 the same five pieces are plain clothes', !g.totemOn() && !g.totemReady() && Math.abs(g.dmgMult() - (1 + 0.05 / 3)) < 1e-9); p.cour = g.levelAt(16);
  document.getElementById('totemswitch').click();
  ok('the switch turns the 山海衣 off into plain clothes', p.totemOff && !g.totemOn() && g.totemReady() && Math.abs(g.dmgMult() - (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83) < 1e-9);
  document.getElementById('totemswitch').click();
  ok('and back on', !p.totemOff && g.totemOn());
  p.cour = g.levelAt(22); ok('level 22 is still the first step', Math.abs(g.dmgMult() - 1.15 * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83) < 1e-9);
  p.cour = g.levelAt(23); ok('level 23: attack ×1.15², taken ÷1.15', Math.abs(g.dmgMult() - 1.15 * 1.15 * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83 / 1.15) < 1e-9);
  p.cour = g.levelAt(30); ok('level 30: attack ×1.15³, taken ÷1.15²', Math.abs(g.dmgMult() - Math.pow(1.15, 3) * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83 / 1.15 / 1.15) < 1e-9);
  p.cour = g.levelAt(16); p.hp = 100; p.hitWin = { start: -99, n: 0 }; g.hit({ type: '虎', x: p.x + 1, y: p.y }, 20);
  ok('near the 山海衣 beasts hit 5/3 harder; the armour still takes 17% off (20 × 5/3 × 0.83 = 27.6667)', Math.abs(p.hp - (100 - 27.6667)) < 1e-9, p.hp);
  w.set(p.x + 3, p.y, '草'); const tt = g.ents.add('虎', p.x + 3, p.y, { moveT: 0, calm: 0, atk: 0 }); g.ents.update(0.01, g);
  ok('near the 山海衣 hostile beasts move at half speed', Math.abs(tt.moveT - 0.6) < 1e-6, tt.moveT); g.ents.remove(tt);
  g.takeOff('盔');
  ok('taking one piece off turns it back into plain clothes', !g.totemOn() && Math.abs(g.dmgMult() - (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.85) < 1e-9 && g.has('布帽'), g.takenMult());
  hold('布帽'); g.pressPlace();
  // 衣甲損耗：一百八十日；十五息內挨打加速且累加；五下碎
  const vest = p.worn['甲']; ok('armor lasts 180 days', Math.round(vest.dur / DAY) === 180 && vest.wm === 1, vest.dur / DAY);
  const d0 = vest.dur, tw0 = w.time; await sleep(400);
  ok('armor wears evenly while worn', vest.dur < d0 && Math.abs((d0 - vest.dur) - (w.time - tw0)) < 0.05, [d0 - vest.dur, w.time - tw0]);
  p.hitWin = { start: -99, n: 0 }; p.hp = 100;
  g.hit({ type: '狼', x: p.x + 1, y: p.y }, 1); g.hit({ type: '狼', x: p.x + 1, y: p.y }, 1);
  const d1 = vest.dur, tw1 = w.time; await sleep(400);
  ok('two hits within 15 s: armor wears ×1.12', p.hitWin.n === 2 && Math.abs((d1 - vest.dur) - 1.12 * (w.time - tw1)) < 0.05, [d1 - vest.dur, w.time - tw1]);
  w.time += 16; await sleep(80);
  ok('after 15 s the window closes and the speed-up sticks', p.hitWin.n === 0 && Math.abs(vest.wm - 1.12) < 1e-9, vest.wm);
  await sleep(60);
  ok('worn panel shows days left at the current wear rate', document.getElementById('worn1').textContent.indexOf(Math.ceil(vest.dur / 1.12 / DAY) + '日') >= 0, document.getElementById('worn1').textContent);
  for (let i = 0; i < 5; i++) g.hit({ type: '狼', x: p.x + 1, y: p.y }, 1);
  ok('five hits within 15 s shatter 甲, 襯 and 褲 but not 盔 and 靴', !p.worn['甲'] && !p.worn['襯'] && !p.worn['褲'] && p.worn['盔'] && p.worn['靴'] && !g.totemOn() && Math.abs(p.worn['盔'].wm - 1.12 * 1.5) < 1e-9, g.wornList().map(s => s.n + '@' + s.wm));
  p.worn['盔'].wm = 5; p.hitWin = { start: w.time, n: 4 }; w.time += 16; await sleep(80);
  ok('the wear multiplier caps at ×6', Math.abs(p.worn['盔'].wm - 6) < 1e-9 && p.hitWin.n === 0, p.worn['盔'].wm);
  g.addItem('麻布', 1); p.sta = 50; g.repairWorn('盔');
  ok('repairing with 麻布 restores 180 days and restarts wear at ×1.5', Math.round(p.worn['盔'].dur / DAY) === 180 && p.worn['盔'].wm === 1.5 && g.count('麻布') === 0 && p.sta === 46, [p.worn['盔'].wm, g.count('麻布')]);
  p.hp = 100; p.hurtT = 0; g.takeOff('盔'); g.takeOff('靴'); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']);
  // 拆回自己放的東西不長膽氣；稻草人拆得回來
  p.cour = 0; face(0, -1); w.set(T().x, T().y, '土'); g.addItem('磚', 1); hold('磚'); g.pressPlace(); g.addItem('石鎬', 1); hold('石鎬'); g.action = null; g.pressGather(); takeYes(); await until(() => !g.action, 12000);
  ok('taking back a placed brick gives no courage', g.count('磚') >= 1 && p.cour === 0 && w.get(T().x, T().y) === '白', [p.cour, w.get(T().x, T().y)]);
  w.set(T().x, T().y, '土'); g.addItem('偶', 1); hold('偶'); g.pressPlace(); const sck = T().x + ',' + T().y; g.action = null; g.pressGather(); takeYes(); await until(() => !g.action, 4000);
  ok('scarecrow can be taken down', w.get(T().x, T().y) === '白' && !w.scarecrows.has(sck) && g.count('偶') === 1 && p.cour === 0, [w.get(T().x, T().y), g.count('偶')]);
  g.removeItem('偶', 9); w.set(T().x, T().y, '土');
  // 鐵甲：減傷三成、毒不侵、慢四分之一、攻擊加半成、飢愜力掉得快八分
  g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('鐵甲', 1); g.addItem('鐵盔', 1); g.addItem('鐵靴', 1);
  for (const n of ['內襯', '布褲', '鐵甲', '鐵盔', '鐵靴']) { hold(n); g.pressPlace(); }
  p.cour = 0; await sleep(80);
  ok('worn panel shows the four live numbers', (() => { const t = document.getElementById('wornstats').textContent; return t.indexOf('傷害獲取70%') >= 0 && t.indexOf('移動速度75%') >= 0 && t.indexOf('傷害輸出105%') >= 0 && t.indexOf('現今蟲獸傷害輸出100%') >= 0 && document.querySelectorAll('#worn1 .slot').length === 3 && document.querySelectorAll('#worn2 .slot').length === 3; })(), document.getElementById('wornstats').textContent);
  ok('full iron (甲盔靴 + cloth lining and trousers): 30% less damage, poison immune, 25% slower, +5% attack, +8% drain', Math.abs(g.armorRed() - 0.30) < 1e-9 && g.ironFull() && Math.abs(g.ironSpeed() - 0.75) < 1e-9 && Math.abs(g.dmgMult() - 1.05) < 1e-9 && Math.abs(g.ironDrain() - 1.08) < 1e-9 && Math.abs(g.takenMult() - 0.7) < 1e-9, [g.armorRed(), g.dmgMult(), g.takenMult()]);
  p.poisonT = 0; p.poisonPer = 0; g.bite({ type: '蛇', x: p.x + 1, y: p.y }, 3);
  ok('iron-clad, a snake bite does not poison', p.poisonT === 0 && p.poisonPer === 0);
  p.worn['甲'].wm = 3; g.addItem('鐵', 1); p.sta = 50; g.repairWorn('甲');
  ok('iron pieces are repaired with 鐵', p.worn['甲'].wm === 1.5 && g.count('鐵') === 0);
  for (const k of ['襯', '甲', '褲', '盔', '靴']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.hitWin = { start: -99, n: 0 };
  // 難度：魄幾夜起、受傷與攻擊倍率、夜裡獸量
  const tSave = w.time; p.cour = 0;
  g.diff = XIEYI.DIFF.hard; w.time = DAY * 8 + DAY * 0.93;
  ok('hard: ghosts from night 9, taken ×1.1, attack ×0.9, night beasts ×1.5', g.ghostNight() && Math.abs(g.takenMult() - 1.1) < 1e-9 && Math.abs(g.dmgMult() - 0.9) < 1e-9 && g.beastMult() === 1.5, [g.takenMult(), g.dmgMult()]);
  g.diff = XIEYI.DIFF.easy; w.time = DAY * 12 + DAY * 0.93; const e13 = g.ghostNight(); w.time = DAY * 20 + DAY * 0.93;
  ok('easy: no ghosts on night 13, ghosts from night 21, taken ×0.9, attack ×1.1', !e13 && g.ghostNight() && Math.abs(g.takenMult() - 0.9) < 1e-9 && Math.abs(g.dmgMult() - 1.1) < 1e-9 && g.beastMult() === 1);
  g.diff = XIEYI.DIFF.normal; w.time = tSave;
  // 錦囊：囊多兩格、具欄多一格，最多四個
  g.addItem('錦囊', 1); hold('錦囊'); g.useItem(); await sleep(60);
  ok('a pouch adds two bag slots and one tool slot', p.pouches === 1 && g.slots() === 18 && g.toolSlots() === 7 && document.querySelectorAll('#bagbar .slot').length === 18 && document.querySelectorAll('#toolbar .slot').length === 7);
  p.pouches = 6; g.addItem('錦囊', 1); hold('錦囊'); g.useItem();
  ok('no more than six pouches: 28 bag slots and 12 tool slots', p.pouches === 6 && g.count('錦囊') === 1 && g.slots() === 28 && g.toolSlots() === 12);
  g.removeItem('錦囊', 1); p.pouches = 0; g.barSig = '';
  // 同一類衣甲只留一件：再造只翻新
  g.addItem('內襯', 1); const lin = p.bag.find(s => s.n === '內襯'); lin.dur = 1000; lin.wm = 3; g.addItem('棉', 4); g.addItem('麻', 2); p.sta = 50; g.buildCraft();
  const marked = document.getElementById('craft-list').textContent.indexOf('已有') >= 0; g.craft('lining');
  ok('a second 內襯 only renews the one you have (craft panel says 已有)', marked && g.count('內襯') === 1 && Math.round(lin.dur / DAY) === 180 && lin.wm === 1 && g.count('棉') === 0, [marked, g.count('內襯'), lin.wm]);
  g.removeItem('內襯', 1);
  // 囊分食與物兩段
  g.addItem('果', 1); g.addItem('烤魚', 1); await sleep(60);
  const order = p.bag.map(s => (G.item(s.n).food ? 1 : 0)).join('');
  ok('edible items are grouped first, non-edible after', order.indexOf('01') < 0 && document.querySelectorAll('#bagbar .rowlabel').length === 2, order);
  g.removeItem('果', 9); g.removeItem('烤魚', 9);
  // 九閽鳴雷：卅一重可造可掄，三格內同受，隨身二日一減、下限廿五重
  p.cour = g.levelAt(31); g.addItem('鐵', 12); g.addItem('煤', 6); g.addItem('石子', 9); g.addItem('麻布', 2); g.addItem('果酒', 1); p.sta = 100; g.craft('hammer');
  ok('九閽鳴雷 craftable at level 31, durability 199, goes to the tool bar', tool('九閽鳴雷') && tool('九閽鳴雷').dur === 199, bag());
  ok('carrying it on normal: courage decays every three days down to level 27', g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 27);
  hold('九閽鳴雷'); face(1, 0); for (const [dx, dy] of [[1, 0], [3, 2], [4, 0]]) w.set(p.x + dx, p.y + dy, '草');
  const h1 = g.ents.add('虎', p.x + 1, p.y, { moveT: 99, calm: 99 }), h2 = g.ents.add('狼', p.x + 3, p.y + 2, { moveT: 99, calm: 99 }), h3 = g.ents.add('鹿', p.x + 4, p.y, { moveT: 99 });
  p.atkT = 0; p.sta = 50; g.pressGather();
  ok('one swing hits every beast within three tiles for 120, not the deer four away', Math.abs(h1.hp - 180) < 1e-6 && Math.abs(h2.hp - 40) < 1e-6 && h3.hp === 30 && tool('九閽鳴雷').dur === 198, [h1.hp, h2.hp, h3.hp]);
  p.cour = g.levelAt(30); p.atkT = 0; g.pressGather();
  ok('below level 31 it cannot be swung', Math.abs(h1.hp - 180) < 1e-6);
  for (const e of [h1, h2, h3]) g.ents.remove(e);
  p.tools = p.tools.filter(s => s.n !== '九閽鳴雷'); p.tool = -1; hold('石劍'); p.cour = 0; p.decayAt = 0; g.barSig = '';
  // 鷹：半友好；魚可馴，第一隻 35%、第二隻 25%、第三隻起 10%；馴了替你打獸、餵魚回力；右邊顯示
  g.ents.list = g.ents.list.filter(e => e.type !== '鷹' && e.type !== '虎');
  ok('taming odds fall with each eagle already following', g.tameChance() === 0.35 && (() => { const a = g.ents.add('鷹', p.x + 9, p.y + 9, { tame: true, moveT: 99 }); const c1 = g.tameChance(); const b = g.ents.add('鷹', p.x + 9, p.y + 8, { tame: true, moveT: 99 }); const c2 = g.tameChance(); const c = g.ents.add('鷹', p.x + 8, p.y + 9, { tame: true, moveT: 99 }); const c3 = g.tameChance(); for (const e of [a, b, c]) g.ents.remove(e); return c1 === 0.25 && c2 === 0.10 && c3 === 0.10; })());
  face(1, 0); w.set(T().x, T().y, '草'); const eg = g.ents.add('鷹', T().x, T().y, { moveT: 99 });
  hold('石劍'); p.atkT = 0; g.pressGather();
  ok('a wild eagle gets angry when attacked (60 hp − 40)', eg.angry && eg.hp === 20, eg.hp);
  eg.hp = 60; eg.moveT = 0; eg.atk = 0; p.hp = 100; p.hurtT = 0; await until(() => p.hp < 100, 3000);
  ok('an angry eagle pecks for 12', Math.round(p.hp) === 88, p.hp); eg.moveT = 99; eg.x = T().x; eg.y = T().y;
  g.addItem('魚', 3); hold('魚'); const rnd3 = Math.random; Math.random = () => 0.5; g.pressPlace();
  ok('a failed fish calms it but does not tame', !eg.tame && !eg.angry && g.count('魚') === 2);
  Math.random = () => 0.1; g.pressPlace(); Math.random = rnd3;
  ok('a lucky fish tames it', eg.tame && g.count('魚') === 1 && g.tameCount() === 1);
  eg.sta = 30; g.pressPlace();
  ok('feeding a tamed eagle restores 40 stamina', eg.sta === 70 && g.count('魚') === 0, eg.sta);
  await sleep(80);
  ok('companion panel shows the eagle with two vertical bars', document.querySelectorAll('#companions .comp').length === 1 && document.querySelectorAll('#companions .vbars i').length === 2);
  eg.x = p.x + 3; eg.y = p.y + 3; eg.moveT = 0; eg.atk = 0; w.set(p.x + 5, p.y, '草'); const prey = g.ents.add('虎', p.x + 5, p.y, { moveT: 99, calm: 99, atk: 0 });
  await until(() => prey.hp < 300, 6000);
  ok('a tamed eagle attacks a hostile beast near you and spends stamina', prey.hp < 300 && eg.sta < 70 && prey.foe === eg, [prey.hp, eg.sta]);
  prey.moveT = 0; prey.atk = 0; const eh = eg.hp; await until(() => eg.hp < eh, 4000);
  ok('the beast fights back at the eagle', eg.hp < eh, [eh, eg.hp]);
  g.ents.remove(prey); eg.sta = 100;
  ok('tamed eagles are saved with the world', JSON.stringify(g.ents.serialize()).indexOf('鷹') >= 0);
  g.ents.remove(eg); g.addCourage(0);
  // 鼎與丹：蟾蜍肉分有無毒；前三顆 8%／12%，之後 1%／2%；前五十顆每顆命上限 +3，之後 +0.5
  trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); g.addItem('鐵', 3); g.addItem('石', 4); g.addItem('鎢鋼', 1); g.addItem('精煤', 2); p.sta = 100; g.craft('cauldron');
  face(0, 1); w.set(T().x, T().y, '土'); hold('鼎'); g.pressPlace(); const ding = T();
  ok('a cauldron is crafted and placed, cold until fuelled', w.get(ding.x, ding.y) === '鼎' && !w.stoveLit(ding.x, ding.y));
  g.addItem('木', 1); hold('木'); g.pressPlace();
  ok('wood fuels the cauldron like a stove', w.stoveLit(ding.x, ding.y));
  g.ents.list = g.ents.list.filter(e => e.type !== '蟾'); face(1, 0); w.set(T().x, T().y, '草');
  const td = g.ents.add('蟾', T().x, T().y, { moveT: 99, venom: true }); hold('石劍'); for (let i = 0; i < 3; i++) { p.atkT = 0; g.pressGather(); }
  ok('a venomous toad drops 毒蟾肉', !g.ents.list.includes(td) && g.count('毒蟾肉') === 1, bag());
  g.addItem('蟾蜍肉', 5); p.pillsMade = 0; p.pillsEaten = 0; p.hpMax = 100;
  ok('pill odds: 8%/12% for the first three pills, then 1%/2%', g.pillChance('蟾蜍肉') === 0.08 && g.pillChance('毒蟾肉') === 0.12 && (() => { p.pillsMade = 3; const r = g.pillChance('蟾蜍肉') === 0.01 && g.pillChance('毒蟾肉') === 0.02; p.pillsMade = 0; return r; })());
  face(0, 1); hold('蟾蜍肉'); const rndP = Math.random; Math.random = () => 0.5; p.sta = 50; g.pressPlace();
  ok('a failed refinement burns the meat', g.count('蟾蜍肉') === 4 && g.count('丹') === 0 && p.pillsMade === 0);
  Math.random = () => 0.05; g.pressPlace(); Math.random = rndP;
  ok('a successful refinement yields a 丹', g.count('丹') === 1 && p.pillsMade === 1 && g.count('蟾蜍肉') === 3);
  hold('丹'); g.useItem();
  ok('eating a pill raises max hp by 3 (first fifty)', p.hpMax === 103 && p.pillsEaten === 1, p.hpMax);
  p.pillsEaten = 50; p.hpMax = 250; g.addItem('丹', 2); hold('丹'); g.useItem(); const after51 = p.hpMax; hold('丹'); g.useItem();
  ok('from the fifty-first pill each adds half a point, not rounded (250.5, 251)', after51 === 250.5 && p.hpMax === 251 && p.pillsEaten === 52, [after51, p.hpMax]);
  p.hp = p.hpMax; await sleep(60);
  ok('hp bar and label follow the raised maximum', document.getElementById('hplabel').textContent.indexOf('251') >= 0, document.getElementById('hplabel').textContent);
  p.cour = g.levelAt(16); g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('布甲', 1); g.addItem('布帽', 1); g.addItem('鎢鋼靴', 1); for (const n of ['內襯', '布褲', '布甲', '布帽', '鎢鋼靴']) { hold(n); g.pressPlace(); }
  face(1, 0); w.set(T().x, T().y, '草'); const rt = g.ents.add('虎', T().x, T().y, { moveT: 99, calm: 99 }); hold('石劍'); p.atkT = 0; g.pressGather();
  ok('damage dealt keeps four decimals (40 × 1.15 × (1 + 0.05/3) = 46.7667)', Math.abs(rt.hp - (300 - 46.7667)) < 1e-9, rt.hp);
  p.hp = 100; g.hit({ type: '虎', x: p.x + 1, y: p.y }, 20);
  ok('damage taken keeps four decimals (20 × 5/3 × 0.83 = 27.6667)', Math.abs(p.hp - (100 - 27.6667)) < 1e-9, p.hp);
  g.ents.remove(rt); for (const k of ['襯', '褲', '甲', '盔', '靴']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.cour = 0; p.hp = 100; p.hurtT = 0;
  p.hpMax = 100; p.hp = 100; p.pillsEaten = 0; p.pillsMade = 0; g.removeItem('丹', 9); g.removeItem('蟾蜍肉', 9); g.removeItem('毒蟾肉', 9); w.set(ding.x, ding.y, '土');
  // 龜：少見不咬人，命二百五（v0.28）；龜甲卜之，吉則五日無魄
  face(1, 0); w.set(T().x, T().y, '草'); const tu = g.ents.add('龜', T().x, T().y, { moveT: 99 }); hold('石劍');
  for (let i = 0; i < 6; i++) { p.atkT = 0; g.pressGather(); }
  ok('a turtle takes seven sword blows (250 hp): six leave it at 10', tu.hp === 10 && g.ents.list.includes(tu), tu.hp);
  p.san = 80; p.atkT = 0; g.pressGather();
  ok('a slain turtle leaves a 龜甲', !g.ents.list.includes(tu) && g.count('龜甲') === 1);
  ok('killing a turtle is ill-omened: 愜意 −30', Math.abs(p.san - 50) < 1, p.san);
  hold('龜甲'); Math.random = () => 0.9; g.useItem();
  ok('a bad omen wastes the shell', g.count('龜甲') === 0 && g.peaceDays() === 0);
  g.addItem('龜甲', 1); hold('龜甲'); Math.random = () => 0.1; g.useItem(); Math.random = rnd3;
  ok('a good omen: five days without ghosts', g.peaceDays() === 5 && (() => { const t0 = w.time; w.time = Math.floor((p.noGhostUntil - DAY) / DAY) * DAY + DAY * 0.93; const inside = !g.ghostNight(); w.time = Math.floor(p.noGhostUntil / DAY) * DAY + DAY * 1.93; const after = g.ghostNight(); w.time = t0; return inside && after; })(), [g.peaceDays()]);
  p.noGhostUntil = 0;
  // 漁網：棉麻草織小網，四小成中，四中或十三小成大（v0.21 起是撒網）
  trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); g.removeItem('草', 99); g.removeItem('魚', 99);
  g.addItem('棉', 26); g.addItem('麻', 26); g.addItem('草', 39);
  for (let i = 0; i < 13; i++) { p.sta = 100; g.craft('net'); }
  ok('thirteen small nets from cotton, hemp and grass', g.count('漁網') === 13 && g.count('棉') === 0 && g.count('麻') === 0 && g.count('草') === 0, bag());
  p.sta = 100; g.craft('bignet13');
  ok('thirteen small nets weave one big net', g.count('大漁網') === 1 && g.count('漁網') === 0);
  g.addItem('漁網', 16); for (let i = 0; i < 4; i++) { p.sta = 100; g.craft('midnet'); }
  ok('four small nets weave a medium net', g.count('中漁網') === 4 && g.count('漁網') === 0);
  p.sta = 100; g.craft('bignet');
  ok('four medium nets weave a big net', g.count('大漁網') === 2 && g.count('中漁網') === 0);
  // 撒網（v0.21）：拿著網走到水邊，水上浮出網影；F 瞬間撒出，網影裡的魚一網打盡；耐久照網到幾條扣：0 條 1、1 條 2、2 條 4、3 條以上 7
  {
    const PX = p.x, PY = p.y, area = [];
    for (let dx = -1; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) { const x = PX + dx, y = PY + dy; area.push([x, y, w.raw(x, y)]); w.set(x, y, dx <= 0 ? '土' : '水'); }
    g.ents.list = g.ents.list.filter(e => e.type !== '魚'); p.cour = 0;
    const fishAt = (x, y) => g.ents.add('魚', x, y, { moveT: 99 }), shadow = () => { const cp = g.castPreview(); return cp ? cp.cells.map(c => (c[0] - PX) + ':' + (c[1] - PY)).sort().join(',') : ''; };
    face(-1, 0); hold('漁網'); g.addItem('漁網', 2); hold('漁網');
    ok('holding a small net by the water shows its shadow on the water, even facing inland', shadow() === '1:0', shadow());
    hold('木'); ok('holding anything else shows no shadow', g.castPreview() === null);
    face(1, 0); hold('大漁網');
    ok('the big net\'s shadow is three by three, out from the shore and centred, never over your feet', shadow() === '1:-1,1:0,1:1,2:-1,2:0,2:1,3:-1,3:0,3:1', shadow());
    const inside = [fishAt(PX + 1, PY), fishAt(PX + 2, PY + 1), fishAt(PX + 3, PY - 1)], outside = fishAt(PX + 4, PY), f0 = g.count('魚'), c0 = p.cour; g.msgText = '';
    g.pressPlace(); const big = g.held();
    ok('F casts the big net at once: the three fish in its shadow are caught, the one outside is not', g.count('魚') === f0 + 3 && inside.every(e => !g.ents.list.includes(e)) && g.ents.list.includes(outside) && g.msgText.indexOf('網到 3 條魚') >= 0, [g.count('魚') - f0, g.msgText]);
    ok('three or more fish cost 7 durability: one net is split off the pile and kept in hand (240 → 233)', big && big.n === '大漁網' && big.dur === 233 && big.c === 1 && g.count('大漁網') === 2 && g.durText(big) === '耐 233', [big && big.dur, bag()]);
    ok('each fish caught is a point of courage (3 × 1.25 = 3.75)', Math.abs(p.cour - c0 - 3.75) < 1e-9, p.cour - c0);
    g.pressPlace(); ok('an empty cast costs 1', big.dur === 232 && g.msgText.indexOf('空的') >= 0, [big.dur, g.msgText]);
    fishAt(PX + 2, PY); g.pressPlace(); ok('one fish costs 2', big.dur === 230, big.dur);
    fishAt(PX + 1, PY + 1); fishAt(PX + 3, PY); g.pressPlace(); ok('two fish cost 4', big.dur === 226, big.dur);
    for (let i = 0; i < 5; i++) fishAt(PX + 1 + (i % 3), PY - 1 + Math.floor(i / 3)); g.pressPlace(); ok('five fish still cost 7', big.dur === 219, big.dur);
    big.dur = 3; for (let i = 0; i < 3; i++) fishAt(PX + 1 + i, PY); g.msgText = ''; g.pressPlace();
    ok('a cast that costs more than is left tears the net (3 − 7 → 0), and the fish are still caught', big.dur === 0 && g.msgText.indexOf('網破了') >= 0, [big.dur, g.msgText]);
    const fT = g.count('魚'); fishAt(PX + 2, PY); g.msgText = ''; g.pressPlace();
    ok('a torn net cannot be cast', g.count('魚') === fT && g.msgText.indexOf('破了') >= 0 && g.castPreview().torn, g.msgText);
    g.msgText = ''; g.msgUntil = 0; g.updateHUD(); ok('the hint for a torn net in hand points to mending', document.getElementById('msg').textContent.indexOf('網破了') >= 0, document.getElementById('msg').textContent);
    g.ents.list = g.ents.list.filter(e => e.type !== '魚');
    // 加固：囊裡選中那張網在製作欄「加固」，同一張棉麻各 1、2、4、8、8
    g.removeItem('棉', 99); g.removeItem('麻', 99); g.addItem('棉', 30); g.addItem('麻', 30); p.sel = p.bag.indexOf(big);
    const mcost = []; for (let i = 0; i < 5; i++) { const c = g.count('棉'); big.dur = 1; p.sta = 50; g.craft('mendnet'); mcost.push(c - g.count('棉')); }
    ok('mending the same net from the craft panel costs 1, 2, 4, 8, 8 of each and fills it to 240', mcost.join(',') === '1,2,4,8,8' && big.dur === 240 && big.rf === 5 && g.count('麻') === 7, [mcost, big.dur, big.rf]);
    g.craftCat = '全部'; g.buildCraft(); const mrow = Array.from(document.querySelectorAll('#craft-list .recipe')).find(r => r.textContent.indexOf('加固') >= 0);
    ok('the craft row reads this net as its sixth mend at eight each', !!mrow && mrow.textContent.indexOf('第 6 次：棉麻各 8') >= 0, mrow && mrow.textContent);
    g.addItem('棉', 10); g.addItem('麻', 10); g.msgText = ''; g.craft('mendnet'); ok('a whole net is not mended', g.msgText.indexOf('不用加固') >= 0 && big.rf === 5, g.msgText);
    p.sel = p.bag.findIndex(x => x.n === '大漁網' && x.dur === undefined); g.msgText = ''; g.craft('mendnet'); ok('nor is a fresh one', g.msgText.indexOf('不用加固') >= 0, g.msgText);
    // 小網、灘、深水、朝北撒
    face(1, 0); hold('漁網'); fishAt(PX + 1, PY); const fS = g.count('魚'); g.pressPlace(); const small = g.held();
    ok('a small net catches the fish right in front: 30 − 2 = 28', g.count('魚') === fS + 1 && small.n === '漁網' && small.dur === 28, [g.count('魚') - fS, small && small.dur]);
    w.set(PX + 1, PY, '淼'); fishAt(PX + 1, PY); const fD = g.count('魚'); g.pressPlace();
    ok('a cast net works over deep water too', g.count('魚') === fD + 1, g.count('魚') - fD);
    w.set(PX + 1, PY, '灘'); setDay(0.83); ok('over the flats at high tide the shadow shows', shadow() === '1:0' && w.get(PX + 1, PY) === '水', shadow());
    setDay(0.53); ok('at low tide the flats are sand: no shadow, F says to find water', shadow() === '' && w.get(PX + 1, PY) === '沙' && (g.msgText = '', g.pressPlace(), g.msgText.indexOf('水邊') >= 0), [shadow(), g.msgText]);
    w.set(PX + 1, PY, '水'); w.set(PX, PY - 1, '水'); w.set(PX, PY - 2, '水'); face(0, -1); g.addItem('中漁網', 1); hold('中漁網');
    ok('a medium net facing north from the shore spreads north, not over your feet', shadow() === '0:-1,0:-2,1:-1,1:-2', shadow());
    g.ents.list = g.ents.list.filter(e => e.type !== '魚');
    // 舊存檔裡下在水上的網：照舊進魚、E 取魚，空網收回成撒網（帶著耐久）
    w.set(PX + 1, PY, '水'); face(1, 0); const old = w.addNet(PX + 1, PY, 1, w.time); const fL = g.count('魚'); w.time += 200; g.action = null; g.pressGather();
    ok('an old net left in the water still fills with fish (two in 200 s) and E takes them', w.get(PX + 1, PY) === '網' && g.count('魚') === fL + 2 && old.dur === 28, [g.count('魚') - fL, old.dur]);
    old.dur = 7; old.rf = 6; g.save(); const svn = JSON.parse(localStorage.getItem('xieyi.save.v5')); const nrec = Object.values(svn.world.nets).find(v => v[1] === PX + 1 && v[2] === PY);
    ok('the save keeps an old net\'s durability and mends', !!nrec && nrec[6] === 7 && nrec[7] === 6, nrec);
    g.load(svn); const old2 = w.netAt(PX + 1, PY); ok('and loading brings them back', !!old2 && old2.dur === 7 && old2.rf === 6, old2);
    g.pressGather(); takeYes();
    ok('taken back, the old net becomes a cast net in the bag with its durability', w.get(PX + 1, PY) === '水' && p.bag.some(x => x.n === '漁網' && x.dur === 7 && x.rf === 6), bag());
    for (const [x, y, c] of area) w.set(x, y, c); g.ents.list = g.ents.list.filter(e => e.type !== '魚');
    g.removeItem('棉', 99); g.removeItem('麻', 99); p.cour = 0;
  }
  g.removeItem('魚', 99); g.removeItem('大漁網', 9); g.removeItem('漁網', 9); g.removeItem('中漁網', 9);
  // 雪域與熱氣（v0.18）：離雪五格內待過五息暖才多掉、越待越快；烤的東西給九十息熱氣、累積一百五十；有熱氣時凍不傷命。雨裡燈的損壞率看難度
  ok('lamp ruin odds per difficulty: easy 1/4500, normal 1/2500, hard 1/800; the world carries the current one', XIEYI.DIFF.easy.lampP === 1 / 4500 && XIEYI.DIFF.normal.lampP === 1 / 2500 && XIEYI.DIFF.hard.lampP === 1 / 800 && w.rainLampP === 1 / 2500, w.rainLampP);
  {
    const sx = p.x + 5, sy = p.y, keep = w.raw(sx, sy), lining = p.worn['襯']; p.worn['襯'] = null; setDay(0.53); hold('石子'); p.heatT = 0;
    const dwAt = (sec) => { p.snowT = sec; p.warm = 50; g.updateStats(1); return p.warm - 50; };
    const base = dwAt(0); w.set(sx, sy, '雪');
    ok('a snow tile five away counts as the snow zone; under five seconds the warmth changes as usual', w.nearChar(p.x, p.y, '雪', 5) && Math.abs(dwAt(3) - base) < 1e-6 && Math.abs(p.snowT - 4) < 1e-9, [dwAt(3), base, p.snowT]);
    const d6 = dwAt(5), d20 = dwAt(19), d60 = dwAt(60);
    ok('past five seconds it drops 1.1 more a second, 2.5 more at twenty, and tops out at 4 more', Math.abs((base - d6) - 1.1) < 1e-6 && Math.abs((base - d20) - 2.5) < 1e-6 && Math.abs((base - d60) - 4) < 1e-6 && toasts().indexOf('寒氣逼人') >= 0, [base - d6, base - d20, base - d60]);
    w.set(sx, sy, '雪'); w.set(p.x + 6, p.y, '雪'); w.set(sx, sy, keep);
    ok('six away is outside the zone: the timer resets', Math.abs(dwAt(30) - base) < 1e-6 && p.snowT === 0, [dwAt(30), base]); w.set(p.x + 6, p.y, w.base(p.x + 6, p.y) === '雪' ? '土' : w.base(p.x + 6, p.y));
    g.addItem('烤肉', 2); hold('烤肉'); p.food = 10; g.msgText = ''; g.useItem();
    ok('roast meat gives ninety seconds of heat', Math.abs(p.heatT - 90) < 1e-9 && g.msgText.indexOf('熱氣 90 息') >= 0, [p.heatT, g.msgText]);
    hold('烤肉'); p.food = 10; g.useItem();
    ok('a second helping tops it up to the cap of 150', Math.abs(p.heatT - 150) < 1e-9, p.heatT);
    g.addItem('烤魚', 1); hold('烤魚'); p.food = 10; g.useItem(); ok('roast fish counts too (still capped)', Math.abs(p.heatT - 150) < 1e-9, p.heatT);
    await sleep(60); ok('the 暖 label shows the heat', document.getElementById('warmlabel').textContent.indexOf('熱') >= 0, document.getElementById('warmlabel').textContent);
    setDay(0.93); p.warm = 0; p.hp = 50; p.food = 100; p.sta = 100; p.san = 100; p.hurtT = 0; p.poisonT = 0; g.updateStats(1);
    ok('with heat in the belly freezing costs no hp', p.hp >= 50 && p.heatT > 148 && p.heatT < 150 && p.warm === 0, [p.hp, p.heatT, p.warm]);
    p.heatT = 0; p.hp = 50; g.updateStats(1);
    ok('without it the cold takes three a second', Math.abs(p.hp - 47) < 1e-6, p.hp);
    p.heatT = 42; g.save(); const svh = JSON.parse(localStorage.getItem('xieyi.save.v5')); p.heatT = 0; g.load(svh);
    ok('heat survives a save and load', Math.abs(p.heatT - 42) < 1e-9, p.heatT);
    p.worn['襯'] = lining; setDay(0.53); p.warm = 100; p.hp = 100; p.heatT = 0; p.snowT = 0; g.removeItem('烤肉', 9); g.removeItem('烤魚', 9);
  }
  // v0.19：膽氣加成看難度；神兵減益看難度、兩件只算一重、困難掉力；錦囊六個；跨過燈；櫃裡自動歸類；回血門檻七成五含暖；霧障八方飄、會換形
  {
    const l0 = p.cour; p.cour = 0;
    g.diff = XIEYI.DIFF.hard; g.addCourage(20, 'kill'); const ch = p.cour; p.cour = 0;
    g.diff = XIEYI.DIFF.easy; g.addCourage(20, 'kill'); const ce = p.cour; p.cour = 0;
    g.diff = XIEYI.DIFF.normal; const cn = g.addCourage(20, 'kill');
    ok('courage gains scale by difficulty: 20 becomes 23 on hard, 28 on easy, 25 on normal (and addCourage returns it)', ch === 23 && ce === 28 && cn === 25 && p.cour === 25, [ch, ce, cn]);
    p.cour = l0;
    g.addItem('燭龍焚溟', 1);
    ok('燭龍焚溟 alone counts as a god weapon: on normal courage decays every three days down to 27', g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 27);
    g.addItem('九閽鳴雷', 1);
    ok('both together are still one debuff', g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 27);
    g.diff = XIEYI.DIFF.hard; ok('hard: two days, floor 26', g.decayDays() === 2 && g.decayFloor() === 26 && g.godText() === '攜神兵：廿六重以上二日一減', g.godText());
    g.diff = XIEYI.DIFF.easy; ok('easy: four days, floor 28', g.decayDays() === 4 && g.decayFloor() === 28);
    g.diff = XIEYI.DIFF.hard; setDay(0.53); p.sta = 50; p.swimming = false; const m0 = g.mult(); g.updateStats(1);
    ok('on hard a god weapon on you drains 0.3 stamina a second (net of the usual regen)', Math.abs(p.sta - (50 + 0.5 * m0 - 0.3)) < 1e-6, [p.sta, m0]);
    g.diff = XIEYI.DIFF.normal; p.sta = 50; g.updateStats(1);
    ok('on normal it does not', Math.abs(p.sta - (50 + 0.5 * m0)) < 1e-6, p.sta);
    g.removeItem('燭龍焚溟', 9); g.removeItem('九閽鳴雷', 9); p.tools = p.tools.filter(s => s.n !== '燭龍焚溟' && s.n !== '九閽鳴雷'); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1; g.barSig = '';
    ok('without them the plain rule is back: three days, floor 31', !g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 31);
    const pch = p.pouches; p.pouches = 6; g.addItem('錦囊', 1); hold('錦囊'); g.msgText = ''; g.useItem();
    ok('six pouches is the cap: 28 bag slots, 12 tool slots, a seventh is refused', p.pouches === 6 && g.slots() === 28 && g.toolSlots() === 12 && g.count('錦囊') === 1 && g.msgText.indexOf('六個') >= 0, [g.slots(), g.toolSlots(), g.msgText]);
    g.removeItem('錦囊', 9); p.pouches = pch; g.barSig = '';
    face(1, 0); const lx = T().x, ly = T().y, keepL = w.raw(lx, ly); w.set(lx, ly, '燈');
    ok('a lamp blocks beasts but not you', g.pass(lx, ly) && !g.ents.canStand('狼', lx, ly, true) && !g.ents.canStand('虎', lx, ly, true), [g.pass(lx, ly)]);
    const px0 = p.x, py0 = p.y; p.moveT = 0; g.tryStep(1, 0);
    ok('stepping east onto the lamp works', p.x === px0 + 1 && w.get(p.x, p.y) === '燈', [p.x - px0, w.get(p.x, p.y)]);
    p.x = p.rx = px0; p.y = p.ry = py0; p.moveT = 0; w.set(lx, ly, keepL);
    {
      face(0, 1); const cx = T().x, cy = T().y, keepC = w.raw(cx, cy); w.set(cx, cy, '櫃'); g.openChest(T());
      const box = w.chests.get(g.chestAt); box.length = 0;
      box.push({ n: '木', c: 3 }, { n: '烤魚', c: 1 }, { n: '布帽', c: 1, dur: 100 }, { n: '石', c: 2 }, { n: '木', c: 5 }, { n: '磚', c: 2 }, { n: '石刀', c: 1, dur: 10 });
      g.sortChest(box);
      ok('the chest merges the two 木 stacks and sorts tools, wear, building, food, then materials by strokes', box.map(s => s.n + (s.c > 1 ? s.c : '')).join(',') === '石刀,布帽,磚2,烤魚,木8,石2', box.map(s => s.n + s.c).join(','));
      g.addItem('木', 2); const wi = p.bag.findIndex(s => s.n === '木'), mv = p.bag[wi].c; g.moveStack('bag', wi);
      ok('moving more 木 in lands in the same stack', box.filter(s => s.n === '木').length === 1 && box.find(s => s.n === '木').c === 8 + mv, box.map(s => s.n + s.c).join(','));
      g.closeChest(); box.length = 0; w.chests.delete(cx + ',' + cy); w.set(cx, cy, keepC);
    }
    setDay(0.53); p.hp = 50; p.hurtT = 0; p.food = 76; p.san = 76; p.sta = 76; p.warm = 70; p.heatT = 0; p.poisonT = 0; g.updateStats(0.5);
    ok('warmth below 75 blocks regeneration even with the other three above it', p.hp <= 50 + 1e-9, p.hp);
    p.warm = 76; p.hp = 50; g.updateStats(0.5);
    ok('with all four at 75 or more hp regenerates', p.hp > 50, p.hp);
    p.hp = 100; p.food = 100; p.san = 100; p.sta = 100; p.warm = 100;
    { for (const id of [...w.fogs.keys()]) w.removeFog(id); const X = p.x, Y = p.y + 3;
      for (let dx = -7; dx <= 7; dx++) for (let dy = 0; dy <= 10; dy++) w.set(X + dx, Y + dy, '草');
      unarm(); p.worn['帽'] = null; g.removeItem('火把', 99); g.removeItem('蠟燭', 99); p.sel = 0;
      const fog = w.addFog([X + ',' + (Y + 5), (X + 1) + ',' + (Y + 5), (X + 2) + ',' + (Y + 5), (X + 1) + ',' + (Y + 6), (X + 1) + ',' + (Y + 4)], w.time + DAY);
      const shapeOf = () => { const cs = [...fog.cells].map(k => k.split(',').map(Number)), mx = Math.min(...cs.map(c => c[0])), my = Math.min(...cs.map(c => c[1])); return cs.map(([x, y]) => (x - mx) + ':' + (y - my)).sort().join('|'); };
      const dirs = new Set(); let sizes = true, land = true, conn = true, morphs = 0, shape0 = shapeOf();
      for (let i = 0; i < 40; i++) {
        w.moveFog(fog, X, Y - 30);
        if (fog.dir) dirs.add(fog.dir.join(','));
        const cells = [...fog.cells].map(k => k.split(',').map(Number)); if (cells.length !== 5) sizes = false; if (!cells.every(([x, y]) => w.fogLand(x, y))) land = false;
        const set = new Set(fog.cells), first = fog.cells.values().next().value, seen = new Set([first]), stack = [first];
        while (stack.length) { const [x, y] = stack.pop().split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); } } }
        if (seen.size !== 5) conn = false;
        const sh = shapeOf(); if (sh !== shape0) morphs++; shape0 = sh;
      }
      ok('with no light a fog drifts in several directions (slants included), keeps five connected cells on land, and changes shape now and then', dirs.size >= 3 && [...dirs].some(d => d.indexOf('0') < 0) && sizes && land && conn && morphs > 0, [[...dirs], sizes, land, conn, morphs]);
      w.removeFog(fog.id); }
  }
  // v0.20：魄加強——身上的光只逼得退、地上的光三格內才煙滅；撲燈、吹熄手裡的光、燈帽燒三倍；夜越深越多越快、蝕心更狠；屋外有魄而屋裡沒燈愜意緩掉
  {
    const tKeep = w.time, X = p.x, Y = p.y; w.time = DAY * 12 + DAY * 0.98;
    for (const [k] of w.stoves) w.stoves.set(k, 0);
    for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) if (w.info(X + dx, Y + dy).light) w.set(X + dx, Y + dy, '白');
    g.ents.list = g.ents.list.filter(e => '魄龍'.indexOf(e.type) < 0); if (p.worn['帽']) g.takeOff('帽'); p.snuffT = 0; p.san = 100; p.insane = false; p.ctrl = true;
    const cheb = (e) => U.cheb(e.x, e.y, p.x, p.y), tick = () => g.ents.update(0.01, g);
    g.ents.dashT = 99; g.addItem('火把', 2); hold('火把');
    const ga = g.ents.add('魄', X + 3, Y, { moveT: 0 }); tick();
    ok('a held torch no longer burns a 魄: it steps back instead', !(ga.fade < 1) && cheb(ga) === 4, [ga.fade, cheb(ga)]);
    for (let i = 0; i < 6; i++) { ga.moveT = 0; tick(); }
    ok('it backs off to the edge of the light, seven to nine tiles away', cheb(ga) >= 7 && cheb(ga) <= 9 && g.ents.list.includes(ga), cheb(ga));
    let band = true; for (let i = 0; i < 12; i++) { ga.moveT = 0; tick(); if (cheb(ga) < 7 || cheb(ga) > 9) band = false; }
    ok('while you hold the light it hovers in that band', band && g.ents.list.includes(ga), cheb(ga));
    const sx = Math.sign(ga.x - X) || 1, lx = ga.x + 3 * sx, ly = ga.y, keepL = w.raw(lx, ly); w.set(lx, ly, '燈');
    const gb = g.ents.add('魄', ga.x - sx, ga.y, { moveT: 99 }); tick();
    ok('a lamp burns a 魄 within three tiles, not four', ga.fade < 1 && !(gb.fade < 1), [ga.fade, gb.fade]);
    w.set(lx, ly, keepL); g.ents.remove(ga); g.ents.remove(gb);
    g.ents.snuffP = 1; const gc = g.ents.add('魄', X + 2, Y, { moveT: 99 }); g.msgText = ''; tick();
    ok('a 魄 within two tiles blows out the torch in your hand: no light for eight seconds', p.snuffT === 8 && !g.hasLight() && g.msgText.indexOf('吹熄') >= 0 && toasts().indexOf('吹燈') >= 0, [p.snuffT, g.hasLight(), g.msgText]);
    g.ents.snuffP = 0; p.burn['火把'] = 0; g.updateStats(1);
    ok('a blown-out torch does not burn down', (p.burn['火把'] || 0) === 0 && Math.abs(p.snuffT - 7) < 1e-9 && !g.hasLight(), [p.burn['火把'], p.snuffT]);
    g.ents.remove(gc); p.snuffT = 0.5; g.msgText = ''; g.updateStats(1);
    ok('after the eight seconds it lights again', p.snuffT === 0 && g.hasLight() && g.msgText.indexOf('又點著了') >= 0, [p.snuffT, g.msgText]);
    hold('木'); g.addItem('燈帽', 1); hold('燈帽'); g.wearItem(p.sel); hold('木'); const hat = p.worn['帽']; hat.fuel = 300; p.san = 100;   // 手裡要空著光，燈帽才燒
    const gd = g.ents.add('魄', X + 1, Y + 1, { moveT: 99 }); g.updateStats(1);
    ok('a 魄 within two tiles makes the hat candle burn three times as fast', !!hat && Math.abs(hat.fuel - 297) < 1e-9, hat && hat.fuel);
    g.ents.remove(gd); g.updateStats(1);
    ok('without it the candle burns at the usual rate', Math.abs(hat.fuel - 296) < 1e-9, hat.fuel);
    g.takeOff('帽'); g.removeItem('燈帽', 9);
    hold('火把'); g.ents.dashT = 0; const ge = g.ents.add('魄', X + 8, Y, { moveT: 99 }); tick();
    ok('every eight to fourteen seconds the nearest hovering 魄 dashes in at the light', ge.dash > 2 && cheb(ge) === 7 && g.ents.dashT >= 8 && g.ents.dashT <= 14, [ge.dash, cheb(ge), g.ents.dashT]);
    for (let i = 0; i < 8; i++) { ge.moveT = 0; tick(); }
    ok('the dash runs right up to you', cheb(ge) <= 1, cheb(ge));
    ge.dash = 0; ge.moveT = 0; tick();
    ok('when the dash is over it backs off again', cheb(ge) === 2, cheb(ge));
    g.ents.remove(ge); g.ents.dashT = 1e9;
    w.time = DAY * 12 + DAY * 0.98; const cap13 = g.ghostCap(); w.time = DAY * 32 + DAY * 0.98; const cap33 = g.ghostCap();
    g.diff = XIEYI.DIFF.hard; w.time = DAY * 39 + DAY * 0.98; const capH = g.ghostCap(); g.diff = XIEYI.DIFF.normal;
    ok('the deeper the nights the more 魄: two on night 13, up to eight (ten on hard)', cap13 === 2 && cap33 === 8 && capH === 10, [cap13, cap33, capH]);
    const spAt = (n) => { w.time = DAY * (n - 1) + DAY * 0.98; return g.ghostSpeed(); };
    ok('from night twenty they get a tenth faster every four nights, up to double', spAt(19) === 1 && Math.abs(spAt(20) - 1.1) < 1e-9 && Math.abs(spAt(23) - 1.1) < 1e-9 && Math.abs(spAt(24) - 1.2) < 1e-9 && spAt(200) === 2, [spAt(19), spAt(20), spAt(24), spAt(200)]);
    w.time = DAY * 23 + DAY * 0.98; hold('木'); const gf = g.ents.add('魄', X + 5, Y, { moveT: 0 }); tick();
    ok('on night twenty-four a chasing 魄 steps every 0.375 s (0.45 ÷ 1.2)', Math.abs(gf.moveT - 0.375) < 1e-9 && cheb(gf) === 4, [gf.moveT, cheb(gf)]);
    g.ents.remove(gf);
    w.time = DAY * 12 + DAY * 0.98; const gg = g.ents.add('魄', X + 3, Y, { moveT: 99 }); p.san = 80; p.sta = 80; g.updateStats(1); const dropN = 80 - p.san;
    g.diff = XIEYI.DIFF.hard; p.san = 80; g.updateStats(1); const dropH = 80 - p.san; g.diff = XIEYI.DIFF.normal;
    ok('a 魄 within four tiles eats four 愜意 a second (five on hard)', dropN > 4 && dropN < 4.2 && dropH > 5 && dropH < 5.2, [dropN, dropH]);
    const lk = w.raw(X - 2, Y); w.set(X - 2, Y, '燈'); p.san = 80; g.updateStats(1);
    ok('a lamp within three tiles of you counts as light: no drain', 80 - p.san < 0.1, 80 - p.san);
    w.set(X - 2, Y, lk); g.ents.remove(gg);
    const ring = []; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const x = X + dx, y = Y + dy; ring.push([x, y, w.raw(x, y)]); w.set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) === 2 ? '磚' : '草'); }
    const gh2 = g.ents.add('魄', X + 6, Y, { moveT: 99 }); p.san = 80; g.updateStats(1); const dIn = 80 - p.san;
    ok('indoors without a lamp, a 魄 circling within eight tiles makes 愜意 seep away (0.5 a second)', g.indoors() && dIn > 0.5 && dIn < 0.6 && toasts().indexOf('屋外有魄') >= 0, dIn);
    w.set(X + 1, Y + 1, '燈'); p.san = 80; g.updateStats(1);
    ok('a lamp in the room stops it', 80 - p.san < 0.1, 80 - p.san);
    w.set(X - 1, Y, '床'); const dBefore = g.day(); g.msgText = ''; g.sleep(); await sleep(30);
    ok('with a lamp within three tiles of the bed you can sleep even with a 魄 outside', g.day() === dBefore + 1, [g.day(), g.msgText]);
    for (const [x, y, c] of ring) w.set(x, y, c); g.ents.remove(gh2);
    g.removeItem('火把', 9); p.snuffT = 0; w.time = tKeep; calm();
  }
  // 煤與鐵：山裡有礦；礦二煤一入旺灶煉鐵；煤是好柴
  let coal = 0, iron = 0; for (let x = -60; x <= 60; x++) for (let y = -60; y <= 60; y++) { const b = w.base(x, y); if (b === '煤') coal++; else if (b === '鐵') iron++; }
  ok('coal seams and iron veins spawn in the mountains', coal >= 5 && iron >= 3, [coal, iron]);
  g.addItem('石鎬', 1); face(0, 1); w.set(T().x, T().y, '鐵'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  ok('mining an iron vein with a pickaxe gives 鐵礦×2 and leaves 石', g.count('鐵礦') === 2 && w.get(T().x, T().y) === '石', bag());
  w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 100); g.pressPlace(); g.stoveCook('鐵礦');
  ok('ore without coal does not smelt', !hidden('stove') && g.count('鐵') === 0 && g.count('鐵礦') === 2);
  g.addItem('煤', 2); g.buildStove();
  ok('the panel lists 鐵礦 with its extra coal and the 煉 verb', (document.querySelector('#stove-cook button[data-cook="鐵礦"]') || {}).textContent.indexOf('煉') >= 0 && !document.querySelector('#stove-cook button[data-cook="鐵礦"]').disabled);
  g.stoveCook('鐵礦');
  ok('two ore and one coal on a lit stove smelt one 鐵', g.count('鐵') === 1 && g.count('鐵礦') === 0 && g.count('煤') === 1, bag());
  const f0 = w.stoveFuel(T().x, T().y); g.stoveFuel('煤');
  ok('coal is strong fuel (+150)', Math.abs(w.stoveFuel(T().x, T().y) - f0 - 150) < 1 && g.count('煤') === 0, w.stoveFuel(T().x, T().y) - f0);
  g.closeStove();
  w.set(T().x, T().y, '土'); hold('石劍'); p.hurtT = 0;
  // 鋼具與鎢鋼具：鐵二木一煤一鍛鋼具（140%）；鐵礦脈 1/30 出鎢礦；八煤成精煤；鎢礦一鐵礦二精煤一煉鎢鋼；鎢鋼具 150%／耐久 200%
  trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); g.addItem('鐵', 2); g.addItem('木', 1); g.addItem('煤', 1); p.sta = 100; g.craft('forge', '鋼劍');
  ok('a steel sword: 56 damage and 56 durability (140% of stone)', !!tool('鋼劍') && tool('鋼劍').dur === 56 && G.ITEMS['鋼劍'].dmg === 56 && g.count('鐵') === 0, bag());
  ok('iron veins hide tungsten one time in thirty', Math.abs(G.DB['鐵'].bonus['鎢礦'] - 1 / 30) < 1e-9);
  const rndT = Math.random; Math.random = () => 0.01; face(0, 1); w.set(T().x, T().y, '鐵'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000); Math.random = rndT;
  ok('a lucky swing on an iron vein yields 鎢礦', g.count('鎢礦') >= 1 && g.count('鐵礦') >= 2, bag());
  g.addItem('煤', 8); p.sta = 100; g.craft('coke');
  ok('eight coal make one refined coal', g.count('精煤') === 1 && g.count('煤') === 0);
  w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 100); g.removeItem('鎢礦', 9); g.removeItem('鐵礦', 9); g.addItem('鎢礦', 1); g.addItem('鐵礦', 2); g.pressPlace(); g.stoveCook('鎢礦'); g.closeStove();
  ok('tungsten ore + two iron ore + refined coal smelt one 鎢鋼', g.count('鎢鋼') === 1 && g.count('鎢礦') === 0 && g.count('鐵礦') === 0 && g.count('精煤') === 0, bag());
  g.addItem('鎢鋼', 1); g.addItem('木', 1); g.addItem('精煤', 1); p.sta = 100; p.food = 80; g.craft('forgew', '鎢鋼劍');
  ok('a tungsten-steel sword: 84 damage, 112 durability', !!tool('鎢鋼劍') && tool('鎢鋼劍').dur === 112 && G.ITEMS['鎢鋼劍'].dmg === 84, bag());
  tool('鎢鋼劍').dur = 5; hold('鎢鋼劍'); g.addItem('石子', 1); p.sta = 50; p.food = 50; g.craft('regrind');
  ok('regrinding tungsten steel costs 8 stamina and 10 food', tool('鎢鋼劍').dur === 112 && p.sta === 42 && Math.round(p.food) === 40, [p.sta, p.food]);
  w.set(T().x, T().y, '土');   // 面向灶按 F 是開灶，穿衣甲要先轉開
  g.addItem('鎢鋼甲', 1); hold('鎢鋼甲'); g.pressPlace(); const wv = p.worn['甲'];
  ok('tungsten armour: 22% (160% of iron, rounded) and 360 days', !!wv && Math.abs(G.ITEMS['鎢鋼甲'].red - 0.22) < 1e-9 && Math.round(wv.dur / DAY) === 360, wv && wv.dur / DAY);
  wv.wm = 3; wv.dur = 1000; g.addItem('鎢鋼', 1); p.sta = 50; p.food = 50; g.repairWorn('甲');
  ok('repairing tungsten armour costs 鎢鋼, 12 stamina and 15 food', Math.round(wv.dur / DAY) === 360 && wv.wm === 1.5 && g.count('鎢鋼') === 0 && p.sta === 38 && Math.round(p.food) === 35, [p.sta, p.food]);
  g.takeOff('甲'); g.removeItem('鎢鋼甲', 9); p.tools = p.tools.filter(s => s.n !== '鋼劍' && s.n !== '鎢鋼劍'); p.tool = -1; hold('石劍'); p.food = 80;
  w.set(T().x, T().y, '土');
  p.cour = g.levelAt(33) + 5; p.decayAt = 0; await sleep(150);
  ok('above level 31 a three-day decay timer starts', g.level() === 33 && p.decayAt > w.time && !hidden('courdecay'), [g.level(), p.decayAt - w.time]);
  w.time = p.decayAt + 0.5; await sleep(150);
  ok('three days later courage drops one level', g.level() === 32 && toasts().indexOf('膽氣衰減') >= 0, g.level());
  w.time = p.decayAt + 0.5; await sleep(150);
  ok('but never below level 31', g.level() === 31 && p.decayAt === 0 && hidden('courdecay'), g.level());
  p.cour = 0; p.decayAt = 0;
  document.getElementById('btn-pause').click(); const tp = w.time; await sleep(150);
  ok('pause button stops the world', g.paused && !hidden('pause') && w.time === tp);
  await press('Escape', 20); await sleep(60);
  ok('Esc resumes', !g.paused && hidden('pause'));
  document.getElementById('btn-map').click(); await sleep(60); const mo = !hidden('map'); document.getElementById('map-close').click(); await sleep(30);
  ok('map button opens the big map', mo && hidden('map'));
  const tl0 = p.tool; await press('KeyP', 20); await sleep(30);
  ok('P cycles the tool in hand', p.tools.length > 0 && p.tool !== tl0, [tl0, p.tool]); hold('石劍');
  ok('vital bars keep the same margin top and bottom', document.getElementById('hpfill').style.getPropertyValue('--p') !== '' && getComputedStyle(document.getElementById('hpfill')).height !== '');
  // 力：取一次 −1，打一下 −1，力盡掉血
  p.cour = 0; p.sta = 50; hold('木'); face(0, 1); w.set(T().x, T().y, '草'); g.action = null; g.pressGather(); await until(() => !g.action, 4000);
  ok('gathering costs one stamina', p.sta < 49.9 && p.sta > 48, p.sta);
  p.sta = 90; p.food = 90; p.san = 90; p.warm = 90; p.hp = 50; p.hurtT = 0; p.cour = 0; await until(() => p.hp > 50.3, 3000);
  ok('hp regenerates when food, warmth, sanity and stamina are at 75 or more', p.hp > 50.3, p.hp);
  // 瓶與酒
  calm();   // 真時間裡夜裡的魄會把人吸到神志不清，手腳不聽使喚就取不了水
  g.addItem('沙', 3); face(0, 1); w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 300); g.pressPlace(); g.stoveCook('沙'); g.closeStove();
  ok('three sand on a lit stove make two bottles', g.count('玻璃瓶') === 2 && g.count('沙') === 0, bag());
  face(1, 0); w.set(T().x, T().y, '水'); hold('玻璃瓶'); g.pressGather();
  ok('empty bottle takes seawater', g.count('海水瓶') === 1 && g.count('玻璃瓶') === 1, [g.count('海水瓶'), g.count('玻璃瓶'), g.msgText, !!g.action, g.canAct(), (g.ents.at(T().x, T().y) || {}).type, w.get(T().x, T().y), g.held() && g.held().n]);
  face(0, 1); g.pressPlace(); g.stoveCook('海水瓶'); g.closeStove();
  ok('seawater distils on the stove', g.count('淡水瓶') === 1 && g.count('海水瓶') === 0);
  hold('玻璃瓶'); const quan = w.places.find(x => x.id === 'quan'); goNextTo(quan.x, quan.y); g.pressGather();
  ok('empty bottle at the spring takes fresh water', g.count('淡水瓶') === 2 && g.count('玻璃瓶') === 0);
  g.addItem('醉果', 2); p.sta = 50; g.craft('wine');
  ok('two drunk fruit and fresh water make wine', g.count('果酒') === 1 && g.count('醉果') === 0 && g.count('淡水瓶') === 1);
  p.food = 50; p.san = 50; hold('果酒'); g.useItem();
  ok('wine +12 food +20 sanity and returns the bottle', Math.round(p.food) === 62 && Math.round(p.san) === 70 && g.count('玻璃瓶') === 1, [p.food, p.san]);
  // 醉果：昏迷六十息、五倍速、周圍照常；醒來飽 +2 愜意 +1 力 −5
  g.addItem('醉果', 1); hold('醉果'); p.food = 50; p.san = 50; p.sta = 50; const t0k = w.time; g.useItem();
  ok('drunk fruit knocks you out', p.knock === 60 && !hidden('knock'));
  await sleep(1000);
  ok('knockout runs the world at the same pace as the countdown', p.knock < 59 && Math.abs((60 - p.knock) - (w.time - t0k)) < 0.3, [p.knock, w.time - t0k]);
  p.food = 50; p.san = 50; p.sta = 50; p.knock = 0.1; await until(() => p.knock <= 0, 3000);   // 醒來前重設，免得快慢不同的畫格數影響判定
  ok('waking gives +2 food +1 sanity −5 stamina', hidden('knock') && p.food > 51.7 && p.food <= 52.01 && p.san > 50.8 && p.san <= 51.01 && p.sta > 44.8 && p.sta < 45.6, [p.food, p.san, p.sta]);
  // 櫃
  face(0, -1); w.set(T().x, T().y, '土'); g.addItem('櫃', 1); hold('櫃'); g.pressPlace();
  ok('placed a chest', w.get(T().x, T().y) === '櫃' && w.chests.has(T().x + ',' + T().y));
  g.pressGather(); ok('chest opens', !hidden('chest') && g.chestAt);
  const nBag = p.bag.length; g.moveStack('bag', 0);
  ok('moving a stack into the chest', p.bag.length === nBag - 1 && w.chests.get(g.chestAt).length === 1);
  g.moveStack('chest', 0); ok('and back', p.bag.length === nBag && w.chests.get(g.chestAt).length === 0);
  g.removeItem('果', 99); g.addItem('果', 2, { d: g.day() - 7 }); g.moveStack('bag', p.bag.findIndex(s => s.n === '果')); const inChest = w.chests.get(g.chestAt)[0]; g.moveStack('chest', 0);
  ok('fruit keeps each piece\'s age through a chest', inChest.n === '果' && g.count('果') === 2 && p.bag.find(s => s.n === '果').ds.every(d => d === g.day() - 7), JSON.stringify(p.bag.find(s => s.n === '果')));
  g.removeItem('果', 99);
  g.addItem('石', 1); g.moveStack('bag', p.bag.findIndex(x => x.n === '石')); const ck2 = g.chestAt, inside2 = w.chests.get(ck2).length; document.getElementById('chest-take').click(); takeYes();
  const boxItem = p.bag.find(x => x.n === '櫃' && x.store);
  ok('a chest with things inside can be taken down and keeps them', hidden('chest') && !w.chests.has(ck2) && inside2 === 1 && !!boxItem && boxItem.store.length === 1 && boxItem.store[0].n === '石' && w.get(...ck2.split(',').map(Number)) === '白', boxItem && boxItem.store);
  g.addItem('櫃', 1); ok('a plain chest does not stack onto one that holds things', p.bag.filter(x => x.n === '櫃').length === 2 && boxItem.c === 1);
  p.sel = p.bag.indexOf(boxItem); face(0, -1); w.set(T().x, T().y, '土'); g.pressPlace();
  ok('placing it again puts the things back inside', w.get(T().x, T().y) === '櫃' && (w.chests.get(T().x + ',' + T().y) || []).length === 1 && w.chests.get(T().x + ',' + T().y)[0].n === '石' && !p.bag.includes(boxItem) && g.count('櫃') === 1);
  g.pressGather(); g.moveStack('chest', 0); document.getElementById('chest-take').click(); takeYes(); g.removeItem('石', 99);
  ok('an empty chest comes back as a plain chest', g.count('櫃') === 2 && !p.bag.some(x => x.n === '櫃' && x.store));
  // 船：放在淺水，上船，渡深水，到海邊渡海（先離開泉邊，免得面前是地標）
  p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; g.closeRead();
  face(1, 0); for (let dy = -1; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) w.set(T().x + dx, T().y + dy, '水'); hold('孤帆'); g.pressPlace();
  ok('a 孤帆 placed on shallow water takes two 舟 tiles (1×2)', w.get(T().x, T().y) === '舟' && w.get(T().x, T().y + 1) === '舟' && w.shipAt(T().x, T().y + 1) === w.shipAt(T().x, T().y) && w.shipAt(T().x, T().y).kind === '孤帆');
  p.cour = g.levelAt(31); g.pressGather(); await sleep(300);
  ok('boarded the ship: both tiles are water again and the hull follows you', p.sailing && w.get(p.x, p.y) === '水' && w.get(p.x, p.y + 1) === '水' && w.ships.size === 0 && p.ship && p.ship.kind === '孤帆');
  const deep = w.get(p.x + 1, p.y); w.set(p.x + 1, p.y, '淼');
  ok('sailing passes deep water', g.pass(p.x + 1, p.y)); w.set(p.x + 1, p.y, deep);
  p.x = p.rx = 0; p.y = p.ry = G.SEA_EDGE + 1; await sleep(200);
  ok('reaching the sea edge triggers the voyage ending', p.crossed && !hidden('voyage'));
  document.getElementById('voyage-back').click(); await sleep(50);
  ok('can turn back', g.paused === false && hidden('voyage'));
  let coastY = G.SEA_EDGE; while (coastY > 0 && G.DB[w.base(0, coastY)].kind === 'water') coastY--;   // 沿 +y 找到海岸，在岸外八格死
  const seaY = coastY + 8;
  p.x = p.rx = 0; p.y = p.ry = seaY; p.sailing = true; p.ship = { kind: '孤帆', hp: 120, skulls: [], repairs: 0 }; p.crossed = false; g.addItem('木', 1); p.hp = 0; await until(() => p.dead, 3000);
  const landBag = [...w.bags.keys()].some(k => { const [x, y] = k.split(',').map(Number); const b = w.base(x, y); return w.get(x, y) === '包' && U.dist(x, y, 0, seaY) < 30 && G.DB[b === '灘' ? '沙' : b].walk > 0 && G.DB[b].kind !== 'water'; });
  const shipLeft = [...w.diff.entries()].some(([k, v]) => v === '舟' && (() => { const [x, y] = k.split(',').map(Number); return U.dist(x, y, 0, seaY) < 30 && w.base(x, y) === '水'; })());
  ok('dying at sea drops the 荷包 on the nearest land and leaves the ship on shallow water', p.dead && landBag && shipLeft, [landBag, shipLeft]);
  await press('Enter', 20); await until(() => !p.dead, 2000); await sleep(80);
  ok('respawn after a sea death is back on land', !p.dead && !p.sailing && w.info(p.x, p.y).walk > 0, [p.dead, p.sailing, p.x, p.y, w.get(p.x, p.y), JSON.stringify(p.home), JSON.stringify(g.spawn)]);
  // 漲潮困在灘上可以涉水走到別的灘
  let beach = null; for (let r = G.ISLAND_R; r <= Math.round(G.ISLAND_R * 1.25) && !beach; r++) for (let a = 0; a < 360 && !beach; a += 2) { const x = Math.round(Math.cos(a * Math.PI / 180) * r), y = Math.round(Math.sin(a * Math.PI / 180) * r); if (w.raw(x, y) === '灘' && w.raw(x + 1, y) === '灘') beach = [x, y]; }
  if (beach) { p.x = p.rx = beach[0]; p.y = p.ry = beach[1]; setDay(0.83); ok('caught by the tide on the causeway you can wade to the next shoal', w.get(beach[0], beach[1]) === '水' && g.pass(beach[0] + 1, beach[1]), beach); p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; }
  else ok('caught by the tide on the causeway you can wade to the next shoal (no causeway found to test)', true);
  if (beach) {   // 漲潮時灘看起來是水，但船與魚梁不能停在灘上，否則退潮會堵住去燈塔的路；橋可以
    setDay(0.83); p.x = p.rx = beach[0] - 1; p.y = p.ry = beach[1]; face(1, 0); g.addItem('漁', 1); hold('漁'); g.pressPlace();
    const parked = g.parkShip(beach[0], beach[1], true, 60); const pk = parked ? w.base(parked[0], parked[1]) : null; if (parked) w.set(parked[0], parked[1], w.base(parked[0], parked[1]));
    ok('no ship parks and no weir gets built on the causeway at high tide', w.raw(beach[0], beach[1]) === '灘' && g.count('漁') === 1 && parked && pk === '水', [w.raw(beach[0], beach[1]), g.count('漁'), JSON.stringify(parked), pk]);
    g.removeItem('漁', 9);
    g.addItem('橋', 1); hold('橋'); g.pressPlace();
    const bridged = w.get(beach[0], beach[1]) === '橋'; setDay(0.48); const lowWalk = w.walkable(beach[0], beach[1]); setDay(0.83);
    g.action = null; g.pressGather(); takeYes(); await until(() => !g.action, 4000);
    ok('a bridge may be built on the causeway, walkable at both tides, and taking it back leaves the causeway', bridged && lowWalk && w.raw(beach[0], beach[1]) === '灘' && g.count('橋') === 1, [bridged, lowWalk, w.raw(beach[0], beach[1]), g.count('橋'), g.msgText]);
    g.removeItem('橋', 9); p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y;
  }
  p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; p.sailing = false; p.crossed = false;
  // 草木長回來（計時器）
  face(0, 1); w.set(T().x, T().y, '草'); hold('木'); g.action = null; g.pressGather(); await until(() => !g.action, 4000);
  const tk = T().x + ',' + T().y;
  ok('cut grass is scheduled to regrow in 30 s', w.get(T().x, T().y) === '白' && w.timers.has(tk) && Math.round(w.timers.get(tk).at - w.time) === 30, w.timers.get(tk));
  w.time += 31; w.step(p.x, p.y);
  ok('and it does regrow', w.get(T().x, T().y) === '草');

  // ============ 海：獸首骨、船的命、蜃、落水、燭龍焚溟 ============
  {
    p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; p.sailing = false; p.swimming = false; p.ship = null;
    trim(['木', '石', '石子', '草', '土', '磚']); for (const t of [...p.tools]) if (t.n !== '石劍') p.tools.splice(p.tools.indexOf(t), 1); p.tool = -1;
    const skull0 = g.skullP; g.skullP = 1; let n0 = g.count('虎首骨'); g.kill(g.ents.add('虎', p.x + 4, p.y, {}));
    const tk = g.count('虎首骨') - n0;
    ok('a slain tiger can leave one or two tiger skulls', tk >= 1 && tk <= 2, tk);
    g.kill(g.ents.add('狼', p.x + 4, p.y, {})); ok('so can a wolf (wolf skulls)', g.count('狼首骨') >= 1);
    g.skullP = 0; g.kill(g.ents.add('豹', p.x + 4, p.y, {})); ok('and no skull when the odds say no', g.count('豹首骨') === 0);
    ok('by default a tiger, leopard or wolf drops a skull 16% of the time', skull0 === 0.16, skull0); g.skullP = skull0; g.removeItem('肉', 99);
    const X = p.x, Y = p.y;
    for (let dx = -3; dx <= 5; dx++) for (let dy = -2; dy <= 2; dy++) w.set(X + dx, Y + dy, dx >= 1 ? '水' : '草');
    const ships0 = w.ships.size;   // 海上死亡的那場已經停了一艘
    w.set(X + 2, Y + 1, '草'); g.addItem('方舟', 1); hold('方舟'); face(1, 0); g.pressPlace();
    ok('a 方舟 needs 2×3 real shallow water: one grass tile in the hull and it will not go down', w.ships.size === ships0 && g.count('方舟') === 1 && g.msgText.indexOf('淺水') >= 0, g.msgText);
    w.set(X + 2, Y + 1, '水'); g.pressPlace();
    const rec = w.shipAt(X + 2, Y + 1);
    ok('with room it takes six 舟 tiles and has 420 hp and five skull slots', w.ships.size === ships0 + 1 && rec && rec.kind === '方舟' && rec.hp === 420 && rec.cells.length === 6 && w.get(X + 1, Y - 1) === '舟' && w.get(X + 2, Y + 1) === '舟' && G.SHIPS['方舟'].slots === 5, JSON.stringify(rec && rec.cells));
    hold('虎首骨'); g.pressPlace();
    ok('a tiger skull on the bow wards the ship for three days', rec.skulls.length === 1 && rec.skulls[0][0] === '虎首骨' && g.wardDaysOf(rec) === 3);
    hold('狼首骨'); g.pressPlace();
    ok('a second skull wards on its own clock: two skulls, the ship stays warded until the tiger skull weathers (3 days)', rec.skulls.length === 2 && g.wardDaysOf(rec) === 3 && Math.round((rec.skulls[1][1] - w.time) / DAY) === 1);
    g.removeItem('狼首骨', 99); g.addItem('狼首骨', 4);   // 殺狼時三成掉兩個，囊裡先歸成剛好四個
    hold('狼首骨'); g.pressPlace(); g.pressPlace(); g.pressPlace(); const n5 = rec.skulls.length; g.pressPlace();
    ok('a 方舟 holds five skulls, a sixth is refused', n5 === 5 && rec.skulls.length === 5 && g.count('狼首骨') === 1, [n5, rec.skulls.length, g.msgText]);
    g.removeItem('狼首骨', 9);
    rec.hp = 100; g.addItem('木板', 1); hold('木板'); g.pressPlace();
    ok('the first repair costs one plank and restores a quarter (105)', rec.hp === 205 && rec.repairs === 1 && g.count('木板') === 0, rec.hp);
    g.addItem('木板', 1); hold('木板'); g.pressPlace(); const hp1 = rec.hp; g.addItem('木板', 1); hold('木板'); g.pressPlace();
    ok('the second repair costs two planks', hp1 === 205 && rec.hp === 310 && rec.repairs === 2 && g.count('木板') === 0, [hp1, rec.hp, g.msgText]);
    rec.hp = 175; p.cour = g.levelAt(8);
    g.pressGather(); await sleep(250);
    ok('below level 31 boarding first asks whether to put to sea, in the name of the fearless', !hidden('seaask') && g.paused && !p.sailing && document.querySelector('#seaask h2').textContent.indexOf('敬勇者之無畏') >= 0 && document.getElementById('seaask-text').textContent.indexOf('神兵') >= 0);
    await press('KeyN', 20); await sleep(50);
    ok('N turns back', hidden('seaask') && !g.paused && !p.sailing && w.ships.size === ships0 + 1);
    g.pressGather(); await sleep(100); await press('KeyY', 20); await sleep(250);
    ok('Y puts to sea: hull hp, skulls and repairs come along, the six tiles are water again', p.sailing && p.ship && p.ship.kind === '方舟' && p.ship.hp === 175 && p.ship.skulls.length === 5 && p.ship.repairs === 2 && g.shipWarded() && w.ships.size === ships0 && w.get(X + 2, Y + 1) === '水');
    p.cour = g.levelAt(31);
    p.moveT = 0; g.tryStep(1, 0); const arkStep = p.stepDur; p.moveT = 0; p.x = p.rx = X + 1; p.y = p.ry = Y;
    ok('a 方舟 sails at 60% of a 孤帆\'s speed', Math.abs(arkStep - 0.14 / 0.6) < 1e-6, arkStep);
    w.time += 1.1 * DAY; g.update(0.01);
    ok('after a day the four wolf skulls weather away with a message and the tiger skull still wards the ship', p.ship.skulls.length === 1 && p.ship.skulls[0][0] === '虎首骨' && g.msgText.indexOf('風化') >= 0 && g.shipWarded(), [p.ship.skulls.length, g.msgText]);
    w.time -= 1.1 * DAY;
    let m = g.ents.add('蜃', X + 4, Y, { moveT: 0, atk: 0, fogT: 999 }); await sleep(1500);
    ok('the 蜃 will not ram a ship with a skull on the bow', p.ship.hp === 175 && g.ents.list.includes(m), p.ship.hp);
    p.ship.skulls = []; m.x = m.rx = X + 3; m.y = m.ry = Y; m.moveT = 0; m.atk = 0;
    await until(() => p.ship && p.ship.hp < 175, 5000);
    ok('without a ward the 蜃 rams the hull for 25', p.ship && p.ship.hp === 150, p.ship && p.ship.hp);
    p.ship.hp = 10; m.x = m.rx = X + 2; m.y = m.ry = Y; m.moveT = 0; m.atk = 0;
    await until(() => p.swimming, 6000); g.ents.remove(m);
    ok('when the ship breaks you fall into the sea with sixty breaths to reach land', p.swimming && !p.sailing && !p.ship && p.swimT > 50 && p.swimT <= 60, [p.swimming, p.swimT]);
    p.swimming = false; const dm = g.dmgMult(), dr = g.ironDrain(); p.swimming = true;
    ok('swimming: weapons ×0.75, food, ease and stamina drain ×2', Math.abs(g.dmgMult() - dm * 0.75) < 1e-9 && Math.abs(g.ironDrain() - dr * 2) < 1e-9);
    const st0 = p.sta; g.updateStats(1);
    ok('swimming: stamina falls instead of recovering', p.sta < st0, [st0, p.sta]);
    g.ents.list = g.ents.list.filter(e => !(e.x === X && e.y === Y)); w.set(X, Y, '草'); p.moveT = 0; const stepped = g.tryStep(-1, 0);
    ok('reaching land ends the swim', stepped && !p.swimming && w.info(p.x, p.y).kind !== 'water', [stepped, p.x, p.y, w.get(p.x, p.y)]);
    const keep = JSON.parse(JSON.stringify({ bag: p.bag, tools: p.tools, cour: p.cour }));
    p.x = p.rx = X + 2; p.y = p.ry = Y; p.swimming = true; p.swimT = 0.3; await until(() => p.dead, 4000);
    const dtx = document.getElementById('dead-text').textContent;
    ok('not reaching land in time drowns you', p.dead && dtx.indexOf('溺死') >= 0, dtx.slice(0, 40));
    await press('Enter', 20); await until(() => !p.dead, 3000);
    for (const [k] of [...w.bags]) { const [bx, by] = k.split(',').map(Number); w.set(bx, by, '白'); }
    p.bag = keep.bag; p.tools = keep.tools; p.tool = -1; p.cour = keep.cour; g.barSig = '';
    ok('after drowning you wake on land, no longer swimming', !p.swimming && !p.sailing && w.info(p.x, p.y).kind !== 'water');
    g.ents.seaP = 1; await sleep(1800); const onLand = g.ents.count('蜃');
    p.x = p.rx = 0; p.y = p.ry = G.SEA_EDGE - 8; p.sailing = true; p.ship = { hp: 200, ward: 0, skull: '' };
    await until(() => g.ents.count('蜃') > 0, 5000); const rose = g.ents.count('蜃');
    g.ents.seaP = 0; g.ents.list = g.ents.list.filter(e => e.type !== '蜃');
    ok('a 蜃 rises only when you are at sea', onLand === 0 && rose === 1, [onLand, rose, g.paused, p.sailing, p.dead, p.x, p.y, w.get(p.x, p.y), g.ents.spawnAcc, g.ents.seaP, [...document.querySelectorAll('.overlay:not(.hidden)')].map(o => o.id).join(',')]);
    const sf = w.spawnSeaFog(0, G.SEA_EDGE - 4, 0, G.SEA_EDGE - 12);
    ok('the 蜃 breathes fog onto open water only', sf && sf.sea && [...sf.cells].every(k => { const [x, y] = k.split(',').map(Number); return w.fogSea(x, y); }), sf && sf.cells.size);
    if (sf) w.removeFog(sf.id);
    p.sailing = false; p.ship = null; p.x = p.rx = X; p.y = p.ry = Y; await sleep(100);
    p.cour = g.levelAt(31); for (const [n, c] of [['鎢鋼', 4], ['精煤', 6], ['火把', 4], ['海水瓶', 3]]) g.addItem(n, c); p.sta = 100; g.craft('seagod');
    ok('燭龍焚溟 is made at level 31 with tungsten steel, refined coal, torches and sea water; 120 damage, 199 durability', !!tool('燭龍焚溟') && tool('燭龍焚溟').dur === 199 && G.ITEMS['燭龍焚溟'].dmg === 120 && g.count('海水瓶') === 0);
    hold('燭龍焚溟'); face(1, 0);
    const sm = g.ents.add('蜃', X + 2, Y, { moveT: 99, atk: 9, fogT: 999 }), tg = g.ents.add('虎', X - 2, Y, { moveT: 99, calm: 99 });
    p.atkT = 0; p.sta = 100; g.pressGather();
    const full = Math.round(120 * g.dmgMult()), half = Math.round(120 * g.dmgMult() * 0.5);
    ok('燭龍焚溟 burns the 蜃 for full damage and a tiger for half', sm.hp === 900 - full && tg.hp === 300 - half, [sm.hp, tg.hp, full, half]);
    p.sailing = true; p.ship = { kind: '孤帆', hp: 120, skulls: [], repairs: 0 }; p.atkT = 0; p.sta = 100; g.pressGather();
    ok('swung from the deck it scorches your own ship for a tenth', p.ship && p.ship.hp === 120 - Math.round(full / 10), p.ship && p.ship.hp);
    p.ship.hp = 5; p.atkT = 0; g.pressGather();
    ok('and can burn through your own hull', !p.sailing && p.swimming, [p.sailing, p.swimming]);
    p.swimming = false; p.swimT = 0;
    g.addItem('九閽鳴雷', 1); hold('九閽鳴雷'); p.atkT = 0; p.sta = 100; const s1 = sm.hp, t1 = tg.hp; g.pressGather();
    ok('九閽鳴雷 does only half to the 蜃 and full to the tiger', s1 - sm.hp === half && t1 - tg.hp === full, [s1 - sm.hp, t1 - tg.hp]);
    g.ents.remove(sm); g.ents.remove(tg);
    for (const n of ['燭龍焚溟', '九閽鳴雷']) { const i = p.tools.findIndex(s => s.n === n); if (i >= 0) p.tools.splice(i, 1); g.removeItem(n, 9); }
    p.tool = -1; p.cour = 0; p.decayAt = 0;
    g.save(); const sv2 = JSON.parse(localStorage.getItem('xieyi.save.v5'));
    ok('ship records and swimming are saved', sv2.world.ships && 'ship' in sv2.player && sv2.player.swimming === false);
    // 沒解決的蜃：存檔裡有牠，讀檔後牠散了，膽氣減五重
    const mm = g.ents.add('蜃', X + 4, Y, { moveT: 99, fogT: 999 }); p.cour = g.levelAt(12) + 10; g.save(); const sv3 = JSON.parse(localStorage.getItem('xieyi.save.v5')); g.ents.remove(mm);
    ok('an unresolved 蜃 is written into the save', sv3.ents.some(e => e.t === '蜃'));
    g.ents.list = g.ents.list.filter(e => e.type !== '龍' && !e.tame); g.load(sv3);
    ok('loading drops the 蜃 and five courage levels, keeping the progress within the level', g.ents.count('蜃') === 0 && g.level() === 7 && Math.abs(p.cour - (g.levelAt(7) + 10 / g.levelCost(12) * g.levelCost(7))) < 1e-4, [g.level(), p.cour]);
    ok('vital bars carry three scale marks and tools wear a durability ring', getComputedStyle(document.querySelector('.bar'), '::after').backgroundPosition.split(',').length === 3 && (() => { g.addItem('石刀', 1); g.barSig = ''; g.buildBag(); return !!document.querySelector('#toolbar .slot.ringed .ring'); })());
    p.cour = 0;
    p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y;
  }

  // ============ 霧障：每日兩擲；走進去問要不要用扇子；不用就五樣各掉一成，不致命 ============
  {
    for (const id of [...w.fogs.keys()]) w.removeFog(id);
    const near1 = (f) => [...f.cells].some(k => { const [x, y] = k.split(',').map(Number); return Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1; });
    const connected = (f) => { const all = [...f.cells], seen = new Set([all[0]]), q = [all[0]]; while (q.length) { const [x, y] = q.shift().split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (f.cells.has(k) && !seen.has(k)) { seen.add(k); q.push(k); } } } return seen.size === f.cells.size; };
    w.fogP = 1; w.fogPlan = []; const d0 = Math.floor(w.time / DAY); w.fogDay = d0; w.time = (d0 + 1) * DAY + 1; w.step(p.x, p.y);
    const planned = w.fogPlan.length; w.time = (d0 + 2) * DAY - 0.001; w.step(p.x, p.y); w.fogP = 0;   // 到當日最後一刻：兩場都該起了
    const fs = [...w.fogs.values()];
    ok('a new day rolls twice for fog (odds forced to 1): two patches of 5–12 connected land tiles, none on the player', planned === 2 && fs.length === 2 && fs.every(f => f.cells.size >= 5 && f.cells.size <= 12 && connected(f) && !near1(f) && [...f.cells].every(k => { const [x, y] = k.split(',').map(Number); return w.fogLand(x, y); })), [planned, fs.map(f => f.cells.size), w.fogMiss, w.fogNoSeed, p.x, p.y, w.get(p.x, p.y)]);
    const shapes = new Set(); for (let i = 0; i < 10; i++) { const f = w.spawnFog(p.x, p.y); if (!f) continue; const cs = [...f.cells].map(k => k.split(',').map(Number)), mx = Math.min(...cs.map(c => c[0])), my = Math.min(...cs.map(c => c[1])); shapes.add(cs.map(([x, y]) => (x - mx) + ':' + (y - my)).sort().join(' ')); }
    ok('fog shapes vary', shapes.size >= 4, shapes.size);
    for (const id of [...w.fogs.keys()]) w.removeFog(id);
    // 自己擺一片霧在東邊兩格
    const X = p.x, Y = p.y; for (let dx = 1; dx <= 4; dx++) w.set(X + dx, Y, '草');
    const mk = () => w.addFog([(X + 1) + ',' + Y, (X + 2) + ',' + Y], w.time + DAY);
    const stand = (x) => { p.x = p.rx = x; p.y = p.ry = Y; };
    const snap = () => ({ hp: p.hp, food: p.food, warm: p.warm, sta: p.sta, san: p.san });
    const tolled = (a, b) => ['hp', 'food', 'warm', 'sta', 'san'].every(k => Math.abs(b[k] - (a[k] - U.r4(a[k] * 0.1))) < 1e-6);
    p.knock = 0; p.sailing = false; p.inFog = 0; g.removeItem('扇', 99); p.hp = 80; p.food = 50; p.warm = 60; p.sta = 40; p.san = 70;
    let f1 = mk(); stand(X + 1); await until(() => !hidden('fogask'), 3000);
    const noFanText = document.getElementById('fogask-text').textContent;
    ok('walking into fog pops the question and pauses the world; without a fan only "walk through" is offered', !hidden('fogask') && g.paused && noFanText.indexOf('沒有扇子') >= 0 && hidden('fogask-use'), noFanText);
    let s0 = snap(); document.getElementById('fogask-no').click(); const s1 = snap();
    ok('without a fan: hp, food, warmth, stamina and ease each lose a tenth (to four decimals)', tolled(s0, s1) && !g.paused && p.inFog === f1.id, [JSON.stringify(s0), JSON.stringify(s1)]);
    stand(X + 2); await sleep(200);
    ok('moving about inside the same fog does not ask again', hidden('fogask'));
    stand(X); await sleep(150); g.addItem('扇', 2); stand(X + 1); await until(() => !hidden('fogask'), 3000);
    ok('leaving and walking back in asks again, now offering the fan', !hidden('fogask') && !hidden('fogask-use') && document.getElementById('fogask-use').textContent.indexOf('2') >= 0);
    s0 = snap(); document.getElementById('fogask-use').click(); const s2 = snap();
    ok('using a fan blows the whole fog away, costs one fan and nothing else', g.count('扇') === 1 && !w.fogs.has(f1.id) && !w.fogAt(X + 2, Y) && ['hp', 'food', 'warm', 'sta', 'san'].every(k => s2[k] === s0[k]) && !g.paused);
    stand(X); await sleep(150); f1 = mk(); stand(X + 1); await until(() => !hidden('fogask'), 3000);
    s0 = snap(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true })); const s3 = snap(); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyN', bubbles: true }));
    ok('N refuses: the fan is kept and the toll is paid', hidden('fogask') && g.count('扇') === 1 && tolled(s0, s3) && w.fogs.has(f1.id), [JSON.stringify(s0), JSON.stringify(s3)]);
    w.removeFog(f1.id); stand(X); await sleep(150); p.hp = 1; f1 = mk(); stand(X + 1); await until(() => !hidden('fogask'), 3000); await press('KeyN', 20); await sleep(30);
    ok('the fog toll is never lethal', p.hp >= 1 && !p.dead, p.hp);
    w.removeFog(f1.id); stand(X); p.hp = 80; await sleep(100);
    const f2 = w.addFog([(X + 3) + ',' + Y, (X + 4) + ',' + Y], w.time + DAY); hold('扇'); g.useItem();
    ok('a fan in hand blows away fog within three tiles (V)', !w.fogs.has(f2.id) && g.count('扇') === 0);
    g.addItem('草', 4); g.addItem('木', 1); p.sta = 100; g.craft('fan');
    ok('a fan is four grass and one wood', g.count('扇') === 1);
    const f3 = w.addFog([(X + 3) + ',' + Y], w.time + DAY), f4 = w.addFog([(X + 4) + ',' + Y], w.time + 1);
    const w2 = new window.World(w.seed); w2.restore(w.serialize());
    ok('fogs are saved and restored', w2.fogs.size === w.fogs.size && !!w2.fogAt(X + 3, Y), w2.fogs.size);
    w.time += 2; w.step(p.x, p.y);
    ok('a fog left alone fades after its time', !w.fogs.has(f4.id) && w.fogs.has(f3.id));
    w.removeFog(f3.id); g.removeItem('扇', 9);
  }

  // ============ G. 地標、碑、問路、潮汐、存檔 ============
  calm();
  const by = (id) => w.places.find(x => x.id === id);
  const ta = by('ta'); goNextTo(ta.x, ta.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('塔 reveals the island', w.places.every(x => x.seen) && p.places.ta === 2);
  const ch = by('chuan'); goNextTo(ch.x, ch.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('船 gives a raft', g.count('竹筏') === 1);
  const mu = by('mu'); goNextTo(mu.x, mu.y); const b0 = g.count('磚'); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('墓 gives bricks and pebbles', g.count('磚') === b0 + 6 && g.count('石子') >= 3);
  const dong = by('dong'); goNextTo(dong.x, dong.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  await until(() => p.creatures.indexOf('龍') >= 0, 4000);
  ok('洞 releases a dragon that follows', g.ents.list.some(e => e.type === '龍') && p.dragon && p.creatures.indexOf('龍') >= 0);
  { const dr = g.ents.list.find(e => e.type === '龍'); setDay(0.98); hold('木'); if (p.worn['帽']) g.takeOff('帽'); g.removeItem('燈帽', 9);
    const spot = [[6, 0], [-6, 0], [0, 6], [0, -6]].map(([dx, dy]) => [dr.x + dx, dr.y + dy]).find(([x, y]) => !w.lightNear(x, y, 7) && U.cheb(x, y, p.x, p.y) > 6);
    if (spot) {
      const dir = [Math.sign(spot[0] - dr.x), Math.sign(spot[1] - dr.y)];
      const gh5 = g.ents.add('魄', dr.x + dir[0] * 5, dr.y + dir[1] * 5, { moveT: 99 }), gh4 = g.ents.add('魄', dr.x + dir[0] * 4, dr.y + dir[1] * 4, { moveT: 99 }); dr.moveT = 99;
      await until(() => !g.ents.list.includes(gh4), 4000);
      ok('the dragon dispels 魄 within four tiles, not five', !g.ents.list.includes(gh4) && g.ents.list.includes(gh5), [g.ents.list.includes(gh4), g.ents.list.includes(gh5)]);
      g.ents.remove(gh5); dr.moveT = 0;
    } else ok('the dragon dispels 魄 within four tiles, not five (no dark spot to test here)', true);
  }
  const cun = by('cun'); const gx = cun.x + 3, gy = cun.y;
  ok('the village is 7×7 with the well in the middle', cun.w === 7 && cun.h === 7 && w.get(cun.x + 3, cun.y + 3) === '井' && w.get(gx, gy) === '門'); w.set(gx, gy - 1, '草'); p.x = p.rx = gx; p.y = p.ry = gy - 1; face(0, 1);
  for (const pl of w.places) if (pl.id !== 'ta') p.places[pl.id] = 1;
  g.pressGather(); await sleep(30);
  ok('village gate gives directions', toasts().indexOf('問路') >= 0, toasts().slice(-30));
  const st = [...w.steles.values()][0]; goNextTo(st.x, st.y); const sm = p.staMax; g.pressGather(); await sleep(30);
  ok('stele raises stamina cap', p.staMax === sm + 10, p.staMax);
  const reach = () => { const sp = g.spawn, d = by('deng'); const seen = new Set([sp.x + ',' + sp.y]); const q = [[sp.x, sp.y]]; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k)) continue; if (Math.abs(nx - d.x) <= 1 && Math.abs(ny - d.y) <= 1) return true; if (w.walkable(nx, ny)) { seen.add(k); q.push([nx, ny]); } } } reach.last = { n: seen.size, sp: sp.x + ',' + sp.y + ' ' + w.get(sp.x, sp.y), around: [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => w.get(sp.x + dx, sp.y + dy)).join('') }; return false; };
  setDay(0.48); const lo = reach(); setDay(0.83); const hi = reach();
  ok('lighthouse reachable only at low tide', lo && !hi, [lo, hi, JSON.stringify(reach.last)]);
  await press('KeyM', 20); await sleep(50); const mapOpen = !hidden('map'); await press('KeyM', 20); await sleep(30);
  ok('island map toggles', mapOpen && hidden('map'));
  await press('KeyJ', 20); await sleep(30); const jt = document.getElementById('journal-body').textContent; await press('KeyJ', 20);
  ok('journal has places and creatures', jt.indexOf('塔') >= 0 && jt.indexOf('龍') >= 0, jt.slice(jt.indexOf('生靈'), jt.indexOf('生靈') + 30));
  // —— 雨：屋外的燈會被澆壞，屋裡的不怕
  { const cx = p.x + 12, cy = p.y + 12;
    for (let dx = -8; dx <= 8; dx++) for (let dy = -5; dy <= 5; dy++) w.set(cx + dx, cy + dy, '土');
    for (let d = -2; d <= 2; d++) { w.set(cx - 6 + d, cy - 2, '磚'); w.set(cx - 6 + d, cy + 2, '磚'); w.set(cx - 8, cy + d, '磚'); w.set(cx - 4, cy + d, '磚'); }
    w.set(cx - 6, cy + 2, '門'); w.set(cx - 6, cy, '燈'); w.set(cx + 3, cy, '燈');
    ok('lamp in a walled room is covered, lamp in the open is not', w.covered(cx - 6, cy) && !w.covered(cx + 3, cy));
    w.rainUntil = w.time + 120; w.rainAcc = 0; g.hudSig = ''; g.updateHUD();
    ok('rain shows in the status line', w.raining() && document.getElementById('status').textContent.indexOf('雨') >= 0);
    w.rainLampP = 1; w.tick(1.0, p.x, p.y); await sleep(50);
    ok('rain ruins the lamp outside and spares the one indoors', w.get(cx + 3, cy) !== '燈' && w.get(cx - 6, cy) === '燈' && !w.lamps.has((cx + 3) + ',' + cy));
    const sw = w.serialize();
    ok('true random helper and weather save fields exist', typeof U.trueRand() === 'number' && U.trueRand() < 1 && typeof sw.rainUntil === 'number' && typeof sw.nextRainAt === 'number');
    w.rainLampP = XIEYI.DIFF.normal.lampP; w.rainUntil = 0; }
  // ============ v0.14：神兵成類、小屋、霧障會動、數值燈與提醒 ============
  calm();
  ok('god weapons have their own craft category 神兵', G.CRAFT_CATS.indexOf('神兵') > 0 && G.RECIPES.find(r => r.id === 'hammer').cat === '神兵' && G.RECIPES.find(r => r.id === 'seagod').cat === '神兵' && !G.RECIPES.some(r => r.cat === '工具' && (r.id === 'hammer' || r.id === 'seagod')));
  // —— 小屋：牆與門圍起的小空間擋獸、擋魄，多小才算看難度（獸／魄）：簡單 28／18、一般 18／8、困難 10／擋不住
  { const cx = p.x + 20, cy = p.y + 20, d0 = g.diff;
    const box = (x0, y0, iw, ih) => { for (let dx = -1; dx <= iw; dx++) for (let dy = -1; dy <= ih; dy++) w.set(x0 + dx, y0 + dy, (dx < 0 || dy < 0 || dx === iw || dy === ih) ? '磚' : '土'); };
    const clear = (x0, y0, iw, ih) => { for (let dx = -1; dx <= iw; dx++) for (let dy = -1; dy <= ih; dy++) w.set(x0 + dx, y0 + dy, '草'); };
    ok('room thresholds per difficulty: easy 28/18, normal 18/8, hard 10/0', XIEYI.DIFF.easy.room === 28 && XIEYI.DIFF.easy.ghostRoom === 18 && XIEYI.DIFF.normal.room === 18 && XIEYI.DIFF.normal.ghostRoom === 8 && XIEYI.DIFF.hard.room === 10 && XIEYI.DIFF.hard.ghostRoom === 0);
    box(cx, cy, 2, 4); w.set(cx, cy + 4, '門');   // 2×4 ＝ 8 格，南牆開一扇門
    ok('an 8-cell room counts 8 from any cell inside; the door and the outside are no room', w.roomSize(cx, cy) === 8 && w.roomSize(cx + 1, cy + 3) === 8 && !isFinite(w.roomSize(cx, cy + 4)) && w.roomSize(cx, cy + 6) > 28);
    g.diff = XIEYI.DIFF.normal;
    ok('normal: 8 cells keep out beasts, eagles, the dragon and the 魄; nothing spawns inside', !g.ents.habitat('魄', cx, cy, true) && !g.ents.habitat('鹿', cx, cy, false) && !g.ents.canStand('狼', cx, cy, true) && !g.ents.canStand('鷹', cx, cy, true) && !g.ents.canStand('龍', cx, cy, true) && !g.ents.canStand('魄', cx, cy, true) && g.ents.canStand('魄', cx, cy + 6, true));
    const gh = g.ents.add('魄', cx, cy + 6, { moveT: 99 }); let inside = false; for (let i = 0; i < 12; i++) { g.ents.stepTo(gh, cx, cy, false, true); if (w.sheltered(gh.x, gh.y, '魄')) inside = true; } g.ents.remove(gh);
    ok('a 魄 chasing the player never gets into the room', !inside, [gh.x - cx, gh.y - cy]);
    ok('tamed companions and the dragon are placed outside the room', (() => { const at = g.freeNear(cx, cy, true); return !w.sheltered(at.x, at.y, '鷹'); })());
    w.set(cx + 2, cy, '土');
    ok('knock out a wall and the room opens (the cache is cleared on every change)', !w.sheltered(cx, cy, '狼') && w.roomSize(cx, cy) > 28);
    clear(cx, cy, 2, 4);
    // 八間屋：8、9、10、11、18、19、28、29 格
    const rooms = { 8: [cx, cy, 2, 4], 9: [cx + 6, cy, 3, 3], 10: [cx + 12, cy, 2, 5], 11: [cx + 18, cy, 1, 11], 18: [cx + 22, cy, 3, 6], 19: [cx + 28, cy, 1, 19], 28: [cx + 32, cy, 4, 7], 29: [cx + 38, cy, 1, 29] };
    for (const r of Object.values(rooms)) box(...r);
    const at = (n, type) => w.sheltered(rooms[n][0], rooms[n][1], type);
    ok('rooms of 8…29 cells are counted right', Object.keys(rooms).every(n => w.roomSize(rooms[n][0], rooms[n][1]) === +n), Object.keys(rooms).map(n => w.roomSize(rooms[n][0], rooms[n][1])));
    g.diff = XIEYI.DIFF.normal;
    ok('normal: beasts stop at 18 cells, not 19; the 魄 stops at 8, not 9', at(18, '狼') && !at(19, '狼') && at(8, '魄') && !at(9, '魄'));
    g.diff = XIEYI.DIFF.hard;
    ok('hard: beasts stop at 10 cells, not 11; nothing but light stops the 魄', at(10, '狼') && !at(11, '狼') && !at(8, '魄') && !at(9, '鷹') === false && !g.ents.canStand('虎', rooms[10][0], rooms[10][1], true) && g.ents.canStand('魄', rooms[8][0], rooms[8][1], true));
    g.diff = XIEYI.DIFF.easy;
    ok('easy: beasts stop at 28 cells, not 29; the 魄 stops at 18, not 19', at(28, '狼') && !at(29, '狼') && at(18, '魄') && !at(19, '魄'));
    g.diff = d0;
    for (const r of Object.values(rooms)) clear(...r); }
  // —— 廿二重起只靠斃敵長膽氣；斃敵白日八成、夜裡加半成
  { const t0 = w.time, c0 = p.cour; trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']);
    p.cour = g.levelAt(21); g.addItem('土', 2); g.addItem('草', 1); p.sta = 50; g.craft('brick');
    ok('below level 22 crafting still gives courage (3 × 1.25 = 3.75)', Math.abs(p.cour - g.levelAt(21) - 3.75) < 1e-6, p.cour - g.levelAt(21));
    p.cour = g.levelAt(22); g.killOnlyHinted = false; g.addItem('土', 2); g.addItem('草', 1); p.sta = 50; g.craft('brick');
    ok('from level 22 crafting gives none (the brick is still made)', p.cour === g.levelAt(22) && g.count('磚') >= 2 && toasts().indexOf('膽氣不長了') >= 0);
    g.addCourage(5, 'other'); ok('nor do gathering, reading or fishing', p.cour === g.levelAt(22));
    setDay(0.53); face(1, 0); w.set(T().x, T().y, '草'); g.kill(g.ents.add('鹿', T().x, T().y, { moveT: 99 }));
    ok('a deer is not hostile: no courage at 22', p.cour === g.levelAt(22) && !g.isNight());
    g.kill(g.ents.add('虎', T().x, T().y, { moveT: 99 }));
    ok('a tiger by day: 30 × 0.8 × 1.25 = 30', p.cour === g.levelAt(22) + 30, p.cour - g.levelAt(22));
    setDay(0.93); p.cour = g.levelAt(22); g.kill(g.ents.add('虎', T().x, T().y, { moveT: 99 }));
    ok('a tiger by night: 30 × 1.05 × 1.25 = 39.375, kept to four decimals', g.isNight() && Math.abs(p.cour - (g.levelAt(22) + 39.375)) < 1e-6, p.cour - g.levelAt(22));
    p.cour = 0; g.kill(g.ents.add('狼', T().x, T().y, { moveT: 99 }));
    ok('the day/night factor applies at any level: a wolf by night gives 19.6875 (15 × 1.05 × 1.25)', p.cour === 19.6875, p.cour);
    setDay(0.53); p.cour = 0; g.kill(g.ents.add('鹿', T().x, T().y, { moveT: 99 }));
    ok('below 22 a deer still gives its 3 (×1.25 = 3.75), no day factor', p.cour === 3.75, p.cour);
    w.time = t0; p.cour = c0; for (const n of ['肉', '磚', '虎首骨', '狼首骨']) g.removeItem(n, 99); }
  // —— 霧障會動：慢慢挪，躲著光；沒光就亂飄
  { const X = p.x, Y = p.y; for (const id of [...w.fogs.keys()]) w.removeFog(id);
    for (let dx = 0; dx <= 14; dx++) for (let dy = -2; dy <= 2; dy++) w.set(X + dx, Y + dy, '草');
    unarm(); p.worn['帽'] = null; g.removeItem('火把', 99); g.removeItem('蠟燭', 99); p.sel = 0;   // 手裡頭上都沒光
    ok('a fresh world moves fog every six seconds', new window.World(3).fogStep === 6 && !g.hasLight());
    const fog = w.addFog([(X + 6) + ',' + Y, (X + 7) + ',' + Y, (X + 7) + ',' + (Y + 1)], w.time + DAY);
    const cellsOf = () => [...fog.cells].map(k => k.split(',').map(Number));
    w.set(X + 3, Y, '燈');
    const moved1 = w.moveFog(fog, X, Y); const c1 = cellsOf();
    ok('a lamp within ten tiles pushes the fog away: every cell shifts one step east (straight or slanting)', moved1 && c1.length === 3 && c1.every(([x]) => x >= X + 7) && !w.fogAt(X + 6, Y), c1);
    w.set(X + 3, Y, '草'); p.x = p.rx = X + 12; p.y = p.ry = Y; g.addItem('火把', 1); hold('火把');
    const moved2 = g.hasLight() && w.moveFog(fog, p.x, p.y); const c2 = cellsOf();
    ok('a torch in the player\'s hand counts as light: the fog backs away west', moved2 && c2.every(([x]) => x <= X + 7), c2);
    unarm(); g.removeItem('火把', 9); p.sel = 0; p.x = p.rx = X; p.y = p.ry = Y;
    const before = JSON.stringify(cellsOf()); const moved3 = w.moveFog(fog, X, Y); const c3 = cellsOf();
    ok('with no light around the fog still drifts one step and stays on land', moved3 && c3.length === 3 && c3.every(([x, y]) => w.fogLand(x, y)) && JSON.stringify(c3) !== before, c3);
    fog.moveAt = w.time; w.fogStep = 1000; const c4 = JSON.stringify(cellsOf()); w.step(p.x, p.y);
    ok('the world tick moves fogs on the fog clock and winds it up again', JSON.stringify(cellsOf()) !== c4 && fog.moveAt > w.time + 500 && fog.moveAt < w.time + 1500 && [...fog.cells].every(k => w.fogCells.get(k) === fog.id), fog.moveAt - w.time);
    const w2 = new window.World(w.seed); w2.restore(w.serialize()); const f2 = [...w2.fogs.values()][0];
    ok('a restored fog gets a fresh move clock', !!f2 && f2.moveAt > w2.time, f2 && f2.moveAt - w2.time);
    w.fogStep = 1e9; w.removeFog(fog.id); }
  // —— 數值燈與提醒：不到五成亮燈，不到四分之一彈窗；困難只亮燈
  { const bar = (k) => document.getElementById(k + 'fill').parentNode, title = () => document.getElementById('warn-title').textContent;
    g.warnEnabled = true; p.warnLow = {}; p.hp = p.hpMax; p.food = 100; p.warm = 100; p.sta = p.staMax; p.san = 100; g.hudSig = ''; g.updateHUD(); await sleep(80);
    ok('all five full: nothing flashes, no popup; the old lamp dots are gone', !bar('hp').classList.contains('warn') && !bar('san').classList.contains('warn') && hidden('warn') && document.querySelectorAll('.bar .lamp').length === 0 && getComputedStyle(bar('hp')).animationName === 'none');
    p.hp = p.hpMax * 0.4; g.hudSig = ''; g.updateHUD(); await sleep(120);
    ok('命 at 40%: the bar\'s outline flashes once every two seconds (yellow), no popup yet', bar('hp').classList.contains('warn') && !bar('hp').classList.contains('low') && hidden('warn') && getComputedStyle(bar('hp')).animationName === 'warn-flash' && getComputedStyle(bar('hp')).animationDuration === '2s');
    p.hp = p.hpMax * 0.2; g.hudSig = ''; g.updateHUD(); await until(() => !hidden('warn'), 2000);
    ok('命 at 20%: the outline flashes every second (red) and a popup pauses the game and names 命', bar('hp').classList.contains('low') && getComputedStyle(bar('hp')).animationName === 'low-flash' && getComputedStyle(bar('hp')).animationDuration === '1s' && !hidden('warn') && g.paused && g.warnOpen && title().indexOf('命') >= 0, title());
    await press('Enter', 20); await sleep(80);
    ok('Enter closes the popup and the game runs on', hidden('warn') && !g.paused && !g.warnOpen);
    p.hp = p.hpMax * 0.15; await sleep(200);
    ok('still low: no second popup until 命 climbs back above half', hidden('warn'));
    p.hp = p.hpMax * 0.6; await sleep(150); p.hp = p.hpMax * 0.1; await until(() => !hidden('warn'), 2000);
    ok('after recovering above half, dropping again warns again', !hidden('warn')); g.closeWarn();
    p.hp = p.hpMax; p.food = 20; p.san = 20; p.warnLow = {}; await until(() => !hidden('warn'), 2000);
    ok('two stats at once: one popup naming both', title().indexOf('飽') >= 0 && title().indexOf('愜意') >= 0, title()); g.closeWarn();
    p.food = 100; p.san = 100; p.warnLow = {}; const d0 = g.diff; g.diff = XIEYI.DIFF.hard; p.warm = 10; g.hudSig = ''; g.updateHUD(); await sleep(250);
    ok('hard mode: the outline flashes but there is no popup', bar('warm').classList.contains('low') && hidden('warn') && !g.paused && XIEYI.DIFF.hard.warn === false && XIEYI.DIFF.normal.warn === true);
    g.diff = d0; p.warm = 100; p.warnLow = {}; g.warnEnabled = false; g.hudSig = ''; g.updateHUD(); }
  // ============ 手柄已封存（v0.27）：遊戲不載入 pad.js，介面上沒有手柄設定；幫助從暫停面板開時在最上面 ============
  { const top = () => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && e.closest('.overlay') && e.closest('.overlay').id; };
    ok('no gamepad code or settings in the game: no window.PAD, no 手柄設定 buttons, no pad panels', typeof window.PAD === 'undefined' && !document.getElementById('btn-pad') && !document.getElementById('pause-pad') && !document.getElementById('help-pad') && !document.getElementById('padset') && !document.getElementById('padmap') && !document.getElementById('pause-bars') && document.body.textContent.indexOf('手柄') < 0);
    g.togglePause(); document.getElementById('pause-help').click(); await sleep(30);
    ok('the help opened from the pause panel is on top of it', g.userPaused && !hidden('help') && top() === 'help', top());
    document.getElementById('help').classList.add('hidden'); g.togglePause(); }
  // ============ 拆人造的東西先問一聲；烤肉烤蛇回血 ============
  calm();
  { face(0, 1); w.set(T().x, T().y, '燈'); unarm(); g.action = null; const lampAt = T();
    g.keys.add('KeyE'); g.pressGather();
    ok('E on a placed lamp asks first: popup up, world paused, no gather started, held E dropped', !hidden('takeask') && g.paused && !!g.takeAsk && !g.action && !g.keys.has('KeyE') && document.getElementById('takeask-text').textContent.indexOf('燈') >= 0);
    await press('KeyN', 20);
    ok('N keeps it: popup closed, lamp still there, world running', hidden('takeask') && !g.paused && w.get(lampAt.x, lampAt.y) === '燈');
    g.pressGather(); await press('KeyY', 20); await until(() => !g.action, 4000);
    ok('Y takes it down', w.get(lampAt.x, lampAt.y) === '白' && g.count('燈') >= 1, [w.get(lampAt.x, lampAt.y), g.count('燈')]);
    w.set(T().x, T().y, '木'); g.action = null; g.pressGather();
    ok('a tree is not man-made: no question, gathering starts at once', hidden('takeask') && !!g.action); g.action = null; w.set(T().x, T().y, '草');
    w.set(T().x, T().y, '偶'); g.pressGather(); const sText = document.getElementById('takeask-text').textContent; document.getElementById('takeask-no').click();
    ok('the scarecrow question mentions losing its days; the button says no', sText.indexOf('重計') >= 0 && hidden('takeask') && w.get(T().x, T().y) === '偶'); w.set(T().x, T().y, '草');
    const hp0 = 50; p.hp = hp0; g.addItem('烤肉', 1); hold('烤肉'); g.useItem();
    ok('烤肉 heals 10', Math.round(p.hp) === hp0 + 10, p.hp);
    p.hp = hp0; g.addItem('烤蛇', 1); hold('烤蛇'); g.useItem();
    ok('烤蛇 heals 8', Math.round(p.hp) === hp0 + 8, p.hp);
    p.hp = p.hpMax - 3; g.addItem('烤肉', 1); hold('烤肉'); g.useItem();
    ok('healing never passes the max', Math.round(p.hp) === p.hpMax); p.hp = p.hpMax;
    // 錦囊用滿四個：製作欄標「已用完」、鈕灰掉、再造被拒
    const pch0 = p.pouches; p.pouches = 6; g.craftCat = '全部'; g.buildCraft();
    const prow = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('錦囊') >= 0);
    ok('with four pouches used the craft row says 已用完 and its button is disabled', !!prow && prow.textContent.indexOf('已用完') >= 0 && prow.classList.contains('cant') && prow.querySelector('button').disabled, prow && prow.textContent.slice(0, 40));
    g.addItem('麻布', 3); g.addItem('棉', 2); p.sta = 100; const pc0 = g.count('錦囊'); g.craft('pouch');
    ok('crafting a fifth pouch is refused', g.count('錦囊') === pc0 && g.count('麻布') >= 3 && g.msgText.indexOf('都用了') >= 0);
    g.addItem('錦囊', 1); hold('錦囊'); g.msgText = ''; g.msgUntil = 0; g.hudSig = ''; g.updateHUD();   // 清掉剛才的回饋訊息，提示列才會寫面前與手上的東西
    ok('the hint for a pouch in hand says they are all used', document.getElementById('msg').textContent.indexOf('已用完六個') >= 0, document.getElementById('msg').textContent.slice(0, 80));
    p.pouches = 1; g.buildCraft(); const prow2 = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('錦囊') >= 0);
    ok('with fewer used the row is craftable again', !!prow2 && prow2.textContent.indexOf('已用完') < 0 && !prow2.querySelector('button').disabled);
    p.pouches = pch0; g.removeItem('錦囊', 9); g.removeItem('麻布', 9); g.removeItem('棉', 9); g.barSig = ''; g.buildBag();
    // 重磨遞增：同一把 1、2、4、8、8；換一把從 1 起
    g.addItem('石劍', 1); const rsw = tool('石劍'); rsw.rg = 0; hold('石劍'); g.removeItem('石子', 99); g.addItem('石子', 30); p.sta = 100; p.food = 100;
    const costs = []; for (let i = 0; i < 5; i++) { const c0 = g.count('石子'); rsw.dur = 3; g.craft('regrind'); costs.push(c0 - g.count('石子')); }
    ok('regrinding the same tool costs 1, 2, 4, 8, 8 pebbles', costs.join(',') === '1,2,4,8,8' && rsw.rg === 5 && rsw.dur === 40, costs);
    g.buildCraft(); const rrow = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('重磨') >= 0);
    ok('the craft row shows the next cost for the tool in hand (6th: 8)', !!rrow && rrow.textContent.indexOf('第 6 次：石子 8') >= 0 && rrow.textContent.indexOf('石子 7/8') >= 0, rrow && rrow.textContent.slice(0, 80));
    g.removeItem('石子', 99); g.addItem('石子', 7); rsw.dur = 3; g.craft('regrind');
    ok('seven pebbles are not enough for an eight-pebble regrind', rsw.dur === 3 && g.count('石子') === 7 && g.msgText.indexOf('材料不夠') >= 0);
    g.addItem('石鎬', 1); const rpk = tool('石鎬'); rpk.rg = 0; hold('石鎬'); rpk.dur = 3; g.craft('regrind');
    ok('another tool starts at one pebble again', rpk.dur === 40 && g.count('石子') === 6 && rpk.rg === 1);
    g.save(); const svr = JSON.parse(localStorage.getItem('xieyi.save.v5')); const savedSword = (svr.player.tools || []).concat(svr.player.bag || []).find(x => x.n === '石劍');
    ok('the regrind count is saved with the tool', !!savedSword && savedSword.rg === 5);
    g.removeItem('石子', 99); p.tools = p.tools.filter(x => x !== rsw && x !== rpk); p.tool = -1; g.barSig = ''; g.buildBag(); }
  // ============ 舊布當柴、舊鐵熔回鐵 ============
  calm();
  { face(0, 1); w.set(T().x, T().y, '灶'); for (const [k] of w.stoves) w.stoves.set(k, 0); const sx = T().x, sy = T().y;
    g.addItem('布甲', 1); g.addItem('鐵甲', 1); g.addItem('鎢鋼盔', 1); g.addItem('鋼劍', 1); g.addItem('石刀', 1); const iron0 = g.count('鐵'), w0 = g.count('鎢鋼');
    g.pressPlace();
    const fuelBtn = document.querySelector('#stove-fuel button[data-fuel="布甲"]');
    ok('an old cloth vest is listed as fuel worth 50 breaths', !!fuelBtn && fuelBtn.textContent.indexOf('+50 息') >= 0, fuelBtn && fuelBtn.textContent);
    const meltBefore = document.querySelector('#stove-cook button[data-melt="鐵甲"]');
    ok('iron armour is listed under 熔 but greyed while the stove is cold; a stone knife is not listed', !!meltBefore && meltBefore.disabled && !document.querySelector('#stove-cook button[data-melt="石刀"]'));
    fuelBtn.click();
    ok('burning the vest lights the stove for 50 breaths and the vest is gone', w.stoveLit(sx, sy) && Math.abs(w.stoveFuel(sx, sy) - 50) < 1.5 && g.count('布甲') === 0, w.stoveFuel(sx, sy));
    document.querySelector('#stove-cook button[data-melt="鐵甲"]').click();
    ok('melting 鐵甲 gives two iron (half of five, rounded down)', g.count('鐵') === iron0 + 2 && g.count('鐵甲') === 0);
    document.querySelector('#stove-cook button[data-melt="鋼劍"]').click();
    ok('a steel sword from the tool bar melts into one iron', g.count('鐵') === iron0 + 3 && !tool('鋼劍'));
    document.querySelector('#stove-cook button[data-melt="鎢鋼盔"]').click();
    ok('a tungsten helm melts into one tungsten steel', g.count('鎢鋼') === w0 + 1 && g.count('鎢鋼盔') === 0);
    ok('nothing left to melt: the 熔 buttons are gone, the knife stays', !document.querySelector('#stove-cook button[data-melt]') && !!tool('石刀'));
    g.closeStove(); w.set(sx, sy, '草'); g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); p.tools = p.tools.filter(x => x.n !== '石刀'); p.tool = -1; g.barSig = ''; g.buildBag(); }
  // ============ 新的燃料表、上限 999、灶的四格柴架（v0.21） ============
  calm();
  { face(0, 1); const sx = T().x, sy = T().y, key = sx + ',' + sy; w.set(sx, sy, '灶'); w.stoves.set(key, 0); w.shelves.delete(key);
    ok('fuel values: coal 150, grass 30, fruit 45, wood 105, cotton 75, refined coal 900; hemp 70, bamboo 60, old cloth 50; stone burns not', g.fuelOf('煤') === 150 && g.fuelOf('草') === 30 && g.fuelOf('果') === 45 && g.fuelOf('木') === 105 && g.fuelOf('棉') === 75 && g.fuelOf('精煤') === 900 && g.fuelOf('麻') === 70 && g.fuelOf('竹') === 60 && g.fuelOf('布甲') === 50 && g.fuelOf('石') === 0);
    g.removeItem('木', 999); g.removeItem('草', 999); g.removeItem('精煤', 99); g.removeItem('煤', 99); g.addItem('木', 70); g.addItem('草', 5); g.addItem('精煤', 2);
    g.pressPlace();
    ok('the stove panel shows four empty shelf slots', !hidden('stove') && document.querySelectorAll('#stove-shelf .shelfslot.empty').length === 4);
    const shelf = () => w.shelf(sx, sy).map(x => x.n + x.c).join(',');
    document.querySelector('#stove-fuel button[data-store="木"]').click();
    ok('「存」 moves the whole stack of wood onto the shelf: 64 in one slot, 6 in the next', shelf() === '木64,木6' && g.count('木') === 0, shelf());
    document.querySelector('#stove-fuel button[data-store="草"]').click(); document.querySelector('#stove-fuel button[data-store="精煤"]').click();
    ok('four slots filled: wood, wood, grass, refined coal', shelf() === '木64,木6,草5,精煤2' && document.querySelectorAll('#stove-shelf button.shelfslot').length === 4, shelf());
    g.addItem('煤', 3); g.buildStove(); g.msgText = ''; document.querySelector('#stove-fuel button[data-store="煤"]').click();
    ok('a fifth kind does not fit on the shelf', g.count('煤') === 3 && g.msgText.indexOf('滿了') >= 0, g.msgText);
    document.querySelector('#stove-shelf button[data-shelf="0"]').click();
    ok('clicking a shelf slot burns one: +105, 63 wood left', Math.abs(w.stoveFuel(sx, sy) - 105) < 0.5 && shelf() === '木63,木6,草5,精煤2', [w.stoveFuel(sx, sy), shelf()]);
    g.msgText = ''; document.querySelector('#stove-shelf button[data-shelf="3"]').click();
    ok('refined coal (+900) on top of 105 would pass the 999 cap: refused, nothing wasted', Math.abs(w.stoveFuel(sx, sy) - 105) < 0.5 && shelf().indexOf('精煤2') >= 0 && g.msgText.indexOf('999') >= 0, [w.stoveFuel(sx, sy), g.msgText]);
    w.stoves.set(key, 90); g.buildStove(); document.querySelector('#stove-shelf button[data-shelf="3"]').click();
    ok('with room for it, it burns: 90 + 900 = 990', Math.abs(w.stoveFuel(sx, sy) - 990) < 0.5 && shelf().indexOf('精煤1') >= 0, [w.stoveFuel(sx, sy), shelf()]);
    ok('coal from the bag is refused too when it would pass the cap', g.stoveFuel('煤') === false && g.count('煤') === 3);
    w.addFuel(sx, sy, 500); ok('the fire never stores more than 999', w.stoveFuel(sx, sy) === 999, w.stoveFuel(sx, sy));
    g.closeStove(); g.save(); const svs = JSON.parse(localStorage.getItem('xieyi.save.v5'));
    ok('the save keeps the shelf', JSON.stringify(svs.world.shelves[key]) === JSON.stringify([['木', 63], ['木', 6], ['草', 5], ['精煤', 1]]), svs.world.shelves[key]);
    w.shelves.delete(key); g.load(svs); ok('and loading brings it back', shelf() === '木63,木6,草5,精煤1', shelf());
    hold('石鎬'); g.action = null; p.sta = 50; g.msgText = ''; g.pressGather();
    ok('dismantling asks first and says the shelf goes with the stove', !hidden('takeask') && document.getElementById('takeask-text').textContent.indexOf('柴架上 4 格') >= 0, document.getElementById('takeask-text').textContent);
    takeYes(); await until(() => !g.action, 4000);
    const carried = p.bag.find(x => x.n === '灶' && x.store);
    ok('the stove comes back carrying its shelf', w.get(sx, sy) !== '灶' && !!carried && carried.store.map(x => x.n + x.c).join(',') === '木63,木6,草5,精煤1' && !w.shelves.has(key), [w.get(sx, sy), carried && carried.store]);
    p.sel = p.bag.indexOf(carried); g.pressPlace();
    ok('placed again, the shelf is still there', w.get(sx, sy) === '灶' && shelf() === '木63,木6,草5,精煤1' && !p.bag.includes(carried), [w.get(sx, sy), shelf()]);
    w.set(sx, sy, '草'); ok('when the stove is gone the shelf goes with it', !w.shelves.has(key));
    g.removeItem('煤', 99); g.removeItem('木', 999); g.removeItem('灶', 9); }
  // 飽暖力都九成以上：愜意慢慢回（v0.21）
  { calm(); const m = g.mult(); p.food = 95; p.warm = 95; p.sta = p.staMax; p.san = 50; g.sanAcc = 0; g.updateStats(1);
    ok('with food, warmth and stamina all at 90% or more, 愜意 creeps up (0.1 × the courage multiplier a second)', g.content() && Math.abs(p.san - (50 + 0.1 * m)) < 0.01, [p.san, m]);
    p.food = 85; p.san = 50; g.sanAcc = 0; g.updateStats(1);
    ok('one of them below 90% and it drains as usual', !g.content() && p.san < 50, p.san);
    p.food = 100; p.warm = 100; p.san = 100; }
  // ============ 彈弓、台與階、囊滿時烤不吞（v0.22） ============
  { calm(); const X = p.x, Y = p.y, area = [];
    for (let dx = -2; dx <= 11; dx++) for (let dy = -3; dy <= 3; dy++) { const x = X + dx, y = Y + dy; area.push([x, y, w.raw(x, y)]); if (dx || dy) w.set(x, y, '土'); }
    g.ents.list = g.ents.list.filter(e => '鹿虎豹狼蛇蛛蟾鷹龜蜃魚'.indexOf(e.type) < 0); p.cour = 0;
    for (const k of ['襯', '褲', '甲', '盔', '靴', '帽']) if (p.worn[k]) g.takeOff(k);
    const tAt = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; };
    g.removeItem('木', 999); g.removeItem('麻', 99); g.addItem('木', 2); g.addItem('麻', 3); p.sta = 100; g.craft('sling');
    const sl = tool('彈弓');
    ok('a slingshot is two wood and three hemp; it goes to the tool bar with 80 durability', !!sl && sl.dur === 80 && g.count('麻') === 0 && g.count('木') === 0);
    p.tool = p.tools.indexOf(sl); face(1, 0);
    const tg = g.ents.add('虎', X + 8, Y, { moveT: 99, calm: 99 });
    ok('aiming east, the tiger eight tiles away is the target', g.slingTarget() === tg);
    face(-1, 0); ok('facing west there is nothing to shoot', g.slingTarget() === null); face(1, 0);
    tg.x = tg.rx = X + 10; ok('ten tiles is out of range', g.slingTarget() === null);
    tg.x = tg.rx = X + 9; ok('nine is in range', g.slingTarget() === tg);
    tg.x = tg.rx = X + 8;
    g.removeItem('石子', 999); g.msgText = ''; p.atkT = 0; g.action = null; g.pressGather();
    ok('no pebbles, no shot', tg.hp === 300 && g.msgText.indexOf('石子') >= 0, g.msgText);
    g.addItem('石子', 5); p.atkT = 0; p.sta = 50; g.msgText = ''; g.pressGather();
    ok('E shoots a pebble: 6 damage, one pebble and one durability spent, the tiger is provoked', tg.hp === 294 && g.count('石子') === 4 && sl.dur === 79 && tg.provoked > 19 && p.sta < 50 && g.msgText.indexOf('七格內') >= 0, [tg.hp, g.count('石子'), sl.dur, tg.provoked, g.msgText]);
    p.atkT = 0.5; g.pressGather(); ok('the next shot waits 0.8 s', tg.hp === 294 && g.count('石子') === 4);
    tg.moveT = 0; g.ents.update(0.01, g);
    ok('provoked but eight tiles away: it does not charge', tg.moveT >= 0.5, tg.moveT);
    tg.x = tg.rx = X + 6; tg.moveT = 0; const lk = w.raw(X + 6, Y + 1); w.set(X + 6, Y + 1, '燈'); g.ents.update(0.01, g);
    ok('within seven it charges straight at you, lamp or no lamp, by day', Math.abs(tg.moveT - 0.22) < 1e-6 && U.cheb(tg.x, tg.y, p.x, p.y) === 5, [tg.moveT, U.cheb(tg.x, tg.y, p.x, p.y)]);
    w.set(X + 6, Y + 1, lk);
    const quiet = g.ents.add('虎', X + 6, Y - 2, { moveT: 0, calm: 0 }); g.ents.update(0.01, g);
    ok('an unprovoked tiger six tiles off by day does not', quiet.moveT >= 0.5, quiet.moveT); g.ents.remove(quiet);
    tg.x = tg.rx = X + 8; tg.y = tg.ry = Y; w.set(X + 4, Y, '磚');
    ok('a brick wall in between blocks the shot', g.slingTarget() === null);
    // 台與階
    g.removeItem('磚', 999); g.removeItem('石', 999); g.addItem('磚', 8); g.addItem('石', 6); p.sta = 100; p.food = 5; g.msgText = ''; g.craft('platform');
    ok('a 台 costs food as well: too hungry, refused', g.count('台') === 0 && g.msgText.indexOf('太餓') >= 0, g.msgText);
    p.food = 50; g.craft('platform'); g.craft('steps');
    ok('台: six bricks, four stones, 12 stamina, 8 food; 階: two bricks, two stones, 6 stamina, 4 food', g.count('台') === 1 && g.count('階') === 1 && g.count('磚') === 0 && g.count('石') === 0 && Math.abs(p.food - 38) < 0.5 && p.sta === 82, [p.food, p.sta]);
    g.craftCat = '全部'; g.buildCraft(); const prow = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('台') === 0 || r.querySelector('b') && r.querySelector('b').textContent.indexOf('台') === 0);
    ok('the craft row shows the food cost', !!prow && prow.textContent.indexOf('飽 8') >= 0, prow && prow.textContent);
    face(1, 0); hold('階'); g.pressPlace(); w.set(X + 2, Y, '台');
    ok('the 階 is placed like any building', w.get(X + 1, Y) === '階' && g.count('階') === 0);
    ok('beasts cannot stand on 台 or 階', !g.ents.canStand('虎', X + 2, Y, true) && !g.ents.canStand('狼', X + 1, Y, true));
    tAt(X + 2, Y + 1); ok('from the ground you cannot step onto the 台', !g.pass(X + 2, Y));
    tAt(X + 1, Y); ok('from the 階 you can', g.pass(X + 2, Y));
    p.moveT = 0; g.tryStep(1, 0); ok('and you walk up onto it', p.x === X + 2 && w.get(p.x, p.y) === '台', [p.x - X, w.get(p.x, p.y)]);
    ok('from the 台 you can jump down anywhere', g.pass(X + 2, Y + 1));
    face(1, 0); tg.x = tg.rx = X + 9; ok('on the 台 a pebble flies over the wall', g.slingTarget() === tg);
    tg.x = tg.rx = X + 3; tg.hp = 300; tg.slowT = 0; p.hp = 100; p.hurtT = 0; p.hitWin = { start: -99, n: 0 }; g.hit(tg, 20);
    ok('a beast pouncing at you on the 台 hits its edge: −30 (a tenth of 300) and slowed for 5 s', tg.hp === 270 && tg.slowT === 5 && p.hp < 100, [tg.hp, tg.slowT, p.hp]);
    tg.moveT = 1; tg.atk = 1; g.ents.update(0.2, g);
    ok('slowed: its move and pounce timers run at half speed', Math.abs(tg.moveT - 0.9) < 1e-6 && Math.abs(tg.atk - 0.9) < 1e-6, [tg.moveT, tg.atk]);
    const sn = g.ents.add('蛇', X + 2, Y + 1, { moveT: 99 }); g.bite(sn, 3); p.poisonT = 0; p.poisonPer = 0;
    ok('a snake biting you there loses 9 (a tenth of 90)', sn.hp === 81, sn.hp); g.ents.remove(sn);
    tAt(X, Y); tg.hp = 300; g.hit(tg, 20); ok('on the ground there is no such recoil', tg.hp === 300, tg.hp);
    g.ents.remove(tg); p.hp = 100;
    // 囊滿時：烤不了就不烤，肉不會少（v0.21 前烤好的會不見）；具欄裡的鋼劍熔了也要囊有地方放鐵
    face(0, 1); const sx = X, sy = Y + 1; w.set(sx, sy, '灶'); w.addFuel(sx, sy, 300);
    g.removeItem('烤肉', 99); g.removeItem('鐵', 99); g.addItem('肉', 3); g.addItem('鋼劍', 1);
    for (const n of ['土', '草', '沙', '花', '竹', '木', '石子', '棉', '麻', '鐵礦', '煤', '玻璃瓶', '麻布', '偶', '門', '床', '燈', '櫃', '扇', '蠟燭', '火把', '藥', '鎢鋼', '精煤', '龜甲', '磚', '石', '果']) { if (p.bag.length >= g.slots()) break; if (!g.has(n)) g.addItem(n, 1); }
    ok('(the bag is full)', p.bag.length === g.slots() && !!tool('鋼劍'), [p.bag.length, g.slots()]);
    g.pressPlace(); const m0 = g.count('肉'); g.msgText = ''; g.stoveCook('肉');
    ok('with a full bag the meat is not cooked away: refused, the meat is still there', g.count('肉') === m0 && g.count('烤肉') === 0 && g.msgText.indexOf('放不下') >= 0, [g.count('肉'), g.count('烤肉'), g.msgText]);
    g.msgText = ''; g.stoveMelt('鋼劍'); ok('nor is a steel sword in the tool bar melted into iron with nowhere to go', !!tool('鋼劍') && g.count('鐵') === 0 && g.msgText.indexOf('放不下') >= 0, g.msgText);
    const one = p.bag.find(x => x.c === 1 && x.n !== '肉'); g.removeItem(one.n, 1); g.stoveCook('肉');
    ok('with one slot free it cooks', g.count('烤肉') === 1 && g.count('肉') === m0 - 1);
    g.closeStove(); for (const [x, y, c] of area) w.set(x, y, c);
    trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.tools = p.tools.filter(x => x.n !== '彈弓' && x.n !== '鋼劍'); p.tool = p.tools.length ? 0 : -1; g.barSig = ''; g.buildBag(); tAt(X, Y); }
  // 一山不容二虎：兩隻虎相距至少十二格（v0.22）
  { calm(); setDay(0.93); const X = p.x + 20, Y = p.y, area = [];
    for (let dx = -2; dx <= 18; dx++) for (let dy = -3; dy <= 3; dy++) { const x = X + dx, y = Y + dy; area.push([x, y, w.raw(x, y)]); w.set(x, y, '草'); }
    g.ents.list = g.ents.list.filter(e => e.type !== '虎');
    const A = g.ents.add('虎', X, Y, { moveT: 99 }), B = g.ents.add('虎', X + 13, Y, { moveT: 99 });
    ok('no tiger may be born within twelve tiles of another', !g.ents.tigerRoom(X + 11, Y + 2) && !g.ents.tigerRoom(X + 6, Y) && g.ents.tigerRoom(X - 12, Y));   // X+6 離 A 六格、離 B 七格
    ok('a tiger thirteen away will not step to twelve-minus-one', !g.ents.tigerTooClose(B, X + 12, Y) && g.ents.tigerTooClose({ type: '虎', x: X + 12, y: Y }, X + 11, Y));
    B.x = B.rx = X + 12; for (let i = 0; i < 6; i++) { g.ents.stepTo(B, A.x, A.y, false, true); }
    ok('chasing toward the other tiger it stops at twelve', U.cheb(A.x, A.y, B.x, B.y) >= 12, U.cheb(A.x, A.y, B.x, B.y));
    B.x = B.rx = X + 5; B.y = B.ry = Y; B.moveT = 0; B.calm = 99; g.ents.update(0.01, g);
    ok('two tigers already too close: the idle one walks away', U.cheb(A.x, A.y, B.x, B.y) === 6, U.cheb(A.x, A.y, B.x, B.y));
    g.ents.remove(A); g.ents.remove(B); for (const [x, y, c] of area) w.set(x, y, c); calm(); }
  // ============ 神兵與彈弓各有專鍵（v0.26）：L 拿出／換神兵、P 收回；Y 拿出／收起彈弓 ============
  { calm(); const keepT = p.tools, keepB = p.bag, keepI = p.tool, keepSel = p.sel, held = () => g.activeTool() && g.activeTool().n;
    p.tools = [{ n: '石刀', c: 1, dur: 30 }, { n: '九閽鳴雷', c: 1, dur: 199 }]; p.bag = [{ n: '燭龍焚溟', c: 1, dur: 199 }, { n: '木', c: 3 }]; p.sel = 0; p.tool = 0; g.prevTool = null; g.barSig = ''; g.buildBag();
    await press('KeyL'); ok('L takes out the god weapon in the tool bar', held() === '九閽鳴雷' && g.msgText.indexOf('拿出「九閽鳴雷」') >= 0, g.msgText);
    await press('KeyL'); ok('L again switches to the other one, moving it from the bag into the tool bar', held() === '燭龍焚溟' && !p.bag.some(s => s.n === '燭龍焚溟') && p.tools.length === 3);
    await press('KeyL'); ok('and back again', held() === '九閽鳴雷');
    await press('KeyP'); ok('P puts the god weapon away: the stone knife held before is back in hand', held() === '石刀' && g.msgText.indexOf('收起「九閽鳴雷」') >= 0, g.msgText);
    await press('KeyP'); ok('P with an ordinary tool in hand still cycles the tool bar', held() === '九閽鳴雷');
    p.tool = -1; await press('KeyL'); await press('KeyP'); ok('drawn from empty hands, P leaves them empty again', p.tool === -1 && g.msgText.indexOf('空手') >= 0, g.msgText);
    p.tool = 0; await press('KeyY'); ok('Y without a slingshot says how to make one and keeps the knife', held() === '石刀' && g.msgText.indexOf('沒有彈弓') >= 0, g.msgText);
    p.bag.push({ n: '彈弓', c: 1, dur: 80 }); g.barSig = ''; await press('KeyY'); ok('Y takes the slingshot from the bag into the hand', held() === '彈弓' && !p.bag.some(s => s.n === '彈弓'));
    await press('KeyL'); ok('L from the slingshot takes out a god weapon', held() === '九閽鳴雷');
    await press('KeyP'); ok('P puts it away back to the knife held before the slingshot', held() === '石刀');
    await press('KeyY'); const out = held(); await press('KeyY'); ok('Y twice: out, then put away back to the knife', out === '彈弓' && held() === '石刀' && g.msgText.indexOf('收起「彈弓」') >= 0, g.msgText);
    p.tools.length = 0; while (p.tools.length < g.toolSlots()) p.tools.push({ n: '石刀', c: 1, dur: 30 }); p.bag.push({ n: '彈弓', c: 1, dur: 80 }); p.tool = 0; g.barSig = '';
    await press('KeyY'); ok('with the tool bar full, Y says so and nothing changes', held() === '石刀' && p.bag.some(s => s.n === '彈弓') && g.msgText.indexOf('具欄滿了') >= 0, g.msgText);
    p.tools = keepT; p.bag = keepB; p.tool = keepI; p.sel = keepSel; g.prevTool = null; g.barSig = ''; g.buildBag(); }
  // ============ v0.28：毒蛛、龜、野豬、野牛、晝夜各半、磚擋光擋眼、窗、野牛撞磚、沼澤、製作欄的樹、各獸的聲音 ============
  { calm(); const E = g.ents, D = G.DB, X0 = p.x, Y0 = p.y, keepB = p.bag, keepT = p.tools, keepI = p.tool, mr = Math.random, tr = window.U.trueRand, area = [];
    for (const k of ['襯', '褲', '甲', '盔', '靴']) g.takeOff(k);
    const cx = 76, cy = 0, put = (x, y, c) => { area.push([x, y, w.get(x, y)]); w.set(x, y, c); };
    for (let dy = -9; dy <= 9; dy++) for (let dx = -13; dx <= 13; dx++) put(cx + dx, cy + dy, '草');
    E.list = []; p.x = cx; p.y = cy; p.rx = cx; p.ry = cy; p.bag = []; p.tools = []; p.tool = -1; p.sel = 0; g.barSig = ''; p.hp = 100;
    ok('a day is 300 s (v0.29)', DAY === 300);
    const night = (f) => { setDay(f); return g.isNight(); };
    ok('the day starts at midnight: night until 0.25, day 0.25–0.75, night again from 0.75', night(0.01) && night(0.24) && !night(0.25) && !night(0.74) && night(0.75) && night(0.99));
    setDay(0.25); const hDawn = g.shichen(); setDay(0.75); const hDusk = g.shichen(); setDay(0.01); const hMid = g.shichen();
    ok('dawn is 卯時 (6 o\'clock), dusk 酉時 (18), the start of the day 子時', hDawn === '卯時' && hDusk === '酉時' && hMid === '子時', [hDawn, hDusk, hMid]);
    setDay(0.53);
    // 蜘蛛：十隻一隻毒蛛，見人就撲、毒是蛇的一半；其餘無毒，惹了才咬、不中毒
    Math.random = () => 0.05; const vs = E.add('蛛', cx + 1, cy, { moveT: 99 }); Math.random = () => 0.5; const hs = E.add('蛛', cx - 1, cy, { moveT: 99 }); Math.random = mr;
    const hsCalm = !E.isHostile(hs); hs.angry = true;
    ok('one spider in ten is venomous: it hunts on sight; a harmless one only once angered', vs.venom === true && hs.venom === false && E.isHostile(vs) && hsCalm && E.isHostile(hs));
    p.poisonT = 0; p.poisonPer = 0; p.biteN = 0; vs.atk = 0; E.bite(vs, g);
    ok('a venomous spider poisons at half the snake rate: 0.75 a second, for the same 9 s', p.poisonPer === 0.75 && p.poisonT === 9 && D['蛇'].bite === 1.5 && D['蛇'].venomT === 9, [p.poisonPer, p.poisonT]);
    p.poisonT = 0; p.poisonPer = 0; p.hp = 100; hs.atk = 0; E.bite(hs, g);
    ok('a harmless spider only nips for 2, no poison', p.hp === 98 && p.poisonT === 0, [p.hp, p.poisonT]);
    E.remove(vs); E.remove(hs); p.hp = 100;
    // 龜：命二百五、一步一息半；挨打往最近的海逃，快四成，下水就不見
    put(cx + 5, cy + 2, '水'); const tt = E.add('龜', cx + 2, cy + 2, { moveT: 99 });
    ok('turtles have 250 hp', tt.hp === 250 && D['龜'].hp === 250);
    hold('石劍'); g.addItem('石劍', 1); hold('石劍'); p.atkT = 0; g.attack(tt); E.update(0.01, g);
    ok('hit, the turtle heads for the nearest sea at 1.4× its pace (a step every 1.07 s)', tt.hp < 250 && tt.flee && tt.flee.x === cx + 5 && tt.flee.y === cy + 2 && Math.abs(tt.moveT - 1.5 / 1.4) < 1e-6 && tt.x === cx + 3, [tt.flee, tt.moveT, tt.x]);
    for (let i = 0; i < 60 && E.list.includes(tt); i++) E.update(0.1, g);
    ok('reaching the water it dives and is gone', !E.list.includes(tt));
    // 野豬：命二百、一撞七點五、五格內見人就衝，速度同豹
    const boar = E.add('豬', cx + 3, cy, { moveT: 0 }); E.update(0.01, g);
    ok('野豬: 200 hp, hits for 7.5, charges within five tiles at leopard speed', D['豬'].hp === 200 && D['豬'].atk === 7.5 && D['豬'].name === '野豬' && boar.x === cx + 2 && Math.abs(boar.moveT - 0.22) < 1e-6 && E.isHostile(boar), [boar.x, boar.moveT]);
    p.hp = 100; g.hit(boar, D['豬'].atk);
    ok('a boar hit takes exactly 7.5 (not rounded to 8)', Math.abs((100 - p.hp) - 7.5 * g.takenMult()) < 0.06, p.hp);
    E.remove(boar); p.hp = 100;
    // 野牛：命四百五、一頂五、不惹不動；惹了追著撞，擋路的人造磚三下就碎
    const bison = E.add('牛', cx + 3, cy, { moveT: 0 }); for (let i = 0; i < 5; i++) E.update(0.5, g);
    ok('野牛: 450 hp, hits for 5, leaves you alone unprovoked', D['牛'].hp === 450 && D['牛'].atk === 5 && !E.isHostile(bison) && Math.max(Math.abs(bison.x - cx), Math.abs(bison.y - cy)) >= 2);
    for (const dy of [-1, 0, 1]) put(cx + 1, cy + dy, '磚');
    bison.x = cx + 2; bison.y = cy; bison.angry = true; bison.angryAt = w.time; bison.atk = 0; bison.moveT = 0;
    let ruined = false, rams = 0; for (let i = 0; i < 160 && w.get(cx + 1, cy) !== '白'; i++) { const a0 = bison.atk; E.update(0.1, g); if (bison.atk > a0 + 0.5) rams++; if (w.get(cx + 1, cy) === '墟') ruined = true; }
    ok('v0.29: an angered bison rams the brick: at half its hidden strength it turns to 墟, and it breaks on the fourth ram', ruined && rams === 4 && w.get(cx + 1, cy) === '白' && E.isHostile(bison), [w.get(cx + 1, cy), rams]);
    put(cx + 1, cy, '窗'); bison.x = cx + 2; bison.y = cy; bison.atk = 0; let red = false; rams = 0;
    for (let i = 0; i < 120 && w.get(cx + 1, cy) === '窗'; i++) { const a0 = bison.atk; E.update(0.1, g); if (bison.atk > a0 + 0.5) rams++; if (w.wallHurt(cx + 1, cy)) red = true; }
    ok('v0.29: a window has half a brick\'s strength: it turns red after one ram and breaks on the second', red && rams === 2 && w.get(cx + 1, cy) === '白', [w.get(cx + 1, cy), rams]);
    E.remove(bison);
    // 磚擋光擋眼；窗不擋
    put(cx - 6, cy, '燈'); for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) put(cx - 6 + dx, cy + dy, '磚');
    ok('bricks block light: a lamp ringed with bricks is not seen two tiles outside', w.lightNear(cx - 6, cy - 2, 3) === false && w.lightNear(cx - 6, cy, 3) === true);
    put(cx - 6, cy - 1, '窗');
    ok('a window lets the light through', w.lightNear(cx - 6, cy - 2, 3) === true && !w.clear(cx - 6, cy + 2, cx - 6, cy) && w.clear(cx - 6, cy - 2, cx - 6, cy));
    const tg = E.add('虎', cx + 4, cy, { moveT: 99 }); put(cx + 2, cy, '磚'); const hid = E.sense(tg, p, 10); put(cx + 2, cy, '窗'); const seen = E.sense(tg, p, 10);
    ok('a beast that sees you senses you at full range; behind bricks only by smell, at 70%', Math.abs(hid - 7) < 1e-9 && seen === 10, [hid, seen]);
    E.remove(tg); put(cx + 2, cy, '草');
    // 窗多的屋子睡得舒坦：一格的小屋，北南西三面磚、東邊是床
    const rx = cx - 3, ry = cy + 6; put(rx, ry, '草'); put(rx + 1, ry, '床'); put(rx, ry - 1, '磚'); put(rx, ry + 1, '磚'); put(rx - 1, ry, '磚');
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(rx + dx, ry + dy, '磚');
    p.x = rx; p.y = ry; p.rx = rx; p.ry = ry; E.list = [];
    setDay(0.93); p.san = 10; g.sleep(); const plain = p.san - 10;
    put(rx - 1, ry, '窗'); setDay(0.93); p.san = 10; g.sleep(); const lit = p.san - 10, share = g.windowShare();
    ok('v0.29: sleeping where windows ÷ room area is over 1/5: 愜意 +24 (20 × 1.2) instead of +20', plain === 20 && share === 1 && lit === 24, [plain, share, lit]);
    ok('v0.29: window tiers — over 1/9 +5%, over 1/7 +12%, over 1/5 +20%; exactly 1/9 gives nothing', g.windowBonus(1 / 9) === 0 && g.windowBonus(0.12) === 0.05 && g.windowBonus(1 / 6) === 0.12 && g.windowBonus(0.21) === 0.2 && g.windowBonus(0) === 0);
    ok('v0.29: a bright room also speeds every 愜意 gain by 5% for a whole day', p.sanBoostUntil > w.time + DAY - 2 && g.sanUp(10) === 10.5, [p.sanBoostUntil - w.time, g.sanUp(10)]);
    w.time = p.sanBoostUntil + 1; ok('…and the day-long boost wears off', g.sanUp(10) === 10); p.sanBoostUntil = 0;
    p.x = cx; p.y = cy; p.rx = cx; p.ry = cy; setDay(0.53);
    // 沼澤：獸除了蟾都不進；站在裡面掉力；木板鋪成棧道
    put(cx + 3, cy - 4, '沼');
    ok('swamp: beasts keep out of it except toads', !E.canStand('虎', cx + 3, cy - 4, true) && !E.canStand('豬', cx + 3, cy - 4, true) && !E.canStand('牛', cx + 3, cy - 4, true) && E.canStand('蟾', cx + 3, cy - 4, true));
    put(cx, cy, '沼'); p.sta = 50; await sleep(700);
    ok('standing in a swamp drains 力 instead of resting it', p.sta < 50, p.sta);
    put(cx, cy, '草'); put(cx + 1, cy, '沼'); p.fx = 1; p.fy = 0; g.addItem('木板', 1); hold('木板'); g.pressPlace();
    ok('a plank laid on the swamp makes a boardwalk you walk on as on flat ground', w.get(cx + 1, cy) === '棧' && D['棧'].walk === 1 && g.count('木板') === 0 && D['棧'].to === '沼');
    g.addItem('磚', 1); hold('磚'); put(cx + 1, cy, '沼'); g.pressPlace();
    ok('nothing else can be set down on a swamp', w.get(cx + 1, cy) === '沼' && g.count('磚') === 1);
    // 油脂：斃野豬野牛四分之一得；棉一油脂一做三根蠟燭
    p.bag = []; g.barSig = '';
    const b2 = E.add('豬', cx + 4, cy + 4, { moveT: 99 }); window.U.trueRand = () => 0.1; g.kill(b2);
    const b3 = E.add('牛', cx + 4, cy + 4, { moveT: 99 }); window.U.trueRand = () => 0.9; g.kill(b3); window.U.trueRand = tr;
    ok('a slain boar gives 3 meat and (a quarter of the time) fat; a bison gives 4 meat', g.count('肉') === 7 && g.count('油脂') === 1, bag());
    g.addItem('棉', 1); p.sta = p.staMax; g.craft('candle2');
    ok('棉一油脂一 makes three candles', g.count('蠟燭') === 3 && g.count('油脂') === 0, bag());
    // 製作欄：衍生的畫在底下
    g.craftCat = '燈火'; const vr = g.visibleRecipes().map(r => r.id), tl = g.craftTree();
    ok('craft panel 燈火: 燈 hangs under 火把, 燈帽 under 蠟燭', vr.indexOf('lamp') === vr.indexOf('torch') + 1 && tl.find(n => n.r.id === 'lamp').depth === 1 && tl.find(n => n.r.id === 'hat').depth === 1 && vr.indexOf('hat') === vr.indexOf('candle') + 1, vr);
    g.craftCat = '全部'; const ta = g.craftTree(), dep = (id) => ta.find(n => n.r.id === id).depth;
    ok('craft panel 全部: 漁網 → 中漁網 → 大漁網 runs a level deeper each step, every recipe listed once', dep('midnet') === dep('net') + 1 && dep('bignet') === dep('net') + 2 && ta.length === G.RECIPES.length, [dep('net'), dep('midnet'), dep('bignet')]);
    g.craftCat = '燈火'; g.toggleCraft(); await sleep(30);
    ok('the craft panel draws the branches', document.querySelectorAll('#craft-list .recipe.child .tree .elbow').length >= 2 && document.querySelectorAll('#craft-list .recipe.parent .tree .down').length >= 2);
    g.toggleCraft(); g.craftCat = '全部';
    ok('each of 虎豹狼蛇蛛 (and 野豬、野牛) has its own call', typeof SFX.beast === 'function' && ['虎', '豹', '狼', '蛇', '蛛', '豬', '牛'].every(t => SFX.beastTypes.indexOf(t) >= 0));
    ok('the help says 磚, not 牆, for walls', document.getElementById('help').textContent.indexOf('穿牆') < 0 && document.getElementById('help').textContent.indexOf('砌牆') < 0);
    for (let i = area.length - 1; i >= 0; i--) w.set(area[i][0], area[i][1], area[i][2]);
    E.list = []; p.x = X0; p.y = Y0; p.rx = X0; p.ry = Y0; p.bag = keepB; p.tools = keepT; p.tool = keepI; p.sel = 0; g.barSig = ''; g.buildBag(); Math.random = mr; calm(); }
  // ============ 簡體中文（v0.24）：只在顯示那一層轉字，程式、存檔、字庫的鍵一律繁體 ============
  { calm();
    ok('the converter: 字裡行間 → 字里行间; 乾坤 and 著名 kept as words; 穿著 → 穿着; 九閽鳴雷 → 九阍鸣雷', I18N.toHans('字裡行間 · 一紙之島') === '字里行间 · 一纸之岛' && I18N.toHans('乾坤') === '乾坤' && I18N.toHans('著名') === '著名' && I18N.toHans('穿著') === '穿着' && I18N.toHans('九閽鳴雷') === '九阍鸣雷');
    ok('traditional by default; the pause panel offers 简体中文', !I18N.hans && document.documentElement.lang === 'zh-TW' && document.getElementById('pause-lang').textContent === '简体中文');
    const lore = document.querySelector('#start .lore'), lore0 = lore.textContent, help = document.getElementById('help'), help0 = help.textContent;
    I18N.set('hans'); await sleep(30);
    ok('choosing 简体 converts the page (start page, help) and remembers the choice', I18N.hans && document.documentElement.lang === 'zh-CN' && document.documentElement.classList.contains('hans') && lore.textContent.indexOf('鸟栖于山') >= 0 && help.textContent.indexOf('胆气') >= 0 && help.textContent.indexOf('膽氣') < 0 && localStorage.getItem('xieyi.lang') === 'hans', lore.textContent.slice(0, 20));
    ok('the language options themselves stay as they are written', document.querySelector('[data-lang="hant"]').textContent === '繁體' && document.getElementById('pause-lang').textContent === '繁體中文' && document.querySelector('[data-lang="hans"]').classList.contains('on'));
    g.toast('測試標題', '櫃裡的鐵與鳥'); g.message('灶火還能燒 99 息。'); g.lastMsg = ''; g.updateHUD(); await sleep(30);
    ok('toasts and messages the game writes afterwards come out simplified', toasts().indexOf('柜里的铁与鸟') >= 0 && document.getElementById('msg').textContent.indexOf('灶火还能烧 99 息') >= 0, [toasts().slice(-20), document.getElementById('msg').textContent]);
    g.addItem('鐵', 1); g.barSig = ''; g.buildBag(); await sleep(30);
    const ironSlot = [...document.querySelectorAll('#bagbar .slot')].find(el => el.textContent.indexOf('铁') >= 0);
    ok('the bag shows 铁 with a simplified tooltip, while the game still counts 鐵', !!ironSlot && ironSlot.title.indexOf('铁') >= 0 && document.getElementById('bagbar').textContent.indexOf('鐵') < 0 && g.count('鐵') >= 1, ironSlot && ironSlot.title.slice(0, 20));
    g.renderer.atlas.delete('鸟|#123456'); g.renderer.glyph('鳥', '#123456');
    ok('glyphs drawn on the canvas are simplified too', g.renderer.atlas.has('鸟|#123456') && !g.renderer.atlas.has('鳥|#123456'));
    g.save(); const svh = JSON.parse(localStorage.getItem('xieyi.save.v5'));
    ok('the save stays in traditional keys', JSON.stringify(svh.player.bag).indexOf('鐵') >= 0 && JSON.stringify(svh.player.bag).indexOf('铁') < 0);
    I18N.set('hant'); await sleep(30);
    ok('back to 繁體: the original text is put back, including the toast written while simplified', !I18N.hans && document.documentElement.lang === 'zh-TW' && lore.textContent === lore0 && help.textContent === help0 && toasts().indexOf('櫃裡的鐵與鳥') >= 0 && localStorage.getItem('xieyi.lang') === 'hant', toasts().slice(-20));
    document.getElementById('pause-lang').click(); await sleep(20); const viaPause = I18N.hans; document.getElementById('pause-lang').click(); await sleep(20);
    ok('the pause-panel button switches back and forth', viaPause && !I18N.hans && document.getElementById('pause-lang').textContent === '简体中文');
    g.removeItem('鐵', 1); }
  // ============ v0.29：一日三百息從半夜起算、精確到四位、墟與補牆、草花田路上放東西、舊存檔 ============
  { ok('v0.29: a fresh island wakes in the early morning, just after dawn', new window.World(w.seed + 7).time === DAY * 0.26);
    const old = JSON.parse(JSON.stringify(w.serialize())); delete old.dayLen; old.time = 375 * 9 + 375 * 0.8; old.diff['3,3'] = '牆';
    old.scarecrows = { '0,0': old.time + 100 }; old.timers = { '1,1': ['苗', old.time + 50, '田'] };
    const w3 = new window.World(w.seed); w3.restore(old, 10);
    ok('v0.29: an old save keeps its day number and comes back at that day\'s early morning', w3.time === DAY * 9 + DAY * 0.26, w3.time / DAY);
    ok('…timers saved in it keep the same countdown, and its old 牆 reads 墟', Math.abs(w3.scarecrows.get('0,0') - (w3.time + 100)) < 1e-6 && Math.abs(w3.timers.get('1,1').at - (w3.time + 50)) < 1e-6 && w3.diff.get('3,3') === '墟');
    const w4 = new window.World(w.seed); w4.restore(w.serialize(), g.day());
    ok('v0.29: a save made now keeps its exact time', w4.time === U.r4(w.time) && w4.timeShift === 0, [w4.time, w.time]);
    ok('v0.29: 墟 replaces the village\'s broken walls (牆 is gone from the glyph table)', !!G.DB['墟'] && !G.DB['牆'] && G.DB['墟'].opaque && G.PLACES.find(q => q.id === 'cun').template.join('').indexOf('墟') >= 0 && G.PLACES.find(q => q.id === 'cun').template.join('').indexOf('牆') < 0);
    ok('v0.29: U.r4 keeps four decimals', U.r4(20 * 5 / 3 * 0.83) === 27.6667 && U.r4(1 / 3) === 0.3333 && U.r4(2.00004) === 2);
    face(1, 0); w.set(T().x, T().y, '磚'); const r1 = w.hitWall(T().x, T().y), r2 = w.hitWall(T().x, T().y);
    ok('v0.29: two hits on a brick: still 磚 after the first, 墟 after the second', r1 === 'hit' && r2 === 'ruined' && w.get(T().x, T().y) === '墟', [r1, r2]);
    g.addItem('磚', 1); hold('磚'); const b0 = g.count('磚'); g.pressPlace();
    ok('v0.29: a 磚 laid straight onto 墟 makes a whole brick again', w.get(T().x, T().y) === '磚' && !w.wallHp.has(U.key(T().x, T().y)) && g.count('磚') === b0 - 1);
    w.set(T().x, T().y, '墟'); const v1 = w.hitWall(T().x, T().y), v2 = w.hitWall(T().x, T().y);
    ok('v0.29: the village\'s own 墟 is weaker than a brick: two hits and it is gone', v1 === 'hit' && v2 === 'broken', [v1, v2]);
    w.set(T().x, T().y, '窗'); const c1 = w.hitWall(T().x, T().y);
    ok('v0.29: a window hit once is at half strength and turns red', c1 === 'cracked' && w.wallHurt(T().x, T().y));
    g.addItem('窗', 2); hold('窗'); const n0 = g.count('窗'); g.pressPlace();
    ok('v0.29: a 窗 put onto the red window replaces it', w.get(T().x, T().y) === '窗' && !w.wallHurt(T().x, T().y) && g.count('窗') === n0 - 1);
    g.pressPlace(); ok('…but a whole window is left alone', g.count('窗') === n0 - 1);
    g.removeItem('窗', 9); w.set(T().x, T().y, '草'); }
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v5'));
  ok('save v5 keeps sanity, courage, scarecrows and chests', sv && sv.v === 5 && typeof sv.player.san === 'number' && typeof sv.player.cour === 'number' && sv.world.scarecrows && sv.world.chests && sv.player.places.ta === 2);
  // —— 三格存檔：第一格沿用舊鍵；每格帶摘要
  ok('three save slots: slot 1 keeps the old key, slots 2 and 3 get suffixes, autostart plays slot 1', XIEYI.Game.slotKey(1) === 'xieyi.save.v5' && XIEYI.Game.slotKey(2) === 'xieyi.save.v5.2' && XIEYI.Game.slotKey(3) === 'xieyi.save.v5.3' && g.slot === 1);
  ok('the save carries a brief: day, night, level, deaths, slept nights', !!sv.brief && sv.brief.day === g.day() && sv.brief.night === g.nightNo() && sv.brief.level === g.level() && typeof sv.brief.deaths === 'number' && typeof sv.brief.nights === 'number', sv.brief);
  { const m = XIEYI.Game.summary(sv);
    ok('summary of a save names island, difficulty, day, night, level and time', m.seed === g.seed && m.diff === g.diff.name && m.day === g.day() && m.level === g.level() && /^第 \d+ 日 · /.test(m.dayText) && /\d\d\/\d\d \d\d:\d\d/.test(m.whenText), m);
    const old = JSON.parse(JSON.stringify(sv)); delete old.brief; const mo = XIEYI.Game.summary(old);
    ok('an old save without a brief still gets day, night and level from time and courage', mo.day === m.day && mo.night === m.night && mo.level === m.level && mo.deaths === p.deaths);
    const t0 = w.time; w.time = 0; ok('day 1 before dusk reads 未入夜, dusk reads 第 1 夜, next morning reads 過了 1 夜', (() => { const at = (tt) => { w.time = tt; return XIEYI.Game.summary({ world: { time: tt }, player: {}, savedAt: 1 }).dayText; }; return at(0) === '第 1 日 · 未入夜' && at(DAY * 0.83) === '第 1 日 · 第 1 夜' && at(DAY * 1.4) === '第 2 日 · 過了 1 夜' && at(DAY * 1.1) === '第 2 日 · 第 1 夜'; })()); w.time = t0;
    g.slot = 2; g.save(); const s2 = XIEYI.Game.readSave(2); g.slot = 1;
    ok('saving while in slot 2 writes slot 2 only and leaves slot 1 as it was', !!s2 && s2.seed === g.seed && XIEYI.Game.readSave(1).savedAt === sv.savedAt && XIEYI.Game.readSave(3) === null);
    XIEYI.Game.clearSave(2); ok('clearing slot 2 empties only slot 2', XIEYI.Game.readSave(2) === null && !!XIEYI.Game.readSave(1));
    g.toggleJournal(); const jslot = document.getElementById('journal-body').textContent.indexOf('存檔第一格') >= 0; g.toggleJournal();
    ok('the journal says which slot this game is saved in', jslot); }

  } catch (e) { checks.push('CRASH ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')); }

  let frames = 0; const t0 = performance.now(); await new Promise((res) => { const tick = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  r.fps = Math.round(frames / ((performance.now() - t0) / 1000));
  r.checks = checks; r.failed = checks.filter(c => c.startsWith('FAIL')).length;
  return r;
});
// ============ 起始頁：三格存檔（要重開頁面，所以在 evaluate 外面跑） ============
const checks2 = [];
const ok2 = (name, cond, info) => checks2.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
const started = () => page.waitForFunction(() => window.XIEYI && !window.XIEYI.game.paused, null, { timeout: 15000 });
try {
  const base = url.replace(/\?.*$/, '');
  await page.evaluate(() => { const g = XIEYI.game; g.slot = 1; g.save(); const s = JSON.parse(localStorage.getItem('xieyi.save.v5')), s3 = JSON.parse(JSON.stringify(s)); s3.seed = 99; s3.savedAt = s.savedAt - 60000; s3.diff = 'hard'; s3.brief.level = 5; localStorage.setItem('xieyi.save.v5.3', JSON.stringify(s3)); localStorage.removeItem('xieyi.save.v5.2'); localStorage.removeItem('xieyi.slot'); });
  await page.goto(base, { waitUntil: 'load' });
  const cards = await page.$$eval('.save-card', (cs) => cs.map(c => ({ slot: c.dataset.slot, on: c.classList.contains('on'), empty: c.classList.contains('empty'), text: c.textContent })));
  ok2('start page shows three save cards', cards.length === 3 && cards.map(c => c.slot).join('') === '123');
  ok2('the newest save (slot 1) is selected by default', cards[0].on && !cards[1].on && !cards[2].on);
  ok2('an occupied card tells island, difficulty, day, night, courage and time (no slept-nights count any more)', /島 #7/.test(cards[0].text) && /一般/.test(cards[0].text) && /第 \d+ 日/.test(cards[0].text) && /夜/.test(cards[0].text) && /膽氣第 \d+ 重/.test(cards[0].text) && !/睡過/.test(cards[0].text) && /存於 \d\d\/\d\d/.test(cards[0].text), cards[0].text);
  ok2('slot 3 shows its own island, difficulty and courage', /島 #99/.test(cards[2].text) && /困難/.test(cards[2].text) && /膽氣第 5 重/.test(cards[2].text), cards[2].text);
  ok2('slot 2 is empty and says so', cards[1].empty && /空格/.test(cards[1].text) && !/繼續/.test(cards[1].text));
  await page.click('.save-card[data-slot="3"] .save-no');
  ok2('clicking a card selects it and the hint warns that 落筆 would overwrite', await page.$eval('.save-card.on', c => c.dataset.slot) === '3' && /覆蓋/.test(await page.$eval('#new-hint', e => e.textContent)));
  await page.keyboard.press('Enter'); await started();
  const r1 = await page.evaluate(() => ({ slot: XIEYI.game.slot, seed: XIEYI.game.seed, diff: XIEYI.game.diff.key, last: localStorage.getItem('xieyi.slot') }));
  ok2('Enter continues the selected slot: slot 3, island 99, hard', r1.slot === 3 && r1.seed === 99 && r1.diff === 'hard' && r1.last === '3', r1);
  await page.goto(base, { waitUntil: 'load' });
  ok2('the last played slot is selected after reload', await page.$eval('.save-card.on', c => c.dataset.slot) === '3');
  await page.click('.save-card[data-slot="2"] .save-no'); await page.fill('#seed', '123'); await page.click('#btn-new'); await started();
  const r2 = await page.evaluate(() => { XIEYI.game.save(); return { slot: XIEYI.game.slot, seed: XIEYI.game.seed, s2: JSON.parse(localStorage.getItem('xieyi.save.v5.2')).seed, s1: JSON.parse(localStorage.getItem('xieyi.save.v5')).seed, s3: JSON.parse(localStorage.getItem('xieyi.save.v5.3')).seed }; });
  ok2('落筆 on an empty slot starts island 123 in slot 2 and leaves slots 1 and 3 alone', r2.slot === 2 && r2.seed === 123 && r2.s2 === 123 && r2.s1 === 7 && r2.s3 === 99, r2);
  await page.goto(base, { waitUntil: 'load' });
  await page.click('.save-card[data-slot="1"] .save-no'); await page.click('#btn-new'); await page.waitForTimeout(150);
  const armed = await page.evaluate(() => ({ started: !!window.XIEYI, text: document.getElementById('btn-new').textContent }));
  ok2('落筆 on an occupied slot asks first instead of overwriting', !armed.started && /覆蓋第一格/.test(armed.text), armed);
  await page.click('.save-card[data-slot="3"] .save-del'); await page.waitForTimeout(100);
  ok2('arming 刪 drops the overwrite question and asks 真的刪？', await page.$eval('#btn-new', b => b.textContent) === '落筆' && /真的刪/.test(await page.$eval('.save-card[data-slot="3"] .save-del', b => b.textContent)));
  await page.click('.save-card[data-slot="3"] .save-del'); await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ gone: !localStorage.getItem('xieyi.save.v5.3'), empty: document.querySelector('.save-card[data-slot="3"]').classList.contains('empty'), n: document.querySelectorAll('.save-card').length, still1: !!localStorage.getItem('xieyi.save.v5'), still2: !!localStorage.getItem('xieyi.save.v5.2') }));
  ok2('second 刪 clears slot 3 only and the card turns empty', after.gone && after.empty && after.n === 3 && after.still1 && after.still2, after);
  await page.click('.save-card[data-slot="1"] .save-no'); await page.fill('#seed', '55'); await page.click('#btn-new'); await page.waitForTimeout(100); await page.click('#btn-new'); await started();
  const r3 = await page.evaluate(() => { XIEYI.game.save(); return { slot: XIEYI.game.slot, seed: XIEYI.game.seed, s1: JSON.parse(localStorage.getItem('xieyi.save.v5')).seed, cour: XIEYI.game.player.cour }; });
  ok2('second 落筆 overwrites slot 1 with island 55', r3.slot === 1 && r3.seed === 55 && r3.s1 === 55, r3);
  await page.evaluate(() => { localStorage.setItem('xieyi.carry', '500@2'); });
  await page.goto(base + '?autostart=1&seed=8&slot=1', { waitUntil: 'load' }); await started();
  const c1 = await page.evaluate(() => ({ slot: XIEYI.game.slot, cour: XIEYI.game.player.cour, carry: localStorage.getItem('xieyi.carry') }));
  await page.goto(base + '?autostart=1&seed=9&slot=2', { waitUntil: 'load' }); await started();
  const c2 = await page.evaluate(() => ({ slot: XIEYI.game.slot, cour: XIEYI.game.player.cour, carry: localStorage.getItem('xieyi.carry') }));
  ok2('courage carried over the sea waits for its own slot: slot 1 gets none, slot 2 gets 500 and the note is spent', c1.slot === 1 && c1.cour === 0 && c1.carry === '500@2' && c2.slot === 2 && c2.cour === 500 && c2.carry === null, { c1, c2 });
  // 起始頁上的「生存之道」在起始頁上面（v0.25.1 前被起始頁蓋住）；起始頁沒有手柄設定
  await page.goto(base, { waitUntil: 'load' });
  const ptop = () => page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && e.closest('.overlay') && e.closest('.overlay').id; });
  ok2('the start page has no 手柄設定 button', await page.evaluate(() => !document.getElementById('btn-pad') && document.getElementById('start').textContent.indexOf('手柄') < 0));
  await page.click('#btn-help'); await page.waitForTimeout(80);
  ok2('生存之道 on the start page shows on top of it', await ptop() === 'help', await ptop());
  await page.click('#help-close'); await page.waitForTimeout(50);
  // 起始頁的文字選項：點简体整頁轉簡體，重開仍是簡體；點繁體轉回來
  await page.goto(base, { waitUntil: 'load' }); await page.click('[data-lang="hans"]'); await page.waitForTimeout(80);
  const hz = await page.evaluate(() => ({ sub: document.querySelector('#start .sub').textContent, diff: document.querySelector('.diffrow').textContent, stored: localStorage.getItem('xieyi.lang') }));
  ok2('the start page has 繁體／简体; 简体 turns the page simplified', hz.sub === '字里行间 · 一纸之岛' && hz.diff.indexOf('难度') >= 0 && hz.stored === 'hans', hz);
  await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(80);
  const hz2 = await page.evaluate(() => ({ sub: document.querySelector('#start .sub').textContent, lang: document.documentElement.lang, cards: document.getElementById('saves').textContent }));
  ok2('reloading keeps 简体, the save cards included', hz2.sub === '字里行间 · 一纸之岛' && hz2.lang === 'zh-CN' && /岛 #|空/.test(hz2.cards) && !/島 #/.test(hz2.cards), hz2);
  await page.click('[data-lang="hant"]'); await page.waitForTimeout(80);
  ok2('繁體 turns it back', await page.$eval('#start .sub', e => e.textContent) === '字裡行間 · 一紙之島' && await page.evaluate(() => localStorage.getItem('xieyi.lang')) === 'hant');
} catch (e) { checks2.push('CRASH start page: ' + e.message); }
result.checks.push(...checks2); result.failed = result.checks.filter(c => c.startsWith('FAIL') || c.startsWith('CRASH')).length;
console.log(result.checks.join('\n'));
console.log('fps', result.fps, 'failed', result.failed, 'of', result.checks.length);
await page.screenshot({ path: out + '/02-end.png' });
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
process.exit(errors.length || result.failed ? 1 : 0);
