const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

const CITY_SETTING_ALWAYS_ON_TOP_LEVEL = 'screen-saver';
const CITY_SETTING_TOP_PULSE_MS = 180;
let citySettingTopPulseTimer = null;

function init() {
  ipcMain.handle('city-setting-close', () => {
    closeCitySettingWindow();
    return { success: true };
  });

  ipcMain.handle('close-city-setting-window', () => {
    closeCitySettingWindow();
    return { success: true };
  });
}

function pulseCitySettingWindowTop() {
  if (citySettingTopPulseTimer) {
    clearTimeout(citySettingTopPulseTimer);
    citySettingTopPulseTimer = null;
  }
  if (!windowManager.citySettingWindow || windowManager.citySettingWindow.isDestroyed()) return;

  windowManager.citySettingWindow.setAlwaysOnTop(true, CITY_SETTING_ALWAYS_ON_TOP_LEVEL);
  windowManager.citySettingWindow.moveTop();
  citySettingTopPulseTimer = setTimeout(() => {
    citySettingTopPulseTimer = null;
    if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) {
      windowManager.citySettingWindow.setAlwaysOnTop(false);
    }
  }, CITY_SETTING_TOP_PULSE_MS);
}

function raiseCitySettingWindow() {
  if (!windowManager.citySettingWindow || windowManager.citySettingWindow.isDestroyed()) return;
  if (windowManager.citySettingWindow.isMinimized()) windowManager.citySettingWindow.restore();
  if (!windowManager.citySettingWindow.isVisible()) windowManager.citySettingWindow.show();
  pulseCitySettingWindowTop();
  windowManager.citySettingWindow.focus();
  return windowManager.citySettingWindow;
}

function createCitySettingWindow() {
  if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) return windowManager.citySettingWindow;

  const width = 360;
  const height = 200;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;

  windowManager.citySettingWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(x + (areaWidth - width) / 2),
    y: Math.round(y + (areaHeight - height) / 2),
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windowManager.citySettingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  windowManager.citySettingWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'city-setting.html'));

  windowManager.citySettingWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.citySettingWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.citySettingWindow.on('focus', () => {
    pulseCitySettingWindowTop();
  });
  windowManager.citySettingWindow.on('show', () => {
    pulseCitySettingWindowTop();
  });
  windowManager.citySettingWindow.on('restore', () => {
    raiseCitySettingWindow();
  });
  windowManager.citySettingWindow.on('closed', () => {
    if (citySettingTopPulseTimer) {
      clearTimeout(citySettingTopPulseTimer);
      citySettingTopPulseTimer = null;
    }
    windowManager.citySettingWindow = null;
  });

  return windowManager.citySettingWindow;
}

function openCitySettingWindow() {
  createCitySettingWindow();
  return raiseCitySettingWindow();
}

function closeCitySettingWindow() {
  if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) {
    windowManager.citySettingWindow.close();
  }
}

module.exports = {
  init,
  createCitySettingWindow,
  openCitySettingWindow,
  closeCitySettingWindow
};
