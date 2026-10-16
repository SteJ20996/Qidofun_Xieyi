// i18n.js —— 文字：繁體（預設）或簡體。程式、存檔、字庫的鍵一律是繁體；選了簡體時只在「顯示」那一層轉字：
// 頁面上的字（含之後遊戲寫上去的訊息、提示、面板）由 MutationObserver 一出現就轉，畫布上畫的字由 render.js 呼叫 I18N.t() 轉；
// 轉回繁體時，把記下的原字放回去。字表與詞表在 src/hans.js（scripts/gen-hans.py 由 OpenCC 產生）。選擇存在 localStorage xieyi.lang。
(function () {
  'use strict';
  const KEY = 'xieyi.lang';
  const D = window.HANS_DATA || { CH: '', PH: [] };
  const CH = new Map(); for (let i = 0; i + 1 < D.CH.length; i += 2) CH.set(D.CH[i], D.CH[i + 1]);
  const FIRST = new Map(); for (const kv of D.PH) { if (!FIRST.has(kv[0][0])) FIRST.set(kv[0][0], []); FIRST.get(kv[0][0]).push(kv); }   // 詞表已照長度由長到短排好
  const HAN = /[㐀-鿿豈-﫿]/;
  const cache = new Map();
  // 繁轉簡：每個位置先試最長的詞（乾坤、著名這類不逐字轉），沒有就逐字
  function toHans(s) {
    if (typeof s !== 'string' || !s || !HAN.test(s)) return s;
    const hit = cache.get(s); if (hit !== undefined) return hit;
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i], cands = FIRST.get(c);
      if (cands) { let m = null; for (const kv of cands) if (s.startsWith(kv[0], i)) { m = kv; break; } if (m) { out += m[1]; i += m[0].length; continue; } }
      out += CH.get(c) || c; i++;
    }
    if (cache.size > 5000) cache.clear();
    cache.set(s, out); return out;
  }
  // 頁面上的字：文字節點與幾個屬性；script、style、textarea 與標了 data-noconv 的（例如「繁體」這個選項本身）不轉
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  const SKIP = 'script, style, textarea, [data-noconv]';
  const memo = new WeakMap(), memoAttr = new WeakMap();
  const skipped = (el) => !el || (el.closest && !!el.closest(SKIP));
  function convText(n) {
    const v = n.nodeValue; if (!v || !HAN.test(v)) return;
    const m = memo.get(n); if (m && m.c === v) return;   // 已經是轉過的
    const c = toHans(v); memo.set(n, { o: v, c }); if (c !== v) n.nodeValue = c;
  }
  function convAttrs(el) {
    if (!el.getAttribute) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (!v || !HAN.test(v)) continue;
      let m = memoAttr.get(el); if (!m) memoAttr.set(el, (m = {}));
      if (m[a] && m[a].c === v) continue;
      const c = toHans(v); m[a] = { o: v, c }; if (c !== v) el.setAttribute(a, c);
    }
  }
  function walk(root, onText, onEl) {
    if (root.nodeType === 3) { if (!skipped(root.parentElement)) onText(root); return; }
    if (root.nodeType !== 1 || skipped(root)) return;
    onEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) onText(n); else onEl(n); }
  }
  const convTree = (root) => walk(root, convText, convAttrs);
  function restoreTree(root) {
    walk(root, (n) => { const m = memo.get(n); if (m && n.nodeValue === m.c) n.nodeValue = m.o; memo.delete(n); },
      (el) => { const m = memoAttr.get(el); if (!m) return; for (const a in m) if (el.getAttribute(a) === m[a].c) el.setAttribute(a, m[a].o); memoAttr.delete(el); });
  }
  let scFont = false;
  function loadScFont() {   // 霞鶩文楷 TC 已經有絕大多數簡體字；缺的幾個（抡、阍）落到思源宋體 SC，要用時才載
    if (scFont) return; scFont = true;
    try { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap'; document.head.appendChild(l); } catch (e) { /* ignore */ }
  }

  const I18N = {
    hans: false, listeners: [],
    t(s) { return this.hans ? toHans(s) : s; },   // 給畫布用：簡體時轉，繁體原樣
    toHans,
    lang() { return this.hans ? 'hans' : 'hant'; },
    set(lang) {
      const h = lang === 'hans';
      try { localStorage.setItem(KEY, h ? 'hans' : 'hant'); } catch (e) { /* ignore */ }
      if (h !== this.hans) { this.hans = h; this.apply(); } else this.sync();
    },
    toggle() { this.set(this.hans ? 'hant' : 'hans'); },
    apply() {
      const html = document.documentElement;
      html.classList.toggle('hans', this.hans); html.lang = this.hans ? 'zh-CN' : 'zh-TW';
      if (this.hans) { loadScFont(); convTree(html); } else restoreTree(html);
      this.sync();
      for (const f of this.listeners) { try { f(this.hans); } catch (e) { /* ignore */ } }
    },
    on(f) { this.listeners.push(f); },
    sync() {   // 選項的樣子：起始頁的兩顆亮哪顆、暫停面板那顆寫要切去的那一種
      document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', (b.dataset.lang === 'hans') === this.hans));
      const p = document.getElementById('pause-lang'); if (p) p.textContent = this.hans ? '繁體中文' : '简体中文';
    },
  };
  window.I18N = I18N;
  const obs = new MutationObserver((list) => {
    if (!I18N.hans) return;
    for (const r of list) {
      if (r.type === 'characterData') { if (!skipped(r.target.parentElement)) convText(r.target); }
      else if (r.type === 'childList') r.addedNodes.forEach(convTree);
      else if (r.type === 'attributes' && !skipped(r.target)) convAttrs(r.target);
    }
  });
  obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-lang], #pause-lang'); if (!b) return;
    if (b.id === 'pause-lang') I18N.toggle(); else I18N.set(b.dataset.lang);
  });
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (saved === 'hans') { I18N.hans = true; I18N.apply(); } else I18N.sync();
})();
