const assert = require('node:assert/strict');
const test = require('node:test');

const { ScreensaverSystem } = require('../src/systems/ScreensaverSystem');

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

test('ScreensaverSystem - initial state and init IPC subscriptions', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });

  assert.equal(system.isActive(), false);
  assert.equal(system.state, 'inactive');
  assert.equal(system.sessionId, 0);

  system.init();
  assert.equal(electronAPI.sentMessages.length, 1);
  assert.equal(electronAPI.sentMessages[0].channel, 'ready');
  assert.equal(electronAPI.listeners.size, 3);
});

test('ScreensaverSystem - onStart transitions to entering and calls cancel helpers', () => {
  const electronAPI = createFakeElectronApi();
  let overlayCleared = false;
  let interactionCancelled = false;
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 300, 100);

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    clearInteractionOverlay: () => { overlayCleared = true; },
    interactionSystem: {
      cancel: () => { interactionCancelled = true; },
    },
  });
  system.init();

  electronAPI.emitStart({ sessionId: 42, startedAt: Date.now() });

  assert.equal(system.isActive(), true);
  assert.equal(system.state, 'entering');
  assert.equal(system.sessionId, 42);
  assert.equal(overlayCleared, true);
  assert.equal(interactionCancelled, true);
  assert.deepEqual(system.startPositions, [{ x: 100, y: 100 }, { x: 300, y: 100 }]);
});

test('ScreensaverSystem - onStart ignores invalid sessionId', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart(null);
  assert.equal(system.isActive(), false);

  electronAPI.emitStart({ sessionId: -1 });
  assert.equal(system.isActive(), false);

  electronAPI.emitStart({ sessionId: 'invalid' });
  assert.equal(system.isActive(), false);
});

test('ScreensaverSystem - onStop with reason input reserves a visible caught interval', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart({ sessionId: 10, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  // Input detected -> caught state with timer
  electronAPI.emitStop({ sessionId: 10, reason: 'input' });
  assert.equal(system.state, 'caught');
  assert.equal(system.stateTimer, 800);
});

test('ScreensaverSystem - onStop and onCancel ignore mismatched sessionId', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart({ sessionId: 5, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  // Stop with wrong sessionId -> ignored
  electronAPI.emitStop({ sessionId: 999, reason: 'input' });
  assert.equal(system.state, 'entering');
  assert.equal(system.sessionId, 5);

  // Cancel with wrong sessionId -> ignored
  electronAPI.emitCancel({ sessionId: 999, reason: 'fullscreen' });
  assert.equal(system.state, 'entering');
  assert.equal(system.sessionId, 5);
});

test('ScreensaverSystem - onCancel with matching sessionId resets system', () => {
  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi');
  petA.queuedAction = 'feed';
  petA.state = 'moving';

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA],
  });
  system.init();

  electronAPI.emitStart({ sessionId: 7, startedAt: Date.now() });
  assert.equal(system.isActive(), true);

  electronAPI.emitCancel({ sessionId: 7, reason: 'fullscreen' });

  assert.equal(system.isActive(), false);
  assert.equal(system.state, 'inactive');
  assert.equal(system.sessionId, 0);
  assert.equal(petA.state, 'idle');
  assert.equal(petA.queuedAction, 'feed', 'queuedAction must be retained on reset');

  // Check finish notification sent
  const finishedMsg = electronAPI.sentMessages.find(m => m.channel === 'finished');
  assert.ok(finishedMsg);
  assert.equal(finishedMsg.sessionId, 7);
});

test('ScreensaverSystem - cancel(reason) performs clean immediate reset', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart({ sessionId: 15, startedAt: Date.now() });
  assert.equal(system.isActive(), true);

  system.cancel('manual_trigger');

  assert.equal(system.isActive(), false);
  assert.equal(system.state, 'inactive');
  assert.equal(system.sessionId, 0);
});

test('ScreensaverSystem - update loop state machine transitions', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart({ sessionId: 20, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  // update 1: entering -> performing
  system.update(16);
  assert.equal(system.state, 'performing');

  // user input stops session
  electronAPI.emitStop({ sessionId: 20, reason: 'input' });
  assert.equal(system.state, 'caught');
  assert.equal(system.stateTimer, 800);

  // The first frame must leave the indicator intact even if it follows a delayed render.
  system.update(10000);
  assert.equal(system.state, 'caught');
  assert.equal(system.stateTimer, 800);

  // The indicator then remains visible for its complete interval.
  system.update(600);
  assert.equal(system.state, 'caught');
  assert.equal(system.stateTimer, 200);

  // The remaining interval transitions to runningBack.
  system.update(200);
  assert.equal(system.state, 'runningBack');
  assert.equal(system.stateTimer, 500);

  // tick 500ms in runningBack -> finish reset to inactive
  system.update(500);
  assert.equal(system.state, 'inactive');
  assert.equal(system.isActive(), false);
});

test('ScreensaverSystem - waits for user input after the combo before running back', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart({ sessionId: 21, startedAt: Date.now() });
  system.state = 'performing';
  system.activeComboSequence = ['hug'];
  system.comboIndex = 1;
  system.comboStepState = 'idle_pause';
  system.comboStepTimer = 0;

  system.update(16);

  assert.equal(system.state, 'performing');
  assert.equal(system.comboStepState, 'waiting_for_input');
  assert.equal(electronAPI.sentMessages.some((message) => message.channel === 'finished'), false);

  electronAPI.emitStop({ sessionId: 21, reason: 'input' });
  assert.equal(system.state, 'caught');

  system.update(16); // first caught frame reserves a paint opportunity
  system.update(800);
  assert.equal(system.state, 'runningBack');
  system.update(500);
  assert.equal(system.state, 'inactive');
});

test('ScreensaverSystem - dispose detaches subscriptions and resets', () => {
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({ electronAPI });
  system.init();

  electronAPI.emitStart({ sessionId: 30, startedAt: Date.now() });
  assert.equal(system.isActive(), true);

  system.dispose();

  assert.equal(system.isActive(), false);
  assert.equal(electronAPI.listeners.size, 0);
});
