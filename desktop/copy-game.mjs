// 把單檔遊戲 dist/xieyi.html 複製成殼要載的 app/index.html（先在專案根目錄跑 python3 scripts/build-single.py）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'dist', 'xieyi.html');
if (!fs.existsSync(src)) { console.error('找不到 dist/xieyi.html：先在專案根目錄跑 python3 scripts/build-single.py'); process.exit(1); }
fs.mkdirSync(path.join(here, 'app'), { recursive: true });
fs.copyFileSync(src, path.join(here, 'app', 'index.html'));
console.log('app/index.html ← dist/xieyi.html（' + fs.statSync(src).size + ' 位元組）');
