/**
 * src/main/services/WeatherSyncController.js
 * 天气感知与时空同步的主进程设置控制器：electron-store 设置存取、周期同步
 * 定时器、store.onDidChange 订阅、城市设置 IPC（get-city-settings/set-city-name）。
 * 勿与根目录已有的 weatherSyncService.js（网络请求/地理编码/数据清洗）混淆。
 * init(deps) 模式，deps: { windowManager, trayManager, StoreManager }。
 */
const { ipcMain } = require('electron');
const {
  DEFAULT_WEATHER_SYNC_SETTINGS,
  normalizeSettings: normalizeWeatherSyncSettings,
  fetchWeather,
  processSettingsChange,
} = require('../../../weatherSyncService');

const WEATHER_SYNC_STORE_KEY = 'weatherSyncSettings';

let deps = {};
let weatherSyncSettings = { ...DEFAULT_WEATHER_SYNC_SETTINGS };
let weatherSyncIntervalTimer = null;
let weatherSyncSettingsUpdateId = 0;

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('get-city-settings', () => {
    return { city: weatherSyncSettings.city || '' };
  });

  ipcMain.handle('set-city-name', async (_event, cityName) => {
    if (typeof cityName !== 'string' || !cityName.trim()) {
      return { success: false };
    }

    const trimmed = cityName.trim().slice(0, 100);
    const currentStored = getStoredWeatherSyncSettings();

    // Force enabled to true temporarily to bypass processSettingsChange's fast-return
    // and ensure geocoding validation runs.
    const newSettings = {
      ...currentStored,
      city: trimmed,
      lat: null,
      lon: null,
      enabled: true,
    };

    try {
      const processed = await processSettingsChange(newSettings);
      if (processed.lat === null || processed.lon === null) {
        return { success: false };
      }

      // Restore the user's actual enabled preference before saving
      processed.enabled = currentStored.enabled;

      weatherSyncSettings = processed;
      saveWeatherSyncSettings(weatherSyncSettings);
      deps.trayManager.refreshTrayMenu();
      startWeatherSync();
      return { success: true, city: processed.city };
    } catch (err) {
      console.error('Failed to set city:', err);
      return { success: false };
    }
  });

  const store = deps.StoreManager.getStore();
  if (store) {
    // Listen to config changes if users open the editor and save it
    store.onDidChange(WEATHER_SYNC_STORE_KEY, (newValue) => {
      // Ignore undefined/null newValue which can happen during atomic file writes
      if (!newValue) return;
      updateWeatherSyncSettings(newValue);
    });
  }
}

function getStoredWeatherSyncSettings() {
  const store = deps.StoreManager.getStore();
  if (!store) return { ...DEFAULT_WEATHER_SYNC_SETTINGS };
  const raw = store.get(WEATHER_SYNC_STORE_KEY);
  return normalizeWeatherSyncSettings(raw);
}

function saveWeatherSyncSettings(settings) {
  const store = deps.StoreManager.getStore();
  if (!store) return { ...DEFAULT_WEATHER_SYNC_SETTINGS };
  const normalized = normalizeWeatherSyncSettings(settings);
  store.set(WEATHER_SYNC_STORE_KEY, normalized);
  return normalized;
}

async function startWeatherSync() {
  const { windowManager } = deps;
  if (weatherSyncIntervalTimer) {
    clearInterval(weatherSyncIntervalTimer);
    weatherSyncIntervalTimer = null;
  }
  if (!weatherSyncSettings.enabled) {
    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
      windowManager.mainWindow.webContents.send('weather-update', { active: false });
    }
    return;
  }

  const doFetch = async () => {
    const payload = await fetchWeather(weatherSyncSettings);
    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed() && payload) {
      windowManager.mainWindow.webContents.send('weather-update', payload);
    }
  };

  await doFetch(); // immediately fetch
  const intervalMs = weatherSyncSettings.refreshIntervalMinutes * 60 * 1000;
  weatherSyncIntervalTimer = setInterval(doFetch, intervalMs);
}

async function updateWeatherSyncSettings(newSettings) {
  const updateId = ++weatherSyncSettingsUpdateId;
  weatherSyncSettings = normalizeWeatherSyncSettings(newSettings);
  deps.trayManager.refreshTrayMenu();

  const processedSettings = await processSettingsChange(weatherSyncSettings);
  if (updateId !== weatherSyncSettingsUpdateId) return;

  weatherSyncSettings = processedSettings;
  saveWeatherSyncSettings(weatherSyncSettings);
  deps.trayManager.refreshTrayMenu();
  startWeatherSync();
}

module.exports = {
  init,
  getStoredWeatherSyncSettings,
  saveWeatherSyncSettings,
  startWeatherSync,
  updateWeatherSyncSettings,
  getWeatherSyncSettings: () => weatherSyncSettings,
};
