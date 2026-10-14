// entities.js —— 世界里会动的东西：鸟、鱼、鹿、虎，以及"日/月"的光影与散落的墨点
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const BEASTS = ['鸟', '鹿', '鱼', '虎'];

  class Entities {
    constructor(world) {
      this.world = world;
      this.list = [];
      this.spawnAcc = 0;
      this.shimmerAcc = 0;
    }
    at(x, y) { for (const e of this.list) if (e.x === x && e.y === y) return e; return null; }
    beastAt(x, y) { for (const e of this.list) if (e.x === x && e.y === y && DB[e.type].kind === 'beast') return e; return null; }
    count(type) { let n = 0; for (const e of this.list) if (e.type === type) n++; return n; }
    add(type, x, y, extra) {
      const e = Object.assign({ type, x, y, rx: x, ry: y, moveT: Math.random(), cage: 0, calm: 0, life: 0, ink: 0, bob: Math.random() * 6 }, extra || {});
      this.list.push(e);
      return e;
    }
    remove(e) { const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1); }

    // 出生地：各有各的家
    habitat(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (type === '鸟') return d.kind === 'plant' || d.kind === 'ground';
      if (type === '鱼') return d.kind === 'water';
      if (type === '鹿') return ch === '林' || ch === '木' || ch === '草' || ch === '竹';
      if (type === '虎') return ch === '森' || (night && ch === '林');
      return d.walk > 0;
    }
    // 能不能站上去
    canStand(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (type === '鸟') return d.kind !== 'fire';
      if (type === '鱼') return d.kind === 'water';
      if (d.walk <= 0) return false;
      if (type === '虎' && !night) return d.kind === 'plant';   // 白天虎不出林
      return true;
    }

    // 朝目标走一步（away=true 则远离），只在能站的格子里选
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

    update(dt, g) {
      const p = g.player, w = this.world, night = g.darkness() > 0.5;
      // —— 刷新与消失
      this.spawnAcc += dt;
      if (this.spawnAcc > 1.5) {
        this.spawnAcc = 0;
        const caps = { '鸟': night ? 4 : 10, '鹿': 6, '鱼': 8, '虎': night ? 3 : 2 };
        for (const type of BEASTS) {
          if (this.count(type) >= caps[type]) continue;
          for (let n = 0; n < 6; n++) {
            const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 16;
            const x = p.x + Math.round(Math.cos(a) * r), y = p.y + Math.round(Math.sin(a) * r);
            if (this.habitat(type, x, y, night) && !this.at(x, y)) { this.add(type, x, y); break; }
          }
        }
      }
      // —— 日影与月影：白天落在沙雪之上，夜里浮在水面
      this.shimmerAcc += dt;
      if (this.shimmerAcc > 2) {
        this.shimmerAcc = 0;
        const day = g.daylight() > 0.6, dark = g.darkness() > 0.6;
        const want = day ? '日' : dark ? '月' : null;
        if (want && this.count(want) === 0 && Math.random() < 0.5) {
          for (let n = 0; n < 12; n++) {
            const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 7;
            const x = p.x + Math.round(Math.cos(a) * r), y = p.y + Math.round(Math.sin(a) * r);
            const ch = w.get(x, y);
            const ok = want === '日' ? (ch === '沙' || ch === '雪' || (ch === '田' && Math.random() < 0.3)) : DB[ch].kind === 'water';
            if (ok && !this.at(x, y)) { this.add(want, x, y, { life: 28 }); break; }
          }
        }
      }

      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        const kind = DB[e.type].kind;
        // 位置插值（渲染用）
        const k = Math.min(1, dt * 11);
        e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;

        if (e.life > 0) { e.life -= dt; if (e.life <= 0) { this.list.splice(i, 1); continue; } }
        if (kind !== 'beast') continue;
        if (U.cheb(e.x, e.y, p.x, p.y) > 48) { this.list.splice(i, 1); continue; }
        if (e.type === '鱼' && DB[w.get(e.x, e.y)].kind !== 'water') { this.list.splice(i, 1); continue; } // 水没了，鱼也没了
        if (e.cage > 0) { e.cage -= dt; continue; }
        if (e.calm > 0) e.calm -= dt;
        e.moveT -= dt;
        if (e.moveT > 0) continue;

        const d = U.cheb(e.x, e.y, p.x, p.y);
        if (e.type === '鸟') {
          if (d <= 3) { e.moveT = 0.18; this.stepTo(e, p.x, p.y, true, night); }
          else { e.moveT = 0.5 + Math.random() * 1.6; if (Math.random() < 0.5) this.wander(e, night, '木林森竹'); }
        } else if (e.type === '鹿') {
          if (d <= 5) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, true, night); }
          else { e.moveT = 0.7 + Math.random() * 1.6; if (Math.random() < 0.6) this.wander(e, night, '林木草竹'); }
        } else if (e.type === '鱼') {
          e.moveT = 0.5 + Math.random() * 1.2; if (Math.random() < 0.7) this.wander(e, night, null);
        } else if (e.type === '虎') {
          const scared = w.lightNear(e.x, e.y, 2) || w.lightNear(p.x, p.y, 2);
          const range = night ? 8 : 4;
          if (scared && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
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

    serialize() {
      // 只存被困的兽和墨点，其它的会自己再长出来
      return this.list.filter(e => e.type === '丶' || e.cage > 0).map(e => ({ t: e.type, x: e.x, y: e.y, ink: e.ink, cage: Math.round(e.cage), life: Math.round(e.life) }));
    }
    restore(arr) {
      for (const s of arr || []) this.add(s.t, s.x, s.y, { ink: s.ink || 0, cage: s.cage || 0, life: s.life || 0 });
    }
  }

  root.Entities = Entities;
})();
