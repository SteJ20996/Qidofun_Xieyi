// entities.js —— 世界裡會動的東西：鳥、魚、鹿、虎、豹、狼、蛇、蛛、蟾、龜、野豬、野牛、龍，以及第十三夜起夜行的魄
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const SCARED = '虎豹狼蛇蛛蟾豬';         // 稻草人擋得住的（野豬也怕；野牛不怕）
  const HOSTILE = '虎豹狼蛇蛛蟾豬牛';       // 敵對獸：攻擊間隔放慢四分之一
  const FOREST = '林森竹';
  // 彈弓挑釁（v0.22）：被石子打過的獸 provoked 秒內，到玩家 PROVOKE_R 格內就直撲過來（不管光、稻草人嚇不嚇、晝夜），一步 CHARGE_STEP 秒
  const TIGER_GAP = 12;   // 一山不容二虎（v0.22）：兩隻虎相距至少十二格——生的時候避開，走的時候不往十二格內靠，已經太近的走開
  const PROVOKE_R = 7, CHARGE_STEP = 0.22, CHARGERS = '虎豹狼蛇蛛鷹豬牛', BITERS = '蛇蛛蟾';
  // v0.28：蜘蛛十隻一隻有毒（見人就撲、毒是蛇的一半），其餘無毒（惹了才咬、不中毒）；野豬五格內見人就衝，速度同豹；
  // 野牛不惹不動，惹了追著頂，腳程是狼的三分之二（狼追人一步 0.32 息），十格外或二十息後消氣；龜挨打就往最近的海逃，比平常快四成
  const VENOM_SPIDER = 0.1, BOAR_RANGE = 5, BOAR_STEP = 0.22, BISON_STEP = 0.32 * 1.5, BISON_CALM = 30, BISON_GIVEUP = 18, TURTLE_STEP = 1.5, TURTLE_FLEE = 1.4,   /* 龜一步一息半（v0.28 使用者裁定：腳程減到三分之二），逃命快四成 */ TURTLE_SEA_R = 40;
  // 磚擋眼（v0.28）：獸跟人之間隔著磚、門、墟就看不見，只能循氣味找，找得到的距離是看得見時的七成；窗不擋。
  // 惹惱的野牛記仇比別的獸遠（十八格、三十息），擋在路上的人造磚、門、窗與墟（村裡的殘垣也算）都撞，一下隔 RAM_GAP 息；耐久在 world.js 的 WALL_HP
  const SMELL = 0.7, RAM_GAP = 1.6, RAMMABLE = '磚門窗墟';
  // 魄（v0.20 加強）：玩家身上的光（手裡的火把蠟燭、頭上的燈帽）只把魄逼到 GHOST_KEEP 格外，在 GHOST_HOVER 格內徘徊；
  // 地上的光（燈、火、旺灶）GHOST_BURN 格內、龍四格內才煙滅。玩家有光時每 GHOST_DASH_GAP 息，最近那隻撲上來 GHOST_DASH 息；
  // 魄在兩格內（GHOST_SNUFF_R），手裡的光每息有 snuffP 的機會被吹熄（game.ghostTouch）
  const GHOST_KEEP = 6, GHOST_HOVER = 9, GHOST_BURN = 3, GHOST_DASH = 2.5, GHOST_DASH_GAP = [8, 14], GHOST_DASH_STEP = 0.22, GHOST_SNUFF_R = 2;

  class Entities {
    constructor(world) {
      this.world = world;
      this.list = [];
      this.spawnAcc = 0;
      this.ghostAcc = 0;
      this.seaP = 1 / 160;       // 行船時每一點五息有這麼點機會浮上一頭蜃（平均約二百四十息一頭）
      this.snuffP = 0.1;         // 魄兩格內，手裡的光每息被吹熄的機會
      this.dashT = GHOST_DASH_GAP[0];   // 下一次撲燈還有幾息（玩家身上有光的夜裡才倒數）
    }
    at(x, y) { for (const e of this.list) if (e.x === x && e.y === y) return e; return null; }
    beastAt(x, y) { for (const e of this.list) if (e.x === x && e.y === y && DB[e.type].kind === 'beast' && e.type !== '魄' && e.type !== '龍' && !(e.type === '鷹' && e.tame)) return e; return null; }   // 龍與馴了的鷹不擋路
    tamed() { return this.list.filter(e => e.type === '鷹' && e.tame); }
    sense(e, p, r) { return this.world.clear(e.x, e.y, p.x, p.y) ? r : r * SMELL; }   // 獸找得到人的距離：看得見照舊，隔著磚只靠氣味打七折
    ram(e, g, x, y) {      // 野牛撞牆：扣一點看不見的耐久；磚剩一半成墟，塌了就沒了
      if (e.atk > 0) return; e.atk = RAM_GAP;
      const r = this.world.hitWall(x, y); if (!r) return;
      if (r === 'broken') { if (g.wallBroken) g.wallBroken(e, x, y); } else if (g.wallRammed) g.wallRammed(e, x, y, r);
    }
    rammable(x, y) { const ch = this.world.get(x, y); return RAMMABLE.indexOf(ch) >= 0 && (ch === '墟' || this.world.base(x, y) !== ch); }   // 人造的磚門窗，與所有的墟
    isHostile(o) {           // 會主動找人的：虎豹狼蛇、野豬、毒蛛；惹了才找人的：無毒蛛、蟾、野牛、沒馴的鷹
      return '虎豹狼蛇豬'.indexOf(o.type) >= 0 || (o.type === '蛛' && o.venom) || (o.angry && (o.type === '蛛' || o.type === '蟾' || o.type === '牛' || (o.type === '鷹' && !o.tame)));
    }
    hostileNear(p, r) {      // 玩家 r 格內最近的敵對獸（鷹替你打的對象）
      let best = null, bd = Infinity;
      for (const o of this.list) {
        if (!this.isHostile(o) || o.hp <= 0) continue;
        const d = U.cheb(o.x, o.y, p.x, p.y); if (d <= r && d < bd) { bd = d; best = o; }
      }
      return best;
    }
    count(type) { let n = 0; for (const e of this.list) if (e.type === type) n++; return n; }
    add(type, x, y, extra) {
      const e = Object.assign({ type, x, y, rx: x, ry: y, moveT: Math.random(), calm: 0, atk: 0, angry: false, hp: DB[type].hp || 1, bob: Math.random() * 6 }, extra || {});
      if (type === '蟾' && e.venom === undefined) e.venom = Math.random() < 0.5;
      if (type === '蛛' && e.venom === undefined) e.venom = Math.random() < VENOM_SPIDER;   // 十隻一隻是毒蛛
      if (type === '鷹' && e.sta === undefined) e.sta = 100;
      this.list.push(e);
      return e;
    }
    remove(e) { const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1); }
    nearWater(x, y) { for (const [dx, dy] of N4) if (DB[this.world.get(x + dx, y + dy)].kind === 'water') return true; return false; }
    nearWood(x, y) { for (const [dx, dy] of N4) if ('木林森竹'.indexOf(this.world.get(x + dx, y + dy)) >= 0) return true; return false; }

    // 出生地：各有各的家
    habitat(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (SCARED.indexOf(type) >= 0 && this.world.scared(x, y)) return false;
      if (type === '鳥') return d.kind === 'plant' || d.kind === 'ground';
      if (type === '魚') return d.kind === 'water';
      if (this.world.sheltered(x, y, type)) return false;                  // 小屋裡不生生靈（多小才算看難度，魄另一個門檻）
      if (type === '蜃') return ch === '淼';                                // 蜃只從深海浮上來
      if (type === '鹿') return '林木草竹棉麻果'.indexOf(ch) >= 0;
      if (type === '虎') return ch === '森' || (night && ch === '林');
      if (type === '豹') return ch === '森' || ch === '林';
      if (type === '狼') return night && '草田沙棉麻'.indexOf(ch) >= 0;
      if (type === '蛇') return ch === '草' && this.nearWood(x, y);          // 草木之交
      if (type === '豬') return '林竹'.indexOf(ch) >= 0 || (ch === '草' && this.nearWood(x, y));   // 林邊
      if (type === '牛') return ch === '草' && !this.nearWood(x, y);         // 開闊的草原
      if (type === '蟾' || type === '龜') return d.walk > 0 && d.kind !== 'object' && this.nearWater(x, y);
      if (type === '鷹') return d.kind !== 'water' && d.kind !== 'fire' && this.world.nearChar(x, y, '山', 2);
      if (type === '魄') return d.kind !== 'water' && d.kind !== 'fire' && !this.world.lightNear(x, y, 6);
      return d.walk > 0;
    }
    // 能不能站上去：獸進不了屋、過不了門、穿不過磚、不近稻草人；魄無形，什麼都穿
    canStand(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (this.world.sheltered(x, y, type)) return false;                  // 小屋裡除了玩家誰也進不去；魄看難度（困難擋不住）
      if (type === '魄') return d.kind !== 'fire';
      if (type === '鳥' || type === '龍' || type === '鷹') return d.kind !== 'fire';
      if (type === '魚' || type === '蜃') return d.kind === 'water';
      if (d.walk <= 0 || d.shelter || d.gate) return false;
      if (d.bog && type !== '蟾') return false;                             // 沼澤：除了蟾，獸都不進
      if (SCARED.indexOf(type) >= 0 && this.world.scared(x, y)) return false;
      if ((type === '虎' || type === '豹') && !night) return d.kind === 'plant';   // 白天不出林
      return true;
    }

    tigerRoom(x, y, self) { for (const o of this.list) if (o !== self && o.type === '虎' && U.cheb(o.x, o.y, x, y) < TIGER_GAP) return false; return true; }   // 這格十二格內沒有別的虎
    tigerTooClose(e, x, y) {   // 虎走到這格會不會離別的虎不到十二格、而且比現在更近
      if (e.type !== '虎') return false;
      for (const o of this.list) if (o !== e && o.type === '虎') { const dn = U.cheb(x, y, o.x, o.y); if (dn < TIGER_GAP && dn < U.cheb(e.x, e.y, o.x, o.y)) return true; }
      return false;
    }
    stepTo(e, tx, ty, away, night) {
      let best = null, bestD = away ? -1 : Infinity;
      for (const [dx, dy] of N8) {
        const nx = e.x + dx, ny = e.y + dy;
        if (!this.canStand(e.type, nx, ny, night) || this.beastAt(nx, ny) || this.tigerTooClose(e, nx, ny)) continue;
        const d = U.dist(nx, ny, tx, ty) + Math.random() * 0.3;
        if (away ? d > bestD : d < bestD) { bestD = d; best = [nx, ny]; }
      }
      if (best) { e.x = best[0]; e.y = best[1]; return true; }
      return false;
    }
    wander(e, night, prefer) {
      const order = N8.slice().sort(() => Math.random() - 0.5);
      let fallback = null;
      for (const [dx, dy] of order) {
        const nx = e.x + dx, ny = e.y + dy;
        if (!this.canStand(e.type, nx, ny, night) || this.beastAt(nx, ny) || this.tigerTooClose(e, nx, ny)) continue;
        if (!prefer || prefer.indexOf(this.world.get(nx, ny)) >= 0) { e.x = nx; e.y = ny; return; }
        if (!fallback) fallback = [nx, ny];
      }
      if (fallback && Math.random() < 0.3) { e.x = fallback[0]; e.y = fallback[1]; }
    }
    hover(e, p, lo, hi) {   // 在玩家 lo–hi 格之間繞圈（魄在光的邊上徘徊）
      for (const [dx, dy] of N8.slice().sort(() => Math.random() - 0.5)) {
        const nx = e.x + dx, ny = e.y + dy, dd = U.cheb(nx, ny, p.x, p.y);
        if (dd < lo || dd > hi || !this.canStand(e.type, nx, ny, true)) continue;
        e.x = nx; e.y = ny; return true;
      }
      return false;
    }
    nearestPlace(x, y, chars, maxD) {
      let best = null, bd = maxD;
      for (const pl of this.world.places) {
        if (!pl.ch || chars.indexOf(pl.ch) < 0) continue;
        const d = U.dist(x, y, pl.x + (pl.w - 1) / 2, pl.y + (pl.h - 1) / 2);
        if (d < bd) { bd = d; best = pl; }
      }
      return best;
    }
    dragonNear(x, y, r) { for (const o of this.list) if (o.type === '龍' && U.cheb(o.x, o.y, x, y) <= r) return true; return false; }
    ghostNear(x, y, r) { for (const o of this.list) if (o.type === '魄' && (o.fade === undefined || o.fade >= 1) && U.cheb(o.x, o.y, x, y) <= r) return true; return false; }
    nearOf(type, x, y, r) { for (const o of this.list) if (o.type === type && U.cheb(o.x, o.y, x, y) <= r) return true; return false; }

    spawnNear(type, p, rMin, rMax, night, extra) {
      for (let n = 0; n < 8; n++) {
        const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
        const x = p.x + Math.round(Math.cos(a) * r), y = p.y + Math.round(Math.sin(a) * r);
        if (this.habitat(type, x, y, night) && !this.at(x, y) && (type !== '虎' || this.tigerRoom(x, y))) return this.add(type, x, y, extra);
      }
      return null;
    }
    // 除草時驚出的蜘蛛：出現在玩家旁邊一格
    spawnSpiderNear(x, y) {
      for (const [dx, dy] of N8.slice().sort(() => Math.random() - 0.5)) {
        const nx = x + dx, ny = y + dy;
        if (this.canStand('蛛', nx, ny, true) && !this.at(nx, ny)) return this.add('蛛', nx, ny, { moveT: 1 });
      }
      return null;
    }

    // 咬人與打人：由遊戲端結算
    maul(e, g, dt) {       // 近身撲咬：敵對獸間隔 1.6 秒（原 1.2 秒放慢四分之一），鷹 1.2 秒
      if (e.atk > 0) return;
      g.hit(e, DB[e.type].atk); e.atk = HOSTILE.indexOf(e.type) >= 0 ? 1.6 : 1.2;
    }
    bite(e, g) {           // 毒咬，間隔 2.67 秒（原 2 秒放慢四分之一）；無毒蛛只是咬一口
      if (e.atk > 0) return;
      if (e.type === '蛛' && !e.venom) { g.hit(e, DB['蛛'].nip); e.atk = 2.0 * 4 / 3; return; }
      g.bite(e, DB[e.type].bite); e.atk = 2.0 * 4 / 3;
    }
    seaTarget(e) {         // 龜逃命的方向：最近的海（離島心夠遠的水，島裡的水塘不算）
      const R = G.ISLAND_R * 0.8; let best = null, bd = Infinity;
      for (let dy = -TURTLE_SEA_R; dy <= TURTLE_SEA_R; dy++) for (let dx = -TURTLE_SEA_R; dx <= TURTLE_SEA_R; dx++) {
        const x = e.x + dx, y = e.y + dy, dd = dx * dx + dy * dy; if (dd >= bd) continue;
        if (DB[this.world.get(x, y)].kind === 'water' && Math.hypot(x, y) > R) { bd = dd; best = { x, y }; }
      }
      return best;
    }

    update(dt, g) {
      const p = g.player, w = this.world, night = g.darkness() > 0.5;
      // 魄撲燈：玩家身上有光的夜裡，每八到十四息，最近一隻徘徊的魄撲上來
      if (night && g.hasLight()) {
        this.dashT -= dt;
        if (this.dashT <= 0) {
          this.dashT = GHOST_DASH_GAP[0] + Math.random() * (GHOST_DASH_GAP[1] - GHOST_DASH_GAP[0]);
          let best = null, bd = GHOST_HOVER + 2;
          for (const o of this.list) if (o.type === '魄' && !o.frozen && !(o.fade < 1) && !(o.dash > 0)) { const dd = U.cheb(o.x, o.y, p.x, p.y); if (dd < bd) { bd = dd; best = o; } }
          if (best) { best.dash = GHOST_DASH; best.moveT = 0; }
        }
      }
      const dusk = g.duskSoon ? g.duskSoon() : false;
      // —— 獸的刷新
      this.spawnAcc += dt;
      if (this.spawnAcc > 1.5) {
        this.spawnAcc = 0;
        const bm = night && g.beastMult ? g.beastMult() : 1;   // 困難：夜裡狼虎豹蛇一倍半
        const caps = { '鳥': night ? 4 : 10, '鹿': 6, '魚': 8, '虎': night ? Math.ceil(3 * bm) : 2, '豹': night ? Math.ceil(2 * bm) : 1, '狼': night ? Math.ceil(3 * bm) : 0, '蛇': Math.ceil(2 * bm), '蟾': 3 };
        caps['鷹'] = 2; caps['龜'] = 1; caps['豬'] = 2; caps['牛'] = 2;
        for (const type in caps) {
          const have = type === '鷹' ? this.list.filter(e => e.type === '鷹' && !e.tame).length : this.count(type);
          if (have >= caps[type]) continue;
          if (type === '蛇' && Math.random() > 0.25) continue;        // 蛇出沒機率偏低
          if (type === '狼' && Math.random() > 0.5) continue;
          if (type === '鷹' && Math.random() > 0.4) continue;
          if (type === '龜' && Math.random() > 0.1) continue;         // 龜少見
          if (type === '豬' && Math.random() > 0.3) continue;
          if (type === '牛' && Math.random() > 0.25) continue;
          this.spawnNear(type, p, 14, 30, night);
        }
        // 蜃：只在玩家行船或落水時，從十到十六格外的深海浮上來；機率低，一次只一隻
        if ((p.sailing || p.swimming) && this.count('蜃') === 0 && Math.random() < this.seaP) {
          const m = this.spawnNear('蜃', p, 10, 16, night, { moveT: 1.5, fogT: 4 });
          if (m && g.seaMonsterRose) g.seaMonsterRose(m);
        }
      }
      // —— 魄：第十三夜起夜行
      this.ghostAcc += dt;
      if (this.ghostAcc > 2) {
        this.ghostAcc = 0;
        if (g.ghostNight() && !p.dead && this.count('魄') < g.ghostCap()) this.spawnNear('魄', p, 12, 20, true);
      }

      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        const k = Math.min(1, dt * 11);
        e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
        const d = U.cheb(e.x, e.y, p.x, p.y);
        if (d <= 9) g.saw(e.type);
        if (!e.heard && d <= 8 && this.isHostile(e) && w.clear(e.x, e.y, p.x, p.y)) { e.heard = true; if (g.beastCall) g.beastCall(e); }   // 走近了先聽見牠（各有各的聲音）
        else if (e.heard && d > 14) e.heard = false;
        if (e.type !== '龍' && !e.tame && d > 48) { this.list.splice(i, 1); continue; }
        if (e.type === '鷹') {
          if (e.tame) { e.sta = Math.min(100, e.sta + dt); e.hp = Math.min(DB['鷹'].hp, e.hp + 0.3 * dt); }   // 體力每息回一點，傷慢慢好
          if (e.angryT > 0) { e.angryT -= dt; if (e.angryT <= 0) e.angry = false; }
        }
        if (e.type === '魚' && DB[w.get(e.x, e.y)].kind !== 'water') { this.list.splice(i, 1); continue; }
        if (e.type === '狼' && g.daylight() > 0.5) { this.list.splice(i, 1); continue; }                 // 狼天亮散去
        if (e.fade !== undefined && e.fade < 1) { e.fade -= dt * 1.2; if (e.fade <= 0) this.list.splice(i, 1); continue; }   // 正在煙滅
        if (e.type === '魄') {
          // 地上的光（燈、火、旺灶）三格內、龍四格內即煙滅；玩家身上的光只逼得退（見下面的行動）
          if (w.lightNear(e.x, e.y, GHOST_BURN) || this.dragonNear(e.x, e.y, 4)) { e.fade = 0.99; if (g.ghostBurned) g.ghostBurned(e); continue; }   // 遊戲端：屋外的夜裡長膽氣、燈帽少兩息（v0.32）
          if (g.daylight() > 0.3) {
            if (FOREST.indexOf(w.get(e.x, e.y)) >= 0) { e.frozen = true; continue; }     // 白日藏於林中，不動
            e.fade = 0.99; continue;                                                          // 不在林裡，天亮煙滅
          }
          e.frozen = false;
          if (e.dash > 0) e.dash = Math.max(0, e.dash - dt);
          if (d <= GHOST_SNUFF_R) g.ghostTouch(e, dt);                                     // 近身：吹手裡的燈
        }
        if (e.type === '蜃') {          // 吞吐霧障：每隔一陣往玩家那邊吐一片海霧
          e.fogT = (e.fogT === undefined ? 6 : e.fogT) - dt;
          if (e.fogT <= 0) { e.fogT = 16 + Math.random() * 10; if (d <= 16 && (p.sailing || p.swimming)) w.spawnSeaFog(e.x, e.y, p.x, p.y); }
        }
        const rate = e.slowT > 0 ? 0.5 : 1;            // 撞在台邊：五息內行動與撲咬都慢一倍
        if (e.slowT > 0) e.slowT -= dt;
        if (e.provoked > 0) e.provoked -= dt;
        if (e.atk > 0) e.atk -= dt * rate;
        if (e.calm > 0) e.calm -= dt;
        e.moveT -= dt * rate;
        if (e.moveT > 0) continue;

        const sheltered = !!DB[w.get(p.x, p.y)].shelter;
        // 被鷹咬過的獸會反擊鷹：貼著就啄回去，否則照常
        if (e.foe) {
          if (!this.list.includes(e.foe) || e.foe.hp <= 0 || U.cheb(e.x, e.y, e.foe.x, e.foe.y) > 6) e.foe = null;
          else if (U.cheb(e.x, e.y, e.foe.x, e.foe.y) <= 1 && e.atk <= 0) {
            const dmg = DB[e.type].atk || U.r4((DB[e.type].bite || 2) * (DB[e.type].venomT || 5));   // 咬鷹：一口的毒全算上（蛇 13.5、毒蛛 6.75、蟾 10）
            e.foe.hp -= dmg; e.atk = HOSTILE.indexOf(e.type) >= 0 ? 1.6 : 1.2; e.moveT = 0.5;
            if (e.foe.hp <= 0) { g.companionDied(e.foe, e); e.foe = null; }
            continue;
          }
        }
        // 被彈弓打惱了：七格內直撲過來；七格外照常
        if (e.provoked > 0 && d <= PROVOKE_R && (CHARGERS.indexOf(e.type) >= 0 || (e.type === '蟾' && e.venom)) && !e.tame) {
          if (d <= 1) { if (BITERS.indexOf(e.type) >= 0) this.bite(e, g); else this.maul(e, g); e.moveT = 0.5; }   // 無毒蛛的 bite 只是咬一口
          else { e.moveT = CHARGE_STEP; this.stepTo(e, p.x, p.y, false, true); }   // 惱了連白天也出林
          continue;
        }
        if (e.type === '蜃') {
          const atSea = p.sailing || p.swimming, warded = p.sailing && g.shipWarded();
          const dShip = p.sailing ? Math.min(...g.shipCells().map(([x, y]) => U.cheb(e.x, e.y, x, y))) : d;   // 到船身最近一格
          if (atSea && warded && dShip <= 3) { e.moveT = 0.5; this.stepTo(e, p.x, p.y, true, night); if (!e.warned) { e.warned = true; g.message('船頭的' + g.shipSkullName() + '鎮著，蜃不敢近。'); } }
          else if (atSea && !warded && dShip <= 1) {
            if (e.atk <= 0) { e.atk = 2.5; if (p.sailing) g.ramShip(e); else g.hit(e, DB['蜃'].atk); }
            e.moveT = 0.6;
          } else if (atSea && d <= 14) { e.moveT = 0.4; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 1.5; this.wander(e, night, null); }
          continue;
        }
        if (e.type === '龍') {
          if (d > 4) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 0.5 + Math.random() * 1.0; if (Math.random() < 0.5) this.wander(e, night, null); }
        } else if (e.type === '魄') {
          const sp = g.ghostSpeed(), lit = g.hasLight();   // 第廿夜起越來越快
          if (e.dash > 0) { e.moveT = GHOST_DASH_STEP / sp; if (d > 1) this.stepTo(e, p.x, p.y, false, true); }                 // 撲燈：直衝過來
          else if (lit && d <= GHOST_KEEP) { e.moveT = 0.45 / sp; this.stepTo(e, p.x, p.y, true, true); }                      // 身上有光：逼退到六格外
          else if (lit && d <= GHOST_HOVER) { e.moveT = (0.8 + Math.random() * 0.6) / sp; this.hover(e, p, GHOST_KEEP + 1, GHOST_HOVER); }   // 在光的邊上徘徊
          else if (d <= 14) { e.moveT = 0.45 / sp; if (d > 2) this.stepTo(e, p.x, p.y, false, true); }
          else { e.moveT = (0.8 + Math.random()) / sp; this.wander(e, true, null); }
        } else if (e.type === '鳥') {
          const home = dusk ? this.nearestPlace(e.x, e.y, '塔寺燈', 60) : null;
          if (d <= 3) { e.moveT = 0.18; this.stepTo(e, p.x, p.y, true, night); }
          else if (home && U.cheb(e.x, e.y, home.x, home.y) > 1) { e.moveT = 0.3; this.stepTo(e, home.x, home.y, false, night); }
          else if (home) { e.moveT = 3 + Math.random() * 4; }
          else { e.moveT = 0.5 + Math.random() * 1.6; if (Math.random() < 0.5) this.wander(e, night, '木林森竹'); }
        } else if (e.type === '鹿') {
          const spring = dusk ? this.nearestPlace(e.x, e.y, '泉', 45) : null;
          if (d <= 5) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, true, night); }
          else if (spring && U.cheb(e.x, e.y, spring.x, spring.y) > 1) { e.moveT = 0.4; this.stepTo(e, spring.x, spring.y, false, night); }
          else if (spring) { e.moveT = 2 + Math.random() * 3; }
          else { e.moveT = 0.7 + Math.random() * 1.6; if (Math.random() < 0.6) this.wander(e, night, '林木草竹棉麻'); }
        } else if (e.type === '魚') {
          e.moveT = 0.5 + Math.random() * 1.2; if (Math.random() < 0.7) this.wander(e, night, '水');   // 魚愛在淺水游（v0.21，撒網撒得到）
        } else if (e.type === '虎' || e.type === '豹') {
          const sees = w.clear(e.x, e.y, p.x, p.y);   // 隔著磚看不見人，也看不見人身上的光
          const scared = w.lightNear(e.x, e.y, 2) || (sees && (w.lightNear(p.x, p.y, 2) || (g.hasLight() && night))) || this.dragonNear(e.x, e.y, 4);
          const range = (e.type === '豹' ? (night ? 9 : 6) : (night ? 8 : 4)) * (sees ? 1 : SMELL), speed = e.type === '豹' ? 0.22 : (night ? 0.24 : 0.3);
          if ((scared || sheltered) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
          else if (e.calm <= 0 && d <= range) {
            if (d <= 1) { this.maul(e, g); e.calm = e.type === '豹' ? 3 : 14; e.moveT = 0.6; }
            else { e.moveT = speed; this.stepTo(e, p.x, p.y, false, night); }
          } else {
            const rival = e.type === '虎' ? this.list.find(o => o !== e && o.type === '虎' && U.cheb(o.x, o.y, e.x, e.y) < TIGER_GAP) : null;
            if (rival) { e.moveT = 0.6; this.stepTo(e, rival.x, rival.y, true, night); }   // 一山不容二虎：太近就走開
            else { e.moveT = 0.6 + Math.random() * 1.4; if (Math.random() < 0.6) this.wander(e, night, night ? null : '森林'); }
          }
        } else if (e.type === '狼') {
          if (this.dragonNear(e.x, e.y, 4) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, true); }
          else if (e.calm <= 0 && d <= this.sense(e, p, 10) && !sheltered) {
            if (d <= 1) { this.maul(e, g); e.calm = 2; e.moveT = 0.5; }
            else { e.moveT = 0.32; this.stepTo(e, p.x, p.y, false, true); }
          } else { e.moveT = 0.7 + Math.random(); this.wander(e, true, null); }
        } else if (e.type === '蛇') {
          if (d <= 1 && !sheltered) { this.bite(e, g); e.moveT = 0.5; }
          else if (d <= this.sense(e, p, 5) && !sheltered) { e.moveT = 0.4; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 2; if (Math.random() < 0.4) this.wander(e, night, '草木'); }
        } else if (e.type === '鷹') {
          if (e.tame) {
            const tgt = e.sta >= 6 ? this.hostileNear(p, 6) : null;
            if (tgt) {
              if (U.cheb(e.x, e.y, tgt.x, tgt.y) <= 1) {
                if (e.atk <= 0) { tgt.hp -= 20; tgt.angry = true; tgt.foe = e; e.sta -= 6; e.atk = 1.5; g.eagleHit(e, tgt); if (tgt.hp <= 0) g.kill(tgt); }
                e.moveT = 0.4;
              } else { e.moveT = 0.2; this.stepTo(e, tgt.x, tgt.y, false, night); }
            } else if (d > 3) { e.moveT = 0.2; this.stepTo(e, p.x, p.y, false, night); }
            else { e.moveT = 0.6 + Math.random(); if (Math.random() < 0.5) this.wander(e, night, null); }
          } else if (e.angry) {
            if (d <= 1) { this.maul(e, g); e.moveT = 0.6; }
            else if (d <= 8) { e.moveT = 0.25; this.stepTo(e, p.x, p.y, false, night); }
            else { e.angry = false; e.moveT = 1; }
          } else { e.moveT = 0.8 + Math.random() * 1.5; if (Math.random() < 0.5) this.wander(e, night, null); }
        } else if (e.type === '龜') {
          if (e.angry) {                 // 挨了打：往最近的海逃，比平常快四成；一下水就不見了
            if (e.flee === undefined) e.flee = this.seaTarget(e);
            const t = e.flee;
            if (t && U.cheb(e.x, e.y, t.x, t.y) <= 1) { this.list.splice(i, 1); if (g.turtleGone) g.turtleGone(e, d); continue; }
            e.moveT = TURTLE_STEP / TURTLE_FLEE;
            if (t) { if (!this.stepTo(e, t.x, t.y, false, night)) this.stepTo(e, p.x, p.y, true, night); } else this.stepTo(e, p.x, p.y, true, night);
          } else { e.moveT = (2 + Math.random() * 3) * 1.5; if (Math.random() < 0.5) this.wander(e, night, '草沙土'); }   // 閒晃也慢三分之一
        } else if (e.type === '豬') {    // 野豬：五格內見人就衝，速度同豹；不怕火光；撞一下退開三息
          if (this.dragonNear(e.x, e.y, 4) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
          else if (e.calm <= 0 && d <= this.sense(e, p, BOAR_RANGE) && !sheltered) {
            if (d <= 1) { this.maul(e, g); e.calm = 3; e.moveT = 0.6; }
            else { e.moveT = BOAR_STEP; this.stepTo(e, p.x, p.y, false, night); }
          } else { e.moveT = 0.8 + Math.random() * 1.4; if (Math.random() < 0.5) this.wander(e, night, '林竹草'); }
        } else if (e.type === '牛') {    // 野牛：不惹不動；惹了追著頂、記仇遠（十八格、三十息），躲進屋裡就撞磚
          if (e.angry && (d > this.sense(e, p, BISON_GIVEUP) || this.world.time - (e.angryAt || 0) > BISON_CALM)) e.angry = false;
          if (e.angry) {
            if (d <= 1) { this.maul(e, g); e.calm = 2; e.moveT = 0.8; }
            else {
              e.moveT = BISON_STEP;
              const nx = e.x + Math.sign(p.x - e.x), ny = e.y + Math.sign(p.y - e.y), ch = w.get(nx, ny);
              const wall = this.rammable(nx, ny);
              if (wall) { this.ram(e, g, nx, ny); e.moveT = 0.5; }
              else if (!this.stepTo(e, p.x, p.y, false, night)) {           // 卡住了：找旁邊擋路的人造磚撞
                let best = null, bd = Infinity;
                for (const [dx, dy] of N8) { const x = e.x + dx, y = e.y + dy; if (!this.rammable(x, y)) continue; const dd = U.dist(x, y, p.x, p.y); if (dd < bd) { bd = dd; best = [x, y]; } }
                if (best) { this.ram(e, g, best[0], best[1]); e.moveT = 0.5; }
              }
            }
          } else { e.moveT = 1.5 + Math.random() * 2; if (Math.random() < 0.5) this.wander(e, night, '草'); }
        } else if (e.type === '蛛' || e.type === '蟾') {
          const hostile = (e.type === '蛛' && e.venom) || (e.angry && (e.type === '蛛' || e.venom));     // 毒蛛見人就撲；無毒蛛與毒蟾被惹了才咬
          if (hostile && d <= 1) { this.bite(e, g); e.moveT = 0.5; }
          else if (hostile && d <= this.sense(e, p, 6)) { e.moveT = 0.35; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 2; if (Math.random() < 0.4) this.wander(e, night, e.type === '蟾' ? '草沙土水' : null); }
        }
        // 山海衣：七格內主動攻擊的獸行動慢一倍
        if (g.totemNear && this.isHostile(e) && e.type !== '鷹' && g.totemNear(e.x, e.y)) e.moveT *= 2;
      }
    }

    serialize() { return this.list.filter(e => e.type === '龍' || e.type === '蜃' || (e.type === '鷹' && e.tame)).map(e => ({ t: e.type, x: e.x, y: e.y, hp: e.hp, sta: e.sta, tame: e.tame })); }
    restore(arr) { for (const s of arr || []) { if (s.t === '蜃') continue; this.add(s.t, s.x, s.y, s.tame ? { hp: s.hp, sta: s.sta, tame: true } : {}); } }   // 蜃不跟著讀檔回來：沒解決的蜃由遊戲端扣膽氣
  }

  root.Entities = Entities;
})();
