// entities.js —— 世界裡會動的東西：鳥、魚、鹿、虎、龍，以及第十夜起夜行的鬼
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const BEASTS = ['鳥', '鹿', '魚', '虎'];

  class Entities {
    constructor(world) {
      this.world = world;
      this.list = [];
      this.spawnAcc = 0;
      this.ghostAcc = 0;
    }
    at(x, y) { for (const e of this.list) if (e.x === x && e.y === y) return e; return null; }
    beastAt(x, y) { for (const e of this.list) if (e.x === x && e.y === y && DB[e.type].kind === 'beast') return e; return null; }
    count(type) { let n = 0; for (const e of this.list) if (e.type === type) n++; return n; }
    add(type, x, y, extra) {
      const e = Object.assign({ type, x, y, rx: x, ry: y, moveT: Math.random(), calm: 0, atk: 0, hp: DB[type].hp || 1, bob: Math.random() * 6 }, extra || {});
      this.list.push(e);
      return e;
    }
    remove(e) { const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1); }

    // 出生地：各有各的家
    habitat(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (type === '鳥') return d.kind === 'plant' || d.kind === 'ground';
      if (type === '魚') return d.kind === 'water';
      if (type === '鹿') return '林木草竹棉果'.indexOf(ch) >= 0;
      if (type === '虎') return ch === '森' || (night && ch === '林');
      if (type === '鬼') return (d.kind === 'ground' || d.kind === 'plant') && d.walk > 0;
      return d.walk > 0;
    }
    // 能不能站上去：獸與鬼進不了屋、過不了門、穿不過磚
    canStand(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (type === '鳥' || type === '龍') return d.kind !== 'fire';
      if (type === '魚') return d.kind === 'water';
      if (d.walk <= 0 || d.shelter || d.gate) return false;
      if (type === '虎' && !night) return d.kind === 'plant';   // 白天虎不出林
      return true;
    }

    // 朝目標走一步（away=true 則遠離），只在能站的格子裡選
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
    // 最近的某類地標（鹿傍晚去泉，鳥傍晚回塔、寺、燈）
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
    ghostNear(x, y, r) { for (const o of this.list) if (o.type === '鬼' && U.cheb(o.x, o.y, x, y) <= r) return true; return false; }

    // 在玩家周圍一圈外找一塊合適的地出生
    spawnNear(type, p, rMin, rMax, night) {
      for (let n = 0; n < 8; n++) {
        const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
        const x = p.x + Math.round(Math.cos(a) * r), y = p.y + Math.round(Math.sin(a) * r);
        if (this.habitat(type, x, y, night) && !this.at(x, y)) return this.add(type, x, y);
      }
      return null;
    }

    update(dt, g) {
      const p = g.player, w = this.world, night = g.darkness() > 0.5;
      const dayT = g.dayT(), dusk = dayT > 0.40 && dayT < 0.52;
      // —— 獸的刷新
      this.spawnAcc += dt;
      if (this.spawnAcc > 1.5) {
        this.spawnAcc = 0;
        const caps = { '鳥': night ? 4 : 10, '鹿': 6, '魚': 8, '虎': night ? 3 : 2 };
        for (const type of BEASTS) if (this.count(type) < caps[type]) this.spawnNear(type, p, 14, 30, night);
      }
      // —— 鬼：第十夜起夜行，日出則散
      this.ghostAcc += dt;
      if (this.ghostAcc > 2) {
        this.ghostAcc = 0;
        if (g.ghostNight() && !p.dead && this.count('鬼') < g.ghostCap()) this.spawnNear('鬼', p, 12, 20, true);
      }

      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        const k = Math.min(1, dt * 11);
        e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
        const d = U.cheb(e.x, e.y, p.x, p.y);
        if (d <= 9) g.saw(e.type);
        if (e.type !== '龍' && d > 48) { this.list.splice(i, 1); continue; }
        if (e.type === '魚' && DB[w.get(e.x, e.y)].kind !== 'water') { this.list.splice(i, 1); continue; } // 水沒了，魚也沒了
        if (e.type === '鬼') {
          if (g.daylight() > 0.3) { e.fade = (e.fade === undefined ? 1 : e.fade) - dt * 1.5; if (e.fade <= 0) { this.list.splice(i, 1); } continue; } // 日出則散
          if (e.atk > 0) e.atk -= dt;
        }
        if (e.calm > 0) e.calm -= dt;
        e.moveT -= dt;
        if (e.moveT > 0) continue;

        if (e.type === '龍') {
          if (d > 4) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 0.5 + Math.random() * 1.0; if (Math.random() < 0.5) this.wander(e, night, null); }
        } else if (e.type === '鬼') {
          const sheltered = !!DB[w.get(p.x, p.y)].shelter;
          if (this.dragonNear(e.x, e.y, 4)) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, true); }
          else if (d <= 1 && !sheltered) { if (e.atk <= 0) { g.ghostAttack(e); e.atk = 1.2; } e.moveT = 0.3; }
          else if (d <= 16 && !sheltered) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, false, true); }
          else { e.moveT = 0.8 + Math.random(); this.wander(e, true, null); }
        } else if (e.type === '鳥') {
          const home = dusk ? this.nearestPlace(e.x, e.y, '塔寺燈', 60) : null;
          if (d <= 3) { e.moveT = 0.18; this.stepTo(e, p.x, p.y, true, night); }
          else if (home && U.cheb(e.x, e.y, home.x, home.y) > 1) { e.moveT = 0.3; this.stepTo(e, home.x, home.y, false, night); }   // 倦鳥歸巢
          else if (home) { e.moveT = 3 + Math.random() * 4; }
          else { e.moveT = 0.5 + Math.random() * 1.6; if (Math.random() < 0.5) this.wander(e, night, '木林森竹'); }
        } else if (e.type === '鹿') {
          const spring = dusk ? this.nearestPlace(e.x, e.y, '泉', 45) : null;
          if (d <= 5) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, true, night); }
          else if (spring && U.cheb(e.x, e.y, spring.x, spring.y) > 1) { e.moveT = 0.4; this.stepTo(e, spring.x, spring.y, false, night); }   // 鹿飲於泉
          else if (spring) { e.moveT = 2 + Math.random() * 3; }
          else { e.moveT = 0.7 + Math.random() * 1.6; if (Math.random() < 0.6) this.wander(e, night, '林木草竹棉'); }
        } else if (e.type === '魚') {
          e.moveT = 0.5 + Math.random() * 1.2; if (Math.random() < 0.7) this.wander(e, night, null);
        } else if (e.type === '虎') {
          const scared = w.lightNear(e.x, e.y, 2) || w.lightNear(p.x, p.y, 2) || g.torchLit() || this.dragonNear(e.x, e.y, 4);
          const sheltered = !!DB[w.get(p.x, p.y)].shelter;
          const range = night ? 8 : 4;
          if ((scared || sheltered) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
          else if (e.calm <= 0 && d <= range) {
            if (d <= 1) { g.tigerAttack(e); e.calm = 14; e.moveT = 0.9; }
            else { e.moveT = night ? 0.24 : 0.3; this.stepTo(e, p.x, p.y, false, night); }
          } else {
            e.moveT = 0.6 + Math.random() * 1.4;
            if (Math.random() < 0.6) this.wander(e, night, night ? null : '森林');
          }
        }
      }
    }

    serialize() { return this.list.filter(e => e.type === '龍').map(e => ({ t: e.type, x: e.x, y: e.y })); }
    restore(arr) { for (const s of arr || []) this.add(s.t, s.x, s.y); }
  }

  root.Entities = Entities;
})();
