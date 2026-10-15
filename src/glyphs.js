// glyphs.js —— 字庫、物品與工具、配方、地貌生成、碑與地標
// 這是整個遊戲的「物理法則」：每個字是什麼、能不能走、取了得到什麼、多久長回來，以及東西怎麼造出來。
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U;

  const INK = {
    black: '#1c1a17', water: '#2f5878', deep: '#223f5a', rock: '#4a4f5c', snow: '#7f8ea3',
    plant: '#263428', forest: '#1b261d', red: '#b4392a', gold: '#9c6d12', brown: '#5a3e2b',
    sand: '#8d7a4b', ash: '#6f6a66', soil: '#6b4a2f', field: '#4f5a2f', beast: '#2a2320', ghost: '#3b3550', cotton: '#6f6a5a', brick: '#7a4a35', hemp: '#5a6a3a'
  };

  // 字庫（地上的格子）。欄位：
  //   s 筆畫；walk 通行倍率（0 不可通行）；kind 類別；flam 可燃；light 夜間照亮半徑；shelter 屋內；gate 人能過獸不能
  //   yield 取它得到什麼；time 徒手幾息；fast 用哪種工具快一倍；need 非用哪種工具不可；to 取走後變成什麼（預設白）；regrow 幾秒後長回來
  //   place 能否從囊中放回地上；onWater 只能放在淺水上；food 可食
  const DB = {
    '白': { s: 5, walk: 1.0, kind: 'blank', flavor: '未著一墨的紙。' },
    // —— 地面
    '田': { s: 5, walk: 1.5, kind: 'ground', ink: INK.field, yield: { '土': 1 }, time: 1.0, flavor: '耕過的地，走得快。' },
    '土': { s: 3, walk: 1.0, kind: 'ground', ink: INK.soil, yield: { '土': 1 }, time: 1.0, place: true, flavor: '泥土。二土一草可成磚；用鋤鋤之成田。' },
    '沙': { s: 7, walk: 1.2, kind: 'ground', ink: INK.sand, yield: { '沙': 1 }, time: 0.8, place: true, flavor: '沙。三沙入旺灶，燒成兩個玻璃瓶。' },
    '礫': { s: 20, walk: 1.0, kind: 'ground', ink: INK.rock, yield: { '石子': 2 }, time: 1.0, to: '沙', flavor: '碎石地（礫，音同「力」）。石子是磨刀石，也是火把的火心。' },
    '灰': { s: 6, walk: 1.0, kind: 'ground', ink: INK.ash, flavor: '火後餘燼，久之化土。' },
    '雪': { s: 11, walk: 0.7, kind: 'ground', ink: INK.snow, flavor: '高處積雪，寒。' },
    '路': { s: 13, walk: 1.4, kind: 'ground', ink: INK.sand, flavor: '走的人多了，也便成了路。' },
    '灘': { s: 22, walk: 1.2, kind: 'ground', ink: INK.sand, flavor: '潮退則沙，潮漲則水。' },
    // —— 植物（取走後會長回來）
    '草': { s: 10, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.plant, yield: { '草': 1 }, time: 0.5, regrow: 30, place: true, flavor: '野草。做磚、搓火把、合藥都要它。除草時偶爾驚出蜘蛛。' },
    '花': { s: 8, walk: 1.0, kind: 'plant', flam: 0.4, ink: INK.red, yield: { '花': 1 }, time: 0.5, regrow: 30, place: true, flavor: '草間一點硃。' },
    '棉': { s: 12, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.cotton, yield: { '棉': 2 }, time: 0.8, to: '草', regrow: 150, place: true, flavor: '野棉花。六團棉、兩塊木，是一張床。' },
    '麻': { s: 11, walk: 1.0, kind: 'plant', flam: 0.5, ink: INK.hemp, yield: { '麻': 2 }, time: 0.8, to: '草', regrow: 150, place: true, flavor: '野麻。麻四棉二織成麻布。' },
    '木': { s: 4, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.plant, yield: { '木': 1 }, time: 1.4, fast: '斧', regrow: 180, place: true, flavor: '一棵樹。斧伐之快一倍。' },
    '果': { s: 8, walk: 0.8, kind: 'plant', flam: 0.6, ink: INK.red, yield: { '果': 2 }, time: 0.8, to: '木', regrow: 210, place: true, food: { eat: 20 }, flavor: '野果樹。摘之可食；果在囊裡放過十五夜會醉。' },
    '竹': { s: 6, walk: 0.7, kind: 'plant', flam: 0.7, ink: INK.plant, yield: { '竹': 2 }, time: 1.2, fast: '斧', regrow: 180, place: true, flavor: '竹。可為筏、可為魚梁。' },
    '林': { s: 8, walk: 0.6, kind: 'plant', flam: 0.7, ink: INK.forest, yield: { '木': 2 }, time: 2.4, fast: '斧', regrow: 180, flavor: '雙木成林。' },
    '森': { s: 12, walk: 0.5, kind: 'plant', flam: 0.8, ink: INK.forest, yield: { '木': 3 }, time: 3.4, fast: '斧', regrow: 240, flavor: '三木成森，虎豹踞其中。' },
    // —— 水
    '水': { s: 4, walk: 0, kind: 'water', ink: INK.water, flavor: '淺水。有筏可渡，可架橋；空瓶可取海水。' },
    '淼': { s: 12, walk: 0, kind: 'water', ink: INK.deep, flavor: '深水。唯船可渡。' },
    // —— 山石
    '石': { s: 5, walk: 0.7, kind: 'rock', ink: INK.rock, yield: { '石': 1 }, time: 3.0, bonus: { '石子': 0.3 }, fast: '鎬', place: true, flavor: '石地。鎬採之快一倍，偶得石子。' },
    '磊': { s: 15, walk: 0, kind: 'rock', ink: INK.rock, yield: { '石': 3 }, time: 3.0, need: '鎬', flavor: '三石為磊。要用鎬。' },
    '山': { s: 3, walk: 0, kind: 'rock', ink: INK.rock, yield: { '石': 2 }, time: 2.0, need: '鎬', to: '石', flavor: '山不可越，鎬可鑿之。' },
    '煤': { s: 13, walk: 0, kind: 'rock', ink: INK.black, yield: { '煤': 2 }, time: 3.0, need: '鎬', to: '石', flavor: '煤層。要用鎬。入灶火旺而久；礦二煤一入旺灶，煉成鐵。' },
    '鐵': { s: 21, walk: 0, kind: 'rock', ink: INK.brick, yield: { '鐵礦': 2 }, bonus: { '鎢礦': 1 / 30 }, time: 3.5, need: '鎬', to: '石', flavor: '鐵礦脈。要用鎬。礦二煤一入旺灶，煉成鐵；鐵可打甲、盔、靴，鍛鋼具。鑿時三十分之一得鎢礦。' },
    // —— 火
    '火': { s: 4, walk: 0, kind: 'fire', light: 2.5, ink: INK.red, flavor: '火。虎豹畏之。' },
    '炎': { s: 8, walk: 0, kind: 'fire', light: 3.5, ink: INK.red, flavor: '二火為炎。' },
    '焱': { s: 12, walk: 0, kind: 'fire', light: 4.5, ink: INK.red, flavor: '三火為焱，萬物焦土。' },
    // —— 造物（從囊中放到地上）
    '灶': { s: 7, walk: 0, kind: 'object', ink: INK.red, yield: { '灶': 1 }, time: 1.0, place: true, flavor: '六石為灶。選中木或煤按 F 添柴；火旺時，魚、肉、蛇肉、蟾蜍按 F 烤熟，沙三燒成兩瓶，海水瓶蒸餾成淡水，鐵礦二加煤一煉成鐵。' },
    '鼎': { s: 13, walk: 0, kind: 'object', ink: INK.red, yield: { '鼎': 1 }, time: 1.5, place: true, flavor: '煉丹的鼎。添柴旺火，選中蟾蜍肉或毒蟾肉按 F 煉丹：前三顆無毒肉 8%、有毒肉 12%，第四顆起 1%、2%，真隨機。' },
    '磚': { s: 16, walk: 0, kind: 'object', ink: INK.brick, yield: { '磚': 1 }, time: 4.0, fast: '鎬', place: true, flavor: '二土一草成磚。獸不得過；魄能穿。鎬拆之快。' },
    '床': { s: 7, walk: 0, kind: 'object', ink: INK.brown, yield: { '床': 1 }, time: 1.0, place: true, flavor: '六團棉、兩塊木。夜裡面向它按 R，一覺到天明。' },
    '門': { s: 8, walk: 1.0, kind: 'object', gate: true, ink: INK.brown, yield: { '門': 1 }, time: 1.0, place: true, flavor: '人能過，獸不能。面向它按 E 可問路。' },
    '燈': { s: 16, walk: 0, kind: 'object', light: 5, ink: INK.gold, yield: { '燈': 1 }, time: 1.0, place: true, flavor: '石與火把成燈，長明不滅，只怕屋外的雨。魄六格內即煙滅。' },
    '橋': { s: 16, walk: 1.0, kind: 'object', flam: 0.3, ink: INK.brown, yield: { '橋': 1 }, time: 1.0, place: true, onWater: true, flavor: '架在水上的橋。' },
    '漁': { s: 14, walk: 0, kind: 'object', ink: INK.water, yield: { '漁': 1 }, time: 1.0, place: true, onWater: true, flavor: '魚梁。放在水上，隔一陣子就有魚。' },
    '網': { s: 14, walk: 0, kind: 'object', ink: INK.water, place: true, onWater: true, net: 1, flavor: '小漁網，棉麻草織成。放在淺水上，九十息一條魚、存三條；面向按 E 取魚，空網再按 E 收回。' },
    '罟': { s: 10, walk: 0, kind: 'object', ink: INK.water, place: true, onWater: true, net: 2, flavor: '四張小網編成的中網，二乘二，淺水深水皆可：三十息一條魚、存八條。' },
    '罾': { s: 17, walk: 0, kind: 'object', ink: INK.water, place: true, onWater: true, net: 3, flavor: '大網，三乘三，四張中網或十三張小網編成：十息一條魚、存二十條。' },
    '偶': { s: 11, walk: 0, kind: 'object', ink: INK.brown, yield: { '偶': 1 }, time: 1.0, place: true, flavor: '稻草人。三十天內獸不近身：前半十格，後半七格。再放一個可以續到四十天；面向按 E 拆下，重放重計。' },
    '櫃': { s: 18, walk: 0, kind: 'object', ink: INK.brown, yield: { '櫃': 1 }, time: 1.0, place: true, flavor: '四角用石、四邊用木的櫃子。面向它按 E 開，二十四格。' },
    '舟': { s: 6, walk: 0, kind: 'object', ink: INK.brown, place: true, onWater: true, flavor: '停著的船（孤帆一乘二、方舟二乘三）。面向它按 E 上船；上了船，深水亦可渡。' },
    '碑': { s: 13, walk: 0, kind: 'object', ink: INK.black, flavor: '古碑，刻著活下去的法子。讀之，力氣漸長。' },
    '包': { s: 5, walk: 0, kind: 'object', ink: INK.black, flavor: '落下的荷包。死時囊裡、具欄裡、身上的東西都在裡面。' },
    '牆': { s: 17, walk: 0, kind: 'object', ink: INK.brown, yield: { '石': 1 }, time: 3.0, fast: '鎬', flavor: '村裡的殘牆。' },
    // —— 地標（大字）
    '塔': { s: 13, walk: 0, kind: 'place', ink: INK.black, flavor: '從塔上能看見整張紙。' },
    '寺': { s: 6, walk: 1.0, kind: 'place', shelter: true, ink: INK.brown, flavor: '寺裡安靜，獸不敢進。' },
    '船': { s: 11, walk: 0, kind: 'place', ink: INK.brown, flavor: '擱淺的船。' },
    '泉': { s: 9, walk: 0, kind: 'place', ink: INK.water, flavor: '白水為泉。傍邊可療傷；空瓶可取淡水。' },
    '墓': { s: 14, walk: 0, kind: 'place', ink: INK.rock, flavor: '埋著寫錯的字。' },
    '洞': { s: 9, walk: 0, kind: 'place', ink: INK.black, flavor: '黑處藏著龍。' },
    '井': { s: 4, walk: 0, kind: 'place', ink: INK.water, flavor: '井裡有水。空瓶可取淡水。' },
    // —— 獸（hp 血；atk 一擊傷害；bite 每秒毒；passive 不惹不攻擊）
    '鳥': { s: 11, kind: 'beast', ink: INK.beast, hp: 10, flavor: '飛鳥，見人則起，捉不住。聽鳥鳴，心裡舒坦。' },
    '魚': { s: 11, kind: 'beast', ink: INK.water, hp: 10, food: { eat: 15, hurt: 5 }, flavor: '游魚。生食傷身，烤之則美。' },
    '鹿': { s: 11, kind: 'beast', ink: INK.beast, hp: 30, flavor: '林間鹿，見人則走。有刃可獵，得肉。聽鹿呦，心裡舒坦。' },
    '虎': { s: 8, kind: 'beast', ink: INK.beast, hp: 300, atk: 20, flavor: '森中虎，夜行，畏火與光。命三百：石劍八下，石刀十下；一撲二十滴血。' },
    '豹': { s: 10, kind: 'beast', ink: INK.beast, hp: 160, atk: 10, flavor: '林中豹，快，畏火與光。一撲十滴血。' },
    '狼': { s: 10, kind: 'beast', ink: INK.beast, hp: 160, atk: 10, flavor: '夜裡成群的狼，不怕火，磚與門擋得住。一口十滴血。' },
    '蛇': { s: 11, kind: 'beast', ink: INK.beast, hp: 90, bite: 3, flavor: '草木之交的毒蛇。約三息一口，一口五秒毒；連咬不斷（兩口相隔不過六息）滿十五口必死。' },
    '蛛': { s: 12, kind: 'beast', ink: INK.beast, hp: 90, bite: 3, passive: true, flavor: '除草時驚出的蜘蛛。不惹不咬；咬起來與蛇同。' },
    '蟾': { s: 19, kind: 'beast', ink: INK.beast, hp: 90, bite: 2, passive: true, flavor: '水邊的蟾蜍。紅的有毒會反咬；生吃皆中毒，烤了吃令人愜意。' },
    '魄': { s: 15, kind: 'beast', ink: INK.ghost, hp: 1, flavor: '第十三夜起夜行。無形，穿牆，不傷身而蝕心：四格內無光，愜意與力氣俱減。火把、蠟燭、燈帽、燈，六格內即煙滅。白日藏於林中。龜甲卜得吉兆，五日不來。' },
    '鷹': { s: 24, kind: 'beast', ink: INK.beast, hp: 60, atk: 12, flavor: '山間的鷹，半友好：不惹不啄，打牠就反啄。手持魚面向牠按 F 投魚可馴（第一隻 35%、第二隻 25%、第三隻起 10%）；馴了跟你走、替你打獸，餵魚回力。' },
    '龜': { s: 16, kind: 'beast', ink: INK.rock, hp: 50, passive: true, flavor: '水邊的龜，少見，不咬人。殺之得龜甲，灼而卜之。' },
    '蜃': { s: 13, kind: 'beast', ink: INK.red, hp: 900, atk: 30, ram: 25, sea: true, flavor: '海中的大蜃，吐氣成霧（蜃樓）。命九百，只在海上：撞船一下二十五，咬落水的人一口三十，所過之處吞吐霧障。船頭有獸首骨鎮著就不敢撞。九閽鳴雷打牠減半，燭龍焚溟專克。' },
    '龍': { s: 16, kind: 'beast', light: 3, ink: INK.red, hp: 500, flavor: '洞中之龍。隨你同行，夜能照路，獸與魄不敢近。' },
  };
  const VIS = { '草': [0.6, 0.42], '花': [0.62, 0.8], '棉': [0.75, 0.85], '麻': [0.72, 0.85], '沙': [0.58, 0.5], '礫': [0.62, 0.6], '田': [0.78, 0.6], '土': [0.6, 0.5], '灰': [0.6, 0.5], '雪': [0.7, 0.55],
    '水': [0.82, 0.8], '淼': [0.95, 0.9], '石': [0.72, 0.85], '山': [1.12, 1], '木': [0.9, 1], '果': [0.9, 1], '竹': [0.85, 0.95], '林': [1.0, 1], '森': [1.08, 1],
    '火': [0.9, 1], '炎': [1.0, 1], '焱': [1.1, 1], '灶': [0.95, 1], '鼎': [1.0, 1], '磚': [0.95, 1], '碑': [1.05, 1], '包': [0.9, 1], '煤': [1.0, 1], '鐵': [1.0, 1], '網': [1.0, 1], '罟': [1.0, 1], '罾': [1.0, 1], '偶': [1.0, 1], '櫃': [0.95, 1], '舟': [1.0, 1],
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

  // 囊中之物。工具：tool 類別、dmg 傷害、dur 耐久；light 手持照明半徑、life 可燃秒數；wear 穿戴即生效
  const ITEMS = {
    '石子': { s: 8, kind: 'item', flavor: '磨刀石。磨礪成工具，或重磨舊工具。' },
    '虎首骨': { s: 27, kind: 'use', ward: 3, flavor: '虎的頭骨。放在船頭（在船上選中按 V，或面向停著的船按 F），三日內蜃不敢撞船，時間到了風化。孤帆船頭放兩個、方舟五個，各鎮各的。' },
    '豹首骨': { s: 29, kind: 'use', ward: 2, flavor: '豹的頭骨。放在船頭，二日內蜃不敢撞船，時間到了風化。' },
    '狼首骨': { s: 29, kind: 'use', ward: 1, flavor: '狼的頭骨。放在船頭，一日內蜃不敢撞船，時間到了風化。' },
    '扇': { s: 10, kind: 'use', flavor: '草四木一紮成的蒲扇，一搧就散。帶在囊裡：走進霧障時會問你要不要用它吹散；選中按 V，三格內的霧障也吹得散。' },
    '麻布': { s: 22, kind: 'item', flavor: '麻四棉二織成的布。做稻草人、船帆、燈帽。' },
    '木板': { s: 12, kind: 'item', flavor: '木二劈成兩塊板。造船用。' },
    '船槳': { s: 29, kind: 'item', flavor: '木板二木一。' },
    '船帆': { s: 23, kind: 'item', flavor: '麻布四木二。' },
    '孤帆': { s: 16, kind: 'build', tile: '舟', ship: '孤帆', flavor: '一葉孤帆，一乘二。木板八、槳一、帆一。命一百二十，船頭放得下兩個獸首骨。放在淺水上，面向按 E 上船可渡深海。' },
    '方舟': { s: 14, kind: 'build', tile: '舟', ship: '方舟', flavor: '兩船相並為方舟，二乘三。木板三十六、槳四、帆三、鐵八、麻布六、鎢鋼二。命四百二十，船快只有孤帆的六成，船頭放得下五個獸首骨。要六格淺水才放得下。' },
    '肉': { s: 6, kind: 'food', food: { eat: 20, hurt: 8 }, flavor: '生肉。生食傷身，烤之則美。' },
    '烤魚': { s: 21, kind: 'food', food: { eat: 40 }, flavor: '灶上烤的魚。香。' },
    '烤肉': { s: 16, kind: 'food', food: { eat: 55 }, flavor: '灶上烤的肉。更香。' },
    '蛇肉': { s: 17, kind: 'food', food: { eat: 15, hurt: 6 }, flavor: '蛇的屍身。生食傷身，烤之可食。' },
    '烤蛇': { s: 21, kind: 'food', food: { eat: 30 }, flavor: '烤蛇。' },
    '蟾蜍肉': { s: 38, kind: 'food', food: { eat: 5, poison: [2, 5] }, flavor: '無毒蟾蜍的肉。生吃也中毒（每秒二，五秒），烤了加愜意；入鼎煉丹，前三顆成功率 8%、之後 1%。' },
    '毒蟾肉': { s: 38, kind: 'food', food: { eat: 5, poison: [3, 5] }, flavor: '有毒蟾蜍的肉。生吃中毒（每秒三，五秒），烤了加愜意；入鼎煉丹，前三顆成功率 12%、之後 2%。' },
    '丹': { s: 4, kind: 'use', flavor: '鼎裡煉出的丹。選中按 V 服下：前五十顆每顆命上限 +3%，之後每顆 +0.5%，無上限。' },
    '烤蟾': { s: 29, kind: 'food', food: { eat: 10, san: 10 }, flavor: '烤蟾蜍。飽 +10，愜意 +10。' },
    '醉果': { s: 23, kind: 'food', food: { knock: 60, eat: 2, san: 1, sta: -5 }, flavor: '放過十五夜的果子，醉了。吃了昏迷一刻（六十息），醒來飽 +2、愜意 +1、力 −5。' },
    '藥': { s: 19, kind: 'food', food: { heal: 35, cure: true }, flavor: '草三果一合成的藥。療傷 +35，解毒。' },
    '衣': { s: 6, kind: 'wear', slot: '襯', red: 0.02, warm: true, flavor: '舊式棉衣，當內襯穿。' },
    '內襯': { s: 10, kind: 'wear', slot: '襯', red: 0.02, warm: true, flavor: '棉麻內襯。穿上禦寒減半、受傷減二分。五件穿齊、十重膽氣，便是山海衣。' },
    '布褲': { s: 15, kind: 'wear', slot: '褲', red: 0.02, flavor: '麻布褲。受傷減二分。' },
    '布甲': { s: 10, kind: 'wear', slot: '甲', red: 0.03, flavor: '麻布甲。受傷減三分。' },
    '布帽': { s: 12, kind: 'wear', slot: '盔', red: 0.02, flavor: '麻布帽。受傷減二分。' },
    '布靴': { s: 13, kind: 'wear', slot: '靴', red: 0.01, flavor: '麻布靴。受傷減一分。' },
    '鐵甲': { s: 21, kind: 'wear', slot: '甲', red: 0.14, iron: true, flavor: '鐵甲。受傷減一成四；鐵甲鐵盔鐵靴三件齊，毒不侵，但慢四分之一。' },
    '鐵盔': { s: 21, kind: 'wear', slot: '盔', red: 0.07, iron: true, flavor: '鐵盔。受傷減七分。' },
    '鐵靴': { s: 21, kind: 'wear', slot: '靴', red: 0.05, iron: true, flavor: '鐵靴。受傷減五分。' },
    '漁網': { s: 14, kind: 'build', tile: '網', flavor: '棉二麻二草三織成的小漁網。放在淺水上，九十息一魚、存三條。四張可編成中網。' },
    '中漁網': { s: 14, kind: 'build', tile: '罟', flavor: '四張小網編成，二乘二，淺深水皆可：三十息一魚、存八條。四張可編成大網。' },
    '大漁網': { s: 17, kind: 'build', tile: '罾', flavor: '三乘三的大網，深海也放得：十息一魚、存二十條。' },
    '錦囊': { s: 16, kind: 'use', flavor: '麻布三棉二織成的錦囊。選中按 V 用掉：囊永久多兩格、具欄多一格。最多用四個。' },
    '龜甲': { s: 16, kind: 'use', flavor: '龜甲。選中按 V 灼而卜之：四分之一的機會得吉兆，五日內魄不來；不吉則甲裂無用。' },
    '燭龍焚溟': { s: 58, kind: 'tool', tool: '焚', dmg: 120, dur: 199, flavor: '燭龍銜火，焚盡溟海。火屬而克海水，故為神兵。膽氣卅一重方可造、可揮：面向獸按 E，三格內諸獸同受灼燒，海中之物（蜃、龜）一百二十，陸上與天上之物減半。' },
    '九閽鳴雷': { s: 26, kind: 'tool', tool: '鎚', dmg: 120, dur: 199, flavor: '撼地之鎚。膽氣卅一重方可造、可掄：面向獸按 E，三格內諸獸同受一百二十傷。隨身則膽氣二日一減、下限廿五重；低於卅一重掄不動。' },
    '鐵礦': { s: 21, flavor: '鐵礦石。礦二煤一入旺灶，煉成鐵。' },
    '鎢礦': { s: 21, flavor: '鎢礦石，鑿鐵礦脈時三十分之一的機會挖到。鎢礦一、鐵礦二、精煤一入旺灶，煉成鎢鋼。' },
    '精煤': { s: 14, flavor: '八塊煤煉成的精煤。煉鎢鋼、鍛鎢鋼具要它；入灶可燒三百息。' },
    '鎢鋼': { s: 21, flavor: '鎢鋼。可鍛刀鎬鋤劍斧，可打甲盔靴，強過鋼。' },
    '鎢鋼甲': { s: 21, kind: 'wear', slot: '甲', red: 0.22, iron: true, tung: true, life: 360, flavor: '鎢鋼甲。受傷減二成二，壽命三百六十日。修補要鎢鋼一、力十二、飽十五。' },
    '鎢鋼盔': { s: 21, kind: 'wear', slot: '盔', red: 0.11, iron: true, tung: true, life: 360, flavor: '鎢鋼盔。受傷減一成一，壽命三百六十日。' },
    '鎢鋼靴': { s: 21, kind: 'wear', slot: '靴', red: 0.08, iron: true, tung: true, life: 360, flavor: '鎢鋼靴。受傷減八分，壽命三百六十日。' },
    '鐵': { s: 21, flavor: '煉好的鐵。可打甲、盔、靴，鍛鋼具，鑄鼎。' },
    '燈帽': { s: 33, kind: 'wear', slot: '帽', light: 2, single: true, fuel: 400, flavor: '麻布燈帽。戴在頭上就有光，兩格，與盔不衝突；裝一根蠟燭燒四百息，燒完選中蠟燭按 V 續上。' },
    '竹筏': { s: 18, kind: 'tool', flavor: '囊中有筏，可行於淺水，捉魚更易。' },
    '火把': { s: 11, kind: 'tool', light: 3, life: 180, flavor: '拿在手上才亮，照路三格，禦寒。燃盡即無。' },
    '蠟燭': { s: 37, kind: 'tool', light: 2, life: 240, flavor: '棉一肉一製成。拿在手上才亮，照路兩格。' },
    '玻璃瓶': { s: 32, kind: 'item', flavor: '空瓶。面向水按 E 取海水，面向泉或井取淡水。' },
    '海水瓶': { s: 36, kind: 'item', flavor: '一瓶海水，鹹，喝不得。放在旺的灶上蒸餾成淡水。' },
    '淡水瓶': { s: 36, kind: 'food', food: { eat: 6, bottle: true }, flavor: '一瓶淡水。飲之解渴（飽 +6）。醉果二合淡水一成果酒。' },
    '果酒': { s: 18, kind: 'food', food: { eat: 12, san: 20, bottle: true }, flavor: '果酒。飽 +12，愜意 +20。' },
    '石刀': { s: 7, kind: 'tool', tool: '刀', dmg: 30, dur: 40, flavor: '一下三十。獵鹿一刀，蛇蛛蟾三刀，豹狼六刀，打虎十刀。' },
    '石鎬': { s: 23, kind: 'tool', tool: '鎬', dmg: 15, dur: 40, flavor: '鑿山採石、拆磚，快一倍。' },
    '石鋤': { s: 20, kind: 'tool', tool: '鋤', dmg: 15, dur: 40, flavor: '鋤在手，面向土或草按 E，鋤之成田。' },
    '石劍': { s: 20, kind: 'tool', tool: '劍', dmg: 40, dur: 40, flavor: '一下四十。鹿一劍，蛇蛛蟾三劍，豹狼四劍，虎八劍。' },
    '石斧': { s: 13, kind: 'tool', tool: '斧', dmg: 15, dur: 40, flavor: '伐木伐竹快一倍。' },
    // 鋼具：鐵二木一煤一鍛成，耐久與戰力是石具的 140%
    '鋼刀': { s: 16, kind: 'tool', tool: '刀', dmg: 42, dur: 56, flavor: '鋼刀。一下四十二，耐久五十六。' },
    '鋼鎬': { s: 16, kind: 'tool', tool: '鎬', dmg: 21, dur: 56, flavor: '鋼鎬。鑿山採礦，耐久五十六。' },
    '鋼鋤': { s: 16, kind: 'tool', tool: '鋤', dmg: 21, dur: 56, flavor: '鋼鋤。鋤地成田，耐久五十六。' },
    '鋼劍': { s: 16, kind: 'tool', tool: '劍', dmg: 56, dur: 56, flavor: '鋼劍。一下五十六，耐久五十六。' },
    '鋼斧': { s: 16, kind: 'tool', tool: '斧', dmg: 21, dur: 56, flavor: '鋼斧。伐木伐竹，耐久五十六。' },
    // 鎢鋼具：鎢鋼二木一精煤一鍛成，強度是鋼具的 150%、耐久是鋼具的 200%；重磨要耗力也耗飽
    '鎢鋼刀': { s: 21, kind: 'tool', tool: '刀', dmg: 63, dur: 112, tung: true, flavor: '鎢鋼刀。一下六十三，耐久一百一十二。重磨耗力八、飽十。' },
    '鎢鋼鎬': { s: 21, kind: 'tool', tool: '鎬', dmg: 32, dur: 112, tung: true, flavor: '鎢鋼鎬。耐久一百一十二。重磨耗力八、飽十。' },
    '鎢鋼鋤': { s: 21, kind: 'tool', tool: '鋤', dmg: 32, dur: 112, tung: true, flavor: '鎢鋼鋤。耐久一百一十二。重磨耗力八、飽十。' },
    '鎢鋼劍': { s: 21, kind: 'tool', tool: '劍', dmg: 84, dur: 112, tung: true, flavor: '鎢鋼劍。一下八十四，耐久一百一十二。重磨耗力八、飽十。' },
    '鎢鋼斧': { s: 21, kind: 'tool', tool: '斧', dmg: 32, dur: 112, tung: true, flavor: '鎢鋼斧。耐久一百一十二。重磨耗力八、飽十。' },
  };
  const TOOL_NAMES = { '刀': '刀', '鎬': '鎬', '鋤': '鋤', '劍': '劍', '斧': '斧', '鎚': '九閽鳴雷', '焚': '燭龍焚溟' };   // 石、鋼、鎢鋼都算
  // 船：兩種。off 是行船時船身相對於人的格子（人站在船身裡）；hp 命；slots 船頭放得下幾個獸首骨
  const SHIPS = {
    '孤帆': { w: 1, h: 2, hp: 120, slots: 2, speed: 1, off: [[0, 0], [0, 1]] },
    '方舟': { w: 2, h: 3, hp: 420, slots: 5, speed: 0.6, off: [[0, 0], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] },   // 船快是孤帆的六成   // 第一格是人站的那格（左邊中間）
  };
  // 製作欄的大類（左側選）：每條配方照 id 歸類，沒列到的進「材料」
  const CRAFT_CATS = ['全部', '居所', '工具', '衣甲', '燈火', '漁船', '食藥', '材料'];
  const CAT_OF = {
    '居所': ['brick', 'door', 'bed', 'chest', 'stove', 'cauldron', 'scarecrow', 'bridge'],
    '工具': ['grind', 'regrind', 'forge', 'forgew', 'fan', 'hammer', 'seagod'],
    '衣甲': ['lining', 'pants', 'vest', 'cap', 'shoes', 'ironvest', 'helm', 'ironboots', 'wvest', 'whelm', 'wboots'],
    '燈火': ['torch', 'candle', 'lamp', 'hat'],
    '漁船': ['weir', 'net', 'midnet', 'bignet', 'bignet13', 'raft', 'plank', 'oar', 'sail', 'ship', 'ark'],
    '食藥': ['med', 'wine'],
  };
  function item(name) { return ITEMS[name] || DB[name] || null; }
  // 灶上：放什麼變什麼（n 一次要幾個，out 得幾個）
  const COOK = { '魚': { out: '烤魚' }, '肉': { out: '烤肉' }, '蛇肉': { out: '烤蛇' }, '蟾蜍肉': { out: '烤蟾' }, '毒蟾肉': { out: '烤蟾' }, '海水瓶': { out: '淡水瓶' }, '沙': { n: 3, out: '玻璃瓶', k: 2 }, '鐵礦': { n: 2, out: '鐵', k: 1, extra: { '煤': 1 }, verb: '煉成了' }, '鎢礦': { n: 1, out: '鎢鋼', k: 1, extra: { '鐵礦': 2, '精煤': 1 }, verb: '煉成了' } };

  // 配方（製作耗力；level 要幾重膽氣）
  const RECIPES = [
    { id: 'brick', out: '磚', n: 2, need: { '土': 2, '草': 1 }, sta: 3, note: '獸不得過，砌一圈留一扇門' },
    { id: 'door', out: '門', n: 1, need: { '木': 3 }, sta: 4, note: '人能過，獸不能' },
    { id: 'bed', out: '床', n: 1, need: { '棉': 6, '木': 2 }, sta: 10, note: '夜裡面向它按 R，一覺到天明' },
    { id: 'chest', out: '櫃', n: 1, need: { '石': 4, '木': 4 }, sta: 6, note: '四角石四邊木，二十四格' },
    { id: 'torch', out: '火把', n: 4, need: { '石子': 1, '草': 3, '木': 2 }, sta: 2, note: '石子一草三木二成四根；拿在手上才亮' },
    { id: 'candle', out: '蠟燭', n: 2, need: { '棉': 1, '肉': 1 }, sta: 2, note: '拿在手上才亮，照兩格' },
    { id: 'lamp', out: '燈', n: 1, need: { '石': 2, '火把': 1 }, sta: 4, note: '放在地上，長明不滅' },
    { id: 'stove', out: '灶', n: 1, need: { '石': 6 }, sta: 6, note: '烤食、燒瓶、蒸餾；添木續火' },
    { id: 'cauldron', out: '鼎', n: 1, need: { '鐵': 3, '石': 4, '鎢鋼': 1, '精煤': 2 }, sta: 12, note: '煉丹用，添柴如灶' },
    { id: 'fan', out: '扇', n: 1, need: { '草': 4, '木': 1 }, sta: 2, note: '一次性，吹散一片霧障' },
    { id: 'seagod', out: '燭龍焚溟', n: 1, need: { '鎢鋼': 4, '精煤': 6, '火把': 4, '海水瓶': 3 }, sta: 60, level: 31, note: '三格內諸獸同受灼燒：海中之物一百二十，陸上天上減半' },
    { id: 'grind', out: null, need: { '石': 1, '石子': 1, '木': 1 }, sta: 8, note: '磨礪：選刀、鎬、鋤、劍、斧', choose: ['石刀', '石鎬', '石鋤', '石劍', '石斧'] },
    { id: 'regrind', out: null, need: { '石子': 1 }, sta: 3, note: '重磨手中的工具，耐久復滿', regrind: true },
    { id: 'forge', out: null, need: { '鐵': 2, '木': 1, '煤': 1 }, sta: 10, note: '鍛鋼具：耐久與戰力是石具的 140%', choose: ['鋼刀', '鋼鎬', '鋼鋤', '鋼劍', '鋼斧'] },
    { id: 'coke', out: '精煤', n: 1, need: { '煤': 8 }, sta: 4, note: '八煤成一精煤，煉鎢鋼用' },
    { id: 'forgew', out: null, need: { '鎢鋼': 2, '木': 1, '精煤': 1 }, sta: 16, note: '鍛鎢鋼具：強度是鋼的 150%、耐久 200%', choose: ['鎢鋼刀', '鎢鋼鎬', '鎢鋼鋤', '鎢鋼劍', '鎢鋼斧'] },
    { id: 'lining', out: '內襯', n: 1, need: { '棉': 4, '麻': 2 }, sta: 6, note: '禦寒減半，減傷 2%' },
    { id: 'pants', out: '布褲', n: 1, need: { '麻布': 2, '棉': 2 }, sta: 5, note: '減傷 2%' },
    { id: 'vest', out: '布甲', n: 1, need: { '麻布': 3, '棉': 3 }, sta: 8, note: '減傷 3%' },
    { id: 'cap', out: '布帽', n: 1, need: { '麻布': 1, '棉': 1 }, sta: 3, note: '減傷 2%' },
    { id: 'shoes', out: '布靴', n: 1, need: { '麻布': 1, '棉': 1, '木': 1 }, sta: 4, note: '減傷 1%' },
    { id: 'ironvest', out: '鐵甲', n: 1, need: { '鐵': 5, '麻布': 1 }, sta: 14, note: '減傷 14%；鐵三件齊毒不侵' },
    { id: 'helm', out: '鐵盔', n: 1, need: { '鐵': 3 }, sta: 10, note: '減傷 7%' },
    { id: 'ironboots', out: '鐵靴', n: 1, need: { '鐵': 2, '麻布': 1 }, sta: 8, note: '減傷 5%' },
    { id: 'wvest', out: '鎢鋼甲', n: 1, need: { '鎢鋼': 5, '麻布': 1 }, sta: 20, note: '減傷 22%，壽命三百六十日' },
    { id: 'whelm', out: '鎢鋼盔', n: 1, need: { '鎢鋼': 3 }, sta: 16, note: '減傷 11%，壽命三百六十日' },
    { id: 'wboots', out: '鎢鋼靴', n: 1, need: { '鎢鋼': 2, '麻布': 1 }, sta: 12, note: '減傷 8%，壽命三百六十日' },
    { id: 'pouch', out: '錦囊', n: 1, need: { '麻布': 3, '棉': 2 }, sta: 10, note: '用掉：囊多兩格、具欄多一格，最多四個' },
    { id: 'hemp', out: '麻布', n: 1, need: { '麻': 4, '棉': 2 }, sta: 4, note: '稻草人、船帆、燈帽都要' },
    { id: 'hat', out: '燈帽', n: 1, need: { '麻布': 2, '蠟燭': 1 }, sta: 5, note: '戴著就有光；一根蠟燭燒四百息' },
    { id: 'scarecrow', out: '偶', n: 1, need: { '麻布': 2, '石子': 2, '木': 3, '草': 4 }, sta: 8, note: '三十天內獸不近身' },
    { id: 'med', out: '藥', n: 1, need: { '草': 3, '果': 1 }, sta: 3, note: '療傷 +35，解毒' },
    { id: 'wine', out: '果酒', n: 1, need: { '醉果': 2, '淡水瓶': 1 }, sta: 2, note: '飽 +12，愜意 +20' },
    { id: 'bridge', out: '橋', n: 2, need: { '木': 4 }, sta: 5, note: '架在淺水上' },
    { id: 'raft', out: '竹筏', n: 1, need: { '竹': 6 }, sta: 8, note: '可行於淺水' },
    { id: 'weir', out: '漁', n: 1, need: { '竹': 4, '草': 2 }, sta: 5, note: '放在水上，隔一陣子有魚' },
    { id: 'net', out: '漁網', n: 1, need: { '棉': 2, '麻': 2, '草': 3 }, sta: 4, note: '小網一乘一，淺水：九十息一魚、存三' },
    { id: 'midnet', out: '中漁網', n: 1, need: { '漁網': 4 }, sta: 6, note: '中網二乘二，淺深皆可：三十息一魚、存八' },
    { id: 'bignet', out: '大漁網', n: 1, need: { '中漁網': 4 }, sta: 8, note: '大網三乘三：十息一魚、存二十' },
    { id: 'bignet13', out: '大漁網', n: 1, need: { '漁網': 13 }, sta: 10, note: '十三張小網直接編成大網' },
    { id: 'plank', out: '木板', n: 2, need: { '木': 2 }, sta: 2, note: '造船用' },
    { id: 'oar', out: '船槳', n: 1, need: { '木板': 2, '木': 1 }, sta: 4, note: '造船用' },
    { id: 'sail', out: '船帆', n: 1, need: { '麻布': 4, '木': 2 }, sta: 6, note: '造船用' },
    { id: 'ship', out: '孤帆', n: 1, need: { '木板': 8, '船槳': 1, '船帆': 1 }, sta: 16, level: 8, note: '膽氣八重方可造。一乘二，命一百二十，船頭兩個首骨' },
    { id: 'ark', out: '方舟', n: 1, need: { '木板': 36, '船槳': 4, '船帆': 3, '鐵': 8, '麻布': 6, '鎢鋼': 2 }, sta: 48, level: 8, note: '二乘三，命四百二十，船頭五個首骨，船快六成；要六格淺水' },
    { id: 'hammer', out: '九閽鳴雷', n: 1, need: { '鐵': 12, '煤': 6, '石子': 9, '麻布': 2, '果酒': 1 }, sta: 60, level: 31, note: '三格內諸獸同受 120 傷；隨身膽氣二日一減、下限廿五重' },
  ];

  // ---------- 一紙之島 ----------
  // 島的半徑與海的盡頭：v0.11 起面積加倍，邊長 ×√2（60 → 85；海的盡頭 80 → 113）
  const ISLAND_R = 85, SEA_EDGE = 113;
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
    const o = U.rand2(x, y, seed + 11);   // 山裡偶有煤層與鐵礦脈
    if (h > 0.69) return d < 0.75 ? '雪' : (o < 0.04 ? '鐵' : o < 0.09 ? '煤' : '山');
    if (h > 0.645) return d < 0.72 ? (o < 0.03 ? '鐵' : o < 0.07 ? '煤' : '山') : (o < 0.03 ? '煤' : '石');
    if (h > 0.615) return d < 0.4 ? '石' : d < 0.5 ? '礫' : (m > 0.5 ? '木' : '草');

    // 平原與丘陵：由濕度決定植被。棉的機率減半，麻是棉的一半
    if (m < 0.36) {
      if (t > 0.56) return d < 0.9 ? '沙' : d < 0.96 ? '礫' : '石';
      return d < 0.05 ? '石' : d < 0.1 ? '木' : d < 0.12 ? '棉' : d < 0.13 ? '麻' : '草';
    }
    if (m < 0.50) {
      const f = U.fbm(x / 20 + 90, y / 20 + 90, seed + 41, 2);
      if (f > 0.62) return d < 0.05 ? '果' : '田';
      if (d < 0.05) return '果';
      if (d < 0.09) return '花';
      if (d < 0.115) return '棉';
      if (d < 0.1275) return '麻';
      if (d < 0.2) return '木';
      return '草';
    }
    if (m < 0.60) return d < 0.05 ? '果' : d < 0.5 ? '木' : d < 0.78 ? '林' : d < 0.8 ? '棉' : d < 0.81 ? '麻' : '草';
    if (m < 0.665) {
      if (t > 0.56 && d < 0.55) return '竹';
      return d < 0.6 ? '林' : '木';
    }
    return d < 0.62 ? '森' : '林';
  }
  // 每座島保證八叢礦（煤鐵各四），放在山石上，避開通往燈塔的灘道；naturalTile 裡另有零星的
  function onCauseway(x, y, seed) {   // 通往燈塔的灘道（含兩側一格餘裕）：礦、碑、地標都不能壓在上面
    const il = islet(seed), proj = x * il.ux + y * il.uy, perp = Math.abs(x * il.uy - y * il.ux);
    return perp <= 2.5 && proj > 0 && proj < il.len;
  }
  const oreCache = {};
  function orePlan(seed) {
    if (oreCache[seed]) return oreCache[seed];
    const m = new Map(), centers = [];
    const far = (x, y) => centers.every(c => U.cheb(x, y, c[0], c[1]) > 5);           // 每叢各佔一處，不疊在一起
    const rocky = (x, y) => far(x, y) && '山石磊'.indexOf(naturalTile(x, y, seed)) >= 0 && fields(x, y, seed).h > 0.5 && !onCauseway(x, y, seed);
    const inland = (x, y) => { const d = DB[naturalTile(x, y, seed)]; return d.kind !== 'water' && d.kind !== 'place' && fields(x, y, seed).h > 0.45 && !onCauseway(x, y, seed); };
    const kinds = []; for (let i = 0; i < 20; i++) kinds.push(i % 2 ? '鐵' : '煤');       // 面積加倍，礦叢也加倍：煤鐵各十叢
    kinds.forEach((kind, i) => {
      const a = (i / 20) * Math.PI * 2 + U.rand2(i, 31, seed) * 0.3, rf = 0.25 + U.rand2(i, 37, seed) * 0.5;
      const tx = Math.round(Math.cos(a) * rf * ISLAND_R), ty = Math.round(Math.sin(a) * rf * ISLAND_R);
      const found = spiralFind(tx, ty, 45, rocky) || spiralFind(tx, ty, 45, (x, y) => far(x, y) && inland(x, y));   // 沒山的島，礦露在地上
      if (!found) return;
      centers.push(found);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = found[0] + dx, ny = found[1] + dy, ring2 = Math.max(Math.abs(dx), Math.abs(dy)) === 2;
        if (ring2 && U.rand2(nx, ny, seed + 41) > 0.4) continue;
        if (inland(nx, ny) && !m.has(nx + ',' + ny)) m.set(nx + ',' + ny, kind);
      }
    });
    return (oreCache[seed] = m);
  }
  function baseTile(x, y, seed) {
    const il = islet(seed);
    const di = Math.hypot(x - il.cx, y - il.cy);
    if (di <= 6.1) return di < 3.4 ? (U.rand2(x, y, seed + 5) < 0.12 ? '花' : '草') : '沙';
    const ore = orePlan(seed).get(x + ',' + y); if (ore) return ore;
    const nat = naturalTile(x, y, seed);
    const proj = x * il.ux + y * il.uy, perp = Math.abs(x * il.uy - y * il.ux);
    if (perp <= 1.3 && proj > 2 && proj < il.len - 3.5) {
      if (DB[nat].kind === 'water') return '灘';
      if (DB[nat].kind === 'rock' && DB[nat].walk <= 0) return '石';
    }
    return nat;
  }

  // 五塊碑，由近到遠各講一個活下去的法子；讀碑力氣上限 +10
  const STELES = [
    { r: 0.26, hint: '六團棉、兩塊木，是一張床。夜裡面向它按 R，一覺到天明，愜意 +20；附近有魄則睡不著。' },
    { r: 0.42, hint: '二土一草成磚，木三成門，石四木四成櫃。砌一圈留一扇門，獸不得入。麻布三棉二織錦囊，用之囊更大。麻布二石子二木三草四，是一個稻草人，三十天內獸不近身。' },
    { r: 0.56, hint: '石子磨石加一根木，可成刀、鎬、鋤、劍、斧。山裡有煤有鐵，礦二煤一入旺灶可煉鐵，鐵可打甲。蛇與蛛咬人有毒，連咬不斷（兩口相隔不過六息）滿十五口必死；藥可解毒。豹與狼一撲十滴血。' },
    { r: 0.70, hint: '第十三夜起，魄夜行，穿牆而過，不傷身而蝕心。手持火把或蠟燭、頭戴燈帽、地上有燈，六格內魄即煙滅。白日藏於林中。' },
    { r: 0.83, hint: '野果久藏則醉，醉可昏睡一刻。沙三入旺灶成瓶，瓶取泉水，醉果二合淡水成酒，飲之愜意。膽氣八重，可造孤帆、方舟渡海；卅一重，鐵十二煤六石子九，可鑄九閽鳴雷。' }
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
      const found = spiralFind(tx, ty, 40, (x, y) => { const d = DB[baseTile(x, y, seed)]; return d.walk > 0 && d.kind !== 'water' && !onCauseway(x, y, seed); });
      if (found) out.push({ x: found[0], y: found[1], hint: s.hint });
    });
    return out;
  }

  // 八處地標。每處一段話，連起來是一個小故事：這座島是誰寫的。
  const VILLAGE = ['牆牆牆門牆牆牆', '牆草草草草草牆', '牆草草草草草牆', '門草草井草草門', '牆草草草草草牆', '牆草草草草草牆', '牆牆牆門牆牆牆'];   // 七乘七，井在正中
  const PLACES = [
    { id: 'ta', ch: '塔', name: '塔', w: 2, h: 2, r: [0.30, 0.52], want: 'high', effect: 'reveal',
      text: '從塔上能看見整張紙。我在這裡寫了一個「望」字，先生用硃筆把它圈起來了，說：字可以望嗎？我說可以。' },
    { id: 'si', ch: '寺', name: '寺', w: 2, h: 2, r: [0.40, 0.68], want: 'forest', effect: 'shelter',
      text: '寺裡很安靜，獸不敢進來。先生說，字寫得靜，心就靜。我在這裡抄了一百個「靜」字，一個也沒留下。' },
    { id: 'cun', name: '村', template: VILLAGE, r: [0.28, 0.55], want: 'grass', effect: 'well',
      text: '村裡沒有人。人都在字典裡。井裡有水，水裡有月，月裡有——我還沒想好。對著門問，門會指路。' },
    { id: 'chuan', ch: '船', name: '船', w: 2, h: 1, r: [0.74, 0.96], want: 'beach', effect: 'raft',
      text: '這條船是我畫的。先生說船字不是這樣寫，可我見過的船就是這樣。船裡有一隻筏子，你拿去。要渡海，得自己造一條大的。' },
    { id: 'quan', ch: '泉', name: '泉', w: 1, h: 1, r: [0.34, 0.66], want: 'forest', effect: 'heal',
      text: '泉是水從石頭裡出來，像字從筆裡出來。鹿傍晚都會來，牠們不怕我，因為我也是字。' },
    { id: 'mu', ch: '墓', name: '墓', w: 1, h: 1, r: [0.40, 0.72], want: 'grass', effect: 'bricks',
      text: '這裡埋著我寫錯的字。先生說，錯字也能砌牆，別扔。我砌了幾塊磚，你拿去。' },
    { id: 'dong', ch: '洞', name: '洞', w: 1, h: 1, r: [0.48, 0.86], want: 'mountain', effect: 'dragon',
      text: '洞裡黑。先生說，黑處藏著龍。我不信。你去看看，看見了，牠就跟你走。' },
    { id: 'deng', ch: '燈', name: '燈', w: 1, h: 2, islet: true, effect: 'end',
      text: '燈最遠。潮退了才走得到。我把名字寫在這裡，可先生說名字不能寫在紙上，會被風吹走。那就寫在你心裡吧。你來了，就算讀完了這張紙。' }
  ];
  const mainCache = {};
  function mainland(seed) {           // 從島心走得到的底稿格（退潮：灘算沙），用來保證地標走得到
    if (mainCache[seed]) return mainCache[seed];
    const walk = (x, y) => { const t = baseTile(x, y, seed), d = DB[t === '灘' ? '沙' : t]; return d.walk > 0 && d.kind !== 'water'; };
    const start = spiralFind(0, 0, 30, (x, y) => '草田土沙'.indexOf(baseTile(x, y, seed)) >= 0) || [0, 0];
    const seen = new Set([start[0] + ',' + start[1]]), q = [start];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (seen.has(k) || Math.abs(nx) > SEA_EDGE || Math.abs(ny) > SEA_EDGE || !walk(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return (mainCache[seed] = seen);
  }
  function touchesMain(x0, y0, w, h, main) {
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) if ((j === -1 || j === h || i === -1 || i === w) && main.has((x0 + i) + ',' + (y0 + j))) return true;
    return false;
  }
  function footprintOk(x0, y0, w, h, seed, want, taken, main) {
    if (main && !touchesMain(x0, y0, w, h, main)) return false;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = x0 + i, y = y0 + j;
      if (taken.has(x + ',' + y)) return false;
      const ch = baseTile(x, y, seed), d = DB[ch];
      if (want === 'high') { if ('石礫草木田'.indexOf(ch) < 0 || fields(x, y, seed).h < 0.58) return false; }
      else if (want === 'forest') { if ('林木森竹草果棉麻'.indexOf(ch) < 0) return false; }
      else if (want === 'grass') { if ('草田花木果棉麻'.indexOf(ch) < 0) return false; }
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
    const out = [], il = islet(seed), main = mainland(seed);
    for (let pj = 0; pj <= il.len; pj++) for (let pp = -2; pp <= 2; pp++) taken.add(Math.round(pj * il.ux + pp * il.uy) + ',' + Math.round(pj * il.uy - pp * il.ux));   // 灘道留空
    PLACES.forEach((pl, i) => {
      const w = pl.template ? pl.template[0].length : pl.w, h = pl.template ? pl.template.length : pl.h;
      let found = null;
      if (pl.islet) found = [il.cx, il.cy - 1];
      else {
        const a0 = U.rand2(i, 13, seed) * Math.PI * 2;
        // 先照原本的地形與半徑找；找不到就放寬：不挑地形 → 放寬半徑 → 最後不管走不走得到也要放
        const tries = [[pl.want, pl.r, main], [null, pl.r, main], [null, [0.2, 0.95], main], [null, [0.2, 0.95], null]];
        for (const [want, band, mn] of tries) {
          outer: for (let step = 0; step < 24 && !found; step++) {
            const a = a0 + step * 0.61803 * Math.PI * 2;
            for (let rf = band[0]; rf <= band[1]; rf += 0.06) {
              const tx = Math.round(Math.cos(a) * rf * ISLAND_R), ty = Math.round(Math.sin(a) * rf * ISLAND_R);
              const hit = spiralFind(tx, ty, 7, (x, y) => footprintOk(x, y, w, h, seed, want, taken, mn));
              if (hit) { found = hit; break outer; }
            }
          }
          if (found) break;
        }
      }
      if (!found) return;
      const place = Object.assign({}, pl, { x: found[0], y: found[1], w, h });
      out.push(place);
      for (let j = -3; j < h + 3; j++) for (let i2 = -3; i2 < w + 3; i2++) taken.add((found[0] + i2) + ',' + (found[1] + j));
    });
    return out;
  }

  function biomeName(ch) {
    return ({ '淼': '深水', '水': '淺水', '沙': '沙地', '礫': '碎石地', '石': '石灘', '山': '群山', '雪': '雪原',
      '草': '草原', '花': '花野', '棉': '棉田', '麻': '麻田', '木': '疏林', '果': '果林', '林': '林地', '森': '深林', '竹': '竹林', '田': '田野',
      '土': '荒土', '灰': '焦土', '白': '白紙', '火': '火場', '炎': '火場', '焱': '火場', '灶': '灶邊', '鼎': '鼎邊', '磚': '磚牆', '床': '床邊', '櫃': '櫃邊', '偶': '稻草人旁',
      '燈': '燈下', '橋': '橋上', '漁': '魚梁', '舟': '船邊', '包': '荷包', '煤': '煤層', '鐵': '鐵礦脈', '網': '網邊', '罟': '網邊', '罾': '網邊', '碑': '古碑', '囊': '囊', '路': '小路', '塔': '塔下', '寺': '寺中', '船': '船邊',
      '泉': '泉邊', '墓': '墓前', '洞': '洞口', '井': '井邊', '牆': '村中', '門': '門口' })[ch] || ch;
  }

  RECIPES.forEach(r => { r.cat = '材料'; for (const c in CAT_OF) if (CAT_OF[c].indexOf(r.id) >= 0) r.cat = c; });
  root.G = { INK, DB, ITEMS, TOOL_NAMES, RECIPES, CRAFT_CATS, COOK, item, baseTile, fields, islet, stelePlan, placePlan, PLACES, biomeName, ISLAND_R, SEA_EDGE, SHIPS };
})();
