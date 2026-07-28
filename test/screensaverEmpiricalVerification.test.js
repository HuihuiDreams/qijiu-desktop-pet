const assert = require('node:assert/strict');
const test = require('node:test');

const { ScreensaverSystem } = require('../src/systems/ScreensaverSystem');
const { createScreensaverController } = require('../src/main/services/ScreensaverController');
const { createInterruptionCoordinator } = require('../src/main/services/InterruptionCoordinator');
const { createScreensaverEligibilityGuard } = require('../src/main/services/ScreensaverEligibilityGuard');

// Helper Fakes
function createFakePet(id, x = 100, y = 100) {
  return {
    id,
    x,
    y,
    state: 'idle',
    queuedAction: null,
    setState(st) {
      this.state = st;
    },
  };
}

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

function createFakeElectronApi() {
  const listeners = new Map();
  const sentMessages = [];

  return {
    onScreensaverStart: (fn) => {
      listeners.set('start', fn);
      return () => listeners.delete('start');
    },
    onScreensaverStop: (fn) => {
      listeners.set('stop', fn);
      return () => listeners.delete('stop');
    },
    onScreensaverCancel: (fn) => {
      listeners.set('cancel', fn);
      return () => listeners.delete('cancel');
    },
    notifyScreensaverReady: () => {
      sentMessages.push({ channel: 'ready' });
    },
    notifyScreensaverFinished: (sessionId) => {
      sentMessages.push({ channel: 'finished', sessionId });
    },
    emitStart: (payload) => listeners.get('start')?.(payload),
    emitStop: (payload) => listeners.get('stop')?.(payload),
    emitCancel: (payload) => listeners.get('cancel')?.(payload),
    sentMessages,
    listeners,
  };
}

// ==========================================
// Suite 1: State Machine Empirical Stress
// ==========================================

test('EMPIRICAL - State Machine: Rapid Start-Start sequence triggers finish notification for prior session', () => {
  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi');
  const petB = createFakePet('shenjiu');

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
  });
  system.init();

  // Start Session 100
  electronAPI.emitStart({ sessionId: 100, startedAt: Date.now() });
  assert.equal(system.sessionId, 100);
  assert.equal(system.state, 'entering');

  // Immediately Start Session 200 without ending 100
  electronAPI.emitStart({ sessionId: 200, startedAt: Date.now() });
  assert.equal(system.sessionId, 200);
  assert.equal(system.state, 'entering');

  // Verify finished notification for session 100 was sent
  const finishedFor100 = electronAPI.sentMessages.find(
    (m) => m.channel === 'finished' && m.sessionId === 100
  );
  assert.ok(finishedFor100, 'Session 100 should issue finished notification when preempted by new start');
});

test('EMPIRICAL - State Machine: Rapid Stop-Stop and Stop-Cancel sequences', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  // Start Session 1
  electronAPI.emitStart({ sessionId: 1, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  // Stop reason input -> caught
  electronAPI.emitStop({ sessionId: 1, reason: 'input' });
  assert.equal(system.state, 'caught');

  // Second stop reason input while in caught -> falls into cancel(reason) -> inactive
  electronAPI.emitStop({ sessionId: 1, reason: 'input' });
  assert.equal(system.state, 'inactive');
  assert.equal(system.sessionId, 0);

  // Start Session 2
  electronAPI.emitStart({ sessionId: 2, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  // Stop reason input -> caught
  electronAPI.emitStop({ sessionId: 2, reason: 'input' });
  assert.equal(system.state, 'caught');

  // Cancel reason fullscreen while caught -> resets to inactive
  electronAPI.emitCancel({ sessionId: 2, reason: 'fullscreen' });
  assert.equal(system.state, 'inactive');
  assert.equal(system.sessionId, 0);
});

test('EMPIRICAL - State Machine: Time Delta Edge Cases in update loop', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart({ sessionId: 50, startedAt: Date.now() });
  electronAPI.emitStop({ sessionId: 50, reason: 'input' });
  assert.equal(system.state, 'caught'); // stateTimer = 800

  // The first delayed frame reserves a paint opportunity for the caught indicator.
  system.update(10000);
  assert.equal(system.state, 'caught');
  assert.equal(system.stateTimer, 800);

  // A later frame consumes the caught interval and begins the return animation.
  system.update(800);
  assert.equal(system.state, 'runningBack');
  assert.equal(system.stateTimer, 500);

  // A delayed frame during runningBack still completes the silent cleanup.
  system.update(10000);
  assert.equal(system.state, 'inactive');
  assert.equal(system.isActive(), false);
});

test('EMPIRICAL - State Machine: Preservation of pet.queuedAction on cancel and reset', () => {
  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi');
  petA.queuedAction = 'bath';
  petA.state = 'moving';

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA],
  });
  system.init();

  electronAPI.emitStart({ sessionId: 1, startedAt: Date.now() });
  system.cancel('user_interrupted');

  assert.equal(petA.state, 'idle');
  assert.equal(petA.queuedAction, 'bath', 'queuedAction must remain unchanged');
});

// ==========================================
// Suite 2: Renderer Reload Behavior
// ==========================================

test('EMPIRICAL - Renderer Reload: notifyScreensaverReady while active triggers screensaver-cancel with reason renderer_reload', () => {
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
  const activeSessionId = controller.getState().sessionId;
  assert.equal(activeSessionId, 1);
  assert.equal(coordinator.getCurrentHolder(), 'screensaver');

  // Renderer reloads (e.g. F5 / location.reload() / HMR): new renderer calls notifyScreensaverReady()
  // Sends 'screensaver-ready' IPC from main window webContents
  ipcMain.emit('screensaver-ready', { sender: mainWindow.webContents });

  // Verify session cancelled
  assert.equal(controller.getState().state, 'inactive');
  assert.equal(coordinator.getCurrentHolder(), null, 'Lease must be released on renderer reload cancel');

  // Check last event sent to webContents
  const cancelEvents = mainWindow.sentEvents.filter((e) => e.channel === 'screensaver-cancel');
  assert.equal(cancelEvents.length, 1);
  assert.equal(cancelEvents[0].payload.sessionId, activeSessionId);
  assert.equal(cancelEvents[0].payload.reason, 'renderer_reload');
});

test('EMPIRICAL - Renderer Reload: notifyScreensaverReady from unauthorized sender is ignored', () => {
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

  // Foreign sender (e.g. malicious iframe or sub-window) sends screensaver-ready
  const foreignSender = { id: 999 };
  ipcMain.emit('screensaver-ready', { sender: foreignSender });

  // State must remain active!
  assert.equal(controller.getState().state, 'active');
  assert.equal(coordinator.getCurrentHolder(), 'screensaver');
});

test('EMPIRICAL - Renderer Reload: notifyScreensaverReady while inactive is a safe no-op', () => {
  const clock = createFakeClock();
  const powerMonitor = createFakePowerMonitor(0);
  const mainWindow = createFakeMainWindow();
  const ipcMain = createFakeIpcMain();
  const coordinator = createInterruptionCoordinator();

  const controller = createScreensaverController({
    powerMonitor,
    interruptionCoordinator: coordinator,
    getMainWindow: () => mainWindow,
    ipcMain,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    settings: { enabled: true, idleThresholdMinutes: 5 },
  });

  controller.start();
  assert.equal(controller.getState().state, 'inactive');

  // Initial load / idle reload sending ready
  ipcMain.emit('screensaver-ready', { sender: mainWindow.webContents });

  assert.equal(controller.getState().state, 'inactive');
  assert.equal(mainWindow.sentEvents.length, 0);
});

// ==========================================
// Suite 3: Game Loop Gate Behavior Simulation
// ==========================================

test('EMPIRICAL - Game Loop Gate: Movement, interaction, and queued actions are strictly bypassed when screensaver is active', () => {
  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 300, 100);
  petA.queuedAction = 'feed';

  const screensaverSystem = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
  });
  screensaverSystem.init();

  let movementUpdatedCount = 0;
  let interactionUpdatedCount = 0;
  let ambientDialogueUpdatedCount = 0;
  let weatherParticlesClearedCount = 0;
  let queuedActionHandledCount = 0;
  let nurtureUpdateCount = 0;
  let timeUpdateCount = 0;

  const mockMovementSystem = {
    setSurfacePlatforms: () => {},
    update: () => { movementUpdatedCount++; },
  };

  const mockInteractionSystem = {
    update: () => { interactionUpdatedCount++; return null; },
  };

  const mockAmbientDialogueSystem = {
    update: () => { ambientDialogueUpdatedCount++; },
  };

  const mockWeatherParticleLayer = {
    clear: () => { weatherParticlesClearedCount++; },
  };

  const mockNurtureSystem = {
    update: () => { nurtureUpdateCount++; },
  };

  const mockTimeSystem = {
    update: () => { timeUpdateCount++; return false; },
  };

  function simulateGameLoopFrame(deltaMs) {
    const isScreensaverActive = screensaverSystem.isActive();

    // Shared nurture & time updates
    mockNurtureSystem.update(petA, deltaMs);
    mockNurtureSystem.update(petB, deltaMs);
    mockTimeSystem.update(deltaMs);

    if (isScreensaverActive) {
      mockWeatherParticleLayer.clear();
      screensaverSystem.update(deltaMs);
    } else {
      mockMovementSystem.update(petA, deltaMs);
      mockMovementSystem.update(petB, deltaMs);

      const interaction = mockInteractionSystem.update(petA, petB, deltaMs);
      if (interaction) {
        // mock interaction handling
      }

      if (petA.state === 'idle' && petA.queuedAction) {
        queuedActionHandledCount++;
        petA.queuedAction = null;
      }

      mockAmbientDialogueSystem.update(deltaMs);
    }
  }

  // --- Phase A: Screensaver INACTIVE ---
  simulateGameLoopFrame(16);
  assert.equal(movementUpdatedCount, 2, 'Movement should run for both pets when inactive');
  assert.equal(interactionUpdatedCount, 1, 'Interaction system should update when inactive');
  assert.equal(ambientDialogueUpdatedCount, 1, 'Ambient dialogue should update when inactive');
  assert.equal(queuedActionHandledCount, 1, 'Queued action should be processed when inactive');
  assert.equal(weatherParticlesClearedCount, 0);

  // Reset counters & set up new queuedAction
  movementUpdatedCount = 0;
  interactionUpdatedCount = 0;
  ambientDialogueUpdatedCount = 0;
  queuedActionHandledCount = 0;
  petA.queuedAction = 'drink';

  // --- Phase B: Activate Screensaver ---
  electronAPI.emitStart({ sessionId: 88, startedAt: Date.now() });
  assert.equal(screensaverSystem.isActive(), true);

  // Run 10 frames while screensaver is ACTIVE
  for (let i = 0; i < 10; i++) {
    simulateGameLoopFrame(16);
  }

  assert.equal(movementUpdatedCount, 0, 'MovementSystem MUST NOT update while screensaver active');
  assert.equal(interactionUpdatedCount, 0, 'InteractionSystem MUST NOT update while screensaver active');
  assert.equal(ambientDialogueUpdatedCount, 0, 'AmbientDialogueSystem MUST NOT update while screensaver active');
  assert.equal(queuedActionHandledCount, 0, 'Pet queuedAction MUST NOT execute while screensaver active');
  assert.equal(weatherParticlesClearedCount, 10, 'Weather particles cleared every frame while active');
  assert.equal(nurtureUpdateCount, 22, 'Nurture updates continue during screensaver');
  assert.equal(petA.queuedAction, 'drink', 'queuedAction preserved during screensaver');

  // --- Phase C: Stop Screensaver ---
  screensaverSystem.cancel('test_end');
  assert.equal(screensaverSystem.isActive(), false);

  // Run 1 frame after screensaver ends
  simulateGameLoopFrame(16);
  assert.equal(movementUpdatedCount, 2, 'MovementSystem resumes when screensaver inactive');
  assert.equal(interactionUpdatedCount, 1, 'InteractionSystem resumes when screensaver inactive');
  assert.equal(ambientDialogueUpdatedCount, 1, 'AmbientDialogueSystem resumes when screensaver inactive');
  assert.equal(queuedActionHandledCount, 1, 'Queued action processed after screensaver ends');
  assert.equal(petA.queuedAction, null, 'Queued action consumed after execution');
});
