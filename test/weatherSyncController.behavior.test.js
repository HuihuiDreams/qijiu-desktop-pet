const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const CONTROLLER_PATH = require.resolve('../src/main/services/WeatherSyncController');

const DEFAULT_SETTINGS = {
  enabled: false,
  city: '',
  lat: null,
  lon: null,
  refreshIntervalMinutes: 60,
  schemaVersion: 1,
};

function createIpcMain() {
  const handlers = {};
  return {
    handle: (channel, handler) => { handlers[channel] = handler; },
    handlers,
  };
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    city: typeof settings?.city === 'string' ? settings.city.trim() : '',
  };
}

function loadFreshController({ ipcMain, fetchWeather, processSettingsChange }) {
  const originalLoad = Module._load;
  delete require.cache[CONTROLLER_PATH];

  Module._load = function loadWeatherDependencies(request, parent, isMain) {
    if (parent?.filename === CONTROLLER_PATH && request === 'electron') {
      return { ipcMain };
    }
    if (parent?.filename === CONTROLLER_PATH && request === '../../../weatherSyncService') {
      return {
        DEFAULT_WEATHER_SYNC_SETTINGS: DEFAULT_SETTINGS,
        normalizeSettings,
        fetchWeather,
        processSettingsChange,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    return require('../src/main/services/WeatherSyncController');
  } finally {
    Module._load = originalLoad;
  }
}

function createDependencies(initialSettings) {
  const sent = [];
  const storeValues = new Map([['weatherSyncSettings', initialSettings]]);
  const storeListeners = {};
  let trayRefreshCount = 0;
  const mainWindow = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push([channel, payload]) },
  };
  const store = {
    get: (key) => storeValues.get(key),
    set: (key, value) => storeValues.set(key, value),
    onDidChange: (key, listener) => { storeListeners[key] = listener; },
  };
  return {
    deps: {
      StoreManager: { getStore: () => store },
      trayManager: { refreshTrayMenu: () => { trayRefreshCount += 1; } },
      windowManager: { mainWindow },
    },
    sent,
    storeListeners,
    storedSettings: () => storeValues.get('weatherSyncSettings'),
    getTrayRefreshCount: () => trayRefreshCount,
  };
}

test('WeatherSyncController exposes persisted city settings immediately after initialization', () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => ({ active: true }),
    processSettingsChange: async (settings) => settings,
  });
  const { deps, storeListeners } = createDependencies({
    ...DEFAULT_SETTINGS,
    city: 'Tokyo',
    enabled: true,
    lat: 35.68,
    lon: 139.76,
  });

  Controller.init(deps);

  assert.deepEqual(ipcMain.handlers['get-city-settings'](), { city: 'Tokyo' });
  assert.equal(typeof ipcMain.handlers['set-city-name'], 'function');
  assert.equal(typeof storeListeners.weatherSyncSettings, 'function');
});

test('WeatherSyncController keeps the newest asynchronous settings update and publishes its weather payload', async () => {
  const ipcMain = createIpcMain();
  const pendingSettings = new Map();
  const fetchCalls = [];
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const intervalCallbacks = [];
  global.setInterval = (callback, intervalMs) => {
    intervalCallbacks.push({ callback, intervalMs });
    return intervalCallbacks.length;
  };
  global.clearInterval = () => {};

  try {
    const Controller = loadFreshController({
      ipcMain,
      fetchWeather: async (settings) => {
        fetchCalls.push(settings.city);
        return { active: true, city: settings.city };
      },
      processSettingsChange: (settings) => new Promise((resolve) => {
        pendingSettings.set(settings.city, resolve);
      }),
    });
    const { deps, sent, storedSettings, getTrayRefreshCount } = createDependencies(DEFAULT_SETTINGS);
    Controller.init(deps);

    const oldUpdate = Controller.updateWeatherSyncSettings({ ...DEFAULT_SETTINGS, enabled: true, city: 'Old' });
    const newUpdate = Controller.updateWeatherSyncSettings({ ...DEFAULT_SETTINGS, enabled: true, city: 'New' });
    assert.equal(Controller.getWeatherSyncSettings().city, 'New');
    assert.equal(getTrayRefreshCount(), 2, 'tray reflects both optimistic settings changes before geocoding completes');

    pendingSettings.get('New')({
      ...DEFAULT_SETTINGS,
      enabled: true,
      city: 'New',
      lat: 35.68,
      lon: 139.76,
    });
    await newUpdate;
    await new Promise((resolve) => setImmediate(resolve));

    pendingSettings.get('Old')({
      ...DEFAULT_SETTINGS,
      enabled: true,
      city: 'Old',
      lat: 51.51,
      lon: -0.13,
    });
    await oldUpdate;

    assert.equal(Controller.getWeatherSyncSettings().city, 'New');
    assert.equal(storedSettings().city, 'New');
    assert.deepEqual(fetchCalls, ['New']);
    assert.deepEqual(sent, [['weather-update', { active: true, city: 'New' }]]);
    assert.equal(intervalCallbacks.length, 1);
    assert.equal(intervalCallbacks[0].intervalMs, 60 * 60 * 1000);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test('WeatherSyncController tells the renderer to deactivate weather without fetching when sync is disabled', async () => {
  const ipcMain = createIpcMain();
  let fetchCalled = false;
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {
      fetchCalled = true;
      return { active: true };
    },
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  await Controller.startWeatherSync();

  assert.equal(fetchCalled, false);
  assert.deepEqual(sent, [['weather-update', { active: false }]]);
});
