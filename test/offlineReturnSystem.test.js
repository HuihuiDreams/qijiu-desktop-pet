const assert = require('node:assert/strict');
const test = require('node:test');

const { OfflineReturnSystem } = require('../src/systems/OfflineReturnSystem');

function makePet(id) {
  return { id };
}

function makeDeps(overrides = {}) {
  const yueqi = makePet('yueqi');
  const shenjiu = makePet('shenjiu');
  const decayCalls = { A: [], B: [] };
  const saveCalls = [];
  const dialogBubbleCalls = [];

  const deps = {
    getPets: () => [yueqi, shenjiu],
    nurtureSystemA: { applyOfflineDecay: (pet, ms) => decayCalls.A.push([pet.id, ms]) },
    nurtureSystemB: { applyOfflineDecay: (pet, ms) => decayCalls.B.push([pet.id, ms]) },
    timeSystem: {
      save: (petA, petB, skinId, lastVisibleTime) => {
        saveCalls.push({ petA: petA.id, petB: petB.id, skinId, lastVisibleTime });
        return Promise.resolve();
      },
      deserializePet: () => {},
    },
    skinManager: { getCurrentSkin: () => 'default' },
    dialogBubble: { show: (pet, text, duration) => dialogBubbleCalls.push({ pet: pet.id, text, duration }) },
    getI18nUi: () => null,
    CONFIG: { DECAY_INTERVAL: 60000 },
    now: () => 1_000_000,
    isDocumentVisible: () => true,
    ...overrides,
  };

  return { deps, yueqi, shenjiu, decayCalls, saveCalls, dialogBubbleCalls };
}

function withStubbedSetTimeout(fn) {
  const original = global.setTimeout;
  const scheduled = [];
  global.setTimeout = (cb, ms) => { scheduled.push({ cb, ms }); return scheduled.length; };
  try {
    return fn(scheduled);
  } finally {
    global.setTimeout = original;
  }
}

test('constructor seeds lastVisibleTime from now() by default', () => {
  const { deps } = makeDeps({ now: () => 42 });
  const system = new OfflineReturnSystem(deps);
  assert.equal(system.lastVisibleTime, 42);
});

test('constructor accepts an explicit initialLastVisibleTime override', () => {
  const { deps } = makeDeps({ now: () => 42 });
  const system = new OfflineReturnSystem({ ...deps, initialLastVisibleTime: 7 });
  assert.equal(system.lastVisibleTime, 7);
});

test('saveCurrentState persists both pets, the current skin, and lastVisibleTime', async () => {
  const { deps, saveCalls } = makeDeps({ initialLastVisibleTime: 123 });
  const system = new OfflineReturnSystem(deps);
  await system.saveCurrentState();
  assert.deepEqual(saveCalls, [{ petA: 'yueqi', petB: 'shenjiu', skinId: 'default', lastVisibleTime: 123 }]);
});

test('handleOfflineReturn applies decay to both pets and always saves', () => {
  const { deps, decayCalls, saveCalls } = makeDeps();
  const system = new OfflineReturnSystem(deps);
  system.handleOfflineReturn(5000);
  assert.deepEqual(decayCalls.A, [['yueqi', 5000]]);
  assert.deepEqual(decayCalls.B, [['shenjiu', 5000]]);
  assert.equal(saveCalls.length, 1);
});

test('handleOfflineReturn shows return dialogues once at least one shichen (2h) has passed while the user is present', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - twoHoursMs, // exactly 1 shichen away
      isDocumentVisible: () => true,
    });
    const system = new OfflineReturnSystem(deps);
    system.handleOfflineReturn(1000);

    assert.equal(scheduled.length, 2);
    assert.deepEqual(scheduled.map((s) => s.ms), [1500, 3000]);
    scheduled.forEach((s) => s.cb());

    assert.deepEqual(dialogBubbleCalls, [
      { pet: 'yueqi', text: '你走了1个时辰…', duration: 4000 },
      { pet: 'shenjiu', text: '…哼，终于回来了。', duration: 4000 },
    ]);
  });
});

test('handleOfflineReturn uses I18N_UI return messages when available, including function-valued returnYueqi', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - twoHoursMs * 3,
      getI18nUi: () => ({
        returnYueqi: (n) => `custom-${n}-shichens`,
        returnShenjiu: 'custom-shenjiu-line',
      }),
    });
    const system = new OfflineReturnSystem(deps);
    system.handleOfflineReturn(1000);
    scheduled.forEach((s) => s.cb());

    assert.deepEqual(dialogBubbleCalls, [
      { pet: 'yueqi', text: 'custom-3-shichens', duration: 4000 },
      { pet: 'shenjiu', text: 'custom-shenjiu-line', duration: 4000 },
    ]);
  });
});

test('handleOfflineReturn does not show return dialogues when less than one shichen has passed', () => {
  withStubbedSetTimeout((scheduled) => {
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - 1000, // barely any time away
    });
    const system = new OfflineReturnSystem(deps);
    system.handleOfflineReturn(1000);
    assert.equal(scheduled.length, 0);
    assert.deepEqual(dialogBubbleCalls, []);
  });
});

test('handleOfflineReturn does not show return dialogues or refresh lastVisibleTime when the user is not present', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    const initial = 10_000_000 - twoHoursMs * 5;
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: initial,
      isDocumentVisible: () => false,
    });
    const system = new OfflineReturnSystem(deps);
    system.handleOfflineReturn(1000);
    assert.equal(scheduled.length, 0);
    assert.deepEqual(dialogBubbleCalls, []);
    // lastVisibleTime is only refreshed when the user is present
    assert.equal(system.lastVisibleTime, initial);
  });
});

test('handleOfflineReturn refreshes lastVisibleTime to now() when the user is present', () => {
  const { deps } = makeDeps({ now: () => 999, initialLastVisibleTime: 1 });
  const system = new OfflineReturnSystem(deps);
  system.handleOfflineReturn(1000);
  assert.equal(system.lastVisibleTime, 999);
});

test('handleSystemSuspend refreshes lastVisibleTime and saves when the document is visible', async () => {
  const { deps, saveCalls } = makeDeps({ now: () => 555, initialLastVisibleTime: 1, isDocumentVisible: () => true });
  const system = new OfflineReturnSystem(deps);
  system.handleSystemSuspend();
  assert.equal(system.lastVisibleTime, 555);
  assert.equal(saveCalls.length, 1);
});

test('handleSystemSuspend leaves lastVisibleTime untouched but still saves when the document is hidden', () => {
  const { deps, saveCalls } = makeDeps({ now: () => 555, initialLastVisibleTime: 1, isDocumentVisible: () => false });
  const system = new OfflineReturnSystem(deps);
  system.handleSystemSuspend();
  assert.equal(system.lastVisibleTime, 1);
  assert.equal(saveCalls.length, 1);
});

test('handleSystemResume triggers offline-return settlement only past the decay interval', () => {
  const { deps, decayCalls } = makeDeps({ CONFIG: { DECAY_INTERVAL: 60000 } });
  const system = new OfflineReturnSystem(deps);

  system.handleSystemResume({ offlineMs: 60000 }); // not strictly greater than the interval
  assert.deepEqual(decayCalls.A, []);

  system.handleSystemResume({ offlineMs: 60001 });
  assert.deepEqual(decayCalls.A, [['yueqi', 60001]]);
});

test('handleSystemResume defaults offlineMs to 0 when the payload is missing it', () => {
  const { deps, decayCalls } = makeDeps();
  const system = new OfflineReturnSystem(deps);
  system.handleSystemResume({});
  system.handleSystemResume(undefined);
  assert.deepEqual(decayCalls.A, []);
});

test('applyLoadedState is a no-op for a null/undefined savedState', () => {
  const { deps, saveCalls } = makeDeps();
  const system = new OfflineReturnSystem(deps);
  system.applyLoadedState(null);
  system.applyLoadedState(undefined);
  assert.equal(saveCalls.length, 0);
});

test('applyLoadedState restores lastVisibleTime and pet data, and settles decay past the interval', () => {
  const deserializeCalls = [];
  // isDocumentVisible: false 隔离掉 handleOfflineReturn 结算时“用户在场则刷新 lastVisibleTime
  // 为当前时间”的副作用，从而能单独断言 applyLoadedState 对存档 lastVisibleTime 的恢复。
  const { deps, decayCalls } = makeDeps({
    CONFIG: { DECAY_INTERVAL: 60000 },
    isDocumentVisible: () => false,
    timeSystem: {
      save: () => Promise.resolve(),
      deserializePet: (pet, data) => deserializeCalls.push([pet.id, data]),
    },
  });
  const system = new OfflineReturnSystem(deps);

  system.applyLoadedState({
    lastVisibleTime: 4242,
    petAData: { x: 1 },
    petBData: { x: 2 },
    offlineMs: 70000,
  });

  assert.equal(system.lastVisibleTime, 4242);
  assert.deepEqual(deserializeCalls, [['yueqi', { x: 1 }], ['shenjiu', { x: 2 }]]);
  assert.deepEqual(decayCalls.A, [['yueqi', 70000]]);
});

test('applyLoadedState refreshes lastVisibleTime to now() after settling decay when the user is present', () => {
  const { deps } = makeDeps({ now: () => 9999, CONFIG: { DECAY_INTERVAL: 60000 }, isDocumentVisible: () => true });
  const system = new OfflineReturnSystem(deps);

  system.applyLoadedState({ lastVisibleTime: 4242, petAData: {}, petBData: {}, offlineMs: 70000 });

  // handleOfflineReturn 内部在用户在场时会把 lastVisibleTime 刷新为 now()，
  // 这与主进程原始行为一致：离线结算发生时，"回归"这一刻本身即被记为新的可见时间。
  assert.equal(system.lastVisibleTime, 9999);
});

test('applyLoadedState falls back to now() when the saved lastVisibleTime is missing, and skips decay under the interval', () => {
  const { deps, decayCalls } = makeDeps({ now: () => 8888, CONFIG: { DECAY_INTERVAL: 60000 } });
  const system = new OfflineReturnSystem(deps);

  system.applyLoadedState({ petAData: {}, petBData: {}, offlineMs: 1000 });

  assert.equal(system.lastVisibleTime, 8888);
  assert.deepEqual(decayCalls.A, []);
});
