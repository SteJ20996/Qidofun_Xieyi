// glyphs.js —— 字庫、配方、工具、地貌生成、碑與地標
// 這是整個遊戲的「物理法則」：每個字是什麼、能不能走、會不會燒、取了得到什麼，以及東西怎麼造出來。
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U;

  // 墨色：水墨畫裡基本只用墨，偶爾點一筆花青（水）、硃砂（火、花）、赭石（木構）
  const INK = {
    black: '#1c1a17', water: '#2f5878', deep: '#223f5a', rock: '#4a4f5c', snow: '#7f8ea3',
    plant: '#263428', forest: '#1b261d', red: '#b4392a', gold: '#9c6d12', brown: '#5a3e2b',
    sand: '#8d7a4b', ash: '#6f6a66', soil: '#6b4a2f', field: '#4f5a2f', beast: '#2a2320', ghost: '#3b3550', cotton: '#6f6a5a', brick: '#7a4a35'
  };

  // 字庫（地上的格子）。欄位：
  //   s      筆畫數（台灣標準，艹算四畫）
  //   walk   通行速度倍率，0 = 不可通行
  //   kind   blank 白紙 / ground 地面 / plant 植物 / water 水 / rock 山石 / fire 火 / object 造物 / place 地標 / beast 獸
  //   flam   可燃度；light 夜間照亮半徑；shelter 站在其上即為屋內；gate 人能過獸不能
  //   yield  取它得到什麼 { 物: 數 }；time 徒手要幾息；fast 用哪種工具快一倍；need 非用哪種工具不可；to 取走後格子變成什麼（預設白）
  //   place  能不能從囊中放回地上；food 可食
  const DB = {
    '白': { s: 5, walk: 1.0, kind: 'blank', flavor: '未著一墨的紙。天地有常，舊字終將自還。' },
    // —— 地面
    '田': { s: 5, walk: 1.5, kind: 'ground', ink: INK.field, yield: { '土': 1 }, time: 1.0, flavor: '耕過的地，走得快。' },
    '土': { s: 3, walk: 1.0, kind: 'ground', ink: INK.soil, yield: { '土': 1 }, time: 1.0, place: true, flavor: '泥土。二土一草可成磚；用鋤鋤之成田。' },
    '沙': { s: 7, walk: 1.2, kind: 'ground', ink: INK.sand, yield: { '沙': 1 }, time: 0.8, place: true, flavor: '沙。' },
    '礫': { s: 20, walk: 1.0, kind: 'ground', ink: INK.rock, yield: { '石子': 2 }, time: 1.0, to: '沙', flavor: '碎石地。石子是磨刀石。' },
    '灰': { s: 6, walk: 1.0, kind: 'ground', ink: INK.ash, flavor: '火後餘燼，久之化土。' },
    '雪': { s: 11, walk: 0.7, kind: 'ground', ink: INK.snow, flavor: '高處積雪，寒。' },
    '路': { s: 13, walk: 1.4, kind: 'ground', ink: INK.sand, flavor: '走的人多了，也便成了路。' },
    '灘': { s: 22, walk: 1.2, kind: 'ground', ink: INK.sand, flavor: '潮退則沙，潮漲則水。' },
    // —— 植物
    '草': { s: 10, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.plant, yield: { '草': 1 }, time: 0.5, place: true, flavor: '野草。做磚、搓火把、合藥都要它。' },
    '花': { s: 8, walk: 1.0, kind: 'plant', flam: 0.4, ink: INK.red, yield: { '花': 1 }, time: 0.5, place: true, flavor: '草間一點硃。' },
    '棉': { s: 12, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.cotton, yield: { '棉': 2 }, time: 0.8, to: '草', place: true, flavor: '野棉花。六團棉、兩塊木，是一張床。' },
    '木': { s: 4, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.plant, yield: { '木': 1 }, time: 1.4, fast: '斧', place: true, flavor: '一棵樹。斧伐之快一倍。' },
    '果': { s: 8, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.red, yield: { '果': 2 }, time: 0.8, to: '木', place: true, food: { eat: 20 }, flavor: '野果樹。摘之可食；果在囊裡放過十五夜會醉。' },
    '竹': { s: 6, walk: 0.7, kind: 'plant', flam: 0.7, ink: INK.plant, yield: { '竹': 2 }, time: 1.2, fast: '斧', place: true, flavor: '竹。可為筏、可為魚梁。' },
    '林': { s: 8, walk: 0.6, kind: 'plant', flam: 0.7, ink: INK.forest, yield: { '木': 2 }, time: 2.4, fast: '斧', flavor: '雙木成林。' },
    '森': { s: 12, walk: 0.5, kind: 'plant', flam: 0.8, ink: INK.forest, yield: { '木': 3 }, time: 3.4, fast: '斧', flavor: '三木成森，虎踞其中。' },
    // —— 水
    '水': { s: 4, walk: 0, kind: 'water', ink: INK.water, flavor: '淺水。有筏可渡，可架橋。' },
    '淼': { s: 12, walk: 0, kind: 'water', ink: INK.deep, flavor: '深水。筏亦不可渡。' },
    // —— 山石
    '石': { s: 5, walk: 0.7, kind: 'rock', ink: INK.rock, yield: { '石': 1 }, time: 3.0, bonus: { '石子': 0.3 }, fast: '鎬', place: true, flavor: '石地。鎬採之快一倍，偶得石子。' },
    '磊': { s: 15, walk: 0, kind: 'rock', ink: INK.rock, yield: { '石': 3 }, time: 3.0, need: '鎬', flavor: '三石為磊。要用鎬。' },
    '山': { s: 3, walk: 0, kind: 'rock', ink: INK.rock, yield: { '石': 2 }, time: 2.0, need: '鎬', to: '石', flavor: '山不可越，鎬可鑿之。' },
    // —— 火
    '火': { s: 4, walk: 0, kind: 'fire', light: 2.5, ink: INK.red, flavor: '火。虎畏之，鬼不畏。' },
    '炎': { s: 8, walk: 0, kind: 'fire', light: 3.5, ink: INK.red, flavor: '二火為炎。' },
    '焱': { s: 12, walk: 0, kind: 'fire', light: 4.5, ink: INK.red, flavor: '三火為焱，萬物焦土。' },
    // —— 造物（從囊中放到地上）
    '灶': { s: 7, walk: 0, kind: 'object', ink: INK.red, yield: { '灶': 1 }, time: 1.0, place: true, flavor: '六石為灶。烤食、取暖；添木續火。' },
    '磚': { s: 16, walk: 0, kind: 'object', ink: INK.brick, yield: { '磚': 1 }, time: 4.0, fast: '鎬', place: true, flavor: '二土一草成磚。獸與鬼不得過。鎬拆之快。' },
    '床': { s: 7, walk: 0, kind: 'object', ink: INK.brown, yield: { '床': 1 }, time: 1.0, place: true, flavor: '六團棉、兩塊木。夜裡面向它按 R，一覺到天明。' },
    '門': { s: 8, walk: 1.0, kind: 'object', gate: true, ink: INK.brown, yield: { '門': 1 }, time: 1.0, place: true, flavor: '人能過，獸與鬼不能。面向它按 E 可問路。' },
    '燈': { s: 16, walk: 0, kind: 'object', light: 5, ink: INK.gold, yield: { '燈': 1 }, time: 1.0, place: true, flavor: '石與火把成燈，長明不滅。島外那盞最遠。' },
    '橋': { s: 16, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, yield: { '橋': 1 }, time: 1.0, place: true, onWater: true, flavor: '架在水上的橋。' },
    '漁': { s: 14, walk: 0, kind: 'object', ink: INK.water, yield: { '漁': 1 }, time: 1.0, place: true, onWater: true, flavor: '魚梁。放在水上，隔一陣子就有魚，面向它按 E 取。' },
    '碑': { s: 13, walk: 0, kind: 'object', ink: INK.black, flavor: '古碑，刻著活下去的法子。讀之，力氣漸長。' },
    '囊': { s: 22, walk: 0, kind: 'object', ink: INK.black, flavor: '一個落下的袋子。' },
    '牆': { s: 17, walk: 0, kind: 'object', ink: INK.brown, yield: { '石': 1 }, time: 3.0, fast: '鎬', flavor: '村裡的殘牆。' },
    // —— 地標（大字）
    '塔': { s: 13, walk: 0, kind: 'place', ink: INK.black, flavor: '從塔上能看見整張紙。' },
    '寺': { s: 6, walk: 1.0, kind: 'place', shelter: true, ink: INK.brown, flavor: '寺裡安靜，虎與鬼不敢進。' },
    '船': { s: 11, walk: 0, kind: 'place', ink: INK.brown, flavor: '擱淺的船。' },
    '泉': { s: 9, walk: 0, kind: 'place', ink: INK.water, flavor: '白水為泉。傍邊可療傷。' },
    '墓': { s: 14, walk: 0, kind: 'place', ink: INK.rock, flavor: '埋著寫錯的字。' },
    '洞': { s: 9, walk: 0, kind: 'place', ink: INK.black, flavor: '黑處藏著龍。' },
    '井': { s: 4, walk: 0, kind: 'place', ink: INK.water, flavor: '井裡有水，水裡有月。' },
    // —— 獸
    '鳥': { s: 11, kind: 'beast', ink: INK.beast, hp: 1, flavor: '飛鳥，見人則起，捉不住。' },
    '魚': { s: 11, kind: 'beast', ink: INK.water, hp: 1, food: { eat: 15, hurt: 5 }, flavor: '游魚。生食傷身，烤之則美。' },
    '鹿': { s: 11, kind: 'beast', ink: INK.beast, hp: 1, flavor: '林間鹿，見人則走，鹿過處塵土飛揚。有刃可獵，得肉。' },
    '虎': { s: 8, kind: 'beast', ink: INK.beast, hp: 3, flavor: '森中虎，夜行，畏火與光。劍兩下，刀三下。' },
    '鬼': { s: 10, kind: 'beast', ink: INK.ghost, hp: 4, flavor: '第十夜起夜行。畏劍，不畏光。磚與門擋得住。日出則散。' },
    '龍': { s: 16, kind: 'beast', light: 3, ink: INK.red, hp: 9, flavor: '洞中之龍。隨你同行，夜能照路，虎與鬼不敢近。' },
  };
  // 視覺層級：底紋類的字畫得小而淡，樹、山、水才是「主角」——像水墨畫裡的皴與點
  const VIS = { '草': [0.6, 0.42], '花': [0.62, 0.8], '棉': [0.75, 0.85], '沙': [0.58, 0.5], '礫': [0.62, 0.6], '田': [0.78, 0.6], '土': [0.6, 0.5], '灰': [0.6, 0.5], '雪': [0.7, 0.55],
    '水': [0.82, 0.8], '淼': [0.95, 0.9], '石': [0.72, 0.85], '山': [1.12, 1], '木': [0.9, 1], '果': [0.9, 1], '竹': [0.85, 0.95], '林': [1.0, 1], '森': [1.08, 1],
    '火': [0.9, 1], '炎': [1.0, 1], '焱': [1.1, 1], '灶': [0.95, 1], '磚': [0.95, 1], '碑': [1.05, 1], '囊': [0.9, 1],
    '路': [0.55, 0.45], '牆': [0.9, 0.9], '門': [0.85, 0.9], '井': [0.9, 1] };
  for (const ch in DB) {
    const d = DB[ch];
    d.vis = VIS[ch] || [0.95, 1];
    if (d.walk === undefined) d.walk = 1;
    if (d.flam === undefined) d.flam = 0;
    if (d.light === undefined) d.light = 0;
    if (!d.ink) d.ink = INK.black;
    d.ch = ch;
  }

  // 囊中之物（不是格子的東西）。工具：tool 類別、dmg 傷害、dur 耐久
  const ITEMS = {
    '石子': { s: 8, kind: 'item', flavor: '磨刀石。磨礪成工具，或重磨舊工具。' },
    '肉': { s: 6, kind: 'food', food: { eat: 20, hurt: 8 }, flavor: '生肉。生食傷身，烤之則美。' },
    '烤魚': { s: 21, kind: 'food', food: { eat: 40 }, flavor: '灶上烤的魚。香。' },
    '烤肉': { s: 16, kind: 'food', food: { eat: 55 }, flavor: '灶上烤的肉。更香。' },
    '醉果': { s: 23, kind: 'food', food: { sleep: true, eat: 10 }, flavor: '放過十五夜的果子，醉了。吃了昏睡到天明，醒來傷身。' },
    '藥': { s: 19, kind: 'food', food: { heal: 35 }, flavor: '草三果一合成的藥。療傷。' },
    '衣': { s: 6, kind: 'wear', flavor: '棉衣。囊中有之，禦寒減半。' },
    '竹筏': { s: 18, kind: 'tool', flavor: '囊中有筏，可行於淺水，捉魚更易。' },
    '火把': { s: 11, kind: 'tool', life: 180, flavor: '夜裡自燃，照路三格，禦寒。燃盡即無。' },
    '魄': { s: 15, kind: 'item', flavor: '鬼散時留下的一點魄。還不知道有什麼用。' },
    '石刀': { s: 7, kind: 'tool', tool: '刀', dmg: 1, dur: 40, flavor: '獵鹿一刀，打虎三刀。' },
    '石鎬': { s: 23, kind: 'tool', tool: '鎬', dmg: 1, dur: 40, flavor: '鑿山採石、拆磚，快一倍。' },
    '石鋤': { s: 20, kind: 'tool', tool: '鋤', dmg: 1, dur: 40, flavor: '面向土按 F，鋤之成田。' },
    '石劍': { s: 20, kind: 'tool', tool: '劍', dmg: 2, dur: 40, flavor: '打虎兩劍，斬鬼兩劍。' },
    '石斧': { s: 13, kind: 'tool', tool: '斧', dmg: 1, dur: 40, flavor: '伐木伐竹快一倍。' }
  };
  const TOOL_NAMES = { '刀': '石刀', '鎬': '石鎬', '鋤': '石鋤', '劍': '石劍', '斧': '石斧' };
  function item(name) { return ITEMS[name] || DB[name] || null; }
  const COOK = { '魚': '烤魚', '肉': '烤肉' };

  // 配方（製作消耗體力）
  const RECIPES = [
    { id: 'brick', out: '磚', n: 2, need: { '土': 2, '草': 1 }, sta: 3, note: '獸與鬼不得過，砌一圈留一扇門' },
    { id: 'door', out: '門', n: 1, need: { '木': 3 }, sta: 4, note: '人能過，獸與鬼不能' },
    { id: 'bed', out: '床', n: 1, need: { '棉': 6, '木': 2 }, sta: 10, note: '夜裡面向它按 R，一覺到天明' },
    { id: 'torch', out: '火把', n: 2, need: { '木': 1, '草': 2 }, sta: 2, note: '夜裡自燃，照路、禦寒' },
    { id: 'lamp', out: '燈', n: 1, need: { '石': 2, '火把': 1 }, sta: 4, note: '放在地上，長明不滅' },
    { id: 'stove', out: '灶', n: 1, need: { '石': 6 }, sta: 6, note: '烤魚烤肉、取暖；添木續火' },
    { id: 'grind', out: null, need: { '石': 1, '石子': 1, '木': 1 }, sta: 8, note: '磨礪：選刀、鎬、鋤、劍、斧', choose: ['石刀', '石鎬', '石鋤', '石劍', '石斧'] },
    { id: 'regrind', out: null, need: { '石子': 1 }, sta: 3, note: '重磨手中的工具，耐久復滿', regrind: true },
    { id: 'cloth', out: '衣', n: 1, need: { '棉': 4 }, sta: 6, note: '禦寒減半' },
    { id: 'med', out: '藥', n: 1, need: { '草': 3, '果': 1 }, sta: 3, note: '療傷 +35' },
    { id: 'bridge', out: '橋', n: 2, need: { '木': 4 }, sta: 5, note: '架在淺水上' },
    { id: 'raft', out: '竹筏', n: 1, need: { '竹': 6 }, sta: 8, note: '可行於淺水' },
    { id: 'weir', out: '漁', n: 1, need: { '竹': 4, '草': 2 }, sta: 5, note: '放在水上，隔一陣子有魚' }
  ];

  // ---------- 一紙之島 ----------
  const ISLAND_R = 60;       // 島的半徑（格）；越往外越深，最外是淼
  const isletCache = {};
  function islet(seed) {
    if (isletCache[seed]) return isletCache[seed];
    const a = U.rand2(3, 9, seed) * Math.PI * 2, L = ISLAND_R * 1.14;
    const cx = Math.round(Math.cos(a) * L), cy = Math.round(Math.sin(a) * L);
    const len = Math.hypot(cx, cy);
    return (isletCache[seed] = { cx, cy, ux: cx / len, uy: cy / len, len });
  }
  function fields(x, y, seed) {
    const dd = Math.hypot(x, y) / ISLAND_R;
    let h = U.fbm(x / 64, y / 64, seed, 5);
    h = h - U.smoothstep(0.55, 1.0, dd) * 0.6 + (1 - U.smoothstep(0, 0.3, dd)) * 0.06;
    const m = U.fbm(x / 48 + 300, y / 48 - 300, seed + 17, 4);
    const t = U.fbm(x / 150 - 700, y / 150 + 700, seed + 29, 3);
    return { h, m, t, dd };
  }
  function naturalTile(x, y, seed) {
    const { h, m, t } = fields(x, y, seed);
    const d = U.rand2(x, y, seed + 5);

    if (h < 0.33) return '淼';
    if (h < 0.395) return '水';
    if (h < 0.415) return d < 0.8 ? '沙' : d < 0.93 ? '礫' : '石';
    if (h > 0.69) return d < 0.75 ? '雪' : '山';
    if (h > 0.645) return d < 0.72 ? '山' : '石';
    if (h > 0.615) return d < 0.4 ? '石' : d < 0.5 ? '礫' : (m > 0.5 ? '木' : '草');

    // 平原與丘陵：由濕度決定植被
    if (m < 0.36) {
      if (t > 0.56) return d < 0.9 ? '沙' : d < 0.96 ? '礫' : '石';          // 乾熱：荒漠
      return d < 0.05 ? '石' : d < 0.1 ? '木' : d < 0.14 ? '棉' : '草';         // 乾冷：疏草，有野棉
    }
    if (m < 0.50) {
      const f = U.fbm(x / 20 + 90, y / 20 + 90, seed + 41, 2);
      if (f > 0.62) return d < 0.05 ? '果' : '田';             // 成片的田，田邊有果樹
      if (d < 0.05) return '果';
      if (d < 0.09) return '花';
      if (d < 0.14) return '棉';                                // 野棉花
      if (d < 0.2) return '木';
      return '草';
    }
    if (m < 0.60) return d < 0.05 ? '果' : d < 0.5 ? '木' : d < 0.78 ? '林' : d < 0.82 ? '棉' : '草';   // 疏林
    if (m < 0.665) {
      if (t > 0.56 && d < 0.55) return '竹';                     // 溫濕：竹林
      return d < 0.6 ? '林' : '木';
    }
    return d < 0.62 ? '森' : '林';                                // 深林
  }
  function baseTile(x, y, seed) {
    const il = islet(seed);
    const di = Math.hypot(x - il.cx, y - il.cy);
    if (di <= 4.3) return di < 2.4 ? (U.rand2(x, y, seed + 5) < 0.12 ? '花' : '草') : '沙';
    const nat = naturalTile(x, y, seed);
    // 潮道：主島與小嶼之間的一條淺灘；山裡則是一道石徑
    const proj = x * il.ux + y * il.uy, perp = Math.abs(x * il.uy - y * il.ux);
    if (perp <= 1.3 && proj > 2 && proj < il.len - 3.5) {
      if (DB[nat].kind === 'water') return '灘';
      if (nat === '山') return '石';
    }
    return nat;
  }

  // 五塊碑，由近到遠各講一個活下去的法子；讀碑力氣上限 +10
  const STELES = [
    { r: 0.26, hint: '六團棉、兩塊木，是一張床。夜裡面向它按 R，一覺到天明；附近有鬼則睡不著。' },
    { r: 0.42, hint: '二土一草成磚。砌一圈，留一扇門，獸與鬼不得入。門要用木三。' },
    { r: 0.56, hint: '石子磨石，再加一根木，可成刀、鎬、鋤、劍、斧。山要用鎬，鬼要用劍。石子可重磨舊工具。' },
    { r: 0.70, hint: '第十夜起，鬼夜行，不畏火光，日出則散。砌磚、造門、磨劍，趕在第十夜之前。' },
    { r: 0.83, hint: '野果久藏則醉。醉果可以昏睡過夜，醒來傷身，當日不回血。' }
  ];
  function spiralFind(tx, ty, maxR, test) {
    for (let rr = 0; rr < maxR; rr++) {
      for (let k = -rr; k <= rr; k++) {
        for (const [x, y] of [[tx + k, ty - rr], [tx + k, ty + rr], [tx - rr, ty + k], [tx + rr, ty + k]]) {
          if (test(x, y)) return [x, y];
        }
      }
    }
    return null;
  }
  function stelePlan(seed) {
    const out = [];
    STELES.forEach((s, i) => {
      const a = (i / STELES.length) * Math.PI * 2 + U.rand2(i, 7, seed) * 1.1;
      const tx = Math.round(Math.cos(a) * s.r * ISLAND_R), ty = Math.round(Math.sin(a) * s.r * ISLAND_R);
      const found = spiralFind(tx, ty, 40, (x, y) => { const d = DB[baseTile(x, y, seed)]; return d.walk > 0 && d.kind !== 'water'; });
      if (found) out.push({ x: found[0], y: found[1], hint: s.hint });
    });
    return out;
  }

  // 八處地標。每處一段話，連起來是一個小故事：這座島是誰寫的。
  const VILLAGE = ['牆牆門牆牆', '牆草草草牆', '門草井草門', '牆草草草牆', '牆牆門牆牆'];
  const PLACES = [
    { id: 'ta', ch: '塔', name: '塔', w: 2, h: 2, r: [0.30, 0.52], want: 'high', effect: 'reveal',
      text: '從塔上能看見整張紙。我在這裡寫了一個「望」字，先生用硃筆把它圈起來了，說：字可以望嗎？我說可以。' },
    { id: 'si', ch: '寺', name: '寺', w: 2, h: 2, r: [0.40, 0.68], want: 'forest', effect: 'shelter',
      text: '寺裡很安靜，虎不敢進來，鬼也不敢。先生說，字寫得靜，心就靜。我在這裡抄了一百個「靜」字，一個也沒留下。' },
    { id: 'cun', name: '村', template: VILLAGE, r: [0.28, 0.55], want: 'grass', effect: 'well',
      text: '村裡沒有人。人都在字典裡。井裡有水，水裡有月，月裡有——我還沒想好。對著門問，門會指路。' },
    { id: 'chuan', ch: '船', name: '船', w: 2, h: 1, r: [0.74, 0.96], want: 'beach', effect: 'raft',
      text: '這條船是我畫的。先生說船字不是這樣寫，可我見過的船就是這樣。船裡有一隻筏子，你拿去。' },
    { id: 'quan', ch: '泉', name: '泉', w: 1, h: 1, r: [0.34, 0.66], want: 'forest', effect: 'heal',
      text: '泉是水從石頭裡出來，像字從筆裡出來。鹿傍晚都會來，牠們不怕我，因為我也是字。' },
    { id: 'mu', ch: '墓', name: '墓', w: 1, h: 1, r: [0.40, 0.72], want: 'grass', effect: 'bricks',
      text: '這裡埋著我寫錯的字。先生說，錯字也能砌牆，別扔。我砌了幾塊磚，你拿去。' },
    { id: 'dong', ch: '洞', name: '洞', w: 1, h: 1, r: [0.48, 0.86], want: 'mountain', effect: 'dragon',
      text: '洞裡黑。先生說，黑處藏著龍。我不信。你去看看，看見了，牠就跟你走。' },
    { id: 'deng', ch: '燈', name: '燈', w: 1, h: 2, islet: true, effect: 'end',
      text: '燈最遠。潮退了才走得到。我把名字寫在這裡，可先生說名字不能寫在紙上，會被風吹走。那就寫在你心裡吧。你來了，就算讀完了這張紙。' }
  ];
  function footprintOk(x0, y0, w, h, seed, want, taken) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = x0 + i, y = y0 + j;
      if (taken.has(x + ',' + y)) return false;
      const ch = baseTile(x, y, seed), d = DB[ch];
      if (want === 'high') { if ('石礫草木田'.indexOf(ch) < 0 || fields(x, y, seed).h < 0.58) return false; }
      else if (want === 'forest') { if ('林木森竹草果棉'.indexOf(ch) < 0) return false; }
      else if (want === 'grass') { if ('草田花木果棉'.indexOf(ch) < 0) return false; }
      else if (want === 'beach') { if (ch !== '沙' && ch !== '礫') return false; }
      else if (want === 'mountain') {
        if ('石礫草木'.indexOf(ch) < 0) return false;
        let near = false; for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (baseTile(x + dx, y + dy, seed) === '山') near = true;
        if (!near) return false;
      } else if (d.walk <= 0) return false;
    }
    return true;
  }
  function placePlan(seed, taken) {
    const out = [], il = islet(seed);
    PLACES.forEach((pl, i) => {
      const w = pl.template ? pl.template[0].length : pl.w, h = pl.template ? pl.template.length : pl.h;
      let found = null;
      if (pl.islet) found = [il.cx, il.cy - 1];
      else {
        const a0 = U.rand2(i, 13, seed) * Math.PI * 2;
        outer: for (let step = 0; step < 24 && !found; step++) {
          const a = a0 + step * 0.61803 * Math.PI * 2;          // 黃金角散開
          for (let rf = pl.r[0]; rf <= pl.r[1]; rf += 0.06) {
            const tx = Math.round(Math.cos(a) * rf * ISLAND_R), ty = Math.round(Math.sin(a) * rf * ISLAND_R);
            const hit = spiralFind(tx, ty, 7, (x, y) => footprintOk(x, y, w, h, seed, pl.want, taken));
            if (hit) { found = hit; break outer; }
          }
        }
      }
      if (!found) return;
      const place = Object.assign({}, pl, { x: found[0], y: found[1], w, h });
      out.push(place);
      for (let j = -3; j < h + 3; j++) for (let i2 = -3; i2 < w + 3; i2++) taken.add((found[0] + i2) + ',' + (found[1] + j));
    });
    return out;
  }

  // 地貌名（給狀態列用）
  function biomeName(ch) {
    return ({ '淼': '深水', '水': '淺水', '沙': '沙地', '礫': '碎石地', '石': '石灘', '山': '群山', '雪': '雪原',
      '草': '草原', '花': '花野', '棉': '棉田', '木': '疏林', '果': '果林', '林': '林地', '森': '深林', '竹': '竹林', '田': '田野',
      '土': '荒土', '灰': '焦土', '白': '白紙', '火': '火場', '炎': '火場', '焱': '火場', '灶': '灶邊', '磚': '磚牆', '床': '床邊',
      '燈': '燈下', '橋': '橋上', '漁': '魚梁', '碑': '古碑', '囊': '囊', '路': '小路', '塔': '塔下', '寺': '寺中', '船': '船邊',
      '泉': '泉邊', '墓': '墓前', '洞': '洞口', '井': '井邊', '牆': '村中', '門': '門口' })[ch] || ch;
  }

  root.G = { INK, DB, ITEMS, TOOL_NAMES, RECIPES, COOK, item, baseTile, fields, islet, stelePlan, placePlan, PLACES, biomeName, ISLAND_R };
})();
