'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const SETTINGS_SERVICE_PATH = require.resolve('../src/main/services/SettingsService');
const AUTO_LAUNCH_PATH = require.resolve('../src/main/services/AutoLaunchService');
const BREAK_REMINDER_CONTROLLER_PATH = require.resolve('../src/main/services/BreakReminderController');
const LOCALE_SERVICE_PATH = require.resolve('../src/main/services/LocaleService');
const SKIN_SERVICE_PATH = require.resolve('../src/main/services/SkinService');

function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    on() {},
    invoke(channel, event, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler(event, ...args);
    },
  };
}

function createFakeWindow(id = 1) {
  const sentMessages = [];
  let destroyed = false;
  return {
    id,
    sentMessages,
    isDestroyed: () => destroyed,
    destroy: () => { destroyed = true; },
    webContents: {
      id,
      isDestroyed: () => destroyed,
      send: (channel, ...args) => sentMessages.push({ channel, args }),
    },
  };
}

function createFakeStore(initialData = {}) {
  const data = new Map(Object.entries(initialData));
  const listeners = new Map();
  return {
    data,
    get: (key) => data.get(key),
    set: (key, val) => {
      data.set(key, val);
      for (const fn of listeners.get(key) || []) fn(val);
    },
    has: (key) => data.has(key),
    onDidChange: (key, fn) => {
      const list = listeners.get(key) || [];
      list.push(fn);
      listeners.set(key, list);
      return () => {
        listeners.set(key, (listeners.get(key) || []).filter((item) => item !== fn));
      };
    },
  };
}

function createSettingsServiceFixture(overrides = {}) {
  const ipcMain = createFakeIpcMain();
  const settingsWindow = createFakeWindow(10);
  const otherWindow = createFakeWindow(20);
  const store = createFakeStore(overrides.initialStore || {});
  const calls = [];

  let currentLocale = overrides.locale || 'zh';
  let previewPercent = overrides.previewPercent ?? null;
  let committedPercent = overrides.committedPercent ?? 100;
  let windowAwarenessEnabled = overrides.windowAwarenessEnabled ?? true;
  let windowAwarenessSupported = overrides.windowAwarenessSupported ?? true;
  let weatherSettings = overrides.weatherSettings || { enabled: false, city: '', lat: null, lon: null, refreshIntervalMinutes: 60 };
  let breakReminderState = overrides.breakReminderState || { enabled: true, intervalMinutes: 60 };
  let screensaverState = overrides.screensaverState || { enabled: false, idleThresholdMinutes: 3 };
  let autoLaunchState = overrides.autoLaunchState || { enabled: false, preference: false, pendingApproval: false };
  let skinId = overrides.skinId || 'default';

  const windowManager = {
    settingsWindow,
    mainWindow: createFakeWindow(1),
  };

  delete require.cache[SETTINGS_SERVICE_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === SETTINGS_SERVICE_PATH && request === 'electron') {
      return { ipcMain };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let SettingsService;
  try {
    SettingsService = require(SETTINGS_SERVICE_PATH);
  } finally {
    Module._load = originalLoad;
  }

  const deps = {
    ipcMain,
    windowManager,
    StoreManager: { getStore: () => store },
    trayManager: { refreshTrayMenu: () => calls.push('refreshTrayMenu') },
    settingsWindowModule: {
      closeSettingsWindow: () => calls.push('closeSettingsWindow'),
    },
    skinSelectorWindowModule: {
      openSkinSelectorWindow: (opts) => calls.push(['openSkinSelectorWindow', opts]),
    },
    PetScaleService: {
      getPreviewPercent: () => previewPercent ?? committedPercent,
      getCommittedPercent: () => committedPercent,
      preview: (percent) => {
        previewPercent = percent;
        calls.push(['previewPetScale', percent]);
        return percent;
      },
      confirm: (percent) => {
        committedPercent = percent !== undefined ? percent : (previewPercent ?? committedPercent);
        previewPercent = null;
        calls.push(['confirmPetScale', committedPercent]);
        return committedPercent;
      },
    },
    LocaleService: {
      getCurrentLocale: () => currentLocale,
      changeLocale: async (lang) => {
        currentLocale = lang;
        calls.push(['changeLocale', lang]);
        return { success: true, locale: lang };
      },
    },
    WeatherSyncController: {
      getWeatherSyncSettings: () => ({ ...weatherSettings }),
      getStoredWeatherSyncSettings: () => ({ ...weatherSettings }),
      updateWeatherSyncSettings: async (next) => {
        weatherSettings = { ...weatherSettings, ...next };
        calls.push(['updateWeatherSyncSettings', weatherSettings]);
      },
      setCityName: overrides.setCityName || (async (city) => {
        weatherSettings = { ...weatherSettings, city: city.trim(), lat: 39.9, lon: 116.4 };
        calls.push(['setCityName', city]);
        return { success: true, city: city.trim() };
      }),
    },
    BreakReminderController: {
      BREAK_REMINDER_TRAY_INTERVALS: [30, 45, 60, 90, 120],
      getBreakReminderEnabled: () => breakReminderState.enabled,
      getBreakReminderIntervalMinutes: () => breakReminderState.intervalMinutes,
      updateBreakReminderSettings: (patch) => {
        breakReminderState = { ...breakReminderState, ...patch };
        calls.push(['updateBreakReminderSettings', patch]);
        return { success: true, settings: { ...breakReminderState, idleResetMinutes: 5 } };
      },
    },
    WindowAwarenessService: {
      isEnabled: () => windowAwarenessEnabled,
      isSupported: () => windowAwarenessSupported,
      setWindowAwarenessEnabled: (enabled) => {
        windowAwarenessEnabled = Boolean(enabled);
        calls.push(['setWindowAwarenessEnabled', windowAwarenessEnabled]);
      },
    },
    AutoLaunchService: {
      getAutoLaunchState: () => ({ ...autoLaunchState }),
      setAutoLaunchPreference: overrides.setAutoLaunchPreference || (async (enabled) => {
        autoLaunchState = { enabled: Boolean(enabled), preference: Boolean(enabled), pendingApproval: false };
        calls.push(['setAutoLaunchPreference', enabled]);
        return { success: true, preference: Boolean(enabled), loginItem: { openAtLogin: Boolean(enabled) } };
      }),
    },
    SkinService: {
      getCurrentSkinId: () => skinId,
      getSkinDisplayName: (id) => `Display:${id}`,
    },
    getScreensaverSettings: () => ({ ...screensaverState }),
    updateScreensaverSettings: (next) => {
      screensaverState = { ...screensaverState, ...next };
      calls.push(['updateScreensaverSettings', screensaverState]);
    },
  };

  SettingsService.init(deps);

  return {
    SettingsService,
    ipcMain,
    settingsWindow,
    otherWindow,
    windowManager,
    store,
    calls,
    setAutoLaunchState: (next) => { autoLaunchState = next; },
    setWindowAwarenessSupported: (val) => { windowAwarenessSupported = val; },
    settingsEvent: { sender: settingsWindow.webContents },
    otherEvent: { sender: otherWindow.webContents },
  };
}

test('SettingsService rejects unauthorized callers across every settings-* IPC channel', async () => {
  const fixture = createSettingsServiceFixture();
  const { ipcMain, otherEvent, settingsWindow } = fixture;

  assert.equal(await ipcMain.invoke('settings-get-snapshot', otherEvent), null);

  const mutationChannels = [
    ['settings-preview-pet-scale', 110],
    ['settings-commit-pet-scale', 110],
    ['settings-reset-pet-scale'],
    ['settings-set-window-awareness', false],
    ['settings-set-weather-enabled', true],
    ['settings-set-city-name', 'Beijing'],
    ['settings-set-break-reminder', { enabled: false }],
    ['settings-set-screensaver', { enabled: true }],
    ['settings-set-locale', 'en'],
    ['settings-set-auto-launch', true],
    ['settings-open-skin-selector'],
    ['settings-close-window'],
  ];

  for (const [channel, arg] of mutationChannels) {
    const res = await ipcMain.invoke(channel, otherEvent, arg);
    assert.equal(res.success, false, `${channel} must reject unauthorized caller`);
    assert.equal(res.error.code, 'FORBIDDEN', `${channel} must return FORBIDDEN`);
  }

  // Destroyed settingsWindow is also rejected
  settingsWindow.destroy();
  const destroyedRes = await ipcMain.invoke('settings-reset-pet-scale', { sender: settingsWindow.webContents });
  assert.equal(destroyedRes.success, false);
  assert.equal(destroyedRes.error.code, 'FORBIDDEN');
});

test('SettingsService.getSnapshot returns all 7 config groups, confirmed skin, and platform flags', async () => {
  const fixture = createSettingsServiceFixture({
    locale: 'en',
    committedPercent: 120,
    skinId: 'birds',
    windowAwarenessEnabled: false,
    windowAwarenessSupported: true,
    weatherSettings: { enabled: true, city: 'Tokyo', lat: 35.68, lon: 139.76, refreshIntervalMinutes: 60 },
    breakReminderState: { enabled: true, intervalMinutes: 45 },
    screensaverState: { enabled: true, idleThresholdMinutes: 10 },
    autoLaunchState: { enabled: false, preference: true, pendingApproval: true },
  });

  const snapshot = await fixture.ipcMain.invoke('settings-get-snapshot', fixture.settingsEvent);
  assert.deepEqual(snapshot, {
    locale: 'en',
    petScale: {
      currentPercent: 120,
      committedPercent: 120,
      defaultPercent: 100,
      minPercent: 50,
      maxPercent: 150,
      stepPercent: 5,
    },
    skin: { id: 'birds', displayName: 'Display:birds' },
    windowAwareness: { enabled: false, supported: true },
    weather: { enabled: true, city: 'Tokyo' },
    breakReminder: {
      enabled: true,
      intervalMinutes: 45,
      allowedIntervals: [30, 45, 60, 90, 120],
    },
    screensaver: {
      enabled: true,
      idleThresholdMinutes: 10,
      allowedThresholds: [1, 3, 5, 10, 15, 30],
    },
    autoLaunch: { enabled: false, preference: true, pendingApproval: true },
  });
});

test('SettingsService validates and normalizes IPC arguments and rejects invalid inputs', async () => {
  const fixture = createSettingsServiceFixture();
  const { ipcMain, settingsEvent, setWindowAwarenessSupported } = fixture;

  // Pet scale validation & clamping
  assert.equal((await ipcMain.invoke('settings-preview-pet-scale', settingsEvent, 'bad')).error.code, 'VALIDATION_ERROR');
  assert.equal((await ipcMain.invoke('settings-preview-pet-scale', settingsEvent, NaN)).error.code, 'VALIDATION_ERROR');
  assert.equal((await ipcMain.invoke('settings-preview-pet-scale', settingsEvent, 173)).data.percent, 150);
  assert.equal((await ipcMain.invoke('settings-commit-pet-scale', settingsEvent, 42)).data.percent, 50);
  assert.equal((await ipcMain.invoke('settings-reset-pet-scale', settingsEvent)).data.percent, 100);

  // Window awareness validation & unsupported platform
  assert.equal((await ipcMain.invoke('settings-set-window-awareness', settingsEvent, 'yes')).error.code, 'VALIDATION_ERROR');
  setWindowAwarenessSupported(false);
  assert.equal((await ipcMain.invoke('settings-set-window-awareness', settingsEvent, true)).error.code, 'UNSUPPORTED_PLATFORM');
  setWindowAwarenessSupported(true);
  assert.equal((await ipcMain.invoke('settings-set-window-awareness', settingsEvent, false)).data.enabled, false);

  // Break reminder & screensaver allowlists
  assert.equal((await ipcMain.invoke('settings-set-break-reminder', settingsEvent, { intervalMinutes: 25 })).error.code, 'VALIDATION_ERROR');
  assert.equal((await ipcMain.invoke('settings-set-break-reminder', settingsEvent, {})).error.code, 'VALIDATION_ERROR');
  assert.equal((await ipcMain.invoke('settings-set-break-reminder', settingsEvent, { intervalMinutes: 90 })).data.breakReminder.intervalMinutes, 90);

  assert.equal((await ipcMain.invoke('settings-set-screensaver', settingsEvent, { idleThresholdMinutes: 60 })).error.code, 'VALIDATION_ERROR');
  assert.equal((await ipcMain.invoke('settings-set-screensaver', settingsEvent, { enabled: true, idleThresholdMinutes: 15 })).data.screensaver.idleThresholdMinutes, 15);

  // Locale validation
  assert.equal((await ipcMain.invoke('settings-set-locale', settingsEvent, 'fr')).error.code, 'VALIDATION_ERROR');
  assert.equal((await ipcMain.invoke('settings-set-locale', settingsEvent, 'ja')).data.locale, 'ja');

  // Weather empty city prompt & geocode failure
  const weatherOn = await ipcMain.invoke('settings-set-weather-enabled', settingsEvent, true);
  assert.equal(weatherOn.success, true);
  assert.equal(weatherOn.data.enabled, true);
  assert.equal(weatherOn.data.needsCityPrompt, true);

  assert.equal((await ipcMain.invoke('settings-set-city-name', settingsEvent, '   ')).error.code, 'VALIDATION_ERROR');
  assert.equal((await ipcMain.invoke('settings-set-city-name', settingsEvent, 'Beijing')).data.city, 'Beijing');
});

test('SettingsService auto-launch propagates pendingApproval and returns authoritative snapshot on failure', async () => {
  const fixture = createSettingsServiceFixture({
    autoLaunchState: { enabled: false, preference: false, pendingApproval: false },
    setAutoLaunchPreference: async () => {
      fixture.setAutoLaunchState({ enabled: false, preference: false, pendingApproval: false });
      return { success: false, preference: false, loginItem: { openAtLogin: false } };
    },
  });

  const failed = await fixture.ipcMain.invoke('settings-set-auto-launch', fixture.settingsEvent, true);
  assert.equal(failed.success, false);
  assert.equal(failed.error.code, 'AUTO_LAUNCH_FAILED');
  assert.equal(failed.snapshot.autoLaunch.enabled, false);

  // Pending approval on macOS
  const pendingFixture = createSettingsServiceFixture({
    setAutoLaunchPreference: async () => {
      pendingFixture.setAutoLaunchState({ enabled: false, preference: true, pendingApproval: true });
      return { success: true, pendingApproval: true, preference: true, loginItem: { status: 'requires-approval' } };
    },
  });
  const pendingRes = await pendingFixture.ipcMain.invoke('settings-set-auto-launch', pendingFixture.settingsEvent, true);
  assert.equal(pendingRes.success, true);
  assert.equal(pendingRes.data.pendingApproval, true);
  assert.equal(pendingRes.data.snapshot.autoLaunch.pendingApproval, true);
});

test('SettingsService opens skin selector with fromSettings: true and pushes store changes', async () => {
  const fixture = createSettingsServiceFixture();
  const res = await fixture.ipcMain.invoke('settings-open-skin-selector', fixture.settingsEvent);
  assert.equal(res.success, true);
  assert.deepEqual(fixture.calls.at(-1), ['openSkinSelectorWindow', { fromSettings: true }]);

  fixture.settingsWindow.sentMessages.length = 0;
  fixture.store.set('petScalePercent', 130);
  await Promise.resolve();
  assert.equal(fixture.settingsWindow.sentMessages.length, 1);
  assert.equal(fixture.settingsWindow.sentMessages[0].channel, 'settings-updated');
});

test('SettingsService coalesces repeated change notifications within one tick into the latest snapshot', async () => {
  const fixture = createSettingsServiceFixture();
  const { SettingsService } = fixture;
  fixture.settingsWindow.sentMessages.length = 0;

  // one user action typically fires store.onDidChange, a service callback and the IPC handler itself
  fixture.store.set('petScalePercent', 130);
  SettingsService.notifySettingsUpdated();
  SettingsService.notifySettingsUpdated();
  assert.equal(fixture.settingsWindow.sentMessages.length, 0, 'push is deferred to the end of the tick');

  await Promise.resolve();
  assert.equal(fixture.settingsWindow.sentMessages.length, 1);

  // a later change after the flush produces a new push
  SettingsService.notifySettingsUpdated();
  await Promise.resolve();
  assert.equal(fixture.settingsWindow.sentMessages.length, 2);
});

test('settings snapshot no longer duplicates platform flags at the top level', async () => {
  const fixture = createSettingsServiceFixture();
  const snapshot = await fixture.ipcMain.invoke('settings-get-snapshot', fixture.settingsEvent);
  assert.equal('windowAwarenessSupported' in snapshot, false);
  assert.equal('autoLaunchPendingApproval' in snapshot, false);
  assert.equal(typeof snapshot.windowAwareness.supported, 'boolean');
  assert.equal(typeof snapshot.autoLaunch.pendingApproval, 'boolean');
});

test('AppLifecycle exposes app.openSettingsForQA next to app.openSkinSelectorForQA', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8');
  assert.match(source, /app\.openSkinSelectorForQA\s*=\s*skinSelectorWindowModule\.openSkinSelectorWindow;/);
  assert.match(source, /app\.openSettingsForQA\s*=\s*settingsWindowModule\.openSettingsWindow;/);
});

test('PetScaleService supports confirm(percent) and flushPreview() while keeping confirm() compatible', () => {
  const { createPetScaleService } = require('../src/main/services/PetScaleService');
  const fakeStore = createFakeStore({ petScalePercent: 100 });
  const scaleChanges = [];

  const service = createPetScaleService({
    StoreManager: { getStore: () => fakeStore },
    windowManager: { mainWindow: createFakeWindow(1) },
    onScaleChanged: (p) => scaleChanges.push(p),
  }, { registerIpc: false });

  assert.equal(service.getPreviewPercent(), 100);
  assert.equal(service.flushPreview(), 100);
  assert.equal(scaleChanges.length, 0);

  service.preview(125);
  assert.equal(service.getPreviewPercent(), 125);
  assert.equal(service.getCommittedPercent(), 100);
  assert.equal(service.flushPreview(), 125);
  assert.equal(service.getCommittedPercent(), 125);
  assert.equal(fakeStore.get('petScalePercent'), 125);
  assert.deepEqual(scaleChanges, [125]);

  // Direct confirm(percent) skips preview step and normalizes
  assert.equal(service.confirm(142), 140);
  assert.equal(fakeStore.get('petScalePercent'), 140);
  assert.deepEqual(scaleChanges, [125, 140]);
});

test('BreakReminderController.updateBreakReminderSettings validates intervals and preserves idleResetMinutes', () => {
  const store = createFakeStore({
    breakReminderSettings: { enabled: true, intervalMinutes: 60, idleResetMinutes: 14 },
  });
  let trayRefreshes = 0;
  let settingsChangedCount = 0;
  const controllerPath = BREAK_REMINDER_CONTROLLER_PATH;
  delete require.cache[controllerPath];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === controllerPath && request === 'electron') {
      return {
        ipcMain: { on: () => {} },
        powerMonitor: { on: () => {}, getSystemIdleTime: () => 0, getSystemIdleState: () => 'active' },
        screen: { getAllDisplays: () => [] },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const controller = require(controllerPath);
    controller.init({
      StoreManager: { getStore: () => store },
      PetVisibilityService: { isPetCurrentlyHidden: () => false },
      WindowAwarenessService: { getLastPayload: () => null },
      windowManager: { mainWindow: createFakeWindow(1) },
      trayManager: { refreshTrayMenu: () => { trayRefreshes += 1; } },
      onSettingsChanged: () => { settingsChangedCount += 1; },
    });

    const invalid = controller.updateBreakReminderSettings({ intervalMinutes: 25 });
    assert.equal(invalid.success, false);

    const updated = controller.updateBreakReminderSettings({ enabled: false, intervalMinutes: 90 });
    assert.equal(updated.success, true);
    assert.deepEqual(updated.settings, { enabled: false, intervalMinutes: 90, idleResetMinutes: 14 });
    assert.deepEqual(store.get('breakReminderSettings'), { enabled: false, intervalMinutes: 90, idleResetMinutes: 14 });
    assert.equal(trayRefreshes, 1);
    assert.equal(settingsChangedCount, 1);
    controller.getBreakReminderService()?.stop?.();
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
});

test('AutoLaunchService exports isLoginItemPendingApproval and getAutoLaunchState()', () => {
  const store = createFakeStore({ autoLaunch: true });
  delete require.cache[AUTO_LAUNCH_PATH];
  const originalLoad = Module._load;
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === AUTO_LAUNCH_PATH && request === 'electron') {
      return {
        app: {
          isPackaged: true,
          getLoginItemSettings: () => ({ openAtLogin: true, status: 'requires-approval' }),
          setLoginItemSettings: () => {},
        },
      };
    }
    if (parent?.filename === AUTO_LAUNCH_PATH && request === './StoreManager') {
      return { getStore: () => store };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const AutoLaunchService = require(AUTO_LAUNCH_PATH);
    assert.equal(typeof AutoLaunchService.isLoginItemPendingApproval, 'function');
    assert.equal(AutoLaunchService.isLoginItemPendingApproval({ status: 'requires-approval' }), true);
    assert.deepEqual(AutoLaunchService.getAutoLaunchState(), {
      enabled: false,
      preference: true,
      pendingApproval: true,
    });
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    Module._load = originalLoad;
    delete require.cache[AUTO_LAUNCH_PATH];
  }
});

test('SkinService only fires onSkinConfirmed on confirm, not on preview or cancel', async () => {
  const ipcMain = createFakeIpcMain();
  const mainWindow = createFakeWindow(1);
  const skinSelectorWindow = createFakeWindow(2);
  let originalSkinId = 'default';
  const confirmedNotifications = [];

  delete require.cache[SKIN_SERVICE_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === SKIN_SERVICE_PATH && request === 'electron') {
      return { ipcMain, app: { getAppPath: () => __dirname } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const SkinService = require(SKIN_SERVICE_PATH);
    SkinService.init({
      windowManager: { mainWindow, skinSelectorWindow },
      skinSelectorWindowModule: {
        setSkinSelectorSelectionInProgress: () => {},
        getSkinSelectorOriginalSkinId: () => originalSkinId,
        setSkinSelectorOriginalSkinId: (v = null) => { originalSkinId = v; },
        closeSkinSelectorWindow: () => {},
      },
      trayManager: { refreshTrayMenu: () => {}, trayT: (k) => k },
      sendPomodoroState: () => {},
      availableSkins: ['default', 'birds'],
      onSkinConfirmed: (skinId) => confirmedNotifications.push(skinId),
    });

    const selectorEvent = { sender: skinSelectorWindow.webContents };
    const mainEvent = { sender: mainWindow.webContents };

    await ipcMain.invoke('preview-skin', selectorEvent, 'birds');
    assert.equal(confirmedNotifications.length, 0, 'preview must not notify settings');

    await ipcMain.invoke('cancel-skin', selectorEvent);
    assert.equal(confirmedNotifications.length, 0, 'cancel/revert must not notify settings');

    await ipcMain.invoke('preview-skin', selectorEvent, 'birds');
    const lastMsg = mainWindow.sentMessages.at(-1);
    await ipcMain.invoke('report-skin-loaded', mainEvent, 'birds', { success: true, requestId: lastMsg.args[1].requestId });
    await ipcMain.invoke('confirm-skin', selectorEvent);
    assert.deepEqual(confirmedNotifications, ['birds']);
  } finally {
    Module._load = originalLoad;
    delete require.cache[SKIN_SERVICE_PATH];
  }
});

test('LocaleService.changeLocale updates settingsWindow alongside other windows', async () => {
  const ipcMain = createFakeIpcMain();
  const settingsWindow = createFakeWindow(10);
  const mainWindow = createFakeWindow(1);
  const store = createFakeStore();
  let localeChangedNotifications = 0;

  delete require.cache[LOCALE_SERVICE_PATH];
  const originalLoad = Module._load;
  Module._load = function mockLoader(request, parent, isMain) {
    if (parent?.filename === LOCALE_SERVICE_PATH && request === 'electron') {
      return { ipcMain, app: { getLocale: () => 'zh-CN' } };
    }
    if (parent?.filename === LOCALE_SERVICE_PATH && request === './StoreManager') {
      return { initStore: async () => {}, getStore: () => store };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const LocaleService = require(LOCALE_SERVICE_PATH);
    LocaleService.init({
      windowManager: { mainWindow, settingsWindow },
      trayManager: { refreshTrayMenu: () => {} },
      onLocaleChanged: () => { localeChangedNotifications += 1; },
    });

    const res = await LocaleService.changeLocale('en');
    assert.deepEqual(res, { success: true, locale: 'en' });
    assert.deepEqual(settingsWindow.sentMessages.at(-1), { channel: 'locale-changed', args: ['en'] });
    assert.deepEqual(mainWindow.sentMessages.at(-1), { channel: 'locale-changed', args: ['en'] });
    assert.equal(localeChangedNotifications, 1);
    assert.equal(ipcMain.invoke('get-locale', { sender: settingsWindow.webContents }), 'en');
  } finally {
    Module._load = originalLoad;
    delete require.cache[LOCALE_SERVICE_PATH];
  }
});
