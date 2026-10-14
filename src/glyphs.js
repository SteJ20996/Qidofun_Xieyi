// glyphs.js —— 字库、词表、合字表、地貌生成规则、石碑
// 这是整个游戏的"物理法则"：每个字是什么、能不能走、会不会烧、值多少墨，字与字如何相合，字与字如何成词。
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U;

  // 墨色：水墨画里基本只用墨，偶尔点一笔花青（水）、朱砂（火、花）、赭石（木构）
  const INK = {
    black: '#1c1a17', water: '#2f5878', deep: '#223f5a', rock: '#4a4f5c', snow: '#7f8ea3',
    plant: '#263428', forest: '#1b261d', red: '#b4392a', gold: '#9c6d12', brown: '#5a3e2b',
    sand: '#8d7a4b', ash: '#6f6a66', soil: '#6b4a2f', field: '#4f5a2f', beast: '#2a2320'
  };

  // 字库。字段含义：
  //   s      笔画数（= 这个字含有的墨量）
  //   walk   通行速度倍率，0 = 不可通行
  //   kind   blank 白纸 / ground 地面 / plant 植物 / water 水 / rock 山石 / fire 火 / object 造物 / radical 部件 / beast 兽 / item 物 / drop 墨滴
  //   flam   可燃度 (0~1)
  //   light  夜间照亮半径（格）
  //   learn  吸收或合成后能否记入字典
  //   absorb 能否被吸入囊中
  //   tile   能否直接写在白纸上
  //   food   可食：{ eat 饱, hurt 伤, heal 疗 }
  //   shelter 站在其上即为屋内
  const DB = {
    '白': { s: 5, walk: 1.0, kind: 'blank', learn: false, absorb: false, tile: false, flavor: '未着一墨的纸。天地有常，旧字终将自还。' },
    // —— 地面
    '田': { s: 5, walk: 1.5, kind: 'ground', ink: INK.field, flavor: '灌土为田，行路如飞。田上植木，可以结果。' },
    '土': { s: 3, walk: 1.0, kind: 'ground', ink: INK.soil, flavor: '厚德载物。久之生草。火在土上，是为灶。' },
    '沙': { s: 7, walk: 1.2, kind: 'ground', ink: INK.sand, flavor: '白日照沙，可得「日」。' },
    '灰': { s: 6, walk: 1.0, kind: 'ground', ink: INK.ash, flavor: '火后余烬，久之化土。' },
    '雪': { s: 11, walk: 0.7, kind: 'ground', ink: INK.snow, flavor: '高处积雪，寒。遇火成水。' },
    // —— 植物
    '草': { s: 9, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.plant, flavor: '野火烧不尽。可为衣，可为药。' },
    '花': { s: 7, walk: 1.0, kind: 'plant', flam: 0.4, ink: INK.red, flavor: '草间一点朱。' },
    '木': { s: 4, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.plant, flavor: '独木。两木相合则成林；木上加屋，可以安身。' },
    '果': { s: 8, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.red, food: { eat: 20 }, flavor: '田木成果。摘之可食。' },
    '竹': { s: 6, walk: 0.7, kind: 'plant', flam: 0.7, ink: INK.plant, flavor: '未出土时先有节。可为筏。' },
    '林': { s: 8, walk: 0.6, kind: 'plant', flam: 0.7, ink: INK.forest, flavor: '双木成林。' },
    '森': { s: 12, walk: 0.5, kind: 'plant', flam: 0.8, ink: INK.forest, flavor: '三木成森，虎踞其中。' },
    // —— 水
    '水': { s: 4, walk: 0, kind: 'water', ink: INK.water, flavor: '上善若水。夜有月影。有筏可渡。' },
    '淼': { s: 12, walk: 0, kind: 'water', ink: INK.deep, flavor: '水天一色，鱼游其间。筏亦不可渡。' },
    // —— 山石
    '石': { s: 5, walk: 0.7, kind: 'rock', ink: INK.rock, flavor: '石可镇水。石上加刀，是为石刀。' },
    '磊': { s: 15, walk: 0, kind: 'rock', ink: INK.rock, flavor: '三石为磊，不可逾越。' },
    '山': { s: 3, walk: 0, kind: 'rock', ink: INK.rock, flavor: '山不可越，然可吸墨而去。' },
    // —— 火
    '火': { s: 4, walk: 0, kind: 'fire', light: 2.5, ink: INK.red, flavor: '星火可燎原。虎畏之。火上加把，是为火把。' },
    '炎': { s: 8, walk: 0, kind: 'fire', light: 3.5, ink: INK.red, flavor: '二火为炎。' },
    '焱': { s: 12, walk: 0, kind: 'fire', light: 4.5, ink: INK.red, flavor: '三火为焱，万物焦土。' },
    // —— 造物
    '灶': { s: 7, walk: 0, kind: 'object', ink: INK.red, flavor: '火在土上，是为灶。不蔓延，可烤食，可取暖；添木续火。' },
    '明': { s: 8, walk: 1.0, kind: 'object', light: 5.5, ink: INK.gold, flavor: '日月为明。夜可照路，虎不敢近。' },
    '休': { s: 6, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '人倚木而休。站在其上按 R，可睡至天明。' },
    '木屋': { s: 13, walk: 1.0, kind: 'object', flam: 0.3, light: 1.2, shelter: true, ink: INK.brown, learn: false, tile: false, flavor: '入内则暖，兽不得入。站在其中按 R 可睡。' },
    '桥': { s: 10, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '架木为桥。' },
    '困': { s: 7, walk: 0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '木困于口，是为墙。' },
    '碑': { s: 13, walk: 0, kind: 'object', learn: false, absorb: false, tile: false, ink: INK.black, flavor: '古碑，刻有造字之法。读之，砚台渐宽。' },
    '囊': { s: 22, walk: 0, kind: 'object', learn: false, absorb: false, tile: false, ink: INK.black, flavor: '一个落下的袋子。' },
    // —— 部件（只用于合字 / 造词）
    '口': { s: 3, kind: 'radical', tile: false, absorb: false, flavor: '口可囚物：写于兽上则困之，写于木上则成墙。' },
    '人': { s: 2, kind: 'radical', tile: false, absorb: false, flavor: '你自己。人倚木而休。' },
    '刀': { s: 2, kind: 'radical', tile: false, absorb: false, flavor: '写在囊中「石」上，是为石刀。' },
    '把': { s: 7, kind: 'radical', tile: false, absorb: false, flavor: '写在囊中「火」上，是为火把。' },
    '屋': { s: 9, kind: 'radical', tile: false, absorb: false, flavor: '写在囊中「木」上，是为木屋。' },
    '衣': { s: 6, kind: 'radical', tile: false, absorb: false, flavor: '写在囊中「草」上，是为草衣。' },
    '药': { s: 9, kind: 'radical', tile: false, absorb: false, flavor: '写在囊中「草」上，是为草药。' },
    '筏': { s: 12, kind: 'radical', tile: false, absorb: false, flavor: '写在囊中「竹」上，是为竹筏。' },
    '日': { s: 4, walk: 1.0, kind: 'radical', light: 2.5, ink: INK.red, flavor: '白日。与「月」相合而为明。' },
    '月': { s: 4, walk: 1.0, kind: 'radical', light: 1.5, ink: INK.gold, flavor: '水中之月。与「日」相合而为明。' },
    // —— 兽、物与墨滴（只作为实体或囊中之物出现）
    '鸟': { s: 5, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '飞鸟，见人则起，捉不住。' },
    '鱼': { s: 8, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.water, food: { eat: 15, hurt: 5 }, flavor: '游鱼。生食伤身，烤之则美。' },
    '鹿': { s: 11, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '林间鹿，见人则走。有刀可猎。' },
    '虎': { s: 8, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '森中虎，夜行，畏火与光。' },
    '肉': { s: 6, kind: 'item', tile: false, absorb: false, learn: false, ink: INK.red, food: { eat: 20, hurt: 8 }, flavor: '生肉。生食伤身，烤之则美。' },
    '丶': { s: 1, kind: 'drop', tile: false, absorb: false, learn: false, ink: INK.black, flavor: '一点墨。' }
  };
  // 视觉层级：底纹类的字画得小而淡，树、山、水才是"主角"——像水墨画里的皴与点
  const VIS = { '草': [0.6, 0.42], '花': [0.62, 0.8], '沙': [0.58, 0.5], '田': [0.78, 0.6], '土': [0.6, 0.5], '灰': [0.6, 0.5], '雪': [0.7, 0.55],
    '水': [0.82, 0.8], '淼': [0.95, 0.9], '石': [0.72, 0.85], '山': [1.12, 1], '木': [0.9, 1], '果': [0.9, 1], '竹': [0.85, 0.95], '林': [1.0, 1], '森': [1.08, 1],
    '火': [0.9, 1], '炎': [1.0, 1], '焱': [1.1, 1], '灶': [0.95, 1], '碑': [1.05, 1], '日': [0.8, 1], '月': [0.8, 1], '囊': [0.9, 1] };
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

  // 词表（造词）：把字典里的字写在囊中之物上。a 底物，w 所写之字；笔画 s 是两者之和（研墨时值这么多墨）。
  const WORDS = {
    '火把': { a: '火', w: '把', s: 11, kind: 'tool', life: 180, flavor: '夜里自燃，照路三格，御寒。囊中有之即可，燃尽即无。' },
    '石刀': { a: '石', w: '刀', s: 7, kind: 'tool', flavor: '采集快一倍；面向鹿与虎按 E 可猎。' },
    '木屋': { a: '木', w: '屋', s: 13, kind: 'build', flavor: '放在白纸上即成屋。入内则暖，兽不得入。' },
    '草衣': { a: '草', w: '衣', s: 15, kind: 'wear', flavor: '囊中有之，御寒减半。' },
    '竹筏': { a: '竹', w: '筏', s: 18, kind: 'tool', flavor: '囊中有之，可行于浅水，捉鱼更易。' },
    '草药': { a: '草', w: '药', s: 18, kind: 'food', food: { heal: 35 }, flavor: '服之疗伤。' },
    '烤鱼': { s: 18, kind: 'food', food: { eat: 40 }, flavor: '灶上烤的鱼。香。' },
    '烤肉': { s: 16, kind: 'food', food: { eat: 55 }, flavor: '灶上烤的肉。更香。' }
  };
  const COOK = { '鱼': '烤鱼', '肉': '烤肉' };
  function item(name) { return WORDS[name] || DB[name] || null; }   // 囊中之物优先按词表解释（木屋既是词也是地上的格）
  function wordFor(base, w) { for (const n in WORDS) { const d = WORDS[n]; if (d.a === base && d.w === w) return n; } return null; }

  // 合字表：[底字, 写上去的字, 结果, 一句话]。顺序敏感：底字是地上已有的字。
  const FUSE_LIST = [
    ['木', '木', '林', '双木成林'],
    ['林', '木', '森', '三木成森'],
    ['水', '水', '淼', '水天一色'],
    ['火', '火', '炎', '二火为炎'],
    ['炎', '火', '焱', '三火为焱'],
    ['石', '石', '磊', '三石为磊'],
    ['日', '月', '明', '日月为明'],
    ['月', '日', '明', '日月为明'],
    ['木', '人', '休', '人倚木而休'],
    ['土', '火', '灶', '火在土上，是为灶'],
    ['田', '木', '果', '田木成果'],
    ['水', '木', '桥', '架木为桥'],
    ['水', '石', '石', '石可镇水'],
    ['土', '水', '田', '灌土为田'],
    ['灰', '水', '田', '灰烬逢水，沃野可期'],
    ['木', '口', '困', '木困于口，是为墙'],
    ['雪', '火', '水', '雪遇火成水'],
    ['火', '水', '土', '水克火'],
    ['炎', '水', '土', '水克火'],
    ['焱', '水', '土', '水克火']
  ];
  const FUSE = new Map();
  for (const [a, b, r, m] of FUSE_LIST) FUSE.set(a + b, { base: a, w: b, result: r, msg: m });

  // 写字失败时的"解释"，让玩家学到规律
  function failReason(base, w) {
    const bd = DB[base], wd = DB[w];
    if (w === '土' && bd.kind === 'water') return '土遇水则散';
    if (w === '火' && bd.kind === 'water') return '火遇水即灭';
    if (w === '火') return '无物可燃';
    if (w === '口') return '口中空空，无物可困';
    if (w === '人') return '人无所倚';
    if (wd && wd.kind === 'radical' && !wd.tile) return '「' + w + '」只能写在囊中之物上（按 C 造词）';
    if (bd.kind === 'blank') return '';
    return '墨迹散了——「' + base + '」与「' + w + '」不可相合';
  }

  // 写字的代价：墨守恒。合字时至少要付出笔画差，也不低于所写之字本身。
  function writeCost(w, base, result) {
    const ws = DB[w].s;
    if (!base || !result) return ws;
    return Math.max(ws, DB[result].s - DB[base].s);
  }

  // ---------- 一纸之岛 ----------
  const ISLAND_R = 60;       // 岛的半径（格）；越往外越深，最外是淼
  function baseTile(x, y, seed) {
    const dd = Math.hypot(x, y) / ISLAND_R;
    let h = U.fbm(x / 64, y / 64, seed, 5);
    h = h - U.smoothstep(0.55, 1.0, dd) * 0.6 + (1 - U.smoothstep(0, 0.3, dd)) * 0.06;
    const m = U.fbm(x / 48 + 300, y / 48 - 300, seed + 17, 4);
    const t = U.fbm(x / 150 - 700, y / 150 + 700, seed + 29, 3);
    const d = U.rand2(x, y, seed + 5);

    if (h < 0.33) return '淼';
    if (h < 0.395) return '水';
    if (h < 0.415) return d < 0.9 ? '沙' : '石';
    if (h > 0.69) return d < 0.75 ? '雪' : '山';
    if (h > 0.645) return d < 0.72 ? '山' : '石';
    if (h > 0.615) return d < 0.45 ? '石' : (m > 0.5 ? '木' : '草');

    // 平原与丘陵：由湿度决定植被
    if (m < 0.36) {
      if (t > 0.56) return d < 0.94 ? '沙' : '石';          // 干热：荒漠
      return d < 0.05 ? '石' : d < 0.1 ? '木' : '草';          // 干冷：疏草
    }
    if (m < 0.50) {
      const f = U.fbm(x / 20 + 90, y / 20 + 90, seed + 41, 2);
      if (f > 0.62) return d < 0.04 ? '果' : '田';             // 成片的田，田边有果树
      if (d < 0.03) return '果';
      if (d < 0.07) return '花';
      if (d < 0.14) return '木';
      return '草';
    }
    if (m < 0.60) return d < 0.03 ? '果' : d < 0.5 ? '木' : d < 0.78 ? '林' : '草';   // 疏林
    if (m < 0.665) {
      if (t > 0.56 && d < 0.55) return '竹';                     // 温湿：竹林
      return d < 0.6 ? '林' : '木';
    }
    return d < 0.62 ? '森' : '林';                                // 深林
  }

  // 五块碑，由近到远各教一个字；位置由种子决定（角度均分再抖动，再螺旋找可站之地）
  const STELES = [
    { r: 0.26, teach: '把', hint: '火上加「把」，是为火把：夜里自燃，照路三格，虎不敢近。' },
    { r: 0.42, teach: '屋', hint: '木上加「屋」，是为木屋：入内则暖，兽不得入。' },
    { r: 0.56, teach: '衣', hint: '草可为「衣」，御寒减半。雪上尤寒，水中亦然。' },
    { r: 0.70, teach: '药', hint: '草可为「药」，服之疗伤。生鱼生肉伤身，灶上烤之则美。' },
    { r: 0.83, teach: '筏', hint: '竹可为「筏」，可渡浅水而不可渡淼。月沉水中，唯夜可见。' }
  ];
  function stelePlan(seed) {
    const out = [];
    STELES.forEach((s, i) => {
      const a = (i / STELES.length) * Math.PI * 2 + U.rand2(i, 7, seed) * 1.1;
      const tx = Math.round(Math.cos(a) * s.r * ISLAND_R), ty = Math.round(Math.sin(a) * s.r * ISLAND_R);
      let found = null;
      for (let rr = 0; rr < 40 && !found; rr++) {
        for (let k = -rr; k <= rr && !found; k++) {
          for (const [x, y] of [[tx + k, ty - rr], [tx + k, ty + rr], [tx - rr, ty + k], [tx + rr, ty + k]]) {
            const d = DB[baseTile(x, y, seed)];
            if (d.walk > 0 && d.kind !== 'water') { found = [x, y]; break; }
          }
        }
      }
      if (found) out.push({ x: found[0], y: found[1], teach: s.teach, hint: s.hint });
    });
    return out;
  }

  // 地貌名（给状态栏用）
  function biomeName(ch) {
    return ({ '淼': '深水', '水': '浅水', '沙': '沙地', '石': '石滩', '山': '群山', '雪': '雪原',
      '草': '草原', '花': '花野', '木': '疏林', '果': '果林', '林': '林地', '森': '深林', '竹': '竹林', '田': '田野',
      '土': '荒土', '灰': '焦土', '白': '白纸', '火': '火场', '炎': '火场', '焱': '火场', '灶': '灶边',
      '明': '明灯', '休': '营地', '木屋': '屋内', '桥': '桥', '困': '墙', '碑': '古碑', '日': '日', '月': '月', '囊': '囊' })[ch] || ch;
  }

  root.G = { INK, DB, WORDS, COOK, item, wordFor, FUSE, FUSE_LIST, failReason, writeCost, baseTile, stelePlan, biomeName, ISLAND_R,
    START_KNOWN: ['人', '木', '水', '火', '土', '口', '刀'] };
})();
