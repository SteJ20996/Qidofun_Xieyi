// 桌面版的冒煙測試：真的開起 Electron，看遊戲載得起來、能開新島、存檔關掉重開還在。
// 用法：先 npm run copy（或 npm start 一次），Linux 沒螢幕時用 xvfb-run -a node smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require('playwright'); }
const electronPath = require('electron');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xieyi-desktop-'));
const checks = [], errors = [];
const ok = (name, cond, info) => checks.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined && !cond ? ' ' + JSON.stringify(info) : ''));
const launch = async () => {
  const exe = process.env.XIEYI_EXE;   // 給了打包好的執行檔就測它，沒給就用 node_modules 裡的 electron 開這個資料夾
  const app = await pw._electron.launch({ executablePath: exe || electronPath, args: exe ? ['--no-sandbox'] : [here, '--no-sandbox'], env: Object.assign({}, process.env, { XIEYI_USERDATA: userData }) });
  const page = await app.firstWindow(); page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForLoadState('load'); await page.waitForTimeout(600); return { app, page };
};
try {
  let { app, page } = await launch();
  const info = await page.evaluate(() => ({ title: document.title, start: !document.getElementById('start').classList.contains('hidden'), pad: document.getElementById('btn-pad').textContent, gp: typeof navigator.getGamepads, file: location.protocol }));
  ok('the shell opens the game from a local file with the start page showing', info.file === 'file:' && /山海有形/.test(info.title) && info.start, info);
  ok('the Gamepad API is there and the start page has 手柄設定', info.gp === 'function' && info.pad === '手柄設定', info);
  const ud = await app.evaluate(({ app }) => app.getPath('userData'));
  ok('saves go to the userData folder the test asked for', ud === userData, ud);
  await page.click('#btn-new'); await page.waitForFunction(() => window.XIEYI && window.XIEYI.game, null, { timeout: 15000 });
  const seed = await page.evaluate(() => { const g = window.XIEYI.game; g.save(); return g.world.seed; });
  ok('落筆 starts a new island and it can be saved', seed !== undefined, seed);
  await app.close();
  ({ app, page } = await launch());
  const back = await page.evaluate(() => ({ save: !!localStorage.getItem('xieyi.save.v5'), cards: document.getElementById('saves').textContent }));
  ok('after closing and opening again the save is still there', back.save && /島 #/.test(back.cards), back);
  const rect = await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; return { b: w.getBounds(), menu: w.isMenuBarVisible(), area: screen.getPrimaryDisplay().workAreaSize }; });
  // 1280×800；螢幕比這小（GitHub 的 Windows 測試機是 1024×768）就由系統縮到可用範圍內
  const fitW = Math.min(1280, rect.area.width), fitH = Math.min(800, rect.area.height);
  ok('a 1280×800 window (or as much of it as the screen holds) without a menu bar', Math.abs(rect.b.width - fitW) <= 16 && Math.abs(rect.b.height - fitH) <= 48 && !rect.menu, rect);
  await app.close();
} catch (e) { checks.push('CRASH ' + e.message); }
fs.rmSync(userData, { recursive: true, force: true });
for (const c of checks) console.log(c);
const failed = checks.filter(c => !c.startsWith('PASS')).length;
console.log('failed ' + failed + ' of ' + checks.length); console.log('ERRORS ' + JSON.stringify(errors));
process.exit(failed || errors.length ? 1 : 0);
