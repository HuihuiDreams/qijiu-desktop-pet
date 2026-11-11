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

function isLoginItemEnabled(loginItem) {
  if (!loginItem) return false;
  if (process.platform === 'win32') {
    // openAtLogin only proves the Run key exists; Task Manager can disable it separately.
    return Boolean(loginItem.executableWillLaunchAtLogin);
  }
  if (process.platform === 'darwin' && loginItem.status) {
    return loginItem.status === 'enabled';
  }
  return Boolean(loginItem.openAtLogin);
}

function applyAutoLaunchSetting(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return getLoginItemStatus();
  if (!app.isPackaged) return getLoginItemStatus();
  try {
    if (process.platform === 'darwin') {
      // macOS 13+ (Ventura+) 与 Electron 44+ 采用 SMAppService 架构，openAsHidden 参数已被官方移除废弃
      app.setLoginItemSettings({
        openAtLogin: enabled,
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
  const isPlatformSupported = process.platform === 'win32' || process.platform === 'darwin';
  if (app.isPackaged && isPlatformSupported) {
    autoLaunchEnabled = isLoginItemEnabled(loginItem);
  } else {
    autoLaunchEnabled = preference;
  }
  return { preference, loginItem };
}

async function setAutoLaunchPreference(enabled) {
  const store = getStore();
  if (!store) return { success: false, preference: DEFAULT_AUTO_LAUNCH, loginItem: getLoginItemStatus() };

  const preference = Boolean(enabled);
  const previousPreference = autoLaunchEnabled;
  const loginItem = applyAutoLaunchSetting(preference);

  const isPlatformSupported = process.platform === 'win32' || process.platform === 'darwin';
  const effectiveSuccess = !app.isPackaged || !isPlatformSupported || isLoginItemEnabled(loginItem) === preference;

  if (effectiveSuccess) {
    store.set(AUTO_LAUNCH_KEY, preference);
    autoLaunchEnabled = preference;
    return { success: true, preference, loginItem };
  }

  autoLaunchEnabled = previousPreference;
  return { success: false, preference: previousPreference, loginItem };
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
