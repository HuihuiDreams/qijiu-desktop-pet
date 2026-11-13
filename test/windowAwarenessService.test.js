const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const { setupElectronMock } = require('./helpers/mockElectron');
const ipcHandlers = {};
const restoreRequire = setupElectronMock({
  ipcMain: { handle: (channel, callback) => { ipcHandlers[channel] = callback; } },
});
const WindowAwarenessService = require('../src/main/services/WindowAwarenessService');
const { createPresentationGuard } = require('../src/main/services/PresentationGuard');
restoreRequire();

function createMockProvider() {
  return {
    async getActiveWindowInfo() {
      return {
        active: true,
        sampledAt: Date.now(),
        source: 'test',
        window: {
          id: '1',
          title: 'Test',
          ownerName: 'test',
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          isMinimized: false,
          isMaximized: false,
          isFullScreen: false,
        },
      };
    },
    dispose() {},
  };
}

test('WindowAwarenessService suspends and resumes with powerMonitor', async () => {
  const powerMonitor = new EventEmitter();

  const mockMainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: () => {},
    },
  };

  WindowAwarenessService.init({
    windowManager: { mainWindow: mockMainWindow },
    trayManager: { refreshTrayMenu: () => {} },
    getActiveWindowDisplays: () => [],
    getActiveWindowMainBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    createActiveWindowProvider: () => createMockProvider(),
    powerMonitor,
  });

  WindowAwarenessService.startActiveWindowAwareness();
  assert.equal(WindowAwarenessService.isEnabled(), true);

  // Trigger suspend
  powerMonitor.emit('suspend');
  // Suspend stops awareness
  assert.equal(WindowAwarenessService.getLastPayload(), undefined);

  // Trigger resume
  powerMonitor.emit('resume');
  assert.equal(WindowAwarenessService.isEnabled(), true);
  assert.ok(WindowAwarenessService.getLastPayload(), 'sampling should be restored on resume when window is alive');

  WindowAwarenessService.stopActiveWindowAwareness();
});

test('WindowAwarenessService resume does not restart sampling if main window is destroyed', async () => {
  const powerMonitor = new EventEmitter();

  let isDestroyed = false;
  const mockMainWindow = {
    isDestroyed: () => isDestroyed,
    webContents: {
      send: () => {},
    },
  };

  WindowAwarenessService.init({
    windowManager: { mainWindow: mockMainWindow },
    trayManager: { refreshTrayMenu: () => {} },
    getActiveWindowDisplays: () => [],
    getActiveWindowMainBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    createActiveWindowProvider: () => createMockProvider(),
    powerMonitor,
  });

  WindowAwarenessService.startActiveWindowAwareness();
  assert.ok(WindowAwarenessService.getLastPayload());

  // Suspend
  powerMonitor.emit('suspend');
  assert.equal(WindowAwarenessService.getLastPayload(), undefined);

  // Window gets destroyed while suspended
  isDestroyed = true;

  // Resume fires
  powerMonitor.emit('resume');
  assert.equal(WindowAwarenessService.getLastPayload(), undefined, 'sampling should not restart if window is destroyed');

  WindowAwarenessService.stopActiveWindowAwareness();
});

test('WindowAwarenessService disabling sends disabled payload', () => {
  let sentPayload = null;
  const mockMainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (_channel, data) => { sentPayload = data; },
    },
  };

  WindowAwarenessService.init({
    windowManager: { mainWindow: mockMainWindow },
    trayManager: { refreshTrayMenu: () => {} },
    getActiveWindowDisplays: () => [],
    getActiveWindowMainBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    createActiveWindowProvider: () => createMockProvider(),
  });

  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  try {
    WindowAwarenessService.setWindowAwarenessEnabled(false);
    assert.equal(WindowAwarenessService.isEnabled(), false);
    assert.equal(sentPayload.active, false);
    assert.equal(sentPayload.reason, 'disabled');

    // restore
    WindowAwarenessService.setWindowAwarenessEnabled(true);
    assert.equal(WindowAwarenessService.isEnabled(), true);
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    WindowAwarenessService.stopActiveWindowAwareness();
  }
});

test('Windows retains native RDP sampling and resumes it while renderer window awareness is disabled', async () => {
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  const powerMonitor = new EventEmitter();
  const sentPayloads = [];
  let providerCount = 0;
  let nativeChanges = 0;
  const webContents = {
    isDestroyed: () => false,
    send: (_channel, payload) => sentPayloads.push(payload),
  };
  try {
    WindowAwarenessService.init({
      windowManager: {
        mainWindow: {
          isDestroyed: () => false,
          webContents,
        },
      },
      trayManager: { refreshTrayMenu: () => {} },
      getActiveWindowDisplays: () => [],
      getActiveWindowMainBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      createActiveWindowProvider: () => {
        providerCount++;
        return {
          async getActiveWindowInfo() {
            const info = await createMockProvider().getActiveWindowInfo();
            info.window.ownerName = 'mstsc';
            info.window.isFullScreen = true;
            return info;
          },
          dispose() {},
        };
      },
      onActiveWindowChanged: () => { nativeChanges++; },
      powerMonitor,
    });
    WindowAwarenessService.setWindowAwarenessEnabled(false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(providerCount, 1);
    assert.equal(nativeChanges, 1);
    assert.equal(WindowAwarenessService.getLastPayload().reason, 'disabled');
    assert.equal(WindowAwarenessService.getNativePayload().window.ownerName, 'mstsc');
    for (const mode of ['break-reminder', 'screensaver']) {
      const guard = createPresentationGuard({
        platform: 'win32',
        getActiveWindowInfo: () => WindowAwarenessService.getLastPayload(),
      }, { mode });
      assert.equal(guard.canInterrupt().canInterrupt, true);
    }
    assert.ok(sentPayloads.every((payload) => payload.active === false && payload.reason === 'disabled'));
    const ipcPayload = await ipcHandlers['get-active-window-info']({ sender: webContents });
    assert.equal(ipcPayload.active, false);
    assert.equal(ipcPayload.reason, 'disabled');
    assert.equal(ipcPayload.window, null);

    powerMonitor.emit('suspend');
    assert.equal(WindowAwarenessService.getLastPayload(), undefined);
    powerMonitor.emit('resume');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(providerCount, 2);
    assert.equal(nativeChanges, 2);
    assert.equal(WindowAwarenessService.isEnabled(), false);
    assert.equal(WindowAwarenessService.getLastPayload().reason, 'disabled');
    assert.equal(WindowAwarenessService.getNativePayload().window.ownerName, 'mstsc');
    WindowAwarenessService.setWindowAwarenessEnabled(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(WindowAwarenessService.getLastPayload().window.ownerName, 'mstsc');
  } finally {
    WindowAwarenessService.setWindowAwarenessEnabled(true);
    WindowAwarenessService.stopActiveWindowAwareness();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  }
});

test('WindowAwarenessService converts raw bounds to DIP once for both PresentationGuard and surface platform', async () => {
  const mixedDisplays = [
    {
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      workArea: { x: 0, y: 0, width: 2560, height: 1392 },
      scaleFactor: 1.5,
    },
    {
      bounds: { x: 2560, y: 0, width: 1080, height: 1920 },
      workArea: { x: 2560, y: 0, width: 1080, height: 1872 },
      scaleFactor: 1,
    },
  ];
  const rawPhysicalBounds = { x: 3840, y: 0, width: 1080, height: 1920 };
  const dipConvertedBounds = { x: 2560, y: 0, width: 1080, height: 1920 };
  let conversionCalls = 0;

  WindowAwarenessService.init({
    windowManager: {
      mainWindow: {
        isDestroyed: () => false,
        webContents: { send: () => {} },
      },
    },
    trayManager: { refreshTrayMenu: () => {} },
    getActiveWindowDisplays: () => mixedDisplays,
    getActiveWindowMainBounds: () => ({ x: 0, y: 0, width: 3640, height: 1920 }),
    screenToDipRect: (rect) => {
      conversionCalls += 1;
      assert.deepEqual(rect, rawPhysicalBounds);
      return dipConvertedBounds;
    },
    createActiveWindowProvider: () => ({
      async getActiveWindowInfo() {
        return {
          active: true,
          sampledAt: Date.now(),
          source: 'active-window',
          window: {
            id: '42',
            title: 'Presentation Window',
            ownerName: 'POWERPNT',
            bounds: rawPhysicalBounds,
            isMinimized: false,
            isMaximized: false,
            isFullScreen: false,
          },
        };
      },
      dispose() {},
    }),
  });

  try {
    WindowAwarenessService.setWindowAwarenessEnabled(true);
    await new Promise((resolve) => setImmediate(resolve));

    const payload = WindowAwarenessService.getLastPayload();
    assert.equal(conversionCalls, 1);
    assert.deepEqual(payload.window.bounds, dipConvertedBounds);

    const guard = createPresentationGuard({
      platform: 'win32',
      getActiveWindowInfo: () => WindowAwarenessService.getLastPayload(),
      getDisplays: () => mixedDisplays,
    }, { mode: 'screensaver' });
    assert.deepEqual(guard.canInterrupt(), { canInterrupt: false, reason: 'presentation' });
    assert.equal(conversionCalls, 1);
  } finally {
    WindowAwarenessService.stopActiveWindowAwareness();
  }
});
