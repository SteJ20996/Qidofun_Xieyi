# 《山海有形》桌面版（Electron）

把單檔遊戲 `dist/xieyi.html` 用 Electron 包成可以直接執行的程式，為上 Steam 做準備。遊戲本身一行沒改，殼只負責開視窗；手柄照樣走瀏覽器的 Gamepad API，跟 Chrome 一模一樣。

## 下載試玩（Windows）

1. 到 GitHub 專案頁的 **Actions** → 左邊選「桌面版（Electron）」→ 點最上面那次執行（綠色勾）。
2. 頁面最下面的 **Artifacts** 有 `ShanHaiYouXing-win32-x64`，下載下來是一個 zip（約一百多 MB）。要登入 GitHub 才看得到；檔案保留三十天，過期了到同一頁按「Run workflow」重打一份。
3. 解壓縮，執行裡面的 `ShanHaiYouXing.exe`。程式沒有簽章，Windows 會跳「Windows 已保護您的電腦」：按「其他資訊」→「仍要執行」。

Linux 版（`ShanHaiYouXing-linux-x64`）同一頁下載。

- **F11** 切換全螢幕；從 Steam Deck 開（Steam 會設 `SteamDeck=1`）或帶 `--fullscreen` 啟動就直接全螢幕。
- **存檔**在 `%APPDATA%\xieyi-shanhai`（Linux：`~/.config/xieyi-shanhai`）。跟瀏覽器版的存檔是分開的兩份。
- 同時只能開一個視窗，免得兩個視窗互相蓋存檔。

## 用 Steam 測手柄（不用先付上架費）

Steam 會把各種手柄模擬成 Xbox 手柄交給從 Steam 啟動的程式（Steam Input）。第三方手柄在瀏覽器裡對不上的問題，很可能在這裡就消失了。這一點還沒在真機上驗證過，所以要測：

1. Steam 左下角「新增遊戲」→「新增非 Steam 遊戲」→「瀏覽」→ 選 `ShanHaiYouXing.exe` → 加入。
2. 收藏庫裡對它按右鍵 →「內容」→「控制器」→ 把「覆寫 Steam 輸入」設成「啟用 Steam 輸入」。
3. **從 Steam 裡**按「開始」（直接點 exe 開不會經過 Steam Input）。
4. 按一下手柄任一鍵，到起始頁的「手柄設定」：
   - 上面一行寫「手柄：Xbox 360 Controller（標準對應…）」之類，就是 Steam 接手了。
   - 推左搖桿，看下面的條狀讀數有沒有在動，再進遊戲走走看。
5. 把結果（第 4 步那一行字、條有沒有動、走得動嗎）告訴我。

## 自己打包（開發用）

```bash
python3 scripts/build-single.py      # 在專案根目錄先產出 dist/xieyi.html
cd desktop
npm ci                               # 裝 Electron 與打包工具（只在打包時需要，遊戲本身零依賴）
npm start                            # 開發版：直接開視窗
npm run pack:win                     # 打包 Windows 版到 out/（在 Linux／mac 上打 Windows 版要裝 wine，交給 GitHub Actions 比較省事）
npm run pack:linux                   # 打包 Linux 版
node smoke.mjs                       # 冒煙測試：開起來、開新島、存檔、關掉重開存檔還在；Linux 沒螢幕用 xvfb-run -a
XIEYI_EXE=out/ShanHaiYouXing-linux-x64/ShanHaiYouXing node smoke.mjs   # 測打包好的執行檔
```

每次合進 `main`、動到遊戲或殼時，GitHub Actions（`.github/workflows/desktop.yml`）會自動打包 Windows 與 Linux 版，各跑兩次冒煙測試（開發版、打包好的執行檔）。

## 上 Steam 之前還缺的

- **字型**：現在從 Google Fonts 線上載，離線時會退回系統字型。上架版要把霞鶩文楷 TC、思源宋體打包進去（都是 SIL OFL 授權，可以商用，要附授權檔）。
- **圖示**與 Windows 的檔案資訊（版本、公司名）。
- **簽章**：不簽也能上 Steam，但直接下載 exe 會被 SmartScreen 擋一下。
- **Steamworks**（成就、雲端存檔、Steam 介面）：要的話用 steamworks.js 接；Electron 裡的 Steam 介面有已知的問題，要實測。
- **離開遊戲**的鈕：現在要關視窗；Steam Deck 上用 Steam 鍵 →「結束遊戲」。
- **mac 版**：要簽章與公證才開得順，先不做。
