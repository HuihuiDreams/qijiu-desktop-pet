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

const _realSetInterval = global.setInterval;
const _realClearInterval = global.clearInterval;
function stubTimers() {
  global.setInterval = () => 1;
  global.clearInterval = () => {};
}
function restoreTimers() {
  global.setInterval = _realSetInterval;
  global.clearInterval = _realClearInterval;
}

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

function loadFreshController({ ipcMain, fetchWeather, processSettingsChange, resetWeatherCache = () => {} }) {
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
        resetWeatherCache,
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

function createDependencies(initialSettings, initialWeatherCache) {
  const sent = [];
  const storeValues = new Map([
    ['weatherSyncSettings', initialSettings],
    ['weatherSyncLastPayload', initialWeatherCache],
  ]);
  const storeListeners = {};
  let trayRefreshCount = 0;
  const mainWindow = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push([channel, payload]) },
  };
  const citySettingWindow = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false },
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
      windowManager: { mainWindow, citySettingWindow },
    },
    sent,
    storeListeners,
    storedSettings: () => storeValues.get('weatherSyncSettings'),
    storedValue: (key) => storeValues.get(key),
    getTrayRefreshCount: () => trayRefreshCount,
    cityEvent: { sender: citySettingWindow.webContents },
  };
}

test('WeatherSyncController exposes persisted city settings immediately after initialization', () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => ({ active: true }),
    processSettingsChange: async (settings) => settings,
  });
  const { deps, storeListeners, cityEvent } = createDependencies({
    ...DEFAULT_SETTINGS,
    city: 'Tokyo',
    enabled: true,
    lat: 35.68,
    lon: 139.76,
  });

  Controller.init(deps);

  assert.deepEqual(ipcMain.handlers['get-city-settings'](cityEvent), { city: 'Tokyo' });
  assert.equal(typeof ipcMain.handlers['set-city-name'], 'function');
  assert.equal(typeof storeListeners.weatherSyncSettings, 'function');
});

test('WeatherSyncController immediately restores a recent successful payload for the saved coordinates', async () => {
  const ipcMain = createIpcMain();
  const cachedPayload = { active: true, weatherCode: 63, temperature: 25, fallback: false };
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => ({ active: true, weatherCode: 61, temperature: 24, fallback: false }),
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent, storedValue } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Tokyo',
    lat: 35.6895,
    lon: 139.69171,
  }, {
    lat: 35.6895,
    lon: 139.69171,
    savedAt: Date.now(),
    payload: cachedPayload,
  });
  Controller.init(deps);

  stubTimers();
  try {
    await Controller.startWeatherSync();
  } finally {
    restoreTimers();
  }

  assert.deepEqual(sent[0], ['weather-update', cachedPayload]);
  assert.deepEqual(sent[1], ['weather-update', { active: true, weatherCode: 61, temperature: 24, fallback: false }]);
  assert.deepEqual(storedValue('weatherSyncLastPayload')?.payload, { active: true, weatherCode: 61, temperature: 24, fallback: false });
});

test('WeatherSyncController keeps the restored payload when the startup request falls back', async () => {
  const ipcMain = createIpcMain();
  const cachedPayload = { active: true, weatherCode: 95, temperature: 25, fallback: false };
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => ({ active: true, weatherCode: null, fallback: true }),
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Tokyo',
    lat: 35.6895,
    lon: 139.69171,
  }, {
    lat: 35.6895,
    lon: 139.69171,
    savedAt: Date.now(),
    payload: cachedPayload,
  });
  Controller.init(deps);

  stubTimers();
  try {
    await Controller.startWeatherSync();
  } finally {
    restoreTimers();
  }

  assert.deepEqual(sent, [['weather-update', cachedPayload]]);
});

test('WeatherSyncController retries once after a cold-start fallback when no saved payload exists', async () => {
  const ipcMain = createIpcMain();
  const responses = [
    { active: true, weatherCode: -1, fallback: true },
    { active: true, weatherCode: 63, temperature: 25, fallback: false },
  ];
  let resetCount = 0;
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => responses.shift(),
    processSettingsChange: async (settings) => settings,
    resetWeatherCache: () => { resetCount += 1; },
  });
  const { deps, sent, storedValue } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Tokyo',
    lat: 35.6895,
    lon: 139.69171,
  });
  Controller.init(deps);

  stubTimers();
  try {
    await Controller.startWeatherSync();
  } finally {
    restoreTimers();
  }

  assert.equal(responses.length, 0);
  assert.equal(resetCount, 1);
  assert.deepEqual(sent, [['weather-update', { active: true, weatherCode: 63, temperature: 25, fallback: false }]]);
  assert.equal(storedValue('weatherSyncLastPayload')?.payload.weatherCode, 63);
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

test('WeatherSyncController keeps only the newest interval when weather sync starts overlap', async () => {
  const ipcMain = createIpcMain();
  const pendingFetches = [];
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const intervals = [];
  global.setInterval = (callback, intervalMs) => {
    intervals.push({ callback, intervalMs });
    return intervals.length;
  };
  global.clearInterval = () => {};

  try {
    const Controller = loadFreshController({
      ipcMain,
      fetchWeather: () => new Promise((resolve) => pendingFetches.push(resolve)),
      processSettingsChange: async (settings) => settings,
    });
    const { deps } = createDependencies({
      ...DEFAULT_SETTINGS,
      enabled: true,
      city: 'Tokyo',
      lat: 35.68,
      lon: 139.76,
    });
    Controller.init(deps);

    const firstStart = Controller.startWeatherSync();
    const secondStart = Controller.startWeatherSync();
    assert.equal(pendingFetches.length, 2);

    pendingFetches[0]({ active: true, city: 'Tokyo' });
    pendingFetches[1]({ active: true, city: 'Tokyo' });
    await Promise.all([firstStart, secondStart]);

    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].intervalMs, 60 * 60 * 1000);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test('set-city-name rejects non-string input', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async () => {},
  });
  const { deps, cityEvent } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  assert.deepEqual(await ipcMain.handlers['set-city-name'](cityEvent, 123), { success: false });
  assert.deepEqual(await ipcMain.handlers['set-city-name'](cityEvent, '  '), { success: false });
});

test('set-city-name success: geocode passes, saves, starts sync, returns { success: true, city }', async () => {
  const ipcMain = createIpcMain();
  let fetchCalled = false;
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => { fetchCalled = true; return { active: true }; },
    processSettingsChange: async (settings) => ({
      ...settings,
      lat: 35.68,
      lon: 139.76,
      city: 'Tokyo'
    }),
  });
  const { deps, storedSettings, getTrayRefreshCount, cityEvent } = createDependencies({ ...DEFAULT_SETTINGS, enabled: true });
  Controller.init(deps);

  stubTimers();
  try {
    const result = await ipcMain.handlers['set-city-name'](cityEvent, 'Tokyo');
    // startWeatherSync is async, wait a tick for fetchWeather to complete
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(result, { success: true, city: 'Tokyo' });
    assert.equal(storedSettings().city, 'Tokyo');
    assert.ok(getTrayRefreshCount() > 0);
    assert.equal(fetchCalled, true);
  } finally {
    restoreTimers();
  }
});

test('set-city-name geocode failure: lat/lon remain null -> { success: false }', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => ({
      ...settings,
      lat: null,
      lon: null,
    }),
  });
  const { deps, storedSettings, cityEvent } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  const result = await ipcMain.handlers['set-city-name'](cityEvent, 'UnknownCity');
  assert.deepEqual(result, { success: false });
  assert.equal(storedSettings().city, '');
});

test('set-city-name processSettingsChange throws -> { success: false }', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async () => { throw new Error('Network error'); },
  });
  const { deps, cityEvent } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  const result = await ipcMain.handlers['set-city-name'](cityEvent, 'Tokyo');
  assert.deepEqual(result, { success: false });
});

test('store.onDidChange callback ignores falsy newValue', () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => settings,
  });
  const { deps, storeListeners } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);
  
  storeListeners.weatherSyncSettings(null);
  assert.equal(Controller.getWeatherSyncSettings().city, '');
});

test('store.onDidChange callback triggers updateWeatherSyncSettings for truthy values', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => settings,
  });
  const { deps, storeListeners } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  stubTimers();
  try {
    storeListeners.weatherSyncSettings({ ...DEFAULT_SETTINGS, city: 'Osaka' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(Controller.getWeatherSyncSettings().city, 'Osaka');
  } finally {
    restoreTimers();
  }
});

test('get-city-settings returns empty string when city is not set', () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => settings,
  });
  const { deps, cityEvent } = createDependencies({ ...DEFAULT_SETTINGS, city: null });
  Controller.init(deps);

  assert.deepEqual(ipcMain.handlers['get-city-settings'](cityEvent), { city: '' });
});

test('getStoredWeatherSyncSettings returns defaults when store is unavailable', () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => settings,
  });
  const { deps } = createDependencies(DEFAULT_SETTINGS);
  deps.StoreManager.getStore = () => null;
  Controller.init(deps);

  const settings = Controller.getStoredWeatherSyncSettings();
  assert.equal(settings.schemaVersion, 1);
  assert.equal(settings.city, '');
});

test('saveWeatherSyncSettings returns defaults when store is unavailable', () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => settings,
  });
  const { deps } = createDependencies(DEFAULT_SETTINGS);
  deps.StoreManager.getStore = () => null;
  Controller.init(deps);

  const result = Controller.saveWeatherSyncSettings({ city: 'Test' });
  assert.equal(result.city, '');
});

test('startWeatherSync clears an existing interval timer before starting a new one', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => settings,
  });
  const { deps } = createDependencies({ ...DEFAULT_SETTINGS, enabled: true });
  Controller.init(deps);

  let cleared = 0;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  global.setInterval = () => 1;
  global.clearInterval = () => { cleared += 1; };
  try {
    await Controller.startWeatherSync();
    await Controller.startWeatherSync();
    assert.equal(cleared, 1);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test('startWeatherSync does not send weather-update when mainWindow is destroyed (disabled path)', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent } = createDependencies(DEFAULT_SETTINGS);
  deps.windowManager.mainWindow.isDestroyed = () => true;
  Controller.init(deps);

  await Controller.startWeatherSync();
  assert.deepEqual(sent, []);
});

test('doFetch does not send weather-update when fetchWeather returns null', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => null,
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent } = createDependencies({ ...DEFAULT_SETTINGS, enabled: true });
  Controller.init(deps);

  stubTimers();
  try {
    await Controller.startWeatherSync();
    assert.deepEqual(sent, []);
  } finally {
    restoreTimers();
  }
});
