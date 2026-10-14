// 冒烟测试：无头浏览器里跑一遍核心玩法（取字、研墨、灶、捉鱼、烤、造词、读碑、猎、木屋、冷热、死亡复活、存档），截图并检查报错。
// 用法：先 `python3 -m http.server 8123`（或 npx serve），再 `node scripts/smoke.mjs [url] [outdir]`
// 依赖 playwright：项目里没装就用全局的（npm i -g playwright）
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

  // —— 岛与碑
  ok('island edge is deep water', w.get(0, 75) === '淼' && w.get(-80, 0) === '淼', [w.get(0, 75), w.get(-80, 0)]);
  const steles = [...w.steles.values()];
  ok('five steles on land', steles.length === 5 && steles.every(s => w.get(s.x, s.y) === '碑'), steles.map(s => s.teach + '@' + s.x + ',' + s.y));
  r.spawn = [p.x, p.y, w.get(p.x, p.y)];

  // —— 走几步
  await press('KeyD', 600); await sleep(300);
  ok('walked', p.x !== r.spawn[0] || p.y !== r.spawn[1], [p.x, p.y]);

  // —— 取字入囊、研墨
  face(0, 1); w.set(T().x, T().y, '木');
  const ink0 = p.ink; g.pressGather(); await sleep(900);
  ok('absorb puts 木 into bag', g.count('木') === 1 && w.get(T().x, T().y) === '白', bag());
  ok('absorb does not give ink directly', p.ink === ink0, p.ink);
  selBag('木'); g.grind();
  ok('grind 木 gives 4 ink', p.ink === ink0 + 4 && g.count('木') === 0, p.ink);

  // —— 灶：土上写火
  p.ink = 40; selDict('土'); g.pressWrite(); await sleep(50);
  ok('wrote 土 on blank', w.get(T().x, T().y) === '土');
  selDict('火'); g.pressWrite(); await sleep(50);
  const stove = T();
  ok('火 on 土 makes lit 灶', w.get(stove.x, stove.y) === '灶' && w.stoveLit(stove.x, stove.y), w.stoveFuel(stove.x, stove.y));
  ok('灶 does not spread fire', !w.isBurning(stove.x, stove.y));
  // 添柴
  g.addItem('木', 2); selBag('木'); const fuel0 = w.stoveFuel(stove.x, stove.y); g.placeItem();
  ok('placing 木 on 灶 adds fuel', w.stoveFuel(stove.x, stove.y) > fuel0 && g.count('木') === 1, w.stoveFuel(stove.x, stove.y));

  // —— 捉鱼、烤鱼、吃
  const rnd = Math.random; Math.random = () => 0.1;
  face(1, 0); w.set(T().x, T().y, '水'); g.ents.add('鱼', T().x, T().y);
  g.pressGather(); await sleep(50);
  ok('caught 鱼', g.count('鱼') === 1, bag());
  face(0, 1); selBag('鱼'); g.placeItem(); await sleep(50);
  ok('鱼 on lit 灶 becomes 烤鱼', g.count('烤鱼') === 1 && g.count('鱼') === 0, bag());
  p.food = 50; selBag('烤鱼'); g.useItem();
  ok('eating 烤鱼 +40 饱', Math.round(p.food) === 90 && g.count('烤鱼') === 0, p.food);
  Math.random = rnd;

  // —— 造词：石 + 刀 = 石刀
  g.addItem('石', 1); selBag('石'); const inkC = p.ink; g.startCombine(); g.finishCombine('刀');
  ok('造词 石+刀=石刀 costs 2 ink', g.count('石刀') === 1 && p.ink === inkC - 2, bag());
  g.addItem('石', 1); selBag('石'); g.startCombine(); g.finishCombine('火');
  ok('non-word rejected', g.count('石') === 1 && !g.combine, bag());

  // —— 猎鹿（有石刀）
  face(-1, 0); w.set(T().x, T().y, '草'); g.ents.add('鹿', T().x, T().y, { calm: 9 });
  g.pressGather(); await sleep(50);
  ok('hunting 鹿 with 石刀 gives 肉×2', g.count('肉') === 2, bag());

  // —— 读碑学「把」，火 + 把 = 火把
  const st = steles.find(s => s.teach === '把');
  w.set(st.x + 1, st.y, '草'); p.x = p.rx = st.x + 1; p.y = p.ry = st.y; face(-1, 0);
  const mi = p.maxInk; g.pressGather(); await sleep(50);
  ok('reading stele teaches 把 and widens ink', p.known.indexOf('把') >= 0 && p.maxInk === mi + 10, [p.maxInk, p.known.join('')]);
  g.addItem('火', 1); selBag('火'); p.ink = 30; g.startCombine(); g.finishCombine('把');
  ok('造词 火+把=火把', g.count('火把') === 1, bag());

  // —— 木屋
  p.known.indexOf('屋') < 0 && p.known.push('屋');
  g.addItem('木', 1); selBag('木'); g.startCombine(); g.finishCombine('屋');
  ok('造词 木+屋=木屋', g.count('木屋') === 1, bag());
  face(0, 1); w.set(T().x, T().y, '白'); selBag('木屋'); g.placeItem(); await sleep(50);
  const hut = T();
  ok('placed 木屋 tile and set home', w.get(hut.x, hut.y) === '木屋' && p.home && p.home.x === hut.x, w.get(hut.x, hut.y));
  ok('beasts cannot stand in 木屋', !g.ents.canStand('虎', hut.x, hut.y, true) && !g.ents.canStand('鹿', hut.x, hut.y, false));

  // —— 冷与暖：子夜，远离火 → 暖下降；灶边 → 上升；火把减缓
  w.time = Math.floor(w.time / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.78;
  for (const [k] of w.stoves) w.stoves.set(k, 0);
  g.removeItem('火把', 1);
  p.warm = 80; await sleep(1200); const warmA = p.warm;
  ok('warmth drops at night away from fire', warmA < 79, warmA);
  g.addItem('火把', 1); p.warm = 80; await sleep(1200);
  ok('torch slows warmth loss and lights', p.warm > warmA && g.torchLit(), p.warm);
  w.set(p.x + 1, p.y, '灶'); w.addFuel(p.x + 1, p.y, 60); p.warm = 50; await sleep(1200);
  ok('warmth rises next to lit 灶', p.warm > 52, p.warm);
  ok('night tiger scared by torch', g.torchLit());

  // —— 死亡与复活：饿到命尽，囊落原地
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

  // —— 存档
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v2'));
  ok('save v2 has bag, stoves, vitals', sv && sv.v === 2 && Array.isArray(sv.player.bag) && sv.world.stoves && typeof sv.player.food === 'number');

  // —— 帧率
  let frames = 0; const t0 = performance.now(); await new Promise((res) => { const tick = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  r.fps = Math.round(frames / ((performance.now() - t0) / 1000));
  r.checks = checks; r.failed = checks.filter(c => c.startsWith('FAIL')).length;
  return r;
});
console.log(result.checks.join('\n'));
console.log('spawn', JSON.stringify(result.spawn), 'fps', result.fps, 'failed', result.failed);
await page.screenshot({ path: out + '/02-night.png' });
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
process.exit(errors.length || result.failed ? 1 : 0);
