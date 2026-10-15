// entities.js —— 世界裡會動的東西：鳥、魚、鹿、虎、豹、狼、蛇、蛛、蟾、龍，以及第十三夜起夜行的魄
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const SCARED = '虎豹狼蛇蛛蟾';           // 稻草人擋得住的
  const FOREST = '林森竹';

  class Entities {
    constructor(world) {
      this.world = world;
      this.list = [];
      this.spawnAcc = 0;
      this.ghostAcc = 0;
    }
    at(x, y) { for (const e of this.list) if (e.x === x && e.y === y) return e; return null; }
    beastAt(x, y) { for (const e of this.list) if (e.x === x && e.y === y && DB[e.type].kind === 'beast' && e.type !== '魄') return e; return null; }
    count(type) { let n = 0; for (const e of this.list) if (e.type === type) n++; return n; }
    add(type, x, y, extra) {
      const e = Object.assign({ type, x, y, rx: x, ry: y, moveT: Math.random(), calm: 0, atk: 0, angry: false, hp: DB[type].hp || 1, bob: Math.random() * 6 }, extra || {});
      if (type === '蟾' && e.venom === undefined) e.venom = Math.random() < 0.5;
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
      if (type === '鹿') return '林木草竹棉麻果'.indexOf(ch) >= 0;
      if (type === '虎') return ch === '森' || (night && ch === '林');
      if (type === '豹') return ch === '森' || ch === '林';
      if (type === '狼') return night && '草田沙棉麻'.indexOf(ch) >= 0;
      if (type === '蛇') return ch === '草' && this.nearWood(x, y);          // 草木之交
      if (type === '蟾') return d.walk > 0 && d.kind !== 'object' && this.nearWater(x, y);
      if (type === '魄') return d.kind !== 'water' && d.kind !== 'fire' && !this.world.lightNear(x, y, 6);
      return d.walk > 0;
    }
    // 能不能站上去：獸進不了屋、過不了門、穿不過磚、不近稻草人；魄無形，什麼都穿
    canStand(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (type === '魄') return d.kind !== 'fire';
      if (type === '鳥' || type === '龍') return d.kind !== 'fire';
      if (type === '魚') return d.kind === 'water';
      if (d.walk <= 0 || d.shelter || d.gate) return false;
      if (SCARED.indexOf(type) >= 0 && this.world.scared(x, y)) return false;
      if ((type === '虎' || type === '豹') && !night) return d.kind === 'plant';   // 白天不出林
      return true;
    }

    stepTo(e, tx, ty, away, night) {
      let best = null, bestD = away ? -1 : Infinity;
      for (const [dx, dy] of N8) {
        const nx = e.x + dx, ny = e.y + dy;
        if (!this.canStand(e.type, nx, ny, night) || this.beastAt(nx, ny)) continue;
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
        if (!this.canStand(e.type, nx, ny, night) || this.beastAt(nx, ny)) continue;
        if (!prefer || prefer.indexOf(this.world.get(nx, ny)) >= 0) { e.x = nx; e.y = ny; return; }
        if (!fallback) fallback = [nx, ny];
      }
      if (fallback && Math.random() < 0.3) { e.x = fallback[0]; e.y = fallback[1]; }
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
        if (this.habitat(type, x, y, night) && !this.at(x, y)) return this.add(type, x, y, extra);
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
    maul(e, g, dt) {       // 近身撲咬，間隔 1.2 秒
      if (e.atk > 0) return;
      g.hit(e, DB[e.type].atk); e.atk = 1.2;
    }
    bite(e, g) {           // 毒咬，間隔 2 秒
      if (e.atk > 0) return;
      g.bite(e, DB[e.type].bite); e.atk = 2.0;
    }

    update(dt, g) {
      const p = g.player, w = this.world, night = g.darkness() > 0.5;
      const dayT = g.dayT(), dusk = dayT > 0.40 && dayT < 0.52;
      // —— 獸的刷新
      this.spawnAcc += dt;
      if (this.spawnAcc > 1.5) {
        this.spawnAcc = 0;
        const caps = { '鳥': night ? 4 : 10, '鹿': 6, '魚': 8, '虎': night ? 3 : 2, '豹': night ? 2 : 1, '狼': night ? 3 : 0, '蛇': 2, '蟾': 3 };
        for (const type in caps) {
          if (this.count(type) >= caps[type]) continue;
          if (type === '蛇' && Math.random() > 0.25) continue;        // 蛇出沒機率偏低
          if (type === '狼' && Math.random() > 0.5) continue;
          this.spawnNear(type, p, 14, 30, night);
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
        if (e.type !== '龍' && d > 48) { this.list.splice(i, 1); continue; }
        if (e.type === '魚' && DB[w.get(e.x, e.y)].kind !== 'water') { this.list.splice(i, 1); continue; }
        if (e.type === '狼' && g.daylight() > 0.5) { this.list.splice(i, 1); continue; }                 // 狼天亮散去
        if (e.fade !== undefined && e.fade < 1) { e.fade -= dt * 1.2; if (e.fade <= 0) this.list.splice(i, 1); continue; }   // 正在煙滅
        if (e.type === '魄') {
          // 六格內有光即煙滅：地上的燈與火、玩家手裡的光、龍
          const lit = w.lightNear(e.x, e.y, 6) || (g.hasLight() && d <= 6) || this.dragonNear(e.x, e.y, 6);
          if (lit) { e.fade = 0.99; continue; }
          if (g.daylight() > 0.3) {
            if (FOREST.indexOf(w.get(e.x, e.y)) >= 0) { e.frozen = true; continue; }     // 白日藏於林中，不動
            e.fade = 0.99; continue;                                                          // 不在林裡，天亮煙滅
          }
          e.frozen = false;
        }
        if (e.atk > 0) e.atk -= dt;
        if (e.calm > 0) e.calm -= dt;
        e.moveT -= dt;
        if (e.moveT > 0) continue;

        const sheltered = !!DB[w.get(p.x, p.y)].shelter;
        if (e.type === '龍') {
          if (d > 4) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 0.5 + Math.random() * 1.0; if (Math.random() < 0.5) this.wander(e, night, null); }
        } else if (e.type === '魄') {
          if (d <= 14) { e.moveT = 0.45; if (d > 2) this.stepTo(e, p.x, p.y, false, true); }
          else { e.moveT = 0.8 + Math.random(); this.wander(e, true, null); }
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
          e.moveT = 0.5 + Math.random() * 1.2; if (Math.random() < 0.7) this.wander(e, night, null);
        } else if (e.type === '虎' || e.type === '豹') {
          const scared = w.lightNear(e.x, e.y, 2) || w.lightNear(p.x, p.y, 2) || (g.hasLight() && night) || this.dragonNear(e.x, e.y, 4);
          const range = e.type === '豹' ? (night ? 9 : 6) : (night ? 8 : 4), speed = e.type === '豹' ? 0.22 : (night ? 0.24 : 0.3);
          if ((scared || sheltered) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
          else if (e.calm <= 0 && d <= range) {
            if (d <= 1) { this.maul(e, g); e.calm = e.type === '豹' ? 3 : 14; e.moveT = 0.6; }
            else { e.moveT = speed; this.stepTo(e, p.x, p.y, false, night); }
          } else {
            e.moveT = 0.6 + Math.random() * 1.4;
            if (Math.random() < 0.6) this.wander(e, night, night ? null : '森林');
          }
        } else if (e.type === '狼') {
          if (this.dragonNear(e.x, e.y, 4) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, true); }
          else if (e.calm <= 0 && d <= 10 && !sheltered) {
            if (d <= 1) { this.maul(e, g); e.calm = 2; e.moveT = 0.5; }
            else { e.moveT = 0.32; this.stepTo(e, p.x, p.y, false, true); }
          } else { e.moveT = 0.7 + Math.random(); this.wander(e, true, null); }
        } else if (e.type === '蛇') {
          if (d <= 1 && !sheltered) { this.bite(e, g); e.moveT = 0.5; }
          else if (d <= 5 && !sheltered) { e.moveT = 0.4; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 2; if (Math.random() < 0.4) this.wander(e, night, '草木'); }
        } else if (e.type === '蛛' || e.type === '蟾') {
          const hostile = e.angry && (e.type === '蛛' || e.venom);     // 蜘蛛與毒蟾被惹了才咬
          if (hostile && d <= 1) { this.bite(e, g); e.moveT = 0.5; }
          else if (hostile && d <= 6) { e.moveT = 0.35; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 2; if (Math.random() < 0.4) this.wander(e, night, e.type === '蟾' ? '草沙土水' : null); }
        }
        // 圖騰衣：七格內主動攻擊的獸行動慢一倍
        if (g.totemNear && ('虎豹狼蛇'.indexOf(e.type) >= 0 || (e.angry && (e.type === '蛛' || e.type === '蟾'))) && g.totemNear(e.x, e.y)) e.moveT *= 2;
      }
    }

    serialize() { return this.list.filter(e => e.type === '龍').map(e => ({ t: e.type, x: e.x, y: e.y })); }
    restore(arr) { for (const s of arr || []) this.add(s.t, s.x, s.y); }
  }

  root.Entities = Entities;
})();
