const assert = require('node:assert/strict');
const test = require('node:test');

const { BreakReminderPresenter } = require('../src/ui/BreakReminderPresenter');
const { StageGeometry } = require('../src/systems/StageGeometry');

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

function makeStageGeometry(walkAreas = [], width = 1000, height = 800) {
  const geometry = new StageGeometry({ initialWidth: width, initialHeight: height });
  geometry.applyScreenInfo({ width, height, walkAreas });
  return geometry;
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
    stageGeometry: makeStageGeometry(),
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
      stageGeometry: makeStageGeometry([
          { x: 0, y: 0, width: 500, height: 800 },
          { x: 500, y: 0, width: 500, height: 800, isPrimary: true },
      ]),
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
    assert.deepEqual(
      [{ x: yueqi.x, y: yueqi.y }, { x: shenjiu.x, y: shenjiu.y }],
      [{ x: 558, y: 352 }, { x: 846, y: 352 }],
    );
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

    const bubbleTimer300 = scheduled.find((s) => s.ms === 300);
    const bubbleTimer800 = scheduled.find((s) => s.ms === 800);
    assert.equal(bubbleTimer300.cleared, true);
    assert.equal(bubbleTimer800.cleared, true);
  });
});

test('handleTriggered cancels active interactionSystem after clearing overlay and syncs pet targetX/targetY', () => {
  withStubbedTimers(() => {
    const events = [];
    const yueqi = makePet('yueqi', { x: 10, y: 20, targetX: 400, targetY: 300 });
    const shenjiu = makePet('shenjiu', { x: 50, y: 60, targetX: 120, targetY: 220 });
    const interactionSystem = {
      isInteracting: true,
      interactionTimer: 1500,
      currentInteraction: { key: 'hug' },
      cancel() {
        events.push('cancelInteraction');
        this.isInteracting = false;
        this.interactionTimer = 0;
        this.currentInteraction = null;
      },
    };
    const { deps } = makeDeps({
      getPets: () => [yueqi, shenjiu],
      clearInteractionOverlay: () => { events.push('clearOverlay'); },
      interactionSystem,
      stageGeometry: makeStageGeometry([
        { x: 0, y: 0, width: 1000, height: 800, isPrimary: true },
      ]),
    });
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});

    assert.deepEqual(events, ['clearOverlay', 'cancelInteraction']);
    assert.equal(interactionSystem.isInteracting, false);
    assert.equal(interactionSystem.interactionTimer, 0);
    assert.equal(interactionSystem.currentInteraction, null);
    assert.equal(yueqi.targetX, yueqi.x);
    assert.equal(yueqi.targetY, yueqi.y);
    assert.equal(shenjiu.targetX, shenjiu.x);
    assert.equal(shenjiu.targetY, shenjiu.y);
    assert.deepEqual(
      [{ x: yueqi.targetX, y: yueqi.targetY }, { x: shenjiu.targetX, y: shenjiu.targetY }],
      [{ x: 308, y: 352 }, { x: 596, y: 352 }],
    );
  });
});

test('handleTriggered uses primary walkArea scaleRatio for pair spacing on mixed-DPI displays', () => {
  withStubbedTimers(() => {
    const { deps, yueqi, shenjiu } = makeDeps({
      stageGeometry: makeStageGeometry([
        { x: 0, y: 0, width: 1000, height: 800, scaleRatio: 1 },
        { x: 1000, y: 0, width: 1000, height: 800, scaleRatio: 1.5, isPrimary: true },
      ], 2000, 800),
    });
    const presenter = new BreakReminderPresenter(deps);

    presenter.handleTriggered({});

    // primary center = (1500, 400), scaled petSize = 96 * 1.5 = 144, spacing = 144 * 1.5 = 216
    assert.deepEqual(
      [{ x: yueqi.x, y: yueqi.y }, { x: shenjiu.x, y: shenjiu.y }],
      [{ x: 1212, y: 328 }, { x: 1644, y: 328 }],
    );
  });
});

function makeInteractionSystemStub(state) {
  return {
    ...state,
    cancel() {
      this.isInteracting = false;
      this.interactionTimer = 0;
      this.currentInteraction = null;
      this.cooldownTimer = 0;
    },
  };
}

test('handleTriggered gives an interrupted interaction the full cooldown so pets do not re-interact right after the reminder', () => {
  withStubbedTimers(() => {
    const interactionSystem = makeInteractionSystemStub({
      isInteracting: true,
      interactionTimer: 1500,
      currentInteraction: { key: 'hug' },
      cooldownTimer: 0,
    });
    const { deps } = makeDeps({
      interactionSystem,
      CONFIG: { PET_SIZE: 96, INTERACTION_COOLDOWN: 60000 },
    });

    new BreakReminderPresenter(deps).handleTriggered({});

    assert.equal(interactionSystem.isInteracting, false);
    assert.equal(interactionSystem.cooldownTimer, 60000);
  });
});

test('handleTriggered preserves the remaining cooldown when no interaction was running', () => {
  withStubbedTimers(() => {
    const interactionSystem = makeInteractionSystemStub({
      isInteracting: false,
      interactionTimer: 0,
      currentInteraction: null,
      cooldownTimer: 12000,
    });
    const { deps } = makeDeps({
      interactionSystem,
      CONFIG: { PET_SIZE: 96, INTERACTION_COOLDOWN: 60000 },
    });

    new BreakReminderPresenter(deps).handleTriggered({});

    assert.equal(interactionSystem.cooldownTimer, 12000);
  });
});
