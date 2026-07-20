const assert = require('node:assert/strict');
const test = require('node:test');

const { AmbientDialogueSystem } = require('../src/systems/AmbientDialogueSystem');

function makePet(id, overrides = {}) {
  return {
    id,
    state: 'idle',
    timePhase: 'day',
    stats: { affection: 50 },
    element: { style: { display: '' } },
    isBusy: () => false,
    isHungry: () => false,
    isLowQi: () => false,
    isLowMood: () => false,
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  const yueqi = makePet('yueqi');
  const shenjiu = makePet('shenjiu');
  const calls = { show: [], showStatWarning: [], showIdleChatter: [] };
  const dialogBubble = {
    activeBubbles: new Map(),
    show: (pet, text, duration) => calls.show.push({ pet: pet.id, text, duration }),
    showStatWarning: (pet) => calls.showStatWarning.push(pet.id),
    showIdleChatter: (pet) => calls.showIdleChatter.push(pet.id),
  };
  const deps = {
    getPets: () => [yueqi, shenjiu],
    dialogBubble,
    t: (key) => `T:${key}`,
    getDialogues: () => null,
    ...overrides,
  };
  return { deps, yueqi, shenjiu, calls, dialogBubble };
}

/** 用一串固定值依次驱动 Math.random()，用完后重复最后一个值。 */
function withRandomSequence(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('constructor seeds chatterTimer/statWarningTimer from Math.random', () => {
  withRandomSequence([0], () => {
    const { deps } = makeDeps();
    const system = new AmbientDialogueSystem(deps);
    assert.equal(system.chatterTimer, 15000);
    assert.equal(system.statWarningTimer, 8000);
  });
});

test('update() does nothing before either timer reaches zero', () => {
  const { deps, calls } = makeDeps();
  const system = new AmbientDialogueSystem(deps);
  system.update(10); // timers are in the multi-thousand-ms range
  assert.deepEqual(calls.show, []);
  assert.deepEqual(calls.showStatWarning, []);
});

test('statWarningTimer firing shows a warning for a candidate in a low state', () => {
  withRandomSequence([0], () => {
    const { deps, calls, shenjiu } = makeDeps();
    shenjiu.isHungry = () => true;
    const system = new AmbientDialogueSystem(deps);
    system.update(system.statWarningTimer); // drive it to exactly 0
    assert.deepEqual(calls.showStatWarning, ['shenjiu']);
  });
});

test('statWarningTimer firing with no low-state candidates shows nothing', () => {
  const { deps, calls } = makeDeps();
  const system = new AmbientDialogueSystem(deps);
  system.update(system.statWarningTimer);
  assert.deepEqual(calls.showStatWarning, []);
});

// 注意：Math.random() > 0.5 ? yueqi : shenjiu 在 Math.random() 恒为 0 时走 else 分支，
// 即选中 shenjiu；以下用例据此驱动固定的宠物选择结果。

test('chatterTimer firing during morning shows the time-phase-specific line', () => {
  withRandomSequence([0], () => {
    const { deps, calls, shenjiu } = makeDeps();
    shenjiu.timePhase = 'morning';
    const system = new AmbientDialogueSystem(deps);
    system.update(system.chatterTimer);
    assert.deepEqual(calls.show, [{ pet: 'shenjiu', text: 'T:morningShenjiu', duration: 5000 }]);
  });
});

test('chatterTimer firing during night has a chance to trigger a night dream instead of idle chatter', () => {
  withRandomSequence([0], () => {
    const { deps, calls, shenjiu } = makeDeps({
      getDialogues: () => ({
        dream: { lowAffection: { shenjiu: ['dream-shenjiu'] }, highAffection: {}, linked: {} },
      }),
    });
    shenjiu.timePhase = 'night';
    shenjiu.state = 'idle';
    const system = new AmbientDialogueSystem(deps);
    system.update(system.chatterTimer);
    assert.deepEqual(calls.show, [{ pet: 'shenjiu', text: 'dream-shenjiu', duration: 5000 }]);
  });
});

test('chatterTimer firing with no matching time phase falls back to plain idle chatter when healthy', () => {
  withRandomSequence([0], () => {
    const { deps, calls, shenjiu } = makeDeps();
    shenjiu.timePhase = 'unspecified';
    const system = new AmbientDialogueSystem(deps);
    system.update(system.chatterTimer);
    assert.deepEqual(calls.showIdleChatter, ['shenjiu']);
  });
});

test('chatterTimer does not fire idle chatter for an unhealthy pet outside the special time phases', () => {
  withRandomSequence([0], () => {
    const { deps, calls, shenjiu } = makeDeps();
    shenjiu.timePhase = 'unspecified';
    shenjiu.isHungry = () => true;
    const system = new AmbientDialogueSystem(deps);
    system.update(system.chatterTimer);
    assert.deepEqual(calls.showIdleChatter, []);
    assert.deepEqual(calls.show, []);
  });
});

test('showNightDream falls back to a plain night line when there is no dream pool', () => {
  const { deps, calls, yueqi } = makeDeps({ getDialogues: () => null });
  const system = new AmbientDialogueSystem(deps);
  system.showNightDream(yueqi);
  assert.deepEqual(calls.show, [{ pet: 'yueqi', text: 'T:nightYueqi', duration: 5000 }]);
});

test('showNightDream triggers a linked reply from yueqi when shenjiu dreams and yueqi is asleep nearby', () => {
  withRandomSequence([0], () => {
    const originalSetTimeout = global.setTimeout;
    const scheduled = [];
    global.setTimeout = (cb, ms) => { scheduled.push({ cb, ms }); return scheduled.length; };
    try {
      const { deps, calls, yueqi, shenjiu } = makeDeps({
        getDialogues: () => ({
          dream: {
            lowAffection: {},
            highAffection: {},
            linked: { shenjiu: ['linked-shenjiu-line'], yueqi_reply: ['linked-yueqi-reply'] },
          },
        }),
      });
      yueqi.timePhase = 'night';
      const system = new AmbientDialogueSystem(deps);

      system.showNightDream(shenjiu);

      assert.deepEqual(calls.show, [{ pet: 'shenjiu', text: 'linked-shenjiu-line', duration: 5000 }]);
      assert.equal(scheduled.length, 1);
      assert.equal(scheduled[0].ms, 2500);

      scheduled[0].cb();
      assert.deepEqual(calls.show, [
        { pet: 'shenjiu', text: 'linked-shenjiu-line', duration: 5000 },
        { pet: 'yueqi', text: 'linked-yueqi-reply', duration: 4000 },
      ]);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });
});
