const { app, ipcMain } = require('electron');
const { LOCALE_KEY } = require('../constants');
const StoreManager = require('./StoreManager');

let deps = {};
let currentLocale = 'zh'; // 当前语言（zh / en / ja），启动时从 store 加载或自动检测

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('get-locale', () => currentLocale);
  ipcMain.handle('set-locale', async (_event, lang) => {
    const { windowManager, skinSelectorWindowModule, trayManager } = deps;
    if (!['zh', 'en', 'ja'].includes(lang)) return { success: false };
    currentLocale = lang;
    await StoreManager.initStore();
    const store = StoreManager.getStore();
    if (store) store.set(LOCALE_KEY, lang);
    trayManager.refreshTrayMenu();
    if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('locale-changed', lang);
    if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {
      windowManager.statusWindow.webContents.send('locale-changed', lang);
    }
    if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
      windowManager.pomodoroWindow.webContents.send('locale-changed', lang);
    }
    if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) {
      windowManager.citySettingWindow.webContents.send('locale-changed', lang);
    }
    if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
      windowManager.skinSelectorWindow.webContents.send('locale-changed', lang);
      skinSelectorWindowModule.sendSkinSelectorData({ resetSelection: false });
    }
    return { success: true, locale: lang };
  });
}

/**
 * 根据 app.getLocale() 的返回值推断语言代码。
 * 规则：zh-Hans-* / zh-CN → 'zh'；zh-Hant-* / zh-TW / zh-HK → 'zh'；ja-* → 'ja'；其余 → 'en'
 * @returns {'zh'|'en'|'ja'}
 */
function detectLocale() {
  const raw = (app.getLocale() || '').toLowerCase();
  if (raw.startsWith('zh')) return 'zh';
  if (raw.startsWith('ja')) return 'ja';
  return 'en';
}

/**
 * 启动时从 store 加载持久化语言设置，若无则自动检测。要求调用方已 await 过
 * StoreManager.initStore()（AppLifecycle 的 whenReady 引导流程已保证这一点）。
 * @returns {'zh'|'en'|'ja'}
 */
function loadInitialLocale() {
  const store = StoreManager.getStore();
  const storedLocale = store ? store.get(LOCALE_KEY) : null;
  currentLocale = ['zh', 'en', 'ja'].includes(storedLocale) ? storedLocale : detectLocale();
  return currentLocale;
}

module.exports = {
  init,
  detectLocale,
  loadInitialLocale,
  getCurrentLocale: () => currentLocale,
  setCurrentLocale: (val) => { currentLocale = val; },
};
