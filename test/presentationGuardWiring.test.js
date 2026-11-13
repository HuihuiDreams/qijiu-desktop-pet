const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createPresentationGuard } = require('../src/main/services/PresentationGuard');
const { setupElectronMock } = require('./helpers/mockElectron');

function loadFreshWindowAwarenessService(screen) {
  const servicePath = require.resolve('../src/main/services/WindowAwarenessService');
  delete require.cache[servicePath];
  const restoreRequire = setupElectronMock({
    ipcMain: { handle() {} },
    screen,
  });
  try {
    return require('../src/main/services/WindowAwarenessService');
  } finally {
    restoreRequire();
    delete require.cache[servicePath];
  }
}

// Execute the production wiring across WindowAwarenessService + AppLifecycle/BreakReminderController + PresentationGuard.
function loadWiredGuard(mode, screen, windowAwareness) {
  let guard;
  const electron = {
    app: { commandLine: { appendSwitch() {} } },
    protocol: { registerSchemesAsPrivileged() {} },
    ipcMain: { on() {} },
    powerMonitor: { on() {} },
    screen,
  };
  const dependencies = {
    electron,
    './services/WindowAwarenessService': windowAwareness,
    './services/PresentationGuard': { createPresentationGuard },
    './PresentationGuard': { createPresentationGuard },
    './services/InterruptionCoordinator': { createInterruptionCoordinator: () => ({}) },
    './services/ScreensaverController': {
      createScreensaverController: (deps) => {
        guard = deps.eligibilityGuard;
        return { start() {} };
      },
    },
    '../../../breakReminderService': {
      normalizeSettings: () => ({ enabled: true, intervalMinutes: 60 }),
      createBreakReminderService: (deps) => {
        guard = deps.presentationGuard;
        return { start() {} };
      },
    },
  };
  const relativePath = mode === 'screensaver'
    ? '../src/main/AppLifecycle.js'
    : '../src/main/services/BreakReminderController.js';
  const filename = path.join(__dirname, relativePath);
  const context = {
    module: { exports: {} },
    require: (id) => dependencies[id] || {},
    process: { platform: 'win32' },
    Date,
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  if (mode === 'screensaver') {
    context.module.exports.initScreensaverSystem();
  } else {
    context.module.exports.init({
      StoreManager: { getStore: () => null },
      PetVisibilityService: { isPetCurrentlyHidden: () => false },
      WindowAwarenessService: windowAwareness,
      windowManager: {},
    });
  }
  return guard;
}

for (const mode of ['screensaver', 'break-reminder']) {
  test(`${mode} wiring converts physical bounds once in WindowAwarenessService without double conversion in guard`, async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const primaryDisplay = {
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      workArea: { x: 0, y: 0, width: 2560, height: 1392 },
      scaleFactor: 1.5,
    };
    const secondaryDisplay = {
      bounds: { x: 2560, y: 0, width: 1080, height: 1920 },
      workArea: { x: 2560, y: 0, width: 1080, height: 1872 },
      scaleFactor: 1,
    };
    const displays = [primaryDisplay, secondaryDisplay];
    const physicalWindow = { x: 150, y: 150, width: 1200, height: 900 };
    let convertedBounds = { x: 100, y: 100, width: 800, height: 600 };
    const calls = [];

    const mockInfo = {
      active: true,
      sampledAt: Date.now(),
      source: 'active-window',
      window: {
        id: '9',
        title: 'Mixed DPI Test',
        ownerName: 'POWERPNT',
        bounds: physicalWindow,
        isFullScreen: false,
        isMaximized: false,
        isMinimized: false,
      },
    };

    const screen = {
      getAllDisplays: () => displays,
      screenToDipRect(...args) {
        calls.push(args);
        if (args.length !== 2 || args[0] !== null) {
          throw new TypeError('Expected screenToDipRect(null, rect)');
        }
        return convertedBounds;
      },
    };

    const windowAwareness = loadFreshWindowAwarenessService(screen);
    windowAwareness.init({
      windowManager: { mainWindow: { isDestroyed: () => false, webContents: { send() {} } } },
      trayManager: { refreshTrayMenu() {} },
      getActiveWindowDisplays: () => displays,
      getActiveWindowMainBounds: () => ({ x: 0, y: 0, width: 3640, height: 1920 }),
      createActiveWindowProvider: () => ({
        async getActiveWindowInfo() {
          return {
            ...mockInfo,
            sampledAt: Date.now(),
            window: { ...mockInfo.window },
          };
        },
        dispose() {},
      }),
    });

    try {
      windowAwareness.setWindowAwarenessEnabled(true);
      await new Promise((resolve) => setImmediate(resolve));

      const guard = loadWiredGuard(mode, screen, windowAwareness);

      assert.deepEqual(guard.canInterrupt(), { canInterrupt: true, reason: null });
      assert.deepEqual(calls, [[null, physicalWindow]], 'screenToDipRect called once during sampling');

      mockInfo.window.bounds = { x: 0, y: 0, width: 3840, height: 2160 };
      convertedBounds = primaryDisplay.bounds;
      windowAwareness.startActiveWindowAwareness();
      await new Promise((resolve) => setImmediate(resolve));

      assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'presentation' });
      assert.equal(calls.length, 2, 'guard check must reuse sampled DIP bounds instead of calling screenToDipRect again');

      mockInfo.window.isFullScreen = true;
      windowAwareness.startActiveWindowAwareness();
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'fullscreen' });
      assert.equal(calls.length, 3, 'third sample converted once; guard calls add zero conversions');
    } finally {
      windowAwareness.stopActiveWindowAwareness();
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });
}
