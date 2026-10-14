// glyphs.js —— 字庫、詞表、合字表、地貌生成規則、石碑
// 這是整個遊戲的"物理法則"：每個字是什麼、能不能走、會不會燒、值多少墨，字與字如何相合，字與字如何成詞。
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U;

  // 墨色：水墨畫裡基本只用墨，偶爾點一筆花青（水）、硃砂（火、花）、赭石（木構）
  const INK = {
    black: '#1c1a17', water: '#2f5878', deep: '#223f5a', rock: '#4a4f5c', snow: '#7f8ea3',
    plant: '#263428', forest: '#1b261d', red: '#b4392a', gold: '#9c6d12', brown: '#5a3e2b',
    sand: '#8d7a4b', ash: '#6f6a66', soil: '#6b4a2f', field: '#4f5a2f', beast: '#2a2320'
  };

  // 字庫。字段含義：
  //   s      筆畫數（= 這個字含有的墨量）
  //   walk   通行速度倍率，0 = 不可通行
  //   kind   blank 白紙 / ground 地面 / plant 植物 / water 水 / rock 山石 / fire 火 / object 造物 / radical 部件 / beast 獸 / item 物 / drop 墨滴
  //   flam   可燃度 (0~1)
  //   light  夜間照亮半徑（格）
  //   learn  吸收或合成後能否記入字典
  //   absorb 能否被吸入囊中
  //   tile   能否直接寫在白紙上
  //   food   可食：{ eat 飽, hurt 傷, heal 療 }
  //   shelter 站在其上即為屋內
  const DB = {
    '白': { s: 5, walk: 1.0, kind: 'blank', learn: false, absorb: false, tile: false, flavor: '未著一墨的紙。天地有常，舊字終將自還。' },
    // —— 地面
    '田': { s: 5, walk: 1.5, kind: 'ground', ink: INK.field, flavor: '灌土為田，行路如飛。田上植木，可以結果。' },
    '土': { s: 3, walk: 1.0, kind: 'ground', ink: INK.soil, flavor: '厚德載物。久之生草。火在土上，是為灶。' },
    '沙': { s: 7, walk: 1.2, kind: 'ground', ink: INK.sand, flavor: '白日照沙，可得「日」。' },
    '灰': { s: 6, walk: 1.0, kind: 'ground', ink: INK.ash, flavor: '火後餘燼，久之化土。' },
    '雪': { s: 11, walk: 0.7, kind: 'ground', ink: INK.snow, flavor: '高處積雪，寒。遇火成水。' },
    // —— 植物
    '草': { s: 10, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.plant, flavor: '野火燒不盡。可為衣，可為藥。' },
    '花': { s: 8, walk: 1.0, kind: 'plant', flam: 0.4, ink: INK.red, flavor: '草間一點朱。' },
    '木': { s: 4, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.plant, flavor: '獨木。兩木相合則成林；木上加屋，可以安身。' },
    '果': { s: 8, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.red, food: { eat: 20 }, flavor: '田木成果。摘之可食。' },
    '竹': { s: 6, walk: 0.7, kind: 'plant', flam: 0.7, ink: INK.plant, flavor: '未出土時先有節。可為筏。' },
    '林': { s: 8, walk: 0.6, kind: 'plant', flam: 0.7, ink: INK.forest, flavor: '雙木成林。' },
    '森': { s: 12, walk: 0.5, kind: 'plant', flam: 0.8, ink: INK.forest, flavor: '三木成森，虎踞其中。' },
    // —— 水
    '水': { s: 4, walk: 0, kind: 'water', ink: INK.water, flavor: '上善若水。夜有月影。有筏可渡。' },
    '淼': { s: 12, walk: 0, kind: 'water', ink: INK.deep, flavor: '水天一色，魚遊其間。筏亦不可渡。' },
    // —— 山石
    '石': { s: 5, walk: 0.7, kind: 'rock', ink: INK.rock, flavor: '石可鎮水。石上加刀，是為石刀。' },
    '磊': { s: 15, walk: 0, kind: 'rock', ink: INK.rock, flavor: '三石為磊，不可逾越。' },
    '山': { s: 3, walk: 0, kind: 'rock', ink: INK.rock, flavor: '山不可越，然可吸墨而去。' },
    // —— 火
    '火': { s: 4, walk: 0, kind: 'fire', light: 2.5, ink: INK.red, flavor: '星火可燎原。虎畏之。火上加把，是為火把。' },
    '炎': { s: 8, walk: 0, kind: 'fire', light: 3.5, ink: INK.red, flavor: '二火為炎。' },
    '焱': { s: 12, walk: 0, kind: 'fire', light: 4.5, ink: INK.red, flavor: '三火為焱，萬物焦土。' },
    // —— 造物
    '灶': { s: 7, walk: 0, kind: 'object', ink: INK.red, flavor: '火在土上，是為灶。不蔓延，可烤食，可取暖；添木續火。' },
    '明': { s: 8, walk: 1.0, kind: 'object', light: 5.5, ink: INK.gold, flavor: '日月為明。夜可照路，虎不敢近。' },
    '休': { s: 6, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '人倚木而休。站在其上按 R，可睡至天明。' },
    '木屋': { s: 13, walk: 1.0, kind: 'object', flam: 0.3, light: 1.2, shelter: true, ink: INK.brown, learn: false, tile: false, flavor: '入內則暖，獸不得入。站在其中按 R 可睡。' },
    '橋': { s: 16, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '架木為橋。' },
    '困': { s: 7, walk: 0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '木困於口，是為牆。' },
    '碑': { s: 13, walk: 0, kind: 'object', learn: false, absorb: false, tile: false, ink: INK.black, flavor: '古碑，刻有造字之法。讀之，硯臺漸寬。' },
    '囊': { s: 22, walk: 0, kind: 'object', learn: false, absorb: false, tile: false, ink: INK.black, flavor: '一個落下的袋子。' },
    '路': { s: 13, walk: 1.4, kind: 'ground', learn: false, absorb: false, ink: INK.sand, flavor: '走的人多了，也便成了路。' },
    '灘': { s: 22, walk: 1.2, kind: 'ground', learn: false, absorb: false, tile: false, ink: INK.sand, flavor: '潮退則沙，潮漲則水。' },
    // —— 地標（大字）
    '塔': { s: 13, walk: 0, kind: 'place', learn: false, absorb: false, tile: false, ink: INK.black, flavor: '從塔上能看見整張紙。' },
    '寺': { s: 6, walk: 1.0, kind: 'place', learn: false, absorb: false, tile: false, shelter: true, ink: INK.brown, flavor: '寺裡安靜，虎不敢進。' },
    '船': { s: 11, walk: 0, kind: 'place', learn: false, absorb: false, tile: false, ink: INK.brown, flavor: '擱淺的船。' },
    '泉': { s: 9, walk: 0, kind: 'place', learn: false, absorb: false, tile: false, ink: INK.water, flavor: '白水為泉。傍邊可療傷。' },
    '墓': { s: 14, walk: 0, kind: 'place', learn: false, absorb: false, tile: false, ink: INK.rock, flavor: '埋著寫錯的字。' },
    '洞': { s: 9, walk: 0, kind: 'place', learn: false, absorb: false, tile: false, ink: INK.black, flavor: '黑處藏著龍。' },
    '燈': { s: 16, walk: 0, kind: 'place', learn: false, absorb: false, tile: false, light: 5, ink: INK.gold, flavor: '火上加登，是為燈。島外那盞最遠。' },
    '間': { s: 12, walk: 1.0, kind: 'object', shelter: true, ink: INK.brown, flavor: '門中有日，是為間：一間屋。入內則暖，獸不得入。' },
    '漁': { s: 14, walk: 0, kind: 'object', tile: false, absorb: false, ink: INK.water, flavor: '水中有魚，是為漁：魚梁。隔一陣子就有魚，面向它按 E 取。' },
    '井': { s: 4, walk: 0, kind: 'place', learn: false, absorb: false, tile: false, ink: INK.water, flavor: '井裡有水，水裡有月。' },
    '牆': { s: 17, walk: 0, kind: 'object', learn: false, ink: INK.brown, flavor: '村裡的殘牆。' },
    '門': { s: 8, walk: 1.0, kind: 'object', learn: false, ink: INK.brown, flavor: '沒有門的門。' },
    // —— 部件（只用於合字 / 造詞）
    '口': { s: 3, kind: 'radical', tile: false, absorb: false, flavor: '口可囚物：寫於獸上則困之，寫於木上則成牆。' },
    '人': { s: 2, kind: 'radical', tile: false, absorb: false, flavor: '你自己。人倚木而休。' },
    '刀': { s: 2, kind: 'radical', tile: false, absorb: false, flavor: '寫在囊中「石」上，是為石刀。' },
    '把': { s: 7, kind: 'radical', tile: false, absorb: false, flavor: '寫在囊中「火」上，是為火把。' },
    '屋': { s: 9, kind: 'radical', tile: false, absorb: false, flavor: '寫在囊中「木」上，是為木屋。' },
    '衣': { s: 6, kind: 'radical', tile: false, absorb: false, flavor: '寫在囊中「草」上，是為草衣。' },
    '藥': { s: 19, kind: 'radical', tile: false, absorb: false, flavor: '寫在囊中「草」上，是為草藥。' },
    '筏': { s: 12, kind: 'radical', tile: false, absorb: false, flavor: '寫在囊中「竹」上，是為竹筏。' },
    '登': { s: 12, kind: 'radical', tile: false, absorb: false, flavor: '登高。寫在囊中「火」上，是為燈。' },
    '日': { s: 4, walk: 1.0, kind: 'radical', light: 2.5, ink: INK.red, flavor: '白日。與「月」相合而為明。' },
    '月': { s: 4, walk: 1.0, kind: 'radical', light: 1.5, ink: INK.gold, flavor: '水中之月。與「日」相合而為明。' },
    // —— 獸、物與墨滴（只作為實體或囊中之物出現）
    '鳥': { s: 11, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '飛鳥，見人則起，捉不住。' },
    '魚': { s: 11, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.water, food: { eat: 15, hurt: 5 }, flavor: '游魚。生食傷身，烤之則美。' },
    '鹿': { s: 11, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '林間鹿，見人則走，鹿過處塵土飛揚。有刀可獵。' },
    '虎': { s: 8, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '森中虎，夜行，畏火與光。' },
    '龍': { s: 16, kind: 'beast', tile: false, absorb: false, learn: true, light: 3, ink: INK.red, flavor: '洞中之龍。寫在白紙上，它便隨你同行，夜能照路，虎不敢近。' },
    '肉': { s: 6, kind: 'item', tile: false, absorb: false, learn: false, ink: INK.red, food: { eat: 20, hurt: 8 }, flavor: '生肉。生食傷身，烤之則美。' },
    '丶': { s: 1, kind: 'drop', tile: false, absorb: false, learn: false, ink: INK.black, flavor: '一點墨。' }
  };
  // 視覺層級：底紋類的字畫得小而淡，樹、山、水才是"主角"——像水墨畫裡的皴與點
  const VIS = { '草': [0.6, 0.42], '花': [0.62, 0.8], '沙': [0.58, 0.5], '田': [0.78, 0.6], '土': [0.6, 0.5], '灰': [0.6, 0.5], '雪': [0.7, 0.55],
    '水': [0.82, 0.8], '淼': [0.95, 0.9], '石': [0.72, 0.85], '山': [1.12, 1], '木': [0.9, 1], '果': [0.9, 1], '竹': [0.85, 0.95], '林': [1.0, 1], '森': [1.08, 1],
    '火': [0.9, 1], '炎': [1.0, 1], '焱': [1.1, 1], '灶': [0.95, 1], '碑': [1.05, 1], '日': [0.8, 1], '月': [0.8, 1], '囊': [0.9, 1],
    '路': [0.55, 0.45], '牆': [0.9, 0.9], '門': [0.85, 0.9], '井': [0.9, 1] };
  for (const ch in DB) {
    const d = DB[ch];
    d.vis = VIS[ch] || [0.95, 1];
    if (d.walk === undefined) d.walk = 1;
    if (d.flam === undefined) d.flam = 0;
    if (d.light === undefined) d.light = 0;
    if (d.learn === undefined) d.learn = true;
    if (d.absorb === undefined) d.absorb = true;
    if (d.tile === undefined) d.tile = true;
    if (!d.ink) d.ink = INK.black;
    d.ch = ch;
  }

  // 詞表（造詞）：把字典裡的字寫在囊中之物上。a 底物，w 所寫之字；筆畫 s 是兩者之和（研墨時值這麼多墨）。
  const WORDS = {
    '火把': { a: '火', w: '把', s: 11, kind: 'tool', life: 180, flavor: '夜裡自燃，照路三格，禦寒。囊中有之即可，燃盡即無。' },
    '石刀': { a: '石', w: '刀', s: 7, kind: 'tool', flavor: '採集快一倍；面向鹿與虎按 E 可獵。' },
    '木屋': { a: '木', w: '屋', s: 13, kind: 'build', flavor: '放在白紙上即成屋。入內則暖，獸不得入。' },
    '草衣': { a: '草', w: '衣', s: 16, kind: 'wear', flavor: '囊中有之，禦寒減半。' },
    '竹筏': { a: '竹', w: '筏', s: 18, kind: 'tool', flavor: '囊中有之，可行於淺水，捉魚更易。' },
    '草藥': { a: '草', w: '藥', s: 29, kind: 'food', food: { heal: 35 }, flavor: '服之療傷。' },
    '烤魚': { s: 21, kind: 'food', food: { eat: 40 }, flavor: '灶上烤的魚。香。' },
    '烤肉': { s: 16, kind: 'food', food: { eat: 55 }, flavor: '灶上烤的肉。更香。' },
    '燈': { a: '火', w: '登', s: 16, kind: 'build', flavor: '火上加登，是為燈。放在白紙上，長明不滅。' },
    '籠': { a: '竹', w: '龍', s: 22, kind: 'tool', flavor: '竹編的籠，龍也關得住。面向獸按 F，收入囊中；籠可再用。' }
  };
  const COOK = { '魚': '烤魚', '肉': '烤肉' };
  function item(name) { return WORDS[name] || DB[name] || null; }   // 囊中之物優先按詞表解釋（木屋既是詞也是地上的格）
  function wordFor(base, w) { for (const n in WORDS) { const d = WORDS[n]; if (d.a === base && d.w === w) return n; } return null; }

  // 合字表：[底字, 寫上去的字, 結果, 一句話]。順序敏感：底字是地上已有的字。
  const FUSE_LIST = [
    ['木', '木', '林', '雙木成林'],
    ['林', '木', '森', '三木成森'],
    ['水', '水', '淼', '水天一色'],
    ['火', '火', '炎', '二火為炎'],
    ['炎', '火', '焱', '三火為焱'],
    ['石', '石', '磊', '三石為磊'],
    ['日', '月', '明', '日月為明'],
    ['月', '日', '明', '日月為明'],
    ['木', '人', '休', '人倚木而休'],
    ['土', '火', '灶', '火在土上，是為灶'],
    ['田', '木', '果', '田木成果'],
    ['水', '木', '橋', '架木為橋'],
    ['水', '石', '石', '石可鎮水'],
    ['土', '水', '田', '灌土為田'],
    ['灰', '水', '田', '灰燼逢水，沃野可期'],
    ['木', '口', '困', '木困於口，是為牆'],
    ['門', '日', '間', '門中有日，是為間'],
    ['水', '魚', '漁', '水中有魚，是為漁'],
    ['雪', '火', '水', '雪遇火成水'],
    ['火', '水', '土', '水克火'],
    ['炎', '水', '土', '水克火'],
    ['焱', '水', '土', '水克火']
  ];
  const FUSE = new Map();
  for (const [a, b, r, m] of FUSE_LIST) FUSE.set(a + b, { base: a, w: b, result: r, msg: m });

  // 寫字失敗時的"解釋"，讓玩家學到規律
  function failReason(base, w) {
    const bd = DB[base], wd = DB[w];
    if (w === '土' && bd.kind === 'water') return '土遇水則散';
    if (w === '火' && bd.kind === 'water') return '火遇水即滅';
    if (w === '火') return '無物可燃';
    if (w === '口') return '口中空空，無物可困';
    if (w === '人') return '人無所倚';
    if (wd && wd.kind === 'radical' && !wd.tile) return '「' + w + '」只能寫在囊中之物上（按 C 造詞）';
    if (bd.kind === 'blank') return '';
    return '墨跡散了——「' + base + '」與「' + w + '」不可相合';
  }

  // 寫字的代價：墨守恆。合字時至少要付出筆畫差，也不低於所寫之字本身。
  function writeCost(w, base, result) {
    const ws = DB[w].s;
    if (!base || !result) return ws;
    return Math.max(ws, DB[result].s - DB[base].s);
  }

  // ---------- 一紙之島 ----------
  const ISLAND_R = 60;       // 島的半徑（格）；越往外越深，最外是淼
  // 島外有一座小嶼，燈在上面；一條潮道連著主島，退潮時才露出來
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
    if (h < 0.415) return d < 0.9 ? '沙' : '石';
    if (h > 0.69) return d < 0.75 ? '雪' : '山';
    if (h > 0.645) return d < 0.72 ? '山' : '石';
    if (h > 0.615) return d < 0.45 ? '石' : (m > 0.5 ? '木' : '草');

    // 平原與丘陵：由溼度決定植被
    if (m < 0.36) {
      if (t > 0.56) return d < 0.94 ? '沙' : '石';          // 乾熱：荒漠
      return d < 0.05 ? '石' : d < 0.1 ? '木' : '草';          // 乾冷：疏草
    }
    if (m < 0.50) {
      const f = U.fbm(x / 20 + 90, y / 20 + 90, seed + 41, 2);
      if (f > 0.62) return d < 0.05 ? '果' : '田';             // 成片的田，田邊有果樹
      if (d < 0.05) return '果';
      if (d < 0.09) return '花';
      if (d < 0.16) return '木';
      return '草';
    }
    if (m < 0.60) return d < 0.05 ? '果' : d < 0.5 ? '木' : d < 0.78 ? '林' : '草';   // 疏林
    if (m < 0.665) {
      if (t > 0.56 && d < 0.55) return '竹';                     // 溫溼：竹林
      return d < 0.6 ? '林' : '木';
    }
    return d < 0.62 ? '森' : '林';                                // 深林
  }
  function baseTile(x, y, seed) {
    const il = islet(seed);
    const di = Math.hypot(x - il.cx, y - il.cy);
    if (di <= 4.3) return di < 2.4 ? (U.rand2(x, y, seed + 5) < 0.12 ? '花' : '草') : '沙';
    const nat = naturalTile(x, y, seed);
    // 潮道：主島與小嶼之間的一條淺灘
    const proj = x * il.ux + y * il.uy, perp = Math.abs(x * il.uy - y * il.ux);
    if (perp <= 1.3 && proj > 2 && proj < il.len - 3.5) {
      if (DB[nat].kind === 'water') return '灘';     // 水上是潮道，退潮才露
      if (nat === '山') return '石';                   // 山裡是一道石徑
    }
    return nat;
  }

  // 五塊碑，由近到遠各教一個字；位置由種子決定（角度均分再抖動，再螺旋找可站之地）
  const STELES = [
    { r: 0.26, teach: '把', hint: '火上加「把」，是為火把：夜裡自燃，照路三格，虎不敢近。' },
    { r: 0.42, teach: '屋', hint: '木上加「屋」，是為木屋：入內則暖，獸不得入。' },
    { r: 0.56, teach: '衣', hint: '草可為「衣」，禦寒減半。雪上尤寒，水中亦然。' },
    { r: 0.70, teach: '藥', hint: '草可為「藥」，服之療傷。生魚生肉傷身，灶上烤之則美。' },
    { r: 0.83, teach: '筏', hint: '竹可為「筏」，可渡淺水而不可渡淼。月沉水中，唯夜可見。' }
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
      if (found) out.push({ x: found[0], y: found[1], teach: s.teach, hint: s.hint });
    });
    return out;
  }

  // 八處地標。每處一段話，連起來是一個小故事：這座島是誰寫的。
  //   ch 大字（佔 w×h 格）；template 則是按格蓋印的小村；want 落點的地貌要求；effect 讀它的效果
  const VILLAGE = ['牆牆門牆牆', '牆草草草牆', '門草井草門', '牆草草草牆', '牆牆門牆牆'];
  const PLACES = [
    { id: 'ta', ch: '塔', name: '塔', w: 2, h: 2, r: [0.30, 0.52], want: 'high', effect: 'reveal',
      text: '從塔上能看見整張紙。我在這裡寫了一個「望」字，先生用硃筆把它圈起來了，說：字可以望嗎？我說可以。' },
    { id: 'si', ch: '寺', name: '寺', w: 2, h: 2, r: [0.40, 0.68], want: 'forest', effect: 'shelter',
      text: '寺裡很安靜，虎不敢進來。先生說，字寫得靜，心就靜。我在這裡抄了一百個「靜」字，一個也沒留下。' },
    { id: 'cun', name: '村', template: VILLAGE, r: [0.28, 0.55], want: 'grass', effect: 'well',
      text: '村裡沒有人。人都在字典裡。井裡有水，水裡有月，月裡有——我還沒想好。' },
    { id: 'chuan', ch: '船', name: '船', w: 2, h: 1, r: [0.74, 0.96], want: 'beach', effect: 'raft',
      text: '這條船是我畫的。先生說船字不是這樣寫，可我見過的船就是這樣。船裡有一隻筏子，你拿去。' },
    { id: 'quan', ch: '泉', name: '泉', w: 1, h: 1, r: [0.34, 0.66], want: 'forest', effect: 'heal',
      text: '泉是水從石頭裡出來，像字從筆裡出來。鹿傍晚都會來，它們不怕我，因為我也是字。' },
    { id: 'mu', ch: '墓', name: '墓', w: 1, h: 1, r: [0.40, 0.72], want: 'grass', effect: 'ink',
      text: '這裡埋著我寫錯的字。先生說，錯字也是墨，別扔。' },
    { id: 'dong', ch: '洞', name: '洞', w: 1, h: 1, r: [0.48, 0.86], want: 'mountain', effect: 'dragon',
      text: '洞裡黑。先生說，黑處藏著龍。我不信。你去看看，看見了就把它寫出來。' },
    { id: 'deng', ch: '燈', name: '燈', w: 1, h: 2, islet: true, effect: 'end',
      text: '燈最遠。潮退了才走得到。我把名字寫在這裡，可先生說名字不能寫在紙上，會被風吹走。那就寫在你心裡吧。你來了，就算讀完了這張紙。' }
  ];
  function footprintOk(x0, y0, w, h, seed, want, taken) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = x0 + i, y = y0 + j;
      if (taken.has(x + ',' + y)) return false;
      const ch = baseTile(x, y, seed), d = DB[ch];
      if (want === 'high') { if ('石草木田'.indexOf(ch) < 0 || fields(x, y, seed).h < 0.58) return false; }
      else if (want === 'forest') { if ('林木森竹草果'.indexOf(ch) < 0) return false; }
      else if (want === 'grass') { if ('草田花木果'.indexOf(ch) < 0) return false; }
      else if (want === 'beach') { if (ch !== '沙') return false; }
      else if (want === 'mountain') {
        if ('石草木'.indexOf(ch) < 0) return false;
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
            const hit = spiralFind(tx, ty, 7, (x, y) => footprintOk(x, y, w, h, seed, pl.want, taken));   // 探針附近再螺旋找一找
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

  // 地貌名（給狀態欄用）
  function biomeName(ch) {
    return ({ '淼': '深水', '水': '淺水', '沙': '沙地', '石': '石灘', '山': '群山', '雪': '雪原',
      '草': '草原', '花': '花野', '木': '疏林', '果': '果林', '林': '林地', '森': '深林', '竹': '竹林', '田': '田野',
      '土': '荒土', '灰': '焦土', '白': '白紙', '火': '火場', '炎': '火場', '焱': '火場', '灶': '灶邊',
      '明': '明燈', '休': '營地', '木屋': '屋內', '橋': '橋', '困': '牆', '碑': '古碑', '日': '日', '月': '月', '囊': '囊',
      '路': '小路', '塔': '塔下', '寺': '寺中', '船': '船邊', '泉': '泉邊', '墓': '墓前', '洞': '洞口', '燈': '燈下', '井': '井邊', '牆': '村中', '門': '村口' })[ch] || ch;
  }

  root.G = { INK, DB, WORDS, COOK, item, wordFor, FUSE, FUSE_LIST, failReason, writeCost, baseTile, fields, islet, stelePlan, placePlan, PLACES, biomeName, ISLAND_R,
    START_KNOWN: ['人', '木', '水', '火', '土', '口', '刀'] };
})();
