const { app } = require('electron');
const { getStore } = require('./StoreManager');

const AUTO_LAUNCH_KEY = 'autoLaunch';
const DEFAULT_AUTO_LAUNCH = true;
const LOGIN_ITEM_NAME = '七九爱宠';

let autoLaunchEnabled = false;

function getStoredAutoLaunchPreference() {
  const store = getStore();
  if (!store) return DEFAULT_AUTO_LAUNCH;
  const value = store.get(AUTO_LAUNCH_KEY);
  return typeof value === 'boolean' ? value : DEFAULT_AUTO_LAUNCH;
}

function getLoginItemStatus() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return { openAtLogin: false };
  if (!app.isPackaged) {
    return { openAtLogin: false, executableWillLaunchAtLogin: false, launchItems: [] };
  }
  try {
    if (process.platform === 'darwin') {
      return app.getLoginItemSettings();
    }
    return app.getLoginItemSettings({
      path: process.execPath,
      args: [],
    });
  } catch (error) {
    console.error('Failed to read login item settings:', error);
    return { openAtLogin: false };
  }
}

function applyAutoLaunchSetting(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return getLoginItemStatus();
  if (!app.isPackaged) return getLoginItemStatus();
  try {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,   // 开机后以后台方式启动，不弹到前台
      });
    } else {
      const settings = {
        openAtLogin: enabled,
        path: process.execPath,
        args: [],
        name: LOGIN_ITEM_NAME,
      };
      app.setLoginItemSettings(settings);
    }
  } catch (error) {
    console.error('Failed to update login item settings:', error);
  }
  return getLoginItemStatus();
}

async function syncAutoLaunchPreference() {
  const store = getStore();
  if (!store) return { preference: DEFAULT_AUTO_LAUNCH, loginItem: getLoginItemStatus() };

  let preference = store.get(AUTO_LAUNCH_KEY);
  if (typeof preference !== 'boolean') {
    preference = DEFAULT_AUTO_LAUNCH;
    store.set(AUTO_LAUNCH_KEY, preference);
  }

  const loginItem = applyAutoLaunchSetting(preference);
  autoLaunchEnabled = preference;
  return { preference, loginItem };
}

async function setAutoLaunchPreference(enabled) {
  const store = getStore();
  if (!store) return { success: false, preference: DEFAULT_AUTO_LAUNCH, loginItem: getLoginItemStatus() };

  const preference = Boolean(enabled);
  store.set(AUTO_LAUNCH_KEY, preference);
  autoLaunchEnabled = preference;
  const loginItem = applyAutoLaunchSetting(preference);

  return { success: true, preference, loginItem };
}

async function getAutoLaunchPreference() {
  const store = getStore();
  return {
    success: Boolean(store),
    preference: getStoredAutoLaunchPreference(),
    loginItem: getLoginItemStatus(),
  };
}

function isAutoLaunchEnabled() {
  return autoLaunchEnabled;
}

module.exports = {
  AUTO_LAUNCH_KEY,
  DEFAULT_AUTO_LAUNCH,
  getStoredAutoLaunchPreference,
  getLoginItemStatus,
  applyAutoLaunchSetting,
  syncAutoLaunchPreference,
  setAutoLaunchPreference,
  getAutoLaunchPreference,
  isAutoLaunchEnabled,
};
