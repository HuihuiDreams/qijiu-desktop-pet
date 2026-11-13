const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let mockIpcListeners = {};
let mockScreenListeners = {};
let mockAppListeners = {};

class MockBrowserWindow {
  constructor(options) {
    this.options = options;
    this.destroyed = false;
    this.visible = false;
    this.minimized = false;
    this.alwaysOnTop = false;
    this.focused = false;
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
  isAlwaysOnTop() { return Boolean(this.alwaysOnTop); }
  isFocused() { return this.focused; }
  setAlwaysOnTop(v) { this.alwaysOnTop = v; }
  moveTop() {}
  setIgnoreMouseEvents(ignore) { this.ignoreMouseEvents = ignore; }
  restore() { this.minimized = false; }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  loadFile() {}
  setVisibleOnAllWorkspaces() {}
  on(evt, cb) { this.events[evt] = cb; }
  
  trigger(evt, ...args) {
    if (this.events[evt]) this.events[evt](...args);
  }
}

const electronMock = {
  BrowserWindow: MockBrowserWindow,
  app: { on: (event, callback) => { mockAppListeners[event] = callback; } },
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

const { setupElectronMock } = require('./helpers/mockElectron');
const restoreRequire = setupElectronMock(electronMock);

const windowManager = require('../src/main/windows/WindowManager');
const citySettingWindowModule = require('../src/main/windows/CitySettingWindow');
const PetWindow = require('../src/main/windows/PetWindow');
test.after(() => restoreRequire());

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
      getNativePayload: () => ({}),
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

  await t.test('a later call without leaseMs cancels the pending lease timer', async () => {
    const deps = createMockDeps();
    PetWindow.init(deps);

    windowManager.mainWindow = new MockBrowserWindow({});
    const mockEvent = { sender: windowManager.mainWindow.webContents };

    mockIpcListeners['set-ignore-mouse-events'](mockEvent, false, { leaseMs: 20 });
    mockIpcListeners['set-ignore-mouse-events'](mockEvent, false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(windowManager.mainWindow.ignoreMouseEvents, false, 'cancelled lease must not restore passthrough');

    // 对照：没有被取消的租约到期后会恢复穿透
    mockIpcListeners['set-ignore-mouse-events'](mockEvent, false, { leaseMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(windowManager.mainWindow.ignoreMouseEvents, true, 'expired lease restores passthrough');

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
    windowManager.petScaleWindow = null;
    windowManager.citySettingWindow = null;
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

  await t.test('createWindow passes the debug tools argument only when the app is not packaged', () => {
    const origPlatform = process.platform;
    const create = (isPackaged) => {
      const deps = createMockDeps();
      deps.app.isPackaged = isPackaged;
      PetWindow.init(deps);
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        PetWindow.createWindow();
      } finally {
        Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
      }
      const args = windowManager.mainWindow.options.webPreferences.additionalArguments;
      windowManager.mainWindow.trigger('closed');
      return args;
    };

    assert.deepEqual(create(false), ['--deskpet-debug-tools']);
    assert.deepEqual(create(true), []);
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

    windowManager.petScaleWindow = new MockBrowserWindow({});
    let petScaleClosed = false;
    windowManager.petScaleWindow.close = () => { petScaleClosed = true; };

    windowManager.updateProgressWindow = new MockBrowserWindow({});
    let updateProgressClosed = false;
    windowManager.updateProgressWindow.close = () => { updateProgressClosed = true; };

    PetWindow.startKeepOnTopWatcher();
    
    windowManager.mainWindow.trigger('closed');
    
    assert.equal(windowManager.mainWindow, null);
    assert.equal(statusClosed, true);
    assert.equal(cityClosed, true);
    assert.equal(petScaleClosed, true, 'the parentless pet scale window must not outlive the main window');
    assert.equal(updateProgressClosed, true, 'the update progress window must not outlive the main window');
    assert.equal(windowManager.updateProgressWindow, null);
    windowManager.petScaleWindow = null;
  });

  await t.test('closed event skips destroyed pet scale and missing update progress windows', () => {
    const deps = createMockDeps();
    PetWindow.init(deps);
    PetWindow.createWindow();

    windowManager.petScaleWindow = new MockBrowserWindow({});
    windowManager.petScaleWindow.destroyed = true;
    let petScaleClosed = false;
    windowManager.petScaleWindow.close = () => { petScaleClosed = true; };
    windowManager.updateProgressWindow = null;

    assert.doesNotThrow(() => windowManager.mainWindow.trigger('closed'));
    assert.equal(petScaleClosed, false);
    windowManager.petScaleWindow = null;
  });

  await t.test('keepPetWindowOnTop re-raises visible alwaysOnTop sub-windows and skips hidden/unpinned', () => {
    windowManager.mainWindow = new MockBrowserWindow({});
    const moveTopCalls = [];
    windowManager.mainWindow.moveTop = () => { moveTopCalls.push('mainWindow'); };

    // Visible & always-on-top sub-window (e.g. statusWindow)
    windowManager.statusWindow = new MockBrowserWindow({});
    windowManager.statusWindow.visible = true;
    windowManager.statusWindow.alwaysOnTop = true;
    windowManager.statusWindow.moveTop = () => { moveTopCalls.push('statusWindow'); };

    // Visible & always-on-top sub-window (e.g. pinned pomodoroWindow)
    windowManager.pomodoroWindow = new MockBrowserWindow({});
    windowManager.pomodoroWindow.visible = true;
    windowManager.pomodoroWindow.alwaysOnTop = true;
    windowManager.pomodoroWindow.moveTop = () => { moveTopCalls.push('pomodoroWindow'); };

    // Hidden sub-window (visible = false)
    windowManager.skinSelectorWindow = new MockBrowserWindow({});
    windowManager.skinSelectorWindow.visible = false;
    windowManager.skinSelectorWindow.alwaysOnTop = true;
    windowManager.skinSelectorWindow.moveTop = () => { moveTopCalls.push('skinSelectorWindow'); };

    // Unpinned sub-window (alwaysOnTop = false)
    windowManager.petScaleWindow = new MockBrowserWindow({});
    windowManager.petScaleWindow.visible = true;
    windowManager.petScaleWindow.alwaysOnTop = false;
    windowManager.petScaleWindow.moveTop = () => { moveTopCalls.push('petScaleWindow'); };

    // Destroyed sub-window
    windowManager.citySettingWindow = new MockBrowserWindow({});
    windowManager.citySettingWindow.destroyed = true;
    windowManager.citySettingWindow.visible = true;
    windowManager.citySettingWindow.alwaysOnTop = true;
    windowManager.citySettingWindow.moveTop = () => { moveTopCalls.push('citySettingWindow'); };

    PetWindow.keepPetWindowOnTop();

    assert.deepEqual(moveTopCalls, ['mainWindow', 'statusWindow', 'pomodoroWindow']);

    // Status was focused most recently; it must stay above the pinned pomodoro,
    // including after focus leaves the application.
    moveTopCalls.length = 0;
    windowManager.statusWindow.focused = true;
    windowManager.statusWindow.trigger('focus');
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(moveTopCalls, ['mainWindow', 'pomodoroWindow', 'statusWindow']);

    moveTopCalls.length = 0;
    windowManager.statusWindow.focused = false;
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(moveTopCalls, ['mainWindow', 'pomodoroWindow', 'statusWindow']);

    moveTopCalls.length = 0;
    windowManager.pomodoroWindow.trigger('focus');
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(moveTopCalls, ['mainWindow', 'statusWindow', 'pomodoroWindow']);
  });

  await t.test('focus before the first watcher tick is retained after leaving the app', () => {
    windowManager.mainWindow = new MockBrowserWindow({});
    windowManager.statusWindow = new MockBrowserWindow({});
    windowManager.pomodoroWindow = new MockBrowserWindow({});
    windowManager.skinSelectorWindow = null;
    windowManager.petScaleWindow = null;
    windowManager.citySettingWindow = null;
    const calls = [];
    for (const [name, win] of [['status', windowManager.statusWindow], ['pomodoro', windowManager.pomodoroWindow]]) {
      win.visible = true;
      win.alwaysOnTop = true;
      win.moveTop = () => calls.push(name);
    }
    mockAppListeners['browser-window-focus']({}, windowManager.pomodoroWindow);
    mockAppListeners['browser-window-focus']({}, windowManager.statusWindow);
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(calls, ['pomodoro', 'status']);
  });

  await t.test('fullscreen RDP hides the pet and prevents periodic or second-launch promotion until leaving RDP', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      for (const ownerName of ['mstsc', 'MSRDC.EXE']) {
        const deps = createMockDeps();
        let payload = { active: true, window: { ownerName, isFullScreen: true, isMinimized: false } };
        deps.WindowAwarenessService.getNativePayload = () => payload;
        let manualShows = 0;
        deps.PetVisibilityService.showPetManually = () => { manualShows++; };
        PetWindow.init(deps);
        PetWindow.createWindow();
        const win = windowManager.mainWindow;
        win.visible = true;
        let promotions = 0;
        win.moveTop = () => { promotions++; };
        windowManager.statusWindow = new MockBrowserWindow({});
        windowManager.statusWindow.visible = true;
        windowManager.statusWindow.alwaysOnTop = true;
        windowManager.statusWindow.moveTop = () => { promotions++; };
        windowManager.pomodoroWindow = new MockBrowserWindow({});
        windowManager.pomodoroWindow.visible = true;
        windowManager.pomodoroWindow.alwaysOnTop = true;
        windowManager.skinSelectorWindow = new MockBrowserWindow({});
        windowManager.skinSelectorWindow.alwaysOnTop = true;
        windowManager.petScaleWindow = new MockBrowserWindow({});
        windowManager.petScaleWindow.visible = true;

        PetWindow.onActiveWindowChanged();
        assert.equal(win.visible, false);
        assert.equal(win.alwaysOnTop, false);
        assert.equal(windowManager.statusWindow.visible, false);
        assert.equal(windowManager.pomodoroWindow.visible, false);
        assert.equal(windowManager.petScaleWindow.visible, true);
        PetWindow.keepPetWindowOnTop();
        PetWindow.showExistingInstance();
        assert.equal(win.visible, false);
        assert.equal(promotions, 0);
        assert.equal(manualShows, 0);

        // A transient provider failure must not expose the pet over RDP.
        payload = { active: false, reason: 'provider-failed' };
        PetWindow.keepPetWindowOnTop();
        assert.equal(win.visible, false);
        assert.equal(win.alwaysOnTop, false);
        assert.equal(windowManager.statusWindow.visible, false);

        // A destroyed window must not be reopened on restoration.
        windowManager.pomodoroWindow.destroyed = true;

        // Leaving fullscreen restores the native window without changing
        // renderer-owned manual/meeting/pomodoro visibility or input focus.
        payload = { active: true, window: { ownerName, isFullScreen: false } };
        PetWindow.onActiveWindowChanged();
        assert.equal(win.visible, true);
        assert.equal(win.alwaysOnTop, true);
        assert.equal(win.focused, false);
        assert.equal(manualShows, 0);
        assert.equal(windowManager.statusWindow.visible, true);
        assert.equal(windowManager.statusWindow.focused, false);
        assert.equal(windowManager.pomodoroWindow.visible, false);
        assert.equal(windowManager.skinSelectorWindow.visible, false);
        assert.equal(windowManager.petScaleWindow.visible, true);

        // Entering fullscreen RDP again and exiting via no-active-window (e.g. session disconnect
        // or closing the RDP window) also releases suppression and restores windows.
        payload = { active: true, window: { ownerName, isFullScreen: true, isMinimized: false } };
        PetWindow.onActiveWindowChanged();
        assert.equal(win.visible, false);
        assert.equal(windowManager.statusWindow.visible, false);

        payload = { active: false, reason: 'no-active-window' };
        PetWindow.onActiveWindowChanged();
        assert.equal(win.visible, true);
        assert.equal(win.alwaysOnTop, true);
        assert.equal(win.focused, false);
        assert.equal(manualShows, 0);
        assert.equal(windowManager.statusWindow.visible, true);
        assert.equal(windowManager.statusWindow.focused, false);

        windowManager.statusWindow = null;
        windowManager.pomodoroWindow = null;
        windowManager.skinSelectorWindow = null;
        windowManager.petScaleWindow = null;
        win.trigger('closed');
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });

  await t.test('RDP suppression is Windows-only and excludes windowed/minimized RDP and other fullscreen apps', () => {
    const originalPlatform = process.platform;
    try {
      for (const [platform, ownerName, isFullScreen, isMinimized] of [
        ['win32', 'mstsc', false, false],
        ['win32', 'mstsc', true, true],
        ['win32', 'chrome', true, false],
        ['win32', 'not-mstsc', true, false],
        ['darwin', 'mstsc', true, false],
      ]) {
        Object.defineProperty(process, 'platform', { value: platform, configurable: true });
        const deps = createMockDeps();
        deps.WindowAwarenessService.getNativePayload = () => ({
          active: true, window: { ownerName, isFullScreen, isMinimized },
        });
        PetWindow.init(deps);
        PetWindow.createWindow();
        const win = windowManager.mainWindow;
        win.visible = true;
        PetWindow.keepPetWindowOnTop();
        assert.equal(win.visible, true);
        assert.equal(win.alwaysOnTop, true);
        win.trigger('closed');
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });
});
