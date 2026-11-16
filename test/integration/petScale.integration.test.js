'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const { createIntegrationHarness } = require('./harness/createIntegrationHarness');
const { PET_SCALE_STORE_KEY } = require('../../src/main/constants');
const {
  PET_SCALE_DEFAULT_PERCENT,
  PET_SCALE_MIN_PERCENT,
  PET_SCALE_MAX_PERCENT,
  PET_SCALE_STEP_PERCENT,
} = require('../../ipcContracts');

const SETTINGS_WINDOW_PATH = require.resolve('../../src/main/windows/SettingsWindow');
const SETTINGS_SERVICE_PATH = require.resolve('../../src/main/services/SettingsService');
const PET_SCALE_SERVICE_PATH = require.resolve('../../src/main/services/PetScaleService');

/**
 * Loads SettingsWindow, SettingsService, and PetScaleService wired together to the harness.
 */
function loadPetScaleIntegration(harness) {
  const originalLoad = Module._load;

  delete require.cache[SETTINGS_WINDOW_PATH];
  delete require.cache[SETTINGS_SERVICE_PATH];
  delete require.cache[PET_SCALE_SERVICE_PATH];

  class TestBrowserWindow {
    constructor(options) {
      const win = harness.createMockWindow(2, options);
      Object.assign(this, win);
      this.close = () => {
        win.close();
      };
    }
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { focus: () => {} },
        BrowserWindow: TestBrowserWindow,
        screen: {
          getCursorScreenPoint: () => ({ x: 100, y: 100 }),
          getDisplayNearestPoint: () => ({
            workArea: { x: 0, y: 0, width: 1920, height: 1080 },
          }),
        },
        ipcMain: harness.ipcMain,
      };
    }
    if (request === './WindowManager' && parent?.filename === SETTINGS_WINDOW_PATH) {
      return harness.windowManager;
    }
    if (request === '../services/PetScaleService' && parent?.filename === SETTINGS_WINDOW_PATH) {
      return require('../../src/main/services/PetScaleService');
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const PetScaleService = require('../../src/main/services/PetScaleService');
    const SettingsWindow = require('../../src/main/windows/SettingsWindow');
    const SettingsService = require('../../src/main/services/SettingsService');

    PetScaleService.init({
      windowManager: harness.windowManager,
      StoreManager: harness.StoreManager,
      ipcMain: harness.ipcMain,
      onScaleChanged: () => SettingsService.notifySettingsUpdated(),
    });

    SettingsWindow.init({
      flushPetScalePreview: PetScaleService.flushPreview,
    });

    SettingsService.init({
      ipcMain: harness.ipcMain,
      windowManager: harness.windowManager,
      StoreManager: harness.StoreManager,
      trayManager: { refreshTrayMenu: () => {} },
      settingsWindowModule: SettingsWindow,
      skinSelectorWindowModule: { openSkinSelectorWindow: () => {} },
      PetScaleService,
      LocaleService: { getCurrentLocale: () => 'zh', changeLocale: async (lang) => ({ success: true, locale: lang }) },
      WeatherSyncController: {
        getWeatherSyncSettings: () => ({ enabled: false, city: '' }),
        getStoredWeatherSyncSettings: () => ({ enabled: false, city: '' }),
        updateWeatherSyncSettings: async () => {},
        setCityName: async () => ({ success: false }),
      },
      BreakReminderController: {
        BREAK_REMINDER_TRAY_INTERVALS: [30, 45, 60, 90, 120],
        getBreakReminderEnabled: () => true,
        getBreakReminderIntervalMinutes: () => 60,
        updateBreakReminderSettings: () => ({ success: true, settings: {} }),
      },
      WindowAwarenessService: { isEnabled: () => true, isSupported: () => true, setWindowAwarenessEnabled: () => {} },
      AutoLaunchService: {
        getAutoLaunchState: () => ({ enabled: false, preference: false, pendingApproval: false }),
        setAutoLaunchPreference: async () => ({ success: true }),
      },
      SkinService: { getCurrentSkinId: () => 'default', getSkinDisplayName: () => 'default' },
      getScreensaverSettings: () => ({ enabled: false, idleThresholdMinutes: 3 }),
      updateScreensaverSettings: () => {},
    });

    return {
      PetScaleService,
      SettingsWindow,
      SettingsService,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('Integration: PetScale lifecycle through SettingsWindow and SettingsService (preview, commit, reset, close flush)', async (t) => {
  const harness = createIntegrationHarness({
    [PET_SCALE_STORE_KEY]: 110,
  });

  const { PetScaleService, SettingsWindow } = loadPetScaleIntegration(harness);

  await t.test('1. Initial state reads persisted value from Store and verifies IPC security', async () => {
    const scaleFromMain = await harness.ipcMain.invoke('get-pet-scale', harness.mainWindow);
    assert.equal(scaleFromMain, 110, 'Main window should retrieve persisted scale of 110%');

    const unauthorizedSender = harness.createMockWindow(999);
    const unauthorizedResult = await harness.ipcMain.invoke('get-pet-scale', unauthorizedSender);
    assert.equal(unauthorizedResult, null, 'Unauthorized window must be blocked by IpcSenderAuthorization');
  });

  await t.test('2. Opening SettingsWindow exposes snapshot scale settings only to SettingsWindow', async () => {
    const settingsWin = SettingsWindow.openSettingsWindow('appearance');
    assert.ok(settingsWin, 'SettingsWindow must be created');
    assert.equal(harness.windowManager.settingsWindow, settingsWin);

    const snapshot = await harness.ipcMain.invoke('settings-get-snapshot', settingsWin);
    assert.deepEqual(snapshot.petScale, {
      currentPercent: 110,
      committedPercent: 110,
      defaultPercent: PET_SCALE_DEFAULT_PERCENT,
      minPercent: PET_SCALE_MIN_PERCENT,
      maxPercent: PET_SCALE_MAX_PERCENT,
      stepPercent: PET_SCALE_STEP_PERCENT,
    });

    const blockedSnapshot = await harness.ipcMain.invoke('settings-get-snapshot', harness.mainWindow);
    assert.equal(blockedSnapshot, null, 'Settings snapshot must only be accessible to SettingsWindow');
  });

  await t.test('3. Previewing scale broadcasts pet-scale-changed without writing Store, and commit persists immediately', async () => {
    const settingsWin = harness.windowManager.settingsWindow;
    harness.mainWindow.webContents.clearSentMessages();

    const previewResult = await harness.ipcMain.invoke('settings-preview-pet-scale', settingsWin, 80);
    assert.equal(previewResult.success, true);
    assert.equal(previewResult.data.percent, 80);

    const lastBroadcast = harness.mainWindow.webContents.getLastMessage('pet-scale-changed');
    assert.ok(lastBroadcast, 'MainWindow must receive pet-scale-changed event');
    assert.equal(lastBroadcast.args[0], 80);
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 110, 'Preview must NOT write to Store');

    const commitResult = await harness.ipcMain.invoke('settings-commit-pet-scale', settingsWin, 80);
    assert.equal(commitResult.success, true);
    assert.equal(commitResult.data.percent, 80);
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 80, 'Commit must write to Store immediately');
    assert.equal(PetScaleService.getCommittedPercent(), 80);
  });

  await t.test('4. Reset restores 100% and closing SettingsWindow flushes uncommitted preview', async () => {
    const settingsWin = harness.windowManager.settingsWindow;
    const resetRes = await harness.ipcMain.invoke('settings-reset-pet-scale', settingsWin);
    assert.equal(resetRes.success, true);
    assert.equal(resetRes.data.percent, 100);
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 100);

    // Preview 135% without committing via change event, then close window -> flushPreview persists 135%
    await harness.ipcMain.invoke('settings-preview-pet-scale', settingsWin, 135);
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 100);

    SettingsWindow.closeSettingsWindow();
    assert.equal(settingsWin.isDestroyed(), true);
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 135, 'Close must flush uncommitted preview');

    const updatedScale = await harness.ipcMain.invoke('get-pet-scale', harness.mainWindow);
    assert.equal(updatedScale, 135);
  });
});
