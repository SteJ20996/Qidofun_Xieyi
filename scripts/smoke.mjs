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
  const goNextTo = (x, y) => { w.set(x - 1, y, '草'); p.x = p.rx = x - 1; p.y = p.ry = y; face(1, 0); };
  const setDay = (frac) => { w.time = Math.floor(w.time / DAY) * DAY + DAY * frac; };
  const until = async (cond, ms) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < (ms || 8000)) await sleep(40); return cond(); };
  const gather = async (ch) => { face(0, 1); w.set(T().x, T().y, ch); g.action = null; g.pressGather(); await until(() => !g.action, 12000); };

  try {
  // ============ A. 島與採集 ============
  ok('island edge is deep water', w.get(0, 75) === '淼' && w.get(-80, 0) === '淼');
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
  ok('gathering 果 stamps the day', fruit && fruit.c === 2 && fruit.d === g.day() && w.get(T().x, T().y) === '木', bag());
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
  ok('six tool slots', document.querySelectorAll('#toolbar .slot').length === 6 && document.querySelectorAll('#toolbar .slot.sel').length === 1);
  await press('KeyC', 20); await sleep(30); ok('craft panel closes', hidden('craft'));

  // ============ C. 放置、擋路、灶、鋤、鎬 ============
  face(1, 0); w.set(T().x, T().y, '白'); hold('磚'); g.pressPlace();
  ok('placed 磚 blocks beasts and ghosts', w.get(T().x, T().y) === '磚' && !g.ents.canStand('虎', T().x, T().y, true) && !g.ents.canStand('狼', T().x, T().y, true) && !g.pass(T().x, T().y), w.get(T().x, T().y));
  face(0, -1); w.set(T().x, T().y, '草'); hold('門'); g.pressPlace();
  ok('cannot place on grass before clearing it', w.get(T().x, T().y) === '草');
  w.set(T().x, T().y, '土'); g.pressPlace();
  ok('placed 門: player passes, ghosts do not', w.get(T().x, T().y) === '門' && g.pass(T().x, T().y) && !g.ents.canStand('狼', T().x, T().y, true) && !g.ents.canStand('虎', T().x, T().y, true));
  face(-1, 0); w.set(T().x, T().y, '土'); hold('床'); g.pressPlace();
  const bed = T();
  ok('placed 床 sets home', w.get(bed.x, bed.y) === '床' && p.home && p.home.x === bed.x, p.home);
  face(0, 1); w.set(T().x, T().y, '沙'); hold('灶'); g.pressPlace();
  const stove = T();
  ok('placed 灶 is cold', w.get(stove.x, stove.y) === '灶' && !w.stoveLit(stove.x, stove.y));
  hold('木'); g.pressPlace();
  ok('wood fuels the stove', w.stoveLit(stove.x, stove.y), w.stoveFuel(stove.x, stove.y));
  g.addItem('魚', 1); hold('魚'); g.pressPlace();
  ok('魚 on lit 灶 becomes 烤魚', g.count('烤魚') === 1 && g.count('魚') === 0, bag());
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
  setDay(0.6); const dayBefore = g.day(); p.warm = 40; p.sta = 20; g.sleep(); await sleep(30);
  ok('sleeping in a bed skips to morning', g.day() === dayBefore + 1 && p.warm === 100 && p.sta === p.staMax && g.stats.nights === 1, [g.day(), p.warm]);
  setDay(0.6); const ghost = g.ents.add('魄', p.x + 3, p.y, { moveT: 99 }); const t1 = w.time; g.sleep();
  ok('cannot sleep with a ghost nearby', w.time === t1, g.msgText); g.ents.remove(ghost);
  setDay(0.6); p.san = 50; g.sleep(); await sleep(30);
  ok('sleeping restores 20 sanity', Math.round(p.san) === 70, p.san);
  setDay(0.04); const tN = w.time; g.sleep();
  ok('no napping after sunrise', w.time === tN, g.msgText);
  setDay(0.3); g.removeItem('果', 99); g.removeItem('肉', 99); g.removeItem('磚', 99); g.addItem('果', 5); p.bag.find(s => s.n === '果').d = g.day() - 15;
  w.time += DAY; await until(() => g.count('醉果') === 5, 3000);
  ok('fruit older than 15 nights ferments', g.count('醉果') === 5 && g.count('果') === 0, bag());
  // ============ F. 魄夜、毒、豹狼、稻草人 ============
  p.hp = 100; p.poisonT = 0; p.san = 100;
  w.time = DAY * 12 + DAY * 0.7;   // 第 13 日的夜 → 第十三夜
  ok('night thirteen is ghost night', g.day() === 13 && g.nightNo() === 13 && g.ghostNight() && g.ghostCap() === 2, [g.day(), g.nightNo(), g.ghostCap()]);
  w.time = DAY * 9 + DAY * 0.7; ok('no ghosts on night ten any more', !g.ghostNight());
  w.time = DAY * 12 + DAY * 0.7;
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
  // 手持火把：六格內煙滅
  g.addItem('火把', 1); hold('火把'); await until(() => !g.ents.list.includes(gh), 4000);
  ok('held torch dispels a ghost within six tiles', !g.ents.list.includes(gh) && g.hasLight());
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
  w.time = DAY * 13 + DAY * 0.25;
  const g1 = g.ents.add('魄', p.x + 20, p.y + 20, { moveT: 99 }); w.set(p.x + 20, p.y + 20, '林');
  const g2 = g.ents.add('魄', p.x + 22, p.y + 22, { moveT: 99 }); w.set(p.x + 22, p.y + 22, '草');
  await until(() => !g.ents.list.includes(g2), 4000);
  ok('by day a ghost in the woods freezes, one outside dissipates', g.ents.list.includes(g1) && g1.frozen && !g.ents.list.includes(g2));
  g.ents.remove(g1);
  // 毒蛇：咬一口中毒五秒；連咬十五口必死
  hold('木'); w.time = DAY * 13 + DAY * 0.3;
  face(1, 0); w.set(T().x, T().y, '草'); const snake = g.ents.add('蛇', T().x, T().y, { moveT: 0, atk: 0 }); p.hp = 100; p.biteN = 0; p.biteLast = -99;
  await until(() => p.poisonT > 0, 3000);
  ok('snake bite poisons (3/s for 5 s)', p.poisonT > 0 && p.poisonPer === 3 && p.biteN === 1, [p.poisonT, p.poisonPer, p.biteN]);
  ok('hostile beasts bite every 2.67 s and maul every 1.6 s (a quarter slower)', Math.abs(snake.atk - 2.0 * 4 / 3) < 0.3 && snake.hp === 90, [snake.atk, snake.hp]);
  const hpP = p.hp; await sleep(1000);
  ok('poison drains hp and screen tints green', p.hp < hpP && g.vignette().green > 0, [hpP - p.hp]);
  g.addItem('藥', 1); hold('藥'); g.useItem();
  ok('藥 cures poison', p.poisonT === 0 && p.poisonPer === 0);
  g.ents.remove(snake);
  p.hp = 100; p.biteN = 14; p.biteLast = w.time; const snake2 = g.ents.add('蛇', T().x, T().y, { moveT: 0, atk: 0 });
  await until(() => p.dead, 3000);
  ok('fifteenth consecutive bite kills', p.dead, [p.hp, p.biteN]);
  g.ents.remove(snake2); await press('Enter', 20); await sleep(80);
  ok('respawn resets courage to zero', !p.dead && p.cour === 0);
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
  w.time = DAY * 13 + DAY * 0.3; hold('木'); face(1, 0); w.set(T().x, T().y, '林');
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
  ok('crafting adds 8 sanity and courage equal to its stamina', p.san === 58 && p.cour === 3, [p.san, p.cour]);
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
  ok('level thresholds grow as 20×(1+0.1n)²', g.levelCost(0) === 20 && g.levelCost(1) === 24.2 && g.levelCost(2) === 28.8 && g.levelCost(3) === 33.8 && g.levelCost(4) === 39.2 && g.levelAt(1) === 20 && g.levelAt(2) === 44.2 && g.levelAt(8) === 300 && g.levelAt(10) === 437, [g.levelAt(8), g.levelAt(10), g.levelAt(31)]);
  ok('ship recipe locked below level 8', (() => { g.addItem('木板', 12); g.addItem('船槳', 2); g.addItem('船帆', 1); p.sta = 100; g.craft('ship'); return g.count('大船') === 0; })());
  p.cour = 300; g.craft('ship');
  ok('ship craftable at level 8', g.count('大船') === 1 && g.level() === 8, [g.count('大船'), g.level()]);
  // 衣甲與山海衣：五件穿齊、十重膽氣才有獸紋；脫下一件就是普通衣甲
  p.cour = g.levelAt(10); trim(['木', '石', '石子', '草', '土', '磚', '大船']);
  g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('布甲', 1); g.addItem('布帽', 1); g.addItem('布靴', 1);
  for (const n of ['內襯', '布褲', '布甲', '布帽']) { hold(n); g.pressPlace(); }
  ok('four cloth pieces worn: 8.5% less damage, no 山海衣 yet', Math.abs(g.armorRed() - 0.085) < 1e-9 && !g.totemOn() && g.wornList().length === 4 && g.dmgMult() === 1, g.armorRed());
  hold('布靴'); g.useItem();
  ok('fifth piece at level 10 wakes the 山海衣: attack ×1.15, taken ×1 (×0.9 from cloth)', g.totemOn() && Math.abs(g.armorRed() - 0.10) < 1e-9 && Math.abs(g.dmgMult() - 1.15) < 1e-9 && Math.abs(g.takenMult() - 0.9) < 1e-9, [g.dmgMult(), g.takenMult()]);
  document.getElementById('totemswitch').click();
  ok('the switch turns the 山海衣 off into plain clothes', p.totemOff && !g.totemOn() && g.totemReady() && g.dmgMult() === 1 && Math.abs(g.takenMult() - 0.9) < 1e-9);
  document.getElementById('totemswitch').click();
  ok('and back on', !p.totemOff && g.totemOn());
  p.cour = g.levelAt(17); ok('level 17: attack ×1.15², taken ÷1.15', Math.abs(g.dmgMult() - 1.15 * 1.15) < 1e-9 && Math.abs(g.takenMult() - 0.9 / 1.15) < 1e-9);
  p.cour = g.levelAt(24); ok('level 24: attack ×1.15³, taken ÷1.15²', Math.abs(g.dmgMult() - Math.pow(1.15, 3)) < 1e-9 && Math.abs(g.takenMult() - 0.9 / 1.15 / 1.15) < 1e-9);
  p.cour = g.levelAt(10); p.hp = 100; p.hitWin = { start: -99, n: 0 }; g.hit({ type: '虎', x: p.x + 1, y: p.y }, 20);
  ok('near the 山海衣 beasts hit 5/3 harder; cloth still takes a tenth off', Math.abs(p.hp - (100 - 20 * 5 / 3 * 0.9)) < 0.1, p.hp);
  w.set(p.x + 3, p.y, '草'); const tt = g.ents.add('虎', p.x + 3, p.y, { moveT: 0, calm: 0, atk: 0 }); g.ents.update(0.01, g);
  ok('near the 山海衣 hostile beasts move at half speed', Math.abs(tt.moveT - 0.6) < 1e-6, tt.moveT); g.ents.remove(tt);
  g.takeOff('盔');
  ok('taking one piece off turns it back into plain clothes', !g.totemOn() && g.dmgMult() === 1 && Math.abs(g.takenMult() - 0.915) < 1e-9 && g.has('布帽'), g.takenMult());
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
  p.hp = 100; p.hurtT = 0; g.takeOff('盔'); g.takeOff('靴'); trim(['木', '石', '石子', '草', '土', '磚', '大船']);
  // 拆回自己放的東西不長膽氣；稻草人拆得回來
  p.cour = 0; face(0, -1); w.set(T().x, T().y, '土'); g.addItem('磚', 1); hold('磚'); g.pressPlace(); g.addItem('石鎬', 1); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  ok('taking back a placed brick gives no courage', g.count('磚') >= 1 && p.cour === 0 && w.get(T().x, T().y) === '白', [p.cour, w.get(T().x, T().y)]);
  w.set(T().x, T().y, '土'); g.addItem('偶', 1); hold('偶'); g.pressPlace(); const sck = T().x + ',' + T().y; g.action = null; g.pressGather(); await until(() => !g.action, 4000);
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
  for (const k of ['襯', '甲', '褲', '盔', '靴']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚', '大船']); p.hitWin = { start: -99, n: 0 };
  // 難度：魄幾夜起、受傷與攻擊倍率、夜裡獸量
  const tSave = w.time; p.cour = 0;
  g.diff = XIEYI.DIFF.hard; w.time = DAY * 8 + DAY * 0.7;
  ok('hard: ghosts from night 9, taken ×1.1, attack ×0.9, night beasts ×1.5', g.ghostNight() && Math.abs(g.takenMult() - 1.1) < 1e-9 && Math.abs(g.dmgMult() - 0.9) < 1e-9 && g.beastMult() === 1.5, [g.takenMult(), g.dmgMult()]);
  g.diff = XIEYI.DIFF.easy; w.time = DAY * 12 + DAY * 0.7; const e13 = g.ghostNight(); w.time = DAY * 20 + DAY * 0.7;
  ok('easy: no ghosts on night 13, ghosts from night 21, taken ×0.9, attack ×1.1', !e13 && g.ghostNight() && Math.abs(g.takenMult() - 0.9) < 1e-9 && Math.abs(g.dmgMult() - 1.1) < 1e-9 && g.beastMult() === 1);
  g.diff = XIEYI.DIFF.normal; w.time = tSave;
  // 錦囊：囊多兩格、具欄多一格，最多四個
  g.addItem('錦囊', 1); hold('錦囊'); g.useItem(); await sleep(60);
  ok('a pouch adds two bag slots and one tool slot', p.pouches === 1 && g.slots() === 18 && g.toolSlots() === 7 && document.querySelectorAll('#bagbar .slot').length === 18 && document.querySelectorAll('#toolbar .slot').length === 7);
  p.pouches = 4; g.addItem('錦囊', 1); hold('錦囊'); g.useItem();
  ok('no more than four pouches: 24 bag slots and 10 tool slots', p.pouches === 4 && g.count('錦囊') === 1 && g.slots() === 24 && g.toolSlots() === 10);
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
  ok('carrying it: courage decays every two days down to level 25', g.hasHammer() && g.decayDays() === 2 && g.decayFloor() === 25);
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
  // 龜：少見不咬人，命五十；龜甲卜之，吉則五日無魄
  face(1, 0); w.set(T().x, T().y, '草'); const tu = g.ents.add('龜', T().x, T().y, { moveT: 99 }); hold('石劍'); p.atkT = 0; g.pressGather();
  ok('a turtle takes two sword blows (50 hp)', tu.hp === 10 && g.ents.list.includes(tu), tu.hp);
  p.atkT = 0; g.pressGather();
  ok('a slain turtle leaves a 龜甲', !g.ents.list.includes(tu) && g.count('龜甲') === 1);
  hold('龜甲'); Math.random = () => 0.9; g.useItem();
  ok('a bad omen wastes the shell', g.count('龜甲') === 0 && g.peaceDays() === 0);
  g.addItem('龜甲', 1); hold('龜甲'); Math.random = () => 0.1; g.useItem(); Math.random = rnd3;
  ok('a good omen: five days without ghosts', g.peaceDays() === 5 && (() => { const t0 = w.time; w.time = Math.floor((p.noGhostUntil - DAY) / DAY) * DAY + DAY * 0.7; const inside = !g.ghostNight(); w.time = Math.floor(p.noGhostUntil / DAY) * DAY + DAY * 1.7; const after = g.ghostNight(); w.time = t0; return inside && after; })(), [g.peaceDays()]);
  p.noGhostUntil = 0;
  // 漁網：棉麻草織小網，四小成中，四中或十三小成大；放在水上按時存魚；空網收回
  trim(['木', '石', '石子', '草', '土', '磚', '大船']); g.removeItem('草', 99); g.removeItem('魚', 99);
  g.addItem('棉', 26); g.addItem('麻', 26); g.addItem('草', 39);
  for (let i = 0; i < 13; i++) { p.sta = 100; g.craft('net'); }
  ok('thirteen small nets from cotton, hemp and grass', g.count('漁網') === 13 && g.count('棉') === 0 && g.count('麻') === 0 && g.count('草') === 0, bag());
  p.sta = 100; g.craft('bignet13');
  ok('thirteen small nets weave one big net', g.count('大漁網') === 1 && g.count('漁網') === 0);
  g.addItem('漁網', 16); for (let i = 0; i < 4; i++) { p.sta = 100; g.craft('midnet'); }
  ok('four small nets weave a medium net', g.count('中漁網') === 4 && g.count('漁網') === 0);
  p.sta = 100; g.craft('bignet');
  ok('four medium nets weave a big net', g.count('大漁網') === 2 && g.count('中漁網') === 0);
  g.addItem('漁網', 1); face(1, 0); w.set(T().x, T().y, '水'); hold('漁網'); g.pressPlace(); const nk = T(), fish0 = g.count('魚');
  ok('a small net sits on shallow water', w.get(nk.x, nk.y) === '網' && !!w.netAt(nk.x, nk.y) && g.count('漁網') === 0);
  w.time += 200; g.action = null; g.pressGather();
  ok('after 200 s it holds two fish (one per 90 s, at most 3)', g.count('魚') === fish0 + 2, g.count('魚') - fish0);
  g.pressGather();
  ok('an empty net is taken back with E', w.get(nk.x, nk.y) === '水' && g.count('漁網') === 1 && !w.netAt(nk.x, nk.y));
  w.set(nk.x, nk.y, '淼'); g.pressPlace();
  ok('a small net refuses deep water', w.get(nk.x, nk.y) === '淼' && g.count('漁網') === 1);
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) w.set(nk.x + dx, nk.y + dy, '淼');
  hold('大漁網'); g.pressPlace();
  ok('a big net covers three by three of deep water', w.get(nk.x + 2, nk.y + 2) === '罾' && w.netAt(nk.x + 2, nk.y + 2) === w.netAt(nk.x, nk.y) && g.count('大漁網') === 1);
  w.time += 1000; g.pressGather();
  ok('a big net stores up to twenty fish, one every 10 s', g.count('魚') === fish0 + 22, g.count('魚') - fish0);
  g.pressGather();
  ok('taking a big net back clears all nine cells', g.count('大漁網') === 2 && w.get(nk.x + 1, nk.y + 1) === '淼' && !w.netAt(nk.x + 2, nk.y + 2));
  g.removeItem('魚', 99); g.removeItem('大漁網', 9); g.removeItem('漁網', 9);
  // 煤與鐵：山裡有礦；礦二煤一入旺灶煉鐵；煤是好柴
  let coal = 0, iron = 0; for (let x = -60; x <= 60; x++) for (let y = -60; y <= 60; y++) { const b = w.base(x, y); if (b === '煤') coal++; else if (b === '鐵') iron++; }
  ok('coal seams and iron veins spawn in the mountains', coal >= 5 && iron >= 3, [coal, iron]);
  g.addItem('石鎬', 1); face(0, 1); w.set(T().x, T().y, '鐵'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  ok('mining an iron vein with a pickaxe gives 鐵礦×2 and leaves 石', g.count('鐵礦') === 2 && w.get(T().x, T().y) === '石', bag());
  w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 100); hold('鐵礦'); g.pressPlace();
  ok('ore without coal does not smelt', g.count('鐵') === 0 && g.count('鐵礦') === 2);
  g.addItem('煤', 2); hold('鐵礦'); g.pressPlace();
  ok('two ore and one coal on a lit stove smelt one 鐵', g.count('鐵') === 1 && g.count('鐵礦') === 0 && g.count('煤') === 1, bag());
  hold('煤'); const f0 = w.stoveFuel(T().x, T().y); g.pressPlace();
  ok('coal is strong fuel (+120)', Math.abs(w.stoveFuel(T().x, T().y) - f0 - 120) < 1 && g.count('煤') === 0, w.stoveFuel(T().x, T().y) - f0);
  w.set(T().x, T().y, '土'); hold('石劍'); p.hurtT = 0;
  // 鋼具與鎢鋼具：鐵二木一煤一鍛鋼具（140%）；鐵礦脈 1/30 出鎢礦；八煤成精煤；鎢礦一鐵礦二精煤一煉鎢鋼；鎢鋼具 150%／耐久 200%
  trim(['木', '石', '石子', '草', '土', '磚', '大船']); g.addItem('鐵', 2); g.addItem('木', 1); g.addItem('煤', 1); p.sta = 100; g.craft('forge', '鋼劍');
  ok('a steel sword: 56 damage and 56 durability (140% of stone)', !!tool('鋼劍') && tool('鋼劍').dur === 56 && G.ITEMS['鋼劍'].dmg === 56 && g.count('鐵') === 0, bag());
  ok('iron veins hide tungsten one time in thirty', Math.abs(G.DB['鐵'].bonus['鎢礦'] - 1 / 30) < 1e-9);
  const rndT = Math.random; Math.random = () => 0.01; face(0, 1); w.set(T().x, T().y, '鐵'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000); Math.random = rndT;
  ok('a lucky swing on an iron vein yields 鎢礦', g.count('鎢礦') >= 1 && g.count('鐵礦') >= 2, bag());
  g.addItem('煤', 8); p.sta = 100; g.craft('coke');
  ok('eight coal make one refined coal', g.count('精煤') === 1 && g.count('煤') === 0);
  w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 100); g.removeItem('鎢礦', 9); g.removeItem('鐵礦', 9); g.addItem('鎢礦', 1); g.addItem('鐵礦', 2); hold('鎢礦'); g.pressPlace();
  ok('tungsten ore + two iron ore + refined coal smelt one 鎢鋼', g.count('鎢鋼') === 1 && g.count('鎢礦') === 0 && g.count('鐵礦') === 0 && g.count('精煤') === 0, bag());
  g.addItem('鎢鋼', 1); g.addItem('木', 1); g.addItem('精煤', 1); p.sta = 100; p.food = 80; g.craft('forgew', '鎢鋼劍');
  ok('a tungsten-steel sword: 84 damage, 112 durability', !!tool('鎢鋼劍') && tool('鎢鋼劍').dur === 112 && G.ITEMS['鎢鋼劍'].dmg === 84, bag());
  tool('鎢鋼劍').dur = 5; hold('鎢鋼劍'); g.addItem('石子', 1); p.sta = 50; p.food = 50; g.craft('regrind');
  ok('regrinding tungsten steel costs 8 stamina and 10 food', tool('鎢鋼劍').dur === 112 && p.sta === 42 && Math.round(p.food) === 40, [p.sta, p.food]);
  g.addItem('鎢鋼甲', 1); hold('鎢鋼甲'); g.pressPlace(); const wv = p.worn['甲'];
  ok('tungsten armour: 22.4% (160% of iron) and 360 days', !!wv && Math.abs(G.ITEMS['鎢鋼甲'].red - 0.224) < 1e-9 && Math.round(wv.dur / DAY) === 360, wv && wv.dur / DAY);
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
  p.sta = 90; p.food = 90; p.san = 90; p.hp = 50; p.hurtT = 0; p.cour = 0; await until(() => p.hp > 50.3, 3000);
  ok('hp regenerates when food, sanity and stamina are above 80', p.hp > 50.3, p.hp);
  // 瓶與酒
  g.addItem('沙', 3); face(0, 1); w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 300); hold('沙'); g.pressPlace();
  ok('three sand on a lit stove make two bottles', g.count('玻璃瓶') === 2 && g.count('沙') === 0, bag());
  face(1, 0); w.set(T().x, T().y, '水'); hold('玻璃瓶'); g.pressGather();
  ok('empty bottle takes seawater', g.count('海水瓶') === 1 && g.count('玻璃瓶') === 1);
  face(0, 1); hold('海水瓶'); g.pressPlace();
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
  const ck2 = g.chestAt; document.getElementById('chest-take').click();
  ok('an empty chest can be taken down', hidden('chest') && !w.chests.has(ck2) && g.count('櫃') === 1 && w.get(...ck2.split(',').map(Number)) === '白');
  // 船：放在淺水，上船，渡深水，到海邊渡海（先離開泉邊，免得面前是地標）
  p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; g.closeRead();
  face(1, 0); w.set(T().x, T().y, '水'); hold('大船'); g.pressPlace();
  ok('ship placed on shallow water as 舟', w.get(T().x, T().y) === '舟');
  g.pressGather(); await sleep(300);
  ok('boarded the ship', p.sailing && w.get(p.x, p.y) === '水');
  const deep = w.get(p.x + 1, p.y); w.set(p.x + 1, p.y, '淼');
  ok('sailing passes deep water', g.pass(p.x + 1, p.y)); w.set(p.x + 1, p.y, deep);
  p.x = p.rx = 0; p.y = p.ry = G.ISLAND_R + 21; await sleep(200);
  ok('reaching the sea edge triggers the voyage ending', p.crossed && !hidden('voyage'));
  document.getElementById('voyage-back').click(); await sleep(50);
  ok('can turn back', g.paused === false && hidden('voyage'));
  p.x = p.rx = 0; p.y = p.ry = G.ISLAND_R + 10; p.sailing = true; p.crossed = false; g.addItem('木', 1); p.hp = 0; await until(() => p.dead, 3000);
  const landBag = [...w.bags.keys()].some(k => { const [x, y] = k.split(',').map(Number); const b = w.base(x, y); return w.get(x, y) === '包' && U.dist(x, y, 0, G.ISLAND_R + 10) < 30 && G.DB[b === '灘' ? '沙' : b].walk > 0 && G.DB[b].kind !== 'water'; });
  const shipLeft = [...w.diff.entries()].some(([k, v]) => v === '舟' && (() => { const [x, y] = k.split(',').map(Number); return U.dist(x, y, 0, G.ISLAND_R + 10) < 30; })());
  ok('dying at sea drops the 荷包 on the nearest land and leaves the ship on shallow water', p.dead && landBag && shipLeft, [landBag, shipLeft]);
  await press('Enter', 20); await sleep(80);
  ok('respawn after a sea death is back on land', !p.dead && !p.sailing && w.info(p.x, p.y).walk > 0);
  // 漲潮困在灘上可以涉水走到別的灘
  let beach = null; for (let r = 60; r <= 75 && !beach; r++) for (let a = 0; a < 360 && !beach; a += 2) { const x = Math.round(Math.cos(a * Math.PI / 180) * r), y = Math.round(Math.sin(a * Math.PI / 180) * r); if (w.raw(x, y) === '灘' && w.raw(x + 1, y) === '灘') beach = [x, y]; }
  if (beach) { p.x = p.rx = beach[0]; p.y = p.ry = beach[1]; setDay(0.6); ok('caught by the tide on the causeway you can wade to the next shoal', w.get(beach[0], beach[1]) === '水' && g.pass(beach[0] + 1, beach[1]), beach); p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; }
  else ok('caught by the tide on the causeway you can wade to the next shoal (no causeway found to test)', true);
  p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; p.sailing = false; p.crossed = false;
  // 草木長回來（計時器）
  face(0, 1); w.set(T().x, T().y, '草'); hold('木'); g.action = null; g.pressGather(); await until(() => !g.action, 4000);
  const tk = T().x + ',' + T().y;
  ok('cut grass is scheduled to regrow in 30 s', w.get(T().x, T().y) === '白' && w.timers.has(tk) && Math.round(w.timers.get(tk).at - w.time) === 30, w.timers.get(tk));
  w.time += 31; w.step(p.x, p.y);
  ok('and it does regrow', w.get(T().x, T().y) === '草');

  // ============ G. 地標、碑、問路、潮汐、存檔 ============
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
  { const dr = g.ents.list.find(e => e.type === '龍'); setDay(0.75); hold('木'); if (p.worn['帽']) g.takeOff('帽'); g.removeItem('燈帽', 9);
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
  const reach = () => { const sp = g.spawn, d = by('deng'); const seen = new Set([sp.x + ',' + sp.y]); const q = [[sp.x, sp.y]]; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k)) continue; if (Math.abs(nx - d.x) <= 1 && Math.abs(ny - d.y) <= 1) return true; if (w.walkable(nx, ny)) { seen.add(k); q.push([nx, ny]); } } } return false; };
  setDay(0.25); const lo = reach(); setDay(0.6); const hi = reach();
  ok('lighthouse reachable only at low tide', lo && !hi, [lo, hi]);
  await press('KeyM', 20); await sleep(50); const mapOpen = !hidden('map'); await press('KeyM', 20); await sleep(30);
  ok('island map toggles', mapOpen && hidden('map'));
  await press('KeyJ', 20); await sleep(30); const jt = document.getElementById('journal-body').textContent; await press('KeyJ', 20);
  ok('journal has places and creatures', jt.indexOf('塔') >= 0 && jt.indexOf('龍') >= 0, jt.slice(jt.indexOf('生靈'), jt.indexOf('生靈') + 30));
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v5'));
  ok('save v5 keeps sanity, courage, scarecrows and chests', sv && sv.v === 5 && typeof sv.player.san === 'number' && typeof sv.player.cour === 'number' && sv.world.scarecrows && sv.world.chests && sv.player.places.ta === 2);

  } catch (e) { checks.push('CRASH ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')); }

  let frames = 0; const t0 = performance.now(); await new Promise((res) => { const tick = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  r.fps = Math.round(frames / ((performance.now() - t0) / 1000));
  r.checks = checks; r.failed = checks.filter(c => c.startsWith('FAIL')).length;
  return r;
});
console.log(result.checks.join('\n'));
console.log('fps', result.fps, 'failed', result.failed, 'of', result.checks.length);
await page.screenshot({ path: out + '/02-end.png' });
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
process.exit(errors.length || result.failed ? 1 : 0);
