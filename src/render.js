// render.js —— 水墨渲染：宣紙、滲墨的字、晝夜、小地圖
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB;
  const FONT = '"LXGW WenKai TC", "BiauKai", "DFKai-SB", "標楷體", "Kaiti TC", "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif TC", "Noto Serif SC", "Noto Serif CJK TC", "PingFang TC", "WenQuanYi Zen Hei", serif';   // 簡體字霞鶩文楷 TC 也有，缺的幾個落到 SC 字型
  const L = (s) => (window.I18N ? window.I18N.t(s) : s);   // 畫布上的字：選了簡體就轉（v0.24）
  const MINI = {
    '淼': '#4a6f8f', '水': '#6f93b0', '沙': '#d9c89a', '石': '#9c9a93', '山': '#6e6c75', '雪': '#e8ecf2',
    '草': '#b9c98f', '花': '#d29b8e', '木': '#8aa86f', '林': '#5e8a55', '森': '#3b5f3a', '竹': '#7fa36b', '田': '#d1c572',
    '土': '#a98a62', '灰': '#8d8781', '白': '#f3ebd8', '火': '#d9593c', '炎': '#d9593c', '焱': '#d9593c',
    '明': '#f0c54a', '休': '#9a6b45', '橋': '#9a6b45', '困': '#7a5a3e', '碑': '#2a2724', '日': '#e07a4a', '月': '#e3c35a',
    '果': '#c9654a', '灶': '#d9593c', '鼎': '#b4452c', '包': '#2a2724', '煤': '#2a2724', '鐵': '#8a5a3a', '網': '#5a86a8', '罟': '#4f7a9c', '罾': '#446e90', '路': '#c9b27a', '牆': '#8a6a4a', '門': '#9a7a55', '井': '#4a6f8f',
    '棉': '#e8e2d0', '礫': '#b9b4a8', '磚': '#9a5a40', '窗': '#c09a6a', '沼': '#6b6a3c', '棧': '#9a6b45', '床': '#a06a4a', '橋': '#9a6b45', '漁': '#5a86a8', '麻': '#a9b07a', '偶': '#b08a5a', '櫃': '#7a4e2d', '舟': '#7a4e2d',
    '塔': '#2a2724', '寺': '#5a3e2b', '船': '#5a3e2b', '泉': '#4a6f8f', '墓': '#6e6c75', '洞': '#2a2724', '燈': '#e0a020'
  };

  class Renderer {
    constructor(canvas, mini) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.mini = mini; this.mctx = mini.getContext('2d');
      this.tile = 40;
      this.atlas = new Map();
      this.paper = this.makePaper();
      this.pattern = null;
      this.night = document.createElement('canvas');
      this.camX = 0; this.camY = 0; this.camInit = false;
      this.shake = 0; this.miniAcc = 1;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      // 書法字體加載完成後，重建字形緩存
      if (document.fonts) {
        document.fonts.load('32px "LXGW WenKai TC"').then(() => this.atlas.clear()).catch(() => {});
        document.fonts.addEventListener('loadingdone', () => this.atlas.clear());
      }
    }
    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth; this.h = window.innerHeight;
      for (const c of [this.cv, this.night]) { c.width = Math.floor(this.w * this.dpr); c.height = Math.floor(this.h * this.dpr); }
      this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    }

    // 宣紙：暖色底 + 細碎噪點 + 若干纖維
    makePaper() {
      const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d');
      x.fillStyle = '#efe5cf'; x.fillRect(0, 0, S, S);
      const img = x.getImageData(0, 0, S, S), d = img.data, rnd = U.mulberry32(7);
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
      x.putImageData(img, 0, 0);
      x.strokeStyle = 'rgba(120, 95, 60, 0.07)'; x.lineWidth = 1;
      for (let i = 0; i < 160; i++) {
        const ax = rnd() * S, ay = rnd() * S, a = rnd() * Math.PI * 2, l = 10 + rnd() * 40;
        x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo(ax + Math.cos(a + 0.5) * l * 0.5, ay + Math.sin(a + 0.5) * l * 0.5, ax + Math.cos(a) * l, ay + Math.sin(a) * l); x.stroke();
      }
      for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(90, 70, 40,' + (0.03 + rnd() * 0.05) + ')'; x.beginPath(); x.arc(rnd() * S, rnd() * S, 1 + rnd() * 2, 0, 7); x.fill(); }
      return c;
    }

    // 字形緩存：每個字按顏色渲染一次（帶一層模糊的"滲墨"），之後只做 drawImage
    glyph(ch, color) {
      ch = L(ch);   // 選了簡體：畫簡體字（字形各自快取）
      const key = ch + '|' + color;
      let c = this.atlas.get(key);
      if (c) return c;
      const S = 128; c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d');
      x.font = Math.round(S * 0.72) + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
      if ('filter' in x) { x.filter = 'blur(3px)'; x.globalAlpha = 0.32; x.fillText(ch, S / 2, S / 2 + 4); x.filter = 'none'; }
      x.globalAlpha = 1; x.fillText(ch, S / 2, S / 2 + 4);
      this.atlas.set(key, c);
      return c;
    }
    drawShip(cx, cy, rec, now, warded) {
      const T = this.tile, k = G.SHIPS[rec.kind] || G.SHIPS['孤帆'], size = T * Math.max(k.w, k.h) * 0.9, hurt = rec.hp / k.hp;
      const ctx = this.ctx;
      ctx.save(); ctx.fillStyle = 'rgba(47,88,120,0.18)'; ctx.beginPath(); ctx.ellipse(cx, cy + size * 0.32, size * 0.5, size * 0.14, 0, 0, 7); ctx.fill(); ctx.restore();
      this.drawGlyph('舟', hurt < 0.34 ? G.INK.red : G.INK.brown, cx, cy + Math.sin(now * 1.5) * 2, size, Math.sin(now * 1.5) * 0.04, 0.95);
      if (warded) this.drawGlyph('骨', G.INK.red, cx, cy - size * 0.42, T * 0.42, 0, 0.9);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    drawGlyph(ch, color, px, py, size, rot, alpha) {
      const ctx = this.ctx, s = this.dpr, c = rot ? Math.cos(rot) : 1, sn = rot ? Math.sin(rot) : 0;
      ctx.setTransform(s * c, s * sn, -s * sn, s * c, px * s, py * s);
      const a = alpha === undefined ? 1 : alpha;
      if (a < 1) ctx.globalAlpha = a;
      ctx.drawImage(this.glyph(ch, color), -size * 0.65, -size * 0.65, size * 1.3, size * 1.3);
      if (a < 1) ctx.globalAlpha = 1;
      ctx.setTransform(s, 0, 0, s, 0, 0);
    }
    brushRect(x, y, s, color, lw) {
      const ctx = this.ctx; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.lineCap = 'round';
      const j = () => (Math.random() - 0.5) * 1.5;
      ctx.beginPath(); ctx.moveTo(x + j(), y + j()); ctx.lineTo(x + s + j(), y + j()); ctx.lineTo(x + s + j(), y + s + j()); ctx.lineTo(x + j(), y + s + j()); ctx.closePath(); ctx.stroke(); ctx.restore();
    }

    draw(g, dt, now) {
      const ctx = this.ctx, T = this.tile, w = this.w, h = this.h, world = g.world, p = g.player;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // —— 相機：跟著玩家，略帶遲滯
      const cx = p.rx + 0.5, cy = p.ry + 0.5;
      if (!this.camInit) { this.camX = cx; this.camY = cy; this.camInit = true; }
      const k = Math.min(1, dt * 7);
      this.camX += (cx - this.camX) * k; this.camY += (cy - this.camY) * k;
      let ox = w / 2 - this.camX * T, oy = h / 2 - this.camY * T;
      if (this.shake > 0) { this.shake -= dt; ox += (Math.random() - 0.5) * 10 * this.shake; oy += (Math.random() - 0.5) * 10 * this.shake; }

      // —— 宣紙隨世界滾動
      if (!this.pattern) this.pattern = ctx.createPattern(this.paper, 'repeat');
      ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = this.pattern; ctx.fillRect(-ox - 2, -oy - 2, w + 4, h + 4); ctx.restore();

      const x0 = Math.floor(-ox / T) - 1, x1 = Math.floor((w - ox) / T) + 1;
      const y0 = Math.floor(-oy / T) - 1, y1 = Math.floor((h - oy) / T) + 1;
      const lights = [];
      const act = g.action;

      // —— 地上的字
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const ch = world.get(x, y);
        const burning = world.isBurning(x, y);
        const d = DB[ch];
        const lit = ch === '灶' && world.stoveLit(x, y);
        const lr = ch === '燈' && world.isBig(x, y) ? 9 : d.light;   // 島外那盞燈塔照得最遠
        if (lr > 0 || burning || lit) lights.push({ x, y, r: Math.max(lr, burning ? 2.5 : 0, lit ? 3 : 0) });
        if (ch === '白' || world.isBig(x, y) || (ch === '舟' && world.shipCells.has(U.key(x, y)))) continue;      // 大字地標、停著的船整體另畫
        const r = U.hash2(x, y, 99);
        let rot = ((r & 255) / 255 - 0.5) * 0.16, scale = (0.84 + ((r >>> 8) & 255) / 255 * 0.16) * d.vis[0];
        let dx = ((r >>> 16) & 255) / 255 * 4 - 2, dy = ((r >>> 24) & 255) / 255 * 4 - 2, alpha = d.vis[1];
        if (d.kind === 'water') dy += Math.sin(now * 1.6 + x * 0.9 + y * 1.3) * 1.8;
        if (d.kind === 'fire' || burning) { scale *= 1 + 0.1 * Math.sin(now * 15 + r); rot += Math.sin(now * 9 + (r & 31)) * 0.06; }
        if (ch === '明' || ch === '日') scale *= 1 + 0.04 * Math.sin(now * 3 + r);
        if (burning) alpha = 1;
        if (act && act.type === 'gather' && act.x === x && act.y === y) { const pr = act.t / act.dur; alpha *= 1 - pr * 0.85; scale *= 1 - pr * 0.35; rot += pr * 0.5; }
        const color = burning && d.kind !== 'fire' ? G.INK.red : (ch === '灶' && !lit ? G.INK.ash : d.ink);
        if (ch.length > 1) {   // 雙字之物（木屋）：兩個字並排寫小一點
          this.drawGlyph(ch[0], color, ox + x * T + T * 0.3, oy + y * T + T / 2 + dy, T * scale * 0.62, rot, alpha);
          this.drawGlyph(ch[1], color, ox + x * T + T * 0.7, oy + y * T + T / 2 + dy, T * scale * 0.62, rot, alpha);
        } else this.drawGlyph(ch, color, ox + x * T + T / 2 + dx, oy + y * T + T / 2 + dy, T * scale, rot, alpha);
        if ((burning && d.kind !== 'fire') || lit) this.drawGlyph('火', G.INK.red, ox + x * T + T * 0.74, oy + y * T + T * 0.3, T * 0.45 * (1 + 0.15 * Math.sin(now * 13 + r)), rot, 0.95);
      }

      // —— 大字地標：一個字佔好幾格
      for (const pl of world.places) {
        if (pl.template || pl.x + pl.w < x0 || pl.x > x1 || pl.y + pl.h < y0 || pl.y > y1) continue;
        const r = U.hash2(pl.x, pl.y, 7), rot = ((r & 255) / 255 - 0.5) * 0.08;
        const cx2 = ox + (pl.x + pl.w / 2) * T, cy2 = oy + (pl.y + pl.h / 2) * T, size = T * Math.max(pl.w, pl.h) * 0.92;
        if (pl.ch === '燈') { ctx.save(); ctx.fillStyle = 'rgba(224,160,32,' + (0.10 + 0.08 * Math.sin(now * 2)) + ')'; ctx.beginPath(); ctx.arc(cx2, cy2, size * 0.9, 0, 7); ctx.fill(); ctx.restore(); }
        this.drawGlyph(pl.ch, DB[pl.ch].ink, cx2, cy2, size, rot, pl.ch === '寺' ? 0.85 : 1);
      }
      // —— 停著的船：一個「舟」字佔整個船身，船頭有首骨就寫個小「骨」
      for (const rec of world.ships.values()) {
        const c = world.shipCenter(rec);
        if (c.x + 2 < x0 || c.x - 2 > x1 || c.y + 2 < y0 || c.y - 2 > y1) continue;
        this.drawShip(ox + c.x * T, oy + c.y * T, rec, now, g.shipSkulls(rec).length > 0);
      }
      // —— 實體
      for (const e of g.ents.list) {
        if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
        const px = ox + e.rx * T + T / 2, py = oy + e.ry * T + T / 2, d = DB[e.type];
        if (e.type === '魄') {
          // 魄：半透明、搖曳、腳下沒影子；煙滅時散開
          const wob = Math.sin(now * 6 + e.bob) * 0.12, fade = e.fade !== undefined ? e.fade : 1;
          ctx.save(); ctx.fillStyle = 'rgba(59,53,80,' + (0.16 * fade) + ')'; ctx.beginPath(); ctx.arc(px, py, T * (0.62 + (1 - fade) * 0.8), 0, 7); ctx.fill(); ctx.restore();
          this.drawGlyph('魄', d.ink, px, py + Math.sin(now * 3 + e.bob) * 3 - (1 - fade) * T * 0.6, T * (1.0 + (1 - fade) * 0.5), wob, (e.frozen ? 0.5 : 0.78) * fade);
          continue;
        }
        if (e.type === '蜃') {       // 蜃：一個大字，身下一圈暗水旋著
          ctx.save(); ctx.strokeStyle = 'rgba(34,63,90,0.35)'; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(px, py, T * (0.7 + i * 0.25), now * (1 + i * 0.3) + i, now * (1 + i * 0.3) + i + 4); ctx.stroke(); }
          ctx.restore();
          this.drawGlyph('蜃', d.ink, px, py + Math.sin(now * 1.2 + e.bob) * 3, T * 1.45, Math.sin(now * 0.8 + e.bob) * 0.06, 1);
          continue;
        }
        const size = e.type === '虎' ? 0.95 : e.type === '龍' ? 1.1 : e.type === '鹿' ? 0.8 : e.type === '魚' ? 0.6 : 0.55;
        const bobY = e.type === '鳥' ? Math.sin(now * 5 + e.bob) * 3 : e.type === '龍' ? Math.sin(now * 3 + e.bob) * 4 : e.type === '魚' ? Math.sin(now * 2 + e.bob) * 1.5 : 0;
        if (e.type === '龍') lights.push({ x: e.x, y: e.y, r: 3 });
        const rot = e.type === '魚' ? Math.sin(now * 2 + e.bob) * 0.2 : 0;
        if (e.type === '虎' && e.calm <= 0 && U.cheb(e.x, e.y, p.x, p.y) <= 8) {
          ctx.save(); ctx.fillStyle = 'rgba(180,57,42,0.12)'; ctx.beginPath(); ctx.arc(px, py, T * 0.6, 0, 7); ctx.fill(); ctx.restore();
        }
        this.drawGlyph(e.type, (e.type === '蟾' || e.type === '蛛') && e.venom ? G.INK.red : d.ink, px, py + bobY, T * size, rot, 1);
        if (e.provoked > 0 && U.cheb(e.x, e.y, p.x, p.y) <= 7) { ctx.save(); ctx.fillStyle = G.INK.red; ctx.font = 'bold ' + Math.round(T * 0.42) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('怒', px + T * 0.4, py - T * 0.42); ctx.restore(); }   // 被彈弓惹惱、七格內要撲過來的
      }
      // —— 彈弓的準星：手持彈弓時，面前九格內會被打到的那隻
      { const st = g.slingTarget && g.slingTarget();
        if (st) { const sx = ox + st.rx * T + T / 2, sy = oy + st.ry * T + T / 2; ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,0.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -now * 10; ctx.beginPath(); ctx.arc(sx, sy, T * 0.62, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(sx - T * 0.8, sy); ctx.lineTo(sx - T * 0.45, sy); ctx.moveTo(sx + T * 0.45, sy); ctx.lineTo(sx + T * 0.8, sy); ctx.moveTo(sx, sy - T * 0.8); ctx.lineTo(sx, sy - T * 0.45); ctx.moveTo(sx, sy + T * 0.45); ctx.lineTo(sx, sy + T * 0.8); ctx.stroke(); ctx.restore(); } }

      // —— 玩家：一個「人」字
      {
        const px = ox + p.rx * T + T / 2, py = oy + p.ry * T + T / 2;
        const moving = p.moveT > 0;
        const rot = moving ? Math.sin(now * 14) * 0.14 : Math.sin(now * 1.5) * 0.02;
        // 一圈留白讓「人」從字海里浮出來，腳邊一點硃砂像印章
        ctx.save();
        const halo = ctx.createRadialGradient(px, py, T * 0.2, px, py, T * 0.78);
        halo.addColorStop(0, 'rgba(243,235,216,0.92)'); halo.addColorStop(0.7, 'rgba(243,235,216,0.7)'); halo.addColorStop(1, 'rgba(243,235,216,0)');
        ctx.fillStyle = halo; ctx.fillRect(px - T, py - T, T * 2, T * 2);
        ctx.fillStyle = 'rgba(30,20,10,0.16)'; ctx.beginPath(); ctx.ellipse(px, py + T * 0.44, T * 0.32, T * 0.1, 0, 0, 7); ctx.fill();
        ctx.restore();
        if (g.totemOn && g.totemOn()) { ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,.3)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]); ctx.lineDashOffset = -now * 20; ctx.strokeRect(px - T * 7.5, py - T * 7.5, T * 15, T * 15); ctx.restore(); }   // 七格內（方框，與判定一致）
        if (p.sailing && p.ship) {   // 船身跟著人：孤帆一乘二、方舟二乘三，人站在船身裡
          const off = (G.SHIPS[p.ship.kind] || G.SHIPS['孤帆']).off; let sx = 0, sy = 0; for (const [dx, dy] of off) { sx += dx; sy += dy; }
          this.drawShip(ox + (p.rx + sx / off.length) * T + T / 2, oy + (p.ry + sy / off.length) * T + T / 2, p.ship, now, g.shipWarded());
        }
        if (p.swimming) {            // 落水：一圈圈水紋，人只露半身
          ctx.save(); ctx.strokeStyle = 'rgba(47,88,120,0.5)'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 2; i++) { const r = T * (0.35 + ((now * 0.8 + i * 0.5) % 1) * 0.45); ctx.globalAlpha = 1 - ((now * 0.8 + i * 0.5) % 1); ctx.beginPath(); ctx.ellipse(px, py + T * 0.25, r, r * 0.4, 0, 0, 7); ctx.stroke(); }
          ctx.restore();
        }
        this.drawGlyph('人', G.INK.black, px, py - (p.sailing ? T * 0.12 : 0) + (p.swimming ? T * 0.12 + Math.sin(now * 3) * 2 : 0), T * 1.18, rot, p.swimming ? 0.8 : 1);
        ctx.save(); ctx.fillStyle = G.INK.red; ctx.beginPath(); ctx.arc(px + T * 0.34, py + T * 0.36, T * 0.07, 0, 7); ctx.fill(); ctx.restore();
      }
      // —— 撒網的網影：手裡拿著網、站在水邊，淺色畫出撒得到的格子（還沒撒）
      {
        const cp = g.castPreview && g.castPreview();
        if (cp) {
          let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
          for (const [x, y] of cp.cells) {
            mx = Math.min(mx, x); my = Math.min(my, y); Mx = Math.max(Mx, x); My = Math.max(My, y);
            this.drawGlyph(cp.ch, cp.torn ? G.INK.black : G.INK.water, ox + x * T + T / 2, oy + y * T + T / 2, T * 0.9, 0, cp.torn ? 0.12 : 0.26 + 0.06 * Math.sin(now * 4));
          }
          ctx.save(); ctx.strokeStyle = cp.torn ? 'rgba(60,55,50,0.35)' : 'rgba(47,88,120,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -now * 12;
          ctx.strokeRect(ox + mx * T + 2, oy + my * T + 2, (Mx - mx + 1) * T - 4, (My - my + 1) * T - 4); ctx.restore();
        }
      }
      // —— 面前的格子
      {
        const tx = p.x + p.fx, ty = p.y + p.fy;
        this.brushRect(ox + tx * T + 3, oy + ty * T + 3, T - 6, 'rgba(180,57,42,0.55)', 1.5);
        if (act && act.type === 'gather') {
          const pr = act.t / act.dur, ccx = ox + act.x * T + T / 2, ccy = oy + act.y * T + T / 2;
          ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(ccx, ccy, T * 0.58, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
      // —— 特效
      for (const f of g.fx) {
        const pr = Math.min(1, f.t / f.dur), px = ox + f.x * T + T / 2, py = oy + f.y * T + T / 2;
        if (f.type === 'write') {
          this.drawGlyph(f.ch, f.color, px, py, T * (1.6 - 0.6 * pr), (1 - pr) * 0.4, pr * 0.9);
          ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,' + (0.6 * (1 - pr)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, T * (0.3 + 0.5 * pr), 0, 7); ctx.stroke(); ctx.restore();
        } else if (f.type === 'shot') {          // 彈弓的石子：一顆小黑點飛過去
          const qx = ox + (f.x + (f.x1 - f.x) * pr) * T + T / 2, qy = oy + (f.y + (f.y1 - f.y) * pr) * T + T / 2 - Math.sin(pr * Math.PI) * T * 0.3;
          ctx.save(); ctx.fillStyle = G.INK.black; ctx.beginPath(); ctx.arc(qx, qy, T * 0.09, 0, 7); ctx.fill(); ctx.restore();
        } else if (f.type === 'cast') {          // 撒網：網字一閃落下
          this.drawGlyph(f.ch, G.INK.water, px, py, T * (1.25 - 0.3 * pr), 0, 0.85 * (1 - pr));
        } else if (f.type === 'fail') {
          ctx.save(); ctx.fillStyle = 'rgba(60,55,50,' + (0.35 * (1 - pr)) + ')'; ctx.beginPath(); ctx.ellipse(px, py, T * (0.3 + 0.3 * pr), T * (0.2 + 0.15 * pr), 0.4, 0, 7); ctx.fill(); ctx.restore();
        } else if (f.type === 'float') {
          ctx.save(); ctx.globalAlpha = 1 - pr; ctx.fillStyle = f.color || G.INK.black; ctx.font = 'bold ' + Math.round(T * 0.5) + 'px ' + FONT; ctx.textAlign = 'center';
          ctx.fillText(L(f.text), px, py - T * 0.3 - pr * T * 0.9); ctx.restore();
        }
      }

      // —— 霧障：每格幾團慢慢飄的白霧，正中寫一個淡淡的「霧」字
      if (world.fogs.size) {
        for (const f of world.fogs.values()) {
          let cx = 0, cy = 0, n = 0;
          for (const k of f.cells) {
            const [x, y] = U.unkey(k); cx += x; cy += y; n++;
            if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
            const left = Math.min(1, (f.until - world.time) / 20);       // 快散時淡下去
            for (let i = 0; i < 3; i++) {
              const r = U.hash2(x, y, 300 + i), ph = (r & 1023) / 1023 * 6.28;
              const px = ox + x * T + T / 2 + Math.sin(now * 0.35 + ph) * T * 0.28, py = oy + y * T + T / 2 + Math.cos(now * 0.27 + ph * 1.3) * T * 0.22;
              const rad = T * (0.75 + ((r >>> 10) & 255) / 255 * 0.45);
              const gr = ctx.createRadialGradient(px, py, 0, px, py, rad);
              gr.addColorStop(0, 'rgba(248,247,242,' + (0.62 * left) + ')'); gr.addColorStop(0.6, 'rgba(240,238,232,' + (0.35 * left) + ')'); gr.addColorStop(1, 'rgba(240,238,232,0)');
              ctx.fillStyle = gr; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
            }
          }
          if (n) { const mx = ox + (cx / n) * T + T / 2, my = oy + (cy / n) * T + T / 2; if (mx > -T && my > -T && mx < w + T && my < h + T) this.drawGlyph('霧', G.INK.ash, mx, my, T * 0.9, 0, 0.35); }
        }
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      // —— 夜色：一層藍墨，在玩家與光源處挖出洞
      const dark = g.darkness();
      if (dark > 0.02) {
        const n = this.night, nc = n.getContext('2d');
        nc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); nc.globalCompositeOperation = 'source-over'; nc.clearRect(0, 0, w, h);
        nc.fillStyle = 'rgba(12, 16, 36,' + (0.8 * dark) + ')'; nc.fillRect(0, 0, w, h);
        nc.globalCompositeOperation = 'destination-out';
        const cut = (px, py, r, a) => { const gr = nc.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.7) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); nc.fillStyle = gr; nc.fillRect(px - r, py - r, r * 2, r * 2); };
        // 磚擋光（v0.28）：光源附近有磚、門、殘牆時，只照得到看得見的格子（屋裡的燈照不出去）；附近沒擋就照常畫圓
        const litCells = (lx, ly, r) => {
          const R = Math.ceil(r) + 1; let any = false;
          for (let dy = -R; dy <= R && !any; dy++) for (let dx = -R; dx <= R; dx++) { const d = DB[world.get(lx + dx, ly + dy)]; if (d && d.opaque) { any = true; break; } }
          if (!any) return null;
          const cells = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R && world.clear(lx, ly, lx + dx, ly + dy)) cells.push([lx + dx, ly + dy]);
          return cells;
        };
        const clipTo = (c, cells) => { c.beginPath(); for (const [x, y] of cells) c.rect(ox + x * T - 0.5, oy + y * T - 0.5, T + 1, T + 1); c.clip(); };
        const cutLit = (lx, ly, px, py, r, a) => { const cells = litCells(lx, ly, r / T); if (!cells) { cut(px, py, r, a); return; } nc.save(); clipTo(nc, cells); cut(px, py, r, a); nc.restore(); };
        cutLit(p.x, p.y, ox + p.rx * T + T / 2, oy + p.ry * T + T / 2, T * g.playerLight(), 1);
        if (g.torchLit()) lights.push({ x: p.x, y: p.y, r: 3 });
        for (const l of lights) cutLit(l.x, l.y, ox + l.x * T + T / 2, oy + l.y * T + T / 2, T * (l.r + 0.25 * Math.sin(now * 6 + l.x * 3 + l.y)), 1);
        ctx.drawImage(n, 0, 0, n.width, n.height, 0, 0, w, h);
        // 光源的暖暈
        ctx.save(); ctx.globalCompositeOperation = 'source-over';
        for (const l of lights) {
          const px = ox + l.x * T + T / 2, py = oy + l.y * T + T / 2, r = T * l.r, cells = litCells(l.x, l.y, l.r);
          if (cells) { ctx.save(); clipTo(ctx, cells); }
          const gr = ctx.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(255,190,90,' + (0.22 * dark) + ')'); gr.addColorStop(1, 'rgba(255,190,90,0)');
          ctx.fillStyle = gr; ctx.fillRect(px - r, py - r, r * 2, r * 2);
          if (cells) ctx.restore();
        }
        ctx.restore();
      }
      // —— 雨：一層淡墨與斜斜的雨絲，跟著世界滾動；起雨收雨各淡入淡出一息半
      const wantRain = world.raining() ? 1 : 0;
      this.rainA = (this.rainA || 0) + (wantRain - (this.rainA || 0)) * Math.min(1, dt / 1.5);
      if (this.rainA > 0.02) {
        const pm = (a, m) => ((a % m) + m) % m;
        ctx.save(); ctx.globalAlpha = this.rainA;
        ctx.fillStyle = 'rgba(70,80,100,' + (0.12 + 0.06 * dark) + ')'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = dark > 0.5 ? 'rgba(210,220,240,0.6)' : 'rgba(40,50,75,0.6)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath();
        const n = Math.min(380, Math.floor(w * h / 3000)), span = h + 60, wide = w + 80, drift = now * 520;
        for (let i = 0; i < n; i++) {
          const r = U.hash2(i, 131, 7), len = 9 + (r & 15);
          const by = ((r >>> 16) & 4095) / 4096 * span, bx = ((r >>> 4) & 4095) / 4096 * wide;
          const yy = pm(by + drift * (0.85 + (r & 7) / 24) + oy * 0.5, span) - 30;
          const px = pm(bx - yy * 0.22 + ox * 0.5, wide) - 40;
          ctx.moveTo(px, yy); ctx.lineTo(px - len * 0.22, yy + len);
        }
        ctx.stroke(); ctx.restore();
      }
      // —— 紙邊的舊色，以及身體的訊號：掉血泛紅、中毒泛綠、神志不清泛藍
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(80,60,30,0)'); vg.addColorStop(1, 'rgba(80,60,30,0.32)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      const vig = g.vignette ? g.vignette() : null;
      if (vig) {
        const tints = [['180,40,30', vig.red], ['60,140,60', vig.green], ['50,80,180', vig.blue]];
        for (const [rgb, a] of tints) {
          if (a <= 0.01) continue;
          const pulse = 0.85 + 0.15 * Math.sin(now * 3);
          const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
          gr.addColorStop(0, 'rgba(' + rgb + ',0)'); gr.addColorStop(1, 'rgba(' + rgb + ',' + (a * pulse) + ')');
          ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
        }
      }

      // —— 小地圖
      this.miniAcc += dt;
      if (this.miniAcc > 0.25 && !this.mini.classList.contains('hidden')) { this.miniAcc = 0; this.drawMini(g); }
    }

    drawMini(g) {
      const m = this.mctx, S = this.mini.width, N = 50, px = S / N, p = g.player;
      m.fillStyle = '#efe5cf'; m.fillRect(0, 0, S, S);
      const half = N >> 1;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = p.x - half + i, y = p.y - half + j;
        if (!g.world.isSeen(x, y)) continue;                    // 沒看過的地方還是白紙
        const ch = g.world.get(x, y);
        m.fillStyle = g.world.isBurning(x, y) ? MINI['火'] : (MINI[ch] || '#999');
        m.fillRect(i * px, j * px, px + 0.5, px + 0.5);
      }
      m.font = '11px ' + FONT; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = '#1c1a17';
      for (const pl of g.world.places) {
        if (!pl.seen) continue;
        const i = pl.x + (pl.w - 1) / 2 - p.x + half, j = pl.y + (pl.h - 1) / 2 - p.y + half;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        m.fillText(L(pl.ch || pl.name), i * px + px / 2, j * px + px / 2);
      }
      m.fillStyle = 'rgba(200,198,192,0.85)';
      for (const f of g.world.fogs.values()) for (const k of f.cells) { const [x, y] = U.unkey(k), i = x - p.x + half, j = y - p.y + half; if (i >= 0 && j >= 0 && i < N && j < N && g.world.isSeen(x, y)) m.fillRect(i * px, j * px, px + 0.5, px + 0.5); }
      for (const e of g.ents.list) {
        const i = e.x - p.x + half, j = e.y - p.y + half;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        if (e.type === '虎') { m.fillStyle = '#b4392a'; m.fillRect(i * px - 1, j * px - 1, px + 2, px + 2); }
        else if (e.type === '魄') { m.fillStyle = '#3b3550'; m.fillRect(i * px - 1, j * px - 1, px + 2, px + 2); }
        else if (e.type === '蜃') { m.fillStyle = '#223f5a'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); }
        else if (e.type === '豹' || e.type === '狼' || e.type === '蛇') { m.fillStyle = '#8a2a1a'; m.fillRect(i * px, j * px, px + 1, px + 1); }
      }
      m.fillStyle = '#1c1a17'; m.beginPath(); m.arc(half * px + px / 2, half * px + px / 2, 3, 0, 7); m.fill();
      if (g.player.home) {
        const i = g.player.home.x - p.x + half, j = g.player.home.y - p.y + half;
        if (i >= 0 && j >= 0 && i < N && j < N) { m.fillStyle = '#9a6b45'; m.beginPath(); m.arc(i * px + px / 2, j * px + px / 2, 2.5, 0, 7); m.fill(); }
      }
      // 淡淡的夜色
      const dk = g.darkness(); if (dk > 0.02) { m.fillStyle = 'rgba(12,16,36,' + (0.35 * dk) + ')'; m.fillRect(0, 0, S, S); }
    }

    // 全島地圖：走過的地方才有墨，地標蓋朱印
    drawBigMap(g, cv) {
      const w = g.world, p = g.player, R = G.SEA_EDGE, N = R * 2, S = cv.width, px = S / N;
      const m = cv.getContext('2d');
      m.fillStyle = '#efe5cf'; m.fillRect(0, 0, S, S);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = i - R, y = j - R;
        if (!w.isSeen(x, y)) continue;
        const ch = w.get(x, y);
        m.fillStyle = MINI[ch] || '#999'; m.globalAlpha = 0.9;
        m.fillRect(i * px, j * px, px + 0.4, px + 0.4);
      }
      m.globalAlpha = 1;
      m.fillStyle = 'rgba(200,198,192,0.85)';
      for (const f of w.fogs.values()) for (const k of f.cells) { const [x, y] = U.unkey(k); if (w.isSeen(x, y)) m.fillRect((x + R) * px, (y + R) * px, px + 0.4, px + 0.4); }
      // 碑
      m.font = Math.round(px * 2.6) + 'px ' + FONT; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = '#1c1a17';
      for (const s of w.steles.values()) if (w.isSeen(s.x, s.y)) m.fillText('碑', (s.x + R + 0.5) * px, (s.y + R + 0.5) * px);
      // 地標：大字 + 朱印名
      for (const pl of w.places) {
        if (!pl.seen) continue;
        const cx = (pl.x + pl.w / 2 + R) * px, cy = (pl.y + pl.h / 2 + R) * px;
        m.font = Math.round(px * 4.2) + 'px ' + FONT; m.fillStyle = pl.ch ? (DB[pl.ch].ink) : '#5a3e2b';
        m.fillText(L(pl.ch || '村'), cx, cy);
        const read = p.places && p.places[pl.id] === 2;
        m.fillStyle = read ? '#b4392a' : 'rgba(180,57,42,0.45)'; m.fillRect(cx + px * 2.4, cy - px * 2.2, px * 3.2, px * 3.2);
        m.fillStyle = '#f7efe0'; m.font = Math.round(px * 2.4) + 'px ' + FONT; m.fillText(L(pl.name), cx + px * 4.0, cy - px * 0.5);
      }
      // 家、人
      if (p.home) { m.fillStyle = '#9a6b45'; m.beginPath(); m.arc((p.home.x + R + 0.5) * px, (p.home.y + R + 0.5) * px, px * 1.2, 0, 7); m.fill(); }
      m.font = Math.round(px * 4) + 'px ' + FONT; m.fillStyle = '#1c1a17'; m.fillText('人', (p.x + R + 0.5) * px, (p.y + R + 0.5) * px);
      m.fillStyle = '#b4392a'; m.beginPath(); m.arc((p.x + R + 1.3) * px, (p.y + R + 1.3) * px, px * 0.6, 0, 7); m.fill();
      // 北
      m.font = Math.round(px * 3.5) + 'px ' + FONT; m.fillStyle = '#4a4238'; m.fillText('北', S - px * 5, px * 5);
      m.strokeStyle = '#4a4238'; m.lineWidth = 1.5; m.beginPath(); m.moveTo(S - px * 5, px * 8); m.lineTo(S - px * 5, px * 14); m.stroke();
    }
  }

  window.Renderer = Renderer;
})();
