#!/usr/bin/env python3
"""產生 src/hans.js：繁轉簡的字表與詞表（台灣用字 → 簡體），給遊戲在「簡體中文」時轉字用。

    pip install opencc-python-reimplemented   # 只有產表時要，遊戲本身零依賴
    python3 scripts/gen-hans.py               # 寫出 src/hans.js，並拿遊戲裡每一行文字跟 OpenCC tw2s 整句轉換比對

字表：OpenCC 的 TSCharacters 與 TWVariantsRev（台灣異體先轉成 OpenCC 的繁體再轉簡），一字一對，取第一個候選。
詞表：只收「整詞轉換跟逐字轉換不一樣」的詞（例如 乾坤 不轉成 干坤、著名 不轉成 着名），繁體寫法與台灣寫法都收。
"""
import json, pathlib, re, sys
import opencc

root = pathlib.Path(__file__).resolve().parent.parent
d = pathlib.Path(opencc.__file__).parent / 'dictionary'
tw2s, t2tw = opencc.OpenCC('tw2s'), opencc.OpenCC('t2tw')

def keys(name):
    out = []
    for line in open(d / name, encoding='utf-8'):
        line = line.rstrip('\n')
        if line and '\t' in line: out.append(line.split('\t')[0])
    return out

chars = {}
for k in keys('TSCharacters.txt') + keys('TWVariantsRev.txt') + keys('TWVariants.txt'):
    if len(k) != 1: continue
    s = tw2s.convert(k)
    if len(s) == 1 and s != k and ord(k) < 0x10000 and ord(s) < 0x10000: chars[k] = s   # 只收常用平面的字：JavaScript 兩兩讀字表時，擴展 B 區的字佔兩個單位會讓後面整串錯位
def charwise(t): return ''.join(chars.get(c, c) for c in t)
phrases = {}
for k in keys('TSPhrases.txt') + keys('TWVariantsRevPhrases.txt'):
    for form in {k, t2tw.convert(k)}:
        s = tw2s.convert(form)
        if s != charwise(form) and len(s) == len(form) and all(ord(c) < 0x10000 for c in form + s): phrases[form] = s
# 執行期的轉法（與 src/hans.js 一致）：每個位置先試最長的詞，沒有就逐字
first = {}
for k in sorted(phrases, key=len, reverse=True): first.setdefault(k[0], []).append(k)
def conv(t):
    out, i = [], 0
    while i < len(t):
        c = t[i]; hit = None
        for k in first.get(c, ()):
            if t.startswith(k, i): hit = k; break
        if hit: out.append(phrases[hit]); i += len(hit)
        else: out.append(chars.get(c, c)); i += 1
    return ''.join(out)

ch = ''.join(k + v for k, v in sorted(chars.items()))
ph = [[k, v] for k, v in sorted(phrases.items(), key=lambda kv: (-len(kv[0]), kv[0]))]
js = ('// hans.js —— 繁轉簡的字表與詞表（scripts/gen-hans.py 由 OpenCC 產生，不要手改）。CH：繁簡兩兩相接；PH：整詞跟逐字轉法不同的詞\n'
      '(function () {\n  \'use strict\';\n  window.HANS_DATA = { CH: ' + json.dumps(ch, ensure_ascii=False) + ',\n    PH: ' + json.dumps(ph, ensure_ascii=False, separators=(',', ':')) + ' };\n})();\n')
(root / 'src' / 'hans.js').write_text(js, encoding='utf-8')

# 拿遊戲裡每一行文字比對
bad = 0; lines = 0
for p in ['index.html', 'src/game.js', 'src/glyphs.js', 'src/world.js', 'src/entities.js', 'src/render.js', 'src/pad.js']:
    for line in (root / p).read_text(encoding='utf-8').splitlines():
        if not re.search(r'[㐀-鿿]', line): continue
        lines += 1
        a, b = conv(line), tw2s.convert(line)
        if a != b:
            bad += 1
            if bad <= 8:
                diff = [(x, y) for x, y in zip(a, b) if x != y]
                print('差異', p, diff[:5])
print('wrote src/hans.js', len(js.encode('utf-8')), 'bytes;', len(chars), 'chars,', len(phrases), 'phrases;', lines, 'lines checked,', bad, 'differ from OpenCC tw2s')
sys.exit(1 if bad else 0)
