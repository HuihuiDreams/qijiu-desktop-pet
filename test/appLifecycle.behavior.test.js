const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const LIFECYCLE_PATH = require.resolve('../src/main/AppLifecycle');

function createCallableModule(name, methods, calls) {
  return Object.fromEntries(methods.map((method) => [method, (...args) => {
    calls.push([`${name}.${method}`, ...args]);
    if (method === 'initStore') return Promise.resolve();
    if (method === 'syncAutoLaunchPreference') return Promise.resolve();
    if (method === 'getStore') return {};
    if (method === 'getWeatherSyncSettings') return { enabled: false, city: '' };
    if (method === 'getUpdateMenuState') return {};
    return undefined;
  }]));
}

function createHarness() {
  const calls = [];
  const appEvents = {};
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const electron = {
    app: {
      commandLine: { appendSwitch: (...args) => calls.push(['app.appendSwitch', ...args]) },
      dock: { hide: () => calls.push(['app.dock.hide']) },
      on: (event, handler) => { appEvents[event] = handler; },
      whenReady: () => ready,
      setAppUserModelId: (id) => calls.push(['app.setAppUserModelId', id]),
      quit: () => calls.push(['app.quit']),
    },
    ipcMain: {},
    Menu: { setApplicationMenu: (menu) => calls.push(['Menu.setApplicationMenu', menu]) },
    dialog: {},
    protocol: { registerSchemesAsPrivileged: (schemes) => calls.push(['protocol.registerSchemes', schemes]) },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (handler) => calls.push(['session.setPermissionRequestHandler', handler]),
      },
    },
  };

  const services = {
    StoreManager: createCallableModule('StoreManager', ['initStore', 'getStore'], calls),
    AutoLaunchService: createCallableModule('AutoLaunchService', ['syncAutoLaunchPreference'], calls),
    SkinService: createCallableModule('SkinService', ['init', 'selectSkin', 'getCurrentSkinId', 'getSkinGalleryItems'], calls),
    LocaleService: createCallableModule('LocaleService', ['loadInitialLocale', 'getCurrentLocale', 'setCurrentLocale', 'init'], calls),
    StorageIpc: createCallableModule('StorageIpc', ['init'], calls),
    DisplayService: createCallableModule('DisplayService', ['init', 'getActiveWindowDisplays', 'getActiveWindowMainBounds', 'getCurrentPetDisplay', 'migrateWindowToDisplay'], calls),
    WindowAwarenessService: createCallableModule('WindowAwarenessService', ['init', 'isEnabled', 'setWindowAwarenessEnabled'], calls),
    PetVisibilityService: createCallableModule('PetVisibilityService', ['init', 'hidePetForMeeting', 'showPetAfterMeeting', 'getIsPaused', 'getPomodoroPetHidden', 'setPaused', 'isPetCurrentlyHidden', 'showPetManually', 'hidePetManually'], calls),
    MeetingDetectorController: createCallableModule('MeetingDetectorController', ['init', 'stopMeetingDetector'], calls),
    PomodoroService: createCallableModule('PomodoroService', ['init', 'stopPomodoroTicker', 'getPomodoroSnapshot', 'sendPomodoroState', 'getPomodoroSystem', 'startPomodoroSession', 'stopPomodoroSession'], calls),
    WeatherSyncController: createCallableModule('WeatherSyncController', ['init', 'getWeatherSyncSettings', 'getStoredWeatherSyncSettings', 'updateWeatherSyncSettings'], calls),
    BreakReminderController: createCallableModule('BreakReminderController', ['init', 'getBreakReminderEnabled', 'setBreakReminderEnabled', 'getBreakReminderIntervalMinutes', 'setBreakReminderIntervalMinutes', 'getBreakReminderService'], calls),
    statusWindowModule: createCallableModule('statusWindowModule', ['init'], calls),
    citySettingWindowModule: createCallableModule('citySettingWindowModule', ['init', 'openCitySettingWindow'], calls),
    skinSelectorWindowModule: createCallableModule('skinSelectorWindowModule', ['init', 'openSkinSelectorWindow', 'sendSkinSelectorData'], calls),
    pomodoroWindowModule: createCallableModule('pomodoroWindowModule', ['init', 'openPomodoroWindow'], calls),
    updateProgressWindowModule: createCallableModule('updateProgressWindowModule', ['init', 'showUpdateProgressWindow', 'setUpdateProgress', 'closeUpdateProgressWindow'], calls),
    petWindowModule: createCallableModule('petWindowModule', ['init', 'createWindow', 'showExistingInstance'], calls),
    trayManager: createCallableModule('trayManager', ['init', 'createTray', 'refreshTrayMenu', 'trayT', 'trayText'], calls),
  };
  services.BreakReminderController.BREAK_REMINDER_TRAY_INTERVALS = [30, 60];
  services.windowManager = { mainWindow: {} };

  return { calls, appEvents, electron, services, resolveReady };
}

function loadFreshLifecycle(harness) {
  const originalLoad = Module._load;
  delete require.cache[LIFECYCLE_PATH];
  const { services } = harness;
  const modules = {
    '../../updateManager': {
      initUpdateManager: (...args) => harness.calls.push(['initUpdateManager', ...args]),
      checkForUpdatesFromTray: () => {},
      getUpdateMenuState: () => ({}),
    },
    '../../ipcContracts': { createIpcFailure: () => {}, createIpcSuccess: () => {} },
    '../../protectedAssetProtocol': { registerProtectedAssetProtocol: (...args) => harness.calls.push(['registerProtectedAssetProtocol', ...args]) },
    '../../src/data/i18n': { I18N: {} },
    './services/StoreManager': services.StoreManager,
    './services/AutoLaunchService': services.AutoLaunchService,
    './services/SkinService': services.SkinService,
    './services/LocaleService': services.LocaleService,
    './services/StorageIpc': services.StorageIpc,
    './DisplayService': services.DisplayService,
    './services/WindowAwarenessService': services.WindowAwarenessService,
    './services/PetVisibilityService': services.PetVisibilityService,
    './services/MeetingDetectorController': services.MeetingDetectorController,
    './services/PomodoroService': services.PomodoroService,
    './services/WeatherSyncController': services.WeatherSyncController,
    './services/BreakReminderController': services.BreakReminderController,
    './windows/WindowManager': services.windowManager,
    './windows/StatusWindow': services.statusWindowModule,
    './windows/CitySettingWindow': services.citySettingWindowModule,
    './windows/SkinSelectorWindow': services.skinSelectorWindowModule,
    './windows/PomodoroWindow': services.pomodoroWindowModule,
    './windows/UpdateProgressWindow': services.updateProgressWindowModule,
    './windows/PetWindow': services.petWindowModule,
    './TrayManager': services.trayManager,
    './constants': { LOCALE_KEY: 'locale', BREAK_REMINDER_STORE_KEY: 'breakReminderSettings' },
  };

  Module._load = function loadAppLifecycleDependency(request, parent, isMain) {
    if (parent?.filename === LIFECYCLE_PATH && request === 'electron') return harness.electron;
    if (parent?.filename === LIFECYCLE_PATH && modules[request]) return modules[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    const AppLifecycle = require('../src/main/AppLifecycle');
    return {
      AppLifecycle,
      restore() {
        Module._load = originalLoad;
        delete require.cache[LIFECYCLE_PATH];
      },
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

function indexOfCall(calls, name) {
  return calls.findIndex(([callName]) => callName === name);
}

test('AppLifecycle initializes services before creating the pet window and tears down runtime services on quit', async () => {
  const harness = createHarness();
  const { AppLifecycle, restore } = loadFreshLifecycle(harness);
  try {
    AppLifecycle.init();
    assert.equal(typeof harness.appEvents['second-instance'], 'function');
    assert.equal(typeof harness.appEvents['before-quit'], 'function');
    assert.equal(typeof harness.appEvents['window-all-closed'], 'function');

    harness.resolveReady();
    await new Promise((resolve) => setImmediate(resolve));

    const createWindowIndex = indexOfCall(harness.calls, 'petWindowModule.createWindow');
    assert.ok(createWindowIndex >= 0);
    assert.ok(indexOfCall(harness.calls, 'StoreManager.initStore') < createWindowIndex);
    assert.ok(indexOfCall(harness.calls, 'WeatherSyncController.init') < createWindowIndex);
    assert.ok(indexOfCall(harness.calls, 'PetVisibilityService.init') < createWindowIndex);
    assert.ok(indexOfCall(harness.calls, 'MeetingDetectorController.init') < createWindowIndex);
    assert.ok(indexOfCall(harness.calls, 'petWindowModule.init') < createWindowIndex);
    assert.ok(indexOfCall(harness.calls, 'trayManager.createTray') > createWindowIndex);

    harness.appEvents['second-instance']();
    harness.appEvents['before-quit']();
    harness.appEvents['window-all-closed']();

    assert.notEqual(indexOfCall(harness.calls, 'petWindowModule.showExistingInstance'), -1);
    assert.notEqual(indexOfCall(harness.calls, 'MeetingDetectorController.stopMeetingDetector'), -1);
    assert.notEqual(indexOfCall(harness.calls, 'PomodoroService.stopPomodoroTicker'), -1);
    assert.notEqual(indexOfCall(harness.calls, 'app.quit'), -1);
  } finally {
    restore();
  }
});

test('AppLifecycle exposes 7 static initialization methods', () => {
  const harness = createHarness();
  const { AppLifecycle, restore } = loadFreshLifecycle(harness);
  try {
    assert.equal(typeof AppLifecycle.initPlatformSecurity, 'function');
    assert.equal(typeof AppLifecycle.initCoreServices, 'function');
    assert.equal(typeof AppLifecycle.initScreensaverSystem, 'function');
    assert.equal(typeof AppLifecycle.initFeatureServices, 'function');
    assert.equal(typeof AppLifecycle.initPetWindow, 'function');
    assert.equal(typeof AppLifecycle.initTray, 'function');
    assert.equal(typeof AppLifecycle.initSubWindowsAndIpc, 'function');
  } finally {
    restore();
  }
});

