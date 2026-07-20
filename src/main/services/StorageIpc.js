const { ipcMain } = require('electron');
const StoreManager = require('./StoreManager');
const AutoLaunchService = require('./AutoLaunchService');
const { LOCALE_KEY, BREAK_REMINDER_STORE_KEY, POMODORO_LAST_MINUTES_KEY } = require('../constants');

// 允许存储的合法 Key 列表 (安全白名单)
const ALLOWED_STORE_KEYS = [
  'autoLaunch',
  'petState',
  LOCALE_KEY,
  BREAK_REMINDER_STORE_KEY,
  POMODORO_LAST_MINUTES_KEY,
];

function init() {
  ipcMain.handle('save-data', async (_event, key, value) => {
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

  ipcMain.handle('load-data', async (_event, key) => {
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

  ipcMain.handle('set-auto-launch', async (_event, enabled) => {
    return AutoLaunchService.setAutoLaunchPreference(enabled);
  });

  ipcMain.handle('get-auto-launch', async () => {
    return AutoLaunchService.getAutoLaunchPreference();
  });
}

module.exports = {
  init,
  ALLOWED_STORE_KEYS,
};
