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
    '果': '#c9654a', '灶': '#d9593c', '鼎': '#b4452c', '包': '#2a2724', '煤': '#2a2724', '鐵': '#8a5a3a', '網': '#5a86a8', '罟': '#4f7a9c', '罾': '#446e90', '路': '#c9b27a', '門': '#9a7a55', '井': '#4a6f8f',
    '棉': '#e8e2d0', '礫': '#b9b4a8', '磚': '#9a5a40', '墟': '#8a8378', '窗': '#c09a6a', '沼': '#6b6a3c', '棧': '#9a6b45', '床': '#a06a4a', '橋': '#9a6b45', '漁': '#5a86a8', '麻': '#a9b07a', '偶': '#b08a5a', '櫃': '#7a4e2d', '舟': '#7a4e2d',
    '塔': '#2a2724', '寺': '#5a3e2b', '船': '#5a3e2b', '泉': '#4a6f8f', '墓': '#6e6c75', '洞': '#2a2724', '燈': '#e0a020'
  };

  // 光照（v0.31）：夜色與暖光先畫在一張低解析度的「光照圖」上（每格 LM_S×LM_S 個取樣點），再平滑放大蓋上去；
  // 光被磚、門、墟擋，視線按地上的字的版本（world.ver）快取，不用每幀重算。各種光的顏色：
  const LM_S = 2, LAMP = [255, 192, 96], BEACON = [255, 214, 130], FIRE = [255, 138, 58], STOVE = [255, 158, 70], TORCH = [255, 172, 82], DRAGON = [236, 214, 160];
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  class Renderer {
    constructor(canvas, mini) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.mini = mini; this.mctx = mini.getContext('2d');
      this.tile = 40;
      this.atlas = new Map();
      this.paper = this.makePaper();
      this.pattern = null;
      this.lmDark = document.createElement('canvas'); this.lmGlow = document.createElement('canvas');   // 光照圖：夜色、暖光
      this.lmDarkCtx = this.lmDark.getContext('2d'); this.lmGlowCtx = this.lmGlow.getContext('2d');
      this.sightCache = new Map(); this.fogSeen = new Map();
      this.puff = this.makeSprite(64, [[0, 'rgba(248,247,242,1)'], [0.6, 'rgba(240,238,232,0.56)'], [1, 'rgba(240,238,232,0)']]);   // 一團霧
      this.bloom = this.makeSprite(64, [[0, 'rgba(255,236,190,0.9)'], [0.35, 'rgba(255,200,120,0.45)'], [1, 'rgba(255,180,90,0)']]);  // 光源的芯
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
      this.cv.width = Math.floor(this.w * this.dpr); this.cv.height = Math.floor(this.h * this.dpr);
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

    makeSprite(S, stops) {   // 一張放射漸層的小圖，之後只做 drawImage（比每幀造漸層省）
      const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      x.fillStyle = gr; x.fillRect(0, 0, S, S); return c;
    }
    // 光源 (lx, ly) 半徑 R 內哪些格子看得見：附近沒有擋光的字回 null（全看得見），否則回一張 (2R+1)² 的表；地上的字沒變就用快取
    sight(world, lx, ly, R) {
      const key = lx + ',' + ly + ',' + R, ver = world.ver || 0, c = this.sightCache.get(key);
      if (c && c.ver === ver) return c.vis;
      let any = false;
      for (let dy = -R; dy <= R && !any; dy++) for (let dx = -R; dx <= R; dx++) { const d = DB[world.get(lx + dx, ly + dy)]; if (d && d.opaque) { any = true; break; } }
      let vis = null;
      if (any) {
        const W = 2 * R + 1, R2 = (R + 0.5) * (R + 0.5); vis = new Uint8Array(W * W);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R2 && world.clear(lx, ly, lx + dx, ly + dy)) vis[(dy + R) * W + dx + R] = 1;
      }
      if (this.sightCache.size > 600) this.sightCache.clear();
      this.sightCache.set(key, { ver, vis }); return vis;
    }
    // 光照圖：每個取樣點算出還剩幾成夜色（多盞光相乘，跟以前一層層挖洞一樣）與染上的暖光，寫進兩張小圖
    lightMap(g, ox, oy, x0, x1, y0, y1, lights, dark, glowK, now) {
      const T = this.tile, S = LM_S, world = g.world, p = g.player;
      const cols = (x1 - x0 + 1) * S, rows = (y1 - y0 + 1) * S, N = cols * rows;
      if (!this.lmBuf || this.lmBuf.n !== N) this.lmBuf = { n: N, rem: new Float32Array(N), gre: new Float32Array(N), cr: new Float32Array(N), cg: new Float32Array(N), cb: new Float32Array(N), wt: new Float32Array(N) };
      if (this.lmDark.width !== cols || this.lmDark.height !== rows) {
        for (const c of [this.lmDark, this.lmGlow]) { c.width = cols; c.height = rows; }
        this.lmImgD = this.lmDarkCtx.createImageData(cols, rows); this.lmImgG = this.lmGlowCtx.createImageData(cols, rows);
        const D = this.lmImgD.data; for (let q = 0; q < D.length; q += 4) { D[q] = 12; D[q + 1] = 16; D[q + 2] = 36; }
      }
      const B = this.lmBuf; B.rem.fill(1); B.gre.fill(1); B.cr.fill(0); B.cg.fill(0); B.cb.fill(0); B.wt.fill(0);
      const add = (lx, ly, cx, cy, r, glow, col) => {
        if (r <= 0) return;
        const R = Math.ceil(r) + 1, W = 2 * R + 1, vis = this.sight(world, lx, ly, R);
        const i0 = Math.max(0, Math.floor((cx - r - x0) * S)), i1 = Math.min(cols - 1, Math.ceil((cx + r - x0) * S));
        const j0 = Math.max(0, Math.floor((cy - r - y0) * S)), j1 = Math.min(rows - 1, Math.ceil((cy + r - y0) * S));
        for (let j = j0; j <= j1; j++) {
          const sy = y0 + (j + 0.5) / S, dy = sy - cy, ty = Math.floor(sy) - ly + R;
          for (let i = i0; i <= i1; i++) {
            const sx = x0 + (i + 0.5) / S, dx = sx - cx, d = Math.sqrt(dx * dx + dy * dy) / r;
            if (d >= 1) continue;
            if (vis) { const tx = Math.floor(sx) - lx + R; if (tx < 0 || ty < 0 || tx >= W || ty >= W || !vis[ty * W + tx]) continue; }
            const k = j * cols + i;
            B.rem[k] *= 1 - (d < 0.55 ? 1 - 0.545 * d : 0.7 * smooth((1 - d) / 0.45));
            if (glow) { const a = glow * (1 - d) * (1 - d * 0.35); B.gre[k] *= 1 - a; B.cr[k] += col[0] * a; B.cg[k] += col[1] * a; B.cb[k] += col[2] * a; B.wt[k] += a; }
          }
        }
      };
      add(p.x, p.y, p.rx + 0.5, p.ry + 0.5, g.playerLight(), 0, null);   // 身邊看得見的一圈（不帶暖光）
      for (const l of lights) add(l.x, l.y, l.cx === undefined ? l.x + 0.5 : l.cx, l.cy === undefined ? l.y + 0.5 : l.cy, l.r + 0.25 * Math.sin(now * 6 + l.x * 3 + l.y), 0.24, l.c || LAMP);
      const D = this.lmImgD.data, Gd = this.lmImgG.data, dA = 0.8 * dark * 255, gA = glowK * 255;
      let gi0 = cols, gi1 = -1, gj0 = rows, gj1 = -1;   // 有暖光的範圍：只畫這一塊
      for (let j = 0, k = 0, q = 3; j < rows; j++) for (let i = 0; i < cols; i++, k++, q += 4) {
        D[q] = dA * B.rem[k];
        const ga = 1 - B.gre[k];
        if (ga > 0.004) {
          const wt = B.wt[k]; Gd[q - 3] = B.cr[k] / wt; Gd[q - 2] = B.cg[k] / wt; Gd[q - 1] = B.cb[k] / wt; Gd[q] = ga * gA;
          if (i < gi0) gi0 = i; if (i > gi1) gi1 = i; if (j < gj0) gj0 = j; if (j > gj1) gj1 = j;
        } else Gd[q] = 0;
      }
      if (dark > 0.02) this.lmDarkCtx.putImageData(this.lmImgD, 0, 0);
      const glow = gi1 >= 0, c = T / S, X = ox + x0 * T, Y = oy + y0 * T;
      let gb = null;
      if (glow) {
        gi0 = Math.max(0, gi0 - 1); gj0 = Math.max(0, gj0 - 1); gi1 = Math.min(cols - 1, gi1 + 1); gj1 = Math.min(rows - 1, gj1 + 1);
        const gw = gi1 - gi0 + 1, gh = gj1 - gj0 + 1;
        this.lmGlowCtx.putImageData(this.lmImgG, 0, 0, gi0, gj0, gw, gh);
        gb = [gi0, gj0, gw, gh, X + gi0 * c, Y + gj0 * c, gw * c, gh * c];
      }
      return { cols, rows, x: X, y: Y, w: cols * c, h: rows * c, glow, gb, cell: c, gre: B.gre };
    }
    // 霧障（v0.31）：霧是一塊連續的形，每幀照它此刻的位置與形狀算出每格蓋了幾成，蓋得多的格子濃、邊上蓋一點的淡，
    // 那一團霧畫在蓋到的部分的中心，所以看起來是整片順著風飄過去、邊緣一直在變；新起的霧淡入，散掉或吹散的霧淡出
    drawFog(g, ox, oy, x0, x1, y0, y1, dt, now) {
      const ctx = this.ctx, T = this.tile, world = g.world, seen = this.fogSeen;
      for (const [id, f] of world.fogs) seen.set(id, f);
      for (const [id, f] of seen) {
        const alive = world.fogs.get(id) === f;
        f._fade = alive ? Math.min(1, (f._fade === undefined ? 0 : f._fade) + dt / 1.2) : (f._fade === undefined ? 1 : f._fade) - dt / 1.2;
        if (!alive && f._fade <= 0) { seen.delete(id); continue; }
        if (f.x + 8 < x0 || f.x - 8 > x1 + 1 || f.y + 8 < y0 || f.y - 8 > y1 + 1) continue;
        const cov = alive ? (f._cov = world.fogCoverage(f)) : (f._cov || []);
        const left = Math.min(1, Math.max(0, (f.until - world.time) / 20)) * f._fade;     // 快散時淡下去
        let mx = 0, my = 0, mw = 0;
        for (const e of cov) {
          mx += e.mx * e.c; my += e.my * e.c; mw += e.c;
          const a = 0.62 * left * Math.min(1, e.c * 1.6); if (a <= 0.01) continue;
          for (let i = 0; i < 3; i++) {
            const r = U.hash2(e.x, e.y, 300 + i), ph = (r & 1023) / 1023 * 6.28, pull = 0.35 + 0.65 * e.c;   // 蓋得少的格子，那團霧靠向蓋到的角落
            const fx = e.x + 0.5 + (e.mx - e.x - 0.5) * (1 - pull), fy = e.y + 0.5 + (e.my - e.y - 0.5) * (1 - pull);
            const px = ox + fx * T + Math.sin(now * 0.35 + ph) * T * 0.22, py = oy + fy * T + Math.cos(now * 0.27 + ph * 1.3) * T * 0.18;
            const rad = T * (0.55 + 0.45 * Math.sqrt(e.c)) * (0.85 + ((r >>> 10) & 255) / 255 * 0.4);
            ctx.globalAlpha = a; ctx.drawImage(this.puff, px - rad, py - rad, rad * 2, rad * 2);
          }
        }
        ctx.globalAlpha = 1;
        if (mw > 0) { const cx = ox + (mx / mw) * T, cy = oy + (my / mw) * T; if (cx > -T && cy > -T && cx < this.w + T && cy < this.h + T) this.drawGlyph('霧', G.INK.ash, cx, cy, T * 0.9, 0, 0.35 * left); }
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
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
        if (lr > 0 || burning || lit) lights.push({ x, y, r: Math.max(lr, burning ? 2.5 : 0, lit ? 3 : 0), c: burning || d.kind === 'fire' ? FIRE : lit ? STOVE : lr >= 9 ? BEACON : LAMP });
        if (ch === '白' || world.isBig(x, y) || (ch === '舟' && world.shipCells.has(U.key(x, y)))) continue;      // 大字地標、停著的船整體另畫
        const r = U.hash2(x, y, 99);
        let rot = ((r & 255) / 255 - 0.5) * 0.16, scale = (0.84 + ((r >>> 8) & 255) / 255 * 0.16) * d.vis[0];
        let dx = ((r >>> 16) & 255) / 255 * 4 - 2, dy = ((r >>> 24) & 255) / 255 * 4 - 2, alpha = d.vis[1];
        if (d.kind === 'water') dy += Math.sin(now * 1.6 + x * 0.9 + y * 1.3) * 1.8;
        if (d.kind === 'fire' || burning) { scale *= 1 + 0.1 * Math.sin(now * 15 + r); rot += Math.sin(now * 9 + (r & 31)) * 0.06; }
        if (ch === '明' || ch === '日') scale *= 1 + 0.04 * Math.sin(now * 3 + r);
        if (burning) alpha = 1;
        if (act && act.type === 'gather' && act.x === x && act.y === y) { const pr = act.t / act.dur; alpha *= 1 - pr * 0.85; scale *= 1 - pr * 0.35; rot += pr * 0.5; }
        const color = burning && d.kind !== 'fire' ? G.INK.red : (ch === '灶' && !lit ? G.INK.ash : (ch === '窗' || ch === '門') && world.wallHurt(x, y) ? G.INK.red : d.ink);   // 窗門撞剩一半：字變紅
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
        if (e.type === '龍') lights.push({ x: e.x, y: e.y, cx: e.rx + 0.5, cy: e.ry + 0.5, r: 3, c: DRAGON });
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

      // —— 霧障：一片片白霧順著風飄
      if (world.fogs.size || this.fogSeen.size) this.drawFog(g, ox, oy, x0, x1, y0, y1, dt, now);
      // —— 夜色與光：光照圖平滑放大蓋上去；光源再點一個亮芯
      const dark = g.darkness();
      this.rainA = (this.rainA || 0) + ((world.raining() ? 1 : 0) - (this.rainA || 0)) * Math.min(1, dt / 1.5);   // 起雨收雨各淡入淡出一息半
      const glowK = Math.max(dark, 0.55 * this.rainA);   // 下雨的白天，燈也透出一點微光（v0.31）
      if (g.torchLit()) lights.push({ x: p.x, y: p.y, cx: p.rx + 0.5, cy: p.ry + 0.5, r: 3, c: TORCH });
      const lm = dark > 0.02 || (glowK > 0.02 && lights.length) ? this.lightMap(g, ox, oy, x0, x1, y0, y1, lights, dark, glowK, now) : null;
      this.lastLm = lm;   // 測試看得到這一幀有沒有夜色、暖光
      if (lm) {
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';   // 雙線性就夠平滑；'high' 在軟體繪圖下很慢
        if (dark > 0.02) ctx.drawImage(this.lmDark, 0, 0, lm.cols, lm.rows, lm.x, lm.y, lm.w, lm.h);
        if (lm.glow) {
          const b = lm.gb; if (dark > 0.02) ctx.drawImage(this.lmGlow, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]);   // 白天下雨只在雨幕上透一層（見下）
          ctx.globalCompositeOperation = 'lighter';
          for (const l of lights) {
            const px = ox + (l.cx === undefined ? l.x + 0.5 : l.cx) * T, py = oy + (l.cy === undefined ? l.y + 0.5 : l.cy) * T;
            if (px < -T || py < -T || px > w + T || py > h + T) continue;
            const rad = T * (0.85 + 0.06 * Math.sin(now * 7 + l.x * 5 + l.y * 3)) * (l.r >= 9 ? 1.6 : 1);
            ctx.globalAlpha = Math.min(1, 0.3 * glowK); ctx.drawImage(this.bloom, px - rad, py - rad, rad * 2, rad * 2);
          }
        }
        ctx.restore();
      }
      // —— 雨：一層淡墨與斜斜的雨絲，跟著世界滾動；燈火照得到的雨絲染上暖色，燈光微微透過雨幕
      if (this.rainA > 0.02) {
        const pm = (a, m) => ((a % m) + m) % m;
        ctx.save(); ctx.globalAlpha = this.rainA;
        ctx.fillStyle = 'rgba(70,80,100,' + (0.12 + 0.06 * dark) + ')'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = dark > 0.5 ? 'rgba(210,220,240,0.6)' : 'rgba(40,50,75,0.6)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        const warm = [], lit = lm && lm.glow ? lm : null, lcols = lit ? lit.cols : 0, lrows = lit ? lit.rows : 0;
        ctx.beginPath();
        const n = Math.min(380, Math.floor(w * h / 3000)), span = h + 60, wide = w + 80, drift = now * 520;
        for (let i = 0; i < n; i++) {
          const r = U.hash2(i, 131, 7), len = 9 + (r & 15);
          const by = ((r >>> 16) & 4095) / 4096 * span, bx = ((r >>> 4) & 4095) / 4096 * wide;
          const yy = pm(by + drift * (0.85 + (r & 7) / 24) + oy * 0.5, span) - 30;
          const px = pm(bx - yy * 0.22 + ox * 0.5, wide) - 40;
          if (lit) { const li = Math.floor((px - lit.x) / lit.cell), lj = Math.floor((yy - lit.y) / lit.cell); if (li >= 0 && lj >= 0 && li < lcols && lj < lrows && lit.gre[lj * lcols + li] < 0.93) { warm.push(px, yy, len); continue; } }
          ctx.moveTo(px, yy); ctx.lineTo(px - len * 0.22, yy + len);
        }
        ctx.stroke();
        if (warm.length) {
          ctx.strokeStyle = 'rgba(255,206,128,' + (0.45 + 0.35 * glowK) + ')'; ctx.beginPath();
          for (let i = 0; i < warm.length; i += 3) { ctx.moveTo(warm[i], warm[i + 1]); ctx.lineTo(warm[i] - warm[i + 2] * 0.22, warm[i + 1] + warm[i + 2]); }
          ctx.stroke();
        }
        if (lit) { const b = lit.gb; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (dark > 0.02 ? 0.5 : 0.9) * this.rainA; ctx.imageSmoothingEnabled = true; ctx.drawImage(this.lmGlow, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]); }
        ctx.restore();
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
