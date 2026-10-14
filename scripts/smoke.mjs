// 冒烟测试：无头浏览器里跑一遍核心玩法，截图并检查报错。
// 用法：先 `python3 -m http.server 8123`（或 npx serve），再 `node scripts/smoke.mjs [url] [outdir]`
// 依赖全局安装的 playwright：NODE_PATH=$(npm root -g) node scripts/smoke.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
// 优先用项目里的 playwright，没有就用全局安装的
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;

const url = process.argv[2] || 'http://127.0.0.1:8123/index.html?autostart=1&seed=42';
const out = process.argv[3] || 'shots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.XIEYI && !window.XIEYI.game.paused, null, { timeout: 15000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out + '/01-day.png' });

const result = await page.evaluate(async () => {
  const g = XIEYI.game, p = g.player, w = g.world, r = {};
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const press = (code, ms) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); return sleep(ms || 30).then(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))); };
  r.spawn = [p.x, p.y]; r.spawnTile = w.get(p.x, p.y);
  // 1) 走几步
  await press('KeyD', 700); await sleep(300);
  r.afterWalk = [p.x, p.y];
  // 2) 面向一个可吸的格子：找一个相邻的非白字
  let target = null;
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const ch = w.get(p.x + dx, p.y + dy); if (XIEYI.game.world.info(p.x + dx, p.y + dy).absorb) { target = [dx, dy, ch]; break; } }
  r.absorbTarget = target;
  if (target) {
    p.fx = target[0]; p.fy = target[1];
    const ink0 = p.ink;
    g.pressAbsorb(); await sleep(1500);
    r.absorbed = { before: ink0, after: p.ink, tileNow: w.get(p.x + target[0], p.y + target[1]) };
    // 3) 在这张白纸上写木，再写木 → 林，再写木 → 森
    p.sel = p.known.indexOf('木');
    g.pressWrite(); await sleep(100); r.write1 = w.get(p.x + target[0], p.y + target[1]);
    g.pressWrite(); await sleep(100); r.write2 = w.get(p.x + target[0], p.y + target[1]);
    g.pressWrite(); await sleep(100); r.write3 = w.get(p.x + target[0], p.y + target[1]);
    r.inkAfterWrites = p.ink; r.known = p.known.join('');
    // 4) 人 + 木？先把森吸掉再写木，再写人 → 休
    g.pressAbsorb(); await sleep(1500);
    p.sel = p.known.indexOf('木'); g.pressWrite(); await sleep(50);
    p.sel = p.known.indexOf('人'); g.pressWrite(); await sleep(50);
    r.camp = w.get(p.x + target[0], p.y + target[1]); r.home = p.home;
    // 5) 火：把营地吸掉，写木，点火，看它烧
    g.pressAbsorb(); await sleep(1500);
    p.sel = p.known.indexOf('木'); g.pressWrite(); await sleep(50);
    p.sel = p.known.indexOf('火'); g.pressWrite(); await sleep(50);
    r.burning = w.isBurning(p.x + target[0], p.y + target[1]);
    // 6) 水克火：写水
    p.sel = p.known.indexOf('水'); const ev = g.evalWrite('水', p.x + target[0], p.y + target[1]); r.waterOnBurning = ev;
  }
  r.errorsSoFar = null; r.ink = p.ink; r.maxInk = p.maxInk; r.ents = g.ents.list.length; r.diffs = w.diff.size;
  r.fuseTableSize = XIEYI.game.constructor.length >= 0 ? G.FUSE.size : 0;
  return r;
});
console.log('RESULT', JSON.stringify(result, null, 1));
await page.waitForTimeout(800);
await page.screenshot({ path: out + '/02-after-actions.png' });

// 夜晚：把时间拨到子夜，放一盏明灯
await page.evaluate(() => { const g = XIEYI.game; g.world.time = Math.floor(g.world.time / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.78; const p = g.player; g.world.set(p.x + 2, p.y - 1, '明'); g.world.set(p.x - 3, p.y + 2, '火'); g.world.ignite(p.x - 3, p.y + 2); });
await page.waitForTimeout(1200);
await page.screenshot({ path: out + '/03-night.png' });

// 第二阶段：更多规则
const stage2 = await page.evaluate(async () => {
  const g = XIEYI.game, p = g.player, w = g.world, r = {};
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  // 帧率
  let frames = 0; const t0 = performance.now(); await new Promise((res) => { const tick = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  r.fps = Math.round(frames / ((performance.now() - t0) / 1000));
  // 水灭火：面前放一棵燃烧的木
  const tx = p.x + p.fx, ty = p.y + p.fy;
  w.set(tx, ty, '木'); w.ignite(tx, ty, 1); p.ink = 40;
  p.sel = p.known.indexOf('水'); g.pressWrite(); await sleep(50);
  r.douse = { burning: w.isBurning(tx, ty), tile: w.get(tx, ty) };
  // 虎：夜里把一只虎放在旁边，看它会不会扑过来偷墨
  g.world.time = Math.floor(g.world.time / XIEYI.DAY) * XIEYI.DAY + XIEYI.DAY * 0.78;
  g.ents.list = g.ents.list.filter(e => e.type !== '虎');
  for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) if (w.info(p.x + dx, p.y + dy).light) w.set(p.x + dx, p.y + dy, '白');
  w.burn.clear();   // 第一阶段的林火会把虎吓跑，先灭掉
  w.set(p.x + 2, p.y, '林'); w.set(p.x + 1, p.y, '林');
  const tiger = g.ents.add('虎', p.x + 2, p.y); tiger.moveT = 0; tiger.calm = 0;
  const inkBefore = p.ink; await sleep(2500);
  r.tiger = { inkBefore, inkAfter: p.ink, drops: g.ents.list.filter(e => e.type === '丶').length, tigerCalm: tiger.calm > 0 };
  // 口困虎：虎在哪就面向哪（若相邻）
  const d = { x: tiger.x - p.x, y: tiger.y - p.y };
  if (Math.max(Math.abs(d.x), Math.abs(d.y)) === 1) { p.fx = d.x; p.fy = d.y; p.sel = p.known.indexOf('口'); g.pressWrite(); await sleep(50); r.cage = tiger.cage; }
  else r.cage = 'tiger not adjacent: ' + JSON.stringify(d);
  // 口困虎（直接测）：把一只虎放在正前方
  g.ents.list = g.ents.list.filter(e => e.type !== '虎');
  p.fx = 1; p.fy = 0; w.set(p.x + 1, p.y, '林');
  const t2 = g.ents.add('虎', p.x + 1, p.y); t2.calm = 5; p.ink = 20;
  p.sel = p.known.indexOf('口'); g.pressWrite(); await sleep(50);
  r.cageDirect = { caged: t2.cage > 0, ink: p.ink };
  // 读碑：找最近的碑
  let best = null;
  const cx0 = Math.floor(p.x / 16), cy0 = Math.floor(p.y / 16);
  for (let cy = cy0 - 8; cy <= cy0 + 8; cy++) for (let cx = cx0 - 8; cx <= cx0 + 8; cx++) w.chunk(cx, cy);
  for (const [k, hint] of w.steles) { const [x, y] = k.split(',').map(Number); const dd = Math.hypot(x - p.x, y - p.y); if (!best || dd < best.d) best = { x, y, d: dd, hint }; }
  if (best) { const mi = p.maxInk; const sx = best.x, sy = best.y; w.set(sx + 1, sy, '草'); p.x = p.rx = sx + 1; p.y = p.ry = sy; p.fx = -1; p.fy = 0; g.pressAbsorb(); await sleep(50); r.stele = { maxInkBefore: mi, maxInkAfter: p.maxInk, read: p.readSteles.length }; }
  // 捞月：面前放一格水和一个月影，吸之；然后日+月=明
  w.set(p.x, p.y - 1, '水'); p.fx = 0; p.fy = -1; g.ents.add('月', p.x, p.y - 1, { life: 30 }); g.pressAbsorb(); await sleep(50);
  r.moon = { known: p.known.indexOf('月') >= 0, ink: p.ink };
  w.set(p.x, p.y - 1, '白'); p.ink = 30; p.known.indexOf('日') < 0 && p.known.push('日');
  p.sel = p.known.indexOf('月'); g.pressWrite(); await sleep(30); p.sel = p.known.indexOf('日'); g.pressWrite(); await sleep(30);
  r.ming = w.get(p.x, p.y - 1);
  // HUD 布局检查
  const box = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  r.layout = 'inklabel ' + box('inklabel').join('/') + ' status ' + box('status').join('/') + ' vw ' + innerWidth;
  r.fireTiles = w.burn.size; r.steleCount = w.steles.size;
  return r;
});
console.log('STAGE2', JSON.stringify(stage2, null, 1));
await page.waitForTimeout(600);
await page.screenshot({ path: out + '/04-stage2.png' });
await page.screenshot({ path: out + '/05-hud-left.png', clip: { x: 0, y: 0, width: 140, height: 380 } });

// 存档是否写入
const save = await page.evaluate(() => { XIEYI.game.save(); const s = JSON.parse(localStorage.getItem('xieyi.save.v1')); return s ? { seed: s.seed, diffs: Object.keys(s.world.diff).length, known: s.player.known.length } : null; });
console.log('SAVE', JSON.stringify(save));
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
process.exit(errors.length ? 1 : 0);
