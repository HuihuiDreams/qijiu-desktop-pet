const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createPresentationGuard } = require('../src/main/services/PresentationGuard');

// Execute the production wiring with the real guard; stub native APIs and
// service factories so these tests need neither Electron nor live timers.
function loadWiredGuard(mode, screen, getActiveWindowInfo) {
  let guard;
  const electron = {
    app: { commandLine: { appendSwitch() {} } },
    protocol: { registerSchemesAsPrivileged() {} },
    ipcMain: { on() {} },
    powerMonitor: { on() {} },
    screen,
  };
  const windowAwareness = { getLastPayload: getActiveWindowInfo };
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
  test(`${mode} wiring converts physical bounds with Electron's two-argument API`, () => {
    const displayBounds = { x: 1920, y: 0, width: 1280, height: 720 };
    const physicalBounds = { x: 1920, y: 0, width: 1920, height: 1080 };
    let convertedBounds = { x: 2000, y: 100, width: 600, height: 400 };
    const calls = [];
    const info = {
      active: true,
      sampledAt: Date.now(),
      window: { bounds: physicalBounds, isFullScreen: false, isMaximized: false },
    };
    const guard = loadWiredGuard(mode, {
      getAllDisplays: () => [{ bounds: displayBounds, workArea: displayBounds, scaleFactor: 1.5 }],
      screenToDipRect(...args) {
        calls.push(args);
        if (args.length !== 2 || args[0] !== null) {
          throw new TypeError('Expected screenToDipRect(null, rect)');
        }
        return convertedBounds;
      },
    }, () => info);

    assert.deepEqual(guard.canInterrupt(), { canInterrupt: true, reason: null });
    assert.deepEqual(calls, [[null, physicalBounds]], 'choose the display nearest the physical rect');

    convertedBounds = displayBounds;
    assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'presentation' });
    assert.deepEqual(calls[1], [null, physicalBounds]);

    info.window.isFullScreen = true;
    assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'fullscreen' });
    assert.equal(calls.length, 2, 'fullscreen detection must still reject before geometry conversion');
  });
}
