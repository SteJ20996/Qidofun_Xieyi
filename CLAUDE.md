# 寫意 · 專案約定

由漢字構成的生存與探索沙盒：收集、製作、砌牆，第十夜起有鬼。純瀏覽器單頁，零依賴，全繁體。

## 語言
- 遊戲文案、程式註解、README、回覆一律繁體中文（台灣用語）。
- 字庫鍵值是字本身（鳥、魚、龍、門、燈……），改字時全專案一起改；筆畫數採台灣標準（艹算四畫）。

## 每次更新後必做
1. `python3 -m http.server 8123` 後跑 `NODE_PATH=$(npm root -g) node scripts/smoke.mjs`，全部 PASS、零報錯才算完成。
2. `python3 scripts/build-single.py` 產出 `dist/xieyi.html`，發佈到同一個 Artifact（網址見下），不要另開新的。
3. 回覆裡用這個格式附上入口，網址獨立成行、後面不接任何文字，這樣才會顯示成可點的卡片：

   **遊戲入口（點開即玩）：** https://claude.ai/artifact/AaW9h52xsssPP5beWgBErX

## 位置
- 分支 `claude/xieyi-open-world`，PR #1。
- 規則表：`src/glyphs.js`（`DB` 字庫與取物、`ITEMS` 物品與工具、`RECIPES` 配方、`PLACES` 地標、`STELES` 碑文）。
- 數值：`src/game.js` 頂部常數（`GHOST_NIGHT`、`FERMENT_NIGHTS`、`SLOTS`）與 `updateStats`。
