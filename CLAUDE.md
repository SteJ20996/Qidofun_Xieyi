# 山海有形 · 專案約定

標題《山海有形》，起始頁第一行「字裡行間 · 一紙之島」，標語「寫木為舟 · 寫水成淵」。**本作屬於「寫意」遊戲系列，是系列第一部**；「寫意」是系列名，不是本作的名字，之後可能再出「寫意」系列的其他遊戲。內部識別名以系列名為準（存檔鍵 `xieyi.*`、`dist/xieyi.html`、`window.XIEYI`、分支名），不要改，改了舊存檔讀不到。存檔三格：第一格沿用舊鍵 `xieyi.save.v5`，第二、三格是 `xieyi.save.v5.2`、`.3`；`xieyi.slot` 記上次玩的格、`xieyi.carry` 是渡海帶走的膽氣（`值@格`）。

由漢字構成的生存與探索沙盒：收集、製作、砌牆；蛇蛛蟾豹狼、半友好可馴的鷹、少見的龜；第十三夜起怕光穿牆的魄；雨天雨夜會澆壞屋外的燈（屋裡不怕）；第二日起每日兩擲各 25% 起霧障，帶扇子可吹散，硬闖五樣數值各掉一成（不致命）；島半徑 85、海到 113（v0.11 面積加倍）；殺虎豹狼偶得首骨，放船頭鎮船（孤帆兩個、方舟五個，各鎮各的、到期風化）；船分孤帆（一乘二、命 120）與方舟（二乘三、命 420、鎢鋼二、船快六成），修船回四分之一、第 n 次要 n 塊木板；海上的蜃會撞船、吐海霧，船毀了六十息內游上岸否則溺死；不滿卅一重出海先問（敬勇者之無畏，建議帶神兵）；沒解決的蜃讀檔散掉、膽氣減五重；命飽暖力愜六條數值加膽氣；膽氣八重造船渡海，十六重五件衣甲穿齊、其中至少一件鎢鋼護具即山海衣，卅一重可鑄九閽鳴雷（陸上）與燭龍焚溟（海上，海中之物全傷、陸上天上減半）；山有煤鐵，鐵可打甲、鍛鋼具；鐵礦脈三十分之一出鎢礦，精煤煉鎢鋼，鎢鋼具與甲更強；錦囊擴囊；棉麻草織漁網，四小成中、四中或十三小成大；三種難度；死落荷包（膽氣減六成、耐久對折）；鼎煉丹加命上限；野果不分堆、每顆各記日數、先吃陳的；起始頁三格存檔，每格寫島號、難度、第幾日第幾夜、膽氣第幾重、死過幾次、睡過幾夜、存檔時刻，覆蓋與刪都要按兩次；殺龜愜意減三十；霧障會動（六息一格、十格內有光就躲、沒光亂飄）；牆與門圍起的小屋不生生靈、除玩家外誰也進不去，多小才算看難度（獸／魄：簡單 28／18、一般 18／8、困難 10／擋不住）；廿二重起膽氣只從斃敵對生靈得來，斃敵白日八成、夜裡加半成；五條數值不到五成外框每兩秒閃一下黃、不到四分之一每秒閃一下紅並彈窗一次（困難只閃）；櫃連東西一起拆、重放東西還在；面向灶按 F 開灶的界面；神兵在製作欄單獨成類；拆人造的東西（磚門床燈灶鼎櫃橋魚梁漁網稻草人）先跳「拆下？」問一聲（`askTake`／`takeOk`）；烤肉補命 +10、烤蛇 +8；錦囊用滿四個製作欄標已用完；重磨同一把石子 1、2、4、8 上限八（`REGRIND_CAP`、工具上的 `rg`）；舊布衣當柴一件 120 息（`CLOTH_FUEL`）、舊鐵甲鋼具在旺灶熔回鐵、鎢鋼件熔回鎢鋼（`meltYield`／`stoveMelt`）；手柄（`src/pad.js`，Nintendo 布局對應成鍵盤事件、面板裡移焦點、對應精靈，自訂對應存 `xieyi.pad`；十字鍵是帽子軸、扳機是軸、搖桿閒置不在零都認得；連上時按鍵列換成手柄的；暫停面板有回到主頁、手柄對應、校正中點、對調搖桿、反向、錄八秒讀數，起始頁也有手柄對應；幅度很小的搖桿按住一秒多就收並記幅度）。純瀏覽器單頁，零依賴，全繁體。

## 語言
- 遊戲文案、程式註解、README、回覆一律繁體中文（台灣用語）。
- 字庫鍵值是字本身（鳥、魚、龍、門、燈……），改字時全專案一起改；筆畫數採台灣標準（艹算四畫）。

## 每次更新後必做
1. `python3 -m http.server 8123` 後跑 `NODE_PATH=$(npm root -g) node scripts/smoke.mjs`，全部 PASS、零報錯才算完成；動到生成規則時另跑 `node scripts/gen-check.mjs 80`，八十座島都要通過。
2. 動到 `src/glyphs.js` 的規則表時跑 `node scripts/spec-tables.mjs`，重產 `docs/SPEC.md` 的資料表，並對照改寫規格書裡相關的段落。
3. `python3 scripts/build-single.py` 產出 `dist/xieyi.html`，發佈到同一個 Artifact（網址見下），不要另開新的。
4. 回覆裡用這個格式附上入口，網址獨立成行、後面不接任何文字，這樣才會顯示成可點的卡片：

   **遊戲入口（點開即玩）：** https://claude.ai/artifact/AaW9h52xsssPP5beWgBErX

5. 提交、推到分支 `claude/xieyi-open-world`，然後**直接合進 `main`**（開 PR、合併，不用等人審）。GitHub 首頁顯示的是 `main`，沒合進去首頁就看不到。

## 位置
- 分支 `claude/xieyi-open-world`；每次更新都合進 `main`（PR #1 在 v0.10、PR #2 在 v0.12.1 合併）。
- 規則表：`src/glyphs.js`（`DB` 字庫與取物、`ITEMS` 物品與工具、`RECIPES` 配方、`PLACES` 地標、`STELES` 碑文）。
- 手柄：`src/pad.js`（`ACTIONS` 鍵對應表、`PANELS` 面板順序、`STEPS` 精靈步驟；`window.PAD`）。煙霧測試灌假的 `navigator.getGamepads`；真手柄接不到這裡，鍵號靠使用者走精靈。
- 存檔：`src/game.js` 的 `SAVE_SLOTS`=3、`Game.slotKey(n)`／`readSave(n)`／`clearSave(n)`、存檔裡的 `brief`（日、夜、膽氣重數、死過幾次、睡過幾夜）與 `Game.summary(save)`（起始頁的格子文案，舊存檔沒有 brief 就從時間與膽氣算）；起始頁的格子在 `boot()` 的 `renderSaves()`。
- 數值：一天 `DAY`=300 秒（`src/game.js` 與 `src/world.js` 各一份，要一致；v0.17 從 240 加長）。`src/game.js` 頂部常數（`GHOST_NIGHT`=13、`FERMENT_NIGHTS`=15、`SLOTS`=16、`TOOL_SLOTS`=6、`SHIP_LEVEL`=8、`TOTEM_LEVEL`=16（山海衣另要 `wornTung()` 真）、`DECAY_LEVEL`=31、`LEVEL_UNIT`=20 與 `levelCost(n)`=round(20×(1+0.1n)²)、`ARMOR_LIFE`=180 日、`HIT_MULT`、`WEAR_CAP`=6、`REPAIR_WM`=1.5、`HAT_FUEL`=400、`BASE_SLOTS`=16／`BASE_TOOLS`=6／`MAX_POUCHES`=4、`DIFF` 難度表、`HAMMER_*`）與 `updateStats`；天氣在 `src/world.js` 頂部（`RAIN_MIN`=¼日、`RAIN_MAX`=1 日、`RAIN_GAP_MIN`=1 日、`RAIN_GAP_MAX`=4 日、`RAIN_LAMP_P`=1/1500 每盞每息、`ROOM_LIMIT`=121 格內圍得住才算屋裡，`covered()`／`rainLamps()`；霧障 `FOG_ROLLS`=2、`FOG_P`=0.25、`FOG_MIN`–`FOG_MAX`=8–12 格、`FOG_NEAR`=8–28 格、`FOG_LIFE`=1 日，`spawnFog()`）；霧障的代價與扇子在 `src/game.js`（`FOG_TOLL`=0.1、`FAN_REACH`=3、`checkFog()`／`fogToll()`）。島的大小在 `src/glyphs.js`（`ISLAND_R`=85、`SEA_EDGE`=113）。船在 `src/glyphs.js` 的 `SHIPS`（孤帆 1×2 命 120 兩格、方舟 2×3 命 420 五格，`off` 是船身相對人的格子）；海在 `src/game.js`（`SHIP_REPAIR_FRAC`=0.25、`SWIM_TIME`=60、`SWIM_DRAIN`=2、`SWIM_DMG`=0.75、`GOD_SELF`=0.1、`SEA_WARN_LEVEL`=31、`SEA_PENALTY`=5、`SKULL_P`=0.35、`SKULL_TWO`=0.3、`SEA_FOLK`）與 `src/world.js`（海霧 6–10 格九十息；停著的船 `ships`／`shipCells`／`addShip`／`removeShip`）；蜃的出現機率是 `ents.seaP`=1/160（每一點五息，只在行船或落水時），煙霧測試開頭同樣設 0。煙霧測試開頭把 `world.fogP` 設 0，免得真隨機的霧在別的測試途中跳出彈窗；同樣把 `game.warnEnabled` 設 false、`world.fogStep` 設 1e9（數值提醒的彈窗、霧障的挪動），各自的測試再開。小屋 `MAX_ROOM`=28、`roomSize()`／`sheltered(x, y, type)`（門檻由 `DIFF.*.room`／`ghostRoom` 經 `world.roomLimitFor` 給）、霧障挪動 `FOG_STEP`=6 息／`FOG_LIGHT_R`=10 與 `moveFog()`／`nearestLight()` 在 `src/world.js`；殺龜 `TURTLE_SAN`=30、膽氣 `KILL_ONLY_LEVEL`=22／`KILL_DAY`=0.8／`KILL_NIGHT`=1.05 與 `addCourage(n, src)`、數值閃 `WARN_LIGHT`=0.5／`WARN_POP`=0.25 與 `checkWarn()`（外框閃在 `style.css` 的 `warn-flash`／`low-flash`）、`DIFF.*.warn`、櫃的 `store`（拆下的櫃把東西記在囊裡那格上）、灶的界面 `openStove()`／`stoveFuel()`／`stoveCook()`／`buildStove()` 在 `src/game.js`；神兵類在 `src/glyphs.js` 的 `CRAFT_CATS`／`CAT_OF`。生靈的命在 `src/glyphs.js` 的 `DB`（鹿 30、龜 50、鷹 60、蛇蛛蟾 90、豹狼 160、虎 300、龍 500、蜃 900；敵對獸撲咬 1.6 秒、毒咬 2.67 秒一次，在 `src/entities.js` 的 `maul`／`bite`），工具傷害在 `ITEMS`（石刀 30、石劍 40、鎬鋤斧 15；鋼具 ×1.4、耐久 56；鎢鋼具再 ×1.5、耐久 112；九閽鳴雷與燭龍焚溟 120、耐久 199）。
