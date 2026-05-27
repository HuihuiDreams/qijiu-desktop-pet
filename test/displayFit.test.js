const assert = require('node:assert/strict');
const test = require('node:test');

const {
  areWindowBoundsEqual,
  createDisplayFitScheduler,
  getResizeBridgeConstraints,
} = require('../displayFit');

test('window bounds equality compares only geometry values', () => {
  assert.equal(
    areWindowBoundsEqual(
      { x: 0, y: -120, width: 3200, height: 1200 },
      { x: 0, y: -120, width: 3200, height: 1200 },
    ),
    true,
  );

  assert.equal(
    areWindowBoundsEqual(
      { x: 0, y: -120, width: 3200, height: 1200 },
      { x: 0, y: -120, width: 3200, height: 1199 },
    ),
    false,
  );
});

test('resize bridge constraints include both current and target window sizes', () => {
  assert.deepEqual(
    getResizeBridgeConstraints(
      { width: 3640, height: 1920 },
      { width: 2560, height: 1440 },
    ),
    {
      minWidth: 2560,
      minHeight: 1440,
      maxWidth: 3640,
      maxHeight: 1920,
    },
  );

  assert.deepEqual(
    getResizeBridgeConstraints(
      { width: 1920, height: 1080 },
      { width: 3640, height: 1920 },
    ),
    {
      minWidth: 1920,
      minHeight: 1080,
      maxWidth: 3640,
      maxHeight: 1920,
    },
  );
});

test('display fit scheduler coalesces rapid display change events', () => {
  let fitCount = 0;
  const timers = [];
  const cleared = [];
  const scheduler = createDisplayFitScheduler({
    delayMs: 250,
    fitNow: () => {
      fitCount += 1;
    },
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => {
      cleared.push(timer);
    },
  });

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();

  assert.equal(timers.length, 3);
  assert.deepEqual(cleared, [timers[0], timers[1]]);
  assert.equal(scheduler.isPending(), true);

  timers[2].callback();

  assert.equal(fitCount, 1);
  assert.equal(scheduler.isPending(), false);
});
