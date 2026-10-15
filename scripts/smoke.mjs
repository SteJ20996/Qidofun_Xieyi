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
  g.ents.seaP = 0;   // 蜃也是：專門的海上測試自己開
  w.fogP = 0;   // 霧障是真隨機的，測試途中跳出彈窗會把遊戲停住；專門的霧障測試自己開
  g.warnEnabled = false; w.fogStep = 1e9;   // 數值提醒的彈窗與霧障的挪動也先關掉，各自的測試再開
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
  setDay(0.6); const dayBefore = g.day(); p.warm = 40; p.sta = 20; g.sleep(); await sleep(30);
  ok('sleeping in a bed skips to morning', g.day() === dayBefore + 1 && p.warm === 100 && p.sta === p.staMax && g.stats.nights === 1, [g.day(), p.warm]);
  setDay(0.6); const ghost = g.ents.add('魄', p.x + 3, p.y, { moveT: 99 }); const t1 = w.time; g.sleep();
  ok('cannot sleep with a ghost nearby', w.time === t1, g.msgText); g.ents.remove(ghost);
  setDay(0.6); p.san = 50; g.sleep(); await sleep(30);
  ok('sleeping restores 20 sanity', Math.round(p.san) === 70, p.san);
  setDay(0.04); const tN = w.time; g.sleep();
  ok('no napping after sunrise', w.time === tN, g.msgText);
  setDay(0.3); g.removeItem('果', 99); g.removeItem('肉', 99); g.removeItem('磚', 99);
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
  ok('level thresholds grow as 20×(1+0.1n)², rounded to whole points', g.levelCost(0) === 20 && g.levelCost(1) === 24 && g.levelCost(2) === 29 && g.levelCost(3) === 34 && g.levelCost(4) === 39 && g.levelAt(1) === 20 && g.levelAt(2) === 44 && g.levelAt(8) === 300 && g.levelAt(10) === 437 && Number.isInteger(g.levelAt(31)), [g.levelAt(8), g.levelAt(10), g.levelAt(31)]);
  ok('ship recipe locked below level 8', (() => { g.addItem('木板', 8); g.addItem('船槳', 1); g.addItem('船帆', 1); p.sta = 100; g.craft('ship'); return g.count('孤帆') === 0; })());
  p.cour = 300; g.craft('ship');
  ok('a 孤帆 is craftable at level 8 for 8 planks, an oar and a sail', g.count('孤帆') === 1 && g.level() === 8 && g.count('木板') === 0, [g.count('孤帆'), g.level()]);
  g.addItem('木板', 36); g.addItem('船槳', 4); g.addItem('船帆', 3); g.addItem('鐵', 8); g.addItem('麻布', 6); g.addItem('鎢鋼', 2); p.sta = 100; g.craft('ark');
  ok('a 方舟 costs far more: 36 planks, 4 oars, 3 sails, 8 iron, 6 cloth, 2 tungsten steel', g.count('方舟') === 1 && g.count('木板') === 0 && g.count('鐵') === 0 && g.count('鎢鋼') === 0, [g.count('方舟'), g.count('木板')]);
  // 衣甲與山海衣：五件穿齊、十重膽氣才有獸紋；脫下一件就是普通衣甲
  p.cour = g.levelAt(10); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']);
  g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('布甲', 1); g.addItem('布帽', 1); g.addItem('布靴', 1);
  for (const n of ['內襯', '布褲', '布甲', '布帽']) { hold(n); g.pressPlace(); }
  ok('four cloth pieces worn: 9% less damage, no 山海衣 yet', Math.abs(g.armorRed() - 0.09) < 1e-9 && !g.totemOn() && g.wornList().length === 4 && g.dmgMult() === 1, g.armorRed());
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
  ok('taking one piece off turns it back into plain clothes', !g.totemOn() && g.dmgMult() === 1 && Math.abs(g.takenMult() - 0.92) < 1e-9 && g.has('布帽'), g.takenMult());
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
  for (const k of ['襯', '甲', '褲', '盔', '靴']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.hitWin = { start: -99, n: 0 };
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
  ok('from the fifty-first pill each adds half, rounded to whole points (251, 251)', after51 === 251 && p.hpMax === 251 && p.pillsEaten === 52, [after51, p.hpMax]);
  p.hp = p.hpMax; await sleep(60);
  ok('hp bar and label follow the raised maximum', document.getElementById('hplabel').textContent.indexOf('251') >= 0, document.getElementById('hplabel').textContent);
  p.cour = g.levelAt(10); g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('布甲', 1); g.addItem('布帽', 1); g.addItem('布靴', 1); for (const n of ['內襯', '布褲', '布甲', '布帽', '布靴']) { hold(n); g.pressPlace(); }
  face(1, 0); w.set(T().x, T().y, '草'); const rt = g.ents.add('虎', T().x, T().y, { moveT: 99, calm: 99 }); hold('石劍'); p.atkT = 0; g.pressGather();
  ok('damage dealt is a whole number (40 × 1.15 = 46)', rt.hp === 300 - 46 && Number.isInteger(rt.hp), rt.hp);
  p.hp = 100; g.hit({ type: '虎', x: p.x + 1, y: p.y }, 20);
  ok('damage taken is a whole number (20 × 5/3 × 0.9 = 30)', p.hp === 70 && Number.isInteger(p.hp), p.hp);
  g.ents.remove(rt); for (const k of ['襯', '褲', '甲', '盔', '靴']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.cour = 0; p.hp = 100; p.hurtT = 0;
  p.hpMax = 100; p.hp = 100; p.pillsEaten = 0; p.pillsMade = 0; g.removeItem('丹', 9); g.removeItem('蟾蜍肉', 9); g.removeItem('毒蟾肉', 9); w.set(ding.x, ding.y, '土');
  // 龜：少見不咬人，命五十；龜甲卜之，吉則五日無魄
  face(1, 0); w.set(T().x, T().y, '草'); const tu = g.ents.add('龜', T().x, T().y, { moveT: 99 }); hold('石劍'); p.atkT = 0; g.pressGather();
  ok('a turtle takes two sword blows (50 hp)', tu.hp === 10 && g.ents.list.includes(tu), tu.hp);
  p.san = 80; p.atkT = 0; g.pressGather();
  ok('a slain turtle leaves a 龜甲', !g.ents.list.includes(tu) && g.count('龜甲') === 1);
  ok('killing a turtle is ill-omened: 愜意 −30', Math.abs(p.san - 50) < 1, p.san);
  hold('龜甲'); Math.random = () => 0.9; g.useItem();
  ok('a bad omen wastes the shell', g.count('龜甲') === 0 && g.peaceDays() === 0);
  g.addItem('龜甲', 1); hold('龜甲'); Math.random = () => 0.1; g.useItem(); Math.random = rnd3;
  ok('a good omen: five days without ghosts', g.peaceDays() === 5 && (() => { const t0 = w.time; w.time = Math.floor((p.noGhostUntil - DAY) / DAY) * DAY + DAY * 0.7; const inside = !g.ghostNight(); w.time = Math.floor(p.noGhostUntil / DAY) * DAY + DAY * 1.7; const after = g.ghostNight(); w.time = t0; return inside && after; })(), [g.peaceDays()]);
  p.noGhostUntil = 0;
  // 漁網：棉麻草織小網，四小成中，四中或十三小成大；放在水上按時存魚；空網收回
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
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) w.set(nk.x + dx, nk.y + dy, w.base(nk.x + dx, nk.y + dy));   // 測試挖的深水還原，免得把出生點圍住
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
  ok('coal is strong fuel (+120)', Math.abs(w.stoveFuel(T().x, T().y) - f0 - 120) < 1 && g.count('煤') === 0, w.stoveFuel(T().x, T().y) - f0);
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
  p.sta = 90; p.food = 90; p.san = 90; p.hp = 50; p.hurtT = 0; p.cour = 0; await until(() => p.hp > 50.3, 3000);
  ok('hp regenerates when food, sanity and stamina are above 80', p.hp > 50.3, p.hp);
  // 瓶與酒
  g.addItem('沙', 3); face(0, 1); w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 300); g.pressPlace(); g.stoveCook('沙'); g.closeStove();
  ok('three sand on a lit stove make two bottles', g.count('玻璃瓶') === 2 && g.count('沙') === 0, bag());
  face(1, 0); w.set(T().x, T().y, '水'); hold('玻璃瓶'); g.pressGather();
  ok('empty bottle takes seawater', g.count('海水瓶') === 1 && g.count('玻璃瓶') === 1);
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
  const ck2 = g.chestAt; document.getElementById('chest-take').click();
  ok('an empty chest can be taken down', hidden('chest') && !w.chests.has(ck2) && g.count('櫃') === 1 && w.get(...ck2.split(',').map(Number)) === '白');
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
  if (beach) { p.x = p.rx = beach[0]; p.y = p.ry = beach[1]; setDay(0.6); ok('caught by the tide on the causeway you can wade to the next shoal', w.get(beach[0], beach[1]) === '水' && g.pass(beach[0] + 1, beach[1]), beach); p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; }
  else ok('caught by the tide on the causeway you can wade to the next shoal (no causeway found to test)', true);
  if (beach) {   // 漲潮時灘看起來是水，但船與魚梁不能停在灘上，否則退潮會堵住去燈塔的路；橋可以
    setDay(0.6); p.x = p.rx = beach[0] - 1; p.y = p.ry = beach[1]; face(1, 0); g.addItem('漁', 1); hold('漁'); g.pressPlace();
    const parked = g.parkShip(beach[0], beach[1], true, 60); const pk = parked ? w.base(parked[0], parked[1]) : null; if (parked) w.set(parked[0], parked[1], w.base(parked[0], parked[1]));
    ok('no ship parks and no weir gets built on the causeway at high tide', w.raw(beach[0], beach[1]) === '灘' && g.count('漁') === 1 && parked && pk === '水', [w.raw(beach[0], beach[1]), g.count('漁'), JSON.stringify(parked), pk]);
    g.removeItem('漁', 9);
    g.addItem('橋', 1); hold('橋'); g.pressPlace();
    const bridged = w.get(beach[0], beach[1]) === '橋'; setDay(0.25); const lowWalk = w.walkable(beach[0], beach[1]); setDay(0.6);
    g.action = null; g.pressGather(); await until(() => !g.action, 4000);
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
    g.skullP = 1; let n0 = g.count('虎首骨'); g.kill(g.ents.add('虎', p.x + 4, p.y, {}));
    const tk = g.count('虎首骨') - n0;
    ok('a slain tiger can leave one or two tiger skulls', tk >= 1 && tk <= 2, tk);
    g.kill(g.ents.add('狼', p.x + 4, p.y, {})); ok('so can a wolf (wolf skulls)', g.count('狼首骨') >= 1);
    g.skullP = 0; g.kill(g.ents.add('豹', p.x + 4, p.y, {})); ok('and no skull when the odds say no', g.count('豹首骨') === 0);
    g.skullP = 0.35; g.removeItem('肉', 99);
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
    ok('loading drops the 蜃 and five courage levels, keeping the progress within the level', g.ents.count('蜃') === 0 && g.level() === 7 && p.cour === g.levelAt(7) + Math.floor(10 / g.levelCost(12) * g.levelCost(7)), [g.level(), p.cour]);
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
    const tolled = (a, b) => ['hp', 'food', 'warm', 'sta', 'san'].every(k => Math.abs(b[k] - (a[k] - Math.round(a[k] * 0.1))) < 1e-9);
    p.knock = 0; p.sailing = false; p.inFog = 0; g.removeItem('扇', 99); p.hp = 80; p.food = 50; p.warm = 60; p.sta = 40; p.san = 70;
    let f1 = mk(); stand(X + 1); await until(() => !hidden('fogask'), 3000);
    const noFanText = document.getElementById('fogask-text').textContent;
    ok('walking into fog pops the question and pauses the world; without a fan only "walk through" is offered', !hidden('fogask') && g.paused && noFanText.indexOf('沒有扇子') >= 0 && hidden('fogask-use'), noFanText);
    let s0 = snap(); document.getElementById('fogask-no').click(); const s1 = snap();
    ok('without a fan: hp, food, warmth, stamina and ease each lose a tenth (rounded)', tolled(s0, s1) && !g.paused && p.inFog === f1.id, [JSON.stringify(s0), JSON.stringify(s1)]);
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
  const reach = () => { const sp = g.spawn, d = by('deng'); const seen = new Set([sp.x + ',' + sp.y]); const q = [[sp.x, sp.y]]; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k)) continue; if (Math.abs(nx - d.x) <= 1 && Math.abs(ny - d.y) <= 1) return true; if (w.walkable(nx, ny)) { seen.add(k); q.push([nx, ny]); } } } reach.last = { n: seen.size, sp: sp.x + ',' + sp.y + ' ' + w.get(sp.x, sp.y), around: [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => w.get(sp.x + dx, sp.y + dy)).join('') }; return false; };
  setDay(0.25); const lo = reach(); setDay(0.6); const hi = reach();
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
    w.rainLampP = 1 / 1500; w.rainUntil = 0; }
  // ============ v0.14：神兵成類、小屋、霧障會動、數值燈與提醒 ============
  ok('god weapons have their own craft category 神兵', G.CRAFT_CATS.indexOf('神兵') > 0 && G.RECIPES.find(r => r.id === 'hammer').cat === '神兵' && G.RECIPES.find(r => r.id === 'seagod').cat === '神兵' && !G.RECIPES.some(r => r.cat === '工具' && (r.id === 'hammer' || r.id === 'seagod')));
  // —— 小屋：牆與門圍起不超過 45 格，裡面不生生靈、生靈不進
  { const cx = p.x + 20, cy = p.y + 20;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) w.set(cx + dx, cy + dy, '土');
    for (let d = -2; d <= 2; d++) { w.set(cx + d, cy - 2, '磚'); w.set(cx + d, cy + 2, '磚'); w.set(cx - 2, cy + d, '磚'); w.set(cx + 2, cy + d, '磚'); }
    w.set(cx, cy + 2, '門');
    ok('a 3×3 room walled with bricks and a door is a small room (9 cells); the door and outside are not', w.sheltered(cx, cy) && w.sheltered(cx + 1, cy - 1) && !w.sheltered(cx, cy + 3) && !w.sheltered(cx, cy + 2));
    ok('nothing spawns inside a small room and no creature can step in: beasts, eagles, the dragon, even a 魄', !g.ents.habitat('魄', cx, cy, true) && !g.ents.habitat('鹿', cx, cy, false) && !g.ents.canStand('狼', cx, cy, true) && !g.ents.canStand('鷹', cx, cy, true) && !g.ents.canStand('龍', cx, cy, true) && !g.ents.canStand('魄', cx, cy, true) && g.ents.canStand('魄', cx, cy + 3, true));
    const gh = g.ents.add('魄', cx, cy + 3, { moveT: 99 }); let inside = false; for (let i = 0; i < 12; i++) { g.ents.stepTo(gh, cx, cy, false, true); if (w.sheltered(gh.x, gh.y)) inside = true; } g.ents.remove(gh);
    ok('a 魄 chasing the player never gets into the small room', !inside, [gh.x - cx, gh.y - cy]);
    w.set(cx + 2, cy, '土');
    ok('knock out a wall and the room opens: not sheltered any more (the cache is cleared on every change)', !w.sheltered(cx, cy));
    w.set(cx + 2, cy, '磚');
    const box = (x0, y0, iw, ih) => { for (let dx = -1; dx <= iw; dx++) for (let dy = -1; dy <= ih; dy++) w.set(x0 + dx, y0 + dy, (dx < 0 || dy < 0 || dx === iw || dy === ih) ? '磚' : '土'); };
    box(cx + 10, cy - 10, 5, 9); box(cx + 20, cy - 12, 2, 23);
    ok('45 enclosed cells still count as a small room, 46 do not', w.sheltered(cx + 12, cy - 6) && !w.sheltered(cx + 20, cy));
    ok('tamed companions and the dragon are placed outside the room', (() => { const at = g.freeNear(cx, cy, true); return !w.sheltered(at.x, at.y); })());
    for (let dx = -1; dx <= 5; dx++) for (let dy = -1; dy <= 9; dy++) w.set(cx + 10 + dx, cy - 10 + dy, '草'); for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 23; dy++) w.set(cx + 20 + dx, cy - 12 + dy, '草');
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) w.set(cx + dx, cy + dy, '草'); }
  // —— 霧障會動：慢慢挪，躲著光；沒光就亂飄
  { const X = p.x, Y = p.y; for (const id of [...w.fogs.keys()]) w.removeFog(id);
    for (let dx = 0; dx <= 14; dx++) for (let dy = -2; dy <= 2; dy++) w.set(X + dx, Y + dy, '草');
    unarm(); p.worn['帽'] = null; g.removeItem('火把', 99); g.removeItem('蠟燭', 99); p.sel = 0;   // 手裡頭上都沒光
    ok('a fresh world moves fog every six seconds', new window.World(3).fogStep === 6 && !g.hasLight());
    const fog = w.addFog([(X + 6) + ',' + Y, (X + 7) + ',' + Y, (X + 7) + ',' + (Y + 1)], w.time + DAY);
    const cellsOf = () => [...fog.cells].map(k => k.split(',').map(Number));
    w.set(X + 3, Y, '燈');
    const moved1 = w.moveFog(fog, X, Y); const c1 = cellsOf();
    ok('a lamp within ten tiles pushes the fog away: every cell shifts one step east', moved1 && c1.length === 3 && c1.every(([x]) => x >= X + 7) && !!w.fogAt(X + 8, Y) && !w.fogAt(X + 6, Y), c1);
    w.set(X + 3, Y, '草'); p.x = p.rx = X + 12; p.y = p.ry = Y; g.addItem('火把', 1); hold('火把');
    const moved2 = g.hasLight() && w.moveFog(fog, p.x, p.y); const c2 = cellsOf();
    ok('a torch in the player\'s hand counts as light: the fog backs away west', moved2 && c2.every(([x]) => x <= X + 7) && !!w.fogAt(X + 7, Y), c2);
    unarm(); g.removeItem('火把', 9); p.sel = 0; p.x = p.rx = X; p.y = p.ry = Y;
    const before = JSON.stringify(cellsOf()); const moved3 = w.moveFog(fog, X, Y); const c3 = cellsOf();
    ok('with no light around the fog still drifts one step and stays on land', moved3 && c3.length === 3 && c3.every(([x, y]) => w.fogLand(x, y)) && JSON.stringify(c3) !== before, c3);
    fog.moveAt = w.time; w.fogStep = 1000; const c4 = JSON.stringify(cellsOf()); w.step(p.x, p.y);
    ok('the world tick moves fogs on the fog clock and winds it up again', JSON.stringify(cellsOf()) !== c4 && fog.moveAt > w.time + 900 && [...fog.cells].every(k => w.fogCells.get(k) === fog.id), fog.moveAt - w.time);
    const w2 = new window.World(w.seed); w2.restore(w.serialize()); const f2 = [...w2.fogs.values()][0];
    ok('a restored fog gets a fresh move clock', !!f2 && f2.moveAt > w2.time, f2 && f2.moveAt - w2.time);
    w.fogStep = 1e9; w.removeFog(fog.id); }
  // —— 數值燈與提醒：不到五成亮燈，不到四分之一彈窗；困難只亮燈
  { const bar = (k) => document.getElementById(k + 'fill').parentNode, title = () => document.getElementById('warn-title').textContent;
    g.warnEnabled = true; p.warnLow = {}; p.hp = p.hpMax; p.food = 100; p.warm = 100; p.sta = p.staMax; p.san = 100; g.hudSig = ''; g.updateHUD(); await sleep(80);
    ok('all five full: no lamp lit, no popup', !bar('hp').classList.contains('warn') && !bar('san').classList.contains('warn') && hidden('warn'));
    p.hp = p.hpMax * 0.4; g.hudSig = ''; g.updateHUD(); await sleep(120);
    ok('命 at 40%: the lamp above the bar lights (warn), not red, no popup yet', bar('hp').classList.contains('warn') && !bar('hp').classList.contains('low') && hidden('warn'));
    p.hp = p.hpMax * 0.2; g.hudSig = ''; g.updateHUD(); await until(() => !hidden('warn'), 2000);
    ok('命 at 20%: red lamp and a popup that pauses the game and names 命', bar('hp').classList.contains('low') && !hidden('warn') && g.paused && g.warnOpen && title().indexOf('命') >= 0, title());
    await press('Enter', 20); await sleep(80);
    ok('Enter closes the popup and the game runs on', hidden('warn') && !g.paused && !g.warnOpen);
    p.hp = p.hpMax * 0.15; await sleep(200);
    ok('still low: no second popup until 命 climbs back above half', hidden('warn'));
    p.hp = p.hpMax * 0.6; await sleep(150); p.hp = p.hpMax * 0.1; await until(() => !hidden('warn'), 2000);
    ok('after recovering above half, dropping again warns again', !hidden('warn')); g.closeWarn();
    p.hp = p.hpMax; p.food = 20; p.san = 20; p.warnLow = {}; await until(() => !hidden('warn'), 2000);
    ok('two stats at once: one popup naming both', title().indexOf('飽') >= 0 && title().indexOf('愜意') >= 0, title()); g.closeWarn();
    p.food = 100; p.san = 100; p.warnLow = {}; const d0 = g.diff; g.diff = XIEYI.DIFF.hard; p.warm = 10; g.hudSig = ''; g.updateHUD(); await sleep(250);
    ok('hard mode: the lamp lights but there is no popup', bar('warm').classList.contains('low') && hidden('warn') && !g.paused && XIEYI.DIFF.hard.warn === false && XIEYI.DIFF.normal.warn === true);
    g.diff = d0; p.warm = 100; p.warnLow = {}; g.warnEnabled = false; g.hudSig = ''; g.updateHUD(); }
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v5'));
  ok('save v5 keeps sanity, courage, scarecrows and chests', sv && sv.v === 5 && typeof sv.player.san === 'number' && typeof sv.player.cour === 'number' && sv.world.scarecrows && sv.world.chests && sv.player.places.ta === 2);
  // —— 三格存檔：第一格沿用舊鍵；每格帶摘要
  ok('three save slots: slot 1 keeps the old key, slots 2 and 3 get suffixes, autostart plays slot 1', XIEYI.Game.slotKey(1) === 'xieyi.save.v5' && XIEYI.Game.slotKey(2) === 'xieyi.save.v5.2' && XIEYI.Game.slotKey(3) === 'xieyi.save.v5.3' && g.slot === 1);
  ok('the save carries a brief: day, night, level, deaths, slept nights', !!sv.brief && sv.brief.day === g.day() && sv.brief.night === g.nightNo() && sv.brief.level === g.level() && typeof sv.brief.deaths === 'number' && typeof sv.brief.nights === 'number', sv.brief);
  { const m = XIEYI.Game.summary(sv);
    ok('summary of a save names island, difficulty, day, night, level and time', m.seed === g.seed && m.diff === g.diff.name && m.day === g.day() && m.level === g.level() && /^第 \d+ 日 · /.test(m.dayText) && /\d\d\/\d\d \d\d:\d\d/.test(m.whenText), m);
    const old = JSON.parse(JSON.stringify(sv)); delete old.brief; const mo = XIEYI.Game.summary(old);
    ok('an old save without a brief still gets day, night and level from time and courage', mo.day === m.day && mo.night === m.night && mo.level === m.level && mo.deaths === p.deaths);
    const t0 = w.time; w.time = 0; ok('day 1 before dusk reads 未入夜, dusk reads 第 1 夜, next morning reads 過了 1 夜', (() => { const at = (tt) => { w.time = tt; return XIEYI.Game.summary({ world: { time: tt }, player: {}, savedAt: 1 }).dayText; }; return at(0) === '第 1 日 · 未入夜' && at(DAY * 0.6) === '第 1 日 · 第 1 夜' && at(DAY * 1.2) === '第 2 日 · 過了 1 夜'; })()); w.time = t0;
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
  ok2('an occupied card tells island, difficulty, day, night, courage, slept nights and time', /島 #7/.test(cards[0].text) && /一般/.test(cards[0].text) && /第 \d+ 日/.test(cards[0].text) && /夜/.test(cards[0].text) && /膽氣第 \d+ 重/.test(cards[0].text) && /睡過 \d+ 夜/.test(cards[0].text) && /存於 \d\d\/\d\d/.test(cards[0].text), cards[0].text);
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
} catch (e) { checks2.push('CRASH start page: ' + e.message); }
result.checks.push(...checks2); result.failed = result.checks.filter(c => c.startsWith('FAIL') || c.startsWith('CRASH')).length;
console.log(result.checks.join('\n'));
console.log('fps', result.fps, 'failed', result.failed, 'of', result.checks.length);
await page.screenshot({ path: out + '/02-end.png' });
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
process.exit(errors.length || result.failed ? 1 : 0);
