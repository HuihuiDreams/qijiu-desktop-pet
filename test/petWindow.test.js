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
    windowManager.settingsWindow = null;
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

    windowManager.settingsWindow = new MockBrowserWindow({});
    let settingsClosed = false;
    windowManager.settingsWindow.close = () => { settingsClosed = true; };

    windowManager.updateProgressWindow = new MockBrowserWindow({});
    let updateProgressClosed = false;
    windowManager.updateProgressWindow.close = () => { updateProgressClosed = true; };

    PetWindow.startKeepOnTopWatcher();

    windowManager.mainWindow.trigger('closed');

    assert.equal(windowManager.mainWindow, null);
    assert.equal(statusClosed, true);
    assert.equal(settingsClosed, true, 'the parentless settings window must not outlive the main window');
    assert.equal(updateProgressClosed, true, 'the update progress window must not outlive the main window');
    assert.equal(windowManager.updateProgressWindow, null);
    windowManager.settingsWindow = null;
  });

  await t.test('closed event skips destroyed settings and missing update progress windows', () => {
    const deps = createMockDeps();
    PetWindow.init(deps);
    PetWindow.createWindow();

    windowManager.settingsWindow = new MockBrowserWindow({});
    windowManager.settingsWindow.destroyed = true;
    let settingsClosed = false;
    windowManager.settingsWindow.close = () => { settingsClosed = true; };
    windowManager.updateProgressWindow = null;

    assert.doesNotThrow(() => windowManager.mainWindow.trigger('closed'));
    assert.equal(settingsClosed, false);
    windowManager.settingsWindow = null;
  });

  await t.test('keepPetWindowOnTop re-raises above-pet sub-windows in focus order and keeps status/settings below pet', () => {
    windowManager.mainWindow = new MockBrowserWindow({});
    const moveTopCalls = [];
    windowManager.mainWindow.moveTop = () => { moveTopCalls.push('mainWindow'); };

    // Visible & always-on-top statusWindow and settingsWindow must stay below mainWindow
    windowManager.statusWindow = new MockBrowserWindow({});
    windowManager.statusWindow.visible = true;
    windowManager.statusWindow.alwaysOnTop = true;
    windowManager.statusWindow.moveTop = () => { moveTopCalls.push('statusWindow'); };

    windowManager.settingsWindow = new MockBrowserWindow({});
    windowManager.settingsWindow.visible = true;
    windowManager.settingsWindow.alwaysOnTop = true;
    windowManager.settingsWindow.moveTop = () => { moveTopCalls.push('settingsWindow'); };

    // Visible & always-on-top above-pet sub-windows (pomodoroWindow & skinSelectorWindow)
    windowManager.pomodoroWindow = new MockBrowserWindow({});
    windowManager.pomodoroWindow.visible = true;
    windowManager.pomodoroWindow.alwaysOnTop = true;
    windowManager.pomodoroWindow.moveTop = () => { moveTopCalls.push('pomodoroWindow'); };

    windowManager.skinSelectorWindow = new MockBrowserWindow({});
    windowManager.skinSelectorWindow.visible = true;
    windowManager.skinSelectorWindow.alwaysOnTop = true;
    windowManager.skinSelectorWindow.moveTop = () => { moveTopCalls.push('skinSelectorWindow'); };

    PetWindow.keepPetWindowOnTop();

    assert.deepEqual(moveTopCalls, ['mainWindow', 'pomodoroWindow', 'skinSelectorWindow']);

    // Skin selector was focused most recently; it must stay above pinned pomodoro,
    // including after focus leaves the application.
    moveTopCalls.length = 0;
    windowManager.skinSelectorWindow.focused = true;
    windowManager.skinSelectorWindow.trigger('focus');
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(moveTopCalls, ['mainWindow', 'pomodoroWindow', 'skinSelectorWindow']);

    moveTopCalls.length = 0;
    windowManager.skinSelectorWindow.focused = false;
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(moveTopCalls, ['mainWindow', 'pomodoroWindow', 'skinSelectorWindow']);

    moveTopCalls.length = 0;
    windowManager.pomodoroWindow.trigger('focus');
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(moveTopCalls, ['mainWindow', 'skinSelectorWindow', 'pomodoroWindow']);

    // Hidden or unpinned above-pet sub-windows are skipped
    moveTopCalls.length = 0;
    windowManager.skinSelectorWindow.visible = false;
    windowManager.pomodoroWindow.alwaysOnTop = false;
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(moveTopCalls, ['mainWindow']);
  });

  await t.test('focus before the first watcher tick is retained after leaving the app', () => {
    windowManager.mainWindow = new MockBrowserWindow({});
    windowManager.statusWindow = new MockBrowserWindow({});
    windowManager.pomodoroWindow = new MockBrowserWindow({});
    windowManager.skinSelectorWindow = new MockBrowserWindow({});
    windowManager.settingsWindow = null;
    const calls = [];
    for (const [name, win] of [
      ['status', windowManager.statusWindow],
      ['pomodoro', windowManager.pomodoroWindow],
      ['skinSelector', windowManager.skinSelectorWindow],
    ]) {
      win.visible = true;
      win.alwaysOnTop = true;
      win.moveTop = () => calls.push(name);
    }
    mockAppListeners['browser-window-focus']({}, windowManager.pomodoroWindow);
    mockAppListeners['browser-window-focus']({}, windowManager.skinSelectorWindow);
    mockAppListeners['browser-window-focus']({}, windowManager.statusWindow);
    PetWindow.keepPetWindowOnTop();
    assert.deepEqual(calls, ['pomodoro', 'skinSelector']);
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
        windowManager.settingsWindow = new MockBrowserWindow({});
        windowManager.settingsWindow.visible = true;

        PetWindow.onActiveWindowChanged();
        assert.equal(win.visible, false);
        assert.equal(win.alwaysOnTop, false);
        assert.equal(windowManager.statusWindow.visible, false);
        assert.equal(windowManager.pomodoroWindow.visible, false);
        assert.equal(windowManager.settingsWindow.visible, true);
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

        // A transient empty ownerName while suppressed must not expose the pet over RDP,
        // and repeated watcher ticks must not re-invoke setAlwaysOnTop(false) when already false.
        let setAlwaysOnTopCalls = 0;
        const originalSetAlwaysOnTop = win.setAlwaysOnTop.bind(win);
        win.setAlwaysOnTop = (v, level) => {
          setAlwaysOnTopCalls++;
          originalSetAlwaysOnTop(v, level);
        };
        payload = { active: true, window: { ownerName: '', isFullScreen: false, isMinimized: false } };
        PetWindow.onActiveWindowChanged();
        PetWindow.keepPetWindowOnTop();
        PetWindow.keepPetWindowOnTop();
        assert.equal(win.visible, false);
        assert.equal(win.alwaysOnTop, false);
        assert.equal(windowManager.statusWindow.visible, false);
        assert.equal(setAlwaysOnTopCalls, 0);

        // Switching to a real non-RDP window immediately releases suppression and restores the pet.
        payload = { active: true, window: { ownerName: 'chrome', isFullScreen: false } };
        PetWindow.onActiveWindowChanged();
        assert.equal(win.visible, true);
        assert.equal(win.alwaysOnTop, true);
        assert.equal(win.focused, false);
        assert.equal(windowManager.statusWindow.visible, true);

        // Re-enter fullscreen RDP before testing the remaining transitions.
        payload = { active: true, window: { ownerName, isFullScreen: true, isMinimized: false } };
        PetWindow.onActiveWindowChanged();
        assert.equal(win.visible, false);
        assert.equal(win.alwaysOnTop, false);

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
        assert.equal(windowManager.settingsWindow.visible, true);

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
        windowManager.settingsWindow = null;
        win.trigger('closed');
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });

  await t.test('a focused DeskPet sub-window opened during fullscreen RDP releases suppression instead of being hidden', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const deps = createMockDeps();
      // The sampler skips DeskPet's own foreground window and walks down the Z-order to the
      // fullscreen RDP, so the payload keeps reporting mstsc while a DeskPet sub-window has focus.
      deps.WindowAwarenessService.getNativePayload = () => ({
        active: true, window: { ownerName: 'mstsc', isFullScreen: true, isMinimized: false },
      });
      PetWindow.init(deps);
      PetWindow.createWindow();
      const win = windowManager.mainWindow;
      win.visible = true;
      const status = new MockBrowserWindow({});
      status.visible = true;
      status.alwaysOnTop = true;
      windowManager.statusWindow = status;
      PetWindow.onActiveWindowChanged();
      assert.equal(win.visible, false);
      assert.equal(status.visible, false);

      // Settings opened from the tray on another display: shown, pulsed above and focused,
      // then SettingsWindow re-asserts the pet through keepPetWindowOnTop().
      const settings = new MockBrowserWindow({});
      settings.visible = true;
      settings.alwaysOnTop = true;
      settings.focused = true;
      windowManager.settingsWindow = settings;
      PetWindow.keepPetWindowOnTop();
      assert.equal(settings.visible, true);
      assert.equal(win.visible, true);
      assert.equal(win.alwaysOnTop, true);
      assert.equal(status.visible, true);
      assert.equal(status.focused, false);

      // Later samples still report RDP; the focused sub-window keeps suppression released.
      PetWindow.onActiveWindowChanged();
      PetWindow.keepPetWindowOnTop();
      assert.equal(settings.visible, true);
      assert.equal(win.visible, true);

      // Clicking back into the RDP session blurs the sub-window and re-applies suppression.
      settings.focused = false;
      settings.alwaysOnTop = false; // SettingsWindow drops its pulse level on blur
      PetWindow.onActiveWindowChanged();
      assert.equal(win.visible, false);
      assert.equal(status.visible, false);
      assert.equal(settings.visible, true, 'a normal-level window stays below the RDP and is left alone');

      // Pomodoro opened from the tray (focused, pinned) survives the next sample as well.
      const pomodoro = new MockBrowserWindow({});
      pomodoro.visible = true;
      pomodoro.alwaysOnTop = true;
      pomodoro.focused = true;
      windowManager.pomodoroWindow = pomodoro;
      PetWindow.onActiveWindowChanged();
      assert.equal(pomodoro.visible, true);
      assert.equal(win.visible, true);
      assert.equal(status.visible, true);

      windowManager.statusWindow = null;
      windowManager.pomodoroWindow = null;
      windowManager.settingsWindow = null;
      win.trigger('closed');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });

  await t.test('a sub-window closed by the user during fullscreen RDP is not restored afterwards', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const deps = createMockDeps();
      let payload = { active: true, window: { ownerName: 'mstsc', isFullScreen: true, isMinimized: false } };
      deps.WindowAwarenessService.getNativePayload = () => payload;
      PetWindow.init(deps);
      PetWindow.createWindow();
      const win = windowManager.mainWindow;
      win.visible = true;
      const status = new MockBrowserWindow({});
      status.visible = true;
      status.alwaysOnTop = true;
      const pomodoro = new MockBrowserWindow({});
      pomodoro.visible = true;
      pomodoro.alwaysOnTop = true;
      windowManager.statusWindow = status;
      windowManager.pomodoroWindow = pomodoro;

      PetWindow.onActiveWindowChanged();
      assert.equal(PetWindow.isFullscreenRdpSuppressed(), true);
      assert.equal(status.visible, false);
      assert.equal(PetWindow.isHiddenForFullscreenRdp(status), true, 'hidden by RDP still counts as open');
      assert.equal(PetWindow.isHiddenForFullscreenRdp(windowManager.settingsWindow), false);

      // The tray status toggle closes the panel while it is hidden for RDP.
      PetWindow.forgetFullscreenRdpRestore(status);
      assert.equal(PetWindow.isHiddenForFullscreenRdp(status), false);

      payload = { active: true, window: { ownerName: 'chrome', isFullScreen: false } };
      PetWindow.onActiveWindowChanged();
      assert.equal(PetWindow.isFullscreenRdpSuppressed(), false);
      assert.equal(win.visible, true);
      assert.equal(status.visible, false, 'a panel closed during RDP must stay closed');
      assert.equal(pomodoro.visible, true, 'other RDP-hidden windows are still restored');
      assert.equal(PetWindow.isHiddenForFullscreenRdp(pomodoro), false);

      windowManager.statusWindow = null;
      windowManager.pomodoroWindow = null;
      win.trigger('closed');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });

  await t.test('leaving fullscreen RDP clears pet restore flag before sub-window showInactive re-entrancy', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const deps = createMockDeps();
      let payload = { active: true, window: { ownerName: 'mstsc', isFullScreen: true, isMinimized: false } };
      deps.WindowAwarenessService.getNativePayload = () => payload;
      PetWindow.init(deps);
      PetWindow.createWindow();
      const win = windowManager.mainWindow;
      win.visible = true;
      const events = [];
      const origMainShowInactive = win.showInactive.bind(win);
      win.showInactive = () => {
        events.push('main:showInactive');
        origMainShowInactive();
      };

      const status = new MockBrowserWindow({});
      status.visible = true;
      status.alwaysOnTop = true;
      const origStatusShowInactive = status.showInactive.bind(status);
      status.showInactive = () => {
        events.push('status:showInactive');
        origStatusShowInactive();
        // StatusWindow's 'show' listener synchronously calls keepPetWindowOnTop().
        PetWindow.keepPetWindowOnTop();
      };

      const pomodoro = new MockBrowserWindow({});
      pomodoro.visible = true;
      pomodoro.alwaysOnTop = true;
      const origPomodoroShowInactive = pomodoro.showInactive.bind(pomodoro);
      pomodoro.showInactive = () => {
        events.push('pomodoro:showInactive');
        origPomodoroShowInactive();
      };

      windowManager.statusWindow = status;
      windowManager.pomodoroWindow = pomodoro;

      PetWindow.onActiveWindowChanged();
      assert.equal(win.visible, false);
      assert.equal(status.visible, false);
      assert.equal(pomodoro.visible, false);

      payload = { active: true, window: { ownerName: 'chrome', isFullScreen: false } };
      PetWindow.onActiveWindowChanged();

      assert.deepEqual(events, ['status:showInactive', 'pomodoro:showInactive', 'main:showInactive']);
      assert.equal(win.visible, true);
      assert.equal(status.visible, true);
      assert.equal(pomodoro.visible, true);

      windowManager.statusWindow = null;
      windowManager.pomodoroWindow = null;
      win.trigger('closed');
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
