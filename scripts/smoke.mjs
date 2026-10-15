// 冒煙測試：無頭瀏覽器裡跑一遍核心玩法（採集、製作、磨礪、放置、戰鬥、睡覺、發酵、鬼夜、地標、潮汐、存檔），截圖並檢查報錯。
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
  const toasts = () => document.getElementById('toasts').textContent;
  const hidden = (id) => document.getElementById(id).classList.contains('hidden');
  const goNextTo = (x, y) => { w.set(x - 1, y, '草'); p.x = p.rx = x - 1; p.y = p.ry = y; face(1, 0); };
  const setDay = (frac) => { w.time = Math.floor(w.time / DAY) * DAY + DAY * frac; };
  const until = async (cond, ms) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < (ms || 8000)) await sleep(40); return cond(); };
  const gather = async (ch) => { face(0, 1); w.set(T().x, T().y, ch); g.action = null; g.pressGather(); await until(() => !g.action, 12000); };

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
  g.ents.list = g.ents.list.filter(e => e.type !== '鬼');
  setDay(0.6); const dayBefore = g.day(); p.warm = 40; p.sta = 20; g.sleep(); await sleep(30);
  ok('sleeping in a bed skips to morning', g.day() === dayBefore + 1 && p.warm === 100 && p.sta === p.staMax && g.stats.nights === 1, [g.day(), p.warm]);
  setDay(0.6); const ghost = g.ents.add('鬼', p.x + 3, p.y, { moveT: 99 }); const t1 = w.time; g.sleep();
  ok('cannot sleep with a ghost nearby', w.time === t1, g.msgText); g.ents.remove(ghost);
  setDay(0.3); g.removeItem('果', 99); g.removeItem('肉', 99); g.removeItem('磚', 99); g.addItem('果', 5); p.bag.find(s => s.n === '果').d = g.day() - 15;
  w.time += DAY; await until(() => g.count('醉果') === 5, 3000);
  ok('fruit older than 15 nights ferments', g.count('醉果') === 5 && g.count('果') === 0, bag());
  setDay(0.6); p.hp = 80; hold('醉果'); g.useItem(); await sleep(30);
  ok('醉果 sleeps through the night, −15 hp, hangover', g.day() > 0 && Math.round(p.hp) === 65 && p.hangDay === g.day() && g.count('醉果') === 4, [p.hp, p.hangDay, g.day()]);
  p.hp = 50; p.food = 90; p.warm = 90; p.hurtT = 0; await sleep(1200);
  ok('no regen on the hangover day', p.hp <= 50.01, p.hp);
  p.hangDay = 0; await until(() => p.hp > 50.1, 4000);
  ok('hp regenerates slowly otherwise', p.hp > 50.1, p.hp);

  // ============ F. 鬼夜 ============
  p.hp = 100; p.hangDay = 0;
  w.time = DAY * 9 + DAY * 0.7;   // 第 10 日的夜 → 第十夜
  ok('night ten counts as ghost night', g.day() === 10 && g.nightNo() === 10 && g.ghostNight() && g.ghostCap() === 2, [g.day(), g.nightNo(), g.ghostCap()]);
  g.ents.ghostAcc = 10; await until(() => g.ents.count('鬼') >= 1, 6000);
  ok('ghosts spawn on night ten', g.ents.count('鬼') >= 1, g.ents.count('鬼'));
  face(1, 0); w.set(T().x, T().y, '草'); const gh = g.ents.add('鬼', T().x, T().y, { moveT: 0, atk: 0 }); const hp0 = p.hp; await sleep(400);
  ok('ghost attacks adjacent player', p.hp < hp0, [hp0, p.hp]);
  g.ents.list = g.ents.list.filter(e => e.type !== '鬼' || e === gh); gh.x = T().x; gh.y = T().y; gh.moveT = 99;
  hold('石劍'); p.atkT = 0; g.pressGather(); p.atkT = 0; gh.x = T().x; gh.y = T().y; g.pressGather();
  ok('two sword blows dispel a ghost and drop 魄', !g.ents.list.includes(gh) && g.count('魄') === 1, g.count('魄'));
  w.time = DAY * 10 + DAY * 0.12; await until(() => g.ents.count('鬼') === 0, 5000);
  ok('ghosts vanish at dawn', g.ents.count('鬼') === 0);
  w.time = DAY * 2 + DAY * 0.7;
  ok('no ghosts before night ten', !g.ghostNight());

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
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v4'));
  ok('save v4 keeps stamina, tools and places', sv && sv.v === 4 && typeof sv.player.sta === 'number' && sv.player.bag.some(s => s.dur !== undefined) && sv.player.places.ta === 2);

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
