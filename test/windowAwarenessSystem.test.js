const assert = require('node:assert/strict');
const test = require('node:test');

const { WindowAwarenessSystem } = require('../src/systems/WindowAwarenessSystem');

function activeInfo(sampledAt = 1000) {
  return {
    active: true,
    sampledAt,
    source: 'active-window',
    window: {
      id: '1',
      title: 'Code',
      ownerName: 'Code',
      bounds: { x: 100, y: 100, width: 800, height: 600 },
      isMinimized: false,
      isMaximized: false,
      isFullScreen: false,
    },
    platform: { x: 100, y: 76, width: 800, height: 48, source: 'active-window-top' },
  };
}

test('WindowAwarenessSystem returns the latest active platform before TTL expires', () => {
  const system = new WindowAwarenessSystem(null, { ttlMs: 2500, now: () => 1000 });
  system.setActiveWindowInfo(activeInfo(1000));

  assert.deepEqual(system.getCurrentPlatform(2000), {
    x: 100,
    y: 76,
    width: 800,
    height: 48,
    source: 'active-window-top',
  });
});

test('WindowAwarenessSystem returns null for stale or unavailable data', () => {
  const system = new WindowAwarenessSystem(null, { ttlMs: 2500 });
  system.setActiveWindowInfo(activeInfo(1000));

  assert.equal(system.getCurrentPlatform(4000), null);

  system.setActiveWindowInfo({
    active: false,
    sampledAt: 4000,
    source: 'unavailable',
    reason: 'unsupported-platform',
    window: null,
    platform: null,
  });

  assert.equal(system.getCurrentPlatform(4001), null);
});

test('WindowAwarenessSystem subscribes to push updates and requests an initial value', async () => {
  let listener = null;
  let removed = false;
  const system = new WindowAwarenessSystem({
    onActiveWindowInfo(callback) {
      listener = callback;
      return () => {
        removed = true;
      };
    },
    async getActiveWindowInfo() {
      return activeInfo(1000);
    },
  }, { ttlMs: 2500, now: () => 1000 });

  system.start();
  await Promise.resolve();
  assert.equal(system.getCurrentPlatform(1001).x, 100);

  listener(activeInfo(2000));
  assert.equal(system.getCurrentPlatform(2001).y, 76);

  system.stop();
  assert.equal(removed, true);
});
