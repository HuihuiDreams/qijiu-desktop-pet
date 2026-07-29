const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createScreensaverController,
  normalizeScreensaverSettings,
  DEFAULT_SETTINGS,
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
    get activeIntervalDetails() { return intervals.map(i => ({ id: i.id, ms: i.ms })); },
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
    getEventCount: (event) => {
      return listeners.has(event) ? listeners.get(event).length : 0;
    }
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
      if (!handlers.has(channel)) handlers.set(channel, []);
      handlers.get(channel).push(fn);
    },
    removeListener: (channel, fn) => {
      if (handlers.has(channel)) {
        const list = handlers.get(channel);
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      }
    },
    emit: (channel, event, payload) => {
      if (handlers.has(channel)) {
        for (const fn of handlers.get(channel)) fn(event, payload);
      }
    },
    getHandlerCount: (channel) => (handlers.get(channel) || []).length,
  };
}

// ==========================================
// TEST SUITE 1: InterruptionCoordinator Stress
// ==========================================

test('CHALLENGE 1.1: InterruptionCoordinator - Random concurrent lease contention', () => {
  const coordinator = createInterruptionCoordinator();
  let breakCount = 0;
  let screensaverCount = 0;

  for (let i = 0; i < 10000; i++) {
    const requester = i % 2 === 0 ? 'break-reminder' : 'screensaver';
    const other = i % 2 === 0 ? 'screensaver' : 'break-reminder';

    if (coordinator.tryAcquire(requester)) {
      if (requester === 'break-reminder') breakCount++;
      else screensaverCount++;

      assert.equal(coordinator.getCurrentHolder(), requester);
      assert.equal(coordinator.tryAcquire(other), false);

      // Release
      assert.equal(coordinator.release(requester), true);
      assert.equal(coordinator.getCurrentHolder(), null);
    }
  }
  assert.equal(breakCount > 0, true);
  assert.equal(screensaverCount > 0, true);
});

test('CHALLENGE 1.2: InterruptionCoordinator - Fuzz invalid types and boundary conditions', () => {
  const coordinator = createInterruptionCoordinator();
  const invalidHolders = [null, undefined, 123, true, {}, [], Symbol('test'), 'unknown-holder'];

  for (const item of invalidHolders) {
    assert.equal(coordinator.tryAcquire(item), false, `tryAcquire should reject ${String(item)}`);
    assert.equal(coordinator.release(item), false, `release should reject ${String(item)}`);
    assert.equal(coordinator.getCurrentHolder(), null);
  }

  // Acquire valid holder
  assert.equal(coordinator.tryAcquire('screensaver'), true);
  for (const item of invalidHolders) {
    assert.equal(coordinator.release(item), false);
    assert.equal(coordinator.getCurrentHolder(), 'screensaver');
  }
  coordinator.release('screensaver');
});

// ==========================================
// TEST SUITE 2: ScreensaverController Listener Leaks & Lifecycle Flaws
// ==========================================

test('CHALLENGE 2.1: ScreensaverController - Repeated start()/stop()/start() listener leak vulnerability', () => {
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

  // Cycle start and stop 5 times
  for (let i = 0; i < 5; i++) {
    controller.start();
    controller.stop();
  }

  // Inspect powerMonitor lock-screen listener count
  const lockListenersCount = powerMonitor.getEventCount('lock-screen');
  const ipcReadyListenersCount = ipcMain.getHandlerCount('screensaver-ready');

  // EXPECTATION: Listener count should be 0 when stopped, or at most 1 when started.
  // ACTUAL CHECK:
  console.log(`[CHALLENGE 2.1] powerMonitor lock-screen listeners after 5 start/stop cycles: ${lockListenersCount}`);
  console.log(`[CHALLENGE 2.1] ipcMain screensaver-ready listeners after 5 start/stop cycles: ${ipcReadyListenersCount}`);

  // Now call dispose()
  controller.dispose();
  const lockListenersAfterDispose = powerMonitor.getEventCount('lock-screen');
  console.log(`[CHALLENGE 2.1] powerMonitor lock-screen listeners after dispose(): ${lockListenersAfterDispose}`);

  // Assert leak fix
  assert.equal(lockListenersCount, 0, 'No powerMonitor listeners when stopped');
  assert.equal(ipcReadyListenersCount, 0, 'No ipcMain listeners when stopped');
  assert.equal(lockListenersAfterDispose, 0, 'No listeners after dispose()');
});

test('CHALLENGE 2.2: ScreensaverController - _poll() execution when isStarted is false', () => {
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

  // Note: controller is NOT started (isStarted === false)
  assert.equal(controller.getState().state, 'inactive');

  // Invoking _poll() while stopped
  controller._poll();

  const state = controller.getState();
  console.log(`[CHALLENGE 2.2] State after _poll() when stopped: ${state.state}`);
  console.log(`[CHALLENGE 2.2] Sent IPC events count when stopped: ${mainWindow.sentEvents.length}`);

  assert.equal(state.state, 'inactive', 'FLAW CONFIRMED: _poll() allowed transition to active state while controller was stopped!');
});

// ==========================================
// TEST SUITE 3: Race Conditions & Rapid Transitions
// ==========================================

test('CHALLENGE 3.1: Rapid Lock/Unlock/Suspend/Resume storm while active', () => {
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

  // Fire rapid system power events
  powerMonitor.emit('lock-screen');
  powerMonitor.emit('unlock-screen');
  powerMonitor.emit('suspend');
  powerMonitor.emit('resume');
  powerMonitor.emit('lock-screen');

  assert.equal(controller.getState().state, 'inactive');
  assert.equal(coordinator.getCurrentHolder(), null);
  assert.equal(controller.getState().requiresFreshActiveCycle, true);

  // Poll while still idle -> must NOT trigger active session because requiresFreshActiveCycle is true
  controller._poll();
  assert.equal(controller.getState().state, 'inactive');
});

test('CHALLENGE 3.2: Rapid Polling Rate Switching and Settings Mutation', () => {
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
  assert.equal(clock.activeIntervalDetails[0].ms, 5000); // Standby interval

  controller._poll(); // Trigger active
  assert.equal(controller.getState().state, 'active');
  assert.equal(clock.activeIntervalDetails[0].ms, 1000); // Active interval

  // Dynamically disable settings while active
  controller.updateSettings({ enabled: false, idleThresholdMinutes: 5 });

  assert.equal(controller.getState().state, 'inactive');
  assert.equal(coordinator.getCurrentHolder(), null);
  assert.equal(clock.activeIntervalDetails[0].ms, 5000); // Reverted to standby interval
});

test('CHALLENGE 3.3: Mid-session Window Destruction / Unavailability', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(300);
  let mainWindow = createFakeMainWindow();
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

  // Main window is destroyed while screensaver is active
  mainWindow.destroy();

  // Next poll tick while active
  controller._poll();
  console.log(`[CHALLENGE 3.3] State after main window destroyed mid-session: ${controller.getState().state}`);
  assert.equal(controller.getState().state, 'inactive');
});

test('CHALLENGE 3.5: Mid-session Fullscreen / Eligibility Guard Rejection', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(300);
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

  // User launches a full-screen app mid-session (isFullScreen becomes true)
  isFullScreen = true;

  // Next 1s poll tick runs while active
  controller._poll();
  console.log(`[CHALLENGE 3.5] State after full-screen app opened mid-session: ${controller.getState().state}`);
  assert.equal(controller.getState().state, 'inactive');
});
