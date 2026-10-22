const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const WindowAwarenessService = require('../src/main/services/WindowAwarenessService');

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

test('WindowAwarenessService disabling stops sampling and sends disabled payload', () => {
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
