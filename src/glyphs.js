// glyphs.js —— 字库、合字表、地貌生成规则
// 这是整个游戏的"物理法则"：每个字是什么、能不能走、会不会烧、值多少墨，以及字与字如何相合。
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
  //   s     笔画数（= 这个字含有的墨量）
  //   walk  通行速度倍率，0 = 不可通行
  //   kind  类别：blank 白纸 / ground 地面 / plant 植物 / water 水 / rock 山石 / fire 火 / object 造物 / radical 部件 / beast 兽 / drop 墨滴
  //   flam  可燃度 (0~1)
  //   light 夜间照亮半径（格）
  //   learn 吸收或合成后能否记入字典
  //   absorb 能否被吸墨
  //   tile  能否直接写在白纸上
  //   flavor 字典里的一句话
  const DB = {
    '白': { s: 5, walk: 1.0, kind: 'blank', learn: false, absorb: false, tile: false, flavor: '未着一墨的纸。天地有常，旧字终将自还。' },
    // —— 地面
    '田': { s: 5, walk: 1.5, kind: 'ground', ink: INK.field, flavor: '灌土为田，行路如飞。' },
    '土': { s: 3, walk: 1.0, kind: 'ground', ink: INK.soil, flavor: '厚德载物。久之生草。' },
    '沙': { s: 7, walk: 1.2, kind: 'ground', ink: INK.sand, flavor: '白日照沙，可得「日」。' },
    '灰': { s: 6, walk: 1.0, kind: 'ground', ink: INK.ash, flavor: '火后余烬，久之化土。' },
    '雪': { s: 11, walk: 0.7, kind: 'ground', ink: INK.snow, flavor: '高处积雪，遇火成水。' },
    // —— 植物
    '草': { s: 9, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.plant, flavor: '野火烧不尽。' },
    '花': { s: 7, walk: 1.0, kind: 'plant', flam: 0.4, ink: INK.red, flavor: '草间一点朱。' },
    '木': { s: 4, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.plant, flavor: '独木。两木相合，则成林。' },
    '竹': { s: 6, walk: 0.7, kind: 'plant', flam: 0.7, ink: INK.plant, flavor: '未出土时先有节。' },
    '林': { s: 8, walk: 0.6, kind: 'plant', flam: 0.7, ink: INK.forest, flavor: '双木成林。' },
    '森': { s: 12, walk: 0.5, kind: 'plant', flam: 0.8, ink: INK.forest, flavor: '三木成森，虎踞其中。' },
    // —— 水
    '水': { s: 4, walk: 0, kind: 'water', ink: INK.water, flavor: '上善若水。夜有月影。' },
    '淼': { s: 12, walk: 0, kind: 'water', ink: INK.deep, flavor: '水天一色，鱼游其间。' },
    // —— 山石
    '石': { s: 5, walk: 0.7, kind: 'rock', ink: INK.rock, flavor: '石可镇水。' },
    '磊': { s: 15, walk: 0, kind: 'rock', ink: INK.rock, flavor: '三石为磊，不可逾越。' },
    '山': { s: 3, walk: 0, kind: 'rock', ink: INK.rock, flavor: '山不可越，然可吸墨而去。' },
    // —— 火
    '火': { s: 4, walk: 0, kind: 'fire', light: 2.5, ink: INK.red, flavor: '星火可燎原。虎畏之。' },
    '炎': { s: 8, walk: 0, kind: 'fire', light: 3.5, ink: INK.red, flavor: '二火为炎。' },
    '焱': { s: 12, walk: 0, kind: 'fire', light: 4.5, ink: INK.red, flavor: '三火为焱，万物焦土。' },
    // —— 造物
    '明': { s: 8, walk: 1.0, kind: 'object', light: 5.5, ink: INK.gold, flavor: '日月为明。夜可照路，虎不敢近。' },
    '休': { s: 6, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '人倚木而休。站在其上按 E，可睡至天明。' },
    '桥': { s: 10, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '架木为桥。' },
    '困': { s: 7, walk: 0, kind: 'object', flam: 0.3, ink: INK.brown, flavor: '木困于口，是为墙。' },
    '碑': { s: 13, walk: 0, kind: 'object', learn: false, absorb: false, tile: false, ink: INK.black, flavor: '古碑，刻有造字之法。读之，砚台渐宽。' },
    // —— 部件（只用于合字）
    '口': { s: 3, kind: 'radical', tile: false, absorb: false, flavor: '口可囚物：写于兽上则困之，写于木上则成墙。' },
    '人': { s: 2, kind: 'radical', tile: false, absorb: false, flavor: '你自己。人倚木而休。' },
    '日': { s: 4, walk: 1.0, kind: 'radical', light: 2.5, ink: INK.red, flavor: '白日。与「月」相合而为明。' },
    '月': { s: 4, walk: 1.0, kind: 'radical', light: 1.5, ink: INK.gold, flavor: '水中之月。与「日」相合而为明。' },
    // —— 兽与墨滴（只作为实体出现）
    '鸟': { s: 5, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '飞鸟，见人则起。' },
    '鱼': { s: 8, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.water, flavor: '游鱼。' },
    '鹿': { s: 11, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '林间鹿，见人则走。' },
    '虎': { s: 8, kind: 'beast', tile: false, absorb: false, learn: false, ink: INK.beast, flavor: '森中虎，夜行，畏火与光。' },
    '丶': { s: 1, kind: 'drop', tile: false, absorb: false, learn: false, ink: INK.black, flavor: '一点墨。' }
  };
  // 视觉层级：底纹类的字（草、沙、田）画得小而淡，树、山、水才是"主角"——像水墨画里的皴与点
  const VIS = { '草': [0.6, 0.42], '花': [0.62, 0.8], '沙': [0.58, 0.5], '田': [0.78, 0.6], '土': [0.6, 0.5], '灰': [0.6, 0.5], '雪': [0.7, 0.55],
    '水': [0.82, 0.8], '淼': [0.95, 0.9], '石': [0.72, 0.85], '山': [1.12, 1], '木': [0.9, 1], '竹': [0.85, 0.95], '林': [1.0, 1], '森': [1.08, 1],
    '火': [0.9, 1], '炎': [1.0, 1], '焱': [1.1, 1], '碑': [1.05, 1], '日': [0.8, 1], '月': [0.8, 1] };
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
    const bd = DB[base];
    if (w === '土' && bd.kind === 'water') return '土遇水则散';
    if (w === '火' && bd.kind === 'water') return '火遇水即灭';
    if (w === '火') return '无物可燃';
    if (w === '口') return '口中空空，无物可困';
    if (w === '人') return '人无所倚';
    if (bd.kind === 'blank') return '';
    return '墨迹散了——「' + base + '」与「' + w + '」不可相合';
  }

  // 写字的代价：墨守恒。合字时至少要付出笔画差，也不低于所写之字本身。
  function writeCost(w, base, result) {
    const ws = DB[w].s;
    if (!base || !result) return ws;
    return Math.max(ws, DB[result].s - DB[base].s);
  }

  // 石碑上的提示。索引由区块哈希决定，所以同一块碑永远写着同一句话。
  const HINTS = [
    '双木成林，三木成森。',
    '日月同辉，是为「明」。夜行者宜持之。',
    '人倚木而休，可睡至天明。',
    '月沉水中，唯夜可见；日照沙雪，唯昼可得。面向它吸墨，即得其字。',
    '石可镇水，架木为桥；土遇水则散，不可填海。',
    '水克火，火焚木。火起于林，势不可挡。',
    '口可囚物：写于兽上则困之，写于木上则成墙。',
    '灌土为田，行路如飞。灰烬逢水，亦成沃野。',
    '吸尽之处，纸白如新；然天地有常，旧字终将自还。',
    '虎踞深森，夜则出猎，畏火与明。失墨之时，墨点四散，可再拾之。',
    '笔画即是墨：字繁者墨多，字简者墨少。天地之墨，不增不减。',
    '读碑者，砚台渐宽。'
  ];

  // ---------- 地貌生成 ----------
  // 三层噪声：高度 h、湿度 m、温度 t，再加一个逐格随机 d 做细节。
  function baseTile(x, y, seed) {
    const h = U.fbm(x / 64, y / 64, seed, 5);
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
      if (f > 0.62) return d < 0.04 ? '木' : '田';             // 成片的田
      if (d < 0.05) return '花';
      if (d < 0.14) return '木';
      return '草';
    }
    if (m < 0.60) return d < 0.5 ? '木' : d < 0.78 ? '林' : '草';   // 疏林
    if (m < 0.665) {
      if (t > 0.56 && d < 0.55) return '竹';                     // 温湿：竹林
      return d < 0.6 ? '林' : '木';
    }
    return d < 0.62 ? '森' : '林';                                // 深林
  }

  // 每个区块有一定概率立一块碑；位置与提示都由哈希决定
  function steleFor(cx, cy, seed, CH) {
    const r = U.hash2(cx, cy, seed + 777);
    if (r % 100 >= 5) return null;
    const lx = 3 + (r >>> 8) % (CH - 6);
    const ly = 3 + (r >>> 16) % (CH - 6);
    return { lx, ly, hint: (r >>> 24) % HINTS.length };
  }

  // 地貌名（给状态栏用）
  function biomeName(ch) {
    return ({ '淼': '深水', '水': '浅水', '沙': '沙地', '石': '石滩', '山': '群山', '雪': '雪原',
      '草': '草原', '花': '花野', '木': '疏林', '林': '林地', '森': '深林', '竹': '竹林', '田': '田野',
      '土': '荒土', '灰': '焦土', '白': '白纸', '火': '火场', '炎': '火场', '焱': '火场',
      '明': '明灯', '休': '营地', '桥': '桥', '困': '墙', '碑': '古碑', '日': '日', '月': '月' })[ch] || ch;
  }

  root.G = { INK, DB, FUSE, FUSE_LIST, HINTS, failReason, writeCost, baseTile, steleFor, biomeName,
    START_KNOWN: ['人', '木', '水', '火', '土', '口'] };
})();
