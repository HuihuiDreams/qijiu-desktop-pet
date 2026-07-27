const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createScreensaverController,
  normalizeScreensaverSettings,
  DEFAULT_SETTINGS,
  MIN_IDLE_MINUTES,
  MAX_IDLE_MINUTES,
} = require('../src/main/services/ScreensaverController');
const { createInterruptionCoordinator } = require('../src/main/services/InterruptionCoordinator');
const { createScreensaverEligibilityGuard } = require('../src/main/services/ScreensaverEligibilityGuard');

function createFakeClock() {
  let time = 10000;
  const intervals = [];
  let nextId = 1;

  return {
    now: () => time,
    advance: (ms) => { time += ms; },
    setInterval: (fn, ms) => {
      const id = nextId++;
      intervals.push({ id, fn, ms, nextFire: time + ms });
      return id;
    },
    clearInterval: (id) => {
      const idx = intervals.findIndex((i) => i.id === id);
      if (idx >= 0) intervals.splice(idx, 1);
    },
    tick: () => {
      for (const item of [...intervals]) {
        if (time >= item.nextFire) {
          item.nextFire += item.ms;
          item.fn();
        }
      }
    },
    get pendingIntervals() { return intervals.length; },
  };
}

function createFakePowerMonitor(initialIdle = 0) {
  let idleTime = initialIdle;
  const listeners = new Map();

  return {
    getSystemIdleTime: () => idleTime,
    setIdleTime: (s) => { idleTime = s; },
    on: (event, fn) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    removeListener: (event, fn) => {
      if (listeners.has(event)) {
        const list = listeners.get(event);
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      }
    },
    emit: (event, ...args) => {
      if (listeners.has(event)) {
        for (const fn of listeners.get(event)) fn(...args);
      }
    },
    get listenerCount() {
      let count = 0;
      for (const list of listeners.values()) count += list.length;
      return count;
    },
  };
}

function createFakeMainWindow() {
  const sentEvents = [];
  let destroyed = false;

  const webContents = {
    isDestroyed: () => destroyed,
    send: (channel, payload) => {
      sentEvents.push({ channel, payload });
    },
  };

  return {
    isDestroyed: () => destroyed,
    destroy: () => { destroyed = true; },
    webContents,
    sentEvents,
  };
}

function createFakeIpcMain() {
  const handlers = new Map();

  return {
    on: (channel, fn) => {
      handlers.set(channel, fn);
    },
    removeListener: (channel, fn) => {
      if (handlers.get(channel) === fn) handlers.delete(channel);
    },
    emit: (channel, event, payload) => {
      if (handlers.has(channel)) {
        handlers.get(channel)(event, payload);
      }
    },
    hasHandler: (channel) => handlers.has(channel),
  };
}

test('normalizeScreensaverSettings - valid and default inputs', () => {
  assert.deepEqual(normalizeScreensaverSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeScreensaverSettings({}), DEFAULT_SETTINGS);

  const custom = { enabled: true, idleThresholdMinutes: 10 };
  assert.deepEqual(normalizeScreensaverSettings(custom), { enabled: true, idleThresholdMinutes: 10 });
});

test('normalizeScreensaverSettings - clamps idleThresholdMinutes to 1..60', () => {
  assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: -5 }).idleThresholdMinutes, DEFAULT_SETTINGS.idleThresholdMinutes);
  assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 0 }).idleThresholdMinutes, DEFAULT_SETTINGS.idleThresholdMinutes);
  assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 1 }).idleThresholdMinutes, 1);
  assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 60 }).idleThresholdMinutes, 60);
  assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 100 }).idleThresholdMinutes, DEFAULT_SETTINGS.idleThresholdMinutes);
  assert.equal(normalizeScreensaverSettings({ idleThresholdMinutes: 'invalid' }).idleThresholdMinutes, DEFAULT_SETTINGS.idleThresholdMinutes);
});

test('ScreensaverController - state machine and session lifecycle', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(0);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  assert.deepEqual(controller.getState(), { state: 'inactive', sessionId: 0, requiresFreshActiveCycle: false });

  // Idle for 299 seconds -> eligible
  powerMonitor.setIdleTime(299);
  controller._poll();
  assert.deepEqual(controller.getState(), { state: 'eligible', sessionId: 0, requiresFreshActiveCycle: false });

  // Idle for 300 seconds -> triggers active session
  powerMonitor.setIdleTime(300);
  controller._poll();

  const state1 = controller.getState();
  assert.equal(state1.state, 'active');
  assert.equal(state1.sessionId, 1);
  assert.equal(state1.requiresFreshActiveCycle, true);
  assert.equal(coordinator.getCurrentHolder(), 'screensaver');
  assert.equal(mainWindow.sentEvents.length, 1);
  assert.equal(mainWindow.sentEvents[0].channel, 'screensaver-start');
  assert.equal(mainWindow.sentEvents[0].payload.sessionId, 1);

  // User input detected (idle < 60s) -> stop session
  powerMonitor.setIdleTime(10);
  controller._poll();

  const state2 = controller.getState();
  assert.equal(state2.state, 'inactive');
  assert.equal(state2.sessionId, 1);
  assert.equal(state2.requiresFreshActiveCycle, false);
  assert.equal(coordinator.getCurrentHolder(), null);
  assert.equal(mainWindow.sentEvents.length, 2);
  assert.equal(mainWindow.sentEvents[1].channel, 'screensaver-stop');
  assert.equal(mainWindow.sentEvents[1].payload.reason, 'input');
});

test('ScreensaverController - single idle period restriction (requiresFreshActiveCycle)', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(350);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();

  // Poll 1: triggers session 1
  controller._poll();
  assert.equal(controller.getState().sessionId, 1);
  assert.equal(controller.getState().state, 'active');

  // Cancel session manually
  controller.cancelSession('manual-cancel');
  assert.equal(controller.getState().state, 'inactive');
  assert.equal(controller.getState().requiresFreshActiveCycle, true);

  // User stays idle (350s). Polling should NOT start a new session because requiresFreshActiveCycle is true!
  controller._poll();
  assert.equal(controller.getState().state, 'inactive');
  assert.equal(controller.getState().sessionId, 1);

  // User moves mouse (idle < 60s) -> clears requiresFreshActiveCycle
  powerMonitor.setIdleTime(5);
  controller._poll();
  assert.equal(controller.getState().requiresFreshActiveCycle, false);

  // User becomes idle again for 300s -> triggers session 2!
  powerMonitor.setIdleTime(300);
  controller._poll();
  assert.equal(controller.getState().state, 'active');
  assert.equal(controller.getState().sessionId, 2);
});

test('ScreensaverController - lease conflict blocks screensaver', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(350);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  // Break reminder acquires lease first
  coordinator.tryAcquire('break-reminder');

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  controller._poll();

  assert.equal(controller.getState().state, 'blocked');
  assert.equal(controller.getState().sessionId, 0);
  assert.equal(coordinator.getCurrentHolder(), 'break-reminder');
  assert.equal(mainWindow.sentEvents.length, 0);
});

test('ScreensaverController - eligibility guard rejection releases lease and blocks', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(350);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();

  // Eligibility guard returns fullscreen rejection
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: true }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  controller._poll();

  assert.equal(controller.getState().state, 'blocked');
  assert.equal(coordinator.getCurrentHolder(), null); // Lease must be released!
  assert.equal(mainWindow.sentEvents.length, 0);
});

test('ScreensaverController - macOS platform rejection', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(350);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({ platform: 'darwin' });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  controller._poll();

  assert.equal(controller.getState().state, 'blocked');
  assert.equal(coordinator.getCurrentHolder(), null);
  assert.equal(mainWindow.sentEvents.length, 0);
});

test('ScreensaverController - lock and suspend system events cancel active session', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(300);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  controller._poll();
  assert.equal(controller.getState().state, 'active');

  // Trigger system lock event
  powerMonitor.emit('lock-screen');

  assert.equal(controller.getState().state, 'inactive');
  assert.equal(controller.getState().requiresFreshActiveCycle, true);
  assert.equal(coordinator.getCurrentHolder(), null);

  const lastEvent = mainWindow.sentEvents[mainWindow.sentEvents.length - 1];
  assert.equal(lastEvent.channel, 'screensaver-cancel');
  assert.equal(lastEvent.payload.reason, 'system-lock');
});

test('ScreensaverController - IPC sender authentication and renderer-reload handler', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(300);
  const mainWindow = createFakeMainWindow();
  const ipcMain = createFakeIpcMain();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    ipcMain,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  controller._poll();
  assert.equal(controller.getState().state, 'active');

  // Unauthenticated event from unknown sender -> ignored
  ipcMain.emit('screensaver-ready', { sender: {} });
  assert.equal(controller.getState().state, 'active');

  // Authenticated screensaver-ready event while active -> renderer reloaded! Cancels session
  ipcMain.emit('screensaver-ready', { sender: mainWindow.webContents });

  assert.equal(controller.getState().state, 'inactive');
  const lastEvent = mainWindow.sentEvents[mainWindow.sentEvents.length - 1];
  assert.equal(lastEvent.channel, 'screensaver-cancel');
  assert.equal(lastEvent.payload.reason, 'renderer-reload');
});

test('ScreensaverController - dispose cleans up all timers and listeners', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(300);
  const mainWindow = createFakeMainWindow();
  const ipcMain = createFakeIpcMain();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    ipcMain,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  assert.equal(powerMonitor.listenerCount > 0, true);
  assert.equal(ipcMain.hasHandler('screensaver-ready'), true);
  assert.equal(clock.pendingIntervals, 1);

  controller.dispose();

  assert.equal(powerMonitor.listenerCount, 0);
  assert.equal(ipcMain.hasHandler('screensaver-ready'), false);
  assert.equal(clock.pendingIntervals, 0);
  assert.equal(controller.getState().state, 'inactive');
  assert.equal(coordinator.getCurrentHolder(), null);
});

test('ScreensaverController - start() -> stop() -> start() does not duplicate event listeners', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(0);
  const mainWindow = createFakeMainWindow();
  const ipcMain = createFakeIpcMain();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    ipcMain,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  for (let i = 0; i < 3; i++) {
    controller.start();
    assert.equal(powerMonitor.listenerCount, 4);
    assert.equal(ipcMain.hasHandler('screensaver-ready'), true);

    controller.stop();
    assert.equal(powerMonitor.listenerCount, 0);
    assert.equal(ipcMain.hasHandler('screensaver-ready'), false);
  }

  controller.start();
  assert.equal(powerMonitor.listenerCount, 4);
  controller.dispose();
  assert.equal(powerMonitor.listenerCount, 0);
});

test('ScreensaverController - _poll() does nothing when controller is stopped', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(350);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();
  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen: false }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  // Controller is stopped (isStarted === false)
  controller._poll();
  assert.equal(controller.getState().state, 'inactive');
  assert.equal(mainWindow.sentEvents.length, 0);
});

test('ScreensaverController - active session is cancelled if eligibilityGuard turns canInterrupt: false mid-session', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(350);
  const mainWindow = createFakeMainWindow();
  const coordinator = createInterruptionCoordinator();
  let isFullScreen = false;

  const guard = createScreensaverEligibilityGuard({
    platform: 'win32',
    getActiveWindowInfo: () => ({ active: true, window: { isFullScreen }, timestamp: clock.now() }),
    now: clock.now,
  });

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    eligibilityGuard: guard,
    getMainWindow: () => mainWindow,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  controller._poll();
  assert.equal(controller.getState().state, 'active');

  // Fullscreen app launched mid-session
  isFullScreen = true;
  controller._poll();

  assert.equal(controller.getState().state, 'inactive');
  assert.equal(coordinator.getCurrentHolder(), null);
  const lastEvent = mainWindow.sentEvents[mainWindow.sentEvents.length - 1];
  assert.equal(lastEvent.channel, 'screensaver-cancel');
  assert.equal(lastEvent.payload.reason, 'fullscreen');
});
