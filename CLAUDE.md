# 山海有形 · 專案約定

標題《山海有形》，起始頁第一行「字裡行間 · 一紙之島」，標語「寫木為舟 · 寫水成淵」。舊名「寫意」只留在內部識別名（存檔鍵 `xieyi.*`、`dist/xieyi.html`、`window.XIEYI`、分支名），不要改，改了舊存檔讀不到。

由漢字構成的生存與探索沙盒：收集、製作、砌牆；蛇蛛蟾豹狼、半友好可馴的鷹、少見的龜；第十三夜起怕光穿牆的魄；雨天雨夜會澆壞屋外的燈（屋裡不怕）；第二日起每日兩擲各 25% 起霧障，帶扇子可吹散，硬闖五樣數值各掉一成（不致命）；命飽暖力愜六條數值加膽氣；膽氣八重造船渡海，十重五件衣甲穿齊即山海衣，卅一重可鑄九閽鳴雷；山有煤鐵，鐵可打甲、鍛鋼具；鐵礦脈三十分之一出鎢礦，精煤煉鎢鋼，鎢鋼具與甲更強；錦囊擴囊；棉麻草織漁網，四小成中、四中或十三小成大；三種難度；死落荷包（膽氣減六成、耐久對折）；鼎煉丹加命上限；野果不分堆、每顆各記日數、先吃陳的。純瀏覽器單頁，零依賴，全繁體。

## 語言
- 遊戲文案、程式註解、README、回覆一律繁體中文（台灣用語）。
- 字庫鍵值是字本身（鳥、魚、龍、門、燈……），改字時全專案一起改；筆畫數採台灣標準（艹算四畫）。

## 每次更新後必做
1. `python3 -m http.server 8123` 後跑 `NODE_PATH=$(npm root -g) node scripts/smoke.mjs`，全部 PASS、零報錯才算完成；動到生成規則時另跑 `node scripts/gen-check.mjs 80`，八十座島都要通過。
2. 動到 `src/glyphs.js` 的規則表時跑 `node scripts/spec-tables.mjs`，重產 `docs/SPEC.md` 的資料表，並對照改寫規格書裡相關的段落。
3. `python3 scripts/build-single.py` 產出 `dist/xieyi.html`，發佈到同一個 Artifact（網址見下），不要另開新的。
4. 回覆裡用這個格式附上入口，網址獨立成行、後面不接任何文字，這樣才會顯示成可點的卡片：

   **遊戲入口（點開即玩）：** https://claude.ai/artifact/AaW9h52xsssPP5beWgBErX

## 位置
- 分支 `claude/xieyi-open-world`；PR #1 已在 v0.10 合併進 `main`（GitHub 首頁顯示的是 `main`）。之後的更新要再合進 `main`，首頁才看得到。
- 規則表：`src/glyphs.js`（`DB` 字庫與取物、`ITEMS` 物品與工具、`RECIPES` 配方、`PLACES` 地標、`STELES` 碑文）。
- 數值：`src/game.js` 頂部常數（`GHOST_NIGHT`=13、`FERMENT_NIGHTS`=15、`SLOTS`=16、`TOOL_SLOTS`=6、`SHIP_LEVEL`=8、`TOTEM_LEVEL`=10、`DECAY_LEVEL`=31、`LEVEL_UNIT`=20 與 `levelCost(n)`=round(20×(1+0.1n)²)、`ARMOR_LIFE`=180 日、`HIT_MULT`、`WEAR_CAP`=6、`REPAIR_WM`=1.5、`HAT_FUEL`=400、`BASE_SLOTS`=16／`BASE_TOOLS`=6／`MAX_POUCHES`=4、`DIFF` 難度表、`HAMMER_*`）與 `updateStats`；天氣在 `src/world.js` 頂部（`RAIN_MIN`=¼日、`RAIN_MAX`=1 日、`RAIN_GAP_MIN`=1 日、`RAIN_GAP_MAX`=4 日、`RAIN_LAMP_P`=1/1500 每盞每息、`ROOM_LIMIT`=121 格內圍得住才算屋裡，`covered()`／`rainLamps()`；霧障 `FOG_ROLLS`=2、`FOG_P`=0.25、`FOG_MIN`–`FOG_MAX`=8–12 格、`FOG_NEAR`=8–28 格、`FOG_LIFE`=1 日，`spawnFog()`）；霧障的代價與扇子在 `src/game.js`（`FOG_TOLL`=0.1、`FAN_REACH`=3、`checkFog()`／`fogToll()`）。煙霧測試開頭把 `world.fogP` 設 0，免得真隨機的霧在別的測試途中跳出彈窗。生靈的命在 `src/glyphs.js` 的 `DB`（鹿 30、龜 50、鷹 60、蛇蛛蟾 90、豹狼 160、虎 300、龍 500；敵對獸撲咬 1.6 秒、毒咬 2.67 秒一次，在 `src/entities.js` 的 `maul`／`bite`），工具傷害在 `ITEMS`（石刀 30、石劍 40、鎬鋤斧 15；鋼具 ×1.4、耐久 56；鎢鋼具再 ×1.5、耐久 112；九閽鳴雷 120）。
