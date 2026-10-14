#!/usr/bin/env python3
"""把游戏打包成一个单文件 HTML（样式与脚本全部内联），便于发布为 claude.ai Artifact 或单文件分发。

    python3 scripts/build-single.py            # 输出 dist/xieyi.html（无 doctype/html/body 外壳，Artifact 发布时会自动包一层）
    python3 scripts/build-single.py --page     # 输出 dist/index.html（完整页面，可直接双击打开）
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
head = html[html.index('<head>') + 6: html.index('</head>')]
body = html[html.index('<body>') + 6: html.index('</body>')]

font_links = '\n'.join(l.strip() for l in head.splitlines() if 'fonts.g' in l)
body = re.sub(r'<script src="([^"]+)"></script>',
              lambda m: '<script>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '\n</script>', body)
fragment = ('<title>写意</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + font_links +
            '\n<style>\n' + css + '\n</style>\n' + body.strip() + '\n')

out_dir = root / 'dist'; out_dir.mkdir(exist_ok=True)
if '--page' in sys.argv:
    page = ('<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
            'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n'
            '</head>\n<body>\n' + fragment + '</body>\n</html>\n')
    (out_dir / 'index.html').write_text(page, encoding='utf-8'); print('wrote dist/index.html', len(page), 'bytes')
else:
    (out_dir / 'xieyi.html').write_text(fragment, encoding='utf-8'); print('wrote dist/xieyi.html', len(fragment), 'bytes')
