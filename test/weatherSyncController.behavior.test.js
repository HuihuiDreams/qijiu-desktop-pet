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
const _realSetTimeout = global.setTimeout;
const _realClearTimeout = global.clearTimeout;
function stubTimers() {
  global.setInterval = () => 1;
  global.clearInterval = () => {};
  global.setTimeout = () => ({ unref() {} });
  global.clearTimeout = () => {};
}
function restoreTimers() {
  global.setInterval = _realSetInterval;
  global.clearInterval = _realClearInterval;
  global.setTimeout = _realSetTimeout;
  global.clearTimeout = _realClearTimeout;
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

function loadFreshController({
  ipcMain,
  fetchWeather,
  processSettingsChange,
  resetWeatherCache = () => {},
  FALLBACK_TTL_MS = 10 * 60 * 1000,
}) {
  const originalLoad = Module._load;
  delete require.cache[CONTROLLER_PATH];

  Module._load = function loadWeatherDependencies(request, parent, isMain) {
    if (parent?.filename === CONTROLLER_PATH && request === 'electron') {
      return { ipcMain };
    }
    if (parent?.filename === CONTROLLER_PATH && request === '../../../weatherSyncService') {
      return {
        DEFAULT_WEATHER_SYNC_SETTINGS: DEFAULT_SETTINGS,
        FALLBACK_TTL_MS,
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
  const store = {
    get: (key) => storeValues.get(key),
    set: (key, value) => {
      const prev = storeValues.get(key);
      const changed = JSON.stringify(prev) !== JSON.stringify(value);
      storeValues.set(key, value);
      if (changed && typeof storeListeners[key] === 'function') {
        storeListeners[key](value, prev);
      }
    },
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
    storedValue: (key) => storeValues.get(key),
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

  assert.equal(Controller.getWeatherSyncSettings().city, 'Tokyo');
  assert.equal(typeof Controller.setCityName, 'function');
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
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduledTimers = [];
  global.setTimeout = (callback, delayMs) => {
    scheduledTimers.push({ callback, delayMs });
    return { id: scheduledTimers.length, unref() {} };
  };
  global.clearTimeout = () => {};

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
    assert.equal(scheduledTimers.length, 1);
    assert.equal(scheduledTimers[0].delayMs, 60 * 60 * 1000);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
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
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs });
    return { id: timers.length, unref() {} };
  };
  global.clearTimeout = () => {};

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

    assert.equal(timers.length, 1);
    assert.equal(timers[0].delayMs, 60 * 60 * 1000);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('setCityName rejects non-string input', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async () => {},
  });
  const { deps } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  assert.deepEqual(await Controller.setCityName(123), { success: false });
  assert.deepEqual(await Controller.setCityName('  '), { success: false });
});

test('setCityName success: geocode passes, saves, starts sync, returns { success: true, city }', async () => {
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
  const { deps, storedSettings, getTrayRefreshCount } = createDependencies({ ...DEFAULT_SETTINGS, enabled: true });
  Controller.init(deps);

  stubTimers();
  try {
    const result = await Controller.setCityName('Tokyo');
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

test('setCityName geocode failure: lat/lon remain null -> { success: false }', async () => {
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
  const { deps, storedSettings } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  const result = await Controller.setCityName('UnknownCity');
  assert.deepEqual(result, { success: false });
  assert.equal(storedSettings().city, '');
});

test('setCityName processSettingsChange throws -> { success: false }', async () => {
  const ipcMain = createIpcMain();
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {},
    processSettingsChange: async () => { throw new Error('Network error'); },
  });
  const { deps } = createDependencies(DEFAULT_SETTINGS);
  Controller.init(deps);

  const result = await Controller.setCityName('Tokyo');
  assert.deepEqual(result, { success: false });
});

test('setCityName while in-flight does not revive weather sync if disabled via settings', async () => {
  const ipcMain = createIpcMain();
  let fetchCount = 0;
  let resolveGeocode;
  const geocodePromise = new Promise((resolve) => { resolveGeocode = resolve; });

  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => { fetchCount += 1; return { active: true }; },
    processSettingsChange: async (settings) => {
      if (settings.city === 'Tokyo' && settings.lat === null) {
        await geocodePromise;
        return {
          ...settings,
          lat: 35.68,
          lon: 139.76,
          city: settings.city,
        };
      }
      return settings;
    },
  });

  const { deps, storedSettings } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'London',
  });
  Controller.init(deps);
  stubTimers();

  try {
    // 1. User starts city query for Tokyo
    const cityPromise = Controller.setCityName('Tokyo');

    // 2. While in-flight, user turns off weather sync
    await Controller.updateWeatherSyncSettings({
      ...Controller.getWeatherSyncSettings(),
      enabled: false,
    });
    assert.equal(storedSettings().enabled, false);
    assert.equal(Controller.getWeatherSyncSettings().enabled, false);

    const fetchesBefore = fetchCount;

    // 3. Geocode for Tokyo now completes
    resolveGeocode();
    const result = await cityPromise;

    // 4. City query completes, city is updated to Tokyo, but enabled remains FALSE
    assert.deepEqual(result, { success: true, city: 'Tokyo' });
    assert.equal(storedSettings().city, 'Tokyo');
    assert.equal(storedSettings().enabled, false, 'Weather sync must remain disabled');
    assert.equal(Controller.getWeatherSyncSettings().enabled, false, 'Controller enabled must remain false');
    assert.equal(fetchCount, fetchesBefore, 'Must not revive weather fetch timer');
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    restoreTimers();
  }
});

test('consecutive city queries: older slow query completing after newer fast query is discarded', async () => {
  const ipcMain = createIpcMain();
  let resolveOsaka;
  const osakaPromise = new Promise((resolve) => { resolveOsaka = resolve; });

  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => ({ active: true }),
    processSettingsChange: async (settings) => {
      if (settings.city === 'Osaka') {
        await osakaPromise;
        return { ...settings, lat: 34.69, lon: 135.50, city: 'Osaka' };
      }
      if (settings.city === 'Tokyo') {
        return { ...settings, lat: 35.68, lon: 139.76, city: 'Tokyo' };
      }
      return settings;
    },
  });

  const { deps, storedSettings } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Kyoto',
  });
  Controller.init(deps);
  stubTimers();

  try {
    // 1. Submit slow query Osaka
    const osakaResultPromise = Controller.setCityName('Osaka');

    // 2. Submit fast query Tokyo
    const tokyoResult = await Controller.setCityName('Tokyo');
    assert.deepEqual(tokyoResult, { success: true, city: 'Tokyo' });
    assert.equal(storedSettings().city, 'Tokyo');

    // 3. Now slow Osaka query settles
    resolveOsaka();
    const osakaResult = await osakaResultPromise;

    // 4. Stale Osaka query must be discarded
    assert.deepEqual(osakaResult, { success: false }, 'Older superseded query must return { success: false }');
    assert.equal(storedSettings().city, 'Tokyo', 'Stored city must remain Tokyo, not overwritten by Osaka');
    assert.equal(Controller.getWeatherSyncSettings().city, 'Tokyo');
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    restoreTimers();
  }
});

for (const firstCompleted of ['Tokyo', 'London']) {
  test(`city query preserves a pending enable toggle when ${firstCompleted} geocoding completes first`, async () => {
    const ipcMain = createIpcMain();
    const pending = new Map();
    const Controller = loadFreshController({
      ipcMain,
      fetchWeather: async (settings) => ({ active: true, city: settings.city }),
      processSettingsChange: (settings) => new Promise((resolve) => {
        pending.set(settings.city, () => resolve({ ...settings, lat: 35.68, lon: 139.76 }));
      }),
    });
    const { deps, storedSettings } = createDependencies({
      ...DEFAULT_SETTINGS, enabled: false, city: 'London',
    });
    Controller.init(deps);
    stubTimers();
    try {
      const cityQuery = Controller.setCityName('Tokyo');
      const enableToggle = Controller.updateWeatherSyncSettings({
        ...Controller.getStoredWeatherSyncSettings(), enabled: true, refreshIntervalMinutes: 30,
      });
      assert.equal(Controller.getWeatherSyncSettings().enabled, true);
      assert.equal(storedSettings().enabled, false, 'enable is still waiting for geocoding');

      pending.get(firstCompleted)();
      await (firstCompleted === 'Tokyo' ? cityQuery : enableToggle);
      pending.get(firstCompleted === 'Tokyo' ? 'London' : 'Tokyo')();
      await Promise.all([cityQuery, enableToggle]);
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(Controller.getWeatherSyncSettings().enabled, true);
      assert.equal(storedSettings().enabled, true);
      assert.equal(storedSettings().city, 'Tokyo');
      assert.equal(storedSettings().refreshIntervalMinutes, 30);
    } finally {
      restoreTimers();
    }
  });
}

test('resubmitting a different city invalidates older query even if older settles first', async () => {
  const ipcMain = createIpcMain();
  let resolveOsaka;
  let resolveTokyo;
  const osakaPromise = new Promise((resolve) => { resolveOsaka = resolve; });
  const tokyoPromise = new Promise((resolve) => { resolveTokyo = resolve; });

  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => ({ active: true }),
    processSettingsChange: async (settings) => {
      if (settings.city === 'Osaka') {
        await osakaPromise;
        return { ...settings, lat: 34.69, lon: 135.50, city: 'Osaka' };
      }
      if (settings.city === 'Tokyo') {
        await tokyoPromise;
        return { ...settings, lat: 35.68, lon: 139.76, city: 'Tokyo' };
      }
      return settings;
    },
  });

  const { deps, storedSettings } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Kyoto',
  });
  Controller.init(deps);
  stubTimers();

  try {
    // 1. Submit query Osaka
    const osakaResultPromise = Controller.setCityName('Osaka');

    // 2. Reopen / resubmit query for Tokyo
    const tokyoResultPromise = Controller.setCityName('Tokyo');

    // 3. Osaka settles FIRST
    resolveOsaka();
    const osakaResult = await osakaResultPromise;
    assert.deepEqual(osakaResult, { success: false }, 'Older Osaka query must be discarded even if it settles first');

    // 4. Tokyo settles LATER
    resolveTokyo();
    const tokyoResult = await tokyoResultPromise;
    assert.deepEqual(tokyoResult, { success: true, city: 'Tokyo' });
    assert.equal(storedSettings().city, 'Tokyo');
    assert.equal(Controller.getWeatherSyncSettings().city, 'Tokyo');
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    restoreTimers();
  }
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
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = () => ({ unref() {} });
  global.clearTimeout = () => { cleared += 1; };
  try {
    await Controller.startWeatherSync();
    await Controller.startWeatherSync();
    assert.equal(cleared, 1);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
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

async function flushMicrotasks() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test('WeatherSyncController retries at FALLBACK_TTL_MS (10 min) when keeping cached payload after fallback, then returns to 60-min cadence', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });

  const ipcMain = createIpcMain();
  const cachedPayload = { active: true, weatherCode: 3, windSpeed: 13, temperature: -3.1, fallback: false };
  const livePayload = { active: true, weatherCode: 85, windSpeed: 13.6, temperature: -3.2, fallback: false };
  const periodicPayload = { active: true, weatherCode: 0, windSpeed: 5, temperature: -2.0, fallback: false };
  const responses = [
    { active: true, weatherCode: -1, fallback: true },
    livePayload,
    periodicPayload,
  ];
  let fetchCalls = 0;
  let resetCalls = 0;

  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {
      fetchCalls += 1;
      return responses.shift();
    },
    processSettingsChange: async (settings) => settings,
    resetWeatherCache: () => { resetCalls += 1; },
  });
  const { deps, sent, storedValue } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Harbin',
    lat: 45.75,
    lon: 126.65,
    refreshIntervalMinutes: 60,
  }, {
    lat: 45.75,
    lon: 126.65,
    savedAt: Date.now(),
    payload: cachedPayload,
  });
  Controller.init(deps);

  await Controller.startWeatherSync();
  assert.equal(fetchCalls, 1);
  assert.equal(resetCalls, 0);
  assert.deepEqual(sent, [['weather-update', cachedPayload]]);

  t.mock.timers.tick(9 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 1, 'must not retry before 10-minute fallback window');

  t.mock.timers.tick(1 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 2, 'must retry after 10 minutes instead of waiting 60 minutes');
  assert.equal(resetCalls, 1, 'must clear service fallback cache before retrying');
  assert.deepEqual(sent, [
    ['weather-update', cachedPayload],
    ['weather-update', livePayload],
  ]);
  assert.deepEqual(storedValue('weatherSyncLastPayload')?.payload, livePayload);

  t.mock.timers.tick(10 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 2, 'must return to normal 60-minute interval after recovery');

  t.mock.timers.tick(50 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 3, 'must run normal periodic refresh 60 minutes after recovery');
  assert.deepEqual(sent[2], ['weather-update', periodicPayload]);
});

test('WeatherSyncController retries every 10 minutes on consecutive fallbacks and switches to 10-minute retry when a periodic refresh falls back', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2_000_000 });

  const ipcMain = createIpcMain();
  const initialPayload = { active: true, weatherCode: 3, windSpeed: 13, fallback: false };
  const recoveredPayload = { active: true, weatherCode: 85, windSpeed: 14, fallback: false };
  const responses = [
    initialPayload,
    { active: true, weatherCode: -1, fallback: true },
    { active: true, weatherCode: -1, fallback: true },
    recoveredPayload,
  ];
  let fetchCalls = 0;

  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {
      fetchCalls += 1;
      return responses.shift();
    },
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Harbin',
    lat: 45.75,
    lon: 126.65,
    refreshIntervalMinutes: 60,
  });
  Controller.init(deps);

  await Controller.startWeatherSync();
  assert.equal(fetchCalls, 1);
  assert.deepEqual(sent, [['weather-update', initialPayload]]);

  // Normal 60-minute refresh fails -> keeps initialPayload and enters 10-minute retry cadence
  t.mock.timers.tick(60 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 2);
  assert.deepEqual(sent, [['weather-update', initialPayload]]);

  // First 10-minute retry also fails -> keeps initialPayload and schedules another 10-minute retry
  t.mock.timers.tick(10 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 3);
  assert.deepEqual(sent, [['weather-update', initialPayload]]);

  // Second 10-minute retry succeeds -> publishes recoveredPayload
  t.mock.timers.tick(10 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 4);
  assert.deepEqual(sent, [
    ['weather-update', initialPayload],
    ['weather-update', recoveredPayload],
  ]);
});

test('WeatherSyncController also retries at 10 minutes after cold-start fallbacks without cached payload', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 3_000_000 });

  const ipcMain = createIpcMain();
  const fallbackPayload = { active: true, weatherCode: -1, fallback: true };
  const livePayload = { active: true, weatherCode: 85, fallback: false };
  const responses = [
    fallbackPayload,
    fallbackPayload,
    fallbackPayload,
    livePayload,
  ];
  let fetchCalls = 0;

  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {
      fetchCalls += 1;
      return responses.shift();
    },
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent, storedValue } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Harbin',
    lat: 45.75,
    lon: 126.65,
    refreshIntervalMinutes: 60,
  });
  Controller.init(deps);

  await Controller.startWeatherSync();
  assert.equal(fetchCalls, 2, 'cold start without cache performs initial attempt plus one immediate retry');
  assert.deepEqual(sent, [['weather-update', fallbackPayload]]);

  // First 10-minute scheduled retry performs a single request (no double cold-start hammering)
  t.mock.timers.tick(10 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 3);

  // Second 10-minute scheduled retry recovers
  t.mock.timers.tick(10 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 4);
  assert.deepEqual(sent[sent.length - 1], ['weather-update', livePayload]);
  assert.deepEqual(storedValue('weatherSyncLastPayload')?.payload, livePayload);
});

test('WeatherSyncController cancels a pending 10-minute retry timer when weather sync is disabled', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 4_000_000 });

  const ipcMain = createIpcMain();
  let fetchCalls = 0;
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async () => {
      fetchCalls += 1;
      return { active: true, weatherCode: -1, fallback: true };
    },
    processSettingsChange: async (settings) => settings,
  });
  const initialSettings = {
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Harbin',
    lat: 45.75,
    lon: 126.65,
    refreshIntervalMinutes: 60,
  };
  const { deps } = createDependencies(initialSettings, {
    lat: 45.75,
    lon: 126.65,
    savedAt: Date.now(),
    payload: { active: true, weatherCode: 3, fallback: false },
  });
  Controller.init(deps);

  await Controller.startWeatherSync();
  assert.equal(fetchCalls, 1);

  await Controller.updateWeatherSyncSettings({ ...initialSettings, enabled: false });
  t.mock.timers.tick(10 * 60 * 1000);
  await flushMicrotasks();

  assert.equal(fetchCalls, 1, 'cancelled retry timer must not run after disabling sync');
});

test('WeatherSyncController still schedules a 10-minute retry when the initial fetch throws', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
  t.mock.method(console, 'error', () => {});

  let fetchCalls = 0;
  const Controller = loadFreshController({
    ipcMain: createIpcMain(),
    fetchWeather: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) throw new Error('boom');
      return { active: true, weatherCode: 3, fallback: false };
    },
    processSettingsChange: async (settings) => settings,
  });
  const settings = {
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Harbin',
    lat: 45.75,
    lon: 126.65,
    refreshIntervalMinutes: 60,
  };
  const { deps } = createDependencies(settings, null);
  Controller.init(deps);

  await Controller.startWeatherSync();
  assert.equal(fetchCalls, 1);

  t.mock.timers.tick(10 * 60 * 1000);
  await flushMicrotasks();
  assert.equal(fetchCalls, 2, 'retry must fire after the initial fetch throws');
});

function setupSupersedeScenario(t, fetchWeather) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 6_000_000 });
  const scheduled = [];
  const mockedSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => {
    scheduled.push({ fn, ms });
    return mockedSetTimeout(fn, ms, ...args);
  });

  const Controller = loadFreshController({
    ipcMain: createIpcMain(),
    fetchWeather,
    processSettingsChange: async (settings) => settings,
  });
  const { deps, sent } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: 'Harbin',
    lat: 45.75,
    lon: 126.65,
    refreshIntervalMinutes: 60,
  }, null);
  Controller.init(deps);
  return { Controller, scheduled, sent };
}

test('WeatherSyncController ignores a retry timer callback that fires after a newer startWeatherSync', async (t) => {
  const fallback = { active: true, weatherCode: -1, fallback: true };
  const live = { active: true, weatherCode: 3, fallback: false };
  const responses = [fallback, fallback, live]; // first start: initial + cold-start handshake; second start: live
  let fetchCalls = 0;
  const { Controller, scheduled } = setupSupersedeScenario(t, async () => {
    fetchCalls += 1;
    return responses.shift();
  });

  await Controller.startWeatherSync();
  assert.equal(fetchCalls, 2);
  assert.equal(scheduled.length, 1);
  const staleRetry = scheduled[0];
  assert.equal(staleRetry.ms, 10 * 60 * 1000);

  await Controller.startWeatherSync();
  assert.equal(fetchCalls, 3);
  assert.equal(scheduled.length, 2, 'new start schedules its own timer');

  await staleRetry.fn(); // simulate the old callback already dequeued when the new start ran
  await flushMicrotasks();
  assert.equal(fetchCalls, 3, 'stale callback must not fetch');
  assert.equal(scheduled.length, 2, 'stale callback must not schedule a timer');
});

test('WeatherSyncController drops an in-flight retry result when a newer startWeatherSync supersedes it', async (t) => {
  const fallback = { active: true, weatherCode: -1, fallback: true };
  const live = { active: true, weatherCode: 3, fallback: false };
  const stale = { active: true, weatherCode: 99, fallback: false };
  let releaseRetry;
  const retryGate = new Promise((resolve) => { releaseRetry = resolve; });
  const responses = [fallback, fallback, () => retryGate, live];
  let fetchCalls = 0;
  const { Controller, scheduled, sent } = setupSupersedeScenario(t, async () => {
    fetchCalls += 1;
    const next = responses.shift();
    return typeof next === 'function' ? next() : next;
  });

  await Controller.startWeatherSync();
  assert.equal(scheduled.length, 1);

  const retryRun = scheduled[0].fn(); // retry callback now awaiting fetchWeather
  await flushMicrotasks();
  assert.equal(fetchCalls, 3);

  await Controller.startWeatherSync(); // supersedes the in-flight retry
  assert.equal(fetchCalls, 4);
  const timersAfterNewStart = scheduled.length;
  const sentAfterNewStart = sent.length;

  releaseRetry(stale);
  await retryRun;
  await flushMicrotasks();

  assert.equal(scheduled.length, timersAfterNewStart, 'stale retry must not schedule a timer');
  assert.equal(sent.length, sentAfterNewStart, 'stale retry result must not be sent');
  assert.ok(!sent.some(([, payload]) => payload === stale));
});

test('WeatherSyncController ignores synchronous store.onDidChange during self-writes while still reacting to external changes', async () => {
  const ipcMain = createIpcMain();
  let fetchCalls = 0;
  let geocodeCalls = 0;
  const Controller = loadFreshController({
    ipcMain,
    fetchWeather: async (settings) => {
      fetchCalls += 1;
      return { active: true, city: settings.city };
    },
    processSettingsChange: async (settings) => {
      geocodeCalls += 1;
      if (settings.city === 'Tokyo') {
        return { ...settings, lat: 35.68, lon: 139.76 };
      }
      if (settings.city === 'Kyoto') {
        return { ...settings, lat: 35.01, lon: 135.77 };
      }
      if (settings.city === 'Osaka') {
        return { ...settings, lat: 34.69, lon: 135.50 };
      }
      return settings;
    },
  });

  const { deps, storeListeners } = createDependencies({
    ...DEFAULT_SETTINGS,
    enabled: true,
    city: '',
  });
  let settingsSetCalls = 0;
  const store = deps.StoreManager.getStore();
  const baseSet = store.set;
  store.set = (key, value) => {
    if (key === 'weatherSyncSettings') {
      settingsSetCalls += 1;
    }
    return baseSet(key, value);
  };
  Controller.init(deps);

  stubTimers();
  try {
    const cityResult = await Controller.setCityName('Tokyo');
    await flushMicrotasks();
    assert.deepEqual(cityResult, { success: true, city: 'Tokyo' });
    assert.equal(fetchCalls, 1, 'setCityName must fetch once without self-write re-entrancy');
    assert.equal(geocodeCalls, 1);
    assert.equal(settingsSetCalls, 1);

    await Controller.updateWeatherSyncSettings({
      ...Controller.getWeatherSyncSettings(),
      city: 'Kyoto',
      lat: null,
      lon: null,
      refreshIntervalMinutes: 30,
    });
    await flushMicrotasks();
    assert.equal(fetchCalls, 2, 'updateWeatherSyncSettings must fetch once without self-write re-entrancy');
    assert.equal(geocodeCalls, 2);
    assert.equal(settingsSetCalls, 2);

    storeListeners.weatherSyncSettings({
      ...DEFAULT_SETTINGS,
      enabled: true,
      city: 'Osaka',
      lat: null,
      lon: null,
    });
    await flushMicrotasks();
    assert.equal(Controller.getWeatherSyncSettings().city, 'Osaka');
    assert.equal(Controller.getWeatherSyncSettings().lat, 34.69);
    assert.equal(fetchCalls, 3, 'external store.onDidChange must still trigger updateWeatherSyncSettings');
    assert.equal(geocodeCalls, 3);
    assert.equal(settingsSetCalls, 3);
  } finally {
    restoreTimers();
  }
});
