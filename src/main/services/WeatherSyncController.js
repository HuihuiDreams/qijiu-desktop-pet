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
  resetWeatherCache,
} = require('../../../weatherSyncService');

const WEATHER_SYNC_STORE_KEY = 'weatherSyncSettings';
const WEATHER_SYNC_LAST_PAYLOAD_STORE_KEY = 'weatherSyncLastPayload';
const WEATHER_SYNC_LAST_PAYLOAD_TTL_MS = 2 * 60 * 60 * 1000;

let deps = {};
let weatherSyncSettings = { ...DEFAULT_WEATHER_SYNC_SETTINGS };
let weatherSyncIntervalTimer = null;
let weatherSyncSettingsUpdateId = 0;
let weatherSyncStartId = 0;

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

  // Load persisted settings immediately so early tray/city-settings reads
  // reflect the stored preference; the actual sync (geocode/fetch/interval)
  // only starts once the renderer's did-finish-load calls updateWeatherSyncSettings().
  weatherSyncSettings = getStoredWeatherSyncSettings();
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

function sendWeatherUpdate(payload) {
  const mainWindow = deps.windowManager.mainWindow;
  if (mainWindow && !mainWindow.isDestroyed() && payload) {
    mainWindow.webContents.send('weather-update', payload);
  }
}

function getStoredWeatherPayload(settings) {
  const store = deps.StoreManager.getStore();
  const cached = store?.get(WEATHER_SYNC_LAST_PAYLOAD_STORE_KEY);
  if (!cached || typeof cached !== 'object') return null;

  const savedAt = Number(cached.savedAt);
  const ageMs = Date.now() - savedAt;
  if (!Number.isFinite(savedAt) || ageMs < 0 || ageMs > WEATHER_SYNC_LAST_PAYLOAD_TTL_MS) return null;
  if (cached.lat !== settings.lat || cached.lon !== settings.lon) return null;

  const payload = cached.payload;
  if (!payload || typeof payload !== 'object' || payload.active !== true || payload.fallback === true) return null;
  return payload;
}

function saveWeatherPayload(settings, payload) {
  if (!payload || payload.active !== true || payload.fallback === true) return;
  const store = deps.StoreManager.getStore();
  store?.set(WEATHER_SYNC_LAST_PAYLOAD_STORE_KEY, {
    lat: settings.lat,
    lon: settings.lon,
    savedAt: Date.now(),
    payload,
  });
}

async function startWeatherSync() {
  const startId = ++weatherSyncStartId;
  if (weatherSyncIntervalTimer) {
    clearInterval(weatherSyncIntervalTimer);
    weatherSyncIntervalTimer = null;
  }
  const settings = weatherSyncSettings;
  if (!settings.enabled) {
    sendWeatherUpdate({ active: false });
    return;
  }

  let cachedPayload = getStoredWeatherPayload(settings);
  if (cachedPayload) sendWeatherUpdate(cachedPayload);

  const doFetch = async () => {
    let payload = await fetchWeather(settings);
    if (startId !== weatherSyncStartId) return;
    if (payload?.fallback === true && !cachedPayload) {
      resetWeatherCache();
      payload = await fetchWeather(settings);
      if (startId !== weatherSyncStartId) return;
    }
    if (payload?.active === true && payload.fallback !== true) {
      saveWeatherPayload(settings, payload);
      cachedPayload = payload;
    }
    if (payload?.fallback === true && cachedPayload) return;
    sendWeatherUpdate(payload);
  };

  await doFetch(); // immediately fetch
  if (startId !== weatherSyncStartId) return;
  const intervalMs = settings.refreshIntervalMinutes * 60 * 1000;
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
