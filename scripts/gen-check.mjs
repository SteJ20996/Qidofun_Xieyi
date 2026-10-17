// 多種子生成檢查：每座島都要「玩得下去」——出生點走得到基本資源、八處地標都在且走得到、
// 山裡有煤有鐵、燈塔只有退潮走得到；v0.38 起另查：原本的陸地一格不動、陸地平均多四成五、外島五種都有。不用瀏覽器，直接在 Node 裡載入 util／glyphs／world。
// 用法：node scripts/gen-check.mjs [種子數=40] [起始種子=1]
import vm from 'node:vm';
import fs from 'node:fs';
for (const f of ['util', 'glyphs', 'world']) vm.runInThisContext(fs.readFileSync(new URL('../src/' + f + '.js', import.meta.url), 'utf8'), { filename: f + '.js' });
const G = globalThis.G, World = globalThis.World, DB = G.DB, DAY = World.DAY;
const N = +process.argv[2] || 40, S0 = +process.argv[3] || 1;
// v0.11 起島的面積加倍：可達範圍與礦的下限跟著加倍
const NEED = { '木林森': 30, '草': 60, '石山磊': 20, '礫': 8, '棉': 6, '麻': 3, '果': 4 }, ORE = { '煤': 32, '鐵': 32 }, REACH = 3000;
let bad = 0, sumOld = 0, sumNew = 0;

function reach(w, sp, dig) {      // 從出生點能走到的格子（用遊戲自己的 walkable，所以潮汐算在內）；dig 時山石礦也算能過（有鎬）
  const seen = new Set([sp.x + ',' + sp.y]), q = [[sp.x, sp.y]], R = G.HOME_R + 10;   // v0.38 島擴了，照本島的範圍
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || Math.abs(nx) > R || Math.abs(ny) > R) continue;
      if (w.walkable(nx, ny) || (dig && '山磊煤鐵'.indexOf(w.get(nx, ny)) >= 0)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return seen;
}
function touches(set, x0, y0, w0, h0) {   // 可達集合是否貼著這塊地標
  for (let j = -1; j <= h0; j++) for (let i = -1; i <= w0; i++) if (set.has((x0 + i) + ',' + (y0 + j))) return true;
  return false;
}
for (let seed = S0; seed < S0 + N; seed++) {
  const w = new World(seed), sp = w.findSpawn(), probs = [];
  if (w.places.length !== 8) probs.push('地標只有 ' + w.places.length + ' 處');
  w.time = DAY * 0.5; const low = reach(w, sp);
  w.time = DAY * 0.83; const high = reach(w, sp);
  if (low.size < REACH) probs.push('退潮可達範圍只有 ' + low.size + ' 格');
  // 可達範圍裡的資源（看底稿加差異層，灘以退潮算）
  const cnt = {}; for (const k of low) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = w.raw(x + dx, y + dy); for (const g in NEED) if (g.indexOf(c) >= 0) cnt[g] = (cnt[g] || 0) + 1; } }
  for (const g in NEED) if ((cnt[g] || 0) < NEED[g]) probs.push('可達的「' + g + '」只有 ' + (cnt[g] || 0) + '（要 ' + NEED[g] + '）');
  w.time = DAY * 0.5; const dug = reach(w, sp, true); for (const k of dug) { const c = w.raw(...k.split(',').map(Number)); if (ORE[c] !== undefined) cnt[c] = (cnt[c] || 0) + 1; }
  for (const g in ORE) if ((cnt[g] || 0) < ORE[g]) probs.push('挖得到的「' + g + '」只有 ' + (cnt[g] || 0) + '（要 ' + ORE[g] + '）');
  for (const pl of w.places) {
    const ok = pl.id === 'deng' ? touches(low, pl.x, pl.y, pl.w, pl.h) && !touches(high, pl.x, pl.y, pl.w, pl.h) : touches(low, pl.x, pl.y, pl.w, pl.h);
    if (!ok) probs.push(pl.id === 'deng' ? '燈塔不是「只有退潮走得到」（退潮 ' + touches(low, pl.x, pl.y, pl.w, pl.h) + '，漲潮 ' + touches(high, pl.x, pl.y, pl.w, pl.h) + '）' : '地標「' + pl.name + '」走不到');
  }
  if (w.steles.size !== 5) probs.push('碑只有 ' + w.steles.size + ' 塊');
  // v0.38：原本的陸地一格不動；擴出去的陸地；外島
  let oldLand = 0, newLand = 0, moved = 0;
  for (let y = -140; y <= 140; y++) for (let x = -140; x <= 140; x++) { const a = G.oldTile(x, y, seed), b = G.baseTile(x, y, seed); if (DB[a].kind !== 'water') { oldLand++; if (a !== b) moved++; } if (DB[b].kind !== 'water') newLand++; }
  if (moved) probs.push('原本的陸地有 ' + moved + ' 格變了');
  if (newLand < oldLand * 1.15) probs.push('陸地只多了 ' + Math.round((newLand / oldLand - 1) * 100) + '%');
  sumOld += oldLand; sumNew += newLand;
  const kinds = new Set(G.isles(seed).map(i => i.kind)); if (kinds.size < 5) probs.push('外島只有 ' + [...kinds].join('') + ' 幾種');
  if (probs.length) { bad++; console.log('種子 ' + seed + '：' + probs.join('；')); }
  else console.log('種子 ' + seed + '：好。可達 ' + low.size + ' 格，木 ' + cnt['木林森'] + ' 草 ' + cnt['草'] + ' 石 ' + cnt['石山磊'] + ' 棉 ' + cnt['棉'] + ' 麻 ' + cnt['麻'] + ' 果 ' + cnt['果'] + ' 煤 ' + cnt['煤'] + ' 鐵 ' + cnt['鐵']);
}
const ratio = sumNew / sumOld;
console.log('v0.38 本島陸地平均：' + Math.round(sumOld / N) + ' → ' + Math.round(sumNew / N) + ' 格（×' + ratio.toFixed(3) + '）');
if (Math.abs(ratio - 1.45) > 0.05) { bad++; console.log('陸地平均多了 ' + Math.round((ratio - 1) * 100) + '%，不是四成五上下'); }
console.log(bad ? ('有 ' + bad + ' 座島有問題') : ('全部 ' + N + ' 座島都玩得下去'));
process.exit(bad ? 1 : 0);
