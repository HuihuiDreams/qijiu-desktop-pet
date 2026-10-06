const { ipcMain } = require('electron');
const StoreManager = require('./StoreManager');
const AutoLaunchService = require('./AutoLaunchService');
const { LOCALE_KEY, BREAK_REMINDER_STORE_KEY, POMODORO_LAST_MINUTES_KEY } = require('../constants');
const { isSenderMainWindow } = require('./IpcSenderAuthorization');

// 允许渲染进程通过 save-data/load-data IPC 存取的合法 Key 列表 (安全白名单)。
// 注意：screensaverSettings (SCREENSAVER_STORE_KEY) 与 weatherSyncSettings 由主进程控制器
// (ScreensaverController / WeatherSyncController) 独占托管并通过 StoreManager 直接操作，
// 遵循最小权限原则，故意不对渲染进程暴露直接读写能力，切勿在此随意添加。
const ALLOWED_STORE_KEYS = [
  'autoLaunch',
  'petState',
  LOCALE_KEY,
  BREAK_REMINDER_STORE_KEY,
  POMODORO_LAST_MINUTES_KEY,
];

function init({ windowManager }) {
  ipcMain.handle('save-data', async (event, key, value) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return false;
    if (!ALLOWED_STORE_KEYS.includes(key)) {
      console.warn(`[Security] 拦截到非法的数据保存请求: ${key}`);
      return false;
    }
    try {
      await StoreManager.initStore();
      const store = StoreManager.getStore();
      if (!store) return false;
      store.set(key, value);
      return true;
    } catch (error) {
      console.error('Save failed:', error);
      return false;
    }
  });

  ipcMain.handle('load-data', async (event, key) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return null;
    if (!ALLOWED_STORE_KEYS.includes(key)) {
      console.warn(`[Security] 拦截到非法的数据读取请求: ${key}`);
      return null;
    }
    try {
      await StoreManager.initStore();
      const store = StoreManager.getStore();
      return store ? store.get(key) : null;
    } catch (error) {
      console.error('Load failed:', error);
      return null;
    }
  });

  ipcMain.handle('set-auto-launch', async (event, enabled) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) {
      return { success: false, preference: false, loginItem: { openAtLogin: false } };
    }
    return AutoLaunchService.setAutoLaunchPreference(enabled);
  });

  ipcMain.handle('get-auto-launch', async (event) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) {
      return { success: false, preference: false, loginItem: { openAtLogin: false } };
    }
    return AutoLaunchService.getAutoLaunchPreference();
  });
}

module.exports = {
  init,
  ALLOWED_STORE_KEYS,
};
