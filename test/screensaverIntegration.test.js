/**
 * test/screensaverIntegration.test.js
 * Integration test suite for CP Secret Screensaver feature (Step 5).
 * Tests InterruptionCoordinator lease arbitration, cancellation hooks,
 * IPC reload handling, window destruction, and power state events.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createInterruptionCoordinator } = require('../src/main/services/InterruptionCoordinator');
const { createScreensaverEligibilityGuard } = require('../src/main/services/ScreensaverEligibilityGuard');
const { createScreensaverController } = require('../src/main/services/ScreensaverController');

function createMockPowerMonitor(initialIdle = 0) {
  let idleTime = initialIdle;
  const listeners = {};
  return {
    getSystemIdleTime: () => idleTime,
    setIdleTime: (s) => { idleTime = s; },
    on: (event, fn) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    removeListener: (event, fn) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    emit: (event, ...args) => {
      if (listeners[event]) {
        listeners[event].forEach((fn) => fn(...args));
      }
    },
  };
}

function createMockWindow() {
  const sentEvents = [];
  let destroyed = false;
  return {
    window: {
      isDestroyed: () => destroyed,
      setDestroyed: (val) => { destroyed = val; },
      webContents: {
        isDestroyed: () => destroyed,
        send: (channel, ...args) => {
          sentEvents.push({ channel, args });
        },
      },
    },
    sentEvents,
  };
}

function createMockIpcMain() {
  const handlers = {};
  return {
    on: (channel, fn) => {
      handlers[channel] = handlers[channel] || [];
      handlers[channel].push(fn);
    },
    removeListener: (channel, fn) => {
      if (handlers[channel]) {
        handlers[channel] = handlers[channel].filter((f) => f !== fn);
      }
    },
    emit: (channel, event, ...args) => {
      if (handlers[channel]) {
        handlers[channel].forEach((fn) => fn(event, ...args));
      }
    },
  };
}

test('Screensaver Integration - Lease arbitration with InterruptionCoordinator', async (t) => {
  await t.test('Screensaver acquires lease and prevents Break Reminder from acquiring', () => {
    const coordinator = createInterruptionCoordinator();
    assert.equal(coordinator.getCurrentHolder(), null);

    const acquiredByScreensaver = coordinator.tryAcquire('screensaver');
    assert.equal(acquiredByScreensaver, true);
    assert.equal(coordinator.getCurrentHolder(), 'screensaver');

    const acquiredByBreak = coordinator.tryAcquire('break-reminder');
    assert.equal(acquiredByBreak, false);
    assert.equal(coordinator.getCurrentHolder(), 'screensaver');

    coordinator.release('screensaver');
    assert.equal(coordinator.getCurrentHolder(), null);

    const breakAcquired = coordinator.tryAcquire('break-reminder');
    assert.equal(breakAcquired, true);
    assert.equal(coordinator.getCurrentHolder(), 'break-reminder');
  });

  await t.test('Screensaver trigger fails and stays blocked if Break Reminder holds lease', () => {
    const coordinator = createInterruptionCoordinator();
    coordinator.tryAcquire('break-reminder');

    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };

    const controller = createScreensaverController({
      powerMonitor,
      interruptionCoordinator: coordinator,
      eligibilityGuard: guard,
      getMainWindow: () => mockWin.window,
      isPetCurrentlyHidden: () => false,
      getIsPaused: () => false,
    });

    controller.updateSettings({ enabled: true, idleThresholdMinutes: 5 });
    controller.start();

    controller._poll();
    const state = controller.getState();
    assert.equal(state.state, 'blocked');
    assert.equal(mockWin.sentEvents.length, 0);

    controller.dispose();
  });
});

test('Screensaver Integration - Cancellation hooks & lifecycle events', async (t) => {
  await t.test('Cancels session on pet hidden or paused', () => {
    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const coordinator = createInterruptionCoordinator();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };

    let isHidden = false;
    let isPaused = false;

    const controller = createScreensaverController({
      powerMonitor,
      interruptionCoordinator: coordinator,
      eligibilityGuard: guard,
      getMainWindow: () => mockWin.window,
      isPetCurrentlyHidden: () => isHidden,
      getIsPaused: () => isPaused,
    });

    controller.updateSettings({ enabled: true, idleThresholdMinutes: 5 });
    controller.start();

    controller._poll();
    assert.equal(controller.getState().state, 'active');
    assert.equal(coordinator.getCurrentHolder(), 'screensaver');

    // Trigger pet hidden cancellation
    isHidden = true;
    controller.cancelSession('pet-hidden');
    assert.equal(controller.getState().state, 'inactive');
    assert.equal(coordinator.getCurrentHolder(), null);
    assert.equal(mockWin.sentEvents.some((e) => e.channel === 'screensaver-cancel' && e.args[0].reason === 'pet-hidden'), true);

    controller.dispose();
  });

  await t.test('Cancels session on display changes or window migration', () => {
    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const coordinator = createInterruptionCoordinator();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };

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

    controller.cancelSession('display-changed');
    assert.equal(controller.getState().state, 'inactive');
    assert.equal(coordinator.getCurrentHolder(), null);
    assert.equal(mockWin.sentEvents.some((e) => e.channel === 'screensaver-cancel' && e.args[0].reason === 'display-changed'), true);

    controller.dispose();
  });

  await t.test('Cancels session on skin change', () => {
    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const coordinator = createInterruptionCoordinator();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };

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

    controller.cancelSession('skin-changed');
    assert.equal(controller.getState().state, 'inactive');
    assert.equal(mockWin.sentEvents.some((e) => e.channel === 'screensaver-cancel' && e.args[0].reason === 'skin-changed'), true);

    controller.dispose();
  });

  await t.test('Handles renderer reload by canceling session on screensaver-ready IPC from main window', () => {
    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const coordinator = createInterruptionCoordinator();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };
    const mockIpc = createMockIpcMain();

    const controller = createScreensaverController({
      powerMonitor,
      interruptionCoordinator: coordinator,
      eligibilityGuard: guard,
      getMainWindow: () => mockWin.window,
      ipcMain: mockIpc,
    });

    controller.updateSettings({ enabled: true, idleThresholdMinutes: 5 });
    controller.start();

    controller._poll();
    assert.equal(controller.getState().state, 'active');

    // Simulate IPC event from mainWindow sender
    const fakeEvent = { sender: mockWin.window.webContents };
    mockIpc.emit('screensaver-ready', fakeEvent);

    assert.equal(controller.getState().state, 'inactive');
    assert.equal(mockWin.sentEvents.some((e) => e.channel === 'screensaver-cancel' && e.args[0].reason === 'renderer_reload'), true);

    controller.dispose();
  });

  await t.test('Handles window destruction gracefully during poll', () => {
    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const coordinator = createInterruptionCoordinator();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };

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

    // Window gets destroyed
    mockWin.window.setDestroyed(true);
    controller._poll();

    assert.equal(controller.getState().state, 'inactive');
    assert.equal(coordinator.getCurrentHolder(), null);

    controller.dispose();
  });
});

test('Screensaver Integration - Power State & Single Cycle Enforcement', async (t) => {
  await t.test('System lock and suspend cancel session and require fresh active cycle', () => {
    const powerMonitor = createMockPowerMonitor(300);
    const mockWin = createMockWindow();
    const coordinator = createInterruptionCoordinator();
    const guard = { canInterrupt: () => ({ canInterrupt: true, reason: null }) };

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

    // System locks
    powerMonitor.emit('lock-screen');
    assert.equal(controller.getState().state, 'inactive');
    assert.equal(controller.getState().requiresFreshActiveCycle, true);
    assert.equal(coordinator.getCurrentHolder(), null);

    // Subsequent poll ticks without user activity reset stay inactive due to requiresFreshActiveCycle
    controller._poll();
    assert.equal(controller.getState().state, 'inactive');

    // User activity resets idleSeconds < 60, clearing requiresFreshActiveCycle
    powerMonitor.setIdleTime(10);
    controller._poll();
    assert.equal(controller.getState().requiresFreshActiveCycle, false);

    controller.dispose();
  });
});
