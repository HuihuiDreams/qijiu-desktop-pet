const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let mockIpcListeners = {};
let mockScreenListeners = {};

class MockBrowserWindow {
  constructor(options) {
    this.options = options;
    this.destroyed = false;
    this.visible = false;
    this.minimized = false;
    this.alwaysOnTop = false;
    this.ignoreMouseEvents = false;
    this.events = {};
    
    this.webContents = {
      session: {
        clearCache: async () => {}
      },
      on: (evt, cb) => { this.events[`webContents_${evt}`] = cb; },
      send: () => {},
      setWindowOpenHandler: () => {},
      isDestroyed: () => false
    };
  }
  
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isMinimized() { return this.minimized; }
  setAlwaysOnTop(v) { this.alwaysOnTop = v; }
  moveTop() {}
  setIgnoreMouseEvents(ignore) { this.ignoreMouseEvents = ignore; }
  restore() { this.minimized = false; }
  showInactive() { this.visible = true; }
  loadFile() {}
  setVisibleOnAllWorkspaces() {}
  on(evt, cb) { this.events[evt] = cb; }
  
  trigger(evt, ...args) {
    if (this.events[evt]) this.events[evt](...args);
  }
}

const electronMock = {
  BrowserWindow: MockBrowserWindow,
  ipcMain: {
    on: (channel, cb) => {
      mockIpcListeners[channel] = cb;
    }
  },
  screen: {
    getPrimaryDisplay: () => ({ id: 'primary' }),
    on: (evt, cb) => { mockScreenListeners[evt] = cb; },
    removeListener: (evt, cb) => {
      if (mockScreenListeners[evt] === cb) delete mockScreenListeners[evt];
    }
  }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') return electronMock;
  return originalRequire.apply(this, arguments);
};

const windowManager = require('../src/main/windows/WindowManager');
const citySettingWindowModule = require('../src/main/windows/CitySettingWindow');
const PetWindow = require('../src/main/windows/PetWindow');

function createMockDeps() {
  return {
    DisplayService: {
      setCurrentPetDisplay: () => {},
      getDesktopWindowBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      lockPetWindowToBounds: () => {},
      sendScreenInfo: () => {},
      stopDragPoll: () => {},
      displayFitScheduler: { schedule: () => {}, clear: () => {} }
    },
    WindowAwarenessService: {
      sendActiveWindowInfo: () => {},
      getLastPayload: () => ({}),
      stopActiveWindowAwareness: () => {},
      startActiveWindowAwareness: () => {}
    },
    PetVisibilityService: {
      isPetCurrentlyHidden: () => false,
      sendPetVisibility: () => {},
      showPetManually: () => {}
    },
    MeetingDetectorController: {
      startMeetingDetector: () => {}
    },
    WeatherSyncController: {
      updateWeatherSyncSettings: () => {},
      getWeatherSyncSettings: () => ({})
    },
    app: {
      getVersion: () => '1.0.0',
      isPackaged: true,
      commandLine: { hasSwitch: () => false }
    },
    StoreManager: {
      getStore: () => ({
        get: () => '1.0.0',
        set: () => {}
      })
    }
  };
}

test('PetWindow - Initialization and IPC', async (t) => {
  t.beforeEach(() => {
    mockIpcListeners = {};
    windowManager.mainWindow = null;
  });

  await t.test('init registers ipc listeners', () => {
    const deps = createMockDeps();
    PetWindow.init(deps);
    
    assert.ok(mockIpcListeners['set-ignore-mouse-events'], 'Should register set-ignore-mouse-events');
  });

  await t.test('set-ignore-mouse-events handler normalizes and sets mouse passthrough', () => {
    const deps = createMockDeps();
    PetWindow.init(deps);
    
    windowManager.mainWindow = new MockBrowserWindow({});
    const mockEvent = { sender: windowManager.mainWindow.webContents };
    
    mockIpcListeners['set-ignore-mouse-events'](mockEvent, true, { forward: true });
    assert.equal(windowManager.mainWindow.ignoreMouseEvents, true);
    
    mockIpcListeners['set-ignore-mouse-events'](mockEvent, false, { leaseMs: 10 });
    assert.equal(windowManager.mainWindow.ignoreMouseEvents, false);
    
    const invalidEvent = { sender: {} };
    windowManager.mainWindow.ignoreMouseEvents = true; 
    mockIpcListeners['set-ignore-mouse-events'](invalidEvent, false, {});
    assert.equal(windowManager.mainWindow.ignoreMouseEvents, true);
    
    windowManager.mainWindow.trigger('closed'); // clean timers
  });
});

test('PetWindow - Lifecycle and Methods', async (t) => {
  t.beforeEach(() => {
    mockScreenListeners = {};
    windowManager.mainWindow = null;
    windowManager.statusWindow = null;
    windowManager.pomodoroWindow = null;
    windowManager.skinSelectorWindow = null;
    // VERY IMPORTANT TO PREVENT REAL CitySettingWindow from executing and triggering electron issues
    citySettingWindowModule.closeCitySettingWindow = () => {};
  });
  
  t.afterEach(() => {
    if (windowManager.mainWindow) {
      windowManager.mainWindow.trigger('closed'); // clean timers
    }
  });

  await t.test('createWindow sets up the window and event listeners', () => {
    const deps = createMockDeps();
    PetWindow.init(deps);
    
    const origPlatform = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      PetWindow.createWindow();
    } finally {
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    }
    
    assert.ok(windowManager.mainWindow);
    assert.equal(windowManager.mainWindow.options.transparent, true);
    assert.equal(windowManager.mainWindow.options.alwaysOnTop, true);
    
    windowManager.mainWindow.trigger('webContents_did-finish-load');
    assert.equal(windowManager.mainWindow.alwaysOnTop, true);
    
    windowManager.mainWindow.alwaysOnTop = false;
    windowManager.mainWindow.trigger('show');
    assert.equal(windowManager.mainWindow.alwaysOnTop, true);
    
    windowManager.mainWindow.alwaysOnTop = false;
    windowManager.mainWindow.trigger('restore');
    assert.equal(windowManager.mainWindow.alwaysOnTop, true);
  });

  await t.test('showExistingInstance brings window to front', () => {
    const deps = createMockDeps();
    PetWindow.init(deps);
    
    windowManager.mainWindow = new MockBrowserWindow({});
    windowManager.mainWindow.minimized = true;
    windowManager.mainWindow.visible = false;
    
    let petShown = false;
    deps.PetVisibilityService.showPetManually = () => { petShown = true; };
    
    PetWindow.showExistingInstance();
    
    assert.equal(windowManager.mainWindow.minimized, false);
    assert.equal(windowManager.mainWindow.visible, true);
    assert.equal(windowManager.mainWindow.alwaysOnTop, true);
    assert.equal(petShown, true);
  });

  await t.test('closed event cleans up resources', () => {
    const deps = createMockDeps();
    PetWindow.init(deps);
    PetWindow.createWindow();
    
    windowManager.statusWindow = new MockBrowserWindow({});
    let statusClosed = false;
    windowManager.statusWindow.close = () => { statusClosed = true; };
    
    let cityClosed = false;
    citySettingWindowModule.closeCitySettingWindow = () => { cityClosed = true; };
    
    PetWindow.startKeepOnTopWatcher();
    
    windowManager.mainWindow.trigger('closed');
    
    assert.equal(windowManager.mainWindow, null);
    assert.equal(statusClosed, true);
    assert.equal(cityClosed, true);
  });
});
