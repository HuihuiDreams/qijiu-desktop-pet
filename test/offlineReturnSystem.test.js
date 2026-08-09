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

test('saveCurrentState persists both pets, the current skin, and refreshes lastVisibleTime before save', async () => {
  const { deps, saveCalls } = makeDeps({
    initialLastVisibleTime: 123,
    now: () => 999,
    isDocumentVisible: () => true,
  });
  const system = new OfflineReturnSystem(deps);
  await system.saveCurrentState();
  // lastVisibleTime is refreshed to now() before save when document is visible
  assert.deepEqual(saveCalls, [{ petA: 'yueqi', petB: 'shenjiu', skinId: 'default', lastVisibleTime: 999 }]);
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

    assert.equal(scheduled.length, 2); // 1.5s/3s 弹出
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

test('handleOfflineReturn buffers bubbles when screensaver is active', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - twoHoursMs,
      isDocumentVisible: () => true,
      isScreensaverActive: () => true,
    });
    const system = new OfflineReturnSystem(deps);
    system.handleOfflineReturn(1000);

    assert.equal(scheduled.length, 0); // No timeouts scheduled
    assert.deepEqual(dialogBubbleCalls, []); // No bubbles shown immediately
    assert.ok(system.pendingReturnBubble); // Bubble buffered
    assert.equal(system.pendingReturnBubble.returnMsgYueqi, '你走了1个时辰…');
    assert.equal(system.pendingReturnBubble.returnMsgShenjiu, '…哼，终于回来了。');
  });
});

test('flushPendingReturnBubble shows buffered bubbles', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    let screensaverActive = true;
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - twoHoursMs,
      isDocumentVisible: () => true,
      isScreensaverActive: () => screensaverActive,
    });
    const system = new OfflineReturnSystem(deps);

    // First, buffer the bubble (screensaver active)
    system.handleOfflineReturn(1000);
    assert.equal(scheduled.length, 0);

    // Then, flush it once the screensaver has ended
    screensaverActive = false;
    system.flushPendingReturnBubble();

    assert.ok(system.pendingReturnBubble); // 补发序列在途时保留，供屏保再次打断后补发。
    assert.equal(scheduled.length, 2);
    assert.deepEqual(scheduled.map((s) => s.ms), [1500, 3000]);
    scheduled.forEach((s) => s.cb());

    assert.deepEqual(dialogBubbleCalls, [
      { pet: 'yueqi', text: '你走了1个时辰…', duration: 4000 },
      { pet: 'shenjiu', text: '…哼，终于回来了。', duration: 4000 },
    ]);
    assert.equal(system.pendingReturnBubble, null); // 两条气泡都触发后释放
  });
});

test('handleOfflineReturn keeps the sequence pending until the bubbles fire', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    const { deps } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - twoHoursMs,
      isDocumentVisible: () => true,
      isScreensaverActive: () => false, // explicitly inactive
    });
    const system = new OfflineReturnSystem(deps);
    system.handleOfflineReturn(1000);

    // 序列在途时 pending 保留数据：屏保在触发前打断时（removeForPets 清掉气泡），
    // 也能在屏保结束后补发，不漏消息。
    assert.ok(system.pendingReturnBubble);
    assert.equal(scheduled.length, 2);

    scheduled.forEach((s) => s.cb());
    assert.equal(system.pendingReturnBubble, null); // 完整展示后释放
  });
});

test('handleOfflineReturn re-buffers when the screensaver becomes active before the bubble fires', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    let screensaverActive = false;
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - twoHoursMs,
      isDocumentVisible: () => true,
      isScreensaverActive: () => screensaverActive,
    });
    const system = new OfflineReturnSystem(deps);
    system.handleOfflineReturn(1000); // 结算时屏保不活跃 → 直接调度
    assert.equal(scheduled.length, 2);

    screensaverActive = true; // 气泡触发前屏保又开始了
    scheduled[0].cb(); // 1.5s 触发 → 重新暂存而非展示
    assert.deepEqual(dialogBubbleCalls, []);
    assert.ok(system.pendingReturnBubble);

    screensaverActive = false; // 屏保结束 → flush 补发
    system.flushPendingReturnBubble();
    const reScheduled = scheduled.slice(2);
    assert.equal(reScheduled.length, 2);
    reScheduled[0].cb();
    reScheduled[1].cb();

    assert.deepEqual(dialogBubbleCalls, [
      { pet: 'yueqi', text: '你走了1个时辰…', duration: 4000 },
      { pet: 'shenjiu', text: '…哼，终于回来了。', duration: 4000 },
    ]);
    assert.equal(system.pendingReturnBubble, null);
  });
});

test('flushPendingReturnBubble ignores the original callbacks after a short screensaver interruption', () => {
  withStubbedSetTimeout((scheduled) => {
    const twoHoursMs = 7200000;
    let screensaverActive = false;
    const { deps, dialogBubbleCalls } = makeDeps({
      now: () => 10_000_000,
      initialLastVisibleTime: 10_000_000 - twoHoursMs,
      isDocumentVisible: () => true,
      isScreensaverActive: () => screensaverActive,
    });
    const system = new OfflineReturnSystem(deps);

    system.handleOfflineReturn(1000);
    screensaverActive = true;
    scheduled[0].cb(); // 首条气泡发现屏保已开始，原序列应失效。

    screensaverActive = false;
    system.flushPendingReturnBubble(); // 屏保很快结束，补发一组新的序列。
    scheduled[1].cb(); // 原序列的第二条回调不得再展示。
    scheduled.slice(2).forEach((timer) => timer.cb());

    assert.deepEqual(dialogBubbleCalls, [
      { pet: 'yueqi', text: '你走了1个时辰…', duration: 4000 },
      { pet: 'shenjiu', text: '…哼，终于回来了。', duration: 4000 },
    ]);
  });
});

test('flushPendingReturnBubble is a no-op with no pending bubble', () => {
  withStubbedSetTimeout((scheduled) => {
    const { deps, dialogBubbleCalls } = makeDeps();
    const system = new OfflineReturnSystem(deps);
    system.flushPendingReturnBubble();
    assert.equal(scheduled.length, 0);
    assert.deepEqual(dialogBubbleCalls, []);
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
