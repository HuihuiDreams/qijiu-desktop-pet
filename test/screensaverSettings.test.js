/**
 * test/screensaverSettings.test.js
 * Settings test suite for CP Secret Screensaver feature (Step 5).
 * Tests settings normalization, store synchronization, dynamic runtime updates,
 * Tray menu sub-menu construction, and multi-language i18n dictionary checks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeScreensaverSettings,
  createScreensaverController,
  DEFAULT_SETTINGS,
} = require('../src/main/services/ScreensaverController');
const { SCREENSAVER_STORE_KEY } = require('../src/main/constants');
const { I18N } = require('../src/data/i18n');

function createMockStore(initialData = {}) {
  const data = { ...initialData };
  const listeners = {};
  return {
    get: (key) => data[key],
    set: (key, val) => {
      data[key] = val;
      if (listeners[key]) {
        listeners[key].forEach((fn) => fn(val));
      }
    },
    onDidChange: (key, fn) => {
      listeners[key] = listeners[key] || [];
      listeners[key].push(fn);
      return () => {
        if (listeners[key]) {
          listeners[key] = listeners[key].filter((l) => l !== fn);
        }
      };
    },
    _data: data,
  };
}

function createMockPowerMonitor(initialIdle = 0) {
  let idleTime = initialIdle;
  return {
    getSystemIdleTime: () => idleTime,
    setIdleTime: (s) => { idleTime = s; },
    on: () => {},
    removeListener: () => {},
  };
}

function createMockWindow() {
  const sentEvents = [];
  return {
    window: {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, ...args) => {
          sentEvents.push({ channel, args });
        },
      },
    },
    sentEvents,
  };
}

test('Screensaver Settings - Normalization Unit Tests', async (t) => {
  await t.test('returns defaults for null, undefined, or non-object inputs', () => {
    assert.deepEqual(normalizeScreensaverSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(normalizeScreensaverSettings(undefined), DEFAULT_SETTINGS);
    assert.deepEqual(normalizeScreensaverSettings('invalid'), DEFAULT_SETTINGS);
    assert.deepEqual(normalizeScreensaverSettings(123), DEFAULT_SETTINGS);
  });

  await t.test('validates and clamps idleThresholdMinutes within 1..60', () => {
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 1 }).idleThresholdMinutes, 1);
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 60 }).idleThresholdMinutes, 60);
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 10.5 }).idleThresholdMinutes, 10);
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 0 }).idleThresholdMinutes, 5);
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 100 }).idleThresholdMinutes, 5);
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: -5 }).idleThresholdMinutes, 5);
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: NaN }).idleThresholdMinutes, 5);
    assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: Infinity }).idleThresholdMinutes, 5);
  });

  await t.test('normalizes enabled flag properly', () => {
    assert.equal(normalizeScreensaverSettings({ enabled: true }).enabled, true);
    assert.equal(normalizeScreensaverSettings({ enabled: false }).enabled, false);
    assert.equal(normalizeScreensaverSettings({ enabled: 'true' }).enabled, false);
    assert.equal(normalizeScreensaverSettings({}).enabled, false);
  });
});

test('Screensaver Settings - Store Persistence & Dynamic Synchronization', async (t) => {
  await t.test('loads stored settings on controller start', () => {
    const store = createMockStore({
      [SCREENSAVER_STORE_KEY]: { enabled: true, idleThresholdMinutes: 10 },
    });
    const storeManager = { getStore: () => store };

    const controller = createScreensaverController({
      StoreManager: storeManager,
    });

    controller.start();
    assert.deepEqual(controller.getSettings(), { enabled: true, idleThresholdMinutes: 10 });
    controller.dispose();
  });

  await t.test('updates store when updateSettings is called', () => {
    const store = createMockStore();
    const storeManager = { getStore: () => store };

    const controller = createScreensaverController({
      StoreManager: storeManager,
    });

    controller.start();
    controller.updateSettings({ enabled: true, idleThresholdMinutes: 30 });

    assert.deepEqual(controller.getSettings(), { enabled: true, idleThresholdMinutes: 30 });
    assert.deepEqual(store._data[SCREENSAVER_STORE_KEY], { enabled: true, idleThresholdMinutes: 30 });

    controller.dispose();
  });

  await t.test('listens to store.onDidChange and syncs runtime settings', () => {
    const store = createMockStore();
    const storeManager = { getStore: () => store };

    const controller = createScreensaverController({
      StoreManager: storeManager,
    });

    controller.start();
    store.set(SCREENSAVER_STORE_KEY, { enabled: true, idleThresholdMinutes: 15 });

    assert.deepEqual(controller.getSettings(), { enabled: true, idleThresholdMinutes: 15 });

    controller.dispose();
  });

  await t.test('disabling screensaver mid-session cancels active session with settings-disabled', () => {
    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };
    const coordinator = { tryAcquire: () => true, release: () => true };

    const controller = createScreensaverController({
      powerMonitor,
      interruptionCoordinator: coordinator,
      eligibilityGuard: guard,
      getMainWindow: () => mockWin.window,
    });

    controller.updateSettings({ enabled: true, idleThresholdMinutes: 5 });
    controller.start();

    controller._poll();
    assert.equal(controller.getState().state, 'active');

    // Disable screensaver mid-session
    controller.updateSettings({ enabled: false, idleThresholdMinutes: 5 });
    assert.equal(controller.getState().state, 'inactive');
    assert.equal(mockWin.sentEvents.some((e) => e.channel === 'screensaver-cancel' && e.args[0].reason === 'settings-disabled'), true);

    controller.dispose();
  });
});

test('Screensaver Settings - Tray Menu & i18n Localization', async (t) => {
  await t.test('i18n dictionaries contain non-empty CP Screensaver tray keys for zh, en, ja', () => {
    const locales = ['zh', 'en', 'ja'];
    const requiredKeys = ['trayScreensaverOn', 'trayScreensaverOff', 'trayScreensaverThreshold'];

    locales.forEach((locale) => {
      assert.ok(I18N[locale], `Locale ${locale} exists`);
      assert.ok(I18N[locale].ui, `Locale ${locale}.ui exists`);

      requiredKeys.forEach((key) => {
        const val = I18N[locale].ui[key];
        assert.ok(typeof val === 'string' && val.length > 0, `Key ${key} in locale ${locale} is a non-empty string`);
      });
    });
  });

  await t.test('Tray menu builds CP Screensaver submenu with enable toggle and threshold radios', () => {
    const TrayManager = require('../src/main/TrayManager');
    let currentSettings = { enabled: false, idleThresholdMinutes: 5 };

    TrayManager.init({
      I18N,
      getCurrentLocale: () => 'zh',
      getScreensaverSettings: () => currentSettings,
      updateScreensaverSettings: (s) => { currentSettings = s; },
      getPomodoroSnapshot: () => ({ status: 'idle' }),
      getUpdateMenuState: () => ({ enabled: true }),
      windowManager: { mainWindow: null },
      getIsPaused: () => false,
      getPomodoroPetHidden: () => false,
      isPetCurrentlyHidden: () => false,
      getCurrentPetDisplay: () => null,
      getBreakReminderEnabled: () => true,
      getBreakReminderIntervalMinutes: () => 60,
      BREAK_REMINDER_TRAY_INTERVALS: [30, 45, 60, 90, 120],
      getWeatherSyncSettings: () => ({ enabled: false }),
      getStoredWeatherSyncSettings: () => ({ enabled: false }),
      getWindowAwarenessEnabled: () => false,
      AutoLaunchService: { isAutoLaunchEnabled: () => false },
    });

    // Test initial disabled state
    assert.equal(TrayManager.trayT('trayScreensaverOff'), '💕 开启高甜屏保');
    assert.equal(TrayManager.trayT('trayScreensaverOn'), '💕 关闭高甜屏保');
    assert.equal(TrayManager.trayT('trayScreensaverThreshold'), '💕 屏保触发等待');
  });
});
