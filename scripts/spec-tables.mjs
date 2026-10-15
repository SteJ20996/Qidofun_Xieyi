// spec-tables.mjs —— 從 src/glyphs.js 直接產生 docs/SPEC.md 裡的五張資料表（字庫、物品、配方、灶、地標），免得文件與程式脫節
// 用法：node scripts/spec-tables.mjs            → 改寫 docs/SPEC.md 裡對應的表
//       node scripts/spec-tables.mjs --check    → 只檢查是否已是最新（不一致時結束碼 1）
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['src/util.js', 'src/glyphs.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, { DB, ITEMS, RECIPES, COOK, PLACES, ISLAND_R } = G;
const num = (v) => String(Math.round(v * 10000) / 10000);
const list = (o) => Object.entries(o).map(([k, v]) => k + (v > 1 ? '×' + v : '')).join('、');
const food = (f) => '食 ' + JSON.stringify(f).replace(/,/g, ', ').replace(/":/g, '": ');
const row = (cells) => '| ' + cells.map(c => String(c ?? '').replace(/\|/g, '｜')).join(' | ') + ' |';

// 字庫
const dbRows = Object.entries(DB).map(([ch, d]) => {
  const o = [];
  if (d.flam) o.push('可燃 ' + num(d.flam));
  if (d.food) o.push(food(d.food));
  if (d.bonus) for (const n in d.bonus) o.push('偶得 ' + n + '（' + num(d.bonus[n]) + '）');
  if (d.light) o.push('光 ' + num(d.light));
  if (d.gate) o.push('門（人過獸不過）');
  if (d.onWater) o.push('放在水上');
  if (d.net) o.push('漁網 ' + d.net + '×' + d.net);
  if (d.shelter) o.push('屋內');
  if (d.hp) o.push('命 ' + d.hp);
  if (d.atk) o.push('撲咬 ' + d.atk);
  if (d.bite) o.push('毒咬 ' + d.bite + '/秒');
  if (d.passive) o.push('不惹不咬');
  if (d.place) o.push('可放置');
  return row([ch, d.s, d.kind, num(d.walk ?? 1), d.yield ? list(d.yield) : '', d.time ?? '', d.need ? '需' + d.need : d.fast ? '用' + d.fast + '快一倍' : '', d.yield ? (d.to || '白') : '', d.regrow ?? '', o.join('；'), d.flavor]);
});
const dbTable = ['| 字 | 畫 | 類 | 行走 | 取得 | 秒 | 工具 | 取後變成 | 再生秒 | 其他 | 說明 |', '|---|---|---|---|---|---|---|---|---|---|---|', ...dbRows];

// 物品
const itemRows = Object.entries(ITEMS).map(([n, it]) => {
  const a = [];
  if (it.kind) a.push(it.kind);
  if (it.tile) a.push('放下成「' + it.tile + '」');
  if (it.food) a.push(food(it.food));
  if (it.slot) a.push('穿在「' + it.slot + '」');
  if (it.red) a.push('減傷 ' + Math.round(it.red * 100) + '%');
  if (it.warm) a.push('禦寒減半');
  if (it.iron) a.push('鐵件');
  if (it.tung) a.push('鎢鋼');
  if (it.tool) a.push('工具類型 ' + it.tool);
  if (it.dmg) a.push('傷害 ' + it.dmg);
  if (it.dur) a.push('耐久 ' + it.dur);
  if (it.light) a.push('光 ' + it.light);
  if (it.life) a.push(it.kind === 'wear' ? '壽命 ' + it.life + ' 日' : '手持夜裡燒 ' + it.life + ' 息');
  if (it.fuel) a.push('蠟燭 ' + it.fuel + ' 息');
  if (it.single) a.push('不疊');
  return row([n, it.s, a.join('；'), it.flavor]);
});
const itemTable = ['| 物品 | 畫 | 屬性 | 說明 |', '|---|---|---|---|', ...itemRows];

// 配方
const recRows = RECIPES.map((r, i) => {
  const out = r.choose ? (r.id === 'regrind' ? '重磨' : (r.id === 'grind' ? '磨礪' : '鍛造') + '：' + r.choose.join('／')) : r.out + (r.n > 1 ? ' ×' + r.n : '');
  return row([i + 1, r.cat, '`' + r.id + '`', out, list(r.need), r.sta, r.level ? '第 ' + r.level + ' 重' : '', r.note]);
});
const recTable = ['| # | 大類 | id | 產物 | 材料 | 耗力 | 需膽氣 | 說明 |', '|---|---|---|---|---|---|---|---|', ...recRows];

// 灶
const cookRows = Object.entries(COOK).map(([n, c]) => row([n + (c.n > 1 ? ' ×' + c.n : '') + (c.extra ? '＋' + list(c.extra) : ''), c.out + ' ×' + (c.k || 1), c.verb || '烤好了']));
const cookTable = ['| 放上旺灶 | 得到 | 文案動詞 |', '|---|---|---|', ...cookRows];

// 地標
const effect = { reveal: '揭示全島', shelter: '屋內', well: '井：每日命 +15', raft: '送竹筏', heal: '泉邊療傷', bricks: '送磚與石子', dragon: '放出龍', end: '結語' };
const placeRows = PLACES.map(pl => {
  const size = pl.template ? pl.template[0].length + '×' + pl.template.length + '（模板，井在正中）' : pl.w + '×' + pl.h;
  const where = pl.islet ? '小嶼上' : '半徑 ' + pl.r[0] + '–' + pl.r[1] + '×' + ISLAND_R + '，地形「' + pl.want + '」';
  return row([pl.name, '`' + pl.id + '`', size, where, pl.effect + '（' + effect[pl.effect] + '）', pl.text]);
});
const placeTable = ['| 地標 | id | 尺寸 | 位置 | 效果 | 讀到的話（全文） |', '|---|---|---|---|---|---|', ...placeRows];

// 換表：從表頭那一行起，連續的「|」行整段換掉
const file = path.join(ROOT, 'docs/SPEC.md');
let md = fs.readFileSync(file, 'utf8');
const swap = (head, table) => {
  const lines = md.split('\n'); const i = lines.findIndex(l => l.startsWith(head));
  if (i < 0) throw new Error('SPEC 裡找不到表頭：' + head);
  let j = i; while (j < lines.length && lines[j].startsWith('|')) j++;
  lines.splice(i, j - i, ...table); md = lines.join('\n');
};
swap('| 字 | 畫 |', dbTable); swap('| 物品 | 畫 |', itemTable); swap('| # |', recTable); swap('| 放上旺灶 |', cookTable); swap('| 地標 | id |', placeTable);
const counts = { db: Object.keys(DB).length, items: Object.keys(ITEMS).length, recipes: RECIPES.length };
md = md.replace(/### 3\.3 字庫（DB，\d+ 字）/, '### 3.3 字庫（DB，' + counts.db + ' 字）')
       .replace(/### 4\.1 物品（ITEMS，\d+ 項/, '### 4.1 物品（ITEMS，' + counts.items + ' 項')
       .replace(/### 4\.2 配方（RECIPES，\d+ 條/, '### 4.2 配方（RECIPES，' + counts.recipes + ' 條');
const old = fs.readFileSync(file, 'utf8');
if (process.argv.includes('--check')) { if (old !== md) { console.log('SPEC 的資料表不是最新，請跑 node scripts/spec-tables.mjs'); process.exit(1); } console.log('SPEC 資料表已是最新', counts); }
else { fs.writeFileSync(file, md); console.log(old === md ? '沒有變動' : '已更新 docs/SPEC.md', counts); }
