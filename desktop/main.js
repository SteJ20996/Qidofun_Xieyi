// 《山海有形》桌面版：Electron 的殼。遊戲本身就是 app/index.html（由 dist/xieyi.html 複製過來），殼只管開視窗。
// 手柄照樣走瀏覽器的 Gamepad API（跟 Chrome 一樣）；從 Steam 啟動時，Steam Input 會把各種手柄模擬成 Xbox 手柄交給這個程式。
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// 存檔在 localStorage，跟著 userData 走：固定成 ASCII 的資料夾名，以後改產品名也讀得到舊存檔（同 xieyi.* 鍵名不改的道理）
app.setPath('userData', process.env.XIEYI_USERDATA || path.join(app.getPath('appData'), 'xieyi-shanhai'));   // XIEYI_USERDATA：測試用的另一個資料夾

// 同時只開一個：兩個視窗共用一份 localStorage 會互相蓋存檔
if (!app.requestSingleInstanceLock()) app.quit();

// Steam Deck（Steam 會設 SteamDeck=1）或帶 --fullscreen 啟動就全螢幕；F11 隨時切換
const wantFull = process.argv.includes('--fullscreen') || process.env.SteamDeck === '1';
let win = null;

function create() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#efe5cf', title: '山海有形', show: false, fullscreen: wantFull, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (ev, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); ev.preventDefault(); }
  });
  // 頁裡的外部連結交給系統瀏覽器，不在遊戲視窗裡開
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('file:')) { ev.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
