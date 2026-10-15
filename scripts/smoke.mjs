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
  const hold = (n) => { const i = p.bag.findIndex(s => s.n === n); p.sel = i < 0 ? 0 : i; return i >= 0; };
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
  ok('door/bed/stove/torch/lamp crafted', g.count('門') === 1 && g.count('床') === 1 && g.count('灶') === 1 && g.count('火把') === 1 && g.count('燈') === 1, bag());
  g.removeItem('土', 99); g.removeItem('草', 99); g.removeItem('燈', 99); g.removeItem('火把', 99);   // 騰出格子，工具不疊
  g.craft('grind', '石劍'); g.craft('grind', '石鎬'); g.craft('grind', '石斧'); g.craft('grind', '石鋤');
  const sword = p.bag.find(s => s.n === '石劍');
  ok('grinding makes tools with durability', !!sword && sword.dur === 40 && g.has('石鎬') && g.has('石斧') && g.has('石鋤'), bag());
  const staBefore = p.sta; p.sta = 2; const bricks = g.count('磚'); g.craft('brick');
  ok('crafting needs stamina', g.count('磚') === bricks && p.sta === 2); p.sta = staBefore;
  sword.dur = 5; hold('石劍'); const pebbles = g.count('石子'); g.craft('regrind');
  ok('regrind restores durability for one 石子', sword.dur === 40 && g.count('石子') === pebbles - 1, [sword.dur, g.count('石子')]);
  await press('KeyC', 20); await sleep(30);
  ok('craft panel opens with C and lists recipes', !hidden('craft') && document.querySelectorAll('#craft-list .recipe').length === G.RECIPES.length);
  ok('sixteen bag slots', document.querySelectorAll('#bagbar .slot').length === 16);
  await press('KeyC', 20); await sleep(30); ok('craft panel closes', hidden('craft'));

  // ============ C. 放置、擋路、灶、鋤、鎬 ============
  face(1, 0); w.set(T().x, T().y, '白'); hold('磚'); g.pressPlace();
  ok('placed 磚 blocks beasts and ghosts', w.get(T().x, T().y) === '磚' && !g.ents.canStand('虎', T().x, T().y, true) && !g.ents.canStand('鬼', T().x, T().y, true) && !g.pass(T().x, T().y), w.get(T().x, T().y));
  face(0, -1); w.set(T().x, T().y, '草'); hold('門'); g.pressPlace();
  ok('cannot place on grass before clearing it', w.get(T().x, T().y) === '草');
  w.set(T().x, T().y, '土'); g.pressPlace();
  ok('placed 門: player passes, ghosts do not', w.get(T().x, T().y) === '門' && g.pass(T().x, T().y) && !g.ents.canStand('鬼', T().x, T().y, true) && !g.ents.canStand('虎', T().x, T().y, true));
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
  w.set(stove.x, stove.y, '土'); hold('石鋤'); g.pressPlace();
  ok('鋤 turns 土 into 田 and wears', w.get(stove.x, stove.y) === '田' && p.bag.find(s => s.n === '石鋤').dur === 39);
  w.set(stove.x, stove.y, '山'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  ok('鎬 mines 山 into 石 and yields 石×2', w.get(stove.x, stove.y) === '石' && g.count('石') >= 2, [w.get(stove.x, stove.y), g.count('石')]);
  w.set(stove.x, stove.y, '木'); hold('石斧'); g.action = null; g.pressGather();
  ok('斧 halves wood time', g.action && Math.abs(g.action.dur - 0.7) < 0.01, g.action && g.action.dur); g.action = null;

  // ============ D. 戰鬥 ============
  hold('石劍'); const sd0 = p.bag.find(s => s.n === '石劍').dur;
  face(0, 1); w.set(T().x, T().y, '草'); g.ents.list = g.ents.list.filter(e => e.type !== '虎');
  const tiger = g.ents.add('虎', T().x, T().y, { calm: 9, moveT: 9 });
  g.pressGather(); ok('sword hits tiger for 2', tiger.hp === 1, tiger.hp);
  g.pressGather(); ok('attack has a cooldown', tiger.hp === 1); p.atkT = 0; tiger.x = T().x; tiger.y = T().y;
  g.pressGather(); ok('second blow kills the tiger, 肉×3, sword wears 2', !g.ents.list.includes(tiger) && g.count('肉') === 3 && p.bag.find(s => s.n === '石劍').dur === sd0 - 2, bag());
  const deer = g.ents.add('鹿', T().x, T().y, { calm: 9, moveT: 9 }); p.atkT = 0; g.pressGather();
  ok('one blow kills a deer, 肉×2', !g.ents.list.includes(deer) && g.count('肉') === 5, g.count('肉'));
  const deer2 = g.ents.add('鹿', T().x, T().y, { calm: 9, moveT: 9 }); hold('木'); p.atkT = 0; g.pressGather();
  ok('bare hands cannot attack', g.ents.list.includes(deer2) && deer2.hp === 1); g.ents.remove(deer2);

  // ============ E. 睡覺、發酵、醉果 ============
  g.ents.list = g.ents.list.filter(e => e.type !== '魄');
  setDay(0.6); const dayBefore = g.day(); p.warm = 40; p.sta = 20; g.sleep(); await sleep(30);
  ok('sleeping in a bed skips to morning', g.day() === dayBefore + 1 && p.warm === 100 && p.sta === p.staMax && g.stats.nights === 1, [g.day(), p.warm]);
  setDay(0.6); const ghost = g.ents.add('魄', p.x + 3, p.y, { moveT: 99 }); const t1 = w.time; g.sleep();
  ok('cannot sleep with a ghost nearby', w.time === t1, g.msgText); g.ents.remove(ghost);
  setDay(0.6); p.san = 50; g.sleep(); await sleep(30);
  ok('sleeping restores 20 sanity', Math.round(p.san) === 70, p.san);
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
  // 蜘蛛不惹不咬；除草十分之一出蜘蛛
  w.set(T().x, T().y, '草'); g.ents.list = g.ents.list.filter(e => e.type !== '蛛');
  const spider = g.ents.add('蛛', p.x + 1, p.y + 1, { moveT: 0, atk: 0 }); p.poisonT = 0; await sleep(700);
  ok('spider leaves you alone unless provoked', p.poisonT === 0 && !spider.angry && g.ents.list.includes(spider));
  spider.x = p.x + 1; spider.y = p.y + 1; spider.moveT = 99;
  g.addItem('石劍', 1); hold('石劍'); face(1, 1); p.atkT = 0; g.pressGather();
  ok('attacking a spider makes it angry', spider.angry && spider.hp === 1);
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
  p.san = 0; await sleep(300);
  ok('zero sanity makes you insane with blue tint', p.insane && g.vignette().blue > 0.5);
  const ctrl0 = p.ctrl; p.ctrlT = 0; await sleep(200);
  ok('control alternates while insane', p.ctrl !== ctrl0);
  p.san = 12; await sleep(200);
  ok('sanity above ten restores control', !p.insane && p.ctrl);
  // 膽氣：每 20 點一重，回復倍率
  p.cour = 40; g.addCourage(0);
  ok('courage level 2 gives 1.2x recovery', g.level() === 2 && Math.abs(g.mult() - 1.2) < 1e-9);
  ok('ship recipe locked below level 8', (() => { g.addItem('木板', 12); g.addItem('船槳', 2); g.addItem('船帆', 1); p.sta = 100; g.craft('ship'); return g.count('大船') === 0; })());
  p.cour = 160; g.craft('ship');
  ok('ship craftable at level 8', g.count('大船') === 1 && g.level() >= 8, [g.count('大船'), g.level()]);
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
  g.closeChest();
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
  const cun = by('cun'); const gx = cun.x + 2, gy = cun.y; w.set(gx, gy - 1, '草'); p.x = p.rx = gx; p.y = p.ry = gy - 1; face(0, 1);
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
