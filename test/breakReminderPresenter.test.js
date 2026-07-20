const assert = require('node:assert/strict');
const test = require('node:test');

const { BreakReminderPresenter } = require('../src/ui/BreakReminderPresenter');

function makePet(id, overrides = {}) {
  return {
    id,
    x: 0,
    y: 0,
    size: 96,
    direction: 'right',
    state: 'idle',
    idleTimer: 0,
    setState(state) { this.state = state; },
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  const yueqi = makePet('yueqi');
  const shenjiu = makePet('shenjiu');
  const dialogBubbleCalls = { removeForPets: [], show: [] };
  const rendererCalls = { update: [] };
  const spriteViewCalls = { update: [] };
  const dismissBreakReminderCalls = [];

  const deps = {
    getPets: () => [yueqi, shenjiu],
    dialogBubble: {
      removeForPets: (pets) => dialogBubbleCalls.removeForPets.push(pets),
      show: (pet, text, duration) => dialogBubbleCalls.show.push({ pet: pet.id, text, duration }),
    },
    renderer: { update: (pet) => rendererCalls.update.push(pet.id) },
    spriteView: { update: (pet, ms) => spriteViewCalls.update.push([pet.id, ms]) },
    stageGeometry: {
      width: 1000,
      height: 800,
      getWalkAreas: () => [],
    },
    getIsPaused: () => false,
    clearInteractionOverlay: () => { deps._overlayCleared = true; },
    electronAPI: { dismissBreakReminder: () => dismissBreakReminderCalls.push(Date.now()) },
    CONFIG: { PET_SIZE: 96 },
    getDialogues: () => ({ breakReminder: { yueqi: ['岳七台词'], shenjiu: ['沈九台词'] } }),
    ...overrides,
  };

  return { deps, yueqi, shenjiu, dialogBubbleCalls, rendererCalls, spriteViewCalls, dismissBreakReminderCalls };
}

function withStubbedTimers(fn) {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduled = [];
  let nextId = 1;
  global.setTimeout = (cb, ms) => {
    const id = nextId++;
    scheduled.push({ id, cb, ms, cleared: false });
    return id;
  };
  global.clearTimeout = (id) => {
    const entry = scheduled.find((s) => s.id === id);
    if (entry) entry.cleared = true;
  };
  try {
    return fn({
      scheduled,
      runDueByDelay(ms) {
        scheduled.filter((s) => s.ms === ms && !s.cleared).forEach((s) => s.cb());
      },
    });
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

test('isActive() is false before any trigger', () => {
  const { deps } = makeDeps();
  const presenter = new BreakReminderPresenter(deps);
  assert.equal(presenter.isActive(), false);
});

test('handleTriggered is a no-op (besides notifying main) when paused', () => {
  const { deps, dismissBreakReminderCalls } = makeDeps({ getIsPaused: () => true });
  const presenter = new BreakReminderPresenter(deps);

  presenter.handleTriggered({});

  assert.equal(presenter.isActive(), false);
  assert.deepEqual(dismissBreakReminderCalls.length, 1);
});

test('handleTriggered ignores a second trigger while already active', () => {
  withStubbedTimers(() => {
    const { deps, rendererCalls } = makeDeps();
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});
    const updateCallsAfterFirst = rendererCalls.update.length;
    presenter.handleTriggered({}); // should be ignored

    assert.equal(rendererCalls.update.length, updateCallsAfterFirst);
  });
});

test('handleTriggered positions pets face-to-face on the primary walk area and clears overlay/bubbles', () => {
  withStubbedTimers(() => {
    const { deps, yueqi, shenjiu, dialogBubbleCalls, rendererCalls, spriteViewCalls } = makeDeps({
      stageGeometry: {
        width: 1000,
        height: 800,
        getWalkAreas: () => [
          { x: 0, y: 0, width: 500, height: 800 },
          { x: 500, y: 0, width: 500, height: 800, isPrimary: true },
        ],
      },
    });
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});

    assert.equal(presenter.isActive(), true);
    assert.equal(deps._overlayCleared, true);
    assert.equal(dialogBubbleCalls.removeForPets.length, 1);
    // 面对面
    assert.equal(yueqi.direction, 'right');
    assert.equal(shenjiu.direction, 'left');
    assert.equal(yueqi.state, 'interacting');
    assert.equal(shenjiu.state, 'interacting');
    // 落在标记为 isPrimary 的区域内 (x in [500, 1000])
    assert.ok(yueqi.x >= 500 - 1 && yueqi.x <= 1000);
    assert.ok(shenjiu.x >= 500 - 1 && shenjiu.x <= 1000);
    assert.deepEqual(rendererCalls.update, ['yueqi', 'shenjiu']);
    assert.deepEqual(spriteViewCalls.update, [['yueqi', 0], ['shenjiu', 0]]);
  });
});

test('handleTriggered falls back to full stage bounds when there are no walk areas', () => {
  withStubbedTimers(() => {
    const { deps, yueqi, shenjiu } = makeDeps();
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});

    assert.ok(yueqi.x >= 0 && yueqi.x <= 1000);
    assert.ok(shenjiu.x >= 0 && shenjiu.x <= 1000);
  });
});

test('handleTriggered schedules staggered bubbles and a 20s auto-dismiss, using dialogue-pool text', () => {
  withStubbedTimers(({ scheduled, runDueByDelay }) => {
    const { deps, dialogBubbleCalls } = makeDeps();
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});

    assert.deepEqual(scheduled.map((s) => s.ms).sort((a, b) => a - b), [300, 800, 20000]);

    runDueByDelay(300);
    runDueByDelay(800);

    assert.deepEqual(dialogBubbleCalls.show, [
      { pet: 'yueqi', text: '岳七台词', duration: 18000 },
      { pet: 'shenjiu', text: '沈九台词', duration: 17500 },
    ]);

    // 20 秒后自动消失
    runDueByDelay(20000);
    assert.equal(presenter.isActive(), false);
  });
});

test('handleTriggered falls back to default reminder text when the dialogue pool is empty', () => {
  withStubbedTimers(({ runDueByDelay }) => {
    const { deps, dialogBubbleCalls } = makeDeps({ getDialogues: () => null });
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});
    runDueByDelay(300);
    runDueByDelay(800);

    assert.deepEqual(dialogBubbleCalls.show, [
      { pet: 'yueqi', text: '起来活动一下吧！', duration: 18000 },
      { pet: 'shenjiu', text: '…别坐太久了。', duration: 17500 },
    ]);
  });
});

test('dismiss() before any trigger is a no-op', () => {
  const { deps, dismissBreakReminderCalls } = makeDeps();
  const presenter = new BreakReminderPresenter(deps);

  presenter.dismiss();

  assert.equal(dismissBreakReminderCalls.length, 0);
});

test('dismiss() clears the auto-dismiss timer, restores idle state, and notifies main', () => {
  withStubbedTimers(({ scheduled }) => {
    const { deps, yueqi, shenjiu, dismissBreakReminderCalls } = makeDeps();
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});
    yueqi.state = 'interacting';
    shenjiu.state = 'interacting';

    presenter.dismiss();

    assert.equal(presenter.isActive(), false);
    assert.equal(yueqi.state, 'idle');
    assert.equal(shenjiu.state, 'idle');
    assert.equal(yueqi.idleTimer, 2000);
    assert.equal(shenjiu.idleTimer, 2000);
    assert.equal(dismissBreakReminderCalls.length, 1);

    const autoDismissTimer = scheduled.find((s) => s.ms === 20000);
    assert.equal(autoDismissTimer.cleared, true);
  });
});
